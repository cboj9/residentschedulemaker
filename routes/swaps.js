const express = require('express');
const { pool, transaction } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT ss.*,
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
       WHERE ss.schedule_id = $1
       ORDER BY ss.created_at DESC`,
      [req.params.scheduleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { schedule_id, block_number, resident_a_id, resident_b_id, notes } = req.body;
    if (!schedule_id || !block_number || !resident_a_id || !resident_b_id) {
      return res.status(400).json({ error: 'schedule_id, block_number, resident_a_id, and resident_b_id are required' });
    }
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [schedule_id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `INSERT INTO shift_swaps (schedule_id, block_number, resident_a_id, resident_b_id, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [schedule_id, block_number, resident_a_id, resident_b_id, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [swap] } = await pool.query('SELECT * FROM shift_swaps WHERE id = $1', [req.params.id]);
    if (!swap) return res.status(404).json({ error: 'Not found' });
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [swap.schedule_id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { status } = req.body;

    if (status === 'approved' && swap.status === 'pending') {
      try {
        await transaction(async (client) => {
          const { rows: [asnA] } = await client.query(
            'SELECT * FROM assignments WHERE schedule_id = $1 AND resident_id = $2 AND block_number = $3',
            [swap.schedule_id, swap.resident_a_id, swap.block_number]
          );
          const { rows: [asnB] } = await client.query(
            'SELECT * FROM assignments WHERE schedule_id = $1 AND resident_id = $2 AND block_number = $3',
            [swap.schedule_id, swap.resident_b_id, swap.block_number]
          );
          if (!asnA || !asnB) throw new Error('One or both assignments not found for this block');

          const rotAName = asnA.rotation_id
            ? (await client.query('SELECT name FROM rotations WHERE id = $1', [asnA.rotation_id])).rows[0]?.name
            : 'PTO';
          const rotBName = asnB.rotation_id
            ? (await client.query('SELECT name FROM rotations WHERE id = $1', [asnB.rotation_id])).rows[0]?.name
            : 'PTO';
          const nameA = (await client.query('SELECT name FROM residents WHERE id = $1', [swap.resident_a_id])).rows[0]?.name;
          const nameB = (await client.query('SELECT name FROM residents WHERE id = $1', [swap.resident_b_id])).rows[0]?.name;

          await client.query('UPDATE assignments SET rotation_id = $1, pto_weeks = $2 WHERE id = $3', [asnB.rotation_id, asnB.pto_weeks, asnA.id]);
          await client.query('UPDATE assignments SET rotation_id = $1, pto_weeks = $2 WHERE id = $3', [asnA.rotation_id, asnA.pto_weeks, asnB.id]);

          await client.query(
            `INSERT INTO schedule_change_log (schedule_id, change_type, block_number, old_value, new_value)
             VALUES ($1, 'swap_approved', $2, $3, 'Swap approved and applied')`,
            [swap.schedule_id, swap.block_number, `${nameA}: ${rotAName}  ↔  ${nameB}: ${rotBName}`]
          );
          await client.query('UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [swap.schedule_id]);
        });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    await pool.query('UPDATE shift_swaps SET status = $1 WHERE id = $2', [status, req.params.id]);
    const { rows } = await pool.query('SELECT * FROM shift_swaps WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [swap] } = await pool.query('SELECT * FROM shift_swaps WHERE id = $1', [req.params.id]);
    if (!swap) return res.status(404).json({ error: 'Not found' });
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [swap.schedule_id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM shift_swaps WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
