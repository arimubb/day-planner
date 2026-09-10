create extension if not exists pgcrypto;

create table if not exists public.app_users (
    id uuid primary key default gen_random_uuid(),
    browser_key_hash text not null unique,
    created_at timestamptz not null default now()
);

alter table public.tasks
    add column if not exists app_user_id uuid references public.app_users(id);

-- Keep existing rows available for a later manual account migration.
-- New anonymous browser users are intentionally independent of Telegram users.
insert into public.app_users (id, browser_key_hash)
select
    id,
    encode(digest('legacy:' || id::text, 'sha256'), 'hex')
from public.telegram_users
on conflict (id) do nothing;

update public.tasks
set app_user_id = telegram_user_id
where app_user_id is null
  and telegram_user_id is not null;

create index if not exists tasks_app_user_id_idx
    on public.tasks(app_user_id);
