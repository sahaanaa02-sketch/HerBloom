import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { requestEntitlement } from '../../services/entitlementApi'

const fields = ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'country']

let loadingSdk
function loadPayHere() {
  if (window.payhere?.startPayment) return Promise.resolve(window.payhere)
  loadingSdk ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://www.payhere.lk/lib/payhere-2.0.js'
    const fail = () => {
      clearTimeout(timeout)
      script.remove()
      loadingSdk = undefined
      reject(new Error('PayHere SDK unavailable'))
    }
    const timeout = setTimeout(fail, 10000)
    script.onload = () => {
      clearTimeout(timeout)
      if (window.payhere?.startPayment) resolve(window.payhere)
      else fail()
    }
    script.onerror = fail
    document.head.append(script)
  })
  return loadingSdk
}

export default function UpgradeBilling({ token, plan, onRefresh }) {
  const { t, i18n } = useTranslation('mother')
  const language = i18n.resolvedLanguage
  const copy = t('billing', { returnObjects: true })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [extra, setExtra] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const requestKey = useRef(null)
  const running = useRef(false)
  const current = plan.order_history
  const pending = current?.items.find((order) => order.status === 'pending')
  const reference = pending?.order_ref

  useEffect(() => {
    if (!reference) return
    const timer = setInterval(() => onRefresh().catch(() => {}), 3500)
    const end = setTimeout(() => clearInterval(timer), 60000)
    return () => { clearInterval(timer); clearTimeout(end) }
  }, [reference, onRefresh])

  async function begin(event) {
    event.preventDefault()
    if (running.current || reference) return
    const form = new FormData(event.currentTarget)
    const details = Object.fromEntries(fields.map((field) => [field, String(form.get(field) || '').trim()]))
    running.current = true
    setBusy(true)
    setError(false)
    try {
      const sdk = await loadPayHere()
      requestKey.current ??= crypto.randomUUID()
      const order = await requestEntitlement(token, '/api/billing/checkout', { plan: 'premium' },
        { 'Idempotency-Key': requestKey.current })
      requestKey.current = null
      setShow(false)
      const refresh = () => { onRefresh().catch(() => setError(true)) }
      sdk.onCompleted = refresh
      sdk.onDismissed = refresh
      sdk.onError = () => { setError(true); refresh() }
      if (!order.checkout?.sandbox) throw new Error('Sandbox checkout unavailable')
      sdk.startPayment({ ...details, ...order.checkout })
      refresh()
    } catch {
      setError(true)
      onRefresh().catch(() => {})
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  function confirmation(order) {
    requestEntitlement(token, '/api/billing/receipts/' + order.order_ref)
      .then(setReceipt).catch(() => setError(true))
  }

  const items = [...(current?.items || []), ...(extra?.items || [])]
  const cursor = extra ? extra.next_before : current?.next_before
  async function older() {
    try {
      const page = await requestEntitlement(token, '/api/billing/orders?before=' + cursor)
      setExtra({ ...page, items: [...(extra?.items || []), ...page.items] })
    } catch {
      setError(true)
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-[#F0DEE4] pt-3">
      {error && <p role="alert">{copy.error}</p>}
      {reference && <div role="status">
        <p>{copy.pending} · {copy.waiting}</p>
        <button type="button" className="font-semibold text-[#7B2346]" onClick={() => onRefresh().catch(() => setError(true))}>{copy.check}</button>
      </div>}
      {!show && plan.sandbox_checkout && !reference && <button type="button" className="font-semibold text-[#7B2346]" onClick={() => setShow(true)}>
        {['failed', 'cancelled'].includes(items[0]?.status) ? copy.retry : copy.upgrade}
      </button>}
      {show && !reference && <form onSubmit={begin} className="min-w-0 space-y-4 rounded-2xl border border-[#F0DEE4] bg-[#FFF6F1] p-3 sm:p-5">
        <h3 className="font-semibold">{copy.title}</h3>
        <p>{copy.summary}</p><p>{copy.premium}</p><p>{copy.sandbox}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((name, index) => <label key={name} className="grid gap-1">{copy.fields[index]}
            <input required name={name} maxLength={name === 'email' ? 254 : 100}
              type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
              pattern={name === 'phone' ? '[+]?[0-9]{7,15}' : undefined}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#E8C3CC] bg-white px-3 py-2" />
          </label>)}
        </div>
        <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-[#7B2346] px-4 py-2 text-white hover:bg-[#651C39]">{copy.pay}</button>
        <button type="button" disabled={busy} onClick={() => setShow(false)} className="ml-3">{copy.close}</button>
      </form>}
      {items.length > 0 && <>
        <h3 className="font-semibold">{copy.history}</h3>
        <ul>{items.map((order) => <li key={order.order_ref} className="border-b border-[#F0DEE4] py-2">
          <span>{order.currency} {order.amount_lkr} · {copy[order.status]} · {new Intl.DateTimeFormat(language === 'ta' ? 'ta-LK' : 'en-LK',
            { dateStyle: 'medium', timeZone: 'Asia/Colombo' }).format(new Date(order.created_at_utc))}</span>
          {order.review_required && <p>{copy.review}</p>}
          {order.verified_at_utc && <button type="button" className="ml-2 text-[#7B2346] underline" onClick={() => confirmation(order)}>{copy.receipt}</button>}
        </li>)}</ul>
        {cursor && <button type="button" onClick={older}>{copy.older}</button>}
      </>}
      {receipt && <section aria-label={copy.receipt} className="rounded-xl bg-[#FFF6F1] p-3">
        <h3 className="font-semibold">{copy.receipt}</h3>
        <p>{receipt.order_ref} · {receipt.currency} {receipt.amount_lkr} · {copy[receipt.status]}</p>
        <button type="button" onClick={() => setReceipt(null)}>{copy.close}</button>
      </section>}
    </div>
  )
}
