const crypto = require('crypto');

// 32-byte key for AES-256-GCM encryption at rest
const DEFAULT_KEY_SEED = 'harmony_bms_production_ocr_master_encryption_key_2026';
const ENC_KEY = crypto.createHash('sha256').update(process.env.OCR_ENC_KEY || DEFAULT_KEY_SEED).digest();

/**
 * Encrypts sensitive OCR text using AES-256-GCM
 * @param {string} plaintext
 * @returns {string} Encrypted bundle in format: iv:authTag:ciphertext (hex)
 */
function encryptOcrText(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts AES-256-GCM encrypted OCR bundle
 * @param {string} bundle - iv:authTag:ciphertext
 * @returns {string|null}
 */
function decryptOcrText(bundle) {
  if (!bundle || typeof bundle !== 'string') return null;
  const parts = bundle.split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[OCR Crypto] Failed to decrypt OCR text:', err.message);
    return null;
  }
}

/**
 * Generates tamper-proof HMAC-SHA256 signature for OCR text
 * Per spec: HMAC-SHA256(text, server secret), not plain SHA-256
 * @param {string} text
 * @returns {string}
 */
function computeOcrHmac(text) {
  if (!text) return null;
  return crypto.createHmac('sha256', ENC_KEY).update(text, 'utf8').digest('hex');
}

module.exports = {
  encryptOcrText,
  decryptOcrText,
  computeOcrHmac
};
