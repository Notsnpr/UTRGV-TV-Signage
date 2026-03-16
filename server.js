const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const db = require('./lib/database'); // triggers schema init on require

const authRoutes      = require('./routes/auth');
const usersRoutes     = require('./routes/users');
const playlistsRoutes = require('./routes/playlists');
const itemsRoutes     = require('./routes/items');
const devicesRoutes   = require('./routes/devices');
const schedulesRoutes = require('./routes/schedules');
const emergencyRoutes = require('./routes/emergency');
const mediaRoutes     = require('./routes/media');
const overlaysRoutes  = require('./routes/overlays');
const widgetsRoutes   = require('./routes/widgets');
const analyticsRoutes = require('./routes/analytics');
const auditRoutes     = require('./routes/audit');
const settingsRoutes  = require('./routes/settings');
const publicRoutes    = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
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

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/auth',         authRoutes);
app.use('/api/admin/users',  usersRoutes);
app.use('/api/playlists',    playlistsRoutes);
app.use('/api/items',        itemsRoutes);
app.use('/api/devices',      devicesRoutes);
app.use('/api/schedules',    schedulesRoutes);
app.use('/api/emergency',    emergencyRoutes);
app.use('/api/media',        mediaRoutes);
app.use('/api/overlays',     overlaysRoutes);
app.use('/api/widgets',      widgetsRoutes);
app.use('/api/analytics',    analyticsRoutes);
app.use('/api/audit-logs',   auditRoutes);
app.use('/api/settings',     settingsRoutes);
app.use('/api/public',       publicRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`UTRGV TV Signage: http://localhost:${PORT}`);
});

module.exports = app;
