const assert = require('assert');
const turf = require('@turf/turf');
const {
  PROFILES,
  MULTIPLIER_BPS,
  damageLevel,
  isEligible,
  affectedAreaAcres,
  computeAmount,
  scaleToBudget
} = require('./eligibility');

console.log('--- Starting Eligibility & Relief Engine Unit Tests ---\n');

// 1. damageLevel Tests
console.log('1. Testing damageLevel()...');

// 1.1 Flood example from prompt:
// depth medium(2) + structure partial(2) + type kutcha(1) + duration medium(1) + contents some(1) = 7 -> level 3
const floodAnswers = {
  depth: 'medium',
  structure: 'partial',
  type: 'kutcha',
  duration: 'medium',
  contents: 'some'
};
const floodLvl = damageLevel('flood', floodAnswers);
assert.strictEqual(floodLvl, 3, `Expected flood level 3, got ${floodLvl}`);
console.log('   ✓ Flood example 7 points -> level 3');

// 1.2 Invalid answer throws (status 400)
assert.throws(
  () => {
    damageLevel('flood', { ...floodAnswers, depth: 'super_high' });
  },
  (err) => {
    assert.strictEqual(err.status, 400);
    assert(err.message.includes('Invalid answer value'));
    return true;
  },
  'Should throw 400 on invalid answer value'
);
console.log('   ✓ Invalid answer value throws 400');

// Missing field throws (status 400)
assert.throws(
  () => {
    const incomplete = { ...floodAnswers };
    delete incomplete.structure;
    damageLevel('flood', incomplete);
  },
  (err) => {
    assert.strictEqual(err.status, 400);
    assert(err.message.includes('Missing required assessment field'));
    return true;
  },
  'Should throw 400 on missing criteria field'
);
console.log('   ✓ Missing assessment field throws 400');

// 1.3 Unknown disaster throws (status 400)
assert.throws(
  () => {
    damageLevel('tornado', { winds: 'strong' });
  },
  (err) => {
    assert.strictEqual(err.status, 400);
    assert(err.message.includes('Unknown disasterType'));
    return true;
  },
  'Should throw 400 on unknown disasterType'
);
console.log('   ✓ Unknown disasterType throws 400');

// 1.4 Earthquake profile works with same function
// cracks wide(3) + collapse full(5) + habitable no(2) + type kutcha(1) = 11 -> level 4 (min 8)
const eqAnswersHigh = {
  cracks: 'wide',
  collapse: 'full',
  habitable: 'no',
  type: 'kutcha'
};
assert.strictEqual(damageLevel('earthquake', eqAnswersHigh), 4);

// cracks none(0) + collapse none(0) + habitable yes(0) + type pucca(0) = 0 -> level 1
const eqAnswersLow = {
  cracks: 'none',
  collapse: 'none',
  habitable: 'yes',
  type: 'pucca'
};
assert.strictEqual(damageLevel('earthquake', eqAnswersLow), 1);

// cracks hairline(1) + collapse partial(3) + habitable yes(0) + type pucca(0) = 4 -> level 2 (min 2, < min 5)
const eqAnswersMed = {
  cracks: 'hairline',
  collapse: 'partial',
  habitable: 'yes',
  type: 'pucca'
};
assert.strictEqual(damageLevel('earthquake', eqAnswersMed), 2);
console.log('   ✓ Earthquake profile works seamlessly with damageLevel()');

// 2. isEligible Tests
console.log('2. Testing isEligible()...');
// Reference zone: Box between lon 77.5-77.7 and lat 12.9-13.1
const reliefZone = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5, 12.9],
      [77.7, 12.9],
      [77.7, 13.1],
      [77.5, 13.1],
      [77.5, 12.9]
    ]
  ]
};
const mockRelief = {
  reliefId: 'relief_flood',
  zone: reliefZone
};

// 2.1 Verified inside zone -> true
const verifiedClaimInside = {
  claimId: '101',
  status: 'Verified',
  dispute: null,
  referencePoint: [77.6, 13.0] // inside zone
};
assert.strictEqual(isEligible(verifiedClaimInside, mockRelief), true);
console.log('   ✓ Verified inside zone -> true');

// 2.2 Pending inside zone -> false
const pendingClaim = {
  claimId: '102',
  status: 'Pending',
  dispute: null,
  referencePoint: [77.6, 13.0]
};
assert.strictEqual(isEligible(pendingClaim, mockRelief), false);
console.log('   ✓ Pending -> false');

// 2.3 Disputed inside zone -> false
const disputedClaim1 = {
  claimId: '103',
  status: 'Disputed',
  dispute: null,
  referencePoint: [77.6, 13.0]
};
assert.strictEqual(isEligible(disputedClaim1, mockRelief), false);

const disputedClaim2 = {
  claimId: '104',
  status: 'Verified',
  dispute: { isDisputed: true },
  referencePoint: [77.6, 13.0]
};
assert.strictEqual(isEligible(disputedClaim2, mockRelief), false);
console.log('   ✓ Disputed -> false');

// 2.4 Outside zone -> false
const outsideClaim = {
  claimId: '105',
  status: 'Verified',
  dispute: null,
  referencePoint: [78.5, 14.0] // outside zone
};
assert.strictEqual(isEligible(outsideClaim, mockRelief), false);
console.log('   ✓ Outside zone -> false');

