
import { useState } from 'react'

// ============================================
// LANDING AND AUTHENTICATION
// ============================================
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import AccountRecovery from './pages/AccountRecovery'

// ============================================
// MOTHER ONBOARDING
// ============================================
import Onboarding from './pages/onboarding/Onboarding'

// ============================================
// MOTHER PORTAL
// ============================================
import MotherDashboard from './pages/mother/MotherDashboard'
import ProfileSettings from './pages/mother/ProfileSettings'
import LearnCare from './pages/mother/LearnCare'
import MentalWellbeing from './pages/mother/MentalWellbeing'
import MyRecovery from './pages/mother/MyRecovery'
import Nutrition from './pages/mother/Nutrition'

// ============================================
// ASK HERBLOOM AI CHATBOT
// ============================================
import AskHerBloom from './pages/mother/AskHerBloom'

// ============================================
// WEEKLY SUMMARY
// ============================================
import WeeklySummary from './pages/mother/WeeklySummary'

// ============================================
// ADMIN PORTAL - NEW
// ============================================
import AdminPortal from './pages/admin/AdminPortal'
import AdminAuth from './pages/admin/AdminAuth'
import AdminInviteSetup from './pages/admin/AdminInviteSetup'

// ============================================
// API SERVICES
// ============================================
import { getMotherProfile } from './services/onboardingApi'


const adminHost = import.meta.env.VITE_PORTAL_MODE === 'admin'

