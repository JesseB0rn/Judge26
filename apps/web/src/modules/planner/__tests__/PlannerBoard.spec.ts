import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlannerBoard from '../components/PlannerBoard.vue'
import { gridColumns } from '../lib'
import type { MoveRequest, PlannerData } from '../types'

const data = (): PlannerData => ({
  days: [
    { id: 'd1', date: '2026-06-01', label: 'Day 1', starts_at: '08:00', ends_at: '18:00' },
    { id: 'd2', date: '2026-06-02', label: 'Day 2', starts_at: '09:00', ends_at: '15:00' },
  ],
  categories: [
    { id: 'c1', name: 'RoboMission', code: 'RM' },
    { id: 'c2', name: 'Future Engineers', code: 'FE' },
  ],
  rounds: [{ id: 'r1', category: 'c1', key: 'R1', name: 'Round 1', position: 1, day: 'd1' }],
  phases: [
    {
      id: 'm1',
      round: 'r1',
      phase: 'maintenance',
      day: 'd1',
      starts_at: '09:00',
      duration_minutes: 30,
      updated: 'u1',
    },
    { id: 's1', round: 'r1', phase: 'scoring', day: 'd1', starts_at: '', duration_minutes: 60 },
  ],
  blocks: [
    {
      id: 'b1',
      day: 'd1',
      starts_at: '12:00',
      duration_minutes: 60,
      title: 'Lunch',
      place: 'Cafeteria',
      color: 'green',
      responsibility: 'Catering',
      categories: [],
      public: false,
    },
  ],
  issues: [
    {
      code: 'outside_day',
      message: 'Outside the hours of this day.',
      items: [{ kind: 'block', id: 'b1' }],
    },
  ],
  internal: true,
})

function render(editable: boolean) {
  const d = data()
  return mount(PlannerBoard, {
    props: { data: d, days: d.days, columns: gridColumns(d), editable },
    attachTo: document.body,
  })
}

