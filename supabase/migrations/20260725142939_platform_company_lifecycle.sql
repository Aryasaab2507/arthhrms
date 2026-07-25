begin;

create or replace function public.arth_platform_role()
returns text
language sql
stable
set search_path = ''
as $$
    select lower(regexp_replace(
        coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', ''),
        '[\s-]+',
        '_',
        'g'
    ))
$$;

create or replace function public.arth_is_platform_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and public.arth_platform_role() = 'platform_owner'
$$;

revoke all on function public.arth_platform_role() from public, anon;
revoke all on function public.arth_is_platform_owner() from public, anon;
grant execute on function public.arth_platform_role() to authenticated;
grant execute on function public.arth_is_platform_owner() to authenticated;

create table if not exists public.platform_companies (
    id uuid primary key default gen_random_uuid(),
    tenant_id text not null unique,
    organization_id text not null unique,
    company_name text not null,
    slug text not null unique,
    status text not null default 'DRAFT',
    company_email text not null default '',
    company_phone text not null default '',
    company_size text not null default '',
    plan_type text not null default 'enterprise',
    timezone text not null default 'Asia/Kolkata',
    country text not null default 'India',
    owner_auth_user_id uuid references auth.users(id) on delete set null,
    owner_email text not null default '',
    revision bigint not null default 0 check (revision >= 0),
    metadata jsonb not null default '{}'::jsonb,
    created_by uuid not null references auth.users(id) on delete restrict,
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_companies_status_chk check (status in (
        'DRAFT', 'PROVISIONED', 'OWNER_INVITED', 'OWNER_ACCEPTED',
        'CONFIGURING', 'ORG_STRUCTURE', 'POLICIES', 'HR_READY',
        'EMPLOYEE_IMPORT', 'VALIDATION', 'READY_FOR_REVIEW',
        'PILOT', 'LIVE', 'SUSPENDED', 'ARCHIVED', 'FAILED'
    )),
    constraint platform_companies_slug_chk check (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
);

create table if not exists public.platform_tenant_lifecycle (
    company_id uuid primary key references public.platform_companies(id) on delete restrict,
    tenant_id text not null unique,
    organization_id text not null unique,
    state text not null,
    previous_state text not null default '',
    progress smallint not null default 0 check (progress between 0 and 100),
    current_owner_role text not null default 'platform_owner',
    next_action text not null default 'PROVISION_TENANT',
    estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
    blockers jsonb not null default '[]'::jsonb,
    revision bigint not null default 0 check (revision >= 0),
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_tenant_lifecycle_state_chk check (state in (
        'DRAFT', 'PROVISIONED', 'OWNER_INVITED', 'OWNER_ACCEPTED',
        'CONFIGURING', 'ORG_STRUCTURE', 'POLICIES', 'HR_READY',
        'EMPLOYEE_IMPORT', 'VALIDATION', 'READY_FOR_REVIEW',
        'PILOT', 'LIVE', 'SUSPENDED', 'ARCHIVED', 'FAILED'
    ))
);

create table if not exists public.platform_lifecycle_events (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.platform_companies(id) on delete restrict,
    tenant_id text not null,
    organization_id text not null,
    event_type text not null,
    previous_state text not null default '',
    new_state text not null,
    actor_user_id uuid not null references auth.users(id) on delete restrict,
    actor_role text not null,
    reason text not null default '',
    correlation_id text not null default '',
    idempotency_key text not null unique,
    payload jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default now()
);

create table if not exists public.platform_company_invitations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.platform_companies(id) on delete restrict,
    tenant_id text not null,
    organization_id text not null,
    email text not null,
    role text not null default 'super_admin',
    status text not null default 'DRAFT',
    auth_user_id uuid references auth.users(id) on delete set null,
    idempotency_key text not null unique,
    redirect_to text not null default '',
    sent_at timestamptz,
    accepted_at timestamptz,
    expires_at timestamptz,
    cancelled_at timestamptz,
    failure_reason text not null default '',
    metadata jsonb not null default '{}'::jsonb,
    created_by uuid not null references auth.users(id) on delete restrict,
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_company_invitations_role_chk check (role = 'super_admin'),
    constraint platform_company_invitations_status_chk check (status in (
        'DRAFT', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED',
        'ACCEPTED', 'ACTIVATED', 'EXPIRED', 'CANCELLED',
        'REVOKED', 'FAILED'
    ))
);

