import { authErrorKey } from '../locales/authErrors'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useEffect, useState } from 'react'
import { apiBase } from '../services/apiBase'

const titles = {
  request: 'reset_your_password',
  verify: 'enter_your_verification_code',
  reset: 'choose_a_new_password',
  email: 'verify_your_email',
}
const endpoints = {
  request: '/forgot-password',
  verify: '/password-reset/verify',
  reset: '/reset-password',
  email: '/verify-email',
}
const field = 'mt-1 block min-h-11 w-full rounded-xl border border-[#E8C3CC] px-3 py-2 focus-visible:outline-2 focus-visible:outline-[#7B2346]'

export default function AccountRecovery({ mode }) {
  const { t } = useTranslation('auth')
  const [token, setToken] = useState(() => window.location.hash.slice(1))
  const [step, setStep] = useState(mode === 'forgot-password' ? 'request' : mode === 'reset-password' ? 'reset' : 'email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (step === 'reset' && password !== confirmation) {
      setError('passwords_do_not_match')
      return
    }
    const body = step === 'request' ? { email } : step === 'reset' ? { token, password } : { token }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(apiBase + '/auth' + endpoints[step], {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw Object.assign(new Error(typeof result.detail === 'string' ? result.detail : ''), { status: response.status })
      setMessage(result.message)
      if (step === 'request') setStep('verify')
      else if (step === 'verify') setStep('reset')
      else {
        setFinished(true)
        setPassword('')
        setConfirmation('')
        setToken('')
        if (step === 'reset') {
          try { window.sessionStorage.removeItem('herbloom.mother.token') } catch { /* storage unavailable */ }
        }
      }
    } catch (reason) {
      setError(authErrorKey(reason.message, reason.status))
    } finally {
      setBusy(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-4 text-[#3A1224]">
    <section className="w-full max-w-md space-y-4 rounded-3xl border border-[#F6D3DB] bg-white p-5 shadow-sm sm:p-8">
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#7B2346]">{t(titles[step])}</h1>
      {message && <p role="status" className="rounded-xl bg-[#FFF6F1] p-3 text-sm leading-relaxed">{message}</p>}
      {!finished && (['reset', 'email'].includes(step) && !token
        ? <p role="alert">{t('open_the_one_time_link_from_your_email')}</p>
        : <form className="space-y-4" onSubmit={submit}>
            {step === 'request' && <label className="block">{t('email')}
              <input className={field} required type="email" autoComplete="email" maxLength={255} value={email}
                onChange={(event) => setEmail(event.target.value)} />
            </label>}
            {step === 'verify' && <label className="block">{t('verification_code')}
              <input className={field} required autoComplete="one-time-code" minLength={43} maxLength={43}
                value={token} onChange={(event) => setToken(event.target.value.trim())} />
            </label>}
            {step === 'reset' && <>
              <label className="block">{t('new_password')}
                <input className={field} required type="password" autoComplete="new-password" minLength={8} maxLength={128}
                  value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <label className="block">{t('confirm_password')}
                <input className={field} required type="password" autoComplete="new-password" minLength={8} maxLength={128}
                  value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
            </>}
            {error && <p role="alert" className="text-sm text-red-800">{t(error)}</p>}
            <button disabled={busy} className="min-h-11 rounded-full bg-[#7B2346] px-5 text-white hover:bg-[#651C39] disabled:opacity-60" type="submit">
              {t(busy ? 'please_wait' : {request: 'send_verification_code', verify: 'verify_code', reset: 'set_password', email: 'verify_email'}[step])}
            </button>
            {step === 'verify' && <button type="button" disabled={busy} className="block text-sm text-[#7B2346] underline"
              onClick={() => { setStep('request'); setToken(''); setMessage(''); setError('') }}>{t('request_a_new_code')}</button>}
          </form>)}
      <a href="/login" className="inline-block text-[#7B2346] underline underline-offset-4">{t('back_to_login')}</a>
    </section>
  </main>
}
