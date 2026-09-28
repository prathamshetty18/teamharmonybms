const express = require('express');
const store = require('../store');
const {
  ROLES,
  ALLOWED_ROLES,
  normalizeRole,
  hashPassword,
  comparePassword,
  generateToken,
  sanitizeUser,
  sendMockOtp,
  verifyMockOtp,
  requireAuth,
  requireRole
} = require('../auth');

const router = express.Router();

// -------------------------------------------------------------
// 1. GET /auth/roles - Returns allowed roles in system
// -------------------------------------------------------------
router.get('/roles', (req, res) => {
  res.json({
    roles: ALLOWED_ROLES
  });
});

// -------------------------------------------------------------
// 2. POST /auth/register - Register new user with one of 4 roles
// -------------------------------------------------------------
async function handleRegister(req, res, next) {
  try {
    const { name, contact, password, role, profile = {} } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return res.status(400).json({ error: 'Contact (phone or email) is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      return res.status(400).json({
        error: `Invalid role '${role}'. Allowed roles: ${ALLOWED_ROLES.join(', ')}`
      });
    }

    const trimmedContact = contact.trim();
    const existing = await store.users.findByContact(trimmedContact);
    if (existing) {
      return res.status(400).json({ error: 'User with this contact already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newUser = {
      id: userId,
      name: name.trim(),
      contact: trimmedContact,
      role: normalizedRole,
      password: hashedPassword,
      profile: typeof profile === 'object' && profile !== null ? profile : {}
    };

    const saved = await store.users.save(newUser);
    const safeUser = sanitizeUser(saved);
    const token = generateToken(safeUser);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
}

router.post('/register', handleRegister);
router.post('/signup', handleRegister);

// -------------------------------------------------------------
// 3. POST /auth/login - Authenticate existing user by contact & password
// -------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { contact, password } = req.body;

    if (!contact || !password) {
      return res.status(400).json({ error: 'Contact and password are required' });
    }

    const trimmedContact = String(contact).trim();
    const user = await store.users.findByContact(trimmedContact);
    if (!user) {
      return res.status(401).json({ error: 'Invalid contact or password' });
    }

    const passwordMatch = await comparePassword(String(password), user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid contact or password' });
    }

    const safeUser = sanitizeUser(user);
    const token = generateToken(safeUser);

    res.json({
      message: 'Login successful',
      token,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// 4. POST /auth/otp/send - Mock OTP dispatch stub for demo
// -------------------------------------------------------------
router.post('/otp/send', async (req, res, next) => {
  try {
    const { contact } = req.body;
    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return res.status(400).json({ error: 'Contact number is required' });
    }

    const result = sendMockOtp(contact.trim());
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// 5. POST /auth/otp/verify - Mock OTP verification and fast login
// -------------------------------------------------------------
router.post('/otp/verify', async (req, res, next) => {
  try {
    const { contact, otp, role, name, profile = {} } = req.body;

    if (!contact || !otp) {
      return res.status(400).json({ error: 'Contact and OTP are required' });
    }

    const isValid = verifyMockOtp(contact, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const trimmedContact = String(contact).trim();
    let user = await store.users.findByContact(trimmedContact);

    // If user does not exist yet, provision an on-the-fly profile for demo convenience
    if (!user) {
      const normalizedRole = normalizeRole(role) || ROLES.FARMER;
      const defaultName = name && typeof name === 'string' && name.trim()
        ? name.trim()
        : `Verified User (${trimmedContact.slice(-4)})`;

      const dummyHashed = await hashPassword('password123');
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      user = await store.users.save({
        id: userId,
        name: defaultName,
        contact: trimmedContact,
        role: normalizedRole,
        password: dummyHashed,
        profile: typeof profile === 'object' && profile !== null ? profile : {}
      });
    }

    const safeUser = sanitizeUser(user);
    const token = generateToken(safeUser);

    res.json({
      message: 'OTP verified successfully',
      token,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// 6. GET /auth/me - Retrieve currently authenticated user profile
// -------------------------------------------------------------
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user
  });
});

// -------------------------------------------------------------
// 7. GET /auth/users - List users (Protected for Government Officers)
// -------------------------------------------------------------
router.get('/users', requireRole(ROLES.GOVERNMENT_OFFICER), async (req, res, next) => {
  try {
    const allUsers = await store.users.getAll();
    res.json({
      users: allUsers.map(sanitizeUser)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
