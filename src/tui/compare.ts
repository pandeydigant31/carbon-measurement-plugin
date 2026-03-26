/**
 * Model comparison renderer (View 3 from TUI Design Spec section 5).
 *
 * Renders side-by-side energy/carbon bars for Haiku/Sonnet/Opus,
 * savings potential boxes, what-if scenarios, and a key takeaway.
 *
 * Export: renderComparison(data: ComparisonData): string
 *
 * All rendering is pure string computation — no I/O, no stdout.
 */

import type { ModelFamily } from "../types.ts";
import type { ModelComparison } from "../calculator/comparative.ts";
import { C, c, cb, cd, padEnd, padStart, visibleLength } from "./colors.ts";
import {
  progressBar,
  heroBox,
  sectionHeader,
  separator,
} from "./elements.ts";
import { formatEnergy, formatCarbon } from "../utils/formatting.ts";

// ─── Comparison Data Interface ───────────────────────────────────

export interface ComparisonData {
  currentModel: string;
  currentFamily: ModelFamily;
  inputTokens: number;
  outputTokens: number;
  gridCif: number;
  region: string;
  models: ModelComparison[];
  // What-if scenarios
  whatIfs?: WhatIfScenario[];
}

export interface WhatIfScenario {
  label: string;
  description: string;
  currentCO2: number;
  projectedCO2: number;
  changePercent: number;
}

// ─── Color Map Per Model ─────────────────────────────────────────

const MODEL_COLORS: Record<ModelFamily, string> = {
  haiku: C.spring,
  sonnet: C.forest,
  opus: C.amber,
};

const MODEL_LABELS: Record<ModelFamily, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

// ─── Main Renderer ───────────────────────────────────────────────

/**
 * Render the full model comparison view.
 *
 * @param data  Comparison data with model metrics and scenarios
 * @returns     Multi-line ANSI-colored string
 */
export function renderComparison(data: ComparisonData): string {
  const lines: string[] = [];

  lines.push(renderComparisonHeader(data));
  lines.push("");
  lines.push(renderModelBars(data));
  lines.push("");
  lines.push(renderSavingsPotential(data));

  if (data.whatIfs && data.whatIfs.length > 0) {
    lines.push("");
    lines.push(renderWhatIf(data.whatIfs));
  }

  lines.push("");
  lines.push(renderKeyTakeaway(data));
  lines.push("");
  lines.push(renderComparisonFooter());
  lines.push("");

  return lines.join("\n");
}

// ─── Section Renderers ───────────────────────────────────────────

function renderComparisonHeader(data: ComparisonData): string {
  const title = cb(C.forest, "MODEL COMPARISON");
  const underline = c(C.forest, "════════════════");
  const workload = `Workload: ${c(C.white, `${data.inputTokens.toLocaleString("en-US")} input + ${data.outputTokens.toLocaleString("en-US")} output tokens`)}`;
  const gridInfo = `Grid: ${c(C.white, `${data.gridCif.toFixed(2)} kgCO2/kWh`)} ${c(C.gray, `(${data.region})`)}  |  Current model: ${cb(C.white, data.currentModel)}`;

  return heroBox(
    [
      `                ${title}`,
      `                ${underline}`,
      `  ${c(C.gray, workload)}`,
      `  ${c(C.gray, gridInfo)}`,
    ],
    C.forest,
  );
}

function renderModelBars(data: ComparisonData): string {
  const lines: string[] = [];
  lines.push(sectionHeader("ENERGY & CARBON BY MODEL"));
  lines.push(separator(60));

  // Find max values for scaling
  const maxEnergy = Math.max(...data.models.map((m) => m.energy_Wh));
  const maxCarbon = Math.max(...data.models.map((m) => m.co2_gCO2e));

  const barWidth = 22;

  // Column headers
  lines.push("");
  lines.push(
    `    ${padEnd("", 18)}${padEnd(c(C.gray, "Energy"), 30)}${c(C.gray, "Carbon")}`,
  );

  for (const model of data.models) {
    const isCurrent = model.family === data.currentFamily;
    const marker = isCurrent ? cb(C.lime, "*") : " ";
    const label = MODEL_LABELS[model.family];
    const color = MODEL_COLORS[model.family];
    const relLabel = `${model.relativeToBaseline.toFixed(1)}x`;

    // Energy bar
    const energyFrac = maxEnergy > 0 ? model.energy_Wh / maxEnergy : 0;
    const energyBar = makeColoredBar(energyFrac, barWidth, color);

    // Carbon bar
    const carbonFrac = maxCarbon > 0 ? model.co2_gCO2e / maxCarbon : 0;
    const carbonBar = makeColoredBar(carbonFrac, barWidth, color);

    // First line: label + bars
    lines.push("");
    lines.push(
      `  ${marker}${padEnd(c(C.white, label), 10)}${padEnd(c(C.gray, relLabel), 8)}${energyBar}   ${carbonBar}`,
    );
    // Second line: values
    lines.push(
      `    ${padEnd("", 16)}${padEnd(cb(C.white, formatEnergy(model.energy_Wh)), 26)}${cb(C.white, formatCarbon(model.co2_gCO2e))}`,
    );
  }

  // Legend
  lines.push("");
  lines.push(
    `  ${c(C.dimGray, `Legend:  ${c(C.lime, "████")} = your model  |  ${c(C.forest, "████")} = other models  |  ${cb(C.lime, "*")} = current`)}`,
  );

  return lines.join("\n");
}

