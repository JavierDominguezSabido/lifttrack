-- Bloque 9: mejor peso REALIZADO, separado del peso base de la gráfica.
-- Aditiva: no reemplaza funciones ni modifica tablas/datos/escrituras.
-- Mismo primer log equivalente por sesión que v2; IDs resueltos en cliente.
-- bestWeight: máximo de override ?? weight de series completadas no warmup,
-- incluyendo sesiones parciales, excluyendo initial- y los IDs de outbox.
-- Todos los demás campos y su semántica permanecen iguales a v2.
-- Requiere el esquema de lectura existente y weight_override_kg / is_warmup.
BEGIN;
create function public.lifttrack_read_exercise_progress_v3(
  p_user_id uuid, p_exercise_ids text[], p_limit integer default 8,
  p_excluded_session_ids text[] default '{}'::text[]
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_excluded_session_ids is null or exists (
    select 1 from unnest(p_excluded_session_ids) id where id is null or btrim(id) = ''
  ) then raise exception 'Exclusiones no válidas' using errcode = '22023'; end if;
  if p_exercise_ids is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Parámetros de ejercicio no válidos' using errcode = '22023';
  end if;
  with entries as materialized (
    select s.client_id, s.started_at, coalesce(s.completed_at, s.started_at) as session_date,
      chosen.client_id as log_id,
      (select max(coalesce(z.weight_override_kg, z.weight_kg))
        from public.set_logs z
        where z.user_id = p_user_id and z.exercise_log_id = chosen.id
          and z.completed = true and z.is_warmup = false) as performed_weight,
      coalesce(chosen.working_weight_kg, (
        select z.weight_kg from public.set_logs z where z.user_id = p_user_id
          and z.exercise_log_id = chosen.id and z.completed order by z.set_number, z.id limit 1
      ), 0) as working_weight,
      (select coalesce(sum(coalesce(z.reps, 0) * z.weight_kg), 0) from public.set_logs z
        where z.user_id = p_user_id and z.exercise_log_id = chosen.id and z.completed) as volume,
      (select coalesce(jsonb_agg(coalesce(z.reps, 0) order by z.set_number, z.id), '[]'::jsonb)
        from public.set_logs z where z.user_id = p_user_id and z.exercise_log_id = chosen.id and z.completed) as reps
    from public.workout_sessions s
    join lateral (
      select l.* from public.exercise_logs l
      left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
      where l.user_id = p_user_id and l.session_id = s.id
        and coalesce(e.stable_key, l.exercise_id::text) = any(p_exercise_ids)
      order by l.position, l.id limit 1
    ) chosen on true
    where s.user_id = p_user_id and left(s.client_id, 8) <> 'initial-'
      and not (s.client_id = any(p_excluded_session_ids))
  ), recent as (
    select * from entries order by session_date desc, started_at desc, client_id collate "C" desc limit p_limit
  )
  select jsonb_build_object(
    'sessionCount', (select count(*) from entries),
    'bestWeight', (select greatest(0, coalesce(max(performed_weight), 0)) from entries),
    'accumulatedVolume', (select coalesce(sum(volume), 0) from entries),
    'latest', (select jsonb_build_object('sessionId', client_id, 'logId', log_id,
      'date', session_date, 'startedAt', started_at, 'weightKg', working_weight, 'reps', reps)
      from recent order by session_date desc, started_at desc, client_id collate "C" desc limit 1),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('sessionId', client_id,
      'logId', log_id, 'date', session_date, 'startedAt', started_at, 'weightKg', working_weight, 'reps', reps, 'volumeKg', volume)
      order by session_date desc, started_at desc, client_id collate "C" desc) from recent), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from entries)
  ) into result;
  return result;
end; $$;
REVOKE ALL ON FUNCTION public.lifttrack_read_exercise_progress_v3(uuid,text[],integer,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifttrack_read_exercise_progress_v3(uuid,text[],integer,text[]) TO authenticated;
COMMIT;