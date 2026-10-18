begin;

-- Pending invitations are deliberately non-active. This also closes the gap for
-- invitations issued before the Edge Functions began writing explicit metadata.
update auth.users as auth_user
set raw_app_meta_data = coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'active', false,
    'account_status', 'invited',
    'accountStatus', 'invited',
    'invitation_status', 'sent',
    'invitationStatus', 'sent'
)
where exists (
    select 1
    from public.hrms_identity_records as invite
    where invite.record_type = 'authInvites'
      and coalesce(invite.payload ->> 'authUserId', invite.payload ->> 'auth_user_id', '') = auth_user.id::text
      and lower(coalesce(invite.payload ->> 'activationStatus', invite.payload ->> 'inviteStatus', invite.payload ->> 'status', ''))
          not in ('active', 'activated', 'cancelled', 'expired', 'failed', 'revoked')
);

update auth.users as auth_user
set raw_app_meta_data = coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'active', false,
    'account_status', 'invited',
    'accountStatus', 'invited',
    'invitation_status', 'sent',
    'invitationStatus', 'sent'
)
where exists (
    select 1
    from public.platform_company_invitations as invite
    where invite.auth_user_id = auth_user.id
      and invite.status in ('SENT', 'DELIVERED', 'OPENED', 'ACCEPTED')
);

create or replace function public.arth_complete_auth_invite_activation()
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
        '[^a-z0-9]+', '-', 'g'
    ));
    caller_organization text := coalesce(metadata ->> 'organizationId', metadata ->> 'organization_id', '');
    caller_employee text := coalesce(metadata ->> 'empId', metadata ->> 'emp_id', '');
    caller_email text := lower(coalesce(claims ->> 'email', ''));
    password_hash text;
    activated_at timestamptz := now();
    invite_row public.hrms_identity_records%rowtype;
    employee_row public.hrms_employees%rowtype;
begin
    if caller_id is null then
        raise exception 'Authenticated user is required.' using errcode = '42501';
    end if;
    if caller_role not in ('employee', 'manager', 'admin', 'hr', 'hr_head', 'director') then
        raise exception 'Tenant invitation role is invalid.' using errcode = '42501';
    end if;
    if caller_tenant = '' or caller_organization = '' or caller_employee = '' or caller_email = '' then
        raise exception 'Trusted invitation claims are incomplete.' using errcode = '42501';
    end if;

    select nullif(encrypted_password, '')
    into password_hash
    from auth.users
    where id = caller_id
    for update;
    if password_hash is null then
        raise exception 'Create a password before activating this invitation.' using errcode = '42501';
    end if;

    select * into invite_row
    from public.hrms_identity_records
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and record_type = 'authInvites'
      and subject_id = caller_employee
      and coalesce(payload ->> 'authUserId', payload ->> 'auth_user_id', '') = caller_id::text
      and lower(coalesce(payload ->> 'email', '')) = caller_email
    order by created_at desc
    limit 1
    for update;
    if not found then
        raise exception 'No matching invitation exists for this authenticated account.' using errcode = '42501';
    end if;

    select * into employee_row
    from public.hrms_employees
    where tenant_id = caller_tenant
      and organization_id = caller_organization
      and record_type = 'employees'
      and record_id = caller_employee
      and coalesce(payload ->> 'authUserId', payload ->> 'auth_user_id', '') = caller_id::text
    limit 1
    for update;
    if not found then
        raise exception 'The invitation is not linked to the authenticated employee.' using errcode = '42501';
    end if;

    update public.hrms_identity_records
    set payload = invite_row.payload || jsonb_build_object(
            'status', 'Activated', 'inviteStatus', 'Activated', 'activationStatus', 'Active',
            'acceptedAt', coalesce(invite_row.payload ->> 'acceptedAt', activated_at::text),
            'emailVerifiedAt', activated_at::text, 'failureReason', ''
        ),
        updated_by = caller_id,
        updated_at = activated_at
    where id = invite_row.id
    returning * into invite_row;

    update public.hrms_employees
    set payload = employee_row.payload || jsonb_build_object(
            'inviteStatus', 'Activated', 'invitation_status', 'Activated',
            'activationStatus', 'Active', 'activation_status', 'Active',
            'emailVerifiedAt', activated_at::text
        ),
        updated_by = caller_id,
        updated_at = activated_at
    where id = employee_row.id;

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'active', true,
        'account_status', 'active',
        'accountStatus', 'active',
        'invitation_status', 'activated',
        'invitationStatus', 'activated'
    )
    where id = caller_id;
    if not found then
        raise exception 'Authenticated account could not be activated.' using errcode = '42501';
    end if;

    insert into public.hrms_audit_records (
        tenant_id, organization_id, record_type, record_id, subject_id, payload, updated_by
    ) values (
        caller_tenant, caller_organization, 'auditLogs', 'AUTH-ACTIVATION-' || gen_random_uuid()::text,
        caller_employee,
        jsonb_build_object(
            'actionType', 'invite activation completed', 'module', 'Authentication',
            'targetId', invite_row.record_id, 'actorId', caller_id::text,
            'actorRole', caller_role, 'timestamp', activated_at::text
        ),
        caller_id
    );

    return jsonb_build_object(
        'ok', true, 'inviteId', invite_row.record_id, 'empId', caller_employee,
        'status', 'Activated', 'activationStatus', 'Active', 'acceptedAt', activated_at::text
    );
