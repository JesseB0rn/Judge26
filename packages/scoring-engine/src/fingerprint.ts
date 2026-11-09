/**
 * Canonical JSON (sorted keys) and a stable fingerprint. Stored with
 * published rulesets and results so a result can be traced to the exact ruleset
 * that produced it (M2-14).
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * 64-bit fingerprint built from two 32-bit FNV-1a hashes with different offsets.
 * Uses only Math.imul so it also runs in PocketBase's embedded JS VM.
 */
export function fingerprint(value: unknown): string {
  const text = canonicalJson(value)
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x01000193)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return hex(a) + hex(b)
}
