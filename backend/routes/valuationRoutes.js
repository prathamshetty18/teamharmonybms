/**
 * Valuation Routes — Phase D
 *
 * Records and queries land valuation rates for government reference and estimated market values.
 * Used by the relief module to compute compensation amounts and by the dashboard for land value context.
 *
 * Data model per valuation record:
 *   valuationId         — auto-generated
 *   state               — e.g. 'Karnataka'
 *   district            — e.g. 'Bangalore South'
 *   taluk               — e.g. 'Bangalore South'
 *   village             — e.g. 'Basavanagudi'
 *   landType            — must match LAND_USE_TYPES vocabulary
 *   unit                — 'acre' | 'hectare' | 'sqm'
 *   govtReferenceRate   — official govt guidance value (wei string or plain number string per unit)
 *   estimatedMarketRate — current estimated open-market rate
 *   currency            — 'MST' | 'INR' (default: 'INR')
 *   effectiveDate       — ISO date string
 *   expiryDate          — optional ISO date string
 *   source              — e.g. 'Karnataka Revenue Dept 2026', 'Survey Officer Assessment'
 *   notes               — optional
 *   createdBy           — officer name/role
 *
 * Endpoints:
 *   POST /valuation              — create a new valuation record
 *   GET  /valuation              — list all (with optional filters)
 *   GET  /valuation/:id          — get single record
 *   PATCH /valuation/:id         — update a record
 *   GET  /valuation/lookup       — query by location + landType (returns best match)
 *   GET  /valuation/for-parcel/:claimId — auto-lookup valuation for an existing parcel
 */

'use strict';

const express = require('express');
const store = require('../store');
const { ROLES, requireRole, optionalAuth } = require('../auth');

const LAND_USE_TYPES = [
  'Agricultural', 'Wet Agricultural', 'Dry Agricultural', 'Horticulture',
  'Plantation', 'Residential', 'Commercial', 'Industrial', 'Forest',
  'Wasteland', 'Government Land', 'Mixed Use', 'Other'
];
const VALID_UNITS = ['acre', 'hectare', 'sqm'];
const VALID_CURRENCIES = ['INR', 'MST', 'USD'];

// Convert any rate to per-acre for comparison/computation
function toPerAcre(rate, unit) {
  const r = Number(rate) || 0;
  if (unit === 'hectare') return r / 2.47105;
  if (unit === 'sqm') return r * 4046.86;
  return r; // acre
}

