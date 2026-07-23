-- Harden the deployed application integration without changing application behavior.
-- This migration follows the canonical persistence and Storage migrations.

create schema if not exists arth_private;
revoke all on schema arth_private from public, anon;
grant usage on schema arth_private to authenticated;

-- Keep the SECURITY DEFINER manager lookup available to RLS policies without
-- exposing it through the public Data API schema.
revoke all on function public.arth_persistence_is_manager_of(text, text)
from public, anon, authenticated;
alter function public.arth_persistence_is_manager_of(text, text)
set schema arth_private;
revoke all on function arth_private.arth_persistence_is_manager_of(text, text)
from public, anon;
grant execute on function arth_private.arth_persistence_is_manager_of(text, text)
to authenticated;

-- SQL and trigger functions resolve only explicitly qualified application
-- objects. pg_catalog remains implicitly available with an empty search path.
alter function public.arth_persistence_role() set search_path = '';
alter function public.arth_persistence_tenant_id() set search_path = '';
alter function public.arth_persistence_emp_id() set search_path = '';
alter function public.arth_persistence_is_ops() set search_path = '';
alter function public.arth_persistence_is_tenant_admin() set search_path = '';
alter function public.arth_persistence_tenant_allowed(text) set search_path = '';
alter function public.arth_validate_notification_receipt_update() set search_path = '';
alter function public.arth_set_persistence_updated_at() set search_path = '';

-- This Supabase project hook runs as an event trigger and is not a client RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Cover auth.users foreign keys used during account deletion and audit queries.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'hrms_tenant_state', 'hrms_employees', 'hrms_attendance', 'hrms_leave_requests',
        'hrms_payroll_records', 'hrms_departments', 'hrms_designations', 'hrms_recruitment_records',
        'hrms_training_records', 'hrms_performance_records', 'hrms_documents', 'hrms_assets',
        'hrms_expense_claims', 'hrms_helpdesk_tickets', 'hrms_employee_lifecycle_records',
        'hrms_schedule_records', 'hrms_workflow_records', 'hrms_notifications', 'hrms_reports',
        'hrms_identity_records', 'hrms_audit_records', 'hrms_import_records',
        'hrms_governance_records', 'hrms_settings'
    ] loop
        execute format(
            'create index if not exists %I on public.%I (updated_by)',
            table_name || '_updated_by_idx',
            table_name
        );
    end loop;
end
$$;

-- Mirror browser validation limits at the Storage boundary.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'employee-docs';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'expense-attachments';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'text/csv', 'application/json']
where id = 'payroll-exports';

update storage.buckets
set file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'profile-photos';
