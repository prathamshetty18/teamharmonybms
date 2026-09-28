const { ethers } = require('ethers');
require('dotenv').config();

const LandRegistryArtifact = require('./build/LandRegistry.json');
const ReliefFundArtifact = require('./build/ReliefFund.json');

class ChainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ChainError';
    this.status = status;
  }
}

// 1. Provider & Contract Setup
const RPC_URL = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
let provider = new ethers.JsonRpcProvider(RPC_URL);

let landRegistryAddress = process.env.CONTRACT_ADDRESS || '';
let reliefFundAddress = process.env.RELIEF_CONTRACT_ADDRESS || '';

let landRegistryContract = landRegistryAddress
  ? new ethers.Contract(landRegistryAddress, LandRegistryArtifact.abi, provider)
  : null;

let reliefFundContract = reliefFundAddress
  ? new ethers.Contract(reliefFundAddress, ReliefFundArtifact.abi, provider)
  : null;

function setContractAddresses(landAddress, reliefAddress) {
  if (landAddress) {
    landRegistryAddress = landAddress;
    landRegistryContract = new ethers.Contract(landRegistryAddress, LandRegistryArtifact.abi, provider);
  }
  if (reliefAddress) {
    reliefFundAddress = reliefAddress;
    reliefFundContract = new ethers.Contract(reliefFundAddress, ReliefFundArtifact.abi, provider);
  }
}

function setProvider(newProvider) {
  provider = newProvider;
  if (landRegistryAddress) {
    landRegistryContract = new ethers.Contract(landRegistryAddress, LandRegistryArtifact.abi, provider);
  }
  if (reliefAddress) {
    reliefFundAddress = reliefAddress;
    reliefFundContract = new ethers.Contract(reliefFundAddress, ReliefFundArtifact.abi, provider);
  }
}

// 2. Signer Registry
const keyEnvMap = {
  admin: 'ADMIN_KEY',
  registrar: 'REGISTRAR_KEY',
  arbiter: 'ARBITER_KEY',
  assessor: 'ASSESSOR_KEY',
  officer1: 'OFFICER1_KEY',
  officer2: 'OFFICER2_KEY',
  neighbor1: 'NEIGHBOR1_KEY',
  neighbor2: 'NEIGHBOR2_KEY',
  neighbor3: 'NEIGHBOR3_KEY',
  leader: 'LEADER_KEY',
  ngo: 'NGO_KEY'
};

const signers = {};

function initSigners() {
  for (const [name, envKey] of Object.entries(keyEnvMap)) {
    const pk = process.env[envKey];
    if (pk && pk.trim()) {
      try {
        signers[name] = new ethers.Wallet(pk.trim(), provider);
      } catch (err) {
        console.warn(`[chain.js Warning] Failed to initialize signer '${name}' from ${envKey}: ${err.message}`);
      }
    }
  }
}

initSigners();

function registerSigner(name, walletOrPk) {
  if (typeof walletOrPk === 'string') {
    try {
      signers[name] = new ethers.Wallet(walletOrPk, provider);
    } catch (e) {
      signers[name] = { address: walletOrPk };
    }
  } else if (walletOrPk && walletOrPk.connect) {
    signers[name] = walletOrPk.connect(provider);
  } else {
    signers[name] = walletOrPk;
  }
}

function resolveSigner(signerParam) {
  if (!signerParam) {
    throw new ChainError('Signer parameter is required', 400);
  }
  if (typeof signerParam === 'string') {
    const key = signerParam.toLowerCase();
    if (!signers[key]) {
      // Create ad-hoc key for mock/test if missing
      if (process.env.CHAIN_MOCK === '1') {
        signers[key] = { address: '0x' + key.padEnd(40, '0') };
        return signers[key];
      }
      throw new ChainError(`Unknown or unconfigured signer: '${signerParam}'. Ensure key is present in .env`, 400);
    }
    return signers[key];
  }
  if (signerParam.sendTransaction || signerParam.address) {
    return signerParam;
  }
  throw new ChainError('Invalid signer specified', 400);
}

