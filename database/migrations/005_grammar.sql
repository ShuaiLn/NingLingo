create table public.grammar_points (
  id text primary key check(id ~ '^[a-z0-9][a-z0-9-]*$'), language text not null check(language in ('ja','es','el')),
  title text not null check(length(btrim(title))>0), level text not null check(length(btrim(level))>0), category text not null,
  current_version integer not null check(current_version>0), unique(id,language)
);
create table public.grammar_versions (
  point_id text not null references public.grammar_points(id) on delete cascade, content_version integer not null check(content_version>0),
  explanation text not null check(length(btrim(explanation))>0), formation text not null check(length(btrim(formation))>0),
  status text not null check(status in ('draft','reviewed','published')), modification_notes text not null default '', development_seed boolean not null default false,
  -- Canonical import manifest proves same-version imports are identical; child data remains relational.
  manifest jsonb not null, created_at timestamptz not null default now(), primary key(point_id,content_version)
);
alter table public.grammar_points add constraint grammar_current_version foreign key(id,current_version) references public.grammar_versions(point_id,content_version) deferrable initially deferred;
create table public.grammar_examples (
  point_id text not null, content_version integer not null, id text not null, ordinal integer not null check(ordinal>=0),
  text text not null check(length(btrim(text))>0), reading text, translation text not null check(length(btrim(translation))>0),
  primary key(point_id,content_version,id), unique(point_id,content_version,ordinal),
  foreign key(point_id,content_version) references public.grammar_versions(point_id,content_version) on delete cascade
);
create table public.grammar_exercises (
  point_id text not null, content_version integer not null, id text not null, ordinal integer not null check(ordinal>=0),
  prompt text not null check(length(btrim(prompt))>0), choices text[] not null check(cardinality(choices) between 2 and 4),
  correct_index integer not null check(correct_index>=0 and correct_index<cardinality(choices)), explanation text not null check(length(btrim(explanation))>0),
  primary key(point_id,content_version,id), unique(point_id,content_version,ordinal),
  foreign key(point_id,content_version) references public.grammar_versions(point_id,content_version) on delete cascade
);
create table public.grammar_sources (
  point_id text not null, content_version integer not null, ordinal integer not null,
  title text not null check(length(btrim(title))>0), url text not null check(url ~ '^https://'),
  reference_version text not null check(length(btrim(reference_version))>0), license text not null check(length(btrim(license))>0), attribution text not null check(length(btrim(attribution))>0),
  primary key(point_id,content_version,ordinal),
  foreign key(point_id,content_version) references public.grammar_versions(point_id,content_version) on delete cascade
);
create table public.grammar_reviews (
  id uuid primary key default gen_random_uuid(), point_id text not null, content_version integer not null,
  reviewer_name text not null check(length(btrim(reviewer_name))>0), reviewed_at date not null,
  human_review boolean not null check(human_review), modification_notes text not null default '',
  foreign key(point_id,content_version) references public.grammar_versions(point_id,content_version) on delete cascade
);
create table public.grammar_progress (
  user_id uuid not null references public.profiles(user_id) on delete cascade, point_id text not null, language text not null,
  content_version integer not null, correct integer not null check(correct>=0), total integer not null check(total>0 and correct<=total),
  completed boolean not null, attempted_at timestamptz not null default now(), primary key(user_id,point_id,content_version),
  foreign key(point_id,language) references public.grammar_points(id,language),
  foreign key(point_id,content_version) references public.grammar_versions(point_id,content_version)
);
