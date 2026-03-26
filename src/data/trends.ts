/**
 * Data aggregation utilities for the carbon:trend view.
 *
 * All functions are pure (no side effects) except getSessionHistory,
 * which reads from the CarbonStore. Aggregation logic is separated
 * so it can be tested without a database.
 */

import type { CarbonStore } from "./store.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  date: string;
  model: string;
  co2_g: number;
  energy_wh: number;
  water_ml: number;
  tokens: number;
}

export interface WeeklyAggregate {
  weekStart: string;
  totalCO2: number;
  totalEnergy: number;
  avgCO2PerSession: number;
  sessionCount: number;
  primaryModel: string;
}

export interface CumulativeStats {
  totalCO2: number;
  totalSaved: number;
  totalWater: number;
  sessionsCount: number;
  treesEquivalent: number;
}

// ─── Constants ──────────────────────────────────────────────────

/**
 * CO2 absorbed by one tree per year in grams.
 * Source: EPA (2024), Greenhouse Gas Equivalencies Calculator,
 *         medium growth coniferous/deciduous forest, confidence: high
 */
const CO2_PER_TREE_PER_YEAR_G = 22_000; // 22 kgCO2e = 22,000 g

/**
 * Estimated human CO2 per hour for net-impact calculation.
 * Source: EPA (2024), car commuter baseline (most common scenario).
 * Matches the car mode value in src/calculator/comparative.ts.
 */
const HUMAN_CO2_PER_HOUR_G = 1850;

/**
 * Heuristic: estimated developer-hours saved per 1000 output tokens.
 * Source: Internal estimation (same heuristic as comparative.ts),
 *         ~500 tokens/task, ~0.5 hr/task = 1 hr per 1000 output tokens.
 * Capped at 4 hours per session in comparative.ts, but here we use
 * the raw rate since we aggregate across sessions.
 */
const HOURS_PER_1000_OUTPUT_TOKENS = 1.0;

// ─── Session History (DB read) ──────────────────────────────────

/**
 * Retrieve session history from the store as simplified summaries.
 *
 * @param store  CarbonStore instance (must be open).
 * @param limit  Maximum number of sessions to return (default: all via 10000).
 * @returns      Array of SessionSummary, ordered by date ascending.
 */
export function getSessionHistory(
  store: CarbonStore,
  limit: number = 10_000,
): SessionSummary[] {
  // getRecentSessions returns DESC order; we reverse to ASC for trend analysis
  const assessments = store.getRecentSessions(limit);
  return assessments
    .map((a) => ({
      id: a.sessionId,
      date: a.startedAt,
      model: a.tokens.primaryModel,
      co2_g: a.carbon.total_gCO2e,
      energy_wh: a.energy.total_Wh,
      water_ml: a.water.total_mL,
      tokens: a.tokens.totalInputTokens + a.tokens.totalOutputTokens,
    }))
    .reverse(); // oldest first
}

// ─── Weekly Aggregates (pure) ───────────────────────────────────

/**
 * Compute the ISO week start (Monday) for a given date string.
 * Returns YYYY-MM-DD of the Monday that starts the ISO week.
 */
function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  // getDay: 0=Sun, 1=Mon, ..., 6=Sat
  // ISO week starts on Monday; shift Sunday (0) to 7
  const dayOfWeek = d.getDay() || 7;
  d.setDate(d.getDate() - (dayOfWeek - 1));
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Group sessions by ISO week and compute aggregates.
 *
 * @param sessions  Array of SessionSummary (any order).
 * @returns         Array of WeeklyAggregate, ordered by weekStart ascending.
 *
 * WORKED EXAMPLE:
 * ─────────────────
 * Input: 3 sessions
 *   { date: "2026-03-23", model: "sonnet", co2_g: 1.0, energy_wh: 3.0 }
 *   { date: "2026-03-24", model: "sonnet", co2_g: 2.0, energy_wh: 5.0 }
 *   { date: "2026-03-25", model: "haiku",  co2_g: 0.5, energy_wh: 1.0 }
 *
 * 2026-03-23 is a Monday → weekStart = "2026-03-23"
 * All 3 sessions fall in the same week.
 *
 * Output: [{
 *   weekStart: "2026-03-23",
 *   totalCO2: 3.5,
 *   totalEnergy: 9.0,
 *   avgCO2PerSession: 3.5 / 3 = 1.1667,
 *   sessionCount: 3,
 *   primaryModel: "sonnet" (2 occurrences vs 1 for haiku)
 * }]
 */
