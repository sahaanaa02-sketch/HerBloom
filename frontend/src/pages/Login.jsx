import { apiBase as API_URL } from '../services/apiBase'
import { useState } from 'react'
import { User, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react'
import logo from '../assets/logo.png'
import login from '../assets/login image.jpg'

/* CARD SIZE */
const CARD_HEIGHT = 'min(90vh, 810px)'
const CARD_RATIO = 1.55



const u = (k) => `calc(var(--h) * ${k})`

const css = `
.hb-card {
  --h: 600px;
  width: 100%;
  max-width: 480px;
  min-height: 600px;
}

@media (min-width: 768px) {
  .hb-card {
    --h: ${CARD_HEIGHT};
    height: var(--h);
    min-height: 0;
    max-width: none;
    width: min(96vw, calc(var(--h) * ${CARD_RATIO}));
  }
}

.hb-input:-webkit-autofill,
.hb-input:-webkit-autofill:hover,
.hb-input:-webkit-autofill:focus,
.hb-input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #3A1224 !important;
  caret-color: #3A1224;
  transition: background-color 9999s ease-in-out 0s;
}
`

function Field({ icon: Icon, label, right, ...props }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>

      <div
        className="flex items-center gap-3 rounded-xl border border-[#E8C3CC] bg-white px-4 focus-within:border-[#7B2346] focus-within:ring-2 focus-within:ring-[#F6D3DB]"
        style={{ height: u(0.07) }}
      >
        <Icon
          size={18}
          className="shrink-0 text-[#7B2346]"
          aria-hidden="true"
        />

        <input
          className="hb-input w-full bg-transparent text-[#3A1224] placeholder:text-[#8A6575] outline-none"
          style={{ fontSize: u(0.0215) }}
          {...props}
        />

        {right}
      </div>
    </label>
  )
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />

      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />

      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />

      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export default function Login({ onSuccess, onGoogle, onBack }) {
  const [mode, setMode] = useState('login')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const isRegister = mode === 'register'

  const update = (e) => {
    const { name, value } = e.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    setError('')
  }

  // Clear fields when switching between Login and Register
  const changeMode = (newMode) => {
    setMode(newMode)

    setForm({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    })

    setShowPw(false)
    setShowConfirmPw(false)
    setError('')
  }

  // Connect to FastAPI backend
  const submit = async (e) => {
    e.preventDefault()

    if (loading) return

    setError('')

    // Confirm password validation
    if (isRegister && form.password !== form.confirmPassword) {
      setError('Password and Confirm Password do not match.')
      return
    }

    setLoading(true)

    try {
      const email = form.email.trim().toLowerCase()

      let response

      if (isRegister) {
        // REGISTER: Send JSON data to FastAPI
        response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: form.name.trim(),
            email,
            password: form.password,
          }),
        })
      } else {
        // LOGIN: OAuth2 form data
        const loginData = new URLSearchParams()

        loginData.append('username', email)
        loginData.append('password', form.password)

        response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: loginData.toString(),
        })
      }

      const data = await response.json()

      // Handle backend errors
      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'Something went wrong. Please try again.'
        )
      }

      // Send actual backend user and token to App.jsx

