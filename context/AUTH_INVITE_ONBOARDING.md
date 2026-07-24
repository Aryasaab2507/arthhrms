# ARTHHRMS Invite-Based Auth Onboarding

## Production Flow

1. HR or Super Admin creates an employee/user profile without a manual password.
2. ARTHHRMS creates an invite tracking record with `inviteStatus`.
3. The frontend calls the configured invite endpoint.
4. Supabase Edge Function sends `auth.admin.inviteUserByEmail`.
5. Edge Function stores `role` and `empId` in `app_metadata`.
6. Employee accepts the invite, sets password, and verifies email.
7. Supabase redirects to `auth-callback.html`.
8. The callback dispatcher exchanges and verifies the session once, then passes invite sessions to `authInviteService`.
9. Invite activation links `auth_user_id`, marks the invite `Activated`, marks the employee `Active`, and redirects by trusted role.

Password recovery uses the same callback route with `flow=recovery`, but is handled by `passwordRecoveryService`. Recovery never links an employee or activates an invitation.

## Security Rules

- Frontend never stores or sends a service role key.
- Role and `empId` authorization claims must live in Supabase `app_metadata`.
- Employee records use unique `auth_user_id` mappings.
- Production mode disables demo/local password fallback when `DEMO_MODE=false`.
- Production or pilot invite delivery fails closed if the derived or explicitly configured invite endpoint is unavailable.
- Destructive user/employee deletes are replaced by suspension/archive states.

## Local Compatibility

When `USE_SUPABASE_INVITES=false`, invite delivery is blocked and recorded as failed. Local development does not create a false successful delivery state.

## Required Supabase Setup

- Deploy `supabase/functions/invite-user/index.ts` as a Supabase Edge Function.
- Set server-only `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function environment.
- `INVITE_USER_ENDPOINT` is derived from `SUPABASE_URL`; override it only for a reviewed custom endpoint.
- `AUTH_INVITE_REDIRECT_URL` is derived from the hosted origin; override it only for a reviewed callback origin.
- Apply the versioned migrations in `supabase/migrations/` and run the canonical persistence gate in `context/sql/authenticated_business_persistence_tests.sql`.
- Configure Supabase Auth invite email templates and allow `/auth-callback.html`, `/auth-callback.html?flow=invite`, and `/auth-callback.html?flow=recovery`.
