create table if not exists public.waitlist_entries (
  id bigint generated always as identity primary key,
  name text not null,
  email text,
  whatsapp text,
  preferred_contact text not null check (preferred_contact in ('email', 'whatsapp', 'both')),
  source text default 'landing-page',
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_entries_email_unique
  on public.waitlist_entries (email)
  where email is not null;

create unique index if not exists waitlist_entries_whatsapp_unique
  on public.waitlist_entries (whatsapp)
  where whatsapp is not null;
