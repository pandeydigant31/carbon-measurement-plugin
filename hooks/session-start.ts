#!/usr/bin/env bun
/**
 * SessionStart hook — Initialize database and load configuration.
 * Budget: < 200ms (one-time setup).
 * MUST exit 0 on any error to never break Claude Code.
 */

import { resolve, dirname } from "node:path";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(import.meta.path));
const DATA_DIR = resolve(PLUGIN_ROOT, ".data");
const DB_PATH = resolve(DATA_DIR, "carbon.db");

try {
  // Ensure data directory exists
  const { mkdirSync } = await import("node:fs");
  mkdirSync(DATA_DIR, { recursive: true });

  // Initialize store (runs migrations if needed)
  const { CarbonStore } = await import("../src/data/store.ts");
  const store = new CarbonStore(DB_PATH);

  // Read session ID from environment (Claude Code provides this)
  const sessionId = process.env.SESSION_ID ?? `session_${Date.now()}`;

  // Store session start timestamp
  store.saveConfig("current_session_id", sessionId);
  store.saveConfig("session_start_time", new Date().toISOString());

  // Check benchmark staleness (warn if >90 days old)
  const { BENCHMARKS_UPDATED } = await import("../src/models/benchmarks.ts");
  const benchmarkDate = new Date(BENCHMARKS_UPDATED);
  const daysSinceUpdate = Math.floor((Date.now() - benchmarkDate.getTime()) / (1000 * 60 * 60 * 24));
  const benchmarkStale = daysSinceUpdate > 90;
  if (benchmarkStale) {
    store.saveConfig("benchmark_stale_warning", `Benchmarks are ${daysSinceUpdate} days old (updated ${BENCHMARKS_UPDATED}). Consider refreshing performance data.`);
  }

  // Prewarm real-time CIF cache (background, non-blocking)
  const region = process.env.AWS_REGION ?? "us-east-1";
  const apiKey = store.getConfig("electricity_maps_api_key");

  store.close();

  // Fire-and-forget CIF prewarm (after DB close, no await needed)
  if (apiKey) {
    import("../src/data/grid-intensity.ts").then(({ fetchGridCIF }) => {
      fetchGridCIF(region, apiKey).catch(() => {});
    }).catch(() => {});
  }

  // Output for Claude Code hook system
  console.log(JSON.stringify({
    result: "session_initialized",
    sessionId,
    dbPath: DB_PATH,
    benchmarkStale,
    daysSinceBenchmarkUpdate: daysSinceUpdate,
  }));
} catch (err) {
  // MUST exit 0 — never break Claude Code
  console.error(`[carbon-plugin] session-start error: ${err}`);
}

process.exit(0);
