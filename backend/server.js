const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { connectDB } = require('./db');
const createClaimsRoutes = require('./routes/claimsRoutes');

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

// Mount claims and relief routes
app.use('/', createClaimsRoutes(upload));

// Central error handler - ALWAYS returning { "error": "..." }
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.status || err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  res.status(statusCode).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, async () => {
    console.log(`[Server] Harmony BMS Backend running on port ${PORT}`);
    console.log(`[Server] Environment: PORT=${PORT}`);
    // Attempt database connection on startup
    await connectDB();
  });
}

module.exports = {
  app,
  server,
  upload
};
