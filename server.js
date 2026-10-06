// server.js - Express app, auth middleware and API routes
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const CATEGORIES = ['Hostel', 'Academics', 'Canteen', 'Infrastructure', 'Other'];
const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected'];

app.use(express.json());
app.use(express.static('public')); // serve ./public

// ---------- middleware ----------
// Verify JWT token from Authorization: Bearer <token>
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    req.user = jwt.verify(token, SECRET); // { id, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Only admins may pass
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Only the owner of the resource may pass (used for /complaints/mine style checks)
function studentOnly(req, res, next) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required' });
  next();
}

// ---------- helpers ----------
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const sign = (user) => jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '1d' });

// ---------- auth routes ----------
app.post('/api/register', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name is required (min 2 chars)' });
  if (!email || !isEmail(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 chars' });
  if (role && role !== 'student') return res.status(400).json({ error: 'Only student registration allowed' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.toLowerCase(), hash, 'student');
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ user, token: sign(user) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });

  const safe = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: safe, token: sign(user) });
});

// ---------- complaint routes ----------
// Student: create a complaint
app.post('/api/complaints', auth, studentOnly, (req, res) => {
  const { title, category, description } = req.body || {};
  if (!title || title.trim().length < 4) return res.status(400).json({ error: 'Title must be at least 4 chars' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Category must be one of: ' + CATEGORIES.join(', ') });
  if (!description || description.trim().length < 10) return res.status(400).json({ error: 'Description must be at least 10 chars' });

  const info = db.prepare('INSERT INTO complaints (user_id, title, category, description) VALUES (?, ?, ?, ?)')
    .run(req.user.id, title.trim(), category, description.trim());
  const row = db.prepare('SELECT * FROM complaints WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Student: list own complaints
app.get('/api/complaints/mine', auth, studentOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM complaints WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// Admin: list all complaints, optional filter ?status=Pending
app.get('/api/complaints', auth, adminOnly, (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !STATUSES.includes(status))
    return res.status(400).json({ error: 'status must be one of: ' + STATUSES.join(', ') });

  const sql = `SELECT c.*, u.name AS student_name, u.email AS student_email
               FROM complaints c JOIN users u ON u.id = c.user_id
               ${status ? 'WHERE c.status = ?' : ''}
               ORDER BY c.id DESC`;
  const rows = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
  res.json(rows);
});

// Admin: update status + admin_remark
app.patch('/api/complaints/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = db.prepare('SELECT id FROM complaints WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found' });

  const { status, admin_remark } = req.body || {};
  if (status === undefined && admin_remark === undefined)
    return res.status(400).json({ error: 'Provide status and/or admin_remark' });
  if (status !== undefined && !STATUSES.includes(status))
    return res.status(400).json({ error: 'status must be one of: ' + STATUSES.join(', ') });
  if (admin_remark !== undefined && typeof admin_remark !== 'string')
    return res.status(400).json({ error: 'admin_remark must be a string' });

  // Update only the fields provided (parameterized SQL)
  const fields = [];
  const values = [];
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (admin_remark !== undefined) { fields.push('admin_remark = ?'); values.push(admin_remark.trim()); }
  values.push(id);

  db.prepare(`UPDATE complaints SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare('SELECT * FROM complaints WHERE id = ?').get(id));
});

// error handler (keeps crashes quiet and returns JSON)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
