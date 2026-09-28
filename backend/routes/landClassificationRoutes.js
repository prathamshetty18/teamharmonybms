/**
 * Land Classification Routes — Phase D
 *
 * Manages the four-tier land-use classification system per the spec:
 *   1. farmerDeclared   — what the farmer claims (submitted at application time)
 *   2. govtRecord       — what government records show
 *   3. groundVerified   — what the GVO confirmed on-site
 *   4. finalApproved    — definitive classification set only at GOVERNMENT_REVIEW/APPROVED stage
 *
 * Rules:
 *   - Farmers may update farmerDeclared only (own parcels)
 *   - GVOs/NGO may update govtRecord and groundVerified
 *   - finalApproved requires GOVERNMENT_OFFICER role AND claim must be at GOVERNMENT_REVIEW or APPROVED workflow stage
 *   - Every change writes an immutable Audit Log entry
 *
 * Endpoints:
 *   GET  /land-classification/:claimId          — full 4-tier state for a parcel
 *   PATCH /land-classification/:claimId         — update one or more tiers (role-gated)
 *   GET  /land-classification/:claimId/history  — audit trail for classification changes only
 *   GET  /land-classification/types             — supported land-use type vocabulary
 */

'use strict';

const express = require('express');
const store = require('../store');
const { ROLES, requireRole, optionalAuth } = require('../auth');

// Controlled vocabulary of recognised land-use types
const LAND_USE_TYPES = [
  'Agricultural',
  'Wet Agricultural',
  'Dry Agricultural',
  'Horticulture',
  'Plantation',
  'Residential',
  'Commercial',
  'Industrial',
  'Forest',
  'Wasteland',
  'Government Land',
  'Mixed Use',
  'Other'
];

// Tiers that each role is allowed to write
const ROLE_WRITABLE_TIERS = {
  [ROLES.FARMER]: ['farmerDeclared'],
  [ROLES.GROUND_VERIFICATION_OFFICER]: ['govtRecord', 'groundVerified'],
  [ROLES.NGO_COMMUNITY_VERIFIER]: ['govtRecord', 'groundVerified'],
  [ROLES.GOVERNMENT_OFFICER]: ['govtRecord', 'groundVerified', 'finalApproved']
};

// Workflow stages that permit finalApproved to be set.
// verificationRoutes.js stores state in claim.verificationStatus (exact string match)
// claimsRoutes.js may also use claim.workflowStatus.
const FINAL_APPROVED_ALLOWED_STAGES = [
  'GOVERNMENT_REVIEW', 'APPROVED', 'Government Review', 'Approved',
  'GOVERNMENT_REVIEW', 'Government Review'
];

