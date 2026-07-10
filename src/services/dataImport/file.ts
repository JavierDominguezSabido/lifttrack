import type { ImportPayload } from './types'
import { parseWorkoutBackup } from './json'

export class InvalidJsonFileError extends Error {}
export class UnexpectedBackupFormatError extends Error {}

export interface ImportFileLike {
  name: string
  size: number
  type: string
  text: () => Promise<string>
}

/** El MIME es solo informativo: Android puede entregar cualquier tipo o ninguno. */
export async function readWorkoutBackupFile(file: ImportFileLike): Promise<ImportPayload> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new InvalidJsonFileError('El archivo no contiene un JSON válido.')
  }
  if (
    typeof parsed !== 'object' || parsed === null ||
    !('format' in parsed) || parsed.format !== 'lifttrack-backup' ||
    !('version' in parsed) || parsed.version !== 1
  ) {
    throw new UnexpectedBackupFormatError('La copia no tiene el formato esperado por LiftTrack.')
  }
  return parseWorkoutBackup(text, file.name)
}

export async function processSelectedImportFile<T>(
  input: { value: string },
  file: ImportFileLike,
  process: (file: ImportFileLike) => Promise<T>
): Promise<T> {
  try {
    return await process(file)
  } finally {
    input.value = ''
  }
}
