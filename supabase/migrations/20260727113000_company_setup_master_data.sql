begin;

create or replace function private.arth_company_setup_master_target(p_master_type text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select case lower(trim(coalesce(p_master_type, '')))
        when 'industry' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'industries')
        when 'department' then jsonb_build_object('table', 'hrms_departments', 'recordType', 'departments')
        when 'business_unit' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'businessUnits')
        when 'branch' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'companyLocations')
        when 'designation' then jsonb_build_object('table', 'hrms_designations', 'recordType', 'designations')
        when 'attendance_policy' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'attendancePolicyDefinitions')
        when 'shift' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'shifts')
        when 'holiday_calendar' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'companyHolidayCalendars')
        when 'leave_type' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'leaveTypes')
        when 'approval_workflow' then jsonb_build_object('table', 'hrms_workflow_records', 'recordType', 'approvalWorkflows')
        when 'payroll_template' then jsonb_build_object('table', 'hrms_payroll_records', 'recordType', 'salaryStructures')
        when 'salary_component' then jsonb_build_object('table', 'hrms_payroll_records', 'recordType', 'payrollComponents')
        when 'notification_provider' then jsonb_build_object('table', 'hrms_settings', 'recordType', 'notificationProviders')
        else '{}'::jsonb
    end
$$;

revoke all on function private.arth_company_setup_master_target(text) from public, anon;
grant execute on function private.arth_company_setup_master_target(text) to authenticated;

create or replace function public.arth_get_company_setup_reference_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    caller_id uuid := (select auth.uid());
    caller_tenant text := public.arth_persistence_tenant_id();
    caller_organization text := coalesce(
        (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
        (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
        ''
    );
    company_row public.platform_companies%rowtype;
begin
    select *
    into company_row
    from public.platform_companies company
    where company.tenant_id = caller_tenant
      and company.organization_id = caller_organization
      and company.owner_auth_user_id = caller_id
    limit 1;

    if not found
       or not private.arth_company_setup_owner_allowed(company_row.id, caller_tenant, caller_organization) then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;

    return jsonb_build_object(
        'ok', true,
        'catalog', jsonb_build_object(
            'industry', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'industries'
            ), '[]'::jsonb),
            'department', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_departments record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type in ('departments', 'tenantDepartmentRecords')
            ), '[]'::jsonb),
            'business_unit', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'businessUnits'
            ), '[]'::jsonb),
            'branch', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type in ('companyLocations', 'locations')
            ), '[]'::jsonb),
            'designation', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_designations record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'designations'
            ), '[]'::jsonb),
            'attendance_policy', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', record.payload ->> 'policyName', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'attendancePolicyDefinitions'
            ), '[]'::jsonb),
            'shift', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'shifts'
            ), '[]'::jsonb),
            'holiday_calendar', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'companyHolidayCalendars'
            ), '[]'::jsonb),
            'leave_type', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'leaveTypes'
            ), '[]'::jsonb),
            'approval_workflow', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_workflow_records record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'approvalWorkflows'
            ), '[]'::jsonb),
            'payroll_template', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_payroll_records record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'salaryStructures'
            ), '[]'::jsonb),
            'salary_component', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_payroll_records record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'payrollComponents'
            ), '[]'::jsonb),
            'notification_provider', coalesce((
                select jsonb_agg(record.payload order by lower(coalesce(record.payload ->> 'name', '')))
                from public.hrms_settings record
                where record.tenant_id = caller_tenant
                  and record.organization_id = caller_organization
                  and record.record_type = 'notificationProviders'
            ), '[]'::jsonb)
        ),
        'employees', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', record.record_id,
                    'name', coalesce(record.payload ->> 'name', record.payload ->> 'fullName', ''),
                    'email', coalesce(record.payload ->> 'email', ''),
                    'department', coalesce(record.payload ->> 'department', record.payload ->> 'dept', ''),
                    'role', coalesce(record.payload ->> 'role', 'employee'),
                    'authUserId', coalesce(record.payload ->> 'authUserId', record.payload ->> 'auth_user_id', '')
                )
                order by lower(coalesce(record.payload ->> 'name', record.payload ->> 'fullName', record.record_id))
            )
            from public.hrms_employees record
            where record.tenant_id = caller_tenant
              and record.organization_id = caller_organization
              and record.record_type = 'employees'
        ), '[]'::jsonb),
        'invitations', coalesce((
            select jsonb_agg(record.payload order by record.updated_at desc)
            from public.hrms_identity_records record
            where record.tenant_id = caller_tenant
              and record.organization_id = caller_organization
              and record.record_type = 'authInvites'
        ), '[]'::jsonb)
    );
end
$$;

revoke all on function public.arth_get_company_setup_reference_data() from public, anon;
grant execute on function public.arth_get_company_setup_reference_data() to authenticated;

