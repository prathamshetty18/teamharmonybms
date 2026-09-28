process.env.NODE_ENV = 'test';
process.env.PORT = '5003';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const store = require('./store');
const { sha256Hex } = require('./utils/hash');
const auth = require('./auth');

async function runPhaseBTests() {
  console.log('--- Starting Phase B Land Record & Document Model Unit and Integration Tests ---\n');

  // =============================================================
  // 1. Land Record Area Unit Conversion Logic
  // =============================================================
  console.log('1. Testing Area Unit Conversion (Acres / Hectares / Sqm)...');
  const unitTest1 = store.formatAreaUnits(2.5);
  assert.strictEqual(unitTest1.acres, 2.5);
  assert.strictEqual(unitTest1.hectares, 1.0117); // 2.5 * 0.404686
  assert.strictEqual(unitTest1.sqm, 10117.14); // 2.5 * 4046.8564

  const unitTestZero = store.formatAreaUnits(0);
  assert.strictEqual(unitTestZero.acres, 0);
  assert.strictEqual(unitTestZero.hectares, 0);
  assert.strictEqual(unitTestZero.sqm, 0);
  console.log('   ✓ formatAreaUnits accurately converts acres to hectares and square meters');

  // =============================================================
  // 2. Documents Store In-Memory & Collection Operations
  // =============================================================
  console.log('2. Testing Documents Collection Store Operations...');
  const allDocsInitial = await store.documents.getAll();
  assert(Array.isArray(allDocsInitial) && allDocsInitial.length >= 3, 'Must have at least 3 initial seed documents');

  const claim1Docs = await store.documents.getByClaimId('1');
  assert(Array.isArray(claim1Docs) && claim1Docs.length >= 2, 'Claim 1 must have at least 2 linked documents');
  assert(claim1Docs.every(d => String(d.claimId) === '1' || String(d.landId) === '1'));

  const doc1 = await store.documents.getById('doc_1');
  assert.strictEqual(doc1.id, 'doc_1');
  assert.strictEqual(doc1.fileType, 'pdf');
  assert.strictEqual(doc1.verificationStatus, 'Verified');
  assert(doc1.ocrText.includes('TITLE DEED'));
  assert(typeof doc1.documentHash === 'string' && doc1.documentHash.length >= 64, 'documentHash must be valid sha256 hex');

  // Test updating document verification status
  const updatedDoc = await store.documents.update('doc_3', {
    verificationStatus: 'Verified',
    verifiedBy: 'Officer Kulkarni (Government Officer)',
    notes: 'Approved after field inspection'
  });
  assert.strictEqual(updatedDoc.verificationStatus, 'Verified');
  assert.strictEqual(updatedDoc.verifiedBy, 'Officer Kulkarni (Government Officer)');
  console.log('   ✓ Documents collection queries and status updates verified');

  // =============================================================
  // 3. HTTP Server and Endpoints Integration Suite
  // =============================================================
  console.log('3. Spinning up test server for Phase B REST endpoints...');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5003, resolve));
  const baseUrl = 'http://localhost:5003';

  // Generate tokens for each role
  const farmerToken = auth.generateToken({ id: 'user_farmer_1', role: auth.ROLES.FARMER, name: 'Ramesh Gowda' });
  const gvoToken = auth.generateToken({ id: 'user_gvo_1', role: auth.ROLES.GROUND_VERIFICATION_OFFICER, name: 'Rajesh Kumar' });
  const ngoToken = auth.generateToken({ id: 'user_ngo_1', role: auth.ROLES.NGO_COMMUNITY_VERIFIER, name: 'Suresh Patil' });
  const govToken = auth.generateToken({ id: 'user_gov_1', role: auth.ROLES.GOVERNMENT_OFFICER, name: 'Officer Kulkarni' });

  const testPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.5810, 12.9510],
        [77.5830, 12.9510],
        [77.5830, 12.9530],
        [77.5810, 12.9530],
        [77.5810, 12.9510]
      ]
    ]
  };

  try {
    // -----------------------------------------------------------
    // 3.1 POST /claims (Extended Land Parcel Schema & Area Input)
    // -----------------------------------------------------------
    console.log('   -> POST /claims with extended Land Parcel fields...');
    const createParcelRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${farmerToken}`
      },
      body: JSON.stringify({
        ownerName: 'Basappa Gowda',
        nationalId: 'IND-KA-560019-7711',
        polygon: testPolygon,
        parcelAreaAcres: 3.5,
        surveyNumber: 'Sy. No. 209/1',
        plotNumber: 'Plot 7',
        state: 'Karnataka',
        district: 'Bangalore South',
        taluk: 'Bangalore South',
        village: 'Basavanagudi',
        landUseFarmerDeclared: 'Agricultural',
        landUseGovtRecord: 'Agricultural',
        notes: 'Paddy land with borewell'
      })
    });

    assert.strictEqual(createParcelRes.status, 201);
    const createdParcel = await createParcelRes.json();
    assert(createdParcel.claimId, 'Must have claimId');
    assert.strictEqual(createdParcel.landId, createdParcel.claimId, 'landId must match claimId');
    assert.strictEqual(createdParcel.surveyNumber, 'Sy. No. 209/1');
    assert.strictEqual(createdParcel.plotNumber, 'Plot 7');
    assert.strictEqual(createdParcel.state, 'Karnataka');
    assert.strictEqual(createdParcel.district, 'Bangalore South');
    assert.strictEqual(createdParcel.village, 'Basavanagudi');
    assert.strictEqual(createdParcel.landUseFarmerDeclared, 'Agricultural');
    assert.strictEqual(createdParcel.landUseGovtRecord, 'Agricultural');
    assert.strictEqual(createdParcel.landUseGroundVerified, 'Pending');
    assert.strictEqual(createdParcel.landUseFinalApproved, 'Pending');
    assert.strictEqual(createdParcel.workflowStatus, 'Submitted');
    assert.strictEqual(createdParcel.area.acres, 3.5);
    assert.strictEqual(createdParcel.area.hectares, 1.4164);
    assert(createdParcel.area.sqm > 14000);
    console.log(`   ✓ Parcel created with full schema & area conversions (Land ID: ${createdParcel.landId})`);

    // -----------------------------------------------------------
    // 3.2 Area conversion from Hectares & Sqm on creation
    // -----------------------------------------------------------
    console.log('   -> POST /parcels (alias) with area given in hectares...');
    const testPolygon2 = {
      type: 'Polygon',
      coordinates: [
        [
          [77.5840, 12.9510],
          [77.5860, 12.9510],
          [77.5860, 12.9530],
          [77.5840, 12.9530],
          [77.5840, 12.9510]
        ]
      ]
    };
    const createHectaresRes = await fetch(`${baseUrl}/parcels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${farmerToken}`
      },
      body: JSON.stringify({
        ownerName: 'Manjula Devi',
        nationalId: 'IND-KA-560019-8822',
        polygon: testPolygon2,
        hectares: 2.0, // 2 hectares should convert to ~4.942 acres
        surveyNumber: 'Sy. No. 210/2'
      })
    });
    assert.strictEqual(createHectaresRes.status, 201);
    const hectaresParcel = await createHectaresRes.json();
    assert(Math.abs(hectaresParcel.parcelAreaAcres - 4.942) < 0.05, 'Should convert 2.0 hectares to ~4.942 acres');
    assert(Math.abs(hectaresParcel.area.hectares - 2.0) < 0.05);
    console.log('   ✓ Area in hectares converted to acres on write and read');

    // -----------------------------------------------------------
    // 3.3 GET /claims and GET /claims/:id
    // -----------------------------------------------------------
    console.log('   -> GET /claims and GET /parcels...');
    const getClaimsRes = await fetch(`${baseUrl}/claims`);
    assert.strictEqual(getClaimsRes.status, 200);
    const claims = await getClaimsRes.json();
    assert(Array.isArray(claims) && claims.length >= 5);
    assert(claims.every(c => c.landId && c.area && typeof c.area.acres === 'number' && typeof c.area.hectares === 'number' && typeof c.area.sqm === 'number'));

    console.log(`   -> GET /claims/${createdParcel.claimId}...`);
    const getSingleRes = await fetch(`${baseUrl}/claims/${createdParcel.claimId}`);
    assert.strictEqual(getSingleRes.status, 200);
    const singleParcel = await getSingleRes.json();
    assert.strictEqual(singleParcel.landId, createdParcel.claimId);
    assert.strictEqual(singleParcel.surveyNumber, 'Sy. No. 209/1');
    assert(Array.isArray(singleParcel.documents));

    // Also verify /parcels/:id alias
    const getParcelAlias = await fetch(`${baseUrl}/parcels/${createdParcel.claimId}`);
    assert.strictEqual(getParcelAlias.status, 200);
    const singleAlias = await getParcelAlias.json();
    assert.strictEqual(singleAlias.claimId, createdParcel.claimId);
    console.log('   ✓ GET /claims and GET /parcels returned parcels with converted area units & documents list');

    // -----------------------------------------------------------
    // 3.4 POST /documents/scan (OCR Stub)
    // -----------------------------------------------------------
    console.log('   -> POST /documents/scan (OCR Extraction Stub)...');
    const ocrRes = await fetch(`${baseUrl}/documents/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimId: createdParcel.claimId,
        documentType: 'title_deed'
      })
    });
    assert.strictEqual(ocrRes.status, 200);
    const ocrData = await ocrRes.json();
    assert(ocrData.ocrText && ocrData.ocrText.includes('TITLE CONVEYANCE DEED'));
    assert(ocrData.ocrText.includes('Sy. No. 209/1'));
    assert.strictEqual(ocrData.ocrData.surveyNumber, 'Sy. No. 209/1');
    assert.strictEqual(ocrData.ocrData.ownerName, 'Basappa Gowda');
    assert(ocrData.confidenceScore >= 0.9);

    // Custom raw text OCR scan
    const ocrCustomRes = await fetch(`${baseUrl}/documents/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimId: createdParcel.claimId,
        documentText: 'Sub-Registrar Certified Copy: Survey No 209/1, Basavanagudi'
      })
    });
    const ocrCustomData = await ocrCustomRes.json();
    assert.strictEqual(ocrCustomData.ocrText, 'Sub-Registrar Certified Copy: Survey No 209/1, Basavanagudi');
    console.log('   ✓ OCR extraction stub simulated high-confidence text and structured data extraction');

    // -----------------------------------------------------------
    // 3.5 POST /documents (Upload and Register Document)
    // -----------------------------------------------------------
    console.log('   -> POST /documents (Register Document linked to Land ID)...');
    const uploadDocRes = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimId: createdParcel.claimId,
        fileName: 'Panchayat_Mutation_Certificate_2026.pdf',
        fileType: 'pdf',
        documentType: 'title_deed',
        notes: 'Official mutation certificate issued by Tahsildar office'
      })
    });
    assert.strictEqual(uploadDocRes.status, 201);
    const uploadDocJson = await uploadDocRes.json();
    assert(uploadDocJson.document && uploadDocJson.document.id);
    const uploadedDocId = uploadDocJson.document.id;
    assert.strictEqual(uploadDocJson.document.claimId, createdParcel.claimId);
    assert.strictEqual(uploadDocJson.document.landId, createdParcel.claimId);
    assert.strictEqual(uploadDocJson.document.fileType, 'pdf');
    assert.strictEqual(uploadDocJson.document.verificationStatus, 'Pending');
    assert(typeof uploadDocJson.document.documentHash === 'string' && uploadDocJson.document.documentHash.length >= 64);
    assert(uploadDocJson.document.ocrText.length > 20);
    console.log(`   ✓ Document registered (ID: ${uploadedDocId}, Hash: ${uploadDocJson.document.documentHash})`);

    // -----------------------------------------------------------
    // 3.6 GET /documents and GET /documents/:id
    // -----------------------------------------------------------
    console.log('   -> GET /documents with filters...');
    const listDocsRes = await fetch(`${baseUrl}/documents?claimId=${createdParcel.claimId}`);
    assert.strictEqual(listDocsRes.status, 200);
    const linkedDocs = await listDocsRes.json();
    assert.strictEqual(linkedDocs.length, 1);
    assert.strictEqual(linkedDocs[0].id, uploadedDocId);

    const getDocRes = await fetch(`${baseUrl}/documents/${uploadedDocId}`);
    assert.strictEqual(getDocRes.status, 200);
    const fetchedDoc = await getDocRes.json();
    assert.strictEqual(fetchedDoc.id, uploadedDocId);

    const notFoundDoc = await fetch(`${baseUrl}/documents/non_existent_doc_99`);
    assert.strictEqual(notFoundDoc.status, 404);
    console.log('   ✓ Document query and retrieval verified');

    // -----------------------------------------------------------
    // 3.7 POST /documents/:id/verify
    // -----------------------------------------------------------
    console.log('   -> POST /documents/:id/verify...');
    const verifyDocRes = await fetch(`${baseUrl}/documents/${uploadedDocId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gvoToken}`
      },
      body: JSON.stringify({
        verificationStatus: 'Verified',
        notes: 'Mutation seal authentic; checked with Tahsildar records'
      })
    });
    assert.strictEqual(verifyDocRes.status, 200);
    const verifyDocJson = await verifyDocRes.json();
    assert.strictEqual(verifyDocJson.document.verificationStatus, 'Verified');
    assert(verifyDocJson.document.verifiedBy.includes('Rajesh Kumar'));
    assert(verifyDocJson.document.verifiedAt);

    // Bad status check
    const badVerifyRes = await fetch(`${baseUrl}/documents/${uploadedDocId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gvoToken}`
      },
      body: JSON.stringify({
        verificationStatus: 'InvalidStatus'
      })
    });
    assert.strictEqual(badVerifyRes.status, 400);
    console.log('   ✓ Document verification status updated with role audit trail');

    // -----------------------------------------------------------
    // 3.8 Missing-Document Workflow & Anti-Auto-Rejection Rule
    // -----------------------------------------------------------
    console.log('   -> Testing Missing-Document Workflow (Submitted -> Missing Documents Detected -> Special Verification -> Ground Verification -> Government Review -> Approved)...');

    // Create a parcel for missing-document testing
    const testPolygon3 = {
      type: 'Polygon',
      coordinates: [
        [
          [77.5870, 12.9510],
          [77.5890, 12.9510],
          [77.5890, 12.9530],
          [77.5870, 12.9530],
          [77.5870, 12.9510]
        ]
      ]
    };
    const missingDocsParcelRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${farmerToken}`
      },
      body: JSON.stringify({
        ownerName: 'Narasimha Murthy',
        nationalId: 'IND-KA-560019-3311',
        polygon: testPolygon3,
        parcelAreaAcres: 1.8,
        surveyNumber: 'Sy. No. 211/3'
      })
    });
    const missingDocsParcel = await missingDocsParcelRes.json();
    const testParcelId = missingDocsParcel.claimId;
    assert.strictEqual(missingDocsParcel.workflowStatus, 'Submitted');

    // Step A: Missing documents detected via /claims/:id/missing-docs
    console.log('   -> Step A: POST /claims/:id/missing-docs...');
    const detectMissingRes = await fetch(`${baseUrl}/claims/${testParcelId}/missing-docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missingDocumentTypes: ['title_deed', 'mutation_record'],
        notes: 'Original deed lost in 2018 flood; only tax receipt available'
      })
    });
    assert.strictEqual(detectMissingRes.status, 200);
    const detectMissingJson = await detectMissingRes.json();
    assert.strictEqual(detectMissingJson.claim.workflowStatus, 'Missing Documents Detected');
    assert.strictEqual(detectMissingJson.recommendedNextStep, 'Special Verification');

    // Step B: CRITICAL INVARIANT: NEVER AUTO-REJECT FOR MISSING DOCS ALONE
    console.log('   -> CRITICAL RULE: Attempting to reject parcel for missing documents alone...');
    const rejectAttemptRes = await fetch(`${baseUrl}/claims/${testParcelId}/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        workflowStatus: 'Rejected',
        reason: 'Missing documents alone: applicant lacks 1984 registered title deed'
      })
    });
    assert.strictEqual(rejectAttemptRes.status, 400);
    const rejectErr = await rejectAttemptRes.json();
    assert(rejectErr.error.includes('Cannot reject application for missing documents alone'));
    console.log('   ✓ System correctly REJECTED attempt to auto-reject application for missing docs alone!');

    // Step C: Route to Special Verification
    console.log('   -> Step C: Transition to Special Verification...');
    const specialVerifRes = await fetch(`${baseUrl}/claims/${testParcelId}/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        workflowStatus: 'Special Verification',
        reason: 'Convening Gram Panchayat elder council to testify on 30-year adverse possession and cultivating rights'
      })
    });
    assert.strictEqual(specialVerifRes.status, 200);
    const specialVerifJson = await specialVerifRes.json();
    assert.strictEqual(specialVerifJson.claim.workflowStatus, 'Special Verification');

    // Step D: Transition to Ground Verification (GVO checks crops and boundaries)
    console.log('   -> Step D: Transition to Ground Verification...');
    const groundVerifRes = await fetch(`${baseUrl}/claims/${testParcelId}/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gvoToken}`
      },
      body: JSON.stringify({
        workflowStatus: 'Ground Verification',
        landUseGroundVerified: 'Agricultural',
        notes: 'Paddy crop verified on site; physical landmarks correspond to survey boundaries'
      })
    });
    assert.strictEqual(groundVerifRes.status, 200);
    const groundVerifJson = await groundVerifRes.json();
    assert.strictEqual(groundVerifJson.claim.workflowStatus, 'Ground Verification');
    assert.strictEqual(groundVerifJson.claim.landUseGroundVerified, 'Agricultural');

    // Step E: Transition to Government Review
    console.log('   -> Step E: Transition to Government Review...');
    const govReviewRes = await fetch(`${baseUrl}/claims/${testParcelId}/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        workflowStatus: 'Government Review',
        notes: 'Special Verification Committee report received with 5 neighbor attestations'
      })
    });
    assert.strictEqual(govReviewRes.status, 200);
    const govReviewJson = await govReviewRes.json();
    assert.strictEqual(govReviewJson.claim.workflowStatus, 'Government Review');

    // Step F: Final Approval by Government Officer
    console.log('   -> Step F: Transition to Approved (Final Step)...');
    const approveRes = await fetch(`${baseUrl}/claims/${testParcelId}/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${govToken}`
      },
      body: JSON.stringify({
        workflowStatus: 'Approved',
        landUseFinalApproved: 'Agricultural',
        notes: 'Regularized under Karnataka Land Revenue Special Relief Rules'
      })
    });
    assert.strictEqual(approveRes.status, 200);
    const approveJson = await approveRes.json();
    assert.strictEqual(approveJson.claim.workflowStatus, 'Approved');
    assert.strictEqual(approveJson.claim.landUseFinalApproved, 'Agricultural');
    assert.strictEqual(approveJson.claim.status, 'Verified', 'Approval must flip parcel status to Verified');
    console.log('   ✓ Complete missing-document workflow completed without illegitimate auto-rejection');

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE B LAND RECORD & DOCUMENT TESTS PASSED! (100%)');
  console.log('======================================================\n');
  process.exit(0);
}

runPhaseBTests().catch(err => {
  console.error('\n❌ Phase B Test Suite Failed:', err);
  process.exit(1);
});
