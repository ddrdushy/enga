import { describe, expect, it } from 'vitest'
import { TAG, handle, message, tellEveryone } from '../api/update.ts'
import type { Device, UpdateIo } from '../api/update.ts'

const device = (n: number): Device => ({ endpoint: `https://push.example/${n}`, p256dh: 'k', auth: 'a' })

function fake(statuses: number[]) {
  const sent: string[] = []
  const forgotten: string[] = []
  const io: UpdateIo = {
    devices: async () => statuses.map((_, i) => device(i)),
    send: async (d, body) => { sent.push(body); return statuses[Number(d.endpoint.split('/').pop())] },
    forget: async (endpoints) => { forgotten.push(...endpoints) },
  }
  return { io, sent, forgotten }
}

describe('update notice', () => {
  it('says there is an update, with the note when one is given', () => {
    expect(JSON.parse(message(''))).toEqual({ title: 'enga?', body: 'A new version of enga? is ready. Open the app and tap refresh.', tag: TAG })
    expect(JSON.parse(message('  a tour with\nsample trips ')).body).toBe('A new version of enga? is ready. Open the app and tap refresh.\nNew: a tour with sample trips')
    expect(JSON.parse(message({ not: 'text' })).body).not.toContain('New:')
    expect(JSON.parse(message('x'.repeat(500))).body.length).toBeLessThan(260)
  })

  it('sends to every device, counts what arrived and drops devices that are gone', async () => {
    const { io, sent, forgotten } = fake([201, 410, 500, 201])
    expect(await tellEveryone(io, 'tour')).toEqual({ ok: true, devices: 4, delivered: 2, removed: 1 })
    expect(sent).toHaveLength(4)
    expect(forgotten).toEqual(['https://push.example/1'])
  })

  it('is fine with nobody to tell', async () => {
    expect(await tellEveryone(fake([]).io, '')).toEqual({ ok: true, devices: 0, delivered: 0, removed: 0 })
  })

  it('only answers the job secret, and only POST', async () => {
    const env = { CRON_SECRET: 's3' }
    const make = () => fake([201]).io
    const post = (auth?: string) => new Request('https://x/api/update', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify({ note: 'n' }) })
    expect((await handle(post(), env, make)).status).toBe(401)
    expect((await handle(post('Bearer wrong'), env, make)).status).toBe(401)
    expect((await handle(new Request('https://x/api/update', { headers: { authorization: 'Bearer s3' } }), env, make)).status).toBe(405)
    const ok = await handle(post('Bearer s3'), env, make)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true, devices: 1, delivered: 1, removed: 0 })
  })
})
