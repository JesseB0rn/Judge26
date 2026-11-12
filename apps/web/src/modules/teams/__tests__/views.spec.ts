import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import {
  buttonByText,
  click,
  fill,
  makeCategory,
  makeEvent,
  makeRole,
  makeTeam,
  mountView,
} from '@/test/utils'
import * as api from '../api'
import * as eventsApi from '@/modules/events/api'
import * as categoriesApi from '@/modules/categories/api'
import EventTeamsTab from '../components/EventTeamsTab.vue'
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
const judge = { roles: [makeRole('judge', 'event1')] }

/** Fills two valid members into the members editor. */
async function addTwoMembers(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
  await click(buttonByText('Add member'))
  await click(buttonByText('Add member'))
  for (const [i, row] of wrapper.findAll('[data-testid=member-row]').entries()) {
    const [first, last, year] = row.findAll('input')
    await first!.setValue(`First${i}`)
    await last!.setValue(`Last${i}`)
    await year!.setValue('2013')
  }
}

describe('team views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(eventsApi.getEvent).mockResolvedValue(makeEvent())
    vi.mocked(categoriesApi.listEventCategories).mockResolvedValue([makeCategory()])
    mocked.listEventTeams.mockResolvedValue([
      makeTeam({ status: 'withdrawn', expand: { category: makeCategory() } }),
      makeTeam({
        id: 't2',
        name: 'Bot Builders',
        status: 'approved',
        expand: { category: makeCategory() },
      }),
    ])
  })
  afterEach(() => document.body.replaceChildren())

  describe('TeamFormView', () => {
    it('M8-03: managers create active teams with an optional contact', async () => {
      mocked.createTeam.mockResolvedValue(makeTeam({ id: 'new' }))
      mocked.getTeam.mockResolvedValue(makeTeam({ id: 'new' }))
      const { wrapper, router } = await mountView(TeamFormView, {
        props: { eventId: 'event1' },
        session: manager,
      })
      expect(wrapper.text()).toContain('New team')
      const email = document.querySelector<HTMLInputElement>('input[type=email]')!
      expect([email.value, email.required]).toEqual(['', false])
      await fill('input[maxlength="100"]', 'Robo Rangers')
      await addTwoMembers(wrapper)
      await click(buttonByText('Save'))

      expect(mocked.createTeam).toHaveBeenCalledWith(
        'event1',
        expect.objectContaining({
          name: 'Robo Rangers',
          category: 'cat1',
          coach_email: '',
          members: [
            { first_name: 'First0', last_name: 'Last0', birth_year: 2013 },
            { first_name: 'First1', last_name: 'Last1', birth_year: 2013 },
          ],
        }),
      )
      expect(router.currentRoute.value.name).toBe('team')
    })

    it('validates active teams against the category', async () => {
      await mountView(TeamFormView, { props: { eventId: 'event1' }, session: manager })
      await fill('input[maxlength="100"]', 'Too small')
      await click(buttonByText('Save'))
      expect(document.querySelector('[data-testid=client-errors]')?.textContent).toContain(
        'requires at least 2 members',
      )
      expect(mocked.createTeam).not.toHaveBeenCalled()
    })

    it('edits a team without changing its status', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam())
      mocked.updateTeam.mockResolvedValue(makeTeam())
      await mountView(TeamFormView, { props: { id: 'team1' }, session: manager })
      await click(buttonByText('Save'))
      expect(mocked.updateTeam).toHaveBeenCalledWith(
        'team1',
        expect.not.objectContaining({ status: expect.anything() }),
      )
    })

    it('withdraws an active team, even when it is incomplete', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam({ members: [] }))
      mocked.updateTeam.mockResolvedValue(makeTeam({ status: 'withdrawn', members: [] }))
      await mountView(TeamFormView, { props: { id: 'team1' }, session: manager })
      await click(document.querySelector<HTMLElement>('[data-testid=withdraw]')!)
      expect(mocked.updateTeam).toHaveBeenCalledWith(
        'team1',
        expect.objectContaining({ status: 'withdrawn' }),
      )
    })

    it('reactivates a withdrawn or earlier registered team', async () => {
      for (const status of ['withdrawn', 'submitted'] as const) {
        mocked.getTeam.mockResolvedValue(makeTeam({ status }))
        mocked.updateTeam.mockResolvedValue(makeTeam())
        const { wrapper } = await mountView(TeamFormView, {
          props: { id: 'team1' },
          session: manager,
        })
        expect(wrapper.find('[data-testid=inactive]').exists()).toBe(true)
        await click(document.querySelector<HTMLElement>('[data-testid=activate]')!)
        expect(mocked.updateTeam).toHaveBeenLastCalledWith(
          'team1',
          expect.objectContaining({ status: 'approved' }),
        )
        document.body.replaceChildren()
      }
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
      const { wrapper } = await mountView(TeamFormView, {
        props: { id: 'team1' },
        session: manager,
      })
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(wrapper.text()).toContain('Member 1 is 6 in 2026.')
    })

    it('is read-only for other event staff', async () => {
      mocked.getTeam.mockResolvedValue(makeTeam())
      const { wrapper } = await mountView(TeamFormView, { props: { id: 'team1' }, session: judge })
      expect(wrapper.get('[data-testid=read-only]').text()).toContain('Only event managers')
      expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid=withdraw]').exists()).toBe(false)
    })

    it('only admins delete teams', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mocked.getTeam.mockResolvedValue(makeTeam())
      mocked.deleteTeam.mockResolvedValue(true)
      await mountView(TeamFormView, { props: { id: 'team1' }, session: manager })
      expect(() => buttonByText('Delete team')).toThrow('No button')
      document.body.replaceChildren()

      const { router } = await mountView(TeamFormView, {
        props: { id: 'team1' },
        session: { roles: [makeRole('admin')] },
      })
      await click(buttonByText('Delete team'))
      expect(mocked.deleteTeam).toHaveBeenCalledWith('team1')
      expect(router.currentRoute.value).toMatchObject({
        name: 'event',
        query: { tab: 'teams' },
      })
    })
  })

  describe('EventTeamsTab', () => {
    it('lists teams and filters by status (active / withdrawn)', async () => {
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), canManage: true },
        session: manager,
      })
      expect(wrapper.findAll('[data-team]')).toHaveLength(2)
      const select = wrapper.get('select[aria-label="Filter by status"]')
      expect(select.findAll('option').map((o) => o.text())).toEqual([
        'All statuses',
        'Active',
        'Withdrawn',
      ])
      await select.setValue('approved')
      expect(wrapper.findAll('[data-team]').map((r) => r.attributes('data-team'))).toEqual([
        'Bot Builders',
      ])
    })

    it('M7-05: exports the filtered teams with their members', async () => {
      const { downloadTables } = await import('@/shared/export/download')
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), canManage: true },
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
    })

    it('M1-13: shows how many documents each team has', async () => {
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), canManage: true },
        session: manager,
      })
      const count = (name: string) =>
        wrapper.get(`[data-team="${name}"] [data-documents]`).attributes('data-documents')
      expect(count('Bot Builders')).toBe('2')
      expect(count('Robo Rangers')).toBe('0')
    })

    it('M8-01: shows the contact, never a coach', async () => {
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), canManage: true },
        session: manager,
      })
      expect(wrapper.text()).toContain('Contact')
      expect(wrapper.text().toLowerCase()).not.toContain('coach')
    })

    it('offers adding and importing teams only to managers', async () => {
      await mountView(EventTeamsTab, { props: { event: makeEvent(), canManage: true } })
      expect(buttonByText('Import CSV')).toBeTruthy()
      expect(document.body.textContent).toContain('Add team')
      document.body.replaceChildren()

      await mountView(EventTeamsTab, { props: { event: makeEvent(), canManage: false } })
      expect(() => buttonByText('Import CSV')).toThrow('No button')
      expect(document.body.textContent).not.toContain('Add team')
    })

    it('M1-12 / M8-03: imports valid CSV rows as active teams and reports invalid ones', async () => {
      mocked.importTeams.mockResolvedValue([])
      const { wrapper } = await mountView(EventTeamsTab, {
        props: { event: makeEvent(), canManage: true },
        session: manager,
      })
      await click(buttonByText('Import CSV'))
      const csv = [
        'team_name,category_code,contact_email,member1_first_name,member1_last_name,member1_birth_year,member2_first_name,member2_last_name,member2_birth_year',
        'New Team,RM-J,,Ada,L,2013,Alan,T,2013',
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
      expect(document.querySelector('[role=dialog] select')).toBeNull()

      await click(buttonByText('Import one team'))
      expect(mocked.importTeams).toHaveBeenCalledWith('event1', [
        expect.objectContaining({ name: 'New Team', category: 'cat1', coach_email: '' }),
      ])
      expect(wrapper.emitted()).toBeDefined()
    })
  })
})
