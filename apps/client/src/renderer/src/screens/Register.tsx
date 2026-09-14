import { useState } from 'react'
import type { FormEvent } from 'react'

import { checkRegistration } from '@rb/protocol'
import type { RegisterFieldError } from '@rb/protocol'

type Field = RegisterFieldError['field']

/**
 * Registration, checked with the same rules the server runs before it is sent,
 * so most mistakes show up without a round trip. The server still decides.
 */
export function RegisterForm() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirm: '',
    inviteCode: '',
    acceptedTerms: false,
  })
  const [errors, setErrors] = useState<Partial<Record<Field | 'confirm', string>>>({})
  const [busy, setBusy] = useState(false)

  const update = (field: keyof typeof form) => (value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const { confirm, ...request } = form
    const found: Partial<Record<Field | 'confirm', string>> = {}
    for (const error of checkRegistration(request)) found[error.field] ??= error.message
    if (confirm !== form.password) found.confirm = 'The passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    const result = await window.rb.auth.register(request)
    setBusy(false)
    if (!result.ok) {
      const fromServer: Partial<Record<Field, string>> = {}
      for (const error of result.errors) fromServer[error.field] ??= error.message
      setErrors(fromServer)
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      <TextField
        label="Username"
        value={form.username}
        onChange={update('username')}
        error={errors.username}
        autoComplete="username"
        hint="3–16 letters, numbers, _ or -"
      />
      <TextField
        label="Email"
        type="email"
        value={form.email}
        onChange={update('email')}
        error={errors.email}
        autoComplete="email"
      />
      <TextField
        label="Password"
        type="password"
        value={form.password}
        onChange={update('password')}
        error={errors.password}
        autoComplete="new-password"
        hint="8–16 letters and numbers"
      />
      <TextField
        label="Confirm password"
        type="password"
        value={form.confirm}
        onChange={update('confirm')}
        error={errors.confirm}
        autoComplete="new-password"
      />
      <TextField
        label="Invite code"
        value={form.inviteCode}
        onChange={update('inviteCode')}
        error={errors.inviteCode}
        hint="Ask whoever runs the server"
      />
      <label className="check">
        <input
          type="checkbox"
          checked={form.acceptedTerms}
          onChange={(e) => update('acceptedTerms')(e.target.checked)}
        />
        I understand this is an unofficial fan project, not affiliated with Riot Games.
      </label>
      {errors.acceptedTerms && <div className="error">{errors.acceptedTerms}</div>}
      {errors.form && <div className="error">{errors.form}</div>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}

export function TextField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | undefined
  hint?: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="field">
      <span className="label">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        autoComplete={props.autoComplete ?? 'off'}
        aria-invalid={props.error ? true : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error ? (
        <span className="error">{props.error}</span>
      ) : (
        props.hint && <span className="hint">{props.hint}</span>
      )}
    </label>
  )
}
