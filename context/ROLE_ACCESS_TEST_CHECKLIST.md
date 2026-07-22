# ARTHHRMS Role Access Test Checklist

Use this checklist after enabling Supabase Auth or changing dashboard route guards.

## Employee

- Can open only `employee-portal.html`.
- Can view own profile, attendance, leaves, expenses, payroll, notifications, and deliverables.
- Cannot view another employee record by changing an ID in browser state or service calls.

## Manager

- Can open only `manager.html`.
- Can view assigned team employees, attendance, leave requests, expense claims, reviews, and deliverables.
- Cannot view unrelated teams.

## Admin

- Can open only `admin.html`.
- Can operate document verification, attendance regularization, helpdesk, and onboarding desks.
- Cannot use super admin owner controls.

## HR

- Can open only `hr-dashboard.html`.
- Can access employee master, leave final approvals, expense payment, imports, payroll processing, recruitment, lifecycle, and deliverables.
- Payroll changes must generate audit logs.

## Super Admin

- Can open only `super-admin.html`.
- Can view organization-wide controls, audit logs, settings, permissions, backups, and owner analytics.

## Regression Criteria

- Wrong-role direct URL access redirects to `ArthHRMS.html`.
- Notification counts do not leak private employee data.
- Local fallback works only when production demo restrictions allow it.
