-- =============================================================================
-- BOLT · Tracker Razvan — tabelle, sicurezza e metriche (Supabase / PostgreSQL)
-- Da incollare UNA volta nel SQL Editor di Supabase. Si può rieseguire senza danni.
-- L'email dell'amministratore NON è in questo file (che è pubblico su GitHub):
-- si aggiunge con l'ultima riga del blocco consegnato in chat.
-- =============================================================================

-- --- Eventi anonimi del gioco -------------------------------------------------
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  player_id uuid not null,
  session_id uuid not null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  version text
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_name_created_idx on public.events (name, created_at desc);
create index if not exists events_player_created_idx on public.events (player_id, created_at);

-- --- Roadmap (solo amministratore) --------------------------------------------
create table if not exists public.roadmap (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 120),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --- Chi può vedere il Tracker: elenco privato di email ------------------------
create table if not exists public.tracker_admins (email text primary key);

create or replace function public.is_tracker_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tracker_admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- --- Sicurezza (Row Level Security) -------------------------------------------
alter table public.events enable row level security;
alter table public.roadmap enable row level security;
alter table public.tracker_admins enable row level security; -- nessuna policy: invisibile dalle API

revoke all on public.events from anon, authenticated;
revoke all on public.roadmap from anon, authenticated;
revoke all on public.tracker_admins from anon, authenticated;
grant insert (created_at, player_id, session_id, name, props, version) on public.events to anon, authenticated;
grant select on public.events to authenticated;
grant select, insert, update, delete on public.roadmap to authenticated;

drop policy if exists events_insert_anon on public.events;
create policy events_insert_anon on public.events for insert to anon, authenticated
with check (
  name ~ '^[a-z][a-z0-9_]{1,31}$'
  and pg_column_size(props) <= 4096
  and jsonb_typeof(props) = 'object'
  and (version is null or char_length(version) <= 40)
  and created_at > now() - interval '7 days'
  and created_at < now() + interval '10 minutes'
);

drop policy if exists events_select_admin on public.events;
create policy events_select_admin on public.events for select to authenticated using (public.is_tracker_admin());

drop policy if exists roadmap_admin on public.roadmap;
create policy roadmap_admin on public.roadmap for all to authenticated
using (public.is_tracker_admin()) with check (public.is_tracker_admin());