create index if not exists platform_companies_status_updated_idx
on public.platform_companies (status, updated_at desc);
create index if not exists platform_companies_owner_idx
on public.platform_companies (owner_auth_user_id);
create index if not exists platform_lifecycle_events_company_time_idx
on public.platform_lifecycle_events (company_id, occurred_at desc);
create index if not exists platform_lifecycle_events_tenant_time_idx
on public.platform_lifecycle_events (tenant_id, occurred_at desc);
create index if not exists platform_company_invitations_company_time_idx
on public.platform_company_invitations (company_id, created_at desc);
create index if not exists platform_company_invitations_email_idx
on public.platform_company_invitations (lower(email), created_at desc);

alter table public.platform_companies enable row level security;
alter table public.platform_companies force row level security;
alter table public.platform_tenant_lifecycle enable row level security;
alter table public.platform_tenant_lifecycle force row level security;
alter table public.platform_lifecycle_events enable row level security;
alter table public.platform_lifecycle_events force row level security;
alter table public.platform_company_invitations enable row level security;
alter table public.platform_company_invitations force row level security;

revoke all on public.platform_companies from public, anon, authenticated;
revoke all on public.platform_tenant_lifecycle from public, anon, authenticated;
revoke all on public.platform_lifecycle_events from public, anon, authenticated;
revoke all on public.platform_company_invitations from public, anon, authenticated;

grant select on public.platform_companies to authenticated;
grant select on public.platform_tenant_lifecycle to authenticated;
grant select on public.platform_lifecycle_events to authenticated;
grant select on public.platform_company_invitations to authenticated;

drop policy if exists platform_companies_owner_select on public.platform_companies;
create policy platform_companies_owner_select
on public.platform_companies for select to authenticated
using (public.arth_is_platform_owner());

drop policy if exists platform_tenant_lifecycle_owner_select on public.platform_tenant_lifecycle;
create policy platform_tenant_lifecycle_owner_select
on public.platform_tenant_lifecycle for select to authenticated
using (public.arth_is_platform_owner());

drop policy if exists platform_lifecycle_events_owner_select on public.platform_lifecycle_events;
create policy platform_lifecycle_events_owner_select
on public.platform_lifecycle_events for select to authenticated
using (public.arth_is_platform_owner());

drop policy if exists platform_company_invitations_owner_select on public.platform_company_invitations;
create policy platform_company_invitations_owner_select
on public.platform_company_invitations for select to authenticated
using (public.arth_is_platform_owner());

