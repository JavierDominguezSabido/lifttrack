export interface TimestampedDraft {
  updatedAt: string
}

export function getDatedLocalDraftKey(userKey: string, localDate: string, templateId: string) {
  return `lifttrack.workoutDraft.${userKey}.${localDate}.${templateId}`
}

export function getDatedRemoteDraftKey(localDate: string, templateId: string) {
  return `${localDate}.${templateId}`
}

export function isActiveDraftForDate(
  draft: { localDate?: string; status?: string } | null | undefined,
  localDate: string
) {
  return draft?.localDate === localDate && draft.status === 'active'
}

export function hasCompletedSessionForDraft(
  sessions: Array<{ templateId?: string; startedAt: string; completedAt?: string }>,
  draft: { templateId: string; startedAt: string }
) {
  return sessions.some((session) =>
    Boolean(session.completedAt) &&
    session.templateId === draft.templateId &&
    Number.isFinite(new Date(draft.startedAt).getTime()) &&
    new Date(session.startedAt).getTime() === new Date(draft.startedAt).getTime()
  )
}

export function getUpdatedTime(value: TimestampedDraft | null | undefined) {
  if (!value) return 0
  const timestamp = new Date(value.updatedAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function selectNewestDraft<T extends TimestampedDraft>(
  local: T | null,
  remote: T | null
): { source: 'local' | 'remote' | 'none'; draft: T | null } {
  if (!local && !remote) return { source: 'none', draft: null }
  if (!remote || getUpdatedTime(local) >= getUpdatedTime(remote)) {
    return { source: 'local', draft: local }
  }
  return { source: 'remote', draft: remote }
}

export function selectSafeWorkoutDraft<T extends TimestampedDraft>(
  local: T | null,
  remote: T | null,
  options: { localPristine: boolean; remoteHasProgress: boolean }
) {
  if (local && remote && options.localPristine && options.remoteHasProgress) {
    return { source: 'remote' as const, draft: remote, reason: 'remote-progress-over-local-pristine' as const }
  }
  const selected = selectNewestDraft(local, remote)
  return { ...selected, reason: 'newest-updated-at' as const }
}

export function countCompletedDraftSets(draft: { logs: Array<{ sets: Array<{ completed: boolean }> }> }) {
  return draft.logs.reduce(
    (total, log) => total + log.sets.filter((set) => set.completed).length,
    0
  )
}

export function shouldAutosaveWorkoutDraft({
  hydrationReady,
  userChangeRevision,
  syncedUserChangeRevision,
  hydratedLocalNeedsUpload = false
}: {
  hydrationReady: boolean
  userChangeRevision: number
  syncedUserChangeRevision: number
  hydratedLocalNeedsUpload?: boolean
}) {
  return hydrationReady && (
    userChangeRevision > syncedUserChangeRevision || hydratedLocalNeedsUpload
  )
}

export function shouldShowInitialWorkoutLoader({
  initialLoading,
  sessionCount,
  templateCount,
  hasLocalDraft
}: {
  initialLoading: boolean
  sessionCount: number
  templateCount: number
  hasLocalDraft: boolean
}) {
  return initialLoading && sessionCount === 0 && templateCount === 0 && !hasLocalDraft
}

export function shouldRefreshForLifecycleEvent(
  event: 'visibilitychange' | 'focus' | 'pageshow' | 'online',
  visibilityState: DocumentVisibilityState
) {
  return event !== 'visibilitychange' || visibilityState === 'visible'
}
