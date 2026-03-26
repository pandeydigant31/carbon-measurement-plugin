/**
 * Water consumption calculator.
 *
 * Two components (from PROMPT.md §2.2):
 *
 *   W_direct  = energy_kWh × WUE            (evaporative cooling at datacenter)
 *   W_indirect = energy_kWh × waterIntensity (electricity generation water use)
 *
 * Results are in milliliters (mL). WUE and water intensity values are in
 * L/kWh, so we multiply by 1000 to convert liters → mL.
 *
 * References:
 *   - Li et al. (2023), "Making AI Less Thirsty." confidence: medium
 *   - AWS Sustainability Report (2023), WUE 0.18-0.20 L/kWh. confidence: medium
 *   - Macknick et al. (2012), NREL water intensity of electricity generation. confidence: high
 */

import type { WaterResult } from "../types.ts";

// ─── Water Intensity by Generation Source ────────────────────────────

/**
 * Water consumption per kWh of electricity generation, by fuel source.
 * Units: liters per kWh (operational, cooling water for power plants).
 *
 * Source: Macknick et al. (2012), NREL. confidence: high
 */
const WATER_INTENSITY_L_PER_KWH: Record<string, number> = {
  coal: 1.9,
  gas: 0.7,
  nuclear: 2.5,
  wind: 0.0,
  solar: 0.0,
  hydro: 0.0, // operational only; evaporation from reservoirs excluded
};

/**
 * Regional average water intensity for electricity generation.
 * These are weighted averages based on regional generation mix.
 *
 * Source: Derived from IEA generation mix data + Macknick et al. (2012).
 * confidence: low (mix varies year to year)
 */
const REGIONAL_WATER_INTENSITY_L_PER_KWH: Record<string, number> = {
  // US regions (AWS region naming)
  "us-east-1": 1.1, // Virginia — mixed grid (gas, nuclear, coal)
  "us-east-2": 1.2, // Ohio — coal-heavy
  "us-west-1": 0.5, // N. California — renewables + gas
  "us-west-2": 0.4, // Oregon — hydro-heavy
  // European regions
  "eu-west-1": 0.3, // Ireland — wind-heavy
  "eu-west-2": 0.4, // London — gas + wind
  "eu-central-1": 0.6, // Frankfurt — mixed (coal phase-out)
  "eu-north-1": 0.1, // Stockholm — hydro + nuclear
  // Asia Pacific
  "ap-northeast-1": 0.8, // Tokyo — gas + nuclear restart
  "ap-southeast-1": 1.0, // Singapore — gas-heavy
  // Global fallback
  global: 0.8, // Source: IEA global weighted average. confidence: low
};

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Look up the indirect water intensity for a grid region.
 * Falls back to the global average if the region is unknown.
 */
function getWaterIntensity(gridRegion: string): number {
  const key = gridRegion.toLowerCase();
  return REGIONAL_WATER_INTENSITY_L_PER_KWH[key] ??
    REGIONAL_WATER_INTENSITY_L_PER_KWH["global"]!;
}

// ─── Main Calculator ────────────────────────────────────────────────

/**
 * Calculate water consumption (direct + indirect) for an inference request.
 *
 * @param energy_Wh   Total inference energy in Wh.
 * @param wue         Water Usage Effectiveness for the datacenter (L/kWh).
 *                    Typical values: AWS 0.18-0.20, Google ~1.1.
 * @param gridRegion  Grid region identifier for indirect water intensity lookup.
 * @returns           Water breakdown in mL (direct, indirect, total).
 */
export function calculateWater(
  energy_Wh: number,
  wue: number,
  gridRegion: string,
): WaterResult {
  const energy_kWh = energy_Wh / 1000;

  // Direct water: evaporative cooling at the datacenter.
  // W_direct = energy_kWh × WUE (L), converted to mL.
  const direct_L = energy_kWh * wue;
  const direct_mL = direct_L * 1000;

  // Indirect water: water consumed in electricity generation.
  // W_indirect = energy_kWh × waterIntensity(region) (L), converted to mL.
  const waterIntensity = getWaterIntensity(gridRegion);
  const indirect_L = energy_kWh * waterIntensity;
  const indirect_mL = indirect_L * 1000;

  const total_mL = direct_mL + indirect_mL;

  return {
    direct_mL,
    indirect_mL,
    total_mL,
  };
}
