import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import {
  expectDenied,
  Fixtures,
  mailsTo,
  PASSWORD,
  tokenFromMail,
  validMembers,
} from './support/fixtures'

// Languages (docs/specifications/i18n.md): users choose de, fr, it or en; emails are sent in the
// recipient's language and server errors carry codes the web app translates.

describe('i18n', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  const register = (email: string, language?: string) =>
    server
      .client()
      .collection('users')
      .create({ email, password: PASSWORD, passwordConfirm: PASSWORD, name: 'Ada', language })

  async function latestMail(email: string, path: string) {
    await tokenFromMail(server, email, path) // waits for PocketBase's asynchronous send
    const mails = await mailsTo(server, email)
    return mails[mails.length - 1]!
  }

  it('stores the language a user registered in; only supported languages', async () => {
    const user = await register('lang-de@test.local', 'de')
    expect(user.language).toBe('de')
    await expectDenied(register('lang-xx@test.local', 'rm'))
  })

  it('users change their own language', async () => {
    const user = await fx.user()
    const updated = await user.pb.collection('users').update(user.id, { language: 'it' })
    expect(updated.language).toBe('it')
  })

  it('sends the verification email in the user’s language, with the frontend link', async () => {
    const email = 'verify-fr@test.local'
    await register(email, 'fr')
    await server.client().collection('users').requestVerification(email)
    const { url } = await tokenFromMail(server, email, '/auth/verify-email')
    expect(url).toContain('/auth/verify-email?token=')
    const mail = await latestMail(email, '/auth/verify-email')
    expect(mail.subject).toContain('Confirmez votre adresse e-mail')
    expect(mail.html).toContain('Bonjour Ada')
  })

  it('sends the password reset email in the user’s language; English without one', async () => {
    await register('reset-it@test.local', 'it')
    await server.client().collection('users').requestPasswordReset('reset-it@test.local')
    expect((await latestMail('reset-it@test.local', '/auth/reset-password')).subject).toContain(
      'Reimposti la sua password',
    )

    await register('reset-none@test.local')
    await server.client().collection('users').requestPasswordReset('reset-none@test.local')
    expect((await latestMail('reset-none@test.local', '/auth/reset-password')).subject).toContain(
      'Reset your',
    )
  })

  it('queues registration emails in the coach’s language', async () => {
    const event = await fx.event({ status: 'published' })
    const category = await fx.category(event.id)
    const coach = await fx.user({ name: 'Grace' })
    await coach.pb.collection('users').update(coach.id, { language: 'de' })
    const team = await coach.pb.collection('teams').create({
      event: event.id,
      category: category.id,
      name: 'Bit Bären',
      coach: coach.id,
      coach_email: coach.email,
      status: 'submitted',
      members: validMembers(),
    })
    const [mail] = await fx.su
      .collection('mail_outbox')
      .getFullList({ filter: `team = "${team.id}"` })
    expect(mail!.subject).toBe('Anmeldung erhalten: Bit Bären')
  })

  it('each language of a template is edited separately and cannot be re-assigned', async () => {
    const admin = await fx.admin()
    const german = await admin.pb
      .collection('mail_templates')
      .getFirstListItem('key = "registration_submitted" && language = "de"')
    await admin.pb.collection('mail_templates').update(german.id, { subject: 'Neu: {{team_name}}' })
    const english = await admin.pb
      .collection('mail_templates')
      .getFirstListItem('key = "registration_submitted" && language = "en"')
    expect(english.subject).not.toContain('Neu')
    await expectDenied(admin.pb.collection('mail_templates').update(german.id, { language: 'fr' }))
  })

  it('server errors carry a message code (data._error)', async () => {
    const user = await fx.user()
    const error = await expectDenied(user.pb.send('/api/admin/users', {}))
    expect(error.status).toBe(403)
    expect(error.response.data._error).toEqual({
      code: 'admins_only',
      message: 'Only administrators can list users.',
    })
  })
})
