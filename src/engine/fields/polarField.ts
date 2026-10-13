import type { Field } from '../types'
const TAU = Math.PI * 2
const smoothstep = (a:number,b:number,x:number) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t) }
/** Angle of (u,v) around (cx,cy) measured clockwise from `thetaStart`, always in [0, 2π). */
const angleFrom = (u:number,v:number,cx:number,cy:number,thetaStart:number) => (((Math.atan2(v-cy,u-cx)-thetaStart) % TAU) + TAU) % TAU
export function ringField(cx:number,cy:number,rInner:number,rOuter:number,thetaStart:number,sweep:number): Field { return (u,v) => { const r=Math.hypot(u-cx,v-cy); const radial=smoothstep(rInner,rInner+.012,r)* (1-smoothstep(rOuter-.012,rOuter,r)); return angleFrom(u,v,cx,cy,thetaStart) <= sweep ? radial : 0 } }
export function sunburstField(cx:number,cy:number,spokeCount:number,spokeWidth:number): Field { return (u,v) => { const a=angleFrom(u,v,cx,cy,0); return ((a%(TAU/spokeCount)) < spokeWidth) ? Math.max(0,1-Math.hypot(u-cx,v-cy)*1.25) : 0 } }
export function concentricRingsField(cx:number,cy:number,frequency:number,phase:number): Field { return (u,v) => Math.pow(Math.abs(Math.sin(Math.hypot(u-cx,v-cy)*frequency-phase)), 8) }
/** Animatable wrapper for the breathing-circles widget — drive `phase` per frame (e.g. t * π). */
export function breathingField(phase:number): Field { return concentricRingsField(0.5,0.5,14,phase) }
export function dialField(cx:number,cy:number,rOuter:number,valueAngle:number): Field { const ring=ringField(cx,cy,rOuter-.03,rOuter,0,TAU); return (u,v) => Math.max(ring(u,v), Math.hypot(u-(cx+Math.cos(valueAngle)*rOuter),v-(cy+Math.sin(valueAngle)*rOuter)) < .035 ? 1 : 0) }
