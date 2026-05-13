const express = require('express');
const { pool, transaction } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function getRotationWithDetails(rotationId) {
  const { rows } = await pool.query('SELECT * FROM rotations WHERE id = $1', [rotationId]);
  const rotation = rows[0];
  if (!rotation) return null;

  const [pgyR, gapR, pgyReqR, prereqR] = await Promise.all([
    pool.query('SELECT pgy_year FROM rotation_pgy_restrictions WHERE rotation_id = $1', [rotationId]),
    pool.query('SELECT * FROM rotation_gap_rules WHERE rotation_id = $1', [rotationId]),
    pool.query('SELECT pgy_year, required_blocks FROM rotation_required_by_pgy WHERE rotation_id = $1', [rotationId]),
    pool.query('SELECT prerequisite_rotation_id FROM rotation_prerequisites WHERE rotation_id = $1', [rotationId]),
  ]);

  rotation.pgyRestrictions = pgyR.rows.map(r => r.pgy_year);
  rotation.gapRules = gapR.rows;
  rotation.pgyRequirements = Object.fromEntries(pgyReqR.rows.map(r => [r.pgy_year, r.required_blocks]));
  rotation.prerequisites = prereqR.rows.map(r => r.prerequisite_rotation_id);
  return rotation;
}

async function savePgyRequirements(client, rotationId, pgyRequirements) {
  await client.query('DELETE FROM rotation_required_by_pgy WHERE rotation_id = $1', [rotationId]);
  if (pgyRequirements && typeof pgyRequirements === 'object') {
    for (const [yr, count] of Object.entries(pgyRequirements)) {
      const n = parseInt(count) || 0;
      if (n > 0) {
        await client.query(
          'INSERT INTO rotation_required_by_pgy (rotation_id, pgy_year, required_blocks) VALUES ($1, $2, $3)',
          [rotationId, parseInt(yr), n]
        );
      }
    }
  }
}

async function savePrerequisites(client, rotationId, prerequisites) {
  await client.query('DELETE FROM rotation_prerequisites WHERE rotation_id = $1', [rotationId]);
  if (Array.isArray(prerequisites) && prerequisites.length > 0) {
    for (const prereqId of prerequisites) {
      await client.query(
        'INSERT INTO rotation_prerequisites (rotation_id, prerequisite_rotation_id) VALUES ($1, $2)',
        [rotationId, parseInt(prereqId)]
      );
    }
  }
}

