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
    version: '0.11', date: '2026-10-26', title: 'Explore, make, about',
    summary: 'Seven tabs became three, every card can explain itself, and the display types live in one menu.',
    changes: [
      { kind: 'new', text: 'Three places: EXPLORE (the boards), MAKE (tune, compose, code and draw in one spot) and ABOUT (what this is, shortcuts, link options and this log). Every old link still opens the same thing.' },
      { kind: 'new', text: 'Hover or focus a card (or tap ⋯ on a phone) for four actions: ⓘ how it works, REMIX, LINK and PNG.' },
      { kind: 'new', text: 'Cards you can touch say how in grey at the top: DRAG, TAP, HOLD, SCRATCH, CAMERA or SOUND.' },
      { kind: 'new', text: 'The X-ray opens on a plain-words SUMMARY, with tap-to-read definitions for field, lattice, site, tone, quantize and IR. On a phone it is a bottom sheet.' },
      { kind: 'improved', text: 'One DISPLAY menu replaces the row of seven display buttons, with a line on what each one looks like. Every target is big enough to tap.' },
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
    link: { href: '/essay.html', label: 'READ THE ESSAY' },
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
