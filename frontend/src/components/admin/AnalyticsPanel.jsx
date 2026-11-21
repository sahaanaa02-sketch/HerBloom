import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { a13AdminRequest } from '../../services/adminApi'

const format = (value) => value == null ? '—' : value.toLocaleString()

export default function AnalyticsPanel({ token }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [dates, setDates] = useState({ start: '', end: '' })
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    a13AdminRequest(token, '/analytics' + query)
      .then((report) => { if (current) { setData(report); setError('') } })
      .catch((failure) => { if (current) { setData(null); setError(failure.message) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token, query])

  async function download() {
    try {
      const blob = await a13AdminRequest(token, '/analytics/export.csv' + query, 'GET', undefined, 'blob')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'herbloom-analytics.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { setError(failure.message) }
  }

  const active = data ? [
    ['Latest day', data.daily.at(-1)?.count],
    ['Latest week in range', data.weekly.at(-1)?.count],
    ['Checkout cancellations', data.checkout_cancellations],
    ['Subscription cancellations', data.subscription_cancellations],
  ] : []

  return <section className="space-y-5">
    <form className="ha-panel flex flex-wrap items-end gap-4" onSubmit={(event) => {
      event.preventDefault()
      const params = new URLSearchParams(Object.entries(dates).filter(([,value]) => value))
      const path = params.size ? '?' + params : ''
      if (path !== query) { setLoading(true); setQuery(path) }
    }}>
      {['start', 'end'].map((key) => <label key={key} className="grid gap-1">{key === 'start' ? auditText('common:from') : auditText('common:through')}
        <input type="date" value={dates[key]} onChange={(event) => setDates({ ...dates, [key]:event.target.value })}
          className="rounded-lg border border-[#F2DEE5] p-2" />
      </label>)}
      <button type="submit" className="rounded-lg bg-[#7B2346] px-3 py-2 text-white">{uiText('apply_dates')}</button>
      <button type="button" disabled={!data || loading} onClick={download}>{uiText('export_aggregates')}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">{uiText('loading_analytics')}</p>}
    {data && !loading && <>
      <p className="text-sm">{auditText('common:showing')} {data.start} through {data.end}{auditText('common:groups_under')} {data.minimum_group} {auditText('common:and_small_complementary_groups_are_hidden_an_em_dash_also_indicates_unavailable_data')}</p>
      <div className="ha-stats ha-overview-stats">
        {active.map(([label, count]) => <div className="ha-stat-card" key={label}><p>{label}</p><strong>{format(count)}</strong></div>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[['Daily active mothers',data.daily],['Weekly active mothers',data.weekly]].map(([title,rows]) =>
          <section className="ha-panel" key={title}><h2 className="font-semibold">{title}</h2>
            {rows.some((row) => row.count != null) ? <ResponsiveContainer width="100%" height={230}>
              <LineChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis allowDecimals={false} />
                <Tooltip /><Line dataKey="count" name="Active mothers" stroke="#7B2346" dot={false} /></LineChart>
            </ResponsiveContainer> : <p className="text-sm">{localizeCopy('common:no_reportable_data_for_this_range')}</p>}
          </section>)}
        <section className="ha-panel"><h2 className="font-semibold">{uiText('feature_usage')}</h2>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={Object.entries(data.features).map(([name,count]) => ({name,count}))}>
              <XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar name="Recorded uses" dataKey="count" fill="#7B2346"/>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-sm">{auditText('common:article_opens_successful_scans_and_ai_messages_are_counted_from_a13_activation_onward')}</p>
        </section>
        <section className="ha-panel"><h2 className="font-semibold">{uiText('signup_trial_paid')}</h2>
          {data.conversion ? <dl>{Object.entries(data.conversion).map(([label,count]) =>
            <div key={label} className="flex justify-between py-2"><dt>{label.replaceAll('_',' ')}</dt><dd>{format(count)}</dd></div>)}</dl>
            : <p>{localizeCopy('common:billing_data_is_unavailable')}</p>}
          <p className="text-sm">{auditText('common:prepaid_premium_does_not_auto_renew_checkout_cancellations_are_shown_separately')}</p>
        </section>
        {[['Top articles',data.articles],['Top exercises',data.exercises]].map(([label,rows]) =>
          <section key={label} className="ha-panel"><h2 className="font-semibold">{label}</h2>
            {rows.length ? <ol>{rows.map((row,index) => <li key={row.title+index} className="flex justify-between py-1">
              {index+1}. {row.title} <strong>{format(row.count)}</strong></li>)}</ol> : <p>{localizeCopy('common:no_reportable_data')}</p>}
          </section>)}
      </div>
      <section className="ha-panel overflow-auto"><h2 className="font-semibold">{uiText('retention_by_signup_week')}</h2>
        {data.retention.length ? <table className="mt-2 w-full text-left [&_td]:p-2 [&_th]:p-2">
          <thead><tr><th>{localizeCopy('common:signup_week')}</th><th>{localizeCopy('common:weeks_since_signup')}</th><th>{localizeCopy('common:cohort_size')}</th><th>{uiText('active')}</th></tr></thead>
          <tbody>{data.retention.map((row) => <tr key={row.cohort+row.week}>
            <td>{row.cohort}</td><td>{row.week}</td><td>{row.size}</td><td>{format(row.active)}</td>
          </tr>)}</tbody></table> : <p>{localizeCopy('common:no_reportable_cohorts')}</p>}
      </section>
    </>}
  </section>
}
