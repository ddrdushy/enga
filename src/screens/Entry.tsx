import { useEffect, useState } from 'react'
import type { Member } from '../lib/types'
import { Avatar } from '../ui'
import { FriendsScene, LiveSplash } from './LiveSplash'
import type { Face } from '../ui'

/** One line of the live splash: where a person is right now. */
export interface LiveRow { face: Face; who: string; headline: string; sub: string }


/**
 * The opening screen. Before sign-in it is the brand with a few sample tags.
 * Once signed in it shows, live, where each person is: a glance is enough, and a tap opens the app.
 */
export function Splash({ members, live, onOpen }: { members: Member[]; live?: LiveRow[]; onOpen?: () => void }) {
  if (live?.length) return <LiveSplash live={live} onOpen={onOpen} />
  return (
    <div className="screen pad" style={{ position: 'relative', overflow: 'hidden', justifyContent: 'flex-end', padding: '0 28px 56px', animation: 'none' }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: 330, left: -80, width: 200, height: 200, borderRadius: '50%', background: 'var(--sage)' }} />
      <div style={{ position: 'absolute', top: 36, left: 0, right: 0 }}><FriendsScene height={340} /></div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="row" style={{ gap: 0 }}>{members.map((m, i) => <Avatar key={m.slug} p={m} size={52} style={{ border: '4px solid var(--mist)', marginLeft: i ? -14 : 0, animation: `pop .5s ${0.1 * i}s cubic-bezier(.2,1.4,.4,1) both` }} />)}</div>
        <h1 className="display" style={{ margin: 0, fontSize: 104, lineHeight: 0.9, letterSpacing: -5, animation: 'pop .8s cubic-bezier(.2,1.4,.4,1) both' }}>enga<span className="q">?</span></h1>
        <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.3, color: 'var(--ink2)' }}>Who is where,<br />and where next.</div>
        <div role="img" aria-label="Loading" className="row" style={{ marginTop: 12 }}>
          <span style={{ width: 28, height: 6, borderRadius: 3, background: 'var(--ink)', animation: 'load 1.6s ease-in-out infinite' }} />
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#B4BACB' }} /><span style={{ width: 6, height: 6, borderRadius: 3, background: '#B4BACB' }} />
        </div>
      </div>
    </div>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
const MAX_TRIES = 5
const LOCK_MS = 60_000

interface LoginProps {
  members: Member[]
  demo: boolean
  /** Names that already have a PIN. null while unknown (then the person chooses the mode by hand). */
  claimed: string[] | null
  /** Circle code picked up from the invite link, if any. */
  inviteCode: string
  onSignIn: (slug: string, pin: string) => Promise<void>
  /** First time for this name: they choose their own PIN. */
  onClaim: (slug: string, pin: string, code: string) => Promise<void>
}

