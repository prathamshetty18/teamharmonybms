const turf = require('@turf/turf');

/**
 * Default threshold: any overlap > 0.5% of either parcel area is flagged as a conflict.
 * This prevents micro-overlaps due to floating point coordinates or touching shared boundary edges.
 */
const DEFAULT_OVERLAP_THRESHOLD_PERCENT = 0.5;

/**
 * Safely computes intersection between two polygons across Turf versions.
 * 
 * @param {object} polyA - GeoJSON Polygon or Feature
 * @param {object} polyB - GeoJSON Polygon or Feature
 * @returns {object|null} GeoJSON Polygon/MultiPolygon or null
 */
function safeIntersect(polyA, polyB) {
  if (!polyA || !polyB) return null;
  const fA = polyA.type === 'Feature' ? polyA : turf.feature(polyA);
  const fB = polyB.type === 'Feature' ? polyB : turf.feature(polyB);

  try {
    return turf.intersect(turf.featureCollection([fA, fB]));
  } catch {
    try {
      return turf.intersect(fA, fB);
    } catch {
      return null;
    }
  }
}

/**
 * Checks a candidate polygon against an array of existing claims for geospatial overlaps.
 * 
 * @param {object} candidatePolygon - GeoJSON Polygon of the candidate claim
 * @param {Array<object>} existingClaims - Array of existing claim documents
 * @param {object} [options]
 * @param {number} [options.thresholdPercent=0.5] - Min overlap percentage to flag conflict
 * @param {string} [options.excludeClaimId] - Optional claimId to ignore (e.g. when updating self)
 * @returns {object} Overlap analysis result
 */
function checkOverlap(candidatePolygon, existingClaims = [], options = {}) {
  const threshold = options.thresholdPercent != null 
    ? options.thresholdPercent 
    : DEFAULT_OVERLAP_THRESHOLD_PERCENT;

  const excludeClaimId = options.excludeClaimId ? String(options.excludeClaimId) : null;

  if (!candidatePolygon || !candidatePolygon.coordinates || !candidatePolygon.coordinates[0]) {
    return {
      hasConflict: false,
      candidateAreaM2: 0,
      candidateAreaAcres: 0,
      conflicts: []
    };
  }

  const candidateFeature = candidatePolygon.type === 'Feature' 
    ? candidatePolygon 
    : turf.feature(candidatePolygon);

  const candidateAreaM2 = turf.area(candidateFeature);
  const candidateAreaAcres = candidateAreaM2 / 4046.86;

  if (candidateAreaM2 <= 0) {
    return {
      hasConflict: false,
      candidateAreaM2: 0,
      candidateAreaAcres: 0,
      conflicts: []
    };
  }

  const conflicts = [];

  for (const existing of existingClaims) {
    if (!existing || !existing.polygon) continue;
    if (excludeClaimId && String(existing.claimId) === excludeClaimId) continue;

    const existingFeature = existing.polygon.type === 'Feature'
      ? existing.polygon
      : turf.feature(existing.polygon);

    const existingAreaM2 = turf.area(existingFeature);
    if (existingAreaM2 <= 0) continue;

    const intersection = safeIntersect(candidateFeature, existingFeature);
    if (!intersection) continue;

    const overlapAreaM2 = turf.area(intersection);
    if (overlapAreaM2 <= 0) continue;

    const candidateOverlapPercent = (overlapAreaM2 / candidateAreaM2) * 100;
    const existingOverlapPercent = (overlapAreaM2 / existingAreaM2) * 100;

    // If overlap exceeds threshold in either candidate or existing polygon
    if (candidateOverlapPercent >= threshold || existingOverlapPercent >= threshold) {
      const candPct = Math.round(candidateOverlapPercent * 10) / 10;
      const existPct = Math.round(existingOverlapPercent * 10) / 10;
      const acres = Math.round((overlapAreaM2 / 4046.86) * 1000) / 1000;
      const m2 = Math.round(overlapAreaM2 * 100) / 100;

      conflicts.push({
        claimId: String(existing.claimId),
        ownerName: existing.ownerName || 'Unknown Owner',
        status: existing.status || 'Pending',
        overlapAreaM2: m2,
        overlapAreaAcres: acres,
        candidateOverlapPercent: candPct,
        existingOverlapPercent: existPct,
        overlapPercent: candPct,
        reason: `Boundary overlap of ${candPct}% (${acres} acres) with Parcel #${existing.claimId} (${existing.ownerName || 'Unknown'})`,
        notes: `Geospatial collision detected by Turf.js boundary intersection against existing claim #${existing.claimId}`,
        overlappingPolygon: intersection.geometry || intersection
      });
    }
  }

  // Sort conflicts by overlap area descending
  conflicts.sort((a, b) => b.overlapAreaM2 - a.overlapAreaM2);

  return {
    hasConflict: conflicts.length > 0,
    candidateAreaM2: Math.round(candidateAreaM2 * 100) / 100,
    candidateAreaAcres: Math.round(candidateAreaAcres * 1000) / 1000,
    conflictsCount: conflicts.length,
    conflicts
  };
}

/**
 * Phase 3 requirement:
 * findOverlaps(newPolygon, existingClaims) -> [conflicts]
 * Checks boundary/polygon intersection against existing claims.
 * 
 * @param {object} newPolygon - Candidate GeoJSON polygon
 * @param {Array<object>} existingClaims - Array of existing claim documents
 * @param {object} [options] - Options (thresholdPercent, excludeClaimId)
 * @returns {Array<object>} Array of conflicts
 */
function findOverlaps(newPolygon, existingClaims = [], options = {}) {
  const result = checkOverlap(newPolygon, existingClaims, options);
  return result.conflicts;
}

/**
 * Creates dispute record from conflict analysis.
 * 
 * @param {object|Array<object>} overlapResultOrConflicts - Result from checkOverlap or array of conflicts
 * @param {string} [disputerAddress] - Address initiating the dispute flag
 * @returns {object|null}
 */
function createDisputeFromOverlap(overlapResultOrConflicts, disputerAddress = '0x0000000000000000000000000000000000000000') {
  const conflicts = Array.isArray(overlapResultOrConflicts)
    ? overlapResultOrConflicts
    : (overlapResultOrConflicts && overlapResultOrConflicts.conflicts ? overlapResultOrConflicts.conflicts : []);

  if (conflicts.length === 0) {
    return null;
  }

  const primary = conflicts[0];
  const allConflictingIds = conflicts.map(c => `#${c.claimId}`).join(', ');
  const reason = `Geospatial boundary conflict: overlaps registered Parcel #${primary.claimId} (${primary.ownerName}) by ${primary.candidateOverlapPercent}%`;
  const notes = `Automated dispute flagged during POST /claims submission. Overlaps detected with existing claim(s): ${allConflictingIds}. Immediate freeze placed on payouts pending human boundary arbitration.`;

  return {
    isDisputed: true,
    reason,
    notes,
    disputerAddress,
    disputerName: 'Automated Geospatial Overlap Engine',
    overlappingClaimId: primary.claimId,
    conflicts,
    conflictingClaimIds: conflicts.map(c => c.claimId),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_OVERLAP_THRESHOLD_PERCENT,
  safeIntersect,
  checkOverlap,
  findOverlaps,
  createDisputeFromOverlap
};
