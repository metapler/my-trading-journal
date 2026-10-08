import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { AuthProvider } from '../hooks/useAuth'
import { ToastContext } from '../hooks/useToast'
import { LoginPage } from './LoginPage'

function renderPage(route = '/login') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastContext.Provider value={{ notify: vi.fn() }}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<div>home-route</div>} />
            </Routes>
          </MemoryRouter>
        </ToastContext.Provider>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  // Boot session check: anonymous.
  vi.spyOn(client, 'getMe').mockRejectedValue(new client.ApiError(401, 'Authentication required.', 'UNAUTHORIZED'))
})

describe('LoginPage', () => {
  it('signs in and redirects to origin', async () => {
    const user = userEvent.setup()
    const loginSpy = vi
      .spyOn(client, 'login')
      .mockResolvedValue({ user: { id: 'u1', email: 'a@example.com', createdAt: '' }, csrfToken: 'csrf' })
    renderPage()
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!')
    const form = screen.getByLabelText('Email').closest('form') as HTMLElement
    await user.click(within(form).getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(loginSpy).toHaveBeenCalledWith({ email: 'a@example.com', password: 'TestPassword123!' }))
    expect(await screen.findByText('home-route')).toBeInTheDocument()
  })

  it('registers with confirm match and shows policy errors', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /^register$/i }))
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'weak')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))
    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument()
  })

  it('surfaces INVALID_CREDENTIALS server errors', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'login').mockRejectedValue(
      new client.ApiError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS'),
    )
    renderPage()
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'WrongPassword999!')
    const form = screen.getByLabelText('Email').closest('form') as HTMLElement
    await user.click(within(form).getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/INVALID_CREDENTIALS/)
  })
})
