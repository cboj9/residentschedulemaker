const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM programs ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      name, block_length_weeks, total_blocks, academic_year_start,
      call_model, continuity_clinic_days_per_block, max_consecutive_blocks_same_rotation, pgy_count
    } = req.body;
    if (!name || !academic_year_start) return res.status(400).json({ error: 'Name and academic_year_start required' });

    const { rows } = await pool.query(
      `INSERT INTO programs (name, block_length_weeks, total_blocks, academic_year_start, call_model, continuity_clinic_days_per_block, max_consecutive_blocks_same_rotation, pgy_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name, block_length_weeks || 4, total_blocks || 13, academic_year_start,
        call_model || 'block_nightfloat',
        continuity_clinic_days_per_block != null ? continuity_clinic_days_per_block : 0,
        max_consecutive_blocks_same_rotation != null ? max_consecutive_blocks_same_rotation : null,
        pgy_count || 3,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM programs WHERE id = $1', [req.params.id]);
    const program = rows[0];
    if (!program) return res.status(404).json({ error: 'Not found' });
    if (program.id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    program.elective_options = JSON.parse(program.elective_options || '[]');
    res.json(program);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM programs WHERE id = $1', [req.params.id]);
    const program = rows[0];
    if (!program) return res.status(404).json({ error: 'Not found' });
    if (program.id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const {
      name, block_length_weeks, total_blocks, academic_year_start, pto_priority_rule, elective_options,
      call_model, continuity_clinic_days_per_block, max_consecutive_blocks_same_rotation, pgy_count
    } = req.body;

    const { rows: updated } = await pool.query(
      `UPDATE programs SET name=$1, block_length_weeks=$2, total_blocks=$3, academic_year_start=$4,
        pto_priority_rule=$5, elective_options=$6, call_model=$7, continuity_clinic_days_per_block=$8,
        max_consecutive_blocks_same_rotation=$9, pgy_count=$10
       WHERE id=$11 RETURNING *`,
      [
        name || program.name,
        block_length_weeks || program.block_length_weeks,
        total_blocks || program.total_blocks,
        academic_year_start || program.academic_year_start,
        pto_priority_rule || program.pto_priority_rule || 'first_come',
        elective_options !== undefined ? JSON.stringify(elective_options) : (program.elective_options || '[]'),
        call_model !== undefined ? (call_model || 'block_nightfloat') : (program.call_model || 'block_nightfloat'),
        continuity_clinic_days_per_block !== undefined ? continuity_clinic_days_per_block : (program.continuity_clinic_days_per_block ?? 0),
        max_consecutive_blocks_same_rotation !== undefined
          ? (max_consecutive_blocks_same_rotation != null ? max_consecutive_blocks_same_rotation : null)
          : (program.max_consecutive_blocks_same_rotation ?? null),
        pgy_count !== undefined ? (pgy_count || 3) : (program.pgy_count || 3),
        req.params.id,
      ]
    );
    updated[0].elective_options = JSON.parse(updated[0].elective_options || '[]');
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
