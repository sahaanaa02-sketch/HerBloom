import { useCallback, useEffect, useState } from'react'
import {
  Heart,
  RefreshCw,
  X,
  Bell,
  AlertCircle,
} from 'lucide-react'

import MotherLayout from '../../components/mother/MotherLayout'

import StageCard from '../../components/dashboard/StageCard'
import DashboardAlerts from '../../components/dashboard/DashboardAlerts'
import TodayOverview from '../../components/dashboard/TodayOverview'
import DashboardTodo from '../../components/dashboard/DashboardTodo'
import UpcomingReminders from '../../components/dashboard/UpcomingReminders'
import DashboardQuickActions from '../../components/dashboard/DashboardQuickActions'
import WeeklySnapshot from '../../components/dashboard/WeeklySnapshot'

import {
  getDashboardToday,
  getDashboardStage,
  getDashboardTodos,
  getDashboardReminders,
  addHydration,
  createDashboardTodo,
  updateDashboardTodo,
  deleteDashboardTodo,
  createDashboardReminder,
  deleteDashboardReminder,
} from '../../services/dashboardApi'

import {
  getWeeklyReport,
  getCurrentMonday,
} from '../../services/weeklyReportApi'

import useReminders from '../../hooks/useReminders'


// ---------------------------------------
// GREETING
// ---------------------------------------

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  )

  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'

  return 'Good evening'
}


// ---------------------------------------
// MAIN DASHBOARD
// ---------------------------------------

