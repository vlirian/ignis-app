begin;

alter table public.news_messages
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

create index if not exists idx_news_messages_archived
  on public.news_messages(is_archived, priority desc, created_at desc);

commit;
