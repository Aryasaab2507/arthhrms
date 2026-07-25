/**
 * platformAnalyticsService.js
 * ARTHHRMS Enterprise Platform Analytics Console + Multi-Tenant Intelligence.
 *
 * Additive, read-only platform-control analytics layer for aggregate tenant
 * growth, platform health, storage usage, workflow activity, and SaaS
 * operational intelligence. It never exposes salaries, leave balances, raw
 * tenant documents, employee-level records, or tenant-private payloads.
 */
(function attachPlatformAnalyticsService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[PlatformAnalyticsService]';

    var ANALYTICS_STATES = Object.freeze({
        COLLECTING: 'COLLECTING',
        AGGREGATED: 'AGGREGATED',
        DEGRADED: 'DEGRADED',
        ALERTING: 'ALERTING',
        ARCHIVED: 'ARCHIVED'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ISOLATED_PLATFORM_ANALYTICS: 'ISOLATED_PLATFORM_ANALYTICS',
        INFRASTRUCTURE_MONITORING_ONLY: 'INFRASTRUCTURE_MONITORING_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|message|note|comment|email|phone|name|confidential|private)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        classification: true,
        visibility: true,
        state: true,
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
        platformAnalyticsModel: true,
        tenantIntelligence: true,
        platformHealth: true,
        engagementIntelligence: true,
        storageUsageAnalytics: true,
        workflowExecutionAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        analyticsState: true,
        platformState: true,
        activeTenants: true,
        totalTenants: true,
        activeEmployeesCount: true,
        tenantGrowthAnalytics: true,
        tenantActivityTrends: true,
        inactiveOrganizations: true,
        inactiveTenantDetection: true,
        organizationEngagement: true,
        featureAdoptionRate: true,
        onboardingCompletionRate: true,
        onboardingFailures: true,
        communicationEngagement: true,
        operationalActivityDensity: true,
        workflowCongestion: true,
        failedJobs: true,
        uploadFailureRates: true,
        notificationFailures: true,
        storagePressure: true,
        escalationSpikes: true,
        workflowActivity: true,
        notificationThroughput: true,
        escalationFrequency: true,
        systemUsageTrends: true,
        tenantStorageGrowth: true,
        storageGrowthBytes: true,
        uploadCongestion: true,
        signedUrlUsage: true,
        attachmentGrowth: true,
        quotaUtilization: true,
        retentionGrowth: true,
        rawDocumentExposure: true,
        workflowCompletionTrends: true,
        executionCongestion: true,
        escalationGrowth: true,
        delayedApprovalTrends: true,
        operationalBottlenecks: true,
        workloadImbalance: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        superAdminPayrollVisibility: true,
        platformOwnerTenantUiIsolation: true,
        crossTenantConfidentialLeakageBlocked: true,
        rawTenantDataAccess: true,
        tenantAnalyticsRoleBlocked: true,
        superAdminInfrastructureOnly: true,
        existingTenantWorkflowsPreserved: true,
        analyticsActionsAuditable: true,
        platformIsolationPreserved: true,
        platformAnalyticsConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        historicalPlatformMetricsImmutable: true,
        workflowTelemetryIntegrated: true,
        communicationAnalyticsIntegrated: true,
        departmentExecutionBoardIntegrated: true,
        storageAnalyticsIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            var state = source && typeof source.get === 'function' ? source.get() || {} : {};
            var projection = global.PlatformAggregateIntegrationService?.getProjection?.() || {};
            return Object.assign({}, state, projection);
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
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
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id));
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
            return value.map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return row !== undefined; });
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
            return input.map(function item(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return row !== undefined; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezePlatformOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function filterConfidentialPlatformData(value) {
        return freezePlatformOutput(value || {});
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'PLATFORM_ANALYTICS_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Platform analytics failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'PLATFORM_ANALYTICS_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Platform analytics warning.', '')
        };
        if (metadata && typeof metadata === 'object') warning.metadata = cloneSanitized(metadata);
        return deepFreeze(warning);
    }

    function highestClassification(values) {
        var order = {};
        order[FAILURE_CLASSIFICATIONS.INFO] = 0;
        order[FAILURE_CLASSIFICATIONS.WARNING] = 1;
        order[FAILURE_CLASSIFICATIONS.HIGH_RISK] = 2;
        order[FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER] = 3;
        return (values || []).reduce(function choose(current, value) {
            var normalized = FAILURE_CLASSIFICATIONS[normalizeToken(value)] || value || FAILURE_CLASSIFICATIONS.INFO;
            return (order[normalized] || 0) > (order[current] || 0) ? normalized : current;
        }, FAILURE_CLASSIFICATIONS.INFO);
    }

    function normalizeAnalyticsState(value) {
        var state = normalizeToken(value || ANALYTICS_STATES.COLLECTING);
        if (state === 'AGGREGATE' || state === 'AGGREGATED') return ANALYTICS_STATES.AGGREGATED;
        if (state === 'ALERT' || state === 'ALERTING') return ANALYTICS_STATES.ALERTING;
        if (state === 'DEGRADE' || state === 'DEGRADED') return ANALYTICS_STATES.DEGRADED;
        if (state === 'ARCHIVE' || state === 'ARCHIVED') return ANALYTICS_STATES.ARCHIVED;
        return ANALYTICS_STATES.COLLECTING;
    }

    function isActiveTenant(row) {
        var state = normalizeToken(row && (row.status || row.state || row.lifecycleState || 'ACTIVE'));
        return state !== 'INACTIVE' && state !== 'SUSPENDED' && state !== 'ARCHIVED' && state !== 'DELETED';
    }

    function terminalState(row) {
        return /COMPLETED|APPROVED|CLOSED|ARCHIVED|DELETED|RESOLVED|EXPIRED/i.test([row && row.status, row && row.state, row && row.lifecycleState].join(' '));
    }

    function failureState(row) {
        return /FAILED|FAILURE|ERROR|REJECTED|QUARANTINED|BLOCKED|DEGRADED|MISMATCH|DENIED/i.test([row && row.status, row && row.state, row && row.lifecycleState, row && row.failureReason, row && row.error].join(' '));
    }

    function olderThanDays(value, days, context) {
        if (!value) return false;
        var date = new Date(value);
        var now = context && context.now ? new Date(context.now) : new Date();
        if (isNaN(date.getTime()) || isNaN(now.getTime())) return false;
        return (now.getTime() - date.getTime()) / 86400000 > days;
    }

    function tenantRows(data) {
        var rows = list(data, 'platformTenants');
        if (rows.length) return rows;
        var byTenant = {};
        employeeRows(data).forEach(function employee(row) {
            var tenant = rowTenant(row);
            if (tenant) byTenant[tenant] = { tenantSlug: tenant, status: 'ACTIVE' };
        });
        return Object.keys(byTenant).map(function key(tenant) { return byTenant[tenant]; });
    }

    function employeeRows(data) {
        return list(data, 'employees').filter(function excludePlatform(row) {
            return normalizeRole(row && row.role) !== 'PLATFORM_OWNER';
        });
    }

    function workflowRows(data) {
        return list(data, 'workflowEvents').concat(list(data, 'workflowTelemetry'), list(data, 'pendingActions'), list(data, 'workflowHistory'));
    }

    function asyncRows(data) {
        return list(data, 'asyncJobs').concat(list(data, 'jobQueue'), list(data, 'backgroundJobs'));
    }

    function notificationRows(data) {
        return list(data, 'notifications').concat(list(data, 'notificationQueue'), list(data, 'notificationDeliveries'));
    }

    function onboardingRows(data) {
        return list(data, 'employeeOnboarding').concat(list(data, 'onboardingStates'), list(data, 'authInvitations'), list(data, 'employeeImports'));
    }

    function communicationRows(data) {
        return list(data, 'communications').concat(list(data, 'announcements'), list(data, 'policyBroadcasts'), list(data, 'leadershipAnnouncements'));
    }

    function acknowledgementRows(data) {
        return list(data, 'policyAcknowledgements').concat(list(data, 'announcementAcknowledgements'), list(data, 'acknowledgements'));
    }

    function escalationRows(data) {
        return list(data, 'escalations').concat(list(data, 'escalationEvents'), list(data, 'escalationCommands'));
    }

    function attachmentRows(data) {
        return list(data, 'fileAttachments').concat(list(data, 'attachments'), list(data, 'documents'));
    }

    function storageRows(data) {
        return list(data, 'storageObjects').concat(list(data, 'storageRecords'));
    }

    function uploadRows(data) {
        return list(data, 'uploadValidationRecords').concat(list(data, 'uploads'), list(data, 'secureUploads'));
    }

    function signedAccessRows(data) {
        return list(data, 'signedAccessRecords').concat(list(data, 'signedUrlRecords'), list(data, 'temporaryAccessRecords'));
    }

    function retentionRows(data) {
        return list(data, 'fileRetentionRecords').concat(list(data, 'retentionRecords'), list(data, 'archiveRecords'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicDeliverables'), list(data, 'deliverableTimelineRecords'));
    }

    function storageSize(row) {
        return Math.max(0, safeNumber(row && (row.sizeBytes || row.bytes || row.storageBytes || row.fileSize || row.size), 0));
    }

    function tenantStorageUsage(data) {
        return attachmentRows(data).concat(storageRows(data), retentionRows(data)).reduce(function total(sum, row) {
            return sum + storageSize(row);
        }, 0);
    }

    function tenantQuota(data) {
        return tenantRows(data).reduce(function total(sum, row) {
            return sum + Math.max(0, safeNumber(row && (row.quotaBytes || row.storageQuotaBytes || row.quota), 0));
        }, 0);
    }

    function completionRate(done, total) {
        return total ? Math.round((done / Math.max(total, 1)) * 100) : 0;
    }

    function classifyPlatformRisk(signal) {
        try {
            var item = signal || {};
            if (item.crossTenant || item.rawConfidentialTenantData || item.rawTenantDataAccess || item.salaryVisibility || item.leaveBalanceVisibility || item.employeeSalaryVisibility || item.employeeLeaveBalanceVisibility || item.superAdminPayrollVisibility || item.platformOwnerTenantUiExposure) {
                return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            }
            if (item.publicDocumentExposure || item.unsafeTenantAccess || item.permissionBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.storagePressure || item.notificationFailures || item.workflowCongestion || item.failedJobs || item.uploadFailures || item.escalationSpikes) return FAILURE_CLASSIFICATIONS.WARNING;
            if (item.platformDegradation || item.inactiveTenantDetection || item.onboardingFailures) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function validatePlatformAnalyticsScope(scope, context) {
        try {
            var record = scope || {};
            var ctx = context || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || 'platform');
            var infrastructureOnly = record.infrastructureOnly === true || normalizeToken(record.mode || record.analyticsMode || '') === 'INFRASTRUCTURE_MONITORING';
            var failures = [];
            var visibility = VISIBILITY.NONE;
            var aggregateOnly = true;

            if (record.rawTenantDataAccess || record.employeeLevelAccess || record.rawConfidentialTenantData || record.rawPayloadAccess) {
                failures.push(safeFailure('RAW_CONFIDENTIAL_TENANT_DATA_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Raw tenant data access was blocked.'));
            }
            if (record.salaryVisibility || record.payrollVisibility || record.leaveBalanceVisibility || record.employeeSalaryVisibility || record.employeeLeaveBalanceVisibility) {
                if (role === 'SUPER_ADMIN') {
                    failures.push(safeFailure('SUPER_ADMIN_PAYROLL_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN access is infrastructure-only.'));
                } else {
                    failures.push(safeFailure('CONFIDENTIAL_HR_DATA_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Confidential HR visibility is not part of platform analytics.'));
                }
            }

            if (role === 'PLATFORM_OWNER') {
                visibility = VISIBILITY.ISOLATED_PLATFORM_ANALYTICS;
                if (routeType && routeType !== 'PLATFORM') {
                    failures.push(safeFailure('PLATFORM_OWNER_TENANT_UI_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER analytics are isolated to platform-control.'));
                }
            } else if (role === 'SUPER_ADMIN') {
                visibility = VISIBILITY.INFRASTRUCTURE_MONITORING_ONLY;
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_INFRASTRUCTURE_ONLY_ANALYTICS', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN analytics visibility is limited to infrastructure monitoring.'));
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_PLATFORM_ANALYTICS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant roles cannot access platform analytics.'));
            }

            var classification = highestClassification(failures.map(function map(row) { return row.classification; }));
            return freezePlatformOutput({
                success: !failures.length,
                allowed: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    aggregateOnly: aggregateOnly,
                    infrastructureOnly: role === 'SUPER_ADMIN' ? infrastructureOnly : false,
                    platformIsolationPreserved: true,
                    platformAnalyticsConfidentialityPreserved: true,
                    tenantIsolationPreserved: !failures.some(function critical(row) { return row.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER && row.failureCode === 'RAW_CONFIDENTIAL_TENANT_DATA_BLOCKED'; })
                }
            });
        } catch (error) {
            return freezePlatformOutput({
                success: false,
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('PLATFORM_ANALYTICS_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Platform analytics scope validation failed safely.')]
            });
        }
    }

    function normalizePlatformMetrics(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePlatformOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: ANALYTICS_STATES.COLLECTING,
                    failures: [safeFailure('MALFORMED_PLATFORM_METRICS', FAILURE_CLASSIFICATIONS.WARNING, 'Platform metrics payload is malformed.')]
                });
            }
            var normalized = {
                state: normalizeAnalyticsState(payload.state || payload.status || ANALYTICS_STATES.COLLECTING),
                readOnly: payload.readOnly !== false,
                aggregateOnly: true,
                activeTenants: safeNumber(payload.activeTenants || payload.activeTenantCount, 0),
                totalTenants: safeNumber(payload.totalTenants || payload.tenantCount, 0),
                activeEmployeesCount: safeNumber(payload.activeEmployeesCount || payload.employeeCount, 0),
                workflowActivity: safeNumber(payload.workflowActivity || payload.workflowCount, 0),
                notificationThroughput: safeNumber(payload.notificationThroughput || payload.notificationCount, 0),
                escalationFrequency: safeNumber(payload.escalationFrequency || payload.escalationCount, 0),
                tenantGrowthAnalytics: safeNumber(payload.tenantGrowthAnalytics || payload.tenantGrowth || 0, 0),
                metadata: {
                    platformAnalyticsConfidentialityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalPlatformMetricsImmutable: true
                }
            };
            return freezePlatformOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized
            });
        } catch (error) {
            return freezePlatformOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ANALYTICS_STATES.DEGRADED,
                failures: [safeFailure('PLATFORM_METRICS_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Platform metrics normalization failed safely.')]
            });
        }
    }

    function detectPlatformDegradation(filters, context) {
        try {
            var data = rawData();
            var workflows = workflowRows(data);
            var jobs = asyncRows(data);
            var uploads = uploadRows(data);
            var notifications = notificationRows(data);
            var tenants = tenantRows(data);
            var onboarding = onboardingRows(data);
            var escalations = escalationRows(data);
            var attachments = attachmentRows(data);
            var storage = storageRows(data);
            var executions = executionRows(data);
            var quota = tenantQuota(data);
            var storageUsage = tenantStorageUsage(data);
            var quotaUtilization = quota ? Math.round((storageUsage / Math.max(quota, 1)) * 100) : (storageUsage ? 100 : 0);

            var workflowCongestion = workflows.filter(function congested(row) {
                return failureState(row) || /PENDING|DELAYED|BLOCKED|DEGRADED/i.test([row.status, row.state, row.type, row.module].join(' '));
            }).length + executions.filter(function blocked(row) {
                return /BLOCKED|ESCALATED|DELAYED|AT_RISK/i.test([row.status, row.state, row.governanceState].join(' '));
            }).length;
            var failedJobs = jobs.filter(failureState).length;
            var uploadFailureRates = uploads.filter(failureState).length + attachments.filter(failureState).length;
            var notificationFailures = notifications.filter(failureState).length;
            var storagePressure = (quotaUtilization >= 80 ? 1 : 0) + storage.filter(function risky(row) {
                return failureState(row) || row.suspiciousAccess === true || row.accessDenied === true;
            }).length;
            var escalationSpikes = escalations.filter(function active(row) {
                return !terminalState(row) || /ESCALATED|CRITICAL|HIGH/i.test([row.status, row.state, row.severity].join(' '));
            }).length;
            var onboardingFailures = onboarding.filter(function failed(row) {
                return failureState(row) || /FAILED|OVERDUE|PENDING/i.test([row.status, row.state].join(' '));
            }).length;
            var inactiveTenantDetection = tenants.filter(function inactive(row) {
                return !isActiveTenant(row) || olderThanDays(row.lastActiveAt || row.updatedAt || row.createdAt, 30, context);
            }).length;
            var signals = [];
            if (workflowCongestion) signals.push(safeWarning('WORKFLOW_CONGESTION', 'Workflow congestion detected.', { count: workflowCongestion }));
            if (failedJobs) signals.push(safeWarning('FAILED_JOBS', 'Failed platform jobs detected.', { count: failedJobs }));
            if (uploadFailureRates) signals.push(safeWarning('UPLOAD_FAILURES', 'Upload failure rate detected.', { count: uploadFailureRates }));
            if (notificationFailures) signals.push(safeWarning('NOTIFICATION_FAILURES', 'Notification failures detected.', { count: notificationFailures }));
            if (storagePressure) signals.push(safeWarning('STORAGE_PRESSURE', 'Storage pressure detected.', { count: storagePressure }));
            if (escalationSpikes) signals.push(safeWarning('ESCALATION_SPIKES', 'Escalation spikes detected.', { count: escalationSpikes }));
            if (onboardingFailures) signals.push(safeWarning('ONBOARDING_FAILURES', 'Onboarding failures detected.', { count: onboardingFailures }));
            if (inactiveTenantDetection) signals.push(safeWarning('INACTIVE_TENANTS', 'Inactive tenant buildup detected.', { count: inactiveTenantDetection }));

            return freezePlatformOutput({
                success: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                state: signals.length ? ANALYTICS_STATES.ALERTING : ANALYTICS_STATES.AGGREGATED,
                summary: {
                    workflowCongestion: workflowCongestion,
                    failedJobs: failedJobs,
                    uploadFailureRates: uploadFailureRates,
                    notificationFailures: notificationFailures,
                    storagePressure: storagePressure,
                    escalationSpikes: escalationSpikes,
                    onboardingFailures: onboardingFailures,
                    inactiveTenantDetection: inactiveTenantDetection
                },
                healthSignals: signals,
                metadata: {
                    platformAnalyticsConfidentialityPreserved: true,
                    tenantIsolationPreserved: true,
                    aggregateOnly: true
                }
            });
        } catch (error) {
            safeWarn('Platform degradation detection failed safely.', error && error.message);
            return freezePlatformOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ANALYTICS_STATES.DEGRADED,
                summary: {
                    workflowCongestion: 0,
                    failedJobs: 0,
                    uploadFailureRates: 0,
                    notificationFailures: 0,
                    storagePressure: 0,
                    escalationSpikes: 0,
                    onboardingFailures: 0,
                    inactiveTenantDetection: 0
                },
                failures: [safeFailure('PLATFORM_DEGRADATION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Platform degradation detection failed safely.')]
            });
        }
    }

    function calculateTenantIntelligence(data, context) {
        var tenants = tenantRows(data);
        var employees = employeeRows(data);
        var aggregateEmployeeCount = Number(data?.platformAggregateSnapshot?.employeeCount);
        var activeTenants = tenants.filter(isActiveTenant).length;
        var inactiveOrganizations = tenants.length - activeTenants + tenants.filter(function stale(row) {
            return isActiveTenant(row) && olderThanDays(row.lastActiveAt || row.updatedAt || row.createdAt, 30, context);
        }).length;
        var communications = communicationRows(data);
        var acks = acknowledgementRows(data);
        var viewed = communications.reduce(function total(sum, row) {
            var ids = row && (row.viewedUserIds || row.readUserIds || row.seenUserIds);
            return sum + (Array.isArray(ids) ? ids.length : safeNumber(row && row.viewCount, 0));
        }, 0);
        var acknowledged = acks.filter(function ack(row) { return /ACK|ACCEPT|COMPLETE/i.test([row.status, row.state].join(' ')); }).length +
            communications.reduce(function total(sum, row) {
                var ids = row && (row.acknowledgedUserIds || row.acceptedUserIds);
                return sum + (Array.isArray(ids) ? ids.length : safeNumber(row && row.acknowledgedCount, 0));
            }, 0);
        var onboarding = onboardingRows(data);
        var completedOnboarding = onboarding.filter(function complete(row) { return /ACCEPTED|COMPLETED|ACTIVE|DONE/i.test([row.status, row.state].join(' ')); }).length;
        var featureSource = (data && data.platformGovernance && data.platformGovernance.features) || data.features || {};
        var featureKeys = Object.keys(featureSource || {});
        var enabledFeatures = featureKeys.filter(function enabled(key) {
            var row = featureSource[key];
            return row === true || row && row.enabled !== false;
        }).length;
        var activity = workflowRows(data).length + communicationRows(data).length + notificationRows(data).length + escalationRows(data).length;
        return {
            activeTenants: activeTenants,
            totalTenants: tenants.length,
            activeEmployeesCount: Number.isFinite(aggregateEmployeeCount) ? aggregateEmployeeCount : employees.length,
            tenantGrowthAnalytics: tenants.length,
            tenantActivityTrends: activity,
            inactiveOrganizations: Math.max(0, inactiveOrganizations),
            organizationEngagement: completionRate(viewed + acknowledged, Math.max(communications.length + acks.length, 1)),
            featureAdoptionRate: featureKeys.length ? completionRate(enabledFeatures, featureKeys.length) : (activity ? 100 : 0),
            onboardingCompletionRate: completionRate(completedOnboarding, onboarding.length),
            communicationEngagement: viewed + acknowledged,
            operationalActivityDensity: activity
        };
    }

    function calculateStorageUsageAnalytics(data) {
        var attachments = attachmentRows(data);
        var storage = storageRows(data);
        var uploads = uploadRows(data);
        var signed = signedAccessRows(data);
        var retention = retentionRows(data);
        var totalSize = tenantStorageUsage(data);
        var quota = tenantQuota(data);
        return {
            tenantStorageGrowth: totalSize,
            storageGrowthBytes: totalSize,
            uploadCongestion: uploads.filter(failureState).length + attachments.filter(failureState).length,
            signedUrlUsage: signed.length,
            attachmentGrowth: attachments.length,
            quotaUtilization: quota ? Math.round((totalSize / Math.max(quota, 1)) * 100) : (totalSize ? 100 : 0),
            retentionGrowth: retention.length,
            rawDocumentExposure: false,
            storagePressure: storage.filter(function risky(row) { return failureState(row) || row.suspiciousAccess === true || row.accessDenied === true; }).length
        };
    }

    function calculateWorkflowExecutionAnalytics(data) {
        var workflows = workflowRows(data);
        var executions = executionRows(data);
        var escalations = escalationRows(data);
        var completed = workflows.filter(function done(row) { return /COMPLETED|APPROVED|DONE/i.test([row.status, row.state].join(' ')); }).length;
        var blockedExecutions = executions.filter(function blocked(row) {
            return /BLOCKED|ESCALATED|DELAYED|AT_RISK/i.test([row.status, row.state, row.governanceState].join(' '));
        }).length;
        var workloadImbalance = executions.filter(function load(row) {
            return safeNumber(row && row.workloadUnits, 0) >= 7 || /OVERLOADED|IMBALANCE/i.test([row.status, row.state, row.signal].join(' '));
        }).length;
        var delayedApproval = workflows.filter(function delayed(row) {
            return /APPROVAL|REVIEW|PENDING|DELAY/i.test([row.type, row.module, row.status, row.state].join(' ')) && !terminalState(row);
        }).length + escalations.filter(function delayed(row) { return /APPROVAL|DELAY/i.test([row.type, row.escalationType].join(' ')); }).length;
        return {
            workflowCompletionTrends: completed,
            workflowActivity: workflows.length,
            executionCongestion: blockedExecutions + workflows.filter(failureState).length,
            escalationGrowth: escalations.length,
            delayedApprovalTrends: delayedApproval,
            operationalBottlenecks: blockedExecutions + escalations.filter(function active(row) { return !terminalState(row); }).length,
            workloadImbalance: workloadImbalance
        };
    }

    function applyInfrastructureOnlyView(report) {
        var next = Object.assign({}, report || {});
        next.tenantIntelligence = Object.assign({}, next.tenantIntelligence || {}, {
            activeEmployeesCount: 0,
            tenantActivityTrends: 0,
            organizationEngagement: 0,
            communicationEngagement: 0,
            operationalActivityDensity: 0
        });
        next.engagementIntelligence = Object.assign({}, next.engagementIntelligence || {}, {
            tenantActivityTrends: 0,
            organizationEngagement: 0,
            featureAdoptionRate: 0,
            onboardingCompletionRate: 0,
            communicationEngagement: 0,
            operationalActivityDensity: 0
        });
        next.workflowExecutionAnalytics = Object.assign({}, next.workflowExecutionAnalytics || {}, {
            workflowCompletionTrends: 0,
            workflowActivity: 0,
            delayedApprovalTrends: 0,
            operationalBottlenecks: 0,
            workloadImbalance: 0
        });
        next.accessGovernance = Object.assign({}, next.accessGovernance || {}, {
            superAdminInfrastructureOnly: true,
            salaryVisibility: false,
            leaveBalanceVisibility: false,
            superAdminPayrollVisibility: false,
            rawTenantDataAccess: false
        });
        next.metadata = Object.assign({}, next.metadata || {}, {
            infrastructureOnly: true,
            platformAnalyticsConfidentialityPreserved: true,
            tenantIsolationPreserved: true
        });
        return next;
    }

    function safeServiceReport(serviceName, methodName, filters, context) {
        try {
            var service = global[serviceName];
            if (!service || typeof service[methodName] !== 'function') return null;
            return service[methodName](filters || {}, Object.assign({}, context || {}, {
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }));
        } catch (error) {
            return null;
        }
    }

    function auditPlatformAnalytics(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Platform Analytics',
                    targetId: 'platform-aggregate',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'PLATFORM_OWNER',
                    actorId: context && context.actor && (context.actor.id || context.actor.userId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'platformAnalyticsService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'platform_owner', context && context.actor && context.actor.id || '', actionType, 'Platform Analytics', 'platform-aggregate', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Platform analytics audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'platformAnalyticsService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: 'platform',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Platform analytics telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'WorkflowTelemetryService unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: 'platform',
                    source: 'platformAnalyticsService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Platform analytics metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generatePlatformAnalyticsReport(filters, context) {
        try {
            var ctx = context || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var infrastructureOnly = role === 'SUPER_ADMIN' && ((filters && filters.infrastructureOnly === true) || normalizeToken(filters && (filters.mode || filters.analyticsMode) || '') === 'INFRASTRUCTURE_MONITORING');
            var scope = validatePlatformAnalyticsScope(Object.assign({ aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezePlatformOutput({
                    success: false,
                    readOnly: true,
                    classification: scope.classification,
                    platformAnalyticsModel: {
                        state: ANALYTICS_STATES.DEGRADED,
                        aggregateOnly: true
                    },
                    failures: scope.failures,
                    accessGovernance: {
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        superAdminPayrollVisibility: false,
                        superAdminInfrastructureOnly: role === 'SUPER_ADMIN',
                        platformOwnerTenantUiIsolation: true,
                        crossTenantConfidentialLeakageBlocked: true,
                        rawTenantDataAccess: false
                    }
                });
            }

            var data = rawData();
            var tenantIntelligence = calculateTenantIntelligence(data, ctx);
            var storageUsageAnalytics = calculateStorageUsageAnalytics(data);
            var workflowExecutionAnalytics = calculateWorkflowExecutionAnalytics(data);
            var degradation = detectPlatformDegradation(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var health = degradation.summary || {};
            var communicationReport = safeServiceReport('CommunicationAnalyticsService', 'generateCommunicationAnalyticsReport', { tenantSlug: contextTenant(ctx) || undefined }, ctx);
            var executionReport = safeServiceReport('DepartmentExecutionBoardService', 'generateDepartmentExecutionReport', { tenantSlug: contextTenant(ctx) || undefined }, ctx);
            var storageReport = safeServiceReport('StorageHardeningService', 'generateStorageHardeningReport', { tenantSlug: contextTenant(ctx) || undefined }, ctx);
            var classifications = [scope.classification, degradation.classification];
            if (communicationReport && communicationReport.classification) classifications.push(communicationReport.classification);
            if (executionReport && executionReport.classification) classifications.push(executionReport.classification);
            if (storageReport && storageReport.classification) classifications.push(storageReport.classification);
            var classification = highestClassification(classifications);
            var state = classification === FAILURE_CLASSIFICATIONS.INFO ? ANALYTICS_STATES.AGGREGATED : ANALYTICS_STATES.ALERTING;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(ctx),
                platformAnalyticsModel: {
                    state: state,
                    aggregateOnly: true,
                    platformState: state,
                    historicalPlatformMetricsImmutable: true
                },
                tenantIntelligence: tenantIntelligence,
                platformHealth: {
                    workflowCongestion: health.workflowCongestion || 0,
                    failedJobs: health.failedJobs || 0,
                    uploadFailureRates: health.uploadFailureRates || 0,
                    notificationFailures: health.notificationFailures || 0,
                    storagePressure: health.storagePressure || 0,
                    escalationSpikes: health.escalationSpikes || 0,
                    onboardingFailures: health.onboardingFailures || 0,
                    inactiveTenantDetection: health.inactiveTenantDetection || 0,
                    systemUsageTrends: tenantIntelligence.operationalActivityDensity || 0
                },
                engagementIntelligence: {
                    tenantActivityTrends: tenantIntelligence.tenantActivityTrends,
                    inactiveOrganizations: tenantIntelligence.inactiveOrganizations,
                    organizationEngagement: tenantIntelligence.organizationEngagement,
                    featureAdoptionRate: tenantIntelligence.featureAdoptionRate,
                    onboardingCompletionRate: tenantIntelligence.onboardingCompletionRate,
                    communicationEngagement: tenantIntelligence.communicationEngagement,
                    operationalActivityDensity: tenantIntelligence.operationalActivityDensity
                },
                storageUsageAnalytics: storageUsageAnalytics,
                workflowExecutionAnalytics: workflowExecutionAnalytics,
                accessGovernance: {
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    superAdminPayrollVisibility: false,
                    superAdminInfrastructureOnly: infrastructureOnly,
                    platformOwnerTenantUiIsolation: true,
                    crossTenantConfidentialLeakageBlocked: true,
                    rawTenantDataAccess: false,
                    tenantAnalyticsRoleBlocked: true,
                    existingTenantWorkflowsPreserved: true,
                    analyticsActionsAuditable: true,
                    platformIsolationPreserved: true,
                    platformAnalyticsConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    communicationAnalyticsIntegrated: !!global.CommunicationAnalyticsService,
                    departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
                    storageAnalyticsIntegrated: !!(global.StorageAnalyticsService || global.StorageHardeningService),
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: degradation.healthSignals || [],
                metadata: {
                    aggregateOnly: true,
                    platformAnalyticsConfidentialityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalPlatformMetricsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    analyticsActionsAuditable: true,
                    platformIsolationPreserved: true
                }
            };

            if (infrastructureOnly) {
                report = applyInfrastructureOnlyView(report);
            }

            auditPlatformAnalytics('PLATFORM_ANALYTICS_REPORTED', {
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                status: classification,
                description: 'Platform aggregate analytics viewed.'
            }, ctx);
            emitTelemetry('PLATFORM_ANALYTICS_REPORTED', {
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                activeTenants: tenantIntelligence.activeTenants,
                workflowCongestion: health.workflowCongestion || 0
            }, ctx);
            recordMetric('PLATFORM_ANALYTICS_REPORTED', {
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, ctx);

            return freezePlatformOutput(report);
        } catch (error) {
            safeWarn('Platform analytics report failed safely.', error && error.message);
            return freezePlatformOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                platformAnalyticsModel: { state: ANALYTICS_STATES.DEGRADED, aggregateOnly: true },
                platformHealth: { workflowCongestion: 0 },
                failures: [safeFailure('PLATFORM_ANALYTICS_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Platform analytics report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizePlatformMetrics(null, { routeType: 'platform' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_PLATFORM_METRICS'; }));

            var platformScope = validatePlatformAnalyticsScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER', id: 'PO-SELF' } });
            check('platform isolation works', platformScope.allowed === true && platformScope.visibility === VISIBILITY.ISOLATED_PLATFORM_ANALYTICS);

            var tenantRole = validatePlatformAnalyticsScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', id: 'HR-SELF' } });
            check('tenant roles are blocked from platform analytics', tenantRole.allowed === false && tenantRole.failures.some(function item(row) { return row.failureCode === 'TENANT_ROLE_PLATFORM_ANALYTICS_BLOCKED'; }));

            var raw = validatePlatformAnalyticsScope({ rawTenantDataAccess: true, salaryVisibility: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', id: 'SA-SELF' } });
            check('restricted aggregate filtering blocks unsafe access', raw.allowed === false && raw.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var superAdminAggregate = validatePlatformAnalyticsScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', id: 'SA-SELF' } });
            check('super admin broad aggregate analytics blocked', superAdminAggregate.allowed === false && superAdminAggregate.failures.some(function item(row) { return row.failureCode === 'SUPER_ADMIN_INFRASTRUCTURE_ONLY_ANALYTICS'; }));

            var normalized = normalizePlatformMetrics({ state: 'aggregated', activeTenants: 2, activeEmployeesCount: 5, salary: 90000, leaveBalance: 8 }, { routeType: 'platform' });
            check('analytics aggregation normalizes safely', normalized.success === true && normalized.payload.activeTenants === 2 && JSON.stringify(normalized).indexOf('90000') === -1);

            var degradation = detectPlatformDegradation({}, { routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('platform degradation detection works', degradation.success === true && Object.isFrozen(degradation.healthSignals));

            var frozen = freezePlatformOutput({ nested: { ok: true }, payload: { state: ANALYTICS_STATES.AGGREGATED } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalWorkflowTelemetry = global.WorkflowTelemetryService;
            var originalCommunicationAnalytics = global.CommunicationAnalyticsService;
            var originalDepartmentExecution = global.DepartmentExecutionBoardService;
            var originalStorage = global.StorageHardeningService;
            try {
                delete global.WorkflowTelemetryService;
                delete global.CommunicationAnalyticsService;
                delete global.DepartmentExecutionBoardService;
                delete global.StorageHardeningService;
                var report = generatePlatformAnalyticsReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER', id: 'PO-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.workflowTelemetryIntegrated === false && report.integrationHealth.communicationAnalyticsIntegrated === false && report.integrationHealth.departmentExecutionBoardIntegrated === false && report.integrationHealth.storageAnalyticsIntegrated === false);
            } finally {
                if (originalWorkflowTelemetry) global.WorkflowTelemetryService = originalWorkflowTelemetry;
                if (originalCommunicationAnalytics) global.CommunicationAnalyticsService = originalCommunicationAnalytics;
                if (originalDepartmentExecution) global.DepartmentExecutionBoardService = originalDepartmentExecution;
                if (originalStorage) global.StorageHardeningService = originalStorage;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezePlatformOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Platform analytics self-test passed.' : 'Platform analytics self-test detected failures.'
        });
        global.__ARTHHRMS_PLATFORM_ANALYTICS_SELF_TEST__ = result;
        return result;
    }

    var PlatformAnalyticsService = Object.freeze({
        VERSION: VERSION,
        ANALYTICS_STATES: ANALYTICS_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validatePlatformAnalyticsScope: validatePlatformAnalyticsScope,
        classifyPlatformRisk: classifyPlatformRisk,
        normalizePlatformMetrics: normalizePlatformMetrics,
        freezePlatformOutput: freezePlatformOutput,
        filterConfidentialPlatformData: filterConfidentialPlatformData,
        detectPlatformDegradation: detectPlatformDegradation,
        generatePlatformAnalyticsReport: generatePlatformAnalyticsReport,
        runSelfTest: runSelfTest
    });

    global.PlatformAnalyticsService = PlatformAnalyticsService;
    global.platformAnalyticsService = PlatformAnalyticsService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
