/**
 * Validation utilities and Express middlewares.
 * Any validation failure returns HTTP 400 with { "error": "..." } format.
 */

const VALID_CLAIM_STATUSES = ['Pending', 'Verified', 'Disputed'];
const VALID_PAYOUT_STATUSES = ['None', 'Assessed', 'Approved', 'Paid'];
const VALID_ATTESTER_ROLES = ['Neighbor', 'Village Leader', 'Accredited NGO', 'NGO', 'NGO/Community Verifier'];

/**
 * Checks if a value is a valid wei string (non-negative integer in string form).
 * e.g. "1000000000000000000"
 */
function isWeiString(val) {
  if (typeof val !== 'string' || val.trim() === '') return false;
  return /^\d+$/.test(val.trim());
}

/**
 * Validates GeoJSON Polygon structure:
 * {
 *   type: "Polygon",
 *   coordinates: [[[lon, lat], [lon, lat], ...]]
 * }
 */
function isValidGeoJSONPolygon(geo) {
  if (!geo || typeof geo !== 'object') return false;
  if (geo.type !== 'Polygon') return false;
  if (!Array.isArray(geo.coordinates) || geo.coordinates.length === 0) return false;

  const outerRing = geo.coordinates[0];
  if (!Array.isArray(outerRing) || outerRing.length < 4) return false;

  for (const pt of outerRing) {
    if (!Array.isArray(pt) || pt.length < 2) return false;
    const [lon, lat] = pt;
    if (typeof lon !== 'number' || typeof lat !== 'number') return false;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
  }

  // Check closure: first coordinate must match last coordinate
  const first = outerRing[0];
  const last = outerRing[outerRing.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return false;
  }

  return true;
}

/**
 * Middleware factory to require specific fields on req.body.
 * Returns 400 if any field is missing or empty.
 */
function requireFields(fields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    for (const field of fields) {
      const val = req.body[field];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    next();
  };
}

/**
 * Middleware validating POST /claims input
 */
function validateClaimInput(req, res, next) {
  const { ownerName, nationalId, polygon } = req.body;

  if (!ownerName && !nationalId) {
    return res.status(400).json({ error: 'Either ownerName or nationalId must be provided' });
  }

  if (!polygon) {
    return res.status(400).json({ error: 'Missing required field: polygon' });
  }

  let parsedPolygon = polygon;
  if (typeof polygon === 'string') {
    try {
      parsedPolygon = JSON.parse(polygon);
      req.body.polygon = parsedPolygon;
    } catch {
      return res.status(400).json({ error: 'polygon must be a valid GeoJSON object or JSON string' });
    }
  }

  if (!isValidGeoJSONPolygon(parsedPolygon)) {
    return res.status(400).json({
      error: 'Invalid polygon format. Must be GeoJSON Polygon with [lon, lat] coordinates closed loop (first and last coordinate match).'
    });
  }

  next();
}

/**
 * Middleware validating POST /claims/:id/attest input
 */
function validateAttestInput(req, res, next) {
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ error: 'Missing required field: role' });
  }

  if (!VALID_ATTESTER_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Invalid role '${role}'. Must be one of: ${VALID_ATTESTER_ROLES.join(', ')}`
    });
  }

  next();
}

/**
 * Middleware validating POST /claims/:id/dispute input
 */
function validateDisputeInput(req, res, next) {
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'Missing or empty required field: reason' });
  }

  next();
}

/**
 * Middleware validating POST /claims/:id/resolve input
 */
function validateResolveInput(req, res, next) {
  const { restore } = req.body;

  if (typeof restore !== 'boolean') {
    return res.status(400).json({ error: 'Field "restore" is required and must be a boolean (true/false)' });
  }

  next();
}

/**
 * Middleware validating POST /reliefs input
 */
function validateReliefInput(req, res, next) {
  const { name, zone, ratePerAcre, maxPerClaim, budget, disasterType } = req.body;

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }

  if (!zone) {
    return res.status(400).json({ error: 'Missing required field: zone' });
  }

  let parsedZone = zone;
  if (typeof zone === 'string') {
    try {
      parsedZone = JSON.parse(zone);
      req.body.zone = parsedZone;
    } catch {
      return res.status(400).json({ error: 'zone must be a valid GeoJSON object or JSON string' });
    }
  }

  if (!isValidGeoJSONPolygon(parsedZone)) {
    return res.status(400).json({
      error: 'Invalid zone format. Must be GeoJSON Polygon with [lon, lat] coordinates closed loop.'
    });
  }

  if (disasterType !== undefined && (typeof disasterType !== 'string' || disasterType.trim() === '')) {
    return res.status(400).json({ error: 'disasterType must be a non-empty string' });
  }

  if (ratePerAcre !== undefined && !isWeiString(ratePerAcre)) {
    return res.status(400).json({ error: 'ratePerAcre must be a valid wei string of digits' });
  }

  if (maxPerClaim !== undefined && !isWeiString(maxPerClaim)) {
    return res.status(400).json({ error: 'maxPerClaim must be a valid wei string of digits' });
  }

  if (budget !== undefined && !isWeiString(budget)) {
    return res.status(400).json({ error: 'budget must be a valid wei string of digits' });
  }

  next();
}

/**
 * Middleware validating POST /claims/:id/assess input
 * Accepts either answers object or damageLevel
 */
function validateAssessInput(req, res, next) {
  const { reliefId, damageLevel, answers } = req.body;

  if (!reliefId) {
    return res.status(400).json({ error: 'Missing required field: reliefId' });
  }

  if ((damageLevel === undefined || damageLevel === null) && (!answers || typeof answers !== 'object')) {
    return res.status(400).json({ error: 'Must provide either answers criteria object or damageLevel' });
  }

  if (damageLevel !== undefined && damageLevel !== null) {
    const num = Number(damageLevel);
    if (isNaN(num) || num < 1 || num > 5) {
      return res.status(400).json({ error: 'damageLevel must be an integer between 1 and 5' });
    }
  }

  next();
}

/**
 * Middleware validating POST /claims/:id/approve-payout input
 * Explicit requirement: body { reliefId, officer }
 */
function validateApprovePayoutInput(req, res, next) {
  const { reliefId, officer } = req.body;

  if (!reliefId) {
    return res.status(400).json({ error: 'Missing required field: reliefId' });
  }

  if (!officer || typeof officer !== 'string' || officer.trim() === '') {
    return res.status(400).json({ error: 'Missing or empty required field: officer' });
  }

  next();
}

/**
 * Middleware validating POST /claims/:id/release-payout input
 */
function validateReleasePayoutInput(req, res, next) {
  const { reliefId } = req.body;

  if (!reliefId) {
    return res.status(400).json({ error: 'Missing required field: reliefId' });
  }

  next();
}

module.exports = {
  VALID_CLAIM_STATUSES,
  VALID_PAYOUT_STATUSES,
  VALID_ATTESTER_ROLES,
  isWeiString,
  isValidGeoJSONPolygon,
  requireFields,
  validateClaimInput,
  validateAttestInput,
  validateDisputeInput,
  validateResolveInput,
  validateReliefInput,
  validateAssessInput,
  validateApprovePayoutInput,
  validateReleasePayoutInput
};
