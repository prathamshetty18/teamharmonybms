const express = require('express');
const turf = require('@turf/turf');
const store = require('../store');
const { requireRole, ROLES } = require('../auth');
const { damageLevel, resolveProfile, getProfile, PROFILES, SCHEMES, SUPPORTED_STATES, computeAmount } = require('../eligibility');
const { isValidGeoJSONPolygon } = require('../utils/validate');

/**
 * Creates Disaster Events & Disaster Assessments Routes
 * 
 * Endpoints:
 * - POST /disasters: Create disaster event (id, type, date, affected location/villages, GIS area, severity)
 * - GET /disasters: List disaster events with filters
 * - GET /disasters/types: Get supported types, severities, schemes, states
 * - GET /disasters/:id: Get single disaster event by ID
 * - PATCH /disasters/:id: Update disaster event
 * - DELETE /disasters/:id: Delete or close disaster event
 * - GET /disasters/:id/affected-parcels: Find land parcels in disaster GIS area
 * 
 * - POST /disaster-assessments: Link to damageLevel() output, store officer, timestamp
 * - GET /disaster-assessments: List assessments with filters
 * - GET /disaster-assessments/:id: Get single assessment
 * - GET /disaster-assessments/for-claim/:claimId: Get assessments for a land parcel
 * - GET /disaster-assessments/for-disaster/:disasterId: Get assessments for a disaster event
 * - PATCH /disaster-assessments/:id: Update assessment remarks/status
 */
