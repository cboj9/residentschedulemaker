const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb, transaction } = require('../db/schema');
const { requireAuth, signToken } = require('../middleware/auth');
const { sendPasswordReset } = require('../utils/email');

const router = express.Router();

router.get('/setup-needed', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  res.json({ setupNeeded: !user });
});

router.post('/setup', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) return res.status(400).json({ error: 'Setup already complete' });

  const { email, password, programName, blockLengthWeeks, totalBlocks, academicYearStart } = req.body;
  if (!email || !password || !programName || !academicYearStart) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const hash = bcrypt.hashSync(password, 10);

  let result;
  try {
    result = transaction(db, () => {
      const prog = db.prepare(`
        INSERT INTO programs (name, block_length_weeks, total_blocks, academic_year_start)
        VALUES (?, ?, ?, ?)
      `).run(programName, blockLengthWeeks || 4, totalBlocks || 13, academicYearStart);
      const usr = db.prepare(`
        INSERT INTO users (program_id, email, password_hash, role)
        VALUES (?, ?, ?, 'coordinator')
      `).run(prog.lastInsertRowid, email, hash);
      return { programId: prog.lastInsertRowid, userId: usr.lastInsertRowid };
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const token = signToken({ userId: result.userId, programId: Number(result.programId), role: 'coordinator' });
  res.json({ token, programId: Number(result.programId) });
});

router.post('/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({ userId: Number(user.id), programId: Number(user.program_id), role: user.role });
  res.json({ token, programId: Number(user.program_id) });
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, role, program_id FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

// POST /register — create a new program + coordinator (always available, unlike /setup)
router.post('/register', (req, res) => {
  const db = getDb();
  const { email, password, programName, blockLengthWeeks, totalBlocks, academicYearStart } = req.body;
  if (!email || !password || !programName || !academicYearStart) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  let result;
  try {
    result = transaction(db, () => {
      const prog = db.prepare(`
        INSERT INTO programs (name, block_length_weeks, total_blocks, academic_year_start)
        VALUES (?, ?, ?, ?)
      `).run(programName, blockLengthWeeks || 4, totalBlocks || 13, academicYearStart);
      const usr = db.prepare(`
        INSERT INTO users (program_id, email, password_hash, role)
        VALUES (?, ?, ?, 'coordinator')
      `).run(prog.lastInsertRowid, email, hash);
      return { programId: prog.lastInsertRowid, userId: usr.lastInsertRowid };
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const token = signToken({ userId: Number(result.userId), programId: Number(result.programId), role: 'coordinator' });
  res.json({ token, programId: Number(result.programId) });
});

// POST /forgot-password — generate a reset token and optionally email it
router.post('/forgot-password', async (req, res) => {
  const db = getDb();
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.json({ success: true, emailSent: false, message: 'If that email exists, a reset link has been sent.' });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const resetLink = `${baseUrl}/?reset=${token}`;

  let emailSent = false;
  try { emailSent = await sendPasswordReset(email, resetLink); } catch {}

  res.json({
    success: true,
    emailSent,
    resetLink: emailSent ? null : resetLink,
  });
});

// POST /reset-password — validate token and set new password
router.post('/reset-password', (req, res) => {
  const db = getDb();
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const resetToken = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!resetToken) return res.status(400).json({ error: 'Invalid or already-used reset link' });
  if (new Date(resetToken.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This reset link has expired. Please request a new one.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, resetToken.user_id);
      db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(resetToken.id);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ success: true });
});

// Switch active program context — returns a new JWT scoped to a different program
router.post('/switch-program', requireAuth, (req, res) => {
  const db = getDb();
  const { programId } = req.body;
  if (!programId) return res.status(400).json({ error: 'programId required' });
  const program = db.prepare('SELECT id FROM programs WHERE id = ?').get(programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  const token = signToken({ userId: req.user.userId, programId: Number(programId), role: req.user.role });
  res.json({ token, programId: Number(programId) });
});

module.exports = router;
