/** Skin names and switcher labels only (no physics): what the always-loaded switcher and store need. */
export const SKIN_NAMES = ['oled', 'crt', 'vfd', 'led', 'eink', 'flipdisc', 'nixie', 'lcd', 'grout'] as const
export type SkinName = typeof SKIN_NAMES[number]
export const isSkinName = (s: unknown): s is SkinName => typeof s === 'string' && (SKIN_NAMES as readonly string[]).includes(s)

export interface SkinInfo {
  name: SkinName
  /** Short label for the switcher (≤ 5 chars). */
  label: string
  title: string
  /** How the overlay composites over the card: emissive skins add light (`screen`), reflective ones cover it. */
  blend: 'none' | 'screen' | 'normal'
}
export const SKINS: Record<SkinName, SkinInfo> = {
  oled: { name: 'oled', label: 'OLED', title: 'OLED: the card as sampled (default)', blend: 'none' },
  crt: { name: 'crt', label: 'CRT', title: 'CRT: phosphor persistence, scanlines, bloom, curved glass', blend: 'screen' },
  vfd: { name: 'vfd', label: 'VFD', title: 'Vacuum fluorescent: phosphor glow in the accent behind a grid mesh', blend: 'screen' },
  led: { name: 'led', label: 'LED', title: 'LED matrix: accent LEDs, round lenses, bleed, unlit lenses visible', blend: 'screen' },
  eink: { name: 'eink', label: 'INK', title: 'E-ink: 1-bit dither, ghosting, full-refresh flash', blend: 'normal' },
  flipdisc: { name: 'flipdisc', label: 'FLIP', title: 'Flip-disc: two-faced discs with inertia (clack optional)', blend: 'normal' },
  nixie: { name: 'nixie', label: 'NIXIE', title: 'Nixie-ish: warm neon glow behind a hex anode mesh', blend: 'screen' },
  lcd: { name: 'lcd', label: 'LCD', title: 'LCD: square pixels, slow response, backplane shadow', blend: 'normal' },
  grout: { name: 'grout', label: 'GROUT', title: 'Mosaic: a tile per cell, grout, bevels', blend: 'normal' },
}
