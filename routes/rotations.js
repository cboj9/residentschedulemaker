const express = require('express');
const { getDb, transaction } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getRotationWithDetails(db, rotationId) {
  const rotation = db.prepare('SELECT * FROM rotations WHERE id = ?').get(rotationId);
  if (!rotation) return null;
  rotation.pgyRestrictions = db.prepare(
    'SELECT pgy_year FROM rotation_pgy_restrictions WHERE rotation_id = ?'
  ).all(rotationId).map(r => r.pgy_year);
  rotation.gapRules = db.prepare(
    'SELECT * FROM rotation_gap_rules WHERE rotation_id = ?'
  ).all(rotationId);
  rotation.pgyRequirements = loadPgyRequirements(db, rotationId);
  rotation.prerequisites = db.prepare(
    'SELECT prerequisite_rotation_id FROM rotation_prerequisites WHERE rotation_id = ?'
  ).all(rotationId).map(r => r.prerequisite_rotation_id);
  return rotation;
}

function loadPgyRequirements(db, rotationId) {
  const rows = db.prepare('SELECT pgy_year, required_blocks FROM rotation_required_by_pgy WHERE rotation_id = ?').all(rotationId);
  const map = {};
  for (const r of rows) map[r.pgy_year] = r.required_blocks;
  return map;
}

function savePgyRequirements(db, rotationId, pgyRequirements) {
  db.prepare('DELETE FROM rotation_required_by_pgy WHERE rotation_id = ?').run(rotationId);
  if (pgyRequirements && typeof pgyRequirements === 'object') {
    const stmt = db.prepare('INSERT INTO rotation_required_by_pgy (rotation_id, pgy_year, required_blocks) VALUES (?, ?, ?)');
    for (const [yr, count] of Object.entries(pgyRequirements)) {
      const n = parseInt(count) || 0;
      if (n > 0) stmt.run(rotationId, parseInt(yr), n);
    }
  }
}

function savePrerequisites(db, rotationId, prerequisites) {
  db.prepare('DELETE FROM rotation_prerequisites WHERE rotation_id = ?').run(rotationId);
  if (Array.isArray(prerequisites) && prerequisites.length > 0) {
    const stmt = db.prepare('INSERT INTO rotation_prerequisites (rotation_id, prerequisite_rotation_id) VALUES (?, ?)');
    for (const prereqId of prerequisites) stmt.run(rotationId, parseInt(prereqId));
  }
}

router.get('/program/:programId', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const rotations = db.prepare('SELECT * FROM rotations WHERE program_id = ? ORDER BY type DESC, name').all(req.params.programId);
  const result = rotations.map(r => {
    r.pgyRestrictions = db.prepare('SELECT pgy_year FROM rotation_pgy_restrictions WHERE rotation_id = ?').all(r.id).map(x => x.pgy_year);
    r.gapRules = db.prepare('SELECT * FROM rotation_gap_rules WHERE rotation_id = ?').all(r.id);
    r.pgyRequirements = loadPgyRequirements(db, r.id);
    r.prerequisites = db.prepare('SELECT prerequisite_rotation_id FROM rotation_prerequisites WHERE rotation_id = ?').all(r.id).map(x => x.prerequisite_rotation_id);
    return r;
  });
  res.json(result);
});

