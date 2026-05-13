const { pool } = require('./db');

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        block_length_weeks INTEGER NOT NULL DEFAULT 4,
        total_blocks INTEGER NOT NULL DEFAULT 13,
        academic_year_start TEXT NOT NULL,
        pto_priority_rule TEXT NOT NULL DEFAULT 'first_come',
        elective_options TEXT NOT NULL DEFAULT '[]',
        call_model TEXT NOT NULL DEFAULT 'block_nightfloat',
        continuity_clinic_days_per_block INTEGER NOT NULL DEFAULT 0,
        max_consecutive_blocks_same_rotation INTEGER,
        pgy_count INTEGER NOT NULL DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'coordinator' CHECK(role IN ('coordinator', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS residents (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        pgy_year INTEGER NOT NULL,
        pto_weeks_allotted INTEGER NOT NULL DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_tokens (
        id SERIAL PRIMARY KEY,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rotations (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'required' CHECK(type IN ('required', 'elective')),
        min_capacity INTEGER NOT NULL DEFAULT 1,
        max_capacity INTEGER NOT NULL DEFAULT 3,
        pto_eligible INTEGER NOT NULL DEFAULT 0,
        required_blocks INTEGER NOT NULL DEFAULT 0,
        weekly_hours INTEGER NOT NULL DEFAULT 0,
        night_float INTEGER NOT NULL DEFAULT 0,
        two_week INTEGER NOT NULL DEFAULT 0,
        can_split_to_half INTEGER NOT NULL DEFAULT 0,
        preferred_block_min INTEGER,
        preferred_block_max INTEGER,
        max_consecutive_blocks INTEGER,
        call_type TEXT NOT NULL DEFAULT 'none',
        continuity_clinic_compatible INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rotation_pgy_restrictions (
        rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        pgy_year INTEGER NOT NULL,
        PRIMARY KEY (rotation_id, pgy_year)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rotation_required_by_pgy (
        rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        pgy_year INTEGER NOT NULL,
        required_blocks INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (rotation_id, pgy_year)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rotation_gap_rules (
        id SERIAL PRIMARY KEY,
        rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        after_rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        min_gap_blocks INTEGER NOT NULL DEFAULT 1
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rotation_prerequisites (
        rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        prerequisite_rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        PRIMARY KEY (rotation_id, prerequisite_rotation_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        soft_max INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rotation_shared_service (
        rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        shared_service_id INTEGER NOT NULL REFERENCES shared_services(id) ON DELETE CASCADE,
        PRIMARY KEY (rotation_id, shared_service_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        academic_year TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
        generated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        rotation_id INTEGER REFERENCES rotations(id) ON DELETE SET NULL,
        block_number INTEGER NOT NULL,
        block_half TEXT NOT NULL DEFAULT 'full',
        pto_weeks TEXT NOT NULL DEFAULT '[]',
        elective_label TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        UNIQUE(schedule_id, resident_id, block_number, block_half)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pto_requests (
        id SERIAL PRIMARY KEY,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resident_id, schedule_id, week_number)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sick_days (
        id SERIAL PRIMARY KEY,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        notes TEXT,
        flagged INTEGER NOT NULL DEFAULT 1,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_violations (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        violation_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('error', 'warning')),
        block_number INTEGER,
        resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
        rotation_id INTEGER REFERENCES rotations(id) ON DELETE CASCADE,
        message TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shift_swaps (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        block_number INTEGER NOT NULL,
        resident_a_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        resident_b_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_change_log (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        change_type TEXT NOT NULL,
        resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
        block_number INTEGER,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS jeopardy_assignments (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        block_number INTEGER NOT NULL,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        notes TEXT,
        UNIQUE(schedule_id, block_number)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS resident_leave_periods (
        id SERIAL PRIMARY KEY,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        start_block INTEGER NOT NULL,
        end_block INTEGER NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS elective_preferences (
        id SERIAL PRIMARY KEY,
        resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL DEFAULT 1,
        UNIQUE(resident_id, schedule_id, rotation_id)
      )
    `);

    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

module.exports = { initDb };
