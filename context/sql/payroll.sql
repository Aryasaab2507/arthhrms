-- ARTHHRMS payroll foundation for Supabase.
-- Apply after public.employees exists and employee emp_id values are normalized.
-- Runtime service table names: public.salary_structures, public.payroll_cycles,
-- public.payroll_records, public.payslips.

create table if not exists public.salary_structures (
    id uuid primary key default gen_random_uuid(),
    structure_id text not null unique,
    emp_id text not null references public.employees(emp_id) on update cascade on delete restrict,
    effective_from date not null,
    effective_to date,
    basic_salary numeric(12,2) not null default 0 check (basic_salary >= 0),
    hra numeric(12,2) not null default 0 check (hra >= 0),
    allowances numeric(12,2) not null default 0 check (allowances >= 0),
    deductions numeric(12,2) not null default 0 check (deductions >= 0),
    reimbursement_eligibility numeric(12,2) not null default 0 check (reimbursement_eligibility >= 0),
    overtime_rate numeric(12,2) not null default 0 check (overtime_rate >= 0),
    bonus_placeholder numeric(12,2) not null default 0 check (bonus_placeholder >= 0),
    currency text not null default 'INR' check (char_length(currency) = 3),
    status text not null default 'Active' check (status in ('Active', 'Inactive')),
    remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint salary_structures_effective_range check (
        effective_to is null or effective_to >= effective_from
    )
);

create table if not exists public.payroll_cycles (
    id uuid primary key default gen_random_uuid(),
    cycle_id text not null unique,
    payroll_month text not null,
    month_start date not null,
    month_end date not null,
    status text not null default 'Draft' check (status in ('Draft', 'Processing', 'Approved', 'Paid', 'Closed', 'Cancelled')),
    processed_by text,
    processed_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payroll_cycles_month_range check (month_end >= month_start),
    constraint payroll_cycles_month_unique unique (payroll_month)
);

create table if not exists public.payroll_records (
    id uuid primary key default gen_random_uuid(),
    payroll_id text not null unique,
    emp_id text not null references public.employees(emp_id) on update cascade on delete restrict,
    payroll_month text not null,
    cycle_id text references public.payroll_cycles(cycle_id) on update cascade on delete set null,
    basic_salary numeric(12,2) not null default 0 check (basic_salary >= 0),
    allowances numeric(12,2) not null default 0 check (allowances >= 0),
    deductions numeric(12,2) not null default 0 check (deductions >= 0),
    leave_deductions numeric(12,2) not null default 0 check (leave_deductions >= 0),
    expense_reimbursements numeric(12,2) not null default 0 check (expense_reimbursements >= 0),
    overtime_amount numeric(12,2) not null default 0 check (overtime_amount >= 0),
    bonus_amount numeric(12,2) not null default 0 check (bonus_amount >= 0),
    gross_salary numeric(12,2) not null default 0 check (gross_salary >= 0),
    net_salary numeric(12,2) not null default 0 check (net_salary >= 0),
    payroll_status text not null default 'Pending' check (payroll_status in ('Pending', 'Approved', 'Paid', 'Hold', 'Rejected', 'Cancelled')),
    processed_by text,
    processed_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    paid_at timestamptz,
    paid_on date,
    remarks text,
    calculation_meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payroll_records_employee_month_unique unique (emp_id, payroll_month),
    constraint payroll_records_paid_requires_paid_status check (
        paid_at is null or payroll_status = 'Paid'
    )
);

create table if not exists public.payslips (
    id uuid primary key default gen_random_uuid(),
    payslip_id text not null unique,
    payroll_id text not null references public.payroll_records(payroll_id) on update cascade on delete restrict,
    emp_id text not null references public.employees(emp_id) on update cascade on delete restrict,
    payroll_month text not null,
    employee_snapshot jsonb not null default '{}'::jsonb,
    earnings jsonb not null default '{}'::jsonb,
    deductions jsonb not null default '{}'::jsonb,
    reimbursements jsonb not null default '{}'::jsonb,
    net_salary numeric(12,2) not null default 0 check (net_salary >= 0),
    status text not null default 'Generated' check (status in ('Generated', 'Issued', 'Cancelled')),
    generated_at timestamptz not null default now(),
    issued_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payslips_payroll_unique unique (payroll_id)
);

