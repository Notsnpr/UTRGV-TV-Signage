const express = require('express');
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const db = require('../lib/database');
const { errorResponse, logAudit, getClientIp } = require('../lib/helpers');
const { requireAuthOrApiKey, isUserAdmin } = require('../lib/middleware');

const router = express.Router();

// GET /api/media
router.get('/', requireAuthOrApiKey, (req, res) => {
  const admin = isUserAdmin(req.session.userId);
  const assets = admin
    ? db.prepare('SELECT * FROM media_assets ORDER BY createdAt DESC').all()
    : db.prepare('SELECT * FROM media_assets WHERE uploaderId = ? ORDER BY createdAt DESC').all(req.session.userId);
  res.json(assets);
});

// POST /api/media/upload
router.post('/upload', requireAuthOrApiKey, (req, res) => {
  const upload = req.app.locals.upload;
  upload.array('files', 50)(req, res, err => {
    if (err) return errorResponse(res, 400, 'UPLOAD_ERROR', err.message);
    if (!req.files?.length) return errorResponse(res, 400, 'VALIDATION_ERROR', 'No files uploaded');

    const inserted = [];
    for (const file of req.files) {
      const url = `/uploads/${file.filename}`;
      const info = db.prepare(
        'INSERT INTO media_assets (uploaderId, originalFilename, storedFilename, mimeType, fileSize, url) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.session.userId, file.originalname.normalize('NFC'), file.filename, file.mimetype, file.size, url);
      inserted.push(db.prepare('SELECT * FROM media_assets WHERE id = ?').get(info.lastInsertRowid));
    }
    logAudit(req.session.userId, 'media.uploaded', 'media_asset', null,
      { count: inserted.length, files: inserted.map(f => f.originalFilename) }, getClientIp(req));
    res.status(201).json(inserted);
  });
});

// POST /api/media/youtube
router.post('/youtube', requireAuthOrApiKey, (req, res) => {
  const { url, title } = req.body;
  if (!url || typeof url !== 'string')
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'url is required');

  const info = db.prepare(
    'INSERT INTO media_assets (uploaderId, originalFilename, storedFilename, mimeType, fileSize, url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.session.userId, title || url, url, 'youtube', 0, url);
  const asset = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(info.lastInsertRowid);
  logAudit(req.session.userId, 'media.youtube_added', 'media_asset', asset.id, { url }, getClientIp(req));
  res.status(201).json(asset);
});

// DELETE /api/media/:id
router.delete('/:id', requireAuthOrApiKey, (req, res) => {
  const asset = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id);
  if (!asset) return errorResponse(res, 404, 'NOT_FOUND', 'Media asset not found');

  const admin = isUserAdmin(req.session.userId);
  if (!admin && asset.uploaderId !== req.session.userId)
    return errorResponse(res, 403, 'FORBIDDEN', 'Cannot delete another user\'s media');

  // Delete file from disk for non-YouTube assets
  if (asset.mimeType !== 'youtube') {
    const filePath = path.join(__dirname, '..', 'uploads', asset.storedFilename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM media_assets WHERE id = ?').run(req.params.id);
  logAudit(req.session.userId, 'media.deleted', 'media_asset', Number(req.params.id),
    { originalFilename: asset.originalFilename }, getClientIp(req));
  res.status(204).end();
});

module.exports = router;
