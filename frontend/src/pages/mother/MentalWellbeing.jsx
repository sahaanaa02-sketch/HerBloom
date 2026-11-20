
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Heart, Wind, Headphones, BookHeart, Sparkles,
  CalendarDays, Trash2, ArrowLeft, Play, Pause,
  RotateCcw, AlertCircle, CheckCircle2, Bell,
  Volume2, VolumeX, LockKeyhole, ChevronRight,
} from 'lucide-react'

import MotherLayout from '../../components/mother/MotherLayout'
import { wellbeingTranslations } from '../../locales/wellbeing'

import {
  getWellbeingStatus,
  submitWellbeingCheckin,
  getWellbeingHistory,
  getWellbeingSuggestions,
  getWellbeingActivities,
  completeWellbeingActivity,
  getJournalEntries,
  saveJournalEntry,
  deleteJournalEntry,
} from '../../services/wellbeingApi'

const CARD =
  'rounded-[24px] border border-[#F1DEE5] bg-white p-6 shadow-[0_8px_30px_rgba(123,35,70,0.05)]'

const AUDIO = {
  'meditation-2': '/audio/wellbeing/meditation-2min.mp3',
  'meditation-5': '/audio/wellbeing/meditation-5min.mp3',
  'meditation-10': '/audio/wellbeing/meditation-10min.mp3',
  breathing: '/audio/wellbeing/breathing-ambient.mp3',
}

function formatDate(value, language) {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString(
    language === 'ta' ? 'ta-IN' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' }
  )
}