create unique index if not exists salary_structures_structure_id_idx on public.salary_structures (structure_id);
create index if not exists salary_structures_emp_id_idx on public.salary_structures (emp_id);
create index if not exists salary_structures_effective_idx on public.salary_structures (emp_id, effective_from desc);
create index if not exists salary_structures_status_idx on public.salary_structures (status);

create unique index if not exists payroll_cycles_cycle_id_idx on public.payroll_cycles (cycle_id);
create index if not exists payroll_cycles_month_start_idx on public.payroll_cycles (month_start desc);
create index if not exists payroll_cycles_status_idx on public.payroll_cycles (status);

create unique index if not exists payroll_records_payroll_id_idx on public.payroll_records (payroll_id);
create index if not exists payroll_records_emp_id_idx on public.payroll_records (emp_id);
create index if not exists payroll_records_month_idx on public.payroll_records (payroll_month);
create index if not exists payroll_records_status_idx on public.payroll_records (payroll_status);
create index if not exists payroll_records_emp_month_idx on public.payroll_records (emp_id, payroll_month);
create index if not exists payroll_records_processed_at_idx on public.payroll_records (processed_at desc);

create unique index if not exists payslips_payslip_id_idx on public.payslips (payslip_id);
create index if not exists payslips_emp_id_idx on public.payslips (emp_id);
create index if not exists payslips_month_idx on public.payslips (payroll_month);

alter table public.salary_structures enable row level security;
alter table public.payroll_cycles enable row level security;
alter table public.payroll_records enable row level security;
alter table public.payslips enable row level security;

-- Conservative starter policies.
-- Final production policies should be reviewed with the final app_metadata role/empId model.
drop policy if exists "salary_structures_select_authenticated" on public.salary_structures;
create policy "salary_structures_select_authenticated"
on public.salary_structures
for select
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    or exists (
        select 1 from public.employees e
        where e.emp_id = salary_structures.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
);

drop policy if exists "salary_structures_manage_payroll_roles" on public.salary_structures;
create policy "salary_structures_manage_payroll_roles"
on public.salary_structures
for all
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'))
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'));

drop policy if exists "payroll_cycles_select_authenticated" on public.payroll_cycles;
create policy "payroll_cycles_select_authenticated"
on public.payroll_cycles
for select
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'));

drop policy if exists "payroll_cycles_manage_payroll_roles" on public.payroll_cycles;
create policy "payroll_cycles_manage_payroll_roles"
on public.payroll_cycles
for all
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'))
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'));

drop policy if exists "payroll_records_select_authenticated" on public.payroll_records;
create policy "payroll_records_select_authenticated"
on public.payroll_records
for select
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    or exists (
        select 1 from public.employees e
        where e.emp_id = payroll_records.emp_id
          and e.manager_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
    )
);

drop policy if exists "payroll_records_manage_payroll_roles" on public.payroll_records;
create policy "payroll_records_manage_payroll_roles"
on public.payroll_records
for all
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'))
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'));

drop policy if exists "payslips_select_authenticated" on public.payslips;
create policy "payslips_select_authenticated"
on public.payslips
for select
to authenticated
using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance')
    or emp_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'empId', auth.jwt() -> 'app_metadata' ->> 'emp_id', '')
);

drop policy if exists "payslips_manage_payroll_roles" on public.payslips;
create policy "payslips_manage_payroll_roles"
on public.payslips
for all
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'))
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hr', 'admin', 'super_admin', 'finance'));

drop trigger if exists salary_structures_set_updated_at on public.salary_structures;
create trigger salary_structures_set_updated_at
before update on public.salary_structures
for each row
execute function public.set_updated_at();

drop trigger if exists payroll_cycles_set_updated_at on public.payroll_cycles;
create trigger payroll_cycles_set_updated_at
before update on public.payroll_cycles
for each row
execute function public.set_updated_at();

drop trigger if exists payroll_records_set_updated_at on public.payroll_records;
create trigger payroll_records_set_updated_at
before update on public.payroll_records
for each row
execute function public.set_updated_at();

drop trigger if exists payslips_set_updated_at on public.payslips;
create trigger payslips_set_updated_at
before update on public.payslips
for each row
execute function public.set_updated_at();

