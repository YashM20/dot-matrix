/**
 * The accent generator (docs/LAYOUT-THEME-PLAN.md §4 Accent ramps). One OKLCH hue per accent → a 12-step
 * ramp per scheme (1–2 washes, 3–5 fills, 6–8 lines, 9–10 the solid, 11–12 text), gamut-clamped (chroma
 * binary-searched at fixed L and h), then nudged until the rules hold:
 *  - `red` (the accent solid, dots) ≥ 3:1 on `surface`; `red-text` ≥ 4.5:1 on every surface and ≥ APCA Lc 60
 *    on `surface`;
 *  - `on-red` by measured contrast: white when it reaches APCA 60 and 4.5:1, else a dark tint of the hue,
 *    darkened until 4.5:1;
 *  - `red-line` = the first of steps 6–8 at ≥ 3:1 on `surface` (nudged if none);
 *  - neutrals tinted toward the hue by a little chroma (surfaces .005, line / mute ≤ .012, value ≤ .004,
 *    vite surfaces up to .016; light gets 70%); the neutral dot tones stay untinted.
 * Role names are the CSS custom properties of src/tokens.css (T0), without `--`: `red` is `{colors.dotActive}`,
 * the theme's accent whatever its hue (the name is today's; it is not a second colour).
 * Hand-pinned values win: `dark_signal` is today's site exactly (goldens), and `vite` is pinned to
 * vite.dev's own purple. Pure and framework-free. `scripts/site/theme.ts --write` runs it once and writes
 * `table.ts`, `dots.ts` and `themes.css`; the site never runs colour math (the custom hue, T6, will run
 * this module lazily).
 */
import { apca, distinctness, fromOklch, gamutClamp, oklch, rgba, wcag, type Oklch } from './color'
import { ACCENTS, SCHEMES, type AccentChoice, type AccentId, type Scheme, type ThemeKey, type ThemeName } from './names'

/** The opaque neutral roles of one scheme (hex); the translucent ones derive from them. */
export interface Neutrals {
  bg: string; panel: string; surface: string; raised: string
  /** Text: primary, secondary, meta (all ≥ 4.5:1 on every surface). `dim` is not text: quiet glyphs and off states (≥ 3:1, WCAG 1.4.11). */
  value: string; label: string; mute: string; dim: string
  /** Solid quiet ink: grab handles, grips, off glyphs. */
  'line-strong': string
  /** The ink mixed into washes and hairlines (white on dark, the text ink on light); `line` is it at an alpha. */
  tint: string
  /** The dark mixed into scrims, shadows and masks. */
  shade: string
  /** The recess below the surface: code wells (the OLED black on dark, the brightest paper on light). */
  well: string
  faint: string; mid: string; idle: string
}

/**
 * Today's dark site (src/tokens.css `:root`, DESIGN.md colour tokens, `dot480` in src/engine/theme/tokens.ts).
 * `dark_signal` is this with no tint, so goldens don't move. T6 lifted the two chrome greys that failed: `mute`
 * #6E7278 (3.46:1 on `raised`) → #81858B (4.51:1), and `dim` #4A4E54 (2.0:1) → #65696F (3.03:1, glyphs only).
 */
export const DARK: Neutrals = {
  bg: '#070809', panel: '#0D0F11', surface: '#111315', raised: '#1B1E21',
  value: '#F2F3F5', label: '#C7CBD1', mute: '#81858B', dim: '#65696F', 'line-strong': '#3A3D42', tint: '#FFFFFF', shade: '#000000', well: '#000000',
  faint: '#2E3033', mid: '#5B5F66', idle: '#8A8F98',
}
/** Today's alphas (src/tokens.css: `--line` .08, `--scrim` .55). */
const ALPHA = { dark: { line: .08, scrim: .55 }, light: { line: .12, scrim: .28 } } as const

