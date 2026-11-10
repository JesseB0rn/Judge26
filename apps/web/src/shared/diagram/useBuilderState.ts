import { ref, type Ref } from 'vue'

/**
 * Editor state shared by the visual builders: the JSON text stays the single source of truth
 * (the JSON editor edits the same text); this adds undo, the current selection and positions
 * of blocks the user dragged (cleared whenever blocks move between columns, so the automatic
 * layout takes over again).
 */
export function useBuilderState(text: Ref<string>) {
  const selected = ref<string | null>(null)
  const positions = ref(new Map<string, { x: number; y: number }>())
  const history = ref<string[]>([])

  function apply(next: unknown, options: { select?: string | null; relayout?: boolean } = {}) {
    const json = JSON.stringify(next, null, 2)
    if (json !== text.value) {
      history.value = [...history.value.slice(-49), text.value]
      text.value = json
      if (options.relayout ?? true) positions.value = new Map()
    }
    if (options.select !== undefined) selected.value = options.select
  }

  function undo() {
    const previous = history.value[history.value.length - 1]
    if (previous === undefined) return
    history.value = history.value.slice(0, -1)
    text.value = previous
    positions.value = new Map()
  }

  function move(id: string, x: number, y: number) {
    positions.value = new Map(positions.value).set(id, { x, y })
  }

  /** Ctrl/Cmd+Z outside form fields. */
  function onKeydown(e: KeyboardEvent, readonly?: boolean) {
    if (readonly || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    e.preventDefault()
    undo()
  }

  return { selected, positions, history, apply, undo, move, onKeydown }
}
