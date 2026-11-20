
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
}) {
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

  const choices = (field, options) => (
    <div
      role="radiogroup"
      aria-label={field.replaceAll('_', ' ')}
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
        title="Almost Done!"
        subtitle="Choose how you'd like HerBloom to support you."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF1F3] p-4">
        <Heart size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-sm leading-6 text-[#765363]">
          Just a few preferences before your HerBloom journey
          begins. These settings are optional and can be
          updated later.
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
            aria-label="Reminder preferences"
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
                    {item.label}
                  </span>
                </ChoiceButton>
              )
            })}
          </div>

          <p className="text-xs leading-5 text-[#765363]">
            {selectedReminders.length === 0
              ? 'No reminders selected.'
              : `${selectedReminders.length} reminder preference${
                  selectedReminders.length === 1 ? '' : 's'
                } selected.`}
          </p>

          <p className="text-xs leading-5 text-[#765363]">
            Reminders are optional. You can change them
            in Settings.
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
              Quiet hours start
            </label>
            <TextField
              type="time"
              value={answers.quiet_from ?? ''}
              onChange={(value) => update('quiet_from', value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#765363]">
              Quiet hours end
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
              Contact name
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
              Phone number
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
            Without consent, your personal profile information
            should not be shared with the AI assistant.
            General educational content remains available.
          </p>
        </div>
      </QuestionCard>

      <div className="flex items-start gap-3 rounded-2xl border border-[#E8C3CC] bg-[#FFF6F1] p-4">
        <Info size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-xs leading-6 text-[#765363]">
          Notification delivery requires browser permission
          and a connected notification service. Your AI privacy
          choice must also be respected by the backend.
        </p>
      </div>
    </div>
  )
}