-- --- "Cancella i miei dati" dal gioco -----------------------------------------
create or replace function public.forget_player(p_player uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.events where player_id = p_player;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.forget_player(uuid) from public;
grant execute on function public.forget_player(uuid) to anon, authenticated;

-- --- Pulizia automatica: eventi oltre 12 mesi ---------------------------------
create or replace function public.purge_old_events() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.events where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_old_events() from public;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('bolt-purge-events') where exists (select 1 from cron.job where jobname = 'bolt-purge-events');
  perform cron.schedule('bolt-purge-events', '17 3 * * *', 'select public.purge_old_events()');
exception when others then
  raise notice 'pg_cron non disponibile: la pulizia automatica non è stata programmata (%).', sqlerrm;
end;
$$;

-- =============================================================================
-- Metriche: funzioni per l'app Tracker (una chiamata per scheda).
-- Rispondono solo all'amministratore; i giorni sono quelli di Roma.
-- =============================================================================

create or replace function public.tracker_day(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Europe/Rome')::date $$;

-- Numeri chiave: settimana corrente (ultimi 7 giorni) e precedente, come conteggi grezzi.
create or replace function public.tracker_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t date := public.tracker_day(now()); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with ev as (
    select player_id, public.tracker_day(created_at) d, name, props from public.events
    where created_at > now() - interval '40 days'
  ),
  firsts as (
    select player_id, min(public.tracker_day(created_at)) fd from public.events group by player_id
  ),
  first_open as (
    select distinct on (player_id) player_id, props from public.events
    where name = 'app_open' order by player_id, created_at
  ),
  act as (select distinct player_id, d from ev),
  d1 as (
    select f.player_id, f.fd, exists (select 1 from act a where a.player_id = f.player_id and a.d = f.fd + 1) back
    from firsts f where f.fd between t - 14 and t - 1
  )
  select jsonb_build_object(
    'active_cur', (select count(distinct player_id) from act where d between t - 6 and t),
    'active_prev', (select count(distinct player_id) from act where d between t - 13 and t - 7),
    'd1_size_cur', (select count(*) from d1 where fd between t - 7 and t - 1),
    'd1_back_cur', (select count(*) from d1 where fd between t - 7 and t - 1 and back),
    'd1_size_prev', (select count(*) from d1 where fd between t - 14 and t - 8),
    'd1_back_prev', (select count(*) from d1 where fd between t - 14 and t - 8 and back),
    'rating_sum_cur', (select coalesce(sum((props->>'rating')::numeric), 0) from ev where name = 'feedback' and d between t - 6 and t and props ? 'rating'),
    'rating_n_cur', (select count(*) from ev where name = 'feedback' and d between t - 6 and t and props ? 'rating'),
    'rating_sum_prev', (select coalesce(sum((props->>'rating')::numeric), 0) from ev where name = 'feedback' and d between t - 13 and t - 7 and props ? 'rating'),
    'rating_n_prev', (select count(*) from ev where name = 'feedback' and d between t - 13 and t - 7 and props ? 'rating'),
    'invited_new_cur', (select count(*) from firsts f join first_open o using (player_id) where f.fd between t - 6 and t and o.props ? 'invite'),
    'invited_new_prev', (select count(*) from firsts f join first_open o using (player_id) where f.fd between t - 13 and t - 7 and o.props ? 'invite')
  ) into r;
  return r;
end;
$$;

-- Serie giornaliera: attivi, nuovi, di ritorno, sessioni, durata media, errori JS, livelli finiti.
create or replace function public.tracker_daily(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t date := public.tracker_day(now()); n integer := least(greatest(coalesce(p_days, 7), 1), 180); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with days as (select generate_series(t - n + 1, t, interval '1 day')::date d),
  ev as (
    select player_id, session_id, public.tracker_day(created_at) d, name, props from public.events
    where created_at > now() - make_interval(days => n + 2)
  ),
  firsts as (select player_id, min(public.tracker_day(created_at)) fd from public.events group by player_id),
  agg as (
    select d,
      count(distinct player_id) active,
      count(distinct session_id) sessions,
      avg((props->>'seconds')::numeric) filter (where name = 'session_end' and props ? 'seconds') avg_session_s,
      count(*) filter (where name = 'js_error') errors,
      count(*) filter (where name = 'level_end') level_ends
    from ev group by d
  ),
  news as (select fd d, count(*) n from firsts group by fd)
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', days.d,
    'active', coalesce(agg.active, 0),
    'new', coalesce(news.n, 0),
    'returning', greatest(coalesce(agg.active, 0) - coalesce(news.n, 0), 0),
    'sessions', coalesce(agg.sessions, 0),
    'avg_session_s', round(coalesce(agg.avg_session_s, 0), 1),
    'errors', coalesce(agg.errors, 0),
    'level_ends', coalesce(agg.level_ends, 0)
  ) order by days.d), '[]'::jsonb) into r
  from days left join agg on agg.d = days.d left join news on news.d = days.d;
  return r;
end;
$$;

-- Ritenzione per coorte (giorno del primo accesso): dimensione, tornati il giorno dopo e dopo 7 giorni.
create or replace function public.tracker_cohorts(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t date := public.tracker_day(now()); n integer := least(greatest(coalesce(p_days, 30), 1), 60); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with firsts as (select player_id, min(public.tracker_day(created_at)) fd from public.events group by player_id),
  act as (select distinct player_id, public.tracker_day(created_at) d from public.events where created_at > now() - make_interval(days => n + 10)),
  c as (
    select f.fd,
      count(*) size,
      count(*) filter (where exists (select 1 from act a where a.player_id = f.player_id and a.d = f.fd + 1)) d1,
      count(*) filter (where exists (select 1 from act a where a.player_id = f.player_id and a.d = f.fd + 7)) d7
    from firsts f where f.fd between t - n + 1 and t group by f.fd
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', fd, 'size', size, 'd1', d1, 'd7', d7, 'd1_ready', fd + 1 <= t, 'd7_ready', fd + 7 <= t
  ) order by fd desc), '[]'::jsonb) into r from c;
  return r;
