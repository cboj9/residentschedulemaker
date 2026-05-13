const express = require('express');
const { pool, transaction } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT pr.*, r.name as resident_name, r.pgy_year
       FROM pto_requests pr
       JOIN residents r ON r.id = pr.resident_id
       WHERE pr.schedule_id = $1
       ORDER BY pr.week_number, r.name`,
      [req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const { token, scheduleId, weekNumbers, notes } = req.body;
    if (!token || !scheduleId || !Array.isArray(weekNumbers)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { rows: [invite] } = await pool.query(
      `SELECT it.*, r.pto_weeks_allotted, r.program_id, r.id as res_id
       FROM invite_tokens it
       JOIN residents r ON r.id = it.resident_id
       WHERE it.token = $1`,
      [token]
    );

    if (!invite) return res.status(403).json({ error: 'Invalid token' });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Token expired' });
    }

    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [scheduleId]);
    if (!schedule || schedule.program_id !== invite.program_id) {
      return res.status(403).json({ error: 'Invalid schedule' });
    }
    if (schedule.status === 'published') {
      return res.status(400).json({ error: 'Schedule is already published' });
    }
    if (weekNumbers.length > invite.pto_weeks_allotted) {
      return res.status(400).json({ error: `Cannot request more than ${invite.pto_weeks_allotted} PTO weeks` });
    }

    await transaction(async (client) => {
      await client.query(
        `DELETE FROM pto_requests WHERE resident_id = $1 AND schedule_id = $2 AND status = 'pending'`,
        [invite.res_id, scheduleId]
      );
      for (const wk of weekNumbers) {
        await client.query(
          `INSERT INTO pto_requests (resident_id, schedule_id, week_number, notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(resident_id, schedule_id, week_number) DO UPDATE SET notes = EXCLUDED.notes`,
          [invite.res_id, scheduleId, wk, notes || null]
        );
      }
    });

    res.json({ success: true, weeksRequested: weekNumbers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [request] } = await pool.query(
      `SELECT pr.*, s.program_id FROM pto_requests pr
       JOIN schedules s ON s.id = pr.schedule_id WHERE pr.id = $1`,
      [req.params.id]
    );
    if (!request) return res.status(404).json({ error: 'Not found' });
    if (request.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { status, notes } = req.body;
    if (!['pending', 'approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { rows } = await pool.query(
      'UPDATE pto_requests SET status = $1, notes = $2 WHERE id = $3 RETURNING *',
      [status, notes || request.notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [request] } = await pool.query(
      `SELECT pr.*, s.program_id FROM pto_requests pr
       JOIN schedules s ON s.id = pr.schedule_id WHERE pr.id = $1`,
      [req.params.id]
    );
    if (!request) return res.status(404).json({ error: 'Not found' });
    if (request.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM pto_requests WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/resident/:residentId', requireAuth, async (req, res) => {
  try {
    const { rows: [resident] } = await pool.query('SELECT * FROM residents WHERE id = $1', [req.params.residentId]);
    if (!resident) return res.status(404).json({ error: 'Not found' });
    if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT pr.*, s.name as schedule_name, s.academic_year
       FROM pto_requests pr
       JOIN schedules s ON s.id = pr.schedule_id
       WHERE pr.resident_id = $1
       ORDER BY s.academic_year DESC, pr.week_number`,
      [req.params.residentId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', requireAuth, async (req, res) => {
  try {
    const { resident_id, schedule_id, week_numbers, notes } = req.body;
    if (!resident_id || !schedule_id || !Array.isArray(week_numbers) || week_numbers.length === 0) {
      return res.status(400).json({ error: 'resident_id, schedule_id, and week_numbers required' });
    }
    const { rows: [resident] } = await pool.query('SELECT * FROM residents WHERE id = $1', [resident_id]);
    if (!resident || resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [schedule_id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    for (const wk of week_numbers) {
      await pool.query(
        `INSERT INTO pto_requests (resident_id, schedule_id, week_number, status, notes)
         VALUES ($1, $2, $3, 'approved', $4)
         ON CONFLICT(resident_id, schedule_id, week_number) DO UPDATE SET status = 'approved', notes = EXCLUDED.notes`,
        [resident_id, schedule_id, wk, notes || null]
      );
    }
    res.json({ success: true, weeksAdded: week_numbers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
