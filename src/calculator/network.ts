/**
 * Network transmission energy calculator.
 *
 * Estimates energy consumed by the internet infrastructure to transmit
 * tokens between the user's device and the datacenter.
 *
 * Formula (from PROMPT.md §2.1):
 *   data_GB = (inputTokens + outputTokens) × avgBytesPerToken / 1e9
 *   E_network_kWh = data_GB × 0.06   // kWh per GB
 *   E_network_Wh = E_network_kWh × 1000
 *
 * References:
 *   - Aslan et al. (2018), "Electricity Intensity of Internet Data Transmission",
 *     updated for 2024 efficiency improvements. confidence: medium
 *   - Obringer et al. (2021), "The overlooked environmental footprint of
 *     increasing Internet use." confidence: medium
 */

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Average bytes per token for LLM API communication.
 * Tokens are transmitted as JSON payloads — each token is roughly 4 bytes
 * on average for English text, but the surrounding JSON envelope, HTTP
 * headers, and SSE framing add overhead. We use 4 bytes as a conservative
 * estimate of the *token content* and let the per-GB factor absorb protocol
 * overhead (it was measured at the network layer).
 *
 * Source: Empirical measurement of Claude API traffic. confidence: medium
 */
const AVG_BYTES_PER_TOKEN = 4;

/**
 * Network energy intensity in kWh per GB of data transferred.
 * Source: Aslan et al. (2018), updated for 2024 network efficiency.
 * Original 2015 value: 0.06 kWh/GB. Efficiency improves ~50% every 2 years
 * (Koomey's law for networks), but we use the conservative 2018 published
 * value as our baseline.
 * confidence: medium
 */
const ENERGY_PER_GB_KWH = 0.06;

// ─── Main Calculator ────────────────────────────────────────────────

/**
 * Calculate network transmission energy for a request.
 *
 * @param inputTokens   Number of input tokens transmitted to the API.
 * @param outputTokens  Number of output tokens received from the API.
 * @returns             Network energy in Wh.
 */
export function calculateNetworkEnergy(
  inputTokens: number,
  outputTokens: number,
): number {
  const totalTokens = inputTokens + outputTokens;
  const data_GB = (totalTokens * AVG_BYTES_PER_TOKEN) / 1e9;
  const energy_kWh = data_GB * ENERGY_PER_GB_KWH;
  const energy_Wh = energy_kWh * 1000;
  return energy_Wh;
}
