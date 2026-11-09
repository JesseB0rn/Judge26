/**
 * Fixed-point arithmetic. Scores are integers scaled by 10^precision so sums,
 * maxima and minima are exact. Rounding happens once per criterion, half away
 * from zero, after normalizing binary floating-point noise.
 */

export function scaleFor(precision: number): number {
  return 10 ** precision
}

/** Converts a decimal number to scaled integer units. */
export function toUnits(value: number, scale: number): number {
  const scaled = Number((value * scale).toPrecision(12))
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled))
  return rounded === 0 ? 0 : rounded // normalize -0
}

export function fromUnits(units: number, scale: number): number {
  const value = units / scale
  return value === 0 ? 0 : value
}

export function formatUnits(units: number, scale: number): string {
  const value = fromUnits(units, scale)
  const decimals = Math.round(Math.log10(scale))
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals).replace(/0+$/, '')
}
