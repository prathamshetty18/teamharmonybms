const express = require('express');
const store = require('../store');
const { requireRole, ROLES } = require('../auth');
const {
  PROFILES,
  SCHEMES,
  SUPPORTED_STATES,
  resolveProfile,
  getProfile,
  listProfiles,
  damageLevel,
  computeAmount
} = require('../eligibility');
const {
  getEligibleClaimsForRelief,
  getPayoutRecord,
  createReliefRecord
} = require('../relief');
const { validateReliefInput } = require('../utils/validate');

/**
 * Creates Expanded Relief Routes (/relief and /reliefs aliases, /relief/profiles, /relief/sanction)
 * 
 * Endpoints:
 * - GET /relief/profiles: Returns all PROFILES config, state/UT norms, schemes, rates by land type
 * - GET /relief/profiles/:disasterType: Returns specific profile (supports ?state=...&scheme=...)
 * - GET /relief: List all relief schemes (alias for /reliefs)
 * - POST /relief: Declare new relief scheme (alias for /reliefs)
 * - GET /relief/:id: Get single relief scheme
 * - GET /relief/:id/eligible: Eligible claims with separate calculatedAmount & officiallySanctionedAmount
 * - POST /relief/sanction/:claimId: Officially sanction amount for a claim
 * - POST /relief/:id/sanction/:claimId: Officially sanction amount for a claim in relief scheme
 * - GET /relief/:id/payouts: Payouts summary with calculated vs sanctioned amounts
 */
function createReliefExpandedRoutes() {
  const router = express.Router();

  // -------------------------------------------------------------
  // 1. GET /relief/profiles - Full Relief Calculation Configuration
  // -------------------------------------------------------------
  router.get(['/relief/profiles', '/reliefs/profiles'], (req, res) => {
    res.json(listProfiles());
  });

  // -------------------------------------------------------------
  // 2. GET /relief/profiles/:disasterType - Specific disaster profile
  // -------------------------------------------------------------
  router.get(['/relief/profiles/:disasterType', '/reliefs/profiles/:disasterType'], (req, res) => {
    const { disasterType } = req.params;
    const { state, scheme } = req.query;

    const profile = resolveProfile(disasterType, { state, scheme });
    if (!profile) {
      return res.status(404).json({
        error: `Profile not found for disasterType '${disasterType}'. Available types: ${Object.keys(PROFILES).filter(k => !k.includes(':')).join(', ')}`
      });
    }

    res.json({
      disasterType,
      state: state || 'default',
      scheme: scheme || 'sdrf',
      profile
    });
  });

  // -------------------------------------------------------------
  // 3. GET /relief - List all relief schemes (alias for /reliefs)
  // -------------------------------------------------------------
  router.get('/relief', async (req, res, next) => {
    try {
      const allReliefs = await store.getAll('reliefs');
      res.json(allReliefs);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 4. POST /relief - Declare relief scheme (alias for /reliefs)
  // -------------------------------------------------------------
  router.post('/relief', requireRole(ROLES.GOVERNMENT_OFFICER), validateReliefInput, async (req, res, next) => {
    try {
      const {
        name,
        description,
        disasterType,
        zone,
        zonePolygon,
        ratePerAcre,
        maxPerClaim,
        maxPerClaimWei,
        budget,
        budgetWei,
        reliefId
      } = req.body;

      const created = await createReliefRecord({
        name,
        description,
        disasterType,
        zone: zonePolygon || zone,
        ratePerAcre,
        maxPerClaim: maxPerClaimWei || maxPerClaim,
        budget: budgetWei || budget,
        reliefId
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 5. GET /relief/:id - Get relief event by ID
  // -------------------------------------------------------------
  router.get('/relief/:id', async (req, res, next) => {
    try {
      const relief = await store.getById('reliefs', req.params.id);
      if (!relief) {
        return res.status(404).json({ error: `Relief event '${req.params.id}' not found` });
      }
      res.json(relief);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 6. GET /relief/:id/eligible - Eligible claims with calculated & sanctioned amounts
  // -------------------------------------------------------------
  router.get('/relief/:id/eligible', async (req, res, next) => {
    try {
      const result = await getEligibleClaimsForRelief(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 7. POST /relief/sanction/:claimId & /relief/:id/sanction/:claimId - Officially Sanction Amount
  // -------------------------------------------------------------
  const sanctionReliefHandler = async (req, res, next) => {
    try {
      const claimId = req.params.claimId;
      const claim = await store.getById('claims', claimId);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${claimId}' not found` });
      }

      const payout = await store.getById('payouts', claimId);
      if (!payout || payout.status === 'None') {
        return res.status(400).json({
          error: 'No active assessment found for this claim. Payout must be Assessed before sanctioning.'
        });
      }

      const sanctioned = req.body.officiallySanctionedAmount || req.body.sanctionedAmount || req.body.amount;
      if (sanctioned === undefined || sanctioned === null || String(sanctioned).trim() === '') {
        return res.status(400).json({
          error: 'Missing required field: officiallySanctionedAmount (or sanctionedAmount)'
        });
      }

      const sanctionedStr = String(sanctioned);
      const officer = req.body.officer || req.headers['x-user-name'] || 'Government Officer';
      const notes = req.body.notes || req.body.remarks || 'Officially sanctioned by Government Officer';

      const updated = await store.update('payouts', claimId, {
        officiallySanctionedAmount: sanctionedStr,
        sanctionedAmount: sanctionedStr,
        amount: sanctionedStr,
        sanctionedBy: officer,
        sanctionedAt: new Date().toISOString(),
        sanctionNotes: notes
      });

      await store.recordAuditLog({
        who: officer,
        what: 'RELIEF_OFFICIALLY_SANCTIONED',
        landId: claimId,
        prevValue: payout.officiallySanctionedAmount || payout.amount || '0',
        newValue: sanctionedStr,
        remarks: `Relief officially sanctioned: ${sanctionedStr} wei. Notes: ${notes}`
      });

      res.json({
        message: `Officially sanctioned amount set to ${sanctionedStr} wei for claim ${claimId}`,
        payout: updated
      });
    } catch (err) {
      next(err);
    }
  };

  router.post('/relief/sanction/:claimId', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionReliefHandler);
  router.post('/relief/:id/sanction/:claimId', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionReliefHandler);
  router.post('/reliefs/sanction/:claimId', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionReliefHandler);
  router.post('/reliefs/:id/sanction/:claimId', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionReliefHandler);

  return router;
}

module.exports = createReliefExpandedRoutes;
