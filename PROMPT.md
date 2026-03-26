# Carbon Measurement Plugin for Claude Code

## Project Vision

Build a Claude Code plugin that provides **rigorous, LCA-grounded carbon and environmental impact measurement** for AI coding sessions. Unlike existing tools that report a single CO2 number with false precision, this plugin applies proper Life Cycle Assessment methodology — complete system boundaries, multiple impact categories, uncertainty quantification, and *actionable* comparative context.

The goal is not to make developers feel guilty. It is to make them **carbon literate** — understanding what levers they have, what trade-offs exist, and how AI-assisted work compares to the alternatives it replaces.

---

## 1. Methodological Framework

### 1.1 Standards Compliance

This plugin's methodology follows:
- **ISO 14040:2006** — Principles and framework for LCA
- **ISO 14044:2006** — Requirements and guidelines for LCA
- **GHG Protocol Scope 2 Guidance** — for electricity-based emissions
- **GHG Protocol Scope 3 Standard** — for upstream embodied emissions

### 1.2 Functional Unit

The functional unit is: **one Claude Code session** (from session start to session end).

Secondary functional units for comparative analysis:
- Per 1,000 useful output tokens
- Per task completed (user-defined or inferred)
- Per developer-hour saved (estimated)

### 1.3 System Boundary

```
SYSTEM BOUNDARY: CRADLE-TO-GATE + USE PHASE
============================================

SCOPE 3 UPSTREAM (Embodied / Capital Goods)
├── GPU Manufacturing
│   ├── Semiconductor fabrication (wafer, lithography, etching)
│   ├── HBM memory production
│   ├── Packaging and assembly
│   └── Amortized over useful life (3-5 years, utilization-adjusted)
│
├── Server Manufacturing (non-GPU)
│   ├── CPU, RAM, SSDs, networking cards
│   ├── Chassis, power supply, cooling components
│   └── Amortized over useful life (4-6 years)
│
├── Datacenter Construction
│   ├── Building materials (concrete, steel, copper)
│   ├── Cooling infrastructure (chillers, cooling towers, piping)
│   ├── Electrical infrastructure (transformers, UPS, PDUs)
│   └── Amortized over useful life (15-25 years)
│
└── Supply Chain Transport
    ├── Component shipping (Asia → assembly → datacenter)
    └── Amortized with hardware

SCOPE 2 (Operational — Electricity)
├── GPU Inference Energy
│   ├── Prefill phase (input token processing)
│   ├── Decode phase (output token generation)
│   ├── KV-cache memory occupancy
│   └── Cache operations (creation and read)
│
├── Non-GPU Server Energy
│   ├── CPU orchestration and scheduling
│   ├── Memory (DRAM for model weights, KV-cache overflow)
│   ├── Storage I/O (model loading, logging)
│   └── Network I/O (intra-node, inter-node for tensor parallelism)
│
├── Datacenter Overhead
│   ├── Cooling energy (captured via PUE)
│   ├── Power distribution losses (captured via PUE)
│   ├── Lighting, security, HVAC for facility
│   └── Networking infrastructure (switches, routers, firewalls)
│
└── Network Transmission
    ├── ISP and backbone network energy
    ├── CDN / edge node energy
    └── Last-mile transmission

SCOPE 3 DOWNSTREAM (End-of-Life)
├── E-waste from hardware retirement
│   ├── Recycling energy and recovery rates
│   ├── Landfill emissions (for non-recycled fraction)
│   └── Amortized with hardware lifecycle
│
└── Data deletion / storage decommissioning
    └── Negligible, included for completeness

NON-GHG IMPACT CATEGORIES
├── Water Consumption
│   ├── Direct cooling water (evaporative cooling towers)
│   ├── Indirect water (electricity generation)
│   └── Embodied water in hardware manufacturing
│
├── Abiotic Resource Depletion
│   ├── Critical minerals (cobalt, lithium, rare earths in GPUs)
│   ├── Copper, aluminum, silicon
│   └── Amortized with hardware
│
└── Land Use
    ├── Datacenter footprint
    └── Electricity generation land use (solar, wind, fossil)

EXCLUDED (with justification)
├── User's local compute — out of scope, varies too widely,
│   and is a sunk cost (laptop runs regardless)
├── Anthropic employee commute — not attributable per-query
└── Software development of Claude itself — R&D overhead,
    not attributable to individual inference
```

