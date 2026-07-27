begin;

create index if not exists company_setup_audit_outbox_workspace_idx
on public.company_setup_audit_outbox (workspace_id);

create index if not exists company_setup_audit_outbox_actor_idx
on public.company_setup_audit_outbox (actor_user_id);

create index if not exists company_setup_step_versions_company_idx
on public.company_setup_step_versions (company_id);

create index if not exists company_setup_step_versions_actor_idx
on public.company_setup_step_versions (actor_user_id);

create index if not exists company_setup_workspaces_created_by_idx
on public.company_setup_workspaces (created_by);

create index if not exists company_setup_workspaces_updated_by_idx
on public.company_setup_workspaces (updated_by);

commit;
