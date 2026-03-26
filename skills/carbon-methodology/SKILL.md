---
name: carbon:methodology
description: Explain the carbon measurement methodology, sources, and assumptions
---

# Carbon Measurement Methodology

Explain the full calculation methodology, emission factor sources, system boundary, and uncertainty approach used by the Carbon Measurement Plugin. This is a transparency/audit command — it does not read session data.

## Instructions

Output the following sections in order. This is a reference document, so completeness matters more than brevity.

### Section 1: System Boundary Diagram

```
SYSTEM BOUNDARY: CRADLE-TO-GATE + USE PHASE (ISO 14040/14044)
==============================================================

SCOPE 3 UPSTREAM (Embodied / Capital Goods)
├── GPU Manufacturing
│   ├── Semiconductor fabrication (wafer, lithography, etching)
│   ├── HBM memory production
│   ├── Packaging and assembly
│   └── Amortized over useful life (3-5 years, utilization-adjusted)
├── Server Manufacturing (non-GPU)
│   ├── CPU, RAM, SSDs, networking cards
│   └── Amortized over useful life (4-6 years)
└── Datacenter Construction
    ├── Building, cooling, electrical infrastructure
    └── Amortized over useful life (15-25 years)

SCOPE 2 (Operational — Electricity)
├── GPU Inference Energy
│   ├── Prefill phase (scales linearly with input tokens)
│   ├── Decode phase (scales linearly with output tokens)
│   ├── KV-cache memory occupancy power
│   └── Cache operations (creation cost, read savings)
├── Non-GPU Server Energy (CPU, DRAM, NIC, SSD)
├── Datacenter Overhead (cooling, power distribution via PUE)
└── Network Transmission (ISP, backbone, CDN, last-mile)

SCOPE 3 DOWNSTREAM (informational only)
├── E-waste from hardware retirement
└── Data deletion / storage decommissioning

NON-GHG IMPACTS
├── Water consumption (direct cooling + indirect electricity generation)
└── Resource depletion (informational — not quantified per query)

EXCLUDED (with justification)
├── User's local compute (sunk cost, out of scope)
├── Anthropic employee commute (not attributable per-query)
└── Claude model training (R&D overhead, not inference-attributable)
```

### Section 2: Key Formulas

Present each formula with variable definitions:

**Energy Model** (4-component decomposition):
```
E_total = E_prefill + E_decode + E_kv_cache + E_cache_ops

E_prefill = t_prefill × P_prefill × PUE
  where t_prefill = input_tokens / prefill_tokens_per_second
        P_prefill = (num_gpus × gpu_tdp × gpu_utilization) + (non_gpu_power × non_gpu_util)

E_decode = t_decode × P_decode × PUE
  where t_decode = output_tokens / decode_TPS
        P_decode = (num_gpus × gpu_tdp × gpu_utilization) + (non_gpu_power × non_gpu_util)

E_kv_cache = (t_prefill + t_decode) × P_kv × PUE
  where P_kv = (context_length × kv_bytes_per_token / total_hbm_bytes) × hbm_power

E_cache_ops = cache_creation_tokens × write_energy_per_token
            - cache_read_tokens × prefill_energy_per_token  (net savings)
```

**Carbon Model**:
```
CO2_operational = E_inference × CIF
  where CIF = grid carbon intensity factor (kgCO2e/kWh)
  (Wh × kgCO2e/kWh = gCO2e after unit normalization)

CO2_embodied = (embodied_CO2_per_gpu × num_gpus / useful_life_hours) × inference_time × (1/utilization)

CO2_network = data_transferred_GB × network_energy_per_GB × CIF
  where data_GB = (input_tokens + output_tokens) × avg_bytes_per_token / 1e9
```

**Water Model**:
```
W_direct = E_inference_kWh × WUE  (evaporative cooling)
W_indirect = E_inference_kWh × water_intensity_of_grid  (power generation water)
W_total = W_direct + W_indirect
```

**Allocation** (shared infrastructure):
```
User share = (user_inference_time / total_server_uptime) × (1 / avg_utilization)
```

### Section 3: Emission Factor Sources

Present as a table with source, value, date, geographic scope, and confidence:

