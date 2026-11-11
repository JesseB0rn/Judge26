import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import {
  buttonByText,
  click,
  fill,
  makeCategory,
  makeEvent,
  makeGame,
  makeRole,
  makeRound,
  makeTable,
  makeTeam,
  makeUser,
  mountView,
} from '@/test/utils'
import * as api from '../api'
import * as eventsApi from '@/modules/events/api'
import * as categoriesApi from '@/modules/categories/api'
import EventTeamsTab from '../components/EventTeamsTab.vue'
import MyTeamsView from '../views/MyTeamsView.vue'
import TeamFormView from '../views/TeamFormView.vue'

vi.mock('../api')
vi.mock('@/modules/events/api')
vi.mock('@/modules/categories/api')
// Team documents (M1-13) are covered in documents.spec.ts; keep them off the network here.
vi.mock('../documents', async (original) => ({
  ...(await original<typeof import('../documents')>()),
  listTeamDocuments: vi.fn<(typeof import('@/modules/teams/documents'))['listTeamDocuments']>(
    async () => [],
  ),
  listEventTeamDocuments: vi.fn<() => Promise<{ id: string; team: string }[]>>(async () => [
    { id: 'd1', team: 't2' },
    { id: 'd2', team: 't2' },
  ]),
}))
vi.mock('@/shared/composables/useFileToken', async () => {
  const { ref } = await import('vue')
  return { useFileToken: () => ({ token: ref('tok'), refresh: async () => 'tok' }) }
})
vi.mock('@/shared/export/download', async (original) => ({
  ...(await original<typeof import('@/shared/export/download')>()),
  downloadTables: vi.fn<typeof import('@/shared/export/download').downloadTables>(),
}))
const mocked = vi.mocked(api)

const manager = { roles: [makeRole('event_manager', 'event1')] }

