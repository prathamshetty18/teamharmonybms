process.env.NODE_ENV = 'test';
process.env.PORT = '5004';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const store = require('./store');
const auth = require('./auth');

async function runPhaseCTests() {
  console.log('--- Starting Phase C Verification Workflow State Machine & Audit Logs Unit and Integration Tests ---\n');

  // =============================================================
  // 1. Verification State Machine & On-Chain Status Mapping
  // =============================================================
  console.log('1. Testing State Machine Definitions & On-Chain Status Mapping...');
  assert(store.SPEC_STATUSES.includes('DRAFT'));
  assert(store.SPEC_STATUSES.includes('SUBMITTED'));
  assert(store.SPEC_STATUSES.includes('DOCUMENT_VERIFICATION'));
  assert(store.SPEC_STATUSES.includes('GROUND_VERIFICATION'));
  assert(store.SPEC_STATUSES.includes('COMMUNITY/NGO_VERIFICATION'));
  assert(store.SPEC_STATUSES.includes('LAND_CLASSIFICATION'));
  assert(store.SPEC_STATUSES.includes('GOVERNMENT_REVIEW'));
  assert(store.SPEC_STATUSES.includes('APPROVED'));
  assert(store.SPEC_STATUSES.includes('DISPUTED'));
  assert(store.SPEC_STATUSES.includes('REJECTED'));

  // On-chain mapping checks per specification
  assert.strictEqual(store.mapToOnChainStatus('DRAFT'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('SUBMITTED'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('DOCUMENT_VERIFICATION'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('GROUND_VERIFICATION'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('COMMUNITY/NGO_VERIFICATION'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('COMMUNITY_NGO_VERIFICATION'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('LAND_CLASSIFICATION'), 'Pending');
  assert.strictEqual(store.mapToOnChainStatus('GOVERNMENT_REVIEW'), 'Verified');
  assert.strictEqual(store.mapToOnChainStatus('APPROVED'), 'Verified');
  assert.strictEqual(store.mapToOnChainStatus('DISPUTED'), 'Disputed');
  assert.strictEqual(store.mapToOnChainStatus('REJECTED'), 'Disputed');
  console.log('   ✓ GOVERNMENT_REVIEW and APPROVED correctly mapped to on-chain Verified');
  console.log('   ✓ Earlier verification stages correctly mapped to on-chain Pending');
  console.log('   ✓ DISPUTED and REJECTED mapped to Disputed');

  // =============================================================
  // 2. Append-Only Audit Logs Store Invariants
  // =============================================================
  console.log('2. Testing Audit Logs Collection Append-Only Invariants...');
  const initialLogs = await store.getAllAuditLogs();
  assert(Array.isArray(initialLogs) && initialLogs.length >= 7, 'Must have initial seed audit logs');

  const claim1Logs = await store.getAuditLogsByLandId('1');
  assert(claim1Logs.length >= 4, 'Claim 1 must have audit history from creation to approval');
  assert(claim1Logs.every(l => String(l.landId) === '1' || String(l.claimId) === '1'));
  assert(claim1Logs.some(l => l.what === 'CLAIM_SUBMITTED'));
  assert(claim1Logs.some(l => l.what === 'DOCUMENT_VERIFIED'));
  assert(claim1Logs.some(l => l.what === 'GROUND_VERIFIED'));
  assert(claim1Logs.some(l => l.what === 'GOVERNMENT_APPROVED'));

  // Verify immutability: update and delete MUST throw errors
  let updateBlocked = false;
  try {
    await store.auditLogs.update('audit_seed_101', { remarks: 'Tampered remarks' });
  } catch (err) {
    updateBlocked = true;
    assert(err.message.includes('append-only'));
  }
  assert(updateBlocked, 'Audit log update must be rejected');

  let deleteBlocked = false;
  try {
    await store.auditLogs.delete('audit_seed_101');
  } catch (err) {
    deleteBlocked = true;
    assert(err.message.includes('append-only'));
  }
  assert(deleteBlocked, 'Audit log deletion must be rejected');
  console.log('   ✓ Audit Logs collection is strictly append-only (updates & deletes blocked)');

  // =============================================================
  // 3. HTTP Server and Endpoints Suite
  // =============================================================
  console.log('3. Starting test server for Phase C endpoints...');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5004, resolve));
  const baseUrl = 'http://localhost:5004';

  const farmerToken = auth.generateToken({ id: 'user_farmer_1', role: auth.ROLES.FARMER, name: 'Ramesh Gowda' });
  const gvoToken = auth.generateToken({ id: 'user_gvo_1', role: auth.ROLES.GROUND_VERIFICATION_OFFICER, name: 'Rajesh Kumar' });
  const ngoToken = auth.generateToken({ id: 'user_ngo_1', role: auth.ROLES.NGO_COMMUNITY_VERIFIER, name: 'Suresh Patil' });
  const govToken = auth.generateToken({ id: 'user_gov_1', role: auth.ROLES.GOVERNMENT_OFFICER, name: 'Officer Kulkarni' });

  const testPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.5910, 12.9610],
        [77.5930, 12.9610],
        [77.5930, 12.9630],
        [77.5910, 12.9630],
        [77.5910, 12.9610]
      ]
    ]
  };

  try {
    // -----------------------------------------------------------
    // 3.1 Create new parcel and check initial audit log
    // -----------------------------------------------------------
    console.log('   -> POST /claims (Initial submission)...');
    const createRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${farmerToken}`
      },
      body: JSON.stringify({
        ownerName: 'Chennappa Gowda',
        nationalId: 'IND-KA-560019-4455',
        polygon: testPolygon,
        parcelAreaAcres: 2.2,
        surveyNumber: 'Sy. No. 301/1',
        plotNumber: 'Plot 12',
        landUseFarmerDeclared: 'Agricultural',
        notes: 'Dry agricultural parcel with mango grove'
      })
    });
    assert.strictEqual(createRes.status, 201);
    const createdClaim = await createRes.json();
    const testId = createdClaim.claimId;
    assert.strictEqual(createdClaim.verificationStatus, 'SUBMITTED');
    assert.strictEqual(createdClaim.onChainStatus, 'Pending');

    // Confirm creation audit log was written
    const creationAuditRes = await fetch(`${baseUrl}/claims/${testId}/audit-logs`);
    assert.strictEqual(creationAuditRes.status, 200);
    const creationLogs = await creationAuditRes.json();
    assert(creationLogs.length >= 1);
    const firstLog = creationLogs[0];
    assert.strictEqual(firstLog.what, 'CLAIM_SUBMITTED');
    assert.strictEqual(firstLog.prevValue, 'DRAFT');
    assert.strictEqual(firstLog.newValue, 'SUBMITTED');
    assert(firstLog.who.includes('Ramesh Gowda'));
    console.log(`   ✓ Claim ${testId} created and audited (DRAFT -> SUBMITTED)`);

    // -----------------------------------------------------------
    // 3.2 Transition to DOCUMENT_VERIFICATION
    // -----------------------------------------------------------
    console.log('   -> POST /verification/transition (SUBMITTED -> DOCUMENT_VERIFICATION)...');
    const docVerifRes = await fetch(`${baseUrl}/verification/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        claimId: testId,
        targetStatus: 'DOCUMENT_VERIFICATION',
        remarks: 'Title deed and tax records queued for Sub-Registrar cross-reference'
      })
    });
    assert.strictEqual(docVerifRes.status, 200);
    const docVerifJson = await docVerifRes.json();
    assert.strictEqual(docVerifJson.claim.verificationStatus, 'DOCUMENT_VERIFICATION');
    assert.strictEqual(docVerifJson.claim.onChainStatus, 'Pending');
    assert.strictEqual(docVerifJson.auditRecord.what, 'STATUS_TRANSITION_DOCUMENT_VERIFICATION');
    console.log('   ✓ Transitioned to DOCUMENT_VERIFICATION and audited');

    // -----------------------------------------------------------
    // 3.3 POST /ground-verification
    // -----------------------------------------------------------
    console.log('   -> POST /ground-verification (GVO physical inspection)...');
    // Block unauthorized role (Farmer)
    const unauthorizedGvoRes = await fetch(`${baseUrl}/ground-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${farmerToken}`,
        'x-enforce-auth': 'true'
      },
      body: JSON.stringify({ claimId: testId })
    });
    assert.strictEqual(unauthorizedGvoRes.status, 403, 'Farmer role must be forbidden from GVO endpoint');

    // Authorized GVO submission
    const gvoReportRes = await fetch(`${baseUrl}/ground-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gvoToken}`
      },
      body: JSON.stringify({
        claimId: testId,
        gpsLocation: [77.5920, 12.9620],
        boundaryVerified: true,
        landUseVerified: 'Agricultural',
        remarks: 'Corner survey stones matched tippani sketch; actively cultivated with mango trees',
        photos: ['/uploads/gvo_chennappa_trees.jpg', '/uploads/gvo_chennappa_cornerstone.jpg']
      })
    });
    assert.strictEqual(gvoReportRes.status, 200);
    const gvoReportJson = await gvoReportRes.json();
    assert(gvoReportJson.report);
    assert.strictEqual(gvoReportJson.report.boundaryVerified, true);
    assert.strictEqual(gvoReportJson.report.landUseVerified, 'Agricultural');
    assert.strictEqual(gvoReportJson.claim.landUseGroundVerified, 'Agricultural');
    assert.strictEqual(gvoReportJson.claim.verificationStatus, 'COMMUNITY/NGO_VERIFICATION');
    assert.strictEqual(gvoReportJson.claim.onChainStatus, 'Pending');
    assert.strictEqual(gvoReportJson.auditRecord.what, 'GROUND_VERIFICATION_SUBMITTED');
    assert.strictEqual(gvoReportJson.auditRecord.prevValue, 'DOCUMENT_VERIFICATION');
    assert.strictEqual(gvoReportJson.auditRecord.newValue, 'COMMUNITY/NGO_VERIFICATION');
    console.log('   ✓ /ground-verification processed GPS, boundary, land-use and advanced status');

    // -----------------------------------------------------------
    // 3.4 POST /ngo-verification
    // -----------------------------------------------------------
    console.log('   -> POST /ngo-verification (Community & NGO field hearings)...');
    // Block unauthorized role (GVO is not NGO verifier)
    const unauthorizedNgoRes = await fetch(`${baseUrl}/ngo-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gvoToken}`,
        'x-enforce-auth': 'true'
      },
      body: JSON.stringify({ claimId: testId })
    });
    assert.strictEqual(unauthorizedNgoRes.status, 403, 'GVO role must be forbidden from NGO endpoint');

    // Authorized NGO submission
    const ngoReportRes = await fetch(`${baseUrl}/ngo-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ngoToken}`
      },
      body: JSON.stringify({
        claimId: testId,
        gpsLocation: [77.5920, 12.9620],
        boundaryVerified: true,
        landUseVerified: 'Agricultural',
        communityAttestations: [
          {
            attesterName: 'Krishnappa (North Neighbor)',
            relation: 'Owner Sy. No. 301/2',
            testimony: 'Boundary fence in place for 30 years without dispute'
          },
          {
            attesterName: 'Panchayat Member M. Gowda',
            relation: 'Ward Representative',
            testimony: 'Family in undisturbed possession'
          }
        ],
        remarks: 'Gram Sabha hearing held; unanimous neighbor confirmation'
      })
    });
    assert.strictEqual(ngoReportRes.status, 200);
    const ngoReportJson = await ngoReportRes.json();
    assert(ngoReportJson.report);
    assert.strictEqual(ngoReportJson.report.communityAttestations.length, 2);
    assert.strictEqual(ngoReportJson.claim.verificationStatus, 'LAND_CLASSIFICATION');
    assert.strictEqual(ngoReportJson.claim.onChainStatus, 'Pending');
    assert.strictEqual(ngoReportJson.auditRecord.what, 'NGO_COMMUNITY_VERIFICATION_SUBMITTED');
    assert.strictEqual(ngoReportJson.auditRecord.prevValue, 'COMMUNITY/NGO_VERIFICATION');
    assert.strictEqual(ngoReportJson.auditRecord.newValue, 'LAND_CLASSIFICATION');
    console.log('   ✓ /ngo-verification recorded neighbor testimonies and advanced to LAND_CLASSIFICATION');

    // -----------------------------------------------------------
    // 3.5 LAND_CLASSIFICATION -> GOVERNMENT_REVIEW
    // -----------------------------------------------------------
    console.log('   -> Transition LAND_CLASSIFICATION -> GOVERNMENT_REVIEW (Flips on-chain to Verified)...');
    const govReviewRes = await fetch(`${baseUrl}/verification/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        claimId: testId,
        targetStatus: 'GOVERNMENT_REVIEW',
        remarks: 'Land revenue classification confirmed as Agricultural (Dry/Orchard). Passed to Tahsildar for final order.'
      })
    });
    assert.strictEqual(govReviewRes.status, 200);
    const govReviewJson = await govReviewRes.json();
    assert.strictEqual(govReviewJson.claim.verificationStatus, 'GOVERNMENT_REVIEW');
    // CRITICAL: GOVERNMENT_REVIEW maps to on-chain Verified!
    assert.strictEqual(govReviewJson.claim.onChainStatus, 'Verified', 'GOVERNMENT_REVIEW must map to on-chain Verified');
    console.log('   ✓ GOVERNMENT_REVIEW mapped to on-chain Verified');

    // -----------------------------------------------------------
    // 3.6 GOVERNMENT_REVIEW -> APPROVED
    // -----------------------------------------------------------
    console.log('   -> Transition GOVERNMENT_REVIEW -> APPROVED...');
    const approveRes = await fetch(`${baseUrl}/verification/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        claimId: testId,
        targetStatus: 'APPROVED',
        remarks: 'Title regularized. Cadastral record finalized.'
      })
    });
    assert.strictEqual(approveRes.status, 200);
    const approveJson = await approveRes.json();
    assert.strictEqual(approveJson.claim.verificationStatus, 'APPROVED');
    assert.strictEqual(approveJson.claim.onChainStatus, 'Verified');
    assert.strictEqual(approveJson.claim.landUseFinalApproved, 'Agricultural');
    console.log('   ✓ Final state APPROVED confirmed with land-use final approval');

    // -----------------------------------------------------------
    // 3.7 Anti-Auto-Rejection Rule in State Machine Transition
    // -----------------------------------------------------------
    console.log('   -> Testing Anti-Auto-Rejection rule on /verification/transition...');
    const invalidRejectRes = await fetch(`${baseUrl}/verification/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        claimId: testId,
        targetStatus: 'REJECTED',
        reason: 'Missing original 1965 title document alone'
      })
    });
    assert.strictEqual(invalidRejectRes.status, 400);
    const invalidRejectErr = await invalidRejectRes.json();
    assert(invalidRejectErr.error.includes('Cannot reject application for missing documents alone'));
    console.log('   ✓ Anti-auto-rejection rule protected application on state machine transition');

    // -----------------------------------------------------------
    // 3.8 Querying Append-Only Audit Logs Endpoints
    // -----------------------------------------------------------
    console.log('   -> Querying /audit-logs and /claims/:id/audit-logs...');
    const allAuditRes = await fetch(`${baseUrl}/audit-logs`);
    assert.strictEqual(allAuditRes.status, 200);
    const allLogs = await allAuditRes.json();
    assert(allLogs.length >= 10);

    const parcelAuditRes = await fetch(`${baseUrl}/claims/${testId}/audit-logs`);
    assert.strictEqual(parcelAuditRes.status, 200);
    const parcelLogs = await parcelAuditRes.json();
    assert(parcelLogs.length >= 5, 'Must have recorded complete transition audit trail');

    // Confirm audit log structure adheres to: who, what, when, land ID, prev value, new value, remarks
    const latestLog = parcelLogs[parcelLogs.length - 1];
    assert(latestLog.id);
    assert(latestLog.who);
    assert(latestLog.what);
    assert(latestLog.when);
    assert.strictEqual(latestLog.landId, testId);
    assert(latestLog.prevValue);
    assert(latestLog.newValue);
    assert(latestLog.remarks);
    console.log(`   ✓ Parcel ${testId} has ${parcelLogs.length} verified immutable audit records`);

    // Filter audit logs by action
    const filteredAuditRes = await fetch(`${baseUrl}/audit-logs?what=GROUND_VERIFICATION_SUBMITTED`);
    assert.strictEqual(filteredAuditRes.status, 200);
    const filteredLogs = await filteredAuditRes.json();
    assert(filteredLogs.length >= 1);
    assert(filteredLogs.every(l => l.what === 'GROUND_VERIFICATION_SUBMITTED'));
    console.log('   ✓ /audit-logs filtering verified');

    // Single audit log query by ID
    const singleAuditRes = await fetch(`${baseUrl}/audit-logs/${latestLog.id}`);
    assert.strictEqual(singleAuditRes.status, 200);
    const singleAuditJson = await singleAuditRes.json();
    assert.strictEqual(singleAuditJson.id, latestLog.id);

    const notFoundAuditRes = await fetch(`${baseUrl}/audit-logs/non_existent_audit_id`);
    assert.strictEqual(notFoundAuditRes.status, 404);
    console.log('   ✓ GET /audit-logs/:id verified');

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE C STATE MACHINE & AUDIT LOGS TESTS PASSED! (100%)');
  console.log('======================================================\n');
  process.exit(0);
}

runPhaseCTests().catch(err => {
  console.error('\n❌ Phase C Test Suite Failed:', err);
  process.exit(1);
});
