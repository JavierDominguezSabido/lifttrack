-- LiftTrack: borradores de entrenamiento sincronizados.
-- Ejecutar en Supabase SQL Editor sobre una base con el esquema principal ya aplicado.

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

create index if not exists workout_drafts_user_day_idx
  on public.workout_drafts(user_id, day_of_week);

drop trigger if exists workout_drafts_set_updated_at on public.workout_drafts;
create trigger workout_drafts_set_updated_at
before update on public.workout_drafts
for each row execute function public.set_updated_at();

alter table public.workout_drafts enable row level security;

drop policy if exists "workout_drafts_own_rows" on public.workout_drafts;
create policy "workout_drafts_own_rows"
on public.workout_drafts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on public.workout_drafts to authenticated;
