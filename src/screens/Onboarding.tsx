import { useState } from 'react'
import type { Person } from '../lib/types'
import type { Store } from '../lib/store'
import { isInstalled, isIos } from '../lib/push'
import { Avatar, Dial, SlideButton, pretty } from '../ui'
import { PushToggle } from './PushToggle'
import { Blank, WORK_TYPES } from './Forms'
import { WorkWeek } from './WorkWeek'
import { ContactsEditor } from './Contacts'
import { defaultPlan, hasWeek } from '../lib/work'

const STEPS = 4
const WORK = WORK_TYPES
const PHRASE: Record<string, string> = {
  office: 'I work at an office',
  'from home': 'I work from home',
  hybrid: 'I work hybrid',
  shifts: 'I work in shifts',
  'my own business': 'I run my own business',
  studying: "I'm studying",
}

/** Shown once, right after someone sets their PIN for the first time. Every step can be skipped. */
export function Onboarding({ me, store, onDone }: { me: Person; store: Store; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(me.name)
  const [home, setHome] = useState(me.home)
  const [house, setHouse] = useState(me.house)
  const [office, setOffice] = useState(me.office)
  const [workType, setWorkType] = useState(me.workType)
  const [plan, setPlan] = useState(me.workPlan ?? defaultPlan(me.workType))
  const [contacts, setContacts] = useState(me.emergencyContacts)
  const [time, setTime] = useState(me.reminderTime)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await store.saveProfile({
        name: name.trim() || me.name,
        home: home.trim() || me.home,
        house: house.trim(),
        office: office.trim(),
        workType,
        workPlan: hasWeek(workType) ? plan : null,
        emergencyContacts: contacts,
        reminderTime: time,
      })
      return true
    } catch {
      setError("that didn't save. check your connection and try again.")
      return false
    } finally {
      setBusy(false)
    }
  }
  const next = () => { void save().then((ok) => ok && setStep(step + 1)) }
  const finish = () => { void save().then((ok) => ok && onDone()) }

  const blank = (value: string, set: (v: string) => void, label: string, hint: string, bg: string, type = 'text') => (
    <Blank value={value} onChange={set} label={label} hint={hint} bg={bg} inputMode={type === 'tel' ? 'tel' : 'text'} />
  )
  const face = { initial: (name.trim()[0] ?? me.initial).toUpperCase(), color: me.color, ink: me.ink }

  return (
    <div className="screen pad" style={{ padding: '28px 24px 24px', gap: 20 }}>
      <div className="between">
        <div className="display" style={{ fontSize: 28, letterSpacing: -1 }}>enga<span className="q">?</span></div>
        <div role="img" aria-label={`Step ${step + 1} of ${STEPS}`} className="row" style={{ gap: 6 }}>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} style={{ width: i === step ? 28 : 8, height: 8, borderRadius: 4, background: i <= step ? 'var(--ink)' : 'var(--soft)', transition: 'width .25s ease-out' }} />)}
        </div>
      </div>

      {step === 0 && (
        <div key="who" style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'rise .35s ease-out both' }}>
          <Avatar p={face} size={88} style={{ animation: 'pop .6s cubic-bezier(.2,1.4,.4,1) both' }} />
          <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>first, who are you?</div>
          <div className="say">
            I'm {blank(name, setName, 'Your name', 'your name', 'var(--card)')}. I live in {blank(house, setHouse, 'Your area or address', 'area', 'var(--peach)')}, {blank(home, setHome, 'Home city', 'your city', 'var(--sage)')}.
          </div>
          <div className="small">Your friends see this name. The city is where you are when you are not on a trip. For the house, the area is enough; leave it empty if you like.</div>
        </div>
      )}

      {step === 1 && (
        <div key="work" style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'rise .35s ease-out both' }}>
          <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>and work?</div>
          <div className="say">
            <span className={`word${workType ? '' : ' off'}`} style={workType ? { background: 'var(--lav)' } : undefined}>{PHRASE[workType] ?? 'I work… how?'}</span>. My office or campus is in {blank(office, setOffice, 'Where your office is', 'area', 'var(--butter)')}.
          </div>
          <div className="label">tap one</div>
          <div className="chips">
            {WORK.map((w) => (
              <button key={w} type="button" className={`pill${workType === w ? ' dark' : ''}`} aria-pressed={workType === w} onClick={() => { const next = workType === w ? '' : w; setWorkType(next); if (!me.workPlan) setPlan(defaultPlan(next)) }}>{w}</button>
            ))}
          </div>
          {hasWeek(workType) && <WorkWeek plan={plan} onChange={setPlan} />}
          <div className="small">This helps friends guess when you are reachable. Skip anything you would rather not share.</div>
        </div>
      )}

      {step === 2 && (
        <div key="sos" style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'rise .35s ease-out both' }}>
          <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>who do we call for you?</div>
          <ContactsEditor value={contacts} onChange={setContacts} />
          <div className="card small" style={{ color: 'var(--ink2)', lineHeight: 1.5 }}>
            Saved once and added to the safety card of every trip you make. Only the friends you choose for that trip can see it. You can change it any time.
          </div>
        </div>
      )}

      {step === 3 && (
        <div key="am" style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'rise .35s ease-out both' }}>
          <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>when should we tell you?</div>
          <div className="say sm">
            Every morning at <span className="word" style={{ background: 'var(--ink)', color: '#fff' }}>{pretty(time)}</span> tell me who is where.
          </div>
          <Dial value={time} onChange={setTime} />
          <PushToggle save={store.savePush} remove={store.removePush} demo={store.mode === 'demo'} />
          {!isInstalled() && (
            <div className="card small" style={{ color: 'var(--ink2)', lineHeight: 1.5 }}>
              {isIos()
                ? 'To get it like an app: tap the Share button in Safari, then "Add to Home Screen".'
                : 'To get it like an app: open the browser menu and choose "Install app" or "Add to Home screen".'}
            </div>
          )}
        </div>
      )}

      <div className="err" role="alert">{error}</div>
      <div className="push" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {step < STEPS - 1 ? (
          <div className="between">
            {step > 0 ? <button type="button" className="pill" onClick={() => setStep(step - 1)}>back</button> : <span />}
            <button type="button" className="pill dark" style={{ height: 56, padding: '0 28px', borderRadius: 28, fontSize: 16 }} disabled={busy} onClick={next}>{(step === 2 && contacts.length === 0) || (step === 1 && !workType && !office.trim()) ? 'skip for now' : 'next'}</button>
          </div>
        ) : (
          <>
            <SlideButton label="slide to start" onDone={finish} disabled={busy} />
            <button type="button" className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => setStep(step - 1)}>back</button>
          </>
        )}
      </div>
    </div>
  )
}