create or replace function public.arth_platform_state_transition_allowed(
    current_state text,
    requested_state text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case upper(coalesce(current_state, ''))
        when 'DRAFT' then upper(coalesce(requested_state, '')) in ('PROVISIONED', 'ARCHIVED', 'FAILED')
        when 'PROVISIONED' then upper(coalesce(requested_state, '')) in ('OWNER_INVITED', 'ARCHIVED', 'FAILED')
        when 'OWNER_INVITED' then upper(coalesce(requested_state, '')) in ('OWNER_ACCEPTED', 'ARCHIVED', 'FAILED')
        when 'OWNER_ACCEPTED' then upper(coalesce(requested_state, '')) in ('CONFIGURING', 'SUSPENDED')
        when 'CONFIGURING' then upper(coalesce(requested_state, '')) in ('ORG_STRUCTURE', 'SUSPENDED')
        when 'ORG_STRUCTURE' then upper(coalesce(requested_state, '')) in ('POLICIES', 'CONFIGURING', 'SUSPENDED')
        when 'POLICIES' then upper(coalesce(requested_state, '')) in ('HR_READY', 'ORG_STRUCTURE', 'SUSPENDED')
        when 'HR_READY' then upper(coalesce(requested_state, '')) in ('EMPLOYEE_IMPORT', 'POLICIES', 'SUSPENDED')
        when 'EMPLOYEE_IMPORT' then upper(coalesce(requested_state, '')) in ('VALIDATION', 'HR_READY', 'SUSPENDED')
        when 'VALIDATION' then upper(coalesce(requested_state, '')) in ('READY_FOR_REVIEW', 'EMPLOYEE_IMPORT', 'SUSPENDED')
        when 'READY_FOR_REVIEW' then upper(coalesce(requested_state, '')) in ('PILOT', 'VALIDATION', 'SUSPENDED')
        when 'PILOT' then upper(coalesce(requested_state, '')) in ('LIVE', 'CONFIGURING', 'SUSPENDED')
        when 'LIVE' then upper(coalesce(requested_state, '')) in ('SUSPENDED', 'ARCHIVED')
        when 'SUSPENDED' then upper(coalesce(requested_state, '')) in ('CONFIGURING', 'PILOT', 'LIVE', 'ARCHIVED')
        when 'FAILED' then upper(coalesce(requested_state, '')) in ('DRAFT', 'ARCHIVED')
        else false
    end
$$;

revoke all on function public.arth_platform_state_transition_allowed(text, text) from public, anon;
grant execute on function public.arth_platform_state_transition_allowed(text, text) to authenticated;

create or replace function public.arth_platform_create_company(
    p_company_name text,
    p_slug text,
    p_tenant_id text,
    p_organization_id text,
    p_company_email text,
    p_company_phone text,
    p_company_size text,
    p_plan_type text,
    p_timezone text,
    p_country text,
    p_idempotency_key text,
    p_correlation_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    company_row public.platform_companies%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    existing_event public.platform_lifecycle_events%rowtype;
    normalized_slug text := lower(trim(coalesce(p_slug, '')));
    normalized_tenant text := lower(trim(coalesce(p_tenant_id, '')));
    normalized_organization text := trim(coalesce(p_organization_id, ''));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
begin
    if caller_id is null or not public.arth_is_platform_owner() then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_company_name, ''))) < 2 then
        raise exception 'A valid company name is required.' using errcode = '22023';
    end if;
    if normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception 'A valid tenant slug is required.' using errcode = '22023';
    end if;
    if normalized_tenant = '' or normalized_organization = '' or operation_key = '' then
        raise exception 'Tenant, organization, and idempotency identifiers are required.' using errcode = '22023';
    end if;

    select *
    into existing_event
    from public.platform_lifecycle_events
    where idempotency_key = operation_key
    limit 1;

    if found then
        select * into company_row
        from public.platform_companies
        where id = existing_event.company_id;
        if company_row.slug <> normalized_slug
           or company_row.tenant_id <> normalized_tenant
           or company_row.organization_id <> normalized_organization then
            raise exception 'Idempotency key is already assigned to another company operation.' using errcode = '22023';
        end if;
        select * into lifecycle_row
        from public.platform_tenant_lifecycle
        where company_id = existing_event.company_id;
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'company', to_jsonb(company_row),
            'lifecycle', to_jsonb(lifecycle_row)
        );
    end if;

    insert into public.platform_companies (
        tenant_id, organization_id, company_name, slug, status,
        company_email, company_phone, company_size, plan_type,
        timezone, country, metadata, created_by, updated_by
    ) values (
        normalized_tenant,
        normalized_organization,
        trim(p_company_name),
        normalized_slug,
        'DRAFT',
        lower(trim(coalesce(p_company_email, ''))),
        trim(coalesce(p_company_phone, '')),
        trim(coalesce(p_company_size, '')),
        lower(trim(coalesce(p_plan_type, 'enterprise'))),
        trim(coalesce(p_timezone, 'Asia/Kolkata')),
        trim(coalesce(p_country, 'India')),
        jsonb_build_object(
            'employeeRecordsCreated', false,
            'platformOwnerInTenantHierarchy', false,
            'tenantIsolationPreserved', true
        ),
        caller_id,
        caller_id
    )
    returning * into company_row;

    insert into public.platform_tenant_lifecycle (
        company_id, tenant_id, organization_id, state, progress,
        current_owner_role, next_action, estimated_minutes, updated_by
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        'DRAFT',
        0,
        'platform_owner',
        'PROVISION_TENANT',
        10,
        caller_id
    )
    returning * into lifecycle_row;

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        'CompanyCreated',
        '',
        'DRAFT',
        caller_id,
        'platform_owner',
        'Company registry record created.',
        trim(coalesce(p_correlation_id, '')),
        operation_key,
        jsonb_build_object('companyName', company_row.company_name, 'slug', company_row.slug)
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'company', to_jsonb(company_row),
        'lifecycle', to_jsonb(lifecycle_row)
    );
end
$$;

