
import {
  Baby,
  Utensils,
  ShieldCheck,
  Salad,
  Heart,
  Info,
} from 'lucide-react'

import {
  QuestionCard,
  ChoiceButton,
  StepHeading,
  TextField,
} from './OnboardingUI'

import step3Image from '../../assets/onb3.jpg'

export const onboardingImage = step3Image

const allergyOptions = [
  'Peanuts',
  'Shellfish/prawns',
  'Fish',
  'Eggs',
  'Milk',
  'Wheat',
  'Soy',
  'Other',
]

const avoidOptions = [
  'Beef',
  'Pork',
  'Very spicy food',
  'Other',
]

export default function Step3Feeding({
  answers = {},
  updateAnswer,
}) {
  const allergies = Array.isArray(answers.allergies)
    ? answers.allergies
    : []

  const avoidFoods = Array.isArray(answers.avoid_foods)
    ? answers.avoid_foods
    : []

  const update = (field, value) => {
    updateAnswer(field, value)
  }

  const selectAllergyStatus = (value) => {
    update('allergy_status', value)

    if (value !== 'yes') {
      update('allergies', [])
      update('allergy_other', '')
    }
  }

  const toggleAllergy = (item) => {
    const updated = allergies.includes(item)
      ? allergies.filter((value) => value !== item)
      : [...allergies, item]

    update('allergies', updated)

    if (!updated.includes('Other')) {
      update('allergy_other', '')
    }
  }

  const toggleAvoidFood = (item) => {
    const updated = avoidFoods.includes(item)
      ? avoidFoods.filter((value) => value !== item)
      : [...avoidFoods, item]

    update('avoid_foods', updated)

    if (!updated.includes('Other')) {
      update('avoid_foods_other', '')
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
        title="Feeding and Food"
        subtitle="Share your feeding and food preferences for more relevant nutrition information."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF1F3] p-4">
        <Info size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-sm leading-6 text-[#765363]">
          Your feeding journey and food choices are personal.
          All questions here are optional.
        </p>
      </div>

      <QuestionCard
        icon={Baby}
        title="How are you feeding your baby?"
        helper="Choose your current feeding method."
      >
        {choices('feeding_method', [
          ['breast', 'Breastfeeding'],
          ['formula', 'Formula feeding'],
          ['both', 'Both'],
          ['undisclosed', 'Prefer not to say'],
        ])}
      </QuestionCard>

      <QuestionCard
        icon={Salad}
        title="Which best describes your diet?"
        helper="This helps us suggest suitable food choices."
      >
        {choices('diet_type', [
          ['all', 'I eat everything'],
          ['pescatarian', 'Fish but no meat'],
          ['vegetarian', 'Vegetarian'],
          ['vegan', 'Vegan'],
        ])}
      </QuestionCard>

      <QuestionCard
        icon={ShieldCheck}
        title="Do you have any food allergies?"
        helper="Select Yes if you'd like to share specific allergies."
      >
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Food allergy status" className="flex flex-wrap gap-2">
            {[
              ['none', 'None'],
              ['yes', 'Yes'],
              ['not_sure', 'Not sure'],
            ].map(([value, label]) => (
              <ChoiceButton
                key={value}
                selected={answers.allergy_status === value}
                onClick={() => selectAllergyStatus(value)}
              >
                {label}
              </ChoiceButton>
            ))}
          </div>

          {answers.allergy_status === 'yes' && (
            <div className="rounded-xl border border-[#F1D9DF] bg-[#FFFBF8] p-3">
              <p className="mb-3 text-xs font-medium text-[#765363]">
                Select all that apply
              </p>

              <div role="group" aria-label="Food allergies" className="flex flex-wrap gap-2">
                {allergyOptions.map((item) => (
                  <ChoiceButton
                    key={item}
                    multiple
                    selected={allergies.includes(item)}
                    onClick={() => toggleAllergy(item)}
                  >
                    {item}
                  </ChoiceButton>
                ))}
              </div>

              {allergies.includes('Other') && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs text-[#765363]">
                    Other allergies
                  </label>
                  <TextField
                    value={answers.allergy_other ?? ''}
                    onChange={(value) => update('allergy_other', value)}
                    placeholder="Please specify"
                    maxLength={250}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </QuestionCard>

      <QuestionCard
        icon={Utensils}
        title="Are there any foods you prefer to avoid?"
        helper="Choose as many as you need, or leave everything unselected."
      >
        <div className="space-y-3">
          <div role="group" aria-label="Foods to avoid" className="flex flex-wrap gap-2">
            {avoidOptions.map((item) => (
              <ChoiceButton
                key={item}
                multiple
                selected={avoidFoods.includes(item)}
                onClick={() => toggleAvoidFood(item)}
              >
                {item}
              </ChoiceButton>
            ))}
          </div>

          {avoidFoods.includes('Other') && (
            <div>
              <label className="mb-1.5 block text-xs text-[#765363]">
                Other foods
              </label>
              <TextField
                value={answers.avoid_foods_other ?? ''}
                onChange={(value) => update('avoid_foods_other', value)}
                placeholder="Other foods you prefer to avoid"
                maxLength={250}
              />
            </div>
          )}
        </div>
      </QuestionCard>

      <div className="flex items-start gap-3 rounded-2xl border border-[#E8C3CC] bg-[#FFF6F1] p-4">
        <Heart size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-xs leading-6 text-[#765363]">
          HerBloom offers general nutrition education, including
          Sri Lankan food options. Follow your healthcare
          professional's guidance for medical dietary needs.
        </p>
      </div>
    </div>
  )
}