/** The `paper` neutral preset (light): warm paper, not pure white (Cursor's #f7f7f4 / #f2f1ed; 2–3% L steps). */
const PAPER_HUE = 95
const paper = (L: number, C: number) => fromOklch(gamutClamp(L, C, PAPER_HUE))
export const LIGHT: Neutrals = {
  bg: paper(.955, .005), panel: paper(.935, .005), surface: paper(.978, .004), raised: paper(.995, .003),
  value: paper(.22, .004), label: paper(.38, .005), mute: paper(.5, .006), dim: paper(.6, .005), 'line-strong': paper(.8, .004),
  tint: paper(.22, .004), shade: paper(.18, .004), well: paper(1, 0),
  faint: paper(.86, .003), mid: paper(.66, .003), idle: paper(.4, .003),
}
export const NEUTRALS: Record<Scheme, Neutrals> = { dark: DARK, light: LIGHT }

export interface AccentSpec {
  id: AccentId; hue: number; character: string
  /** Target chroma of the solid and target lightness of the solid, per scheme (the clamp may lower C). */
  C: Record<Scheme, number>; L: Record<Scheme, number>
}
export const ACCENT_SPECS: Record<AccentId, AccentSpec> = {
  signal: { id: 'signal', hue: 29.23, character: "today's red", C: { dark: .232, light: .215 }, L: { dark: .653, light: .6 } },
  amber: { id: 'amber', hue: 75, character: 'VFD warm', C: { dark: .165, light: .16 }, L: { dark: .8, light: .66 } },
  phosphor: { id: 'phosphor', hue: 145, character: 'green CRT', C: { dark: .2, light: .17 }, L: { dark: .8, light: .6 } },
  cyan: { id: 'cyan', hue: 210, character: 'VFD cyan', C: { dark: .135, light: .11 }, L: { dark: .8, light: .56 } },
  cobalt: { id: 'cobalt', hue: 260, character: 'blue', C: { dark: .19, light: .2 }, L: { dark: .68, light: .52 } },
  vite: { id: 'vite', hue: 290, character: "vite.dev's purple (hand-pinned)", C: { dark: .16, light: .25 }, L: { dark: .75, light: .53 } },
  magenta: { id: 'magenta', hue: 350, character: 'pink', C: { dark: .22, light: .22 }, L: { dark: .7, light: .56 } },
}

/**
 * Every role a theme sets: the CSS variable names of src/tokens.css without `--`. Components read roles, never
 * hues. `value` is both the primary text and the brightest dot tone ({colors.value}).
 */
export const NEUTRAL_ROLES = ['bg', 'panel', 'surface', 'raised', 'line', 'line-strong', 'tint', 'shade', 'well', 'scrim', 'value', 'label', 'mute', 'dim'] as const
export const DOT_ROLES = ['dot-faint', 'dot-mid', 'dot-idle'] as const
/**
 * The accent family: `red` ({colors.dotActive}, dots and fills), `red-dim` ({colors.dotActiveDim}), hover / press
 * (±1 step), `red-text` (accent as text, ≥ 4.5:1), `red-line` (active border, focus ring), `on-red`
 * ({colors.onActive}, text on a solid fill), `red-surface` + `red-surface-text` (hero insets only), `red-halo`
 * (chrome halos only: never dots, text or lines), `selection` (::selection). The 12% wash and the glow are
 * built from `red` in src/tokens.css (`--glow-wash`, `--glow-halo`).
 */
export const ACCENT_ROLES = ['red', 'red-dim', 'red-hover', 'red-press', 'red-text', 'red-line', 'on-red', 'red-surface', 'red-surface-text', 'red-halo', 'selection'] as const
export type Role = (typeof NEUTRAL_ROLES)[number] | (typeof DOT_ROLES)[number] | (typeof ACCENT_ROLES)[number]
export type Roles = Record<Role, string>

