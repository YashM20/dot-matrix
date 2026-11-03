/**
 * One plain line per board and per picker group (docs/UX-PLAN.md §4.2): what it is and what to try.
 * Its own chunk, fetched with the first board, so the words stay out of the first-load budget.
 */
import type { BoardGroupId, BoardId } from './manifest'

export const boardBlurbs: Record<BoardId, string> = {
  henry: 'A tiny OLED operating system: clock, music, timer, weather. Every glyph is sampled dots.',
  deerflow12: 'Twelve dashboard cards: agents, devices, sensors, retail, a game and vision AI.',
  mosaic: 'A command-centre mosaic with ambient light: thermal, EV charge, sleep and a mini game.',
  henry3: 'A personal assistant’s day: power, focus, breathing and a morning greeting.',
  metro: 'Transit, air quality, news and a race lap on one quiet board.',
  ride: 'A phone-like system: ride, calendar, memo, wiki, notifications and apps.',
  audio: 'Audio gear in dots: vibe pad, MIDI, recorder, radio and a live interpreter.',
  departures: 'A split-flap departures board, flipping letter by letter.',
  instrument: 'A playable synth: turn the knobs, program the sixteen steps and press play. Sound on.',
  ir: 'Cards written as Field IR programs. The same code runs in MAKE · CODE.',
  cinema: 'Nine animated scenes from the Afterlight cycle: light, motion and silhouettes.',
  light: 'Lit dots: drag the torch across matte, gloss, glass, metal and fabric.',
  levels: 'HIVE, a dot-matrix game in nine worlds. Press start and play with the keyboard.',
  heartbeat: 'How an AI agent could show its state: thinking, running a tool, waiting, done.',
  sim: 'Fields that live: reaction-diffusion, falling sand and the Game of Life.',
  lock: 'Lock-screen moments: an hourglass, a long-press unlock, a notification, idle.',
  live: 'Real data: your local weather, a now-playing feed and GitHub contributions.',
  mirror: 'Your camera as halftone dots, a shadow puppet, and a hand mode that drives every card. Video stays on your device.',
  gpu: 'Half a million dots evaluated on the GPU: plasma, a starfield and moiré.',
  surfaces: 'One field on five surfaces: browser, glyph matrix, e-ink, flip-disc and plotter.',
  components: 'The building blocks: toggles, sliders, knobs, tabs and a keypad. All of them work.',
  type: 'A variable dot typeface: weight and width knobs, morphs, a marquee. Type your own.',
  physics: 'Dots you can touch: splash a word, stir ink, grab the flag, poke the jelly, throw a dot.',
  scope: 'The instrument seen as signal: oscilloscope, spectrum and your microphone.',
  heal: 'Scratch the dots with your cursor and watch them grow back.',
  algorithms: 'Four niche algorithms drawing in dots: Voronoi stippling, a strange attractor, wave function collapse and frost growth.',
  materials: 'Stone, glass, metal, cloth and thread made of dots: relief, one light and a moving part.',
  workshop: 'Twelve materials: knit, denim, paper, wood, leather, sand, ice, mercury, thread, a burned plate, a worn stone and frost.',
  pond: 'A koi pond and other small ecosystems, drawn in glyph tiles. Tap to feed, hold to lure.',
  squares: 'Square cells, spaced, joined, turned and cut: Tetris pieces that fuse, a face in 1,201 quads, metaballs, an LCD, teletext, a line screen, Schotter, an L∞ Mondrian, pixel sorting, Truchet tiles, cross-stitch, beads, a dot-to-square morph, two floors that never repeat, an arctic circle, a sandpile and an ASCII screen.',
  fractals: 'Six fractals in dots: a Julia set walking the Mandelbrot map, orbit traps, popcorn, a chaos-game flame, an eight-fold icon and a Lyapunov field.',
  oldschool: 'Demo effects from the late 1990s: a brick tunnel, a flower, a floor to the horizon, drifting clouds and a screen filming itself.',
  scenes: 'Small 3D scenes traced onto big dots: a turned vase, a twisted column, a walk through a field of posts and a swinging chain.',
  dash: 'A car dashboard that drives itself in a loop. Touch any control and the car is yours: gears, signals, speed, charge.',
  faces: 'Four dot faces that watch your cursor, blink, react when you tap them and get sleepy at night.',
}

export const groupBlurbs: Record<BoardGroupId, string> = {
  start: 'A short tour of what this dot matrix can do.',
  ui: 'Whole interface kits drawn only with dots.',
  data: 'Boards that show changing data: weather, transit, an agent’s state.',
  play: 'Touch it, play it, hear it.',
  engine: 'Engine demos: programs, light, simulation, half a million dots.',
}
