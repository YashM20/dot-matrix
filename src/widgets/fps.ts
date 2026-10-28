/**
 * Per-card frame rate and the phone tier (docs/living-matter/F0-foundation.md §2.8). A card's `fps`
 * (`WidgetPreset.fps`) is its rate on the shared clock while live; on a phone it is halved, never below
 * the default 12 and never above the card's own rate. Cards without `fps` keep DotCanvas's defaults.
 */
export type FpsTier = 'full' | 'phone'

/** The tier for a device: 'phone' on a coarse pointer, a save-data hint or ≤ 4 logical cores (unknown counts as many). */
export const tierOf = (coarse: boolean, saveData: boolean, cores?: number): FpsTier => (coarse || saveData || (cores || 8) <= 4 ? 'phone' : 'full')

let tier: FpsTier | undefined
/** 'phone' on a coarse pointer, or a low-power hint (navigator.connection?.saveData, or navigator.hardwareConcurrency ≤ 4). Read once per page. */
export function fpsTier(): FpsTier {
  const nav = globalThis.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined
  return (tier ??= tierOf(!!globalThis.matchMedia?.('(pointer: coarse)').matches, !!nav?.connection?.saveData, nav?.hardwareConcurrency))
}

/** full → base; phone → max(12, round(base / 2)), but never above base (so base ≤ 12 is unchanged). */
export const cardFps = (base: number, tier: FpsTier): number => (tier === 'full' ? base : Math.min(base, Math.max(12, Math.round(base / 2))))
