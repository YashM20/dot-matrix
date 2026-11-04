/**
 * The analytics consent banner (#151): plain DOM, so the app, the blog and the lab share it, in its own lazy chunk
 * with its CSS. Two equal buttons, neither focused or highlighted. It sits in the bottom corner, and a spacer of
 * its height at the end of the page lets every card scroll clear of it. It shows until the visitor picks.
 */
import './banner.css'

export function showBanner(choose: (on: boolean) => void): () => void {
  const box = document.createElement('section'), space = document.createElement('div')
  box.className = 'consent'
  box.setAttribute('aria-label', 'Analytics')
  box.innerHTML = '<p class="consent-head">ANALYTICS</p>'
    + '<p class="consent-text">With your OK, this site counts page views and the buttons you press, through PostHog. '
    + 'It never sends what you type, and it sets no cookies. <a href="/privacy">More on the privacy page</a>.</p>'
    + '<div class="consent-actions"><button type="button" data-on="1">ALLOW</button><button type="button" data-on="0">NO THANKS</button></div>'
  space.className = 'consent-space'
  space.setAttribute('aria-hidden', 'true')
  const fit = () => { space.style.height = `${box.offsetHeight + 16}px` }
  const close = () => { box.remove(); space.remove(); removeEventListener('resize', fit) }
  box.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-on]')
    if (b) { close(); choose(b.dataset.on === '1') }
  })
  document.body.append(space, box)
  fit()
  addEventListener('resize', fit)
  return close
}
