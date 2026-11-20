
import {
  Baby,
  Heart,
  Activity,
  ClipboardList,
  CalendarDays,
  ShieldAlert,
  Info,
} from 'lucide-react'

import {
  QuestionCard,
  ChoiceButton,
  StepHeading,
  TextField,
} from './OnboardingUI'

import step2Image from '../../assets/onb2.jpg'

export const onboardingImage = step2Image

export default function Step2Birth({
  answers = {},
  updateAnswer,
}) {
  const update = (field, value) => {
    updateAnswer(field, value)

    if (field === 'delivery_type') {
      if (value === 'vaginal') {
        updateAnswer('csection_type', null)
      } else {
        updateAnswer('perineal_tear', null)
        updateAnswer('assisted_birth', null)
      }
    }

    if (field === 'exercise_cleared' && value !== 'yes') {
      updateAnswer('exercise_cleared_month', null)
    }

    if (field === 'activity_limits' && value !== 'yes') {
      updateAnswer('activity_limits_note', null)
    }
  }

  const choices = (field, options) => (
    <div
      role="radiogroup"
      aria-label={field.replaceAll('_', ' ')}
      className="flex flex-wrap gap-2"
    >
      {options.map(([value, label]) => (
        <ChoiceButton
          key={value}
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
        title="About Your Birth"
        subtitle="Every birth experience is unique. Let's understand yours."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF1F3] p-4">
        <Info size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-sm leading-6 text-[#765363]">
          Only your delivery type is required. You can skip
          the remaining questions and update them later.
        </p>
      </div>

      <QuestionCard
        icon={Baby}
        title="How did you give birth?"
        helper="This helps us show suitable recovery information."
        required
      >
        {choices('delivery_type', [
          ['vaginal', 'Vaginal birth'],
          ['csection', 'C-section'],
        ])}
      </QuestionCard>

      {answers.delivery_type === 'vaginal' && (
        <>
          <QuestionCard
            icon={Heart}
            title="Did you have stitches or a tear?"
            helper="Choose Not sure if you don't know."
          >
            {choices('perineal_tear', [
              ['yes', 'Yes'],
              ['no', 'No'],
              ['not_sure', 'Not sure'],
            ])}
          </QuestionCard>

          <QuestionCard
            icon={Activity}
            title="Was your birth assisted?"
            helper="For example, using a vacuum or forceps."
          >
            {choices('assisted_birth', [
              ['none', 'No'],
              ['vacuum', 'Vacuum'],
              ['forceps', 'Forceps'],
              ['not_sure', 'Not sure'],
            ])}
          </QuestionCard>
        </>
      )}

      {answers.delivery_type === 'csection' && (
        <QuestionCard
          icon={ClipboardList}
          title="Was your C-section planned or unplanned?"
          helper="Choose the answer that best describes your birth."
        >
          {choices('csection_type', [
            ['planned', 'Planned'],
            ['unplanned', 'Unplanned / emergency'],
            ['undisclosed', 'Prefer not to say'],
          ])}
        </QuestionCard>
      )}

      <QuestionCard
        icon={Activity}
        title="Has a doctor or midwife cleared you to start postpartum exercises?"
        helper="This helps us provide appropriate activity guidance."
      >
        <div className="space-y-3">
          {choices('exercise_cleared', [
            ['yes', 'Yes'],
            ['not_yet', 'Not yet'],
            ['not_sure', 'Not sure'],
          ])}

          {answers.exercise_cleared === 'yes' && (
            <div>
              <label className="mb-1.5 block text-xs text-[#765363]">
                When were you cleared?
              </label>
              <TextField
                type="month"
                value={answers.exercise_cleared_month ?? ''}
                onChange={(value) => update('exercise_cleared_month', value || null)}
              />
            </div>
          )}
        </div>
      </QuestionCard>

      <QuestionCard
        icon={CalendarDays}
        title="Did your doctor give you any activity restrictions?"
        helper="For example, avoiding heavy lifting."
      >
        <div className="space-y-3">
          {choices('activity_limits', [
            ['yes', 'Yes'],
            ['no', 'No'],
            ['not_sure', 'Not sure'],
          ])}

          {answers.activity_limits === 'yes' && (
            <textarea
              rows={3}
              maxLength={1000}
              value={answers.activity_limits_note ?? ''}
              onChange={(event) =>
                update('activity_limits_note', event.target.value)
              }
              placeholder="Tell us about your restrictions"
              className="w-full resize-none rounded-xl border border-[#E8C3CC] bg-white px-4 py-3 text-sm outline-none focus:border-[#7B2346]"
            />
          )}
        </div>
      </QuestionCard>

      <QuestionCard
        icon={Heart}
        title="How is your body feeling today?"
        helper="A quick check-in about how you're feeling."
      >
        {choices('body_feeling', [
          ['okay', 'Feeling okay'],
          ['discomfort', 'Some pain or discomfort'],
          ['worried', 'Something worries me'],
        ])}
      </QuestionCard>

      {answers.body_feeling === 'worried' && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} className="shrink-0 text-amber-700" />
            <div>
              <h3 className="font-semibold text-amber-900">
                Your wellbeing matters
              </h3>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Please speak with your doctor or midwife about
                recovery concerns. Seek urgent medical care
                for severe or emergency symptoms.
              </p>
              <a
                href="tel:1990"
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#7B2346] px-5 text-sm text-white"
              >
                Call 1990 Ambulance
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
