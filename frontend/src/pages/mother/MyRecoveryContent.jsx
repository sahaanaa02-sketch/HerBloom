import { useTranslation } from 'react-i18next'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowLeft, Baby, BedDouble, CalendarDays,
  Check, ChevronLeft, ChevronRight, Clock, Footprints,
  Heart, Info, Lock, Plus, ShieldAlert, Trash2,
  TrendingUp, Wind,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

import MotherLayout from '../../components/mother/MotherLayout'
import ExerciseAccess from '../../components/recovery/ExerciseAccess'
import { recoveryApi as api } from '../../services/recoveryApi'

const PINK = '#7B2346'
const CARD = 'rounded-[24px] border border-[#F1DEE5] bg-white p-5 shadow-sm'
const BUTTON = 'rounded-full bg-[#7B2346] px-5 py-2.5 text-sm font-semibold text-white'
const INPUT = 'w-full rounded-xl border border-[#ECD7DF] bg-[#FFFCFB] px-4 py-3 text-sm outline-none focus:border-[#7B2346]'

const TABS = [
  ['overview', 'Overview'],
  ['sleep', 'Sleep and Rest'],
  ['walking', 'Walking'],
  ['exercises', 'Exercises'],
  ['body', 'Body Check'],
  ['care', 'Birth Recovery Care'],
  ['warnings', 'Warning Signs'],
  ['calendar', 'Calendar'],
]

