const express = require('express');
const store = require('../store');
const { ROLES, optionalAuth } = require('../auth');

/**
 * Phase D — Dashboard & Reporting Routes
 *
 * GET  /dashboard/summary        — System-wide KPI counts for the Gov Dashboard header
 * GET  /dashboard/map            — All parcel markers (claimId, status, coordinates) for Leaflet
 * GET  /dashboard/activity       — Recent audit-log activity feed (last N entries)
 * GET  /dashboard/relief/:id     — Per-relief budget stats (used, remaining, counts)
 * GET  /reliefs/:id/stats        — Alias for /dashboard/relief/:id (design spec §7)
 * GET  /claims/search            — Full-featured parcel search & filter with pagination
 * GET  /dashboard/roles          — Role definitions for dashboard UI rendering
 */
module.exports = function createDashboardRoutes() {
  const router = express.Router();

  // ---------------------------------------------------------------
  // 1. GET /dashboard/summary
  // Returns system-wide KPI snapshot for Gov Dashboard header cards.
  // No auth required — read-only aggregate, no PII.
  // ---------------------------------------------------------------
  router.get('/dashboard/summary', optionalAuth, async (req, res, next) => {
    try {
      const [allClaims, allReliefs, allPayouts, allAuditLogs] = await Promise.all([
        store.claims.getAll(),
        store.reliefs.getAll(),
        store.payouts.getAll(),
        store.auditLogs.getAll()
      ]);

      // Status breakdowns
      const statusCounts = { Pending: 0, Verified: 0, Disputed: 0, Unknown: 0 };
      const workflowCounts = {};
      let totalAreaAcres = 0;

      for (const c of allClaims) {
        const s = c.status || 'Unknown';
        if (statusCounts[s] !== undefined) statusCounts[s]++;
        else statusCounts.Unknown++;

        const wf = c.workflowStatus || c.verificationStatus || 'Unknown';
        workflowCounts[wf] = (workflowCounts[wf] || 0) + 1;
        totalAreaAcres += Number(c.parcelAreaAcres || c.confirmedAreaAcres || 0);
      }

      // Payout breakdowns
      const payoutCounts = { Assessed: 0, Approved: 0, Paid: 0 };
      let totalDisbursedWei = BigInt(0);
      for (const p of allPayouts) {
        const ps = p.status || '';
        if (payoutCounts[ps] !== undefined) payoutCounts[ps]++;
        if (ps === 'Paid') {
          try { totalDisbursedWei += BigInt(p.amount || '0'); } catch (_) { /* skip */ }
        }
      }

      // Relief budget totals
      let totalBudgetWei = BigInt(0);
      let totalRemainingWei = BigInt(0);
      for (const r of allReliefs) {
        try { totalBudgetWei += BigInt(r.budget || '0'); } catch (_) { /* skip */ }
        try { totalRemainingWei += BigInt(r.remainingBudget || r.budget || '0'); } catch (_) { /* skip */ }
      }

      // Audit activity: today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const activityToday = allAuditLogs.filter(a => new Date(a.when) >= todayStart).length;

      res.json({
        generatedAt: new Date().toISOString(),
        parcels: {
          total: allClaims.length,
          byStatus: statusCounts,
          byWorkflow: workflowCounts,
          totalAreaAcres: Number(totalAreaAcres.toFixed(2))
        },
        reliefs: {
          total: allReliefs.length,
          totalBudgetWei: totalBudgetWei.toString(),
          totalRemainingWei: totalRemainingWei.toString(),
          totalSpentWei: (totalBudgetWei - totalRemainingWei).toString()
        },
        payouts: {
          ...payoutCounts,
          totalDisbursedWei: totalDisbursedWei.toString()
        },
        auditActivity: {
          total: allAuditLogs.length,
          today: activityToday
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 2. GET /dashboard/map
  // Returns all parcel markers for Leaflet map rendering.
  // Shape: [{ claimId, landId, ownerName, status, lat, lon, polygon }]
  // No PII: ownerName is display label; nationalId and hashes are excluded.
  // ---------------------------------------------------------------
  router.get('/dashboard/map', optionalAuth, async (req, res, next) => {
    try {
      const allClaims = await store.claims.getAll();

      const markers = allClaims.map(c => ({
        claimId: c.claimId || c.landId,
        landId: c.landId || c.claimId,
        ownerName: c.ownerName || 'Unknown',
        status: c.status || 'Pending',
        workflowStatus: c.workflowStatus || c.verificationStatus || 'Submitted',
        score: c.score || 0,
        lat: c.latE6 != null ? c.latE6 / 1e6 : (c.referencePoint ? c.referencePoint[1] : 12.9415),
        lon: c.lonE6 != null ? c.lonE6 / 1e6 : (c.referencePoint ? c.referencePoint[0] : 77.5620),
        referencePoint: c.referencePoint || null,
        polygon: c.polygon || null,
        parcelAreaAcres: Number(c.parcelAreaAcres || c.confirmedAreaAcres || 0),
        surveyNumber: c.surveyNumber || '',
        village: c.village || '',
        district: c.district || '',
        hasDispute: !!(c.dispute && c.dispute.isDisputed),
        createdAt: c.createdAt
      }));

      res.json({ count: markers.length, markers });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 3. GET /dashboard/activity
  // Returns recent audit log entries as an activity feed.
  // Query params: limit (default 20, max 100), landId, what
  // ---------------------------------------------------------------
  router.get('/dashboard/activity', optionalAuth, async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const { landId, what } = req.query;

      let logs = await store.auditLogs.getAll();

      if (landId) {
        const id = String(landId);
        logs = logs.filter(a => String(a.landId) === id || String(a.claimId) === id);
      }
      if (what) {
        const w = what.toLowerCase();
        logs = logs.filter(a => a.what && a.what.toLowerCase().includes(w));
      }

      // Newest first
      logs.sort((a, b) => new Date(b.when) - new Date(a.when));
      const feed = logs.slice(0, limit);

      res.json({ count: feed.length, total: logs.length, feed });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 4. Relief stats helper (shared by two route aliases)
  // ---------------------------------------------------------------
  async function getReliefStats(reliefId, res, next) {
    try {
      const relief = await store.reliefs.getById(reliefId);
      if (!relief) {
        return res.status(404).json({ error: `Relief event '${reliefId}' not found` });
      }

      const allPayouts = await store.payouts.getAll();
      const linked = allPayouts.filter(p =>
        p.reliefId === reliefId || p.reliefId === relief.reliefId
      );

      const payoutStats = { Assessed: 0, Approved: 0, Paid: 0 };
      let disbursedWei = BigInt(0);
      for (const p of linked) {
        if (payoutStats[p.status] !== undefined) payoutStats[p.status]++;
        if (p.status === 'Paid') {
          try { disbursedWei += BigInt(p.amount || '0'); } catch (_) { /* skip */ }
        }
      }

      let budgetWei = BigInt(0);
      let remainingWei = BigInt(0);
      try { budgetWei = BigInt(relief.budget || '0'); } catch (_) { /* skip */ }
      try { remainingWei = BigInt(relief.remainingBudget || relief.budget || '0'); } catch (_) { /* skip */ }

      const spentWei = disbursedWei <= budgetWei ? disbursedWei : budgetWei;
      const utilizationPct = budgetWei > 0n
        ? Number((spentWei * 10000n / budgetWei)) / 100
        : 0;

      res.json({
        reliefId: relief.reliefId,
        name: relief.name || relief.reliefId,
        disasterType: relief.disasterType || 'flood',
        budget: {
          totalWei: budgetWei.toString(),
          remainingWei: remainingWei.toString(),
          spentWei: spentWei.toString(),
          utilizationPct: Number(utilizationPct.toFixed(2))
        },
        payouts: {
          ...payoutStats,
          total: linked.length,
          disbursedWei: disbursedWei.toString()
        },
        ratePerAcre: relief.ratePerAcre || '0',
        maxPerClaim: relief.maxPerClaim || '0',
        createdAt: relief.createdAt
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /dashboard/relief/:id
  router.get('/dashboard/relief/:id', optionalAuth, (req, res, next) =>
    getReliefStats(req.params.id, res, next)
  );

  // GET /reliefs/:id/stats — alias (design spec §7)
  router.get('/reliefs/:id/stats', optionalAuth, (req, res, next) =>
    getReliefStats(req.params.id, res, next)
  );

  // ---------------------------------------------------------------
  // 5. GET /claims/search  (advanced search & filter with pagination)
  //
  // Query params:
  //   q                  — free-text across ownerName, surveyNumber, village, notes, claimId
  //   status             — Pending | Verified | Disputed
  //   workflowStatus     — workflow phase name (partial match)
  //   verificationStatus — spec status (APPROVED, GROUND_VERIFICATION, …) exact
  //   district           — partial match
  //   taluk              — partial match
  //   village            — partial match
  //   state              — partial match
  //   landUse            — partial match on farmerDeclared or finalApproved
  //   from               — ISO date lower bound (createdAt)
  //   to                 — ISO date upper bound (createdAt)
  //   hasDispute         — "true" | "false"
  //   minScore           — min attestation score (number)
  //   maxScore           — max attestation score (number)
  //   page               — 1-indexed page (default 1)
  //   limit              — page size (default 20, max 100)
  //   sort               — createdAt | score | parcelAreaAcres | ownerName | updatedAt
  //   order              — asc | desc
  // ---------------------------------------------------------------
  router.get(['/claims/search', '/parcels/search'], optionalAuth, async (req, res, next) => {
    try {
      let all = await store.claims.getAll();

      const {
        q,
        status,
        workflowStatus,
        verificationStatus,
        district,
        taluk,
        village,
        state,
        landUse,
        from,
        to,
        hasDispute,
        minScore,
        maxScore,
        page = '1',
        limit: rawLimit = '20',
        sort = 'createdAt',
        order = 'desc'
      } = req.query;

      // Free text search
      if (q && q.trim()) {
        const ql = q.trim().toLowerCase();
        all = all.filter(c =>
          (c.ownerName && c.ownerName.toLowerCase().includes(ql)) ||
          (c.surveyNumber && c.surveyNumber.toLowerCase().includes(ql)) ||
          (c.plotNumber && c.plotNumber.toLowerCase().includes(ql)) ||
          (c.village && c.village.toLowerCase().includes(ql)) ||
          (c.district && c.district.toLowerCase().includes(ql)) ||
          (c.claimId && String(c.claimId).includes(ql)) ||
          (c.landId && String(c.landId).includes(ql)) ||
          (c.notes && c.notes.toLowerCase().includes(ql))
        );
      }

      if (status) {
        const sl = status.toLowerCase();
        all = all.filter(c => (c.status || '').toLowerCase() === sl);
      }
      if (workflowStatus) {
        const wl = workflowStatus.toLowerCase();
        all = all.filter(c => (c.workflowStatus || '').toLowerCase().includes(wl));
      }
      if (verificationStatus) {
        const vl = verificationStatus.toUpperCase();
        all = all.filter(c =>
          (c.verificationStatus || '').toUpperCase() === vl ||
          store.normalizeSpecStatus(c.verificationStatus || '') === vl
        );
      }

      if (district) {
        const dl = district.toLowerCase();
        all = all.filter(c => c.district && c.district.toLowerCase().includes(dl));
      }
      if (taluk) {
        const tl = taluk.toLowerCase();
        all = all.filter(c => c.taluk && c.taluk.toLowerCase().includes(tl));
      }
      if (village) {
        const vl = village.toLowerCase();
        all = all.filter(c => c.village && c.village.toLowerCase().includes(vl));
      }
      if (state) {
        const sl = state.toLowerCase();
        all = all.filter(c => c.state && c.state.toLowerCase().includes(sl));
      }
      if (landUse) {
        const ll = landUse.toLowerCase();
        all = all.filter(c =>
          (c.landUseFarmerDeclared && c.landUseFarmerDeclared.toLowerCase().includes(ll)) ||
          (c.landUseFinalApproved && c.landUseFinalApproved.toLowerCase().includes(ll))
        );
      }

      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate)) all = all.filter(c => c.createdAt && new Date(c.createdAt) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) all = all.filter(c => c.createdAt && new Date(c.createdAt) <= toDate);
      }

      if (hasDispute !== undefined) {
        const disputed = hasDispute === 'true';
        all = all.filter(c => !!(c.dispute && c.dispute.isDisputed) === disputed);
      }
      if (minScore !== undefined) {
        const min = Number(minScore);
        if (!isNaN(min)) all = all.filter(c => (c.score || 0) >= min);
      }
      if (maxScore !== undefined) {
        const max = Number(maxScore);
        if (!isNaN(max)) all = all.filter(c => (c.score || 0) <= max);
      }

      // Sort
      const VALID_SORTS = ['createdAt', 'score', 'parcelAreaAcres', 'ownerName', 'updatedAt'];
      const sortKey = VALID_SORTS.includes(sort) ? sort : 'createdAt';
      const sortDir = order === 'asc' ? 1 : -1;
      all.sort((a, b) => {
        const va = a[sortKey] != null ? a[sortKey] : '';
        const vb = b[sortKey] != null ? b[sortKey] : '';
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
        return String(va).localeCompare(String(vb)) * sortDir;
      });

      // Pagination
      const pageNum = Math.max(parseInt(page) || 1, 1);
      const limitNum = Math.min(parseInt(rawLimit) || 20, 100);
      const totalCount = all.length;
      const totalPages = Math.ceil(totalCount / limitNum) || 1;
      const paged = all.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      const enriched = paged.map(c => {
        const acres = Number(c.parcelAreaAcres || c.confirmedAreaAcres || 0);
        return {
          ...c,
          landId: c.landId || c.claimId,
          area: store.formatAreaUnits(acres),
          hasDispute: !!(c.dispute && c.dispute.isDisputed)
        };
      });

      res.json({
        query: { q, status, workflowStatus, verificationStatus, district, taluk, village, state, landUse, from, to, hasDispute, minScore, maxScore, sort: sortKey, order },
        pagination: { page: pageNum, limit: limitNum, total: totalCount, totalPages, hasNext: pageNum < totalPages, hasPrev: pageNum > 1 },
        results: enriched
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 6. GET /dashboard/roles — role registry for UI rendering
  // ---------------------------------------------------------------
  router.get('/dashboard/roles', (req, res) => {
    res.json({
      roles: [
        { id: 'FARMER', label: 'Farmer / Land Owner', color: '#10b981' },
        { id: 'GROUND_VERIFICATION_OFFICER', label: 'Ground Verification Officer', color: '#3b82f6' },
        { id: 'NGO_COMMUNITY_VERIFIER', label: 'NGO / Community Verifier', color: '#8b5cf6' },
        { id: 'GOVERNMENT_OFFICER', label: 'Government Officer', color: '#f59e0b' }
      ]
    });
  });

  return router;
};
