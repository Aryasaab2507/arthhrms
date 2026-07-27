begin;

create table if not exists public.company_setup_audit_outbox (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.platform_companies(id) on delete cascade,
    workspace_id uuid not null references public.company_setup_workspaces(id) on delete cascade,
    tenant_id text not null,
    organization_id text not null,
    event_key text not null unique,
    event_type text not null,
    payload jsonb not null default '{}'::jsonb,
    actor_user_id uuid not null references auth.users(id) on delete restrict,
    status text not null default 'PENDING',
    attempts integer not null default 0 check (attempts >= 0),
    last_error text not null default '',
    next_attempt_at timestamptz not null default now(),
    delivered_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_setup_audit_outbox_status_chk check (
        status in ('PENDING', 'DELIVERED')
    ),
    constraint company_setup_audit_outbox_payload_object_chk check (
        jsonb_typeof(payload) = 'object'
    )
);

create index if not exists company_setup_audit_outbox_pending_idx
on public.company_setup_audit_outbox (company_id, next_attempt_at, created_at)
where status = 'PENDING';

alter table public.company_setup_audit_outbox enable row level security;
alter table public.company_setup_audit_outbox force row level security;

revoke all on public.company_setup_audit_outbox from public, anon, authenticated;
grant select on public.company_setup_audit_outbox to authenticated;

drop policy if exists company_setup_audit_outbox_owner_read
on public.company_setup_audit_outbox;
create policy company_setup_audit_outbox_owner_read
on public.company_setup_audit_outbox
for select
to authenticated
using (
    private.arth_company_setup_owner_allowed(company_id, tenant_id, organization_id)
);

create or replace function private.arth_enqueue_company_setup_audit(
    p_company_id uuid,
    p_workspace_id uuid,
    p_tenant_id text,
    p_organization_id text,
    p_event_key text,
    p_event_type text,
    p_payload jsonb,
    p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    outbox_id uuid;
begin
    insert into public.company_setup_audit_outbox (
        company_id,
        workspace_id,
        tenant_id,
        organization_id,
        event_key,
        event_type,
        payload,
        actor_user_id
    ) values (
        p_company_id,
        p_workspace_id,
        p_tenant_id,
        p_organization_id,
        trim(p_event_key),
        trim(p_event_type),
        coalesce(p_payload, '{}'::jsonb),
        p_actor_user_id
    )
    on conflict (event_key) do update
    set updated_at = now()
    returning id into outbox_id;

    return outbox_id;
end
$$;

revoke all on function private.arth_enqueue_company_setup_audit(
    uuid, uuid, text, text, text, text, jsonb, uuid
) from public, anon, authenticated;

create or replace function private.arth_deliver_company_setup_audit(
    p_outbox_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    queued public.company_setup_audit_outbox%rowtype;
begin
    select *
    into queued
    from public.company_setup_audit_outbox
    where id = p_outbox_id
    for update;

    if not found then
        return false;
    end if;
    if queued.status = 'DELIVERED' then
        return true;
    end if;

    begin
        insert into public.hrms_audit_records (
            tenant_id,
            organization_id,
            record_type,
            record_id,
            subject_id,
            payload,
            updated_by
        ) values (
            queued.tenant_id,
            queued.organization_id,
            'companySetupAudit',
            queued.event_key,
            queued.workspace_id::text,
            queued.payload || jsonb_build_object(
                'eventType', queued.event_type,
                'actorUserId', queued.actor_user_id,
                'occurredAt', queued.created_at
            ),
            queued.actor_user_id
        )
        on conflict (tenant_id, record_type, record_id) do nothing;

        update public.company_setup_audit_outbox
        set status = 'DELIVERED',
            attempts = attempts + 1,
            last_error = '',
            delivered_at = now(),
            updated_at = now()
        where id = queued.id;
        return true;
    exception
        when others then
            update public.company_setup_audit_outbox
            set status = 'PENDING',
                attempts = attempts + 1,
                last_error = left(sqlerrm, 500),
                next_attempt_at = now() + make_interval(
                    secs => least(300, greatest(5, (attempts + 1) * 15))
                ),
                updated_at = now()
            where id = queued.id;
            return false;
    end;
end
$$;

revoke all on function private.arth_deliver_company_setup_audit(uuid)
from public, anon, authenticated;

create or replace function public.arth_flush_company_setup_audit(
    p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    company_row public.platform_companies%rowtype;
    queued record;
    delivered_count integer := 0;
    pending_count integer := 0;
    batch_limit integer := least(100, greatest(1, coalesce(p_limit, 25)));
begin
    select *
    into company_row
    from public.platform_companies company
    where company.owner_auth_user_id = (select auth.uid())
      and company.tenant_id = public.arth_persistence_tenant_id()
      and company.organization_id = coalesce(
          (select auth.jwt()) -> 'app_metadata' ->> 'organizationId',
          (select auth.jwt()) -> 'app_metadata' ->> 'organization_id',
          ''
      )
    limit 1;

    if not found
       or not private.arth_company_setup_owner_allowed(
           company_row.id,
           company_row.tenant_id,
           company_row.organization_id
       ) then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;

    for queued in
        select id
        from public.company_setup_audit_outbox
        where company_id = company_row.id
          and status = 'PENDING'
          and next_attempt_at <= now()
        order by created_at
        limit batch_limit
        for update skip locked
    loop
        if private.arth_deliver_company_setup_audit(queued.id) then
            delivered_count := delivered_count + 1;
        end if;
    end loop;

    select count(*)
    into pending_count
    from public.company_setup_audit_outbox
    where company_id = company_row.id
      and status = 'PENDING';

    return jsonb_build_object(
        'ok', true,
        'delivered', delivered_count,
        'pending', pending_count
    );
end
$$;

revoke all on function public.arth_flush_company_setup_audit(integer)
from public, anon;
grant execute on function public.arth_flush_company_setup_audit(integer)
to authenticated;

create or replace function private.arth_audit_company_setup_step()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
    outbox_id uuid;
begin
    begin
        outbox_id := private.arth_enqueue_company_setup_audit(
            new.company_id,
            new.workspace_id,
            new.tenant_id,
            new.organization_id,
            new.idempotency_key,
            'CompanySetupStepSaved',
            jsonb_build_object(
                'stepKey', new.step_key,
                'stepVersion', new.step_version,
                'completed', new.completed,
                'actorRole', new.actor_role
            ),
            new.actor_user_id
        );
        perform private.arth_deliver_company_setup_audit(outbox_id);
    exception
        when others then
            null;
    end;
    return new;
end
$$;

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
    outbox_id uuid;
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

    begin
        outbox_id := private.arth_enqueue_company_setup_audit(
            new.company_id,
            new.id,
            new.tenant_id,
            new.organization_id,
            event_key,
            event_name,
            jsonb_build_object(
                'status', new.status,
                'progress', new.progress,
                'actorRole', 'super_admin'
            ),
            actor_id
        );
        perform private.arth_deliver_company_setup_audit(outbox_id);
    exception
        when others then
            null;
    end;
    return new;
end
$$;

commit;
