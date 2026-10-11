-- No anonymous access. Domain computations are server-only; ordinary users cannot forge
-- quiz grades, SRS stages, grammar completion, machine sources, or publication/review metadata.
do $$
declare t text;
begin
  foreach t in array array['profiles','vocabulary_lists','vocabulary_entries','accepted_answers','vocabulary_examples','vocabulary_related_words','word_progress','quiz_sessions','quiz_questions','quiz_attempts','retry_reservations','review_settlements','learning_activity','readings','reading_versions','reading_annotations','translation_cache','grammar_progress'] loop
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  foreach t in array array['profiles','vocabulary_lists'] loop
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
    execute format('create policy owner_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
    execute format('grant insert,update on public.%I to authenticated',t);
  end loop;
  foreach t in array array['vocabulary_lists','vocabulary_entries','readings'] loop
    execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))',t);
    execute format('grant delete on public.%I to authenticated',t);
  end loop;
  foreach t in array array['grammar_points','grammar_versions','grammar_examples','grammar_exercises','grammar_sources','grammar_reviews'] loop
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end;
$$;
-- This helper avoids recursive grammar_points <-> grammar_versions RLS checks. It exposes
-- only a boolean and uses a pinned search_path; draft metadata remains inaccessible.
create function public.nl_grammar_is_published(p_id text,p_version integer default null) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.grammar_points p join public.grammar_versions v on v.point_id=p.id and v.content_version=coalesce(p_version,p.current_version)
    where p.id=p_id and v.status='published' and exists(select 1 from public.grammar_reviews r where r.point_id=v.point_id and r.content_version=v.content_version and r.human_review));
$$;
create policy published_grammar on public.grammar_points for select to authenticated using (public.nl_grammar_is_published(id));
create policy published_grammar on public.grammar_versions for select to authenticated using (public.nl_grammar_is_published(point_id,content_version));
create policy published_grammar on public.grammar_examples for select to authenticated using (public.nl_grammar_is_published(point_id,content_version));
create policy published_grammar on public.grammar_exercises for select to authenticated using (public.nl_grammar_is_published(point_id,content_version));
create policy published_grammar on public.grammar_sources for select to authenticated using (public.nl_grammar_is_published(point_id,content_version));
create policy published_grammar on public.grammar_reviews for select to authenticated using (public.nl_grammar_is_published(point_id,content_version));
