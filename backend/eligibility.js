// Note: Point values are illustrative; replace with official state schedule (e.g. SDRF norms).

const turf = require('@turf/turf');

/**
 * 1. Config: damage profiles (one standard, any disaster)
 * Each disaster = data, not code.
 */
const PROFILES = {
  flood: {
    criteria: {
      depth: { none: 0, low: 1, medium: 2, high: 3 },
      structure: { none: 0, partial: 2, major: 4 },
      duration: { short: 0, medium: 1, long: 2 },
      type: { pucca: 0, kutcha: 1 },
      contents: { none: 0, some: 1, all: 2 }
    },
    levels: [
      { min: 0, level: 1 },
      { min: 3, level: 2 },
      { min: 6, level: 3 },
      { min: 9, level: 4 }
    ]
  },
  earthquake: {
    criteria: {
      cracks: { none: 0, hairline: 1, wide: 3 },
      collapse: { none: 0, partial: 3, full: 5 },
      habitable: { yes: 0, no: 2 },
      type: { pucca: 0, kutcha: 1 }
    },
    levels: [
      { min: 0, level: 1 },
      { min: 2, level: 2 },
      { min: 5, level: 3 },
      { min: 8, level: 4 }
    ]
  }
};

/**
 * Basis points multiplier for damage levels 1 to 4:
 * Level 1: 25.00% (2500 bps)
 * Level 2: 50.00% (5000 bps)
 * Level 3: 75.00% (7500 bps)
 * Level 4: 100.00% (10000 bps)
 */
const MULTIPLIER_BPS = {
  1: 2500n,
  2: 5000n,
  3: 7500n,
  4: 10000n
};

/**
 * Helper to compute intersection between two polygons safely across Turf versions.
 */
function safeIntersect(polyA, polyB) {
  const fA = polyA.type === 'Feature' ? polyA : turf.feature(polyA);
  const fB = polyB.type === 'Feature' ? polyB : turf.feature(polyB);
  try {
    return turf.intersect(turf.featureCollection([fA, fB]));
  } catch {
    try {
      return turf.intersect(fA, fB);
    } catch {
      return null;
    }
  }
}

/**
 * Calculates damage level (1..4) based on disaster profile and assessor answers.
 * 
 * @param {string} disasterType - 'flood' | 'earthquake' etc.
 * @param {object} answers - Key-value map of criteria answers
 * @returns {number} Damage level (1, 2, 3, or 4)
 */
