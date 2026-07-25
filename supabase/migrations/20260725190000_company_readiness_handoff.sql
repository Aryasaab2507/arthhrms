begin;

create table if not exists public.platform_company_readiness_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.platform_companies(id) on delete restrict,
    tenant_id text not null,
    organization_id text not null,
    validation_run_id text not null,
    readiness_score numeric(5,2) not null check (readiness_score between 0 and 100),
    status text not null default 'PENDING_REVIEW',
    requested_by uuid not null references auth.users(id) on delete restrict,
    requested_at timestamptz not null default now(),
    reviewed_by uuid references auth.users(id) on delete restrict,
    reviewed_at timestamptz,
    review_reason text not null default '',
    revision bigint not null default 0 check (revision >= 0),
    evidence_digest text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_company_readiness_status_chk check (
        status in ('PENDING_REVIEW', 'PILOT_ACTIVE', 'RETURNED', 'CANCELLED')
    ),
    constraint platform_company_readiness_metadata_chk check (
        jsonb_typeof(metadata) = 'object'
    )
);

create unique index if not exists platform_company_readiness_active_idx
on public.platform_company_readiness_requests (company_id)
where status in ('PENDING_REVIEW', 'PILOT_ACTIVE');

create index if not exists platform_company_readiness_tenant_idx
on public.platform_company_readiness_requests (tenant_id, requested_at desc);

create index if not exists platform_company_readiness_status_idx
on public.platform_company_readiness_requests (status, requested_at desc);

alter table public.platform_company_readiness_requests enable row level security;
alter table public.platform_company_readiness_requests force row level security;

revoke all on public.platform_company_readiness_requests from public, anon, authenticated;
grant select on public.platform_company_readiness_requests to authenticated;

drop policy if exists platform_company_readiness_platform_read on public.platform_company_readiness_requests;
create policy platform_company_readiness_platform_read
on public.platform_company_readiness_requests for select to authenticated
using (public.arth_is_platform_owner());

drop policy if exists platform_company_readiness_owner_read on public.platform_company_readiness_requests;
create policy platform_company_readiness_owner_read
on public.platform_company_readiness_requests for select to authenticated
using (
    public.arth_persistence_role() = 'super_admin'
    and public.arth_persistence_tenant_allowed(tenant_id)
    and requested_by = (select auth.uid())
);

