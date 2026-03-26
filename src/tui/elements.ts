/**
 * Reusable visual elements for the Carbon Measurement Plugin TUI.
 *
 * All functions return strings (no stdout). The caller prints.
 * Uses raw ANSI codes from colors.ts — no external dependencies.
 *
 * Elements:
 *   - sparkline: block-element sparkline (▁▂▃▄▅▆▇█)
 *   - progressBar: green gradient fill bar
 *   - treeIcon: inline tree for statusline
 *   - treeLarge: multi-line tree art (seedling/sapling/full)
 *   - waterDrops: inline water intensity indicator
 *   - carbonGauge: horizontal LOW-MED-HIGH gauge
 *   - heroBox: bordered box with color accent
 *   - tipBox: decision lever card with TIP badge
 *   - sectionHeader: "ENERGY BREAKDOWN    2.89 Wh"
 *   - separator: thin line "───────────────"
 */

import { C, c, cb, cd, padEnd, visibleLength, stripAnsi } from "./colors.ts";

// ─── Constants ───────────────────────────────────────────────────

const SPARK_CHARS = "▁▂▃▄▅▆▇█";
const BLOCK_FULL = "█";
const BLOCK_EMPTY = "░";
const DEFAULT_BAR_WIDTH = 25;
const DEFAULT_BOX_WIDTH = 72;

// Green gradient codes for progress bar fills (dark -> light)
const GREEN_GRADIENT = [
  C.darkGreen,
  C.green28,
  C.forest,
  C.green40,
  C.green46,
  C.lime,
];

// ─── Sparkline ───────────────────────────────────────────────────

/**
 * Block-element sparkline from an array of values.
 * Maps values proportionally to ▁▂▃▄▅▆▇█.
 *
 * @param values  Numeric values to chart
 * @returns       Sparkline string colored in spring green
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  if (max === 0) return c(C.spring, "▁".repeat(values.length));
  const chars = values.map((v) => {
    const idx = Math.round((v / max) * 7);
    return SPARK_CHARS[Math.min(idx, 7)];
  });
  return c(C.spring, chars.join(""));
}

// ─── Progress Bar ────────────────────────────────────────────────

/**
 * Green gradient progress bar.
 * E.g. "████████░░░░░░░░░░░░░░░░░  33%"
 *
 * @param fraction  0.0 to 1.0
 * @param width     Total bar character width (default 25)
 * @returns         Colored bar string
 */
export function progressBar(fraction: number, width: number = DEFAULT_BAR_WIDTH): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * width);
  const empty = width - filled;

  // Build gradient fill
  let bar = "";
  for (let i = 0; i < filled; i++) {
    const gradientIdx = Math.min(
      Math.floor((i / Math.max(filled - 1, 1)) * (GREEN_GRADIENT.length - 1)),
      GREEN_GRADIENT.length - 1,
    );
    bar += `${GREEN_GRADIENT[gradientIdx]}${BLOCK_FULL}`;
  }
  if (filled > 0) bar += C.reset;

  // Empty portion
  if (empty > 0) {
    bar += c(C.dimGray, BLOCK_EMPTY.repeat(empty));
  }

  return bar;
}

// ─── Tree Icon (inline, for statusline) ──────────────────────────

/**
 * Inline tree icon based on growth stage (0-5).
 *
 * Stage 0: .       (no savings)
 * Stage 1: |       (< 5g saved)
 * Stage 2: /|\     (< 20g saved)
 * Stage 3: double slash | double backslash  (< 50g saved)
 * Stage 4: star + stage3 + star  (< 100g saved)
 * Stage 5: same as 4 but bold green  (>= 100g saved)
 */
export function treeIcon(stage: number): string {
  switch (stage) {
    case 0:
      return c(C.spring, ".");
    case 1:
      return c(C.spring, "|");
    case 2:
      return c(C.forest, "/|\\");
    case 3:
      return c(C.forest, "//|\\\\");
    case 4:
      return c(C.lime, "*") + c(C.forest, "//|\\\\") + c(C.lime, "*");
    case 5:
      return cb(C.lime, "*//|\\\\*");
    default:
      return c(C.spring, ".");
  }
}

