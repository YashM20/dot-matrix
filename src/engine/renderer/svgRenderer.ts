import type { DotInstance } from '../types'
import { circlePath, squarePath, squirclePath } from './shapePath'
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
export function renderSVG(dots: DotInstance[], width: number, height: number): string { const paths = dots.filter(d => d.r > 0 && d.opacity > 0).map(d => { const path = d.shape === 'square' ? squarePath(d.x,d.y,d.r) : d.shape === 'squircle' ? squirclePath(d.x,d.y,d.r,d.roundness) : circlePath(d.x,d.y,d.r); return `<path d="${path}" fill="${escape(d.color)}" fill-opacity="${d.opacity}"/>` }).join(''); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${paths}</svg>` }
