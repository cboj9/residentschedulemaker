const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT sd.*, r.name as resident_name
       FROM sick_days sd
       JOIN residents r ON r.id = sd.resident_id
       WHERE sd.schedule_id = $1
       ORDER BY sd.date DESC`,
      [req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { resident_id, schedule_id, date, notes } = req.body;
    if (!resident_id || !schedule_id || !date) return res.status(400).json({ error: 'Missing required fields' });

    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [schedule_id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `INSERT INTO sick_days (resident_id, schedule_id, date, notes, flagged, resolved)
       VALUES ($1, $2, $3, $4, 1, 0) RETURNING *`,
      [resident_id, schedule_id, date, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [day] } = await pool.query(
      `SELECT sd.*, s.program_id FROM sick_days sd
       JOIN schedules s ON s.id = sd.schedule_id WHERE sd.id = $1`,
      [req.params.id]
    );
    if (!day) return res.status(404).json({ error: 'Not found' });
    if (day.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { notes, resolved } = req.body;
    const { rows } = await pool.query(
      `UPDATE sick_days SET notes=$1, resolved=$2, flagged=$3 WHERE id=$4 RETURNING *`,
      [
        notes !== undefined ? notes : day.notes,
        resolved !== undefined ? (resolved ? 1 : 0) : day.resolved,
        resolved ? 0 : 1,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [day] } = await pool.query(
      `SELECT sd.*, s.program_id FROM sick_days sd
       JOIN schedules s ON s.id = sd.schedule_id WHERE sd.id = $1`,
      [req.params.id]
    );
    if (!day) return res.status(404).json({ error: 'Not found' });
    if (day.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM sick_days WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
