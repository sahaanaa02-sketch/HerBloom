import { authErrorKey } from '../locales/authErrors'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react'
import { verifyAdmin2FA } from '../services/adminAuthApi'

const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7B2346]'

export default function AdminVerification({ challenge, onSuccess, onCancel, shared = false }) {
  const { t: uiText } = useTranslation(['common', 'auth'])
  const [setup, setSetup] = useState(Boolean(challenge.setupKey))
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const heading = useRef(null)
  const field = useRef(null)
  const pending = useRef(null)

  useEffect(() => {
    const target = setup ? heading.current : field.current
    target?.focus()
  }, [setup])

  useEffect(() => () => pending.current?.abort(), [])

  function cancel() {
    pending.current?.abort()
    onCancel()
  }

  async function verify(event) {
    event.preventDefault()
    if (pending.current || code.length !== 6 || expired) return
    const request = new AbortController()
    pending.current = request
    setLoading(true)
    setError('')
    try {
      const result = await verifyAdmin2FA(challenge.token, code, request.signal)
      if (request.signal.aborted) return
      if (!result.access_token || !Array.isArray(result.admin?.permissions)) {
        throw new Error('Invalid authentication response.')
      }
      onSuccess({ ...result.admin, access_token: result.access_token, role: 'ADMIN', adminAuthenticated: true })
    } catch (reason) {
      if (request.signal.aborted) return
      const expiredChallenge = /login challenge/i.test(reason.message)
      setExpired(expiredChallenge)
      setError(authErrorKey(reason.message, reason.status))
    } finally {
      if (!request.signal.aborted) {
        pending.current = null
        setLoading(false)
      }
    }
  }

  return (
    <section aria-labelledby="admin-verification-title" className="mx-auto max-w-md space-y-5">
      <header className="space-y-2 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#F6D3DB] text-[#7B2346]">
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <h2 id="admin-verification-title" ref={heading} tabIndex={-1}
          className="font-['Playfair_Display'] text-2xl font-semibold text-[#7B2346] sm:text-3xl">
          {setup ? uiText('set_up_your_authenticator') : uiText('verify_your_sign_in')}
        </h2>
        <p id="admin-verification-help" className="text-sm leading-relaxed text-[#765363]">
          {setup ? uiText('add_herbloom_admin_as_a_time_based_account_in_your_authenticator_app') : uiText('enter_the_six_digit_code_from_your_authenticator_app')}
        </p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{uiText('auth:' + error)}</p>}
      {setup ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#E8C3CC] bg-[#FFF6F1] p-4">
            <p className="mb-1 text-sm font-semibold text-[#3A1224]">{uiText('private_setup_key')}</p>
            <p className="break-all font-mono text-sm text-[#7B2346]">{challenge.setupKey}</p>
            <p className="mt-2 text-xs text-[#765363]">{uiText('keep_this_key_private_never_share_it')}</p>
          </div>
          <button type="button" onClick={() => setSetup(false)}
            className={action + ' w-full bg-[#7B2346] text-white hover:bg-[#651C39]'}>{uiText('continue_to_verification')}</button>
        </div>
      ) : (
        <form onSubmit={verify} className="space-y-3" aria-busy={loading}>
          <label htmlFor="admin-otp" className="block text-sm font-semibold text-[#3A1224]">{uiText('authenticator_code')}</label>
          <input ref={field} id="admin-otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
            required autoComplete="one-time-code" value={code} disabled={loading || expired}
            aria-describedby="admin-verification-help" aria-invalid={Boolean(error) && !expired}
            onChange={(event) => { setCode(event.target.value.replace(/[^0-9]/g, '')); setError('') }}
            className="min-h-12 w-full rounded-xl border border-[#E8C3CC] bg-white px-4 text-center font-mono text-xl tracking-[0.3em] text-[#3A1224] focus-visible:outline-2 focus-visible:outline-[#7B2346]" />
          <button type="submit" disabled={loading || expired || code.length !== 6}
            className={action + ' w-full bg-[#7B2346] text-white hover:bg-[#651C39] disabled:opacity-60'}>
            {loading && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            {loading ? uiText('verifying') : uiText('verify_and_sign_in')}
          </button>
        </form>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F1D9DF] pt-2 text-[#7B2346]">
        <button type="button" className={action + ' hover:bg-[#FFF6F1]'} onClick={cancel}>
          <ArrowLeft size={16} aria-hidden="true" /> {shared ? uiText('back_to_shared_login') : uiText('back_to_admin_sign_in')}
        </button>
        <button type="button" className={action + ' hover:bg-[#FFF6F1]'} onClick={cancel}>{uiText('cancel')}</button>
      </div>
    </section>
  )
}
