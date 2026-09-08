import { useEffect, useRef } from 'react'
export interface ConfirmationOptions { title?: string; confirmLabel?: string; cancelLabel?: string }

export function Confirmation({ message, options, finish }: { message: string; options: ConfirmationOptions; finish: (value: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const cancel = () => finish(false)
    window.addEventListener('popstate', cancel)
    return () => window.removeEventListener('popstate', cancel)
  }, [finish])
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" className="card w-full max-w-md p-6 shadow-xl"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); finish(false) }
        if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus() }
      }}>
      <h2 id="confirmation-title" className="text-xl font-semibold">{options.title ?? 'Confirmar acción'}</h2>
      <p id="confirmation-message" className="mt-3 text-sm leading-6 text-secondary">{message}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button ref={cancelRef} type="button" onClick={() => finish(false)} className="btn-secondary">{options.cancelLabel ?? 'Cancelar'}</button>
        <button ref={confirmRef} type="button" onClick={() => finish(true)} className="btn-primary">{options.confirmLabel ?? 'Continuar'}</button>
      </div>
    </section>
  </div>
}

