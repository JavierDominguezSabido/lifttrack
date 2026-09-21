// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ExerciseLogger } from './ExerciseLogger'
import type { DraftExerciseLog, LastExercisePerformance } from '../../types'

const template = {
  id: 'tp', templateId: 'day', exerciseId: 'press', order: 1,
  targetSets: 3, targetReps: '8', restSeconds: 90
}
const exercise = { id: 'press', name: 'Press banca con mancuernas', active: true }
const initial: DraftExerciseLog = {
  id: 'l', sessionId: 's', exerciseId: 'press', order: 1, workingWeightKg: 60,
  sets: [1, 2, 3].map(n => ({
    id: 'z' + n, exerciseLogId: 'l', setNumber: n, reps: '8', weightKg: 60,
    weightOverrideKg: n === 2 ? 65 : undefined, completed: false
  }))
}

function Fixture({ performances }: { performances: (LastExercisePerformance | null)[] }) {
  const [logs, setLogs] = useState([initial, {
    ...initial, id: 'second',
    sets: initial.sets.map(set => ({ ...set, id: 'second-' + set.id, exerciseLogId: 'second' }))
  }])
  return <>{logs.map((log, i) => <ExerciseLogger
    key={log.id}
    stableLayout
    templateExercise={template}
    log={log}
    exercise={exercise}
    previousPerformance={performances[i]}
    onChange={value => setLogs(all => all.map((item, n) => n === i ? value : item))}
  />)}</>
}

afterEach(cleanup)

it('reserva rendimiento desde el primer render y conserva bloques al llegar por separado', () => {
  const page = render(<Fixture performances={[null, null]} />)
  const articles = [...page.container.querySelectorAll('article')]
  const inputs = [...page.container.querySelectorAll('input')]
  expect(page.container.querySelectorAll('.exercise-previous.h-14')).toHaveLength(2)
  const data = {
    exerciseId: 'press', sessionId: 'old', performedAt: '2026-09-01T10:00:00Z',
    weightKg: 65, reps: [8, 7, 6]
  }
  page.rerender(<Fixture performances={[data, null]} />)
  expect(page.container.querySelectorAll('article')[1]).toBe(articles[1])
  expect(page.container.querySelectorAll('input')[0]).toBe(inputs[0])
  page.rerender(<Fixture performances={[data, { ...data, reps: Array(15).fill(8) }]} />)
  expect([...page.container.querySelectorAll('article')]).toEqual(articles)
  expect(page.container.querySelectorAll('.exercise-previous .line-clamp-2')).toHaveLength(2)
})

it('completar/desmarcar no remonta filas; pesos individuales y reps permanecen', () => {
  const page = render(<Fixture performances={[null, null]} />)
  const article = page.container.querySelector('article')!
  const inputs = [...article.querySelectorAll('input')]
  const first = within(article)
  const status = first.getByRole('button', { name: 'Marcar como hecha la serie 2' })
  const iconClass = status.querySelector('svg')!.getAttribute('class')
  for (const n of [1, 2, 3]) {
    fireEvent.click(first.getByRole('button', { name: 'Marcar como hecha la serie ' + n }))
  }
  expect(first.getByText('Completado').className).toBe('sr-only')
  expect([...article.querySelectorAll('input')]).toEqual(inputs)
  expect(status.querySelector('svg')!.getAttribute('class')).toBe(iconClass)
  fireEvent.click(first.getByRole('button', { name: 'Marcar como pendiente la serie 2' }))
  fireEvent.change(first.getByLabelText('Repeticiones de la serie 2 de Press banca con mancuernas'), {
    target: { value: '10' }
  })
  expect(first.getByText('65')).toBeTruthy()
  expect((first.getByLabelText('Repeticiones de la serie 2 de Press banca con mancuernas') as HTMLInputElement).value).toBe('10')
  expect(first.getByRole('button', { name: 'Marcar como pendiente la serie 1' }).getAttribute('aria-pressed')).toBe('true')
  expect(first.getByRole('button', { name: 'Marcar como hecha la serie 2' }).getAttribute('aria-pressed')).toBe('false')
})