revoke all on function public.arth_platform_create_company(
    text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.arth_platform_create_company(
    text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.arth_platform_transition_company(
    p_company_id uuid,
    p_expected_revision bigint,
    p_new_state text,
    p_reason text,
    p_idempotency_key text,
    p_correlation_id text default '',
    p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    company_row public.platform_companies%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    existing_event public.platform_lifecycle_events%rowtype;
    requested_state text := upper(trim(coalesce(p_new_state, '')));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    event_name text;
    next_progress smallint;
    next_owner_value text;
    next_action_value text;
begin
    if caller_id is null or not public.arth_is_platform_owner() then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;
    if operation_key = '' then
        raise exception 'An idempotency key is required.' using errcode = '22023';
    end if;

    select *
    into existing_event
    from public.platform_lifecycle_events
    where idempotency_key = operation_key
    limit 1;

    if found then
        if existing_event.company_id <> p_company_id
           or existing_event.new_state <> requested_state then
            raise exception 'Idempotency key is already assigned to another lifecycle transition.' using errcode = '22023';
        end if;
        select * into company_row
        from public.platform_companies
        where id = existing_event.company_id;
        select * into lifecycle_row
        from public.platform_tenant_lifecycle
        where company_id = existing_event.company_id;
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'company', to_jsonb(company_row),
            'lifecycle', to_jsonb(lifecycle_row)
        );
    end if;

    select *
    into company_row
    from public.platform_companies
    where id = p_company_id
    for update;

    if not found then
        raise exception 'Company was not found.' using errcode = 'P0002';
    end if;
    if company_row.revision <> p_expected_revision then
        raise exception 'Company lifecycle revision is stale.' using errcode = '40001';
    end if;
    if not public.arth_platform_state_transition_allowed(company_row.status, requested_state) then
        raise exception 'The requested company lifecycle transition is not allowed.' using errcode = '22023';
    end if;

    select *
    into lifecycle_row
    from public.platform_tenant_lifecycle
    where company_id = company_row.id
    for update;

    if not found then
        raise exception 'Company lifecycle record was not found.' using errcode = 'P0002';
    end if;

    next_progress := case requested_state
        when 'DRAFT' then 0 when 'PROVISIONED' then 8 when 'OWNER_INVITED' then 12
        when 'OWNER_ACCEPTED' then 18 when 'CONFIGURING' then 25
        when 'ORG_STRUCTURE' then 35 when 'POLICIES' then 50
        when 'HR_READY' then 62 when 'EMPLOYEE_IMPORT' then 72
        when 'VALIDATION' then 82 when 'READY_FOR_REVIEW' then 90
        when 'PILOT' then 96 when 'LIVE' then 100 else lifecycle_row.progress end;
    next_owner_value := case
        when requested_state in ('DRAFT', 'PROVISIONED', 'OWNER_INVITED') then 'platform_owner'
        when requested_state in ('OWNER_ACCEPTED', 'CONFIGURING', 'ORG_STRUCTURE', 'READY_FOR_REVIEW') then 'super_admin'
        when requested_state in ('POLICIES', 'HR_READY', 'EMPLOYEE_IMPORT', 'VALIDATION') then 'hr'
        else 'platform_owner'
    end;
    next_action_value := case requested_state
        when 'PROVISIONED' then 'INVITE_COMPANY_OWNER'
        when 'OWNER_INVITED' then 'WAIT_FOR_OWNER_ACCEPTANCE'
        when 'OWNER_ACCEPTED' then 'BEGIN_COMPANY_SETUP'
        when 'CONFIGURING' then 'COMPLETE_ORGANIZATION_STRUCTURE'
        when 'ORG_STRUCTURE' then 'CONFIGURE_POLICIES'
        when 'POLICIES' then 'INVITE_HR_ADMIN'
        when 'HR_READY' then 'IMPORT_EMPLOYEES'
        when 'EMPLOYEE_IMPORT' then 'VALIDATE_EMPLOYEE_DATA'
        when 'VALIDATION' then 'RUN_READINESS_REVIEW'
        when 'READY_FOR_REVIEW' then 'APPROVE_PILOT'
        when 'PILOT' then 'APPROVE_GO_LIVE'
        when 'LIVE' then 'MONITOR_PRODUCTION'
        else 'REVIEW_LIFECYCLE'
    end;
    event_name := case requested_state
        when 'PROVISIONED' then 'TenantProvisioned'
        when 'OWNER_INVITED' then 'CompanyOwnerInvited'
        when 'OWNER_ACCEPTED' then 'InvitationAccepted'
        when 'PILOT' then 'PilotActivated'
        when 'LIVE' then 'CompanyActivated'
        when 'ARCHIVED' then 'CompanyArchived'
        else 'TenantLifecycleTransitioned'
    end;

    update public.platform_companies
    set status = requested_state,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = company_row.id
    returning * into company_row;

    update public.platform_tenant_lifecycle
    set previous_state = state,
        state = requested_state,
        progress = next_progress,
        current_owner_role = next_owner_value,
        next_action = next_action_value,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where company_id = company_row.id
    returning * into lifecycle_row;

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        event_name,
        lifecycle_row.previous_state,
        requested_state,
        caller_id,
        'platform_owner',
        trim(coalesce(p_reason, '')),
        trim(coalesce(p_correlation_id, '')),
        operation_key,
        coalesce(p_payload, '{}'::jsonb)
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'company', to_jsonb(company_row),
        'lifecycle', to_jsonb(lifecycle_row)
    );
end
$$;

revoke all on function public.arth_platform_transition_company(
    uuid, bigint, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.arth_platform_transition_company(
    uuid, bigint, text, text, text, text, jsonb
) to authenticated;

create or replace function public.arth_platform_record_owner_invite(
    p_company_id uuid,
    p_email text,
    p_auth_user_id uuid,
    p_redirect_to text,
    p_expires_at timestamptz,
    p_idempotency_key text,
    p_actor_user_id uuid,
    p_correlation_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    company_row public.platform_companies%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    invitation_row public.platform_company_invitations%rowtype;
    existing_invitation public.platform_company_invitations%rowtype;
    normalized_email text := lower(trim(coalesce(p_email, '')));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
begin
    if p_actor_user_id is null or p_auth_user_id is null or operation_key = '' then
        raise exception 'Owner invitation identity and idempotency values are required.' using errcode = '22023';
    end if;
    if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'A valid Company Owner email is required.' using errcode = '22023';
    end if;

    select *
    into existing_invitation
    from public.platform_company_invitations
    where idempotency_key = operation_key
    limit 1;

    if found then
        if existing_invitation.company_id <> p_company_id
           or existing_invitation.email <> normalized_email
           or existing_invitation.auth_user_id <> p_auth_user_id then
            raise exception 'Idempotency key is already assigned to another owner invitation.' using errcode = '22023';
        end if;
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'invitation', to_jsonb(existing_invitation)
        );
    end if;

    select *
    into company_row
    from public.platform_companies
    where id = p_company_id
    for update;

    if not found then
        raise exception 'Company was not found.' using errcode = 'P0002';
    end if;
    if company_row.status not in ('PROVISIONED', 'OWNER_INVITED') then
        raise exception 'Company Owner can be invited only after provisioning.' using errcode = '22023';
    end if;

    insert into public.platform_company_invitations (
        company_id, tenant_id, organization_id, email, role, status,
        auth_user_id, idempotency_key, redirect_to, sent_at, expires_at,
        metadata, created_by, updated_by
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        normalized_email,
        'super_admin',
        'SENT',
        p_auth_user_id,
        operation_key,
        trim(coalesce(p_redirect_to, '')),
        now(),
        p_expires_at,
        jsonb_build_object('persona', 'company_owner', 'delivery', 'supabase_invite'),
        p_actor_user_id,
        p_actor_user_id
    )
    returning * into invitation_row;

    update public.platform_companies
    set status = 'OWNER_INVITED',
        owner_auth_user_id = p_auth_user_id,
        owner_email = normalized_email,
        revision = revision + 1,
        updated_by = p_actor_user_id,
        updated_at = now()
    where id = company_row.id
    returning * into company_row;

    update public.platform_tenant_lifecycle
    set previous_state = state,
        state = 'OWNER_INVITED',
        progress = 12,
        current_owner_role = 'platform_owner',
        next_action = 'WAIT_FOR_OWNER_ACCEPTANCE',
        revision = revision + 1,
        updated_by = p_actor_user_id,
        updated_at = now()
    where company_id = company_row.id
    returning * into lifecycle_row;

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        'CompanyOwnerInvited',
        lifecycle_row.previous_state,
        'OWNER_INVITED',
        p_actor_user_id,
        'platform_owner',
        'Company Owner invitation sent.',
        trim(coalesce(p_correlation_id, '')),
        operation_key || ':event',
        jsonb_build_object(
            'invitationId', invitation_row.id,
            'ownerEmail', normalized_email,
            'authUserId', p_auth_user_id
        )
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'company', to_jsonb(company_row),
        'lifecycle', to_jsonb(lifecycle_row),
        'invitation', to_jsonb(invitation_row)
    );
end
$$;

revoke all on function public.arth_platform_record_owner_invite(
    uuid, text, uuid, text, timestamptz, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.arth_platform_record_owner_invite(
    uuid, text, uuid, text, timestamptz, text, uuid, text
) to service_role;

create or replace function public.arth_complete_company_owner_activation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    claims jsonb := (select auth.jwt());
    metadata jsonb := coalesce(claims -> 'app_metadata', '{}'::jsonb);
    caller_role text := lower(regexp_replace(coalesce(metadata ->> 'role', ''), '[\s-]+', '_', 'g'));
    caller_tenant text := lower(regexp_replace(
        coalesce(metadata ->> 'tenantSlug', metadata ->> 'tenant_slug', metadata ->> 'tenantId', metadata ->> 'tenant_id', ''),
        '[^a-z0-9]+',
        '-',
        'g'
    ));
    caller_organization text := coalesce(metadata ->> 'organizationId', metadata ->> 'organization_id', '');
    onboarding_method text := lower(coalesce(metadata ->> 'onboarding_method', ''));
    company_row public.platform_companies%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    invitation_row public.platform_company_invitations%rowtype;
    activation_key text;
begin
    if caller_id is null then
        raise exception 'Authenticated user is required.' using errcode = '42501';
    end if;
    if caller_role <> 'super_admin'
       or onboarding_method <> 'company_owner_invite'
       or coalesce(metadata ->> 'company_owner', 'false') <> 'true' then
        raise exception 'Company Owner invitation claims are invalid.' using errcode = '42501';
    end if;
    if caller_tenant = '' or caller_organization = '' then
        raise exception 'Trusted tenant and organization claims are required.' using errcode = '42501';
    end if;

    select *
    into invitation_row
    from public.platform_company_invitations
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and auth_user_id = caller_id
      and status in ('SENT', 'DELIVERED', 'OPENED', 'ACCEPTED', 'ACTIVATED')
    order by created_at desc
    limit 1
    for update;

    if not found then
        raise exception 'No matching Company Owner invitation exists.' using errcode = '42501';
    end if;

    if invitation_row.status = 'ACTIVATED' then
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'companyId', invitation_row.company_id,
            'invitationId', invitation_row.id,
            'state', 'OWNER_ACCEPTED'
        );
    end if;
    if invitation_row.expires_at is not null and invitation_row.expires_at < now() then
        update public.platform_company_invitations
        set status = 'EXPIRED', updated_by = caller_id, updated_at = now()
        where id = invitation_row.id;
        return jsonb_build_object(
            'ok', false,
            'replayed', false,
            'code', 'COMPANY_OWNER_INVITE_EXPIRED',
            'message', 'Company Owner invitation has expired.',
            'companyId', invitation_row.company_id,
            'invitationId', invitation_row.id
        );
    end if;

    select *
    into company_row
    from public.platform_companies
    where id = invitation_row.company_id
    for update;

    if not found
       or company_row.tenant_id <> caller_tenant
       or company_row.organization_id <> caller_organization then
        raise exception 'Company Owner tenant scope is invalid.' using errcode = '42501';
    end if;
    if company_row.status not in ('OWNER_INVITED', 'OWNER_ACCEPTED') then
        raise exception 'Company is not waiting for owner activation.' using errcode = '22023';
    end if;

    update public.platform_company_invitations
    set status = 'ACTIVATED',
        accepted_at = coalesce(accepted_at, now()),
        updated_by = caller_id,
        updated_at = now(),
        failure_reason = ''
    where id = invitation_row.id
    returning * into invitation_row;

    update public.platform_companies
    set status = 'OWNER_ACCEPTED',
        owner_auth_user_id = caller_id,
        owner_email = invitation_row.email,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = company_row.id
    returning * into company_row;

    update public.platform_tenant_lifecycle
    set previous_state = state,
        state = 'OWNER_ACCEPTED',
        progress = 18,
        current_owner_role = 'super_admin',
        next_action = 'BEGIN_COMPANY_SETUP',
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where company_id = company_row.id
    returning * into lifecycle_row;

    activation_key := 'company-owner-activation:' || caller_id::text;
    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        'InvitationAccepted',
        lifecycle_row.previous_state,
        'OWNER_ACCEPTED',
        caller_id,
        'super_admin',
        'Company Owner invitation accepted.',
        '',
        activation_key,
        jsonb_build_object('invitationId', invitation_row.id, 'persona', 'company_owner')
    )
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'companyId', company_row.id,
        'invitationId', invitation_row.id,
        'state', 'OWNER_ACCEPTED',
        'nextAction', 'BEGIN_COMPANY_SETUP'
    );
end
$$;

revoke all on function public.arth_complete_company_owner_activation() from public, anon;
grant execute on function public.arth_complete_company_owner_activation() to authenticated;

commit;
