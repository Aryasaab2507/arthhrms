# ARTHHRMS Production Install Mode

## Modes

- `DEVELOPMENT_MODE=true`, `DEMO_MODE=true`: local developer/demo seed is allowed.
- `PRODUCTION_MODE=true`, `DEVELOPMENT_MODE=false`, `DEMO_MODE=false`: demo credentials are disabled and clean install is expected.

Production mode must use Supabase Auth and invite-based onboarding before real deployment.
Local bootstrap credentials created during first-time setup are for installation only and should be replaced by verified Supabase Auth identities.

## Clean Install Flow

1. `db.js` detects production clean install before seeding.
2. Empty company data is created instead of demo employees/users.
3. `ArthHRMS.html` redirects to `setup.html` when no platform owner exists.
4. Setup collects:
   - company details
   - platform owner
   - optional initial HR/Admin
5. Setup writes audit entries and marks `installState.setupCompleted=true`.
6. Platform Control Center shows install and environment health.

## Production Safety

- Known demo passwords are disabled in production mode.
- Local demo login is allowed only when both `DEVELOPMENT_MODE=true` and `DEMO_MODE=true`.
- Production login should use Supabase Auth with verified email and app metadata roles.
- Setup cannot rerun after a platform owner exists and install state is complete.

## Deployment Note

Static `.env` files are templates for deployment tooling. Browser runtime values are installed once through the generated immutable `window.ARTHHRMS_CONFIG` contract before application services load.
