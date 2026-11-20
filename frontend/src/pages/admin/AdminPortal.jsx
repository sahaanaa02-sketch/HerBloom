
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  Apple,
  ShieldAlert,
  ClipboardCheck,
  Users,
  Settings,
  Bot,
  Bell,
  CreditCard,
  ChartNoAxesCombined,
  Headset,
  LogOut,
  Menu,
  X,
  RefreshCw,
  ArrowRight,
  UserRound,
} from 'lucide-react'

import logo from '../../assets/logo.png'
import {
  getAdminProfile,
} from '../../services/adminApi'

import './AdminPortal.css'

// Match these prefixes to the permission keys seeded in your backend.
// Super Admin has access to all modules; other roles are filtered by permissions.
const ArticleManager = lazy(() => import('../../components/admin/ArticleManager'))
const ExerciseManager = lazy(() => import('../../components/admin/ExerciseManager'))
const WellbeingManager = lazy(() => import('../../components/admin/WellbeingManager'))
const MealIdeasManager = lazy(() => import('../../components/admin/MealIdeasManager'))
const AIMonitor = lazy(() => import('../../components/admin/AIMonitor'))
const SettingsManager = lazy(() => import('../../components/admin/SettingsManager'))
const OverviewDashboard = lazy(() => import('../../components/admin/OverviewDashboard'))
const UsersManager = lazy(() => import('../../components/admin/UsersManager'))
const AnalyticsPanel = lazy(() => import('../../components/admin/AnalyticsPanel'))
const SupportPanel = lazy(() => import('../../components/admin/SupportPanel'))
const BillingMonitor = lazy(() => import('../../components/admin/BillingMonitor'))
const NotificationsManager = lazy(() => import('../../components/admin/NotificationsManager'))
const ClinicalReviewManager = lazy(() => import('../../components/admin/ClinicalReviewManager'))
const SafetyManager = lazy(() => import('../../components/admin/SafetyManager'))
const NutritionDataManager = lazy(() => import('../../components/admin/NutritionDataManager'))

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, permissions: ['overview.', 'dashboard.', 'analytics.'] },
  { id: 'content', label: 'Content', icon: BookOpen, permissions: ['content.'] },
  { id: 'nutrition', label: 'Nutrition Data', icon: Apple, permissions: ['nutrition.'] },
  { id: 'safety', label: 'Safety', icon: ShieldAlert, permissions: ['safety.'] },
  { id: 'review', label: 'Clinical Review', icon: ClipboardCheck, permissions: ['review.', 'clinical.', 'content.approve', 'nutrition.approve', 'safety.approve', 'content.edit', 'nutrition.edit', 'safety.edit'] },
  { id: 'users', label: 'Users', icon: Users, permissions: ['users.', 'data_requests.confirm'] },
  { id: 'settings', label: 'Settings', icon: Settings, permissions: ['settings.', 'admin.', 'roles.', 'audit.'] },
  { id: 'ai', label: 'AI Monitor', icon: Bot, permissions: ['ai.'] },
  { id: 'notifications', label: 'Notifications', icon: Bell, permissions: ['notifications.'] },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard, permissions: ['billing.', 'subscriptions.'] },
  { id: 'analytics', label: 'Analytics', icon: ChartNoAxesCombined, permissions: ['analytics.'] },
  { id: 'support', label: 'Support', icon: Headset, permissions: ['support.'] },
]

function roleNames(value) {
  if (!Array.isArray(value)) return []
  return value.map((role) =>
    String(typeof role === 'string' ? role : role?.name ?? '').toLowerCase()
  )
}

function permissionKeys(value) {
  if (!Array.isArray(value)) return []
  return value.map((permission) =>
    String(typeof permission === 'string' ? permission : permission?.key ?? '')
  ).filter(Boolean)
}

function canSee(item, permissions, isSuperAdmin) {
  if (isSuperAdmin) return true
  if (item.id === 'overview') return true
  return item.permissions.some((prefix) =>
    permissions.some((permission) =>
      permission === prefix || permission.startsWith(prefix)
    )
  )
}

