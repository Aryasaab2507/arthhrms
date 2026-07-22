/**
 * platformCostMonitoringService.js
 * ARTHHRMS Enterprise Platform Cost Monitoring + Infrastructure Consumption Governance.
 *
 * Additive, platform-control-only cost intelligence for aggregate infrastructure
 * consumption, storage and workflow execution costs, resource efficiency, and
 * optimization signals. It never exposes salaries, leave balances, payroll
 * internals, employee records, raw tenant documents, or tenant-private payloads.
 */
(function attachPlatformCostMonitoringService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[PlatformCostMonitoringService]';

    var COST_STATES = Object.freeze([
        'NORMAL',
        'MONITORING',
        'HIGH_USAGE',
        'COST_SPIKE',
        'DEGRADED',
        'OPTIMIZATION_REQUIRED',
        'ALERTED',
        'ARCHIVED'
    ]);

    var COST_TYPES = Object.freeze([
        'INFRASTRUCTURE_CONSUMPTION',
        'STORAGE_COST',
        'WORKFLOW_EXECUTION_COST',
        'NOTIFICATION_CONSUMPTION',
        'DEPLOYMENT_RESOURCE_USAGE',
        'TENANT_RESOURCE_UTILIZATION',
        'OPERATIONAL_EFFICIENCY',
        'COST_ANOMALY'
    ]);

    var CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ISOLATED_PLATFORM_COST_GOVERNANCE: 'ISOLATED_PLATFORM_COST_GOVERNANCE',
        INFRASTRUCTURE_COST_MONITORING_ONLY: 'INFRASTRUCTURE_COST_MONITORING_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|invoice.?url|receipt.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|message|note|comment|email|phone|name|confidential|private)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_COST_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        classification: true,
        visibility: true,
        state: true,
        states: true,
        costState: true,
        costType: true,
        costTypes: true,
        costId: true,
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
        validationOnly: true,
        costGovernanceModel: true,
        platformCostSummary: true,
        infrastructureAnalytics: true,
        storageWorkflowIntegration: true,
        resourceEfficiency: true,
        costIntelligence: true,
        costSummaries: true,
        accessGovernance: true,
        integrationHealth: true,
        governanceDashboard: true,
        totalCostRecords: true,
        activeCostRecords: true,
        highUsageSignals: true,
        costSpikes: true,
        degradedSignals: true,
        optimizationRequired: true,
        alertedSignals: true,
        archivedSignals: true,
        infrastructureCostTotal: true,
        infrastructureGrowth: true,
        storageCost: true,
        storageCostSignals: true,
        storageCostAnomalies: true,
        storageGrowthBytes: true,
        quotaUtilization: true,
        workflowExecutionCost: true,
        workflowExecutionOverload: true,
        workflowEvents: true,
        workflowFailures: true,
        notificationCost: true,
        notificationThroughputCost: true,
        notificationConsumptionSpikes: true,
        notificationFailures: true,
        deploymentCost: true,
        deploymentResourceUsage: true,
        deploymentResourceCongestion: true,
        failedJobs: true,
        resourceUnits: true,
        tenantResourceUtilization: true,
        resourceSummaryCount: true,
        operationalEfficiencyScore: true,
        efficiencyScore: true,
        optimizationOpportunities: true,
        optimizationRecommendations: true,
        anomalyAlerts: true,
        infrastructureSpikes: true,
        costAnomalies: true,
        infrastructureAnomalies: true,
        resourcePressure: true,
        usageLinkedCostGrowth: true,
        tenantUsagePressure: true,
        billingUsageIntegration: true,
        platformHealthSignals: true,
        workflowCostIntegrated: true,
        storageCostIntegrated: true,
        operationalEfficiencyIndicators: true,
        resourceOptimizationVisible: true,
        costGovernanceAuthority: true,
        costAnalyticsAuthority: true,
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
        infrastructureCostGovernancePreserved: true,
        historicalCostRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        costGovernanceActionsAuditable: true,
        tenantUsageIntegrated: true,
        tenantBillingIntegrated: true,
        platformAnalyticsIntegrated: true,
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

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companySlug || row.companyId || row.orgSlug || row.organizationId));
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.targetTenantSlug || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function targetTenant(scope) {
        return normalizeTenantSlug(scope && (scope.targetTenantSlug || scope.tenantSlug || scope.tenantId || scope.companySlug || scope.companyId));
    }

    function sameTenant(row, tenantSlug) {
        var target = normalizeTenantSlug(tenantSlug || '');
        return !target || rowTenant(row) === target;
    }

    function nowIso() {
        try { return new Date().toISOString(); } catch (error) { return ''; }
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function isSensitiveValue(value) {
        if (typeof value !== 'string') return false;
        SENSITIVE_VALUE_PATTERN.lastIndex = 0;
        return SENSITIVE_VALUE_PATTERN.test(value);
    }

    function cloneSanitized(value, key) {
        var currentKey = safeString(key || '', '');
        if (!SAFE_COST_KEYS[currentKey] && SENSITIVE_KEY_PATTERN.test(currentKey)) return undefined;
        if (Array.isArray(value)) {
            return value.map(function(item) { return cloneSanitized(item, ''); }).filter(function(item) { return typeof item !== 'undefined'; });
        }
        if (value && typeof value === 'object') {
            var out = {};
            Object.keys(value).forEach(function(childKey) {
                if (!SAFE_COST_KEYS[childKey] && SENSITIVE_KEY_PATTERN.test(childKey)) return;
                var next = cloneSanitized(value[childKey], childKey);
                if (typeof next !== 'undefined') out[childKey] = next;
            });
            return out;
        }
        if (isSensitiveValue(value)) return undefined;
        return value;
    }

    function freezeCostOutput(output) {
        return deepFreeze(cloneSanitized(output || {}, '') || {});
    }

    function safeFailure(code, message, details) {
        return freezeCostOutput({
            success: false,
            allowed: false,
            classification: CLASSIFICATIONS.CRITICAL_BLOCKER,
            visibility: VISIBILITY.NONE,
            failureCode: code,
            failures: [{ code: code, message: message || 'Cost governance blocked safely.', details: details || null }],
            generatedAt: nowIso(),
            accessGovernance: baseAccessGovernance(false)
        });
    }

    function normalizeCostState(value) {
        var state = normalizeToken(value || '');
        if (state === 'COSTSPIKE' || state === 'SPIKE' || state === 'SPENDING_SPIKE' || state === 'INFRASTRUCTURE_SPIKE') return 'COST_SPIKE';
        if (state === 'HIGH' || state === 'HIGHUSE' || state === 'HIGH_CONSUMPTION') return 'HIGH_USAGE';
        if (state === 'OPTIMIZATION' || state === 'OPTIMIZE' || state === 'OPTIMIZATION_REQUIRED') return 'OPTIMIZATION_REQUIRED';
        if (state === 'ALERT' || state === 'ALERTING') return 'ALERTED';
        if (COST_STATES.indexOf(state) !== -1) return state;
        return 'MONITORING';
    }

    function normalizeCostType(value) {
        var type = normalizeToken(value || '');
        if (type === 'WORKFLOW_EXECUTION' || type === 'WORKFLOW_COST' || type === 'EXECUTION_COST') return 'WORKFLOW_EXECUTION_COST';
        if (type === 'STORAGE' || type === 'STORAGE_UTILIZATION') return 'STORAGE_COST';
        if (type === 'NOTIFICATION' || type === 'NOTIFICATION_THROUGHPUT') return 'NOTIFICATION_CONSUMPTION';
        if (type === 'DEPLOYMENT' || type === 'DEPLOYMENT_COST') return 'DEPLOYMENT_RESOURCE_USAGE';
        if (type === 'TENANT_USAGE' || type === 'RESOURCE_UTILIZATION') return 'TENANT_RESOURCE_UTILIZATION';
        if (COST_TYPES.indexOf(type) !== -1) return type;
        return 'INFRASTRUCTURE_CONSUMPTION';
    }

    function costRows(data) {
        return list(data, 'platformCostRecords')
            .concat(list(data, 'infrastructureCostRecords'), list(data, 'costMonitoringRecords'), list(data, 'costAnalyticsRecords'));
    }

    function storageRows(data) {
        return list(data, 'storageUsageRecords')
            .concat(list(data, 'storageHardeningRecords'), list(data, 'storageObjects'), list(data, 'storageRecords'), list(data, 'fileAttachments'), list(data, 'attachments'), list(data, 'fileRetentionRecords'));
    }

    function workflowRows(data) {
        return list(data, 'workflowTelemetryEvents')
            .concat(list(data, 'workflowEvents'), list(data, 'workflowTelemetry'), list(data, 'pendingActions'), list(data, 'workflowHistory'));
    }

    function notificationRows(data) {
        return list(data, 'notifications')
            .concat(list(data, 'notificationQueue'), list(data, 'notificationDeliveries'), list(data, 'notificationRecords'));
    }

    function deploymentRows(data) {
        return list(data, 'deploymentValidationRecords')
            .concat(list(data, 'deploymentRecords'), list(data, 'releaseValidationRecords'), list(data, 'productionReadinessRecords'), list(data, 'safeReleaseRecords'));
    }

    function usageRows(data) {
        return list(data, 'tenantUsageRecords')
            .concat(list(data, 'tenantConsumptionRecords'), list(data, 'usageAnalyticsRecords'), list(data, 'organizationUsageRecords'));
    }

    function billingRows(data) {
        return list(data, 'tenantBillingRecords')
            .concat(list(data, 'subscriptionRecords'), list(data, 'tenantSubscriptionRecords'));
    }

    function filterTenant(rows, tenantSlug) {
        var target = normalizeTenantSlug(tenantSlug || '');
        return rows.filter(function(row) { return sameTenant(row, target); });
    }

    function rowState(row) {
        return normalizeCostState(row && (row.costState || row.state || row.infrastructureState || row.healthState || row.status));
    }

    function isFailed(row) {
        var text = normalizeToken([row && row.status, row && row.state, row && row.eventType, row && row.type, row && row.deploymentState, row && row.storageState].join(' '));
        return /FAILED|FAILURE|ERROR|DEGRADED|DELAY|PENDING|BLOCKED|CONGESTED/.test(text);
    }

    function sumBy(rows, keys, fallbackPerRow) {
        return rows.reduce(function(sum, row) {
            var value = 0;
            keys.forEach(function(key) {
                value += safeNumber(row && row[key], 0);
            });
            if (!value && fallbackPerRow) value = fallbackPerRow(row);
            return sum + value;
        }, 0);
    }

    function countWhere(rows, predicate) {
        return rows.reduce(function(sum, row) { return sum + (predicate(row) ? 1 : 0); }, 0);
    }

    function average(rows, keys) {
        var values = [];
        rows.forEach(function(row) {
            keys.forEach(function(key) {
                var value = safeNumber(row && row[key], NaN);
                if (isFinite(value)) values.push(value);
            });
        });
        if (!values.length) return 0;
        return Math.round(values.reduce(function(sum, value) { return sum + value; }, 0) / values.length);
    }

    function classifyCostRisk(signal) {
        signal = signal || {};
        var state = normalizeCostState(signal.state || signal.costState || '');
        if (signal.crossTenant || signal.salaryVisibility || signal.leaveBalanceVisibility || signal.payrollVisibility || signal.confidentialExposure || signal.rawTenantDataAccess) {
            return CLASSIFICATIONS.CRITICAL_BLOCKER;
        }
        if (signal.severity && /critical|blocker/i.test(String(signal.severity))) return CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (state === 'COST_SPIKE' || state === 'HIGH_USAGE' || state === 'DEGRADED' || signal.costAnomaly || signal.infrastructureSpike || signal.infrastructureSpikes || signal.storageCostAnomaly || signal.storageCostAnomalies || signal.workflowExecutionOverload || signal.notificationConsumptionSpikes) {
            return CLASSIFICATIONS.HIGH_RISK;
        }
        if (state === 'OPTIMIZATION_REQUIRED' || state === 'ALERTED' || signal.optimizationOpportunity || signal.optimizationOpportunities || signal.resourcePressure || safeNumber(signal.operationalEfficiencyScore, 100) < 60) {
            return CLASSIFICATIONS.WARNING;
        }
        return CLASSIFICATIONS.INFO;
    }

    function highestClassification(values) {
        var order = [CLASSIFICATIONS.INFO, CLASSIFICATIONS.WARNING, CLASSIFICATIONS.HIGH_RISK, CLASSIFICATIONS.CRITICAL_BLOCKER];
        return (values || []).reduce(function(best, value) {
            return order.indexOf(value) > order.indexOf(best) ? value : best;
        }, CLASSIFICATIONS.INFO);
    }

    function baseAccessGovernance(allowed, role) {
        return {
            allowed: allowed === true,
            salaryVisibility: false,
            leaveBalanceVisibility: false,
            payrollVisibility: false,
            confidentialEmployeeRecordsVisible: false,
            rawTenantDocumentsVisible: false,
            superAdminHrPayrollVisibility: false,
            superAdminInfrastructureOnly: role === 'SUPER_ADMIN',
            platformOwnerTenantRbacIsolation: true,
            platformIsolationPreserved: true,
            tenantIsolationPreserved: true,
            infrastructureCostGovernancePreserved: true,
            crossTenantConfidentialLeakageBlocked: true,
            historicalCostRecordsImmutable: true,
            existingTenantWorkflowsPreserved: true,
            costGovernanceActionsAuditable: true
        };
    }

    function validateCostScope(scope, context) {
        scope = scope || {};
        context = context || {};
        var actor = context.actor || {};
        var role = normalizeRole(actor.role || context.role);
        var routeType = normalizeToken(context.routeType || 'platform').toLowerCase();
        var actorTenant = normalizeTenantSlug(actor.tenantSlug || actor.tenantId || context.tenantSlug);
        var ctxTenant = contextTenant(context);
        var requestedTenant = targetTenant(scope);
        var requestedTarget = normalizeTenantSlug(scope.targetTenantSlug || scope.targetTenantId || requestedTenant);
        var metadata = {
            role: role,
            routeType: routeType,
            tenantSlug: requestedTenant,
            costAnalyticsAuthority: role === 'PLATFORM_OWNER',
            costGovernanceAuthority: role === 'PLATFORM_OWNER',
            infrastructureOnly: role === 'SUPER_ADMIN',
            tenantIsolationPreserved: true,
            infrastructureCostGovernancePreserved: true,
            platformOwnerTenantRbacIsolation: true,
            salaryVisibility: false,
            leaveBalanceVisibility: false,
            payrollVisibility: false
        };

        if ((normalizeCostState(scope.costState || scope.state) === 'ARCHIVED' || scope.archived === true) && scope.mutationRequested) {
            return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'ARCHIVED_COST_IMMUTABLE', metadata: metadata, failures: [{ message: 'Historical infrastructure cost records are immutable after archival.' }] });
        }

        if (scope.salaryVisibility || scope.leaveBalanceVisibility || scope.payrollVisibility || scope.hrAnalyticsAccess || scope.rawTenantDataAccess || scope.exportConfidentialAnalytics) {
            return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'CONFIDENTIAL_COST_SCOPE_BLOCKED', metadata: metadata, failures: [{ message: 'Cost monitoring cannot expose HR, payroll, salary, leave, or raw tenant data.' }] });
        }

        if (routeType !== 'platform' && role !== 'PLATFORM_OWNER') {
            return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'TENANT_ROUTE_BLOCKED', metadata: metadata, failures: [{ message: 'Platform cost monitoring is isolated to platform-control.' }] });
        }

        if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') {
            return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'ROLE_SCOPE_BLOCKED', metadata: metadata, failures: [{ message: 'Tenant RBAC roles cannot access platform cost intelligence.' }] });
        }

        if (role === 'PLATFORM_OWNER') {
            metadata.infrastructureOnly = false;
            return freezeCostOutput({ allowed: true, success: true, classification: CLASSIFICATIONS.INFO, visibility: VISIBILITY.ISOLATED_PLATFORM_COST_GOVERNANCE, metadata: metadata, warnings: [] });
        }

        if (role === 'SUPER_ADMIN') {
            var anchorTenant = actorTenant || ctxTenant;
            if (requestedTarget && anchorTenant && requestedTarget !== anchorTenant) {
                return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'CROSS_TENANT_COST_TRAVERSAL_BLOCKED', metadata: metadata, failures: [{ message: 'Cross-tenant infrastructure cost traversal is blocked for SUPER_ADMIN.' }] });
            }
            if (!(scope.infrastructureOnly || scope.resourceMonitoring || scope.loadMonitoring || scope.infrastructureMonitoring)) {
                return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'SUPER_ADMIN_COST_AUTHORITY_BLOCKED', metadata: metadata, failures: [{ message: 'SUPER_ADMIN is infrastructure-only and cannot govern tenant cost intelligence.' }] });
            }
            metadata.costAnalyticsAuthority = false;
            metadata.costGovernanceAuthority = false;
            metadata.infrastructureOnly = true;
            return freezeCostOutput({ allowed: true, success: true, classification: CLASSIFICATIONS.INFO, visibility: VISIBILITY.INFRASTRUCTURE_COST_MONITORING_ONLY, metadata: metadata, warnings: [] });
        }

        return freezeCostOutput({ allowed: false, success: false, classification: CLASSIFICATIONS.CRITICAL_BLOCKER, visibility: VISIBILITY.NONE, failureCode: 'COST_SCOPE_BLOCKED', metadata: metadata, failures: [{ message: 'Cost scope blocked safely.' }] });
    }

    function normalizeCostPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return safeFailure('MALFORMED_COST_PAYLOAD', 'Cost payload must be an object.');
            }
            var normalized = {
                costId: safeString(payload.costId || payload.id || 'COST-PREVIEW', 'COST-PREVIEW'),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(context)),
                state: normalizeCostState(payload.state || payload.costState),
                costState: normalizeCostState(payload.state || payload.costState),
                costType: normalizeCostType(payload.costType || payload.type),
                storageCost: Math.max(0, safeNumber(payload.storageCost || payload.storageCostUnits, 0)),
                workflowExecutionCost: Math.max(0, safeNumber(payload.workflowExecutionCost || payload.executionCost, 0)),
                notificationCost: Math.max(0, safeNumber(payload.notificationCost || payload.notificationThroughputCost, 0)),
                deploymentCost: Math.max(0, safeNumber(payload.deploymentCost || payload.deploymentResourceUsage, 0)),
                resourceUnits: Math.max(0, safeNumber(payload.resourceUnits || payload.consumptionUnits, 0)),
                operationalEfficiencyScore: clamp(safeNumber(payload.operationalEfficiencyScore || payload.efficiencyScore, 75), 0, 100),
                optimizationOpportunity: payload.optimizationOpportunity === true || normalizeCostState(payload.state || payload.costState) === 'OPTIMIZATION_REQUIRED',
                costAnomaly: payload.costAnomaly === true || normalizeCostState(payload.state || payload.costState) === 'COST_SPIKE',
                readOnly: true,
                metadata: cloneSanitized(payload.metadata || {}, 'metadata') || {}
            };
            return freezeCostOutput({ success: true, allowed: true, classification: classifyCostRisk(normalized), visibility: VISIBILITY.ISOLATED_PLATFORM_COST_GOVERNANCE, payload: normalized, generatedAt: nowIso() });
        } catch (error) {
            return safeFailure('COST_NORMALIZATION_FAILED', 'Cost payload normalization failed safely.', error && error.message);
        }
    }

    function buildSlices(filters) {
        var data = rawData();
        var tenantSlug = targetTenant(filters || {});
        return {
            data: data,
            tenantSlug: tenantSlug,
            cost: filterTenant(costRows(data), tenantSlug),
            storage: filterTenant(storageRows(data), tenantSlug),
            workflow: filterTenant(workflowRows(data), tenantSlug),
            notification: filterTenant(notificationRows(data), tenantSlug),
            deployment: filterTenant(deploymentRows(data), tenantSlug),
            usage: filterTenant(usageRows(data), tenantSlug),
            billing: filterTenant(billingRows(data), tenantSlug)
        };
    }

    function calculateCostMetrics(slices) {
        var costs = slices.cost || [];
        var storage = slices.storage || [];
        var workflow = slices.workflow || [];
        var notification = slices.notification || [];
        var deployment = slices.deployment || [];
        var usage = slices.usage || [];
        var storageCost = sumBy(costs, ['storageCost', 'storageCostUnits'], function() { return 0; }) + sumBy(storage, ['storageCost', 'costUnits'], function(row) { return Math.round(safeNumber(row && (row.sizeBytes || row.storageGrowthBytes), 0) / 100); });
        var workflowCost = sumBy(costs, ['workflowExecutionCost', 'executionCost'], function() { return 0; }) + sumBy(workflow, ['workflowExecutionCost', 'executionCost'], function(row) { return isFailed(row) ? 4 : 2; });
        var notificationCost = sumBy(costs, ['notificationCost', 'notificationThroughputCost'], function() { return 0; }) + sumBy(notification, ['notificationCost'], function(row) { return isFailed(row) ? 3 : 1; });
        var deploymentCost = sumBy(costs, ['deploymentCost', 'deploymentResourceUsage'], function() { return 0; }) + sumBy(deployment, ['deploymentCost', 'deploymentResourceUsage'], function(row) { return isFailed(row) ? 8 : 4; });
        var explicitUnits = sumBy(costs, ['resourceUnits', 'consumptionUnits'], function() { return 0; });
        var tenantUtilization = Math.max(average(usage, ['executionUtilization', 'operationalDensity', 'tenantResourceUtilization']), average(costs, ['tenantResourceUtilization']));
        var efficiency = average(costs, ['operationalEfficiencyScore', 'efficiencyScore']);
        if (!efficiency) {
            var pressure = Math.min(90, Math.round((storageCost + workflowCost + notificationCost + deploymentCost) / 5));
            efficiency = clamp(100 - pressure, 25, 100);
        }
        var storageAnomalies = countWhere(storage, function(row) {
            return row.suspiciousAccess === true || row.costAnomaly === true || normalizeToken(row.state || row.storageState || row.status).match(/DEGRADED|FAILED|RESTRICTED|HIGH_USAGE/);
        }) + countWhere(costs, function(row) { return row.costAnomaly === true && normalizeCostType(row.costType || row.type) === 'STORAGE_COST'; });
        var workflowOverload = countWhere(workflow, isFailed) + countWhere(costs, function(row) { return safeNumber(row.workflowExecutionCost || row.executionCost, 0) >= 50; });
        var notificationSpikes = countWhere(notification, isFailed) + countWhere(costs, function(row) { return safeNumber(row.notificationCost || row.notificationThroughputCost, 0) >= 30; });
        var deploymentCongestion = countWhere(deployment, isFailed) + countWhere(costs, function(row) { return safeNumber(row.deploymentCost || row.deploymentResourceUsage, 0) >= 25; });
        var infrastructureSpikes = countWhere(costs, function(row) {
            var state = rowState(row);
            return state === 'COST_SPIKE' || state === 'HIGH_USAGE' || row.costAnomaly === true || safeNumber(row.resourceUnits, 0) >= 200;
        });
        var optimizationOpportunities = countWhere(costs, function(row) {
            return row.optimizationOpportunity === true || rowState(row) === 'OPTIMIZATION_REQUIRED' || safeNumber(row.operationalEfficiencyScore || row.efficiencyScore, 100) < 60;
        }) + (efficiency < 60 ? 1 : 0);
        var totalCost = Math.round(storageCost + workflowCost + notificationCost + deploymentCost + explicitUnits);
        return {
            storageCost: Math.round(storageCost),
            workflowExecutionCost: Math.round(workflowCost),
            notificationCost: Math.round(notificationCost),
            deploymentCost: Math.round(deploymentCost),
            resourceUnits: Math.round(explicitUnits || totalCost),
            infrastructureCostTotal: totalCost,
            infrastructureGrowth: totalCost,
            workflowEvents: workflow.length,
            workflowFailures: countWhere(workflow, isFailed),
            notificationFailures: countWhere(notification, isFailed),
            failedJobs: countWhere(deployment, isFailed),
            storageGrowthBytes: Math.round(sumBy(storage, ['sizeBytes', 'storageGrowthBytes'], function() { return 0; })),
            quotaUtilization: clamp(Math.max(average(storage, ['quotaUtilization']), Math.round(sumBy(storage, ['sizeBytes', 'storageGrowthBytes'], function() { return 0; }) / 100)), 0, 100),
            tenantResourceUtilization: clamp(tenantUtilization || Math.round(totalCost / 10), 0, 100),
            operationalEfficiencyScore: clamp(efficiency, 0, 100),
            storageCostAnomalies: storageAnomalies,
            workflowExecutionOverload: workflowOverload,
            notificationConsumptionSpikes: notificationSpikes,
            deploymentResourceCongestion: deploymentCongestion,
            infrastructureSpikes: infrastructureSpikes,
            optimizationOpportunities: optimizationOpportunities,
            costAnomalies: infrastructureSpikes + storageAnomalies + workflowOverload
        };
    }

    function detectInfrastructureAnomalies(filters, context) {
        try {
            var validation = validateCostScope(filters || {}, context || { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            if (!validation.allowed) return validation;
            var slices = buildSlices(filters || {});
            var metrics = calculateCostMetrics(slices);
            var summary = {
                infrastructureSpikes: metrics.infrastructureSpikes,
                storageCostAnomalies: metrics.storageCostAnomalies,
                workflowExecutionOverload: metrics.workflowExecutionOverload,
                notificationConsumptionSpikes: metrics.notificationConsumptionSpikes,
                deploymentResourceCongestion: metrics.deploymentResourceCongestion,
                optimizationOpportunities: metrics.optimizationOpportunities,
                costAnomalies: metrics.costAnomalies
            };
            var classification = classifyCostRisk(summary);
            return freezeCostOutput({
                success: true,
                allowed: true,
                classification: classification,
                visibility: validation.visibility,
                tenantSlug: slices.tenantSlug || '',
                summary: summary,
                healthSignals: [
                    { signal: 'Infrastructure Spikes', count: summary.infrastructureSpikes, classification: summary.infrastructureSpikes ? CLASSIFICATIONS.HIGH_RISK : CLASSIFICATIONS.INFO },
                    { signal: 'Storage Cost Anomalies', count: summary.storageCostAnomalies, classification: summary.storageCostAnomalies ? CLASSIFICATIONS.HIGH_RISK : CLASSIFICATIONS.INFO },
                    { signal: 'Workflow Execution Overload', count: summary.workflowExecutionOverload, classification: summary.workflowExecutionOverload ? CLASSIFICATIONS.HIGH_RISK : CLASSIFICATIONS.INFO },
                    { signal: 'Optimization Opportunities', count: summary.optimizationOpportunities, classification: summary.optimizationOpportunities ? CLASSIFICATIONS.WARNING : CLASSIFICATIONS.INFO }
                ],
                generatedAt: nowIso()
            });
        } catch (error) {
            return safeFailure('COST_ANOMALY_DETECTION_FAILED', 'Infrastructure anomaly detection failed safely.', error && error.message);
        }
    }

    function integrationHealth() {
        return {
            tenantUsageIntegrated: !!(global.TenantUsageIntelligenceService || global.tenantUsageIntelligenceService),
            tenantBillingIntegrated: !!(global.TenantBillingService || global.tenantBillingService),
            platformAnalyticsIntegrated: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
            storageAnalyticsIntegrated: !!(global.StorageAnalyticsService || global.storageAnalyticsService || global.StorageHardeningService || global.storageHardeningService),
            workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
            auditReady: !!(global.AuditService || global.auditService),
            telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
            metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService),
            anomalyDetectionReady: true
        };
    }

    function buildCostSummaries(costs, metrics, classification) {
        var rows = costs.length ? costs : [{
            costId: 'COST-AGGREGATE',
            tenantSlug: '',
            costState: metrics.infrastructureSpikes ? 'COST_SPIKE' : (metrics.optimizationOpportunities ? 'OPTIMIZATION_REQUIRED' : 'MONITORING'),
            costType: 'INFRASTRUCTURE_CONSUMPTION',
            storageCost: metrics.storageCost,
            workflowExecutionCost: metrics.workflowExecutionCost,
            notificationCost: metrics.notificationCost,
            deploymentCost: metrics.deploymentCost,
            resourceUnits: metrics.resourceUnits,
            operationalEfficiencyScore: metrics.operationalEfficiencyScore
        }];
        return rows.slice(0, 12).map(function(row) {
            return {
                costId: safeString(row.costId || row.id || 'COST-SUMMARY', 'COST-SUMMARY'),
                tenantSlug: rowTenant(row) || 'aggregate',
                costState: normalizeCostState(row.costState || row.state),
                costType: normalizeCostType(row.costType || row.type),
                classification: classifyCostRisk(row),
                storageCost: Math.round(safeNumber(row.storageCost, 0)),
                workflowExecutionCost: Math.round(safeNumber(row.workflowExecutionCost || row.executionCost, 0)),
                notificationCost: Math.round(safeNumber(row.notificationCost, 0)),
                deploymentCost: Math.round(safeNumber(row.deploymentCost || row.deploymentResourceUsage, 0)),
                resourceUnits: Math.round(safeNumber(row.resourceUnits || row.consumptionUnits, 0)),
                operationalEfficiencyScore: clamp(safeNumber(row.operationalEfficiencyScore || row.efficiencyScore, metrics.operationalEfficiencyScore), 0, 100)
            };
        });
    }

    function recordAuditAndTelemetry(report, context) {
        context = context || {};
        var data = rawData();
        var timestamp = nowIso();
        if (context.skipAuditPersistence !== true) {
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.push({
                id: 'AUD-PLATFORM-COST-' + timestamp,
                action: 'PLATFORM_COST_MONITORING_ACCESS',
                eventType: 'PLATFORM_COST_GOVERNANCE',
                type: 'PLATFORM_COST_MONITORING',
                actorRole: normalizeRole(context.actor && context.actor.role),
                tenantSlug: report.costGovernanceModel && report.costGovernanceModel.tenantSlug || '',
                classification: report.classification,
                createdAt: timestamp
            });
        }
        if (context.skipTelemetry !== true) {
            data.workflowTelemetry = Array.isArray(data.workflowTelemetry) ? data.workflowTelemetry : [];
            data.workflowTelemetry.push({
                id: 'WT-PLATFORM-COST-' + timestamp,
                eventType: 'PLATFORM_COST_MONITORING',
                metricType: 'PLATFORM_COST_GOVERNANCE',
                tenantSlug: report.costGovernanceModel && report.costGovernanceModel.tenantSlug || '',
                classification: report.classification,
                createdAt: timestamp
            });
        }
        if (context.skipMetrics !== true) {
            data.orchestrationMetrics = Array.isArray(data.orchestrationMetrics) ? data.orchestrationMetrics : [];
            data.orchestrationMetrics.push({
                id: 'MET-PLATFORM-COST-' + timestamp,
                metric: 'platform_cost_monitoring',
                metricType: 'platform_cost_governance',
                value: report.infrastructureAnalytics && report.infrastructureAnalytics.infrastructureCostTotal || 0,
                tenantSlug: report.costGovernanceModel && report.costGovernanceModel.tenantSlug || '',
                createdAt: timestamp
            });
        }
        saveData(data);
    }

    function generatePlatformCostReport(filters, context) {
        try {
            filters = filters || {};
            context = context || {};
            var validation = validateCostScope(filters, context);
            if (!validation.allowed) return validation;
            var slices = buildSlices(filters);
            var metrics = calculateCostMetrics(slices);
            var states = slices.cost.reduce(function(map, row) {
                var state = rowState(row);
                map[state] = (map[state] || 0) + 1;
                return map;
            }, {});
            var anomalyReport = detectInfrastructureAnomalies(filters, Object.assign({}, context, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var classification = highestClassification([classifyCostRisk(metrics), anomalyReport.classification || CLASSIFICATIONS.INFO]);
            var role = normalizeRole(context.actor && context.actor.role || context.role);
            var access = baseAccessGovernance(true, role);
            access.costAnalyticsAuthority = role === 'PLATFORM_OWNER';
            access.costGovernanceAuthority = role === 'PLATFORM_OWNER';
            access.superAdminInfrastructureOnly = role === 'SUPER_ADMIN';
            var report = {
                VERSION: VERSION,
                success: true,
                allowed: true,
                readOnly: true,
                aggregateOnly: filters.aggregateOnly !== false,
                infrastructureOnly: role === 'SUPER_ADMIN' || filters.infrastructureOnly === true,
                classification: classification,
                visibility: validation.visibility,
                generatedAt: nowIso(),
                costGovernanceModel: {
                    state: normalizeCostState(filters.costState || filters.state || (metrics.infrastructureSpikes ? 'COST_SPIKE' : (metrics.optimizationOpportunities ? 'OPTIMIZATION_REQUIRED' : 'MONITORING'))),
                    states: COST_STATES.slice(),
                    costTypes: COST_TYPES.slice(),
                    tenantSlug: slices.tenantSlug || '',
                    costType: normalizeCostType(filters.costType || filters.type),
                    historicalCostRecordsImmutable: true,
                    platformIsolationPreserved: true
                },
                platformCostSummary: {
                    totalCostRecords: slices.cost.length,
                    activeCostRecords: countWhere(slices.cost, function(row) { return rowState(row) !== 'ARCHIVED'; }),
                    highUsageSignals: states.HIGH_USAGE || 0,
                    costSpikes: states.COST_SPIKE || metrics.infrastructureSpikes,
                    degradedSignals: states.DEGRADED || 0,
                    optimizationRequired: states.OPTIMIZATION_REQUIRED || metrics.optimizationOpportunities,
                    alertedSignals: states.ALERTED || 0,
                    archivedSignals: states.ARCHIVED || 0
                },
                infrastructureAnalytics: {
                    infrastructureCostTotal: metrics.infrastructureCostTotal,
                    infrastructureGrowth: metrics.infrastructureGrowth,
                    resourceUnits: metrics.resourceUnits,
                    infrastructureSpikes: metrics.infrastructureSpikes,
                    deploymentResourceUsage: metrics.deploymentCost,
                    deploymentResourceCongestion: metrics.deploymentResourceCongestion,
                    operationalEfficiencyIndicators: metrics.operationalEfficiencyScore
                },
                storageWorkflowIntegration: {
                    storageCost: metrics.storageCost,
                    storageCostSignals: slices.storage.length,
                    storageCostAnomalies: metrics.storageCostAnomalies,
                    storageGrowthBytes: metrics.storageGrowthBytes,
                    quotaUtilization: metrics.quotaUtilization,
                    workflowExecutionCost: metrics.workflowExecutionCost,
                    workflowEvents: metrics.workflowEvents,
                    workflowFailures: metrics.workflowFailures,
                    workflowExecutionOverload: metrics.workflowExecutionOverload,
                    workflowCostIntegrated: integrationHealth().workflowTelemetryIntegrated,
                    storageCostIntegrated: integrationHealth().storageAnalyticsIntegrated
                },
                resourceEfficiency: {
                    operationalEfficiencyScore: metrics.operationalEfficiencyScore,
                    tenantResourceUtilization: metrics.tenantResourceUtilization,
                    resourcePressure: metrics.tenantResourceUtilization >= 80 || metrics.operationalEfficiencyScore < 60,
                    optimizationOpportunities: metrics.optimizationOpportunities,
                    optimizationRecommendations: metrics.optimizationOpportunities ? [
                        { signal: 'Storage Growth Review', classification: metrics.storageCostAnomalies ? CLASSIFICATIONS.HIGH_RISK : CLASSIFICATIONS.INFO, count: metrics.storageCostAnomalies },
                        { signal: 'Workflow Execution Cost Review', classification: metrics.workflowExecutionOverload ? CLASSIFICATIONS.HIGH_RISK : CLASSIFICATIONS.INFO, count: metrics.workflowExecutionOverload },
                        { signal: 'Deployment Resource Tuning', classification: metrics.deploymentResourceCongestion ? CLASSIFICATIONS.WARNING : CLASSIFICATIONS.INFO, count: metrics.deploymentResourceCongestion }
                    ] : [],
                    resourceOptimizationVisible: true
                },
                costIntelligence: {
                    anomalyAlerts: metrics.costAnomalies,
                    infrastructureAnomalies: anomalyReport.summary || {},
                    usageLinkedCostGrowth: slices.usage.length,
                    tenantUsagePressure: countWhere(slices.usage, function(row) { return normalizeToken(row.usageState || row.state).match(/HIGH|SPIKE|DEGRADED/); }),
                    billingUsageIntegration: slices.billing.length,
                    notificationCost: metrics.notificationCost,
                    notificationConsumptionSpikes: metrics.notificationConsumptionSpikes,
                    deploymentCost: metrics.deploymentCost,
                    costAnomalies: metrics.costAnomalies
                },
                accessGovernance: access,
                integrationHealth: integrationHealth(),
                governanceDashboard: {
                    platformHealthSignals: metrics.infrastructureSpikes + metrics.storageCostAnomalies + metrics.workflowExecutionOverload,
                    storageCostAnomalies: metrics.storageCostAnomalies,
                    workflowExecutionOverload: metrics.workflowExecutionOverload,
                    optimizationOpportunities: metrics.optimizationOpportunities,
                    notificationConsumptionSpikes: metrics.notificationConsumptionSpikes
                },
                healthSignals: anomalyReport.healthSignals || [],
                costSummaries: role === 'SUPER_ADMIN' ? [] : buildCostSummaries(slices.cost, metrics, classification)
            };
            var frozen = freezeCostOutput(report);
            recordAuditAndTelemetry(frozen, context);
            return frozen;
        } catch (error) {
            return safeFailure('PLATFORM_COST_REPORT_FAILED', 'Platform cost report failed safely.', error && error.message);
        }
    }

    function runSelfTest() {
        var tests = [];
        function record(name, ok, details) {
            tests.push({ name: name, ok: ok === true, details: details || null });
        }
        try {
            var malformed = normalizeCostPayload(null, { actor: { role: 'PLATFORM_OWNER' } });
            record('malformed payloads fail safely', malformed.success === false, malformed);
            var payload = { state: 'cost spike', costType: 'storage', tenantSlug: 'Tenant_A', salary: 1, metadata: { rawDocumentPath: 'private://raw' } };
            var before = JSON.stringify(payload);
            var normalized = normalizeCostPayload(payload, { actor: { role: 'PLATFORM_OWNER' } });
            record('normalization is immutable and sanitized', normalized.success === true && JSON.stringify(payload) === before && Object.isFrozen(normalized), normalized);
            var blocked = validateCostScope({ salaryVisibility: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN' } });
            record('SUPER_ADMIN HR payroll visibility blocked', blocked.allowed === false, blocked);
            var tenantBlocked = validateCostScope({ tenantSlug: 'tenant-a' }, { routeType: 'tenant', actor: { role: 'HR', tenantSlug: 'tenant-a' } });
            record('tenant isolation blocks tenant route access', tenantBlocked.allowed === false, tenantBlocked);
            var archived = validateCostScope({ costState: 'ARCHIVED', mutationRequested: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            record('historical archived cost mutation blocked', archived.allowed === false, archived);
            var frozen = freezeCostOutput({ salary: 1, nested: { leaveBalance: 2, safeCount: 3 } });
            record('outputs are immutable and confidential fields removed', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && frozen.nested.safeCount === 3 && typeof frozen.salary === 'undefined', frozen);
            var savedUsage = global.TenantUsageIntelligenceService;
            var savedUsageAlias = global.tenantUsageIntelligenceService;
            var savedBilling = global.TenantBillingService;
            var savedBillingAlias = global.tenantBillingService;
            var savedStorage = global.StorageHardeningService;
            var savedStorageAlias = global.storageHardeningService;
            var savedAnalytics = global.PlatformAnalyticsService;
            var savedAnalyticsAlias = global.platformAnalyticsService;
            global.TenantUsageIntelligenceService = undefined;
            global.tenantUsageIntelligenceService = undefined;
            global.TenantBillingService = undefined;
            global.tenantBillingService = undefined;
            global.StorageHardeningService = undefined;
            global.storageHardeningService = undefined;
            global.PlatformAnalyticsService = undefined;
            global.platformAnalyticsService = undefined;
            var degraded = generatePlatformCostReport({ tenantSlug: 'tenant-a' }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.tenantUsageIntegrated === false && degraded.integrationHealth.tenantBillingIntegrated === false && degraded.integrationHealth.storageAnalyticsIntegrated === false && degraded.integrationHealth.platformAnalyticsIntegrated === false, degraded.integrationHealth);
            global.TenantUsageIntelligenceService = savedUsage;
            global.tenantUsageIntelligenceService = savedUsageAlias;
            global.TenantBillingService = savedBilling;
            global.tenantBillingService = savedBillingAlias;
            global.StorageHardeningService = savedStorage;
            global.storageHardeningService = savedStorageAlias;
            global.PlatformAnalyticsService = savedAnalytics;
            global.platformAnalyticsService = savedAnalyticsAlias;
        } catch (error) {
            record('self-test exception isolation', false, error && error.message);
        }
        return Object.freeze({ passed: tests.every(function(test) { return test.ok; }), tests: tests });
    }

    var PlatformCostMonitoringService = Object.freeze({
        VERSION: VERSION,
        COST_STATES: COST_STATES,
        COST_TYPES: COST_TYPES,
        CLASSIFICATIONS: CLASSIFICATIONS,
        validateCostScope: validateCostScope,
        classifyCostRisk: classifyCostRisk,
        normalizeCostPayload: normalizeCostPayload,
        freezeCostOutput: freezeCostOutput,
        detectInfrastructureAnomalies: detectInfrastructureAnomalies,
        generatePlatformCostReport: generatePlatformCostReport,
        runSelfTest: runSelfTest
    });

    global.PlatformCostMonitoringService = PlatformCostMonitoringService;
    global.platformCostMonitoringService = PlatformCostMonitoringService;

    if (global.__ARTHHRMS_DEV__) {
        var result = runSelfTest();
        global.__ARTHHRMS_PLATFORM_COST_SELF_TEST__ = result;
        try {
            if (global.console && typeof global.console.info === 'function') {
                global.console.info(PREFIX, 'Development self-test ' + (result.passed ? 'passed.' : 'failed.'), result);
            }
        } catch (error) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
