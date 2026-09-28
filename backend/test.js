process.env.NODE_ENV = 'test';
process.env.PORT = '5001';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const { sha256, sha256Hex, hashOwner, hashEvidence, generateTxHash } = require('./utils/hash');
const { isWeiString, isValidGeoJSONPolygon } = require('./utils/validate');
const store = require('./store');
const db = require('./db');

async function runTests() {
  console.log('--- Starting Harmony BMS Backend Data Layer Tests ---\n');

  // 1. Hash tests
  console.log('1. Testing utils/hash.js...');
  const h1 = sha256('hello');
  assert(h1.startsWith('0x'), 'sha256 should be 0x-prefixed');
  assert.strictEqual(h1.length, 66, '0x + 64 hex chars');

  const hHex = sha256Hex('hello');
  assert(!hHex.startsWith('0x'), 'sha256Hex should not have 0x prefix');
  assert.strictEqual(hHex.length, 64, 'sha256Hex should be 64 chars');

  const ownerH = hashOwner('AADHAAR-1234');
  assert(ownerH.startsWith('0x'));

  const evidenceH = hashEvidence({ photos: ['img1.jpg'], polygon: {} });
  assert(evidenceH.startsWith('0x'));

  const txH = generateTxHash();
  assert(txH.startsWith('0x') && txH.length === 66);
  console.log('   ✓ Hashing utilities verified');

  // 2. Validation tests
  console.log('2. Testing utils/validate.js...');
  assert.strictEqual(isWeiString('1000000000000000000'), true);
  assert.strictEqual(isWeiString('0'), true);
  assert.strictEqual(isWeiString('-100'), false);
  assert.strictEqual(isWeiString('abc'), false);
  assert.strictEqual(isWeiString('12.5'), false);

  const validPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.5660, 12.9405],
        [77.5680, 12.9405],
        [77.5680, 12.9425],
        [77.5660, 12.9425],
        [77.5660, 12.9405]
      ]
    ]
  };
  assert.strictEqual(isValidGeoJSONPolygon(validPolygon), true);
  assert.strictEqual(isValidGeoJSONPolygon({ type: 'Point' }), false);
  console.log('   ✓ Validation utilities verified');

  // 3. Store and DB tests
  console.log('3. Testing db.js and store.js interface...');
  assert(typeof db.getAll === 'function', 'db should export getAll');
  assert(typeof db.getById === 'function', 'db should export getById');
  assert(typeof db.save === 'function', 'db should export save');
  assert(typeof db.update === 'function', 'db should export update');

  const allClaims = await store.claims.getAll();
  assert(allClaims.length >= 3, 'Should have initial seed claims');
  const claim1 = await store.claims.getById('1');
  assert.strictEqual(claim1.claimId, '1', 'Primary ID is on-chain claimId');
  assert.strictEqual(claim1.status, 'Verified');
  assert(isValidGeoJSONPolygon(claim1.polygon), 'Claim polygon must be valid GeoJSON [lon, lat]');

  const allReliefs = await store.reliefs.getAll();
  assert(allReliefs.length >= 2, 'Should have initial seed reliefs');
  const relief1 = await store.reliefs.getById('relief_flood_2026');
  assert(isWeiString(relief1.budget), 'Relief budget must be wei string');
  assert(isWeiString(relief1.maxPerClaim), 'Relief maxPerClaim must be wei string');

  const payout1 = await store.payouts.getById('1');
  assert(payout1 !== null);
  assert.strictEqual(payout1.status, 'Paid');
  assert(isWeiString(payout1.amount), 'Payout amount must be wei string');
  console.log('   ✓ Store and DB interface verified');

  // 4. Server and Route Endpoint tests
  console.log('4. Testing Server and 14 REST Endpoints...');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5001, resolve));
  const baseUrl = 'http://localhost:5001';

  try {
    // 4.1 POST /claims (Non-overlapping -> Pending)
    console.log('   -> POST /claims (non-overlapping)');
    const createClaimRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName: 'Sunita Rao',
        nationalId: 'IND-KA-560019-9999',
        polygon: validPolygon,
        parcelAreaAcres: 1.5,
        notes: 'Farmland in disaster area'
      })
    });
    assert.strictEqual(createClaimRes.status, 201);
    const createdClaim = await createClaimRes.json();
    assert(createdClaim.claimId);
    assert.strictEqual(createdClaim.status, 'Pending');
    assert.strictEqual(createdClaim.score, 0);

    // Overlapping claim -> Auto-disputed
    console.log('   -> POST /claims (overlapping -> auto-disputed)');
    const overlappingCandidate = {
      type: 'Polygon',
      coordinates: [
        [
          [77.5615, 12.9410],
          [77.5625, 12.9410],
          [77.5625, 12.9420],
          [77.5615, 12.9420],
          [77.5615, 12.9410]
        ]
      ]
    };
    const overlapClaimRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName: 'Conflicting Claimant',
        polygon: overlappingCandidate,
        parcelAreaAcres: 1.0
      })
    });
    assert.strictEqual(overlapClaimRes.status, 201);
    const overlapClaimJson = await overlapClaimRes.json();
    assert.strictEqual(overlapClaimJson.status, 'Disputed');
    assert(overlapClaimJson.dispute.isDisputed);
    console.log('   ✓ Overlapping submission automatically routed to Disputed');

    // POST /claims/check-overlap (Live visual feedback endpoint)
    const checkOverlapRes = await fetch(`${baseUrl}/claims/check-overlap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon: overlappingCandidate })
    });
    assert.strictEqual(checkOverlapRes.status, 200);
    const checkOverlapJson = await checkOverlapRes.json();
    assert.strictEqual(checkOverlapJson.hasConflict, true);
    assert(checkOverlapJson.conflicts.length > 0);
    console.log('   ✓ POST /claims/check-overlap verified');

    // 4.2 GET /claims
    console.log('   -> GET /claims');
    const getClaimsRes = await fetch(`${baseUrl}/claims`);
    assert.strictEqual(getClaimsRes.status, 200);
    const claimsList = await getClaimsRes.json();
    assert(Array.isArray(claimsList) && claimsList.length >= 4);

    // 4.3 GET /claims/:id
    console.log('   -> GET /claims/:id');
    const getClaimRes = await fetch(`${baseUrl}/claims/${createdClaim.claimId}`);
    assert.strictEqual(getClaimRes.status, 200);
    const fetchedClaim = await getClaimRes.json();
    assert.strictEqual(fetchedClaim.claimId, createdClaim.claimId);

    // 4.4 POST /claims/:id/attest
    console.log('   -> POST /claims/:id/attest');
    const attestRes1 = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Village Leader',
        attesterName: 'Panchayat Head',
        notes: 'Confirm boundary limits'
      })
    });
    assert.strictEqual(attestRes1.status, 200);
    const attestJson1 = await attestRes1.json();
    assert.strictEqual(attestJson1.claim.score, 3);
    assert.strictEqual(attestJson1.claim.status, 'Pending'); // score 3 < 5

    // Second attestation to bring score >= 5
    const attestRes2 = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Accredited NGO',
        attesterName: 'Red Cross Survey Team',
        notes: 'Verified field survey'
      })
    });
    const attestJson2 = await attestRes2.json();
    assert.strictEqual(attestJson2.claim.score, 6);
    assert.strictEqual(attestJson2.claim.status, 'Verified'); // score 6 >= 5 -> Verified

    // 4.5 POST /claims/:id/dispute
    console.log('   -> POST /claims/:id/dispute');
    const disputeRes = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'Overlapping survey marker'
      })
    });
    assert.strictEqual(disputeRes.status, 200);
    const disputeJson = await disputeRes.json();
    assert.strictEqual(disputeJson.claim.status, 'Disputed');

    // 4.6 POST /claims/:id/resolve
    console.log('   -> POST /claims/:id/resolve');
    const resolveRes = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restore: true,
        resolutionNotes: 'Mutual boundary demarcation agreed upon'
      })
    });
    assert.strictEqual(resolveRes.status, 200);
    const resolveJson = await resolveRes.json();
    assert.strictEqual(resolveJson.claim.status, 'Verified');

    // 4.7 GET /verify/:id
    console.log('   -> GET /verify/:id');
    const verifyRes = await fetch(`${baseUrl}/verify/1`);
    assert.strictEqual(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.strictEqual(verifyJson.claimId, '1');
    assert.strictEqual(verifyJson.status, 'Verified');
    assert.strictEqual(verifyJson.isEvidenceValid, true);
    assert.strictEqual(verifyJson.payoutStatus, 'Paid');

    // 4.8 POST /reliefs
    console.log('   -> POST /reliefs');
    const postReliefRes = await fetch(`${baseUrl}/reliefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Monsoon Flooding Emergency 2026',
        zone: validPolygon,
        ratePerAcre: '2000000000000000000',
        maxPerClaim: '6000000000000000000',
        budget: '200000000000000000000'
      })
    });
    assert.strictEqual(postReliefRes.status, 201);
    const createdRelief = await postReliefRes.json();
    assert(createdRelief.reliefId);
    assert(isWeiString(createdRelief.budget));

    // 4.9 GET /reliefs
    console.log('   -> GET /reliefs');
    const getReliefsRes = await fetch(`${baseUrl}/reliefs`);
    assert.strictEqual(getReliefsRes.status, 200);
    const reliefsList = await getReliefsRes.json();
    assert(Array.isArray(reliefsList) && reliefsList.length >= 3);

    // 4.10 GET /reliefs/:id/eligible
    console.log('   -> GET /reliefs/:id/eligible');
    const getEligibleRes = await fetch(`${baseUrl}/reliefs/relief_flood_2026/eligible`);
    assert.strictEqual(getEligibleRes.status, 200);
    const eligibleJson = await getEligibleRes.json();
    assert(eligibleJson.relief);
    assert(Array.isArray(eligibleJson.claims) && eligibleJson.claims.length > 0);
    assert(eligibleJson.totalNeeded !== undefined);
    assert(eligibleJson.budget !== undefined);
    assert(eligibleJson.scaleBps !== undefined);
    assert(eligibleJson.shortfall !== undefined);
    assert(isWeiString(eligibleJson.claims[0].amount));
    assert(isWeiString(eligibleJson.claims[0].scaledAmount));

    // 4.11 POST /claims/:id/assess
    console.log('   -> POST /claims/:id/assess');
    const assessRes = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        answers: {
          depth: 'medium',
          structure: 'partial',
          type: 'kutcha',
          duration: 'medium',
          contents: 'some'
        },
        confirmedAreaAcres: 1.5,
        damageNotes: 'Water inundation up to 1 meter'
      })
    });
    assert.strictEqual(assessRes.status, 200);
    const assessJson = await assessRes.json();
    assert.strictEqual(assessJson.payout.status, 'Assessed');
    assert.strictEqual(assessJson.payout.damageLevel, 3); // 2 + 2 + 1 + 1 + 1 = 7 -> level 3
    assert(isWeiString(assessJson.payout.amount));
    assert.strictEqual(assessJson.payout.confirmedAreaAcres, 1.5);

    // 4.12 POST /claims/:id/approve-payout (body { reliefId, officer })
    console.log('   -> POST /claims/:id/approve-payout (body { reliefId, officer })');
    const approveRes1 = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/approve-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        officer: 'Officer_A'
      })
    });
    assert.strictEqual(approveRes1.status, 200);
    const approveJson1 = await approveRes1.json();
    assert.strictEqual(approveJson1.payout.approvals.length, 1);
    assert.strictEqual(approveJson1.payout.status, 'Assessed'); // Still assessed (needs 2)

    const approveRes2 = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/approve-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        officer: 'Officer_B'
      })
    });
    assert.strictEqual(approveRes2.status, 200);
    const approveJson2 = await approveRes2.json();
    assert.strictEqual(approveJson2.payout.approvals.length, 2);
    assert.strictEqual(approveJson2.payout.status, 'Approved'); // Now Approved!

    // 4.13 POST /claims/:id/release-payout
    console.log('   -> POST /claims/:id/release-payout');
    const releaseRes = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/release-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026'
      })
    });
    assert.strictEqual(releaseRes.status, 200);
    const releaseJson = await releaseRes.json();
    assert.strictEqual(releaseJson.payout.status, 'Paid');
    assert(releaseJson.payout.txHash && releaseJson.payout.txHash.startsWith('0x'));

    // 4.14 GET /claims/:id/payout
    console.log('   -> GET /claims/:id/payout');
    const getPayoutRes = await fetch(`${baseUrl}/claims/${createdClaim.claimId}/payout`);
    assert.strictEqual(getPayoutRes.status, 200);
    const payoutJson = await getPayoutRes.json();
    assert.strictEqual(payoutJson.status, 'Paid');
    assert(isWeiString(payoutJson.amount));

    // 5. Bad input validation test (returns 400 with { error: "..." })
    console.log('5. Testing 400 Bad Input Validation...');
    const badInputRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerName: 'Incomplete Claim' })
    });
    assert.strictEqual(badInputRes.status, 400);
    const badJson = await badInputRes.json();
    assert(badJson.error, 'Must return { error: "..." }');
    console.log('   ✓ Bad input returns 400 with error:', badJson.error);

    // 6. Central error handler test
    console.log('6. Testing Central Error Handler...');
    const notFoundRes = await fetch(`${baseUrl}/claims/nonexistent_9999`);
    assert.strictEqual(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert(notFoundJson.error, 'Central error format must have error field');
    console.log('   ✓ Central error handler returns formatted error:', notFoundJson.error);

    console.log('\n========================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! (14/14 Endpoints + Stores + Validators)');
    console.log('========================================');
    process.exit(0);
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
