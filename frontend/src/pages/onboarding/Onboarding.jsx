import './OnboardingIllustration.css'
import { i18n, normalizeLanguage } from '../../locales/i18n'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useOnboardingCopy } from '../../locales/useOnboardingCopy'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LogOut,
  ShieldCheck,
} from 'lucide-react'

import Step1AboutBaby, {
  onboardingImage as image1,
} from './Step1AboutBaby'

import Step2Birth, {
  onboardingImage as image2,
} from './Step2Birth'

import Step3Feeding, {
  onboardingImage as image3,
} from './Step3Feeding'

import Step4Health, {
  onboardingImage as image4,
} from './Step4Health'

import Step5Preferences, {
  onboardingImage as image5,
} from './Step5Preferences'

import OnboardingSuccess from './OnboardingSuccess'

import {
  completeOnboarding,
  saveOnboardingStep,
} from '../../services/onboardingApi'

const STEP_INFO = [
  {
    title: 'About Your Baby',
    image: image1,
  },
  {
    title: 'About Your Birth',
    image: image2,
  },
  {
    title: 'Feeding and Food',
    image: image3,
  },
  {
    title: 'Your Health',
    image: image4,
  },
  {
    title: 'Your Preferences',
    image: image5,
  },
]

const V2_TITLES = ['About You and Baby', 'Delivery and Recovery', 'Health and Feeding', 'Preferences and Concerns', 'Review and Consent']

const INITIAL_ANSWERS = {
  previous_csection: null,
  postpartum_complications: [],
  recovery_concerns: [],
  feature_interests: [],
  daily_reminder_time: null,
  onboarding_consent: false,
  display_name: '',
  baby_birth_date: '',
  babies_count: null,
  first_baby: null,

  delivery_type: null,
  perineal_tear: null,
  assisted_birth: null,
  csection_type: null,
  exercise_cleared: null,
  exercise_cleared_month: null,
  activity_limits: null,
  activity_limits_note: '',
  body_feeling: null,

  feeding_method: null,
  diet_type: null,
  allergy_status: null,
  allergies: [],
  allergy_other: '',
  avoid_foods: [],
  avoid_foods_other: '',

  anaemia: null,
  gdm_history: null,
  high_bp: null,
  thyroid: null,
  hb_value: null,
  hb_month: null,
  iron_prescribed: null,
  gdm_test_status: null,
  gdm_result: null,
  gdm_test_month: null,
  bp_medicine: null,
  mental_health_history: null,
  other_health_note: '',

  language: null,
  reminders: [],
  quiet_from: '',
  quiet_to: '',
  care_contact_name: '',
  care_contact_phone: '',
  consent_ai_profile: null,
}

const STEP_FIELDS = [
  [
    'display_name',
    'baby_birth_date',
    'babies_count',
    'first_baby',
  ],
  [
    'delivery_type',
    'perineal_tear',
    'assisted_birth',
    'csection_type',
    'exercise_cleared',
    'exercise_cleared_month',
    'activity_limits',
    'activity_limits_note',
  ],
  [
    'feeding_method',
    'diet_type',
    'allergies',
    'avoid_foods',
  ],
  [
    'anaemia',
    'gdm_history',
    'high_bp',
    'thyroid',
    'hb_value',
    'hb_month',
    'iron_prescribed',
    'gdm_test_status',
    'gdm_result',
    'gdm_test_month',
    'bp_medicine',
    'mental_health_history',
    'other_health_note',
  ],
  [
    'language',
    'reminders',
    'quiet_from',
    'quiet_to',
    'care_contact_name',
    'care_contact_phone',
    'consent_ai_profile',
  ],
]

const V2_STEP_FIELDS = [
  STEP_FIELDS[0],
  [...STEP_FIELDS[1], 'previous_csection'],
  [...STEP_FIELDS[2], ...STEP_FIELDS[3], 'postpartum_complications'],
  [...STEP_FIELDS[4].filter((field) => field !== 'consent_ai_profile'), 'recovery_concerns', 'feature_interests', 'daily_reminder_time'],
  ['onboarding_consent', 'consent_ai_profile'],
]

