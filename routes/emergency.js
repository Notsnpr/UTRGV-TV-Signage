const express = require('express');
const { z } = require('zod');
const db = require('../lib/database');
const { errorResponse, logAudit, triggerWebhooks, getClientIp } = require('../lib/helpers');
const { requireAdmin } = require('../lib/middleware');

const router = express.Router();
router.use(requireAdmin);

// GET /api/emergency/current
router.get('/current', (req, res) => {
  const alert = db.prepare('SELECT * FROM emergency_alerts WHERE active = 1 ORDER BY createdAt DESC LIMIT 1').get();
  if (!alert) return res.json(null);
  res.json({ ...alert, active: !!alert.active });
});

// GET /api/emergency/history
router.get('/history', (req, res) => {
  const alerts = db.prepare('SELECT * FROM emergency_alerts ORDER BY createdAt DESC LIMIT 50').all();
  res.json(alerts.map(a => ({ ...a, active: !!a.active })));
});

// POST /api/emergency/activate
router.post('/activate', (req, res) => {
  const schema = z.object({
    title:   z.string().min(1),
    message: z.string().min(1),
    type:    z.string().optional(),
    bgColor:    z.string().optional(),
    textColor:  z.string().optional(),
    expiresAt:  z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten());
  }
  const { title, message, type = 'custom', bgColor = '#dc2626', textColor = '#ffffff', expiresAt } = result.data;

  db.prepare('UPDATE emergency_alerts SET active = 0').run();

  const info = db.prepare(
    'INSERT INTO emergency_alerts (userId, type, title, message, bgColor, textColor, active, expiresAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
  ).run(req.session.userId, type, title, message, bgColor, textColor, expiresAt || null);

  const alert = db.prepare('SELECT * FROM emergency_alerts WHERE id = ?').get(info.lastInsertRowid);

  logAudit(req.session.userId, 'emergency.activated', 'emergency_alert', alert.id, JSON.stringify({ title, type }), getClientIp(req));
  triggerWebhooks('emergency.activated', { alert: { ...alert, active: true } });

  res.status(201).json({ ...alert, active: true });
});

// POST /api/emergency/deactivate
router.post('/deactivate', (req, res) => {
  db.prepare('UPDATE emergency_alerts SET active = 0').run();

  logAudit(req.session.userId, 'emergency.deactivated', 'emergency_alert', null, null, getClientIp(req));
  triggerWebhooks('emergency.deactivated', {});

  res.json({ success: true });
});

// DELETE /api/emergency/:id
router.delete('/:id', (req, res) => {
  const alert = db.prepare('SELECT * FROM emergency_alerts WHERE id = ?').get(req.params.id);
  if (!alert) return errorResponse(res, 404, 'NOT_FOUND', 'Alert not found');

  db.prepare('DELETE FROM emergency_alerts WHERE id = ?').run(req.params.id);

  logAudit(req.session.userId, 'emergency.deleted', 'emergency_alert', alert.id, JSON.stringify({ title: alert.title }), getClientIp(req));

  res.status(204).end();
});

module.exports = router;
