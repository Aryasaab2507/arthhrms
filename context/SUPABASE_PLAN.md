# Supabase Plan

Purpose: outline the future backend migration boundary.

## Near-Term Rule
Supabase is introduced as an optional service-layer backend only. Keep live flags disabled until schema, RLS, and role mapping are verified.

## Current Foundation
- `services/supabaseClient.js` reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and migration flags from injected frontend config or meta tags.
- `USE_SUPABASE_EMPLOYEES=false` keeps employee master on local `db.js`.
- `USE_SUPABASE_ATTENDANCE=false` keeps attendance on local `db.js` while live attendance SQL and service methods are prepared.
- `USE_SUPABASE_LEAVE=false` keeps leave workflows on local `db.js` while live leave SQL and service methods are prepared.
- `employeeService.js` has async `getEmployeesLive()`, `createEmployeeLive()`, and `updateEmployeeLive()` paths with local fallback.
- `authService.js` has hybrid login, Supabase password sign-in, session restore, auth state tracking, logout, and role redirect helpers.
- `importService.js` has `executeImportLive()` for future employee, attendance, and leave imports through Supabase mode.
- `.env.example` documents required variables without real secrets.
- `context/sql/employees.sql` contains the starter normalized employees table.
- `context/sql/attendance.sql` contains the starter attendance table with unique `emp_id + attendance_date`, employee relation, indexes, and RLS starter policies.
- `context/sql/leaveRequests.sql` contains the starter leave requests table with employee relation, date constraints, workflow statuses, indexes, and RLS starter policies.

## Intended Direction
- Keep service adapters as the UI boundary.
- Replace adapter internals with Supabase/API calls later.
- Preserve `empId` relationships.
- Move notification and audit triggers carefully after workflow tests exist.
- Do not expose service-role keys in frontend code.
- Keep RLS enabled on exposed public tables.

## Open Work
- Final Supabase Auth user provisioning and `app_metadata.role` / `app_metadata.empId` assignment.
- Table schema review in live Supabase project
- Row-level access policy review against final roles
- File storage plan