module.exports = function createLandClassificationRoutes() {
  const router = express.Router();

  // ---------------------------------------------------------------
  // GET /land-classification/types — vocabulary list
  // ---------------------------------------------------------------
  router.get('/land-classification/types', (req, res) => {
    res.json({ landUseTypes: LAND_USE_TYPES });
  });

  // ---------------------------------------------------------------
  // GET /land-classification/:claimId — full 4-tier classification
  // ---------------------------------------------------------------
  router.get('/land-classification/:claimId', optionalAuth, async (req, res, next) => {
    try {
      const claim = await store.claims.getById(req.params.claimId);
      if (!claim) {
        return res.status(404).json({ error: `Land parcel '${req.params.claimId}' not found` });
      }

      res.json({
        claimId: claim.claimId || claim.landId,
        landId: claim.landId || claim.claimId,
        ownerName: claim.ownerName,
        classification: {
          farmerDeclared: claim.landUseFarmerDeclared || null,
          govtRecord: claim.landUseGovtRecord || null,
          groundVerified: claim.landUseGroundVerified || null,
          finalApproved: claim.landUseFinalApproved || null
        },
        workflowStatus: claim.workflowStatus || claim.verificationStatus || 'SUBMITTED',
        onChainStatus: claim.status || 'Pending',
        lastUpdated: claim.updatedAt
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // PATCH /land-classification/:claimId — update tier(s)
  // Body: { farmerDeclared?, govtRecord?, groundVerified?, finalApproved?, reason? }
  // ---------------------------------------------------------------
  router.patch(
    '/land-classification/:claimId',
    requireRole(ROLES.FARMER, ROLES.GROUND_VERIFICATION_OFFICER, ROLES.NGO_COMMUNITY_VERIFIER, ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const claim = await store.claims.getById(req.params.claimId);
        if (!claim) {
          return res.status(404).json({ error: `Land parcel '${req.params.claimId}' not found` });
        }

        const userRole = req.user && req.user.role;
        const allowedTiers = ROLE_WRITABLE_TIERS[userRole] || [];
        const { farmerDeclared, govtRecord, groundVerified, finalApproved, reason = '' } = req.body || {};

        if (!farmerDeclared && !govtRecord && !groundVerified && !finalApproved) {
          return res.status(400).json({
            error: 'At least one classification field required: farmerDeclared, govtRecord, groundVerified, or finalApproved'
          });
        }

        const updates = {};
        const changed = [];

        // Validate and apply each requested tier
        const tierMap = { farmerDeclared, govtRecord, groundVerified, finalApproved };
        const storeKeyMap = {
          farmerDeclared: 'landUseFarmerDeclared',
          govtRecord: 'landUseGovtRecord',
          groundVerified: 'landUseGroundVerified',
          finalApproved: 'landUseFinalApproved'
        };

        for (const [tier, value] of Object.entries(tierMap)) {
          if (value == null) continue;

          // Role gate
          if (!allowedTiers.includes(tier)) {
            return res.status(403).json({
              error: `Role '${userRole}' is not permitted to update '${tier}'. Allowed tiers: ${allowedTiers.join(', ')}`
            });
          }

          // finalApproved workflow gate: check verificationStatus OR workflowStatus
          if (tier === 'finalApproved') {
            const stage = claim.verificationStatus || claim.workflowStatus || '';
            const allowed = [
              'GOVERNMENT_REVIEW', 'APPROVED', 'Government Review', 'Approved'
            ];
            if (!allowed.some(s => stage === s || stage.includes(s))) {
              return res.status(400).json({
                error: `Cannot set finalApproved classification until claim reaches GOVERNMENT_REVIEW stage. Current stage: '${stage}'`
              });
            }
          }

          // Vocabulary check (warn but allow if Other/custom)
          if (!LAND_USE_TYPES.includes(value)) {
            console.warn(`[LandClassification] Non-standard land-use type '${value}' accepted for ${tier}`);
          }

          const storeKey = storeKeyMap[tier];
          updates[storeKey] = value;
          changed.push({ tier, from: claim[storeKey] || null, to: value });
        }

        if (changed.length === 0) {
          return res.status(400).json({ error: 'No valid classification updates provided' });
        }

        updates.updatedAt = new Date().toISOString();
        const updated = await store.claims.update(req.params.claimId, updates);

        const who = req.user ? `${req.user.name} (${req.user.role})` : 'Authorized Officer';
        await store.recordAuditLog({
          who,
          what: 'LAND_CLASSIFICATION_UPDATED',
          landId: req.params.claimId,
          prevValue: changed.map(c => `${c.tier}:${c.from}`).join(', '),
          newValue: changed.map(c => `${c.tier}:${c.to}`).join(', '),
          remarks: reason || `Land classification updated: ${changed.map(c => `${c.tier} → ${c.to}`).join('; ')}`,
          metadata: { changed, updatedBy: userRole }
        });

        res.json({
          message: 'Land classification updated successfully',
          claimId: updated.claimId || updated.landId,
          classification: {
            farmerDeclared: updated.landUseFarmerDeclared || null,
            govtRecord: updated.landUseGovtRecord || null,
            groundVerified: updated.landUseGroundVerified || null,
            finalApproved: updated.landUseFinalApproved || null
          },
          changed,
          updatedAt: updated.updatedAt
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------
  // GET /land-classification/:claimId/history — classification audit trail
  // ---------------------------------------------------------------
  router.get('/land-classification/:claimId/history', optionalAuth, async (req, res, next) => {
    try {
      const claim = await store.claims.getById(req.params.claimId);
      if (!claim) {
        return res.status(404).json({ error: `Land parcel '${req.params.claimId}' not found` });
      }

      const allLogs = await store.auditLogs.getByLandId(req.params.claimId);
      const classLogs = allLogs.filter(a =>
        a.what && (
          a.what.includes('LAND_CLASSIFICATION') ||
          a.what.includes('WORKFLOW_TRANSITION') ||
          a.what.includes('STATUS_TRANSITION') ||
          a.what.includes('GROUND_VERIFICATION') ||
          a.what.includes('NGO_COMMUNITY_VERIFICATION') ||
          a.what.includes('GOVERNMENT_APPROVED')
        )
      );

      res.json({
        claimId: req.params.claimId,
        total: classLogs.length,
        history: classLogs
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
