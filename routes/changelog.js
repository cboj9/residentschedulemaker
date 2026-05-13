const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const entries = db.prepare(`
    SELECT cl.*, r.name as resident_name
    FROM schedule_change_log cl
    LEFT JOIN residents r ON r.id = cl.resident_id
    WHERE cl.schedule_id = ?
    ORDER BY cl.created_at DESC
    LIMIT 200
  `).all(req.params.scheduleId);

  res.json(entries);
});

module.exports = router;
