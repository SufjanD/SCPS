const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db;
const DB_PATH = path.join(__dirname, 'scps.db');

async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  seedData();
  return db;
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','security','management')),
      university_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parking_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      campus TEXT NOT NULL DEFAULT 'Main Campus',
      university_only INTEGER NOT NULL DEFAULT 1,
      color TEXT DEFAULT '#3b82f6'
    );

    CREATE TABLE IF NOT EXISTS parking_spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('standard','disabled','reserved')),
      status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free','occupied','reserved','blocked')),
      row_pos INTEGER NOT NULL,
      col_pos INTEGER NOT NULL,
      last_update TEXT DEFAULT (datetime('now')),
      current_plate TEXT,
      lpr_status TEXT CHECK(lpr_status IN ('registered','unregistered','unreadable','pending',NULL)),
      parked_since TEXT,
      max_stay_minutes INTEGER DEFAULT 120,
      flag_reason TEXT,
      FOREIGN KEY (zone_id) REFERENCES parking_zones(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      expiry_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','cancelled','fulfilled')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (space_id) REFERENCES parking_spaces(id)
    );

    CREATE TABLE IF NOT EXISTS parking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      plate_number TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('arrival','departure','overstay','flagged','reservation')),
      timestamp TEXT DEFAULT (datetime('now')),
      user_id INTEGER,
      FOREIGN KEY (space_id) REFERENCES parking_spaces(id)
    );

    CREATE TABLE IF NOT EXISTS security_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('overstay','unauthorized','sensor_offline','manual')),
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by INTEGER,
      acknowledged_at TEXT,
      auto_resolved INTEGER DEFAULT 0,
      FOREIGN KEY (space_id) REFERENCES parking_spaces(id)
    );

    CREATE TABLE IF NOT EXISTS lpr_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      plate_number TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      result TEXT NOT NULL CHECK(result IN ('registered','unregistered','unreadable','pending')),
      FOREIGN KEY (space_id) REFERENCES parking_spaces(id)
    );

    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      total_spaces INTEGER NOT NULL,
      occupied_spaces INTEGER NOT NULL,
      occupancy_pct REAL NOT NULL,
      FOREIGN KEY (zone_id) REFERENCES parking_zones(id)
    );

    CREATE TABLE IF NOT EXISTS ai_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      prediction_time TEXT NOT NULL,
      horizon_hours INTEGER NOT NULL,
      predicted_occupancy_pct REAL NOT NULL,
      model_version TEXT DEFAULT 'v1.0',
      FOREIGN KEY (zone_id) REFERENCES parking_zones(id)
    );
  `);
  saveDB();
}

function seedData() {
  // Check if already seeded
  const check = db.exec("SELECT COUNT(*) as cnt FROM users");
  if (check[0]?.values[0][0] > 0) return;

  const hash = bcrypt.hashSync('demo123', 10);

  // Users
  db.run(`INSERT INTO users (email, name, password_hash, role, university_id) VALUES
    ('student@uni.edu', 'Alex Johnson', '${hash}', 'student', 'STU-20240001'),
    ('student2@uni.edu', 'Maria Garcia', '${hash}', 'student', 'STU-20240002'),
    ('student3@uni.edu', 'James Lee', '${hash}', 'student', 'STU-20240003'),
    ('security@uni.edu', 'Officer Smith', '${hash}', 'security', 'SEC-001'),
    ('security2@uni.edu', 'Officer Davis', '${hash}', 'security', 'SEC-002'),
    ('admin@uni.edu', 'Dr. Williams', '${hash}', 'management', 'MGT-001')
  `);

  // Zones (4 zones)
  db.run(`INSERT INTO parking_zones (name, campus, university_only, color) VALUES
    ('Zone A - North', 'Main Campus', 1, '#3b82f6'),
    ('Zone B - East', 'Main Campus', 1, '#10b981'),
    ('Zone C - South', 'Main Campus', 0, '#f59e0b'),
    ('Zone D - West', 'Main Campus', 1, '#8b5cf6')
  `);

  // Generate 60 parking spaces (15 per zone)
  const zones = [1, 2, 3, 4];
  const spaceTypes = ['standard', 'standard', 'standard', 'standard', 'standard', 'standard',
    'standard', 'standard', 'standard', 'standard', 'standard', 'standard',
    'disabled', 'disabled', 'reserved'];

  const plates = ['ABC-1234','XYZ-5678','DEF-9012','GHI-3456','JKL-7890',
    'MNO-1122','PQR-3344','STU-5566','VWX-7788','YZA-9900',
    'BCF-1234','EGH-5678','IJK-9012','LMN-3456','OPQ-7890'];

  const registeredPlates = new Set(['ABC-1234','XYZ-5678','DEF-9012','GHI-3456','JKL-7890',
    'MNO-1122','PQR-3344']);

  const statuses = ['occupied','occupied','occupied','occupied','free','free','free',
    'free','free','free','free','occupied','occupied','free','free'];

  zones.forEach(zoneId => {
    const zoneLabel = ['A','B','C','D'][zoneId - 1];
    for (let i = 0; i < 15; i++) {
      const spaceLabel = `${zoneLabel}-${String(i + 1).padStart(2, '0')}`;
      const type = spaceTypes[i];
      const status = statuses[i];
      const plate = status === 'occupied' ? plates[i] : null;
      const lprStatus = plate ? (registeredPlates.has(plate) ? 'registered' : 'unregistered') : null;
      const parkedSince = status === 'occupied' ?
        new Date(Date.now() - Math.random() * 90 * 60 * 1000).toISOString() : null;
      const row = Math.floor(i / 5);
      const col = i % 5;

      db.run(`INSERT INTO parking_spaces (zone_id, label, type, status, row_pos, col_pos, current_plate, lpr_status, parked_since, last_update) VALUES
        (${zoneId}, '${spaceLabel}', '${type}', '${status}', ${row}, ${col},
        ${plate ? `'${plate}'` : 'NULL'},
        ${lprStatus ? `'${lprStatus}'` : 'NULL'},
        ${parkedSince ? `'${parkedSince}'` : 'NULL'},
        '${new Date().toISOString()}')`);
    }
  });

  // Generate historical usage snapshots for last 30 days
  const now = new Date();
  for (let day = 29; day >= 0; day--) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay(); // 0=Sun

    for (let hour = 6; hour <= 22; hour++) {
      zones.forEach(zoneId => {
        // Realistic occupancy patterns
        let basePct = 0;
        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // weekday
          if (hour >= 8 && hour <= 10) basePct = 75 + Math.random() * 20;
          else if (hour >= 11 && hour <= 14) basePct = 85 + Math.random() * 12;
          else if (hour >= 15 && hour <= 17) basePct = 70 + Math.random() * 20;
          else if (hour >= 18 && hour <= 20) basePct = 40 + Math.random() * 20;
          else basePct = 15 + Math.random() * 20;
        } else { // weekend
          basePct = 20 + Math.random() * 30;
        }
        const occupied = Math.round((basePct / 100) * 15);
        db.run(`INSERT INTO usage_snapshots (zone_id, snapshot_date, hour, total_spaces, occupied_spaces, occupancy_pct) VALUES
          (${zoneId}, '${dateStr}', ${hour}, 15, ${occupied}, ${basePct.toFixed(1)})`);
      });
    }
  }

  // Add some initial security alerts
  db.run(`INSERT INTO security_alerts (space_id, alert_type, message, created_at) VALUES
    (12, 'overstay', 'Vehicle in space A-12 has been parked for 3h 20min (limit: 2h)', '${new Date(Date.now() - 20*60000).toISOString()}'),
    (28, 'unauthorized', 'Unregistered vehicle detected in University Only Zone B (space B-13)', '${new Date(Date.now() - 5*60000).toISOString()}'),
    (3, 'overstay', 'Vehicle in space A-03 has been parked for 2h 45min (limit: 2h)', '${new Date(Date.now() - 45*60000).toISOString()}')
  `);

  // Seed LPR events
  db.run(`INSERT INTO lpr_events (space_id, plate_number, timestamp, result) VALUES
    (1, 'ABC-1234', '${new Date(Date.now()-2*3600000).toISOString()}', 'registered'),
    (2, 'XYZ-5678', '${new Date(Date.now()-3*3600000).toISOString()}', 'registered'),
    (3, 'OUT-9999', '${new Date(Date.now()-2.5*3600000).toISOString()}', 'unregistered'),
    (4, 'DEF-9012', '${new Date(Date.now()-1*3600000).toISOString()}', 'registered'),
    (12, 'OLDP-001', '${new Date(Date.now()-3.5*3600000).toISOString()}', 'registered'),
    (13, 'EXT-5544', '${new Date(Date.now()-0.5*3600000).toISOString()}', 'unregistered')
  `);

  // Seed parking events
  db.run(`INSERT INTO parking_events (space_id, plate_number, event_type, timestamp) VALUES
    (1, 'ABC-1234', 'arrival', '${new Date(Date.now()-2*3600000).toISOString()}'),
    (2, 'XYZ-5678', 'arrival', '${new Date(Date.now()-3*3600000).toISOString()}'),
    (3, 'OUT-9999', 'arrival', '${new Date(Date.now()-2.5*3600000).toISOString()}'),
    (12, 'OLDP-001', 'arrival', '${new Date(Date.now()-3.5*3600000).toISOString()}'),
    (12, 'OLDP-001', 'overstay', '${new Date(Date.now()-1.5*3600000).toISOString()}')
  `);

  // Generate AI predictions
  const hours = [1, 2, 4];
  zones.forEach(zoneId => {
    hours.forEach(h => {
      const pred = 50 + Math.random() * 40;
      db.run(`INSERT INTO ai_predictions (zone_id, prediction_time, horizon_hours, predicted_occupancy_pct) VALUES
        (${zoneId}, '${new Date().toISOString()}', ${h}, ${pred.toFixed(1)})`);
    });
  });

  saveDB();
  console.log('✅ Database seeded successfully');
}

function getDB() {
  return db;
}

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.getAsObject(params);
    stmt.free();
    return result;
  } catch (e) {
    return null;
  }
}

function queryAll(sql, params = []) {
  try {
    const result = db.exec(sql.replace(/\?/g, () => {
      const p = params.shift();
      if (p === null || p === undefined) return 'NULL';
      if (typeof p === 'number') return p;
      return `'${String(p).replace(/'/g, "''")}'`;
    }));
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (e) {
    console.error('QueryAll error:', e.message, sql);
    return [];
  }
}

function run(sql, params = []) {
  try {
    let q = sql;
    const p = [...params];
    q = q.replace(/\?/g, () => {
      const val = p.shift();
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return val;
      return `'${String(val).replace(/'/g, "''")}'`;
    });
    db.run(q);
    saveDB();
    return { changes: db.getRowsModified(), lastInsertRowid: db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] };
  } catch (e) {
    console.error('Run error:', e.message, sql);
    throw e;
  }
}

module.exports = { initDB, getDB, query, queryAll, run, saveDB };
