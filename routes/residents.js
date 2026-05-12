const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/program/:programId', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const residents = db.prepare('SELECT * FROM residents WHERE program_id = ? ORDER BY pgy_year, name').all(req.params.programId);
  res.json(residents);
});

router.post('/program/:programId', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const { name, email, pgy_year, pto_weeks_allotted } = req.body;
  if (!name || !pgy_year) return res.status(400).json({ error: 'Name and PGY year required' });

  const result = db.prepare(`
    INSERT INTO residents (program_id, name, email, pgy_year, pto_weeks_allotted)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.programId, name, email || null, pgy_year, pto_weeks_allotted || 3);

  res.status(201).json(db.prepare('SELECT * FROM residents WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!resident) return res.status(404).json({ error: 'Not found' });
  if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { name, email, pgy_year, pto_weeks_allotted } = req.body;
  db.prepare(`
    UPDATE residents SET name = ?, email = ?, pgy_year = ?, pto_weeks_allotted = ? WHERE id = ?
  `).run(
    name || resident.name,
    email !== undefined ? email : resident.email,
    pgy_year || resident.pgy_year,
    pto_weeks_allotted !== undefined ? pto_weeks_allotted : resident.pto_weeks_allotted,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!resident) return res.status(404).json({ error: 'Not found' });
  if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM residents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Generate invite token for resident PTO submission
router.post('/:id/invite', requireAuth, (req, res) => {
  const db = getDb();
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!resident) return res.status(404).json({ error: 'Not found' });
  if (resident.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  db.prepare(`
    INSERT INTO invite_tokens (resident_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(resident.id, token, expiresAt);

  res.json({ token, link: `/pto-submit?token=${token}` });
});

// Bulk import: accepts parsed CSV rows as JSON
router.post('/program/:programId/import', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records array required' });

  const inserted = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const name = String(r.name || '').trim();
    const pgyYear = parseInt(r.pgy_year);
    if (!name) { errors.push({ row: i + 1, error: 'Name required' }); continue; }
    if (!pgyYear || pgyYear < 1 || pgyYear > 10) { errors.push({ row: i + 1, error: 'Invalid pgy_year' }); continue; }
    try {
      const result = db.prepare(
        'INSERT INTO residents (program_id, name, email, pgy_year, pto_weeks_allotted) VALUES (?, ?, ?, ?, ?)'
      ).run(
        req.params.programId, name,
        r.email ? String(r.email).trim() || null : null,
        pgyYear,
        parseInt(r.pto_weeks_allotted) || 3
      );
      inserted.push(result.lastInsertRowid);
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }

  res.json({ inserted: inserted.length, errors });
});

// Public: validate invite token
router.get('/invite/:token', (req, res) => {
  const db = getDb();
  const invite = db.prepare(`
    SELECT it.*, r.name, r.pgy_year, r.pto_weeks_allotted, r.program_id,
           p.name as program_name, p.block_length_weeks, p.total_blocks, p.academic_year_start
    FROM invite_tokens it
    JOIN residents r ON r.id = it.resident_id
    JOIN programs p ON p.id = r.program_id
    WHERE it.token = ?
  `).get(req.params.token);

  if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite link has expired' });
  }

  res.json({
    residentId: invite.resident_id,
    programId: invite.program_id,
    residentName: invite.name,
    pgyYear: invite.pgy_year,
    ptoWeeksAllotted: invite.pto_weeks_allotted,
    programName: invite.program_name,
    blockLengthWeeks: invite.block_length_weeks,
    totalBlocks: invite.total_blocks,
    academicYearStart: invite.academic_year_start
  });
});

module.exports = router;
