/**
 * Hardware profiles for Claude model families.
 *
 * Methodology: Map each model family to a plausible GPU configuration
 * based on publicly available information about LLM serving infrastructure.
 * All constants cite sources; confidence levels indicate certainty.
 *
 * ISO 14040 note: Hardware profiles define the technosphere inputs
 * (electricity, embodied materials) for the product system.
 */

import type { HardwareProfile, ModelFamily, UtilizationBounds } from "../types.ts";

// ─── Per-GPU Constants ──────────────────────────────────────────

// Source: NVIDIA H100 SXM datasheet (2023), 700W TDP, confidence: high
const H100_TDP_KW = 0.700;

// Source: NVIDIA H100 SXM datasheet (2023), 80 GB HBM3, confidence: high
const H100_HBM_GB = 80;

// Source: Estimated from HBM3 spec sheets (~20W per stack, 5 stacks), confidence: medium
// Jouppi et al. (2023) report HBM contributes ~3% of total GPU power at load
const H100_HBM_POWER_KW = 0.020;

// Source: Gupta et al. (2022) "Chasing Carbon: The Elusive Environmental Footprint of Computing",
//         ~150 kgCO2e per GPU including manufacturing and packaging, confidence: medium
const EMBODIED_CO2_PER_GPU_KG = 150;

// Source: Dell PowerEdge lifecycle assessment reports (2021-2023),
//         ~600 kgCO2e for server chassis, CPUs, memory, NIC, SSD excluding GPUs, confidence: medium
const EMBODIED_CO2_SERVER_KG = 600;

// Source: Industry standard depreciation for datacenter GPUs, confidence: medium
// Matches typical cloud provider refresh cycles (AWS, GCP)
const GPU_USEFUL_LIFE_YEARS = 4;

// Source: Dell lifecycle reports — servers typically run 5 years, confidence: medium
const SERVER_USEFUL_LIFE_YEARS = 5;

// ─── Non-GPU Power Estimates ────────────────────────────────────

// Source: Patterson et al. (2022) "The Carbon Footprint of Machine Learning Training Will Plateau, Then Shrink"
// Non-GPU power (CPU, DRAM, NIC, SSD, fans) scales roughly with node size.
// For a DGX-style node: ~0.5 kW base + ~0.1 kW per GPU, confidence: low
function estimateNonGpuPower(numGpus: number): number {
  // Source: Patterson et al. (2022), DGX A100/H100 system-level measurements, confidence: low
  // 1-GPU server: ~0.3 kW overhead (lighter chassis)
  // 2-GPU server: ~0.5 kW overhead
  // 8-GPU DGX node: ~1.2 kW overhead (dual CPUs, 2TB RAM, NVSwitch, 8x NICs)
  const baseOverhead = 0.2; // kW — minimum chassis/PSU overhead
  const perGpuOverhead = 0.125; // kW — CPU/memory/NIC scaling per GPU
  return baseOverhead + numGpus * perGpuOverhead;
}

// ─── Hardware Profiles ──────────────────────────────────────────

const HAIKU_PROFILE: HardwareProfile = {
  name: "claude-haiku-inference",
  modelFamily: "haiku",
  // Source: Inference of small models (~8-20B params) typically served on 1 GPU, confidence: low
  numGpus: 1,
  gpuModel: "NVIDIA H100 SXM",
  gpuTdp_kW: H100_TDP_KW,
  totalGpuPower_kW: 1 * H100_TDP_KW, // 0.700 kW
  nonGpuPower_kW: estimateNonGpuPower(1), // ~0.325 kW
  hbmPerGpu_GB: H100_HBM_GB,
  totalHbm_GB: 1 * H100_HBM_GB, // 80 GB
  hbmPower_kW: 1 * H100_HBM_POWER_KW, // 0.020 kW
  // Source: Gupta et al. (2022), 150 kgCO2e/GPU, confidence: medium
  embodiedCO2_kgPerGpu: EMBODIED_CO2_PER_GPU_KG,
  // Source: Dell lifecycle reports (2021-2023), confidence: medium
  embodiedCO2_server_kg: EMBODIED_CO2_SERVER_KG,
  // Source: Industry standard, blended GPU/server life, confidence: medium
  usefulLifeYears: GPU_USEFUL_LIFE_YEARS,
};

