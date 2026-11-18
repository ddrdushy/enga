// Every clay picture under src/assets/cast, by path relative to that folder ('ali/out/wave.anim.webp').
// Only the addresses are bundled here: a picture is downloaded when a face on screen asks for it.
import type { CastFiles } from './cast'

const RAW = import.meta.glob('../assets/cast/**/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const CAST_FILES: CastFiles = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.replace('../assets/cast/', ''), v]))
