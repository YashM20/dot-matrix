/**
 * Public changelog shown in the LOG tab. Written for visitors, not contributors —
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
  { phase: '0', title: 'Foundations', status: 'in progress', text: 'Mostly done: deterministic output, lighter rendering and quality tooling. Still to come: a shared type scale, card-quality scoring and faster first paint on the heaviest board.' },
  { phase: '1', title: 'Motion', status: 'in progress', text: 'Boards that enter with dithered reveals, digits that flip and decode, values that spring into place, and a split-flap departures board.' },
  { phase: '2', title: 'Touch', status: 'planned', text: 'Components you can use: knobs, sliders, toggles and lists with press, hover and focus feedback in dots.' },
  { phase: '3', title: 'Depth and light', status: 'planned', text: 'Lit buttons, shadows, parallax and film-poster portraits.' },
]
