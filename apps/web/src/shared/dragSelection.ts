/**
 * Text selection during pointer drags (M10-29).
 *
 * A pointer drag starts on `pointerdown`, but the browser starts a text selection on the same
 * press: by the time the drag threshold is crossed, text between the start and the pointer is
 * already selected, and it stays selected after the drop. Every drag in the app calls
 * `beginDrag()` once it becomes a drag and `endDrag()` when it ends (dropped or cancelled):
 * selection is switched off for the page while dragging and anything selected is cleared at
 * both ends. Inputs keep their own selection (`removeAllRanges` does not touch it).
 */

let active = 0

function clearSelection() {
  try {
    window.getSelection()?.removeAllRanges()
  } catch {
    // No selection API (tests): nothing to clear.
  }
}

function setUserSelect(value: string) {
  const style = document.documentElement.style
  style.userSelect = value
  style.setProperty('-webkit-user-select', value)
}

export function beginDrag() {
  active++
  clearSelection()
  if (active === 1) setUserSelect('none')
}

export function endDrag() {
  if (active === 0) return
  active--
  clearSelection()
  if (active === 0) setUserSelect('')
}

/** Whether a drag holds the selection off (for tests). */
export function isDragging() {
  return active > 0
}
