/**
 * Session dashboard renderer (View 2 from TUI Design Spec section 4).
 *
 * Replaces plain-text /carbon:report with a rich, ANSI-colored dashboard.
 *
 * Export: renderDashboard(data: DashboardData): string
 *
 * All rendering is pure string computation — no I/O, no stdout.
 * Uses raw ANSI codes from colors.ts and visual elements from elements.ts.
 */

import type { EnergyBreakdown, CarbonResult, WaterResult } from "../types.ts";
import type {
  HumanHoursSaved,
  Equivalency,
  DecisionLever,
  ModelComparison,
} from "../calculator/comparative.ts";
import { C, c, cb, cd, padEnd, visibleLength } from "./colors.ts";
import {
  sparkline,
  progressBar,
  treeIcon,
  treeLarge,
  treeStageFromSavings,
  forest,
  waterDropArt,
  waterDrops,
  carbonGauge,
  heroBox,
  tipBox,
  sectionHeader,
  separator,
  equivalencyIcon,
} from "./elements.ts";
import {
  formatEnergy,
  formatCarbon,
  formatWater,
  formatRange,
  formatTokenCount,
} from "../utils/formatting.ts";

// ─── Dashboard Data Interface ────────────────────────────────────

export interface DashboardData {
  sessionId: string;
  duration: string;
  model: string;
  // Tokens
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  // Energy
  energy: EnergyBreakdown;
  energyLow: number;
  energyHigh: number;
  // Carbon
  carbon: CarbonResult;
  carbonLow: number;
  carbonHigh: number;
  keyDriver: string;
  keyDriverFraction: number;
  // Water
  water: WaterResult;
  // Comparative
  netImpact: HumanHoursSaved;
  equivalencies: Equivalency[];
  decisionLevers: DecisionLever[];
  // Model comparison
  modelComparison?: ModelComparison[];
  // History
  perRequestCO2?: number[];
  cumulativeSaved?: number;
}

// ─── Main Renderer ───────────────────────────────────────────────

/**
 * Render the full session dashboard.
 *
 * @param data  All computed metrics for the session
 * @returns     Multi-line ANSI-colored string
 */
export function renderDashboard(data: DashboardData): string {
  const lines: string[] = [];

  lines.push(renderHeader(data));
  lines.push("");
  lines.push(renderNetImpact(data));
  lines.push("");
  lines.push(renderTokens(data));
  lines.push("");
  lines.push(renderEnergy(data));
  lines.push("");
  lines.push(renderCarbon(data));
  lines.push("");
  lines.push(renderWaterSection(data));
  lines.push("");
  lines.push(renderComparative(data));
  lines.push("");
  lines.push(renderDecisionLevers(data));
  lines.push("");
  lines.push(renderForest(data));
  lines.push("");
  lines.push(renderFooter(data));
  lines.push("");

  return lines.join("\n");
}

// ─── Section Renderers ───────────────────────────────────────────

function renderHeader(data: DashboardData): string {
  const title = cb(C.forest, "SESSION CARBON REPORT");
  const underline = c(C.forest, "═══════════════════");
  const meta = [
    `Session: ${c(C.white, data.sessionId.slice(0, 7))}`,
    `Duration: ${c(C.white, data.duration)}`,
    `Model: ${c(C.white, data.model)}`,
  ].join("  |  ");

  return heroBox(
    [
      `                ${title}`,
      `                ${underline}`,
      `  ${c(C.gray, meta)}`,
    ],
    C.forest,
  );
}

function renderNetImpact(data: DashboardData): string {
  const net = data.netImpact;
  const saved = net.netImpact_g < 0;
  const accentColor = saved ? C.lime : C.coral;
  const label = saved ? "saved" : "added";
  const absNet = Math.abs(net.netImpact_g);

  const mainLine = `     NET IMPACT:  ${cb(accentColor, `${absNet.toFixed(1)} g CO2e ${label}`)}`;
  const subLine = `  vs. doing this work manually (est.)`;

  const details = [
    mainLine,
    c(C.gray, subLine),
    "",
    `  AI session:     ${cb(C.white, `~${formatCarbon(data.carbon.total_gCO2e)}`)}`,
    `  Human alt:     ${cb(C.white, `~${formatCarbon(net.humanCO2_g)}`)} ${c(C.gray, `(${net.commuteMode} commute)`)}`,
    `  You ${label}:      ${cb(accentColor, `${absNet.toFixed(1)} gCO2e`)}`,
    `  Confidence:     ${c(C.gray, `${net.confidence} (est. ${net.estimatedHours.toFixed(1)} dev-hours)`)}`,
  ];

  return heroBox(details, saved ? C.forest : C.coral);
}

