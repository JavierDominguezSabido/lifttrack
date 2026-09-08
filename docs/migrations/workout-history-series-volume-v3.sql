-- Bloque 9. Aditiva: solo overview v3 y sus permisos. Aplicación manual.
-- Volumen: reps * (override ?? weight) de series completadas, incluidos warmups.
-- No usa volume_kg almacenado. Conserva todas las demás reglas de overview v2.
BEGIN;
create function public.lifttrack_read_history_overview_v3(
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
    'totalVolume', (select coalesce(sum(coalesce(z.reps, 0) * coalesce(z.weight_override_kg, z.weight_kg)), 0)
      from sessions s
      join public.exercise_logs l on l.session_id = s.id and l.user_id = p_user_id
      join public.set_logs z on z.exercise_log_id = l.id and z.user_id = p_user_id
      where z.completed = true),
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
REVOKE ALL ON FUNCTION public.lifttrack_read_history_overview_v3(uuid,text,timestamptz,text[],date[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifttrack_read_history_overview_v3(uuid,text,timestamptz,text[],date[]) TO authenticated;
COMMIT;

