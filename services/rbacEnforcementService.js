// Central fail-closed RBAC and tenant-scope enforcement for browser entry points
// and service adapters. Supabase RLS remains the authoritative data boundary.
(function (global) {
    'use strict';

    const ROLES = Object.freeze([
        'employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin', 'platform_owner'
    ]);
    const TENANT_ROLES = Object.freeze(ROLES.filter(role => role !== 'platform_owner'));
    const PLATFORM_RESOURCES = Object.freeze(['platform_governance', 'tenant_provisioning', 'platform_analytics']);
    const OWN_TARGET_RESOURCES = Object.freeze(['employees', 'attendance', 'leave', 'payroll', 'expenses', 'documents', 'reports', 'storage']);
    const MATRIX = Object.freeze({
        platform_governance: Object.freeze({ platform_owner: ['read', 'manage', 'create', 'update', 'delete', 'execute', 'export'] }),
        tenant_provisioning: Object.freeze({ platform_owner: ['read', 'create', 'update', 'execute'] }),
        platform_analytics: Object.freeze({ platform_owner: ['read', 'export'] }),
        tenant_governance: Object.freeze({ super_admin: ['read', 'manage', 'update', 'execute'], admin: ['read', 'manage', 'update'], hr_head: ['read'], director: ['read'] }),
        users: Object.freeze({ super_admin: ['read', 'create', 'update', 'delete', 'manage'], admin: ['read', 'create', 'update'], hr: ['read', 'create'], hr_head: ['read', 'create'] }),
        employees: Object.freeze({ admin: ['read', 'create', 'update'], hr: ['read', 'create', 'update', 'delete', 'import', 'export'], hr_head: ['read', 'create', 'update', 'delete', 'import', 'export'], director: ['read'], manager: ['read'], employee: ['read', 'update'] }),
        attendance: Object.freeze({ admin: ['read', 'create', 'update'], hr: ['read', 'create', 'update', 'delete', 'import', 'export', 'approve'], hr_head: ['read', 'create', 'update', 'delete', 'import', 'export', 'approve'], director: ['read'], manager: ['read', 'approve', 'update'], employee: ['read', 'create', 'update'] }),
        leave: Object.freeze({ admin: ['read'], hr: ['read', 'create', 'update', 'delete', 'import', 'export', 'approve'], hr_head: ['read', 'create', 'update', 'delete', 'import', 'export', 'approve'], director: ['read'], manager: ['read', 'approve'], employee: ['read', 'create', 'update'] }),
        payroll: Object.freeze({ hr: ['read', 'create', 'update', 'delete', 'import', 'export', 'approve'], hr_head: ['read', 'create', 'update', 'delete', 'import', 'export', 'approve'], director: ['read', 'approve'], employee: ['read'] }),
        expenses: Object.freeze({ hr: ['read', 'update', 'export', 'approve'], hr_head: ['read', 'update', 'export', 'approve'], director: ['read', 'approve'], manager: ['read', 'approve'], employee: ['read', 'create', 'update'] }),
        documents: Object.freeze({ admin: ['read'], hr: ['read', 'create', 'update', 'delete', 'export'], hr_head: ['read', 'create', 'update', 'delete', 'export'], manager: ['read'], employee: ['read', 'create', 'update'] }),
        imports: Object.freeze({ admin: ['read', 'create', 'update', 'execute'], hr: ['read', 'create', 'update', 'execute'], hr_head: ['read', 'create', 'update', 'execute'] }),
        reports: Object.freeze({ hr: ['read', 'create', 'export'], hr_head: ['read', 'create', 'export'], director: ['read', 'export'], manager: ['read', 'export'], employee: ['read'] }),
        governance_reports: Object.freeze({ super_admin: ['read', 'export'], admin: ['read'], hr_head: ['read'], director: ['read'] }),
        dashboards: Object.freeze({ super_admin: ['read'], admin: ['read'], hr: ['read'], hr_head: ['read'], director: ['read'], manager: ['read'], employee: ['read'] }),
        notifications: Object.freeze({ super_admin: ['read'], admin: ['read', 'create'], hr: ['read', 'create', 'update'], hr_head: ['read', 'create', 'update'], manager: ['read', 'update'], employee: ['read', 'update'] }),
        settings: Object.freeze({ super_admin: ['read', 'manage', 'update'], admin: ['read', 'manage', 'update'], hr: ['read', 'update'], hr_head: ['read', 'update'], director: ['read'], manager: ['read'], employee: ['read'] }),
        integrations: Object.freeze({ super_admin: ['read', 'create', 'update', 'delete', 'manage'], admin: ['read', 'create', 'update', 'delete', 'manage'], hr: ['read', 'create', 'update'], hr_head: ['read', 'create', 'update'], manager: ['read'] }),
        webhooks: Object.freeze({ super_admin: ['read', 'create', 'update', 'delete', 'manage'], admin: ['read', 'create', 'update', 'delete', 'manage'], hr: ['read', 'create', 'update'], hr_head: ['read', 'create', 'update'] }),
        developer_api: Object.freeze({ super_admin: ['read', 'create', 'update', 'delete', 'manage'], admin: ['read', 'create', 'update', 'delete', 'manage'], hr_head: ['read'], director: ['read'] }),
        audit: Object.freeze({ super_admin: ['read', 'export'], admin: ['read'], hr: ['read'], hr_head: ['read', 'export'], director: ['read'] }),
        backups: Object.freeze({ super_admin: ['read', 'create', 'execute', 'export', 'manage'], admin: ['read'] }),
        storage: Object.freeze({ admin: ['read'], hr: ['read', 'create', 'update', 'delete'], hr_head: ['read', 'create', 'update', 'delete'], manager: ['read'], employee: ['read', 'create', 'update'] })
    });

    class AuthorizationError extends Error {
        constructor(code, message, status = 403) {
            super(message);
            this.name = 'AuthorizationError';
            this.code = code;
            this.status = status;
        }
    }

    function normalizeRole(value) {
        const raw = String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'hrhead') return 'hr_head';
        if (raw === 'platformowner' || raw === 'owner' || raw === 'root') return 'platform_owner';
        if (raw === 'emp') return 'employee';
        return raw;
    }

    function normalizeAction(value) {
        const action = String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (['get', 'list', 'view', 'search', 'download'].includes(action)) return action === 'download' ? 'export' : 'read';
        if (['insert', 'submit', 'upload'].includes(action)) return 'create';
        if (['edit', 'patch', 'put', 'cancel'].includes(action)) return 'update';
        if (['remove', 'archive'].includes(action)) return 'delete';
        if (['run', 'process', 'dispatch'].includes(action)) return 'execute';
        return action;
    }

    function normalizeResource(value) {
        const resource = String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        const aliases = { employee: 'employees', attendance_records: 'attendance', leave_requests: 'leave', payroll_records: 'payroll', expense_claims: 'expenses', import: 'imports', export: 'reports', api: 'developer_api', webhook: 'webhooks' };
        return aliases[resource] || resource;
    }

    function normalizeTenant(value) {
        return String(value || '').trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function currentActor() {
        return global.authService?.getCurrentUser?.() || null;
    }

    function actorFrom(request, context) {
        return context?.actor || request?.actor || currentActor();
    }

    function trustedActor(actor) {
        const role = normalizeRole(actor?.role);
        return !!(actor && actor.id && actor.source === 'supabase' && actor.roleTrusted === true && ROLES.includes(role));
    }

    function actorTenant(actor) {
        return normalizeTenant(actor?.tenantSlug || actor?.tenantId || actor?.organizationId || '');
    }

    function targetTenant(request, context) {
        return normalizeTenant(request?.tenantSlug || request?.tenantId || request?.organizationId || context?.tenantSlug || context?.tenantId || '');
    }

    function employeeId(value) {
        return String(value || '').trim();
    }

    function managerTeamIds(actor) {
        if (!actor?.empId || !global.DB?.getManagerTeam) return [];
        const team = global.DB.getManagerTeam(actor.empId) || {};
        return (team.memberIds || []).map(employeeId).filter(Boolean);
    }

    function auditDenied(code, actor, request) {
        try {
            global.AuditService?.recordAudit?.({
                eventType: 'RBAC_ACCESS_DENIED',
                actionType: 'RBAC_ACCESS_DENIED',
                module: 'Authorization',
                severity: 'HIGH',
                actorId: actor?.id || '',
                actorRole: normalizeRole(actor?.role),
                tenantSlug: actorTenant(actor),
                description: code,
                metadata: { resource: normalizeResource(request?.resource), action: normalizeAction(request?.action) }
            }, { skipAuthorization: true });
        } catch (_error) {}
    }

    function denied(code, message, actor, request, status = 403) {
        auditDenied(code, actor, request);
        return Object.freeze({ allowed: false, status, code, message, role: normalizeRole(actor?.role), scope: 'NONE' });
    }

    function authorize(request = {}, context = {}) {
        const actor = actorFrom(request, context);
        if (!trustedActor(actor)) return denied('TRUSTED_AUTHENTICATED_ACTOR_REQUIRED', 'A server-validated authenticated actor is required.', actor, request, 401);
        const role = normalizeRole(actor.role);
        const resource = normalizeResource(request.resource);
        const action = normalizeAction(request.action);
        if (!resource || !MATRIX[resource] || !action) return denied('RBAC_POLICY_MISSING', 'No authorization policy exists for the requested action.', actor, request);

        const isPlatformResource = PLATFORM_RESOURCES.includes(resource);
        if (role === 'platform_owner' && !isPlatformResource) return denied('PLATFORM_OWNER_TENANT_DATA_BLOCKED', 'Platform Owner is isolated from tenant business data.', actor, request);
        if (role !== 'platform_owner' && isPlatformResource) return denied('TENANT_ROLE_PLATFORM_ACCESS_BLOCKED', 'Tenant roles cannot access platform governance resources.', actor, request);

        let scope = role === 'platform_owner' ? 'PLATFORM' : ['hr', 'hr_head', 'director', 'admin', 'super_admin'].includes(role) ? 'TENANT' : role === 'manager' ? 'TEAM' : 'OWN';
        if (!isPlatformResource) {
            const claimedTenant = actorTenant(actor);
            const requestedTenant = targetTenant(request, context) || claimedTenant;
            if (!claimedTenant) return denied('TRUSTED_TENANT_REQUIRED', 'A trusted tenant claim is required.', actor, request, 401);
            if (!requestedTenant || requestedTenant !== claimedTenant) return denied('CROSS_TENANT_ACCESS_DENIED', 'Cross-tenant access is denied.', actor, request);
        }

        const allowedActions = MATRIX[resource][role] || [];
        if (!allowedActions.includes(action) && !allowedActions.includes('manage')) return denied('ROLE_ACTION_FORBIDDEN', 'The role is not permitted to perform this action.', actor, request);

        const targetEmpId = employeeId(request.targetEmployeeId || request.empId || request.subjectId);
        const ownEmpId = employeeId(actor.empId || actor.employeeId);
        const mutating = ['create', 'update', 'delete', 'approve', 'execute'].includes(action);
        if (scope === 'OWN') {
            const targetRequired = mutating || OWN_TARGET_RESOURCES.includes(resource);
            if (!ownEmpId || (targetEmpId && targetEmpId !== ownEmpId) || (targetRequired && !targetEmpId)) {
                return denied('OWN_RESOURCE_SCOPE_DENIED', 'Employees may act only on their own records.', actor, request);
            }
        }
        if (scope === 'TEAM' && targetEmpId) {
            const teamIds = managerTeamIds(actor);
            if (targetEmpId !== ownEmpId && !teamIds.includes(targetEmpId)) return denied('TEAM_RESOURCE_SCOPE_DENIED', 'Managers may act only on their reporting team.', actor, request);
        } else if (scope === 'TEAM' && mutating) {
            return denied('TEAM_TARGET_REQUIRED', 'A reporting-team target is required for this action.', actor, request);
        }

        return Object.freeze({ allowed: true, status: 200, code: 'AUTHORIZED', role, scope, tenantSlug: actorTenant(actor), resource, action });
    }

    function requireAccess(request = {}, context = {}) {
        const decision = authorize(request, context);
        if (!decision.allowed) throw new AuthorizationError(decision.code, decision.message, decision.status);
        return decision;
    }

    function authorizeRoute(route, allowedRoles, actor = currentActor()) {
        const request = { resource: 'dashboards', action: 'read', tenantSlug: actorTenant(actor), actor };
        if (!trustedActor(actor)) return denied('TRUSTED_AUTHENTICATED_ACTOR_REQUIRED', 'A server-validated authenticated actor is required.', actor, request, 401);
        const role = normalizeRole(actor.role);
        const allowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map(normalizeRole).filter(Boolean);
        if (!allowed.includes(role)) return denied('ROLE_ROUTE_FORBIDDEN', 'The role is not permitted to open this route.', actor, request);
        if (role !== 'platform_owner' && !actorTenant(actor)) return denied('TRUSTED_TENANT_REQUIRED', 'A trusted tenant claim is required for tenant routes.', actor, request, 401);
        return Object.freeze({ allowed: true, status: 200, code: 'ROUTE_AUTHORIZED', role, route: String(route || '') });
    }

    function resolveTenant(requestedTenant, actor = currentActor()) {
        if (!trustedActor(actor)) throw new AuthorizationError('TRUSTED_AUTHENTICATED_ACTOR_REQUIRED', 'A server-validated authenticated actor is required.', 401);
        if (normalizeRole(actor.role) === 'platform_owner') throw new AuthorizationError('PLATFORM_OWNER_TENANT_DATA_BLOCKED', 'Platform Owner is isolated from tenant business data.');
        const claimed = actorTenant(actor);
        const requested = normalizeTenant(requestedTenant || claimed);
        if (!claimed) throw new AuthorizationError('TRUSTED_TENANT_REQUIRED', 'A trusted tenant claim is required.', 401);
        if (requested !== claimed) throw new AuthorizationError('CROSS_TENANT_ACCESS_DENIED', 'Cross-tenant access is denied.');
        return claimed;
    }

    const service = Object.freeze({
        ROLES,
        TENANT_ROLES,
        PLATFORM_RESOURCES,
        OWN_TARGET_RESOURCES,
        MATRIX,
        AuthorizationError,
        normalizeRole,
        normalizeAction,
        normalizeResource,
        normalizeTenant,
        trustedActor,
        authorize,
        requireAccess,
        authorizeRoute,
        resolveTenant,
        getRoleMatrix() { return MATRIX; }
    });

    global.RBACEnforcementService = service;
    global.rbacEnforcementService = service;
})(typeof window !== 'undefined' ? window : globalThis);
