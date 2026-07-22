/*
  ARTHHRMS — Supabase Staging Validation Tests

  PURPOSE:
  Safe staging-only inspection queries for real deployment readiness evidence.
  These queries support tenant isolation, role visibility, salary and leave
  restrictions, onboarding isolation, invite isolation, and policy coverage.

  SAFETY:
  - Run in STAGING or controlled PILOT validation environments only.
  - Use dedicated authenticated staging users for each role.
  - Never run these probes with service-role credentials.
  - This file does not disable RLS, bypass auth, alter policies, or mutate data.
  - Production data must not be targeted by these validation probes.
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
    ('audit_logs'),
    ('auth_invites'),
    ('onboarding_batches')
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

-- 2. Dangerous broad or anonymous policy detection.
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
    'audit_logs',
    'auth_invites',
    'onboarding_batches'
  )
  and (
    roles::text ilike '%anon%'
    or roles::text ilike '%public%'
    or lower(coalesce(qual, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
    or lower(coalesce(with_check, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
  )
order by tablename, policyname;

-- 3. Tenant marker coverage for isolation-critical tables.
with isolation_tables(table_name) as (
  values
    ('employees'),
    ('attendance'),
    ('leave_requests'),
    ('payroll_records'),
    ('payslips'),
    ('pending_actions'),
    ('audit_logs'),
    ('auth_invites'),
    ('onboarding_batches')
)
select
  it.table_name,
  bool_or(c.column_name in ('tenant_id', 'tenantId', 'company_id', 'companyId', 'organization_id', 'org_id')) as has_tenant_marker,
  string_agg(c.column_name, ', ' order by c.ordinal_position) as columns_seen
from isolation_tables it
left join information_schema.columns c
  on c.table_schema = 'public'
  and c.table_name = it.table_name
group by it.table_name
order by it.table_name;

-- 4. Employee isolation probe template.
-- Replace placeholders with dedicated staging identities and execute as the employee session.
select
  'EMPLOYEE_OWN_VISIBILITY_ONLY' as validation_name,
  count(*) filter (where emp_id = 'STAGING_EMPLOYEE_001') as own_rows,
  count(*) filter (where emp_id <> 'STAGING_EMPLOYEE_001') as unexpected_rows
from public.employees;

-- 5. Manager isolation probe template.
-- Execute as STAGING_MANAGER_001; unexpected_rows must be 0.
select
  'MANAGER_TEAM_VISIBILITY_ONLY' as validation_name,
  count(*) filter (where reporting_manager_id = 'STAGING_MANAGER_001') as team_rows,
  count(*) filter (where reporting_manager_id <> 'STAGING_MANAGER_001') as unexpected_rows
from public.employees;

-- 6. HR visibility boundary probe template.
-- Execute as HR staging user; verify output against HR-scoped policy expectations.
select
  'HR_OPERATIONAL_VISIBILITY' as validation_name,
  count(*) as visible_employee_rows
from public.employees;

-- 7. SUPER_ADMIN sensitive HR data restriction probe template.
-- Execute as company SUPER_ADMIN; both counts must be 0 unless HR visibility is explicitly granted.
select
  'SUPER_ADMIN_SALARY_RESTRICTION' as validation_name,
  count(*) filter (where salary is not null) as visible_salary_rows
from public.employees;

select
  'SUPER_ADMIN_LEAVE_BALANCE_RESTRICTION' as validation_name,
  count(*) filter (where leave_balance is not null) as visible_leave_balance_rows
from public.employees;

-- 8. Payroll isolation probe template.
-- Execute as non-payroll employee/manager role; unexpected_rows must be 0.
select
  'PAYROLL_TENANT_ISOLATION' as validation_name,
  count(*) as unexpected_rows
from public.payroll_records
where tenant_id <> coalesce(nullif(auth.jwt() ->> 'tenant_id', ''), auth.jwt() -> 'app_metadata' ->> 'tenant_id');

-- 9. Invite isolation probe template.
-- Execute as tenant-scoped HR/manager; unexpected_rows must be 0.
select
  'INVITE_TENANT_ISOLATION' as validation_name,
  count(*) as unexpected_rows
from public.auth_invites
where tenant_id <> coalesce(nullif(auth.jwt() ->> 'tenant_id', ''), auth.jwt() -> 'app_metadata' ->> 'tenant_id');

-- 10. Onboarding isolation probe template.
-- Execute as tenant-scoped onboarding operator; unexpected_rows must be 0.
select
  'ONBOARDING_TENANT_ISOLATION' as validation_name,
  count(*) as unexpected_rows
from public.onboarding_batches
where tenant_id <> coalesce(nullif(auth.jwt() ->> 'tenant_id', ''), auth.jwt() -> 'app_metadata' ->> 'tenant_id');

-- 11. Unauthorized update policy risk by metadata inspection only.
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
  and lower(cmd) in ('update', 'all')
  and (
    lower(coalesce(qual, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
    or lower(coalesce(with_check, '')) in ('true', '(true)', '1=1', '(1 = 1)', '((true))')
  )
order by tablename, policyname;
