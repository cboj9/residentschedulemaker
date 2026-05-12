/**
 * Seed the 2025-2026 rotation calendar (from PDF) into program_id 3.
 *
 * Cohort:
 *   PGY1 = FM-PGY1 (8 residents)
 *   PGY2 = FM-PGY2 (7 residents)
 *   PGY3 = FM-PGY3 (6 residents)
 *   PGY4 = TY (13 residents)
 *   PGY5 = PSYCH (4 residents, Adult IP coverage only)
 *
 * pgyReqs values are in HALF-BLOCK UNITS (2 = one full 4-week block, 1 = one 2-week half-block).
 * This matches the algorithm's half-unit completion tracking.
 *
 * Rotation duration:
 *   tw=1  → ALWAYS-HALF  (2-week slot each assignment)
 *   tw=0, csh=0 → ALWAYS-FULL  (4-week slot, both A+B halves)
 *   tw=0, csh=1 → FLEXIBLE  (prefers full block, splits to half when needed)
 *
 * Schedule array: 26 entries per resident (index 0=block1A … 25=block13B).
 * Format: 'Rotation', 'Rotation:V1', 'Rotation:V2', or null (blank/away).
 * V1 = PTO in first week of that half-block; V2 = second week.
 */

const { getDb, transaction } = require('../db/schema');
const db = getDb();
const PROGRAM_ID = 3;

function ptoWeekNum(blockNum, half, vtag) {
  const base = (blockNum - 1) * 4;
  if (half === 'A') return vtag === 'V1' ? base + 1 : base + 2;
  return vtag === 'V1' ? base + 3 : base + 4;
}

