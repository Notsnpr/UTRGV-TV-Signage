const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/database');
const { errorResponse, logAudit, getClientIp } = require('../lib/helpers');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Email and password are required');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return errorResponse(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  req.session.userId = user.id;
  req.session.save(err => {
    if (err) return errorResponse(res, 500, 'INTERNAL_ERROR', 'Session error');
    logAudit(user.id, 'login', 'user', user.id, null, getClientIp(req));
    res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = db.prepare('SELECT id, username, email, role, createdAt FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.json(null); }
  res.json(user);
});

module.exports = router;
