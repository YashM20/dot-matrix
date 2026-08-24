import type { Field } from '../types'
const cache = new Map<string, Float32Array>()
export const iconPaths = { cloud: 'M6 18h20a8 8 0 0 0 0-16 10 10 0 0 0-19 3', car: 'M5 18h22l-3-8H9l-4 8Zm4 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm14 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', leaf: 'M6 25C7 11 15 5 28 4c-1 13-7 21-21 21Zm1-1c5-5 10-9 16-13' }
export function rasterizeToMask(svgPathOrGlyph: string, resolution: number): Uint8ClampedArray { const canvas=document.createElement('canvas'); canvas.width=canvas.height=resolution; const context=canvas.getContext('2d'); if (!context) return new Uint8ClampedArray(resolution*resolution); context.fillStyle='#fff'; context.font=`${resolution*.75}px sans-serif`; if (svgPathOrGlyph.length === 1) context.fillText(svgPathOrGlyph, resolution*.1, resolution*.8); else { const path=new Path2D(svgPathOrGlyph); context.scale(resolution/32,resolution/32); context.fillStyle='#fff'; context.fill(path) } const data=context.getImageData(0,0,resolution,resolution).data; return Uint8ClampedArray.from({length:resolution*resolution},(_,i)=>data[i*4+3] > 100 ? 1 : 0) }
/**
 * Distance to nearest foreground pixel (mask===1) — Euclidean.
 * TODO FH: replace chamfer fast-path with exact Felzenszwalb-Huttenlocher
 * separable 1-D EDT (O(n) row pass + O(n) column pass) for <1% error and
 * linear time. Current chamfer 3-4 is ~6% error vs Euclidean but 10-100×
 * faster than brute at large sizes — sufficient until icon count >30.
 */
function chamferDistanceTransform(mask: Uint8ClampedArray, width:number, height:number): Float32Array {
  const INF = width * height
  const dist=new Float32Array(width*height)
  for(let i=0;i<mask.length;i++) dist[i]=mask[i] ? 0 : INF
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){
    const index=y*width+x; if(dist[index]===0) continue
    let best=dist[index]
    if(x>0) best=Math.min(best, dist[index-1]+3)
    if(y>0) best=Math.min(best, dist[index-width]+3)
    if(x>0&&y>0) best=Math.min(best, dist[index-width-1]+4)
    if(x+1<width&&y>0) best=Math.min(best, dist[index-width+1]+4)
    dist[index]=best
  }
  for(let y=height-1;y>=0;y--) for(let x=width-1;x>=0;x--){
    const index=y*width+x; if(dist[index]===0) continue
    let best=dist[index]
    if(x+1<width) best=Math.min(best, dist[index+1]+3)
    if(y+1<height) best=Math.min(best, dist[index+width]+3)
    if(x+1<width&&y+1<height) best=Math.min(best, dist[index+width+1]+4)
    if(x>0&&y+1<height) best=Math.min(best, dist[index+width-1]+4)
    dist[index]=best
  }
  for(let i=0;i<dist.length;i++) dist[i]/=3
  return dist
}
export function distanceTransform(mask: Uint8ClampedArray, width:number, height:number): Float32Array {
  // Fast approximate EDT for large rasters — avoids O(n²·points) blow-up.
  // 64×64 (4096 px) is the cutoff: brute is fine below, chamfer above.
  // Keep brute for small (exact) so existing single-icon caches stay bit-identical.
  if(width*height>4096) return chamferDistanceTransform(mask,width,height)
  const output=new Float32Array(width*height); const points:number[]=[]; for(let i=0;i<mask.length;i++) if(mask[i]) points.push(i)
  // Early-out: foreground pixels are distance 0; skip inner loop entirely.
  if(points.length===0){ output.fill(Math.hypot(width,height)); return output }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){
    const index=y*width+x; if(mask[index]){ output[index]=0; continue }
    let nearest=Infinity; for(const point of points){const px=point%width,py=Math.floor(point/width); const d=(x-px)**2+(y-py)**2; if(d<nearest) nearest=d; if(nearest===1) break } output[index]=Math.sqrt(nearest)
  } return output
}
export function iconField(distanceField: Float32Array, width:number, height:number): Field { return (u,v) => { const x=Math.min(width-1,Math.max(0,Math.floor(u*width))), y=Math.min(height-1,Math.max(0,Math.floor(v*height))); return Math.max(0,1-distanceField[y*width+x]/2) } }
export function cachedIconField(iconId: string, path: string, resolution: number): Field { const key=`${iconId}:${resolution}`; let distance=cache.get(key); if(!distance){ distance=distanceTransform(rasterizeToMask(path,resolution),resolution,resolution); cache.set(key,distance) } return iconField(distance,resolution,resolution) }
