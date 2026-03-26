/**
 * Formatting utilities for human-readable display of energy,
 * carbon, water, and token metrics.
 *
 * Rounding rules (design.md):
 *   - Values > 1: 1 decimal place
 *   - Values < 1: 2 decimal places
 *   - Zero: "0"
 *
 * These rules are shared with statusline/format.ts.
 */

function formatNum(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1) return `${sign}${abs.toFixed(1)}`;
  return `${sign}${abs.toFixed(2)}`;
}

/** Format energy in Watt-hours. E.g. "2.8 Wh" or "0.84 Wh". */
export function formatEnergy(wh: number): string {
  return `${formatNum(wh)} Wh`;
}

/** Format carbon in grams CO2-equivalent. E.g. "0.84 gCO2e". */
export function formatCarbon(gCO2e: number): string {
  return `${formatNum(gCO2e)} gCO2e`;
}

/** Format water in millilitres. E.g. "3.0 mL" or "0.50 mL". */
export function formatWater(mL: number): string {
  return `${formatNum(mL)} mL`;
}

/** Format a low-high range with a unit. E.g. "[0.50-2.4] Wh". */
export function formatRange(low: number, high: number, unit: string): string {
  return `[${formatNum(low)}-${formatNum(high)}] ${unit}`;
}

/** Format a token count with thousand separators. E.g. 45201 -> "45,201". */
export function formatTokenCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
