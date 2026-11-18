import type { ReactNode } from 'react'
import type { Decor } from '../lib/festivals'

// Small hand-drawn decorations for a festival day, hung along the top of the home screen.
// Plain SVG, a few gentle movements (none with reduced motion).

const W = 390
const xs = (n: number, pad = 28) => Array.from({ length: n }, (_, i) => pad + (i * (W - pad * 2)) / (n - 1))
const sway = (i: number, children: ReactNode, x: number) => (
  <g key={i} className="sway" style={{ transformOrigin: `${x}px 0px`, animationDelay: `${(i % 4) * 0.4}s` }}>{children}</g>
)
const string = <path d={`M0 6 Q${W / 2} 22 ${W} 6`} stroke="var(--line)" strokeWidth="1.5" fill="none" />
const dropAt = (x: number) => 6 + 16 * (1 - ((x - W / 2) / (W / 2)) ** 2)

function lamps() {
  return xs(7).map((x, i) => (
    <g key={i} transform={`translate(${x} 40)`}>
      <ellipse className="flicker" cx="0" cy="-10" rx="4" ry="8" fill="#FFC94A" style={{ animationDelay: `${i * 0.23}s` }} />
      <ellipse cx="0" cy="-8" rx="1.8" ry="4" fill="#FFF1B8" />
      <path d="M-14 -2 Q0 16 14 -2 Z" fill="#E07A3A" />
      <path d="M-14 -2 L14 -2" stroke="#B8582A" strokeWidth="2" strokeLinecap="round" />
    </g>
  ))
}
function ketupat() {
  return [string, ...xs(5, 50).map((x, i) => sway(i, (
    <>
      <path d={`M${x} ${dropAt(x)} L${x} ${dropAt(x) + 10}`} stroke="var(--line)" strokeWidth="1.2" />
      <g transform={`translate(${x} ${dropAt(x) + 22}) rotate(45)`}>
        <rect x="-10" y="-10" width="20" height="20" rx="3" fill="#7FB069" />
        <path d="M-10 -3 H10 M-10 4 H10 M-3 -10 V10 M4 -10 V10" stroke="#E9D985" strokeWidth="2.2" />
      </g>
      <path d={`M${x} ${dropAt(x) + 36} l-3 9 M${x} ${dropAt(x) + 36} l3 9`} stroke="#7FB069" strokeWidth="2" strokeLinecap="round" />
    </>
  ), x))]
}
function lanterns() {
  return [string, ...xs(5, 50).map((x, i) => sway(i, (
    <>
      <path d={`M${x} ${dropAt(x)} L${x} ${dropAt(x) + 8}`} stroke="var(--line)" strokeWidth="1.2" />
      <rect x={x - 7} y={dropAt(x) + 8} width="14" height="4" rx="1" fill="#E3B341" />
      <ellipse cx={x} cy={dropAt(x) + 24} rx="15" ry="13" fill="#D7443E" />
      <path d={`M${x} ${dropAt(x) + 11} V${dropAt(x) + 37} M${x - 8} ${dropAt(x) + 13} Q${x - 13} ${dropAt(x) + 24} ${x - 8} ${dropAt(x) + 35} M${x + 8} ${dropAt(x) + 13} Q${x + 13} ${dropAt(x) + 24} ${x + 8} ${dropAt(x) + 35}`} stroke="#B32F2B" strokeWidth="1.3" fill="none" />
      <rect x={x - 7} y={dropAt(x) + 36} width="14" height="4" rx="1" fill="#E3B341" />
      <path d={`M${x} ${dropAt(x) + 40} v9`} stroke="#E3B341" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ), x))]
}
function tree() {
  const colours = ['#E4572E', '#F3C13A', '#4C9F70', '#5B8DEF', '#E86FA6']
  return [
    <path key="s" d={`M0 8 Q${W * 0.35} 30 ${W * 0.7} 10`} stroke="var(--line)" strokeWidth="1.5" fill="none" />,
    ...Array.from({ length: 12 }, (_, i) => {
      const t = i / 11, x = t * W * 0.7, y = (1 - t) ** 2 * 8 + 2 * (1 - t) * t * 30 + t * t * 10
      return <circle key={i} className="flicker" cx={x} cy={y + 5} r="4" fill={colours[i % 5]} style={{ animationDelay: `${i * 0.3}s` }} />
    }),
    <g key="t" transform={`translate(${W - 44} 4)`}>
      <path d="M0 0 L-16 22 H-8 L-20 40 H20 L8 22 H16 Z" fill="#3E8A5C" />
      <rect x="-3" y="40" width="6" height="7" fill="#8A5A3B" />
      <path d="M0 -4 l2 4 4 .5 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -.5z" fill="#F3C13A" />
      <circle cx="-7" cy="30" r="2.5" fill="#E4572E" /><circle cx="6" cy="18" r="2.5" fill="#5B8DEF" /><circle cx="8" cy="34" r="2.5" fill="#F3C13A" />
    </g>,
  ]
}
function fireworks() {
  const bursts: [number, number, number, string][] = [[70, 26, 20, '#F3C13A'], [200, 20, 16, '#E86FA6'], [320, 28, 22, '#5B8DEF'], [140, 40, 10, '#4C9F70'], [265, 44, 12, '#E4572E']]
  return bursts.map(([x, y, r, c], i) => (
    <g key={i} className="burst" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.6}s` }}>
      {Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * Math.PI * 2; return <path key={k} d={`M${x + Math.cos(a) * r * 0.35} ${y + Math.sin(a) * r * 0.35} L${x + Math.cos(a) * r} ${y + Math.sin(a) * r}`} stroke={c} strokeWidth="2.2" strokeLinecap="round" /> })}
      <circle cx={x} cy={y} r="2" fill={c} />
    </g>
  ))
}
function flags() {
  const colours = ['#CC0001', '#FFFFFF', '#010066', '#FFCC00']
  return [string, ...xs(13, 14).map((x, i) => sway(i, <path d={`M${x - 11} ${dropAt(x) - 1} L${x + 11} ${dropAt(x) - 1} L${x} ${dropAt(x) + 20} Z`} fill={colours[i % 4]} stroke="rgba(30,34,53,.25)" strokeWidth="1" />, x))]
}
function pot() {
  const cane = (x: number, flip: number) => (
    <g key={x} transform={`translate(${x} 4) scale(${flip} 1)`}>
      <path d="M0 50 L6 2" stroke="#7A9E4B" strokeWidth="5" strokeLinecap="round" />
      <path d="M1.2 40 l4 -.5 M2.6 28 l4 -.5 M4 16 l4 -.5" stroke="#5E7F35" strokeWidth="2" />
      <path d="M6 2 q10 -2 16 6 M6 2 q-2 10 6 14" stroke="#8DB85A" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
  return [
    cane(W / 2 - 40, 1), cane(W / 2 + 40, -1),
    <g key="p" transform={`translate(${W / 2} 0)`}>
      <circle className="flicker" cx="-8" cy="14" r="5" fill="#FFF7E6" /><circle className="flicker" cx="4" cy="11" r="6" fill="#FFF7E6" style={{ animationDelay: '.5s' }} /><circle cx="12" cy="16" r="4" fill="#FFF7E6" />
      <path d="M-16 22 Q-24 40 -12 50 H12 Q24 40 16 22 Z" fill="#C8642F" />
      <path d="M-18 22 H18" stroke="#9E4A20" strokeWidth="4" strokeLinecap="round" />
      <path d="M-15 34 Q0 40 15 34" stroke="#F3C13A" strokeWidth="2.5" fill="none" />
    </g>,
  ]
}
function leaves() {
  return [string, ...xs(15, 14).map((x, i) => sway(i, <path d={`M${x} ${dropAt(x)} q-7 14 0 26 q7 -12 0 -26`} fill={i % 2 ? '#5E9E4A' : '#7FB069'} />, x))]
}

const DRAW: Record<Decor, () => ReactNode> = { lamps, ketupat, tree, fireworks, lanterns, flags, pot, leaves }
const HEIGHT: Record<Decor, number> = { lamps: 50, ketupat: 76, tree: 56, fireworks: 60, lanterns: 76, flags: 46, pot: 56, leaves: 50 }

/** The decoration strip for a festival, with its greeting under it. */
export function FestiveStrip({ decor, line }: { decor: Decor; line: string }) {
  return (
    <div className="festive" role="note" aria-label={line}>
      <svg aria-hidden="true" viewBox={`0 0 ${W} ${HEIGHT[decor]}`} width="100%" height={HEIGHT[decor]} preserveAspectRatio="xMidYMin meet" style={{ display: 'block', overflow: 'visible' }}>{DRAW[decor]()}</svg>
      <div className="display" style={{ fontSize: 17, textAlign: 'center', marginTop: 2 }}>{line}</div>
    </div>
  )
}
