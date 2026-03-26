/**
 * SQLite storage layer using Bun's built-in bun:sqlite driver.
 * WAL mode for concurrent read performance.
 */

import { Database } from "bun:sqlite";
import type { SessionAssessment } from "../types.ts";
import { runMigrations } from "./migrations.ts";

export class CarbonStore {
  private db: Database;

  // Prepared statements (lazily initialized after schema exists)
  private stmtInsertSession!: ReturnType<Database["prepare"]>;
  private stmtGetSession!: ReturnType<Database["prepare"]>;
  private stmtGetRecentSessions!: ReturnType<Database["prepare"]>;
  private stmtSaveConfig!: ReturnType<Database["prepare"]>;
  private stmtGetConfig!: ReturnType<Database["prepare"]>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.initSchema();
    this.prepareStatements();
  }

  /**
   * Create tables by running all pending migrations.
   */
  initSchema(): void {
    runMigrations(this.db);
  }

  /**
   * Prepare reusable statements for performance.
   */
  private prepareStatements(): void {
    this.stmtInsertSession = this.db.prepare(`
      INSERT INTO sessions (
        id, started_at, ended_at, model_primary,
        total_input_tokens, total_output_tokens,
        total_cache_creation_tokens, total_cache_read_tokens,
        num_requests,
        energy_inference_wh, energy_embodied_wh, energy_network_wh,
        energy_total_wh, energy_total_low_wh, energy_total_high_wh,
        co2_operational_g, co2_embodied_g, co2_network_g,
        co2_total_g, co2_total_low_g, co2_total_high_g,
        water_direct_ml, water_indirect_ml, water_total_ml,
        grid_cif_used, grid_cif_source, region_inferred, pue_used,
        plugin_version, methodology_version,
        updated_at
      ) VALUES (
        $id, $startedAt, $endedAt, $modelPrimary,
        $totalInputTokens, $totalOutputTokens,
        $totalCacheCreationTokens, $totalCacheReadTokens,
        $numRequests,
        $energyInferenceWh, $energyEmbodiedWh, $energyNetworkWh,
        $energyTotalWh, $energyTotalLowWh, $energyTotalHighWh,
        $co2OperationalG, $co2EmbodiedG, $co2NetworkG,
        $co2TotalG, $co2TotalLowG, $co2TotalHighG,
        $waterDirectMl, $waterIndirectMl, $waterTotalMl,
        $gridCifUsed, $gridCifSource, $regionInferred, $pueUsed,
        $pluginVersion, $methodologyVersion,
        datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        ended_at = excluded.ended_at,
        model_primary = excluded.model_primary,
        total_input_tokens = excluded.total_input_tokens,
        total_output_tokens = excluded.total_output_tokens,
        total_cache_creation_tokens = excluded.total_cache_creation_tokens,
        total_cache_read_tokens = excluded.total_cache_read_tokens,
        num_requests = excluded.num_requests,
        energy_inference_wh = excluded.energy_inference_wh,
        energy_embodied_wh = excluded.energy_embodied_wh,
        energy_network_wh = excluded.energy_network_wh,
        energy_total_wh = excluded.energy_total_wh,
        energy_total_low_wh = excluded.energy_total_low_wh,
        energy_total_high_wh = excluded.energy_total_high_wh,
        co2_operational_g = excluded.co2_operational_g,
        co2_embodied_g = excluded.co2_embodied_g,
        co2_network_g = excluded.co2_network_g,
        co2_total_g = excluded.co2_total_g,
        co2_total_low_g = excluded.co2_total_low_g,
        co2_total_high_g = excluded.co2_total_high_g,
        water_direct_ml = excluded.water_direct_ml,
        water_indirect_ml = excluded.water_indirect_ml,
        water_total_ml = excluded.water_total_ml,
        grid_cif_used = excluded.grid_cif_used,
        grid_cif_source = excluded.grid_cif_source,
        region_inferred = excluded.region_inferred,
        pue_used = excluded.pue_used,
        plugin_version = excluded.plugin_version,
        methodology_version = excluded.methodology_version,
        updated_at = datetime('now')
    `);

    this.stmtGetSession = this.db.prepare(
      "SELECT * FROM sessions WHERE id = ?"
    );

    this.stmtGetRecentSessions = this.db.prepare(
      "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?"
    );

    this.stmtSaveConfig = this.db.prepare(`
      INSERT OR REPLACE INTO user_config (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `);

    this.stmtGetConfig = this.db.prepare(
      "SELECT value FROM user_config WHERE key = ?"
    );
  }

  /**
   * Save a full session assessment to the database.
   */
  saveSession(assessment: SessionAssessment): void {
    this.stmtInsertSession.run({
      $id: assessment.sessionId,
      $startedAt: assessment.startedAt,
      $endedAt: assessment.endedAt,
      $modelPrimary: assessment.tokens.primaryModel,
      $totalInputTokens: assessment.tokens.totalInputTokens,
      $totalOutputTokens: assessment.tokens.totalOutputTokens,
      $totalCacheCreationTokens: assessment.tokens.totalCacheCreationTokens,
      $totalCacheReadTokens: assessment.tokens.totalCacheReadTokens,
      $numRequests: assessment.tokens.numRequests,
      $energyInferenceWh:
        assessment.energy.prefill_Wh +
        assessment.energy.decode_Wh +
        assessment.energy.kvCache_Wh +
        assessment.energy.cacheOps_Wh,
      $energyEmbodiedWh: assessment.energy.embodied_Wh,
      $energyNetworkWh: assessment.energy.network_Wh,
      $energyTotalWh: assessment.energy.total_Wh,
      $energyTotalLowWh: assessment.energyLow_Wh,
      $energyTotalHighWh: assessment.energyHigh_Wh,
      $co2OperationalG: assessment.carbon.operational_gCO2e,
      $co2EmbodiedG: assessment.carbon.embodied_gCO2e,
      $co2NetworkG: assessment.carbon.network_gCO2e,
      $co2TotalG: assessment.carbon.total_gCO2e,
      $co2TotalLowG: assessment.carbonLow_gCO2e,
      $co2TotalHighG: assessment.carbonHigh_gCO2e,
      $waterDirectMl: assessment.water.direct_mL,
      $waterIndirectMl: assessment.water.indirect_mL,
      $waterTotalMl: assessment.water.total_mL,
      $gridCifUsed: assessment.carbon.gridCif_kgPerKWh,
      $gridCifSource: assessment.carbon.gridCifSource,
      $regionInferred: assessment.carbon.regionInferred,
      $pueUsed: assessment.carbon.pueUsed,
      $pluginVersion: assessment.pluginVersion,
      $methodologyVersion: assessment.methodologyVersion,
    });
  }

  /**
   * Retrieve a single session assessment by ID.
   * Returns null if not found.
   */
  getSession(sessionId: string): SessionAssessment | null {
    const row = this.stmtGetSession.get(sessionId) as SessionRow | null;
    if (!row) return null;
    return rowToAssessment(row);
  }

  /**
   * Retrieve the most recent sessions, ordered by creation time descending.
   */
  getRecentSessions(limit: number): SessionAssessment[] {
    const rows = this.stmtGetRecentSessions.all(limit) as SessionRow[];
    return rows.map(rowToAssessment);
  }

  /**
   * Save a configuration key-value pair.
   */
  saveConfig(key: string, value: string): void {
    this.stmtSaveConfig.run(key, value);
  }

  /**
   * Retrieve a configuration value by key.
   * Returns null if the key doesn't exist.
   */
  getConfig(key: string): string | null {
    const row = this.stmtGetConfig.get(key) as { value: string } | null;
    return row?.value ?? null;
  }

  /**
   * Save a per-request record to the requests table.
   */
  saveRequest(req: {
    id: string;
    sessionId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    energy_wh: number;
    co2_g: number;
    timestamp: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO requests (id, session_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, energy_wh, co2_g, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.id,
        req.sessionId,
        req.model,
        req.inputTokens,
        req.outputTokens,
        req.cacheCreationTokens,
        req.cacheReadTokens,
        req.energy_wh,
        req.co2_g,
        req.timestamp
      );
  }

  /**
   * Update running session totals incrementally (called per response).
   * Creates the session row if it doesn't exist, otherwise accumulates.
   * Phase 2: includes all impact categories + uncertainty bounds.
   */
  updateSessionTotals(
    sessionId: string,
    delta: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      energy_wh: number;
      co2_operational_g?: number;
      co2_embodied_g?: number;
      co2_network_g?: number;
      co2_total_g?: number;
      networkEnergy_wh: number;
      water_direct_ml?: number;
      water_indirect_ml?: number;
      water_total_ml?: number;
      co2_low_g?: number;
      co2_high_g?: number;
      energy_low_wh?: number;
      energy_high_wh?: number;
      uncertainty_key_driver?: string;
      uncertainty_key_driver_fraction?: number;
      model: string;
      // Legacy field for backward compat
      co2_g?: number;
    }
  ): void {
    const co2Op = delta.co2_operational_g ?? delta.co2_g ?? 0;
    const co2Emb = delta.co2_embodied_g ?? 0;
    const co2Net = delta.co2_network_g ?? 0;
    const co2Total = delta.co2_total_g ?? (co2Op + co2Emb + co2Net);

    this.db
      .prepare(
        `INSERT INTO sessions (id, started_at, model_primary,
          total_input_tokens, total_output_tokens,
          total_cache_creation_tokens, total_cache_read_tokens, num_requests,
          energy_inference_wh, energy_network_wh, energy_total_wh,
          energy_total_low_wh, energy_total_high_wh,
          co2_operational_g, co2_embodied_g, co2_network_g,
          co2_total_g, co2_total_low_g, co2_total_high_g,
          water_direct_ml, water_indirect_ml, water_total_ml,
          uncertainty_key_driver, uncertainty_key_driver_fraction,
          updated_at)
         VALUES (?, datetime('now'), ?,
          ?, ?, ?, ?, 1,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
          total_input_tokens = total_input_tokens + excluded.total_input_tokens,
          total_output_tokens = total_output_tokens + excluded.total_output_tokens,
          total_cache_creation_tokens = total_cache_creation_tokens + excluded.total_cache_creation_tokens,
          total_cache_read_tokens = total_cache_read_tokens + excluded.total_cache_read_tokens,
          num_requests = num_requests + 1,
          energy_inference_wh = COALESCE(energy_inference_wh, 0) + excluded.energy_inference_wh,
          energy_network_wh = COALESCE(energy_network_wh, 0) + excluded.energy_network_wh,
          energy_total_wh = COALESCE(energy_total_wh, 0) + excluded.energy_total_wh,
          energy_total_low_wh = excluded.energy_total_low_wh,
          energy_total_high_wh = excluded.energy_total_high_wh,
          co2_operational_g = COALESCE(co2_operational_g, 0) + excluded.co2_operational_g,
          co2_embodied_g = COALESCE(co2_embodied_g, 0) + excluded.co2_embodied_g,
          co2_network_g = COALESCE(co2_network_g, 0) + excluded.co2_network_g,
          co2_total_g = COALESCE(co2_total_g, 0) + excluded.co2_total_g,
          co2_total_low_g = excluded.co2_total_low_g,
          co2_total_high_g = excluded.co2_total_high_g,
          water_direct_ml = COALESCE(water_direct_ml, 0) + excluded.water_direct_ml,
          water_indirect_ml = COALESCE(water_indirect_ml, 0) + excluded.water_indirect_ml,
          water_total_ml = COALESCE(water_total_ml, 0) + excluded.water_total_ml,
          uncertainty_key_driver = excluded.uncertainty_key_driver,
          uncertainty_key_driver_fraction = excluded.uncertainty_key_driver_fraction,
          updated_at = datetime('now')`
      )
      .run(
        sessionId,
        delta.model,
        delta.inputTokens,
        delta.outputTokens,
        delta.cacheCreationTokens,
        delta.cacheReadTokens,
        delta.energy_wh,
        delta.networkEnergy_wh,
        delta.energy_wh + delta.networkEnergy_wh,
        delta.energy_low_wh ?? null,
        delta.energy_high_wh ?? null,
        co2Op,
        co2Emb,
        co2Net,
        co2Total,
        delta.co2_low_g ?? null,
        delta.co2_high_g ?? null,
        delta.water_direct_ml ?? 0,
        delta.water_indirect_ml ?? 0,
        delta.water_total_ml ?? 0,
        delta.uncertainty_key_driver ?? null,
        delta.uncertainty_key_driver_fraction ?? null,
      );
  }

  /**
   * Get running session totals for the statusline.
   */
  getSessionTotals(sessionId: string): {
    co2_total_g: number | null;
    co2_operational_g: number | null;
    co2_embodied_g: number | null;
    co2_network_g: number | null;
    co2_total_low_g: number | null;
    co2_total_high_g: number | null;
    energy_total_wh: number | null;
    energy_total_low_wh: number | null;
    energy_total_high_wh: number | null;
    water_total_ml: number | null;
    uncertainty_key_driver: string | null;
    uncertainty_key_driver_fraction: number | null;
  } | null {
    const row = this.db
      .prepare(
        `SELECT co2_total_g, co2_operational_g, co2_embodied_g, co2_network_g,
                co2_total_low_g, co2_total_high_g,
                energy_total_wh, energy_total_low_wh, energy_total_high_wh,
                water_total_ml,
                uncertainty_key_driver, uncertainty_key_driver_fraction
         FROM sessions WHERE id = ?`
      )
      .get(sessionId) as {
      co2_total_g: number | null;
      co2_operational_g: number | null;
      co2_embodied_g: number | null;
      co2_network_g: number | null;
      co2_total_low_g: number | null;
      co2_total_high_g: number | null;
      energy_total_wh: number | null;
      energy_total_low_wh: number | null;
      energy_total_high_wh: number | null;
      water_total_ml: number | null;
      uncertainty_key_driver: string | null;
      uncertainty_key_driver_fraction: number | null;
    } | null;
    return row ?? null;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

// ─── Internal Helpers ────────────────────────────────────────────

/** Shape of a row from the sessions table */
interface SessionRow {
  id: string;
  project_hash: string | null;
  started_at: string;
  ended_at: string | null;
  model_primary: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  num_requests: number;
  energy_inference_wh: number | null;
  energy_embodied_wh: number | null;
  energy_network_wh: number | null;
  energy_total_wh: number | null;
  energy_total_low_wh: number | null;
  energy_total_high_wh: number | null;
  co2_operational_g: number | null;
  co2_embodied_g: number | null;
  co2_network_g: number | null;
  co2_total_g: number | null;
  co2_total_low_g: number | null;
  co2_total_high_g: number | null;
  water_direct_ml: number | null;
  water_indirect_ml: number | null;
  water_total_ml: number | null;
  grid_cif_used: number | null;
  grid_cif_source: string | null;
  region_inferred: string | null;
  pue_used: number | null;
  human_hours_saved_est: number | null;
  human_co2_equivalent_g: number | null;
  net_impact_g: number | null;
  plugin_version: string | null;
  methodology_version: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Convert a raw database row into a SessionAssessment object. */
function rowToAssessment(row: SessionRow): SessionAssessment {
  return {
    sessionId: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? "",
    tokens: {
      requests: [], // Per-request detail would require a separate query
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCacheCreationTokens: row.total_cache_creation_tokens,
      totalCacheReadTokens: row.total_cache_read_tokens,
      numRequests: row.num_requests,
      primaryModel: row.model_primary ?? "unknown",
    },
    energy: {
      prefill_Wh: 0, // Breakdown not stored individually; inference total is available
      decode_Wh: 0,
      kvCache_Wh: 0,
      cacheOps_Wh: 0,
      network_Wh: row.energy_network_wh ?? 0,
      embodied_Wh: row.energy_embodied_wh ?? 0,
      total_Wh: row.energy_total_wh ?? 0,
    },
    carbon: {
      operational_gCO2e: row.co2_operational_g ?? 0,
      embodied_gCO2e: row.co2_embodied_g ?? 0,
      network_gCO2e: row.co2_network_g ?? 0,
      total_gCO2e: row.co2_total_g ?? 0,
      gridCif_kgPerKWh: row.grid_cif_used ?? 0,
      gridCifSource: (row.grid_cif_source as SessionAssessment["carbon"]["gridCifSource"]) ?? "fallback",
      regionInferred: row.region_inferred ?? "",
      pueUsed: row.pue_used ?? 0,
    },
    water: {
      direct_mL: row.water_direct_ml ?? 0,
      indirect_mL: row.water_indirect_ml ?? 0,
      total_mL: row.water_total_ml ?? 0,
    },
    energyLow_Wh: row.energy_total_low_wh ?? 0,
    energyHigh_Wh: row.energy_total_high_wh ?? 0,
    carbonLow_gCO2e: row.co2_total_low_g ?? 0,
    carbonHigh_gCO2e: row.co2_total_high_g ?? 0,
    pluginVersion: row.plugin_version ?? "",
    methodologyVersion: row.methodology_version ?? "",
  };
}
