import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import { billingAdminRequest } from '../../services/adminApi'

const states = ['pending', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded', 'chargeback']
const format = (value) => value ? new Intl.DateTimeFormat('en-LK', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
}).format(new Date(value)) : '—'
const statusLabel = (value) => value.replaceAll('_', ' ')

export default function BillingMonitor({ token, permissions }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [items, setItems] = useState([])
  const [usage, setUsage] = useState([])
  const [filter, setFilter] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [selected, setSelected] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const fetchPage = useCallback((before) => {
    const query = new URLSearchParams({ review_only: reviewOnly })
    if (filter) query.set('status', filter)
    if (before) query.set('before', before)
    return billingAdminRequest(token, '/orders?' + query)
  }, [filter, reviewOnly, token])

  useEffect(() => {
    let current = true
    Promise.all([fetchPage(), billingAdminRequest(token, '/usage')]).then(([page, totals]) => {
      if (!current) return
      setItems(page.items)
      setCursor(page.next_before)
      setUsage(totals)
      setError('')
    }).catch((failure) => { if (current) setError(failure.message) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [fetchPage, token])

  async function view(order) {
    setSelected(order)
    setEvents([])
    setBusy(true)
    setError('')
    try {
      setEvents(await billingAdminRequest(token, '/orders/' + order.order_ref + '/events'))
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function retrieve() {
    setBusy(true)
    setError('')
    try {
      await billingAdminRequest(token, '/orders/' + selected.order_ref + '/retrieve-reversals', 'POST')
      const page = await fetchPage()
      setItems(page.items)
      setCursor(page.next_before)
      await view(page.items.find((row) => row.order_ref === selected.order_ref) || selected)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  async function older() {
    setBusy(true)
    try {
      const page = await fetchPage(cursor)
      setItems((rows) => [...rows, ...page.items])
      setCursor(page.next_before)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ha-panel space-y-4">
      <h2 className="text-lg font-semibold text-[#7B2346]">{uiText('sandbox_payments')}</h2>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-4">
        <label>{uiText('status')} <select value={filter} disabled={busy}
          onChange={(event) => { setLoading(true); setFilter(event.target.value); setSelected(null) }}>
          <option value="">{uiText('all')}</option>
          {states.map((state) => <option key={state} value={state}>{statusLabel(state)}</option>)}
        </select></label>
        <label><input type="checkbox" checked={reviewOnly} disabled={busy} onChange={(event) => {
          setLoading(true); setReviewOnly(event.target.checked); setSelected(null)
        }} /> {uiText('needs_reconciliation')}</label>
      </div>
      {loading ? <p role="status">{uiText('loading_orders')}</p> : items.length ? <div className="overflow-x-auto">
        <table className="w-full text-left text-sm [&_td]:p-2 [&_th]:p-2">
          <thead className="bg-[#FFF6F1]"><tr>
            <th>{uiText('order')}</th><th>{uiText('amount')}</th><th>{uiText('status')}</th><th>{uiText('premium_starts')}</th><th>{uiText('period_expires')}</th><th>{localizeCopy('common:events')}</th>
          </tr></thead>
          <tbody>{items.map((row) => <tr key={row.order_ref} className="border-b border-[#F0DEE4]">
            <td className="whitespace-nowrap">{row.order_ref}</td><td>{row.currency} {row.amount_lkr}</td>
            <td>{statusLabel(row.status)}{row.review_required && <p className="font-semibold text-[#7B2346]">{localizeCopy('common:reconciliation_required')}</p>}</td>
            <td>{format(row.starts_at)}</td><td>{format(row.expires_at)}</td>
            <td><button type="button" disabled={busy} className="underline" onClick={() => view(row)}>{localizeCopy('common:view')}</button></td>
          </tr>)}</tbody>
        </table>
        {cursor && <button type="button" disabled={busy} onClick={older}>{localizeCopy('common:show_older_orders')}</button>}
      </div> : !error && <p>{localizeCopy('common:no_orders_match_these_filters')}</p>}
      {selected && <section className="rounded-xl bg-[#FFF6F1] p-4">
        <h3 className="font-semibold">{auditText('common:verified_events')} {selected.order_ref}</h3>
        {busy && <p role="status">{localizeCopy('common:loading_events')}</p>}
        {!busy && !events.length && <p>{localizeCopy('common:no_verified_provider_events')}</p>}
        <ul>{events.map((event) => <li key={event.source + event.provider_status + event.provider_payment_id}>
          {format(event.received_at_utc)} · {event.source} · {statusLabel(event.provider_status)} · {event.provider_payment_id}
        </li>)}</ul>
        {permissions.includes('billing.manage') && <button type="button" disabled={busy} className="mt-2 underline" onClick={retrieve}>
          {auditText('common:retrieve_sandbox_refund_or_chargeback_status')}
        </button>}
      </section>}
      <section>
        <h3 className="font-semibold">{uiText('successful_ai_usage_by_plan')}</h3>
        {!usage.length ? <p>{localizeCopy('common:no_recorded_usage')}</p> : <ul>{usage.map((item) => <li key={item.entitlement_code + item.feature}>
          {item.entitlement_code} · {item.feature} · {item.total}
        </li>)}</ul>}
      </section>
    </section>
  )
}
