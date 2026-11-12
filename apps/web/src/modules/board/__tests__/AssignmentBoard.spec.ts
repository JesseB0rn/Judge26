import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Board } from '../api'
import AssignmentBoard from '../components/AssignmentBoard.vue'

const board: Board = {
  categories: [
    { id: 'rmj', name: 'Junior', code: 'RMJ', judges_per_table: 2 },
    { id: 'rme', name: 'Elementary', code: 'RME', judges_per_table: 2 },
  ],
  rounds: [
    { id: 'j1', category: 'rmj', key: 'R1', name: 'Round 1', position: 1 },
    { id: 'e1', category: 'rme', key: 'R1', name: 'Round 1', position: 1 },
  ],
  tables: [
    {
      id: 'a',
      name: 'A',
      position: 1,
      active: true,
      category: 'rmj',
      categories: ['rmj'],
      judges: ['ann'],
      updated: 'va',
    },
    {
      id: 'b',
      name: 'B',
      position: 2,
      active: true,
      category: 'rmj',
      categories: ['rmj'],
      judges: ['ann'],
      updated: 'vb',
    },
    {
      id: 'c',
      name: 'C',
      position: 3,
      active: true,
      category: 'rme',
      categories: ['rme'],
      judges: [],
      updated: 'vc',
    },
  ],
  teams: [
    { id: 't1', name: 'One', category: 'rmj' },
    { id: 't2', name: 'Two', category: 'rmj' },
  ],
  games: [
    {
      id: 'g1',
      round: 'j1',
      team: 't1',
      table: 'a',
      sequence: 1,
      status: 'scheduled',
      attempt: 1,
      updated: 'v1',
    },
  ],
  judges: [
    { id: 'ann', name: 'Ann', role: 'judge' },
    { id: 'ben', name: 'Ben', role: 'judge' },
  ],
}

function mountBoard() {
  return mount(AssignmentBoard, {
    props: { board, scope: 'all', editable: true },
    attachTo: document.body,
  })
}

/** jsdom has no layout: drops hit the element we say is under the pointer. */
function pointerOver(element: Element) {
  document.elementsFromPoint = () => [element]
}

function pointer(type: string, target: EventTarget, x: number, y: number) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }),
  )
}

async function dragTo(source: Element, over: Element) {
  pointerOver(over)
  pointer('pointerdown', source, 10, 10)
  pointer('pointermove', window, 40, 40)
  await flushPromises()
  const ghost = document.querySelector('[data-testid=drag-ghost]')?.textContent ?? ''
  pointer('pointerup', window, 40, 40)
  await flushPromises()
  return ghost
}

describe('AssignmentBoard (M8-E)', () => {
  afterEach(() => document.body.replaceChildren())

  it('M8-25: shows tables by category with judge slots, teams and trays', () => {
    const wrapper = mountBoard()
    expect(wrapper.findAll('[data-testid=category-divider]').map((d) => d.text())).toEqual([
      expect.stringContaining('Junior'),
      expect.stringContaining('Elementary'),
    ])
    expect(wrapper.get('[data-testid=teams-A]').text()).toContain('One')
    expect(wrapper.get('[data-testid=team-tray]').text()).toContain('Two')
    expect(wrapper.get('[data-testid=judge-tray]').text()).toContain('Ben')
    // One judge and one free slot on A.
    expect(wrapper.get('[data-testid=judges-A]').text()).toContain('Free judge slot')
    // M8-29 / M8-T18: Ann is on A and B.
    expect(wrapper.findAll('[data-testid=judge-conflict]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('M8-T15: dragging a team onto a table of its category moves it', async () => {
    const wrapper = mountBoard()
    const two = wrapper.get('[data-testid=team-tray] [data-team=Two]').element
    await dragTo(two, wrapper.get('[data-testid=teams-B]').element)
    expect(wrapper.emitted('moveTeam')).toEqual([['t2', 'b', 0]])
    wrapper.unmount()
  })

  it('M8-T16: a table of another category refuses the team', async () => {
    const wrapper = mountBoard()
    const two = wrapper.get('[data-testid=team-tray] [data-team=Two]').element
    const ghost = await dragTo(two, wrapper.get('[data-testid=teams-C]').element)
    expect(ghost).toContain('Only tables of the team’s category')
    expect(wrapper.emitted('moveTeam')).toBeUndefined()
    wrapper.unmount()
  })

  it('M8-29: judges move from the tray to a table, and off it', async () => {
    const wrapper = mountBoard()
    await dragTo(
      wrapper.get('[data-testid=judge-tray] [data-judge=Ben]').element,
      wrapper.get('[data-testid=judges-C]').element,
    )
    await dragTo(
      wrapper.get('[data-testid=judges-A] [data-judge=Ann]').element,
      wrapper.get('[data-testid=judge-tray]').element,
    )
    expect(wrapper.emitted('moveJudge')).toEqual([
      ['ben', '', 'c'],
      ['ann', 'a', ''],
    ])
    wrapper.unmount()
  })

  it('M8-27: dragging a divider moves tables into the neighbouring category', async () => {
    const wrapper = mountBoard()
    const elementary = wrapper.findAll('[data-testid=category-divider]')[1]!.element
    const columnB = wrapper.get('[data-column=B]').element
    vi.spyOn(columnB, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
    } as DOMRect)
    await dragTo(elementary, columnB)
    expect(wrapper.emitted('moveTables')).toEqual([[[board.tables[1]], 'rme']])
    wrapper.unmount()
  })

  it('is read-only without editing rights', () => {
    const wrapper = mount(AssignmentBoard, {
      props: { board, scope: 'all', editable: false },
      attachTo: document.body,
    })
    expect(wrapper.find('[aria-label^="Actions for"]').exists()).toBe(false)
    expect(wrapper.find('.cursor-grab').exists()).toBe(false)
    wrapper.unmount()
  })
})
