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
  foreach t in array array['clubs','visits','weights','exercises','sets','shortcut_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
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

grant execute on function public.check_in(text, text)                   to authenticated;
grant execute on function public.log_visit(uuid, text, text)            to anon, authenticated;
grant execute on function public.log_weight(uuid, numeric, timestamptz) to anon, authenticated;
grant execute on function public.ping()                                 to anon, authenticated;
