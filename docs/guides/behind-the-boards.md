# Behind the boards

<!-- VISUAL: kind=card · what=pond-koi · notice=koi fish swimming through rippling water rendered in dot tiles with red markings -->

Dot/480 contains dozens of live interactive boards. This guide takes you behind three of them: the living koi pond, the joined squares board, and the physical materials board. Each board uses the same engine pipeline: a live continuous field sampled onto a discrete matrix of dots.

## The living koi pond

<!-- VISUAL: kind=card · what=pond-koi · notice=six koi circling a feeding spot while water ripples spread outward from their tails -->

Open `/pond/` to watch the koi pond card (`pond-koi`). Six koi swim across a 36 by 33 grid of dot tiles. Water ripples drift across the surface, and fish turn to chase food pellets or steer clear of the bank.

Each fish moves along a flexible spine of 20 linked nodes. The head calculates steering forces: wandering, avoiding the bank, giving space to other fish, and chasing food pellets. As the head glides forward, each following spine node pulls behind it within set angle limits. A swim wave flexes the spine from head to tail.

The fish body uses two drawing systems at once. The body interior uses coarse lattice-4 dots sized to the width profile of the fish. The snout, fins, and tail use micro-glyph tiles matched to local edge angles. Skin patterns are baked from fractal noise into a lookup table. Signal Red acts as the single accent color on kohaku patches and tancho crowns.

Water ripples run on a two-plane wave equation. Every frame, each tile takes the average height of its four neighbors, subtracts its previous height, and multiplies by a damping factor of 0.984. Koi tail motions act as moving point sources on this ripple grid, creating natural V-shaped wakes.

Tap the pond card to drop 5 to 7 food pellets. Nearby koi spot the food, burst forward with quick head ripples, and gulp the pellets. When a koi eats, its head expands by one cell for 300 milliseconds. Flick your pointer fast across a koi to startle it. The fish curls 90 to 105 degrees in 4 frames, bolts away at high speed, and startles up to 3 nearby companions.

The pond also checks your local time of day. Between 21:00 and 05:00, the scene enters night mode. Shore tiles drop one tone darker, water twinkle doubles from 3.5 to 7 percent, and the moon's reflection shows up as a column of dash glyphs wobbling across the waves.

## Joined squares and teletext

<!-- VISUAL: kind=card · what=sq-tetris · notice=square dots joining seamlessly into solid tetromino blocks on a grid -->

Open `/squares/` to see square dots that fuse into solid shapes. Look at the Tetris card (`sq-tetris`) and the quad tree portrait (`sq-quads`).

A regular dot matrix leaves gaps between neighboring dots. On the squares board, each dot has a squircle exponent of 32 or higher, producing straight edges with tiny corner fillets. When two neighboring cells share the same layer and tone, the engine joins them into a single block.

The engine checks each cell with a 12-bit join mask across 4 quadrants: northwest, northeast, southeast, and southwest. When horizontal or vertical neighbors touch, the cell expands past its normal border and fills the gutter. The outer corners keep their rounded shape, while inner junctions form sharp corners. In `sq-tetris`, falling pieces fuse into solid geometric blocks that stack and clear.

<!-- VISUAL: kind=card · what=sq-teletext · notice=vintage terminal text and separated mosaic blocks on a 24x16 character grid -->

The squares board also hosts the teletext card (`sq-teletext`). This card recreates broadcast information pages.

Teletext uses a fixed grid of 24 rows and 16 columns of character cells. Each character cell spans 6 by 9 card dots. The card draws alphanumeric letters and separated mosaic graphics. Mosaic blocks split each cell into a 2 by 3 grid of small rectangles. In separated mode, gutters stay open between blocks, giving you authentic broadcast terminal graphics down to each individual dot.

## Physical materials and lighting

<!-- VISUAL: kind=card · what=mat-loom · notice=woven fabric pattern with highlights moving across threads under a shifting light source -->

Open `/materials/` to see physical surfaces rendered in dots. Look at the weaving loom (`mat-loom`), the carved marble clock (`mat-marble`), and the magnifying lens (`mat-lens`).

Every material card starts with a signed distance field. The engine converts distance values into a height map, then calculates surface normal vectors using central differences. A single light illuminates the entire board. The engine evaluates Lambertian diffuse reflection for the body and Phong specular reflection for surface shine.

To show glossy highlights on a monochrome display, the engine draws specular glints two quantize steps above the underlying dot tone. If you open the board on a mobile phone with tilt enabled, tipping your device updates the light vector in real time. The highlight glides across every card as your hands tilt the phone.

<!-- VISUAL: kind=card · what=mat-marble · notice=deeply engraved Roman numerals in stone with soft bevel shadows and bright edge glints -->

Different materials use distinct dot rules:

The loom card (`mat-loom`) and fabric patch (`mat-patch`) represent woven cloth. Thread interlacing is simulated using a 4 by 4 Bayer dither pattern between neighboring dot sizes. This dither creates an alternating diagonal weave texture using pure math.

The marble clock (`mat-marble`) simulates stone carving. Roman numerals are cut into a stone height map with a negative distance profile. Inset bevels create realistic cast shadows along top edges and bright highlight dots along bottom lips, giving the letters carved depth.

The glass lens (`mat-lens`) and pool (`mat-pool`) simulate optical refraction. The engine evaluates Snell's law using a precalculated trigonometric lookup table. When light passes through the curved glass lens, the engine offsets background cell lookups by the surface normal in whole cell increments. The dial digits behind the lens appear magnified and distorted. In the caustic pool card (`mat-pool`), water waves focus light rays onto the floor tiles below, creating shifting caustic webs through fast photon splatting.