onSuccess?.({
  id: data.user.id,
  name: data.user.full_name,
  email: data.user.email,
  role: data.user.role,
  username: data.user.username,
  access_token: data.access_token,
  token_type: data.token_type,

  // Distinguish new registration from login
  isNewRegistration: isRegister,
})


    } catch (err) {
      console.error('Authentication error:', err)

      if (err instanceof TypeError) {
        setError(
          'Cannot connect to the server. Please make sure the HerBloom backend is running.'
        )
      } else {
        setError(err.message || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const tab = (key, text) => (
    <button
      type="button"
      onClick={() => changeMode(key)}
      aria-pressed={mode === key}
      style={{
        paddingBlock: u(0.018),
        fontSize: u(0.0235),
      }}
      className={
        'transition ' +
        (mode === key
          ? 'border-b-2 border-[#7B2346] font-semibold text-[#3A1224]'
          : 'border-b border-[#E8C3CC] text-[#6B4455]')
      }
    >
      {text}
    </button>
  )

  const bigBtn = {
    height: u(0.075),
    fontSize: u(0.0235),
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF6F1] p-4 md:h-screen md:overflow-hidden">
      <style>{css}</style>

      <div className="hb-card flex overflow-hidden rounded-3xl border border-[#E8C3CC] bg-[#FFFBF8] shadow-xl">

        {/* LEFT IMAGE PANEL */}
        <div className="relative hidden h-full w-[40%] shrink-0 md:block">
          <img
            src={login}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover object-right"
          />

          <div className="absolute inset-0 bg-gradient-to-b from-[#FFF6F1]/90 via-transparent to-[#7B2346]/85" />

          <div
            className="absolute inset-0 z-10 flex flex-col"
            style={{
              paddingInline: u(0.056),
              paddingTop: u(0.09),
              paddingBottom: u(0.045),
            }}
          >
            <h1
              className="font-['Playfair_Display'] font-bold text-[#7B2346]"
              style={{
                fontSize: u(0.06),
                lineHeight: 1.15,
              }}
            >
              A stronger
              <br />
              you starts
              <br />
              here.
            </h1>

            <p
              className="text-[#3A1224]"
              style={{
                fontSize: u(0.026),
                lineHeight: 1.45,
                marginTop: u(0.028),
              }}
            >
              Support for today.
              <br />
              A healthier tomorrow.
            </p>

            <div
              className="bg-[#D9A25B]"
              style={{
                width: u(0.1),
                height: 2,
                marginTop: u(0.026),
              }}
            />

            <p
              className="mt-auto text-white"
              style={{
                fontSize: u(0.021),
                lineHeight: 1.7,
                letterSpacing: '0.2em',
              }}
            >
              REAL WOMEN
              <br />
              BRIGHTER TOMORROWS
            </p>
          </div>
        </div>

        {/* RIGHT FORM PANEL */}
        <div className="relative flex min-w-0 flex-1 flex-col justify-center px-[clamp(20px,3.5vw,48px)] py-6">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-[clamp(20px,3.5vw,48px)] top-4 z-20 inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-xs font-semibold text-[#7B2346] transition hover:bg-[#F6D3DB]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7B2346]"
              aria-label="Back to Home"
            >
              <ArrowLeft size={16} />
              Back to Home
            </button>
          )}
          <div
            className="mx-auto w-full"
            style={{
              maxWidth: `max(340px, ${u(0.62)})`,
            }}
          >
            <img
              src={logo}
              alt="HerBloom"
              className="mx-auto w-auto"
              style={{ height: u(0.175) }}
            />

            {/* LOGIN / REGISTER TABS */}
            <div
              className="grid grid-cols-2"
              style={{ marginTop: u(0.03) }}
            >
              {tab('login', 'Log in')}
              {tab('register', 'Create account')}
            </div>

            <form
              onSubmit={submit}
              autoComplete="off"
              className="flex flex-col"
              style={{
                marginTop: u(0.03),
                gap: u(0.018),
              }}
            >
              {isRegister && (
                <Field
                  icon={User}
                  label="Name"
                  name="name"
                  type="text"
                  placeholder="Name"
                  autoComplete="off"
                  required
                  value={form.name}
                  onChange={update}
                />
              )}

              {/* EMAIL */}
              <Field
                icon={Mail}
                label="Email"
                name="email"
                type="email"
                placeholder="Email"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                value={form.email}
                onChange={update}
              />

              {/* PASSWORD */}
              <Field
                icon={Lock}
                label="Password"
                name="password"
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="new-password"
                minLength={isRegister ? 8 : undefined}
                maxLength={128}
                required
                value={form.password}
                onChange={update}
                right={
                  <button
                    type="button"
                    onClick={() => setShowPw((prev) => !prev)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? (
                      <EyeOff size={18} className="text-[#7B2346]" />
                    ) : (
                      <Eye size={18} className="text-[#7B2346]" />
                    )}
                  </button>
                }
              />

              {/* CONFIRM PASSWORD - REGISTER ONLY */}
              {isRegister && (
                <Field
                  icon={Lock}
                  label="Confirm Password"
                  name="confirmPassword"
                  type={showConfirmPw ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  autoComplete="new-password"
                  maxLength={128}
                  required
                  value={form.confirmPassword}
                  onChange={update}
                  right={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((prev) => !prev)}
                      aria-label={
                        showConfirmPw
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                    >
                      {showConfirmPw ? (
                        <EyeOff size={18} className="text-[#7B2346]" />
                      ) : (
                        <Eye size={18} className="text-[#7B2346]" />
                      )}
                    </button>
                  }
                />
              )}

              {/* BACKEND ERROR MESSAGE */}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              {!isRegister && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setError('Forgot password feature is not available yet.')
                    }}
                    className="font-medium text-[#7B2346] hover:underline"
                    style={{ fontSize: u(0.02) }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* SUBMIT */}
              {!isRegister && <a href="/forgot-password" className="mb-3 block text-right text-sm text-[#7B2346] underline">Forgot password?</a>}
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...bigBtn,
                  marginTop: u(0.012),
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7B2346] font-medium text-white transition hover:bg-[#651C39] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? 'Please wait...'
                  : isRegister
                    ? 'Create account'
                    : 'Log in'}

                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            {/* DIVIDER */}
            <div
              className="flex items-center gap-4 text-[#6B4455]"
              style={{
                marginBlock: u(0.026),
                fontSize: u(0.02),
              }}
            >
              <div className="h-px flex-1 bg-[#E8C3CC]" />
              or
              <div className="h-px flex-1 bg-[#E8C3CC]" />
            </div>

            {/* GOOGLE LOGIN */}
            <button
              type="button"
              onClick={onGoogle}
              style={bigBtn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#E8C3CC] bg-white font-medium text-[#3A1224] transition hover:bg-[#FFF6F1]"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
