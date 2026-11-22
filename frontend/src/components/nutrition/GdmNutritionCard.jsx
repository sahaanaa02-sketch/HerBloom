import { useTranslation } from 'react-i18next'
import { Activity, CalendarCheck, ShieldCheck } from 'lucide-react'

const statusLabels = {
  yes: 'yes', no: 'no', not_sure: 'nutrition_status_not_sure',
  not_yet: 'nutrition_status_not_yet', booked: 'nutrition_status_booked',
  normal: 'nutrition_status_normal', prediabetes: 'nutrition_status_prediabetes',
  diabetes: 'nutrition_status_diabetes', not_told_yet: 'nutrition_status_not_told_yet',
}

export default function GdmNutritionCard({ data }) {
  const { t: auditText } = useTranslation()
  const status = (value) => auditText('common:' + (statusLabels[value] ?? 'not_recorded'))
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-[#F2DFE5] bg-white p-7">
        <div className="mb-5 flex items-center gap-3">
          <Activity size={27} className="text-[#7B2346]" />

          <h3 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            {auditText('common:gdm_follow_up')}
          </h3>
        </div>

        <div className="space-y-4">
          {[
            [auditText('common:nutrition_gdm_history'), status(data?.gdm_history)],
            [auditText('common:nutrition_glucose_test_status'), status(data?.test_status)],
            [auditText('common:nutrition_recorded_result'), status(data?.result)],
            [
              auditText('common:nutrition_postpartum_week'),
              data?.postpartum_week == null
                ? null
                : auditText('common:nutrition_week_number', { week: data.postpartum_week }),
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 rounded-2xl bg-[#FFF6F1] p-4"
            >
              <span className="text-sm text-[#795C69]">
                {label}
              </span>

              <strong className="text-sm text-[#7B2346]">
                {value || auditText('common:not_recorded')}
              </strong>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl bg-[#FCE9EF] p-7">
          <CalendarCheck
            size={28}
            className="mb-4 text-[#7B2346]"
          />

          <h3 className="font-['Playfair_Display'] text-xl text-[#7B2346]">
            {auditText('common:follow_up_guidance')}
          </h3>

          <p className="mt-3 text-sm leading-7 text-[#795C69]">
            {data?.guidance ||
              'Speak with your healthcare professional about postpartum glucose follow-up.'}
          </p>
        </div>

        <div className="rounded-3xl border border-[#F2DFE5] bg-white p-7">
          <ShieldCheck
            size={27}
            className="mb-4 text-[#7B2346]"
          />

          <h3 className="font-['Playfair_Display'] text-xl text-[#7B2346]">
            {auditText('common:nutrition_education')}
          </h3>

          <p className="mt-3 text-sm leading-7 text-[#795C69]">
            Regular meals, a variety of nutritious foods and
            individualized guidance can support recovery.
            If you have a history of gestational diabetes,
            discuss your dietary needs and testing plan with
            your care team.
          </p>
        </div>
      </div>
    </div>
  )
}