export interface Theme {
  /** `scheme_accent`; `dark_custom` / `light_custom` for the custom hue. */
  name: ThemeKey; scheme: Scheme; accent: AccentChoice
  roles: Roles
  /** The 12-step ramp (hex), Radix numbering 1..12 at index 0..11. */
  ramp: string[]
  /** The solid as generated: requested vs reached chroma (the gamut clamp's cut) and its L. */
  solid: { L: number; C: number; requestedC: number }
  /** Roles taken from a hand-pinned table rather than generated. */
  pinned: Role[]
}

/** Radix-style ramp lightness per step (index 8, step 9, is the solid; 9 and 10 follow it). */
const L_STEPS: Record<Scheme, (S: number) => number[]> = {
  dark: S => [.16, .19, .23, .27, .32, .38, .5, .56, S, S + .05, Math.max(S + .08, .8), .93],
  light: S => [.993, .978, .955, .925, .89, .85, .78, .7, S, S - .05, Math.min(S - .1, .5), .28],
}
/** Chroma per step as a share of the target; peaks at step 9. */
const C_CURVE = [.03, .06, .12, .2, .3, .42, .8, .85, 1, .95, .85, .4]

/** Tint chroma per neutral role (dark amounts; light gets 70%). */
const TINT = { surface: .005, viteSurface: .014, line: .01, mute: .01, label: .006, value: .003 }

const clampHex = (L: number, C: number, h: number) => fromOklch(gamutClamp(L, C, h))
const SURFACES = ['bg', 'panel', 'surface', 'raised'] as const
const worst = (hex: string, n: Neutrals) => Math.min(...SURFACES.map(s => wcag(hex, n[s])))

/**
 * Move L away from the surfaces (lighter on dark, darker on light), re-clamping chroma at each step, until
 * `ok` holds. Returns the colour unchanged if it already passes.
 */
function nudge(c: Oklch, scheme: Scheme, ok: (hex: string) => boolean, Ctarget = c.C): Oklch {
  const dir = scheme === 'dark' ? 1 : -1
  let cur = c
  for (let i = 0; i < 200 && !ok(fromOklch(cur)); i++) cur = gamutClamp(cur.L + dir * .005, Ctarget, cur.h)
  return cur
}

/** The scheme's neutrals tinted toward `hue` (L kept; chroma per role). `dark_signal` stays untouched. */
export function tint(base: Neutrals, scheme: Scheme, accent: AccentChoice, hue: number): Neutrals {
  if (scheme === 'dark' && accent === 'signal') return { ...base }
  const k = scheme === 'light' ? .7 : 1, at = (hex: string, C: number) => clampHex(oklch(hex).L, C * k, hue)
  const sC = accent === 'vite' ? TINT.viteSurface : TINT.surface
  const n: Neutrals = {
    ...base,
    bg: at(base.bg, sC * .8), panel: at(base.panel, sC), surface: at(base.surface, sC), raised: at(base.raised, sC),
    value: at(base.value, TINT.value), label: at(base.label, TINT.label), mute: at(base.mute, TINT.mute), dim: at(base.dim, TINT.mute),
    'line-strong': at(base['line-strong'], TINT.line),
    tint: scheme === 'dark' ? clampHex(.97, TINT.line, hue) : at(base.tint, TINT.line),
  }
  // tinted text keeps ≥ 4.5:1 on every surface; the glyph grey ≥ 3:1
  for (const r of ['value', 'label', 'mute'] as const) n[r] = fromOklch(nudge(oklch(n[r]), scheme, h => worst(h, n) >= 4.5))
  n.dim = fromOklch(nudge(oklch(n.dim), scheme, h => worst(h, n) >= 3))
  return n
}

