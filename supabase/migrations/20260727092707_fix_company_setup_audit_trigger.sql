begin;

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
        if (select auth.uid()) is null
           or new.actor_user_id <> (select auth.uid())
           or not private.arth_company_setup_owner_allowed(
               new.company_id,
               new.tenant_id,
               new.organization_id
           ) then
            raise exception 'Company setup audit provenance is invalid.'
                using errcode = '42501';
        end if;

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

revoke all on function private.arth_audit_company_setup_step()
from public, anon, authenticated;

commit;
