/**
 * A markdown post (`docs/blog/<slug>.md`, read at build time through Vite `?raw`, one chunk per post) in the essay's
 * layout: the title and intro in the hero, a section per `##` with a dot title, live cards as the essay's figures,
 * code with COPY.
 */
import { Fragment, Suspense, use, useEffect, useState, type ReactNode } from 'react'
import { DotTitle } from '../essay/ui/DotTitle'
import { Figure } from '../essay/ui/Lazy'
import { copyText } from '../lib/copyText'
import { cardBody } from './LiveCard'
import { inline, parse, tex, type Block, type Inline, type ListBlock, type VisualKind } from './markdown'
import { POSTS, postPath, type PostInfo } from './posts'

const SOURCES = import.meta.glob<string>('../../docs/blog/*.md', { query: '?raw', import: 'default' })

const pad = (n: number) => String(n).padStart(2, '0')
/** A visual note's text as a caption: first letter up, a full stop at the end. */
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : s)
const words = (id: string) => id.replace(/-/g, ' ')

function link(href: string, children: ReactNode, text: string) {
  const md = /^([a-z0-9-]+)\.md(#.*)?$/.exec(href)
  if (md) {
    // another post: its page, named by its title when the link text was the file name
    const p = POSTS.find(x => x.slug === md[1])
    return <a href={postPath(md[1]) + (md[2] ?? '')}>{p && text === href ? p.title : children}</a>
  }
  return <a href={href} {...(/^https?:/.test(href) && { target: '_blank', rel: 'noreferrer' })}>{children}</a>
}
const plain = (c: Inline[]): string => c.map(x => ('s' in x ? x.s : plain(x.c))).join('')
function Maths({ src }: { src: string }) {
  return <>{tex(src).map((r, i) => (r.t === 'sup' ? <sup key={i}>{r.s}</sup> : r.t === 'sub' ? <sub key={i}>{r.s}</sub> : <Fragment key={i}>{r.s}</Fragment>))}</>
}
function Spans({ c }: { c: Inline[] }) {
  return <>{c.map((x, i) => {
    switch (x.t) {
      case 'text': return <Fragment key={i}>{x.s}</Fragment>
      case 'code': return <code key={i}>{x.s}</code>
      case 'math': return <span key={i} className="post-math-i"><Maths src={x.s} /></span>
      case 'b': return <b key={i}><Spans c={x.c} /></b>
      case 'i': return <em key={i}><Spans c={x.c} /></em>
      case 'a': return <Fragment key={i}>{link(x.href, <Spans c={x.c} />, plain(x.c))}</Fragment>
    }
  })}</>
}
function List({ b }: { b: ListBlock }) {
  const items = b.items.map((it, i) => <li key={i}><Spans c={it.c} />{it.sub && <List b={it.sub} />}</li>)
  return b.ordered ? <ol className="steps" start={b.start === 1 ? undefined : b.start}>{items}</ol> : <ul className="post-ul">{items}</ul>
}

/** A code snippet: monospace, scrolls sideways on its own, and a COPY button (the editor's clipboard helper, §8.4). */
function Code({ lang, text }: { lang: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = window.setTimeout(() => setState('idle'), 1800)
    return () => window.clearTimeout(t)
  }, [state])
  const copy = async () => setState(await copyText(text) ? 'copied' : 'failed')
  return (
    <div className="post-code">
      <div className="post-code-bar">
        <span>{lang ? lang.toUpperCase() : 'TEXT'}</span>
        <button type="button" onClick={copy} aria-live="polite">{state === 'copied' ? 'COPIED' : state === 'failed' ? 'SELECT TO COPY' : 'COPY'}</button>
      </div>
      <pre tabIndex={0}><code>{text}</code></pre>
    </div>
  )
}

const KIND: Record<VisualKind, string> = { card: 'CARD', diagram: 'DIAGRAM', steps: 'STEPS', interactive: 'INTERACTIVE' }
const showDrafts = typeof location !== 'undefined' && new URLSearchParams(location.search).has('drafts')
/**
 * A figure the post asks for that has no drawing yet: its kind, what it shows and its caption.
 * TODO(later): draw the real figures for the `diagram`, `steps` and `interactive` notes (figure components like
 * the essay's FigPipeline in src/essay/figures/), then map `what` to them here.
 */
