const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const store = require('../store');
const { getVerificationCertificate } = require('../relief');

/**
 * Helper to evaluate QR scan status: VALID, INVALID, REVOKED, UNDER REVIEW
 * Strict Non-PII guarantee.
 */
async function evaluateQrScan({ landId, verificationId = null }) {
  const strId = landId ? String(landId).trim() : '';
  if (!strId) {
    return {
      status: 'INVALID',
      scanStatus: 'INVALID',
      landId: null,
      verificationId: verificationId || null,
      isEvidenceValid: false,
      hasDispute: false,
      details: 'Missing Land ID in QR payload.',
      scanTimestamp: new Date().toISOString()
    };
  }

  const claim = await store.claims.getById(strId);
  if (!claim) {
    return {
      status: 'INVALID',
      scanStatus: 'INVALID',
      landId: strId,
      verificationId: verificationId || null,
      isEvidenceValid: false,
      hasDispute: false,
      details: `Land parcel #${strId} does not exist in registry.`,
      scanTimestamp: new Date().toISOString()
    };
  }

  // If verificationId was supplied in the QR code, verify it matches the parcel's stored hash
  const expectedVerificationId = claim.evidenceHash || '';
  if (verificationId && expectedVerificationId) {
    const normProvided = String(verificationId).trim().toLowerCase();
    const normExpected = String(expectedVerificationId).trim().toLowerCase();
    if (normProvided !== normExpected && !normExpected.includes(normProvided)) {
      return {
        status: 'INVALID',
        scanStatus: 'INVALID',
        landId: strId,
        verificationId,
        expectedVerificationId,
        isEvidenceValid: false,
        hasDispute: false,
        details: 'Cryptographic Verification ID mismatch. Possible counterfeit or tampered QR code.',
        scanTimestamp: new Date().toISOString()
      };
    }
  }

  // Obtain certificate to test evidence hash recomputation
  let cert = null;
  try {
    cert = await getVerificationCertificate(strId);
  } catch (e) {
    cert = { isEvidenceValid: true, hasDispute: false, scanStatus: 'UNDER REVIEW' };
  }

  if (cert.isEvidenceValid === false) {
    return {
      status: 'INVALID',
      scanStatus: 'INVALID',
      landId: strId,
      verificationId: expectedVerificationId,
      isEvidenceValid: false,
      hasDispute: Boolean(cert.hasDispute),
      details: 'Evidence hash re-computation failed. Data tampering detected.',
      scanTimestamp: new Date().toISOString()
    };
  }

  const workflowStatus = claim.workflowStatus || (claim.status === 'Verified' ? 'APPROVED' : 'SUBMITTED');
  const normWorkflow = workflowStatus.toUpperCase();
  const normLegacy = (claim.status || '').toUpperCase();

  // Check for Revoked / Rejected
  if (normWorkflow === 'REJECTED' || normLegacy === 'REJECTED' || normLegacy === 'REVOKED') {
    return {
      status: 'REVOKED',
      scanStatus: 'REVOKED',
      landId: strId,
      verificationId: expectedVerificationId,
      isEvidenceValid: cert.isEvidenceValid,
      hasDispute: Boolean(cert.hasDispute),
      workflowStatus,
      details: 'Land parcel registration has been officially revoked or rejected by government authority.',
      scanTimestamp: new Date().toISOString()
    };
  }

  // Check for Active Disputes or in-progress review
  if (cert.hasDispute || normWorkflow === 'DISPUTED' || normLegacy === 'DISPUTED') {
    return {
      status: 'UNDER REVIEW',
      scanStatus: 'UNDER REVIEW',
      landId: strId,
      verificationId: expectedVerificationId,
      isEvidenceValid: cert.isEvidenceValid,
      hasDispute: true,
      workflowStatus,
      details: 'Active boundary or title dispute flagged against this land parcel. Under legal/administrative review.',
      scanTimestamp: new Date().toISOString()
    };
  }

  if (normWorkflow === 'APPROVED' || normLegacy === 'VERIFIED') {
    return {
      status: 'VALID',
      scanStatus: 'VALID',
      landId: strId,
      verificationId: expectedVerificationId,
      isEvidenceValid: true,
      hasDispute: false,
      workflowStatus: 'APPROVED',
      details: 'Official Digital Title is VALID and registered with tamper-proof blockchain evidence.',
      scanTimestamp: new Date().toISOString()
    };
  }

  // Any other intermediate state is UNDER REVIEW
  return {
    status: 'UNDER REVIEW',
    scanStatus: 'UNDER REVIEW',
    landId: strId,
    verificationId: expectedVerificationId,
    isEvidenceValid: cert.isEvidenceValid,
    hasDispute: false,
    workflowStatus,
    details: `Land application is currently in verification pipeline (${workflowStatus}). Pending final government approval.`,
    scanTimestamp: new Date().toISOString()
  };
}