/**
 * Compute tree stage from cumulative grams CO2 saved (absolute value).
 */
export function treeStageFromSavings(savedGrams: number): number {
  const abs = Math.abs(savedGrams);
  if (abs >= 100) return 5;
  if (abs >= 50) return 4;
  if (abs >= 20) return 3;
  if (abs >= 5) return 2;
  if (abs > 0) return 1;
  return 0;
}

// ─── Tree Large (multi-line art) ─────────────────────────────────

/**
 * Multi-line tree art based on growth stage.
 * Returns an array of lines.
 *
 * Stage 0-1: Seedling
 * Stage 2-3: Sapling
 * Stage 4-5: Full tree
 */
export function treeLarge(stage: number): string[] {
  if (stage <= 1) {
    // Seedling
    return [
      `     ${c(C.lime, ".")}`,
      `    ${c(C.forest, "/|\\")}`,
      `     ${c(C.brown, "|")}`,
    ];
  }
  if (stage <= 3) {
    // Sapling
    return [
      `      ${c(C.lime, "*")}`,
      `     ${c(C.lime, "/|\\")}`,
      `    ${c(C.forest, "/ | \\")}`,
      `   ${c(C.forest, "/  |  \\")}`,
      `      ${c(C.brown, "|")}`,
    ];
  }
  // Full tree
  return [
    `      ${c(C.lime, "/\\")}`,
    `     ${c(C.lime, "/  \\")}`,
    `    ${c(C.forest, "/    \\")}`,
    `   ${c(C.forest, "/ /  \\ \\")}`,
    `  ${c(C.forest, "/  /  \\  \\")}`,
    `      ${c(C.brown, "||")}`,
    `      ${c(C.brown, "||")}`,
  ];
}

/**
 * Multi-line forest visualization for cumulative savings.
 * Each full tree represents ~60g CO2e saved; sprouts are partial progress.
 *
 * @param totalSavedGrams  Total cumulative grams saved (positive)
 * @param gramsPerTree     Grams per full tree (default 60)
 * @returns                Array of lines composing the forest
 */
export function forest(totalSavedGrams: number, gramsPerTree: number = 60): string[] {
  const fullTrees = Math.floor(totalSavedGrams / gramsPerTree);
  const remainder = totalSavedGrams % gramsPerTree;
  const sprouts = remainder > 0 ? 1 : 0;

  if (fullTrees === 0 && sprouts === 0) {
    return [`    ${c(C.dimGray, "(plant your first tree by saving CO2)")}`];
  }

  // Build each tree/sprout as column of lines
  const TREE_ART = [
    `   ${c(C.lime, "/\\")}   `,
    `  ${c(C.lime, "/  \\")}  `,
    ` ${c(C.forest, "/ /\\ \\")} `,
    `${c(C.forest, "/ /  \\ \\")}`,
    `   ${c(C.brown, "||")}   `,
  ];

  const SPROUT_ART = [
    `  ${c(C.spring, ".")}  `,
    ` ${c(C.spring, "/|\\")} `,
    `  ${c(C.brown, "|")}  `,
  ];

  // Align all columns to max height
  const maxHeight = TREE_ART.length;
  const columns: string[][] = [];

  for (let i = 0; i < Math.min(fullTrees, 5); i++) {
    columns.push(TREE_ART);
  }
  for (let i = 0; i < Math.min(sprouts, 3); i++) {
    // Pad sprout to same height
    const padded = Array(maxHeight - SPROUT_ART.length)
      .fill("     ")
      .concat(SPROUT_ART);
    columns.push(padded);
  }

  if (columns.length === 0) return [];

  // Merge columns side-by-side
  const result: string[] = [];
  for (let row = 0; row < maxHeight; row++) {
    const line = columns.map((col) => col[row] ?? "        ").join("  ");
    result.push(`  ${line}`);
  }

  // Add labels below
  const labels: string[] = [];
  for (let i = 0; i < Math.min(fullTrees, 5); i++) {
    labels.push(padEnd(`  tree  `, 10));
  }
  for (let i = 0; i < Math.min(sprouts, 3); i++) {
    labels.push(padEnd(` sprout `, 7));
  }
  result.push(`  ${c(C.dimGray, labels.join("  "))}`);

  if (fullTrees > 5) {
    result.push(`  ${c(C.dimGray, `  ...and ${fullTrees - 5} more trees`)}`);
  }

  return result;
}

