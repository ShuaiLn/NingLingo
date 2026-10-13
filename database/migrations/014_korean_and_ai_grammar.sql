-- Extend language constraints in place; existing rows, reviews, versions and session JSON stay intact.
alter table public.profiles drop constraint profiles_languages;
alter table public.profiles add constraint profiles_languages check (language_preferences <@ array['ja','es','el','ko']::text[] and cardinality(language_preferences)>0);
alter table public.profiles alter column language_preferences set default array['ja','es','el','ko'];
alter table public.vocabulary_lists drop constraint vocabulary_lists_language_check;
alter table public.vocabulary_lists add constraint vocabulary_lists_language_check check(language in ('ja','es','el','ko'));
alter table public.vocabulary_entries drop constraint vocabulary_entries_language_check;
alter table public.vocabulary_entries add constraint vocabulary_entries_language_check check(language in ('ja','es','el','ko'));
alter table public.quiz_sessions drop constraint quiz_sessions_language_check;
alter table public.quiz_sessions add constraint quiz_sessions_language_check check(language in ('ja','es','el','ko'));
alter table public.learning_activity drop constraint learning_activity_language_check;
alter table public.learning_activity add constraint learning_activity_language_check check(language in ('ja','es','el','ko'));
alter table public.readings drop constraint readings_language_check;
alter table public.readings add constraint readings_language_check check(language in ('ja','es','el','ko'));
alter table public.translation_cache drop constraint translation_cache_language_check;
alter table public.translation_cache add constraint translation_cache_language_check check(language in ('ja','es','el','ko'));
alter table public.grammar_points drop constraint grammar_points_language_check;
alter table public.grammar_points add constraint grammar_points_language_check check(language in ('ja','es','el','ko'));
alter table public.alphabet_quiz_sessions drop constraint alphabet_quiz_sessions_language_check;
alter table public.alphabet_quiz_sessions add constraint alphabet_quiz_sessions_language_check check(language in ('ja','es','el','ko'));
alter table public.grammar_versions drop constraint grammar_versions_status_check;
alter table public.grammar_versions add constraint grammar_versions_status_check check(status in ('draft','reviewed','published','published-ai'));
-- AI publication is an independent provenance state; it never creates a human-review record.
-- Human review is an explicit administrative operation. Draft imports never gain a review
-- record merely because automated structural validation passes.
create or replace function public.nl_validate_grammar_publication() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.grammar_versions v where v.point_id=new.point_id and v.content_version=new.content_version and v.status in ('reviewed','published','published-ai')) then
    if (select count(*) from public.grammar_examples where point_id=new.point_id and content_version=new.content_version)<3
      or (select count(*) from public.grammar_exercises where point_id=new.point_id and content_version=new.content_version)<5
      or not exists(select 1 from public.grammar_sources where point_id=new.point_id and content_version=new.content_version)
      or (exists(select 1 from public.grammar_versions where point_id=new.point_id and content_version=new.content_version and status in ('reviewed','published')) and not exists(select 1 from public.grammar_reviews where point_id=new.point_id and content_version=new.content_version and human_review))
      or (exists(select 1 from public.grammar_versions where point_id=new.point_id and content_version=new.content_version and status='published-ai' and (development_seed or coalesce(manifest->>'modificationNotes','') not like '%AI-authored; not human-reviewed%' or (manifest->'reviewer') is distinct from 'null'::jsonb))
        or exists(select 1 from public.grammar_versions v join public.grammar_reviews r on r.point_id=v.point_id and r.content_version=v.content_version where v.point_id=new.point_id and v.content_version=new.content_version and v.status='published-ai' and r.human_review)) then
      raise exception 'Published lessons require complete content and accurate human or AI provenance.' using errcode='22023';
    end if;
  end if;
  return null;
end;
$$;
-- Existing deferred publication trigger is retained.

