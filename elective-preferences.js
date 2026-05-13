const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const prefs = db.prepare(`
    SELECT ep.*, r.name as resident_name, r.pgy_year, rot.name as rotation_name
    FROM elective_preferences ep
    JOIN residents r ON r.id = ep.resident_id
    JOIN rotations rot ON rot.id = ep.rotation_id
    WHERE ep.schedule_id = ?
    ORDER BY ep.resident_id, ep.rank
  `).all(req.params.scheduleId);
  res.json(prefs);
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { resident_id, schedule_id, rotation_id, rank } = req.body;
  if (!resident_id || !schedule_id || !rotation_id || !rank) {
    return res.status(400).json({ error: 'resident_id, schedule_id, rotation_id, rank required' });
  }

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule_id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`
    INSERT INTO elective_preferences (resident_id, schedule_id, rotation_id, rank)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(resident_id, schedule_id, rotation_id) DO UPDATE SET rank = excluded.rank
  `).run(resident_id, schedule_id, rotation_id, rank);

  res.status(201).json({ success: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const pref = db.prepare(`
    SELECT ep.*, s.program_id FROM elective_preferences ep
    JOIN schedules s ON s.id = ep.schedule_id WHERE ep.id = ?
  `).get(req.params.id);
  if (!pref) return res.status(404).json({ error: 'Not found' });
  if (pref.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM elective_preferences WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