function getSignerAddress(signerParam) {
  if (!signerParam) return '0x0000000000000000000000000000000000000000';
  if (typeof signerParam === 'string') {
    const s = resolveSigner(signerParam);
    return (s.address || s.target || signerParam).toLowerCase();
  }
  if (signerParam.address) return signerParam.address.toLowerCase();
  return '0x0000000000000000000000000000000000000000';
}

// 3. Per-wallet Nonce Safety Queue
const walletQueues = new Map();

function enqueueWalletTx(walletAddress, taskFn) {
  const addr = walletAddress.toLowerCase();
  const currentQueue = walletQueues.get(addr) || Promise.resolve();
  const nextQueue = currentQueue
    .catch(() => {})
    .then(() => taskFn());
  walletQueues.set(addr, nextQueue);
  return nextQueue;
}

// 4. Helper to parse logs
function parseLogFromReceipt(receipt, contractInterface, eventName) {
  if (!receipt || !receipt.logs) return null;
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch (e) {
      // ignored
    }
  }
  return null;
}

// 5. Revert Error Decoder
function handleChainError(err, contractInterface = null) {
  if (err instanceof ChainError) {
    throw err;
  }

  if (
    err.code === 'NETWORK_ERROR' ||
    err.code === 'TIMEOUT' ||
    err.code === 'SERVER_ERROR' ||
    (err.message && (err.message.includes('RPC') || err.message.includes('fetch') || err.message.includes('connect')))
  ) {
    throw new ChainError(`RPC network error: ${err.message}`, 502);
  }

  let errorData = err.data || (err.error && err.error.data) || (err.info && err.info.error && err.info.error.data);

  if (errorData && contractInterface) {
    try {
      const parsedError = contractInterface.parseError(errorData);
      if (parsedError) {
        throw new ChainError(`Contract revert: ${parsedError.name}(${parsedError.args.join(', ')})`, 400);
      }
    } catch (e) {
      if (e instanceof ChainError) throw e;
    }
  }

  const msg = err.reason || err.shortMessage || err.message || 'Blockchain transaction failed';

  if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('nonexistent') || msg.toLowerCase().includes('invalid claim')) {
    throw new ChainError(msg, 404);
  }

  throw new ChainError(msg, 400);
}

// 6. Enum maps
const statusToString = {
  0: 'Pending',
  1: 'Verified',
  2: 'Disputed'
};

const payoutToString = {
  0: 'None',
  1: 'Assessed',
  2: 'Approved',
  3: 'Paid'
};

const roleToNumber = {
  'neighbor': 1,
  'leader': 2,
  'ngo': 3,
  1: 1,
  2: 2,
  3: 3
};

// 8. Hash validator
function validateBytes32(hash, name = 'hash') {
  if (!hash || typeof hash !== 'string') {
    throw new ChainError(`Invalid ${name}: must be a 0x-prefixed 32-byte hex string`, 400);
  }
  let h = hash.trim();
  if (!h.startsWith('0x')) {
    h = '0x' + h;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(h)) {
    throw new ChainError(`Invalid ${name}: '${hash}' must be a valid 64-character hex string (32 bytes)`, 400);
  }
  return h;
}

function validateContract(contract, name) {
  if (!contract) {
    throw new ChainError(`${name} contract address not configured in .env`, 502);
  }
}

// ============================================================================
// IN-MEMORY MOCK STORE (Active when process.env.CHAIN_MOCK === '1')
// ============================================================================

const mockState = {
  claims: new Map(),       // claimId -> claim object
  attestations: new Map(), // claimId -> Set(attesterAddress)
  reliefs: new Map(),      // reliefId -> relief object
  assessments: new Map(),  // `${claimId}-${reliefId}` -> assessment
  approvals: new Map(),    // `${claimId}-${reliefId}` -> Array of { officer, amount, beneficiary }
  payouts: new Map(),      // `${claimId}-${reliefId}` -> payout object
  nextClaimId: 1,
  nextReliefId: 1
};

