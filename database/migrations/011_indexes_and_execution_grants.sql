create index vocabulary_lists_owner_language on public.vocabulary_lists(user_id,language);
create index vocabulary_entries_owner_language on public.vocabulary_entries(user_id,language);
create index vocabulary_entries_owned_list on public.vocabulary_entries(list_id,user_id,language);
create index vocabulary_entries_category on public.vocabulary_entries(user_id,language,category);
create index accepted_answers_owner on public.accepted_answers(user_id,entry_id);
create index vocabulary_examples_owner on public.vocabulary_examples(user_id,entry_id);
create index vocabulary_related_owner on public.vocabulary_related_words(user_id,entry_id);
create index word_progress_due on public.word_progress(user_id,language,due_date);
create index quiz_sessions_resume on public.quiz_sessions(user_id,language,status,updated_at desc);
create index quiz_questions_owner on public.quiz_questions(user_id,session_id);
create index quiz_attempts_owner on public.quiz_attempts(user_id,session_id);
create index retry_reservations_owner on public.retry_reservations(user_id,session_id);
create index review_settlements_owner_word on public.review_settlements(user_id,word_id);
create index learning_activity_owner_day on public.learning_activity(user_id,language,learning_date);
create index readings_owner_language on public.readings(user_id,language);
create index reading_versions_owner on public.reading_versions(user_id,reading_id);
create index reading_annotations_owner_range on public.reading_annotations(user_id,reading_id,body_version,start_offset,end_offset);
create index reading_annotations_vocabulary on public.reading_annotations(vocabulary_entry_id) where vocabulary_entry_id is not null;
create index translation_cache_owner_language on public.translation_cache(user_id,language);
create index grammar_examples_version on public.grammar_examples(point_id,content_version);
create index grammar_exercises_version on public.grammar_exercises(point_id,content_version);
create index grammar_reviews_version on public.grammar_reviews(point_id,content_version);
create index grammar_progress_owner_language on public.grammar_progress(user_id,language);
create index grammar_points_language_filters on public.grammar_points(language,level,category);
create index grammar_versions_publication on public.grammar_versions(status,point_id,content_version);

-- PostgreSQL functions otherwise grant EXECUTE to PUBLIC, including anonymous callers.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'nl\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;
grant usage on schema public to authenticated,service_role;
grant execute on function public.nl_profile(),public.nl_vocabulary_entry(uuid),public.nl_vocabulary_entries(text),public.nl_word_progress(uuid),public.nl_progress_words(text),
  public.nl_reading(uuid),public.nl_annotation(uuid),public.nl_grammar_point(text),public.nl_grammar_points(text),public.nl_grammar_is_published(text,integer)
  to authenticated;
grant execute on function public.nl_save_vocabulary(jsonb,uuid),public.nl_import_vocabulary(jsonb),public.nl_save_reading(jsonb,uuid,boolean,integer),public.nl_annotate_reading(jsonb),public.nl_submit_grammar(text,jsonb) to authenticated;
-- Auth triggers call their functions as the database owner, not anonymous/authenticated roles.
