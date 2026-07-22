# DB Field Map

Purpose: document legacy collection names and their authenticated Supabase projection mappings.

## Core Collections
- `users`
- `employees`
- `attendance`
- `leaveRequests`
- `payroll`
- `teams`

## Workflow Collections
- `expenseClaims`
- `performanceGoals`
- `appraisals`
- `strategicDeliverables`
- `deliverableReviews`
- `notifications`
- `auditLogs`

## Rule
Employee-linked records should use `empId` as the relationship key.

## Employee Identity Standard
- Official employee IDs use `ARTH-EMP-YYYY-0001` format.
- Legacy demo IDs such as `EMP001` or `EMP1001` are kept only as aliases through `legacyEmpId`, `legacyIds`, `employeeCode`, or `companyEmployeeCode`.
- Relationship fields must resolve to official `empId` values before save/import.
- Manager relationships use `managerId` and must point to an existing official employee ID.

## Duplicate Checks
- Employee master: duplicate `empId`, `email`, and `mobile`/`phone`.
- Attendance: duplicate `empId` + `date`.
- Payroll: duplicate `empId` + `month`.