end
$$;

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
        '[^a-z0-9]+', '-', 'g'
    ));
    caller_organization text := coalesce(metadata ->> 'organizationId', metadata ->> 'organization_id', '');
    onboarding_method text := lower(coalesce(metadata ->> 'onboarding_method', ''));
    password_hash text;
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

    select * into invitation_row
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
            'ok', true, 'replayed', true, 'companyId', invitation_row.company_id,
            'invitationId', invitation_row.id, 'state', 'OWNER_ACCEPTED'
        );
    end if;

    select nullif(encrypted_password, '')
    into password_hash
    from auth.users
    where id = caller_id
    for update;
    if password_hash is null then
        raise exception 'Create a password before activating this Company Owner invitation.' using errcode = '42501';
    end if;
    if invitation_row.expires_at is not null and invitation_row.expires_at < now() then
        update public.platform_company_invitations
        set status = 'EXPIRED', updated_by = caller_id, updated_at = now()
        where id = invitation_row.id;
        return jsonb_build_object(
            'ok', false, 'replayed', false, 'code', 'COMPANY_OWNER_INVITE_EXPIRED',
            'message', 'Company Owner invitation has expired.',
            'companyId', invitation_row.company_id, 'invitationId', invitation_row.id
        );
    end if;

    select * into company_row
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
    set status = 'ACTIVATED', accepted_at = coalesce(accepted_at, now()),
        updated_by = caller_id, updated_at = now(), failure_reason = ''
    where id = invitation_row.id
    returning * into invitation_row;

    update public.platform_companies
    set status = 'OWNER_ACCEPTED', owner_auth_user_id = caller_id,
        owner_email = invitation_row.email, revision = revision + 1,
        updated_by = caller_id, updated_at = now()
    where id = company_row.id
    returning * into company_row;

    update public.platform_tenant_lifecycle
    set previous_state = state, state = 'OWNER_ACCEPTED', progress = 18,
        current_owner_role = 'super_admin', next_action = 'BEGIN_COMPANY_SETUP',
        revision = revision + 1, updated_by = caller_id, updated_at = now()
    where company_id = company_row.id
    returning * into lifecycle_row;

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'active', true,
        'account_status', 'active',
        'accountStatus', 'active',
        'invitation_status', 'activated',
        'invitationStatus', 'activated'
    )
    where id = caller_id;
    if not found then
        raise exception 'Company Owner account could not be activated.' using errcode = '42501';
    end if;

    activation_key := 'company-owner-activation:' || caller_id::text;
    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id, company_row.tenant_id, company_row.organization_id,
        'InvitationAccepted', lifecycle_row.previous_state, 'OWNER_ACCEPTED',
        caller_id, 'super_admin', 'Company Owner invitation accepted.', '', activation_key,
        jsonb_build_object('invitationId', invitation_row.id, 'persona', 'company_owner')
    ) on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
        'ok', true, 'replayed', false, 'companyId', company_row.id,
        'invitationId', invitation_row.id, 'state', 'OWNER_ACCEPTED',
        'nextAction', 'BEGIN_COMPANY_SETUP'
    );
end
$$;

create or replace function public.arth_complete_release_operator_invite_activation()
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
    onboarding_method text := lower(coalesce(metadata ->> 'onboarding_method', ''));
    password_hash text;
begin
    if caller_id is null then
        raise exception 'Authenticated user is required.' using errcode = '42501';
    end if;
    if caller_role <> 'platform_owner' or onboarding_method <> 'release_operator_invite' then
        raise exception 'Platform Owner invitation claims are invalid.' using errcode = '42501';
    end if;
    select nullif(encrypted_password, '')
    into password_hash
    from auth.users
    where id = caller_id
    for update;
    if password_hash is null then
        raise exception 'Create a password before activating this Platform Owner invitation.' using errcode = '42501';
    end if;
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'active', true,
        'account_status', 'active',
        'accountStatus', 'active',
        'invitation_status', 'activated',
        'invitationStatus', 'activated'
    )
    where id = caller_id;
    if not found then
        raise exception 'Platform Owner account could not be activated.' using errcode = '42501';
    end if;
    return jsonb_build_object('ok', true, 'status', 'Activated');
end
$$;

revoke all on function public.arth_complete_auth_invite_activation() from public, anon;
grant execute on function public.arth_complete_auth_invite_activation() to authenticated;
revoke all on function public.arth_complete_company_owner_activation() from public, anon;
grant execute on function public.arth_complete_company_owner_activation() to authenticated;
revoke all on function public.arth_complete_release_operator_invite_activation() from public, anon;
grant execute on function public.arth_complete_release_operator_invite_activation() to authenticated;

commit;
