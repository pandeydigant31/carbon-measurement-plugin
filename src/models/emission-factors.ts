/**
 * Emission factors for carbon, water, and energy calculations.
 *
 * All factors include source citations, geographic scope, and confidence levels.
 * ISO 14040/14044 alignment: these are characterization factors for the
 * climate change impact category (GWP100, kgCO2e).
 *
 * Convention: CIF = Carbon Intensity Factor (kgCO2e/kWh)
 */

// ─── Grid Carbon Intensity Factors ──────────────────────────────
//
// Regional average grid emission factors for electricity consumption.
// These are location-based (Scope 2) factors, not market-based.
// For real-time CIF, use Electricity Maps API (optional, Phase 3).

/**
 * Regional grid carbon intensity factors in kgCO2e/kWh.
 * Maps AWS region codes to their national/regional grid average CIF.
 */
const GRID_CIF: Record<string, { value: number; source: string; confidence: "high" | "medium" | "low" }> = {
  // Source: EIA (2023), US national average ~0.390 kgCO2e/kWh,
  // Virginia grid (PJM) is ~0.380 due to nuclear + gas mix, confidence: high
  "us-east-1": {
    value: 0.380,
    source: "EIA (2023), PJM Interconnection regional average",
    confidence: "high",
  },

  // Source: EIA (2023), Oregon grid (BPA) is heavily hydro,
  // ~0.100 kgCO2e/kWh, confidence: high
  "us-west-2": {
    value: 0.100,
    source: "EIA (2023), BPA/WECC Northwest subregion",
    confidence: "high",
  },

  // Source: IEA (2023), Ireland grid ~0.290 kgCO2e/kWh,
  // High wind penetration but gas backup, confidence: high
  "eu-west-1": {
    value: 0.290,
    source: "IEA (2023), Ireland national grid average",
    confidence: "high",
  },

  // Source: IEA (2023), Germany grid ~0.350 kgCO2e/kWh,
  // Coal phase-out underway but still significant, confidence: high
  "eu-central-1": {
    value: 0.350,
    source: "IEA (2023), Germany national grid average",
    confidence: "high",
  },

  // Source: IEA (2023), Japan grid ~0.460 kgCO2e/kWh,
  // Post-Fukushima reliance on LNG/coal, slow nuclear restart, confidence: high
  "ap-northeast-1": {
    value: 0.460,
    source: "IEA (2023), Japan national grid average",
    confidence: "high",
  },

  // Source: IEA (2023), Singapore grid ~0.410 kgCO2e/kWh,
  // Almost entirely natural gas, confidence: high
  "ap-southeast-1": {
    value: 0.410,
    source: "IEA (2023), Singapore national grid average",
    confidence: "high",
  },
};

// Source: IEA (2023), global average grid CIF ~0.490 kgCO2e/kWh, confidence: medium
// Used as fallback when region is unknown
const DEFAULT_GRID_CIF = 0.490;
const DEFAULT_GRID_CIF_SOURCE = "IEA (2023), global average grid carbon intensity";

/**
 * Look up the grid carbon intensity factor for an AWS region.
 * Returns the regional value if available, otherwise the global average fallback.
 *
 * @param region - AWS region code (e.g., "us-east-1")
 * @returns CIF in kgCO2e/kWh
 */
export function getGridCIF(region: string): number {
  return GRID_CIF[region]?.value ?? DEFAULT_GRID_CIF;
}

/**
 * Get the source citation for a region's CIF.
 * Useful for audit trails and transparency.
 */
export function getGridCIFSource(region: string): string {
  return GRID_CIF[region]?.source ?? DEFAULT_GRID_CIF_SOURCE;
}

/**
 * Check whether a specific region has a known CIF.
 */
export function hasRegionalCIF(region: string): boolean {
  return region in GRID_CIF;
}

/**
 * Get the default/fallback global average CIF.
 */
export function getDefaultCIF(): number {
  return DEFAULT_GRID_CIF;
}

/**
 * Get all supported regions and their CIF values.
 */
export function getAllRegionCIFs(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [region, entry] of Object.entries(GRID_CIF)) {
    result[region] = entry.value;
  }
  return result;
}

