import { useTranslation } from 'react-i18next'

import {
  CalendarDays,
  Moon,
  Footprints,
  Droplets,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react'

function displayValue(value, suffix = '') {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${value}${suffix}`
}

export default function WeeklySnapshot({
  summary,
  onOpenSummary,
}) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  // Supports the existing dashboard weekly response
  // and the new /reports/weekly response.
  const data = summary?.data ?? summary ?? {}

  const daysWithData =
    data?.completeness?.days_with_data ?? null

  const daysInWeek =
    data?.completeness?.days_in_week ?? 7

  const percentage =
    data?.completeness?.percentage ?? null

  const walkingDays =
    data?.walking?.days_walked ??
    data?.walking_days ??
    null

  const sleepHours =
    data?.sleep?.average_hours ??
    data?.average_sleep_hours ??
    null

  const walkingMinutes =
    data?.walking?.total_minutes ??
    data?.total_walk_minutes ??
    null

  const hydration =
    data?.hydration?.average_glasses ?? null

  const cards = [
    {
      title: 'Walking Days',
      value: displayValue(walkingDays),
      subtitle: 'Days with walking recorded',
      Icon: Footprints,
      color: '#7B2346',
      background: '#FBE8EE',
    },
    {
      title: 'Average Sleep',
      value: displayValue(sleepHours, ' hrs'),
      subtitle: 'Based on recorded nights',
      Icon: Moon,
      color: '#7A5B9A',
      background: '#F1EAF8',
    },
    {
      title: 'Walking Total',
      value: displayValue(walkingMinutes, ' min'),
      subtitle: 'Total recorded walking time',
      Icon: CalendarDays,
      color: '#A66B32',
      background: '#FFF0DC',
    },
    {
      title: 'Average Hydration',
      value: displayValue(hydration, ' glasses'),
      subtitle: 'On days with water entries',
      Icon: Droplets,
      color: '#337C92',
      background: '#E5F4F8',
    },
  ]

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#F1DEE5] bg-white shadow-sm">

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F4E5EA] bg-gradient-to-r from-[#FFF6F1] via-[#FFF9F7] to-white px-6 py-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[#F6D3DB] p-3 text-[#7B2346]">
            <Sparkles size={21} />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B77C91]">
              {auditText('common:your_week_at_a_glance')}
            </p>

            <h2 className="font-['Playfair_Display'] text-2xl font-semibold text-[#3A1224]">
              {uiText('this_week_s_snapshot')}
            </h2>

            <p className="mt-1 text-xs text-[#987B86]">
              {auditText('common:a_gentle_reflection_on_your_recorded_activities')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSummary}
          className="inline-flex items-center gap-2 rounded-full bg-[#7B2346] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#641D39]"
        >
          {uiText('view_full_summary')}
          <ArrowUpRight size={16} />
        </button>
      </div>

      <div className="p-6">

        <div className="mb-5 rounded-2xl border border-[#F3E1E7] bg-[#FFF9F7] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[#3A1224]">
                {uiText('weekly_tracking')}
              </p>

              <p className="mt-1 text-xs text-[#987B86]">
                {daysWithData === null
                  ? auditText('common:open_your_weekly_summary_to_see_your_tracking_details')
                  : `You recorded information on ${daysWithData} of ${daysInWeek} days.`}
              </p>
            </div>

            {percentage !== null && (
              <span className="text-lg font-bold text-[#7B2346]">
                {percentage}%
              </span>
            )}
          </div>

          <div
            role="progressbar"
            aria-label={auditText('common:weekly_tracking_completeness')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage ?? 0}
            className="h-2.5 overflow-hidden rounded-full bg-[#F1DCE3]"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7B2346] to-[#D9A25B] transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, percentage ?? 0))}%`,
              }}
            />
          </div>

          <p className="mt-3 text-[11px] text-[#A08590]">
            {auditText('common:tracking_completeness_reflects_recorded_information_not_your_health_or_recovery_progress')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.Icon

            return (
              <div
                key={card.title}
                className="rounded-2xl border border-[#F3E5E9] bg-white p-4 transition hover:shadow-md"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: card.background,
                    color: card.color,
                  }}
                >
                  <Icon size={21} />
                </div>

                <p className="text-xs font-medium text-[#967887]">
                  {card.title}
                </p>

                <p className="mt-2 text-2xl font-semibold text-[#3A1224]">
                  {card.value}
                </p>

                <p className="mt-2 text-[11px] leading-5 text-[#A58A95]">
                  {card.subtitle}
                </p>
              </div>
            )
          })}
        </div>

        {!summary && (
          <p className="mt-5 text-center text-xs text-[#987B86]">
            {auditText('common:your_recorded_weekly_information_will_appear_here_when_available')}
          </p>
        )}

      </div>
    </section>
  )
}
