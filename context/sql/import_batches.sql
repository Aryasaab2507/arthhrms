-- ARTHHRMS import batch foundation for Supabase.
-- Shared batch ledger for staged imports before live table commit.
-- Apply before staging_employees.sql, staging_attendance.sql, and staging_payroll.sql.

create table if not exists public.import_batches (
    id uuid primary key default gen_random_uuid(),
    import_batch_id text not null unique,
    import_type text not null check (import_type in ('employees', 'attendance', 'payroll', 'leave')),
    file_name text,
    uploaded_by text,
    uploaded_role text,
    uploaded_at timestamptz not null default now(),
    total_rows integer not null default 0 check (total_rows >= 0),
    passed_rows integer not null default 0 check (passed_rows >= 0),
    warning_rows integer not null default 0 check (warning_rows >= 0),
    failed_rows integer not null default 0 check (failed_rows >= 0),
    committed_rows integer not null default 0 check (committed_rows >= 0),
    skipped_rows integer not null default 0 check (skipped_rows >= 0),
    status text not null default 'Staged'
        check (status in ('Staged', 'Validated', 'Commit Blocked', 'Committed', 'Cancelled', 'Rolled Back')),
    backend text not null default 'local' check (backend in ('local', 'supabase')),
    rollback_eligible boolean not null default true,
    validation_summary jsonb not null default '{}'::jsonb,
    commit_summary jsonb not null default '{}'::jsonb,
    rollback_summary jsonb not null default '{}'::jsonb,
    committed_by text,
    committed_at timestamptz,
    cancelled_by text,
    cancelled_at timestamptz,
    rolled_back_by text,
    rolled_back_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists import_batches_import_batch_id_idx on public.import_batches (import_batch_id);
create index if not exists import_batches_type_status_idx on public.import_batches (import_type, status);
create index if not exists import_batches_uploaded_at_idx on public.import_batches (uploaded_at desc);

alter table public.import_batches enable row level security;

drop policy if exists "import_batches_manage_hr_ops" on public.import_batches;
create policy "import_batches_manage_hr_ops"
on public.import_batches
for all
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin'));

drop trigger if exists import_batches_set_updated_at on public.import_batches;
create trigger import_batches_set_updated_at
before update on public.import_batches
for each row
execute function public.set_updated_at();

