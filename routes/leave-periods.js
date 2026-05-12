const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/resident/:residentId/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.residentId);
  if (!resident || resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const periods = db.prepare(
    'SELECT * FROM resident_leave_periods WHERE resident_id = ? AND schedule_id = ? ORDER BY start_block'
  ).all(req.params.residentId, req.params.scheduleId);
  res.json(periods);
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { resident_id, schedule_id, start_block, end_block, reason } = req.body;
  if (!resident_id || !schedule_id || start_block == null || end_block == null) {
    return res.status(400).json({ error: 'resident_id, schedule_id, start_block, end_block required' });
  }
  if (start_block > end_block) return res.status(400).json({ error: 'start_block must be <= end_block' });

  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(resident_id);
  if (!resident || resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const result = db.prepare(
    'INSERT INTO resident_leave_periods (resident_id, schedule_id, start_block, end_block, reason) VALUES (?, ?, ?, ?, ?)'
  ).run(resident_id, schedule_id, start_block, end_block, reason || null);

  res.status(201).json(db.prepare('SELECT * FROM resident_leave_periods WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const period = db.prepare(`
    SELECT lp.*, r.program_id FROM resident_leave_periods lp
    JOIN residents r ON r.id = lp.resident_id WHERE lp.id = ?
  `).get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Not found' });
  if (period.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM resident_leave_periods WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
