-- Frozen Alphabet MCQ extends the existing service-only lifecycle and owner RLS.
create function public.nl_validate_alphabet_mcq(p_item jsonb,p_template jsonb) returns void
language plpgsql set search_path = '' as $$
declare v_option jsonb; v_correct jsonb; v_answers jsonb; v_direction text := p_template->>'direction'; v_prompt text;
begin
  if v_direction is null or v_direction not in ('character-to-pronunciation','pronunciation-to-character')
    or jsonb_typeof(p_template->'options') is distinct from 'array' or jsonb_array_length(p_template->'options')<>4
    or (select count(distinct o.value->>'id') from jsonb_array_elements(p_template->'options') o)<>4
    or (select count(distinct public.nl_normalize_answer(o.value->>'text')) from jsonb_array_elements(p_template->'options') o)<>4
    or p_template->'acceptedAnswers' is distinct from jsonb_build_array(p_template->>'correctOptionId') then
    raise exception 'Alphabet MCQ requires four unique frozen options and one correct option ID.' using errcode='22023';
  end if;
  select o.value into v_correct from jsonb_array_elements(p_template->'options') o where o.value->>'id'=p_template->>'correctOptionId';
  select jsonb_agg(value order by position) into v_answers from
    (select public.nl_normalize_answer(a.value) as value,min(a.ordinality) as position from jsonb_array_elements_text(p_item->'pronunciationAnswers') with ordinality a group by public.nl_normalize_answer(a.value)) answers;
  if not found or v_correct is null or v_correct->>'symbol' is distinct from p_item->>'symbol'
    or v_correct->'pronunciationAnswers' is distinct from v_answers then
    raise exception 'Alphabet MCQ correct option must match its frozen tested character.' using errcode='22023';
  end if;
  v_prompt := public.nl_normalize_answer(p_item->'pronunciationAnswers'->>0);
  if (v_direction='character-to-pronunciation' and (p_template->>'prompt' is distinct from p_item->>'symbol' or public.nl_normalize_answer(v_correct->>'text') is distinct from v_prompt))
    or (v_direction='pronunciation-to-character' and (public.nl_normalize_answer(p_template->>'prompt') is distinct from v_prompt or v_correct->>'text' is distinct from p_item->>'symbol')) then
    raise exception 'Alphabet MCQ prompt does not match the frozen direction.' using errcode='22023';
  end if;
  for v_option in select value from jsonb_array_elements(p_template->'options') loop
    if not (v_option ?& array['id','text','symbol','pronunciationAnswers']) or coalesce(length(btrim(v_option->>'id')),0)=0
      or coalesce(length(public.nl_normalize_answer(v_option->>'text')),0)=0
      or coalesce(length(public.nl_normalize_answer(v_option->>'symbol')),0)=0
      or jsonb_typeof(v_option->'pronunciationAnswers') is distinct from 'array' or jsonb_array_length(v_option->'pronunciationAnswers')=0
      or exists(select 1 from jsonb_array_elements_text(v_option->'pronunciationAnswers') a where coalesce(length(a.value),0)=0 or a.value is distinct from public.nl_normalize_answer(a.value)) then
      raise exception 'Alphabet MCQ option metadata is invalid.' using errcode='22023';
    end if;
    if v_direction='character-to-pronunciation' then
      if not (v_option->'pronunciationAnswers' ? public.nl_normalize_answer(v_option->>'text'))
        or exists(select 1 from jsonb_array_elements(p_template->'options') other
          where other.value->>'id'<>v_option->>'id' and exists(select 1 from jsonb_array_elements_text(v_option->'pronunciationAnswers') a where other.value->'pronunciationAnswers' ? a.value)) then
        raise exception 'Alphabet pronunciation options must merge explicit equivalent answers.' using errcode='22023';
      end if;
    elsif v_option->>'text' is distinct from v_option->>'symbol'
      or (v_option->>'id'<>p_template->>'correctOptionId' and (v_option->'pronunciationAnswers' ? public.nl_normalize_answer(p_template->>'prompt'))) then
      raise exception 'Alphabet character distractors cannot also answer the pronunciation prompt.' using errcode='22023';
    end if;
  end loop;
