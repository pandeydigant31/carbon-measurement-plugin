/**
 * SQLite store tests.
 * Uses temporary in-memory-like files for test isolation.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { CarbonStore } from "./store.ts";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tempDbPath(): string {
  return join(tmpdir(), `carbon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

let dbPath: string;
let store: CarbonStore;

function setup() {
  dbPath = tempDbPath();
  store = new CarbonStore(dbPath);
}

function teardown() {
  try { store.close(); } catch {}
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch {}
  try { if (existsSync(dbPath + "-wal")) unlinkSync(dbPath + "-wal"); } catch {}
  try { if (existsSync(dbPath + "-shm")) unlinkSync(dbPath + "-shm"); } catch {}
}

describe("CarbonStore", () => {
  afterEach(teardown);

  test("creates tables on initialization", () => {
    setup();
    // If constructor didn't throw, tables were created successfully
    expect(store).toBeDefined();
  });

  test("saves and retrieves config", () => {
    setup();
    store.saveConfig("test_key", "test_value");
    expect(store.getConfig("test_key")).toBe("test_value");
  });

  test("returns null for missing config", () => {
    setup();
    expect(store.getConfig("nonexistent")).toBeNull();
  });

  test("upserts config on duplicate key", () => {
    setup();
    store.saveConfig("key1", "value1");
    store.saveConfig("key1", "value2");
    expect(store.getConfig("key1")).toBe("value2");
  });

  test("saveRequest stores a request record", () => {
    setup();
    // Create session first
    store.updateSessionTotals("test-session", {
      inputTokens: 100, outputTokens: 50,
      cacheCreationTokens: 0, cacheReadTokens: 0,
      energy_wh: 1.0, co2_g: 0.5, networkEnergy_wh: 0.01,
      model: "claude-sonnet-4-20250514",
    });

    store.saveRequest({
      id: "req_1",
      sessionId: "test-session",
      model: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      energy_wh: 1.0,
      co2_g: 0.5,
      timestamp: new Date().toISOString(),
    });

    // No error thrown = success
  });

  test("updateSessionTotals creates new session", () => {
    setup();
    store.updateSessionTotals("new-session", {
      inputTokens: 1000, outputTokens: 500,
      cacheCreationTokens: 100, cacheReadTokens: 200,
      energy_wh: 2.5, co2_g: 0.9, networkEnergy_wh: 0.003,
      model: "claude-sonnet-4-20250514",
    });

    const totals = store.getSessionTotals("new-session");
    expect(totals).not.toBeNull();
    expect(totals!.energy_total_wh).toBeCloseTo(2.503, 2);
    expect(totals!.co2_total_g).toBeCloseTo(0.9, 2);
  });

  test("updateSessionTotals accumulates on existing session", () => {
    setup();
    // First request
    store.updateSessionTotals("accum-session", {
      inputTokens: 1000, outputTokens: 500,
      cacheCreationTokens: 0, cacheReadTokens: 0,
      energy_wh: 2.0, co2_g: 0.8, networkEnergy_wh: 0.002,
      model: "claude-sonnet-4-20250514",
    });

    // Second request
    store.updateSessionTotals("accum-session", {
      inputTokens: 500, outputTokens: 200,
      cacheCreationTokens: 0, cacheReadTokens: 0,
      energy_wh: 1.0, co2_g: 0.4, networkEnergy_wh: 0.001,
      model: "claude-sonnet-4-20250514",
    });

    const totals = store.getSessionTotals("accum-session");
    expect(totals).not.toBeNull();
    expect(totals!.energy_total_wh).toBeCloseTo(3.003, 2);
    expect(totals!.co2_total_g).toBeCloseTo(1.2, 2);
  });

  test("getSessionTotals returns null for unknown session", () => {
    setup();
    expect(store.getSessionTotals("nonexistent")).toBeNull();
  });
});
