import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  FileJson,
  HardDrive,
  X
} from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useWorkouts } from '../../context/WorkoutContext'
import { createBackup } from '../../services/dataExport/backup'
import { downloadTextFile } from '../../services/dataExport/download'
import { parseWorkoutBackup } from '../../services/dataImport/json'
import { createImportPreview } from '../../services/dataImport/preview'
import type { ImportPayload, ImportPreview } from '../../services/dataImport/types'
import {
  findExerciseDuplicateGroups,
  normalizeExerciseName
} from '../../utils/exerciseIdentity'
import { isInitialSession } from '../../utils/workout'

const MAX_FILE_SIZE = 10 * 1024 * 1024

function mergeCanonicalizedSessionLogs(payload: ImportPayload): ImportPayload {
  const sessions = payload.sessions.map((session) => {
    const mergedLogs = new Map<string, typeof session.exerciseLogs[number]>()

    for (const log of session.exerciseLogs) {
      const existing = mergedLogs.get(log.exerciseId)
      if (!existing) {
        mergedLogs.set(log.exerciseId, { ...log, sets: [...log.sets] })
        continue
      }

      let nextSetNumber = Math.max(0, ...existing.sets.map((set) => set.setNumber)) + 1
      const setNumbers = new Set(existing.sets.map((set) => set.setNumber))
      const additions = log.sets.map((set) => {
        if (!setNumbers.has(set.setNumber)) {
          setNumbers.add(set.setNumber)
          return set
        }

        const renumberedSet = { ...set, setNumber: nextSetNumber }
        nextSetNumber += 1
        console.error(
          `[import] Serie renumerada al fusionar ${session.id} / ${log.exerciseId}: ${set.setNumber} -> ${renumberedSet.setNumber}.`
        )
        return renumberedSet
      })
      existing.sets = [...existing.sets, ...additions]
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((set) => ({
          ...set,
          id: `${existing.id}-set-${set.setNumber}`,
          exerciseLogId: existing.id
        }))
    }

    const exerciseLogs = [...mergedLogs.values()].map((log, index) => ({
      ...log,
      order: index + 1
    }))
    const volumeKg = exerciseLogs.reduce(
      (total, log) =>
        total + log.sets.reduce(
          (sum, set) => sum + (set.completed ? set.reps * set.weightKg : 0),
          0
        ),
      0
    )

    return { ...session, volumeKg, exerciseLogs }
  })

  return { ...payload, sessions }
}

function canonicalizeImportedPayload(
  payload: ImportPayload,
  existingExercises: ReturnType<typeof useWorkouts>['exercises'],
  templates: ReturnType<typeof useWorkouts>['templates']
) {
  const templateExerciseIds = new Set(
    templates.flatMap((template) => template.exercises.map((item) => item.exerciseId))
  )
  const existingByName = new Map<string, string>()
  for (const exercise of [...existingExercises].sort((a, b) => {
    const templateDifference = Number(templateExerciseIds.has(b.id)) - Number(templateExerciseIds.has(a.id))
    return templateDifference || a.id.localeCompare(b.id)
  })) {
    const normalized = normalizeExerciseName(exercise.name)
    if (normalized && !existingByName.has(normalized)) existingByName.set(normalized, exercise.id)
  }

  const idMap = new Map<string, string>()
  for (const exercise of payload.exercises) {
    const canonicalId = existingByName.get(normalizeExerciseName(exercise.name))
    if (canonicalId && canonicalId !== exercise.id) idMap.set(exercise.id, canonicalId)
  }

  if (idMap.size === 0) return mergeCanonicalizedSessionLogs(payload)

  const sessions = payload.sessions.map((session) => ({
    ...session,
    exerciseLogs: session.exerciseLogs.map((log) => {
      const canonicalId = idMap.get(log.exerciseId)
      return canonicalId
        ? {
            ...log,
            exerciseId: canonicalId,
            id: `${session.id}-${canonicalId}`,
            sets: log.sets.map((set) => ({
              ...set,
              id: `${session.id}-${canonicalId}-set-${set.setNumber}`,
              exerciseLogId: `${session.id}-${canonicalId}`
            }))
          }
        : log
    })
  }))
  const exercises = payload.exercises.filter((exercise) => !idMap.has(exercise.id))
  for (const canonicalId of new Set(idMap.values())) {
    const existing = existingExercises.find((exercise) => exercise.id === canonicalId)
    if (existing && !exercises.some((exercise) => exercise.id === canonicalId)) {
      exercises.push(existing)
    }
  }

  return mergeCanonicalizedSessionLogs({ ...payload, sessions, exercises })
}

