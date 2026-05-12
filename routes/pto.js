const express = require('express');
const { getDb, transaction } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const requests = db.prepare(`
    SELECT pr.*, r.name as resident_name, r.pgy_year
    FROM pto_requests pr
    JOIN residents r ON r.id = pr.resident_id
    WHERE pr.schedule_id = ?
    ORDER BY pr.week_number, r.name
  `).all(req.params.scheduleId);
  res.json(requests);
});

router.post('/submit', (req, res) => {
  const db = getDb();
  const { token, scheduleId, weekNumbers, notes } = req.body;
  if (!token || !scheduleId || !Array.isArray(weekNumbers)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const invite = db.prepare(`
    SELECT it.*, r.pto_weeks_allotted, r.program_id, r.id as res_id
    FROM invite_tokens it
    JOIN residents r ON r.id = it.resident_id
    WHERE it.token = ?
  `).get(token);

  if (!invite) return res.status(403).json({ error: 'Invalid token' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Token expired' });
  }

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule || schedule.program_id !== invite.program_id) {
    return res.status(403).json({ error: 'Invalid schedule' });
  }
  if (schedule.status === 'published') {
    return res.status(400).json({ error: 'Schedule is already published' });
  }
  if (weekNumbers.length > invite.pto_weeks_allotted) {
    return res.status(400).json({ error: `Cannot request more than ${invite.pto_weeks_allotted} PTO weeks` });
  }

  try {
    transaction(db, () => {
      db.prepare(`
        DELETE FROM pto_requests WHERE resident_id = ? AND schedule_id = ? AND status = 'pending'
      `).run(invite.res_id, scheduleId);

      const upsert = db.prepare(`
        INSERT INTO pto_requests (resident_id, schedule_id, week_number, notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(resident_id, schedule_id, week_number) DO UPDATE SET notes = excluded.notes
      `);
      for (const wk of weekNumbers) {
        upsert.run(invite.res_id, scheduleId, wk, notes || null);
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ success: true, weeksRequested: weekNumbers.length });
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const request = db.prepare(`
    SELECT pr.*, s.program_id FROM pto_requests pr
    JOIN schedules s ON s.id = pr.schedule_id WHERE pr.id = ?
  `).get(req.params.id);

  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { status, notes } = req.body;
  if (!['pending', 'approved', 'denied'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE pto_requests SET status = ?, notes = ? WHERE id = ?').run(status, notes || request.notes, req.params.id);
  res.json(db.prepare('SELECT * FROM pto_requests WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const request = db.prepare(`
    SELECT pr.*, s.program_id FROM pto_requests pr
    JOIN schedules s ON s.id = pr.schedule_id WHERE pr.id = ?
  `).get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM pto_requests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin: list all PTO requests for a specific resident
router.get('/resident/:residentId', requireAuth, (req, res) => {
  const db = getDb();
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.residentId);
  if (!resident) return res.status(404).json({ error: 'Not found' });
  if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const requests = db.prepare(`
    SELECT pr.*, s.name as schedule_name, s.academic_year
    FROM pto_requests pr
    JOIN schedules s ON s.id = pr.schedule_id
    WHERE pr.resident_id = ?
    ORDER BY s.academic_year DESC, pr.week_number
  `).all(req.params.residentId);
  res.json(requests);
});

// Admin: create PTO requests on behalf of a resident (auto-approved)
router.post('/admin', requireAuth, (req, res) => {
  const db = getDb();
  const { resident_id, schedule_id, week_numbers, notes } = req.body;
  if (!resident_id || !schedule_id || !Array.isArray(week_numbers) || week_numbers.length === 0) {
    return res.status(400).json({ error: 'resident_id, schedule_id, and week_numbers required' });
  }
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(resident_id);
  if (!resident || resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule_id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  try {
    const upsert = db.prepare(`
      INSERT INTO pto_requests (resident_id, schedule_id, week_number, status, notes)
      VALUES (?, ?, ?, 'approved', ?)
      ON CONFLICT(resident_id, schedule_id, week_number) DO UPDATE SET status = 'approved', notes = excluded.notes
    `);
    for (const wk of week_numbers) upsert.run(resident_id, schedule_id, wk, notes || null);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  res.json({ success: true, weeksAdded: week_numbers.length });
});

module.exports = router;
