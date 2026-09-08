-- Bloque 8: API de lectura v1. Aplicación MANUAL, una sola vez.
-- Solo crea funciones nuevas y sus permisos; no modifica tablas, datos, RLS,
-- índices, receipts ni funciones de escritura/sincronización existentes.
-- Requisitos: docs/supabase-schema.sql, atomic-workout-sessions.sql y
-- persistent-sync.sql ya aplicados. No volver a aplicar esas migraciones.
-- SECURITY INVOKER + auth.uid() + filtros de propietario en TODOS los joins.
-- Cada RPC STABLE lee una instantánea; páginas de RPC distintas NO constituyen
-- una instantánea compartida. El futuro cliente deberá conciliar invalidaciones
-- y outbox, no interpretar esta API como confirmación de escrituras pendientes.
-- No se normalizan nombres ni se deciden equivalencias en SQL: el cliente debe
-- conservar exerciseIdentity.ts y enviar el conjunto de stable_key equivalente.
-- Los conteos por stable_key del resumen permiten hacerlo sin descargar series.
-- Fechas: completed_at ?? started_at; semanas locales desde lunes. La zona IANA
-- del dispositivo es obligatoria en el resumen (no se supone UTC/Europe/Madrid).
-- En empates de fechas: started_at DESC, client_id COLLATE "C" DESC.
-- No ejecutar como service_role para probar: hace falta un auth.uid() válido.
begin;

-- Detalle para edición histórica independiente de la rutina actual.
-- null si no existe; no excluye semillas initial-. syncRevision reproduce
-- exactamente el hash de sync_revision, sin invocarla ni alterar su definición.
create function public.lifttrack_read_session_v1(p_user_id uuid, p_session_id text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', s.client_id, 'templateId', t.stable_key, 'name', s.name,
    'dayOfWeek', s.day_of_week, 'startedAt', s.started_at,
    'completedAt', s.completed_at, 'durationMinutes', s.duration_minutes,
    'volumeKg', s.volume_kg, 'notes', s.notes,
    'syncRevision', md5(jsonb_build_array(to_jsonb(s),
      (select jsonb_agg(to_jsonb(l) order by l.id) from public.exercise_logs l
        where l.user_id = p_user_id and l.session_id = s.id),
      (select jsonb_agg(to_jsonb(z) order by z.id) from public.set_logs z
        join public.exercise_logs l on l.id = z.exercise_log_id and l.user_id = p_user_id
        where l.session_id = s.id and z.user_id = p_user_id)
    )::text),
    'exerciseLogs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.client_id, 'sessionId', s.client_id, 'exerciseId', coalesce(e.stable_key, l.exercise_id::text),
      'order', l.position, 'workingWeightKg', l.working_weight_kg, 'notes', l.notes,
      'sets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', z.client_id, 'exerciseLogId', l.client_id, 'setNumber', z.set_number,
        'reps', coalesce(z.reps, 0), 'weightKg', z.weight_kg,
        'weightOverrideKg', z.weight_override_kg, 'completed', z.completed, 'isWarmup', z.is_warmup
      ) order by z.set_number, z.id) from public.set_logs z
        where z.exercise_log_id = l.id and z.user_id = p_user_id), '[]'::jsonb)
    ) order by l.position, l.id) from public.exercise_logs l
      left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
      where l.session_id = s.id and l.user_id = p_user_id), '[]'::jsonb)
  ) into result
  from public.workout_sessions s
  left join public.workout_templates t on t.id = s.template_id and t.user_id = p_user_id
  where s.user_id = p_user_id and s.client_id = p_session_id;
  return result;
end; $$;