function Placeholder({ kind, what, notice }: { kind: VisualKind; what: string; notice: string }) {
  return (
    <figure className="fig" id={`fig-${what}`} data-fig={what}>
      <div className="post-todo" role="img" aria-label={`${KIND[kind]}: ${words(what)}`}>
        <span className="post-todo-kind">{KIND[kind]}</span>
        <span className="post-todo-what">{words(what)}</span>
        <span className="post-todo-note">Drawing to come.</span>
      </div>
      <figcaption data-fig={what}>{sentence(notice)}</figcaption>
    </figure>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p><Spans c={b.c} /></p>
    case 'list': return <List b={b} />
    case 'code': return <Code lang={b.lang} text={b.text} />
    case 'math': return <p className="post-math" role="math" aria-label={b.tex}><Maths src={b.tex} /></p>
    // undrawn diagrams stay hidden from visitors until their figure exists (TODO(later) above); `?drafts` shows them
    case 'visual': return b.kind === 'card'
      ? <Figure id={b.what} body={cardBody(b.what)} minHeight={300} caption={sentence(b.notice)} />
      : showDrafts ? <Placeholder {...b} /> : null
    case 'h': {
      const Tag = b.level === 3 ? 'h3' : 'h4'
      return <Tag id={b.id} className={`post-h post-h--${b.level}`}><Spans c={inline(b.text)} /></Tag>
    }
  }
}

interface Section { id: string; title: string; blocks: Block[] }
/** The blocks under the title (the intro) and one section per `##`. */
function sections(blocks: Block[]): { title: string; intro: Block[]; secs: Section[] } {
  let title = '', cur: Block[] = []
  const intro = cur, secs: Section[] = []
  for (const b of blocks) {
    if (b.t === 'h' && b.level === 1) { title = b.text; continue }
    if (b.t === 'h' && b.level === 2) { const s: Section = { id: b.id, title: b.text, blocks: [] }; secs.push(s); cur = s.blocks; continue }
    cur.push(b)
  }
  return { title, intro, secs }
}

function Page({ post, md, top }: { post: PostInfo; md: string; top: ReactNode }) {
  const { title, intro, secs } = sections(parse(md))
  // a deep link to a section: the text arrives after first paint, so scroll once it is in
  useEffect(() => { if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView() }, [])
  return (
    <>
      <header className="hero">
        {top}
        <DotTitle text={title || post.title} level={1} max={14} smooth />
        {intro.map((b, k) => <BlockView key={k} b={b} />)}
        <nav className="toc" aria-label="Sections">
          <ol>{secs.map((s, k) => <li key={s.id}><a href={`#${s.id}`}><span>{pad(k + 1)}</span>{s.title}</a></li>)}</ol>
        </nav>
      </header>
      {secs.map((s, k) => (
        <section key={s.id} className="sec" id={s.id} aria-labelledby={`${s.id}-h`}>
          <DotTitle text={s.title} num={pad(k + 1)} id={`${s.id}-h`} />
          {s.blocks.map((b, j) => <BlockView key={j} b={b} />)}
        </section>
      ))}
    </>
  )
}

/** Each post's markdown chunk, fetched once (the same promise every render, so `use()` can suspend on it). */
const texts = new Map<string, Promise<string>>()
function textOf(slug: string): Promise<string> {
  let p = texts.get(slug)
  if (!p) { p = SOURCES[`../../docs/blog/${slug}.md`](); p.catch(() => texts.delete(slug)); texts.set(slug, p) }
  return p
}
const Loaded = ({ post, top }: { post: PostInfo; top: ReactNode }) => <Page post={post} md={use(textOf(post.slug))} top={top} />

export function Doc({ post, top }: { post: PostInfo; top: ReactNode }) {
  return <Suspense fallback={<header className="hero">{top}<div className="post-wait" aria-busy="true" /></header>}><Loaded post={post} top={top} /></Suspense>
}
