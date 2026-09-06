-- Bloque 3. Requiere atomic-workout-sessions.sql. No modifica datos existentes.
begin;

create table if not exists public.sync_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  primary key (user_id, operation_id)
);
alter table public.sync_receipts enable row level security;
drop policy if exists sync_receipts_owner on public.sync_receipts;
create policy sync_receipts_owner on public.sync_receipts to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.sync_receipts to authenticated;

create or replace function public.sync_revision(p_user_id uuid, p_resource text)
returns text language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; sid uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Cuenta incorrecta' using errcode = '42501';
  end if;
  if p_resource = 'routine' then
    if not exists(select 1 from public.exercises where user_id = p_user_id)
      and not exists(select 1 from public.workout_templates where user_id = p_user_id) then return 'empty'; end if;
    select jsonb_build_array(
      (select jsonb_agg(to_jsonb(t) order by id) from public.exercises t where user_id = p_user_id),
      (select jsonb_agg(to_jsonb(t) order by id) from public.workout_templates t where user_id = p_user_id),
      (select jsonb_agg(to_jsonb(t) order by id) from public.template_exercises t where user_id = p_user_id)
    ) into snapshot;
  elsif left(p_resource, 8) = 'session:' then
    select id into sid from public.workout_sessions where user_id = p_user_id and client_id = substr(p_resource, 9);
    if sid is null then return 'empty'; end if;
    select jsonb_build_array(
      (select to_jsonb(t) from public.workout_sessions t where id = sid and user_id = p_user_id),
      (select jsonb_agg(to_jsonb(t) order by id) from public.exercise_logs t where session_id = sid and user_id = p_user_id),
      (select jsonb_agg(to_jsonb(t) order by t.id) from public.set_logs t join public.exercise_logs e on e.id = t.exercise_log_id where e.session_id = sid and t.user_id = p_user_id)
    ) into snapshot;
  elsif left(p_resource, 6) = 'draft:' then
    select to_jsonb(t) into snapshot from public.workout_drafts t where user_id = p_user_id and draft_key = substr(p_resource, 7);
    if snapshot is null then return 'empty'; end if;
  else raise exception 'Recurso no válido'; end if;
  return md5(snapshot::text);
end; $$;

create or replace function public.sync_session_versions(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'Cuenta incorrecta' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg('session:' || client_id, public.sync_revision(p_user_id, 'session:' || client_id)) from public.workout_sessions where user_id = p_user_id), '{}'::jsonb);
end; $$;

create or replace function public.apply_sync_operation(
  p_user_id uuid, p_operation_id uuid, p_resource text, p_expected text, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision text; request_hash text; previous public.sync_receipts%rowtype;
  result jsonb; saved jsonb; entry jsonb; item jsonb; template_id uuid; exercise_id uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'Cuenta incorrecta' using errcode = '42501'; end if;
  -- Serializa todos los nuevos escritores de esta cuenta, incluidas rutinas y sesiones.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  request_hash := md5(jsonb_build_array(p_resource, p_expected, p_payload)::text);
  select * into previous from public.sync_receipts where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if previous.request_hash <> request_hash then raise exception 'Identificador de operación reutilizado con otro contenido'; end if;
    return previous.result;
  end if;
  current_revision := public.sync_revision(p_user_id, p_resource);
  if p_expected is distinct from current_revision then
    return jsonb_build_object('conflict', true, 'revision', current_revision);
  end if;
  insert into public.profiles(id) values(p_user_id) on conflict(id) do nothing;
  if left(p_resource, 8) = 'session:' then
    if p_payload ->> 'action' = 'delete' then
      delete from public.workout_sessions where user_id = p_user_id and client_id = substr(p_resource, 9);
    else
      if p_payload #>> '{session,id}' is distinct from substr(p_resource, 9) then raise exception 'Sesión incorrecta'; end if;
      saved := public.save_workout_session(p_user_id, p_payload -> 'session', p_payload -> 'exercises', p_payload -> 'template');
    end if;
  elsif left(p_resource, 6) = 'draft:' then
    if p_payload ->> 'action' = 'delete' then
      delete from public.workout_drafts where user_id = p_user_id and draft_key = substr(p_resource, 7);
    else
      insert into public.workout_drafts(user_id, draft_key, day_of_week, payload)
      values(p_user_id, substr(p_resource, 7), (p_payload ->> 'dayOfWeek')::smallint, p_payload -> 'draft')
      on conflict(user_id, draft_key) do update set day_of_week = excluded.day_of_week, payload = excluded.payload;
      select jsonb_build_object('updatedAt', updated_at) into saved from public.workout_drafts where user_id = p_user_id and draft_key = substr(p_resource, 7);
    end if;
  elsif p_resource = 'routine' then
    if jsonb_typeof(p_payload -> 'exercises') is distinct from 'array' or jsonb_typeof(p_payload -> 'templates') is distinct from 'array' then raise exception 'Rutina incorrecta'; end if;
    for entry in select value from jsonb_array_elements(p_payload -> 'exercises') loop
      insert into public.exercises(user_id, stable_key, name, muscle_group, equipment, notes, active)
      values(p_user_id, entry ->> 'id', entry ->> 'name', coalesce(entry ->> 'muscleGroup', 'Sin grupo'), entry ->> 'equipment', entry ->> 'notes', coalesce((entry ->> 'active')::boolean, true))
      on conflict(user_id, stable_key) do update set name = excluded.name, muscle_group = excluded.muscle_group, equipment = excluded.equipment, notes = excluded.notes, active = excluded.active;
    end loop;
    delete from public.template_exercises where user_id = p_user_id;
    update public.workout_templates set active = false where user_id = p_user_id and active;
    for entry in select value from jsonb_array_elements(p_payload -> 'templates') loop
      insert into public.workout_templates(user_id, stable_key, name, day_of_week, notes, active)
      values(p_user_id, entry ->> 'id', entry ->> 'name', (entry ->> 'dayOfWeek')::smallint, entry ->> 'notes', true)
      on conflict(user_id, stable_key) do update set name = excluded.name, day_of_week = excluded.day_of_week, notes = excluded.notes, active = true returning id into template_id;
      if jsonb_typeof(entry -> 'exercises') is distinct from 'array' then raise exception 'Ejercicios de rutina incorrectos'; end if;
      for item in select value from jsonb_array_elements(entry -> 'exercises') loop
        select id into strict exercise_id from public.exercises where user_id = p_user_id and stable_key = item ->> 'exerciseId';
        insert into public.template_exercises(user_id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, notes)
        values(p_user_id, template_id, exercise_id, (item ->> 'order')::integer, (item ->> 'targetSets')::integer, item ->> 'targetReps', (item ->> 'restSeconds')::integer, item ->> 'notes');
      end loop;
    end loop;
  end if;
  result := jsonb_build_object('conflict', false, 'revision', public.sync_revision(p_user_id, p_resource), 'saved', saved);
  insert into public.sync_receipts(user_id, operation_id, request_hash, result) values(p_user_id, p_operation_id, request_hash, result);
  return result;
end; $$;

revoke all on function public.sync_revision(uuid,text), public.sync_session_versions(uuid), public.apply_sync_operation(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.sync_revision(uuid,text), public.sync_session_versions(uuid), public.apply_sync_operation(uuid,uuid,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