end;
$$;

-- Dispositivi, sistemi, browser, lingue, PWA (giocatori distinti nel periodo).
create or replace function public.tracker_breakdown(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 7), 1), 180); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with o as (
    select distinct on (player_id) player_id, props from public.events
    where name = 'app_open' and created_at > now() - make_interval(days => n)
    order by player_id, created_at desc
  ),
  k(key) as (values ('device'), ('browser'), ('lang'), ('pwa')),
  g as (select k.key, coalesce(o.props->>k.key, '?') v, count(*) c from o cross join k group by k.key, v)
  select coalesce(jsonb_object_agg(key, items), '{}'::jsonb) into r from (
    select key, jsonb_agg(jsonb_build_object('k', v, 'n', c) order by c desc) items from g group by key
  ) x;
  return r;
end;
$$;

-- Fonti: da dove arrivano i giocatori nuovi del periodo (prima apertura) e le aperture totali.
create or replace function public.tracker_sources(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 7), 1), 180); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with first_open as (
    select distinct on (player_id) player_id, created_at, props from public.events
    where name = 'app_open' order by player_id, created_at
  ),
  newp as (
    select coalesce(props->>'source', 'diretto') s, count(*) players from first_open
    where created_at > now() - make_interval(days => n) group by 1
  ),
  opens as (
    select coalesce(props->>'source', 'diretto') s, count(*) opens from public.events
    where name = 'app_open' and created_at > now() - make_interval(days => n) group by 1
  ),
  camp as (
    select coalesce(props->>'utm_campaign', '') c, coalesce(props->>'source', 'diretto') s, count(*) players from first_open
    where created_at > now() - make_interval(days => n) and props ? 'utm_campaign' group by 1, 2
  )
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', coalesce(newp.s, opens.s), 'players', coalesce(players, 0), 'opens', coalesce(opens.opens, 0)) order by coalesce(players, 0) desc, coalesce(opens.opens, 0) desc)
      from newp full join opens on opens.s = newp.s), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('campaign', c, 'source', s, 'players', players) order by players desc) from camp), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

-- Crescita: inviti, sfide, duelli (conteggi per evento), nuovi arrivati da un invito, attivi.
create or replace function public.tracker_growth(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 7), 1), 180); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with ev as (select * from public.events where created_at > now() - make_interval(days => n)),
  first_open as (
    select distinct on (player_id) player_id, created_at, props from public.events
    where name = 'app_open' order by player_id, created_at
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(name, c) from (
      select name, count(*) c from ev where name in (
        'invite_shared', 'friend_invite_opened', 'challenge_shared', 'challenge_opened',
        'duel_created', 'duel_accepted', 'duel_finished', 'duel_rematch', 'daily_played', 'rush_end'
      ) group by name) x), '{}'::jsonb),
    'duel_results', coalesce((select jsonb_object_agg(res, c) from (
      select coalesce(props->>'result', '?') res, count(*) c from ev where name = 'duel_finished' group by 1) y), '{}'::jsonb),
    'invited_new', (select count(*) from first_open where created_at > now() - make_interval(days => n) and props ? 'invite'),
    'invite_kinds', coalesce((select jsonb_object_agg(k, c) from (
      select props->>'invite' k, count(*) c from first_open
      where created_at > now() - make_interval(days => n) and props ? 'invite' group by 1) z), '{}'::jsonb),
    'active', (select count(distinct player_id) from ev)
  ) into r;
  return r;
end;
$$;

