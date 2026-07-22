/*
  ARTHHRMS — Staging RLS Security Policy Tests

  PURPOSE:
  Safe staging-only inspection queries for Supabase Row-Level Security policy
  coverage, tenant isolation readiness, role visibility readiness, payroll
  protection, and unauthorized update risk detection.

  SAFETY:
  - Run in staging or pilot validation environments only.
  - This file inspects metadata and performs read-only visibility probes.
  - It does not alter policies, table definitions, auth settings, or data.
  - It must not be executed as a privileged bypass path from frontend code.
*/

-- 1. Critical table RLS coverage.
with critical_tables(table_name) as (
  values
    ('employees'),
    ('attendance'),
    ('leave_requests'),
    ('expense_claims'),
    ('salary_structures'),
    ('payroll_cycles'),
    ('payroll_records'),
    ('payslips'),
    ('notifications'),
    ('pending_actions'),
    ('workflow_events'),
    ('audit_logs')
)
select
  ct.table_name,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as force_rls_enabled
from critical_tables ct
left join pg_class c
  on c.relname = ct.table_name
left join pg_namespace n
  on n.oid = c.relnamespace
  and n.nspname = 'public'
order by ct.table_name;

-- 2. Critical table policy count.
with critical_tables(table_name) as (
  values
    ('employees'),
    ('attendance'),
    ('leave_requests'),
    ('expense_claims'),
    ('salary_structures'),
    ('payroll_cycles'),
    ('payroll_records'),
    ('payslips'),
    ('notifications'),
    ('pending_actions'),
    ('workflow_events'),
    ('audit_logs')
)
select
  ct.table_name,
  count(p.policyname) as policy_count
from critical_tables ct
left join pg_policies p
  on p.schemaname = 'public'
  and p.tablename = ct.table_name
group by ct.table_name
order by ct.table_name;

-- 3. Anonymous or broad SELECT policy detection.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'employees',
    'attendance',
    'leave_requests',
    'expense_claims',
    'salary_structures',
    'payroll_cycles',
    'payroll_records',
    'payslips',
    'notifications',
    'pending_actions',
    'workflow_events',
    'audit_logs'
  )
  and lower(cmd) in ('select', 'all')
  and (
    roles::text ilike '%anon%'
    or roles::text ilike '%public%'
    or lower(coalesce(qual, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
  )
order by tablename, policyname;

-- 4. Unauthorized update policy risk detection by policy inspection only.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'employees',
    'attendance',
    'leave_requests',
    'expense_claims',
    'salary_structures',
    'payroll_cycles',
    'payroll_records',
    'payslips',
    'notifications',
    'pending_actions',
    'workflow_events',
    'audit_logs'
  )
  and lower(cmd) in ('update', 'all')
  and (
    lower(coalesce(qual, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
    or lower(coalesce(with_check, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
  )
order by tablename, policyname;

-- 5. Tenant marker readiness inspection.
with critical_tables(table_name) as (
  values
    ('employees'),
    ('attendance'),
    ('leave_requests'),
    ('expense_claims'),
    ('payroll_records'),
    ('payslips'),
    ('notifications'),
    ('pending_actions'),
    ('workflow_events'),
    ('audit_logs')
)
select
  ct.table_name,
  bool_or(c.column_name in ('tenant_id', 'company_id', 'organization_id', 'org_id')) as has_tenant_marker,
  string_agg(c.column_name, ', ' order by c.ordinal_position) as columns_seen
from critical_tables ct
left join information_schema.columns c
  on c.table_schema = 'public'
  and c.table_name = ct.table_name
group by ct.table_name
order by ct.table_name;

-- 6. Helper function readiness inspection.
select
  p.proname as helper_function,
  n.nspname as schema_name
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'arth_current_role',
    'arth_current_emp_id',
    'arth_jwt_emp_id',
    'arth_is_manager_of',
    'arth_is_ops_role',
    'arth_is_super_admin',
    'arth_is_platform_owner'
  )
order by p.proname;

-- 7. Staging visibility probe template: employee role.
-- Replace JWT values with dedicated staging identities before use.
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'employee', 'empId', 'STAGING_EMPLOYEE_001'),
    'user_metadata', json_build_object('empId', 'STAGING_EMPLOYEE_001')
  )::text,
  true
);
select 'employee_profile_visible_count' as check_name, count(*) as visible_rows
from public.employees
where emp_id = 'STAGING_EMPLOYEE_001';
select 'employee_payroll_visible_count' as check_name, count(*) as visible_rows
from public.payroll_records
where emp_id = 'STAGING_EMPLOYEE_001';
rollback;

-- 8. Staging visibility probe template: manager role.
-- Replace JWT values with dedicated staging identities before use.
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'manager', 'empId', 'STAGING_MANAGER_001'),
    'user_metadata', json_build_object('empId', 'STAGING_MANAGER_001')
  )::text,
  true
);
select 'manager_team_visible_count' as check_name, count(*) as visible_rows
from public.employees
where manager_id = 'STAGING_MANAGER_001';
select 'manager_cross_team_probe_count' as check_name, count(*) as visible_rows
from public.employees
where manager_id <> 'STAGING_MANAGER_001';
rollback;

-- 9. Staging visibility probe template: HR role.
-- Replace JWT values with dedicated staging identities before use.
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'hr', 'empId', 'STAGING_HR_001'),
    'user_metadata', json_build_object('empId', 'STAGING_HR_001')
  )::text,
  true
);
select 'hr_employee_visibility_count' as check_name, count(*) as visible_rows
from public.employees;
select 'hr_pending_actions_visibility_count' as check_name, count(*) as visible_rows
from public.pending_actions;
rollback;

-- 10. Staging visibility probe template: super admin role.
-- Replace JWT values with dedicated staging identities before use.
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'super_admin', 'empId', 'STAGING_SUPER_ADMIN_001'),
    'user_metadata', json_build_object('empId', 'STAGING_SUPER_ADMIN_001')
  )::text,
  true
);
select 'super_admin_employee_visibility_count' as check_name, count(*) as visible_rows
from public.employees;
select 'super_admin_audit_visibility_count' as check_name, count(*) as visible_rows
from public.audit_logs;
rollback;
