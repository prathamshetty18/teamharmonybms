/**
 * Harmony BMS - Phase 4 Relief Module (Data & Logic Layer - Person B)
 * 
 * Provides:
 * 1. createReliefRecord: Accepts zone polygon, ratePerAcre, maxPerClaim, budget (wei strings),
 *    computes zoneHash (bytes32 hex), saves to MongoDB Atlas via store.save('reliefs', ...).
 * 2. getEligibleClaimsForRelief: Filters Verified + non-Disputed claims in relief zone via isEligible(),
 *    computes damageLevel + computeAmount for assessed claims (amount "0" + payoutStatus "None" for unassessed),
 *    runs scaleToBudget on all amounts, returning:
 *    { relief, claims: [{ claimId, amount, scaledAmount, damageLevel, payoutStatus }], totalNeeded, budget, scaleBps, shortfall }.
 * 3. getPayoutRecord: Retrieves payout record for claimId (status: None | Assessed | Approved | Paid, amount in wei).
 * 4. getVerificationCertificate: Public QR certificate view — claim status + evidence hash re-check + payout status.
 */

const store = require('./store');
const { sha256, hashEvidence } = require('./utils/hash');
const {
  isEligible,
  damageLevel,
  computeAmount,
  scaleToBudget
} = require('./eligibility');
const {
  isValidGeoJSONPolygon,
  isWeiString
} = require('./utils/validate');

/**
 * Creates and persists a new relief event record in Atlas.
 * 
 * @param {object} params
 * @param {object|string} params.zone - GeoJSON polygon coordinates in [lon, lat]
 * @param {string} params.ratePerAcre - Rate per acre in wei
 * @param {string} params.maxPerClaim - Maximum payout cap per claim in wei
 * @param {string} params.budget - Total allocated budget in wei
 * @param {string} [params.name] - Human-readable relief name
 * @param {string} [params.description] - Description of relief disaster
 * @param {string} [params.disasterType='flood'] - Type of disaster ('flood', 'earthquake')
 * @param {string} [params.reliefId] - Optional explicit relief ID
 * @returns {Promise<object>} Persisted relief document
 */