| Factor | Value | Source | Date | Scope | Confidence |
|--------|-------|--------|------|-------|------------|
| Grid CIF: us-east-1 | 0.380 kgCO2e/kWh | EIA, PJM Interconnection | 2023 | Virginia, USA | High |
| Grid CIF: us-west-2 | 0.100 kgCO2e/kWh | EIA, BPA/WECC Northwest | 2023 | Oregon, USA | High |
| Grid CIF: eu-west-1 | 0.290 kgCO2e/kWh | IEA | 2023 | Ireland | High |
| Grid CIF: eu-central-1 | 0.350 kgCO2e/kWh | IEA | 2023 | Germany | High |
| Grid CIF: ap-northeast-1 | 0.460 kgCO2e/kWh | IEA | 2023 | Japan | High |
| Grid CIF: ap-southeast-1 | 0.410 kgCO2e/kWh | IEA | 2023 | Singapore | High |
| Grid CIF: global fallback | 0.490 kgCO2e/kWh | IEA global average | 2023 | Global | Medium |
| PUE (default) | 1.13 | AWS/Google sustainability reports | 2023 | Hyperscale DCs | High |
| PUE (range) | 1.08-1.20 | Uptime Institute survey | 2023 | Hyperscale DCs | High |
| WUE (default) | 1.8 L/kWh | Li et al. "Making AI Less Thirsty" | 2023 | US average | Medium |
| WUE (range) | 0.5-5.0 L/kWh | Li et al. | 2023 | US regional | Medium |
| Indirect water | 1.8 L/kWh | Gleick (1994), Macknick et al. (2012) | 2012 | US thermoelectric | Medium |
| Network energy | 0.06 kWh/GB | Aslan et al. "Electricity Intensity of Internet Data" | 2018 | Global | Medium |
| Bytes per token | 4 bytes | BPE tokenization empirical average | 2024 | English text | Medium |
| GPU embodied (H100) | ~150 kgCO2e | Gupta et al. "Chasing Carbon" | 2022 | Manufacturing | Low |
| Server embodied | ~500-800 kgCO2e | Dell PowerEdge LCA | 2022 | Manufacturing | Low |
| Car emissions | 400 gCO2e/mile | EPA Inventory | 2024 | US fleet avg | High |
| Google search | 0.3 gCO2e/search | Google Environmental Report | 2023 | Global | Medium |
| Netflix streaming | 36 gCO2e/hour | IEA | 2023 | Global avg grid | Medium |
| Smartphone charge | 8 gCO2e/charge | EPA | 2024 | US average | Medium |
| Human breathing | 200 gCO2e/hour | EPA metabolic baseline | 2024 | Biogenic | High |
| Human work (car commute) | 1,850 gCO2e/hour | EPA + IEA aggregated | 2024 | US in-office | Medium |
| Human work (remote) | 350 gCO2e/hour | IEA home energy estimates | 2023 | US remote | Medium |

### Section 4: Uncertainty Methodology

Explain the approach:

**Parameter classification:**

| Parameter | Distribution | Range | Variance Contribution |
|-----------|-------------|-------|----------------------|
| GPU utilization | Uniform [min, max] | 30-90% | ~40-50% (dominant) |
| PUE | Normal(1.13, 0.05) | 1.08-1.20 | ~10-15% |
| Grid CIF | Varies by source | region-dependent | ~15-25% |
| Embodied CO2/GPU | Lognormal | 100-250 kgCO2e | ~5-10% |
| WUE | Uniform | 0.5-5.0 L/kWh | water-only |
| Prefill rate | Normal | benchmark ± 20% | ~5-10% |

**Propagation method:**
- Real-time display: analytical bounds propagation (fast, conservative)
- Full reports: Latin Hypercube Sampling with 1,000 draws for 90% confidence intervals
- All reported ranges are 90% CI (5th-95th percentile)
- Key uncertainty driver is identified as the parameter contributing the largest fraction of total variance

**Confidence labels:**
- High: based on measured data or official reports, variance < 20%
- Medium: based on peer-reviewed estimates with moderate extrapolation, variance 20-50%
- Low: based on rough estimates or highly variable parameters, variance > 50%

### Section 5: Standards Compliance

- **ISO 14040:2006** — Principles and framework for Life Cycle Assessment
- **ISO 14044:2006** — Requirements and guidelines for LCA
- **GHG Protocol Scope 2 Guidance** — location-based method for electricity emissions
- **GHG Protocol Scope 3 Standard** — Category 2 (capital goods) for embodied emissions
- **Functional unit**: one Claude Code session (secondary: per 1,000 output tokens, per developer-hour saved)
- **Allocation**: time-based with utilization correction on shared multi-tenant infrastructure

### Section 6: Known Limitations

1. **GPU utilization is unobservable** — we estimate from external benchmarks, not actual telemetry. This is the single largest source of uncertainty.
2. **Embodied carbon estimates are sparse** — semiconductor LCA data is limited; GPU-specific studies are few.
3. **Grid CIF is a snapshot** — regional averages do not capture hourly variation. Real-time CIF (via Electricity Maps) improves this but requires an API key.
4. **Model architecture is proprietary** — parameter counts, layer configurations, and serving infrastructure details for Claude models are not public. Hardware profiles are informed estimates.
5. **Water data is climate-dependent** — WUE varies 10x between arid and humid regions. The default is a US average.
6. **Network energy is a rough estimate** — the Aslan et al. (2018) figure is widely cited but debated; actual values depend on routing and infrastructure age.

### Formatting Rules

- Present all formulas in code blocks for readability
- Every emission factor must show its source and date
- Tables must be aligned and readable in a terminal
- Do not editorialize or minimize the limitations — transparency is the product
