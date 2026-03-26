/**
 * Embodied carbon calculator tests with worked examples.
 *
 * WORKED EXAMPLE (Sonnet, 6.8s inference):
 * ────────────────────────────────────────
 * Profile: 2x H100, embodied=150 kgCO2e/GPU, server=600 kgCO2e, life=4 years
 * Utilization: 0.50
 * Inference time: 6.8 seconds = 0.001889 hours
 *
 * GPU:
 *   amortized = 150 / (4 * 8766) = 0.004279 kgCO2e/hr per GPU
 *   per_query = 0.004279 * 2 GPUs * 0.001889 hr / 0.50 = 0.00003230 kgCO2e = 0.0323 gCO2e
 *
 * Server:
 *   amortized = 600 / (4 * 8766) = 0.01711 kgCO2e/hr
 *   per_query = 0.01711 * 0.001889 / 0.50 = 0.00006462 kgCO2e = 0.0646 gCO2e
 *
 * Datacenter:
 *   serverPower = 1.4 + 0.45 = 1.85 kW
 *   dcEmbodied = 1.85 * 1500 = 2775 kgCO2e
 *   amortized = 2775 / (20 * 8766) = 0.01583 kgCO2e/hr
 *   per_query = 0.01583 * 0.001889 / 0.50 = 0.00005980 kgCO2e = 0.0598 gCO2e
 *
 * Total ≈ 0.032 + 0.065 + 0.060 = ~0.157 gCO2e
 */

import { describe, test, expect } from "bun:test";
import { calculateEmbodied } from "./embodied.ts";
import type { HardwareProfile } from "../types.ts";

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

describe("Embodied Carbon Calculator", () => {
  test("worked example: 6.8s Sonnet inference at 50% utilization", () => {
    const result = calculateEmbodied(6.8, SONNET_PROFILE, 0.50);

    // GPU: ~0.032 gCO2e
    expect(result.gpu_gCO2e).toBeCloseTo(0.032, 2);

    // Server: ~0.065 gCO2e
    expect(result.server_gCO2e).toBeCloseTo(0.065, 2);

    // Datacenter: ~0.060 gCO2e
    expect(result.datacenter_gCO2e).toBeCloseTo(0.060, 2);

    // Total: ~0.16 gCO2e
    expect(result.total_gCO2e).toBeCloseTo(0.157, 1);
    expect(result.total_gCO2e).toBe(
      result.gpu_gCO2e + result.server_gCO2e + result.datacenter_gCO2e
    );
  });

  test("zero inference time produces zero embodied carbon", () => {
    const result = calculateEmbodied(0, SONNET_PROFILE, 0.50);
    expect(result.total_gCO2e).toBe(0);
  });

  test("lower utilization increases embodied allocation", () => {
    const highUtil = calculateEmbodied(6.8, SONNET_PROFILE, 0.70);
    const lowUtil = calculateEmbodied(6.8, SONNET_PROFILE, 0.30);

    // Lower utilization = more idle time allocated to this query
    expect(lowUtil.total_gCO2e).toBeGreaterThan(highUtil.total_gCO2e);
  });

  test("more GPUs means higher embodied per query", () => {
    const smallProfile = { ...SONNET_PROFILE, numGpus: 1 };
    const largeProfile = { ...SONNET_PROFILE, numGpus: 8 };

    const small = calculateEmbodied(6.8, smallProfile, 0.50);
    const large = calculateEmbodied(6.8, largeProfile, 0.50);

    expect(large.gpu_gCO2e).toBeGreaterThan(small.gpu_gCO2e * 4);
  });
});