// The feeding UI uses labels, while the API stores stable option values.
const FOOD_OPTION_VALUES = {
  allergies: {
    Peanuts: 'peanuts',
    'Shellfish/prawns': 'shellfish',
    Fish: 'fish',
    Eggs: 'eggs',
    Milk: 'milk',
    Wheat: 'wheat',
    Soy: 'soy',
    Other: 'other',
  },
  avoid_foods: {
    Beef: 'beef',
    Pork: 'pork',
    'Very spicy food': 'very_spicy',
    Other: 'other',
  },
}

function buildPayload(step, answers, version) {
  const payload = {}

  const fields = version === 2 ? V2_STEP_FIELDS : STEP_FIELDS
  fields[step - 1].forEach((field) => {
    const value = answers[field]

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      const options = FOOD_OPTION_VALUES[field]
      payload[field] = options
        ? value.map((label) => options[label] ?? label)
        : value
    }
  })

  if (version === 2 && step === 2 && answers.first_baby === true) payload.previous_csection = null
  if (version === 2 && step === 4 && answers.iron_prescribed !== 'yes' && answers.bp_medicine !== 'yes') {
    payload.reminders = payload.reminders.filter((reminder) => reminder !== 'medicine')
  }
  if (step === 3 && (
    answers.allergy_status === null ||
    answers.allergy_status === 'not_sure' ||
    (answers.allergy_status === 'yes' && answers.allergies.length === 0)
  )) {
    payload.allergies = null
  }

  return payload
}

function validateStep(step, answers, version) {
  if (step === 1) {
    if (!answers.baby_birth_date) {
      return "Please select your baby's birth date."
    }

    const date = new Date(
      `${answers.baby_birth_date}T00:00:00`
    )

    if (Number.isNaN(date.getTime())) {
      return 'Please enter a valid birth date.'
    }

    if (date > new Date()) {
      return 'Birth date cannot be in the future.'
    }
  }

  if (step === 2 && !answers.delivery_type) {
    return 'Please select your delivery type.'
  }

  if (step === 5 && version === 2 && answers.onboarding_consent !== true) {
    return 'Please confirm your onboarding consent.'
  }

  if (step === 5 && typeof answers.consent_ai_profile !== 'boolean') {
    return 'Please choose whether to share your profile with the AI assistant.'
  }

  return ''
}

