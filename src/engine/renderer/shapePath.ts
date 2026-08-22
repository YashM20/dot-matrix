export function circlePath(x: number, y: number, r: number): string { return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0` }
export function squarePath(x: number, y: number, r: number): string { return `M ${x - r} ${y - r}h${r * 2}v${r * 2}h${-r * 2}Z` }
export function squirclePath(x: number, y: number, r: number, roundness = .7): string { const c = r * (.2 + Math.max(0, Math.min(1, roundness)) * .35); return `M ${x} ${y-r} C ${x+c} ${y-r} ${x+r} ${y-c} ${x+r} ${y} C ${x+r} ${y+c} ${x+c} ${y+r} ${x} ${y+r} C ${x-c} ${y+r} ${x-r} ${y+c} ${x-r} ${y} C ${x-r} ${y-c} ${x-c} ${y-r} ${x} ${y-r}Z` }
export function superformulaPath(): never { throw new Error('not implemented — deferred, see DESIGN.md Known Gaps') }
