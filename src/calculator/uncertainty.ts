/**
 * Monte Carlo uncertainty engine using Latin Hypercube Sampling.
 *
 * Propagates parameter uncertainty through the energy/carbon model
 * to produce 90% confidence intervals and identify the key variance driver.
 *
 * Performance target: < 50ms for 1000 draws (must fit in stop hook budget).
 *
 * Parameter distributions (from PROMPT.md §5.1, reconciled with code):
 *   GPU power draw fraction:   Uniform [0.60, 1.00] of TDP
 *   GPU utilization:           Uniform [min, max] from UtilizationBounds
 *   PUE:                       Normal(μ, σ=0.05), clamped to [1.0, 2.0]
 *   Grid CIF:                  Normal(regional, σ=20%), clamped > 0
 *   Embodied CO2 per GPU:      Lognormal(ln(value), σ=0.3)
 *   WUE:                       Uniform [0.5, 5.0] (Li et al. 2023)
 *   Prefill speed:             Normal(benchmark, σ=15%), clamped > 0
 *   Decode speed (TPS):        Normal(benchmark, σ=15%), clamped > 0
 *
 * Independence assumption: All parameters are sampled independently.
 * Known correlations NOT modeled (documented per ISO 14044 §4.5.3.3):
 *   - GPU power fraction ↔ GPU utilization (positively correlated in practice)
 *   - PUE ↔ WUE (both higher in hot climates)
 *   - Grid CIF ↔ indirect water intensity (coal grids have both high)
 * These omissions may slightly overestimate total uncertainty but do not
 * bias the point estimate. Sobol indices would capture interactions but
 * exceed the 50ms budget. OAT sensitivity is used as a first-order screen.
 *
 * References:
 *   - McKay et al. (1979), LHS methodology, Technometrics.
 *   - ISO 14044 Section 4.5.3.3, Uncertainty analysis requirements.
 *   - ISO 14044 Section 4.5.3.4, Sensitivity analysis requirements.
 */

import type {
  TokenUsage,
  HardwareProfile,
  ModelBenchmarks,
  UtilizationBounds,
} from "../types.ts";

// ─── Types ───────────────────────────────────────────────────────

export interface UncertaintyResult {
  energy_Wh: number;
  co2_gCO2e: number;
  water_mL: number;
  energyLow_Wh: number;
  energyHigh_Wh: number;
  co2Low_gCO2e: number;
  co2High_gCO2e: number;
  waterLow_mL: number;
  waterHigh_mL: number;
  keyDriver: string;
  keyDriverVarianceFraction: number;
}

interface SampledParams {
  gpuPowerFraction: number;
  gpuUtilization: number;
  pue: number;
  gridCif: number;
  embodiedCO2_kg: number;
  wue: number;
  prefillSpeed: number;  // tokens/s
  decodeSpeed: number;   // tokens/s (TPS)
}

// ─── Latin Hypercube Sampling ────────────────────────────────────

function latinHypercubeSamples(n: number): number[] {
  const samples: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = (i + Math.random()) / n;
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = samples[i]!;
    samples[i] = samples[j]!;
    samples[j] = tmp;
  }
  return samples;
}

function uniformQuantile(u: number, a: number, b: number): number {
  return a + u * (b - a);
}

function normalQuantile(u: number, mu: number, sigma: number): number {
  const p = Math.max(0.0001, Math.min(0.9999, u));
  const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  let z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  if (p < 0.5) z = -z;
  return mu + sigma * z;
}

function lognormalQuantile(u: number, muLn: number, sigmaLn: number): number {
  const z = normalQuantile(u, 0, 1);
  return Math.exp(muLn + sigmaLn * z);
}

// ─── Parameter Sampling ──────────────────────────────────────────

const HOURS_PER_YEAR = 365.25 * 24;
const DC_EMBODIED_KG_PER_KW = 1500;
const DC_LIFE_YEARS = 20;

function sampleParams(
  n: number,
  utilization: UtilizationBounds,
  pue: number,
  gridCif: number,
  embodiedCO2_kg: number,
  benchmarks: ModelBenchmarks,
): SampledParams[] {
  const u0 = latinHypercubeSamples(n);
  const u1 = latinHypercubeSamples(n);
  const u2 = latinHypercubeSamples(n);
  const u3 = latinHypercubeSamples(n);
  const u4 = latinHypercubeSamples(n);
  const u5 = latinHypercubeSamples(n);
  const u6 = latinHypercubeSamples(n);
  const u7 = latinHypercubeSamples(n);

  const params: SampledParams[] = new Array(n);
  for (let i = 0; i < n; i++) {
    params[i] = {
      gpuPowerFraction: uniformQuantile(u0[i]!, 0.60, 1.00),
      gpuUtilization: uniformQuantile(u1[i]!, utilization.gpuUtilizationMin, utilization.gpuUtilizationMax),
      pue: Math.max(1.0, Math.min(2.0, normalQuantile(u2[i]!, pue, 0.05))),
      gridCif: Math.max(0.001, normalQuantile(u3[i]!, gridCif, gridCif * 0.20)),
      embodiedCO2_kg: lognormalQuantile(u4[i]!, Math.log(embodiedCO2_kg), 0.3),
      // Source: Li et al. (2023), WUE range across US datacenters [0.5, 5.0] L/kWh
      wue: uniformQuantile(u5[i]!, 0.5, 5.0),
      // Source: Benchmark uncertainty ~15% σ, Normal distribution, clamped > 10% of nominal
      prefillSpeed: Math.max(benchmarks.prefillTokensPerSecond * 0.1,
        normalQuantile(u6[i]!, benchmarks.prefillTokensPerSecond, benchmarks.prefillTokensPerSecond * 0.15)),
      decodeSpeed: Math.max(benchmarks.tps * 0.1,
        normalQuantile(u7[i]!, benchmarks.tps, benchmarks.tps * 0.15)),
    };
  }
  return params;
}

