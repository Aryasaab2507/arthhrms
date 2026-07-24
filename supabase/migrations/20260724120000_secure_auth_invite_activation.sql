begin;

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
        '[^a-z0-9]+',
        '-',
        'g'
    ));
    caller_organization text := coalesce(metadata ->> 'organizationId', metadata ->> 'organization_id', '');
    caller_employee text := coalesce(metadata ->> 'empId', metadata ->> 'emp_id', '');
    caller_email text := lower(coalesce(claims ->> 'email', ''));
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

    select *
    into invite_row
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

    select *
    into employee_row
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
            'status', 'Activated',
            'inviteStatus', 'Activated',
            'activationStatus', 'Active',
            'acceptedAt', coalesce(invite_row.payload ->> 'acceptedAt', activated_at::text),
            'emailVerifiedAt', activated_at::text,
            'failureReason', ''
        ),
        updated_by = caller_id,
        updated_at = activated_at
    where id = invite_row.id
    returning * into invite_row;

    update public.hrms_employees
    set payload = employee_row.payload || jsonb_build_object(
            'inviteStatus', 'Activated',
            'invitation_status', 'Activated',
            'activationStatus', 'Active',
            'activation_status', 'Active',
            'emailVerifiedAt', activated_at::text
        ),
        updated_by = caller_id,
        updated_at = activated_at
    where id = employee_row.id;

    insert into public.hrms_audit_records (
        tenant_id,
        organization_id,
        record_type,
        record_id,
        subject_id,
        payload,
        updated_by
    ) values (
        caller_tenant,
        caller_organization,
        'auditLogs',
        'AUTH-ACTIVATION-' || gen_random_uuid()::text,
        caller_employee,
        jsonb_build_object(
            'actionType', 'invite activation completed',
            'module', 'Authentication',
            'targetId', invite_row.record_id,
            'actorId', caller_id::text,
            'actorRole', caller_role,
            'timestamp', activated_at::text
        ),
        caller_id
    );

    return jsonb_build_object(
        'ok', true,
        'inviteId', invite_row.record_id,
        'empId', caller_employee,
        'status', 'Activated',
        'activationStatus', 'Active',
        'acceptedAt', activated_at::text
    );
end
$$;

revoke all on function public.arth_complete_auth_invite_activation() from public, anon;
grant execute on function public.arth_complete_auth_invite_activation() to authenticated;

commit;
