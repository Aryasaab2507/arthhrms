-- Platform Owner onboarding workspace RPCs and invitation lifecycle controls.
begin;

create or replace function public.arth_platform_update_company(
    p_company_id uuid,
    p_expected_revision bigint,
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
    p_owner_profile jsonb,
    p_change_type text,
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
    normalized_email text := lower(trim(coalesce(p_company_email, '')));
    owner_profile jsonb := coalesce(p_owner_profile, '{}'::jsonb);
    owner_name text := trim(coalesce(owner_profile ->> 'name', ''));
    normalized_owner_email text := lower(trim(coalesce(owner_profile ->> 'email', '')));
    owner_role text := lower(regexp_replace(coalesce(owner_profile ->> 'role', 'super_admin'), '[\s-]+', '_', 'g'));
    change_type text := upper(trim(coalesce(p_change_type, 'COMPANY_INFORMATION')));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    event_name text;
begin
    if caller_id is null or not public.arth_is_platform_owner() then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;
    if operation_key = '' then
        raise exception 'An idempotency key is required.' using errcode = '22023';
    end if;
    if change_type not in ('COMPANY_INFORMATION', 'OWNER_PROFILE') then
        raise exception 'Company onboarding change type is invalid.' using errcode = '22023';
    end if;
    if length(trim(coalesce(p_company_name, ''))) < 2 then
        raise exception 'A valid company name is required.' using errcode = '22023';
    end if;
    if normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or normalized_tenant = ''
       or normalized_organization = '' then
        raise exception 'Valid tenant and organization identifiers are required.' using errcode = '22023';
    end if;
    if normalized_email <> '' and normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Company email address is invalid.' using errcode = '22023';
    end if;
    if trim(coalesce(p_timezone, '')) = '' or trim(coalesce(p_country, '')) = '' then
        raise exception 'Company timezone and country are required.' using errcode = '22023';
    end if;
    if jsonb_typeof(owner_profile) <> 'object' then
        raise exception 'Company Owner profile must be an object.' using errcode = '22023';
    end if;
    if change_type = 'OWNER_PROFILE' then
        if length(owner_name) < 2
           or normalized_owner_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
           or owner_role <> 'super_admin' then
            raise exception 'A valid Company Owner name, email, and trusted role are required.' using errcode = '22023';
        end if;
    end if;

    select *
    into existing_event
    from public.platform_lifecycle_events
    where idempotency_key = operation_key
    limit 1;

    if found then
        if existing_event.company_id <> p_company_id then
            raise exception 'Idempotency key is already assigned to another company operation.' using errcode = '22023';
        end if;
        select * into company_row
        from public.platform_companies
        where id = p_company_id;
        select * into lifecycle_row
        from public.platform_tenant_lifecycle
        where company_id = p_company_id;
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
        raise exception 'Company onboarding revision is stale.' using errcode = '40001';
    end if;
    if company_row.status <> 'DRAFT'
       and (
           company_row.slug <> normalized_slug
           or company_row.tenant_id <> normalized_tenant
           or company_row.organization_id <> normalized_organization
       ) then
        raise exception 'Tenant identity cannot change after provisioning.' using errcode = '22023';
    end if;

    update public.platform_companies
    set company_name = trim(p_company_name),
        slug = normalized_slug,
        tenant_id = normalized_tenant,
        organization_id = normalized_organization,
        company_email = normalized_email,
        company_phone = trim(coalesce(p_company_phone, '')),
        company_size = trim(coalesce(p_company_size, '')),
        plan_type = lower(trim(coalesce(p_plan_type, 'enterprise'))),
        timezone = trim(p_timezone),
        country = trim(p_country),
        owner_email = case when change_type = 'OWNER_PROFILE' then normalized_owner_email else platform_companies.owner_email end,
        metadata = case
            when change_type = 'OWNER_PROFILE'
                then coalesce(platform_companies.metadata, '{}'::jsonb)
                    || jsonb_build_object(
                        'companyOwner',
                        owner_profile || jsonb_build_object(
                            'name', owner_name,
                            'email', normalized_owner_email,
                            'role', 'super_admin',
                            'persona', 'company_owner',
                            'updatedAt', now()
                        )
                    )
            else coalesce(platform_companies.metadata, '{}'::jsonb)
        end,
        revision = revision + 1,
        updated_by = caller_id,
        updated_at = now()
    where id = company_row.id
    returning * into company_row;

    if company_row.status = 'DRAFT' then
        update public.platform_tenant_lifecycle
        set tenant_id = normalized_tenant,
            organization_id = normalized_organization,
            revision = revision + 1,
            updated_by = caller_id,
            updated_at = now()
        where company_id = company_row.id
        returning * into lifecycle_row;
    else
        select * into lifecycle_row
        from public.platform_tenant_lifecycle
        where company_id = company_row.id;
    end if;

    event_name := case change_type
        when 'OWNER_PROFILE' then 'CompanyOwnerProfileSaved'
        else 'CompanyInformationUpdated'
    end;

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        event_name,
        company_row.status,
        company_row.status,
        caller_id,
        'platform_owner',
        case change_type
            when 'OWNER_PROFILE' then 'Company Owner profile saved.'
            else 'Company registry information updated.'
        end,
        trim(coalesce(p_correlation_id, '')),
        operation_key,
        case change_type
            when 'OWNER_PROFILE' then jsonb_build_object(
                'ownerName', owner_name,
                'ownerEmail', normalized_owner_email,
                'ownerRole', 'super_admin'
            )
            else jsonb_build_object(
                'companyName', company_row.company_name,
                'slug', company_row.slug
            )
        end
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'company', to_jsonb(company_row),
        'lifecycle', to_jsonb(lifecycle_row)
    );
