const { queryAll, run, saveDB } = require('./db');

// University-registered plates
const REGISTERED_PLATES = [
  'ABC-1234', 'XYZ-5678', 'DEF-9012', 'GHI-3456', 'JKL-7890',
  'MNO-1122', 'PQR-3344', 'STU-5566', 'VWX-7788', 'YZA-9900',
  'BCF-1234', 'EGH-5678', 'IJK-9012', 'LMN-3456', 'OPQ-7890',
  'UNI-0001', 'UNI-0002', 'UNI-0003', 'UNI-0004', 'FAC-1001',
];

const EXTERNAL_PLATES = [
  'OUT-9999', 'EXT-5544', 'VIS-3322', 'TMP-8877', 'EXV-6655',
  'CIV-4433', 'PUB-2211', 'GUE-0099', 'PRV-1100', 'NON-7766',
];

function randomPlate(registered) {
  const pool = registered ? REGISTERED_PLATES : EXTERNAL_PLATES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function simulateSensorUpdate(io) {
  const spaces = queryAll(`
    SELECT ps.*, pz.university_only
    FROM parking_spaces ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE ps.status != 'blocked'
  `);

  const updates = [];

  spaces.forEach(space => {
    const rand = Math.random();

    // 5% chance of a status change per cycle
    if (rand < 0.05) {
      const now = new Date().toISOString();
      let newStatus, plate, lprStatus;

      if (space.status === 'free') {
        // Car arrives - 70% registered, 30% external
        const isRegistered = Math.random() > 0.3;
        plate = randomPlate(isRegistered);
        lprStatus = isRegistered ? 'registered' : 'unregistered';
        newStatus = 'occupied';

        run(`UPDATE parking_spaces SET status = ?, current_plate = ?, lpr_status = ?, parked_since = ?, last_update = ? WHERE id = ?`,
          [newStatus, plate, lprStatus, now, now, space.id]);

        // Log LPR event
        run(`INSERT INTO lpr_events (space_id, plate_number, timestamp, result) VALUES (?, ?, ?, ?)`,
          [space.id, plate, now, lprStatus]);

        // Log parking event
        run(`INSERT INTO parking_events (space_id, plate_number, event_type, timestamp) VALUES (?, ?, 'arrival', ?)`,
          [space.id, plate, now]);

        // Unauthorized in university-only zone → alert
        if (!isRegistered && space.university_only) {
          run(`INSERT INTO security_alerts (space_id, alert_type, message, created_at) VALUES (?, 'unauthorized', ?, ?)`,
            [space.id, `Unregistered vehicle (${plate}) detected in University Only zone (Space ${space.label})`, now]);
        }

        updates.push({ id: space.id, status: newStatus, plate, lprStatus, parked_since: now });

      } else if (space.status === 'occupied') {
        // Car departs
        newStatus = 'free';
        run(`UPDATE parking_spaces SET status = ?, current_plate = NULL, lpr_status = NULL, parked_since = NULL, last_update = ? WHERE id = ?`,
          [newStatus, now, space.id]);

        run(`INSERT INTO parking_events (space_id, plate_number, event_type, timestamp) VALUES (?, ?, 'departure', ?)`,
          [space.id, space.current_plate, now]);

        // Auto-resolve overstay alerts for this space
        run(`UPDATE security_alerts SET auto_resolved = 1 WHERE space_id = ? AND alert_type = 'overstay' AND acknowledged = 0`,
          [space.id]);

        updates.push({ id: space.id, status: newStatus, plate: null, lprStatus: null });
      }
    }

    // Check for overstays (car parked > max_stay_minutes)
    if (space.status === 'occupied' && space.parked_since) {
      const parkedAt = new Date(space.parked_since);
      const minutesParked = (Date.now() - parkedAt.getTime()) / 60000;

      if (minutesParked > space.max_stay_minutes) {
        // Check if alert already exists for this space
        const existing = queryAll(
          `SELECT id FROM security_alerts WHERE space_id = ? AND alert_type = 'overstay' AND acknowledged = 0 AND auto_resolved = 0`,
          [space.id]
        );

        if (!existing.length) {
          const now = new Date().toISOString();
          const overstayMins = Math.round(minutesParked - space.max_stay_minutes);
          run(`INSERT INTO security_alerts (space_id, alert_type, message, created_at) VALUES (?, 'overstay', ?, ?)`,
            [space.id, `Vehicle in ${space.label} has been parked ${Math.round(minutesParked)}min (${overstayMins}min over the ${space.max_stay_minutes}min limit)`, now]);

          run(`INSERT INTO parking_events (space_id, plate_number, event_type, timestamp) VALUES (?, ?, 'overstay', ?)`,
            [space.id, space.current_plate, now]);
        }
      }
    }
  });

  // Check and expire reservations
  const expiredReservations = queryAll(`
    SELECT r.*, ps.label as space_label
    FROM reservations r
    JOIN parking_spaces ps ON r.space_id = ps.id
    WHERE r.status = 'active' AND r.expiry_time < datetime('now')
  `);

  expiredReservations.forEach(res => {
    run(`UPDATE reservations SET status = 'expired' WHERE id = ?`, [res.id]);
    run(`UPDATE parking_spaces SET status = 'free', last_update = ? WHERE id = ? AND status = 'reserved'`,
      [new Date().toISOString(), res.space_id]);
    updates.push({ id: res.space_id, status: 'free' });
  });

  // Update AI predictions every 10 cycles
  if (Math.random() < 0.1) {
    updatePredictions();
  }

  if (updates.length > 0) {
    saveDB();
    // Emit updates via socket.io
    if (io) {
      updates.forEach(u => io.emit('space_update', u));
      // Emit new alerts if any
      const newAlerts = queryAll(`
        SELECT sa.*, ps.label as space_label, pz.name as zone_name
        FROM security_alerts sa
        JOIN parking_spaces ps ON sa.space_id = ps.id
        JOIN parking_zones pz ON ps.zone_id = pz.id
        WHERE sa.created_at > datetime('now', '-10 seconds')
        ORDER BY sa.created_at DESC LIMIT 5
      `);
      if (newAlerts.length) io.emit('new_alerts', newAlerts);
    }
  }
}

function updatePredictions() {
  const zones = queryAll('SELECT id FROM parking_zones');
  zones.forEach(zone => {
    const hours = [1, 2, 4];
    hours.forEach(h => {
      // Simple prediction: current occupancy + trend
      const current = queryAll(`
        SELECT AVG(occupancy_pct) as pct FROM usage_snapshots
        WHERE zone_id = ? AND snapshot_date = date('now')
        AND hour = cast(strftime('%H', 'now') as integer)
      `, [zone.id]);

      const basePct = current[0]?.pct || 50 + Math.random() * 30;
      // Future prediction with some noise
      const predicted = Math.min(100, Math.max(5, basePct + (Math.random() - 0.5) * 20));

      run(`UPDATE ai_predictions SET predicted_occupancy_pct = ?, prediction_time = ?
        WHERE zone_id = ? AND horizon_hours = ?`,
        [predicted.toFixed(1), new Date().toISOString(), zone.id, h]);
    });
  });

  // Add snapshot for current hour
  const zones2 = queryAll(`
    SELECT pz.id,
      COUNT(ps.id) as total,
      SUM(CASE WHEN ps.status IN ('occupied','reserved') THEN 1 ELSE 0 END) as occupied
    FROM parking_zones pz
    JOIN parking_spaces ps ON ps.zone_id = pz.id
    GROUP BY pz.id
  `);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hour = now.getHours();

  zones2.forEach(z => {
    const pct = z.total > 0 ? (z.occupied / z.total) * 100 : 0;
    // Check if snapshot exists
    const existing = queryAll(`SELECT id FROM usage_snapshots WHERE zone_id = ? AND snapshot_date = ? AND hour = ?`,
      [z.id, dateStr, hour]);
    if (existing.length) {
      run(`UPDATE usage_snapshots SET occupied_spaces = ?, occupancy_pct = ? WHERE id = ?`,
        [z.occupied, pct.toFixed(1), existing[0].id]);
    } else {
      run(`INSERT INTO usage_snapshots (zone_id, snapshot_date, hour, total_spaces, occupied_spaces, occupancy_pct) VALUES (?, ?, ?, ?, ?, ?)`,
        [z.id, dateStr, hour, z.total, z.occupied, pct.toFixed(1)]);
    }
  });
}

function startSimulator(io) {
  console.log('🔧 Sensor simulator started');
  setInterval(() => simulateSensorUpdate(io), 8000); // Every 8 seconds
  setInterval(updatePredictions, 60000); // Update predictions every minute
}

module.exports = { startSimulator, updatePredictions };
