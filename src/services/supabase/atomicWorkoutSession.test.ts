import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const owner = '11111111-1111-4111-8111-111111111111'
const otherOwner = '22222222-2222-4222-8222-222222222222'
let db: PGlite

function session() {
  return {
    id: 'stable-session', name: 'Lunes', templateId: 'lunes', dayOfWeek: 1,
    startedAt: '2026-09-01T10:00:00Z', completedAt: '2026-09-01T11:00:00Z',
    durationMinutes: 60, volumeKg: 999999,
    exerciseLogs: [{
      id: 'stable-log', exerciseId: 'press', order: 1, workingWeightKg: 60,
      sets: [{ id: 'stable-set', setNumber: 1, reps: 8, weightKg: 60, completed: true }]
    }]
  }
}

function save(payload = session(), userId = owner) {
  return db.query<{ saved: ReturnType<typeof session> }>(
    'select public.save_workout_session($1::uuid, $2::jsonb, $3::jsonb) as saved',
    [userId, JSON.stringify(payload), JSON.stringify([{ id: 'press', name: 'Press banca' }])]
  )
}

describe('RPC de sesiones sobre PostgreSQL aislado', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
    `)
    // gen_random_uuid forma parte de PostgreSQL; PGlite no necesita pgcrypto.
    const schema = readFileSync('docs/supabase-schema.sql', 'utf8')
      .replace('create extension if not exists pgcrypto;', '')
    await db.exec(schema)
    // La migración es también reaplicable a una instalación existente.
    await db.exec(readFileSync('docs/migrations/atomic-workout-sessions.sql', 'utf8'))
    await db.query('insert into auth.users (id) values ($1), ($2)', [owner, otherOwner])
  }, 30000)

  beforeEach(async () => {
    await db.exec('reset role; truncate public.workout_sessions, public.workout_templates, public.exercises cascade;')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner])
    await db.exec('set role authenticated')
  })
  afterAll(async () => { await db?.close() })

  it('guarda todos los niveles y devuelve volumen calculado en el servidor', async () => {
    expect((await save()).rows[0].saved.volumeKg).toBe(480)
    expect((await db.query('select * from public.workout_sessions')).rows).toHaveLength(1)
    expect((await db.query('select * from public.exercise_logs')).rows).toHaveLength(1)
    expect((await db.query('select * from public.set_logs')).rows).toHaveLength(1)
  })

  it('reintenta sin duplicados y conserva la identidad SQL de la sesión', async () => {
    await save()
    const original = (await db.query('select id from public.workout_sessions')).rows
    await save()
    expect((await db.query('select id from public.workout_sessions')).rows).toEqual(original)
    expect((await db.query('select * from public.set_logs')).rows).toHaveLength(1)
  })

  it('revierte cabecera, borrado y nuevas series si falla una serie intermedia', async () => {
    await save()
    const previous = (await db.query('select * from public.set_logs')).rows
    const broken = session()
    broken.name = 'Cambio que debe revertirse'
    broken.exerciseLogs[0].sets.push({ ...broken.exerciseLogs[0].sets[0], id: 'collision' })
    await expect(save(broken)).rejects.toThrow()
    expect((await db.query('select name from public.workout_sessions')).rows).toEqual([{ name: 'Lunes' }])
    expect((await db.query('select * from public.set_logs')).rows).toEqual(previous)
  })

  it('no deja sesiones ni catálogo parcial al fallar un primer guardado', async () => {
    const broken = session()
    broken.exerciseLogs[0].sets[0].reps = -1
    await expect(save(broken)).rejects.toThrow()
    for (const table of ['workout_sessions', 'exercise_logs', 'set_logs', 'exercises', 'workout_templates']) {
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0)
    }
  })

  it('recalcula volumen cero al eliminar todos los registros en una edición', async () => {
    await save()
    expect((await save({ ...session(), exerciseLogs: [] })).rows[0].saved.volumeKg).toBe(0)
    expect((await db.query('select * from public.set_logs')).rows).toHaveLength(0)
  })

  it('rechaza otra identidad y mantiene RLS al cambiar de cuenta', async () => {
    await expect(save(session(), otherOwner)).rejects.toThrow(/cuenta ha cambiado/)
    await save()
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [otherOwner])
    expect((await db.query('select * from public.workout_sessions')).rows).toHaveLength(0)
    await save(session(), otherOwner)
    expect((await db.query('select user_id from public.workout_sessions')).rows).toEqual([{ user_id: otherOwner }])
  })
})
