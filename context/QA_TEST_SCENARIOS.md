# ARTHHRMS QA Test Scenarios

Production readiness tests for the authenticated Supabase persistence architecture.

## 1. Authentication

Steps:
- Open `ArthHRMS.html`.
- Login as employee, manager, admin, HR, and super admin using provisioned Supabase test identities.
- Refresh each dashboard after login.
- Logout from each dashboard.
- In production-mode test config, confirm no local password fallback exists.
- Send a Supabase invite for a test employee and accept the email invite.

Expected result:
- Correct role dashboard opens after login.
- Session survives refresh when valid.
- Logout clears local session and returns to login.
- Invite-accepted users link to the intended `empId` and role.

Pass/fail:
- Pass when no role lands on another role dashboard.
- Fail if an invalid/stale session opens protected data.
- Fail if an unverified Supabase user can open protected dashboards.

## 2. Attendance

Steps:
- Login as an employee.
- Mark check in for today.
- Refresh employee dashboard.
- Mark check out.
- Review manager/HR attendance views.

Expected result:
- Duplicate same-day check in is blocked.
- Check in, check out, working hours, and status render correctly.
- Manager/HR views reflect the same attendance record.

Pass/fail:
- Pass when employee, manager, and HR all resolve the same `empId` attendance row.
- Fail if data depends on employee name only or shows endless loading.

## 3. Leave Workflow

Steps:
- Employee applies leave.
- Manager approves or rejects.
- If approved, HR gives final approval or rejection.
- Employee checks notifications and leave status.

Expected result:
- Leave moves through employee to manager to HR.
- Notifications and audit logs are created at each major step.
- Duplicate approvals are blocked by status.

Pass/fail:
- Pass when final status is consistent across employee, manager, and HR views.
- Fail if manager can approve unrelated employee leave.

## 4. Expense Workflow

Steps:
- Employee submits an expense claim.
- Manager approves/rejects.
- HR/finance marks approved claim paid or rejected.
- Employee reviews final status.

Expected result:
- Expense routes employee to manager to HR/finance.
- Paid claims include paid date/status.
- Notifications and audit logs are created.

Pass/fail:
- Pass when pending widgets update after each decision.
- Fail if a paid claim stays pending or a rejected claim can be paid.

## 5. Payroll Workflow

Steps:
- HR generates payroll for current month.
- HR attempts duplicate generation for same month.
- HR approves a payroll record.
- HR marks it paid.
- Employee views payslip data.

Expected result:
- Duplicate monthly payroll is skipped.
- Net salary is never negative.
- Payslip model includes employee details, earnings, deductions, reimbursements, and month.

Pass/fail:
- Pass when duplicate generation reports skipped rows.
- Fail if payroll can be generated twice for the same employee/month.

## 6. Import Workflow

Steps:
- HR opens Data Import Center.
- Upload employee, attendance, and payroll Excel samples.
- Confirm validation preview.
- Commit only validated rows.
- Review import history.
- Roll back a rollback-eligible batch in test data.

Expected result:
- Uploaded rows enter staging first.
- Failed rows do not commit to live tables.
- Import logs include batch counts and actor.

Pass/fail:
- Pass when no raw Excel rows bypass staging.
- Fail if invalid rows alter live employees, attendance, or payroll.

## 7. Notifications

Steps:
- Trigger leave, expense, payroll, attendance regularization, and import actions.
- Open bell dropdowns for target roles.
- Mark notifications read.

Expected result:
- Unread counts decrease after read.
- Role and employee-targeted notifications are visible only to intended targets.

Pass/fail:
- Pass when notification counts match unread records.
- Fail if another employee sees private notifications.

## 8. Role Access Control

Steps:
- Login as each role.
- Attempt to open each role dashboard URL directly.
- Test manager visibility for own team and unrelated employees.

Expected result:
- Route guard redirects mismatched roles to login.
- Manager sees only assigned team data.
- HR/admin/super admin retain their intended operational visibility.

Pass/fail:
- Pass when protected pages reject wrong roles.
- Fail if an employee can open payroll, admin, or HR operational records.

## 9. RLS Visibility

Steps:
- Apply SQL from `context/sql/rls_security_hardening.sql` in a Supabase test project.
- Run examples from `context/sql/security_policy_tests.sql`.
- Test employee, manager, HR/admin, and super admin JWT role claims.

Expected result:
- Employees see only own rows.
- Managers see direct-team rows.
- HR/admin/super admin see broader permitted rows.

Pass/fail:
- Pass when all policy tests match the role visibility matrix.
- Fail if anon or unrelated authenticated users can query protected rows.

## 10. Fallback Mode

Steps:
- Keep Supabase feature flags disabled.
- Repeat authentication, attendance, leave, expense, payroll, and import smoke tests.
- Enable one Supabase flag in a test environment without breaking local fallback.

Expected result:
- Local mode continues to work with current data.
- Supabase errors show user-friendly messages and do not corrupt local data.

Pass/fail:
- Pass when failed live calls return safe fallback or clear errors.
- Fail if a timeout leaves disabled buttons, loading text, or partial data.

## 11. Pilot Deployment Safety

Steps:
- Open Platform Control Center.
- Switch environment to `PILOT`.
- Create a deployment checkpoint.
- Attempt an employee import above the pilot row limit.
- Attempt payroll generation above the pilot employee limit.
- Run `qa-validation.html` validation.

Expected result:
- Environment displays as PILOT.
- Deployment checkpoint is recorded.
- Large imports and large payroll runs are blocked or require explicit warning confirmation.
- QA validation records module health, workflow simulation status, migration readiness, and RLS readiness.

Pass/fail:
- Pass when pilot mode prevents unsafe scale actions before production.
- Fail if pilot mode allows massive imports, bulk payroll, or environment changes without warnings/logs.

## 12. Enterprise Test Lab Simulation

Steps:
- Open `enterprise-test-lab.html`.
- Generate the Small Company dataset.
- Run Workflow, Permissions, Edge Cases, Failure Modes, and Stress checks.
- Run the full Enterprise Test Suite with the Medium Company preset.
- Confirm live employee, attendance, leave, expense, payroll, and notification counts remain unchanged.

Expected result:
- Test data is marked isolated and never committed to live DB arrays.
- Workflow simulation covers leave approval, expense payment, payroll generation, and invite acceptance.
- Permission simulation checks employee isolation, manager team visibility, HR broad access, platform owner override, and feature flag restriction modeling.
- Stress simulation reports notification spike, concurrent approvals, payroll load, dashboard query load, and import safety behavior.
- Test lab run history records score, warnings, failed checks, and isolation status.

Pass/fail:
- Pass when full suite completes with isolation verified and no live data pollution.
- Fail if test records appear in production employee/payroll/import tables or if failed permission checks are hidden.

## 13. Operations Monitoring

Steps:
- Open `operations-monitoring.html`.
- Run Health Check.
- Create a test incident and resolve it.
- Trigger a known service warning in development, such as a blocked pilot import or blocked payroll run.
- Confirm Operations Monitoring records the incident, service error or performance metric, and recovery action.

Expected result:
- Health cards show database, auth, storage, workflow, notification, export, import, payroll, and migration status.
- Active incidents show severity, module, description, status, and resolution action.
- Slow operations and failed workflow/import/payroll signals appear without breaking the original workflow.
- Retention cleanup trims logs without removing live business records.

Pass/fail:
- Pass when incidents, errors, metrics, and recovery actions are visible and resolvable.
- Fail if failures only appear in the browser console or if monitoring hooks change workflow outcomes.
