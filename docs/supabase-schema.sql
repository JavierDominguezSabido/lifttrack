-- LiftTrack: esquema inicial para Supabase/PostgreSQL.
-- Ejecutar en un proyecto nuevo desde SQL Editor o mediante una migración.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  stable_key text not null check (length(trim(stable_key)) > 0),
  name text not null check (length(trim(name)) > 0),
  muscle_group text not null,
  equipment text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stable_key),
  unique (id, user_id)
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  stable_key text not null check (length(trim(stable_key)) > 0),
  name text not null check (length(trim(name)) > 0),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stable_key),
  unique (id, user_id)
);

create table if not exists public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  template_id uuid not null,
  exercise_id uuid not null,
  position integer not null check (position > 0),
  target_sets integer not null check (target_sets > 0),
  target_reps text not null check (length(trim(target_reps)) > 0),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, exercise_id),
  unique (template_id, position),
  unique (id, user_id),
  foreign key (template_id, user_id)
    references public.workout_templates(id, user_id) on delete cascade,
  foreign key (exercise_id, user_id)
    references public.exercises(id, user_id) on delete cascade
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null check (length(trim(client_id)) > 0),
  template_id uuid,
  name text not null check (length(trim(name)) > 0),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  volume_kg numeric(14, 2) check (volume_kg is null or volume_kg >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  unique (id, user_id),
  foreign key (template_id, user_id)
    references public.workout_templates(id, user_id) on delete set null (template_id)
);

create table if not exists public.workout_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  draft_key text not null check (length(trim(draft_key)) > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, draft_key),
  unique (id, user_id)
);

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null check (length(trim(client_id)) > 0),
  session_id uuid not null,
  exercise_id uuid not null,
  position integer not null check (position > 0),
  working_weight_kg numeric(8, 2)
    check (working_weight_kg is null or working_weight_kg >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  unique (session_id, position),
  unique (id, user_id),
  foreign key (session_id, user_id)
    references public.workout_sessions(id, user_id) on delete cascade,
  foreign key (exercise_id, user_id)
    references public.exercises(id, user_id) on delete no action
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null check (length(trim(client_id)) > 0),
  exercise_log_id uuid not null,
  set_number integer not null check (set_number > 0),
  reps integer check (reps is null or reps > 0),
  weight_kg numeric(8, 2) not null default 0 check (weight_kg >= 0),
  weight_override_kg numeric(8, 2)
    check (weight_override_kg is null or weight_override_kg >= 0),
  completed boolean not null default false,
  is_warmup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  unique (exercise_log_id, set_number),
  foreign key (exercise_log_id, user_id)
    references public.exercise_logs(id, user_id) on delete cascade,
  constraint completed_set_requires_reps
    check (not completed or (reps is not null and reps > 0))
);

create index if not exists exercises_user_id_idx
  on public.exercises(user_id);
create index if not exists workout_templates_user_day_idx
  on public.workout_templates(user_id, day_of_week);
create index if not exists template_exercises_template_position_idx
  on public.template_exercises(template_id, position);
create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions(user_id, started_at desc);
create index if not exists workout_drafts_user_day_idx
  on public.workout_drafts(user_id, day_of_week);
create index if not exists exercise_logs_session_position_idx
  on public.exercise_logs(session_id, position);
create index if not exists exercise_logs_exercise_idx
  on public.exercise_logs(exercise_id);
create index if not exists set_logs_exercise_log_number_idx
  on public.set_logs(exercise_log_id, set_number);

-- Mantiene el volumen de la sesión sincronizado a partir de series completadas.
create or replace function public.recalculate_workout_session_volume()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_exercise_log_id uuid;
  target_session_id uuid;
begin
  target_exercise_log_id = coalesce(new.exercise_log_id, old.exercise_log_id);

  select session_id
    into target_session_id
    from public.exercise_logs
   where id = target_exercise_log_id;

  if target_session_id is not null then
    update public.workout_sessions
       set volume_kg = (
         select coalesce(sum(sl.reps * sl.weight_kg), 0)
           from public.exercise_logs el
           join public.set_logs sl on sl.exercise_log_id = el.id
          where el.session_id = target_session_id
            and sl.completed
            and sl.reps is not null
       )
     where id = target_session_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists set_logs_recalculate_volume on public.set_logs;
create trigger set_logs_recalculate_volume
after insert or update or delete on public.set_logs
for each row execute function public.recalculate_workout_session_volume();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at before update on public.exercises
for each row execute function public.set_updated_at();
drop trigger if exists workout_templates_set_updated_at on public.workout_templates;
create trigger workout_templates_set_updated_at before update on public.workout_templates
for each row execute function public.set_updated_at();
drop trigger if exists template_exercises_set_updated_at on public.template_exercises;
create trigger template_exercises_set_updated_at before update on public.template_exercises
for each row execute function public.set_updated_at();
drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
for each row execute function public.set_updated_at();
drop trigger if exists workout_drafts_set_updated_at on public.workout_drafts;
create trigger workout_drafts_set_updated_at before update on public.workout_drafts
for each row execute function public.set_updated_at();
drop trigger if exists exercise_logs_set_updated_at on public.exercise_logs;
create trigger exercise_logs_set_updated_at before update on public.exercise_logs
for each row execute function public.set_updated_at();
drop trigger if exists set_logs_set_updated_at on public.set_logs;
create trigger set_logs_set_updated_at before update on public.set_logs
for each row execute function public.set_updated_at();

-- Crea automáticamente el perfil que poseen el resto de filas.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_drafts enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.set_logs enable row level security;

drop policy if exists "profiles_own_rows" on public.profiles;
create policy "profiles_own_rows"
on public.profiles
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "exercises_own_rows" on public.exercises;
create policy "exercises_own_rows"
on public.exercises
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "workout_templates_own_rows" on public.workout_templates;
create policy "workout_templates_own_rows"
on public.workout_templates
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "template_exercises_own_rows" on public.template_exercises;
create policy "template_exercises_own_rows"
on public.template_exercises
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "workout_sessions_own_rows" on public.workout_sessions;
create policy "workout_sessions_own_rows"
on public.workout_sessions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "workout_drafts_own_rows" on public.workout_drafts;
create policy "workout_drafts_own_rows"
on public.workout_drafts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "exercise_logs_own_rows" on public.exercise_logs;
create policy "exercise_logs_own_rows"
on public.exercise_logs
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "set_logs_own_rows" on public.set_logs;
create policy "set_logs_own_rows"
on public.set_logs
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.workout_templates to authenticated;
grant select, insert, update, delete on public.template_exercises to authenticated;
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_drafts to authenticated;
grant select, insert, update, delete on public.exercise_logs to authenticated;
grant select, insert, update, delete on public.set_logs to authenticated;
