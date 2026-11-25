import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GoogleSignIn from '../GoogleSignIn'
import { requestEntitlement } from '../../services/entitlementApi'

export default function GoogleAccountSecurity({ token, onLogout }) {
  const { t } = useTranslation('common')
  const base = '/auth/google'
  const endpoint = base + '/link'
  const [status, setStatus] = useState(null)
  const [password, setPassword] = useState('')
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    requestEntitlement(token, endpoint)
      .then((data) => { if (active) setStatus(data) })
      .catch(() => { if (active) setError('google_link_unavailable') })
    return () => { active = false }
  }, [endpoint, token])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const proof = { password }
      if (status.linked) {
        await requestEntitlement(token, base + '/unlink', proof)
        await onLogout()
      } else {
        const challenge = await requestEntitlement(token, endpoint + '/challenge', proof)
        setLink({ challenge, token })
      }
    } catch (reason) {
      setError(reason.message === '401' ? 'google_link_reauth_failed' : 'google_link_failed')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  return <section className="mt-6 space-y-3 rounded-2xl bg-[#FFF6F1] p-5">
    <h3 className="text-sm font-semibold text-[#7B2346]">{t('account_security')}</h3>
    {error && <p role="alert" className="text-sm text-red-800">{t(error)}</p>}
    {status && !status.available && <p className="text-sm">{t('google_link_unavailable')}</p>}
    {status?.available && <p role="status" className="text-sm">
      {t(status.google_only ? 'google_only_login' : status.linked ? 'google_account_connected' : 'google_account_not_connected')}
    </p>}
    {status?.available && !status.google_only && (link ? <>
      <GoogleSignIn link={link} onSuccess={(data) => { setStatus(data); setLink(null) }} />
      <button type="button" className="min-h-11 text-sm underline" onClick={() => setLink(null)}>{t('cancel')}</button>
    </> : <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        {t('current_password')}
        <input required type="password" autoComplete="current-password" maxLength={128}
          value={password} onChange={(event) => setPassword(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded-xl border border-[#E8C3CC] bg-white px-3" />
      </label>
      {status.linked && <p className="text-xs">{t('google_disconnect_sign_out')}</p>}
      <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-[#7B2346] px-5 text-sm text-white disabled:opacity-60">
        {t(status.linked ? 'google_disconnect' : 'google_connect')}
      </button>
    </form>)}
  </section>
}