create or replace function public.nl_import_grammar(p_points jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_point jsonb; v_row jsonb; v_id text; v_version integer; v_ordinal integer; v_old jsonb; v_imported integer:=0; v_unchanged integer:=0;
begin
  if jsonb_typeof(p_points)<>'array' then raise exception 'Grammar content must be an array.' using errcode='22023'; end if;
  for v_point in select value from jsonb_array_elements(p_points) loop
    v_id:=v_point->>'id'; v_version:=(v_point->>'contentVersion')::integer;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('grammar:'||v_id,0));
    select manifest into v_old from public.grammar_versions where point_id=v_id and content_version=v_version;
    if found then
      if v_old<>v_point then raise exception 'Grammar content % version % is immutable; increment contentVersion.',v_id,v_version using errcode='22023'; end if;
      v_unchanged:=v_unchanged+1; continue;
    end if;
    if coalesce(jsonb_typeof(v_point->'examples'),'null')<>'array' or coalesce(jsonb_typeof(v_point->'exercises'),'null')<>'array' or coalesce(jsonb_typeof(v_point->'sources'),'null')<>'array' then raise exception 'Examples, exercises, and sources must be arrays.' using errcode='22023'; end if;
    if jsonb_array_length(v_point->'examples')<3 or jsonb_array_length(v_point->'exercises')<5 or jsonb_array_length(v_point->'sources')<1 then raise exception 'Every lesson needs three examples, five exercises, and source metadata.' using errcode='22023'; end if;
    if v_point->>'status' not in ('draft','reviewed','published','published-ai') then raise exception 'Invalid grammar publication status.' using errcode='22023'; end if;
    if v_point->>'status' in ('reviewed','published') and (v_point->'reviewer' is null or v_point->'reviewer'='null'::jsonb or btrim(coalesce(v_point->'reviewer'->>'name',''))='') then raise exception 'Human review is required before reviewed or published status.' using errcode='22023'; end if;
    if v_point->>'status'='published-ai' and (v_point->'reviewer' is distinct from 'null'::jsonb or coalesce((v_point->>'developmentSeed')::boolean,false) or coalesce(v_point->>'modificationNotes','') not like '%AI-authored; not human-reviewed%') then raise exception 'AI publication must disclose its origin and cannot claim human review.' using errcode='22023'; end if;
    if exists(select 1 from public.grammar_points where id=v_id and language<>v_point->>'language') then raise exception 'A lesson cannot change language.' using errcode='22023'; end if;
    insert into public.grammar_points(id,language,title,level,category,current_version) values(v_id,v_point->>'language',v_point->>'title',v_point->>'level',coalesce(v_point->>'category',''),v_version)
      on conflict(id) do update set
        title=case when excluded.current_version>=public.grammar_points.current_version then excluded.title else public.grammar_points.title end,
        level=case when excluded.current_version>=public.grammar_points.current_version then excluded.level else public.grammar_points.level end,
        category=case when excluded.current_version>=public.grammar_points.current_version then excluded.category else public.grammar_points.category end,
        current_version=greatest(public.grammar_points.current_version,excluded.current_version);
    insert into public.grammar_versions(point_id,content_version,explanation,formation,status,modification_notes,development_seed,manifest)
      values(v_id,v_version,v_point->>'explanation',v_point->>'formation',v_point->>'status',coalesce(v_point->>'modificationNotes',''),coalesce((v_point->>'developmentSeed')::boolean,false),v_point);
    v_ordinal:=0;
    for v_row in select value from jsonb_array_elements(v_point->'examples') loop
      insert into public.grammar_examples(point_id,content_version,id,ordinal,text,reading,translation) values(v_id,v_version,v_row->>'id',v_ordinal,v_row->>'text',v_row->>'reading',v_row->>'translation'); v_ordinal:=v_ordinal+1;
    end loop;
    v_ordinal:=0;
    for v_row in select value from jsonb_array_elements(v_point->'exercises') loop
      if jsonb_typeof(v_row->'choices')<>'array' or jsonb_array_length(v_row->'choices')<>(select count(distinct normalize(btrim(x.value),NFC)) from jsonb_array_elements_text(v_row->'choices') x)
        or exists(select 1 from jsonb_array_elements_text(v_row->'choices') x where btrim(x.value)='') then raise exception 'Exercise choices must be nonempty and unique.' using errcode='22023'; end if;
      insert into public.grammar_exercises(point_id,content_version,id,ordinal,prompt,choices,correct_index,explanation)
        values(v_id,v_version,v_row->>'id',v_ordinal,v_row->>'prompt',array(select jsonb_array_elements_text(v_row->'choices')),(v_row->>'correctIndex')::integer,v_row->>'explanation'); v_ordinal:=v_ordinal+1;
    end loop;
    v_ordinal:=0;
    for v_row in select value from jsonb_array_elements(v_point->'sources') loop
      insert into public.grammar_sources(point_id,content_version,ordinal,title,url,reference_version,license,attribution)
        values(v_id,v_version,v_ordinal,v_row->>'title',v_row->>'url',v_row->>'version',v_row->>'license',v_row->>'attribution'); v_ordinal:=v_ordinal+1;
    end loop;
    if v_point->>'status' in ('reviewed','published') then
      insert into public.grammar_reviews(point_id,content_version,reviewer_name,reviewed_at,human_review,modification_notes) values(v_id,v_version,v_point->'reviewer'->>'name',(v_point->'reviewer'->>'date')::date,true,coalesce(v_point->>'modificationNotes',''));
    end if;
    v_imported:=v_imported+1;
  end loop;
  return jsonb_build_object('imported',v_imported,'unchanged',v_unchanged);
end;
$$;
-- Existing RLS policies and server-side nl_submit_grammar use this shared publication predicate.
create or replace function public.nl_grammar_is_published(p_id text,p_version integer default null) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.grammar_points p join public.grammar_versions v on v.point_id=p.id and v.content_version=coalesce(p_version,p.current_version)
    where p.id=p_id and (
      (v.status='published' and exists(select 1 from public.grammar_reviews r where r.point_id=v.point_id and r.content_version=v.content_version and r.human_review))
      or (v.status='published-ai' and not v.development_seed and v.manifest->'reviewer'='null'::jsonb and v.modification_notes like '%AI-authored; not human-reviewed%')
    ));
$$;
-- CREATE OR REPLACE retains the execution grants: import remains service-role only.
notify pgrst, 'reload schema';
