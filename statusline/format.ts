/**
 * Formatting utilities for the statusline display.
 * Compact and detailed formats per PROMPT.md §7.2 and design.md spec.
 *
 * Rounding rules (design.md):
 *   - Values > 1: 1 decimal place
 *   - Values < 1: 2 decimal places
 *   - Zero: "0"
 *
 * Unit spacing: always a space before unit (ISO convention).
 * Unmeasured values: shown as "--" not "0".
 */

// ─── Core Formatters (single source of truth) ───────────────────

function formatNum(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1) return `${sign}${abs.toFixed(1)}`;
  return `${sign}${abs.toFixed(2)}`;
}

export function formatWh(wh: number): string {
  if (wh < 0.001) return `${(wh * 1000).toFixed(1)} mWh`;
  return `${formatNum(wh)} Wh`;
}

export function formatGrams(g: number): string {
  return `${formatNum(g)} g`;
}

export function formatML(ml: number): string {
  return `${formatNum(ml)} mL`;
}

export function formatRange(low: number, high: number): string {
  return `${formatNum(low)}-${formatNum(high)} g`;
}

// ─── Statusline Data ─────────────────────────────────────────────

export interface StatuslineData {
  co2Total_g: number | null; // null = unmeasured
  co2Low_g: number | null;
  co2High_g: number | null;
  co2Operational_g: number | null;
  co2Embodied_g: number | null;
  co2Network_g: number | null;
  energyTotal_Wh: number | null;
  waterTotal_mL: number | null;
  netImpact_g: number | null;
  keyDriver: string | null;        // e.g. "GPU utilization"
  keyDriverFraction: number | null; // 0-1, variance fraction
}

function dash(value: number | null, formatter: (v: number) => string): string {
  if (value === null || value === undefined) return "--";
  return formatter(value);
}

/**
 * Compact statusline (< 65 chars):
 *   CO2: ~1.2 g [0.5-2.4 g] | E: 2.9 Wh | W: 3 mL
 *
 * The ~ prefix signals all estimates are uncertain (design.md line 147).
 * With net impact (Phase 3+):
 *   CO2: ~1.2 g [net -44 g saved] | E: 2.9 Wh | W: 3 mL
 */
export function formatCompact(data: StatuslineData): string {
  const parts: string[] = [];

  // CO2 with ~ prefix (all estimates are uncertain) and net impact as hero number
  const co2 = data.co2Total_g !== null ? `~${formatGrams(data.co2Total_g)}` : "--";
  if (data.netImpact_g !== null && data.co2Total_g !== null) {
    // Net impact is always shown when available (hero number per design.md)
    if (data.netImpact_g < 0) {
      parts.push(`CO2: ${co2} [net ${formatGrams(Math.abs(data.netImpact_g))} saved]`);
    } else {
      parts.push(`CO2: ${co2} [net +${formatGrams(data.netImpact_g)} added]`);
    }
  } else if (data.co2Low_g !== null && data.co2High_g !== null && data.co2Total_g !== null) {
    // Fallback to uncertainty range if net impact not yet computed
    parts.push(`CO2: ${co2} [${formatRange(data.co2Low_g, data.co2High_g)}]`);
  } else {
    parts.push(`CO2: ${co2}`);
  }

  // Energy (always shown)
  parts.push(`E: ${dash(data.energyTotal_Wh, formatWh)}`);

  // Water
  parts.push(`W: ${dash(data.waterTotal_mL, formatML)}`);

  return parts.join(" | ");
}

/**
 * Detailed statusline (< 120 chars per line):
 *   Scope2: 0.9 g + Embodied: 0.2 g + Network: 0.1 g = 1.2 g CO2e [90%CI: 0.5-2.4 g]
 *   Energy: 4.1 Wh | Water: 3 mL | Saved ~45 g human CO2
 */
export function formatDetailed(data: StatuslineData): string {
  const scope2 = dash(data.co2Operational_g, formatGrams);
  const embodied = dash(data.co2Embodied_g, formatGrams);
  const network = dash(data.co2Network_g, formatGrams);
  const total = dash(data.co2Total_g, formatGrams);

  let line1 = `Scope2: ${scope2} + Embodied: ${embodied} + Network: ${network} = ~${total} CO2e`;
  if (data.co2Low_g !== null && data.co2High_g !== null) {
    const ciRange = `90%CI: ${formatRange(data.co2Low_g, data.co2High_g)}`;
    if (data.keyDriver) {
      line1 += ` [${ciRange}, driven by ${data.keyDriver}]`;
    } else {
      line1 += ` [${ciRange}]`;
    }
  }

  const line2Parts = [
    `Energy: ${dash(data.energyTotal_Wh, formatWh)}`,
    `Water: ${dash(data.waterTotal_mL, formatML)}`,
  ];
  if (data.netImpact_g !== null && data.netImpact_g < 0) {
    line2Parts.push(`Saved ~${formatGrams(Math.abs(data.netImpact_g))} human CO2`);
  }

  return `${line1}\n${line2Parts.join(" | ")}`;
}
