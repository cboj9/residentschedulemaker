const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'scheduler.db');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initialize(db);
  }
  return db;
}

// Helper: run a set of statements as a transaction
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function initialize(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      block_length_weeks INTEGER NOT NULL DEFAULT 4,
      total_blocks INTEGER NOT NULL DEFAULT 13,
      academic_year_start TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'coordinator' CHECK(role IN ('coordinator', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS residents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      pgy_year INTEGER NOT NULL,
      pto_weeks_allotted INTEGER NOT NULL DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invite_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'required' CHECK(type IN ('required', 'elective')),
      min_capacity INTEGER NOT NULL DEFAULT 1,
      max_capacity INTEGER NOT NULL DEFAULT 3,
      pto_eligible INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rotation_pgy_restrictions (
      rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      pgy_year INTEGER NOT NULL,
      PRIMARY KEY (rotation_id, pgy_year)
    );

    CREATE TABLE IF NOT EXISTS rotation_gap_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      after_rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      min_gap_blocks INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      generated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      rotation_id INTEGER REFERENCES rotations(id) ON DELETE SET NULL,
      block_number INTEGER NOT NULL,
      block_half TEXT NOT NULL DEFAULT 'full',
      pto_weeks TEXT NOT NULL DEFAULT '[]',
      UNIQUE(schedule_id, resident_id, block_number, block_half)
    );

    CREATE TABLE IF NOT EXISTS pto_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      week_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(resident_id, schedule_id, week_number)
    );

    CREATE TABLE IF NOT EXISTS sick_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      notes TEXT,
      flagged INTEGER NOT NULL DEFAULT 1,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedule_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      violation_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('error', 'warning')),
      block_number INTEGER,
      resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
      rotation_id INTEGER REFERENCES rotations(id) ON DELETE CASCADE,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shift_swaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      block_number INTEGER NOT NULL,
      resident_a_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      resident_b_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedule_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      change_type TEXT NOT NULL,
      resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
      block_number INTEGER,
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jeopardy_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      block_number INTEGER NOT NULL,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      notes TEXT,
      UNIQUE(schedule_id, block_number)
    );
  `);

  // New tables (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rotation_required_by_pgy (
      rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      pgy_year INTEGER NOT NULL,
      required_blocks INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (rotation_id, pgy_year)
    );

    CREATE TABLE IF NOT EXISTS shared_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      soft_max INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rotation_shared_service (
      rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      shared_service_id INTEGER NOT NULL REFERENCES shared_services(id) ON DELETE CASCADE,
      PRIMARY KEY (rotation_id, shared_service_id)
    );

    CREATE TABLE IF NOT EXISTS rotation_prerequisites (
      rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      prerequisite_rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      PRIMARY KEY (rotation_id, prerequisite_rotation_id)
    );

    CREATE TABLE IF NOT EXISTS resident_leave_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      start_block INTEGER NOT NULL,
      end_block INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS elective_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL DEFAULT 1,
      UNIQUE(resident_id, schedule_id, rotation_id)
    );
  `);

  // Safe column additions for existing tables (idempotent)
  const addCol = (table, col, def) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch {}
  };
  addCol('programs', 'pto_priority_rule', "TEXT NOT NULL DEFAULT 'first_come'");
  addCol('rotations', 'required_blocks', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rotations', 'weekly_hours', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rotations', 'night_float', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rotations', 'two_week', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rotations', 'can_split_to_half', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rotations', 'preferred_block_min', 'INTEGER');
  addCol('rotations', 'preferred_block_max', 'INTEGER');
  addCol('assignments', 'elective_label', 'TEXT');
  addCol('programs', 'elective_options', "TEXT NOT NULL DEFAULT '[]'");

  // Program-level scheduling model configuration
  addCol('programs', 'call_model', "TEXT NOT NULL DEFAULT 'block_nightfloat'");
  addCol('programs', 'continuity_clinic_days_per_block', 'INTEGER NOT NULL DEFAULT 0');
  addCol('programs', 'max_consecutive_blocks_same_rotation', 'INTEGER');
  addCol('programs', 'pgy_count', 'INTEGER NOT NULL DEFAULT 3');

  // Rotation-level scheduling constraints
  addCol('rotations', 'max_consecutive_blocks', 'INTEGER');
  addCol('rotations', 'call_type', "TEXT NOT NULL DEFAULT 'none'");
  addCol('rotations', 'continuity_clinic_compatible', 'INTEGER NOT NULL DEFAULT 1');
  addCol('assignments', 'pinned', 'INTEGER NOT NULL DEFAULT 0');

  // Migrate assignments table to support A/B half-block assignments
  migrateAssignmentsBlockHalf(db);
}

function migrateAssignmentsBlockHalf(db) {
  // Check if block_half already exists
  let hasBH = false;
  try {
    db.exec('SELECT block_half FROM assignments LIMIT 1');
    hasBH = true;
  } catch {}
  if (hasBH) return;

  // Rename old table and recreate with new unique constraint
  try {
    db.exec('ALTER TABLE assignments RENAME TO _assignments_pre_bh');
    db.exec(`
      CREATE TABLE assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        rotation_id INTEGER REFERENCES rotations(id) ON DELETE SET NULL,
        block_number INTEGER NOT NULL,
        block_half TEXT NOT NULL DEFAULT 'full',
        pto_weeks TEXT NOT NULL DEFAULT '[]',
        UNIQUE(schedule_id, resident_id, block_number, block_half)
      )
    `);
    db.exec(`
      INSERT INTO assignments (id, schedule_id, resident_id, rotation_id, block_number, block_half, pto_weeks)
      SELECT id, schedule_id, resident_id, rotation_id, block_number, 'full', pto_weeks
      FROM _assignments_pre_bh
    `);
    db.exec('DROP TABLE _assignments_pre_bh');
  } catch (e) {
    // Restore on failure
    try { db.exec('ALTER TABLE _assignments_pre_bh RENAME TO assignments'); } catch {}
    console.error('assignments migration failed:', e.message);
  }
}

module.exports = { getDb, transaction };
