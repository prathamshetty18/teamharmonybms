const path = require('path');
const fs = require('fs');

// Ensure module resolution falls back to backend/node_modules if running without root node_modules
const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules) && !module.paths.includes(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const chain = require('../chain.js');
const { createReliefRecord } = require('../backend/relief');
const store = require('../backend/store');

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const status = err.status || 400;
      return res.status(status).json({ error: err.message || 'An unexpected error occurred' });
    }
  };
}

/**
 * POST /reliefs
 * Body: { name, zonePolygon, ratePerAcre, maxPerClaimWei, budgetWei, expiresAt, disasterType }
 * Calls Person B's createReliefRecord for zoneHash and Atlas persistence,
 * then calls chain.createRelief(zoneHash, maxPerClaimWei, budgetWei, expiresAt)
 * Returns merged { ...savedRecord, reliefId, txHash }
 */
router.post('/reliefs', asyncRoute(async (req, res) => {
  const {
    name,
    description,
    zonePolygon,
    zone,
    ratePerAcre,
    maxPerClaimWei,
    maxPerClaim,
    budgetWei,
    budget,
    disasterType,
    expiresAt,
    reliefId
  } = req.body || {};

  const effectiveMaxPerClaim = maxPerClaimWei || maxPerClaim;
  const effectiveBudget = budgetWei || budget;
  const effectiveZone = zonePolygon || zone;

  if (!effectiveMaxPerClaim || !effectiveBudget) {
    return res.status(400).json({ error: "Missing required fields: 'maxPerClaimWei' and 'budgetWei'" });
  }

  // Call Person B's existing relief.js function (createReliefRecord)
  // Computes zoneHash and persists the record to MongoDB Atlas
  const savedRecord = await createReliefRecord({
    name,
    description,
    zone: effectiveZone,
    ratePerAcre: ratePerAcre ? String(ratePerAcre) : undefined,
    maxPerClaim: String(effectiveMaxPerClaim),
    budget: String(effectiveBudget),
    disasterType,
    reliefId
  });

  const reliefRes = await chain.createRelief(
    savedRecord.zoneHash,
    effectiveMaxPerClaim,
    effectiveBudget,
    expiresAt || 0
  );

  // Update Atlas record with on-chain reliefId and txHash if available
  if (reliefRes) {
    if (reliefRes.txHash) {
      await store.update('reliefs', savedRecord.reliefId, {
        txHash: reliefRes.txHash,
        onChainReliefId: reliefRes.reliefId
      });
    }
    if (reliefRes.reliefId && reliefRes.reliefId !== savedRecord.reliefId) {
      await store.save('reliefs', {
        ...savedRecord,
        reliefId: reliefRes.reliefId,
        offChainReliefId: savedRecord.reliefId,
        txHash: reliefRes.txHash
      });
    }
  }

  return res.status(200).json({
    ...savedRecord,
    reliefId: (reliefRes && reliefRes.reliefId) ? reliefRes.reliefId : savedRecord.reliefId,
    txHash: (reliefRes && reliefRes.txHash) ? reliefRes.txHash : null
  });
}));

/**
 * POST /claims/:id/assess
 * Body: { reliefId, damageLevel, damageEvidenceHash, signer }
 * Calls chain.assess
 */
router.post('/claims/:id/assess', asyncRoute(async (req, res) => {
  const claimId = req.params.id;
  const { reliefId, damageLevel, damageEvidenceHash, signer } = req.body || {};

  if (!reliefId || damageLevel === undefined || damageLevel === null) {
    return res.status(400).json({ error: "Missing required fields: 'reliefId' and 'damageLevel'" });
  }

  const evidenceHash = damageEvidenceHash || ('0x' + '0'.repeat(64));
  const signerParam = signer || 'assessor';

  const assessRes = await chain.assess(claimId, reliefId, damageLevel, evidenceHash, signerParam);

  return res.status(200).json({
    txHash: assessRes.txHash
  });
}));

/**
 * POST /claims/:id/approve-payout
 * Body: { reliefId, officer, amount, beneficiary }
 * Calls chain.approvePayout
 */
router.post('/claims/:id/approve-payout', asyncRoute(async (req, res) => {
  const claimId = req.params.id;
  const { reliefId, officer, amount, beneficiary } = req.body || {};

  if (!reliefId || !officer || !amount || !beneficiary) {
    return res.status(400).json({ error: "Missing required fields: 'reliefId', 'officer', 'amount', and 'beneficiary'" });
  }

  const approveRes = await chain.approvePayout(claimId, reliefId, amount, beneficiary, officer);

  return res.status(200).json({
    txHash: approveRes.txHash
  });
}));

/**
 * POST /claims/:id/release-payout
 * Body: { reliefId, signer }
 * Calls chain.release, returns { txHash, payout }
 */
router.post('/claims/:id/release-payout', asyncRoute(async (req, res) => {
  const claimId = req.params.id;
  const { reliefId, signer } = req.body || {};

  if (!reliefId) {
    return res.status(400).json({ error: "Missing required field: 'reliefId'" });
  }

  const releaseRes = await chain.release(claimId, reliefId, signer || 'admin');
  const payoutDetails = await chain.getPayout(claimId, reliefId);

  return res.status(200).json({
    txHash: releaseRes.txHash,
    payout: payoutDetails
  });
}));

module.exports = router;
