import { useTranslation } from 'react-i18next'
import MotherSupport from './MotherSupport'
import { MotherNotices } from './MotherNotifications'
import { useMotherNotifications } from '../../hooks/useMotherNotifications'
import PublicLegal from '../PublicLegal'

import { useRef, useState } from 'react'

import {
  LayoutDashboard,
  HeartPulse,
  Brain,
  Apple,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  Settings,
  Bell,
  Menu,
  X,
  LogOut,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react'

import logo from '../../assets/logo.png'

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'recovery',
    label: 'my_recovery',
    icon: HeartPulse,
  },
  {
    id: 'wellbeing',
    label: 'emotional_wellbeing',
    icon: Brain,
  },
  {
    id: 'nutrition',
    label: 'nutrition_anaemia',
    icon: Apple,
  },
  {
    id: 'learn',
    label: 'learn_care',
    icon: BookOpen,
  },
  {
    id: 'ai',
    label: 'ask_herbloom_ai',
    icon: Bot,
  },
  {
    id: 'summary',
    label: 'weekly_summary',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'settings',
    label: 'profile_settings',
    icon: Settings,
  },
]

const PAGE_HEADERS = {
  dashboard: {
    title: 'your_recovery_journey',
    subtitle: 'supported_with_care_every_step_of_the_way',
  },
  recovery: {
    title: 'my_recovery',
    subtitle: 'track_heal_and_regain_your_strength_step_by_step',
  },
  wellbeing: {
    title: 'emotional_wellbeing',
    subtitle: 'a_gentle_space_for_your_emotional_recovery',
  },
  nutrition: {
    title: 'nutrition_and_anaemia',
    subtitle: 'nourish_yourself_through_recovery',
  },
  learn: {
    title: 'learn_and_care',
    subtitle: 'helpful_knowledge_for_your_recovery_journey',
  },
  ai: {
    title: 'ask_herbloom_ai',
    subtitle: 'explore_educational_recovery_information',
  },
  summary: {
    title: 'weekly_summary',
    subtitle: 'reflect_on_your_recovery_journey',
  },
  settings: {
    title: 'your_recovery_journey',
    subtitle: 'supported_with_care_every_step_of_the_way',
  },
}

