// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WeightInput } from './WeightInput'

function Fixture({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(62.5)
  return <WeightInput aria-label="Peso" value={value} onChange={next => { onChange(next); setValue(next) }} />
}

afterEach(cleanup)

it('muestra coma decimal, acepta coma y punto y no convierte un campo vacío en 0', () => {
  const onChange = vi.fn()
  render(<Fixture onChange={onChange} />)
  const input = screen.getByRole('textbox', { name: 'Peso' }) as HTMLInputElement
  expect(input.value).toBe('62,5')
  expect(input.getAttribute('inputmode')).toBe('decimal')

  fireEvent.change(input, { target: { value: '' } })
  expect(input.value).toBe('')
  fireEvent.change(input, { target: { value: ',' } })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.blur(input)
  expect(input.value).toBe('62,5')

  fireEvent.change(input, { target: { value: '22,' } })
  expect(input.value).toBe('22,')
  fireEvent.change(input, { target: { value: '22,5' } })
  expect(onChange).toHaveBeenLastCalledWith(22.5)
  fireEvent.change(input, { target: { value: '1.25' } })
  expect(onChange).toHaveBeenLastCalledWith(1.25)
  fireEvent.change(input, { target: { value: '1.2a' } })
  expect(input.value).toBe('1.25')
  fireEvent.blur(input)
  expect(input.value).toBe('1,25')
})
