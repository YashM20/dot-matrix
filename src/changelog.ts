/**
 * Public changelog shown in ABOUT (once the LOG tab). Written for visitors, not contributors —
 * the engineering history lives in CHANGELOG.md at the repo root.
 */
export type ChangeKind = 'new' | 'improved' | 'fixed'
export interface Release {
  version: string
  date: string
  title: string
  summary: string
  changes: { kind: ChangeKind; text: string }[]
  link?: { href: string; label: string }
}
export interface Upcoming { phase: string; title: string; text: string; status: 'in progress' | 'next' | 'planned' }

export const releases: Release[] = [
  {
    version: '0.16', date: '2026-11-04', title: 'Safer, easier to find, and a shell that helps',
    summary: 'A security pass over every page, pages that search engines can read, analytics that ask first, and a command shell that completes what you type.',
    changes: [
      { kind: 'new', text: 'Search engines can read every board, card and post: each page has its own title and a short text, and a missing page shows a dot 404.' },
      { kind: 'new', text: 'Analytics are opt-in. Nothing loads until you press Allow, and Global Privacy Control or Do Not Track keeps them off.' },
      { kind: 'new', text: 'The >_ shell completes commands with Tab, lists them with help, and suggests the command you meant after a typo.' },
      { kind: 'new', text: 'The site has a name, MATRIX, and its code is MIT licensed.' },
      { kind: 'improved', text: 'Card programs run under a time limit, so a slow one pauses instead of freezing the page.' },
      { kind: 'improved', text: 'Stricter security headers on every page, and links and saved themes are checked before the site uses them.' },
      { kind: 'improved', text: 'X-ray is off for now.' },
    ],
  },
  {
    version: '0.15', date: '2026-11-04', title: 'Dash, faces, type and watches',
    summary: 'Six new boards (a car dash, lit faces, kinetic type, micro motion, dot charts and watch faces), plus fractals, 3D scenes and new cards on squares, pond and workshop.',
    changes: [
      { kind: 'new', text: 'CAR: nine dash and EV cards driven by one 30 second lap, until you turn a control yourself.' },
      { kind: 'new', text: 'FACES: four lit halftone heads whose eyes follow your pointer.' },
      { kind: 'new', text: 'KINETIC: seven effects on one shared word. Change the word on the flap card and the link keeps it.' },
      { kind: 'new', text: 'MOTION: eleven looping loaders, toasts and replies. Tap one to play it again.' },
      { kind: 'new', text: 'CHARTS: seven dot charts that grow in, morph between datasets and read out the point nearest your pointer.' },
      { kind: 'new', text: 'WATCH: eight smartwatch faces, with the moon phase and sun times worked out on your device.' },
      { kind: 'new', text: 'OLDSCHOOL demo effects, FRACTALS, and SCENES: 3D shapes traced into dots.' },
      { kind: 'new', text: 'New cards: aperiodic hat and Ammann floors, a sandpile and ASCII art on squares, plankton and Turing skin in the pond, and lightning, erosion, frost, kintsugi, mud and folded paper in the workshop.' },
      { kind: 'improved', text: 'CONTRAST: MORE in THEME raises text and line contrast, and a custom theme can be shared as a link.' },
      { kind: 'fixed', text: 'The desktop header hides as you scroll down, and the footer no longer spills past the page on narrow screens.' },
    ],
  },
  {
    version: '0.14', date: '2026-11-03', title: 'A blog, and steadier boards',
    summary: 'A blog with the dot-matrix essay and three deep dives, credits for the work cards build on, and fixes for the pond and for wide layouts.',
    changes: [
      { kind: 'new', text: 'BLOG: the essay on how the engine works and three deep dives, with pictures drawn by the engine. Old essay links still work.' },
      { kind: 'new', text: 'A card built on someone else’s work names them on its page.' },
      { kind: 'improved', text: 'New engine shapes, smooth blends and easing curves, drawn crisp on coarse grids.' },
      { kind: 'improved', text: 'Workshop cards draw their first frame sooner.' },
      { kind: 'fixed', text: 'Koi no longer snap back to their loop after you feed them.' },
      { kind: 'fixed', text: 'Scrollbars no longer push bars and figures past the edge of the page.' },
    ],
    link: { href: '/blog/', label: 'READ THE BLOG' },
  },
  {
    version: '0.13', date: '2026-11-01', title: 'A workshop, glass and a pond with a memory',
    summary: 'A Workshop board of nine materials, glass and water on the materials board, more squares, a pond that reacts and remembers, sharing and phone editing in MAKE, fourteen themes, and a faster first load.',
    changes: [
      { kind: 'new', text: 'Workshop board: knitting, denim, paper, wood, leather, a sand tray you can rake, frost on a window, a pool of mercury and a hanging thread, all lit by the same light.' },
      { kind: 'new', text: 'Glass and water on the materials board: a lens over a clock, a pool you can drip into, a lancet window, rust that ages as you watch, a patch whose light you turn, and a candle clock.' },
      { kind: 'new', text: 'More squares: rectangular cells, teletext screens, LCD skins, square field patterns, dots turned 45 degrees, bead, stud and stitch motifs, and dots that morph into squares.' },
      { kind: 'new', text: 'The pond reacts: koi get hungry and ignore food once full, a startled koi startles its neighbours, night darkens the water, and the koi can be drawn in letters (TYPE, top right).' },
      { kind: 'new', text: 'A pond with a memory: a marbled-ink pond the koi comb as they swim, a pond that changes with the day, and with POND MEMORY on, one that grows with your visits.' },
      { kind: 'new', text: 'Share from MAKE: send a frame or a whole document as a link that carries the design, see where a remix came from, and export a PNG for every device.' },
      { kind: 'new', text: 'Fourteen themes: seven accent colours in light and dark, a THEME picker with live previews, and an eighth swatch that builds a readable theme from any hue.' },
      { kind: 'new', text: 'Your photo in dots: drop, paste or pick an image on the home card and it turns into a live halftone. It stays on your device.' },
      { kind: 'new', text: 'Tilt your phone: tap TILT in TOOLS and the physics cards and the pond follow how you hold it.' },
      { kind: 'improved', text: 'MAKE on a phone: a long-press menu, a snap cue, sheets that remember their height, a side sheet in landscape, room for the keyboard, and the phone’s own share sheet.' },
      { kind: 'improved', text: 'Select many in MAKE: drag a box, group, lock, align and distribute, and copy and paste across tabs.' },
      { kind: 'improved', text: 'Cards open into their own page with a short glide, and every text passes 4.5:1 contrast in every theme.' },
      { kind: 'improved', text: 'A smaller first visit: about 124 kB of code, down from 148 kB.' },
    ],
  },
  {
    version: '0.12', date: '2026-10-30', title: 'Materials, pond and squares',
    summary: 'Three new boards (materials, a living koi pond, and joined square dots), plus on-canvas editing in MAKE, big card grids with selectable sizes, and faster background card loading.',
    changes: [
      { kind: 'new', text: 'Materials board: a loom weaving cloth, a metal knob, a speaker grille, a clock carved in marble and a month of terrazzo chips, all made of dots and lit by one light. With TILT on, tipping your phone moves the light.' },
      { kind: 'new', text: 'Pond board: koi swim through rippling water drawn in tiny dot tiles. Tap or click to drop food, hold to lure them; leave it alone and the pond settles back into its loop.' },
      { kind: 'new', text: 'Squares board: Tetris pieces that fuse into blocks, a face built from 1,201 squares, blobs that merge in stepped terraces and a four-shade pocket-console clock.' },
      { kind: 'new', text: 'Edit right on the canvas: in MAKE, drag handles to resize rings, discs, lines and fields, type text straight onto a frame in its own dots, change tone and dot size from a small bar over the selection, and pick a colour from the canvas with the eyedropper.' },
      { kind: 'improved', text: '3 big cards a row again, plus a CARD SIZE option (large / medium / compact).' },
      { kind: 'improved', text: 'Cards start sooner: the background helper that draws the animated cards now loads only the board you are looking at (17 kB to start instead of 178 kB), and materials cold bakes are 2–4× faster.' },
      { kind: 'improved', text: 'The essay and the privacy and terms pages follow your light or dark theme and accent, with no flash on load, and the X-ray guides take the theme too.' },
      { kind: 'fixed', text: 'The desktop editor re-measures its height when the site bar grows after mount, keeping it within the window.' },
    ],
  },
  {
    version: '0.11', date: '2026-10-26', title: 'Explore, make, about',
    summary: 'Seven tabs became three, every card can explain itself, the makers start simple, and the display types live in one menu.',
    changes: [
      { kind: 'new', text: 'Three places: EXPLORE (the boards), MAKE (tune, compose, code and draw in one spot) and ABOUT (what this is, shortcuts, link options and this log). Every old link still opens the same thing.' },
      { kind: 'new', text: 'Hover or focus a card (or tap ⋯ on a phone) for four actions: ⓘ how it works, REMIX, LINK and PNG.' },
      { kind: 'new', text: 'Cards you can touch say how in grey at the top: DRAG, TAP, HOLD, SCRATCH, CAMERA or SOUND.' },
      { kind: 'new', text: 'The X-ray opens on a plain-words SUMMARY, with tap-to-read definitions for field, lattice, site, tone, quantize and IR. On a phone it is a bottom sheet.' },
      { kind: 'improved', text: 'One DISPLAY menu replaces the row of seven display buttons, with a line on what each one looks like. Every target is big enough to tap.' },
      { kind: 'improved', text: 'The four makers start simple: the main controls show, and everything else waits in named MORE sections that remember how you left them. Add ?pro=1 to open them all.' },
      { kind: 'improved', text: 'On a phone the makers are one column with the canvas pinned at the top.' },
    ],
  },
  {
    version: '0.10', date: '2026-10-24', title: 'Easier to find your way',
    summary: 'The boards are grouped and named in plain words, each one says what it is, and the site loads faster.',
    changes: [
      { kind: 'new', text: 'START HERE: a short tour of the best boards. The rest sit in four groups: Interfaces, Data, Play and Engine.' },
      { kind: 'new', text: 'Every board has a one-line description under its title, and first-time visitors get a short note on what this is and what to try.' },
      { kind: 'improved', text: 'Back and Forward now move between boards and views, and every view has its own link.' },
      { kind: 'improved', text: 'On a phone, one board menu replaces five rows of buttons, and every tab (including DRAW) is reachable.' },
      { kind: 'improved', text: 'The first visit loads about 6 kB less: the synth only loads with the Instrument and Scope boards.' },
      { kind: 'fixed', text: 'The ⌘K palette and the dot shell list the real display types (CRT, VFD, LED, e-ink, flip-disc, Nixie).' },
    ],
  },
  {
    version: '0.9', date: '2026-10-23', title: 'Ditherpunk for UI: the tour',
    summary: 'A long, hands-on walk through how the dots are made, with the real engine running in every figure.',
    changes: [
      { kind: 'new', text: 'Fourteen short chapters, from "why dots" to light, sand, halftone, five display types and an agent heartbeat. Each one has something to drag, toggle or edit.' },
      { kind: 'new', text: 'Scratch a halftone portrait and watch it heal, carry a torch down a dark corridor, and watch an hourglass clock pour the time into place.' },
      { kind: 'new', text: 'Edit a tiny dot program right in the page, then open it in DOTS to keep going.' },
      { kind: 'improved', text: 'Figures load only when you scroll to them, and show still frames if you prefer reduced motion.' },
    ],
    link: { href: '/blog/dot-matrix-essay/', label: 'READ THE ESSAY' },
  },
  {
    version: '0.8', date: '2026-10-23', title: 'Dot Studio: build your own card',
    summary: 'A new STUDIO tab: stack layers of dot fields and text, give them states and transitions, and watch them play.',
    changes: [
      { kind: 'new', text: 'Layers you can stack, hide, reorder by dragging, tint and blend. Write a field as a few lines of maths, add hero text or rings of dots.' },
      { kind: 'new', text: 'A timeline: scrub through how the card builds in, changes and leaves, and pick the dissolve pattern and easing for each, drawn in dots.' },
      { kind: 'new', text: 'States: name a few sets of values, connect them, then click an arrow (or press the card) to watch it dissolve from one to the other.' },
      { kind: 'new', text: 'Open any card from the boards and take it apart layer by layer, or pull in a program from the DOTS tab.' },
      { kind: 'new', text: 'A side-by-side sheet against the favourite cards, a quality scorecard, previews on a tiny LED matrix, e-ink, flip-disc and pen plotter, and exports to PNG, SVG, animated PNG, GIF and video.' },
      { kind: 'improved', text: 'Everything saves in your browser, with undo and redo, and can be downloaded as a file.' },
    ],
    link: { href: '?make=compose', label: 'OPEN MAKE · COMPOSE' },
  },
  {
    version: '0.7', date: '2026-10-23', title: 'DOTS: write a field, share it as a link',
    summary: 'A new DOTS tab where you write a few lines of maths and watch them run as a dot display, then share them as a short link.',
    changes: [
      { kind: 'new', text: 'A live editor for tiny dot programs. Type, and the card redraws as you go. Mistakes are marked at their exact line and column.' },
      { kind: 'new', text: 'Scrub through time, pause on any frame, set the loop length, and pick the grid, dot size and tone. Every data value you use gets its own slider, and the pointer is an input too.' },
      { kind: 'new', text: 'Share: a program fits in a short, compressed link. Opening a broken or tampered link shows what is wrong and never runs it.' },
      { kind: 'new', text: 'Remix: every edit remembers what it came from. Your programs build a small remix graph, drawn in dots, starting from eight examples: ripple, plasma, rings, spiral, rain, lissajous, checker warp and heartbeat.' },
    ],
    link: { href: '?make=code', label: 'OPEN MAKE · CODE' },
  },
  {
    version: '0.6', date: '2026-10-22', title: 'Departures, and boards that leave',
    summary: 'A new flagship board where every change is mechanical, and smooth handovers between boards.',
    changes: [
      { kind: 'new', text: 'Departures board: a live transit board. Split-flap rows cascade when a train leaves, a Swiss station clock sweeps and pauses at 12, and a train glides along its line.' },
      { kind: 'new', text: 'The home clock flips its digits on the minute, like a split-flap clock, folding about the middle.' },
      { kind: 'new', text: 'Switching boards or views now dissolves the old cards out, corner to corner, before the new ones build in.' },
    ],
    link: { href: '/departures/', label: 'OPEN DEPARTURES' },
  },
  {
    version: '0.5', date: '2026-10-14', title: 'Boards that come alive',
    summary: 'The first motion work: boards build themselves in, dot by dot, and every change dissolves instead of cutting. Under the hood, everything got lighter and steadier.',
    changes: [
      { kind: 'new', text: 'Boards enter with a staggered dithered reveal. Each card lights up dot by dot, corner to corner.' },
      { kind: 'new', text: 'Changes dissolve: move a slider in the playground, or let the clock tick over, and the old frame gives way to the new one in dithered order.' },
      { kind: 'improved', text: 'All animated cards now share one clock and stay in sync, picking up where they left off when you scroll back.' },
      { kind: 'improved', text: 'Pages are much lighter. Boards render about four times smaller as SVG, and canvas cards draw in a handful of passes instead of thousands.' },
      { kind: 'improved', text: 'Textures and noise now use integer maths, so every card comes out exactly the same on every run.' },
      { kind: 'improved', text: 'Draw: width and height apply when you finish typing, resizing can be undone, the canvas is sharp on high-DPI screens, and the keyboard shortcuts work.' },
      { kind: 'fixed', text: 'A card that fails to draw no longer takes the whole board down.' },
    ],
  },
  {
    version: '0.4', date: '2026-10-14', title: 'Motion lab and the roadmap',
    summary: 'A first live look at where Dot/480 is heading: dots that move with intent, react to your touch, and catch the light.',
    changes: [
      { kind: 'new', text: 'Motion lab: four live experiments. Dithered transitions, digits that decode, a dot list that magnifies under your cursor and ripples when you click, and a lit 3D button you can shine a torch on.' },
      { kind: 'new', text: 'Published the roadmap: motion, touch, depth and light, then every dot display from phones to LED walls.' },
      { kind: 'new', text: 'This changelog.' },
    ],
    link: { href: '/lab/motion-lab.html', label: 'OPEN THE MOTION LAB' },
  },
  {
    version: '0.3', date: '2026-10-13', title: 'Every board rebuilt to the new standard',
    summary: 'All 71 cards redrawn on one 144×144 dot tile, matched against the reference designs.',
    changes: [
      { kind: 'new', text: 'Components board: toggle, pill, slider, icon button and status dot, all drawn in dots.' },
      { kind: 'improved', text: 'Big numerals and icons now use bigger dots instead of clusters of small ones, so they read like a real dot display.' },
      { kind: 'improved', text: 'Card labels are drawn in dots inside the tile, like the reference boards.' },
      { kind: 'improved', text: 'Photographic cards (the mosaic board, level 03, afterlight) with continuous tone and depth.' },
      { kind: 'improved', text: 'Animations pause when a card is off-screen or the tab is hidden, and respect reduced-motion settings.' },
      { kind: 'improved', text: 'Sharp on high-DPI screens; boards reflow from three columns to two to one on smaller screens.' },
    ],
  },
  {
    version: '0.2', date: '2026-08-24', title: 'Draw and gallery',
    summary: 'Sketch in dots, and browse the cards.',
    changes: [
      { kind: 'new', text: 'Draw: paint on a dot grid over a reference image and export the result.' },
      { kind: 'new', text: 'Gallery view of the core cards.' },
      { kind: 'new', text: 'Playground data sliders: change a card’s numbers and watch it redraw.' },
    ],
  },
  {
    version: '0.1', date: '2026-08-22', title: 'First light',
    summary: 'The Dot/480 engine: every visual is a field, sampled onto a dot grid and rendered as squircle dots on OLED black.',
    changes: [
      { kind: 'new', text: 'The engine: fields for text, icons, rings, charts, waveforms, halftone photos and 3D projections.' },
      { kind: 'new', text: 'Playground: tune dot pitch, roundness, size and theme live; export SVG or PNG.' },
      { kind: 'new', text: 'The first set of widget cards: clock, timer, weather, fitness rings, music, messages and more.' },
    ],
  },
]

export const upcoming: Upcoming[] = [
  { phase: 'U5', title: 'Everything for power users', status: 'next', text: 'A ? sheet with every shortcut and link option, and a pro mode that opens every panel.' },
  { phase: 'S1', title: 'A page for every card', status: 'planned', text: 'Each card gets its own short link (/widget/<id>/) and page, with copy as PNG, SVG or HTML, share and embed.' },
  { phase: 'C1', title: 'A million dots', status: 'planned', text: 'Fields evaluated on the GPU with WebGPU: a full-screen field that follows the cursor, and a zoom from one card into a million dots.' },
]
