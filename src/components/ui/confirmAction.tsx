import { createRoot } from 'react-dom/client'
import { Confirmation, type ConfirmationOptions } from './Confirmation'

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