export default function MotherLayout({
  user,
  children,
  activePage = 'settings',
  onNavigate,
  onLogout,
}) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const { t } = useTranslation('mother')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileTrigger = useRef(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const announcements = useMotherNotifications(user?.access_token, '/announcements/active', [])
  const tip = useMotherNotifications(user?.access_token, '/daily-tips/active', null)
  const bellItems = announcements.filter((item) => item.channel === 'bell')

  const displayName =
    user?.name ||
    user?.full_name ||
    user?.username ||
    'Mother'

  const initial = displayName.charAt(0).toUpperCase()

  const currentHeader =
    PAGE_HEADERS[activePage] ||
    PAGE_HEADERS.settings

  function navigate(page) {
    setSidebarOpen(false)
    setProfileMenuOpen(false)
    setHelpOpen(false)
    onNavigate?.(page)
  }

  function logout() {
    setProfileMenuOpen(false)
    setSidebarOpen(false)
    setHelpOpen(false)
    onLogout?.()
  }

  return (
    <div className="hb-mother-shell min-h-screen bg-[#FFF6F1] font-['Poppins'] text-[#593849]">

      {supportOpen && <MotherSupport token={user?.access_token} initialLanguage={user?.language} onClose={() => setSupportOpen(false)} />}

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (
        <button
          type="button"
          aria-label={t('close_sidebar')}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[88vw] flex-col bg-[#7B2346] text-white shadow-xl transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        {/* LOGO */}

        <div className="flex h-24 items-center justify-between border-b border-white/15 px-5">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="HerBloom"
              className="h-14 w-14 rounded-xl bg-white object-contain p-1"
            />

            <div>
              <p className="font-['Playfair_Display'] text-xl font-semibold">
                HerBloom
              </p>

              <p className="text-[10px] tracking-wide text-white/75">
                {auditText('common:your_recovery_companion')}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('close_navigation')}
          >
            <X size={20} />
          </button>
        </div>

        {/* NAVIGATION */}

        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activePage === id

            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={`flex w-full items-center min-h-11 gap-3 rounded-xl px-4 py-2.5 text-left text-[13px] leading-relaxed transition ${
                  active
                    ? 'bg-white font-semibold text-[#7B2346] shadow-sm ring-1 ring-inset ring-[#F6D3DB]'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={19} strokeWidth={1.9} />

                <span>{t(label)}</span>
              </button>
            )
          })}
        </nav>

        {/* LOGOUT */}

        <div className="border-t border-white/15 p-4">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/90 hover:bg-white/10"
          >
            <LogOut size={19} />
            {t('log_out')}
          </button>

          <p className="mt-4 px-4 text-[11px] text-white/55">
            © 2026 HerBloom
          </p>
        </div>
      </aside>

      {/* MAIN AREA */}

      <div className="min-h-screen lg:pl-[260px]">

        {/* TOP HEADER */}

        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-2 border-b border-[#F1DEE5] bg-white/95 px-3 py-3 sm:gap-3 sm:px-5 backdrop-blur-md md:px-8">

          {/* LEFT */}

          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button
              type="button"
              aria-label={t('open_sidebar')}
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-[#7B2346] lg:hidden"
            >
              <Menu size={23} />
            </button>

            <div className="min-w-0">
              <p className="truncate font-['Playfair_Display'] text-lg font-semibold text-[#7B2346] md:text-xl">
                {t(currentHeader.title)}
              </p>

              <p className="hidden text-xs text-[#9C7987] sm:block">
                {t(currentHeader.subtitle)}
              </p>
            </div>
          </div>

          {/* RIGHT */}

          <div className="flex shrink-0 items-center gap-2 md:gap-4">

            {/* HELP */}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(!helpOpen)
                  setProfileMenuOpen(false)
                }}
                className="flex items-center gap-2 rounded-full border border-[#F2DEE5] bg-[#FFF6F1] px-3 py-2 text-xs font-semibold text-[#7B2346] hover:bg-[#FBE6EB]"
              >
                <ShieldCheck size={16} />
                <span className="hidden sm:inline">
                  {uiText('get_help')}
                </span>
              </button>

              {helpOpen && (
                <div className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[70dvh] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[280px] overflow-y-auto rounded-2xl border border-[#F2DEE5] bg-white p-5 shadow-xl">
                  <h3 className="font-['Playfair_Display'] text-lg font-semibold text-[#7B2346]">
                    {t('support_numbers')}
                  </h3>

                  <p className="mt-2 text-xs leading-5 text-[#977685]">
                    {auditText('common:these_numbers_are_displayed_for_reference_only_herbloom_does_not_initiate_calls_or_messages')}
                  </p>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl bg-[#FFF6F1] p-3">
                      <p className="text-xs text-[#977685]">
                        {auditText('common:ambulance_service')}
                      </p>
                      <p className="text-xl font-bold text-[#7B2346]">
                        1990
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#FFF6F1] p-3">
                      <p className="text-xs text-[#977685]">
                        {auditText('common:national_mental_health_helpline')}
                      </p>
                      <p className="text-xl font-bold text-[#7B2346]">
                        1926
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#FFF6F1] p-3">
                      <p className="text-xs text-[#977685]">
                        CCCline
                      </p>
                      <p className="text-xl font-bold text-[#7B2346]">
                        1333
                      </p>
                    </div>
                  </div>

                  <button type="button" onClick={() => { setHelpOpen(false); setSupportOpen(true) }}
                    className="mt-3 w-full rounded-full border border-[#F2DEE5] py-2.5 text-xs font-semibold text-[#7B2346]">
                    {auditText('common:faqs_and_contact_us')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="mt-4 w-full rounded-full bg-[#7B2346] py-2.5 text-xs font-semibold text-white"
                  >
                    {uiText('close')}
                  </button>
                </div>
              )}
            </div>

            {/* LANGUAGE INDICATOR */}

            <span className="rounded-full border border-[#F2DEE5] px-3 py-2 text-xs font-semibold text-[#7B2346]">
              EN
            </span>

            <div className="relative">
              <button type="button" aria-label={t('notifications')} aria-expanded={bellOpen}
                onClick={() => setBellOpen((open) => !open)}
                className="relative rounded-full p-2 text-[#7B2346]">
                <Bell size={20} />
                {bellItems.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#7B2346] px-1 text-xs text-white">{bellItems.length}</span>}
              </button>
              {bellOpen && <div className="fixed inset-x-3 top-[4.5rem] z-30 max-h-[70dvh] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:w-64 overflow-y-auto rounded-xl border border-[#F2DEE5] bg-white p-4 shadow">
                {bellItems.length === 0 && <p>{auditText('common:no_notifications')}</p>}
                {bellItems.map((item) => <div key={item.id} className="mb-3">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="whitespace-pre-wrap">{item.body}</p>
                </div>)}
              </div>}
            </div>

            {/* PROFILE */}

            <div className="relative" onKeyDown={(event) => {
              if (event.key === 'Escape' && profileMenuOpen) {
                setProfileMenuOpen(false)
                profileTrigger.current?.focus()
              }
            }}>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(!profileMenuOpen)
                  setHelpOpen(false)
                }}
                className="flex items-center gap-2"
                ref={profileTrigger}
                aria-expanded={profileMenuOpen}
                aria-label={t('open_profile_menu')}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F6D3DB] font-semibold text-[#7B2346]">
                  {initial}
                </span>

                <ChevronDown
                  size={15}
                  className="text-[#7B2346]"
                />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-[#F2DEE5] bg-white p-2 shadow-lg">
                  <p className="truncate px-3 py-2 text-sm font-semibold text-[#7B2346]">
                    {displayName}
                  </p>

                  <button
                    type="button"
                    onClick={() => navigate('settings')}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#FFF6F1]"
                  >
                    {t('profile_settings')}
                  </button>

                  <button type="button" onClick={() => navigate('settings-plan')} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[#FFF6F1]">
                    {auditText('common:my_plan_subscription')}
                  </button>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); setSupportOpen(true) }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[#FFF6F1]">
                    {auditText('common:help_center')}
                  </button>
                  <button type="button" onClick={() => navigate('settings-language')} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[#FFF6F1]">
                    {auditText('common:language_preferences')}
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#7B2346] hover:bg-[#FFF6F1]"
                  >
                    {t('log_out')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}

        <main className="hb-mother-main mx-auto min-w-0 max-w-[1500px] px-3 py-5 sm:px-5 md:p-8">
          <MotherNotices announcements={announcements} tip={activePage === 'dashboard' ? tip : null} />
          {children}
          <PublicLegal />
        </main>
      </div>
    </div>
  )
}
