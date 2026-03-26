/**
 * Real-time grid carbon intensity fetcher via Electricity Maps API.
 *
 * Optional: fetches real-time grid carbon intensity from Electricity Maps API.
 * Falls back to static regional table if no API key or on error.
 * Cache: in-memory, 1 hour TTL.
 * NEVER called in the critical path (stop hook) — background refresh only.
 *
 * References:
 *   - Electricity Maps API: https://api.electricitymap.org/
 *   - Static fallback: src/models/emission-factors.ts (IEA 2023, EIA 2023)
 */

import {
  getGridCIF,
  getGridCIFSource,
  getAllRegionCIFs,
} from "../models/emission-factors.ts";

// ─── Types ──────────────────────────────────────────────────────────

export interface GridCIFResult {
  /** Carbon intensity factor in kgCO2e/kWh */
  cif: number;
  /** How the CIF was determined */
  source: string;
}

interface CacheEntry {
  cif: number;
  source: string;
  fetchedAt: number; // Date.now() timestamp
}

// ─── Configuration ──────────────────────────────────────────────────

// Source: Electricity Maps API documentation, confidence: high
const ELECTRICITY_MAPS_BASE_URL = "https://api.electricitymap.org/v3";

// Cache TTL: 1 hour in milliseconds
// Source: Grid carbon intensity changes slowly (hourly dispatch), 1hr is sufficient, confidence: high
const CACHE_TTL_MS = 60 * 60 * 1000;

// Fetch timeout: 5 seconds (non-blocking, best-effort)
// Source: Internal design constraint — must not delay any user-facing operation
const FETCH_TIMEOUT_MS = 5_000;

// ─── Region Mapping ─────────────────────────────────────────────────
//
// Maps AWS region codes to Electricity Maps zone identifiers.
// Source: Electricity Maps zone list + AWS region locations, confidence: high

const AWS_TO_EMAPS_ZONE: Record<string, string> = {
  "us-east-1": "US-MIDA-PJM",    // Virginia → PJM Interconnection
  "us-east-2": "US-MIDW-MISO",   // Ohio → MISO
  "us-west-1": "US-CAL-CISO",    // N. California → CAISO
  "us-west-2": "US-NW-BPAT",     // Oregon → BPA
  "eu-west-1": "IE",             // Ireland
  "eu-west-2": "GB",             // London
  "eu-west-3": "FR",             // Paris
  "eu-central-1": "DE",          // Frankfurt
  "eu-north-1": "SE-SE3",        // Stockholm
  "ap-northeast-1": "JP-TK",     // Tokyo
  "ap-northeast-2": "KR",        // Seoul
  "ap-southeast-1": "SG",        // Singapore
  "ap-southeast-2": "AU-NSW",    // Sydney
  "ap-south-1": "IN-WE",         // Mumbai
  "sa-east-1": "BR-S",           // Sao Paulo
  "ca-central-1": "CA-ON",       // Canada Central (Ontario)
};

// ─── In-Memory Cache ────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();

/**
 * Check if a cache entry is still valid (within TTL).
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

// ─── Static Fallback ────────────────────────────────────────────────

/**
 * Get the static CIF for a region from the emission-factors table.
 * This is always available, requires no network call, and is used as
 * the fallback when the API is unavailable.
 *
 * @param region - AWS region code (e.g., "us-east-1")
 * @returns CIF result with value and source citation
 */
function getStaticCIF(region: string): GridCIFResult {
  return {
    cif: getGridCIF(region),
    source: `static: ${getGridCIFSource(region)}`,
  };
}

// ─── API Fetcher ────────────────────────────────────────────────────

/**
 * Fetch real-time grid carbon intensity from Electricity Maps API.
 *
 * This function is NON-BLOCKING and best-effort:
 * - Times out after 5 seconds
 * - Falls back to static CIF on any error (network, auth, rate limit, parse)
 * - Caches successful responses for 1 hour
 * - NEVER throws — always returns a valid GridCIFResult
 *
 * @param region - AWS region code (e.g., "us-east-1")
 * @param apiKey - Electricity Maps API auth token (optional; uses free tier if omitted)
 * @returns CIF result with value and source
 */
