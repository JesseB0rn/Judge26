import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { buttonByText, click, fill, makeEvent, makeRole, mountView } from '@/test/utils'
import * as invitations from '../invitations'
import EventStaffTab from '../components/EventStaffTab.vue'
import { parseStaffCsv, TEMPLATE_CSV } from '../import/staffCsv'
import type { InviteResult, StaffMember } from '../invitations'

vi.mock('../invitations')
const mocked = vi.mocked(invitations)
const manager = { roles: [makeRole('event_manager', 'event1')] }

function member(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'a1',
    role: 'judge',
    status: 'active',
    user: { id: 'u1', name: 'Jo Judge', email: 'jo@example.com', verified: true },
    invitation: null,
    ...overrides,
  }
}

const invited = member({
  id: 'a2',
  status: 'invited',
  user: { id: 'u2', name: 'Ines Invited', email: 'ines@example.com', verified: false },
  invitation: {
    id: 'i2',
    status: 'invited',
    sent_at: '2026-11-12 10:00:00.000Z',
    expires_at: '2026-11-26 10:00:00.000Z',
    accepted_at: '',
  },
})

function result(overrides: Partial<InviteResult['counts']> = {}): InviteResult {
  return {
    rows: [],
    counts: { invite: 0, add: 0, already: 0, duplicate: 0, invalid: 0, ...overrides },
  }
}

describe('EventStaffTab (M8-B)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listStaff.mockResolvedValue([member(), invited])
  })
  afterEach(() => document.body.replaceChildren())

  const mount = (editable = true, session = manager) =>
    mountView(EventStaffTab, { props: { event: makeEvent(), editable }, session })

  it('M8-09: lists the staff with their invitation status', async () => {
    const { wrapper } = await mount()
    const row = (email: string) => wrapper.get(`[data-staff="${email}"]`)
    expect(row('jo@example.com').get('[data-testid=staff-status]').text()).toBe('Active')
    expect(row('ines@example.com').get('[data-testid=staff-status]').text()).toBe('Invited')
    expect(row('ines@example.com').text()).toContain('Link valid until')
  })

  it('M8-06: invites one person; managers cannot invite event managers', async () => {
    mocked.invite.mockResolvedValue(result({ invite: 1 }))
    const { wrapper } = await mount()
    const options = wrapper.findAll('[data-testid=invite-form] select option').map((o) => o.text())
    expect(options).toEqual(['Head judge', 'Judge'])
    await fill('[data-testid=invite-form] input:not([type=email])', 'Grace')
    await fill('[data-testid=invite-form] input[type=email]', 'grace@example.com')
    await wrapper.get('[data-testid=invite-form]').trigger('submit')
    await flushPromises()
    expect(mocked.invite).toHaveBeenCalledWith('event1', [
      { name: 'Grace', email: 'grace@example.com', role: 'judge' },
    ])
    expect(mocked.listStaff).toHaveBeenCalledTimes(2)
  })

  it('admins can also invite event managers', async () => {
    const { wrapper } = await mount(true, { roles: [makeRole('admin')] })
    const options = wrapper.findAll('[data-testid=invite-form] select option').map((o) => o.text())
    expect(options).toContain('Event manager')
  })

  it('resends and revokes open invitations', async () => {
    mocked.resendInvitation.mockResolvedValue({ id: 'i2', status: 'invited', expires_at: '' })
    mocked.revokeInvitation.mockResolvedValue({})
    await mount()
    await click(
      document.querySelector<HTMLElement>(
        '[aria-label="Send the invitation to ines@example.com again"]',
      )!,
    )
    expect(mocked.resendInvitation).toHaveBeenCalledWith('i2')
    await click(
      document.querySelector<HTMLElement>(
        '[aria-label="Revoke the invitation of ines@example.com"]',
      )!,
    )
    expect(mocked.revokeInvitation).toHaveBeenCalledWith('i2')
  })

  it('removes active staff after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocked.removeStaff.mockResolvedValue({})
    await mount()
    await click(
      document.querySelector<HTMLElement>(
        '[data-staff="jo@example.com"] [aria-label="Remove role"]',
      )!,
    )
    expect(mocked.removeStaff).toHaveBeenCalledWith('event1', 'a1')
  })

  it('is read-only for archived events', async () => {
    const { wrapper } = await mount(false)
    expect(wrapper.find('[data-testid=invite-form]').exists()).toBe(false)
    expect(document.querySelector('[aria-label="Remove role"]')).toBeNull()
  })

  it('M8-T04: previews a CSV import and invites after confirmation', async () => {
    mocked.previewInvitations.mockResolvedValue({
      rows: [
        {
          line: 2,
          name: 'New',
          email: 'new@example.com',
          role: 'judge',
          status: 'invite',
          errors: [],
        },
        {
          line: 3,
          name: 'Old',
          email: 'old@example.com',
          role: 'head_judge',
          status: 'add',
          errors: [],
        },
        {
          line: 4,
          name: '',
          email: 'bad',
          role: 'judge',
          status: 'invalid',
          errors: ['name_required', 'invalid_email'],
        },
      ],
      counts: { invite: 1, add: 1, already: 0, duplicate: 0, invalid: 1 },
    })
    mocked.invite.mockResolvedValue(result({ invite: 1, add: 1 }))
    await mount()
    await click(buttonByText('Import CSV'))
    const csv = 'name,email,role\nNew,new@example.com,\nOld,old@example.com,head judge\n,bad,judge'
    const input = document.querySelector<HTMLInputElement>('[data-testid=staff-import-file]')!
    Object.defineProperty(input, 'files', { value: [new File([csv], 'staff.csv')] })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid=staff-import-summary]')?.textContent).toContain(
        '1 to invite, 1 to add, 1 skipped',
      ),
    )
    expect(mocked.previewInvitations).toHaveBeenCalledWith('event1', [
      { line: 2, name: 'New', email: 'new@example.com', role: 'judge' },
      { line: 3, name: 'Old', email: 'old@example.com', role: 'head_judge' },
      { line: 4, name: '', email: 'bad', role: 'judge' },
    ])
    const rows = document.querySelector('[data-testid=staff-import-rows]')!.textContent
    expect(rows).toContain('Name is required.')
    expect(mocked.invite).not.toHaveBeenCalled()

    await click(buttonByText('Invite 2 people'))
    expect(mocked.invite).toHaveBeenCalledWith('event1', expect.any(Array))
  })
})

describe('parseStaffCsv', () => {
  it('reads name, email and an optional role in any column order and case', () => {
    expect(parseStaffCsv('EMAIL,Name\na@example.com,Ada')).toEqual({
      fileErrors: [],
      rows: [{ line: 2, name: 'Ada', email: 'a@example.com', role: 'judge' }],
    })
    expect(parseStaffCsv('name,email,role\nB,b@example.com,Head Judge').rows[0]!.role).toBe(
      'head_judge',
    )
    // Unknown roles reach the server's preview, which reports them.
    expect(parseStaffCsv('name,email,role\nC,c@example.com,boss').rows[0]!.role).toBe('boss')
  })

  it('reports file-level problems', () => {
    expect(parseStaffCsv('name\nA').fileErrors).toEqual(['Missing required column(s): email.'])
    expect(parseStaffCsv('name,email').fileErrors).toEqual(['The file contains no data rows.'])
  })

  it('accepts the downloadable example file', () => {
    expect(parseStaffCsv(TEMPLATE_CSV).rows.map((r) => r.role)).toEqual(['judge', 'head_judge'])
  })
})
