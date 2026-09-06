export type SyncStatus = 'local' | 'cloud' | 'synced' | 'offline' | 'syncing' | 'error' | 'pending' | 'conflict'

export function getSyncStatus({ cloud, online, pending, error, queued = 0, conflict = false, confirmed = false }: {
  cloud: boolean; online: boolean; pending: boolean; error: boolean
  queued?: number; conflict?: boolean; confirmed?: boolean
}): SyncStatus {
  if (!cloud) return 'local'
  if (conflict) return 'conflict'
  if (queued && (!online || !pending)) return 'pending'
  if (!online) return 'offline'
  if (error) return 'error'
  if (pending) return 'syncing'
  // Conectado no equivale a tener todos los datos sincronizados.
  return confirmed ? 'synced' : 'cloud'
}

export const syncStatusLabels: Record<SyncStatus, string> = {
  local: 'Guardado local', cloud: 'Nube', synced: 'Sincronizado', offline: 'Sin conexión',
  pending: 'Pendiente · guardado local', conflict: 'Conflicto pendiente',
  syncing: 'Sincronizando…', error: 'Revisar sincronización'
}
