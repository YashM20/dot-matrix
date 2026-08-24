import { useEffect, useState } from 'react'
import { DotWidget } from './DotWidget'
import { usePlayground } from './playground/store'
import { presets } from '../engine/theme/tokens'

type BoardId = 'henry' | 'audio' | 'deerflow12' | 'mosaic' | 'henry3' | 'metro' | 'ride'

const boards: Record<BoardId, { title: string; cols: string; rows?: string; items: string[] }> = {
  henry: { title: 'DOT / 480 — OLED MICRO INTERFACE SYSTEM', cols: 'repeat(3,1fr)', items: ['clock', 'album-art', 'timer', 'weather-card', 'fitness-rings', 'messages-list', 'camera-viewfinder', 'settings-list', 'system-stats-bars'] },
  audio: { title: 'AUDIO / MIDI / INTERPRETER', cols: 'repeat(3,1fr)', items: ['gauge-battery', 'app-icon-grid', 'dial-radio', 'audio-recorder', 'dial-radio', 'interpreter-dual', 'thermal-monitor', 'maze-game', 'shopping-checklist'] },
  deerflow12: { title: 'DEERFLOW AIoT DASHBOARD — 12 (3×4)', cols: 'repeat(3,1fr)', rows: 'repeat(4,1fr)', items: ['agent-status', 'codex-usage', 'device-overview-donut', 'ev-charge', 'pharma-track', 'ecg-monitor', 'moisture-leaf-rings', 'headline-text', 'retail-analytics', 'breathing-circles', 'maze-game', 'vision-cube'] },
  mosaic: { title: 'DEERFLOW MOSAIC — AIoT COMMAND CENTER', cols: 'repeat(3,1fr)', items: ['thermal-monitor', 'ev-charge', 'codex-usage', 'fitness-rings', 'sleep-chart', 'maze-game', 'ai-assistant-chat', 'camera-viewfinder', 'agent-avatar-ring'] },
  henry3: { title: 'HENRY LI — 14A / 247W', cols: 'repeat(3,1fr)', items: ['boarding-pass', 'sunburst', 'gauge-battery', 'voice-listening', 'silhouette-art', 'breathing-circles', 'sleep-chart', 'clock', 'voice-listening'] },
  metro: { title: 'METRO / OXYGEN / QUIET', cols: 'repeat(3,1fr)', items: ['metro-line', 'oxygen-ring', 'home-quiet', 'lap-time-chart', 'headline-text', 'star-field', 'portrait-art', 'album-art', 'portrait-art'] },
  ride: { title: 'RIDE / HENRY / SYSTEM', cols: 'repeat(3,1fr)', items: ['ride-dual', 'agent-avatar-ring', 'clock', 'headline-text', 'wiki-graph', 'settings-list', 'password-dots-ring', 'notifications-grid', 'app-icon-grid'] },
}

/** Per-widget pitch (px) — dense rasters need smaller pitch to resolve detail.
 *  album-art 48×48 (≈2304 dots) needs 3px or canvas; clock/timer large glyphs need 5px for legibility; default 4px = DOT/480 reference.
 *  Keep map small; Board is view-layer, not grid authority. */
const densityMap: Record<string, number> = {
  'album-art': 3,
  'portrait-art': 3,
  'silhouette-art': 3,
  'clock': 5,
  'timer': 5,
  'vision-cube': 5,
}
function densityFor(type: string): number { return densityMap[type] ?? 4 }

export function Board({ id }: { id: BoardId }) {
  const board = boards[id] ?? boards.henry
  const themeName = usePlayground(s => s.theme)
  const theme = presets[themeName]
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(iv)
  }, [])
  return (
    <section className="board-view">
      <h2 className="board-title">{board.title}</h2>
      <div className="board-grid" style={{ gridTemplateColumns: board.cols, gridTemplateRows: board.rows }}>
        {board.items.map((type, i) => <DotWidget key={`${type}-${i}`} type={type} density={densityFor(type)} theme={theme} />)}
      </div>
    </section>
  )
}

export const boardIds = Object.keys(boards) as BoardId[]