// 3. affectedAreaAcres Tests
console.log('3. Testing affectedAreaAcres()...');
// Construct parcel half inside zone:
// Zone: lon 77.5 to 77.7, lat 12.9 to 13.1
// Parcel: lon 77.6 to 77.8, lat 12.9 to 13.1 (spans 0.2 lon, half of which is 77.6 to 77.7 in zone)
const halfParcel = {
  type: 'Polygon',
  coordinates: [
    [
      [77.6, 12.9],
      [77.8, 12.9],
      [77.8, 13.1],
      [77.6, 13.1],
      [77.6, 12.9]
    ]
  ]
};
const fullArea = affectedAreaAcres({ polygon: halfParcel }, mockRelief, 'full');
const intersectArea = affectedAreaAcres({ polygon: halfParcel }, mockRelief, 'intersect');
assert(fullArea > 0);
assert(intersectArea > 0);
const ratio = intersectArea / fullArea;
assert(Math.abs(ratio - 0.5) < 0.01, `Expected intersect ~ half (ratio 0.5), got ${ratio}`);
console.log(`   ✓ Full area: ${fullArea.toFixed(2)} acres, Intersect: ${intersectArea.toFixed(2)} acres (Ratio: ${ratio.toFixed(4)} ~ 0.5)`);

// Test confirmedAreaAcres override
const confirmedTest = affectedAreaAcres({ polygon: halfParcel, confirmedAreaAcres: 4.25 }, mockRelief);
assert.strictEqual(confirmedTest, 4.25);
console.log('   ✓ confirmedAreaAcres overrides calculation');

// 4. computeAmount Tests
console.log('4. Testing computeAmount()...');
// 4.1 "2 acres, rate 0.5 MST, level 3 -> 0.75 MST (wei string)"
const testRelief = {
  ratePerAcre: '500000000000000000', // 0.5 MST
  maxPerClaim: '5000000000000000000'  // 5 MST
};
const testClaim2Acres = { acres: 2 };
const amt2Acres = computeAmount(testClaim2Acres, testRelief, 3);
assert.strictEqual(typeof amt2Acres, 'string', 'Must return a string');
assert.strictEqual(amt2Acres, '750000000000000000', `Expected 750000000000000000, got ${amt2Acres}`);
console.log(`   ✓ 2 acres, rate 0.5 MST, level 3 -> ${amt2Acres} wei (0.75 MST)`);

// 4.2 Cap test: 10 acres, rate 1 MST -> raw = 10 MST, capped at maxPerClaim 5 MST
const capRelief = {
  ratePerAcre: '1000000000000000000', // 1 MST
  maxPerClaim: '5000000000000000000'  // 5 MST
};
const testClaim10Acres = { acres: 10 };
const amt10Acres = computeAmount(testClaim10Acres, capRelief, 4); // level 4 = 100%
assert.strictEqual(amt10Acres, '5000000000000000000', 'Should cap at maxPerClaim');
console.log('   ✓ 10 acres capped at maxPerClaim (5000000000000000000)');

// 4.3 No float artifacts (must be pure numeric digits)
assert(/^[0-9]+$/.test(amt2Acres), 'Must contain only digits, no decimal points');
assert(!amt2Acres.includes('.'), 'No float decimals in wei string');
console.log('   ✓ computeAmount returns pure wei string with no float artifacts');

// 5. scaleToBudget Tests
console.log('5. Testing scaleToBudget()...');
// 5.1 "scaleToBudget: total 150, budget 100 -> scaleBps ~6666, sum(scaled) <= 100. Under budget -> unchanged."
const amounts150 = ['50', '50', '50'];
const scaledResult = scaleToBudget(amounts150, '100');
assert.strictEqual(scaledResult.scaleBps, '6666');
assert.strictEqual(scaledResult.total, '150');
const sumScaled = scaledResult.scaled.reduce((sum, a) => sum + BigInt(a), 0n);
assert(sumScaled <= 100n, `Sum of scaled (${sumScaled}) must never exceed budget 100`);
console.log(`   ✓ total 150, budget 100 -> scaleBps ${scaledResult.scaleBps}, sum: ${sumScaled} <= 100`);

// Under budget -> unchanged
const amountsUnder = ['20', '30', '40']; // total 90 <= 100
const scaledUnder = scaleToBudget(amountsUnder, '100');
assert.strictEqual(scaledUnder.scaleBps, '10000');
assert.deepStrictEqual(scaledUnder.scaled, amountsUnder);
console.log('   ✓ Under budget -> unchanged (scaleBps 10000)');

// 5.2 100 claims stress test: sum(scaled) <= budget
const budgetStress = '100000000000000000000'; // 100 MST in wei
// 100 claims each requesting 5 MST -> total 500 MST
const amountsStress = Array(100).fill('5000000000000000000');
const stressResult = scaleToBudget(amountsStress, budgetStress);
const sumStressScaled = stressResult.scaled.reduce((sum, a) => sum + BigInt(a), 0n);
assert(sumStressScaled <= BigInt(budgetStress), `Stress test sum (${sumStressScaled}) exceeded budget (${budgetStress})`);
assert.strictEqual(stressResult.scaleBps, '2000'); // 100 / 500 * 10000 = 2000
console.log(`   ✓ 100 claims stress: sum(scaled) ${sumStressScaled} <= budget ${budgetStress}`);

console.log('\n======================================================');
console.log('ALL ELIGIBILITY & BUDGET TESTS PASSED SUCCESSFULLY! (100%)');
console.log('======================================================\n');
