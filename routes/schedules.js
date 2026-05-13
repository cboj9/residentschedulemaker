const express = require('express');
const { getDb, transaction } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { generateSchedule } = require('../scheduler/algorithm');

const router = express.Router();

router.get('/program/:programId', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const schedules = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM schedule_violations WHERE schedule_id = s.id AND severity = 'error') as error_count,
      (SELECT COUNT(*) FROM schedule_violations WHERE schedule_id = s.id AND severity = 'warning') as warning_count
    FROM schedules s
    WHERE s.program_id = ?
    ORDER BY s.created_at DESC
  `).all(req.params.programId);
  res.json(schedules);
});

// Public: returns draft schedules for a program, authenticated by invite token (no JWT needed)
router.get('/for-resident', (req, res) => {
  const db = getDb();
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const invite = db.prepare(`
    SELECT it.expires_at, r.program_id
    FROM invite_tokens it
    JOIN residents r ON r.id = it.resident_id
    WHERE it.token = ?
  `).get(token);

  if (!invite) return res.status(403).json({ error: 'Invalid token' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Token expired' });
  }

  const schedules = db.prepare(`
    SELECT id, name, academic_year, status
    FROM schedules
    WHERE program_id = ? AND status = 'draft'
    ORDER BY created_at DESC
  `).all(invite.program_id);

  res.json(schedules);
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const assignments = db.prepare(`
    SELECT a.*, rot.name as rotation_name, rot.type as rotation_type, rot.pto_eligible
    FROM assignments a
    LEFT JOIN rotations rot ON rot.id = a.rotation_id
    WHERE a.schedule_id = ?
    ORDER BY a.block_number, a.resident_id
  `).all(req.params.id);
  // pinned column is selected via a.* above

  for (const a of assignments) {
    a.ptoWeeks = JSON.parse(a.pto_weeks || '[]');
  }

  const violations = db.prepare(`
    SELECT sv.*, r.name as resident_name, rot.name as rotation_name
    FROM schedule_violations sv
    LEFT JOIN residents r ON r.id = sv.resident_id
    LEFT JOIN rotations rot ON rot.id = sv.rotation_id
    WHERE sv.schedule_id = ?
    ORDER BY sv.severity DESC, sv.block_number
  `).all(req.params.id);

  res.json({ schedule, assignments, violations });
});

router.post('/program/:programId', requireAuth, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  const { name, academic_year } = req.body;
  if (!name || !academic_year) return res.status(400).json({ error: 'Name and academic year required' });

  const result = db.prepare(`
    INSERT INTO schedules (program_id, name, academic_year, status)
    VALUES (?, ?, ?, 'draft')
  `).run(req.params.programId, name, academic_year);

  res.status(201).json(db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid));
});

router.post('/:id/generate', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(schedule.program_id);
  const residents = db.prepare('SELECT * FROM residents WHERE program_id = ? ORDER BY pgy_year, name').all(program.id);

  const halfLen = program.block_length_weeks / 2;

  const rotations = db.prepare('SELECT * FROM rotations WHERE program_id = ?').all(program.id);
  if (rotations.length > 0) {
    const rotIds = rotations.map(r => r.id);
    const ph = rotIds.map(() => '?').join(',');

    const allPgyRestrictions = db.prepare(
      `SELECT rotation_id, pgy_year FROM rotation_pgy_restrictions WHERE rotation_id IN (${ph})`
    ).all(...rotIds);
    const allGapRules = db.prepare(
      `SELECT * FROM rotation_gap_rules WHERE rotation_id IN (${ph})`
    ).all(...rotIds);
    const allPgyReqRows = db.prepare(
      `SELECT rotation_id, pgy_year, required_blocks FROM rotation_required_by_pgy WHERE rotation_id IN (${ph})`
    ).all(...rotIds);
    const allPrereqs = db.prepare(
      `SELECT rotation_id, prerequisite_rotation_id FROM rotation_prerequisites WHERE rotation_id IN (${ph})`
    ).all(...rotIds);

    const pgyRestrictionsMap = {}, gapRulesMap = {}, pgyReqMap = {}, prereqMap = {};
    for (const row of allPgyRestrictions) {
      if (!pgyRestrictionsMap[row.rotation_id]) pgyRestrictionsMap[row.rotation_id] = [];
      pgyRestrictionsMap[row.rotation_id].push(row.pgy_year);
    }
    for (const row of allGapRules) {
      if (!gapRulesMap[row.rotation_id]) gapRulesMap[row.rotation_id] = [];
      gapRulesMap[row.rotation_id].push(row);
    }
    for (const row of allPgyReqRows) {
      if (!pgyReqMap[row.rotation_id]) pgyReqMap[row.rotation_id] = {};
      // required_blocks is in half-block units (1 = one 2-week half, 2 = one full 4-week block)
      // per the algorithm contract — must NOT be converted here
      pgyReqMap[row.rotation_id][row.pgy_year] = row.required_blocks;
    }
    for (const row of allPrereqs) {
      if (!prereqMap[row.rotation_id]) prereqMap[row.rotation_id] = [];
      prereqMap[row.rotation_id].push(row.prerequisite_rotation_id);
    }

    for (const rot of rotations) {
      rot.pgyRestrictions = pgyRestrictionsMap[rot.id] || [];
      rot.gapRules        = gapRulesMap[rot.id] || [];
      rot.pgyRequirements = pgyReqMap[rot.id] || {};
      rot.prerequisites   = prereqMap[rot.id] || [];
      rot.ptoEligible     = Boolean(rot.pto_eligible);
      rot.minCapacity     = rot.min_capacity;
      rot.maxCapacity     = rot.max_capacity;
      rot.nightFloat      = Boolean(rot.night_float);
      rot.preferredBlockMin = rot.preferred_block_min ?? null;
      rot.preferredBlockMax = rot.preferred_block_max ?? null;
      // two_week flag maps to durationWeeks so the algorithm's isHalfBlock() works correctly
      rot.durationWeeks   = rot.two_week ? halfLen : program.block_length_weeks;
      rot.canSplitToHalf  = Boolean(rot.can_split_to_half);
      rot.callType        = rot.call_type || 'none';
      rot.maxConsecutiveBlocks          = rot.max_consecutive_blocks ?? null;
      rot.continuityClinicalCompatible  = Boolean(rot.continuity_clinic_compatible ?? 1);
    }
  }

  const ptoRequests = db.prepare(`
    SELECT resident_id as residentId, week_number as weekNumber
    FROM pto_requests
    WHERE schedule_id = ? AND status != 'denied'
  `).all(schedule.id);

  const leavePeriods = db.prepare(`
    SELECT resident_id as residentId, start_block as startBlock, end_block as endBlock
    FROM resident_leave_periods WHERE schedule_id = ?
  `).all(schedule.id);

  const electivePreferences = db.prepare(`
    SELECT resident_id as residentId, rotation_id as rotationId, rank
    FROM elective_preferences WHERE schedule_id = ?
    ORDER BY resident_id, rank
  `).all(schedule.id);

  const pinnedAssignments = db.prepare(`
    SELECT resident_id as residentId, rotation_id as rotationId,
           block_number as blockNumber, block_half as halfBlock
    FROM assignments WHERE schedule_id = ? AND pinned = 1
  `).all(schedule.id);

  const formattedResidents = residents.map(r => ({
    id: r.id,
    name: r.name,
    pgyYear: r.pgy_year,
    ptoWeeksAllotted: r.pto_weeks_allotted
  }));

  // Build cross-program coverage: for each rotation in this program that shares a service
  // with rotations in other programs, count how many residents from those programs are
  // already assigned per block in their latest generated schedule.
  const existingCoverage = {};
  const rotationServiceMap = {};
  for (const rot of rotations) {
    const links = db.prepare(
      'SELECT shared_service_id FROM rotation_shared_service WHERE rotation_id = ?'
    ).all(rot.id);
    if (links.length > 0) rotationServiceMap[rot.id] = links.map(l => l.shared_service_id);
  }

  const serviceIds = [...new Set(Object.values(rotationServiceMap).flat())];
  if (serviceIds.length > 0) {
    const otherSchedules = db.prepare(`
      SELECT s.id, s.program_id
      FROM schedules s
      WHERE s.program_id != ? AND s.generated_at IS NOT NULL
      ORDER BY s.generated_at DESC
    `).all(program.id);

    const latestByProgram = {};
    for (const s of otherSchedules) {
      if (!latestByProgram[s.program_id]) latestByProgram[s.program_id] = s.id;
    }
    const otherScheduleIds = Object.values(latestByProgram);

    if (otherScheduleIds.length > 0) {
      const schedPlaceholders = otherScheduleIds.map(() => '?').join(',');
      for (const [rotIdStr, svcIds] of Object.entries(rotationServiceMap)) {
        const rotId = parseInt(rotIdStr);
        const otherRotIds = [];
        for (const svcId of svcIds) {
          const linked = db.prepare(`
            SELECT rss.rotation_id FROM rotation_shared_service rss
            JOIN rotations r ON r.id = rss.rotation_id
            WHERE rss.shared_service_id = ? AND r.program_id != ?
          `).all(svcId, program.id).map(r => r.rotation_id);
          otherRotIds.push(...linked);
        }
        if (otherRotIds.length === 0) continue;

        const rotPlaceholders = otherRotIds.map(() => '?').join(',');
        existingCoverage[rotId] = {};
        const coverageRows = db.prepare(`
          SELECT a.block_number, COUNT(DISTINCT a.resident_id) as cnt
          FROM assignments a
          WHERE a.schedule_id IN (${schedPlaceholders})
            AND a.rotation_id IN (${rotPlaceholders})
          GROUP BY a.block_number
        `).all(...otherScheduleIds, ...otherRotIds);
        for (const row of coverageRows) {
          if (row.cnt > 0) existingCoverage[rotId][row.block_number] = row.cnt;
        }
      }
    }
  }

  const result = generateSchedule({
    residents: formattedResidents,
    rotations,
    ptoRequests,
    blockLengthWeeks: program.block_length_weeks,
    totalBlocks: program.total_blocks,
    existingCoverage,
    maxConsecutiveBlocksSameRotation: program.max_consecutive_blocks_same_rotation ?? null,
    leavePeriods,
    electivePreferences,
    pinnedAssignments,
  });

  try {
    transaction(db, () => {
      db.prepare('DELETE FROM assignments WHERE schedule_id = ?').run(schedule.id);
      db.prepare('DELETE FROM schedule_violations WHERE schedule_id = ?').run(schedule.id);

      const insertAssignment = db.prepare(`
        INSERT INTO assignments (schedule_id, resident_id, rotation_id, block_number, block_half, pto_weeks, pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of result.assignments) {
        insertAssignment.run(schedule.id, a.residentId, a.rotationId || null, a.blockNumber, a.halfBlock || 'full', JSON.stringify(a.ptoWeeks), a.pinned ? 1 : 0);
      }

      const insertViolation = db.prepare(`
        INSERT INTO schedule_violations (schedule_id, violation_type, severity, block_number, resident_id, rotation_id, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of result.violations) {
        insertViolation.run(
          schedule.id, v.type, v.severity,
          v.blockNumber || null, v.residentId || null, v.rotationId || null,
          v.message
        );
      }

      db.prepare(`
        UPDATE schedules SET generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(schedule.id);

      db.prepare(`
        INSERT INTO schedule_change_log (schedule_id, change_type, old_value, new_value)
        VALUES (?, 'regenerated', ?, ?)
      `).run(schedule.id, 'All assignments', `Regenerated (${result.assignments.length} assignments)`);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const errorCount = result.violations.filter(v => v.severity === 'error').length;
  const warningCount = result.violations.filter(v => v.severity === 'warning').length;

  res.json({ success: true, assignmentsCreated: result.assignments.length, violations: result.violations, errorCount, warningCount });
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { name, status } = req.body;
  db.prepare(`
    UPDATE schedules SET name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(name || schedule.name, status || schedule.status, req.params.id);

  res.json(db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id));
});

router.get('/:id/export', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(schedule.program_id);
  const residents = db.prepare('SELECT * FROM residents WHERE program_id = ? ORDER BY pgy_year, name').all(program.id);
  const assignments = db.prepare(`
    SELECT a.resident_id, a.block_number, a.block_half, a.pto_weeks, a.elective_label, rot.name as rotation_name
    FROM assignments a
    LEFT JOIN rotations rot ON rot.id = a.rotation_id
    WHERE a.schedule_id = ?
  `).all(schedule.id);

  const lookup = {};
  for (const a of assignments) {
    if (!lookup[a.resident_id]) lookup[a.resident_id] = {};
    const ptoWeeks = JSON.parse(a.pto_weeks || '[]');
    let label = a.rotation_name || a.elective_label || 'Elective';
    if (ptoWeeks.length > 0) label += ` (+${ptoWeeks.length}w PTO)`;
    const key = a.block_half && a.block_half !== 'full' ? `${a.block_number}-${a.block_half}` : String(a.block_number);
    lookup[a.resident_id][key] = label;
  }

  const totalBlocks = program.total_blocks;
  const headers = ['Resident', 'PGY', ...Array.from({ length: totalBlocks }, (_, i) => `Block ${i + 1}`)];
  const rows = residents.map(r => {
    const cols = [r.name, `PGY${r.pgy_year}`];
    for (let b = 1; b <= totalBlocks; b++) cols.push((lookup[r.id] || {})[b] || '');
    return cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${schedule.name.replace(/[^a-z0-9]/gi, '_')}.csv"`);
  res.send(csv);
});

