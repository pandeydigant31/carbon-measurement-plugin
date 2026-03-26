/**
 * ANSI 256-color constants for the Carbon Measurement Plugin TUI.
 *
 * Sustainable-aesthetic palette: greens, blues, earth tones.
 * All codes from TUI Design Spec section 1.
 *
 * Respects the NO_COLOR env var (https://no-color.org/) and
 * FORCE_COLOR to override detection.
 */

// ─── NO_COLOR Detection ──────────────────────────────────────────

/** Returns true if the terminal supports color output. */
export function supportsColor(): boolean {
  if (typeof process !== "undefined") {
    if (process.env.NO_COLOR) return false;
    if (process.env.FORCE_COLOR) return true;
    // In Bun/Node, check TTY; default to true for piped output in CI
    return process.stdout?.isTTY ?? false;
  }
  return false;
}

const _colorEnabled = supportsColor();

// ─── Raw ANSI Escape Codes ───────────────────────────────────────

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

// Foreground (256-color) — Primary Greens
export const FOREST = "\x1b[38;5;34m";
export const EMERALD = "\x1b[38;5;35m";
export const LIME = "\x1b[38;5;82m";
export const DARK_GREEN = "\x1b[38;5;22m";
export const SPRING = "\x1b[38;5;48m";

// Foreground — Accents
export const WATER_BLUE = "\x1b[38;5;39m";
export const SKY_BLUE = "\x1b[38;5;75m";
export const AMBER = "\x1b[38;5;214m";
export const SOFT_RED = "\x1b[38;5;196m";
export const CORAL = "\x1b[38;5;209m";

// Foreground — Neutrals
export const WHITE = "\x1b[38;5;15m";
export const GRAY = "\x1b[38;5;248m";
export const DIM_GRAY = "\x1b[38;5;240m";

// Foreground — Extra greens for gradient bars
export const GREEN_28 = "\x1b[38;5;28m";
export const GREEN_40 = "\x1b[38;5;40m";
export const GREEN_46 = "\x1b[38;5;46m";

// Trunk / earth tone
export const BROWN = "\x1b[38;5;94m";

// Background (256-color)
export const BG_DARK_GREEN = "\x1b[48;5;22m";
export const BG_FOREST = "\x1b[48;5;34m";
export const BG_EMERALD = "\x1b[48;5;35m";
export const BG_LIME = "\x1b[48;5;82m";
export const BG_CORAL = "\x1b[48;5;209m";
export const BG_AMBER = "\x1b[48;5;214m";

// ─── Named Color Map (C object from design spec) ────────────────

export const C = {
  reset: RESET,
  bold: BOLD,
  dim: DIM,

  // Foreground
  forest: FOREST,
  emerald: EMERALD,
  lime: LIME,
  darkGreen: DARK_GREEN,
  spring: SPRING,
  waterBlue: WATER_BLUE,
  skyBlue: SKY_BLUE,
  amber: AMBER,
  softRed: SOFT_RED,
  coral: CORAL,
  white: WHITE,
  gray: GRAY,
  dimGray: DIM_GRAY,
  brown: BROWN,

  // Extra gradient
  green28: GREEN_28,
  green40: GREEN_40,
  green46: GREEN_46,

  // Background
  bgDarkGreen: BG_DARK_GREEN,
  bgForest: BG_FOREST,
  bgEmerald: BG_EMERALD,
  bgLime: BG_LIME,
  bgCoral: BG_CORAL,
  bgAmber: BG_AMBER,
} as const;

// ─── Color Helper ────────────────────────────────────────────────

/**
 * Wraps `text` in an ANSI color code (with reset suffix).
 * If NO_COLOR is set, returns plain text.
 *
 * @param color  ANSI escape code (e.g. C.forest)
 * @param text   The text to colorize
 * @returns      Colored string or plain text
 */
export function c(color: string, text: string): string {
  if (!_colorEnabled) return text;
  return `${color}${text}${RESET}`;
}

/**
 * Apply bold + color to text.
 */
export function cb(color: string, text: string): string {
  if (!_colorEnabled) return text;
  return `${BOLD}${color}${text}${RESET}`;
}

/**
 * Apply dim to text.
 */
export function cd(text: string): string {
  if (!_colorEnabled) return text;
  return `${DIM}${text}${RESET}`;
}

/**
 * Strip all ANSI escape codes from a string.
 * Useful for measuring visible string length.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Visible (printable) length of a string, ignoring ANSI codes.
 */
export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Pad a string that may contain ANSI codes to a given visible width.
 */
export function padEnd(str: string, width: number): string {
  const visible = visibleLength(str);
  if (visible >= width) return str;
  return str + " ".repeat(width - visible);
}

/**
 * Pad a string (left) that may contain ANSI codes to a given visible width.
 */
export function padStart(str: string, width: number): string {
  const visible = visibleLength(str);
  if (visible >= width) return str;
  return " ".repeat(width - visible) + str;
}
