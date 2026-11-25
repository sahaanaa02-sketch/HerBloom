import { authErrorKey } from '../locales/authErrors'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
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
const emptyCode = () => Array(6).fill('')

function PasswordField({ label, value, onChange }) {
  const { t } = useTranslation('auth')
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return <label className="block">
    {t(label)}
    <span className="relative block">
      <input className={field + ' pr-12'} required type={visible ? 'text' : 'password'}
        autoComplete="new-password" minLength={8} maxLength={128} value={value}
        onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="absolute right-0 top-0 flex min-h-11 min-w-11 items-center justify-center text-[#7B2346]"
        aria-label={t(visible ? 'hide_password_field' : 'show_password_field', { field: t(label) })}
        onClick={() => setVisible(!visible)}><Icon size={18} aria-hidden="true" /></button>
    </span>
  </label>
}

export default function AccountRecovery({ mode }) {
  const { t } = useTranslation('auth')
  const [token, setToken] = useState(() => mode === 'verify-email' ? window.location.hash.slice(1) : '')
  const [step, setStep] = useState(mode === 'verify-email' ? 'email' : 'request')
  const [email, setEmail] = useState('')
  const [digits, setDigits] = useState(emptyCode)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const boxes = useRef([])

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (step === 'verify') boxes.current[0]?.focus()
  }, [step])

  useEffect(() => {
    if (!cooldownUntil) return
    const update = () => setCooldown(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    if (!finished || step !== 'reset') return
    const timer = window.setTimeout(() => window.location.replace('/login'), 2200)
    return () => window.clearTimeout(timer)
  }, [finished, step])

  function enterDigits(index, value) {
    const incoming = value.replace(/[^0-9]/g, '')
    if (!incoming && value) return
    if (!incoming) {
      setDigits((previous) => previous.map((digit, i) => i === index ? '' : digit))
      return
    }
    const start = incoming.length >= 6 ? 0 : index
    const count = Math.min(6 - start, incoming.length)
    setDigits((previous) => previous.map((digit, i) =>
      i >= start && i < start + count ? incoming[i - start] : digit))
    boxes.current[Math.min(start + count, 5)]?.focus()
  }

  async function send(action) {
    if (busy) return
    if (action === 'reset' && password !== confirmation) {
      setError('passwords_do_not_match')
      return
    }
    const body = action === 'request' ? { email }
      : action === 'verify' ? { email, code: digits.join('') }
        : action === 'reset' ? { token, password } : { token }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(apiBase + '/auth' + endpoints[action], {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw Object.assign(new Error(typeof result.detail === 'string' ? result.detail : ''), { status: response.status })
      if (action === 'request') {
        setMessage('reset_code_requested')
        setDigits(emptyCode())
        setCooldown(60)
        setCooldownUntil(Date.now() + 60000)
        setStep('verify')
        if (step === 'verify') boxes.current[0]?.focus()
      } else if (action === 'verify') {
        if (typeof result.reset_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.reset_token)) {
          throw new Error('Invalid reset authorization.')
        }
        setToken(result.reset_token)
        setDigits(emptyCode())
        setMessage('')
        setStep('reset')
      } else {
        setFinished(true)
        setMessage(action === 'reset' ? 'password_reset_complete' : 'email_verified_complete')
        setPassword('')
        setConfirmation('')
        setToken('')
        if (action === 'reset') {
          try { window.sessionStorage.removeItem('herbloom.mother.token') } catch { /* storage unavailable */ }
        }
      }
    } catch (reason) {
      setError(reason.status === 429 ? 'reset_rate_limited' : authErrorKey(reason.message, reason.status))
    } finally {
      setBusy(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-4 text-[#3A1224]">
    <section className="w-full max-w-md space-y-4 rounded-3xl border border-[#F6D3DB] bg-white p-5 shadow-sm sm:p-8">
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#7B2346]">{t(titles[step])}</h1>
      {message && <p role="status" className="rounded-xl bg-[#FFF6F1] p-3 text-sm leading-relaxed">{t(message)}</p>}
      {!finished && (step === 'email' && !token
        ? <p role="alert">{t('open_the_one_time_link_from_your_email')}</p>
        : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); send(step) }}>
            {step === 'request' && <label className="block">{t('email')}
              <input className={field} required type="email" autoComplete="email" maxLength={255} value={email}
                onChange={(event) => setEmail(event.target.value)} />
            </label>}
            {step === 'verify' && <fieldset>
              <legend>{t('verification_code')}</legend>
              <div className="mt-1 grid grid-cols-6 gap-1.5 sm:gap-2">
                {digits.map((digit, index) => <input key={index} ref={(node) => { boxes.current[index] = node }}
                  className={field + ' min-w-0 px-0 text-center text-lg'} required inputMode="numeric" pattern="[0-9]"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  aria-label={t('otp_digit_position', { position: index + 1 })} value={digit}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => enterDigits(index, event.target.value)}
                  onPaste={(event) => { event.preventDefault(); enterDigits(index, event.clipboardData.getData('text')) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !digit && index > 0) {
                      event.preventDefault()
                      enterDigits(index - 1, '')
                      boxes.current[index - 1]?.focus()
                    }
                  }} />)}
              </div>
            </fieldset>}
            {step === 'reset' && <>
              <PasswordField label="new_password" value={password} onChange={setPassword} />
              <PasswordField label="confirm_password" value={confirmation} onChange={setConfirmation} />
            </>}
            {error && <p role="alert" className="text-sm text-red-800">{t(error)}</p>}
            <button disabled={busy} className="min-h-11 rounded-full bg-[#7B2346] px-5 text-white hover:bg-[#651C39] disabled:opacity-60" type="submit">
              {t(busy ? 'please_wait' : {request: 'send_verification_code', verify: 'verify_code', reset: 'set_password', email: 'verify_email'}[step])}
            </button>
            {step === 'request' && <button type="button" disabled={busy} className="block min-h-11 text-sm text-[#7B2346] underline"
              onClick={(event) => {
                if (event.currentTarget.form.reportValidity()) {
                  setError(''); setMessage(''); setStep('verify')
                }
              }}>{t('already_have_reset_code')}</button>}
            {step === 'verify' && <button type="button" disabled={busy || cooldown > 0}
              className="block min-h-11 text-sm text-[#7B2346] underline disabled:opacity-60"
              onClick={() => send('request')}>{t(cooldown > 0 ? 'resend_code_in_seconds' : 'resend_reset_code', { seconds: cooldown })}</button>}
            {step === 'reset' && error === 'expired_link' && <button type="button" className="block min-h-11 text-sm text-[#7B2346] underline"
              onClick={() => { setToken(''); setPassword(''); setConfirmation(''); setError(''); setStep('request') }}>
              {t('request_a_new_code')}
            </button>}
          </form>)}
      <a href="/login" className="inline-block text-[#7B2346] underline underline-offset-4">{t('back_to_login')}</a>
    </section>
  </main>
}
