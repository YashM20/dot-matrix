import { useId } from 'react'
import { releases, upcoming } from '../changelog'

export function Changelog() {
  const titleId = useId()
  return (
    <section className="log-view" aria-labelledby={titleId}>
      <h2 className="log-title" id={titleId}>DOT/480 — CHANGELOG</h2>
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
              {r.link && <a className="log-link" href={r.link.href}>{r.link.label} →</a>}
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
