-- ARTHHRMS attendance table foundation for Supabase.
-- Apply after public.employees exists and employee emp_id values are normalized.

create table if not exists public.attendance (
    id uuid primary key default gen_random_uuid(),
    attendance_id text not null unique,
    emp_id text not null references public.employees(emp_id) on update cascade on delete restrict,
    attendance_date date not null,
    shift_id text,
    check_in time,
    check_out time,
    working_hours interval,
    working_hours_text text,
    late_minutes integer not null default 0 check (late_minutes >= 0),
    status text not null default 'Absent'
        check (status in ('Present', 'Late', 'Absent', 'Leave', 'Half Day')),
    regularization_status text not null default 'None'
        check (regularization_status in ('None', 'Pending', 'Approved', 'Rejected')),
    remarks text,
    source text not null default 'manual',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint attendance_emp_day_unique unique (emp_id, attendance_date)
);

create unique index if not exists attendance_attendance_id_idx on public.attendance (attendance_id);
create index if not exists attendance_emp_id_idx on public.attendance (emp_id);
create index if not exists attendance_date_idx on public.attendance (attendance_date);
create index if not exists attendance_emp_date_idx on public.attendance (emp_id, attendance_date);
create index if not exists attendance_status_idx on public.attendance (status);
create index if not exists attendance_regularization_status_idx on public.attendance (regularization_status);

alter table public.attendance enable row level security;

-- Conservative starter policies.
-- Final production policies should be reviewed with the final app_metadata role/empId model.
drop policy if exists "attendance_select_authenticated" on public.attendance;
create policy "attendance_select_authenticated"
on public.attendance
for select
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
);

drop policy if exists "attendance_insert_employee_ops" on public.attendance;
create policy "attendance_insert_employee_ops"
on public.attendance
for insert
to authenticated
with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
);

drop policy if exists "attendance_update_employee_ops" on public.attendance;
create policy "attendance_update_employee_ops"
on public.attendance
for update
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
)
with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
);

drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at
before update on public.attendance
for each row
execute function public.set_updated_at();
