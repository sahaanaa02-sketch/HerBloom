import { useEffect, useState } from 'react'
import { apiBase } from '../services/apiBase'

const titles = { 'forgot-password': 'Reset your password', 'reset-password': 'Choose a new password', 'verify-email': 'Verify your email' }

export default function AccountRecovery({ mode }) {
  const [token] = useState(() => window.location.hash.slice(1))
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const forgot = mode === 'forgot-password'
  const reset = mode === 'reset-password'

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const body = forgot ? { email: value } : reset ? { token, password: value } : { token }
    try {
      const response = await fetch(apiBase + '/auth/' + mode, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'This request could not be completed.')
      setValue(''); setMessage(result.message)
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-5 text-[#3A1224]">
    <section className="w-full max-w-md space-y-4 rounded-3xl border border-[#F6D3DB] bg-white p-7">
      <h1 className="text-2xl font-semibold">{titles[mode]}</h1>
      {message ? <p role="status">{message}</p> : (!forgot && !token) ? <p role="alert">Open the one-time link from your email.</p> :
        <form className="space-y-4" onSubmit={submit}>
          {(forgot || reset) && <label className="block">{forgot ? 'Email' : 'New password'}
            <input className="mt-1 block w-full rounded-lg border border-[#F6D3DB] px-3 py-2" required
              type={forgot ? 'email' : 'password'} autoComplete={forgot ? 'email' : 'new-password'}
              minLength={reset ? 8 : undefined} maxLength={reset ? 128 : 255} value={value} onChange={(event) => setValue(event.target.value)} />
          </label>}
          {error && <p role="alert" className="text-red-800">{error}</p>}
          <button disabled={busy} className="rounded-full bg-[#7B2346] px-5 py-2 text-white" type="submit">
            {forgot ? 'Send reset link' : reset ? 'Set password' : 'Verify email'}
          </button>
        </form>}
      <a href="/" className="inline-block text-[#7B2346] underline">Back to HerBloom</a>
    </section>
  </main>
}
