import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from './useToast'
import { AuthProvider, useAuth } from './useAuth'

function Probe() {
  const { user, initializing } = useAuth()
  if (initializing) return <div>loading</div>
  return <div>{user ? `user:${user.email}` : 'anonymous'}</div>
}

function renderAuth(route = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastContext.Provider value={{ notify: vi.fn() }}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/" element={<Probe />} />
              <Route path="/login" element={<div>login-route</div>} />
            </Routes>
          </MemoryRouter>
        </ToastContext.Provider>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useAuth', () => {
  it('restores session via /api/auth/me on boot', async () => {
    vi.spyOn(client, 'getMe').mockResolvedValue({ id: 'u1', email: 'a@example.com', createdAt: '2026-01-01T00:00:00.000Z' })
    renderAuth()
    expect(screen.getByText('loading')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('user:a@example.com')).toBeInTheDocument())
  })

  it('401 on boot means anonymous (no error surfaced)', async () => {
    vi.spyOn(client, 'getMe').mockRejectedValue(new client.ApiError(401, 'Authentication required.', 'UNAUTHORIZED'))
    renderAuth()
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument())
  })
})
