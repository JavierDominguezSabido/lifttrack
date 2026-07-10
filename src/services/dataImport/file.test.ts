import { describe, expect, it } from 'vitest'
import { createBackup } from '../dataExport/backup'
import {
  InvalidJsonFileError, UnexpectedBackupFormatError,
  processSelectedImportFile, readWorkoutBackupFile, type ImportFileLike
} from './file'

const validText = JSON.stringify(createBackup([], [], [], 'local'))
const mimeTypes = ['application/json', 'text/plain', 'application/octet-stream', '']

function file(type: string, text = validText): ImportFileLike {
  return { name: 'lifttrack.json', size: text.length, type, text: async () => text }
}

describe('lectura de archivos JSON en PWA', () => {
  for (const scenario of [
    'local + navegador',
    'local + PWA standalone',
    'autenticado + navegador',
    'autenticado + PWA standalone'
  ]) it(`prepara el mismo archivo en ${scenario} sin depender de autenticación`, async () => {
    const payload = await readWorkoutBackupFile(file('application/json'))
    expect(payload).toMatchObject({ source: 'json', filename: 'lifttrack.json', errors: [] })
  })

  for (const type of mimeTypes) it(`acepta MIME "${type || 'vacío'}"`, async () => {
    await expect(readWorkoutBackupFile(file(type))).resolves.toMatchObject({ source: 'json', errors: [] })
  })

  it('distingue JSON inválido de una copia con formato inesperado', async () => {
    await expect(readWorkoutBackupFile(file('text/plain', '{'))).rejects.toBeInstanceOf(InvalidJsonFileError)
    await expect(readWorkoutBackupFile(file('', '{}'))).rejects.toBeInstanceOf(UnexpectedBackupFormatError)
  })

  it('permite procesar dos veces el mismo archivo y limpia solo al terminar', async () => {
    const input = { value: 'C:\\fakepath\\lifttrack.json' }
    const selected = file('application/octet-stream')
    let reads = 0
    const process = async (candidate: ImportFileLike) => {
      expect(input.value).not.toBe('')
      await candidate.text()
      expect(input.value).not.toBe('')
      reads += 1
    }
    await processSelectedImportFile(input, selected, process)
    expect(input.value).toBe('')
    input.value = 'C:\\fakepath\\lifttrack.json'
    await processSelectedImportFile(input, selected, process)
    expect(reads).toBe(2)
  })
})
