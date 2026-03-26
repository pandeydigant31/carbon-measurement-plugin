/**
 * Trend view renderer (View 4 from TUI Design Spec section 6).
 *
 * Renders session-over-session sparkline, cumulative savings counter,
 * weekly averages, and a growing forest visualization.
 *
 * Export: renderTrend(sessions: TrendSession[]): string
 *
 * All rendering is pure string computation — no I/O, no stdout.
 */

import { C, c, cb, cd, padEnd, padStart } from "./colors.ts";
import {
  sparkline,
  progressBar,
  forest,
  sectionHeader,
  separator,
  heroBox,
} from "./elements.ts";
import { formatCarbon } from "../utils/formatting.ts";

// ─── Trend Data Interface ────────────────────────────────────────

export interface TrendSession {
  sessionId: string;
  date: string; // ISO date string (YYYY-MM-DD or full ISO)
  co2_gCO2e: number; // total session CO2
  netSaved_g: number; // net impact (negative = saved)
  model: string;
}

// ─── Main Renderer ───────────────────────────────────────────────

/**
 * Render the full trend view.
 *
 * @param sessions  Array of past sessions, oldest first
 * @returns         Multi-line ANSI-colored string
 */
export function renderTrend(sessions: TrendSession[]): string {
  if (sessions.length === 0) {
    return heroBox(
      [
        `  ${cb(C.forest, "CARBON TREND")}`,
        "",
        `  ${c(C.gray, "No sessions recorded yet.")}`,
        `  ${c(C.gray, "Complete a coding session to see your trend.")}`,
      ],
      C.forest,
    );
  }

  const lines: string[] = [];

  lines.push(renderTrendHeader(sessions));
  lines.push("");
  lines.push(renderSessionChart(sessions));
  lines.push("");
  lines.push(renderCumulative(sessions));
  lines.push("");
  lines.push(renderWeeklyAverages(sessions));
  lines.push("");
  lines.push(renderTrendForest(sessions));
  lines.push("");
  lines.push(renderTrendFooter(sessions));
  lines.push("");

  return lines.join("\n");
}

// ─── Section Renderers ───────────────────────────────────────────

function renderTrendHeader(sessions: TrendSession[]): string {
  const totalSaved = Math.abs(
    sessions.reduce((sum, s) => sum + s.netSaved_g, 0),
  );
  const daySpan = computeDaySpan(sessions);

  const title = cb(C.forest, "CARBON TREND");
  const underline = c(C.forest, "════════════");

  return heroBox(
    [
      `                ${title}`,
      `                ${underline}`,
      `  ${c(C.gray, `Last ${sessions.length} sessions`)}  |  ${c(C.gray, `${daySpan}-day window`)}  |  ${c(C.gray, "Total:")} ${cb(C.lime, `${totalSaved.toFixed(0)}g CO2e saved`)}`,
    ],
    C.forest,
  );
}

function renderSessionChart(sessions: TrendSession[]): string {
  const lines: string[] = [];
  lines.push(sectionHeader("SESSION CO2 OVER TIME (gCO2e per session)"));
  lines.push(separator(60));

  const values = sessions.map((s) => s.co2_gCO2e);
  const max = Math.max(...values);
  const min = Math.min(...values);

  // ASCII line chart
  const chartHeight = 8;
  const chartWidth = Math.min(sessions.length, 60);
  const displaySessions = sessions.slice(-chartWidth);
  const displayValues = displaySessions.map((s) => s.co2_gCO2e);

  // Build Y-axis labels and chart grid
  const yStep = max > 0 ? max / chartHeight : 1;

  for (let row = chartHeight; row >= 0; row--) {
    const yVal = yStep * row;
    const yLabel = padStart(yVal.toFixed(1), 5);
    let rowStr = "";

    if (row === chartHeight || row === Math.round(chartHeight / 2) || row === 0) {
      rowStr += c(C.dimGray, yLabel) + " " + c(C.dimGray, "|");
    } else {
      rowStr += "      " + c(C.dimGray, "|");
    }

    for (const val of displayValues) {
      const valRow = max > 0 ? Math.round((val / max) * chartHeight) : 0;
      if (valRow === row && row > 0) {
        rowStr += c(C.spring, "*");
      } else {
        rowStr += " ";
      }
    }

    lines.push(`  ${rowStr}`);
  }

  // X-axis
  const xAxis =
    "      " +
    c(C.dimGray, "+" + "-".repeat(Math.max(displayValues.length, 4)));
  lines.push(`  ${xAxis}`);

  // X-axis date labels (sparse)
  if (displaySessions.length > 0) {
    let dateLabels = "       ";
    const labelInterval = Math.max(
      1,
      Math.floor(displaySessions.length / 6),
    );
    for (let i = 0; i < displaySessions.length; i++) {
      const session = displaySessions[i];
      if (i % labelInterval === 0 && session) {
        const d = parseDate(session.date);
        const label = formatShortDate(d);
        dateLabels += label;
        // Skip ahead to avoid overlap
        const skip = label.length - 1;
        i += skip;
      } else {
        dateLabels += " ";
      }
    }
    lines.push(`  ${c(C.dimGray, dateLabels)}`);
  }

  // Braille sparkline
  lines.push("");
  lines.push(
    `  ${c(C.gray, "Sparkline:")}  ${sparkline(displayValues)}  ${c(C.gray, `peak: ${max.toFixed(1)}g`)}`,
  );

  return lines.join("\n");
}

