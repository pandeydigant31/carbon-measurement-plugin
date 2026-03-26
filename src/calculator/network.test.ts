/**
 * Network energy calculator tests with worked examples.
 *
 * WORKED EXAMPLE:
 * ───────────────
 * Input: 10,000 tokens, Output: 500 tokens = 10,500 total tokens
 * Bytes: 10500 * 4 = 42,000 bytes = 0.000042 GB
 * Energy: 0.000042 * 0.06 kWh/GB = 0.00000252 kWh = 0.00252 Wh
 *
 * Network energy is tiny compared to inference energy (~0.1% of total).
 * This is expected — the GPU dominates.
 */

import { describe, test, expect } from "bun:test";
import { calculateNetworkEnergy } from "./network.ts";

describe("Network Energy Calculator", () => {
  test("worked example: 10.5k tokens", () => {
    const result = calculateNetworkEnergy(10000, 500);

    // 10500 * 4 / 1e9 = 0.000042 GB
    // 0.000042 * 0.06 = 0.00000252 kWh = 0.00252 Wh
    expect(result).toBeCloseTo(0.00252, 4);
  });

  test("zero tokens produces zero energy", () => {
    expect(calculateNetworkEnergy(0, 0)).toBe(0);
  });

  test("scales linearly with token count", () => {
    const r1 = calculateNetworkEnergy(1000, 0);
    const r10 = calculateNetworkEnergy(10000, 0);
    expect(r10 / r1).toBeCloseTo(10, 1);
  });

  test("network energy is small relative to inference", () => {
    // A large session: 100k input + 10k output
    const networkWh = calculateNetworkEnergy(100000, 10000);
    // Should be well under 1 Wh
    expect(networkWh).toBeLessThan(0.1);
  });
});
