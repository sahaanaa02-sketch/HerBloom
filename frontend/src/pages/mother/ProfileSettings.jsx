import { MyPlan } from '../../components/mother/EntitlementPanels'

import { useEffect, useState } from 'react'
import {
  UserRound, Baby, HeartPulse, Activity, Dumbbell,
  Bell, Languages, ShieldCheck, ChevronRight, ArrowLeft,
  Save, Pencil, CheckCircle2, AlertCircle,
} from 'lucide-react'

import MotherLayout from '../../components/mother/MotherLayout'
import { getProfile, updateProfile } from '../../services/profileApi'

const SECTIONS = [
  { id: 'information', title: 'My Information', description: 'Personal details and preferred name', icon: UserRound },
  { id: 'recovery', title: 'Recovery Profile', description: 'Your baby, birth and feeding details', icon: Baby },
  { id: 'health', title: 'Health Conditions', description: 'Health history and personal care details', icon: HeartPulse },
  { id: 'gdm', title: 'GDM Follow-up', description: 'Postpartum glucose test information', icon: Activity },
  { id: 'exercise', title: 'Exercise Clearance', description: 'Activity limits and medical clearance', icon: Dumbbell },
  { id: 'reminders', title: 'Reminders & Notifications', description: 'Personal reminders and quiet hours', icon: Bell },
  { id: 'language', title: 'Language', description: 'English and Tamil preferences', icon: Languages },
  { id: 'privacy', title: 'Privacy & Account', description: 'Consent, security and account controls', icon: ShieldCheck },
]

const INPUT =
  'w-full rounded-xl border border-[#EBD7DF] bg-white px-4 py-3 text-sm text-[#593849] outline-none focus:border-[#7B2346] focus:ring-2 focus:ring-[#F6D3DB]'

const YNU = [
  ['yes', 'Yes'], ['no', 'No'], ['not_sure', 'Not sure'],
]

const REMINDERS = [
  ['water', 'Water'],
  ['rest', 'Rest & Sleep'],
  ['mood', 'Mood Check-in'],
  ['meals', 'Meals'],
  ['exercises', 'Exercises'],
  ['medicine', 'Medicine'],
  ['appointments', 'Appointments'],
  ['gdm_test', 'Postpartum glucose test'],
]

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#6B4053]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-2 block text-xs text-[#A07D8B]">
          {hint}
        </span>
      )}
    </label>
  )
}

function Select({ label, value, change, options }) {
  return (
    <Field label={label}>
      <select value={value ?? ''} onChange={e => change(e.target.value)} className={INPUT}>
        <option value="">Select an option</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </Field>
  )
}

function TextInput({ label, value, change, type = 'text', ...props }) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => change(e.target.value)}
        className={INPUT}
        {...props}
      />
    </Field>
  )
}

function TextArea({ label, value, change }) {
  return (
    <Field label={label}>
      <textarea
        rows={4}
        maxLength={1000}
        value={value ?? ''}
        onChange={e => change(e.target.value)}
        className={INPUT}
      />
    </Field>
  )
}

