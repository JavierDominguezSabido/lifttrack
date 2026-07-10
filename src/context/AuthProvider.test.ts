import { describe, expect, it } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { preserveUserIdentity } from './authIdentity'

const user = (id: string, tokenMarker: string) => ({ id, tokenMarker }) as unknown as User

describe('identidad de la sesión autenticada', () => {
  it('conserva la identidad ante TOKEN_REFRESHED o SIGNED_IN del mismo usuario', () => {
    const current = user('user-a', 'old-token')
    expect(preserveUserIdentity(current, user('user-a', 'new-token'))).toBe(current)
  })

  it('cambia la identidad cuando cambia realmente el usuario o se cierra sesión', () => {
    const current = user('user-a', 'token')
    const next = user('user-b', 'token')
    expect(preserveUserIdentity(current, next)).toBe(next)
    expect(preserveUserIdentity(current, null)).toBeNull()
  })
})
