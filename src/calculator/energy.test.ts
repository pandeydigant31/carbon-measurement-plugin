/**
 * Energy calculator tests with worked examples.
 *
 * WORKED EXAMPLE (Sonnet, typical request):
 * ─────────────────────────────────────────
 * Input:  10,000 tokens, Output: 500 tokens
 * Cache:  0 creation, 0 read
 *
 * Sonnet hardware: 2x H100, totalGpuPower = 1.4 kW, nonGpu = 0.45 kW, hbm = 0.04 kW
 * Sonnet benchmarks: prefill = 8000 tok/s, TPS = 90, KV = 1024 bytes/tok
 * Utilization: gpu_mean = 0.50, gpu_max = 0.70, nonGpu = 0.80
 * PUE: 1.13
 *
 * Step 1: Timing
 *   t_prefill = 10000 / 8000 = 1.25 s
 *   t_decode  = 500 / 90 = 5.556 s
 *
 * Step 2: Power (in W)
 *   P_prefill = 1400 * 0.70 + 450 * 0.80 = 980 + 360 = 1340 W
 *   P_decode  = 1400 * 0.50 + 450 * 0.80 = 700 + 360 = 1060 W
 *
 * Step 3: Energy (in J, then Wh)
 *   E_prefill = 1.25 * 1340 * 1.13 = 1892.25 J = 0.5256 Wh
 *   E_decode  = 5.556 * 1060 * 1.13 = 6653.16 J = 1.8481 Wh
 *
 * Step 4: KV-cache energy
 *   mem_kv = (10000 + 500) * 1024 = 10,752,000 bytes
 *   totalHbm = 160 GB = 160e9 bytes
 *   P_kv = (10752000 / 160e9) * 40 = 0.002688 W
 *   E_kv = (1.25 + 5.556) * 0.002688 * 1.13 = 0.02067 J = 0.0000057 Wh ≈ 0
 *
 * Step 5: Cache ops = 0 (no cache tokens)
 *
 * Total ≈ 0.526 + 1.848 + ~0 + 0 = ~2.374 Wh
 */

import { describe, test, expect } from "bun:test";
import { calculateEnergy } from "./energy.ts";
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

const PUE = 1.13;

describe("Energy Calculator", () => {
  test("worked example: 10k input, 500 output, Sonnet", () => {
    const usage: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 10000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const result = calculateEnergy(usage, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);

    // Prefill: 1.25s * 1340W * 1.13 = 1892.25 J = 0.5256 Wh
    expect(result.prefill_Wh).toBeCloseTo(0.5256, 2);

    // Decode: 5.556s * 1060W * 1.13 = 6653.16 J = 1.8481 Wh
    expect(result.decode_Wh).toBeCloseTo(1.848, 1);

    // KV-cache is very small
    expect(result.kvCache_Wh).toBeGreaterThan(0);
    expect(result.kvCache_Wh).toBeLessThan(0.001);

    // No cache ops
    expect(result.cacheOps_Wh).toBe(0);

    // Total should be sum of components
    expect(result.total_Wh).toBeCloseTo(
      result.prefill_Wh + result.decode_Wh + result.kvCache_Wh,
      4
    );

    // Order of magnitude: ~2.4 Wh for a medium request on Sonnet
    expect(result.total_Wh).toBeGreaterThan(1);
    expect(result.total_Wh).toBeLessThan(5);
  });

  test("zero tokens produces zero energy", () => {
    const usage: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const result = calculateEnergy(usage, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);
    expect(result.total_Wh).toBe(0);
  });

  test("cache reads reduce total energy", () => {
    // Request with NO cache
    const noCache: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 10000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    // Same request but 5000 tokens came from cache (avoiding prefill)
    const withCache: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 10000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 5000, // 5000 tokens read from cache
    };

    const noCacheResult = calculateEnergy(noCache, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);
    const cacheResult = calculateEnergy(withCache, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);

    // Cache reads should make cacheOps negative (energy saved)
    expect(cacheResult.cacheOps_Wh).toBeLessThan(0);

    // Total with cache should be less
    expect(cacheResult.total_Wh).toBeLessThan(noCacheResult.total_Wh);
  });

  test("more input tokens means more energy (input-token-awareness)", () => {
    const small: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const large: TokenUsage = {
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 50000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const smallResult = calculateEnergy(small, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);
    const largeResult = calculateEnergy(large, SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);

    // 50x more input tokens should produce meaningfully more energy
    expect(largeResult.prefill_Wh).toBeGreaterThan(smallResult.prefill_Wh * 10);
    expect(largeResult.total_Wh).toBeGreaterThan(smallResult.total_Wh);
  });

  test("energy scales linearly with output tokens", () => {
    const makeUsage = (outputTokens: number): TokenUsage => ({
      model: "claude-sonnet-4-20250514",
      modelFamily: "sonnet",
      inputTokens: 1000,
      outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });

    const r100 = calculateEnergy(makeUsage(100), SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);
    const r1000 = calculateEnergy(makeUsage(1000), SONNET_PROFILE, SONNET_BENCHMARKS, UTIL, PUE);

    // Decode energy should scale ~10x
    expect(r1000.decode_Wh / r100.decode_Wh).toBeCloseTo(10, 0);
  });
});
