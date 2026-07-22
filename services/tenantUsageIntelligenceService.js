/**
 * tenantUsageIntelligenceService.js
 * ARTHHRMS Enterprise Tenant Usage Intelligence + Consumption Analytics.
 *
 * Additive, read-only platform-control service for aggregate tenant activity,
 * consumption, feature engagement, storage usage, and operational utilization.
 * It never exposes salaries, leave balances, payroll internals, raw employee
 * records, raw documents, or tenant-private payloads.
 */
(function attachTenantUsageIntelligenceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[TenantUsageIntelligenceService]';

    var USAGE_STATES = Object.freeze([
        'ACTIVE',
        'LOW_ACTIVITY',
        'HIGH_CONSUMPTION',
        'DEGRADED',
        'SPIKE_DETECTED',
        'RESTRICTED',
        'ARCHIVED'
    ]);

    var USAGE_TYPES = Object.freeze([
        'TENANT_ACTIVITY',
        'WORKFLOW_CONSUMPTION',
        'STORAGE_UTILIZATION',
        'ONBOARDING_ENGAGEMENT',
        'FEATURE_ENGAGEMENT',
        'OPERATIONAL_DENSITY',
        'NOTIFICATION_THROUGHPUT',
        'EXECUTION_UTILIZATION'
    ]);

    var CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ISOLATED_TENANT_USAGE_INTELLIGENCE: 'ISOLATED_TENANT_USAGE_INTELLIGENCE',
        INFRASTRUCTURE_USAGE_MONITORING_ONLY: 'INFRASTRUCTURE_USAGE_MONITORING_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|message|note|comment|email|phone|name|confidential|private)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_USAGE_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        classification: true,
        visibility: true,
        state: true,
        states: true,
        usageState: true,
        usageType: true,
        usageTypes: true,
        usageId: true,
        tenantId: true,
        tenantSlug: true,
        targetTenantId: true,
        targetTenantSlug: true,
        generatedAt: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        signals: true,
        summary: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        description: true,
        healthSignals: true,
        tenantUsageModel: true,
        tenantUsageOverview: true,
        consumptionAnalytics: true,
        featureEngagement: true,
        storageIntegration: true,
        tenantIntelligence: true,
        accessGovernance: true,
        integrationHealth: true,
        usageSummaries: true,
        governanceDashboard: true,
        activeTenants: true,
        totalTenants: true,
        usageRecords: true,
        activeUsageRecords: true,
        highConsumptionTenants: true,
        lowActivityTenants: true,
        activitySpikes: true,
        usageAnomalies: true,
        workflowEvents: true,
        workflowConsumption: true,
        workflowCongestion: true,
        storageGrowthBytes: true,
        storageGrowth: true,
        storageAnomalies: true,
        featureEvents: true,
        activeFeatures: true,
        degradedFeatures: true,
        featureAdoptionRate: true,
        featureAbandonment: true,
        onboardingCompletions: true,
        onboardingCompletionRate: true,
        notificationThroughput: true,
        notificationFailures: true,
        operationalDensity: true,
        executionUtilization: true,
        executionSlowdown: true,
        quotaUtilization: true,
        signedUrlUsage: true,
        retentionGrowth: true,
        rawDocumentExposure: true,
        tenantActivityTrends: true,
        activitySpikeDetection: true,
        usageAnomalyHandling: true,
        inactiveTenantDetection: true,
        operationalActivityDensity: true,
        organizationUtilizationScore: true,
        tenantGrowthTrends: true,
        crossTenantConfidentialLeakageBlocked: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        payrollVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        superAdminHrPayrollVisibility: true,
        superAdminInfrastructureOnly: true,
        platformOwnerTenantRbacIsolation: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        tenantAnalyticsConfidentialityPreserved: true,
        tenantUsageActionsAuditable: true,
        usageActionsAuditable: true,
        historicalUsageRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        usageAnalyticsAuthority: true,
        platformAnalyticsIntegrated: true,
        tenantGovernanceIntegrated: true,
        featureRolloutIntegrated: true,
        storageAnalyticsIntegrated: true,
        workflowTelemetryIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        anomalyDetectionReady: true
    });

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                global.console.warn(PREFIX, message, details || '');
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') source.save(data);
        } catch (error) {}
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '')
            .trim()
            .toLowerCase()
            .replace(/^tenant[-_]/, '')
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9_-]/g, '')
            .replace(/_+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.targetTenantSlug || row.targetTenantId));
    }

    function targetTenant(record, context) {
        return normalizeTenantSlug(record && (record.targetTenantSlug || record.targetTenantId || record.tenantSlug || record.tenantId || record.companyId)) || contextTenant(context);
    }

    function sameTenant(left, right) {
        var a = normalizeTenantSlug(left);
        var b = normalizeTenantSlug(right);
        return !!a && !!b && a === b;
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key], refs); });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function sanitizedValue(value, key, seen) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
            return value.map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) {
            return input.map(function item(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_USAGE_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeUsageOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'TENANT_USAGE_FAILURE'),
            classification: classification || CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Tenant usage intelligence failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'TENANT_USAGE_WARNING'),
            classification: CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Tenant usage intelligence warning.', '')
        };
        if (metadata && typeof metadata === 'object') warning.metadata = cloneSanitized(metadata);
        return deepFreeze(warning);
    }

    function highestClassification(values) {
        var order = {};
        order[CLASSIFICATIONS.INFO] = 0;
        order[CLASSIFICATIONS.WARNING] = 1;
        order[CLASSIFICATIONS.HIGH_RISK] = 2;
        order[CLASSIFICATIONS.CRITICAL_BLOCKER] = 3;
        return (values || []).reduce(function choose(current, value) {
            var normalized = CLASSIFICATIONS[normalizeToken(value)] || value || CLASSIFICATIONS.INFO;
            return (order[normalized] || 0) > (order[current] || 0) ? normalized : current;
        }, CLASSIFICATIONS.INFO);
    }

    function normalizeUsageState(value) {
        var state = normalizeToken(value || 'ACTIVE');
        if (state === 'LOW' || state === 'LOW_ACTIVITY') return 'LOW_ACTIVITY';
        if (state === 'HIGH' || state === 'HIGH_CONSUMPTION') return 'HIGH_CONSUMPTION';
        if (state === 'DEGRADE' || state === 'DEGRADED') return 'DEGRADED';
        if (state === 'SPIKE' || state === 'SPIKE_DETECTED' || state === 'ACTIVITY_SPIKE') return 'SPIKE_DETECTED';
        if (state === 'RESTRICT' || state === 'RESTRICTED') return 'RESTRICTED';
        if (state === 'ARCHIVE' || state === 'ARCHIVED') return 'ARCHIVED';
        return USAGE_STATES.indexOf(state) !== -1 ? state : 'ACTIVE';
    }

    function normalizeUsageType(value) {
        var type = normalizeToken(value || 'TENANT_ACTIVITY');
        if (type === 'WORKFLOW' || type === 'WORKFLOW_USAGE') return 'WORKFLOW_CONSUMPTION';
        if (type === 'STORAGE' || type === 'STORAGE_USAGE') return 'STORAGE_UTILIZATION';
        if (type === 'ONBOARDING') return 'ONBOARDING_ENGAGEMENT';
        if (type === 'FEATURE' || type === 'FEATURE_USAGE') return 'FEATURE_ENGAGEMENT';
        if (type === 'OPERATIONS' || type === 'OPERATIONAL_ACTIVITY') return 'OPERATIONAL_DENSITY';
        if (type === 'NOTIFICATION' || type === 'NOTIFICATION_USAGE') return 'NOTIFICATION_THROUGHPUT';
        if (type === 'EXECUTION' || type === 'WORKLOAD') return 'EXECUTION_UTILIZATION';
        return USAGE_TYPES.indexOf(type) !== -1 ? type : 'TENANT_ACTIVITY';
    }

    function terminalState(row) {
        return /COMPLETED|APPROVED|CLOSED|ARCHIVED|DELETED|RESOLVED|EXPIRED/i.test([row && row.status, row && row.state, row && row.usageState, row && row.lifecycleState].join(' '));
    }

    function failureState(row) {
        return /FAILED|FAILURE|ERROR|REJECTED|QUARANTINED|BLOCKED|DEGRADED|MISMATCH|DENIED|RESTRICTED/i.test([row && row.status, row && row.state, row && row.usageState, row && row.lifecycleState, row && row.failureReason, row && row.error].join(' '));
    }

    function tenantRows(data) {
        var rows = list(data, 'platformTenants').concat(list(data, 'tenantGovernanceRecords'), list(data, 'tenants'));
        if (rows.length) return rows;
        var byTenant = {};
        list(data, 'employees').forEach(function employee(row) {
            var tenant = rowTenant(row);
            if (tenant) byTenant[tenant] = { tenantSlug: tenant, status: 'ACTIVE' };
        });
        return Object.keys(byTenant).map(function map(tenant) { return byTenant[tenant]; });
    }

    function usageRows(data) {
        return list(data, 'tenantUsageRecords').concat(list(data, 'tenantConsumptionRecords'), list(data, 'usageAnalyticsRecords'), list(data, 'organizationUsageRecords'));
    }

    function workflowRows(data) {
        return list(data, 'workflowTelemetryEvents').concat(list(data, 'workflowEvents'), list(data, 'workflowTelemetry'), list(data, 'pendingActions'), list(data, 'workflowHistory'));
    }

    function featureRows(data) {
        return list(data, 'featureUsageEvents').concat(list(data, 'featureRolloutRecords'), list(data, 'featureAdoptionEvents'), list(data, 'rolloutUsageRecords'));
    }

    function storageRows(data) {
        return list(data, 'storageUsageRecords').concat(list(data, 'storageHardeningRecords'), list(data, 'storageObjects'), list(data, 'storageRecords'), list(data, 'fileAttachments'), list(data, 'attachments'), list(data, 'fileRetentionRecords'));
    }

    function notificationRows(data) {
        return list(data, 'notifications').concat(list(data, 'notificationQueue'), list(data, 'notificationDeliveries'));
    }

    function onboardingRows(data) {
        return list(data, 'employeeOnboarding').concat(list(data, 'onboardingStates'), list(data, 'authInvitations'), list(data, 'employeeImports'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicDeliverables'), list(data, 'deliverableTimelineRecords'));
    }

    function signedRows(data) {
        return list(data, 'signedAccessRecords').concat(list(data, 'signedUrlRecords'), list(data, 'temporaryAccessRecords'));
    }

    function filterTenant(rows, tenant) {
        if (!tenant) return (rows || []).slice();
        return (rows || []).filter(function match(row) {
            return sameTenant(rowTenant(row), tenant);
        });
    }

    function storageSize(row) {
        return Math.max(0, safeNumber(row && (row.storageGrowthBytes || row.sizeBytes || row.bytes || row.storageBytes || row.fileSize || row.size), 0));
    }

    function completionRate(done, total) {
        return total ? Math.round((done / Math.max(total, 1)) * 100) : 0;
    }

    function sumRows(rows, fields) {
        return (rows || []).reduce(function total(sum, row) {
            var value = 0;
            (fields || []).some(function first(field) {
                value = safeNumber(row && row[field], 0);
                return value > 0;
            });
            return sum + value;
        }, 0);
    }

    function classifyUsageRisk(signal) {
        try {
            var item = signal || {};
            var severity = normalizeToken(item.severity || item.classification || '');
            if (severity === 'CRITICAL' || severity === 'CRITICAL_BLOCKER') return CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.crossTenant || item.rawConfidentialTenantData || item.rawTenantDataAccess || item.salaryVisibility || item.leaveBalanceVisibility || item.payrollVisibility || item.hrAnalyticsAccess || item.exportConfidentialAnalytics) {
                return CLASSIFICATIONS.CRITICAL_BLOCKER;
            }
            if (item.platformOwnerTenantRbacExposure || item.unsafeTenantAccess || item.permissionBypass || item.rawDocumentExposure) return CLASSIFICATIONS.CRITICAL_BLOCKER;
            if ((item.activitySpike && item.usageAnomaly) || item.highConsumption || item.storagePressure || item.usageState === 'HIGH_CONSUMPTION' || item.usageState === 'SPIKE_DETECTED') return CLASSIFICATIONS.HIGH_RISK;
            if (item.featureAbandonment || item.workflowCongestion || item.notificationFailures || item.lowActivity || item.degraded || item.executionSlowdown) return CLASSIFICATIONS.WARNING;
            return CLASSIFICATIONS.INFO;
        } catch (error) {
            return CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function validateUsageScope(scope, context) {
        try {
            var record = scope || {};
            var ctx = context || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || 'PLATFORM');
            var actorTenant = contextTenant(ctx);
            var target = targetTenant(record, ctx);
            var infrastructureOnly = record.infrastructureOnly === true || record.loadMonitoring === true || normalizeToken(record.mode || record.usageMode || '') === 'INFRASTRUCTURE_MONITORING';
            var failures = [];
            var visibility = VISIBILITY.NONE;
            var usageAnalyticsAuthority = false;

            if (record.rawTenantDataAccess || record.employeeLevelAccess || record.rawConfidentialTenantData || record.rawPayloadAccess) {
                failures.push(safeFailure('RAW_CONFIDENTIAL_TENANT_USAGE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Raw confidential tenant usage data access was blocked.'));
            }
            if (record.salaryVisibility || record.payrollVisibility || record.leaveBalanceVisibility || record.hrAnalyticsAccess || record.exportConfidentialAnalytics) {
                if (role === 'SUPER_ADMIN') {
                    failures.push(safeFailure('SUPER_ADMIN_HR_PAYROLL_USAGE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN usage visibility is infrastructure-only and excludes HR/payroll analytics.'));
                } else {
                    failures.push(safeFailure('CONFIDENTIAL_HR_USAGE_VISIBILITY_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Confidential HR usage visibility is not part of tenant usage intelligence.'));
                }
            }
            if (normalizeUsageState(record.usageState || record.state) === 'ARCHIVED' && (record.mutationRequested || record.updateRequested || record.deleteRequested || record.overrideRequested)) {
                failures.push(safeFailure('ARCHIVED_USAGE_MUTATION_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived tenant usage records are immutable.'));
            }

            if (role === 'PLATFORM_OWNER') {
                visibility = VISIBILITY.ISOLATED_TENANT_USAGE_INTELLIGENCE;
                usageAnalyticsAuthority = true;
                if (routeType && routeType !== 'PLATFORM') {
                    failures.push(safeFailure('PLATFORM_OWNER_TENANT_UI_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER usage intelligence is isolated to platform-control.'));
                }
            } else if (role === 'SUPER_ADMIN') {
                visibility = VISIBILITY.INFRASTRUCTURE_USAGE_MONITORING_ONLY;
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_INFRASTRUCTURE_ONLY_USAGE', CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN usage visibility is limited to infrastructure load monitoring.'));
                }
                if (actorTenant && target && actorTenant !== target) {
                    failures.push(safeFailure('SUPER_ADMIN_CROSS_TENANT_USAGE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN cross-tenant usage traversal was blocked.'));
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_USAGE_INTELLIGENCE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant roles cannot access platform tenant usage intelligence.'));
            }

            var classification = highestClassification(failures.map(function map(row) { return row.classification; }));
            return freezeUsageOutput({
                success: !failures.length,
                allowed: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    aggregateOnly: true,
                    readOnly: true,
                    infrastructureOnly: role === 'SUPER_ADMIN' ? infrastructureOnly : false,
                    usageAnalyticsAuthority: usageAnalyticsAuthority,
                    tenantIsolationPreserved: !failures.some(function critical(row) { return row.failureCode === 'RAW_CONFIDENTIAL_TENANT_USAGE_BLOCKED' || row.failureCode === 'SUPER_ADMIN_CROSS_TENANT_USAGE_BLOCKED'; }),
                    tenantAnalyticsConfidentialityPreserved: true,
                    historicalUsageRecordsImmutable: true,
                    platformOwnerTenantRbacIsolation: true
                }
            });
        } catch (error) {
            return freezeUsageOutput({
                success: false,
                allowed: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('TENANT_USAGE_SCOPE_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Tenant usage scope validation failed safely.')]
            });
        }
    }

    function normalizeUsagePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeUsageOutput({
                    success: false,
                    classification: CLASSIFICATIONS.WARNING,
                    state: 'DEGRADED',
                    failures: [safeFailure('MALFORMED_USAGE_PAYLOAD', CLASSIFICATIONS.WARNING, 'Tenant usage payload is malformed.')]
                });
            }
            var state = normalizeUsageState(payload.state || payload.usageState || payload.status || 'ACTIVE');
            var usageType = normalizeUsageType(payload.usageType || payload.type || payload.category || 'TENANT_ACTIVITY');
            var normalized = {
                usageId: safeString(payload.usageId || payload.id || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || contextTenant(context)),
                state: state,
                usageState: state,
                usageType: usageType,
                workflowEvents: safeNumber(payload.workflowEvents || payload.workflowConsumption || payload.workflowCount, 0),
                storageGrowthBytes: safeNumber(payload.storageGrowthBytes || payload.storageGrowth || payload.storageBytes, 0),
                featureEvents: safeNumber(payload.featureEvents || payload.featureUsage || payload.featureCount, 0),
                onboardingCompletions: safeNumber(payload.onboardingCompletions || payload.onboardingCompletionCount, 0),
                notificationThroughput: safeNumber(payload.notificationThroughput || payload.notificationCount, 0),
                operationalDensity: clamp(safeNumber(payload.operationalDensity || payload.operationalActivityDensity, 0), 0, 100),
                executionUtilization: clamp(safeNumber(payload.executionUtilization || payload.executionUsage, 0), 0, 100),
                activitySpike: payload.activitySpike === true || state === 'SPIKE_DETECTED',
                usageAnomaly: payload.usageAnomaly === true || state === 'DEGRADED' || state === 'HIGH_CONSUMPTION',
                metadata: {
                    readOnly: true,
                    aggregateOnly: true,
                    tenantIsolationPreserved: true,
                    tenantAnalyticsConfidentialityPreserved: true,
                    historicalUsageRecordsImmutable: true
                }
            };
            return freezeUsageOutput({
                success: true,
                classification: classifyUsageRisk(normalized),
                payload: normalized
            });
        } catch (error) {
            return freezeUsageOutput({
                success: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                state: 'DEGRADED',
                failures: [safeFailure('USAGE_PAYLOAD_NORMALIZATION_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Tenant usage normalization failed safely.')]
            });
        }
    }

    function collectTenantSlices(data, tenant) {
        var usage = filterTenant(usageRows(data), tenant);
        var workflows = filterTenant(workflowRows(data), tenant);
        var features = filterTenant(featureRows(data), tenant);
        var storage = filterTenant(storageRows(data), tenant);
        var notifications = filterTenant(notificationRows(data), tenant);
        var onboarding = filterTenant(onboardingRows(data), tenant);
        var executions = filterTenant(executionRows(data), tenant);
        var signed = filterTenant(signedRows(data), tenant);
        var tenants = filterTenant(tenantRows(data), tenant);
        return {
            usage: usage,
            workflows: workflows,
            features: features,
            storage: storage,
            notifications: notifications,
            onboarding: onboarding,
            executions: executions,
            signed: signed,
            tenants: tenants
        };
    }

    function calculateMetrics(slices) {
        var usage = slices.usage || [];
        var workflows = slices.workflows || [];
        var features = slices.features || [];
        var storage = slices.storage || [];
        var notifications = slices.notifications || [];
        var onboarding = slices.onboarding || [];
        var executions = slices.executions || [];
        var signed = slices.signed || [];
        var tenants = slices.tenants || [];
        var storageGrowth = sumRows(usage, ['storageGrowthBytes', 'storageGrowth', 'storageBytes']) + storage.reduce(function total(sum, row) { return sum + storageSize(row); }, 0);
        var quota = tenants.reduce(function total(sum, row) { return sum + Math.max(0, safeNumber(row && (row.quotaBytes || row.storageQuotaBytes || row.quota), 0)); }, 0);
        var workflowConsumption = sumRows(usage, ['workflowEvents', 'workflowConsumption', 'workflowCount']) + workflows.length;
        var featureEvents = sumRows(usage, ['featureEvents', 'featureUsage', 'featureCount']) + features.length;
        var notificationThroughput = sumRows(usage, ['notificationThroughput', 'notificationCount']) + notifications.length;
        var onboardingDone = sumRows(usage, ['onboardingCompletions', 'onboardingCompletionCount']) + onboarding.filter(function done(row) {
            return /ACCEPTED|COMPLETED|ACTIVE|DONE/i.test([row.status, row.state].join(' '));
        }).length;
        var degradedFeatures = features.filter(function degraded(row) {
            return failureState(row) || /DEGRADED|ROLLBACK|FAILED|CRASH/i.test([row.rolloutState, row.eventType, row.status, row.state].join(' '));
        }).length;
        var activeFeatures = features.filter(function active(row) {
            return /ACTIVE|BETA|LIMITED|USED|OK/i.test([row.rolloutState, row.eventType, row.status, row.state].join(' ')) && !failureState(row);
        }).length;
        var failedNotifications = notifications.filter(failureState).length;
        var blockedExecutions = executions.filter(function blocked(row) {
            return failureState(row) || /BLOCKED|ESCALATED|DELAYED|AT_RISK|OVERLOADED/i.test([row.status, row.state, row.governanceState, row.signal].join(' '));
        }).length;
        var operationalDensity = Math.max.apply(null, [0].concat(usage.map(function density(row) { return safeNumber(row && (row.operationalDensity || row.operationalActivityDensity), 0); })));
        operationalDensity = Math.max(operationalDensity, clamp(workflowConsumption + featureEvents + notificationThroughput + blockedExecutions, 0, 100));
        var executionUtilization = Math.max.apply(null, [0].concat(usage.map(function execution(row) { return safeNumber(row && row.executionUtilization, 0); })));
        executionUtilization = Math.max(executionUtilization, clamp(executions.reduce(function total(sum, row) { return sum + safeNumber(row && (row.workloadUnits || row.executionUnits), 0); }, 0), 0, 100));
        return {
            workflowConsumption: workflowConsumption,
            workflowCongestion: workflows.filter(failureState).length + blockedExecutions,
            storageGrowthBytes: storageGrowth,
            storageAnomalies: storage.filter(function risky(row) { return failureState(row) || row.suspiciousAccess === true || row.accessDenied === true; }).length,
            quotaUtilization: quota ? Math.round((storageGrowth / Math.max(quota, 1)) * 100) : (storageGrowth ? 100 : 0),
            signedUrlUsage: signed.length,
            featureEvents: featureEvents,
            activeFeatures: activeFeatures,
            degradedFeatures: degradedFeatures,
            featureAdoptionRate: completionRate(activeFeatures, Math.max(features.length, 1)),
            featureAbandonment: features.filter(function abandoned(row) {
                return safeNumber(row && row.failureCount, 0) > safeNumber(row && row.adoptionCount, 0) || /ABANDON|INACTIVE|DEGRADED|CRASH/i.test([row.eventType, row.rolloutState, row.status].join(' '));
            }).length,
            onboardingCompletions: onboardingDone,
            onboardingCompletionRate: completionRate(onboardingDone, onboarding.length),
            notificationThroughput: notificationThroughput,
            notificationFailures: failedNotifications,
            operationalDensity: operationalDensity,
            executionUtilization: executionUtilization,
            executionSlowdown: blockedExecutions
        };
    }

    function detectUsageAnomalies(filters, context) {
        try {
            var data = rawData();
            var supplied = filters && Array.isArray(filters.records) ? filters.records.slice() : [];
            var tenant = targetTenant(filters || {}, context || {});
            var slices = collectTenantSlices(data, tenant);
            if (supplied.length) slices.usage = slices.usage.concat(supplied);
            var metrics = calculateMetrics(slices);
            var activitySpikes = slices.usage.filter(function spike(row) {
                return row && (row.activitySpike === true || normalizeUsageState(row.usageState || row.state) === 'SPIKE_DETECTED' || safeNumber(row.workflowEvents, 0) >= 100 || safeNumber(row.featureEvents, 0) >= 40);
            }).length;
            var usageAnomalies = slices.usage.filter(function anomaly(row) {
                return row && (row.usageAnomaly === true || normalizeUsageState(row.usageState || row.state) === 'DEGRADED' || normalizeUsageState(row.usageState || row.state) === 'HIGH_CONSUMPTION');
            }).length;
            var signals = [];
            if (activitySpikes) signals.push(safeWarning('ACTIVITY_SPIKE_DETECTED', 'Tenant activity spike detected.', { count: activitySpikes }));
            if (usageAnomalies) signals.push(safeWarning('USAGE_ANOMALY_DETECTED', 'Tenant usage anomaly detected.', { count: usageAnomalies }));
            if (metrics.storageAnomalies) signals.push(safeWarning('STORAGE_USAGE_ANOMALY', 'Storage usage anomaly detected.', { count: metrics.storageAnomalies }));
            if (metrics.featureAbandonment) signals.push(safeWarning('FEATURE_ABANDONMENT', 'Feature abandonment or degradation detected.', { count: metrics.featureAbandonment }));
            if (metrics.executionSlowdown) signals.push(safeWarning('EXECUTION_SLOWDOWN', 'Execution slowdown detected.', { count: metrics.executionSlowdown }));
            if (metrics.notificationFailures) signals.push(safeWarning('NOTIFICATION_FAILURES', 'Notification throughput degradation detected.', { count: metrics.notificationFailures }));
            return freezeUsageOutput({
                success: true,
                classification: signals.length ? CLASSIFICATIONS.WARNING : CLASSIFICATIONS.INFO,
                state: signals.length ? 'SPIKE_DETECTED' : 'ACTIVE',
                summary: {
                    activitySpikes: activitySpikes,
                    usageAnomalies: usageAnomalies,
                    storageAnomalies: metrics.storageAnomalies,
                    featureAbandonment: metrics.featureAbandonment,
                    workflowCongestion: metrics.workflowCongestion,
                    notificationFailures: metrics.notificationFailures,
                    executionSlowdown: metrics.executionSlowdown
                },
                healthSignals: signals,
                metadata: {
                    aggregateOnly: true,
                    tenantIsolationPreserved: true,
                    tenantAnalyticsConfidentialityPreserved: true,
                    anomalyDetectionReady: true
                }
            });
        } catch (error) {
            safeWarn('Usage anomaly detection failed safely.', error && error.message);
            return freezeUsageOutput({
                success: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                state: 'DEGRADED',
                summary: {
                    activitySpikes: 0,
                    usageAnomalies: 0,
                    storageAnomalies: 0,
                    featureAbandonment: 0,
                    workflowCongestion: 0,
                    notificationFailures: 0,
                    executionSlowdown: 0
                },
                failures: [safeFailure('USAGE_ANOMALY_DETECTION_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Usage anomaly detection failed safely.')]
            });
        }
    }

    function usageSummary(row) {
        var normalized = normalizeUsagePayload(row || {}, {});
        var payload = normalized.payload || {};
        return {
            usageId: payload.usageId || '',
            tenantSlug: payload.tenantSlug || rowTenant(row),
            usageState: payload.usageState || 'ACTIVE',
            usageType: payload.usageType || 'TENANT_ACTIVITY',
            classification: classifyUsageRisk(payload),
            workflowEvents: payload.workflowEvents || 0,
            storageGrowthBytes: payload.storageGrowthBytes || 0,
            featureEvents: payload.featureEvents || 0,
            onboardingCompletions: payload.onboardingCompletions || 0,
            notificationThroughput: payload.notificationThroughput || 0,
            operationalDensity: payload.operationalDensity || 0,
            executionUtilization: payload.executionUtilization || 0,
            activitySpike: !!payload.activitySpike,
            usageAnomaly: !!payload.usageAnomaly
        };
    }

    function integrationHealth() {
        return {
            platformAnalyticsIntegrated: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
            tenantGovernanceIntegrated: !!(global.TenantGovernanceService || global.tenantGovernanceService),
            featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
            storageAnalyticsIntegrated: !!(global.StorageAnalyticsService || global.storageAnalyticsService || global.StorageHardeningService || global.storageHardeningService),
            workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
            auditReady: !!(global.AuditService || global.auditService),
            telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
            metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService),
            anomalyDetectionReady: true
        };
    }

    function recordAuditAndTelemetry(action, report, context) {
        var ctx = context || {};
        var data = rawData();
        var timestamp = nowIso(ctx);
        var metadata = {
            tenantSlug: report && report.tenantUsageModel && report.tenantUsageModel.tenantSlug || '',
            classification: report && report.classification || CLASSIFICATIONS.INFO,
            aggregateOnly: true,
            confidentialFiltering: true
        };
        if (!ctx.skipAuditPersistence) {
            try {
                if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                    global.AuditService.recordAudit({
                        action: action,
                        actionType: action,
                        type: 'TENANT_USAGE_INTELLIGENCE',
                        module: 'Platform Analytics',
                        severity: metadata.classification === CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : metadata.classification === CLASSIFICATIONS.HIGH_RISK ? 'ERROR' : metadata.classification === CLASSIFICATIONS.WARNING ? 'WARNING' : 'INFO',
                        description: 'Tenant usage intelligence access recorded.',
                        metadata: metadata
                    }, { actor: ctx.actor || {}, skipPersistence: false });
                }
            } catch (error) {}
            try {
                data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
                data.auditLogs.unshift({
                    id: 'TUI-AUD-' + Date.now(),
                    action: action,
                    type: 'TENANT_USAGE_INTELLIGENCE',
                    eventType: action,
                    module: 'Platform Analytics',
                    timestamp: timestamp,
                    metadata: cloneSanitized(metadata)
                });
            } catch (error) {}
        }
        if (!ctx.skipTelemetry) {
            try {
                if (global.WorkflowTelemetryService && typeof global.WorkflowTelemetryService.emitWorkflowTelemetry === 'function') {
                    global.WorkflowTelemetryService.emitWorkflowTelemetry(action, {
                        source: 'TenantUsageIntelligenceService',
                        severity: metadata.classification === CLASSIFICATIONS.INFO ? 'INFO' : 'WARNING',
                        metadata: metadata
                    });
                }
            } catch (error) {}
            try {
                data.workflowTelemetry = Array.isArray(data.workflowTelemetry) ? data.workflowTelemetry : [];
                data.workflowTelemetry.unshift({
                    telemetryId: 'TUI-TEL-' + Date.now(),
                    eventType: action,
                    metricType: 'TENANT_USAGE_INTELLIGENCE',
                    source: 'TenantUsageIntelligenceService',
                    timestamp: timestamp,
                    metadata: cloneSanitized(metadata)
                });
            } catch (error) {}
        }
        if (!ctx.skipMetrics) {
            try {
                if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') {
                    global.OrchestrationMetricsService.recordWorkflowMetric('TENANT_USAGE_INTELLIGENCE', {
                        status: 'RECORDED',
                        severity: metadata.classification === CLASSIFICATIONS.INFO ? 'INFO' : 'WARNING',
                        tenantSlug: metadata.tenantSlug
                    });
                }
            } catch (error) {}
            try {
                data.orchestrationMetrics = Array.isArray(data.orchestrationMetrics) ? data.orchestrationMetrics : [];
                data.orchestrationMetrics.unshift({
                    metric: 'tenant_usage_intelligence',
                    metricType: 'tenant_usage_intelligence',
                    name: 'tenant_usage_intelligence_report',
                    timestamp: timestamp,
                    metadata: cloneSanitized(metadata)
                });
            } catch (error) {}
        }
        saveData(data);
    }

    function generateTenantUsageReport(filters, context) {
        try {
            var input = filters || {};
            var ctx = context || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var scope = validateUsageScope(input, ctx);
            if (!scope.allowed) {
                return freezeUsageOutput({
                    success: false,
                    classification: scope.classification,
                    tenantUsageModel: {
                        version: VERSION,
                        state: 'RESTRICTED',
                        readOnly: true,
                        aggregateOnly: true,
                        generatedAt: nowIso(ctx)
                    },
                    accessGovernance: baseAccessGovernance(scope, role),
                    failures: scope.failures,
                    integrationHealth: integrationHealth(),
                    usageSummaries: []
                });
            }

            var data = rawData();
            var tenant = targetTenant(input, ctx);
            var slices = collectTenantSlices(data, tenant);
            var metrics = calculateMetrics(slices);
            var anomalies = detectUsageAnomalies(input, ctx);
            var infrastructureOnly = role === 'SUPER_ADMIN';
            var usageSummaries = infrastructureOnly ? [] : slices.usage.map(usageSummary).slice(0, 25);
            var highConsumption = slices.usage.filter(function high(row) {
                return normalizeUsageState(row && (row.usageState || row.state)) === 'HIGH_CONSUMPTION' || safeNumber(row && row.storageGrowthBytes, 0) >= 5000 || safeNumber(row && row.workflowEvents, 0) >= 100;
            }).length;
            var lowActivity = slices.usage.filter(function low(row) {
                return normalizeUsageState(row && (row.usageState || row.state)) === 'LOW_ACTIVITY' || safeNumber(row && row.workflowEvents, 0) <= 1;
            }).length;
            var activeUsageRecords = slices.usage.filter(function active(row) {
                return normalizeUsageState(row && (row.usageState || row.state)) !== 'ARCHIVED';
            }).length;
            var classification = highestClassification([
                classifyUsageRisk({
                    activitySpike: anomalies.summary && anomalies.summary.activitySpikes > 0,
                    usageAnomaly: anomalies.summary && anomalies.summary.usageAnomalies > 0,
                    storagePressure: metrics.quotaUtilization >= 80,
                    workflowCongestion: metrics.workflowCongestion > 0,
                    featureAbandonment: metrics.featureAbandonment > 0
                }),
                scope.classification
            ]);
            var state = classification === CLASSIFICATIONS.CRITICAL_BLOCKER ? 'RESTRICTED' :
                anomalies.summary && anomalies.summary.activitySpikes ? 'SPIKE_DETECTED' :
                highConsumption ? 'HIGH_CONSUMPTION' :
                metrics.workflowCongestion || metrics.featureAbandonment ? 'DEGRADED' : 'ACTIVE';
            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                tenantUsageModel: {
                    version: VERSION,
                    state: state,
                    states: USAGE_STATES.slice(),
                    usageTypes: USAGE_TYPES.slice(),
                    tenantSlug: tenant,
                    readOnly: true,
                    aggregateOnly: true,
                    generatedAt: nowIso(ctx)
                },
                tenantUsageOverview: {
                    activeTenants: slices.tenants.filter(function active(row) { return !/INACTIVE|SUSPENDED|ARCHIVED|DELETED/i.test([row.status, row.state].join(' ')); }).length,
                    totalTenants: slices.tenants.length,
                    usageRecords: slices.usage.length,
                    activeUsageRecords: activeUsageRecords,
                    highConsumptionTenants: highConsumption,
                    lowActivityTenants: lowActivity,
                    activitySpikes: anomalies.summary && anomalies.summary.activitySpikes || 0,
                    usageAnomalies: anomalies.summary && anomalies.summary.usageAnomalies || 0
                },
                consumptionAnalytics: {
                    workflowEvents: metrics.workflowConsumption,
                    workflowConsumption: metrics.workflowConsumption,
                    workflowCongestion: metrics.workflowCongestion,
                    storageGrowthBytes: metrics.storageGrowthBytes,
                    onboardingCompletions: metrics.onboardingCompletions,
                    notificationThroughput: metrics.notificationThroughput,
                    notificationFailures: metrics.notificationFailures,
                    operationalDensity: metrics.operationalDensity,
                    executionUtilization: metrics.executionUtilization,
                    executionSlowdown: metrics.executionSlowdown
                },
                featureEngagement: {
                    featureEvents: metrics.featureEvents,
                    activeFeatures: metrics.activeFeatures,
                    degradedFeatures: metrics.degradedFeatures,
                    featureAdoptionRate: metrics.featureAdoptionRate,
                    featureAbandonment: metrics.featureAbandonment
                },
                storageIntegration: {
                    storageGrowthBytes: metrics.storageGrowthBytes,
                    storageAnomalies: metrics.storageAnomalies,
                    quotaUtilization: metrics.quotaUtilization,
                    signedUrlUsage: metrics.signedUrlUsage,
                    retentionGrowth: filterTenant(list(data, 'fileRetentionRecords').concat(list(data, 'retentionRecords')), tenant).length,
                    rawDocumentExposure: false,
                    storageAnalyticsIntegrated: integrationHealth().storageAnalyticsIntegrated
                },
                tenantIntelligence: {
                    tenantActivityTrends: metrics.workflowConsumption + metrics.featureEvents + metrics.notificationThroughput,
                    activitySpikeDetection: anomalies.summary && anomalies.summary.activitySpikes || 0,
                    usageAnomalyHandling: anomalies.summary && anomalies.summary.usageAnomalies || 0,
                    inactiveTenantDetection: slices.tenants.filter(function inactive(row) { return /INACTIVE|SUSPENDED|ARCHIVED|DELETED/i.test([row.status, row.state].join(' ')); }).length,
                    operationalActivityDensity: metrics.operationalDensity,
                    organizationUtilizationScore: clamp(Math.round((metrics.operationalDensity + metrics.executionUtilization + metrics.featureAdoptionRate + metrics.onboardingCompletionRate) / 4), 0, 100),
                    tenantGrowthTrends: metrics.workflowConsumption + metrics.featureEvents + metrics.onboardingCompletions + metrics.notificationThroughput,
                    onboardingCompletionRate: metrics.onboardingCompletionRate
                },
                accessGovernance: baseAccessGovernance(scope, role),
                integrationHealth: integrationHealth(),
                usageSummaries: usageSummaries,
                governanceDashboard: {
                    state: state,
                    activitySpikes: anomalies.summary && anomalies.summary.activitySpikes || 0,
                    consumptionPressure: metrics.quotaUtilization,
                    featureEngagementHealth: metrics.featureAdoptionRate,
                    storageHealth: metrics.storageAnomalies ? 'REVIEW' : 'HEALTHY',
                    tenantAnalyticsConfidentialityPreserved: true
                }
            };
            report.healthSignals = anomalies.healthSignals || [];
            recordAuditAndTelemetry('TENANT_USAGE_INTELLIGENCE_REVIEWED', report, ctx);
            return freezeUsageOutput(report);
        } catch (error) {
            safeWarn('Tenant usage report failed safely.', error && error.message);
            return freezeUsageOutput({
                success: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                tenantUsageModel: {
                    version: VERSION,
                    state: 'DEGRADED',
                    readOnly: true,
                    aggregateOnly: true,
                    generatedAt: nowIso(context || {})
                },
                failures: [safeFailure('TENANT_USAGE_REPORT_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Tenant usage intelligence report failed safely.')],
                integrationHealth: integrationHealth(),
                usageSummaries: []
            });
        }
    }

    function baseAccessGovernance(scope, role) {
        var superAdmin = normalizeRole(role) === 'SUPER_ADMIN';
        return {
            crossTenantConfidentialLeakageBlocked: true,
            salaryVisibility: false,
            leaveBalanceVisibility: false,
            payrollVisibility: false,
            confidentialEmployeeRecordsVisible: false,
            rawTenantDocumentsVisible: false,
            superAdminHrPayrollVisibility: false,
            superAdminInfrastructureOnly: superAdmin,
            platformOwnerTenantRbacIsolation: true,
            platformIsolationPreserved: true,
            tenantIsolationPreserved: scope && scope.metadata ? scope.metadata.tenantIsolationPreserved !== false : true,
            tenantAnalyticsConfidentialityPreserved: true,
            historicalUsageRecordsImmutable: true,
            existingTenantWorkflowsPreserved: true,
            tenantUsageActionsAuditable: true,
            usageActionsAuditable: true,
            usageAnalyticsAuthority: scope && scope.metadata ? scope.metadata.usageAnalyticsAuthority === true : false
        };
    }

    function runSelfTest() {
        var tests = [];
        function record(name, ok, details) {
            tests.push(Object.freeze({ name: name, ok: !!ok, details: details || null }));
        }
        var previousPlatformAnalytics = global.PlatformAnalyticsService;
        var previousFeatureRollout = global.FeatureRolloutService;
        var previousStorageHardening = global.StorageHardeningService;
        try {
            var malformed = normalizeUsagePayload(null, { actor: { role: 'PLATFORM_OWNER' } });
            record('malformed payloads fail safely', malformed.success === false && malformed.classification === CLASSIFICATIONS.WARNING, malformed);

            var frozen = freezeUsageOutput({ safeCount: 1, nested: { salary: 10, visible: true } });
            record('immutability enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && frozen.nested.visible === true && typeof frozen.nested.salary === 'undefined', frozen);

            var spike = detectUsageAnomalies({
                records: [{ tenantSlug: 'self', usageState: 'SPIKE_DETECTED', workflowEvents: 200, featureEvents: 50, activitySpike: true, usageAnomaly: true }]
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            record('activity spike detection works', spike.success === true && spike.summary.activitySpikes >= 1 && spike.summary.usageAnomalies >= 1, spike.summary);

            var risk = classifyUsageRisk({ activitySpike: true, usageAnomaly: true });
            record('usage anomaly handling works', risk === CLASSIFICATIONS.HIGH_RISK, { risk: risk });

            var blocked = validateUsageScope({ targetTenantSlug: 'tenant-b', infrastructureOnly: true, loadMonitoring: true }, {
                routeType: 'platform',
                tenantSlug: 'tenant-a',
                actor: { role: 'SUPER_ADMIN', tenantSlug: 'tenant-a' }
            });
            var tenantDenied = validateUsageScope({ tenantSlug: 'tenant-a' }, {
                routeType: 'tenant',
                actor: { role: 'HR', tenantSlug: 'tenant-a' }
            });
            record('tenant isolation works', blocked.allowed === false && tenantDenied.allowed === false, { blocked: blocked.allowed, tenantDenied: tenantDenied.allowed });

            global.PlatformAnalyticsService = undefined;
            global.platformAnalyticsService = undefined;
            global.FeatureRolloutService = undefined;
            global.featureRolloutService = undefined;
            global.StorageHardeningService = undefined;
            global.storageHardeningService = undefined;
            var degraded = generateTenantUsageReport({ tenantSlug: 'self' }, {
                routeType: 'platform',
                actor: { role: 'PLATFORM_OWNER' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            record('dependency absence is safe', degraded.success === true && degraded.integrationHealth.platformAnalyticsIntegrated === false, degraded.integrationHealth);
        } catch (error) {
            record('self-test exception isolation', false, { message: error && error.message ? error.message : safeString(error, 'unknown') });
        } finally {
            global.PlatformAnalyticsService = previousPlatformAnalytics;
            global.platformAnalyticsService = previousPlatformAnalytics;
            global.FeatureRolloutService = previousFeatureRollout;
            global.featureRolloutService = previousFeatureRollout;
            global.StorageHardeningService = previousStorageHardening;
            global.storageHardeningService = previousStorageHardening;
        }
        return freezeUsageOutput({
            passed: tests.every(function pass(test) { return test.ok; }),
            tests: tests
        });
    }

    var TenantUsageIntelligenceService = Object.freeze({
        VERSION: VERSION,
        USAGE_STATES: USAGE_STATES,
        USAGE_TYPES: USAGE_TYPES,
        CLASSIFICATIONS: CLASSIFICATIONS,
        validateUsageScope: validateUsageScope,
        classifyUsageRisk: classifyUsageRisk,
        normalizeUsagePayload: normalizeUsagePayload,
        freezeUsageOutput: freezeUsageOutput,
        detectUsageAnomalies: detectUsageAnomalies,
        generateTenantUsageReport: generateTenantUsageReport,
        runSelfTest: runSelfTest
    });

    global.TenantUsageIntelligenceService = TenantUsageIntelligenceService;
    global.tenantUsageIntelligenceService = TenantUsageIntelligenceService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_TENANT_USAGE_SELF_TEST__ = runSelfTest();
        try {
            if (global.console && typeof global.console.info === 'function') {
                console.info(PREFIX, 'Development self-test ' + (global.__ARTHHRMS_TENANT_USAGE_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_TENANT_USAGE_SELF_TEST__);
            }
        } catch (error) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
