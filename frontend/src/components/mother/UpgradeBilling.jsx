import { useEffect, useRef, useState } from 'react'
import { requestEntitlement } from '../../services/entitlementApi'

const labels = {
  en: {
    upgrade: 'Upgrade or extend Premium', title: 'Premium order summary',
    summary: 'LKR 790.00 · 30 days · One payment. No automatic renewal.',
    premium: '30 meal scans and 150 chat messages per period, eligible guided exercises and weekly AI insights.',
    sandbox: 'PayHere Sandbox uses test transactions. The billing details below are shared with PayHere when you open checkout.',
    pay: 'Open PayHere Sandbox', pending: 'Payment verification pending', paid: 'Payment verified',
    failed: 'Payment failed', cancelled: 'Payment cancelled', refund_pending: 'Refund under review',
    refunded: 'Refund recorded', chargeback: 'Chargeback recorded',
    retry: 'Retry checkout', check: 'Check payment status', history: 'Payment history', older: 'Show older payments',
    receipt: 'Sandbox payment confirmation', close: 'Close', review: 'Awaiting reconciliation',
    error: 'Payment service is temporarily unavailable. Check payment history before trying again.',
    waiting: 'Please wait for verified payment status before starting another checkout.',
    fields: ['First name', 'Last name', 'Email', 'Phone', 'Address', 'City', 'Country'],
  },
  ta: {
    upgrade: 'பிரீமியத்திற்கு மாறவும் அல்லது நீட்டிக்கவும்', title: 'பிரீமியம் கட்டணச் சுருக்கம்',
    summary: 'LKR 790.00 · 30 நாட்கள் · ஒருமுறை கட்டணம். தானாகப் புதுப்பிக்கப்படாது.',
    premium: 'ஒவ்வொரு காலத்திலும் 30 உணவுப் படங்கள், 150 அரட்டைச் செய்திகள், தகுதியான பயிற்சிகள் மற்றும் வாராந்திர AI குறிப்புகள்.',
    sandbox: 'PayHere சோதனைச் சூழல் சோதனைப் பரிவர்த்தனைகளைப் பயன்படுத்துகிறது. கட்டணத் திரையைத் திறக்கும்போது கீழேயுள்ள விவரங்கள் PayHere உடன் பகிரப்படும்.',
    pay: 'PayHere சோதனைத் திரையைத் திறக்கவும்', pending: 'கட்டணச் சரிபார்ப்பு நிலுவையில் உள்ளது', paid: 'கட்டணம் சரிபார்க்கப்பட்டது',
    failed: 'கட்டணம் தோல்வியடைந்தது', cancelled: 'கட்டணம் ரத்துசெய்யப்பட்டது', refund_pending: 'பணத்திருப்பம் பரிசீலனையில்',
    refunded: 'பணத்திருப்பம் பதிவானது', chargeback: 'கட்டணத் தகராறு பதிவானது',
    retry: 'மீண்டும் முயலவும்', check: 'கட்டண நிலையைச் சரிபார்க்கவும்', history: 'கட்டண வரலாறு',
    older: 'பழைய கட்டணங்களைக் காட்டவும்', receipt: 'சோதனைக் கட்டண உறுதிப்படுத்தல்', close: 'மூடவும்',
    review: 'கணக்குச் சரிபார்ப்பு நிலுவையில் உள்ளது',
    error: 'கட்டணச் சேவை தற்காலிகமாகக் கிடைக்கவில்லை. மீண்டும் முயலும் முன் கட்டண வரலாற்றைப் பார்க்கவும்.',
    waiting: 'புதிய கட்டணத்தைத் தொடங்குமுன் உறுதிப்படுத்தப்பட்ட நிலைக்காகக் காத்திருக்கவும்.',
    fields: ['முதல் பெயர்', 'கடைசிப் பெயர்', 'மின்னஞ்சல்', 'தொலைபேசி', 'முகவரி', 'நகரம்', 'நாடு'],
  },
}
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

export default function UpgradeBilling({ token, language, plan, onRefresh }) {
  const copy = labels[language] || labels.en
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
      {show && !reference && <form onSubmit={begin} className="space-y-3 rounded-xl bg-[#FFF6F1] p-4">
        <h3 className="font-semibold">{copy.title}</h3>
        <p>{copy.summary}</p><p>{copy.premium}</p><p>{copy.sandbox}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map((name, index) => <label key={name} className="grid gap-1">{copy.fields[index]}
            <input required name={name} maxLength={name === 'email' ? 254 : 100}
              type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
              pattern={name === 'phone' ? '[+]?[0-9]{7,15}' : undefined}
              className="rounded-lg border border-[#F0DEE4] bg-white px-2 py-1" />
          </label>)}
        </div>
        <button type="submit" disabled={busy} className="rounded-full bg-[#7B2346] px-4 py-2 text-white">{copy.pay}</button>
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