### 1.4 Allocation Methodology

AI inference runs on shared, multi-tenant infrastructure. Allocation is the hardest methodological problem.

**Approach: Time-based allocation with utilization correction**

```
User's share of server = (user_inference_time / total_server_uptime) × (1 / avg_utilization)
```

Where:
- `user_inference_time` = prefill time + decode time for the user's request
- `total_server_uptime` = hours the server has been powered on (denominator for amortization)
- `avg_utilization` = fraction of time the GPU is actively serving requests (accounts for idle power draw that must be allocated somewhere)

For embodied emissions:
```
embodied_per_query = (total_embodied_carbon / useful_life_hours) × user_inference_time × (1 / avg_utilization)
```

**Sensitivity analysis**: The plugin MUST report how results change under different allocation assumptions (economic allocation vs. time-based vs. mass-based for hardware).

---

## 2. Impact Categories & Metrics

### 2.1 Primary: Climate Change (gCO2e)

**Operational emissions** (Scope 2):
```
E_inference = E_prefill + E_decode + E_kv_cache + E_cache_ops

E_prefill:
  - Model: Linear scaling with input tokens
  - t_prefill = input_tokens × prefill_time_per_token(model)
  - P_prefill = gpu_power × prefill_utilization + non_gpu_power × non_gpu_util
  - E_prefill = t_prefill × P_prefill × PUE

E_decode:
  - Model: Linear scaling with output tokens
  - t_decode = output_tokens / TPS(model)
  - P_decode = gpu_power × decode_utilization + non_gpu_power × non_gpu_util
  - E_decode = t_decode × P_decode × PUE

E_kv_cache:
  - Model: Power proportional to memory occupancy
  - mem_kv = context_length × kv_cache_bytes_per_token(model)
  - P_kv = mem_kv / total_hbm × hbm_power
  - E_kv = (t_prefill + t_decode) × P_kv × PUE

E_cache_ops:
  - Cache creation: treated as additional write I/O
  - Cache read: reduces effective prefill (SAVES energy)
  - E_cache = cache_creation_tokens × write_energy_per_token
            - cache_read_tokens × prefill_energy_per_token  (net savings)
```

**Grid carbon intensity** — NOT a single fixed number. Options in order of preference:
1. **Real-time marginal intensity** via Electricity Maps API or WattTime (if API key available)
2. **Regional average** based on inferred AWS region (from latency or user config)
3. **Provider-reported intensity** from Anthropic/AWS sustainability reports
4. **Global average fallback** (only if nothing else available), clearly flagged as low-confidence

**Embodied emissions** (Scope 3 upstream):
```
E_embodied = E_gpu_manufacturing + E_server_manufacturing + E_datacenter_construction

E_gpu_manufacturing:
  - Source: Gupta et al. (2022), "Chasing Carbon: The Elusive Environmental Footprint of Computing"
  - NVIDIA H100: ~150 kgCO2e per GPU (manufacturing + packaging)
  - NVIDIA H200: estimated ~170 kgCO2e (scaled by die size and HBM)
  - Amortized: kgCO2e_per_gpu / (useful_life_years × 365.25 × 24 × avg_utilization)
  - Per-query: amortized_rate × num_gpus × user_inference_time

E_server_manufacturing:
  - Source: Dell PowerEdge lifecycle assessments
  - Typical server (excluding GPUs): ~500-800 kgCO2e
  - Amortized over 4-6 year server lifecycle

E_datacenter_construction:
  - Source: Whitehead et al. (2015), datacenter LCA studies
  - Typical: 1000-2000 kgCO2e per kW of IT capacity
  - Amortized over 15-25 year facility life
```

**Network transmission**:
```
E_network = data_transferred_GB × energy_per_GB × grid_CIF

- energy_per_GB: 0.06 kWh/GB (Aslan et al. 2018, updated for 2024 efficiency)
- data_transferred: (input_tokens + output_tokens) × avg_bytes_per_token
```

### 2.2 Secondary: Water Consumption (liters)

