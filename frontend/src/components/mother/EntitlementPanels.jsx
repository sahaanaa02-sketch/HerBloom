import { useCallback, useEffect, useState } from 'react'
import UpgradeBilling from './UpgradeBilling'
import { requestEntitlement } from '../../services/entitlementApi'

const words = {
  en: {
    plan: 'My plan', free: 'Free Forever', trial: 'Seven-Day Premium Trial', premium: 'HerBloom Premium',
    compare: 'Premium is LKR 790 prepaid for 30 days. There are no automatic charges.',
    scan: 'Meal scans remaining', chat: 'Chat messages remaining', reset: 'Allowance resets or ends',
    expiry: 'Access ends', start: 'Start seven-day trial', confirm: 'Confirm trial', cancel: 'Cancel',
    trialText: 'Your seven days start now. Includes 7 meal scans and 25 chat messages. No card or automatic charge.',
    insights: 'Weekly AI insights', generate: 'Generate insight', more: 'Show older notes',
    unavailable: 'This feature is temporarily unavailable.', generating: 'Working…',
    notice: 'With your AI sharing consent, this uses summaries of your logged activity for educational guidance.',
    plan_or_interval_unavailable: 'A Trial or eligible Premium interval is required to generate an insight.',
    consent_required: 'Enable AI sharing consent in Settings to generate an insight.',
    policy_pending: 'Insight generation is awaiting policy approval.',
    insufficient_data: 'More recorded days are needed to generate an insight.',
    already_generated: 'An insight has already been generated for this interval.',
  },
  ta: {
    plan: 'எனது திட்டம்', free: 'என்றும் இலவசம்', trial: 'ஏழு நாள் பிரீமியம் சோதனை', premium: 'HerBloom பிரீமியம்',
    compare: 'பிரீமியம் 30 நாட்களுக்கு முன்பணம் LKR 790. தானியங்கிக் கட்டணம் இல்லை.',
    scan: 'மீதமுள்ள உணவுப் பதிவுப் படங்கள்', chat: 'மீதமுள்ள அரட்டைச் செய்திகள்',
    reset: 'ஒதுக்கீடு புதுப்பிக்கும் அல்லது முடியும் நேரம்', expiry: 'அணுகல் முடியும் நேரம்',
    start: 'ஏழு நாள் சோதனையைத் தொடங்கவும்', confirm: 'சோதனையை உறுதிசெய்க', cancel: 'ரத்துசெய்க',
    trialText: 'உங்களின் ஏழு நாட்கள் இப்போது தொடங்குகின்றன. 7 உணவுப் படங்கள் மற்றும் 25 அரட்டைச் செய்திகள் அடங்கும். அட்டையோ தானியங்கிக் கட்டணமோ இல்லை.',
    insights: 'வாராந்திர AI குறிப்புகள்', generate: 'குறிப்பை உருவாக்கவும்', more: 'பழைய குறிப்புகளைக் காட்டவும்',
    unavailable: 'இந்த அம்சம் தற்காலிகமாக கிடைக்கவில்லை.', generating: 'செயல்படுகிறது…',
    notice: 'உங்கள் AI பகிர்வு ஒப்புதலுடன், கல்வி வழிகாட்டலுக்காக உங்கள் பதிவுகளின் சுருக்கங்கள் பயன்படுத்தப்படும்.',
    plan_or_interval_unavailable: 'குறிப்பை உருவாக்க சோதனை அல்லது தகுதியான பிரீமியம் காலப்பகுதி தேவை.',
    consent_required: 'குறிப்பை உருவாக்க அமைப்புகளில் AI பகிர்வுக்கு ஒப்புதல் அளிக்கவும்.',
    policy_pending: 'குறிப்பு உருவாக்கம் கொள்கை ஒப்புதலுக்காகக் காத்திருக்கிறது.',
    insufficient_data: 'குறிப்பை உருவாக்க கூடுதல் நாட்களுக்கான பதிவுகள் தேவை.',
    already_generated: 'இந்தக் காலப்பகுதிக்கான குறிப்பு ஏற்கெனவே உருவாக்கப்பட்டது.',
  },
}

