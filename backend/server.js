const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { connectDB } = require('./db');
const createClaimsRoutes = require('./routes/claimsRoutes');
const citizenAuthRoutes = require('./routes/auth');
const authRoutes = require('./routes/authRoutes');
const createDocumentRoutes = require('./routes/documentRoutes');
const createVerificationRoutes = require('./routes/verificationRoutes');
const createDashboardRoutes = require('./routes/dashboardRoutes');
const createLandClassificationRoutes = require('./routes/landClassificationRoutes');
const createGisRoutes = require('./routes/gisRoutes');
const createValuationRoutes = require('./routes/valuationRoutes');
const createDisputesRoutes = require('./routes/disputesRoutes');
const createDisasterRoutes = require('./routes/disasterRoutes');
const createReliefExpandedRoutes = require('./routes/reliefExpandedRoutes');
const reportRoutes = require('./routes/reportRoutes');
const qrRoutes = require('./routes/qrRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage setup for handling multipart file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '.jpg');
    const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware configuration
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// Base status / health route
app.get('/', (req, res) => {
  res.json({
    project: 'Team Harmony - Post-Disaster Land Rights & Relief',
    version: '1.0.0',
    status: 'online',
    endpoints: 14
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Mount authentication routes
app.use('/auth', citizenAuthRoutes);
app.use('/api/auth', citizenAuthRoutes);
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

// Mount document routes
app.use('/documents', createDocumentRoutes(upload));
app.use('/api/documents', createDocumentRoutes(upload));

// Mount Phase C verification and audit routes
const verificationRouter = createVerificationRoutes(upload);
app.use('/', verificationRouter);
app.use('/api', verificationRouter);

// Mount Phase D dashboard, stats, and search routes (BEFORE claims to avoid :id wildcard collision)
const dashboardRouter = createDashboardRoutes();
app.use('/', dashboardRouter);
app.use('/api', dashboardRouter);

// Mount Phase D — Land Classification, GIS, Valuation, Disputes
const landClassificationRouter = createLandClassificationRoutes();
app.use('/', landClassificationRouter);
app.use('/api', landClassificationRouter);

const gisRouter = createGisRoutes();
app.use('/', gisRouter);
app.use('/api', gisRouter);

const valuationRouter = createValuationRoutes();
app.use('/', valuationRouter);
app.use('/api', valuationRouter);

const disputesRouter = createDisputesRoutes();
app.use('/', disputesRouter);
app.use('/api', disputesRouter);

// Mount Phase E — Disasters & Expanded Relief
const disasterRouter = createDisasterRoutes(upload);
app.use('/', disasterRouter);
app.use('/api', disasterRouter);

const reliefExpandedRouter = createReliefExpandedRoutes();
app.use('/', reliefExpandedRouter);
app.use('/api', reliefExpandedRouter);

// Mount Phase F — Reports, QR, Notifications
app.use('/reports', reportRoutes);
app.use('/api/reports', reportRoutes);

app.use('/qr', qrRoutes);
app.use('/api/qr', qrRoutes);

app.use('/notifications', notificationRoutes);
app.use('/api/notifications', notificationRoutes);

// Mount claims and relief routes
const claimsRouter = createClaimsRoutes(upload);
app.use('/', claimsRouter);
app.use('/api', claimsRouter);

// Central error handler - ALWAYS returning { "error": "..." }
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.status || err.statusCode || (err.name === 'ValidationError' || err.name === 'MulterError' ? 400 : 500);
  res.status(statusCode).json({
    error: err.message || 'Internal server error'
  });
});

async function seedDefaultOfficer() {
  try {
    const crypto = require('crypto');
    const argon2 = require('argon2');
    const User = require('./models/User');
    const PEPPER = process.env.PEPPER || 'harmony-bms-national-id-pepper-secret-2026';

    const officerBadge = 'GOV-OFFICER-001';
    const lookupHash = crypto.createHash('sha256').update(officerBadge + PEPPER).digest('hex');
    const existing = await User.findByLookupHash(lookupHash);
    if (!existing) {
      const saltBytes = crypto.randomBytes(32);
      const salt = saltBytes.toString('hex');
      const salt_id = 'salt_' + crypto.randomUUID();
      await User.saveSalt(salt_id, salt);
      const passwordHash = await argon2.hash('Password@1234', { type: argon2.argon2id });
      const nationalIdHash = crypto.createHash('sha256').update(officerBadge + salt).digest('hex');
      await User.create({
        userId: 'usr_gov_officer_default',
        name: 'Officer Sharma',
        passwordHash,
        nationalIdHash,
        salt_id,
        lookupHash,
        role: 'government',
        createdAt: new Date()
      });
      console.log('[Auth Seed] Default government official registered: GOV-OFFICER-001 (Password: Password@1234)');
    }
  } catch (err) {
    console.warn('[Auth Seed] Notice during default officer seed:', err.message);
  }
}

// Start server
let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, async () => {
    console.log(`[Server] Harmony BMS Backend running on port ${PORT}`);
    console.log(`[Server] Environment: PORT=${PORT}`);
    // Attempt database connection on startup
    await connectDB();
    // await seedDefaultOfficer();
  });
}

module.exports = {
  app,
  server,
  upload
};
