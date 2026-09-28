const assert = require('assert');
const http = require('http');
const express = require('express');
const {
  checkOverlap,
  findOverlaps,
  createDisputeFromOverlap,
  safeIntersect
} = require('./overlap');
const createClaimsRoutes = require('./routes/claimsRoutes');
const store = require('./store');

console.log('--- Starting Geospatial Overlap & Disputes Engine Unit Tests ---\n');

// Reference Parcels:
// Parcel 1: [77.5610, 12.9405] to [77.5630, 12.9425] (Basavanagudi Area)
const parcel1 = {
  claimId: '1',
  ownerName: 'Ramesh Gowda',
  status: 'Verified',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [77.5610, 12.9405],
        [77.5630, 12.9405],
        [77.5630, 12.9425],
        [77.5610, 12.9425],
        [77.5610, 12.9405]
      ]
    ]
  }
};

// 1. findOverlaps on Disjoint parcel (no overlap -> empty array)
console.log('1. Testing findOverlaps on disjoint parcels...');
const disjointParcel = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5700, 12.9500],
      [77.5720, 12.9500],
      [77.5720, 12.9520],
      [77.5700, 12.9520],
      [77.5700, 12.9500]
    ]
  ]
};
const disjointConflicts = findOverlaps(disjointParcel, [parcel1]);
assert(Array.isArray(disjointConflicts), 'findOverlaps must return an array');
assert.strictEqual(disjointConflicts.length, 0);
console.log('   ✓ findOverlaps correctly returns empty array [] on disjoint parcels');

// 2. findOverlaps on Overlapping parcel (returns [conflicts])
console.log('2. Testing findOverlaps on overlapping parcels...');
// Spans [77.5620, 12.9405] to [77.5640, 12.9425] (overlaps parcel1 by ~50%)
const overlappingParcel = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5620, 12.9405],
      [77.5640, 12.9405],
      [77.5640, 12.9425],
      [77.5620, 12.9425],
      [77.5620, 12.9405]
    ]
  ]
};
const conflicts = findOverlaps(overlappingParcel, [parcel1]);
assert(Array.isArray(conflicts));
assert.strictEqual(conflicts.length, 1);
const conflict = conflicts[0];
assert.strictEqual(conflict.claimId, '1');
assert.strictEqual(conflict.ownerName, 'Ramesh Gowda');
assert(Math.abs(conflict.candidateOverlapPercent - 50.0) < 1.0, `Expected ~50%, got ${conflict.candidateOverlapPercent}%`);
assert(conflict.overlapAreaM2 > 0);
assert(conflict.reason && conflict.notes);
console.log(`   ✓ findOverlaps returned conflict: overlaps Parcel #${conflict.claimId} by ${conflict.candidateOverlapPercent}%`);

// 3. createDisputeFromOverlap formatting
console.log('3. Testing createDisputeFromOverlap()...');
const disputeRecord = createDisputeFromOverlap(conflicts, '0xAggrievedAddress');
assert(disputeRecord !== null);
assert.strictEqual(disputeRecord.isDisputed, true);
assert.strictEqual(disputeRecord.overlappingClaimId, '1');
assert(disputeRecord.reason.includes('Parcel #1 (Ramesh Gowda)'));
assert(disputeRecord.notes.includes('Automated dispute flagged'));
console.log(`   ✓ Formatted dispute reason: "${disputeRecord.reason}"`);
console.log(`   ✓ Formatted dispute notes: "${disputeRecord.notes}"`);

// 4. Touching / adjacent parcels (sharing an edge, zero/sub-threshold overlap)
console.log('4. Testing touching adjacent parcels...');
const adjacentParcel = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5630, 12.9405],
      [77.5650, 12.9405],
      [77.5650, 12.9425],
      [77.5630, 12.9425],
      [77.5630, 12.9405]
    ]
  ]
};
const adjacentConflicts = findOverlaps(adjacentParcel, [parcel1]);
assert.strictEqual(adjacentConflicts.length, 0, 'Touching edge should not trigger overlap conflict');
console.log('   ✓ Adjacent parcels with shared border do not trigger false conflict');

// 5. Exclude self claim ID (e.g. during claim updates)
console.log('5. Testing excludeClaimId...');
const selfConflicts = findOverlaps(parcel1.polygon, [parcel1], { excludeClaimId: '1' });
assert.strictEqual(selfConflicts.length, 0);
console.log('   ✓ excludeClaimId correctly ignores self');

// 6. Integration Test: POST /claims auto-triggers chain.dispute() & saves reason and notes in Atlas
console.log('6. Testing POST /claims auto-dispute wiring & Atlas storage...');
async function runIntegrationTest() {
  const chainDisputeCalls = [];
  const mockChain = {
    async createClaim(ownerHash, evidenceHash, lat, lon) {
      return { claimId: '201', txHash: '0xmockcreate' };
    },
    async dispute(claimId) {
      chainDisputeCalls.push(claimId);
      return { txHash: '0xmockdisputetx' };
    }
  };

  const app = express();
  app.use(express.json());
  app.use('/', createClaimsRoutes(null, mockChain));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5003, resolve));
  const baseUrl = 'http://localhost:5003';

  try {
    const postRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName: 'Overlapping Encroacher',
        polygon: overlappingParcel,
        parcelAreaAcres: 2.0
      })
    });

    assert.strictEqual(postRes.status, 201);
    const postJson = await postRes.json();

    // Verify claim status is Disputed
    assert.strictEqual(postJson.status, 'Disputed');
    assert.strictEqual(postJson.claimId, '201');

    // Verify chain.dispute() was auto-called with on-chain claimId
    assert.strictEqual(chainDisputeCalls.length, 1);
    assert.strictEqual(chainDisputeCalls[0], '201');
    console.log('   ✓ chain.dispute(201) was automatically triggered on conflict');

    // Verify dispute reason and notes stored in Atlas record
    assert(postJson.dispute);
    assert(postJson.dispute.reason.includes('Parcel #'));
    assert(postJson.dispute.notes);
    assert.strictEqual(postJson.disputeReason, postJson.dispute.reason);
    assert.strictEqual(postJson.disputeNotes, postJson.dispute.notes);

    // Verify persisted record in Atlas
    const persisted = await store.getById('claims', '201');
    assert(persisted !== null);
    assert.strictEqual(persisted.status, 'Disputed');
    assert(persisted.disputeReason.includes('Parcel #'));
    assert(persisted.disputeNotes);
    console.log(`   ✓ Dispute reason: "${persisted.disputeReason}"`);
    console.log('   ✓ Dispute reason and notes successfully verified in Atlas store');
  } finally {
    server.close();
  }
}

runIntegrationTest().then(() => {
  console.log('\n======================================================');
  console.log('ALL PHASE 3 OVERLAP & AUTO-DISPUTE TESTS PASSED! (100%)');
  console.log('======================================================\n');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ PHASE 3 TEST FAILED:', err);
  process.exit(1);
});