end;
$$;
revoke all on function public.nl_validate_alphabet_mcq(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.nl_validate_alphabet_mcq(jsonb,jsonb) to service_role;

create or replace function public.nl_create_alphabet_quiz(p_user_id uuid,p_state jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p_state->>'id')::uuid; v_item jsonb; v_template jsonb; v_snapshot jsonb;
begin
  if (p_state->>'userId')::uuid is distinct from p_user_id or not exists(select 1 from public.profiles where user_id=p_user_id) then raise exception 'Invalid alphabet quiz owner.' using errcode='42501'; end if;
  if p_state->>'status' is distinct from 'active' or (p_state->>'version')::integer is distinct from 1
    or (p_state->>'contentVersion')::integer is null or (p_state->>'contentVersion')::integer<1
    or jsonb_array_length(p_state->'attempts') is distinct from 0 or coalesce(jsonb_array_length(p_state->'items'),0)<1
    or jsonb_array_length(p_state->'questionTemplates') is distinct from jsonb_array_length(p_state->'items')
    or jsonb_array_length(p_state->'questions') is distinct from 1 or p_state->'currentQuestion' is distinct from p_state->'questions'->0
    or p_state->'reservations' is distinct from '[]'::jsonb or p_state->'testedItemIds' is distinct from '[]'::jsonb
    or p_state->'retryCompletedItemIds' is distinct from '[]'::jsonb then
    raise exception 'Invalid initial alphabet quiz state.' using errcode='22023';
  end if;
  if (select count(distinct value->>'itemId') from jsonb_array_elements(p_state->'items'))<>jsonb_array_length(p_state->'items') then raise exception 'Alphabet characters must be unique.' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_state->'items') loop
    if not (v_item ?& array['itemId','language','group','symbol','name','pronunciation','pronunciationAnswers','example','exampleTranslation','audioText','exampleReading'])
      or coalesce(length(v_item->>'itemId'),0)=0 or v_item->>'language' is distinct from p_state->>'language'
      or coalesce(jsonb_array_length(v_item->'pronunciationAnswers'),0)<1
      or exists(select 1 from jsonb_array_elements_text(v_item->'pronunciationAnswers') a where coalesce(length(public.nl_normalize_answer(a.value)),0)=0) then
      raise exception 'Invalid alphabet content snapshot.' using errcode='22023';
    end if;
    select value into v_template from jsonb_array_elements(p_state->'questionTemplates') where value->>'itemId'=v_item->>'itemId';
    if not found then raise exception 'A frozen alphabet template is missing.' using errcode='22023'; end if;
    if v_template->>'mode'='mcq' then
      perform public.nl_validate_alphabet_mcq(v_item,v_template);
      if p_state->'configuration'->>'mode' is distinct from 'mcq'
        or p_state->'configuration'->>'direction' not in ('character-to-pronunciation','pronunciation-to-character','mixed')
        or (p_state->'configuration'->>'direction'<>'mixed' and v_template->>'direction' is distinct from p_state->'configuration'->>'direction') then
        raise exception 'Alphabet direction is not enabled by this session.' using errcode='22023';
      end if;
    elsif coalesce(v_template->>'mode','typing')<>'typing' or v_template->>'prompt' is distinct from v_item->>'symbol'
      or v_template->'acceptedAnswers' is distinct from (select jsonb_agg(value order by position) from (select public.nl_normalize_answer(a.value) as value,min(a.ordinality) as position from jsonb_array_elements_text(v_item->'pronunciationAnswers') with ordinality a group by public.nl_normalize_answer(a.value)) answers) then
      raise exception 'Alphabet templates must use the frozen pronunciation answers.' using errcode='22023';
    end if;
  end loop;
  select value into v_template from jsonb_array_elements(p_state->'questionTemplates') where value->>'itemId'=(p_state->'currentQuestion'->>'itemId');
  if not found or ((p_state->'currentQuestion')-array['id','position','kind']) is distinct from (v_template-array['id','position','kind']) then
    raise exception 'Alphabet questions must use immutable templates.' using errcode='22023';
  end if;
  v_snapshot := jsonb_build_object('contentVersion',p_state->'contentVersion','items',p_state->'items','questionTemplates',p_state->'questionTemplates','configuration',p_state->'configuration');
  insert into public.alphabet_quiz_sessions(id,user_id,language,content_version,snapshot,state,random_seed,scheduler_version,version,status,learning_date,created_at,updated_at)
    values(v_id,p_user_id,p_state->>'language',(p_state->>'contentVersion')::integer,v_snapshot,p_state,(p_state->>'randomSeed')::bigint,(p_state->>'schedulerVersion')::integer,1,'active',(p_state->>'learningDate')::date,(p_state->>'createdAt')::timestamptz,(p_state->>'updatedAt')::timestamptz);
  return p_state;
