-- Backward-compatible expansion: vocabulary_entries.example remains the seven-column CSV field.
-- Rich examples and explicit relations are stored independently; no inferred forms/readings.
create table public.vocabulary_examples (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, entry_id uuid not null,
  ordinal integer not null check(ordinal>=0), text text not null check(length(btrim(text))>0), reading text not null default '', translation text not null default '',
  unique(entry_id,ordinal), foreign key(entry_id,user_id) references public.vocabulary_entries(id,user_id) on delete cascade
);
create table public.vocabulary_related_words (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, entry_id uuid not null,
  ordinal integer not null check(ordinal>=0), word text not null check(length(btrim(word))>0), reading text not null default '', translation text not null default '',
  relation_type text not null check(relation_type in ('derived','compound','synonym','antonym','word_form','related')),
  unique(entry_id,ordinal), foreign key(entry_id,user_id) references public.vocabulary_entries(id,user_id) on delete cascade
);
insert into public.vocabulary_examples(user_id,entry_id,ordinal,text)
select user_id,id,0,example from public.vocabulary_entries where btrim(example)<>'';
