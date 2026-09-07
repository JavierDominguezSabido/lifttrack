import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

interface ConfirmationOptions { title?: string; confirmLabel?: string; cancelLabel?: string }

function Confirmation({ message, options, finish }: { message: string; options: ConfirmationOptions; finish: (value: boolean) => void }) {
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

/** Confirmación de UI; la operación se ejecuta en el llamador, como antes. */
export function confirmAction(message: string, options: ConfirmationOptions = {}): Promise<boolean> {
  const host = document.createElement('div')
  const previousFocus = document.activeElement as HTMLElement | null
  const app = document.getElementById('root')
  const wasInert = app?.inert ?? false
  const overflow = document.body.style.overflow
  if (app) app.inert = true
  document.body.style.overflow = 'hidden'
  document.body.append(host)
  const root = createRoot(host)
  return new Promise(resolve => {
    let finished = false
    const finish = (result: boolean) => {
      if (finished) return
      finished = true
      root.unmount(); host.remove()
      if (app) app.inert = wasInert
      document.body.style.overflow = overflow
      previousFocus?.focus()
      resolve(result)
    }
    root.render(<Confirmation message={message} options={options} finish={finish} />)
  })
}
