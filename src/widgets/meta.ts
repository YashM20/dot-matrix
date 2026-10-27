/**
 * Metadata for every widget (docs/SHARE-PLAN.md §3), in two layers so nothing is typed twice or drifts:
 * - **authored** (`cardBlurbs` below): one plain line and a few topic tags per card, keyed by slug;
 * - **derived** (`deriveWidgetMeta`): read off the preset itself (grid, animation, controls, layers, dots,
 *   renderer) plus its uid (`src/widgets/ids.json`), board and golden hash.
 * Pure and DOM-free: the widget page derives one card in the browser, `scripts/widgets/meta.ts` derives all
 * of them at build time (`dist/widgets.json`, the prebuilt `/widget/<slug>/` pages). Its own chunk: the first
 * load never pulls it in. `scripts/verify.ts` checks every widget has a blurb and derives cleanly.
 *
 * Adding a card: add `'<slug>': ['<one line>', '<tag> <tag>']` to `cardBlurbs` (tags space-separated, lowercase).
 */
import type { Control, ThemeTokens } from '../engine'
import { sampleLayers } from '../engine/sampler/gridSampler'
import { hasGPULayers } from '../engine/renderer/webgl'
import { withChrome, type WidgetPreset } from './types'
import { shortPath, widgetPath } from '../site/routes'

/** Everything known about one widget. `scope` is '' for the site's own widgets (orgs / workspaces later). */
export interface WidgetMeta {
  uid: string
  slug: string
  scope: string
  /** Display name (`preset.name`) and the label drawn on the card, when it says something else. */
  name: string
  label?: string
  /** The board it lives on (the first, if several), and every board that shows it. */
  board: string
  boards: string[]
  /** The preset's drawing family (`text`, `polar`, `chart`, …). */
  group: WidgetPreset['group']
  blurb: string
  tags: string[]
  /** Search words: the tags, plus words drawn on the card. */
  keywords: string[]
  /** Canonical path (`/widget/<slug>/`) and short link (`/<uid>`). */
  url: string
  short: string
  grid: { cols: number; rows: number; pitch: number }
  animated: boolean
  /** Reads the wall clock (re-sampled each minute). */
  clock: boolean
  live: boolean
  interactive: boolean
  /** Control kinds, each once (`slider`, `toggle`, …). */
  controls: Control['kind'][]
  /** What a visitor does to it (the card strip's grey verb): TAP, DRAG, HOLD, SCRATCH, SOUND, CAMERA. */
  hint?: string
  /** Live media the card can ask for. */
  media?: 'camera' | 'mic'
  /** Visible dots in the default frame (t = 0, defaults). */
  dots: number
  /** Layers in the default frame, and their kinds (`text`, `ir`, a layout generator, `lattice`, `sites`, `gpu`, `field`). */
  layerCount: number
  layers: string[]
  /** Some layer is a Field IR program. */
  ir: boolean
  /** The renderer the app picks for it (DotCanvas rule: GPU layers → webgl; animated or > 2000 dots → canvas; else svg). */
  renderer: 'svg' | 'canvas' | 'webgl'
  /** Its golden hash at t = 0 (`goldens/hashes.json`): changes exactly when its pixels do. */
  version?: string
  /** Old slugs that still open it (`cardAliases`). */
  aliases: string[]
}

/** The card strip's hint verb (same rule as `DotWidget`): what a visitor can do to the card, read off its controls. */
export function hintVerb(p: Pick<WidgetPreset, 'media'>, cs: readonly Control[]): string {
  const has = (re: RegExp) => cs.some(c => re.test(c.key) || re.test(c.label))
  return p.media === 'camera' || has(/^(cam|hand)$|camera/i) ? 'CAMERA' : has(/scratch/i) ? 'SCRATCH' : has(/^hold/i) ? 'HOLD'
    : has(/^(mic|sound|audio)$/i) ? 'SOUND' : cs.some(c => /slider|knob|crank|xy/.test(c.kind)) || has(/^(grab|stir|throw|drag)/i) ? 'DRAG' : 'TAP'
}

export interface WidgetFacts { uid: string; board: string; boards?: string[]; version?: string; aliases?: string[]; scope?: string }

