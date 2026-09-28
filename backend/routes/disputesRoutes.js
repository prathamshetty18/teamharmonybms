/**
 * Disputes Routes — Phase D
 *
 * Legal dispute tracking — SEPARATE from the overlap-triggered on-chain "Disputed" status.
 *
 * The on-chain Disputed status is set automatically by the geospatial overlap engine when
 * a new parcel claim physically overlaps an existing one. That lives in claimsRoutes.js.
 *
 * This module tracks legal disputes that may arise independently: inheritance contests,
 * fraudulent ownership claims, boundary disagreements without physical overlap, encroachment,
 * or any other legal proceedings tied to one or more parcels.
 *
 * Data model:
 *   disputeId      — auto-generated
 *   type           — 'BOUNDARY' | 'OWNERSHIP' | 'INHERITANCE' | 'FRAUD' | 'ENCROACHMENT' | 'OTHER'
 *   parties        — [{ name, role, claimId?, contactInfo }]  — at least 2
 *   relatedClaims  — [claimId, ...]  — parcels involved
 *   status         — 'FILED' | 'UNDER_REVIEW' | 'MEDIATION' | 'ARBITRATION' | 'COURT' | 'RESOLVED' | 'DISMISSED'
 *   description    — human narrative
 *   filedBy        — who filed (name + role)
 *   assignedOfficer — government officer assigned to this case
 *   evidence       — [{ type, description, hash, submittedBy }]
 *   hearings       — [{date, venue, notes, attendees}]
 *   resolution     — { outcome, date, notes, orderId }  (populated on resolve)
 *   priority       — 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
 *   filedAt, updatedAt
 *
 * Status flow:
 *   FILED → UNDER_REVIEW → MEDIATION|ARBITRATION|COURT → RESOLVED|DISMISSED
 *   (Status cannot go backwards)
 *
 * Endpoints:
 *   POST /disputes              — file a new dispute
 *   GET  /disputes              — list disputes (filterable by status/type/claimId/party)
 *   GET  /disputes/:id          — single dispute
 *   PATCH /disputes/:id/status  — advance status (role-gated)
 *   POST /disputes/:id/evidence — add evidence item
 *   POST /disputes/:id/hearing  — add hearing record
 *   POST /disputes/:id/resolve  — resolve or dismiss
 *   GET  /disputes/for-parcel/:claimId — all disputes involving a parcel
 */

'use strict';

const express = require('express');
const store = require('../store');
const { ROLES, requireRole, optionalAuth } = require('../auth');

const DISPUTE_TYPES = ['BOUNDARY', 'OWNERSHIP', 'INHERITANCE', 'FRAUD', 'ENCROACHMENT', 'OTHER'];
const DISPUTE_STATUSES = ['FILED', 'UNDER_REVIEW', 'MEDIATION', 'ARBITRATION', 'COURT', 'RESOLVED', 'DISMISSED'];
const TERMINAL_STATUSES = ['RESOLVED', 'DISMISSED'];
const PRIORITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// Status must only advance, never regress
const STATUS_ORDER = Object.fromEntries(DISPUTE_STATUSES.map((s, i) => [s, i]));
function isValidTransition(from, to) {
  if (TERMINAL_STATUSES.includes(from)) return false; // already terminal
  // RESOLVED and DISMISSED are only reachable via the /resolve endpoint
  if (TERMINAL_STATUSES.includes(to)) return false;
  return STATUS_ORDER[to] > STATUS_ORDER[from];
}

