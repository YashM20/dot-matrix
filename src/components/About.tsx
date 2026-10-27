/**
 * ABOUT (UX U3, docs/UX-PLAN.md §4.1): what this is, the essay, shortcuts and URL params, and the visitor
 * changelog (the old LOG tab). A lazy chunk, like every view but EXPLORE.
 */
import { SHORTCUTS, URL_PARAMS, type Shortcut } from '../site/shortcuts'
import { Changelog } from './Changelog'

const Keys = ({ title, rows }: { title: string; rows: readonly Shortcut[] }) => <div className="about-keys">
  <h3>{title}</h3>
  <dl>{rows.map(r => <div key={r.keys}><dt><kbd>{r.keys}</kbd></dt><dd>{r.does}</dd></div>)}</dl>
</div>

export function About() {
  return <>
    <section className="about-intro" aria-labelledby="about-title">
      <p className="about-flavour" aria-hidden="true">CONFIGURATION 01 · STATUS: NOMINAL</p>
      <h2 id="about-title" className="log-title">DOT/480 — ABOUT</h2>
      <p className="about-lede">DOT/480 is an interface engine where everything you see is dots. Every card is a field, a function that
        says how bright each point is; a sampler reads it onto a quantized grid of dots, and a renderer (SVG, Canvas or
        WebGL) draws them, live. EXPLORE has the boards; MAKE lets you tune a preset, compose a card from layers,
        write a field program or paint dots by hand.</p>
      <p className="about-links"><a href="/essay.html">How it works: the essay →</a><a href="https://github.com/YashM20/dot-matrix">Source →</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></p>
      <div className="about-cols" id="shortcuts">
        <Keys title="KEYBOARD" rows={SHORTCUTS} />
        <Keys title="URL" rows={URL_PARAMS} />
      </div>
    </section>
    <Changelog />
  </>
}
