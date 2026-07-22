/**
 * tenantIsolationService.js
 * ARTHHRMS - Multi-Tenant Isolation Verification System
 *
 * PURPOSE:
 * Provides centralized enterprise multi-tenant security validation for
 * tenant boundaries, role visibility, onboarding isolation, workflow
 * isolation, and strategic governance isolation.
 *
 * This service validates isolation posture ONLY.
 * It does NOT bypass RLS.
 * It does NOT expose tenant data.
 * It does NOT mutate production data.
 *
 * ARCHITECTURE RULE:
 * Tenant isolation verification must remain read-only and independent
 * from tenant runtime workflows.
 *
 * STABILITY:
 * Existing tenant, employee, company, and workflow records remain compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.TenantProvisioningService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachTenantIsolationService(global) {
    'use strict';

    var PREFIX = '[TenantIsolationService]';
    var DEFAULT_SOURCE = 'tenantIsolationService';
    var DEFAULT_BASE_DOMAIN = 'arthhrms.com';
    var MAX_FINDINGS = 250;

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH: 'HIGH',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var TENANT_ROLES = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'HR',
        'HR_HEAD',
        'DIRECTOR',
        'SUPER_ADMIN'
    ]);

    var PLATFORM_ROLES = Object.freeze([
        'PLATFORM_OWNER'
    ]);

    var VALIDATION_TYPES = Object.freeze({
        TENANT_BOUNDARY: 'TENANT_BOUNDARY',
        ROLE_VISIBILITY: 'ROLE_VISIBILITY',
        TENANT_ROUTING: 'TENANT_ROUTING',
        WORKFLOW_ISOLATION: 'WORKFLOW_ISOLATION',
        ONBOARDING_ISOLATION: 'ONBOARDING_ISOLATION',
        STRATEGIC_GOVERNANCE_ISOLATION: 'STRATEGIC_GOVERNANCE_ISOLATION'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|payslip|compensation|ctc|leave[_-]?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|service[_-]?role|private[_-]?key)/i;

    var RECORD_GROUPS = Object.freeze({
        employeeRecords: Object.freeze(['employees', 'users']),
        workflowRecords: Object.freeze(['workflowEvents', 'pendingActions', 'escalations', 'auditLogs', 'deliverableReviews']),
        onboardingRecords: Object.freeze(['authInvites', 'inviteRecords', 'onboardingStates', 'employeeImports', 'importStagingRows', 'activationFlows']),
        strategicRecords: Object.freeze(['strategicDeliverables', 'deliverableReviews', 'strategicReviews', 'strategicIntelligence', 'strategicRisks'])
    });

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function db() {
        try {
            return global.DB || null;
        } catch (error) {
            return null;
        }
    }

    function rawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get();
        } catch (error) {}
        return {};
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 4) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, 100).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneValue(value[key], currentDepth + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function freezeIsolationOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return deepFreeze(list.slice(0, MAX_FINDINGS).map(function freezeItem(item) {
            return isPlainObject(item) ? cloneValue(item, 0) : item;
        }));
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, 0) : {};
    }

    function safeSeverity(value, fallback) {
        var normalized = safeString(value || fallback || SEVERITIES.HIGH, SEVERITIES.HIGH)
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        if (normalized === 'CRITICAL' || normalized === 'BLOCKER') return SEVERITIES.CRITICAL_BLOCKER;
        if (normalized === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
        if (normalized === SEVERITIES.HIGH || normalized === 'ERROR') return SEVERITIES.HIGH;
        if (normalized === SEVERITIES.WARNING || normalized === 'WARN') return SEVERITIES.WARNING;
        if (normalized === SEVERITIES.INFO) return SEVERITIES.INFO;
        return fallback || SEVERITIES.HIGH;
    }

    function normalizeRole(role) {
        var normalized = safeString(role, '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'SUPERADMIN') normalized = 'SUPER_ADMIN';
        if (normalized === 'HRHEAD') normalized = 'HR_HEAD';
        if (normalized === 'PLATFORMOWNER' || normalized === 'OWNER' || normalized === 'ROOT') normalized = 'PLATFORM_OWNER';
        if (normalized === 'EMP') normalized = 'EMPLOYEE';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        try {
            if (global.TenantProvisioningService && typeof global.TenantProvisioningService.normalizeTenantSlug === 'function') {
                return global.TenantProvisioningService.normalizeTenantSlug(value);
            }
        } catch (error) {}
        var slug = safeString(value, '').trim().toLowerCase();
        slug = slug.replace(/^ten[-_]/, '');
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-');
        slug = slug.replace(/-+/g, '-');
        slug = slug.replace(/^-|-$/g, '');
        return slug;
    }

    function normalizeTenantToken(value) {
        return safeString(value, '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    }

    function tenantSlugFromId(value) {
        var token = normalizeTenantToken(value);
        if (!token) return '';
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function extractTenantFromHostname(hostname, baseDomain) {
        try {
            if (global.TenantProvisioningService && typeof global.TenantProvisioningService.extractTenantFromHostname === 'function') {
                var extracted = global.TenantProvisioningService.extractTenantFromHostname(hostname, baseDomain);
                return {
                    matched: extracted && extracted.matched === true,
                    tenantSlug: normalizeTenantSlug(extracted && extracted.tenantSlug),
                    hostname: safeString(extracted && extracted.hostname, ''),
                    warning: safeString(extracted && extracted.warning, '')
                };
            }
        } catch (error) {}

        var host = safeString(hostname || (global.location && global.location.hostname) || '', '')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '')
            .split(':')[0];
        var domain = safeString(baseDomain || DEFAULT_BASE_DOMAIN, DEFAULT_BASE_DOMAIN).trim().toLowerCase();
        var tenantSlug = '';
        if (host && host.endsWith('.' + domain)) {
            tenantSlug = normalizeTenantSlug(host.slice(0, -1 * (domain.length + 1)).split('.').pop());
        }
        return {
            matched: !!tenantSlug,
            tenantSlug: tenantSlug,
            hostname: host,
            warning: tenantSlug ? '' : 'Hostname does not resolve to a tenant subdomain.'
        };
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'TENANT_ISOLATION_FAILURE'),
            severity: safeSeverity(severity, SEVERITIES.HIGH),
            message: safeString(message, 'Tenant isolation validation failure.'),
            metadata: freezeIsolationOutput(safeMetadata(metadata || {}))
        });
    }

    function safeWarning(code, message, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'TENANT_ISOLATION_WARNING'),
            severity: SEVERITIES.WARNING,
            message: safeString(message, 'Tenant isolation validation warning.'),
            metadata: freezeIsolationOutput(safeMetadata(metadata || {}))
        });
    }

    function safeRecommendation(code, message, metadata) {
        return Object.freeze({
            recommendationCode: safeString(code, 'TENANT_ISOLATION_RECOMMENDATION'),
            message: safeString(message, 'Review multi-tenant isolation evidence before production activation.'),
            metadata: freezeIsolationOutput(safeMetadata(metadata || {}))
        });
    }

    function recordId(record) {
        return safeString(
            record && (record.id || record.empId || record.employeeId || record.userId || record.inviteId || record.eventId || record.actionId || record.auditId || record.deliverableId || record.reviewId || record.ticketId || record.importId),
            ''
        );
    }

    function tenantInfo(record) {
        var source = isPlainObject(record) ? record : {};
        var metadata = isPlainObject(source.metadata) ? source.metadata : {};
        var tenantSlug = normalizeTenantSlug(
            source.tenantSlug ||
            source.tenant_slug ||
            source.slug ||
            source.companySlug ||
            source.company_slug ||
            source.routeTenant ||
            metadata.tenantSlug ||
            metadata.tenant_slug ||
            ''
        );
        var tenantId = normalizeTenantToken(
            source.tenantId ||
            source.tenant_id ||
            source.companyId ||
            source.company_id ||
            source.organizationId ||
            source.organization_id ||
            source.orgId ||
            source.org_id ||
            metadata.tenantId ||
            metadata.tenant_id ||
            metadata.companyId ||
            metadata.company_id ||
            ''
        );
        if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
        return {
            tenantSlug: tenantSlug,
            tenantId: tenantId,
            rawTenant: tenantSlug || tenantId
        };
    }

    function normalizeTenantScope(input) {
        try {
            var source = isPlainObject(input) ? input : { tenantSlug: input };
            var hostname = safeString(source.hostname || source.host || (global.location && global.location.hostname) || '', '');
            var routeTenant = extractTenantFromHostname(hostname, source.baseDomain);
            var tenantSlug = normalizeTenantSlug(
                source.tenantSlug ||
                source.tenant_slug ||
                source.slug ||
                source.expectedTenantSlug ||
                source.expected_tenant_slug ||
                source.companySlug ||
                source.company_slug ||
                routeTenant.tenantSlug ||
                ''
            );
            var tenantId = normalizeTenantToken(
                source.tenantId ||
                source.tenant_id ||
                source.companyId ||
                source.company_id ||
                source.organizationId ||
                source.organization_id ||
                source.orgId ||
                source.org_id ||
                ''
            );
            if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
            return freezeIsolationOutput({
                tenantSlug: tenantSlug,
                tenantId: tenantId,
                companyId: normalizeTenantToken(source.companyId || source.company_id || ''),
                hostname: routeTenant.hostname || hostname,
                routeTenantSlug: routeTenant.tenantSlug,
                routeMatched: routeTenant.matched === true,
                source: safeString(source.source || DEFAULT_SOURCE, DEFAULT_SOURCE)
            });
        } catch (error) {
            return freezeIsolationOutput({
                tenantSlug: '',
                tenantId: '',
                companyId: '',
                hostname: '',
                routeTenantSlug: '',
                routeMatched: false,
                source: DEFAULT_SOURCE
            });
        }
    }

    function hasComparableTenant(scope, recordTenant) {
        return !!(
            (scope.tenantSlug && recordTenant.tenantSlug) ||
            (scope.tenantId && recordTenant.tenantId) ||
            (scope.tenantSlug && recordTenant.tenantId) ||
            (scope.tenantId && recordTenant.tenantSlug)
        );
    }

    function tenantsMatch(scope, recordTenant) {
        if (!hasComparableTenant(scope, recordTenant)) return true;
        if (scope.tenantSlug && recordTenant.tenantSlug && scope.tenantSlug === recordTenant.tenantSlug) return true;
        if (scope.tenantId && recordTenant.tenantId && scope.tenantId === recordTenant.tenantId) return true;
        if (scope.tenantSlug && recordTenant.tenantId && scope.tenantSlug === tenantSlugFromId(recordTenant.tenantId)) return true;
        if (scope.tenantId && recordTenant.tenantSlug && tenantSlugFromId(scope.tenantId) === recordTenant.tenantSlug) return true;
        return false;
    }

    function validationResult(validationType, passed, failures, warnings, recommendations, metadata) {
        var failureList = freezeList(failures || []);
        var warningList = freezeList(warnings || []);
        var recommendationList = freezeList(recommendations || []);
        var critical = failureList.filter(function isCritical(item) {
            return item && item.severity === SEVERITIES.CRITICAL_BLOCKER;
        }).length;
        return freezeIsolationOutput({
            success: true,
            validationType: safeString(validationType, 'TENANT_ISOLATION'),
            passed: !!passed && failureList.length === 0,
            severity: critical ? SEVERITIES.CRITICAL_BLOCKER : failureList.length ? SEVERITIES.HIGH : warningList.length ? SEVERITIES.WARNING : SEVERITIES.INFO,
            failures: failureList,
            warnings: warningList,
            recommendations: recommendationList,
            metadata: safeMetadata(metadata || {}),
            timestamp: nowIso()
        });
    }

    function validateTenantBoundary(recordInput, contextInput) {
        try {
            var record = isPlainObject(recordInput) ? recordInput : {};
            var scope = normalizeTenantScope(contextInput || {});
            var recordTenant = tenantInfo(record);
            var failures = [];
            var warnings = [];
            var recommendations = [];
            var role = normalizeRole(record.role || record.userRole || record.actorRole || record.portalRole || (record.metadata && record.metadata.role));
            var sourceType = safeString(record.sourceType || record.source || record.module || contextInput && contextInput.sourceType || 'tenant_record', 'tenant_record');

            if (PLATFORM_ROLES.indexOf(role) !== -1) {
                failures.push(safeFailure(
                    'PLATFORM_OWNER_TENANT_HIERARCHY_VIOLATION',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'PLATFORM_OWNER must remain isolated from tenant hierarchy.',
                    { sourceType: sourceType, recordId: recordId(record) }
                ));
            } else if (role && TENANT_ROLES.indexOf(role) === -1 && /owner|platform|root/i.test(role)) {
                failures.push(safeFailure(
                    'UNKNOWN_PLATFORM_ROLE_TENANT_VISIBILITY',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Platform governance role was detected in tenant-scoped data.',
                    { sourceType: sourceType, recordId: recordId(record), role: role }
                ));
            }

            if (!scope.tenantSlug && !scope.tenantId) {
                warnings.push(safeWarning(
                    'TENANT_SCOPE_MISSING',
                    'Tenant scope was not supplied for boundary validation.',
                    { sourceType: sourceType, recordId: recordId(record) }
                ));
            } else if (!recordTenant.rawTenant) {
                warnings.push(safeWarning(
                    'RECORD_TENANT_SCOPE_MISSING',
                    'Tenant-scoped record does not include tenant metadata.',
                    { sourceType: sourceType, recordId: recordId(record) }
                ));
            } else if (!tenantsMatch(scope, recordTenant)) {
                failures.push(safeFailure(
                    'CROSS_TENANT_BOUNDARY_VIOLATION',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Record belongs to a different tenant than the active tenant scope.',
                    {
                        sourceType: sourceType,
                        recordId: recordId(record),
                        expectedTenantSlug: scope.tenantSlug,
                        expectedTenantId: scope.tenantId,
                        recordTenantSlug: recordTenant.tenantSlug,
                        recordTenantId: recordTenant.tenantId
                    }
                ));
                recommendations.push(safeRecommendation(
                    'BLOCK_CROSS_TENANT_VISIBILITY',
                    'Block this record from tenant-visible views and verify matching RLS policies.',
                    { sourceType: sourceType }
                ));
            }

            return validationResult(VALIDATION_TYPES.TENANT_BOUNDARY, failures.length === 0, failures, warnings, recommendations, {
                sourceType: sourceType,
                recordId: recordId(record),
                tenantSlug: scope.tenantSlug,
                checked: true
            });
        } catch (error) {
            return validationResult(VALIDATION_TYPES.TENANT_BOUNDARY, false, [
                safeFailure('TENANT_BOUNDARY_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH, 'Tenant boundary validation failed safely.')
            ], [], [
                safeRecommendation('RETRY_TENANT_BOUNDARY_VALIDATION', 'Retry tenant boundary validation with a normalized tenant scope.')
            ], {});
        }
    }

    function getArray(source, key) {
        if (source && Array.isArray(source[key])) return source[key].slice();
        return [];
    }

    function collectRecords(recordsInput, keys) {
        var source = isPlainObject(recordsInput) ? recordsInput : {};
        var records = [];
        keys.forEach(function collectKey(key) {
            getArray(source, key).forEach(function addRecord(record) {
                records.push({
                    collection: key,
                    record: record
                });
            });
        });
        return records;
    }

    function detectCrossTenantLeakage(recordsInput, contextInput, options) {
        try {
            var source = Array.isArray(recordsInput) ? recordsInput : [];
            var validationType = options && options.validationType || VALIDATION_TYPES.TENANT_BOUNDARY;
            var sourceType = options && options.sourceType || 'tenant_record';
            var failures = [];
            var warnings = [];
            var recommendations = [];

            source.forEach(function validateRecord(item, index) {
                var record = isPlainObject(item) && item.record ? item.record : item;
                var collection = isPlainObject(item) && item.collection ? item.collection : sourceType;
                var result = validateTenantBoundary(record, Object.assign({}, contextInput || {}, {
                    sourceType: collection
                }));
                (result.failures || []).forEach(function addFailure(failure) {
                    failures.push(failure);
                });
                (result.warnings || []).forEach(function addWarning(warning) {
                    warnings.push(warning);
                });
                if (result.failures && result.failures.length) {
                    recommendations.push(safeRecommendation(
                        'ISOLATE_' + safeString(collection, 'TENANT_RECORD').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase(),
                        'Ensure ' + collection + ' queries are scoped by the active tenant before rendering.',
                        { collection: collection, index: index }
                    ));
                }
            });

            return validationResult(validationType, failures.length === 0, failures, warnings, recommendations, {
                recordCount: source.length,
                sourceType: sourceType
            });
        } catch (error) {
            return validationResult(options && options.validationType || VALIDATION_TYPES.TENANT_BOUNDARY, false, [
                safeFailure('CROSS_TENANT_LEAKAGE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH, 'Cross-tenant leakage validation failed safely.')
            ], [], [], {});
        }
    }

    function validateRoleVisibility(recordsInput, contextInput) {
        var records = collectRecords(recordsInput, RECORD_GROUPS.employeeRecords);
        var result = detectCrossTenantLeakage(records, contextInput, {
            validationType: VALIDATION_TYPES.ROLE_VISIBILITY,
            sourceType: 'role_visibility'
        });
        return result;
    }

    function validateWorkflowIsolation(recordsInput, contextInput) {
        var records = collectRecords(recordsInput, RECORD_GROUPS.workflowRecords);
        return detectCrossTenantLeakage(records, contextInput, {
            validationType: VALIDATION_TYPES.WORKFLOW_ISOLATION,
            sourceType: 'workflow_isolation'
        });
    }

    function validateOnboardingIsolation(recordsInput, contextInput) {
        var records = collectRecords(recordsInput, RECORD_GROUPS.onboardingRecords);
        return detectCrossTenantLeakage(records, contextInput, {
            validationType: VALIDATION_TYPES.ONBOARDING_ISOLATION,
            sourceType: 'onboarding_isolation'
        });
    }

    function validateStrategicGovernanceIsolation(recordsInput, contextInput) {
        var records = collectRecords(recordsInput, RECORD_GROUPS.strategicRecords);
        return detectCrossTenantLeakage(records, contextInput, {
            validationType: VALIDATION_TYPES.STRATEGIC_GOVERNANCE_ISOLATION,
            sourceType: 'strategic_governance'
        });
    }

    function validateTenantRouting(hostnameInput, expectedTenantInput) {
        try {
            var expectedScope = normalizeTenantScope(expectedTenantInput || {});
            var extracted = extractTenantFromHostname(hostnameInput || expectedScope.hostname, expectedTenantInput && expectedTenantInput.baseDomain);
            var failures = [];
            var warnings = [];
            var recommendations = [];

            if (!extracted.matched) {
                warnings.push(safeWarning(
                    'TENANT_ROUTE_NOT_DETECTED',
                    'Hostname did not resolve to a tenant subdomain.',
                    { hostname: extracted.hostname || safeString(hostnameInput, '') }
                ));
            }

            if (extracted.tenantSlug && expectedScope.tenantSlug && extracted.tenantSlug !== expectedScope.tenantSlug) {
                failures.push(safeFailure(
                    'TENANT_ROUTING_MISMATCH',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Subdomain tenant does not match the expected tenant scope.',
                    {
                        hostname: extracted.hostname || safeString(hostnameInput, ''),
                        routeTenantSlug: extracted.tenantSlug,
                        expectedTenantSlug: expectedScope.tenantSlug
                    }
                ));
                recommendations.push(safeRecommendation(
                    'BLOCK_ROUTING_MISMATCH',
                    'Block tenant data rendering when the hostname and active tenant scope disagree.'
                ));
            }

            if (extracted.tenantSlug && /^(admin|platform|api|root|owner|system|support|auth)$/.test(extracted.tenantSlug)) {
                failures.push(safeFailure(
                    'RESERVED_TENANT_ROUTE',
                    SEVERITIES.HIGH,
                    'Reserved platform route cannot be used as a tenant subdomain.',
                    { routeTenantSlug: extracted.tenantSlug }
                ));
            }

            return validationResult(VALIDATION_TYPES.TENANT_ROUTING, failures.length === 0, failures, warnings, recommendations, {
                hostname: extracted.hostname || safeString(hostnameInput, ''),
                routeTenantSlug: extracted.tenantSlug,
                expectedTenantSlug: expectedScope.tenantSlug,
                matched: extracted.matched === true
            });
        } catch (error) {
            return validationResult(VALIDATION_TYPES.TENANT_ROUTING, false, [
                safeFailure('TENANT_ROUTING_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH, 'Tenant routing validation failed safely.')
            ], [], [], {});
        }
    }

    function mergeFindings(target, result) {
        (result.failures || []).forEach(function addFailure(item) { target.failures.push(item); });
        (result.warnings || []).forEach(function addWarning(item) { target.warnings.push(item); });
        (result.recommendations || []).forEach(function addRecommendation(item) { target.recommendations.push(item); });
        target.sections.push(result);
    }

    function scoreForFindings(failures, warnings) {
        var critical = failures.filter(function isCritical(item) {
            return item && item.severity === SEVERITIES.CRITICAL_BLOCKER;
        }).length;
        if (critical) return Math.max(0, 100 - critical * 35 - (failures.length - critical) * 12 - warnings.length * 3);
        return Math.max(0, 100 - failures.length * 12 - warnings.length * 3);
    }

    function emitTelemetry(eventType, metadata, severity) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                source: DEFAULT_SOURCE,
                severity: severity || 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata || {})
            });
            return true;
        } catch (error) {
            safeWarn('Tenant isolation telemetry failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function auditIsolation(eventType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence === true) return false;
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                eventType: eventType,
                actionType: eventType,
                module: 'Tenant Isolation',
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.criticalFailures ? 'CRITICAL' : 'INFO',
                actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                actorRole: context && context.actor && context.actor.role || 'platform_owner',
                metadata: safeMetadata(metadata || {})
            }, {
                source: DEFAULT_SOURCE
            });
            return true;
        } catch (error) {
            safeWarn('Tenant isolation audit failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function recordMetric(eventType, metadata) {
        try {
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: DEFAULT_SOURCE }, safeMetadata(metadata || {})));
            return true;
        } catch (error) {
            safeWarn('Tenant isolation metrics failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function reportInput(input) {
        if (!isPlainObject(input)) return {};
        return input;
    }

    function recordsFromInput(input) {
        var source = reportInput(input);
        if (isPlainObject(source.records)) return source.records;
        return isPlainObject(source.data) ? source.data : source;
    }

    function generateTenantIsolationReport(input, context) {
        try {
            var malformedInput = !isPlainObject(input);
            var supplied = reportInput(input);
            var records = recordsFromInput(supplied);
            var dataSource = isPlainObject(records) && Object.keys(records).length ? records : rawData();
            var scope = normalizeTenantScope(Object.assign({}, context || {}, supplied));
            var aggregate = {
                failures: [],
                warnings: [],
                recommendations: [
                    safeRecommendation('KEEP_RLS_TENANT_SCOPED', 'Keep Supabase RLS policies scoped by tenant identifier for every tenant-owned table.'),
                    safeRecommendation('RENDER_METADATA_ONLY_PLATFORM_VIEW', 'Platform governance views should render tenant metadata only and omit sensitive HR fields.')
                ],
                sections: []
            };

            mergeFindings(aggregate, validateTenantRouting(scope.hostname || supplied.hostname || (global.location && global.location.hostname) || '', scope));
            mergeFindings(aggregate, validateRoleVisibility(dataSource, scope));
            mergeFindings(aggregate, validateWorkflowIsolation(dataSource, scope));
            mergeFindings(aggregate, validateOnboardingIsolation(dataSource, scope));
            mergeFindings(aggregate, validateStrategicGovernanceIsolation(dataSource, scope));

            if (!scope.tenantSlug && !scope.tenantId) {
                aggregate.failures.push(safeFailure(
                    'TENANT_SCOPE_REQUIRED_FOR_ISOLATION_REPORT',
                    SEVERITIES.HIGH,
                    'Tenant isolation report requires a tenant scope.',
                    {}
                ));
            }

            if (malformedInput) {
                aggregate.failures.push(safeFailure(
                    'MALFORMED_TENANT_ISOLATION_PAYLOAD',
                    SEVERITIES.HIGH,
                    'Tenant isolation evidence must be supplied as a structured object.',
                    {}
                ));
            }

            var criticalFailures = aggregate.failures.filter(function isCritical(item) {
                return item && item.severity === SEVERITIES.CRITICAL_BLOCKER;
            }).length;
            var score = scoreForFindings(aggregate.failures, aggregate.warnings);
            var passed = aggregate.failures.length === 0;
            var riskLevel = criticalFailures ? SEVERITIES.CRITICAL_BLOCKER : aggregate.failures.length ? SEVERITIES.HIGH : aggregate.warnings.length ? SEVERITIES.WARNING : SEVERITIES.INFO;
            var result = freezeIsolationOutput({
                success: true,
                validationType: 'MULTI_TENANT_ISOLATION',
                passed: passed,
                tenantSlug: scope.tenantSlug,
                tenantId: scope.tenantId,
                riskLevel: riskLevel,
                score: score,
                failures: freezeList(aggregate.failures),
                warnings: freezeList(aggregate.warnings),
                recommendations: freezeList(aggregate.recommendations),
                sections: freezeList(aggregate.sections),
                metadata: {
                    crossTenantVisibilityBlocked: criticalFailures === 0,
                    tenantIsolationPreserved: passed,
                    rlsBypassed: false,
                    productionDataMutated: false,
                    sensitiveTenantDataExposed: false,
                    criticalFailures: criticalFailures,
                    failureCount: aggregate.failures.length,
                    warningCount: aggregate.warnings.length
                },
                timestamp: nowIso()
            });

            if (!context || context.skipTelemetry !== true) {
                emitTelemetry('TENANT_ISOLATION_VALIDATED', {
                    tenantSlug: result.tenantSlug,
                    passed: result.passed,
                    criticalFailures: criticalFailures,
                    failureCount: result.failures.length
                }, criticalFailures ? 'CRITICAL' : result.failures.length ? 'WARNING' : 'INFO');
            }
            auditIsolation(criticalFailures ? 'TENANT_ISOLATION_FAILURE' : 'TENANT_ISOLATION_VALIDATED', {
                tenantSlug: result.tenantSlug,
                passed: result.passed,
                criticalFailures: criticalFailures,
                failureCount: result.failures.length
            }, context || {});
            if (!context || context.skipMetrics !== true) {
                recordMetric('TENANT_ISOLATION_VALIDATED', {
                    tenantSlug: result.tenantSlug,
                    status: result.passed ? 'PASSED' : 'BLOCKED',
                    severity: criticalFailures ? 'CRITICAL' : result.failures.length ? 'ERROR' : 'INFO'
                });
            }
            return result;
        } catch (error) {
            return freezeIsolationOutput({
                success: false,
                validationType: 'MULTI_TENANT_ISOLATION',
                passed: false,
                tenantSlug: '',
                tenantId: '',
                riskLevel: SEVERITIES.HIGH,
                score: 0,
                failures: [safeFailure('TENANT_ISOLATION_REPORT_FAILED_SAFE', SEVERITIES.HIGH, 'Tenant isolation report failed safely.')],
                warnings: [],
                recommendations: [safeRecommendation('RETRY_TENANT_ISOLATION_REPORT', 'Retry tenant isolation validation with sanitized tenant evidence.')],
                sections: [],
                metadata: {
                    rlsBypassed: false,
                    productionDataMutated: false,
                    sensitiveTenantDataExposed: false
                },
                timestamp: nowIso()
            });
        }
    }

    var TenantIsolationService = Object.freeze({
        SEVERITIES: SEVERITIES,
        TENANT_ROLES: TENANT_ROLES,
        PLATFORM_ROLES: PLATFORM_ROLES,
        VALIDATION_TYPES: VALIDATION_TYPES,
        normalizeTenantScope: normalizeTenantScope,
        validateTenantBoundary: validateTenantBoundary,
        detectCrossTenantLeakage: detectCrossTenantLeakage,
        validateTenantRouting: validateTenantRouting,
        validateRoleVisibility: validateRoleVisibility,
        validateWorkflowIsolation: validateWorkflowIsolation,
        validateOnboardingIsolation: validateOnboardingIsolation,
        validateStrategicGovernanceIsolation: validateStrategicGovernanceIsolation,
        generateTenantIsolationReport: generateTenantIsolationReport,
        freezeIsolationOutput: freezeIsolationOutput
    });

    if (!db()) {
        safeWarn('Optional DB dependency not detected. Tenant isolation validation will use supplied evidence only.');
    }

    global.TenantIsolationService = TenantIsolationService;
    global.tenantIsolationService = TenantIsolationService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }

            try {
                var routing = validateTenantRouting('tabsons.arthhrms.com', { tenantSlug: 'abc' });
                record('tenant routing mismatch blocked', routing.passed === false && routing.failures.some(function hasMismatch(item) {
                    return item.failureCode === 'TENANT_ROUTING_MISMATCH';
                }), routing);

                var boundary = validateTenantBoundary({ id: 'X', tenantSlug: 'abc' }, { tenantSlug: 'tabsons' });
                record('cross-tenant visibility blocked', boundary.passed === false && boundary.failures.some(function hasCrossTenant(item) {
                    return item.failureCode === 'CROSS_TENANT_BOUNDARY_VIOLATION';
                }), boundary);

                var workflow = validateWorkflowIsolation({ workflowEvents: [{ eventId: 'WF1', tenantSlug: 'abc' }] }, { tenantSlug: 'tabsons' });
                record('workflow isolation works', workflow.passed === false, workflow);

                var onboarding = validateOnboardingIsolation({ authInvites: [{ inviteId: 'INV1', tenantSlug: 'abc' }] }, { tenantSlug: 'tabsons' });
                record('onboarding isolation works', onboarding.passed === false, onboarding);

                var immutable = generateTenantIsolationReport({ tenantSlug: 'tabsons', records: { employees: [] } }, { skipAuditPersistence: true });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.failures), immutable);

                var malformed = generateTenantIsolationReport('bad-payload', { skipAuditPersistence: true });
                record('malformed payloads handled safely', malformed.passed === false && malformed.failures.length > 0, malformed);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            }

            try {
                global.__ARTHHRMS_TENANT_ISOLATION_SELF_TEST__ = Object.freeze({
                    passed: checks.every(function allPassed(item) { return item.passed; }),
                    tests: Object.freeze(checks.slice())
                });
            } catch (error) {
                safeWarn('Self-test result storage failed safely.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
