/** `useTheme()` / `useThemeTokens()`: the theme store (`theme.ts`) as React state. Kept apart so the store itself stays React-free. */
import { useSyncExternalStore } from 'react'
import type { ThemeTokens } from '../../engine/types'
import type { Scheme } from './names'
import { getTheme, subscribeTheme, themeTokens, type ThemeState } from './theme'

const SERVER: ThemeState = { scheme: 'system', accent: 'signal', resolved: 'dark', name: 'dark_signal' }
export const useTheme = (): ThemeState => useSyncExternalStore(subscribeTheme, getTheme, () => SERVER)
/** Engine tokens of the current theme, or of the current accent on a pinned `scheme` (a dark inset on a light page). */
export function useThemeTokens(scheme?: Scheme): ThemeTokens {
  const t = useTheme()
  return themeTokens(scheme ?? t.resolved, t.accent)
}
