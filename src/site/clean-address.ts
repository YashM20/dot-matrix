/**
 * Imported first by each entry point (`src/main.tsx`, `src/blog/main.tsx`, `src/lab/main.tsx`), so it runs before any
 * other module reads `location`: a page opened at `//path` or `/\path` is shown at `/path` (#148, `./safe-url`).
 */
import { cleanAddress } from './safe-url'

cleanAddress()
