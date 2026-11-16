import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { filterGames, progressOf, roundSegments } from '../lib'
import ProgressBar from '../components/ProgressBar.vue'
import { game, makePublicEvent } from './fixtures'

// M10-36: the day's progress bar is divided into one segment per round.
describe('progress per round (M10-36)', () => {
  // Saturday: RM-J R1 with 8 games (6 finished), RM-E R1 with 4 games (none finished).
  const event = makePublicEvent({
    games: [
      ...Array.from({ length: 8 }, (_, i) =>
        game({ round: 'r1', category: 'rmj', state: i < 6 ? 'done' : 'upcoming' }),
      ),
      ...Array.from({ length: 4 }, () => game({ round: 'e1', category: 'rme' })),
    ],
  })
  const games = filterGames(event, { day: 'sat' })

  it('M10-T50: two segments 2:1, the first filled to 75 %', () => {
    const segments = roundSegments(event, games)
    // In day and round order; same position: by category.
    expect(segments.map((s) => [s.round.id, s.share, s.progress.done, s.progress.total])).toEqual([
      ['e1', 4 / 12, 0, 4],
      ['r1', 8 / 12, 6, 8],
    ])
  })

  it('renders the segments with their counts in text', () => {
    const wrapper = mount(ProgressBar, {
      props: { progress: progressOf(games), segments: roundSegments(event, games) },
    })
    const parts = wrapper.findAll('[data-testid=progress-segment]')
    expect(parts.map((p) => p.attributes('style'))).toEqual([
      expect.stringContaining('33.33'),
      expect.stringContaining('66.66'),
    ])
    expect(parts[1]!.get('[data-fill=done]').attributes('style')).toContain('width: 75%')
    expect(wrapper.get('[data-testid=progress-segments]').text()).toContain(
      'Round 1 · RM-J: 6 of 8',
    )
    expect(parts[0]!.attributes('title')).toBe('Round 1 · RM-E: 0 of 4')
  })
})
