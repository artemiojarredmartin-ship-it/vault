-- Vault — real leagues (Phase 1). Run once on a fresh Supabase project.
-- Friends sign in anonymously (no email needed), pick a name, and join by invite code.
-- Scores are derived from proofs: a day with no proof for a habit counts as a miss,
-- so no cron job is needed. Row Level Security keeps every league private to its members.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  color text not null default '#c99a3a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  tier text not null check (tier in ('mild', 'medium', 'spicy')),
  weeks int not null check (weeks between 1 and 5),
  tz text not null default 'America/New_York',
  starts_on date,                       -- null while friends are still joining (the lobby)
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  result jsonb,                         -- { loser, punishment, tier, vetoUsed, proved }
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  league_id uuid not null references public.leagues on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habits jsonb not null default '[]'::jsonb check (jsonb_typeof(habits) = 'array' and jsonb_array_length(habits) between 1 and 3),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('proof', 'chat')),
  habit_id text,
  day int,
  challenge text check (char_length(challenge) <= 200),
  photo_path text,
  body text check (char_length(body) <= 280),
  created_at timestamptz not null default now(),
  check (kind = 'chat' or (habit_id is not null and day is not null))
);
create unique index if not exists entries_one_proof_per_day on public.entries (league_id, user_id, habit_id, day) where kind = 'proof';
create index if not exists entries_by_league on public.entries (league_id, created_at desc);

create table if not exists public.sus_votes (
  entry_id uuid not null references public.entries on delete cascade,
  voter_id uuid not null default auth.uid() references auth.users on delete cascade,
  fake boolean not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, voter_id)
);

create table if not exists public.reactions (
  entry_id uuid not null references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  emoji text not null check (emoji in ('🔥', '😂', '👀', '💪')),
  primary key (entry_id, user_id, emoji)
);

create table if not exists public.punishments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues on delete cascade,
  text text not null check (char_length(btrim(text)) between 4 and 120),
  tier text not null check (tier in ('mild', 'medium', 'spicy')),
  proposed_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.punishment_votes (
  punishment_id uuid not null references public.punishments on delete cascade,
  voter_id uuid not null default auth.uid() references auth.users on delete cascade,
  yes boolean not null,
  primary key (punishment_id, voter_id)
);

-- ---------- helpers ----------
create or replace function public.is_member(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where league_id = l and user_id = auth.uid())
$$;

create or replace function public.shares_league(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members a join members b on a.league_id = b.league_id
    where a.user_id = auth.uid() and b.user_id = other)
$$;

-- Today's day number in the league's time zone (0 = first day). Null before the start.
create or replace function public.league_day(l uuid) returns int
language sql stable security definer set search_path = public as $$
  select ((now() at time zone tz)::date - starts_on) from leagues where id = l and starts_on is not null
$$;

