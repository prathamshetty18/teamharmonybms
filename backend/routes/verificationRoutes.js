const express = require('express');
const store = require('../store');
const { ROLES, requireRole } = require('../auth');

function createVerificationRoutes(upload) {
  const router = express.Router();
  const fileUploadMiddleware = upload
    ? upload.fields([
        { name: 'photos', maxCount: 5 },
        { name: 'videos', maxCount: 2 },
        { name: 'evidence', maxCount: 5 }
      ])
    : (req, res, next) => next();

  // Helper to extract file URLs
  function extractUploadedFiles(req) {
    const files = [];
    if (req.files) {
      for (const field of ['photos', 'videos', 'evidence']) {
        if (req.files[field] && Array.isArray(req.files[field])) {
          for (const f of req.files[field]) {
            files.push(`/uploads/${f.filename}`);
          }
        }
      }
    }
    if (req.body.photos) {
      const p = Array.isArray(req.body.photos) ? req.body.photos : [req.body.photos];
      files.push(...p);
    }
    if (req.body.videos) {
      const v = Array.isArray(req.body.videos) ? req.body.videos : [req.body.videos];
      files.push(...v);
    }
    return files;
  }

  // -------------------------------------------------------------
  // 1. POST /ground-verification
  // Field officer physically verifies GPS, photos/videos, boundaries & land-use
  // -------------------------------------------------------------
  router.post(
    ['/ground-verification', '/claims/:id/ground-verification', '/parcels/:id/ground-verification'],
    fileUploadMiddleware,
    requireRole(ROLES.GROUND_VERIFICATION_OFFICER, ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const targetId = req.params.id || req.body.claimId || req.body.landId;
        if (!targetId) {
          return res.status(400).json({ error: 'Missing required field: claimId (or landId)' });
        }

        const claim = await store.getById('claims', targetId);
        if (!claim) {
          return res.status(404).json({ error: `Land parcel / Claim with id '${targetId}' not found` });
        }

        const {
          gpsLocation,
          boundaryVerified = true,
          landUseVerified = req.body.landUseGroundVerified || 'Agricultural',
          remarks = '',
          submitReport = true
        } = req.body || {};

        const mediaFiles = extractUploadedFiles(req);
        if (mediaFiles.length === 0) {
          mediaFiles.push(`/uploads/gvo_inspection_claim_${targetId}.jpg`);
        }

        const verifiedBy = req.user
          ? `${req.user.name} (${req.user.role})`
          : 'Rajesh Kumar (Ground Verification Officer)';

        const prevStatus = claim.verificationStatus || claim.status || 'DOCUMENT_VERIFICATION';
        const newStatus = submitReport !== false ? 'COMMUNITY/NGO_VERIFICATION' : 'GROUND_VERIFICATION';
        const onChainStatus = store.mapToOnChainStatus(newStatus);

        const report = {
          reportId: `gvr_${Date.now()}`,
          claimId: String(targetId),
          landId: String(targetId),
          verifiedBy,
          gpsLocation: gpsLocation || claim.referencePoint || [77.5620, 12.9415],
          boundaryVerified: boundaryVerified === 'true' || boundaryVerified === true,
          landUseVerified,
          mediaFiles,
          remarks: remarks || 'Physical site inspection verified boundaries, crop cultivation, and GPS beacons.',
          submittedAt: new Date().toISOString()
        };

        const updates = {
          verificationStatus: newStatus,
          status: onChainStatus,
          onChainStatus,
          landUseGroundVerified: landUseVerified,
          groundVerificationReport: report,
          updatedAt: new Date().toISOString()
        };

        const updatedClaim = await store.update('claims', targetId, updates);

        // Record immutable Audit Log
        const auditRecord = await store.recordAuditLog({
          who: verifiedBy,
          what: 'GROUND_VERIFICATION_SUBMITTED',
          landId: targetId,
          prevValue: prevStatus,
          newValue: newStatus,
          remarks: remarks || `Ground verification report submitted. GPS confirmed: ${JSON.stringify(report.gpsLocation)}. Boundaries verified: ${report.boundaryVerified}`,
          metadata: {
            gpsLocation: report.gpsLocation,
            boundaryVerified: report.boundaryVerified,
            landUseVerified,
            mediaCount: mediaFiles.length
          }
        });

        const acres = updatedClaim.parcelAreaAcres || updatedClaim.confirmedAreaAcres || 0;
        const docs = await store.getDocumentsByClaimId(targetId);

        res.status(200).json({
          message: 'Ground verification report submitted successfully',
          report,
          claim: {
            ...updatedClaim,
            landId: updatedClaim.landId || updatedClaim.claimId,
            area: store.formatAreaUnits(acres),
            documents: docs
          },
          auditRecord
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------
  // 2. POST /ngo-verification
  // Community & accredited NGO field attestation, local elder testimony & boundary review
  // -------------------------------------------------------------
  router.post(
    ['/ngo-verification', '/claims/:id/ngo-verification', '/parcels/:id/ngo-verification'],
    fileUploadMiddleware,
    requireRole(ROLES.NGO_COMMUNITY_VERIFIER, ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const targetId = req.params.id || req.body.claimId || req.body.landId;
        if (!targetId) {
          return res.status(400).json({ error: 'Missing required field: claimId (or landId)' });
        }

        const claim = await store.getById('claims', targetId);
        if (!claim) {
          return res.status(404).json({ error: `Land parcel / Claim with id '${targetId}' not found` });
        }

        const {
          gpsLocation,
          communityAttestations = [],
          boundaryVerified = true,
          landUseVerified = 'Agricultural',
          remarks = '',
          submitReport = true
        } = req.body || {};

        const mediaFiles = extractUploadedFiles(req);
        const verifiedBy = req.user
          ? `${req.user.name} (${req.user.role})`
          : 'Suresh Patil (NGO/Community Verifier)';

        const organization = req.user && req.user.profile && req.user.profile.organization
          ? req.user.profile.organization
          : 'Rural Land Rights Watch (Accredited NGO)';

        const prevStatus = claim.verificationStatus || claim.status || 'GROUND_VERIFICATION';
        const newStatus = submitReport !== false ? 'LAND_CLASSIFICATION' : 'COMMUNITY/NGO_VERIFICATION';
        const onChainStatus = store.mapToOnChainStatus(newStatus);

        let parsedAttestations = communityAttestations;
        if (typeof communityAttestations === 'string') {
          try {
            parsedAttestations = JSON.parse(communityAttestations);
          } catch {
            parsedAttestations = [{ statement: communityAttestations }];
          }
        }
        if (!Array.isArray(parsedAttestations) || parsedAttestations.length === 0) {
          parsedAttestations = [
            {
              attesterName: 'Suresh Patil (Neighbor)',
              relation: 'Neighboring plot owner Sy. No. 142/4',
              testimony: 'Confirmed peaceful cultivating possession for over 25 years.'
            },
            {
              attesterName: 'Gram Panchayat Elder V. Reddy',
              relation: 'Village Council Head',
              testimony: 'Verified applicant identity and boundary demarcations.'
            }
          ];
        }

        const report = {
          reportId: `nvr_${Date.now()}`,
          claimId: String(targetId),
          landId: String(targetId),
          verifiedBy,
          organization,
          gpsLocation: gpsLocation || claim.referencePoint || [77.5620, 12.9415],
          boundaryVerified: boundaryVerified === 'true' || boundaryVerified === true,
          landUseVerified,
          communityAttestations: parsedAttestations,
          mediaFiles,
          remarks: remarks || 'Community hearings completed. No boundary disputes or counter-claims raised.',
          submittedAt: new Date().toISOString()
        };

        const newScore = Math.max(claim.score || 0, 5);
        const updates = {
          verificationStatus: newStatus,
          status: onChainStatus,
          onChainStatus,
          score: newScore,
          ngoVerificationReport: report,
          updatedAt: new Date().toISOString()
        };

        const updatedClaim = await store.update('claims', targetId, updates);

        // Record immutable Audit Log
        const auditRecord = await store.recordAuditLog({
          who: verifiedBy,
          what: 'NGO_COMMUNITY_VERIFICATION_SUBMITTED',
          landId: targetId,
          prevValue: prevStatus,
          newValue: newStatus,
          remarks: remarks || `Community/NGO verification submitted. Score updated to ${newScore}. Attestations verified: ${parsedAttestations.length}`,
          metadata: {
            organization,
            boundaryVerified: report.boundaryVerified,
            attestationsCount: parsedAttestations.length,
            score: newScore
          }
        });

        const acres = updatedClaim.parcelAreaAcres || updatedClaim.confirmedAreaAcres || 0;
        const docs = await store.getDocumentsByClaimId(targetId);

        res.status(200).json({
          message: 'NGO/Community verification report submitted successfully',
          report,
          claim: {
            ...updatedClaim,
            landId: updatedClaim.landId || updatedClaim.claimId,
            area: store.formatAreaUnits(acres),
            documents: docs
          },
          auditRecord
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------
  // 3. POST /verification/transition
  // General state machine status transition with audit logging
  // DRAFT -> SUBMITTED -> DOCUMENT_VERIFICATION -> GROUND_VERIFICATION ->
  // COMMUNITY/NGO_VERIFICATION -> LAND_CLASSIFICATION -> GOVERNMENT_REVIEW -> APPROVED/DISPUTED/REJECTED
  // -------------------------------------------------------------
  router.post(
    ['/verification/transition', '/claims/:id/verification-state', '/parcels/:id/verification-state'],
    async (req, res, next) => {
      try {
        const targetId = req.params.id || req.body.claimId || req.body.landId;
        if (!targetId) {
          return res.status(400).json({ error: 'Missing required field: claimId (or landId)' });
        }

        const claim = await store.getById('claims', targetId);
        if (!claim) {
          return res.status(404).json({ error: `Land parcel / Claim with id '${targetId}' not found` });
        }

        const { targetStatus, reason = '', remarks = '', metadata = {} } = req.body || {};
        if (!targetStatus) {
          return res.status(400).json({ error: 'Missing required field: targetStatus' });
        }

        const normalizedTarget = store.normalizeSpecStatus(targetStatus);
        const VALID_SPECS = [
          'DRAFT',
          'SUBMITTED',
          'DOCUMENT_VERIFICATION',
          'GROUND_VERIFICATION',
          'COMMUNITY/NGO_VERIFICATION',
          'COMMUNITY_NGO_VERIFICATION',
          'LAND_CLASSIFICATION',
          'GOVERNMENT_REVIEW',
          'APPROVED',
          'DISPUTED',
          'REJECTED'
        ];

        if (!VALID_SPECS.includes(normalizedTarget)) {
          return res.status(400).json({
            error: `Invalid targetStatus '${targetStatus}'. Must be one of: ${VALID_SPECS.join(', ')}`
          });
        }

        // Anti-Auto-Rejection Rule for missing docs alone
        const textToCheck = `${reason} ${remarks}`;
        const isMissingDocsReason =
          (/missing/i.test(textToCheck) && /(document|doc|paperwork|record|proof|title)/i.test(textToCheck)) ||
          req.body.isMissingDocsOnly === true ||
          req.body.missingDocsAlone === true;

        if (normalizedTarget === 'REJECTED' && isMissingDocsReason) {
          return res.status(400).json({
            error: 'Cannot reject application for missing documents alone. Route to Special Verification / Community inquiry.'
          });
        }

        const who = req.user
          ? `${req.user.name} (${req.user.role})`
          : (req.body.officerName || 'Authorized State Machine Controller');

        const prevStatus = claim.verificationStatus || claim.status || 'SUBMITTED';
        const onChainStatus = store.mapToOnChainStatus(normalizedTarget);

        const updates = {
          verificationStatus: normalizedTarget,
          status: onChainStatus,
          onChainStatus,
          workflowStatus: normalizedTarget === 'APPROVED' ? 'Approved' : (normalizedTarget === 'DISPUTED' ? 'Disputed' : 'In Progress'),
          updatedAt: new Date().toISOString()
        };

        if (normalizedTarget === 'APPROVED') {
          updates.landUseFinalApproved = claim.landUseGroundVerified || claim.landUseFarmerDeclared || 'Agricultural';
        }

        const updatedClaim = await store.update('claims', targetId, updates);

        // Record immutable Audit Log
        const auditRecord = await store.recordAuditLog({
          who,
          what: `STATUS_TRANSITION_${normalizedTarget}`,
          landId: targetId,
          prevValue: prevStatus,
          newValue: normalizedTarget,
          remarks: remarks || reason || `State machine transitioned from ${prevStatus} to ${normalizedTarget}`,
          metadata: {
            ...metadata,
            onChainStatus,
            reason
          }
        });

        const acres = updatedClaim.parcelAreaAcres || updatedClaim.confirmedAreaAcres || 0;
        const docs = await store.getDocumentsByClaimId(targetId);

        res.status(200).json({
          message: `Claim verification status transitioned to '${normalizedTarget}'`,
          claim: {
            ...updatedClaim,
            status: normalizedTarget, // Expose spec status directly in transition response
            onChainStatus,
            verificationStatus: normalizedTarget,
            landId: updatedClaim.landId || updatedClaim.claimId,
            area: store.formatAreaUnits(acres),
            documents: docs
          },
          auditRecord
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------
  // 4. GET /audit-logs
  // Query append-only audit trail with optional filters
  // -------------------------------------------------------------
  router.get('/audit-logs', async (req, res, next) => {
    try {
      const { landId, claimId, who, what } = req.query;
      let logs = await store.auditLogs.getAll();

      if (landId || claimId) {
        const filterId = String(landId || claimId);
        logs = logs.filter(a => String(a.landId) === filterId || String(a.claimId) === filterId);
      }
      if (who) {
        const whoLower = who.toLowerCase();
        logs = logs.filter(a => a.who && a.who.toLowerCase().includes(whoLower));
      }
      if (what) {
        const whatLower = what.toLowerCase();
        logs = logs.filter(a => a.what && a.what.toLowerCase().includes(whatLower));
      }

      // Chronological sort
      logs.sort((a, b) => new Date(a.when) - new Date(b.when));
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 5. GET /audit-logs/:id
  // Retrieve single audit record by ID
  // -------------------------------------------------------------
  router.get('/audit-logs/:id', async (req, res, next) => {
    try {
      const log = await store.auditLogs.getById(req.params.id);
      if (!log) {
        return res.status(404).json({ error: `Audit log record with id '${req.params.id}' not found` });
      }
      res.json(log);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createVerificationRoutes;
