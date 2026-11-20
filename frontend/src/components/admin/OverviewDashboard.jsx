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
  const empty = weeks.every((week) => !week.urgent && !week.crisis)
  return <>
    {empty && <p>No safety events in this period.</p>}
    <div className="ha-safety-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week_start" tickFormatter={formatDate} fontSize={11} />
          <YAxis allowDecimals={false} domain={[0, 'auto']} width={30} fontSize={11} />
          <Tooltip labelFormatter={formatDate} />
          <Legend />
          <Bar dataKey="urgent" name="Urgent" fill="#7B2346" radius={[4, 4, 0, 0]} />
          <Bar dataKey="crisis" name="Crisis" fill="#D9A25B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </>
}

export default function OverviewDashboard({ token, refreshKey, name, quickLinks, navigate, onReview }) {
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
        <span>YOUR MANAGEMENT SPACE</span>
        <h2>Welcome back, {name}</h2>
        <p>Manage HerBloom with care, clarity and confidence.</p>
      </div>
      <ShieldCheck size={55} strokeWidth={1.2} />
    </div>
    {loading && <div className="ha-message" role="status">Loading dashboard data…</div>}
    {current?.error && <div className="ha-error" role="alert">
      <strong>Could not load dashboard</strong><p>{current.error}</p>
      <button type="button" onClick={() => retry((value) => value + 1)}>Try again</button>
    </div>}
    {overview && <>
      <div className="ha-stats ha-overview-stats">
        <StatCard icon={Users} title="Total Mothers" value={overview.total_mothers} description={overview.active_mothers + ' enabled accounts'} />
        <StatCard icon={UserPlus} title="New This Week" value={overview.new_this_week} description="New mother accounts" />
        <StatCard icon={Activity} title="Active This Week" value={overview.active_this_week} description="Mother accounts with a recorded sign-in" />
        <StatCard icon={HeartPulse} title="Check-ins This Week" value={overview.checkins_this_week} description="Submitted wellbeing check-ins" />
      </div>
      {overview.stage2_enabled && <div className="ha-stats">
        <StatCard icon={Users} title="Premium Subscribers" value={overview.premium_subscribers ?? 'Unavailable'} description="Recorded subscriptions" />
        <StatCard icon={Activity} title="Revenue This Month" value={overview.revenue_this_month ?? 'Unavailable'} description="Recorded revenue" />
        <StatCard icon={Activity} title="AI Cost This Month" value={overview.ai_cost_this_month ?? 'Unavailable'} description="Recorded provider cost" />
      </div>}
      <div className="ha-panels ha-overview-row">
        <section className="ha-panel">
          <h3>Safety events</h3>
          <p>Weekly totals for the four weeks through the selected date.</p>
          <div className="ha-overview-filter">
            <label>Through date <input type="date" min="2000-01-01" max={overview.as_of}
              value={safetyDate || overview.as_of || ''} onChange={(event) => changeDate(event.target.value)} /></label>
            {safetyDate && <button type="button" className="ha-refresh" onClick={() => changeDate('')}>Reset date</button>}
          </div>
          {overview.safety_counts_by_week ? <SafetyChart weeks={overview.safety_counts_by_week} /> : <p>Weekly data is unavailable.</p>}
        </section>
        <div className="ha-review-alerts">
          {[['queue', 'Pending clinical reviews', overview.reviews_pending], ['due', 'Overdue re-reviews', overview.reviews_overdue]].map(([tab, title, count]) =>
            <section className="ha-panel" key={tab}>
              <h3><ClipboardCheck size={18} /> {title}</h3>
              <strong className="ha-overview-count">{count ?? '—'}</strong>
              {onReview && count != null && <button type="button" className="ha-refresh" onClick={() => onReview(tab)}>
                {tab === 'queue' ? 'Open review queue' : 'Open re-review list'}<ArrowRight size={15} />
              </button>}
            </section>)}
        </div>
      </div>
      <div className="ha-panels">
        <section className="ha-panel">
          <h3>Recent administrative activity</h3>
          {overview.last_10_audit_entries?.length ? <ul className="ha-overview-activity">
            {overview.last_10_audit_entries.map((item) => <li key={item.id}>
              <div><strong>{item.action}</strong><span>{item.entity}</span></div>
              <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
            </li>)}
          </ul> : <p>{overview.last_10_audit_entries ? 'No administrative activity recorded.' : 'Recent activity is unavailable.'}</p>}
        </section>
        <section className="ha-panel">
          <h3>Quick Access</h3>
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
