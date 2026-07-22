// Invite-based auth onboarding adapter.
// Live invite sending must happen through a server-side endpoint or Supabase Edge Function.
(function (global) {
    const OFFICIAL_ROLES = ['employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin', 'platform_owner'];
    const INVITE_STATES = {
        NOT_INVITED: 'Not Invited',
        PENDING: 'Invite Pending',
        SENT: 'Invite Sent',
        ACTIVATED: 'Activated',
        ACTIVE: 'Active',
        SUSPENDED: 'Suspended',
        FAILED: 'Invite Failed',
        EXPIRED: 'Invite Expired'
    };

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

    function redirectTo() {
        const configured = config().AUTH_INVITE_REDIRECT_URL || '';
        if (configured) return configured;
        if (global.location?.origin && !String(global.location.origin).startsWith('file:')) {
            return `${global.location.origin}/auth-callback.html`;
        }
        return 'auth-callback.html';
    }

    function validateInvitePayload(payload = {}) {
        if (global.InviteGovernanceService?.validateInvitePayload) {
            const actor = global.authService?.getCurrentUser?.() || {};
            const governed = global.InviteGovernanceService.validateInvitePayload(payload, {
                actorRole: payload.invitedByRole || actor.role || 'hr',
                actorId: payload.invitedBy || actor.id || '',
                tenantId: payload.tenantId || payload.companyId || actor.tenantId || actor.companyId || ''
            });
            return {
                ok: !!governed.success,
                errors: (governed.failures || []).map(item => item.message || item.failureCode),
                warnings: governed.warnings || [],
                email: governed.normalizedPayload?.email || normalizeEmail(payload.email),
                role: governed.normalizedPayload?.role || normalizeRole(payload.role || 'employee'),
                governance: governed
            };
        }
        const errors = [];
        const email = normalizeEmail(payload.email);
        const role = normalizeRole(payload.role || 'employee');
        const actorRole = normalizeRole(global.authService?.getCurrentUser?.()?.role || payload.invitedByRole || '');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required');
        if (!OFFICIAL_ROLES.includes(role)) errors.push('Official role is required');
        if (['platform_owner', 'super_admin'].includes(role) && actorRole !== 'platform_owner') {
            errors.push('Only a validated Platform Owner may onboard privileged platform roles');
        }
        if (payload.empId) {
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

    async function sessionFromCallback(input = {}) {
        const client = global.supabaseClientService?.getClient?.();
        const params = input.params || parseCallbackParams(input.url || '');
        if (params.error || params.error_description) throw new Error(params.error_description || params.error);
        if (!client) throw new Error('Supabase auth client is not available');
        let session = null;
        if (params.token_hash && params.type) {
            const { data, error } = await client.auth.verifyOtp({ token_hash: params.token_hash, type: params.type });
            if (error) throw error;
            session = data?.session || null;
        } else if (params.code && client.auth.exchangeCodeForSession) {
            const { data, error } = await client.auth.exchangeCodeForSession(params.code);
            if (error) throw error;
            session = data?.session || null;
        } else {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            session = data?.session || null;
        }
        if (!session?.access_token || !session.user?.id) return null;
        const verified = await client.auth.getUser(session.access_token);
        if (verified.error || !verified.data?.user || verified.data.user.id !== session.user.id) {
            throw verified.error || new Error('Invite session validation failed');
        }
        return { ...session, user: verified.data.user };
    }

    function parseCallbackParams(url = '') {
        const source = url || `${global.location?.search || ''}${global.location?.hash || ''}`;
        const cleaned = String(source || '').replace(/^[^?#]*/, '').replace(/^#/, '?');
        const query = cleaned.includes('?') ? cleaned.slice(cleaned.indexOf('?') + 1) : cleaned;
        return Object.fromEntries(new URLSearchParams(query));
    }

    async function handleInviteCallback(input = {}) {
        try {
            const session = await sessionFromCallback(input);
            const user = session?.user;
            if (!user) return { ok: false, error: 'Invite session could not be established' };
            const email = normalizeEmail(user.email);
            const role = normalizeRole(user.app_metadata?.role || '');
            if (!OFFICIAL_ROLES.includes(role)) return { ok: false, error: 'Invite role is not allowed for tenant activation' };
            if (!(user.email_confirmed_at || user.confirmed_at)) return { ok: false, error: 'Invite email must be verified before activation' };
            const empId = user.app_metadata?.empId || user.app_metadata?.emp_id || '';
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
            global.authService?.persistCompatibleSession?.(mapped, emp || null);
            db().writeAuditLog('system', targetEmpId || user.id, 'invite activation completed', 'Auth Invite', invite.inviteId, `Invite activated for ${email}`);
            return { ok: true, user: mapped, employee: emp, invite: updated, redirectTo: global.authService?.getRoleRedirect?.(role) || 'ArthHRMS.html' };
        } catch (error) {
            const message = global.errorService?.formatError?.(error) || error.message || String(error);
            global.operationsMonitoringService?.recordError?.(error, { module: 'Auth Invite', action: 'handleInviteCallback', severity: 'HIGH' });
            db().writeAuditLog('system', '', 'invite activation failed', 'Auth Invite', '', message);
            return { ok: false, error: message };
        }
    }

    async function resendInvite(inviteOrEmpId) {
        const existing = db().getAuthInvite(inviteOrEmpId) || db().getLatestAuthInviteForEmployee(inviteOrEmpId);
        if (!existing) return { ok: false, error: 'No invite found to resend' };
        return sendInvite({
            empId: existing.empId,
            email: existing.email,
            role: existing.role,
            name: existing.name,
            redirectTo: existing.redirectTo || redirectTo(),
            invitedBy: global.authService?.getCurrentUser?.()?.id || existing.invitedBy || '',
            invitedByRole: global.authService?.getCurrentUser?.()?.role || existing.invitedByRole || 'system'
        });
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
        INVITE_STATES,
        isInviteEnabled: inviteEnabled,
        validateInvitePayload,
        sendInvite,
        resendInvite,
        handleInviteCallback,
        parseCallbackParams,
        recordActivationFromUser,
        getActivationSummary,
        getInvites: () => db().getAuthInvites(),
        getLatestInviteForEmployee: (empId) => db().getLatestAuthInviteForEmployee(empId)
    };
})(typeof window !== 'undefined' ? window : globalThis);
