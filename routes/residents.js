const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/program/:programId', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      'SELECT * FROM residents WHERE program_id = $1 ORDER BY pgy_year, name',
      [req.params.programId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/program/:programId', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    const { name, email, pgy_year, pto_weeks_allotted } = req.body;
    if (!name || !pgy_year) return res.status(400).json({ error: 'Name and PGY year required' });

    const { rows } = await pool.query(
      `INSERT INTO residents (program_id, name, email, pgy_year, pto_weeks_allotted)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.programId, name, email || null, pgy_year, pto_weeks_allotted || 3]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM residents WHERE id = $1', [req.params.id]);
    const resident = rows[0];
    if (!resident) return res.status(404).json({ error: 'Not found' });
    if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { name, email, pgy_year, pto_weeks_allotted } = req.body;
    const { rows: updated } = await pool.query(
      `UPDATE residents SET name=$1, email=$2, pgy_year=$3, pto_weeks_allotted=$4 WHERE id=$5 RETURNING *`,
      [
        name || resident.name,
        email !== undefined ? email : resident.email,
        pgy_year || resident.pgy_year,
        pto_weeks_allotted !== undefined ? pto_weeks_allotted : resident.pto_weeks_allotted,
        req.params.id,
      ]
    );
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM residents WHERE id = $1', [req.params.id]);
    const resident = rows[0];
    if (!resident) return res.status(404).json({ error: 'Not found' });
    if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM residents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/invite', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM residents WHERE id = $1', [req.params.id]);
    const resident = rows[0];
    if (!resident) return res.status(404).json({ error: 'Not found' });
    if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const token = uuidv4();
    const expiresAt = req.body.expiresAt
      ? new Date(req.body.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO invite_tokens (resident_id, token, expires_at) VALUES ($1, $2, $3)',
      [resident.id, token, expiresAt]
    );

    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    res.json({ token, inviteUrl: `${baseUrl}/?invite=${token}`, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
