begin;

alter function public.arth_get_or_create_company_setup()
set schema private;
alter function private.arth_get_or_create_company_setup()
rename to arth_get_or_create_company_setup_internal;

alter function public.arth_save_company_setup_step(text, jsonb, bigint, text, boolean)
set schema private;
alter function private.arth_save_company_setup_step(text, jsonb, bigint, text, boolean)
rename to arth_save_company_setup_step_internal;

alter function public.arth_complete_company_core_setup(bigint, text)
set schema private;
alter function private.arth_complete_company_core_setup(bigint, text)
rename to arth_complete_company_core_setup_internal;

revoke all on function private.arth_get_or_create_company_setup_internal() from public, anon, authenticated;
revoke all on function private.arth_save_company_setup_step_internal(text, jsonb, bigint, text, boolean) from public, anon, authenticated;
revoke all on function private.arth_complete_company_core_setup_internal(bigint, text) from public, anon, authenticated;

create function public.arth_get_or_create_company_setup()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
    if (select auth.uid()) is null
       or public.arth_persistence_role() <> 'super_admin'
       or lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'company_owner', 'false')) <> 'true' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;

    return private.arth_get_or_create_company_setup_internal();
end
$$;

create function public.arth_save_company_setup_step(
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
set row_security = off
as $$
begin
    if (select auth.uid()) is null
       or public.arth_persistence_role() <> 'super_admin'
       or lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'company_owner', 'false')) <> 'true' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;

    return private.arth_save_company_setup_step_internal(
        p_step_key,
        p_payload,
        p_expected_revision,
        p_idempotency_key,
        p_complete
    );
end
$$;

create function public.arth_complete_company_core_setup(
    p_expected_revision bigint,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
    if (select auth.uid()) is null
       or public.arth_persistence_role() <> 'super_admin'
       or lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'company_owner', 'false')) <> 'true' then
        raise exception 'Company Owner authorization is required.' using errcode = '42501';
    end if;

    return private.arth_complete_company_core_setup_internal(
        p_expected_revision,
        p_idempotency_key
    );
end
$$;

revoke all on function public.arth_get_or_create_company_setup() from public, anon;
revoke all on function public.arth_save_company_setup_step(text, jsonb, bigint, text, boolean) from public, anon;
revoke all on function public.arth_complete_company_core_setup(bigint, text) from public, anon;

grant execute on function public.arth_get_or_create_company_setup() to authenticated;
grant execute on function public.arth_save_company_setup_step(text, jsonb, bigint, text, boolean) to authenticated;
grant execute on function public.arth_complete_company_core_setup(bigint, text) to authenticated;

commit;
