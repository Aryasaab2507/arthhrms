-- ARTHHRMS production RLS hardening layer.
-- Apply after employees.sql, attendance.sql, leaveRequests.sql, expenseClaims.sql, and payroll.sql.
-- Authorization data must live in auth.users.raw_app_meta_data / JWT app_metadata, not user_metadata.

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------

create or replace function public.arth_current_role()
returns text
language sql
stable
as $$
    select replace(lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')), '-', '_')
$$;

create or replace function public.arth_jwt_emp_id()
returns text
language sql
stable
as $$
    select coalesce(
        (select auth.jwt()) -> 'app_metadata' ->> 'empId',
        (select auth.jwt()) -> 'app_metadata' ->> 'emp_id',
        ''
    )
$$;

create or replace function public.arth_current_emp_id()
returns text
language sql
stable
as $$
    select coalesce(
        nullif(public.arth_jwt_emp_id(), ''),
        (
            select e.emp_id
            from public.employees e
            where e.auth_user_id = (select auth.uid())
            limit 1
        ),
        ''
    )
$$;

create or replace function public.arth_is_ops_role()
returns boolean
language sql
stable
as $$
    select public.arth_current_role() in ('hr', 'admin', 'super_admin', 'platform_owner')
$$;

create or replace function public.arth_is_platform_owner()
returns boolean
language sql
stable
as $$
    select public.arth_current_role() = 'platform_owner'
$$;

create or replace function public.arth_is_super_admin()
returns boolean
language sql
stable
as $$
    select public.arth_current_role() in ('super_admin', 'platform_owner')
$$;

create or replace function public.arth_is_self_employee(target_emp_id text)
returns boolean
language sql
stable
as $$
    select target_emp_id = public.arth_current_emp_id()
$$;

create or replace function public.arth_is_manager_of(target_emp_id text)
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.employees e
        where e.emp_id = target_emp_id
          and e.manager_id = public.arth_current_emp_id()
    )
$$;

-- ---------------------------------------------------------------------------
-- Employee auth mapping
-- ---------------------------------------------------------------------------

alter table if exists public.employees
    add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create unique index if not exists employees_auth_user_id_idx
    on public.employees (auth_user_id)
    where auth_user_id is not null;

alter table if exists public.employees enable row level security;

drop policy if exists "employees_select_authenticated" on public.employees;
drop policy if exists "employees_insert_hr_owner" on public.employees;
drop policy if exists "employees_update_hr_owner" on public.employees;
drop policy if exists "employees_select_role_scoped" on public.employees;
drop policy if exists "employees_insert_ops_only" on public.employees;
drop policy if exists "employees_update_ops_only" on public.employees;
drop policy if exists "employees_delete_super_admin_only" on public.employees;

create policy "employees_select_role_scoped"
on public.employees
for select
to authenticated
using (
    public.arth_is_ops_role()
    or auth_user_id = (select auth.uid())
    or emp_id = public.arth_jwt_emp_id()
    or manager_id = public.arth_jwt_emp_id()
);

create policy "employees_insert_ops_only"
on public.employees
for insert
to authenticated
with check (public.arth_is_ops_role());

create policy "employees_update_ops_only"
on public.employees
for update
to authenticated
using (public.arth_is_ops_role())
with check (public.arth_is_ops_role());

create policy "employees_delete_super_admin_only"
on public.employees
for delete
to authenticated
using (public.arth_is_super_admin());

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

alter table if exists public.attendance enable row level security;

drop policy if exists "attendance_select_authenticated" on public.attendance;
drop policy if exists "attendance_insert_employee_ops" on public.attendance;
drop policy if exists "attendance_update_employee_ops" on public.attendance;
drop policy if exists "attendance_select_role_scoped" on public.attendance;
drop policy if exists "attendance_insert_self_or_ops" on public.attendance;
drop policy if exists "attendance_update_self_or_ops" on public.attendance;
drop policy if exists "attendance_delete_super_admin_only" on public.attendance;

create policy "attendance_select_role_scoped"
on public.attendance
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
    or public.arth_is_manager_of(emp_id)
);

create policy "attendance_insert_self_or_ops"
on public.attendance
for insert
to authenticated
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
);

create policy "attendance_update_self_or_ops"
on public.attendance
for update
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
)
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
);

create policy "attendance_delete_super_admin_only"
on public.attendance
for delete
to authenticated
using (public.arth_is_super_admin());

-- ---------------------------------------------------------------------------
-- Leave requests
-- ---------------------------------------------------------------------------

alter table if exists public.leave_requests enable row level security;

drop policy if exists "leave_requests_select_authenticated" on public.leave_requests;
drop policy if exists "leave_requests_insert_employee_ops" on public.leave_requests;
drop policy if exists "leave_requests_update_manager_hr" on public.leave_requests;
drop policy if exists "leave_requests_select_role_scoped" on public.leave_requests;
drop policy if exists "leave_requests_insert_self_or_ops" on public.leave_requests;
drop policy if exists "leave_requests_update_workflow_scoped" on public.leave_requests;
drop policy if exists "leave_requests_delete_super_admin_only" on public.leave_requests;

create policy "leave_requests_select_role_scoped"
on public.leave_requests
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
    or public.arth_is_manager_of(emp_id)
);

create policy "leave_requests_insert_self_or_ops"
on public.leave_requests
for insert
to authenticated
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
);