end
$$;

revoke all on function public.arth_platform_update_company(
    uuid, bigint, text, text, text, text, text, text, text, text, text, text,
    jsonb, text, text, text
) from public, anon;
grant execute on function public.arth_platform_update_company(
    uuid, bigint, text, text, text, text, text, text, text, text, text, text,
    jsonb, text, text, text
) to authenticated;

create or replace function public.arth_platform_expire_owner_invitations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    invitation_row public.platform_company_invitations%rowtype;
    expired_count integer := 0;
begin
    if caller_id is null or not public.arth_is_platform_owner() then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;

    for invitation_row in
        select *
        from public.platform_company_invitations
        where status in ('SENT', 'DELIVERED', 'OPENED')
          and expires_at is not null
          and expires_at <= now()
        for update
    loop
        update public.platform_company_invitations
        set status = 'EXPIRED',
            failure_reason = 'Invitation expired before activation.',
            updated_by = caller_id,
            updated_at = now()
        where id = invitation_row.id;

        insert into public.platform_lifecycle_events (
            company_id, tenant_id, organization_id, event_type,
            previous_state, new_state, actor_user_id, actor_role,
            reason, correlation_id, idempotency_key, payload
        ) values (
            invitation_row.company_id,
            invitation_row.tenant_id,
            invitation_row.organization_id,
            'CompanyOwnerInvitationExpired',
            'OWNER_INVITED',
            'OWNER_INVITED',
            caller_id,
            'platform_owner',
            'Company Owner invitation expired before activation.',
            '',
            'owner-invite-expired:' || invitation_row.id::text,
            jsonb_build_object('invitationId', invitation_row.id, 'ownerEmail', invitation_row.email)
        )
        on conflict (idempotency_key) do nothing;

        expired_count := expired_count + 1;
    end loop;

    return jsonb_build_object('ok', true, 'expiredCount', expired_count);
end
$$;

revoke all on function public.arth_platform_expire_owner_invitations() from public, anon;
grant execute on function public.arth_platform_expire_owner_invitations() to authenticated;

