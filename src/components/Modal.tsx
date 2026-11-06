import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react'

/**
 * A modal `<dialog>` while mounted (#208): `showModal()` makes the page behind it inert, so focus stays inside with
 * no trap code, and Escape closes it (its `cancel` event calls `onClose`). Focus moves to the child marked
 * `data-autofocus` (else the browser's pick, the first focusable child) and goes back to the opener on unmount.
 * A press on the dialog itself, outside its content, closes it too: the dialog is the full-screen scrim, so its
 * own class styles it (the UA box is reset in src/site/app/chrome.css). Escape already closes it, so that press
 * is only a pointer shortcut.
 */
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    const opener = document.activeElement as HTMLElement | null
    if (!d.open) d.showModal()
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    const cancel = (e: Event) => { e.preventDefault(); close.current() }
    d.addEventListener('cancel', cancel)
    return () => { d.removeEventListener('cancel', cancel); if (d.open) d.close(); opener?.focus?.({ preventScroll: true }) }
  }, [])
  return ref
}

/** `scrim={false}`: a press on the dialog itself doesn't close it (a full-screen view with no scrim, like the game). */
export function Modal({ onClose, scrim = true, children, ...rest }: Omit<ComponentProps<'dialog'>, 'ref' | 'open' | 'onCancel'> & { onClose: () => void; scrim?: boolean }) {
  const ref = useModal(onClose)
  return <dialog ref={ref} {...rest} onPointerDown={scrim ? e => { if (e.target === e.currentTarget) onClose() } : undefined}>{children}</dialog>
}
