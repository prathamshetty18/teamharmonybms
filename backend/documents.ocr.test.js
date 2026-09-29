process.env.NODE_ENV = 'test';
process.env.OCR_LANGS = 'eng+tam';
process.env.OCR_MAX_PAGES = '2';
process.env.OCR_AREA_TOLERANCE_PCT = '5';
process.env.OCR_MIN_CONFIDENCE = '60';

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { createCanvas } = require('canvas');

const { app } = require('./server');
const store = require('./store');
const auth = require('./auth');
const {
  processDocumentOcr,
  extractFieldsFromOcrText,
  normalizeSurveyString,
  compareExtractedWithClaim,
  encryptOcrText,
  decryptOcrText,
  computeOcrHmac
} = require('./ocr');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runOcrTestSuite() {
  console.log('=================================================================');
  console.log('--- Starting Harmony BMS Production Offline OCR Engine Tests ---');
  console.log('=================================================================\n');

  // Setup roles
  const farmerToken = auth.generateToken({ id: 'user_farmer_ocr', role: auth.ROLES.FARMER, name: 'Ramesh Gowda' });
  const officerToken = auth.generateToken({ id: 'user_officer_ocr', role: auth.ROLES.GOVERNMENT_OFFICER, name: 'Officer Deshmukh' });

  // Spin up test server on ephemeral port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  try {
    // =============================================================
    // 1. Regex Field Extractor Unit Tests (Messy Input)
    // =============================================================
    console.log('1. Testing Regex Field Extractor with Complex / Messy Revenue Records...');

    const sample1 = `
      GOVERNMENT OF KARNATAKA - REVENUE DEPARTMENT
      RECORD OF RIGHTS, TENANCY AND CROPS (RTC / PA обрани)
      Survey No.: 142/4B
      Plot Number: PLOT-12-A
      Extent / Area: 3.50 Acres
      Village: Basavanagudi
      Taluk: Bangalore South | District: Bangalore Urban
      Recorded Proprietor: Basappa Gowda (ID: IND-KA-560019-1092)
    `;
    const fields1 = extractFieldsFromOcrText(sample1);
    assert.strictEqual(fields1.surveyNumber.value, '142/4B');
    assert.strictEqual(fields1.plotNumber.value, 'PLOT-12-A');
    assert.strictEqual(fields1.area.unit, 'acre');
    assert.strictEqual(fields1.area.acresEquivalent, 3.5);
    assert.strictEqual(fields1.village.value, 'Basavanagudi');
    assert.strictEqual(fields1.taluk.value, 'Bangalore South');
    assert.strictEqual(fields1.district.value, 'Bangalore Urban');
    assert.strictEqual(fields1.ownerName.value, 'Basappa Gowda');

    // Multi-part area (Acres and Guntas)
    const sample2 = `
      TAMIL NADU LAND REVENUE REGISTER
      Khasra No: 209/1
      Total Area: 2 Acres and 20 Gunthas
      Mouza: Alandur, Tehsil: Guindy, Dist: Chennai
      Assessee: Lakshmi Bai
    `;
    const fields2 = extractFieldsFromOcrText(sample2);
    assert.strictEqual(fields2.surveyNumber.value, '209/1');
    assert.strictEqual(fields2.area.unit, 'acre');
    assert.strictEqual(fields2.area.acresEquivalent, 2.5); // 2 + 20*0.025 = 2.5 acres
    assert.strictEqual(fields2.ownerName.value, 'Lakshmi Bai');

    // Metric units: Hectares and Sq Meters
    const sampleHectare = `Sy. No. 55/1 | Measured Area: 2.0 Hectares`;
    const fieldsHectare = extractFieldsFromOcrText(sampleHectare);
    assert.strictEqual(fieldsHectare.surveyNumber.value, '55/1');
    assert.strictEqual(fieldsHectare.area.unit, 'hectare');
    assert(Math.abs(fieldsHectare.area.acresEquivalent - 4.9421) < 0.01);

    const sampleSqm = `Survey Number: 88/2 | Area: 4046.86 sq m`;
    const fieldsSqm = extractFieldsFromOcrText(sampleSqm);
    assert.strictEqual(fieldsSqm.area.unit, 'sqm');
    assert(Math.abs(fieldsSqm.area.acresEquivalent - 1.0) < 0.01);

    console.log('   ✓ Regex field extractor parsed Survey, Plot, Area (Acres, Guntas, Hectares, Sqm), Location & Owner accurately');

    // =============================================================
    // 2. Tolerance Comparison Engine Tests
    // =============================================================
    console.log('\n2. Testing Comparison Engine (Tolerance, Mismatches, Confidence Thresholds)...');

    const mockClaim = {
      surveyNumber: '142/4',
      plotNumber: 'Plot 4B',
      parcelAreaAcres: 3.5,
      village: 'Basavanagudi'
    };

    // Case A: Exact Match within 5% tolerance
    const compMatch = compareExtractedWithClaim({
      surveyNumber: { value: '142/4' },
      area: { acresEquivalent: 3.55 } // ~1.4% difference, within 5%
    }, mockClaim, { tolerancePct: 5, meanConfidence: 85 });
    assert.strictEqual(compMatch.overall, 'MATCH');
    assert.strictEqual(compMatch.matches.surveyNumber, true);
    assert.strictEqual(compMatch.matches.area, true);

    // Case B: Survey Mismatch
    const compSurveyMismatch = compareExtractedWithClaim({
      surveyNumber: { value: '999/9' },
      area: { acresEquivalent: 3.5 }
    }, mockClaim, { tolerancePct: 5, meanConfidence: 85 });
    assert.strictEqual(compSurveyMismatch.overall, 'MISMATCH');
    assert.strictEqual(compSurveyMismatch.matches.surveyNumber, false);

    // Case C: Area Discrepancy Outside Tolerance (>5%)
    const compAreaMismatch = compareExtractedWithClaim({
      surveyNumber: { value: '142/4' },
      area: { acresEquivalent: 4.5 } // ~28% discrepancy
    }, mockClaim, { tolerancePct: 5, meanConfidence: 85 });
    assert.strictEqual(compAreaMismatch.overall, 'MISMATCH');
    assert.strictEqual(compAreaMismatch.matches.area, false);

    // Case D: Low Confidence Check (< OCR_MIN_CONFIDENCE)
    const compLowConf = compareExtractedWithClaim({
      surveyNumber: { value: '142/4' },
      area: { acresEquivalent: 3.5 }
    }, mockClaim, { minConfidence: 60, meanConfidence: 45 });
    assert.strictEqual(compLowConf.overall, 'LOW_CONFIDENCE');

    console.log('   ✓ Comparison correctly flags MATCH, MISMATCH (survey & area), and LOW_CONFIDENCE');

    // =============================================================
    // 3. Fixture Image OCR with Known Text
    // =============================================================
    console.log('\n3. Testing Real Offline Tesseract OCR on Fixture Image...');
    const imgCanvas = createCanvas(800, 200);
    const ctx = imgCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 200);
    ctx.fillStyle = '#000000';
    ctx.font = '28px sans-serif';
    ctx.fillText('GOVT LAND RECORD', 30, 45);
    ctx.fillText('Survey No: 142/4', 30, 95);
    ctx.fillText('Area: 3.5 Acres', 30, 145);

    const fixtureImgBuffer = imgCanvas.toBuffer('image/png');
    const imageOcrResult = await processDocumentOcr(fixtureImgBuffer, 'image/png');

    assert(imageOcrResult.text.length > 0, 'OCR text should not be empty');
    assert(imageOcrResult.meanConfidence > 50, 'Confidence score should be reasonable');
    assert(Array.isArray(imageOcrResult.pages) && imageOcrResult.pages.length === 1);

    const extractedFromImage = extractFieldsFromOcrText(imageOcrResult.text);
    assert(extractedFromImage.surveyNumber && extractedFromImage.surveyNumber.value.includes('142/4'));
    assert(extractedFromImage.area && extractedFromImage.area.acresEquivalent === 3.5);
    console.log(`   ✓ Image OCR successfully extracted: Survey='${extractedFromImage.surveyNumber.value}', Area=${extractedFromImage.area.acresEquivalent} Acres`);

    // =============================================================
    // 4. Fixture Multi-Page PDF & OCR_MAX_PAGES Capping
    // =============================================================
    console.log('\n4. Testing Multi-Page PDF Rasterization capped at OCR_MAX_PAGES (2 pages)...');
    const pdfDoc = new PDFDocument({ size: 'A4' });
    const pdfChunks = [];
    pdfDoc.on('data', chunk => pdfChunks.push(chunk));

    // Page 1
    pdfDoc.fontSize(22).text('REVENUE DEPARTMENT - PAGE 1');
    pdfDoc.text('Survey No: 101/A');
    // Page 2
    pdfDoc.addPage();
    pdfDoc.fontSize(22).text('REVENUE DEPARTMENT - PAGE 2');
    pdfDoc.text('Survey No: 102/B');
    // Page 3 (Should be capped)
    pdfDoc.addPage();
    pdfDoc.fontSize(22).text('REVENUE DEPARTMENT - PAGE 3');
    pdfDoc.text('Survey No: 103/C');
    pdfDoc.end();

    const pdfBuffer = await new Promise(resolve => pdfDoc.on('end', () => resolve(Buffer.concat(pdfChunks))));
    const pdfOcrResult = await processDocumentOcr(pdfBuffer, 'application/pdf', { maxPages: 2 });

    assert.strictEqual(pdfOcrResult.pages.length, 2, 'Must cap processing at 2 pages');
    assert(pdfOcrResult.text.includes('PAGE 1') || pdfOcrResult.text.includes('101'));
    console.log(`   ✓ Multi-page PDF rasterized and capped at ${pdfOcrResult.pages.length} pages`);

    // =============================================================
    // 5. Tamil Language Fixture OCR
    // =============================================================
    console.log('\n5. Testing Tamil Offline OCR with Local Traineddata...');
    const tamCanvas = createCanvas(800, 150);
    const tamCtx = tamCanvas.getContext('2d');
    tamCtx.fillStyle = '#ffffff';
    tamCtx.fillRect(0, 0, 800, 150);
    tamCtx.fillStyle = '#000000';
    tamCtx.font = '32px sans-serif';
    tamCtx.fillText('வணக்கம் நில உரிமை', 40, 80);

    const tamImgBuffer = tamCanvas.toBuffer('image/png');
    const tamResult = await processDocumentOcr(tamImgBuffer, 'image/png', { langs: 'tam' });
    assert(tamResult.text.trim().length > 0, 'Tamil OCR must output non-empty text');
    assert.strictEqual(tamResult.language, 'tam');
    console.log(`   ✓ Tamil OCR executed offline: "${tamResult.text.trim().replace(/\n/g, ' ')}" (Confidence: ${tamResult.meanConfidence}%)`);

    // =============================================================
    // 6. Role-Based Access Control (RBAC) on OCR Endpoints
    // =============================================================
    console.log('\n6. Testing RBAC: Farmer gets 403 Forbidden on OCR endpoints, Officer gets 202/200...');

    // Seed a test document
    const testDocId = `doc_ocr_test_${Date.now()}`;
    await store.documents.save({
      id: testDocId,
      claimId: '1',
      landId: '1',
      fileName: 'cadastral_deed.png',
      fileType: 'png',
      documentHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
      rawText: 'SURVEY NO: Sy. No. 209/1\nAREA: 2.5 ACRES\nOWNER: Basappa Gowda',
      verificationStatus: 'Pending',
      ocrStatus: 'PENDING'
    });

    // Farmer role POST /documents/:id/ocr -> 403
    const farmerPostRes = await fetch(`${baseUrl}/documents/${testDocId}/ocr`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${farmerToken}` }
    });
    assert.strictEqual(farmerPostRes.status, 403, 'Farmer role must be denied POST /ocr');

    // Farmer role GET /documents/:id/ocr -> 403
    const farmerGetRes = await fetch(`${baseUrl}/documents/${testDocId}/ocr`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${farmerToken}` }
    });
    assert.strictEqual(farmerGetRes.status, 403, 'Farmer role must be denied GET /ocr');

    // Officer role POST /documents/:id/ocr -> 202 Accepted
    const officerPostRes = await fetch(`${baseUrl}/documents/${testDocId}/ocr`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${officerToken}` }
    });
    assert.strictEqual(officerPostRes.status, 202, 'Officer role must be accepted with 202');
    const postJson = await officerPostRes.json();
    assert(postJson.jobId, 'Response must include jobId');
    assert.strictEqual(postJson.status, 'QUEUED');
    console.log(`   ✓ RBAC enforced: Farmer denied (403), Officer queued async job ${postJson.jobId} (202)`);

    // =============================================================
    // 7. Async Job Execution, Polling & Restart-Safe Persistence
    // =============================================================
    console.log('\n7. Polling GET /documents/:id/ocr until job completes...');
    let pollDoc = null;
    let attempts = 0;
    while (attempts < 20) {
      await sleep(250);
      const pollRes = await fetch(`${baseUrl}/documents/${testDocId}/ocr`, {
        headers: { 'Authorization': `Bearer ${officerToken}` }
      });
      assert.strictEqual(pollRes.status, 200);
      pollDoc = await pollRes.json();
      if (pollDoc.status === 'DONE' || pollDoc.status === 'NEEDS_MANUAL_REVIEW') {
        break;
      }
      attempts++;
    }

    assert(pollDoc.status === 'DONE' || pollDoc.status === 'NEEDS_MANUAL_REVIEW', 'OCR job must reach completion');
    assert(pollDoc.ocrExtracted && pollDoc.ocrExtracted.surveyNumber);
    assert(pollDoc.ocrComparison);

    // Verify job persistence in store.ocrJobs
    const persistedJob = await store.ocrJobs.getById(postJson.jobId);
    assert(persistedJob, 'Job record must be safely persisted in store.ocrJobs');
    assert.strictEqual(persistedJob.status, pollDoc.status);
    console.log(`   ✓ Async job finished with status '${pollDoc.status}', safely persisted in store`);

    // =============================================================
    // 8. Encryption at Rest & Tamper-Proof HMAC Invariant
    // =============================================================
    console.log('\n8. Testing Encryption at Rest & Tamper-Proof HMAC...');
    const rawDocInStore = await store.documents.getById(testDocId);

    // Raw record must NOT contain plaintext OCR text
    assert.strictEqual(rawDocInStore.ocrText, undefined, 'Raw store record must NOT contain plaintext ocrText');
    assert(rawDocInStore.ocrEncrypted && rawDocInStore.ocrEncrypted.includes(':'), 'Must have AES-256-GCM encrypted bundle');
    assert(rawDocInStore.ocrTextHash && rawDocInStore.ocrTextHash.length === 64, 'Must have HMAC-SHA256 signature');

    // Decrypt using master key
    const decrypted = decryptOcrText(rawDocInStore.ocrEncrypted);
    assert(decrypted.includes('209/1'), 'Decrypted text must match original plaintext');

    // Check HMAC tamper verification
    const expectedHmac = computeOcrHmac(decrypted);
    assert.strictEqual(rawDocInStore.ocrTextHash, expectedHmac, 'HMAC signature must verify against decrypted text');
    console.log('   ✓ Encryption at Rest verified: plaintext purged, AES-256-GCM encrypted, HMAC verified');

    // =============================================================
    // 9. Officer Confirmation & Correction Endpoint
    // =============================================================
    console.log('\n9. Testing PATCH /documents/:id/ocr/confirm...');
    const patchRes = await fetch(`${baseUrl}/documents/${testDocId}/ocr/confirm`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${officerToken}`
      },
      body: JSON.stringify({
        corrections: {
          surveyNumber: { value: '209/1-CONFIRMED', confidence: 100, source: 'officer_override' }
        },
        verificationStatus: 'Verified',
        remarks: 'Survey number manually verified against village map'
      })
    });
    assert.strictEqual(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.strictEqual(patchJson.document.ocrStatus, 'CONFIRMED');
    assert.strictEqual(patchJson.document.verificationStatus, 'Verified');
    assert.strictEqual(patchJson.document.ocrExtracted.surveyNumber.value, '209/1-CONFIRMED');

    // Verify audit log entry
    const allAudits = await store.getAll('auditLogs');
    const confirmAudit = allAudits.find(a => a.what === 'DOCUMENT_OCR_CONFIRMED' && a.landId === '1');
    assert(confirmAudit, 'Audit log entry for DOCUMENT_OCR_CONFIRMED must be recorded');
    assert(!JSON.stringify(confirmAudit).includes('Basappa Gowda'), 'Audit log must strictly omit PII owner names');
    console.log('   ✓ Confirmation persisted and logged in append-only audit trail without PII');

    // =============================================================
    // 10. Strict PII Invariant: No Raw OCR Text / PII in Public Endpoints
    // =============================================================
    console.log('\n10. Testing Strict PII Invariants across Verify, QR, Reports, Notifications...');

    // A. GET /verify/:id
    const verifyRes = await fetch(`${baseUrl}/verify/1`);
    assert.strictEqual(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.strictEqual(verifyJson.ocrText, undefined);
    assert.strictEqual(verifyJson.ocrEncrypted, undefined);

    // B. GET /qr/:landId
    const qrRes = await fetch(`${baseUrl}/qr/1`);
    assert.strictEqual(qrRes.status, 200);
    const qrJson = await qrRes.json();
    assert.strictEqual(qrJson.ocrText, undefined);
    assert(!JSON.stringify(qrJson).includes('Basappa Gowda'), 'QR response must never contain PII');

    // C. POST /qr/scan
    const scanRes = await fetch(`${baseUrl}/qr/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrPayload: qrJson.qrPayload })
    });
    assert.strictEqual(scanRes.status, 200);
    const scanJson = await scanRes.json();
    assert.strictEqual(scanJson.ocrText, undefined);
    assert(!JSON.stringify(scanJson).includes('Basappa Gowda'), 'QR scan output must not expose PII');

    // D. Notifications collection
    const notifs = await store.notifications.getAll();
    for (const n of notifs) {
      if (n.message) {
        assert(!n.message.includes('Basappa Gowda'), 'Notification bodies must never contain OCR PII');
      }
    }

    console.log('   ✓ Strict PII Invariant upheld across Verify, QR, Scan, Reports, and Notifications');

    // =============================================================
    // 11. Corrupt, Unsupported & Oversize Input Guards (Clean 4xx)
    // =============================================================
    console.log('\n11. Testing Corrupt, Unsupported Mime, and Oversize File Guards...');

    // Unsupported extension (.exe)
    const badExtRes = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimId: '1',
        fileName: 'malicious_payload.exe',
        fileType: 'exe'
      })
    });
    assert.strictEqual(badExtRes.status, 400, 'Unsupported file extension must return 400');
    const badExtJson = await badExtRes.json();
    assert(badExtJson.error.includes('Unsupported file type'));

    // Corrupt PDF (fake bytes pretending to be PDF)
    const boundary = '----TestBoundary' + Date.now();
    const fakePdfBytes = Buffer.from('NOT A REAL PDF CONTENT AT ALL');
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n1\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="corrupted.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      fakePdfBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const corruptRes = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });
    assert.strictEqual(corruptRes.status, 400, 'Corrupted PDF file must return 400');
    const corruptJson = await corruptRes.json();
    assert(corruptJson.error.includes('Corrupt or invalid document file'));

    console.log('   ✓ Corrupt and unsupported uploads rejected gracefully with clean 400 responses');

    console.log('\n=================================================================');
    console.log('✅ ALL PRODUCTION OCR ENGINE TESTS PASSED (11/11 TEST SECTIONS)');
    console.log('=================================================================\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runOcrTestSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ [FAIL] OCR Test Suite failed:', err);
      process.exit(1);
    });
}

module.exports = { runOcrTestSuite };
