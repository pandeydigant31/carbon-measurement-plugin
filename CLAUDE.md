# Carbon Measurement Plugin — Claude Code Project Instructions

## What This Is

A Claude Code plugin for rigorous, LCA-grounded carbon and environmental impact measurement of AI coding sessions. Built by an LCA practitioner — the methodology is the product.

## Key Files

- `PROMPT.md` — Full methodology, architecture, and project spec. READ THIS FIRST.
- `src/calculator/` — Core calculation engine (energy, carbon, water, embodied, uncertainty)
- `src/models/` — Hardware profiles, benchmarks, emission factors (ALL must cite sources)
- `hooks/` — Claude Code hook integration
- `skills/` — Slash commands (/carbon:report, /carbon:compare, etc.)
- `agents/` — Harness agent definitions (design, code, LCA). See § Harness Agents below.

## Rules

1. **Every emission factor MUST have a source citation in a comment** — no magic numbers. Format: `// Source: Author (Year), value, confidence: high|medium|low`
2. **Never present a point estimate without uncertainty range** — always compute and propagate bounds.
3. **Input tokens MUST affect energy calculation** — this is our key differentiation. Scale prefill time with input token count.
4. **Different hardware profiles for different model families** — Haiku != Sonnet != Opus.
5. **Test with worked examples** — every calculator test should include a human-readable worked example in comments.
6. **No external API calls in the critical path** — grid CIF lookup is cached/optional. Core calculation is offline.
7. **Privacy: never log or transmit session content** — only token counts and calculated metrics.
8. **ISO 14040/14044 alignment** — system boundary, functional unit, allocation, and impact categories are defined in PROMPT.md. Follow them.

## Tech Stack

- Bun runtime + TypeScript (strict)
- SQLite (Bun built-in, WAL mode)
- Zod for validation
- Bun test runner
- No heavy deps for core — emission factors are self-contained constants

## Development Phases

Phase 1 (MVP): Core engine — transcript parser, energy model, carbon calc, SQLite, statusline, hooks
Phase 2: Uncertainty (Monte Carlo), water, embodied carbon, network energy
Phase 3: Comparative context, decision levers, slash commands, real-time CIF
Phase 4: Docs, export, public release

---

## Harness Agents

Three specialized review agents live in `agents/`. They are invoked as subagents during development to enforce quality across three orthogonal dimensions.

### When to Invoke Each Agent

| Agent | File | Trigger | What It Does |
|-------|------|---------|-------------|
| **Design** | `agents/design.md` | Any change to user-facing output (statusline, reports, error messages, skill output) | Reviews information hierarchy, numeric presentation, emotional framing, accessibility, and consistency |
| **Code** | `agents/code.md` | Any code change (new modules, refactors, bug fixes) | Reviews performance (50ms budget), type safety, error handling, architecture boundaries, test coverage, and security |
| **LCA** | `agents/lca.md` | Any change to calculations, emission factors, system boundary, or reported results | Audits against ISO 14040/14044, validates factors (source, vintage, geography, technology), checks dimensional analysis, tests monotonicity, and verifies uncertainty propagation |

### Mandatory Review Gates

These gates MUST pass before a phase is considered complete:

**Phase 1 gate**: All three agents review the MVP
- Design: statusline format, basic report output
- Code: hook performance, calculator purity, DB schema, test coverage
- LCA: energy model correctness, factor sources, dimensional analysis, order-of-magnitude sanity (Test 1)

**Phase 2 gate**: LCA agent is primary reviewer
- LCA: Monte Carlo implementation, distribution choices, correlation handling, uncertainty reporting format
- Code: Performance with Monte Carlo in the hot path (must stay under 50ms)
- Design: Uncertainty presentation (ranges, key drivers, confidence labels)

**Phase 3 gate**: Design agent is primary reviewer
- Design: Full report template, comparative context framing, decision lever UX, configuration flow
- LCA: Comparative context methodology (system expansion, avoided burden, equivalency accuracy)
- Code: Slash command architecture, API client isolation, cache invalidation

**Phase 4 gate**: All three agents produce a final sign-off report
- Each agent produces a pass/fail with itemized findings
- All three must pass before public release

### How to Invoke

When working in this project, invoke agents as subagents with the full agent definition as context:

```
Agent: Read agents/design.md, then review [the specific files/output being changed]
Agent: Read agents/code.md, then review [the specific code change]
Agent: Read agents/lca.md, then review [the specific calculation or factor change]
```

For phase gates, invoke all three in parallel against the complete phase deliverables.

### Agent Interaction Rules

- Agents review independently — they may conflict (e.g., Design wants fewer numbers, LCA wants more detail). **Resolve conflicts by applying progressive disclosure**: full rigor in the data, simplified presentation in the default view, detail available on demand.
- LCA agent has **veto power** on any methodological claim. If LCA says a number is wrong, it's wrong regardless of what Design or Code prefer.
- Code agent has **veto power** on performance. If a feature pushes the stop hook past 50ms, it must be deferred or optimized, even if LCA and Design want it.
- Design agent has **veto power** on user-facing presentation. Internal calculations can be ugly, but anything the user sees must pass Design review.
