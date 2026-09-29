const path = require('path');
const { ethers } = require('ethers');

// Load root chain.js
const chain = require('../chain');

// Load store if available to lookup payouts/claims when backend routes omit args
let store = null;
try {
  const storeModule = require('./store');
  store = storeModule.getStore ? storeModule.getStore() : storeModule;
} catch (_) {}

async function createClaim(firstArg, evidenceHash, latE6, lonE6, signerRole = 'REGISTRAR') {
  if (firstArg && typeof firstArg === 'object') {
    return chain.createClaim(firstArg, evidenceHash || 'REGISTRAR');
  }
  const ownerHash = firstArg;
  const lat = (typeof latE6 === 'number' && Math.abs(latE6) > 1000) ? (latE6 / 1e6) : (Number(latE6) || 12.9716);
  const lon = (typeof lonE6 === 'number' && Math.abs(lonE6) > 1000) ? (lonE6 / 1e6) : (Number(lonE6) || 77.5946);
  let claimant = '0x576409998e9be8f6d4F8838f3315721cA2139219';
  try {
    const signer = chain.getSignerByRole('REGISTRAR');
    if (signer) claimant = await signer.getAddress();
  } catch (_) {}
  return chain.createClaim({ claimant, ownerHash, evidenceHash, lat, lon }, signerRole);
}

async function attest(claimId, roleOrWeight = 'NEIGHBOR1', maybeSigner) {
  const idNum = Number(claimId);
  if (typeof roleOrWeight === 'string' && (roleOrWeight.toUpperCase().startsWith('NEIGHBOR') || roleOrWeight === 'LEADER1' || roleOrWeight === 'NGO1')) {
    return chain.attest(idNum, roleOrWeight);
  }
  if (roleOrWeight === 3 || roleOrWeight === 'Leader' || roleOrWeight === 'Village Leader' || roleOrWeight === 'LEADER') {
    return chain.attest(idNum, 'LEADER1');
  }
  if (roleOrWeight === 'NGO' || roleOrWeight === 'Accredited NGO' || roleOrWeight === 'NGO1') {
    return chain.attest(idNum, 'NGO1');
  }

  // Neighbor attestation (weight 1 or default): pick a neighbor that hasn't attested in this round
  const neighbors = ['NEIGHBOR1', 'NEIGHBOR2', 'NEIGHBOR3'];
  try {
    const contract = chain.getLandRegistryContract();
    const c = await contract.claims(idNum);
    const round = Number(c.round) || 1;
    for (const n of neighbors) {
      try {
        const signer = chain.getSignerByRole(n);
        const addr = await signer.getAddress();
        const already = await contract.hasAttested(idNum, round, addr);
        if (!already) {
          return await chain.attest(idNum, n);
        }
      } catch (_) {}
    }
  } catch (_) {}

  // Fallback to NEIGHBOR1
  return chain.attest(idNum, 'NEIGHBOR1');
}

async function createRelief(firstArg, maxPerClaim, budget, signerRole = 'ADMIN') {
  if (firstArg && typeof firstArg === 'object') {
    return chain.createRelief(firstArg, maxPerClaim || 'ADMIN');
  }
  const zoneHash = firstArg;
  const maxPerClaimMST = typeof maxPerClaim === 'bigint' ? ethers.formatEther(maxPerClaim) : String(maxPerClaim || '0.01');
  const budgetMST = typeof budget === 'bigint' ? ethers.formatEther(budget) : String(budget || '0.05');
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 86400;
  return chain.createRelief({ zoneHash, maxPerClaimMST, expiresAt, budgetMST }, signerRole);
}

async function assess(claimId, reliefId, damageLevel, damageEvidenceHash, signerRole = 'ASSESSOR') {
  if (claimId && typeof claimId === 'object') {
    return chain.assessDamage(claimId, reliefId || 'ASSESSOR');
  }
  return chain.assessDamage({
    claimId: Number(claimId),
    reliefId: Number(reliefId),
    damageLevel: Number(damageLevel),
    damageEvidenceHash
  }, signerRole);
}

async function approvePayout(claimIdOrObj, officerOrRole, maybeAmount, maybeBeneficiary, maybeReliefId) {
  if (claimIdOrObj && typeof claimIdOrObj === 'object') {
    return chain.approvePayout(claimIdOrObj, officerOrRole || 'OFFICER1');
  }
  const claimId = Number(claimIdOrObj);
  let reliefId = maybeReliefId ? Number(maybeReliefId) : 1;
  let amountMST = maybeAmount ? String(maybeAmount) : '0.01';
  let beneficiary = maybeBeneficiary || null;

  // Attempt to load from store if available
  if (store) {
    try {
      const payout = await store.getById('payouts', String(claimId));
      if (payout) {
        if (payout.reliefId) reliefId = Number(payout.reliefId);
        if (payout.amount) amountMST = String(payout.amount);
        if (payout.beneficiaryAddress || payout.beneficiary) {
          beneficiary = payout.beneficiaryAddress || payout.beneficiary;
        }
      }
    } catch (_) {}
    if (!beneficiary) {
      try {
        const claim = await store.getById('claims', String(claimId));
        if (claim && claim.beneficiaryAddress) beneficiary = claim.beneficiaryAddress;
      } catch (_) {}
    }
  }

  // Fallback beneficiary from land registry contract if needed
  if (!beneficiary) {
    try {
      beneficiary = await chain.claimantOf(claimId);
    } catch (_) {}
  }

  // Determine officer role
  let officerRole = 'OFFICER1';
  if (officerOrRole === 'OFFICER2' || officerOrRole === 'KA204') {
    officerRole = 'OFFICER2';
  } else {
    // Check on-chain payout status
    try {
      const contract = chain.getReliefFundContract();
      const p = await contract.payouts(reliefId, claimId);
      if (p.officer1 && p.officer1 !== ethers.ZeroAddress) {
        officerRole = 'OFFICER2';
      }
    } catch (_) {}
  }

  return chain.approvePayout({ claimId, reliefId, amountMST, beneficiary }, officerRole);
}

async function releasePayout(claimIdOrObj, signerRole = 'ADMIN') {
  if (claimIdOrObj && typeof claimIdOrObj === 'object') {
    return chain.releasePayout(claimIdOrObj, signerRole);
  }
  const claimId = Number(claimIdOrObj);
  let reliefId = 1;
  if (store) {
    try {
      const payout = await store.getById('payouts', String(claimId));
      if (payout && payout.reliefId) reliefId = Number(payout.reliefId);
    } catch (_) {}
  }
  return chain.releasePayout({ claimId, reliefId }, signerRole);
}

async function dispute(claimId, signerRole = 'ARBITER') {
  return chain.dispute(Number(claimId), signerRole);
}

async function resolveDispute(claimId, restore, signerRole = 'ARBITER') {
  return chain.resolveDispute(Number(claimId), Boolean(restore), signerRole);
}

async function getClaim(claimId) {
  return chain.getClaim(Number(claimId));
}

async function getPayout(claimId, reliefId) {
  return chain.getPayout(Number(claimId), Number(reliefId));
}

async function isAssessor(candidate) {
  try {
    const contract = chain.getReliefFundContract();
    return await contract.isAssessor(candidate);
  } catch (_) {
    return true;
  }
}

module.exports = {
  ...chain,
  createClaim,
  attest,
  createRelief,
  assess,
  assessDamage: assess,
  approvePayout,
  releasePayout,
  dispute,
  resolveDispute,
  getClaim,
  getPayout,
  isAssessor
};
