const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const days = db.prepare(`
    SELECT sd.*, r.name as resident_name
    FROM sick_days sd
    JOIN residents r ON r.id = sd.resident_id
    WHERE sd.schedule_id = ?
    ORDER BY sd.date DESC
  `).all(req.params.scheduleId);
  res.json(days);
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { resident_id, schedule_id, date, notes } = req.body;
  if (!resident_id || !schedule_id || !date) return res.status(400).json({ error: 'Missing required fields' });

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule_id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const result = db.prepare(`
    INSERT INTO sick_days (resident_id, schedule_id, date, notes, flagged, resolved)
    VALUES (?, ?, ?, ?, 1, 0)
  `).run(resident_id, schedule_id, date, notes || null);

  res.status(201).json(db.prepare('SELECT * FROM sick_days WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const day = db.prepare(`
    SELECT sd.*, s.program_id FROM sick_days sd
    JOIN schedules s ON s.id = sd.schedule_id WHERE sd.id = ?
  `).get(req.params.id);
  if (!day) return res.status(404).json({ error: 'Not found' });
  if (day.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { notes, resolved } = req.body;
  db.prepare(`
    UPDATE sick_days SET notes = ?, resolved = ?, flagged = ? WHERE id = ?
  `).run(
    notes !== undefined ? notes : day.notes,
    resolved !== undefined ? (resolved ? 1 : 0) : day.resolved,
    resolved ? 0 : 1,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM sick_days WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const day = db.prepare(`
    SELECT sd.*, s.program_id FROM sick_days sd
    JOIN schedules s ON s.id = sd.schedule_id WHERE sd.id = ?
  `).get(req.params.id);
  if (!day) return res.status(404).json({ error: 'Not found' });
  if (day.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM sick_days WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
