const { generateSchedule } = require('./algorithm.js');

// ─── RESIDENTS ────────────────────────────────────────────────────────────────
const residents = [
  // PGY-1 (Intern Year)
  { id: 'r1',  name: 'Dr. Emma Chen',          pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r2',  name: 'Dr. Marcus Williams',     pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r3',  name: 'Dr. Sofia Patel',         pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r4',  name: "Dr. James O'Brien",       pgyYear: 1, ptoWeeksAllotted: 3 },
  { id: 'r5',  name: 'Dr. Aisha Johnson',       pgyYear: 1, ptoWeeksAllotted: 3 },
  // PGY-2
  { id: 'r6',  name: 'Dr. Tyler Brooks',        pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r7',  name: 'Dr. Priya Sharma',        pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r8',  name: 'Dr. Carlos Rivera',       pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r9',  name: 'Dr. Hannah Lee',          pgyYear: 2, ptoWeeksAllotted: 3 },
  { id: 'r10', name: 'Dr. Nathan Foster',       pgyYear: 2, ptoWeeksAllotted: 3 },
  // PGY-3
  { id: 'r11', name: 'Dr. Rachel Kim',          pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r12', name: 'Dr. David Park',          pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r13', name: 'Dr. Jennifer Taylor',     pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r14', name: 'Dr. Alex Martinez',       pgyYear: 3, ptoWeeksAllotted: 3 },
  { id: 'r15', name: 'Dr. Olivia Thompson',     pgyYear: 3, ptoWeeksAllotted: 3 },
];

// ─── ROTATIONS ────────────────────────────────────────────────────────────────
// pgyRequirements are in HALF-BLOCK UNITS: 2 = one full 4-wk block, 1 = one 2-wk half-block
const rotations = [
  // ── Required across all PGY levels ──────────────────────────────────────────
  {
    id: 'adult_ip',
    name: 'Adult Inpatient',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 2,
    maxCapacity: 6,
    ptoEligible: false,
    // PGY-1: 4 blocks (heavy intern service), PGY-2/3: 2 blocks each
    pgyRequirements: { 1: 8, 2: 4, 3: 4 },
    maxConsecutiveBlocks: 3,
  },
  {
    id: 'fm_clinic',
    name: 'Family Medicine Clinic',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 5,
    ptoEligible: true,
    pgyRequirements: { 1: 2, 2: 2, 3: 2 },
    preferredBlockMin: 1,
    preferredBlockMax: 5,
  },
  {
    id: 'icu',
    name: 'ICU / Critical Care',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: false,
    pgyRequirements: { 1: 2, 2: 2, 3: 2 },
    maxConsecutiveBlocks: 2,
  },
  {
    id: 'ed',
    name: 'Emergency Department',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: false,
    pgyRequirements: { 1: 2, 2: 2, 3: 2 },
  },

  // ── Required PGY-1 & PGY-2 only ─────────────────────────────────────────────
  {
    id: 'obgyn',
    name: 'OB/GYN & Maternity',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: false,
    pgyRestrictions: [1, 2],
    pgyRequirements: { 1: 4, 2: 2 },
  },
  {
    id: 'peds',
    name: 'Pediatrics',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: false,
    pgyRestrictions: [1, 2],
    pgyRequirements: { 1: 2, 2: 2 },
  },
  {
    id: 'surgery',
    name: 'General Surgery',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: false,
    pgyRestrictions: [1, 2],
    pgyRequirements: { 1: 2, 2: 2 },
  },
  {
    id: 'psych',
    name: 'Psychiatry',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: true,
    pgyRestrictions: [1, 2],
    pgyRequirements: { 1: 2, 2: 0 },
  },

  // ── Required PGY-1 only ──────────────────────────────────────────────────────
  {
    id: 'night_float',
    name: 'Night Float',
    type: 'required',
    durationWeeks: 2,   // ALWAYS-HALF
    minCapacity: 1,
    maxCapacity: 2,
    ptoEligible: false,
    pgyRestrictions: [1],
    pgyRequirements: { 1: 1 },
    callType: 'night_float',
  },

  // ── Required PGY-2 & PGY-3 ──────────────────────────────────────────────────
  {
    id: 'cardiology',
    name: 'Cardiology',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: true,
    pgyRestrictions: [2, 3],
    pgyRequirements: { 2: 2, 3: 2 },
  },
  {
    id: 'geriatrics',
    name: 'Geriatrics',
    type: 'required',
    durationWeeks: 4,
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: true,
    pgyRestrictions: [2, 3],
    pgyRequirements: { 2: 2, 3: 2 },
  },

  // ── Required PGY-3 only ──────────────────────────────────────────────────────
  {
    id: 'palliative',
    name: 'Palliative Care',
    type: 'required',
    durationWeeks: 2,   // ALWAYS-HALF
    minCapacity: 1,
    maxCapacity: 2,
    ptoEligible: true,
    pgyRestrictions: [3],
    pgyRequirements: { 3: 1 },
  },

  // ── Electives (PGY-2 & PGY-3) ───────────────────────────────────────────────
  {
    id: 'sports_med',
    name: 'Sports Medicine',
    type: 'elective',
    durationWeeks: 4,
    minCapacity: 0,
    maxCapacity: 2,
    ptoEligible: true,
    pgyRestrictions: [2, 3],
  },
  {
    id: 'derm',
    name: 'Dermatology',
    type: 'elective',
    durationWeeks: 4,
    minCapacity: 0,
    maxCapacity: 2,
    ptoEligible: true,
    pgyRestrictions: [2, 3],
  },
  {
    id: 'ortho',
    name: 'Orthopedics',
    type: 'elective',
    durationWeeks: 4,
    minCapacity: 0,
    maxCapacity: 2,
    ptoEligible: true,
    pgyRestrictions: [2, 3],
  },
  {
    id: 'ultrasound',
    name: 'Ultrasound & Procedures',
    type: 'elective',
    durationWeeks: 2,   // ALWAYS-HALF
    minCapacity: 0,
    maxCapacity: 3,
    ptoEligible: true,
    pgyRestrictions: [2, 3],
  },
];

// ─── PTO REQUESTS ─────────────────────────────────────────────────────────────
// Week numbers: Block N covers weeks (N-1)*4+1 through N*4
const ptoRequests = [
  // PGY-1
  { residentId: 'r1',  weekNumber: 5  },  // Block 2-A
  { residentId: 'r1',  weekNumber: 6  },  // Block 2-A
  { residentId: 'r2',  weekNumber: 21 },  // Block 6
  { residentId: 'r3',  weekNumber: 33 },  // Block 9
  { residentId: 'r4',  weekNumber: 45 },  // Block 12
  { residentId: 'r5',  weekNumber: 13 },  // Block 4
  // PGY-2
  { residentId: 'r6',  weekNumber: 9  },  // Block 3
  { residentId: 'r7',  weekNumber: 29 },  // Block 8
  { residentId: 'r8',  weekNumber: 41 },  // Block 11
  { residentId: 'r9',  weekNumber: 17 },  // Block 5
  { residentId: 'r10', weekNumber: 37 },  // Block 10
  // PGY-3
  { residentId: 'r11', weekNumber: 25 },  // Block 7
  { residentId: 'r12', weekNumber: 49 },  // Block 13
  { residentId: 'r13', weekNumber: 5  },  // Block 2
  { residentId: 'r14', weekNumber: 21 },  // Block 6
  { residentId: 'r15', weekNumber: 33 },  // Block 9
];

// ─── ELECTIVE PREFERENCES ────────────────────────────────────────────────────
const electivePreferences = [
  // PGY-2 (each submits 4 preferences for ~3 open slots)
  { residentId: 'r6',  rotationId: 'sports_med', rank: 1 },
  { residentId: 'r6',  rotationId: 'ortho',      rank: 2 },
  { residentId: 'r6',  rotationId: 'derm',       rank: 3 },
  { residentId: 'r6',  rotationId: 'ultrasound', rank: 4 },

  { residentId: 'r7',  rotationId: 'derm',       rank: 1 },
  { residentId: 'r7',  rotationId: 'ultrasound', rank: 2 },
  { residentId: 'r7',  rotationId: 'sports_med', rank: 3 },
  { residentId: 'r7',  rotationId: 'ortho',      rank: 4 },

  { residentId: 'r8',  rotationId: 'ortho',      rank: 1 },
  { residentId: 'r8',  rotationId: 'sports_med', rank: 2 },
  { residentId: 'r8',  rotationId: 'ultrasound', rank: 3 },
  { residentId: 'r8',  rotationId: 'derm',       rank: 4 },

  { residentId: 'r9',  rotationId: 'derm',       rank: 1 },
  { residentId: 'r9',  rotationId: 'ortho',      rank: 2 },
  { residentId: 'r9',  rotationId: 'ultrasound', rank: 3 },
  { residentId: 'r9',  rotationId: 'sports_med', rank: 4 },

  { residentId: 'r10', rotationId: 'sports_med', rank: 1 },
  { residentId: 'r10', rotationId: 'ultrasound', rank: 2 },
  { residentId: 'r10', rotationId: 'derm',       rank: 3 },
  { residentId: 'r10', rotationId: 'ortho',      rank: 4 },

  // PGY-3 (more open slots — 5+ preferences)
  { residentId: 'r11', rotationId: 'sports_med', rank: 1 },
  { residentId: 'r11', rotationId: 'derm',       rank: 2 },
  { residentId: 'r11', rotationId: 'ortho',      rank: 3 },
  { residentId: 'r11', rotationId: 'ultrasound', rank: 4 },

  { residentId: 'r12', rotationId: 'derm',       rank: 1 },
  { residentId: 'r12', rotationId: 'ortho',      rank: 2 },
  { residentId: 'r12', rotationId: 'sports_med', rank: 3 },
  { residentId: 'r12', rotationId: 'ultrasound', rank: 4 },

  { residentId: 'r13', rotationId: 'ortho',      rank: 1 },
  { residentId: 'r13', rotationId: 'sports_med', rank: 2 },
  { residentId: 'r13', rotationId: 'derm',       rank: 3 },
  { residentId: 'r13', rotationId: 'ultrasound', rank: 4 },

  { residentId: 'r14', rotationId: 'ultrasound', rank: 1 },
  { residentId: 'r14', rotationId: 'derm',       rank: 2 },
  { residentId: 'r14', rotationId: 'sports_med', rank: 3 },
  { residentId: 'r14', rotationId: 'ortho',      rank: 4 },

  { residentId: 'r15', rotationId: 'sports_med', rank: 1 },
  { residentId: 'r15', rotationId: 'ortho',      rank: 2 },
  { residentId: 'r15', rotationId: 'ultrasound', rank: 3 },
  { residentId: 'r15', rotationId: 'derm',       rank: 4 },
];

// ─── RUN ALGORITHM ────────────────────────────────────────────────────────────
const result = generateSchedule({
  residents,
  rotations,
  ptoRequests,
  blockLengthWeeks: 4,
  totalBlocks: 13,
  electivePreferences,
  maxConsecutiveBlocksSameRotation: 3,
});

// ─── OUTPUT FORMATTING ────────────────────────────────────────────────────────
const rotationMap = Object.fromEntries(rotations.map(r => [r.id, r]));
const residentMap = Object.fromEntries(residents.map(r => [r.id, r]));

// Build lookup: residentId → blockNumber → assignments[]
const byResident = {};
for (const r of residents) byResident[r.id] = {};
for (const a of result.assignments) {
  if (!byResident[a.residentId][a.blockNumber]) byResident[a.residentId][a.blockNumber] = [];
  byResident[a.residentId][a.blockNumber].push(a);
}

// Compute block date labels (starting July 1, 2025 = Block 1)
function blockLabel(n) {
  // Block 1 starts July 1
  const startMs = new Date('2025-07-01').getTime() + (n - 1) * 4 * 7 * 24 * 3600 * 1000;
  const endMs   = startMs + 4 * 7 * 24 * 3600 * 1000 - 24 * 3600 * 1000;
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(new Date(startMs))} – ${fmt(new Date(endMs))}`;
}

const LINE = '═'.repeat(110);
const line = '─'.repeat(108);

console.log('\n' + LINE);
console.log('  RIVERSIDE FAMILY MEDICINE RESIDENCY PROGRAM — AY 2025–2026  (13 × 4-Week Blocks)');
console.log(LINE);

for (const pgyYear of [1, 2, 3]) {
  const pgyResidents = residents.filter(r => r.pgyYear === pgyYear);
  console.log(`\n\n${'▓'.repeat(110)}`);
  console.log(`  PGY-${pgyYear} RESIDENTS${pgyYear === 1 ? '  ★ INTERN YEAR — Tightly structured curriculum' : pgyYear === 2 ? '  — Broadening clinical scope' : '  — Maximizing electives & leadership'}`);
  console.log('▓'.repeat(110));

  for (const resident of pgyResidents) {
    console.log(`\n  ${resident.name}  |  PTO allotment: ${resident.ptoWeeksAllotted} weeks`);
    console.log(`  ${line}`);
    console.log(`  ${'Block'.padEnd(8)} ${'Dates'.padEnd(28)} ${'Assignment(s)'.padEnd(68)}`);
    console.log(`  ${line}`);

    for (let block = 1; block <= 13; block++) {
      const assignments = byResident[resident.id][block] || [];
      const dateStr = blockLabel(block);

      if (assignments.length === 0) {
        console.log(`  B${String(block).padStart(2, '0')}     ${dateStr.padEnd(28)} [NO ASSIGNMENT]`);
        continue;
      }

      const parts = assignments.map(a => {
        const rot = a.rotationId ? rotationMap[a.rotationId] : null;
        const name = rot ? rot.name : '— Elective TBD —';
        const tag = rot?.type === 'elective' ? ' (EL)' : '';
        const half = a.halfBlock === 'full' ? '' : a.halfBlock === 'A' ? ' [wks 1-2]' : ' [wks 3-4]';
        const pto = a.ptoWeeks?.length > 0 ? ` ✦PTO wk ${a.ptoWeeks.join(',')}` : '';
        return `${name}${tag}${half}${pto}`;
      });

      console.log(`  B${String(block).padStart(2, '0')}     ${dateStr.padEnd(28)} ${parts.join('  |  ')}`);
    }
  }
}

// ─── COMPLETION SUMMARY ───────────────────────────────────────────────────────
console.log(`\n\n${LINE}`);
console.log('  CURRICULUM COMPLETION SUMMARY  (required rotations only)');
console.log(LINE);

// Compute completion from assignments
const completionActual = {};
for (const r of residents) {
  completionActual[r.id] = {};
  for (const rot of rotations) completionActual[r.id][rot.id] = 0;
}
for (const a of result.assignments) {
  if (!a.rotationId) continue;
  const units = a.halfBlock === 'full' ? 2 : 1;
  if (completionActual[a.residentId]) completionActual[a.residentId][a.rotationId] += units;
}

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

const requiredRotations = rotations.filter(r => r.type === 'required');

for (const pgyYear of [1, 2, 3]) {
  const pgyResidents = residents.filter(r => r.pgyYear === pgyYear);
  console.log(`\n  PGY-${pgyYear}:`);
  for (const resident of pgyResidents) {
    const items = [];
    for (const rot of requiredRotations) {
      if (!isPGYEligible(resident, rot)) continue;
      const req = getRequiredHalfUnits(resident, rot);
      if (req === 0) continue;
      const done = completionActual[resident.id][rot.id] || 0;
      const blocks = rot.durationWeeks === 2 ? `${done}/${req} half-units` : `${done/2}/${req/2} blks`;
      const status = done >= req ? '✓' : '✗';
      items.push(`${status} ${rot.name}: ${blocks}`);
    }
    console.log(`\n  ${resident.name}`);
    // Print in two columns
    const colWidth = 42;
    for (let i = 0; i < items.length; i += 2) {
      const left  = (items[i]   || '').padEnd(colWidth);
      const right = (items[i+1] || '');
      console.log(`    ${left}  ${right}`);
    }
  }
}

// ─── VIOLATIONS ───────────────────────────────────────────────────────────────
console.log(`\n\n${LINE}`);
console.log('  SCHEDULE VALIDATION');
console.log(LINE);
if (result.violations.length === 0) {
  console.log('\n  ✓ No violations — schedule is clean.\n');
} else {
  const errors   = result.violations.filter(v => v.severity === 'error');
  const warnings = result.violations.filter(v => v.severity === 'warning');
  if (errors.length)   errors.forEach(v   => console.log(`  ✗ [ERROR]   ${v.message}`));
  if (warnings.length) warnings.forEach(v => console.log(`  ⚠ [WARNING] ${v.message}`));
  console.log('');
}
