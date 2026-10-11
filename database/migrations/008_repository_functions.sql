create function public.nl_vocabulary_entry(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',e.id,'userId',e.user_id,'language',e.language,'listId',e.list_id,'word',e.word,'reading',e.reading,'translation',e.translation,
    'type',e.type,'category',e.category,'example',e.example,'notes',e.notes,'createdAt',e.created_at,'updatedAt',e.updated_at,
    'acceptedAnswers',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'text',a.text) order by a.id) from public.accepted_answers a where a.entry_id=e.id),'[]'::jsonb),
    'examples',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'text',x.text,'reading',x.reading,'translation',x.translation) order by x.ordinal) from public.vocabulary_examples x where x.entry_id=e.id),'[]'::jsonb),
    'relatedWords',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'word',r.word,'reading',r.reading,'translation',r.translation,'relationType',r.relation_type) order by r.ordinal) from public.vocabulary_related_words r where r.entry_id=e.id),'[]'::jsonb))
  from public.vocabulary_entries e where e.id=p_id;
$$;
create function public.nl_vocabulary_entries(p_language text) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public.nl_vocabulary_entry(e.id) order by e.created_at,e.id),'[]'::jsonb) from public.vocabulary_entries e where e.language=p_language;
$$;
create function public.nl_word_progress(p_word_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('wordId',p.word_id,'userId',p.user_id,'language',p.language,'stage',p.stage,'dueDate',p.due_date,
    'lastAdvancedDate',p.last_advanced_date,'lastStudiedDate',p.last_studied_date,'firstAttempts',p.first_attempts,'firstCorrect',p.first_correct,'errors',p.errors,
    'settledSessionIds',coalesce((select jsonb_agg(s.session_id order by s.session_id) from public.review_settlements s where s.word_id=p.word_id and s.user_id=p.user_id),'[]'::jsonb))
  from public.word_progress p where p.word_id=p_word_id;
$$;
create function public.nl_progress_words(p_language text) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public.nl_word_progress(p.word_id) order by p.word_id),'[]'::jsonb) from public.word_progress p where p.language=p_language;
$$;

