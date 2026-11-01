# Field IR cookbook

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots expanding outward from the center point -->

Field IR is the math language behind every code card in MAKE. Each program computes a brightness value between 0 and 1 for every dot on the grid. The engine supplies normalized coordinates `u` and `v` from 0 to 1, elapsed time `t` in seconds, pointer coordinates `pointer.x` and `pointer.y`, and custom slider values in `data`. You write programs using `let` bindings and standard mathematical functions.

Open MAKE, pick the Code tool (`C`), and paste any of these recipes into the CODE editor tab.

## Recipe 1: Expanding ripple

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots fading smoothly toward the card perimeter -->

A sine wave of distance from the center point, travelling outward over time.

```
let x = u - .5; let y = v - .5;
let d = length(x, y);
let w = .5 + .5 * sin(d * 38 - t * 5);
w * smoothstep(.7, .02, d)
```

Change the number 38 to pack more or fewer wave crests onto the card. Change 5 to speed up or slow down the wave travel. The `smoothstep(.7, .02, d)` fades the wave out gently before it hits the card boundary.

In dots, this program creates bright circular wave rings that originate at the center and expand outward. As rings travel toward the edge, their dot sizes step down through your chosen quantization levels until they dissolve into the dark background.

## Recipe 2: Shifting plasma

<!-- VISUAL: kind=card · what=ir-plasma · notice=flowing organic contour bands shifting smoothly across five tone levels -->

Four overlapping sine waves added together and folded into contour bands.

```
let x = u * 7; let y = v * 7;
let s = sin(x + t) + sin(y * 1.3 - t * .7)
      + sin((x + y) * .7 + t * .5)
      + sin(length(x - 3.5, y - 3.5) * 1.8 - t);
.5 + .5 * sin(s * 1.6)
```

Change the coordinate multiplier 7 to scale the wave shapes up or down. Change the number 1.6 in the final sine function to pack more bands into each swell.

In dots, this program draws islands of light that drift, split, and merge. Because the engine rounds brightness into 5 dot sizes, the continuous waves form stepped terraces with visible contour lines.

## Recipe 3: Nested dashed rings

<!-- VISUAL: kind=card · what=ir-rings · notice=three concentric orbits with broken dashes spinning in opposite directions -->

Concentric circular bands split into rotating dashes that alternate directions.

```
let x = u - .5; let y = v - .5;
let r = length(x, y) * 9; let a = atan(y, x) / TAU;
let band = floor(r);
let dir = band % 2 == 0 ? 1 : -1;
let dash = step(.4, fract((a + t * dir * (.06 + band * .012)) * (3 + band * 4)));
let ring = step(abs(fract(r) - .5), .2);
ring * dash * step(r, 4.6) * step(.7, r)
```

Change the multiplier 9 to fit more or fewer circular tracks onto the card. Adjust `.4` in the dash step to lengthen or shorten the arc dashes. Adjust `.06` to alter the base rotation speed.

In dots, this program draws crisp mechanical orbits. Odd rings rotate clockwise while even rings rotate counter-clockwise. The dots form sharp circular tracks with clean gaps between rows.

## Recipe 4: Sweeping clock hand

<!-- VISUAL: kind=card · what=station-clock · notice=a single straight line of dots rotating clockwise around the dial face -->

A radial ray that tracks an angle around the center point.

```
let x = u - .5; let y = .5 - v;
let a = fract(atan(x, y) / TAU);
let hand = fract(t / 60);
let diff = abs(a - hand);
let beam = step(min(diff, 1 - diff), .015);
let r = length(x, y);
beam * step(r, .45) * step(.05, r)
```

Change 60 to set the rotation cycle time in seconds. Use 10 for a rapid sweep, or 60 for a real clock hand. Adjust `.015` to make the hand thinner or thicker. Adjust `.45` to set the length of the hand.

In dots, this produces a straight needle that sweeps across the dial face. Dots turn on and off in clean order as the ray passes over their grid positions.

## Recipe 5: Falling rain

<!-- VISUAL: kind=steps · what=vertical rain streaks falling down hashed grid columns · notice=light dots trailing off upward in exponential decay curves -->

Vertical columns of falling droplets driven by pseudo-random coordinate hashing.

```
let c = floor(u * 48);
let speed = .35 + hash(c, 1) * .9;
let d = fract(hash(c, 7) + t * speed * .5 - v * 1.3);
let lit = step(hash(c, 3), .6);
lit * exp(-d * 5) * step(d, .6)
```

Change 48 to increase or decrease the count of rain lanes across the card width. Adjust `.6` in the `lit` step to thin out or thicken the rainfall. Adjust the decay factor 5 to shorten or lengthen the droplet tails.

In dots, this renders downward streaks of light. Each column runs at its own speed. The head of each droplet lights up at full dot size, and the tail fades upward through smaller dot sizes before extinguishing.

## Recipe 6: Hashed noise grid

<!-- VISUAL: kind=card · what=afterlight · notice=a coarse checkerboard pattern of digital static flickering at eight frames a second -->

A flickering grid of pseudo-random values generated by coordinate hashing.

```
let cx = floor(u * 32);
let cy = floor(v * 32);
let n = hash(cx + floor(t * 8), cy);
step(.55, n) * (.4 + .6 * hash(cx, cy))
```

Change 32 to scale the static block size up or down. Change 8 to speed up or slow down the static flicker rate. Adjust `.55` to increase or decrease the density of lit dots.

In dots, this looks like digital sensor noise or vintage television static. The grid cells stay locked to whole dot lattice boundaries, producing stable geometric grain.

## Recipe 7: Radial reveal mask

<!-- VISUAL: kind=diagram · what=circular expanding disc boundary · notice=smoothstep edge unmasking central card area every four seconds -->

A circular threshold boundary that expands from the center to unmask a card.

```
let x = u - .5; let y = v - .5;
let r = length(x, y);
let progress = fract(t * .25);
let edge = progress * .7;
smoothstep(edge + .05, edge, r)
```

Change `.25` to change how many seconds each reveal cycle takes. Adjust `.05` to sharpen or soften the boundary band between dark and lit dots.

In dots, this creates an iris wipe transition. A circle of dots blooms outward from the middle of the card, steps across the matrix in concentric rings, fills the canvas, and resets cleanly for the next loop.
