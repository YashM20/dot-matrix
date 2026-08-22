export function quantize(value: number, steps: number): number {
  const bounded = Math.max(0, Math.min(1, value))
  if (!Number.isFinite(steps) || steps < 2) return bounded
  return Math.round(bounded * (steps - 1)) / (steps - 1)
}
