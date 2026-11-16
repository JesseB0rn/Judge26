import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SlideToConfirm from '../components/SlideToConfirm.vue'

// M10-06 / M10-T08: the team's slide to confirm.
afterEach(() => document.body.replaceChildren())

function mountSlider(disabled = false) {
  const wrapper = mount(SlideToConfirm, {
    props: {
      label: 'Slide to confirm',
      modelValue: false,
      disabled,
      'onUpdate:modelValue': (v: boolean) => wrapper.setProps({ modelValue: v }),
    },
    attachTo: document.body,
  })
  const track = wrapper.get('[data-testid=slide-to-confirm]').element as HTMLElement
  const thumb = wrapper.get('[data-testid=slide-thumb]').element as HTMLElement
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ width: 360 } as DOMRect)
  vi.spyOn(thumb, 'getBoundingClientRect').mockReturnValue({ width: 60 } as DOMRect)
  return { wrapper, track, thumb }
}
const pointer = (type: string, target: EventTarget, x: number) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x }))

describe('SlideToConfirm', () => {
  it('M10-T08: releasing halfway springs back; sliding to the end confirms', async () => {
    const { wrapper, track, thumb } = mountSlider()
    pointer('pointerdown', thumb, 0)
    pointer('pointermove', window, 150)
    await flushPromises()
    expect(thumb.getAttribute('aria-valuenow')).toBe('50')
    pointer('pointerup', window, 150)
    await flushPromises()
    expect(thumb.getAttribute('aria-valuenow')).toBe('0')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    pointer('pointerdown', thumb, 0)
    pointer('pointermove', window, 295) // 98 %: close enough to the end
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(track.dataset.confirmed).toBe('true')
    expect(track.textContent).toContain('Confirmed by the team')
    // No text selection is left over (M10-29).
    pointer('pointerup', window, 295)
    expect(document.documentElement.style.userSelect).toBe('')
  })

  it('M10-06: keyboard alternative — arrow keys in quarters, End confirms', async () => {
    const { wrapper, thumb } = mountSlider()
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    expect(thumb.getAttribute('aria-valuenow')).toBe('25')
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('does nothing while disabled', async () => {
    const { wrapper, thumb } = mountSlider(true)
    pointer('pointerdown', thumb, 0)
    pointer('pointermove', window, 360)
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
