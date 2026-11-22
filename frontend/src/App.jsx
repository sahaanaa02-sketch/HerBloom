import { useTranslation } from 'react-i18next'
import { i18n, localLanguage, normalizeLanguage } from './locales/i18n'

import { useEffect, useState } from 'react'

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
import { getAdminSession, revokeAdminSession } from './services/adminAuthApi'
import AdminInviteSetup from './pages/admin/AdminInviteSetup'

// ============================================
// API SERVICES
// ============================================
import { getMotherIdentity, getMotherProfile, revokeMotherSession } from './services/onboardingApi'


const adminHost = import.meta.env.VITE_PORTAL_MODE === 'admin'

const motherSessionKey = 'herbloom.mother.token'

const isolatedLogin = import.meta.env.MODE === 'e2e'
const adminSessionKey = 'herbloom.e2e.admin.token'

function adminSession(token) {
  if (!isolatedLogin) return null
  try {
    if (token === undefined) return sessionStorage.getItem(adminSessionKey)
    if (token) sessionStorage.setItem(adminSessionKey, token)
    else sessionStorage.removeItem(adminSessionKey)
  } catch {
    // The current sign-in still works when storage is unavailable.
  }
  return null
}

function motherSession(token) {
  try {
    if (token === undefined) return window.sessionStorage.getItem(motherSessionKey)
    if (token) window.sessionStorage.setItem(motherSessionKey, token)
    else window.sessionStorage.removeItem(motherSessionKey)
  } catch {
    // Sign-in still works when browser storage is unavailable.
  }
  return null
}