// ─── Water Drops ─────────────────────────────────────────────────

/**
 * Inline water intensity indicator.
 *
 * 0 mL:    -
 * < 1 mL:  ~
 * 1-3 mL:  ~~
 * 3-5 mL:  ~~~
 * > 5 mL:  ~~~~
 */
export function waterDrops(mL: number): string {
  if (mL <= 0) return c(C.dimGray, "-");
  if (mL < 1) return c(C.waterBlue, "~");
  if (mL <= 3) return c(C.waterBlue, "~~");
  if (mL <= 5) return c(C.waterBlue, "~~~");
  return c(C.waterBlue, "~~~~");
}

/**
 * Multi-line water drop art for the dashboard.
 */
export function waterDropArt(mL: number): string[] {
  if (mL <= 2) {
    return [
      `      ${c(C.waterBlue, ",")}`,
      `     ${c(C.waterBlue, "( )")}`,
      `      ${c(C.waterBlue, "'")}`,
    ];
  }
  if (mL <= 5) {
    return [
      `      ${c(C.waterBlue, ",")}       ${c(C.waterBlue, ",")}`,
      `     ${c(C.waterBlue, "( )")}     ${c(C.waterBlue, "( )")}`,
      `      ${c(C.waterBlue, "'")}       ${c(C.waterBlue, "'")}`,
    ];
  }
  return [
    `      ${c(C.waterBlue, ",")}   ${c(C.waterBlue, ",")}   ${c(C.waterBlue, ",")}`,
    `     ${c(C.waterBlue, "( )")} ${c(C.waterBlue, "( )")} ${c(C.waterBlue, "( )")}`,
    `      ${c(C.waterBlue, "'")}   ${c(C.waterBlue, "'")}   ${c(C.waterBlue, "'")}`,
  ];
}

// ─── Carbon Gauge ────────────────────────────────────────────────

/**
 * Horizontal carbon intensity gauge.
 *
 * LOW                    MED                    HIGH
 *  [################>                               ]   0.12 kgCO2/kWh
 *
 * @param cif     Current grid carbon intensity factor (kgCO2/kWh)
 * @param maxCif  Maximum on gauge (default 0.8)
 * @param width   Gauge character width (default 40)
 */
export function carbonGauge(cif: number, maxCif: number = 0.8, width: number = 40): string {
  const fraction = Math.max(0, Math.min(1, cif / maxCif));
  const pos = Math.round(fraction * (width - 1));

  // Determine color based on intensity
  let pointerColor: string = C.lime;
  if (cif > 0.5) pointerColor = C.softRed;
  else if (cif > 0.25) pointerColor = C.amber;

  // Label line
  const labelLine =
    c(C.lime, "LOW") +
    " ".repeat(Math.floor(width / 3) - 2) +
    c(C.amber, "MED") +
    " ".repeat(Math.floor(width / 3) - 2) +
    c(C.softRed, "HIGH");

  // Build gauge bar
  let bar = c(C.dimGray, "[");
  for (let i = 0; i < width; i++) {
    if (i === pos) {
      bar += c(pointerColor, ">");
    } else if (i < pos) {
      // Color changes across the bar: green -> amber -> red
      let segColor: string = C.lime;
      if (i > (width * 2) / 3) segColor = C.softRed;
      else if (i > width / 3) segColor = C.amber;
      bar += c(segColor, "#");
    } else {
      bar += c(C.dimGray, " ");
    }
  }
  bar += c(C.dimGray, "]");

  const valueStr = `   ${cb(C.white, cif.toFixed(2))} ${c(C.gray, "kgCO2/kWh")}`;

  return `  ${labelLine}\n  ${bar}${valueStr}`;
}

// ─── Hero Box ────────────────────────────────────────────────────

