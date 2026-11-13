// Fits the text of planner cells into their boxes (no Vue). Every step writes all font sizes, then
// reads all boxes, so any number of cells costs only a handful of layouts.

const STEPS = 5

function overflows(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
}

/** Largest font size in [min, max] at which each element fits; returns those that overflow at min. */
function shrink(elements: HTMLElement[], max: number, min: number): HTMLElement[] {
  if (!elements.length) return []
  for (const el of elements) el.style.fontSize = `${min}px`
  const failing = elements.filter(overflows)
  const rest = elements.filter((el) => !failing.includes(el))
  const lo = new Map(rest.map((el) => [el, min]))
  const hi = new Map(rest.map((el) => [el, max]))
  for (let step = 0; step < STEPS; step++) {
    for (const el of rest) el.style.fontSize = `${(lo.get(el)! + hi.get(el)!) / 2}px`
    for (const el of rest) {
      const mid = (lo.get(el)! + hi.get(el)!) / 2
      if (overflows(el)) hi.set(el, mid)
      else lo.set(el, mid)
    }
  }
  for (const el of rest) el.style.fontSize = `${Math.floor(lo.get(el)! * 4) / 4}px`
  return failing
}

/**
 * Shrinks the font of each element (down to `min` px) until its content fits without breaking
 * words. Elements that still overflow are marked `data-compact`, so their lines flow inline, and
 * are fitted once more. Those that overflow even then are marked `data-overflow`: their CSS lets
 * them break words and grow beyond their box, so no text is hidden.
 * `max` is the font size of the elements' own CSS; elements that fit at it keep it.
 */
export function fitText(elements: Iterable<HTMLElement>, max = 12, min = 6) {
  const list = [...elements]
  for (const el of list) {
    el.style.fontSize = ''
    el.style.minHeight = ''
    delete el.dataset.compact
    delete el.dataset.overflow
  }
  const tooBig = list.filter(overflows)
  const failing = shrink(tooBig, max, min)
  for (const el of failing) el.dataset.compact = ''
  for (const el of shrink(failing, max, min)) {
    el.style.minHeight = el.style.height
    el.dataset.overflow = ''
  }
}
