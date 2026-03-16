const crypto = require('crypto');
const db = require('./database');

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function errorResponse(res, status, code, message, details = null) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  res.status(status).json(body);
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;
}

function logAudit(userId, action, entityType, entityId, details, ipAddress) {
  try {
    db.prepare('INSERT INTO audit_logs (userId, action, entityType, entityId, details, ipAddress) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, action, entityType, entityId, JSON.stringify(details), ipAddress);
  } catch (e) { console.error('Audit log error:', e); }
}

function triggerWebhooks(event, data) {
  try {
    const hooks = db.prepare("SELECT * FROM webhooks WHERE enabled = 1 AND (events LIKE '%\"*\"%' OR events LIKE ?)").all(`%"${event}"%`);
    hooks.forEach(hook => {
      fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Event': event },
        body: JSON.stringify({ event, data, timestamp: new Date().toISOString() })
      }).catch(e => console.warn('Webhook failed:', hook.url, e.message));
      db.prepare("UPDATE webhooks SET lastTriggeredAt = datetime('now') WHERE id = ?").run(hook.id);
    });
  } catch (e) { console.error('Webhook error:', e); }
}

// In-memory preview tokens (1 hour TTL)
const previewTokens = new Map();
function createPreviewToken(resourceId, expiresInMs = 3_600_000) {
  const token = generateToken(16);
  previewTokens.set(token, { resourceId, expiresAt: Date.now() + expiresInMs });
  return token;
}
function validatePreviewToken(token) {
  const data = previewTokens.get(token);
  if (!data) return null;
  if (Date.now() > data.expiresAt) { previewTokens.delete(token); return null; }
  return data.resourceId;
}

// In-memory device commands (60s TTL)
const deviceCommands = new Map();
function setDeviceCommand(deviceId, command) {
  deviceCommands.set(deviceId, { command, timestamp: Date.now() });
}
function getDeviceCommand(deviceId) {
  const cmd = deviceCommands.get(deviceId);
  if (cmd && Date.now() - cmd.timestamp < 60_000) {
    deviceCommands.delete(deviceId);
    return cmd.command;
  }
  return null;
}

module.exports = {
  generateToken, errorResponse, getClientIp,
  logAudit, triggerWebhooks,
  createPreviewToken, validatePreviewToken,
  setDeviceCommand, getDeviceCommand
};
