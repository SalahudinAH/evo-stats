-- =====================================================================
--  EVO Stats - database schema
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  Safe to re-run: it only creates things that don't exist yet and
--  replaces the functions.
-- =====================================================================

-- ---------- Tables ---------------------------------------------------

create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.visits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  visited_at timestamptz not null default now(),
  source     text not null default 'manual'
             check (source in ('manual', 'arrival', 'nfc', 'wallet', 'shortcut')),
  club_name  text
);
create index if not exists visits_user_time on public.visits (user_id, visited_at desc);

create table if not exists public.weights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  kg          numeric(5,2) not null check (kg > 20 and kg < 400),
  source      text not null default 'manual' check (source in ('manual', 'health')),
  unique (user_id, measured_at)
);

create table if not exists public.exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete cascade,
  performed_at timestamptz not null default now(),
  weight_kg    numeric(6,2) not null check (weight_kg >= 0),
  reps         int not null check (reps between 1 and 100)
);
create index if not exists sets_exercise_time on public.sets (exercise_id, performed_at);

-- ---------- Workout plans (added in the Train redesign) --------------
-- Re-running this file on an existing database adds the new columns and
-- tables; your old exercises and sets are kept.

alter table public.exercises add column if not exists muscle text;
-- Photo path in the free-exercise-db library, e.g. 'Barbell_Squat/0.jpg'.
alter table public.exercises add column if not exists image text;

-- A routine is one workout in your plan, e.g. "Push day".
create table if not exists public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

-- The exercises in a routine, in order, with a target like 4 × 6-8.
create table if not exists public.routine_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id  uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  position    int not null default 0,
  target_sets int not null default 3 check (target_sets between 1 and 20),
  rep_min     int not null default 8 check (rep_min between 1 and 100),
  rep_max     int not null default 12 check (rep_max between 1 and 100)
);
create index if not exists routine_exercises_routine on public.routine_exercises (routine_id, position);

-- One finished session at the gym. Its sets point back to it.
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id  uuid references public.routines(id) on delete set null,
  name        text not null,
  started_at  timestamptz not null,
  finished_at timestamptz not null,
  feel        text,
  notes       text
);
create index if not exists workouts_user_time on public.workouts (user_id, started_at desc);

alter table public.sets add column if not exists workout_id uuid references public.workouts(id) on delete cascade;
alter table public.sets add column if not exists position   int;
alter table public.sets add column if not exists is_warmup  boolean not null default false;
create index if not exists sets_workout on public.sets (workout_id);

-- ---------- Food & calories -------------------------------------------

-- Your own food library: things you eat often, with their macros.
create table if not exists public.foods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  serving    text not null default '1 serving',
  kcal       int not null check (kcal between 0 and 10000),
  protein    numeric(6,1) not null default 0,
  carbs      numeric(6,1) not null default 0,
  fat        numeric(6,1) not null default 0,
  created_at timestamptz not null default now()
);

-- What you ate. Macros are copied in, so editing a food later
-- doesn't change days you've already logged.
-- Barcode (EAN/UPC) when the food came from a scan, so the next scan of the same product is instant.
alter table public.foods add column if not exists barcode text;
create index if not exists foods_user_barcode on public.foods (user_id, barcode);

create table if not exists public.food_entries (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_at timestamptz not null default now(),
  meal     text not null default 'snack' check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id  uuid references public.foods(id) on delete set null,
  name     text not null,
  serving  text not null default '',
  kcal     int not null check (kcal between 0 and 10000),
  protein  numeric(6,1) not null default 0,
  carbs    numeric(6,1) not null default 0,
  fat      numeric(6,1) not null default 0
);
create index if not exists food_entries_user_time on public.food_entries (user_id, eaten_at);

-- Daily calorie/macro goals and how many workouts a week you plan.
create table if not exists public.user_settings (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kcal              int not null default 2600,
  protein           int not null default 160,
  carbs             int not null default 300,
  fat               int not null default 80,
  workouts_per_week int not null default 4 check (workouts_per_week between 1 and 14)
);

-- Body stats used to estimate maintenance calories, and the plan picked
-- at first sign-in. onboarded = the setup screen has been done or skipped.
alter table public.user_settings add column if not exists sex            text check (sex in ('male', 'female'));
alter table public.user_settings add column if not exists birth_year     int check (birth_year between 1900 and 2100);
alter table public.user_settings add column if not exists height_cm      int check (height_cm between 100 and 250);
alter table public.user_settings add column if not exists activity       text check (activity in ('sedentary', 'light', 'moderate', 'active'));
alter table public.user_settings add column if not exists goal_weight_kg numeric(5,1) check (goal_weight_kg between 30 and 300);
alter table public.user_settings add column if not exists plan           text;
alter table public.user_settings add column if not exists onboarded      boolean not null default false;