create or replace function public.arth_submit_company_readiness_review(
    p_validation_run_id text,
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
    caller_tenant text := coalesce((select auth.jwt()) -> 'app_metadata' ->> 'tenant_id', '');
    caller_organization text := coalesce((select auth.jwt()) -> 'app_metadata' ->> 'organization_id', '');
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    company_row public.platform_companies%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    readiness_row public.platform_company_readiness_requests%rowtype;
    validation_payload jsonb;
    validation_score numeric(5,2);
    validation_status text;
    stage_path text[] := array[
        'CONFIGURING',
        'ORG_STRUCTURE',
        'POLICIES',
        'HR_READY',
        'EMPLOYEE_IMPORT',
        'VALIDATION',
        'READY_FOR_REVIEW'
    ];
    stage_progress integer[] := array[25, 35, 45, 55, 70, 82, 90];
    stage_next_action text[] := array[
        'CONFIGURE_ORGANIZATION',
        'CONFIGURE_POLICIES',
        'CREATE_HR_ADMIN',
        'IMPORT_EMPLOYEES',
        'VALIDATE_EMPLOYEE_DATA',
        'SUBMIT_FOR_REVIEW',
        'REVIEW_PILOT_REQUEST'
    ];
    current_index integer := 0;
    stage_index integer;
    prior_state text;
begin
    if caller_id is null or caller_role <> 'super_admin' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;
    if caller_tenant = '' or caller_organization = '' then
        raise exception 'Trusted tenant and organization claims are required.' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_validation_run_id, ''))) < 8 then
        raise exception 'A valid validation run is required.' using errcode = '22023';
    end if;
    if length(operation_key) < 8 or length(operation_key) > 200 then
        raise exception 'A valid idempotency key is required.' using errcode = '22023';
    end if;

    select *
    into company_row
    from public.platform_companies
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and owner_auth_user_id = caller_id
    for update;

    if not found then
        raise exception 'The authenticated user is not the Company Owner for this tenant.' using errcode = '42501';
    end if;

    select record.payload
    into validation_payload
    from public.hrms_governance_records record
    where record.tenant_id = caller_tenant
      and record.organization_id = caller_organization
      and record.record_type = 'goLiveValidationRuns'
      and record.payload ->> 'runId' = trim(p_validation_run_id)
    order by record.updated_at desc
    limit 1;

    if validation_payload is null then
        raise exception 'The durable validation run was not found.' using errcode = '22023';
    end if;

    validation_status := upper(coalesce(validation_payload ->> 'status', ''));
    validation_score := coalesce(
        nullif(validation_payload ->> 'readinessScore', '')::numeric,
        nullif(validation_payload -> 'scores' ->> 'overallReadinessScore', '')::numeric,
        0
    );

    if validation_status <> 'READY_FOR_APPROVAL'
       or coalesce((validation_payload ->> 'certificationEligible')::boolean, false) is not true
       or jsonb_array_length(coalesce(validation_payload -> 'blockingIssues', '[]'::jsonb)) > 0 then
        raise exception 'A passing validation run without blocking issues is required.' using errcode = '22023';
    end if;

    select *
    into readiness_row
    from public.platform_company_readiness_requests
    where metadata ->> 'idempotencyKey' = operation_key
    limit 1;

    if found then
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'request', to_jsonb(readiness_row)
        );
    end if;

    if exists (
        select 1
        from public.platform_company_readiness_requests request
        where request.company_id = company_row.id
          and request.status in ('PENDING_REVIEW', 'PILOT_ACTIVE')
    ) then
        raise exception 'An active readiness request already exists.' using errcode = '23505';
    end if;

    select *
    into lifecycle_row
    from public.platform_tenant_lifecycle
    where company_id = company_row.id
    for update;

    if not found then
        raise exception 'Tenant lifecycle was not found.' using errcode = '22023';
    end if;
    if lifecycle_row.state in ('PILOT', 'LIVE') then
        raise exception 'The tenant is already in pilot or production.' using errcode = '22023';
    end if;

    current_index := coalesce(array_position(stage_path, lifecycle_row.state), 0);
    if current_index < array_length(stage_path, 1) then
        for stage_index in (current_index + 1)..array_length(stage_path, 1)
        loop
            prior_state := lifecycle_row.state;

            update public.platform_companies
            set status = stage_path[stage_index],
                revision = revision + 1,
                updated_by = caller_id,
                updated_at = now()
            where id = company_row.id;

            update public.platform_tenant_lifecycle
            set previous_state = prior_state,
                state = stage_path[stage_index],
                progress = greatest(progress, stage_progress[stage_index]),
                current_owner_role = case
                    when stage_path[stage_index] = 'READY_FOR_REVIEW' then 'platform_owner'
                    else 'super_admin'
                end,
                next_action = stage_next_action[stage_index],
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
                caller_tenant,
                caller_organization,
                case stage_path[stage_index]
                    when 'VALIDATION' then 'CompanyValidationCompleted'
                    when 'READY_FOR_REVIEW' then 'CompanyReadinessSubmitted'
                    else 'CompanyOnboardingProgressed'
                end,
                prior_state,
                stage_path[stage_index],
                caller_id,
                caller_role,
                'Company readiness requirements completed.',
                '',
                operation_key || ':' || lower(stage_path[stage_index]),
                jsonb_build_object(
                    'validationRunId', trim(p_validation_run_id),
                    'readinessScore', validation_score
                )
            )
            on conflict (idempotency_key) do nothing;
        end loop;
    end if;

    insert into public.platform_company_readiness_requests (
        company_id,
        tenant_id,
        organization_id,
        validation_run_id,
        readiness_score,
        requested_by,
        evidence_digest,
        metadata
    ) values (
        company_row.id,
        caller_tenant,
        caller_organization,
        trim(p_validation_run_id),
        validation_score,
        caller_id,
        encode(extensions.digest(validation_payload::text, 'sha256'), 'hex'),
        jsonb_build_object(
            'idempotencyKey', operation_key,
            'validationStatus', validation_status
        )
    )
    returning * into readiness_row;

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'request', to_jsonb(readiness_row),
        'lifecycle', to_jsonb(lifecycle_row)
    );
end
$$;

revoke all on function public.arth_submit_company_readiness_review(text, text) from public, anon;
grant execute on function public.arth_submit_company_readiness_review(text, text) to authenticated;

