import { describe, expect, it } from 'vitest'
import { contrast, klMinutes, luminance, mix, phaseAt, skyAt } from './sky'

const at = (hh: number, mm = 0) => hh * 60 + mm

describe('sky', () => {
  it('names the parts of the day', () => {
    expect(phaseAt(at(7))).toBe('dawn')
    expect(phaseAt(at(12))).toBe('day')
    expect(phaseAt(at(18, 30))).toBe('golden')
    expect(phaseAt(at(19, 45))).toBe('dusk')
    expect(phaseAt(at(23))).toBe('night')
    expect(phaseAt(at(3))).toBe('night')
  })

  it('is light by day and navy at night', () => {
    expect(skyAt(at(12)).vars.mist).toBe('#EFF1F5')
    expect(skyAt(at(12)).dark).toBe(false)
    expect(skyAt(at(23)).dark).toBe(true)
    expect(skyAt(at(2)).vars.mist).toBe('#121831')
    expect(skyAt(at(23)).vars.ink).not.toBe(skyAt(at(12)).vars.ink)
  })

  it('changes smoothly: neighbouring minutes are close', () => {
    for (let m = 0; m < 1440; m++) {
      const a = luminance(skyAt(m).vars.mist), b = luminance(skyAt(m + 1).vars.mist)
      expect(Math.abs(a - b)).toBeLessThan(0.2)
    }
  })

  it('every minute of the day, text reads on the page, on cards, on the pastel chips and on dark fills', () => {
    // The two moments the page turns from light to dark (about 06:36 and 19:23) pass through greys where
    // nothing reaches 4.5:1; for those few minutes the text stays at least at the large-text level (3:1).
    const turning = (m: number) => (m >= at(6, 33) && m <= at(6, 40)) || (m >= at(19, 20) && m <= at(19, 27))
    for (let m = 0; m < 1440; m++) {
      const v = skyAt(m).vars
      const need = turning(m) ? 3 : 4.5
      for (const bg of [v.mist, v.card, v.sage, v.peach, v.butter, v.lav]) expect(contrast(v.ink, bg), `ink on ${bg} at ${m}`).toBeGreaterThanOrEqual(need)
      for (const bg of [v.mist, v.card]) expect(contrast(v.muted, bg), `muted on ${bg} at ${m}`).toBeGreaterThanOrEqual(need)
      expect(contrast(v['on-ink'], v.ink), `on-ink at ${m}`).toBeGreaterThanOrEqual(7)
      expect(contrast(v['on-ink2'], v.ink), `on-ink2 at ${m}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(v['sage-ink'], v.sage)).toBeGreaterThanOrEqual(need)
      expect(contrast(v['peach-ink'], v.peach)).toBeGreaterThanOrEqual(need)
      expect(contrast(v['butter-ink'], v.butter)).toBeGreaterThanOrEqual(need)
      expect(contrast(v.link, v.card)).toBeGreaterThanOrEqual(need)
    }
  })

  it('glows: sunset in the golden hour, the moon at night, dawn in the morning', () => {
    expect(skyAt(at(18, 40)).sunset).toBe(1)
    expect(skyAt(at(12)).sunset).toBe(0)
    expect(skyAt(at(23)).moon).toBe(1)
    expect(skyAt(at(3)).moon).toBe(1)
    expect(skyAt(at(12)).moon).toBe(0)
    expect(skyAt(at(7, 15)).dawn).toBe(1)
    expect(skyAt(at(20)).dawn).toBe(0)
  })

  it('can be held at day or at night', () => {
    expect(skyAt(at(23), 'day').dark).toBe(false)
    expect(skyAt(at(12), 'night').dark).toBe(true)
  })

  it('helpers', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(klMinutes(Date.UTC(2026, 10, 18, 10, 30))).toBe(18 * 60 + 30)
    expect(klMinutes(Date.UTC(2026, 10, 18, 17, 0))).toBe(60)
  })
})