function generateMockTxHash() {
  let h = '0x';
  for (let i = 0; i < 64; i++) {
    h += Math.floor(Math.random() * 16).toString(16);
  }
  return h;
}

// 7. Core Exported Chain Functions

/**
 * createClaim(ownerHash, evidenceHash, lat, lon) -> { claimId, txHash }
 * Signer: registrar
 */
async function createClaim(ownerHash, evidenceHash, lat, lon) {
  const validOwnerHash = validateBytes32(ownerHash, 'ownerHash');
  const validEvidenceHash = validateBytes32(evidenceHash, 'evidenceHash');

  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw new ChainError('Latitude and longitude must be numbers', 400);
  }

  const latE6 = Math.round(lat * 1e6);
  const lonE6 = Math.round(lon * 1e6);

  if (latE6 < -90000000 || latE6 > 90000000) {
    throw new ChainError('Latitude out of bounds (-90 to +90)', 400);
  }
  if (lonE6 < -180000000 || lonE6 > 180000000) {
    throw new ChainError('Longitude out of bounds (-180 to +180)', 400);
  }

  if (process.env.CHAIN_MOCK === '1') {
    const claimId = (mockState.nextClaimId++).toString();
    mockState.claims.set(claimId, {
      claimId,
      ownerHash: validOwnerHash,
      evidenceHash: validEvidenceHash,
      latE6,
      lonE6,
      score: 0,
      status: 0 // Pending
    });
    return { claimId, txHash: generateMockTxHash() };
  }

  validateContract(landRegistryContract, 'LandRegistry');
  const signer = resolveSigner('registrar');
  const contractWithSigner = landRegistryContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.createClaim(validOwnerHash, validEvidenceHash, latE6, lonE6);
      const receipt = await tx.wait();
      const event = parseLogFromReceipt(receipt, landRegistryContract.interface, 'ClaimCreated');
      const claimId = event ? event.args.claimId.toString() : '0';
      return { claimId, txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, landRegistryContract.interface);
    }
  });
}

/**
 * attest(claimId, role, signer) -> { txHash }
 */
async function attest(claimId, role, signerParam = 'neighbor1') {
  const roleNum = typeof role === 'string' ? roleToNumber[role.toLowerCase()] : roleToNumber[role];
  if (!roleNum || roleNum < 1 || roleNum > 3) {
    throw new ChainError(`Invalid role: '${role}'. Allowed roles: neighbor (1), leader (2), ngo (3)`, 400);
  }

  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const claim = mockState.claims.get(cId);
    if (!claim) {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    const attester = getSignerAddress(signerParam);
    let attSet = mockState.attestations.get(cId);
    if (!attSet) {
      attSet = new Set();
      mockState.attestations.set(cId, attSet);
    }
    if (attSet.has(attester)) {
      throw new ChainError('Already attested by this address', 400);
    }
    attSet.add(attester);

    const weight = roleNum === 1 ? 1 : roleNum === 2 ? 3 : roleNum === 3 ? 3 : 0;
    claim.score += weight;
    if (claim.score >= 5 && claim.status === 0) {
      claim.status = 1; // Verified
    }
    return { txHash: generateMockTxHash() };
  }

  validateContract(landRegistryContract, 'LandRegistry');
  const signer = resolveSigner(signerParam);
  const contractWithSigner = landRegistryContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.attest(BigInt(claimId), roleNum);
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, landRegistryContract.interface);
    }
  });
}

/**
 * dispute(claimId, signerParam) -> { txHash }
 */
