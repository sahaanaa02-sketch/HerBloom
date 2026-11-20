import MotherSupport from './MotherSupport'
import { MotherNotices } from './MotherNotifications'
import { useMotherNotifications } from '../../hooks/useMotherNotifications'
import PublicLegal from '../PublicLegal'

import { useState } from 'react'

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
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'recovery',
    label: 'My Recovery',
    icon: HeartPulse,
  },
  {
    id: 'wellbeing',
    label: 'Emotional Wellbeing',
    icon: Brain,
  },
  {
    id: 'nutrition',
    label: 'Nutrition & Anaemia',
    icon: Apple,
  },
  {
    id: 'learn',
    label: 'Learn & Care',
    icon: BookOpen,
  },
  {
    id: 'ai',
    label: 'Ask HerBloom AI',
    icon: Bot,
  },
  {
    id: 'summary',
    label: 'Weekly Summary',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'settings',
    label: 'Profile & Settings',
    icon: Settings,
  },
]

const PAGE_HEADERS = {
  dashboard: {
    title: 'Your Recovery Journey',
    subtitle: 'Supported with care, every step of the way',
  },
  recovery: {
    title: 'My Recovery',
    subtitle: 'Track, heal and regain your strength step by step',
  },
  wellbeing: {
    title: 'Emotional Wellbeing',
    subtitle: 'A gentle space for your emotional recovery',
  },
  nutrition: {
    title: 'Nutrition and Anaemia',
    subtitle: 'Nourish yourself through recovery',
  },
  learn: {
    title: 'Learn and Care',
    subtitle: 'Helpful knowledge for your recovery journey',
  },
  ai: {
    title: 'Ask HerBloom AI',
    subtitle: 'Explore educational recovery information',
  },
  summary: {
    title: 'Weekly Summary',
    subtitle: 'Reflect on your recovery journey',
  },
  settings: {
    title: 'Your Recovery Journey',
    subtitle: 'Supported with care, every step of the way',
  },
}

export default function MotherLayout({
  user,
  children,
  activePage = 'settings',
  onNavigate,
  onLogout,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
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
    <div className="min-h-screen bg-[#FFF6F1] font-['Poppins'] text-[#593849]">

      {supportOpen && <MotherSupport token={user?.access_token} initialLanguage={user?.language} onClose={() => setSupportOpen(false)} />}

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#7B2346] text-white shadow-xl transition-transform duration-300 lg:translate-x-0 ${
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
                YOUR RECOVERY COMPANION
              </p>
            </div>
          </div>

          <button
            type="button"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        {/* NAVIGATION */}

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-7">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activePage === id

            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[13px] transition ${
                  active
                    ? 'bg-white font-semibold text-[#7B2346] shadow-sm'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={19} strokeWidth={1.9} />

                <span>{label}</span>
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
            Log out
          </button>

          <p className="mt-4 px-4 text-[11px] text-white/55">
            © 2026 HerBloom
          </p>
        </div>
      </aside>

      {/* MAIN AREA */}

      <div className="min-h-screen lg:pl-[260px]">

        {/* TOP HEADER */}

        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-3 border-b border-[#F1DEE5] bg-white/95 px-5 py-3 backdrop-blur-md md:px-8">

          {/* LEFT */}

          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-[#7B2346] lg:hidden"
            >
              <Menu size={23} />
            </button>

            <div className="min-w-0">
              <p className="truncate font-['Playfair_Display'] text-lg font-semibold text-[#7B2346] md:text-xl">
                {currentHeader.title}
              </p>

              <p className="hidden text-xs text-[#9C7987] sm:block">
                {currentHeader.subtitle}
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
                  Get Help
                </span>
              </button>

              {helpOpen && (
                <div className="absolute right-0 top-12 z-50 w-[280px] rounded-2xl border border-[#F2DEE5] bg-white p-5 shadow-xl">
                  <h3 className="font-['Playfair_Display'] text-lg font-semibold text-[#7B2346]">
                    Support Numbers
                  </h3>

                  <p className="mt-2 text-xs leading-5 text-[#977685]">
                    These numbers are displayed for reference only.
                    HerBloom does not initiate calls or messages.
                  </p>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl bg-[#FFF6F1] p-3">
                      <p className="text-xs text-[#977685]">
                        Ambulance Service
                      </p>
                      <p className="text-xl font-bold text-[#7B2346]">
                        1990
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#FFF6F1] p-3">
                      <p className="text-xs text-[#977685]">
                        National Mental Health Helpline
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
                    FAQs and Contact Us
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="mt-4 w-full rounded-full bg-[#7B2346] py-2.5 text-xs font-semibold text-white"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* LANGUAGE INDICATOR */}

            <span className="rounded-full border border-[#F2DEE5] px-3 py-2 text-xs font-semibold text-[#7B2346]">
              EN
            </span>

            <div className="relative">
              <button type="button" aria-label="Notifications" aria-expanded={bellOpen}
                onClick={() => setBellOpen((open) => !open)}
                className="relative rounded-full p-2 text-[#7B2346]">
                <Bell size={20} />
                {bellItems.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#7B2346] px-1 text-xs text-white">{bellItems.length}</span>}
              </button>
              {bellOpen && <div className="absolute right-0 z-30 w-64 rounded-xl border border-[#F2DEE5] bg-white p-4 shadow">
                {bellItems.length === 0 && <p>No notifications</p>}
                {bellItems.map((item) => <div key={item.id} className="mb-3">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="whitespace-pre-wrap">{item.body}</p>
                </div>)}
              </div>}
            </div>

            {/* PROFILE */}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(!profileMenuOpen)
                  setHelpOpen(false)
                }}
                className="flex items-center gap-2"
                aria-label="Open profile menu"
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
                    Profile & Settings
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#7B2346] hover:bg-[#FFF6F1]"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}

        <main className="mx-auto max-w-[1500px] p-5 md:p-8">
          <MotherNotices announcements={announcements} tip={activePage === 'dashboard' ? tip : null} />
          {children}
          <PublicLegal />
        </main>
      </div>
    </div>
  )
}
