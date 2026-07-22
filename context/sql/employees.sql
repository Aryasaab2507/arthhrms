-- ARTHHRMS employees table foundation for Supabase.
-- Apply only after confirming project Auth and role mapping strategy.

create table if not exists public.employees (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    emp_id text not null unique,
    employee_code text,
    legacy_emp_id text,
    full_name text not null,
    department text not null default 'General',
    designation text not null default 'Employee',
    official_designation text,
    manager_id text references public.employees(emp_id) on update cascade on delete set null,
    branch text not null default 'Head Office',
    location text not null default 'Head Office',
    shift_id text,
    email text unique,
    phone text,
    mobile text,
    date_of_joining date,
    date_of_birth date,
    salary numeric(12,2) not null default 0 check (salary >= 0),
    leave_balance numeric(6,2) not null default 0 check (leave_balance >= 0),
    employment_status text not null default 'Active',
    accountability_tier text not null default 'Standard Accountability Resource',
    address text,
    photo_url text,
    source text not null default 'manual',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists employees_emp_id_idx on public.employees (emp_id);
create unique index if not exists employees_auth_user_id_idx on public.employees (auth_user_id) where auth_user_id is not null;
create index if not exists employees_department_idx on public.employees (department);
create index if not exists employees_manager_id_idx on public.employees (manager_id);
create index if not exists employees_status_idx on public.employees (employment_status);
create index if not exists employees_email_idx on public.employees (lower(email));

alter table public.employees enable row level security;

-- Conservative starter policies.
-- Replace the app_metadata role checks once final auth role mapping is implemented.
drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'platform_owner')
    or auth_user_id = (select auth.uid())
    or emp_id = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'empId', (select auth.jwt()) -> 'app_metadata' ->> 'emp_id', '')
    or manager_id = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'empId', (select auth.jwt()) -> 'app_metadata' ->> 'emp_id', '')
);

drop policy if exists "employees_insert_hr_owner" on public.employees;
create policy "employees_insert_hr_owner"
on public.employees
for insert
to authenticated
with check (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'platform_owner')
);

drop policy if exists "employees_update_hr_owner" on public.employees;
create policy "employees_update_hr_owner"
on public.employees
for update
to authenticated
using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'platform_owner')
)
with check (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'platform_owner')
);

-- updated_at helper. Keep in public only if project policy allows exposed helper functions.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row
execute function public.set_updated_at();
