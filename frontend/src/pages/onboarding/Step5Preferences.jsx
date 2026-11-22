import { useTranslation } from 'react-i18next'
import { useOnboardingCopy } from '../../locales/useOnboardingCopy'

import {
  Languages,
  Bell,
  Moon,
  Phone,
  ShieldCheck,
  Heart,
  Info,
  Droplets,
  BedDouble,
  Smile,
  Utensils,
  Activity,
  Pill,
  CalendarDays,
} from 'lucide-react'

import {
  QuestionCard,
  ChoiceButton,
  OnboardingChoices,
  StepHeading,
  TextField,
} from './OnboardingUI'

import step5Image from '../../assets/onb5.jpg'

export const onboardingImage = step5Image

const reminderOptions = [
  { value: 'water', label: 'Water', icon: Droplets },
  { value: 'rest', label: 'Rest', icon: BedDouble },
  { value: 'mood', label: 'Mood check-in', icon: Smile },
  { value: 'meals', label: 'Meals', icon: Utensils },
  { value: 'exercises', label: 'Exercises', icon: Activity },
  { value: 'medicine', label: 'Medicine', icon: Pill },
  { value: 'appointments', label: 'Appointments', icon: CalendarDays },
]

export default function Step5Preferences({
  answers = {},
  updateAnswer,
  healthAnswers = {},
  onEditStep,
  version,
  preferencesOnly = false,
}) {
  const { t: auditText } = useTranslation()
  const t = useOnboardingCopy()
  const reminders = Array.isArray(answers.reminders)
    ? answers.reminders
    : []

  const canShowMedicine =
    healthAnswers.iron_prescribed === 'yes' ||
    healthAnswers.bp_medicine === 'yes'

  const availableReminders = reminderOptions.filter(
    (item) => item.value !== 'medicine' || canShowMedicine
  )

  const selectedReminders = canShowMedicine
    ? reminders
    : reminders.filter((item) => item !== 'medicine')

  const update = (field, value) => {
    updateAnswer(field, value)
  }

  const toggleReminder = (value) => {
    const updated = selectedReminders.includes(value)
      ? selectedReminders.filter((item) => item !== value)
      : [...selectedReminders, value]

    update('reminders', updated)
  }

  const selectedLabels = (values, labels) => (values ?? []).map((value) => t(labels[value])).join(', ')
  const review = [
    ['About Your Baby', [
      ['Preferred name', answers.display_name],
      ["Baby's birth date", answers.baby_birth_date],
      ['Number of babies', answers.babies_count],
      ['First baby', answers.first_baby === null ? null : t(answers.first_baby ? 'Yes' : 'No')],
    ]],
    ['About Your Birth', [
      ['Delivery type', answers.delivery_type && t(answers.delivery_type === 'vaginal' ? 'Vaginal birth' : 'C-section')],
      ['How was your C-section arranged?', answers.delivery_type === 'csection' && answers.csection_type
        ? t({ planned: 'Planned', unplanned: 'Unplanned / emergency', undisclosed: 'Prefer not to say' }[answers.csection_type])
        : null],
      ['Exercise clearance', answers.exercise_cleared && t({ yes: 'Yes', not_yet: 'Not yet', not_sure: 'Not sure' }[answers.exercise_cleared])],
    ]],
    ['Feeding and Food', [
      ['Feeding method', answers.feeding_method && t({ breast: 'Breastfeeding', formula: 'Formula feeding', both: 'Both', undisclosed: 'Prefer not to say' }[answers.feeding_method])],
      ['Food allergies', answers.allergies?.length ? answers.allergies.map((item) => t(item)).join(', ') : null],
      ['Foods to avoid', answers.avoid_foods?.length ? answers.avoid_foods.map((item) => t(item)).join(', ') : null],
    ]],
    ['Your Health', [
      ...[['Anaemia', answers.anaemia], ['Gestational diabetes (GDM)', answers.gdm_history]].map(([label, value]) =>
        [label, value && t({ yes: 'Yes', no: 'No', not_sure: 'Not sure' }[value])]),
      ['Haemoglobin', answers.anaemia === 'yes' ? answers.hb_value : null],
    ]],
  ]

  const choices = (field, options) => (
    <div
      role="radiogroup"
      aria-label={t(field === 'language' ? 'Which language would you prefer?' : 'May HerBloom use your profile information to personalize AI guidance?')}
      className="flex flex-wrap gap-2"
    >
      {options.map(([value, label]) => (
        <ChoiceButton
          key={String(value)}
          selected={answers[field] === value}
          onClick={() => update(field, value)}
        >
          {label}
        </ChoiceButton>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <StepHeading
        title={version === 2 ? (preferencesOnly ? "Preferences and Concerns" : "Review and Consent") : "Almost Done!"}
        subtitle={version !== 2 || preferencesOnly ? "Choose how you'd like HerBloom to support you." : undefined}
      />

      {!preferencesOnly && <section aria-labelledby="onboarding-review-heading" className="space-y-3">
        <h2 id="onboarding-review-heading" className="text-base font-semibold text-[#3A1224]">
          {t('Review your answers')}
        </h2>
        {(version === 2 ? [
          ['About You and Baby', review[0][1], 1],
          ['Delivery and Recovery', [...review[1][1], ['Have you had a C-section before this birth?',
            answers.previous_csection && t({ yes: 'Yes', no: 'No', not_sure: 'Not sure' }[answers.previous_csection])]], 2],
          ['Health and Feeding', [...review[2][1], ...review[3][1],
            ['Postpartum complications', selectedLabels(answers.postpartum_complications, {
              bleeding: 'Bleeding', wound: 'Wound or stitches', infection: 'Infection',
              blood_pressure: 'Blood pressure', other: 'Other',
            })]], 3],
          ['Preferences and Concerns', [
            ['Reminder preferences', selectedReminders.map((value) => t(reminderOptions.find((option) => option.value === value)?.label ?? value)).join(', ')],
            ['Daily reminder time', answers.daily_reminder_time],
            ['Recovery concerns', selectedLabels(answers.recovery_concerns, {
              comfort: 'Physical comfort', movement: 'Movement', rest: 'Rest',
              feeding: 'Feeding', wellbeing: 'Emotional wellbeing', other: 'Other',
            })],
            ['Features you want to use', selectedLabels(answers.feature_interests, {
              recovery: 'Recovery tracking', nutrition: 'Nutrition', wellbeing: 'Emotional wellbeing',
              education: 'Learning and care', reminders: 'Reminders',
            })],
            ['Quiet hours start', answers.quiet_from], ['Quiet hours end', answers.quiet_to],
            ['Which language would you prefer?', answers.language && t(answers.language === 'ta' ? 'தமிழ்' : 'English')],
          ], 4],
        ] : review.map(([title, details], index) => [title, details, index + 1])).map(([title, details, target]) => (
          <div key={title} className="rounded-xl border border-[#F1D9DF] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[#3A1224]">{t(title)}</h3>
              <button
                type="button"
                onClick={() => onEditStep(target)}
                aria-label={t('Edit {{step}}', { step: t(title) })}
                className="min-h-11 rounded-full border border-[#E8C3CC] px-4 text-sm font-semibold text-[#7B2346] hover:bg-[#FFF6F1]"
              >
                {t('Edit')}
              </button>
            </div>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[#765363]">{t(label)}</dt>
                  <dd className="break-words font-medium text-[#3A1224]">{value || t('Not provided')}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>}

      {(version !== 2 || preferencesOnly) && <>
      {preferencesOnly && <>
      <QuestionCard icon={Heart} title="Recovery concerns">
        <OnboardingChoices field="recovery_concerns" title="Recovery concerns" options={[["comfort", "Physical comfort"], ["movement", "Movement"], ["rest", "Rest"], ["feeding", "Feeding"], ["wellbeing", "Emotional wellbeing"], ["other", "Other"]]}
          answers={answers} updateAnswer={updateAnswer} multiple />
      </QuestionCard>
      <QuestionCard icon={Activity} title="Features you want to use">
        <OnboardingChoices field="feature_interests" title="Features you want to use" options={[["recovery", "Recovery tracking"], ["nutrition", "Nutrition"], ["wellbeing", "Emotional wellbeing"], ["education", "Learning and care"], ["reminders", "Reminders"]]}
          answers={answers} updateAnswer={updateAnswer} multiple />
      </QuestionCard>
      <QuestionCard icon={Bell} title="Daily reminder time">
        <TextField type="time" label="Daily reminder time" value={answers.daily_reminder_time ?? ''}
          onChange={(value) => update('daily_reminder_time', value || null)} />
      </QuestionCard>
      </>}

      <div className="flex items-start gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF1F3] p-4">
        <Heart size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-sm leading-6 text-[#765363]">
          {t("Just a few preferences before your HerBloom journey begins. These settings are optional and can be updated later.")}
        </p>
      </div>

      <QuestionCard
        icon={Languages}
        title="Which language would you prefer?"
        helper="Choose the language you'd like to use in HerBloom."
      >
        {choices('language', [
          ['en', 'English'],
          ['ta', 'தமிழ்'],
        ])}
      </QuestionCard>

      <QuestionCard
        icon={Bell}
        title="What would you like reminders for?"
        helper="Select any that are useful, or leave them unselected."
      >
        <div className="space-y-3">
          <div
            role="group"
            aria-label={t("Reminder preferences")}
            className="flex flex-wrap gap-2"
          >
            {availableReminders.map((item) => {
              const Icon = item.icon

              return (
                <ChoiceButton
                  key={item.value}
                  multiple
                  selected={selectedReminders.includes(item.value)}
                  onClick={() => toggleReminder(item.value)}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon size={15} />
                    {t(item.label)}
                  </span>
                </ChoiceButton>
              )
            })}
          </div>

          <p className="text-xs leading-5 text-[#765363]">
            {selectedReminders.length === 0
              ? auditText('common:no_reminders_selected')
              : `${selectedReminders.length} reminder preference${
                  selectedReminders.length === 1 ? '' : 's'
                } selected.`}
          </p>

          <p className="text-xs leading-5 text-[#765363]">
            {t("Reminders are optional. You can change them in Settings.")}
          </p>
        </div>
      </QuestionCard>

      <QuestionCard
        icon={Moon}
        title="When would you prefer not to receive reminders?"
        helper="Set quiet hours to protect your rest."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#765363]">
              {t('Quiet hours start')}
            </label>
            <TextField
              type="time"
              value={answers.quiet_from ?? ''}
              onChange={(value) => update('quiet_from', value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#765363]">
              {t('Quiet hours end')}
            </label>
            <TextField
              type="time"
              value={answers.quiet_to ?? ''}
              onChange={(value) => update('quiet_to', value)}
            />
          </div>
        </div>
      </QuestionCard>

      <QuestionCard
        icon={Phone}
        title="Would you like to add a trusted care contact?"
        helper="This could be a family member or another trusted person."
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#765363]">
              {t('Contact name')}
            </label>
            <TextField
              value={answers.care_contact_name ?? ''}
              onChange={(value) => update('care_contact_name', value)}
              placeholder="Enter contact name"
              maxLength={150}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#765363]">
              {t('Phone number')}
            </label>
            <TextField
              type="tel"
              value={answers.care_contact_phone ?? ''}
              onChange={(value) => update('care_contact_phone', value)}
              placeholder="E.g. 0771234567"
              maxLength={20}
            />
          </div>
        </div>
      </QuestionCard>

      </>}

      {version === 2 && !preferencesOnly && (
        <QuestionCard icon={ShieldCheck} required
          title="Do you agree to save these answers to set up your HerBloom profile?">
          <OnboardingChoices field="onboarding_consent"
            title="Do you agree to save these answers to set up your HerBloom profile?"
            options={[[true, 'Yes, I agree'], [false, 'No, thanks']]} answers={answers} updateAnswer={updateAnswer} />
        </QuestionCard>
      )}
      {!preferencesOnly && <>
      <QuestionCard
        icon={ShieldCheck}
        title="May HerBloom use your profile information to personalize AI guidance?"
        helper="You can change your choice in Privacy Settings."
      >
        <div className="space-y-3">
          {choices('consent_ai_profile', [
            [true, 'Yes, I agree'],
            [false, 'No, thanks'],
          ])}

          <p className="text-xs leading-5 text-[#765363]">
            {auditText('common:without_consent_your_personal_profile_information_should_not_be_shared_with_the_ai_assistant_general_educational_content_remains_available')}
          </p>
        </div>
      </QuestionCard>

      <div className="flex items-start gap-3 rounded-2xl border border-[#E8C3CC] bg-[#FFF6F1] p-4">
        <Info size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-xs leading-6 text-[#765363]">
          {auditText('common:notification_delivery_requires_browser_permission_and_a_connected_notification_service_your_ai_privacy_choice_must_also_be_respected_by_the_backend')}
        </p>
      </div>
      </>}
    </div>
  )
}
