const express = require('express');
const { z } = require('zod');
const db = require('../lib/database');
const { errorResponse, logAudit, getClientIp, generateToken, getDeviceCommand } = require('../lib/helpers');
const { requireAdmin, requireAuthOrApiKey, requireTVAccess, isUserAdmin } = require('../lib/middleware');

const router = express.Router();

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function uniqueSlug(base) {
  let slug = base;
  let i = 1;
  while (db.prepare('SELECT id FROM tvs WHERE slug = ?').get(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

const createTVSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  location: z.string().optional(),
  cycleIntervalSeconds: z.number().int().min(1).max(3600).default(10),
  isActive: z.boolean().default(true),
  showEmergency: z.boolean().default(true),
});

const updateTVSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  location: z.string().optional(),
  cycleIntervalSeconds: z.number().int().min(1).max(3600).optional(),
  isActive: z.boolean().optional(),
  showEmergency: z.boolean().optional(),
});

const createItemSchema = z.object({
  mediaAssetId: z.number().int().positive(),
  sortOrder: z.number().int().min(0).default(0),
  durationSeconds: z.number().int().min(1).max(60).nullable().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const updateItemSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  durationSeconds: z.number().int().min(1).max(60).nullable().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── TV CRUD ─────────────────────────────────────────────────────────────────

// GET /api/tvs
router.get('/', requireAuthOrApiKey, (req, res) => {
  const admin = isUserAdmin(req.session.userId);
  const tvs = admin
    ? db.prepare(`
        SELECT t.*,
          COUNT(i.id) AS itemCount,
          COUNT(CASE WHEN i.isActive = 1 AND (i.endAt IS NULL OR i.endAt >= datetime('now')) THEN 1 END) AS activeItemCount
        FROM tvs t
        LEFT JOIN tv_playlist_items i ON i.tvId = t.id
        GROUP BY t.id ORDER BY t.createdAt DESC
      `).all()
    : db.prepare(`
        SELECT t.*, COUNT(CASE WHEN i.isActive = 1 AND (i.endAt IS NULL OR i.endAt >= datetime('now')) THEN 1 END) AS itemCount
        FROM tvs t
        JOIN tv_user_access a ON a.tvId = t.id AND a.userId = ?
        LEFT JOIN tv_playlist_items i ON i.tvId = t.id
        GROUP BY t.id ORDER BY t.createdAt DESC
      `).all(req.session.userId);

  res.json(tvs.map(tv => ({ ...tv, isActive: !!tv.isActive, showEmergency: !!tv.showEmergency })));
});

// POST /api/tvs
router.post('/', requireAdmin, (req, res) => {
  const result = createTVSchema.safeParse(req.body);
  if (!result.success)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors);

  const { name, slug: rawSlug, location, cycleIntervalSeconds, isActive, showEmergency } = result.data;
  const slug = uniqueSlug(rawSlug || slugify(name));
  const displayToken = generateToken(4);

  const info = db.prepare(
    'INSERT INTO tvs (name, slug, location, cycleIntervalSeconds, isActive, showEmergency, displayToken) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, slug, location || null, cycleIntervalSeconds, isActive ? 1 : 0, showEmergency ? 1 : 0, displayToken);

  const tv = db.prepare('SELECT * FROM tvs WHERE id = ?').get(info.lastInsertRowid);
  logAudit(req.session.userId, 'tv.created', 'tv', tv.id, { name, slug }, getClientIp(req));
  res.status(201).json({ ...tv, isActive: !!tv.isActive, showEmergency: !!tv.showEmergency });
});

// GET /api/tvs/:id
router.get('/:id', requireAuthOrApiKey, requireTVAccess, (req, res) => {
  const tv = db.prepare('SELECT * FROM tvs WHERE id = ?').get(req.params.id);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found');

  const admin = isUserAdmin(req.session.userId);
  const items = admin
    ? db.prepare(`
        SELECT i.*, m.originalFilename, m.mimeType, m.url AS mediaUrl,
               u.username AS uploaderUsername
        FROM tv_playlist_items i
        JOIN media_assets m ON m.id = i.mediaAssetId
        LEFT JOIN users u ON u.id = i.uploadedBy
        WHERE i.tvId = ?
        ORDER BY i.sortOrder ASC, i.id ASC
      `).all(req.params.id)
    : db.prepare(`
        SELECT i.*, m.originalFilename, m.mimeType, m.url AS mediaUrl,
               u.username AS uploaderUsername
        FROM tv_playlist_items i
        JOIN media_assets m ON m.id = i.mediaAssetId
        LEFT JOIN users u ON u.id = i.uploadedBy
        WHERE i.tvId = ? AND i.isActive = 1 AND (i.endAt IS NULL OR i.endAt >= datetime('now'))
        ORDER BY i.sortOrder ASC, i.id ASC
      `).all(req.params.id);

  const access = db.prepare(`
    SELECT a.*, u.username, u.email
    FROM tv_user_access a
    JOIN users u ON u.id = a.userId
    WHERE a.tvId = ?
    ORDER BY a.createdAt ASC
  `).all(req.params.id);

  res.json({
    ...tv,
    isActive: !!tv.isActive,
    showEmergency: !!tv.showEmergency,
    items: items.map(i => ({ ...i, isActive: !!i.isActive })),
    access,
  });
});

// PATCH /api/tvs/:id
router.patch('/:id', requireAdmin, (req, res) => {
  const tv = db.prepare('SELECT id FROM tvs WHERE id = ?').get(req.params.id);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found');

  const result = updateTVSchema.safeParse(req.body);
  if (!result.success)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors);

  const data = result.data;
  if (Object.keys(data).length === 0)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'No fields provided');

  const updates = [];
  const params = [];
  if (data.name !== undefined)                { updates.push('name = ?');                params.push(data.name); }
  if (data.location !== undefined)            { updates.push('location = ?');            params.push(data.location); }
  if (data.cycleIntervalSeconds !== undefined){ updates.push('cycleIntervalSeconds = ?'); params.push(data.cycleIntervalSeconds); }
  if (data.isActive !== undefined)            { updates.push('isActive = ?');            params.push(data.isActive ? 1 : 0); }
  if (data.showEmergency !== undefined)       { updates.push('showEmergency = ?');       params.push(data.showEmergency ? 1 : 0); }
  updates.push("updatedAt = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE tvs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM tvs WHERE id = ?').get(req.params.id);
  logAudit(req.session.userId, 'tv.updated', 'tv', updated.id, data, getClientIp(req));
  res.json({ ...updated, isActive: !!updated.isActive, showEmergency: !!updated.showEmergency });
});

// DELETE /api/tvs/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const tv = db.prepare('SELECT id FROM tvs WHERE id = ?').get(req.params.id);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found');
  db.prepare('DELETE FROM tvs WHERE id = ?').run(req.params.id);
  logAudit(req.session.userId, 'tv.deleted', 'tv', Number(req.params.id), null, getClientIp(req));
  res.status(204).end();
});

