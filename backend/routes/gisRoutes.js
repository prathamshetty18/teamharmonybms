/**
 * GIS Routes — Phase D
 *
 * Extends the existing overlap.js polygon engine to expose geospatial queries
 * over the entire parcel registry. Reuses safeIntersect / checkOverlap / findOverlaps
 * without duplicating logic.
 *
 * Endpoints:
 *   GET  /gis/boundary/:claimId           — parcel boundary polygon + area metrics
 *   GET  /gis/nearby/:claimId             — parcels within ?radius=km (default 1km)
 *   POST /gis/overlap-check              — standalone polygon overlap check against all parcels
 *   GET  /gis/parcels-in-zone/:reliefId  — parcels whose centroid falls inside a relief zone
 *   GET  /gis/stats                       — total parcel coverage, avg size, coverage by status
 */

'use strict';

const express = require('express');
const turf = require('@turf/turf');
const store = require('../store');
const { checkOverlap, safeIntersect } = require('../overlap');
const { optionalAuth } = require('../auth');

module.exports = function createGisRoutes() {
  const router = express.Router();

  // ---------------------------------------------------------------
  // Helper: compute centroid [lon, lat] from a claim document
  // ---------------------------------------------------------------
  function claimCentroid(claim) {
    if (claim.referencePoint && Array.isArray(claim.referencePoint)) {
      return claim.referencePoint; // [lon, lat]
    }
    if (claim.lonE6 != null && claim.latE6 != null) {
      return [claim.lonE6 / 1e6, claim.latE6 / 1e6];
    }
    if (claim.polygon && claim.polygon.coordinates) {
      try {
        const centroid = turf.centroid(turf.feature(claim.polygon));
        return centroid.geometry.coordinates; // [lon, lat]
      } catch (_) { /* fall through */ }
    }
    return null;
  }

  // ---------------------------------------------------------------
  // 1. GET /gis/boundary/:claimId
  // Returns the full boundary polygon geometry + Turf-computed area metrics.
  // ---------------------------------------------------------------
  router.get('/gis/boundary/:claimId', optionalAuth, async (req, res, next) => {
    try {
      const claim = await store.claims.getById(req.params.claimId);
      if (!claim) {
        return res.status(404).json({ error: `Parcel '${req.params.claimId}' not found` });
      }

      if (!claim.polygon || !claim.polygon.coordinates) {
        return res.status(200).json({
          claimId: claim.claimId || claim.landId,
          boundary: null,
          message: 'No polygon geometry recorded for this parcel'
        });
      }

      const feature = turf.feature(claim.polygon);
      const areaM2 = turf.area(feature);
      const areaAcres = areaM2 / 4046.86;
      const centroid = turf.centroid(feature);
      const bbox = turf.bbox(feature);       // [minLon, minLat, maxLon, maxLat]
      const perimeter = turf.length(turf.polygonToLine(feature), { units: 'kilometers' });

      res.json({
        claimId: claim.claimId || claim.landId,
        landId: claim.landId || claim.claimId,
        ownerName: claim.ownerName,
        status: claim.status,
        boundary: {
          type: 'Feature',
          geometry: claim.polygon,
          properties: {
            claimId: claim.claimId || claim.landId,
            ownerName: claim.ownerName,
            status: claim.status,
            surveyNumber: claim.surveyNumber || null
          }
        },
        metrics: {
          areaM2: Math.round(areaM2 * 100) / 100,
          areaAcres: Math.round(areaAcres * 1000) / 1000,
          areaHectares: Math.round((areaM2 / 10000) * 1000) / 1000,
          perimeterKm: Math.round(perimeter * 1000) / 1000,
          centroid: centroid.geometry.coordinates,
          bbox
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 2. GET /gis/nearby/:claimId?radius=1
  // Returns parcels whose centroid falls within `radius` km of this parcel's centroid.
  // Also computes overlap percentage for any that actually intersect the boundary.
  // ---------------------------------------------------------------
  router.get('/gis/nearby/:claimId', optionalAuth, async (req, res, next) => {
    try {
      const claim = await store.claims.getById(req.params.claimId);
      if (!claim) {
        return res.status(404).json({ error: `Parcel '${req.params.claimId}' not found` });
      }

      const radiusKm = Math.min(parseFloat(req.query.radius) || 1.0, 50); // cap at 50 km
      const origin = claimCentroid(claim);

      if (!origin) {
        return res.status(200).json({
          claimId: claim.claimId || claim.landId,
          radiusKm,
          nearby: [],
          message: 'No coordinate data for this parcel'
        });
      }

      const allClaims = await store.claims.getAll();
      const selfId = String(claim.claimId || claim.landId);
      const nearby = [];

      for (const other of allClaims) {
        const otherId = String(other.claimId || other.landId);
        if (otherId === selfId) continue;

        const otherCentroid = claimCentroid(other);
        if (!otherCentroid) continue;

        const distKm = turf.distance(
          turf.point(origin),
          turf.point(otherCentroid),
          { units: 'kilometers' }
        );

        if (distKm <= radiusKm) {
          // Check if they also physically overlap
          let overlapPct = 0;
          let overlapAreaAcres = 0;
          if (claim.polygon && other.polygon) {
            try {
              const intersection = safeIntersect(claim.polygon, other.polygon);
              if (intersection) {
                const overlapM2 = turf.area(intersection);
                const selfAreaM2 = turf.area(turf.feature(claim.polygon));
                overlapPct = selfAreaM2 > 0 ? Math.round((overlapM2 / selfAreaM2) * 1000) / 10 : 0;
                overlapAreaAcres = Math.round((overlapM2 / 4046.86) * 1000) / 1000;
              }
            } catch (_) { /* skip */ }
          }

          nearby.push({
            claimId: otherId,
            landId: other.landId || otherId,
            ownerName: other.ownerName || 'Unknown',
            status: other.status || 'Pending',
            workflowStatus: other.workflowStatus || other.verificationStatus || '',
            distanceKm: Math.round(distKm * 1000) / 1000,
            centroid: otherCentroid,
            parcelAreaAcres: Number(other.parcelAreaAcres || other.confirmedAreaAcres || 0),
            village: other.village || '',
            overlapPct,
            overlapAreaAcres,
            hasOverlap: overlapPct > 0
          });
        }
      }

      // Sort by distance
      nearby.sort((a, b) => a.distanceKm - b.distanceKm);

      res.json({
        claimId: claim.claimId || claim.landId,
        radiusKm,
        originCentroid: origin,
        count: nearby.length,
        nearby
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 3. POST /gis/overlap-check
  // Standalone polygon overlap check against all registered parcels.
  // Body: { polygon: GeoJSON Polygon, excludeClaimId?, thresholdPercent? }
  // ---------------------------------------------------------------
  router.post('/gis/overlap-check', optionalAuth, async (req, res, next) => {
    try {
      const { polygon, excludeClaimId, thresholdPercent } = req.body || {};

      if (!polygon || !polygon.coordinates || !polygon.type) {
        return res.status(400).json({ error: 'Missing required field: polygon (GeoJSON Polygon object)' });
      }

      const allClaims = await store.claims.getAll();
      const result = checkOverlap(polygon, allClaims, {
        excludeClaimId: excludeClaimId || null,
        thresholdPercent: thresholdPercent != null ? Number(thresholdPercent) : undefined
      });

      res.json({
        hasConflict: result.hasConflict,
        candidateAreaM2: result.candidateAreaM2,
        candidateAreaAcres: result.candidateAreaAcres,
        conflictsCount: result.conflictsCount || result.conflicts.length,
        conflicts: result.conflicts,
        message: result.hasConflict
          ? `Polygon overlaps with ${result.conflicts.length} existing parcel(s)`
          : 'No boundary conflicts detected'
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 4. GET /gis/parcels-in-zone/:reliefId
  // Returns all parcels whose centroid falls inside a relief zone polygon.
  // Uses Turf point-in-polygon — same logic as eligibility engine.
  // ---------------------------------------------------------------
  router.get('/gis/parcels-in-zone/:reliefId', optionalAuth, async (req, res, next) => {
    try {
      const relief = await store.reliefs.getById(req.params.reliefId);
      if (!relief) {
        return res.status(404).json({ error: `Relief event '${req.params.reliefId}' not found` });
      }

      if (!relief.zone || !relief.zone.coordinates) {
        return res.status(200).json({
          reliefId: req.params.reliefId,
          inZone: [],
          message: 'Relief event has no zone polygon defined'
        });
      }

      const zoneFeature = turf.feature(relief.zone);
      const allClaims = await store.claims.getAll();
      const inZone = [];

      for (const claim of allClaims) {
        const centroid = claimCentroid(claim);
        if (!centroid) continue;

        const pt = turf.point(centroid);
        try {
          if (turf.booleanPointInPolygon(pt, zoneFeature)) {
            inZone.push({
              claimId: claim.claimId || claim.landId,
              landId: claim.landId || claim.claimId,
              ownerName: claim.ownerName,
              status: claim.status || 'Pending',
              workflowStatus: claim.workflowStatus || claim.verificationStatus || '',
              score: claim.score || 0,
              centroid,
              parcelAreaAcres: Number(claim.parcelAreaAcres || claim.confirmedAreaAcres || 0),
              village: claim.village || '',
              hasDispute: !!(claim.dispute && claim.dispute.isDisputed)
            });
          }
        } catch (_) { /* skip malformed */ }
      }

      res.json({
        reliefId: req.params.reliefId,
        reliefName: relief.name || relief.reliefId,
        count: inZone.length,
        inZone
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // 5. GET /gis/stats
  // System-wide GIS statistics: coverage, average size, parcel density.
  // ---------------------------------------------------------------
  router.get('/gis/stats', optionalAuth, async (req, res, next) => {
    try {
      const allClaims = await store.claims.getAll();
      let totalAreaM2 = 0;
      let validPolygons = 0;
      const statusAreas = {};

      for (const c of allClaims) {
        const acres = Number(c.parcelAreaAcres || c.confirmedAreaAcres || 0);
        const m2 = acres * 4046.86;
        totalAreaM2 += m2;

        const s = c.status || 'Unknown';
        statusAreas[s] = (statusAreas[s] || 0) + acres;

        if (c.polygon && c.polygon.coordinates) validPolygons++;
      }

      const totalAcres = totalAreaM2 / 4046.86;
      const avgAcres = allClaims.length > 0 ? totalAcres / allClaims.length : 0;

      res.json({
        totalParcels: allClaims.length,
        parcelsWithPolygon: validPolygons,
        totalCoverage: {
          acres: Math.round(totalAcres * 100) / 100,
          hectares: Math.round((totalAreaM2 / 10000) * 100) / 100,
          sqm: Math.round(totalAreaM2 * 100) / 100
        },
        averageParcelSize: {
          acres: Math.round(avgAcres * 1000) / 1000,
          hectares: Math.round((avgAcres * 0.404686) * 1000) / 1000
        },
        coverageByStatus: Object.fromEntries(
          Object.entries(statusAreas).map(([k, v]) => [k, Math.round(v * 100) / 100])
        )
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
