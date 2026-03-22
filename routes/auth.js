const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../lib/database');
const { errorResponse, logAudit, getClientIp } = require('../lib/helpers');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again in 15 minutes.' } }
});

async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // skip in local dev if not configured
  const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`
  });
  const data = await res.json();
  return data.success && data.score >= 0.5;
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, recaptchaToken } = req.body;
  if (!email || !password)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Email and password are required');

  if (!(await verifyRecaptcha(recaptchaToken)))
    return errorResponse(res, 400, 'RECAPTCHA_FAILED', 'reCAPTCHA verification failed');

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
