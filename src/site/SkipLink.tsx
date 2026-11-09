import './skip-link.css'

/** The first stop on the page (#187): past the header to the view. Focus moves, the address stays as it is. */
export function SkipLink() {
  'use no memo'
  return <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus() }}>SKIP TO CONTENT</a>
}
