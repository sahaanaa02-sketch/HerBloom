import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { apiBase } from '../services/apiBase'
import { resolveSharedLogin } from '../services/sharedLogin'

let googleScript
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    const timeout = window.setTimeout(fail, 10000)
    script.onload = () => {
      if (!window.google?.accounts?.id) return fail()
      window.clearTimeout(timeout)
      resolve(window.google.accounts.id)
    }
    script.onerror = fail
    function fail() {
      window.clearTimeout(timeout)
      script.onload = null
      script.onerror = null
      script.remove()
      googleScript = undefined
      reject(new Error('Google could not be loaded. Please try again.'))
    }
    document.head.append(script)
  })
  return googleScript
}

function request(path, signal, body) {
  return fetch(apiBase + '/auth/google' + path, {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(body ? 15000 : 8000)]),
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export default function GoogleSignIn({ children, disabled, onSuccess, style }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [enabled, setEnabled] = useState(true)
  const [waiting, setWaiting] = useState(true)
  const [error, setError] = useState('')
  const buttonHost = useRef(null)
  const success = useRef(onSuccess)

  useEffect(() => { success.current = onSuccess }, [onSuccess])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const host = buttonHost.current
    let submitting = false
    const signal = controller.signal

    function fail(reason) {
      if (signal.aborted) return
      setError(reason.name === 'TimeoutError' ? "common:google_sign_in_timed_out_please_try_again" : reason.message)
      setWaiting(false)
      setEnabled(false)
    }

    async function start() {
      const response = await request('/challenge', signal)
      const result = await response.json()
      if (!response.ok) {
        throw new Error(typeof result.detail === 'string' ? result.detail : 'Google sign-in is currently unavailable.')
      }
      const provider = await loadGoogle()
      if (signal.aborted) return
      provider.initialize({
        client_id: result.client_id,
        nonce: result.nonce,
        ux_mode: 'popup',
        auto_select: false,
        use_fedcm_for_button: true,
        callback: async ({ credential }) => {
          if (signal.aborted || submitting) return
          submitting = true
          setWaiting(true)
          try {
            const response = await request('', signal, { credential, challenge: result.challenge })
            const { mother } = await resolveSharedLogin(response, false)
            if (!signal.aborted) success.current({ ...mother.user, access_token: mother.access_token })
          } catch (reason) {
            fail(reason)
          } finally {
            if (!signal.aborted) setWaiting(false)
          }
        },
      })
      provider.renderButton(host, { theme: 'outline', size: 'large', text: 'continue_with' })
      setWaiting(false)
    }

    start().catch(fail)
    return () => {
      controller.abort()
      host.replaceChildren()
    }
  }, [enabled])

  return <div className="space-y-2">
    {enabled ? <div className={disabled ? 'pointer-events-none opacity-60' : ''} inert={disabled}>
      {waiting && <p role="status" className="text-center text-sm text-[#7B2346]">{uiText('preparing_google_sign_in')}</p>}
      <div ref={buttonHost} className="flex justify-center" />
      <button type="button" onClick={() => { setEnabled(false); setWaiting(false) }}
        className="mx-auto block min-h-11 text-sm text-[#7B2346] underline">{uiText('cancel_google_sign_in')}</button>
    </div> : <button type="button" disabled={disabled} style={style}
      onClick={() => { setError(''); setWaiting(true); setEnabled(true) }}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#E8C3CC] bg-white font-medium text-[#3A1224] transition hover:bg-[#FFF6F1] disabled:opacity-60">
      {children}
    </button>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error.startsWith('common:') ? auditText(error) : error}</p>}
  </div>
}
