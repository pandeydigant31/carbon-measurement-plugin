/**
 * Operational carbon (Scope 2) calculator.
 *
 * Converts energy consumption (Wh) to gCO2e using a grid carbon intensity
 * factor (CIF) expressed in kgCO2e/kWh.
 *
 * Formula (from PROMPT.md §2.1):
 *   co2_operational_gCO2e = energy_Wh / 1000 * gridCIF_kgPerKWh * 1000
 *                         = energy_Wh * gridCIF_kgPerKWh
 *
 *   (Wh → kWh is ÷1000, kgCO2e → gCO2e is ×1000; the factors cancel.)
 *
 * References:
 *   - GHG Protocol Scope 2 Guidance (2015)
 *   - IEA Emission Factors (annual)
 */

import type { EnergyBreakdown, CarbonResult } from "../types.ts";

/**
 * Calculate carbon emissions from an energy breakdown.
 *
 * @param energy    Energy breakdown from the energy calculator (Wh per component).
 * @param gridCif   Grid carbon intensity factor (kgCO2e per kWh).
 * @param cifSource How the CIF was determined ("realtime" | "regional" | "provider" | "fallback").
 * @param region    Inferred or configured grid region (e.g. "us-east-1").
 * @param pue       PUE used in the energy calculation (passed through for audit trail).
 * @returns         Carbon result with operational, embodied, and network breakdowns in gCO2e.
 */
export function calculateCarbon(
  energy: EnergyBreakdown,
  gridCif: number,
  cifSource: string,
  region: string,
  pue: number,
): CarbonResult {
  // Operational (Scope 2): inference energy × CIF.
  // energy_Wh / 1000 → kWh, then × gridCif kgCO2e/kWh → kgCO2e, then × 1000 → gCO2e.
  // Simplifies to: energy_Wh × gridCif (the ÷1000 and ×1000 cancel).
  const inferenceEnergy_Wh =
    energy.prefill_Wh + energy.decode_Wh + energy.kvCache_Wh + energy.cacheOps_Wh;

  const operational_gCO2e = inferenceEnergy_Wh * gridCif;

  // Embodied (Scope 3): energy.embodied_Wh is an energy-equivalent placeholder
  // set by the embodied calculator. Convert to gCO2e using the same CIF.
  const embodied_gCO2e = energy.embodied_Wh * gridCif;

  // Network: energy.network_Wh converted to gCO2e.
  const network_gCO2e = energy.network_Wh * gridCif;

  const total_gCO2e = operational_gCO2e + embodied_gCO2e + network_gCO2e;

  return {
    operational_gCO2e,
    embodied_gCO2e,
    network_gCO2e,
    total_gCO2e,
    gridCif_kgPerKWh: gridCif,
    gridCifSource: cifSource as CarbonResult["gridCifSource"],
    regionInferred: region,
    pueUsed: pue,
  };
}
