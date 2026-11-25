import { useTranslation } from 'react-i18next'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { apiBase } from '../services/apiBase'
import { resolveSharedLogin } from '../services/sharedLogin'
import { createGoogleButtonSession } from './googleButtonSession'

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

function request(path, signal, body, token) {
  return fetch(apiBase + '/auth/google' + path, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const getButtonSession = createGoogleButtonSession(async () => {
  const response = await request('/challenge', undefined)
  const result = await response.json()
  if (!response.ok) {
    throw new Error(typeof result.detail === 'string' ? result.detail : 'Google sign-in is currently unavailable.')
  }
  return { provider: await loadGoogle(), result }
})

export default function GoogleSignIn({ disabled, onSuccess, link }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const { t: authText } = useTranslation('auth')
  const [enabled, setEnabled] = useState(true)
  const [waiting, setWaiting] = useState(true)
  const [error, setError] = useState('')
  const [linkTicket, setLinkTicket] = useState(null)
  const [linkError, setLinkError] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const linkRequest = useRef(null)
  const linkDialog = useRef(null)
  const dialogId = useId()
  const buttonHost = useRef(null)
  const success = useRef(onSuccess)
  const sessionForButton = useMemo(() => link
    ? createGoogleButtonSession(async () => ({ provider: await loadGoogle(), result: link.challenge }))
    : getButtonSession, [link])

  useEffect(() => { success.current = onSuccess }, [onSuccess])

  useEffect(() => {
    if (!enabled || linkTicket) return
    const controller = new AbortController()
    const host = buttonHost.current
    let detach
    const signal = controller.signal

    function fail(reason) {
      if (signal.aborted) return
      setError(reason.name === 'TimeoutError' ? "common:google_sign_in_timed_out_please_try_again" : reason.message)
      setWaiting(false)
      setEnabled(false)
    }

    async function start() {
      const session = await sessionForButton()
      if (signal.aborted) return
      detach = session.attach(async ({ credential }, challenge) => {
        if (signal.aborted) return
        setWaiting(true)
        try {
          const response = await request(link ? '/link' : '', signal, { credential, challenge }, link?.token)
          if (link) {
            if (!response.ok) throw new Error('common:google_link_failed')
            const status = await response.json()
            if (!signal.aborted) success.current(status)
          } else {
            if (response.status === 409) {
              const conflict = await response.clone().json()
              if (conflict.code === 'google_link_required' && typeof conflict.ticket === 'string') {
                if (!signal.aborted) setLinkTicket(conflict.ticket)
                return
              }
            }
            const { mother } = await resolveSharedLogin(response, false)
            if (!signal.aborted) success.current({ ...mother.user, access_token: mother.access_token })
          }
        } catch (reason) {
          fail(reason)
        } finally {
          if (!signal.aborted) setWaiting(false)
        }
      }, () => fail(new Error('common:google_sign_in_timed_out_please_try_again')))
      session.provider.renderButton(host, { theme: 'outline', size: 'large', text: 'continue_with' })
      setWaiting(false)
    }

    start().catch(fail)
    return () => {
      controller.abort()
      detach?.()
      host.replaceChildren()
    }
  }, [enabled, link, linkTicket, sessionForButton])

  useEffect(() => () => linkRequest.current?.abort(), [])

  useEffect(() => {
    const dialog = linkDialog.current
    if (!linkTicket || !dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [linkTicket])

  function cancelLink() {
    setLinkTicket(null)
    setLinkError('')
    setWaiting(true)
  }

  async function connectFromLogin(event) {
    event.preventDefault()
    if (linkRequest.current) return
    const password = new FormData(event.currentTarget).get('password')
    event.currentTarget.reset()
    const controller = new AbortController()
    linkRequest.current = controller
    setLinkBusy(true)
    setLinkError('')
    try {
      const response = await request('/link-login', controller.signal, { ticket: linkTicket, password })
      const { mother } = await resolveSharedLogin(response, false)
      if (!controller.signal.aborted) success.current({ ...mother.user, access_token: mother.access_token })
    } catch (reason) {
      if (!controller.signal.aborted) {
        setLinkError(reason.status === 429 ? 'google_link_rate_limit' : 'google_link_login_failed')
      }
    } finally {
      linkRequest.current = null
      if (!controller.signal.aborted) setLinkBusy(false)
    }
  }

  if (linkTicket) return (
    <div className="min-h-11">
      <dialog ref={linkDialog} aria-labelledby={dialogId} aria-describedby={dialogId + '-help'}
        onCancel={(event) => {
          event.preventDefault()
          if (!linkRequest.current) cancelLink()
        }}
        className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-2xl border border-[#E8C3CC] bg-white p-5 text-[#3A1224] shadow-xl backdrop:bg-[#3A1224]/40">
        <form onSubmit={connectFromLogin} className="space-y-3">
          <h2 id={dialogId} className="text-lg font-semibold">{authText('google_link_login_title')}</h2>
          <p id={dialogId + '-help'} className="text-sm">{authText('google_link_login_help')}</p>
          <label className="block text-sm">
            {authText('password')}
            <input autoFocus autoComplete="current-password" name="password" type="password" required maxLength={128}
              disabled={linkBusy} className="mt-1 block min-h-11 w-full rounded-lg border border-[#E8C3CC] px-3" />
          </label>
          {linkError && <p role="alert" className="text-sm text-red-800">{authText(linkError)}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" disabled={linkBusy} className="min-h-11 px-3 underline" onClick={cancelLink}>
              {authText('google_link_login_cancel')}
            </button>
            <button type="submit" disabled={linkBusy} className="min-h-11 rounded-lg bg-[#7B2346] px-3 text-white">
              {authText(linkBusy ? 'please_wait' : 'google_link_login_confirm')}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )

  return <div className="space-y-2">
    {enabled ? <div className={disabled ? 'pointer-events-none opacity-60' : ''} inert={disabled}>
      {waiting && <p role="status" className="text-center text-sm text-[#7B2346]">{uiText('preparing_google_sign_in')}</p>}
      <div ref={buttonHost} className="flex justify-center" />
    </div> : <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
      <p>{error.startsWith('common:') ? auditText(error) : error}</p>
      {!link && <button type="button" disabled={disabled}
        onClick={() => { setError(''); setWaiting(true); setEnabled(true) }}
        className="mt-2 min-h-11 font-medium underline disabled:opacity-60">
        {uiText('retry')}
      </button>}
    </div>}
  </div>
}
