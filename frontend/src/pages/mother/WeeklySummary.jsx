import { WeeklyInsights } from '../../components/mother/EntitlementPanels'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Droplets, Footprints,
  Heart, Moon, Sparkles, Utensils, Activity, CheckCircle2,
  AlertCircle, RefreshCw, ClipboardList, TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts'
import MotherLayout from '../../components/mother/MotherLayout'
import { getWeeklyReport, getCurrentMonday, shiftWeek } from '../../services/weeklyReportApi'

const BERRY = '#7B2346'
const GOLD = '#D9A25B'
const EMPTY = 'Not recorded'

function readableDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dayLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' })
}

function valueOrEmpty(value, suffix = '') {
  return value === null || value === undefined ? EMPTY : `${value}${suffix}`
}

function Panel({ title, subtitle, icon: Icon, children, className = '' }) {
  return (
    <section className={`rounded-[24px] border border-[#F0DEE5] bg-white p-5 shadow-[0_8px_30px_rgba(123,35,70,0.045)] ${className}`}>
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-[#FFF0F3] p-2.5 text-[#7B2346]"><Icon size={19} /></div>
        <div>
          <h3 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-[#967887]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function MiniStat({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-[22px] border border-[#F0DEE5] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[#937181]">{label}</span>
        <span className="rounded-xl bg-[#FFF0F3] p-2 text-[#7B2346]"><Icon size={18} /></span>
      </div>
      <p className="mt-3 font-['Playfair_Display'] text-2xl font-semibold text-[#3A1224]">{value}</p>
      <p className="mt-1 text-xs text-[#937181]">{detail}</p>
    </div>
  )
}

function ChartEmpty() {
  return <div className="flex h-[190px] items-center justify-center rounded-2xl bg-[#FFF9F6] px-5 text-center text-sm text-[#9A7B88]">No entries recorded for this week yet.</div>
}

function DailyChart({ entries, field, type = 'bar', color = BERRY, unit = '' }) {
  const data = (entries || []).map((item) => ({
    day: dayLabel(item.date),
    value: typeof item[field] === 'number' ? item[field] : null,
  }))
  const hasData = data.some((item) => item.value !== null)
  if (!hasData) return <ChartEmpty />

  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
            <CartesianGrid stroke="#F4E8EC" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#9A7B88', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9A7B88', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals />
            <Tooltip formatter={(value) => [`${value}${unit}`, 'Recorded']} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
            <CartesianGrid stroke="#F4E8EC" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#9A7B88', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9A7B88', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip formatter={(value) => [`${value}${unit}`, 'Recorded']} />
            <Bar dataKey="value" fill={color} radius={[7, 7, 0, 0]} maxBarSize={35} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export default function WeeklySummary({ user, onNavigate, onLogout }) {
  const [weekStart, setWeekStart] = useState(getCurrentMonday)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await getWeeklyReport(user?.access_token, weekStart)
        if (active) setReport(result)
      } catch (err) {
        if (active) {
          setReport(null)
          setError(err?.message || 'Could not load your weekly summary.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user?.access_token, weekStart, reloadKey])

  const data = report?.data || {}
  const currentWeek = getCurrentMonday()
  const coverage = data.completeness || {}
  const attention = report?.needs_attention || []
  const moodTags = useMemo(() =>
    (data.wellbeing?.mood_tags || []).flatMap((entry) =>
      (entry.tags || []).map((tag) => typeof tag === 'string' ? tag : tag?.name).filter(Boolean)
    ), [data.wellbeing?.mood_tags])

  return (
    <MotherLayout user={user} activePage="summary" onNavigate={onNavigate} onLogout={onLogout}>
      <WeeklyInsights token={user?.access_token} language={report?.language} />
      <div className="space-y-6 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#F9E4E9] px-3 py-1.5 text-xs font-semibold text-[#7B2346]">
              <Sparkles size={14} /> YOUR WEEK AT A GLANCE
            </div>
            <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#3A1224]">A gentle look at your week</h1>
            <p className="mt-2 text-sm text-[#967887]">Your entries, reflections and little moments of care — all in one place.</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-[#EFDDE3] bg-white p-2 shadow-sm">
            <button type="button" aria-label="Previous week" onClick={() => setWeekStart((w) => shiftWeek(w, -1))} className="rounded-xl p-2 text-[#7B2346] hover:bg-[#FFF0F3]"><ArrowLeft size={18} /></button>
            <div className="flex min-w-[205px] items-center justify-center gap-2 text-center text-sm font-semibold text-[#593849]"><CalendarDays size={16} className="text-[#7B2346]" />{readableDate(weekStart)} – {readableDate(report?.week_end || (() => { const [y,m,d] = weekStart.split('-').map(Number); const end = new Date(y,m-1,d+6); return `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}` })())}</div>
            <button type="button" aria-label="Next week" disabled={weekStart >= currentWeek} onClick={() => setWeekStart((w) => shiftWeek(w, 1))} className="rounded-xl p-2 text-[#7B2346] hover:bg-[#FFF0F3] disabled:cursor-not-allowed disabled:opacity-30"><ArrowRight size={18} /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[24px] bg-white text-[#7B2346]"><RefreshCw size={28} className="animate-spin" /><p className="text-sm">Preparing your weekly reflection...</p></div>
        ) : error ? (
          <div className="rounded-[24px] border border-[#F0DEE5] bg-white p-10 text-center">
            <AlertCircle size={28} className="mx-auto text-[#7B2346]" />
            <p className="mt-3 font-medium text-[#3A1224]">Unable to load this week</p>
            <p className="mt-2 text-sm text-[#967887]">{error}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-5 rounded-full bg-[#7B2346] px-6 py-2.5 text-sm font-semibold text-white">Try again</button>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#7B2346] via-[#8F3D5D] to-[#B8667E] p-6 text-white md:p-8">
              <div className="absolute -right-8 -top-14 h-48 w-48 rounded-full border-[30px] border-white/10" />
              <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFE1E9]">Your weekly reflection</p>
                  <h2 className="mt-3 font-['Playfair_Display'] text-3xl font-semibold">Every entry tells part of your story.</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/85">This summary only reflects what you've chosen to record. Missing entries are not treated as missed care.</p>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/15 px-5 py-4 backdrop-blur-sm">
                  <p className="text-xs text-white/80">Days with entries</p>
                  <p className="mt-1 text-3xl font-semibold">{coverage.days_with_data ?? 0}<span className="text-base font-normal text-white/75"> / {coverage.days_in_week ?? 7}</span></p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <MiniStat icon={Heart} label="Wellbeing check-ins" value={valueOrEmpty(data.wellbeing?.checkins)} detail="Check-ins you recorded this week" />
              <MiniStat icon={Utensils} label="Meals logged" value={valueOrEmpty(data.nutrition?.meals_logged)} detail="Meals added to your food log" />
              <MiniStat icon={Droplets} label="Hydration" value={valueOrEmpty(data.hydration?.average_glasses, ' glasses')} detail={`Average on ${data.hydration?.days_logged ?? 0} logged day(s)`} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel icon={Moon} title="Sleep and rest" subtitle={`Recorded nights: ${data.sleep?.nights_logged ?? 0} · Average: ${valueOrEmpty(data.sleep?.average_hours, ' hours')}`}>
                <DailyChart entries={data.sleep?.daily} field="hours" type="line" unit=" hours" />
              </Panel>
              <Panel icon={Footprints} title="Walking" subtitle={`Recorded walking days: ${data.walking?.days_walked ?? 0} · Total: ${valueOrEmpty(data.walking?.total_minutes, ' min')}`}>
                <DailyChart entries={data.walking?.daily} field="minutes" color={GOLD} unit=" min" />
              </Panel>
              <Panel icon={Activity} title="Movement and exercise" subtitle={`Sessions logged: ${data.exercise?.sessions ?? 0}`}>
                {(data.exercise?.sessions ?? 0) > 0 ? <DailyChart entries={data.exercise?.daily} field="sessions" color="#B8667E" /> : <ChartEmpty />}
              </Panel>
              <Panel icon={Droplets} title="Hydration log" subtitle="Glasses recorded each day">
                <DailyChart entries={data.hydration?.daily} field="glasses" color="#8B9FC4" />
              </Panel>
              <Panel icon={Utensils} title="Nutrition log" subtitle={`Total meals logged: ${data.nutrition?.meals_logged ?? 0}`}>
                <DailyChart entries={data.nutrition?.daily} field="meals" color="#D9A25B" />
                <p className="mt-3 text-xs text-[#967887]">Protein and iron estimates are shown only when verified nutrition data is available.</p>
              </Panel>
              <Panel icon={Heart} title="Emotional wellbeing" subtitle="Your check-ins and reflections">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#FFF6F1] p-4"><p className="text-xs text-[#967887]">Check-ins</p><p className="mt-2 text-2xl font-semibold text-[#7B2346]">{data.wellbeing?.checkins ?? 0}</p></div>
                  <div className="rounded-2xl bg-[#FFF6F1] p-4"><p className="text-xs text-[#967887]">Journal entries</p><p className="mt-2 text-2xl font-semibold text-[#7B2346]">{data.wellbeing?.journal_entries ?? 0}</p></div>
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-[#967887]">Mood tags recorded</p>
                {moodTags.length ? <div className="mt-3 flex flex-wrap gap-2">{[...new Set(moodTags)].map((tag) => <span key={tag} className="rounded-full bg-[#F9E4E9] px-3 py-1.5 text-xs text-[#7B2346]">{tag}</span>)}</div> : <p className="mt-3 text-sm text-[#967887]">No mood tags recorded for this week.</p>}
                <p className="mt-4 text-xs text-[#967887]">A numerical mood trend is not available from these entries.</p>
              </Panel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel icon={ClipboardList} title="Your activities" subtitle="Tasks and reminders for this week">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Completed', data.tasks?.completed ?? 0],
                    ['Pending', data.tasks?.pending ?? 0],
                    ['Missed', data.tasks?.missed ?? 0],
                  ].map(([label, value]) => <div key={label} className="rounded-2xl bg-[#FFF6F1] p-4"><p className="text-2xl font-semibold text-[#7B2346]">{value}</p><p className="mt-1 text-xs text-[#967887]">{label}</p></div>)}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-[#967887]"><CheckCircle2 size={15} /> Total activities: {data.tasks?.total ?? 0}</div>
              </Panel>
              <Panel icon={TrendingUp} title="Recovery check-ins" subtitle="Only your recorded entries are counted">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat icon={Heart} label="Body checks" value={data.recovery?.body_checks_logged ?? 0} detail="Logged this week" />
                  <MiniStat icon={Activity} label="Discomfort days" value={data.recovery?.discomfort_days ?? 0} detail="Reported in entries" />
                </div>
              </Panel>
            </div>

            {attention.length > 0 && (
              <Panel icon={AlertCircle} title="Worth keeping in mind" subtitle="Helpful notes based on your entries">
                <div className="space-y-3">
                  {attention.map((item, index) => (
                    <div key={`${item.code || 'note'}-${index}`} className="rounded-2xl border border-[#F2E2C4] bg-[#FFFAEF] p-4">
                      <p className="font-semibold text-[#775326]">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#826B4B]">{item.message}</p>
                      {item.action_page && <button type="button" onClick={() => onNavigate?.(item.action_page)} className="mt-3 text-xs font-semibold text-[#7B2346] underline underline-offset-4">{item.action_label || 'View more'}</button>}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <section className="rounded-[26px] border border-[#EAD1DA] bg-gradient-to-br from-[#FFF1F4] to-white p-6 md:p-8">
              <div className="flex items-center gap-3"><span className="rounded-2xl bg-[#7B2346] p-3 text-white"><Sparkles size={21} /></span><div><h2 className="font-['Playfair_Display'] text-2xl font-semibold text-[#3A1224]">A note from HerBloom AI</h2><p className="mt-1 text-xs text-[#967887]">AI-written from your recorded weekly data</p></div></div>
              {report?.ai_summary?.text ? <p className="mt-6 max-w-4xl whitespace-pre-line text-sm leading-8 text-[#684858]">{report.ai_summary.text}</p> : <p className="mt-6 text-sm leading-7 text-[#967887]">Your AI reflection isn't available right now. Your recorded weekly information is still shown above.</p>}
              <p className="mt-5 border-t border-[#EED9E0] pt-4 text-xs leading-5 text-[#967887]">This reflection is educational and supportive, not a medical diagnosis. Contact a qualified healthcare professional for personal medical advice.</p>
            </section>
          </>
        )}
      </div>
    </MotherLayout>
  )
}
