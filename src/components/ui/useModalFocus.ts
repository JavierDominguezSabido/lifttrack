import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Contains keyboard and programmatic focus, preserving the opener and inert state. */
export function useModalFocus(ref: RefObject<HTMLElement>, onClose: () => void, initialSelector = 'button') {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const background = new Map<HTMLElement, boolean>()
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          background.set(sibling, sibling.inert)
          sibling.inert = true
        }
      }
      if (branch.parentElement === document.body) break
      branch = branch.parentElement
    }
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
      .filter(element => element.getClientRects().length > 0 && !element.closest('[inert], [hidden]'))
    const focusInitial = () => (dialog.querySelector<HTMLElement>(initialSelector) ?? focusable()[0] ?? dialog).focus({ preventScroll: true })
    document.body.style.overflow = 'hidden'
    focusInitial()
    const onFocus = (event: FocusEvent) => { if (!dialog.contains(event.target as Node)) focusInitial() }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0], last = items[items.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('focusin', onFocus)
    dialog.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('focusin', onFocus)
      dialog.removeEventListener('keydown', onKey)
      background.forEach((inert, element) => { element.inert = inert })
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [ref, initialSelector])
}