export function getWeeklyAggregates(
  sessions: SessionSummary[],
): WeeklyAggregate[] {
  if (sessions.length === 0) return [];

  // Group by week start
  const weekMap = new Map<
    string,
    { totalCO2: number; totalEnergy: number; count: number; models: string[] }
  >();

  for (const s of sessions) {
    const ws = isoWeekStart(s.date);
    const existing = weekMap.get(ws);
    if (existing) {
      existing.totalCO2 += s.co2_g;
      existing.totalEnergy += s.energy_wh;
      existing.count += 1;
      existing.models.push(s.model);
    } else {
      weekMap.set(ws, {
        totalCO2: s.co2_g,
        totalEnergy: s.energy_wh,
        count: 1,
        models: [s.model],
      });
    }
  }

  // Convert to array and compute derived fields
  const result: WeeklyAggregate[] = [];
  for (const [weekStart, data] of weekMap) {
    result.push({
      weekStart,
      totalCO2: data.totalCO2,
      totalEnergy: data.totalEnergy,
      avgCO2PerSession: data.count > 0 ? data.totalCO2 / data.count : 0,
      sessionCount: data.count,
      primaryModel: mostFrequent(data.models),
    });
  }

  // Sort ascending by week
  result.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return result;
}

// ─── Cumulative Stats (pure) ────────────────────────────────────

/**
 * Calculate lifetime cumulative statistics across all sessions.
 *
 * "totalSaved" represents the estimated net CO2 avoided by using AI
 * instead of manual developer work (human baseline - AI actual).
 * Negative values mean AI used more carbon than the estimated alternative.
 *
 * @param sessions  Array of SessionSummary.
 * @returns         CumulativeStats with totals and trees equivalent.
 *
 * WORKED EXAMPLE:
 * ─────────────────
 * Input: 2 sessions
 *   { co2_g: 1.5, energy_wh: 4.0, water_ml: 3.0, tokens: 11000 }
 *   { co2_g: 2.0, energy_wh: 6.0, water_ml: 5.0, tokens: 15000 }
 *
 * totalCO2 = 1.5 + 2.0 = 3.5 g
 * totalWater = 3.0 + 5.0 = 8.0 mL
 * sessionsCount = 2
 *
 * For totalSaved:
 *   Session 1: 11000 tokens → ~5500 output (estimate half) → 5.5 hrs → human CO2 = 5.5 * 1850 = 10175 g
 *   Session 2: 15000 tokens → ~7500 output (estimate half) → 7.5 hrs → human CO2 = 7.5 * 1850 = 13875 g
 *   Total human CO2 = 24050 g, saved = 24050 - 3.5 = 24046.5 g
 *   Trees = 24046.5 / 22000 = ~1.09 trees
 *
 * (Note: tokens field is input+output combined; we estimate output as half)
 */
export function getCumulativeStats(
  sessions: SessionSummary[],
): CumulativeStats {
  let totalCO2 = 0;
  let totalWater = 0;
  let totalHumanCO2 = 0;

  for (const s of sessions) {
    totalCO2 += s.co2_g;
    totalWater += s.water_ml;

    // Estimate output tokens as roughly half of total tokens
    // (input typically >= output in coding sessions, but we use
    // a conservative 50/50 split for the savings estimate)
    const estimatedOutputTokens = s.tokens / 2;
    const estimatedHours = Math.min(
      4.0,
      Math.max(0.1, (estimatedOutputTokens / 1000) * HOURS_PER_1000_OUTPUT_TOKENS),
    );
    totalHumanCO2 += estimatedHours * HUMAN_CO2_PER_HOUR_G;
  }

  const totalSaved = totalHumanCO2 - totalCO2;
  const treesEquivalent =
    totalSaved > 0 ? totalSaved / CO2_PER_TREE_PER_YEAR_G : 0;

  return {
    totalCO2,
    totalSaved,
    totalWater,
    sessionsCount: sessions.length,
    treesEquivalent,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Return the most frequently occurring string in an array.
 * Ties broken by first occurrence.
 */
function mostFrequent(items: string[]): string {
  if (items.length === 0) return "unknown";

  const counts = new Map<string, number>();
  let maxCount = 0;
  let winner = items[0]!;

  for (const item of items) {
    const count = (counts.get(item) ?? 0) + 1;
    counts.set(item, count);
    if (count > maxCount) {
      maxCount = count;
      winner = item;
    }
  }

  return winner;
}
