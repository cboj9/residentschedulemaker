const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT ja.*, r.name as resident_name, r.pgy_year
       FROM jeopardy_assignments ja
       JOIN residents r ON r.id = ja.resident_id
       WHERE ja.schedule_id = $1
       ORDER BY ja.block_number`,
      [req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/schedule/:scheduleId/block/:blockNumber', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { resident_id, notes } = req.body;

    if (!resident_id) {
      await pool.query(
        'DELETE FROM jeopardy_assignments WHERE schedule_id = $1 AND block_number = $2',
        [req.params.scheduleId, req.params.blockNumber]
      );
      return res.json({ cleared: true });
    }

    await pool.query(
      `INSERT INTO jeopardy_assignments (schedule_id, block_number, resident_id, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(schedule_id, block_number) DO UPDATE SET resident_id = EXCLUDED.resident_id, notes = EXCLUDED.notes`,
      [req.params.scheduleId, req.params.blockNumber, resident_id, notes || null]
    );

    const { rows: [result] } = await pool.query(
      `SELECT ja.*, r.name as resident_name, r.pgy_year
       FROM jeopardy_assignments ja JOIN residents r ON r.id = ja.resident_id
       WHERE ja.schedule_id = $1 AND ja.block_number = $2`,
      [req.params.scheduleId, req.params.blockNumber]
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