create or replace function public.arth_upsert_company_setup_master_data(
    p_master_type text,
    p_payload jsonb,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    caller_id uuid := (select auth.uid());
    caller_tenant text := public.arth_persistence_tenant_id();
    caller_organization text := coalesce(
        (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
        (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
        ''
    );
    company_row public.platform_companies%rowtype;
    target jsonb := private.arth_company_setup_master_target(p_master_type);
    target_table text := target ->> 'table';
    target_record_type text := target ->> 'recordType';
    master_name text := trim(coalesce(p_payload ->> 'name', ''));
    master_code text := upper(regexp_replace(trim(coalesce(p_payload ->> 'code', master_name)), '[^A-Za-z0-9]+', '-', 'g'));
    record_id text;
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    normalized_payload jsonb;
begin
    select *
    into company_row
    from public.platform_companies company
    where company.tenant_id = caller_tenant
      and company.organization_id = caller_organization
      and company.owner_auth_user_id = caller_id
    limit 1;

    if not found
       or not private.arth_company_setup_owner_allowed(company_row.id, caller_tenant, caller_organization) then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;
    if target_table is null or target_record_type is null then
        raise exception 'Unsupported company setup master-data type.' using errcode = '22023';
    end if;
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' or master_name = '' then
        raise exception 'Master-data name is required.' using errcode = '22023';
    end if;
    if length(master_name) > 160 or length(master_code) < 2 or length(master_code) > 80 then
        raise exception 'Master-data name or code is invalid.' using errcode = '22023';
    end if;
    if length(operation_key) < 8 or length(operation_key) > 200 then
        raise exception 'A valid idempotency key is required.' using errcode = '22023';
    end if;

    record_id := lower(trim(coalesce(p_master_type, ''))) || ':' || lower(master_code);
    normalized_payload := p_payload
        || jsonb_build_object(
            'id', record_id,
            'name', master_name,
            'code', master_code,
            'tenantId', caller_tenant,
            'organizationId', caller_organization,
            'source', 'company-setup',
            'status', coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE'),
            'updatedAt', now()
        );

    if target_table = 'hrms_departments' then
        insert into public.hrms_departments (
            tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
        ) values (
            caller_tenant, caller_organization, target_record_type, record_id, '', normalized_payload, caller_id
        )
        on conflict (tenant_id, record_type, record_id)
        do update set payload = excluded.payload, updated_by = caller_id, updated_at = now();
    elsif target_table = 'hrms_designations' then
        insert into public.hrms_designations (
            tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
        ) values (
            caller_tenant, caller_organization, target_record_type, record_id, '', normalized_payload, caller_id
        )
        on conflict (tenant_id, record_type, record_id)
        do update set payload = excluded.payload, updated_by = caller_id, updated_at = now();
    elsif target_table = 'hrms_workflow_records' then
        insert into public.hrms_workflow_records (
            tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
        ) values (
            caller_tenant, caller_organization, target_record_type, record_id, '', normalized_payload, caller_id
        )
        on conflict (tenant_id, record_type, record_id)
        do update set payload = excluded.payload, updated_by = caller_id, updated_at = now();
    elsif target_table = 'hrms_payroll_records' then
        insert into public.hrms_payroll_records (
            tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
        ) values (
            caller_tenant, caller_organization, target_record_type, record_id, '', normalized_payload, caller_id
        )
        on conflict (tenant_id, record_type, record_id)
        do update set payload = excluded.payload, updated_by = caller_id, updated_at = now();
    else
        insert into public.hrms_settings (
            tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
        ) values (
            caller_tenant, caller_organization, target_record_type, record_id, '', normalized_payload, caller_id
        )
        on conflict (tenant_id, record_type, record_id)
        do update set payload = excluded.payload, updated_by = caller_id, updated_at = now();
    end if;

    insert into public.hrms_audit_records (
        tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
    ) values (
        caller_tenant,
        caller_organization,
        'companySetupAudit',
        operation_key,
        record_id,
        jsonb_build_object(
            'eventType', 'CompanySetupMasterDataUpserted',
            'masterType', lower(trim(p_master_type)),
            'masterRecordId', record_id,
            'masterCode', master_code,
            'actorRole', 'super_admin',
            'actorUserId', caller_id,
            'occurredAt', now()
        ),
        caller_id
    )
    on conflict (tenant_id, record_type, record_id) do nothing;

    return jsonb_build_object(
        'ok', true,
        'masterType', lower(trim(p_master_type)),
        'record', normalized_payload
    );
end
$$;

revoke all on function public.arth_upsert_company_setup_master_data(text, jsonb, text) from public, anon;
grant execute on function public.arth_upsert_company_setup_master_data(text, jsonb, text) to authenticated;

commit;
