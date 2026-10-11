import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { BrandMark } from '../components/common'
import { login } from '../lib/auth'
import type { Session } from '../types'

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const session = login(username, password)
    if (!session) {
      setError('That username and password don’t match. Please check and try again.')
      return
    }
    onLogin(session)
  }

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <LoginShapes />
        <div className="tagline">
          <h2>Fewer surprises, better conversations.</h2>
          <p>Keep track of medicines and how you feel day to day — and walk into every doctor visit prepared.</p>
        </div>
      </section>

      <main className="login-panel">
        <form className="login-form stack" onSubmit={submit} noValidate style={{ '--gap': '18px' } as React.CSSProperties}>
          <div>
            <div className="brand">
              <BrandMark />
              MedWatch
            </div>
            <h1>Welcome back</h1>
            <p className="muted">Sign in to see your medicines and daily check-ins.</p>
          </div>

          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError('')
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap">
              <input
                id="password"
                className="input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error' : undefined}
                style={{ paddingRight: 52 }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <p id="login-error" className="error-text" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary">
            Sign in
          </button>

          <div className="demo-creds">
            <strong>Demo accounts</strong>
            <br />
            Patient: <code>babson</code> / <code>babson</code>
            <br />
            Caregiver: <code>babson1</code> / <code>babson1</code>
          </div>
        </form>
      </main>
    </div>
  )
}

function LoginShapes() {
  return (
    <svg className="shapes" viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice">
      <circle cx="470" cy="120" r="150" fill="#d9e8e4" />
      <circle cx="90" cy="250" r="110" fill="#f3dfd2" opacity="0.8" />
      <path d="M0 520 C150 450 300 560 600 470 L600 700 L0 700 Z" fill="#cfe0db" opacity="0.8" />
      <path d="M0 590 C180 530 360 640 600 560 L600 700 L0 700 Z" fill="#b9d1cb" opacity="0.7" />
      {/* Soft leaves */}
      <g transform="translate(400 330) rotate(-25)" fill="#8fae8b" opacity="0.55">
        <path d="M0 0 C40 -60 120 -60 150 0 C120 60 40 60 0 0 Z" />
        <path d="M0 0 L150 0" stroke="#6f9170" strokeWidth="3" fill="none" />
      </g>
      <g transform="translate(330 390) rotate(30)" fill="#a8c3a2" opacity="0.5">
        <path d="M0 0 C30 -45 90 -45 115 0 C90 45 30 45 0 0 Z" />
      </g>
      <g transform="translate(150 420) rotate(-60)" fill="#d98c6b" opacity="0.28">
        <path d="M0 0 C30 -40 80 -40 100 0 C80 40 30 40 0 0 Z" />
      </g>
      <circle cx="250" cy="150" r="18" fill="#d98c6b" opacity="0.35" />
      <circle cx="520" cy="420" r="10" fill="#4a7c7c" opacity="0.25" />
    </svg>
  )
}