function todayISO() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateBefore(days) {
  const date = new Date(`${todayISO()}T12:00:00`)
  date.setDate(date.getDate() - days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className={CARD}>
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-2xl bg-[#FBE6EB] p-3 text-[#7B2346]">
          <Icon size={21} />
        </div>
        <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function Empty({ text = 'No entries yet – add your first.' }) {
  return (
    <p className="rounded-2xl bg-[#FFF6F1] p-6 text-center text-sm text-[#997988]">
      {text}
    </p>
  )
}

function WeeklyChart({ rows, valueKey, label }) {
  const data = Array.from({ length: 7 }, (_, i) => {
    const date = dateBefore(6 - i)
    const matching = rows.filter((row) => row.date === date)
    return {
      day: date.slice(5),
      value: matching.reduce(
        (sum, row) => sum + Number(row[valueKey] || 0), 0
      ),
    }
  })

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#F4E5E9" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [value, label]} />
          <Bar
            dataKey="value"
            fill="#D98991"
            radius={[7, 7, 0, 0]}
            maxBarSize={34}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Metric({ icon: Icon, title, value, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD} text-left transition hover:border-[#D9A25B]`}
    >
      <Icon size={25} className="mb-4 text-[#7B2346]" />
      <p className="text-sm text-[#977685]">{title}</p>
      <p className="mt-2 text-2xl font-bold text-[#3A1224]">{value}</p>
      <p className="mt-1 text-xs text-[#B28D9B]">{subtitle}</p>
    </button>
  )
}

function SleepTab({ rows, save, remove }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [form, setForm] = useState({
    date: todayISO(),
    bed_time: '22:00',
    wake_time: '06:00',
    quality: 3,
    wakings: 0,
    note: '',
  })
  const [editing, setEditing] = useState(null)

  function change(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    const ok = await save('sleep', form, editing)
    if (ok) {
      setEditing(null)
      change('note', '')
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title={localizeCopy('common:sleep_and_rest_log')} icon={BedDouble}>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-[#765363]">
            {uiText('date')}
            <input type="date" max={todayISO()} required
              className={`${INPUT} mt-2`}
              value={form.date}
              onChange={(e) => change('date', e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {[
              ['bed_time', 'Bedtime'],
              ['wake_time', 'Wake time'],
            ].map(([key, label]) => (
              <label key={key} className="text-sm text-[#765363]">
                {label}
                <input type="time" required
                  className={`${INPUT} mt-2`}
                  value={form[key]}
                  onChange={(e) => change(key, e.target.value)}
                />
              </label>
            ))}
          </div>

          <div>
            <p className="mb-3 text-sm text-[#765363]">{localizeCopy('common:sleep_quality')}</p>
            <div className="flex gap-2">
              {['😞', '😕', '😐', '🙂', '😊'].map((face, index) => (
                <button key={face} type="button"
                  onClick={() => change('quality', index + 1)}
                  className={`flex-1 rounded-xl py-3 text-2xl ${
                    form.quality === index + 1
                      ? 'bg-[#F6D3DB] ring-2 ring-[#7B2346]'
                      : 'bg-[#FFF6F1]'
                  }`}
                >
                  {face}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-[#765363]">
              {localizeCopy('common:night_wakings')}
            </span>
            <div className="flex items-center gap-4">
              <button type="button"
                onClick={() => change(
                  'wakings', Math.max(0, form.wakings - 1)
                )}
                className="rounded-full bg-[#FFF0F3] px-4 py-2"
              >−</button>
              <span>{form.wakings}</span>
              <button type="button"
                onClick={() => change('wakings', form.wakings + 1)}
                className="rounded-full bg-[#FFF0F3] px-4 py-2"
              >+</button>
            </div>
          </div>

          <textarea className={INPUT} rows={3}
            placeholder={uiText('optional_sleep_notes')}
            value={form.note}
            onChange={(e) => change('note', e.target.value)}
          />

          <button className={BUTTON} type="submit">
            {editing ? auditText('common:update_sleep') : auditText('common:save_sleep')}
          </button>
          {editing && (
            <button type="button" className="ml-3 text-sm"
              onClick={() => setEditing(null)}>
              {uiText('cancel')}
            </button>
          )}
        </form>
      </Section>

      <div className="space-y-5">
        <Section title={localizeCopy('common:last_7_days')} icon={TrendingUp}>
          <WeeklyChart rows={rows} valueKey="hours" label={localizeCopy('common:hours')} />
        </Section>

        <Section title={auditText('common:sleep_history')} icon={Clock}>
          {rows.length === 0 ? <Empty /> : (
            <div className="max-h-80 space-y-2 overflow-auto overscroll-contain">
              {rows.map((row) => (
                <div key={row.id}
                  className="flex items-center justify-between rounded-xl bg-[#FFF6F1] p-3"
                >
                  <div>
                    <p className="font-semibold text-[#3A1224]">
                      {row.hours} hours
                    </p>
                    <p className="text-xs text-[#977685]">
                      {row.date} {auditText('common:quality')} {row.quality}/5
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button"
                      className="text-sm text-[#7B2346]"
                      onClick={() => {
                        setEditing(row.id)
                        setForm({
                          date: row.date,
                          bed_time: row.bed_time.slice(0, 5),
                          wake_time: row.wake_time.slice(0, 5),
                          quality: row.quality,
                          wakings: row.wakings,
                          note: row.note || '',
                        })
                      }}
                    >{uiText('edit')}</button>
                    <button type="button"
                      aria-label={uiText('delete_sleep_entry')}
                      onClick={() => remove('sleep', row.id)}
                    ><Trash2 size={17} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function WalkingTab({ rows, summary, save, remove }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [date, setDate] = useState(todayISO())
  const [minutes, setMinutes] = useState(10)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(null)

  async function submit(event) {
    event.preventDefault()
    const ok = await save(
      'walks', { date, minutes: Number(minutes), note }, editing
    )
    if (ok) {
      setEditing(null)
      setNote('')
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title={auditText('common:walking_tracker')} icon={Footprints}>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#FFF6F1] p-4">
            <p className="text-xs text-[#977685]">{auditText('common:last_7_days_2')}</p>
            <p className="text-2xl font-bold text-[#7B2346]">
              {summary?.weekly_walk_minutes || 0} min
            </p>
          </div>
          <div className="rounded-xl bg-[#FFF6F1] p-4">
            <p className="text-xs text-[#977685]">{auditText('common:current_streak')}</p>
            <p className="text-2xl font-bold text-[#7B2346]">
              {summary?.walking_streak || 0} days
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input type="date" max={todayISO()} required
            className={INPUT} value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex gap-2">
            {[5, 10, 15].map((value) => (
              <button key={value} type="button"
                onClick={() => setMinutes(value)}
                className={`flex-1 rounded-full py-3 text-sm ${
                  minutes === value
                    ? 'bg-[#7B2346] text-white'
                    : 'bg-[#FFF0F3] text-[#7B2346]'
                }`}
              >
                +{value} min
              </button>
            ))}
          </div>

          <input type="number" min="1" max="300" required
            className={INPUT} value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />

          <textarea rows={3} className={INPUT}
            placeholder={uiText('optional_walking_notes')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button type="submit" className={BUTTON}>
            {editing ? auditText('common:update_walk') : auditText('common:save_walk')}
          </button>
          {editing && (
            <button type="button" className="ml-3 text-sm"
              onClick={() => setEditing(null)}>
              {uiText('cancel')}
            </button>
          )}
        </form>
      </Section>

      <div className="space-y-5">
        <Section title={auditText('common:weekly_walking_progress')} icon={TrendingUp}>
          <WeeklyChart rows={rows} valueKey="minutes" label={uiText('minutes')} />
          <p className="mt-3 text-xs text-[#977685]">
            Track at your own comfortable pace. No fixed activity target
            is required.
          </p>
        </Section>

        <Section title={auditText('common:walking_history')} icon={CalendarDays}>
          {rows.length === 0 ? <Empty /> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id}
                  className="flex items-center justify-between rounded-xl bg-[#FFF6F1] p-3"
                >
                  <div>
                    <p className="font-semibold text-[#3A1224]">
                      {row.minutes} min
                    </p>
                    <p className="text-xs text-[#977685]">{row.date}</p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button"
                      className="text-sm text-[#7B2346]"
                      onClick={() => {
                        setEditing(row.id)
                        setDate(row.date)
                        setMinutes(row.minutes)
                        setNote(row.note || '')
                      }}
                    >{uiText('edit')}</button>
                    <button type="button"
                      aria-label={uiText('delete_walk_entry')}
                      onClick={() => remove('walks', row.id)}
                    ><Trash2 size={17} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

const SYMPTOMS = [
  ['wound', 'Wound discomfort'],
  ['back_pain', 'Back pain'],
  ['pelvic_heaviness', 'Pelvic heaviness'],
  ['urine_leakage', 'Urine leakage'],
  ['breast_pain', 'Breast discomfort'],
]

function BodyTab({ rows, save, remove }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const empty = {
    date: todayISO(),
    wound: false,
    bleeding_level: 'none',
    back_pain: false,
    pelvic_heaviness: false,
    urine_leakage: false,
    breast_pain: false,
    energy: 3,
    note: '',
  }

  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)

  function change(key, value) {
    setForm((old) => ({ ...old, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    const ok = await save('body', form, editing)
    if (ok) {
      setForm(empty)
      setEditing(null)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title={auditText('common:rest_and_discomfort_notes')} icon={Heart}>
        <form onSubmit={submit} className="space-y-5">
          <input type="date" max={todayISO()} required
            className={INPUT} value={form.date}
            onChange={(e) => change('date', e.target.value)}
          />

          <p className="text-sm text-[#765363]">
            {auditText('common:select_anything_you_would_like_to_record')}
          </p>

          <div className="flex flex-wrap gap-2.5">
            {SYMPTOMS.map(([key, label]) => (
              <button key={key} type="button"
                aria-pressed={form[key]}
                onClick={() => change(key, !form[key])}
                className={`rounded-full border px-4 py-2.5 text-sm ${
                  form[key]
                    ? 'border-[#7B2346] bg-[#7B2346] text-white'
                    : 'border-[#ECD7DF] bg-[#FFF6F1] text-[#7B2346]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="block text-sm text-[#765363]">
            {auditText('common:bleeding_level')}
            <select className={`${INPUT} mt-2`}
              value={form.bleeding_level}
              onChange={(e) => change('bleeding_level', e.target.value)}
            >
              {['none', 'light', 'moderate', 'heavy'].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-[#765363]">
            {auditText('common:energy_level')} {form.energy}/5
            <input type="range" min="1" max="5"
              className="mt-3 w-full accent-[#7B2346]"
              value={form.energy}
              onChange={(e) => change('energy', Number(e.target.value))}
            />
          </label>

          <textarea className={INPUT} rows={4}
            placeholder={uiText('how_are_you_feeling_today')}
            value={form.note}
            onChange={(e) => change('note', e.target.value)}
          />

          <button type="submit" className={BUTTON}>
            {editing ? auditText('common:update_body_check') : auditText('common:save_body_check')}
          </button>
        </form>
      </Section>

      <Section title={auditText('common:previous_body_checks')} icon={CalendarDays}>
        {rows.length === 0 ? <Empty /> : (
          <div className="max-h-[550px] space-y-3 overflow-auto overscroll-contain">
            {rows.map((row) => (
              <div key={row.id}
                className="rounded-2xl bg-[#FFF6F1] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#7B2346]">
                    {row.date}
                  </p>
                  <div className="flex gap-3">
                    <button type="button"
                      className="text-sm text-[#7B2346]"
                      onClick={() => {
                        setEditing(row.id)
                        setForm({
                          ...empty,
                          ...row,
                        })
                      }}
                    >{uiText('edit')}</button>
                    <button type="button"
                      aria-label={uiText('delete_body_check')}
                      onClick={() => remove('body', row.id)}
                    ><Trash2 size={17} /></button>
                  </div>
                </div>

                <p className="mt-2 text-xs text-[#765363]">
                  {auditText('common:bleeding')} {row.bleeding_level} {auditText('common:energy')} {row.energy}/5
                </p>
                <p className="mt-2 text-sm text-[#765363]">
                  {row.note || auditText('common:no_additional_notes')}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function ExerciseTab({ exercises, reload }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState(null)
  const [step, setStep] = useState(0)
  const [feeling, setFeeling] = useState('ok')
  const [flags, setFlags] = useState({
    pain: false, bleeding: false, pelvic_heaviness: false,
  })
  const [error, setError] = useState('')

  const categories = [
    'All', ...new Set(exercises.map((e) => e.category))
  ]

  const filtered = exercises.filter(
    (e) => category === 'All' || e.category === category
  )

  if (selected) {
    const instructions = Array.isArray(selected.steps)
      ? selected.steps
      : []
    const finished = step >= instructions.length
    const last = step === instructions.length - 1

    return (
      <Section title={selected.name} icon={Activity}>
        <button type="button"
          className="mb-5 flex items-center gap-2 text-sm text-[#7B2346]"
          onClick={() => setSelected(null)}
        >
          <ArrowLeft size={17} /> {auditText('common:back_to_exercises')}
        </button>

        <div className="rounded-2xl bg-[#FFF6F1] p-8 text-center">
          {finished ? (
            <p className="text-xl font-semibold text-[#3A1224]">
              {auditText('common:activity_steps_completed_please_record_how_you_felt')}
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-[#977685]">
                {uiText('step')} {step + 1} of {instructions.length}
              </p>
              <p className="text-xl font-semibold leading-9 text-[#3A1224]">
                {instructions[step]}
              </p>
            </>
          )}
        </div>

        <p className="my-5 rounded-xl bg-[#FFF0F3] p-4 text-sm text-[#7B2346]">
          {selected.safety_notes}
        </p>

        {!finished && (
          <div className="flex justify-between gap-3">
            <button
              type="button"
              className="rounded-full border px-6 py-3"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              {uiText('back')}
            </button>

            {!last ? (
              <button
                type="button"
                className={BUTTON}
                onClick={() => setStep((s) => s + 1)}
              >
                {uiText('next')}
              </button>
            ) : (
              <button
                type="button"
                className={BUTTON}
                onClick={() => setStep(instructions.length)}
              >
                {auditText('common:done')}
              </button>
            )}
          </div>
        )}

        {step >= instructions.length && (
          <div className="mt-6 space-y-4 rounded-2xl bg-[#FFF6F1] p-5">
            <p className="font-semibold">{auditText('common:how_did_it_feel')}</p>
            <div className="flex gap-2">
              {['easy', 'ok', 'hard'].map((value) => (
                <button key={value} type="button"
                  onClick={() => setFeeling(value)}
                  className={`rounded-full px-5 py-2 ${
                    feeling === value
                      ? 'bg-[#7B2346] text-white'
                      : 'bg-white'
                  }`}
                >{value}</button>
              ))}
            </div>

            {[
              ['pain', 'Pain'],
              ['bleeding', 'Bleeding'],
              ['pelvic_heaviness', 'Pelvic heaviness'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={flags[key]}
                  onChange={(e) => setFlags((old) => ({
                    ...old, [key]: e.target.checked,
                  }))}
                />
                {label}
              </label>
            ))}

            <button type="button" className={BUTTON}
              onClick={async () => {
                try {
                  // Activity completion is saved by the parent integration.
                  await reload({
                    exercise_id: selected.id,
                    feeling,
                    ...flags,
                    note: '',
                  })
                  setSelected(null)
                } catch (err) {
                  setError(err.message)
                }
              }}
            >
              {auditText('common:save_session')}
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        )}
      </Section>
    )
  }

  return (
    <Section title={auditText('common:gentle_exercise_guidance')} icon={Activity}>
      <p className="mb-5 text-sm leading-7 text-[#765363]">
        Activities are educational guidance. Availability depends on
        recovery details, reported symptoms and clinical content review.
      </p>

      <div className="mb-5 flex flex-wrap gap-2.5">
        {categories.map((name) => (
          <button key={name} type="button"
            onClick={() => setCategory(name)}
            className={`rounded-full px-4 py-2 text-xs ${
              category === name
                ? 'bg-[#7B2346] text-white'
                : 'bg-[#FFF0F3] text-[#7B2346]'
            }`}
          >{name}</button>
        ))}
      </div>

      {filtered.length === 0 ? <Empty /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.id}
              className={`rounded-2xl border p-5 ${
                item.locked
                  ? 'border-gray-200 bg-gray-50'
                  : 'border-[#F1DEE5] bg-[#FFF6F1]'
              }`}
            >
              <div className="mb-4 flex justify-between">
                <Activity className="text-[#7B2346]" />
                {item.locked && <Lock size={18} />}
              </div>
              <h3 className="font-semibold text-[#3A1224]">
                {item.name}
              </h3>
              <p className="mt-2 text-xs text-[#977685]">
                {item.category} · {item.duration_minutes} min
              </p>

              {item.locked ? (
                <p className="mt-4 text-xs leading-6 text-[#765363]">
                  {item.lock_reason}
                </p>
              ) : (
                <button type="button" className={`${BUTTON} mt-5`}
                  onClick={() => {
                    setSelected(item)
                    setStep(0)
                  }}
                >{auditText('common:start')}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function CareTab({ context }) {
  const { t: auditText } = useTranslation()
  const cSection = ['csection', 'c_section'].includes(context?.delivery_type)
  const week = context?.postpartum_week ?? 0

  const items = cSection
    ? week < 6
      ? [
          'Follow your discharge instructions for wound care.',
          'Keep the wound area clean and dry as advised.',
          'Avoid activities that increase discomfort.',
          'Report wound changes or fever to a healthcare professional.',
        ]
      : [
          'Continue monitoring any wound or scar concerns.',
          'Discuss persistent discomfort with a healthcare professional.',
          'Increase activities only according to your recovery guidance.',
        ]
    : [
        'Make time for rest and recovery.',
        'Follow any birth-related care instructions you received.',
        'Discuss persistent discomfort or bladder concerns with a professional.',
        'Ask for help with daily tasks when needed.',
      ]

  return (
    <Section
      title={cSection ? auditText('common:c_section_recovery_care') : auditText('common:birth_recovery_care')}
      icon={Baby}
    >
      {!context?.configured && (
        <p className="mb-5 text-sm text-[#977685]">
          {auditText('common:complete_your_recovery_profile_for_personalized_stage_information')}
        </p>
      )}

      <div className="space-y-3">
        {items.map((text) => (
          <div key={text}
            className="flex gap-3 rounded-2xl bg-[#FFF6F1] p-4"
          >
            <Check size={18} className="shrink-0 text-[#7B2346]" />
            <p className="text-sm leading-7 text-[#765363]">{text}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-[#977685]">
        General educational information only. Follow your own healthcare
        team's instructions where they differ.
      </p>
    </Section>
  )
}

function WarningTab({ token }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [published, setPublished] = useState({ signs: [], helplines: [] })
  const [lang, setLang] = useState('en')
  useEffect(() => {
    if (!token) return
    let active = true
    Promise.allSettled([api.warningSigns(token), api.helplines(token)]).then(([signs, helplines]) => {
      if (active) setPublished({
        signs: signs.status === 'fulfilled' ? signs.value : [],
        helplines: helplines.status === 'fulfilled' ? helplines.value : [],
      })
    })
    return () => { active = false }
  }, [token])
  const motherSigns = published.signs.filter((sign) => sign.audience === 'mother')
  const babySigns = published.signs.filter((sign) => sign.audience === 'baby')
  const renderSigns = (items) => <ul className="mb-5 list-disc space-y-2 pl-5 text-sm leading-7 text-[#765363]">
    {items.map((sign, index) => <li key={index} lang={lang}>{sign['text_' + lang]}</li>)}
  </ul>
  return (
    <div className="space-y-5">
      <Section title="When to Seek Medical Help" icon={ShieldAlert}>
        {(published.signs.length > 0 || published.helplines.length > 0) &&
          <label className="mb-4 block text-sm">{uiText('language')} <select aria-label={uiText('safety_guidance_language')} value={lang} onChange={(event) => setLang(event.target.value)}>
            <option value="en">English</option><option value="ta" lang="ta">தமிழ்</option>
          </select></label>}
        {motherSigns.length ? <><h3 className="mb-2 text-sm font-semibold">{uiText('mother')}</h3>{renderSigns(motherSigns)}</> : <p className="mb-5 text-sm leading-7 text-[#765363]">
          Seek urgent medical help for heavy bleeding, breathing
          difficulty, chest pain, seizures, severe headache with
          visual changes, or other sudden serious symptoms.
        </p>}
        {babySigns.length ? <><h3 className="mb-2 text-sm font-semibold">{uiText('baby')}</h3>{renderSigns(babySigns)}</> : <p className="text-sm leading-7 text-[#765363]">
          For a baby, urgent concerns include breathing difficulty,
          poor responsiveness, seizures or difficulty feeding with
          signs of illness.
        </p>}
        <div className="mt-5 rounded-2xl bg-[#FFF0F3] p-5">
          <p className="text-sm font-semibold text-[#7B2346]">
            {auditText('common:sri_lanka_ambulance_service')}
          </p>
          <p className="mt-2 text-3xl font-bold text-[#3A1224]">
            1990
          </p>
          <p className="mt-2 text-xs text-[#977685]">
            {auditText('common:number_display_only_no_automatic_call_or_connection')}
          </p>
        </div>
        {published.helplines.map((line, index) => <div className="mt-4 rounded-2xl bg-[#FFF0F3] p-5" key={index} lang={lang}>
          <p className="font-semibold text-[#7B2346]">{line['name_' + lang]}</p>
          <p className="text-xl font-bold text-[#3A1224]">{line.number}</p>
          <p className="text-sm text-[#765363]">{line['description_' + lang]}</p>
        </div>)}
      </Section>
      <p className="text-xs leading-6 text-[#977685]">
        Warning-sign content requires review by a qualified maternal
        and newborn healthcare professional before public release.
      </p>
    </div>
  )
}

function CalendarTab({ data, month, setMonth, selected, setSelected }) {
  const { t: auditText } = useTranslation()
  const [year, mm] = month.split('-').map(Number)
  const firstDay = new Date(year, mm - 1, 1).getDay()
  const count = new Date(year, mm, 0).getDate()

  function move(direction) {
    const date = new Date(year, mm - 1 + direction, 1)
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    )
    setSelected(null)
  }

  return (
    <Section title={auditText('common:postpartum_calendar')} icon={CalendarDays}>
      <div className="mb-5 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)}>
          <ChevronLeft />
        </button>
        <h3 className="font-semibold text-[#3A1224]">
          {new Date(year, mm - 1, 1).toLocaleDateString('en-GB', {
            month: 'long', year: 'numeric',
          })}
        </h3>
        <button type="button" onClick={() => move(1)}>
          <ChevronRight />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="py-2 text-center text-xs text-[#977685]">
            {day}
          </div>
        ))}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1
          const key = `${month}-${String(day).padStart(2, '0')}`
          const categories = data?.days?.[key] || []

          return (
            <button key={key} type="button"
              onClick={() => setSelected(key)}
              className={`min-h-16 rounded-xl border p-2 text-sm ${
                selected === key
                  ? 'border-[#7B2346] bg-[#FBE6EB]'
                  : 'border-[#F1DEE5] bg-[#FFF9F7]'
              }`}
            >
              {day}
              {categories.length > 0 && (
                <span className="mx-auto mt-2 block h-2 w-2 rounded-full bg-[#7B2346]" />
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-5 rounded-2xl bg-[#FFF6F1] p-5">
          <p className="font-semibold text-[#7B2346]">{selected}</p>
          <p className="mt-2 text-sm text-[#765363]">
            {(data?.days?.[selected] || []).join(', ') ||
              auditText('common:no_recovery_entries_recorded')}
          </p>
        </div>
      )}
    </Section>
  )
}

export default function MyRecovery({ user, onNavigate, onLogout }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const token = user?.access_token
  const [tab, setTab] = useState('overview')
  const [context, setContext] = useState(null)
  const [summary, setSummary] = useState(null)
  const [sleeps, setSleeps] = useState([])
  const [walks, setWalks] = useState([])
  const [bodies, setBodies] = useState([])
  const [exercises, setExercises] = useState([])
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [calendar, setCalendar] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    if (!token) return

    const [contextResult, summaryResult, sleepResult, walkResult, bodyResult, exerciseResult] =
      await Promise.allSettled([
        api.context(token),
        api.summary(token),
        api.sleep(token, dateBefore(6), todayISO()),
        api.walks(token, dateBefore(6), todayISO()),
        api.bodyChecks(token),
        api.exercises(token),
      ])
    const failures = [contextResult, summaryResult, sleepResult, walkResult, bodyResult, exerciseResult]
      .filter((result) => result.status === 'rejected')
    const authFailure = failures.find(({ reason }) => [401, 403].includes(reason?.status))
    const value = (result, fallback) =>
      !authFailure && result.status === 'fulfilled' ? result.value : fallback

    setAccessDenied(Boolean(authFailure))
    setContext(value(contextResult, null))
    setSummary(value(summaryResult, null))
    setSleeps(value(sleepResult, []))
    setWalks(value(walkResult, []))
    setBodies(value(bodyResult, []))
    setExercises(contextResult.status === 'fulfilled' ? value(exerciseResult, []) : [])
    setError((authFailure ?? failures[0])?.reason?.message ?? '')
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!token) return

    const [year, mm] = month.split('-').map(Number)
    api.calendar(token, year, mm)
      .then(setCalendar)
      .catch((err) => setError(err.message))
  }, [token, month, summary])

  function notify(message = 'Saved ✓') {
    setToast(message)
    window.setTimeout(() => setToast(''), 2500)
  }

  async function save(kind, body, id = null) {
    try {
      if (kind === 'sleep') {
        if (id) await api.updateSleep(token, id, body)
        else await api.addSleep(token, body)
      } else if (kind === 'walks') {
        if (id) await api.updateWalk(token, id, body)
        else await api.addWalk(token, body)
      } else {
        if (id) await api.updateBodyCheck(token, id, body)
        else await api.addBodyCheck(token, body)
      }

      await load()
      notify()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function remove(kind, id) {
    if (!window.confirm(uiText('delete_this_entry'))) return

    try {
      if (kind === 'sleep') await api.deleteSleep(token, id)
      else if (kind === 'walks') await api.deleteWalk(token, id)
      else await api.deleteBodyCheck(token, id)

      await load()
      notify('Entry deleted')
    } catch (err) {
      setError(err.message)
    }
  }

  async function completeExercise(body) {
    await api.completeExercise(token, body)
    await load()
    notify('Exercise session saved')
  }

  const todaySuggestions = useMemo(
    () => exercises.filter((e) => !e.locked).slice(0, 3),
    [exercises]
  )

  return (
    <MotherLayout
      user={user}
      activePage="recovery"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        <header>
          <h1 className="font-['Playfair_Display'] text-3xl font-bold text-[#7B2346]">
            {localizeCopy('mother:my_recovery')}
          </h1>
          <p className="mt-2 text-sm text-[#977685]">
            {auditText('common:track_heal_and_regain_your_strength_step_by_step')}
          </p>
        </header>

        <nav className="flex flex-wrap gap-2.5">
          {TABS.map(([id, label]) => (
            <button key={id} type="button"
              onClick={() => setTab(id)}
              className={`min-h-11 rounded-full px-4 py-2.5 text-xs font-semibold sm:px-5 ${
                tab === id
                  ? 'bg-[#7B2346] text-white'
                  : 'bg-[#FBE8ED] text-[#3A1224]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && (
          <div role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
            <button type="button" onClick={load}
              className="ml-4 font-semibold underline"
            >{uiText('retry')}</button>
          </div>
        )}

        {toast && (
          <div role="status"
            className="rounded-xl bg-[#FBE6EB] p-3 text-sm font-semibold text-[#7B2346]"
          >
            {toast}
          </div>
        )}

        {loading ? (
          <div className={CARD}>{auditText('common:loading_recovery_information')}</div>
        ) : !accessDenied && (
          <>
            {context && !context.configured && (
              <Section title={auditText('common:recovery_profile')} icon={Baby}>
                <p className="text-sm leading-7 text-[#765363]">
                  {auditText('common:your_recovery_stage_is_linked_to_your_onboarding_profile_please_complete_your_onboarding_details_before_using_personalized_recovery_guidance')}
                </p>
                <button
                  type="button"
                  className={`${BUTTON} mt-4`}
                  onClick={() => onNavigate?.('settings')}
                >
                  {auditText('common:view_profile_settings')}
                </button>
              </Section>
            )}

            {tab === 'overview' && (
              <div className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-2">
                  <Section title={auditText('common:your_recovery_stage')} icon={Baby}>
                    <div className="rounded-2xl bg-gradient-to-r from-[#FBE6EB] to-[#FFF6F1] p-6">
                      <p className="text-xs text-[#977685]">
                        {auditText('common:your_postpartum_journey')}
                      </p>
                      <h3 className="mt-3 font-['Playfair_Display'] text-3xl font-bold text-[#7B2346]">
                        {context?.configured
                          ? `Week ${context.postpartum_week} · Day ${context.postpartum_day}`
                          : auditText('common:set_up_your_profile')}
                      </h3>
                      <p className="mt-3 text-sm text-[#765363]">
                        {['csection', 'c_section'].includes(context?.delivery_type)
                          ? auditText('common:c_section_recovery')
                          : context?.delivery_type === 'vaginal'
                            ? auditText('common:vaginal_birth_recovery')
                            : auditText('common:your_recovery_journey')}
                      </p>
                    </div>
                  </Section>

                  <Section title={auditText('common:recovery_tips')} icon={Heart}>
                    <p className="text-sm leading-8 text-[#765363]">
                      Give yourself time to rest, keep track of how you
                      feel and follow the care instructions provided
                      by your healthcare team.
                    </p>
                    <button type="button"
                      onClick={() => setTab('care')}
                      className="mt-4 text-sm font-semibold text-[#7B2346]"
                    >
                      {auditText('common:view_birth_recovery_care')}
                    </button>
                  </Section>
                </div>

                {summary?.recent_symptoms && (
                  <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <ShieldAlert className="shrink-0 text-amber-700" />
                    <div>
                      <p className="font-semibold text-amber-900">
                        {auditText('common:symptom_reported')}
                      </p>
                      <p className="mt-1 text-sm text-amber-900">
                        Exercise guidance is paused. Please seek
                        medical advice before resuming.
                      </p>
                    </div>
                  </div>
                )}

                <h2 className="font-['Playfair_Display'] text-2xl font-semibold text-[#3A1224]">
                  {auditText('common:this_week_progress')}
                </h2>

                <div className="grid gap-4 md:grid-cols-3">
                  <Metric icon={Footprints} title={auditText('common:walking_today')}
                    value={`${summary?.today_walk_minutes || 0} min`}
                    subtitle={auditText('common:open_walking_tracker')}
                    onClick={() => setTab('walking')}
                  />
                  <Metric icon={BedDouble} title={auditText('common:sleep_logged_today')}
                    value={`${summary?.today_sleep_hours || 0} h`}
                    subtitle={auditText('common:open_sleep_tracker')}
                    onClick={() => setTab('sleep')}
                  />
                  <Metric icon={Heart} title={auditText('common:body_checks')}
                    value={summary?.body_check_count || 0}
                    subtitle={auditText('common:last_7_days_2')}
                    onClick={() => setTab('body')}
                  />
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <Section title={auditText('common:weekly_walking')} icon={Footprints}>
                    <WeeklyChart rows={walks}
                      valueKey="minutes" label={uiText('minutes')}
                    />
                  </Section>
                  <Section title={auditText('common:weekly_sleep')} icon={BedDouble}>
                    <WeeklyChart rows={sleeps}
                      valueKey="hours" label={localizeCopy('common:hours')}
                    />
                  </Section>
                </div>

                <Section title={auditText('common:next_steps')} icon={Check}>
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      ['Track your sleep', 'sleep'],
                      ['Record how you feel', 'body'],
                      ['View recovery guidance', 'care'],
                    ].map(([label, destination]) => (
                      <button key={label} type="button"
                        onClick={() => setTab(destination)}
                        className="rounded-2xl bg-[#FFF6F1] p-4 text-left text-sm font-semibold text-[#7B2346]"
                      >
                        <Check size={17} className="mb-3" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {todaySuggestions.length > 0 && (
                    <button type="button"
                      onClick={() => setTab('exercises')}
                      className="mt-4 text-sm font-semibold text-[#7B2346]"
                    >
                      {auditText('common:view_available_activities')}
                    </button>
                  )}
                </Section>
              </div>
            )}

            {tab === 'sleep' && (
              <SleepTab rows={sleeps} save={save} remove={remove} />
            )}

            {tab === 'walking' && (
              <WalkingTab rows={walks} summary={summary}
                save={save} remove={remove}
              />
            )}

            {tab === 'body' && (
              <BodyTab rows={bodies} save={save} remove={remove} />
            )}

            {tab === 'exercises' && (
              <ExerciseAccess>
                <ExerciseTab
                  exercises={exercises}
                  reload={completeExercise}
                />
              </ExerciseAccess>
            )}

            {tab === 'care' && <CareTab context={context} />}

            {tab === 'warnings' && <WarningTab key={token} token={token} />}

            {tab === 'calendar' && (
              <CalendarTab data={calendar} month={month}
                setMonth={setMonth}
                selected={selectedDate}
                setSelected={setSelectedDate}
              />
            )}
          </>
        )}
      </div>
    </MotherLayout>
  )
}
