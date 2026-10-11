-- These functions are callable ONLY by the server's service_role client, after verified
-- cookie authentication. The browser submits only an answer/version/idempotency key;
-- the tested TypeScript scheduler freezes and grades on the server before this CAS.
create function public.nl_create_quiz(p_user_id uuid,p_state jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p_state->>'id')::uuid; v_entry jsonb; v_question jsonb; v_snapshot jsonb;
begin
  if (p_state->>'userId')::uuid<>p_user_id or not exists(select 1 from public.profiles where user_id=p_user_id) then raise exception 'Invalid quiz owner.' using errcode='42501'; end if;
  if p_state->>'status'<>'active' or (p_state->>'version')::integer<>1 or jsonb_array_length(p_state->'attempts')<>0 or jsonb_array_length(p_state->'entries')<1 then raise exception 'Invalid initial quiz state.' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_state->'entries') loop
    if not exists(select 1 from public.vocabulary_entries where id=(v_entry->>'id')::uuid and user_id=p_user_id and language=p_state->>'language') then raise exception 'Quiz words must belong to the current user and language.' using errcode='42501'; end if;
  end loop;
  v_snapshot := jsonb_build_object('entries',p_state->'entries','questionTemplates',p_state->'questionTemplates','type',p_state->'type','configuration',p_state->'configuration');
  insert into public.quiz_sessions(id,user_id,language,quiz_type,snapshot,state,random_seed,scheduler_version,version,status,settled,learning_date,created_at,updated_at)
    values(v_id,p_user_id,p_state->>'language',p_state->>'type',v_snapshot,p_state,(p_state->>'randomSeed')::bigint,(p_state->>'schedulerVersion')::integer,1,'active',false,(p_state->>'learningDate')::date,(p_state->>'createdAt')::timestamptz,(p_state->>'updatedAt')::timestamptz);
  for v_question in select value from jsonb_array_elements(p_state->'questions') loop
    insert into public.quiz_questions(session_id,user_id,id,position,word_id,kind,configuration) values(v_id,p_user_id,v_question->>'id',(v_question->>'position')::integer,(v_question->>'wordId')::uuid,v_question->>'kind',v_question);
  end loop;
  return p_state;
end;
$$;

