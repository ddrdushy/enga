import { useEffect, useMemo } from 'react'
import type { Sky, SkyMode } from '../lib/sky'
import { klMinutes, skyAt } from '../lib/sky'

/** Puts the sky's colours on the page (CSS variables, the browser bar colour) and returns it. */
export function useSky(nowMs: number, mode: SkyMode): Sky {
  const minutes = klMinutes(nowMs)
  const sky = useMemo(() => skyAt(minutes, mode), [minutes, mode])
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(sky.vars)) root.style.setProperty(`--${k}`, v)
    root.dataset.sky = sky.phase
    root.dataset.dark = String(sky.dark)
    root.style.colorScheme = sky.dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky.theme)
  }, [sky])
  return sky
}

// A few stars, always in the same places (x %, y %, size px, delay s).
const STARS: [number, number, number, number][] = [
  [8, 6, 2, 0], [22, 14, 3, 1.4], [37, 4, 2, 2.6], [55, 11, 2, 0.8], [71, 5, 3, 3.1], [86, 13, 2, 1.9],
  [93, 27, 2, 0.3], [14, 30, 2, 2.2], [63, 24, 2, 3.6], [44, 33, 3, 1.1], [79, 38, 2, 2.9], [29, 44, 2, 0.6],
]

/** The light behind the page: dawn from the top left, the sunset from the top right, the moon and stars at night. */
export function SkyLayer({ sky }: { sky: Sky }) {
  if (!sky.dawn && !sky.sunset && !sky.moon) return null
  return (
    <div className="sky" aria-hidden="true">
      {sky.dawn > 0 && <div className="glow dawn" style={{ opacity: sky.dawn }} />}
      {sky.sunset > 0 && <div className="glow sunset" style={{ opacity: sky.sunset }} />}
      {sky.moon > 0 && (
        <>
          <div className="glow moon" style={{ opacity: sky.moon }} />
          <div className="stars" style={{ opacity: sky.moon }}>
            {STARS.map(([x, y, s, d]) => <i key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${d}s` }} />)}
          </div>
        </>
      )}
    </div>
  )
}
