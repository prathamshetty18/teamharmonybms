const assert = require('assert');
const http = require('http');
const express = require('express');
const createClaimsRoutes = require('./routes/claimsRoutes');
const store = require('./store');

console.log('--- Starting Phase 2 Core Land Flow Unit Tests ---\n');

async function runPhase2Tests() {
  // Mock chain client to test integration with Person A's contract layer
  const mockChainCalls = {
    createClaim: [],
    getClaim: [],
    attest: []
  };

  const mockChain = {
    async createClaim(ownerHash, evidenceHash, latE6, lonE6) {
      mockChainCalls.createClaim.push({ ownerHash, evidenceHash, latE6, lonE6 });
      return {
        claimId: '99',
        txHash: '0xmockchaincreateclaimtxhash1234567890abcdef'
      };
    },

    async getClaim(claimId) {
      mockChainCalls.getClaim.push(claimId);
      return {
        claimId,
        score: 7,
        status: 'Verified',
        ownerHash: '0xchainownerhash',
        evidenceHash: '0xchainevidencehash',
        onChainTimestamp: '2026-09-28T22:00:00.000Z'
      };
    },

    async attest(claimId, weight) {
      mockChainCalls.attest.push({ claimId, weight });
      return { txHash: '0xmockattesttxhash' };
    }
  };

  const app = express();
  app.use(express.json());
  // Inject mockChain into createClaimsRoutes
  app.use('/', createClaimsRoutes(null, mockChain));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5002, resolve));
  const baseUrl = 'http://localhost:5002';

  try {
    // 1. POST /claims
    console.log('1. Testing POST /claims with chain.createClaim integration...');
    const nonOverlappingPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [77.5800, 12.9500],
          [77.5820, 12.9500],
          [77.5820, 12.9520],
          [77.5800, 12.9520],
          [77.5800, 12.9500]
        ]
      ]
    };

    const postClaimRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName: 'Pooja Hegde',
        nationalId: 'IND-KA-560019-7711',
        polygon: nonOverlappingPolygon,
        parcelAreaAcres: 3.2,
        notes: 'Verified ancestral land'
      })
    });

    assert.strictEqual(postClaimRes.status, 201);
    const postClaimJson = await postClaimRes.json();

    // Verify on-chain claimId assigned from mockChain.createClaim
    assert.strictEqual(postClaimJson.claimId, '99');
    assert.strictEqual(postClaimJson.status, 'Pending'); // Status starts Pending
    assert.strictEqual(postClaimJson.score, 0);
    assert.strictEqual(postClaimJson.txHash, '0xmockchaincreateclaimtxhash1234567890abcdef');
    assert(postClaimJson.ownerHash.startsWith('0x'));
    assert(postClaimJson.evidenceHash.startsWith('0x'));
    assert.strictEqual(mockChainCalls.createClaim.length, 1);
    console.log('   ✓ chain.createClaim was called with hashes and coordinates');
    console.log('   ✓ Claim saved to Atlas with claimId="99" and status="Pending"');

    // Verify persisted in store
    const persisted = await store.getById('claims', '99');
    assert(persisted !== null);
    assert.strictEqual(persisted.ownerName, 'Pooja Hegde');
    assert.strictEqual(persisted.status, 'Pending');
    console.log('   ✓ Verified record persisted in Atlas via store.save("claims", ...)');

    // 2. GET /claims
    console.log('2. Testing GET /claims...');
    const getClaimsRes = await fetch(`${baseUrl}/claims`);
    assert.strictEqual(getClaimsRes.status, 200);
    const allClaims = await getClaimsRes.json();
    assert(Array.isArray(allClaims));
    const found = allClaims.find(c => c.claimId === '99');
    assert(found !== undefined);
    assert(found.polygon.type === 'Polygon');
    console.log(`   ✓ GET /claims returned ${allClaims.length} parcels with GeoJSON polygons`);

    // 3. GET /claims/:id with chain.getClaim merge
    console.log('3. Testing GET /claims/:id merging Atlas data with chain.getClaim(claimId)...');
    const getSingleRes = await fetch(`${baseUrl}/claims/99`);
    assert.strictEqual(getSingleRes.status, 200);
    const mergedClaim = await getSingleRes.json();
    assert.strictEqual(mergedClaim.claimId, '99');
    assert.strictEqual(mergedClaim.ownerName, 'Pooja Hegde'); // from Atlas
    assert(mergedClaim.onChain !== undefined); // from chain
    assert.strictEqual(mergedClaim.onChain.onChainTimestamp, '2026-09-28T22:00:00.000Z');
    assert.strictEqual(mergedClaim.score, 7); // merged from on-chain score
    assert.strictEqual(mergedClaim.status, 'Verified'); // merged from on-chain status
    assert.strictEqual(mockChainCalls.getClaim.length, 1);
    console.log('   ✓ GET /claims/:id successfully merged Atlas off-chain data with chain.getClaim() read');

    // 4. POST /claims/:id/attest
    console.log('4. Testing POST /claims/:id/attest updates attestation history via store.update...');
    const attestRes = await fetch(`${baseUrl}/claims/99/attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Village Leader',
        attesterName: 'Panchayat President',
        notes: 'Formal seal and boundary affirmation'
      })
    });

    assert.strictEqual(attestRes.status, 200);
    const attestJson = await attestRes.json();
    assert(attestJson.attestation);
    assert.strictEqual(attestJson.attestation.role, 'Village Leader');
    assert.strictEqual(attestJson.attestation.weight, 3);

    // Verify attestation saved in store.update
    const updatedInStore = await store.getById('claims', '99');
    assert(Array.isArray(updatedInStore.attestations));
    assert(updatedInStore.attestations.some(a => a.attesterName === 'Panchayat President'));
    console.log('   ✓ Attestation history successfully saved to Atlas via store.update');

    console.log('\n======================================================');
    console.log('ALL PHASE 2 CORE LAND FLOW TESTS PASSED! (100%)');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runPhase2Tests().catch(err => {
  console.error('\n❌ PHASE 2 TEST FAILED:', err);
  process.exit(1);
});