```
W_total = W_direct + W_indirect + W_embodied

W_direct:
  - Evaporative cooling water consumed at datacenter
  - W_direct = E_inference_kWh × WUE(datacenter)
  - WUE sources: AWS sustainability report (typ. 0.18-0.20 L/kWh)
  - Google: 1.1 L/kWh average (Li et al. 2023)
  - Varies dramatically by climate (arid vs. humid regions)

W_indirect:
  - Water consumed in electricity generation
  - W_indirect = E_inference_kWh × water_intensity(generation_mix)
  - Coal: ~1.9 L/kWh, Gas: ~0.7 L/kWh, Nuclear: ~2.5 L/kWh
  - Wind/Solar: ~0.0 L/kWh (operational)

W_embodied:
  - Water used in semiconductor manufacturing
  - TSMC reports ~30,000 L per wafer
  - Amortized per GPU die across useful life
```

### 2.3 Tertiary: Resource Depletion (informational)

Not quantified per-query (too uncertain), but reported as educational context:
- "This session used infrastructure containing approximately X mg of cobalt, Y mg of rare earths"
- Sourced from GPU teardown analyses and mining intensity data

---

## 3. Comparative Context Engine

This is the killer feature. Raw numbers mean nothing without context.

### 3.1 Human-Hours Saved Estimation

```
Estimate developer-hours saved per session:
  - Heuristic: (output_tokens / avg_tokens_per_code_task) × avg_human_hours_per_task
  - Calibrated from user feedback over time (optional)
  - Default: 1 session ≈ 0.5-2 developer-hours saved (configurable)

Human work carbon footprint:
  - Commute: avg 8.89 kgCO2 per round-trip (US average, EPA)
  - Office HVAC/lighting: ~0.5 kgCO2 per person-hour
  - Office compute (desktop + monitors): ~0.05 kgCO2 per hour
  - Food/coffee during work: ~0.2 kgCO2 per hour (average diet)
  - Total: ~1.0-2.0 kgCO2 per developer-hour in-office

Net impact = AI_session_CO2 - human_hours_saved × human_hourly_CO2
```

### 3.2 Equivalency Engine