function formatDate(value, language) {
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-LK' : 'en-LK', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

export function MyPlan({ token, language }) {
  const labels = words[language] || words.en
  const [plan, setPlan] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    requestEntitlement(token, '/api/billing/me').then((data) => {
      if (active) setPlan(data)
    }).catch(() => {})
    return () => { active = false }
  }, [token])

  const refresh = useCallback(async () => {
    setPlan(await requestEntitlement(token, '/api/billing/me'))
  }, [token])

  if (!plan) return null
  async function start() {
    setBusy(true)
    setError(false)
    try {
      await requestEntitlement(token, '/api/billing/trial/start', { confirm: true })
      await refresh()
      setConfirm(false)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-[#F0DEE4] bg-[#FFFBFC] p-4 text-sm">
      <h2 className="mb-2 text-lg font-semibold text-[#7B2346]">{labels.plan} · {labels[plan.plan]}</h2>
      <p>{labels.compare}</p>
      {plan.expires_at && <p>{labels.expiry} · {formatDate(plan.expires_at, language)}</p>}
      <p>{labels.scan} · {plan.remaining.scan} &nbsp; {labels.chat} · {plan.remaining.chat}</p>
      <p>{labels.reset} · {formatDate(plan.quota_resets_at, language)}</p>
      {error && <p role="alert">{labels.unavailable}</p>}
      {confirm ? <div className="mt-3 space-y-2">
        <p>{labels.trialText}</p>
        <button type="button" disabled={busy} onClick={start} className="mr-3 font-semibold text-[#7B2346]">{labels.confirm}</button>
        <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{labels.cancel}</button>
      </div> : plan.trial_eligible && <button type="button" onClick={() => setConfirm(true)}
        className="mt-3 rounded-full bg-[#7B2346] px-4 py-2 font-semibold text-white">{labels.start}</button>}
      {(plan.sandbox_checkout || plan.order_history?.items.length > 0) && <UpgradeBilling token={token} language={language} plan={plan} onRefresh={refresh} />}
    </section>
  )
}

export function WeeklyInsights({ token, language }) {
  const labels = words[language] || words.en
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    requestEntitlement(token, '/insights/weekly').then((data) => {
      if (active) setResult(data)
    }).catch(() => {})
    return () => { active = false }
  }, [token])

  if (!result) return null
  async function action(older) {
    setBusy(true)
    setError(false)
    try {
      if (older) {
        const page = await requestEntitlement(token, '/insights/weekly?before=' + result.next_before)
        setResult({ ...page, items: [...result.items, ...page.items] })
      } else {
        const item = await requestEntitlement(token, '/insights/weekly/generate', {})
        setResult({ ...result, eligibility: 'already_generated', items: [item, ...result.items] })
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="my-5 rounded-2xl border border-[#F0DEE4] bg-white p-5 text-sm">
      <h2 className="mb-2 text-lg font-semibold text-[#7B2346]">{labels.insights}</h2>
      <p>{labels.notice}</p>
      {labels[result.eligibility] && <p className="mt-2">{labels[result.eligibility]}</p>}
      {error && <p role="alert">{labels.unavailable}</p>}
      {result.eligibility === 'eligible' && <button type="button" disabled={busy} onClick={() => action(false)}
        className="mt-3 rounded-full bg-[#7B2346] px-4 py-2 text-white">{busy ? labels.generating : labels.generate}</button>}
      {result.items.map((item) => <article key={item.id} lang={item.language} className="mt-4 rounded-xl bg-[#FFF6F1] p-4">
        <h3 className="font-semibold">{formatDate(item.generated_at_utc, language)}</h3>
        <p className="mt-2 whitespace-pre-wrap">{item.note}</p>
      </article>)}
      {result.next_before && <button type="button" disabled={busy} onClick={() => action(true)}
        className="mt-3 text-[#7B2346]">{labels.more}</button>}
    </section>
  )
}