/**
 * Bordered hero box with color accent.
 * Uses Unicode box-drawing characters.
 *
 * @param lines   Array of lines to display inside
 * @param color   Border color (default: forest green)
 * @returns       Multi-line string
 */
export function heroBox(lines: string[], color: string = C.forest): string {
  const innerWidth = DEFAULT_BOX_WIDTH - 2; // minus left + right borders

  // Compute max visible width needed
  let maxVisible = 0;
  for (const line of lines) {
    const vl = visibleLength(line);
    if (vl > maxVisible) maxVisible = vl;
  }
  const boxInner = Math.max(innerWidth, maxVisible + 4);

  const top = c(color, "╭" + "─".repeat(boxInner) + "╮");
  const bottom = c(color, "╰" + "─".repeat(boxInner) + "╯");

  const body = lines.map((line) => {
    const padding = boxInner - visibleLength(line) - 2;
    return (
      c(color, "│") +
      "  " +
      line +
      " ".repeat(Math.max(0, padding)) +
      c(color, "│")
    );
  });

  // Empty line padding
  const emptyLine =
    c(color, "│") + " ".repeat(boxInner) + c(color, "│");

  return [top, emptyLine, ...body, emptyLine, bottom].join("\n");
}

// ─── Tip Box ─────────────────────────────────────────────────────

/**
 * Decision lever card with TIP badge.
 *
 * ╭─ TIP ──────────────────────────────────────────────────────────╮
 * │  Using Haiku for simple tasks would save ~60% energy.          │
 * ╰────────────────────────────────────────────────────────────────╯
 */
export function tipBox(text: string): string {
  const innerWidth = DEFAULT_BOX_WIDTH - 2;
  const badge = cb(C.lime, " TIP ");
  const topLineAfterBadge = "─".repeat(
    Math.max(0, innerWidth - visibleLength(badge) - 3),
  );
  const top =
    c(C.forest, "╭─") +
    badge +
    c(C.forest, " " + topLineAfterBadge + "╮");
  const bottom = c(C.forest, "╰" + "─".repeat(innerWidth) + "╯");

  // Word-wrap the text into lines that fit
  const maxLineWidth = innerWidth - 4; // 2 padding each side
  const words = text.split(" ");
  const wrappedLines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxLineWidth) {
      wrappedLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  }
  if (currentLine) wrappedLines.push(currentLine);

  const body = wrappedLines.map((line) => {
    const padding = innerWidth - line.length - 2;
    return (
      c(C.forest, "│") +
      "  " +
      c(C.white, line) +
      " ".repeat(Math.max(0, padding)) +
      c(C.forest, "│")
    );
  });

  return [top, ...body, bottom].join("\n");
}

// ─── Section Header ──────────────────────────────────────────────

/**
 * Section header with optional right-aligned value.
 *
 * "  ENERGY BREAKDOWN                              2.89 Wh"
 */
export function sectionHeader(title: string, value?: string): string {
  const titleStr = cb(C.emerald, title);
  if (!value) return `\n  ${titleStr}`;

  const rightStr = cb(C.white, value);
  const totalWidth = DEFAULT_BOX_WIDTH;
  const padding = totalWidth - visibleLength(titleStr) - visibleLength(rightStr) - 4;
  return `\n  ${titleStr}${" ".repeat(Math.max(2, padding))}${rightStr}`;
}

// ─── Separator ───────────────────────────────────────────────────

/**
 * Thin horizontal separator line.
 */
export function separator(width: number = DEFAULT_BOX_WIDTH - 4): string {
  return `  ${c(C.dimGray, "─".repeat(width))}`;
}

// ─── Equivalency Icons ──────────────────────────────────────────

const EQUIV_ICONS: Record<string, string> = {
  Driving: "=D-",
  "Phone charge": "[|]",
  Coffee: "c[_]",
  Netflix: "[>]",
  "Google searches": "(?)",
  "LED bulb": "(*)",
  Breathing: "(o)",
};

/**
 * Get the inline ASCII icon for an equivalency activity.
 */
export function equivalencyIcon(activity: string): string {
  return EQUIV_ICONS[activity] ?? "   ";
}