export default function App() {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()

  // ============================================
  // APPLICATION STATES
  // ============================================

  const [user, setUser] = useState(null)
  const motherLanguage = user?.role === 'MOTHER' ? user.language : null
  useEffect(() => {
    i18n.changeLanguage(motherLanguage ? normalizeLanguage(motherLanguage) : localLanguage())
  }, [motherLanguage])

  const [savedToken] = useState(() =>
    adminHost || !['/', '/login'].includes(window.location.pathname) ? null : motherSession()
  )
  const [savedAdminToken] = useState(() => window.location.pathname === '/admin' ? adminSession() : null)
  const [loginMode, setLoginMode] = useState('login')
  const [profileSection, setProfileSection] = useState(null)
  const [onboardingProfile, setOnboardingProfile] = useState(null)

  const [view, setView] = useState(() =>
    adminHost || (!isolatedLogin && ['/admin','/admin/login'].includes(window.location.pathname))
      ? 'admin-login'
      : (window.location.pathname === '/login' || (isolatedLogin && window.location.pathname.startsWith('/admin'))) ? 'login' : 'landing'
  )

  const [motherPage, setMotherPage] = useState('dashboard')
  const [openMealScanner, setOpenMealScanner] = useState(false)

  const [loading, setLoading] = useState(Boolean(savedToken || savedAdminToken))

  const [error, setError] = useState('')

  const [selectedArticleId, setSelectedArticleId] = useState(null)

  useEffect(() => {
    if (!savedAdminToken) return
    const controller = new AbortController()
    getAdminSession(savedAdminToken, controller.signal).then((admin) => {
      if (!controller.signal.aborted) {
        setUser(admin)
        setView('admin')
      }
    }).catch((reason) => {
      if (!controller.signal.aborted) {
        adminSession(null)
        setError(reason.message)
        setView(isolatedLogin ? 'login' : 'admin-login')
        window.history.replaceState({}, '', isolatedLogin ? '/login' : '/admin/login')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [savedAdminToken])

  useEffect(() => {
    if (!savedToken) return
    const controller = new AbortController()
    Promise.all([
      getMotherIdentity(savedToken, controller.signal),
      getMotherProfile(savedToken, controller.signal),
    ]).then(([identity, data]) => {
      if (controller.signal.aborted) return
      const profile = data.profile
      if (identity.role !== 'MOTHER') {
        motherSession(null)
        setView('login')
        return
      }
      setUser({ ...identity, access_token: savedToken, name: profile.display_name || identity.full_name, language: profile.language })
      setOnboardingProfile(data.onboarding_done ? null : data)
      setView(data.onboarding_done ? 'mother' : 'onboarding')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      if ([401, 403].includes(reason.status)) motherSession(null)
      setError(reason.message)
      setView([401, 403].includes(reason.status) ? 'login' : 'profile-error')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [savedToken])

  useEffect(() => {
    if (!user?.access_token) return
    // The server verifies the token; its expiry is read here only for UI cleanup.
    let expiration
    try {
      const payload = user.access_token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
      expiration = JSON.parse(atob(payload)).exp * 1000
    } catch {
      return
    }
    if (!Number.isFinite(expiration)) return
    function expire() {
      if (user.role === 'MOTHER') motherSession(null)
      else adminSession(null)
      setLoginMode('login')
      setUser(null)
      setOnboardingProfile(null)
      setSelectedArticleId(null)
      setLoading(false)
      setView(user.role === 'ADMIN' && !isolatedLogin ? 'admin-login' : 'login')
      window.history.replaceState({}, '', user.role === 'ADMIN' && !isolatedLogin ? '/admin/login' : '/login')
    }
    const delay = Math.max(0, expiration - Date.now())
    const timer = window.setTimeout(expire, delay)
    return () => window.clearTimeout(timer)
  }, [user])


  // ============================================
  // LANDING NAVIGATION
  // ============================================

  const handleGoToLogin = () => {
    setLoginMode('login')
    setError('')
    setView('login')
  }

  const handleGetStarted = () => {
    setLoginMode('register')
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
      setError("common:invalid_login_response_please_try_again")
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
          ? "common:please_use_the_secure_admin_login"
          : "common:your_account_role_is_not_supported"
      )
      setView('unsupported')
      return
    }


    // ============================================
    // MOTHER LOGIN
    // ============================================

    setLoading(true)

    try {

      const profileData = await getMotherProfile(
        loggedInUser.access_token
      )

      setUser({ ...loggedInUser, language: profileData.profile.language })
      motherSession(loggedInUser.access_token)
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
        "common:could_not_load_your_profile_please_try_again"
      )

      setView('profile-error')

    } finally {

      setLoading(false)

    }
  }


  // ============================================
  // SECURE ADMIN LOGIN SUCCESS
  // ============================================

  const handleAdminLoginSuccess = (adminData) => {
    if (
      !adminData?.adminAuthenticated ||
      !adminData?.access_token ||
      !Array.isArray(adminData?.permissions)
    ) {
      setError("common:invalid_admin_authentication_response")
      return
    }

    motherSession(null)
    adminSession(adminData.access_token)
    setUser({ ...adminData, role: 'ADMIN' })
    setError('')
    setView('admin')
    window.history.replaceState({}, '', '/admin')
  }

  // ============================================
  // LOGOUT
  // ============================================

  const handleLogout = async () => {
    adminSession(null)
    const adminToken = user?.role === 'ADMIN' ? user.access_token : null
    const motherToken = user?.role === 'MOTHER' ? user.access_token : null
    motherSession(null)
    setLoginMode('login')
    setOpenMealScanner(false)
    setProfileSection(null)

    setUser(null)
    setOnboardingProfile(null)

    setView(adminHost ? 'admin-login' : adminToken ? 'login' : 'landing')

    window.history.replaceState({}, '', adminHost ? '/admin/login' : adminToken ? '/login' : '/')

    setMotherPage('dashboard')

    setSelectedArticleId(null)

    setError('')
    setLoading(Boolean(adminToken || motherToken))
    if (adminToken || motherToken) {
      try {
        if (adminToken) await revokeAdminSession(adminToken)
        else await revokeMotherSession(motherToken)
      } catch {
        if (motherToken) {
          setView('login')
          window.history.replaceState({}, '', '/login')
        }
        setError("common:signed_out_here_server_revocation_could_not_be_confirmed")
      } finally {
        setLoading(false)
      }
    }
  }


  // ============================================
  // ONBOARDING COMPLETED
  // ============================================

  const refreshMotherDisplayPreferences = (profile) => {
    setUser((current) => current?.role === 'MOTHER' ? {
      ...current,
      name: profile.display_name || profile.full_name || current.name,
      language: profile.language || 'en',
    } : current)
  }

  const handleOnboardingComplete = (answers) => {
    refreshMotherDisplayPreferences(answers)

    setOnboardingProfile(null)

    setMotherPage('dashboard')

    setView('mother')

  }


  // ============================================
  // MOTHER PORTAL NAVIGATION
  // ============================================

  const handleMotherNavigate = (page, { openScanner = false } = {}) => {
    setProfileSection(page === 'settings-language' ? 'language' : page === 'settings-plan' ? 'plan' : null)

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
      'settings-language': 'settings',
      'settings-plan': 'settings',

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

      setOpenMealScanner(resolvedPage === 'nutrition' && openScanner)
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
            {localizeCopy('common:preparing_your_herbloom_experience')}
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
        initialMode={loginMode}
        initialError={error.startsWith('common:') ? auditText(error) : error}
        onSuccess={handleLoginSuccess}
        onAdminVerified={import.meta.env.VITE_PORTAL_MODE !== 'mother' ? handleAdminLoginSuccess : undefined}
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
        initialError={error}
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
            {localizeCopy('common:unable_to_load_your_profile')}
          </h2>

          <p className="mb-6 text-sm text-[#765363]">
            {error}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full bg-[#7B2346] px-7 py-3 text-white"
          >
            {localizeCopy('common:return_to_home')}
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
          onProfileSaved={refreshMotherDisplayPreferences}
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

      return <MentalWellbeing {...commonProps} onProfileSaved={refreshMotherDisplayPreferences} />

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

      return <Nutrition {...commonProps} initialScannerOpen={openMealScanner} />

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

    return <ProfileSettings key={profileSection || 'settings'} {...commonProps} initialSection={profileSection} onProfileSaved={refreshMotherDisplayPreferences} />

  }


  // ============================================
  // UNSUPPORTED ROLE
  // ============================================

  return (

    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#FFF6F1] px-5">

      <p className="text-center text-[#7B2346]">
        {localizeCopy('common:your_account_role_is_not_supported')}
      </p>

      <button
        type="button"
        onClick={handleLogout}
        className="rounded-full bg-[#7B2346] px-8 py-3 text-white"
      >
        {localizeCopy('common:return_to_home')}
      </button>

    </div>

  )

}
