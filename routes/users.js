const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../lib/database');
const { errorResponse, logAudit, getClientIp } = require('../lib/helpers');
const { requireAdmin } = require('../lib/middleware');

const router = express.Router();

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Only alphanumeric and underscores'),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).default('user'),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'user']).optional(),
});

// GET /api/admin/users
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.createdAt, u.updatedAt,
           COUNT(a.tvId) AS tvAccessCount
    FROM users u
    LEFT JOIN tv_user_access a ON a.userId = u.id
    GROUP BY u.id
    ORDER BY u.createdAt DESC
  `).all();
  res.json(users);
});

// POST /api/admin/users
router.post('/', requireAdmin, (req, res) => {
  const result = createUserSchema.safeParse(req.body);
  if (!result.success)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors);

  const { username, email, password, role } = result.data;
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      'INSERT INTO users (username, email, passwordHash, role) VALUES (?, ?, ?, ?)'
    ).run(username, email, passwordHash, role);
    const user = db.prepare('SELECT id, username, email, role, createdAt FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    logAudit(req.session.userId, 'user.created', 'user', user.id, { username, email, role }, getClientIp(req));
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT')
      return errorResponse(res, 409, 'CONFLICT', 'Username or email already in use');
    throw e;
  }
});

// PATCH /api/admin/users/:id
router.patch('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return errorResponse(res, 404, 'NOT_FOUND', 'User not found');

  const result = updateUserSchema.safeParse(req.body);
  if (!result.success)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors);

  const data = result.data;
  if (Object.keys(data).length === 0)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'No fields provided');

  const updates = [];
  const params = [];
  if (data.username !== undefined) { updates.push('username = ?');     params.push(data.username); }
  if (data.email !== undefined)    { updates.push('email = ?');        params.push(data.email); }
  if (data.role !== undefined)     { updates.push('role = ?');         params.push(data.role); }
  if (data.password !== undefined) {
    updates.push('passwordHash = ?');
    params.push(bcrypt.hashSync(data.password, 10));
  }
  updates.push("updatedAt = datetime('now')");
  params.push(req.params.id);

  try {
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT')
      return errorResponse(res, 409, 'CONFLICT', 'Username or email already in use');
    throw e;
  }

  const updated = db.prepare('SELECT id, username, email, role, createdAt, updatedAt FROM users WHERE id = ?')
    .get(req.params.id);
  logAudit(req.session.userId, 'user.updated', 'user', updated.id, data, getClientIp(req));
  res.json(updated);
});

// DELETE /api/admin/users/:id
router.delete('/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.session.userId)
    return errorResponse(res, 400, 'BAD_REQUEST', 'Cannot delete your own account');
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return errorResponse(res, 404, 'NOT_FOUND', 'User not found');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logAudit(req.session.userId, 'user.deleted', 'user', Number(req.params.id), null, getClientIp(req));
  res.status(204).end();
});

module.exports = router;
