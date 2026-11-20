
import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
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

// Same dimensions as Login.jsx
const CARD_HEIGHT = 'min(90vh, 810px)'
const CARD_RATIO = 1.55

// Each image is used ONLY as the left section background
const STEP_INFO = [
  {
    title: 'About Your Baby',
    image: image1,
    position: 'center center',
  },
  {
    title: 'About Your Birth',
    image: image2,
    position: 'center center',
  },
  {
    title: 'Feeding and Food',
    image: image3,
    position: 'center center',
  },
  {
    title: 'Your Health',
    image: image4,
    position: 'center center',
  },
  {
    title: 'Your Preferences',
    image: image5,
    position: 'center center',
  },
]

const INITIAL_ANSWERS = {
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

function buildPayload(step, answers) {
  const payload = {}

  STEP_FIELDS[step - 1].forEach((field) => {
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

  return payload
}

function validateStep(step, answers) {
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

  return ''
}

export default function Onboarding({
  user,
  initialProfile,
  onLogout,
  onComplete,
}) {
  const [step, setStep] = useState(initialProfile.onboarding_step)
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
  const scrollRef = useRef(null)

  const token = user?.access_token
  const currentInfo = STEP_INFO[step - 1]
  const finished = progressState.onboarding_done
  const progress = finished ? 100 : (progressState.onboarding_step - 1) * 20

  const updateAnswer = (field, value) => {
    setAnswers((previous) => ({
      ...previous,
      [field]: value,
    }))
    setError('')
  }

  const goToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }

  const handleBack = () => {
    if (submissionInFlight.current || step === 1) return

    setStep((previous) => previous - 1)
    setError('')
    goToTop()
  }

  const handleContinue = async () => {
    if (submissionInFlight.current || finished) return

    const validationError = validateStep(step, answers)

    if (validationError) {
      setError(validationError)
      goToTop()
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
      const payload = buildPayload(step, answers)

      if (step < 5) {
        const savedProgress = await saveOnboardingStep(step, payload, token)
        setProgressState(savedProgress)
        setStep(step + 1)
        goToTop()
      } else {
        const payloadKey = JSON.stringify(payload)

        if (savedPreferencesPayload.current !== payloadKey) {
          const savedProgress = await saveOnboardingStep(step, payload, token)
          setProgressState(savedProgress)
          savedPreferencesPayload.current = payloadKey
        }

        const completion = await completeOnboarding(token)

        if (!completion.onboarding_done) {
          throw new Error('Onboarding completion was not confirmed. Please try again.')
        }

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
      goToTop()
    } finally {
      submissionInFlight.current = false
      setSaving(false)
    }
  }

  const renderStep = () => {
    const props = { answers, updateAnswer }

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
        return <Step3Feeding {...props} />

      case 4:
        return <Step4Health {...props} />

      case 5:
        return (
          <Step5Preferences
            {...props}
            healthAnswers={answers}
          />
        )

      default:
        return null
    }
  }

  if (finished) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-4 font-['Poppins']">
        <div className="w-full max-w-2xl rounded-3xl border border-[#F1D9DF] bg-white p-6 shadow-xl sm:p-10">
          <OnboardingSuccess
            userName={
              answers.display_name ||
              user?.name ||
              ''
            }
            reminders={answers.reminders}
            onGoToDashboard={onComplete}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-3 font-['Poppins'] sm:p-5">

      <style>{`
        .hb-onboarding-card {
          width: 100%;
          max-width: 480px;
          min-height: 600px;
        }

        @media (min-width: 768px) {
          .hb-onboarding-card {
            height: ${CARD_HEIGHT};
            min-height: 0;
            max-width: none;
            width: min(
              96vw,
              calc(${CARD_HEIGHT} * ${CARD_RATIO})
            );
          }
        }
      `}</style>

      {/* MAIN CARD */}
      <div className="hb-onboarding-card flex flex-col overflow-hidden rounded-[28px] border border-[#F1D9DF] bg-white shadow-xl md:flex-row">

        {/* LEFT 40% SECTION - BACKGROUND IMAGE ONLY */}
        <aside
          className="relative hidden h-full w-[40%] shrink-0 overflow-hidden bg-[#F6D3DB] md:block"
          style={{
            backgroundImage: `url("${currentInfo.image}")`,
            backgroundSize: 'cover',
            backgroundPosition: currentInfo.position,
            backgroundRepeat: 'no-repeat',
          }}
          role="img"
          aria-label={currentInfo.title}
        />

        {/* RIGHT 60% SECTION - QUESTIONS */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#FFFCFB]">

          {/* HEADER */}
          <header className="shrink-0 border-b border-[#F1D9DF] bg-white px-5 pb-4 pt-5 sm:px-7">
            <div className="flex items-start justify-between gap-3">

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7B2346]">
                  HerBloom Onboarding
                </p>
                <p className="mt-1 text-xs text-[#765363]">
                  Personalize your experience
                </p>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E8C3CC] px-4 text-sm text-[#7B2346] transition hover:bg-[#FFF6F1]"
              >
                <LogOut size={16} />
                Log out
              </button>

            </div>

            {/* PROGRESS */}
            <div className="mt-5 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-[#7B2346]">
                Step {step} of 5
              </span>
              <span className="text-[#765363]">
                {progress}% complete
              </span>
            </div>

            <div
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-2 h-2 overflow-hidden rounded-full bg-[#F6D3DB]"
            >
              <div
                className="h-full rounded-full bg-[#7B2346] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </header>

          {/* SCROLLABLE QUESTIONS */}
          <main
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7"
          >
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {renderStep()}
          </main>

          {/* FOOTER */}
          <footer className="shrink-0 border-t border-[#F1D9DF] bg-white px-5 py-4 sm:px-7">
            <div className="flex items-center justify-between gap-3">

              <button
                type="button"
                disabled={step === 1 || saving}
                onClick={handleBack}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E8C3CC] px-5 text-sm text-[#7B2346] transition hover:bg-[#FFF6F1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={17} />
                Back
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={handleContinue}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#7B2346] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#651C39] disabled:opacity-60"
              >
                {saving
                  ? 'Saving...'
                  : step === 5
                    ? 'Finish'
                    : 'Continue'}

                {!saving && <ArrowRight size={17} />}
              </button>

            </div>

            <p className="mt-3 flex items-center justify-center gap-2 text-center text-[11px] text-[#8B6B77]">
              <ShieldCheck size={14} />
              Your information is handled with care.
            </p>
          </footer>

        </div>
      </div>
    </div>
  )
}