create or replace function public.entry_league(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select league_id from entries where id = e
$$;

create or replace function public.punishment_league(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select league_id from punishments where id = p
$$;

-- A proof is only accepted for one of your own habits, on today's league day, during the season.
create or replace function public.can_post_proof(l uuid, h text, d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from leagues g join members m on m.league_id = g.id and m.user_id = auth.uid()
    where g.id = l and g.starts_on is not null and g.result is null
      and d = ((now() at time zone g.tz)::date - g.starts_on)
      and d between 0 and g.weeks * 7 - 1
      and exists (select 1 from jsonb_array_elements(m.habits) x where x->>'id' = h))
$$;

-- ---------- RPCs (league lifecycle) ----------
create or replace function public.create_league(p_name text, p_tier text, p_weeks int, p_habits jsonb, p_tz text default 'America/New_York')
returns public.leagues language plpgsql security definer set search_path = public as $$
declare g leagues;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into leagues (name, tier, weeks, tz, created_by) values (btrim(p_name), p_tier, p_weeks, coalesce(p_tz, 'America/New_York'), auth.uid()) returning * into g;
  insert into members (league_id, user_id, habits) values (g.id, auth.uid(), p_habits);
  return g;
end $$;

create or replace function public.join_league(p_code text, p_habits jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare g leagues; n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from leagues where code = upper(btrim(p_code));
  if g.id is null then raise exception 'No league with that code'; end if;
  if g.starts_on is not null then raise exception 'That season already started'; end if;
  select count(*) into n from members where league_id = g.id;
  if n >= 12 then raise exception 'That league is full'; end if;
  insert into members (league_id, user_id, habits) values (g.id, auth.uid(), p_habits)
    on conflict (league_id, user_id) do update set habits = excluded.habits;
  return g.id;
end $$;

-- Only the creator can start the season; it starts today in the league's time zone.
create or replace function public.start_league(p_league uuid) returns public.leagues
language plpgsql security definer set search_path = public as $$
declare g leagues; n int;
begin
  select * into g from leagues where id = p_league;
  if g.created_by is distinct from auth.uid() then raise exception 'Only the league creator can start it'; end if;
  if g.starts_on is not null then raise exception 'Already started'; end if;
  select count(*) into n from members where league_id = g.id;
  if n < 2 then raise exception 'Invite at least one friend first'; end if;
  update leagues set starts_on = (now() at time zone tz)::date where id = g.id returning * into g;
  return g;
end $$;

-- League preview by invite code (name, tier, punishment level) so people see what they're joining.
create or replace function public.preview_league(p_code text)
returns table (name text, tier text, weeks int, members int, started boolean)
language sql stable security definer set search_path = public as $$
  select g.name, g.tier, g.weeks, (select count(*)::int from members m where m.league_id = g.id), g.starts_on is not null
  from leagues g where g.code = upper(btrim(p_code))
$$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.members enable row level security;
alter table public.entries enable row level security;
alter table public.sus_votes enable row level security;
alter table public.reactions enable row level security;
alter table public.punishments enable row level security;
alter table public.punishment_votes enable row level security;

create policy "profiles: read self and league-mates" on public.profiles for select to authenticated using (id = auth.uid() or public.shares_league(id));
create policy "profiles: create own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "leagues: members read" on public.leagues for select to authenticated using (public.is_member(id));
create policy "leagues: creator updates result" on public.leagues for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "members: read league-mates" on public.members for select to authenticated using (public.is_member(league_id));
create policy "members: edit own habits in lobby" on public.members for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.leagues g where g.id = league_id and g.starts_on is null))
  with check (user_id = auth.uid());
create policy "members: leave" on public.members for delete to authenticated using (user_id = auth.uid());

create policy "entries: members read" on public.entries for select to authenticated using (public.is_member(league_id));
create policy "entries: post own" on public.entries for insert to authenticated with check (
  user_id = auth.uid() and public.is_member(league_id)
  and (kind = 'chat' or public.can_post_proof(league_id, habit_id, day)));
create policy "entries: delete own chat" on public.entries for delete to authenticated using (user_id = auth.uid() and kind = 'chat');

create policy "sus: members read" on public.sus_votes for select to authenticated using (public.is_member(public.entry_league(entry_id)));
create policy "sus: vote on others' proofs" on public.sus_votes for insert to authenticated with check (
  voter_id = auth.uid() and public.is_member(public.entry_league(entry_id))
  and exists (select 1 from public.entries e where e.id = entry_id and e.kind = 'proof' and e.user_id <> auth.uid()));

create policy "reactions: members read" on public.reactions for select to authenticated using (public.is_member(public.entry_league(entry_id)));
create policy "reactions: add own" on public.reactions for insert to authenticated with check (user_id = auth.uid() and public.is_member(public.entry_league(entry_id)));
create policy "reactions: remove own" on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy "punishments: members read" on public.punishments for select to authenticated using (public.is_member(league_id));
create policy "punishments: members suggest" on public.punishments for insert to authenticated with check (proposed_by = auth.uid() and public.is_member(league_id));
create policy "punishment votes: members read" on public.punishment_votes for select to authenticated using (public.is_member(public.punishment_league(punishment_id)));
create policy "punishment votes: members vote" on public.punishment_votes for insert to authenticated with check (voter_id = auth.uid() and public.is_member(public.punishment_league(punishment_id)));

-- ---------- proof photos (private bucket: <league_id>/<user_id>/<file>.jpg) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "proofs: upload own" on storage.objects for insert to authenticated with check (
  bucket_id = 'proofs' and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "proofs: league-mates view" on storage.objects for select to authenticated using (
  bucket_id = 'proofs' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ---------- live updates for the group feed ----------
alter publication supabase_realtime add table public.entries, public.sus_votes, public.reactions;

-- =====================================================================
-- Follow-up 1 (vault_leagues_lock_functions): keep helpers out of the public API.
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_member(uuid) set schema private;
alter function public.shares_league(uuid) set schema private;
alter function public.league_day(uuid) set schema private;
alter function public.entry_league(uuid) set schema private;
alter function public.punishment_league(uuid) set schema private;
alter function public.can_post_proof(uuid, text, int) set schema private;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.create_league(text, text, int, jsonb, text) from public, anon;
revoke execute on function public.join_league(text, jsonb) from public, anon;
revoke execute on function public.start_league(uuid) from public, anon;
revoke execute on function public.preview_league(text) from public, anon;
grant execute on function public.create_league(text, text, int, jsonb, text) to authenticated;
grant execute on function public.join_league(text, jsonb) to authenticated;
grant execute on function public.start_league(uuid) to authenticated;
grant execute on function public.preview_league(text) to authenticated;

-- =====================================================================
-- Follow-up 2 (vault_leagues_finale): finale RPCs; the host can no longer edit league rows directly.
-- See the Supabase migration of the same name for set_result / use_veto / mark_served.
-- =====================================================================
drop policy if exists "leagues: creator updates result" on public.leagues;
alter publication supabase_realtime add table public.leagues, public.members;

-- =====================================================================
-- v1.0 (vault_v2_consequence_and_chips + vault_proofs_delete_own)
-- Chips: 10 a day split across 1–3 habits (private.valid_habits checks the split on create/join).
-- The group votes on one consequence in the lobby (consequence_votes); start_league requires
-- everyone to have voted and locks the top pick into leagues.consequence.
-- mark_served(p_league): after the season, a player adds themself to result.served.
-- Players can delete their own proof photos.
-- See those Supabase migrations for the exact SQL.
-- =====================================================================