export function DataSettings() {
  const {
    sessions,
    exercises,
    templates,
    dataMode,
    saveSession,
    saveTemplates,
    mergeExercises,
    mergeDuplicateExercises
  } = useWorkouts()
  const jsonInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [reviewDuplicates, setReviewDuplicates] = useState(false)
  const [mergingDuplicates, setMergingDuplicates] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const exportableSessions = sessions.filter((session) => !isInitialSession(session.id))
  const duplicateGroups = useMemo(
    () => findExerciseDuplicateGroups(exercises, templates, exportableSessions),
    [exercises, exportableSessions, templates]
  )

  function filename() {
    return `lifttrack-${new Date().toISOString().slice(0, 10)}.json`
  }

  function exportJson() {
    const backup = createBackup(exportableSessions, exercises, templates, dataMode)
    downloadTextFile(filename(), JSON.stringify(backup, null, 2), 'application/json;charset=utf-8')
    setMessage(`${exportableSessions.length} entrenamientos incluidos en la copia JSON.`)
    setError(null)
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage(null)
    setError(null)
    if (file.size > MAX_FILE_SIZE) {
      setError('El archivo supera el límite de 10 MB.')
      setPreview(null)
      return
    }

    try {
      const text = await file.text()
      const payload = parseWorkoutBackup(text, file.name)
      setPreview(createImportPreview(
        canonicalizeImportedPayload(payload, exercises, templates),
        exportableSessions
      ))
    } catch (readError) {
      console.error('[import] No se pudo leer el archivo:', readError)
      setError('No se pudo leer el archivo seleccionado.')
      setPreview(null)
    }
  }

  async function confirmImport() {
    if (!preview || preview.errors.length > 0) return
    const hasRoutine = Boolean(preview.templates?.length)
    if (preview.sessionsToImport.length === 0 && !hasRoutine && preview.exercises.length === 0) return
    if (!window.confirm(
      `Se va a importar una copia JSON con ${preview.sessionsToImport.length} sesiones nuevas${hasRoutine ? ' y rutina personalizada' : ''}. No se sobrescribirán sesiones existentes. ¿Continuar?`
    )) return

    setImporting(true)
    setError(null)
    setMessage(null)
    try {
      mergeExercises(preview.exercises)
      if (preview.templates?.length) saveTemplates(preview.templates)
      for (const session of preview.sessionsToImport) {
        await saveSession(session)
      }
      setMessage(
        `${preview.sessionsToImport.length} sesión${preview.sessionsToImport.length === 1 ? '' : 'es'} importada${preview.sessionsToImport.length === 1 ? '' : 's'} desde la copia JSON.`
      )
      setPreview(null)
    } catch (importError) {
      console.error('[import] La importación no se completó:', importError)
      setError('La importación no se completó. Puedes reintentar; las sesiones ya guardadas se detectarán por su ID.')
    } finally {
      setImporting(false)
    }
  }

  async function mergeDetectedDuplicates() {
    if (duplicateGroups.length === 0) return

    const duplicateCount = duplicateGroups.reduce(
      (total, group) => total + group.duplicateIds.length,
      0
    )
    const logCount = duplicateGroups.reduce(
      (total, group) => total + group.affectedLogCount,
      0
    )

    if (!window.confirm(
      `Se van a fusionar ${duplicateCount} ejercicios duplicados y actualizar ${logCount} registros. No se borrarán sesiones ni series. ¿Continuar?`
    )) return

    setMergingDuplicates(true)
    setError(null)
    setMessage(null)
    try {
      let updatedLogs = 0
      for (const group of duplicateGroups) {
        updatedLogs += await mergeDuplicateExercises(group.canonicalId, group.duplicateIds)
      }
      setMessage(`${updatedLogs} registros actualizados. Los duplicados se han fusionado en el historial activo.`)
      setReviewDuplicates(false)
    } catch (mergeError) {
      console.error('[data] No se pudieron fusionar ejercicios duplicados:', mergeError)
      setError('No se pudieron fusionar los duplicados. No se han borrado entrenamientos ni series.')
    } finally {
      setMergingDuplicates(false)
    }
  }

  return (
    <section className="card overflow-hidden" aria-labelledby="data-settings-title">
      <header className="border-b border-line bg-muted/40 p-5 md:p-6">
        <p className="eyebrow">Datos</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h2 id="data-settings-title" className="text-2xl font-extrabold tracking-tight text-ink">
            Datos
          </h2>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${
            dataMode === 'cloud'
              ? 'bg-success-soft text-success-text'
              : 'bg-muted text-secondary'
          }`}>
            {dataMode === 'cloud'
              ? <Cloud className="size-4" aria-hidden="true" />
              : <HardDrive className="size-4" aria-hidden="true" />}
            {dataMode === 'cloud' ? 'Nube' : 'Este dispositivo'}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-secondary">
          JSON guarda una copia completa de LiftTrack para restaurar entrenamientos, ejercicios, series, pesos y rutina.
        </p>
      </header>

      <div className="space-y-5 p-5 md:p-6">
        {message && (
          <p role="status" className="status-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="status-error">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div>
          <p className="text-sm leading-6 text-secondary">
            La copia incluye sesiones, biblioteca de ejercicios, objetivos, descansos, notas, IDs, fecha de exportación y versión del formato.
          </p>
          <input
            ref={jsonInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => void selectFile(event)}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={exportJson} className="btn-secondary w-full">
              <DatabaseBackup className="size-4" aria-hidden="true" />
              Exportar copia JSON
            </button>
            <button type="button" onClick={() => jsonInput.current?.click()} className="btn-secondary w-full">
              <FileJson className="size-4" aria-hidden="true" />
              Importar copia JSON
            </button>
          </div>
        </div>

        {preview && (
          <ImportPreviewCard
            preview={preview}
            importing={importing}
            onConfirm={() => void confirmImport()}
            onCancel={() => setPreview(null)}
          />
        )}

        <div className="border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-secondary hover:text-ink"
            aria-expanded={showAdvanced}
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            Herramientas avanzadas
          </button>
          {showAdvanced && (
            <div className="mt-3 rounded-2xl border border-line bg-muted/60 p-4">
              <div className="flex items-center gap-2">
                <FileJson className="size-5 text-brand" aria-hidden="true" />
                <h3 className="font-extrabold text-ink">Revisar duplicados</h3>
              </div>
              <p className="mt-1 text-sm leading-6 text-secondary">
                Detecta ejercicios con nombres equivalentes aunque tengan IDs distintos.
              </p>
              <button
                type="button"
                onClick={() => setReviewDuplicates((current) => !current)}
                className="btn-secondary mt-3"
              >
                Revisar ejercicios duplicados
              </button>
              {reviewDuplicates && (
                <DuplicateReview
                  duplicateGroups={duplicateGroups}
                  mergingDuplicates={mergingDuplicates}
                  onMerge={() => void mergeDetectedDuplicates()}
                />
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line pt-5">
          <h3 className="font-extrabold text-ink">Estado de sincronización</h3>
          <p className="mt-1 text-sm leading-6 text-secondary">
            {dataMode === 'cloud'
              ? `${exportableSessions.length} entrenamientos sincronizados.`
              : `${exportableSessions.length} entrenamientos guardados en este dispositivo.`}
          </p>
        </div>
      </div>
    </section>
  )
}

function DuplicateReview({
  duplicateGroups,
  mergingDuplicates,
  onMerge
}: {
  duplicateGroups: ReturnType<typeof findExerciseDuplicateGroups>
  mergingDuplicates: boolean
  onMerge: () => void
}) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
      {duplicateGroups.length > 0 ? (
        <>
          <div className="space-y-3">
            {duplicateGroups.map((group) => (
              <div key={group.normalizedName} className="rounded-xl bg-muted p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand">
                  Canónico
                </p>
                <p className="mt-1 font-extrabold text-ink">
                  {group.canonicalName}
                  <span className="ml-2 break-all text-xs font-semibold text-secondary">
                    {group.canonicalId}
                  </span>
                </p>
                <p className="mt-2 text-sm font-semibold text-secondary">
                  Duplicados: {group.duplicateNames.join(', ')}
                </p>
                <p className="mt-1 text-xs font-medium text-subtle">
                  {group.affectedSessionCount} sesiones afectadas · {group.affectedLogCount} registros a actualizar
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onMerge}
            disabled={mergingDuplicates}
            className="btn-primary mt-4 w-full"
          >
            {mergingDuplicates ? 'Fusionando...' : 'Fusionar duplicados'}
          </button>
        </>
      ) : (
        <p className="text-sm font-semibold text-secondary">
          No se han encontrado duplicados con sesiones asociadas.
        </p>
      )}
    </div>
  )
}

function ImportPreviewCard({
  preview,
  importing,
  onConfirm,
  onCancel
}: {
  preview: ImportPreview
  importing: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const hasRestorableData =
    preview.sessionsToImport.length > 0 ||
    preview.exercises.length > 0 ||
    Boolean(preview.templates?.length)
  const canImport = preview.errors.length === 0 && hasRestorableData

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand-soft/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Vista previa</p>
          <h3 className="mt-1 break-all font-extrabold text-ink">{preview.filename}</h3>
        </div>
        <button type="button" onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-xl" aria-label="Cancelar importación">
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
        <PreviewStat label="Sesiones" value={preview.sessionCount} />
        <PreviewStat label="Ejercicios" value={preview.exerciseCount} />
        <PreviewStat label="Series" value={preview.setCount} />
      </div>

      {preview.errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger-text">
          <p className="font-extrabold">Errores detectados</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {preview.errors.slice(0, 8).map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
          {preview.errors.length > 8 && (
            <p className="mt-2 font-semibold">Y {preview.errors.length - 8} errores más.</p>
          )}
        </div>
      )}

      {preview.hasPossibleDuplicates && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm font-semibold text-warning-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Se han detectado posibles entrenamientos duplicados. Se omitirán {preview.duplicateSessionIds.length} y no se sobrescribirá ningún dato.
        </p>
      )}

      <p className="mt-4 text-sm font-bold text-ink">
        {preview.sessionsToImport.length} sesiones nuevas listas para importar.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onCancel} disabled={importing} className="btn-secondary w-full">
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} disabled={!canImport || importing} className="btn-primary w-full">
          {importing ? 'Importando...' : 'Confirmar importación'}
        </button>
      </div>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface p-2 text-center shadow-sm sm:p-3">
      <p className="text-xl font-extrabold text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold text-secondary">{label}</p>
    </div>
  )
}
