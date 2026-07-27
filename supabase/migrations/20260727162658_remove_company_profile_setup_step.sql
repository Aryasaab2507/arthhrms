begin;

alter table public.company_setup_workspaces
alter column current_step set default 'organizationStructure';

alter table public.company_setup_workspaces
disable trigger company_setup_validate_workspace_update;

update public.company_setup_workspaces workspace
set current_step = case
        when workspace.current_step = 'organizationInformation' then 'organizationStructure'
        else workspace.current_step
    end,
    completed_steps = (
        select coalesce(jsonb_agg(step.value order by step.ordinal), '[]'::jsonb)
        from jsonb_array_elements_text(coalesce(workspace.completed_steps, '[]'::jsonb))
            with ordinality as step(value, ordinal)
        where step.value <> 'organizationInformation'
    ),
    draft_payload = coalesce(workspace.draft_payload, '{}'::jsonb) - 'organizationInformation',
    progress = case
        when workspace.status = 'COMPLETED' then 100
        else least(
            89,
            round((
                select count(*)::numeric
                from jsonb_array_elements_text(coalesce(workspace.completed_steps, '[]'::jsonb)) step(value)
                where step.value not in ('organizationInformation', 'provisionTenant')
            ) / 9::numeric * 100)::smallint
        )
    end,
    revision = workspace.revision + 1,
    updated_at = now()
where workspace.current_step = 'organizationInformation'
   or workspace.completed_steps ? 'organizationInformation'
   or workspace.draft_payload ? 'organizationInformation';

