---
name: carbon:configure
description: View and adjust carbon measurement plugin settings
---

## What This Skill Does

Displays current plugin configuration and allows the user to adjust settings. All settings are stored in the SQLite database at `.data/carbon.db` in the `user_config` table.

## How to Execute

### Step 1: Read Current Configuration

Open `.data/carbon.db` and use `src/utils/config.ts` `loadConfig()` to get the current merged configuration (DB values + defaults).

Display current settings:

```
CARBON PLUGIN CONFIGURATION
============================

Grid Carbon Intensity
  Method:        {gridCifMethod} (auto | realtime | regional | manual)
  Manual value:  {gridCifManualValue ?? "not set"} kgCO2e/kWh
  API key:       {electricityMapsApiKey ? "configured" : "not set"}
  Region:        {inferredRegion ?? "auto-detected"}

Scope Toggles
  Include embodied carbon (Scope 3):  {includeEmbodied}
  Include network energy:             {includeNetwork}
  Include water consumption:          {includeWater}

Comparative Context
  Show comparisons:        {showComparisons}
  Show human equivalent:   {showHumanEquivalent}
  Human hours per session: {humanHoursPerSession}
  Commute mode:            {commuteMode} (car | transit | bike | remote)

Display
  Show uncertainty ranges: {showUncertainty}
  Statusline format:       {statuslineFormat} (compact | detailed)
  Report currency:         {reportCurrency} (gCO2e | Wh | both)
```

### Step 2: Handle User Changes

If the user specifies changes, update via `src/utils/config.ts` `saveConfig()`.

Common commands:
- "set commute to remote" → `saveConfig(store, { commuteMode: "remote" })`
- "use detailed statusline" → `saveConfig(store, { statuslineFormat: "detailed" })`
- "disable water tracking" → `saveConfig(store, { includeWater: false })`
- "set grid CIF to 0.25" → `saveConfig(store, { gridCifMethod: "manual", gridCifManualValue: 0.25 })`
- "set region to eu-west-1" → `saveConfig(store, { inferredRegion: "eu-west-1" })`

### Step 3: Confirm Changes

After saving, re-read and display only the changed settings with before/after:

```
Updated:
  commuteMode: car → remote
  (This changes your human-work baseline from ~1,850 to ~350 gCO2e/hr)
```

### Validation Rules

- `gridCifManualValue`: must be > 0 and < 2.0 kgCO2e/kWh
- `humanHoursPerSession`: must be > 0 and <= 8
- `commuteMode`: must be one of "car", "transit", "bike", "remote"
- `statuslineFormat`: must be "compact" or "detailed"
- `reportCurrency`: must be "gCO2e", "Wh", or "both"

If validation fails, explain the valid range and ask the user to try again.
