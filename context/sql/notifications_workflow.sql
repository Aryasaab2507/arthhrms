-- ARTHHRMS notification, pending action, workflow event, and audit log tables.
-- Apply after rls_security_hardening.sql so helper functions exist.

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    notification_id text not null unique,
    to_role text,
    to_emp_id text references public.employees(emp_id) on update cascade on delete cascade,
    title text not null,
    message text not null,
    module text not null default 'General',
    notification_type text not null default 'info',
    priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    action_link text,
    read_by text[] not null default array[]::text[],
    metadata jsonb not null default '{}'::jsonb,
    created_by_role text,
    created_by_emp_id text,
    created_at timestamptz not null default now()
);

create table if not exists public.pending_actions (
    id uuid primary key default gen_random_uuid(),
    pending_action_id text not null unique,
    workflow_type text not null,
    module text not null default 'General',
    target_role text,
    target_emp_id text references public.employees(emp_id) on update cascade on delete cascade,
    record_id text,
    title text not null,
    description text,
    priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status text not null default 'Open' check (status in ('Open', 'In Progress', 'Resolved', 'Cancelled')),
    due_date date,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create table if not exists public.workflow_events (
    id uuid primary key default gen_random_uuid(),
    event_id text not null unique,
    workflow_type text not null,
    module text not null default 'General',
    actor_role text,
    actor_emp_id text,
    target_role text,
    target_emp_id text,
    target_id text,
    title text,
    message text,
    priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status text not null default 'Open',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    log_id text not null unique,
    log_date timestamptz not null default now(),
    actor_role text,
    actor_emp_id text,
    action_type text not null,
    module text not null default 'General',
    target_id text,
    description text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists notifications_notification_id_idx on public.notifications (notification_id);
create index if not exists notifications_to_role_idx on public.notifications (lower(to_role));
create index if not exists notifications_to_emp_idx on public.notifications (to_emp_id);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);

create unique index if not exists pending_actions_pending_action_id_idx on public.pending_actions (pending_action_id);
create index if not exists pending_actions_target_role_idx on public.pending_actions (lower(target_role));
create index if not exists pending_actions_target_emp_idx on public.pending_actions (target_emp_id);
create index if not exists pending_actions_status_idx on public.pending_actions (status);

create unique index if not exists workflow_events_event_id_idx on public.workflow_events (event_id);
create index if not exists workflow_events_actor_emp_idx on public.workflow_events (actor_emp_id);
create index if not exists workflow_events_target_emp_idx on public.workflow_events (target_emp_id);
create index if not exists workflow_events_created_at_idx on public.workflow_events (created_at desc);

create unique index if not exists audit_logs_log_id_idx on public.audit_logs (log_id);
create index if not exists audit_logs_module_idx on public.audit_logs (module);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.notifications enable row level security;
alter table public.pending_actions enable row level security;
alter table public.workflow_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "notifications_select_role_scoped" on public.notifications;
drop policy if exists "notifications_insert_ops_only" on public.notifications;
drop policy if exists "notifications_update_visible_targets" on public.notifications;
drop policy if exists "notifications_delete_super_admin_only" on public.notifications;

create policy "notifications_select_role_scoped"
on public.notifications
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(to_emp_id)
    or lower(coalesce(to_role, '')) in ('all', public.arth_current_role())
);

create policy "notifications_insert_ops_only"
on public.notifications
for insert
to authenticated
with check (public.arth_is_ops_role());

create policy "notifications_update_visible_targets"
on public.notifications
for update
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(to_emp_id)
    or lower(coalesce(to_role, '')) in ('all', public.arth_current_role())
)
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(to_emp_id)
    or lower(coalesce(to_role, '')) in ('all', public.arth_current_role())
);

create policy "notifications_delete_super_admin_only"
on public.notifications
for delete
to authenticated
using (public.arth_is_super_admin());

drop policy if exists "pending_actions_select_role_scoped" on public.pending_actions;
drop policy if exists "pending_actions_manage_ops_only" on public.pending_actions;
drop policy if exists "pending_actions_update_visible_targets" on public.pending_actions;

create policy "pending_actions_select_role_scoped"
on public.pending_actions
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(target_emp_id)
    or lower(coalesce(target_role, '')) in ('all', public.arth_current_role())
);

create policy "pending_actions_manage_ops_only"
on public.pending_actions
for insert
to authenticated
with check (public.arth_is_ops_role());

create policy "pending_actions_update_visible_targets"
on public.pending_actions
for update
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(target_emp_id)
    or lower(coalesce(target_role, '')) in ('all', public.arth_current_role())
)
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(target_emp_id)
    or lower(coalesce(target_role, '')) in ('all', public.arth_current_role())
);

drop policy if exists "workflow_events_select_role_scoped" on public.workflow_events;
drop policy if exists "workflow_events_insert_actor_scoped" on public.workflow_events;
drop policy if exists "workflow_events_delete_super_admin_only" on public.workflow_events;

create policy "workflow_events_select_role_scoped"
on public.workflow_events
for select
to authenticated
using (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(actor_emp_id)
    or public.arth_is_self_employee(target_emp_id)
    or lower(coalesce(target_role, '')) in ('all', public.arth_current_role())
);

create policy "workflow_events_insert_actor_scoped"
on public.workflow_events
for insert
to authenticated
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(actor_emp_id)
    or lower(coalesce(actor_role, '')) = public.arth_current_role()
);

create policy "workflow_events_delete_super_admin_only"
on public.workflow_events
for delete
to authenticated
using (public.arth_is_super_admin());

drop policy if exists "audit_logs_select_ops_only" on public.audit_logs;
drop policy if exists "audit_logs_insert_authenticated_actor" on public.audit_logs;
drop policy if exists "audit_logs_delete_super_admin_only" on public.audit_logs;

create policy "audit_logs_select_ops_only"
on public.audit_logs
for select
to authenticated
using (public.arth_is_ops_role());

create policy "audit_logs_insert_authenticated_actor"
on public.audit_logs
for insert
to authenticated
with check (
    public.arth_is_ops_role()
    or public.arth_is_self_employee(actor_emp_id)
    or lower(coalesce(actor_role, '')) = public.arth_current_role()
);

create policy "audit_logs_delete_super_admin_only"
on public.audit_logs
for delete
to authenticated
using (public.arth_is_super_admin());

grant select, insert, update, delete on
    public.notifications,
    public.pending_actions,
    public.workflow_events,
    public.audit_logs
to authenticated;

