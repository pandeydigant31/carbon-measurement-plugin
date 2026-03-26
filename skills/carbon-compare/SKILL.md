---
name: carbon:compare
description: Compare carbon footprint across Claude model families or scenarios
---

# Carbon Model Comparison

Compare energy and carbon footprint across Claude model families (Haiku, Sonnet, Opus) for the same workload, or run what-if scenarios on context size and timing.

## Instructions

### Step 1: Read Current Session Data

Open the SQLite database at `.data/carbon.db` (read-only). Query the most recent session:

```sql
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1;
```

Extract: `total_input_tokens`, `total_output_tokens`, `total_cache_read_tokens`, `model_primary`, `energy_total_wh`, `co2_total_g`, `grid_cif_used`, `region_inferred`.

If no session data exists, report: "No session data recorded yet. Run some Claude Code requests first, then re-run /carbon:compare."

### Step 2: Calculate Per-Model Estimates

Using the `compareModels()` function from `src/calculator/comparative.ts`:

For each model family (haiku, sonnet, opus), calculate energy and carbon for the **same token counts** as the current session. The function normalizes results to Sonnet as the baseline (1.0x).

The comparison uses these relative energy ratios (from hardware profiles in `src/models/`):
- **Haiku**: ~0.25-0.40x of Sonnet (fewer GPUs, lower power per token)
- **Sonnet**: 1.0x baseline
- **Opus**: ~2.5-4.0x of Sonnet (more GPUs, longer inference time)

Carbon is derived from energy using the session's `grid_cif_used` value.

### Step 3: Calculate What-If Scenarios

Generate at least 2 additional what-if comparisons:

1. **Context reduction**: "What if input context were 50% smaller?"
   - Recalculate with `total_input_tokens * 0.5`, same output tokens
   - Show energy and carbon savings

2. **Off-peak timing**: "What if run during off-peak hours?"
   - Apply a 30% reduction to grid CIF (off-peak grids typically have more renewables)
   - Show carbon savings (energy stays the same, only CIF changes)

3. **Cache optimization** (if `total_cache_read_tokens` is 0): "What if prompt caching were enabled?"
   - Estimate 30% of input tokens served from cache
   - Show energy savings from avoided prefill

### Step 4: Format the Output

Use formatting utilities from `src/utils/formatting.ts`.

```
MODEL COMPARISON
================
Workload: {total_input_tokens} input + {total_output_tokens} output tokens
Grid CIF: {grid_cif_used} kgCO2/kWh ({region_inferred})
Current model: {model_primary}

┌──────────┬────────────┬─────────────┬──────────┐
│ Model    │ Energy     │ Carbon      │ Relative │
├──────────┼────────────┼─────────────┼──────────┤
│ Haiku    │ {e_h} Wh   │ {c_h} gCO2e │ {r_h}x   │
│ Sonnet * │ {e_s} Wh   │ {c_s} gCO2e │ 1.0x     │
│ Opus     │ {e_o} Wh   │ {c_o} gCO2e │ {r_o}x   │
└──────────┴────────────┴─────────────┴──────────┘
* Baseline for relative comparison

CONTEXT
  Current session ({model_primary}): ~{co2_total_g} gCO2e
  Human alternative (est. {estimated_hours} hrs): ~{human_co2_g} gCO2e
  Net impact: {net_impact_g} gCO2e ({label: "AI saved" if negative, else "AI added"} vs. manual work)

POTENTIAL SAVINGS
  {savings_line_1}
  {savings_line_2}

WHAT-IF SCENARIOS
  1. Half the input context ({input_tokens/2} tokens):
     Energy: {e_half} Wh | Carbon: {c_half} gCO2e | Saves: {savings_pct}%

  2. Off-peak execution (30% lower grid intensity):
     Energy: {e_same} Wh | Carbon: {c_offpeak} gCO2e | Saves: {savings_pct}%

  3. [If applicable] Enable prompt caching (est. 30% cache hits):
     Energy: {e_cached} Wh | Carbon: {c_cached} gCO2e | Saves: {savings_pct}%

KEY TAKEAWAY
  {one-sentence summary of the biggest available savings opportunity}
```

### Formatting Rules

- Mark the current model with an asterisk (*) in the table
- Show "Relative" as a multiplier of Sonnet baseline (e.g., 0.3x, 1.0x, 3.2x)
- Highlight the lowest-carbon option in the savings section
- Use 1 decimal place for values >= 1, 2 decimal places for values < 1
- Savings percentages should be whole numbers
- If user is already on Haiku, note: "You're already on the most efficient model family"
- The KEY TAKEAWAY should be a single actionable sentence, not a generic statement
