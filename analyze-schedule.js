/**
 * Analyze the 2025-2026 seed schedule to extract per-rotation, per-PGY half-block requirements.
 * Outputs: required_half_blocks, pgy_restrictions, flexible_duration flags.
 */

const RESIDENTS = [
  { name: 'Wosk', pgy: 1, schedule: ['Orientation','Community Medicine','Adult IP','Adult IP','Addiction:V2','Addiction','Surgery','Surgery','Adult IP','Adult IP','OB','NF','Peds OP','Peds OP','NF','OB','NICU:V2','NICU','Peds IP','Peds IP','ICU','ICU','Cards','Cards:V2','Adult IP','NF'] },
  { name: 'Babtkis', pgy: 1, schedule: ['Orientation','Community Medicine','Adult IP','Adult IP','Surgery','Surgery','Peds IP','Peds IP','Peds OP','Peds OP','Adult IP','Adult IP','OB','NF','Cards','Cards:V2','Addiction','Addiction:V2','NF','OB','NICU','NICU:V2','ICU','ICU','Adult IP','NF'] },
  { name: 'Mize', pgy: 1, schedule: ['Orientation','Community Medicine','Adult IP','Adult IP','Peds OP','Peds OP','ICU','ICU','Surgery','Surgery','NICU:V1','NICU','Adult IP','Adult IP','OB','NF','Peds IP','Peds IP','OB','NF','Addiction:V1','Addiction','Cards','Cards:V2','Adult IP','NF'] },
  { name: 'Bohaboj', pgy: 1, schedule: ['Orientation','Community Medicine','Adult IP','Adult IP','NICU:V1','NICU','NF','OB','Addiction','Addiction:V1','ICU','ICU','Cards','Cards:V1','Peds IP','Peds IP','OB','NF','Surgery','Surgery','Adult IP','Adult IP','Peds OP','Peds OP','Adult IP','NF'] },
  { name: 'Dowey', pgy: 1, schedule: ['Orientation','Community Medicine','Peds OP','Peds OP','Adult IP','Adult IP','OB','NF','NICU','NICU:V2','Adult IP','Adult IP','Addiction','Addiction:V1','ICU','ICU','NF','OB','Cards','Cards:V2','Peds IP','Peds IP','Surgery','Surgery','NF','Adult IP'] },
  { name: 'Panhassi', pgy: 1, schedule: ['Orientation','Community Medicine','Cards','Cards:V2','Adult IP','Adult IP','Addiction','Addiction','Peds IP','Peds IP','NF','OB','Adult IP','Adult IP','NICU','NICU:V1','Surgery','Surgery','ICU','ICU','NF','OB','Peds OP','Peds OP','NF','Adult IP'] },
  { name: 'Lam', pgy: 1, schedule: ['Orientation','Community Medicine','Surgery','Surgery','Adult IP','Adult IP','Peds OP','Peds OP','NF','OB','Peds IP','Peds IP','NF','OB','Adult IP','Adult IP','Cards','Cards:V2','Addiction','Addiction:V2','ICU','ICU','NICU','NICU:V1','NF','Adult IP'] },
  { name: 'Sakya', pgy: 1, schedule: ['Orientation','Community Medicine','NICU','NICU:V2','Adult IP','Adult IP','Cards','Cards:V2','OB','NF','Surgery','Surgery','Peds IP','Peds IP','Peds OP','Peds OP','Adult IP','Adult IP','ICU','ICU','OB','NF','Addiction','Addiction:V1','NF','Adult IP'] },

  { name: 'Dietz', pgy: 2, schedule: ['Sports Med','Ortho','Spanish Med','FMP:V1','Pain Mgmt','NF','OB','Adult IP','OB','NF','EM','EM','Adult IP','Adult IP','Psych','Geri','Adult IP','Adult IP','Peds ED:V2','Peds ED','Nephrology','Sports Med:V1','Geri','Vascular','Gyn','Gyn'] },
  { name: 'Garcia', pgy: 2, schedule: ['Ambulatory','ENT','Nephrology','OB','Adult IP','FMP:V2','EM','EM','NF','Concierge','Adult IP','Adult IP','OB','NF','Sports Med','Spanish Med','Gyn','Gyn','Psych','Ortho:V2','Adult IP','Adult IP','Geri','Geri','Peds ED','Peds ED:V2'] },
  { name: 'Gau', pgy: 2, schedule: ['Nephrology','Adult IP','OB','Ortho','Nephrology','NF','Gyn','Gyn','Peds ED','Peds ED:V1','Adult IP','Adult IP','EM','EM','NF','Sports Med','Psych','FMP:V2','Adult IP','Adult IP','Vascular','Concierge','OB','Ortho:V1','Geri','Geri'] },
  { name: 'Jhalli', pgy: 2, schedule: ['Vascular','NF','Nephrology','OB','Ortho:V1','Adult IP','Peds ED','Peds ED','Adult IP','Adult IP','FMP:V1','NF','Psych','Concierge','Adult IP','Adult IP','EM','EM','Gyn','Gyn','Geri','OB','Sports Med','Geri:V1','Endocrinology','Vascular'] },
  { name: 'Lee', pgy: 2, schedule: ['ENT','OB','Dermatology','Urgent Care','NF','Ortho:V1','Adult IP','Geri','Gyn','Gyn','FMP:V2','Endocrinology','NF','OB','EM','EM','Adult IP','Adult IP','Sports Med','Psych','Adult IP','Adult IP','Peds ED:V1','Peds ED','Geri','Neuro OP'] },
  { name: 'Mendez', pgy: 2, schedule: ['OB','Nephrology','Adult IP','FMP:V2','EM','EM','Psych','Geri','Ortho','NF','Peds ED:V2','Peds ED','Adult IP','Adult IP','Dermatology','NF','Sports Med','OB','Urology','Geri','Gyn','Gyn','Adult IP','Adult IP','Ortho:V2','Concierge'] },
  { name: 'Phan', pgy: 2, schedule: ['Concierge','Spanish Med','Sports Med','Adult IP','OB','Nephrology','EM','EM','NF','Sports Med:V2','NF','Ortho','Gyn','Psych','Adult IP','Adult IP','Peds ED:V2','Peds ED','Adult IP','Adult IP','Geri:V2','FMP','ENT','Gyn','OB','Geri'] },

  { name: 'Jezulin', pgy: 3, schedule: ['NF','Peds OP','Adult IP','Adult IP','Radiology','PM:V1','NF','Peds OP','Spanish Med','Vascular','Dermatology','PM','Concierge','Geri','Addiction','Addiction','Geri:V1','Endocrinology','FMP','EM','Nephrology','FMP:V1','Ophtho','PM','FMP','Transition to Attending'] },
  { name: 'Lease', pgy: 3, schedule: ['Adult IP','Cards','Concierge','NF','Peds OP','Adult IP','FMP','NF','PM:V1','Psych','Radiology','Spanish Med','FMP:V2','Geri','Endocrinology','FMP','Geri','EM','Geri','Geri:V1','Sports Med/Ortho','Nephrology','FMP','PM','Concierge','Transition to Attending'] },
  { name: 'Nguyen', pgy: 3, schedule: ['Adult IP','FMP','NF','Dermatology','NF','Geri','FMP','Adult IP','Psych','Geri','FMP:V2','Radiology','PM:V2','Peds OP','Nephrology','Geri','FMP','Psych','Peds OP','Spanish Med','PM','Geri:V1','Neuro OP','Concierge','PM','Transition to Attending'] },
  { name: 'Pace', pgy: 3, schedule: ['Radiology','Adult IP','FMP','NF','Psych','PM:V1','Geri','NF','Dermatology','FMP','Adult IP','Peds OP','Geri:V2','Gyn','Geri','FMP','Peds OP','Concierge','EM','FMP:V1','Endocrinology','PM','Dermatology','ENT','Nephrology','Transition to Attending'] },
  { name: 'Root', pgy: 3, schedule: ['Cards','NF','Peds OP','Concierge','Adult IP','Radiology','NF','PM:V1','FMP','Adult IP','Gyn','Gyn','Geri:V2','Endocrinology','FMP','Nephrology','Psych','Cards','FMP:V2','Geri','PM','Peds OP','FMP','Dermatology','Ortho','Transition to Attending'] },
  { name: 'Talmage', pgy: 3, schedule: ['NF','Radiology','NF','Peds OP','Geri','FMP','Adult IP','Concierge','Adult IP','Geri','PM:V2','Peds OP','Spanish Med','FMP:V1','Gyn','Gyn','Dermatology','Psych','Cards','Dermatology','FMP','Ophtho:V2','Nephrology','FMP','PM','Transition to Attending'] },

  { name: 'Atoa', pgy: 4, schedule: ['Adult IP','Adult IP','EM','EM','Adult IP','Adult IP','Cards:V1','Cards','Anes','Anes','Ambulatory:V2','Ambulatory','Nephrology','Nephrology','Adult IP','Adult IP','ICU','ICU','NF','NF','ENT','ICU (Elective)','Surgery','Surgery','ENT','ENT:V2'] },
  { name: 'Avakian', pgy: 4, schedule: ['Adult IP','Adult IP','ICU','ICU','Ambulatory:V1','Ambulatory','Radiology','Radiology','Cards','Cards','Pain Mgmt','Pain Mgmt','ENT','ENT','Adult IP','Adult IP','Surgery','Surgery','Adult IP','Adult IP','EM','EM','NF','NF','ICU (Elective)','Ambulatory:V2'] },
  { name: 'Boman', pgy: 4, schedule: ['Adult IP','Adult IP','Urology','Urology','ICU','ICU','Surgery','Surgery','Cards','Cards:V2','Nephrology','Dermatology','Ambulatory:V2','Ambulatory','Adult IP','Adult IP','Cards','Nephrology','NF','NF','EM','EM','Adult IP','Adult IP','Dermatology','Urology:V2'] },
  { name: 'Dhami', pgy: 4, schedule: ['Adult IP','Adult IP','ICU','ICU','Ambulatory:V1','Ambulatory','Nephrology','Nephrology','Radiology','Radiology','Cards','Cards','Dermatology','Dermatology:V2','Adult IP','Adult IP','EM','EM','Adult IP','Adult IP','Surgery','Surgery','NF','NF','Endocrinology','Dermatology:V2'] },
  { name: 'Fernandez-Nava', pgy: 4, schedule: ['Adult IP','Adult IP','Ambulatory','Ambulatory:V2','NF','NF','Pain Mgmt','Pain Mgmt:V2','EM','EM','Anes','Anes','Cards','Cards','Surgery','Surgery','Adult IP','Adult IP','ENT','ENT','Adult IP','Adult IP','ICU','ICU','EM','Ambulatory:V2'] },
  { name: 'Kundan', pgy: 4, schedule: ['Adult IP','Adult IP','EM','EM','Cards:V1','Cards','Anes','Anes','ENT','Pain Mgmt','Ambulatory','Ambulatory','Psych','Psych','NF','NF','ICU','ICU','Adult IP','Adult IP','Surgery','Surgery','Adult IP','Adult IP','Pain Mgmt','Pain Mgmt:V2'] },
  { name: 'Allkhenfr', pgy: 4, schedule: ['Ambulatory','Ambulatory','Adult IP','Adult IP','Cards','Cards:V2','ICU','ICU','Pain Mgmt','Nephrology','NF','NF','Surgery','Surgery','EM','EM','Adult IP','Adult IP','Ambulatory:V2','Ambulatory','Adult IP','Adult IP','Nephrology','Nephrology','Radiology','Radiology:V2'] },
  { name: 'Batan', pgy: 4, schedule: ['Cards','Nephrology','Adult IP','Adult IP','ICU','ICU','EM','EM','Ambulatory','Ambulatory:V1','Adult IP','Adult IP','Surgery','Surgery','Ambulatory','Ambulatory','NF','NF','Radiology','Radiology','Cards','Cards:V1','Adult IP','Adult IP','Ambulatory','Nephrology:V2'] },
  { name: 'Levy', pgy: 4, schedule: ['Nephrology','Cards','Radiology','Radiology','EM','EM','Ambulatory:V2','Ortho','Adult IP','Adult IP','Surgery','Surgery','NF','NF','ICU','ICU','Adult IP','Adult IP','Pain Mgmt:V1','Pain Mgmt','Adult IP','Adult IP','Ambulatory','Nephrology','Cards','Cards:V2'] },
  { name: 'Bushnell', pgy: 4, schedule: ['Pain Mgmt','Pain Mgmt','NF','NF','Surgery','Surgery','Adult IP','Adult IP','ICU','ICU','Adult IP','Adult IP','Nephrology:V1','Radiology:V1','Ambulatory','Ambulatory','Radiology','ENT','Adult IP','Adult IP','Pain Mgmt','Urology','EM','EM','Cards','Cards:V2'] },
  { name: 'Chand', pgy: 4, schedule: ['Pain Mgmt','Pain Mgmt','Adult IP','Adult IP','Urology','Pain Mgmt','Adult IP','Adult IP','ICU','ICU','Cards:V1','Cards','Ambulatory:V1','Ortho','EM','EM','Adult IP','Adult IP','Surgery','Surgery','NF','NF','Ambulatory','Ambulatory','Urology','Ortho:V2'] },
  { name: 'Liang', pgy: 4, schedule: ['NF','NF','Cards','Cards','ENT:V1','ENT','Adult IP','Adult IP','EM','EM','Adult IP','Adult IP','ICU','ICU','Surgery','Surgery','Ambulatory','Ambulatory','Pain Mgmt:V1','ICU (Elective)','Dermatology','Dermatology','Adult IP','Adult IP','Pain Mgmt','Pain Mgmt:V2'] },
  { name: 'Sadrolashrafi', pgy: 4, schedule: ['Dermatology','Dermatology','Pain Mgmt','Pain Mgmt','EM','EM','Adult IP','Adult IP','Surgery','Surgery','ICU','ICU','Adult IP','Adult IP','Nephrology:V2','Cards','NF','NF','Ambulatory','Ambulatory:V1','Cards','Cards','Adult IP','Adult IP','Ambulatory','Nephrology:V2'] },

  { name: 'Chuapoco', pgy: 5, schedule: ['Adult IP','Adult IP', null,null, null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, 'Adult IP','Adult IP', null,null] },
  { name: 'Ghasham', pgy: 5, schedule: [null,null, 'Adult IP','Adult IP', null,null, null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, null,null, 'Adult IP','Adult IP'] },
  { name: 'Johnsong', pgy: 5, schedule: [null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, null,null, null,null, 'Adult IP','Adult IP', null,null] },
  { name: 'Yeo', pgy: 5, schedule: [null,null, null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, null,null, null,null, null,null, 'Adult IP','Adult IP', null,null, null,null, 'Adult IP','Adult IP'] },
];

