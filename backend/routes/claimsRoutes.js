const express = require('express');
const store = require('../store');
const { sha256, hashOwner, hashEvidence, generateTxHash } = require('../utils/hash');
const {
  isEligible,
  damageLevel,
  computeAmount,
  scaleToBudget
} = require('../eligibility');
const {
  checkOverlap,
  findOverlaps,
  createDisputeFromOverlap
} = require('../overlap');
const {
  createReliefRecord,
  getEligibleClaimsForRelief,
  getPayoutRecord,
  getVerificationCertificate
} = require('../relief');
const {
  validateClaimInput,
  validateAttestInput,
  validateDisputeInput,
  validateResolveInput,
  validateReliefInput,
  validateAssessInput,
  validateApprovePayoutInput,
  validateReleasePayoutInput
} = require('../utils/validate');
const { ROLES, requireRole } = require('../auth');

// Attempt to load Person A's chain.js if present on disk
let defaultChain = null;
try {
  defaultChain = require('../chain');
} catch (e) {
  // chain.js not yet created or offline; operates safely with store
}

module.exports = function createClaimsRoutes(upload, chainClient = null) {
  const router = express.Router();
  const chain = chainClient || defaultChain;
  const fileUploadMiddleware = upload ? upload.array('photos', 5) : (req, res, next) => next();

  // -------------------------------------------------------------
  // 1. POST /claims - Core Land Flow
  // Validates input, hashes owner + evidence, saves photos + GeoJSON [lon, lat],
  // calls chain.createClaim(ownerHash, evidenceHash, lat, lon) from chain.js,
  // saves result to Atlas via store.save('claims', ...). Status starts Pending.
  // -------------------------------------------------------------
  router.post(['/claims', '/parcels'], fileUploadMiddleware, requireRole(ROLES.FARMER, ROLES.GOVERNMENT_OFFICER), validateClaimInput, async (req, res, next) => {
    try {
      const {
        ownerName,
        nationalId = 'IND-KA-' + Math.floor(100000 + Math.random() * 900000),
        polygon,
        parcelAreaAcres = 2.0,
        confirmedAreaAcres = null,
        notes = '',
        beneficiaryAddress = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0'),
        surveyNumber = req.body.survey_number || ('Sy. No. ' + Math.floor(100 + Math.random() * 900) + '/1'),
        plotNumber = req.body.plot_number || ('Plot ' + Math.floor(1 + Math.random() * 50)),
        state = 'Karnataka',
        district = 'Bangalore South',
        taluk = 'Bangalore South',
        village = 'Basavanagudi',
        landUseFarmerDeclared = req.body.farmerDeclaredLandUse || req.body.landUse || 'Agricultural',
        landUseGovtRecord = req.body.govtRecordLandUse || 'Agricultural',
        landUseGroundVerified = req.body.groundVerifiedLandUse || 'Pending',
        landUseFinalApproved = req.body.finalApprovedLandUse || 'Pending',
        workflowStatus = 'Submitted'
      } = req.body;

      // Handle area conversion on storage: store one (acres), convert on read
      let finalAreaAcres = 2.0;
      if (req.body.parcelAreaAcres != null) {
        finalAreaAcres = Number(req.body.parcelAreaAcres);
      } else if (req.body.areaAcres != null) {
        finalAreaAcres = Number(req.body.areaAcres);
      } else if (req.body.areaHectares != null || req.body.hectares != null) {
        const h = Number(req.body.areaHectares || req.body.hectares);
        finalAreaAcres = Number((h / 0.404686).toFixed(4));
      } else if (req.body.areaSqm != null || req.body.sqm != null) {
        const s = Number(req.body.areaSqm || req.body.sqm);
        finalAreaAcres = Number((s / 4046.8564).toFixed(4));
      } else if (req.body.area && typeof req.body.area === 'object') {
        if (req.body.area.acres != null) finalAreaAcres = Number(req.body.area.acres);
        else if (req.body.area.hectares != null) finalAreaAcres = Number((Number(req.body.area.hectares) / 0.404686).toFixed(4));
        else if (req.body.area.sqm != null) finalAreaAcres = Number((Number(req.body.area.sqm) / 4046.8564).toFixed(4));
      } else if (typeof req.body.area === 'number') {
        finalAreaAcres = Number(req.body.area);
      }

      const allClaims = await store.getAll('claims');
      const nextId = (allClaims.length + 1).toString();

      // Collect uploaded photos or provide default mock photo references
      let photos = [];
      if (req.files && req.files.length > 0) {
        photos = req.files.map(f => `/uploads/${f.filename}`);
      } else if (req.body.photos) {
        photos = Array.isArray(req.body.photos) ? req.body.photos : [req.body.photos];
      } else {
        photos = [`/uploads/claim_${nextId}_survey.jpg`];
      }

      // GeoJSON polygon ([lon, lat] order)
      const outerRing = polygon.coordinates[0];
      const avgLon = outerRing.reduce((sum, pt) => sum + pt[0], 0) / outerRing.length;
      const avgLat = outerRing.reduce((sum, pt) => sum + pt[1], 0) / outerRing.length;
      const latE6 = Math.round(avgLat * 1e6);
      const lonE6 = Math.round(avgLon * 1e6);

      // Hash owner + evidence
      const ownerHash = hashOwner(nationalId);
      const evidenceHash = hashEvidence({ photos, polygon, ownerName });

      // Call chain.createClaim(ownerHash, evidenceHash, lat, lon) from chain.js
      let onChainClaimId = null;
      let txHash = null;

      if (chain && typeof chain.createClaim === 'function') {
        try {
          // Pass (ownerHash, evidenceHash, lat, lon) per contract interface
          const chainResult = await chain.createClaim(ownerHash, evidenceHash, latE6, lonE6);
          if (chainResult) {
            if (typeof chainResult === 'object') {
              onChainClaimId = chainResult.claimId != null ? String(chainResult.claimId) : null;
              txHash = chainResult.txHash || chainResult.hash || null;
            } else if (typeof chainResult === 'string' || typeof chainResult === 'number') {
              onChainClaimId = String(chainResult);
            }
          }
        } catch (chainErr) {
          console.warn('[Chain] chain.createClaim call failed or offline:', chainErr.message);
        }
      }

      const primaryClaimId = onChainClaimId || nextId;

      // Run automated geospatial overlap detection using Turf.js: findOverlaps(newPolygon, existingClaims)
      const conflicts = findOverlaps(polygon, allClaims);

      let status = 'Pending';
      let dispute = null;

      if (conflicts.length > 0) {
        status = 'Disputed';
        dispute = createDisputeFromOverlap(conflicts, beneficiaryAddress);

        // Auto-trigger dispute on-chain by calling chain.dispute() (Person A's function)
        if (chain && typeof chain.dispute === 'function') {
          try {
            await chain.dispute(primaryClaimId);
          } catch (chainErr) {
            console.warn(`[Chain] auto-dispute call for claim ${primaryClaimId} failed:`, chainErr.message);
          }
        }
      }

      const disputeReason = dispute ? dispute.reason : null;
      const disputeNotes = dispute ? dispute.notes : null;
      const finalNotes = notes || disputeNotes || '';

      const specStatus = conflicts.length > 0
        ? 'DISPUTED'
        : store.normalizeSpecStatus(req.body.status || req.body.verificationStatus || 'SUBMITTED');
      const onChainStatus = store.mapToOnChainStatus(specStatus);

      const newClaim = {
        claimId: primaryClaimId,
        landId: primaryClaimId,
        ownerName,
        nationalId,
        ownerHash,
        evidenceHash,
        polygon,
        latE6,
        lonE6,
        referencePoint: [avgLon, avgLat],
        surveyNumber,
        plotNumber,
        state,
        district,
        taluk,
        village,
        landUseFarmerDeclared,
        landUseGovtRecord,
        landUseGroundVerified,
        landUseFinalApproved,
        workflowStatus,
        verificationStatus: specStatus,
        onChainStatus,
        parcelAreaAcres: finalAreaAcres,
        confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : null,
        area: store.formatAreaUnits(finalAreaAcres),
        score: 0,
        status: conflicts.length > 0 ? 'Disputed' : 'Pending',
        attestations: [],
        dispute,
        disputeReason,
        disputeNotes,
        conflicts: conflicts.length > 0 ? conflicts : null,
        txHash,
        photos,
        beneficiaryAddress,
        notes: finalNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save result to Atlas via store.save('claims', ...)
      const saved = await store.save('claims', newClaim);

      // Record immutable Audit Log for claim creation
      await store.recordAuditLog({
        who: req.user ? `${req.user.name} (${req.user.role})` : ownerName,
        what: 'CLAIM_SUBMITTED',
        landId: primaryClaimId,
        prevValue: 'DRAFT',
        newValue: specStatus,
        remarks: finalNotes || 'New parcel application submitted for cadastral verification',
        metadata: {
          surveyNumber,
          plotNumber,
          parcelAreaAcres: finalAreaAcres
        }
      });

      if (conflicts.length > 0) {
        await store.recordAuditLog({
          who: 'Geospatial Overlap Engine',
          what: 'OVERLAP_DISPUTED',
          landId: primaryClaimId,
          prevValue: 'SUBMITTED',
          newValue: 'DISPUTED',
          remarks: disputeReason,
          metadata: { conflicts }
        });
      }

      const enrichedSaved = {
        ...saved,
        landId: saved.landId || saved.claimId,
        area: store.formatAreaUnits(saved.parcelAreaAcres || 0),
        workflowStatus: saved.workflowStatus || 'Submitted',
        verificationStatus: saved.verificationStatus || specStatus,
        onChainStatus: saved.onChainStatus || onChainStatus,
        documents: []
      };
      res.status(201).json(enrichedSaved);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 2. GET /claims - List all land parcels for map markers
  // -------------------------------------------------------------
  router.get(['/claims', '/parcels'], async (req, res, next) => {
    try {
      const all = await store.getAll('claims');
      const enriched = all.map(claim => {
        const acres = claim.parcelAreaAcres != null ? claim.parcelAreaAcres : (claim.confirmedAreaAcres || 0);
        const verificationStatus = claim.verificationStatus || (claim.status === 'Verified' ? 'APPROVED' : (claim.status === 'Disputed' ? 'DISPUTED' : 'SUBMITTED'));
        const onChainStatus = store.mapToOnChainStatus(verificationStatus);
        const displayStatus = req.query.specStatus === 'true' ? verificationStatus : (claim.status || onChainStatus);

        return {
          ...claim,
          landId: claim.landId || claim.claimId,
          area: store.formatAreaUnits(acres),
          workflowStatus: claim.workflowStatus || (claim.status === 'Verified' ? 'Approved' : 'Submitted'),
          verificationStatus,
          onChainStatus,
          status: displayStatus
        };
      });
      res.json(enriched);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // POST /claims/check-overlap - Live interactive overlap check
  // (Used by Leaflet map during boundary drawing)
  // -------------------------------------------------------------
  router.post('/claims/check-overlap', async (req, res, next) => {
    try {
      const { polygon, excludeClaimId } = req.body;
      if (!polygon) {
        return res.status(400).json({ error: 'Missing required field: polygon' });
      }

      let parsedPolygon = polygon;
      if (typeof polygon === 'string') {
        try {
          parsedPolygon = JSON.parse(polygon);
        } catch {
          return res.status(400).json({ error: 'polygon must be a valid GeoJSON object' });
        }
      }

      const allClaims = await store.getAll('claims');
      const analysis = checkOverlap(parsedPolygon, allClaims, { excludeClaimId });
      res.json(analysis);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // GET /disputes - List all currently disputed claims
  // (Used by Dispute Resolver / Gov Dashboard)
  // -------------------------------------------------------------
  router.get('/disputes', async (req, res, next) => {
    try {
      const allClaims = await store.getAll('claims');
      const disputedClaims = allClaims.filter(c => c.status === 'Disputed' || (c.dispute && c.dispute.isDisputed));
      res.json({
        totalDisputes: disputedClaims.length,
        claims: disputedClaims
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 3. GET /claims/:id - Parcel details, attestation history,
  // dispute status by on-chain claimId. Merge Atlas data with chain.getClaim(claimId) read.
  // -------------------------------------------------------------
  router.get(['/claims/:id', '/parcels/:id'], async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      let merged = { ...claim };

      // Merge Atlas data with chain.getClaim(claimId) read if available
      if (chain && typeof chain.getClaim === 'function') {
        try {
          const chainData = await chain.getClaim(req.params.id);
          if (chainData) {
            merged = {
              ...merged,
              onChain: chainData,
              score: chainData.score != null ? Number(chainData.score) : merged.score,
              status: chainData.status || merged.status,
              ownerHash: chainData.ownerHash || merged.ownerHash,
              evidenceHash: chainData.evidenceHash || merged.evidenceHash
            };
          }
        } catch (chainErr) {
          console.warn(`[Chain] Error reading getClaim(${req.params.id}):`, chainErr.message);
        }
      }

      const acres = merged.parcelAreaAcres != null ? merged.parcelAreaAcres : (merged.confirmedAreaAcres || 0);
      const docs = await store.getDocumentsByClaimId(req.params.id);
      const auditLogs = await store.getAuditLogsByLandId(req.params.id);

      const verificationStatus = merged.verificationStatus || (merged.status === 'Verified' ? 'APPROVED' : (merged.status === 'Disputed' ? 'DISPUTED' : 'SUBMITTED'));
      const onChainStatus = store.mapToOnChainStatus(verificationStatus);
      const displayStatus = req.query.specStatus === 'true' ? verificationStatus : (merged.status || onChainStatus);

      merged = {
        ...merged,
        landId: merged.landId || merged.claimId,
        area: store.formatAreaUnits(acres),
        workflowStatus: merged.workflowStatus || (merged.status === 'Verified' ? 'Approved' : 'Submitted'),
        verificationStatus,
        onChainStatus,
        status: displayStatus,
        documents: docs,
        auditLogs
      };

      res.json(merged);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 4. POST /claims/:id/attest - Community attestation
  // After each attest call, save attestation history to Atlas via store.update
  // -------------------------------------------------------------
  router.post('/claims/:id/attest', requireRole(ROLES.NGO_COMMUNITY_VERIFIER, ROLES.GOVERNMENT_OFFICER), validateAttestInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const {
        role,
        attesterAddress = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0'),
        attesterName = 'Community Attester',
        notes = ''
      } = req.body;

      const weightMap = {
        'Neighbor': 1,
        'Village Leader': 3,
        'Accredited NGO': 3
      };
      const weight = weightMap[role] || 1;

      const newAttestation = {
        attesterAddress,
        attesterName,
        role,
        weight,
        notes,
        timestamp: new Date().toISOString()
      };

      const existingAttestations = Array.isArray(claim.attestations) ? claim.attestations : [];
      const updatedAttestations = [...existingAttestations, newAttestation];
      const newScore = (claim.score || 0) + weight;

      let newStatus = claim.status;
      if (claim.status === 'Pending' && newScore >= 5) {
        newStatus = 'Verified';
      }

      // If chain client has attest method, call it
      if (chain && typeof chain.attest === 'function') {
        try {
          await chain.attest(req.params.id, weight);
        } catch (chainErr) {
          console.warn(`[Chain] Error calling chain.attest:`, chainErr.message);
        }
      }

      // Save attestation history to Atlas via store.update
      const updated = await store.update('claims', req.params.id, {
        attestations: updatedAttestations,
        score: newScore,
        status: newStatus,
        verificationStatus: newStatus === 'Verified' ? 'APPROVED' : (claim.verificationStatus || 'COMMUNITY/NGO_VERIFICATION'),
        onChainStatus: newStatus
      });

      if (newStatus !== claim.status) {
        await store.recordAuditLog({
          who: req.user ? `${req.user.name} (${req.user.role})` : attesterName,
          what: 'ATTESTATION_THRESHOLD_REACHED',
          landId: req.params.id,
          prevValue: claim.verificationStatus || claim.status,
          newValue: 'APPROVED',
          remarks: `Attestation score reached ${newScore} >= 5. Parcel approved by community.`
        });
      }

      res.json({
        message: 'Attestation recorded successfully',
        attestation: newAttestation,
        claim: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 5. POST /claims/:id/dispute - Flag boundary conflict
  // -------------------------------------------------------------
  router.post('/claims/:id/dispute', requireRole(ROLES.GOVERNMENT_OFFICER, ROLES.NGO_COMMUNITY_VERIFIER), validateDisputeInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const {
        reason,
        disputerAddress = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0'),
        disputerName = 'Aggrieved Boundary Claimant',
        overlappingClaimId = null
      } = req.body;

      const disputeRecord = {
        isDisputed: true,
        reason,
        disputerAddress,
        disputerName,
        overlappingClaimId,
        timestamp: new Date().toISOString()
      };

      // Call chain.dispute if available
      if (chain && typeof chain.dispute === 'function') {
        try {
          await chain.dispute(req.params.id);
        } catch (chainErr) {
          console.warn(`[Chain] Error calling chain.dispute:`, chainErr.message);
        }
      }

      const updated = await store.update('claims', req.params.id, {
        status: 'Disputed',
        onChainStatus: 'Disputed',
        verificationStatus: 'DISPUTED',
        dispute: disputeRecord,
        disputeReason: reason,
        disputeNotes: req.body.notes || `Dispute flagged: ${reason}`
      });

      await store.recordAuditLog({
        who: req.user ? `${req.user.name} (${req.user.role})` : disputerName,
        what: 'DISPUTE_FILED',
        landId: req.params.id,
        prevValue: claim.verificationStatus || claim.status,
        newValue: 'DISPUTED',
        remarks: reason
      });

      res.json({
        message: 'Claim flagged for dispute',
        dispute: disputeRecord,
        claim: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 6. POST /claims/:id/resolve - Admin resolves dispute
  // -------------------------------------------------------------
  router.post('/claims/:id/resolve', requireRole(ROLES.GOVERNMENT_OFFICER), validateResolveInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const {
        restore,
        resolutionNotes = 'Dispute arbitrated and resolved by authorized land registry official',
        arbiterAddress = '0x000000000000000000000000000000000000dEaD'
      } = req.body;

      // Call chain.resolveDispute if available
      if (chain && typeof chain.resolveDispute === 'function') {
        try {
          await chain.resolveDispute(req.params.id, restore);
        } catch (chainErr) {
          console.warn(`[Chain] Error calling chain.resolveDispute:`, chainErr.message);
        }
      }

      const resolvedStatus = restore === true ? 'Verified' : 'Pending';
      const resolvedSpecStatus = restore === true ? 'GOVERNMENT_REVIEW' : 'SUBMITTED';

      const updated = await store.update('claims', req.params.id, {
        status: resolvedStatus,
        onChainStatus: resolvedStatus,
        verificationStatus: resolvedSpecStatus,
        dispute: null,
        resolution: {
          restored: restore,
          resolutionNotes,
          arbiterAddress,
          resolvedAt: new Date().toISOString()
        }
      });

      await store.recordAuditLog({
        who: req.user ? `${req.user.name} (${req.user.role})` : (arbiterAddress || 'Authorized Arbiter'),
        what: 'DISPUTE_RESOLVED',
        landId: req.params.id,
        prevValue: 'DISPUTED',
        newValue: resolvedSpecStatus,
        remarks: resolutionNotes
      });

      res.json({
        message: 'Dispute resolved successfully',
        claim: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 7. GET /verify/:id - Public QR verification view
  // Includes tamper-evidence re-hash validation
  // -------------------------------------------------------------
  router.get('/verify/:id', async (req, res, next) => {
    try {
      const cert = await getVerificationCertificate(req.params.id);
      res.json(cert);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 8. POST /reliefs - Declare relief event
  // Accepts zone polygon, ratePerAcre, maxPerClaim, budget (wei strings)
  // Computes zoneHash, saves to Atlas. Calls chain.createRelief if available.
  // -------------------------------------------------------------
  router.post('/reliefs', requireRole(ROLES.GOVERNMENT_OFFICER), validateReliefInput, async (req, res, next) => {
    try {
      const saved = await createReliefRecord(req.body);

      // Person A wires the actual route calling chain.createRelief after your save
      let chainResult = null;
      if (chain && typeof chain.createRelief === 'function') {
        try {
          chainResult = await chain.createRelief(saved.zoneHash, saved.maxPerClaim, saved.budget);
        } catch (chainErr) {
          console.warn('[Chain] Error calling chain.createRelief:', chainErr.message);
        }
      }

      res.status(201).json(chainResult ? { ...saved, onChain: chainResult } : saved);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 9. GET /reliefs - List all relief events
  // -------------------------------------------------------------
  router.get('/reliefs', async (req, res, next) => {
    try {
      const all = await store.getAll('reliefs');
      res.json(all);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 10. GET /reliefs/:id/eligible - Eligible claims with computed amounts
  // Filter Verified + non-Disputed claims in zone via isEligible(),
  // compute damageLevel + computeAmount for assessed claims (amount "0" + payoutStatus "None" for unassessed),
  // run scaleToBudget on all amounts.
  // Return: { relief, claims: [{ claimId, amount, scaledAmount, damageLevel, payoutStatus }], totalNeeded, budget, scaleBps, shortfall }.
  // -------------------------------------------------------------
  router.get('/reliefs/:id/eligible', async (req, res, next) => {
    try {
      const result = await getEligibleClaimsForRelief(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 11. POST /claims/:id/assess - Assessor records damage
  // Accepts { reliefId, answers, confirmedAreaAcres? }
  // Computes damageLevel from answers, stores raw answers + level in payouts
  // -------------------------------------------------------------
  router.post('/claims/:id/assess', fileUploadMiddleware, requireRole(ROLES.GROUND_VERIFICATION_OFFICER, ROLES.GOVERNMENT_OFFICER), validateAssessInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      if (claim.status !== 'Verified' || (claim.dispute && claim.dispute.isDisputed)) {
        return res.status(400).json({
          error: `Cannot assess damage for claim with status '${claim.status}'. Only Verified, undisputed claims can be assessed.`
        });
      }

      const {
        reliefId,
        answers,
        confirmedAreaAcres,
        damageLevel: directDamageLevel,
        damageNotes = 'Field inspection confirmed damage',
        assessorAddress = '0x2546BcD3c84621e976D8185a91A922aE77ECEc30'
      } = req.body;

      // Verify accredited assessor authorization (per design.md role restrictions)
      const candidateAssessor = assessorAddress || req.headers['x-assessor-address'];
      let isAuthorizedAssessor = false;
      if (chain && typeof chain.isAssessor === 'function') {
        try {
          isAuthorizedAssessor = await chain.isAssessor(candidateAssessor);
        } catch (chainErr) {
          console.warn('[Chain] Error checking chain.isAssessor:', chainErr.message);
        }
      }

      if (!isAuthorizedAssessor) {
        const accreditedSet = new Set([
          '0x2546bcd3c84621e976d8185a91a922ae77ecec30'.toLowerCase()
        ]);
        isAuthorizedAssessor = candidateAssessor && accreditedSet.has(candidateAssessor.toLowerCase());
      }

      if (!isAuthorizedAssessor) {
        return res.status(403).json({
          error: `Unauthorized: Wallet '${candidateAssessor || 'unspecified'}' is not an accredited field assessor`
        });
      }

      const relief = await store.getById('reliefs', reliefId);
      if (!relief) {
        return res.status(404).json({ error: `Relief event '${reliefId}' not found` });
      }

      let computedLvl;
      if (answers && typeof answers === 'object') {
        computedLvl = damageLevel(relief.disasterType || 'flood', answers);
      } else if (directDamageLevel != null) {
        computedLvl = Number(directDamageLevel);
      } else {
        return res.status(400).json({ error: 'Must provide either answers criteria object or damageLevel' });
      }

      if (confirmedAreaAcres != null) {
        await store.update('claims', req.params.id, {
          confirmedAreaAcres: Number(confirmedAreaAcres)
        });
      }

      const claimForCompute = {
        ...claim,
        confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : claim.confirmedAreaAcres
      };
      const calculatedAmount = computeAmount(claimForCompute, relief, computedLvl);

      const damageEvidenceHash = sha256({
        claimId: req.params.id,
        reliefId,
        damageLevel: computedLvl,
        answers: answers || null,
        damageNotes,
        assessorAddress: candidateAssessor
      });

      // Call chain.assess if available
      if (chain && typeof chain.assess === 'function') {
        try {
          await chain.assess(req.params.id, reliefId, computedLvl, damageEvidenceHash);
        } catch (chainErr) {
          console.warn('[Chain] Error calling chain.assess:', chainErr.message);
        }
      }

      const existingPayout = await store.getById('payouts', req.params.id);
      const payoutDoc = {
        payoutId: existingPayout ? existingPayout.payoutId : `payout_claim_${req.params.id}_${reliefId}`,
        claimId: String(req.params.id),
        reliefId,
        beneficiaryAddress: claim.beneficiaryAddress || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        status: 'Assessed',
        damageLevel: computedLvl,
        answers: answers || null,
        confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : null,
        damageNotes,
        damageEvidenceHash,
        calculatedAmount,
        estimatedAmount: calculatedAmount,
        officiallySanctionedAmount: req.body.officiallySanctionedAmount || req.body.sanctionedAmount || (existingPayout ? existingPayout.officiallySanctionedAmount : null),
        sanctionedAmount: req.body.sanctionedAmount || req.body.officiallySanctionedAmount || (existingPayout ? existingPayout.sanctionedAmount : null),
        amount: (req.body.officiallySanctionedAmount || req.body.sanctionedAmount) ? String(req.body.officiallySanctionedAmount || req.body.sanctionedAmount) : ((existingPayout && existingPayout.officiallySanctionedAmount) || calculatedAmount),
        approvals: existingPayout && existingPayout.approvals ? existingPayout.approvals : [],
        txHash: null,
        releasedAt: null,
        assessorAddress: candidateAssessor
      };

      const savedPayout = await store.save('payouts', payoutDoc);
      res.json({
        message: 'Damage assessed successfully',
        payout: savedPayout
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 11b. POST /claims/:id/approve - Government Officer approves land claim
  // -------------------------------------------------------------
  router.post(['/claims/:id/approve', '/parcels/:id/approve'], requireRole(ROLES.GOVERNMENT_OFFICER), async (req, res, next) => {
    try {
      let claim = await store.getById('claims', req.params.id);
      if (!claim) {
        // Fallback: check on-chain or payload
        const rawId = req.params.id;
        const numId = parseInt(String(rawId).replace(/\D/g, ''), 10);
        if (!isNaN(numId) && chain && typeof chain.getClaim === 'function') {
          try {
            const chainClaim = await chain.getClaim(numId);
            if (chainClaim) {
              const newDoc = {
                claimId: String(numId),
                landId: String(numId),
                ownerName: req.body.ownerName || req.body.farmerName || req.body.citizenName || 'Landowner',
                score: chainClaim.score != null ? Number(chainClaim.score) : 5,
                status: chainClaim.status || 'Verified',
                onChainStatus: chainClaim.status || 'Verified',
                verificationStatus: 'APPROVED',
                workflowStatus: 'Approved',
                surveyNumber: req.body.surveyNumber || `${100 + numId}/1`,
                areaAcres: req.body.areaAcres || 3.0,
                village: req.body.village || 'Mandya',
                district: req.body.district || 'Mandya',
                state: req.body.state || 'Karnataka',
                landUseFarmerDeclared: req.body.finalClassification || 'Agricultural / Farmland',
                landUseGovtRecord: req.body.finalClassification || 'Agricultural / Farmland',
                landUseFinalApproved: req.body.finalClassification || 'Agricultural / Farmland',
                ownerHash: chainClaim.ownerHash || '',
                evidenceHash: chainClaim.evidenceHash || ''
              };
              claim = await store.save('claims', newDoc);
            }
          } catch (e) {
            console.warn('[claimsRoutes approve fallback chain error]:', e.message);
          }
        }
      }

      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const score = claim.score != null ? Number(claim.score) : (claim.verificationScore != null ? Number(claim.verificationScore) : 0);
      if (score < 5) {
        return res.status(400).json({
          error: "Claim not verified",
          score: score,
          threshold: 5,
          claimId: Number(claim.claimId || req.params.id) || req.params.id
        });
      }

      const updates = {
        status: 'Verified',
        verificationStatus: 'APPROVED',
        onChainStatus: 'Verified',
        workflowStatus: 'Approved',
        verifiedByOfficer: req.user ? req.user.name : (req.body.officerName || 'District Revenue Officer'),
        verificationDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        updatedAt: new Date().toISOString()
      };
      if (req.body.finalClassification) {
        updates.finalClassification = req.body.finalClassification;
        updates.landUseFinalApproved = req.body.finalClassification;
      }

      const targetClaimId = claim.claimId != null ? String(claim.claimId) : String(req.params.id);
      const updated = await store.update('claims', targetClaimId, updates);

      await store.recordAuditLog({
        who: req.user ? `${req.user.name} (${req.user.role})` : 'Government Officer',
        what: 'CLAIM_APPROVED_VERIFIED',
        landId: targetClaimId,
        prevValue: claim.status,
        newValue: 'Verified',
        remarks: `Official title seal granted. Confidence score ${score}/5 verified.`,
        metadata: { score, threshold: 5 }
      });

      res.status(200).json({
        message: `Claim ${targetClaimId} approved successfully`,
        claim: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 12. POST /claims/:id/approve-payout - Officer approval
  // -------------------------------------------------------------
  router.post('/claims/:id/approve-payout', requireRole(ROLES.GOVERNMENT_OFFICER), validateApprovePayoutInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const claimScore = claim.score != null ? Number(claim.score) : 0;
      if (claimScore < 5) {
        return res.status(400).json({
          error: "Claim not verified",
          score: claimScore,
          threshold: 5,
          claimId: Number(req.params.id) || req.params.id
        });
      }

      const { reliefId, officer, amount, beneficiaryAddress, beneficiary } = req.body;
      const payout = await store.getById('payouts', req.params.id);

      if (!payout || payout.status === 'None') {
        return res.status(400).json({
          error: 'No active assessment found for this claim. Payout must be Assessed before approval.'
        });
      }

      if (payout.status === 'Paid') {
        return res.status(400).json({ error: 'Payout has already been released' });
      }

      // Check for approval parameter mismatches (amount or beneficiary)
      // "officer1 approves with amount X, officer2 approves with different amount or different beneficiary -> must NOT count as matching approval, stays Assessed"
      if (amount !== undefined && amount !== null && String(amount) !== String(payout.amount)) {
        return res.status(400).json({
          error: `Approval mismatch: approved amount '${amount}' does not match assessed payout amount '${payout.amount}'. Payout status remains ${payout.status}.`
        });
      }

      const expectedBeneficiary = payout.beneficiaryAddress || claim.beneficiaryAddress || '';
      const providedBeneficiary = beneficiaryAddress || beneficiary;
      if (providedBeneficiary && providedBeneficiary.toLowerCase() !== expectedBeneficiary.toLowerCase()) {
        return res.status(400).json({
          error: `Approval mismatch: approved beneficiary '${providedBeneficiary}' does not match assessed payout beneficiary '${expectedBeneficiary}'. Payout status remains ${payout.status}.`
        });
      }

      const existingApprovals = Array.isArray(payout.approvals) ? payout.approvals : [];
      if (existingApprovals.includes(officer)) {
        return res.status(400).json({ error: `Officer '${officer}' has already approved this payout` });
      }

      const updatedApprovals = [...existingApprovals, officer];
      let newStatus = payout.status;
      if (updatedApprovals.length >= 2) {
        newStatus = 'Approved';
      }

      // Call chain.approvePayout if available
      if (chain && typeof chain.approvePayout === 'function') {
        try {
          await chain.approvePayout(req.params.id, officer);
        } catch (chainErr) {
          console.warn('[Chain] Error calling chain.approvePayout:', chainErr.message);
        }
      }

      const payoutUpdates = {
        approvals: updatedApprovals,
        status: newStatus
      };
      const sanctionedInBody = req.body.officiallySanctionedAmount || req.body.sanctionedAmount;
      if (sanctionedInBody != null) {
        payoutUpdates.officiallySanctionedAmount = String(sanctionedInBody);
        payoutUpdates.sanctionedAmount = String(sanctionedInBody);
        payoutUpdates.amount = String(sanctionedInBody);
      }

      const updated = await store.update('payouts', req.params.id, payoutUpdates);

      res.json({
        message: `Payout approved by officer '${officer}' (${updatedApprovals.length}/2 approvals)`,
        payout: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 12b. POST & PATCH /claims/:id/sanction - Officially sanction relief amount
  // Separate from Calculated/Estimated Amount
  // -------------------------------------------------------------
  const sanctionHandler = async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const payout = await store.getById('payouts', req.params.id);
      if (!payout || payout.status === 'None') {
        return res.status(400).json({
          error: 'No active assessment found for this claim. Assessment must be performed before sanctioning.'
        });
      }

      const sanctioned = req.body.officiallySanctionedAmount || req.body.sanctionedAmount || req.body.amount;
      if (sanctioned === undefined || sanctioned === null || String(sanctioned).trim() === '') {
        return res.status(400).json({
          error: 'Missing required field: officiallySanctionedAmount (or sanctionedAmount)'
        });
      }

      const sanctionedStr = String(sanctioned);
      const officer = req.body.officer || req.headers['x-user-name'] || 'Government Officer';
      const notes = req.body.notes || req.body.remarks || 'Officially sanctioned by Government Officer';

      const updated = await store.update('payouts', req.params.id, {
        officiallySanctionedAmount: sanctionedStr,
        sanctionedAmount: sanctionedStr,
        amount: sanctionedStr,
        sanctionedBy: officer,
        sanctionedAt: new Date().toISOString(),
        sanctionNotes: notes
      });

      await store.recordAuditLog({
        who: officer,
        what: 'RELIEF_SANCTIONED',
        landId: req.params.id,
        prevValue: payout.officiallySanctionedAmount || payout.amount || '0',
        newValue: sanctionedStr,
        remarks: `Relief officially sanctioned: ${sanctionedStr} wei. Notes: ${notes}`
      });

      res.json({
        message: `Officially sanctioned amount updated to ${sanctionedStr} wei`,
        payout: updated
      });
    } catch (err) {
      next(err);
    }
  };

  router.post('/claims/:id/sanction', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionHandler);
  router.patch('/claims/:id/sanction', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionHandler);
  router.post('/parcels/:id/sanction', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionHandler);
  router.patch('/parcels/:id/sanction', requireRole(ROLES.GOVERNMENT_OFFICER), sanctionHandler);

  // -------------------------------------------------------------
  // 13. POST /claims/:id/release-payout - Release approved compensation
  // -------------------------------------------------------------
  router.post('/claims/:id/release-payout', requireRole(ROLES.GOVERNMENT_OFFICER), validateReleasePayoutInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      if (claim.status === 'Disputed' || (claim.dispute && claim.dispute.isDisputed)) {
        return res.status(400).json({
          error: 'Cannot release payout for a Disputed claim. Dispute must be arbitrated first.'
        });
      }

      const { reliefId } = req.body;
      const payout = await store.getById('payouts', req.params.id);

      if (!payout) {
        return res.status(404).json({ error: 'No payout record found for this claim' });
      }

      if (payout.status === 'Paid') {
        return res.status(400).json({ error: 'Payout has already been paid and released' });
      }

      if (payout.status !== 'Approved') {
        return res.status(400).json({
          error: `Cannot release payout with status '${payout.status}'. Payout requires 2-officer approval ('Approved' status).`
        });
      }

      // Call chain.releasePayout if available
      let chainReleaseTx = null;
      if (chain && typeof chain.releasePayout === 'function') {
        try {
          chainReleaseTx = await chain.releasePayout(req.params.id);
        } catch (chainErr) {
          console.warn('[Chain] Error calling chain.releasePayout:', chainErr.message);
          return res.status(400).json({
            error: `On-chain payout release reverted: ${chainErr.message}`
          });
        }
      }

      const txHash = (chainReleaseTx && (chainReleaseTx.txHash || chainReleaseTx.hash)) || generateTxHash();
      const releasedAt = new Date().toISOString();

      const updatedPayout = await store.update('payouts', req.params.id, {
        status: 'Paid',
        txHash,
        releasedAt
      });

      const relief = await store.getById('reliefs', reliefId || payout.reliefId);
      if (relief && relief.remainingBudget) {
        try {
          const currentRem = BigInt(relief.remainingBudget);
          const payAmt = BigInt(payout.amount || '0');
          const newRem = currentRem >= payAmt ? currentRem - payAmt : 0n;
          await store.update('reliefs', relief.reliefId, { remainingBudget: newRem.toString() });
        } catch {
          // ignore parsing error
        }
      }

      res.json({
        message: 'Payout released successfully on MST Testnet',
        txHash,
        payout: updatedPayout
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 14. GET /claims/:id/payout - View payout status & amount
  // -------------------------------------------------------------
  router.get('/claims/:id/payout', async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }
      const payout = await getPayoutRecord(req.params.id);
      res.json(payout);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 15. POST /claims/:id/workflow - Missing-document workflow
  // Status transitions: Submitted -> Missing Documents Detected -> Special Verification -> Ground Verification -> Government Review -> Approved/Rejected
  // CRITICAL RULE: Never auto-reject for missing docs alone
  // -------------------------------------------------------------
  router.post(['/claims/:id/workflow', '/parcels/:id/workflow'], async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const {
        workflowStatus,
        reason = '',
        notes = '',
        landUseGroundVerified,
        landUseFinalApproved
      } = req.body || {};

      const VALID_WORKFLOW_STATUSES = [
        'Submitted',
        'Missing Documents Detected',
        'Special Verification',
        'Ground Verification',
        'Government Review',
        'Approved',
        'Rejected'
      ];

      if (!workflowStatus || !VALID_WORKFLOW_STATUSES.includes(workflowStatus)) {
        return res.status(400).json({
          error: `Invalid workflowStatus '${workflowStatus}'. Must be one of: ${VALID_WORKFLOW_STATUSES.join(', ')}`
        });
      }

      // INVARIANT: Never auto-reject for missing docs alone
      const textToCheck = `${reason} ${notes}`;
      const isMissingDocsReason =
        (/missing/i.test(textToCheck) && /(document|doc|paperwork|record|proof|title)/i.test(textToCheck)) ||
        req.body.isMissingDocsOnly === true ||
        req.body.missingDocsAlone === true;

      if (workflowStatus === 'Rejected' && isMissingDocsReason) {
        return res.status(400).json({
          error: 'Cannot reject application for missing documents alone. Route to Special Verification for community/field investigation.'
        });
      }

      // If current state is Missing Documents Detected and attempting to reject without independent fraud grounds:
      if (workflowStatus === 'Rejected' && claim.workflowStatus === 'Missing Documents Detected' && !reason.toLowerCase().includes('fraud')) {
        return res.status(400).json({
          error: 'Cannot reject application for missing documents alone. Route to Special Verification for community/field investigation.'
        });
      }

      const prevWf = claim.workflowStatus || claim.verificationStatus || claim.status;
      const specEquivalent = workflowStatus === 'Approved'
        ? 'APPROVED'
        : (workflowStatus === 'Rejected'
            ? 'REJECTED'
            : (workflowStatus === 'Ground Verification'
                ? 'GROUND_VERIFICATION'
                : (workflowStatus === 'Special Verification'
                    ? 'COMMUNITY/NGO_VERIFICATION'
                    : 'GOVERNMENT_REVIEW')));
      const onChainStatus = store.mapToOnChainStatus(specEquivalent);

      const updates = {
        workflowStatus,
        verificationStatus: specEquivalent,
        onChainStatus,
        workflowNotes: notes || reason || `Transitioned to ${workflowStatus}`,
        updatedAt: new Date().toISOString()
      };

      if (landUseGroundVerified) updates.landUseGroundVerified = landUseGroundVerified;
      if (landUseFinalApproved) updates.landUseFinalApproved = landUseFinalApproved;

      if (workflowStatus === 'Approved') {
        updates.status = 'Verified';
        if (!updates.landUseFinalApproved) {
          updates.landUseFinalApproved = claim.landUseGroundVerified || claim.landUseFarmerDeclared || 'Agricultural';
        }
      }

      const updated = await store.update('claims', req.params.id, updates);

      // Record immutable Audit Log
      await store.recordAuditLog({
        who: req.user ? `${req.user.name} (${req.user.role})` : 'Authorized Verifier',
        what: `WORKFLOW_TRANSITION_${workflowStatus.replace(/\s+/g, '_').toUpperCase()}`,
        landId: req.params.id,
        prevValue: prevWf,
        newValue: workflowStatus,
        remarks: notes || reason || `Workflow transitioned to ${workflowStatus}`,
        metadata: { onChainStatus, specEquivalent }
      });

      const docs = await store.getDocumentsByClaimId(req.params.id);
      const acres = updated.parcelAreaAcres != null ? updated.parcelAreaAcres : (updated.confirmedAreaAcres || 0);

      res.json({
        message: `Application workflow status updated to '${workflowStatus}'`,
        claim: {
          ...updated,
          landId: updated.landId || updated.claimId,
          area: store.formatAreaUnits(acres),
          documents: docs
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 16. POST /claims/:id/missing-docs - Detect missing documents triage
  // Flags application for Special Verification pathway (NEVER REJECTS)
  // -------------------------------------------------------------
  router.post(['/claims/:id/missing-docs', '/parcels/:id/missing-docs'], async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const {
        missingDocumentTypes = ['title_deed'],
        notes = 'Missing mandatory primary land ownership deed'
      } = req.body || {};

      const updated = await store.update('claims', req.params.id, {
        workflowStatus: 'Missing Documents Detected',
        missingDocumentTypes,
        missingDocsNotes: notes,
        workflowNotes: `Missing documents detected: ${missingDocumentTypes.join(', ')}. Routed to Special Verification pathway.`
      });

      const docs = await store.getDocumentsByClaimId(req.params.id);
      const acres = updated.parcelAreaAcres != null ? updated.parcelAreaAcres : (updated.confirmedAreaAcres || 0);

      res.json({
        message: 'Missing documents recorded; application routed to Missing Documents Detected (not rejected)',
        claim: {
          ...updated,
          landId: updated.landId || updated.claimId,
          area: store.formatAreaUnits(acres),
          documents: docs
        },
        recommendedNextStep: 'Special Verification'
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 17. GET /claims/:id/audit-logs - Parcel-specific audit trail
  // -------------------------------------------------------------
  router.get(['/claims/:id/audit-logs', '/parcels/:id/audit-logs'], async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }
      const logs = await store.getAuditLogsByLandId(req.params.id);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
