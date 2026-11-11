import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountView } from '@/test/utils'
import type { TeamDocumentRecord } from '@/shared/types/records'
import * as documents from '../documents'
import TeamDocuments from '../components/TeamDocuments.vue'

vi.mock('../documents', async (original) => ({
  ...(await original<typeof documents>()),
  listTeamDocuments: vi.fn<typeof documents.listTeamDocuments>(),
  uploadTeamDocument: vi.fn<typeof documents.uploadTeamDocument>(),
  deleteTeamDocument: vi.fn<typeof documents.deleteTeamDocument>(),
}))
vi.mock('@/shared/composables/useFileToken', () => ({
  useFileToken: () => ({ token: ref('tok'), refresh: vi.fn<() => Promise<string>>() }),
}))
const mocked = vi.mocked(documents)

const doc: TeamDocumentRecord = {
  id: 'd1',
  collectionId: 'team_documents',
  collectionName: 'team_documents',
  created: '2026-01-01 00:00:00.000Z',
  updated: '2026-01-01 00:00:00.000Z',
  team: 'team1',
  title: 'Robot description',
  file: 'robot_abc.pdf',
  uploaded_by: 'm',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listTeamDocuments.mockResolvedValue([doc])
})
afterEach(() => document.body.replaceChildren())

describe('team document helpers (M1-13)', () => {
  it('derives a title and the kind of preview from the file name', () => {
    expect(documents.defaultTitle('robot_description-v2.pdf')).toBe('robot description v2')
    expect(documents.documentKind('a.PDF')).toBe('pdf')
    expect(documents.documentKind('a.jpeg')).toBe('image')
    expect(documents.documentKind('a.docx')).toBe('other')
  })

  it('builds protected file URLs with the token', () => {
    const url = documents.documentUrl(doc, 'tok', true)
    expect(url).toContain('/api/files/team_documents/d1/robot_abc.pdf')
    expect(url).toContain('token=tok')
    expect(url).toContain('download=')
  })
})

describe('TeamDocuments (M1-13)', () => {
  it('lists documents with open and download links for readers, without upload or delete', async () => {
    const { wrapper } = await mountView(TeamDocuments, {
      props: { teamId: 'team1', editable: false },
    })
    expect(mocked.listTeamDocuments).toHaveBeenCalledWith(['team1'])
    const row = wrapper.get('[data-document="Robot description"]')
    expect(row.get('a').attributes('href')).toContain('token=tok')
    expect(row.find('[aria-label="Download Robot description"]').exists()).toBe(true)
    expect(row.find('[aria-label="Delete Robot description"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=document-upload]').exists()).toBe(false)
  })

  it('lets managers upload (title prefilled from the file) and delete documents', async () => {
    mocked.uploadTeamDocument.mockResolvedValue(doc)
    mocked.deleteTeamDocument.mockResolvedValue(true)
    const { wrapper } = await mountView(TeamDocuments, {
      props: { teamId: 'team1', editable: true },
    })
    const file = new File(['%PDF'], 'technical_docs.pdf', { type: 'application/pdf' })
    const input = wrapper.get('#document-file').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    await wrapper.get('#document-file').trigger('change')
    expect((wrapper.get('#document-title').element as HTMLInputElement).value).toBe(
      'technical docs',
    )
    await wrapper.get('[data-testid=document-upload]').trigger('submit')
    await flushPromises()
    expect(mocked.uploadTeamDocument).toHaveBeenCalledWith('team1', 'technical docs', file)
    expect(mocked.listTeamDocuments).toHaveBeenCalledTimes(2)

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.get('[aria-label="Delete Robot description"]').trigger('click')
    await flushPromises()
    expect(mocked.deleteTeamDocument).toHaveBeenCalledWith('d1')
  })

  it('rejects files over 20 MB before uploading', async () => {
    const { wrapper } = await mountView(TeamDocuments, {
      props: { teamId: 'team1', editable: true },
    })
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    const input = wrapper.get('#document-file').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [big] })
    await wrapper.get('#document-file').trigger('change')
    expect(wrapper.text()).toContain('larger than 20 MB')
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeDefined()
  })
})
