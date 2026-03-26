/**
 * Carbon calculator tests with worked examples.
 *
 * WORKED EXAMPLE:
 * ───────────────
 * Energy breakdown: prefill=0.53 Wh, decode=1.85 Wh, kv=0.001 Wh, cache=0 Wh
 * Inference energy = 0.53 + 1.85 + 0.001 + 0 = 2.381 Wh
 * Grid CIF: 0.380 kgCO2e/kWh (us-east-1, PJM)
 * PUE: 1.13
 *
 * co2_operational = 2.381 Wh * 0.380 kgCO2e/kWh
 *                 = 2.381 / 1000 * 0.380 * 1000  (Wh→kWh, kg→g)
 *                 = 2.381 * 0.380  (÷1000 and ×1000 cancel)
 *                 = 0.905 gCO2e
 */

import { describe, test, expect } from "bun:test";
import { calculateCarbon } from "./carbon.ts";
import type { EnergyBreakdown } from "../types.ts";

describe("Carbon Calculator", () => {
  test("worked example: 2.381 Wh at us-east-1 CIF", () => {
    const energy: EnergyBreakdown = {
      prefill_Wh: 0.53,
      decode_Wh: 1.85,
      kvCache_Wh: 0.001,
      cacheOps_Wh: 0,
      network_Wh: 0,
      embodied_Wh: 0,
      total_Wh: 2.381,
    };

    const result = calculateCarbon(energy, 0.380, "regional", "us-east-1", 1.13);

    // 2.381 * 0.380 = 0.905 gCO2e
    expect(result.operational_gCO2e).toBeCloseTo(0.905, 2);
    expect(result.total_gCO2e).toBeCloseTo(0.905, 2);
    expect(result.gridCif_kgPerKWh).toBe(0.380);
    expect(result.gridCifSource).toBe("regional");
    expect(result.regionInferred).toBe("us-east-1");
  });

  test("zero energy produces zero carbon", () => {
    const energy: EnergyBreakdown = {
      prefill_Wh: 0, decode_Wh: 0, kvCache_Wh: 0,
      cacheOps_Wh: 0, network_Wh: 0, embodied_Wh: 0, total_Wh: 0,
    };

    const result = calculateCarbon(energy, 0.380, "regional", "us-east-1", 1.13);
    expect(result.total_gCO2e).toBe(0);
  });

  test("higher CIF produces more carbon for same energy", () => {
    const energy: EnergyBreakdown = {
      prefill_Wh: 1, decode_Wh: 1, kvCache_Wh: 0,
      cacheOps_Wh: 0, network_Wh: 0, embodied_Wh: 0, total_Wh: 2,
    };

    const lowCif = calculateCarbon(energy, 0.100, "regional", "us-west-2", 1.13); // Oregon (hydro)
    const highCif = calculateCarbon(energy, 0.460, "regional", "ap-northeast-1", 1.13); // Japan

    expect(highCif.total_gCO2e).toBeGreaterThan(lowCif.total_gCO2e * 3);
  });
});