function createDisasterRoutes(upload) {
  const router = express.Router();
  const fileUploadMiddleware = upload ? upload.array('photos', 5) : (req, res, next) => next();

  // -------------------------------------------------------------
  // GET /disasters/types - Metadata endpoint
  // -------------------------------------------------------------
  router.get(['/disasters/types', '/disasters/config'], (req, res) => {
    res.json({
      disasterTypes: ['flood', 'earthquake', 'cyclone', 'drought', 'landslide'],
      severities: ['LOW', 'MEDIUM', 'HIGH', 'SEVERE', 'CATASTROPHIC'],
      schemes: SCHEMES,
      states: SUPPORTED_STATES,
      damageMultipliers: {
        LEVEL_1: '25%',
        LEVEL_2: '50%',
        LEVEL_3: '75%',
        LEVEL_4: '100%'
      }
    });
  });

  // -------------------------------------------------------------
  // 1. POST /disasters - Create Disaster Event
  // -------------------------------------------------------------
  router.post('/disasters', requireRole(ROLES.GOVERNMENT_OFFICER), async (req, res, next) => {
    try {
      const {
        id,
        disasterId,
        name,
        title,
        type,
        disasterType,
        date,
        disasterDate,
        affectedVillages,
        villages,
        affectedLocations,
        location,
        gisArea,
        geometry,
        polygon,
        severity,
        state,
        district,
        taluk,
        description = '',
        applicableSchemes = ['SDRF'],
        status = 'ACTIVE'
      } = req.body || {};

      const effectiveType = (type || disasterType || '').trim().toLowerCase();
      if (!effectiveType) {
        return res.status(400).json({ error: 'Missing required field: type (e.g. flood, earthquake, cyclone, drought, landslide)' });
      }

      const effectiveSeverity = (severity || '').toString().trim().toUpperCase();
      if (!effectiveSeverity) {
        return res.status(400).json({ error: 'Missing required field: severity (e.g. LOW, MEDIUM, HIGH, SEVERE, CATASTROPHIC)' });
      }

      // Resolve affected villages / locations
      let resolvedVillages = [];
      if (Array.isArray(affectedVillages)) {
        resolvedVillages = affectedVillages;
      } else if (Array.isArray(villages)) {
        resolvedVillages = villages;
      } else if (typeof affectedVillages === 'string') {
        resolvedVillages = affectedVillages.split(',').map(s => s.trim()).filter(Boolean);
      } else if (typeof villages === 'string') {
        resolvedVillages = villages.split(',').map(s => s.trim()).filter(Boolean);
      }

      let resolvedLocations = [];
      if (Array.isArray(affectedLocations)) {
        resolvedLocations = affectedLocations;
      } else if (location && typeof location === 'object') {
        resolvedLocations = [location];
      }

      // Resolve GIS Area & compute metrics
      const rawGis = gisArea || geometry || polygon;
      let parsedGis = null;
      let areaAcres = 0;
      let areaSqKm = 0;

      if (rawGis) {
        if (typeof rawGis === 'string') {
          try {
            parsedGis = JSON.parse(rawGis);
          } catch {
            return res.status(400).json({ error: 'gisArea must be a valid GeoJSON Polygon object or JSON string' });
          }
        } else {
          parsedGis = rawGis;
        }

        if (!isValidGeoJSONPolygon(parsedGis)) {
          return res.status(400).json({ error: 'Invalid gisArea format. Must be GeoJSON Polygon with [lon, lat] coordinates closed loop.' });
        }

        try {
          const polyFeature = parsedGis.type === 'Feature' ? parsedGis : turf.feature(parsedGis);
          const areaM2 = turf.area(polyFeature);
          areaAcres = Number((areaM2 / 4046.8564).toFixed(2));
          areaSqKm = Number((areaM2 / 1000000).toFixed(4));
        } catch (e) {
          console.warn('[Disasters] Error computing GIS area:', e.message);
        }
      }

      const now = new Date().toISOString();
      const generatedId = id || disasterId || `disaster_${effectiveType}_${Date.now()}`;
      const schemeName = name || title || `${state || 'National'} ${effectiveType.toUpperCase()} Event (${new Date(date || now).getFullYear()})`;

      const disasterDoc = {
        id: String(generatedId),
        disasterId: String(generatedId),
        name: schemeName,
        title: schemeName,
        type: effectiveType,
        disasterType: effectiveType,
        date: date || disasterDate || now,
        state: state || 'Karnataka',
        district: district || 'Bangalore South',
        taluk: taluk || '',
        affectedVillages: resolvedVillages,
        villages: resolvedVillages,
        affectedLocations: resolvedLocations,
        gisArea: parsedGis,
        gisAreaAcres: areaAcres,
        gisAreaSqKm: areaSqKm,
        severity: effectiveSeverity,
        status: status.toUpperCase(),
        description,
        applicableSchemes: Array.isArray(applicableSchemes) ? applicableSchemes : [applicableSchemes],
        declaredBy: req.body.declaredBy || req.headers['x-user-name'] || 'Government Disaster Management Authority',
        reliefIds: Array.isArray(req.body.reliefIds) ? req.body.reliefIds : [],
        createdAt: now,
        updatedAt: now
      };

      const saved = await store.save('disasters', disasterDoc);

      await store.recordAuditLog({
        who: req.headers['x-user-name'] || 'Government Officer',
        what: 'DISASTER_EVENT_DECLARED',
        landId: generatedId,
        prevValue: 'NONE',
        newValue: effectiveSeverity,
        remarks: `Disaster event declared: ${schemeName} [${effectiveType}] Severity: ${effectiveSeverity}`
      });

      res.status(201).json({
        message: 'Disaster event created successfully',
        disaster: saved
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 2. GET /disasters - List Disaster Events with Filters
  // -------------------------------------------------------------
  router.get('/disasters', async (req, res, next) => {
    try {
      const all = await store.getAll('disasters');
      const {
        type,
        severity,
        status,
        state,
        district,
        village,
        q,
        page = 1,
        limit = 50
      } = req.query;

      let filtered = all;

      if (type) {
        const t = String(type).toLowerCase();
        filtered = filtered.filter(d => (d.type && d.type.toLowerCase() === t) || (d.disasterType && d.disasterType.toLowerCase() === t));
      }

      if (severity) {
        const s = String(severity).toUpperCase();
        filtered = filtered.filter(d => d.severity && d.severity.toUpperCase() === s);
      }

      if (status) {
        const st = String(status).toUpperCase();
        filtered = filtered.filter(d => d.status && d.status.toUpperCase() === st);
      }

      if (state) {
        const st = String(state).toLowerCase();
        filtered = filtered.filter(d => d.state && d.state.toLowerCase().includes(st));
      }

      if (district) {
        const dist = String(district).toLowerCase();
        filtered = filtered.filter(d => d.district && d.district.toLowerCase().includes(dist));
      }

      if (village) {
        const v = String(village).toLowerCase();
        filtered = filtered.filter(d => 
          (Array.isArray(d.affectedVillages) && d.affectedVillages.some(av => av.toLowerCase().includes(v))) ||
          (Array.isArray(d.villages) && d.villages.some(av => av.toLowerCase().includes(v)))
        );
      }

      if (q) {
        const query = String(q).toLowerCase();
        filtered = filtered.filter(d => 
          (d.name && d.name.toLowerCase().includes(query)) ||
          (d.description && d.description.toLowerCase().includes(query)) ||
          (d.type && d.type.toLowerCase().includes(query)) ||
          (d.state && d.state.toLowerCase().includes(query)) ||
          (d.district && d.district.toLowerCase().includes(query))
        );
      }

      // Sort newest first
      filtered.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 50);
      const total = filtered.length;
      const startIndex = (pageNum - 1) * limitNum;
      const paginated = filtered.slice(startIndex, startIndex + limitNum);

      res.json({
        disasters: paginated,
        count: paginated.length,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 3. GET /disasters/:id - Single Disaster Event
  // -------------------------------------------------------------
  router.get('/disasters/:id', async (req, res, next) => {
    try {
      const disaster = await store.getById('disasters', req.params.id);
      if (!disaster) {
        return res.status(404).json({ error: `Disaster event '${req.params.id}' not found` });
      }

      const assessments = await store.getDisasterAssessmentsByDisasterId(req.params.id);
      res.json({
        ...disaster,
        assessmentsCount: assessments.length,
        assessments
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 4. PATCH & PUT /disasters/:id - Update Disaster Event
  // -------------------------------------------------------------
  const updateDisasterHandler = async (req, res, next) => {
    try {
      const existing = await store.getById('disasters', req.params.id);
      if (!existing) {
        return res.status(404).json({ error: `Disaster event '${req.params.id}' not found` });
      }

      const updates = { ...req.body };
      delete updates.id;
      delete updates.disasterId;
      delete updates.createdAt;

      // Recalculate GIS if updated
      const rawGis = updates.gisArea || updates.geometry || updates.polygon;
      if (rawGis) {
        let parsedGis = rawGis;
        if (typeof rawGis === 'string') {
          try { parsedGis = JSON.parse(rawGis); } catch {
            return res.status(400).json({ error: 'gisArea must be a valid GeoJSON Polygon object or JSON string' });
          }
        }
        if (isValidGeoJSONPolygon(parsedGis)) {
          const polyFeature = parsedGis.type === 'Feature' ? parsedGis : turf.feature(parsedGis);
          const areaM2 = turf.area(polyFeature);
          updates.gisArea = parsedGis;
          updates.gisAreaAcres = Number((areaM2 / 4046.8564).toFixed(2));
          updates.gisAreaSqKm = Number((areaM2 / 1000000).toFixed(4));
        }
      }

      const updated = await store.update('disasters', existing.id, updates);
      res.json({
        message: 'Disaster event updated successfully',
        disaster: updated
      });
    } catch (err) {
      next(err);
    }
  };

  router.patch('/disasters/:id', requireRole(ROLES.GOVERNMENT_OFFICER), updateDisasterHandler);
  router.put('/disasters/:id', requireRole(ROLES.GOVERNMENT_OFFICER), updateDisasterHandler);

  // -------------------------------------------------------------
  // 5. DELETE /disasters/:id - Delete or Close Disaster Event
  // -------------------------------------------------------------
  router.delete('/disasters/:id', requireRole(ROLES.GOVERNMENT_OFFICER), async (req, res, next) => {
    try {
      const existing = await store.getById('disasters', req.params.id);
      if (!existing) {
        return res.status(404).json({ error: `Disaster event '${req.params.id}' not found` });
      }

      const updated = await store.update('disasters', existing.id, { status: 'CLOSED' });
      res.json({
        message: `Disaster event '${req.params.id}' status set to CLOSED`,
        disaster: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 6. GET /disasters/:id/affected-parcels - Find parcels in disaster zone
  // -------------------------------------------------------------
  router.get('/disasters/:id/affected-parcels', async (req, res, next) => {
    try {
      const disaster = await store.getById('disasters', req.params.id);
      if (!disaster) {
        return res.status(404).json({ error: `Disaster event '${req.params.id}' not found` });
      }

      const claims = await store.getAll('claims');
      const affected = [];

      if (disaster.gisArea) {
        const disasterPoly = disaster.gisArea.type === 'Feature' ? disaster.gisArea : turf.feature(disaster.gisArea);
        for (const c of claims) {
          if (c.referencePoint && Array.isArray(c.referencePoint) && c.referencePoint.length >= 2) {
            try {
              const pt = turf.point(c.referencePoint);
              if (turf.booleanPointInPolygon(pt, disasterPoly)) {
                affected.push(c);
              }
            } catch {
              // ignore
            }
          } else if (c.polygon) {
            try {
              const cPoly = c.polygon.type === 'Feature' ? c.polygon : turf.feature(c.polygon);
              const intersect = turf.intersect(turf.featureCollection([cPoly, disasterPoly]));
              if (intersect) affected.push(c);
            } catch {
              // ignore
            }
          }
        }
      }

      res.json({
        disasterId: disaster.id,
        name: disaster.name,
        affectedParcelsCount: affected.length,
        affectedParcels: affected
      });
    } catch (err) {
      next(err);
    }
  });

  // =============================================================
  // DISASTER ASSESSMENTS ENDPOINTS (/disaster-assessments)
  // =============================================================

  // -------------------------------------------------------------
  // 7. POST /disaster-assessments - Link to damageLevel() output, store officer, timestamp
  // -------------------------------------------------------------
  router.post(
    '/disaster-assessments',
    fileUploadMiddleware,
    requireRole(ROLES.GROUND_VERIFICATION_OFFICER, ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const {
          claimId,
          landId,
          disasterId,
          reliefId,
          disasterType,
          answers,
          damageLevel: directDamageLevel,
          damageNotes,
          remarks,
          confirmedAreaAcres,
          gpsLocation,
          photos,
          officer,
          officerName,
          officerRole,
          timestamp,
          state,
          scheme
        } = req.body || {};

        const effectiveLandId = String(claimId || landId || '').trim();
        if (!effectiveLandId) {
          return res.status(400).json({ error: 'Missing required field: claimId (or landId)' });
        }

        const claim = await store.getById('claims', effectiveLandId);
        if (!claim) {
          return res.status(404).json({ error: `Land parcel/claim '${effectiveLandId}' not found` });
        }

        // Determine disaster type for profile resolution
        let resolvedDisasterType = 'flood';
        let linkedDisaster = null;
        if (disasterId) {
          linkedDisaster = await store.getById('disasters', disasterId);
          if (linkedDisaster && (linkedDisaster.type || linkedDisaster.disasterType)) {
            resolvedDisasterType = linkedDisaster.type || linkedDisaster.disasterType;
          }
        } else if (reliefId) {
          const relief = await store.getById('reliefs', reliefId);
          if (relief && relief.disasterType) {
            resolvedDisasterType = relief.disasterType;
          }
        } else if (disasterType) {
          resolvedDisasterType = String(disasterType);
        }

        // Compute damage level using existing damageLevel() output
        let computedLvl;
        if (answers && typeof answers === 'object') {
          try {
            computedLvl = damageLevel(resolvedDisasterType, answers, {
              state: state || (claim && claim.state) || (linkedDisaster && linkedDisaster.state),
              scheme: scheme || (linkedDisaster && linkedDisaster.applicableSchemes && linkedDisaster.applicableSchemes[0]) || 'sdrf'
            });
          } catch (dlErr) {
            return res.status(400).json({ error: dlErr.message });
          }
        } else if (directDamageLevel != null) {
          computedLvl = Number(directDamageLevel);
          if (![1, 2, 3, 4].includes(computedLvl)) {
            return res.status(400).json({ error: 'Invalid damageLevel. Must be 1, 2, 3, or 4' });
          }
        } else {
          return res.status(400).json({ error: 'Must provide either criteria answers object or explicit damageLevel' });
        }

        // Resolve damage percentage
        const profile = resolveProfile(resolvedDisasterType, { state: claim.state, scheme });
        const damagePercent = (profile && profile.damagePercentage && profile.damagePercentage[computedLvl]) || (computedLvl * 25);

        // Uploaded photos handling
        let uploadedPhotos = [];
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          uploadedPhotos = req.files.map(f => `/uploads/${f.filename}`);
        } else if (Array.isArray(photos)) {
          uploadedPhotos = photos;
        } else if (typeof photos === 'string') {
          uploadedPhotos = [photos];
        }

        // Officer resolution
        const recordedOfficer = officer || req.headers['x-user-name'] || req.user?.name || req.user?.id || 'GVO Field Officer';
        const recordedRole = officerRole || req.headers['x-role'] || req.user?.role || 'Ground Verification Officer';
        const recordedTime = timestamp || new Date().toISOString();

        // Calculate estimated compensation amount
        let calculatedAmount = '0';
        const reliefDoc = reliefId ? await store.getById('reliefs', reliefId) : null;
        if (reliefDoc) {
          const claimForCompute = {
            ...claim,
            confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : claim.confirmedAreaAcres
          };
          calculatedAmount = computeAmount(claimForCompute, reliefDoc, computedLvl);
        } else {
          // Compute standard estimated rate based on profile
          const acres = confirmedAreaAcres != null ? Number(confirmedAreaAcres) : (claim.parcelAreaAcres || 1.0);
          const landType = claim.landUseFinalApproved || claim.landUseGroundVerified || claim.landUseFarmerDeclared || 'Agricultural';
          const defaultRate = (profile && profile.ratesByLandType && profile.ratesByLandType[landType]) 
            ? BigInt(profile.ratesByLandType[landType]) 
            : 1000000000000000000n;
          const multBps = [0n, 2500n, 5000n, 7500n, 10000n][computedLvl] || 2500n;
          const acresX100 = BigInt(Math.round(acres * 100));
          const estWei = (acresX100 * defaultRate * multBps) / (100n * 10000n);
          calculatedAmount = estWei.toString();
        }

        const assessmentId = `assess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const assessmentDoc = {
          id: assessmentId,
          assessmentId,
          claimId: effectiveLandId,
          landId: effectiveLandId,
          disasterId: disasterId || (linkedDisaster ? linkedDisaster.id : null),
          reliefId: reliefId || null,
          disasterType: resolvedDisasterType,
          officer: recordedOfficer,
          officerName: officerName || recordedOfficer,
          officerRole: recordedRole,
          timestamp: recordedTime,
          answers: answers || null,
          damageLevel: computedLvl,
          damagePercent,
          confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : null,
          calculatedAmount,
          estimatedAmount: calculatedAmount,
          officiallySanctionedAmount: null,
          sanctionedAmount: null,
          damageNotes: damageNotes || remarks || 'Field damage assessment completed',
          remarks: remarks || damageNotes || '',
          photos: uploadedPhotos,
          gpsLocation: Array.isArray(gpsLocation) ? gpsLocation : null,
          status: 'SUBMITTED',
          createdAt: recordedTime,
          updatedAt: recordedTime
        };

        const savedAssessment = await store.save('disasterAssessments', assessmentDoc);

        // Keep payouts table in sync so existing relief and chain flows work seamlessly
        const existingPayout = await store.getById('payouts', effectiveLandId);
        const payoutDoc = {
          payoutId: existingPayout ? existingPayout.payoutId : `payout_claim_${effectiveLandId}_${disasterId || reliefId || 'default'}`,
          claimId: effectiveLandId,
          reliefId: reliefId || (existingPayout ? existingPayout.reliefId : null),
          disasterId: disasterId || null,
          status: 'Assessed',
          damageLevel: computedLvl,
          answers: answers || null,
          confirmedAreaAcres: confirmedAreaAcres != null ? Number(confirmedAreaAcres) : null,
          damageNotes: damageNotes || remarks || 'Damage assessed via disaster assessment workflow',
          calculatedAmount,
          estimatedAmount: calculatedAmount,
          officiallySanctionedAmount: existingPayout ? existingPayout.officiallySanctionedAmount : null,
          sanctionedAmount: existingPayout ? existingPayout.sanctionedAmount : null,
          amount: (existingPayout && existingPayout.officiallySanctionedAmount) || calculatedAmount,
          assessorAddress: req.body.assessorAddress || '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
          approvals: existingPayout && existingPayout.approvals ? existingPayout.approvals : [],
          txHash: null,
          releasedAt: null
        };
        await store.save('payouts', payoutDoc);

        if (confirmedAreaAcres != null) {
          await store.update('claims', effectiveLandId, { confirmedAreaAcres: Number(confirmedAreaAcres) });
        }

        await store.recordAuditLog({
          who: recordedOfficer,
          what: 'DISASTER_ASSESSMENT_SUBMITTED',
          landId: effectiveLandId,
          prevValue: 'UNASSESSED',
          newValue: `DAMAGE_LEVEL_${computedLvl}`,
          remarks: `Damage assessed at Level ${computedLvl} (${damagePercent}%). Estimated amount: ${calculatedAmount} wei`
        });

        res.status(201).json({
          message: 'Disaster assessment recorded successfully',
          assessment: savedAssessment,
          payout: payoutDoc
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------
  // 8. GET /disaster-assessments - List all assessments with filters
  // -------------------------------------------------------------
  router.get('/disaster-assessments', async (req, res, next) => {
    try {
      const all = await store.getAll('disasterAssessments');
      const {
        claimId,
        landId,
        disasterId,
        reliefId,
        officer,
        damageLevel: lvl,
        status,
        page = 1,
        limit = 50
      } = req.query;

      let filtered = all;

      const targetClaim = claimId || landId;
      if (targetClaim) {
        const cid = String(targetClaim);
        filtered = filtered.filter(a => String(a.claimId) === cid || String(a.landId) === cid);
      }

      if (disasterId) {
        const did = String(disasterId);
        filtered = filtered.filter(a => String(a.disasterId) === did);
      }

      if (reliefId) {
        const rid = String(reliefId);
        filtered = filtered.filter(a => String(a.reliefId) === rid);
      }

      if (officer) {
        const off = String(officer).toLowerCase();
        filtered = filtered.filter(a => 
          (a.officer && a.officer.toLowerCase().includes(off)) ||
          (a.officerName && a.officerName.toLowerCase().includes(off))
        );
      }

      if (lvl != null) {
        const numLvl = Number(lvl);
        filtered = filtered.filter(a => Number(a.damageLevel) === numLvl);
      }

      if (status) {
        const st = String(status).toUpperCase();
        filtered = filtered.filter(a => a.status && a.status.toUpperCase() === st);
      }

      // Sort newest first
      filtered.sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 50);
      const total = filtered.length;
      const startIndex = (pageNum - 1) * limitNum;
      const paginated = filtered.slice(startIndex, startIndex + limitNum);

      res.json({
        assessments: paginated,
        count: paginated.length,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 9. GET /disaster-assessments/for-claim/:claimId - By parcel/claim
  // -------------------------------------------------------------
  router.get(['/disaster-assessments/for-claim/:claimId', '/disaster-assessments/for-parcel/:claimId'], async (req, res, next) => {
    try {
      const assessments = await store.getDisasterAssessmentsByClaimId(req.params.claimId);
      res.json({
        claimId: req.params.claimId,
        count: assessments.length,
        assessments
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 10. GET /disaster-assessments/for-disaster/:disasterId
  // -------------------------------------------------------------
  router.get('/disaster-assessments/for-disaster/:disasterId', async (req, res, next) => {
    try {
      const assessments = await store.getDisasterAssessmentsByDisasterId(req.params.disasterId);
      res.json({
        disasterId: req.params.disasterId,
        count: assessments.length,
        assessments
      });
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 11. GET /disaster-assessments/:id - Single assessment
  // -------------------------------------------------------------
  router.get('/disaster-assessments/:id', async (req, res, next) => {
    try {
      const assessment = await store.getById('disasterAssessments', req.params.id);
      if (!assessment) {
        return res.status(404).json({ error: `Disaster assessment '${req.params.id}' not found` });
      }
      res.json(assessment);
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------
  // 12. PATCH /disaster-assessments/:id - Update remarks / status
  // -------------------------------------------------------------
  router.patch(
    '/disaster-assessments/:id',
    requireRole(ROLES.GROUND_VERIFICATION_OFFICER, ROLES.GOVERNMENT_OFFICER),
    async (req, res, next) => {
      try {
        const existing = await store.getById('disasterAssessments', req.params.id);
        if (!existing) {
          return res.status(404).json({ error: `Disaster assessment '${req.params.id}' not found` });
        }

        const updates = { ...req.body };
        delete updates.id;
        delete updates.assessmentId;
        delete updates.claimId;
        delete updates.createdAt;

        const updated = await store.update('disasterAssessments', existing.id, updates);
        res.json({
          message: 'Disaster assessment updated successfully',
          assessment: updated
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = createDisasterRoutes;