export function Login({ members, demo, claimed, inviteCode, onSignIn, onClaim }: LoginProps) {
  const [who, setWho] = useState(() => { try { return localStorage.getItem('enga-who') ?? members[0]?.slug ?? '' } catch { return members[0]?.slug ?? '' } })
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [tries, setTries] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [manualFirst, setManualFirst] = useState(false)
  const [code, setCode] = useState(inviteCode)
  const [codeRejected, setCodeRejected] = useState(false)
  const [firstPin, setFirstPin] = useState('')
  const locked = lockedUntil > now
  // First time for this name? Then they set their own PIN right here.
  const first = claimed ? !claimed.includes(who) : manualFirst
  const askCode = first && !demo && (!inviteCode || codeRejected)
  const name = members.find((m) => m.slug === who)?.name ?? ''

  useEffect(() => {
    if (!locked) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [locked])

  const remember = () => { try { localStorage.setItem('enga-who', who) } catch { /* ignore */ } }
  const reset = (message = '') => { setPin(''); setFirstPin(''); setError(message) }

  const submit = (full: string) => {
    if (first) {
      if (!demo && !code.trim()) return reset('Type the circle code first.')
      if (!firstPin) { setFirstPin(full); setPin(''); return }
      if (full !== firstPin) return reset('Those two did not match. Start again.')
      setBusy(true)
      onClaim(who, full, code)
        .then(remember)
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : 'That did not work.'
          if (/circle code/i.test(message)) setCodeRejected(true)
          reset(message)
        })
        .finally(() => setBusy(false))
      return
    }
    setBusy(true)
    onSignIn(who, full)
      .then(remember)
      .catch(() => {
        const n = tries + 1
        if (n >= MAX_TRIES) { setLockedUntil(Date.now() + LOCK_MS); setNow(Date.now()); setTries(0); reset('Too many tries. Wait a minute.') } else { setTries(n); reset(`Wrong PIN. ${MAX_TRIES - n} tries left.`) }
      })
      .finally(() => setBusy(false))
  }

  const press = (k: string) => {
    if (locked || busy) return
    setError('')
    if (k === 'del') return setPin(pin.slice(0, -1))
    if (pin.length >= 6) return
    const next = pin + k
    setPin(next)
    if (next.length === 6) submit(next)
  }
  const wait = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const prompt = first ? (firstPin ? 'type the same PIN again' : 'choose your own 6-digit PIN') : 'your 6-digit PIN'

  return (
    <div className="screen pad" style={{ padding: '40px 28px 24px', gap: 18 }}>
      <div className="display" style={{ fontSize: 44, lineHeight: 1, letterSpacing: -2 }}>enga<span className="q">?</span></div>
      <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>{first ? `welcome, ${name}. first time?` : 'hey, who is this?'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(members.length, 4)}, minmax(0, 1fr))`, gap: 10 }}>
        {members.map((m) => (
          <button key={m.slug} type="button" aria-pressed={who === m.slug} onClick={() => { setWho(m.slug); reset() }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px', background: 'var(--card)', border: `2px solid ${who === m.slug ? 'var(--ink)' : 'var(--card)'}`, borderRadius: 24, animation: who === m.slug ? 'pulse 2.2s ease-in-out infinite' : undefined }}>
            <Avatar p={m} size={52} /><span style={{ fontSize: 14, fontWeight: who === m.slug ? 700 : 500 }}>{m.name}</span>
          </button>
        ))}
      </div>
      {askCode && <input className="field" aria-label="Circle code" placeholder="circle code" autoCapitalize="none" autoCorrect="off" value={code} onChange={(e) => { setCode(e.target.value); setError('') }} />}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div className="small" style={{ fontSize: 15, fontWeight: 500 }}>{prompt}</div>
        <div role="img" aria-label={`${pin.length} of 6 digits entered`} className="row" style={{ gap: 14 }}>
          {Array.from({ length: 6 }, (_, i) => <span key={`${i}-${i < pin.length}`} style={{ width: 18, height: 18, borderRadius: '50%', background: i < pin.length ? 'var(--ink)' : 'transparent', border: i < pin.length ? undefined : '2px solid var(--line)', animation: i < pin.length ? 'pop .3s cubic-bezier(.2,1.6,.4,1) both' : undefined }} />)}
        </div>
        <div className="err" role="alert">{locked ? `Locked. Try again in ${wait}s.` : error}</div>
      </div>
      <div className="push" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, justifyItems: 'center', opacity: locked ? 0.4 : 1 }}>
        {KEYS.map((k, i) => k === ''
          ? <span key={i} style={{ width: 68, height: 68 }} />
          : <button key={k} type="button" disabled={locked} aria-label={k === 'del' ? 'Delete last digit' : k} onClick={() => press(k)} className="display"
              style={{ width: 68, height: 68, borderRadius: '50%', background: k === 'del' ? 'transparent' : 'var(--card)', fontSize: k === 'del' ? 16 : 28, fontWeight: 600 }}>{k === 'del' ? 'del' : k}</button>)}
      </div>
      {claimed === null && (
        <button type="button" style={{ alignSelf: 'center', minHeight: 44, fontSize: 14, fontWeight: 700, color: '#3F4A8A' }} onClick={() => { setManualFirst(!manualFirst); reset() }}>
          {manualFirst ? 'I already have a PIN' : 'first time here? set your PIN'}
        </button>
      )}
    </div>
  )
}
