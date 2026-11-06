/**
 * The credit for Henry Li's ESP-Mosaico concept screens, where the project started (`conceptCredit` in
 * src/widgets/blurbs.ts). The board heading shows the line on the seven boards that rebuild his sheets, a widget page
 * from those boards shows it for its one card, and ABOUT shows `full`. The data stays in the lazy blurbs chunk, and the caller passes it in.
 */
type Credit = typeof import('../widgets/blurbs').conceptCredit

const Out = ({ href, label, children }: { href: string; label?: string; children: string }) =>
  <a href={href} target="_blank" rel="noopener" aria-label={label}>{children}</a>

/** Who, where and both posts, as a sentence fragment that follows the caller's lead-in. */
function Sources({ credit }: { credit: Credit }) {
  return <>
    <Out href={credit.profile}>{credit.by}</Out> ({credit.handle}), posted on X on 20 Aug 2026:{' '}
    <Out href={credit.posts[0]} label={`${credit.by} on X, first post`}>first post</Out>,{' '}
    <Out href={credit.posts[1]} label={`${credit.by} on X, second post`}>second post</Out>.
  </>
}

/** `full` on ABOUT, `card` on a widget page (one card of those boards), else the board heading's line. */
export function ConceptCredit({ credit, full = false, card = false }: { credit: Credit; full?: boolean; card?: boolean }) {
  return full
    ? <p className="concept-credit">This project started from the ESP-Mosaico concept screens for a 480 × 480 OLED device
        by <Sources credit={credit} /> The first seven boards rebuild his sheets, and the 480 in Dot/480 is his screen.</p>
    : <p className="concept-credit">{card ? 'This card rebuilds' : 'These cards rebuild'} the ESP-Mosaico concept screens by <Sources credit={credit} /></p>
}