const upcoming = {
  content: 'Manage bilingual articles, exercises, wellbeing activities and meal ideas.',
  nutrition: 'Manage foods, nutrient values, local food aliases and nutrition targets.',
  safety: 'Manage warning signs, reviewed safety messages and helpline information.',
  review: 'Review health content before it becomes available to mothers.',
  users: 'Manage accounts and privacy-related data requests.',
  settings: 'Manage staff access, application settings and audit logs.',
  ai: 'Monitor AI feedback, usage and model settings.',
  notifications: 'Manage announcements, daily tips and reminder templates.',
  subscriptions: 'Manage premium plans, subscribers and payments.',
  analytics: 'View anonymous platform engagement and content statistics.',
  support: 'Manage support tickets and frequently asked questions.',
}

export default function AdminPortal({ user, onLogout }) {
  const [page, setPage] = useState('overview')
  const [contentSection, setContentSection] = useState('articles')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [admin, setAdmin] = useState(null)
  const [overviewRefresh, setOverviewRefresh] = useState(0)
  const [reviewTab, setReviewTab] = useState('queue')
  const [error, setError] = useState('')

  const token = user?.access_token
  const profile = admin?.admin ?? admin
  const roles = roleNames(profile?.roles ?? user?.roles)
  const isSuperAdmin = roles.includes('super_admin')
  const permissions = permissionKeys(profile?.permissions ?? user?.permissions)
  const allowedNavigation = navigation.filter((item) =>
    canSee(item, permissions, isSuperAdmin)
  )

  useEffect(() => {
    if (!token) return
    let active = true
    getAdminProfile(token).then((data) => { if (active) setAdmin(data) })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [token, overviewRefresh])

  const currentPage =
    allowedNavigation.find((item) => item.id === page) ||
    allowedNavigation[0] || navigation[0]

  const CurrentIcon = currentPage.icon

  function navigate(id, destination = 'queue') {
    if (!allowedNavigation.some((item) => item.id === id)) {
      setError('You do not have permission to access this module.')
      return
    }
    setError('')
    if (id === 'review') setReviewTab(destination)
    setPage(id)

    if (window.innerWidth < 900) {
      setSidebarOpen(false)
    }
  }

  return (
    <div className="ha-app">
      <aside
        className={`ha-sidebar ${sidebarOpen ? 'ha-sidebar-open' : ''}`}
      >
        <div className="ha-brand">
          <img src={logo} alt="HerBloom" />
          <span>ADMIN PORTAL</span>
        </div>

        <div className="ha-nav-heading">WORKSPACE</div>

        <nav className="ha-navigation" aria-label="Admin navigation">
          {allowedNavigation.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.id}
                type="button"
                className={`ha-nav-item ${
                  page === item.id ? 'active' : ''
                }`}
                onClick={() => navigate(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {page === item.id && <ArrowRight size={15} />}
              </button>
            )
          })}
        </nav>

        <div className="ha-sidebar-bottom">
          <div className="ha-admin-profile">
            <div className="ha-avatar">
              <UserRound size={21} />
            </div>

            <div>
              <strong>{profile?.name || user?.name || 'Administrator'}</strong>
              <span>{isSuperAdmin ? 'Super Admin' : roles.join(', ') || 'Administrator'}</span>
            </div>
          </div>

          <button
            className="ha-logout"
            type="button"
            onClick={onLogout}
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>

      <div className="ha-main">
        <header className="ha-topbar">
          <div className="ha-topbar-left">
            <button
              type="button"
              className="ha-icon-button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X size={21} /> : <Menu size={21} />}
            </button>

            <span>HerBloom / {currentPage.label}</span>
          </div>

          <div className="ha-topbar-right">
            <span className="ha-live-indicator">
              <span className="ha-live-dot" />
              Admin Workspace
            </span>

            <div className="ha-top-avatar">
              <UserRound size={20} />
            </div>
          </div>
        </header>

        <main className="ha-content">
          <div className="ha-page-heading">
            <div>
              <span className="ha-eyebrow">HERBLOOM ADMINISTRATION</span>
              <h1>{currentPage.label}</h1>
              <p>
                {currentPage.id === 'overview'
                  ? 'Welcome to your HerBloom management workspace.'
                  : upcoming[page]}
              </p>
            </div>

            {currentPage.id === 'overview' && (
              <button
                type="button"
                className="ha-refresh"
                onClick={() => setOverviewRefresh((value) => value + 1)}
              >
                <RefreshCw size={17} />
                Refresh
              </button>
            )}
          </div>

          {error && (
            <div className="ha-error" role="alert">
              <p>{error}</p>
            </div>
          )}

          {currentPage.id === 'overview' ? (
            <Suspense fallback={<div className="ha-message">Loading dashboard…</div>}>
              <OverviewDashboard token={token} refreshKey={overviewRefresh}
                name={profile?.name || user?.name || 'Admin'}
                quickLinks={allowedNavigation.filter((item) => item.id !== 'overview').slice(0, 6)}
                navigate={navigate}
                onReview={allowedNavigation.some((item) => item.id === 'review') ? (tab) => navigate('review', tab) : undefined} />
            </Suspense>
          ) : currentPage.id === 'content' ? (
            <>
              <nav aria-label="Content sections" className="mb-4 flex flex-wrap gap-2">
                {[['articles', 'Articles'], ['exercises', 'Exercises'], ['wellbeing', 'Wellbeing Activities'], ['meals', 'Meal Ideas']].map(([id, label]) => (
                  <button type="button" key={id} aria-pressed={contentSection === id}
                    className={`rounded-full border border-[#F6D3DB] px-4 py-2 text-sm font-semibold ${contentSection === id ? 'bg-[#7B2346] text-white' : 'bg-white text-[#7B2346]'}`}
                    onClick={() => setContentSection(id)}>{label}</button>
                ))}
              </nav>
              <Suspense fallback={<div className="ha-message">Loading content...</div>}>
                {contentSection === 'articles' && <ArticleManager token={token} permissions={permissions} />}
                {contentSection === 'exercises' && <ExerciseManager token={token} permissions={permissions} />}
                {contentSection === 'wellbeing' && <WellbeingManager token={token} permissions={permissions} />}
                {contentSection === 'meals' && <MealIdeasManager token={token} permissions={permissions} />}
              </Suspense>
            </>
          ) : currentPage.id === 'analytics' ? (
            <Suspense fallback={<div className="ha-message">Loading analytics...</div>}>
              <AnalyticsPanel token={token} />
            </Suspense>
          ) : currentPage.id === 'support' ? (
            <Suspense fallback={<div className="ha-message">Loading support...</div>}>
              <SupportPanel token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'subscriptions' ? (
            <Suspense fallback={<div className="ha-message">Loading billing...</div>}>
              <BillingMonitor token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'notifications' ? (
            <Suspense fallback={<div className="ha-message">Loading notifications...</div>}>
              <NotificationsManager token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'ai' ? (
            <Suspense fallback={<div className="ha-message">Loading AI monitoring...</div>}>
              <AIMonitor token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'settings' ? (
            <Suspense fallback={<div className="ha-message">Loading settings...</div>}>
              <SettingsManager token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'users' ? (
            <Suspense fallback={<div className="ha-message">Loading users...</div>}>
              <UsersManager token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'review' ? (
            <Suspense fallback={<div className="ha-message">Loading clinical reviews...</div>}>
              <ClinicalReviewManager token={token} initialTab={reviewTab} />
            </Suspense>
          ) : currentPage.id === 'safety' ? (
            <Suspense fallback={<div className="ha-message">Loading safety management...</div>}>
              <SafetyManager token={token} permissions={permissions} />
            </Suspense>
          ) : currentPage.id === 'nutrition' ? (
            <Suspense fallback={<div className="ha-message">Loading nutrition data...</div>}>
              <NutritionDataManager token={token} permissions={permissions} />
            </Suspense>
          ) : (
            <section className="ha-placeholder">
              <div className="ha-placeholder-icon">
                <CurrentIcon size={30} />
              </div>

              <h2>{currentPage.label} Management</h2>
              <p>{upcoming[page]}</p>

              <span>
                This module will be implemented in its dedicated phase.
              </span>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
