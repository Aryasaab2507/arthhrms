-- ARTHHRMS invite-based authentication onboarding foundation.
-- Apply after employees.sql and rls_security_hardening.sql.

alter table public.employees
    add column if not exists invitation_status text not null default 'Not Invited',
    add column if not exists activation_status text not null default 'Not Activated',
    add column if not exists invite_sent_at timestamptz,
    add column if not exists invite_accepted_at timestamptz,
    add column if not exists email_verified_at timestamptz;

create table if not exists public.auth_invitations (
    id uuid primary key default gen_random_uuid(),
    invite_id text not null unique,
    emp_id text references public.employees(emp_id) on update cascade on delete set null,
    email text not null,
    role text not null check (role in ('employee', 'manager', 'admin', 'hr', 'super_admin', 'platform_owner')),
    status text not null default 'Pending',
    activation_status text not null default 'Invite Pending',
    auth_user_id uuid references auth.users(id) on delete set null,
    redirect_to text,
    invited_by uuid,
    invited_by_role text,
    sent_at timestamptz,
    accepted_at timestamptz,
    email_verified_at timestamptz,
    failure_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists auth_invitations_invite_id_idx on public.auth_invitations (invite_id);
create index if not exists auth_invitations_emp_id_idx on public.auth_invitations (emp_id);
create index if not exists auth_invitations_email_idx on public.auth_invitations (lower(email));
create index if not exists auth_invitations_status_idx on public.auth_invitations (status);
create index if not exists auth_invitations_auth_user_idx on public.auth_invitations (auth_user_id) where auth_user_id is not null;

alter table public.auth_invitations enable row level security;

drop policy if exists "auth_invitations_ops_select" on public.auth_invitations;
create policy "auth_invitations_ops_select"
on public.auth_invitations
for select
to authenticated
using (
    public.arth_is_ops_role()
    or auth_user_id = (select auth.uid())
    or emp_id = public.arth_current_emp_id()
);

drop policy if exists "auth_invitations_ops_insert" on public.auth_invitations;
create policy "auth_invitations_ops_insert"
on public.auth_invitations
for insert
to authenticated
with check (public.arth_is_ops_role());

drop policy if exists "auth_invitations_ops_update" on public.auth_invitations;
create policy "auth_invitations_ops_update"
on public.auth_invitations
for update
to authenticated
using (public.arth_is_ops_role())
with check (public.arth_is_ops_role());

drop trigger if exists auth_invitations_set_updated_at on public.auth_invitations;
create trigger auth_invitations_set_updated_at
before update on public.auth_invitations
for each row
execute function public.set_updated_at();
