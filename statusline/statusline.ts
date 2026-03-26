#!/usr/bin/env bun
/**
 * Statusline provider — Real-time CO2 + energy + water + net impact.
 * Reads current session totals from SQLite and formats for display.
 * Budget: < 10ms.
 */

import { resolve, dirname } from "node:path";
import { formatCompact, formatDetailed } from "./format.ts";
import type { StatuslineData } from "./format.ts";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(import.meta.path));
const DB_PATH = resolve(PLUGIN_ROOT, ".data", "carbon.db");

try {
  const { existsSync } = await import("node:fs");
  if (!existsSync(DB_PATH)) {
    console.log("CO2: -- | E: -- | W: --");
    process.exit(0);
  }

  const { CarbonStore } = await import("../src/data/store.ts");
  const store = new CarbonStore(DB_PATH);

  // All DB reads happen before close()
  const sessionId = store.getConfig("current_session_id");
  const format = store.getConfig("statusline_format") ?? "compact";
  const outputTokensStr = store.getConfig("session_output_tokens");

  if (!sessionId) {
    store.close();
    console.log("CO2: -- | E: -- | W: --");
    process.exit(0);
  }

  const session = store.getSessionTotals(sessionId);
  store.close(); // ALL reads done — safe to close

  if (!session) {
    console.log("CO2: -- | E: -- | W: --");
    process.exit(0);
  }

  // Phase 3: compute net impact via comparative context (pure function, no DB)
  let netImpact_g: number | null = null;
  if (session.co2_total_g !== null) {
    const { estimateHumanHoursSaved } = await import("../src/calculator/comparative.ts");
    const outputTokens = outputTokensStr ? parseInt(outputTokensStr, 10) : 500;
    const humanHours = estimateHumanHoursSaved(session.co2_total_g, outputTokens);
    netImpact_g = humanHours.netImpact_g;
  }

  const data: StatuslineData = {
    co2Total_g: session.co2_total_g,
    co2Low_g: session.co2_total_low_g,
    co2High_g: session.co2_total_high_g,
    co2Operational_g: session.co2_operational_g,
    co2Embodied_g: session.co2_embodied_g,
    co2Network_g: session.co2_network_g,
    energyTotal_Wh: session.energy_total_wh,
    waterTotal_mL: session.water_total_ml,
    netImpact_g,
    keyDriver: session.uncertainty_key_driver,
    keyDriverFraction: session.uncertainty_key_driver_fraction,
  };

  const output = format === "detailed" ? formatDetailed(data) : formatCompact(data);
  console.log(output);
} catch (err) {
  console.error(`[carbon-plugin] statusline error: ${err}`);
  console.log("CO2: err | E: err | W: err");
}

process.exit(0);