// Upsert assignment by (residentId, blockNumber, blockHalf) — used for manual A/B cell edits
router.put('/:id/assignments/upsert', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const { resident_id, block_number, block_half, rotation_id, elective_label } = req.body;
  if (!resident_id || !block_number) return res.status(400).json({ error: 'resident_id and block_number required' });

  const half = block_half || 'full';
  const existing = db.prepare(
    'SELECT * FROM assignments WHERE schedule_id = ? AND resident_id = ? AND block_number = ? AND block_half = ?'
  ).get(req.params.id, resident_id, block_number, half);

  const newRot = rotation_id
    ? db.prepare('SELECT name FROM rotations WHERE id = ?').get(rotation_id)?.name
    : (elective_label || 'Elective');
  const residentName = db.prepare('SELECT name FROM residents WHERE id = ?').get(resident_id)?.name;
  const oldRot = existing?.rotation_id
    ? db.prepare('SELECT name FROM rotations WHERE id = ?').get(existing.rotation_id)?.name
    : (existing?.elective_label || 'Elective');

  if (existing) {
    db.prepare('UPDATE assignments SET rotation_id = ?, elective_label = ? WHERE id = ?').run(
      rotation_id !== undefined ? (rotation_id || null) : existing.rotation_id,
      elective_label !== undefined ? (elective_label || null) : existing.elective_label,
      existing.id
    );
  } else {
    db.prepare(
      'INSERT INTO assignments (schedule_id, resident_id, rotation_id, block_number, block_half, pto_weeks, elective_label) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, resident_id, rotation_id || null, block_number, half, '[]', elective_label || null);
  }

  db.prepare('UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  db.prepare(`
    INSERT INTO schedule_change_log (schedule_id, change_type, resident_id, block_number, old_value, new_value)
    VALUES (?, 'manual_edit', ?, ?, ?, ?)
  `).run(req.params.id, resident_id, block_number, `${oldRot} (${half})`, `${newRot} (${half})`);

  res.json({ success: true, residentName, block: block_number, half, oldRot, newRot });
});

router.put('/:id/assignments/:assignmentId', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ? AND schedule_id = ?')
    .get(req.params.assignmentId, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const { rotation_id, elective_label } = req.body;
  const oldRot = assignment.rotation_id
    ? db.prepare('SELECT name FROM rotations WHERE id = ?').get(assignment.rotation_id)?.name
    : (assignment.elective_label || 'Elective');
  const newRot = rotation_id
    ? db.prepare('SELECT name FROM rotations WHERE id = ?').get(rotation_id)?.name
    : (elective_label !== undefined ? (elective_label || 'Elective') : oldRot);
  const residentName = db.prepare('SELECT name FROM residents WHERE id = ?').get(assignment.resident_id)?.name;

  db.prepare('UPDATE assignments SET rotation_id = ?, elective_label = ? WHERE id = ?').run(
    rotation_id !== undefined ? (rotation_id || null) : assignment.rotation_id,
    elective_label !== undefined ? (elective_label || null) : assignment.elective_label,
    assignment.id
  );
  db.prepare('UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

  db.prepare(`
    INSERT INTO schedule_change_log (schedule_id, change_type, resident_id, block_number, old_value, new_value)
    VALUES (?, 'manual_edit', ?, ?, ?, ?)
  `).run(req.params.id, assignment.resident_id, assignment.block_number, oldRot, newRot);

  res.json({ success: true, residentName, block: assignment.block_number, oldRot, newRot });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Toggle pinned flag on an assignment
router.put('/:id/assignments/:assignmentId/pin', requireAuth, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ? AND schedule_id = ?')
    .get(req.params.assignmentId, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const newPinned = req.body.pinned ? 1 : 0;
  db.prepare('UPDATE assignments SET pinned = ? WHERE id = ?').run(newPinned, assignment.id);
  res.json({ success: true, pinned: newPinned === 1 });
});

module.exports = router;
