const { ethers, NonceManager } = require('ethers');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const { loadOrGenerateRoles } = require('./setupRoles');

const RPC_URL = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Cache NonceManagers per private key
const signerCache = new Map();

function getSignerByRole(roleName = 'ADMIN') {
  const rolesFile = path.resolve(__dirname, '..', '.env.roles.json');
  let privateKey = null;

  if (fs.existsSync(rolesFile)) {
    const roles = fs.readJSONSync(rolesFile);
    if (roles[roleName] && roles[roleName].privateKey) {
      privateKey = roles[roleName].privateKey;
    }
  }

  // Fallback to default PRIVATE_KEY in .env for ADMIN
  if (!privateKey && roleName === 'ADMIN' && process.env.PRIVATE_KEY) {
    privateKey = process.env.PRIVATE_KEY;
  }

  if (!privateKey) {
    throw new Error(`Signer for role ${roleName} not found. Run npm run setup:roles first.`);
  }

  if (!signerCache.has(privateKey)) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const managedSigner = new NonceManager(wallet);
    signerCache.set(privateKey, managedSigner);
  }

  return signerCache.get(privateKey);
}

function getLandRegistryContract(signerOrRole = 'ADMIN') {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS not configured. Run deploy.js first.');
  }
  const artifactPath = path.resolve(__dirname, '..', 'build', 'LandRegistry.json');
  const artifact = fs.readJSONSync(artifactPath);
  const signer = (typeof signerOrRole === 'string') ? getSignerByRole(signerOrRole) : signerOrRole;
  return new ethers.Contract(contractAddress, artifact.abi, signer);
}

function getReliefFundContract(signerOrRole = 'ADMIN') {
  const reliefAddress = process.env.RELIEF_CONTRACT_ADDRESS;
  if (!reliefAddress) {
    throw new Error('RELIEF_CONTRACT_ADDRESS not configured. Run deployRelief.js first.');
  }
  const artifactPath = path.resolve(__dirname, '..', 'build', 'ReliefFund.json');
  const artifact = fs.readJSONSync(artifactPath);
  const signer = (typeof signerOrRole === 'string') ? getSignerByRole(signerOrRole) : signerOrRole;
  return new ethers.Contract(reliefAddress, artifact.abi, signer);
}

const CLAIM_STATUS_MAP = ['Pending', 'Verified', 'Disputed'];
const PAYOUT_STATUS_MAP = ['None', 'Assessed', 'Approved', 'Paid'];

// Helper to test if a transaction would revert using staticCall
async function wouldRevert(callPromise) {
  try {
    await callPromise;
    return { reverts: false, reason: null };
  } catch (err) {
    let reason = err.reason || err.shortMessage || err.message;
    if (err.data) {
      try {
        const iface = new ethers.Interface(['function Error(string)']);
        reason = iface.decodeFunctionData('Error', err.data)[0];
      } catch (_) {}
    }
    return { reverts: true, reason };
  }
}

// ==========================================
// 1. LAND REGISTRY MODULE
// ==========================================

async function createClaim({ claimant, ownerHash, evidenceHash, lat, lon }, signerRole = 'REGISTRAR') {
  const contract = getLandRegistryContract(signerRole);
  const latE6 = Math.round(Number(lat) * 1e6);
  const lonE6 = Math.round(Number(lon) * 1e6);

  const tx = await contract.createClaim(claimant, ownerHash, evidenceHash, latE6, lonE6);
  const receipt = await tx.wait();

  let claimId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'ClaimCreated') {
        claimId = Number(parsed.args.claimId);
        break;
      }
    } catch (_) {}
  }

  return {
    success: true,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    claimId
  };
}

async function attest(claimId, signerRole = 'NEIGHBOR1') {
  const contract = getLandRegistryContract(signerRole);
  const tx = await contract.attest(claimId);
  const receipt = await tx.wait();

  let newScore = null;
  let newStatus = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'ClaimAttested') {
        newScore = Number(parsed.args.newScore);
        newStatus = CLAIM_STATUS_MAP[Number(parsed.args.newStatus)];
        break;
      }
    } catch (_) {}
  }

  return {
    success: true,
    txHash: tx.hash,
    newScore,
    newStatus
  };
}

async function dispute(claimId, signerRole = 'ARBITER') {
  const contract = getLandRegistryContract(signerRole);
  const tx = await contract.dispute(claimId);
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash,
    status: 'Disputed'
  };
}

async function resolveDispute(claimId, restore, signerRole = 'ARBITER') {
  const contract = getLandRegistryContract(signerRole);
  const tx = await contract.resolveDispute(claimId, restore);
  const receipt = await tx.wait();

  let newStatus = null;
  let round = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'DisputeResolved') {
        newStatus = CLAIM_STATUS_MAP[Number(parsed.args.newStatus)];
        round = Number(parsed.args.round);
        break;
      }
    } catch (_) {}
  }

  return {
    success: true,
    txHash: tx.hash,
    restored: restore,
    newStatus,
    round
  };
}

