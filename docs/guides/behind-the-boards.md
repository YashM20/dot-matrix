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

<!-- VISUAL: kind=card · what=mat-denim · notice=denim twill whose highlights run along the threads as the light moves -->

Open `/workshop/` to see physical surfaces drawn in dots: denim (`mat-denim`), the time carved in wood (`mat-wood`) and a pool of mercury (`mat-mercury`).

Each material card builds a height map, either from a distance field (the carved digits) or from the pattern itself (the denim's twill), then works out surface normals with central differences. Each card has one light. While your pointer hovers a card it acts as a torch; otherwise the light follows your phone's tilt, and failing that the sun for your time of day. Diffuse shading is Lambert. The shine depends on the material: Phong on the wood's lacquer, a thread sheen (Kajiya and Kay's hair model) on the denim and along the wood's rings, and a matcap on the mercury.

On a one-color display a highlight has to be a bigger dot. On a phone that reports tilt, tipping it moves the light, and the highlights glide across the cards.

<!-- VISUAL: kind=card · what=mat-wood · notice=the time carved in a lacquered board, one groove wall lit and one dark under the raked light -->

Each material has its own rules.

The denim (`mat-denim`) is a 3/1 twill, with the warp on the face and the white weft behind it. Its threads are shaded with the sheen model, so light runs along the thread.

The wood (`mat-wood`) cuts the time into the board as a groove. The light rakes low across it, so one wall of each groove catches it and the other falls into shadow. The mercury (`mat-mercury`) is a simulated liquid: its density becomes a height, read through a matcap, so the pool looks like curved metal. Stir it, tip the phone to pour it, or tap to split off a bead.

## More boards

Newer cards keep adding to these three. The squares board now has aperiodic floors (`sq-hat`, `sq-ammann`), the arctic circle (`sq-arctic`) and a sandpile (`sq-sandpile`), the pond has plankton (`pond-plankton`), and `/scenes/` renders 3D distance fields in dots.
