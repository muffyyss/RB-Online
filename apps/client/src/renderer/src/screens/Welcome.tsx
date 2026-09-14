import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { RegisterForm, TextField } from './Register.js'

type Tab = 'login' | 'register'

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await window.rb.auth.login(username, password)
    setBusy(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <TextField label="Username" value={username} onChange={setUsername} autoComplete="username" />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      {error && <div className="error">{error}</div>}
      <button className="primary" type="submit" disabled={busy || !username || !password}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  )
}

function ServerAddress() {
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.rb.settings.get().then((s) => setUrl(s.serverUrl))
  }, [])

  async function save() {
    const result = await window.rb.settings.setServerUrl(url)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setEditing(false)
    setUrl((await window.rb.settings.get()).serverUrl)
  }

  if (!editing) {
    return (
      <div className="server muted">
        Server: <code>{url}</code>{' '}
        <button className="link" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    )
  }
  return (
    <div className="server">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://rb.example.com"
      />
      <button onClick={() => void save()}>Save</button>
      <button className="link" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export function Welcome() {
  const [tab, setTab] = useState<Tab>('login')
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestBusy, setGuestBusy] = useState(false)

  async function playAsGuest() {
    setGuestBusy(true)
    setGuestError(null)
    const result = await window.rb.auth.playAsGuest()
    setGuestBusy(false)
    if (!result.ok) setGuestError(result.message)
  }

  return (
    <div className="welcome">
      <section className="hero">
        <h1>Riftbound Online</h1>
        <p className="muted">
          An unofficial, non-commercial fan client for playing Riftbound with friends.
        </p>
      </section>

      <section className="card auth">
        <div className="segmented">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            Log in
          </button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
            Register
          </button>
        </div>
        {tab === 'login' ? <LoginForm /> : <RegisterForm />}

        <div className="divider">
          <span>or</span>
        </div>
        <button className="secondary wide" onClick={() => void playAsGuest()} disabled={guestBusy}>
          {guestBusy ? 'Starting…' : 'Play as guest'}
        </button>
        <p className="hint center">Guests can join a friend’s room with a code, but cannot host.</p>
        {guestError && <div className="error">{guestError}</div>}
      </section>

      <ServerAddress />
    </div>
  )
}
