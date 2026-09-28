const express = require('express');
const router = express.Router();
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
 * POST /claims/:id/attest
 * Body: { role, name, signer }
 * Calls chain.attest, then getClaim, returns { txHash, score, status }
 */
router.post('/claims/:id/attest', asyncRoute(async (req, res) => {
  const claimId = req.params.id;
  const { role, signer } = req.body || {};

  if (!role) {
    return res.status(400).json({ error: "Missing required body field: 'role'" });
  }

  const signerParam = signer || 'neighbor1';
  const attestRes = await chain.attest(claimId, role, signerParam);
  const claimDetails = await chain.getClaim(claimId);

  return res.status(200).json({
    txHash: attestRes.txHash,
    score: claimDetails.score,
    status: claimDetails.status
  });
}));

/**
 * POST /claims/:id/dispute
 * Body: { reason }
 * Calls chain.dispute, returns { txHash, status }
 */
router.post('/claims/:id/dispute', asyncRoute(async (req, res) => {
  const claimId = req.params.id;
  const disputeRes = await chain.dispute(claimId);
  const claimDetails = await chain.getClaim(claimId);

  return res.status(200).json({
    txHash: disputeRes.txHash,
    status: claimDetails.status
  });
}));

/**
 * POST /claims/:id/resolve
 * Body: { restore }
 * Calls chain.resolveDispute, returns { txHash, status }
 */
router.post('/claims/:id/resolve', asyncRoute(async (req, res) => {
  const claimId = req.params.id;
  const { restore } = req.body || {};

  if (restore === undefined || restore === null) {
    return res.status(400).json({ error: "Missing required body field: 'restore' (boolean)" });
  }

  const resolveRes = await chain.resolveDispute(claimId, Boolean(restore));
  const claimDetails = await chain.getClaim(claimId);

  return res.status(200).json({
    txHash: resolveRes.txHash,
    status: claimDetails.status
  });
}));

module.exports = router;