module.exports = function createValuationRoutes() {
  const router = express.Router();

  // ---------------------------------------------------------------
  // POST /valuation — create new valuation record
  // ---------------------------------------------------------------
  router.post(
    '/valuation',
    requireRole(ROLES.GOVERNMENT_OFFICER, ROLES.GROUND_VERIFICATION_OFFICER),
    async (req, res, next) => {
      try {
        const {
          state,
          district,
          taluk,
          village,
          landType,
          unit = 'acre',
          govtReferenceRate,
          estimatedMarketRate,
          currency = 'INR',
          effectiveDate,
          expiryDate = null,
          source,
          notes = ''
        } = req.body || {};

        // Validation
        const missing = [];
        if (!state) missing.push('state');
        if (!district) missing.push('district');
        if (!landType) missing.push('landType');
        if (!govtReferenceRate) missing.push('govtReferenceRate');
        if (!effectiveDate) missing.push('effectiveDate');
        if (!source) missing.push('source');
        if (missing.length) {
          return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
        }

        if (!VALID_UNITS.includes(unit)) {
          return res.status(400).json({ error: `Invalid unit '${unit}'. Must be one of: ${VALID_UNITS.join(', ')}` });
        }

        if (!VALID_CURRENCIES.includes(currency)) {
          return res.status(400).json({ error: `Invalid currency '${currency}'. Must be one of: ${VALID_CURRENCIES.join(', ')}` });
        }

        const valuationId = `val_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const createdBy = req.user ? `${req.user.name} (${req.user.role})` : 'Government Officer';

        const record = {
          valuationId,
          state: state.trim(),
          district: district.trim(),
          taluk: (taluk || '').trim(),
          village: (village || '').trim(),
          landType: landType.trim(),
          unit,
          currency,
          govtReferenceRate: String(govtReferenceRate),
          estimatedMarketRate: estimatedMarketRate != null ? String(estimatedMarketRate) : null,
          govtReferenceRatePerAcre: toPerAcre(govtReferenceRate, unit),
          estimatedMarketRatePerAcre: estimatedMarketRate != null ? toPerAcre(estimatedMarketRate, unit) : null,
          effectiveDate,
          expiryDate,
          source: source.trim(),
          notes,
          createdBy,
          isActive: true
        };

        const saved = await store.valuations.save(record);

        res.status(201).json({
          message: 'Valuation record created successfully',
          valuation: saved
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------
  // GET /valuation — list all with optional filters
  // Query: state, district, taluk, village, landType, unit, currency, isActive
  // ---------------------------------------------------------------
  router.get('/valuation', optionalAuth, async (req, res, next) => {
    try {
      let all = await store.valuations.getAll();
      const { state, district, taluk, village, landType, unit, currency, isActive } = req.query;

      if (state) all = all.filter(v => v.state && v.state.toLowerCase().includes(state.toLowerCase()));
      if (district) all = all.filter(v => v.district && v.district.toLowerCase().includes(district.toLowerCase()));
      if (taluk) all = all.filter(v => v.taluk && v.taluk.toLowerCase().includes(taluk.toLowerCase()));
      if (village) all = all.filter(v => v.village && v.village.toLowerCase().includes(village.toLowerCase()));
      if (landType) all = all.filter(v => v.landType && v.landType.toLowerCase() === landType.toLowerCase());
      if (unit) all = all.filter(v => v.unit === unit);
      if (currency) all = all.filter(v => v.currency === currency);
      if (isActive !== undefined) {
        const active = isActive !== 'false';
        all = all.filter(v => v.isActive === active);
      }

      // Sort newest first
      all.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      res.json({ count: all.length, valuations: all });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /valuation/lookup — best matching record for location + landType
  // Query: state (req), district (req), taluk, village, landType (req)
  // Scoring: village match = 4pts, taluk = 3pts, district = 2pts, state = 1pt
  // ---------------------------------------------------------------
  router.get('/valuation/lookup', optionalAuth, async (req, res, next) => {
    try {
      const { state, district, taluk, village, landType } = req.query;
      if (!state || !district || !landType) {
        return res.status(400).json({ error: 'Required query params: state, district, landType' });
      }

      const all = await store.valuations.getAll();
      const active = all.filter(v => v.isActive !== false);

      const scored = active
        .filter(v => v.landType && v.landType.toLowerCase() === landType.toLowerCase())
        .map(v => {
          let score = 0;
          if (v.state && v.state.toLowerCase() === state.toLowerCase()) score += 1;
          if (v.district && v.district.toLowerCase() === district.toLowerCase()) score += 2;
          if (taluk && v.taluk && v.taluk.toLowerCase() === taluk.toLowerCase()) score += 3;
          if (village && v.village && v.village.toLowerCase() === village.toLowerCase()) score += 4;
          return { ...v, _score: score };
        })
        .filter(v => v._score > 0)
        .sort((a, b) => b._score - a._score);

      if (scored.length === 0) {
        return res.status(404).json({
          error: `No valuation records found for landType='${landType}' in ${district}, ${state}`
        });
      }

      const best = scored[0];
      delete best._score;

      res.json({
        query: { state, district, taluk, village, landType },
        match: best,
        alternativesCount: scored.length - 1
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /valuation/for-parcel/:claimId — auto-lookup for a registered parcel
  // Uses the parcel's state/district/taluk/village/landUseFinalApproved to find best rate
  // ---------------------------------------------------------------
  router.get('/valuation/for-parcel/:claimId', optionalAuth, async (req, res, next) => {
    try {
      const claim = await store.claims.getById(req.params.claimId);
      if (!claim) {
        return res.status(404).json({ error: `Parcel '${req.params.claimId}' not found` });
      }

      const landType = claim.landUseFinalApproved || claim.landUseGroundVerified || claim.landUseFarmerDeclared || 'Agricultural';
      const state = claim.state || 'Karnataka';
      const district = claim.district || '';
      const taluk = claim.taluk || '';
      const village = claim.village || '';

      const all = await store.valuations.getAll();
      const active = all.filter(v => v.isActive !== false);

      const scored = active
        .filter(v => v.landType && v.landType.toLowerCase() === landType.toLowerCase())
        .map(v => {
          let score = 0;
          if (v.state && v.state.toLowerCase() === state.toLowerCase()) score += 1;
          if (district && v.district && v.district.toLowerCase() === district.toLowerCase()) score += 2;
          if (taluk && v.taluk && v.taluk.toLowerCase() === taluk.toLowerCase()) score += 3;
          if (village && v.village && v.village.toLowerCase() === village.toLowerCase()) score += 4;
          return { ...v, _score: score };
        })
        .filter(v => v._score > 0)
        .sort((a, b) => b._score - a._score);

      if (scored.length === 0) {
        return res.status(404).json({
          message: `No valuation on record for ${landType} land in ${district || state}`,
          claimId: req.params.claimId,
          landType
        });
      }

      const best = scored[0];
      delete best._score;
      const acres = Number(claim.confirmedAreaAcres || claim.parcelAreaAcres || 0);
      const estimatedGovtValue = best.govtReferenceRatePerAcre ? best.govtReferenceRatePerAcre * acres : null;
      const estimatedMarketValue = best.estimatedMarketRatePerAcre ? best.estimatedMarketRatePerAcre * acres : null;

      res.json({
        claimId: req.params.claimId,
        landId: claim.landId || claim.claimId,
        ownerName: claim.ownerName,
        parcelAreaAcres: acres,
        landType,
        valuation: best,
        computedEstimates: {
          govtReferenceTotal: estimatedGovtValue != null ? Math.round(estimatedGovtValue * 100) / 100 : null,
          estimatedMarketTotal: estimatedMarketValue != null ? Math.round(estimatedMarketValue * 100) / 100 : null,
          currency: best.currency
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /valuation/:id — single record
  // ---------------------------------------------------------------
  router.get('/valuation/:id', optionalAuth, async (req, res, next) => {
    try {
      const v = await store.valuations.getById(req.params.id);
      if (!v) {
        return res.status(404).json({ error: `Valuation record '${req.params.id}' not found` });
      }
      res.json(v);
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // PATCH /valuation/:id — update a valuation record
  // ---------------------------------------------------------------
  router.patch(
    '/valuation/:id',
    requireRole(ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const existing = await store.valuations.getById(req.params.id);
        if (!existing) {
          return res.status(404).json({ error: `Valuation record '${req.params.id}' not found` });
        }

        const allowed = ['govtReferenceRate', 'estimatedMarketRate', 'expiryDate', 'source', 'notes', 'isActive', 'effectiveDate'];
        const updates = {};
        for (const key of allowed) {
          if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        // Recompute per-acre rates if rates changed
        const unit = existing.unit || 'acre';
        if (updates.govtReferenceRate) {
          updates.govtReferenceRatePerAcre = toPerAcre(updates.govtReferenceRate, unit);
          updates.govtReferenceRate = String(updates.govtReferenceRate);
        }
        if (updates.estimatedMarketRate) {
          updates.estimatedMarketRatePerAcre = toPerAcre(updates.estimatedMarketRate, unit);
          updates.estimatedMarketRate = String(updates.estimatedMarketRate);
        }

        const updated = await store.valuations.update(req.params.id, updates);
        res.json({ message: 'Valuation record updated', valuation: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
};
