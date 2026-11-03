# Behind the boards

<!-- VISUAL: kind=card · what=pond-koi · notice=koi swimming through rippling water drawn in dot tiles, with red markings -->

The site has more than thirty live boards. This guide goes behind three of them: the koi pond, the joined squares and the materials. They all use the same pipeline as every other card: a continuous field, sampled onto a fixed grid of dots.

## The living koi pond

<!-- VISUAL: kind=card · what=pond-koi · notice=six koi circling a feeding spot while ripples spread from their tails -->

Open `/pond/` to watch the koi pond card (`pond-koi`). Six koi swim across a grid of 36 by 33 dot tiles. Ripples drift across the surface, and the fish turn to chase food or steer clear of the bank.

Each fish moves along a spine of 20 linked nodes. The head does the steering: it wanders, keeps off the bank, gives other fish room, lines up with its neighbors, and goes after food. It also drifts over to a still pointer, and hurries toward a held press. Each node behind it follows, with every joint limited to a small bend. A swim wave runs down the spine from head to tail.

The body is drawn two ways at once. Tiles well inside the body get one coarse lattice-4 dot, sized by how much light that part of the fish catches. Tiles at the edge, such as the snout, fins and tail, get a micro-glyph that matches how the fish covers that tile. The skin patterns are baked once from fractal noise into a lookup table. Red, the board's one accent, marks the kohaku, sanke and showa patches and the tancho crown.

The water runs on a wave equation kept in two height grids. Every frame, each tile adds up its four neighbors, halves the sum, subtracts its own previous height and multiplies by a damping factor of 0.984. The tail of each koi pushes into the water as it swims, which leaves V-shaped wakes.

Tap the pond to drop 5 to 7 food pellets. Nearby koi swim over and eat them, and a koi's head widens by one cell for 0.3 seconds as it eats. Flick your pointer fast across a koi to startle it. It curls 90 to 105 degrees in about 0.13 seconds and bolts. The scare spreads to nearby fish, up to three koi in all.

The pond also follows your local time. It is full night between 21:00 and 05:00, with a two-hour fade on either side. The shore drops one tone darker, the water's twinkle doubles, from 3.5% to 7%, and the moon's reflection shows up as a column of dash glyphs wobbling on the water.

## Joined squares and teletext

<!-- VISUAL: kind=card · what=sq-tetris · notice=square dots joining into solid tetromino blocks -->

Open `/squares/` to see square dots that fuse into solid shapes, as in the Tetris card (`sq-tetris`) and the quad tree portrait (`sq-quads`).

A normal dot matrix leaves gaps between neighboring dots. The squares board draws true squares instead. When two neighboring cells share the same group, tone and dot size, the engine joins them into one block.

Each cell carries a 12-bit join mask: 3 bits for each of its four corners (northwest, northeast, southeast and southwest). The 3 bits name the corner's shape, worked out from the cell's horizontal, vertical and diagonal neighbors on that side: a lone corner, an edge running across or down, a full fill, an inside corner, or a diagonal. Where cells join, the square grows out to close the gutter between them. On this board the outer corners stay sharp, and inside corners can get a small fillet when a card asks for one, as `sq-blob` does.

<!-- VISUAL: kind=card · what=sq-teletext · notice=teletext text and mosaic blocks on a 24 × 16 character page, contiguous banner, separated weather map -->

The squares board also has a teletext card (`sq-teletext`) that recreates a broadcast information page.

The page is 24 columns by 16 rows of character cells, smaller than a real 40 × 24 teletext page, so it fits the card. Each character cell spans 6 by 9 card cells. The card draws letters and mosaic graphics, and each mosaic cell splits into 2 by 3 blocks. The banner uses contiguous mosaics, so blocks fuse across characters. The weather map uses separated mosaics, where the gutter between blocks stays open.

## Physical materials and lighting

<!-- VISUAL: kind=card · what=mat-loom · notice=cloth woven one pick at a time, with highlights on the threads moving as the light moves -->

Open `/materials/` to see physical surfaces drawn in dots: the loom (`mat-loom`), the marble clock (`mat-marble`) and the lens (`mat-lens`).

Each material card builds a height map, either from a distance field (the marble plaque) or from the pattern itself (the loom's weave), then works out surface normals with central differences. Each card has one light. While your pointer hovers a card it acts as a torch; otherwise the light follows your phone's tilt, and failing that the sun for your time of day. Diffuse shading is Lambert. The shine depends on the material: Phong on the marble, a thread sheen (Kajiya and Kay's hair model) on the loom, and Blinn on the pool's glints.

On a one-color display a highlight has to be a bigger dot. On the loom and the marble, a glint is drawn one quantize step above the dot under it. On a phone that reports tilt, tipping it moves the light, and the highlights glide across the cards.

<!-- VISUAL: kind=card · what=mat-marble · notice=the time engraved in stone, one groove wall lit and one dark under the raked light -->

Each material has its own rules.

The loom (`mat-loom`) weaves real patterns (twill, satin, herringbone, basket and plain), one pick at a time, with the draft drawn beside the cloth. The fabric patch (`mat-patch`) is twill with satin stitching. Both shade their threads with the sheen model, so light runs along the thread.

The marble clock (`mat-marble`) cuts the time, hours and minutes, into a marble plaque as a V-shaped groove. The light rakes low across the stone, at 18 degrees or less, so one wall of each groove catches it and the other falls into shadow. The year sits below in Roman numerals, as hairline letters.

The lens (`mat-lens`) and the pool (`mat-pool`) bend light. For the lens, Snell's law is worked out once into a 127-sample table of how far the light shifts across the bezel. Each frame, the lens looks up that shift and reads the clock face behind it from the moved spot, at finer than one cell, while every dot stays on its lattice. The digits behind the glass look magnified and bent. In the pool, the pond's ripple simulation focuses light onto the floor, and the engine splats photons to draw the shifting caustic webs.

## More boards

Newer cards keep adding to these three. The squares board now has aperiodic floors (`sq-hat`, `sq-ammann`), the arctic circle (`sq-arctic`) and a sandpile (`sq-sandpile`), the pond has plankton (`pond-plankton`), and `/scenes/` renders 3D distance fields in dots.
