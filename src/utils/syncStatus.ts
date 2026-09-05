export type SyncStatus = 'local' | 'cloud' | 'offline' | 'syncing' | 'error'

export function getSyncStatus({ cloud, online, pending, error }: {
  cloud: boolean; online: boolean; pending: boolean; error: boolean
}): SyncStatus {
  if (!cloud) return 'local'
  if (!online) return 'offline'
  if (error) return 'error'
  if (pending) return 'syncing'
  // Conectado no equivale a tener todos los datos sincronizados.
  return 'cloud'
}

export const syncStatusLabels: Record<SyncStatus, string> = {
  local: 'Local', cloud: 'Nube', offline: 'Sin conexión',
  syncing: 'Sincronizando…', error: 'Revisar sincronización'
}
