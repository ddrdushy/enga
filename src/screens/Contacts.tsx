import { useState } from 'react'
import type { Contact } from '../lib/types'
import { isIos } from '../lib/push'
import { Icon } from '../ui'

interface PickedContact { name?: string[]; tel?: string[] }
interface ContactsApi { select(props: string[], opts?: { multiple?: boolean }): Promise<PickedContact[]> }

/** The phone's own contact picker. Today that is Chrome on Android; iPhone browsers do not offer it. */
const picker = (): ContactsApi | null => {
  const nav = navigator as Navigator & { contacts?: ContactsApi }
  return nav.contacts && 'ContactsManager' in window ? nav.contacts : null
}
const sameNumber = (a: string, b: string) => a.replace(/\D/g, '') === b.replace(/\D/g, '')

/** Emergency contacts: several of them, picked from the phone's contact list where the browser allows it, or typed in. */
export function ContactsEditor({ value, onChange }: { value: Contact[]; onChange: (v: Contact[]) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const canPick = picker() !== null

  const merge = (incoming: Contact[]) => {
    const next = [...value]
    for (const c of incoming) {
      if (!c.phone.trim() || next.some((x) => sameNumber(x.phone, c.phone))) continue
      next.push({ name: c.name.trim(), phone: c.phone.trim() })
    }
    onChange(next)
  }
  const pick = async () => {
    const api = picker()
    if (!api) return
    setNote('')
    try {
      const chosen = await api.select(['name', 'tel'], { multiple: true })
      const withPhone = chosen.filter((c) => c.tel?.[0]).map((c) => ({ name: c.name?.[0] ?? '', phone: c.tel![0] }))
      if (chosen.length && !withPhone.length) setNote('those contacts have no phone number saved.')
      merge(withPhone)
    } catch {
      setNote('could not open your contacts. type them in below instead.')
    }
  }
  const add = () => {
    if (!phone.trim()) { setNote('add a phone number first.'); return }
    setNote('')
    merge([{ name, phone }])
    setName('')
    setPhone('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.map((c, i) => (
        <div key={`${c.phone}-${i}`} className="card between" style={{ borderRadius: 20, padding: '8px 8px 8px 16px', background: 'var(--sage)', animation: 'pop .3s ease-out both' }}>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 17, overflowWrap: 'anywhere' }}>{c.name || 'no name'}</div>
            <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>{c.phone}</a>
          </div>
          <button type="button" className="round" aria-label={`Remove ${c.name || c.phone}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><Icon.close /></button>
        </div>
      ))}
      {value.length === 0 && <div className="small">Nobody yet. Add one or more people we should call.</div>}

      {canPick && <button type="button" className="pill dark" style={{ alignSelf: 'flex-start', height: 52, borderRadius: 26 }} onClick={() => void pick()}>pick from my contacts</button>}

      <form className="card" style={{ borderRadius: 20, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); add() }}>
        <div className="label">{canPick ? 'or type one in' : 'type one in'}</div>
        <input className="field plain" style={{ background: 'var(--mist)' }} aria-label="Contact name" placeholder="name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row">
          <input className="field plain grow" style={{ background: 'var(--mist)' }} aria-label="Contact phone number" placeholder="phone number" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button type="submit" className="pill dark" style={{ height: 48, borderRadius: 16 }}>add</button>
        </div>
      </form>
      {note && <div className="err" role="alert" style={{ textAlign: 'left' }}>{note}</div>}
      {!canPick && isIos() && <div className="small">iPhone browsers cannot open your contact list from a web app, so these are typed in.</div>}
    </div>
  )
}

/** Read-only list, for safety cards. */
export function ContactLines({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return null
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {contacts.map((c, i) => (
        <span key={i} style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {c.name ? `${c.name} · ` : ''}<a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--ink)' }}>{c.phone}</a>
        </span>
      ))}
    </span>
  )
}
