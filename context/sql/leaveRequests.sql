-- ARTHHRMS leave requests table foundation for Supabase.
-- Apply after public.employees exists and employee emp_id values are normalized.

create table if not exists public.leave_requests (
    id uuid primary key default gen_random_uuid(),
    leave_id text not null unique,
    emp_id text not null references public.employees(emp_id) on update cascade on delete restrict,
    leave_type text not null,
    from_date date not null,
    to_date date not null,
    total_days numeric(7,2) not null check (total_days > 0),
    reason text not null check (length(trim(reason)) > 0),
    manager_status text not null default 'Pending'
        check (manager_status in ('Pending', 'Approved', 'Rejected', 'Not Required')),
    hr_status text not null default 'Pending'
        check (hr_status in ('Pending', 'Approved', 'Rejected', 'Not Required')),
    final_status text not null default 'Pending'
        check (final_status in ('Pending', 'Manager Approved', 'Approved', 'Rejected', 'Cancelled')),
    status text not null default 'Pending'
        check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    applied_at timestamptz not null default now(),
    reviewed_at timestamptz,
    remarks text,
    hr_message text,
    document_url text,
    balance_deducted boolean not null default false,
    source text not null default 'manual',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint leave_requests_date_order check (to_date >= from_date)
);

create unique index if not exists leave_requests_leave_id_idx on public.leave_requests (leave_id);
create index if not exists leave_requests_emp_id_idx on public.leave_requests (emp_id);
create index if not exists leave_requests_from_date_idx on public.leave_requests (from_date);
create index if not exists leave_requests_to_date_idx on public.leave_requests (to_date);
create index if not exists leave_requests_status_idx on public.leave_requests (status);
create index if not exists leave_requests_manager_status_idx on public.leave_requests (manager_status);
create index if not exists leave_requests_hr_status_idx on public.leave_requests (hr_status);
create index if not exists leave_requests_final_status_idx on public.leave_requests (final_status);

alter table public.leave_requests enable row level security;

-- Conservative starter policies.
-- Final production policies should be reviewed with the final app_metadata role/empId model.
drop policy if exists "leave_requests_select_authenticated" on public.leave_requests;
create policy "leave_requests_select_authenticated"
on public.leave_requests
for select
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    or exists (
        select 1 from public.employees e
        where e.emp_id = leave_requests.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
);

drop policy if exists "leave_requests_insert_employee_ops" on public.leave_requests;
create policy "leave_requests_insert_employee_ops"
on public.leave_requests
for insert
to authenticated
with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
);

drop policy if exists "leave_requests_update_manager_hr" on public.leave_requests;
create policy "leave_requests_update_manager_hr"
on public.leave_requests
for update
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or exists (
        select 1 from public.employees e
        where e.emp_id = leave_requests.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
)
with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or exists (
        select 1 from public.employees e
        where e.emp_id = leave_requests.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
);

drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at
before update on public.leave_requests
for each row
execute function public.set_updated_at();