function renderTokens(data: DashboardData): string {
  const lines: string[] = [];
  lines.push(sectionHeader("TOKENS"));
  lines.push(separator());

  const totalTokens =
    data.inputTokens + data.outputTokens + data.cacheCreationTokens;

  const cacheNote =
    data.cacheReadTokens > 0
      ? ` (incl. ${formatTokenCount(data.cacheReadTokens)} cache-read)`
      : "";

  lines.push(
    `    ${c(C.gray, "Input:")}   ${cb(C.white, formatTokenCount(data.inputTokens))}${c(C.gray, cacheNote)}`,
  );
  lines.push(
    `    ${c(C.gray, "Output:")}  ${cb(C.white, formatTokenCount(data.outputTokens))}`,
  );
  if (data.cacheCreationTokens > 0) {
    lines.push(
      `    ${c(C.gray, "Cache:")}   ${cb(C.white, formatTokenCount(data.cacheCreationTokens))} ${c(C.gray, "created")}`,
    );
  }
  lines.push(
    `    ${c(C.gray, "Total:")}   ${cb(C.white, formatTokenCount(totalTokens))} ${c(C.gray, "tokens processed")}`,
  );

  return lines.join("\n");
}

function renderEnergy(data: DashboardData): string {
  const lines: string[] = [];
  const e = data.energy;

  lines.push(sectionHeader("ENERGY BREAKDOWN", formatEnergy(e.total_Wh)));
  lines.push(separator());

  // Compute percentages relative to total (excluding negative cache)
  const positiveTotal =
    e.prefill_Wh + e.decode_Wh + e.kvCache_Wh + e.network_Wh + e.embodied_Wh;
  const maxComponent = Math.max(
    e.prefill_Wh,
    e.decode_Wh,
    e.kvCache_Wh,
    e.network_Wh,
    e.embodied_Wh,
  );

  const components = [
    { label: "Processing input (prefill)", value: e.prefill_Wh },
    { label: "Generating response (decode)", value: e.decode_Wh },
    { label: "Memory overhead (KV-cache)", value: e.kvCache_Wh },
  ];

  for (const comp of components) {
    const pct =
      positiveTotal > 0
        ? Math.round((comp.value / positiveTotal) * 100)
        : 0;
    const fraction = maxComponent > 0 ? comp.value / positiveTotal : 0;
    lines.push(
      `    ${padEnd(c(C.gray, comp.label), 42)}${padEnd(cb(C.white, formatEnergy(comp.value)), 20)}${progressBar(fraction)}  ${c(C.gray, `${pct}%`)}`,
    );
  }

  // Cache savings (negative or zero)
  if (e.cacheOps_Wh < 0) {
    lines.push(
      `    ${padEnd(c(C.gray, "Cache efficiency"), 42)}${padEnd(cb(C.lime, formatEnergy(e.cacheOps_Wh)), 20)}${c(C.lime, "saved by prompt caching")}`,
    );
  }

  // Network
  if (e.network_Wh > 0) {
    lines.push(
      `    ${padEnd(c(C.gray, "Network"), 42)}${padEnd(cb(C.white, formatEnergy(e.network_Wh)), 20)}${c(C.dimGray, "~negligible")}`,
    );
  }

  // Separator + total
  lines.push(`    ${"".padEnd(36)}${c(C.dimGray, "─────")}`);
  lines.push(
    `    ${padEnd(c(C.gray, "Total"), 42)}${cb(C.white, formatEnergy(e.total_Wh))}  ${c(C.gray, formatRange(data.energyLow, data.energyHigh, "Wh"))}`,
  );

  // LED equivalency
  const ledMinutes = (e.total_Wh / 10) * 60; // 10W LED
  lines.push("");
  lines.push(
    `    ${c(C.dimGray, "==")} ${c(C.white, `powering a 10W LED for ${Math.round(ledMinutes)} minutes`)}`,
  );

  return lines.join("\n");
}

