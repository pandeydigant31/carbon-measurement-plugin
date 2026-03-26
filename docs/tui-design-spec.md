# Carbon Measurement Plugin -- TUI Design Specification

## Design Philosophy

Build a visually compelling, "sustainable aesthetic" terminal experience that:
- Makes developers **care** about their carbon footprint through visual storytelling
- Uses green tones, organic motifs (trees, leaves, water), and rich Unicode art
- Stays recognizable as a Claude Code tool (box-drawing, minimal chrome, clean alignment)
- Targets the emotion of **AGENCY**: "I see this, I understand it, I can act on it"

---

## Table of Contents

1. [Color Palette](#1-color-palette)
2. [Visual Elements Library](#2-visual-elements-library)
3. [View 1: Enhanced Statusline](#3-view-1-enhanced-statusline)
4. [View 2: Session Dashboard](#4-view-2-session-dashboard)
5. [View 3: Model Comparison](#5-view-3-model-comparison)
6. [View 4: Trend View](#6-view-4-trend-view)
7. [View 5: Live Dashboard](#7-view-5-live-dashboard)
8. [Implementation Notes](#8-implementation-notes)
9. [Skill Mapping](#9-skill-mapping)

---

## 1. Color Palette

### ANSI 256-Color Sustainable Palette

```
Primary Colors (Green Family)
------------------------------
Name              ANSI 256   Hex       Use
Forest Green      34         #228B22   Primary text, titles, borders
Emerald           35         #2E8B57   Emphasis, active elements
Lime              82         #87FF00   Positive values (savings, net saved)
Dark Green        22         #005F00   Subtle backgrounds, muted text
Spring Green      48         #00FF87   Sparkline peaks, progress fills

Accent Colors
------------------------------
Water Blue        39         #00AFFF   Water metrics, hydration visuals
Sky Blue          75         #5FAFFF   Secondary data, grid info
Amber             214        #FFAF00   Warning: moderate carbon intensity
Soft Red          196        #FF0000   Danger: high carbon intensity
Coral             209        #FF875F   Elevated values, "added" labels

Neutral Colors
------------------------------
White             15         #FFFFFF   Primary text on dark backgrounds
Light Gray        248        #A8A8A8   Secondary text, labels
Dim Gray          240        #585858   Borders, separators, muted info
Dark (BG)         -          default   Terminal background (inherit)

Semantic Mapping
------------------------------
Carbon saved      -> Lime (82)       / Spring Green (48)
Carbon added      -> Coral (209)     / Soft Red (196)
Net impact hero   -> Bold + Lime     (if saved) / Bold + Coral (if added)
Energy metrics    -> Forest Green (34)
Water metrics     -> Water Blue (39)
Uncertainty range -> Light Gray (248)
Methodology/fine  -> Dim Gray (240)
```

### ANSI Escape Code Reference

```typescript
// Color utility constants
const C = {
  reset:       "\x1b[0m",
  bold:        "\x1b[1m",
  dim:         "\x1b[2m",

  // Foreground (256-color)
  forest:      "\x1b[38;5;34m",
  emerald:     "\x1b[38;5;35m",
  lime:        "\x1b[38;5;82m",
  darkGreen:   "\x1b[38;5;22m",
  spring:      "\x1b[38;5;48m",
  waterBlue:   "\x1b[38;5;39m",
  skyBlue:     "\x1b[38;5;75m",
  amber:       "\x1b[38;5;214m",
  softRed:     "\x1b[38;5;196m",
  coral:       "\x1b[38;5;209m",
  white:       "\x1b[38;5;15m",
  gray:        "\x1b[38;5;248m",
  dimGray:     "\x1b[38;5;240m",

  // Background (256-color)
  bgDarkGreen: "\x1b[48;5;22m",
  bgForest:    "\x1b[48;5;34m",
};
```

### Fallback Strategy (No Color / Light Terminals)

Every color-coded element has a text fallback:
- Green positive -> `[SAVED]` prefix
- Red negative -> `[ADDED]` prefix
- Bars use `#` and `.` instead of colored blocks
- All info is conveyed through text + Unicode, never color alone

---

## 2. Visual Elements Library

### 2a. Trees (CO2 Savings Visualization)

Trees grow based on accumulated CO2 savings. Three sizes:

```
Seedling (< 10g saved)        Sapling (10-100g saved)       Full Tree (> 100g saved)
                                        *
      .                            /|\                           /\
     /|\                          / | \                         /  \
      |                          /  |  \                       /    \
                                    |                         / /  \ \
                                                             /  /  \  \
                                                                ||
                                                                ||
```

Rendered with green ANSI:

```
Seedling                  Sapling                   Full Tree

  \x1b[38;5;82m.\x1b[0m                   \x1b[38;5;82m  *  \x1b[0m                  \x1b[38;5;82m  /\\\x1b[0m
  \x1b[38;5;34m/|\\\x1b[0m                  \x1b[38;5;82m /|\\ \x1b[0m                  \x1b[38;5;82m /  \\\x1b[0m
  \x1b[38;5;94m |\x1b[0m                   \x1b[38;5;82m/ | \\\x1b[0m                  \x1b[38;5;34m/    \\\x1b[0m
                         \x1b[38;5;94m  |  \x1b[0m                  \x1b[38;5;34m/ /  \ \\\x1b[0m
                                                    \x1b[38;5;94m  ||\x1b[0m
```

Compact inline tree (for statusline):

```
Stage 0 (no savings):    .
Stage 1 (< 5g saved):    |
Stage 2 (< 20g saved):   /|\
Stage 3 (< 50g saved):  //|\\
Stage 4 (< 100g saved): *//|\\*
Stage 5 (>= 100g):      *//|\\*  (bold green)
```

### 2b. Water Drops

```
Single Drop (< 2 mL)    Double Drop (2-5 mL)     Triple Drop (> 5 mL)
        ,                    ,       ,                ,   ,   ,
       ( )                  ( )     ( )              ( ) ( ) ( )
        '                    '       '                '   '   '
```

Inline water drops (for statusline):

```
0 mL:     -
< 1 mL:   ~
1-3 mL:   ~~
3-5 mL:   ~~~
> 5 mL:   ~~~~
```

### 2c. Leaves (Positive Impact Indicators)

```
Single Leaf     Double Leaf     Triple Leaf (flourishing)
    _              _ _              _ _ _
   / \            / \ \            / \ \ \
  (   )          (   ) )          (   ) ) )
   \_/            \_/ /            \_/ / /
```

Inline: Use Unicode leaf characters
```
Minimal:   ~
Growing:   ~{
Thriving:  ~{{
```

### 2d. Carbon Meter (Speedometer Gauge)

Horizontal gauge for carbon intensity:

```
LOW                    MED                    HIGH
 |=====|=====|=====|=====|=====|=====|=====|=====|
 [################>                               ]   0.12 kgCO2/kWh
 ^-- green --^        ^-- amber --^    ^-- red --^
```

Vertical gauge (compact):

```
  HIGH |
       |
       |
  MED  |###
       |###
  LOW  |###   <-- your grid
       +---
```

### 2e. Sparklines

Using Unicode Braille and Block characters:

```
Block-element sparkline (simple, wide compatibility):
  Session CO2: [__..--==##==--..__|   1.2g peak
                                     0.0g base

Braille sparkline (compact, beautiful in modern terminals):
  CO2 trend: ⣀⣠⣤⣶⣿⣷⣶⣤⣠⣀  peak: 1.2g

Block quarters sparkline:
  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁
```

Sparkline character mapping (value 0-1 -> character):

```typescript
const SPARK_CHARS = "▁▂▃▄▅▆▇█";  // 8 levels

function sparkline(values: number[]): string {
  const max = Math.max(...values);
  if (max === 0) return "▁".repeat(values.length);
  return values.map(v => {
    const idx = Math.round((v / max) * 7);
    return SPARK_CHARS[Math.min(idx, 7)];
  }).join("");
}
```

### 2f. Progress Bars (Green Gradient)

```
Standard bar (10 chars wide):
  ████████░░  80%

Green gradient bar (ANSI colored):
  [\x1b[38;5;22m█\x1b[38;5;28m█\x1b[38;5;34m█\x1b[38;5;40m█\x1b[38;5;46m█\x1b[38;5;82m█\x1b[38;5;240m░░░░\x1b[0m]  60%

Thin bar (using Unicode):
  [━━━━━━━━╍╍]  80%

Rounded bar:
  ╺━━━━━━━━╍╍╸  80%
```

### 2g. Equivalency Icons (Inline)

```
Car:      =D-
Phone:    [|]
Coffee:   c[_]
TV/Netflix: [>]
Search:   (?)
LED:      (*)
Breathing: (o)
Tree:     /|\
Water:    ~~~
```

---

## 3. View 1: Enhanced Statusline

### Current Design
```
CO2: ~1.2 g [net -44 g saved] | E: 2.9 Wh | W: 3 mL
```

### Enhanced Design -- Compact (< 80 chars)

```
 /|\ CO2: ~1.2g [-44g saved] ▁▂▃▅▃▂ | E: 2.9Wh | W: 3mL ~~
```

Breakdown:
- `/|\` -- Tree icon, growing with session savings (green)
- `CO2: ~1.2g` -- Total (forest green text)
- `[-44g saved]` -- Net impact hero (lime/bold)
- `▁▂▃▅▃▂` -- 6-char sparkline of per-request CO2 (spring green)
- `E: 2.9Wh` -- Energy (emerald)
- `W: 3mL` -- Water (water blue)
- `~~` -- Water intensity indicator

### Color-Coded Threshold Behavior

```
Net Impact < -50g:    Lime text,    full tree /|\  "You're making a difference"
Net Impact < -10g:    Green text,   sapling  /|   "On track"
Net Impact ~ 0:       White text,   seedling  .   "Neutral session"
Net Impact > 0:       Amber text,   no tree      "Consider model switching"
Net Impact > +10g:    Coral text,   no tree      "High-impact session"
```

### Enhanced Design -- Detailed (2 lines, < 120 chars each)

```
 /|\ NET: -44g saved | CO2: ~1.2g [0.5-2.4g] (scope2: 0.9 + embodied: 0.2 + net: 0.1)
     E: 2.9Wh ████████░░ | W: 3mL ~~ | Grid: 0.39 kgCO2/kWh (us-east-1) | ▁▂▃▅▃▂
```

### Implementation: StatuslineData Changes

```typescript
export interface EnhancedStatuslineData extends StatuslineData {
  perRequestCO2: number[];      // last 8 request CO2 values for sparkline
  treeStage: 0 | 1 | 2 | 3 | 4 | 5;  // based on cumulative savings
  waterIntensity: 0 | 1 | 2 | 3 | 4;  // water drop indicator level
  gridCif: number | null;       // for color-coding threshold
  region: string | null;        // for display
}
```

---

## 4. View 2: Session Dashboard (`/carbon:report`)

### Full ASCII Mockup

```
╭──────────────────────────────────────────────────────────────────────────────╮
│                      SESSION CARBON REPORT                                   │
│                      ═══════════════════                                      │
│  Session: a1b2c3d  |  Duration: 47 min  |  Model: claude-sonnet-4-20250514       │
╰──────────────────────────────────────────────────────────────────────────────╯

  ╭─────────────────────────────────────────────╮
  │       NET IMPACT:  -44.0 g CO2e saved       │
  │    vs. doing this work manually (est.)      │
  │                                             │
  │    AI session:     ~1.2 gCO2e               │
  │    Human alt:     ~45.2 gCO2e (car commute) │
  │    You saved:      44.0 gCO2e               │
  │    Confidence:     low (est. 1.5 dev-hours) │
  ╰─────────────────────────────────────────────╯

  TOKENS
  ───────────────────────────────────────────
    Input:   45,201 (incl. 12,340 cache-read)
    Output:  8,923
    Cache:   15,400 created
    Total:   69,524 tokens processed

  ENERGY BREAKDOWN                              2.89 Wh
  ───────────────────────────────────────────
    Processing input (prefill)   1.82 Wh  ██████████████████░░░░░░░░  63%
    Generating response (decode) 0.94 Wh  █████████░░░░░░░░░░░░░░░░  33%
    Memory overhead (KV-cache)   0.31 Wh  ███░░░░░░░░░░░░░░░░░░░░░░  11%
    Cache efficiency            -0.22 Wh  saved by prompt caching
    Network                      0.04 Wh  ~negligible
                                 ─────
    Total                        2.89 Wh  [1.2 - 5.8 Wh]

    == powering a 10W LED for 17 minutes

  CARBON FOOTPRINT                              ~1.2 gCO2e
  ───────────────────────────────────────────

    Breakdown:
    ╭────────────────────────────────────────────────╮
    │  Operational (Scope 2)  ████████████░░░  75%   │
    │  Embodied (Scope 3)     ███░░░░░░░░░░░░  17%   │
    │  Network                █░░░░░░░░░░░░░░   8%   │
    ╰────────────────────────────────────────────────╯

    Scope 2 (electricity):   0.90 gCO2e
    Embodied (hardware):     0.20 gCO2e
    Network:                 0.10 gCO2e
                             ──────────
    Total:                  ~1.20 gCO2e  [0.50 - 2.40 gCO2e]

    Grid: 0.39 kgCO2/kWh (us-east-1, regional avg)
    PUE:  1.1
    Confidence: Medium (regional average, not real-time)
    Key uncertainty: GPU utilization (contributes 52% of variance)

  WATER                                         3.0 mL
  ───────────────────────────────────────────
        ,
       ( )   Direct (cooling):        2.1 mL
        '    Indirect (electricity):  0.9 mL
             Total:                   3.0 mL

    == about 1/80 of a sip of water

  COMPARATIVE CONTEXT
  ───────────────────────────────────────────
    Your session's carbon footprint is equivalent to:

    =D-   Driving 4.8 meters in an average US car
    [|]   1.5% of a smartphone charge
    [>]   2.0 minutes of Netflix streaming

  DECISION LEVERS
  ───────────────────────────────────────────
  ╭─ TIP ──────────────────────────────────────────────────────────╮
  │  Using Haiku for simple tasks (formatting, search) would       │
  │  save ~60% energy. Try: /carbon:compare                        │
  ╰────────────────────────────────────────────────────────────────╯
  ╭─ TIP ──────────────────────────────────────────────────────────╮
  │  Cache hits on 27% of input saved 0.22 Wh this session.       │
  │  Enabling more prompt caching could save 20-40% of prefill.   │
  ╰────────────────────────────────────────────────────────────────╯

  YOUR FOREST (cumulative impact)
  ───────────────────────────────────────────

      This session:                 All sessions:

           .                             /\
          /|\                           /  \
           |                           / /\ \
                                      / /  \ \
          1 tree                         ||
        (-44g saved)                     ||

                                      3 trees
                                    (-312g saved total)

  ───────────────────────────────────────────
  Methodology v1.0 | ISO 14040/14044 | Benchmarks: 2026-03-15
  Key uncertainty: GPU utilization (52% of variance)
```

### Color Application Map

```
Title bar ("SESSION CARBON REPORT")     -> Bold + Forest Green
NET IMPACT hero box                     -> Bold + Lime (if saved) / Bold + Coral (if added)
  Border of hero box                    -> Forest Green
  "saved" / "added" label               -> Lime / Coral
Section headers ("ENERGY BREAKDOWN")    -> Bold + Emerald
Bar fills (energy)                      -> Forest Green gradient (dark -> light)
Bar empties                             -> Dim Gray
Carbon breakdown fills                  -> Forest Green (scope2), Emerald (embodied), Dim (network)
Water section icon + values             -> Water Blue
Equivalency icons (car, phone, etc.)    -> White
Decision lever boxes                    -> Forest Green border, White text
  "TIP" badge                           -> Bold + Lime on Dark Green background
Forest visualization                    -> Lime (leaves), Forest Green (trunk)
Methodology footer                      -> Dim Gray
All numeric values                      -> White (primary), Light Gray (secondary)
Uncertainty ranges in brackets          -> Light Gray
```

---

## 5. View 3: Model Comparison (`/carbon:compare`)

### Full ASCII Mockup

```
╭──────────────────────────────────────────────────────────────────────────────╮
│                      MODEL COMPARISON                                        │
│                      ════════════════                                         │
│  Workload: 45,201 input + 8,923 output tokens                               │
│  Grid: 0.39 kgCO2/kWh (us-east-1)  |  Current model: claude-sonnet-4-20250514   │
╰──────────────────────────────────────────────────────────────────────────────╯

  ENERGY & CARBON BY MODEL
  ───────────────────────────────────────────────────────────────

                    Energy                    Carbon
                    0       1       2    3    0     0.5    1.0   1.5
   Haiku    0.3x    ████░░░░░░░░░░░░░░░░░░   ████░░░░░░░░░░░░░░░░░░
            0.87 Wh                          0.34 gCO2e

  *Sonnet   1.0x    █████████████░░░░░░░░░░   █████████████░░░░░░░░░░
            2.89 Wh                          1.13 gCO2e

   Opus     3.2x    ██████████████████████████████████████████████████
            9.25 Wh                          3.61 gCO2e

  Legend:  ████ = your model  |  ████ = other models  |  * = current

  SAVINGS POTENTIAL
  ───────────────────────────────────────────────────────────────

  If you switched from Sonnet to:

  ╭── Haiku ──────────────────────────────────────────╮
  │                                                    │
  │  Energy:  2.89 Wh  >>>  0.87 Wh    (-70%)        │
  │  Carbon:  1.13g    >>>  0.34g       (-70%)        │
  │                                                    │
  │  Before: ██████████████████████████░░░░░░░░░░░░░░ │
  │  After:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │                                                    │
  │  Save 0.79 gCO2e per session                      │
  ╰────────────────────────────────────────────────────╯

  ╭── Opus (upgrade) ─────────────────────────────────╮
  │                                                    │
  │  Energy:  2.89 Wh  >>>  9.25 Wh    (+220%)       │
  │  Carbon:  1.13g    >>>  3.61g       (+220%)       │
  │                                                    │
  │  Before: █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │  After:  █████████████████████████████████████████ │
  │                                                    │
  │  Costs 2.48 gCO2e more per session                │
  ╰────────────────────────────────────────────────────╯

  WHAT-IF SCENARIOS
  ───────────────────────────────────────────────────────────────

  1. Half the input context (22,600 tokens):
     ┌────────────────────────────────────────┐
     │  Now:     ████████████████░░░░░░░░░░░░ │  1.13 gCO2e
     │  With 50%: ██████████░░░░░░░░░░░░░░░░░ │  0.74 gCO2e  (-35%)
     └────────────────────────────────────────┘

  2. Off-peak execution (30% lower grid CIF):
     ┌────────────────────────────────────────┐
     │  Now:     ████████████████░░░░░░░░░░░░ │  1.13 gCO2e
     │  Off-peak: ████████████░░░░░░░░░░░░░░░ │  0.79 gCO2e  (-30%)
     └────────────────────────────────────────┘

  3. Enable prompt caching (est. 30% cache hits):
     ┌────────────────────────────────────────┐
     │  Now:     ████████████████░░░░░░░░░░░░ │  1.13 gCO2e
     │  Cached:  ██████████████░░░░░░░░░░░░░░ │  0.95 gCO2e  (-16%)
     └────────────────────────────────────────┘

  KEY TAKEAWAY
  ───────────────────────────────────────────────────────────────
  ╭─────────────────────────────────────────────────────────────╮
  │  Switching to Haiku for routine tasks is your biggest       │
  │  lever: -70% carbon per session. Try it for formatting,     │
  │  search, and simple refactors.                              │
  ╰─────────────────────────────────────────────────────────────╯

  ───────────────────────────────────────────
  Methodology v1.0 | ISO 14040/14044
```

### Color Application Map

```
Title bar                          -> Bold + Forest Green
Current model asterisk (*)         -> Bold + Lime
Haiku bars                         -> Spring Green (most efficient)
Sonnet bars                        -> Forest Green (baseline)
Opus bars                          -> Amber (most expensive)
"Before" bars in savings           -> Forest Green
"After" bars (saving)              -> Lime
"After" bars (increase)            -> Coral
Percentage savings (negative)      -> Lime
Percentage increases (positive)    -> Coral
">>>" arrows                       -> White
What-if "Now" bars                 -> Forest Green
What-if "Improved" bars            -> Spring Green
KEY TAKEAWAY box                   -> Bold + Lime border
```

---

## 6. View 4: Trend View (`/carbon:trend`) -- NEW

### Full ASCII Mockup

```
╭──────────────────────────────────────────────────────────────────────────────╮
│                      CARBON TREND                                            │
│                      ════════════                                             │
│  Last 14 sessions  |  7-day window  |  Total: 312g CO2e saved               │
╰──────────────────────────────────────────────────────────────────────────────╯

  SESSION CO2 OVER TIME (gCO2e per session)
  ───────────────────────────────────────────────────────────────

  3.0 |
      |                                        *
  2.5 |                            *
      |
  2.0 |              *
      |    *                  *          *
  1.5 |                                              *
      |         *                                         *
  1.0 |                   *         *         *
      |                                                        *
  0.5 |
      |
  0.0 +----+----+----+----+----+----+----+----+----+----+----+----+---
       Mar  Mar  Mar  Mar  Mar  Mar  Mar  Mar  Mar  Mar  Mar  Mar  Mar
        13   14   15   16   17   18   19   20   21   22   23   24   25

  Braille sparkline:  ⣠⣴⣀⣰⣠⣶⣀⣴⣰⣀⣤⣀⣠

  CUMULATIVE CO2
  ───────────────────────────────────────────────────────────────

  Total emitted:        15.6 gCO2e  ███████░░░░░░░░░░░░░░░░░░░░░░░
  Total saved (net):   312.0 gCO2e  ██████████████████████████████████████████████

  Ratio: For every 1g emitted, you saved 20g of human-equivalent CO2

  WEEKLY AVERAGES
  ───────────────────────────────────────────────────────────────

              CO2/session    Sessions    Net saved
  This week:    1.3 g          5         -87g
  Last week:    1.5 g          6         -124g
  2 wks ago:    1.1 g          3         -101g

  Trend: your average CO2 per session is DECREASING (-13% week-over-week)

  YOUR FOREST
  ───────────────────────────────────────────────────────────────

  312g CO2e saved == planting and growing these trees for a day:

            /\        /\        /\
           /  \      /  \      /  \        .       .
          / /\ \    / /\ \    / /\ \      /|\     /|\
         / /  \ \  / /  \ \  / /  \ \      |       |
            ||        ||        ||

           tree       tree      tree     sprout   sprout
           #1         #2        #3        #4       #5

  Each tree represents ~60g CO2e offset (one session of car-commute avoidance).
  Sprouts represent < 60g partial progress toward the next tree.

  Keep growing your forest!

  ───────────────────────────────────────────
  Methodology v1.0 | ISO 14040/14044 | Data from 14 sessions
```

### Color Application Map

```
Title bar                          -> Bold + Forest Green
Line chart data points (*)         -> Spring Green
Line chart axes                    -> Dim Gray
Braille sparkline                  -> Forest Green
Cumulative "emitted" bar           -> Amber
Cumulative "saved" bar             -> Lime
Ratio text                         -> Bold + White
Weekly averages table              -> White text, Forest Green headers
Trend indicator (decreasing)       -> Lime + bold
Trend indicator (increasing)       -> Coral + bold
Forest trees                       -> Lime (canopy) + Forest Green (trunk)
Forest sprouts                     -> Spring Green
"Keep growing" message             -> Emerald
```

---

## 7. View 5: Live Dashboard (`/carbon:live`) -- NEW

### Full ASCII Mockup (Continuously Updating)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  LIVE CARBON MONITOR                                    47:23 elapsed        │
│  ════════════════                                       14 requests          │
╰──────────────────────────────────────────────────────────────────────────────╯

  ┌─ RUNNING TOTALS ───────────────────────────────────────────────────────┐
  │                                                                         │
  │  CO2:    ~1.24 gCO2e          Energy:  2.89 Wh          Water: 3.0 mL  │
  │  Net:    -43.96g saved                                                  │
  │                                                                         │
  │  Last request delta:  +0.09g   (+0.21 Wh)                              │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─ PER-REQUEST CO2 ──────────────────────────────────────────────────────┐
  │                                                                         │
  │  ▁▂▃▅▃▂▁▂▃▇▃▂▁▃   (last 14 requests, latest ->)                      │
  │                                                                         │
  │  avg: 0.09g | max: 0.22g | min: 0.03g                                  │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─ TOKEN METER ──────────────────────────────────────────────────────────┐
  │                                                                         │
  │  Input:   [████████████████████████████████░░░░░░░░]  45,201            │
  │  Output:  [███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   8,923            │
  │  Cache:   [██████████████░░░░░░░░░░░░░░░░░░░░░░░░░]  12,340 (27% hit)  │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─ CARBON INTENSITY GAUGE ───────────────────────────────────────────────┐
  │                                                                         │
  │  Grid CIF: 0.39 kgCO2/kWh (us-east-1)                                 │
  │                                                                         │
  │  LOW         MED         HIGH                                           │
  │  |===========|===========|===========|                                  │
  │  [############>                      ]                                  │
  │   ^---- you are here (0.39)                                             │
  │                                                                         │
  │  Peak hours: 2pm-8pm local | Current: 3:42pm (peak)                    │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─ GROWING TREE ─────────────────────────────────────────────────────────┐
  │                                                                         │
  │                         *                                               │
  │                        /|\                                              │
  │                       / | \                                             │
  │                         |                                               │
  │                                                                         │
  │   -44g saved this session                                               │
  │   Growing toward your next full tree (need -16g more)                   │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  Press q to exit  |  r to refresh  |  /carbon:report for full report
```

### Animation Notes

The live dashboard updates after each Claude response:
1. **Running totals** -- increment smoothly
2. **Sparkline** -- shifts left, appends new data point
3. **Token meters** -- bars grow in real time
4. **Tree** -- transitions between stages as net savings accumulate
5. **Delta** -- flashes briefly after each request, then dims

### Color Application Map

```
Title + elapsed timer              -> Bold + Forest Green / Dim Gray
Running totals box                 -> Forest Green border
  CO2 value                        -> White + Bold
  Net saved value                  -> Lime + Bold (if saved) / Coral (if added)
  Delta (last request)             -> Spring Green (briefly bright, then dim)
Sparkline                          -> Forest Green gradient
Token meter bars                   -> Forest Green (fill) + Dim Gray (empty)
  Cache hit percentage             -> Lime
Carbon intensity gauge             -> Green (low) / Amber (med) / Red (high)
  Pointer                          -> Bold + White
  "Peak hours" warning             -> Amber
Growing tree                       -> Lime (canopy) + Forest Green (trunk)
  Progress message                 -> Emerald
Footer controls                    -> Dim Gray
```

---

## 8. Implementation Notes

### 8a. Technology Approach

**Recommended: Raw ANSI escape codes + custom rendering**

Why:
- No heavy dependencies (aligns with project rule: "No heavy deps for core")
- Full control over exact character placement
- Works with Bun runtime natively
- Maintains the plugin's lightweight character

**Alternative considered and rejected: Ink (React for CLI)**
- Too heavy (React dependency tree)
- Overkill for what is essentially formatted string output

**Alternative for live dashboard only: blessed-contrib or @poppinss/cliui**
- Could be considered specifically for the live view's interactive features (q to quit, r to refresh)
- The other views are static output and do not need a TUI framework

### 8b. Proposed Module Structure

```
src/
  tui/
    colors.ts          -- ANSI color constants and theme (the C object above)
    sparkline.ts       -- Sparkline renderer (block chars + braille)
    bars.ts            -- Horizontal bar chart renderer
    gauge.ts           -- Carbon intensity gauge renderer
    tree.ts            -- Tree ASCII art at different growth stages
    water.ts           -- Water drop visualizations
    box.ts             -- Unicode box-drawing utilities (borders, cards)
    format-dashboard.ts    -- Composes View 2 (session dashboard)
    format-compare.ts      -- Composes View 3 (model comparison)
    format-trend.ts        -- Composes View 4 (trend view)
    format-live.ts         -- Composes View 5 (live dashboard)
    __tests__/
      sparkline.test.ts
      bars.test.ts
      ...
```

### 8c. Key Rendering Functions

```typescript
// bars.ts
export function horizontalBar(
  value: number,
  max: number,
  width: number = 25,
  fillColor: string = C.forest,
  emptyColor: string = C.dimGray,
): string;

// sparkline.ts
export function sparkline(
  values: number[],
  options?: { width?: number; color?: string },
): string;

export function brailleSparkline(
  values: number[],
  height?: number,
): string;

// gauge.ts
export function carbonGauge(
  currentCif: number,
  maxCif?: number,  // default 0.8
  width?: number,   // default 40
): string;

// tree.ts
export function treeArt(
  savedGrams: number,
): string[];  // returns array of lines

export function inlineTree(
  savedGrams: number,
): string;  // returns single-char or short string

export function forest(
  totalSavedGrams: number,
  gramsPerTree?: number,  // default 60
): string[];  // returns multi-line forest visualization

// box.ts
export function box(
  lines: string[],
  options?: {
    title?: string;
    borderColor?: string;
    width?: number;
    padding?: number;
  },
): string;

export function heroBox(
  mainLine: string,
  subLines: string[],
  positive: boolean,  // green vs coral border
): string;
```

### 8d. Terminal Compatibility

**Required support (baseline):**
- 256-color ANSI (virtually all modern terminals)
- Unicode box-drawing characters (U+2500-U+257F)
- Unicode block elements (U+2580-U+259F) -- for bars and sparklines
- Basic emoji rendering (for leaf/water Unicode if available)

**Graceful degradation:**
- If `NO_COLOR` env var is set: strip all ANSI codes, use ASCII-only art
- If terminal width < 80: fall back to compact layouts
- Provide `CARBON_ASCII_ONLY=1` env override for pure ASCII rendering

**Detection:**

```typescript
function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}

function terminalWidth(): number {
  return process.stdout.columns ?? 80;
}
```

### 8e. Performance Budget

Per the project's Code agent rules: the stop hook must complete in < 50ms.

- Statusline formatting: < 1ms (string concatenation only)
- Full dashboard rendering: < 5ms (all string operations, no I/O)
- Live dashboard: renders on a requestAnimationFrame-like loop, but calculation per tick is < 2ms
- The TUI rendering is pure string computation -- no risk of violating the budget

### 8f. Accessibility Compliance

Per `agents/design.md` accessibility checklist:

1. **No color-only information**: Every colored element has a text equivalent
   - Green/red bars -> also show percentage and absolute value
   - Lime/coral net impact -> also shows "saved" / "added" label

2. **ASCII fallbacks**: `CARBON_ASCII_ONLY=1` replaces:
   - `████░░` -> `####..`
   - `╭──╮` -> `+--+`
   - `▁▂▃▄` -> `_.-=`
   - Tree art -> `[tree]`

3. **Screen reader friendly**: Key numbers (net impact, total CO2, energy) appear as plain text before any visual decoration

4. **Light terminal support**: All colors chosen to be readable on both dark and light backgrounds. The dim gray (240) might need adjustment to a darker shade on light terminals -- detect with `COLORFGBG` env var if available.

---

## 9. Skill Mapping

| View | Skill / Component | Trigger | Replaces |
|------|-------------------|---------|----------|
| View 1: Enhanced Statusline | `statusline/format.ts` | Automatic (after each request) | Current `formatCompact()` / `formatDetailed()` |
| View 2: Session Dashboard | `skills/carbon-report/` | `/carbon:report` | Current plain-text report |
| View 3: Model Comparison | `skills/carbon-compare/` | `/carbon:compare` | Current plain-text comparison |
| View 4: Trend View | `skills/carbon-trend/` (NEW) | `/carbon:trend` | N/A (new skill) |
| View 5: Live Dashboard | `skills/carbon-live/` (NEW) | `/carbon:live` | N/A (new skill) |

### New Skill Definitions Needed

**`/carbon:trend`** -- requires:
- Multi-session query from SQLite (all sessions, grouped by day/week)
- Cumulative CO2 computation
- Sparkline / line chart rendering from `src/tui/`

**`/carbon:live`** -- requires:
- A long-running process or polling mechanism
- Hook into the stop hook to receive per-request updates
- Real-time re-rendering of the terminal view
- Keyboard input handling (q to quit, r to refresh)
- This is the most complex view and could be deferred to Phase 4

### Migration Path

1. **Phase 1**: Build `src/tui/` library (colors, bars, sparkline, box, tree)
2. **Phase 2**: Enhance statusline with sparkline + tree icon + color
3. **Phase 3**: Replace `/carbon:report` with View 2 dashboard, `/carbon:compare` with View 3
4. **Phase 4**: Add `/carbon:trend` (View 4) and `/carbon:live` (View 5)

---

## Appendix: Unicode Character Quick Reference

```
Box Drawing (borders):
  ╭ ╮ ╰ ╯ ─ │ ├ ┤ ┬ ┴ ┼    (rounded corners)
  ┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼    (sharp corners)
  ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬    (double lines for emphasis)

Block Elements (bars and fills):
  █ ▉ ▊ ▋ ▌ ▍ ▎ ▏             (full to 1/8 block)
  ░ ▒ ▓                        (light, medium, dark shade)
  ▁ ▂ ▃ ▄ ▅ ▆ ▇ █             (bottom bars for sparklines)

Braille Patterns (high-res sparklines):
  ⠀ ⠁ ⠂ ⠃ ⠄ ... ⣿            (256 patterns in U+2800-U+28FF)

Arrows and Indicators:
  ▶ ▷ ◀ ◁ ▲ ▽ △ ▼              (direction)
  ● ○ ◉ ◎                      (bullets)
  ✓ ✗                          (pass/fail)
  >>> (text-based arrow)

Bar Components:
  ━ ╍ ╺ ╸                      (thick/thin horizontal)
  ┃ ╏ ╻ ╹                      (thick/thin vertical)

Misc Useful:
  ≈  (approximately equal)
  ±  (plus/minus)
  →  (right arrow)
  •  (bullet)
```
