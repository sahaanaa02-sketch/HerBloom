import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Activity, ArrowRight, ClipboardCheck, HeartPulse, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAdminOverview } from '../../services/adminApi'

function StatCard({ icon: Icon, title, value, description }) {
  return <div className="ha-stat-card">
    <div className="ha-stat-icon"><Icon size={21} /></div>
    <p>{title}</p><strong>{value ?? '—'}</strong><span>{description}</span>
  </div>
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

function SafetyChart({ weeks }) {
  const { t: uiText } = useTranslation('common')
  const empty = weeks.every((week) => !week.urgent && !week.crisis)
  return <>
    {empty && <p>{uiText('no_safety_events_in_this_period')}</p>}
    <div className="ha-safety-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week_start" tickFormatter={formatDate} fontSize={11} />
          <YAxis allowDecimals={false} domain={[0, 'auto']} width={30} fontSize={11} />
          <Tooltip labelFormatter={formatDate} />
          <Legend />
          <Bar dataKey="urgent" name={uiText("admin_safety_urgent")} fill="#7B2346" radius={[4, 4, 0, 0]} />
          <Bar dataKey="crisis" name={uiText("admin_safety_crisis")} fill="#D9A25B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </>
}

export default function OverviewDashboard({ token, refreshKey, name, quickLinks, navigate, onReview }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [safetyDate, setSafetyDate] = useState('')
  const [revision, retry] = useState(0)
  const [result, setResult] = useState(null)
  const requestKey = JSON.stringify([safetyDate, refreshKey, revision])
  useEffect(() => {
    if (!token) return
    let alive = true
    getAdminOverview(token, safetyDate).then((data) => {
      if (alive) setResult({ requestKey, token, data })
    }).catch((error) => { if (alive) setResult({ requestKey, token, error: error.message }) })
    return () => { alive = false }
  }, [requestKey, safetyDate, token])

  const latest = result?.token === token ? result : null
  const current = latest?.requestKey === requestKey ? latest : null
  const overview = latest?.data
  const loading = !current && Boolean(token)
  const changeDate = (value) => setSafetyDate(value)
  return <div aria-busy={loading}>
    <div className="ha-welcome">
      <div>
        <span>{localizeCopy('common:your_management_space')}</span>
        <h2>{auditText('common:welcome_back_2')} {name}</h2>
        <p>{auditText('common:manage_herbloom_with_care_clarity_and_confidence')}</p>
      </div>
      <ShieldCheck size={55} strokeWidth={1.2} />
    </div>
    {loading && <div className="ha-message" role="status">{uiText('loading_dashboard_data')}</div>}
    {current?.error && <div className="ha-error" role="alert">
      <strong>{auditText('common:could_not_load_dashboard')}</strong><p>{current.error}</p>
      <button type="button" onClick={() => retry((value) => value + 1)}>{uiText('try_again')}</button>
    </div>}
    {overview && <>
      <div className="ha-stats ha-overview-stats">
        <StatCard icon={Users} title={auditText('common:total_mothers')} value={overview.total_mothers} description={uiText('admin_enabled_accounts', { count: overview.active_mothers })} />
        <StatCard icon={UserPlus} title={auditText('common:new_this_week')} value={overview.new_this_week} description={auditText('common:new_mother_accounts')} />
        <StatCard icon={Activity} title={auditText('common:active_this_week')} value={overview.active_this_week} description={auditText('common:mother_accounts_with_a_recorded_sign_in')} />
        <StatCard icon={HeartPulse} title={auditText('common:check_ins_this_week')} value={overview.checkins_this_week} description={auditText('common:submitted_wellbeing_check_ins')} />
      </div>
      {overview.stage2_enabled && <div className="ha-stats">
        <StatCard icon={Users} title={auditText('common:premium_subscribers')} value={overview.premium_subscribers ?? uiText('admin_data_unavailable')} description={auditText('common:recorded_subscriptions')} />
        <StatCard icon={Activity} title={auditText('common:revenue_this_month')} value={overview.revenue_this_month ?? uiText('admin_data_unavailable')} description={auditText('common:recorded_revenue')} />
        <StatCard icon={Activity} title={auditText('common:ai_cost_this_month')} value={overview.ai_cost_this_month ?? uiText('admin_data_unavailable')} description={auditText('common:recorded_provider_cost')} />
      </div>}
      <div className="ha-panels ha-overview-row">
        <section className="ha-panel">
          <h3>{auditText('common:safety_events')}</h3>
          <p>{auditText('common:weekly_totals_for_the_four_weeks_through_the_selected_date')}</p>
          <div className="ha-overview-filter">
            <label>{auditText('common:through_date')} <input type="date" min="2000-01-01" max={overview.as_of}
              value={safetyDate || overview.as_of || ''} onChange={(event) => changeDate(event.target.value)} /></label>
            {safetyDate && <button type="button" className="ha-refresh" onClick={() => changeDate('')}>{auditText('common:reset_date')}</button>}
          </div>
          {overview.safety_counts_by_week ? <SafetyChart weeks={overview.safety_counts_by_week} /> : <p>{auditText('common:weekly_data_is_unavailable')}</p>}
        </section>
        <div className="ha-review-alerts">
          {[['queue', uiText('admin_pending_clinical_reviews'), overview.reviews_pending], ['due', uiText('admin_overdue_reviews'), overview.reviews_overdue]].map(([tab, title, count]) =>
            <section className="ha-panel" key={tab}>
              <h3><ClipboardCheck size={18} /> {title}</h3>
              <strong className="ha-overview-count">{count ?? '—'}</strong>
              {onReview && count != null && <button type="button" className="ha-refresh" onClick={() => onReview(tab)}>
                {tab === 'queue' ? auditText('common:open_review_queue') : auditText('common:open_re_review_list')}<ArrowRight size={15} />
              </button>}
            </section>)}
        </div>
      </div>
      <div className="ha-panels">
        <section className="ha-panel">
          <h3>{auditText('common:recent_administrative_activity')}</h3>
          {overview.last_10_audit_entries?.length ? <ul className="ha-overview-activity">
            {overview.last_10_audit_entries.map((item) => <li key={item.id}>
              <div><strong>{item.action}</strong><span>{item.entity}</span></div>
              <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
            </li>)}
          </ul> : <p>{overview.last_10_audit_entries ? auditText('common:no_administrative_activity_recorded') : auditText('common:recent_activity_is_unavailable')}</p>}
        </section>
        <section className="ha-panel">
          <h3>{auditText('common:quick_access')}</h3>
          <div className="ha-quick-links">
            {quickLinks.map(({ id, icon: Icon, label }) => <button type="button" key={id} onClick={() => navigate(id)}>
              <Icon size={18} />{label}<ArrowRight size={15} />
            </button>)}
          </div>
        </section>
      </div>
    </>}
  </div>
}