// ─── Power Usage Effectiveness (PUE) ───────────────────────────
//
// PUE = Total facility power / IT equipment power
// PUE of 1.0 means zero overhead; typical DCs are 1.1-1.6.

// Source: AWS Sustainability Report (2023), reported PUE 1.15 for hyperscale facilities, confidence: high
// Source: Google Environmental Report (2023), reported PUE 1.10, confidence: high
// Anthropic uses AWS/GCP — we use a blended estimate slightly above their best-case
const DEFAULT_PUE = 1.13;

// Source: Uptime Institute (2023), industry average PUE for hyperscale DCs, confidence: high
const PUE_MIN = 1.08; // Best-case hyperscale (Google, committed facilities)
const PUE_MAX = 1.20; // Typical AWS region (includes older facilities)

/**
 * Get the default PUE for Anthropic's infrastructure (AWS/GCP).
 */
export function getDefaultPUE(): number {
  return DEFAULT_PUE;
}

/**
 * Get PUE uncertainty bounds for Monte Carlo sampling.
 */
export function getPUEBounds(): { min: number; max: number; mean: number } {
  return { min: PUE_MIN, max: PUE_MAX, mean: DEFAULT_PUE };
}

// ─── Water Usage Effectiveness (WUE) ───────────────────────────
//
// WUE = Liters of water consumed / IT equipment energy (kWh)
// Covers direct evaporative cooling water only.

// Source: AWS Sustainability Report (2024), global WUE 0.15 L/kWh, confidence: high
// Source: AWS Sustainability Report (2023), global WUE 0.18 L/kWh, confidence: high
// Using 0.18 as conservative default (2023 figure). Li et al. (2023) reports
// 1.8 L/kWh average across US DCs but that includes older/hotter-climate facilities.
// Anthropic runs on AWS, so AWS-reported WUE is more representative.
const DEFAULT_WUE_L_PER_KWH = 0.18;

// Source: AWS best-case (2024): 0.10 L/kWh. Li et al. upper bound: 1.8 L/kWh
const WUE_MIN = 0.10;
const WUE_MAX = 1.8;

// Source: Gleick (1994), Macknick et al. (2012), water consumption for electricity generation
//         US average ~1.8 L/kWh (thermoelectric), confidence: medium
const INDIRECT_WATER_L_PER_KWH = 1.8;

/**
 * Get the default WUE (direct cooling water per kWh of IT load).
 */
export function getDefaultWUE(): number {
  return DEFAULT_WUE_L_PER_KWH;
}

/**
 * Get WUE uncertainty bounds.
 */
export function getWUEBounds(): { min: number; max: number; mean: number } {
  return { min: WUE_MIN, max: WUE_MAX, mean: DEFAULT_WUE_L_PER_KWH };
}

/**
 * Get indirect water consumption factor for electricity generation.
 * This is the water used by the power plant, not the datacenter.
 */
export function getIndirectWaterFactor(): number {
  return INDIRECT_WATER_L_PER_KWH;
}

// ─── Network Energy ─────────────────────────────────────────────

// Source: Aslan et al. (2018) "Electricity Intensity of Internet Data Transmission",
//         0.06 kWh/GB, adjusted for 2020s efficiency improvements, confidence: medium
// Note: Coroama & Hilty (2014) suggest this could be lower (0.02-0.05 kWh/GB)
// for intra-cloud traffic. We use the Aslan value as a conservative upper bound.
const NETWORK_ENERGY_KWH_PER_GB = 0.06;

// Source: Typical UTF-8 encoding for English text with BPE tokenization
// Average ~4 bytes per token (varies by language and tokenizer), confidence: medium
const AVERAGE_BYTES_PER_TOKEN = 4;

/**
 * Get network energy intensity in kWh per GB transmitted.
 */
export function getNetworkEnergyIntensity(): number {
  return NETWORK_ENERGY_KWH_PER_GB;
}

/**
 * Get average bytes per token for network transfer calculations.
 */
export function getAverageBytesPerToken(): number {
  return AVERAGE_BYTES_PER_TOKEN;
}

// ─── Human Activity Comparisons ─────────────────────────────────
//
// For comparative context: "This session used X% of a car commute" etc.

export interface HumanActivityEmission {
  activity: string;
  value: number; // gCO2e per unit
  unit: string;
  source: string;
  confidence: "high" | "medium" | "low";
}