// ─── Playlist Items ───────────────────────────────────────────────────────────

// GET /api/tvs/:id/items
router.get('/:id/items', requireAuthOrApiKey, requireTVAccess, (req, res) => {
  const items = db.prepare(`
    SELECT i.*, m.originalFilename, m.mimeType, m.url AS mediaUrl
    FROM tv_playlist_items i
    JOIN media_assets m ON m.id = i.mediaAssetId
    WHERE i.tvId = ?
    ORDER BY i.sortOrder ASC, i.id ASC
  `).all(req.params.id);
  res.json(items.map(i => ({ ...i, isActive: !!i.isActive })));
});

// POST /api/tvs/:id/items
router.post('/:id/items', requireAuthOrApiKey, requireTVAccess, (req, res) => {
  const tv = db.prepare('SELECT id FROM tvs WHERE id = ?').get(req.params.id);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found');

  const result = createItemSchema.safeParse(req.body);
  if (!result.success)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors);

  const { mediaAssetId, sortOrder, durationSeconds, startAt, endAt, isActive } = result.data;

  const asset = db.prepare('SELECT id FROM media_assets WHERE id = ?').get(mediaAssetId);
  if (!asset) return errorResponse(res, 404, 'NOT_FOUND', 'Media asset not found');

  const info = db.prepare(`
    INSERT INTO tv_playlist_items (tvId, mediaAssetId, uploadedBy, sortOrder, durationSeconds, startAt, endAt, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, mediaAssetId, req.session.userId, sortOrder,
    durationSeconds ?? null, startAt ?? null, endAt ?? null, isActive ? 1 : 0);

  const item = db.prepare(`
    SELECT i.*, m.originalFilename, m.mimeType, m.url AS mediaUrl
    FROM tv_playlist_items i JOIN media_assets m ON m.id = i.mediaAssetId WHERE i.id = ?
  `).get(info.lastInsertRowid);

  logAudit(req.session.userId, 'tv_item.added', 'tv_playlist_item', item.id,
    { tvId: Number(req.params.id), mediaAssetId }, getClientIp(req));
  res.status(201).json({ ...item, isActive: !!item.isActive });
});

// PATCH /api/tvs/:id/items/:itemId
router.patch('/:id/items/:itemId', requireAuthOrApiKey, requireTVAccess, (req, res) => {
  const item = db.prepare('SELECT id, uploadedBy FROM tv_playlist_items WHERE id = ? AND tvId = ?')
    .get(req.params.itemId, req.params.id);
  if (!item) return errorResponse(res, 404, 'NOT_FOUND', 'Item not found');
  if (!isUserAdmin(req.session.userId) && item.uploadedBy !== req.session.userId)
    return errorResponse(res, 403, 'FORBIDDEN', 'You can only modify your own items');

  const result = updateItemSchema.safeParse(req.body);
  if (!result.success)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors);

  const data = result.data;
  if (Object.keys(data).length === 0)
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'No fields provided');

  const updates = [];
  const params = [];
  if (data.sortOrder !== undefined)       { updates.push('sortOrder = ?');       params.push(data.sortOrder); }
  if (data.durationSeconds !== undefined) { updates.push('durationSeconds = ?'); params.push(data.durationSeconds); }
  if (data.startAt !== undefined)         { updates.push('startAt = ?');         params.push(data.startAt); }
  if (data.endAt !== undefined)           { updates.push('endAt = ?');           params.push(data.endAt); }
  if (data.isActive !== undefined)        { updates.push('isActive = ?');        params.push(data.isActive ? 1 : 0); }
  updates.push("updatedAt = datetime('now')");
  params.push(req.params.itemId);

  db.prepare(`UPDATE tv_playlist_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare(`
    SELECT i.*, m.originalFilename, m.mimeType, m.url AS mediaUrl
    FROM tv_playlist_items i JOIN media_assets m ON m.id = i.mediaAssetId WHERE i.id = ?
  `).get(req.params.itemId);
  res.json({ ...updated, isActive: !!updated.isActive });
});