/** Hand-pinned roles (they win over the generator, and must pass the same rules). */
export const PINS: Partial<Record<ThemeName, Partial<Roles>>> = {
  // today's site: {colors.dotActive}, {colors.dotActiveDim} (the goldens). {colors.onActive} is generated: white on
  // #FF3B30 is 3.55:1, so text on the red fill is the hue's dark ink (T6)
  dark_signal: { red: '#FF3B30', 'red-dim': '#B8241A' },
  // vite.dev: --color-vite #B39AFF, --color-electric #6C3BFF, vite docs' light brand #6B1EB9, hero panels #370A7F
  dark_vite: {
    red: '#B39AFF', 'red-hover': '#C2AEFF', 'red-press': '#A388F8', 'red-text': '#C2AEFF',
    'red-line': '#6C3BFF', 'on-red': '#16171D', 'red-dim': '#6C3BFF',
    'red-halo': `radial-gradient(closest-side, ${rgba('#6C3BFF', .45)}, ${rgba('#B39AFF', .22)} 60%, transparent)`,
    'red-surface': '#370A7F', 'red-surface-text': '#F2F3F5',
  },
  light_vite: {
    red: '#6C3BFF', 'red-hover': '#602AE3', 'red-press': '#6B1EB9', 'red-text': '#6B1EB9',
    'red-line': '#8A63FE', 'on-red': '#FFFFFF', 'red-dim': '#B39AFF',
    'red-halo': `radial-gradient(closest-side, ${rgba('#6C3BFF', .28)}, ${rgba('#B39AFF', .14)} 60%, transparent)`,
    'red-surface': '#F0EBFF', 'red-surface-text': '#140033',
  },
}

export type NeutralRole = (typeof NEUTRAL_ROLES)[number] | (typeof DOT_ROLES)[number]
/** The neutral and neutral-dot roles of a neutral set (the translucent ones at today's alphas). */
export function neutralRoles(n: Neutrals, scheme: Scheme): Record<NeutralRole, string> {
  const a = ALPHA[scheme]
  return {
    bg: n.bg, panel: n.panel, surface: n.surface, raised: n.raised,
    line: rgba(n.tint, a.line), 'line-strong': n['line-strong'], tint: n.tint, shade: n.shade, well: n.well, scrim: rgba(n.shade, a.scrim),
    value: n.value, label: n.label, mute: n.mute, dim: n.dim,
    'dot-faint': n.faint, 'dot-mid': n.mid, 'dot-idle': n.idle,
  }
}

/** Contrast of a dot / line colour on the surfaces it sits on (the card surface, and the page bg for chrome). */
const onPage = (hex: string, n: Neutrals) => Math.min(wcag(hex, n.surface), wcag(hex, n.bg))
/** The neutral dot tones an accent dot must stay distinct from. */
export const greysOf = (n: { value: string; idle: string; mid: string }) => [n.value, n.idle, n.mid]

/**
 * The solid: the L closest to the target (searched ±.3 in .005 steps, nearest first, chroma re-clamped at each L) that
 * reaches 3:1 on the surface and bg and stays distinct from the greys in every simulated vision. When no L does at
 * the target chroma (a few custom hues: a pink-red on paper reads as the dark grey to a protan eye), the search
 * repeats with less chroma. Falls back to the most distinct candidate that has the contrast.
 */
function pickSolid(target: Oklch, Ct: number, n: Neutrals): Oklch {
  const greys = greysOf(n)
  let fallback: { c: Oklch; score: number } | undefined
  for (const k of [1, .85, .7, .55]) for (let i = 0; i <= 120; i++) {
    const d = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .005, c = gamutClamp(target.L + d, Ct * k, target.h), hex = fromOklch(c)
    if (onPage(hex, n) < 3) continue
    const s = distinctness(hex, greys).score
    if (s >= 1) return c
    if (!fallback || s > fallback.score) fallback = { c, score: s }
  }
  return fallback?.c ?? target
}

/** Generate one preset theme (pins applied). */
export const generate = (scheme: Scheme, accent: AccentId): Theme => generateFrom(scheme, ACCENT_SPECS[accent], accent)

