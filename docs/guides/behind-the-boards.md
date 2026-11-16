# Behind the boards

<!-- VISUAL: kind=card · what=pond-koi · notice=koi swimming through rippling water drawn in dot tiles, with red markings -->

The site has more than thirty live boards. This guide goes behind three of them: the koi pond, the joined squares and the workshop's materials. They all use the same pipeline as every other card: a continuous field, sampled onto a fixed grid of dots.

## The living koi pond

<!-- VISUAL: kind=card · what=pond-koi · notice=six koi circling a feeding spot while ripples spread from their tails -->

Open `/pond/` to watch the koi pond card (`pond-koi`). Six koi swim across a grid of 36 by 33 dot tiles. Ripples drift across the surface, and the fish turn to chase food or steer clear of the bank.

Each fish moves along a spine of 20 linked nodes. The head does the steering: it wanders, keeps off the bank, gives other fish room, lines up with its neighbors, and goes after food. It also drifts over to a still pointer, and hurries toward a held press. Each node behind it follows, with every joint limited to a small bend. A swim wave runs down the spine from head to tail.

The body is drawn two ways at once. Tiles well inside the body get one coarse lattice-4 dot, sized by how much light that part of the fish catches. Tiles at the edge, such as the snout, fins and tail, get a micro-glyph that matches how the fish covers that tile. The skin patterns are baked once from fractal noise into a lookup table. Red, the board's one accent, marks the kohaku, sanke and showa patches and the tancho crown.

The water runs on a wave equation kept in two height grids. Every frame, each tile adds up its four neighbors, halves the sum, subtracts its own previous height and multiplies by a damping factor of 0.984. The tail of each koi pushes into the water as it swims, which leaves V-shaped wakes.

Tap the pond to drop 5 to 7 food pellets. Nearby koi swim over and eat them, and a koi's head widens by one cell for 0.3 seconds as it eats. Flick your pointer fast across a koi to startle it. It curls 90 to 105 degrees in about 0.13 seconds and bolts. The scare spreads to nearby fish, up to three koi in all.

The pond also follows your local time. It is full night between 21:00 and 05:00, with a two-hour fade on either side. The shore drops one tone darker, the water's twinkle doubles, from 3.5% to 7%, and the moon's reflection shows up as a column of dash glyphs wobbling on the water.

## Joined squares and teletext

<!-- VISUAL: kind=card · what=sq-stack · notice=square dots joining into solid tetromino blocks -->

Open `/squares/` to see square dots that fuse into solid shapes, as in the Stack card (`sq-stack`) and the quad tree portrait (`sq-quads`).

A normal dot matrix leaves gaps between neighboring dots. The squares board draws true squares instead. When two neighboring cells share the same group, tone and dot size, the engine joins them into one block.

Each cell carries a 12-bit join mask: 3 bits for each of its four corners (northwest, northeast, southeast and southwest). The 3 bits name the corner's shape, worked out from the cell's horizontal, vertical and diagonal neighbors on that side: a lone corner, an edge running across or down, a full fill, an inside corner, or a diagonal. Where cells join, the square grows out to close the gutter between them. On this board the outer corners stay sharp, and inside corners can get a small fillet when a card asks for one, as `sq-blob` does.

<!-- VISUAL: kind=card · what=sq-teletext · notice=teletext text and mosaic blocks on a 24 × 16 character page, contiguous banner, separated weather map -->

The squares board also has a teletext card (`sq-teletext`) that recreates a broadcast information page.

The page is 24 columns by 16 rows of character cells, smaller than a real 40 × 24 teletext page, so it fits the card. Each character cell spans 6 by 9 card cells. The card draws letters and mosaic graphics, and each mosaic cell splits into 2 by 3 blocks. The banner uses contiguous mosaics, so blocks fuse across characters. The weather map uses separated mosaics, where the gutter between blocks stays open.

## Physical materials and lighting

<!-- VISUAL: kind=card · what=mat-kintsugi · notice=a glazed plate that breaks where you tap it and mends one seam at a time -->

Open `/workshop/` to see four materials drawn in dots: a frost window (`mat-frost`), a frost fern on ice (`mat-ice`), a kintsugi plate (`mat-kintsugi`) and a paper fold (`mat-fold`).

Each card has one light. While your pointer hovers a card it acts as a torch; otherwise the light follows your phone's tilt, and failing that the sun for your time of day. The kintsugi plate builds a height map of its glaze and shards, works out surface normals with central differences, and shades them with Lambert for the body and Phong for the shine. The paper fold lights each facet by the way it faces the light, so the back of the sheet sits one band darker.

On a one-color display a highlight has to be a bigger dot. On a phone that reports tilt, tipping it moves the light, and the highlights glide across the cards.

<!-- VISUAL: kind=card · what=mat-frost · notice=one snowflake a day, its rim brightest on the side that faces the light -->

Each material has its own rules.

The frost window (`mat-frost`) grows one snowflake a day on a hex lattice. The rim cells that face the light are the brightest, and the cells freezing right now are red. The frost fern (`mat-ice`) grows one grain at a time, and a grain catches a glint when its branch runs across the light. Hover or tap to breathe on it: the frost melts round that spot, then freezes back.

The kintsugi plate (`mat-kintsugi`) breaks where you tap it. Its cracks fill one seam at a time, and the seam filling now is red.

## More boards

Newer cards keep adding to these three. The squares board now has aperiodic floors (`sq-hat`, `sq-ammann`), the arctic circle (`sq-arctic`) and a sandpile (`sq-sandpile`), the pond has plankton (`pond-plankton`), and `/scenes/` renders 3D distance fields in dots.