export default function MotherDashboard({
  user,
  onLogout,
  onNavigate,
}) {
  const token = user?.access_token

  const [stage, setStage] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [weekly, setWeekly] = useState(null)

  const [tasks, setTasks] = useState([])
  const [reminders, setReminders] = useState([])

  const [loading, setLoading] = useState(true)
  const [savingWater, setSavingWater] = useState(false)

  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Existing browser reminder functionality.
  const {
    permission,
    requestPermission,
  } = useReminders(reminders)

  const notify = (message) => {
    setToast(message)
  }

  // ---------------------------------------
  // LOAD DASHBOARD DATA
  // ---------------------------------------

  const loadDashboard = useCallback(async () => {
    if (!token) {
      setError('Please log in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const results = await Promise.allSettled([
      getDashboardStage(token),
      getDashboardToday(token),
      getWeeklyReport(token, getCurrentMonday()),
      getDashboardTodos(token),
      getDashboardReminders(token),
    ])

    const [
      stageResult,
      todayResult,
      weeklyResult,
      tasksResult,
      remindersResult,
    ] = results

    setStage(
      stageResult.status === 'fulfilled'
        ? stageResult.value
        : null
    )

    setDashboard(
      todayResult.status === 'fulfilled'
        ? todayResult.value
        : null
    )

    setWeekly(
      weeklyResult.status === 'fulfilled'
        ? weeklyResult.value
        : null
    )

    setTasks(
      tasksResult.status === 'fulfilled'
        ? tasksResult.value
        : []
    )

    setReminders(
      remindersResult.status === 'fulfilled'
        ? remindersResult.value
        : []
    )

    if (
      results.some(
        (result) => result.status === 'rejected'
      )
    ) {
      const failed = results.find(
        (result) => result.status === 'rejected'
      )

      setError(
        failed?.reason?.message ||
        'Some dashboard information could not beloaded.'
      )
    }

    setLoading(false)
  }, [token])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])


  // ---------------------------------------
  // REFRESH TODAY AND WEEKLY DATA
  // ---------------------------------------

  const refreshStatistics = async () => {
    if (!token) return

    const results = await Promise.allSettled([
      getDashboardToday(token),
      getWeeklyReport(token, getCurrentMonday()),
    ])

    if (results[0].status === 'fulfilled') {
      setDashboard(results[0].value)
    }

    if (results[1].status === 'fulfilled') {
      setWeekly(results[1].value)
    }

    if (results.some((item) => item.status === 'rejected')) {
      setError('Unable to refresh dashboard statistics.')
    }
  }


  // ---------------------------------------
  // ADD TASK
  // ---------------------------------------

  const addTask = async (title) => {
    try {
      const saved = await createDashboardTodo(
        token,
        title.trim()
      )

      setTasks((previous) => [
        ...previous,
        saved,
      ])

      notify('Task saved successfully.')
      await refreshStatistics()

      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }


  // ---------------------------------------
  // TOGGLE TASK
  // ---------------------------------------

  const toggleTask = async (id) => {
    const task = tasks.find(
      (item) => item.id === id
    )

    if (!task) return

    try {
      const updated = await updateDashboardTodo(
        token,
        id,
        { done: !task.done }
      )

      setTasks((previous) =>
        previous.map((item) =>
          item.id === id ? updated : item
        )
      )

      await refreshStatistics()
    } catch (err) {
      setError(err.message)
    }
  }


  // ---------------------------------------
  // DELETE TASK
  // ---------------------------------------

  const deleteTask = async (id) => {
    try {
      await deleteDashboardTodo(token, id)

      setTasks((previous) =>
        previous.filter((item) => item.id !== id)
      )

      notify('Task removed.')
      await refreshStatistics()
    } catch (err) {
      setError(err.message)
    }
  }


  // ---------------------------------------
  // ADD REMINDER
  // ---------------------------------------

  const addReminder = async (reminder) => {
    try {
      const saved = await createDashboardReminder(
        token,
        reminder
      )

      setReminders((previous) => [
        ...previous,
        saved,
      ])

      notify('Reminder saved successfully.')

      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }


  // ---------------------------------------
  // DELETE REMINDER
  // ---------------------------------------

  const deleteReminder = async (id) => {
    try {
      await deleteDashboardReminder(token, id)

      setReminders((previous) =>
        previous.filter((item) => item.id !== id)
      )

      notify('Reminder removed.')
    } catch (err) {
      setError(err.message)
    }
  }


  // ---------------------------------------
  // NAVIGATION
  // ---------------------------------------

  const navigate = (page) => {
    if (page === 'dashboard') return

    const aliases = {
      ask: 'chat',
      ai: 'chat',
      chat: 'chat',
      summary: 'weekly',
      weekly: 'weekly',
    }

    const destination = aliases[page] || page

    const availablePages = [
      'recovery',
      'wellbeing',
      'nutrition',
      'learn',
      'settings',
      'chat',
      'weekly',
    ]

    if (availablePages.includes(destination)) {
      onNavigate?.(destination)
      return
    }

    notify('This feature is coming soon.')
  }


  // ---------------------------------------
  // QUICK LOG
  // ---------------------------------------

  const quickLog = async (type) => {
    if (type === 'water') {
      if (savingWater) return

      setSavingWater(true)

      try {
        const saved = await addHydration(token, 1)

        setDashboard((previous) => ({
          ...previous,
          water_glasses: saved.glasses,
        }))

        notify('One glass of water saved.')
        await refreshStatistics()
      } catch (err) {
        setError(err.message)
      } finally {
        setSavingWater(false)
      }

      return
    }

    if (type === 'walk') {
      navigate('recovery')
    }
  }


  // ---------------------------------------
  // QUICK ACTIONS
  // ---------------------------------------

  const quickAction = (type) => {
    switch (type) {
      case 'water':
        quickLog('water')
        break

      case 'breathing':
        navigate('wellbeing')
        break

      case 'scan':
        notify(
          'Meal scanning will be available with Nutrition.'
        )
        break

      case 'ask':
        navigate('ask')
        break

      default:
        notify('This feature is coming soon.')
    }
  }


  // ---------------------------------------
  // DASHBOARD VALUES
  // ---------------------------------------

  const todayData = {
    walk_minutes: dashboard?.walk_minutes ?? null,
    sleep_hours: dashboard?.sleep_hours ?? null,
    water_glasses: dashboard?.water_glasses ?? 0,
    meals_logged: dashboard?.meals_logged ?? null,
  }

  const firstName =
    user?.name?.trim()?.split(/\s+/)[0] ||
    'Amma'

  const greeting = getGreeting()

  const alerts = Array.isArray(dashboard?.alerts)
    ? dashboard.alerts
    : []


  // ---------------------------------------
  // RENDER
  // ---------------------------------------

  return (
    <MotherLayout
      user={user}
      onLogout={onLogout}
      activePage="dashboard"
      onNavigate={navigate}
    >
      <div className="space-y-6">

        {/* PAGE HEADING */}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#D09A66]">
              MY HERBLOOM
            </p>

            <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#7B2346] md:text-4xl">
              {greeting}, {firstName}!
            </h1>

            <p className="mt-2 text-sm leading-6text-[#967384]">
              Welcome to your recovery companion.
              Every little step matters.
            </p>
          </div>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-[#EBD7DF] bg-white px-5 py-3 text-sm font-medium text-[#7B2346] transition hover:bg-[#FFF6F1] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={loading ? 'animate-spin' : ''}
            />

            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* ERROR MESSAGE */}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-[#F0D3B5] bg-[#FFF4E8] p-4"
          >
            <AlertCircle
              size={19}
              className="mt-0.5 shrink-0 text-[#B87931]"
            />

            <div className="flex-1">
              <p className="text-sm font-semibold text-[#80512C]">
                Dashboard information
              </p>

              <p className="mt-1 text-xs leading-6 text-[#987052]">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Dismiss message"
              className="text-[#987052]"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* STAGE CARD */}

        <StageCard
          stage={stage}
          user={user}
        />

        {/* DASHBOARD ALERTS */}

        <DashboardAlerts
          alerts={alerts}
          onNavigate={navigate}
        />

        {/* TODAY OVERVIEW */}

        <TodayOverview
          data={todayData}
          onQuickLog={quickLog}
          onNavigate={navigate}
        />

        {/* TASKS AND REMINDERS */}

        <div className="grid gap-6 xl:grid-cols-2">
          <DashboardTodo
            tasks={tasks}
            onAdd={addTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />

          <UpcomingReminders
            token={token}
            reminders={reminders}
            onAdd={addReminder}
            onDelete={deleteReminder}
          />
        </div>

        {/* BROWSER NOTIFICATION SETTINGS */}

        {permission === 'default' &&
          reminders.some((item) => !item.completed) && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#F0DEE4] bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[#FBE8EE] p-3 text-[#7B2346]">
                  <Bell size={19} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#7B2346]">
                    Enable Reminder Notifications
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#987887]">
                    Allow HerBloom to show reminders while
                    this page is open.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={requestPermission}
                className="rounded-full bg-[#7B2346] px-5 py-2.5 text-xs font-semibold text-whitehover:bg-[#68203C]"
              >
                Enable Notifications
              </button>
            </div>
          )}

        {/* QUICK ACTIONS */}

        <DashboardQuickActions
          onAction={quickAction}
        />

        {/* WEEKLY SNAPSHOT */}

        <WeeklySnapshot
          summary={weekly}
          onOpenSummary={() => navigate('weekly')}
        />

        {/* LOADING STATE */}

        {loading && !dashboard && !stage && (
          <div className="rounded-2xl border border-[#F0DEE4] bg-white p-5 text-center">
            <RefreshCw
              size={21}
              className="mx-auto mb-3 animate-spin text-[#7B2346]"
            />

            <p className="text-sm text-[#987887]">
              Loading your recovery information...
            </p>
          </div>
        )}

        {/* MEDICAL DISCLAIMER */}

        <p className="pb-4 text-center text-xs leading-6 text-[#A78A97]">
          HerBloom provides educational recoverysupport.
          It does not replace professional medical advice
          or diagnosis.
        </p>

      </div>

      {/* TOAST NOTIFICATION */}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50flex max-w-sm items-center gap-3 rounded-2xl bg-[#3A1224] px-5 py-4 text-sm text-white shadow-xl"
        >
          <Heart
            size={17}
            className="shrink-0 text-[#F6D3DB]"
          />

          <span className="flex-1">
            {toast}
          </span>

          <button
            type="button"
            onClick={() => setToast('')}
            aria-label="Dismiss notification"
            className="rounded-full p-1 text-white/80 hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      )}

    </MotherLayout>
  )
}
