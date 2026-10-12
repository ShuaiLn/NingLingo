-- Application version conflicts are permanent validation failures, not PostgreSQL
-- serialization failures. PostgREST can retry SQLSTATE 40001 indefinitely.
-- Keep ownership, row locks, version checks and existing execution grants intact.
-- Supersedes only the two Reading functions from migration 008.
create or replace function public.nl_save_reading(p_input jsonb,p_id uuid default null,p_clear_annotations boolean default false,p_expected_version integer default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid := coalesce(p_id,gen_random_uuid()); v_old public.readings; v_version integer := 1; v_changed boolean := true;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if p_id is not null then
    select * into v_old from public.readings where id=p_id and user_id=v_user for update;
    if not found then raise exception 'Reading not found.' using errcode='42501'; end if;
    if p_expected_version is null or p_expected_version<>v_old.version then raise exception 'The reading changed. Reopen the latest version before saving edits.' using errcode='22023'; end if;
    if p_input->>'language'<>v_old.language then raise exception 'A reading cannot change language.' using errcode='22023'; end if;
    v_changed := p_input->>'body'<>v_old.body;
    if v_changed and not p_clear_annotations and exists(select 1 from public.reading_annotations where reading_id=v_id) then
      raise exception 'Changing the body invalidates positional annotations. Confirm that existing annotations should be cleared.' using errcode='22023';
    end if;
    v_version := v_old.version+case when v_changed then 1 else 0 end;
    if v_changed then delete from public.reading_annotations where reading_id=v_id; end if;
    update public.readings set title=btrim(p_input->>'title'),body=p_input->>'body',version=v_version,status=p_input->>'status',updated_at=now() where id=v_id;
  else
    insert into public.readings(id,user_id,language,title,body,status) values(v_id,v_user,p_input->>'language',btrim(p_input->>'title'),p_input->>'body',p_input->>'status');
  end if;
  if v_changed then insert into public.reading_versions(reading_id,user_id,version,body) values(v_id,v_user,v_version,p_input->>'body'); end if;
  if p_input->>'status'='finished' then
    insert into public.learning_activity(id,user_id,language,learning_date,kind,count) values('reading:'||v_id,v_user,p_input->>'language',public.nl_learning_date(v_user),'reading',1) on conflict do nothing;
  end if;
  return public.nl_reading(v_id);
end;
$$;

create or replace function public.nl_annotate_reading(p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_reading public.readings; v_word public.vocabulary_entries; v_id uuid; v_link uuid := nullif(p_input->>'vocabularyEntryId','')::uuid;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  select * into v_reading from public.readings where id=(p_input->>'readingId')::uuid and user_id=v_user for update;
  if not found then raise exception 'Reading not found.' using errcode='42501'; end if;
  if v_reading.version<>(p_input->>'bodyVersion')::integer then raise exception 'The reading has changed. Select the text again.' using errcode='22023'; end if;
  if public.nl_utf16_slice(v_reading.body,(p_input->>'start')::integer,(p_input->>'end')::integer)<>p_input->>'text' then raise exception 'The selected text changed. Please select it again.' using errcode='22023'; end if;
  if v_link is not null and not exists(select 1 from public.vocabulary_entries where id=v_link and user_id=v_user and language=v_reading.language) then raise exception 'Link one of your words in this language.' using errcode='42501'; end if;
  insert into public.reading_annotations(user_id,reading_id,body_version,start_offset,end_offset,text,translation,reading,vocabulary_entry_id)
  values(v_user,v_reading.id,v_reading.version,(p_input->>'start')::integer,(p_input->>'end')::integer,p_input->>'text',btrim(p_input->>'translation'),btrim(coalesce(p_input->>'reading','')),v_link)
  on conflict(reading_id,body_version,start_offset,end_offset) do update set translation=excluded.translation,reading=excluded.reading,vocabulary_entry_id=excluded.vocabulary_entry_id returning id into v_id;
  return public.nl_annotation(v_id);
end;
$$;

notify pgrst, 'reload schema';