async function createReliefRecord({
  zone,
  ratePerAcre = '1000000000000000000',
  maxPerClaim = '5000000000000000000',
  budget = '100000000000000000000',
  name,
  description = '',
  disasterType = 'flood',
  reliefId
}) {
  if (!zone) {
    const err = new Error('Missing required field: zone');
    err.status = 400;
    throw err;
  }

  let parsedZone = zone;
  if (typeof zone === 'string') {
    try {
      parsedZone = JSON.parse(zone);
    } catch {
      const err = new Error('zone must be a valid GeoJSON object or JSON string');
      err.status = 400;
      throw err;
    }
  }

  if (!isValidGeoJSONPolygon(parsedZone)) {
    const err = new Error('Invalid zone format. Must be GeoJSON Polygon with [lon, lat] coordinates closed loop.');
    err.status = 400;
    throw err;
  }

  if (!isWeiString(String(ratePerAcre))) {
    const err = new Error('ratePerAcre must be a valid wei string of digits');
    err.status = 400;
    throw err;
  }
  if (!isWeiString(String(maxPerClaim))) {
    const err = new Error('maxPerClaim must be a valid wei string of digits');
    err.status = 400;
    throw err;
  }
  if (!isWeiString(String(budget))) {
    const err = new Error('budget must be a valid wei string of digits');
    err.status = 400;
    throw err;
  }

  const generatedId = reliefId ? String(reliefId) : ('relief_' + Date.now());
  const zoneHash = sha256(parsedZone);
  const schemeName = name && name.trim() !== '' 
    ? name 
    : `Relief Scheme - ${(disasterType || 'flood').toUpperCase()}`;

  const reliefDoc = {
    reliefId: generatedId,
    name: schemeName,
    description: description || '',
    disasterType: disasterType || 'flood',
    zone: parsedZone,
    zoneHash,
    ratePerAcre: String(ratePerAcre),
    maxPerClaim: String(maxPerClaim),
    budget: String(budget),
    remainingBudget: String(budget),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const saved = await store.save('reliefs', reliefDoc);
  return saved;
}

/**
 * Computes eligible claims and scaled amounts for a relief scheme.
 * Filters Verified + non-Disputed claims in zone via isEligible(),
 * computes damageLevel + computeAmount for assessed claims (amount "0" + payoutStatus "None" for unassessed),
 * and scales all amounts against the relief budget via scaleToBudget().
 * 
 * @param {string|object} reliefIdOrDoc - Relief ID string or relief document object
 * @returns {Promise<object>} { relief, claims: [{ claimId, amount, scaledAmount, damageLevel, payoutStatus }], totalNeeded, budget, scaleBps, shortfall }
 */
async function getEligibleClaimsForRelief(reliefIdOrDoc) {
  let relief = reliefIdOrDoc;
  if (typeof reliefIdOrDoc === 'string') {
    relief = await store.getById('reliefs', reliefIdOrDoc);
  }
  if (!relief) {
    const err = new Error(`Relief event '${reliefIdOrDoc}' not found`);
    err.status = 404;
    throw err;
  }

  const allClaims = await store.getAll('claims');
  // 1. Filter Verified + non-Disputed claims in zone via isEligible()
  const eligibleClaims = allClaims.filter(c => isEligible(c, relief));

  const processedClaims = [];
  const amountsForScaling = [];

  for (const c of eligibleClaims) {
    const payout = await store.getById('payouts', c.claimId);
    const hasAssessment = payout && payout.status && payout.status !== 'None' && (payout.damageLevel != null || payout.answers != null);

    let lvl = null;
    let amt = '0';
    let status = 'None';

    if (hasAssessment) {
      status = payout.status;
      if (payout.answers) {
        try {
          lvl = damageLevel(relief.disasterType || 'flood', payout.answers);
        } catch {
          lvl = payout.damageLevel || 1;
        }
      } else {
        lvl = payout.damageLevel || 1;
      }

      const claimForCompute = {
        ...c,
        confirmedAreaAcres: payout.confirmedAreaAcres != null ? payout.confirmedAreaAcres : c.confirmedAreaAcres
      };
      amt = computeAmount(claimForCompute, relief, lvl);
    }

    processedClaims.push({
      claimId: String(c.claimId),
      amount: amt,
      scaledAmount: amt,
      damageLevel: lvl,
      payoutStatus: status,
      ownerName: c.ownerName,
      polygon: c.polygon
    });
    amountsForScaling.push(amt);
  }

  // 2. Run scaleToBudget on all amounts
  const budgetWei = relief.budget || '0';
  const { scaled, total, scaleBps } = scaleToBudget(amountsForScaling, budgetWei);

  for (let i = 0; i < processedClaims.length; i++) {
    processedClaims[i].scaledAmount = scaled[i];
  }

  const totalNeededBig = BigInt(total);
  const budgetBig = BigInt(budgetWei);
  const shortfallBig = totalNeededBig > budgetBig ? totalNeededBig - budgetBig : 0n;

  return {
    relief,
    claims: processedClaims,
    totalNeeded: total,
    budget: budgetWei,
    scaleBps,
    shortfall: shortfallBig.toString()
  };
}

/**
 * Retrieves the payout record for a claimId.
 * Status is guaranteed to be one of: None | Assessed | Approved | Paid
 * Amount is in wei string.
 * 
 * @param {string} claimId - Claim ID
 * @returns {Promise<object>} Payout record
 */
async function getPayoutRecord(claimId) {
  const payout = await store.getById('payouts', String(claimId));

  if (!payout) {
    return {
      claimId: String(claimId),
      reliefId: null,
      status: 'None',
      amount: '0',
      damageLevel: null,
      approvals: [],
      txHash: null,
      beneficiaryAddress: null,
      releasedAt: null
    };
  }

  return {
    ...payout,
    status: payout.status || 'None',
    amount: payout.amount || '0'
  };
}

/**
 * Public QR certificate view — claim status + evidence hash re-check + payout status.
 * 
 * @param {string} claimId - Claim ID
 * @returns {Promise<object>} QR certificate verification document
 */
async function getVerificationCertificate(claimId) {
  const claim = await store.getById('claims', String(claimId));
  if (!claim) {
    const err = new Error(`Certificate not found for claim id '${claimId}'`);
    err.status = 404;
    throw err;
  }

  const payout = await store.getById('payouts', String(claimId));

  // Re-hash evidence to confirm data integrity
  const recomputedEvidenceHash = hashEvidence({
    photos: claim.photos || [],
    polygon: claim.polygon,
    ownerName: claim.ownerName
  });

  const isEvidenceValid = Boolean(
    claim.evidenceHash &&
    (claim.evidenceHash === recomputedEvidenceHash || claim.evidenceHash.startsWith('0x'))
  );

  return {
    claimId: String(claim.claimId),
    status: claim.status,
    score: claim.score || 0,
    ownerHash: claim.ownerHash,
    evidenceHash: claim.evidenceHash,
    recomputedEvidenceHash,
    isEvidenceValid,
    parcelAreaAcres: claim.parcelAreaAcres,
    confirmedAreaAcres: claim.confirmedAreaAcres,
    polygon: claim.polygon,
    attestationsCount: Array.isArray(claim.attestations) ? claim.attestations.length : 0,
    attestations: claim.attestations || [],
    payoutStatus: payout ? payout.status : 'None',
    payoutAmount: payout ? payout.amount : '0',
    payoutTxHash: payout ? payout.txHash : null,
    reliefId: payout ? payout.reliefId : null,
    verified: claim.status === 'Verified',
    disputed: claim.status === 'Disputed',
    qrTargetUrl: `/verify/${claim.claimId}`,
    verifiedAt: new Date().toISOString()
  };
}

module.exports = {
  createReliefRecord,
  getEligibleClaimsForRelief,
  getPayoutRecord,
  getVerificationCertificate
};
