-- ARTHHRMS RLS policy smoke-test snippets.
-- Run in a Supabase SQL session by replacing the JWT claim JSON values below.
-- These examples use PostgREST request settings to simulate authenticated claims.

-- Employee: should see only own profile/payroll/attendance/leave/expense rows.
select set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'employee', 'empId', 'ARTH-EMP-2026-0002'),
    'sub', '00000000-0000-0000-0000-000000000002'
)::text, true);

select count(*) as employee_visible_employees
from public.employees;

select count(*) as employee_visible_payroll
from public.payroll_records;

-- Manager: should see direct reports through employees.manager_id.
select set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'manager', 'empId', 'ARTH-EMP-2026-0001'),
    'sub', '00000000-0000-0000-0000-000000000001'
)::text, true);

select emp_id, manager_id
from public.employees
order by emp_id;

select emp_id, attendance_date
from public.attendance
order by attendance_date desc;

-- HR: should see organization operational data.
select set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'hr'),
    'sub', '00000000-0000-0000-0000-000000000003'
)::text, true);

select count(*) as hr_visible_employees
from public.employees;

select count(*) as hr_visible_audit_logs
from public.audit_logs;

-- Clear simulated JWT request state after local SQL testing.
select set_config('request.jwt.claims', '', true);

