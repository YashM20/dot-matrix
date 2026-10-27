/**
 * The accent generator (docs/LAYOUT-THEME-PLAN.md §4 Accent ramps). One OKLCH hue per accent → a 12-step
 * ramp per scheme (1–2 washes, 3–5 fills, 6–8 lines, 9–10 the solid, 11–12 text), gamut-clamped (chroma
 * binary-searched at fixed L and h), then nudged until the rules hold:
 *  - `accent` (dots) ≥ 3:1 on `card`; `accent-text` ≥ 4.5:1 on every surface and ≥ APCA Lc 60 on `card`;
 *  - `on-accent` by measured contrast: white when it reaches APCA 60 and 4.5:1, else a dark tint of the hue,
 *    darkened until 4.5:1;
 *  - `accent-line` = the first of steps 6–8 at ≥ 3:1 on `card` (nudged if none);
 *  - neutrals tinted toward the hue by a little chroma (surfaces .005, line / text-3 ≤ .012, text-1 ≤ .004,
 *    vite surfaces up to .016; light gets 70%); the neutral dot tones stay untinted.
 * Hand-pinned values win: `dark_signal` is today's site exactly (goldens), and `vite` is pinned to
 * vite.dev's own purple. Pure and framework-free. `scripts/site/theme.ts --write` runs it once and writes
 * `table.ts`, `dots.ts` and `themes.css`; the site never runs colour math (the custom hue, T6, will run
 * this module lazily).
 */
import { apca, distinctness, fromOklch, gamutClamp, oklch, rgba, wcag, type Oklch } from './color'
import { ACCENTS, SCHEMES, themeName, type AccentId, type Scheme, type ThemeName } from './names'

/** The opaque neutral roles of one scheme (hex); the translucent ones derive from them. */
export interface Neutrals {
  bg: string; panel: string; card: string; raised: string
  'text-1': string; 'text-2': string; 'text-3': string
  /** Ink of the hairlines (white on dark, text-1 on light); `line` / `line-strong` are it at an alpha. */
  lineInk: string
  faint: string; mid: string; idle: string; value: string
}

/**
 * Today's dark site, exactly (App.css :root, DESIGN.md colour tokens, `dot480` in src/engine/theme/tokens.ts).
 * `dark_signal` is this with no tint, so goldens and the current chrome don't move.
 */
export const DARK: Neutrals = {
  bg: '#070809', panel: '#0B0C0E', card: '#111315', raised: '#1B1E21',
  'text-1': '#F2F3F5', 'text-2': '#C7CBD1', 'text-3': '#6E7278', lineInk: '#FFFFFF',
  faint: '#2E3033', mid: '#5B5F66', idle: '#8A8F98', value: '#F2F3F5',
}
/** Today's line alphas (App.css: `--line` .08; the stronger hairline .12 is the most used literal). */
const ALPHA = { dark: { line: .08, lineStrong: .12, overlay: .94, scrim: .5, shadow: .5 }, light: { line: .12, lineStrong: .2, overlay: .94, scrim: .28, shadow: .12 } } as const

