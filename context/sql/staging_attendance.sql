-- ARTHHRMS attendance import staging table for Supabase.
-- Temporary holding area before validated rows commit to public.attendance.

create table if not exists public.staging_attendance (
    id uuid primary key default gen_random_uuid(),
    staging_id text not null unique,
    import_batch_id text not null references public.import_batches(import_batch_id) on update cascade on delete cascade,
    row_number integer not null,
    raw_row_data jsonb not null default '{}'::jsonb,
    validation_status text not null default 'PENDING' check (validation_status in ('PENDING', 'SUCCESS', 'WARNING', 'FAILED', 'COMMITTED', 'ROLLED_BACK')),
    validation_errors jsonb not null default '[]'::jsonb,
    validation_warnings jsonb not null default '[]'::jsonb,
    normalized_data jsonb not null default '{}'::jsonb,
    uploaded_by text,
    uploaded_at timestamptz not null default now(),
    committed boolean not null default false,
    committed_at timestamptz,
    live_record_id text,
    rollback_metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists staging_attendance_staging_id_idx on public.staging_attendance (staging_id);
create index if not exists staging_attendance_batch_idx on public.staging_attendance (import_batch_id);
create index if not exists staging_attendance_status_idx on public.staging_attendance (validation_status);
create index if not exists staging_attendance_live_record_idx on public.staging_attendance (live_record_id);

alter table public.staging_attendance enable row level security;

drop policy if exists "staging_attendance_manage_hr_ops" on public.staging_attendance;
create policy "staging_attendance_manage_hr_ops"
on public.staging_attendance
for all
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin'));

drop trigger if exists staging_attendance_set_updated_at on public.staging_attendance;
create trigger staging_attendance_set_updated_at
before update on public.staging_attendance
for each row
execute function public.set_updated_at();

