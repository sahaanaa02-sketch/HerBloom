import { Activity, CalendarCheck, ShieldCheck } from 'lucide-react'

export default function GdmNutritionCard({ data }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-[#F2DFE5] bg-white p-7">
        <div className="mb-5 flex items-center gap-3">
          <Activity size={27} className="text-[#7B2346]" />

          <h3 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            GDM Follow-up
          </h3>
        </div>

        <div className="space-y-4">
          {[
            ['GDM History', data?.gdm_history],
            ['Glucose Test Status', data?.test_status],
            ['Recorded Result', data?.result],
            [
              'Postpartum Week',
              data?.postpartum_week == null
                ? null
                : `Week ${data.postpartum_week}`,
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
                {value || 'Not recorded'}
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
            Follow-up Guidance
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
            Nutrition Education
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