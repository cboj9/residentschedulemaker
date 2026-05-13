const express = require('express');
const { pool, transaction } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { generateSchedule } = require('../scheduler/algorithm');

const router = express.Router();

router.get('/program/:programId', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT s.*,
         (SELECT COUNT(*) FROM schedule_violations WHERE schedule_id = s.id AND severity = 'error') as error_count,
         (SELECT COUNT(*) FROM schedule_violations WHERE schedule_id = s.id AND severity = 'warning') as warning_count
       FROM schedules s
       WHERE s.program_id = $1
       ORDER BY s.created_at DESC`,
      [req.params.programId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/for-resident', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { rows: [invite] } = await pool.query(
      `SELECT it.expires_at, r.program_id
       FROM invite_tokens it
       JOIN residents r ON r.id = it.resident_id
       WHERE it.token = $1`,
      [token]
    );
    if (!invite) return res.status(403).json({ error: 'Invalid token' });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Token expired' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, academic_year, status
       FROM schedules
       WHERE program_id = $1 AND status = 'draft'
       ORDER BY created_at DESC`,
      [invite.program_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const [{ rows: assignments }, { rows: violations }] = await Promise.all([
      pool.query(
        `SELECT a.*, rot.name as rotation_name, rot.type as rotation_type, rot.pto_eligible
         FROM assignments a
         LEFT JOIN rotations rot ON rot.id = a.rotation_id
         WHERE a.schedule_id = $1
         ORDER BY a.block_number, a.resident_id`,
        [req.params.id]
      ),
      pool.query(
        `SELECT sv.*, r.name as resident_name, rot.name as rotation_name
         FROM schedule_violations sv
         LEFT JOIN residents r ON r.id = sv.resident_id
         LEFT JOIN rotations rot ON rot.id = sv.rotation_id
         WHERE sv.schedule_id = $1
         ORDER BY sv.severity DESC, sv.block_number`,
        [req.params.id]
      ),
    ]);

    for (const a of assignments) a.ptoWeeks = JSON.parse(a.pto_weeks || '[]');
    res.json({ schedule, assignments, violations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/program/:programId', requireAuth, async (req, res) => {
  try {
    if (parseInt(req.params.programId) !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    const { name, academic_year } = req.body;
    if (!name || !academic_year) return res.status(400).json({ error: 'Name and academic year required' });

    const { rows } = await pool.query(
      `INSERT INTO schedules (program_id, name, academic_year, status) VALUES ($1, $2, $3, 'draft') RETURNING *`,
      [req.params.programId, name, academic_year]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/generate', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows: [program] } = await pool.query('SELECT * FROM programs WHERE id = $1', [schedule.program_id]);
    const { rows: residents } = await pool.query(
      'SELECT * FROM residents WHERE program_id = $1 ORDER BY pgy_year, name',
      [program.id]
    );

    const halfLen = program.block_length_weeks / 2;
    const { rows: rotations } = await pool.query('SELECT * FROM rotations WHERE program_id = $1', [program.id]);

    if (rotations.length > 0) {
      const rotIds = rotations.map(r => r.id);
      const [pgyR, gapR, pgyReqR, prereqR] = await Promise.all([
        pool.query('SELECT rotation_id, pgy_year FROM rotation_pgy_restrictions WHERE rotation_id = ANY($1)', [rotIds]),
        pool.query('SELECT * FROM rotation_gap_rules WHERE rotation_id = ANY($1)', [rotIds]),
        pool.query('SELECT rotation_id, pgy_year, required_blocks FROM rotation_required_by_pgy WHERE rotation_id = ANY($1)', [rotIds]),
        pool.query('SELECT rotation_id, prerequisite_rotation_id FROM rotation_prerequisites WHERE rotation_id = ANY($1)', [rotIds]),
      ]);

      const pgyMap = {}, gapMap = {}, pgyReqMap = {}, prereqMap = {};
      for (const r of pgyR.rows) { (pgyMap[r.rotation_id] = pgyMap[r.rotation_id] || []).push(r.pgy_year); }
      for (const r of gapR.rows) { (gapMap[r.rotation_id] = gapMap[r.rotation_id] || []).push(r); }
      for (const r of pgyReqR.rows) {
        if (!pgyReqMap[r.rotation_id]) pgyReqMap[r.rotation_id] = {};
        pgyReqMap[r.rotation_id][r.pgy_year] = r.required_blocks;
      }
      for (const r of prereqR.rows) { (prereqMap[r.rotation_id] = prereqMap[r.rotation_id] || []).push(r.prerequisite_rotation_id); }

      for (const rot of rotations) {
        rot.pgyRestrictions = pgyMap[rot.id] || [];
        rot.gapRules        = gapMap[rot.id] || [];
        rot.pgyRequirements = pgyReqMap[rot.id] || {};
        rot.prerequisites   = prereqMap[rot.id] || [];
        rot.ptoEligible     = Boolean(rot.pto_eligible);
        rot.minCapacity     = rot.min_capacity;
        rot.maxCapacity     = rot.max_capacity;
        rot.nightFloat      = Boolean(rot.night_float);
        rot.preferredBlockMin = rot.preferred_block_min ?? null;
        rot.preferredBlockMax = rot.preferred_block_max ?? null;
        rot.durationWeeks   = rot.two_week ? halfLen : program.block_length_weeks;
        rot.canSplitToHalf  = Boolean(rot.can_split_to_half);
        rot.callType        = rot.call_type || 'none';
        rot.maxConsecutiveBlocks         = rot.max_consecutive_blocks ?? null;
        rot.continuityClinicalCompatible = Boolean(rot.continuity_clinic_compatible ?? 1);
      }
    }

    const [{ rows: ptoRows }, { rows: leaveRows }, { rows: electiveRows }, { rows: pinnedRows }] = await Promise.all([
      pool.query(
        `SELECT resident_id as "residentId", week_number as "weekNumber"
         FROM pto_requests WHERE schedule_id = $1 AND status != 'denied'`,
        [schedule.id]
      ),
      pool.query(
        `SELECT resident_id as "residentId", start_block as "startBlock", end_block as "endBlock"
         FROM resident_leave_periods WHERE schedule_id = $1`,
        [schedule.id]
      ),
      pool.query(
        `SELECT resident_id as "residentId", rotation_id as "rotationId", rank
         FROM elective_preferences WHERE schedule_id = $1 ORDER BY resident_id, rank`,
        [schedule.id]
      ),
      pool.query(
        `SELECT resident_id as "residentId", rotation_id as "rotationId",
                block_number as "blockNumber", block_half as "halfBlock"
         FROM assignments WHERE schedule_id = $1 AND pinned = 1`,
        [schedule.id]
      ),
    ]);

    // Build cross-program coverage
    const existingCoverage = {};
    const { rows: serviceLinks } = await pool.query(
      'SELECT rotation_id, shared_service_id FROM rotation_shared_service WHERE rotation_id = ANY($1)',
      [rotations.map(r => r.id)]
    );

    const rotationServiceMap = {};
    for (const link of serviceLinks) {
      (rotationServiceMap[link.rotation_id] = rotationServiceMap[link.rotation_id] || []).push(link.shared_service_id);
    }

    const serviceIds = [...new Set(Object.values(rotationServiceMap).flat())];
    if (serviceIds.length > 0) {
      const { rows: otherSchedules } = await pool.query(
        `SELECT s.id, s.program_id FROM schedules s
         WHERE s.program_id != $1 AND s.generated_at IS NOT NULL
         ORDER BY s.generated_at DESC`,
        [program.id]
      );

      const latestByProgram = {};
      for (const s of otherSchedules) {
        if (!latestByProgram[s.program_id]) latestByProgram[s.program_id] = s.id;
      }
      const otherScheduleIds = Object.values(latestByProgram);

      if (otherScheduleIds.length > 0) {
        // Get all rotations from other programs linked to the same services
        const { rows: otherRotLinks } = await pool.query(
          `SELECT rss.rotation_id, rss.shared_service_id
           FROM rotation_shared_service rss
           JOIN rotations r ON r.id = rss.rotation_id
           WHERE rss.shared_service_id = ANY($1) AND r.program_id != $2`,
          [serviceIds, program.id]
        );

        // For each rotation in this program that has shared services, find coverage from other programs
        for (const [rotIdStr, svcIds] of Object.entries(rotationServiceMap)) {
          const rotId = parseInt(rotIdStr);
          const otherRotIds = otherRotLinks
            .filter(r => svcIds.includes(r.shared_service_id))
            .map(r => r.rotation_id);

          if (otherRotIds.length === 0) continue;

          const { rows: coverageRows } = await pool.query(
            `SELECT a.block_number, COUNT(DISTINCT a.resident_id) as cnt
             FROM assignments a
             WHERE a.schedule_id = ANY($1) AND a.rotation_id = ANY($2)
             GROUP BY a.block_number`,
            [otherScheduleIds, otherRotIds]
          );

          existingCoverage[rotId] = {};
          for (const row of coverageRows) {
            if (Number(row.cnt) > 0) existingCoverage[rotId][row.block_number] = Number(row.cnt);
          }
        }
      }
    }

    const formattedResidents = residents.map(r => ({
      id: r.id,
      name: r.name,
      pgyYear: r.pgy_year,
      ptoWeeksAllotted: r.pto_weeks_allotted,
    }));

    const result = generateSchedule({
      residents: formattedResidents,
      rotations,
      ptoRequests: ptoRows,
      blockLengthWeeks: program.block_length_weeks,
      totalBlocks: program.total_blocks,
      existingCoverage,
      maxConsecutiveBlocksSameRotation: program.max_consecutive_blocks_same_rotation ?? null,
      leavePeriods: leaveRows,
      electivePreferences: electiveRows,
      pinnedAssignments: pinnedRows,
    });

    await transaction(async (client) => {
      await client.query('DELETE FROM assignments WHERE schedule_id = $1', [schedule.id]);
      await client.query('DELETE FROM schedule_violations WHERE schedule_id = $1', [schedule.id]);

      for (const a of result.assignments) {
        await client.query(
          `INSERT INTO assignments (schedule_id, resident_id, rotation_id, block_number, block_half, pto_weeks, pinned)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [schedule.id, a.residentId, a.rotationId || null, a.blockNumber, a.halfBlock || 'full', JSON.stringify(a.ptoWeeks), a.pinned ? 1 : 0]
        );
      }

      for (const v of result.violations) {
        await client.query(
          `INSERT INTO schedule_violations (schedule_id, violation_type, severity, block_number, resident_id, rotation_id, message)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [schedule.id, v.type, v.severity, v.blockNumber || null, v.residentId || null, v.rotationId || null, v.message]
        );
      }

      await client.query(
        `UPDATE schedules SET generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [schedule.id]
      );
      await client.query(
        `INSERT INTO schedule_change_log (schedule_id, change_type, old_value, new_value)
         VALUES ($1, 'regenerated', 'All assignments', $2)`,
        [schedule.id, `Regenerated (${result.assignments.length} assignments)`]
      );
    });

    const errorCount = result.violations.filter(v => v.severity === 'error').length;
    const warningCount = result.violations.filter(v => v.severity === 'warning').length;
    res.json({ success: true, assignmentsCreated: result.assignments.length, violations: result.violations, errorCount, warningCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { name, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE schedules SET name=$1, status=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`,
      [name || schedule.name, status || schedule.status, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/export', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const [{ rows: [program] }, { rows: residents }, { rows: assignments }] = await Promise.all([
      pool.query('SELECT * FROM programs WHERE id = $1', [schedule.program_id]),
      pool.query('SELECT * FROM residents WHERE program_id = $1 ORDER BY pgy_year, name', [schedule.program_id]),
      pool.query(
        `SELECT a.resident_id, a.block_number, a.block_half, a.pto_weeks, a.elective_label, rot.name as rotation_name
         FROM assignments a
         LEFT JOIN rotations rot ON rot.id = a.rotation_id
         WHERE a.schedule_id = $1`,
        [req.params.id]
      ),
    ]);

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/assignments/upsert', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { resident_id, block_number, block_half, rotation_id, elective_label } = req.body;
    if (!resident_id || !block_number) return res.status(400).json({ error: 'resident_id and block_number required' });

    const half = block_half || 'full';
    const { rows: [existing] } = await pool.query(
      'SELECT * FROM assignments WHERE schedule_id = $1 AND resident_id = $2 AND block_number = $3 AND block_half = $4',
      [req.params.id, resident_id, block_number, half]
    );

    const [{ rows: [rotRow] }, { rows: [resRow] }] = await Promise.all([
      rotation_id ? pool.query('SELECT name FROM rotations WHERE id = $1', [rotation_id]) : Promise.resolve({ rows: [null] }),
      pool.query('SELECT name FROM residents WHERE id = $1', [resident_id]),
    ]);

    const newRot = rotation_id ? rotRow?.name : (elective_label || 'Elective');
    const residentName = resRow?.name;
    const oldRot = existing?.rotation_id
      ? (await pool.query('SELECT name FROM rotations WHERE id = $1', [existing.rotation_id])).rows[0]?.name
      : (existing?.elective_label || 'Elective');

    if (existing) {
      await pool.query('UPDATE assignments SET rotation_id=$1, elective_label=$2 WHERE id=$3', [
        rotation_id !== undefined ? (rotation_id || null) : existing.rotation_id,
        elective_label !== undefined ? (elective_label || null) : existing.elective_label,
        existing.id,
      ]);
    } else {
      await pool.query(
        'INSERT INTO assignments (schedule_id, resident_id, rotation_id, block_number, block_half, pto_weeks, elective_label) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, resident_id, rotation_id || null, block_number, half, '[]', elective_label || null]
      );
    }

    await pool.query('UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await pool.query(
      `INSERT INTO schedule_change_log (schedule_id, change_type, resident_id, block_number, old_value, new_value)
       VALUES ($1, 'manual_edit', $2, $3, $4, $5)`,
      [req.params.id, resident_id, block_number, `${oldRot} (${half})`, `${newRot} (${half})`]
    );

    res.json({ success: true, residentName, block: block_number, half, oldRot, newRot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/assignments/:assignmentId', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows: [assignment] } = await pool.query(
      'SELECT * FROM assignments WHERE id = $1 AND schedule_id = $2',
      [req.params.assignmentId, req.params.id]
    );
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const { rotation_id, elective_label } = req.body;

    const oldRot = assignment.rotation_id
      ? (await pool.query('SELECT name FROM rotations WHERE id = $1', [assignment.rotation_id])).rows[0]?.name
      : (assignment.elective_label || 'Elective');
    const newRot = rotation_id
      ? (await pool.query('SELECT name FROM rotations WHERE id = $1', [rotation_id])).rows[0]?.name
      : (elective_label !== undefined ? (elective_label || 'Elective') : oldRot);
    const residentName = (await pool.query('SELECT name FROM residents WHERE id = $1', [assignment.resident_id])).rows[0]?.name;

    await pool.query('UPDATE assignments SET rotation_id=$1, elective_label=$2 WHERE id=$3', [
      rotation_id !== undefined ? (rotation_id || null) : assignment.rotation_id,
      elective_label !== undefined ? (elective_label || null) : assignment.elective_label,
      assignment.id,
    ]);
    await pool.query('UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await pool.query(
      `INSERT INTO schedule_change_log (schedule_id, change_type, resident_id, block_number, old_value, new_value)
       VALUES ($1, 'manual_edit', $2, $3, $4, $5)`,
      [req.params.id, assignment.resident_id, assignment.block_number, oldRot, newRot]
    );

    res.json({ success: true, residentName, block: assignment.block_number, oldRot, newRot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    if (schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/assignments/:assignmentId/pin', requireAuth, async (req, res) => {
  try {
    const { rows: [schedule] } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule || schedule.program_id !== req.user.programId) return res.status(403).json({ error: 'Forbidden' });

    const { rows: [assignment] } = await pool.query(
      'SELECT * FROM assignments WHERE id = $1 AND schedule_id = $2',
      [req.params.assignmentId, req.params.id]
    );
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const newPinned = req.body.pinned ? 1 : 0;
    await pool.query('UPDATE assignments SET pinned = $1 WHERE id = $2', [newPinned, assignment.id]);
    res.json({ success: true, pinned: newPinned === 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
