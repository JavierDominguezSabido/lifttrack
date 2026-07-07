import { Cloud, CloudUpload, HardDrive, LogIn, LogOut, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useWorkouts } from '../../context/WorkoutContext'
import { getLocalSessions } from '../../services/mock/workoutService'
import { supabaseWorkoutRepository } from '../../services/supabase/supabaseWorkoutRepository'

export function AccountSettings() {
  const { user, loading, configured, signIn, signUp, signOut } = useAuth()
  const { dataMode, reloadSessions } = useWorkouts()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [localCount, setLocalCount] = useState(() => getLocalSessions().length)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (!email.trim() || !password) {
      setError('Introduce el email y la contraseña.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        const hasSession = await signUp(email.trim(), password)
        setMessage(
          hasSession
            ? 'Cuenta creada. La sincronización está activa.'
            : 'Cuenta creada. Revisa tu email para confirmar el registro antes de iniciar sesión.'
        )
      }
      setPassword('')
    } catch (authError) {
      console.error('[auth] Falló la operación:', authError)
      setError(authError instanceof Error ? authError.message : 'No se pudo completar la operación.')
    } finally {
      setSubmitting(false)
    }
  }

  async function logOut() {
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      await signOut()
      setMessage('Sesión cerrada. LiftTrack vuelve a usar los datos locales.')
    } catch (signOutError) {
      console.error('[auth] No se pudo cerrar la sesión:', signOutError)
      setError('No se pudo cerrar la sesión.')
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadLocalData() {
    const localSessions = getLocalSessions()
    if (localSessions.length === 0) return

    setError(null)
    setMessage(null)
    setMigrating(true)
    try {
      for (const session of localSessions) {
        await supabaseWorkoutRepository.saveWorkoutSession(session)
      }
      await reloadSessions(true)
      setLocalCount(getLocalSessions().length)
      setMessage(
        `${localSessions.length} entrenamiento${localSessions.length === 1 ? '' : 's'} subido${localSessions.length === 1 ? '' : 's'}. Los datos locales se han conservado.`
      )
    } catch (migrationError) {
      console.error('[migration] No se pudieron subir los datos locales:', migrationError)
      setError('La subida no se completó. Puedes volver a intentarlo sin crear duplicados.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <section className="card overflow-hidden" aria-labelledby="account-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div>
          <p className="eyebrow">Cuenta</p>
          <h2 id="account-settings-title" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
            Cuenta y sincronización
          </h2>
          {user?.email && <p className="mt-1 break-all text-sm font-semibold text-secondary">{user.email}</p>}
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${
          dataMode === 'cloud'
            ? 'bg-success-soft text-success-text'
            : 'bg-muted text-secondary'
        }`}>
          {dataMode === 'cloud'
            ? <Cloud className="size-4" aria-hidden="true" />
            : <HardDrive className="size-4" aria-hidden="true" />}
          {dataMode === 'cloud' ? 'Sincronizado' : 'Local'}
        </span>
      </div>

      <div className="space-y-4 border-t border-line p-5 md:p-6">
        {message && <p role="status" className="status-success">{message}</p>}
        {error && <p role="alert" className="status-error">{error}</p>}

        {!configured ? (
          <p className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm font-semibold text-warning-text">
            La sincronización en la nube no está configurada. LiftTrack guarda los datos en este dispositivo.
          </p>
        ) : loading ? (
          <p className="text-sm font-medium text-secondary">Comprobando sesión...</p>
        ) : user ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <p className="text-sm font-semibold text-secondary">
              Los entrenamientos nuevos, ediciones y borrados se guardan en la nube.
            </p>
            <button
              type="button"
              onClick={() => void logOut()}
              disabled={submitting}
              className="btn-secondary w-full sm:w-auto"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </button>

            {localCount > 0 && (
              <div className="rounded-2xl border border-brand/30 bg-brand-soft p-4 sm:col-span-2">
                <p className="font-extrabold text-ink">Datos locales disponibles</p>
                <p className="mt-1 text-sm leading-6 text-secondary">
                  Hay {localCount} entrenamiento{localCount === 1 ? '' : 's'} local{localCount === 1 ? '' : 'es'}.
                </p>
                <button
                  type="button"
                  onClick={() => void uploadLocalData()}
                  disabled={migrating}
                  className="btn-primary mt-3 w-full sm:w-auto"
                >
                  <CloudUpload className="size-4" aria-hidden="true" />
                  {migrating ? 'Subiendo...' : 'Subir datos locales'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`min-h-11 rounded-xl text-sm font-bold ${
                  mode === 'signin' ? 'bg-surface text-ink shadow-sm' : 'text-secondary'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`min-h-11 rounded-xl text-sm font-bold ${
                  mode === 'signup' ? 'bg-surface text-ink shadow-sm' : 'text-secondary'
                }`}
              >
                Crear cuenta
              </button>
            </div>

            <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <label className="block text-sm font-bold text-secondary">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input mt-1 !text-left"
                  placeholder="tu@email.com"
                />
              </label>
              <label className="block text-sm font-bold text-secondary">
                Contraseña
                <input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input mt-1 !text-left"
                  placeholder="Mínimo 6 caracteres"
                />
              </label>
              <button type="submit" disabled={submitting} className="btn-primary w-full lg:w-auto">
                {mode === 'signin'
                  ? <LogIn className="size-4" aria-hidden="true" />
                  : <UserPlus className="size-4" aria-hidden="true" />}
                {submitting
                  ? 'Procesando...'
                  : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  )
}