create function public.nl_save_vocabulary(p_entry jsonb,p_entry_id uuid default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_id uuid := coalesce(p_entry_id,gen_random_uuid()); v_list uuid := (p_entry->>'listId')::uuid;
  v_language text := p_entry->>'language'; v_row jsonb; v_ordinal integer; v_examples jsonb; v_example text := coalesce(p_entry->>'example','');
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if p_entry ? 'examples' then v_example:=coalesce(p_entry->'examples'->0->>'text',''); end if;
  if not exists(select 1 from public.vocabulary_lists where id=v_list and user_id=v_user and language=v_language) then
    raise exception 'Choose one of your lists in this language.' using errcode='42501';
  end if;
  if p_entry_id is not null then
    perform 1 from public.vocabulary_entries where id=v_id and user_id=v_user for update;
    if not found then raise exception 'Vocabulary entry not found.' using errcode='42501'; end if;
    if exists(select 1 from public.vocabulary_entries where id=v_id and language<>v_language) then raise exception 'A word cannot change language.' using errcode='22023'; end if;
    update public.vocabulary_entries set list_id=v_list,word=btrim(p_entry->>'word'),reading=btrim(coalesce(p_entry->>'reading','')),translation=btrim(p_entry->>'translation'),
      type=coalesce(p_entry->>'type',''),category=coalesce(p_entry->>'category',''),example=v_example,notes=coalesce(p_entry->>'notes',''),updated_at=now() where id=v_id;
  else
    insert into public.vocabulary_entries(id,user_id,language,list_id,word,reading,translation,type,category,example,notes)
    values(v_id,v_user,v_language,v_list,btrim(p_entry->>'word'),btrim(coalesce(p_entry->>'reading','')),btrim(p_entry->>'translation'),coalesce(p_entry->>'type',''),coalesce(p_entry->>'category',''),v_example,coalesce(p_entry->>'notes',''));
    insert into public.word_progress(word_id,user_id,language,due_date) values(v_id,v_user,v_language,public.nl_learning_date(v_user)+1);
  end if;
  delete from public.accepted_answers where entry_id=v_id;
  if p_entry ? 'acceptedAnswers' and jsonb_typeof(p_entry->'acceptedAnswers')<>'array' then raise exception 'Accepted answers must be an array.' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(coalesce(p_entry->'acceptedAnswers','[]'::jsonb)) loop
    if btrim(coalesce(v_row->>'text',''))='' then continue; end if;
    insert into public.accepted_answers(id,user_id,entry_id,text) values(coalesce(nullif(v_row->>'id','')::uuid,gen_random_uuid()),v_user,v_id,btrim(v_row->>'text')) on conflict(entry_id,normalized_text) do nothing;
  end loop;
  delete from public.vocabulary_examples where entry_id=v_id;
  v_examples := p_entry->'examples';
  if v_examples is null then v_examples := case when btrim(v_example)<>'' then jsonb_build_array(jsonb_build_object('text',v_example,'reading','','translation','')) else '[]'::jsonb end; end if;
  if jsonb_typeof(v_examples)<>'array' then raise exception 'Examples must be an array.' using errcode='22023'; end if;
  v_ordinal := 0;
  for v_row in select value from jsonb_array_elements(v_examples) loop
    insert into public.vocabulary_examples(id,user_id,entry_id,ordinal,text,reading,translation)
      values(coalesce(nullif(v_row->>'id','')::uuid,gen_random_uuid()),v_user,v_id,v_ordinal,v_row->>'text',btrim(coalesce(v_row->>'reading','')),btrim(coalesce(v_row->>'translation','')));
    v_ordinal := v_ordinal+1;
  end loop;
  delete from public.vocabulary_related_words where entry_id=v_id;
  if p_entry ? 'relatedWords' and jsonb_typeof(p_entry->'relatedWords')<>'array' then raise exception 'Related words must be an array.' using errcode='22023'; end if;
  v_ordinal := 0;
  for v_row in select value from jsonb_array_elements(coalesce(p_entry->'relatedWords','[]'::jsonb)) loop
    insert into public.vocabulary_related_words(id,user_id,entry_id,ordinal,word,reading,translation,relation_type)
      values(coalesce(nullif(v_row->>'id','')::uuid,gen_random_uuid()),v_user,v_id,v_ordinal,btrim(v_row->>'word'),btrim(coalesce(v_row->>'reading','')),btrim(coalesce(v_row->>'translation','')),v_row->>'relationType');
    v_ordinal := v_ordinal+1;
  end loop;
  return public.nl_vocabulary_entry(v_id);
end;
$$;

create function public.nl_import_vocabulary(p_entries jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_row jsonb; v_imported integer := 0; v_duplicates integer := 0;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>10000 then raise exception 'Import at most 10,000 entries at a time.' using errcode='22023'; end if;
  -- A per-owner transaction lock makes concurrent imports deterministic without excluding homonyms.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  for v_row in select value from jsonb_array_elements(p_entries) loop
    -- Validate required fields/ownership before duplicate handling; invalid rows roll back everything.
    if btrim(coalesce(v_row->>'word',''))='' or btrim(coalesce(v_row->>'translation',''))='' then raise exception 'Word and translation are required.' using errcode='22023'; end if;
    if not exists(select 1 from public.vocabulary_lists where id=(v_row->>'listId')::uuid and user_id=v_user and language=v_row->>'language') then raise exception 'Choose one of your lists in this language.' using errcode='42501'; end if;
    if exists(select 1 from public.vocabulary_entries where user_id=v_user and language=v_row->>'language'
      and word_key=normalize(btrim(v_row->>'word'),NFC) and reading_key=normalize(btrim(coalesce(v_row->>'reading','')),NFC) and translation_key=normalize(btrim(v_row->>'translation'),NFC)) then
      v_duplicates := v_duplicates+1;
    else
      perform public.nl_save_vocabulary(v_row); v_imported := v_imported+1;
    end if;
  end loop;
  return jsonb_build_object('imported',v_imported,'duplicates',v_duplicates);
end;
$$;

create function public.nl_reading(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',id,'userId',user_id,'language',language,'title',title,'body',body,'version',version,'status',status,'createdAt',created_at,'updatedAt',updated_at) from public.readings where id=p_id;
$$;
create function public.nl_annotation(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',id,'userId',user_id,'readingId',reading_id,'bodyVersion',body_version,'start',start_offset,'end',end_offset,'text',text,'translation',translation,'reading',reading,'vocabularyEntryId',vocabulary_entry_id,'createdAt',created_at)
  from public.reading_annotations where id=p_id;
$$;
create function public.nl_save_reading(p_input jsonb,p_id uuid default null,p_clear_annotations boolean default false,p_expected_version integer default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid := coalesce(p_id,gen_random_uuid()); v_old public.readings; v_version integer := 1; v_changed boolean := true;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if p_id is not null then
    select * into v_old from public.readings where id=p_id and user_id=v_user for update;
    if not found then raise exception 'Reading not found.' using errcode='42501'; end if;
    if p_expected_version is null or p_expected_version<>v_old.version then raise exception 'The reading changed. Reopen the latest version before saving edits.' using errcode='40001'; end if;
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
create function public.nl_annotate_reading(p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_reading public.readings; v_word public.vocabulary_entries; v_id uuid; v_link uuid := nullif(p_input->>'vocabularyEntryId','')::uuid;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  select * into v_reading from public.readings where id=(p_input->>'readingId')::uuid and user_id=v_user for update;
  if not found then raise exception 'Reading not found.' using errcode='42501'; end if;
  if v_reading.version<>(p_input->>'bodyVersion')::integer then raise exception 'The reading has changed. Select the text again.' using errcode='40001'; end if;
  if public.nl_utf16_slice(v_reading.body,(p_input->>'start')::integer,(p_input->>'end')::integer)<>p_input->>'text' then raise exception 'The selected text changed. Please select it again.' using errcode='22023'; end if;
  if v_link is not null and not exists(select 1 from public.vocabulary_entries where id=v_link and user_id=v_user and language=v_reading.language) then raise exception 'Link one of your words in this language.' using errcode='42501'; end if;
  insert into public.reading_annotations(user_id,reading_id,body_version,start_offset,end_offset,text,translation,reading,vocabulary_entry_id)
  values(v_user,v_reading.id,v_reading.version,(p_input->>'start')::integer,(p_input->>'end')::integer,p_input->>'text',btrim(p_input->>'translation'),btrim(coalesce(p_input->>'reading','')),v_link)
  on conflict(reading_id,body_version,start_offset,end_offset) do update set translation=excluded.translation,reading=excluded.reading,vocabulary_entry_id=excluded.vocabulary_entry_id returning id into v_id;
  return public.nl_annotation(v_id);
end;
$$;

create function public.nl_grammar_point(p_id text) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p.id,'language',p.language,'title',p.title,'level',p.level,'category',p.category,'explanation',v.explanation,'formation',v.formation,'status',v.status,
    'contentVersion',v.content_version,'modificationNotes',v.modification_notes,'developmentSeed',v.development_seed,
    'examples',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'text',x.text,'reading',x.reading,'translation',x.translation) order by x.ordinal) from public.grammar_examples x where x.point_id=p.id and x.content_version=v.content_version),'[]'::jsonb),
    'exercises',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'prompt',x.prompt,'choices',x.choices,'correctIndex',x.correct_index,'explanation',x.explanation) order by x.ordinal) from public.grammar_exercises x where x.point_id=p.id and x.content_version=v.content_version),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('title',s.title,'url',s.url,'version',s.reference_version,'license',s.license,'attribution',s.attribution) order by s.ordinal) from public.grammar_sources s where s.point_id=p.id and s.content_version=v.content_version),'[]'::jsonb),
    'reviewer',(select jsonb_build_object('name',r.reviewer_name,'date',r.reviewed_at) from public.grammar_reviews r where r.point_id=p.id and r.content_version=v.content_version and r.human_review order by r.reviewed_at desc,r.id limit 1))
  from public.grammar_points p join public.grammar_versions v on v.point_id=p.id and v.content_version=p.current_version where p.id=p_id;
