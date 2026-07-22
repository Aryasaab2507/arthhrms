# Trigger Map

Purpose: document workflow side effects that must survive migration.

## Notification Triggers
- Employee actions notify the responsible role.
- Manager decisions notify HR or employee as needed.
- HR closures notify the affected employee.

## Audit Triggers
- Major workflow create, approve, reject, pay, regularize, review, and close actions should write audit logs.

## Migration Note
Do not move triggers out of `db.js` until each equivalent service method has tests or smoke checks.