function renderSavingsPotential(data: ComparisonData): string {
  const lines: string[] = [];
  lines.push(sectionHeader("SAVINGS POTENTIAL"));
  lines.push(separator(60));

  const current = data.models.find((m) => m.family === data.currentFamily);
  if (!current) return lines.join("\n");

  lines.push("");
  lines.push(
    `  ${c(C.gray, `If you switched from ${MODEL_LABELS[data.currentFamily]} to:`)}`,
  );

  const alternatives = data.models.filter(
    (m) => m.family !== data.currentFamily,
  );

  for (const alt of alternatives) {
    const energyDelta =
      ((alt.energy_Wh - current.energy_Wh) / current.energy_Wh) * 100;
    const carbonDelta =
      ((alt.co2_gCO2e - current.co2_gCO2e) / current.co2_gCO2e) * 100;

    const isSaving = energyDelta < 0;
    const deltaColor = isSaving ? C.lime : C.coral;
    const deltaSign = isSaving ? "" : "+";
    const suffix = isSaving ? "upgrade" : "upgrade";

    const boxLabel =
      alt.family === "opus"
        ? `${MODEL_LABELS[alt.family]} (upgrade)`
        : MODEL_LABELS[alt.family];

    const boxWidth = 52;
    const innerWidth = boxWidth - 2;
    const top =
      c(C.forest, "╭── ") +
      cb(C.white, boxLabel) +
      c(C.forest, " " + "─".repeat(Math.max(0, innerWidth - boxLabel.length - 4)) + "╮");
    const bottom = c(C.forest, "╰" + "─".repeat(boxWidth) + "╯");
    const emptyLine = c(C.forest, "│") + " ".repeat(boxWidth) + c(C.forest, "│");

    // Energy comparison line
    const energyLine = `  Energy:  ${formatEnergy(current.energy_Wh)}  ${c(C.white, ">>>")}  ${formatEnergy(alt.energy_Wh)}    (${c(deltaColor, `${deltaSign}${Math.round(energyDelta)}%`)})`;
    const carbonLine = `  Carbon:  ${formatCarbon(current.co2_gCO2e)}  ${c(C.white, ">>>")}  ${formatCarbon(alt.co2_gCO2e)}    (${c(deltaColor, `${deltaSign}${Math.round(carbonDelta)}%`)})`;

    // Before/after bars
    const maxVal = Math.max(current.energy_Wh, alt.energy_Wh);
    const barW = 38;
    const beforeFrac = maxVal > 0 ? current.energy_Wh / maxVal : 0;
    const afterFrac = maxVal > 0 ? alt.energy_Wh / maxVal : 0;
    const beforeBar = `  Before: ${makeColoredBar(beforeFrac, barW, C.forest)}`;
    const afterBar = `  After:  ${makeColoredBar(afterFrac, barW, isSaving ? C.lime : C.coral)}`;

    // Summary
    const co2Diff = Math.abs(alt.co2_gCO2e - current.co2_gCO2e);
    const summaryVerb = isSaving ? "Save" : "Costs";
    const summaryLabel = isSaving
      ? `${summaryVerb} ${formatCarbon(co2Diff)} per session`
      : `${summaryVerb} ${formatCarbon(co2Diff)} more per session`;

    const boxLines = [
      emptyLine,
      makeBoxLine(C.forest, energyLine, boxWidth),
      makeBoxLine(C.forest, carbonLine, boxWidth),
      emptyLine,
      makeBoxLine(C.forest, beforeBar, boxWidth),
      makeBoxLine(C.forest, afterBar, boxWidth),
      emptyLine,
      makeBoxLine(C.forest, `  ${c(deltaColor, summaryLabel)}`, boxWidth),
    ];

    lines.push("");
    lines.push(`  ${top}`);
    for (const bl of boxLines) {
      lines.push(`  ${bl}`);
    }
    lines.push(`  ${bottom}`);
  }

  return lines.join("\n");
}

