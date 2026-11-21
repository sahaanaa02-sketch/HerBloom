import { useTranslation } from 'react-i18next'
import { useOnboardingCopy } from '../../locales/useOnboardingCopy'

import {
  HeartPulse,
  Droplets,
  Activity,
  Brain,
  ClipboardList,
  CalendarDays,
  Info,
} from 'lucide-react'

import {
  QuestionCard,
  ChoiceButton,
  StepHeading,
  TextField,
} from './OnboardingUI'

import step4Image from '../../assets/onb4.jpg'

export const onboardingImage = step4Image

const conditions = [
  { key: 'anaemia', label: 'Anaemia (low iron)' },
  { key: 'gdm_history', label: 'Gestational diabetes (GDM)' },
  { key: 'high_bp', label: 'High blood pressure' },
  { key: 'thyroid', label: 'Thyroid condition' },
]

export default function Step4Health({
  answers = {},
  updateAnswer,
}) {
  const { t: auditText } = useTranslation()
  const t = useOnboardingCopy()
  const update = (field, value) => {
    updateAnswer(field, value)

    if (field === 'anaemia' && value !== 'yes') {
      updateAnswer('hb_value', null)
      updateAnswer('hb_month', null)
      updateAnswer('iron_prescribed', null)
    }

    if (field === 'gdm_history' && value !== 'yes') {
      updateAnswer('gdm_test_status', null)
      updateAnswer('gdm_result', null)
      updateAnswer('gdm_test_month', null)
    }

    if (field === 'high_bp' && value !== 'yes') {
      updateAnswer('bp_medicine', null)
    }

    if (field === 'gdm_test_status' && value !== 'yes') {
      updateAnswer('gdm_result', null)
      updateAnswer('gdm_test_month', null)
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
          {t(label)}
        </ChoiceButton>
      ))}
    </div>
  )

  const yesNoOptions = [
    ['yes', 'Yes'],
    ['no', 'No'],
    ['not_sure', 'Not sure'],
  ]

  return (
    <div className="space-y-4">
      <StepHeading
        title="Your Health"
        subtitle="A few optional questions help us provide more relevant recovery information."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF1F3] p-4">
        <Info size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-sm leading-6 text-[#765363]">
          Your health information is personal. You can skip
          questions or choose Not sure. HerBloom does not
          provide a diagnosis.
        </p>
      </div>

      <QuestionCard
        icon={HeartPulse}
        title="Have you experienced any of these health conditions?"
        helper="Choose Yes, No, or Not sure for each condition."
      >
        <div className="space-y-3">
          {conditions.map(({ key, label }) => (
            <div
              key={key}
              className="rounded-xl border border-[#F1D9DF] bg-[#FFFBF8] p-3"
            >
              <p className="mb-2 text-sm font-medium text-[#3A1224]">
                {t(label)}
              </p>
              {choices(key, yesNoOptions)}
            </div>
          ))}
        </div>
      </QuestionCard>

      {answers.anaemia === 'yes' && (
        <QuestionCard
          icon={Droplets}
          title="A little more about your anaemia"
          helper="Only share results you already know."
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-[#765363]">
                {auditText('common:latest_haemoglobin_hb_value_in_g_dl')}
              </label>
              <TextField
                type="number"
                value={answers.hb_value ?? ''}
                onChange={(value) =>
                  update('hb_value', value === '' ? null : value)
                }
                placeholder="E.g. 10.5"
                min="0"
                max="30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-[#765363]">
                {auditText('common:month_of_your_hb_test')}
              </label>
              <TextField
                type="month"
                value={answers.hb_month ?? ''}
                onChange={(value) => update('hb_month', value || null)}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[#3A1224]">
                {auditText('common:were_you_prescribed_iron_supplements')}
              </p>
              {choices('iron_prescribed', yesNoOptions)}
            </div>
          </div>
        </QuestionCard>
      )}

      {answers.gdm_history === 'yes' && (
        <QuestionCard
          icon={Activity}
          title="Gestational diabetes follow-up"
          helper="Postpartum glucose follow-up is important after GDM."
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-[#3A1224]">
                {auditText('common:have_you_completed_your_postpartum_glucose_test')}
              </p>
              {choices('gdm_test_status', [
                ['yes', 'Yes'],
                ['booked', 'Booked'],
                ['not_yet', 'Not yet'],
                ['not_sure', 'Not sure'],
              ])}
            </div>

            {answers.gdm_test_status === 'yes' && (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium text-[#3A1224]">
                    {auditText('common:what_was_your_test_result')}
                  </p>
                  {choices('gdm_result', [
                    ['normal', 'Normal'],
                    ['prediabetes', 'Prediabetes'],
                    ['diabetes', 'Diabetes'],
                    ['not_told_yet', 'Not told yet'],
                  ])}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-[#765363]">
                    {auditText('common:month_of_glucose_test')}
                  </label>
                  <TextField
                    type="month"
                    value={answers.gdm_test_month ?? ''}
                    onChange={(value) =>
                      update('gdm_test_month', value || null)
                    }
                  />
                </div>
              </>
            )}
          </div>
        </QuestionCard>
      )}

      {answers.high_bp === 'yes' && (
        <QuestionCard
          icon={HeartPulse}
          title="High blood pressure follow-up"
          helper="This helps us understand whether medication reminders may be relevant."
        >
          <p className="mb-2 text-sm font-medium text-[#3A1224]">
            {auditText('common:are_you_currently_taking_blood_pressure_medicine')}
          </p>
          {choices('bp_medicine', yesNoOptions)}
        </QuestionCard>
      )}

      <QuestionCard
        icon={Brain}
        title="Would you like to share any mental health history?"
        helper="You can choose not to answer."
      >
        {choices('mental_health_history', [
          ['yes', 'Yes'],
          ['no', 'No'],
          ['undisclosed', 'Prefer not to say'],
        ])}
      </QuestionCard>

      <QuestionCard
        icon={ClipboardList}
        title="Is there anything else about your health you'd like us to know?"
        helper="Avoid sharing unnecessary identifying information."
      >
        <textarea
          rows={4}
          maxLength={1000}
          value={answers.other_health_note ?? ''}
          onChange={(event) =>
            update('other_health_note', event.target.value)
          }
          placeholder={t('Share any additional information...')}
          className="w-full resize-none rounded-xl border border-[#E8C3CC] bg-white px-4 py-3 text-sm text-[#3A1224] outline-none focus:border-[#7B2346]"
        />
      </QuestionCard>

      <div className="flex items-start gap-3 rounded-2xl border border-[#E8C3CC] bg-[#FFF6F1] p-4">
        <CalendarDays size={19} className="mt-0.5 shrink-0 text-[#7B2346]" />
        <p className="text-xs leading-6 text-[#765363]">
          HerBloom provides general health education and
          reminders. It does not replace medical advice,
          testing, or treatment.
        </p>
      </div>
    </div>
  )
}
