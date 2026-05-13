const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, transaction } = require('../db/db');
const { requireAuth, signToken } = require('../middleware/auth');
const { sendPasswordReset } = require('../utils/email');

const router = express.Router();

router.get('/setup-needed', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
    res.json({ setupNeeded: rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/setup', async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT id FROM users LIMIT 1');
    if (existing.length > 0) return res.status(400).json({ error: 'Setup already complete' });

    const { email, password, programName, blockLengthWeeks, totalBlocks, academicYearStart } = req.body;
    if (!email || !password || !programName || !academicYearStart) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await transaction(async (client) => {
      const { rows: [prog] } = await client.query(
        `INSERT INTO programs (name, block_length_weeks, total_blocks, academic_year_start)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [programName, blockLengthWeeks || 4, totalBlocks || 13, academicYearStart]
      );
      const { rows: [usr] } = await client.query(
        `INSERT INTO users (program_id, email, password_hash, role) VALUES ($1, $2, $3, 'coordinator') RETURNING id`,
        [prog.id, email, hash]
      );
      return { programId: prog.id, userId: usr.id };
    });

    const token = signToken({ userId: result.userId, programId: Number(result.programId), role: 'coordinator' });
    res.json({ token, programId: Number(result.programId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ userId: Number(user.id), programId: Number(user.program_id), role: user.role });
    res.json({ token, programId: Number(user.program_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, program_id FROM users WHERE id = $1', [req.user.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, programName, blockLengthWeeks, totalBlocks, academicYearStart } = req.body;
    if (!email || !password || !programName || !academicYearStart) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(400).json({ error: 'An account with this email already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await transaction(async (client) => {
      const { rows: [prog] } = await client.query(
        `INSERT INTO programs (name, block_length_weeks, total_blocks, academic_year_start)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [programName, blockLengthWeeks || 4, totalBlocks || 13, academicYearStart]
      );
      const { rows: [usr] } = await client.query(
        `INSERT INTO users (program_id, email, password_hash, role) VALUES ($1, $2, $3, 'coordinator') RETURNING id`,
        [prog.id, email, hash]
      );
      return { programId: prog.id, userId: usr.id };
    });

    const token = signToken({ userId: Number(result.userId), programId: Number(result.programId), role: 'coordinator' });
    res.json({ token, programId: Number(result.programId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) {
      return res.json({ success: true, emailSent: false, message: 'If that email exists, a reset link has been sent.' });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetLink = `${baseUrl}/?reset=${token}`;

    let emailSent = false;
    try { emailSent = await sendPasswordReset(email, resetLink); } catch {}

    res.json({ success: true, emailSent, resetLink: emailSent ? null : resetLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { rows } = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used_at IS NULL',
      [token]
    );
    const resetToken = rows[0];
    if (!resetToken) return res.status(400).json({ error: 'Invalid or already-used reset link' });
    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    await transaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, resetToken.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [resetToken.id]);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/switch-program', requireAuth, async (req, res) => {
  try {
    const { programId } = req.body;
    if (!programId) return res.status(400).json({ error: 'programId required' });
    const { rows } = await pool.query('SELECT id FROM programs WHERE id = $1', [programId]);
    if (!rows[0]) return res.status(404).json({ error: 'Program not found' });
    const token = signToken({ userId: req.user.userId, programId: Number(programId), role: req.user.role });
    res.json({ token, programId: Number(programId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