Context-appropriate comparisons (rotate, don't overwhelm):
- **Driving**: X meters driven in average US car
- **Streaming**: X minutes of Netflix streaming
- **Charging**: X% of a smartphone charge
- **Brewing**: X cups of coffee brewed
- **Breathing**: X minutes of human respiration
- **LED bulb**: X minutes of a 10W LED
- **Google searches**: X Google searches (Obringer et al. 2021)

### 3.3 Decision Levers

Actionable insights the user can actually control:
- "Switching to Haiku for this task would save ~X% energy"
- "Running during off-peak hours (11pm-6am local) could reduce grid intensity by ~Y%"
- "Your prompt used 45k input tokens — reducing context by 20% would save ~Z Wh"
- "Caching saved you X Wh this session by avoiding re-prefill"

---

## 4. Model-Specific Parameters

### 4.1 Hardware Profiles (differentiated by model family)

```typescript
// NOT one-size-fits-all. Different models run on different hardware.
interface HardwareProfile {
  name: string;
  numGpus: number;
  gpuModel: string;
  gpuTdp_kW: number;           // per-GPU TDP
  totalGpuPower_kW: number;    // numGpus × gpuTdp
  nonGpuPower_kW: number;      // CPU + memory + NIC + SSD
  hbmPerGpu_GB: number;        // HBM capacity per GPU
  totalHbm_GB: number;
  hbmPower_kW: number;         // HBM power draw (static + dynamic)
  embodiedCO2_kgPerGpu: number;
  embodiedCO2_server_kg: number;
  usefulLifeYears: number;
}

// Haiku: smaller model, likely 1-2 GPUs or batched on shared nodes
// Sonnet: medium, likely 2-4 GPUs
// Opus: large, likely 4-8 GPUs (full DGX or multi-node)
```

### 4.2 Performance Benchmarks

Source: Artificial Analysis (median values), with fallback to self-measurement.

Required per model:
- `TPS` — tokens per second (decode throughput)
- `prefill_tokens_per_second` — input processing rate
- `TTFT_base` — base time-to-first-token (network + scheduling overhead)
- `kv_cache_bytes_per_token` — memory footprint per token in KV-cache

**IMPORTANT**: These benchmarks MUST be dated and versioned. Anthropic continuously optimizes serving infrastructure. Include a `benchmarks_updated` timestamp and a mechanism to refresh.

### 4.3 Utilization Assumptions

```typescript
interface UtilizationBounds {
  gpu_utilization_min: number;  // conservative (low batch, off-peak)
  gpu_utilization_max: number;  // aggressive (high batch, peak)
  gpu_utilization_mean: number; // best estimate for point calculation
  non_gpu_utilization: number;  // relatively stable
  source: string;               // citation
  confidence: 'low' | 'medium' | 'high';
}
```

---

## 5. Uncertainty Quantification

### 5.1 Parameter Uncertainty

Every parameter has an uncertainty classification:

| Parameter | Type | Distribution | Source |
|-----------|------|-------------|--------|
| GPU power (TDP) | Known | Fixed (spec sheet) | NVIDIA datasheets |
| Actual GPU power draw | Uncertain | Uniform [60-100% TDP] | Measurement studies |
| GPU utilization | Highly uncertain | Uniform [min, max] | Jegham, provider estimates |
| PUE | Moderately uncertain | Normal(μ=1.1-1.3, σ=0.05) | Provider sustainability reports |
| CIF (grid carbon) | Uncertain | Varies by method | Grid operator data |
| Embodied carbon per GPU | Highly uncertain | Lognormal | Academic LCA studies |
| Prefill time per token | Moderately uncertain | Normal | Benchmark measurements |
| WUE | Uncertain | Uniform [0.5, 5.0] | Li et al. (2023), climate-dependent |

### 5.2 Reporting

Every result MUST include:
```
Point estimate:  2.81 Wh  |  0.84 gCO2e
90% confidence:  [1.4, 5.6] Wh  |  [0.28, 2.24] gCO2e
Key driver:      GPU utilization assumption (contributes 45% of variance)
```

**Implementation**: Use either:
- Latin Hypercube Sampling (1000 draws) for full distribution — preferred
- Analytical propagation of uncertainty for speed — acceptable for real-time display

---

## 6. Data Architecture

### 6.1 Local Storage (SQLite)

```sql
-- Core session table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- Claude session ID
  project_hash TEXT,             -- SHA-256 hash of project path (privacy)
  started_at TEXT NOT NULL,
  ended_at TEXT,
  model_primary TEXT,            -- most-used model in session

  -- Token counts
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_creation_tokens INTEGER DEFAULT 0,
  total_cache_read_tokens INTEGER DEFAULT 0,
  num_requests INTEGER DEFAULT 0,

  -- Energy (Wh)
  energy_inference_wh REAL,
  energy_embodied_wh REAL,
  energy_network_wh REAL,
  energy_total_wh REAL,
  energy_total_low_wh REAL,     -- lower bound (90% CI)
  energy_total_high_wh REAL,    -- upper bound (90% CI)

  -- Carbon (gCO2e)
  co2_operational_g REAL,
  co2_embodied_g REAL,
  co2_network_g REAL,
  co2_total_g REAL,
  co2_total_low_g REAL,
  co2_total_high_g REAL,

  -- Water (mL)
  water_direct_ml REAL,
  water_indirect_ml REAL,
  water_total_ml REAL,

  -- Context
  grid_cif_used REAL,           -- kgCO2e/kWh actually used
  grid_cif_source TEXT,          -- 'realtime' | 'regional' | 'provider' | 'fallback'
  region_inferred TEXT,          -- AWS region if detected
  pue_used REAL,

  -- Comparative
  human_hours_saved_est REAL,
  human_co2_equivalent_g REAL,
  net_impact_g REAL,             -- AI CO2 - saved human CO2

  -- Metadata
  plugin_version TEXT,
  methodology_version TEXT,      -- track methodology changes
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Per-request detail (for drill-down)
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  energy_wh REAL,
  co2_g REAL,
  timestamp TEXT
);

-- Grid carbon intensity cache
CREATE TABLE grid_intensity_cache (
  region TEXT,
  timestamp TEXT,
  cif_kg_per_kwh REAL,
  source TEXT,
  fetched_at TEXT,
  PRIMARY KEY (region, timestamp)
);

-- User preferences and calibration
CREATE TABLE user_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
```

### 6.2 Configuration

```typescript
interface PluginConfig {
  // Carbon intensity
  grid_cif_method: 'auto' | 'realtime' | 'regional' | 'manual';
  grid_cif_manual_value?: number;     // if method = 'manual'
  electricity_maps_api_key?: string;  // for real-time data
  watttime_api_key?: string;          // alternative provider
  inferred_region?: string;           // AWS region override

  // Scope toggles — let users choose what to include
  include_embodied: boolean;          // default: true
  include_network: boolean;           // default: true
  include_water: boolean;             // default: true

  // Comparative context
  show_comparisons: boolean;          // default: true
  show_human_equivalent: boolean;     // default: true
  human_hours_per_session: number;    // default: 1.0, user-adjustable
  commute_mode: 'car' | 'transit' | 'bike' | 'remote'; // affects human CO2

  // Display
  show_uncertainty: boolean;          // default: true
  statusline_format: 'compact' | 'detailed';
  report_currency: 'gCO2e' | 'Wh' | 'both';

  // Privacy
  allow_anonymous_sync: boolean;      // default: false (opt-in only)
}
```

---

## 7. Plugin Architecture

### 7.1 Claude Code Integration (Hooks)

```
hooks/
├── hooks.json              # Hook definitions
├── session-start.ts        # SessionStart hook: init DB, load config
├── session-stop.ts         # Stop hook: parse transcript, calculate, store
└── notification.ts         # SubAgentStop: include subagent tokens

skills/
├── carbon-report/          # /carbon:report — detailed session/cumulative report
├── carbon-compare/         # /carbon:compare — compare models, times, tasks
├── carbon-configure/       # /carbon:configure — adjust settings
├── carbon-methodology/     # /carbon:methodology — explain the math
└── carbon-export/          # /carbon:export — export data for external analysis

statusline/
├── statusline.ts           # Real-time CO2 + energy + water + net impact
└── format.ts               # Formatting utilities

src/
├── calculator/
│   ├── energy.ts           # Core energy model (prefill + decode + kv + cache)
│   ├── carbon.ts           # CIF lookup and CO2 calculation
│   ├── water.ts            # Water consumption model
│   ├── embodied.ts         # Scope 3 upstream (amortized hardware)
│   ├── network.ts          # Transmission energy
│   ├── uncertainty.ts      # Monte Carlo / analytical uncertainty
│   └── comparative.ts      # Human-equivalent, decision levers
│
├── models/
│   ├── hardware-profiles.ts  # Per-model-family hardware specs
│   ├── benchmarks.ts         # TPS, TTFT, prefill rates (versioned)
│   └── emission-factors.ts   # CIF, WUE, embodied factors (sourced + dated)
│
├── data/
│   ├── grid-intensity.ts     # Real-time CIF fetcher (Electricity Maps / WattTime)
│   ├── store.ts              # SQLite operations
│   └── migrations.ts         # Schema migrations
│
├── parser/
│   ├── transcript.ts         # JSONL transcript parser
│   └── token-counter.ts      # Token usage extraction + dedup
│
└── utils/
    ├── config.ts             # Config management
    ├── privacy.ts            # Path hashing, anonymization
    └── formatting.ts         # Units, rounding, equivalencies
```

### 7.2 Statusline Design

Compact (default):
```
CO2: 1.2g [0.5-2.4] | Net: -45g saved | Water: 3mL
```

Detailed:
```
Scope2: 0.9g + Embodied: 0.2g + Net: 0.1g = 1.2g CO2e [90%CI: 0.5-2.4g]
Energy: 4.1Wh | Water: 3mL | Saved ~1.2 dev-hrs (~45g human CO2)
```

### 7.3 Report Command Output

The `/carbon:report` skill should produce a structured report:

```
SESSION CARBON REPORT
=====================
Session: abc123 | Duration: 23 min | Model: claude-sonnet-4.6

TOKENS
  Input:  45,201 (incl. 12,400 cache-read)
  Output: 3,847
  Cache created: 8,200

ENERGY BREAKDOWN
  Prefill (input processing):    1.82 Wh  [1.0 - 3.2]
  Decode (output generation):    0.94 Wh  [0.5 - 1.6]
  KV-cache memory:               0.31 Wh  [0.1 - 0.6]
  Cache ops (net):              -0.22 Wh  (saved by cache reads)
  Network transmission:          0.04 Wh
  ─────────────────────────────────────
  Total energy:                  2.89 Wh  [1.4 - 5.3]

CARBON FOOTPRINT
  Operational (Scope 2):         0.72 gCO2e
  Embodied (Scope 3):           0.18 gCO2e
  Network:                       0.01 gCO2e
  ─────────────────────────────────────
  Total:                         0.91 gCO2e  [0.36 - 1.82]

  Grid intensity used: 0.248 kgCO2/kWh (us-east-1, regional avg)
  Confidence: Medium (regional average, not real-time)

WATER
  Direct (cooling):             0.52 mL
  Indirect (electricity):       1.84 mL
  Total:                        2.36 mL

COMPARATIVE CONTEXT
  Equivalent to:
    - Driving 2.7 meters in a car
    - 1.1 minutes of Netflix streaming
    - 0.3% of a smartphone charge
    - 4.2 Google searches

  Human work replaced (est. 1.2 hours):
    - Office work CO2: ~45 gCO2e (commute + HVAC + compute)
    - Net impact: -44.1 gCO2e (AI SAVED carbon vs. human alternative)

DECISION LEVERS
  - Using Haiku for simple tasks: would save ~60% energy
  - Reducing input context by 10k tokens: saves ~0.4 Wh
  - Running at 2am local time: grid intensity drops ~30%

METHODOLOGY
  Version: 1.0.0 | ISO 14040/14044 compliant
  Benchmarks updated: 2026-03-15
  Key uncertainty driver: GPU utilization (contributes 42% of variance)
```

---

## 8. Data Sources & References

### 8.1 Required Data (with update schedule)

| Data | Source | Update Frequency |
|------|--------|-----------------|
| Model TPS / TTFT | Artificial Analysis API | Monthly |
| GPU specs (TDP, HBM) | NVIDIA datasheets | Per GPU generation |
| Grid carbon intensity | Electricity Maps / WattTime | Real-time (cached 1hr) |
| Regional avg CIF | IEA / EIA / EU-ETS | Annual |
| PUE | AWS/GCP sustainability reports | Annual |
| WUE | Provider sustainability reports + Li et al. | Annual |
| GPU embodied carbon | Gupta et al. 2022, updated estimates | Per GPU generation |
| Server embodied carbon | Dell/HPE lifecycle reports | Per server generation |
| Human activity emissions | EPA, IEA, academic sources | Annual |
| Electricity gen. water intensity | NREL, Macknick et al. | Stable (5yr refresh) |

### 8.2 Key Academic References

1. **Jegham et al. (2025)** — "How Hungry is AI?" arXiv 2505.09598v6. Infrastructure-aware energy estimation framework.
2. **Gupta et al. (2022)** — "Chasing Carbon: The Elusive Environmental Footprint of Computing." IEEE Micro. Embodied carbon methodology.
3. **Li et al. (2023)** — "Making AI Less Thirsty." Water footprint of AI training and inference.
4. **Aslan et al. (2018)** — "Electricity Intensity of Internet Data Transmission." Network energy model.
5. **Patterson et al. (2021)** — "Carbon Emissions and Large Neural Networks." Google's operational carbon framework.
6. **Dodge et al. (2022)** — "Measuring the Carbon Intensity of AI in Cloud Instances." Methodology for multi-tenant allocation.
7. **Luccioni et al. (2023)** — "Power Hungry Processing." Inference energy measurement across models.
8. **Whitehead et al. (2015)** — "Life Cycle Assessment of a Datacenter." Embodied + operational full LCA.
9. **Obringer et al. (2021)** — "The overlooked environmental footprint of increasing Internet use." Per-activity comparisons.
10. **EPA (2024)** — "Greenhouse Gas Equivalencies Calculator." Conversion factors for public communication.

---

## 9. Development Phases

### Phase 1: Core Engine (MVP)
- [ ] Transcript parser (JSONL → token counts per request)
- [ ] Energy model: prefill + decode + KV-cache (input-token-aware)
- [ ] Per-model-family hardware profiles (Haiku ≠ Sonnet ≠ Opus)
- [ ] Carbon calculation with regional CIF (static table, no API yet)
- [ ] SQLite storage with proper schema and migrations
- [ ] Basic statusline (CO2 point estimate)
- [ ] Session start/stop hooks
- [ ] Unit tests for calculator with worked examples

### Phase 2: Uncertainty & Water
- [ ] Monte Carlo uncertainty engine (Latin Hypercube, 1000 draws)
- [ ] Report uncertainty ranges in all outputs
- [ ] Water consumption model (direct + indirect)
- [ ] Embodied carbon (amortized GPU + server + datacenter)
- [ ] Network transmission energy
- [ ] Enhanced statusline with ranges

### Phase 3: Intelligence Layer
- [ ] Comparative context engine (human-hours, equivalencies)
- [ ] Decision lever recommendations
- [ ] `/carbon:report` skill with full breakdown
- [ ] `/carbon:compare` skill (model comparison, time-of-day)
- [ ] Real-time grid CIF via Electricity Maps API (optional)
- [ ] Cache token energy accounting (creation cost, read savings)

### Phase 4: Public Release
- [ ] `/carbon:methodology` skill (explain the math, cite sources)
- [ ] `/carbon:export` skill (CSV/JSON for external analysis)
- [ ] Configuration UI (`/carbon:configure`)
- [ ] Benchmark auto-refresh mechanism
- [ ] Documentation site / blog post
- [ ] LinkedIn / Twitter launch content
- [ ] Plugin registry submission

---

## 10. Design Principles

1. **Accuracy over simplicity** — Report what we know, what we don't, and how confident we are. Never present a single number without context.

2. **Actionable over alarming** — Every report should include at least one thing the user can actually do differently. Carbon anxiety without agency is useless.

3. **Transparent methodology** — Every number should be traceable to a source, a formula, and an assumption. The `/carbon:methodology` command should make the entire calculation auditable.

4. **Privacy by default** — No session content leaves the machine. Token counts and energy data are stored locally. Any sync is opt-in and anonymized.

5. **Configurable scope** — Users can toggle impact categories on/off. Some may only want Scope 2 operational carbon. Others want the full picture. Both are valid.

6. **Net impact framing** — Always show what the AI session replaced, not just what it cost. The framing should be "net environmental impact" not "environmental damage."

7. **Dated and versioned** — Every emission factor, benchmark, and methodology choice is versioned. When data updates, old sessions keep their original calculations but can be recalculated.

8. **LCA rigor, developer UX** — The methodology should satisfy an LCA practitioner's scrutiny, but the interface should be as simple as a statusline and a slash command.

---

## 11. Differentiation from Existing Tools

| Aspect | CNaught Carbonlog | This Plugin |
|--------|------------------|-------------|
| Scope | Scope 2 operational only | Scope 2 + Scope 3 (embodied) + water |
| Input tokens | Ignored (fixed TTFT) | Scaled with input token count |
| Hardware profiles | One-size-fits-all | Per model family |
| Carbon intensity | Fixed 0.30 kgCO2e/kWh | Regional, time-varying, multi-source |
| Uncertainty | Point estimate only | Full ranges with key drivers |
| Water | Not tracked | Direct + indirect + embodied |
| Comparative context | Basic equivalencies | Human-hours saved, net impact, decision levers |
| Cache tokens | Tracked but unused | Modeled (creation cost, read savings) |
| Methodology | Partially documented | Fully auditable, ISO-aligned |
| User agency | Awareness only | Actionable recommendations |

---

## 12. Tech Stack

- **Runtime**: Bun (for Claude Code hook compatibility)
- **Language**: TypeScript (strict mode)
- **Database**: SQLite via Bun's built-in driver (WAL mode)
- **Testing**: Bun test runner
- **Schema validation**: Zod
- **No external dependencies for core calculation** — emission factors and formulas are self-contained
- **Optional**: Electricity Maps API client, WattTime API client (for real-time CIF)

---

## 13. File Naming & Conventions

- All source in `src/`
- All hooks in `hooks/`
- All skills in `skills/`
- Tests co-located: `foo.test.ts` next to `foo.ts`
- Config types in `src/types.ts`
- Constants (emission factors, hardware specs) in `src/models/` — always with source citations in comments
- Snake_case for database columns, camelCase for TypeScript
- Every emission factor constant MUST have a comment citing: source, year, and confidence level

---

*This plugin is built by an LCA practitioner. The methodology is the product, not the code.*
