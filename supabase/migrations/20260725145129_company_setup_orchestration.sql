begin;

create table if not exists public.company_setup_workspaces (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null unique references public.platform_companies(id) on delete restrict,
    tenant_id text not null unique,
    organization_id text not null unique,
    status text not null default 'DRAFT',
    current_step text not null default 'organizationInformation',
    completed_steps jsonb not null default '[]'::jsonb,
    progress smallint not null default 0 check (progress between 0 and 100),
    draft_payload jsonb not null default '{}'::jsonb,
    revision bigint not null default 0 check (revision >= 0),
    created_by uuid not null references auth.users(id) on delete restrict,
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_setup_workspace_status_chk check (
        status in ('DRAFT', 'IN_PROGRESS', 'CORE_SETUP_COMPLETE', 'ARCHIVED')
    ),
    constraint company_setup_completed_steps_array_chk check (
        jsonb_typeof(completed_steps) = 'array'
    ),
    constraint company_setup_draft_payload_object_chk check (
        jsonb_typeof(draft_payload) = 'object'
    )
);

create table if not exists public.company_setup_step_versions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.company_setup_workspaces(id) on delete restrict,
    company_id uuid not null references public.platform_companies(id) on delete restrict,
    tenant_id text not null,
    organization_id text not null,
    step_key text not null,
    step_version bigint not null check (step_version > 0),
    payload jsonb not null,
    actor_user_id uuid not null references auth.users(id) on delete restrict,
    actor_role text not null,
    idempotency_key text not null unique,
    created_at timestamptz not null default now(),
    constraint company_setup_step_payload_object_chk check (
        jsonb_typeof(payload) = 'object'
    ),
    unique (workspace_id, step_key, step_version)
);

create index if not exists company_setup_workspaces_status_idx
on public.company_setup_workspaces (status, updated_at desc);
create index if not exists company_setup_step_versions_workspace_idx
on public.company_setup_step_versions (workspace_id, created_at desc);
create index if not exists company_setup_step_versions_tenant_idx
on public.company_setup_step_versions (tenant_id, created_at desc);

alter table public.company_setup_workspaces enable row level security;
alter table public.company_setup_workspaces force row level security;
alter table public.company_setup_step_versions enable row level security;
alter table public.company_setup_step_versions force row level security;

revoke all on public.company_setup_workspaces from public, anon, authenticated;
revoke all on public.company_setup_step_versions from public, anon, authenticated;
grant select on public.company_setup_workspaces to authenticated;
grant select on public.company_setup_step_versions to authenticated;

drop policy if exists company_setup_workspace_tenant_read on public.company_setup_workspaces;
create policy company_setup_workspace_tenant_read
on public.company_setup_workspaces for select to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and public.arth_persistence_role() in ('super_admin', 'admin', 'hr', 'hr_head')
);

drop policy if exists company_setup_versions_tenant_read on public.company_setup_step_versions;
create policy company_setup_versions_tenant_read
on public.company_setup_step_versions for select to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and public.arth_persistence_role() in ('super_admin', 'admin', 'hr', 'hr_head')
);

create or replace function public.arth_company_setup_step_allowed(step_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(step_key, '') in (
        'organizationInformation',
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

create or replace function public.arth_get_or_create_company_setup()
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
        'organizationInformation',
        '[]'::jsonb,
        0,
        jsonb_build_object(
            'organizationInformation',
            jsonb_build_object(
                'companyName', company_row.company_name,
                'organizationCode', upper(replace(company_row.slug, '-', '_')),
                'companySize', company_row.company_size,
                'timeZone', company_row.timezone,
                'currency', 'INR'
            )
        ),
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
            'Company Owner opened the tenant setup workspace.',
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

revoke all on function public.arth_get_or_create_company_setup() from public, anon;
grant execute on function public.arth_get_or_create_company_setup() to authenticated;

create or replace function public.arth_save_company_setup_step(
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
        select * into workspace_row
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
        raise exception 'Company setup workspace was not found.' using errcode = '42501';
    end if;
    if workspace_row.status not in ('DRAFT', 'IN_PROGRESS') then
        raise exception 'Company setup workspace is not editable.' using errcode = '22023';
    end if;
    if workspace_row.revision <> p_expected_revision then
        raise exception 'Company setup revision is stale.' using errcode = '40001';
    end if;

    next_completed := coalesce(workspace_row.completed_steps, '[]'::jsonb);
    if p_complete and not next_completed ? normalized_step then
        next_completed := next_completed || jsonb_build_array(normalized_step);
    end if;
    next_progress := least(100, round((jsonb_array_length(next_completed)::numeric / 10::numeric) * 100)::smallint);
    next_step := case normalized_step
        when 'organizationInformation' then 'organizationStructure'
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

    insert into public.company_setup_step_versions (
        workspace_id, company_id, tenant_id, organization_id,
        step_key, step_version, payload, actor_user_id, actor_role,
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
    set status = 'IN_PROGRESS',
        current_step = next_step,
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
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        workspace_row.company_id,
        workspace_row.tenant_id,
        workspace_row.organization_id,
        'CompanySetupStepSaved',
        'CONFIGURING',
        'CONFIGURING',
        caller_id,
        'super_admin',
        'Company setup progress saved.',
        '',
        operation_key || ':event',
        jsonb_build_object(
            'workspaceId', workspace_row.id,
            'stepKey', normalized_step,
            'stepVersion', version_row.step_version,
            'progress', workspace_row.progress
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

revoke all on function public.arth_save_company_setup_step(text, jsonb, bigint, text, boolean) from public, anon;
grant execute on function public.arth_save_company_setup_step(text, jsonb, bigint, text, boolean) to authenticated;

create or replace function public.arth_complete_company_core_setup(
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
        raise exception 'Company setup workspace was not found.' using errcode = '42501';
    end if;
    if workspace_row.status = 'CORE_SETUP_COMPLETE' then
        return jsonb_build_object('ok', true, 'replayed', true, 'workspace', to_jsonb(workspace_row));
    end if;
    if workspace_row.revision <> p_expected_revision then
        raise exception 'Company setup revision is stale.' using errcode = '40001';
    end if;

    foreach required_step in array array[
        'organizationInformation',
        'organizationStructure',
        'workingConfiguration',
        'leaveConfiguration',
        'payrollConfiguration',
        'identitySecurity',
        'notifications',
        'administrator'
    ]
    loop
        if not workspace_row.completed_steps ? required_step then
            raise exception 'Required company setup steps are incomplete.' using errcode = '22023';
        end if;
    end loop;

    update public.company_setup_workspaces
    set status = 'CORE_SETUP_COMPLETE',
        current_step = 'provisionTenant',
        completed_steps = completed_steps
            || case when completed_steps ? 'review' then '[]'::jsonb else '["review"]'::jsonb end
            || case when completed_steps ? 'provisionTenant' then '[]'::jsonb else '["provisionTenant"]'::jsonb end,
        progress = 100,
        revision = revision + 1,
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

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        workspace_row.company_id,
        workspace_row.tenant_id,
        workspace_row.organization_id,
        'OrganizationStructureConfigured',
        lifecycle_row.previous_state,
        lifecycle_row.state,
        caller_id,
        'super_admin',
        'Core company setup completed.',
        '',
        operation_key,
        jsonb_build_object('workspaceId', workspace_row.id, 'progress', 100)
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

revoke all on function public.arth_complete_company_core_setup(bigint, text) from public, anon;
grant execute on function public.arth_complete_company_core_setup(bigint, text) to authenticated;

commit;
