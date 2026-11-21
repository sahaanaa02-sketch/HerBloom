import { useTranslation } from 'react-i18next'
import { useOnboardingCopy } from '../../locales/useOnboardingCopy'

import {
  Baby,
  CalendarDays,
  Heart,
  UserRound,
  Info,
} from 'lucide-react'

import {
  QuestionCard,
  ChoiceButton,
  StepHeading,
  TextField,
} from './OnboardingUI'

import step1Image from '../../assets/onb1.jpg'

export const onboardingImage = step1Image

export default function Step1AboutBaby({
  answers = {},
  updateAnswer,
  userName = '',
}) {
  const { t: auditText } = useTranslation()
  const t = useOnboardingCopy()
  const today = new Date()

  const maxDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  const birthDate = answers.baby_birth_date
    ? new Date(`${answers.baby_birth_date}T00:00:00`)
    : null

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const isOlderThan12Months =
    birthDate &&
    !Number.isNaN(birthDate.getTime()) &&
    birthDate < twelveMonthsAgo

  return (
    <div className="space-y-4">
      <StepHeading
        title="Welcome to HerBloom"
        subtitle="Let's get to know you. This takes about 2 minutes."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF1F3] p-4">
        <Heart size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-sm leading-6 text-[#765363]">
          {t("Every recovery journey is different. A few details help personalize your experience. You can skip optional questions and update your answers later.")}
        </p>
      </div>

      <QuestionCard
        icon={UserRound}
        title="What would you like us to call you?"
        helper="We'll use this name when welcoming you."
      >
        <TextField
          value={answers.display_name ?? ''}
          onChange={(value) => updateAnswer('display_name', value)}
          placeholder={userName || 'Your preferred name'}
          maxLength={150}
        />
      </QuestionCard>

      <QuestionCard
        icon={CalendarDays}
        title="When was your baby born?"
        required
        helper="This helps us show recovery information for the right stage."
      >
        <TextField
          type="date"
          value={answers.baby_birth_date ?? ''}
          onChange={(value) => updateAnswer('baby_birth_date', value)}
          max={maxDate}
        />
      </QuestionCard>

      {isOlderThan12Months && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#E8C3CC] bg-[#FFF6F1] p-4">
          <Info size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
          <p className="text-sm leading-6 text-[#765363]">
            HerBloom mainly focuses on the first year after birth.
            Some recovery guidance may not match your current stage.
          </p>
        </div>
      )}

      <QuestionCard
        icon={Baby}
        title="How many babies did you have this time?"
        helper="This helps personalize feeding and rest suggestions."
      >
        <div role="radiogroup" aria-label={auditText('common:number_of_babies')} className="flex flex-wrap gap-2">
          {[
            [1, 'One baby'],
            [2, 'Twins'],
            [3, 'Three or more'],
          ].map(([value, label]) => (
            <ChoiceButton
              key={value}
              selected={answers.babies_count === value}
              onClick={() => updateAnswer('babies_count', value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </div>
      </QuestionCard>

      <QuestionCard
        icon={Heart}
        title="Is this your first baby?"
        helper="First-time mothers can receive extra newborn-care basics."
      >
        <div role="radiogroup" aria-label={auditText('common:first_baby')} className="flex flex-wrap gap-2">
          <ChoiceButton
            selected={answers.first_baby === true}
            onClick={() => updateAnswer('first_baby', true)}
          >
            {auditText('common:yes')}
          </ChoiceButton>
          <ChoiceButton
            selected={answers.first_baby === false}
            onClick={() => updateAnswer('first_baby', false)}
          >
            {auditText('common:no')}
          </ChoiceButton>
        </div>
      </QuestionCard>
    </div>
  )
}
