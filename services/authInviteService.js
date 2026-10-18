// Invite-based auth onboarding adapter.
// Live invite sending must happen through a server-side endpoint or Supabase Edge Function.
(function (global) {
    const OFFICIAL_ROLES = Object.freeze(['employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin', 'platform_owner']);
    const TENANT_INVITE_ROLES = Object.freeze(['employee', 'manager', 'admin', 'hr', 'hr_head', 'director']);
    const PRIVILEGED_ONBOARDING_METHOD = 'release_operator_invite';
    const COMPANY_OWNER_ONBOARDING_METHOD = 'company_owner_invite';
    const INVITE_STATES = {
        NOT_INVITED: 'Not Invited',
        PENDING: 'Invite Pending',
        SENT: 'Invite Sent',
        ACTIVATED: 'Activated',
        ACTIVE: 'Active',
        SUSPENDED: 'Suspended',
        FAILED: 'Invite Failed',
        EXPIRED: 'Invite Expired',
        CANCELLED: 'Cancelled'
    };
    const INVITE_PASSWORD_EXPIRY_SKEW_SECONDS = 30;
    let pendingInvitePasswordSetup = null;
    function db() { return global.DB; }

    function config() {
        return global.supabaseClientService?.readConfig?.() || { flags: {} };
    }

    function normalizeRole(role) {
        return global.authService?.normalizeRole?.(role) || String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
    }

    function normalizeEmail(email) {
        return db()?.normalizeEmail ? db().normalizeEmail(email) : String(email || '').trim().toLowerCase();
    }

    function inviteEndpoint() {
        return config().INVITE_USER_ENDPOINT || '';
    }

    function inviteEnabled() {
        const cfg = config();
        return !!(cfg.flags?.USE_SUPABASE_INVITES && inviteEndpoint());
    }

    function companyOwnerInviteEnabled() {
        const cfg = config();
        return !!(
            cfg.flags?.USE_SUPABASE_INVITES &&
            cfg.SUPABASE_URL &&
            cfg.AUTH_INVITE_REDIRECT_URL &&
            global.PlatformCompanyRegistryService?.inviteCompanyOwner
        );
    }

    function redirectTo() {
        const configured = config().AUTH_INVITE_REDIRECT_URL || '';
        const base = configured || (
            global.location?.origin && !String(global.location.origin).startsWith('file:')
                ? `${global.location.origin}/auth-callback.html`
                : 'auth-callback.html'
        );
        try {
            const url = new URL(base, global.location?.origin || 'https://arthhrms.invalid');
            url.search = '';
            url.searchParams.set('flow', 'invite');
            url.hash = '';
            return configured || /^https?:/i.test(base)
                ? url.href
                : `${url.pathname.split('/').pop()}${url.search}`;
        } catch (_error) {
            return `${base}${base.includes('?') ? '&' : '?'}flow=invite`;
        }
    }

    function validateInvitePayload(payload = {}) {
        if (global.InviteGovernanceService?.validateInvitePayload) {
            const actor = global.authService?.getCurrentUser?.() || {};
            const governed = global.InviteGovernanceService.validateInvitePayload(payload, {
                actorRole: payload.invitedByRole || actor.role || 'hr',
                actorId: payload.invitedBy || actor.id || '',
                tenantId: payload.tenantId || payload.companyId || actor.tenantId || actor.companyId || ''
            });
            const governedRole = governed.normalizedPayload?.role || normalizeRole(payload.role || 'employee');
            const governedErrors = (governed.failures || []).map(item => item.message || item.failureCode);
            if (!TENANT_INVITE_ROLES.includes(governedRole)) {
                governedErrors.push('Privileged roles must be created through secure release onboarding');
            }
            return {
                ok: !!governed.success && governedErrors.length === 0,
                errors: governedErrors,
                warnings: governed.warnings || [],
                email: governed.normalizedPayload?.email || normalizeEmail(payload.email),
                role: governedRole,
                governance: governed
            };
        }
        const errors = [];
        const email = normalizeEmail(payload.email);
        const role = normalizeRole(payload.role || 'employee');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required');
        if (!TENANT_INVITE_ROLES.includes(role)) errors.push('Privileged roles must be created through secure release onboarding');
        if (payload.empId && db()?.get && db()?.resolveEmployeeId) {
            const duplicate = (db().get().employees || []).find(e => e.authUserId && e.id !== db().resolveEmployeeId(payload.empId) && e.authUserId === payload.authUserId);
            if (duplicate) errors.push(`Auth user already linked to ${duplicate.id}`);
        }
        return { ok: errors.length === 0, errors, email, role };
    }

    async function currentAuthHeader() {
        try {
            const session = await global.authService?.getSupabaseSession?.();
            return session?.access_token ? `Bearer ${session.access_token}` : '';
        } catch (err) {
            return '';
        }
    }

    function createLocalRecord(payload, status, extra = {}) {
        const row = db().createAuthInvite({
            ...payload,
            email: normalizeEmail(payload.email),
            role: normalizeRole(payload.role || 'employee'),
            status,
            inviteStatus: status,
            activationStatus: status === INVITE_STATES.SENT ? INVITE_STATES.SENT : INVITE_STATES.PENDING,
            redirectTo: payload.redirectTo || redirectTo(),
            ...extra
        });
        db().pushNotification(payload.role || 'employee', payload.empId || '', 'Account Invitation', `Your ARTHHRMS account invitation is ${String(status).toLowerCase()}.`, 'Authentication');
        return row;
    }

    async function callInviteEndpoint(payload) {
        const headers = { 'Content-Type': 'application/json' };
        const authHeader = await currentAuthHeader();
        if (!authHeader) throw new Error('A validated authenticated session is required to send invitations');
        headers.Authorization = authHeader;
        if (!/^https:\/\//i.test(inviteEndpoint())) throw new Error('The invite endpoint must use HTTPS');
        const response = await fetch(inviteEndpoint(), {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.error) throw new Error(body.error || body.message || `Invite request failed with ${response.status}`);
        return body;
    }

    async function sendInvite(payload = {}) {
        const validation = validateInvitePayload(payload);
        if (!validation.ok) return { ok: false, errors: validation.errors };
        const actor = global.authService?.getCurrentUser?.() || {};
        const request = {
            empId: payload.empId || '',
            email: validation.email,
            role: validation.role,
            name: payload.name || '',
            redirectTo: payload.redirectTo || redirectTo(),
            invitedBy: payload.invitedBy || actor.id || '',
            invitedByRole: payload.invitedByRole || actor.role || 'system'
        };

        if (!inviteEnabled()) {
            const reason = 'Live Supabase invite endpoint is not configured';
            const failed = createLocalRecord(request, INVITE_STATES.FAILED, { activationStatus: INVITE_STATES.FAILED, failureReason: reason });
            db().writeAuditLog(request.invitedByRole, request.invitedBy, 'invite delivery blocked', 'Auth Invite', failed.inviteId, `Invite delivery blocked for ${request.email}: ${reason}`);
            global.operationsMonitoringService?.createIncident?.({
                severity: 'HIGH',
                module: 'Auth Invite',
                title: 'Invite delivery endpoint missing',
                description: reason,
                source: 'auth',
                affectedRecordId: failed.inviteId,
                recoveryAction: 'Configure INVITE_USER_ENDPOINT and USE_SUPABASE_INVITES before sending production invites.'
            }, { role: request.invitedByRole, id: request.invitedBy });
            return { ok: false, mode: 'blocked', invite: failed, error: reason };
        }

        const localRow = createLocalRecord(request, INVITE_STATES.PENDING);
        try {
            const result = await global.errorService?.safeAsync?.(() => callInviteEndpoint({ ...request, inviteId: localRow.inviteId }), {
                label: 'Send invite',
                module: 'Auth Invite',
                action: 'sendInvite',
                message: 'Invite email could not be sent.',
                rethrow: true
            }) || await callInviteEndpoint({ ...request, inviteId: localRow.inviteId });
            const authUserId = result.authUserId || result.userId || result.user?.id || '';
            const updated = db().updateAuthInvite(localRow.inviteId, {
                status: INVITE_STATES.SENT,
                inviteStatus: INVITE_STATES.SENT,
                activationStatus: INVITE_STATES.SENT,
                authUserId,
                sentAt: new Date().toISOString(),
                failureReason: ''
            });
            if (request.empId && authUserId) db().linkAuthUserToEmployee(request.empId, authUserId, 'Invite Sent');
            db().writeAuditLog(request.invitedByRole, request.invitedBy, 'invite sent', 'Auth Invite', localRow.inviteId, `Invite sent to ${request.email}`);
            return { ok: true, mode: 'live', invite: updated, result };
        } catch (error) {
            const failed = db().updateAuthInvite(localRow.inviteId, {
                status: INVITE_STATES.FAILED,
                inviteStatus: INVITE_STATES.FAILED,
                activationStatus: INVITE_STATES.FAILED,
                failureReason: global.errorService?.formatError?.(error) || error.message || String(error)
            });
            db().writeAuditLog(request.invitedByRole, request.invitedBy, 'invite failed', 'Auth Invite', localRow.inviteId, `Invite failed for ${request.email}`);
            return { ok: false, invite: failed, error: failed.failureReason };
        }
    }

    function durableInviteId() {
        let suffix = '';
        try { suffix = global.crypto?.randomUUID?.() || ''; } catch (_error) {}
        if (!suffix) suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        return `AUTH-INV-${suffix}`;
    }

    async function sendDurableInvite(payload = {}) {
        const validation = validateInvitePayload(payload);
        if (!validation.ok) return { ok: false, errors: validation.errors };
        const actor = global.authService?.getCurrentUser?.() || {};
        if (!inviteEnabled()) {
            return { ok: false, error: 'Live Supabase invite endpoint is not configured.' };
        }
        const request = {
            action: 'send',
            inviteId: String(payload.inviteId || durableInviteId()),
            empId: String(payload.empId || '').trim(),
            email: validation.email,
            role: validation.role,
            name: String(payload.name || '').trim(),
            tenantId: String(payload.tenantId || actor.tenantSlug || actor.tenantId || '').trim(),
            organizationId: String(payload.organizationId || payload.companyId || actor.organizationId || actor.companyId || '').trim(),
            redirectTo: payload.redirectTo || redirectTo()
        };
        if (!request.empId) return { ok: false, error: 'An existing employee is required for an invitation.' };
        try {
            const result = await callInviteEndpoint(request);
            return { ok: true, mode: 'live', invite: { ...request, ...result, status: INVITE_STATES.SENT }, result };
        } catch (error) {
            return { ok: false, error: error?.message || String(error) };
        }
    }

    async function mutateDurableInvite(action, inviteId) {
        const normalizedAction = String(action || '').trim().toLowerCase();
        if (!['resend', 'cancel'].includes(normalizedAction)) return { ok: false, error: 'Unsupported invitation action.' };
        if (!inviteEnabled()) return { ok: false, error: 'Live Supabase invite endpoint is not configured.' };
        const id = String(inviteId || '').trim();
        if (!id) return { ok: false, error: 'Invitation identifier is required.' };
        try {
            const result = await callInviteEndpoint({
                action: normalizedAction,
                inviteId: id,
                redirectTo: redirectTo()
            });
            return { ok: true, mode: 'live', invite: { ...result, inviteId: id }, result };
        } catch (error) {
            return { ok: false, error: error?.message || String(error) };
        }
    }

    function resendDurableInvite(inviteId) {
        return mutateDurableInvite('resend', inviteId);
    }

    function cancelDurableInvite(inviteId) {
        return mutateDurableInvite('cancel', inviteId);
    }

    function invitePasswordValidation(password) {
        if (global.passwordRecoveryService?.evaluatePassword) {
            return global.passwordRecoveryService.evaluatePassword(password);
        }
        const value = String(password || '');
        const checks = {
            minimumLength: value.length >= 12,
            uppercase: /[A-Z]/.test(value),
            lowercase: /[a-z]/.test(value),
            number: /[0-9]/.test(value),
            specialCharacter: /[^A-Za-z0-9\s]/.test(value)
        };
        return { valid: Object.values(checks).every(Boolean), checks };
    }

    function inviteSessionIsUsable(session) {
        const expiresAt = Number(session?.expires_at || 0);
        return !!(
            session?.access_token &&
            session?.user?.id &&
            Number.isFinite(expiresAt) &&
            expiresAt > Math.floor(Date.now() / 1000) + INVITE_PASSWORD_EXPIRY_SKEW_SECONDS
        );
    }

    function validateInviteSession(session) {
        const user = session?.user;
        if (!inviteSessionIsUsable(session) || !user) {
            return { ok: false, code: 'INVITE_SESSION_EXPIRED', error: 'This invitation link has expired. Ask your administrator to resend it.' };
        }
        const email = normalizeEmail(user.email);
        const role = normalizeRole(user.app_metadata?.role || '');
        if (!email || !OFFICIAL_ROLES.includes(role)) {
            return { ok: false, code: 'INVITE_CLAIMS_INVALID', error: 'This invitation does not contain a valid account identity.' };
        }
        if (!(user.email_confirmed_at || user.confirmed_at)) {
            return { ok: false, code: 'INVITE_EMAIL_UNVERIFIED', error: 'This invitation email has not been verified.' };
        }
        const onboardingMethod = String(user.app_metadata?.onboarding_method || '').trim().toLowerCase();
        const tenantId = String(user.app_metadata?.tenant_id || user.app_metadata?.tenantSlug || '').trim();
        const organizationId = String(user.app_metadata?.organization_id || user.app_metadata?.organizationId || '').trim();
        if (role !== 'platform_owner' && (!tenantId || !organizationId)) {
            return { ok: false, code: 'INVITE_TENANT_REQUIRED', error: 'This invitation is missing trusted company details.' };
        }
        if (onboardingMethod === COMPANY_OWNER_ONBOARDING_METHOD && (role !== 'super_admin' || user.app_metadata?.company_owner !== true)) {
            return { ok: false, code: 'COMPANY_OWNER_CLAIMS_INVALID', error: 'This Company Owner invitation is invalid.' };
        }
        if (onboardingMethod === PRIVILEGED_ONBOARDING_METHOD && !['platform_owner', 'super_admin'].includes(role)) {
            return { ok: false, code: 'PRIVILEGED_INVITE_CLAIMS_INVALID', error: 'This privileged invitation is invalid.' };
        }
        if (!onboardingMethod && !TENANT_INVITE_ROLES.includes(role)) {
            return { ok: false, code: 'INVITE_ROLE_INVALID', error: 'This invitation role is not allowed.' };
        }
        return { ok: true, user, email, role, onboardingMethod, tenantId, organizationId };
    }

    function classifyInviteError(error) {
        const message = String(error?.message || error || '').trim();
        if (/expired|invalid.*token|token.*invalid|jwt/i.test(message)) {
            return { code: 'INVITE_SESSION_EXPIRED', error: 'This invitation link has expired. Ask your administrator to resend it.' };
        }
        if (/password.*(weak|short|require)|weak.*password/i.test(message)) {
            return { code: 'INVITE_PASSWORD_WEAK', error: 'Choose a password that meets every listed requirement.' };
        }
        if (/network|fetch|timeout|failed to fetch/i.test(message)) {
            return { code: 'INVITE_NETWORK_ERROR', error: 'We could not reach the authentication service. Check your connection and try again.', retryable: true };
        }
        return { code: 'INVITE_ACTIVATION_FAILED', error: message || 'We could not activate this invitation. Please try again.', retryable: true };
    }

    function invitationDestination(user) {
        const onboardingMethod = String(user?.app_metadata?.onboarding_method || '').trim().toLowerCase();
        if (onboardingMethod === COMPANY_OWNER_ONBOARDING_METHOD) {
            return 'organization-import-center.html?source=company-owner-invite';
        }
        return global.authService?.getRoleRedirect?.(user?.app_metadata?.role) || 'ArthHRMS.html';
    }

    async function resolvePendingInviteSession() {
        const expected = pendingInvitePasswordSetup;
        if (!expected) {
            return { ok: false, code: 'INVITE_PASSWORD_SESSION_REQUIRED', error: 'Open the invitation link again to create your password.' };
        }
        const client = global.supabaseClientService?.getClient?.();
        if (!client?.auth?.getSession || !client.auth.getUser) {
            return { ok: false, code: 'INVITE_AUTH_UNAVAILABLE', error: 'Authentication is unavailable. Refresh the page and try again.' };
        }
        const sessionResult = await client.auth.getSession();
        if (sessionResult?.error || !sessionResult?.data?.session) {
            return { ok: false, code: 'INVITE_SESSION_EXPIRED', error: 'This invitation link has expired. Ask your administrator to resend it.' };
        }
        const session = sessionResult.data.session;
        const userResult = await client.auth.getUser(session.access_token);
        if (userResult?.error || !userResult?.data?.user || userResult.data.user.id !== expected.userId) {
            return { ok: false, code: 'INVITE_SESSION_INVALID', error: 'The invitation session could not be verified. Open the latest invitation email.' };
        }
        const verifiedSession = { ...session, user: userResult.data.user };
        const validation = validateInviteSession(verifiedSession);
        if (!validation.ok || validation.user.id !== expected.userId) return validation;
        return { ...validation, session: verifiedSession };
    }

    function beginInvitePasswordCreation(input = {}) {
        const validation = validateInviteSession(input.session);
        if (!validation.ok) return { ...validation, type: 'invite' };
        pendingInvitePasswordSetup = {
            userId: validation.user.id,
            email: validation.email,
            role: validation.role,
            expiresAt: Number(input.session.expires_at || 0)
        };
        global.authService?.clearSession?.();
        return {
            ok: true,
            type: 'invite',
            action: 'create_password',
            account: { email: validation.email, role: validation.role, name: validation.user.user_metadata?.full_name || validation.email }
        };
    }

    async function completeInvitePasswordCreation(password) {
        const passwordValidation = invitePasswordValidation(password);
        if (!passwordValidation?.valid) {
            return { ok: false, type: 'invite', code: 'INVITE_PASSWORD_WEAK', error: 'Choose a password that meets every listed requirement.' };
        }
        try {
            const pending = await resolvePendingInviteSession();
            if (!pending.ok) return { ...pending, type: 'invite' };
            const client = global.supabaseClientService.getClient();
            const update = await client.auth.updateUser({ password: String(password) });
            if (update?.error) return { ok: false, type: 'invite', ...classifyInviteError(update.error) };

            const activation = await handleInviteCallback({ session: { ...pending.session, user: update?.data?.user || pending.user }, passwordCreated: true });
            if (!activation?.ok) return { ...activation, type: 'invite', retryable: activation?.retryable !== false };

            if (typeof client.auth.refreshSession !== 'function') {
                return { ok: false, type: 'invite', code: 'INVITE_SESSION_REFRESH_REQUIRED', error: 'Your account was activated, but the session could not be refreshed. Sign in with your new password.' };
            }
            const refreshed = await client.auth.refreshSession();
            if (refreshed?.error || !refreshed?.data?.session) {
                return { ok: false, type: 'invite', ...classifyInviteError(refreshed?.error || 'Session refresh failed') };
            }
            const refreshedUser = refreshed.data.user || refreshed.data.session.user;
            if (!refreshedUser?.id || refreshedUser.id !== pending.user.id) {
                return { ok: false, type: 'invite', code: 'INVITE_SESSION_INVALID', error: 'The activated session could not be verified. Sign in with your new password.' };
            }
            pendingInvitePasswordSetup = null;
            return {
                ok: true,
                type: 'invite',
                action: 'activated',
                message: 'Your account is ready.',
                user: refreshedUser,
                redirectTo: invitationDestination(refreshedUser)
            };
        } catch (error) {
            return { ok: false, type: 'invite', ...classifyInviteError(error) };
        }
    }

    async function handleInviteCallback(input = {}) {
        try {
            if (!input.passwordCreated) {
                return { ok: false, code: 'INVITE_PASSWORD_CREATION_REQUIRED', error: 'Create a password before activating this invitation.' };
            }
            const session = input.session;
            const user = session?.user;
            if (!user) return { ok: false, error: 'Invite session could not be established' };
            const email = normalizeEmail(user.email);
            const role = normalizeRole(user.app_metadata?.role || '');
            if (!OFFICIAL_ROLES.includes(role)) return { ok: false, error: 'Invite role is not allowed for tenant activation' };
            if (!(user.email_confirmed_at || user.confirmed_at)) return { ok: false, error: 'Invite email must be verified before activation' };
            const onboardingMethod = String(user.app_metadata?.onboarding_method || '').trim().toLowerCase();
            if ([PRIVILEGED_ONBOARDING_METHOD, COMPANY_OWNER_ONBOARDING_METHOD].includes(onboardingMethod)) {
                if (!['platform_owner', 'super_admin'].includes(role)) {
                    return { ok: false, error: 'Privileged onboarding metadata is invalid' };
                }
                const tenantId = user.app_metadata?.tenant_id || user.app_metadata?.tenantSlug || '';
                const organizationId = user.app_metadata?.organization_id || user.app_metadata?.organizationId || '';
                if (role === 'super_admin' && (!tenantId || !organizationId)) {
                    return { ok: false, error: 'Super Admin onboarding requires trusted tenant and organization metadata' };
                }
                if (
                    onboardingMethod === COMPANY_OWNER_ONBOARDING_METHOD &&
                    (role !== 'super_admin' || user.app_metadata?.company_owner !== true)
                ) {
                    return { ok: false, error: 'Company Owner onboarding metadata is invalid' };
                }
                let companyOwnerActivation = null;
                if (onboardingMethod === COMPANY_OWNER_ONBOARDING_METHOD) {
                    companyOwnerActivation = await completePersistedCompanyOwnerActivation();
                } else if (onboardingMethod === PRIVILEGED_ONBOARDING_METHOD) {
                    await completePersistedReleaseOperatorActivation();
                }
                const mapped = {
                    id: user.id,
                    authUserId: user.id,
                    email,
                    name: user.app_metadata?.name || user.user_metadata?.full_name || user.user_metadata?.name || email,
                    role,
                    tenantId: role === 'platform_owner' ? '' : tenantId,
                    companyId: role === 'platform_owner' ? '' : organizationId,
                    source: 'supabase',
                    emailVerified: true,
                    roleTrusted: true,
                    tenantTrusted: role === 'platform_owner' || !!tenantId
                };
                db()?.writeAuditLog?.(
                    'system',
                    user.id,
                    'privileged invite activation completed',
                    'Auth Invite',
                    user.app_metadata?.onboarding_operation_id || user.id,
                    `Secure release onboarding activated for ${email}`
                );
                return {
                    ok: true,
                    user: mapped,
                    employee: null,
                    invite: companyOwnerActivation,
                    redirectTo: onboardingMethod === COMPANY_OWNER_ONBOARDING_METHOD
                        ? 'organization-import-center.html?source=company-owner-invite'
                        : global.authService?.getRoleRedirect?.(role) || 'ArthHRMS.html'
                };
            }
            if (!TENANT_INVITE_ROLES.includes(role)) {
                return { ok: false, error: 'Privileged roles must use secure release onboarding' };
            }
            const empId = user.app_metadata?.empId || user.app_metadata?.emp_id || '';
            const persistedActivation = await activatePersistedInvite(user);
            if (persistedActivation) {
                const tenantId = user.app_metadata?.tenant_id || user.app_metadata?.tenantSlug || '';
                const organizationId = user.app_metadata?.organization_id || user.app_metadata?.organizationId || '';
                const mapped = {
                    id: user.id,
                    authUserId: user.id,
                    email,
                    name: user.app_metadata?.name || user.user_metadata?.full_name || user.user_metadata?.name || email,
                    role,
                    empId,
                    tenantId,
                    companyId: organizationId,
                    source: 'supabase',
                    emailVerified: true,
                    roleTrusted: true,
                    empIdTrusted: true,
                    tenantTrusted: true
                };
                return {
                    ok: true,
                    user: mapped,
                    employee: null,
                    invite: persistedActivation,
                    redirectTo: global.authService?.getRoleRedirect?.(role) || 'ArthHRMS.html'
                };
            }
            const inviteByEmp = empId ? db().getLatestAuthInviteForEmployee(empId) : null;
            const inviteByEmail = !inviteByEmp && db().getLatestAuthInviteByEmail ? db().getLatestAuthInviteByEmail(email) : null;
            const invite = inviteByEmp || inviteByEmail;
            if (!invite) return { ok: false, error: 'No matching invitation was found for this account' };
            if (invite.authUserId && invite.authUserId !== user.id) return { ok: false, error: 'Invitation is already linked to another auth account' };
            const targetEmpId = empId || invite.empId || '';
            if (targetEmpId) {
                const link = db().linkAuthUserToEmployee(targetEmpId, user.id, INVITE_STATES.ACTIVE);
                if (!link.ok) return { ok: false, error: link.error };
            }
            const now = new Date().toISOString();
            const updated = db().updateAuthInvite(invite.inviteId, {
                status: INVITE_STATES.ACTIVATED,
                inviteStatus: INVITE_STATES.ACTIVATED,
                activationStatus: INVITE_STATES.ACTIVE,
                authUserId: user.id,
                acceptedAt: invite.acceptedAt || now,
                emailVerifiedAt: user.email_confirmed_at || user.confirmed_at || now,
                failureReason: ''
            });
            const emp = targetEmpId ? db().getEmployee(targetEmpId) : null;
            const mapped = {
                id: user.id,
                authUserId: user.id,
                email,
                name: user.app_metadata?.name || user.user_metadata?.full_name || user.user_metadata?.name || emp?.name || email,
                role,
                empId: targetEmpId,
                source: 'supabase',
                emailVerified: true,
                roleTrusted: true,
                empIdTrusted: !!targetEmpId
            };
            db().writeAuditLog('system', targetEmpId || user.id, 'invite activation completed', 'Auth Invite', invite.inviteId, `Invite activated for ${email}`);
            return { ok: true, user: mapped, employee: emp, invite: updated, redirectTo: global.authService?.getRoleRedirect?.(role) || 'ArthHRMS.html' };
        } catch (error) {
            const message = global.errorService?.formatError?.(error) || error.message || String(error);
            global.operationsMonitoringService?.recordError?.(error, { module: 'Auth Invite', action: 'handleInviteCallback', severity: 'HIGH' });
            db().writeAuditLog('system', '', 'invite activation failed', 'Auth Invite', '', message);
            return { ok: false, error: message };
        }
    }

    function matchingInviteForUser(user) {
        if (!user) return null;
        const empId = user.app_metadata?.empId || user.app_metadata?.emp_id || '';
        const byEmployee = empId ? db()?.getLatestAuthInviteForEmployee?.(empId) : null;
        return byEmployee || db()?.getLatestAuthInviteByEmail?.(normalizeEmail(user.email)) || null;
    }

    async function activatePersistedInvite(user) {
        const persistenceEnabled = !!global.supabaseClientService?.isEnabled?.('USE_SUPABASE_PERSISTENCE');
        if (!persistenceEnabled) return null;
        const client = global.supabaseClientService?.getClient?.();
        if (!client?.rpc) throw new Error('Authenticated invitation activation RPC is unavailable');
        const result = await client.rpc('arth_complete_auth_invite_activation');
        if (result?.error) throw result.error;
        if (!result?.data?.ok) throw new Error('Invitation activation was not confirmed by the database');
        return result.data;
    }

    async function completePersistedCompanyOwnerActivation() {
        const client = global.supabaseClientService?.getClient?.();
        if (!client?.rpc) throw new Error('Company Owner activation transaction is unavailable');
        const result = await client.rpc('arth_complete_company_owner_activation');
        if (result?.error) throw result.error;
        if (!result?.data?.ok) throw new Error('Company Owner activation was not confirmed by the database');
        return result.data;
    }

    async function completePersistedReleaseOperatorActivation() {
        const client = global.supabaseClientService?.getClient?.();
        if (!client?.rpc) throw new Error('Platform Owner activation transaction is unavailable');
        const result = await client.rpc('arth_complete_release_operator_invite_activation');
        if (result?.error) throw result.error;
        if (!result?.data?.ok) throw new Error('Platform Owner activation was not confirmed by the database');
        return result.data;
    }

    async function resendInvite(inviteOrEmpId) {
        const existing = db().getAuthInvite(inviteOrEmpId) || db().getLatestAuthInviteForEmployee(inviteOrEmpId);
        if (!existing) return { ok: false, error: 'No invite found to resend' };
        if (!inviteEnabled()) return { ok: false, error: 'Live Supabase invite endpoint is not configured' };
        try {
            const result = await callInviteEndpoint({
                action: 'resend',
                inviteId: existing.inviteId,
                redirectTo: existing.redirectTo || redirectTo()
            });
            const now = new Date().toISOString();
            const updated = db().updateAuthInvite(existing.inviteId, {
                status: INVITE_STATES.SENT,
                inviteStatus: INVITE_STATES.SENT,
                activationStatus: INVITE_STATES.SENT,
                authUserId: result.authUserId || result.userId || '',
                sentAt: now,
                lastResentAt: now,
                resendCount: Number(existing.resendCount || 0) + 1,
                cancelledAt: '',
                failureReason: ''
            });
            if (updated?.empId && updated.authUserId) db().linkAuthUserToEmployee(updated.empId, updated.authUserId, 'Invite Sent');
            db().writeAuditLog(
                global.authService?.getCurrentUser?.()?.role || existing.invitedByRole || 'system',
                global.authService?.getCurrentUser?.()?.id || existing.invitedBy || '',
                'invite resent',
                'Auth Invite',
                existing.inviteId,
                `Invite resent to ${existing.email}`
            );
            return { ok: true, mode: 'live', invite: updated, result };
        } catch (error) {
            const message = global.errorService?.formatError?.(error) || error.message || String(error);
            const failed = db().updateAuthInvite(existing.inviteId, {
                status: INVITE_STATES.FAILED,
                inviteStatus: INVITE_STATES.FAILED,
                activationStatus: INVITE_STATES.FAILED,
                failureReason: message
            });
            return { ok: false, invite: failed, error: message };
        }
    }

    async function cancelInvite(inviteOrEmpId) {
        const existing = db().getAuthInvite(inviteOrEmpId) || db().getLatestAuthInviteForEmployee(inviteOrEmpId);
        if (!existing) return { ok: false, error: 'No invite found to cancel' };
        if (['active', 'activated'].includes(String(existing.activationStatus || existing.inviteStatus || existing.status || '').toLowerCase())) {
            return { ok: false, error: 'Activated invitations cannot be cancelled' };
        }
        if (!inviteEnabled()) return { ok: false, error: 'Live Supabase invite endpoint is not configured' };
        try {
            const result = await callInviteEndpoint({ action: 'cancel', inviteId: existing.inviteId });
            const now = new Date().toISOString();
            const updated = db().updateAuthInvite(existing.inviteId, {
                status: INVITE_STATES.CANCELLED,
                inviteStatus: INVITE_STATES.CANCELLED,
                activationStatus: INVITE_STATES.CANCELLED,
                authUserId: '',
                cancelledAt: now,
                cancelledBy: global.authService?.getCurrentUser?.()?.id || '',
                failureReason: ''
            });
            db().writeAuditLog(
                global.authService?.getCurrentUser?.()?.role || existing.invitedByRole || 'system',
                global.authService?.getCurrentUser?.()?.id || existing.invitedBy || '',
                'invite cancelled',
                'Auth Invite',
                existing.inviteId,
                `Invite cancelled for ${existing.email}`
            );
            return { ok: true, mode: 'live', invite: updated, result };
        } catch (error) {
            return { ok: false, invite: existing, error: global.errorService?.formatError?.(error) || error.message || String(error) };
        }
    }

    async function sendCompanyOwnerInvite(companyId, profile = {}, context = {}) {
        if (!companyOwnerInviteEnabled()) {
            return { ok: false, success: false, error: 'Company Owner invitation configuration is incomplete.' };
        }
        const result = await global.PlatformCompanyRegistryService.inviteCompanyOwner(companyId, profile, context);
        return { ...result, ok: !!result?.ok, success: !!result?.success };
    }

    async function resendCompanyOwnerInvite(companyId, invitationId, profile = {}, context = {}) {
        if (!companyOwnerInviteEnabled()) {
            return { ok: false, success: false, error: 'Company Owner invitation configuration is incomplete.' };
        }
        const result = await global.PlatformCompanyRegistryService.resendCompanyOwnerInvitation(
            companyId,
            invitationId,
            profile,
            context
        );
        return { ...result, ok: !!result?.ok, success: !!result?.success };
    }

    async function revokeCompanyOwnerInvite(companyId, invitationId, options = {}, context = {}) {
        if (!companyOwnerInviteEnabled()) {
            return { ok: false, success: false, error: 'Company Owner invitation configuration is incomplete.' };
        }
        const result = await global.PlatformCompanyRegistryService.revokeCompanyOwnerInvitation(
            companyId,
            invitationId,
            options,
            context
        );
        return { ...result, ok: !!result?.ok, success: !!result?.success };
    }

    function recordActivationFromUser(user, employee) {
        if (!user) return null;
        const email = normalizeEmail(user.email);
        const empId = employee?.id || user.empId || '';
        const invite = empId ? db().getLatestAuthInviteForEmployee(empId) : null;
        const byEmail = !invite && email ? (db().getAuthInvites() || []).find(i => normalizeEmail(i.email) === email) : null;
        const row = invite || byEmail;
        if (!row) return null;
        const authId = user.authUserId || user.id || row.authUserId || '';
        if (row.activationStatus === 'Active' && row.authUserId && row.authUserId === authId) return row;
        const now = new Date().toISOString();
        const updated = db().updateAuthInvite(row.inviteId, {
            status: INVITE_STATES.ACTIVATED,
            inviteStatus: INVITE_STATES.ACTIVATED,
            activationStatus: INVITE_STATES.ACTIVE,
            authUserId: authId,
            acceptedAt: row.acceptedAt || now,
            emailVerifiedAt: row.emailVerifiedAt || now
        });
        if (empId && authId) db().linkAuthUserToEmployee(empId, authId, INVITE_STATES.ACTIVE);
        db().writeAuditLog('system', empId, 'activation completed', 'Auth Invite', row.inviteId, `Account activated for ${email || empId}`);
        return updated;
    }

    function getActivationSummary(empId = '') {
        const data = db().get();
        const employees = empId ? [db().getEmployee(empId)].filter(Boolean) : (data.employees || []);
        return employees.map(emp => {
            const invite = db().getLatestAuthInviteForEmployee(emp.id);
            return {
                empId: emp.id,
                name: emp.name,
                email: emp.email,
                role: emp.role || 'employee',
                authUserId: emp.authUserId || '',
                inviteStatus: invite?.inviteStatus || emp.inviteStatus || 'Not Invited',
                activationStatus: emp.activationStatus || invite?.activationStatus || 'Not Activated',
                sentAt: invite?.sentAt || emp.inviteSentAt || '',
                acceptedAt: invite?.acceptedAt || '',
                emailVerifiedAt: invite?.emailVerifiedAt || emp.emailVerifiedAt || ''
            };
        });
    }

    global.authInviteService = {
        OFFICIAL_ROLES,
        TENANT_INVITE_ROLES,
        INVITE_STATES,
        isInviteEnabled: inviteEnabled,
        isCompanyOwnerInviteEnabled: companyOwnerInviteEnabled,
        validateInvitePayload,
        sendInvite,
        sendDurableInvite,
        resendDurableInvite,
        cancelDurableInvite,
        resendInvite,
        cancelInvite,
        sendCompanyOwnerInvite,
        resendCompanyOwnerInvite,
        revokeCompanyOwnerInvite,
        beginInvitePasswordCreation,
        completeInvitePasswordCreation,
        handleInviteCallback,
        hasMatchingInvite: (user) => !!matchingInviteForUser(user),
        recordActivationFromUser,
        getActivationSummary,
        getInvites: () => db().getAuthInvites(),
        getLatestInviteForEmployee: (empId) => db().getLatestAuthInviteForEmployee(empId)
    };
})(typeof window !== 'undefined' ? window : globalThis);