-- Resumen global sin descargar el detalle histórico. No incluye initial-.
-- activeWeeks incluye sesiones parciales; streakWeeks solo sesiones finalizadas,
-- empieza en la semana actual (no retrocede a la anterior si la actual está vacía).
-- totalVolume respeta volume_kg guardado, incluso cero; solo si NULL suma series
-- completadas, incluyendo calentamientos, igual que getHistorySummary.
create function public.lifttrack_read_history_overview_v1(
  p_user_id uuid, p_timezone text, p_now timestamptz default now()
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_timezone is null or p_now is null or not exists(
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then raise exception 'Zona horaria o fecha no válida' using errcode = '22023'; end if;
  with recursive sessions as materialized (
    select s.*, coalesce(s.completed_at, s.started_at) as session_date,
      date_trunc('week', coalesce(s.completed_at, s.started_at) at time zone p_timezone)::date as week_start
    from public.workout_sessions s where s.user_id = p_user_id and left(s.client_id, 8) <> 'initial-'
  ), completed_weeks as (
    select distinct week_start from sessions where completed_at is not null
  ), streak(week_start) as (
    select week_start from completed_weeks where week_start = date_trunc('week', p_now at time zone p_timezone)::date
    union all
    select c.week_start from completed_weeks c join streak x on c.week_start = x.week_start - 7
  ), log_counts as (
    select coalesce(e.stable_key, l.exercise_id::text) as exercise_id, count(*) as log_count
    from public.exercise_logs l join sessions s on s.id = l.session_id
    left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
    where l.user_id = p_user_id group by coalesce(e.stable_key, l.exercise_id::text)
  )
  select jsonb_build_object(
    'sessionCount', (select count(*) from sessions),
    'activeWeeks', (select count(distinct week_start) from sessions),
    'streakWeeks', (select count(*) from streak),
    'totalVolume', coalesce((select sum(coalesce(s.volume_kg, (
      select coalesce(sum(coalesce(z.reps, 0) * z.weight_kg), 0)
      from public.exercise_logs l join public.set_logs z on z.exercise_log_id = l.id and z.user_id = p_user_id
      where l.session_id = s.id and l.user_id = p_user_id and z.completed
    ))) from sessions s), 0),
    'latestSession', (select public.lifttrack_read_session_v1(p_user_id, client_id)
      from sessions order by session_date desc, started_at desc, client_id collate "C" desc limit 1),
    'exerciseLogCounts', coalesce((select jsonb_object_agg(exercise_id, log_count) from log_counts), '{}'::jsonb),
    'currentWeekCompletedDays', coalesce((select jsonb_agg(d order by d) from (
      select distinct day_of_week as d from sessions where completed_at is not null
        and week_start = date_trunc('week', p_now at time zone p_timezone)::date
    ) days), '[]'::jsonb)
  ) into result;
  return result;
end; $$;

-- Página de sesiones completas, cursor por clave (sin OFFSET). El cursor es
-- opaco: reenviar nextCursor íntegro. Límite 1..100, 20 por defecto.
-- exercise_ids: NULL=sin filtro; []=ningún resultado; stable_key originales,
-- incluidas las equivalencias que haya resuelto el cliente. Semántica ANY log.
-- from inclusive / to exclusive sobre la fecha efectiva (límites calculados
-- por el cliente para semana/mes locales). Sin búsquedas de texto aproximadas
-- en SQL: no sustituye las reglas de nombres/día de rutina del cliente.
create function public.lifttrack_read_sessions_page_v1(
  p_user_id uuid, p_limit integer default 20, p_cursor jsonb default null,
  p_exercise_ids text[] default null, p_from timestamptz default null,
  p_to timestamptz default null, p_include_initial boolean default false
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; cursor_date timestamptz; cursor_started timestamptz; cursor_id text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_include_initial is null
    or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception 'Parámetros de página no válidos' using errcode = '22023';
  end if;
  if p_cursor is not null then
    cursor_date := (p_cursor ->> 'date')::timestamptz;
    cursor_started := (p_cursor ->> 'startedAt')::timestamptz;
    cursor_id := p_cursor ->> 'id';
    if cursor_date is null or cursor_started is null or cursor_id is null then
      raise exception 'Cursor incompleto' using errcode = '22023';
    end if;
  end if;
  with candidates as materialized (
    select s.client_id, s.started_at, coalesce(s.completed_at, s.started_at) as session_date
    from public.workout_sessions s
    where s.user_id = p_user_id and (p_include_initial or left(s.client_id, 8) <> 'initial-')
      and (p_from is null or coalesce(s.completed_at, s.started_at) >= p_from)
      and (p_to is null or coalesce(s.completed_at, s.started_at) < p_to)
      and (p_exercise_ids is null or exists (
        select 1 from public.exercise_logs l
        left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
        where l.user_id = p_user_id and l.session_id = s.id
          and coalesce(e.stable_key, l.exercise_id::text) = any(p_exercise_ids)
      ))
      and (p_cursor is null or (coalesce(s.completed_at, s.started_at), s.started_at, s.client_id collate "C")
        < (cursor_date, cursor_started, cursor_id collate "C"))
    order by session_date desc, s.started_at desc, s.client_id collate "C" desc limit p_limit + 1
  ), page as materialized (
    select * from candidates order by session_date desc, started_at desc, client_id collate "C" desc limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(public.lifttrack_read_session_v1(p_user_id, client_id)
      order by session_date desc, started_at desc, client_id collate "C" desc) from page), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from candidates),
    'nextCursor', case when (select count(*) > p_limit from candidates) then (
      select jsonb_build_object('date', session_date, 'startedAt', started_at, 'id', client_id)
      from page order by session_date, started_at, client_id collate "C" limit 1
    ) else null end
  ) into result;
  return result;
end; $$;

-- Métricas EXACTAS de Progreso para un conjunto de IDs equivalentes decidido
-- fuera de SQL. Se toma solo el primer log equivalente de cada sesión, por
-- position (no se suman todos los aliases de la misma sesión).
-- Devuelve estadísticas globales y hasta 100 entradas recientes (8 por defecto).
-- Para más registros, usar la página filtrada, seleccionando el primer log
-- equivalente con las mismas reglas. Nunca tratar la página como el total.
create function public.lifttrack_read_exercise_progress_v1(
  p_user_id uuid, p_exercise_ids text[], p_limit integer default 8
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_exercise_ids is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Parámetros de ejercicio no válidos' using errcode = '22023';
  end if;
  with entries as materialized (
    select s.client_id, s.started_at, coalesce(s.completed_at, s.started_at) as session_date,
      chosen.client_id as log_id,
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
  ), recent as (
    select * from entries order by session_date desc, started_at desc, client_id collate "C" desc limit p_limit
  )
  select jsonb_build_object(
    'sessionCount', (select count(*) from entries),
    'bestWeight', (select greatest(0, coalesce(max(working_weight), 0)) from entries),
    'accumulatedVolume', (select coalesce(sum(volume), 0) from entries),
    'latest', (select jsonb_build_object('sessionId', client_id, 'logId', log_id,
      'date', session_date, 'weightKg', working_weight, 'reps', reps)
      from recent order by session_date desc, started_at desc, client_id collate "C" desc limit 1),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('sessionId', client_id,
      'logId', log_id, 'date', session_date, 'weightKg', working_weight, 'reps', reps, 'volumeKg', volume)
      order by session_date desc, started_at desc, client_id collate "C" desc) from recent), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from entries)
  ) into result;
  return result;
