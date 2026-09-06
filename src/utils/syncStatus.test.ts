import { expect, it } from 'vitest'
import { getSyncStatus, syncStatusLabels } from './syncStatus'

it('no confunde una cuenta conectada con datos confirmados', () => {
  expect(syncStatusLabels[getSyncStatus({ cloud: true, online: true, pending: false, error: false })]).toBe('Nube')
  expect(getSyncStatus({ cloud: true, online: false, pending: false, error: false })).toBe('offline')
  expect(getSyncStatus({ cloud: true, online: true, pending: true, error: false })).toBe('syncing')
  expect(getSyncStatus({ cloud: true, online: true, pending: false, error: true })).toBe('error')
  expect(getSyncStatus({ cloud: true, online: false, pending: false, error: false, queued: 1 })).toBe('pending')
  expect(getSyncStatus({ cloud: true, online: true, pending: false, error: false, conflict: true })).toBe('conflict')
  expect(getSyncStatus({ cloud: true, online: true, pending: false, error: false, confirmed: true })).toBe('synced')
})