const SONNET_PROFILE: HardwareProfile = {
  name: "claude-sonnet-inference",
  modelFamily: "sonnet",
  // Source: Medium models (~70B params) typically served on 2 GPUs for tensor parallelism, confidence: low
  numGpus: 2,
  gpuModel: "NVIDIA H100 SXM",
  gpuTdp_kW: H100_TDP_KW,
  totalGpuPower_kW: 2 * H100_TDP_KW, // 1.400 kW
  nonGpuPower_kW: estimateNonGpuPower(2), // ~0.450 kW
  hbmPerGpu_GB: H100_HBM_GB,
  totalHbm_GB: 2 * H100_HBM_GB, // 160 GB
  hbmPower_kW: 2 * H100_HBM_POWER_KW, // 0.040 kW
  // Source: Gupta et al. (2022), 150 kgCO2e/GPU, confidence: medium
  embodiedCO2_kgPerGpu: EMBODIED_CO2_PER_GPU_KG,
  // Source: Dell lifecycle reports (2021-2023), confidence: medium
  embodiedCO2_server_kg: EMBODIED_CO2_SERVER_KG,
  // Source: Industry standard, blended GPU/server life, confidence: medium
  usefulLifeYears: GPU_USEFUL_LIFE_YEARS,
};

const OPUS_PROFILE: HardwareProfile = {
  name: "claude-opus-inference",
  modelFamily: "opus",
  // Source: Large models (~200B+ params) likely require a full DGX H100 node (8 GPUs), confidence: low
  numGpus: 8,
  gpuModel: "NVIDIA H100 SXM",
  gpuTdp_kW: H100_TDP_KW,
  totalGpuPower_kW: 8 * H100_TDP_KW, // 5.600 kW
  nonGpuPower_kW: estimateNonGpuPower(8), // ~1.200 kW
  hbmPerGpu_GB: H100_HBM_GB,
  totalHbm_GB: 8 * H100_HBM_GB, // 640 GB
  hbmPower_kW: 8 * H100_HBM_POWER_KW, // 0.160 kW
  // Source: Gupta et al. (2022), 150 kgCO2e/GPU, confidence: medium
  embodiedCO2_kgPerGpu: EMBODIED_CO2_PER_GPU_KG,
  // Source: Dell lifecycle reports (2021-2023), confidence: medium
  embodiedCO2_server_kg: EMBODIED_CO2_SERVER_KG,
  // Source: Industry standard, blended GPU/server life, confidence: medium
  usefulLifeYears: GPU_USEFUL_LIFE_YEARS,
};

// ─── Profile Lookup ─────────────────────────────────────────────

const PROFILES: Record<ModelFamily, HardwareProfile> = {
  haiku: HAIKU_PROFILE,
  sonnet: SONNET_PROFILE,
  opus: OPUS_PROFILE,
};

/**
 * Get the hardware profile for a model family.
 * Returns the estimated GPU configuration, power draw, and embodied carbon.
 */
export function getHardwareProfile(family: ModelFamily): HardwareProfile {
  return PROFILES[family];
}

// ─── Utilization Bounds ─────────────────────────────────────────

/**
 * GPU utilization bounds for inference workloads.
 *
 * These represent the fraction of GPU TDP actually consumed during inference.
 * Real utilization varies with batch size, sequence length, and request patterns.
 * LLM inference is memory-bandwidth-bound, not compute-bound, so utilization
 * is typically lower than training.
 */
// Source: Chien et al. (2023) "Reducing the Carbon Impact of Generative AI Inference",
//         LLM inference GPU utilization 30-70% of TDP depending on load, confidence: medium
// Source: Patterson et al. (2022), typical datacenter GPU utilization 30-60%, confidence: medium
export const UTILIZATION_BOUNDS: UtilizationBounds = {
  gpuUtilizationMin: 0.30,
  gpuUtilizationMax: 0.70,
  gpuUtilizationMean: 0.50,
  // Source: Patterson et al. (2022), non-GPU components run near-constant, confidence: medium
  nonGpuUtilization: 0.80,
  source: "Chien et al. (2023), Patterson et al. (2022)",
  confidence: "medium",
};

// ─── Exports ────────────────────────────────────────────────────

/**
 * Alias for hooks that import UTILIZATION directly.
 */
export const UTILIZATION = UTILIZATION_BOUNDS;

export {
  H100_TDP_KW,
  H100_HBM_GB,
  H100_HBM_POWER_KW,
  EMBODIED_CO2_PER_GPU_KG,
  EMBODIED_CO2_SERVER_KG,
  GPU_USEFUL_LIFE_YEARS,
  SERVER_USEFUL_LIFE_YEARS,
};
