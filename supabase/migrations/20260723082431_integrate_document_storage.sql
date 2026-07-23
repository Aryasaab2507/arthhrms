-- Align private document object access with the existing document workflows.
-- Shared files remain tenant scoped and only operations roles may create them.

drop policy if exists "arth_employee_docs_select" on storage.objects;
create policy "arth_employee_docs_select"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'employee-docs'
    and public.arth_persistence_tenant_allowed((storage.foldername(name))[1])
    and (
        public.arth_persistence_is_ops()
        or public.arth_storage_is_own_path(name)
        or (storage.foldername(name))[2] = 'shared'
    )
);

drop policy if exists "arth_employee_docs_delete" on storage.objects;
create policy "arth_employee_docs_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'employee-docs'
    and public.arth_persistence_tenant_allowed((storage.foldername(name))[1])
    and (
        public.arth_persistence_is_ops()
        or public.arth_storage_is_own_path(name)
    )
);
