/**
 * The shape a stored custom-hue CSS string must have before anything paints it (#149). The boot script (`boot.ts`)
 * runs before the bundle and can't make the CSS from the hue (the generator is the lazy `custom.ts`), so it paints the
 * stored copy only when the whole string is `customCss()` output in form: rules scoped to
 * `[data-scheme="dark|light"][data-accent="custom"]` (plain, inside `@media (prefers-contrast: more)`, or under the
 * CONTRAST: MORE `:where(...)`), each holding only `--role: <colour>;` declarations, where a colour is an upper-case
 * `#RRGGBB`, an `rgba(r, g, b, a)` or the halo's `radial-gradient(closest-side, rgba(...), transparent)`. No other
 * selector, property, at-rule, `url()`, `}` or comment gets through, so a tampered entry can at worst tint the custom
 * theme for the moment before the store makes the hue's CSS again and stores that (`cleanStored` in theme.ts).
 * The store's `resolvePrefs` applies the same test, so both pick the same accent. Older stored CSS (from before the
 * CONTRAST: MORE copy) has the same form and still boots. `scripts/site/theme.ts` checks every hue's `customCss()`
 * matches and tampered strings don't. Linear: every repeated part starts and ends on a fixed character.
 */
/** One rule's selector and declarations (regex source). */
export const CUSTOM_RULE = String.raw`\[data-scheme="(dark|light)"\]\[data-accent="custom"\]\{(--[a-z-]+: (#[0-9A-F]{6}|(radial-gradient\(closest-side, )?rgba\((\d{1,3}, ){3}[01](\.\d{1,3})?\)(, transparent\))?);)+\}`
export const CUSTOM_MEDIA = String.raw`@media \(prefers-contrast: more\)\{`
export const CUSTOM_WHERE = String.raw`:where\(\[data-contrast="more"\], \[data-contrast="more"\] \*\)`
/** The longest stored CSS considered (today's is ~2.1 kB). */
export const CUSTOM_CSS_MAX = 8192
const pattern = new RegExp(`^(${CUSTOM_RULE}|${CUSTOM_MEDIA}${CUSTOM_RULE}\\}|${CUSTOM_WHERE}${CUSTOM_RULE})+$`)
/** True when `css` may be painted as the custom theme (the boot script runs the same test). */
export const isCustomCss = (css: unknown): css is string => typeof css === 'string' && css.length <= CUSTOM_CSS_MAX && pattern.test(css)
