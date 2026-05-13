const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/resident/:residentId/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [resident] } = await pool.query('SELECT * FROM residents WHERE id = $1', [req.params.residentId]);
    if (!resident || resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      'SELECT * FROM resident_leave_periods WHERE resident_id = $1 AND schedule_id = $2 ORDER BY start_block',
      [req.params.residentId, req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { resident_id, schedule_id, start_block, end_block, reason } = req.body;
    if (!resident_id || !schedule_id || start_block == null || end_block == null) {
      return res.status(400).json({ error: 'resident_id, schedule_id, start_block, end_block required' });
    }
    if (start_block > end_block) return res.status(400).json({ error: 'start_block must be <= end_block' });

    const { rows: [resident] } = await pool.query('SELECT * FROM residents WHERE id = $1', [resident_id]);
    if (!resident || resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      'INSERT INTO resident_leave_periods (resident_id, schedule_id, start_block, end_block, reason) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [resident_id, schedule_id, start_block, end_block, reason || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [period] } = await pool.query(
      `SELECT lp.*, r.program_id FROM resident_leave_periods lp
       JOIN residents r ON r.id = lp.resident_id WHERE lp.id = $1`,
      [req.params.id]
    );
    if (!period) return res.status(404).json({ error: 'Not found' });
    if (period.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM resident_leave_periods WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