/**
 * The spec of any hue (the custom hue, T6): chroma and lightness are not the visitor's to pick, they are
 * interpolated around the hue circle between the two neighbouring presets, and the generator's rules then
 * clamp them (gamut, 3:1 dots, 4.5:1 text, distinct from the greys), so no pick can be illegible.
 */
export function specForHue(hue: number): AccentSpec {
  const h = ((hue % 360) + 360) % 360, ring = ACCENTS.map(a => ACCENT_SPECS[a]).sort((a, b) => a.hue - b.hue)
  const i = ring.findIndex(s => s.hue > h), b = ring[i < 0 ? 0 : i], a = ring[i <= 0 ? ring.length - 1 : i - 1]
  const span = ((b.hue - a.hue) + 360) % 360 || 360, t = (((h - a.hue) + 360) % 360) / span
  const mix = (x: Record<Scheme, number>, y: Record<Scheme, number>) => ({ dark: x.dark + (y.dark - x.dark) * t, light: x.light + (y.light - x.light) * t })
  return { id: 'signal', hue: h, character: 'custom', C: mix(a.C, b.C), L: mix(a.L, b.L) }
}
/** A theme for any hue (the custom accent): the preset generator, unpinned, neutrals tinted toward the hue. */
export const generateHue = (scheme: Scheme, hue: number): Theme => generateFrom(scheme, specForHue(hue), 'custom')

function generateFrom(scheme: Scheme, spec: AccentSpec, accent: AccentChoice): Theme {
  const h = spec.hue, Ct = spec.C[scheme], name = `${scheme}_${accent}` as ThemeKey
  const n = tint(NEUTRALS[scheme], scheme, accent, h), surf = n.surface
  const steps = L_STEPS[scheme](spec.L[scheme])
  const ramp = steps.map((L, i) => gamutClamp(L, Ct * C_CURVE[i], h))
  const pins = (PINS as Partial<Record<ThemeKey, Partial<Roles>>>)[name] ?? {}
  // a pinned solid anchors the derived roles (hover, press, text) too
  const solid = pins.red ? oklch(pins.red) : pickSolid(ramp[8], Ct, n)
  const text = nudge({ ...ramp[10], C: Math.min(ramp[10].C, solid.C) }, scheme, x => worst(x, n) >= 4.5 && Math.abs(apca(x, surf)) >= 60, Math.min(ramp[10].C, solid.C))
  const lineStep = [5, 6, 7].map(i => ramp[i]).find(c => onPage(fromOklch(c), n) >= 3) ?? nudge(ramp[7], scheme, x => onPage(x, n) >= 3)
  // hover lifts toward contrast (lighter on dark, darker on light); press sinks (dimmer on dark, deeper on light)
  const hover = gamutClamp(solid.L + (scheme === 'dark' ? .05 : -.05), Ct, h), press = gamutClamp(solid.L - (scheme === 'dark' ? .06 : .1), Ct, h)
  const dim = ramp[6]
  const solidHex = fromOklch(solid)
  const inset = scheme === 'dark' ? gamutClamp(.3, Math.min(.12, Ct * .7), h) : gamutClamp(.955, Math.min(.03, Ct * .25), h)
  const insetText = scheme === 'dark' ? n.value : clampHex(.2, Math.min(.08, Ct * .5), h)
  const roles: Roles = {
    ...neutralRoles(n, scheme),
    red: solidHex, 'red-dim': fromOklch(dim), 'red-hover': fromOklch(hover), 'red-press': fromOklch(press), 'red-text': fromOklch(text),
    'red-line': fromOklch(lineStep), 'on-red': onAccent(solidHex, solid), 'red-surface': fromOklch(inset), 'red-surface-text': insetText,
    'red-halo': `radial-gradient(closest-side, ${rgba(solidHex, .35)}, transparent)`, selection: rgba(solidHex, .3),
  }
  // the washes follow a pinned solid unless pinned themselves
  if (pins.red) Object.assign(roles, { 'red-halo': `radial-gradient(closest-side, ${rgba(pins.red, .35)}, transparent)`, selection: rgba(pins.red, .3) })
  Object.assign(roles, pins)
  return { name, scheme, accent, roles, ramp: ramp.map(fromOklch), solid: { L: solid.L, C: solid.C, requestedC: Ct }, pinned: Object.keys(pins) as Role[] }
}

