import { useState, type InputHTMLAttributes } from 'react'
import { formatWeight } from '../../utils/workout'

type WeightInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number
  onChange: (value: number) => void
}

/** Teclado decimal con coma o punto; vaciar el campo no convierte el peso en 0. */
export function WeightInput({ value, onChange, onBlur, ...props }: WeightInputProps) {
  // El texto tecleado solo se muestra mientras corresponde al peso actual.
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null)

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft && draft.value === value ? draft.text : formatWeight(value)}
      onChange={(event) => {
        const text = event.target.value.trim()
        if (!/^\d*[.,]?\d*$/.test(text)) return
        const parsed = Number(text.replace(',', '.'))
        const complete = /\d/.test(text) && Number.isFinite(parsed)
        setDraft({ text, value: complete ? parsed : value })
        if (complete) onChange(parsed)
      }}
      onBlur={(event) => {
        setDraft(null)
        onBlur?.(event)
      }}
    />
  )
}
