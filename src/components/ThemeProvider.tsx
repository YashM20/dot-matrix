import { createContext, useContext } from 'react'
import type { ThemeTokens } from '../engine/types'
import { dot480 } from '../engine/theme/tokens'

const ThemeContext = createContext<ThemeTokens>(dot480)

export function ThemeProvider({ theme = dot480, children }: { theme?: ThemeTokens; children: React.ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
export function useTheme(): ThemeTokens { return useContext(ThemeContext) }
