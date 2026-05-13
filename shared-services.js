const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// List all shared services
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const services = db.prepare(`
    SELECT ss.*,
      (SELECT COUNT(*) FROM rotation_shared_service WHERE shared_service_id = ss.id) as rotation_count
    FROM shared_services ss
    ORDER BY ss.name
  `).all();
  res.json(services);
});

// Create a shared service
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, description, soft_max } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(
    'INSERT INTO shared_services (name, description, soft_max) VALUES (?, ?, ?)'
  ).run(name, description || null, soft_max || null);
  res.status(201).json(db.prepare('SELECT * FROM shared_services WHERE id = ?').get(result.lastInsertRowid));
});

// Update a shared service
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const svc = db.prepare('SELECT * FROM shared_services WHERE id = ?').get(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Not found' });
  const { name, description, soft_max } = req.body;
  db.prepare('UPDATE shared_services SET name = ?, description = ?, soft_max = ? WHERE id = ?')
    .run(name ?? svc.name, description ?? svc.description, soft_max ?? svc.soft_max, req.params.id);
  res.json(db.prepare('SELECT * FROM shared_services WHERE id = ?').get(req.params.id));
});

// Delete a shared service
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM shared_services WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  db.prepare('DELETE FROM shared_services WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// List rotations linked to a shared service (across all programs)
router.get('/:id/rotations', requireAuth, (req, res) => {
  const db = getDb();
  const rotations = db.prepare(`
    SELECT r.id, r.name, r.type, r.program_id, p.name as program_name
    FROM rotation_shared_service rss
    JOIN rotations r ON r.id = rss.rotation_id
    JOIN programs p ON p.id = r.program_id
    WHERE rss.shared_service_id = ?
    ORDER BY p.name, r.name
  `).all(req.params.id);
  res.json(rotations);
});

// List all rotations from all programs (for the linking UI)
router.get('/:id/available-rotations', requireAuth, (req, res) => {
  const db = getDb();
  const linked = new Set(
    db.prepare('SELECT rotation_id FROM rotation_shared_service WHERE shared_service_id = ?')
      .all(req.params.id).map(r => r.rotation_id)
  );
  const all = db.prepare(`
    SELECT r.id, r.name, r.type, r.program_id, p.name as program_name
    FROM rotations r
    JOIN programs p ON p.id = r.program_id
    ORDER BY p.name, r.name
  `).all();
  res.json(all.map(r => ({ ...r, linked: linked.has(r.id) })));
});

// Link a rotation to a shared service
router.post('/:id/rotations', requireAuth, (req, res) => {
  const db = getDb();
  const { rotation_id } = req.body;
  if (!rotation_id) return res.status(400).json({ error: 'rotation_id required' });
  if (!db.prepare('SELECT id FROM shared_services WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Shared service not found' });
  }
  if (!db.prepare('SELECT id FROM rotations WHERE id = ?').get(rotation_id)) {
    return res.status(404).json({ error: 'Rotation not found' });
  }
  try {
    db.prepare('INSERT INTO rotation_shared_service (rotation_id, shared_service_id) VALUES (?, ?)').run(rotation_id, req.params.id);
  } catch {
    // already linked — ignore
  }
  res.json({ success: true });
});

// Unlink a rotation from a shared service
router.delete('/:id/rotations/:rotationId', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM rotation_shared_service WHERE shared_service_id = ? AND rotation_id = ?')
    .run(req.params.id, req.params.rotationId);
  res.json({ success: true });
});

// Cross-program coverage: how many residents are on this service per block, per program
// Uses the most recently generated schedule per program for the given academic year.
// Query param: academic_year (e.g. "2025-2026")
router.get('/:id/coverage', requireAuth, (req, res) => {
  const db = getDb();
  const { academic_year } = req.query;

  const svc = db.prepare('SELECT * FROM shared_services WHERE id = ?').get(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Not found' });

  // Get all rotation_ids linked to this service
  const linkedRotationIds = db.prepare(
    'SELECT rotation_id FROM rotation_shared_service WHERE shared_service_id = ?'
  ).all(req.params.id).map(r => r.rotation_id);

  if (linkedRotationIds.length === 0) {
    return res.json({ service: svc, programs: [], blocks: [] });
  }

  // Find the latest generated schedule per program (filtered by academic_year if provided)
  const scheduleQuery = academic_year
    ? `SELECT s.id, s.program_id, s.name, s.academic_year, p.name as program_name, p.total_blocks
       FROM schedules s
       JOIN programs p ON p.id = s.program_id
       WHERE s.academic_year = ? AND s.generated_at IS NOT NULL
       ORDER BY s.generated_at DESC`
    : `SELECT s.id, s.program_id, s.name, s.academic_year, p.name as program_name, p.total_blocks
       FROM schedules s
       JOIN programs p ON p.id = s.program_id
       WHERE s.generated_at IS NOT NULL
       ORDER BY s.generated_at DESC`;

  const allSchedules = academic_year
    ? db.prepare(scheduleQuery).all(academic_year)
    : db.prepare(scheduleQuery).all();

  // Keep only the most recent schedule per program
  const latestByProgram = {};
  for (const s of allSchedules) {
    if (!latestByProgram[s.program_id]) latestByProgram[s.program_id] = s;
  }
  const schedules = Object.values(latestByProgram);

  if (schedules.length === 0) {
    return res.json({ service: svc, programs: [], blocks: [] });
  }

  const programs = schedules.map(s => ({ id: s.program_id, name: s.program_name, scheduleId: s.id, academicYear: s.academic_year }));

  // Determine max blocks across all programs
  const maxBlocks = Math.max(...schedules.map(s => s.total_blocks));

  const rotationPlaceholders = linkedRotationIds.map(() => '?').join(',');

  // Build coverage grid: blocks[block_number] = { total, byProgram: { programId: count } }
  const blocks = [];
  for (let b = 1; b <= maxBlocks; b++) {
    const byProgram = {};
    let total = 0;
    for (const sched of schedules) {
      const count = db.prepare(`
        SELECT COUNT(*) as cnt
        FROM assignments a
        WHERE a.schedule_id = ?
          AND a.block_number = ?
          AND a.rotation_id IN (${rotationPlaceholders})
      `).get(sched.id, b, ...linkedRotationIds)?.cnt || 0;
      byProgram[sched.program_id] = count;
      total += count;
    }
    blocks.push({ block: b, total, byProgram });
  }

  res.json({ service: svc, programs, blocks });
});

// List distinct academic years that have generated schedules (for the coverage filter UI)
router.get('/academic-years', requireAuth, (req, res) => {
  const db = getDb();
  const years = db.prepare(
    "SELECT DISTINCT academic_year FROM schedules WHERE generated_at IS NOT NULL ORDER BY academic_year DESC"
  ).all().map(r => r.academic_year);
  res.json(years);
});

module.exports = router;
