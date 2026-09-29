const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'harmony-bms-auth-secret-key-production-2026';
const PEPPER = process.env.PEPPER || 'harmony-bms-national-id-pepper-secret-2026';

// Rate limiting in-memory store: lookupHash -> { count: number, firstAttemptAt: number }
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

function checkRateLimit(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { blocked: false };
  if (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { blocked: false };
  }
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfter = Math.ceil((record.firstAttemptAt + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { blocked: true, retryAfter };
  }
  return { blocked: false };
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS)) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

function clearFailedAttempts(key) {
  loginAttempts.delete(key);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Middleware: requireRole("citizen") for all citizen-only endpoints.
 */
function requireRole(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== requiredRole) {
        return res.status(403).json({ error: `Forbidden: requires ${requiredRole} role` });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * POST /api/auth/signup
 * Body: { name, password, nationalIdCode }
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, password, nationalIdCode } = req.body || {};

    // 1. Validation: name 2–80 chars
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }

    // 2. Validation: password >= 10 chars
    if (!password || typeof password !== 'string' || password.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters long.' });
    }

    // 3. Validation: nationalIdCode format checked
    if (!nationalIdCode || typeof nationalIdCode !== 'string' || nationalIdCode.trim().length < 4 || !/^[A-Za-z0-9_-]{4,40}$/.test(nationalIdCode.trim())) {
      return res.status(400).json({ error: 'Invalid nationalIdCode format. Must be 4-40 alphanumeric characters.' });
    }

    const cleanNationalId = nationalIdCode.trim();

    // 4. Look up Mongo users collection by sha256(nationalIdCode + PEPPER)
    const lookupHash = sha256(cleanNationalId + PEPPER);
    const existing = await User.findByLookupHash(lookupHash);

    // 5. If found -> return 409
    if (existing) {
      return res.status(409).json({ error: 'Account already exists. Please log in.' });
    }

    // 6. Generate a per-user random 32-byte salt
    // Store salt_id + salt in a separate collection owner_salts (do not inline salt into the user doc)
    const saltBytes = crypto.randomBytes(32);
    const salt = saltBytes.toString('hex');
    const salt_id = 'salt_' + crypto.randomUUID();
    await User.saveSalt(salt_id, salt);

    // 7. passwordHash = argon2id(password) — never log password, never send to chain
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    // 8. nationalIdHash = sha256(nationalIdCode + salt) — becomes ownerHash on-chain later
    const nationalIdHash = sha256(cleanNationalId + salt);

    // 9. Insert Mongo doc: { userId, name, passwordHash, nationalIdHash, salt_id, role, createdAt }
    const assignedRole = (req.body.role === 'government' || req.body.role === 'GOVERNMENT') ? 'government' : 'citizen';
    const userId = 'usr_' + crypto.randomUUID();
    await User.create({
      userId,
      name: name.trim(),
      passwordHash,
      nationalIdHash,
      salt_id,
      lookupHash,
      role: assignedRole,
      createdAt: new Date()
    });

    // 10. Audit log: { action: "USER_SIGNUP", userId, role, at } — zero PII
    await User.recordSignupAudit(userId, assignedRole);

    // 11. Issue JWT: { userId, role, signer }
    const token = jwt.sign(
      { userId, role: assignedRole, signer: assignedRole === 'government' ? (process.env.OFFICER1_KEY || 'officer') : null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 12. Return { jwt, userId, role } with status 200
    return res.status(200).json({
      jwt: token,
      userId,
      role: assignedRole
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

/**
 * POST /api/auth/login
 * Body: { nationalIdCode, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { name, username, nationalIdCode, password } = req.body || {};

    const identifier = name || username || nationalIdCode;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ error: 'Name and password are required. Name cannot be null.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const cleanIdentifier = String(identifier).trim();
    const rateLimitKey = sha256(cleanIdentifier.toLowerCase() + PEPPER);

    // Rate-limit check: 5 failed attempts per user identifier per 15 min
    const rl = checkRateLimit(rateLimitKey);
    if (rl.blocked) {
      return res.status(429).json({
        error: 'Too many attempts. Try again later.',
        retryAfter: rl.retryAfter
      });
    }

    // Look up by name first, or fallback to sha256(nationalIdCode + PEPPER)
    let user = await User.findByName(cleanIdentifier);
    if (!user) {
      const lookupHash = sha256(cleanIdentifier + PEPPER);
      user = await User.findByLookupHash(lookupHash);
    }

    // If not found → return 401 { error: "Invalid credentials." } (never say "user not found")
    if (!user) {
      recordFailedAttempt(rateLimitKey);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Verify password with argon2
    let isPasswordValid = false;
    try {
      isPasswordValid = await argon2.verify(user.passwordHash, String(password));
    } catch {
      isPasswordValid = false;
    }

    // If wrong → return 401 { error: "Invalid credentials." } (same message as above — no user-enumeration leak)
    if (!isPasswordValid) {
      recordFailedAttempt(rateLimitKey);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // On success: clear failed attempts
    clearFailedAttempts(rateLimitKey);

    // Issue JWT
    const token = jwt.sign(
      { userId: user.userId, role: user.role || 'citizen', signer: user.role === 'government' ? (process.env.OFFICER1_KEY || 'officer') : null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      jwt: token,
      userId: user.userId,
      role: user.role || 'citizen',
      name: user.name
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Test helpers
router._resetRateLimits = () => {
  loginAttempts.clear();
};
router.requireRole = requireRole;

module.exports = router;