/**
 * 1. GET /qr - QR flow overview & specifications
 */
router.get('/', (req, res) => {
  res.json({
    title: 'Harmony BMS Non-PII QR Verification Engine',
    description: 'Generates and scans non-PII QR codes for public land parcel verification.',
    privacyGuarantee: 'QR code payload strictly contains Land ID and Verification ID only. Zero PII (no names, phone numbers, or national IDs).',
    scanStatuses: ['VALID', 'INVALID', 'REVOKED', 'UNDER REVIEW'],
    endpoints: {
      generateMetadata: 'GET /qr/:landId',
      generateImage: 'GET /qr/:landId/image',
      scanPost: 'POST /qr/scan',
      scanGet: 'GET /qr/scan?landId=...&verificationId=...'
    }
  });
});

/**
 * 2. GET /qr/scan - Scan verification via query parameters
 */
router.get('/scan', async (req, res, next) => {
  try {
    const { landId, verificationId } = req.query;
    const result = await evaluateQrScan({ landId, verificationId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 3. GET /qr/scan/:landId - Scan verification via path param
 */
router.get('/scan/:landId', async (req, res, next) => {
  try {
    const landId = req.params.landId;
    const verificationId = req.query.verificationId;
    const result = await evaluateQrScan({ landId, verificationId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 4. POST /qr/scan - Scan verification via JSON body (from camera or barcode scanner)
 */
router.post('/scan', async (req, res, next) => {
  try {
    let landId = req.body.landId;
    let verificationId = req.body.verificationId;

    // Handle parsed qrPayload string if sent
    if (!landId && req.body.qrPayload) {
      try {
        const parsed = typeof req.body.qrPayload === 'string'
          ? JSON.parse(req.body.qrPayload)
          : req.body.qrPayload;
        landId = parsed.landId;
        verificationId = parsed.verificationId;
      } catch (e) {
        // May be formatted as url like /verify/1?verificationId=...
        const match = String(req.body.qrPayload).match(/\/verify\/(\w+)/);
        if (match) landId = match[1];
      }
    }

    const result = await evaluateQrScan({ landId, verificationId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 5. GET /qr/:landId/image - Raw PNG image of non-PII QR code
 */
router.get('/:landId/image', async (req, res, next) => {
  try {
    const strId = String(req.params.landId);
    const claim = await store.claims.getById(strId);
    if (!claim) {
      return res.status(404).json({ error: `Land parcel with ID ${strId} not found` });
    }

    const verificationId = claim.evidenceHash || '0x' + '0'.repeat(64);
    const qrPayload = JSON.stringify({
      landId: strId,
      verificationId
    });

    const pngBuffer = await QRCode.toBuffer(qrPayload, {
      width: 250,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    res.send(pngBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * 6. GET /qr/:landId - Generate non-PII QR code metadata & image data URL
 */
router.get('/:landId', async (req, res, next) => {
  try {
    const strId = String(req.params.landId);
    const claim = await store.claims.getById(strId);
    if (!claim) {
      return res.status(404).json({ error: `Land parcel with ID ${strId} not found` });
    }

    const verificationId = claim.evidenceHash || '0x' + '0'.repeat(64);
    
    // Strict non-PII payload: Land ID + Verification ID ONLY
    const nonPiiPayload = {
      landId: strId,
      verificationId
    };

    const qrPayloadString = JSON.stringify(nonPiiPayload);
    const qrDataUrl = await QRCode.toDataURL(qrPayloadString, {
      width: 250,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });

    // Check current scan status
    const scanEvaluation = await evaluateQrScan({ landId: strId, verificationId });

    res.json({
      landId: strId,
      verificationId,
      qrPayload: nonPiiPayload,
      qrPayloadString,
      qrTargetUrl: `/verify/${strId}?verificationId=${encodeURIComponent(verificationId)}`,
      qrImage: qrDataUrl,
      scanStatus: scanEvaluation.scanStatus,
      status: scanEvaluation.status,
      hasDispute: scanEvaluation.hasDispute,
      isEvidenceValid: scanEvaluation.isEvidenceValid,
      workflowStatus: scanEvaluation.workflowStatus,
      privacyCheck: {
        containsPii: false,
        fieldsIncluded: ['landId', 'verificationId']
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
