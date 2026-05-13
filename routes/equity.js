const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const [{ rows: residents }, { rows: assignments }, { rows: rotations }] = await Promise.all([
      pool.query('SELECT * FROM residents WHERE program_id = $1 ORDER BY pgy_year, name', [schedule.program_id]),
      pool.query(
        `SELECT a.resident_id, a.block_number, rot.name as rotation_name,
                rot.night_float, rot.weekly_hours, rot.required_blocks
         FROM assignments a
         LEFT JOIN rotations rot ON rot.id = a.rotation_id
         WHERE a.schedule_id = $1 AND a.rotation_id IS NOT NULL`,
        [req.params.scheduleId]
      ),
      pool.query('SELECT * FROM rotations WHERE program_id = $1 AND required_blocks > 0', [schedule.program_id]),
    ]);

    const stats = residents.map(r => {
      const ra = assignments.filter(a => a.resident_id === r.id);
      const totalBlocks = ra.length;
      const nightBlocks = ra.filter(a => a.night_float).length;
      const estimatedHours = ra.reduce((sum, a) => sum + (a.weekly_hours || 0), 0);

      const rotationCounts = {};
      for (const a of ra) {
        if (a.rotation_name) rotationCounts[a.rotation_name] = (rotationCounts[a.rotation_name] || 0) + 1;
      }

      const requirements = rotations.map(rot => ({
        rotationName: rot.name,
        required: rot.required_blocks,
        completed: rotationCounts[rot.name] || 0,
      }));

      return { resident: r, totalBlocks, nightBlocks, estimatedHours, rotationCounts, requirements };
    });

    const n = stats.length || 1;
    const avgBlocks = stats.reduce((s, x) => s + x.totalBlocks, 0) / n;
    const avgNight = stats.reduce((s, x) => s + x.nightBlocks, 0) / n;

    res.json({ stats, avgBlocks, avgNight });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
