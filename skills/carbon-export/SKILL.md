---
name: carbon:export
description: Export carbon measurement data as CSV or JSON for external analysis
---

## What This Skill Does

Exports session carbon data from the plugin's SQLite database in CSV or JSON format, suitable for spreadsheet analysis, dashboards, or academic reporting.

## How to Execute

### Step 1: Determine Export Format

Ask the user which format they prefer if not specified:
- **CSV** (default) — for spreadsheets, R, pandas
- **JSON** — for programmatic consumption, dashboards

### Step 2: Read Session Data

Open the SQLite database at `.data/carbon.db` in the plugin root directory.

Query all sessions:

```sql
SELECT
  id, started_at, ended_at, model_primary,
  total_input_tokens, total_output_tokens,
  total_cache_creation_tokens, total_cache_read_tokens,
  num_requests,
  energy_inference_wh, energy_embodied_wh, energy_network_wh,
  energy_total_wh, energy_total_low_wh, energy_total_high_wh,
  co2_operational_g, co2_embodied_g, co2_network_g,
  co2_total_g, co2_total_low_g, co2_total_high_g,
  water_direct_ml, water_indirect_ml, water_total_ml,
  grid_cif_used, grid_cif_source, region_inferred, pue_used,
  uncertainty_key_driver, uncertainty_key_driver_fraction,
  plugin_version, methodology_version,
  created_at, updated_at
FROM sessions
ORDER BY created_at DESC
```

Also query per-request detail if the user wants granular data:

```sql
SELECT
  id, session_id, model, input_tokens, output_tokens,
  cache_creation_tokens, cache_read_tokens,
  energy_wh, co2_g, timestamp
FROM requests
ORDER BY timestamp DESC
```

### Step 3: Format Output

#### CSV Format

Write to `carbon-export-{date}.csv` in the current working directory:

```csv
session_id,started_at,model,input_tokens,output_tokens,cache_creation,cache_read,requests,energy_wh,energy_low_wh,energy_high_wh,co2_total_g,co2_low_g,co2_high_g,co2_operational_g,co2_embodied_g,co2_network_g,water_ml,grid_cif,region,pue,key_driver,driver_fraction
```

Use `formatTokenCount` for display but raw numbers in CSV. Include a header row.

#### JSON Format

Write to `carbon-export-{date}.json`:

```json
{
  "exported_at": "ISO timestamp",
  "plugin_version": "0.1.0",
  "methodology_version": "1.0.0",
  "sessions": [
    {
      "id": "...",
      "tokens": { "input": 0, "output": 0, "cache_creation": 0, "cache_read": 0 },
      "energy": { "total_wh": 0, "low_wh": 0, "high_wh": 0 },
      "carbon": { "total_g": 0, "low_g": 0, "high_g": 0, "operational_g": 0, "embodied_g": 0, "network_g": 0 },
      "water": { "total_ml": 0, "direct_ml": 0, "indirect_ml": 0 },
      "context": { "grid_cif": 0, "region": "", "pue": 0 },
      "uncertainty": { "key_driver": "", "driver_fraction": 0 }
    }
  ],
  "requests": [...]
}
```

### Step 4: Confirm to User

Report:
- File written: `{filename}`
- Sessions exported: {count}
- Requests exported: {count}
- Date range: {earliest} to {latest}
- Note: "No session content is included — only token counts and calculated metrics"

### Privacy Note

The export contains NO session content, prompts, or code. Only token counts, energy metrics, and carbon calculations are exported. Project paths are SHA-256 hashed if present.