describe('team views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(eventsApi.getEvent).mockResolvedValue(makeEvent())
    vi.mocked(categoriesApi.listEventCategories).mockResolvedValue([makeCategory()])
    mocked.listEventTeams.mockResolvedValue([
      makeTeam({ status: 'submitted', expand: { category: makeCategory() } }),
      makeTeam({
        id: 't2',
        name: 'Bot Builders',
        status: 'approved',
        expand: { category: makeCategory() },
      }),
    ])
  })
  afterEach(() => document.body.replaceChildren())

  describe('TeamFormView (coach)', () => {
    it('M1-10 / M1-T08: registers and submits a new team', async () => {
      mocked.createTeam.mockResolvedValue(makeTeam({ id: 'new' }))
      mocked.getTeam.mockResolvedValue(makeTeam({ id: 'new', status: 'submitted' }))
      const { wrapper, router } = await mountView(TeamFormView, { props: { eventId: 'event1' } })

      expect((document.querySelector('input[type=email]') as HTMLInputElement).value).toBe(
        'coach@example.com',
      )
      await fill('input[maxlength="100"]', 'Robo Rangers')
      await click(buttonByText('Add member'))
      await click(buttonByText('Add member'))
      const rows = wrapper.findAll('[data-testid=member-row]')
      for (const [i, row] of rows.entries()) {
        const [first, last, year] = row.findAll('input')
        await first!.setValue(`First${i}`)
        await last!.setValue(`Last${i}`)
        await year!.setValue('2013')
      }
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(mocked.createTeam).toHaveBeenCalledWith(
        'event1',
        'user1',
        expect.objectContaining({
          name: 'Robo Rangers',
          category: 'cat1',
          coach_email: 'coach@example.com',
          members: [
            { first_name: 'First0', last_name: 'Last0', birth_year: 2013 },
            { first_name: 'First1', last_name: 'Last1', birth_year: 2013 },
          ],
        }),
        'submitted',
      )
      expect(router.currentRoute.value.name).toBe('team')
    })

    it('validates the team before submission', async () => {
      await mountView(TeamFormView, { props: { eventId: 'event1' } })
      await fill('input[maxlength="100"]', 'Too small')
      await click(buttonByText('Submit registration'))
      expect(document.querySelector('[data-testid=client-errors]')?.textContent).toContain(
        'requires at least 2 members',
      )
      expect(mocked.createTeam).not.toHaveBeenCalled()
    })

    it('saves incomplete drafts', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam({ members: [] }))
      mocked.updateTeam.mockResolvedValue(makeTeam({ members: [] }))
      await mountView(TeamFormView, { props: { id: 'team1' } })
      await click(buttonByText('Add member'))
      await click(document.querySelector<HTMLElement>('button[aria-label="Remove member 1"]')!)
      await click(buttonByText('Save draft'))
      expect(mocked.updateTeam).toHaveBeenCalledWith(
        'team1',
        expect.objectContaining({ status: 'draft', members: [] }),
      )
    })

    it('shows server-side validation errors', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam())
      mocked.updateTeam.mockRejectedValue(
        new ClientResponseError({
          status: 400,
          response: {
            message: 'Failed to validate the submitted data.',
            data: { members: { code: 'incomplete_team', message: 'Member 1 is 6 in 2026.' } },
          },
        }),
      )
      const { wrapper } = await mountView(TeamFormView, { props: { id: 'team1' } })
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(wrapper.text()).toContain('Member 1 is 6 in 2026.')
    })

    it('M1-T09: shows the rejection reason and allows resubmission', async () => {
      mocked.getTeam.mockResolvedValue(
        makeTeam({ status: 'rejected', review_note: 'Missing school' }),
      )
      const { wrapper } = await mountView(TeamFormView, { props: { id: 'team1' } })
      expect(wrapper.get('[data-testid=review-note]').text()).toContain('Missing school')
      expect(wrapper.text()).toContain('Submit registration')
    })

    it('locks submitted registrations', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam({ status: 'submitted' }))
      const { wrapper } = await mountView(TeamFormView, { props: { id: 'team1' } })
      expect(wrapper.text()).toContain('awaiting review')
      expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
      expect(wrapper.text()).not.toContain('Submit registration')
    })

    it('deletes drafts', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mocked.getTeam.mockResolvedValue(makeTeam())
      mocked.deleteTeam.mockResolvedValue(true)
      const { router } = await mountView(TeamFormView, { props: { id: 'team1' } })
      await click(buttonByText('Delete draft'))
      expect(mocked.deleteTeam).toHaveBeenCalledWith('team1')
      expect(router.currentRoute.value.name).toBe('my-teams')
    })
  })

  describe('TeamFormView (staff)', () => {
    it('M1-11: managers edit any registration and register on behalf of coaches', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam({ status: 'submitted', coach: 'someone-else' }))
      mocked.updateTeam.mockResolvedValue(makeTeam())
      await mountView(TeamFormView, { props: { id: 'team1' }, session: manager })
      await click(buttonByText('Save'))
      expect(mocked.updateTeam).toHaveBeenCalledWith(
        'team1',
        expect.not.objectContaining({ status: expect.anything() }),
      )
    })

    it('creates staff registrations without a coach account', async () => {
      mocked.createTeam.mockResolvedValue(makeTeam({ id: 'new' }))
      mocked.getTeam.mockResolvedValue(makeTeam({ id: 'new' }))
      await mountView(TeamFormView, { props: { eventId: 'event1' }, session: manager })
      await fill('input[maxlength="100"]', 'Staff Team')
      await click(buttonByText('Save'))
      expect(mocked.createTeam).toHaveBeenCalledWith('event1', '', expect.anything(), 'draft')
    })
  })

  describe('EventTeamsTab', () => {
    it('lists teams and filters by status', async () => {
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: true, canManage: true },
        session: manager,
      })
      expect(wrapper.findAll('[data-team]')).toHaveLength(2)
      await wrapper.get('select[aria-label="Filter by status"]').setValue('approved')
      expect(wrapper.findAll('[data-team]').map((r) => r.attributes('data-team'))).toEqual([
        'Bot Builders',
      ])
    })

    it('M7-05: staff export the filtered teams with their members', async () => {
      const { downloadTables } = await import('@/shared/export/download')
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: true, canManage: true },
        session: manager,
      })
      await wrapper.get('select[aria-label="Filter by status"]').setValue('approved')
      await click(buttonByText('CSV'))
      const [, format, tables] = vi.mocked(downloadTables).mock.calls[0]!
      expect(format).toBe('csv')
      expect(tables.map((t) => t.name)).toEqual(['Teams', 'Members'])
      expect(tables[0]!.rows.map((r) => r[0])).toEqual(
        wrapper.findAll('[data-team]').map((r) => r.attributes('data-team')),
      )
      document.body.replaceChildren()

      // Coaches (not staff) see only their own teams and get no export.
      await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: false, canManage: false },
      })
      expect(() => buttonByText('CSV')).toThrow('No button')
    })

    it('M1-13: shows how many documents each team has', async () => {
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: true, canManage: true },
        session: manager,
      })
      const count = (name: string) =>
        wrapper.get(`[data-team="${name}"] [data-documents]`).attributes('data-documents')
      expect(count('Bot Builders')).toBe('2')
      expect(count('Robo Rangers')).toBe('0')
    })

    it('M1-11: approves submitted registrations', async () => {
      mocked.updateTeam.mockResolvedValue(makeTeam())
      await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: true, canManage: true },
        session: manager,
      })
      await click(buttonByText('Approve'))
      expect(mocked.updateTeam).toHaveBeenCalledWith('team1', { status: 'approved' })
    })

    it('M1-T09: rejects registrations with a reason', async () => {
      mocked.updateTeam.mockResolvedValue(makeTeam({ status: 'rejected' }))
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: true, canManage: true },
        session: manager,
      })
      await click(buttonByText('Reject', wrapper.get('[data-team="Robo Rangers"]').element))
      await fill('[role=dialog] textarea', 'Incomplete documents')
      await click(buttonByText('Reject', document.querySelector('[role=dialog]')!))
      expect(mocked.updateTeam).toHaveBeenCalledWith('team1', {
        status: 'rejected',
        review_note: 'Incomplete documents',
      })
    })

    it('hides review actions without permission', async () => {
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: false, canManage: false },
      })
      expect(wrapper.findAll('button').map((b) => b.text())).toEqual([])
      expect(wrapper.text()).toContain('You see the teams you registered.')
    })

    it('M1-12 / M1-T10: imports valid CSV rows and reports invalid ones', async () => {
      mocked.importTeams.mockResolvedValue([])
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), staff: true, canManage: true },
        session: manager,
      })
      await click(buttonByText('Import CSV'))
      const csv = [
        'team_name,category_code,coach_email,member1_first_name,member1_last_name,member1_birth_year,member2_first_name,member2_last_name,member2_birth_year',
        'New Team,RM-J,a@example.com,Ada,L,2013,Alan,T,2013',
        'Robo Rangers,RM-J,a@example.com,Ada,L,2013,Alan,T,2013',
        'Bad,XX,a@example.com,,,,,,',
      ].join('\n')
      const input = document.querySelector<HTMLInputElement>('[data-testid=import-file]')!
      Object.defineProperty(input, 'files', { value: [new File([csv], 'teams.csv')] })
      input.dispatchEvent(new Event('change'))
      await vi.waitFor(() =>
        expect(document.querySelector('[data-testid=import-summary]')?.textContent).toContain(
          '1 valid, 2 invalid',
        ),
      )
      const errors = document.querySelector('[data-testid=import-errors]')!.textContent
      expect(errors).toContain('already exists')
      expect(errors).toContain('Unknown category code "XX"')

      await click(buttonByText('Import one team'))
      expect(mocked.importTeams).toHaveBeenCalledWith(
        'event1',
        [expect.objectContaining({ name: 'New Team', category: 'cat1' })],
        'submitted',
      )
      expect(wrapper.emitted()).toBeDefined()
    })
  })

  it('MyTeamsView lists the coach’s teams', async () => {
    mocked.listOwnTeams.mockResolvedValue([
      makeTeam({ expand: { event: makeEvent(), category: makeCategory() } }),
    ])
    const { wrapper } = await mountView(MyTeamsView, { session: { user: makeUser() } })
    expect(mocked.listOwnTeams).toHaveBeenCalledWith('user1')
    expect(wrapper.get('[data-testid=my-teams]').text()).toContain('Robo Rangers')
    expect(wrapper.text()).toContain('WRO Final')
    expect(wrapper.get('[data-testid=my-schedule]').text()).toContain('No games')
  })

  it('MyTeamsView lets coaches submit editable registrations', async () => {
    mocked.listOwnTeams.mockResolvedValue([
      makeTeam({ expand: { event: makeEvent(), category: makeCategory() } }),
      makeTeam({
        id: 'rejected',
        name: 'Rejected Team',
        status: 'rejected',
        expand: { event: makeEvent(), category: makeCategory() },
      }),
      makeTeam({
        id: 'archived',
        name: 'Archived Event Team',
        expand: { event: makeEvent({ status: 'archived' }), category: makeCategory() },
      }),
    ])
    mocked.updateTeam.mockResolvedValue(makeTeam({ status: 'submitted' }))
    const { wrapper } = await mountView(MyTeamsView, { session: { user: makeUser() } })

    expect(buttonByText('Submit', wrapper.element)).toBeDefined()
    expect(buttonByText('Resubmit', wrapper.element)).toBeDefined()
    expect(wrapper.find('[data-team="Archived Event Team"]').find('button').exists()).toBe(false)

    await click(buttonByText('Submit', wrapper.element))
    await click(buttonByText('Resubmit', wrapper.element))
    expect(mocked.updateTeam).toHaveBeenNthCalledWith(1, 'team1', { status: 'submitted' })
    expect(mocked.updateTeam).toHaveBeenNthCalledWith(2, 'rejected', { status: 'submitted' })
  })

  it('MyTeamsView shows the scheduled games of the coach’s teams', async () => {
    mocked.listOwnTeams.mockResolvedValue([])
    mocked.listOwnScheduledGames.mockResolvedValue([
      {
        ...makeGame({ table: 'table1', sequence: 1 }),
        expand: {
          team: makeTeam(),
          // Scoring start and day from the schedule planner (M4-14-30).
          round: {
            ...makeRound('R1'),
            starts_at: '09:30',
            day: { id: 'd1', date: '2026-06-13', label: 'Day 1' },
          },
          table: makeTable({ name: 'Table 3' }),
        },
      },
    ])
    const { wrapper } = await mountView(MyTeamsView, { session: { user: makeUser() } })
    expect(mocked.listOwnScheduledGames).toHaveBeenCalledWith('user1')
    const text = wrapper.get('[data-testid=my-schedule]').text()
    expect(text).toContain('Robo Rangers')
    expect(text).toContain('Round 1')
    expect(text).toContain('Table 3')
    // Start time from the schedule planner (M4-14-30).
    expect(wrapper.get('[data-testid=my-schedule-when]').text()).toBe('Day 1 · from 09:30')
  })
})
