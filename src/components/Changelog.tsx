import { useId } from 'react'
import { releases, upcoming } from '../changelog'
import { useFlag } from '../site/useFlag'

export function Changelog() {
  const titleId = useId(), make = useFlag('make'), lab = useFlag('lab')
  // links into MAKE or the lab show only while their flag is on
  const shown = (href: string) => (make || !href.includes('make')) && (lab || !href.startsWith('/lab/'))
  return (
    <section className="log-view" aria-labelledby={titleId}>
      <h2 className="log-title" id={titleId}>MATRIX · CHANGELOG</h2>
      <ol className="log-list">
        {releases.map(r => (
          <li key={r.version} className="log-release">
            <div className="log-meta"><b>v{r.version}</b><time dateTime={r.date}>{r.date}</time></div>
            <div className="log-body">
              <h3>{r.title}</h3>
              <p className="log-summary">{r.summary}</p>
              <ul>
                {r.changes.map((c, i) => <li key={i}><span className={`log-kind log-kind--${c.kind}`}>{c.kind}</span>{c.text}</li>)}
              </ul>
              {r.link && shown(r.link.href) && <a className="log-link" href={r.link.href}>{r.link.label} →</a>}
            </div>
          </li>
        ))}
      </ol>
      <h2 className="log-title log-title--next">COMING UP</h2>
      <ol className="log-next">
        {upcoming.map(u => (
          <li key={u.phase}>
            <span className="log-phase">PHASE {u.phase}</span>
            <b>{u.title}</b>
            <span className={`log-status${u.status === 'in progress' ? ' log-status--live' : ''}`}>{u.status}</span>
            <p>{u.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
