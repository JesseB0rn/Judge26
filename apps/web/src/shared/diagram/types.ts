/**
 * Generic block diagram model (LabVIEW style): blocks with ordered input terminals on the
 * left, one output terminal on the right and an optional enable terminal on top, connected
 * by orthogonal wires. The scoring and ranking builders map their formats onto this model.
 */

/** Colour family of a block or wire, after LabVIEW's data-type colours. */
export type Tone = 'boolean' | 'number' | 'select' | 'group' | 'round' | 'calc' | 'sink'

export type Shape = 'control' | 'function' | 'indicator'

export interface DiagramPort {
  id: string
  label?: string
  /** An empty terminal: dropping a wire here appends a new connection. */
  spare?: boolean
}

export interface DiagramNode {
  id: string
  x: number
  y: number
  shape: Shape
  tone: Tone
  /** Short type symbol shown in the terminal icon, e.g. "TF", "Σ". */
  glyph: string
  title: string
  subtitle?: string
  inputs: DiagramPort[]
  output: boolean
  /** Has an enable (condition) terminal on top. */
  enable?: boolean
  /** Short markers, e.g. "≤1", "[0, ∞]". */
  badges?: string[]
  /** Subtracts its value: drawn with a negation marker on the output. */
  negated?: boolean
  /** Inactive in the current probe values (greyed out). */
  inactive?: boolean
  /** Probe value shown on the output, e.g. "15". */
  probe?: string
  /** Validation messages for this block. */
  errors?: string[]
}

export interface DiagramWire {
  id: string
  from: string
  to: string
  /** Input port id on the target, or "enable". */
  port: string
  tone: Tone
  /** Carries an aggregated value (drawn thicker, like LabVIEW arrays). */
  thick?: boolean
  dashed?: boolean
  error?: boolean
}

export const NODE_WIDTH = 184
export const HEADER_HEIGHT = 44
export const PORT_HEIGHT = 22

export function nodeHeight(node: Pick<DiagramNode, 'inputs'>) {
  // Controls without inputs only need room for their header and badges.
  if (!node.inputs.length) return HEADER_HEIGHT + 14
  return HEADER_HEIGHT + node.inputs.length * PORT_HEIGHT + 8
}

export function inputPoint(node: DiagramNode, portId: string) {
  if (portId === 'enable') return { x: node.x + NODE_WIDTH / 2, y: node.y }
  const index = Math.max(
    0,
    node.inputs.findIndex((p) => p.id === portId),
  )
  return { x: node.x, y: node.y + HEADER_HEIGHT + PORT_HEIGHT * (index + 0.5) }
}

export function outputPoint(node: DiagramNode) {
  return { x: node.x + NODE_WIDTH, y: node.y + nodeHeight(node) / 2 }
}

/**
 * Orthogonal wire path from an output terminal to an input or enable terminal. `lane` gives
 * every wire entering a column its own vertical segment, so wires never overlap and stay
 * traceable.
 */
export function wirePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  enable = false,
  lane = 0,
  spacing = 7,
): string {
  const stub = 14
  if (enable) {
    const above = to.y - stub
    const x1 = from.x + stub
    return `M${from.x},${from.y} H${x1} V${above} H${to.x} V${to.y}`
  }
  if (to.x - from.x >= stub * 2) {
    const mid = Math.max(from.x + stub, to.x - 16 - lane * spacing)
    return `M${from.x},${from.y} H${mid} V${to.y} H${to.x}`
  }
  // Backwards wire: route around between the two blocks.
  const midY = Math.round((from.y + to.y) / 2)
  return `M${from.x},${from.y} H${from.x + stub} V${midY} H${to.x - stub} V${to.y} H${to.x}`
}

/** Places blocks on a grid: `columns[c]` lists node ids top to bottom. */
export function gridLayout(
  columns: string[][],
  heights: Map<string, number>,
  options: { columnGap?: number; rowGap?: number; centres?: Map<string, number> } = {},
) {
  const columnGap = options.columnGap ?? 96
  const rowGap = options.rowGap ?? 20
  const positions = new Map<string, { x: number; y: number }>()
  columns.forEach((ids, c) => {
    let y = 0
    for (const id of ids) {
      const h = heights.get(id) ?? 80
      const wanted = options.centres?.get(id)
      const top = wanted === undefined ? y : Math.max(y, Math.round(wanted - h / 2))
      positions.set(id, { x: c * (NODE_WIDTH + columnGap), y: top })
      y = top + h + rowGap
    }
  })
  return positions
}