// ─── Single-draw evaluation ──────────────────────────────────────
// Uses the same formulas as the main calculators to avoid drift.

function evaluateDraw(
  usage: TokenUsage,
  profile: HardwareProfile,
  p: SampledParams,
): { energy_Wh: number; co2_gCO2e: number; water_mL: number } {
  // Timing — uses sampled prefill/decode speeds
  const t_prefill = p.prefillSpeed > 0 ? usage.inputTokens / p.prefillSpeed : 0;
  const t_decode = p.decodeSpeed > 0 ? usage.outputTokens / p.decodeSpeed : 0;

  // Power (W), scaled by sampled GPU power fraction
  const gpuPower_W = profile.totalGpuPower_kW * 1000 * p.gpuPowerFraction;
  const nonGpuPower_W = profile.nonGpuPower_kW * 1000;
  const hbmPower_W = profile.hbmPower_kW * 1000;

  // Prefill uses higher utilization (compute-bound) — matches energy.ts logic
  const prefillUtil = Math.min(p.gpuUtilization * 1.4, 1.0);
  const P_prefill = gpuPower_W * prefillUtil + nonGpuPower_W * 0.8;
  const P_decode = gpuPower_W * p.gpuUtilization + nonGpuPower_W * 0.8;

  const E_prefill_J = t_prefill * P_prefill * p.pue;
  const E_decode_J = t_decode * P_decode * p.pue;

  // KV-cache
  const contextLen = usage.inputTokens + usage.outputTokens;
  const totalHbm_bytes = profile.totalHbm_GB * 1e9;
  const P_kv = totalHbm_bytes > 0
    ? (contextLen * 1024 / totalHbm_bytes) * hbmPower_W : 0;
  const E_kv_J = (t_prefill + t_decode) * P_kv * p.pue;

  // Cache ops
  const prefillPerToken = usage.inputTokens > 0 ? E_prefill_J / usage.inputTokens : 0;
  const E_cache_J = usage.cacheCreationTokens * prefillPerToken
    - usage.cacheReadTokens * prefillPerToken;

  // Network
  const data_GB = (usage.inputTokens + usage.outputTokens) * 4 / 1e9;
  const E_network_J = data_GB * 0.06 * 3600; // 0.06 kWh/GB → J (1 kWh = 3600 kJ = 3.6e6 J... wait)
  // 0.06 kWh/GB * 1000 Wh/kWh * 3600 J/Wh... no. Just: 0.06 kWh/GB * 3.6e6 J/kWh
  // Actually simplify: E_network_Wh = data_GB * 0.06 * 1000, then convert to J
  const E_network_Wh = data_GB * 0.06 * 1000;

  const totalEnergy_Wh = Math.max(0,
    (E_prefill_J + E_decode_J + E_kv_J + E_cache_J) / 3600 + E_network_Wh);

  // Carbon: operational (gCO2e = Wh * CIF)
  const co2_operational = totalEnergy_Wh * p.gridCif;

  // Embodied: GPU + server + datacenter (matches embodied.ts 3-component model)
  const inferenceTime_h = (t_prefill + t_decode) / 3600;
  const safeUtil = Math.max(p.gpuUtilization, 0.01);

  const gpuAmort = p.embodiedCO2_kg / (profile.usefulLifeYears * HOURS_PER_YEAR);
  const gpu_gCO2e = gpuAmort * profile.numGpus * inferenceTime_h / safeUtil * 1000;

  const serverAmort = profile.embodiedCO2_server_kg / (profile.usefulLifeYears * HOURS_PER_YEAR);
  const server_gCO2e = serverAmort * inferenceTime_h / safeUtil * 1000;

  const serverPower_kW = profile.totalGpuPower_kW + profile.nonGpuPower_kW;
  const dcAmort = (serverPower_kW * DC_EMBODIED_KG_PER_KW) / (DC_LIFE_YEARS * HOURS_PER_YEAR);
  const dc_gCO2e = dcAmort * inferenceTime_h / safeUtil * 1000;

  const co2_total = co2_operational + gpu_gCO2e + server_gCO2e + dc_gCO2e;

  // Water (mL): direct + indirect
  const energy_kWh = totalEnergy_Wh / 1000;
  const water_mL = (energy_kWh * p.wue + energy_kWh * 0.8) * 1000;

  return { energy_Wh: totalEnergy_Wh, co2_gCO2e: co2_total, water_mL };
}

