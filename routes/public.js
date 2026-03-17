const express = require('express');
const db = require('../lib/database');
const { errorResponse } = require('../lib/helpers');

const router = express.Router();

// GET /api/public/tv/:displayToken  — no auth, used by player
router.get('/tv/:displayToken', (req, res) => {
  const tv = db.prepare('SELECT * FROM tvs WHERE displayToken = ? AND isActive = 1').get(req.params.displayToken);
  if (!tv) return errorResponse(res, 404, 'NOT_FOUND', 'TV not found or inactive');

  const now = new Date().toISOString();
  const items = db.prepare(`
    SELECT i.id, i.sortOrder, i.durationSeconds, i.startAt, i.endAt,
           m.mimeType, m.url AS mediaUrl, m.originalFilename
    FROM tv_playlist_items i
    JOIN media_assets m ON m.id = i.mediaAssetId
    WHERE i.tvId = ?
      AND i.isActive = 1
      AND (i.startAt IS NULL OR i.startAt <= ?)
      AND (i.endAt IS NULL OR i.endAt >= ?)
    ORDER BY i.sortOrder ASC, i.id ASC
  `).all(tv.id, now, now);

  res.json({
    id: tv.id,
    name: tv.name,
    slug: tv.slug,
    location: tv.location,
    cycleIntervalSeconds: tv.cycleIntervalSeconds,
    items,
  });
});

module.exports = router;
