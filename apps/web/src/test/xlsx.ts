import { strFromU8, unzipSync } from 'fflate'

/** Unzipped workbook parts as text (tests of XLSX exports). */
export function readXlsx(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes)
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]))
}
