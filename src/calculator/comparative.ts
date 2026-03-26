/**
 * Comparative context engine — makes raw numbers meaningful.
 *
 * Three outputs per PROMPT.md §3:
 *   1. Human-hours saved estimation (net impact framing)
 *   2. Equivalency engine (tangible comparisons)
 *   3. Decision lever recommendations (actionable insights)
 *
 * Design principle: "Actionable over alarming." Every report includes
 * at least one thing the user can actually do differently.
 *
 * References:
 *   - EPA (2024), Greenhouse Gas Equivalencies Calculator
 *   - Obringer et al. (2021), per-activity comparisons
 */

import type { EnergyBreakdown, CarbonResult, ModelFamily } from "../types.ts";

// ─── Human-Hours Saved ───────────────────────────────────────────

export interface HumanHoursSaved {
  estimatedHours: number;
  humanCO2_g: number; // CO2 that human work would have produced
  netImpact_g: number; // AI CO2 - human CO2 (negative = AI saved carbon)
  /** Net impact range: low = remote worker baseline, high = car commuter baseline */
  netImpactLow_g: number; // AI CO2 - car commuter CO2 (most favorable for AI)
  netImpactHigh_g: number; // AI CO2 - remote worker CO2 (least favorable for AI)
  commuteMode: string;
  confidence: "low";
}

/**
 * Human work carbon footprint per hour (in-office).
 * Source: EPA (2024), IEA (2023), aggregated estimates.
 *
 * Components:
 *   - Car commute: avg 8.89 kgCO2 per round-trip / 8 hr = ~1.1 gCO2e/min
 *   - Office HVAC/lighting: ~0.5 kgCO2 per person-hour
 *   - Office compute: ~0.05 kgCO2 per hour
 *   - Food/coffee: ~0.2 kgCO2 per hour
 */
// Source: EPA (2024), US average commute + office overhead, confidence: medium
const HUMAN_CO2_PER_HOUR: Record<string, number> = {
  car: 1850, // gCO2e/hr (commute amortized + office overhead)
  transit: 950, // gCO2e/hr (lower commute, same office)
  bike: 750, // gCO2e/hr (no commute carbon, same office)
  remote: 350, // gCO2e/hr (home office only: electricity + heating)
};

/**
 * Estimate developer-hours saved and compute net environmental impact.
 *
 * @param sessionCO2_g     Total session CO2 in gCO2e.
 * @param outputTokens     Total output tokens in session.
 * @param humanHoursConfig User-configured hours per session (default 1.0).
 * @param commuteMode      User's commute mode (affects human CO2 baseline).
 */
export function estimateHumanHoursSaved(
  sessionCO2_g: number,
  outputTokens: number,
  humanHoursConfig: number = 1.0,
  commuteMode: string = "car",
): HumanHoursSaved {
  // Heuristic: ~500 useful output tokens per coding task, ~0.5 hr per task
  // Calibrated from typical Claude Code session patterns
  // Source: Internal estimation, confidence: low
  // Capped at 4 hours per session to avoid absurd claims (Design review F2)
  // Floor proportional to output: min 0.1 hr, not fixed 1.0 hr (LCA review F3.1)
  const tasksCompleted = outputTokens / 500;
  const rawHours = Math.max(0.1, tasksCompleted * 0.5);
  const estimatedHours = Math.min(rawHours, 4.0); // cap at 4 hours

  const hourlyRate = HUMAN_CO2_PER_HOUR[commuteMode] ?? HUMAN_CO2_PER_HOUR["car"]!;
  const humanCO2_g = estimatedHours * hourlyRate;
  const netImpact_g = sessionCO2_g - humanCO2_g;

  // Uncertainty bounds: range across all commute modes
  // Low = most favorable for AI (vs car commuter, highest human baseline)
  // High = least favorable for AI (vs remote worker, lowest human baseline)
  const carCO2 = estimatedHours * HUMAN_CO2_PER_HOUR["car"]!;
  const remoteCO2 = estimatedHours * HUMAN_CO2_PER_HOUR["remote"]!;
  const netImpactLow_g = sessionCO2_g - carCO2; // most negative (best for AI)
  const netImpactHigh_g = sessionCO2_g - remoteCO2; // least negative (worst for AI)

  return {
    estimatedHours,
    humanCO2_g,
    netImpact_g,
    netImpactLow_g,
    netImpactHigh_g,
    commuteMode,
    confidence: "low" as const,
  };
}

// ─── Equivalency Engine ──────────────────────────────────────────

export interface Equivalency {
  activity: string;
  amount: number;
  unit: string;
  description: string;
}

/**
 * Generate context-appropriate equivalency comparisons.
 * Rotates through comparisons, selecting 3 that are most intuitive
 * for the given CO2 amount.
 *
 * @param co2_g  Total CO2 in gCO2e.
 * @returns      Array of 3 equivalencies, most intuitive first.
 */
