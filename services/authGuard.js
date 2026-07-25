// Shared fail-closed route guard for every protected ArthHRMS HTML entry point.
(function (global) {
    'use strict';

    const ROUTE_POLICIES = Object.freeze({
        'admin.html': ['admin'],
        'attendance-policy-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'backup-disaster-recovery-center.html': ['platform_owner', 'super_admin'],
        'company-profile-center.html': ['super_admin', 'admin'],
        'director.html': ['director'],
        'duplicate-resolution-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'employee-data-quality-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'employee-migration-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'employee-portal.html': ['employee'],
        'employee-uat-center.html': ['employee'],
        'end-to-end-validation-center.html': ['platform_owner', 'super_admin', 'admin', 'hr_head', 'director'],
        'enterprise-test-lab.html': ['platform_owner'],
        'go-live-certification-center.html': ['platform_owner'],
        'go-live-readiness-center.html': ['super_admin'],
        'hr-dashboard.html': ['hr', 'hr_head'],
        'hr-uat-center.html': ['hr', 'hr_head'],
        'leave-policy-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'manager-uat-center.html': ['manager'],
        'manager.html': ['manager'],
        'operations-monitoring.html': ['platform_owner', 'super_admin', 'admin'],
        'organization-hierarchy-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'organization-import-center.html': ['super_admin', 'admin', 'hr_head'],
        'payroll-configuration-center.html': ['super_admin', 'admin', 'hr_head'],
        'performance-testing-center.html': ['platform_owner', 'super_admin', 'admin'],
        'platform-control.html': ['platform_owner'],
        'qa-validation.html': ['platform_owner', 'super_admin', 'admin'],
        'security-validation-center.html': ['platform_owner', 'super_admin'],
        'setup.html': ['platform_owner', 'super_admin'],
        'shift-roster-center.html': ['super_admin', 'admin', 'hr', 'hr_head'],
        'super-admin.html': ['super_admin'],
        'working-calendar-center.html': ['super_admin', 'admin', 'hr', 'hr_head']
    });
    const PUBLIC_ROUTES = Object.freeze(['arthhrms.html', 'index.html', 'platform-login.html', 'password-recovery.html', 'auth-callback.html', '403.html']);
    const scriptElement = global.document?.currentScript || null;
    const applicationRoot = scriptElement?.src ? new URL('../', scriptElement.src) : null;
    let resolveReady;
    const ready = new Promise((resolve) => {
        resolveReady = resolve;
    });

    function pageName(pathname) {
        const path = String(pathname || global.location?.pathname || '').split(/[?#]/)[0];
        return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1) || 'ArthHRMS.html').toLowerCase();
    }

    function policyFor(pathname) {
        return ROUTE_POLICIES[pageName(pathname)] || null;
    }

    function runtimePolicyFor(route, configuredRoles) {
        if (route !== 'setup.html') return configuredRoles;
        return global.supabaseClientService?.isEnabled?.('USE_COMPANY_SETUP_ORCHESTRATION')
            ? ['super_admin']
            : ['platform_owner'];
    }

    function isPublic(pathname) {
        return PUBLIC_ROUTES.includes(pageName(pathname));
    }

    function hideDocument() {
        global.__ARTHHRMS_AUTH_GUARD_PENDING__ = true;
        if (global.document?.documentElement) {
            global.document.documentElement.style.visibility = 'hidden';
            global.document.documentElement.setAttribute('aria-busy', 'true');
        }
    }

    function revealDocument() {
        global.__ARTHHRMS_AUTH_GUARD_PENDING__ = false;
        if (global.document?.documentElement) {
            global.document.documentElement.style.visibility = '';
            global.document.documentElement.removeAttribute('aria-busy');
        }
    }

    function loadScript(source) {
        return new Promise((resolve, reject) => {
            const existing = Array.from(global.document?.scripts || []).find(item => item.src === source);
            if (existing?.dataset?.loaded === 'true') return resolve();
            const element = existing || global.document.createElement('script');
            element.src = source;
            element.async = false;
            element.onload = () => { element.dataset.loaded = 'true'; resolve(); };
            element.onerror = () => {
                let dependency = 'unknown';
                try { dependency = new URL(source, global.location?.href).pathname; } catch (_error) {}
                reject(new Error(`Authentication dependency failed to load: ${dependency}`));
            };
            if (!existing) (global.document.head || global.document.documentElement).appendChild(element);
        });
    }

    async function ensureRuntime() {
        if (!global.ARTHHRMS_CONFIG) {
            if (!applicationRoot) throw new Error('Application root is unavailable.');
            await loadScript(new URL('runtime-config.js', applicationRoot).href);
        }
        if (!global.ARTHHRMS_CONFIG) throw new Error('Runtime configuration is unavailable.');
        if (!global.supabase) {
            await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8');
        }
        if (!global.supabaseClientService) {
            if (!applicationRoot) throw new Error('Application root is unavailable.');
            await loadScript(new URL('services/supabaseClient.js', applicationRoot).href);
        }
        if (!global.authService) {
            if (!applicationRoot) throw new Error('Application root is unavailable.');
            await loadScript(new URL('services/authService.js', applicationRoot).href);
        }
        if (!global.authService?.authorizePage) throw new Error('Authentication service is unavailable.');
        if (!global.rbacEnforcementService) {
            if (!applicationRoot) throw new Error('Application root is unavailable.');
            await loadScript(new URL('services/rbacEnforcementService.js', applicationRoot).href);
        }
        if (!global.rbacEnforcementService?.authorizeRoute) throw new Error('Authorization service is unavailable.');
        if (!global.supabasePersistenceService) {
            if (!applicationRoot) throw new Error('Application root is unavailable.');
            await loadScript(new URL('services/supabasePersistenceService.js', applicationRoot).href);
        }
        if (!global.supabasePersistenceService?.hydrateAuthenticatedState) throw new Error('Business persistence service is unavailable.');
    }

    function loginUrl(code) {
        const currentPage = pageName();
        const allowedRoles = policyFor(currentPage) || [];
        const legacyPlatformSetup = currentPage === 'setup.html'
            && !global.supabaseClientService?.isEnabled?.('USE_COMPANY_SETUP_ORCHESTRATION');
        const loginPage = (allowedRoles.length === 1 && allowedRoles[0] === 'platform_owner') || legacyPlatformSetup
            ? 'platform-login.html'
            : 'ArthHRMS.html';
        return `${loginPage}?reason=${encodeURIComponent(code || 'session_required')}&returnTo=${encodeURIComponent(currentPage)}`;
    }

    function redirectToLogin(code) {
        global.authService?.clearSession?.();
        if (global.location) global.location.replace(loginUrl(code));
    }

    function redirectToForbidden(decision) {
        try {
            global.sessionStorage?.setItem('arthhrms_forbidden_context', JSON.stringify({
                route: pageName(),
                role: decision?.user?.role || '',
                code: decision?.code || 'ROLE_FORBIDDEN',
                timestamp: new Date().toISOString()
            }));
        } catch (_error) {}
        if (global.location) global.location.replace('403.html');
    }

    async function enforce(pathname) {
        const route = pageName(pathname);
        if (isPublic(route)) {
            revealDocument();
            return { authenticated: false, authorized: true, status: 200, code: 'PUBLIC_ROUTE' };
        }
        let roles = policyFor(route);
        if (!roles) {
            redirectToForbidden({ code: 'ROUTE_POLICY_MISSING' });
            return { authenticated: false, authorized: false, status: 403, code: 'ROUTE_POLICY_MISSING' };
        }
        try {
            await ensureRuntime();
            roles = runtimePolicyFor(route, roles);
            const decision = await global.authService.authorizePage(roles);
            if (!decision.authenticated) {
                redirectToLogin(decision.code);
                return decision;
            }
            if (!decision.authorized) {
                redirectToForbidden(decision);
                return decision;
            }
            const routeDecision = global.rbacEnforcementService.authorizeRoute(route, roles, decision.user);
            if (!routeDecision.allowed) {
                if (routeDecision.status === 401) redirectToLogin(routeDecision.code);
                else redirectToForbidden(routeDecision);
                return { ...decision, authorized: false, ...routeDecision };
            }
            global.__ARTHHRMS_AUTH_CONTEXT__ = Object.freeze({
                actor: decision.user,
                tenantSlug: routeDecision.role === 'platform_owner' ? '' : routeDecision.tenantSlug,
                route
            });
            try {
                await global.supabasePersistenceService.hydrateAuthenticatedState();
            } catch (error) {
                redirectToLogin('PERSISTENCE_UNAVAILABLE');
                return {
                    authenticated: true,
                    authorized: false,
                    status: 503,
                    code: 'PERSISTENCE_UNAVAILABLE',
                    error
                };
            }
            revealDocument();
            global.dispatchEvent?.(new CustomEvent('arthhrms:auth-ready', { detail: { user: decision.user, route } }));
            return decision;
        } catch (_error) {
            redirectToLogin('AUTH_SERVICE_UNAVAILABLE');
            return { authenticated: false, authorized: false, status: 401, code: 'AUTH_SERVICE_UNAVAILABLE' };
        }
    }

    const guard = Object.freeze({
        ROUTE_POLICIES,
        PUBLIC_ROUTES,
        ready,
        pageName,
        policyFor,
        isPublic,
        enforce
    });
    global.ArthAuthGuard = guard;

    async function start() {
        const decision = await enforce();
        resolveReady(decision);
        return decision;
    }

    hideDocument();
    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})(window);
