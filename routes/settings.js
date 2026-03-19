const express = require('express');
const crypto = require('crypto');
const db = require('../lib/database');
const { errorResponse } = require('../lib/helpers');
const { requireAdmin } = require('../lib/middleware');

const router = express.Router();

// ==================== API KEYS ====================

router.get('/api-keys', requireAdmin, (req, res) => {
  try {
    const keys = db.prepare(`
      SELECT id, userId, name, keyPrefix, permissions, lastUsedAt, expiresAt, createdAt
      FROM api_keys
      ORDER BY id DESC
    `).all();
    res.json(keys.map(k => ({ ...k, permissions: JSON.parse(k.permissions || '[]') })));
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

router.post('/api-keys', requireAdmin, (req, res) => {
  try {
    const { name, permissions, expiresAt } = req.body;
    if (!name) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Name required');

    const rawKey = 'sig_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12) + '...';

    const result = db.prepare(
      'INSERT INTO api_keys (userId, name, keyHash, keyPrefix, permissions, expiresAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.session.userId, name, keyHash, keyPrefix, JSON.stringify(permissions || []), expiresAt || null);

    // Return the full key only once
    res.status(201).json({ id: result.lastInsertRowid, name, key: rawKey, keyPrefix });
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

router.delete('/api-keys/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

// ==================== WEBHOOKS ====================

router.get('/webhooks', requireAdmin, (req, res) => {
  try {
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY id DESC').all();
    res.json(webhooks.map(w => ({ ...w, enabled: !!w.enabled, events: JSON.parse(w.events || '[]') })));
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

router.post('/webhooks', requireAdmin, (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    if (!name || !url) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Name and URL required');

    const result = db.prepare(
      'INSERT INTO webhooks (userId, name, url, events, secret) VALUES (?, ?, ?, ?, ?)'
    ).run(req.session.userId, name, url, JSON.stringify(events || ['*']), secret || null);

    res.status(201).json({ id: result.lastInsertRowid, name, url });
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

router.patch('/webhooks/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { enabled } = req.body;
    if (enabled !== undefined) {
      db.prepare('UPDATE webhooks SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    }
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    if (!webhook) return errorResponse(res, 404, 'NOT_FOUND', 'Webhook not found');
    res.json({ ...webhook, enabled: !!webhook.enabled, events: JSON.parse(webhook.events || '[]') });
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

router.delete('/webhooks/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

// ==================== SYSTEM INFO ====================

router.get('/system/info', requireAdmin, (req, res) => {
  try {
    res.json({
      version: '1.0.0',
      database: 'Connected',
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version
    });
  } catch (err) {
    console.error(err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Server error');
  }
});

module.exports = router;
