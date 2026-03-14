const express = require('express');
const { queryAll, run } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET user's reservations
router.get('/', authMiddleware, (req, res) => {
  let reservations;
  if (req.user.role === 'student') {
    reservations = queryAll(`
      SELECT r.*, ps.label as space_label, pz.name as zone_name
      FROM reservations r
      JOIN parking_spaces ps ON r.space_id = ps.id
      JOIN parking_zones pz ON ps.zone_id = pz.id
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC LIMIT 20
    `, [req.user.id]);
  } else {
    reservations = queryAll(`
      SELECT r.*, ps.label as space_label, pz.name as zone_name, u.name as student_name, u.email as student_email
      FROM reservations r
      JOIN parking_spaces ps ON r.space_id = ps.id
      JOIN parking_zones pz ON ps.zone_id = pz.id
      JOIN users u ON r.student_id = u.id
      ORDER BY r.created_at DESC LIMIT 50
    `);
  }
  res.json(reservations);
});

// GET active reservation for current user
router.get('/active', authMiddleware, requireRole('student'), (req, res) => {
  const reservations = queryAll(`
    SELECT r.*, ps.label as space_label, pz.name as zone_name, ps.zone_id, ps.row_pos, ps.col_pos
    FROM reservations r
    JOIN parking_spaces ps ON r.space_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE r.student_id = ? AND r.status = 'active'
  `, [req.user.id]);
  res.json(reservations[0] || null);
});

// POST cancel reservation
router.post('/:id/cancel', authMiddleware, (req, res) => {
  const reservations = queryAll('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
  const reservation = reservations[0];
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

  // Students can only cancel their own
  if (req.user.role === 'student' && reservation.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your reservation' });
  }

  if (reservation.status !== 'active') {
    return res.status(400).json({ error: 'Reservation is not active' });
  }

  run(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
  run(`UPDATE parking_spaces SET status = 'free', last_update = ? WHERE id = ?`,
    [new Date().toISOString(), reservation.space_id]);

  res.json({ message: 'Reservation cancelled', space_id: reservation.space_id });
});

module.exports = router;
