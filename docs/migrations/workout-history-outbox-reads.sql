-- Bloque 8: lecturas reconciliables con outbox. Aplicación MANUAL una sola vez.
-- Requiere las dos migraciones de lectura previas, sin volver a aplicarlas.
-- Solo funciones NUEVAS y sus permisos; sin cambios de datos/tablas/índices/RLS
-- ni funciones existentes de lectura, escritura o sincronización.
-- Contrato completo: ../read-outbox-contract.md
-- p_excluded_session_ids contiene client_id (IDs de dominio, NO UUID SQL).
-- []=sin exclusiones; NULL, elementos NULL/vacíos se rechazan. Duplicados inocuos.
-- Excluir todo recurso de sesión con operación no done, incluidas altas/errores/
-- conflictos; el cliente conserva la última versión por recurso y añade saves.
-- Exclusión ANTES de agregados, filtros, límites y cursor; siempre por auth.uid().
-- Cada llamada STABLE tiene una instantánea; no hay snapshot entre llamadas.
-- La caché debe incluir cuenta, generación outbox, filtros, zona y exclusiones.
-- Invalidar al modificar/confirmar/resolver; descartar respuestas antiguas.
-- Estos resultados NO confirman escrituras ni sustituyen syncRevision.
begin;

-- Overview del resto confirmado. weekProbes contiene solo las semanas locales
-- solicitadas, sus anteriores y la actual: cobertura activa y comienzo del tramo
-- consecutivo confirmado que termina en cada semana consultada (NULL si hueco).
create function public.lifttrack_read_history_overview_v2(
  p_user_id uuid, p_timezone text, p_now timestamptz default now(),
  p_excluded_session_ids text[] default '{}'::text[],
  p_local_week_starts date[] default '{}'::date[]
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_excluded_session_ids is null or exists (
    select 1 from unnest(p_excluded_session_ids) id where id is null or btrim(id) = ''
  ) then raise exception 'Exclusiones no válidas' using errcode = '22023'; end if;
  if p_timezone is null or p_now is null or not exists(
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then raise exception 'Zona horaria o fecha no válida' using errcode = '22023'; end if;
  if p_local_week_starts is null or exists (
    select 1 from unnest(p_local_week_starts) d
    where d is null or not isfinite(d) or extract(isodow from d) <> 1
  ) or not isfinite(p_now) then
    raise exception 'Semanas locales no válidas' using errcode = '22023';
  end if;
  with recursive sessions as materialized (
    select s.*, coalesce(s.completed_at, s.started_at) as session_date,
      date_trunc('week', coalesce(s.completed_at, s.started_at) at time zone p_timezone)::date as week_start
    from public.workout_sessions s where s.user_id = p_user_id and left(s.client_id, 8) <> 'initial-'
      and not (s.client_id = any(p_excluded_session_ids))
  ), completed_weeks as (
    select distinct week_start from sessions where completed_at is not null
  ), numbered_weeks as (
    select week_start, week_start - (7 * row_number() over (order by week_start))::integer as run_key
    from completed_weeks
  ), week_runs as (
    select min(week_start) as first_week, max(week_start) as last_week
    from numbered_weeks group by run_key
  ), probes as (
    select date_trunc('week', p_now at time zone p_timezone)::date as week_start
    union select unnest(p_local_week_starts)
    union select d - 7 from unnest(p_local_week_starts) d
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
    'weekProbes', (select jsonb_agg(jsonb_build_object(
      'weekStart', p.week_start,
      'active', exists(select 1 from sessions s where s.week_start = p.week_start),
      'completedRunStart', (select r.first_week from week_runs r
        where p.week_start between r.first_week and r.last_week)
    ) order by p.week_start) from probes p),
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

-- Página v2 del resto: conteos y cursor SOLO del flujo remoto.
create function public.lifttrack_read_sessions_page_v3(
  p_user_id uuid, p_timezone text, p_template_days jsonb,
  p_limit integer default 20, p_cursor jsonb default null,
  p_exercise_ids text[] default null, p_search_exercise_ids text[] default null,
  p_day_of_week integer default null, p_from timestamptz default null,
  p_to timestamptz default null, p_include_initial boolean default false,
  p_excluded_session_ids text[] default '{}'::text[]
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; cursor_date timestamptz; cursor_started timestamptz; cursor_id text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_excluded_session_ids is null or exists (
    select 1 from unnest(p_excluded_session_ids) id where id is null or btrim(id) = ''
  ) then raise exception 'Exclusiones no válidas' using errcode = '22023'; end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) or p_template_days is null or jsonb_typeof(p_template_days) <> 'object' then
    raise exception 'Zona horaria o mapa de rutina no válido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_template_days) d
    where jsonb_typeof(d.value) <> 'number'
      or d.value::text !~ '^[0-6]$') then
    raise exception 'Día de plantilla no válido' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_include_initial is null
    or (p_day_of_week is not null and p_day_of_week not between 0 and 6)
    or (p_from is not null and not isfinite(p_from))
    or (p_to is not null and not isfinite(p_to))
    or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception 'Parámetros de página no válidos' using errcode = '22023';
  end if;
  if p_cursor is not null then
    cursor_date := (p_cursor ->> 'date')::timestamptz;
    cursor_started := (p_cursor ->> 'startedAt')::timestamptz;
    cursor_id := p_cursor ->> 'id';
    if cursor_date is null or cursor_started is null or cursor_id is null
      or not isfinite(cursor_date) or not isfinite(cursor_started) then
      raise exception 'Cursor incompleto o no válido' using errcode = '22023';
    end if;
  end if;
  with universe as materialized (
    select s.id, s.client_id, s.started_at, s.day_of_week, s.template_id,
      coalesce(s.completed_at, s.started_at) as session_date
    from public.workout_sessions s
    where s.user_id = p_user_id
      and not (s.client_id = any(p_excluded_session_ids))
      and (p_include_initial or left(s.client_id, 8) <> 'initial-')
  ), filtered as materialized (
    select s.client_id, s.started_at, s.session_date
    from universe s
    left join public.workout_templates t on t.id = s.template_id and t.user_id = p_user_id
    where (p_from is null or s.session_date >= p_from)
      and (p_to is null or s.session_date < p_to)
      and (p_day_of_week is null or coalesce(
        case when s.day_of_week between 0 and 6 then s.day_of_week end,
        (p_template_days ->> t.stable_key)::integer,
        extract(dow from s.session_date at time zone p_timezone)::integer
      ) = p_day_of_week)
      and (p_exercise_ids is null or exists (
        select 1 from public.exercise_logs l
        left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
        where l.user_id = p_user_id and l.session_id = s.id
          and coalesce(e.stable_key, l.exercise_id::text) = any(p_exercise_ids)
      ))
      and (p_search_exercise_ids is null or exists (
        select 1 from public.exercise_logs l
        left join public.exercises e on e.id = l.exercise_id and e.user_id = p_user_id
        where l.user_id = p_user_id and l.session_id = s.id
          and coalesce(e.stable_key, l.exercise_id::text) = any(p_search_exercise_ids)
      ))
  ), candidates as materialized (
    select * from filtered
    where p_cursor is null or (session_date, started_at, client_id collate "C")
      < (cursor_date, cursor_started, cursor_id collate "C")
    order by session_date desc, started_at desc, client_id collate "C" desc limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by session_date desc, started_at desc, client_id collate "C" desc limit p_limit
  )
  select jsonb_build_object(
    'totalCount', (select count(*) from universe),
    'filteredCount', (select count(*) from filtered),
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

-- Máximo del resto completo, aunque esté fuera de los registros recientes.
create function public.lifttrack_read_exercise_progress_v2(
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
    'bestWeight', (select greatest(0, coalesce(max(working_weight), 0)) from entries),
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

-- Último candidato del resto: mantiene prioridad real > initial-.
create function public.lifttrack_read_last_performance_v2(p_user_id uuid, p_exercise_ids text[],
  p_excluded_session_ids text[] default '{}'::text[])
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_excluded_session_ids is null or exists (
    select 1 from unnest(p_excluded_session_ids) id where id is null or btrim(id) = ''
  ) then raise exception 'Exclusiones no válidas' using errcode = '22023'; end if;
  if p_exercise_ids is null then raise exception 'IDs de ejercicio requeridos' using errcode = '22023'; end if;
  select jsonb_build_object('sessionId', s.client_id, 'logId', chosen.client_id,
    'performedAt', s.completed_at, 'startedAt', s.started_at, 'weightKg', coalesce(chosen.working_weight_kg,
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
  where s.user_id = p_user_id and not (s.client_id = any(p_excluded_session_ids))
    and s.completed_at is not null and exists (
    select 1 from public.set_logs z where z.user_id = p_user_id and z.exercise_log_id = chosen.id and z.completed and not z.is_warmup
  )
  order by (left(s.client_id, 8) = 'initial-'), s.completed_at desc, s.started_at desc, s.client_id collate "C" desc
  limit 1;
  return result;
end; $$;

revoke all on function public.lifttrack_read_history_overview_v2(uuid,text,timestamptz,text[],date[]) from public, anon;
grant execute on function public.lifttrack_read_history_overview_v2(uuid,text,timestamptz,text[],date[]) to authenticated;
revoke all on function public.lifttrack_read_sessions_page_v3(uuid,text,jsonb,integer,jsonb,text[],text[],integer,timestamptz,timestamptz,boolean,text[]) from public, anon;
grant execute on function public.lifttrack_read_sessions_page_v3(uuid,text,jsonb,integer,jsonb,text[],text[],integer,timestamptz,timestamptz,boolean,text[]) to authenticated;
revoke all on function public.lifttrack_read_exercise_progress_v2(uuid,text[],integer,text[]) from public, anon;
grant execute on function public.lifttrack_read_exercise_progress_v2(uuid,text[],integer,text[]) to authenticated;
revoke all on function public.lifttrack_read_last_performance_v2(uuid,text[],text[]) from public, anon;
grant execute on function public.lifttrack_read_last_performance_v2(uuid,text[],text[]) to authenticated;
notify pgrst, 'reload schema';
commit;
