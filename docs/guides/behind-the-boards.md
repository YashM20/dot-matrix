# Behind the boards

<!-- VISUAL: kind=card · what=pond-koi · notice=koi fish swimming through rippling water rendered in dot tiles with red markings -->

Dot/480 contains dozens of live interactive boards. This guide takes you behind three of them: the living koi pond, the joined squares board, and the physical materials board. Each board uses the same engine pipeline: a live continuous field sampled onto a discrete matrix of dots.

## The living koi pond

<!-- VISUAL: kind=card · what=pond-koi · notice=six koi circling a feeding spot while water ripples spread outward from their tails -->

Visit `/pond/` to watch the koi pond card (`pond-koi`). Six koi swim across a 36 by 33 grid of dot tiles. Water ripples drift across the surface, and fish turn to follow food pellets or avoid the bank.

Each fish moves along a flexible spine made of 20 connected nodes. The fish head navigates using steering forces: wandering, swimming away from walls, keeping distance from other fish, and swimming toward food pellets. As the head glides forward, each subsequent spine node pulls along behind it, constrained by strict angular joint limits. A traveling swim wave flexes the spine from head to tail.

The fish body uses a dual drawing method. The interior tiles use coarse lattice-4 dots sized according to body thickness. The edges, snout, fins, and tail use micro-glyph tiles matched to local boundary angles. Skin markings are baked once from fractal noise into a coordinate table. Signal Red serves as the single accent color, highlighting kohaku patches and tancho crowns.

Water ripples run on a two-plane discrete wave equation. Every time step, the height of each tile updates from its four cardinal neighbors minus its previous height, multiplied by a damping factor of 0.984. Koi tail motions act as moving impulse points on this ripple grid, automatically producing natural V-shaped wakes.

Tap the pond card to drop 5 to 7 food pellets. Nearby koi spot the food, burst forward with quick head ripples, and gulp the pellets. When a koi eats, its head expands by one cell for 300 milliseconds. If you flick your pointer quickly across a koi, the fish triggers a rapid C-start escape maneuver. The startled fish curls 90 to 105 degrees in 4 frames, darting away at high speed and startling up to 3 nearby companions.

The pond also tracks your local time of day. Between 21:00 and 05:00, the scene enters night mode. Shore tiles drop one tone darker, water twinkle doubles from 3.5 to 7 percent, and the moon's reflection appears as a broken column of dash glyphs undulating with the water surface.

## Joined squares and teletext

<!-- VISUAL: kind=card · what=sq-tetris · notice=square dots joining seamlessly into solid tetromino blocks on a grid -->

Open `/squares/` to see square dots that fuse together into solid geometry. Look at the Tetris card (`sq-tetris`) and the quad tree portrait (`sq-quads`).

A standard dot matrix keeps empty space between neighboring dots. On the squares board, each dot has a squircle exponent of 32 or higher, producing straight edges with tiny corner fillets. When two neighboring cells share the same layer and tone, the engine joins them.

The engine evaluates each cell using a 12-bit join mask. It checks 8 neighbors across 4 quadrants: northwest, northeast, southeast, and southwest. When horizontal or vertical neighbors exist, the drawn cell expands past its normal boundary, eliminating the cell gutter. The outer corners remain rounded, while inner junctions form clean right-angle corners. In `sq-tetris`, falling pieces fuse into solid geometric tetrominoes that stack neatly and dissolve when full rows clear.

<!-- VISUAL: kind=card · what=sq-teletext · notice=vintage terminal text and separated mosaic blocks on a 24x16 character grid -->

The squares board also hosts the teletext card (`sq-teletext`). This card recreates classic European broadcast information pages.

Teletext uses a fixed grid of 24 rows and 16 columns of character cells. Each character cell spans 6 by 9 card dots. The card renders authentic alphanumeric glyphs and separated mosaic graphics. Mosaic blocks split each cell into a 2 by 3 matrix of sub-rectangles. In separated mode, gutters remain open between blocks, recreating the broadcast terminal look down to the exact dot positions.

## Physical materials and lighting

<!-- VISUAL: kind=card · what=mat-loom · notice=woven fabric pattern with highlights moving across threads under a shifting light source -->

Open `/materials/` to see physical surfaces rendered in dots. Look at the weaving loom (`mat-loom`), the carved marble clock (`mat-marble`), and the magnifying lens (`mat-lens`).

Every material card begins with a signed distance field. The engine converts distance values into a height raster, then calculates surface normal vectors using central differences. A single directional light illuminates every card on the board. The engine evaluates Lambertian diffuse reflection for the body surface and Phong specular reflection for surface shine.

To show glossy highlights on a monochrome display, the engine draws specular glints two quantize steps above the underlying dot tone. If you open the board on a mobile phone with tilt enabled, tipping your device updates the light vector in real time. The highlight glides across every card in synchronization with your hand movement.

<!-- VISUAL: kind=card · what=mat-marble · notice=deeply engraved Roman numerals in stone with soft bevel shadows and bright edge glints -->

Different materials apply specific dot layout rules:

The loom card (`mat-loom`) and fabric patch (`mat-patch`) represent woven cloth. Thread interlacing is simulated using a 4 by 4 Bayer dither pattern between neighboring dot sizes. This dither creates an alternating diagonal weave texture without requiring manual pixel art.

The marble clock (`mat-marble`) simulates stone carving. Roman numerals are cut into a stone height map with a negative distance profile. Inset bevels create realistic cast shadows along top edges and bright highlight dots along bottom lips, giving the letters carved depth.

The glass lens (`mat-lens`) and pool (`mat-pool`) simulate optical refraction. The engine evaluates Snell's law using a precalculated trigonometric lookup table. When light passes through the curved glass lens, the engine offsets background cell lookups by the surface normal in whole cell increments. The dial digits behind the lens appear magnified and distorted. In the caustic pool card (`mat-pool`), water waves focus light rays onto the floor tiles below, creating shifting caustic webs through fast photon splatting.
