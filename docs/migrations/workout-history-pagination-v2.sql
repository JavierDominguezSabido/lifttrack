-- Bloque 8: segunda migración de lectura. Aplicación MANUAL, una sola vez.
-- Requiere workout-history-read-api.sql ya aplicado. No reemplaza ninguna v1.
-- Solo crea una función y sus permisos: no escribe datos ni modifica tablas,
-- índices, RLS ni funciones de guardado/sincronización.
--
-- CONTRATO DEL CLIENTE (no implica que el frontend ya esté adaptado):
-- p_timezone: zona IANA del dispositivo, para el día de la fecha histórica.
-- p_template_days: objeto { [template.id / stable_key]: dayOfWeek } construido
-- desde las templates que usa getSessionRoutineIdentity, solo días válidos.
-- Enviar {} si no hay rutina; NO usar todas las plantillas históricas del servidor.
-- Prioridad del día: sesión explícita válida > mapa de rutina actual > fecha
-- efectiva en zona local. Una plantilla eliminada no participa en el fallback.
-- p_exercise_ids: IDs originales/stable_key del grupo equivalente seleccionado,
-- calculado con exerciseIdentity.ts. No decidir equivalencias en SQL.
-- p_search_exercise_ids: IDs originales cuyo (exercise.name ?? log.exerciseId)
-- .toLowerCase().includes(search.trim().toLowerCase()) coincide EN EL CLIENTE.
-- Resolver sobre catálogo + IDs históricos de exerciseLogCounts del overview;
-- no requiere descargar páginas. NO expandir equivalencias para la búsqueda.
-- Ambos arrays son independientes: pueden coincidir con logs DISTINTOS.
-- NULL = filtro desactivado (también búsqueda vacía); [] = ninguna coincidencia.
-- p_from inclusivo / p_to exclusivo: límites locales calculados por el cliente.
-- p_day_of_week NULL = todos; 0=domingo ... 6=sábado.
--
-- totalCount: universo sin filtros (excluye initial- salvo opt-in explícito).
-- filteredCount: todo el resultado filtrado, ANTES del cursor, incluso página vacía.
-- Para mantener "X de Y sesiones": X=filteredCount, Y=totalCount, NO items.length.
-- items: detalle v1 de hasta p_limit sesiones. hasMore y nextCursor como v1.
-- Orden: fecha efectiva DESC, started_at DESC, client_id COLLATE "C" DESC.
-- Reenviar cursor íntegro y mantener filtros/contexto; reiniciarlo al cambiarlos.
-- Conteos exactos requieren recorrer metadatos coincidentes en el servidor;
-- no se descargan ni agregan todos los logs/series completos para contarlos.
-- Cada llamada STABLE usa una instantánea, NO compartida entre páginas. Ante
-- escrituras concurrentes el cliente debe invalidar/conciliar como en v1.
begin;

create function public.lifttrack_read_sessions_page_v2(
  p_user_id uuid, p_timezone text, p_template_days jsonb,
  p_limit integer default 20, p_cursor jsonb default null,
  p_exercise_ids text[] default null, p_search_exercise_ids text[] default null,
  p_day_of_week integer default null, p_from timestamptz default null,
  p_to timestamptz default null, p_include_initial boolean default false
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; cursor_date timestamptz; cursor_started timestamptz; cursor_id text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
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

revoke all on function public.lifttrack_read_sessions_page_v2(uuid,text,jsonb,integer,jsonb,text[],text[],integer,timestamptz,timestamptz,boolean) from public, anon;
grant execute on function public.lifttrack_read_sessions_page_v2(uuid,text,jsonb,integer,jsonb,text[],text[],integer,timestamptz,timestamptz,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
