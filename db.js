// db.js - SQLite setup, tables and seed data
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Create ./data folder if missing, then open the DB file
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL'); // safer concurrent writes

// Tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin'))
);
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  admin_remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  student_name TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Migration: add columns to an existing db (only when missing)
const complaintCols = db.prepare('PRAGMA table_info(complaints)').all().map(c => c.name);
if (!complaintCols.includes('is_anonymous'))
  db.exec('ALTER TABLE complaints ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0');
if (!complaintCols.includes('student_name'))
  db.exec('ALTER TABLE complaints ADD COLUMN student_name TEXT');

// Backfill: store the student's name on every existing row (idempotent)
db.prepare(`UPDATE complaints SET student_name =
  (SELECT u.name FROM users u WHERE u.id = complaints.user_id)
  WHERE student_name IS NULL`).run();

// Seed one admin on first start (only if it does not exist)
const adminEmail = 'admin@campus.com';
const hasAdmin = db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail);
if (!hasAdmin) {
  const hash = bcrypt.hashSync('Admin@123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Campus Admin', adminEmail, hash, 'admin');
  console.log('Seeded admin account: ' + adminEmail);
}

module.exports = db;
