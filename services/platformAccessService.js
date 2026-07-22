/**
 * platformAccessService.js
 * ARTHHRMS - Platform Governance Access + View Layer
 *
 * PURPOSE:
 * Provides production-safe platform governance access validation and
 * tenant-level governance view shaping for platform-control.html.
 *
 * This service validates:
 * - platform-owner access isolation
 * - hidden governance route safety
 * - tenant metadata filtering
 * - governance link preservation
 * - operational monitoring visibility
 *
 * This service does NOT:
 * - expose tenant HR-sensitive data
 * - redirect tenant users
 * - bypass auth
 * - expose service-role secrets
 *
 * ARCHITECTURE RULE:
 * Platform governance views must remain metadata-only and isolated from
 * tenant hierarchy.
 *
 * STABILITY:
 * Public APIs remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.PlatformGovernanceService (optional)
 * - window.EnvironmentGovernanceService (optional)
 * - window.RLSValidationService (optional)
 * - window.OrchestrationMetricsService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[PlatformAccessService]';
    const DEFAULT_ROUTE = 'platform-control.html';

    const GOVERNANCE_SECTIONS = Object.freeze([
        'Tenant Management',
        'Deployment Governance',
        'Environment Governance',
        'Feature Rollout',
        'Operational Monitoring',
        'Security Governance',
        'Incident Visibility',
        'RLS Validation Visibility'
    ]);

    const LINKED_GOVERNANCE_PAGES = Object.freeze([
        Object.freeze({ label: 'Operations Monitoring', href: 'operations-monitoring.html', purpose: 'Platform monitoring and incidents' }),
        Object.freeze({ label: 'Enterprise Test Lab', href: 'enterprise-test-lab.html', purpose: 'Workflow and stress validation' }),
        Object.freeze({ label: 'QA Center', href: 'qa-validation.html', purpose: 'Deployment quality validation' }),
        Object.freeze({ label: 'Tenant Login Shell', href: 'ArthHRMS.html', purpose: 'Company login route, not platform governance' })
    ]);

    const TENANT_ROLES = Object.freeze(['employee', 'manager', 'hr', 'hr_head', 'director', 'admin', 'super_admin']);
    const SENSITIVE_TENANT_FIELDS = Object.freeze([
        'salary',
        'salaryamount',
        'basicsalary',
        'grosssalary',
        'netsalary',
        'payrollamount',
        'payroll',
        'payrolls',
        'payslip',
        'payslips',
        'ctc',
        'compensation',
        'compensationstructure',
        'salarystructure',
        'leavebalance',
        'leave_balance',
        'leaveentitlement',
        'leave_balance_values',
        'basic',
        'gross',
        'net',
        'allowances',
        'deductions',
        'hra',
        'pf',
        'tds',
        'bonusamount',
        'overtimeamount'
    ]);

    function db() {
        return global.DB;
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (err) {
            return String(Date.now());
        }
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (err) {}
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (err) {
            return fallback || '';
        }
    }

    function shallowClone(input) {
        const output = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                output[key] = input[key];
            });
        } catch (err) {}
        return output;
    }

    function freezeGovernanceOutput(value, seen) {
        if (!value || typeof value !== 'object') return value;
        const refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(key => {
                const child = value[key];
                if (child && typeof child === 'object') freezeGovernanceOutput(child, refs.slice());
            });
            Object.freeze(value);
        } catch (err) {}
        return value;
    }

    function freezeList(list) {
        return freezeGovernanceOutput(Array.isArray(list) ? list.slice() : []);
    }

    function normalizeRole(role) {
        if (global.authService && typeof global.authService.normalizeRole === 'function') {
            return global.authService.normalizeRole(role);
        }
        const raw = safeString(role, '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (raw === 'platformowner' || raw === 'owner' || raw === 'root') return 'platform_owner';
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'hrhead') return 'hr_head';
        if (raw === 'emp') return 'employee';
        return raw;
    }

    function isPlatformOwner(input) {
        const role = input && typeof input === 'object' ? input.role : input;
        if (global.PlatformGovernanceService && typeof global.PlatformGovernanceService.isPlatformOwner === 'function') {
            return global.PlatformGovernanceService.isPlatformOwner(role);
        }
        return normalizeRole(role) === 'platform_owner';
    }

    function isSensitiveTenantField(key) {
        const normalized = safeString(key, '').replace(/[\s_-]+/g, '').toLowerCase();
        if (SENSITIVE_TENANT_FIELDS.indexOf(normalized) !== -1) return true;
        return normalized.indexOf('salary') !== -1 ||
            normalized.indexOf('payroll') !== -1 ||
            normalized.indexOf('compensation') !== -1 ||
            normalized === 'leavebalance' ||
            normalized.indexOf('leavebalance') !== -1 ||
            normalized === 'ctc';
    }

    function currentPathname(pathname) {
        try {
            return safeString(pathname === undefined || pathname === null ? global.location?.pathname : pathname, '')
                .split('?')[0]
                .split('#')[0]
                .split('/')
                .filter(Boolean)
                .pop() || '';
        } catch (err) {
            return '';
        }
    }

    function currentHostname(locationLike) {
        try {
            return safeString(locationLike?.hostname || global.location?.hostname || '', '').toLowerCase();
        } catch (err) {
            return '';
        }
    }

    function validateGovernanceRoute(pathname, locationLike) {
        try {
            const explicitPath = pathname !== undefined && pathname !== null;
            const path = currentPathname(pathname).toLowerCase();
            const host = currentHostname(locationLike);
            const valid = path === DEFAULT_ROUTE || (!explicitPath && (
                host.indexOf('owner.') === 0 ||
                host.indexOf('platform.') === 0
            ));
            return freezeGovernanceOutput({
                success: true,
                valid,
                route: path || DEFAULT_ROUTE,
                routeType: valid ? 'PLATFORM_GOVERNANCE' : 'TENANT_OR_UNKNOWN',
                recommendation: valid ? 'Allow direct hidden governance access.' : 'Use platform-control.html or a platform governance host.'
            });
        } catch (err) {
            safeWarn('Governance route validation failed safely.', { error: err?.message || String(err) });
            return freezeGovernanceOutput({
                success: false,
                valid: false,
                route: '',
                routeType: 'UNKNOWN',
                recommendation: 'Use platform-control.html.'
            });
        }
    }

    function safeMetadata(metadata) {
        const source = shallowClone(metadata);
        const output = {};
        Object.keys(source).forEach(key => {
            if (isSensitiveTenantField(key) || /password|secret|token|service_role/i.test(key)) return;
            const value = source[key];
            if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[key] = value;
            else if (Array.isArray(value)) output[key] = value.length;
            else if (value && typeof value === 'object') output[key] = safeMetadata(value);
        });
        return output;
    }

    function emitTelemetry(eventType, metadata, severity) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                source: 'platformAccessService',
                severity: severity || 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata)
            });
            return true;
        } catch (err) {
            safeWarn('Telemetry failed safely.', { eventType, error: err?.message || String(err) });
            return false;
        }
    }

    function auditAccess(eventType, actor, metadata) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType,
                eventType,
                actorId: actor?.id || actor?.empId || actor?.email || '',
                employeeId: actor?.empId || '',
                source: 'platformAccessService',
                severity: 'INFO',
                metadata: safeMetadata(metadata)
            }, {
                source: 'platformAccessService',
                actor: shallowClone(actor)
            });
            return true;
        } catch (err) {
            safeWarn('Audit failed safely.', { eventType, error: err?.message || String(err) });
            return false;
        }
    }

    function validatePlatformAccess(actor = {}, options = {}) {
        try {
            const route = validateGovernanceRoute(options.pathname || options.route || DEFAULT_ROUTE, options.location);
            const role = normalizeRole(actor?.role || actor?.actorRole || '');
            const allowed = route.valid === true && isPlatformOwner(role);
            const result = freezeGovernanceOutput({
                success: true,
                allowed,
                route: route.route,
                role,
                reason: allowed ? 'PLATFORM_OWNER_AUTHORIZED' : route.valid ? 'PLATFORM_OWNER_REQUIRED' : 'INVALID_GOVERNANCE_ROUTE',
                warnings: freezeList(allowed ? [] : [{
                    warningCode: route.valid ? 'PLATFORM_ACCESS_DENIED' : 'INVALID_GOVERNANCE_ROUTE',
                    severity: 'CRITICAL',
                    message: route.valid ? 'Tenant roles cannot access platform governance.' : 'The requested route is not a hidden governance route.',
                    recommendation: 'Use a PLATFORM_OWNER account through platform-control.html.'
                }]),
                timestamp: nowIso()
            });
            emitTelemetry('PLATFORM_ACCESS_VALIDATED', { allowed, role, route: route.route }, allowed ? 'INFO' : 'WARNING');
            auditAccess(allowed ? 'PLATFORM_ACCESS_ALLOWED' : 'PLATFORM_ACCESS_DENIED', actor, { route: route.route, role });
            return result;
        } catch (err) {
            safeWarn('Platform access validation failed safely.', { error: err?.message || String(err) });
            return freezeGovernanceOutput({
                success: false,
                allowed: false,
                route: DEFAULT_ROUTE,
                role: '',
                reason: 'PLATFORM_ACCESS_VALIDATION_FAILED',
                warnings: freezeList([]),
                timestamp: nowIso()
            });
        }
    }

    function filterSensitiveTenantData(input) {
        try {
            if (Array.isArray(input)) {
                return freezeGovernanceOutput(input.map(item => filterSensitiveTenantData(item)));
            }
            if (!input || typeof input !== 'object') return input;
            const source = shallowClone(input);
            const output = {};
            Object.keys(source).forEach(key => {
                const value = source[key];
                if (isSensitiveTenantField(key)) return;
                if (Array.isArray(value)) {
                    const normalizedKey = safeString(key, '').toLowerCase();
                    if (normalizedKey === 'employees') {
                        output.employeeCount = value.length;
                        output.activeEmployeeCount = value.filter(row => /active/i.test(safeString(row?.employmentStatus || row?.status || row?.activationStatus, ''))).length;
                        return;
                    }
                    if (normalizedKey === 'users') {
                        output.userCount = value.filter(row => normalizeRole(row?.role) !== 'platform_owner').length;
                        return;
                    }
                    if (isSensitiveTenantField(normalizedKey)) return;
                    output[key + 'Count'] = value.length;
                    return;
                }
                if (value && typeof value === 'object') {
                    output[key] = filterSensitiveTenantData(value);
                    return;
                }
                output[key] = value;
            });
            return freezeGovernanceOutput(output);
        } catch (err) {
            safeWarn('Sensitive tenant filtering failed safely.', { error: err?.message || String(err) });
            return freezeGovernanceOutput({});
        }
    }

    function tenantIdOf(record, fallback) {
        return safeString(
            record?.tenantId ||
            record?.companyId ||
            record?.organizationId ||
            record?.orgId ||
            record?.tenant_id ||
            record?.company_id ||
            fallback ||
            'DEFAULT_TENANT',
            'DEFAULT_TENANT'
        );
    }

    function tenantNameOf(tenantId, data) {
        const company = data?.companySettings || data?.settings || {};
        const companyTenant = tenantIdOf(company, 'DEFAULT_TENANT');
        if (tenantId === companyTenant) return company.companyName || company.name || 'Primary Tenant';
        return tenantId;
    }

    function statusIsActive(value) {
        return /active|activated/i.test(safeString(value, ''));
    }

    function buildTenantSummaries(data) {
        const source = data || {};
        const fallbackTenant = tenantIdOf(source.companySettings || source.settings || {}, 'DEFAULT_TENANT');
        const map = {};

        function ensureTenant(tenantId) {
            const id = tenantId || fallbackTenant;
            if (!map[id]) {
                map[id] = {
                    tenantId: id,
                    tenantName: tenantNameOf(id, source),
                    companyId: id,
                    employeeCount: 0,
                    activeEmployeeCount: 0,
                    userCount: 0,
                    inviteCount: 0,
                    pendingInviteCount: 0,
                    activatedUserCount: 0,
                    onboardingProgress: 0,
                    deploymentHealth: 'UNKNOWN',
                    warnings: []
                };
            }
            return map[id];
        }

        ensureTenant(fallbackTenant);
        (source.employees || []).forEach(emp => {
            const row = ensureTenant(tenantIdOf(emp, fallbackTenant));
            row.employeeCount += 1;
            if (statusIsActive(emp.employmentStatus || emp.status || emp.activationStatus)) row.activeEmployeeCount += 1;
            if (statusIsActive(emp.activationStatus) || emp.authUserId) row.activatedUserCount += 1;
        });
        (source.users || []).forEach(user => {
            if (normalizeRole(user.role) === 'platform_owner') return;
            const row = ensureTenant(tenantIdOf(user, fallbackTenant));
            row.userCount += 1;
        });
        (source.authInvites || []).forEach(invite => {
            const row = ensureTenant(tenantIdOf(invite, fallbackTenant));
            row.inviteCount += 1;
            if (/pending|sent|invite/i.test(safeString(invite.inviteStatus || invite.status || invite.activationStatus, ''))) row.pendingInviteCount += 1;
        });

        return freezeGovernanceOutput(Object.keys(map).sort().map(id => {
            const row = map[id];
            const progressBase = row.employeeCount || row.userCount || 0;
            row.onboardingProgress = progressBase ? Math.round((row.activatedUserCount / progressBase) * 100) : 0;
            row.deploymentHealth = row.warnings.length ? 'ATTENTION' : 'READY';
            return filterSensitiveTenantData(row);
        }));
    }

    function featureRolloutSummary(data) {
        const governance = global.PlatformGovernanceService?.getGovernance?.() ||
            db()?.getPlatformGovernance?.() ||
            data?.platformGovernance ||
            {};
        const features = Object.values(governance.features || {});
        const enabled = features.filter(feature => feature.enabled !== false && feature.emergencyDisabled !== true);
        const risky = features.filter(feature => feature.experimental || feature.emergencyDisabled || feature.enabled === false);
        return freezeGovernanceOutput({
            totalFeatures: features.length,
            enabledFeatures: enabled.length,
            riskyFlags: risky.length,
            rolloutStage: governance.preset || 'STANDARD_COMPANY',
            maintenanceMode: !!governance.maintenanceMode,
            safeMode: !!governance.safeMode,
            emergencyDisabled: !!governance.emergencyDisabled
        });
    }

    function deploymentSummary(data, context) {
        const environment = db()?.getEnvironmentState?.() || data?.deploymentState || { mode: 'DEVELOPMENT' };
        let governanceReport = null;
        try {
            if (global.EnvironmentGovernanceService && typeof global.EnvironmentGovernanceService.generateDeploymentGovernanceReport === 'function') {
                governanceReport = global.EnvironmentGovernanceService.generateDeploymentGovernanceReport({
                    environment: environment.mode || context?.environment || 'DEVELOPMENT',
                    flags: context?.flags || {},
                    context: context || {}
                });
            }
        } catch (err) {
            safeWarn('Environment governance report failed safely.', { error: err?.message || String(err) });
        }
        return freezeGovernanceOutput({
            environment: environment.mode || 'DEVELOPMENT',
            isPilot: !!environment.isPilot,
            isProduction: !!environment.isProduction,
            passed: governanceReport ? governanceReport.passed !== false : true,
            failuresCount: governanceReport?.failures?.length || 0,
            warningsCount: governanceReport?.warnings?.length || 0,
            recommendationsCount: governanceReport?.recommendations?.length || 0
        });
    }

    function rlsSummary(context) {
        let report = null;
        try {
            if (global.RLSValidationService && typeof global.RLSValidationService.generateSecurityValidationReport === 'function') {
                report = global.RLSValidationService.generateSecurityValidationReport(context?.rlsEvidence || {});
            }
        } catch (err) {
            safeWarn('RLS validation summary failed safely.', { error: err?.message || String(err) });
        }
        return freezeGovernanceOutput({
            available: !!global.RLSValidationService,
            passed: report ? report.passed !== false : null,
            failuresCount: report?.failures?.length || 0,
            criticalFailures: (report?.failures || []).filter(item => item.severity === 'CRITICAL').length,
            recommendationsCount: report?.recommendations?.length || 0
        });
    }

    function sumBucket(bucket) {
        if (!bucket || typeof bucket !== 'object') return 0;
        return Object.keys(bucket).reduce((total, key) => total + (Number(bucket[key]?.count || bucket[key]) || 0), 0);
    }

    function monitoringSummary(data) {
        let metrics = null;
        try {
            if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.getMetricsSnapshot === 'function') {
                metrics = global.OrchestrationMetricsService.getMetricsSnapshot();
            }
        } catch (err) {
            safeWarn('Metrics snapshot failed safely.', { error: err?.message || String(err) });
        }

        let incidents = [];
        try {
            if (global.operationsMonitoringService && typeof global.operationsMonitoringService.getIncidents === 'function') {
                incidents = global.operationsMonitoringService.getIncidents({ status: 'Open' }) || [];
            } else {
                incidents = data?.operationIncidents || [];
            }
        } catch (err) {
            incidents = [];
        }

        return freezeGovernanceOutput({
            metricsAvailable: !!metrics,
            workflowEvents: sumBucket(metrics?.workflows),
            degradedWorkflows: sumBucket(metrics?.degraded),
            handlerFailures: sumBucket(metrics?.failures),
            escalationDensity: sumBucket(metrics?.escalations),
            notificationActivity: sumBucket(metrics?.notifications),
            auditActivity: sumBucket(metrics?.audits),
            activeIncidents: incidents.filter(item => !/resolved|closed/i.test(safeString(item.status, ''))).length,
            recentIncidents: incidents.slice(0, 5).map(item => filterSensitiveTenantData({
                incidentId: item.incidentId || item.id,
                severity: item.severity,
                status: item.status,
                module: item.module,
                createdAt: item.createdAt || item.loggedAt
            }))
        });
    }

    function normalizeGovernanceView(dataInput, context = {}) {
        try {
            const sourceData = dataInput && typeof dataInput === 'object' && !Array.isArray(dataInput)
                ? dataInput
                : (db()?.get?.() || {});
            const actor = context.actor || context.currentUser || global.authService?.getCurrentUser?.() || {};
            const access = validatePlatformAccess(actor, {
                pathname: context.pathname || DEFAULT_ROUTE,
                location: context.location
            });
            const tenants = access.allowed ? buildTenantSummaries(sourceData) : freezeList([]);
            const view = {
                success: true,
                access,
                route: DEFAULT_ROUTE,
                generatedAt: nowIso(),
                governanceSections: GOVERNANCE_SECTIONS.slice(),
                tenantRoles: TENANT_ROLES.slice(),
                tenants,
                deployment: deploymentSummary(sourceData, context),
                featureRollout: featureRolloutSummary(sourceData),
                security: rlsSummary(context),
                monitoring: monitoringSummary(sourceData),
                linkedGovernancePages: LINKED_GOVERNANCE_PAGES.map(page => shallowClone(page)),
                alerts: []
            };
            if (!access.allowed) view.alerts.push({ severity: 'CRITICAL', message: 'Platform owner access is required.' });
            if (view.security.criticalFailures) view.alerts.push({ severity: 'CRITICAL', message: 'RLS validation has critical failures.' });
            if (view.deployment.failuresCount) view.alerts.push({ severity: 'HIGH', message: 'Deployment governance has blockers.' });
            const frozen = freezeGovernanceOutput(view);
            emitTelemetry('PLATFORM_GOVERNANCE_VIEW_GENERATED', {
                allowed: access.allowed,
                tenantCount: tenants.length,
                alertCount: frozen.alerts.length
            });
            return frozen;
        } catch (err) {
            safeWarn('Governance view normalization failed safely.', { error: err?.message || String(err) });
            return freezeGovernanceOutput({
                success: false,
                access: validatePlatformAccess({}, { pathname: DEFAULT_ROUTE }),
                route: DEFAULT_ROUTE,
                generatedAt: nowIso(),
                governanceSections: GOVERNANCE_SECTIONS.slice(),
                tenantRoles: TENANT_ROLES.slice(),
                tenants: [],
                deployment: {},
                featureRollout: {},
                security: {},
                monitoring: {},
                linkedGovernancePages: LINKED_GOVERNANCE_PAGES.map(page => shallowClone(page)),
                alerts: [{ severity: 'HIGH', message: 'Governance view failed safely.' }]
            });
        }
    }

    function runSelfTest() {
        const originalMetrics = global.OrchestrationMetricsService;
        const sample = {
            tenantId: 'T1',
            salary: 1,
            leaveBalance: 2,
            employees: [{ id: 'E1', salary: 3 }]
        };
        const filtered = filterSensitiveTenantData(sample);
        const allowed = validatePlatformAccess({ role: 'platform_owner' }, { pathname: DEFAULT_ROUTE });
        const denied = validatePlatformAccess({ role: 'super_admin' }, { pathname: DEFAULT_ROUTE });
        const view = normalizeGovernanceView({ employees: [], users: [] }, { actor: { role: 'platform_owner' }, pathname: DEFAULT_ROUTE });
        delete global.OrchestrationMetricsService;
        const degraded = normalizeGovernanceView({ employees: [], users: [] }, { actor: { role: 'platform_owner' }, pathname: DEFAULT_ROUTE });
        global.OrchestrationMetricsService = originalMetrics;
        const checks = [
            filtered.salary === undefined,
            filtered.employeeCount === 1,
            allowed.allowed === true,
            denied.allowed === false,
            validateGovernanceRoute(DEFAULT_ROUTE).valid === true,
            validateGovernanceRoute('ArthHRMS.html').valid === false,
            view.tenantRoles.indexOf('platform_owner') === -1,
            degraded.monitoring.metricsAvailable === false,
            Object.isFrozen(view),
            Object.isFrozen(view.tenants)
        ];
        if (!checks.every(Boolean)) safeWarn('Development self-test warnings detected.', checks);
        return checks.every(Boolean);
    }

    const api = Object.freeze({
        GOVERNANCE_SECTIONS,
        LINKED_GOVERNANCE_PAGES,
        TENANT_ROLES,
        validatePlatformAccess,
        validateGovernanceRoute,
        normalizeGovernanceView,
        filterSensitiveTenantData,
        freezeGovernanceOutput,
        runSelfTest
    });

    global.PlatformAccessService = api;
    global.platformAccessService = api;

    if (global.__ARTHHRMS_DEV__) {
        try { runSelfTest(); } catch (err) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