// ── Rotation definitions ──────────────────────────────────────────────────────
// Fields: name, type, min, max, pto_eligible, night_float, two_week(tw), can_split_to_half(csh)
// pgyReqs: half-block units required per PGY year (omitted PGY years default to 0 when map non-empty)
// pgyRestr: array of eligible PGY years (empty = all years eligible)
const ROTATIONS = [
  {
    // min=0: 8 PGY1 residents × 1 block = 8 blocks covered; can't fill all 13
    name: 'Addiction', type: 'required', min: 0, max: 3, pto: 1, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 1: 2 },              // PGY1: 1 full block = 2 half-units
    pgyRestr: [1],
  },
  {
    name: 'Adult IP', type: 'required', min: 2, max: 12, pto: 0, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 1: 5, 2: 5, 3: 2, 4: 6, 5: 7 },
    pgyRestr: [],
  },
  {
    name: 'Ambulatory', type: 'required', min: 1, max: 5, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 4: 3 },             // PGY4 TY: ~3 half-units (1.5 full blocks avg)
    pgyRestr: [4],
  },
  {
    name: 'Anes', type: 'required', min: 1, max: 3, pto: 1, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 4: 2 },
    pgyRestr: [4],
  },
  {
    name: 'Cards', type: 'required', min: 1, max: 5, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 1: 2, 4: 2 },
    pgyRestr: [1, 3, 4],
  },
  {
    // min=0, prefMin/Max=1: anchor to block 1, no coverage requirement (every PGY1 does this once)
    name: 'Community Medicine', type: 'required', min: 0, max: 8, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 1: 1 },
    pgyRestr: [1],
    prefMin: 1, prefMax: 1,
  },
  {
    // Concierge: all PGY3 do 1 half-block; PGY2 sometimes uses as elective
    name: 'Concierge', type: 'required', min: 0, max: 3, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 3: 1 },
    pgyRestr: [2, 3],
  },
  {
    name: 'Dermatology', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 3: 1, 4: 0 },       // PGY3 required=1; PGY4 optional (map set non-empty → 0)
    pgyRestr: [2, 3, 4],
  },
  {
    name: 'EM', type: 'required', min: 1, max: 6, pto: 0, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 2: 2, 3: 1, 4: 2 },
    pgyRestr: [2, 3, 4],
  },
  {
    // Endocrinology: appears in some PGY2/3/4 residents as elective fill
    name: 'Endocrinology', type: 'required', min: 1, max: 3, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 1: 0 },             // explicit 0 → all PGY years default to 0
    pgyRestr: [2, 3, 4],
  },
  {
    name: 'ENT', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 1: 0 },             // clinical coverage only, no curriculum requirement
    pgyRestr: [2, 3, 4],
  },
  {
    name: 'FMP', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 2: 1, 3: 4 },       // PGY2: 1 half; PGY3: 4 half-blocks (home clinic)
    pgyRestr: [2, 3],
  },
  {
    name: 'Geri', type: 'required', min: 1, max: 5, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 2: 2, 3: 2 },
    pgyRestr: [2, 3],
  },
  {
    name: 'Gyn', type: 'required', min: 1, max: 4, pto: 0, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 2: 2, 3: 0 },       // PGY2 required; PGY3 optional
    pgyRestr: [2, 3],
  },
  {
    name: 'ICU', type: 'required', min: 1, max: 5, pto: 0, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 1: 2, 4: 2 },
    pgyRestr: [1, 4],
  },
  {
    name: 'ICU (Elective)', type: 'elective', min: 0, max: 2, pto: 0, nf: 0, tw: 1, csh: 0,
    pgyReqs: {},
    pgyRestr: [4],
  },
  {
    name: 'NF', type: 'required', min: 1, max: 12, pto: 0, nf: 1, tw: 1, csh: 0,
    pgyReqs: { 1: 3, 2: 2, 3: 2, 4: 2 },
    pgyRestr: [1, 2, 3, 4],
  },
  {
    name: 'Nephrology', type: 'required', min: 1, max: 5, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 2: 1, 3: 1, 4: 0 }, // PGY2/3 required; PGY4 optional (coverage only)
    pgyRestr: [2, 3, 4],
  },
  {
    name: 'Neuro OP', type: 'elective', min: 0, max: 2, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: {},
    pgyRestr: [2, 3],
  },
  {
    // min=0: 8 PGY1 × 1 block = 8 blocks covered; can't fill all 13 with PGY1-only restriction
    name: 'NICU', type: 'required', min: 0, max: 3, pto: 0, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 1: 2 },
    pgyRestr: [1],
  },
  {
    name: 'OB', type: 'required', min: 1, max: 4, pto: 0, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 1: 2, 2: 2 },
    pgyRestr: [1, 2],
  },
  {
    name: 'Ophtho', type: 'elective', min: 0, max: 2, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: {},
    pgyRestr: [3],
  },
  {
    // min=0, anchored to block 1: all PGY1 residents do this exactly once in block 1
    name: 'Orientation', type: 'required', min: 0, max: 8, pto: 0, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 1: 1 },
    pgyRestr: [1],
    prefMin: 1, prefMax: 1,
  },
  {
    name: 'Ortho', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 2: 1 },             // PGY2: 1 half required; PGY3/4 optional
    pgyRestr: [2, 3, 4],
  },
  {
    name: 'Pain Mgmt', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 1: 0 },             // PGY4 optional only (clinical coverage); PGY2 occasional
    pgyRestr: [2, 4],
  },
  {
    // min=0: 7 PGY2 × 1 block = 7 blocks covered; can't fill all 13
    name: 'Peds ED', type: 'required', min: 0, max: 3, pto: 0, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 2: 2 },
    pgyRestr: [2],
  },
  {
    // min=0: 8 PGY1 × 1 block = 8 blocks covered; can't fill all 13
    name: 'Peds IP', type: 'required', min: 0, max: 3, pto: 0, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 1: 2 },
    pgyRestr: [1],
  },
  {
    name: 'Peds OP', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 1: 2, 3: 2 },
    pgyRestr: [1, 3],
  },
  {
    name: 'PM', type: 'required', min: 1, max: 3, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 3: 2 },
    pgyRestr: [3],
  },
  {
    name: 'Psych', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 2: 1, 3: 1, 4: 0 },
    pgyRestr: [2, 3, 4],
  },
  {
    name: 'Radiology', type: 'required', min: 1, max: 4, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 3: 1, 4: 0 },
    pgyRestr: [3, 4],
  },
  {
    name: 'Spanish Med', type: 'required', min: 1, max: 3, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 1: 0 },             // optional elective fill for PGY2/3
    pgyRestr: [2, 3],
  },
  {
    // min=0: 7 PGY2 × 1 half = 7 half-slots; can't fill 13 blocks
    name: 'Sports Med', type: 'required', min: 0, max: 3, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 2: 1 },
    pgyRestr: [2],
  },
  {
    // min=0: only 1/6 PGY3 residents do this; fully optional
    name: 'Sports Med/Ortho', type: 'required', min: 0, max: 2, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 1: 0 },
    pgyRestr: [3],
  },
  {
    name: 'Surgery', type: 'required', min: 1, max: 5, pto: 0, nf: 0, tw: 0, csh: 0,
    pgyReqs: { 1: 2, 4: 2 },
    pgyRestr: [1, 4],
  },
  {
    // Transition to Attending: all PGY3 do exactly 1 half-block at year end
    name: 'Transition to Attending', type: 'required', min: 0, max: 6, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: { 3: 1 },
    pgyRestr: [3],
  },
  {
    name: 'Urgent Care', type: 'elective', min: 0, max: 2, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: {},
    pgyRestr: [2],
  },
  {
    name: 'Urology', type: 'required', min: 1, max: 3, pto: 1, nf: 0, tw: 0, csh: 1,
    pgyReqs: { 1: 0 },             // optional for PGY2/4
    pgyRestr: [2, 4],
  },
  {
    name: 'Vascular', type: 'elective', min: 0, max: 2, pto: 1, nf: 0, tw: 1, csh: 0,
    pgyReqs: {},
    pgyRestr: [2, 3],
  },
];

