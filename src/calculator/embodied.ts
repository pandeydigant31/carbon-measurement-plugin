/**
 * Embodied carbon (Scope 3 upstream) calculator.
 *
 * Three components, each amortized over useful life and allocated to the
 * inference request via time-based allocation:
 *
 *   1. GPU manufacturing — per-GPU embodied CO2, amortized over useful life.
 *   2. Server manufacturing (non-GPU) — chassis, CPU, RAM, etc.
 *   3. Datacenter construction — building, cooling, electrical infrastructure.
 *
 * Allocation formula (from PROMPT.md §1.4 and §2.1):
 *   amortized_rate = embodiedCO2_kg / (usefulLife_years × 365.25 × 24)  [kgCO2e/hr]
 *   per_query = amortized_rate × numGpus × inference_time_hours / utilization
 *
 * References:
 *   - Gupta et al. (2022), "Chasing Carbon", IEEE Micro. confidence: medium
 *   - Whitehead et al. (2015), datacenter LCA studies. confidence: low
 *   - Dell PowerEdge lifecycle assessments. confidence: medium
 */

import type { HardwareProfile } from "../types.ts";

// ─── Datacenter Constants ────────────────────────────────────────────

/**
 * Embodied CO2 for datacenter construction per kW of IT capacity.
 * Source: Whitehead et al. (2015), typical range 1000-2000 kgCO2e/kW.
 * We use the midpoint: 1500 kgCO2e/kW. confidence: low
 */
const DATACENTER_EMBODIED_CO2_KG_PER_KW = 1500;

/**
 * Datacenter useful life in years.
 * Source: Whitehead et al. (2015), typical range 15-25 years.
 * We use 20 years as the midpoint. confidence: medium
 */
const DATACENTER_USEFUL_LIFE_YEARS = 20;

// ─── Helpers ────────────────────────────────────────────────────────

const HOURS_PER_YEAR = 365.25 * 24; // 8766 hours/year

/**
 * Convert seconds to hours.
 */
function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

// ─── Main Calculator ────────────────────────────────────────────────

export interface EmbodiedResult {
  gpu_gCO2e: number;
  server_gCO2e: number;
  datacenter_gCO2e: number;
  total_gCO2e: number;
  /** Energy-equivalent in Wh (for combining with EnergyBreakdown.embodied_Wh). */
  energy_Wh: number;
}

/**
 * Calculate embodied (Scope 3 upstream) carbon for a single inference request.
 *
 * @param inferenceTime_s  Total inference time in seconds (t_prefill + t_decode).
 * @param profile          Hardware profile with per-GPU and server embodied CO2.
 * @param utilization      Average GPU utilization fraction (0-1). Used for allocation
 *                         — lower utilization means more idle time allocated to this query.
 * @returns                Embodied carbon breakdown in gCO2e, plus energy_Wh equivalent.
 */
export function calculateEmbodied(
  inferenceTime_s: number,
  profile: HardwareProfile,
  utilization: number,
): EmbodiedResult {
  const inferenceTime_h = secondsToHours(inferenceTime_s);

  // Guard against division by zero — clamp utilization to a minimum of 1%.
  const safeUtil = Math.max(utilization, 0.01);

  // ── GPU Manufacturing ───────────────────────────────────────────
  // amortized_rate = kgCO2e_per_gpu / (useful_life_years × 8766 hr/yr)
  // per_query = amortized_rate × numGpus × inference_time_hr / utilization
  const gpuAmortized_kgPerHr =
    profile.embodiedCO2_kgPerGpu /
    (profile.usefulLifeYears * HOURS_PER_YEAR);

  const gpu_kgCO2e =
    gpuAmortized_kgPerHr * profile.numGpus * inferenceTime_h / safeUtil;

  const gpu_gCO2e = gpu_kgCO2e * 1000;

  // ── Server Manufacturing (non-GPU) ─────────────────────────────
  // Same amortization logic, using server embodied CO2 and server useful life.
  // Server life assumed equal to profile.usefulLifeYears (typically 4-6yr).
  const serverAmortized_kgPerHr =
    profile.embodiedCO2_server_kg /
    (profile.usefulLifeYears * HOURS_PER_YEAR);

  const server_kgCO2e =
    serverAmortized_kgPerHr * inferenceTime_h / safeUtil;

  const server_gCO2e = server_kgCO2e * 1000;

  // ── Datacenter Construction ────────────────────────────────────
  // Total IT power draw of the server (GPU + non-GPU) in kW.
  const serverPower_kW = profile.totalGpuPower_kW + profile.nonGpuPower_kW;

  // Total datacenter embodied CO2 attributable to this server's capacity.
  const dcEmbodied_kg = serverPower_kW * DATACENTER_EMBODIED_CO2_KG_PER_KW;

  const dcAmortized_kgPerHr =
    dcEmbodied_kg / (DATACENTER_USEFUL_LIFE_YEARS * HOURS_PER_YEAR);

  const dc_kgCO2e = dcAmortized_kgPerHr * inferenceTime_h / safeUtil;

  const datacenter_gCO2e = dc_kgCO2e * 1000;

  // ── Totals ─────────────────────────────────────────────────────
  const total_gCO2e = gpu_gCO2e + server_gCO2e + datacenter_gCO2e;

  // Energy-equivalent: a synthetic Wh value so the caller can populate
  // EnergyBreakdown.embodied_Wh. This is NOT real electrical energy —
  // it represents the embodied carbon translated to an energy-equivalent
  // assuming a reference CIF. We store 0 here and let the caller decide
  // how to use it; the gCO2e values are the authoritative outputs.
  // For simplicity, we set energy_Wh = 0 — embodied carbon is reported
  // directly in gCO2e, not via the energy pathway.
  const energy_Wh = 0;

  return {
    gpu_gCO2e,
    server_gCO2e,
    datacenter_gCO2e,
    total_gCO2e,
    energy_Wh,
  };
}
