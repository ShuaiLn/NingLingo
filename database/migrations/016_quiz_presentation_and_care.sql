-- Personal presentation defaults never alter grading or scheduler state.
create table public.quiz_preferences (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  presentation text not null default 'always' check(presentation in ('always','incorrect','never')),
  vocabulary_auto_audio boolean not null default false,
  alphabet_auto_audio boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.word_care_states (
  word_id uuid primary key,
  user_id uuid not null,
  manual_care boolean not null default false,
  automatic_suppressed boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key(word_id,user_id) references public.vocabulary_entries(id,user_id) on delete cascade
);
create index word_care_states_owner on public.word_care_states(user_id,word_id);
alter table public.quiz_preferences enable row level security;
alter table public.word_care_states enable row level security;
create policy quiz_preferences_owner_read on public.quiz_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy word_care_states_owner_read on public.word_care_states for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.quiz_preferences,public.word_care_states from anon,authenticated;
grant select on public.quiz_preferences,public.word_care_states to authenticated;
grant all on public.quiz_preferences,public.word_care_states to service_role;

create function public.nl_quiz_preferences() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('presentation',coalesce(p.presentation,'always'),'vocabularyAutoAudio',coalesce(p.vocabulary_auto_audio,false),'alphabetAutoAudio',coalesce(p.alphabet_auto_audio,false))
  from (select auth.uid() as user_id) owner left join public.quiz_preferences p on p.user_id=owner.user_id
  where owner.user_id is not null;
$$;
create function public.nl_update_quiz_preferences(p_preferences jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences)<>'object' then raise exception 'Invalid quiz preferences.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_preferences) k where k not in ('presentation','vocabularyAutoAudio','alphabetAutoAudio')) then
    raise exception 'Invalid quiz preferences.' using errcode='22023';
  end if;
  if (p_preferences ? 'presentation' and (jsonb_typeof(p_preferences->'presentation')<>'string' or p_preferences->>'presentation' not in ('always','incorrect','never')))
    or (p_preferences ? 'vocabularyAutoAudio' and jsonb_typeof(p_preferences->'vocabularyAutoAudio')<>'boolean')
    or (p_preferences ? 'alphabetAutoAudio' and jsonb_typeof(p_preferences->'alphabetAutoAudio')<>'boolean') then
    raise exception 'Invalid quiz preferences.' using errcode='22023';
  end if;
  insert into public.quiz_preferences(user_id) values(v_user) on conflict do nothing;
  update public.quiz_preferences set presentation=coalesce(p_preferences->>'presentation',presentation),
    vocabulary_auto_audio=coalesce((p_preferences->>'vocabularyAutoAudio')::boolean,vocabulary_auto_audio),
    alphabet_auto_audio=coalesce((p_preferences->>'alphabetAutoAudio')::boolean,alphabet_auto_audio),updated_at=clock_timestamp() where user_id=v_user;
  return public.nl_quiz_preferences();
end;
$$;
create function public.nl_word_care(p_language text default null) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('wordId',s.word_id,'userId',s.user_id,'manualCare',s.manual_care,'automaticSuppressed',s.automatic_suppressed,'updatedAt',s.updated_at) order by s.word_id),'[]'::jsonb)
  from public.word_care_states s join public.vocabulary_entries v on v.id=s.word_id and v.user_id=s.user_id
  where s.user_id=auth.uid() and (p_language is null or v.language=p_language);
$$;
create function public.nl_set_word_care(p_word_id uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_state public.word_care_states;
begin
  if v_user is null or not exists(select 1 from public.vocabulary_entries where id=p_word_id and user_id=v_user) then
    raise exception 'This word is unavailable in your workspace.' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('add','remove') then raise exception 'Choose add or remove.' using errcode='22023'; end if;
  -- Serialize Remove with a newly committed answer on this word. Existing error
  -- counters and attempt history are deliberately untouched.
  perform 1 from public.vocabulary_entries where id=p_word_id and user_id=v_user for update;
  insert into public.word_care_states(word_id,user_id,manual_care,automatic_suppressed)
    values(p_word_id,v_user,p_action='add',p_action='remove')
    on conflict(word_id) do update set manual_care=p_action='add',
      automatic_suppressed=case when p_action='remove' then true else word_care_states.automatic_suppressed end,
      updated_at=clock_timestamp() returning * into v_state;
  return jsonb_build_object('wordId',v_state.word_id,'userId',v_state.user_id,'manualCare',v_state.manual_care,'automaticSuppressed',v_state.automatic_suppressed,'updatedAt',v_state.updated_at);
end;
$$;

-- AFTER INSERT fires only for a genuinely new incorrect submission. CAS replay
-- returns before INSERT; delayed SRS settlement and old attempts never reach it.
create function public.nl_reactivate_word_care() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not new.correct then
    perform 1 from public.vocabulary_entries where id=new.word_id and user_id=new.user_id for update;
    update public.word_care_states set automatic_suppressed=false,updated_at=clock_timestamp()
      where word_id=new.word_id and user_id=new.user_id and automatic_suppressed;
  end if;
  return new;
end;
$$;
create trigger new_incorrect_submission_reactivates_care after insert on public.quiz_attempts for each row execute function public.nl_reactivate_word_care();

alter table public.quiz_sessions add column presentation text not null default 'always' check(presentation in ('always','incorrect','never'));
create function public.nl_guard_quiz_presentation() returns trigger language plpgsql set search_path='' as $$
declare v_presentation text:=coalesce(new.state->>'presentation','always');
begin
  if v_presentation not in ('always','incorrect','never') then raise exception 'Invalid session presentation preference.' using errcode='22023'; end if;
  if tg_op='UPDATE' and v_presentation<>coalesce(old.state->>'presentation','always') then
    raise exception 'Session presentation preference is immutable.' using errcode='22023';
  end if;
  new.presentation:=v_presentation;
  if tg_op='INSERT' and new.state ? 'presentation' then
    -- Direct authenticated API creation has the same remembered default as UI
    -- creation. Partial upsert preserves both independent audio preferences.
    insert into public.quiz_preferences(user_id,presentation) values(new.user_id,v_presentation)
      on conflict(user_id) do update set presentation=excluded.presentation,updated_at=clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger quiz_presentation_immutable before insert or update on public.quiz_sessions for each row execute function public.nl_guard_quiz_presentation();

revoke all on function public.nl_quiz_preferences(),public.nl_update_quiz_preferences(jsonb),public.nl_word_care(text),public.nl_set_word_care(uuid,text),public.nl_reactivate_word_care(),public.nl_guard_quiz_presentation() from public,anon,authenticated;
grant execute on function public.nl_quiz_preferences(),public.nl_update_quiz_preferences(jsonb),public.nl_word_care(text),public.nl_set_word_care(uuid,text) to authenticated,service_role;
