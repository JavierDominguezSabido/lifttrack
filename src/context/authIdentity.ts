import type { User } from '@supabase/supabase-js'

export function preserveUserIdentity(current: User | null, next: User | null) {
  return current?.id === next?.id ? current : next
}
