const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, queryAll, runSql, genId, saveDatabase } = require('../database');
const { verifyToken, requireRole, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, msg: 'Email and password are required.' });
  }

  const user = queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  if (!user) {
    return res.status(401).json({ ok: false, msg: 'Invalid email or password.' });
  }

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) {
    return res.status(401).json({ ok: false, msg: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    ok: true,
    msg: 'Login successful!',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      rawPassword: user.role === 'admin' ? user.rawPassword : undefined
    }
  });
});

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, msg: 'Name, email, and password are required.' });
  }

  const userRole = role === 'admin' ? 'admin' : 'student';

  const existing = queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  if (existing) {
    return res.status(400).json({ ok: false, msg: 'An account with this email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = genId('user');
  const createdAt = new Date().toISOString();

  runSql('INSERT INTO users (id, name, email, password, rawPassword, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    userId,
    name.trim(),
    email.trim().toLowerCase(),
    hashedPassword,
    password,
    userRole,
    createdAt
  ]);
  saveDatabase();

  const token = jwt.sign(
    { id: userId, name: name.trim(), email: email.trim().toLowerCase(), role: userRole },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    ok: true,
    msg: 'Registration successful!',
    token,
    user: { id: userId, name: name.trim(), email: email.trim().toLowerCase(), role: userRole }
  });
});

router.get('/me', verifyToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

router.put('/me/password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, msg: 'Current password and new password are required.' });
  }

  const user = queryOne('SELECT password FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(404).json({ ok: false, msg: 'User not found.' });
  }

  const matches = await bcrypt.compare(currentPassword, user.password);
  if (!matches) {
    return res.status(400).json({ ok: false, msg: 'Incorrect current password.' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  runSql('UPDATE users SET password = ?, rawPassword = ? WHERE id = ?', [hashed, newPassword, req.user.id]);
  saveDatabase();

  res.json({ ok: true, msg: 'Password updated successfully!' });
});

router.post('/users', verifyToken, requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, msg: 'Name, email, and password are required.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ ok: false, msg: 'Password must be at least 4 characters.' });
  }

  const existing = queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  if (existing) {
    return res.status(400).json({ ok: false, msg: 'An account with this email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = genId('user');
  const createdAt = new Date().toISOString();

  runSql('INSERT INTO users (id, name, email, password, rawPassword, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    userId,
    name.trim(),
    email.trim().toLowerCase(),
    hashedPassword,
    password,
    'student',
    createdAt
  ]);
  saveDatabase();

  res.json({ ok: true, msg: 'Student account created successfully!', userId });
});

router.get('/users', verifyToken, requireRole('admin'), (req, res) => {
  const users = queryAll(`
    SELECT u.*,
           (SELECT COUNT(*) FROM results r WHERE r.userId = u.id) as quizzesAttempted
    FROM users u
    ORDER BY u.createdAt DESC
  `);

  const formattedUsers = users.map(u => ({
    ...u,
    quizzesAttempted: u.quizzesAttempted || 0,
    quizAttempts: u.quizzesAttempted || 0,
    registeredOn: u.createdAt,
    password: u.rawPassword || u.password
  }));

  res.json({ ok: true, users: formattedUsers });
});

router.put('/users/:id/password', verifyToken, requireRole('admin'), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ ok: false, msg: 'New password is required.' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  const result = runSql('UPDATE users SET password = ?, rawPassword = ? WHERE id = ?', [hashed, newPassword, req.params.id]);
  saveDatabase();

  if (result.changes === 0) {
    return res.status(404).json({ ok: false, msg: 'Student account not found.' });
  }

  res.json({ ok: true, msg: 'Student password reset successfully!' });
});

module.exports = router;
