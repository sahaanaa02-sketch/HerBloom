import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import UpgradeBilling from './UpgradeBilling'
import { requestEntitlement } from '../../services/entitlementApi'

function formatDate(value, language) {
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-LK' : 'en-LK', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

export function MyPlan({ token }) {
  const { t, i18n } = useTranslation('mother')
  const language = i18n.resolvedLanguage
  const labels = t('entitlement', { returnObjects: true })
  const [plan, setPlan] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    requestEntitlement(token, '/api/billing/me').then((data) => {
      if (active) setPlan(data)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [token])

  const refresh = useCallback(async () => {
    setPlan(await requestEntitlement(token, '/api/billing/me'))
  }, [token])

  if (!plan) return <p role="status" className="text-sm text-[#7B2346]">
    {error ? labels.unavailable : labels.loading}
  </p>
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
    <section className="mb-5 min-w-0 rounded-2xl border border-[#F0DEE4] bg-[#FFFBFC] p-4 text-sm leading-relaxed sm:p-5">
      <h2 className="mb-2 text-lg font-semibold text-[#7B2346]">{labels.plan} · {labels[plan.plan]}</h2>
      <p className="mb-2 text-sm font-semibold text-[#7B2346]">
        {labels.active}
      </p>
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
        className="mt-3 min-h-11 rounded-full bg-[#7B2346] px-4 py-2 hover:bg-[#651C39] font-semibold text-white">{labels.start}</button>}
      {(plan.sandbox_checkout || plan.order_history?.items.length > 0) && <UpgradeBilling token={token} plan={plan} onRefresh={refresh} />}
    </section>
  )
}

export function WeeklyInsights({ token }) {
  const { t, i18n } = useTranslation('mother')
  const language = i18n.resolvedLanguage
  const labels = t('entitlement', { returnObjects: true })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [initialFailure, setInitialFailure] = useState(false)
  const [revision, retry] = useState(0)

  useEffect(() => {
    let active = true
    requestEntitlement(token, '/insights/weekly').then((data) => {
      if (active) setResult(data)
    }).catch(() => { if (active) setInitialFailure(true) })
    return () => { active = false }
  }, [token, revision])

  if (!result) return (
    <section className="my-5 min-w-0 rounded-2xl border border-[#F0DEE4] bg-white p-4 text-sm">
      <h2 className="mb-2 text-lg font-semibold text-[#7B2346]">{labels.insights}</h2>
      {initialFailure ? <>
        <p role="alert">{labels.unavailable}</p>
        <button type="button" className="mt-2 underline"
          onClick={() => { setInitialFailure(false); retry((value) => value + 1) }}>
          {t('common:retry')}
        </button>
      </> : <p role="status">{t('common:loading_dots')}</p>}
    </section>
  )

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
    <section className="my-5 min-w-0 rounded-2xl border border-[#F0DEE4] bg-white p-4 text-sm leading-relaxed sm:p-5">
      <h2 className="mb-2 text-lg font-semibold text-[#7B2346]">{labels.insights}</h2>
      <p>{labels.notice}</p>
      {labels[result.eligibility] && <p className="mt-2">{labels[result.eligibility]}</p>}
      {error && <p role="alert">{labels.unavailable}</p>}
      {result.eligibility === 'eligible' && <button type="button" disabled={busy} onClick={() => action(false)}
        className="mt-3 min-h-11 rounded-full bg-[#7B2346] px-4 py-2 hover:bg-[#651C39] text-white">{busy ? labels.generating : labels.generate}</button>}
      {result.items.map((item) => <article key={item.id} lang={item.language} className="mt-4 rounded-xl bg-[#FFF6F1] p-4">
        <h3 className="font-semibold">{formatDate(item.generated_at_utc, language)}</h3>
        <p className="mt-2 whitespace-pre-wrap">{item.note}</p>
      </article>)}
      {result.next_before && <button type="button" disabled={busy} onClick={() => action(true)}
        className="mt-3 text-[#7B2346]">{labels.more}</button>}
    </section>
  )
}
