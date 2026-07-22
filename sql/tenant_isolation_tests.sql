-- tenant_isolation_tests.sql
-- ARTHHRMS - Multi-Tenant Isolation Validation Probes
--
-- SAFE VALIDATION TESTS ONLY.
-- Run in staging or a disposable validation branch with authenticated test users.
-- These probes are read-only catalog and visibility checks.
-- Do not run with privileged bypass credentials.
-- Do not disable RLS.
-- Do not mutate tenant or production data.

-- ---------------------------------------------------------------------------
-- 1. Critical tenant-owned tables must exist with RLS enabled.
-- ---------------------------------------------------------------------------
with critical_tables(table_name, validation_area) as (
  values
    ('employees', 'employee isolation'),
    ('users', 'role visibility'),
    ('auth_invitations', 'invite isolation'),
    ('pending_actions', 'workflow isolation'),
    ('workflow_events', 'workflow isolation'),
    ('audit_logs', 'workflow isolation'),
    ('strategic_deliverables', 'strategic governance isolation'),
    ('deliverable_reviews', 'strategic governance isolation'),
    ('escalations', 'escalation isolation'),
    ('payroll_records', 'salary/payroll restriction'),
    ('payslips', 'salary/payroll restriction'),
    ('leave_balances', 'leave visibility restriction')
)
select
  c.validation_area,
  c.table_name,
  case when pc.oid is null then 'MISSING_TABLE'
       when pc.relrowsecurity is true then 'RLS_ENABLED'
       else 'RLS_DISABLED'
  end as rls_status,
  case when pc.oid is null then 'WARNING'
       when pc.relrowsecurity is true then 'PASS'
       else 'CRITICAL_BLOCKER'
  end as severity
from critical_tables c
left join pg_class pc
  on pc.relname = c.table_name
left join pg_namespace pn
  on pn.oid = pc.relnamespace
where pc.oid is null
   or pn.nspname = 'public'
order by c.validation_area, c.table_name;

-- ---------------------------------------------------------------------------
-- 2. Tenant-owned tables should have tenant-scoped policies.
--    Review any table with no policy mentioning tenant or company identifiers.
-- ---------------------------------------------------------------------------
with critical_tables(table_name) as (
  values
    ('employees'),
    ('auth_invitations'),
    ('pending_actions'),
    ('workflow_events'),
    ('audit_logs'),
    ('strategic_deliverables'),
    ('deliverable_reviews'),
    ('escalations')
),
policy_summary as (
  select
    p.tablename,
    count(*) as policy_count,
    bool_or(
      coalesce(p.qual, '') ~* '(tenant_id|tenant_slug|company_id|organization_id|org_id)'
      or coalesce(p.with_check, '') ~* '(tenant_id|tenant_slug|company_id|organization_id|org_id)'
    ) as has_tenant_scope
  from pg_policies p
  where p.schemaname = 'public'
  group by p.tablename
)
select
  c.table_name,
  coalesce(ps.policy_count, 0) as policy_count,
  coalesce(ps.has_tenant_scope, false) as has_tenant_scope,
  case
    when coalesce(ps.policy_count, 0) = 0 then 'CRITICAL_BLOCKER'
    when coalesce(ps.has_tenant_scope, false) is false then 'HIGH'
    else 'PASS'
  end as severity
from critical_tables c
left join policy_summary ps
  on ps.tablename = c.table_name
order by c.table_name;

-- ---------------------------------------------------------------------------
-- 3. Broad anonymous or unrestricted policies should be treated as blockers.
-- ---------------------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check,
  case
    when 'anon' = any(roles) then 'HIGH'
    when coalesce(qual, '') in ('true', '(true)') then 'HIGH'
    when coalesce(with_check, '') in ('true', '(true)') then 'HIGH'
    else 'REVIEW'
  end as severity
from pg_policies
where schemaname = 'public'
  and (
    'anon' = any(roles)
    or coalesce(qual, '') in ('true', '(true)')
    or coalesce(with_check, '') in ('true', '(true)')
  )
order by tablename, policyname;

-- ---------------------------------------------------------------------------
-- 4. Test-user visibility probes.
--    Run these as Tenant A authenticated test users after replacing the
--    placeholders in a staging SQL client. Every cross-tenant count must be 0.
-- ---------------------------------------------------------------------------
-- EMPLOYEE isolation:
-- select count(*) as cross_tenant_employee_rows
-- from public.employees
-- where tenant_slug = '<tenant_b_slug>';

-- MANAGER isolation:
-- select count(*) as cross_tenant_manager_rows
-- from public.employees
-- where tenant_slug = '<tenant_b_slug>'
--   and reporting_manager_id <> auth.uid()::text;

-- WORKFLOW isolation:
-- select count(*) as cross_tenant_workflow_events
-- from public.workflow_events
-- where tenant_slug = '<tenant_b_slug>';

-- ONBOARDING and invite isolation:
-- select count(*) as cross_tenant_invites
-- from public.auth_invitations
-- where tenant_slug = '<tenant_b_slug>';

-- STRATEGIC governance isolation:
-- select count(*) as cross_tenant_strategic_deliverables
-- from public.strategic_deliverables
-- where tenant_slug = '<tenant_b_slug>';

-- ESCALATION isolation:
-- select count(*) as cross_tenant_escalations
-- from public.escalations
-- where tenant_slug = '<tenant_b_slug>';

-- SUPER_ADMIN HR-sensitive restriction:
-- Run as tenant SUPER_ADMIN without HR visibility. These should either fail
-- permission checks or return no sensitive columns through governed views.
-- select * from public.payroll_records limit 1;
-- select * from public.leave_balances limit 1;
