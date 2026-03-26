/**
 * Uncertainty engine tests.
 *
 * WORKED EXAMPLE (Monte Carlo properties):
 * ─────────────────────────────────────────
 * For a typical Sonnet request (10k input, 500 output):
 * - Point estimate CO2: ~1 gCO2e (from Phase 1 tests)
 * - 90% CI should be wider: expect roughly [0.3, 3.0] gCO2e
 * - Key driver should be GPU utilization or grid CIF (largest uncertainty ranges)
 *
 * Statistical properties of 1000 LHS draws:
 * - 5th percentile < median < 95th percentile (always)
 * - Spread should be non-trivial (high/low ratio > 2x)
 * - With LHS, distribution should be more uniform than pure random
 *
 * Performance:
 * - 1000 draws must complete in < 50ms (stop hook budget)
 */

import { describe, test, expect } from "bun:test";
import { runUncertainty } from "./uncertainty.ts";
import type { TokenUsage, HardwareProfile, ModelBenchmarks, UtilizationBounds } from "../types.ts";

const SONNET_PROFILE: HardwareProfile = {
  name: "test-sonnet",
  modelFamily: "sonnet",
  numGpus: 2,
  gpuModel: "H100",
  gpuTdp_kW: 0.700,
  totalGpuPower_kW: 1.400,
  nonGpuPower_kW: 0.450,
  hbmPerGpu_GB: 80,
  totalHbm_GB: 160,
  hbmPower_kW: 0.040,
  embodiedCO2_kgPerGpu: 150,
  embodiedCO2_server_kg: 600,
  usefulLifeYears: 4,
};

const SONNET_BENCHMARKS: ModelBenchmarks = {
  modelFamily: "sonnet",
  tps: 90,
  prefillTokensPerSecond: 8000,
  ttftBase_s: 0.5,
  kvCacheBytesPerToken: 1024,
  benchmarksUpdated: "2026-03-25",
  source: "test",
};

const UTIL: UtilizationBounds = {
  gpuUtilizationMin: 0.30,
  gpuUtilizationMax: 0.70,
  gpuUtilizationMean: 0.50,
  nonGpuUtilization: 0.80,
  source: "test",
  confidence: "medium",
};

const USAGE: TokenUsage = {
  model: "claude-sonnet-4-20250514",
  modelFamily: "sonnet",
  inputTokens: 10000,
  outputTokens: 500,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

describe("Uncertainty Engine", () => {
  test("90% CI bounds bracket the median", () => {
    const result = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380);

    expect(result.energyLow_Wh).toBeLessThan(result.energy_Wh);
    expect(result.energyHigh_Wh).toBeGreaterThan(result.energy_Wh);
    expect(result.co2Low_gCO2e).toBeLessThan(result.co2_gCO2e);
    expect(result.co2High_gCO2e).toBeGreaterThan(result.co2_gCO2e);
    expect(result.waterLow_mL).toBeLessThan(result.water_mL);
    expect(result.waterHigh_mL).toBeGreaterThan(result.water_mL);
  });

  test("spread is non-trivial (high/low ratio > 2x)", () => {
    const result = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380);

    const co2Ratio = result.co2High_gCO2e / result.co2Low_gCO2e;
    expect(co2Ratio).toBeGreaterThan(2);

    const energyRatio = result.energyHigh_Wh / result.energyLow_Wh;
    expect(energyRatio).toBeGreaterThan(1.5);
  });

  test("order of magnitude sanity: Sonnet 10k/500 ~ 0.3-5 gCO2e", () => {
    const result = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380);

    // Median should be roughly 0.5-3 gCO2e
    expect(result.co2_gCO2e).toBeGreaterThan(0.3);
    expect(result.co2_gCO2e).toBeLessThan(5);

    // 5th percentile should still be positive
    expect(result.co2Low_gCO2e).toBeGreaterThan(0);
  });

  test("key driver is identified with variance fraction", () => {
    const result = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380);

    expect(result.keyDriver).toBeTruthy();
    expect(result.keyDriverVarianceFraction).toBeGreaterThan(0);
    expect(result.keyDriverVarianceFraction).toBeLessThanOrEqual(1);
  });

  test("performance: 1000 draws < 50ms", () => {
    const start = performance.now();
    runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380, 1000);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  test("zero tokens produces zero or near-zero results", () => {
    const zeroUsage: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const result = runUncertainty(zeroUsage, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380, 100);
    expect(result.energy_Wh).toBe(0);
    expect(result.co2_gCO2e).toBe(0);
  });

  test("higher CIF region produces wider CO2 spread", () => {
    const lowCif = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.100); // Oregon
    const highCif = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.460); // Japan

    // Higher CIF means more CO2 → wider absolute spread
    const lowSpread = lowCif.co2High_gCO2e - lowCif.co2Low_gCO2e;
    const highSpread = highCif.co2High_gCO2e - highCif.co2Low_gCO2e;
    expect(highSpread).toBeGreaterThan(lowSpread);
  });

  test("fewer draws (100) still produces valid bounds", () => {
    const result = runUncertainty(USAGE, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, 1.13, 0.380, 100);

    expect(result.energyLow_Wh).toBeLessThan(result.energy_Wh);
    expect(result.energyHigh_Wh).toBeGreaterThan(result.energy_Wh);
  });
});
