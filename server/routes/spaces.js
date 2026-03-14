const express = require('express');
const { queryAll, run } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET all spaces with zone info
router.get('/', authMiddleware, (req, res) => {
  const spaces = queryAll(`
    SELECT ps.*, pz.name as zone_name, pz.university_only, pz.color as zone_color, pz.campus
    FROM parking_spaces ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    ORDER BY ps.zone_id, ps.row_pos, ps.col_pos
  `);
  res.json(spaces);
});

// GET zones
router.get('/zones', authMiddleware, (req, res) => {
  const zones = queryAll(`
    SELECT pz.*,
      COUNT(ps.id) as total_spaces,
      SUM(CASE WHEN ps.status = 'free' THEN 1 ELSE 0 END) as free_spaces,
      SUM(CASE WHEN ps.status = 'occupied' THEN 1 ELSE 0 END) as occupied_spaces,
      SUM(CASE WHEN ps.status = 'reserved' THEN 1 ELSE 0 END) as reserved_spaces,
      SUM(CASE WHEN ps.status = 'blocked' THEN 1 ELSE 0 END) as blocked_spaces
    FROM parking_zones pz
    LEFT JOIN parking_spaces ps ON ps.zone_id = pz.id
    GROUP BY pz.id
    ORDER BY pz.id
  `);
  res.json(zones);
});

// GET single space
router.get('/:id', authMiddleware, (req, res) => {
  const spaces = queryAll(`
    SELECT ps.*, pz.name as zone_name, pz.university_only, pz.color as zone_color
    FROM parking_spaces ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE ps.id = ?
  `, [req.params.id]);
  if (!spaces.length) return res.status(404).json({ error: 'Space not found' });
  res.json(spaces[0]);
});

// POST reserve space
router.post('/:id/reserve', authMiddleware, requireRole('student'), (req, res) => {
  const spaceId = parseInt(req.params.id);
  const userId = req.user.id;

  // Check for active reservation
  const existing = queryAll(`
    SELECT id FROM reservations WHERE student_id = ? AND status = 'active'
  `, [userId]);
  if (existing.length) {
    return res.status(400).json({ error: 'You already have an active reservation. Cancel it first.' });
  }

  // Check space is free
  const spaces = queryAll('SELECT * FROM parking_spaces WHERE id = ?', [spaceId]);
  const space = spaces[0];
  if (!space) return res.status(404).json({ error: 'Space not found' });
  if (space.status !== 'free') {
    return res.status(409).json({ error: 'Sorry, that space was just taken. Please choose another.' });
  }

  const now = new Date();
  const expiry = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  try {
    // Create reservation
    const result = run(`
      INSERT INTO reservations (student_id, space_id, start_time, expiry_time, status)
      VALUES (?, ?, ?, ?, 'active')
    `, [userId, spaceId, now.toISOString(), expiry.toISOString()]);

    // Update space status
    run(`UPDATE parking_spaces SET status = 'reserved', last_update = ? WHERE id = ?`,
      [now.toISOString(), spaceId]);

    // Log event
    run(`INSERT INTO parking_events (space_id, event_type, timestamp, user_id) VALUES (?, 'reservation', ?, ?)`,
      [spaceId, now.toISOString(), userId]);

    const reservations = queryAll('SELECT * FROM reservations WHERE id = ?', [result.lastInsertRowid]);
    res.json({
      reservation: reservations[0],
      message: `Space ${space.label} reserved until ${expiry.toLocaleTimeString()}. Don't be late!`
    });
  } catch (e) {
    res.status(500).json({ error: 'Reservation failed due to a system error. Please try again.' });
  }
});

// POST flag space (security only)
router.post('/:id/flag', authMiddleware, requireRole('security', 'management'), (req, res) => {
  const { reason } = req.body; // 'blocked' or 'out_of_service'
  const spaceId = req.params.id;

  run(`UPDATE parking_spaces SET status = 'blocked', flag_reason = ?, last_update = ? WHERE id = ?`,
    [reason || 'blocked', new Date().toISOString(), spaceId]);

  run(`INSERT INTO parking_events (space_id, event_type, timestamp, user_id) VALUES (?, 'flagged', ?, ?)`,
    [spaceId, new Date().toISOString(), req.user.id]);

  const spaces = queryAll('SELECT * FROM parking_spaces WHERE id = ?', [spaceId]);
  res.json(spaces[0]);
});

// POST clear flag (security only)
router.post('/:id/clear', authMiddleware, requireRole('security', 'management'), (req, res) => {
  run(`UPDATE parking_spaces SET status = 'free', flag_reason = NULL, last_update = ? WHERE id = ?`,
    [new Date().toISOString(), req.params.id]);
  const spaces = queryAll('SELECT * FROM parking_spaces WHERE id = ?', [req.params.id]);
  res.json(spaces[0]);
});

// GET space history
router.get('/:id/events', authMiddleware, requireRole('security', 'management'), (req, res) => {
  const events = queryAll(`
    SELECT pe.*, u.name as user_name
    FROM parking_events pe
    LEFT JOIN users u ON pe.user_id = u.id
    WHERE pe.space_id = ?
    ORDER BY pe.timestamp DESC LIMIT 20
  `, [req.params.id]);
  res.json(events);
});

module.exports = router;
