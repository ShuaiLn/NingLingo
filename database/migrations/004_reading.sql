create table public.readings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')), title text not null check(length(btrim(title)) between 1 and 1000),
  body text not null check(length(btrim(body)) > 0), version integer not null default 1 check(version > 0),
  status text not null default 'unread' check(status in ('unread','reading','finished')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.reading_versions (
  id uuid primary key default gen_random_uuid(), reading_id uuid not null, user_id uuid not null,
  version integer not null check(version > 0), body text not null, created_at timestamptz not null default now(),
  foreign key(reading_id,user_id) references public.readings(id,user_id) on delete cascade,
  unique(reading_id,version,user_id)
);
create table public.reading_annotations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, reading_id uuid not null, body_version integer not null,
  start_offset integer not null check(start_offset >= 0), end_offset integer not null check(end_offset > start_offset),
  text text not null, translation text not null check(length(btrim(translation)) > 0), reading text not null default '',
  vocabulary_entry_id uuid,
  created_at timestamptz not null default now(),
  foreign key(reading_id,body_version,user_id) references public.reading_versions(reading_id,version,user_id) on delete cascade,
  foreign key(vocabulary_entry_id,user_id) references public.vocabulary_entries(id,user_id) on delete set null(vocabulary_entry_id),
  unique(reading_id,body_version,start_offset,end_offset)
);
create table public.translation_cache (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')), text text not null check(length(text) > 0), context text not null,
  translation text not null check(length(btrim(translation)) > 0), source text not null check(source='deepl'),
  cache_key text generated always as (md5(char_length(normalize(text,NFC))::text || ':' || normalize(text,NFC) || normalize(context,NFC))) stored,
  created_at timestamptz not null default now(), unique(user_id,language,cache_key)
);

-- Browser text offsets are UTF-16 code units, while PostgreSQL text positions count codepoints.
-- Reject ranges that split a supplementary character instead of silently shifting annotations.
create function public.nl_utf16_slice(p_text text,p_start integer,p_end integer) returns text language plpgsql immutable strict set search_path = '' as $$
declare v_position integer := 0; v_char text; v_result text := ''; v_width integer;
begin
  if p_start < 0 or p_end <= p_start then raise exception 'Select a non-empty text range inside this reading.' using errcode='22023'; end if;
  for v_index in 1..char_length(p_text) loop
    v_char := substr(p_text,v_index,1); v_width := case when ascii(v_char)>65535 then 2 else 1 end;
    if (v_position < p_start and v_position+v_width > p_start) or (v_position < p_end and v_position+v_width > p_end) then
      raise exception 'The text range splits a Unicode character.' using errcode='22023';
    end if;
    if v_position >= p_start and v_position < p_end then v_result := v_result || v_char; end if;
    v_position := v_position + v_width;
  end loop;
  if p_end > v_position then raise exception 'Select a non-empty text range inside this reading.' using errcode='22023'; end if;
  return v_result;
end;
$$;