function renderCumulative(sessions: TrendSession[]): string {
  const lines: string[] = [];
  lines.push(sectionHeader("CUMULATIVE CO2"));
  lines.push(separator(60));

  const totalEmitted = sessions.reduce((sum, s) => sum + s.co2_gCO2e, 0);
  const totalSaved = Math.abs(
    sessions.reduce((sum, s) => sum + s.netSaved_g, 0),
  );

  const maxVal = Math.max(totalEmitted, totalSaved);
  const emittedFrac = maxVal > 0 ? totalEmitted / maxVal : 0;
  const savedFrac = maxVal > 0 ? totalSaved / maxVal : 0;

  const barWidth = 40;

  lines.push("");
  lines.push(
    `  ${padEnd(c(C.gray, "Total emitted:"), 22)}${padEnd(cb(C.amber, formatCarbon(totalEmitted)), 18)}${makeColorBar(emittedFrac, barWidth, C.amber)}`,
  );
  lines.push(
    `  ${padEnd(c(C.gray, "Total saved (net):"), 22)}${padEnd(cb(C.lime, formatCarbon(totalSaved)), 18)}${makeColorBar(savedFrac, barWidth, C.lime)}`,
  );

  // Ratio
  if (totalEmitted > 0) {
    const ratio = totalSaved / totalEmitted;
    lines.push("");
    lines.push(
      `  ${cb(C.white, `Ratio: For every 1g emitted, you saved ${ratio.toFixed(0)}g of human-equivalent CO2`)}`,
    );
  }

  return lines.join("\n");
}