create policy "leave_requests_update_workflow_scoped"
on public.leave_requests
for update
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_manager_of(emp_id)
    or (
        public.arth_is_self_employee(emp_id)
        and manager_status = 'Pending'
        and hr_status = 'Pending'
        and final_status = 'Pending'
    )
)
with check (
    public.arth_is_ops_role()
    or public.arth_is_manager_of(emp_id)
    or (
        public.arth_is_self_employee(emp_id)
        and manager_status = 'Pending'
        and hr_status = 'Pending'
        and final_status = 'Pending'
    )
);

create policy "leave_requests_delete_super_admin_only"
on public.leave_requests
for delete
to authenticated
using (public.arth_is_super_admin());

-- ---------------------------------------------------------------------------
-- Expense claims
-- ---------------------------------------------------------------------------

alter table if exists public.expense_claims enable row level security;

drop policy if exists "expense_claims_select_authenticated" on public.expense_claims;
drop policy if exists "expense_claims_insert_employee_ops" on public.expense_claims;
drop policy if exists "expense_claims_update_manager_finance" on public.expense_claims;
drop policy if exists "expense_claims_select_role_scoped" on public.expense_claims;
drop policy if exists "expense_claims_insert_self_or_ops" on public.expense_claims;
drop policy if exists "expense_claims_update_workflow_scoped" on public.expense_claims;
drop policy if exists "expense_claims_delete_super_admin_only" on public.expense_claims;

create policy "expense_claims_select_role_scoped"
on public.expense_claims
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
    or public.arth_is_manager_of(emp_id)
);

create policy "expense_claims_insert_self_or_ops"
on public.expense_claims
for insert
to authenticated
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
);

create policy "expense_claims_update_workflow_scoped"
on public.expense_claims
for update
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_manager_of(emp_id)
    or (
        public.arth_is_self_employee(emp_id)
        and manager_status = 'Pending'
        and final_status in ('Pending', 'Pending Manager Approval')
    )
)
with check (
    public.arth_is_ops_role()
    or public.arth_is_manager_of(emp_id)
    or (
        public.arth_is_self_employee(emp_id)
        and manager_status = 'Pending'
        and final_status in ('Pending', 'Pending Manager Approval')
    )
);

create policy "expense_claims_delete_super_admin_only"
on public.expense_claims
for delete
to authenticated
using (public.arth_is_super_admin());

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------

alter table if exists public.salary_structures enable row level security;
alter table if exists public.payroll_cycles enable row level security;
alter table if exists public.payroll_records enable row level security;
alter table if exists public.payslips enable row level security;

drop policy if exists "salary_structures_select_authenticated" on public.salary_structures;
drop policy if exists "salary_structures_manage_payroll_roles" on public.salary_structures;
drop policy if exists "payroll_cycles_select_authenticated" on public.payroll_cycles;
drop policy if exists "payroll_cycles_manage_payroll_roles" on public.payroll_cycles;
drop policy if exists "payroll_records_select_authenticated" on public.payroll_records;
drop policy if exists "payroll_records_manage_payroll_roles" on public.payroll_records;
drop policy if exists "payslips_select_authenticated" on public.payslips;
drop policy if exists "payslips_manage_payroll_roles" on public.payslips;

drop policy if exists "salary_structures_select_ops_only" on public.salary_structures;
drop policy if exists "salary_structures_manage_ops_only" on public.salary_structures;
drop policy if exists "payroll_cycles_select_ops_only" on public.payroll_cycles;
drop policy if exists "payroll_cycles_manage_ops_only" on public.payroll_cycles;
drop policy if exists "payroll_records_select_role_scoped" on public.payroll_records;
drop policy if exists "payroll_records_manage_ops_only" on public.payroll_records;
drop policy if exists "payslips_select_role_scoped" on public.payslips;
drop policy if exists "payslips_manage_ops_only" on public.payslips;

create policy "salary_structures_select_ops_only"
on public.salary_structures
for select
to authenticated
using (public.arth_is_ops_role());

create policy "salary_structures_manage_ops_only"
on public.salary_structures
for all
to authenticated
using (public.arth_is_ops_role())
with check (public.arth_is_ops_role());

create policy "payroll_cycles_select_ops_only"
on public.payroll_cycles
for select
to authenticated
using (public.arth_is_ops_role());

create policy "payroll_cycles_manage_ops_only"
on public.payroll_cycles
for all
to authenticated
using (public.arth_is_ops_role())
with check (public.arth_is_ops_role());

create policy "payroll_records_select_role_scoped"
on public.payroll_records
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
);

create policy "payroll_records_manage_ops_only"
on public.payroll_records
for all
to authenticated
using (public.arth_is_ops_role())
with check (public.arth_is_ops_role());

create policy "payslips_select_role_scoped"
on public.payslips
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(emp_id)
);

create policy "payslips_manage_ops_only"
on public.payslips
for all
to authenticated
using (public.arth_is_ops_role())
with check (public.arth_is_ops_role());

-- ---------------------------------------------------------------------------
-- Data API readiness. RLS remains the row-level gate.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on
    public.employees,
    public.attendance,
    public.leave_requests,
    public.expense_claims,
    public.salary_structures,
    public.payroll_cycles,
    public.payroll_records,
    public.payslips
to authenticated;