module.exports = function createDisputesRoutes() {
  const router = express.Router();

  // ---------------------------------------------------------------
  // POST /disputes — file a new dispute
  // ---------------------------------------------------------------
  router.post('/disputes', requireRole(
    ROLES.FARMER, ROLES.GROUND_VERIFICATION_OFFICER, ROLES.NGO_COMMUNITY_VERIFIER, ROLES.GOVERNMENT_OFFICER
  ), async (req, res, next) => {
    try {
      const {
        type,
        parties = [],
        relatedClaims = [],
        description,
        assignedOfficer = null,
        priority = 'MEDIUM',
        evidence = []
      } = req.body || {};

      // Validation
      const missing = [];
      if (!type) missing.push('type');
      if (!description) missing.push('description');
      if (parties.length < 2) missing.push('parties (minimum 2 parties required)');
      if (missing.length) {
        return res.status(400).json({ error: `Missing or invalid fields: ${missing.join(', ')}` });
      }

      if (!DISPUTE_TYPES.includes(type.toUpperCase())) {
        return res.status(400).json({
          error: `Invalid dispute type '${type}'. Valid types: ${DISPUTE_TYPES.join(', ')}`
        });
      }

      if (!PRIORITY_LEVELS.includes(priority.toUpperCase())) {
        return res.status(400).json({
          error: `Invalid priority '${priority}'. Valid: ${PRIORITY_LEVELS.join(', ')}`
        });
      }

      // Validate relatedClaims exist
      const invalidClaims = [];
      for (const cId of relatedClaims) {
        const c = await store.claims.getById(String(cId));
        if (!c) invalidClaims.push(cId);
      }
      if (invalidClaims.length) {
        return res.status(400).json({ error: `Unknown claimId(s): ${invalidClaims.join(', ')}` });
      }

      const disputeId = `dispute_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const filedBy = req.user ? `${req.user.name} (${req.user.role})` : 'Unknown Filer';
      const now = new Date().toISOString();

      const record = {
        disputeId,
        type: type.toUpperCase(),
        status: 'FILED',
        priority: priority.toUpperCase(),
        parties,
        relatedClaims: relatedClaims.map(String),
        description,
        filedBy,
        assignedOfficer,
        evidence: evidence.map((e, i) => ({
          evidenceId: `ev_${i + 1}`,
          type: e.type || 'document',
          description: e.description || '',
          hash: e.hash || null,
          submittedBy: filedBy,
          submittedAt: now
        })),
        hearings: [],
        resolution: null,
        statusHistory: [{ from: null, to: 'FILED', by: filedBy, at: now, notes: 'Dispute filed' }],
        filedAt: now
      };

      const saved = await store.disputes.save(record);

      // Write audit log on each related claim
      for (const cId of relatedClaims) {
        await store.recordAuditLog({
          who: filedBy,
          what: 'LEGAL_DISPUTE_FILED',
          landId: cId,
          prevValue: 'No Dispute',
          newValue: `Dispute #${disputeId} (${type.toUpperCase()}) — ${priority.toUpperCase()} priority`,
          remarks: description,
          metadata: { disputeId, type, priority, parties: parties.map(p => p.name) }
        });
      }

      res.status(201).json({
        message: 'Dispute filed successfully',
        dispute: saved
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /disputes — list disputes with filters
  // Query: status, type, claimId, priority, assignedOfficer, party (name search)
  // ---------------------------------------------------------------
  router.get('/disputes', optionalAuth, async (req, res, next) => {
    try {
      let all = await store.disputes.getAll();
      const { status, type, claimId, priority, party } = req.query;

      if (status) all = all.filter(d => d.status === status.toUpperCase());
      if (type) all = all.filter(d => d.type === type.toUpperCase());
      if (priority) all = all.filter(d => d.priority === priority.toUpperCase());
      if (claimId) all = all.filter(d => d.relatedClaims && d.relatedClaims.includes(String(claimId)));
      if (party) all = all.filter(d => d.parties && d.parties.some(p =>
        (p.name || '').toLowerCase().includes(party.toLowerCase())
      ));

      // Sort: URGENT+FILED first, then by recency
      const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const statusOrder = { FILED: 0, UNDER_REVIEW: 1, MEDIATION: 2, ARBITRATION: 2, COURT: 2, RESOLVED: 3, DISMISSED: 4 };
      all.sort((a, b) => {
        const pDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
        if (pDiff !== 0) return pDiff;
        const sDiff = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
        if (sDiff !== 0) return sDiff;
        return new Date(b.filedAt || 0) - new Date(a.filedAt || 0);
      });

      res.json({ count: all.length, disputes: all });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /disputes/for-parcel/:claimId — all disputes for a parcel
  // ---------------------------------------------------------------
  router.get('/disputes/for-parcel/:claimId', optionalAuth, async (req, res, next) => {
    try {
      const claim = await store.claims.getById(req.params.claimId);
      if (!claim) {
        return res.status(404).json({ error: `Parcel '${req.params.claimId}' not found` });
      }

      const all = await store.disputes.getAll();
      const parcelDisputes = all.filter(d =>
        d.relatedClaims && d.relatedClaims.includes(String(req.params.claimId))
      );

      res.json({
        claimId: req.params.claimId,
        landId: claim.landId || claim.claimId,
        ownerName: claim.ownerName,
        openDisputes: parcelDisputes.filter(d => !TERMINAL_STATUSES.includes(d.status)).length,
        totalDisputes: parcelDisputes.length,
        disputes: parcelDisputes
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /disputes/:id — single dispute
  // ---------------------------------------------------------------
  router.get('/disputes/:id', optionalAuth, async (req, res, next) => {
    try {
      const d = await store.disputes.getById(req.params.id);
      if (!d) {
        return res.status(404).json({ error: `Dispute '${req.params.id}' not found` });
      }
      res.json(d);
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // PATCH /disputes/:id/status — advance status
  // Body: { status, notes }
  // ---------------------------------------------------------------
  router.patch('/disputes/:id/status',
    requireRole(ROLES.GOVERNMENT_OFFICER, ROLES.GROUND_VERIFICATION_OFFICER),
    async (req, res, next) => {
      try {
        const d = await store.disputes.getById(req.params.id);
        if (!d) {
          return res.status(404).json({ error: `Dispute '${req.params.id}' not found` });
        }

        const { status, notes = '' } = req.body || {};
        if (!status) {
          return res.status(400).json({ error: 'Missing required field: status' });
        }

        const newStatus = status.toUpperCase();
        if (!DISPUTE_STATUSES.includes(newStatus)) {
          return res.status(400).json({ error: `Invalid status '${status}'. Valid: ${DISPUTE_STATUSES.join(', ')}` });
        }

        if (TERMINAL_STATUSES.includes(d.status)) {
          return res.status(400).json({ error: `Dispute is already ${d.status}. Use /resolve to update resolution details.` });
        }

        if (TERMINAL_STATUSES.includes(newStatus)) {
          return res.status(400).json({ error: `Use POST /disputes/:id/resolve to mark as ${newStatus}` });
        }

        if (!isValidTransition(d.status, newStatus)) {
          return res.status(400).json({
            error: `Cannot transition from '${d.status}' to '${newStatus}'. Status must advance forward.`
          });
        }

        const who = req.user ? `${req.user.name} (${req.user.role})` : 'Officer';
        const now = new Date().toISOString();
        const newHistory = [...(d.statusHistory || []), { from: d.status, to: newStatus, by: who, at: now, notes }];

        const updated = await store.disputes.update(req.params.id, {
          status: newStatus,
          statusHistory: newHistory,
          ...(req.body.assignedOfficer ? { assignedOfficer: req.body.assignedOfficer } : {})
        });

        for (const cId of (d.relatedClaims || [])) {
          await store.recordAuditLog({
            who,
            what: 'DISPUTE_STATUS_CHANGED',
            landId: cId,
            prevValue: d.status,
            newValue: newStatus,
            remarks: notes || `Dispute #${d.disputeId} advanced to ${newStatus}`,
            metadata: { disputeId: d.disputeId }
          });
        }

        res.json({ message: 'Dispute status updated', dispute: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------
  // POST /disputes/:id/evidence — add an evidence item
  // Body: { type, description, hash?, submittedBy? }
  // ---------------------------------------------------------------
  router.post('/disputes/:id/evidence', requireRole(
    ROLES.FARMER, ROLES.GROUND_VERIFICATION_OFFICER, ROLES.NGO_COMMUNITY_VERIFIER, ROLES.GOVERNMENT_OFFICER
  ), async (req, res, next) => {
    try {
      const d = await store.disputes.getById(req.params.id);
      if (!d) {
        return res.status(404).json({ error: `Dispute '${req.params.id}' not found` });
      }

      if (TERMINAL_STATUSES.includes(d.status)) {
        return res.status(400).json({ error: `Cannot add evidence to a ${d.status} dispute` });
      }

      const { type = 'document', description, hash = null } = req.body || {};
      if (!description) {
        return res.status(400).json({ error: 'Missing required field: description' });
      }

      const submittedBy = req.user ? `${req.user.name} (${req.user.role})` : 'Unknown';
      const newEvidence = {
        evidenceId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        type,
        description,
        hash,
        submittedBy,
        submittedAt: new Date().toISOString()
      };

      const updatedEvidence = [...(d.evidence || []), newEvidence];
      const updated = await store.disputes.update(req.params.id, { evidence: updatedEvidence });

      res.status(201).json({ message: 'Evidence added', evidenceId: newEvidence.evidenceId, dispute: updated });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /disputes/:id/hearing — add a hearing record
  // Body: { date, venue, notes, attendees: [] }
  // ---------------------------------------------------------------
  router.post('/disputes/:id/hearing', requireRole(
    ROLES.GOVERNMENT_OFFICER, ROLES.GROUND_VERIFICATION_OFFICER
  ), async (req, res, next) => {
    try {
      const d = await store.disputes.getById(req.params.id);
      if (!d) {
        return res.status(404).json({ error: `Dispute '${req.params.id}' not found` });
      }

      if (TERMINAL_STATUSES.includes(d.status)) {
        return res.status(400).json({ error: `Cannot add hearing to a ${d.status} dispute` });
      }

      const { date, venue = '', notes = '', attendees = [] } = req.body || {};
      if (!date) {
        return res.status(400).json({ error: 'Missing required field: date' });
      }

      const hearing = {
        hearingId: `hrg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        date,
        venue,
        notes,
        attendees,
        recordedBy: req.user ? `${req.user.name} (${req.user.role})` : 'Officer',
        recordedAt: new Date().toISOString()
      };

      const updatedHearings = [...(d.hearings || []), hearing];
      const updated = await store.disputes.update(req.params.id, { hearings: updatedHearings });

      res.status(201).json({ message: 'Hearing record added', hearingId: hearing.hearingId, dispute: updated });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /disputes/:id/resolve — resolve or dismiss a dispute
  // Body: { outcome: 'RESOLVED'|'DISMISSED', notes, orderId? }
  // ---------------------------------------------------------------
  router.post('/disputes/:id/resolve',
    requireRole(ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const d = await store.disputes.getById(req.params.id);
        if (!d) {
          return res.status(404).json({ error: `Dispute '${req.params.id}' not found` });
        }

        if (TERMINAL_STATUSES.includes(d.status)) {
          return res.status(400).json({ error: `Dispute is already ${d.status}` });
        }

        const { outcome, notes = '', orderId = null } = req.body || {};
        if (!outcome || !['RESOLVED', 'DISMISSED'].includes(outcome.toUpperCase())) {
          return res.status(400).json({ error: "Required field: outcome ('RESOLVED' or 'DISMISSED')" });
        }

        const who = req.user ? `${req.user.name} (${req.user.role})` : 'Government Officer';
        const now = new Date().toISOString();
        const finalStatus = outcome.toUpperCase();

        const resolution = { outcome: finalStatus, notes, orderId, resolvedBy: who, date: now };
        const newHistory = [...(d.statusHistory || []), { from: d.status, to: finalStatus, by: who, at: now, notes }];

        const updated = await store.disputes.update(req.params.id, {
          status: finalStatus,
          resolution,
          statusHistory: newHistory,
          resolvedAt: now
        });

        for (const cId of (d.relatedClaims || [])) {
          await store.recordAuditLog({
            who,
            what: `DISPUTE_${finalStatus}`,
            landId: cId,
            prevValue: d.status,
            newValue: finalStatus,
            remarks: notes || `Dispute #${d.disputeId} ${finalStatus.toLowerCase()} by ${who}`,
            metadata: { disputeId: d.disputeId, orderId, outcome: finalStatus }
          });
        }

        res.json({ message: `Dispute ${finalStatus.toLowerCase()} successfully`, dispute: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
};
