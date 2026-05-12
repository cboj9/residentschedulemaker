const express = require('express');
const { getDb, transaction } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const swaps = db.prepare(`
    SELECT ss.*,
      ra.name as resident_a_name, rb.name as resident_b_name,
      ra.pgy_year as pgy_a, rb.pgy_year as pgy_b,
      rot_a.name as rotation_a, rot_b.name as rotation_b
    FROM shift_swaps ss
    JOIN residents ra ON ra.id = ss.resident_a_id
    JOIN residents rb ON rb.id = ss.resident_b_id
    LEFT JOIN assignments asn_a ON asn_a.schedule_id = ss.schedule_id
      AND asn_a.resident_id = ss.resident_a_id AND asn_a.block_number = ss.block_number
    LEFT JOIN rotations rot_a ON rot_a.id = asn_a.rotation_id
    LEFT JOIN assignments asn_b ON asn_b.schedule_id = ss.schedule_id
      AND asn_b.resident_id = ss.resident_b_id AND asn_b.block_number = ss.block_number
    LEFT JOIN rotations rot_b ON rot_b.id = asn_b.rotation_id
    WHERE ss.schedule_id = ?
    ORDER BY ss.created_at DESC
  `).all(req.params.scheduleId);

  res.json(swaps);
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { schedule_id, block_number, resident_a_id, resident_b_id, notes } = req.body;
  if (!schedule_id || !block_number || !resident_a_id || !resident_b_id) {
    return res.status(400).json({ error: 'schedule_id, block_number, resident_a_id, and resident_b_id are required' });
  }
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule_id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const result = db.prepare(`
    INSERT INTO shift_swaps (schedule_id, block_number, resident_a_id, resident_b_id, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(schedule_id, block_number, resident_a_id, resident_b_id, notes || null);

  res.status(201).json(db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(req.params.id);
  if (!swap) return res.status(404).json({ error: 'Not found' });
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(swap.schedule_id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { status } = req.body;

  if (status === 'approved' && swap.status === 'pending') {
    try {
      transaction(db, () => {
        const asnA = db.prepare(
          'SELECT * FROM assignments WHERE schedule_id = ? AND resident_id = ? AND block_number = ?'
        ).get(swap.schedule_id, swap.resident_a_id, swap.block_number);
        const asnB = db.prepare(
          'SELECT * FROM assignments WHERE schedule_id = ? AND resident_id = ? AND block_number = ?'
        ).get(swap.schedule_id, swap.resident_b_id, swap.block_number);

        if (!asnA || !asnB) throw new Error('One or both assignments not found for this block');

        const rotA = asnA.rotation_id ? db.prepare('SELECT name FROM rotations WHERE id = ?').get(asnA.rotation_id)?.name : 'PTO';
        const rotB = asnB.rotation_id ? db.prepare('SELECT name FROM rotations WHERE id = ?').get(asnB.rotation_id)?.name : 'PTO';
        const nameA = db.prepare('SELECT name FROM residents WHERE id = ?').get(swap.resident_a_id)?.name;
        const nameB = db.prepare('SELECT name FROM residents WHERE id = ?').get(swap.resident_b_id)?.name;

        db.prepare('UPDATE assignments SET rotation_id = ?, pto_weeks = ? WHERE id = ?')
          .run(asnB.rotation_id, asnB.pto_weeks, asnA.id);
        db.prepare('UPDATE assignments SET rotation_id = ?, pto_weeks = ? WHERE id = ?')
          .run(asnA.rotation_id, asnA.pto_weeks, asnB.id);

        db.prepare(`
          INSERT INTO schedule_change_log (schedule_id, change_type, block_number, old_value, new_value)
          VALUES (?, 'swap_approved', ?, ?, ?)
        `).run(swap.schedule_id, swap.block_number,
          `${nameA}: ${rotA}  ↔  ${nameB}: ${rotB}`,
          'Swap approved and applied');

        db.prepare('UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(swap.schedule_id);
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  db.prepare('UPDATE shift_swaps SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(req.params.id);
  if (!swap) return res.status(404).json({ error: 'Not found' });
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(swap.schedule_id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM shift_swaps WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
