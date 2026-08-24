import type { Field } from '../types'
const smoothstep = (a:number,b:number,x:number) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t) }
export function ringField(cx:number,cy:number,rInner:number,rOuter:number,thetaStart:number,sweep:number): Field { return (u,v) => { const r=Math.hypot(u-cx,v-cy), theta=Math.atan2(v-cy,u-cx); const angle=((theta-thetaStart+Math.PI*2)%(Math.PI*2)); const radial=smoothstep(rInner,rInner+.012,r)* (1-smoothstep(rOuter-.012,rOuter,r)); return angle <= sweep ? radial : 0 } }
export function sunburstField(cx:number,cy:number,spokeCount:number,spokeWidth:number): Field { return (u,v) => { const a=(Math.atan2(v-cy,u-cx)+Math.PI*2)%(Math.PI*2); return ((a%(Math.PI*2/spokeCount)) < spokeWidth) ? Math.max(0,1-Math.hypot(u-cx,v-cy)*1.25) : 0 } }
export function concentricRingsField(cx:number,cy:number,frequency:number,phase:number): Field { return (u,v) => Math.pow(Math.abs(Math.sin(Math.hypot(u-cx,v-cy)*frequency-phase)), 8) }
/**
 * Animatable wrapper for the breathing-circles widget.
 * phase is expected to be driven per-frame: e.g.
 *   const phase = performance.now()/1000 * Math.PI // ~0.5 Hz
 *   field = breathingField(phase)
 * or via Board rAF: fieldAt(t) => breathingField(t*2). Keep concentricRingsField
 * as the primitive; this alias pins cx/cy/frequency to the widget defaults.
 */
export function breathingField(phase:number): Field { return concentricRingsField(0.5,0.5,14,phase) }
export function dialField(cx:number,cy:number,rOuter:number,valueAngle:number): Field { const ring=ringField(cx,cy,rOuter-.03,rOuter,0,Math.PI*2); return (u,v) => Math.max(ring(u,v), Math.hypot(u-(cx+Math.cos(valueAngle)*rOuter),v-(cy+Math.sin(valueAngle)*rOuter)) < .035 ? 1 : 0) }
