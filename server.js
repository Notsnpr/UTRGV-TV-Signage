require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const db = require('./lib/database'); // triggers schema init on require

const authRoutes  = require('./routes/auth');
const usersRoutes = require('./routes/users');
const tvsRoutes   = require('./routes/tvs');
const mediaRoutes = require('./routes/media');
const publicRoutes = require('./routes/public');
const auditRoutes = require('./routes/audit');
const emergencyRoutes = require('./routes/emergency');
const settingsRoutes  = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// Uploads directory
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, suffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(null, ok);
  }
});
app.locals.upload = upload; // routes access via req.app.locals.upload

app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/auth',        authRoutes);
app.use('/api/admin/users', usersRoutes);
app.use('/api/tvs',         tvsRoutes);
app.use('/api/media',       mediaRoutes);
app.use('/api/public',      publicRoutes);
app.use('/api/audit-logs',  auditRoutes);
app.use('/api/emergency',   emergencyRoutes);
app.use('/api/settings',   settingsRoutes);

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`UTRGV TV Signage: http://localhost:${PORT}`));
}

module.exports = app;
