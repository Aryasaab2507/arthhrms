# ARTHHRMS Real Company Onboarding Checklist

Use this checklist before onboarding a real company into ARTHHRMS.

## 1. Environment Setup

- Start in `DEVELOPMENT` mode for local verification.
- Move to `PILOT` mode for controlled real-world testing.
- Move to `PRODUCTION` mode only after QA validation, RLS tests, and rollback checkpoints are ready.
- Use `.env.pilot` for pilot deployment configuration.
- Keep `DEMO_MODE=false` outside local development.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend files.

## 2. Supabase SQL Execution

Apply SQL in the order documented in `SUPABASE_EXECUTION_ORDER.md`:

1. employees
2. attendance
3. leaveRequests
4. expenseClaims
5. payroll
6. notifications_workflow
7. import_batches
8. staging tables
9. auth_invitations
10. platform_governance
11. storage_policies
12. rls_security_hardening
13. security_policy_tests

After each module, verify table health from Platform Control Center before switching the module to `HYBRID` or `LIVE`.

## 3. Storage Bucket Setup

Create and secure these buckets before live file uploads:

- `employee-docs`
- `expense-attachments`
- `payroll-exports`
- `profile-photos`

Confirm storage policies are applied before enabling `USE_SUPABASE_STORAGE=true`.

## 4. Platform Owner + Admin Creation

- Complete first-time setup.
- Create platform owner.
- Create initial HR/admin user.
- Disable demo credentials.
- Use invite-based onboarding for real users.

## 5. Pilot Rollout Process

- Set Platform Control Center environment to `PILOT`.
- Create a deployment checkpoint.
- Activate only `employees` first.
- Import a limited employee sample.
- Validate login, employee master, attendance, leave, expense, payroll, notification, and import workflows.
- Keep payroll generation under pilot limits.

## 6. Import Sequence

- Employee master import first.
- Attendance import second.
- Leave and expense imports only after employees are stable.
- Payroll import/generation last.
- All imports must stage, validate, preview, approve, and commit.
- Large imports remain blocked in pilot/production until migration health checks pass.

## 7. QA Validation Sequence

- Open `qa-validation.html`.
- Run QA Validation.
- Open `enterprise-test-lab.html`.
- Run at least the Medium Company full Enterprise Test Suite.
- Confirm the test lab history shows isolation verified.
- Review failed validations and warnings.
- Open `operations-monitoring.html`, run Health Check, and confirm there are no unresolved critical incidents.
- Run Supabase RLS policy tests from `context/sql/security_policy_tests.sql`.
- Create a new deployment checkpoint after the validation run passes.

## 8. Production Activation

- Confirm `PRODUCTION_MODE=true`, `PILOT_MODE=false`, `DEVELOPMENT_MODE=false`, `DEMO_MODE=false`.
- Confirm Supabase Auth and app metadata role mapping.
- Confirm RLS policy tests pass.
- Confirm rollback checkpoint exists.
- Confirm Platform Control Center shows healthy migration status.
- Activate modules one by one: employees, attendance, leave, expense, payroll.

## 9. Rollback Readiness

- Before critical rollout actions, create a deployment checkpoint.
- If a module fails, set it back to `LOCAL` mode from Platform Control Center.
- Review deployment logs and migration logs before retrying.

## 10. Go/No-Go Criteria

Go only when:

- QA score is acceptable for rollout.
- Enterprise Test Lab suite passes without live data pollution.
- No critical validation failures remain.
- RLS visibility tests pass.
- Import staging and rollback are verified.
- Payroll duplicate prevention and safety prompts work.
- Notifications and audit logs are generated for critical workflows.
- Operations Monitoring shows no unresolved critical incidents and no active import/payroll failure signals.
