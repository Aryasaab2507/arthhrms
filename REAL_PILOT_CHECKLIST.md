# ARTHHRMS Real Company Pilot Checklist

Use this checklist before onboarding the first real company dataset. Pilot rollout must stay controlled, reversible, and observable.

## 1. Environment And SQL Setup

- Set environment to `PILOT` from Platform Control Center.
- Confirm `DEMO_MODE=false`.
- Record the exact HTTPS application origin as `APP_ORIGIN`; do not use wildcards or preview hosts.
- Confirm `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured for the pilot project.
- Execute SQL in the documented order from `SUPABASE_EXECUTION_ORDER.md`.
- Verify core tables before activation: employees, attendance, leave requests, expense claims, payroll, notifications/workflow, import batches, staging tables, auth invitations, platform governance, storage policies, RLS hardening, security tests.

## 2. Storage Setup

- Create required buckets: `employee-docs`, `expense-attachments`, `payroll-exports`, `profile-photos`.
- Apply `context/sql/storage_policies.sql`.
- Keep `USE_SUPABASE_STORAGE=false` until bucket policies are verified.

## 3. Auth And Invite Setup

- Run `npm run pilot:configure -- --env-file <ignored-operator-env> --apply`.
- Verify Supabase Auth Site URL equals `APP_ORIGIN`.
- Verify the only production invite callback is `${APP_ORIGIN}/auth-callback.html`.
- Verify hosted Edge Function `ALLOWED_ORIGINS` equals the exact `APP_ORIGIN`.
- Run `npm run pilot:onboard-owner -- --env-file <ignored-operator-env> --apply`.
- Confirm the Platform Owner invitation was accepted and its role is present only in trusted `app_metadata`.
- Run `npm run pilot:onboard-admin -- --env-file <ignored-operator-env> --apply`.
- Confirm the first Super Admin has exact `tenant_id` and `organization_id` claims in trusted `app_metadata`.
- Configure `INVITE_USER_ENDPOINT`.
- Configure `AUTH_INVITE_REDIRECT_URL` to the deployed `auth-callback.html`.
- Configure `PASSWORD_RECOVERY_REDIRECT_URL` independently as the production `auth-callback.html?flow=recovery` URL.
- Confirm `USE_SUPABASE_AUTH=true` and `USE_SUPABASE_INVITES=true`.
- Confirm role and employee authorization uses app metadata, not user-editable metadata.
- Confirm platform owner and at least one HR/Admin operator are active.
- Remove `SUPABASE_SERVICE_ROLE_KEY` and onboarding identity variables from the operator shell after onboarding.
- Retain the generated identity and audit records as release evidence.

## 4. Employee Master Import Order

- Import employees first.
- Use only the Data Import Center staging flow.
- Do not commit raw Excel rows directly to live structures.
- Resolve failed validation rows before pilot/production commit.
- Validate duplicate employee IDs, duplicate emails, duplicate phones, manager hierarchy, shift IDs, role values, and archived/suspended records.
- Create a deployment checkpoint before commit.

## 5. Controlled Invite Activation

- Open Platform Control Center -> Pilot Onboarding.
- Run Readiness.
- Review bulk invite preview.
- Confirm invite endpoint is configured.
- Send staged invites in pilot-sized batches only.
- Review failed invites and use Resend Failed Invites after fixing configuration or data errors.
- Track pending, failed, and activated users from the Pilot Onboarding dashboard.

## 6. Workflow Validation

- Validate Workflow Engine is loaded.
- Validate Notification Dispatcher is loaded.
- Validate audit logging is available.
- Validate Operations Monitoring is loaded.
- Smoke test role routing for employee, manager, admin, HR, super admin, and platform owner.

## 7. Attendance And Leave Activation

- Activate employees before attendance and leave.
- Verify attendance table health before enabling HYBRID/LIVE.
- Verify leave table health before enabling HYBRID/LIVE.
- Run attendance check-in/check-out smoke test.
- Run leave apply -> manager decision -> HR final action smoke test.

## 8. Payroll Activation

- Keep payroll LOCAL until employee, attendance, leave, expense, and workflow checks are healthy.
- Create a checkpoint before payroll generation.
- Keep pilot payroll batches within pilot limits.
- Confirm duplicate payroll month prevention.
- Confirm payslip visibility after paid status.

## 9. QA And Monitoring

- Confirm the hosted page is HTTPS and the browser session uses PKCE (`flowType=pkce`) with no tokens in the callback fragment.
- Run authenticated create/read/update/delete validation for employee, attendance, leave, payroll, report, and document records.
- Confirm every temporary validation record and validation identity is removed after the run.
- Confirm a second tenant cannot read or mutate the pilot tenant validation records.
- Run `qa-validation.html`.
- Run Enterprise Test Lab small or medium suite.
- Open `operations-monitoring.html` and run Health Check.
- Resolve active critical incidents before next activation step.
- Confirm import, invite, payroll, workflow, and notification incidents are visible when failures occur.

## 10. Rollback Preparation

- Create a checkpoint before each major activation step.
- Keep every module in LOCAL or HYBRID until table health and RLS checks pass.
- If a module fails, use Platform Control Center to force it back to LOCAL.
- If an import batch is bad, use rollback by `importBatchId`.
- Review deployment logs, audit logs, and operation incidents before retrying.

## Pilot Go Criteria

- Company setup is complete.
- Platform owner exists and is active.
- HR/Admin operator exists and is active.
- Employee master import has zero failed commit rows.
- Invite endpoint is configured.
- No duplicate identity conflicts remain.
- Manager hierarchy is valid.
- Workflow, notification, audit, and monitoring services are loaded.
- At least one deployment checkpoint exists.
- Operations Monitoring has no unresolved critical incidents.
