-- Read-only deployment gate for ArthHRMS authenticated business persistence.
-- Run after authenticated_business_persistence.sql in a Supabase branch or staging project.

do $$
declare
    expected_tables text[] := array[
        'hrms_tenant_state', 'hrms_employees', 'hrms_attendance', 'hrms_leave_requests',
        'hrms_payroll_records', 'hrms_departments', 'hrms_designations', 'hrms_recruitment_records',
        'hrms_training_records', 'hrms_performance_records', 'hrms_documents', 'hrms_assets',
        'hrms_expense_claims', 'hrms_helpdesk_tickets', 'hrms_employee_lifecycle_records',
        'hrms_schedule_records', 'hrms_workflow_records', 'hrms_notifications', 'hrms_reports',
        'hrms_identity_records', 'hrms_audit_records', 'hrms_import_records',
        'hrms_governance_records', 'hrms_settings'
    ];
    failed text[];
begin
    select array_agg(name order by name)
    into failed
    from unnest(expected_tables) as name
    where to_regclass('public.' || name) is null;
    if failed is not null then
        raise exception 'Missing persistence tables: %', array_to_string(failed, ', ');
    end if;

    select array_agg(c.relname order by c.relname)
    into failed
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(expected_tables)
      and not c.relrowsecurity;
    if failed is not null then
        raise exception 'RLS is disabled for: %', array_to_string(failed, ', ');
    end if;

    select array_agg(c.relname order by c.relname)
    into failed
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(expected_tables)
      and not c.relforcerowsecurity;
    if failed is not null then
        raise exception 'FORCE RLS is disabled for: %', array_to_string(failed, ', ');
    end if;

    select array_agg(distinct table_name order by table_name)
    into failed
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = any(expected_tables)
      and grantee = 'anon';
    if failed is not null then
        raise exception 'Anonymous table privileges remain for: %', array_to_string(failed, ', ');
    end if;

    select array_agg(name order by name)
    into failed
    from unnest(expected_tables) as name
    where name <> 'hrms_tenant_state'
      and not exists (
          select 1
          from pg_policies policy
          where policy.schemaname = 'public'
            and policy.tablename = name
            and policy.policyname = name || '_provenance'
            and policy.permissive = 'RESTRICTIVE'
      );
    if failed is not null then
        raise exception 'Restrictive provenance policies are missing for: %', array_to_string(failed, ', ');
    end if;

    if pg_get_functiondef('public.arth_persistence_tenant_id()'::regprocedure) ilike '%user_metadata%' then
        raise exception 'Tenant authorization must not use user-editable metadata.';
    end if;

    if pg_get_functiondef('public.arth_persistence_tenant_allowed(text)'::regprocedure) not ilike '%auth.uid()%'
       or pg_get_functiondef('public.arth_persistence_tenant_allowed(text)'::regprocedure) ilike '%platform_owner%' then
        raise exception 'Tenant authorization must require auth.uid() and exact tenant equality without a platform-owner wildcard.';
    end if;

    if pg_get_functiondef('public.arth_persistence_is_ops()'::regprocedure) ilike '%platform_owner%'
       or pg_get_functiondef('public.arth_persistence_is_ops()'::regprocedure) ilike '%super_admin%' then
        raise exception 'Platform and technical administrators must not receive HR operations access.';
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'hrms_leave_requests'
          and policyname = 'hrms_leave_requests_manager_update'
    ) then
        raise exception 'Manager approval update policy is missing.';
    end if;

    if has_function_privilege('anon', 'public.arth_persistence_tenant_allowed(text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.arth_persistence_is_manager_of(text,text)', 'EXECUTE') then
        raise exception 'Anonymous execution remains on authorization helpers.';
    end if;
end
$$;

select 'authenticated business persistence checks passed' as verification_result;
