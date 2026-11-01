# Real iPhone tilt checklist

Manual check for tilt-driven light and motion on `/pond/` and `/materials/`.

## Setup and permission

- [ ] Open Safari on the iPhone and visit https://dot-matrix1.vercel.app/pond/.
- [ ] Open **TOOLS** and tap **TILT**. On iOS, this tap is required to request motion access; allow it when Safari asks.
- [ ] Confirm TILT reports as on. If access was previously denied, allow motion access in browser settings and try again.
- [ ] Repeat on `/materials/`. Tilt does not start automatically; use the TILT control.

## Pond (`/pond/`)

- [ ] At rest, the water and objects settle; the light does not abruptly flip 180°.
- [ ] Slowly tilt the phone in each direction. On `pond-koi`, the water piles downhill and sloshes at the walls; floating pellets and pads drift downhill.
- [ ] Check that the koi's lighting follows the tilt light.
- [ ] Return the phone upright and confirm the water settles back toward rest.

## Materials (`/materials/`)

- [ ] Slowly tilt the phone in each direction. Lit material surfaces, including `mat-lens`, should change their lighting direction with the tilt.
- [ ] Return the phone upright and check that the light remains steady; it must not flip 180° at rest.
- [ ] Check each visible material card for a smooth light change without a sudden jump.

## Device and layout checks

- [ ] Repeat the pond and materials checks in portrait orientation.
- [ ] Repeat in landscape orientation.
- [ ] Enable iOS Reduce Motion and repeat. Tilt remains opt-in; after enabling it, the light hub emits at a reduced rate (up to 4 Hz).
- [ ] Turn TILT off and confirm tilt-driven input stops.

## Record results

- [ ] Record iPhone model and iOS version: ____________________
- [ ] Record Safari version: ____________________
- [ ] Pond, each card checked: pass/fail and notes: ____________________
- [ ] Materials, each card checked: pass/fail and notes: ____________________
- [ ] Portrait / landscape / Reduce Motion: pass/fail and notes: ____________________
- [ ] Permission prompt, grant/deny behavior, and any unexpected 180° light flip: ____________________
