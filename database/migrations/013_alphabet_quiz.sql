-- Independent Alphabet history and retries: deliberately no vocabulary/SRS foreign keys.
create table public.alphabet_quiz_sessions (
  id uuid primary key, user_id uuid not null references public.profiles(user_id) on delete cascade,
  language text not null check(language in ('ja','es','el')),
  content_version integer not null check(content_version > 0),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), state jsonb not null check(jsonb_typeof(state)='object'),
  random_seed bigint not null check(random_seed between 0 and 4294967295), scheduler_version integer not null check(scheduler_version > 0),
  version integer not null check(version > 0), status text not null check(status in ('active','saved','completed','ended')),
  learning_date date not null, created_at timestamptz not null, updated_at timestamptz not null,
  unique(id,user_id)
);
create table public.alphabet_quiz_attempts (
  session_id uuid not null, user_id uuid not null, id text not null check(length(btrim(id))>0),
  question_id text not null, item_id text not null check(length(item_id)>0),
  position integer not null check(position >= 0), kind text not null check(kind in ('initial','retry','filler')),
  answer text not null check(length(public.nl_normalize_answer(answer))>0), correct boolean not null, answered_at timestamptz not null,
  primary key(session_id,id), unique(session_id,question_id), unique(session_id,position),
  foreign key(session_id,user_id) references public.alphabet_quiz_sessions(id,user_id) on delete cascade
);
create index alphabet_quiz_sessions_resume on public.alphabet_quiz_sessions(user_id,language,status,updated_at desc);
create index alphabet_quiz_attempts_owner on public.alphabet_quiz_attempts(user_id,session_id);

alter table public.learning_activity drop constraint learning_activity_kind_check;
alter table public.learning_activity add constraint learning_activity_kind_check check(kind in ('quiz','alphabet-quiz','reading','grammar'));

alter table public.alphabet_quiz_sessions enable row level security;
alter table public.alphabet_quiz_attempts enable row level security;
revoke all on public.alphabet_quiz_sessions,public.alphabet_quiz_attempts from public,anon,authenticated;
grant select on public.alphabet_quiz_sessions,public.alphabet_quiz_attempts to authenticated;
grant all on public.alphabet_quiz_sessions,public.alphabet_quiz_attempts to service_role;
create policy owner_select on public.alphabet_quiz_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy owner_select on public.alphabet_quiz_attempts for select to authenticated using(user_id=(select auth.uid()));

create function public.nl_guard_alphabet_quiz_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.language is distinct from old.language
    or new.content_version is distinct from old.content_version or new.snapshot is distinct from old.snapshot
    or new.random_seed is distinct from old.random_seed or new.scheduler_version is distinct from old.scheduler_version
    or new.created_at is distinct from old.created_at or new.learning_date is distinct from old.learning_date
    or jsonb_build_object('contentVersion',new.state->'contentVersion','items',new.state->'items','questionTemplates',new.state->'questionTemplates','configuration',new.state->'configuration') is distinct from old.snapshot then
    raise exception 'Alphabet quiz snapshots are immutable.' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger alphabet_quiz_snapshot_immutable before update on public.alphabet_quiz_sessions for each row execute function public.nl_guard_alphabet_quiz_snapshot();

-- Called only by the authenticated server's privileged client. The HTTP contract
-- accepts selected IDs, never caller-supplied content, templates, grades or state.
create function public.nl_create_alphabet_quiz(p_user_id uuid,p_state jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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
    if not found or v_template->>'prompt' is distinct from v_item->>'symbol'
      or v_template->'acceptedAnswers' is distinct from (select jsonb_agg(value order by position) from (select public.nl_normalize_answer(a.value) as value,min(a.ordinality) as position from jsonb_array_elements_text(v_item->'pronunciationAnswers') with ordinality a group by public.nl_normalize_answer(a.value)) answers) then
      raise exception 'Alphabet templates must use the frozen pronunciation answers.' using errcode='22023';
    end if;
  end loop;
  v_snapshot := jsonb_build_object('contentVersion',p_state->'contentVersion','items',p_state->'items','questionTemplates',p_state->'questionTemplates','configuration',p_state->'configuration');
  insert into public.alphabet_quiz_sessions(id,user_id,language,content_version,snapshot,state,random_seed,scheduler_version,version,status,learning_date,created_at,updated_at)
    values(v_id,p_user_id,p_state->>'language',(p_state->>'contentVersion')::integer,v_snapshot,p_state,(p_state->>'randomSeed')::bigint,(p_state->>'schedulerVersion')::integer,1,'active',(p_state->>'learningDate')::date,(p_state->>'createdAt')::timestamptz,(p_state->>'updatedAt')::timestamptz);
  return p_state;
end;
$$;

create function public.nl_commit_alphabet_quiz(p_user_id uuid,p_session_id uuid,p_expected_version integer,p_state jsonb,p_submission_id text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
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
    select exists(select 1 from jsonb_array_elements_text(v_template->'acceptedAnswers') a where public.nl_normalize_answer(v_attempt->>'answer')=a.value) into v_correct;
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

-- Vocabulary lookups never share contextual Reading cache identities. Existing
-- Reading rows keep the original generated cache key and become kind=reading.
alter table public.translation_cache add column lookup_kind text not null default 'reading' check(lookup_kind in ('reading','vocabulary'));
alter table public.translation_cache add column target_language text not null default 'EN' check(target_language='EN');
alter table public.translation_cache add constraint vocabulary_cache_empty_context check(lookup_kind<>'vocabulary' or context='');
alter table public.translation_cache drop constraint translation_cache_user_id_language_cache_key_key;
alter table public.translation_cache add constraint translation_cache_owner_kind_key unique(user_id,language,lookup_kind,cache_key);
create index translation_cache_owner_kind on public.translation_cache(user_id,language,lookup_kind);

notify pgrst, 'reload schema';
