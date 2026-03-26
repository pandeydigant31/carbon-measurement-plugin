---
name: carbon:report
description: Generate a detailed carbon footprint report for the current Claude Code session
---

# Carbon Session Report

Generate a full environmental impact report for the current Claude Code session, following the format defined in PROMPT.md §7.3.

## Instructions

### Step 1: Read Session Data

Open the SQLite database at `.data/carbon.db` using Bun's `bun:sqlite` driver (read-only). Query the current session from the `sessions` table:

```sql
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1;
```

Extract these fields from the row:
- `id`, `started_at`, `updated_at`, `model_primary`
- `total_input_tokens`, `total_output_tokens`, `total_cache_creation_tokens`, `total_cache_read_tokens`, `num_requests`
- `energy_inference_wh`, `energy_embodied_wh`, `energy_network_wh`, `energy_total_wh`, `energy_total_low_wh`, `energy_total_high_wh`
- `co2_operational_g`, `co2_embodied_g`, `co2_network_g`, `co2_total_g`, `co2_total_low_g`, `co2_total_high_g`
- `water_direct_ml`, `water_indirect_ml`, `water_total_ml`
- `grid_cif_used`, `grid_cif_source`, `region_inferred`, `pue_used`
- `uncertainty_key_driver`, `uncertainty_key_driver_fraction`
- `plugin_version`, `methodology_version`

If the database does not exist or the session table is empty, report: "No session data recorded yet. The carbon measurement hooks must be active to collect data."

### Step 2: Calculate Duration

Compute session duration from `started_at` to `updated_at` (or current time if `updated_at` is null). Format as minutes or hours as appropriate.

### Step 3: Calculate Comparative Context

Using the functions from `src/calculator/comparative.ts`:

1. **Equivalencies**: Call `generateEquivalencies(co2_total_g)` to get 3 context-appropriate comparisons. The function scores and selects the most intuitive ones automatically.

2. **Human-hours saved**: Call `estimateHumanHoursSaved(co2_total_g, total_output_tokens)` with defaults (1.0 hours, "car" commute). This returns `estimatedHours`, `humanCO2_g`, `netImpact_g`, and `commuteMode`.

3. **Decision levers**: Call `generateDecisionLevers(modelFamily, total_input_tokens, total_cache_read_tokens, energy, carbon)` where `modelFamily` is resolved from `model_primary` using `resolveModelFamily()`. This returns at least 2 actionable recommendations.

### Step 4: Format the Report

Use the formatting utilities from `src/utils/formatting.ts`:
- `formatEnergy(wh)` — e.g., "2.8 Wh"
- `formatCarbon(gCO2e)` — e.g., "0.84 gCO2e"
- `formatWater(mL)` — e.g., "3.0 mL"
- `formatRange(low, high, unit)` — e.g., "[0.50-2.4] Wh"
- `formatTokenCount(n)` — e.g., "45,201"

Output the report in this exact structure:

```
SESSION CARBON REPORT
=====================
Session: {id} | Duration: {duration} | Model: {model_primary}

NET IMPACT: {net_impact_g} gCO2e {label: "saved vs. manual work" if negative, else "added vs. manual work"}
           (AI used ~{co2_total_g}; est. human alternative: ~{human_co2_g})
           [est. {estimated_hours} dev-hours saved, {commute_mode} commute — confidence: low]

TOKENS
  Input:  {total_input_tokens} (incl. {total_cache_read_tokens} cache-read)
  Output: {total_output_tokens}
  Cache created: {total_cache_creation_tokens}

ENERGY BREAKDOWN
  Inference (prefill + decode + KV): {energy_inference_wh}
  Embodied (amortized hardware):     {energy_embodied_wh}
  Network transmission:              {energy_network_wh}
  -----------------------------------------
  Total energy:                      {energy_total_wh}  [{energy_total_low_wh} - {energy_total_high_wh}]

CARBON FOOTPRINT
  Operational (Scope 2):         {co2_operational_g}
  Embodied (Scope 3):           {co2_embodied_g}
  Network:                       {co2_network_g}
  -----------------------------------------
  Total:                         {co2_total_g}  [{co2_total_low_g} - {co2_total_high_g}]

  Grid intensity used: {grid_cif_used} kgCO2/kWh ({region_inferred}, {grid_cif_source})
  PUE applied: {pue_used}
  Confidence: {confidence_label}

WATER
  Direct (cooling):             {water_direct_ml}
  Indirect (electricity):       {water_indirect_ml}
  Total:                        {water_total_ml}

COMPARATIVE CONTEXT
  Equivalent to:
    - {equivalency_1}
    - {equivalency_2}
    - {equivalency_3}

  Human work replaced (est. {estimated_hours} hours):
    - Office work CO2: ~{human_co2_g} gCO2e (commute + HVAC + compute)
    - Net impact: {net_impact_g} gCO2e ({label: "AI SAVED carbon" if negative, else "AI added carbon"})

DECISION LEVERS
  - {lever_1}
  - {lever_2}
  [include all returned levers]

METHODOLOGY
  Version: {methodology_version} | ISO 14040/14044 compliant
  Benchmarks updated: 2026-03-15
  Key uncertainty driver: {uncertainty_key_driver} (contributes {uncertainty_key_driver_fraction}% of variance)
```

### Formatting Rules

- Every numeric value with uncertainty MUST show its range in brackets: `value [low - high]`
- Use 1 decimal place for values >= 1, 2 decimal places for values < 1
- Use thousand separators for token counts
- Confidence label is derived from `grid_cif_source`:
  - "realtime" -> "High (real-time grid data)"
  - "regional" -> "Medium (regional average, not real-time)"
  - "provider" -> "Medium (provider-reported average)"
  - "fallback" -> "Low (global average fallback)"
- For equivalencies, format as: "{activity}: {amount} {unit} {description}" (e.g., "Driving 2.7 meters in an average US car")
- Net impact should show "AI SAVED carbon vs. human alternative" when negative, "AI added carbon vs. human alternative" when positive
- Always include at least 3 equivalencies and at least 2 decision levers
- End with methodology version and benchmarks date
