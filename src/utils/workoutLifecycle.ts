export interface TimestampedDraft {
  updatedAt: string
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