function damageLevel(disasterType, answers) {
  if (!disasterType || typeof disasterType !== 'string') {
    const err = new Error('Missing or invalid disasterType');
    err.status = 400;
    throw err;
  }

  const normalized = disasterType.toLowerCase();
  const profile = PROFILES[normalized];
  if (!profile) {
    const err = new Error(`Unknown disasterType '${disasterType}'. Available profiles: ${Object.keys(PROFILES).join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!answers || typeof answers !== 'object') {
    const err = new Error('Missing assessment answers object');
    err.status = 400;
    throw err;
  }

  let totalPoints = 0;
  for (const field of Object.keys(profile.criteria)) {
    if (!(field in answers)) {
      const err = new Error(`Missing required assessment field '${field}' for disaster '${disasterType}'`);
      err.status = 400;
      throw err;
    }

    const answerVal = answers[field];
    const fieldCriteria = profile.criteria[field];
    if (!(answerVal in fieldCriteria)) {
      const err = new Error(`Invalid answer value '${answerVal}' for field '${field}'. Allowed: ${Object.keys(fieldCriteria).join(', ')}`);
      err.status = 400;
      throw err;
    }

    totalPoints += fieldCriteria[answerVal];
  }

  // Pick highest level where totalPoints >= min
  let assignedLevel = profile.levels[0].level;
  for (const lvl of profile.levels) {
    if (totalPoints >= lvl.min) {
      assignedLevel = lvl.level;
    }
  }

  return assignedLevel;
}

/**
 * Checks whether a claim is eligible for a relief scheme.
 * Rule: true only if claim.status === 'Verified' AND claim NOT Disputed
 * AND claim reference point (lon, lat) inside relief.zone polygon (turf.booleanPointInPolygon).
 * 
 * @param {object} claim - Claim document
 * @param {object} relief - Relief event document
 * @returns {boolean}
 */
function isEligible(claim, relief) {
  if (!claim || !relief || !relief.zone) {
    return false;
  }

  // Must be Verified
  if (claim.status !== 'Verified') {
    return false;
  }

  // Must not be Disputed
  if (claim.status === 'Disputed' || claim.isDisputed === true || (claim.dispute && claim.dispute.isDisputed === true)) {
    return false;
  }

  // Extract reference coordinate [lon, lat]
  let refCoord = null;
  if (Array.isArray(claim.referencePoint) && claim.referencePoint.length >= 2) {
    refCoord = claim.referencePoint;
  } else if (Array.isArray(claim.point) && claim.point.length >= 2) {
    refCoord = claim.point;
  } else if (claim.lonE6 !== undefined && claim.latE6 !== undefined) {
    refCoord = [Number(claim.lonE6) / 1e6, Number(claim.latE6) / 1e6];
  } else if (Array.isArray(claim.coordinates) && typeof claim.coordinates[0] === 'number') {
    refCoord = claim.coordinates;
  } else if (claim.polygon && claim.polygon.coordinates && claim.polygon.coordinates[0] && claim.polygon.coordinates[0][0]) {
    refCoord = claim.polygon.coordinates[0][0];
  }

  if (!refCoord) {
    return false;
  }

  try {
    const point = turf.point([Number(refCoord[0]), Number(refCoord[1])]);
    const zoneFeature = relief.zone.type === 'Feature' ? relief.zone : turf.feature(relief.zone);
    return turf.booleanPointInPolygon(point, zoneFeature);
  } catch {
    return false;
  }
}

/**
 * Calculates affected parcel area in acres.
 * mode 'full': turf.area(claim.polygon) / 4046.86
 * mode 'intersect': area of turf.intersect(claim.polygon, relief.zone) / 4046.86. Return 0 if no intersection.
 * Default mode from env AREA_MODE, fallback 'full'.
 * If claim.confirmedAreaAcres set (assessor-confirmed), use it instead.
 * 
 * @param {object} claim - Claim object
 * @param {object} relief - Relief object
 * @param {string} [mode] - 'full' | 'intersect'
 * @returns {number} Area in acres
 */
function affectedAreaAcres(claim, relief, mode) {
  if (claim && claim.confirmedAreaAcres != null && claim.confirmedAreaAcres !== undefined) {
    return Number(claim.confirmedAreaAcres);
  }

  const activeMode = mode || process.env.AREA_MODE || 'full';

  if (!claim || !claim.polygon) {
    if (claim && claim.acres != null) return Number(claim.acres);
    if (claim && claim.parcelAreaAcres != null) return Number(claim.parcelAreaAcres);
    return 0;
  }

  if (activeMode === 'intersect') {
    if (!relief || !relief.zone) return 0;
    const intersection = safeIntersect(claim.polygon, relief.zone);
    if (!intersection) return 0;
    return turf.area(intersection) / 4046.86;
  }

  // Default mode 'full'
  const polyA = claim.polygon.type === 'Feature' ? claim.polygon : turf.feature(claim.polygon);
  return turf.area(polyA) / 4046.86;
}

/**
 * Computes compensation amount in wei strings using BigInt.
 * No floats for money:
 * areaM2x100 = BigInt(Math.round(areaM2 * 100))
 * raw = (areaM2x100 * BigInt(relief.ratePerAcre) * MULTIPLIER_BPS[level]) / (404686n * 10000n)
 * Multiply first, divide last. Cap at BigInt(relief.maxPerClaim). Return .toString().
 * 
 * @param {object} claim - Claim object
 * @param {object} relief - Relief event object
 * @param {number} damageLevel - Damage level (1..4)
 * @returns {string} Wei string
 */
function computeAmount(claim, relief, damageLevel) {
  if (!claim || !relief) return '0';

  let areaM2 = 0;
  if (claim.confirmedAreaAcres != null) {
    areaM2 = Number(claim.confirmedAreaAcres) * 4046.86;
  } else if (claim.acres != null) {
    areaM2 = Number(claim.acres) * 4046.86;
  } else if (claim.parcelAreaAcres != null && (!claim.polygon || !relief || !relief.zone)) {
    areaM2 = Number(claim.parcelAreaAcres) * 4046.86;
  } else if (claim.polygon) {
    const acres = affectedAreaAcres(claim, relief);
    areaM2 = acres * 4046.86;
  } else if (claim.parcelAreaAcres != null) {
    areaM2 = Number(claim.parcelAreaAcres) * 4046.86;
  }

  const areaM2x100 = BigInt(Math.round(areaM2 * 100));
  const rateWei = BigInt(String(relief.ratePerAcre || '0'));
  const level = Number(damageLevel);
  const multBps = MULTIPLIER_BPS[level] || 0n;

  let raw = (areaM2x100 * rateWei * multBps) / (404686n * 10000n);

  if (relief.maxPerClaim != null && relief.maxPerClaim !== undefined) {
    const cap = BigInt(String(relief.maxPerClaim));
    if (raw > cap) {
      raw = cap;
    }
  }

  return raw.toString();
}

/**
 * Scales compensation amounts proportionally to fit escrowed budget.
 * If total <= budget: scaleBps = 10000, scaled = amounts.
 * Else: scaleBps = budget * 10000 / total, scaled[i] = amount * scaleBps / 10000.
 * Sum of scaled must never exceed budget.
 * 
 * @param {string[]} amounts - Array of wei strings
 * @param {string|bigint} budgetWei - Total budget in wei string
 * @returns {{ scaled: string[], total: string, scaleBps: string }}
 */
function scaleToBudget(amounts, budgetWei) {
  if (!Array.isArray(amounts) || amounts.length === 0) {
    return {
      scaled: [],
      total: '0',
      scaleBps: '10000'
    };
  }

  const budget = BigInt(String(budgetWei || '0'));
  const bigAmounts = amounts.map(a => BigInt(String(a || '0')));
  const total = bigAmounts.reduce((sum, a) => sum + a, 0n);

  if (total <= budget) {
    return {
      scaled: amounts.map(a => String(a)),
      total: total.toString(),
      scaleBps: '10000'
    };
  }

  if (total === 0n) {
    return {
      scaled: amounts.map(() => '0'),
      total: '0',
      scaleBps: '10000'
    };
  }

  const scaleBps = (budget * 10000n) / total;
  let scaledBig = bigAmounts.map(amt => (amt * scaleBps) / 10000n);

  let sumScaled = scaledBig.reduce((sum, a) => sum + a, 0n);
  // Guarantee sum of scaled never exceeds budget
  if (sumScaled > budget) {
    let excess = sumScaled - budget;
    for (let i = 0; i < scaledBig.length && excess > 0n; i++) {
      if (scaledBig[i] >= excess) {
        scaledBig[i] -= excess;
        excess = 0n;
      } else {
        excess -= scaledBig[i];
        scaledBig[i] = 0n;
      }
    }
  }

  return {
    scaled: scaledBig.map(s => s.toString()),
    total: total.toString(),
    scaleBps: scaleBps.toString()
  };
}

module.exports = {
  PROFILES,
  MULTIPLIER_BPS,
  damageLevel,
  isEligible,
  affectedAreaAcres,
  computeAmount,
  scaleToBudget
};
