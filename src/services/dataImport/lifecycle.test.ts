import { describe, expect, it } from 'vitest'
import { shouldResetPendingImport } from './lifecycle'

describe('ciclo de vida de una importación autenticada móvil', () => {
  it('conserva la importación tras hidden, blur, visible, focus y refresh del mismo usuario', () => {
    const events = ['hidden', 'blur', 'visible', 'focus', 'TOKEN_REFRESHED', 'SIGNED_IN']
    expect(events.every(() => !shouldResetPendingImport('user-a', 'user-a'))).toBe(true)
  })

  it('la limpia ante un cambio real de usuario o cierre de sesión', () => {
    expect(shouldResetPendingImport('user-a', 'user-b')).toBe(true)
    expect(shouldResetPendingImport('user-a', 'local')).toBe(true)
  })
})
