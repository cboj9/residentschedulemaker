const { generateSchedule } = require('./algorithm.js');
const fs = require('fs');
const path = require('path');

// ─── DATA (same as demo run) ──────────────────────────────────────────────────
const residents = [
  { id: 'r1',  name: 'Dr. Emma Chen',          pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r2',  name: 'Dr. Marcus Williams',     pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r3',  name: 'Dr. Sofia Patel',         pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r4',  name: "Dr. James O'Brien",       pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r5',  name: 'Dr. Aisha Johnson',       pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r6',  name: 'Dr. Tyler Brooks',        pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r7',  name: 'Dr. Priya Sharma',        pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r8',  name: 'Dr. Carlos Rivera',       pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r9',  name: 'Dr. Hannah Lee',          pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r10', name: 'Dr. Nathan Foster',       pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r11', name: 'Dr. Rachel Kim',          pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r12', name: 'Dr. David Park',          pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r13', name: 'Dr. Jennifer Taylor',     pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r14', name: 'Dr. Alex Martinez',       pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r15', name: 'Dr. Olivia Thompson',     pgyYear: 3, ptoWeeksAllotted: 3 },
];

const rotations = [
  { id: 'adult_ip',   name: 'Adult Inpatient',          type: 'required', durationWeeks: 4, minCapacity: 2, maxCapacity: 6, ptoEligible: false, pgyRequirements: { 1: 8, 2: 4, 3: 4 }, maxConsecutiveBlocks: 3 },
  { id: 'fm_clinic',  name: 'Family Medicine Clinic',   type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 5, ptoEligible: true,  pgyRequirements: { 1: 2, 2: 2, 3: 2 }, preferredBlockMin: 1, preferredBlockMax: 5 },
  { id: 'icu',        name: 'ICU / Critical Care',       type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 4, ptoEligible: false, pgyRequirements: { 1: 2, 2: 2, 3: 2 }, maxConsecutiveBlocks: 2 },
  { id: 'ed',         name: 'Emergency Department',      type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 4, ptoEligible: false, pgyRequirements: { 1: 2, 2: 2, 3: 2 } },
  { id: 'obgyn',      name: 'OB/GYN & Maternity',        type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 4, ptoEligible: false, pgyRestrictions: [1, 2], pgyRequirements: { 1: 4, 2: 2 } },
  { id: 'peds',       name: 'Pediatrics',                type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 3, ptoEligible: false, pgyRestrictions: [1, 2], pgyRequirements: { 1: 2, 2: 2 } },
  { id: 'surgery',    name: 'General Surgery',           type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 3, ptoEligible: false, pgyRestrictions: [1, 2], pgyRequirements: { 1: 2, 2: 2 } },
  { id: 'psych',      name: 'Psychiatry',                type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 3, ptoEligible: true,  pgyRestrictions: [1, 2], pgyRequirements: { 1: 2, 2: 0 } },
  { id: 'night_float',name: 'Night Float',               type: 'required', durationWeeks: 2, minCapacity: 1, maxCapacity: 2, ptoEligible: false, pgyRestrictions: [1],    pgyRequirements: { 1: 1 }, callType: 'night_float' },
  { id: 'cardiology', name: 'Cardiology',                type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 3, ptoEligible: true,  pgyRestrictions: [2, 3], pgyRequirements: { 2: 2, 3: 2 } },
  { id: 'geriatrics', name: 'Geriatrics',                type: 'required', durationWeeks: 4, minCapacity: 1, maxCapacity: 3, ptoEligible: true,  pgyRestrictions: [2, 3], pgyRequirements: { 2: 2, 3: 2 } },
  { id: 'palliative', name: 'Palliative Care',           type: 'required', durationWeeks: 2, minCapacity: 1, maxCapacity: 2, ptoEligible: true,  pgyRestrictions: [3],    pgyRequirements: { 3: 1 } },
  { id: 'sports_med', name: 'Sports Medicine',           type: 'elective', durationWeeks: 4, minCapacity: 0, maxCapacity: 2, ptoEligible: true,  pgyRestrictions: [2, 3] },
  { id: 'derm',       name: 'Dermatology',               type: 'elective', durationWeeks: 4, minCapacity: 0, maxCapacity: 2, ptoEligible: true,  pgyRestrictions: [2, 3] },
  { id: 'ortho',      name: 'Orthopedics',               type: 'elective', durationWeeks: 4, minCapacity: 0, maxCapacity: 2, ptoEligible: true,  pgyRestrictions: [2, 3] },
  { id: 'ultrasound', name: 'Ultrasound & Procedures',   type: 'elective', durationWeeks: 2, minCapacity: 0, maxCapacity: 3, ptoEligible: true,  pgyRestrictions: [2, 3] },
];

const ptoRequests = [
  { residentId: 'r1',  weekNumber: 5  }, { residentId: 'r1',  weekNumber: 6  },
  { residentId: 'r2',  weekNumber: 21 }, { residentId: 'r3',  weekNumber: 33 },
  { residentId: 'r4',  weekNumber: 45 }, { residentId: 'r5',  weekNumber: 13 },
  { residentId: 'r6',  weekNumber: 9  }, { residentId: 'r7',  weekNumber: 29 },
  { residentId: 'r8',  weekNumber: 41 }, { residentId: 'r9',  weekNumber: 17 },
  { residentId: 'r10', weekNumber: 37 }, { residentId: 'r11', weekNumber: 25 },
  { residentId: 'r12', weekNumber: 49 }, { residentId: 'r13', weekNumber: 5  },
  { residentId: 'r14', weekNumber: 21 }, { residentId: 'r15', weekNumber: 33 },
];

const electivePreferences = [
  { residentId: 'r6',  rotationId: 'sports_med', rank: 1 }, { residentId: 'r6',  rotationId: 'ortho',      rank: 2 },
  { residentId: 'r6',  rotationId: 'derm',       rank: 3 }, { residentId: 'r6',  rotationId: 'ultrasound', rank: 4 },
  { residentId: 'r7',  rotationId: 'derm',       rank: 1 }, { residentId: 'r7',  rotationId: 'ultrasound', rank: 2 },
  { residentId: 'r7',  rotationId: 'sports_med', rank: 3 }, { residentId: 'r7',  rotationId: 'ortho',      rank: 4 },
  { residentId: 'r8',  rotationId: 'ortho',      rank: 1 }, { residentId: 'r8',  rotationId: 'sports_med', rank: 2 },
  { residentId: 'r8',  rotationId: 'ultrasound', rank: 3 }, { residentId: 'r8',  rotationId: 'derm',       rank: 4 },
  { residentId: 'r9',  rotationId: 'derm',       rank: 1 }, { residentId: 'r9',  rotationId: 'ortho',      rank: 2 },
  { residentId: 'r9',  rotationId: 'ultrasound', rank: 3 }, { residentId: 'r9',  rotationId: 'sports_med', rank: 4 },
  { residentId: 'r10', rotationId: 'sports_med', rank: 1 }, { residentId: 'r10', rotationId: 'ultrasound', rank: 2 },
  { residentId: 'r10', rotationId: 'derm',       rank: 3 }, { residentId: 'r10', rotationId: 'ortho',      rank: 4 },
  { residentId: 'r11', rotationId: 'sports_med', rank: 1 }, { residentId: 'r11', rotationId: 'derm',       rank: 2 },
  { residentId: 'r11', rotationId: 'ortho',      rank: 3 }, { residentId: 'r11', rotationId: 'ultrasound', rank: 4 },
  { residentId: 'r12', rotationId: 'derm',       rank: 1 }, { residentId: 'r12', rotationId: 'ortho',      rank: 2 },
  { residentId: 'r12', rotationId: 'sports_med', rank: 3 }, { residentId: 'r12', rotationId: 'ultrasound', rank: 4 },
  { residentId: 'r13', rotationId: 'ortho',      rank: 1 }, { residentId: 'r13', rotationId: 'sports_med', rank: 2 },
  { residentId: 'r13', rotationId: 'derm',       rank: 3 }, { residentId: 'r13', rotationId: 'ultrasound', rank: 4 },
  { residentId: 'r14', rotationId: 'ultrasound', rank: 1 }, { residentId: 'r14', rotationId: 'derm',       rank: 2 },
  { residentId: 'r14', rotationId: 'sports_med', rank: 3 }, { residentId: 'r14', rotationId: 'ortho',      rank: 4 },
  { residentId: 'r15', rotationId: 'sports_med', rank: 1 }, { residentId: 'r15', rotationId: 'ortho',      rank: 2 },
  { residentId: 'r15', rotationId: 'ultrasound', rank: 3 }, { residentId: 'r15', rotationId: 'derm',       rank: 4 },
];

const result = generateSchedule({
  residents, rotations, ptoRequests,
  blockLengthWeeks: 4, totalBlocks: 13,
  electivePreferences,
  maxConsecutiveBlocksSameRotation: 3,
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const rotationMap = Object.fromEntries(rotations.map(r => [r.id, r]));

const byResident = {};
for (const r of residents) byResident[r.id] = {};
for (const a of result.assignments) {
  if (!byResident[a.residentId][a.blockNumber]) byResident[a.residentId][a.blockNumber] = [];
  byResident[a.residentId][a.blockNumber].push(a);
}

function blockDates(n) {
  const start = new Date('2025-07-01');
  start.setDate(start.getDate() + (n - 1) * 28);
  const end = new Date(start);
  end.setDate(end.getDate() + 27);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Color palette per rotation
const ROT_COLORS = {
  adult_ip:    '#b3d1f7',
  fm_clinic:   '#b7e4c7',
  icu:         '#f7c6b3',
  ed:          '#f9e4a1',
  obgyn:       '#e8b4e8',
  peds:        '#a8e6cf',
  surgery:     '#ffd6a5',
  psych:       '#c9c0f7',
  night_float: '#8ecae6',
  cardiology:  '#f4acac',
  geriatrics:  '#d4e09b',
  palliative:  '#fde8d8',
  sports_med:  '#caffbf',
  derm:        '#fdffb6',
  ortho:       '#ffc6ff',
  ultrasound:  '#a0c4ff',
  null:        '#e8e8e8',
};

function rotColor(id) { return ROT_COLORS[id] || '#e0e0e0'; }

function isPGYEligible(resident, rotation) {
  if (!rotation.pgyRestrictions || rotation.pgyRestrictions.length === 0) return true;
  return rotation.pgyRestrictions.includes(resident.pgyYear);
}
function getRequiredHalfUnits(resident, rotation) {
  if (rotation.pgyRequirements && typeof rotation.pgyRequirements === 'object') {
    const req = rotation.pgyRequirements[resident.pgyYear];
    if (req !== undefined) return req;
    if (Object.keys(rotation.pgyRequirements).length > 0) return 0;
  }
  if (rotation.type !== 'required') return 0;
  return rotation.durationWeeks === 2 ? 1 : 2;
}

// Compute completion from assignments
const completionActual = {};
for (const r of residents) {
  completionActual[r.id] = {};
  for (const rot of rotations) completionActual[r.id][rot.id] = 0;
}
for (const a of result.assignments) {
  if (!a.rotationId) continue;
  completionActual[a.residentId][a.rotationId] += (a.halfBlock === 'full' ? 2 : 1);
}

// ─── HTML GENERATION ──────────────────────────────────────────────────────────

function cellsForBlock(residentId, block) {
  const assignments = byResident[residentId][block] || [];
  if (assignments.length === 0) return `<td colspan="2" style="background:#f0f0f0;color:#999;font-size:9px;text-align:center;">—</td>`;

  // Up to 2 half-slots: A and B
  const halves = { A: null, B: null, full: null };
  for (const a of assignments) {
    if (a.halfBlock === 'full') halves.full = a;
    else halves[a.halfBlock] = a;
  }

  function cellContent(a) {
    if (!a) return `<td style="background:#f5f5f5;"></td>`;
    const rot = a.rotationId ? rotationMap[a.rotationId] : null;
    const name = rot ? rot.name : '<em>Elective TBD</em>';
    const tag = rot?.type === 'elective' ? '<span class="tag-el">EL</span>' : '';
    const pto = a.ptoWeeks?.length > 0 ? `<span class="tag-pto">PTO</span>` : '';
    const bg = rotColor(a.rotationId);
    return `<td style="background:${bg};">${name}${tag}${pto}</td>`;
  }

  if (halves.full) {
    const a = halves.full;
    const rot = a.rotationId ? rotationMap[a.rotationId] : null;
    const name = rot ? rot.name : '<em>Elective TBD</em>';
    const tag = rot?.type === 'elective' ? '<span class="tag-el">EL</span>' : '';
    const pto = a.ptoWeeks?.length > 0 ? `<span class="tag-pto">PTO</span>` : '';
    const bg = rotColor(a.rotationId);
    return `<td colspan="2" style="background:${bg};">${name}${tag}${pto}</td>`;
  }

  return cellContent(halves.A) + cellContent(halves.B);
}

function residentTable(resident) {
  const rows = Array.from({ length: 13 }, (_, i) => i + 1).map(block => {
    return `<tr>
      <td class="block-num">B${String(block).padStart(2, '0')}</td>
      <td class="block-dates">${blockDates(block)}</td>
      ${cellsForBlock(resident.id, block)}
    </tr>`;
  }).join('');

  // Completion badges
  const requiredRotations = rotations.filter(r => r.type === 'required');
  const badges = requiredRotations
    .filter(rot => isPGYEligible(resident, rot))
    .map(rot => {
      const req = getRequiredHalfUnits(resident, rot);
      if (req === 0) return '';
      const done = completionActual[resident.id][rot.id] || 0;
      const ok = done >= req;
      const label = rot.durationWeeks === 2
        ? `${done}/${req} half-units`
        : `${done/2}/${req/2} blks`;
      return `<span class="badge ${ok ? 'badge-ok' : 'badge-err'}">${rot.name}: ${label}</span>`;
    }).join('');

  return `
  <div class="resident-card">
    <div class="resident-header">
      <span class="resident-name">${resident.name}</span>
      <span class="resident-meta">PGY-${resident.pgyYear} &nbsp;|&nbsp; PTO allotment: ${resident.ptoWeeksAllotted} wks</span>
    </div>
    <table class="schedule-table">
      <thead>
        <tr>
          <th>Block</th><th>Dates</th><th>Half A (Wks 1–2)</th><th>Half B (Wks 3–4)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="completion-row">${badges}</div>
  </div>`;
}

function pgySection(year, label, note) {
  const pgyResidents = residents.filter(r => r.pgyYear === year);
  const cards = pgyResidents.map(residentTable).join('');
  return `
  <section class="pgy-section">
    <div class="pgy-header pgy${year}">
      <span class="pgy-label">PGY-${year}</span>
      <span class="pgy-title">${label}</span>
      <span class="pgy-note">${note}</span>
    </div>
    ${cards}
  </section>`;
}

function legendHtml() {
  const items = rotations.map(r =>
    `<span class="legend-item" style="background:${rotColor(r.id)};">${r.name}</span>`
  ).join('');
  return `<div class="legend"><strong>Legend:</strong><br>${items}</div>`;
}

function violationsHtml() {
  if (result.violations.length === 0) return `<p class="no-violations">✓ No violations — schedule is clean.</p>`;
  const errors   = result.violations.filter(v => v.severity === 'error');
  const warnings = result.violations.filter(v => v.severity === 'warning');
  const eRows = errors.map(v => `<li class="v-error">✗ ${v.message}</li>`).join('');
  const wRows = warnings.map(v => `<li class="v-warn">⚠ ${v.message}</li>`).join('');
  return `<ul class="violation-list">${eRows}${wRows}</ul>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Riverside FM Residency — Schedule AY 2025–2026</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1a1a1a; background: #fff; }

  .cover { padding: 40px 48px 24px; border-bottom: 3px solid #1a3a5c; }
  .cover h1 { font-size: 22px; color: #1a3a5c; letter-spacing: .5px; }
  .cover h2 { font-size: 13px; color: #4a4a4a; font-weight: 400; margin-top: 6px; }
  .cover .meta { margin-top: 14px; font-size: 9.5px; color: #666; }
  .cover .meta span { margin-right: 24px; }

  .pgy-section { margin: 0 0 16px; }
  .pgy-header { display: flex; align-items: baseline; gap: 14px; padding: 8px 48px; margin-bottom: 2px; }
  .pgy1 { background: #1a3a5c; color: #fff; }
  .pgy2 { background: #2d6a4f; color: #fff; }
  .pgy3 { background: #6d2b7e; color: #fff; }
  .pgy-label { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
  .pgy-title { font-size: 12px; font-weight: 600; }
  .pgy-note  { font-size: 9px; opacity: .85; font-style: italic; }

  .resident-card { margin: 12px 48px; page-break-inside: avoid; }
  .resident-header { display: flex; align-items: baseline; gap: 16px; padding: 6px 0 4px; border-bottom: 1.5px solid #ccc; }
  .resident-name { font-size: 12px; font-weight: 700; }
  .resident-meta { font-size: 9px; color: #666; }

  .schedule-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .schedule-table th { background: #f0f4f8; font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; padding: 4px 6px; border: 1px solid #d0d8e0; text-align: left; }
  .schedule-table td { border: 1px solid #d0d8e0; padding: 4px 6px; font-size: 9px; vertical-align: middle; }
  .schedule-table td.block-num   { width: 38px; font-weight: 700; color: #444; background: #f8f8f8; }
  .schedule-table td.block-dates { width: 130px; color: #555; }

  .tag-el  { display: inline-block; margin-left: 4px; background: #6d2b7e; color: #fff; border-radius: 3px; padding: 1px 4px; font-size: 7.5px; font-weight: 700; vertical-align: middle; }
  .tag-pto { display: inline-block; margin-left: 4px; background: #c0392b; color: #fff; border-radius: 3px; padding: 1px 4px; font-size: 7.5px; font-weight: 700; vertical-align: middle; }

  .completion-row { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px; }
  .badge { font-size: 8px; padding: 2px 7px; border-radius: 10px; font-weight: 600; }
  .badge-ok  { background: #d4edda; color: #155724; border: 1px solid #b0dfc1; }
  .badge-err { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }

  .legend { margin: 12px 48px 20px; padding: 10px 12px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; }
  .legend strong { display: block; margin-bottom: 7px; font-size: 9.5px; }
  .legend-item { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px; border-radius: 3px; font-size: 8.5px; border: 1px solid rgba(0,0,0,.12); }

  .violations-section { margin: 12px 48px 32px; }
  .violations-section h3 { font-size: 11px; margin-bottom: 8px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .violation-list { list-style: none; font-size: 9px; line-height: 1.8; }
  .v-error { color: #721c24; }
  .v-warn  { color: #856404; }
  .no-violations { font-size: 9px; color: #155724; }

  @media print {
    .pgy-section { page-break-before: always; }
    .pgy-section:first-of-type { page-break-before: avoid; }
    .resident-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="cover">
  <h1>Riverside Family Medicine Residency Program</h1>
  <h2>Annual Rotation Schedule — Academic Year 2025–2026</h2>
  <div class="meta">
    <span>15 Residents &nbsp;(5 per PGY year)</span>
    <span>13 Blocks × 4 Weeks &nbsp;(Jul 1, 2025 – Jun 28, 2026)</span>
    <span>Generated: ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</span>
  </div>
</div>

${legendHtml()}

${pgySection(1, 'Intern Year', '★ Tightly structured — minimal elective time')}
${pgySection(2, 'Second Year', 'Broadening clinical scope')}
${pgySection(3, 'Third Year', 'Maximizing electives & continuity')}

<div class="violations-section">
  <h3>Schedule Validation Notes</h3>
  ${violationsHtml()}
</div>

</body>
</html>`;

const outPath = path.join(__dirname, 'schedule_AY2025-2026.html');
fs.writeFileSync(outPath, html);
console.log('HTML written to:', outPath);