router.get('/program/:programId', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows: rotations } = await pool.query(
      'SELECT * FROM rotations WHERE program_id = $1 ORDER BY type DESC, name',
      [req.params.programId]
    );

    if (rotations.length === 0) return res.json([]);

    const rotIds = rotations.map(r => r.id);
    const [pgyR, gapR, pgyReqR, prereqR] = await Promise.all([
      pool.query('SELECT rotation_id, pgy_year FROM rotation_pgy_restrictions WHERE rotation_id = ANY($1)', [rotIds]),
      pool.query('SELECT * FROM rotation_gap_rules WHERE rotation_id = ANY($1)', [rotIds]),
      pool.query('SELECT rotation_id, pgy_year, required_blocks FROM rotation_required_by_pgy WHERE rotation_id = ANY($1)', [rotIds]),
      pool.query('SELECT rotation_id, prerequisite_rotation_id FROM rotation_prerequisites WHERE rotation_id = ANY($1)', [rotIds]),
    ]);

    const pgyMap = {}, gapMap = {}, reqMap = {}, prereqMap = {};
    for (const r of pgyR.rows) { (pgyMap[r.rotation_id] = pgyMap[r.rotation_id] || []).push(r.pgy_year); }
    for (const r of gapR.rows) { (gapMap[r.rotation_id] = gapMap[r.rotation_id] || []).push(r); }
    for (const r of pgyReqR.rows) {
      if (!reqMap[r.rotation_id]) reqMap[r.rotation_id] = {};
      reqMap[r.rotation_id][r.pgy_year] = r.required_blocks;
    }
    for (const r of prereqR.rows) { (prereqMap[r.rotation_id] = prereqMap[r.rotation_id] || []).push(r.prerequisite_rotation_id); }

    const result = rotations.map(r => ({
      ...r,
      pgyRestrictions: pgyMap[r.id] || [],
      gapRules: gapMap[r.id] || [],
      pgyRequirements: reqMap[r.id] || {},
      prerequisites: prereqMap[r.id] || [],
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/program/:programId', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const {
      name, type, min_capacity, max_capacity, pto_eligible,
      pgyRestrictions, gapRules, pgyRequirements, prerequisites,
      night_float, two_week, call_type, max_consecutive_blocks, continuity_clinic_compatible,
      can_split_to_half, preferred_block_min, preferred_block_max,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const rotId = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO rotations (program_id, name, type, min_capacity, max_capacity, pto_eligible, night_float, two_week, call_type, max_consecutive_blocks, continuity_clinic_compatible, can_split_to_half, preferred_block_min, preferred_block_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [
          req.params.programId, name, type || 'required',
          min_capacity != null ? min_capacity : 1, max_capacity != null ? max_capacity : 3,
          pto_eligible ? 1 : 0, night_float ? 1 : 0, two_week ? 1 : 0,
          call_type || 'none',
          max_consecutive_blocks != null ? max_consecutive_blocks : null,
          continuity_clinic_compatible != null ? (continuity_clinic_compatible ? 1 : 0) : 1,
          can_split_to_half ? 1 : 0,
          preferred_block_min != null ? preferred_block_min : null,
          preferred_block_max != null ? preferred_block_max : null,
        ]
      );
      const id = rows[0].id;

      if (Array.isArray(pgyRestrictions) && pgyRestrictions.length > 0) {
        for (const yr of pgyRestrictions) {
          await client.query('INSERT INTO rotation_pgy_restrictions (rotation_id, pgy_year) VALUES ($1, $2)', [id, yr]);
        }
      }
      if (Array.isArray(gapRules) && gapRules.length > 0) {
        for (const rule of gapRules) {
          await client.query(
            'INSERT INTO rotation_gap_rules (rotation_id, after_rotation_id, min_gap_blocks) VALUES ($1, $2, $3)',
            [id, rule.after_rotation_id, rule.min_gap_blocks || 1]
          );
        }
      }
      await savePgyRequirements(client, id, pgyRequirements);
      await savePrerequisites(client, id, prerequisites);
      return id;
    });

    res.status(201).json(await getRotationWithDetails(rotId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rotations WHERE id = $1', [req.params.id]);
    const rotation = rows[0];
    if (!rotation) return res.status(404).json({ error: 'Not found' });
    if (rotation.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const {
      name, type, min_capacity, max_capacity, pto_eligible,
      pgyRestrictions, gapRules, pgyRequirements, prerequisites,
      night_float, two_week, call_type, max_consecutive_blocks, continuity_clinic_compatible,
      can_split_to_half, preferred_block_min, preferred_block_max,
    } = req.body;

    await transaction(async (client) => {
      await client.query(
        `UPDATE rotations SET name=$1, type=$2, min_capacity=$3, max_capacity=$4, pto_eligible=$5,
          night_float=$6, two_week=$7, call_type=$8, max_consecutive_blocks=$9,
          continuity_clinic_compatible=$10, can_split_to_half=$11, preferred_block_min=$12, preferred_block_max=$13
         WHERE id=$14`,
        [
          name || rotation.name,
          type || rotation.type,
          min_capacity !== undefined ? min_capacity : rotation.min_capacity,
          max_capacity !== undefined ? max_capacity : rotation.max_capacity,
          pto_eligible !== undefined ? (pto_eligible ? 1 : 0) : rotation.pto_eligible,
          night_float !== undefined ? (night_float ? 1 : 0) : (rotation.night_float || 0),
          two_week !== undefined ? (two_week ? 1 : 0) : (rotation.two_week || 0),
          call_type !== undefined ? (call_type || 'none') : (rotation.call_type || 'none'),
          max_consecutive_blocks !== undefined ? (max_consecutive_blocks != null ? max_consecutive_blocks : null) : (rotation.max_consecutive_blocks ?? null),
          continuity_clinic_compatible !== undefined ? (continuity_clinic_compatible ? 1 : 0) : (rotation.continuity_clinic_compatible ?? 1),
          can_split_to_half !== undefined ? (can_split_to_half ? 1 : 0) : (rotation.can_split_to_half || 0),
          preferred_block_min !== undefined ? (preferred_block_min != null ? preferred_block_min : null) : (rotation.preferred_block_min ?? null),
          preferred_block_max !== undefined ? (preferred_block_max != null ? preferred_block_max : null) : (rotation.preferred_block_max ?? null),
          req.params.id,
        ]
      );

      if (Array.isArray(pgyRestrictions)) {
        await client.query('DELETE FROM rotation_pgy_restrictions WHERE rotation_id = $1', [req.params.id]);
        for (const yr of pgyRestrictions) {
          await client.query('INSERT INTO rotation_pgy_restrictions (rotation_id, pgy_year) VALUES ($1, $2)', [req.params.id, yr]);
        }
      }
      if (Array.isArray(gapRules)) {
        await client.query('DELETE FROM rotation_gap_rules WHERE rotation_id = $1', [req.params.id]);
        for (const rule of gapRules) {
          await client.query(
            'INSERT INTO rotation_gap_rules (rotation_id, after_rotation_id, min_gap_blocks) VALUES ($1, $2, $3)',
            [req.params.id, rule.after_rotation_id, rule.min_gap_blocks || 1]
          );
        }
      }
      if (pgyRequirements !== undefined) await savePgyRequirements(client, req.params.id, pgyRequirements);
      if (prerequisites !== undefined) await savePrerequisites(client, req.params.id, prerequisites);
    });

    res.json(await getRotationWithDetails(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rotations WHERE id = $1', [req.params.id]);
    const rotation = rows[0];
    if (!rotation) return res.status(404).json({ error: 'Not found' });
    if (rotation.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM rotations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/program/:programId/import', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records array required' });

    const inserted = [];
    const errors = [];

    await transaction(async (client) => {
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r.name) { errors.push({ row: i + 1, error: 'Name required' }); continue; }
        const { rows } = await client.query(
          `INSERT INTO rotations (program_id, name, type, min_capacity, max_capacity, pto_eligible, night_float, two_week)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            req.params.programId,
            String(r.name).trim(),
            ['required', 'elective'].includes(r.type) ? r.type : 'required',
            parseInt(r.min_capacity) || 1,
            parseInt(r.max_capacity) || 3,
            r.pto_eligible ? 1 : 0,
            r.night_float ? 1 : 0,
            r.two_week ? 1 : 0,
          ]
        );
        inserted.push(rows[0].id);
      }
    });

    res.json({ inserted: inserted.length, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
