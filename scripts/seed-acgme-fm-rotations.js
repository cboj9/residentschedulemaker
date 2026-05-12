/**
 * Seeds ACGME-required Family Medicine rotations for Program 3 (example full-cohort schedule).
 *
 * ACGME FM Required Rotations added:
 *   Emergency Medicine, Surgery, Geriatrics, Behavioral Health,
 *   Musculoskeletal/Sports Medicine, Night Float
 *
 * Also corrects existing rotation capacities and PGY requirements to match ACGME standards
 * for a 3-year FM program with 4-week blocks, 13 blocks/year, 8 residents per PGY year.
 *
 * Block allocation per resident per year after this script:
 *   PGY1 (13 blocks): FM=3, IM=2, OB=2, Peds=1, EM=1, Surg=1, BH=1, NF=2
 *   PGY2 (13 blocks): FM=3, IM=2, Peds=1, EM=1, Geri=1, BH=1, MSK=1, NF=1 → 2 elective
 *   PGY3 (13 blocks): FM=3, IM=2, Peds=1, EM=1, Geri=1, MSK=1, Surg=1 → 3 elective
 */

const { getDb, transaction } = require('../db/schema');

const PROGRAM_ID = 3;

const db = getDb();

// ── Existing rotation IDs for Program 3 ──
// 2: Family Medicine Clinic
// 3: Inpatient Medicine
// 4: Pediatrics
// 5: Elective
// 6: OB/GYN

transaction(db, () => {
  // ── Update existing rotation capacities ──

  // FM Clinic: min 3 → 5 to better match ~5.5 needed/block; max→9 for 24 residents
  db.prepare(`UPDATE rotations SET min_capacity=5, max_capacity=9 WHERE id=2`).run();

  // Inpatient Medicine: min 2→3 (48 slots/13 blocks ≈ 3.7/block); max stays 8
  db.prepare(`UPDATE rotations SET min_capacity=3, max_capacity=8 WHERE id=3`).run();

  // Pediatrics: min 2→1 (24 slots/13 blocks ≈ 1.8/block); max 6→4
  db.prepare(`UPDATE rotations SET min_capacity=1, max_capacity=4 WHERE id=4`).run();

  // OB/GYN: min 2→1 (only PGY1 now, 16 slots/13 ≈ 1.2/block); max 6→3
  db.prepare(`UPDATE rotations SET min_capacity=1, max_capacity=3 WHERE id=6`).run();

  // ── Update OB/GYN PGY requirements: only PGY1 needs 2 blocks; PGY2 and PGY3 no longer required ──
  db.prepare(`DELETE FROM rotation_required_by_pgy WHERE rotation_id=6`).run();
  db.prepare(`INSERT INTO rotation_required_by_pgy (rotation_id, pgy_year, required_blocks) VALUES (6, 1, 2)`).run();
  // PGY2 and PGY3 = 0 blocks required (entries with 0 are not inserted — missing year = 0 after algorithm fix)

  // ── Add new ACGME-required rotations ──

  function addRotation({ name, type, minCapacity, maxCapacity, ptoEligible, nightFloat, pgyRequirements }) {
    const result = db.prepare(`
      INSERT INTO rotations (program_id, name, type, min_capacity, max_capacity, pto_eligible, night_float, two_week)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(PROGRAM_ID, name, type, minCapacity, maxCapacity, ptoEligible ? 1 : 0, nightFloat ? 1 : 0);

    const rotationId = result.lastInsertRowid;

    const stmt = db.prepare(
      `INSERT INTO rotation_required_by_pgy (rotation_id, pgy_year, required_blocks) VALUES (?, ?, ?)`
    );
    for (const [pgyYear, requiredBlocks] of Object.entries(pgyRequirements)) {
      if (requiredBlocks > 0) stmt.run(rotationId, parseInt(pgyYear), requiredBlocks);
    }

    return rotationId;
  }

  // Emergency Medicine — all 3 PGY years, 1 block each
  // Total: 24 slots / 13 blocks ≈ 1.8/block
  addRotation({
    name: 'Emergency Medicine',
    type: 'required',
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: false,
    nightFloat: false,
    pgyRequirements: { 1: 1, 2: 1, 3: 1 }
  });

  // Surgery — PGY1 and PGY3, 1 block each (PGY2 not required, can fill capacity)
  // Total required: 16 slots / 13 blocks ≈ 1.2/block
  addRotation({
    name: 'Surgery',
    type: 'required',
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: false,
    nightFloat: false,
    pgyRequirements: { 1: 1, 3: 1 }
  });

  // Geriatrics / Care of the Aging Patient — PGY2 and PGY3, 1 block each
  // PGY1 interns have a full 13-block schedule so they won't be assigned here
  // Total required: 16 slots / 13 blocks ≈ 1.2/block
  addRotation({
    name: 'Geriatrics',
    type: 'required',
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: true,
    nightFloat: false,
    pgyRequirements: { 2: 1, 3: 1 }
  });

  // Behavioral Health / Psychiatry — PGY1 and PGY2, 1 block each
  // Total required: 16 slots / 13 blocks ≈ 1.2/block
  addRotation({
    name: 'Behavioral Health',
    type: 'required',
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: true,
    nightFloat: false,
    pgyRequirements: { 1: 1, 2: 1 }
  });

  // Musculoskeletal / Sports Medicine — PGY2 and PGY3, 1 block each
  // Total required: 16 slots / 13 blocks ≈ 1.2/block
  addRotation({
    name: 'Musculoskeletal Medicine',
    type: 'required',
    minCapacity: 1,
    maxCapacity: 3,
    ptoEligible: true,
    nightFloat: false,
    pgyRequirements: { 2: 1, 3: 1 }
  });

  // Night Float — PGY1 (2 blocks), PGY2 (1 block); PGY3 no required night float
  // Total required: 8*2 + 8*1 = 24 slots / 13 blocks ≈ 1.8/block
  addRotation({
    name: 'Night Float',
    type: 'required',
    minCapacity: 1,
    maxCapacity: 4,
    ptoEligible: false,
    nightFloat: true,
    pgyRequirements: { 1: 2, 2: 1 }
  });

  console.log('✓ Rotation updates and additions complete for Program 3');
});

// Print final rotation list for confirmation
const rotations = db.prepare('SELECT r.*, GROUP_CONCAT(rp.pgy_year || "→" || rp.required_blocks) as pgy_req FROM rotations r LEFT JOIN rotation_required_by_pgy rp ON rp.rotation_id = r.id WHERE r.program_id = ? GROUP BY r.id ORDER BY r.type DESC, r.name').all(PROGRAM_ID);
console.log('\nProgram 3 rotations:');
for (const r of rotations) {
  console.log(`  [${r.type}] ${r.name} (min:${r.min_capacity} max:${r.max_capacity} pto:${r.pto_eligible} nf:${r.night_float}) PGY: ${r.pgy_req || 'none'}`);
}
