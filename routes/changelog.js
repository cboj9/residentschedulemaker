const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT cl.*, r.name as resident_name
       FROM schedule_change_log cl
       LEFT JOIN residents r ON r.id = cl.resident_id
       WHERE cl.schedule_id = $1
       ORDER BY cl.created_at DESC
       LIMIT 200`,
      [req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