end;
$$;

create or replace function public.nl_commit_alphabet_quiz(p_user_id uuid,p_session_id uuid,p_expected_version integer,p_state jsonb,p_submission_id text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.alphabet_quiz_sessions; v_attempt jsonb; v_question jsonb; v_template jsonb; v_old_attempts integer; v_new_attempts integer; v_correct boolean;
begin
  select * into v_old from public.alphabet_quiz_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Alphabet quiz session not found.' using errcode='42501'; end if;
  -- Idempotency precedes the version comparison, including changed replay payloads.
  if p_submission_id is not null and exists(select 1 from public.alphabet_quiz_attempts where session_id=p_session_id and id=p_submission_id) then return jsonb_build_object('conflict',false,'session',v_old.state); end if;
  if p_expected_version is distinct from v_old.version then return jsonb_build_object('conflict',true,'session',v_old.state); end if;
  if v_old.status in ('completed','ended') then return jsonb_build_object('conflict',false,'session',v_old.state); end if;
  if (p_state->>'id')::uuid is distinct from p_session_id or (p_state->>'userId')::uuid is distinct from p_user_id or p_state->>'language' is distinct from v_old.language
    or (p_state->>'randomSeed')::bigint is distinct from v_old.random_seed or (p_state->>'schedulerVersion')::integer is distinct from v_old.scheduler_version
    or p_state->>'createdAt' is distinct from v_old.state->>'createdAt' or p_state->>'learningDate' is distinct from v_old.state->>'learningDate'
    or jsonb_build_object('contentVersion',p_state->'contentVersion','items',p_state->'items','questionTemplates',p_state->'questionTemplates','configuration',p_state->'configuration') is distinct from v_old.snapshot then
    raise exception 'Alphabet quiz snapshots are immutable.' using errcode='22023';
  end if;
  if (p_state->>'version')::integer is distinct from v_old.version+1 then raise exception 'Invalid next alphabet session version.' using errcode='22023'; end if;
  v_old_attempts := jsonb_array_length(v_old.state->'attempts'); v_new_attempts := jsonb_array_length(p_state->'attempts');
  if v_new_attempts is null or v_new_attempts<v_old_attempts or v_new_attempts>v_old_attempts+1
    or (select coalesce(jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) from jsonb_array_elements(p_state->'attempts') with ordinality a where a.ordinality<=v_old_attempts) is distinct from v_old.state->'attempts' then
    raise exception 'Existing alphabet answers are immutable.' using errcode='22023';
  end if;
  if p_submission_id is null then
    if v_new_attempts<>v_old_attempts or (p_state-array['status','version','updatedAt','currentQuestion']) is distinct from (v_old.state-array['status','version','updatedAt','currentQuestion'])
      or p_state->>'status' not in ('active','saved','ended')
      or (p_state->>'status'='saved' and v_old.status<>'active')
      or (p_state->>'status'='ended' and p_state->'currentQuestion' is distinct from 'null'::jsonb)
      or (p_state->>'status'<>'ended' and p_state->'currentQuestion' is distinct from v_old.state->'currentQuestion') then raise exception 'Invalid alphabet session state change.' using errcode='22023'; end if;
  else
    if length(btrim(p_submission_id))=0 or v_old.status<>'active' or v_new_attempts<>v_old_attempts+1 then raise exception 'Only an active alphabet quiz can accept an answer.' using errcode='22023'; end if;
    v_attempt := p_state->'attempts'->v_old_attempts; v_question := v_old.state->'currentQuestion';
    if v_attempt->>'id' is distinct from p_submission_id or v_attempt->>'questionId' is distinct from v_question->>'id'
      or v_attempt->>'itemId' is distinct from v_question->>'itemId' or v_attempt->>'kind' is distinct from v_question->>'kind'
      or (v_attempt->>'position')::integer is distinct from v_old_attempts or coalesce(length(public.nl_normalize_answer(v_attempt->>'answer')),0)=0 then
      raise exception 'The answer does not match the current alphabet question.' using errcode='22023';
    end if;
    select value into v_template from jsonb_array_elements(v_old.snapshot->'questionTemplates') where value->>'itemId'=v_question->>'itemId';
    if v_template->>'mode'='mcq' then
      if not exists(select 1 from jsonb_array_elements(v_template->'options') o where o.value->>'id'=v_attempt->>'answer') then
        raise exception 'Select one of the frozen alphabet options.' using errcode='22023';
      end if;
      v_correct := v_attempt->>'answer'=v_template->>'correctOptionId';
    else
      select exists(select 1 from jsonb_array_elements_text(v_template->'acceptedAnswers') a where public.nl_normalize_answer(v_attempt->>'answer')=a.value) into v_correct;
    end if;
    if (v_attempt->>'correct')::boolean is distinct from v_correct then raise exception 'The submitted grade does not match the frozen pronunciation answer.' using errcode='22023'; end if;
    if (select coalesce(jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) from jsonb_array_elements(p_state->'questions') with ordinality a where a.ordinality<=jsonb_array_length(v_old.state->'questions')) is distinct from v_old.state->'questions' then raise exception 'Existing alphabet questions are immutable.' using errcode='22023'; end if;
    if p_state->>'status' not in ('active','completed') or (p_state->>'status'='completed' and p_state->'currentQuestion' is distinct from 'null'::jsonb)
      or (p_state->>'status'='active' and (p_state->'currentQuestion' is distinct from p_state->'questions'->v_new_attempts or jsonb_array_length(p_state->'questions')<>v_new_attempts+1)) then raise exception 'Invalid next alphabet question.' using errcode='22023'; end if;
    for v_question in select value from jsonb_array_elements(p_state->'questions') loop
      select value into v_template from jsonb_array_elements(v_old.snapshot->'questionTemplates') where value->>'itemId'=v_question->>'itemId';
      if not found or (v_question-array['id','position','kind']) is distinct from (v_template-array['id','position','kind']) then raise exception 'Alphabet questions must use immutable templates.' using errcode='22023'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(p_state->'reservations') r where not exists(select 1 from jsonb_array_elements(v_old.snapshot->'items') i where i.value->>'itemId'=r.value->>'itemId')) then raise exception 'A retry cannot introduce unselected characters.' using errcode='22023'; end if;
    insert into public.alphabet_quiz_attempts(session_id,user_id,id,question_id,item_id,position,kind,answer,correct,answered_at)
      values(p_session_id,p_user_id,p_submission_id,v_attempt->>'questionId',v_attempt->>'itemId',(v_attempt->>'position')::integer,v_attempt->>'kind',v_attempt->>'answer',v_correct,(v_attempt->>'answeredAt')::timestamptz);
    insert into public.learning_activity(id,user_id,language,learning_date,kind,count)
      values('alphabet-quiz:'||p_session_id||':'||p_submission_id,p_user_id,v_old.language,public.nl_learning_date(p_user_id,(v_attempt->>'answeredAt')::timestamptz),'alphabet-quiz',1) on conflict do nothing;
  end if;
  update public.alphabet_quiz_sessions set state=p_state,version=(p_state->>'version')::integer,status=p_state->>'status',updated_at=(p_state->>'updatedAt')::timestamptz where id=p_session_id;
  return jsonb_build_object('conflict',false,'session',p_state);
end;
$$;
revoke all on function public.nl_guard_alphabet_quiz_snapshot(),public.nl_create_alphabet_quiz(uuid,jsonb),public.nl_commit_alphabet_quiz(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.nl_guard_alphabet_quiz_snapshot(),public.nl_create_alphabet_quiz(uuid,jsonb),public.nl_commit_alphabet_quiz(uuid,uuid,integer,jsonb,text) to service_role;


notify pgrst, 'reload schema';
