/**
 * Comparative context engine tests.
 *
 * WORKED EXAMPLE (net impact):
 * ────────────────────────────
 * Session CO2: 1.06 gCO2e (from Phase 1 sanity test)
 * Output tokens: 500
 * Tasks completed: 500/500 = 1 task
 * Estimated hours: max(1.0, 1 * 0.5) = 1.0 hr
 * Human CO2 (car commute): 1.0 * 1850 = 1850 gCO2e
 * Net impact: 1.06 - 1850 = -1848.94 gCO2e (AI SAVED ~1.85 kgCO2e)
 *
 * This is the key insight: AI inference is orders of magnitude
 * cheaper in carbon than the human work it replaces.
 */

import { describe, test, expect } from "bun:test";
import {
  estimateHumanHoursSaved,
  generateEquivalencies,
  generateDecisionLevers,
  compareModels,
} from "./comparative.ts";
import type { EnergyBreakdown, CarbonResult, ModelFamily } from "../types.ts";

describe("Human Hours Saved", () => {
  test("worked example: 500 output tokens, car commute", () => {
    const result = estimateHumanHoursSaved(1.06, 500, 1.0, "car");

    // 500/500 = 1 task, 1 * 0.5 = 0.5 hours (no floor bias)
    expect(result.estimatedHours).toBeCloseTo(0.5, 1);
    // Human CO2: 0.5 hr * 1850 gCO2e/hr = 925
    expect(result.humanCO2_g).toBe(925);
    // Net impact: 1.06 - 925 = -923.94 (AI saves carbon)
    expect(result.netImpact_g).toBeLessThan(0);
    expect(result.netImpact_g).toBeCloseTo(1.06 - 925, 0);
    // Uncertainty bounds span car → remote
    expect(result.netImpactLow_g).toBeLessThan(result.netImpactHigh_g);
    expect(result.confidence).toBe("low");
  });

  test("remote work has lower human CO2 baseline", () => {
    const car = estimateHumanHoursSaved(1.0, 500, 1.0, "car");
    const remote = estimateHumanHoursSaved(1.0, 500, 1.0, "remote");

    expect(remote.humanCO2_g).toBeLessThan(car.humanCO2_g);
    // But both still show AI as net-positive (saving carbon)
    expect(car.netImpact_g).toBeLessThan(0);
    expect(remote.netImpact_g).toBeLessThan(0);
  });

  test("more output tokens estimates more hours saved", () => {
    const small = estimateHumanHoursSaved(1.0, 200, 1.0, "car");
    const large = estimateHumanHoursSaved(10.0, 5000, 1.0, "car");

    expect(large.estimatedHours).toBeGreaterThan(small.estimatedHours);
  });
});

describe("Equivalency Engine", () => {
  test("returns exactly 3 equivalencies", () => {
    const result = generateEquivalencies(1.0);
    expect(result).toHaveLength(3);
  });

  test("all equivalencies have positive amounts for positive CO2", () => {
    const result = generateEquivalencies(1.0);
    for (const eq of result) {
      expect(eq.amount).toBeGreaterThan(0);
      expect(eq.activity).toBeTruthy();
      expect(eq.unit).toBeTruthy();
      expect(eq.description).toBeTruthy();
    }
  });

  test("equivalencies scale with CO2 amount", () => {
    const small = generateEquivalencies(0.5);
    const large = generateEquivalencies(5.0);

    // Same activities should have ~10x larger amounts
    const smallFirst = small[0]!;
    const largeFirst = large.find((e) => e.activity === smallFirst.activity);
    if (largeFirst) {
      expect(largeFirst.amount / smallFirst.amount).toBeCloseTo(10, 0);
    }
  });

  test("zero CO2 produces zero amounts", () => {
    const result = generateEquivalencies(0);
    for (const eq of result) {
      expect(eq.amount).toBe(0);
    }
  });
});

describe("Decision Levers", () => {
  const energy: EnergyBreakdown = {
    prefill_Wh: 0.53, decode_Wh: 1.85, kvCache_Wh: 0.001,
    cacheOps_Wh: 0, network_Wh: 0, embodied_Wh: 0, total_Wh: 2.381,
  };
  const carbon: CarbonResult = {
    operational_gCO2e: 0.905, embodied_gCO2e: 0.157, network_gCO2e: 0.001,
    total_gCO2e: 1.063, gridCif_kgPerKWh: 0.380,
    gridCifSource: "regional", regionInferred: "us-east-1", pueUsed: 1.13,
  };

  test("Opus user gets model switching recommendation", () => {
    const levers = generateDecisionLevers("opus", 10000, 0, energy, carbon);
    const modelLever = levers.find((l) => l.category === "model");
    expect(modelLever).toBeDefined();
    expect(modelLever!.recommendation).toContain("Sonnet");
  });

  test("Sonnet user gets Haiku recommendation", () => {
    const levers = generateDecisionLevers("sonnet", 10000, 0, energy, carbon);
    const modelLever = levers.find((l) => l.category === "model");
    expect(modelLever).toBeDefined();
    expect(modelLever!.recommendation).toContain("Haiku");
  });

  test("large context gets reduction recommendation", () => {
    const levers = generateDecisionLevers("sonnet", 50000, 0, energy, carbon);
    const contextLever = levers.find((l) => l.category === "context");
    expect(contextLever).toBeDefined();
    expect(contextLever!.recommendation).toContain("Reducing input context");
  });

  test("cache reads generate caching insight", () => {
    const cachedEnergy = { ...energy, cacheOps_Wh: -0.2 };
    const levers = generateDecisionLevers("sonnet", 10000, 5000, cachedEnergy, carbon);
    const cacheLever = levers.find((l) => l.category === "caching");
    expect(cacheLever).toBeDefined();
    expect(cacheLever!.recommendation).toContain("Cache hits");
  });

  test("high CIF region gets timing recommendation", () => {
    const levers = generateDecisionLevers("sonnet", 10000, 0, energy, carbon);
    const timingLever = levers.find((l) => l.category === "timing");
    expect(timingLever).toBeDefined();
    expect(timingLever!.recommendation).toContain("off-peak");
  });

  test("always returns at least one lever", () => {
    const levers = generateDecisionLevers("sonnet", 10000, 0, energy, carbon);
    expect(levers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Model Comparison", () => {
  test("Haiku uses less energy than Sonnet, which uses less than Opus", () => {
    const results = compareModels(10000, 500, 0.380, (family) => {
      // Simplified energy calc for testing
      const gpuCounts = { haiku: 1, sonnet: 2, opus: 8 };
      return { total_Wh: gpuCounts[family] * 1.2 };
    });

    const haiku = results.find((r) => r.family === "haiku")!;
    const sonnet = results.find((r) => r.family === "sonnet")!;
    const opus = results.find((r) => r.family === "opus")!;

    expect(haiku.energy_Wh).toBeLessThan(sonnet.energy_Wh);
    expect(sonnet.energy_Wh).toBeLessThan(opus.energy_Wh);
    expect(sonnet.relativeToBaseline).toBe(1.0); // Sonnet is baseline
    expect(haiku.relativeToBaseline).toBeLessThan(1.0);
    expect(opus.relativeToBaseline).toBeGreaterThan(1.0);
  });
});