-- Imbuto dei livelli: partenze, fine, abbandoni, giocatori, medie di errori, tempo, indizi, stelle.
create or replace function public.tracker_levels(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 30), 1), 180); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with ev as (
    select player_id, name, props, (props->>'level')::int lvl from public.events
    where name in ('level_start', 'level_end', 'level_quit') and props ? 'level'
      and (props->>'level') ~ '^[0-9]{1,5}$'
      and created_at > now() - make_interval(days => n)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'level', lvl,
    'players', players, 'starts', starts, 'ends', ends, 'quits', quits,
    'avg_mistakes', avg_mistakes, 'avg_ms', avg_ms, 'avg_hints', avg_hints, 'avg_stars', avg_stars
  ) order by lvl), '[]'::jsonb) into r from (
    select lvl,
      count(distinct player_id) filter (where name = 'level_start') players,
      count(*) filter (where name = 'level_start') starts,
      count(*) filter (where name = 'level_end') ends,
      count(*) filter (where name = 'level_quit') quits,
      round(avg((props->>'mistakes')::numeric) filter (where name = 'level_end'), 2) avg_mistakes,
      round(avg((props->>'ms')::numeric) filter (where name = 'level_end')) avg_ms,
      round(avg((props->>'hints')::numeric) filter (where name = 'level_end'), 2) avg_hints,
      round(avg((props->>'stars')::numeric) filter (where name = 'level_end'), 2) avg_stars
    from ev group by lvl
  ) x where lvl between 1 and 500;
  return r;
end;
$$;

-- Prestazioni per versione: giocatori, caricamento medio, fps medio, errori JS.
create or replace function public.tracker_versions(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 90), 1), 365); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by first_seen desc), '[]'::jsonb) into r from (
    select coalesce(version, '?') version,
      min(created_at) first_seen,
      count(distinct player_id) players,
      round(avg((props->>'load_ms')::numeric) filter (where name = 'perf' and props ? 'load_ms')) avg_load_ms,
      round(avg((props->>'fps')::numeric) filter (where name = 'perf' and props ? 'fps'), 1) avg_fps,
      count(*) filter (where name = 'js_error') errors,
      count(distinct session_id) sessions
    from public.events where created_at > now() - make_interval(days => n)
    group by coalesce(version, '?')
  ) x;
  return r;
end;
$$;

-- Errori JS raggruppati per messaggio e punto.
create or replace function public.tracker_errors(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 30), 1), 365); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by c desc), '[]'::jsonb) into r from (
    select coalesce(props->>'message', '?') message, coalesce(props->>'where', '') "where",
      count(*) c, count(distinct player_id) players, max(created_at) last_at,
      (array_agg(distinct coalesce(version, '?')))[1:5] versions
    from public.events where name = 'js_error' and created_at > now() - make_interval(days => n)
    group by 1, 2 order by c desc limit 25
  ) x;
  return r;
end;
$$;

-- Idee: valutazioni, commenti, risposte alle domande veloci, nomi proposti.
create or replace function public.tracker_feedback(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := least(greatest(coalesce(p_days, 30), 1), 365); r jsonb;
begin
  if not public.is_tracker_admin() then return null; end if;
  with ev as (select created_at, name, props from public.events where name in ('feedback', 'pref') and created_at > now() - make_interval(days => n))
  select jsonb_build_object(
    'ratings', coalesce((select jsonb_object_agg(k, c) from (
      select props->>'rating' k, count(*) c from ev where name = 'feedback' and props ? 'rating' group by 1) a), '{}'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'rating', props->'rating', 'comment', props->>'comment') order by created_at desc) from (
      select * from ev where name = 'feedback' and coalesce(props->>'comment', '') <> '' order by created_at desc limit 30) b), '[]'::jsonb),
    'prefs', coalesce((select jsonb_agg(jsonb_build_object('question', q, 'answer', a, 'n', c) order by q, c desc) from (
      select props->>'question' q, props->>'answer' a, count(*) c from ev
      where name = 'pref' and props->>'question' <> 'game_name' group by 1, 2) d), '[]'::jsonb),
    'names', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'name', props->>'answer') order by created_at desc) from (
      select * from ev where name = 'pref' and props->>'question' = 'game_name' order by created_at desc limit 40) e), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'tracker_summary()', 'tracker_daily(integer)', 'tracker_cohorts(integer)', 'tracker_breakdown(integer)',
    'tracker_sources(integer)', 'tracker_growth(integer)', 'tracker_levels(integer)', 'tracker_versions(integer)',
    'tracker_errors(integer)', 'tracker_feedback(integer)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