create or replace function public.arth_review_company_pilot_request(
    p_request_id uuid,
    p_decision text,
    p_reason text,
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
    decision text := upper(trim(coalesce(p_decision, '')));
    reason_text text := trim(coalesce(p_reason, ''));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    readiness_row public.platform_company_readiness_requests%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    target_state text;
    target_status text;
begin
    if caller_id is null or not public.arth_is_platform_owner() then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;
    if decision not in ('APPROVE', 'RETURN') then
        raise exception 'Decision must be APPROVE or RETURN.' using errcode = '22023';
    end if;
    if length(reason_text) < 10 or length(reason_text) > 500 then
        raise exception 'A review reason between 10 and 500 characters is required.' using errcode = '22023';
    end if;
    if length(operation_key) < 8 or length(operation_key) > 200 then
        raise exception 'A valid idempotency key is required.' using errcode = '22023';
    end if;

    select *
    into readiness_row
    from public.platform_company_readiness_requests
    where id = p_request_id
    for update;

    if not found then
        raise exception 'Readiness request was not found.' using errcode = '22023';
    end if;
    if readiness_row.metadata ->> 'reviewIdempotencyKey' = operation_key then
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'request', to_jsonb(readiness_row)
        );
    end if;
    if readiness_row.status <> 'PENDING_REVIEW' then
        raise exception 'Only pending readiness requests can be reviewed.' using errcode = '22023';
    end if;
    if readiness_row.revision <> p_expected_revision then
        raise exception 'Readiness request revision is stale.' using errcode = '40001';
    end if;

    select *
    into lifecycle_row
    from public.platform_tenant_lifecycle
    where company_id = readiness_row.company_id
    for update;

    if not found or lifecycle_row.state <> 'READY_FOR_REVIEW' then
        raise exception 'The tenant is not ready for Platform Owner review.' using errcode = '22023';
    end if;

    target_state := case when decision = 'APPROVE' then 'PILOT' else 'VALIDATION' end;
    target_status := case when decision = 'APPROVE' then 'PILOT_ACTIVE' else 'RETURNED' end;

    update public.platform_company_readiness_requests
    set status = target_status,
        reviewed_by = caller_id,
        reviewed_at = now(),
        review_reason = reason_text,
        revision = revision + 1,
        metadata = metadata || jsonb_build_object('reviewIdempotencyKey', operation_key),
        updated_at = now()
    where id = readiness_row.id
    returning * into readiness_row;

    update public.platform_companies
    set status = target_state,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = readiness_row.company_id;

    update public.platform_tenant_lifecycle
    set previous_state = state,
        state = target_state,
        progress = case when target_state = 'PILOT' then 95 else 82 end,
        current_owner_role = case when target_state = 'PILOT' then 'platform_owner' else 'super_admin' end,
        next_action = case when target_state = 'PILOT' then 'COMPLETE_PILOT' else 'RESOLVE_VALIDATION_ISSUES' end,
        blockers = case
            when target_state = 'PILOT' then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object('code', 'PLATFORM_REVIEW_RETURNED', 'message', reason_text))
        end,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where company_id = readiness_row.company_id
    returning * into lifecycle_row;

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        readiness_row.company_id,
        readiness_row.tenant_id,
        readiness_row.organization_id,
        case when decision = 'APPROVE' then 'PilotActivated' else 'ReadinessReviewReturned' end,
        lifecycle_row.previous_state,
        target_state,
        caller_id,
        'platform_owner',
        reason_text,
        '',
        operation_key,
        jsonb_build_object(
            'readinessRequestId', readiness_row.id,
            'validationRunId', readiness_row.validation_run_id,
            'readinessScore', readiness_row.readiness_score
        )
    )
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'request', to_jsonb(readiness_row),
        'lifecycle', to_jsonb(lifecycle_row)
    );
end
$$;

revoke all on function public.arth_review_company_pilot_request(uuid, text, text, bigint, text) from public, anon;
grant execute on function public.arth_review_company_pilot_request(uuid, text, text, bigint, text) to authenticated;

create or replace function public.arth_enforce_certified_lifecycle_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.state = 'PILOT' and old.state is distinct from 'PILOT' then
        if not exists (
            select 1
            from public.platform_company_readiness_requests request
            where request.company_id = new.company_id
              and request.status = 'PILOT_ACTIVE'
              and request.readiness_score >= 80
        ) then
            raise exception 'Pilot activation requires an approved readiness request.' using errcode = '42501';
        end if;
    end if;

    if new.state = 'LIVE' and old.state is distinct from 'LIVE' then
        if old.state <> 'PILOT'
           or not exists (
               select 1
               from public.platform_company_readiness_requests request
               where request.company_id = new.company_id
                 and request.status = 'PILOT_ACTIVE'
                 and request.readiness_score >= 80
           ) then
            raise exception 'Production activation requires a successful pilot and approved readiness request.' using errcode = '42501';
        end if;
    end if;

    return new;
end
$$;

revoke all on function public.arth_enforce_certified_lifecycle_activation() from public, anon, authenticated;

drop trigger if exists platform_lifecycle_certification_gate
on public.platform_tenant_lifecycle;

create trigger platform_lifecycle_certification_gate
before update of state on public.platform_tenant_lifecycle
for each row
when (old.state is distinct from new.state)
execute function public.arth_enforce_certified_lifecycle_activation();

commit;
