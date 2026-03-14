require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { initDB } = require('./db');
const { startSimulator } = require('./simulator');
const { authMiddleware } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const spacesRoutes = require('./routes/spaces');
const reservationsRoutes = require('./routes/reservations');
const alertsRoutes = require('./routes/alerts');
const reportsRoutes = require('./routes/reports');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3001',
    ].filter(Boolean);
    if (!origin || allowed.some(a => origin.startsWith(a))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/spaces', spacesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/reports', reportsRoutes);

// Dashboard stats endpoint
app.get('/api/stats', authMiddleware, (req, res) => {
  const { queryAll } = require('./db');
  const stats = queryAll(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'free' THEN 1 ELSE 0 END) as free,
      SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM parking_spaces
  `);
  res.json(stats[0] || {});
});

// Sensor update webhook (for real sensors)
app.post('/api/sensor', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== (process.env.SENSOR_API_KEY || 'sensor-key-2024')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { space_id, event, plate } = req.body;
  if (!space_id || !event) return res.status(400).json({ error: 'Missing fields' });

  const { run, queryAll } = require('./db');
  const spaces = queryAll('SELECT * FROM parking_spaces WHERE id = ?', [space_id]);
  if (!spaces.length) return res.status(404).json({ error: 'Space not found' });

  const now = new Date().toISOString();
  const newStatus = event === 'arrival' ? 'occupied' : 'free';
  run(`UPDATE parking_spaces SET status = ?, current_plate = ?, last_update = ?,
    parked_since = ? WHERE id = ?`,
    [newStatus, plate || null, now, event === 'arrival' ? now : null, space_id]);

  io.emit('space_update', { id: space_id, status: newStatus, plate });
  res.json({ success: true });
});

// Socket.io auth
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('./middleware/auth');
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.user?.email}`);
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.user?.email}`));
});

async function main() {
  await initDB();
  console.log('Database ready');

  server.listen(PORT, () => {
    console.log(`\nSmart Campus Parking System`);
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`\nDemo accounts (password: demo123):`);
    console.log(`   Student:    student@uni.edu`);
    console.log(`   Security:   security@uni.edu`);
    console.log(`   Management: admin@uni.edu`);
    console.log(`\nStarting sensor simulator...`);
    startSimulator(io);
  });
}

main().catch(console.error);