export default function Onboarding({
  user,
  initialProfile,
  onLogout,
  onComplete,
}) {
  const t = useOnboardingCopy()
  const version = initialProfile.onboarding_version === 2 ? 2 : 1
  const [step, setStep] = useState(initialProfile.onboarding_resume_step ?? initialProfile.onboarding_step)
  const [progressState, setProgressState] = useState({
    onboarding_step: initialProfile.onboarding_step,
    onboarding_done: initialProfile.onboarding_done,
  })

  const [answers, setAnswers] = useState(() => {
    const savedAnswers = { ...INITIAL_ANSWERS }

    for (const field of Object.keys(INITIAL_ANSWERS)) {
      const value = initialProfile.profile[field]
      if (value != null) savedAnswers[field] = value
    }

    if (version === 2 ? !savedAnswers.onboarding_consent : initialProfile.profile.reminders == null) {
      savedAnswers.consent_ai_profile = null
    }

    for (const [field, options] of Object.entries(FOOD_OPTION_VALUES)) {
      const labels = Object.fromEntries(
        Object.entries(options).map(([label, value]) => [value, label])
      )
      if (Array.isArray(savedAnswers[field])) {
        savedAnswers[field] = savedAnswers[field].map(
          (value) => labels[value] ?? value
        )
      }
    }

    if (savedAnswers.allergies.length > 0) {
      savedAnswers.allergy_status = 'yes'
    }

    return savedAnswers
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submissionInFlight = useRef(false)
  const savedPreferencesPayload = useRef(null)
  const questionsRef = useRef(null)
  const focusNextHeading = useRef(false)
  const returnToReview = useRef(false)

  const token = user?.access_token
  const steps = version === 2 ? STEP_INFO.map((info, index) => ({ ...info, title: V2_TITLES[index] })) : STEP_INFO
  const currentInfo = steps[step - 1]
  const finished = progressState.onboarding_done
  const progress = finished ? 100 : (progressState.onboarding_step - 1) * 20

  const updateAnswer = (field, value) => {
    if (field === 'language') i18n.changeLanguage(normalizeLanguage(value))
    setAnswers((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'first_baby' && value === true ? { previous_csection: null } : {}),
    }))
    setError('')
  }

  useEffect(() => {
    if (!focusNextHeading.current) return
    focusNextHeading.current = false
    const heading = questionsRef.current?.querySelector('h1')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [step, finished])

  useEffect(() => {
    if (!error) return
    questionsRef.current?.querySelector('[role="alert"]')?.scrollIntoView({
      block: 'nearest',
      behavior: 'instant',
    })
  }, [error])

  const handleBack = () => {
    if (submissionInFlight.current || step === 1) return

    returnToReview.current = false
    focusNextHeading.current = true
    setStep((previous) => previous - 1)
    setError('')
  }

  const handleContinue = async () => {
    if (submissionInFlight.current || finished) return

    const validationError = validateStep(step, answers, version)

    if (validationError) {
      setError(validationError)
      return
    }

    if (!token) {
      setError('Please log in again.')
      return
    }

    submissionInFlight.current = true
    setSaving(true)
    setError('')

    try {
      const payload = buildPayload(step, answers, version)

      if (step < 5) {
        const savedProgress = await saveOnboardingStep(step, payload, token, version)
        setProgressState(savedProgress)
        savedPreferencesPayload.current = null
        if (version === 2) setAnswers((previous) => ({ ...previous, onboarding_consent: false }))
        focusNextHeading.current = true
        setStep(returnToReview.current ? 5 : step + 1)
        returnToReview.current = false
      } else {
        const payloadKey = JSON.stringify(payload)

        if (savedPreferencesPayload.current !== payloadKey) {
          const savedProgress = await saveOnboardingStep(step, payload, token, version)
          setProgressState(savedProgress)
          savedPreferencesPayload.current = payloadKey
        }

        const completion = await completeOnboarding(token)

        if (!completion.onboarding_done) {
          throw new Error('Onboarding completion was not confirmed. Please try again.')
        }

        focusNextHeading.current = true
        setProgressState((previous) => ({
          ...previous,
          onboarding_done: completion.onboarding_done,
        }))
      }
    } catch (err) {
      setError(
        err.message ||
        'Could not save your answers. Please try again.'
      )
    } finally {
      submissionInFlight.current = false
      setSaving(false)
    }
  }

  const renderStep = () => {
    const props = { answers, updateAnswer, version }

    switch (step) {
      case 1:
        return (
          <Step1AboutBaby
            {...props}
            userName={user?.name || ''}
          />
        )

      case 2:
        return <Step2Birth {...props} />

      case 3:
        return version === 2 ? (
          <div className="space-y-4">
            <Step3Feeding {...props} />
            <Step4Health {...props} />
          </div>
        ) : <Step3Feeding {...props} />

      case 4:
        return version === 2
          ? <Step5Preferences {...props} healthAnswers={answers} preferencesOnly />
          : <Step4Health {...props} />

      case 5:
        return (
          <Step5Preferences
            {...props}
            healthAnswers={answers}
            onEditStep={(target) => {
              returnToReview.current = true
              focusNextHeading.current = true
              setError('')
              setStep(target)
            }}
          />
        )

      default:
        return null
    }
  }

  useEffect(() => {
    if (!finished) return

    const timer = window.setTimeout(() => onComplete(answers), 6000)
    return () => window.clearTimeout(timer)
  }, [answers, finished, onComplete])

  const completedSteps = progress / 20

  return (
    <div className="flex min-h-screen items-start justify-center bg-[#FFF6F1] p-3 font-['Poppins'] sm:p-6">
      <div className="hb-mother-onboarding grid w-full max-w-[1200px] rounded-[28px] border border-[#F1D9DF] bg-[#FFFCFB] shadow-xl md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <aside className="hb-onboarding-illustration" data-step={step}>
          <div className="hb-onboarding-artwork">
            <img
              src={currentInfo.image}
              width={step === 1 ? 1276 : 1264}
              height={step === 1 ? 816 : 843}
              alt={t('HerBloom onboarding illustration for {{title}}', { title: t(currentInfo.title) })}
            />
          </div>
        </aside>

        {/* RIGHT 60% SECTION - QUESTIONS */}
        <div className="flex min-w-0 flex-col">

          {/* HEADER */}
          <header className="shrink-0 rounded-t-[27px] border-b md:rounded-tl-none border-[#F1D9DF] bg-white px-5 pb-4 pt-5 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-3">

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7B2346]">
                  {t('HerBloom Onboarding')}
                </p>
                <p className="mt-1 text-xs text-[#765363]">
                  {t('Personalize your experience')}
                </p>
              </div>

              <LanguageSwitcher />

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E8C3CC] px-4 text-sm text-[#7B2346] transition hover:bg-[#FFF6F1]"
              >
                <LogOut size={16} />
                {t('Log out')}
              </button>

            </div>

            {/* PROGRESS */}
            <div className="mt-5 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-[#7B2346]">
                {t('Step {{step}} of 5', { step })}
              </span>
              <span aria-live="polite" className="text-[#765363]">
                {t('{{progress}}% complete', { progress })}
              </span>
            </div>

            <ol aria-label={t('Onboarding steps')} className="mt-3 flex items-center">
              {steps.map(({ title }, index) => {
                const complete = index < completedSteps
                const current = !finished && index === step - 1
                return (
                  <li key={title} aria-current={current ? 'step' : undefined}
                    className="flex flex-1 items-center last:flex-none"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      current ? 'border-[#7B2346] bg-white text-[#7B2346] ring-2 ring-[#7B2346] ring-offset-2'
                        : complete ? 'border-[#7B2346] bg-[#7B2346] text-white'
                          : 'border-[#E8C3CC] bg-[#FFF6F1] text-[#765363]'
                    }`}>
                      <span className="sr-only">{complete ? t('{{title}}, completed', { title: t(title) }) : t(title)}</span>
                      {complete && !current ? <Check size={15} aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}
                    </span>
                    {index < steps.length - 1 && (
                      <span aria-hidden="true" className={`mx-2 h-0.5 flex-1 ${complete ? 'bg-[#7B2346]' : 'bg-[#F6D3DB]'}`} />
                    )}
                  </li>
                )
              })}
            </ol>
          </header>

          <main
            ref={questionsRef}
            className="flex-1 px-4 py-5 sm:px-7 sm:py-6"
          >
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {t(error)}
              </div>
            )}

            {finished ? (
              <OnboardingSuccess
                userName={answers.display_name || user?.name}
                onGoToDashboard={() => onComplete(answers)}
              />
            ) : (
              <fieldset disabled={saving} className="min-w-0">
                {renderStep()}
              </fieldset>
            )}
          </main>

          {/* FOOTER */}
          {!finished && <footer className="shrink-0 rounded-b-[27px] border-t border-[#F1D9DF] bg-white md:rounded-bl-none px-4 py-3 sm:px-7 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">

              <button
                type="button"
                disabled={step === 1 || saving}
                onClick={handleBack}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E8C3CC] px-5 text-sm text-[#7B2346] transition hover:bg-[#FFF6F1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={17} />
                {t('Back')}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={handleContinue}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#7B2346] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#651C39] disabled:opacity-60"
              >
                {saving
                  ? t('Saving...')
                  : step === 5
                    ? t('Finish')
                    : t('Continue')}

                {!saving && <ArrowRight size={17} />}
              </button>

            </div>

            <p className="mt-3 flex items-center justify-center gap-2 text-center text-[11px] text-[#8B6B77]">
              <ShieldCheck size={14} />
              {t('Your information is handled with care.')}
            </p>
          </footer>}

        </div>
      </div>
    </div>
  )
}
