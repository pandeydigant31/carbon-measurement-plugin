/**
 * Configuration management.
 *
 * Loads plugin config from the SQLite store, merging stored values
 * with defaults for any keys not yet persisted.
 */

import type { PluginConfig } from "../types.ts";
import { DEFAULT_CONFIG } from "../types.ts";
import type { CarbonStore } from "../data/store.ts";

/** Config keys that map to boolean values */
const BOOLEAN_KEYS: ReadonlySet<string> = new Set([
  "includeEmbodied",
  "includeNetwork",
  "includeWater",
  "showComparisons",
  "showHumanEquivalent",
  "showUncertainty",
]);

/** Config keys that map to numeric values */
const NUMERIC_KEYS: ReadonlySet<string> = new Set([
  "gridCifManualValue",
  "humanHoursPerSession",
]);

/**
 * Load the full PluginConfig by reading each key from the store
 * and merging with DEFAULT_CONFIG.
 */
export function loadConfig(store: CarbonStore): PluginConfig {
  const config = { ...DEFAULT_CONFIG };

  for (const key of Object.keys(DEFAULT_CONFIG) as Array<keyof PluginConfig>) {
    const raw = store.getConfig(key);
    if (raw === null) continue;

    if (BOOLEAN_KEYS.has(key)) {
      (config as Record<string, unknown>)[key] = raw === "true";
    } else if (NUMERIC_KEYS.has(key)) {
      const num = Number(raw);
      if (!Number.isNaN(num)) {
        (config as Record<string, unknown>)[key] = num;
      }
    } else {
      (config as Record<string, unknown>)[key] = raw;
    }
  }

  return config;
}

/**
 * Save a partial config update to the store.
 * Only the provided keys are written; others are left unchanged.
 */
export function saveConfig(
  store: CarbonStore,
  config: Partial<PluginConfig>
): void {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    store.saveConfig(key, String(value));
  }
}