-- Secret key your iPhone Shortcuts use to log visits / weight.
-- Created from the app's Settings tab; never stored in the web app's code.
create table if not exists public.shortcut_tokens (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security: you only ever see your own rows ------

do $$
declare t text;
begin
  foreach t in array array['clubs','visits','weights','exercises','sets','shortcut_tokens',
                           'routines','routine_exercises','workouts','foods','food_entries','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- With sign-ups open, also stop anyone from pointing their rows at someone
-- else's exercise, workout, routine or food (if they guessed its id).
-- These are "restrictive" policies: they add to own_rows, never loosen it.
do $$
declare r record;
begin
  for r in select * from (values
    ('sets',              'exists (select 1 from public.exercises x where x.id = exercise_id and x.user_id = auth.uid())
                           and (workout_id is null or exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))'),
    ('routine_exercises', 'exists (select 1 from public.exercises x where x.id = exercise_id and x.user_id = auth.uid())
                           and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())'),
    ('workouts',          'routine_id is null or exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())'),
    ('food_entries',      'food_id is null or exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid())')
  ) as t(tbl, chk) loop
    execute format('drop policy if exists own_refs_insert on public.%I', r.tbl);
    execute format('drop policy if exists own_refs_update on public.%I', r.tbl);
    execute format('create policy own_refs_insert on public.%I as restrictive for insert to authenticated with check (%s)', r.tbl, r.chk);
    execute format('create policy own_refs_update on public.%I as restrictive for update to authenticated using (true) with check (%s)', r.tbl, r.chk);
  end loop;
end $$;

-- ---------- Visit logging (shared by the app and Shortcuts) ----------
-- Visits within 3 hours of the previous one count as the same session,
-- so arriving + tapping the sticker + pressing the button = 1 visit.

create or replace function public._log_visit(p_user uuid, p_source text, p_club text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last   timestamptz;
  v_logged boolean := false;
  v_count  int;
  v_source text := case when p_source in ('manual','arrival','nfc','wallet','shortcut')
                        then p_source else 'shortcut' end;
  v_club   text := nullif(trim(coalesce(p_club, '')), '');
begin
  select max(visited_at) into v_last from visits where user_id = p_user;

  if v_last is null or v_last < now() - interval '3 hours' then
    insert into visits (user_id, source, club_name) values (p_user, v_source, v_club);
    v_logged := true;
  elsif v_club is not null then
    update visits set club_name = coalesce(club_name, v_club)
     where user_id = p_user and visited_at = v_last;
  end if;

  select count(*) into v_count
    from visits where user_id = p_user and visited_at > now() - interval '30 days';

  return json_build_object(
    'logged', v_logged,
    'last_30_days', v_count,
    'message', case when v_logged then 'Visit logged. ' else 'Already logged this session. ' end
               || v_count || ' visits in the last 30 days.'
  );
end $$;

-- Called by the web app (signed in).
create or replace function public.check_in(p_source text default 'manual', p_club text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  return public._log_visit(auth.uid(), p_source, p_club);
end $$;

-- Called by iPhone Shortcuts (no login, uses your secret Shortcut key).
create or replace function public.log_visit(p_token uuid, p_source text default 'shortcut', p_club text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  select user_id into v_user from shortcut_tokens where token = p_token;
  if v_user is null then
    raise exception 'invalid shortcut key' using errcode = '28000';
  end if;
  return public._log_visit(v_user, p_source, p_club);
end $$;

-- Called by the daily "sync weight from Health" Shortcut.
create or replace function public.log_weight(p_token uuid, p_kg numeric, p_measured_at timestamptz default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_rows int;
begin
  select user_id into v_user from shortcut_tokens where token = p_token;
  if v_user is null then
    raise exception 'invalid shortcut key' using errcode = '28000';
  end if;

  insert into weights (user_id, kg, measured_at, source)
  values (v_user, round(p_kg, 2), coalesce(p_measured_at, now()), 'health')
  on conflict (user_id, measured_at) do nothing;
  get diagnostics v_rows = row_count;

  return json_build_object(
    'saved', v_rows > 0,
    'message', case when v_rows > 0 then 'Weight saved: ' || round(p_kg, 1) || ' kg'
                    else 'Weight already up to date' end
  );
end $$;

-- Saves a finished workout and all its sets in one go, so a dropped
-- connection at the gym can never leave half a workout behind.
-- Runs as you (security invoker), so the row-level rules above apply.
create or replace function public.save_workout(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  insert into workouts (routine_id, name, started_at, finished_at, feel, notes)
  values (nullif(p->>'routine_id', '')::uuid,
          coalesce(nullif(trim(p->>'name'), ''), 'Workout'),
          (p->>'started_at')::timestamptz,
          (p->>'finished_at')::timestamptz,
          nullif(p->>'feel', ''),
          nullif(trim(coalesce(p->>'notes', '')), ''))
  returning id into v_id;

  insert into sets (workout_id, exercise_id, performed_at, weight_kg, reps, position, is_warmup)
  select v_id,
         (s->>'exercise_id')::uuid,
         (p->>'finished_at')::timestamptz,
         (s->>'weight_kg')::numeric,
         (s->>'reps')::int,
         (s->>'position')::int,
         coalesce((s->>'is_warmup')::boolean, false)
    from jsonb_array_elements(coalesce(p->'sets', '[]'::jsonb)) as s;

  return v_id;
end $$;

-- "Delete my account" in Settings. Removes the login; every table points at
-- auth.users with "on delete cascade", so all of that user's data goes too.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Harmless keep-alive used by the GitHub Action so the free project never pauses.
create or replace function public.ping()
returns text
language sql
stable
as $$ select 'ok'::text $$;

-- ---------- Who may call what ----------------------------------------

revoke all on function public._log_visit(uuid, text, text) from public, anon, authenticated;
revoke all on function public.check_in(text, text)          from public, anon;
revoke all on function public.log_visit(uuid, text, text)   from public;
revoke all on function public.log_weight(uuid, numeric, timestamptz) from public;

revoke all on function public.save_workout(jsonb)                from public, anon;
revoke all on function public.delete_my_account()                from public, anon;

grant execute on function public.check_in(text, text)                   to authenticated;
grant execute on function public.save_workout(jsonb)                    to authenticated;
grant execute on function public.delete_my_account()                    to authenticated;
grant execute on function public.log_visit(uuid, text, text)            to anon, authenticated;
grant execute on function public.log_weight(uuid, numeric, timestamptz) to anon, authenticated;
grant execute on function public.ping()                                 to anon, authenticated;