router.post('/program/:programId', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const {
    name, type, min_capacity, max_capacity, pto_eligible,
    pgyRestrictions, gapRules, pgyRequirements, prerequisites,
    night_float, two_week, call_type, max_consecutive_blocks, continuity_clinic_compatible,
    can_split_to_half, preferred_block_min, preferred_block_max
  } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  let rotId;
  try {
    rotId = transaction(db, () => {
      const result = db.prepare(`
        INSERT INTO rotations (program_id, name, type, min_capacity, max_capacity, pto_eligible, night_float, two_week, call_type, max_consecutive_blocks, continuity_clinic_compatible, can_split_to_half, preferred_block_min, preferred_block_max)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.params.programId, name, type || 'required',
        min_capacity != null ? min_capacity : 1, max_capacity != null ? max_capacity : 3,
        pto_eligible ? 1 : 0, night_float ? 1 : 0, two_week ? 1 : 0,
        call_type || 'none',
        max_consecutive_blocks != null ? max_consecutive_blocks : null,
        continuity_clinic_compatible != null ? (continuity_clinic_compatible ? 1 : 0) : 1,
        can_split_to_half ? 1 : 0,
        preferred_block_min != null ? preferred_block_min : null,
        preferred_block_max != null ? preferred_block_max : null
      );

      const id = result.lastInsertRowid;

      if (Array.isArray(pgyRestrictions) && pgyRestrictions.length > 0) {
        const stmt = db.prepare('INSERT INTO rotation_pgy_restrictions (rotation_id, pgy_year) VALUES (?, ?)');
        for (const yr of pgyRestrictions) stmt.run(id, yr);
      }
      if (Array.isArray(gapRules) && gapRules.length > 0) {
        const stmt = db.prepare('INSERT INTO rotation_gap_rules (rotation_id, after_rotation_id, min_gap_blocks) VALUES (?, ?, ?)');
        for (const rule of gapRules) stmt.run(id, rule.after_rotation_id, rule.min_gap_blocks || 1);
      }
      savePgyRequirements(db, id, pgyRequirements);
      savePrerequisites(db, id, prerequisites);
      return id;
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.status(201).json(getRotationWithDetails(db, rotId));
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const rotation = db.prepare('SELECT * FROM rotations WHERE id = ?').get(req.params.id);
  if (!rotation) return res.status(404).json({ error: 'Not found' });
  if (rotation.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const {
    name, type, min_capacity, max_capacity, pto_eligible,
    pgyRestrictions, gapRules, pgyRequirements, prerequisites,
    night_float, two_week, call_type, max_consecutive_blocks, continuity_clinic_compatible,
    can_split_to_half, preferred_block_min, preferred_block_max
  } = req.body;

  try {
    transaction(db, () => {
      db.prepare(`
        UPDATE rotations SET name = ?, type = ?, min_capacity = ?, max_capacity = ?, pto_eligible = ?,
          night_float = ?, two_week = ?, call_type = ?, max_consecutive_blocks = ?, continuity_clinic_compatible = ?,
          can_split_to_half = ?, preferred_block_min = ?, preferred_block_max = ?
        WHERE id = ?
      `).run(
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
        req.params.id
      );

      if (Array.isArray(pgyRestrictions)) {
        db.prepare('DELETE FROM rotation_pgy_restrictions WHERE rotation_id = ?').run(req.params.id);
        if (pgyRestrictions.length > 0) {
          const stmt = db.prepare('INSERT INTO rotation_pgy_restrictions (rotation_id, pgy_year) VALUES (?, ?)');
          for (const yr of pgyRestrictions) stmt.run(req.params.id, yr);
        }
      }
      if (Array.isArray(gapRules)) {
        db.prepare('DELETE FROM rotation_gap_rules WHERE rotation_id = ?').run(req.params.id);
        if (gapRules.length > 0) {
          const stmt = db.prepare('INSERT INTO rotation_gap_rules (rotation_id, after_rotation_id, min_gap_blocks) VALUES (?, ?, ?)');
          for (const rule of gapRules) stmt.run(req.params.id, rule.after_rotation_id, rule.min_gap_blocks || 1);
        }
      }
      if (pgyRequirements !== undefined) savePgyRequirements(db, req.params.id, pgyRequirements);
      if (prerequisites !== undefined) savePrerequisites(db, req.params.id, prerequisites);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json(getRotationWithDetails(db, req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const rotation = db.prepare('SELECT * FROM rotations WHERE id = ?').get(req.params.id);
  if (!rotation) return res.status(404).json({ error: 'Not found' });
  if (rotation.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM rotations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Bulk import: accepts parsed CSV rows as JSON
router.post('/program/:programId/import', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records array required' });

  const inserted = [];
  const errors = [];

  try {
    transaction(db, () => {
      const stmt = db.prepare(`
        INSERT INTO rotations (program_id, name, type, min_capacity, max_capacity, pto_eligible, night_float, two_week)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r.name) { errors.push({ row: i + 1, error: 'Name required' }); continue; }
        const result = stmt.run(
          req.params.programId,
          String(r.name).trim(),
          ['required','elective'].includes(r.type) ? r.type : 'required',
          parseInt(r.min_capacity) || 1,
          parseInt(r.max_capacity) || 3,
          r.pto_eligible ? 1 : 0,
          r.night_float ? 1 : 0,
          r.two_week ? 1 : 0
        );
        inserted.push(result.lastInsertRowid);
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ inserted: inserted.length, errors });
});

module.exports = router;
