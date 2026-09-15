import { useEffect } from 'react'

import { Builder } from './screens/Builder.js'
import { Decks } from './screens/Decks.js'
import { Home } from './screens/Home.js'
import { Match } from './screens/Match.js'
import { RegisterForm } from './screens/Register.js'
import { Welcome } from './screens/Welcome.js'
import { useStore } from './store.js'
import type { ConnectionStatus } from '../../shared/bridge.js'

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  offline: 'Offline',
  connecting: 'Connecting…',
  online: 'Online',
  retrying: 'Reconnecting…',
  outdated: 'Update required',
  replaced: 'Signed in elsewhere',
}

function Notice() {
  const notice = useStore((s) => s.notice)
  const dismiss = useStore((s) => s.dismissNotice)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(dismiss, 6000)
    return () => clearTimeout(timer)
  }, [notice, dismiss])
  if (!notice) return null
  return (
    <div className="notice" role="alert" onClick={dismiss}>
      {notice.message}
    </div>
  )
}

function Header() {
  const auth = useStore((s) => s.auth)
  const connection = useStore((s) => s.connection)
  const screen = useStore((s) => s.screen)
  const inMatch = useStore((s) => s.match !== null)
  const go = useStore((s) => s.go)
  if (auth.kind === 'signed-out') return null

  const name = auth.kind === 'user' ? auth.user.username : auth.guest.name
  return (
    <header className="header">
      <div className="brand">Riftbound Online</div>
      <nav className="tabs" hidden={inMatch}>
        <button
          className={screen.name === 'home' ? 'tab active' : 'tab'}
          onClick={() => go({ name: 'home' })}
        >
          Play
        </button>
        <button
          className={screen.name === 'decks' || screen.name === 'builder' ? 'tab active' : 'tab'}
          onClick={() => go({ name: 'decks' })}
        >
          Decks
        </button>
      </nav>
      <div className="who">
        <span className={`dot ${connection}`} title={CONNECTION_LABEL[connection]} />
        <span className="muted">{CONNECTION_LABEL[connection]}</span>
        <span className="name">{name}</span>
        {auth.kind === 'guest' && (
          <button className="link" onClick={() => go({ name: 'register' })}>
            Create account
          </button>
        )}
        <button className="link" onClick={() => void window.rb.auth.logout()}>
          {auth.kind === 'guest' ? 'Leave' : 'Log out'}
        </button>
      </div>
    </header>
  )
}

export function App() {
  const ready = useStore((s) => s.ready)
  const auth = useStore((s) => s.auth)
  const screen = useStore((s) => s.screen)
  const match = useStore((s) => s.match)

  if (!ready) return <div className="splash">Loading…</div>

  return (
    <div className="app">
      <Header />
      <main className="content">
        {auth.kind === 'signed-out' ? (
          <Welcome />
        ) : match ? (
          // A match takes over the screen until it is dismissed.
          <Match session={match} />
        ) : screen.name === 'decks' ? (
          <Decks />
        ) : screen.name === 'builder' ? (
          <Builder presetId={screen.presetId} />
        ) : screen.name === 'register' ? (
          <div className="narrow">
            <h1>Create an account</h1>
            <p className="muted">
              Your guest decks stay on this computer, and your guest history moves to the new
              account.
            </p>
            <RegisterForm />
          </div>
        ) : (
          <Home />
        )}
      </main>
      <Notice />
    </div>
  )
}
