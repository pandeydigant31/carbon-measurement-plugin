#!/usr/bin/env bun
/**
 * Stop hook — Parse last response tokens, calculate energy/carbon/water/embodied,
 * run uncertainty analysis, update session.
 * Budget: < 50ms. Runs on EVERY assistant response.
 * MUST exit 0 on any error.
 */

import { resolve, dirname } from "node:path";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(import.meta.path));
const DB_PATH = resolve(PLUGIN_ROOT, ".data", "carbon.db");

try {
  const input = await Bun.stdin.text();
  let hookData: Record<string, unknown> = {};
  if (input.trim()) {
    try {
      hookData = JSON.parse(input);
    } catch {
      // Non-JSON input
    }
  }

  const usage = hookData.usage as {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  } | undefined;

  if (!usage) {
    process.exit(0);
  }

  const model = (hookData.model as string) ?? "claude-sonnet-4-20250514";

  // Lazy-load all modules
  const { resolveModelFamily } = await import("../src/types.ts");
  const { getHardwareProfile, UTILIZATION } = await import("../src/models/hardware-profiles.ts");
  const { getBenchmarks } = await import("../src/models/benchmarks.ts");
  const { getDefaultPUE, getGridCIF, getDefaultWUE } = await import("../src/models/emission-factors.ts");
  const { calculateEnergy } = await import("../src/calculator/energy.ts");
  const { calculateCarbon } = await import("../src/calculator/carbon.ts");
  const { calculateNetworkEnergy } = await import("../src/calculator/network.ts");
  const { calculateEmbodied } = await import("../src/calculator/embodied.ts");
  const { calculateWater } = await import("../src/calculator/water.ts");
  const { runUncertainty } = await import("../src/calculator/uncertainty.ts");
  const { CarbonStore } = await import("../src/data/store.ts");

  const family = resolveModelFamily(model);
  const profile = getHardwareProfile(family);
  const benchmarks = getBenchmarks(family);
  const pue = getDefaultPUE();
  const wue = getDefaultWUE();
  const region = process.env.AWS_REGION ?? "us-east-1";
  const gridCif = getGridCIF(region);

  const tokenUsage = {
    model,
    modelFamily: family,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };

  // ── Calculate all impact categories ──────────────────────────
  const energy = calculateEnergy(tokenUsage, profile, benchmarks, UTILIZATION, pue);
  const carbon = calculateCarbon(energy, gridCif, "regional", region, pue);
  const networkWh = calculateNetworkEnergy(tokenUsage.inputTokens, tokenUsage.outputTokens);
  const networkCo2 = networkWh * gridCif; // gCO2e (same unit cancellation)

  // Embodied carbon
  const tPrefill = benchmarks.prefillTokensPerSecond > 0
    ? tokenUsage.inputTokens / benchmarks.prefillTokensPerSecond : 0;
  const tDecode = benchmarks.tps > 0 ? tokenUsage.outputTokens / benchmarks.tps : 0;
  const inferenceTime_s = tPrefill + tDecode;
  const embodied = calculateEmbodied(inferenceTime_s, profile, UTILIZATION.gpuUtilizationMean);

  // Water
  const water = calculateWater(energy.total_Wh, wue, region);

  // Uncertainty (1000 LHS draws)
  const uncertainty = runUncertainty(
    tokenUsage, profile, benchmarks, UTILIZATION, pue, gridCif
  );

  // ── Persist to SQLite ────────────────────────────────────────
  const store = new CarbonStore(DB_PATH);
  const sessionId = store.getConfig("current_session_id") ?? `session_${Date.now()}`;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  store.saveRequest({
    id: requestId,
    sessionId,
    model,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    cacheCreationTokens: tokenUsage.cacheCreationTokens,
    cacheReadTokens: tokenUsage.cacheReadTokens,
    energy_wh: energy.total_Wh,
    co2_g: carbon.total_gCO2e + embodied.total_gCO2e + networkCo2,
    timestamp: new Date().toISOString(),
  });

  store.updateSessionTotals(sessionId, {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    cacheCreationTokens: tokenUsage.cacheCreationTokens,
    cacheReadTokens: tokenUsage.cacheReadTokens,
    energy_wh: energy.total_Wh,
    co2_operational_g: carbon.operational_gCO2e,
    co2_embodied_g: embodied.total_gCO2e,
    co2_network_g: networkCo2,
    co2_total_g: carbon.operational_gCO2e + embodied.total_gCO2e + networkCo2,
    networkEnergy_wh: networkWh,
    water_direct_ml: water.direct_mL,
    water_indirect_ml: water.indirect_mL,
    water_total_ml: water.total_mL,
    co2_low_g: uncertainty.co2Low_gCO2e,
    co2_high_g: uncertainty.co2High_gCO2e,
    energy_low_wh: uncertainty.energyLow_Wh,
    energy_high_wh: uncertainty.energyHigh_Wh,
    uncertainty_key_driver: uncertainty.keyDriver,
    uncertainty_key_driver_fraction: uncertainty.keyDriverVarianceFraction,
    model,
  });

  store.close();
} catch (err) {
  console.error(`[carbon-plugin] stop hook error: ${err}`);
}

process.exit(0);
