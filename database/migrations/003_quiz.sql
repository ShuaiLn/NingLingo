-- JSONB stores intentionally immutable domain snapshots and reproducible scheduler state.
-- Queries/security/uniqueness use relational projections rather than trusting JSON filters.
create table public.quiz_sessions (
  id uuid primary key, user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')),
  quiz_type text not null check(quiz_type in ('word-meaning','meaning-word','typing','japanese-reading')),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), state jsonb not null check(jsonb_typeof(state)='object'),
  random_seed bigint not null check(random_seed between 0 and 4294967295), scheduler_version integer not null check(scheduler_version > 0),
  version integer not null check(version > 0), status text not null check(status in ('active','saved','completed','ended')),
  settled boolean not null default false, learning_date date not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.quiz_questions (
  session_id uuid not null, user_id uuid not null, id text not null, position integer not null check(position >= 0),
  word_id uuid not null, kind text not null check(kind in ('initial','retry','filler')), configuration jsonb not null,
  primary key(session_id,id), unique(session_id,position),
  foreign key(session_id,user_id) references public.quiz_sessions(id,user_id) on delete cascade
);
create table public.quiz_attempts (
  session_id uuid not null, user_id uuid not null, id text not null, question_id text not null,
  word_id uuid not null, position integer not null check(position >= 0), kind text not null check(kind in ('initial','retry','filler')),
  answer text not null, correct boolean not null, answered_at timestamptz not null,
  primary key(session_id,id), unique(session_id,question_id), unique(session_id,position),
  foreign key(session_id,user_id) references public.quiz_sessions(id,user_id) on delete cascade,
  foreign key(session_id,question_id) references public.quiz_questions(session_id,id) on delete cascade
);
create table public.retry_reservations (
  session_id uuid not null, user_id uuid not null, word_id uuid not null, position integer not null check(position >= 0), interval integer not null check(interval >= 0),
  primary key(session_id,word_id), unique(session_id,position),
  foreign key(session_id,user_id) references public.quiz_sessions(id,user_id) on delete cascade
);
create table public.review_settlements (
  session_id uuid not null, user_id uuid not null, word_id uuid not null, learning_date date not null, perfect boolean not null,
  primary key(session_id,word_id), foreign key(session_id,user_id) references public.quiz_sessions(id,user_id) on delete cascade
);
create table public.learning_activity (
  id text primary key, user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')), learning_date date not null,
  kind text not null check(kind in ('quiz','reading','grammar')), count integer not null check(count > 0)
);
create function public.nl_guard_quiz_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.language <> old.language or new.quiz_type <> old.quiz_type or new.snapshot <> old.snapshot or new.random_seed <> old.random_seed or new.scheduler_version <> old.scheduler_version or new.created_at <> old.created_at then
    raise exception 'Quiz snapshots are immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger quiz_snapshot_immutable before update on public.quiz_sessions for each row execute function public.nl_guard_quiz_snapshot();
