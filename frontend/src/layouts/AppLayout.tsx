import {
  ArrowLeftRight,
  BookOpen,
  Calculator,
  ChartNoAxesColumn,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AddTokenModal } from '../components/AddTokenModal'
import { Button } from '../components/ui/Button'
import { ToastProvider } from '../components/Toast'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/cn'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badge?: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

// Routes unchanged (REDESIGN §4: keep legacy routes/deep links; display names tidy).
const navSections: NavSection[] = [
  { label: 'Dashboard', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Portfolio',
    items: [
      { to: '/positions', label: 'Positions', icon: Wallet },
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { to: '/watchlist', label: 'Watchlist', icon: Eye },
    ],
  },
  { label: 'Journal', items: [{ to: '/journal', label: 'Trade Journal', icon: BookOpen }] },
  { label: 'Analytics', items: [{ to: '/analytics', label: 'Performance', icon: ChartNoAxesColumn }] },
  { label: 'Tools', items: [{ to: '/tools/dca', label: 'DCA Calculator', icon: Calculator }] },
  { label: 'Settings', items: [{ to: '/settings', label: 'Settings', icon: Settings, badge: 'Coming soon' }] },
]

const pageTitles: Record<string, { title: string; hint: string }> = {
  '/': { title: 'Dashboard', hint: 'Portfolio value, deployed capital, and open PnL' },
  '/positions': { title: 'Positions', hint: 'Every open and closed position with live PnL' },
  '/transactions': { title: 'Transactions', hint: 'Ledger history per asset' },
  '/watchlist': { title: 'Watchlist', hint: 'Tracked assets without open positions' },
  '/journal': { title: 'Trade Journal', hint: 'Thesis, setups, and post-trade reviews' },
  '/analytics': { title: 'Performance', hint: 'Closed-trade analytics from validated data' },
  '/tools/dca': { title: 'DCA Calculator', hint: 'Project average buy before committing capital' },
  '/settings': { title: 'Settings', hint: 'Workspace preferences' },
}

function resolveTitle(pathname: string): { title: string; hint: string } {
  if (pageTitles[pathname]) return pageTitles[pathname]
  if (pathname.startsWith('/assets/')) return { title: 'Asset Detail', hint: 'Position, ledger, and journal' }
  return { title: 'Trading Journal', hint: 'Crypto position tracker' }
}

function NavContent({ onNavigate, rail = false }: { onNavigate?: () => void; rail?: boolean }) {
  if (rail) {
    const flat = navSections.flatMap((s) => s.items)
    return (
      <nav className="flex flex-col items-center gap-1" aria-label="Primary">
        {flat.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              title={item.label}
              aria-label={item.label}
              className="nav-rail-link"
            >
              <Icon className="h-5 w-5" aria-hidden />
            </NavLink>
          )
        })}
      </nav>
    )
  }
  return (
    <nav className="space-y-5" aria-label="Primary">
      {navSections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 px-3 text-xs font-semibold tracking-[0.08em] text-[var(--text-muted)] uppercase">
            {section.label}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className="nav-link"
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs whitespace-nowrap text-[var(--text-muted)]">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { title, hint } = resolveTitle(location.pathname)

  // Drawer a11y: Escape closes, Tab trapped, focus returns to trigger.
  useEffect(() => {
    if (!mobileOpen) return
    const trigger = menuBtnRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const root = drawerRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus first nav link for keyboard users.
    const first = drawerRef.current?.querySelector<HTMLAnchorElement>('a')
    first?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      trigger?.focus()
    }
  }, [mobileOpen])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['portfolio'] }),
        qc.invalidateQueries({ queryKey: ['positions'] }),
        qc.invalidateQueries({ queryKey: ['prices'] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <ToastProvider>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="flex min-h-svh bg-[var(--bg)] text-[var(--text)]">
        {/* Desktop sidebar 224px (§4: 216–232px, subdued vs content) */}
        <aside className="hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] p-4 lg:block">
          <div className="mb-6 px-2">
            <p className="text-lg font-semibold tracking-tight text-[var(--text)]">Trading Journal</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Crypto position tracker</p>
          </div>
          <NavContent />
        </aside>

        {/* Tablet rail 68px (§4: 64–72px icon rail with labels) */}
        <aside
          className="hidden w-[68px] shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--surface)] py-4 md:flex lg:hidden"
          aria-label="Primary navigation rail"
        >
          <p className="mb-4 text-sm font-semibold text-[var(--gold)]" aria-hidden>
            TJ
          </p>
          <NavContent rail />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar ~64px: page title left; status + refresh + CTAs right */}
          <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
            <div className="flex min-h-16 flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
              <button
                ref={menuBtnRef}
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] md:hidden"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
              >
                {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold tracking-tight text-[var(--text)] sm:text-xl" aria-hidden="true">
                  {title}
                </p>
                <p className="hidden truncate text-xs text-[var(--text-muted)] sm:block">{hint}</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="hidden rounded-full border border-[var(--border)] px-2.5 py-1 text-xs whitespace-nowrap text-[var(--text-muted)] xl:inline">
                  Polling · 20s
                </span>
                {user ? (
                  <span
                    className="hidden max-w-40 truncate rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] sm:inline"
                    title={user.email}
                  >
                    {user.email}
                  </span>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  aria-label="Refresh portfolio data"
                  className="min-h-11 px-3 py-2 text-sm"
                >
                  <RefreshCw className={cn('h-[18px] w-[18px]', refreshing && 'animate-spin')} aria-hidden />
                  <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setAddTokenOpen(true)}
                  className="min-h-11 px-3 py-2 text-sm"
                >
                  <Plus className="h-[18px] w-[18px]" aria-hidden />
                  <span className="hidden sm:inline">Add asset</span>
                  <span className="sr-only sm:hidden">Add asset</span>
                </Button>
                <Button
                  variant="primary"
                  onClick={() => navigate('/transactions')}
                  className="min-h-11 px-4 py-2 text-sm"
                >
                  <Plus className="h-[18px] w-[18px]" aria-hidden />
                  Add transaction
                </Button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                  <LogOut className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
            {/* Mobile drawer */}
            {mobileOpen ? (
              <div
                id="mobile-nav"
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-4 md:hidden"
                onClick={(e) => {
                  // Row navigation closes the drawer; backdrop clicks stay open.
                  if ((e.target as HTMLElement).closest('a')) setMobileOpen(false)
                }}
              >
                <NavContent onNavigate={() => setMobileOpen(false)} />
              </div>
            ) : null}
          </header>

          {/* Content: max 1680px, padding 24px, gap 20px. Document scrolls normally. */}
          <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1680px] min-w-0 flex-1 space-y-5 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Secondary global action: add asset (primary CTA navigates to transactions). */}
      <AddTokenModal open={addTokenOpen} onClose={() => setAddTokenOpen(false)} />
    </ToastProvider>
  )
}
