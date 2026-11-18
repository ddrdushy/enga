// The sky: the page follows the time of day in Kuala Lumpur.
// Dawn (about 06:30 to 08:30) is soft peach, the day is the usual light page, the golden hour
// (about 17:30 to 19:30) is warm, dusk turns violet, and the night (about 20:00 to 06:00) is navy with
// darker cards and light text. Background colours move smoothly between these; the text switches
// between a dark set and a light set at the moment the page is dark enough, so it always reads.

export type Phase = 'night' | 'dawn' | 'day' | 'golden' | 'dusk'
export type SkyMode = 'auto' | 'day' | 'night'

/** The page colours that move with the sky. */
const BG_KEYS = ['mist', 'card', 'sage', 'lav', 'peach', 'butter'] as const
type Bg = Record<(typeof BG_KEYS)[number], string>

const DAY: Bg = { mist: '#EFF1F5', card: '#FFFFFF', sage: '#CFE3D4', lav: '#DAD5F7', peach: '#F9DCCB', butter: '#F5EBC0' }
const DAWN: Bg = { mist: '#F6EEEA', card: '#FFFDFB', sage: '#D4E5D5', lav: '#E2D9F3', peach: '#FADCCB', butter: '#F7EBC4' }
const GOLDEN: Bg = { mist: '#F7EBE1', card: '#FFFBF6', sage: '#D7E3CB', lav: '#E6D6EE', peach: '#F9D3BD', butter: '#F7E4B5' }
const DUSK: Bg = { mist: '#262246', card: '#363059', sage: '#31503F', lav: '#463F7B', peach: '#633E4D', butter: '#5A4F2E' }
const NIGHT: Bg = { mist: '#121831', card: '#1E2647', sage: '#24443A', lav: '#353A70', peach: '#52393F', butter: '#484226' }

/** Text and accents on a light page, and on a dark one. */
const TEXT_LIGHT_PAGE = {
  ink: '#1E2235', ink2: '#3A4058', muted: '#5A6078', line: '#8188A0', soft: '#C3C8D6', blue: '#5B6BBF',
  'on-ink': '#FFFFFF', 'on-ink2': '#C9CEDD', link: '#3F4A8A', 'sage-ink': '#2F5A3D', 'peach-ink': '#5C3A22', 'butter-ink': '#574A12', err: '#A12A2A',
}
const TEXT_DARK_PAGE: typeof TEXT_LIGHT_PAGE = {
  ink: '#ECEEF8', ink2: '#CDD1E3', muted: '#A7ADC8', line: '#7D84A6', soft: '#48507A', blue: '#93A0F2',
  'on-ink': '#161B33', 'on-ink2': '#4A5070', link: '#B7C0F8', 'sage-ink': '#BFE3C9', 'peach-ink': '#F6CDB5', 'butter-ink': '#EFE2A6', err: '#FF9F9F',
}

const h = (hh: number, mm = 0) => hh * 60 + mm
/** Key moments of the day and the page colours at each; between them the colours blend. */
const ANCHORS: [number, Bg][] = [
  [h(0), NIGHT], [h(5, 50), NIGHT], [h(6, 25), DUSK], [h(6, 50), DAWN], [h(8), DAWN], [h(8, 45), DAY],
  [h(17, 15), DAY], [h(18), GOLDEN], [h(19, 10), GOLDEN], [h(19, 35), DUSK], [h(20, 15), NIGHT], [h(24), NIGHT],
]

/** The named part of the day. */
export function phaseAt(minutes: number): Phase {
  const m = ((minutes % 1440) + 1440) % 1440
  if (m >= h(6) && m < h(8, 30)) return 'dawn'
  if (m >= h(8, 30) && m < h(17, 30)) return 'day'
  if (m >= h(17, 30) && m < h(19, 30)) return 'golden'
  if (m >= h(19, 30) && m < h(20)) return 'dusk'
  return 'night'
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }

