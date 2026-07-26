-- Durable delivery failure audit for Company Owner invitations.
begin;

create or replace function public.arth_platform_record_owner_invite_failure(
    p_company_id uuid,
    p_email text,
    p_action text,
    p_reason text,
    p_redirect_to text,
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
    company_row public.platform_companies%rowtype;
    invitation_row public.platform_company_invitations%rowtype;
    normalized_email text := lower(trim(coalesce(p_email, '')));
    action_name text := lower(trim(coalesce(p_action, 'send')));
    operation_key text := trim(coalesce(p_idempotency_key, ''));
    failure_message text := left(trim(coalesce(p_reason, 'Invitation delivery failed.')), 1000);
begin
    select lower(regexp_replace(coalesce(raw_app_meta_data ->> 'role', ''), '[\s-]+', '_', 'g'))
    into actor_role
    from auth.users
    where id = p_actor_user_id;

    if p_actor_user_id is null or actor_role <> 'platform_owner' then
        raise exception 'Platform Owner authorization is required.' using errcode = '42501';
    end if;
    if action_name not in ('send', 'resend')
       or operation_key = ''
       or normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Valid invitation failure audit values are required.' using errcode = '22023';
    end if;

    select *
    into invitation_row
    from public.platform_company_invitations
    where idempotency_key = operation_key
    limit 1;

    if found then
        if invitation_row.company_id <> p_company_id
           or invitation_row.email <> normalized_email then
            raise exception 'Idempotency key is already assigned to another invitation.' using errcode = '22023';
        end if;
        return jsonb_build_object(
            'ok', true,
            'replayed', true,
            'invitation', to_jsonb(invitation_row)
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
        raise exception 'Company is not available for owner invitation.' using errcode = '22023';
    end if;

    insert into public.platform_company_invitations (
        company_id, tenant_id, organization_id, email, role, status,
        auth_user_id, idempotency_key, redirect_to, sent_at, expires_at,
        failure_reason, metadata, created_by, updated_by
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        normalized_email,
        'super_admin',
        'FAILED',
        null,
        operation_key,
        trim(coalesce(p_redirect_to, '')),
        null,
        null,
        failure_message,
        jsonb_build_object(
            'persona', 'company_owner',
            'delivery', 'supabase_invite',
            'action', action_name,
            'failedAt', now()
        ),
        p_actor_user_id,
        p_actor_user_id
    )
    returning * into invitation_row;

    insert into public.platform_lifecycle_events (
        company_id, tenant_id, organization_id, event_type,
        previous_state, new_state, actor_user_id, actor_role,
        reason, correlation_id, idempotency_key, payload
    ) values (
        company_row.id,
        company_row.tenant_id,
        company_row.organization_id,
        'CompanyOwnerInvitationFailed',
        company_row.status,
        company_row.status,
        p_actor_user_id,
        'platform_owner',
        failure_message,
        trim(coalesce(p_correlation_id, '')),
        operation_key || ':failure-event',
        jsonb_build_object(
            'invitationId', invitation_row.id,
            'ownerEmail', normalized_email,
            'action', action_name
        )
    );

    return jsonb_build_object(
        'ok', true,
        'replayed', false,
        'invitation', to_jsonb(invitation_row)
    );
end
$$;

revoke all on function public.arth_platform_record_owner_invite_failure(
    uuid, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.arth_platform_record_owner_invite_failure(
    uuid, text, text, text, text, text, uuid, text
) to service_role;

commit;
