import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { AnalyticsPage } from '../pages/AnalyticsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DcaPage } from '../pages/DcaPage'
import { JournalPage } from '../pages/JournalPage'
import { LoginPage } from '../pages/LoginPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { PositionsPage } from '../pages/PositionsPage'
import { TokenDetailPage } from '../pages/TokenDetailPage'
import { TransactionsPage } from '../pages/TransactionsPage'
import { WatchlistPage } from '../pages/WatchlistPage'
import { RequireAuth } from './RequireAuth'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth />
    ),
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'positions', element: <PositionsPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'watchlist', element: <WatchlistPage /> },
          { path: 'journal', element: <JournalPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
          { path: 'tools/dca', element: <DcaPage /> },
          { path: 'settings', element: <PlaceholderPage title="Settings" description="Settings placeholder. Coming soon." /> },
          { path: 'assets/:id', element: <TokenDetailPage /> },
        ],
      },
    ],
  },
])
