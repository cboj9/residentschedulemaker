const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT ep.*, r.name as resident_name, r.pgy_year, rot.name as rotation_name
       FROM elective_preferences ep
       JOIN residents r ON r.id = ep.resident_id
       JOIN rotations rot ON rot.id = ep.rotation_id
       WHERE ep.schedule_id = $1
       ORDER BY ep.resident_id, ep.rank`,
      [req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { resident_id, schedule_id, rotation_id, rank } = req.body;
    if (!resident_id || !schedule_id || !rotation_id || !rank) {
      return res.status(400).json({ error: 'resident_id, schedule_id, rotation_id, rank required' });
    }

    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [schedule_id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      `INSERT INTO elective_preferences (resident_id, schedule_id, rotation_id, rank)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(resident_id, schedule_id, rotation_id) DO UPDATE SET rank = EXCLUDED.rank`,
      [resident_id, schedule_id, rotation_id, rank]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [pref] } = await pool.query(
      `SELECT ep.*, s.program_id FROM elective_preferences ep
       JOIN schedules s ON s.id = ep.schedule_id WHERE ep.id = $1`,
      [req.params.id]
    );
    if (!pref) return res.status(404).json({ error: 'Not found' });
    if (pref.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM elective_preferences WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