create or replace function public.arth_platform_close_owner_invite(
    p_invitation_id uuid,
    p_action text,
    p_reason text,
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
    actor_role text;
    action_name text := upper(trim(coalesce(p_action, '')));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    invitation_row public.platform_company_invitations%rowtype;
    company_row public.platform_companies%rowtype;
    lifecycle_row public.platform_tenant_lifecycle%rowtype;
    existing_event public.platform_lifecycle_events%rowtype;
    target_state text;
    event_name text;
begin
    select lower(regexp_replace(coalesce(raw_app_meta_data ->> 'role', ''), '[\s-]+', '_', 'g'))
    into actor_role
    from auth.users
    where id = p_actor_user_id;

    if p_actor_user_id is null or actor_role <> 'platform_owner' then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;
    if action_name not in ('RESEND', 'REVOKE') or operation_key = '' then
        raise exception 'A valid invitation action and idempotency key are required.' using errcode = '22023';
    end if;

    select *
    into existing_event
    from public.platform_lifecycle_events
    where idempotency_key = operation_key
    limit 1;

    if found then
        select * into invitation_row
        from public.platform_company_invitations
        where id = p_invitation_id;
        select * into company_row
        from public.platform_companies
        where id = existing_event.company_id;
        select * into lifecycle_row
        from public.platform_tenant_lifecycle
        where company_id = existing_event.company_id;
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'invitation', to_jsonb(invitation_row),
            'company', to_jsonb(company_row),
            'lifecycle', to_jsonb(lifecycle_row)
        );
    end if;

    select *
    into invitation_row
    from public.platform_company_invitations
    where id = p_invitation_id
    for update;

    if not found then
        raise exception 'Company Owner invitation was not found.' using errcode = 'P0002';
    end if;
    if invitation_row.status in ('ACCEPTED', 'ACTIVATED') then
        raise exception 'Accepted invitations cannot be changed.' using errcode = '22023';
    end if;

    select *
    into company_row
    from public.platform_companies
    where id = invitation_row.company_id
    for update;

    select *
    into lifecycle_row
    from public.platform_tenant_lifecycle
    where company_id = invitation_row.company_id
    for update;

    target_state := case when action_name = 'REVOKE' then 'PROVISIONED' else 'OWNER_INVITED' end;
    event_name := case
        when action_name = 'REVOKE' then 'CompanyOwnerInvitationRevoked'
        else 'CompanyOwnerInvitationResendPrepared'
    end;

    update public.platform_company_invitations
    set status = 'REVOKED',
        cancelled_at = case when action_name = 'REVOKE' then now() else cancelled_at end,
        failure_reason = trim(coalesce(p_reason, '')),
        updated_by = p_actor_user_id,
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('closedFor', lower(action_name), 'closedAt', now())
    where id = invitation_row.id
    returning * into invitation_row;

    update public.platform_companies
    set status = target_state,
        owner_auth_user_id = null,
        revision = revision + 1,
        updated_by = p_actor_user_id,
        updated_at = now()
    where id = company_row.id
    returning * into company_row;

    update public.platform_tenant_lifecycle
    set previous_state = state,
        state = target_state,
        progress = case when action_name = 'REVOKE' then 8 else greatest(progress, 12) end,
        current_owner_role = 'platform_owner',
        next_action = case when action_name = 'REVOKE' then 'INVITE_COMPANY_OWNER' else 'RESEND_COMPANY_OWNER_INVITE' end,
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
        event_name,
        lifecycle_row.previous_state,
        lifecycle_row.state,
        p_actor_user_id,
        'platform_owner',
        trim(coalesce(p_reason, case when action_name = 'REVOKE'
            then 'Company Owner invitation revoked.'
            else 'Company Owner invitation prepared for resend.'
        end)),
        trim(coalesce(p_correlation_id, '')),
        operation_key,
        jsonb_build_object(
            'invitationId', invitation_row.id,
            'ownerEmail', invitation_row.email,
            'action', action_name
        )
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'invitation', to_jsonb(invitation_row),
        'company', to_jsonb(company_row),
        'lifecycle', to_jsonb(lifecycle_row),
        'authUserId', invitation_row.auth_user_id
    );
end
$$;

revoke all on function public.arth_platform_close_owner_invite(
    uuid, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.arth_platform_close_owner_invite(
    uuid, text, text, text, uuid, text
) to service_role;

commit;