function calculateWeek(value) {
  if (!value) return null
  const birth = new Date(`${value}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  const days = Math.floor((
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
    Date.UTC(birth.getFullYear(), birth.getMonth(), birth.getDate())
  ) / 86400000)
  return days < 0 ? null : Math.floor(days / 7) + 1
}

function buildForm(profile = {}, user = {}) {
  const keys = [
    'display_name', 'baby_birth_date', 'delivery_type',
    'perineal_tear', 'assisted_birth', 'csection_type',
    'feeding_method', 'anaemia', 'gdm_history', 'high_bp',
    'thyroid', 'hb_value', 'hb_month', 'iron_prescribed',
    'bp_medicine', 'mental_health_history', 'other_health_note',
    'gdm_test_status', 'gdm_result', 'gdm_test_month',
    'exercise_cleared', 'exercise_cleared_month',
    'activity_limits', 'activity_limits_note',
    'care_contact_name', 'care_contact_phone',
  ]

  const form = {}
  keys.forEach(key => { form[key] = profile[key] ?? '' })

  return {
    ...form,
    full_name: profile.full_name || user.name || user.full_name || '',
    babies_count: profile.babies_count ?? 1,
    first_baby: profile.first_baby == null ? '' : String(profile.first_baby),
    mental_health_history: profile.mental_health_history || 'undisclosed',
    exercise_cleared: profile.exercise_cleared || 'not_yet',
    reminders: profile.reminders ?? ['water', 'mood'],
    quiet_from: profile.quiet_from || '22:00',
    quiet_to: profile.quiet_to || '06:00',
    language: profile.language || 'en',
    consent_ai_profile: profile.consent_ai_profile ?? false,
  }
}

function SettingsForm({ section, form, change, email }) {
  const get = key => form[key]
  const set = key => value => change(key, value)
  const select = (key, label, options) => (
    <Select label={label} value={get(key)} change={set(key)} options={options} />
  )
  const input = (key, label, type = 'text', props = {}) => (
    <TextInput label={label} type={type} value={get(key)} change={set(key)} {...props} />
  )
  const month = (key, label) => input(key, label, 'month')

  if (section === 'information') {
    return (
      <div className="space-y-5">
        {input('full_name', 'Full Name', 'text', { required: true, maxLength: 150 })}
        {input('display_name', 'Preferred Name', 'text', { maxLength: 150 })}
        <Field label="Email Address" hint="Changing your email requires separate verification.">
          <input className={`${INPUT} bg-[#F9F3F5]`} value={email || ''} readOnly />
        </Field>
      </div>
    )
  }

  if (section === 'recovery') {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {input('baby_birth_date', "Baby's Birth Date", 'date', {
          required: true,
          max: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
        })}
        {select('babies_count', 'Number of Babies', [
          ['1', '1'], ['2', '2'], ['3', '3'],
        ])}
        {select('first_baby', 'Is This Your First Baby?', [
          ['true', 'Yes'], ['false', 'No'],
        ])}
        {select('delivery_type', 'Delivery Type', [
          ['vaginal', 'Vaginal Birth'], ['csection', 'C-section'],
        ])}
        {select('feeding_method', 'Feeding Method', [
          ['breast', 'Breastfeeding'], ['formula', 'Formula Feeding'],
          ['both', 'Both'], ['undisclosed', 'Prefer not to say'],
        ])}
        {get('delivery_type') === 'vaginal' && (
          <>
            {select('perineal_tear', 'Perineal Tear', YNU)}
            {select('assisted_birth', 'Assisted Birth', [
              ['none', 'None'], ['vacuum', 'Vacuum'],
              ['forceps', 'Forceps'], ['not_sure', 'Not sure'],
            ])}
          </>
        )}
        {get('delivery_type') === 'csection' &&
          select('csection_type', 'C-section Type', [
            ['planned', 'Planned'], ['unplanned', 'Unplanned'],
            ['undisclosed', 'Prefer not to say'],
          ])
        }
      </div>
    )
  }

  if (section === 'health') {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {select('anaemia', 'Anaemia', YNU)}
        {select('gdm_history', 'Gestational Diabetes History', YNU)}
        {select('high_bp', 'High Blood Pressure', YNU)}
        {select('thyroid', 'Thyroid Condition', YNU)}

        {get('anaemia') === 'yes' && (
          <>
            {input('hb_value', 'Haemoglobin (g/dL)', 'number', {
              min: 0.1, max: 30, step: 0.1,
            })}
            {month('hb_month', 'Haemoglobin Test Month')}
            {select('iron_prescribed', 'Iron Prescribed', YNU)}
          </>
        )}

        {get('high_bp') === 'yes' &&
          select('bp_medicine', 'BP Medicine Prescribed', YNU)}

        {select('mental_health_history', 'Mental Health History', [
          ['yes', 'Yes'], ['no', 'No'],
          ['undisclosed', 'Prefer not to say'],
        ])}

        <div className="md:col-span-2">
          <TextArea label="Other Health Notes" value={get('other_health_note')} change={set('other_health_note')} />
        </div>
      </div>
    )
  }

  if (section === 'gdm') {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {select('gdm_history', 'Gestational Diabetes History', YNU)}
        {get('gdm_history') === 'yes' && (
          <>
            {select('gdm_test_status', 'Postpartum Glucose Test', [
              ['yes', 'Completed'], ['booked', 'Booked'],
              ['not_yet', 'Not yet'], ['not_sure', 'Not sure'],
            ])}
            {get('gdm_test_status') === 'yes' && (
              <>
                {select('gdm_result', 'Reported Test Result', [
                  ['normal', 'Normal'], ['prediabetes', 'Prediabetes'],
                  ['diabetes', 'Diabetes'], ['not_told_yet', 'Not told yet'],
                ])}
                {month('gdm_test_month', 'Test Month')}
              </>
            )}
          </>
        )}
        <p className="md:col-span-2 rounded-xl bg-[#FFF6F1] p-4 text-xs leading-6 text-[#8D697A]">
          These are self-reported details. HerBloom does not diagnose diabetes.
          Follow your healthcare professional's advice about tests and results.
        </p>
      </div>
    )
  }

  if (section === 'exercise') {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {select('exercise_cleared', 'Healthcare Professional Clearance', [
          ['yes', 'Yes'], ['not_yet', 'Not yet'], ['not_sure', 'Not sure'],
        ])}
        {get('exercise_cleared') === 'yes' &&
          month('exercise_cleared_month', 'Clearance Month')}
        {select('activity_limits', 'Activity Restrictions', YNU)}
        {get('activity_limits') === 'yes' && (
          <div className="md:col-span-2">
            <TextArea label="Activity Restriction Notes" value={get('activity_limits_note')} change={set('activity_limits_note')} />
          </div>
        )}
        <p className="md:col-span-2 rounded-xl bg-[#FFF6F1] p-4 text-xs leading-6 text-[#8D697A]">
          Follow individual medical advice before returning to physical activities.
        </p>
      </div>
    )
  }

  if (section === 'reminders') {
    const selected = get('reminders') || []
    return (
      <div className="space-y-7">
        <div>
          <h3 className="mb-4 text-sm font-semibold text-[#7B2346]">
            Choose Your Reminders
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {REMINDERS.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#F0DEE4] bg-[#FFFBFC] p-4">
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={() => {
                    const next = selected.includes(value)
                      ? selected.filter(v => v !== value)
                      : [...selected, value]
                    change('reminders', next)
                  }}
                  className="h-4 w-4 accent-[#7B2346]"
                />
                <span className="text-sm text-[#6B4053]">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {input('quiet_from', 'Quiet Hours Start', 'time', { required: true })}
          {input('quiet_to', 'Quiet Hours End', 'time', { required: true })}
          {input('care_contact_name', 'Care Contact Name', 'text', { maxLength: 150 })}
          {input('care_contact_phone', 'Care Contact Phone', 'tel', { maxLength: 30 })}
        </div>
        <p className="rounded-xl bg-[#FFF6F1] p-4 text-xs leading-6 text-[#8D697A]">
          Reminder preferences will be saved to your profile.
          Automatic notifications require a separate notification service.
        </p>
      </div>
    )
  }

  if (section === 'language') {
    return (
      <div className="space-y-4">
        {[
          ['en', 'English', 'Use English as your preferred language'],
          ['ta', 'தமிழ்', 'தமிழை விருப்ப மொழியாகத் தேர்வு செய்யவும்'],
        ].map(([value, title, description]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-5 ${
              get('language') === value
                ? 'border-[#7B2346] bg-[#FFF6F1]'
                : 'border-[#F0DEE4]'
            }`}
          >
            <input
              type="radio"
              name="language"
              checked={get('language') === value}
              onChange={() => change('language', value)}
              className="h-4 w-4 accent-[#7B2346]"
            />
            <div>
              <p className="font-semibold text-[#7B2346]">{title}</p>
              <p className="mt-1 text-xs text-[#987887]">{description}</p>
            </div>
          </label>
        ))}
        <p className="text-xs leading-6 text-[#987887]">
          Your language preference will be saved.
          Full application translation will be connected separately.
        </p>
      </div>
    )
  }

  if (section === 'privacy') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#F0DEE4] p-5">
          <h3 className="font-semibold text-[#7B2346]">Account Information</h3>
          <p className="mt-3 text-xs text-[#987887]">Registered Email</p>
          <p className="mt-1 break-all text-sm font-medium">{email}</p>
        </div>

        <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-[#F0DEE4] bg-[#FFFBFC] p-5">
          <input
            type="checkbox"
            checked={Boolean(get('consent_ai_profile'))}
            onChange={e => change('consent_ai_profile', e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#7B2346]"
          />
          <div>
            <p className="text-sm font-semibold text-[#7B2346]">
              Allow AI Profile Personalization
            </p>
            <p className="mt-2 text-xs leading-6 text-[#987887]">
              Store your preference for whether relevant profile information
              may be used to personalize AI support. Saving this setting
              does not send data to an AI service.
            </p>
          </div>
        </label>

        <div className="rounded-2xl bg-[#FFF6F1] p-5">
          <h3 className="text-sm font-semibold text-[#7B2346]">
            Account Security
          </h3>
          <p className="mt-2 text-xs leading-6 text-[#987887]">
            Password change, data export and account deletion will be
            available after secure backend endpoints are implemented.
          </p>
        </div>
      </div>
    )
  }

  return null
}

function createPayload(section, form) {
  const optional = key => form[key] || null

  switch (section) {
    case 'information':
      if (!form.full_name?.trim()) {
        throw new Error('Full name is required.')
      }
      return {
        full_name: form.full_name.trim(),
        display_name: form.display_name?.trim() || null,
      }

    case 'recovery':
      if (!form.baby_birth_date || !form.delivery_type) {
        throw new Error('Baby birth date and delivery type are required.')
      }
      return {
        baby_birth_date: form.baby_birth_date,
        babies_count: Number(form.babies_count),
        first_baby: form.first_baby === '' ? null : form.first_baby === 'true',
        delivery_type: form.delivery_type,
        feeding_method: optional('feeding_method'),
        ...(form.delivery_type === 'vaginal'
          ? {
              perineal_tear: optional('perineal_tear'),
              assisted_birth: optional('assisted_birth'),
            }
          : { csection_type: optional('csection_type') }),
      }

    case 'health':
      return {
        anaemia: optional('anaemia'),
        gdm_history: optional('gdm_history'),
        high_bp: optional('high_bp'),
        thyroid: optional('thyroid'),
        hb_value: form.anaemia === 'yes' && form.hb_value !== ''
          ? Number(form.hb_value) : null,
        hb_month: form.anaemia === 'yes' ? optional('hb_month') : null,
        iron_prescribed: form.anaemia === 'yes' ? optional('iron_prescribed') : null,
        bp_medicine: form.high_bp === 'yes' ? optional('bp_medicine') : null,
        mental_health_history: form.mental_health_history || 'undisclosed',
        other_health_note: optional('other_health_note'),
      }

    case 'gdm':
      return {
        gdm_history: optional('gdm_history'),
        gdm_test_status: form.gdm_history === 'yes'
          ? optional('gdm_test_status') : null,
        gdm_result: form.gdm_history === 'yes' && form.gdm_test_status === 'yes'
          ? optional('gdm_result') : null,
        gdm_test_month: form.gdm_history === 'yes' && form.gdm_test_status === 'yes'
          ? optional('gdm_test_month') : null,
      }

    case 'exercise':
      return {
        exercise_cleared: form.exercise_cleared || 'not_yet',
        exercise_cleared_month: form.exercise_cleared === 'yes'
          ? optional('exercise_cleared_month') : null,
        activity_limits: optional('activity_limits'),
        activity_limits_note: form.activity_limits === 'yes'
          ? optional('activity_limits_note') : null,
      }

    case 'reminders':
      return {
        reminders: form.reminders || [],
        quiet_from: form.quiet_from || '22:00',
        quiet_to: form.quiet_to || '06:00',
        care_contact_name: form.care_contact_name?.trim() || null,
        care_contact_phone: form.care_contact_phone?.trim() || null,
      }

    case 'language':
      return { language: form.language || 'en' }

    case 'privacy':
      return { consent_ai_profile: Boolean(form.consent_ai_profile) }

    default:
      throw new Error('Unknown settings section.')
  }
}

export default function ProfileSettings({ user, onLogout, onNavigate }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({})
  const [section, setSection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [displayName, setDisplayName] = useState(user?.name || 'Mother')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const result = await getProfile(user.access_token)
        if (!active) return
        const data = result.profile || {}
        setProfile(data)
        setForm(buildForm(data, user))
        setDisplayName(data.full_name || user.name || 'Mother')
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [user.access_token])

  function change(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError('')
    setSuccess('')
  }

  function openSection(id) {
    setSection(id)
    setForm(buildForm(profile || {}, { ...user, name: displayName }))
    setError('')
    setSuccess('')
  }

  async function saveSection(event) {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = createPayload(section, form)
      const result = await updateProfile(user.access_token, payload)
      const updated = result.profile
      const name = updated.full_name || displayName

      setProfile(updated)
      setDisplayName(name)
      setForm(buildForm(updated, { ...user, name }))
      setSuccess('Your changes have been saved successfully.')
    } catch (err) {
      setError(err.message || 'Unable to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const week = calculateWeek(profile?.baby_birth_date)
  const activeSection = SECTIONS.find(item => item.id === section)
  const ActiveIcon = activeSection?.icon

  return (
    <MotherLayout
      user={{ ...user, name: displayName }}
      onLogout={onLogout}
      activePage="settings"
      onNavigate={page => {
        if (page === 'settings') {
          openSection(null)
        } else {
          onNavigate?.(page)
        }
      }}
    >
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#D09A66]">
          MY HERBLOOM
        </p>
        <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#7B2346] md:text-4xl">
          Profile & Settings
        </h1>
        <p className="mt-2 text-sm text-[#967384]">
          Manage your profile, health details and app preferences.
        </p>
      </div>

      {loading ? (
        <div className="rounded-3xl bg-white p-12 text-center text-[#7B2346]">
          Loading your profile...
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="mb-5 flex gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <CheckCircle2 size={18} className="shrink-0" />
              {success}
            </div>
          )}

          {!section ? (
            <div className="grid gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
              <div className="h-fit rounded-3xl border border-[#F0DEE4] bg-white p-7 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#F6D3DB] text-4xl font-semibold text-[#7B2346]">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <h2 className="font-['Playfair_Display'] text-2xl font-semibold text-[#7B2346]">
                  {profile?.display_name || displayName}
                </h2>
                <p className="mt-2 text-sm text-[#987887]">
                  Mother{week !== null ? ` • Week ${week}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => openSection('information')}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#7B2346] px-6 py-3 text-sm font-medium text-white hover:bg-[#68203C]"
                >
                  <Pencil size={15} />
                  Edit Profile
                </button>
                <div className="mt-7 border-t border-[#F2E5E9] pt-5 text-left">
                  <p className="text-xs text-[#A1808D]">Your recovery journey</p>
                  <p className="mt-2 text-sm font-medium text-[#7B2346]">
                    {profile?.delivery_type === 'csection'
                      ? 'C-section Recovery'
                      : profile?.delivery_type === 'vaginal'
                        ? 'Vaginal Birth Recovery'
                        : 'Recovery details not provided'}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-[#F0DEE4] bg-white p-5 shadow-sm md:p-7">
                <h2 className="mb-5 font-['Playfair_Display'] text-2xl font-semibold text-[#7B2346]">
                  Your Settings
                </h2>
                <div className="space-y-3">
                  <MyPlan token={user?.access_token} language={profile?.language} />
                  {SECTIONS.map(item => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openSection(item.id)}
                        className="group flex w-full items-center gap-4 rounded-2xl border border-[#F3E6EA] bg-[#FFFBFC] p-4 text-left transition hover:border-[#E8BDCB] hover:bg-[#FFF6F1]"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FBE8EE] text-[#7B2346]">
                          <Icon size={21} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[#7B2346]">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-[#A0808D]">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight size={19} className="shrink-0 text-[#B68E9D]" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl">
              <button
                type="button"
                onClick={() => openSection(null)}
                className="mb-5 flex items-center gap-2 text-sm font-medium text-[#7B2346]"
              >
                <ArrowLeft size={17} />
                Back to Settings
              </button>
              <div className="rounded-3xl border border-[#F0DEE4] bg-white p-6 shadow-sm md:p-9">
                <div className="mb-8 flex items-center gap-4 border-b border-[#F2E5E9] pb-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FBE8EE] text-[#7B2346]">
                    {ActiveIcon && <ActiveIcon size={26} />}
                  </div>
                  <div>
                    <h2 className="font-['Playfair_Display'] text-2xl font-semibold text-[#7B2346]">
                      {activeSection?.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#9B7A89]">
                      {activeSection?.description}
                    </p>
                  </div>
                </div>

                <form onSubmit={saveSection} className="space-y-6">
                  <SettingsForm
                    section={section}
                    form={form}
                    change={change}
                    email={user.email}
                  />
                  <div className="flex justify-end border-t border-[#F2E5E9] pt-6">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-full bg-[#7B2346] px-7 py-3 text-sm font-semibold text-white hover:bg-[#68203C] disabled:opacity-60"
                    >
                      <Save size={17} />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </MotherLayout>
  )
}
