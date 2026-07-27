begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.arth_company_setup_owner_allowed(
    p_company_id uuid,
    p_tenant_id text,
    p_organization_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
    select
        (select auth.uid()) is not null
        and public.arth_persistence_role() = 'super_admin'
        and lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'company_owner', 'false')) = 'true'
        and public.arth_persistence_tenant_id() = p_tenant_id
        and coalesce(
            (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
            (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
            ''
        ) = p_organization_id
        and exists (
            select 1
            from public.platform_companies company
            where company.id = p_company_id
              and company.tenant_id = p_tenant_id
              and company.organization_id = p_organization_id
              and company.owner_auth_user_id = (select auth.uid())
        )
$$;

revoke all on function private.arth_company_setup_owner_allowed(uuid, text, text) from public, anon;
grant execute on function private.arth_company_setup_owner_allowed(uuid, text, text) to authenticated;

drop policy if exists company_setup_workspace_tenant_read on public.company_setup_workspaces;
drop policy if exists company_setup_workspace_owner_read on public.company_setup_workspaces;
create policy company_setup_workspace_owner_read
on public.company_setup_workspaces
for select
to authenticated
using (
    private.arth_company_setup_owner_allowed(company_id, tenant_id, organization_id)
);

drop policy if exists company_setup_versions_tenant_read on public.company_setup_step_versions;
drop policy if exists company_setup_versions_owner_read on public.company_setup_step_versions;
create policy company_setup_versions_owner_read
on public.company_setup_step_versions
for select
to authenticated
using (
    private.arth_company_setup_owner_allowed(company_id, tenant_id, organization_id)
);

create or replace function private.arth_company_setup_payload_error(
    p_step_key text,
    p_payload jsonb
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
    step_key text := trim(coalesce(p_step_key, ''));
    payload jsonb := coalesce(p_payload, '{}'::jsonb);
    payment_day integer;
    password_minimum integer;
    session_timeout integer;
begin
    if jsonb_typeof(payload) <> 'object' then
        return 'Company setup step payload must be an object.';
    end if;

    if step_key = 'organizationInformation' then
        if trim(coalesce(payload ->> 'companyName', '')) = ''
           or trim(coalesce(payload ->> 'legalName', '')) = ''
           or trim(coalesce(payload ->> 'organizationCode', '')) = ''
           or trim(coalesce(payload ->> 'industry', '')) = ''
           or trim(coalesce(payload ->> 'companySize', '')) = ''
           or trim(coalesce(payload ->> 'website', '')) = ''
           or trim(coalesce(payload ->> 'timeZone', '')) = ''
           or trim(coalesce(payload ->> 'currency', '')) = ''
           or trim(coalesce(payload ->> 'language', '')) = ''
           or trim(coalesce(payload ->> 'fiscalYearStart', '')) = '' then
            return 'Organization information is incomplete.';
        end if;
        if (payload ->> 'website') !~ '^https?://[^[:space:]]+$' then
            return 'Organization website must use HTTP or HTTPS.';
        end if;
    elsif step_key = 'organizationStructure' then
        if jsonb_typeof(payload -> 'headOffice') <> 'object'
           or trim(coalesce(payload #>> '{headOffice,name}', '')) = ''
           or jsonb_typeof(payload -> 'departments') <> 'array'
           or jsonb_array_length(payload -> 'departments') = 0 then
            return 'Organization structure requires a head office and at least one department.';
        end if;
    elsif step_key = 'workingConfiguration' then
        if jsonb_typeof(payload -> 'workWeek') <> 'array'
           or jsonb_array_length(payload -> 'workWeek') = 0
           or trim(coalesce(payload #>> '{officeHours,start}', '')) = ''
           or trim(coalesce(payload #>> '{officeHours,end}', '')) = ''
           or payload #>> '{officeHours,start}' = payload #>> '{officeHours,end}'
           or trim(coalesce(payload ->> 'timeZone', '')) = ''
           or trim(coalesce(payload ->> 'shiftStrategy', '')) = ''
           or trim(coalesce(payload ->> 'attendanceMode', '')) = '' then
            return 'Working configuration is incomplete or contains invalid office hours.';
        end if;
    elsif step_key = 'leaveConfiguration' then
        if jsonb_typeof(payload -> 'leaveTypes') <> 'array'
           or jsonb_array_length(payload -> 'leaveTypes') = 0
           or jsonb_typeof(payload #> '{approvalRules,approvers}') <> 'array'
           or jsonb_array_length(payload #> '{approvalRules,approvers}') = 0 then
            return 'Leave configuration requires leave types and at least one approver.';
        end if;
    elsif step_key = 'payrollConfiguration' then
        payment_day := case
            when coalesce(payload #>> '{paymentCycle,day}', '') ~ '^[0-9]+$'
                then (payload #>> '{paymentCycle,day}')::integer
            else 0
        end;
        if trim(coalesce(payload ->> 'payrollFrequency', '')) = ''
           or trim(coalesce(payload ->> 'salaryStructure', '')) = ''
           or jsonb_typeof(payload -> 'components') <> 'array'
           or jsonb_array_length(payload -> 'components') = 0
           or payment_day < 1
           or payment_day > 31 then
            return 'Payroll configuration requires a frequency, structure, components, and payment day from 1 to 31.';
        end if;
    elsif step_key = 'identitySecurity' then
        password_minimum := case
            when coalesce(payload #>> '{passwordPolicy,minLength}', '') ~ '^[0-9]+$'
                then (payload #>> '{passwordPolicy,minLength}')::integer
            else 0
        end;
        session_timeout := case
            when coalesce(payload ->> 'sessionTimeoutMinutes', '') ~ '^[0-9]+$'
                then (payload ->> 'sessionTimeoutMinutes')::integer
            else 0
        end;
        if trim(coalesce(payload ->> 'authenticationMethod', '')) = ''
           or password_minimum < 12
           or session_timeout < 5
           or session_timeout > 1440
           or (
               lower(coalesce(payload #>> '{sso,enabled}', 'false')) = 'true'
               and trim(coalesce(payload #>> '{sso,provider}', '')) = ''
           ) then
            return 'Identity configuration requires a valid authentication method, password policy, session timeout, and SSO provider when enabled.';
        end if;
    elsif step_key = 'notifications' then
        if jsonb_typeof(payload -> 'email') <> 'object'
           or jsonb_typeof(payload -> 'sms') <> 'object'
           or jsonb_typeof(payload -> 'pushNotifications') <> 'object'
           or jsonb_typeof(payload -> 'reminderRules') <> 'array' then
            return 'Notification configuration is malformed.';
        end if;
    elsif step_key = 'administrator' then
        if trim(coalesce(payload ->> 'name', '')) = ''
           or coalesce(payload ->> 'email', '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           or lower(coalesce(payload ->> 'role', '')) not in ('super_admin', 'admin', 'hr') then
            return 'Administrator name, email, and role are invalid.';
        end if;
    elsif step_key = 'review' then
        if lower(coalesce(payload ->> 'ready', 'false')) <> 'true' then
            return 'Setup review must be confirmed before completion.';
        end if;
    elsif step_key <> 'provisionTenant' then
        return 'Company setup step is invalid.';
    end if;

    return '';
end
$$;

revoke all on function private.arth_company_setup_payload_error(text, jsonb) from public, anon;
grant execute on function private.arth_company_setup_payload_error(text, jsonb) to authenticated;

create or replace function private.arth_validate_company_setup_workspace_update()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    required_step text;
    validation_error text;
begin
    if not private.arth_company_setup_owner_allowed(new.company_id, new.tenant_id, new.organization_id) then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;

    if new.status in ('DRAFT', 'IN_PROGRESS')
       and new.completed_steps = old.completed_steps
       and new.current_step <> old.current_step then
        new.current_step := old.current_step;
    end if;

    if new.status = 'CORE_SETUP_COMPLETE' and old.status <> 'CORE_SETUP_COMPLETE' then
        if not old.completed_steps ? 'review' then
            raise exception 'Setup review must be completed before final provisioning.' using errcode = '22023';
        end if;
        foreach required_step in array array[
            'organizationInformation',
            'organizationStructure',
            'workingConfiguration',
            'leaveConfiguration',
            'payrollConfiguration',
            'identitySecurity',
            'notifications',
            'administrator',
            'review'
        ]
        loop
            if not old.completed_steps ? required_step then
                raise exception 'Required company setup step % is incomplete.', required_step using errcode = '22023';
            end if;
            validation_error := private.arth_company_setup_payload_error(
                required_step,
                old.draft_payload -> required_step
            );
            if validation_error <> '' then
                raise exception '%', validation_error using errcode = '22023';
            end if;
        end loop;
    end if;

    return new;
end
$$;

revoke all on function private.arth_validate_company_setup_workspace_update() from public, anon, authenticated;

drop trigger if exists company_setup_validate_workspace_update on public.company_setup_workspaces;
create trigger company_setup_validate_workspace_update
before update on public.company_setup_workspaces
for each row execute function private.arth_validate_company_setup_workspace_update();

create or replace function private.arth_audit_company_setup_step()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
    if (select auth.uid()) is null
       or new.actor_user_id <> (select auth.uid())
       or not private.arth_company_setup_owner_allowed(new.company_id, new.tenant_id, new.organization_id) then
        raise exception 'Company setup audit provenance is invalid.' using errcode = '42501';
    end if;

    insert into public.hrms_audit_records (
        tenant_id,
        organization_id,
        record_type,
        record_id,
        subject_id,
        payload,
        updated_by
    ) values (
        new.tenant_id,
        new.organization_id,
        'companySetupAudit',
        new.idempotency_key,
        new.workspace_id::text,
        jsonb_build_object(
            'eventType', 'CompanySetupStepSaved',
            'stepKey', new.step_key,
            'stepVersion', new.step_version,
            'actorRole', new.actor_role,
            'actorUserId', new.actor_user_id,
            'occurredAt', new.created_at
        ),
        new.actor_user_id
    )
    on conflict (tenant_id, record_type, record_id) do nothing;

    return new;
end
$$;

revoke all on function private.arth_audit_company_setup_step() from public, anon, authenticated;

drop trigger if exists company_setup_audit_step_version on public.company_setup_step_versions;
create trigger company_setup_audit_step_version
after insert on public.company_setup_step_versions
for each row execute function private.arth_audit_company_setup_step();

create or replace function private.arth_audit_company_setup_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    event_name text;
    event_key text;
    actor_id uuid;
begin
    if tg_op = 'INSERT' then
        event_name := 'CompanySetupWorkspaceCreated';
        event_key := 'company-setup-workspace:' || new.id::text;
        actor_id := new.created_by;
    elsif new.status = 'CORE_SETUP_COMPLETE' and old.status <> 'CORE_SETUP_COMPLETE' then
        event_name := 'CompanySetupCompleted';
        event_key := 'company-setup-complete:' || new.id::text;
        actor_id := new.updated_by;
    else
        return new;
    end if;

    if (select auth.uid()) is null
       or actor_id <> (select auth.uid())
       or not private.arth_company_setup_owner_allowed(new.company_id, new.tenant_id, new.organization_id) then
        raise exception 'Company setup audit provenance is invalid.' using errcode = '42501';
    end if;

    insert into public.hrms_audit_records (
        tenant_id,
        organization_id,
        record_type,
        record_id,
        subject_id,
        payload,
        updated_by
    ) values (
        new.tenant_id,
        new.organization_id,
        'companySetupAudit',
        event_key,
        new.id::text,
        jsonb_build_object(
            'eventType', event_name,
            'status', new.status,
            'progress', new.progress,
            'actorRole', 'super_admin',
            'actorUserId', actor_id,
            'occurredAt', now()
        ),
        actor_id
    )
    on conflict (tenant_id, record_type, record_id) do nothing;

    return new;
end
$$;

revoke all on function private.arth_audit_company_setup_workspace() from public, anon, authenticated;

drop trigger if exists company_setup_audit_workspace on public.company_setup_workspaces;
create trigger company_setup_audit_workspace
after insert or update on public.company_setup_workspaces
for each row execute function private.arth_audit_company_setup_workspace();

commit;
