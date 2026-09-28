// Set test environment before requiring server to prevent port conflicts
process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const store = require('./store');

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    // Port 0 picks a free dynamic port
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`\n   Phase F test server listening on port ${port}\n`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function runTests() {
  console.log('--- Phase F: Reports, QR, Notifications Unit & Integration Tests ---');

  await startServer();

  try {
    // =========================================================
    // 1. Reports Generation & PDF Module (/reports)
    // =========================================================
    console.log('\n1. Testing Reports Generation & PDF Module (/reports)...');

    // 1.1 GET /reports (List available report summaries)
    const listRes = await fetch(`${baseUrl}/reports`);
    assert.strictEqual(listRes.status, 200, 'GET /reports should return 200');
    const reportsList = await listRes.json();
    assert(Array.isArray(reportsList), 'Reports list should be an array');
    assert(reportsList.length >= 3, 'Should list reports for at least 3 seed land parcels');
    const firstRep = reportsList[0];
    assert(firstRep.landId, 'Report summary should have landId');
    assert(firstRep.pdfUrl, 'Report summary should have pdfUrl');
    console.log(`   ✓ GET /reports returns ${reportsList.length} report summaries`);

    // 1.2 GET /reports/:landId (Comprehensive JSON Report Data)
    const report1Res = await fetch(`${baseUrl}/reports/1`);
    assert.strictEqual(report1Res.status, 200, 'GET /reports/1 should return 200');
    const r1 = await report1Res.json();

    // Verify all 15 spec fields are present:
    // (farmer info, Land ID, survey #, location, area, classification, map, doc list,
    //  verification result, legal status, valuation, govt approval, QR, blockchain tx ref, timestamp)
    assert(r1.farmerInfo && r1.farmerInfo.name, 'Report must contain farmer info');
    assert.strictEqual(r1.landId, '1', 'Report must have correct landId');
    assert(r1.surveyNumber && r1.surveyNumber.includes('142'), 'Report must contain survey number');
    assert(r1.location && r1.location.village && r1.location.state, 'Report must contain location details');
    
    // Area conversions (acres, hectares, sqm)
    assert(r1.area && r1.area.acres > 0, 'Report must contain area in acres');
    assert(r1.area.hectares > 0, 'Report must contain area in hectares');
    assert(r1.area.sqm > 0, 'Report must contain area in sqm');

    // 4-tier classification
    assert(r1.classification, 'Report must contain 4-tier classification');
    assert(r1.classification.farmerDeclared, 'Must have farmerDeclared');
    assert(r1.classification.govtRecord, 'Must have govtRecord');
    assert(r1.classification.groundVerified, 'Must have groundVerified');
    assert(r1.classification.finalApproved, 'Must have finalApproved');

    // Map & Geospatial boundary
    assert(r1.map && r1.map.coordinates, 'Report must contain map coordinates');
    assert(r1.map.centroid, 'Report must contain map centroid');

    // Document list
    assert(Array.isArray(r1.documentList), 'Report must contain attached documents list');
    assert(r1.documentList.length >= 2, 'Parcel 1 should have attached documents');
    assert(r1.documentList[0].fileHash, 'Document must have cryptographic hash');

    // Verification result & community attestations
    assert(r1.verificationResult, 'Report must contain verification result');
    assert(r1.verificationResult.verificationId, 'Must have verificationId');
    assert.strictEqual(r1.verificationResult.isEvidenceValid, true, 'Evidence must be valid');
    assert(r1.verificationResult.attestationScore >= 3, 'Must have attestation consensus score');
    assert(r1.verificationResult.attestations.length >= 3, 'Must list community attesters');

    // Legal status & encumbrances
    assert(r1.legalStatus, 'Report must contain legal status');
    assert.strictEqual(r1.legalStatus.hasDispute, false, 'Parcel 1 should have clear title');
    assert(r1.legalStatus.statusText.includes('CLEAR'), 'Status text indicates clear title');

    // Valuation details
    assert(r1.valuation && r1.valuation.govtRatePerAcre > 0, 'Must have govt valuation rate');
    assert(r1.valuation.govtTotalValue > 0, 'Must have total govt value');
    assert(r1.valuation.estimatedMarketTotalValue > 0, 'Must have estimated market total value');

    // Government approval
    assert(r1.govtApproval && r1.govtApproval.approvedBy, 'Must have approving authority');
    assert.strictEqual(r1.govtApproval.approvalStatus, 'APPROVED', 'Parcel 1 should be approved');

    // QR code non-PII reference
    assert(r1.qr && r1.qr.payload, 'Must have QR metadata');
    const parsedQrPayload = JSON.parse(r1.qr.payload);
    assert.strictEqual(parsedQrPayload.landId, '1', 'QR payload must contain Land ID');
    assert(parsedQrPayload.verificationId, 'QR payload must contain Verification ID');
    assert(!parsedQrPayload.name, 'QR payload must NOT contain farmer name (zero PII)');
    assert(!parsedQrPayload.nationalId, 'QR payload must NOT contain national ID (zero PII)');
    assert(!parsedQrPayload.contact, 'QR payload must NOT contain contact details (zero PII)');

    // Blockchain reference & Timestamp
    assert(r1.blockchain && r1.blockchain.txHash, 'Must have blockchain tx hash');
    assert(r1.timestamp, 'Must have ISO generation timestamp');
    assert(r1.formattedTimestamp, 'Must have formatted local timestamp');
    console.log('   ✓ GET /reports/1 returns comprehensive 15-field post-verification report');

    // 1.3 GET /reports/:landId/pdf (Stream real binary PDF)
    const pdfRes = await fetch(`${baseUrl}/reports/1/pdf`);
    assert.strictEqual(pdfRes.status, 200, 'GET /reports/1/pdf should return 200');
    assert.strictEqual(pdfRes.headers.get('content-type'), 'application/pdf', 'Content-Type must be application/pdf');
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    assert(pdfBuffer.length > 2000, `PDF size must be > 2KB (actual: ${pdfBuffer.length} bytes)`);
    assert.strictEqual(pdfBuffer.slice(0, 5).toString('ascii'), '%PDF-', 'Buffer must be valid PDF starting with %PDF-');
    console.log(`   ✓ GET /reports/1/pdf serves valid binary PDF (${pdfBuffer.length} bytes, starts with %PDF-)`);

    // 1.4 GET /reports/download/:landId (Download attachment disposition)
    const downloadRes = await fetch(`${baseUrl}/reports/download/1`);
    assert.strictEqual(downloadRes.status, 200, 'GET /reports/download/1 should return 200');
    assert(downloadRes.headers.get('content-disposition').includes('attachment'), 'Disposition must be attachment');
    console.log('   ✓ GET /reports/download/1 sets attachment Content-Disposition header');

    // 1.5 POST /reports/generate (On-demand generation)
    const genRes = await fetch(`${baseUrl}/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landId: '1', format: 'json' })
    });
    assert.strictEqual(genRes.status, 201, 'POST /reports/generate should return 201');
    const genJson = await genRes.json();
    assert.strictEqual(genJson.success, true);
    assert(genJson.pdfUrl, 'Must return direct pdfUrl');
    console.log('   ✓ POST /reports/generate produces on-demand report and PDF link');

    // 1.6 Error handling on unknown land parcel
    const notFoundReport = await fetch(`${baseUrl}/reports/unknown_9999`);
    assert.strictEqual(notFoundReport.status, 404, 'Unknown report should return 404');
    const notFoundJson = await notFoundReport.json();
    assert(notFoundJson.error, 'Should return error object');
    console.log('   ✓ Unknown land parcel report returns 404 with error message');

    // =========================================================
    // 2. Full Non-PII QR Flow & Scan Evaluation (/qr)
    // =========================================================
    console.log('\n2. Testing Non-PII QR Flow & Scan Statuses (/qr & /verify/:id)...');

    // 2.1 GET /qr (Documentation and endpoint specifications)
    const qrDocsRes = await fetch(`${baseUrl}/qr`);
    assert.strictEqual(qrDocsRes.status, 200, 'GET /qr should return 200');
    const qrDocs = await qrDocsRes.json();
    assert.deepStrictEqual(qrDocs.scanStatuses, ['VALID', 'INVALID', 'REVOKED', 'UNDER REVIEW']);
    console.log('   ✓ GET /qr specifies all 4 scan statuses: VALID, INVALID, REVOKED, UNDER REVIEW');

    // 2.2 GET /qr/:landId (Metadata and strict Non-PII assurance)
    const qrMetaRes = await fetch(`${baseUrl}/qr/1`);
    assert.strictEqual(qrMetaRes.status, 200, 'GET /qr/1 should return 200');
    const qrMeta = await qrMetaRes.json();
    assert.strictEqual(qrMeta.landId, '1');
    assert(qrMeta.verificationId, 'Must have verificationId');
    assert(qrMeta.qrImage.startsWith('data:image/png;base64,'), 'Must provide base64 PNG data URL');
    assert.strictEqual(qrMeta.scanStatus, 'VALID', 'Parcel 1 should scan as VALID');
    
    // Privacy invariant check: QR payload must ONLY contain landId + verificationId
    const qrPayloadKeys = Object.keys(qrMeta.qrPayload);
    assert.deepStrictEqual(qrPayloadKeys.sort(), ['landId', 'verificationId'].sort(), 'QR payload must contain ONLY landId and verificationId');
    assert.strictEqual(qrMeta.privacyCheck.containsPii, false, 'Zero PII invariant strictly enforced');
    console.log('   ✓ GET /qr/1 produces verified non-PII QR payload (only landId + verificationId)');

    // 2.3 GET /qr/:landId/image (Raw PNG image stream)
    const qrImgRes = await fetch(`${baseUrl}/qr/1/image`);
    assert.strictEqual(qrImgRes.status, 200, 'GET /qr/1/image should return 200');
    assert.strictEqual(qrImgRes.headers.get('content-type'), 'image/png', 'Must return image/png');
    const qrImgBuffer = Buffer.from(await qrImgRes.arrayBuffer());
    assert(qrImgBuffer.length > 500, 'PNG buffer must contain image data');
    console.log(`   ✓ GET /qr/1/image streams valid PNG image (${qrImgBuffer.length} bytes)`);

    // 2.4 Testing Scan Status: VALID (Parcel 1 is Approved & verified)
    const scanValidRes = await fetch(`${baseUrl}/qr/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landId: '1', verificationId: qrMeta.verificationId })
    });
    assert.strictEqual(scanValidRes.status, 200, 'Scan should return 200');
    const scanValid = await scanValidRes.json();
    assert.strictEqual(scanValid.status, 'VALID', 'Approved parcel with valid hash must return VALID');
    assert.strictEqual(scanValid.isEvidenceValid, true);
    assert.strictEqual(scanValid.hasDispute, false);
    console.log('   ✓ Status 1/4: VALID returned for approved, untampered parcel');

    // 2.5 Testing Scan Status: UNDER REVIEW (Parcel 2 in Ground Verification stage)
    const scanUnderReviewRes = await fetch(`${baseUrl}/qr/scan?landId=2`);
    assert.strictEqual(scanUnderReviewRes.status, 200);
    const scanUnderReview = await scanUnderReviewRes.json();
    assert.strictEqual(scanUnderReview.status, 'UNDER REVIEW', 'In-progress parcel must return UNDER REVIEW');
    console.log('   ✓ Status 2/4: UNDER REVIEW returned for in-pipeline parcel');

    // 2.6 Testing Scan Status: UNDER REVIEW via Active Dispute (Parcel 3 is Disputed)
    const scanDisputeRes = await fetch(`${baseUrl}/qr/scan/3`);
    assert.strictEqual(scanDisputeRes.status, 200);
    const scanDispute = await scanDisputeRes.json();
    assert.strictEqual(scanDispute.status, 'UNDER REVIEW', 'Disputed parcel must return UNDER REVIEW');
    assert.strictEqual(scanDispute.hasDispute, true, 'hasDispute flag must be true');
    console.log('   ✓ Status 2/4 (Dispute): UNDER REVIEW returned for parcel with active dispute');

    // 2.7 Testing Scan Status: REVOKED (Rejected/Revoked parcel)
    // Create a temporary rejected parcel
    await store.claims.save({
      claimId: '99',
      landId: '99',
      ownerName: 'Revoked Owner',
      nationalId: 'IND-REV-001',
      evidenceHash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      status: 'Rejected',
      workflowStatus: 'REJECTED'
    });
    const scanRevokedRes = await fetch(`${baseUrl}/qr/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landId: '99' })
    });
    const scanRevoked = await scanRevokedRes.json();
    assert.strictEqual(scanRevoked.status, 'REVOKED', 'Rejected parcel must return REVOKED');
    console.log('   ✓ Status 3/4: REVOKED returned for rejected/cancelled title');

    // 2.8 Testing Scan Status: INVALID
    // Case A: Unknown Land ID
    const scanInvalidIdRes = await fetch(`${baseUrl}/qr/scan?landId=non_existent_99999`);
    const scanInvalidId = await scanInvalidIdRes.json();
    assert.strictEqual(scanInvalidId.status, 'INVALID', 'Non-existent landId must return INVALID');

    // Case B: Forged/Counterfeit verificationId
    const scanForgedRes = await fetch(`${baseUrl}/qr/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landId: '1', verificationId: '0xFORGED_COUNTERFEIT_VERIFICATION_HASH' })
    });
    const scanForged = await scanForgedRes.json();
    assert.strictEqual(scanForged.status, 'INVALID', 'Mismatched verificationId must return INVALID');
    console.log('   ✓ Status 4/4: INVALID returned for non-existent parcel and counterfeit verification IDs');

    // 2.9 Testing Extended GET /verify/:id (Public QR landing view)
    const publicVerifyRes = await fetch(`${baseUrl}/verify/1`);
    assert.strictEqual(publicVerifyRes.status, 200, 'GET /verify/1 should return 200');
    const publicVerify = await publicVerifyRes.json();
    assert.strictEqual(publicVerify.claimId, '1');
    assert.strictEqual(publicVerify.isEvidenceValid, true);
    assert.strictEqual(publicVerify.scanStatus, 'VALID', 'Extended verify endpoint should return scanStatus VALID');
    assert.deepStrictEqual(Object.keys(publicVerify.qrPayload).sort(), ['landId', 'verificationId'].sort());
    console.log('   ✓ GET /verify/:id extended with scanStatus (VALID) & non-PII qrPayload without regression');

    // =========================================================
    // 3. Notifications Collection & Auto-Triggering (/notifications)
    // =========================================================
    console.log('\n3. Testing Stub Notifications Collection & Auto-Triggers (/notifications)...');

    // 3.1 GET /notifications (List seed notifications)
    const notifsRes = await fetch(`${baseUrl}/notifications`);
    assert.strictEqual(notifsRes.status, 200, 'GET /notifications should return 200');
    const notifs = await notifsRes.json();
    assert(Array.isArray(notifs), 'Notifications must be an array');
    assert(notifs.length >= 3, 'Must contain seed notifications');
    console.log(`   ✓ GET /notifications returns ${notifs.length} notification rows`);

    // 3.2 Filtering notifications by role, landId, and unread status
    const farmerNotifsRes = await fetch(`${baseUrl}/notifications?role=Farmer`);
    const farmerNotifs = await farmerNotifsRes.json();
    assert(farmerNotifs.length >= 1, 'Should find notifications for Farmer role');

    const land1NotifsRes = await fetch(`${baseUrl}/notifications?landId=1`);
    const land1Notifs = await land1NotifsRes.json();
    assert(land1Notifs.length >= 1, 'Should find notifications for Land Parcel 1');

    const unreadNotifsRes = await fetch(`${baseUrl}/notifications?unreadOnly=true`);
    const unreadNotifs = await unreadNotifsRes.json();
    assert(unreadNotifs.every(n => !n.read), 'Every returned notification must be unread');
    console.log('   ✓ Query filtering by role, landId, and unreadOnly works');

    // 3.3 GET /notifications/unread-count
    const unreadCountRes = await fetch(`${baseUrl}/notifications/unread-count`);
    assert.strictEqual(unreadCountRes.status, 200);
    const countData = await unreadCountRes.json();
    assert(typeof countData.unreadCount === 'number', 'unreadCount must be a number');
    assert(countData.totalCount >= countData.unreadCount, 'totalCount >= unreadCount');
    console.log(`   ✓ GET /notifications/unread-count returns ${countData.unreadCount} unread out of ${countData.totalCount}`);

    // 3.4 POST /notifications (Manual creation)
    const createNotifRes = await fetch(`${baseUrl}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        landId: '1',
        role: 'Farmer',
        type: 'CUSTOM_ALERT',
        title: 'Survey Office Reminder',
        message: 'Your field boundary verification sketch is ready for pickup at taluk office.'
      })
    });
    assert.strictEqual(createNotifRes.status, 201, 'POST /notifications should return 201');
    const createdNotifJson = await createNotifRes.json();
    assert(createdNotifJson.notification && createdNotifJson.notification.id, 'Must return created notification with id');
    const newNotifId = createdNotifJson.notification.id;
    console.log(`   ✓ POST /notifications created manual stub record #${newNotifId}`);

    // 3.5 PATCH /notifications/:id/read (Mark as read)
    const markReadRes = await fetch(`${baseUrl}/notifications/${newNotifId}/read`, {
      method: 'PATCH'
    });
    assert.strictEqual(markReadRes.status, 200, 'PATCH /notifications/:id/read should return 200');
    const markReadJson = await markReadRes.json();
    assert.strictEqual(markReadJson.notification.read, true, 'read flag must now be true');
    assert(markReadJson.notification.readAt, 'readAt timestamp must be recorded');
    console.log('   ✓ PATCH /notifications/:id/read marks notification as read with timestamp');

    // 3.6 POST /notifications/mark-all-read (Bulk mark read)
    const markAllRes = await fetch(`${baseUrl}/notifications/mark-all-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landId: '1' })
    });
    assert.strictEqual(markAllRes.status, 200);
    const markAllJson = await markAllRes.json();
    assert(typeof markAllJson.updatedCount === 'number');
    console.log(`   ✓ POST /notifications/mark-all-read bulk updated ${markAllJson.updatedCount} notification(s)`);

    // 3.7 Critical Invariant: Status change triggers a notification row
    console.log('   -> Verifying status change auto-triggers notification row...');
    const notifsBeforeCount = (await store.notifications.getAll()).length;

    // Trigger an audit log status transition on land #2
    await store.recordAuditLog({
      who: 'Officer Kulkarni (Government Officer)',
      what: 'GOVERNMENT_REVIEW_APPROVED',
      landId: '2',
      prevValue: 'GOVERNMENT_REVIEW',
      newValue: 'APPROVED',
      remarks: 'Title and survey verified. Approved for digital registry entry.'
    });

    const notifsAfter = await store.notifications.getAll();
    assert.strictEqual(notifsAfter.length, notifsBeforeCount + 1, 'A new notification row MUST be created on status change');
    const latestNotif = notifsAfter.find(n => n.type === 'GOVERNMENT_REVIEW_APPROVED');
    assert(latestNotif, 'Must find auto-triggered notification with matching type');
    assert.strictEqual(latestNotif.landId, '2', 'Notification landId matches');
    assert.strictEqual(latestNotif.prevStatus, 'GOVERNMENT_REVIEW');
    assert.strictEqual(latestNotif.newStatus, 'APPROVED');
    assert.strictEqual(latestNotif.read, false, 'Auto-triggered notification is unread');
    console.log('   ✓ Status change on Parcel #2 automatically triggered a new notification row!');

    // 3.8 DELETE /notifications/:id
    const deleteRes = await fetch(`${baseUrl}/notifications/${newNotifId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(deleteRes.status, 200, 'DELETE /notifications/:id should return 200');
    console.log('   ✓ DELETE /notifications/:id successfully deleted test notification');

    // =========================================================
    // 4. API Prefix Checks (/api/reports, /api/qr, /api/notifications)
    // =========================================================
    console.log('\n4. Testing /api/ prefix endpoints...');
    const apiReportRes = await fetch(`${baseUrl}/api/reports/1`);
    assert.strictEqual(apiReportRes.status, 200, 'GET /api/reports/1 should return 200');
    console.log('   ✓ GET /api/reports/1 returns 200');

    const apiQrRes = await fetch(`${baseUrl}/api/qr/1`);
    assert.strictEqual(apiQrRes.status, 200, 'GET /api/qr/1 should return 200');
    console.log('   ✓ GET /api/qr/1 returns 200');

    const apiNotifsRes = await fetch(`${baseUrl}/api/notifications`);
    assert.strictEqual(apiNotifsRes.status, 200, 'GET /api/notifications should return 200');
    console.log('   ✓ GET /api/notifications returns 200');

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE F REPORTS, QR & NOTIFICATIONS TESTS PASSED! (100%)');
    console.log('======================================================\n');
  } finally {
    await stopServer();
  }
}

if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Phase F test failure:', err);
      process.exit(1);
    });
}

module.exports = { runTests };