export async function fetchGridCIF(
  region: string,
  apiKey?: string,
): Promise<GridCIFResult> {
  // If no API key provided, go straight to static fallback
  if (!apiKey) {
    return getStaticCIF(region);
  }

  // Check cache first
  const cached = cache.get(region);
  if (cached && isCacheValid(cached)) {
    return { cif: cached.cif, source: cached.source };
  }

  // Map AWS region to Electricity Maps zone
  const zone = AWS_TO_EMAPS_ZONE[region];
  if (!zone) {
    // Unknown region — no API mapping available, use static
    return getStaticCIF(region);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      `${ELECTRICITY_MAPS_BASE_URL}/carbon-intensity/latest?zone=${zone}`,
      {
        headers: {
          "auth-token": apiKey,
          "Accept": "application/json",
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      // API error (auth failure, rate limit, etc.) — fall back silently
      return getStaticCIF(region);
    }

    const data = (await response.json()) as {
      zone?: string;
      carbonIntensity?: number;
      datetime?: string;
      updatedAt?: string;
      emissionFactorType?: string;
    };

    // Electricity Maps returns carbonIntensity in gCO2eq/kWh
    // We need kgCO2e/kWh, so divide by 1000
    // Source: Electricity Maps API v3 docs, unit: gCO2eq/kWh, confidence: high
    if (
      data.carbonIntensity != null &&
      typeof data.carbonIntensity === "number" &&
      data.carbonIntensity > 0
    ) {
      const cif = data.carbonIntensity / 1000; // gCO2eq/kWh → kgCO2e/kWh
      const factorType = data.emissionFactorType ?? "lifecycle";
      const source = `realtime: Electricity Maps (${zone}, ${factorType}, ${data.updatedAt ?? "now"})`;

      // Cache the result
      cache.set(region, {
        cif,
        source,
        fetchedAt: Date.now(),
      });

      return { cif, source };
    }

    // Unexpected response shape — fall back
    return getStaticCIF(region);
  } catch {
    // Network error, timeout, parse error — fall back silently
    // This is expected behavior, not an error condition
    return getStaticCIF(region);
  }
}

// ─── Synchronous Accessor ───────────────────────────────────────────

/**
 * Get CIF from cache if available, otherwise return the static regional value.
 *
 * This is the synchronous accessor for use in the critical path (stop hook).
 * It NEVER makes a network call. It returns whatever is in the cache from
 * the most recent background refresh, or the static fallback if the cache
 * is empty or expired.
 *
 * @param region - AWS region code (e.g., "us-east-1")
 * @returns CIF result with value and source — always immediate, never blocks
 */
export function getCachedOrStaticCIF(region: string): GridCIFResult {
  const cached = cache.get(region);
  if (cached && isCacheValid(cached)) {
    return { cif: cached.cif, source: cached.source };
  }
  return getStaticCIF(region);
}

// ─── Cache Management ───────────────────────────────────────────────

/**
 * Clear all cached CIF entries.
 * Useful for testing or when the user changes region configuration.
 */
export function clearCIFCache(): void {
  cache.clear();
}

/**
 * Get the number of cached entries (for diagnostics).
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * Get all supported AWS-to-zone mappings.
 * Useful for the /carbon:configure skill to show available regions.
 */
export function getSupportedRegions(): Record<string, string> {
  return { ...AWS_TO_EMAPS_ZONE };
}

/**
 * Pre-warm the cache for a specific region by fetching real-time CIF.
 * Call this in the session-start hook (background, non-blocking).
 *
 * @param region - AWS region code
 * @param apiKey - Electricity Maps API auth token
 */
export async function prewarmCIF(
  region: string,
  apiKey?: string,
): Promise<void> {
  // Fire-and-forget — result is stored in cache for later use
  await fetchGridCIF(region, apiKey);
}
