const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/academic-years', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT academic_year FROM schedules WHERE generated_at IS NOT NULL ORDER BY academic_year DESC"
    );
    res.json(rows.map(r => r.academic_year));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ss.*,
         (SELECT COUNT(*) FROM rotation_shared_service WHERE shared_service_id = ss.id) as rotation_count
       FROM shared_services ss
       ORDER BY ss.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description, soft_max } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'INSERT INTO shared_services (name, description, soft_max) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, soft_max || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [svc] } = await pool.query('SELECT * FROM shared_services WHERE id = $1', [req.params.id]);
    if (!svc) return res.status(404).json({ error: 'Not found' });
    const { name, description, soft_max } = req.body;
    const { rows } = await pool.query(
      'UPDATE shared_services SET name=$1, description=$2, soft_max=$3 WHERE id=$4 RETURNING *',
      [name ?? svc.name, description ?? svc.description, soft_max ?? svc.soft_max, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM shared_services WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM shared_services WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/rotations', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.type, r.program_id, p.name as program_name
       FROM rotation_shared_service rss
       JOIN rotations r ON r.id = rss.rotation_id
       JOIN programs p ON p.id = r.program_id
       WHERE rss.shared_service_id = $1
       ORDER BY p.name, r.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/available-rotations', requireAuth, async (req, res) => {
  try {
    const [{ rows: linkedRows }, { rows: all }] = await Promise.all([
      pool.query('SELECT rotation_id FROM rotation_shared_service WHERE shared_service_id = $1', [req.params.id]),
      pool.query(
        `SELECT r.id, r.name, r.type, r.program_id, p.name as program_name
         FROM rotations r
         JOIN programs p ON p.id = r.program_id
         ORDER BY p.name, r.name`
      ),
    ]);
    const linked = new Set(linkedRows.map(r => r.rotation_id));
    res.json(all.map(r => ({ ...r, linked: linked.has(r.id) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/rotations', requireAuth, async (req, res) => {
  try {
    const { rotation_id } = req.body;
    if (!rotation_id) return res.status(400).json({ error: 'rotation_id required' });
    const { rows: [svc] } = await pool.query('SELECT id FROM shared_services WHERE id = $1', [req.params.id]);
    if (!svc) return res.status(404).json({ error: 'Shared service not found' });
    const { rows: [rot] } = await pool.query('SELECT id FROM rotations WHERE id = $1', [rotation_id]);
    if (!rot) return res.status(404).json({ error: 'Rotation not found' });
    await pool.query(
      'INSERT INTO rotation_shared_service (rotation_id, shared_service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rotation_id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/rotations/:rotationId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM rotation_shared_service WHERE shared_service_id = $1 AND rotation_id = $2',
      [req.params.id, req.params.rotationId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/coverage', requireAuth, async (req, res) => {
  try {
    const { academic_year } = req.query;

    const { rows: [svc] } = await pool.query('SELECT * FROM shared_services WHERE id = $1', [req.params.id]);
    if (!svc) return res.status(404).json({ error: 'Not found' });

    const { rows: linkedRows } = await pool.query(
      'SELECT rotation_id FROM rotation_shared_service WHERE shared_service_id = $1',
      [req.params.id]
    );
    const linkedRotationIds = linkedRows.map(r => r.rotation_id);
    if (linkedRotationIds.length === 0) return res.json({ service: svc, programs: [], blocks: [] });

    const scheduleQuery = academic_year
      ? `SELECT s.id, s.program_id, s.name, s.academic_year, p.name as program_name, p.total_blocks
         FROM schedules s JOIN programs p ON p.id = s.program_id
         WHERE s.academic_year = $1 AND s.generated_at IS NOT NULL
         ORDER BY s.generated_at DESC`
      : `SELECT s.id, s.program_id, s.name, s.academic_year, p.name as program_name, p.total_blocks
         FROM schedules s JOIN programs p ON p.id = s.program_id
         WHERE s.generated_at IS NOT NULL
         ORDER BY s.generated_at DESC`;

    const { rows: allSchedules } = academic_year
      ? await pool.query(scheduleQuery, [academic_year])
      : await pool.query(scheduleQuery);

    const latestByProgram = {};
    for (const s of allSchedules) {
      if (!latestByProgram[s.program_id]) latestByProgram[s.program_id] = s;
    }
    const schedules = Object.values(latestByProgram);
    if (schedules.length === 0) return res.json({ service: svc, programs: [], blocks: [] });

    const programs = schedules.map(s => ({
      id: s.program_id, name: s.program_name, scheduleId: s.id, academicYear: s.academic_year,
    }));

    const maxBlocks = Math.max(...schedules.map(s => s.total_blocks));
    const scheduleIds = schedules.map(s => s.id);

    const { rows: coverageRows } = await pool.query(
      `SELECT a.schedule_id, a.block_number, COUNT(DISTINCT a.resident_id) as cnt
       FROM assignments a
       WHERE a.schedule_id = ANY($1) AND a.rotation_id = ANY($2)
       GROUP BY a.schedule_id, a.block_number`,
      [scheduleIds, linkedRotationIds]
    );

    const coverageMap = {};
    for (const row of coverageRows) {
      if (!coverageMap[row.schedule_id]) coverageMap[row.schedule_id] = {};
      coverageMap[row.schedule_id][row.block_number] = Number(row.cnt);
    }

    const scheduleByProgram = {};
    for (const s of schedules) scheduleByProgram[s.program_id] = s.id;

    const blocks = [];
    for (let b = 1; b <= maxBlocks; b++) {
      const byProgram = {};
      let total = 0;
      for (const sched of schedules) {
        const count = coverageMap[sched.id]?.[b] || 0;
        byProgram[sched.program_id] = count;
        total += count;
      }
      blocks.push({ block: b, total, byProgram });
    }

    res.json({ service: svc, programs, blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
