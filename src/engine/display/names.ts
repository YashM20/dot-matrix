/** Skin names and switcher labels only (no physics): what the always-loaded switcher and store need. */
export const SKIN_NAMES = ['oled', 'nixie', 'vfd', 'crt'] as const
export type SkinName = typeof SKIN_NAMES[number]
export const isSkinName = (s: unknown): s is SkinName => typeof s === 'string' && (SKIN_NAMES as readonly string[]).includes(s)

/**
 * The skin a page opens on: a valid `?skin=` first, then the saved `dot480:skin`, else `oled`. A name that is not a
 * skin (a typo, or a removed skin such as `eink` or `flipdisc` from an old link or an old save) is skipped, never an error.
 */
export const pickSkin = (query: unknown, stored: unknown): SkinName => isSkinName(query) ? query : isSkinName(stored) ? stored : 'oled'

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