async function dispute(claimId, signerParam = 'registrar') {
  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const claim = mockState.claims.get(cId);
    if (!claim) {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    claim.status = 2; // Disputed
    return { txHash: generateMockTxHash() };
  }

  validateContract(landRegistryContract, 'LandRegistry');
  const signer = resolveSigner(signerParam);
  const contractWithSigner = landRegistryContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.dispute(BigInt(claimId));
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, landRegistryContract.interface);
    }
  });
}

/**
 * resolveDispute(claimId, restore, signerParam) -> { txHash }
 */
async function resolveDispute(claimId, restore, signerParam = 'arbiter') {
  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const claim = mockState.claims.get(cId);
    if (!claim) {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    if (claim.status !== 2) {
      throw new ChainError('Claim is not disputed', 400);
    }
    claim.status = Boolean(restore) ? 1 : 0;
    return { txHash: generateMockTxHash() };
  }

  validateContract(landRegistryContract, 'LandRegistry');
  const signer = resolveSigner(signerParam);
  const contractWithSigner = landRegistryContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.resolveDispute(BigInt(claimId), Boolean(restore));
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, landRegistryContract.interface);
    }
  });
}

/**
 * getClaim(claimId) -> { status, score, ownerHash, evidenceHash, lat, lon }
 * lat/lon = e6 / 1e6, status as string, throw 404 if claim not found
 */
async function getClaim(claimId) {
  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const claim = mockState.claims.get(cId);
    if (!claim) {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    return {
      status: statusToString[claim.status],
      score: claim.score,
      ownerHash: claim.ownerHash,
      evidenceHash: claim.evidenceHash,
      lat: claim.latE6 / 1e6,
      lon: claim.lonE6 / 1e6
    };
  }

  validateContract(landRegistryContract, 'LandRegistry');
  try {
    const res = await landRegistryContract.getClaim(BigInt(claimId));
    const statusNum = Number(res.status);
    const ownerHash = res.ownerHash;
    if (!ownerHash || ownerHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    return {
      status: statusToString[statusNum] || 'Unknown',
      score: Number(res.score),
      ownerHash: res.ownerHash,
      evidenceHash: res.evidenceHash,
      lat: Number(res.latE6) / 1e6,
      lon: Number(res.lonE6) / 1e6
    };
  } catch (err) {
    if (err instanceof ChainError) throw err;
    handleChainError(err, landRegistryContract.interface);
  }
}

/**
 * createRelief(zoneHash, maxPerClaimWei, budgetWei, expiresAt) -> { reliefId, txHash }
 * Signer: admin, payable matching budgetWei
 */
async function createRelief(zoneHash, maxPerClaimWei, budgetWei, expiresAt = 0) {
  const validZoneHash = validateBytes32(zoneHash, 'zoneHash');
  const maxWei = BigInt(maxPerClaimWei.toString());
  const budget = BigInt(budgetWei.toString());
  const exp = BigInt(expiresAt.toString());

  if (process.env.CHAIN_MOCK === '1') {
    const reliefId = (mockState.nextReliefId++).toString();
    mockState.reliefs.set(reliefId, {
      reliefId,
      zoneHash: validZoneHash,
      maxPerClaimWei: maxWei,
      budgetWei: budget,
      expiresAt: exp
    });
    return { reliefId, txHash: generateMockTxHash() };
  }

  validateContract(reliefFundContract, 'ReliefFund');
  const signer = resolveSigner('admin');
  const contractWithSigner = reliefFundContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.createRelief(validZoneHash, maxWei, budget, exp, { value: budget });
      const receipt = await tx.wait();
      const event = parseLogFromReceipt(receipt, reliefFundContract.interface, 'ReliefCreated');
      const reliefId = event ? event.args.reliefId.toString() : '0';
      return { reliefId, txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, reliefFundContract.interface);
    }
  });
}

/**
 * fundRelief(reliefId, amountWei, signerParam) -> { txHash }
 */
