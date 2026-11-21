import { useTranslation } from 'react-i18next'

import { Baby, CalendarDays, Heart, Sparkles } from 'lucide-react'

export default function StageCard({ stage, user }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const day = stage?.postpartum_day
  const week = stage?.postpartum_week
  const delivery = stage?.delivery_type

  const deliveryLabel =
    delivery === 'csection' || delivery === 'c_section'
      ? 'C-section Recovery'
      : delivery === 'vaginal'
        ? 'Vaginal Birth Recovery'
        : 'Your Recovery'

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-[#FFF0E9] via-[#FFF6F1] to-[#F8DCE3] p-7 shadow-sm">
      <div className="relative z-10 max-w-xl">
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#A66A77]">
          <Sparkles size={16} />
          {localizeCopy('mother:your_recovery_journey')}
        </div>

        <h2 className="font-['Playfair_Display'] text-3xl font-semibold text-[#3A1224]">
          {localizeCopy('common:one_gentle_day_at_a_time')}
        </h2>

        <p className="mt-3 text-sm leading-7 text-[#765363]">
          {auditText('common:welcome_back')}{user?.name ? `, ${user.name}` : ''}{auditText('common:your_recovery_deserves_patience_care_and_support')}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
            <CalendarDays size={18} className="text-[#7B2346]" />
            <span className="text-sm font-semibold text-[#3A1224]">
              {day != null ? `Day ${day}` : auditText('common:day_unavailable')}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
            <Baby size={18} className="text-[#7B2346]" />
            <span className="text-sm font-semibold text-[#3A1224]">
              {week != null ? `Week ${week}` : auditText('common:week_unavailable')}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
            <Heart size={18} className="text-[#7B2346]" />
            <span className="text-sm font-semibold text-[#3A1224]">
              {deliveryLabel}
            </span>
          </div>
        </div>
      </div>

      <Heart
        size={135}
        strokeWidth={0.7}
        className="pointer-events-none absolute -right-7 -top-7 text-[#E9A7B8]/40"
      />
    </section>
  )
}
