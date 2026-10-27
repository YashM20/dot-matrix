import { lazy, type ReactNode } from 'react'
import { DotTitle } from './ui/DotTitle'
import { Figure } from './ui/Lazy'

// one chunk per figure, fetched when the figure scrolls near the viewport (module-level: stable identities)
const fig = {
  resolution: lazy(() => import('./figures/FigResolution')),
  pipeline: lazy(() => import('./figures/FigPipeline')),
  quantize: lazy(() => import('./figures/FigQuantize')),
  lattice: lazy(() => import('./figures/FigLattice')),
  accent: lazy(() => import('./figures/FigAccent')),
  departures: lazy(() => import('./figures/FigDepartures')),
  masks: lazy(() => import('./figures/FigMasks')),
  instrument: lazy(() => import('./figures/FigInstrument')),
  light: lazy(() => import('./figures/FigLight')),
  sim: lazy(() => import('./figures/FigSim')),
  flicker: lazy(() => import('./figures/FigFlicker')),
  mirror: lazy(() => import('./figures/FigMirror')),
  ir: lazy(() => import('./figures/FigIR')),
  surfaces: lazy(() => import('./figures/FigSurfaces')),
  agents: lazy(() => import('./figures/FigAgents')),
}

const A = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{children}</a>
const C = ({ children }: { children: ReactNode }) => <code>{children}</code>
const Sec = ({ id, num, title, children }: { id: string; num: string; title: string; children: ReactNode }) => (
  <section className="sec" id={id} aria-labelledby={`${id}-h`}>
    <DotTitle text={title} num={num} id={`${id}-h`} />
    {children}
  </section>
)
const Moment = ({ n, children }: { n: number; children: ReactNode }) => <p className="moment"><b>Signature moment {n}</b> {children}</p>

const TOC: [string, string][] = [
  ['why', 'Why dots'], ['pipeline', 'Field, sampler, renderer'], ['quantize', 'Quantization and the squircle'], ['lattice', 'Lattices and sites'],
  ['accent', 'One accent'], ['motion', 'Motion'], ['interaction', 'Interaction'], ['light', 'Light and material'], ['sim', 'Simulation'],
  ['halftone', 'Halftone and time'], ['ir', 'Field IR'], ['surfaces', 'Five surfaces'], ['agents', 'Agents'], ['credits', 'Prior art'],
]

