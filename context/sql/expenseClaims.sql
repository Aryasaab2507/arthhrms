-- ARTHHRMS expense claims table foundation for Supabase.
-- Apply after public.employees exists and employee emp_id values are normalized.
-- Runtime service table name: public.expense_claims.

create table if not exists public.expense_claims (
    id uuid primary key default gen_random_uuid(),
    expense_id text not null unique,
    emp_id text not null references public.employees(emp_id) on update cascade on delete restrict,
    category text not null,
    expense_date date not null,
    amount numeric(12,2) not null check (amount > 0),
    currency text not null default 'INR' check (char_length(currency) = 3),
    description text not null check (length(trim(description)) > 0),
    attachment_url text,
    attachment_file_name text,
    manager_status text not null default 'Pending'
        check (manager_status in ('Pending', 'Approved', 'Rejected', 'Not Required')),
    finance_status text not null default 'Pending'
        check (finance_status in ('Pending', 'Approved', 'Rejected', 'Paid', 'Not Required')),
    final_status text not null default 'Pending'
        check (final_status in ('Pending', 'Manager Approved', 'Approved', 'Rejected', 'Paid', 'Cancelled')),
    status text not null default 'Pending Manager Approval'
        check (status in ('Pending Manager Approval', 'Pending HR Payment', 'Finance Approved', 'Pending Payment', 'Paid', 'Rejected by Manager', 'Rejected by HR', 'Cancelled')),
    submitted_at timestamptz not null default now(),
    reviewed_at timestamptz,
    paid_at timestamptz,
    remarks text,
    manager_remark text,
    finance_remark text,
    source text not null default 'manual',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint expense_claims_paid_requires_paid_status check (
        paid_at is null or final_status = 'Paid'
    )
);

create unique index if not exists expense_claims_expense_id_idx on public.expense_claims (expense_id);
create index if not exists expense_claims_emp_id_idx on public.expense_claims (emp_id);
create index if not exists expense_claims_expense_date_idx on public.expense_claims (expense_date);
create index if not exists expense_claims_status_idx on public.expense_claims (status);
create index if not exists expense_claims_manager_status_idx on public.expense_claims (manager_status);
create index if not exists expense_claims_finance_status_idx on public.expense_claims (finance_status);
create index if not exists expense_claims_final_status_idx on public.expense_claims (final_status);
create index if not exists expense_claims_submitted_at_idx on public.expense_claims (submitted_at desc);
create index if not exists expense_claims_emp_status_idx on public.expense_claims (emp_id, status);

alter table public.expense_claims enable row level security;

-- Conservative starter policies.
-- Final production policies should be reviewed with the final app_metadata role/empId model.
drop policy if exists "expense_claims_select_authenticated" on public.expense_claims;
create policy "expense_claims_select_authenticated"
on public.expense_claims
for select
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    or exists (
        select 1 from public.employees e
        where e.emp_id = expense_claims.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
);

drop policy if exists "expense_claims_insert_employee_ops" on public.expense_claims;
create policy "expense_claims_insert_employee_ops"
on public.expense_claims
for insert
to authenticated
with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
);

drop policy if exists "expense_claims_update_manager_finance" on public.expense_claims;
create policy "expense_claims_update_manager_finance"
on public.expense_claims
for update
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or exists (
        select 1 from public.employees e
        where e.emp_id = expense_claims.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
)
with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or exists (
        select 1 from public.employees e
        where e.emp_id = expense_claims.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
);

drop trigger if exists expense_claims_set_updated_at on public.expense_claims;
create trigger expense_claims_set_updated_at
before update on public.expense_claims
for each row
execute function public.set_updated_at();

-- Attachment storage readiness:
-- Create a private Supabase Storage bucket named "expense-attachments" before enabling live uploads.
-- Runtime object path convention: {empId}/{expenseId}/{timestamp}-{safeFileName}.
