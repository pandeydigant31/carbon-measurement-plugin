/**
 * Core type definitions for the Carbon Measurement Plugin.
 * ISO 14040/14044 aligned system boundary types.
 */

// ─── Model Identification ────────────────────────────────────────

export type ModelFamily = "haiku" | "sonnet" | "opus";

export function resolveModelFamily(modelId: string): ModelFamily {
  const lower = modelId.toLowerCase();
  if (lower.includes("haiku")) return "haiku";
  if (lower.includes("opus")) return "opus";
  return "sonnet"; // default assumption
}

// ─── Hardware Profile ────────────────────────────────────────────

export interface HardwareProfile {
  name: string;
  modelFamily: ModelFamily;
  numGpus: number;
  gpuModel: string;
  gpuTdp_kW: number; // per-GPU TDP
  totalGpuPower_kW: number; // numGpus * gpuTdp
  nonGpuPower_kW: number; // CPU + memory + NIC + SSD
  hbmPerGpu_GB: number;
  totalHbm_GB: number;
  hbmPower_kW: number; // HBM power draw (static + dynamic)
  embodiedCO2_kgPerGpu: number;
  embodiedCO2_server_kg: number;
  usefulLifeYears: number;
}

// ─── Performance Benchmarks ──────────────────────────────────────

export interface ModelBenchmarks {
  modelFamily: ModelFamily;
  tps: number; // tokens per second (decode throughput)
  prefillTokensPerSecond: number; // input processing rate
  ttftBase_s: number; // base time-to-first-token (seconds)
  kvCacheBytesPerToken: number; // memory per token in KV-cache
  benchmarksUpdated: string; // ISO date
  source: string;
}

// ─── Utilization ─────────────────────────────────────────────────

export interface UtilizationBounds {
  gpuUtilizationMin: number;
  gpuUtilizationMax: number;
  gpuUtilizationMean: number;
  nonGpuUtilization: number;
  source: string;
  confidence: "low" | "medium" | "high";
}

// ─── Token Usage ─────────────────────────────────────────────────

export interface TokenUsage {
  model: string;
  modelFamily: ModelFamily;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface SessionTokens {
  requests: TokenUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  numRequests: number;
  primaryModel: string; // most-used model
}

// ─── Energy Breakdown ────────────────────────────────────────────

export interface EnergyBreakdown {
  prefill_Wh: number;
  decode_Wh: number;
  kvCache_Wh: number;
  cacheOps_Wh: number; // negative = savings from cache reads
  network_Wh: number;
  embodied_Wh: number;
  total_Wh: number;
}

// ─── Carbon Result ───────────────────────────────────────────────

export interface CarbonResult {
  operational_gCO2e: number; // Scope 2
  embodied_gCO2e: number; // Scope 3 upstream
  network_gCO2e: number;
  total_gCO2e: number;
  gridCif_kgPerKWh: number; // CIF used
  gridCifSource: "realtime" | "regional" | "provider" | "fallback";
  regionInferred: string;
  pueUsed: number;
}

// ─── Water Result ────────────────────────────────────────────────

export interface WaterResult {
  direct_mL: number; // evaporative cooling
  indirect_mL: number; // electricity generation
  total_mL: number;
}

// ─── Session Result (full assessment) ────────────────────────────

export interface SessionAssessment {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  tokens: SessionTokens;
  energy: EnergyBreakdown;
  carbon: CarbonResult;
  water: WaterResult;
  // Uncertainty bounds (90% CI)
  energyLow_Wh: number;
  energyHigh_Wh: number;
  carbonLow_gCO2e: number;
  carbonHigh_gCO2e: number;
  // Metadata
  pluginVersion: string;
  methodologyVersion: string;
}

// ─── Plugin Configuration ────────────────────────────────────────

export interface PluginConfig {
  gridCifMethod: "auto" | "realtime" | "regional" | "manual";
  gridCifManualValue?: number;
  electricityMapsApiKey?: string;
  inferredRegion?: string;
  includeEmbodied: boolean;
  includeNetwork: boolean;
  includeWater: boolean;
  showComparisons: boolean;
  showHumanEquivalent: boolean;
  humanHoursPerSession: number;
  commuteMode: "car" | "transit" | "bike" | "remote";
  showUncertainty: boolean;
  statuslineFormat: "compact" | "detailed";
  reportCurrency: "gCO2e" | "Wh" | "both";
}

export const DEFAULT_CONFIG: PluginConfig = {
  gridCifMethod: "auto",
  includeEmbodied: true,
  includeNetwork: true,
  includeWater: true,
  showComparisons: true,
  showHumanEquivalent: true,
  humanHoursPerSession: 1.0,
  commuteMode: "car",
  showUncertainty: true,
  statuslineFormat: "compact",
  reportCurrency: "both",
};

// ─── Transcript Types ────────────────────────────────────────────

export interface TranscriptMessage {
  type: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  timestamp?: string;
}
