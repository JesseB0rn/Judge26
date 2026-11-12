import { onBeforeUnmount, ref } from 'vue'

/**
 * Pointer drag for the assignment board (M8-28, M8-29, M8-27): works with mouse, pen and touch.
 * Drop targets are elements with `data-drop`:
 * - `teams` (+ `data-table`): a table's team list; the index comes from its `[data-team-slot]` rows;
 * - `team-tray`, `judge-tray`: the unassigned trays;
 * - `judges` (+ `data-table`): a table's judge slots;
 * - `column` (+ `data-table`, `data-next`): a table column, for category dividers (drop before
 *   the column, or before `data-next` when on its right half).
 */

export type DragPayload =
  | { kind: 'team'; team: string; from: string }
  | { kind: 'judge'; judge: string; from: string }
  | { kind: 'divider'; group: number }

export type DropTarget =
  | { kind: 'teams'; table: string; index: number }
  | { kind: 'team-tray' }
  | { kind: 'judges'; table: string }
  | { kind: 'judge-tray' }
  | { kind: 'column'; before: string }

interface DragState {
  payload: DragPayload
  label: string
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  target: DropTarget | null
}

const THRESHOLD = 5

/** Where a pointer at (x, y) would drop a payload of this kind. */
export function hitTest(x: number, y: number, kind: DragPayload['kind']): DropTarget | null {
  const elements = document.elementsFromPoint?.(x, y) ?? []
  for (const element of elements) {
    const zone = (element as HTMLElement).closest?.<HTMLElement>('[data-drop]')
    if (!zone) continue
    const drop = zone.dataset.drop
    if (kind === 'team' && drop === 'teams') {
      const slots = [...zone.querySelectorAll<HTMLElement>('[data-team-slot]')]
      const index = slots.filter((slot) => {
        const r = slot.getBoundingClientRect()
        return r.top + r.height / 2 < y
      }).length
      return { kind: 'teams', table: zone.dataset.table ?? '', index }
    }
    if (kind === 'team' && drop === 'team-tray') return { kind: 'team-tray' }
    if (kind === 'judge' && drop === 'judges')
      return { kind: 'judges', table: zone.dataset.table ?? '' }
    if (kind === 'judge' && drop === 'judge-tray') return { kind: 'judge-tray' }
    if (kind === 'divider' && drop === 'column') {
      const r = zone.getBoundingClientRect()
      const before = x < r.left + r.width / 2 ? zone.dataset.table : zone.dataset.next
      return { kind: 'column', before: before ?? '' }
    }
  }
  return null
}

export function useBoardDrag(onDrop: (payload: DragPayload, target: DropTarget) => void) {
  const drag = ref<DragState | null>(null)

  function start(event: PointerEvent, payload: DragPayload, label: string) {
    if (event.button !== 0 || drag.value) return
    drag.value = {
      payload,
      label,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: null,
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
  }

  function move(event: PointerEvent) {
    const d = drag.value
    if (!d) return
    d.x = event.clientX
    d.y = event.clientY
    if (!d.active && Math.hypot(d.x - d.startX, d.y - d.startY) < THRESHOLD) return
    d.active = true
    event.preventDefault()
    d.target = hitTest(d.x, d.y, d.payload.kind)
  }

  function up() {
    const d = drag.value
    cancel()
    if (d?.active && d.target) onDrop(d.payload, d.target)
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') cancel()
  }

  function cancel() {
    drag.value = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKey)
  }

  onBeforeUnmount(cancel)
  return { drag, start, cancel }
}