// Count half-blocks per rotation per PGY
const counts = {}; // counts[pgy][rotation] = { total, residents: Set }
const pgyResidents = {}; // pgyResidents[pgy] = Set of resident names

for (const r of RESIDENTS) {
  if (!pgyResidents[r.pgy]) pgyResidents[r.pgy] = new Set();
  pgyResidents[r.pgy].add(r.name);

  for (const entry of r.schedule) {
    if (!entry) continue;
    const [rawName] = entry.split(':');
    if (!counts[r.pgy]) counts[r.pgy] = {};
    if (!counts[r.pgy][rawName]) counts[r.pgy][rawName] = { total: 0, residents: new Set() };
    counts[r.pgy][rawName].total++;
    counts[r.pgy][rawName].residents.add(r.name);
  }
}

// Analyze consecutive A+B pairs (full-block vs half-block patterns)
const pairStats = {}; // pairStats[rotation] = { fullPairs, halfSlots }
for (const r of RESIDENTS) {
  for (let i = 0; i < r.schedule.length; i += 2) {
    const a = r.schedule[i] ? r.schedule[i].split(':')[0] : null;
    const b = r.schedule[i+1] ? r.schedule[i+1].split(':')[0] : null;
    if (a) {
      if (!pairStats[a]) pairStats[a] = { fullPairs: 0, halfSlots: 0 };
      if (a === b) pairStats[a].fullPairs++;
      else pairStats[a].halfSlots++;
    }
    if (b && b !== a) {
      if (!pairStats[b]) pairStats[b] = { fullPairs: 0, halfSlots: 0 };
      pairStats[b].halfSlots++;
    }
  }
}

