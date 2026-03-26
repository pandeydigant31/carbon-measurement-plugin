/**
 * Privacy utilities.
 *
 * Ensures no project paths or code content leak into stored data.
 */

/**
 * Produce a SHA-256 hex digest of a project path.
 * Uses the Web Crypto API (available in Bun) for hashing.
 */
export function hashProjectPath(path: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(path);
  return hasher.digest("hex");
}

/**
 * Recursively strip any string fields that might contain code content.
 *
 * Strategy:
 * - Walks the data structure recursively
 * - Preserves numbers, booleans, null
 * - Preserves strings that look like identifiers, timestamps, model names, etc.
 * - Redacts strings longer than 200 characters (likely code or prompts)
 * - Preserves array structure and object keys
 */
export function sanitizeForStorage(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "number" || typeof data === "boolean") return data;

  if (typeof data === "string") {
    // Allow short strings (model names, timestamps, IDs, config values)
    if (data.length <= 200) return data;
    return "[REDACTED]";
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForStorage);
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = sanitizeForStorage(value);
    }
    return result;
  }

  return data;
}