// ─── Percentile helper ───────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

// ─── Key driver analysis (OAT sensitivity) ───────────────────────

function identifyKeyDriver(
  usage: TokenUsage,
  profile: HardwareProfile,
  baseParams: SampledParams,
  utilization: UtilizationBounds,
): { name: string; fraction: number } {
  const paramDefs: Array<{ name: string; key: keyof SampledParams; low: number; high: number }> = [
    { name: "GPU power draw", key: "gpuPowerFraction", low: 0.60, high: 1.00 },
    { name: "GPU utilization", key: "gpuUtilization", low: utilization.gpuUtilizationMin, high: utilization.gpuUtilizationMax },
    { name: "PUE", key: "pue", low: 1.08, high: 1.20 },
    { name: "Grid carbon intensity", key: "gridCif", low: baseParams.gridCif * 0.6, high: baseParams.gridCif * 1.4 },
    { name: "Embodied CO2", key: "embodiedCO2_kg", low: baseParams.embodiedCO2_kg * 0.5, high: baseParams.embodiedCO2_kg * 2.0 },
    { name: "WUE", key: "wue", low: 0.5, high: 5.0 },
    { name: "Prefill speed", key: "prefillSpeed", low: baseParams.prefillSpeed * 0.7, high: baseParams.prefillSpeed * 1.3 },
    { name: "Decode speed", key: "decodeSpeed", low: baseParams.decodeSpeed * 0.7, high: baseParams.decodeSpeed * 1.3 },
  ];

  let totalVariance = 0;
  const variances: Array<{ name: string; variance: number }> = [];

  for (const param of paramDefs) {
    const lowP = { ...baseParams, [param.key]: param.low };
    const highP = { ...baseParams, [param.key]: param.high };
    const rLow = evaluateDraw(usage, profile, lowP);
    const rHigh = evaluateDraw(usage, profile, highP);
    const spread = rHigh.co2_gCO2e - rLow.co2_gCO2e;
    const v = spread * spread;
    variances.push({ name: param.name, variance: v });
    totalVariance += v;
  }

  variances.sort((a, b) => b.variance - a.variance);
  const top = variances[0]!;
  return {
    name: top.name,
    fraction: totalVariance > 0 ? top.variance / totalVariance : 0,
  };
}

// ─── Main API ────────────────────────────────────────────────────

const DEFAULT_N_DRAWS = 1000;

export function runUncertainty(
  usage: TokenUsage,
  profile: HardwareProfile,
  benchmarks: ModelBenchmarks,
  utilization: UtilizationBounds,
  pue: number,
  gridCif: number,
  nDraws: number = DEFAULT_N_DRAWS,
): UncertaintyResult {
  const params = sampleParams(nDraws, utilization, pue, gridCif, profile.embodiedCO2_kgPerGpu, benchmarks);

  const energies: number[] = new Array(nDraws);
  const co2s: number[] = new Array(nDraws);
  const waters: number[] = new Array(nDraws);

  for (let i = 0; i < nDraws; i++) {
    const r = evaluateDraw(usage, profile, params[i]!);
    energies[i] = r.energy_Wh;
    co2s[i] = r.co2_gCO2e;
    waters[i] = r.water_mL;
  }

  energies.sort((a, b) => a - b);
  co2s.sort((a, b) => a - b);
  waters.sort((a, b) => a - b);

  // Key driver analysis using median params as baseline
  const medianParams: SampledParams = {
    gpuPowerFraction: 0.80,
    gpuUtilization: utilization.gpuUtilizationMean,
    pue,
    gridCif,
    embodiedCO2_kg: profile.embodiedCO2_kgPerGpu,
    wue: 2.75,
    prefillSpeed: benchmarks.prefillTokensPerSecond,
    decodeSpeed: benchmarks.tps,
  };
  const driver = identifyKeyDriver(usage, profile, medianParams, utilization);

  return {
    energy_Wh: percentile(energies, 0.50),
    co2_gCO2e: percentile(co2s, 0.50),
    water_mL: percentile(waters, 0.50),
    energyLow_Wh: percentile(energies, 0.05),
    energyHigh_Wh: percentile(energies, 0.95),
    co2Low_gCO2e: percentile(co2s, 0.05),
    co2High_gCO2e: percentile(co2s, 0.95),
    waterLow_mL: percentile(waters, 0.05),
    waterHigh_mL: percentile(waters, 0.95),
    keyDriver: driver.name,
    keyDriverVarianceFraction: driver.fraction,
  };
}
