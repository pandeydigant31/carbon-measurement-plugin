/**
 * Schema migration support for the carbon measurement SQLite database.
 */

import type { Database } from "bun:sqlite";

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Run all pending migrations against the database.
 *
 * Creates the schema_version tracking table if it doesn't exist,
 * then applies each migration whose version exceeds the current DB version.
 */
export function runMigrations(db: Database): void {
  // Create the schema_version table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Determine current version
  const row = db
    .query<{ version: number }, []>(
      "SELECT MAX(version) as version FROM schema_version"
    )
    .get();
  const currentVersion = row?.version ?? 0;

  // Run each pending migration inside a transaction
  const migrations: Array<{ version: number; up: (db: Database) => void }> = [
    { version: 1, up: migration001 },
    { version: 2, up: migration002 },
  ];

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.run("BEGIN TRANSACTION");
      try {
        migration.up(db);
        db.run(
          "INSERT INTO schema_version (version) VALUES (?)",
          [migration.version]
        );
        db.run("COMMIT");
      } catch (err) {
        db.run("ROLLBACK");
        throw new Error(
          `Migration ${migration.version} failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}

/**
 * Migration 1: Create all core tables from PROMPT.md section 6.1
 */
function migration001(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_hash TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      model_primary TEXT,

      -- Token counts
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_creation_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      num_requests INTEGER DEFAULT 0,

      -- Energy (Wh)
      energy_inference_wh REAL,
      energy_embodied_wh REAL,
      energy_network_wh REAL,
      energy_total_wh REAL,
      energy_total_low_wh REAL,
      energy_total_high_wh REAL,

      -- Carbon (gCO2e)
      co2_operational_g REAL,
      co2_embodied_g REAL,
      co2_network_g REAL,
      co2_total_g REAL,
      co2_total_low_g REAL,
      co2_total_high_g REAL,

      -- Water (mL)
      water_direct_ml REAL,
      water_indirect_ml REAL,
      water_total_ml REAL,

      -- Context
      grid_cif_used REAL,
      grid_cif_source TEXT,
      region_inferred TEXT,
      pue_used REAL,

      -- Comparative
      human_hours_saved_est REAL,
      human_co2_equivalent_g REAL,
      net_impact_g REAL,

      -- Metadata
      plugin_version TEXT,
      methodology_version TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      energy_wh REAL,
      co2_g REAL,
      timestamp TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS grid_intensity_cache (
      region TEXT,
      timestamp TEXT,
      cif_kg_per_kwh REAL,
      source TEXT,
      fetched_at TEXT,
      PRIMARY KEY (region, timestamp)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )
  `);
}

/**
 * Migration 2: Add uncertainty key driver columns to sessions table (Phase 2).
 */
function migration002(db: Database): void {
  db.run(`ALTER TABLE sessions ADD COLUMN uncertainty_key_driver TEXT`);
  db.run(`ALTER TABLE sessions ADD COLUMN uncertainty_key_driver_fraction REAL`);
}