$$;
create function public.nl_grammar_points(p_language text) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public.nl_grammar_point(p.id) order by p.id),'[]'::jsonb) from public.grammar_points p where p.language=p_language;
$$;
create function public.nl_submit_grammar(p_point_id text,p_answers jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_point public.grammar_points; v_count integer; v_correct integer := 0; v_row public.grammar_exercises; v_answer integer; v_result public.grammar_progress;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  select * into v_point from public.grammar_points where id=p_point_id;
  if not found or not public.nl_grammar_is_published(p_point_id) then raise exception 'This lesson is unavailable.' using errcode='42501'; end if;
  select count(*) into v_count from public.grammar_exercises where point_id=p_point_id and content_version=v_point.current_version;
  if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>v_count then raise exception 'Answer every exercise before submitting.' using errcode='22023'; end if;
  for v_row in select * from public.grammar_exercises where point_id=p_point_id and content_version=v_point.current_version order by ordinal loop
    if jsonb_typeof(p_answers->v_row.ordinal)<>'number' or (p_answers->>v_row.ordinal) !~ '^[0-9]+$' then raise exception 'Invalid exercise answer.' using errcode='22023'; end if;
    v_answer := (p_answers->>v_row.ordinal)::integer;
    if v_answer<0 or v_answer>=cardinality(v_row.choices) then raise exception 'Invalid exercise answer.' using errcode='22023'; end if;
    if v_answer=v_row.correct_index then v_correct := v_correct+1; end if;
  end loop;
  insert into public.grammar_progress(user_id,point_id,language,content_version,correct,total,completed)
  values(v_user,p_point_id,v_point.language,v_point.current_version,v_correct,v_count,v_correct::numeric/v_count>=0.8)
  on conflict(user_id,point_id,content_version) do update set correct=excluded.correct,total=excluded.total,completed=public.grammar_progress.completed or excluded.completed,attempted_at=now() returning * into v_result;
  insert into public.learning_activity(id,user_id,language,learning_date,kind,count) values('grammar:'||gen_random_uuid(),v_user,v_point.language,public.nl_learning_date(v_user),'grammar',v_count);
  return jsonb_build_object('userId',v_result.user_id,'pointId',v_result.point_id,'language',v_result.language,'contentVersion',v_result.content_version,'correct',v_result.correct,'total',v_result.total,'completed',v_result.completed,'attemptedAt',v_result.attempted_at);
end;
$$;
