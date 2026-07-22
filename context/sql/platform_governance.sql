-- ARTHHRMS platform governance SQL foundation.
-- Apply after auth role metadata is configured. Only platform_owner can mutate root controls.

create table if not exists public.platform_governance (
    id text primary key default 'global',
    preset text not null default 'STANDARD_COMPANY',
    maintenance_mode boolean not null default false,
    safe_mode boolean not null default false,
    emergency_disabled boolean not null default false,
    branding jsonb not null default '{}'::jsonb,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint platform_governance_singleton check (id = 'global')
);

create table if not exists public.platform_feature_flags (
    feature_key text primary key,
    label text not null,
    enabled boolean not null default true,
    experimental boolean not null default false,
    emergency_disabled boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now()
);

create table if not exists public.platform_feature_role_access (
    feature_key text not null references public.platform_feature_flags(feature_key) on delete cascade,
    role text not null,
    allowed boolean not null default false,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (feature_key, role),
    constraint platform_feature_role_access_role_chk
        check (role in ('employee', 'manager', 'admin', 'hr', 'super_admin', 'platform_owner'))
);

create index if not exists platform_feature_role_access_role_idx
on public.platform_feature_role_access (role);

alter table public.platform_governance enable row level security;
alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_role_access enable row level security;

create or replace function public.arth_is_platform_owner()
returns boolean
language sql
stable
as $$
    select replace(lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')), '-', '_') = 'platform_owner'
$$;

drop policy if exists "platform_governance_platform_owner_all" on public.platform_governance;
create policy "platform_governance_platform_owner_all"
on public.platform_governance
for all
to authenticated
using (public.arth_is_platform_owner())
with check (public.arth_is_platform_owner());

drop policy if exists "platform_feature_flags_platform_owner_all" on public.platform_feature_flags;
create policy "platform_feature_flags_platform_owner_all"
on public.platform_feature_flags
for all
to authenticated
using (public.arth_is_platform_owner())
with check (public.arth_is_platform_owner());

drop policy if exists "platform_feature_role_access_platform_owner_all" on public.platform_feature_role_access;
create policy "platform_feature_role_access_platform_owner_all"
on public.platform_feature_role_access
for all
to authenticated
using (public.arth_is_platform_owner())
with check (public.arth_is_platform_owner());

-- Read-only helper for service-layer feature checks.
create or replace function public.arth_can_access_feature(feature_key_input text)
returns boolean
language sql
stable
as $$
    select coalesce((
        select f.enabled
           and not f.emergency_disabled
           and not g.maintenance_mode
           and not g.safe_mode
           and not g.emergency_disabled
           and coalesce(r.allowed, false)
        from public.platform_feature_flags f
        cross join public.platform_governance g
        left join public.platform_feature_role_access r
          on r.feature_key = f.feature_key
         and r.role = replace(lower(coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')), '-', '_')
        where f.feature_key = feature_key_input
        limit 1
    ), false)
    or public.arth_is_platform_owner()
$$;
