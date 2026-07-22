# ARTHHRMS Operations Monitoring

## Purpose

The Operations Monitoring Center tracks production reliability signals without changing live workflow behavior.

## Current Signals

- System health: database, Supabase/Auth configuration, storage, workflow engine, notifications, exports, imports, payroll, and migration health.
- Incidents: severity, affected module, status, recovery action, audit/deployment linkage, and resolution note.
- Errors: frontend/service errors captured through the centralized error service and browser error hooks.
- Performance: slow workflows, import commits, payroll generation, and tracked service operations.

## Recovery Flow

1. Open `operations-monitoring.html`.
2. Run Health Check.
3. Review active incidents and pending recovery actions.
4. Create a deployment checkpoint before risky recovery work.
5. Resolve incidents only after source workflow state is reviewed.

## Retention

Monitoring data is local-first and retained in bounded arrays:
- incidents
- operation metrics
- service error logs

Use the Retention Cleanup action to trim older operational telemetry without touching employee, payroll, attendance, leave, expense, or import records.
