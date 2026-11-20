import { useEffect, useState } from 'react'
import { apiBase } from '../../services/apiBase'

export default function AdminInviteSetup() {
  const [token] = useState(() => window.location.hash.slice(1))
  const [password, setPassword] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { window.history.replaceState(null,'',window.location.pathname) }, [])
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setResult(null)
    try {
      const response = await fetch(apiBase + '/api/admin/auth/accept-invite', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ token, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail ?? 'Setup could not be completed.')
      setPassword('');setResult({ success:data.message })
    } catch (reason) { setResult({ error:reason.message }) }
    finally { setBusy(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-5 text-[#3A1224]">
    <section className="w-full max-w-md space-y-4 rounded-3xl border border-[#F6D3DB] bg-white p-7">
      <h1 className="text-2xl font-semibold">Set up your admin account</h1>
      {!token ? <p>Open the one-time link in your invitation email.</p> : result?.success ? <p role="status">{result.success}</p> :
        <form onSubmit={submit} className="space-y-4">
          <label className="block">New password
            <input type="password" minLength={12} maxLength={128} autoComplete="new-password" required
              className="mt-1 block w-full rounded-lg border border-[#F6D3DB] px-3 py-2"
              value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {result?.error && <p role="alert" className="text-red-800">{result.error}</p>}
          <button type="submit" disabled={busy} className="rounded-full bg-[#7B2346] px-5 py-2 text-white">Set password</button>
        </form>}
      <a href="/admin/login" className="text-[#7B2346] underline">Admin sign-in</a>
    </section>
  </main>
}