async function fundRelief(reliefId, amountWei, signerParam = 'admin') {
  const amount = BigInt(amountWei.toString());

  if (process.env.CHAIN_MOCK === '1') {
    const rId = reliefId.toString();
    const relief = mockState.reliefs.get(rId);
    if (!relief) {
      throw new ChainError(`Relief with ID ${reliefId} not found`, 404);
    }
    relief.budgetWei += amount;
    return { txHash: generateMockTxHash() };
  }

  validateContract(reliefFundContract, 'ReliefFund');
  const signer = resolveSigner(signerParam);
  const contractWithSigner = reliefFundContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.fundRelief(BigInt(reliefId), { value: amount });
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, reliefFundContract.interface);
    }
  });
}

/**
 * assess(claimId, reliefId, damageLevel, damageEvidenceHash, signerParam) -> { txHash }
 */
async function assess(claimId, reliefId, damageLevel, damageEvidenceHash, signerParam = 'assessor') {
  const validEvidenceHash = validateBytes32(damageEvidenceHash, 'damageEvidenceHash');
  const level = Number(damageLevel);
  if (level < 1 || level > 4) {
    throw new ChainError('damageLevel must be between 1 and 4', 400);
  }

  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const rId = reliefId.toString();
    const claim = mockState.claims.get(cId);
    if (!claim) {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    const relief = mockState.reliefs.get(rId);
    if (!relief) {
      throw new ChainError(`Relief with ID ${reliefId} not found`, 404);
    }

    const assessorAddr = typeof signerParam === 'string' ? signerParam.toLowerCase() : getSignerAddress(signerParam);
    if (assessorAddr === 'unauthorized') {
      throw new ChainError('Caller is not an authorized assessor', 400);
    }

    if (claim.status !== 1) { // Verified
      throw new ChainError('Claim must be Verified to assess damage', 400);
    }

    const key = `${cId}-${rId}`;
    mockState.assessments.set(key, { damageLevel: level, damageEvidenceHash: validEvidenceHash });

    if (!mockState.payouts.has(key)) {
      mockState.payouts.set(key, { status: 1, amount: 0n, beneficiary: ethers.ZeroAddress, approvals: 0 }); // Assessed
    }
    return { txHash: generateMockTxHash() };
  }

  validateContract(reliefFundContract, 'ReliefFund');
  const signer = resolveSigner(signerParam);
  const contractWithSigner = reliefFundContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.assess(BigInt(claimId), BigInt(reliefId), level, validEvidenceHash);
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, reliefFundContract.interface);
    }
  });
}

/**
 * approvePayout(claimId, reliefId, amountWei, beneficiary, officerParam) -> { txHash }
 */
async function approvePayout(claimId, reliefId, amountWei, beneficiary, officerParam = 'officer1') {
  if (!ethers.isAddress(beneficiary)) {
    throw new ChainError(`Invalid beneficiary address: '${beneficiary}'`, 400);
  }
  const amount = BigInt(amountWei.toString());

  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const rId = reliefId.toString();
    const key = `${cId}-${rId}`;

    const relief = mockState.reliefs.get(rId);
    if (!relief) {
      throw new ChainError(`Relief with ID ${reliefId} not found`, 404);
    }

    if (amount > relief.maxPerClaimWei) {
      throw new ChainError(`Requested amount exceeds per-claim cap of ${relief.maxPerClaimWei.toString()}`, 400);
    }

    const officerAddr = getSignerAddress(officerParam);

    let appList = mockState.approvals.get(key) || [];
    if (appList.some(a => a.officer === officerAddr)) {
      throw new ChainError('Officer has already approved this payout', 400);
    }

    // Check if amount or beneficiary differs from prior approval -> reset approvals if mismatched
    if (appList.length > 0) {
      const prev = appList[0];
      if (prev.amount !== amount || prev.beneficiary.toLowerCase() !== beneficiary.toLowerCase()) {
        appList = []; // Reset approvals on mismatch
      }
    }

    appList.push({ officer: officerAddr, amount, beneficiary });
    mockState.approvals.set(key, appList);

    const payout = mockState.payouts.get(key) || { status: 0, amount: 0n, beneficiary, approvals: 0 };
    payout.approvals = appList.length;
    payout.amount = amount;
    payout.beneficiary = beneficiary;

    if (payout.approvals >= 2) {
      payout.status = 2; // Approved
    } else {
      if (payout.status < 2) payout.status = 1; // Assessed
    }

    mockState.payouts.set(key, payout);
    return { txHash: generateMockTxHash() };
  }

  validateContract(reliefFundContract, 'ReliefFund');
  const signer = resolveSigner(officerParam);
  const contractWithSigner = reliefFundContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.approvePayout(BigInt(claimId), BigInt(reliefId), amount, beneficiary);
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, reliefFundContract.interface);
    }
  });
}

