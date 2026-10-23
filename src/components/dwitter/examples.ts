/**
 * The eight seed programs of the DOTS tab — the first thing a visitor sees, so each one is a small,
 * readable idea that moves well on a coarse lattice. All are plain Field IR (`dot` v0).
 */
import type { SharedProgram } from '../../lib/share'

export interface Example extends SharedProgram { name: string }

const ex = (name: string, lattice: number, tone: SharedProgram['tone'], src: string, grid: SharedProgram['grid'] = 'square'): Example => ({ name, src, grid, lattice, tone })

export const EXAMPLES: Example[] = [
  ex('ripple', 3, 'auto', `// ripple: rings leave the centre, the pointer drops a second stone
let x = u - .5; let y = v - .5;
let d = length(x, y);
let w = .5 + .5 * sin(d * 38 - t * 5);
let p = pointer.x < 0 ? 0 : .5 + .5 * sin(length(u - pointer.x, v - pointer.y) * 52 - t * 7);
max(w, p) * smoothstep(.7, .02, d)`),

  ex('plasma', 2, 'auto', `// plasma: four interfering sines folded into contour bands
let x = u * 7; let y = v * 7;
let s = sin(x + t) + sin(y * 1.3 - t * .7)
      + sin((x + y) * .7 + t * .5)
      + sin(length(x - 3.5, y - 3.5) * 1.8 - t);
.5 + .5 * sin(s * 1.6)`),

  ex('rings', 2, 'auto', `// rings: dashed orbits, each turning its own way at its own pace
let x = u - .5; let y = v - .5;
let r = length(x, y) * 9; let a = atan(y, x) / TAU;
let band = floor(r);
let dir = band % 2 == 0 ? 1 : -1;
let dash = step(.4, fract((a + t * dir * (.06 + band * .012)) * (3 + band * 4)));
let ring = step(abs(fract(r) - .5), .2);
ring * dash * step(r, 4.6) * step(.7, r) * (.45 + .55 * (1 - band / 5))`),

  ex('spiral', 2, 'auto', `// spiral: a four-armed galaxy winding into a bright core
let x = u - .5; let y = v - .5;
let r = length(x, y); let a = atan(y, x);
let arm = .5 + .5 * sin(a * 4 + sqrt(r) * 30 - t * 1.6);
let dust = .6 + .4 * hash(floor(u * 72), floor(v * 72));
max(arm ^ 2 * dust * smoothstep(.56, .04, r), smoothstep(.13, 0, r))`),

  ex('rain', 3, 'auto', `// rain: drops fall down hashed columns; data.density thins them
let c = floor(u * 48);
let speed = .35 + hash(c, 1) * .9;
let d = fract(hash(c, 7) + t * speed * .5 - v * 1.3);
let lit = step(hash(c, 3), .25 + data.density * .75);
lit * exp(-d * 5) * step(d, .6)`),

  ex('lissajous', 2, 'auto', `// lissajous: a 3:2 figure of beads, a bright comet running through it
let x = u - .5; let y = v - .5;
for i in 0..64 with m = 0 {
  let s = i / 64 * TAU;
  let b = .45 + .55 * fract(i / 64 - t * .12) ^ 4;
  let d = length(x - .4 * sin(3 * s + t * .5), y - .4 * sin(2 * s));
  max(m, b * smoothstep(.04, .012, d))
}`),

  ex('checker warp', 2, 'auto', `// checker warp: a checkerboard twisted around the pointer (or a wandering lens)
let px = pointer.x < 0 ? .5 + .28 * cos(t * .6) : pointer.x;
let py = pointer.y < 0 ? .5 + .28 * sin(t * .9) : pointer.y;
let dx = u - px; let dy = v - py;
let r = length(dx, dy);
let a = 2.6 * exp(-r * r * 14);
let x = dx * cos(a) - dy * sin(a); let y = dx * sin(a) + dy * cos(a);
let c = (floor(x * 9 + t * .4) + floor(y * 9)) % 2;
c * (.3 + .7 * smoothstep(.75, 0, r))`),

  ex('heartbeat', 3, 'active', `// heartbeat: lub-dub at data.bpm (40 to 160), an echo shed on every beat
let p = fract(t * (40 + data.bpm * 120) / 60);
let beat = exp(-p * 14) + .6 * exp(-(p - .22) ^ 2 * 800);
let s = 1 + .14 * beat;
let x = (u - .5) * 3.2 / s; let y = (.5 - v) * 3.2 / s + .28;
let h = x * x + (y - abs(x) ^ .7) ^ 2 - 1;
let e = 1 + p * .7;
let h2 = (x / e) ^ 2 + (y / e - abs(x / e) ^ .7) ^ 2 - 1;
max((.5 + .5 * beat) * step(h, 0), (1 - p) * .7 * step(abs(h2), .09))`),
]