export function Essay() {
  return (
    <main className="essay">
      <header className="hero">
        <nav className="site-nav" aria-label="Site">
          <span className="kicker"><i aria-hidden="true" /> DOT/480</span>
          <span><a href="./">EXPLORE</a><a href="./?make=code">MAKE</a><a href="./?about">ABOUT</a></span>
        </nav>
        <DotTitle text="Ditherpunk for UI" level={1} max={10} smooth />
        <p className="lede">
          Notes from building a dot-matrix renderer for interfaces, a hobby that got out of hand. A field goes in, gets sampled onto a grid,
          is rounded to a handful of dot sizes, and comes out grey with exactly one red. Every figure on this page is the actual engine running in your browser,
          so poke at them. Nothing here is for sale.
        </p>
        <nav className="toc" aria-label="Sections">
          <ol>{TOC.map(([id, name], i) => <li key={id}><a href={`#${id}`}><span>{String(i + 1).padStart(2, '0')}</span>{name}</a></li>)}</ol>
        </nav>
      </header>

      <Sec id="why" num="01" title="Why dots">
        <p>
          Interfaces got smooth. Every surface is a gradient, every corner a different radius, every state a new colour. It all looks fine, and it all looks the same.
          A dot matrix goes the other way. You get a fixed grid of lights, a few brightness levels and one colour that means something. Nothing else is allowed.
        </p>
        <p>
          That sounds like a handicap. It is the point. A constraint you can't negotiate with makes decisions for you. You don't choose a font weight, because there isn't one.
          You don't pick a shadow, because a dot can't cast one. What's left is composition, tone and timing, which is where the taste was all along. Train departure boards, VFD clocks,
          the <A href="https://teenage.engineering/">Teenage Engineering</A> OP-1 screen and LED back panels on phones are all memorable because they got so little and used it well.
        </p>
        <p>
          Dot/480 is my attempt to get that look for ordinary interface widgets (clocks, sliders, timers, status cards) without hand-pixelling a single one.
          The trick fits in one sentence: <em>nothing is drawn, everything is sampled.</em>
          Below is a lit sphere. It isn't a bitmap. It's a function of two numbers, and the slider only changes how many times we ask it for a value.
        </p>
        <Figure id="resolution" body={fig.resolution} minHeight={420} caption={<>A field has no resolution. At 8×8 it is a blob of light; at 24×24 it is a sphere; past 48 it starts to look like a photo, and the charm drains out. Most Dot/480 cards live between 25 and 144 dots a side.</>} />
        <p>
          Notice where it reads best: low enough that each dot is a decision you can see, high enough that the shape survives. That band is the whole aesthetic,
          and the rest of this essay is about staying inside it on purpose.
        </p>
      </Sec>

      <Sec id="pipeline" num="02" title="Field → sampler → renderer">
        <p>
          Every visual in Dot/480, from a clock digit to a webcam frame, goes through the same three stages, and there is no fourth.
        </p>
        <ol className="steps">
          <li><b>Field.</b> A pure function <C>f(u, v) → 0..1</C> over the unit square. Text is a field (glyph pixels), a ring is a field (distance to a circle), a photo is a field (luma lookup).</li>
          <li><b>Grid sampler.</b> Asks the field for one value per cell centre, then quantizes it into a few dot sizes and opacities, and picks a tone.</li>
          <li><b>Renderer.</b> Turns dots into SVG or Canvas. SVG for sparse static cards you can copy and paste; Canvas past about 2,000 dots or whenever something moves.</li>
        </ol>
        <p>
          The left panel shows the field sampled so finely, and without quantization, that it looks continuous. The right panel is the same function at a pitch you choose.
          Drag the blob in either one. Then pull the pitch down and watch the sampler give up detail in a fixed order: thin necks go first, then soft edges, then whole lobes.
        </p>
        <Figure id="pipeline" body={fig.pipeline} minHeight={440} caption={<>Three metaballs, one under your pointer. Same field, two samplings. Arrow keys move the blob too.</>} />
        <p>
          The pipeline buys you three things. Density becomes a single number: the same card renders at 25×25 on an LED panel or 144×144 on a retina screen without being redrawn.
          Effects compose as maths: a mask, a light or a spring is a function of the field, not a new code path. And because a card is a pure function of its inputs
          (<C>t</C>, <C>data</C>, the pointer), it renders the same in a browser, in a test, in a worker or on a device. Snapshots are deterministic, so golden-image tests actually work.
        </p>
      </Sec>

      <Sec id="quantize" num="03" title="Quantization and the squircle">
        <p>
          The sampler does one lossy thing on purpose: it rounds. A field value of 0.63 becomes one of five dot sizes (<C>quantizeSteps: 5</C>). With five steps, smooth gradients become
          visible terraces, and the terraces are the look. Turn quantization off and the card looks like a cheap photo filter. Turn it to two and you have a 1-bit LCD.
        </p>
        <p>
          The second number is the dot itself. Dot/480 has no shape presets. Instead a dot is a superellipse, <C>|x|ⁿ + |y|ⁿ = 1</C>, and one roundness knob <C>r</C> maps to the exponent
          with <C>n = 2 + 30r²</C>. At <C>r = 0</C> you get a circle (n = 2); at 0.25, the house default, a soft squircle (n ≈ 3.9); at 1, a square in all but name (n = 32).
          The square curve spends most of the slider near the round end, which is where the eye is most sensitive.
        </p>
        <Figure id="quantize" body={fig.quantize} minHeight={300} caption={<>A ramp with a bump on it. Step count changes how many sizes exist; roundness changes what a dot is. Both are continuous, so nothing ever needs a new preset.</>} />
        <p>
          Why insist on one continuous knob? Because presets multiply. "Rounded", "pill" and "square" turn into a design-system argument; an exponent just interpolates. Card corners use the same
          family at a larger scale, so the chrome and the dots always look related.
        </p>
      </Sec>

      <Sec id="lattice" num="04" title="Lattices and sites">
        <p>
          Here is the mistake every dot-matrix toy makes. You need a big number, so you scale the 5×7 font by four, and each font pixel becomes a 4×4 clump of small dots.
          It looks like a mosaic, not a display. A real panel with a big numeral has <em>bigger lights</em>, spaced further apart.
        </p>
        <p>
          So in Dot/480 every layer can sit on its own <C>lattice</C>: a coarser grid whose dots are <C>k</C>× the card pitch apart and <C>k</C>× larger. A hero numeral on lattice 2.5 is
          a few dozen big dots, each one a font pixel. Curves get the same treatment with <C>sites</C>: a ring is a set of evenly spaced dot centres along the circle, never a ring-shaped
          stencil cut out of the square grid, which leaves jagged stairs where the circle crosses rows.
        </p>
        <Figure id="lattice" body={fig.lattice} minHeight={300} caption={<>Toggle between the two. Same "42", same ring; only the way the dots are placed changes. The clusters look like a scaled bitmap; the lattice looks like hardware.</>} />
        <p>
          The rule that falls out is simple: <strong>bigger elements use a coarser lattice or dot sites, never clusters of small dots.</strong> A card mixes pitches the way a real control
          panel does: tiny dots for labels and ticks, big dots for the one number that matters.
        </p>
      </Sec>

      <Sec id="accent" num="05" title="One accent">
        <p>
          Dot/480 has exactly one colour, Signal Red <C>#FF3B30</C>. Everything else is four greys on near-black. Red is not decoration; it marks the one thing the story is about:
          something <em>live</em> (recording, boarding), something <em>hot</em> (a thermal body, an urgent timer) or the <em>primary</em> series in a chart. Hover and focus never use it.
          If you can't name the role of a red dot, it shouldn't be red.
        </p>
        <p>
          It's easier to show than to argue. The three cards below are a progress bar, a live status dot and a pair of sliders whose lower one is a live level. Flip the switch to give the sliders their own accent.
        </p>
        <Figure id="accent" body={fig.accent} minHeight={300} caption={<>With one red your eye lands on the live state first. With two hues the board has two plots and no protagonist, and the blue slider reads like an ad. (The blue theme exists only in this figure.)</>} />
        <p>
          Scarcity is what gives red its meaning. Once every card is allowed one accent, every board is a rainbow. So the budget is per board, not per card:
          the heartbeat board below pulses in white on the card that could switch to red, because a sibling already owns it.
        </p>
      </Sec>

      <Sec id="motion" num="06" title="Motion">
        <p>
          A dot display doesn't tween. Dots don't slide between positions; they switch on and off, change size, and every so often a whole panel flips. So motion in Dot/480 is built from the same parts:
          masks, flaps and springs, each a function of time evaluated per dot.
        </p>
        <p>
          <b>Masks.</b> An entrance is a threshold map: every cell gets a number in 0..1, and a dot appears when progress passes its number. A Bayer matrix gives the classic ordered dissolve;
          interleaved gradient noise looks less like a grid; a radial or curtain mask turns the same reveal into a gesture. Exits run the same mask backwards, and changes dissolve the old frame into the new one.
        </p>
        <Figure id="masks" body={fig.masks} minHeight={380} caption={<>Pick a mask to replay the platform card's entrance. Same card, same 900 ms; the mask is the only difference.</>} />
        <p>
          <b>Split-flap.</b> The Departures board is a love letter to the <A href="https://en.wikipedia.org/wiki/Split-flap_display">Solari boards</A> and to
          Scott Bezek's open-source <A href="https://github.com/scottbez1/splitflap">splitflap</A> hardware. Each character cell flips through the alphabet to its target with
          a fold about its middle, the rows cascade top to bottom, and the station clock's red second hand sweeps the dial in 58.5 seconds, then waits at twelve for the minute to tick, like the Swiss railway clock it copies.
        </p>
        <Figure id="departures" body={fig.departures} minHeight={300} caption={<>The Departures board, live. Everything here is a pure function of the board clock, so a snapshot at <C>t = 12.5 s</C> is always the same frame.</>} />
        <p>
          <b>Springs.</b> When data changes, a value glides on a critically damped spring (half-life 0.12 s) and snaps to the nearest cell every frame, so a knob's dot never sits between two
          positions. A press releases on an under-damped spring with one visible overshoot. You'll feel both in the next section.
        </p>
      </Sec>

      <Sec id="interaction" num="07" title="Interaction">
        <p>
          In Dot/480, interaction isn't a CSS layer on top of the card. It's state the card's data is in. A card declares controls (a knob, a slider, an XY pad, each a box in cell space);
          the input layer turns pointer, touch, wheel and keyboard into changes to <C>data</C> and fills <C>hover</C>, <C>pressed</C> and <C>focus</C> into the frame context.
          The card redraws through the same pipeline. So every response is made of dots: hover is a soft pool of light in white, never red; a press shrinks the dot by one quantize step;
          focus is a ring of marching dots, three on and two off.
        </p>
        <Figure id="instrument" body={fig.instrument} minHeight={300} caption={<>Instrument knobs, live: drag in a circle, scroll, or Tab to one and use the arrow keys. Detents are whole lattice steps. Each card carries a real, invisible control on top for screen readers.</>} />
        <p>
          Two rules keep it honest. <strong>Drags scrub whole dot columns</strong>: a value moves one column at a time, never a fraction, so the thumb always sits on dots.
          And <strong>hit areas grow, dots don't</strong>: a tiny target is padded to 24 px (44 px on touch) invisibly, so accessibility never changes the picture.
        </p>
      </Sec>

      <Sec id="light" num="08" title="Light and material">
        <p>
          Light is a field too. A shape becomes a signed distance, the distance becomes a height raster, and the height becomes normals. All of that is cached once. Per frame only the light
          moves: Lambert for the body, Phong for the highlight, both rounded into tone bands. A highlight is drawn two quantize steps above the dot under it, which is how a dot display shows gloss.
        </p>
        <p>
          Materials are just rules about which dots exist. Matte splits Lambert into three grey bands. Glass offsets what's behind it by the normal, in whole cells. Fabric dithers
          between neighbouring sizes with a 4×4 Bayer matrix. Emissive draws the shape plus a dimmed halo with a one-dot moat between them. No new colours, ever.
        </p>
        <Figure id="light" body={fig.light} minHeight={340} caption={<>Left: the torch card. The pointer is a point light over a domed power button; take it away and the torch drifts. Right: the level-03 corridor with the lights off.</>} />
        <Moment n={5}><b>Torch in the Dark.</b> The right-hand card is level-03, one of the liked reference cards, with its lights off. Your cursor is the only light in the hall: inverse-square falloff
          over the corridor's own tones, dust motes that exist only where the torch reaches, and one red invader at the end of the hall that never needed the light.</Moment>
      </Sec>

      <Sec id="sim" num="09" title="Simulation">
        <p>
          Some fields aren't formulas but state: sand that piles up, chemicals that diffuse. Dot/480 treats a simulation as a field with memory. It steps at a fixed rate, is deterministic
          from its seed, and can be rewound to any step, so a snapshot at <C>t</C> is still a pure function of <C>t</C>. Falling sand and Game of Life are cellular automata on the card grid;
          the coral is a <A href="https://www.karlsims.com/rd.html">Gray-Scott reaction-diffusion</A> system on a coarser lattice, which keeps the step cheap and the dots big.
        </p>
        <Figure id="sim" body={fig.sim} minHeight={300} caption={<>Left: the Hourglass clock from the Lock board. Middle: falling sand. Right: reaction-diffusion. On a phone, tilt to lean the hourglass stream.</>} />
        <Moment n={1}><b>The Hourglass Clock.</b> On every minute the digits that change drain off the card, bottom rows first, and new grains pour in and settle into the next time. Then the colon becomes the
          neck of the glass: one grain a second falls through it onto a sixty-grain heap. The grains fall in whole lattice steps under real gravity, and the heap is a cone because every grain lands on the two below it.</Moment>
      </Sec>

      <Sec id="halftone" num="10" title="Halftone and temporal stability">
        <p>
          Photos are the one place Dot/480 skips quantization, because tone is the content. They use a halftone ladder. Step one is an ordered multi-level threshold. Step two is
          structure-aware: an edge-preserving filter takes sensor noise out of flat areas, local contrast is lifted where things are flat, and dither is turned off on edges, so a jawline snaps to
          a clean contour while a cheek stays smoothly dithered. This is where <A href="https://surma.dev/things/ditherpunk/">Surma's Ditherpunk</A> starts, and it's the essay this one borrows its name from.
        </p>
        <p>
          Video adds a problem stills don't have: <em>time</em>. Threshold a webcam frame with fresh noise every frame and every dot near a boundary flips at 30 Hz. The picture
          shimmers like a shower door, even when nothing moves. The fix has two parts. Use <A href="https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1/">spatiotemporal blue noise</A> (STBN),
          so thresholds are well spread in space and across frames. Then give every cell a memory: it keeps its threshold slice until its input really changes, and it only changes level once
          the input clears the boundary by a margin (hysteresis). A still scene then holds a fixed blue-noise pattern, and only moving regions get fresh thresholds.
        </p>
        <Figure id="flicker" body={fig.flicker} minHeight={300} caption={<>One still portrait with new sensor noise every frame, halftoned three ways. The number under each panel is how many dots changed since the last frame. Raise the noise and compare.</>} />
        <p>
          The engine's own check holds the stream to at most 10% of plain thresholding's dot changes per frame on a still scene. In practice it's far lower, which is what lets a
          webcam mirror sit on a dashboard without making anyone seasick.
        </p>
        <Figure id="mirror" body={fig.mirror} minHeight={340} caption={<>Left: drag across the portrait to scratch it. Right: the ladder, step 1 against step 2 on the same noisy portrait.</>} />
        <Moment n={2}><b>The Mirror that Heals.</b> The mirror is the step-2 halftone of a portrait built from fields (with your camera it's you, on the mirror board). Scratch it and the damage
          regrows from its edges inward. A cell heals faster the more of its neighbours are whole, so the scar closes as a sparkling front of faint dots and lands back on the exact halftone, dot for dot.</Moment>
      </Sec>

      <Sec id="ir" num="11" title="Field IR">
        <p>
          If a card is a pure function, it can be data. Field IR (<C>dot</C>) is a tiny expression language for fields. It has <C>u</C>, <C>v</C>, <C>t</C>, the pointer, <C>data.*</C>,
          <C>let</C> and bounded <C>for</C> folds, and about twenty built-ins that each map to one GLSL function. No loops without bounds, no closures, no host access: a program can only compute numbers,
          and its size and work are capped before it runs. The same source compiles to a JS closure for the CPU and to GLSL for the GPU, and serializes to JSON, so an agent can write it and a device can run it.
        </p>
        <p>
          The spirit comes straight from <A href="https://www.dwitter.net/">Dwitter</A> (a demo in 140 characters) and <A href="https://tixy.land/">Tixy</A> (a 16×16 grid driven by one
          expression of <C>t, i, x, y</C>). Edit the program below. A mistake shows its message and the card keeps the last program that worked.
        </p>
        <Figure id="ir" body={fig.ir} minHeight={420} caption={<>Your program on a 3× lattice. "Open in MAKE · CODE" carries it over as a share link, compressed into the URL, with a scrubber, data sliders and a remix graph.</>} />
      </Sec>

      <Sec id="surfaces" num="12" title="One field, five surfaces">
        <p>
          Here's where the abstraction pays off. A <C>DeviceProfile</C> describes a physical display: its grid, its mask, how many levels a pixel has, its gamma, and its physics.
          <C>toDevice</C> samples the card onto that grid. For tiny grids it uses a hand-tuned variant of the layout, because resampling 5×7 text onto 25×25 turns it to mush; bigger grids
          are resampled by area. Then each device's simulator adds what the hardware does: LED bloom, e-ink ghosting and its full-refresh flash, a flip-disc's column scan and the overshoot of a
          real disc with inertia, a pen plotter's travel between strokes.
        </p>
        <Figure id="surfaces" body={fig.surfaces} wide minHeight={240} caption={<>One 60-second timer on a browser card, a 25×25 round LED matrix, an 800×480 1-bit e-ink panel, a 28×14 flip-disc sign and a pen plotter, on one board clock (synced across tabs).</>} />
        <Moment n={3}><b>One Field, Five Surfaces.</b> Nobody redrew anything for these screens. The red arc on the browser card turns into full-brightness light on the monochrome devices, because a
          device has no red; it has photons. The simulators are honest about what each panel does: the e-ink ghosts until its tenth refresh flashes it clean, and the discs overshoot before they settle.</Moment>
      </Sec>

      <Sec id="agents" num="13" title="Agents">
        <p>
          One last experiment. A coding agent running in a terminal has a handful of states (thinking, running a tool, waiting for you, failed, done) and shows them as a spinner and a sentence.
          What if it had a body instead? The heartbeat is a lobed metaball organism whose behaviour is a closed set of tokens. Whoever drives it writes one number, <C>data.state</C>, and never draws.
          The card springs between states in about 0.4 s: a slow breath while thinking, a comet circling while a tool runs, a lub-dub pulse in red only when it needs <em>you</em>.
        </p>
        <Figure id="agents" body={fig.agents} minHeight={300} caption={<>Switch the state an agent would write. Right: the same card resampled onto a phone's 25×25 back-panel LED matrix, so the heartbeat is readable face-down on a desk.</>} />
        <Moment n={4}><b>Agent Heartbeat.</b> Because a card is a pure function of <C>t</C> and <C>data</C>, it doesn't care who writes the data. In the repo the same card also runs as an
          {' '}<A href="https://github.com/modelcontextprotocol/ext-apps">MCP App</A> inside a chat window, with the agent setting its state, and <C>describe()</C> turns any card back into text so a model
          can check what it drew. The nice part is that none of this needed new rendering code: the phone back on the right is the same card resampled, the chat version is the same card in an iframe.</Moment>
      </Sec>

      <section className="sec" id="credits" aria-labelledby="credits-h">
        <DotTitle text="Prior art" num="14" id="credits-h" />
        <p>None of this is new on its own. The pieces were all lying around; Dot/480 puts them in one pipeline.</p>
        <ul className="credits">
          <li><A href="https://surma.dev/things/ditherpunk/">Ditherpunk</A>, Surma (2021): the essay that made dithering a genre, and the reason this one exists. Its title is borrowed with thanks.</li>
          <li><A href="https://worrydream.com/ExplorableExplanations/">Explorable Explanations</A>, Bret Victor: the idea that a reader should be able to touch the argument.</li>
          <li><A href="https://www.dwitter.net/">Dwitter</A> and <A href="https://tixy.land/">Tixy</A> (Martin Kleppe): tiny programs as art, and proof that the constraint is the fun.</li>
          <li><A href="https://teenage.engineering/">Teenage Engineering</A>: hardware UI that treats every pixel as a decision.</li>
          <li>Split-flap boards (Solari di Udine) and <A href="https://github.com/scottbez1/splitflap">scottbez1/splitflap</A>: motion with mass.</li>
          <li>Robert Ulichney's void-and-cluster blue noise (1993) and NVIDIA's <A href="https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1/">spatiotemporal blue noise</A>: thresholds that don't shimmer.</li>
          <li><A href="https://iquilezles.org/articles/distfunctions2d/">Inigo Quilez's distance functions</A> and Karl Sims' <A href="https://www.karlsims.com/rd.html">reaction-diffusion tutorial</A>.</li>
          <li>Gabriel Lamé's superellipse (1818), and every designer who argued about squircles since.</li>
        </ul>
        <p className="outro">
          That's the tour. The rest of the site is the workshop: twenty-odd <a href="./">boards</a> of cards (try <a href="./departures/">Departures</a>,
          {' '}<a href="./levels/">Levels</a> and <a href="./lock/">Lock</a>), a <a href="./?make=code">code</a> mode for writing your own fields and sharing them as links,
          and a <a href="./?about">log</a> of what changed.
        </p>
      </section>
      <footer className="essay-foot">DOT/480 · FIELD → GRID SAMPLER → RENDERER · <span>NO GRADIENTS WERE HARMED</span><span><a href="/privacy">PRIVACY</a> · <a href="/terms">TERMS</a></span></footer>
    </main>
  )
}
