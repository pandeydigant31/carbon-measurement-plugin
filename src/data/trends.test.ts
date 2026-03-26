/**
 * Tests for the trends data aggregation module.
 *
 * All aggregation functions are pure, so tests use plain objects
 * without needing a database. Only getSessionHistory requires a
 * CarbonStore (tested in store.test.ts integration style).
 *
 * WORKED EXAMPLES are embedded in each test block.
 */

import { describe, test, expect } from "bun:test";
import type { SessionSummary } from "./trends.ts";
import { getWeeklyAggregates, getCumulativeStats } from "./trends.ts";

// ─── Test Data ──────────────────────────────────────────────────

/**
 * WORKED EXAMPLE SESSION SET:
 *
 * 5 sessions across 2 weeks:
 *   Week of 2026-03-16 (Mon): 2 sessions
 *     S1: Mar 16 — Sonnet, 1.2 gCO2, 3.5 Wh, 2.0 mL, 8000 tokens
 *     S2: Mar 18 — Sonnet, 0.8 gCO2, 2.5 Wh, 1.5 mL, 6000 tokens
 *
 *   Week of 2026-03-23 (Mon): 3 sessions
 *     S3: Mar 23 — Haiku,  0.3 gCO2, 1.0 Wh, 0.5 mL, 4000 tokens
 *     S4: Mar 24 — Sonnet, 1.5 gCO2, 4.0 Wh, 2.5 mL, 10000 tokens
 *     S5: Mar 25 — Haiku,  0.4 gCO2, 1.2 Wh, 0.8 mL, 5000 tokens
 */
const TEST_SESSIONS: SessionSummary[] = [
  { id: "s1", date: "2026-03-16T10:00:00Z", model: "sonnet", co2_g: 1.2, energy_wh: 3.5, water_ml: 2.0, tokens: 8000 },
  { id: "s2", date: "2026-03-18T14:00:00Z", model: "sonnet", co2_g: 0.8, energy_wh: 2.5, water_ml: 1.5, tokens: 6000 },
  { id: "s3", date: "2026-03-23T09:00:00Z", model: "haiku",  co2_g: 0.3, energy_wh: 1.0, water_ml: 0.5, tokens: 4000 },
  { id: "s4", date: "2026-03-24T11:00:00Z", model: "sonnet", co2_g: 1.5, energy_wh: 4.0, water_ml: 2.5, tokens: 10000 },
  { id: "s5", date: "2026-03-25T16:00:00Z", model: "haiku",  co2_g: 0.4, energy_wh: 1.2, water_ml: 0.8, tokens: 5000 },
];

// ─── getWeeklyAggregates ────────────────────────────────────────

