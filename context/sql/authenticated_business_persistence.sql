-- ArthHRMS authenticated business persistence and tenant-isolation foundation.
-- Apply after Supabase Auth is configured. No table grants access to anon.

create or replace function public.arth_persistence_role()
returns text
language sql
stable
as $$
    select replace(lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')), '-', '_')
$$;

create or replace function public.arth_persistence_tenant_id()
returns text
language sql
stable
as $$
    select regexp_replace(
        regexp_replace(
            lower(trim(coalesce(
                (select auth.jwt()) -> 'app_metadata' ->> 'tenantSlug',
                (select auth.jwt()) -> 'app_metadata' ->> 'tenant_slug',
                (select auth.jwt()) -> 'app_metadata' ->> 'tenantId',
                (select auth.jwt()) -> 'app_metadata' ->> 'tenant_id',
                ''
            ))),
            '[^a-z0-9]+', '-', 'g'
        ),
        '(^-+|-+$)', '', 'g'
    )
$$;

create or replace function public.arth_persistence_emp_id()
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

create or replace function public.arth_persistence_is_ops()
returns boolean
language sql
stable
as $$
    select public.arth_persistence_role() in ('admin', 'hr', 'hr_head', 'director')
$$;

create or replace function public.arth_persistence_is_tenant_admin()
returns boolean
language sql
stable
as $$
    select public.arth_persistence_role() in ('super_admin', 'admin')
$$;

create or replace function public.arth_persistence_tenant_allowed(target_tenant text)
returns boolean
language sql
stable
as $$
    select (select auth.uid()) is not null
        and target_tenant <> ''
        and public.arth_persistence_tenant_id() <> ''
        and target_tenant = public.arth_persistence_tenant_id()
$$;

revoke all on function public.arth_persistence_role() from public, anon;
revoke all on function public.arth_persistence_tenant_id() from public, anon;
revoke all on function public.arth_persistence_emp_id() from public, anon;
revoke all on function public.arth_persistence_is_ops() from public, anon;
revoke all on function public.arth_persistence_is_tenant_admin() from public, anon;
revoke all on function public.arth_persistence_tenant_allowed(text) from public, anon;
grant execute on function public.arth_persistence_role() to authenticated;
grant execute on function public.arth_persistence_tenant_id() to authenticated;
grant execute on function public.arth_persistence_emp_id() to authenticated;
grant execute on function public.arth_persistence_is_ops() to authenticated;
grant execute on function public.arth_persistence_is_tenant_admin() to authenticated;
grant execute on function public.arth_persistence_tenant_allowed(text) to authenticated;

create table if not exists public.hrms_tenant_state (
    tenant_id text primary key,
    organization_id text not null,
    state jsonb not null default '{}'::jsonb,
    revision bigint not null default 0 check (revision >= 0),
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'hrms_employees',
        'hrms_attendance',
        'hrms_leave_requests',
        'hrms_payroll_records',
        'hrms_departments',
        'hrms_designations',
        'hrms_recruitment_records',
        'hrms_training_records',
        'hrms_performance_records',
        'hrms_documents',
        'hrms_assets',
        'hrms_expense_claims',
        'hrms_helpdesk_tickets',
        'hrms_employee_lifecycle_records',
        'hrms_schedule_records',
        'hrms_workflow_records',
        'hrms_notifications',
        'hrms_reports',
        'hrms_identity_records',
        'hrms_audit_records',
        'hrms_import_records',
        'hrms_governance_records',
        'hrms_settings'
    ] loop
        execute format(
            'create table if not exists public.%I (
                id uuid primary key default gen_random_uuid(),
                tenant_id text not null,
                organization_id text not null,
                record_type text not null,
                record_id text not null,
                subject_id text not null default '''',
                payload jsonb not null default ''{}''::jsonb,
                updated_by uuid not null references auth.users(id) on delete restrict,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                unique (tenant_id, record_type, record_id)
            )',
            table_name
        );
        execute format('create index if not exists %I on public.%I (tenant_id, record_type)', table_name || '_tenant_type_idx', table_name);
        execute format('create index if not exists %I on public.%I (tenant_id, subject_id)', table_name || '_tenant_subject_idx', table_name);
        execute format('alter table public.%I enable row level security', table_name);
        execute format('alter table public.%I force row level security', table_name);
        execute format('revoke all on public.%I from anon', table_name);
        execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    end loop;
end
$$;

create or replace function public.arth_persistence_is_manager_of(target_tenant text, target_subject text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
    select exists (
        select 1
        from public.hrms_employees employee
        where (select auth.uid()) is not null
          and public.arth_persistence_tenant_allowed(target_tenant)
          and public.arth_persistence_role() = 'manager'
          and employee.tenant_id = target_tenant
          and employee.subject_id = target_subject
          and coalesce(employee.payload ->> 'managerId', employee.payload ->> 'manager_id', '') = public.arth_persistence_emp_id()
    )
$$;

revoke all on function public.arth_persistence_is_manager_of(text, text) from public;
grant execute on function public.arth_persistence_is_manager_of(text, text) to authenticated;

alter table public.hrms_tenant_state enable row level security;
alter table public.hrms_tenant_state force row level security;
revoke all on public.hrms_tenant_state from anon;
grant select, insert, update, delete on public.hrms_tenant_state to authenticated;

drop policy if exists hrms_tenant_state_ops on public.hrms_tenant_state;
create policy hrms_tenant_state_ops
on public.hrms_tenant_state
for all
to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_ops())
with check (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_ops());

drop policy if exists hrms_tenant_state_provenance on public.hrms_tenant_state;
create policy hrms_tenant_state_provenance
on public.hrms_tenant_state
as restrictive
for all
to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id))
with check (public.arth_persistence_tenant_allowed(tenant_id) and updated_by = (select auth.uid()));

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'hrms_employees', 'hrms_attendance', 'hrms_leave_requests', 'hrms_payroll_records',
        'hrms_departments', 'hrms_designations', 'hrms_recruitment_records', 'hrms_training_records',
        'hrms_performance_records', 'hrms_documents', 'hrms_assets', 'hrms_notifications',
        'hrms_expense_claims', 'hrms_helpdesk_tickets', 'hrms_employee_lifecycle_records',
        'hrms_schedule_records', 'hrms_workflow_records', 'hrms_reports', 'hrms_identity_records',
        'hrms_audit_records', 'hrms_import_records', 'hrms_governance_records', 'hrms_settings'
    ] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_ops_all', table_name);
        execute format(
            'create policy %I on public.%I for all to authenticated
             using (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_ops())
             with check (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_ops())',
            table_name || '_ops_all', table_name
        );
    end loop;
end
$$;

-- Tenant technical administrators can manage identity/configuration records but
-- receive no blanket access to employee, leave, attendance, payroll, or document data.
do $$
declare
    table_name text;
begin
    foreach table_name in array array['hrms_identity_records', 'hrms_governance_records', 'hrms_settings', 'hrms_import_records'] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_tenant_admin_all', table_name);
        execute format(
            'create policy %I on public.%I for all to authenticated
             using (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_tenant_admin())
             with check (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_tenant_admin())',
            table_name || '_tenant_admin_all', table_name
        );
    end loop;
end
$$;

drop policy if exists hrms_audit_records_tenant_admin_read on public.hrms_audit_records;
create policy hrms_audit_records_tenant_admin_read on public.hrms_audit_records for select to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_tenant_admin());

-- Every write is stamped by the authenticated user; this policy restricts all permissive domain policies.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'hrms_employees', 'hrms_attendance', 'hrms_leave_requests', 'hrms_payroll_records',
        'hrms_departments', 'hrms_designations', 'hrms_recruitment_records', 'hrms_training_records',
        'hrms_performance_records', 'hrms_documents', 'hrms_assets', 'hrms_expense_claims',
        'hrms_helpdesk_tickets', 'hrms_employee_lifecycle_records', 'hrms_schedule_records',
        'hrms_workflow_records', 'hrms_notifications', 'hrms_reports', 'hrms_identity_records',
        'hrms_audit_records', 'hrms_import_records', 'hrms_governance_records', 'hrms_settings'
    ] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_provenance', table_name);
        execute format(
            'create policy %I on public.%I as restrictive for all to authenticated
             using (public.arth_persistence_tenant_allowed(tenant_id))
             with check (public.arth_persistence_tenant_allowed(tenant_id) and updated_by = (select auth.uid()))',
            table_name || '_provenance', table_name
        );
    end loop;
end
$$;

-- Manager mutations are limited to directly managed subjects. Payload field
-- integrity is enforced by the trigger below so approval access cannot become
-- arbitrary record editing.
do $$
declare
    table_name text;
begin
    foreach table_name in array array['hrms_attendance', 'hrms_leave_requests', 'hrms_expense_claims'] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_manager_update', table_name);
        execute format(
            'create policy %I on public.%I for update to authenticated
             using (public.arth_persistence_role() = ''manager'' and public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_manager_of(tenant_id, subject_id))
             with check (public.arth_persistence_role() = ''manager'' and public.arth_persistence_tenant_allowed(tenant_id) and public.arth_persistence_is_manager_of(tenant_id, subject_id))',
            table_name || '_manager_update', table_name
        );
    end loop;
end
$$;

-- Tenant-wide reference data is readable but never writable by ordinary users.
drop policy if exists hrms_departments_tenant_read on public.hrms_departments;
create policy hrms_departments_tenant_read on public.hrms_departments for select to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id));

drop policy if exists hrms_designations_tenant_read on public.hrms_designations;
create policy hrms_designations_tenant_read on public.hrms_designations for select to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id));

drop policy if exists hrms_settings_tenant_read on public.hrms_settings;
create policy hrms_settings_tenant_read on public.hrms_settings for select to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and record_type in ('settings', 'companySettings', 'shifts', 'teams')
);

drop policy if exists hrms_schedule_records_tenant_read on public.hrms_schedule_records;
create policy hrms_schedule_records_tenant_read on public.hrms_schedule_records for select to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id));

drop policy if exists hrms_training_catalog_tenant_read on public.hrms_training_records;
create policy hrms_training_catalog_tenant_read on public.hrms_training_records for select to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id) and record_type = 'courses');

drop policy if exists hrms_performance_cycles_tenant_read on public.hrms_performance_records;
create policy hrms_performance_cycles_tenant_read on public.hrms_performance_records for select to authenticated
using (public.arth_persistence_tenant_allowed(tenant_id) and record_type = 'reviewCycles');

drop policy if exists hrms_documents_shared_read on public.hrms_documents;
create policy hrms_documents_shared_read on public.hrms_documents for select to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and (
        lower(coalesce(payload ->> 'assignedToAll', 'false')) = 'true'
        or upper(coalesce(payload ->> 'assignedTo', '')) = 'ALL'
    )
);

-- Employees and managers may read only their own or directly managed operational records.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'hrms_employees', 'hrms_attendance', 'hrms_leave_requests', 'hrms_training_records',
        'hrms_performance_records', 'hrms_documents', 'hrms_assets', 'hrms_expense_claims',
        'hrms_helpdesk_tickets', 'hrms_employee_lifecycle_records', 'hrms_workflow_records'
    ] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_subject_read', table_name);
        execute format(
            'create policy %I on public.%I for select to authenticated using (
                public.arth_persistence_tenant_allowed(tenant_id)
                and (
                    subject_id = public.arth_persistence_emp_id()
                    or public.arth_persistence_is_manager_of(tenant_id, subject_id)
                )
            )',
            table_name || '_subject_read', table_name
        );
    end loop;
end
$$;

create or replace function public.arth_validate_scoped_business_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    current_role text := public.arth_persistence_role();
    allowed_keys text[];
begin
    if current_role in ('admin', 'hr', 'hr_head', 'director') then
        return new;
    end if;
    if new.tenant_id <> old.tenant_id
       or new.organization_id <> old.organization_id
       or new.record_type <> old.record_type
       or new.record_id <> old.record_id
       or new.subject_id <> old.subject_id then
        raise exception 'Record ownership and tenant scope are immutable.' using errcode = '42501';
    end if;
    if current_role = 'manager' then
        allowed_keys := case tg_table_name
            when 'hrms_attendance' then array['regularizationStatus', 'status', 'remarks', 'reviewedAt']
            when 'hrms_leave_requests' then array['managerStatus', 'hrStatus', 'finalStatus', 'status', 'hrMessage', 'remarks', 'reviewedAt', 'decidedOn']
            when 'hrms_expense_claims' then array['status', 'managerStatus', 'financeStatus', 'finalStatus', 'level', 'managerRemark', 'managerRemarks', 'approvedByManagerOn', 'rejectedByManagerOn', 'reviewedAt']
            else array[]::text[]
        end;
    elsif current_role = 'employee' then
        allowed_keys := case tg_table_name
            when 'hrms_attendance' then array['checkIn', 'checkOut', 'workingHours', 'lateMinutes', 'status', 'regularizationStatus', 'remarks', 'source']
            when 'hrms_leave_requests' then array['type', 'leaveType', 'from', 'fromDate', 'to', 'toDate', 'totalDays', 'reason', 'status', 'remarks', 'document', 'documentUrl', 'source']
            when 'hrms_expense_claims' then array['category', 'date', 'expenseDate', 'amount', 'currency', 'description', 'billFileName', 'attachmentFileName', 'attachmentUrl', 'remarks', 'source']
            else array[]::text[]
        end;
    else
        raise exception 'Role is not permitted to update this business record.' using errcode = '42501';
    end if;
    if (new.payload - allowed_keys) <> (old.payload - allowed_keys) then
        raise exception 'Update contains fields outside the permitted action scope.' using errcode = '42501';
    end if;
    return new;
end
$$;

revoke all on function public.arth_validate_scoped_business_update() from public, anon, authenticated;

do $$
declare
    table_name text;
begin
    foreach table_name in array array['hrms_attendance', 'hrms_leave_requests', 'hrms_expense_claims'] loop
        execute format('drop trigger if exists %I on public.%I', table_name || '_validate_scoped_update', table_name);
        execute format(
            'create trigger %I before update on public.%I for each row execute function public.arth_validate_scoped_business_update()',
            table_name || '_validate_scoped_update', table_name
        );
    end loop;
end
$$;

-- Employees may create and maintain their own operational requests. Operations roles retain full control.
do $$
declare
    table_name text;
begin
    foreach table_name in array array['hrms_expense_claims', 'hrms_helpdesk_tickets', 'hrms_employee_lifecycle_records'] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_self_insert', table_name);
        execute format(
            'create policy %I on public.%I for insert to authenticated with check (
                public.arth_persistence_tenant_allowed(tenant_id)
                and subject_id = public.arth_persistence_emp_id()
            )',
            table_name || '_self_insert', table_name
        );
        execute format('drop policy if exists %I on public.%I', table_name || '_self_update', table_name);
        execute format(
            'create policy %I on public.%I for update to authenticated
             using (public.arth_persistence_tenant_allowed(tenant_id) and subject_id = public.arth_persistence_emp_id())
             with check (public.arth_persistence_tenant_allowed(tenant_id) and subject_id = public.arth_persistence_emp_id())',
            table_name || '_self_update', table_name
        );
    end loop;
end
$$;

-- Employees may submit their own attendance, leave, and document records.
do $$
declare
    table_name text;
begin
    foreach table_name in array array['hrms_attendance', 'hrms_leave_requests', 'hrms_documents'] loop
        execute format('drop policy if exists %I on public.%I', table_name || '_self_insert', table_name);
        execute format(
            'create policy %I on public.%I for insert to authenticated with check (
                public.arth_persistence_tenant_allowed(tenant_id)
                and subject_id = public.arth_persistence_emp_id()
            )',
            table_name || '_self_insert', table_name
        );
        execute format('drop policy if exists %I on public.%I', table_name || '_self_update', table_name);
        execute format(
            'create policy %I on public.%I for update to authenticated
             using (public.arth_persistence_tenant_allowed(tenant_id) and subject_id = public.arth_persistence_emp_id())
             with check (public.arth_persistence_tenant_allowed(tenant_id) and subject_id = public.arth_persistence_emp_id())',
            table_name || '_self_update', table_name
        );
    end loop;
end
$$;

-- Payroll remains self-readable and operations-managed.
drop policy if exists hrms_payroll_self_read on public.hrms_payroll_records;
create policy hrms_payroll_self_read on public.hrms_payroll_records for select to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and subject_id = public.arth_persistence_emp_id()
);

-- Notifications are scoped to the employee, their trusted role, or tenant broadcasts.
drop policy if exists hrms_notifications_target_read on public.hrms_notifications;
create policy hrms_notifications_target_read on public.hrms_notifications for select to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and (
        subject_id = public.arth_persistence_emp_id()
        or upper(subject_id) in ('ALL', upper(public.arth_persistence_role()))
        or upper(coalesce(payload ->> 'to', payload ->> 'toRole', payload ->> 'role', '')) in ('ALL', upper(public.arth_persistence_role()))
    )
);

drop policy if exists hrms_notifications_self_update on public.hrms_notifications;
create policy hrms_notifications_self_update on public.hrms_notifications for update to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and (
        subject_id = public.arth_persistence_emp_id()
        or upper(subject_id) in ('ALL', upper(public.arth_persistence_role()))
        or upper(coalesce(payload ->> 'to', payload ->> 'toRole', payload ->> 'role', '')) in ('ALL', upper(public.arth_persistence_role()))
    )
)
with check (
    public.arth_persistence_tenant_allowed(tenant_id)
    and (
        subject_id = public.arth_persistence_emp_id()
        or upper(subject_id) in ('ALL', upper(public.arth_persistence_role()))
        or upper(coalesce(payload ->> 'to', payload ->> 'toRole', payload ->> 'role', '')) in ('ALL', upper(public.arth_persistence_role()))
    )
);

create or replace function public.arth_validate_notification_receipt_update()
returns trigger
language plpgsql
as $$
declare
    employee_id text := public.arth_persistence_emp_id();
    old_read_by jsonb := coalesce(old.payload -> 'readBy', '[]'::jsonb);
    new_read_by jsonb := coalesce(new.payload -> 'readBy', '[]'::jsonb);
begin
    if public.arth_persistence_is_ops() then
        return new;
    end if;
    if employee_id = ''
       or (new.payload - 'readBy') <> (old.payload - 'readBy')
       or not (new_read_by @> old_read_by)
       or not (new_read_by @> jsonb_build_array(employee_id))
       or jsonb_array_length(new_read_by) > jsonb_array_length(old_read_by) + 1
       or new.tenant_id <> old.tenant_id
       or new.organization_id <> old.organization_id
       or new.record_type <> old.record_type
       or new.record_id <> old.record_id
       or new.subject_id <> old.subject_id then
        raise exception 'Only the authenticated employee read receipt may be appended.' using errcode = '42501';
    end if;
    return new;
end
$$;

revoke all on function public.arth_validate_notification_receipt_update() from public, anon, authenticated;

drop trigger if exists hrms_notifications_validate_receipt on public.hrms_notifications;
create trigger hrms_notifications_validate_receipt
before update on public.hrms_notifications
for each row execute function public.arth_validate_notification_receipt_update();

-- Standard updated_at maintenance.
create or replace function public.arth_set_persistence_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end
$$;

revoke all on function public.arth_set_persistence_updated_at() from public, anon, authenticated;

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
        'hrms_identity_records', 'hrms_audit_records', 'hrms_import_records', 'hrms_governance_records',
        'hrms_settings'
    ] loop
        execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
        execute format(
            'create trigger %I before update on public.%I for each row execute function public.arth_set_persistence_updated_at()',
            table_name || '_set_updated_at', table_name
        );
    end loop;
end
$$;