function renderWeeklyAverages(sessions: TrendSession[]): string {
  const lines: string[] = [];
  lines.push(sectionHeader("WEEKLY AVERAGES"));
  lines.push(separator(60));

  // Group sessions by week
  const weeks = groupByWeek(sessions);
  const recentWeeks = weeks.slice(-3).reverse();

  // Table header
  lines.push("");
  lines.push(
    `  ${padEnd("", 16)}${padEnd(c(C.gray, "CO2/session"), 16)}${padEnd(c(C.gray, "Sessions"), 14)}${c(C.gray, "Net saved")}`,
  );

  const weekLabels = ["This week:", "Last week:", "2 wks ago:"];

  for (let i = 0; i < recentWeeks.length && i < 3; i++) {
    const week = recentWeeks[i]!;
    const avgCO2 =
      week.sessions.length > 0
        ? week.totalCO2 / week.sessions.length
        : 0;
    const netSaved = Math.abs(week.totalNetSaved);

    lines.push(
      `  ${padEnd(c(C.white, weekLabels[i] ?? `${i + 3} wks ago:`), 16)}${padEnd(cb(C.white, `${avgCO2.toFixed(1)} g`), 16)}${padEnd(cb(C.white, `${week.sessions.length}`), 14)}${cb(C.lime, `-${netSaved.toFixed(0)}g`)}`,
    );
  }

  // Trend indicator
  if (recentWeeks.length >= 2 && recentWeeks[0] && recentWeeks[1]) {
    const thisWeek = recentWeeks[0];
    const lastWeek = recentWeeks[1];
    const thisWeekAvg =
      thisWeek.sessions.length > 0
        ? thisWeek.totalCO2 / thisWeek.sessions.length
        : 0;
    const lastWeekAvg =
      lastWeek.sessions.length > 0
        ? lastWeek.totalCO2 / lastWeek.sessions.length
        : 0;

    if (lastWeekAvg > 0) {
      const change = ((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100;
      const direction = change < 0 ? "DECREASING" : "INCREASING";
      const trendColor: string = change < 0 ? C.lime : C.coral;
      lines.push("");
      lines.push(
        `  ${c(C.gray, "Trend: your average CO2 per session is")} ${cb(trendColor, `${direction} (${change > 0 ? "+" : ""}${Math.round(change)}% week-over-week)`)}`,
      );
    }
  }

  return lines.join("\n");
}

function renderTrendForest(sessions: TrendSession[]): string {
  const lines: string[] = [];
  lines.push(sectionHeader("YOUR FOREST"));
  lines.push(separator(60));

  const totalSaved = Math.abs(
    sessions.reduce((sum, s) => sum + s.netSaved_g, 0),
  );
  const gramsPerTree = 60;

  lines.push("");
  lines.push(
    `  ${c(C.gray, `${totalSaved.toFixed(0)}g CO2e saved == planting and growing these trees for a day:`)}`,
  );
  lines.push("");

  const forestArt = forest(totalSaved, gramsPerTree);
  for (const line of forestArt) {
    lines.push(`  ${line}`);
  }

  // Tree explanation
  const numTrees = Math.floor(totalSaved / gramsPerTree);
  const remainder = totalSaved % gramsPerTree;
  lines.push("");
  lines.push(
    `  ${c(C.dimGray, `Each tree represents ~${gramsPerTree}g CO2e offset (one session of car-commute avoidance).`)}`,
  );
  if (remainder > 0) {
    lines.push(
      `  ${c(C.dimGray, `Sprouts represent <${gramsPerTree}g partial progress toward the next tree.`)}`,
    );
  }
  lines.push("");
  lines.push(`  ${cb(C.emerald, "Keep growing your forest!")}`);

  return lines.join("\n");
}

function renderTrendFooter(sessions: TrendSession[]): string {
  const lines: string[] = [];
  lines.push(separator());
  lines.push(
    `  ${cd(`Methodology v1.0 | ISO 14040/14044 | Data from ${sessions.length} sessions`)}`,
  );
  return lines.join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build a single-color bar.
 */
function makeColorBar(
  fraction: number,
  width: number,
  color: string,
): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  let bar = "";
  if (filled > 0) bar += c(color, "█".repeat(filled));
  if (empty > 0) bar += c(C.dimGray, "░".repeat(empty));
  return bar;
}

/**
 * Compute the day span between oldest and newest session.
 */
function computeDaySpan(sessions: TrendSession[]): number {
  if (sessions.length < 2) return 1;
  const firstSession = sessions[0];
  const lastSession = sessions[sessions.length - 1];
  if (!firstSession || !lastSession) return 1;
  const first = parseDate(firstSession.date);
  const last = parseDate(lastSession.date);
  const diffMs = last.getTime() - first.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Parse a date string (ISO or YYYY-MM-DD).
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Format a date as "Mon DD" for axis labels.
 */
function formatShortDate(d: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2, " ")}`;
}

interface WeekGroup {
  weekStart: Date;
  sessions: TrendSession[];
  totalCO2: number;
  totalNetSaved: number;
}

/**
 * Group sessions by ISO week (Monday-based).
 */
function groupByWeek(sessions: TrendSession[]): WeekGroup[] {
  const weekMap = new Map<string, TrendSession[]>();

  for (const s of sessions) {
    const d = parseDate(s.date);
    const weekKey = getISOWeekKey(d);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(s);
  }

  // Sort by week key and build WeekGroup array
  const sortedKeys = [...weekMap.keys()].sort();
  return sortedKeys.map((key) => {
    const weekSessions = weekMap.get(key)!;
    const monday = parseISOWeekKey(key);
    return {
      weekStart: monday,
      sessions: weekSessions,
      totalCO2: weekSessions.reduce((sum, s) => sum + s.co2_gCO2e, 0),
      totalNetSaved: weekSessions.reduce((sum, s) => sum + s.netSaved_g, 0),
    };
  });
}

/**
 * Get ISO week key as "YYYY-WNN" from a date.
 */
function getISOWeekKey(d: Date): string {
  // Compute ISO week number
  const target = new Date(d.getTime());
  // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
  const dayNum = target.getDay() || 7; // Convert Sunday from 0 to 7
  target.setDate(target.getDate() + 4 - dayNum);
  const yearStart = new Date(target.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${target.getFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

/**
 * Parse "YYYY-WNN" back to the Monday of that week (approximate).
 */
function parseISOWeekKey(key: string): Date {
  const parts = key.split("-W");
  const yearStr = parts[0] ?? "2026";
  const weekStr = parts[1] ?? "01";
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4.getTime());
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}
