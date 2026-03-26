---
name: carbon:trend
description: Show carbon footprint trends across sessions with visual forest
---

# Carbon Trend Analysis

Show session-over-session carbon footprint trends, aggregated statistics, and a visual forest based on cumulative savings.

## Instructions

### Step 1: Query Session History

Open the SQLite database at `${CLAUDE_PLUGIN_DATA}/carbon.db` (or `.data/carbon.db` in dev) using Bun's `bun:sqlite` driver (read-only). Query all sessions ordered by creation time:

```sql
SELECT
  id, created_at, model_primary,
  co2_total_g, energy_total_wh, water_total_ml,
  total_input_tokens, total_output_tokens,
  total_cache_creation_tokens, total_cache_read_tokens
FROM sessions
ORDER BY created_at ASC;
```

If no sessions exist, report: "No session history yet. Carbon data is recorded automatically during Claude Code sessions. Run /carbon:trend again after a few sessions."

### Step 2: Calculate Weekly/Monthly Aggregates

Using the functions from `src/data/trends.ts`:

1. **Session history**: Call `getSessionHistory(store)` to get all sessions as `SessionSummary[]`.
2. **Weekly aggregates**: Call `getWeeklyAggregates(sessions)` to group sessions by ISO week and compute per-week totals, averages, and the primary model used.
3. **Cumulative stats**: Call `getCumulativeStats(sessions)` to get lifetime totals: total CO2, total water, session count, and trees-equivalent offset.

### Step 3: Build Sparkline

Create an ASCII sparkline of per-session CO2 emissions (most recent 20 sessions). Use these block characters for 8-level resolution:

```
chars: ▁▂▃▄▅▆▇█
```

Map each session's `co2_g` to the range [min, max] across the window, then select the appropriate block character. Prefix with the date range.

Example: `Mar 10–Mar 26: ▂▃▅▇█▆▄▃▂▁▂▃▄▅▃▂▁▂▃▄`

### Step 4: Build Forest Visualization

Calculate trees-equivalent from cumulative stats (`treesEquivalent` field). Each tree absorbs ~22 kgCO2e/year (Source: EPA 2024). Display trees using emoji or ASCII art:

- 0 trees: `No trees yet — keep coding to grow your forest!`
- < 1 tree: Show a seedling proportional to progress: `🌱 (X% toward your first tree)`
- 1-5 trees: Show individual trees: `🌳🌳🌳`
- 6-20 trees: Show a row with count: `🌳🌳🌳🌳🌳 +N more (total: X)`
- 20+ trees: Show a forest block: `🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲 Forest: X trees`

Note: The forest represents the hypothetical CO2 saved by AI vs. manual work (net impact). If net impact is positive (AI used more than manual alternative), show: `Net impact is positive — no trees earned yet.`

### Step 5: Model Mix Over Time

Calculate the distribution of model families across sessions. Show as a simple bar:

```
Model mix: Sonnet ████████░░ 80% | Haiku ██░░░░░░░░ 15% | Opus ░░░░░░░░░░ 5%
```

Use 10-character bars. If only one model was used, note that.

### Step 6: Format the Output

```
CARBON FOOTPRINT TRENDS
========================
Sessions: {count} | Period: {first_date} to {last_date}

SPARKLINE (per-session CO2)
  {date_range}: {sparkline}
  Min: {min_co2} gCO2e | Max: {max_co2} gCO2e | Avg: {avg_co2} gCO2e

CUMULATIVE IMPACT
  Total CO2 emitted:  {total_co2} gCO2e
  Total energy used:  {total_energy} Wh
  Total water used:   {total_water} mL
  Sessions analyzed:  {count}

WEEKLY TREND
  ┌────────────┬──────────┬──────────┬──────────┬──────────────┐
  │ Week       │ Sessions │ CO2 (g)  │ Avg/sess │ Primary      │
  ├────────────┼──────────┼──────────┼──────────┼──────────────┤
  │ {week}     │ {n}      │ {co2}    │ {avg}    │ {model}      │
  └────────────┴──────────┴──────────┴──────────┴──────────────┘

FOREST ({trees_equivalent} trees equivalent)
  {forest_visualization}
  Based on net impact vs. estimated manual work alternative.
  1 tree = 22 kgCO2e/year absorbed (Source: EPA 2024)

MODEL MIX
  {model_mix_bar}

TREND INSIGHT
  {one-sentence insight about the trend direction or biggest change}
```

### Formatting Rules

- Show up to 12 weeks in the weekly table (most recent first)
- Use 1 decimal place for values >= 1, 2 decimal places for values < 1
- Sparkline shows most recent 20 sessions maximum
- If fewer than 3 sessions exist, skip the sparkline and weekly table, show only cumulative stats
- The TREND INSIGHT should be specific: compare this week to last week, note model switches, highlight if usage is increasing/decreasing
- Forest visualization must explain its basis (net impact, not gross emissions)
