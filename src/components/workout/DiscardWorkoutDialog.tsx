import { useRef } from 'react'
import { useModalFocus } from '../ui/useModalFocus'
import { createPortal } from 'react-dom'

export function DiscardWorkoutDialog({ onCancel, onConfirm }: {
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useModalFocus(dialogRef, onCancel)

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-workout-title"
        aria-describedby="discard-workout-description"
        className="card w-full max-w-md p-5 sm:p-6"
      >
        <h2 id="discard-workout-title" className="text-xl font-extrabold">¿Descartar entrenamiento?</h2>
        <p id="discard-workout-description" className="mt-3 text-sm leading-6 text-secondary">
          Se descartará el borrador del entrenamiento en curso y sus cambios sin guardar.
          Los entrenamientos que ya hayas guardado se conservarán.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={onConfirm} className="btn-secondary !border-danger/30 !bg-danger-soft !text-danger-text">Descartar entrenamiento</button>
        </div>
      </section>
    </div>,
    document.body
  )
}
