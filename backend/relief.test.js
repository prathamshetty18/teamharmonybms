const assert = require('assert');
const http = require('http');
const express = require('express');
const {
  createReliefRecord,
  getEligibleClaimsForRelief,
  getPayoutRecord,
  getVerificationCertificate
} = require('./relief');
const createClaimsRoutes = require('./routes/claimsRoutes');
const store = require('./store');
const { hashEvidence } = require('./utils/hash');

console.log('--- Starting Phase 4 Relief Module Unit & Integration Tests ---\n');

// Sample test zone in Bangalore (enclosing test claims 1 & 2)
const reliefZone = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5500, 12.9300],
      [77.6000, 12.9300],
      [77.6000, 12.9700],
      [77.5500, 12.9700],
      [77.5500, 12.9300]
    ]
  ]
};

async function runTests() {
  // ==============================================================
  // 1. Testing createReliefRecord()
  // ==============================================================
  console.log('1. Testing createReliefRecord()...');

  const reliefData = {
    name: 'Karnataka Flood Relief Scheme 2026',
    description: 'Emergency rehabilitation grant for Cauvery basin flash floods',
    disasterType: 'flood',
    zone: reliefZone,
    ratePerAcre: '500000000000000000', // 0.5 MST
    maxPerClaim: '5000000000000000000', // 5.0 MST
    budget: '10000000000000000000'      // 10.0 MST
  };

  const createdRelief = await createReliefRecord(reliefData);
  assert(createdRelief);
  assert(createdRelief.reliefId);
  assert.strictEqual(createdRelief.name, reliefData.name);
  assert.strictEqual(createdRelief.disasterType, 'flood');
  assert.strictEqual(createdRelief.ratePerAcre, '500000000000000000');
  assert.strictEqual(createdRelief.maxPerClaim, '5000000000000000000');
  assert.strictEqual(createdRelief.budget, '10000000000000000000');
  assert.strictEqual(createdRelief.remainingBudget, '10000000000000000000');
  assert(createdRelief.zoneHash.startsWith('0x'), 'zoneHash must be 0x-prefixed');
  assert.strictEqual(createdRelief.zoneHash.length, 66, 'zoneHash must be 64 hex chars + 0x (bytes32)');

  // Verify saved in Atlas
  const fromStore = await store.getById('reliefs', createdRelief.reliefId);
  assert(fromStore, 'Relief must be persisted in Atlas store');
  assert.strictEqual(fromStore.zoneHash, createdRelief.zoneHash);
  console.log('   ✓ createReliefRecord computed zoneHash:', createdRelief.zoneHash);
  console.log('   ✓ Relief saved to Atlas with full wei string parameters');

  // Validation rejections
  try {
    await createReliefRecord({ ...reliefData, zone: null });
    assert.fail('Should reject missing zone');
  } catch (err) {
    assert.strictEqual(err.status, 400);
    console.log('   ✓ Rejects missing zone with 400');
  }

  try {
    await createReliefRecord({ ...reliefData, budget: '100.5' });
    assert.fail('Should reject float budget');
  } catch (err) {
    assert.strictEqual(err.status, 400);
    console.log('   ✓ Rejects non-integer wei string with 400');
  }

  // ==============================================================
  // 2. Testing getEligibleClaimsForRelief()
  // ==============================================================
  console.log('\n2. Testing getEligibleClaimsForRelief()...');

  // Seed test claims:
  // Claim 101: Verified, undisputed, inside zone (Assessed with flood answers)
  const claim101 = {
    claimId: '101',
    ownerName: 'Basava Gowda',
    status: 'Verified',
    score: 6,
    parcelAreaAcres: 2.0,
    confirmedAreaAcres: 2.0,
    referencePoint: [77.5620, 12.9415], // Inside zone
    photos: ['/uploads/basava_survey.jpg'],
    polygon: {
      type: 'Polygon',
      coordinates: [[[77.561, 12.940], [77.563, 12.940], [77.563, 12.942], [77.561, 12.942], [77.561, 12.940]]]
    },
    evidenceHash: hashEvidence({
      photos: ['/uploads/basava_survey.jpg'],
      polygon: {
        type: 'Polygon',
        coordinates: [[[77.561, 12.940], [77.563, 12.940], [77.563, 12.942], [77.561, 12.942], [77.561, 12.940]]]
      },
      ownerName: 'Basava Gowda'
    })
  };
  await store.save('claims', claim101);

  // Claim 102: Verified, undisputed, inside zone (Unassessed)
  const claim102 = {
    claimId: '102',
    ownerName: 'Kavitha Hegde',
    status: 'Verified',
    score: 5,
    parcelAreaAcres: 3.0,
    referencePoint: [77.5650, 12.9430], // Inside zone
    polygon: {
      type: 'Polygon',
      coordinates: [[[77.564, 12.942], [77.566, 12.942], [77.566, 12.944], [77.564, 12.944], [77.564, 12.942]]]
    }
  };
  await store.save('claims', claim102);

  // Claim 103: Disputed, inside zone -> MUST BE EXCLUDED
  const claim103 = {
    claimId: '103',
    ownerName: 'Disputed Party',
    status: 'Disputed',
    dispute: { isDisputed: true },
    referencePoint: [77.5625, 12.9418],
    polygon: claim101.polygon
  };
  await store.save('claims', claim103);

  // Claim 104: Pending (unverified), inside zone -> MUST BE EXCLUDED
  const claim104 = {
    claimId: '104',
    ownerName: 'Pending Claimant',
    status: 'Pending',
    score: 2,
    referencePoint: [77.5630, 12.9420],
    polygon: claim101.polygon
  };
  await store.save('claims', claim104);

  // Seed payout assessment for Claim 101:
  // Answers: depth=high(3), structure=major(4) -> 7 points = damageLevel 3 (75% = 7500 BPS)
  // Rate: 0.5 MST (500000000000000000 wei) * 2 acres * 75% = 0.75 MST (750000000000000000 wei)
  await store.save('payouts', {
    claimId: '101',
    reliefId: createdRelief.reliefId,
    status: 'Assessed',
    damageLevel: 3,
    answers: { depth: 'high', structure: 'major', duration: 'short', type: 'pucca', contents: 'none' },
    amount: '750000000000000000'
  });

  const eligibleResult = await getEligibleClaimsForRelief(createdRelief.reliefId);
  assert(eligibleResult.relief);
  assert(Array.isArray(eligibleResult.claims));

  const eligibleIds = eligibleResult.claims.map(c => c.claimId);
  assert(eligibleIds.includes('101'), 'Claim 101 should be eligible');
  assert(eligibleIds.includes('102'), 'Claim 102 should be eligible');
  assert(!eligibleIds.includes('103'), 'Disputed Claim 103 must be excluded');
  assert(!eligibleIds.includes('104'), 'Pending Claim 104 must be excluded');
  console.log('   ✓ filter: Only Verified, non-Disputed claims in zone are eligible');

  // Verify Assessed claim 101
  const item101 = eligibleResult.claims.find(c => c.claimId === '101');
  assert.strictEqual(item101.damageLevel, 3);
  assert.strictEqual(item101.payoutStatus, 'Assessed');
  assert.strictEqual(item101.amount, '750000000000000000');
  console.log('   ✓ Assessed claim 101 computed amount:', item101.amount, 'wei (damageLevel 3)');

  // Verify Unassessed claim 102
  const item102 = eligibleResult.claims.find(c => c.claimId === '102');
  assert.strictEqual(item102.damageLevel, null);
  assert.strictEqual(item102.payoutStatus, 'None');
  assert.strictEqual(item102.amount, '0');
  console.log('   ✓ Unassessed claim 102 returns amount "0" and payoutStatus "None"');

  // Verify scaleToBudget properties
  assert(eligibleResult.totalNeeded != null);
  assert(eligibleResult.budget != null);
  assert(eligibleResult.scaleBps != null);
  assert(eligibleResult.shortfall != null);
  console.log(`   ✓ scaleToBudget output: totalNeeded=${eligibleResult.totalNeeded}, budget=${eligibleResult.budget}, scaleBps=${eligibleResult.scaleBps}, shortfall=${eligibleResult.shortfall}`);

  // ==============================================================
  // 3. Testing getPayoutRecord()
  // ==============================================================
  console.log('\n3. Testing getPayoutRecord()...');

  const unassessedPayout = await getPayoutRecord('102');
  assert.strictEqual(unassessedPayout.status, 'None');
  assert.strictEqual(unassessedPayout.amount, '0');
  console.log('   ✓ getPayoutRecord for unassessed claim returns status: "None", amount: "0"');

  const assessedPayout = await getPayoutRecord('101');
  assert.strictEqual(assessedPayout.status, 'Assessed');
  assert.strictEqual(assessedPayout.amount, '750000000000000000');
  console.log('   ✓ getPayoutRecord for assessed claim returns status: "Assessed", amount in wei');

  // ==============================================================
  // 4. Testing getVerificationCertificate()
  // ==============================================================
  console.log('\n4. Testing getVerificationCertificate()...');

  const cert = await getVerificationCertificate('101');
  assert.strictEqual(cert.claimId, '101');
  assert.strictEqual(cert.status, 'Verified');
  assert.strictEqual(cert.payoutStatus, 'Assessed');
  assert.strictEqual(cert.isEvidenceValid, true);
  assert.strictEqual(cert.qrTargetUrl, '/verify/101');
  console.log('   ✓ getVerificationCertificate returns claim status, evidence hash check, payout status');

  // ==============================================================
  // 5. Testing HTTP Routes Integration
  // ==============================================================
  console.log('\n5. Testing Phase 4 HTTP Routes Integration...');

  const chainCreateReliefCalls = [];
  const mockChain = {
    async createRelief(zoneHash, maxPerClaim, budget) {
      chainCreateReliefCalls.push({ zoneHash, maxPerClaim, budget });
      return { txHash: '0xmockcreaterelieftx' };
    }
  };

  const app = express();
  app.use(express.json());
  app.use('/', createClaimsRoutes(null, mockChain));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5004, resolve));
  const baseUrl = 'http://localhost:5004';

  try {
    // 5.1 POST /reliefs
    const postReliefRes = await fetch(`${baseUrl}/reliefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HTTP Test Relief Event',
        zone: reliefZone,
        ratePerAcre: '1000000000000000000',
        maxPerClaim: '5000000000000000000',
        budget: '50000000000000000000'
      })
    });

    assert.strictEqual(postReliefRes.status, 201);
    const postReliefJson = await postReliefRes.json();
    assert(postReliefJson.reliefId);
    assert(postReliefJson.zoneHash);
    assert.strictEqual(chainCreateReliefCalls.length, 1);
    assert.strictEqual(chainCreateReliefCalls[0].zoneHash, postReliefJson.zoneHash);
    console.log('   ✓ POST /reliefs: saved to Atlas and bridged to chain.createRelief');

    // 5.2 GET /reliefs
    const getReliefsRes = await fetch(`${baseUrl}/reliefs`);
    assert.strictEqual(getReliefsRes.status, 200);
    const getReliefsJson = await getReliefsRes.json();
    assert(Array.isArray(getReliefsJson));
    assert(getReliefsJson.length >= 1);
    console.log(`   ✓ GET /reliefs: returned ${getReliefsJson.length} relief scheme(s)`);

    // 5.3 GET /reliefs/:id/eligible
    const getEligibleRes = await fetch(`${baseUrl}/reliefs/${createdRelief.reliefId}/eligible`);
    assert.strictEqual(getEligibleRes.status, 200);
    const getEligibleJson = await getEligibleRes.json();
    assert(getEligibleJson.relief);
    assert(Array.isArray(getEligibleJson.claims));
    assert(getEligibleJson.totalNeeded != null);
    assert(getEligibleJson.budget != null);
    assert(getEligibleJson.scaleBps != null);
    assert(getEligibleJson.shortfall != null);
    console.log('   ✓ GET /reliefs/:id/eligible: verified full return structure matching spec');

    // 5.4 GET /claims/:id/payout
    const getPayoutRes = await fetch(`${baseUrl}/claims/101/payout`);
    assert.strictEqual(getPayoutRes.status, 200);
    const getPayoutJson = await getPayoutRes.json();
    assert.strictEqual(getPayoutJson.status, 'Assessed');
    assert.strictEqual(getPayoutJson.amount, '750000000000000000');
    console.log('   ✓ GET /claims/:id/payout: returned assessed payout record');

    // 5.5 GET /verify/:id
    const getVerifyRes = await fetch(`${baseUrl}/verify/101`);
    assert.strictEqual(getVerifyRes.status, 200);
    const getVerifyJson = await getVerifyRes.json();
    assert.strictEqual(getVerifyJson.claimId, '101');
    assert.strictEqual(getVerifyJson.status, 'Verified');
    assert.strictEqual(getVerifyJson.payoutStatus, 'Assessed');
    assert.strictEqual(getVerifyJson.isEvidenceValid, true);
    console.log('   ✓ GET /verify/:id: returned valid QR certificate view with recomputed hash');
  } finally {
    server.close();
  }
}

runTests().then(() => {
  console.log('\n======================================================');
  console.log('ALL PHASE 4 RELIEF MODULE TESTS PASSED! (100%)');
  console.log('======================================================\n');
}).catch(err => {
  console.error('\n❌ PHASE 4 TEST FAILED:', err);
  process.exit(1);
});