/** The `paper` neutral preset (light): warm paper, not pure white (Cursor's #f7f7f4 / #f2f1ed; 2–3% L steps). */
const PAPER_HUE = 95
const paper = (L: number, C: number) => fromOklch(gamutClamp(L, C, PAPER_HUE))
export const LIGHT: Neutrals = {
  bg: paper(.955, .005), panel: paper(.935, .005), card: paper(.978, .004), raised: paper(.995, .003),
  'text-1': paper(.22, .004), 'text-2': paper(.38, .005), 'text-3': paper(.5, .006), lineInk: paper(.22, .004),
  faint: paper(.86, .003), mid: paper(.66, .003), idle: paper(.4, .003), value: paper(.22, .003),
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

/** Every role a theme sets (the CSS variable names without `--`). Components read roles, never hues. */
export const NEUTRAL_ROLES = ['bg', 'panel', 'card', 'raised', 'overlay', 'line', 'line-strong', 'text-1', 'text-2', 'text-3', 'scrim', 'shadow'] as const
export const DOT_ROLES = ['dot-faint', 'dot-mid', 'dot-idle', 'dot-value', 'dot-active', 'dot-active-dim'] as const
export const ACCENT_ROLES = ['accent', 'accent-hover', 'accent-press', 'accent-text', 'accent-soft', 'accent-line', 'accent-glow', 'accent-halo', 'on-accent', 'accent-surface', 'accent-surface-text', 'focus-ring', 'selection'] as const
export type Role = (typeof NEUTRAL_ROLES)[number] | (typeof DOT_ROLES)[number] | (typeof ACCENT_ROLES)[number]
export type Roles = Record<Role, string>

export interface Theme {
  name: ThemeName; scheme: Scheme; accent: AccentId
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
const TINT = { surface: .005, viteSurface: .014, line: .01, text3: .01, text2: .006, text1: .003 }

const clampHex = (L: number, C: number, h: number) => fromOklch(gamutClamp(L, C, h))
const SURFACES = ['bg', 'panel', 'card', 'raised'] as const
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
export function tint(base: Neutrals, scheme: Scheme, accent: AccentId, hue: number): Neutrals {
  if (scheme === 'dark' && accent === 'signal') return { ...base }
  const k = scheme === 'light' ? .7 : 1, at = (hex: string, C: number) => clampHex(oklch(hex).L, C * k, hue)
  const sC = accent === 'vite' ? TINT.viteSurface : TINT.surface
  const n: Neutrals = {
    ...base,
    bg: at(base.bg, sC * .8), panel: at(base.panel, sC), card: at(base.card, sC), raised: at(base.raised, sC),
    'text-1': at(base['text-1'], TINT.text1), 'text-2': at(base['text-2'], TINT.text2), 'text-3': at(base['text-3'], TINT.text3),
    lineInk: scheme === 'dark' ? clampHex(.97, TINT.line, hue) : at(base.lineInk, TINT.line),
  }
  // tinted text keeps ≥ 4.5:1 on every surface (today's dark text-3 is 3.8:1 on card: raised here, waived on dark_signal)
  for (const r of ['text-1', 'text-2', 'text-3'] as const) n[r] = fromOklch(nudge(oklch(n[r]), scheme, h => worst(h, n) >= 4.5))
  return n
}

/** Hand-pinned roles (they win over the generator, and must pass the same rules). */
export const PINS: Partial<Record<ThemeName, Partial<Roles>>> = {
  // today's site: {colors.dotActive}, {colors.dotActiveDim}, {colors.onActive}
  dark_signal: { accent: '#FF3B30', 'dot-active': '#FF3B30', 'dot-active-dim': '#B8241A', 'on-accent': '#FFFFFF' },
  // vite.dev: --color-vite #B39AFF, --color-electric #6C3BFF, vite docs' light brand #6B1EB9, hero panels #370A7F
  dark_vite: {
    accent: '#B39AFF', 'dot-active': '#B39AFF', 'accent-hover': '#C2AEFF', 'accent-press': '#A388F8', 'accent-text': '#C2AEFF',
    'accent-soft': rgba('#B39AFF', .14), 'accent-line': '#6C3BFF', 'focus-ring': '#6C3BFF', 'on-accent': '#16171D', 'dot-active-dim': '#6C3BFF',
    'accent-glow': rgba('#B39AFF', .35), 'accent-halo': `radial-gradient(closest-side, ${rgba('#6C3BFF', .45)}, ${rgba('#B39AFF', .22)} 60%, transparent)`,
    'accent-surface': '#370A7F', 'accent-surface-text': '#F2F3F5',
  },
  light_vite: {
    accent: '#6C3BFF', 'dot-active': '#6C3BFF', 'accent-hover': '#602AE3', 'accent-press': '#6B1EB9', 'accent-text': '#6B1EB9',
    'accent-soft': rgba('#6C3BFF', .12), 'accent-line': '#8A63FE', 'focus-ring': '#8A63FE', 'on-accent': '#FFFFFF', 'dot-active-dim': '#B39AFF',
    'accent-glow': rgba('#6C3BFF', .25), 'accent-halo': `radial-gradient(closest-side, ${rgba('#6C3BFF', .28)}, ${rgba('#B39AFF', .14)} 60%, transparent)`,
    'accent-surface': '#F0EBFF', 'accent-surface-text': '#140033',
  },
}

export type NeutralRole = (typeof NEUTRAL_ROLES)[number] | Exclude<(typeof DOT_ROLES)[number], 'dot-active' | 'dot-active-dim'>
/** The neutral and neutral-dot roles of a neutral set (the translucent ones at today's alphas). */
export function neutralRoles(n: Neutrals, scheme: Scheme): Record<NeutralRole, string> {
  const a = ALPHA[scheme], shade = scheme === 'dark' ? '#000000' : n['text-1']
  return {
    bg: n.bg, panel: n.panel, card: n.card, raised: n.raised,
    overlay: rgba(n.raised, a.overlay), line: rgba(n.lineInk, a.line), 'line-strong': rgba(n.lineInk, a.lineStrong),
    'text-1': n['text-1'], 'text-2': n['text-2'], 'text-3': n['text-3'], scrim: rgba(shade, a.scrim), shadow: rgba(shade, a.shadow),
    'dot-faint': n.faint, 'dot-mid': n.mid, 'dot-idle': n.idle, 'dot-value': n.value,
  }
}

/** Contrast of a dot / line colour on the surfaces it sits on (card, and the page bg for chrome). */
const onPage = (hex: string, n: Neutrals) => Math.min(wcag(hex, n.card), wcag(hex, n.bg))
/** The neutral dot tones an accent dot must stay distinct from. */
export const greysOf = (n: { value: string; idle: string; mid: string }) => [n.value, n.idle, n.mid]

/**
 * The solid: the L closest to the target (searched ±.15 in .005 steps, chroma re-clamped at each L) that
 * reaches 3:1 on card and bg and stays distinct from the greys in every simulated vision. Falls back to
 * the most distinct L that has the contrast.
 */
function pickSolid(target: Oklch, Ct: number, n: Neutrals): Oklch {
  const greys = greysOf(n)
  let fallback: { c: Oklch; score: number } | undefined
  for (let i = 0; i <= 60; i++) {
    const d = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .005, c = gamutClamp(target.L + d, Ct, target.h), hex = fromOklch(c)
    if (onPage(hex, n) < 3) continue
    const s = distinctness(hex, greys).score
    if (s >= 1) return c
    if (!fallback || s > fallback.score) fallback = { c, score: s }
  }
  return fallback?.c ?? target
}

/** Generate one theme (pins applied). */
export function generate(scheme: Scheme, accent: AccentId): Theme {
  const spec = ACCENT_SPECS[accent], h = spec.hue, Ct = spec.C[scheme], name = themeName(scheme, accent)
  const n = tint(NEUTRALS[scheme], scheme, accent, h), card = n.card
  const steps = L_STEPS[scheme](spec.L[scheme])
  const ramp = steps.map((L, i) => gamutClamp(L, Ct * C_CURVE[i], h))
  // a pinned solid anchors the derived roles (hover, press, text) too
  const pinnedSolid = PINS[name]?.accent, solid = pinnedSolid ? oklch(pinnedSolid) : pickSolid(ramp[8], Ct, n)
  const text = nudge({ ...ramp[10], C: Math.min(ramp[10].C, solid.C) }, scheme, x => worst(x, n) >= 4.5 && Math.abs(apca(x, card)) >= 60, Math.min(ramp[10].C, solid.C))
  const lineStep = [5, 6, 7].map(i => ramp[i]).find(c => onPage(fromOklch(c), n) >= 3) ?? nudge(ramp[7], scheme, x => onPage(x, n) >= 3)
  // hover lifts toward contrast (lighter on dark, darker on light); press sinks (dimmer on dark, deeper on light)
  const hover = gamutClamp(solid.L + (scheme === 'dark' ? .05 : -.05), Ct, h), press = gamutClamp(solid.L - (scheme === 'dark' ? .06 : .1), Ct, h)
  const dim = ramp[6]
  const solidHex = fromOklch(solid)
  const surface = scheme === 'dark' ? gamutClamp(.3, Math.min(.12, Ct * .7), h) : gamutClamp(.955, Math.min(.03, Ct * .25), h)
  const surfaceText = scheme === 'dark' ? n['text-1'] : clampHex(.2, Math.min(.08, Ct * .5), h)
  const roles: Roles = {
    ...neutralRoles(n, scheme), 'dot-active': solidHex, 'dot-active-dim': fromOklch(dim),
    accent: solidHex, 'accent-hover': fromOklch(hover), 'accent-press': fromOklch(press), 'accent-text': fromOklch(text),
    'accent-soft': rgba(solidHex, .12), 'accent-line': fromOklch(lineStep), 'accent-glow': rgba(solidHex, .35),
    'accent-halo': `radial-gradient(closest-side, ${rgba(solidHex, .35)}, transparent)`,
    'on-accent': onAccent(solidHex, solid), 'accent-surface': fromOklch(surface), 'accent-surface-text': surfaceText,
    'focus-ring': fromOklch(lineStep), selection: rgba(solidHex, .3),
  }
  const pins = PINS[name] ?? {}
  // the washes follow a pinned solid unless pinned themselves
  if (pins.accent) Object.assign(roles, { 'accent-soft': rgba(pins.accent, .12), 'accent-glow': rgba(pins.accent, .35), 'accent-halo': `radial-gradient(closest-side, ${rgba(pins.accent, .35)}, transparent)`, selection: rgba(pins.accent, .3) })
  Object.assign(roles, pins)
  return { name, scheme, accent, roles, ramp: ramp.map(fromOklch), solid: { L: solid.L, C: solid.C, requestedC: Ct }, pinned: Object.keys(pins) as Role[] }
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
