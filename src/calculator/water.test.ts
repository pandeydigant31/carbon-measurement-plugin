/**
 * Water consumption calculator tests with worked examples.
 *
 * WORKED EXAMPLE (2.374 Wh inference, us-east-1):
 * ────────────────────────────────────────────────
 * energy_kWh = 2.374 / 1000 = 0.002374 kWh
 * WUE = 1.8 L/kWh (Li et al. 2023)
 *
 * Direct (cooling):
 *   W_direct = 0.002374 * 1.8 = 0.004273 L = 4.27 mL
 *
 * Indirect (electricity generation, us-east-1 water intensity = 1.1 L/kWh):
 *   W_indirect = 0.002374 * 1.1 = 0.002611 L = 2.61 mL
 *
 * Total = 4.27 + 2.61 = 6.88 mL
 */

import { describe, test, expect } from "bun:test";
import { calculateWater } from "./water.ts";

describe("Water Calculator", () => {
  test("worked example: 2.374 Wh at us-east-1 with WUE 1.8", () => {
    const result = calculateWater(2.374, 1.8, "us-east-1");

    // Direct: 0.002374 kWh * 1.8 L/kWh * 1000 = 4.27 mL
    expect(result.direct_mL).toBeCloseTo(4.27, 1);

    // Indirect: 0.002374 kWh * 1.1 L/kWh * 1000 = 2.61 mL
    expect(result.indirect_mL).toBeCloseTo(2.61, 1);

    // Total
    expect(result.total_mL).toBeCloseTo(6.88, 1);
    expect(result.total_mL).toBeCloseTo(result.direct_mL + result.indirect_mL, 4);
  });

  test("zero energy produces zero water", () => {
    const result = calculateWater(0, 1.8, "us-east-1");
    expect(result.direct_mL).toBe(0);
    expect(result.indirect_mL).toBe(0);
    expect(result.total_mL).toBe(0);
  });

  test("higher WUE produces more direct water", () => {
    const lowWue = calculateWater(10, 0.5, "us-east-1");
    const highWue = calculateWater(10, 5.0, "us-east-1");

    expect(highWue.direct_mL).toBeGreaterThan(lowWue.direct_mL * 5);
  });

  test("regional fallback uses global average", () => {
    const known = calculateWater(10, 1.8, "us-east-1");
    const unknown = calculateWater(10, 1.8, "unknown-region");

    // us-east-1 has water intensity 1.1 L/kWh
    // global fallback has 0.8 L/kWh
    // So unknown region should have less indirect water
    expect(unknown.indirect_mL).toBeLessThan(known.indirect_mL);
  });

  test("hydro-heavy region has less indirect water", () => {
    const oregon = calculateWater(10, 1.8, "us-west-2"); // hydro-heavy, 0.4 L/kWh
    const virginia = calculateWater(10, 1.8, "us-east-1"); // mixed grid, 1.1 L/kWh

    expect(oregon.indirect_mL).toBeLessThan(virginia.indirect_mL);
  });

  test("direct water is independent of grid region", () => {
    const r1 = calculateWater(10, 1.8, "us-east-1");
    const r2 = calculateWater(10, 1.8, "eu-north-1");

    // Same WUE, same energy => same direct water
    expect(r1.direct_mL).toBe(r2.direct_mL);
  });
});
