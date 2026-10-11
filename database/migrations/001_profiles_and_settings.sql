-- Supabase Cloud migration. auth.users and auth.uid() are supplied by Supabase.
-- Supabase PostgreSQL includes ICU. Pin English case behavior to match the domain's
-- toLocaleLowerCase('en'), including contextual sigma and dotted capital I.
create collation public.nl_english (provider=icu,locale='en',deterministic=true);
-- ECMAScript String.trim whitespace (including BOM/NBSP) rather than PostgreSQL's
-- default btrim, which removes only ASCII spaces. Answers compare canonical Unicode.
create function public.nl_normalize_answer(p_text text) returns text language sql immutable strict set search_path = '' as $$
  select lower(normalize(btrim(p_text,E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)),NFC) collate public.nl_english);
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Ning',
  timezone text not null default 'America/Tijuana',
  language_preferences text[] not null default array['ja','es','el'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_languages check (language_preferences <@ array['ja','es','el']::text[] and cardinality(language_preferences) > 0),
  constraint profiles_name check (length(btrim(display_name)) between 1 and 200)
);

create function public.nl_validate_profile() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Choose a valid IANA timezone.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_validate before insert or update on public.profiles for each row execute function public.nl_validate_profile();

create function public.nl_bootstrap_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name) values(new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Ning')) on conflict do nothing;
  return new;
end;
$$;
create trigger ninglingo_auth_user_created after insert on auth.users for each row execute function public.nl_bootstrap_profile();
-- Support an existing pre-provisioned personal account as well as future admin-created accounts.
insert into public.profiles(user_id) select id from auth.users on conflict do nothing;

create function public.nl_learning_date(p_user_id uuid, p_at timestamptz default now()) returns date language sql stable set search_path = '' as $$
  select (p_at at time zone p.timezone)::date from public.profiles p where p.user_id = p_user_id;
$$;
create function public.nl_profile() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p.user_id,'displayName',p.display_name,'timezone',p.timezone,'createdAt',p.created_at,'email',coalesce(auth.jwt()->>'email',''))
  from public.profiles p where p.user_id = auth.uid();
$$;
