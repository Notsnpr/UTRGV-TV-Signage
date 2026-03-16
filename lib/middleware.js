const crypto = require('crypto');
const db = require('./database');
const { errorResponse } = require('./helpers');

function requireAuth(req, res, next) {
  if (!req.session.userId) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (user?.role !== 'admin') return errorResponse(res, 403, 'FORBIDDEN', 'Admin access required');
  next();
}

function isUserAdmin(userId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  return user?.role === 'admin';
}

// Middleware: must be used on routes with :id param = TV id
function requireTVAccess(req, res, next) {
  if (!req.session.userId) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (isUserAdmin(req.session.userId)) return next();
  const access = db.prepare('SELECT id FROM tv_user_access WHERE tvId = ? AND userId = ?')
    .get(req.params.id, req.session.userId);
  if (!access) return errorResponse(res, 403, 'FORBIDDEN', 'Access to this TV is not granted');
  next();
}

function canAccessResource(userId, resourceId, isAdmin, tableName, ownerColumn = 'userId') {
  if (isAdmin) return true;
  const row = db.prepare(`SELECT ${ownerColumn} FROM ${tableName} WHERE id = ?`).get(resourceId);
  if (!row) return false;
  return row[ownerColumn] === userId;
}

function requireApiKey(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return errorResponse(res, 401, 'UNAUTHORIZED', 'API key required');
  const keyHash = crypto.createHash('sha256').update(auth.substring(7)).digest('hex');
  const apiKey = db.prepare('SELECT * FROM api_keys WHERE keyHash = ?').get(keyHash);
  if (!apiKey) return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid API key');
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date())
    return errorResponse(res, 401, 'UNAUTHORIZED', 'API key expired');
  db.prepare("UPDATE api_keys SET lastUsedAt = datetime('now') WHERE id = ?").run(apiKey.id);
  req.apiKey = apiKey;
  req.session.userId = apiKey.userId;
  next();
}

function requireAuthOrApiKey(req, res, next) {
  if (req.session.userId) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return requireApiKey(req, res, next);
  return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
}

module.exports = {
  requireAuth, requireAdmin, requireTVAccess,
  isUserAdmin, canAccessResource,
  requireApiKey, requireAuthOrApiKey
};
