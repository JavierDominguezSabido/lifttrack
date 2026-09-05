-- Aplicar antes de desplegar el cliente que usa save_workout_session.
-- Una llamada RPC constituye una única transacción: cualquier error revierte
-- también el borrado de las series anteriores. No requiere service_role.
begin;

create or replace function public.save_workout_session(
  p_user_id uuid,
  p_session jsonb,
  p_exercises jsonb,
  p_template jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  session_db_id uuid;
  template_db_id uuid;
  exercise_db_id uuid;
  log_db_id uuid;
  log_payload jsonb;
  exercise_payload jsonb;
  calculated_volume numeric;
begin
  if owner_id is null or p_user_id is distinct from owner_id then
    raise exception 'La cuenta ha cambiado. Vuelve a abrir el entrenamiento.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_session) is distinct from 'object'
    or jsonb_typeof(p_session -> 'exerciseLogs') is distinct from 'array'
    or jsonb_typeof(p_exercises) is distinct from 'array' then
    raise exception 'Formato de sesión no válido.' using errcode = '22023';
  end if;

  insert into public.profiles (id) values (owner_id) on conflict (id) do nothing;

  if nullif(p_session ->> 'templateId', '') is not null then
    insert into public.workout_templates (user_id, stable_key, name, day_of_week, notes)
    values (owner_id, p_session ->> 'templateId',
      coalesce(p_template ->> 'name', p_session ->> 'name'),
      coalesce((p_template ->> 'dayOfWeek')::smallint, (p_session ->> 'dayOfWeek')::smallint),
      p_template ->> 'notes')
    on conflict (user_id, stable_key) do nothing;
    select id into strict template_db_id from public.workout_templates
      where user_id = owner_id and stable_key = p_session ->> 'templateId';
  end if;

  -- El upsert bloquea esta sesión hasta el fin de la transacción y serializa
  -- reintentos concurrentes del mismo client_id.
  insert into public.workout_sessions (
    user_id, client_id, template_id, name, day_of_week, started_at,
    completed_at, duration_minutes, notes
  ) values (
    owner_id, p_session ->> 'id', template_db_id, p_session ->> 'name',
    (p_session ->> 'dayOfWeek')::smallint, (p_session ->> 'startedAt')::timestamptz,
    (p_session ->> 'completedAt')::timestamptz,
    (p_session ->> 'durationMinutes')::integer, p_session ->> 'notes'
  ) on conflict (user_id, client_id) do update set
    template_id = excluded.template_id, name = excluded.name,
    day_of_week = excluded.day_of_week, started_at = excluded.started_at,
    completed_at = excluded.completed_at, duration_minutes = excluded.duration_minutes,
    notes = excluded.notes
  returning id into session_db_id;

  delete from public.exercise_logs where user_id = owner_id and session_id = session_db_id;

  for log_payload in select value from jsonb_array_elements(p_session -> 'exerciseLogs') loop
    if jsonb_typeof(log_payload -> 'sets') is distinct from 'array' then
      raise exception 'Las series deben ser una lista.' using errcode = '22023';
    end if;
    select value into exercise_payload from jsonb_array_elements(p_exercises)
      where value ->> 'id' = log_payload ->> 'exerciseId' limit 1;

    insert into public.exercises (user_id, stable_key, name, muscle_group, equipment, notes)
    values (owner_id, log_payload ->> 'exerciseId',
      coalesce(exercise_payload ->> 'name', log_payload ->> 'exerciseId'),
      coalesce(exercise_payload ->> 'muscleGroup', 'Sin grupo'),
      exercise_payload ->> 'equipment', exercise_payload ->> 'notes')
    on conflict (user_id, stable_key) do nothing;
    select id into strict exercise_db_id from public.exercises
      where user_id = owner_id and stable_key = log_payload ->> 'exerciseId';

    insert into public.exercise_logs (
      user_id, client_id, session_id, exercise_id, position, working_weight_kg, notes
    ) values (
      owner_id, log_payload ->> 'id', session_db_id, exercise_db_id,
      (log_payload ->> 'order')::integer, (log_payload ->> 'workingWeightKg')::numeric,
      log_payload ->> 'notes'
    ) returning id into log_db_id;

    insert into public.set_logs (
      user_id, client_id, exercise_log_id, set_number, reps, weight_kg,
      weight_override_kg, completed, is_warmup
    ) select owner_id, value ->> 'id', log_db_id, (value ->> 'setNumber')::integer,
      nullif((value ->> 'reps')::integer, 0), (value ->> 'weightKg')::numeric,
      (value ->> 'weightOverrideKg')::numeric, (value ->> 'completed')::boolean,
      coalesce((value ->> 'isWarmup')::boolean, false)
    from jsonb_array_elements(log_payload -> 'sets');
  end loop;

  -- Recalcular también cuando la edición elimina todas las series.
  select coalesce(sum(sl.reps * sl.weight_kg), 0) into calculated_volume
    from public.exercise_logs el join public.set_logs sl on sl.exercise_log_id = el.id
    where el.session_id = session_db_id and el.user_id = owner_id and sl.completed;
  update public.workout_sessions set volume_kg = calculated_volume
    where id = session_db_id and user_id = owner_id;

  return p_session || jsonb_build_object('volumeKg', calculated_volume);
end;
$$;

revoke all on function public.save_workout_session(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_workout_session(uuid, jsonb, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