export function generateEquivalencies(co2_g: number): Equivalency[] {
  const all: Equivalency[] = [
    {
      activity: "Driving",
      // Source: EPA (2024), average US car emits 400 gCO2e/mile, confidence: high
      amount: (co2_g / 400) * 1609.34, // convert miles to meters
      unit: "meters",
      description: "driven in an average US car",
    },
    {
      activity: "Netflix",
      // Source: IEA (2023), streaming ~36 gCO2e/hour, confidence: medium
      amount: (co2_g / 36) * 60,
      unit: "minutes",
      description: "of Netflix streaming",
    },
    {
      activity: "Phone charge",
      // Source: EPA (2024), full smartphone charge ~8 gCO2e, confidence: medium
      amount: (co2_g / 8) * 100,
      unit: "%",
      description: "of a smartphone charge",
    },
    {
      activity: "Coffee",
      // Source: Humbert et al. (2009), cradle-to-cup LCA of drip coffee, ~50 gCO2e/cup
      // Includes agriculture, processing, transport, and brewing. confidence: medium
      amount: co2_g / 50,
      unit: "cups",
      description: "of coffee (cradle-to-cup)",
    },
    {
      activity: "Breathing",
      // Source: EPA (2024), human respiration ~200 gCO2e/hour (metabolic), confidence: high
      amount: (co2_g / 200) * 60,
      unit: "minutes",
      description: "of human breathing",
    },
    {
      activity: "LED bulb",
      // Source: 10W LED at US avg CIF 0.39 kgCO2e/kWh = 3.9 gCO2e/hour = 0.065 gCO2e/min
      amount: (co2_g / 0.065),
      unit: "minutes",
      description: "of a 10W LED bulb",
    },
    {
      activity: "Google searches",
      // Source: Google Environmental Report (2023), ~0.3 gCO2e/search, confidence: medium
      amount: co2_g / 0.3,
      unit: "searches",
      description: "Google searches",
    },
  ];

  // Select the 3 most intuitive: prefer amounts between 0.1 and 100
  const scored = all.map((eq) => {
    const absAmount = Math.abs(eq.amount);
    // Score: closer to [1, 50] range is more intuitive
    let score = 0;
    if (absAmount >= 0.1 && absAmount <= 100) score = 10;
    else if (absAmount >= 0.01 && absAmount <= 1000) score = 5;
    else score = 1;
    return { eq, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.eq);
}

// ─── Decision Levers ─────────────────────────────────────────────

export interface DecisionLever {
  recommendation: string;
  savingsPercent: number;
  category: "model" | "context" | "timing" | "caching";
}

/**
 * Generate actionable decision lever recommendations.
 *
 * @param currentFamily  Current model family being used.
 * @param inputTokens    Total input tokens this session.
 * @param cacheReadTokens Total cache read tokens this session.
 * @param energy         Energy breakdown for context analysis.
 * @param carbon         Carbon result for CIF analysis.
 */
export function generateDecisionLevers(
  currentFamily: ModelFamily,
  inputTokens: number,
  cacheReadTokens: number,
  energy: EnergyBreakdown,
  carbon: CarbonResult,
): DecisionLever[] {
  const levers: DecisionLever[] = [];

  // Model switching recommendation
  if (currentFamily === "opus") {
    levers.push({
      recommendation: "Switching to Sonnet for routine tasks would save ~75% energy",
      savingsPercent: 75,
      category: "model",
    });
  } else if (currentFamily === "sonnet") {
    levers.push({
      recommendation: "Using Haiku for simple tasks (formatting, search) would save ~60% energy",
      savingsPercent: 60,
      category: "model",
    });
  }

  // Context reduction
  if (inputTokens > 20000) {
    const reductionPercent = 20;
    const prefillFraction = energy.total_Wh > 0
      ? (energy.prefill_Wh / energy.total_Wh) * 100
      : 0;
    const savingsPercent = Math.round(prefillFraction * reductionPercent / 100);
    levers.push({
      recommendation: `Reducing input context by ${reductionPercent}% (~${Math.round(inputTokens * reductionPercent / 100 / 1000)}k tokens) would save ~${savingsPercent}% energy`,
      savingsPercent,
      category: "context",
    });
  }

  // Caching insight
  if (cacheReadTokens > 0 && inputTokens > 0) {
    const cacheFraction = (cacheReadTokens / inputTokens * 100).toFixed(0);
    const savings = energy.cacheOps_Wh < 0 ? Math.abs(energy.cacheOps_Wh) : 0;
    if (savings > 0) {
      levers.push({
        recommendation: `Cache hits on ${cacheFraction}% of input saved ${savings.toFixed(2)} Wh this session`,
        savingsPercent: energy.total_Wh > 0 ? Math.round(savings / energy.total_Wh * 100) : 0,
        category: "caching",
      });
    }
  } else if (inputTokens > 10000) {
    levers.push({
      recommendation: "Enabling prompt caching could save 20-40% of prefill energy on repeated context",
      savingsPercent: 30,
      category: "caching",
    });
  }

  // Time-of-day (grid intensity)
  if (carbon.gridCif_kgPerKWh > 0.3) {
    levers.push({
      recommendation: "Running during off-peak hours (11pm-6am local) could reduce grid intensity by ~30%",
      savingsPercent: 30,
      category: "timing",
    });
  }

  return levers;
}

// ─── Model Comparison ────────────────────────────────────────────

export interface ModelComparison {
  family: ModelFamily;
  energy_Wh: number;
  co2_gCO2e: number;
  relativeToBaseline: number; // 1.0 = baseline, 0.5 = 50% of baseline
}

/**
 * Compare energy/carbon across model families for the same token counts.
 * Used by /carbon:compare skill.
 */
export function compareModels(
  inputTokens: number,
  outputTokens: number,
  gridCif: number,
  calculateEnergyFn: (family: ModelFamily) => { total_Wh: number },
): ModelComparison[] {
  const families: ModelFamily[] = ["haiku", "sonnet", "opus"];
  const results = families.map((family) => {
    const energy = calculateEnergyFn(family);
    return {
      family,
      energy_Wh: energy.total_Wh,
      co2_gCO2e: energy.total_Wh * gridCif,
      relativeToBaseline: 0,
    };
  });

  // Normalize to Sonnet as baseline
  const sonnet = results.find((r) => r.family === "sonnet");
  const baseline = sonnet?.energy_Wh ?? 1;
  for (const r of results) {
    r.relativeToBaseline = baseline > 0 ? r.energy_Wh / baseline : 0;
  }

  return results;
}
