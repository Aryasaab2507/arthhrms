# ARTHHRMS Platform Governance

## Purpose

Platform Control Center is the root governance layer above operational dashboards.
It controls feature visibility, role access, presets, maintenance/safe mode, emergency disables, and platform branding.

## Role Hierarchy

- `platform_owner`: root governance authority
- `super_admin`: organization owner / operational control authority
- `hr`: HR command role
- `admin`: HR operations desk role
- `manager`: team approval and review role
- `employee`: self-service role

## Feature Flag Shape

Each governed feature stores:

- `key`
- `label`
- `enabled`
- `experimental`
- `emergencyDisabled`
- `roles`

Role access is additive. `platform_owner` remains a root override so it cannot lock itself out of governance.

## Presets

- `SMALL_BUSINESS`: keeps core HR operations active and hides advanced enterprise modules.
- `STANDARD_COMPANY`: restores default balanced module access.
- `ENTERPRISE_MODE`: enables all standard enterprise modules while preserving experimental feature status.

## Safe Fallback

Disabling a feature only hides and guards UI/module access.
It does not delete records or remove code paths.
Existing Supabase records remain intact and become available when a feature is re-enabled.

## Future Backend Mapping

Supabase foundation lives in `context/sql/platform_governance.sql`:

- `platform_governance`
- `platform_feature_flags`
- `platform_feature_role_access`

Only authenticated users with `app_metadata.role = platform_owner` can mutate platform governance tables.
