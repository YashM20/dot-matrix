/**
 * The blog (GitHub #77, #12): `/blog/` lists every post, `/blog/<slug>/` is one post. Every post uses the essay's
 * shell: its `<main className="essay">` measure, type and theme, the site nav, the post line, the hero image (when
 * `public/og/blog/<slug>-hero.png` exists: `scripts/og-blog.ts` draws it), "More posts" and the footer. The essay keeps
 * its own TSX page and figures (`src/essay/Essay.tsx`); the tutorials are markdown (`docs/blog/*.md`, `./Doc.tsx`).
 */
import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import meta from 'virtual:blog-meta'
import { DotTitle } from '../essay/ui/DotTitle'
import { SiteFoot, SiteNav } from '../essay/ui/SiteNav'
import { cardBody } from './LiveCard'
import { BLOG, heroImage, POSTS, postFromPath, postPath, type PostInfo } from './posts'

const pad = (n: number) => String(n).padStart(2, '0')
/** Reading time at about 220 words a minute (word counts from the build, `virtual:blog-meta`). */
const minutes = (slug: string) => Math.max(1, Math.round((meta.words[slug] ?? 0) / 220))

const Foot = () => <SiteFoot name="BLOG" />

/** The post's meta line: where it sits in the blog, who it is for and how long it takes. */
function PostLine({ post }: { post: PostInfo }) {
  const i = POSTS.indexOf(post)
  return (
    <p className="post-line">
      <a href="/blog/">BLOG</a> · {pad(i + 1)} OF {pad(POSTS.length)}{post.reader && <> · FOR {post.reader.toUpperCase()}</>} · {minutes(post.slug)} MIN READ
    </p>
  )
}
/** The page's hero image, once it exists (until then the post opens on its title and first figure). It is the top of the page, so it loads first. */
function Hero({ slug }: { slug: string }) {
  const h = meta.heroes[slug]
  if (h === undefined) return null
  return <img className="post-hero" src={heroImage(slug)} alt={h.alt} width={h.w} height={h.h} loading="eager" fetchPriority="high" decoding="async" />
}

/** Each post ends with the others. */
function MorePosts({ current }: { current: PostInfo }) {
  return (
    <nav className="more-posts" aria-labelledby="more-posts-h">
      <h2 id="more-posts-h">MORE POSTS</h2>
      <ul>
        {POSTS.filter(p => p !== current).map(p => (
          <li key={p.slug}><a href={postPath(p.slug)}>{p.title}</a><span>{p.dek}</span></li>
        ))}
      </ul>
      <a className="more-posts-all" href="/blog/">All posts →</a>
    </nav>
  )
}

type Body = ComponentType<{ post: PostInfo; top: ReactNode }>
// the essay and the markdown posts are their own chunks; a post fetches only its own
const EssayBody = lazy(() => import('../essay/Essay').then(m => ({ default: (({ top }) => <m.Essay nav={top} />) as Body })))
const DocBody = lazy(() => import('./Doc').then(m => ({ default: m.Doc as Body })))

function PostPage({ post }: { post: PostInfo }) {
  const top = <><SiteNav /><PostLine post={post} /><Hero slug={post.slug} /></>
  const Body = post.kind === 'essay' ? EssayBody : DocBody
  return (
    <main className="essay post">
      <Suspense fallback={<header className="hero">{top}<div className="post-wait" aria-busy="true" /></header>}><Body post={post} top={top} /></Suspense>
      <MorePosts current={post} />
      <Foot />
    </main>
  )
}

function BlogIndex() {
  return (
    <main className="essay blog">
      <header className="hero">
        <SiteNav here="blog" />
        <Hero slug={BLOG.slug} />
        <DotTitle text="Blog" level={1} max={10} smooth />
        <p className="lede">
          Long reads on how the Dot/480 engine draws interfaces in dots. The essay is the tour of the whole engine. The three tutorials each
          follow one small build from the first field to a working card, with code you can copy and run.
        </p>
      </header>
      <ol className="post-list">
        {POSTS.map((p, i) => {
          const Thumb = cardBody(p.thumb)
          return (
            <li key={p.slug} className="post-tile">
              {/* the thumbnail is a picture of the post: the tile is its link, so a live card takes no input */}
              <div className="post-thumb" inert>
                <Suspense fallback={<div className="post-thumb-wait" />}><Thumb /></Suspense>
              </div>
              <div className="post-meta">
                <span className="post-num">{pad(i + 1)}{p.reader && <> · FOR {p.reader.toUpperCase()}</>} · {minutes(p.slug)} MIN</span>
                <h2><a href={postPath(p.slug)}>{p.title}</a></h2>
                <p>{p.dek}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <Foot />
    </main>
  )
}

export function Blog() {
  const post = postFromPath(location.pathname)
  useEffect(() => { document.title = post ? `${post.title} · Matrix blog` : BLOG.title }, [post])
  return post ? <PostPage post={post} /> : <BlogIndex />
}