export default function App() {

  // ============================================
  // APPLICATION STATES
  // ============================================

  const [user, setUser] = useState(null)
  const [onboardingProfile, setOnboardingProfile] = useState(null)

  const [view, setView] = useState(() =>
    adminHost || ['/admin','/admin/login'].includes(window.location.pathname)
      ? 'admin-login'
      : 'landing'
  )

  const [motherPage, setMotherPage] = useState('dashboard')

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')

  const [selectedArticleId, setSelectedArticleId] = useState(null)


  // ============================================
  // LANDING NAVIGATION
  // ============================================

  const handleGoToLogin = () => {
    setError('')
    setView('login')
  }

  const handleGetStarted = () => {
    setError('')
    setView('login')
  }

  const handleBackToLanding = () => {
    setError('')
    window.history.replaceState({}, '', '/')
    setView('landing')
  }


  // ============================================
  // LOGIN SUCCESS
  // ============================================

  const handleLoginSuccess = async (data) => {

    if (!data?.access_token || !data?.role) {
      setError('Invalid login response. Please try again.')
      return
    }

    const normalizedRole = String(data.role).toUpperCase()

    const loggedInUser = {
      ...data,
      role: normalizedRole,
      name:
        data.name ||
        data.full_name ||
        data.username ||
        '',
    }

    setError('')

    if (normalizedRole !== 'MOTHER') {
      setUser(null)
      setError(
        normalizedRole === 'ADMIN'
          ? 'Please use the secure Admin Login.'
          : 'Your account role is not supported.'
      )
      setView('unsupported')
      return
    }

    setUser(loggedInUser)

    // ============================================
    // MOTHER LOGIN
    // ============================================

    setLoading(true)

    try {

      const profileData = await getMotherProfile(
        loggedInUser.access_token
      )

      if (profileData.onboarding_done) {

        setMotherPage('dashboard')
        setView('mother')

      } else {

        setOnboardingProfile(profileData)
        setView('onboarding')

      }

    } catch (err) {

      console.error('Profile loading error:', err)

      setError(
        err.message ||
        'Could not load your profile. Please try again.'
      )

      setView('profile-error')

    } finally {

      setLoading(false)

    }
  }


  // ============================================
  // SECURE ADMIN LOGIN SUCCESS (AFTER 2FA)
  // ============================================

  const handleAdminLoginSuccess = (adminData) => {
    if (
      !adminData?.adminAuthenticated ||
      !adminData?.access_token ||
      !Array.isArray(adminData?.permissions)
    ) {
      setError('Invalid Admin authentication response.')
      return
    }

    setUser({ ...adminData, role: 'ADMIN' })
    setError('')
    setView('admin')
    window.history.replaceState({}, '', '/admin')
  }

  // ============================================
  // LOGOUT
  // ============================================

  const handleLogout = () => {

    setUser(null)
    setOnboardingProfile(null)

    setView(adminHost ? 'admin-login' : 'landing')

    window.history.replaceState({}, '', adminHost ? '/admin/login' : '/')

    setMotherPage('dashboard')

    setSelectedArticleId(null)

    setError('')

    setLoading(false)

  }


  // ============================================
  // ONBOARDING COMPLETED
  // ============================================

  const handleOnboardingComplete = () => {

    setOnboardingProfile(null)

    setMotherPage('dashboard')

    setView('mother')

  }


  // ============================================
  // MOTHER PORTAL NAVIGATION
  // ============================================

  const handleMotherNavigate = (page) => {

    const pageAliases = {

      home: 'dashboard',
      dashboard: 'dashboard',

      recovery: 'recovery',
      'my-recovery': 'recovery',

      wellbeing: 'wellbeing',
      'mental-wellbeing': 'wellbeing',
      'emotional-wellbeing': 'wellbeing',

      nutrition: 'nutrition',
      'nutrition-anaemia': 'nutrition',

      learn: 'learn',
      articles: 'learn',
      'learn-care': 'learn',

      chat: 'chat',
      ai: 'chat',
      'ask-ai': 'chat',
      'ask-herbloom': 'chat',
      'ask-herbloom-ai': 'chat',

      summary: 'weekly',
      weekly: 'weekly',
      'weekly-summary': 'weekly',

      profile: 'settings',
      settings: 'settings',
      'profile-settings': 'settings',

    }

    const resolvedPage = pageAliases[page] || page

    const availablePages = [
      'dashboard',
      'settings',
      'learn',
      'wellbeing',
      'recovery',
      'nutrition',
      'chat',
      'weekly',
    ]

    if (availablePages.includes(resolvedPage)) {

      // Opening AI Chat directly from sidebar should
      // start without an old article selection.

      if (
        resolvedPage === 'chat' &&
        motherPage !== 'chat'
      ) {
        setSelectedArticleId(null)
      }

      setMotherPage(resolvedPage)

      return
    }

    console.log('Mother Portal page pending:', page)
  }


  // ============================================
  // LEARN AND CARE -> ASK HERBLOOM
  // ============================================

  const handleAskArticle = (articleId) => {

    setSelectedArticleId(articleId)

    setMotherPage('chat')

  }


  // ============================================
  // ASK HERBLOOM -> LEARN AND CARE
  // ============================================

  const handleOpenArticle = (articleId) => {

    setSelectedArticleId(articleId)

    setMotherPage('learn')

  }


  // ============================================
  // LOADING SCREEN
  // ============================================

  const accountPath = window.location.pathname.slice(1)
  if (accountPath === 'admin/setup') return <AdminInviteSetup />
  if (['forgot-password', 'reset-password', 'verify-email'].includes(accountPath)) {
    return <AccountRecovery mode={accountPath} />
  }

  if (loading) {

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF6F1] px-5">

        <div className="text-center">

          <div className="mx-auto mb-5 h-11 w-11 animate-spin rounded-full border-4 border-[#F6D3DB] border-t-[#7B2346]" />

          <p className="font-medium text-[#7B2346]">
            Preparing your HerBloom experience...
          </p>

        </div>

      </div>
    )
  }


  // ============================================
  // LANDING PAGE
  // ============================================

  if (view === 'landing' && !user) {

    return (
      <LandingPage
        onLogin={handleGoToLogin}
        onGetStarted={handleGetStarted}
      />
    )

  }


  // ============================================
  // LOGIN PAGE
  // ============================================

  if (view === 'login' && !user) {

    return (
      <Login
        onSuccess={handleLoginSuccess}
        onGoogle={() =>
          alert('Google Login will be available later.')
        }
        onBack={handleBackToLanding}
      />
    )

  }


  // ============================================
  // SECURE ADMIN LOGIN AND TWO-FACTOR AUTH
  // ============================================

  if (view === 'admin-login' && !user) {
    return (
      <AdminAuth
        onSuccess={handleAdminLoginSuccess}
        onBack={adminHost ? undefined : handleBackToLanding}
      />
    )
  }

  // ============================================
  // PROFILE ERROR
  // ============================================

  if (view === 'profile-error') {

    return (

      <div className="flex min-h-screen items-center justify-center bg-[#FFF6F1] px-5">

        <div className="w-full max-w-md rounded-3xl border border-[#F6D3DB] bg-white p-8 text-center shadow-lg">

          <h2 className="mb-3 text-2xl font-semibold text-[#7B2346]">
            Unable to load your profile
          </h2>

          <p className="mb-6 text-sm text-[#765363]">
            {error}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full bg-[#7B2346] px-7 py-3 text-white"
          >
            Return to Home
          </button>

        </div>

      </div>

    )

  }


  // ============================================
  // ADMIN PORTAL - PHASE A0
  // ============================================

  if (
    view === 'admin' &&
    user?.role === 'ADMIN' &&
    user?.adminAuthenticated === true &&
    user?.access_token
  ) {

    return (

      <AdminPortal
        user={user}
        onLogout={handleLogout}
      />

    )

  }


  // ============================================
  // MOTHER ONBOARDING
  // ============================================

  if (view === 'onboarding' && user?.role === 'MOTHER') {

    return (

      <Onboarding
        user={user}
        initialProfile={onboardingProfile}
        onLogout={handleLogout}
        onComplete={handleOnboardingComplete}
      />

    )

  }


  // ============================================
  // MOTHER PORTAL
  // ============================================

  if (view === 'mother' && user?.role === 'MOTHER') {

    const commonProps = {
      user,
      onLogout: handleLogout,
      onNavigate: handleMotherNavigate,
    }

    // ============================================
    // MOTHER DASHBOARD
    // ============================================

    if (motherPage === 'dashboard') {

      return <MotherDashboard {...commonProps} />

    }


    // ============================================
    // LEARN AND CARE
    // ============================================

    if (motherPage === 'learn') {

      return (

        <LearnCare
          {...commonProps}
          selectedArticleId={selectedArticleId}
          onAskArticle={handleAskArticle}
        />

      )

    }


    // ============================================
    // EMOTIONAL WELLBEING
    // ============================================

    if (motherPage === 'wellbeing') {

      return <MentalWellbeing {...commonProps} />

    }


    // ============================================
    // MY RECOVERY
    // ============================================

    if (motherPage === 'recovery') {

      return <MyRecovery {...commonProps} />

    }


    // ============================================
    // NUTRITION AND ANAEMIA
    // ============================================

    if (motherPage === 'nutrition') {

      return <Nutrition {...commonProps} />

    }


    // ============================================
    // ASK HERBLOOM AI CHATBOT
    // ============================================

    if (motherPage === 'chat') {

      return (

        <AskHerBloom
          {...commonProps}
          selectedArticleId={selectedArticleId}
          onOpenArticle={handleOpenArticle}
        />

      )

    }


    // ============================================
    // WEEKLY SUMMARY
    // ============================================

    if (motherPage === 'weekly') {

      return <WeeklySummary {...commonProps} />

    }


    // ============================================
    // PROFILE AND SETTINGS
    // ============================================

    return <ProfileSettings {...commonProps} />

  }


  // ============================================
  // UNSUPPORTED ROLE
  // ============================================

  return (

    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#FFF6F1] px-5">

      <p className="text-center text-[#7B2346]">
        Your account role is not supported.
      </p>

      <button
        type="button"
        onClick={handleLogout}
        className="rounded-full bg-[#7B2346] px-8 py-3 text-white"
      >
        Return to Home
      </button>

    </div>

  )

}
