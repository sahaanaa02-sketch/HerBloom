
import { useState } from 'react'
import {
  ShieldCheck,
  Mail,
  LockKeyhole,
  ArrowRight,
  ArrowLeft,
  LoaderCircle,
} from 'lucide-react'

import logo from '../../assets/logo.png'

import {
  loginAdmin,
  setupAdmin2FA,
  verifyAdmin2FA,
} from '../../services/adminAuthApi'


export default function AdminAuth({
  onSuccess,
  onBack,
}) {
  const [step, setStep] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [setupKey, setSetupKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await loginAdmin(
        email.trim(),
        password
      )

      if (!result.requires_2fa || !result.challenge_token) {
        throw new Error('Unexpected admin login response.')
      }

      setChallengeToken(result.challenge_token)
      setPassword('')
      setCode('')

      if (result.setup_required) {
        const setup = await setupAdmin2FA(
          result.challenge_token
        )

        const uri = new URL(setup.otpauth_uri)
        const secret = uri.searchParams.get('secret')

        if (!secret) {
          throw new Error('Authenticator setup key missing.')
        }

        setSetupKey(secret)
        setStep('setup')
      } else {
        setStep('verify')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await verifyAdmin2FA(
        challengeToken,
        code.trim()
      )

      if (!result.access_token || !result.admin) {
        throw new Error('Invalid authentication response.')
      }

      setSetupKey('')
      setChallengeToken('')
      setCode('')

      onSuccess({
        ...result.admin,
        access_token: result.access_token,
        role: 'ADMIN',
        adminAuthenticated: true,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function returnToLogin() {
    setStep('login')
    setChallengeToken('')
    setSetupKey('')
    setCode('')
    setError('')
  }

  const inputClass =
    'w-full rounded-2xl border border-[#E9CCD5] bg-[#FFF9F7] px-4 py-3.5 text-[#3A1224] outline-none transition focus:border-[#7B2346] focus:ring-2 focus:ring-[#F6D3DB]'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF6F1] px-5 py-10">

      <div className="w-full max-w-md rounded-[30px] border border-[#F0D8DE] bg-white p-8 shadow-xl md:p-10">

        <div className="mb-7 text-center">
          <img
            src={logo}
            alt="HerBloom"
            className="mx-auto mb-4 h-16 w-auto object-contain"
          />

          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FCEBF0] text-[#7B2346]">
            <ShieldCheck size={25} />
          </div>

          <h1
            className="text-3xl text-[#3A1224]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {step === 'login'
              ? 'Admin Sign In'
              : step === 'setup'
                ? 'Secure Your Account'
                : 'Two-Factor Verification'}
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#765363]">
            {step === 'login'
              ? 'Sign in to your HerBloom administration workspace.'
              : step === 'setup'
                ? 'Connect your authenticator app to protect your account.'
                : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">

            <div>
              <label htmlFor="admin-email" className="mb-2 block text-sm font-semibold text-[#3A1224]">
                Admin Email
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-4 top-4 text-[#7B2346]"
                />

                <input id="admin-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your admin email"
                  className={`${inputClass} pl-11`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-[#3A1224]">
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  size={18}
                  className="absolute left-4 top-4 text-[#7B2346]"
                />

                <input id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={`${inputClass} pl-11`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7B2346] py-3.5 font-semibold text-white transition hover:bg-[#5F1B36] disabled:opacity-60"
            >
              {loading
                ? <LoaderCircle className="animate-spin" size={19} />
                : <>Continue Securely <ArrowRight size={18} /></>}
            </button>
          </form>
        )}

        {step === 'setup' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#FFF6F1] p-5 text-sm leading-7 text-[#765363]">
              <p>1. Open Google Authenticator.</p>
              <p>2. Select Enter a setup key.</p>
              <p>3. Account: HerBloom Admin.</p>
              <p>4. Enter the key below as a time-based key.</p>
            </div>

            <div className="rounded-xl border border-[#E9CCD5] bg-[#FFF9F7] p-4">
              <p className="mb-2 text-xs font-semibold text-[#765363]">
                Private setup key
              </p>
              <p className="break-all font-mono text-sm text-[#3A1224]">
                {setupKey}
              </p>
            </div>

            <p className="text-xs text-[#765363]">
              Keep this key private. Never share it with anyone.
            </p>

            <button
              type="button"
              onClick={() => {
                setSetupKey('')
                setStep('verify')
              }}
              className="w-full rounded-2xl bg-[#7B2346] py-3.5 font-semibold text-white"
            >
              Continue to Verification
            </button>
          </div>
        )}

        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-5">
            <label htmlFor="admin-otp" className="block text-center text-sm font-semibold text-[#3A1224]">
              Authenticator Code
            </label>

            <input id="admin-otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, ''))
              }
              placeholder="000000"
              className={`${inputClass} text-center font-mono text-2xl tracking-[0.35em]`}
            />

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7B2346] py-3.5 font-semibold text-white disabled:opacity-60"
            >
              {loading
                ? <LoaderCircle className="animate-spin" size={19} />
                : <>Verify and Sign In <ShieldCheck size={18} /></>}
            </button>
          </form>
        )}

        {(step !== 'login' || onBack) && <button
          type="button"
          onClick={step === 'login' ? onBack : returnToLogin}
          className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-medium text-[#7B2346]"
        >
          <ArrowLeft size={16} />
          {step === 'login' ? 'Back to Home' : 'Back to Login'}
        </button>}
      </div>
    </div>
  )
}