// DELETE /api/tvs/:id/items/:itemId
router.delete('/:id/items/:itemId', requireAuthOrApiKey, requireTVAccess, (req, res) => {
  const item = db.prepare('SELECT id, uploadedBy FROM tv_playlist_items WHERE id = ? AND tvId = ?')
    .get(req.params.itemId, req.params.id);
  if (!item) return errorResponse(res, 404, 'NOT_FOUND', 'Item not found');
  if (!isUserAdmin(req.session.userId) && item.uploadedBy !== req.session.userId)
    return errorResponse(res, 403, 'FORBIDDEN', 'You can only modify your own items');
  db.prepare('DELETE FROM tv_playlist_items WHERE id = ?').run(req.params.itemId);
  res.status(204).end();
});

// PUT /api/tvs/:id/items/reorder
router.put('/:id/items/reorder', requireAuthOrApiKey, requireTVAccess, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items))
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'items must be an array of {id, sortOrder}');

  const update = db.prepare('UPDATE tv_playlist_items SET sortOrder = ? WHERE id = ? AND tvId = ?');
  const reorder = db.transaction(list => {
    for (const { id, sortOrder } of list) {
      update.run(sortOrder, id, req.params.id);
    }
  });
  reorder(items);
  res.status(204).end();
});

// ─── Access Management ────────────────────────────────────────────────────────

// GET /api/tvs/:id/access
router.get('/:id/access', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.username, u.email, u.role,
           ab.username AS assignedByUsername
    FROM tv_user_access a
    JOIN users u ON u.id = a.userId
    LEFT JOIN users ab ON ab.id = a.assignedBy
    WHERE a.tvId = ?
    ORDER BY a.createdAt ASC
  `).all(req.params.id);
  res.json(rows);
});

// POST /api/tvs/:id/access
router.post('/:id/access', requireAdmin, (req, res) => {
  const tv = db.prepare('SELECT id FROM tvs WHERE id = ?').get(req.params.id);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found');

  const { userId } = req.body;
  if (!userId || typeof userId !== 'number')
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'userId is required');

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return errorResponse(res, 404, 'NOT_FOUND', 'User not found');

  try {
    const info = db.prepare(
      'INSERT INTO tv_user_access (tvId, userId, assignedBy) VALUES (?, ?, ?)'
    ).run(req.params.id, userId, req.session.userId);
    const row = db.prepare(`
      SELECT a.*, u.username, u.email FROM tv_user_access a
      JOIN users u ON u.id = a.userId WHERE a.id = ?
    `).get(info.lastInsertRowid);
    logAudit(req.session.userId, 'tv_access.granted', 'tv_user_access', row.id,
      { tvId: Number(req.params.id), userId }, getClientIp(req));
    res.status(201).json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT')
      return errorResponse(res, 409, 'CONFLICT', 'User already has access to this TV');
    throw e;
  }
});

// DELETE /api/tvs/:id/access/:userId
router.delete('/:id/access/:userId', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM tv_user_access WHERE tvId = ? AND userId = ?')
    .get(req.params.id, req.params.userId);
  if (!row) return errorResponse(res, 404, 'NOT_FOUND', 'Access record not found');
  db.prepare('DELETE FROM tv_user_access WHERE tvId = ? AND userId = ?')
    .run(req.params.id, req.params.userId);
  logAudit(req.session.userId, 'tv_access.revoked', 'tv_user_access', row.id,
    { tvId: Number(req.params.id), userId: Number(req.params.userId) }, getClientIp(req));
  res.status(204).end();
});

// ─── Device Poll ──────────────────────────────────────────────────────────────

// POST /api/tvs/:id/poll  (called by player, no auth)
router.post('/:id/poll', (req, res) => {
  const tv = db.prepare('SELECT id FROM tvs WHERE id = ?').get(req.params.id);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found');

  db.prepare("UPDATE tvs SET lastSeenAt = datetime('now') WHERE id = ?").run(req.params.id);
  const command = getDeviceCommand(req.params.id);
  res.json({ command: command || null });
});

module.exports = router;