create or replace function public.arth_company_setup_step_allowed(step_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(step_key, '') in (
        'organizationStructure',
        'workingConfiguration',
        'leaveConfiguration',
        'payrollConfiguration',
        'identitySecurity',
        'notifications',
        'administrator',
        'review',
        'provisionTenant'
    )
$$;

revoke all on function public.arth_company_setup_step_allowed(text) from public, anon;
grant execute on function public.arth_company_setup_step_allowed(text) to authenticated;

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

    if step_key = 'organizationStructure' then
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

    if old.status = 'PROVISIONING' and new.status <> 'COMPLETED' then
        raise exception 'Company setup workspace state PROVISIONING is read-only.' using errcode = '22023';
    end if;
    if old.status in ('COMPLETED', 'ARCHIVED') then
        raise exception 'Company setup workspace state % is read-only.', old.status using errcode = '22023';
    end if;

    if old.status = 'DRAFT' and new.status not in ('DRAFT', 'IN_PROGRESS') then
        raise exception 'Invalid company setup transition from DRAFT to %.', new.status using errcode = '22023';
    elsif old.status = 'IN_PROGRESS' and new.status not in ('IN_PROGRESS', 'REVIEW', 'READY_FOR_PROVISION') then
        raise exception 'Invalid company setup transition from IN_PROGRESS to %.', new.status using errcode = '22023';
    elsif old.status = 'REVIEW' and new.status not in ('IN_PROGRESS', 'REVIEW', 'READY_FOR_PROVISION') then
        raise exception 'Invalid company setup transition from REVIEW to %.', new.status using errcode = '22023';
    elsif old.status = 'READY_FOR_PROVISION'
          and new.status not in ('IN_PROGRESS', 'REVIEW', 'READY_FOR_PROVISION', 'PROVISIONING') then
        raise exception 'Invalid company setup transition from READY_FOR_PROVISION to %.', new.status using errcode = '22023';
    elsif old.status = 'PROVISIONING' and new.status <> 'COMPLETED' then
        raise exception 'Invalid company setup transition from PROVISIONING to %.', new.status using errcode = '22023';
    end if;

    if new.status in ('READY_FOR_PROVISION', 'PROVISIONING')
       and old.status <> new.status then
        foreach required_step in array array[
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
            if not new.completed_steps ? required_step then
                raise exception 'Required company setup step % is incomplete.', required_step using errcode = '22023';
            end if;
            validation_error := private.arth_company_setup_payload_error(
                required_step,
                new.draft_payload -> required_step
            );
            if validation_error <> '' then
                raise exception '%', validation_error using errcode = '22023';
            end if;
        end loop;
    end if;

    return new;
end
$$;

revoke all on function private.arth_validate_company_setup_workspace_update()
from public, anon, authenticated;

create or replace function private.arth_get_or_create_company_setup_internal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    caller_role text := public.arth_persistence_role();
    caller_tenant text := public.arth_persistence_tenant_id();
    caller_organization text := coalesce(
        (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
        (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
        ''
    );
    company_row public.platform_companies%rowtype;
    workspace_row public.company_setup_workspaces%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    start_key text;
begin
    if caller_id is null or caller_role <> 'super_admin' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;
    if caller_tenant = '' or caller_organization = '' then
        raise exception 'Trusted tenant and organization claims are required.' using errcode = '42501';
    end if;

    select *
    into company_row
    from public.platform_companies
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and owner_auth_user_id = caller_id
      and status in ('OWNER_ACCEPTED', 'CONFIGURING', 'ORG_STRUCTURE', 'POLICIES', 'HR_READY', 'EMPLOYEE_IMPORT', 'VALIDATION', 'READY_FOR_REVIEW', 'PILOT', 'LIVE')
    limit 1;

    if not found then
        raise exception 'Authenticated user is not the Company Owner for this tenant.' using errcode = '42501';
    end if;

    insert into public.company_setup_workspaces (
        company_id, tenant_id, organization_id, status, current_step,
        completed_steps, progress, draft_payload, created_by, updated_by
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        'DRAFT',
        'organizationStructure',
        '[]'::jsonb,
        0,
        '{}'::jsonb,
        caller_id,
        caller_id
    )
    on conflict (company_id) do nothing;

    select *
    into workspace_row
    from public.company_setup_workspaces
    where company_id = company_row.id
    for update;

    if company_row.status = 'OWNER_ACCEPTED' then
        update public.platform_companies
        set status = 'CONFIGURING',
            revision = revision + 1,
            updated_by = caller_id,
            updated_at = now()
        where id = company_row.id
        returning * into company_row;

        update public.platform_tenant_lifecycle
        set previous_state = state,
            state = 'CONFIGURING',
            progress = 25,
            current_owner_role = 'super_admin',
            next_action = 'COMPLETE_ORGANIZATION_STRUCTURE',
            revision = revision + 1,
            updated_by = caller_id,
            updated_at = now()
        where company_id = company_row.id
        returning * into lifecycle_row;

        start_key := 'company-setup-started:' || workspace_row.id::text;
        insert into public.platform_lifecycle_events (
            company_id, tenant_id, organization_id, event_type,
            previous_state, new_state, actor_user_id, actor_role,
            reason, correlation_id, idempotency_key, payload
        ) values (
            company_row.id,
            company_row.tenant_id,
            company_row.organization_id,
            'CompanySetupStarted',
            lifecycle_row.previous_state,
            'CONFIGURING',
            caller_id,
            'super_admin',
            'Company Owner opened the Organization Import Center.',
            '',
            start_key,
            jsonb_build_object('workspaceId', workspace_row.id)
        )
        on conflict (idempotency_key) do nothing;
    end if;

    return jsonb_build_object(
        'ok', true,
        'workspace', to_jsonb(workspace_row),
        'company', to_jsonb(company_row)
    );
end
$$;

revoke all on function private.arth_get_or_create_company_setup_internal()
from public, anon, authenticated;

create or replace function private.arth_save_company_setup_step_internal(
    p_step_key text,
    p_payload jsonb,
    p_expected_revision bigint,
    p_idempotency_key text,
    p_complete boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    caller_role text := public.arth_persistence_role();
    caller_tenant text := public.arth_persistence_tenant_id();
    caller_organization text := coalesce(
        (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
        (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
        ''
    );
    workspace_row public.company_setup_workspaces%rowtype;
    version_row public.company_setup_step_versions%rowtype;
    existing_version public.company_setup_step_versions%rowtype;
    normalized_step text := trim(coalesce(p_step_key, ''));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    next_completed jsonb;
    next_step text;
    next_status text;
    previous_status text;
    next_progress smallint;
begin
    if caller_id is null or caller_role <> 'super_admin' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;
    if caller_tenant = '' or caller_organization = '' then
        raise exception 'Trusted tenant and organization claims are required.' using errcode = '42501';
    end if;
    if not public.arth_company_setup_step_allowed(normalized_step) then
        raise exception 'Company setup step is invalid.' using errcode = '22023';
    end if;
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
        raise exception 'Company setup step payload must be an object.' using errcode = '22023';
    end if;
    if pg_column_size(p_payload) > 1048576 then
        raise exception 'Company setup step payload exceeds the 1 MB limit.' using errcode = '22023';
    end if;
    if length(operation_key) < 8 or length(operation_key) > 200 then
        raise exception 'A valid idempotency key is required.' using errcode = '22023';
    end if;

    select *
    into existing_version
    from public.company_setup_step_versions
    where idempotency_key = operation_key
    limit 1;

    if found then
        if existing_version.tenant_id <> caller_tenant
           or existing_version.organization_id <> caller_organization
           or existing_version.step_key <> normalized_step
           or existing_version.payload <> p_payload then
            raise exception 'Idempotency key is already assigned to another setup operation.' using errcode = '22023';
        end if;
        select *
        into workspace_row
        from public.company_setup_workspaces
        where id = existing_version.workspace_id;
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'workspace', to_jsonb(workspace_row),
            'version', to_jsonb(existing_version)
        );
    end if;

    select *
    into workspace_row
    from public.company_setup_workspaces
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and exists (
          select 1
          from public.platform_companies company
          where company.id = company_setup_workspaces.company_id
            and company.owner_auth_user_id = caller_id
      )
    for update;

    if not found then
        raise exception 'Company setup workspace was not found for the authenticated tenant owner.' using errcode = '42501';
    end if;
    if workspace_row.status not in ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'READY_FOR_PROVISION') then
        raise exception
            'Company setup workspace state % is read-only. Editable states are DRAFT, IN_PROGRESS, REVIEW, and READY_FOR_PROVISION.',
            workspace_row.status
            using errcode = '22023';
    end if;
    if workspace_row.revision <> p_expected_revision then
        raise exception
            'Company setup revision is stale. Expected %, current %.',
            p_expected_revision,
            workspace_row.revision
            using errcode = '40001';
    end if;

    previous_status := workspace_row.status;
    next_completed := coalesce(workspace_row.completed_steps, '[]'::jsonb);

    if normalized_step <> 'provisionTenant' then
        select coalesce(jsonb_agg(step.value order by step.ordinal), '[]'::jsonb)
        into next_completed
        from jsonb_array_elements_text(next_completed)
            with ordinality as step(value, ordinal)
        where step.value <> 'provisionTenant';
    end if;

    if normalized_step <> 'review' or not p_complete then
        select coalesce(jsonb_agg(step.value order by step.ordinal), '[]'::jsonb)
        into next_completed
        from jsonb_array_elements_text(next_completed)
            with ordinality as step(value, ordinal)
        where step.value <> 'review';
    end if;

    if p_complete
       and normalized_step <> 'provisionTenant'
       and not next_completed ? normalized_step then
        next_completed := next_completed || jsonb_build_array(normalized_step);
    end if;

    next_progress := least(
        100,
        round((jsonb_array_length(next_completed)::numeric / 9::numeric) * 100)::smallint
    );
    next_step := case normalized_step
        when 'organizationStructure' then 'workingConfiguration'
        when 'workingConfiguration' then 'leaveConfiguration'
        when 'leaveConfiguration' then 'payrollConfiguration'
        when 'payrollConfiguration' then 'identitySecurity'
        when 'identitySecurity' then 'notifications'
        when 'notifications' then 'administrator'
        when 'administrator' then 'review'
        when 'review' then 'provisionTenant'
        else 'provisionTenant'
    end;
    next_status := case
        when normalized_step = 'review' and p_complete then 'READY_FOR_PROVISION'
        when normalized_step = 'review' then 'REVIEW'
        else 'IN_PROGRESS'
    end;

    insert into public.company_setup_step_versions (
        workspace_id,
        company_id,
        tenant_id,
        organization_id,
        step_key,
        step_version,
        payload,
        actor_user_id,
        actor_role,
        idempotency_key
    ) values (
        workspace_row.id,
        workspace_row.company_id,
        workspace_row.tenant_id,
        workspace_row.organization_id,
        normalized_step,
        workspace_row.revision + 1,
        p_payload,
        caller_id,
        'super_admin',
        operation_key
    )
    returning * into version_row;

    update public.company_setup_workspaces
    set status = next_status,
        current_step = case when p_complete then next_step else workspace_row.current_step end,
        completed_steps = next_completed,
        progress = next_progress,
        draft_payload = jsonb_set(
            coalesce(draft_payload, '{}'::jsonb),
            array[normalized_step],
            p_payload,
            true
        ),
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = workspace_row.id
    returning * into workspace_row;

    insert into public.platform_lifecycle_events (
        company_id,
        tenant_id,
        organization_id,
        event_type,
        previous_state,
        new_state,
        actor_user_id,
        actor_role,
        reason,
        correlation_id,
        idempotency_key,
        payload
    ) values (
        workspace_row.company_id,
        workspace_row.tenant_id,
        workspace_row.organization_id,
        'CompanySetupStepSaved',
        previous_status,
        next_status,
        caller_id,
        'super_admin',
        'Organization Import Center progress saved.',
        '',
        operation_key || ':event',
        jsonb_build_object(
            'workspaceId', workspace_row.id,
            'stepKey', normalized_step,
            'stepVersion', version_row.step_version,
            'progress', workspace_row.progress,
            'workspaceStatus', workspace_row.status
        )
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'workspace', to_jsonb(workspace_row),
        'version', to_jsonb(version_row)
    );
end
$$;

revoke all on function private.arth_save_company_setup_step_internal(text, jsonb, bigint, text, boolean)
from public, anon, authenticated;

create or replace function private.arth_complete_company_core_setup_internal(
    p_expected_revision bigint,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    caller_role text := public.arth_persistence_role();
    caller_tenant text := public.arth_persistence_tenant_id();
    caller_organization text := coalesce(
        (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
        (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
        ''
    );
    workspace_row public.company_setup_workspaces%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    required_step text;
    validation_error text;
begin
    if caller_id is null or caller_role <> 'super_admin' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;
    if caller_tenant = '' or caller_organization = '' then
        raise exception 'Trusted tenant and organization claims are required.' using errcode = '42501';
    end if;
    if length(operation_key) < 8 or length(operation_key) > 200 then
        raise exception 'A valid idempotency key is required.' using errcode = '22023';
    end if;

    select *
    into workspace_row
    from public.company_setup_workspaces
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and exists (
          select 1
          from public.platform_companies company
          where company.id = company_setup_workspaces.company_id
            and company.owner_auth_user_id = caller_id
      )
    for update;

    if not found then
        raise exception 'Company setup workspace was not found for the authenticated tenant owner.' using errcode = '42501';
    end if;
    if workspace_row.status = 'COMPLETED' then
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'workspace', to_jsonb(workspace_row)
        );
    end if;
    if workspace_row.status = 'PROVISIONING' then
        raise exception 'Company setup provisioning is already in progress.' using errcode = '22023';
    end if;
    if workspace_row.status <> 'READY_FOR_PROVISION' then
        raise exception
            'Company setup workspace must be READY_FOR_PROVISION before provisioning. Current state is %.',
            workspace_row.status
            using errcode = '22023';
    end if;
    if workspace_row.revision <> p_expected_revision then
        raise exception
            'Company setup revision is stale. Expected %, current %.',
            p_expected_revision,
            workspace_row.revision
            using errcode = '40001';
    end if;

    foreach required_step in array array[
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
        if not workspace_row.completed_steps ? required_step then
            raise exception 'Required company setup step % is incomplete.', required_step using errcode = '22023';
        end if;
        validation_error := private.arth_company_setup_payload_error(
            required_step,
            workspace_row.draft_payload -> required_step
        );
        if validation_error <> '' then
            raise exception '%', validation_error using errcode = '22023';
        end if;
    end loop;

    update public.company_setup_workspaces
    set status = 'PROVISIONING',
        updated_by = caller_id,
        updated_at = now()
    where id = workspace_row.id
    returning * into workspace_row;

    update public.platform_companies
    set status = case when status = 'CONFIGURING' then 'ORG_STRUCTURE' else status end,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = workspace_row.company_id;

    update public.platform_tenant_lifecycle
    set previous_state = state,
        state = case when state = 'CONFIGURING' then 'ORG_STRUCTURE' else state end,
        progress = greatest(progress, 35),
        current_owner_role = 'super_admin',
        next_action = 'CONFIGURE_POLICIES',
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where company_id = workspace_row.company_id
    returning * into lifecycle_row;

    update public.company_setup_workspaces
    set status = 'COMPLETED',
        current_step = 'provisionTenant',
        completed_steps = completed_steps
            || case
                when completed_steps ? 'provisionTenant' then '[]'::jsonb
                else '["provisionTenant"]'::jsonb
            end,
        progress = 100,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = workspace_row.id
    returning * into workspace_row;

    insert into public.platform_lifecycle_events (
        company_id,
        tenant_id,
        organization_id,
        event_type,
        previous_state,
        new_state,
        actor_user_id,
        actor_role,
        reason,
        correlation_id,
        idempotency_key,
        payload
    ) values (
        workspace_row.company_id,
        workspace_row.tenant_id,
        workspace_row.organization_id,
        'OrganizationStructureConfigured',
        lifecycle_row.previous_state,
        lifecycle_row.state,
        caller_id,
        'super_admin',
        'Core organization setup completed.',
        '',
        operation_key,
        jsonb_build_object(
            'workspaceId', workspace_row.id,
            'progress', workspace_row.progress,
            'workspaceStatus', workspace_row.status
        )
    )
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'workspace', to_jsonb(workspace_row),
        'lifecycle', to_jsonb(lifecycle_row)
    );
end
$$;

revoke all on function private.arth_complete_company_core_setup_internal(bigint, text)
from public, anon, authenticated;

alter table public.company_setup_workspaces
enable trigger company_setup_validate_workspace_update;

commit;