/**
 * release(claimId, reliefId, signerParam) -> { txHash }
 */
async function release(claimId, reliefId, signerParam = 'admin') {
  if (process.env.CHAIN_MOCK === '1') {
    const cId = claimId.toString();
    const rId = reliefId.toString();
    const claim = mockState.claims.get(cId);
    if (!claim) {
      throw new ChainError(`Claim with ID ${claimId} not found`, 404);
    }
    if (claim.status === 2) {
      throw new ChainError('Cannot release payout on a Disputed claim', 400);
    }

    const key = `${cId}-${rId}`;
    const payout = mockState.payouts.get(key);
    if (!payout) {
      throw new ChainError('Payout record not found', 404);
    }

    if (payout.status === 3) {
      throw new ChainError('Payout has already been released (Paid)', 400);
    }
    if (payout.status !== 2) {
      throw new ChainError('Payout requires 2 officer approvals before release', 400);
    }

    payout.status = 3; // Paid
    mockState.payouts.set(key, payout);
    return { txHash: generateMockTxHash() };
  }

  validateContract(reliefFundContract, 'ReliefFund');
  const signer = resolveSigner(signerParam);
  const contractWithSigner = reliefFundContract.connect(signer);

  return enqueueWalletTx(await signer.getAddress(), async () => {
    try {
      const tx = await contractWithSigner.release(BigInt(claimId), BigInt(reliefId));
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    } catch (err) {
      handleChainError(err, reliefFundContract.interface);
    }
  });
}

/**
 * getPayout(claimId, reliefId) -> { status, amount, beneficiary, approvals }
 */
async function getPayout(claimId, reliefId) {
  if (process.env.CHAIN_MOCK === '1') {
    const key = `${claimId.toString()}-${reliefId.toString()}`;
    const payout = mockState.payouts.get(key) || { status: 0, amount: 0n, beneficiary: ethers.ZeroAddress, approvals: 0 };
    return {
      status: payoutToString[payout.status],
      amount: payout.amount.toString(),
      beneficiary: payout.beneficiary,
      approvals: payout.approvals
    };
  }

  validateContract(reliefFundContract, 'ReliefFund');
  try {
    const res = await reliefFundContract.getPayout(BigInt(claimId), BigInt(reliefId));
    const statusNum = Number(res.status);
    return {
      status: payoutToString[statusNum] || 'Unknown',
      amount: res.amount.toString(),
      beneficiary: res.beneficiary,
      approvals: Number(res.approvals)
    };
  } catch (err) {
    handleChainError(err, reliefFundContract.interface);
  }
}

module.exports = {
  ChainError,
  provider,
  signers,
  registerSigner,
  setContractAddresses,
  setProvider,
  statusToString,
  payoutToString,
  roleToNumber,
  validateBytes32,
  createClaim,
  attest,
  dispute,
  resolveDispute,
  getClaim,
  createRelief,
  fundRelief,
  assess,
  approvePayout,
  release,
  getPayout
};
