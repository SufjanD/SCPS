const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryAll } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const users = queryAll('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  const user = users[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, university_id: user.university_id },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, university_id: user.university_id }
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const users = queryAll('SELECT id, email, name, role, university_id FROM users WHERE id = ?', [req.user.id]);
  res.json(users[0] || null);
});

module.exports = router;