// Collect all unique rotations
const allRotations = new Set();
for (const pgy of Object.keys(counts)) {
  for (const rot of Object.keys(counts[pgy])) allRotations.add(rot);
}

console.log('\n=== PGY REQUIREMENTS (half-block units per resident) ===\n');
const pgys = [1, 2, 3, 4, 5];
const header = ['Rotation'.padEnd(30), ...pgys.map(p => `PGY${p}`.padStart(8))].join('');
console.log(header);
console.log('-'.repeat(70));

for (const rot of [...allRotations].sort()) {
  const cols = [rot.padEnd(30)];
  for (const pgy of pgys) {
    const entry = counts[pgy]?.[rot];
    if (!entry) { cols.push('      - '); continue; }
    const n = pgyResidents[pgy].size;
    const avg = (entry.total / n).toFixed(1);
    const coverage = entry.residents.size; // how many residents do this rotation
    cols.push(`${avg}(${coverage}/${n})`.padStart(8));
  }
  console.log(cols.join(''));
}

console.log('\n=== FLEXIBILITY ANALYSIS (fullPairs vs halfSlots) ===\n');
console.log('Rotation'.padEnd(30) + 'FullPairs'.padStart(10) + 'HalfSlots'.padStart(10) + '  Mode');
console.log('-'.repeat(65));
for (const rot of [...allRotations].sort()) {
  const s = pairStats[rot] || { fullPairs: 0, halfSlots: 0 };
  const mode = s.fullPairs === 0 ? 'ALWAYS-HALF' : s.halfSlots === 0 ? 'ALWAYS-FULL' : 'FLEXIBLE';
  console.log(rot.padEnd(30) + String(s.fullPairs).padStart(10) + String(s.halfSlots).padStart(10) + '  ' + mode);
}

console.log('\n=== PGY RESTRICTIONS (rotations only used by certain PGY years) ===\n');
for (const rot of [...allRotations].sort()) {
  const pgysThatUseIt = pgys.filter(p => counts[p]?.[rot]);
  if (pgysThatUseIt.length < pgys.length) {
    console.log(`${rot}: PGY [${pgysThatUseIt.join(', ')}] only`);
  }
}
