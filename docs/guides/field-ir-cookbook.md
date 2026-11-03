# Field IR cookbook

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots expanding outward from the center point -->

Field IR is the math language behind every code layer in MAKE. A program is one expression that gives each dot a brightness, and the result is clamped to 0 to 1. You get these inputs:

- `u` and `v`, the dot's position, from 0 to 1 across and down the card (`v` grows downward).
- `t`, the time in seconds.
- `pointer.x` and `pointer.y`, the pointer in the same units, both -1 when there is no pointer, and `pointer.down`, 1 while it is pressed.
- `data.NAME`, a value you name yourself. Each one gets a 0 to 1 slider in the DATA section of the CODE tab, and reads 0 until you move it.

You can name values with `let x = ...;`, compare with `<`, `==` and the rest (true is 1, false is 0), and choose with `a ? b : c`. The functions are `sin`, `cos`, `abs`, `floor`, `fract`, `sqrt`, `exp`, `sign`, `min`, `max`, `step`, `atan(y, x)`, `length(x, y)`, `hash(a, b)`, `clamp`, `mix`, `smoothstep`, and the distance shapes `sdCircle`, `sdBox` and `sdRing`. `PI` and `TAU` are built in.

Open MAKE, pick the Code tool (`C`) and click inside a frame to add a code layer. Then paste any of these recipes into the CODE tab.

## Recipe 1: Expanding ripple

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots fading smoothly toward the card perimeter -->

A sine wave of distance from the center point, moving outward over time.

```
let x = u - .5; let y = v - .5;
let d = length(x, y);
let w = .5 + .5 * sin(d * 38 - t * 5);
w * smoothstep(.7, .02, d)
```

Change the number 38 to pack more or fewer wave crests onto the card. Change 5 to speed up or slow down the wave travel. The `smoothstep(.7, .02, d)` fades the wave out before it reaches the edge of the card.

Bright rings start at the center and move outward. Near the edge their dots step down through the quantize sizes until they disappear.

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

In dots, this program draws islands of light that drift, split, and merge. With the default 5 quantize steps, the smooth waves form stepped terraces with visible contour lines.

## Recipe 3: Nested dashed rings

<!-- VISUAL: kind=shot · what=MAKE code layer running the dashed rings recipe on a 2× lattice · notice=four dashed orbits, each turning the other way from its neighbors -->

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

In dots, this program draws crisp mechanical orbits. `band` numbers the rings from the center out, and `dir` flips with each one, so neighboring rings turn in opposite directions. Rings further out turn a little faster and carry more dashes.

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

60 is the time for one turn, in seconds. Use 10 for a fast sweep. Adjust `.015` to make the hand thinner or thicker. Adjust `.45` to set the length of the hand.

The result is a straight needle sweeping round the dial, lighting dots in order as it passes over them.

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

Each lit column falls at its own speed. The head of a drop is the biggest dot, and its tail shrinks upward through the smaller sizes.

## Recipe 6: Hashed noise grid

<!-- VISUAL: kind=shot · what=MAKE code layer running the hashed noise recipe · notice=a 32 × 32 grid of square blocks flickering eight times a second -->

A flickering grid of pseudo-random values generated by coordinate hashing.

```
let cx = floor(u * 32);
let cy = floor(v * 32);
let n = hash(cx + floor(t * 8), cy);
step(.55, n) * (.4 + .6 * hash(cx, cy))
```

Change 32 to scale the static block size up or down. Change 8 to speed up or slow down the static flicker rate. Adjust `.55` to increase or decrease the density of lit dots.

In dots, this looks like sensor noise or old television static. Each block covers several dots, so the grain stays coarse and square.

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

Each reveal lasts 1 / .25 = 4 seconds: use `.5` for 2 seconds or `.1` for 10. Adjust `.05` to sharpen or soften the boundary band between dark and lit dots.

This makes an iris wipe. A disc of lit dots grows from the middle of the card until it nearly fills it, then starts again from nothing.