async function statusOf(claimId) {
  const contract = getLandRegistryContract();
  const statusCode = await contract.statusOf(claimId);
  return {
    statusCode: Number(statusCode),
    status: CLAIM_STATUS_MAP[Number(statusCode)]
  };
}

async function claimantOf(claimId) {
  const contract = getLandRegistryContract();
  return await contract.claimantOf(claimId);
}

async function getClaim(claimId) {
  const contract = getLandRegistryContract();
  const res = await contract.getClaim(claimId);
  return {
    claimId: Number(claimId),
    claimant: res[0],
    ownerHash: res[1],
    evidenceHash: res[2],
    lat: Number(res[3]) / 1e6,
    lon: Number(res[4]) / 1e6,
    score: Number(res[5]),
    round: Number(res[6]),
    statusCode: Number(res[7]),
    status: CLAIM_STATUS_MAP[Number(res[7])],
    createdAt: new Date(Number(res[8]) * 1000).toISOString()
  };
}

// ==========================================
// 2. RELIEF & REIMBURSEMENT MODULE
// ==========================================

async function createRelief({ zoneHash, maxPerClaimMST, expiresAt, budgetMST }, signerRole = 'ADMIN') {
  const contract = getReliefFundContract(signerRole);
  const budgetWei = ethers.parseEther(String(budgetMST));
  const maxPerClaimWei = ethers.parseEther(String(maxPerClaimMST));

  const tx = await contract.createRelief(zoneHash, maxPerClaimWei, expiresAt, {
    value: budgetWei
  });
  const receipt = await tx.wait();

  let reliefId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'ReliefCreated') {
        reliefId = Number(parsed.args.reliefId);
        break;
      }
    } catch (_) {}
  }

  return {
    success: true,
    reliefId,
    txHash: tx.hash
  };
}

async function fundRelief(reliefId, amountMST, signerRole = 'ADMIN') {
  const contract = getReliefFundContract(signerRole);
  const amountWei = ethers.parseEther(String(amountMST));
  const tx = await contract.fundRelief(reliefId, { value: amountWei });
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash
  };
}

async function assessDamage({ claimId, reliefId, damageLevel, damageEvidenceHash }, signerRole = 'ASSESSOR') {
  const contract = getReliefFundContract(signerRole);
  const tx = await contract.assess(claimId, reliefId, damageLevel, damageEvidenceHash);
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash,
    status: 'Assessed'
  };
}

async function approvePayout({ claimId, reliefId, amountMST, beneficiary }, officerRole = 'OFFICER1') {
  const contract = getReliefFundContract(officerRole);
  const amountWei = ethers.parseEther(String(amountMST));
  const tx = await contract.approvePayout(claimId, reliefId, amountWei, beneficiary);
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash
  };
}

async function resetApprovals(claimId, reliefId, signerRole = 'ADMIN') {
  const contract = getReliefFundContract(signerRole);
  const tx = await contract.resetApprovals(claimId, reliefId);
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash
  };
}

async function releasePayout({ claimId, reliefId }, signerRole = 'ADMIN') {
  const contract = getReliefFundContract(signerRole);
  const tx = await contract.release(claimId, reliefId);
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash,
    status: 'Paid'
  };
}

async function sweepUnspent(reliefId, recipient, signerRole = 'ADMIN') {
  const contract = getReliefFundContract(signerRole);
  const tx = await contract.sweepUnspent(reliefId, recipient);
  const receipt = await tx.wait();
  return {
    success: true,
    txHash: tx.hash
  };
}

async function getPayout(claimId, reliefId) {
  const contract = getReliefFundContract();
  const res = await contract.getPayout(claimId, reliefId);
  return {
    statusCode: Number(res[0]),
    status: PAYOUT_STATUS_MAP[Number(res[0])],
    damageLevel: Number(res[1]),
    damageEvidenceHash: res[2],
    amountMST: ethers.formatEther(res[3]),
    beneficiary: res[4],
    officer1: res[5],
    officer2: res[6],
    releasedAt: Number(res[7]) === 0 ? null : new Date(Number(res[7]) * 1000).toISOString()
  };
}

async function getRelief(reliefId) {
  const contract = getReliefFundContract();
  const res = await contract.getRelief(reliefId);
  return {
    zoneHash: res[0],
    budgetMST: ethers.formatEther(res[1]),
    committedMST: ethers.formatEther(res[2]),
    paidMST: ethers.formatEther(res[3]),
    maxPerClaimMST: ethers.formatEther(res[4]),
    expiresAt: Number(res[5]),
    active: res[6]
  };
}

module.exports = {
  provider,
  getSignerByRole,
  getLandRegistryContract,
  getReliefFundContract,
  wouldRevert,
  // LandRegistry
  createClaim,
  attest,
  dispute,
  resolveDispute,
  statusOf,
  claimantOf,
  getClaim,
  // ReliefFund
  createRelief,
  fundRelief,
  assessDamage,
  approvePayout,
  resetApprovals,
  releasePayout,
  sweepUnspent,
  getPayout,
  getRelief
};
