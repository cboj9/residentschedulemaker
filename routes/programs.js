const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// List all programs (any authenticated user — single-admin app)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM programs ORDER BY name').all());
});

// Create a new program (without a separate user account)
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const {
    name, block_length_weeks, total_blocks, academic_year_start,
    call_model, continuity_clinic_days_per_block, max_consecutive_blocks_same_rotation, pgy_count
  } = req.body;
  if (!name || !academic_year_start) return res.status(400).json({ error: 'Name and academic_year_start required' });
  const result = db.prepare(`
    INSERT INTO programs (name, block_length_weeks, total_blocks, academic_year_start, call_model, continuity_clinic_days_per_block, max_consecutive_blocks_same_rotation, pgy_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, block_length_weeks || 4, total_blocks || 13, academic_year_start,
    call_model || 'block_nightfloat',
    continuity_clinic_days_per_block != null ? continuity_clinic_days_per_block : 0,
    max_consecutive_blocks_same_rotation != null ? max_consecutive_blocks_same_rotation : null,
    pgy_count || 3
  );
  res.status(201).json(db.prepare('SELECT * FROM programs WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!program) return res.status(404).json({ error: 'Not found' });
  if (program.id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  program.elective_options = JSON.parse(program.elective_options || '[]');
  res.json(program);
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!program) return res.status(404).json({ error: 'Not found' });
  if (program.id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const {
    name, block_length_weeks, total_blocks, academic_year_start, pto_priority_rule, elective_options,
    call_model, continuity_clinic_days_per_block, max_consecutive_blocks_same_rotation, pgy_count
  } = req.body;
  db.prepare(`
    UPDATE programs SET name = ?, block_length_weeks = ?, total_blocks = ?, academic_year_start = ?,
      pto_priority_rule = ?, elective_options = ?,
      call_model = ?, continuity_clinic_days_per_block = ?, max_consecutive_blocks_same_rotation = ?, pgy_count = ?
    WHERE id = ?
  `).run(
    name || program.name,
    block_length_weeks || program.block_length_weeks,
    total_blocks || program.total_blocks,
    academic_year_start || program.academic_year_start,
    pto_priority_rule || program.pto_priority_rule || 'first_come',
    elective_options !== undefined ? JSON.stringify(elective_options) : (program.elective_options || '[]'),
    call_model !== undefined ? (call_model || 'block_nightfloat') : (program.call_model || 'block_nightfloat'),
    continuity_clinic_days_per_block !== undefined ? continuity_clinic_days_per_block : (program.continuity_clinic_days_per_block ?? 0),
    max_consecutive_blocks_same_rotation !== undefined ? (max_consecutive_blocks_same_rotation != null ? max_consecutive_blocks_same_rotation : null) : (program.max_consecutive_blocks_same_rotation ?? null),
    pgy_count !== undefined ? (pgy_count || 3) : (program.pgy_count || 3),
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  updated.elective_options = JSON.parse(updated.elective_options || '[]');
  res.json(updated);
});

module.exports = router;
