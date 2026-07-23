-- Employees may delete only document metadata they uploaded for themselves.

drop policy if exists hrms_documents_self_delete on public.hrms_documents;
create policy hrms_documents_self_delete
on public.hrms_documents
for delete
to authenticated
using (
    public.arth_persistence_tenant_allowed(tenant_id)
    and subject_id = public.arth_persistence_emp_id()
    and lower(coalesce(payload ->> 'source', '')) = 'employee'
    and coalesce(payload ->> 'uploadedBy', payload ->> 'uploaded_by', '') = public.arth_persistence_emp_id()
);
