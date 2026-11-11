import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import { mountView, buttonByText, click, fill, makeUser } from '@/test/utils'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import VerifyEmailView from '../views/VerifyEmailView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'

const apiError = (status: number, response: object) => new ClientResponseError({ status, response })

describe('auth views', () => {
  afterEach(() => document.body.replaceChildren())
  beforeEach(() => vi.restoreAllMocks())

  it('LoginView signs in and follows the redirect', async () => {
    const { wrapper, router, session } = await mountView(LoginView, {
      session: { user: null },
      path: '/login?redirect=/events',
    })
    const login = vi.spyOn(session, 'login').mockResolvedValue()
    await fill('input[type=email]', 'coach@example.com')
    await fill('input[type=password]', 'secret-pass')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/events'))
    expect(login).toHaveBeenCalledWith('coach@example.com', 'secret-pass')
  })

  it('LoginView shows an error for invalid credentials (M1-T03)', async () => {
    const { wrapper, session } = await mountView(LoginView, { session: { user: null } })
    vi.spyOn(session, 'login').mockRejectedValue(
      apiError(400, { message: 'Failed to authenticate.' }),
    )
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.find('[role=alert]').text()).toContain(
        'The email address or password is incorrect.',
      ),
    )
  })

  it('RegisterView shows field errors from the API (M1-T02)', async () => {
    const { wrapper, session } = await mountView(RegisterView, { session: { user: null } })
    vi.spyOn(session, 'register').mockRejectedValue(
      apiError(400, {
        message: 'Failed to create record.',
        data: {
          email: { code: 'validation_not_unique', message: 'This value is already in use.' },
        },
      }),
    )
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('This value is already in use.'))
  })

  it('RegisterView registers and goes to the verification page', async () => {
    const { wrapper, router, session } = await mountView(RegisterView, { session: { user: null } })
    const register = vi.spyOn(session, 'register').mockResolvedValue()
    await fill('input[autocomplete=name]', 'New Coach')
    await fill('input[type=email]', 'new@example.com')
    await fill('input[type=password]', 'password1')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('verify-email'))
    expect(register).toHaveBeenCalledWith({
      name: 'New Coach',
      email: 'new@example.com',
      password: 'password1',
    })
  })

  it('VerifyEmailView confirms a token from the email link (M1-02)', async () => {
    let confirm
    const { wrapper } = await mountView(VerifyEmailView, {
      session: { user: null },
      path: '/x?token=abc',
      setup: (s) => (confirm = vi.spyOn(s, 'confirmVerification').mockResolvedValue()),
    })
    expect(confirm).toHaveBeenCalledWith('abc')
    expect(wrapper.find('[data-testid=verification-success]').exists()).toBe(true)
  })

  it('VerifyEmailView reports invalid or expired tokens', async () => {
    const { wrapper } = await mountView(VerifyEmailView, {
      session: { user: null },
      path: '/x?token=bad',
      setup: (s) =>
        vi
          .spyOn(s, 'confirmVerification')
          .mockRejectedValue(apiError(400, { message: 'Invalid or expired verification token.' })),
    })
    expect(wrapper.find('[role=alert]').text()).toContain('invalid or has expired')
  })

  it('VerifyEmailView lets unverified users resend the email', async () => {
    const { session } = await mountView(VerifyEmailView, {
      session: { user: makeUser({ verified: false }) },
    })
    const resend = vi.spyOn(session, 'requestVerification').mockResolvedValue()
    await click(buttonByText('Resend email'))
    expect(resend).toHaveBeenCalled()
  })

  it('ForgotPasswordView requests a reset link (M1-04)', async () => {
    const { wrapper, session } = await mountView(ForgotPasswordView, { session: { user: null } })
    const request = vi.spyOn(session, 'requestPasswordReset').mockResolvedValue()
    await fill('input[type=email]', 'coach@example.com')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid=reset-sent]').exists()).toBe(true))
    expect(request).toHaveBeenCalledWith('coach@example.com')
  })

  it('ResetPasswordView sets a new password with the token (M1-04)', async () => {
    const { wrapper, session } = await mountView(ResetPasswordView, {
      session: { user: null },
      path: '/x?token=tok',
    })
    const confirm = vi.spyOn(session, 'confirmPasswordReset').mockResolvedValue()
    await fill('input[type=password]', 'new-password')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid=reset-done]').exists()).toBe(true))
    expect(confirm).toHaveBeenCalledWith('tok', 'new-password')
  })

  it('ResetPasswordView rejects links without a token', async () => {
    const { wrapper } = await mountView(ResetPasswordView, { session: { user: null } })
    expect(wrapper.text()).toContain('invalid')
  })
})