function Heading({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="rounded-2xl bg-[#FBE6EB] p-3 text-[#7B2346]">
        <Icon size={22} />
      </span>
      <div>
        <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-xs leading-6 text-[#977685]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

function SupportCard({ t, urgent = false }) {
  return (
    <section className={`${CARD} ${urgent ? 'border-[#D9A25B] bg-[#FFF9EF]' : ''}`}>
      <Heading
        icon={Heart}
        title={urgent ? t.urgentTitle : t.supportTitle}
      />

      <p className="text-sm leading-7 text-[#765363]">
        {urgent ? t.urgentMessage : t.supportMessage}
      </p>

      <div className="mt-5 rounded-2xl bg-[#FFF0F3] p-5">
        <p className="text-sm font-semibold text-[#7B2346]">
          {t.helplineTitle}
        </p>

        {/* Display only: no call or external navigation */}
        <p className="mt-3 text-3xl font-bold tracking-widest text-[#3A1224]">
          1926
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-[#FFF6F1] p-4">
          <h3 className="font-semibold text-[#7B2346]">
            {t.babyBlues}
          </h3>
          <p className="mt-2 text-xs leading-6 text-[#765363]">
            {t.babyBluesText}
          </p>
        </div>

        <div className="rounded-2xl bg-[#FFF6F1] p-4">
          <h3 className="font-semibold text-[#7B2346]">
            {t.depression}
          </h3>
          <p className="mt-2 text-xs leading-6 text-[#765363]">
            {t.depressionText}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-6 text-[#977685]">
        {t.disclaimer}
      </p>
    </section>
  )
}

function WeeklyCheckin({ t, onSubmit, saving }) {
  const [answers, setAnswers] = useState(Array(6).fill(null))
  const [safety, setSafety] = useState(null)
  const [requestSupport, setRequestSupport] = useState(false)

  const complete =
    answers.every((value) => value !== null) &&
    safety !== null

  const update = (index, value) => {
    setAnswers((previous) =>
      previous.map((answer, i) =>
        i === index ? value : answer
      )
    )
  }

  return (
    <section className={CARD}>
      <Heading
        icon={Heart}
        title={t.weeklyTitle}
        subtitle={t.weeklySubtitle}
      />

      <p className="mb-6 rounded-2xl bg-[#FFF6F1] p-4 text-sm leading-7 text-[#765363]">
        {t.weeklyInfo}
      </p>

      <div className="space-y-7">
        {t.questions.slice(0, 6).map((question, index) => (
          <div key={index}>
            <p className="mb-3 text-sm font-semibold text-[#3A1224]">
              {index + 1}. {question}
            </p>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {t.options.map((label, value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update(index, value)}
                  aria-pressed={answers[index] === value}
                  className={`rounded-xl border px-3 py-3 text-xs font-medium transition ${
                    answers[index] === value
                      ? 'border-[#7B2346] bg-[#7B2346] text-white'
                      : 'border-[#EED9E1] bg-[#FFF9F7] text-[#765363]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl bg-[#FFF6F1] p-5">
          <p className="mb-4 text-sm font-semibold text-[#3A1224]">
            7. {t.questions[6]}
          </p>

          <div className="flex flex-wrap gap-3">
            {[
              { value: false, label: t.no },
              { value: true, label: t.yesSupport },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setSafety(option.value)}
                aria-pressed={safety === option.value}
                className={`rounded-xl border px-5 py-3 text-sm ${
                  safety === option.value
                    ? 'border-[#7B2346] bg-[#7B2346] text-white'
                    : 'border-[#EED9E1] bg-white text-[#765363]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {safety === true && (
            <div className="mt-4">
              <SupportCard t={t} urgent />
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 text-sm text-[#765363]">
          <input
            type="checkbox"
            checked={requestSupport}
            onChange={(event) =>
              setRequestSupport(event.target.checked)
            }
            className="mt-1 accent-[#7B2346]"
          />
          {t.requestSupport}
        </label>

        <button
          type="button"
          disabled={!complete || saving}
          onClick={() =>
            onSubmit({
              answers,
              safety_concern: safety,
              request_support: requestSupport,
            })
          }
          className="w-full rounded-full bg-[#7B2346] px-6 py-3.5 font-semibold text-white disabled:opacity-40"
        >
          {saving ? t.saving : t.submit}
        </button>
      </div>
    </section>
  )
}

function MoodTrend({ history, t, language }) {
  const data = history
    .filter((item) =>
      Array.isArray(item.answers?.frequency) &&
      item.answers.frequency.length >= 5
    )
    .map((item) => ({
      id: item.id,
      date: item.submitted_on,
      value:
        item.answers.frequency
          .slice(0, 5)
          .reduce((sum, value) => sum + value, 0) / 5,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const start = new Date(today)
  start.setDate(start.getDate() - 29)

  const x = (value) => {
    const date = new Date(`${value}T12:00:00`)
    const days = (date - start) / 86400000
    return 40 + (days / 29) * 570
  }

  const y = (value) => 170 - (value / 3) * 135

  return (
    <section className={CARD}>
      <Heading
        icon={CalendarDays}
        title={t.trendTitle}
        subtitle={t.trendSubtitle}
      />

      {data.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF6F1] p-10 text-center text-sm text-[#977685]">
          {t.emptyTrend}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-[#FFF9F7] p-3">
          <svg
            viewBox="0 0 650 205"
            className="w-full"
            role="img"
            aria-label={t.trendTitle}
          >
            {[0, 1, 2, 3].map((tick) => (
              <g key={tick}>
                <line
                  x1="40"
                  x2="610"
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="#EEDDE3"
                  strokeDasharray="4 5"
                />
                <text
                  x="28"
                  y={y(tick) + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="#977685"
                >
                  {tick}
                </text>
              </g>
            ))}

            {data.map((item) => (
              <g key={item.id}>
                <circle
                  cx={x(item.date)}
                  cy={y(item.value)}
                  r="6"
                  fill="#7B2346"
                  stroke="white"
                  strokeWidth="2"
                />
                <text
                  x={x(item.date)}
                  y="195"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#765363"
                >
                  {formatDate(item.date, language)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      <p className="mt-4 text-xs leading-6 text-[#977685]">
        {t.trendNote}
      </p>
    </section>
  )
}

function ActivityPlayer({
  activity,
  t,
  onBack,
  onComplete,
}) {
  const total = activity.duration * 60
  const [remaining, setRemaining] = useState(total)
  const [running, setRunning] = useState(false)
  const [muted, setMuted] = useState(false)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [finished, setFinished] = useState(false)
  const audioRef = useRef(null)
  const completionRef = useRef(false)

  const breathing = activity.type === 'breathing'
  const elapsed = total - remaining
  const inhale = elapsed % 10 < 4

  const audioSrc = breathing
    ? AUDIO.breathing
    : AUDIO[`meditation-${activity.duration}`]

  useEffect(() => {
    setRemaining(total)
    setRunning(false)
    setFinished(false)
    setAudioAvailable(true)
    completionRef.current = false
  }, [activity.id, total])

  useEffect(() => {
    if (!running) return

    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [running])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.muted = muted

    if (running && remaining > 0 && audioAvailable) {
      audio.play().catch(() => {
        setAudioAvailable(false)
      })
    } else {
      audio.pause()
    }
  }, [running, remaining, muted, audioAvailable])

  useEffect(() => {
    if (remaining !== 0 || completionRef.current) return

    completionRef.current = true
    setRunning(false)
    setFinished(true)

    if (audioRef.current) {
      audioRef.current.pause()
    }

    onComplete(activity.id)
  }, [remaining, activity.id, onComplete])

  function restart() {
    setRunning(false)
    setRemaining(total)
    setFinished(false)
    completionRef.current = false

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  return (
    <section className={CARD}>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-[#7B2346]"
      >
        <ArrowLeft size={17} />
        {t.back}
      </button>

      <h2 className="text-center font-['Playfair_Display'] text-3xl font-semibold text-[#3A1224]">
        {breathing ? t.breathing : t.meditation}
      </h2>

      <p className="mt-2 text-center text-sm text-[#977685]">
        {activity.duration} min
      </p>

      <div className="flex min-h-[310px] items-center justify-center">
        <div
          className={`flex h-48 w-48 flex-col items-center justify-center rounded-full border-[10px] border-[#F6D3DB] bg-[#FBE6EB] text-[#7B2346] shadow-xl ${
            breathing && running
              ? inhale
                ? 'scale-110'
                : 'scale-90'
              : ''
          }`}
          style={{
            transition: breathing
              ? `transform ${inhale ? 4 : 6}s ease-in-out`
              : 'none',
          }}
        >
          {breathing ? <Wind size={32} /> : <Heart size={32} />}

          <p className="mt-3 text-center text-lg font-semibold">
            {breathing
              ? running
                ? inhale
                  ? t.breatheIn
                  : t.breatheOut
                : t.ready
              : t.meditation}
          </p>
        </div>
      </div>

      <p className="text-center text-3xl font-bold tabular-nums text-[#3A1224]">
        {String(Math.floor(remaining / 60)).padStart(2, '0')}:
        {String(remaining % 60).padStart(2, '0')}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={remaining === 0}
          onClick={() => setRunning((value) => !value)}
          className="flex items-center gap-2 rounded-full bg-[#7B2346] px-6 py-3 text-white disabled:opacity-40"
        >
          {running ? <Pause size={17} /> : <Play size={17} />}
          {running ? t.pause : t.start}
        </button>

        <button
          type="button"
          onClick={restart}
          className="flex items-center gap-2 rounded-full border border-[#E9CBD5] px-5 py-3 text-[#7B2346]"
        >
          <RotateCcw size={17} />
          {t.restart}
        </button>

        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="rounded-full border border-[#E9CBD5] p-3 text-[#7B2346]"
        >
          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
      </div>

      <audio
        ref={audioRef}
        src={audioSrc}
        loop
        preload="none"
        onError={() => setAudioAvailable(false)}
      />

      {!audioAvailable && (
        <p className="mt-4 text-center text-xs text-[#977685]">
          {t.audioUnavailable}
        </p>
      )}

      {finished && (
        <p className="mt-5 text-center font-semibold text-[#7B2346]">
          {t.sessionComplete}
        </p>
      )}
    </section>
  )
}

function JournalSection({ token, t }) {
  const [entries, setEntries] = useState([])
  const [content, setContent] = useState('')
  const [gratitude, setGratitude] = useState('')
  const [saving, setSaving] = useState(false)
  const [needSupport, setNeedSupport] = useState(false)
  const [error, setError] = useState('')

  const prompt = t.journalPrompts[new Date().getDay()]

  const load = useCallback(async () => {
    try {
      setEntries(await getJournalEntries(token))
    } catch (err) {
      setError(err.message)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!content.trim()) return

    setSaving(true)
    setError('')

    try {
      await saveJournalEntry(token, {
        prompt,
        content: content.trim(),
        gratitude: gratitude.trim(),
        mood_tag: '',
      })

      setContent('')
      setGratitude('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!window.confirm(t.deleteEntry)) return

    try {
      await deleteJournalEntry(token, id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <Heading
          icon={BookHeart}
          title={t.privateJournal}
        />

        <div className="mb-5 flex items-center gap-2 rounded-xl bg-[#FFF6F1] p-4 text-xs text-[#7B2346]">
          <LockKeyhole size={17} />
          {t.privateNote}
        </div>

        <p className="mb-2 font-semibold text-[#3A1224]">
          {t.journalPrompt}
        </p>

        <p className="mb-4 text-sm text-[#765363]">
          {prompt}
        </p>

        <textarea
          rows={5}
          maxLength={10000}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={t.journalPlaceholder}
          className="w-full rounded-2xl border border-[#EED9E1] bg-[#FFFDFC] p-4 text-sm outline-none focus:border-[#7B2346]"
        />

        <p className="mb-3 mt-5 font-semibold text-[#3A1224]">
          {t.gratitude}
        </p>

        <textarea
          rows={2}
          maxLength={2000}
          value={gratitude}
          onChange={(event) => setGratitude(event.target.value)}
          placeholder={t.gratitudePlaceholder}
          className="w-full rounded-2xl border border-[#EED9E1] p-4 text-sm outline-none focus:border-[#7B2346]"
        />

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={!content.trim() || saving}
            onClick={save}
            className="rounded-full bg-[#7B2346] px-7 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? t.saving : t.saveEntry}
          </button>

          <button
            type="button"
            onClick={() => setNeedSupport((value) => !value)}
            className="text-sm font-semibold text-[#7B2346] underline"
          >
            {t.needSupport}
          </button>
        </div>

        {needSupport && (
          <div className="mt-5">
            <SupportCard t={t} urgent />
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-700">{error}</p>
        )}
      </section>

      <section className={CARD}>
        <Heading
          icon={BookHeart}
          title={t.previousEntries}
        />

        {entries.length === 0 ? (
          <p className="text-sm text-[#977685]">
            {t.noEntries}
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-[#FFF6F1] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold text-[#7B2346]">
                    {entry.prompt}
                  </p>

                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    aria-label="Delete entry"
                    className="text-[#7B2346]"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#765363]">
                  {entry.content}
                </p>

                {entry.gratitude && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-xs text-[#7B2346]">
                    {t.gratitude}: {entry.gratitude}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function MentalWellbeing({
  user,
  onLogout,
  onNavigate,
}) {
  const token = user?.access_token

  const [language, setLanguage] = useState('en')
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [activities, setActivities] = useState([])
  const [tab, setTab] = useState('overview')
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [urgentSupport, setUrgentSupport] = useState(false)
  const [reminderDismissed, setReminderDismissed] = useState(false)

  const t = wellbeingTranslations[language]

  const load = useCallback(async () => {
    try {
      const [s, h, r, a] = await Promise.all([
        getWellbeingStatus(token),
        getWellbeingHistory(token),
        getWellbeingSuggestions(token),
        getWellbeingActivities(token),
      ])

      setStatus(s)
      setHistory(h)
      setSuggestions(r)
      setActivities(a)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) load()
  }, [token, load])

  async function submit(payload) {
    setSaving(true)

    try {
      const result = await submitWellbeingCheckin(token, payload)
      setUrgentSupport(result.show_support)
      setReminderDismissed(true)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const finishActivity = useCallback(async (id) => {
    try {
      await completeWellbeingActivity(token, id)
    } catch (err) {
      setError(err.message)
    }
  }, [token])

  function startActivity(type, duration) {
    const activity = activities.find(
      (item) =>
        item.type === type &&
        item.duration === duration
    )

    if (!activity) {
      setError('Activity is not available yet.')
      return
    }

    setSelectedActivity(activity)
    setTab('activity')
  }

  function openSuggestion(type) {
    if (type === 'breathing') startActivity('breathing', 2)
    else if (type === 'meditation') startActivity('meditation', 5)
    else if (type === 'journal') setTab('journal')
    else setTab('support')
  }

  const tabs = [
    ['overview', t.overview],
    ['journal', t.journal],
    ['trends', t.trends],
    ['support', t.support],
  ]

  return (
    <MotherLayout
      user={user}
      activePage="wellbeing"
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#D9A25B]">
              HerBloom / Mother Portal
            </p>

            <h1 className="font-['Playfair_Display'] text-3xl font-bold text-[#7B2346] md:text-4xl">
              {t.title}
            </h1>

            <p className="mt-2 text-sm text-[#977685]">
              {t.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#EED9E1] bg-white p-1">
            {['en', 'ta'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  language === code
                    ? 'bg-[#7B2346] text-white'
                    : 'text-[#7B2346]'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-5 py-2.5 text-xs font-semibold ${
                tab === id
                  ? 'bg-[#7B2346] text-white'
                  : 'border border-[#F0DDE4] bg-white text-[#7B2346]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {loading ? (
          <div className={CARD}>{t.loading}</div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-6">
                {status?.due && !reminderDismissed && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E8C5D0] bg-[#FBE6EB] p-5">
                    <div className="flex items-start gap-3">
                      <Bell size={22} className="text-[#7B2346]" />
                      <div>
                        <p className="font-semibold text-[#7B2346]">
                          {t.reminderTitle}
                        </p>
                        <p className="mt-1 text-xs text-[#765363]">
                          {t.reminderText}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setReminderDismissed(true)}
                      className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-[#7B2346]"
                    >
                      {t.dismiss}
                    </button>
                  </div>
                )}

                {urgentSupport && (
                  <SupportCard t={t} urgent />
                )}

                {status?.due ? (
                  <WeeklyCheckin
                    t={t}
                    onSubmit={submit}
                    saving={saving}
                  />
                ) : (
                  <div className={CARD}>
                    <div className="flex items-center gap-3 text-[#7B2346]">
                      <CheckCircle2 size={22} />
                      <h2 className="font-semibold">
                        {t.completed}
                      </h2>
                    </div>

                    <p className="mt-3 text-sm text-[#765363]">
                      {t.nextDue}: {formatDate(status?.next_due, language)}
                    </p>
                  </div>
                )}

                <div className="grid gap-6 xl:grid-cols-2">
                  <MoodTrend
                    history={history}
                    t={t}
                    language={language}
                  />

                  <section className={CARD}>
                    <Heading
                      icon={Sparkles}
                      title={t.suggestions}
                      subtitle={t.suggestionsSub}
                    />

                    <div className="space-y-3">
                      {suggestions.map((item, index) => (
                        <button
                          key={`${item.type}-${index}`}
                          type="button"
                          onClick={() => openSuggestion(item.type)}
                          className="flex w-full items-center justify-between rounded-2xl bg-[#FFF6F1] p-4 text-left"
                        >
                          <div>
                            <p className="font-semibold text-[#7B2346]">
                              {item.type === 'breathing'
                                ? t.breathing
                                : item.type === 'meditation'
                                  ? t.meditation
                                  : item.type === 'journal'
                                    ? t.journal
                                    : t.support}
                            </p>
                            <p className="mt-1 text-xs text-[#977685]">
                              {item.duration} min
                            </p>
                          </div>

                          <ChevronRight size={19} className="text-[#7B2346]" />
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <div>
                  <h2 className="mb-4 font-['Playfair_Display'] text-2xl font-semibold text-[#3A1224]">
                    {t.quickCare}
                  </h2>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      [t.breathing, '1 / 2 / 5 min', Wind,
                        () => startActivity('breathing', 2)],
                      [t.meditation, '2 / 5 / 10 min', Headphones,
                        () => startActivity('meditation', 5)],
                      [t.journal, t.writeFreely, BookHeart,
                        () => setTab('journal')],
                      [t.support, t.helpHelplines, Heart,
                        () => setTab('support')],
                    ].map(([title, sub, Icon, action]) => (
                      <button
                        key={title}
                        type="button"
                        onClick={action}
                        className="rounded-[24px] border border-[#F1DEE5] bg-gradient-to-br from-[#FBE4E9] to-[#FFF3F0] p-6 text-center transition hover:-translate-y-1 hover:shadow-lg"
                      >
                        <Icon
                          size={30}
                          className="mx-auto mb-4 text-[#7B2346]"
                        />
                        <p className="font-semibold text-[#3A1224]">
                          {title}
                        </p>
                        <p className="mt-1 text-xs text-[#977685]">
                          {sub}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <section className={CARD}>
                  <Heading
                    icon={Headphones}
                    title={t.chooseActivity}
                  />

                  <div className="grid gap-5 md:grid-cols-2">
                    {[
                      ['breathing', [1, 2, 5]],
                      ['meditation', [2, 5, 10]],
                    ].map(([type, durations]) => (
                      <div
                        key={type}
                        className="rounded-2xl bg-[#FFF6F1] p-5"
                      >
                        <p className="mb-4 font-semibold text-[#7B2346]">
                          {type === 'breathing'
                            ? t.breathing
                            : t.meditation}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {durations.map((minutes) => (
                            <button
                              key={minutes}
                              type="button"
                              onClick={() =>
                                startActivity(type, minutes)
                              }
                              className="rounded-full border border-[#E9CBD5] bg-white px-5 py-2.5 text-sm text-[#7B2346]"
                            >
                              {minutes} min
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === 'trends' && (
              <MoodTrend
                history={history}
                t={t}
                language={language}
              />
            )}

            {tab === 'journal' && (
              <JournalSection token={token} t={t} />
            )}

            {tab === 'support' && (
              <SupportCard t={t} />
            )}

            {tab === 'activity' && selectedActivity && (
              <ActivityPlayer
                key={selectedActivity.id}
                activity={selectedActivity}
                t={t}
                onBack={() => setTab('overview')}
                onComplete={finishActivity}
              />
            )}
          </>
        )}
      </div>
    </MotherLayout>
  )
}