function renderWhatIf(whatIfs: WhatIfScenario[]): string {
  const lines: string[] = [];
  lines.push(sectionHeader("WHAT-IF SCENARIOS"));
  lines.push(separator(60));

  const barWidth = 30;

  for (let i = 0; i < whatIfs.length; i++) {
    const wf = whatIfs[i]!;
    const isSaving = wf.changePercent < 0;
    const deltaColor: string = isSaving ? C.lime : C.coral;
    const deltaStr = `${isSaving ? "" : "+"}${Math.round(wf.changePercent)}%`;

    lines.push("");
    lines.push(`  ${c(C.white, `${i + 1}. ${wf.label}:`)}`);

    const maxVal = Math.max(wf.currentCO2, wf.projectedCO2);
    const nowFrac = maxVal > 0 ? wf.currentCO2 / maxVal : 0;
    const projFrac = maxVal > 0 ? wf.projectedCO2 / maxVal : 0;

    const boxWidth = 44;
    const top = c(C.dimGray, "┌" + "─".repeat(boxWidth) + "┐");
    const bottom = c(C.dimGray, "└" + "─".repeat(boxWidth) + "┘");

    const nowBar = `  Now:     ${makeColoredBar(nowFrac, barWidth, C.forest)}`;
    const projLabel = wf.description.length > 8 ? wf.description.slice(0, 8) : wf.description;
    const projBar = `  ${padEnd(projLabel + ":", 10)} ${makeColoredBar(projFrac, barWidth, isSaving ? C.spring : C.coral)}`;

    lines.push(`     ${top}`);
    lines.push(
      `     ${makeBoxLineSimple(nowBar, boxWidth)}  ${cb(C.white, formatCarbon(wf.currentCO2))}`,
    );
    lines.push(
      `     ${makeBoxLineSimple(projBar, boxWidth)}  ${cb(C.white, formatCarbon(wf.projectedCO2))}  (${c(deltaColor, deltaStr)})`,
    );
    lines.push(`     ${bottom}`);
  }

  return lines.join("\n");
}

function renderKeyTakeaway(data: ComparisonData): string {
  const lines: string[] = [];
  lines.push(sectionHeader("KEY TAKEAWAY"));
  lines.push(separator(60));

  // Find the most efficient alternative
  const current = data.models.find((m) => m.family === data.currentFamily);
  const cheaper = data.models
    .filter((m) => m.family !== data.currentFamily && m.co2_gCO2e < (current?.co2_gCO2e ?? Infinity))
    .sort((a, b) => a.co2_gCO2e - b.co2_gCO2e);

  let takeawayText: string;
  if (cheaper.length > 0 && cheaper[0]) {
    const best = cheaper[0];
    const savings = current
      ? Math.round(
          ((current.co2_gCO2e - best.co2_gCO2e) / current.co2_gCO2e) * 100,
        )
      : 0;
    takeawayText = `Switching to ${MODEL_LABELS[best.family]} for routine tasks is your biggest lever: -${savings}% carbon per session. Try it for formatting, search, and simple refactors.`;
  } else {
    takeawayText =
      "You're already using the most efficient model for this workload. Consider reducing input context or enabling prompt caching for further savings.";
  }

  const boxInner = 62;
  const top = c(C.lime, "╭" + "─".repeat(boxInner) + "╮");
  const bottom = c(C.lime, "╰" + "─".repeat(boxInner) + "╯");

  // Word-wrap
  const maxLineWidth = boxInner - 4;
  const wrappedLines = wordWrap(takeawayText, maxLineWidth);
  const body = wrappedLines.map(
    (line) =>
      c(C.lime, "│") +
      "  " +
      c(C.white, line) +
      " ".repeat(Math.max(0, boxInner - line.length - 2)) +
      c(C.lime, "│"),
  );

  lines.push("");
  lines.push(`  ${top}`);
  for (const b of body) {
    lines.push(`  ${b}`);
  }
  lines.push(`  ${bottom}`);

  return lines.join("\n");
}

function renderComparisonFooter(): string {
  const lines: string[] = [];
  lines.push(separator());
  lines.push(`  ${cd("Methodology v1.0 | ISO 14040/14044")}`);
  return lines.join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build a colored horizontal bar (single color, no gradient).
 */
function makeColoredBar(
  fraction: number,
  width: number,
  color: string,
): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * width);
  const empty = width - filled;

  let bar = "";
  if (filled > 0) {
    bar += c(color, "█".repeat(filled));
  }
  if (empty > 0) {
    bar += c(C.dimGray, "░".repeat(empty));
  }
  return bar;
}

/**
 * Wrap a content line inside a box border with auto-padding.
 */
function makeBoxLine(
  borderColor: string,
  content: string,
  boxWidth: number,
): string {
  const vl = visibleLength(content);
  const padding = Math.max(0, boxWidth - vl);
  return c(borderColor, "│") + content + " ".repeat(padding) + c(borderColor, "│");
}

/**
 * Simple box line helper using dimGray borders.
 */
function makeBoxLineSimple(content: string, boxWidth: number): string {
  const vl = visibleLength(content);
  const padding = Math.max(0, boxWidth - vl);
  return (
    c(C.dimGray, "│") + content + " ".repeat(padding) + c(C.dimGray, "│")
  );
}

/**
 * Word-wrap text to a given max width.
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