end; $$;

-- Último rendimiento para entrenar: diferente de Progreso intencionadamente.
-- Solo sesiones finalizadas y series completadas NO de calentamiento.
-- Las sesiones reales tienen prioridad sobre initial-, incluso si son anteriores.
-- Primero se elige el primer log equivalente, DESPUÉS se exige una serie válida.
-- Peso base, o primera serie sin override, o primera serie válida (en ese orden).
create function public.lifttrack_read_last_performance_v1(p_user_id uuid, p_exercise_ids text[])
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_exercise_ids is null then raise exception 'IDs de ejercicio requeridos' using errcode = '22023'; end if;
  select jsonb_build_object('sessionId', s.client_id, 'logId', chosen.client_id,
    'performedAt', s.completed_at, 'weightKg', coalesce(chosen.working_weight_kg,
      (select z.weight_kg from public.set_logs z where z.user_id = p_user_id
        and z.exercise_log_id = chosen.id and z.completed and not z.is_warmup and z.weight_override_kg is null
        order by z.set_number, z.id limit 1),
      (select z.weight_kg from public.set_logs z where z.user_id = p_user_id
        and z.exercise_log_id = chosen.id and z.completed and not z.is_warmup order by z.set_number, z.id limit 1)),
    'reps', (select jsonb_agg(coalesce(z.reps, 0) order by z.set_number, z.id)
      from public.set_logs z where z.user_id = p_user_id and z.exercise_log_id = chosen.id and z.completed and not z.is_warmup)
  ) into result
  from public.workout_sessions s
  join lateral (
    select l.* from public.exercise_logs l
    left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
    where l.user_id = p_user_id and l.session_id = s.id
      and coalesce(e.stable_key, l.exercise_id::text) = any(p_exercise_ids)
    order by l.position, l.id limit 1
  ) chosen on true
  where s.user_id = p_user_id and s.completed_at is not null and exists (
    select 1 from public.set_logs z where z.user_id = p_user_id and z.exercise_log_id = chosen.id and z.completed and not z.is_warmup
  )
  order by (left(s.client_id, 8) = 'initial-'), s.completed_at desc, s.started_at desc, s.client_id collate "C" desc
  limit 1;
  return result;
end; $$;

-- Solo permisos sobre estas cinco funciones nuevas. No amplía permisos de tablas.
revoke all on function public.lifttrack_read_session_v1(uuid,text),
  public.lifttrack_read_history_overview_v1(uuid,text,timestamptz),
  public.lifttrack_read_sessions_page_v1(uuid,integer,jsonb,text[],timestamptz,timestamptz,boolean),
  public.lifttrack_read_exercise_progress_v1(uuid,text[],integer),
  public.lifttrack_read_last_performance_v1(uuid,text[]) from public, anon;
grant execute on function public.lifttrack_read_session_v1(uuid,text),
  public.lifttrack_read_history_overview_v1(uuid,text,timestamptz),
  public.lifttrack_read_sessions_page_v1(uuid,integer,jsonb,text[],timestamptz,timestamptz,boolean),
  public.lifttrack_read_exercise_progress_v1(uuid,text[],integer),
  public.lifttrack_read_last_performance_v1(uuid,text[]) to authenticated;
notify pgrst, 'reload schema';
commit;
