const express = require('express');
const db = require('../lib/database');
const { requireAdmin } = require('../lib/middleware');

const router = express.Router();

// GET /api/audit-logs
router.get('/', requireAdmin, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  const rows = db.prepare(`
    SELECT l.*, u.username
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.userId
    ORDER BY l.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;

  res.json({ total, limit, offset, rows });
});

module.exports = router;
