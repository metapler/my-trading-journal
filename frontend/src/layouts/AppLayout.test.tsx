import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppLayout } from './AppLayout'

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'dev@local.test', createdAt: '2026-01-01' },
    initializing: false,
    authError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
  }),
}))

vi.mock('../components/AddTokenModal', () => ({
  AddTokenModal: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Add Token" /> : null),
}))

function renderLayout(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppLayout (REDESIGN Phase 1 shell)', () => {
  // Desktop sidebar + tablet rail both render (CSS shows one per breakpoint).
  function primaryNavs() {
    return screen.getAllByRole('navigation', { name: 'Primary' })
  }

  it('keeps all legacy routes reachable from primary nav', () => {
    renderLayout('/')
    const navs = primaryNavs()
    expect(navs.length).toBeGreaterThanOrEqual(1)
    for (const label of [
      'Dashboard',
      'Positions',
      'Transactions',
      'Watchlist',
      'Trade Journal',
      'Performance',
      'DCA Calculator',
      'Settings',
    ]) {
      const found = navs.some((nav) => within(nav).queryByRole('link', { name: new RegExp(label, 'i') }))
      expect(found).toBe(true)
    }
  })

  it('marks the active route with aria-current="page"', () => {
    renderLayout('/positions')
    const navs = primaryNavs()
    const actives = navs.flatMap((nav) => within(nav).queryAllByRole('link', { name: /positions/i }))
    expect(actives.length).toBeGreaterThan(0)
    for (const active of actives) {
      expect(active).toHaveAttribute('aria-current', 'page')
    }
  })

  it('exposes primary CTA and secondary add-asset action in the topbar', () => {
    renderLayout('/')
    expect(screen.getByRole('button', { name: /add transaction/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add asset/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh portfolio data/i })).toBeInTheDocument()
  })

  it('provides skip link and labelled landmarks', () => {
    renderLayout('/')
    expect(screen.getByRole('link', { name: /skip to content/i })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('opens the mobile drawer and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderLayout('/')
    const menuBtn = screen.getByRole('button', { name: /open navigation/i })
    await user.click(menuBtn)
    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument()
  })
})