const layerKind = (l: ReturnType<WidgetPreset['layers']>[number]): string => {
  const f = l.field as typeof l.field & { gpu?: unknown }, from = f.from
  return f.gpu ? 'gpu' : from && 'ir' in from ? 'ir' : f.text ? 'text' : from && 'gen' in from ? from.gen : l.sites ? 'sites' : l.lattice ? 'lattice' : 'field'
}

/** A widget's full metadata: the authored `cardBlurbs` entry, what the preset says about itself, and `facts` (uid, board, golden). */
export function deriveWidgetMeta(p: WidgetPreset, facts: WidgetFacts, theme: ThemeTokens): WidgetMeta {
  const [blurb, tagText] = cardBlurbs[p.id] ?? ['', '']
  const tags = tagText.split(/\s+/).filter(Boolean)
  const pitch = p.grid.pitch ?? theme.gridPx, grid = { ...p.grid, pitch }
  let layers: ReturnType<WidgetPreset['layers']> = []
  try { layers = withChrome(p)({ t: 0, frame: 0, data: { ...p.defaults }, grid }) } catch { /* a card that cannot draw headless still gets metadata */ }
  let dots = 0
  try { for (const d of sampleLayers(layers, grid, p.style, theme)) if (d.opacity > 0 && d.r > 0) dots++ } catch { /* idem */ }
  const kinds = [...new Set(layers.map(layerKind))], controls = p.controls ?? [], text = new Set<string>()
  for (const l of layers) for (const w of (l.field.text ?? '').toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) text.add(w)
  const animated = !!p.animated, scope = facts.scope ?? ''
  const media = p.media === 'camera' ? 'camera' as const : controls.some(c => /^mic$/i.test(c.key)) ? 'mic' as const : undefined
  const label = p.label?.replace(/\s+/g, ' ').trim()
  return {
    uid: facts.uid, slug: p.id, scope, name: p.name, ...(label && label.toLowerCase() !== p.name.toLowerCase() && { label }),
    board: facts.board, boards: facts.boards ?? [facts.board], group: p.group,
    blurb, tags, keywords: [...new Set([...tags, ...text])],
    url: widgetPath(p.id, scope), short: shortPath(facts.uid),
    grid: { cols: p.grid.cols, rows: p.grid.rows, pitch },
    animated, clock: !!p.clock, live: !!p.live, interactive: controls.length > 0,
    controls: [...new Set(controls.map(c => c.kind))], ...(controls.length && { hint: hintVerb(p, controls) }), ...(media && { media }),
    dots, layerCount: layers.length, layers: kinds, ir: kinds.includes('ir'),
    renderer: hasGPULayers(layers) ? 'webgl' : animated || dots > 2000 ? 'canvas' : 'svg',
    ...(facts.version && { version: facts.version }), aliases: facts.aliases ?? [],
  }
}