function renderCarbon(data: DashboardData): string {
  const lines: string[] = [];
  const carbon = data.carbon;

  lines.push(
    sectionHeader("CARBON FOOTPRINT", `~${formatCarbon(carbon.total_gCO2e)}`),
  );
  lines.push(separator());

  // Breakdown box
  const total = carbon.total_gCO2e || 1;
  const scope2Pct = Math.round((carbon.operational_gCO2e / total) * 100);
  const embodiedPct = Math.round((carbon.embodied_gCO2e / total) * 100);
  const networkPct = Math.round((carbon.network_gCO2e / total) * 100);

  lines.push("");
  lines.push(`    ${c(C.gray, "Breakdown:")}`);

  // Box with bars
  const boxWidth = 52;
  lines.push(`    ${c(C.forest, "╭" + "─".repeat(boxWidth) + "╮")}`);

  const barWidth = 15;
  const scope2Bar = progressBar(scope2Pct / 100, barWidth);
  const embodiedBar = progressBar(embodiedPct / 100, barWidth);
  const networkBar = progressBar(networkPct / 100, barWidth);

  const scope2Line = `  ${padEnd(c(C.gray, "Operational (Scope 2)"), 30)}${scope2Bar}  ${c(C.gray, `${scope2Pct}%`)}`;
  const embodiedLine = `  ${padEnd(c(C.gray, "Embodied (Scope 3)"), 30)}${embodiedBar}  ${c(C.gray, `${embodiedPct}%`)}`;
  const networkLine = `  ${padEnd(c(C.gray, "Network"), 30)}${networkBar}  ${c(C.gray, `${networkPct}%`)}`;

  lines.push(`    ${c(C.forest, "│")}${scope2Line}   ${c(C.forest, "│")}`);
  lines.push(`    ${c(C.forest, "│")}${embodiedLine}   ${c(C.forest, "│")}`);
  lines.push(`    ${c(C.forest, "│")}${networkLine}   ${c(C.forest, "│")}`);
  lines.push(`    ${c(C.forest, "╰" + "─".repeat(boxWidth) + "╯")}`);

  // Detailed values
  lines.push("");
  lines.push(
    `    ${padEnd(c(C.gray, "Scope 2 (electricity):"), 30)}${cb(C.white, formatCarbon(carbon.operational_gCO2e))}`,
  );
  lines.push(
    `    ${padEnd(c(C.gray, "Embodied (hardware):"), 30)}${cb(C.white, formatCarbon(carbon.embodied_gCO2e))}`,
  );
  lines.push(
    `    ${padEnd(c(C.gray, "Network:"), 30)}${cb(C.white, formatCarbon(carbon.network_gCO2e))}`,
  );
  lines.push(`    ${"".padEnd(24)}${c(C.dimGray, "──────────")}`);
  lines.push(
    `    ${padEnd(c(C.gray, "Total:"), 30)}${cb(C.white, `~${formatCarbon(carbon.total_gCO2e)}`)}  ${c(C.gray, formatRange(data.carbonLow, data.carbonHigh, "gCO2e"))}`,
  );

  // Grid info
  lines.push("");
  lines.push(
    `    ${c(C.gray, "Grid:")} ${cb(C.white, carbon.gridCif_kgPerKWh.toFixed(2))} ${c(C.gray, `kgCO2/kWh (${carbon.regionInferred}, ${carbon.gridCifSource})`)}`,
  );
  lines.push(
    `    ${c(C.gray, "PUE:")}  ${cb(C.white, carbon.pueUsed.toFixed(1))}`,
  );

  // Key uncertainty
  if (data.keyDriver) {
    lines.push(
      `    ${c(C.gray, "Key uncertainty:")} ${c(C.white, `${data.keyDriver} (contributes ${Math.round(data.keyDriverFraction * 100)}% of variance)`)}`,
    );
  }

  return lines.join("\n");
}

function renderWaterSection(data: DashboardData): string {
  const lines: string[] = [];
  const w = data.water;

  lines.push(sectionHeader("WATER", formatWater(w.total_mL)));
  lines.push(separator());

  // Water drop art on the left, values on the right
  const dropArt = waterDropArt(w.total_mL);
  const valueLines = [
    `Direct (cooling):        ${cb(C.waterBlue, formatWater(w.direct_mL))}`,
    `Indirect (electricity):  ${cb(C.waterBlue, formatWater(w.indirect_mL))}`,
    `Total:                   ${cb(C.waterBlue, formatWater(w.total_mL))}`,
  ];

  // Merge art and values side by side
  const maxLines = Math.max(dropArt.length, valueLines.length);
  for (let i = 0; i < maxLines; i++) {
    const art = i < dropArt.length ? dropArt[i] : "        ";
    const val = i < valueLines.length ? `   ${valueLines[i]}` : "";
    lines.push(`    ${art}${val}`);
  }

  // Sip equivalency
  const sips = w.total_mL / 240; // ~240 mL per sip (actually per cup, but design says "sip")
  lines.push("");
  lines.push(
    `    ${c(C.dimGray, "==")} ${c(C.white, `about 1/${Math.round(1 / sips)} of a sip of water`)}`,
  );

  return lines.join("\n");
}

