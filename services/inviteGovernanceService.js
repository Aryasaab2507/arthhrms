/**
 * inviteGovernanceService.js
 * ARTHHRMS - Enterprise Invite Governance Layer
 *
 * PURPOSE:
 * Provides tenant-safe invite validation, role assignment governance,
 * duplicate invite prevention, and activation safety checks.
 *
 * This service does NOT:
 * - send invites
 * - expose platform ownership to tenants
 * - bypass RLS
 * - expose service-role secrets
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const TENANT_ONBOARDING_ROLES = Object.freeze(['employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin']);
    const INVITER_ROLES = Object.freeze(['hr', 'hr_head', 'manager', 'admin', 'super_admin']);
    const RESENDABLE_INVITE_STATES = Object.freeze(['failed', 'invite failed', 'expired', 'invite expired', 'revoked']);
    const ACTIVE_INVITE_STATES = Object.freeze(['pending', 'invite pending', 'sent', 'invite sent', 'invited', 'pending_activation', 'pending activation']);
    const DEFAULT_INVITE_TTL_DAYS = 7;
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'HIGH', 'CRITICAL']);

    function db() { return global.DB || null; }

    function data() {
        try { return db()?.get ? db().get() : {}; } catch (err) { return {}; }
    }

    function cloneObject(input) {
        const out = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
        Object.keys(input).forEach(key => {
            const value = input[key];
            out[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value;
        });
        return out;
    }

    function freezeInviteOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(item => freezeInviteOutput(item)));
        if (value && typeof value === 'object') {
            const clone = {};
            Object.keys(value).forEach(key => { clone[key] = freezeInviteOutput(value[key]); });
            return Object.freeze(clone);
        }
        return value;
    }

    function safeSeverity(value, fallback = 'HIGH') {
        const normalized = String(value || fallback).trim().toUpperCase();
        return SEVERITIES.includes(normalized) ? normalized : fallback;
    }

    function safeFailure(failureCode, severity, message, metadata = {}) {
        return freezeInviteOutput({
            failureCode: String(failureCode || 'INVITE_GOVERNANCE_FAILURE'),
            severity: safeSeverity(severity),
            message: String(message || 'Invite governance validation failed.'),
            metadata: cloneObject(metadata)
        });
    }

    function safeWarning(warningCode, message, metadata = {}) {
        return freezeInviteOutput({
            warningCode: String(warningCode || 'INVITE_GOVERNANCE_WARNING'),
            severity: 'WARNING',
            message: String(message || 'Invite governance warning.'),
            metadata: cloneObject(metadata)
        });
    }

    function normalizeOnboardingRole(role) {
        const raw = String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (!raw) return '';
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'hrhead') return 'hr_head';
        if (raw === 'platformowner' || raw === 'platform_owner' || raw === 'owner' || raw === 'root') return '';
        if (raw === 'emp') return 'employee';
        return TENANT_ONBOARDING_ROLES.includes(raw) ? raw : '';
    }

    function normalizeEmail(email) {
        try { return db()?.normalizeEmail ? db().normalizeEmail(email) : String(email || '').trim().toLowerCase(); } catch (err) { return String(email || '').trim().toLowerCase(); }
    }

    function normalizeTenant(value) {
        return String(value || '').trim();
    }

    function tenantOf(record = {}) {
        return normalizeTenant(record.tenantId || record.companyId || record.organizationId || record.orgId || record.tenant_id || record.company_id);
    }

    function defaultTenant(sourceData = data()) {
        const settings = sourceData.companySettings || sourceData.settings || {};
        return tenantOf(settings) || normalizeTenant(settings.companyName || '');
    }

    function findEmployee(empId, sourceData = data()) {
        const id = db()?.resolveEmployeeId ? db().resolveEmployeeId(empId, sourceData) : String(empId || '').trim();
        return (sourceData.employees || []).find(emp => emp.id === id || emp.empId === id || emp.employeeId === id) || null;
    }

    function findUserByEmail(email, sourceData = data()) {
        const target = normalizeEmail(email);
        return (sourceData.users || []).find(user => normalizeEmail(user.email) === target) || null;
    }

    function latestInviteByEmployeeOrEmail(empId, email, sourceData = data()) {
        const invites = sourceData.authInvites || [];
        const officialId = empId && db()?.resolveEmployeeId ? db().resolveEmployeeId(empId, sourceData) : String(empId || '').trim();
        const normalizedEmail = normalizeEmail(email);
        return invites
            .filter(inv => (officialId && inv.empId === officialId) || (normalizedEmail && normalizeEmail(inv.email) === normalizedEmail))
            .sort((a, b) => String(b.createdAt || b.sentAt || '').localeCompare(String(a.createdAt || a.sentAt || '')))[0] || null;
    }

    function statusText(invite = {}) {
        return String(invite.activationStatus || invite.inviteStatus || invite.status || '').trim().replace(/[\s-]+/g, ' ').toLowerCase();
    }

    function isInviteExpired(invite = {}, now = new Date()) {
        try {
            const explicit = invite.expiresAt || invite.expires_at || '';
            if (explicit) return new Date(explicit).getTime() < now.getTime();
            const started = invite.createdAt || invite.sentAt || invite.invitedAt || '';
            if (!started) return false;
            const ageDays = Math.floor((now.getTime() - new Date(started).getTime()) / 86400000);
            return ageDays > Number(invite.ttlDays || DEFAULT_INVITE_TTL_DAYS);
        } catch (err) {
            return false;
        }
    }

    function isActiveInvite(invite = {}) {
        const status = statusText(invite);
        if (!status) return false;
        if (RESENDABLE_INVITE_STATES.includes(status) || /failed|expired|revoked/i.test(status)) return false;
        if (/activated|active|accepted/i.test(status)) return false;
        return ACTIVE_INVITE_STATES.includes(status) || /pending|sent|invited/i.test(status);
    }

    function emitTelemetry(eventType, metadata = {}, severity = 'INFO') {
        try {
            if (global.WorkflowTelemetryService?.emitTelemetry) {
                global.WorkflowTelemetryService.emitTelemetry('AUTH', eventType, {
                    source: 'inviteGovernanceService',
                    severity,
                    status: severity === 'INFO' ? 'PASSED' : 'BLOCKED',
                    metadata: cloneObject(metadata)
                });
            }
        } catch (err) {}
    }

    function auditInvite(eventType, payload = {}, context = {}) {
        try {
            if (global.AuditService?.recordAudit) {
                global.AuditService.recordAudit({
                    eventType,
                    module: 'Auth Invite',
                    eventId: payload.inviteId || payload.empId || payload.email || '',
                    actorId: context.actorId || context.id || '',
                    employeeId: payload.empId || '',
                    source: 'inviteGovernanceService',
                    severity: payload.severity || 'INFO',
                    metadata: cloneObject(payload.metadata || payload)
                }, context);
            }
        } catch (err) {}
    }

    function validateTenantScope(payload = {}, employee = null, context = {}, sourceData = data()) {
        const failures = [];
        const warnings = [];
        const contextTenant = normalizeTenant(context.tenantId || context.companyId || defaultTenant(sourceData));
        const payloadTenant = tenantOf(payload);
        const employeeTenant = tenantOf(employee || {});
        const effectiveTenant = payloadTenant || employeeTenant || contextTenant;
        if (contextTenant && payloadTenant && payloadTenant !== contextTenant) {
            failures.push(safeFailure('CROSS_TENANT_ONBOARDING_BLOCKED', 'CRITICAL', 'Invite tenant does not match current onboarding tenant.', { contextTenant, payloadTenant }));
        }
        if (contextTenant && employeeTenant && employeeTenant !== contextTenant) {
            failures.push(safeFailure('CROSS_TENANT_ONBOARDING_BLOCKED', 'CRITICAL', 'Employee belongs to a different tenant than the onboarding context.', { contextTenant, employeeTenant }));
        }
        if (!effectiveTenant) warnings.push(safeWarning('TENANT_SCOPE_NOT_DECLARED', 'Tenant scope was not explicit; local single-tenant fallback will be used.'));
        return { failures, warnings, effectiveTenant };
    }

    function validateInvitePayload(payload = {}, context = {}) {
        try {
            const sourceData = data();
            const input = cloneObject(payload);
            const ctx = cloneObject(context);
            const failures = [];
            const warnings = [];
            const email = normalizeEmail(input.email);
            const rawRole = String(input.role || 'employee');
            const role = normalizeOnboardingRole(rawRole);
            const empId = input.empId || input.employeeId || input.employee_id || '';
            const employee = empId ? findEmployee(empId, sourceData) : null;
            const actorRole = normalizeOnboardingRole(ctx.actorRole || ctx.role || input.invitedByRole || 'hr');

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failures.push(safeFailure('INVALID_INVITE_EMAIL', 'HIGH', 'A valid invite email is required.', { emailPresent: !!email }));
            if (!role) {
                const platformAttempt = /platform|owner|root/i.test(rawRole);
                failures.push(safeFailure(platformAttempt ? 'UNSAFE_ROLE_ASSIGNMENT' : 'INVALID_ROLE_ASSIGNMENT', 'HIGH', 'Role is not allowed for tenant onboarding.', { role: rawRole }));
            }
            if (!actorRole || !INVITER_ROLES.includes(actorRole)) failures.push(safeFailure('INVITER_ROLE_NOT_ALLOWED', 'HIGH', 'Only HR, HR Head, Manager, Admin, or Super Admin may initiate tenant invites.', { actorRole: ctx.actorRole || ctx.role || '' }));
            if (actorRole === 'manager' && role && role !== 'employee') failures.push(safeFailure('MANAGER_INVITE_SCOPE_BLOCKED', 'HIGH', 'Managers may only invite employee contributors into their tenant scope.', { requestedRole: role }));
            if (empId && !employee) failures.push(safeFailure('EMPLOYEE_RECORD_REQUIRED', 'HIGH', 'Invite references an employee that does not exist.', { empId }));

            const tenant = validateTenantScope(input, employee, ctx, sourceData);
            failures.push(...tenant.failures);
            warnings.push(...tenant.warnings);

            const existingUser = findUserByEmail(email, sourceData);
            if (existingUser && empId && existingUser.empId && db()?.resolveEmployeeId && db().resolveEmployeeId(existingUser.empId, sourceData) !== db().resolveEmployeeId(empId, sourceData)) {
                failures.push(safeFailure('EMAIL_ALREADY_ASSIGNED', 'HIGH', 'Invite email already belongs to another employee user.', { email, existingEmpId: existingUser.empId }));
            }

            const existingInvite = latestInviteByEmployeeOrEmail(empId, email, sourceData);
            if (existingInvite && isActiveInvite(existingInvite) && !isInviteExpired(existingInvite)) {
                failures.push(safeFailure('DUPLICATE_ACTIVE_INVITE', 'HIGH', 'An active invite already exists for this employee or email.', { inviteId: existingInvite.inviteId || existingInvite.id || '', empId, email }));
            }

            const normalizedPayload = {
                ...input,
                empId: employee?.id || empId || '',
                email,
                role: role || '',
                tenantId: tenant.effectiveTenant || input.tenantId || '',
                companyId: tenant.effectiveTenant || input.companyId || ''
            };
            const result = freezeInviteOutput({
                success: failures.length === 0,
                ok: failures.length === 0,
                blocked: failures.length > 0,
                failures,
                warnings,
                normalizedPayload
            });
            emitTelemetry(result.success ? 'INVITE_GOVERNANCE_VALIDATED' : 'INVITE_GOVERNANCE_BLOCKED', {
                failureCount: failures.length,
                warningCount: warnings.length,
                role,
                empId: normalizedPayload.empId,
                tenantId: normalizedPayload.tenantId
            }, result.success ? 'INFO' : 'HIGH');
            if (!result.success) auditInvite('INVITE_GOVERNANCE_BLOCKED', { ...normalizedPayload, severity: 'HIGH', metadata: { failures: failures.map(f => f.failureCode) } }, ctx);
            return result;
        } catch (err) {
            return freezeInviteOutput({
                success: false,
                ok: false,
                blocked: true,
                failures: [safeFailure('INVITE_VALIDATION_FAILED_SAFE', 'HIGH', 'Invite validation failed safely.')],
                warnings: [],
                normalizedPayload: {}
            });
        }
    }

    function validateInviteActivation(invite = {}, user = {}, context = {}) {
        try {
            const failures = [];
            const warnings = [];
            const role = normalizeOnboardingRole(invite.role || user.app_metadata?.role || user.user_metadata?.role || 'employee');
            if (!role) failures.push(safeFailure('INVALID_ACTIVATION_ROLE', 'HIGH', 'Invite activation role is not allowed for tenant onboarding.'));
            if (isInviteExpired(invite)) failures.push(safeFailure('INVITE_EXPIRED', 'HIGH', 'Invite has expired and must be resent before activation.'));
            const tenant = validateTenantScope(invite, invite.empId ? findEmployee(invite.empId) : null, context);
            failures.push(...tenant.failures);
            warnings.push(...tenant.warnings);
            return freezeInviteOutput({
                success: failures.length === 0,
                ok: failures.length === 0,
                blocked: failures.length > 0,
                failures,
                warnings,
                normalizedActivation: {
                    inviteId: invite.inviteId || invite.id || '',
                    empId: invite.empId || '',
                    email: normalizeEmail(invite.email || user.email || ''),
                    role,
                    tenantId: tenant.effectiveTenant || ''
                }
            });
        } catch (err) {
            return freezeInviteOutput({ success: false, ok: false, blocked: true, failures: [safeFailure('INVITE_ACTIVATION_FAILED_SAFE', 'HIGH', 'Invite activation validation failed safely.')], warnings: [], normalizedActivation: {} });
        }
    }

    function filterOnboardingRoles(roles) {
        const source = Array.isArray(roles) ? roles : TENANT_ONBOARDING_ROLES;
        return Object.freeze(source.map(normalizeOnboardingRole).filter(Boolean).filter((role, index, list) => list.indexOf(role) === index));
    }

    function runSelfTest() {
        const blocked = validateInvitePayload({ email: 'owner@example.com', role: 'platform_owner' }, { actorRole: 'hr' });
        const malformed = validateInvitePayload({ email: 'bad', role: 'employee' }, { actorRole: 'hr' });
        const checks = [
            blocked.blocked === true,
            blocked.failures.some(item => item.failureCode === 'UNSAFE_ROLE_ASSIGNMENT'),
            malformed.blocked === true,
            Object.isFrozen(blocked),
            filterOnboardingRoles(['employee', 'platform_owner']).length === 1
        ];
        if (!checks.every(Boolean)) {
            try { console.warn('[inviteGovernanceService] Self-test warnings detected.', checks); } catch (err) {}
        }
        return checks.every(Boolean);
    }

    const api = Object.freeze({
        TENANT_ONBOARDING_ROLES,
        INVITER_ROLES,
        RESENDABLE_INVITE_STATES,
        ACTIVE_INVITE_STATES,
        normalizeOnboardingRole,
        validateInvitePayload,
        validateInviteActivation,
        isInviteExpired,
        isActiveInvite,
        filterOnboardingRoles,
        freezeInviteOutput,
        runSelfTest
    });

    global.InviteGovernanceService = api;
    global.inviteGovernanceService = api;

    if (global.__ARTHHRMS_DEV__) {
        try { runSelfTest(); } catch (err) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
