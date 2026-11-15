/** Skin names and switcher labels only (no physics): what the always-loaded switcher and store need. */
export const SKIN_NAMES = ['oled', 'nixie', 'vfd', 'crt'] as const
export type SkinName = typeof SKIN_NAMES[number]
export const isSkinName = (s: unknown): s is SkinName => typeof s === 'string' && (SKIN_NAMES as readonly string[]).includes(s)

/**
 * The skin a page opens on. A `?skin=` link decides when it is there: its skin, or `oled` when it names no skin (a typo,
 * or a removed skin such as `eink` or `flipdisc` from an old link), whatever is saved. With no link, the saved
 * `dot480:skin` if it is a skin, else `oled`. Never an error.
 */
export const pickSkin = (query: unknown, stored: unknown): SkinName =>
  typeof query === 'string' && query !== '' ? (isSkinName(query) ? query : 'oled') : isSkinName(stored) ? stored : 'oled'

export interface SkinInfo {
  name: SkinName
  /** Short label for the switcher (≤ 5 chars). */
  label: string
  title: string
  /** How the overlay composites over the card: emissive skins add light (`screen`); OLED has no overlay. */
  blend: 'none' | 'screen'
}
export const SKINS: Record<SkinName, SkinInfo> = {
  oled: { name: 'oled', label: 'OLED', title: 'OLED: the card as sampled (default)', blend: 'none' },
  nixie: { name: 'nixie', label: 'NIXIE', title: 'Nixie-ish: warm neon glow behind a hex anode mesh', blend: 'screen' },
  vfd: { name: 'vfd', label: 'VFD', title: 'Vacuum fluorescent: phosphor glow in the accent behind a grid mesh', blend: 'screen' },
  crt: { name: 'crt', label: 'CRT', title: 'CRT: phosphor persistence, scanlines, bloom, curved glass', blend: 'screen' },
}
