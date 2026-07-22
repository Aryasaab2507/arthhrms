# ARTHHRMS Invite-Based Auth Onboarding

## Production Flow

1. HR or Super Admin creates an employee/user profile without a manual password.
2. ARTHHRMS creates an invite tracking record with `inviteStatus`.
3. The frontend calls the configured invite endpoint.
4. Supabase Edge Function sends `auth.admin.inviteUserByEmail`.
5. Edge Function stores `role` and `empId` in `app_metadata`.
6. Employee accepts the invite, sets password, and verifies email.
7. Supabase redirects to `auth-callback.html`.
8. Callback handling verifies the session/token, links `auth_user_id`, marks the invite `Activated`, marks the employee `Active`, and redirects by role.

## Security Rules

- Frontend never stores or sends a service role key.
- Role and `empId` authorization claims must live in Supabase `app_metadata`.
- Employee records use unique `auth_user_id` mappings.
- Production mode disables demo/local password fallback when `DEMO_MODE=false`.
- Production or pilot invite delivery fails closed if `INVITE_USER_ENDPOINT` is missing.
- Destructive user/employee deletes are replaced by suspension/archive states.

## Local Compatibility

When `USE_SUPABASE_INVITES=false` in development, invites are recorded as `Invite Pending`.
This preserves local workflows while making it visible that email delivery is not live.
In pilot/production, local-only invite placeholders are blocked.

## Required Supabase Setup

- Deploy `supabase/functions/invite-user/index.ts` as a Supabase Edge Function.
- Set server-only `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function environment.
- Set `INVITE_USER_ENDPOINT` in frontend environment/config.
- Set `AUTH_INVITE_REDIRECT_URL` to the deployed `auth-callback.html` URL.
- Apply the versioned migrations in `supabase/migrations/` and run the canonical persistence gate in `context/sql/authenticated_business_persistence_tests.sql`.
- Configure Supabase Auth invite email template and redirect allow-list.
