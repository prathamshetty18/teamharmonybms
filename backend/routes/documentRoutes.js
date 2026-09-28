const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const { sha256Hex } = require('../utils/hash');
const { ROLES, requireRole } = require('../auth');

function createDocumentRoutes(upload) {
  const router = express.Router();
  const fileUploadMiddleware = upload ? upload.single('document') : (req, res, next) => next();

  // -------------------------------------------------------------
  // Helper: OCR Extraction Engine Stub for Demo
  // Simulates high-accuracy revenue document parser
  // -------------------------------------------------------------
  function performOcrScan({ fileName = '', documentType = 'title_deed', rawText = '', claim = null }) {
    const ownerName = claim ? claim.ownerName : 'Ramesh Gowda';
    const nationalId = claim ? claim.nationalId : 'IND-KA-560019-1092';
    const surveyNumber = claim && claim.surveyNumber ? claim.surveyNumber : 'Sy. No. 142/3A';
    const village = claim && claim.village ? claim.village : 'Basavanagudi';
    const district = claim && claim.district ? claim.district : 'Bangalore South';
    const acres = claim ? claim.parcelAreaAcres : 2.5;

    let ocrText = '';
    let ocrData = {};

    if (rawText && rawText.trim()) {
      ocrText = rawText.trim();
      ocrData = {
        surveyNumber,
        ownerName,
        district,
        village,
        extentAcres: acres,
        extractedFromRawText: true
      };
    } else if (documentType === 'title_deed') {
      ocrText = [
        'GOVERNMENT OF KARNATAKA - DEPARTMENT OF STAMPS & REGISTRATION',
        `REGISTERED TITLE CONVEYANCE DEED | ARCHIVE REF: KA-${district.toUpperCase()}-REG`,
        `SURVEY NUMBER: ${surveyNumber}`,
        `RECORDED PROPRIETOR / CLAIMANT: ${ownerName} (ID: ${nationalId})`,
        `PARCEL LOCATION: Village: ${village} | Taluk: ${district} | District: Bangalore Urban`,
        `EXTENT & MEASUREMENTS: ${acres} Acres (Wet Agricultural / Ancestral Holding)`,
        'SECURITY SEAL: Verified against District Revenue Sub-Registrar Database'
      ].join('\n');
      ocrData = {
        documentType: 'title_deed',
        surveyNumber,
        ownerName,
        extentAcres: acres,
        district,
        village,
        landUse: 'Agricultural',
        stampVerified: true
      };
    } else if (documentType === 'tax_receipt') {
      ocrText = [
        'GRAM PANCHAYAT / MUNICIPAL REVENUE ASSESSMENT RECORD',
        `ANNUAL PROPERTY TAX RECEIPT - FINANCIAL YEAR 2025-2026`,
        `KHATA / KHASRA NUMBER: ${surveyNumber}`,
        `ASSESSEE: ${ownerName}`,
        `LOCATION: ${village}, ${district}`,
        `ANNUAL CESS PAID IN FULL | CHALAN VERIFIED`
      ].join('\n');
      ocrData = {
        documentType: 'tax_receipt',
        surveyNumber,
        ownerName,
        taxCleared: true
      };
    } else {
      ocrText = [
        'REVENUE DEPARTMENT SURVEY & FIELD MAP SKETCH',
        `FIELD PLOT: ${surveyNumber} | AREA: ${acres} ACRES`,
        `RECORD HOLDER: ${ownerName}`,
        'SATELLITE & GPS BOUNDARY BENCHMARK CONFIRMED'
      ].join('\n');
      ocrData = {
        documentType: documentType || 'survey_sketch',
        surveyNumber,
        ownerName,
        extentAcres: acres
      };
    }

    return {
      ocrText,
      ocrData,
      confidenceScore: 0.96
    };
  }

  // -------------------------------------------------------------
  // 1. POST /documents/scan - OCR extraction stub
  // -------------------------------------------------------------
  router.post('/scan', fileUploadMiddleware, async (req, res, next) => {
    try {
      const { documentType, documentText, claimId, landId } = req.body || {};
      const targetClaimId = claimId || landId;
      let claim = null;
      if (targetClaimId) {
        claim = await store.claims.getById(targetClaimId);
      }

      const scanResult = performOcrScan({
        fileName: req.file ? req.file.originalname : '',
        documentType: documentType || 'title_deed',
        rawText: documentText,
        claim
      });

      res.json({
        message: 'OCR scan completed successfully',
        ...scanResult
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 2. POST /documents - Upload & register land document
  // -------------------------------------------------------------
  router.post('/', fileUploadMiddleware, async (req, res, next) => {
    try {
      const {
        claimId,
        landId,
        documentType = 'title_deed',
        notes = '',
        rawText = ''
      } = req.body || {};

      const targetId = claimId || landId;
      if (!targetId) {
        return res.status(400).json({ error: 'Missing required field: claimId (or landId)' });
      }

      const claim = await store.claims.getById(targetId);
      if (!claim) {
        return res.status(404).json({ error: `Land parcel / Claim with id '${targetId}' not found` });
      }

      let fileName = 'document.pdf';
      let fileType = 'pdf';
      let fileUrl = '/uploads/sample_document.pdf';
      let hashContent = `${targetId}_${documentType}_${Date.now()}`;

      if (req.file) {
        fileName = req.file.originalname;
        fileType = path.extname(req.file.originalname).replace('.', '').toLowerCase() || 'pdf';
        fileUrl = `/uploads/${req.file.filename}`;
        hashContent = req.file.filename + '_' + req.file.size;
      } else if (req.body.fileName) {
        fileName = req.body.fileName;
        fileType = req.body.fileType || (path.extname(fileName).replace('.', '') || 'pdf');
        fileUrl = req.body.fileUrl || fileUrl;
      }

      const docHash = sha256Hex(hashContent);
      const scanResult = performOcrScan({
        fileName,
        documentType,
        rawText,
        claim
      });

      const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newDoc = {
        id: docId,
        claimId: String(targetId),
        landId: String(targetId),
        fileName,
        fileType,
        fileUrl,
        documentType,
        documentHash: docHash,
        ocrText: scanResult.ocrText,
        ocrData: scanResult.ocrData,
        confidenceScore: scanResult.confidenceScore,
        verificationStatus: 'Pending',
        verifiedBy: null,
        verifiedAt: null,
        notes: notes || 'Uploaded and queued for officer verification'
      };

      const saved = await store.documents.save(newDoc);

      // Workflow check: if claim was in Missing Documents Detected, advance to Special Verification
      if (claim.workflowStatus === 'Missing Documents Detected') {
        await store.claims.update(targetId, {
          workflowStatus: 'Special Verification',
          workflowNotes: 'Document uploaded; moved to Special Verification'
        });
      }

      res.status(201).json({
        message: 'Document uploaded and registered successfully',
        document: saved
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 3. GET /documents - List all documents or filter by claimId
  // -------------------------------------------------------------
  router.get('/', async (req, res, next) => {
    try {
      const { claimId, landId, verificationStatus, documentType } = req.query;
      let allDocs = await store.documents.getAll();

      if (claimId || landId) {
        const filterId = String(claimId || landId);
        allDocs = allDocs.filter(d => String(d.claimId) === filterId || String(d.landId) === filterId);
      }
      if (verificationStatus) {
        allDocs = allDocs.filter(d => d.verificationStatus && d.verificationStatus.toLowerCase() === verificationStatus.toLowerCase());
      }
      if (documentType) {
        allDocs = allDocs.filter(d => d.documentType && d.documentType.toLowerCase() === documentType.toLowerCase());
      }

      res.json(allDocs);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 4. GET /documents/:id - Get single document details
  // -------------------------------------------------------------
  router.get('/:id', async (req, res, next) => {
    try {
      const doc = await store.documents.getById(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: `Document with id '${req.params.id}' not found` });
      }
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 5. POST /documents/:id/verify - Verify or flag document
  // -------------------------------------------------------------
  router.post('/:id/verify', requireRole(ROLES.GROUND_VERIFICATION_OFFICER, ROLES.GOVERNMENT_OFFICER, ROLES.NGO_COMMUNITY_VERIFIER), async (req, res, next) => {
    try {
      const doc = await store.documents.getById(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: `Document with id '${req.params.id}' not found` });
      }

      const { verificationStatus, notes } = req.body || {};
      const validStatuses = ['Verified', 'Flagged', 'Rejected', 'Pending'];

      if (!verificationStatus || !validStatuses.includes(verificationStatus)) {
        return res.status(400).json({
          error: `Invalid verificationStatus '${verificationStatus}'. Allowed: ${validStatuses.join(', ')}`
        });
      }

      const verifiedBy = req.user ? `${req.user.name} (${req.user.role})` : 'Authorized Verifier';
      const updated = await store.documents.update(req.params.id, {
        verificationStatus,
        verifiedBy,
        verifiedAt: new Date().toISOString(),
        notes: notes || doc.notes
      });

      res.json({
        message: `Document verification status updated to '${verificationStatus}'`,
        document: updated
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createDocumentRoutes;
