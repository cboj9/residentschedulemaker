const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const rows = db.prepare(`
    SELECT ja.*, r.name as resident_name, r.pgy_year
    FROM jeopardy_assignments ja
    JOIN residents r ON r.id = ja.resident_id
    WHERE ja.schedule_id = ?
    ORDER BY ja.block_number
  `).all(req.params.scheduleId);

  res.json(rows);
});

router.put('/schedule/:scheduleId/block/:blockNumber', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { resident_id, notes } = req.body;

  if (!resident_id) {
    db.prepare('DELETE FROM jeopardy_assignments WHERE schedule_id = ? AND block_number = ?')
      .run(req.params.scheduleId, req.params.blockNumber);
    return res.json({ cleared: true });
  }

  db.prepare(`
    INSERT INTO jeopardy_assignments (schedule_id, block_number, resident_id, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(schedule_id, block_number) DO UPDATE SET resident_id = excluded.resident_id, notes = excluded.notes
  `).run(req.params.scheduleId, req.params.blockNumber, resident_id, notes || null);

  const result = db.prepare(`
    SELECT ja.*, r.name as resident_name, r.pgy_year
    FROM jeopardy_assignments ja JOIN residents r ON r.id = ja.resident_id
    WHERE ja.schedule_id = ? AND ja.block_number = ?
  `).get(req.params.scheduleId, req.params.blockNumber);

  res.json(result);
});

module.exports = router;
