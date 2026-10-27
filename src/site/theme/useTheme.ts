/** `useTheme()`: the theme store (`theme.ts`) as React state. Kept apart so the store itself stays React-free. */
import { useSyncExternalStore } from 'react'
import { getTheme, subscribeTheme, type ThemeState } from './theme'

const SERVER: ThemeState = { scheme: 'system', accent: 'signal', resolved: 'dark', name: 'dark_signal' }
export const useTheme = (): ThemeState => useSyncExternalStore(subscribeTheme, getTheme, () => SERVER)
