import { useTranslation } from 'react-i18next'

import { AlertCircle, ArrowRight } from 'lucide-react'

export default function DashboardAlerts({ alerts = [], onNavigate }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  if (!alerts.length) return null

  return (
    <section className="space-y-3">
      {alerts.map((alert, index) => (
        <div
          key={alert.id ?? index}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#F1D5A7] bg-[#FFF4E2] px-5 py-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              size={19}
              className="mt-0.5 shrink-0 text-[#B87931]"
            />

            <div>
              <p className="text-sm font-semibold text-[#754A20]">
                {alert.title || auditText('common:a_gentle_reminder')}
              </p>

              <p className="mt-1 text-xs leading-5 text-[#936B41]">
                {alert.message || ''}
              </p>
            </div>
          </div>

          {alert.page && (
            <button
              type="button"
              onClick={() => onNavigate?.(alert.page)}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#7B2346]"
            >
              {uiText('view_details')}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      ))}
    </section>
  )
}
