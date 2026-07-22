-- ArthHRMS private Supabase Storage policies.
-- Apply after authenticated_business_persistence.sql.
-- Required object path: {tenantId}/{empId}/...

insert into storage.buckets (id, name, public)
values
    ('employee-docs', 'employee-docs', false),
    ('expense-attachments', 'expense-attachments', false),
    ('payroll-exports', 'payroll-exports', false),
    ('profile-photos', 'profile-photos', false)
on conflict (id) do update set public = false;

create or replace function public.arth_storage_is_own_path(object_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
    select public.arth_persistence_tenant_allowed((storage.foldername(object_name))[1])
       and public.arth_persistence_emp_id() <> ''
       and (storage.foldername(object_name))[2] = public.arth_persistence_emp_id()
$$;

revoke all on function public.arth_storage_is_own_path(text) from public, anon;
grant execute on function public.arth_storage_is_own_path(text) to authenticated;

drop policy if exists "arth_employee_docs_select" on storage.objects;
drop policy if exists "arth_employee_docs_insert" on storage.objects;
drop policy if exists "arth_employee_docs_update" on storage.objects;
drop policy if exists "arth_employee_docs_delete" on storage.objects;
create policy "arth_employee_docs_select" on storage.objects for select to authenticated
using (bucket_id = 'employee-docs' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_employee_docs_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'employee-docs' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_employee_docs_update" on storage.objects for update to authenticated
using (bucket_id = 'employee-docs' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)))
with check (bucket_id = 'employee-docs' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_employee_docs_delete" on storage.objects for delete to authenticated
using (bucket_id = 'employee-docs' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and public.arth_persistence_is_ops());

drop policy if exists "arth_expense_attachments_select" on storage.objects;
drop policy if exists "arth_expense_attachments_insert" on storage.objects;
drop policy if exists "arth_expense_attachments_update" on storage.objects;
drop policy if exists "arth_expense_attachments_delete" on storage.objects;
create policy "arth_expense_attachments_select" on storage.objects for select to authenticated
using (bucket_id = 'expense-attachments' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_expense_attachments_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'expense-attachments' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_expense_attachments_update" on storage.objects for update to authenticated
using (bucket_id = 'expense-attachments' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)))
with check (bucket_id = 'expense-attachments' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_expense_attachments_delete" on storage.objects for delete to authenticated
using (bucket_id = 'expense-attachments' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and public.arth_persistence_is_ops());

drop policy if exists "arth_payroll_exports_select" on storage.objects;
drop policy if exists "arth_payroll_exports_insert_ops" on storage.objects;
drop policy if exists "arth_payroll_exports_update_ops" on storage.objects;
drop policy if exists "arth_payroll_exports_delete_ops" on storage.objects;
create policy "arth_payroll_exports_select" on storage.objects for select to authenticated
using (bucket_id = 'payroll-exports' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_payroll_exports_insert_ops" on storage.objects for insert to authenticated
with check (bucket_id = 'payroll-exports' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and public.arth_persistence_is_ops());
create policy "arth_payroll_exports_update_ops" on storage.objects for update to authenticated
using (bucket_id = 'payroll-exports' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and public.arth_persistence_is_ops())
with check (bucket_id = 'payroll-exports' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and public.arth_persistence_is_ops());
create policy "arth_payroll_exports_delete_ops" on storage.objects for delete to authenticated
using (bucket_id = 'payroll-exports' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and public.arth_persistence_is_ops());

drop policy if exists "arth_profile_photos_select" on storage.objects;
drop policy if exists "arth_profile_photos_insert" on storage.objects;
drop policy if exists "arth_profile_photos_update" on storage.objects;
drop policy if exists "arth_profile_photos_delete" on storage.objects;
create policy "arth_profile_photos_select" on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_profile_photos_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_profile_photos_update" on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)))
with check (bucket_id = 'profile-photos' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
create policy "arth_profile_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and public.arth_persistence_tenant_allowed((storage.foldername(name))[1]) and (public.arth_persistence_is_ops() or public.arth_storage_is_own_path(name)));
