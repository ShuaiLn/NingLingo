-- READ ONLY: inspect schema metadata for the installed NingLingo implementation.
-- Run in the Supabase SQL Editor, then return the single `schema_verification`
-- JSON value. This reads no vocabulary, session, account, or secret values.
-- It does not apply migrations, create functions, write data, or alter settings.
with required_tables(name) as (
  values ('profiles'),('vocabulary_lists'),('vocabulary_entries'),('accepted_answers'),
    ('word_progress'),('quiz_sessions'),('quiz_questions'),('quiz_attempts'),
    ('retry_reservations'),('review_settlements'),('learning_activity'),('readings'),
    ('reading_versions'),('reading_annotations'),('translation_cache'),
    ('grammar_points'),('grammar_versions'),('grammar_examples'),
    ('grammar_exercises'),('grammar_sources'),('grammar_reviews'),('grammar_progress'),
    ('alphabet_quiz_sessions'),('alphabet_quiz_attempts'),('word_pairs'),
    ('quiz_preferences'),('word_care_states')
), relations as (
  select r.name,c.oid,c.relrowsecurity,c.relforcerowsecurity
  from required_tables r
  left join pg_catalog.pg_namespace n on n.nspname='public'
  left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=r.name and c.relkind in ('r','p')
), table_metadata as (
  select r.name,jsonb_build_object(
    'exists',r.oid is not null,
    'rlsEnabled',r.relrowsecurity,
    'rlsForced',r.relforcerowsecurity,
    'columns',coalesce((select jsonb_agg(jsonb_build_object(
      'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'notNull',a.attnotnull,'generated',a.attgenerated,
      'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)
    ) order by a.attnum) from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
    'constraints',coalesce((select jsonb_agg(jsonb_build_object(
      'name',c.conname,'kind',c.contype,'definition',pg_catalog.pg_get_constraintdef(c.oid),
      'validated',c.convalidated,'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred
    ) order by c.conname) from pg_catalog.pg_constraint c where c.conrelid=r.oid),'[]'::jsonb),
    'indexes',coalesce((select jsonb_agg(jsonb_build_object(
      'name',c.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),
      'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready
    ) order by c.relname) from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid=i.indexrelid where i.indrelid=r.oid),'[]'::jsonb),
    'triggers',coalesce((select jsonb_agg(jsonb_build_object(
      'name',t.tgname,'definition',pg_catalog.pg_get_triggerdef(t.oid),
      'enabled',t.tgenabled,'function',p.proname,
      'deferrable',t.tgdeferrable,'initiallyDeferred',t.tginitdeferred
    ) order by t.tgname) from pg_catalog.pg_trigger t
      join pg_catalog.pg_proc p on p.oid=t.tgfoid where t.tgrelid=r.oid and not t.tgisinternal),'[]'::jsonb),
    'policies',coalesce((select jsonb_agg(jsonb_build_object(
      'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select jsonb_agg(coalesce(pr.rolname,'PUBLIC') order by pr.rolname)
        from unnest(p.polroles) role_id left join pg_catalog.pg_roles pr on pr.oid=role_id),
      'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),
      'withCheck',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)
    ) order by p.polname) from pg_catalog.pg_policy p where p.polrelid=r.oid),'[]'::jsonb),
    'grants',(select jsonb_object_agg(role_name,jsonb_build_object(
      'select',case when r.oid is null then false else pg_catalog.has_table_privilege(role_name,r.oid,'SELECT') end,
      'insert',case when r.oid is null then false else pg_catalog.has_table_privilege(role_name,r.oid,'INSERT') end,
      'update',case when r.oid is null then false else pg_catalog.has_table_privilege(role_name,r.oid,'UPDATE') end,
      'delete',case when r.oid is null then false else pg_catalog.has_table_privilege(role_name,r.oid,'DELETE') end
    )) from (values ('anon'),('authenticated'),('service_role')) roles(role_name))
  ) as metadata from relations r
), function_metadata as (
  select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
    jsonb_build_object(
      'name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
      'result',pg_catalog.pg_get_function_result(p.oid),'language',l.lanname,
      'securityDefiner',p.prosecdef,'settings',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
      'volatility',p.provolatile,'strict',p.proisstrict,
      'bodyMd5',md5(replace(p.prosrc,E'\r\n',E'\n')),
      'grants',(select jsonb_object_agg(role_name,pg_catalog.has_function_privilege(role_name,p.oid,'EXECUTE'))
        from (values ('anon'),('authenticated'),('service_role')) roles(role_name)),
      'publicExecute',exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE')
    ) as metadata
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_language l on l.oid=p.prolang
  where n.nspname='public' and left(p.proname,3)='nl_'
), auth_triggers as (
  select jsonb_build_object('name',t.tgname,'definition',pg_catalog.pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',p.proname) as metadata
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_proc p on p.oid=t.tgfoid
  where n.nspname='auth' and c.relname='users' and t.tgname='ninglingo_auth_user_created'
)
select jsonb_build_object(
  'formatVersion',1,
  'serverVersion',current_setting('server_version_num'),
  'tables',(select jsonb_object_agg(name,metadata order by name) from table_metadata),
  'functions',(select jsonb_agg(metadata order by proname,arguments) from function_metadata),
  'authTriggers',coalesce((select jsonb_agg(metadata) from auth_triggers),'[]'::jsonb)
) as schema_verification;
