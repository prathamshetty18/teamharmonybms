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
  router.post('/claims', fileUploadMiddleware, validateClaimInput, async (req, res, next) => {
    try {
      const {
        ownerName,
        nationalId = 'IND-KA-' + Math.floor(100000 + Math.random() * 900000),
        polygon,
        parcelAreaAcres = 2.0,
        confirmedAreaAcres = null,
        notes = '',
        beneficiaryAddress = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0')
      } = req.body;

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

      const newClaim = {
        claimId: primaryClaimId,
        ownerName,
        nationalId,
        ownerHash,
        evidenceHash,
        polygon,
        latE6,
        lonE6,
        referencePoint: [avgLon, avgLat],
        parcelAreaAcres: Number(parcelAreaAcres),
        confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : null,
        score: 0,
        status,
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
      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 2. GET /claims - List all land parcels for map markers
  // -------------------------------------------------------------
  router.get('/claims', async (req, res, next) => {
    try {
      const all = await store.getAll('claims');
      res.json(all);
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
  router.get('/claims/:id', async (req, res, next) => {
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

      res.json(merged);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 4. POST /claims/:id/attest - Community attestation
  // After each attest call, save attestation history to Atlas via store.update
  // -------------------------------------------------------------
  router.post('/claims/:id/attest', validateAttestInput, async (req, res, next) => {
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
        status: newStatus
      });

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
  router.post('/claims/:id/dispute', validateDisputeInput, async (req, res, next) => {
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
        dispute: disputeRecord,
        disputeReason: reason,
        disputeNotes: req.body.notes || `Dispute flagged: ${reason}`
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
  router.post('/claims/:id/resolve', validateResolveInput, async (req, res, next) => {
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

      let resolvedStatus = 'Pending';
      if (restore === true && (claim.score || 0) >= 5) {
        resolvedStatus = 'Verified';
      }

      // Call chain.resolveDispute if available
      if (chain && typeof chain.resolveDispute === 'function') {
        try {
          await chain.resolveDispute(req.params.id, restore);
        } catch (chainErr) {
          console.warn(`[Chain] Error calling chain.resolveDispute:`, chainErr.message);
        }
      }

      const updated = await store.update('claims', req.params.id, {
        status: resolvedStatus,
        dispute: null,
        resolution: {
          restored: restore,
          resolutionNotes,
          arbiterAddress,
          resolvedAt: new Date().toISOString()
        }
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
  router.post('/reliefs', validateReliefInput, async (req, res, next) => {
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
  router.post('/claims/:id/assess', fileUploadMiddleware, validateAssessInput, async (req, res, next) => {
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
        assessorAddress
      });

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
        amount: calculatedAmount,
        approvals: existingPayout && existingPayout.approvals ? existingPayout.approvals : [],
        txHash: null,
        releasedAt: null,
        assessorAddress
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
  // 12. POST /claims/:id/approve-payout - Officer approval
  // -------------------------------------------------------------
  router.post('/claims/:id/approve-payout', validateApprovePayoutInput, async (req, res, next) => {
    try {
      const claim = await store.getById('claims', req.params.id);
      if (!claim) {
        return res.status(404).json({ error: `Claim with id '${req.params.id}' not found` });
      }

      const { reliefId, officer } = req.body;
      const payout = await store.getById('payouts', req.params.id);

      if (!payout || payout.status === 'None') {
        return res.status(400).json({
          error: 'No active assessment found for this claim. Payout must be Assessed before approval.'
        });
      }

      if (payout.status === 'Paid') {
        return res.status(400).json({ error: 'Payout has already been released' });
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

      const updated = await store.update('payouts', req.params.id, {
        approvals: updatedApprovals,
        status: newStatus
      });

      res.json({
        message: `Payout approved by officer '${officer}' (${updatedApprovals.length}/2 approvals)`,
        payout: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 13. POST /claims/:id/release-payout - Release approved compensation
  // -------------------------------------------------------------
  router.post('/claims/:id/release-payout', validateReleasePayoutInput, async (req, res, next) => {
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

      const txHash = generateTxHash();
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
      const payout = await getPayoutRecord(req.params.id);
      res.json(payout);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
