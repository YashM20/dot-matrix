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
          Notes from building a dot-matrix renderer for interfaces. It started as a hobby and kept growing. A field goes in and is sampled onto a grid.
          Each sample is rounded to one of a few dot sizes, and the result comes out grey with one red. Every figure on this page is the real engine running in your browser,
          so poke at them. Nothing here is for sale.
        </p>
        <nav className="toc" aria-label="Sections">
          <ol>{TOC.map(([id, name], i) => <li key={id}><a href={`#${id}`}><span>{String(i + 1).padStart(2, '0')}</span>{name}</a></li>)}</ol>
        </nav>
      </header>

      <Sec id="why" num="01" title="Why dots">
        <p>
          Most interfaces today are smooth. Surfaces use gradients, corners use many radii, and each state gets its own colour. It looks fine, and every app looks alike.
          A dot matrix gives you much less: a fixed grid of lights, a few brightness levels and one colour that means something. Nothing else is allowed.
        </p>
        <p>
          That sounds limiting, and it helps. A hard limit makes decisions for you. You don't choose a font weight, because there isn't one.
          You don't pick a shadow, because a dot can't cast one. You are left with composition, tone and timing, and that is where the design work was anyway. Train departure boards, VFD clocks,
          the <A href="https://teenage.engineering/">Teenage Engineering</A> OP-1 screen and the LED panels on the backs of phones all stick in memory. Each one had very little to work with and used it well.
        </p>
        <p>
          Dot/480 gives ordinary interface widgets (clocks, sliders, timers, status cards) that look, and I never draw one by hand.
          The method fits in one line: <em>every dot is a sample of a function.</em>
          Below is a lit sphere. It is a function of two numbers. The slider sets how many times we ask that function for a value.
        </p>
        <Figure id="resolution" body={fig.resolution} minHeight={420} caption={<>Drag the slider. The field has no resolution of its own. At 8×8 it is a blob of light. At 24×24 it is a sphere. Past 48 it starts to look like a photo and stops looking like dots. Most Dot/480 cards sit between 25 and 144 dots a side.</>} />
        <p>
          It reads best in the middle: few enough dots that you can see each one, and enough that the shape survives. The whole look lives in that range.
          The rest of this essay is about staying inside it.
        </p>
      </Sec>

      <Sec id="pipeline" num="02" title="Field → sampler → renderer">
        <p>
          Every visual in Dot/480 goes through the same three stages, from a clock digit to a webcam frame. There is no fourth stage.
        </p>
        <ol className="steps">
          <li><b>Field.</b> A pure function <C>f(u, v) → 0..1</C> over the unit square. Text is a field (glyph pixels), a ring is a field (distance to a circle), a photo is a field (luma lookup).</li>
          <li><b>Grid sampler.</b> Asks the field for one value at each cell centre. It rounds that value to one of a few dot sizes and opacities, and picks a tone.</li>
          <li><b>Renderer.</b> Turns dots into SVG or Canvas. Sparse, still cards use SVG, so you can copy and paste them. Cards past about 2,000 dots, or cards that move, use Canvas.</li>
        </ol>
        <p>
          The left panel samples the field so finely, with no rounding, that it looks smooth. The right panel samples the same function at a pitch you choose.
          Drag the blob in either one. Then lower the pitch. Detail goes in a fixed order: thin necks first, then soft edges, then whole lobes.
        </p>
        <Figure id="pipeline" body={fig.pipeline} minHeight={440} caption={<>Three metaballs; your pointer moves one. The same field, sampled two ways. The arrow keys move the blob too.</>} />
        <p>
          This gets you three things. First, density is one number. The same card renders at 25×25 on an LED panel or at 144×144 on a retina screen, and nobody redraws it.
          Second, effects are maths on the field. A mask, a light or a spring is a function of the field, so it needs no new code path. Third, a card is a pure function of its inputs
          (<C>t</C>, <C>data</C>, the pointer). It renders the same in a browser, a test, a worker or on a device. Snapshots never change between runs, so golden-image tests work.
        </p>
      </Sec>

      <Sec id="quantize" num="03" title="Quantization and the squircle">
        <p>
          The sampler throws away detail in one place, on purpose: it rounds. A field value of 0.63 becomes one of five dot sizes (<C>quantizeSteps: 5</C>). With five steps, a smooth gradient turns into
          visible terraces, and those terraces are the look. Turn rounding off and the card looks like a cheap photo filter. Set it to two and you have a 1-bit LCD.
        </p>
        <p>
          The second number is the shape of the dot. Dot/480 has no shape presets. A dot is a superellipse, <C>|x|ⁿ + |y|ⁿ = 1</C>, and one roundness knob <C>r</C> sets the exponent:
          {' '}<C>n = 2 + 30r²</C>. At <C>r = 0</C> you get a circle (n = 2). At 0.25, the default, you get a soft squircle (n ≈ 3.9). At 1 you get a near-square (n = 32).
          Because <C>r</C> is squared, most of the slider stays near the round end, where the eye notices small changes most.
        </p>
        <Figure id="quantize" body={fig.quantize} minHeight={300} caption={<>A ramp with a bump on it. The step count sets how many dot sizes exist. Roundness sets the shape of each dot. Both are continuous, so you never need a new preset.</>} />
        <p>
          One continuous knob beats presets, because presets multiply. "Rounded", "pill" and "square" become a design-system argument. An exponent slides smoothly between them. Card corners use the same
          curve at a larger size, so the card frame and its dots always match.
        </p>
      </Sec>

      <Sec id="lattice" num="04" title="Lattices and sites">
        <p>
          Most dot-matrix toys make the same mistake. They need a big number, so they scale the 5×7 font by four, and each font pixel becomes a 4×4 clump of small dots.
          The clumps look like a mosaic. A real panel shows a big numeral with <em>bigger lights</em>, spaced further apart.
        </p>
        <p>
          So in Dot/480 every layer can sit on its own <C>lattice</C>: a coarser grid whose dots are <C>k</C>× further apart and <C>k</C>× larger than the card's. A big numeral on lattice 2.5 is
          a few dozen big dots, one per font pixel. Curves use <C>sites</C> the same way. A ring is a set of dot centres spaced evenly along the circle. Cutting a ring shape out of the
          square grid would leave jagged stairs where the circle crosses each row.
        </p>
        <Figure id="lattice" body={fig.lattice} minHeight={300} caption={<>Toggle between the two. The "42" and the ring stay the same; only the dot placement changes. The clusters look like a scaled-up bitmap. The lattice looks like hardware.</>} />
        <p>
          So the rule is: <strong>bigger elements use a coarser lattice or dot sites, never clusters of small dots.</strong> A card mixes pitches like a real control
          panel: tiny dots for labels and ticks, big dots for the one number that matters.
        </p>
      </Sec>

      <Sec id="accent" num="05" title="One accent">
        <p>
          Dot/480 has one colour, Signal Red <C>#FF3B30</C>. Everything else is four greys on near-black. Red marks the one thing a card is about:
          something <em>live</em> (recording, boarding), something <em>hot</em> (a thermal body, an urgent timer) or the <em>primary</em> series in a chart. Hover and focus never use it.
          If you can't say why a dot is red, make it grey.
        </p>
        <p>
          The three cards below are a progress bar, a live status dot and a pair of sliders. The lower slider is a live level. Flip the switch to give the sliders their own accent.
        </p>
        <Figure id="accent" body={fig.accent} minHeight={300} caption={<>With one red, your eye goes to the live state first. With two colours, your eye has two places to go and settles on neither, and the slider in the second colour looks like an ad. (That second colour exists only in this figure: blue, or red when the theme's accent is blue.)</>} />
        <p>
          Red means something because there is so little of it. If every card got its own accent, every board would be a rainbow. So the limit is one red per board.
          On the heartbeat board below, one card pulses in white where it could be red, because another card on that board already uses red.
        </p>
      </Sec>

      <Sec id="motion" num="06" title="Motion">
        <p>
          On a real dot display, dots switch on and off and change size, and now and then a whole panel flips. Nothing slides between positions. So motion in Dot/480 uses the same moves:
          masks, flaps and springs. Each one is a function of time, worked out per dot.
        </p>
        <p>
          <b>Masks.</b> An entrance is a threshold map. Every cell gets a number from 0 to 1, and its dot appears once progress passes that number. A Bayer matrix gives the classic ordered dissolve.
          Interleaved gradient noise looks less like a grid. A radial or curtain mask sweeps the same reveal across the card. Exits run the mask backwards, and an update dissolves the old frame into the new one.
        </p>
        <Figure id="masks" body={fig.masks} minHeight={380} caption={<>Pick a mask to replay the platform card's entrance. The card and its 900 ms timing stay the same; only the mask changes.</>} />
        <p>
          <b>Split-flap.</b> The Departures board is modelled on the <A href="https://en.wikipedia.org/wiki/Split-flap_display">Solari boards</A> and on
          Scott Bezek's open-source <A href="https://github.com/scottbez1/splitflap">splitflap</A> hardware. Each character cell flips through the alphabet to its target, folding about its middle.
          The rows update from top to bottom. The station clock's red second hand sweeps the dial in 58.5 seconds, then waits at twelve for the minute to tick, like the Swiss railway clock it copies.
        </p>
        <Figure id="departures" body={fig.departures} minHeight={300} caption={<>The Departures board, live. Everything on it is a pure function of the board clock, so a snapshot at <C>t = 12.5 s</C> always gives the same frame.</>} />
        <p>
          <b>Springs.</b> When data changes, the value moves on a critically damped spring (half-life 0.12 s). Every frame it snaps to the nearest cell, so a knob's dot never sits between two
          positions. Releasing a press uses an under-damped spring, which overshoots once. You can feel both in the next section.
        </p>
      </Sec>

      <Sec id="interaction" num="07" title="Interaction">
        <p>
          In Dot/480, interaction is state in the card's data, and the card draws it in dots. A card declares its controls (a knob, a slider, an XY pad), each a box in cell space.
          The input layer turns pointer, touch, wheel and keyboard events into changes to <C>data</C>, and puts <C>hover</C>, <C>pressed</C> and <C>focus</C> into the frame context.
          The card then redraws through the same pipeline. Hover is a soft pool of white light, never red. A press shrinks the dot by one quantize step.
          Focus is a ring of marching dots, three on and two off.
        </p>
        <Figure id="instrument" body={fig.instrument} minHeight={300} caption={<>Instrument knobs, live. Drag in a circle, scroll, or Tab to one and use the arrow keys. Each detent is one whole lattice step. Each card also has a real, invisible control on top for screen readers.</>} />
        <p>
          Two rules keep it on the grid. <strong>Drags move by whole dot columns</strong>: a value moves one column at a time, so the thumb always sits on dots.
          {' '}<strong>Hit areas grow, dots don't</strong>: a tiny target gets invisible padding up to 24 px (44 px on touch), so accessibility never changes the picture.
        </p>
      </Sec>

      <Sec id="light" num="08" title="Light and material">
        <p>
          Light is a field too. A shape becomes a signed distance, the distance becomes a height map, and the height map gives normals. All of that is computed once and cached.
          Each frame, only the light moves. Lambert shading lights the body and Phong adds the highlight, and both are rounded into tone bands. A highlight is drawn two quantize steps
          above the dot under it. That is how a dot display shows gloss.
        </p>
        <p>
          A material is a rule about which dots to draw. Matte splits the Lambert shading into three grey bands. Glass shifts what's behind it along the normal, by whole cells. Fabric dithers
          between neighbouring dot sizes with a 4×4 Bayer matrix. Emissive draws the shape plus a dim halo, with a one-dot gap between them. None of them adds a colour.
        </p>
        <Figure id="light" body={fig.light} minHeight={340} caption={<>Left: the torch card. Your pointer is a point light over a domed power button. Move it away and the light drifts on its own. Right: the level-03 corridor with the lights off.</>} />
        <Moment n={5}><b>Torch in the Dark.</b> The right-hand card is level-03, one of the favourite reference cards, with its lights off. Your cursor is the only light in the hall.
          It fades with the square of the distance over the corridor's own tones. Dust shows only where the torch reaches. One red invader at the end of the hall glows on its own.</Moment>
      </Sec>

      <Sec id="sim" num="09" title="Simulation">
        <p>
          Some fields have state: sand that piles up, chemicals that spread. Dot/480 treats a simulation as a field with memory. It steps at a fixed rate, gives the same result from the
          same seed, and can rewind to any step, so a snapshot at <C>t</C> is still a pure function of <C>t</C>. Falling sand and Game of Life are cellular automata on the card grid.
          The coral is a <A href="https://www.karlsims.com/rd.html">Gray-Scott reaction-diffusion</A> system on a coarser lattice, which keeps each step cheap and the dots big.
        </p>
        <Figure id="sim" body={fig.sim} minHeight={300} caption={<>Left: the Hourglass clock from the Lock board. Middle: falling sand. Right: reaction-diffusion. On a phone, tilt it to tip the hourglass stream.</>} />
        <Moment n={1}><b>The Hourglass Clock.</b> Each minute, the digits that change drain off the card, bottom rows first. New grains pour in and settle into the next time. The colon then becomes the
          neck of the glass: one grain a second falls through it onto a heap of sixty. The grains fall in whole lattice steps under real gravity. The heap forms a cone because every grain lands on the two below it.</Moment>
      </Sec>

      <Sec id="halftone" num="10" title="Halftone and temporal stability">
        <p>
          Photos are the one place Dot/480 skips quantization, because in a photo the tone is the content. Photos go through a halftone ladder with two steps. Step one is an ordered multi-level threshold.
          Step two follows the image's structure. An edge-preserving filter removes sensor noise from flat areas, local contrast goes up where the image is flat, and dithering turns off on edges.
          A jawline becomes a clean contour, and a cheek stays smoothly dithered. <A href="https://surma.dev/things/ditherpunk/">Surma's Ditherpunk</A> starts from this problem, and this essay borrows its name.
        </p>
        <p>
          With video, the picture also changes over <em>time</em>. Threshold a webcam frame with fresh noise each frame, and every dot near an edge flips 30 times a second. The picture
          shimmers like a shower door, even when nothing moves. The fix has two parts. First, use <A href="https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1/">spatiotemporal blue noise</A> (STBN),
          which spreads thresholds evenly in space and across frames. Second, give every cell a memory. It keeps its threshold slice until its input really changes, and it only switches level once
          the input clears the boundary by a margin (hysteresis). A still scene then holds one fixed blue-noise pattern, and only moving areas get fresh thresholds.
        </p>
        <Figure id="flicker" body={fig.flicker} minHeight={300} caption={<>One still portrait with new sensor noise every frame, halftoned three ways. The number under each panel is how many dots changed since the last frame. Raise the noise and compare.</>} />
        <p>
          On a still scene, the engine's own test allows at most 10% of the dot changes that plain thresholding makes per frame. The real number is far lower. That is why a
          webcam mirror can sit on a dashboard without making anyone seasick.
        </p>
        <Figure id="mirror" body={fig.mirror} minHeight={340} caption={<>Left: drag across the portrait to scratch it. Right: the two ladder steps side by side on the same noisy portrait.</>} />
        <Moment n={2}><b>The Mirror that Heals.</b> The mirror shows the step-2 halftone of a portrait built from fields. On the mirror board, with your camera on, it shows you. Scratch it and the damage
          grows back from its edges inward. A cell heals faster when more of its neighbours are whole. The scar closes as a front of faint, flickering dots and ends on the exact original halftone, dot for dot.</Moment>
      </Sec>

      <Sec id="ir" num="11" title="Field IR">
        <p>
          A card is a pure function, so it can also be data. Field IR (<C>dot</C>) is a tiny expression language for fields. It has <C>u</C>, <C>v</C>, <C>t</C>, the pointer, <C>data.*</C>,
          {' '}<C>let</C> and bounded <C>for</C> folds, and about twenty built-ins that each map to one GLSL function. Every loop has a bound, and there are no closures and no host access.
          A program can only compute numbers, and its size and work are capped before it runs. The same source compiles to a JS closure for the CPU and to GLSL for the GPU.
          It also saves as JSON, so an agent can write it and a device can run it.
        </p>
        <p>
          The idea comes from <A href="https://www.dwitter.net/">Dwitter</A> (a demo in 140 characters) and <A href="https://tixy.land/">Tixy</A> (a 16×16 grid driven by one
          expression of <C>t, i, x, y</C>). Edit the program below. If you make a mistake, you see the error, and the card keeps running the last program that worked.
        </p>
        <Figure id="ir" body={fig.ir} minHeight={420} caption={<>Your program on a 3× lattice. "Open in MAKE · CODE" opens it in the editor as a share link, compressed into the URL, with a scrubber, data sliders and a remix graph.</>} />
      </Sec>

      <Sec id="surfaces" num="12" title="One field, five surfaces">
        <p>
          The figure below runs one timer on five displays. A <C>DeviceProfile</C> describes a physical display: its grid, its mask, how many levels a pixel has, its gamma and its physics.
          {' '}<C>toDevice</C> samples the card onto that grid. Tiny grids get a hand-tuned version of the layout, because resampling 5×7 text onto 25×25 turns it to mush. Bigger grids
          are resampled by area. Then each device's simulator adds what the hardware does: LED bloom, e-ink ghosting and its full-refresh flash, a flip-disc's column scan and the overshoot of a
          real disc with inertia, and a pen plotter's travel between strokes.
        </p>
        <Figure id="surfaces" body={fig.surfaces} wide minHeight={240} caption={<>One 60-second timer on a browser card, a 25×25 round LED matrix, an 800×480 1-bit e-ink panel, a 28×14 flip-disc sign and a pen plotter, on one board clock (synced across tabs).</>} />
        <Moment n={3}><b>One Field, Five Surfaces.</b> Nobody redrew anything for these screens. The red arc on the browser card becomes full-brightness light on the one-colour devices, because
          they can't show red. The simulators copy what each panel really does: the e-ink ghosts until its tenth refresh flashes it clean, and the discs overshoot before they settle.</Moment>
      </Sec>

      <Sec id="agents" num="13" title="Agents">
        <p>
          A coding agent in a terminal has five states (thinking, running a tool, waiting for you, failed, done). It shows them as a spinner and a sentence.
          This last experiment gives it a body. The heartbeat is a lobed metaball creature with one behaviour per state. Whatever drives it writes one number, <C>data.state</C>, and never draws.
          The card springs between states in about 0.4 s. It breathes slowly while thinking, a comet circles while a tool runs, and it pulses lub-dub in red only when it needs <em>you</em>.
        </p>
        <Figure id="agents" body={fig.agents} minHeight={300} caption={<>Switch the state an agent would write. Right: the same card resampled onto a phone's 25×25 back-panel LED matrix, so you can read the heartbeat with the phone face-down on a desk.</>} />
        <Moment n={4}><b>Agent Heartbeat.</b> A card is a pure function of <C>t</C> and <C>data</C>, so anything can write the data. In the repo, the same card also runs as an
          {' '}<A href="https://github.com/modelcontextprotocol/ext-apps">MCP App</A> inside a chat window, where the agent sets its state. <C>describe()</C> turns any card back into text, so a model
          can check what it drew. None of this needed new rendering code. The phone back on the right is the same card resampled, and the chat version is the same card in an iframe.</Moment>
      </Sec>

      <section className="sec" id="credits" aria-labelledby="credits-h">
        <DotTitle text="Prior art" num="14" id="credits-h" />
        <p>Every piece here existed before. Dot/480 puts them in one pipeline.</p>
        <ul className="credits">
          <li><A href="https://surma.dev/things/ditherpunk/">Ditherpunk</A>, Surma (2021): the essay that made dithering popular, and the reason this one exists. Its title is borrowed with thanks.</li>
          <li><A href="https://worrydream.com/ExplorableExplanations/">Explorable Explanations</A>, Bret Victor: the idea that a reader should be able to touch the argument.</li>
          <li><A href="https://www.dwitter.net/">Dwitter</A> and <A href="https://tixy.land/">Tixy</A> (Martin Kleppe): tiny programs as art, where the limit is the fun part.</li>
          <li><A href="https://teenage.engineering/">Teenage Engineering</A>: hardware UI where every pixel is chosen on purpose.</li>
          <li>Split-flap boards (Solari di Udine) and <A href="https://github.com/scottbez1/splitflap">scottbez1/splitflap</A>: motion with real weight.</li>
          <li>Robert Ulichney's void-and-cluster blue noise (1993) and NVIDIA's <A href="https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1/">spatiotemporal blue noise</A>: thresholds that don't shimmer.</li>
          <li><A href="https://iquilezles.org/articles/distfunctions2d/">Inigo Quilez's distance functions</A> and Karl Sims' <A href="https://www.karlsims.com/rd.html">reaction-diffusion tutorial</A>.</li>
          <li>Gabriel Lamé's superellipse (1818), and every designer who argued about squircles since.</li>
        </ul>
        <p className="outro">
          That's the tour. The rest of the site has twenty-odd <a href="./">boards</a> of cards (try <a href="./departures/">Departures</a>,
          {' '}<a href="./levels/">Levels</a> and <a href="./lock/">Lock</a>), a <a href="./?make=code">code</a> mode where you write your own fields and share them as links,
          and a <a href="./?about">log</a> of what changed.
        </p>
      </section>
      <footer className="essay-foot">DOT/480 · FIELD → GRID SAMPLER → RENDERER · <span>NO GRADIENTS WERE HARMED</span><span><a href="/privacy">PRIVACY</a> · <a href="/terms">TERMS</a></span></footer>
    </main>
  )
}