// ── Resident schedules ────────────────────────────────────────────────────────
// 26 slots: index i → block Math.floor(i/2)+1, half i%2===0 ? 'A' : 'B'
const RESIDENTS = [
  // ── FM PGY1 ──
  { name: 'Wosk', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Adult IP','Adult IP',
    'Addiction:V2','Addiction',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'OB','NF',
    'Peds OP','Peds OP',
    'NF','OB',
    'NICU:V2','NICU',
    'Peds IP','Peds IP',
    'ICU','ICU',
    'Cards','Cards:V2',
    'Adult IP','NF',
  ]},
  { name: 'Babtkis', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'Peds IP','Peds IP',
    'Peds OP','Peds OP',
    'Adult IP','Adult IP',
    'OB','NF',
    'Cards','Cards:V2',
    'Addiction','Addiction:V2',
    'NF','OB',
    'NICU','NICU:V2',
    'ICU','ICU',
    'Adult IP','NF',
  ]},
  { name: 'Mize', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Adult IP','Adult IP',
    'Peds OP','Peds OP',
    'ICU','ICU',
    'Surgery','Surgery',
    'NICU:V1','NICU',
    'Adult IP','Adult IP',
    'OB','NF',
    'Peds IP','Peds IP',
    'OB','NF',
    'Addiction:V1','Addiction',
    'Cards','Cards:V2',
    'Adult IP','NF',
  ]},
  { name: 'Bohaboj', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Adult IP','Adult IP',
    'NICU:V1','NICU',
    'NF','OB',
    'Addiction','Addiction:V1',
    'ICU','ICU',
    'Cards','Cards:V1',
    'Peds IP','Peds IP',
    'OB','NF',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'Peds OP','Peds OP',
    'Adult IP','NF',
  ]},
  { name: 'Dowey', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Peds OP','Peds OP',
    'Adult IP','Adult IP',
    'OB','NF',
    'NICU','NICU:V2',
    'Adult IP','Adult IP',
    'Addiction','Addiction:V1',
    'ICU','ICU',
    'NF','OB',
    'Cards','Cards:V2',
    'Peds IP','Peds IP',
    'Surgery','Surgery',
    'NF','Adult IP',
  ]},
  { name: 'Panhassi', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Cards','Cards:V2',
    'Adult IP','Adult IP',
    'Addiction','Addiction',
    'Peds IP','Peds IP',
    'NF','OB',
    'Adult IP','Adult IP',
    'NICU','NICU:V1',
    'Surgery','Surgery',
    'ICU','ICU',
    'NF','OB',
    'Peds OP','Peds OP',
    'NF','Adult IP',
  ]},
  { name: 'Lam', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'Peds OP','Peds OP',
    'NF','OB',
    'Peds IP','Peds IP',
    'NF','OB',
    'Adult IP','Adult IP',
    'Cards','Cards:V2',
    'Addiction','Addiction:V2',
    'ICU','ICU',
    'NICU','NICU:V1',
    'NF','Adult IP',
  ]},
  { name: 'Sakya', pgy: 1, schedule: [
    'Orientation','Community Medicine',
    'NICU','NICU:V2',
    'Adult IP','Adult IP',
    'Cards','Cards:V2',
    'OB','NF',
    'Surgery','Surgery',
    'Peds IP','Peds IP',
    'Peds OP','Peds OP',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'OB','NF',
    'Addiction','Addiction:V1',
    'NF','Adult IP',
  ]},

  // ── FM PGY2 ──
  { name: 'Dietz', pgy: 2, schedule: [
    'Sports Med','Ortho',
    'Spanish Med','FMP:V1',
    'Pain Mgmt','NF',
    'OB','Adult IP',
    'OB','NF',
    'EM','EM',
    'Adult IP','Adult IP',
    'Psych','Geri',
    'Adult IP','Adult IP',
    'Peds ED:V2','Peds ED',
    'Nephrology','Sports Med:V1',
    'Geri','Vascular',
    'Gyn','Gyn',
  ]},
  { name: 'Garcia', pgy: 2, schedule: [
    'Ambulatory','ENT',
    'Nephrology','OB',
    'Adult IP','FMP:V2',
    'EM','EM',
    'NF','Concierge',
    'Adult IP','Adult IP',
    'OB','NF',
    'Sports Med','Spanish Med',
    'Gyn','Gyn',
    'Psych','Ortho:V2',
    'Adult IP','Adult IP',
    'Geri','Geri',
    'Peds ED','Peds ED:V2',
  ]},
  { name: 'Gau', pgy: 2, schedule: [
    'Nephrology','Adult IP',
    'OB','Ortho',
    'Nephrology','NF',
    'Gyn','Gyn',
    'Peds ED','Peds ED:V1',
    'Adult IP','Adult IP',
    'EM','EM',
    'NF','Sports Med',
    'Psych','FMP:V2',
    'Adult IP','Adult IP',
    'Vascular','Concierge',
    'OB','Ortho:V1',
    'Geri','Geri',
  ]},
  { name: 'Jhalli', pgy: 2, schedule: [
    'Vascular','NF',
    'Nephrology','OB',
    'Ortho:V1','Adult IP',
    'Peds ED','Peds ED',
    'Adult IP','Adult IP',
    'FMP:V1','NF',
    'Psych','Concierge',
    'Adult IP','Adult IP',
    'EM','EM',
    'Gyn','Gyn',
    'Geri','OB',
    'Sports Med','Geri:V1',
    'Endocrinology','Vascular',
  ]},
  { name: 'Lee', pgy: 2, schedule: [
    'ENT','OB',
    'Dermatology','Urgent Care',
    'NF','Ortho:V1',
    'Adult IP','Geri',
    'Gyn','Gyn',
    'FMP:V2','Endocrinology',
    'NF','OB',
    'EM','EM',
    'Adult IP','Adult IP',
    'Sports Med','Psych',
    'Adult IP','Adult IP',
    'Peds ED:V1','Peds ED',
    'Geri','Neuro OP',
  ]},
  { name: 'Mendez', pgy: 2, schedule: [
    'OB','Nephrology',
    'Adult IP','FMP:V2',
    'EM','EM',
    'Psych','Geri',
    'Ortho','NF',
    'Peds ED:V2','Peds ED',
    'Adult IP','Adult IP',
    'Dermatology','NF',
    'Sports Med','OB',
    'Urology','Geri',
    'Gyn','Gyn',
    'Adult IP','Adult IP',
    'Ortho:V2','Concierge',
  ]},
  { name: 'Phan', pgy: 2, schedule: [
    'Concierge','Spanish Med',
    'Sports Med','Adult IP',
    'OB','Nephrology',
    'EM','EM',
    'NF','Sports Med:V2',
    'NF','Ortho',
    'Gyn','Psych',
    'Adult IP','Adult IP',
    'Peds ED:V2','Peds ED',
    'Adult IP','Adult IP',
    'Geri:V2','FMP',
    'ENT','Gyn',
    'OB','Geri',
  ]},

  // ── FM PGY3 ──
  { name: 'Jezulin', pgy: 3, schedule: [
    'NF','Peds OP',
    'Adult IP','Adult IP',
    'Radiology','PM:V1',
    'NF','Peds OP',
    'Spanish Med','Vascular',
    'Dermatology','PM',
    'Concierge','Geri',
    'Addiction','Addiction',
    'Geri:V1','Endocrinology',
    'FMP','EM',
    'Nephrology','FMP:V1',
    'Ophtho','PM',
    'FMP','Transition to Attending',
  ]},
  { name: 'Lease', pgy: 3, schedule: [
    'Adult IP','Cards',
    'Concierge','NF',
    'Peds OP','Adult IP',
    'FMP','NF',
    'PM:V1','Psych',
    'Radiology','Spanish Med',
    'FMP:V2','Geri',
    'Endocrinology','FMP',
    'Geri','EM',
    'Geri','Geri:V1',
    'Sports Med/Ortho','Nephrology',
    'FMP','PM',
    'Concierge','Transition to Attending',
  ]},
  { name: 'Nguyen', pgy: 3, schedule: [
    'Adult IP','FMP',
    'NF','Dermatology',
    'NF','Geri',
    'FMP','Adult IP',
    'Psych','Geri',
    'FMP:V2','Radiology',
    'PM:V2','Peds OP',
    'Nephrology','Geri',
    'FMP','Psych',
    'Peds OP','Spanish Med',
    'PM','Geri:V1',
    'Neuro OP','Concierge',
    'PM','Transition to Attending',
  ]},
  { name: 'Pace', pgy: 3, schedule: [
    'Radiology','Adult IP',
    'FMP','NF',
    'Psych','PM:V1',
    'Geri','NF',
    'Dermatology','FMP',
    'Adult IP','Peds OP',
    'Geri:V2','Gyn',
    'Geri','FMP',
    'Peds OP','Concierge',
    'EM','FMP:V1',
    'Endocrinology','PM',
    'Dermatology','ENT',
    'Nephrology','Transition to Attending',
  ]},
  { name: 'Root', pgy: 3, schedule: [
    'Cards','NF',
    'Peds OP','Concierge',
    'Adult IP','Radiology',
    'NF','PM:V1',
    'FMP','Adult IP',
    'Gyn','Gyn',
    'Geri:V2','Endocrinology',
    'FMP','Nephrology',
    'Psych','Cards',
    'FMP:V2','Geri',
    'PM','Peds OP',
    'FMP','Dermatology',
    'Ortho','Transition to Attending',
  ]},
  { name: 'Talmage', pgy: 3, schedule: [
    'NF','Radiology',
    'NF','Peds OP',
    'Geri','FMP',
    'Adult IP','Concierge',
    'Adult IP','Geri',
    'PM:V2','Peds OP',
    'Spanish Med','FMP:V1',
    'Gyn','Gyn',
    'Dermatology','Psych',
    'Cards','Dermatology',
    'FMP','Ophtho:V2',
    'Nephrology','FMP',
    'PM','Transition to Attending',
  ]},

  // ── TY (PGY4) ──
  { name: 'Atoa', pgy: 4, schedule: [
    'Adult IP','Adult IP',
    'EM','EM',
    'Adult IP','Adult IP',
    'Cards:V1','Cards',
    'Anes','Anes',
    'Ambulatory:V2','Ambulatory',
    'Nephrology','Nephrology',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'NF','NF',
    'ENT','ICU (Elective)',
    'Surgery','Surgery',
    'ENT','ENT:V2',
  ]},
  { name: 'Avakian', pgy: 4, schedule: [
    'Adult IP','Adult IP',
    'ICU','ICU',
    'Ambulatory:V1','Ambulatory',
    'Radiology','Radiology',
    'Cards','Cards',
    'Pain Mgmt','Pain Mgmt',
    'ENT','ENT',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'EM','EM',
    'NF','NF',
    'ICU (Elective)','Ambulatory:V2',
  ]},
  { name: 'Boman', pgy: 4, schedule: [
    'Adult IP','Adult IP',
    'Urology','Urology',
    'ICU','ICU',
    'Surgery','Surgery',
    'Cards','Cards:V2',
    'Nephrology','Dermatology',
    'Ambulatory:V2','Ambulatory',
    'Adult IP','Adult IP',
    'Cards','Nephrology',
    'NF','NF',
    'EM','EM',
    'Adult IP','Adult IP',
    'Dermatology','Urology:V2',
  ]},
  { name: 'Dhami', pgy: 4, schedule: [
    'Adult IP','Adult IP',
    'ICU','ICU',
    'Ambulatory:V1','Ambulatory',
    'Nephrology','Nephrology',
    'Radiology','Radiology',
    'Cards','Cards',
    'Dermatology','Dermatology:V2',
    'Adult IP','Adult IP',
    'EM','EM',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'NF','NF',
    'Endocrinology','Dermatology:V2',
  ]},
  { name: 'Fernandez-Nava', pgy: 4, schedule: [
    'Adult IP','Adult IP',
    'Ambulatory','Ambulatory:V2',
    'NF','NF',
    'Pain Mgmt','Pain Mgmt:V2',
    'EM','EM',
    'Anes','Anes',
    'Cards','Cards',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'ENT','ENT',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'EM','Ambulatory:V2',
  ]},
  { name: 'Kundan', pgy: 4, schedule: [
    'Adult IP','Adult IP',
    'EM','EM',
    'Cards:V1','Cards',
    'Anes','Anes',
    'ENT','Pain Mgmt',
    'Ambulatory','Ambulatory',
    'Psych','Psych',
    'NF','NF',
    'ICU','ICU',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'Pain Mgmt','Pain Mgmt:V2',
  ]},
  { name: 'Allkhenfr', pgy: 4, schedule: [
    'Ambulatory','Ambulatory',
    'Adult IP','Adult IP',
    'Cards','Cards:V2',
    'ICU','ICU',
    'Pain Mgmt','Nephrology',
    'NF','NF',
    'Surgery','Surgery',
    'EM','EM',
    'Adult IP','Adult IP',
    'Ambulatory:V2','Ambulatory',
    'Adult IP','Adult IP',
    'Nephrology','Nephrology',
    'Radiology','Radiology:V2',
  ]},
  { name: 'Batan', pgy: 4, schedule: [
    'Cards','Nephrology',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'EM','EM',
    'Ambulatory','Ambulatory:V1',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'Ambulatory','Ambulatory',
    'NF','NF',
    'Radiology','Radiology',
    'Cards','Cards:V1',
    'Adult IP','Adult IP',
    'Ambulatory','Nephrology:V2',
  ]},
  { name: 'Levy', pgy: 4, schedule: [
    'Nephrology','Cards',
    'Radiology','Radiology',
    'EM','EM',
    'Ambulatory:V2','Ortho',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'NF','NF',
    'ICU','ICU',
    'Adult IP','Adult IP',
    'Pain Mgmt:V1','Pain Mgmt',
    'Adult IP','Adult IP',
    'Ambulatory','Nephrology',
    'Cards','Cards:V2',
  ]},
  { name: 'Bushnell', pgy: 4, schedule: [
    'Pain Mgmt','Pain Mgmt',
    'NF','NF',
    'Surgery','Surgery',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'Adult IP','Adult IP',
    'Nephrology:V1','Radiology:V1',
    'Ambulatory','Ambulatory',
    'Radiology','ENT',
    'Adult IP','Adult IP',
    'Pain Mgmt','Urology',
    'EM','EM',
    'Cards','Cards:V2',
  ]},
  { name: 'Chand', pgy: 4, schedule: [
    'Pain Mgmt','Pain Mgmt',
    'Adult IP','Adult IP',
    'Urology','Pain Mgmt',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'Cards:V1','Cards',
    'Ambulatory:V1','Ortho',
    'EM','EM',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'NF','NF',
    'Ambulatory','Ambulatory',
    'Urology','Ortho:V2',
  ]},
  { name: 'Liang', pgy: 4, schedule: [
    'NF','NF',
    'Cards','Cards',
    'ENT:V1','ENT',
    'Adult IP','Adult IP',
    'EM','EM',
    'Adult IP','Adult IP',
    'ICU','ICU',
    'Surgery','Surgery',
    'Ambulatory','Ambulatory',
    'Pain Mgmt:V1','ICU (Elective)',
    'Dermatology','Dermatology',
    'Adult IP','Adult IP',
    'Pain Mgmt','Pain Mgmt:V2',
  ]},
  { name: 'Sadrolashrafi', pgy: 4, schedule: [
    'Dermatology','Dermatology',
    'Pain Mgmt','Pain Mgmt',
    'EM','EM',
    'Adult IP','Adult IP',
    'Surgery','Surgery',
    'ICU','ICU',
    'Adult IP','Adult IP',
    'Nephrology:V2','Cards',
    'NF','NF',
    'Ambulatory','Ambulatory:V1',
    'Cards','Cards',
    'Adult IP','Adult IP',
    'Ambulatory','Nephrology:V2',
  ]},

  // ── PSYCH (PGY5) — Adult IP coverage only; rest of time in Psych program ──
  { name: 'Chuapoco', pgy: 5, schedule: [
    'Adult IP','Adult IP', null,null,
    null,null, null,null,
    'Adult IP','Adult IP', null,null,
    null,null, 'Adult IP','Adult IP',
    null,null, null,null,
    'Adult IP','Adult IP', null,null,
  ]},
  { name: 'Ghasham', pgy: 5, schedule: [
    null,null, 'Adult IP','Adult IP',
    null,null, null,null,
    null,null, 'Adult IP','Adult IP',
    null,null, null,null,
    'Adult IP','Adult IP', null,null,
    null,null, null,null,
    'Adult IP','Adult IP',
  ]},
  { name: 'Johnsong', pgy: 5, schedule: [
    null,null, null,null,
    'Adult IP','Adult IP', null,null,
    null,null, null,null,
    'Adult IP','Adult IP', null,null,
    null,null, null,null,
    null,null, 'Adult IP','Adult IP',
    null,null,
  ]},
  { name: 'Yeo', pgy: 5, schedule: [
    null,null, null,null,
    null,null, 'Adult IP','Adult IP',
    null,null, null,null,
    null,null, null,null,
    null,null, 'Adult IP','Adult IP',
    null,null, null,null,
    'Adult IP','Adult IP',
  ]},
];