create function public.nl_commit_quiz(p_user_id uuid,p_session_id uuid,p_expected_version integer,p_state jsonb,p_submission_id text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.quiz_sessions; v_state jsonb := p_state; v_attempt jsonb; v_question jsonb; v_reservation jsonb; v_entry jsonb;
  v_initial jsonb; v_errors integer; v_progress public.word_progress; v_today date; v_word uuid; v_old_attempts integer; v_new_attempts integer;
  v_correct boolean; v_stage integer; v_days integer[] := array[1,3,7,14,30,60,120];
begin
  select * into v_old from public.quiz_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Quiz session not found.' using errcode='42501'; end if;
  -- Idempotent replay wins over stale optimistic versions and ignores a changed replay payload.
  if p_submission_id is not null and exists(select 1 from public.quiz_attempts where session_id=p_session_id and id=p_submission_id) then
    return jsonb_build_object('conflict',false,'session',v_old.state);
  end if;
  if p_expected_version<>v_old.version then return jsonb_build_object('conflict',true,'session',v_old.state); end if;
  if v_old.status in ('completed','ended') then return jsonb_build_object('conflict',false,'session',v_old.state); end if;
  if (v_state->>'id')::uuid<>p_session_id or (v_state->>'userId')::uuid<>p_user_id or v_state->>'language'<>v_old.language
    or (v_state->>'randomSeed')::bigint<>v_old.random_seed or (v_state->>'schedulerVersion')::integer<>v_old.scheduler_version
    or v_state->>'createdAt'<>v_old.state->>'createdAt'
    or jsonb_build_object('entries',v_state->'entries','questionTemplates',v_state->'questionTemplates','type',v_state->'type','configuration',v_state->'configuration')<>v_old.snapshot then
    raise exception 'Quiz snapshots are immutable.' using errcode='22023';
  end if;
  if (v_state->>'version')::integer<>v_old.version+1 then raise exception 'Invalid next session version.' using errcode='22023'; end if;
  v_old_attempts := jsonb_array_length(v_old.state->'attempts'); v_new_attempts := jsonb_array_length(v_state->'attempts');
  if v_new_attempts<v_old_attempts or v_new_attempts>v_old_attempts+1
    or (select coalesce(jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) from jsonb_array_elements(v_state->'attempts') with ordinality a where a.ordinality<=v_old_attempts)<>v_old.state->'attempts' then
    raise exception 'Existing quiz answers are immutable.' using errcode='22023';
  end if;
  if p_submission_id is null and v_new_attempts<>v_old_attempts then raise exception 'An answer requires an idempotency key.' using errcode='22023'; end if;
  if p_submission_id is not null then
    if v_old.status<>'active' or v_new_attempts<>v_old_attempts+1 then raise exception 'Only an active quiz can accept an answer.' using errcode='22023'; end if;
    v_attempt := v_state->'attempts'->v_old_attempts; v_question := v_old.state->'currentQuestion';
    if v_attempt->>'id'<>p_submission_id or v_attempt->>'questionId'<>v_question->>'id' or v_attempt->>'wordId'<>v_question->>'wordId'
      or v_attempt->>'kind'<>v_question->>'kind' or (v_attempt->>'position')::integer<>v_old_attempts then raise exception 'The answer does not match the current question.' using errcode='22023'; end if;
    -- Defense in depth: persist only the grade matching the frozen question.
    if v_old.quiz_type='typing' then
      select exists(select 1 from jsonb_array_elements_text(v_question->'acceptedAnswers') a where public.nl_normalize_answer(v_attempt->>'answer')=a.value) into v_correct;
    else v_correct := v_attempt->>'answer'=v_question->>'correctChoiceId'; end if;
    if (v_attempt->>'correct')::boolean is distinct from v_correct then raise exception 'The submitted grade does not match the frozen answer.' using errcode='22023'; end if;
  end if;
  -- Preserve historical question configurations, including hidden answers and choices.
  if exists(select 1 from public.quiz_questions q where q.session_id=p_session_id and not exists(select 1 from jsonb_array_elements(v_state->'questions') x where x.value=q.configuration)) then
    raise exception 'Existing quiz questions are immutable.' using errcode='22023';
  end if;
  for v_question in select value from jsonb_array_elements(v_state->'questions') loop
    if not exists(select 1 from jsonb_array_elements(v_old.snapshot->'entries') e where e.value->>'id'=v_question->>'wordId') then raise exception 'A quiz cannot introduce unselected words.' using errcode='22023'; end if;
    insert into public.quiz_questions(session_id,user_id,id,position,word_id,kind,configuration)
      values(p_session_id,p_user_id,v_question->>'id',(v_question->>'position')::integer,(v_question->>'wordId')::uuid,v_question->>'kind',v_question) on conflict do nothing;
  end loop;
  if p_submission_id is not null then
    insert into public.quiz_attempts(session_id,user_id,id,question_id,word_id,position,kind,answer,correct,answered_at)
      values(p_session_id,p_user_id,p_submission_id,v_attempt->>'questionId',(v_attempt->>'wordId')::uuid,(v_attempt->>'position')::integer,v_attempt->>'kind',v_attempt->>'answer',v_correct,(v_attempt->>'answeredAt')::timestamptz);
    insert into public.learning_activity(id,user_id,language,learning_date,kind,count)
      values('quiz:'||p_session_id||':'||p_submission_id,p_user_id,v_old.language,public.nl_learning_date(p_user_id,(v_attempt->>'answeredAt')::timestamptz),'quiz',1) on conflict do nothing;
  end if;
  delete from public.retry_reservations where session_id=p_session_id;
  for v_reservation in select value from jsonb_array_elements(v_state->'reservations') loop
    if not exists(select 1 from jsonb_array_elements(v_old.snapshot->'entries') e where e.value->>'id'=v_reservation->>'wordId') then raise exception 'A retry cannot introduce unselected words.' using errcode='22023'; end if;
    insert into public.retry_reservations(session_id,user_id,word_id,position,interval) values(p_session_id,p_user_id,(v_reservation->>'wordId')::uuid,(v_reservation->>'position')::integer,(v_reservation->>'interval')::integer);
  end loop;
  if v_state->>'status' in ('completed','ended') then
    v_today := public.nl_learning_date(p_user_id);
    -- All sessions lock progress in UUID order, avoiding deadlocks across simultaneous devices.
    for v_entry in select value from jsonb_array_elements(v_old.snapshot->'entries') order by value->>'id' loop
      v_word := (v_entry->>'id')::uuid;
      if not exists(select 1 from public.quiz_attempts where session_id=p_session_id and word_id=v_word) then continue; end if;
      select * into v_progress from public.word_progress where word_id=v_word and user_id=p_user_id for update;
      select count(*) into v_errors from public.quiz_attempts where session_id=p_session_id and word_id=v_word and not correct;
      insert into public.review_settlements(session_id,user_id,word_id,learning_date,perfect) values(p_session_id,p_user_id,v_word,v_today,v_errors=0) on conflict do nothing;
      if not found then continue; end if;
      -- Deleting a live word preserves the snapshot/history and does not resurrect the word.
      if v_progress.word_id is null then continue; end if;
      select to_jsonb(a) into v_initial from public.quiz_attempts a where session_id=p_session_id and word_id=v_word and kind='initial' order by position limit 1;
      v_progress.first_attempts := v_progress.first_attempts+case when v_initial is not null then 1 else 0 end;
      v_progress.first_correct := v_progress.first_correct+case when coalesce((v_initial->>'correct')::boolean,false) then 1 else 0 end;
      v_progress.errors := v_progress.errors+v_errors; v_progress.last_studied_date := v_today;
      if v_state->'dueWordIds' ? v_word::text then
        if v_errors>0 then v_progress.stage := 0; v_progress.due_date := v_today+1;
        elsif v_progress.due_date<=v_today and v_progress.last_advanced_date is distinct from v_today then
          v_stage := least(v_progress.stage+1,6); v_progress.stage := v_stage; v_progress.due_date := v_today+v_days[v_stage+1]; v_progress.last_advanced_date := v_today;
        end if;
      end if;
      update public.word_progress set stage=v_progress.stage,due_date=v_progress.due_date,last_advanced_date=v_progress.last_advanced_date,last_studied_date=v_progress.last_studied_date,
        first_attempts=v_progress.first_attempts,first_correct=v_progress.first_correct,errors=v_progress.errors where word_id=v_word and user_id=p_user_id;
    end loop;
    v_state := jsonb_set(v_state,'{settled}','true'::jsonb);
  else v_state := jsonb_set(v_state,'{settled}','false'::jsonb); end if;
  update public.quiz_sessions set state=v_state,version=(v_state->>'version')::integer,status=v_state->>'status',settled=(v_state->>'settled')::boolean,updated_at=(v_state->>'updatedAt')::timestamptz where id=p_session_id;
  return jsonb_build_object('conflict',false,'session',v_state);
end;
$$;
