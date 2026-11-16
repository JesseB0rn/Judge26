import type { RankingConfig } from './types'

/**
 * Run time precision of an event (M10-19, M10-20): the number of decimals of a second shown and
 * used for ranking. 0 (whole seconds, the default) to 3 (milliseconds).
 */
export type TimeDecimals = 0 | 1 | 2 | 3

/** A valid number of decimals (anything else is the default, 0). */
export function timeDecimals(value: unknown): TimeDecimals {
  return value === 1 || value === 2 || value === 3 ? value : 0
}

/** Milliseconds per step: 0 → 1000, 1 → 100, 2 → 10, 3 → 1. */
export function timeResolutionMs(decimals: number): number {
  return 10 ** (3 - timeDecimals(decimals))
}

/**
 * The decimals a time resolution shows: 1000 → 0, 100 → 1, 10 → 2, 1 → 3. Resolutions that are
 * not a power of ten show milliseconds.
 */
export function decimalsOfResolution(resolutionMs: number | undefined): TimeDecimals {
  const map: Record<number, TimeDecimals> = { 1000: 0, 100: 1, 10: 2, 1: 3 }
  return map[resolutionMs ?? 1] ?? 3
}

/** Cuts (does not round) a time to the precision: 95379 ms at 1 decimal → 95300. */
export function truncateTime(ms: number, decimals: number): number {
  const step = timeResolutionMs(decimals)
  return Math.floor(ms / step) * step
}

/**
 * A run time as minutes:seconds with the event's decimals, cut not rounded: 95379 ms →
 * "1:35" (0), "1:35.3" (1), "1:35.37" (2), "1:35.379" (3). null → "–".
 */
export function formatRunTime(ms: number | null | undefined, decimals: number): string {
  if (ms === null || ms === undefined) return '–'
  const d = timeDecimals(decimals)
  const cut = truncateTime(Math.max(0, ms), d)
  const minutes = Math.floor(cut / 60_000)
  const seconds = Math.floor(cut / 1000) % 60
  const fraction = d
    ? `.${String(cut % 1000)
        .padStart(3, '0')
        .slice(0, d)}`
    : ''
  return `${minutes}:${String(seconds).padStart(2, '0')}${fraction}`
}

/**
 * The ranking configuration with the event's time precision applied (M10-20): times are cut to
 * the coarser of the configuration's own `timeResolutionMs` and the event's precision, so times
 * shown as equal rank as equal. Snapshots store the configuration they were computed with.
 */
export function withTimeDecimals<T extends Pick<RankingConfig, 'timeResolutionMs'>>(
  config: T,
  decimals: number,
): T {
  const own = config.timeResolutionMs ?? 1
  const event = timeResolutionMs(decimals)
  return own >= event ? config : { ...config, timeResolutionMs: event }
}