/** The authored half: `[one plain line, 'space separated tags']` per slug. */
export const cardBlurbs: Readonly<Record<string, readonly [blurb: string, tags: string]>> = {
  // henry: the OLED micro UI
  'home-clock': ['A home screen: the time on split-flap dots, the date and the battery.', 'clock time home'],
  'music': ['Now playing, with the album art as a halftone photo and a progress bar.', 'music audio photo'],
  'timer': ['A countdown on a ring of dots that empties as time runs out.', 'timer time ring'],
  'weather': ['Tokyo weather: a cloud icon, the high and the low.', 'weather icon'],
  'fitness': ['Daily move goal as a ring, with the week underneath.', 'fitness health ring'],
  'messages': ['Two chat messages with avatars, the newest one arriving.', 'messages chat phone'],
  'camera': ['A camera viewfinder with a blinking REC light.', 'camera phone'],
  'settings': ['A settings list: Wi-Fi, Bluetooth, brightness and sound.', 'settings phone ui'],
  'system': ['CPU usage as a bar chart, with the device name and version.', 'system chart device'],
  // deerflow12: the AIoT dashboard
  'agent-status': ['An AI agent thinking: its steps, tools and memory use.', 'ai agent dashboard'],
  'codex-tokens': ['Tokens and requests for Claude and Codex, with a usage chart.', 'ai tokens chart dashboard'],
  'device-overview': ['128 IoT devices: online and offline shares on a ring, and open alerts.', 'iot devices ring dashboard'],
  'tesla-status': ['A parked car: battery, range and an outline of the car.', 'car battery ev dashboard'],
  'pharma-track': ['A drug compound in phase II, with its trial progress.', 'health science progress dashboard'],
  'medical-monitor': ['Heart rate, oxygen and temperature, with an ECG trace.', 'health medical ecg chart'],
  'bio-sensor': ['A plant sensor: soil moisture and light on gauges.', 'iot sensor plant gauge'],
  'word-play': ['A fill-in-the-blank word game with a score and a streak.', 'game words'],
  'retail-analytics': ['Live store visitors and sales on a bar chart.', 'retail chart dashboard'],
  'entertainment': ['A spinning entertainment dial of rings and rays.', 'entertainment ring animated'],
  'game-zone': ['An arcade game playing itself, with the score counting up.', 'game arcade animated'],
  'vision-ai': ['A camera that finds objects, with boxes and a confidence score.', 'ai vision camera'],
  // mosaic: the command centre
  'thermal-monitor': ['A thermal camera frame with the minimum, centre and maximum temperatures.', 'thermal camera photo sensor'],
  'ev-charge': ['An electric car charging: percent, power, time left and range.', 'ev car battery charge'],
  'codex-usage': ['Tokens left today and an hourly usage chart.', 'ai tokens chart'],
  'fitness-rings': ['Three activity rings: calories, move and training, with the week.', 'fitness health ring'],
  'henry-sleep': ['Last night’s sleep: total hours and time in each stage.', 'sleep health chart'],
  'mini-game': ['A tiny space shooter playing itself on the dot grid.', 'game arcade animated'],
  'ai-assistant': ['A voice assistant greeting, with suggested prompts to pick from.', 'ai assistant chat'],
  'vision-camera': ['A camera scene with the objects it recognised: mug, plant, laptop, notebook.', 'ai vision camera'],
  'deerflow-agent': ['A running agent: task progress, CPU, memory, network and temperature.', 'ai agent system'],
  // henry3: a personal day
  'boarding-pass': ['A boarding pass: seat 14A, San Francisco to London.', 'travel flight ticket'],
  'sunburst': ['Day 3 of 7 as a sunburst of rays.', 'progress ring calendar'],
  'power-ring': ['Power draw, 247 W, on a ring of dots.', 'power energy ring'],
  'midnight-circuit': ['A night at the desk: a circuit-like trace of focus over time.', 'focus chart animated'],
  'silhouette': ['A portrait silhouette in halftone dots.', 'photo portrait halftone'],
  'inhale': ['A breathing guide: the ring grows as you breathe in and shrinks as you breathe out.', 'breathing health animated'],
  'good-morning': ['A morning greeting with how long you slept.', 'morning sleep greeting'],
  'cardiology': ['A clinic queue ticket: your number and how many are ahead.', 'health queue ticket'],
  'listening': ['An assistant listening, its voice wave moving.', 'ai voice audio animated'],
  // metro
  'metro': ['Minutes to the next metro train.', 'transit train time'],
  'oxygen': ['Indoor oxygen level on a dial.', 'air sensor gauge'],
  'home-quiet': ['Home in quiet mode, drawn as a house icon.', 'home icon'],
  'final-lap': ['A race lap trace with the final lap marked.', 'race sport chart'],
  'newswire': ['Headlines scrolling on a news ticker.', 'news text live'],
  'deerflow-stars': ['A field of scattered stars around the DeerFlow name.', 'stars scatter brand'],
  'cody': ['A small robot mascot, Cody.', 'mascot icon character'],
  'tatooine': ['A binary sunset over the desert, in halftone.', 'photo film sunset'],
  'afterlight': ['A film poster: “A film by Henry Li”.', 'photo film poster'],
  // ride: a phone-like system
  'ride': ['A ride on its way: arrival in minutes and the battery.', 'ride transit phone'],
  'henry-bear': ['A bear mascot saying it is listening.', 'mascot icon assistant'],
  'design-review': ['A calendar card: design review on Thursday the 20th.', 'calendar event phone'],
  'memo': ['A voice memo: “Ship the idea”.', 'memo notes phone'],
  'wiki': ['A personal wiki page asking “Why now?”.', 'notes wiki chart'],
  'system-menu': ['A system menu: display, sound, network and about.', 'settings menu phone'],
  'last-password': ['A password vault with 24 items, behind a dial.', 'security password ring'],
  'notifications': ['Three new notifications, stacked.', 'notifications phone'],
  'apps': ['A home screen grid of app icons.', 'apps icon phone'],
  // audio
  'audio-levels': ['Speaker and microphone levels on round meters.', 'audio meter animated'],
  'vibe-pad': ['A pad of dots for picking a mood.', 'audio pad music'],
  'midi': ['A MIDI controller: keys and knobs in dots.', 'midi music audio'],
  'recorder': ['A tape recorder with spinning reels.', 'audio recorder animated'],
  'radio': ['A radio dial with a tuning ring.', 'radio audio ring'],
  'interpreter': ['A live interpreter: speech in, translated text out.', 'ai voice translate live'],
  'thermal-puppy': ['A puppy seen by a thermal camera, 38.6°.', 'thermal photo animal'],
  'level-03': ['A game level drawn in scattered dots.', 'game level scatter'],
  'shopping': ['A shopping card with a basket and items.', 'shopping retail'],
  // departures: a live transit board
  'departures': ['A split-flap departures board, flipping letter by letter.', 'transit train splitflap live'],
  'station-clock': ['A station clock, its second hand sweeping.', 'clock time transit live'],
  'platform': ['The next train from platform 3: Harbour, on time.', 'transit train splitflap live'],
  'next-train': ['Minutes until the next train to Harbour, counting down.', 'transit train time live'],
  'line-map': ['A line map with the train moving between stations.', 'transit map live'],
  'service': ['Service status for four lines: on time or delayed.', 'transit status live'],
  // instrument: a playable synth
  'inst-cutoff': ['A filter cutoff knob for the synth. Turn it and hear the sound change.', 'synth knob music control'],
  'inst-resonance': ['A resonance knob for the synth filter.', 'synth knob music control'],
  'inst-level': ['Output level meters, left and right, with a gain control.', 'synth meter music control'],
  'inst-attack': ['The attack time of each note, on a knob.', 'synth knob music control'],
  'inst-release': ['The release time of each note, on a knob.', 'synth knob music control'],
  'inst-xy': ['An XY pad: drag the dot to bend two sounds at once.', 'synth pad music control'],
  'inst-transport': ['Play, tempo and sound on/off for the synth.', 'synth tempo music control'],
  'inst-sequencer': ['A sixteen-step sequencer: tap steps to program the beat.', 'synth sequencer music control'],
  'inst-crank': ['A crank you turn to count ticks.', 'crank control music'],
  // ir: Field IR programs
  'ir-ripple': ['Ripples written as a tiny Field IR program.', 'ir program animated'],
  'ir-plasma': ['A plasma written as a Field IR program.', 'ir program animated'],
  'ir-dial': ['A dial written in Field IR, driven by one data value you can drag.', 'ir program dial control'],
  // cinema: the Afterlight cycle
  'cinema-last-call': ['Noir: a bar that never closed, in animated halftone.', 'film noir animated photo'],
  'cinema-signal': ['Sci-fi: someone answered the signal.', 'film scifi animated photo'],
  'cinema-sundown': ['Western: the last light in the west.', 'film western animated photo'],
  'cinema-upstairs': ['Horror: someone left the light on upstairs.', 'film horror animated photo'],
  'cinema-closer': ['Romance: no lights, just us.', 'film romance animated photo'],
  'cinema-witness': ['Documentary: she saw the fire.', 'film documentary animated photo'],
  'cinema-exit-14': ['Thriller: a highway exit at night. Don’t look back.', 'film thriller animated photo'],
  'cinema-keeper': ['Drama: a lighthouse keeper who kept it burning.', 'film drama animated photo'],
  'cinema-encore': ['Musical: one more song under the spotlight.', 'film musical animated photo'],
  // light: the raster light stack
  'light-torch': ['Drag a torch across a relief and watch the dots light up.', 'light torch control'],
  'light-orb': ['A glowing orb lighting the dots around it.', 'light orb animated'],
  'light-on-air': ['An ON AIR studio sign, glowing.', 'light sign animated'],
  'light-matte': ['A matte surface lit by a moving light (Lambert shading).', 'light material animated'],
  'light-gloss': ['A glossy surface with a sharp highlight.', 'light material animated'],
  'light-glass': ['Glass that bends the light passing through it.', 'light material animated'],
  'light-emissive': ['A surface that gives off its own light, with bloom.', 'light material animated'],
  'light-metal': ['Metal reflecting its surroundings.', 'light material animated'],
  'light-fabric': ['Fabric shaded with an ordered dither.', 'light material animated'],
  // levels: HIVE
  'lv-title': ['HIVE’s title screen: push start.', 'game title animated'],
  'lv-corridor': ['HIVE level 01: a corridor of enemies.', 'game level animated'],
  'lv-vault': ['HIVE level 02: the vault.', 'game level animated'],
  'lv-surface': ['HIVE level 04: the surface.', 'game level animated'],
  'lv-warren': ['HIVE level 05: the warren.', 'game level animated'],
  'lv-void': ['HIVE level 06: the void, 0.4 light years from the hive.', 'game level animated'],
  'lv-queen': ['HIVE level 07: the queen, the final boss.', 'game boss animated'],
  'lv-over': ['Game over, with a continue countdown.', 'game animated'],
  'lv-scores': ['The HIVE high-score table.', 'game scores animated'],
  // heartbeat: agent presence
  'hb-thinking': ['An AI agent thinking about its next step.', 'ai agent status animated'],
  'hb-tool-running': ['An AI agent running a tool: pnpm test.', 'ai agent status animated'],
  'hb-awaiting-approval': ['An AI agent waiting for you to approve an edit.', 'ai agent status animated'],
  'hb-error': ['An AI agent hit an error: exit code 1.', 'ai agent status animated'],
  'hb-done': ['An AI agent finished: 12 files changed.', 'ai agent status animated'],
  'hb-agent': ['All five agent states in one card. Tap through them.', 'ai agent status control'],
  // sim: living fields
  'sim-rd': ['Reaction-diffusion: spots and stripes growing on their own.', 'sim pattern animated'],
  'sim-sand': ['Falling sand piling up grain by grain.', 'sim sand animated'],
  'sim-life': ['Conway’s Game of Life, generation by generation.', 'sim life animated'],
  // lock: lock screens
  'lock-hourglass': ['An hourglass whose sand runs down.', 'lock time animated'],
  'lock-longpress': ['Hold to unlock: the ring fills while you press.', 'lock unlock control'],
  'lock-notify': ['A lock screen with two new notifications.', 'lock notifications animated'],
  'lock-idle': ['An idle lock screen of drifting dots.', 'lock idle animated'],
  // live: real data
  'live-weather': ['Your local weather right now and later today, from Open-Meteo.', 'weather live data'],
  'live-now-playing': ['A now-playing feed with a progress bar.', 'music live data'],
  'live-contribs': ['GitHub contributions for the last year, with your streak.', 'github live data'],
  // mirror: camera halftone
  'mirror-camera': ['Your camera as halftone dots. Video stays on your device.', 'camera halftone live'],
  'mirror-ladder': ['The halftone ladder: ordered, structured and noisy dithering side by side.', 'halftone dither photo'],
  'mirror-shadow': ['Your shadow as a puppet of dots. Video stays on your device.', 'camera shadow live'],
  'mirror-conduct': ['Hand mode: wave or pinch in front of the camera to drive the cards.', 'camera hand control'],
  // gpu: half a million dots
  'gpu-plasma': ['A plasma of half a million dots, evaluated on the GPU.', 'gpu plasma animated'],
  'gpu-starfield': ['A starfield flying past, on the GPU.', 'gpu stars animated'],
  'gpu-moire': ['Moiré interference patterns on the GPU.', 'gpu pattern animated'],
  // surfaces: one field, five surfaces
  'surface-browser': ['The shared field as a browser draws it: 144 × 144 dots.', 'surface display animated'],
  'surface-glyph': ['The same field on a 25 × 25 glyph matrix.', 'surface display animated'],
  'surface-eink': ['The same field on e-ink, with full refreshes and ghosting.', 'surface eink animated'],
  'surface-flipdisc': ['The same field on a flip-disc panel, disc by disc.', 'surface flipdisc animated'],
  'surface-plotter': ['The same field drawn by a pen plotter on A6 paper.', 'surface plotter animated'],
  // components: primitives
  'ui-toggle': ['A toggle switch. Tap it.', 'ui toggle control'],
  'ui-pill': ['Pill buttons: an action and a destructive one.', 'ui button'],
  'ui-slider': ['Two sliders to drag.', 'ui slider control'],
  'ui-icon-button': ['Icon buttons drawn in dots.', 'ui button icon'],
  'ui-status-dot': ['Status dots: online, away, busy.', 'ui status'],
  'ui-segmented': ['A segmented control: low, mid, high.', 'ui segmented control'],
  'ui-stepped-slider': ['A slider that snaps to steps.', 'ui slider control'],
  'ui-knob': ['A knob to turn.', 'ui knob control'],
  'ui-stepper': ['A plus and minus stepper for the number of guests.', 'ui stepper control'],
  'ui-check': ['Checkboxes and radio buttons.', 'ui checkbox control'],
  'ui-tabs': ['Tabs: day, week, year.', 'ui tabs control'],
  'ui-progress': ['A progress bar and a sync status.', 'ui progress control'],
  'ui-loaders': ['Three loaders: spin, bounce and pulse.', 'ui loader animated'],
  'ui-keypad': ['A phone keypad. Press the keys.', 'ui keypad control'],
  'ui-text-field': ['A text field with a blinking cursor and a character count.', 'ui input control'],
  'ui-chips': ['Filter chips to switch on and off.', 'ui chips control'],
  'ui-toast': ['Toast notifications you can dismiss.', 'ui toast control'],
  // type: variable dot type
  'type-axes': ['A variable dot typeface: change weight, width and roundness.', 'type font control'],
  'type-morph': ['One word morphing into another.', 'type morph animated'],
  'type-marquee': ['A scrolling marquee, a quarter of a dot per step.', 'type marquee animated'],
  'type-kinetic': ['Kinetic type: wave, bounce and breathe.', 'type kinetic animated'],
  'type-flight': ['Letters flying from one word to the next.', 'type animated'],
  'type-anything': ['Type your own words onto the dot matrix.', 'type input animated'],
  // physics: dots you can touch
  'phys-splash': ['Splash a word into fluid with your pointer.', 'physics fluid control'],
  'phys-ink': ['Stir ink in water.', 'physics fluid control'],
  'phys-flag': ['A cloth flag in the wind. Grab it.', 'physics cloth control'],
  'phys-jelly': ['A jelly that wobbles when you poke it.', 'physics jelly control'],
  'phys-pit': ['A pit of dots to throw around.', 'physics particles control'],
  // scope: the instrument as signal
  'scope-wave': ['An oscilloscope trace of the synth’s sound.', 'audio scope chart animated'],
  'scope-spectrum': ['A spectrum analyser from 40 Hz to 16 kHz.', 'audio spectrum chart animated'],
  'scope-mic': ['Your microphone as a live waveform. Tap to listen.', 'audio microphone live'],
  // heal: the mirror that heals
  'heal-mirror': ['Scratch the dots with your cursor and watch them grow back.', 'heal nca control'],
  'heal-xray': ['The hidden state that lets the dots regrow, shown as channels.', 'heal nca animated'],
  'heal-persist': ['Scratch it and it heals, even after many cuts.', 'heal nca control'],
  'algo-stipple': ['A moon drawn by 2,400 dots that settle into place by weighted Voronoi relaxation.', 'algorithm stipple voronoi animated'],
  'algo-attractor': ['A Clifford strange attractor as a density of dots, its parameters slowly drifting.', 'algorithm attractor chaos animated'],
  'algo-collapse': ['Wave Function Collapse solving a new knot of tiles every loop.', 'algorithm wfc tiles animated'],
  'algo-aggregate': ['Frost grown one grain at a time by diffusion-limited aggregation.', 'algorithm dla fractal animated'],
}