/** WCAG relative luminance of '#RRGGBB'. */
export function luminance(c: string): number {
  const [r, g, b] = hex(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** `colour` if it reads (4.5:1) on every one of `on`; otherwise the closest blend towards `ink` that does (or `ink`). */
function readable(colour: string, ink: string, on: string[]): string {
  const ok = (c: string) => on.every((b) => contrast(c, b) >= 4.5)
  if (ok(colour)) return colour
  for (let f = 0.1; f < 1; f += 0.1) { const c = mix(colour, ink, f); if (ok(c)) return c }
  return ink
}

/** How much of a glow shows: rises from 0 at `a` to 1 at `b`, stays, and falls back to 0 from `c` to `d`. */
function ramp(m: number, a: number, b: number, c: number, d: number): number {
  if (m <= a || m >= d) return 0
  if (m < b) return (m - a) / (b - a)
  if (m <= c) return 1
  return (d - m) / (d - c)
}

export interface Sky {
  phase: Phase
  /** Dark page: light text. */
  dark: boolean
  /** CSS custom properties, without the leading '--'. */
  vars: Record<string, string>
  /** For the browser bar: the page colour. */
  theme: string
  /** 0..1, how strong each light is. */
  sunset: number
  dawn: number
  moon: number
}

/** The sky at `minutes` past midnight (Kuala Lumpur time). `mode` can hold it at day or at night. */
export function skyAt(minutes: number, mode: SkyMode = 'auto'): Sky {
  const raw = mode === 'day' ? h(12) : mode === 'night' ? h(23) : minutes
  const m = ((raw % 1440) + 1440) % 1440
  let i = 0
  while (i < ANCHORS.length - 2 && ANCHORS[i + 1][0] <= m) i++
  const [t0, a] = ANCHORS[i]
  const [t1, b] = ANCHORS[i + 1]
  let t = t1 === t0 ? 0 : (m - t0) / (t1 - t0)
  // Between a light and a dark page, hurry through the middle greys, where no text reads well.
  if (luminance(a.mist) > 0.19 !== luminance(b.mist) > 0.19) t = Math.max(0, Math.min(1, (t - 0.5) * 3 + 0.5))
  const bg = Object.fromEntries(BG_KEYS.map((k) => [k, mix(a[k], b[k], t)])) as Bg
  // Light or dark text: whichever reads better on the surface where it reads worst.
  const worst = (ink: string) => Math.min(...BG_KEYS.map((k) => contrast(ink, bg[k])))
  const dark = worst(TEXT_DARK_PAGE.ink) > worst(TEXT_LIGHT_PAGE.ink)
  const text = dark ? TEXT_DARK_PAGE : TEXT_LIGHT_PAGE
  const vars: Record<string, string> = { ...bg, ...text, ink2: readable(text.ink2, text.ink, [bg.mist, bg.card]), muted: readable(text.muted, text.ink, [bg.mist, bg.card]),
    'sage-ink': readable(text['sage-ink'], text.ink, [bg.sage]), 'peach-ink': readable(text['peach-ink'], text.ink, [bg.peach]),
    'butter-ink': readable(text['butter-ink'], text.ink, [bg.butter]), link: readable(text.link, text.ink, [bg.card, bg.mist]) }
  return {
    phase: phaseAt(m),
    dark,
    vars,
    theme: bg.mist,
    sunset: ramp(m, h(17, 15), h(18, 15), h(19, 15), h(20)),
    dawn: ramp(m, h(6, 15), h(7), h(7, 45), h(8, 40)),
    moon: m >= h(19, 30) ? Math.min(1, (m - h(19, 30)) / 60) : m < h(5, 45) ? 1 : m < h(6, 30) ? (h(6, 30) - m) / 45 : 0,
  }
}

/** Minutes past midnight in Kuala Lumpur at an instant (the sky follows home base, wherever the phone is). */
export function klMinutes(ms: number): number {
  const d = new Date(ms + 8 * 3600_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

const MODE_KEY = 'enga-sky'
export function readSkyMode(): SkyMode {
  try { const v = localStorage.getItem(MODE_KEY); return v === 'day' || v === 'night' ? v : 'auto' } catch { return 'auto' }
}
export function saveSkyMode(mode: SkyMode) {
  try { if (mode === 'auto') localStorage.removeItem(MODE_KEY); else localStorage.setItem(MODE_KEY, mode) } catch { /* ignore */ }
}
