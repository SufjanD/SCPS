const express = require('express');
const { queryAll, run } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET active alerts
router.get('/', authMiddleware, requireRole('security', 'management'), (req, res) => {
  const alerts = queryAll(`
    SELECT sa.*, ps.label as space_label, pz.name as zone_name, pz.campus,
      u.name as acknowledged_by_name
    FROM security_alerts sa
    JOIN parking_spaces ps ON sa.space_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    LEFT JOIN users u ON sa.acknowledged_by = u.id
    ORDER BY sa.created_at DESC
    LIMIT 50
  `);
  res.json(alerts);
});

// GET unacknowledged alerts count
router.get('/count', authMiddleware, requireRole('security', 'management'), (req, res) => {
  const result = queryAll(`SELECT COUNT(*) as count FROM security_alerts WHERE acknowledged = 0 AND auto_resolved = 0`);
  res.json({ count: result[0]?.count || 0 });
});

// POST acknowledge alert
router.post('/:id/acknowledge', authMiddleware, requireRole('security', 'management'), (req, res) => {
  run(`
    UPDATE security_alerts
    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?
    WHERE id = ?
  `, [req.user.id, new Date().toISOString(), req.params.id]);
  res.json({ message: 'Alert acknowledged' });
});

// GET LPR events
router.get('/lpr', authMiddleware, requireRole('security', 'management'), (req, res) => {
  const events = queryAll(`
    SELECT le.*, ps.label as space_label, pz.name as zone_name
    FROM lpr_events le
    JOIN parking_spaces ps ON le.space_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    ORDER BY le.timestamp DESC LIMIT 100
  `);
  res.json(events);
});

module.exports = router;
