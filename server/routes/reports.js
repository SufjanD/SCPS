const express = require('express');
const { queryAll } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET utilization report
router.get('/utilization', authMiddleware, requireRole('management', 'security'), (req, res) => {
  const { from, to, zone_id } = req.query;
  const fromDate = from || new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0];
  const toDate = to || new Date().toISOString().split('T')[0];

  let zoneFilter = '';
  let params = [fromDate, toDate];
  if (zone_id) {
    zoneFilter = 'AND us.zone_id = ?';
    params.push(zone_id);
  }

  // Daily average per zone
  const daily = queryAll(`
    SELECT us.snapshot_date as date,
      us.zone_id,
      pz.name as zone_name,
      AVG(us.occupancy_pct) as avg_occupancy,
      MAX(us.occupancy_pct) as peak_occupancy,
      SUM(us.occupied_spaces) as total_events
    FROM usage_snapshots us
    JOIN parking_zones pz ON us.zone_id = pz.id
    WHERE us.snapshot_date >= ? AND us.snapshot_date <= ? ${zoneFilter}
    GROUP BY us.snapshot_date, us.zone_id
    ORDER BY us.snapshot_date, us.zone_id
  `, params);

  // Hourly heatmap (day of week x hour)
  const heatmap = queryAll(`
    SELECT
      CAST(strftime('%w', us.snapshot_date) AS INTEGER) as day_of_week,
      us.hour,
      AVG(us.occupancy_pct) as avg_occupancy
    FROM usage_snapshots us
    WHERE us.snapshot_date >= ? AND us.snapshot_date <= ?
    GROUP BY day_of_week, us.hour
    ORDER BY day_of_week, us.hour
  `, [fromDate, toDate]);

  // Zone summary
  const summary = queryAll(`
    SELECT pz.id as zone_id, pz.name as zone_name, pz.campus,
      COUNT(DISTINCT us.snapshot_date) as days_sampled,
      AVG(us.occupancy_pct) as avg_occupancy,
      MAX(us.occupancy_pct) as peak_occupancy,
      SUM(us.occupied_spaces) as total_occupied_slots,
      (SELECT hour FROM usage_snapshots us2 WHERE us2.zone_id = pz.id
        ORDER BY us2.occupancy_pct DESC LIMIT 1) as busiest_hour
    FROM parking_zones pz
    JOIN usage_snapshots us ON us.zone_id = pz.id
    WHERE us.snapshot_date >= ? AND us.snapshot_date <= ?
    GROUP BY pz.id
    ORDER BY pz.id
  `, [fromDate, toDate]);

  // Total events from parking_events table
  const events = queryAll(`
    SELECT COUNT(*) as total_arrivals,
      SUM(CASE WHEN event_type = 'overstay' THEN 1 ELSE 0 END) as overstay_count,
      SUM(CASE WHEN event_type = 'flagged' THEN 1 ELSE 0 END) as flagged_count
    FROM parking_events
    WHERE timestamp >= ? AND timestamp <= ?
  `, [fromDate + 'T00:00:00', toDate + 'T23:59:59']);

  res.json({ daily, heatmap, summary, events: events[0], fromDate, toDate });
});

// GET AI predictions
router.get('/predictions', authMiddleware, (req, res) => {
  const predictions = queryAll(`
    SELECT ap.*, pz.name as zone_name, pz.color as zone_color
    FROM ai_predictions ap
    JOIN parking_zones pz ON ap.zone_id = pz.id
    ORDER BY ap.zone_id, ap.horizon_hours
  `);
  res.json(predictions);
});

// GET CSV export
router.get('/export', authMiddleware, requireRole('management'), (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0];
  const toDate = to || new Date().toISOString().split('T')[0];

  const data = queryAll(`
    SELECT
      us.snapshot_date as "Date",
      us.hour as "Hour",
      pz.name as "Zone",
      pz.campus as "Campus",
      us.total_spaces as "Total Spaces",
      us.occupied_spaces as "Occupied",
      us.total_spaces - us.occupied_spaces as "Free",
      ROUND(us.occupancy_pct, 1) as "Occupancy %"
    FROM usage_snapshots us
    JOIN parking_zones pz ON us.zone_id = pz.id
    WHERE us.snapshot_date >= ? AND us.snapshot_date <= ?
    ORDER BY us.snapshot_date, us.hour, pz.id
  `, [fromDate, toDate]);

  // Build CSV manually
  if (!data.length) return res.status(404).json({ error: 'No data for this range' });

  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const val = row[h];
    if (val === null) return '';
    if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
    return val;
  }).join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=SCPS_Report_${fromDate}_${toDate}.csv`);
  res.send(csv);
});

module.exports = router;
