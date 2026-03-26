#!/usr/bin/env bun
/**
 * Stop hook — Parse transcript for token usage, calculate all impact categories.
 * Budget: < 50ms. Runs on EVERY assistant response.
 * MUST exit 0 on any error.
 *
 * Claude Code provides on stdin:
 *   { session_id, transcript_path, cwd, hook_event_name, ... }
 *
 * Token usage is NOT in stdin — it's in the transcript JSONL file.
 * We parse the transcript to extract cumulative token usage.
 */

import { resolve, dirname } from "node:path";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(import.meta.path));
const DB_PATH = resolve(
  process.env.CLAUDE_PLUGIN_DATA ?? resolve(PLUGIN_ROOT, ".data"),
  "carbon.db"
);

try {
  // Read hook input from stdin
  const input = await Bun.stdin.text();
  let hookData: Record<string, unknown> = {};
  if (input.trim()) {
    try {
      hookData = JSON.parse(input);
    } catch {
      // Non-JSON input
    }
  }

  const transcriptPath = hookData.transcript_path as string | undefined;
  const sessionId = (hookData.session_id as string) ?? `session_${Date.now()}`;

  if (!transcriptPath) {
    // No transcript path — nothing to analyze
    process.exit(0);
  }

  // Read and parse the transcript file
  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(transcriptPath)) {
    process.exit(0);
  }

  const transcriptContent = readFileSync(transcriptPath, "utf-8");

  const { parseTranscript, aggregateTokens } = await import("../src/parser/transcript.ts");
  const { deduplicateUsage } = await import("../src/parser/token-counter.ts");

  const rawUsages = parseTranscript(transcriptContent);
  const usages = deduplicateUsage(rawUsages);
  const sessionTokens = aggregateTokens(usages);

  if (sessionTokens.numRequests === 0) {
    process.exit(0);
  }

  // Load calculator modules
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

  const family = resolveModelFamily(sessionTokens.primaryModel);
  const profile = getHardwareProfile(family);
  const benchmarks = getBenchmarks(family);
  const pue = getDefaultPUE();
  const wue = getDefaultWUE();
  const region = process.env.AWS_REGION ?? "us-east-1";
  const gridCif = getGridCIF(region);

  // Aggregate token usage for the full session
  const tokenUsage = {
    model: sessionTokens.primaryModel,
    modelFamily: family,
    inputTokens: sessionTokens.totalInputTokens,
    outputTokens: sessionTokens.totalOutputTokens,
    cacheCreationTokens: sessionTokens.totalCacheCreationTokens,
    cacheReadTokens: sessionTokens.totalCacheReadTokens,
  };

  // Calculate all impact categories
  const energy = calculateEnergy(tokenUsage, profile, benchmarks, UTILIZATION, pue);
  const carbon = calculateCarbon(energy, gridCif, "regional", region, pue);
  const networkWh = calculateNetworkEnergy(tokenUsage.inputTokens, tokenUsage.outputTokens);
  const networkCo2 = networkWh * gridCif;

  const tPrefill = benchmarks.prefillTokensPerSecond > 0
    ? tokenUsage.inputTokens / benchmarks.prefillTokensPerSecond : 0;
  const tDecode = benchmarks.tps > 0 ? tokenUsage.outputTokens / benchmarks.tps : 0;
  const embodied = calculateEmbodied(tPrefill + tDecode, profile, UTILIZATION.gpuUtilizationMean);
  const water = calculateWater(energy.total_Wh, wue, region);

  // Uncertainty (1000 LHS draws)
  const uncertainty = runUncertainty(tokenUsage, profile, benchmarks, UTILIZATION, pue, gridCif);

  // Persist to SQLite — store cumulative session totals (replace, not accumulate)
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const store = new CarbonStore(DB_PATH);
  store.saveConfig("current_session_id", sessionId);

  // Store cumulative output tokens for human-hours estimation in statusline
  store.saveConfig("session_output_tokens", String(sessionTokens.totalOutputTokens));

  const totalCo2 = carbon.operational_gCO2e + embodied.total_gCO2e + networkCo2;

  // Use direct SQL for a clean REPLACE of session totals (transcript gives us cumulative data)
  store.updateSessionTotals(sessionId, {
    inputTokens: sessionTokens.totalInputTokens,
    outputTokens: sessionTokens.totalOutputTokens,
    cacheCreationTokens: sessionTokens.totalCacheCreationTokens,
    cacheReadTokens: sessionTokens.totalCacheReadTokens,
    energy_wh: energy.total_Wh,
    co2_operational_g: carbon.operational_gCO2e,
    co2_embodied_g: embodied.total_gCO2e,
    co2_network_g: networkCo2,
    co2_total_g: totalCo2,
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
    model: sessionTokens.primaryModel,
  });

  // ── Auto Model Comparison ──────────────────────────────────────
  // Calculate energy for all 3 model families using the same token counts,
  // then store as JSON for trend/compare views (v0.3.0).
  const { compareModels } = await import("../src/calculator/comparative.ts");
  const modelComparison = compareModels(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    gridCif,
    (compFamily) => {
      const compProfile = getHardwareProfile(compFamily);
      const compBenchmarks = getBenchmarks(compFamily);
      const compUsage = { ...tokenUsage, modelFamily: compFamily };
      return calculateEnergy(compUsage, compProfile, compBenchmarks, UTILIZATION, pue);
    },
  );

  store.saveConfig(
    "last_model_comparison",
    JSON.stringify({
      sessionId,
      timestamp: new Date().toISOString(),
      currentModel: family,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      gridCif,
      models: modelComparison.map((m) => ({
        family: m.family,
        energy_Wh: m.energy_Wh,
        co2_gCO2e: m.co2_gCO2e,
        relativeToBaseline: m.relativeToBaseline,
      })),
    }),
  );

  store.close();
} catch (err) {
  console.error(`[carbon-plugin] stop hook error: ${err}`);
}

process.exit(0);