describe("getWeeklyAggregates", () => {
  test("empty input returns empty array", () => {
    expect(getWeeklyAggregates([])).toEqual([]);
  });

  test("groups sessions by ISO week and computes correct aggregates", () => {
    /**
     * WORKED EXAMPLE:
     *
     * Week 2026-03-16:
     *   totalCO2 = 1.2 + 0.8 = 2.0 g
     *   totalEnergy = 3.5 + 2.5 = 6.0 Wh
     *   avgCO2PerSession = 2.0 / 2 = 1.0 g
     *   sessionCount = 2
     *   primaryModel = "sonnet" (2 occurrences)
     *
     * Week 2026-03-23:
     *   totalCO2 = 0.3 + 1.5 + 0.4 = 2.2 g
     *   totalEnergy = 1.0 + 4.0 + 1.2 = 6.2 Wh
     *   avgCO2PerSession = 2.2 / 3 = 0.7333 g
     *   sessionCount = 3
     *   primaryModel = "haiku" (2 occurrences vs 1 sonnet)
     */
    const weeks = getWeeklyAggregates(TEST_SESSIONS);

    expect(weeks).toHaveLength(2);

    // Week 1: 2026-03-16
    const w1 = weeks[0]!;
    expect(w1.weekStart).toBe("2026-03-16");
    expect(w1.totalCO2).toBeCloseTo(2.0, 4);
    expect(w1.totalEnergy).toBeCloseTo(6.0, 4);
    expect(w1.avgCO2PerSession).toBeCloseTo(1.0, 4);
    expect(w1.sessionCount).toBe(2);
    expect(w1.primaryModel).toBe("sonnet");

    // Week 2: 2026-03-23
    const w2 = weeks[1]!;
    expect(w2.weekStart).toBe("2026-03-23");
    expect(w2.totalCO2).toBeCloseTo(2.2, 4);
    expect(w2.totalEnergy).toBeCloseTo(6.2, 4);
    expect(w2.avgCO2PerSession).toBeCloseTo(2.2 / 3, 4);
    expect(w2.sessionCount).toBe(3);
    expect(w2.primaryModel).toBe("haiku");
  });

  test("single session produces one week", () => {
    const single: SessionSummary[] = [
      { id: "x1", date: "2026-03-25T12:00:00Z", model: "opus", co2_g: 5.0, energy_wh: 15.0, water_ml: 8.0, tokens: 20000 },
    ];

    const weeks = getWeeklyAggregates(single);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.sessionCount).toBe(1);
    expect(weeks[0]!.avgCO2PerSession).toBe(5.0);
    expect(weeks[0]!.primaryModel).toBe("opus");
  });

  test("weeks are sorted ascending by weekStart", () => {
    // Pass sessions in reverse order
    const reversed = [...TEST_SESSIONS].reverse();
    const weeks = getWeeklyAggregates(reversed);

    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.weekStart < weeks[1]!.weekStart).toBe(true);
  });

  test("Sunday session belongs to the previous week (ISO week starts Monday)", () => {
    /**
     * 2026-03-22 is a Sunday.
     * ISO week starts Monday, so Sunday Mar 22 belongs to the week starting Mar 16.
     */
    const sundaySession: SessionSummary[] = [
      { id: "sun", date: "2026-03-22T20:00:00Z", model: "sonnet", co2_g: 1.0, energy_wh: 3.0, water_ml: 1.0, tokens: 5000 },
    ];

    const weeks = getWeeklyAggregates(sundaySession);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.weekStart).toBe("2026-03-16");
  });
});

// ─── getCumulativeStats ─────────────────────────────────────────