// ── Run seed ──────────────────────────────────────────────────────────────────
transaction(db, () => {
  // 1. Clear existing program 3 data
  const scheduleIds = db.prepare('SELECT id FROM schedules WHERE program_id = ?').all(PROGRAM_ID).map(r => r.id);
  for (const sid of scheduleIds) {
    db.prepare('DELETE FROM assignments WHERE schedule_id = ?').run(sid);
    db.prepare('DELETE FROM schedule_violations WHERE schedule_id = ?').run(sid);
    db.prepare('DELETE FROM jeopardy_assignments WHERE schedule_id = ?').run(sid);
    db.prepare('DELETE FROM pto_requests WHERE schedule_id = ?').run(sid);
    db.prepare('DELETE FROM schedule_change_log WHERE schedule_id = ?').run(sid);
    db.prepare('DELETE FROM shift_swaps WHERE schedule_id = ?').run(sid);
  }
  db.prepare('DELETE FROM schedules WHERE program_id = ?').run(PROGRAM_ID);

  const residentIds = db.prepare('SELECT id FROM residents WHERE program_id = ?').all(PROGRAM_ID).map(r => r.id);
  for (const rid of residentIds) {
    db.prepare('DELETE FROM invite_tokens WHERE resident_id = ?').run(rid);
  }
  db.prepare('DELETE FROM residents WHERE program_id = ?').run(PROGRAM_ID);

  const rotationIds = db.prepare('SELECT id FROM rotations WHERE program_id = ?').all(PROGRAM_ID).map(r => r.id);
  for (const rid of rotationIds) {
    db.prepare('DELETE FROM rotation_pgy_restrictions WHERE rotation_id = ?').run(rid);
    db.prepare('DELETE FROM rotation_gap_rules WHERE rotation_id = ?').run(rid);
    db.prepare('DELETE FROM rotation_required_by_pgy WHERE rotation_id = ?').run(rid);
    db.prepare('DELETE FROM rotation_shared_service WHERE rotation_id = ?').run(rid);
  }
  db.prepare('DELETE FROM rotations WHERE program_id = ?').run(PROGRAM_ID);

  // 2. Update program settings
  db.prepare(`
    UPDATE programs
    SET name = '2025-2026 Residency Program',
        block_length_weeks = 4,
        total_blocks = 13,
        academic_year_start = '2025-07-01'
    WHERE id = ?
  `).run(PROGRAM_ID);

  // 3. Insert rotations with pgyRequirements and pgyRestrictions
  const rotMap = {};
  const insertRot = db.prepare(`
    INSERT INTO rotations (program_id, name, type, min_capacity, max_capacity, pto_eligible, night_float, two_week, can_split_to_half)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPgyReq = db.prepare(
    'INSERT OR REPLACE INTO rotation_required_by_pgy (rotation_id, pgy_year, required_blocks) VALUES (?, ?, ?)'
  );
  const insertPgyRestr = db.prepare(
    'INSERT OR REPLACE INTO rotation_pgy_restrictions (rotation_id, pgy_year) VALUES (?, ?)'
  );

  for (const rot of ROTATIONS) {
    const r = insertRot.run(PROGRAM_ID, rot.name, rot.type, rot.min, rot.max, rot.pto, rot.nf, rot.tw, rot.csh);
    const rotId = r.lastInsertRowid;
    rotMap[rot.name] = rotId;

    // Phase window: anchors rotations like Orientation/Community Medicine to specific blocks
    if (rot.prefMin != null) {
      db.prepare('UPDATE rotations SET preferred_block_min = ?, preferred_block_max = ? WHERE id = ?')
        .run(rot.prefMin, rot.prefMax, rotId);
    }

    // pgyRequirements: store ALL entries including 0 so non-empty map semantics apply
    for (const [pgyYear, halfUnits] of Object.entries(rot.pgyReqs || {})) {
      insertPgyReq.run(rotId, parseInt(pgyYear), halfUnits);
    }

    // pgyRestrictions: which PGY years are eligible
    for (const pgyYear of (rot.pgyRestr || [])) {
      insertPgyRestr.run(rotId, pgyYear);
    }
  }
  console.log(`Inserted ${ROTATIONS.length} rotations with pgyRequirements and pgyRestrictions.`);

  // 4. Insert residents
  const resMap = {};
  const insertRes = db.prepare(`
    INSERT INTO residents (program_id, name, pgy_year, pto_weeks_allotted)
    VALUES (?, ?, ?, 3)
  `);
  for (const r of RESIDENTS) {
    const row = insertRes.run(PROGRAM_ID, r.name, r.pgy);
    resMap[r.name] = row.lastInsertRowid;
  }
  console.log(`Inserted ${RESIDENTS.length} residents.`);

  // 5. Create schedule
  const schedResult = db.prepare(`
    INSERT INTO schedules (program_id, name, academic_year, status, generated_at)
    VALUES (?, '2025-2026 Rotation Calendar', '2025-2026', 'published', CURRENT_TIMESTAMP)
  `).run(PROGRAM_ID);
  const scheduleId = schedResult.lastInsertRowid;
  console.log(`Created schedule id=${scheduleId}`);

  // 6. Insert assignments
  const insertAsgn = db.prepare(`
    INSERT INTO assignments (schedule_id, resident_id, rotation_id, block_number, block_half, pto_weeks)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let assignCount = 0;
  for (const resident of RESIDENTS) {
    const residentId = resMap[resident.name];
    for (let i = 0; i < 26; i++) {
      const entry = resident.schedule[i];
      const blockNum = Math.floor(i / 2) + 1;
      const half = i % 2 === 0 ? 'A' : 'B';

      if (!entry) continue;

      const [rawName, vtag] = entry.split(':');
      const rotationId = rotMap[rawName] ?? null;
      if (!rotationId && rawName) {
        console.warn(`  WARNING: rotation not found: "${rawName}" (${resident.name} block ${blockNum}${half})`);
      }

      const ptoWeeks = vtag ? [ptoWeekNum(blockNum, half, vtag)] : [];
      insertAsgn.run(scheduleId, residentId, rotationId, blockNum, half, JSON.stringify(ptoWeeks));
      assignCount++;
    }
  }
  console.log(`Inserted ${assignCount} assignments.`);
});

console.log('Done.');
