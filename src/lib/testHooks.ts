/**
 * The switch for test-only globals (`__editorLink`, `__skinPerf`, `dot480Audio`, the fake camera `__dotTestCamera`,
 * …): on in dev builds, and in a production build only when a browser probe asks for it, with
 * `globalThis.__DOT_PROBE__ = true` set before the page loads (`launch` in scripts/lib/cdp.ts does that for every
 * probe page) or `?probe=1` on a direct load (the app's canonical URL drops it, so lazy chunks may miss it).
 * A normal visit gets none of these globals. Read once, when the first module that needs it loads.
 */
const probe = (globalThis as { __DOT_PROBE__?: unknown }).__DOT_PROBE__ === true || (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search))
export const TEST_HOOKS: boolean = !!import.meta.env?.DEV || probe