function renderComparative(data: DashboardData): string {
  const lines: string[] = [];

  lines.push(sectionHeader("COMPARATIVE CONTEXT"));
  lines.push(separator());
  lines.push(
    `    ${c(C.gray, "Your session's carbon footprint is equivalent to:")}`,
  );
  lines.push("");

  for (const eq of data.equivalencies) {
    const icon = equivalencyIcon(eq.activity);
    const amount = formatEquivAmount(eq.amount, eq.unit);
    lines.push(
      `    ${c(C.white, icon)}   ${cb(C.white, amount)} ${c(C.gray, eq.description)}`,
    );
  }

  // Per-request sparkline if available
  if (data.perRequestCO2 && data.perRequestCO2.length > 0) {
    lines.push("");
    lines.push(
      `    ${c(C.gray, "Per-request CO2:")} ${sparkline(data.perRequestCO2)}`,
    );
  }

  return lines.join("\n");
}

function renderDecisionLevers(data: DashboardData): string {
  if (data.decisionLevers.length === 0) return "";

  const lines: string[] = [];
  lines.push(sectionHeader("DECISION LEVERS"));
  lines.push(separator());

  for (const lever of data.decisionLevers) {
    let tipText = lever.recommendation;
    if (lever.category === "model") {
      tipText += " Try: /carbon:compare";
    }
    lines.push(`  ${tipBox(tipText)}`);
  }

  return lines.join("\n");
}

function renderForest(data: DashboardData): string {
  const lines: string[] = [];
  lines.push(sectionHeader("YOUR FOREST (cumulative impact)"));
  lines.push(separator());

  const sessionSaved = Math.abs(data.netImpact.netImpact_g);
  const totalSaved = data.cumulativeSaved ?? sessionSaved;

  // Side-by-side: this session vs all sessions
  lines.push("");
  lines.push(
    `    ${padEnd(c(C.gray, "This session:"), 30)}${c(C.gray, "All sessions:")}`,
  );
  lines.push("");

  const sessionStage = treeStageFromSavings(sessionSaved);
  const sessionTree = treeLarge(sessionStage);

  const allForest = forest(totalSaved);

  const maxLines = Math.max(sessionTree.length, allForest.length);
  for (let i = 0; i < maxLines; i++) {
    const left = (i < sessionTree.length ? sessionTree[i] : "") ?? "";
    const right = (i < allForest.length ? allForest[i] : "") ?? "";
    lines.push(`    ${padEnd(left, 30)}${right}`);
  }

  // Labels
  lines.push("");
  const sessionTrees = Math.max(1, Math.floor(sessionSaved / 60));
  const totalTrees = Math.max(1, Math.floor(totalSaved / 60));
  lines.push(
    `    ${padEnd(c(C.gray, `${sessionTrees} tree${sessionTrees !== 1 ? "s" : ""}`), 30)}${c(C.gray, `${totalTrees} tree${totalTrees !== 1 ? "s" : ""}`)}`,
  );
  lines.push(
    `    ${padEnd(c(C.lime, `(-${sessionSaved.toFixed(0)}g saved)`), 30)}${c(C.lime, `(-${totalSaved.toFixed(0)}g saved total)`)}`,
  );

  return lines.join("\n");
}

function renderFooter(data: DashboardData): string {
  const lines: string[] = [];
  lines.push(separator());

  const parts = [
    "Methodology v1.0",
    "ISO 14040/14044",
    "Benchmarks: 2026-03-15",
  ];
  lines.push(`  ${cd(parts.join(" | "))}`);

  if (data.keyDriver) {
    lines.push(
      `  ${cd(`Key uncertainty: ${data.keyDriver} (${Math.round(data.keyDriverFraction * 100)}% of variance)`)}`,
    );
  }

  return lines.join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatEquivAmount(amount: number, unit: string): string {
  if (unit === "meters") {
    return `${amount.toFixed(1)} ${unit}`;
  }
  if (unit === "%") {
    return `${amount.toFixed(1)}%`;
  }
  if (unit === "minutes") {
    return `${amount.toFixed(1)} ${unit}`;
  }
  if (unit === "searches") {
    return `${amount.toFixed(0)} ${unit}`;
  }
  if (unit === "cups") {
    return `${amount.toFixed(2)} ${unit}`;
  }
  return `${amount.toFixed(1)} ${unit}`;
}
