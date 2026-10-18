// Enterprise authentication adapter. Authorization decisions are based only on
// a server-validated Supabase session and trusted app_metadata claims.
(function (global) {
    'use strict';

    const SESSION_VERSION = 1;
    const EXPIRY_SKEW_SECONDS = 30;
    const OFFICIAL_ROLES = Object.freeze([
        'employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin', 'platform_owner'
    ]);
    const TENANT_ROLES = Object.freeze([
        'employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin'
    ]);
    const ROLE_REDIRECTS = Object.freeze({
        employee: 'employee-portal.html',
        manager: 'manager.html',
        admin: 'admin.html',
        hr: 'hr-dashboard.html',
        hr_head: 'hr-dashboard.html',
        director: 'director.html',
        super_admin: 'super-admin.html',
        platform_owner: 'platform-control.html'
    });
    const COMPATIBLE_SESSION_KEYS = Object.freeze([
        'currentUser', 'currentEmployee', 'empUser', 'hrUser', 'mgUser', 'mgrUser',
        'adUser', 'saUser', 'platformOwnerUser', 'directorUser'
    ]);
    let authTrackingStarted = false;

    function db() { return global.DB || null; }

    function normalizeRole(role) {
        const raw = String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'hrhead') return 'hr_head';
        if (raw === 'platformowner') return 'platform_owner';
        if (raw === 'emp') return 'employee';
        return raw;
    }

    function normalizeTenantClaim(value) {
        return String(value || '').trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function isOfficialRole(role) {
        return OFFICIAL_ROLES.includes(normalizeRole(role));
    }

    function isTenantRole(role) {
        return TENANT_ROLES.includes(normalizeRole(role));
    }

    function flagEnabled(flagName, fallback = false) {
        const service = global.supabaseClientService;
        if (!service || typeof service.readConfig !== 'function') return fallback;
        const flags = service.readConfig().flags || {};
        return flags[flagName] === undefined ? fallback : !!flags[flagName];
    }

    function isProductionMode() { return flagEnabled('PRODUCTION_MODE', false); }
    function isPilotMode() { return !isProductionMode() && flagEnabled('PILOT_MODE', false); }
    function isDevelopmentMode() { return flagEnabled('DEVELOPMENT_MODE', false); }
    function isDemoMode() { return flagEnabled('DEMO_MODE', false); }
    function isPasswordRecoveryEnabled() {
        return supabaseAuthReady() && flagEnabled('USE_SUPABASE_PASSWORD_RECOVERY', false);
    }
    function requireAppMetadataRole() { return flagEnabled('REQUIRE_APP_METADATA_ROLE', true); }
    function requireEmailVerified() { return flagEnabled('REQUIRE_EMAIL_VERIFIED', true); }

    function supabaseAuthReady() {
        const service = global.supabaseClientService;
        return !!(
            service &&
            typeof service.isEnabled === 'function' &&
            service.isEnabled('USE_SUPABASE_AUTH') &&
            typeof service.getClient === 'function' &&
            service.getClient()
        );
    }

    function client() {
        if (!supabaseAuthReady()) return null;
        return global.supabaseClientService.getClient();
    }

    async function withAuthTimeout(operation, label) {
        if (global.errorService && typeof global.errorService.withTimeout === 'function') {
            const timeoutMs = global.supabaseClientService?.readConfig?.()?.SUPABASE_TIMEOUT_MS || 10000;
            return global.errorService.withTimeout(operation, timeoutMs, label || 'Authentication request');
        }
        return operation;
    }

    function loginSecurityService() {
        return global.LoginAttemptSecurityService || global.loginAttemptSecurityService || null;
    }

    function loginDeviceMetadata() {
        const nav = global.navigator || {};
        return {
            userAgent: nav.userAgent || '',
            platform: nav.platform || '',
            source: 'authService',
            timezone: global.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || ''
        };
    }

    function cachedPrincipal(identifier, expectedRole) {
        const cached = readValidatedCache()?.user || {};
        return {
            email: String(identifier || cached.email || '').trim().toLowerCase(),
            employeeId: cached.empId || '',
            userId: cached.id || cached.authUserId || '',
            role: normalizeRole(expectedRole || cached.role),
            tenantSlug: cached.tenantSlug || '',
            tenantId: cached.tenantId || ''
        };
    }

    function loginSecurityContext(identifier, expectedRole) {
        const principal = cachedPrincipal(identifier, expectedRole);
        return {
            actor: {
                id: principal.userId,
                userId: principal.userId,
                empId: principal.employeeId,
                email: principal.email,
                role: principal.role,
                tenantSlug: principal.tenantSlug
            },
            tenantSlug: principal.tenantSlug,
            tenantId: principal.tenantId,
            source: 'authService'
        };
    }

    function recordLoginSecurity(identifier, expectedRole, outcome, overrides = {}) {
        const service = loginSecurityService();
        if (!service || typeof service.recordLoginAttempt !== 'function') return null;
        const principal = cachedPrincipal(identifier, expectedRole);
        try {
            return service.recordLoginAttempt({
                email: principal.email,
                employeeId: principal.employeeId,
                userId: principal.userId,
                role: principal.role,
                tenantSlug: principal.tenantSlug,
                tenantId: principal.tenantId,
                outcome,
                source: global.location?.pathname || 'authService',
                device: loginDeviceMetadata(),
                ...overrides
            }, loginSecurityContext(identifier, expectedRole));
        } catch (_error) {
            return null;
        }
    }

    function isLoginLocked(identifier, expectedRole) {
        const service = loginSecurityService();
        if (!service || typeof service.applyLockoutPolicy !== 'function') return false;
        try {
            const principal = cachedPrincipal(identifier, expectedRole);
            const result = service.applyLockoutPolicy({
                email: principal.email,
                employeeId: principal.employeeId,
                role: principal.role,
                tenantSlug: principal.tenantSlug,
                outcome: 'BLOCKED',
                source: global.location?.pathname || 'authService',
                device: loginDeviceMetadata()
            }, loginSecurityContext(identifier, expectedRole));
            if (result?.locked) {
                recordLoginSecurity(identifier, expectedRole, 'BLOCKED', { failureReason: 'ACCOUNT_LOCKED' });
                return true;
            }
        } catch (_error) {}
        return false;
    }

    function mapSupabaseUser(user) {
        if (!user) return null;
        const appMetadata = user.app_metadata || {};
        const userMetadata = user.user_metadata || {};
        const role = normalizeRole(appMetadata.role);
        const empId = appMetadata.empId || appMetadata.emp_id || null;
        const rawTenantId = appMetadata.tenantId || appMetadata.tenant_id || '';
        const tenantSlug = normalizeTenantClaim(appMetadata.tenantSlug || appMetadata.tenant_slug || rawTenantId);
        return {
            id: user.id,
            authUserId: user.id,
            name: appMetadata.name || userMetadata.full_name || userMetadata.name || user.email || 'User',
            email: user.email || '',
            role,
            empId,
            tenantId: rawTenantId,
            tenantSlug,
            organizationId: appMetadata.organizationId || appMetadata.organization_id || '',
            companyOwner: appMetadata.company_owner === true,
            emailVerifiedAt: user.email_confirmed_at || user.confirmed_at || '',
            emailVerified: !!(user.email_confirmed_at || user.confirmed_at),
            source: 'supabase',
            roleTrusted: !!role,
            empIdTrusted: !!empId,
            accountStatus: String(appMetadata.accountStatus || appMetadata.account_status || appMetadata.status || 'active').toLowerCase(),
            accountActive: appMetadata.active !== false && appMetadata.disabled !== true
        };
    }

    function clearLocalSession() {
        COMPATIBLE_SESSION_KEYS.forEach(key => global.sessionStorage?.removeItem(key));
    }

    function readValidatedCache() {
        try {
            const user = JSON.parse(global.sessionStorage?.getItem('currentUser') || 'null');
            if (!user || user.sessionVersion !== SESSION_VERSION || user.source !== 'supabase' || !user.roleTrusted) return null;
            if (!isOfficialRole(user.role) || !user.authUserId || user.authUserId !== user.id) return null;
            if (!Number.isFinite(Number(user.sessionExpiresAt)) || Number(user.sessionExpiresAt) <= Math.floor(Date.now() / 1000)) {
                clearLocalSession();
                return null;
            }
            const employee = JSON.parse(global.sessionStorage?.getItem('currentEmployee') || 'null');
            return { user, emp: employee };
        } catch (_error) {
            clearLocalSession();
            return null;
        }
    }

    function resolveEmployee(user) {
        const database = db();
        if (!database || !user?.empId || typeof database.getEmployee !== 'function') return null;
        return database.getEmployee(user.empId) || null;
    }

    function persistValidatedSession(user, session, employee = null) {
        if (!user || !session || !isOfficialRole(user.role) || !user.roleTrusted) return null;
        const expiresAt = Number(session.expires_at || 0);
        if (!expiresAt) return null;
        const compatibleUser = {
            ...user,
            sessionVersion: SESSION_VERSION,
            sessionExpiresAt: expiresAt,
            sessionValidatedAt: new Date().toISOString()
        };
        const resolvedEmployee = employee || resolveEmployee(compatibleUser);
        global.sessionStorage?.setItem('currentUser', JSON.stringify(compatibleUser));
        if (resolvedEmployee) global.sessionStorage?.setItem('currentEmployee', JSON.stringify(resolvedEmployee));
        else global.sessionStorage?.removeItem('currentEmployee');
        if (compatibleUser.role === 'super_admin') global.sessionStorage?.setItem('saUser', JSON.stringify(compatibleUser));
        if (compatibleUser.role === 'platform_owner') global.sessionStorage?.setItem('platformOwnerUser', JSON.stringify(compatibleUser));
        if (compatibleUser.role === 'admin') global.sessionStorage?.setItem('adUser', JSON.stringify(compatibleUser));
        if (compatibleUser.role === 'manager') global.sessionStorage?.setItem('mgUser', JSON.stringify(compatibleUser));
        if (compatibleUser.role === 'employee') global.sessionStorage?.setItem('empUser', JSON.stringify(resolvedEmployee || compatibleUser));
        if (compatibleUser.role === 'hr' || compatibleUser.role === 'hr_head') global.sessionStorage?.setItem('hrUser', JSON.stringify(compatibleUser));
        if (compatibleUser.role === 'director') global.sessionStorage?.setItem('directorUser', JSON.stringify(compatibleUser));
        return { user: compatibleUser, emp: resolvedEmployee };
    }

    function sessionIsExpired(session) {
        const expiresAt = Number(session?.expires_at || 0);
        return !expiresAt || expiresAt <= Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS;
    }

    function accountIsAllowed(user) {
        if (!user || !user.accountActive) return false;
        return !['archived', 'disabled', 'inactive', 'invited', 'pending', 'pending_activation', 'pending_password', 'suspended', 'terminated'].includes(user.accountStatus);
    }

    function passwordRecoveryRequestMessage(error) {
        const message = String(error?.message || error || '').toLowerCase();
        if (/rate.?limit|too many|email.*frequency/.test(message)) {
            return 'Too many recovery requests were made. Wait a few minutes before trying again.';
        }
        if (/redirect|allow.?list|not allowed|site url/.test(message)) {
            return 'Password recovery is not configured for this application address. Contact your administrator.';
        }
        if (/network|fetch|timeout|connection/.test(message)) {
            return 'We could not reach the authentication service. Check your connection and try again.';
        }
        return 'Unable to send a recovery email right now. Please try again later.';
    }

    function passwordRecoveryRedirectUrl() {
        const runtime = global.supabaseClientService?.readConfig?.() || {};
        const configured = String(runtime.PASSWORD_RECOVERY_REDIRECT_URL || '').trim();
        const browserOrigin = String(global.location?.origin || '').replace(/\/+$/, '');
        const trustedOrigin = runtime.APP_ENV === 'production'
            ? String(runtime.APP_ORIGIN || '').replace(/\/+$/, '')
            : browserOrigin;
        const fallback = trustedOrigin ? `${trustedOrigin}/auth-callback.html?flow=recovery` : '';
        if (!configured) return fallback;
        try {
            const url = new URL(configured);
            const trustedProductionOrigin = runtime.APP_ENV !== 'production' || (
                trustedOrigin && url.origin === trustedOrigin
            );
            if (
                !trustedProductionOrigin ||
                !/\/auth-callback\.html$/i.test(url.pathname) ||
                url.searchParams.size !== 1 ||
                url.searchParams.get('flow') !== 'recovery' ||
                url.hash
            ) {
                return fallback;
            }
            return url.href;
        } catch (_error) {
            return fallback;
        }
    }

    async function invalidateSupabaseSession() {
        const authClient = client();
        try {
            if (authClient?.auth?.signOut) await withAuthTimeout(authClient.auth.signOut({ scope: 'local' }), 'Session invalidation');
        } catch (_error) {}
        clearLocalSession();
    }

    const authService = {
        normalizeRole,
        isOfficialRole,
        isTenantRole,
        getRoleRedirect(role) { return ROLE_REDIRECTS[normalizeRole(role)] || 'ArthHRMS.html'; },
        getTenantRoleRedirect(role) {
            const normalized = normalizeRole(role);
            return isTenantRole(normalized) ? ROLE_REDIRECTS[normalized] : null;
        },
        redirectForRole(role) {
            const target = this.getRoleRedirect(role);
            if (global.location && target) global.location.replace(target);
            return target;
        },
        isSupabaseAuthEnabled() { return supabaseAuthReady(); },
        isProductionMode,
        isPilotMode,
        isDevelopmentMode,
        isDemoMode,
        isPasswordRecoveryEnabled,
        isLocalDemoLoginAllowed() { return false; },
        isSetupRequired() { return db()?.isSetupRequired ? db().isSetupRequired() : false; },
        getInstallHealth() { return db()?.getInstallHealth ? db().getInstallHealth() : null; },
        getCurrentUser() { return readValidatedCache()?.user || null; },
        getCurrentEmployee() { return readValidatedCache()?.emp || null; },
        clearSession() { clearLocalSession(); },
        getAccessContext() {
            const user = this.getCurrentUser();
            const role = normalizeRole(user?.role);
            return {
                user,
                role,
                empId: user?.empId || null,
                isEmployee: role === 'employee',
                isManager: role === 'manager',
                isAdmin: role === 'admin',
                isHR: role === 'hr',
                isHRHead: role === 'hr_head',
                isDirector: role === 'director',
                isSuperAdmin: role === 'super_admin',
                isPlatformOwner: role === 'platform_owner',
                isTechnicalAdmin: role === 'super_admin',
                isOps: ['admin', 'hr', 'hr_head', 'director'].includes(role)
            };
        },
        canAccessEmployee(targetEmpId) {
            const context = this.getAccessContext();
            const database = db();
            if (!context.user || !targetEmpId || !database) return false;
            const officialTarget = database.resolveEmployeeId ? database.resolveEmployeeId(targetEmpId) : targetEmpId;
            const target = database.getEmployee ? database.getEmployee(officialTarget) : null;
            if (!target) return false;
            const settings = database.get?.()?.companySettings || {};
            const actorTenant = normalizeTenantClaim(context.user.tenantSlug || context.user.tenantId || '');
            const targetTenant = normalizeTenantClaim(target.tenantSlug || target.tenantId || target.organizationId || settings.tenantSlug || settings.tenantId || '');
            if (!actorTenant || !targetTenant || actorTenant !== targetTenant) return false;
            if (context.isPlatformOwner || context.isSuperAdmin) return false;
            if (context.isOps) return true;
            if (context.empId && officialTarget === (database.resolveEmployeeId ? database.resolveEmployeeId(context.empId) : context.empId)) return true;
            if (context.isManager && context.empId && database.getManagerTeam) {
                const team = database.getManagerTeam(context.empId);
                return !!team && (team.memberIds || []).some(id => (database.resolveEmployeeId ? database.resolveEmployeeId(id) : id) === officialTarget);
            }
            return false;
        },
        requireCurrentRole(expectedRole, options = {}) {
            const user = this.getCurrentUser();
            const expected = Array.isArray(expectedRole) ? expectedRole.map(normalizeRole) : [normalizeRole(expectedRole)];
            const allowed = expected.filter(Boolean);
            if (!user) {
                if (!global.__ARTHHRMS_AUTH_GUARD_PENDING__ && options.redirect !== false && global.location) {
                    global.location.replace('ArthHRMS.html?reason=session_required');
                }
                return null;
            }
            if (allowed.length && !allowed.includes(normalizeRole(user.role))) {
                if (options.redirect !== false && global.location) global.location.replace('403.html');
                return null;
            }
            return user;
        },
        protectPage(expectedRole) { return this.requireCurrentRole(expectedRole); },
        async validateCurrentSession(options = {}) {
            if (!supabaseAuthReady()) {
                clearLocalSession();
                return { authenticated: false, status: 401, code: 'AUTH_CONFIGURATION_REQUIRED' };
            }
            const authClient = client();
            try {
                const sessionResult = await withAuthTimeout(authClient.auth.getSession(), 'Session restore');
                if (sessionResult.error || !sessionResult.data?.session || sessionIsExpired(sessionResult.data.session)) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: sessionIsExpired(sessionResult.data?.session) ? 'SESSION_EXPIRED' : 'SESSION_REQUIRED' };
                }
                const session = sessionResult.data.session;
                const userResult = await withAuthTimeout(authClient.auth.getUser(session.access_token), 'Session validation');
                if (userResult.error || !userResult.data?.user || userResult.data.user.id !== session.user?.id) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: 'SESSION_INVALID' };
                }
                const user = mapSupabaseUser(userResult.data.user);
                if (!user || !isOfficialRole(user.role) || (requireAppMetadataRole() && !user.roleTrusted)) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: 'TRUSTED_ROLE_REQUIRED' };
                }
                if (user.role !== 'platform_owner' && !String(user.tenantSlug || user.tenantId || '').trim()) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: 'TRUSTED_TENANT_REQUIRED' };
                }
                if (requireEmailVerified() && !user.emailVerified) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: 'EMAIL_NOT_VERIFIED' };
                }
                if (!accountIsAllowed(user)) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: 'ACCOUNT_INACTIVE' };
                }
                if (options.expectedUserId && options.expectedUserId !== user.id) {
                    await invalidateSupabaseSession();
                    return { authenticated: false, status: 401, code: 'SESSION_FIXATION_DETECTED' };
                }
                const persisted = persistValidatedSession(user, session);
                return { authenticated: true, status: 200, code: 'SESSION_VALID', session, ...persisted };
            } catch (error) {
                clearLocalSession();
                return { authenticated: false, status: 401, code: 'SESSION_VALIDATION_FAILED', error };
            }
        },
        async authorizePage(allowedRoles = []) {
            const validation = await this.validateCurrentSession();
            if (!validation.authenticated) return validation;
            const allowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map(normalizeRole).filter(Boolean);
            if (allowed.length && !allowed.includes(normalizeRole(validation.user.role))) {
                return { ...validation, authorized: false, status: 403, code: 'ROLE_FORBIDDEN' };
            }
            return { ...validation, authorized: true, status: 200, code: 'AUTHORIZED' };
        },
        async loginWithSupabase(email, password, expectedRole = '', options = {}) {
            if (!supabaseAuthReady()) throw new Error('Enterprise authentication is not configured.');
            if (isLoginLocked(email, expectedRole)) return null;
            clearLocalSession();
            const authClient = client();
            try {
                const existing = await withAuthTimeout(authClient.auth.getSession(), 'Existing session check');
                if (existing.data?.session && authClient.auth.signOut) {
                    await withAuthTimeout(authClient.auth.signOut({ scope: 'local' }), 'Pre-login session rotation');
                }
            } catch (_error) {
                clearLocalSession();
            }
            const result = await withAuthTimeout(authClient.auth.signInWithPassword({ email, password }), 'Supabase sign in');
            if (result.error || !result.data?.session || !result.data?.user) {
                recordLoginSecurity(email, expectedRole, 'FAILED', { failureReason: 'INVALID_CREDENTIALS' });
                if (result.error) throw result.error;
                return null;
            }
            const validation = await this.validateCurrentSession({ expectedUserId: result.data.user.id });
            const expected = normalizeRole(expectedRole);
            if (!validation.authenticated || (expected && normalizeRole(validation.user?.role) !== expected)) {
                await invalidateSupabaseSession();
                recordLoginSecurity(email, expectedRole, 'FAILED', { failureReason: 'ROLE_OR_SESSION_REJECTED' });
                return null;
            }
            const surface = String(options.surface || '').trim().toLowerCase();
            const trustedRole = normalizeRole(validation.user?.role);
            const surfaceAllowed = (
                (!surface || surface === 'any') ||
                (surface === 'tenant' && isTenantRole(trustedRole)) ||
                (surface === 'platform' && trustedRole === 'platform_owner')
            );
            if (!surfaceAllowed) {
                await invalidateSupabaseSession();
                recordLoginSecurity(email, trustedRole, 'FAILED', { failureReason: 'LOGIN_SURFACE_ROLE_REJECTED' });
                return null;
            }
            recordLoginSecurity(email, validation.user.role, 'SUCCESS', {
                userId: validation.user.id,
                employeeId: validation.user.empId || ''
            });
            return {
                session: validation.session,
                user: validation.user,
                emp: validation.emp || null,
                source: 'supabase',
                redirectTo: this.getRoleRedirect(validation.user.role)
            };
        },
        async loginTenantWithSupabase(email, password) {
            return this.loginWithSupabase(email, password, '', { surface: 'tenant' });
        },
        async loginPlatformOwnerWithSupabase(email, password) {
            return this.loginWithSupabase(email, password, 'platform_owner', { surface: 'platform' });
        },
        async requestPasswordRecovery(email) {
            if (!isPasswordRecoveryEnabled()) {
                return {
                    ok: false,
                    code: 'RECOVERY_CONFIGURATION_REQUIRED',
                    message: 'Secure password recovery could not start because authentication configuration did not load. Refresh the page and try again.'
                };
            }
            if (typeof client()?.auth?.resetPasswordForEmail !== 'function') {
                return {
                    ok: false,
                    code: 'RECOVERY_API_UNAVAILABLE',
                    message: 'Secure password recovery could not start. Refresh the page and try again.'
                };
            }
            const normalizedEmail = String(email || '').trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                return {
                    ok: false,
                    code: 'RECOVERY_EMAIL_INVALID',
                    message: 'Enter a valid email address.'
                };
            }
            try {
                const redirectTo = passwordRecoveryRedirectUrl();
                if (!redirectTo) {
                    return {
                        ok: false,
                        code: 'RECOVERY_REDIRECT_REQUIRED',
                        message: 'Secure password recovery is not configured for this application origin.'
                    };
                }
                const result = await withAuthTimeout(
                    client().auth.resetPasswordForEmail(normalizedEmail, {
                        redirectTo
                    }),
                    'Password recovery request'
                );
                if (result.error) throw result.error;
                return {
                    ok: true,
                    code: 'RECOVERY_REQUEST_ACCEPTED',
                    message: 'If an account exists for this email, a password recovery link has been sent.'
                };
            } catch (error) {
                return {
                    ok: false,
                    code: 'RECOVERY_REQUEST_FAILED',
                    message: passwordRecoveryRequestMessage(error)
                };
            }
        },
        async getCurrentSession() { return this.validateCurrentSession(); },
        async getSupabaseSession() {
            const validation = await this.validateCurrentSession();
            return validation.authenticated ? validation.session : null;
        },
        async getSupabaseCurrentUser() {
            const validation = await this.validateCurrentSession();
            return validation.authenticated ? validation.user : null;
        },
        async getCurrentUserLive() { return this.getSupabaseCurrentUser(); },
        async restoreSessionFromSupabase() {
            const validation = await this.validateCurrentSession();
            return validation.authenticated ? validation : null;
        },
        async restoreTenantSessionFromSupabase() {
            const validation = await this.validateCurrentSession();
            if (!validation.authenticated) return null;
            if (!isTenantRole(validation.user?.role)) {
                await invalidateSupabaseSession();
                return null;
            }
            return validation;
        },
        async restorePlatformSessionFromSupabase() {
            const validation = await this.validateCurrentSession();
            if (!validation.authenticated) return null;
            if (normalizeRole(validation.user?.role) !== 'platform_owner') {
                await invalidateSupabaseSession();
                return null;
            }
            return validation;
        },
        async handleAuthCallback(input = {}) {
            if (!global.authCallbackService?.dispatchAuthCallback) {
                return { ok: false, error: 'Authentication callback handler is not loaded' };
            }
            const result = await global.authCallbackService.dispatchAuthCallback(input);
            if (!result?.ok) return result;
            if (result.type === global.authCallbackService.CALLBACK_TYPES?.RECOVERY) {
                clearLocalSession();
                return result;
            }
            if (result.type === global.authCallbackService.CALLBACK_TYPES?.INVITE && result.action === 'create_password') {
                clearLocalSession();
                return result;
            }
            const validation = await this.validateCurrentSession();
            if (!validation.authenticated) {
                return {
                    ok: false,
                    type: result.type || '',
                    code: validation.code || 'AUTH_CALLBACK_SESSION_INVALID',
                    error: 'The authenticated session could not be validated.'
                };
            }
            return { ...result, user: validation.user, redirectTo: this.getRoleRedirect(validation.user.role) };
        },
        async updateRecoveredPassword(password) {
            if (!global.passwordRecoveryService?.completePasswordRecovery) {
                return {
                    ok: false,
                    type: 'recovery',
                    code: 'RECOVERY_HANDLER_UNAVAILABLE',
                    error: 'Password recovery is unavailable. Try again later.'
                };
            }
            return global.passwordRecoveryService.completePasswordRecovery(password);
        },
        async completeInvitedAccountPassword(password) {
            if (!global.authInviteService?.completeInvitePasswordCreation) {
                return {
                    ok: false,
                    type: 'invite',
                    code: 'INVITE_HANDLER_UNAVAILABLE',
                    error: 'Invitation password setup is unavailable. Refresh the page and try again.'
                };
            }
            const result = await global.authInviteService.completeInvitePasswordCreation(password);
            if (!result?.ok) return result;
            const validation = await this.validateCurrentSession({ expectedUserId: result.user?.id });
            if (!validation.authenticated) {
                return {
                    ok: false,
                    type: 'invite',
                    code: validation.code || 'INVITE_SESSION_ACTIVATION_FAILED',
                    error: 'Your account was activated, but the new session could not be verified. Sign in with your new password.'
                };
            }
            return {
                ...result,
                user: validation.user,
                redirectTo: result.redirectTo || this.getRoleRedirect(validation.user.role)
            };
        },
        startAuthStateTracking() {
            if (!supabaseAuthReady() || authTrackingStarted) return false;
            authTrackingStarted = true;
            client().auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                    clearLocalSession();
                    return;
                }
                if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
                    setTimeout(() => this.validateCurrentSession(), 0);
                }
            });
            return true;
        },
        async logout() {
            await invalidateSupabaseSession();
            return true;
        }
    };

    global.authService = Object.freeze({ ...(global.authService || {}), ...authService });
})(window);