describe('PlannerBoard', () => {
  it('M4-14-05/06: shows all days side by side with category columns and phases', () => {
    const wrapper = render(false)
    expect(wrapper.findAll('section[data-day]').map((s) => s.attributes('data-day'))).toEqual([
      'd1',
      'd2',
    ])
    expect(wrapper.text()).toContain('RoboMission')
    expect(wrapper.text()).toContain('Future Engineers')
    const phase = wrapper.get('[data-item="phase:m1"]')
    expect(phase.text()).toContain('R1 · Practice')
    expect(phase.text()).toContain('09:00–09:30')
    // The event-wide lunch spans both columns and shows its warning.
    const lunch = wrapper.get('[data-item^="block:b1"]')
    expect(lunch.attributes('style')).toContain('left: 2px; width: 332px')
    expect(lunch.attributes('aria-label')).toContain('Outside the hours of this day.')
    expect(lunch.attributes('aria-label')).toContain('Internal (staff only)')
    wrapper.unmount()
  })

  it('M4-14-26: read-only boards have no tray and open details on click', async () => {
    const wrapper = render(false)
    expect(wrapper.find('[data-testid=planner-tray]').exists()).toBe(false)
    expect(wrapper.find('[data-resize]').exists()).toBe(false)
    await wrapper.get('[data-item="phase:m1"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'phase', id: 'm1' }]])
    await wrapper.get('[data-item="phase:m1"]').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('move')).toBeUndefined()
    wrapper.unmount()
  })

  it('M4-14-09: editors see unplaced phases in the tray', () => {
    const wrapper = render(true)
    const tray = wrapper.get('[data-testid=planner-tray]')
    expect(tray.text()).toContain('R1')
    expect(tray.text()).toContain('Scoring')
    expect(tray.find('[data-tray="s1"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('M4-14-17: keyboard moves, resizes and opens blocks', async () => {
    const wrapper = render(true)
    const item = wrapper.get('[data-item="phase:m1"]')
    await item.trigger('keydown', { key: 'ArrowDown' })
    await item.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    await item.trigger('keydown', { key: 'ArrowRight' })
    await item.trigger('keydown', { key: 'ArrowLeft' })
    const moves = (wrapper.emitted('move') ?? []).map((e) => (e[0] as MoveRequest).placement)
    expect(moves).toEqual([
      { day: 'd1', starts_at: '09:05' },
      { day: 'd1', starts_at: '08:45' },
      { day: 'd2', starts_at: '09:00' },
    ])
    await item.trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(wrapper.emitted('resize')).toEqual([[{ kind: 'phase', id: 'm1' }, 35]])
    await item.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'phase', id: 'm1' }]])
    wrapper.unmount()
  })

  it('shades the hours outside each day', () => {
    const wrapper = render(false)
    const second = wrapper.get('section[data-day="d2"]')
    // 08:00–09:00 and 15:00–18:00 are outside day 2.
    expect(second.findAll('.planner-shade')).toHaveLength(2)
    expect(wrapper.get('section[data-day="d1"]').findAll('.planner-shade')).toHaveLength(0)
    wrapper.unmount()
  })

  it('M4-14-33: custom columns follow the categories and hold custom blocks', () => {
    const d = data()
    d.columns = [{ id: 'k1', name: 'Visitors', position: 0, public: true }]
    d.blocks.push({
      id: 'b2',
      day: 'd1',
      starts_at: '10:00',
      duration_minutes: 30,
      title: 'Open house',
      place: '',
      color: 'teal',
      responsibility: '',
      categories: [],
      columns: ['k1'],
      public: true,
    })
    const wrapper = mount(PlannerBoard, {
      props: { data: d, days: d.days, columns: gridColumns(d), editable: false },
    })
    const headers = wrapper
      .get('section[data-day="d1"]')
      .findAll('[data-column]')
      .map((h) => h.text())
    expect(headers).toEqual(['RoboMission', 'Future Engineers', 'Visitors'])
    // Third column (index 2); the event-wide lunch now spans all three columns.
    expect(wrapper.get('[data-item^="block:b2"]').attributes('style')).toContain('left: 338px')
    expect(wrapper.get('[data-item^="block:b1"]').attributes('style')).toContain('width: 500px')
    wrapper.unmount()
  })

  it('M4-14-31: columns can be resized and remember their width', async () => {
    localStorage.clear()
    const d = data()
    const props = { data: d, days: d.days, columns: gridColumns(d), storageKey: 'e1' }
    const wrapper = mount(PlannerBoard, { props })
    const handle = wrapper.get('section[data-day="d1"] [data-resize-column="c1"]')
    await handle.trigger('keydown', { key: 'ArrowRight' })
    await handle.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    // 168 + 16 + 48: both days use the new width.
    expect(wrapper.get('section[data-day="d2"] [data-column="c1"]').attributes('style')).toContain(
      'width: 232px',
    )
    expect(wrapper.get('[data-item="phase:m1"]').attributes('style')).toContain('width: 228px')
    expect(JSON.parse(localStorage.getItem('judge26.planner.columnWidths.e1')!)).toEqual({
      c1: 232,
    })
    wrapper.unmount()
    const again = mount(PlannerBoard, { props })
    expect(again.get('[data-column="c1"]').attributes('style')).toContain('width: 232px')
    await again.get('[data-resize-column="c1"]').trigger('dblclick')
    expect(again.get('[data-column="c1"]').attributes('style')).toContain('width: 168px')
    again.unmount()
    localStorage.clear()
  })

  it('M4-14-31: printed days fill the page and keep the column proportions', () => {
    const d = data()
    const wrapper = mount(PlannerBoard, {
      props: {
        data: d,
        days: d.days,
        columns: gridColumns(d),
        print: { width: 1046, height: 726 },
        printTitle: 'Regional',
      },
    })
    // 1046 - 40 axis - 6 slack, shared by two equal columns.
    expect(wrapper.get('[data-column="c2"]').attributes('style')).toContain('width: 500px')
    // 08:00–18:00 into 726 - 32 title - 60 header - 6 slack = 628px.
    const body = wrapper.get('section[data-day="d1"] .planner-body')
    expect(body.attributes('style')).toContain('height: 628px')
    expect(wrapper.findAll('[data-testid=planner-print-title]')).toHaveLength(2)
    wrapper.unmount()
  })
})