// Source: EPA (2024), average passenger vehicle emits 400 gCO2e/mile, confidence: high
// Based on 8.89 kgCO2/gal gasoline, 24.2 mpg fleet average
const CAR_COMMUTE_G_PER_MILE = 400;

// Source: EPA (2024), US average residential electricity ~0.92 kgCO2e/kWh
// Average US home uses ~30 kWh/day → ~27.6 kgCO2e/day, confidence: high
const HOME_ELECTRICITY_G_PER_HOUR = 1_150; // ~27.6 kgCO2e / 24 hours

// Source: Google Environmental Report (2023), ~0.3 gCO2e per search
// (includes datacenter + network, excludes user device), confidence: medium
const GOOGLE_SEARCH_G = 0.3;

// Source: IEA (2023), streaming video ~36 gCO2e/hour (global average grid), confidence: medium
// Covers datacenter + CDN + network, excludes user device
const VIDEO_STREAMING_G_PER_HOUR = 36;

// Source: EPA (2024), human respiration ~200 gCO2/hour (metabolic, not net climate impact)
// Included for calibration / "sanity check" perspective only
const HUMAN_BREATHING_G_PER_HOUR = 200;

/**
 * All human activity emission factors for comparative context.
 * These are NOT used in calculations — only for user-facing comparisons.
 */
export const HUMAN_ACTIVITY_EMISSIONS: HumanActivityEmission[] = [
  {
    activity: "Driving (average US car)",
    value: CAR_COMMUTE_G_PER_MILE,
    unit: "gCO2e/mile",
    // Source: EPA (2024), Inventory of US Greenhouse Gas Emissions and Sinks, confidence: high
    source: "EPA (2024)",
    confidence: "high",
  },
  {
    activity: "Home electricity (US average)",
    value: HOME_ELECTRICITY_G_PER_HOUR,
    unit: "gCO2e/hour",
    // Source: EPA (2024) + EIA residential consumption data, confidence: high
    source: "EPA (2024), EIA (2023)",
    confidence: "high",
  },
  {
    activity: "Google search",
    value: GOOGLE_SEARCH_G,
    unit: "gCO2e/search",
    // Source: IEA (2023), data centre energy analysis, confidence: medium
    source: "IEA (2023)",
    confidence: "medium",
  },
  {
    activity: "Video streaming",
    value: VIDEO_STREAMING_G_PER_HOUR,
    unit: "gCO2e/hour",
    // Source: IEA (2023), The Carbon Footprint of Streaming Video, confidence: medium
    source: "IEA (2023)",
    confidence: "medium",
  },
  {
    activity: "Human breathing",
    value: HUMAN_BREATHING_G_PER_HOUR,
    unit: "gCO2e/hour",
    // Source: EPA (2024), metabolic CO2 (biogenic, not net climate forcing), confidence: high
    source: "EPA (2024), metabolic baseline",
    confidence: "high",
  },
];

/**
 * Get the emission rate for a specific human activity (for comparisons).
 */
export function getHumanActivityEmission(activity: string): HumanActivityEmission | undefined {
  return HUMAN_ACTIVITY_EMISSIONS.find(
    (e) => e.activity.toLowerCase().includes(activity.toLowerCase()),
  );
}

/**
 * Get car commute emissions for a given distance.
 *
 * @param miles - One-way commute distance in miles
 * @returns gCO2e for the commute
 */
export function getCarCommuteEmissions(miles: number): number {
  // Source: EPA (2024), 400 gCO2e/mile, confidence: high
  return miles * CAR_COMMUTE_G_PER_MILE;
}

// ─── Exported Constants ─────────────────────────────────────────

/**
 * Alias for hooks that import AVG_BYTES_PER_TOKEN directly.
 */
export const AVG_BYTES_PER_TOKEN = AVERAGE_BYTES_PER_TOKEN;

export {
  DEFAULT_GRID_CIF,
  DEFAULT_PUE,
  NETWORK_ENERGY_KWH_PER_GB,
  AVERAGE_BYTES_PER_TOKEN,
  CAR_COMMUTE_G_PER_MILE,
  GOOGLE_SEARCH_G,
  VIDEO_STREAMING_G_PER_HOUR,
};
