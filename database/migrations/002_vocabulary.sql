create table public.vocabulary_lists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')), name text not null check(length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now(), unique(id,user_id,language)
);
create table public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')), list_id uuid not null,
  word text not null check(length(btrim(word)) between 1 and 2000), reading text not null default '',
  translation text not null check(length(btrim(translation)) between 1 and 10000),
  type text not null default '', category text not null default '', example text not null default '', notes text not null default '',
  word_key text generated always as (normalize(word,NFC)) stored,
  reading_key text generated always as (normalize(reading,NFC)) stored,
  translation_key text generated always as (normalize(translation,NFC)) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,user_id), unique(id,user_id,language), unique(user_id,language,word_key,reading_key,translation_key),
  foreign key(list_id,user_id,language) references public.vocabulary_lists(id,user_id,language) on delete cascade
);
create table public.accepted_answers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, entry_id uuid not null, text text not null check(length(btrim(text)) between 1 and 10000),
  normalized_text text generated always as (public.nl_normalize_answer(text)) stored,
  foreign key(entry_id,user_id) references public.vocabulary_entries(id,user_id) on delete cascade,
  unique(entry_id,normalized_text)
);
create table public.word_progress (
  word_id uuid primary key, user_id uuid not null, language text not null,
  stage smallint not null default 0 check(stage between 0 and 6), due_date date not null,
  last_advanced_date date, last_studied_date date,
  first_attempts integer not null default 0 check(first_attempts >= 0), first_correct integer not null default 0 check(first_correct between 0 and first_attempts),
  errors integer not null default 0 check(errors >= 0),
  foreign key(word_id,user_id,language) references public.vocabulary_entries(id,user_id,language) on delete cascade
);
