/** The TOOLS sheet's ANALYTICS switch (#151). The palette has the same as two commands (`./api.ts`). */
import { useSyncExternalStore } from 'react'
import { analyticsState, setAnalytics, subscribeAnalytics } from '../../site/analytics/consent'
import { toast } from '../xray/store'

/** ANALYTICS in TOOLS: shown when the build has analytics; under GPC or DNT it says why it stays off. */
export function AnalyticsButton({ onClose }: { onClose: () => void }) {
  const s = useSyncExternalStore(subscribeAnalytics, analyticsState, analyticsState)
  if (s === 'unavailable') return null
  const on = s === 'on'
  const line = s === 'blocked' ? 'Off: your browser asks sites not to track you' : on ? 'Anonymous page views and button names' : 'Off: nothing is sent'
  return <button type="button" className="tool-analytics" aria-pressed={on} onClick={() => { onClose(); toast(setAnalytics(!on)) }}><b>ANALYTICS</b><span>{line}</span></button>
}