describe("getCumulativeStats", () => {
  test("empty input returns zeroes", () => {
    const stats = getCumulativeStats([]);
    expect(stats.totalCO2).toBe(0);
    expect(stats.totalSaved).toBe(0);
    expect(stats.totalWater).toBe(0);
    expect(stats.sessionsCount).toBe(0);
    expect(stats.treesEquivalent).toBe(0);
  });

  test("sums totals correctly across sessions", () => {
    /**
     * WORKED EXAMPLE:
     *
     * totalCO2 = 1.2 + 0.8 + 0.3 + 1.5 + 0.4 = 4.2 g
     * totalWater = 2.0 + 1.5 + 0.5 + 2.5 + 0.8 = 7.3 mL
     * sessionsCount = 5
     */
    const stats = getCumulativeStats(TEST_SESSIONS);

    expect(stats.totalCO2).toBeCloseTo(4.2, 4);
    expect(stats.totalWater).toBeCloseTo(7.3, 4);
    expect(stats.sessionsCount).toBe(5);
  });

  test("calculates totalSaved based on human-hours heuristic", () => {
    /**
     * WORKED EXAMPLE (per-session human CO2 estimate):
     *
     * Human CO2 rate: 1850 gCO2e/hr (car commuter)
     * Hours per 1000 output tokens: 1.0
     * Estimated output = total tokens / 2
     *
     * S1: 8000 tokens → 4000 output → 4.0 hrs (capped at 4.0) → 7400 g
     * S2: 6000 tokens → 3000 output → 3.0 hrs → 5550 g
     * S3: 4000 tokens → 2000 output → 2.0 hrs → 3700 g
     * S4: 10000 tokens → 5000 output → 4.0 hrs (capped at 4.0) → 7400 g
     * S5: 5000 tokens → 2500 output → 2.5 hrs → 4625 g
     *
     * Total human CO2 = 7400 + 5550 + 3700 + 7400 + 4625 = 28675 g
     * Total AI CO2 = 4.2 g
     * totalSaved = 28675 - 4.2 = 28670.8 g
     * treesEquivalent = 28670.8 / 22000 ≈ 1.303 trees
     */
    const stats = getCumulativeStats(TEST_SESSIONS);

    // Human CO2 should be much larger than AI CO2 for typical sessions
    expect(stats.totalSaved).toBeGreaterThan(0);

    // Verify the specific calculation
    expect(stats.totalSaved).toBeCloseTo(28670.8, 0);
    expect(stats.treesEquivalent).toBeCloseTo(28670.8 / 22000, 2);
  });

  test("treesEquivalent is zero when AI uses more than human alternative", () => {
    /**
     * Edge case: a session with enormous CO2 and tiny token count.
     * If the human alternative would produce less CO2, totalSaved is negative
     * and treesEquivalent should be 0 (no negative trees).
     *
     * 100 tokens → 50 output → 0.1 hrs (floor) → human CO2 = 185 g
     * AI CO2 = 1,000,000 g
     * totalSaved = 185 - 1,000,000 = -999,815 g → trees = 0
     */
    const extreme: SessionSummary[] = [
      { id: "x1", date: "2026-03-25T12:00:00Z", model: "opus", co2_g: 1_000_000, energy_wh: 100, water_ml: 50, tokens: 100 },
    ];

    const stats = getCumulativeStats(extreme);
    expect(stats.totalSaved).toBeLessThan(0);
    expect(stats.treesEquivalent).toBe(0);
  });

  test("single session calculates correctly", () => {
    /**
     * WORKED EXAMPLE (single session):
     *
     * S1: 20000 tokens → 10000 output → 4.0 hrs (capped) → human CO2 = 7400 g
     * AI CO2 = 2.0 g
     * totalSaved = 7400 - 2.0 = 7398 g
     * treesEquivalent = 7398 / 22000 ≈ 0.3363
     */
    const single: SessionSummary[] = [
      { id: "z1", date: "2026-03-25T12:00:00Z", model: "sonnet", co2_g: 2.0, energy_wh: 6.0, water_ml: 3.0, tokens: 20000 },
    ];

    const stats = getCumulativeStats(single);
    expect(stats.totalCO2).toBeCloseTo(2.0, 4);
    expect(stats.totalWater).toBeCloseTo(3.0, 4);
    expect(stats.sessionsCount).toBe(1);
    expect(stats.totalSaved).toBeCloseTo(7398.0, 0);
    expect(stats.treesEquivalent).toBeCloseTo(7398 / 22000, 2);
  });

  test("hours estimation is capped at 4.0 per session", () => {
    /**
     * Even with 200,000 tokens (100k output estimate), hours should cap at 4.0.
     *
     * 200000 tokens → 100000 output → raw hours = 100.0 → capped at 4.0
     * human CO2 = 4.0 * 1850 = 7400 g
     */
    const large: SessionSummary[] = [
      { id: "big", date: "2026-03-25T12:00:00Z", model: "opus", co2_g: 10.0, energy_wh: 30.0, water_ml: 15.0, tokens: 200000 },
    ];

    const stats = getCumulativeStats(large);
    // Human CO2 should be 7400, not 185000
    expect(stats.totalSaved).toBeCloseTo(7400 - 10, 0);
  });

  test("hours estimation has floor of 0.1 per session", () => {
    /**
     * With very few tokens, hours floor at 0.1.
     *
     * 10 tokens → 5 output → raw hours = 0.005 → floored at 0.1
     * human CO2 = 0.1 * 1850 = 185 g
     */
    const tiny: SessionSummary[] = [
      { id: "tiny", date: "2026-03-25T12:00:00Z", model: "haiku", co2_g: 0.01, energy_wh: 0.05, water_ml: 0.02, tokens: 10 },
    ];

    const stats = getCumulativeStats(tiny);
    expect(stats.totalSaved).toBeCloseTo(185 - 0.01, 0);
  });
});