/** The roles `prefers-contrast: more` raises (DESIGN.md › Theme › Contrast). */
export const MORE_ROLES = ['label', 'mute', 'dim', 'red-text', 'line'] as const
export type MoreRole = (typeof MORE_ROLES)[number]
/** AAA for text under `prefers-contrast: more`; the glyph grey reaches the text bar; the hairline alpha doubles. */
export const MORE = { text: 7, dim: 4.5, line: { dark: .16, light: .24 } } as const
/**
 * `prefers-contrast: more`: label, mute and the accent text pushed to 7:1 (AAA) on every surface, the glyph grey to
 * 4.5:1, the hairline alpha doubled. Same hues; only lightness moves (chroma re-clamped), so the theme still reads.
 */
export function moreRoles(t: Theme): Record<MoreRole, string> {
  const r = t.roles, n = { bg: r.bg, panel: r.panel, surface: r.surface, raised: r.raised } as Neutrals
  const lift = (hex: string, min: number) => fromOklch(nudge(oklch(hex), t.scheme, x => worst(x, n) >= min))
  return { label: lift(r.label, MORE.text), mute: lift(r.mute, MORE.text), dim: lift(r.dim, MORE.dim), 'red-text': lift(r['red-text'], MORE.text), line: rgba(r.tint, MORE.line[t.scheme]) }
}

/** CSS declarations of roles (`--role: value;`), in the given order. */
export const decls = (r: Partial<Record<Role, string>>, keys: readonly Role[], indent = '  ') => keys.filter(k => r[k] !== undefined).map(k => `${indent}--${k}: ${r[k]};`)
/** Every role a custom-hue theme writes (it has no base block of its own: neutrals, dots and the accent family). */
export const ALL_ROLES = [...NEUTRAL_ROLES, ...DOT_ROLES, ...ACCENT_ROLES] as const
/**
 * The custom hue's theme CSS, both schemes (scoped like the presets: `[data-scheme][data-accent="custom"]`, so a dark
 * inset on a light page gets the dark one), with its `prefers-contrast: more` blocks. The store keeps it in
 * localStorage and the boot script puts it in a `<style>` before first paint (`boot.ts`).
 */
export function customCss(hue: number): string {
  return SCHEMES.map(s => {
    const t = generateHue(s, hue), sel = `[data-scheme="${s}"][data-accent="custom"]`
    return `${sel}{${decls(t.roles, ALL_ROLES, '').join('')}}@media (prefers-contrast: more){${sel}{${decls(moreRoles(t), MORE_ROLES, '').join('')}}}`
  }).join('')
}

/** White when it reaches APCA 60 and WCAG 4.5:1 on the solid, else `oklch(.25 max(.08·C, .04) H)` darkened to 4.5:1. */
export function onAccent(solidHex: string, solid: Oklch): string {
  const white = '#FFFFFF'
  if (Math.abs(apca(white, solidHex)) >= 60 && wcag(white, solidHex) >= 4.5) return white
  let L = .25
  const C = Math.max(.08 * solid.C, .04)
  while (L > .02 && wcag(clampHex(L, C, solid.h), solidHex) < 4.5) L -= .01
  return clampHex(L, C, solid.h)
}

/** All 14 themes, in table order (dark first, accents in preset order). */
export const generateAll = (): Theme[] => SCHEMES.flatMap(s => ACCENTS.map(a => generate(s, a)))
