const crypto = require('crypto');

/**
 * Computes SHA-256 hash of a string, Buffer, or object.
 * Returns a 0x-prefixed 64-hex-character string (compatible with Solidity bytes32).
 * 
 * @param {string|Buffer|object} data - Input data to hash
 * @returns {string} 0x-prefixed SHA-256 hex string
 */
function sha256(data) {
  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === 'object' && data !== null) {
    buffer = Buffer.from(JSON.stringify(data));
  } else {
    buffer = Buffer.from(String(data), 'utf8');
  }

  const hex = crypto.createHash('sha256').update(buffer).digest('hex');
  return `0x${hex}`;
}

/**
 * Computes plain SHA-256 hex string (without 0x prefix).
 * 
 * @param {string|Buffer|object} data - Input data to hash
 * @returns {string} 64-character hex string
 */
function sha256Hex(data) {
  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === 'object' && data !== null) {
    buffer = Buffer.from(JSON.stringify(data));
  } else {
    buffer = Buffer.from(String(data), 'utf8');
  }

  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes ownerHash = SHA-256(NationalID + Salt).
 * 
 * @param {string} nationalId - Government / National ID
 * @param {string} [salt=''] - Optional salt string
 * @returns {string} 0x-prefixed SHA-256 hash
 */
function hashOwner(nationalId, salt = 'harmony-bms-salt-2026') {
  return sha256(`${nationalId}:${salt}`);
}

/**
 * Computes evidenceHash = SHA-256(Photos + GeoJSON + Witnesses).
 * 
 * @param {object} evidence - Evidence object containing photos, polygon, witnesses
 * @returns {string} 0x-prefixed SHA-256 hash
 */
function hashEvidence(evidence) {
  return sha256(evidence);
}

/**
 * Generates a realistic mock transaction hash (0x + 64 hex characters).
 * 
 * @returns {string} Mock transaction hash
 */
function generateTxHash() {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}

module.exports = {
  sha256,
  sha256Hex,
  hashOwner,
  hashEvidence,
  generateTxHash
};
