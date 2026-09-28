const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const chain = require('../chain.js');

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
 * Body: { name, zonePolygon, ratePerAcre, maxPerClaimWei, budgetWei, expiresAt }
 * Calls B helpers for zoneHash and store (stubbed with TODO), then chain.createRelief
 * Returns { reliefId, txHash }
 */
router.post('/reliefs', asyncRoute(async (req, res) => {
  const { name, zonePolygon, ratePerAcre, maxPerClaimWei, budgetWei, expiresAt } = req.body || {};

  if (!maxPerClaimWei || !budgetWei) {
    return res.status(400).json({ error: "Missing required fields: 'maxPerClaimWei' and 'budgetWei'" });
  }

  // TODO (Person B): Integrate Person B's store.js and Turf.js helpers for zonePolygon hashing and MongoDB saving.
  let zoneHash;
  if (zonePolygon) {
    const jsonStr = typeof zonePolygon === 'string' ? zonePolygon : JSON.stringify(zonePolygon);
    zoneHash = ethers.keccak256(ethers.toUtf8Bytes(jsonStr));
  } else if (name) {
    zoneHash = ethers.keccak256(ethers.toUtf8Bytes(name));
  } else {
    zoneHash = '0x' + '1'.repeat(64);
  }

  const reliefRes = await chain.createRelief(zoneHash, maxPerClaimWei, budgetWei, expiresAt || 0);

  return res.status(200).json({
    reliefId: reliefRes.reliefId,
    txHash: reliefRes.txHash
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
