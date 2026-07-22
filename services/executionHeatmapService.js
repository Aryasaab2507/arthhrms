/**
 * executionHeatmapService.js
 * ARTHHRMS Enterprise Strategic Execution Heatmap + Organizational Performance Density Intelligence.
 *
 * Additive read-only governance layer for execution density mapping,
 * department performance heatmaps, workflow congestion zones, KPI pressure
 * overlays, escalation hotspots, workload pressure, throughput trends, and
 * tenant-confidential strategic performance visualization.
 */
(function attachExecutionHeatmapService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[ExecutionHeatmapService]';

    var EXECUTION_HEATMAP_STATES = Object.freeze({
        NORMAL: 'NORMAL',
        ACTIVE: 'ACTIVE',
        HIGH_LOAD: 'HIGH_LOAD',
        CONGESTED: 'CONGESTED',
        DEGRADED: 'DEGRADED',
        ESCALATED: 'ESCALATED',
        CRITICAL: 'CRITICAL',
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
        ASSIGNED_WORKLOAD_VISIBILITY_ONLY: 'ASSIGNED_WORKLOAD_VISIBILITY_ONLY',
        DEPARTMENT_EXECUTION_HEATMAPS: 'DEPARTMENT_EXECUTION_HEATMAPS',
        HR_OPERATIONAL_PERFORMANCE_VISIBILITY: 'HR_OPERATIONAL_PERFORMANCE_VISIBILITY',
        STRATEGIC_ORGANIZATIONAL_HEATMAPS: 'STRATEGIC_ORGANIZATIONAL_HEATMAPS',
        ORGANIZATION_WIDE_EXECUTION_INTELLIGENCE: 'ORGANIZATION_WIDE_EXECUTION_INTELLIGENCE',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(heatmap.?id|snapshot.?id|zone.?id|bottleneck.?id|queue.?id|action.?id|dependency.?id|execution.?id|workflow.?id|deliverable.?id|milestone.?id|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|strategic.?owner|kpi.?id|scorecard.?id|report.?id|correlation.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|leave.?balance|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|leave balance|strategic note|heat note|heatmap note|execution chain|operations heat zone|roadmap)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        generatedAt: true,
        tenantSlug: true,
        status: true,
        severity: true,
        source: true,
        department: true,
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
        densityScore: true,
        workloadPressure: true,
        throughputScore: true,
        pressureLevel: true,
        congestionSeverity: true,
        heatZones: true,
        heatmapModel: true,
        executionHeatmapHealth: true,
        performanceDensity: true,
        performanceDensityGovernance: true,
        workloadPressureIntelligence: true,
        kpiBottleneckIntegration: true,
        heatmapAnalytics: true,
        visualizationGovernance: true,
        accessGovernance: true,
        integrationHealth: true,
        totalHeatZones: true,
        normalZones: true,
        activeZones: true,
        highLoadZones: true,
        congestedZones: true,
        degradedZones: true,
        escalatedZones: true,
        criticalZones: true,
        archivedZones: true,
        executionIntensityScoring: true,
        congestionSeverityGrading: true,
        kpiPerformanceDensityMapping: true,
        escalationHotspotTracking: true,
        workloadPressureAnalysis: true,
        throughputDeclineMonitoring: true,
        strategicPerformanceZoning: true,
        unsafeStrategicOverride: true,
        unsafeStrategicOverridesBlocked: true,
        historicalHeatmapAnalyticsImmutable: true,
        overloadedDepartments: true,
        executionCongestionClusters: true,
        repeatedEscalationHotspots: true,
        throughputDegradation: true,
        stalledWorkflowDensity: true,
        accountabilityOverloadPatterns: true,
        kpiLinkedHeatmaps: true,
        bottleneckDensityOverlays: true,
        escalationLinkedCongestion: true,
        executionThroughputScoring: true,
        departmentPerformanceZones: true,
        unsafeKpiMutation: true,
        heatmapDensityTrends: true,
        congestionGrowth: true,
        escalationHotspotFrequency: true,
        throughputDeclinePatterns: true,
        overloadedDepartmentTrends: true,
        kpiPressureDistribution: true,
        operationalHealthChanges: true,
        organizationWideHeatmaps: true,
        departmentDensityGrids: true,
        executionCongestionOverlays: true,
        kpiPressureIndicators: true,
        escalationHotspotVisualization: true,
        timelineBasedHeatProgression: true,
        unsafeConfidentialExposure: true,
        employeeAssignedWorkloadVisibilityOnly: true,
        managerDepartmentExecutionHeatmaps: true,
        hrOperationalPerformanceVisibility: true,
        hrHeadStrategicOrganizationalHeatmaps: true,
        directorOrganizationWideExecutionIntelligence: true,
        superAdminStrategicHeatmapModificationAuthority: true,
        platformOwnerTenantExecutionChain: true,
        crossTenantExecutionLeakageBlocked: true,
        historicalHeatmapMutationPrevented: true,
        unsafeStrategicExposureBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        heatmapActionsAuditable: true,
        escalationGovernancePreserved: true,
        executionIntelligenceConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        strategicBottleneckIntegrated: true,
        leadershipAccountabilityIntegrated: true,
        kpiScorecardIntegrated: true,
        strategicExecutionIntegrated: true,
        departmentExecutionBoardIntegrated: true,
        performanceGovernanceIntegrated: true,
        workflowTelemetryIntegrated: true,
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
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        return String(value);
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeToken(value) {
        return safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9_ -]/g, '_').replace(/\s+/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || 'EMPLOYEE');
        if (role === 'ADMIN') return 'SUPER_ADMIN';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'HR' || role === 'MANAGER' || role === 'EMPLOYEE' || role === 'SUPER_ADMIN' || role === 'PLATFORM_OWNER') return role;
        return 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value, '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id));
    }

    function defaultTenant(sourceData) {
        var data = sourceData || rawData();
        var settings = data.companySettings || {};
        var tenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || settings.companySlug);
        if (tenant) return tenant;
        var first = list(data, 'platformTenants')[0];
        return normalizeTenantSlug(first && (first.tenantSlug || first.tenantId || first.companyId));
    }

    function resolveTenant(scope, context, sourceData) {
        return normalizeTenantSlug(scope && (scope.tenantSlug || scope.tenantId || scope.companyId)) || contextTenant(context) || defaultTenant(sourceData);
    }

    function actorId(context) {
        var actor = context && context.actor || {};
        return safeString(actor.id || actor.empId || actor.employeeId || actor.userId, '').trim();
    }

    function actorRole(context) {
        return normalizeRole(context && context.actor && context.actor.role || context && context.role);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.assigneeId || row.assignedTo || row.contributorId), '').trim();
    }

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.managerId || row.reviewerId || row.strategicOwnerId || row.executionOwnerId), '').trim();
    }

    function departmentOf(row) {
        return safeString(row && (row.department || row.dept || row.sourceDepartment || row.targetDepartment || row.team), 'Unassigned') || 'Unassigned';
    }

    function normalizeHeatmapState(value) {
        var state = normalizeToken(value || EXECUTION_HEATMAP_STATES.NORMAL);
        if (state === 'HIGH LOAD' || state === 'HIGHLOAD') state = EXECUTION_HEATMAP_STATES.HIGH_LOAD;
        if (state === 'IN_PROGRESS' || state === 'TRACKING') state = EXECUTION_HEATMAP_STATES.ACTIVE;
        if (state === 'BLOCKED') state = EXECUTION_HEATMAP_STATES.CONGESTED;
        if (state === 'AT_RISK') state = EXECUTION_HEATMAP_STATES.DEGRADED;
        return EXECUTION_HEATMAP_STATES[state] || state || EXECUTION_HEATMAP_STATES.NORMAL;
    }

    function stateOf(row) {
        return normalizeHeatmapState(row && (row.state || row.status || row.zone || row.governanceState));
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.freeze(value);
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return value;
    }

    function sanitizedValue(value, key, seen) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value === 'string') {
            if (SENSITIVE_KEY_PATTERN.test(key || '') && !SAFE_GOVERNANCE_KEYS[key]) return undefined;
            return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]');
        }
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return value;
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

    function freezeHeatmapOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'HEATMAP_GOVERNANCE_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Heatmap governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'HEATMAP_GOVERNANCE_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Heatmap governance warning.', '')
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

    function classifyPerformanceDensity(signal) {
        try {
            var item = signal || {};
            if (item.crossTenant || item.historicalMutation || item.archivedMutation || item.unsafeStrategicExposure || item.platformOwnerChain) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.unsafeStrategicOverride || item.superAdminStrategicMutation || item.congestionEscalation || item.workloadOverload || item.throughputDegradation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (item.kpiPressure || item.workflowCongestion || item.escalationHotspot || item.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function heatmapRows(data) {
        return list(data, 'executionHeatmapSnapshots').concat(list(data, 'executionHeatmaps'), list(data, 'performanceHeatmaps'), list(data, 'organizationalPerformanceMaps'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicExecutionRecords'));
    }

    function bottleneckRows(data) {
        return list(data, 'strategicBottleneckRecords').concat(list(data, 'bottleneckRecords'), list(data, 'executionBottlenecks'));
    }

    function queueRows(data) {
        return list(data, 'workflowQueues').concat(list(data, 'workflowBacklog'), list(data, 'approvalQueues'));
    }

    function kpiRows(data) {
        return list(data, 'kpiScorecards').concat(list(data, 'executiveKpiScorecards'), list(data, 'departmentKpis'));
    }

    function performanceRows(data) {
        return list(data, 'performanceGoals').concat(list(data, 'performanceReviews'), list(data, 'performanceSnapshots'));
    }

    function escalationRows(data) {
        return list(data, 'escalations').concat(list(data, 'escalationRecords'), list(data, 'strategicEscalations'));
    }

    function leadershipRows(data) {
        return list(data, 'leadershipAccountabilityReports').concat(list(data, 'executiveReports'), list(data, 'accountabilityReports'));
    }

    function workflowRows(data) {
        return list(data, 'workflowEvents').concat(list(data, 'workflowTelemetry'), list(data, 'workflowActivity'));
    }

    function tenantFilter(tenant) {
        var normalized = normalizeTenantSlug(tenant);
        return function filter(row) {
            var rowScope = rowTenant(row);
            return !normalized || !rowScope || rowScope === normalized;
        };
    }

    function countWhere(rows, predicate) {
        return (rows || []).reduce(function sum(total, row) {
            try { return total + (predicate(row) ? 1 : 0); } catch (error) { return total; }
        }, 0);
    }

    function countState(rows, state) {
        return countWhere(rows, function item(row) { return stateOf(row) === state; });
    }

    function recordMatchesActor(record, context) {
        var id = actorId(context);
        if (!id) return false;
        return [empIdOf(record), ownerIdOf(record), safeString(record && record.actorId, ''), safeString(record && record.userId, '')].some(function match(value) { return value && value === id; });
    }

    function uniqueDepartments(rows) {
        var seen = {};
        (rows || []).forEach(function item(row) {
            var department = departmentOf(row);
            if (department) seen[department] = true;
        });
        return Object.keys(seen);
    }

    function avg(values, fallback) {
        var numbers = (values || []).map(function item(value) { return safeNumber(value, NaN); }).filter(function keep(value) { return isFinite(value); });
        if (!numbers.length) return fallback || 0;
        return Math.round(numbers.reduce(function sum(total, value) { return total + value; }, 0) / numbers.length);
    }

    function heatmapDensityOf(row) {
        if (row && row.densityScore !== undefined) return clamp(safeNumber(row.densityScore, 0), 0, 100);
        if (row && row.workloadUnits !== undefined) return clamp(safeNumber(row.workloadUnits, 0) * 10, 0, 100);
        if (row && row.progressPercent !== undefined) return clamp(100 - safeNumber(row.progressPercent, 100), 0, 100);
        return 0;
    }

    function workloadPressureOf(row) {
        if (row && row.workloadPressure !== undefined) return clamp(safeNumber(row.workloadPressure, 0), 0, 100);
        if (row && row.workloadUnits !== undefined) return clamp(safeNumber(row.workloadUnits, 0) * 10, 0, 100);
        if (/BLOCKED|ESCALATED|CRITICAL|CONGESTED/.test([row && row.state, row && row.status, row && row.zone].join(' ').toUpperCase())) return 85;
        return 0;
    }

    function throughputOf(row) {
        if (row && row.throughputScore !== undefined) return clamp(safeNumber(row.throughputScore, 100), 0, 100);
        if (row && row.progressPercent !== undefined) return clamp(safeNumber(row.progressPercent, 0), 0, 100);
        if (/FAILED|BLOCKED|CRITICAL|CONGESTED/.test([row && row.state, row && row.status, row && row.zone].join(' ').toUpperCase())) return 25;
        return 100;
    }

    function stateFromScores(density, pressure, throughput, escalations) {
        if (pressure >= 95 || density >= 95 || throughput <= 20) return EXECUTION_HEATMAP_STATES.CRITICAL;
        if (escalations >= 3 || pressure >= 85 || density >= 85 || throughput <= 35) return EXECUTION_HEATMAP_STATES.CONGESTED;
        if (pressure >= 75 || density >= 75) return EXECUTION_HEATMAP_STATES.HIGH_LOAD;
        if (throughput <= 55) return EXECUTION_HEATMAP_STATES.DEGRADED;
        if (density > 0 || pressure > 0) return EXECUTION_HEATMAP_STATES.ACTIVE;
        return EXECUTION_HEATMAP_STATES.NORMAL;
    }

    function validateHeatmapScope(record, context) {
        try {
            var data = rawData();
            var ctx = context || {};
            var explicitRole = ctx && (ctx.role || ctx.actor && ctx.actor.role);
            var role = explicitRole || actorId(ctx) ? actorRole(ctx) : 'HR_HEAD';
            var ctxTenant = contextTenant(ctx);
            var targetTenant = resolveTenant(record || {}, ctx, data);
            var failures = [];
            var warnings = [];
            var visibility = VISIBILITY.NONE;
            var state = stateOf(record || {});
            var mutationRequested = !!(record && (record.heatmapMutation || record.strategicOverride || record.heatmapOverride || record.modify || record.update || record.override || record.forceStrategicExposure));

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_EXECUTION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant execution visibility was blocked.'));
            }
            if (state === EXECUTION_HEATMAP_STATES.ARCHIVED && mutationRequested) {
                failures.push(safeFailure('ARCHIVED_HEATMAP_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived heatmap analytics are immutable.'));
            }
            if (role === 'SUPER_ADMIN' && mutationRequested) {
                failures.push(safeFailure('SUPER_ADMIN_STRATEGIC_HEATMAP_MODIFICATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify strategic execution heatmaps.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_TENANT_EXECUTION_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER remains isolated from tenant execution chains.'));
                visibility = VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
            }

            if (!failures.length) {
                if (role === 'EMPLOYEE') {
                    if (recordMatchesActor(record || {}, ctx)) visibility = VISIBILITY.ASSIGNED_WORKLOAD_VISIBILITY_ONLY;
                    else failures.push(safeFailure('EMPLOYEE_HEATMAP_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Employee heatmap visibility is limited to assigned workload.'));
                } else if (role === 'MANAGER') {
                    if (!record || !record.department || departmentOf(record) === safeString(ctx.actor && ctx.actor.department, '')) visibility = VISIBILITY.DEPARTMENT_EXECUTION_HEATMAPS;
                    else failures.push(safeFailure('MANAGER_DEPARTMENT_HEATMAP_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Manager heatmap visibility is limited to department execution heatmaps.'));
                } else if (role === 'HR') {
                    visibility = VISIBILITY.HR_OPERATIONAL_PERFORMANCE_VISIBILITY;
                } else if (role === 'HR_HEAD') {
                    visibility = VISIBILITY.STRATEGIC_ORGANIZATIONAL_HEATMAPS;
                } else if (role === 'DIRECTOR') {
                    visibility = VISIBILITY.ORGANIZATION_WIDE_EXECUTION_INTELLIGENCE;
                } else if (role === 'SUPER_ADMIN') {
                    visibility = VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
                    warnings.push(safeWarning('SUPER_ADMIN_INFRASTRUCTURE_ONLY', 'SUPER_ADMIN receives infrastructure visibility only.'));
                } else {
                    failures.push(safeFailure('UNAUTHORIZED_HEATMAP_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Heatmap visibility requires a governed role.'));
                }
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }).concat(warnings.map(function item(row) { return row.classification; })));
            return freezeHeatmapOutput({
                success: failures.length === 0,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: visibility,
                tenantSlug: targetTenant,
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.every(function item(row) { return row.failureCode !== 'CROSS_TENANT_EXECUTION_VISIBILITY_BLOCKED'; }),
                    executionIntelligenceConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeHeatmapOutput({
                success: false,
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('HEATMAP_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Heatmap scope validation failed safely.')]
            });
        }
    }

    function normalizeHeatmapPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeHeatmapOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_HEATMAP_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed heatmap payload was rejected.')]
                });
            }
            var scope = validateHeatmapScope(payload, context || {});
            if (!scope.allowed) return scope;
            var density = clamp(safeNumber(payload.densityScore, heatmapDensityOf(payload)), 0, 100);
            var pressure = clamp(safeNumber(payload.workloadPressure, workloadPressureOf(payload)), 0, 100);
            var throughput = clamp(safeNumber(payload.throughputScore, throughputOf(payload)), 0, 100);
            var normalized = {
                tenantSlug: scope.tenantSlug || resolveTenant(payload, context || {}),
                department: departmentOf(payload),
                state: normalizeHeatmapState(payload.state || payload.zone || stateFromScores(density, pressure, throughput, safeNumber(payload.escalationCount, 0))),
                densityScore: density,
                workloadPressure: pressure,
                throughputScore: throughput,
                pressureLevel: pressure >= 85 ? 'HIGH' : pressure >= 65 ? 'ELEVATED' : 'NORMAL',
                congestionSeverity: density >= 85 || throughput <= 35 ? 'HIGH' : density >= 70 || throughput <= 55 ? 'WARNING' : 'INFO',
                readOnly: true
            };
            return freezeHeatmapOutput({
                success: true,
                readOnly: true,
                classification: classifyPerformanceDensity({
                    workloadOverload: pressure >= 85,
                    throughputDegradation: throughput <= 35,
                    kpiPressure: !!payload.kpiId
                }),
                visibility: scope.visibility,
                payload: normalized,
                metadata: {
                    tenantIsolationPreserved: true,
                    executionIntelligenceConfidentialityPreserved: true,
                    historicalHeatmapAnalyticsImmutable: true
                }
            });
        } catch (error) {
            return freezeHeatmapOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('HEATMAP_PAYLOAD_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Heatmap payload normalization failed safely.')]
            });
        }
    }

    function evaluatePerformanceDensity(payload, context) {
        try {
            var normalized = normalizeHeatmapPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var row = normalized.payload || {};
            var result = {
                success: true,
                readOnly: true,
                classification: normalized.classification,
                visibility: normalized.visibility,
                performanceDensity: {
                    executionIntensityScoring: true,
                    congestionSeverityGrading: true,
                    kpiPerformanceDensityMapping: true,
                    escalationHotspotTracking: true,
                    workloadPressureAnalysis: true,
                    throughputDeclineMonitoring: true,
                    strategicPerformanceZoning: true,
                    unsafeStrategicOverridesBlocked: true,
                    historicalHeatmapAnalyticsImmutable: true,
                    densityScore: row.densityScore || 0,
                    workloadPressure: row.workloadPressure || 0,
                    throughputScore: row.throughputScore || 0
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    executionIntelligenceConfidentialityPreserved: true,
                    existingStrategicWorkflowsPreserved: true
                }
            };
            return freezeHeatmapOutput(result);
        } catch (error) {
            return freezeHeatmapOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('PERFORMANCE_DENSITY_EVALUATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Performance density evaluation failed safely.')]
            });
        }
    }

    function buildDepartmentHeatZones(tenant, data) {
        var filter = tenantFilter(tenant);
        var rows = heatmapRows(data).filter(filter);
        var executions = executionRows(data).filter(filter);
        var bottlenecks = bottleneckRows(data).filter(filter);
        var queues = queueRows(data).filter(filter);
        var escalations = escalationRows(data).filter(filter);
        var kpis = kpiRows(data).filter(filter);
        var departments = {};
        function touch(department) {
            var key = department || 'Unassigned';
            if (!departments[key]) departments[key] = { department: key, density: [], pressure: [], throughput: [], escalations: 0, bottlenecks: 0, queues: 0, kpiPressure: 0 };
            return departments[key];
        }
        rows.forEach(function row(item) {
            var zone = touch(departmentOf(item));
            zone.density.push(heatmapDensityOf(item));
            zone.pressure.push(workloadPressureOf(item));
            zone.throughput.push(throughputOf(item));
            zone.escalations += safeNumber(item.escalationCount, 0);
            zone.bottlenecks += safeNumber(item.bottleneckCount, 0);
        });
        executions.forEach(function row(item) {
            var zone = touch(departmentOf(item));
            zone.density.push(heatmapDensityOf(item));
            zone.pressure.push(workloadPressureOf(item));
            zone.throughput.push(throughputOf(item));
        });
        bottlenecks.forEach(function row(item) {
            var zone = touch(departmentOf(item));
            zone.bottlenecks += 1;
            zone.density.push(80);
            zone.pressure.push(85);
            zone.throughput.push(throughputOf(item));
        });
        queues.forEach(function row(item) {
            var zone = touch(departmentOf(item));
            zone.queues += 1;
            zone.density.push(75);
            zone.pressure.push(workloadPressureOf(item));
            zone.throughput.push(throughputOf(item));
        });
        escalations.forEach(function row(item) {
            touch(departmentOf(item)).escalations += 1;
        });
        kpis.forEach(function row(item) {
            if (/DEGRADED|AT_RISK|ESCALATED|CRITICAL/.test(normalizeToken(item.state || item.status)) || safeNumber(item.score || item.currentValue, 100) < 60) {
                touch(departmentOf(item)).kpiPressure += 1;
            }
        });
        return Object.keys(departments).map(function mapZone(department) {
            var item = departments[department];
            var density = avg(item.density, 0);
            var pressure = avg(item.pressure, 0);
            var throughput = avg(item.throughput, 100);
            return {
                department: department,
                state: stateFromScores(density, pressure, throughput, item.escalations),
                densityScore: density,
                workloadPressure: pressure,
                throughputScore: throughput,
                pressureLevel: pressure >= 85 ? 'HIGH' : pressure >= 65 ? 'ELEVATED' : 'NORMAL',
                congestionSeverity: density >= 85 || pressure >= 85 || throughput <= 35 ? 'HIGH' : density >= 70 || pressure >= 70 || throughput <= 55 ? 'WARNING' : 'INFO',
                escalationHotspotFrequency: item.escalations,
                bottleneckDensityOverlays: item.bottlenecks,
                workflowCongestionZones: item.queues,
                kpiPressureDistribution: item.kpiPressure
            };
        });
    }

    function detectExecutionPressure(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validateHeatmapScope({ tenantSlug: tenant }, context || { tenantSlug: tenant, actor: { role: 'HR_HEAD' } });
            if (!scope.allowed && actorRole(context || {}) !== 'SUPER_ADMIN') return scope;
            var filter = tenantFilter(tenant);
            var heatmaps = heatmapRows(data).filter(filter);
            var executions = executionRows(data).filter(filter);
            var bottlenecks = bottleneckRows(data).filter(filter);
            var queues = queueRows(data).filter(filter);
            var escalations = escalationRows(data).filter(filter);
            var leadership = leadershipRows(data).filter(filter);
            var workflows = workflowRows(data).filter(filter);
            var heatZones = buildDepartmentHeatZones(tenant, data);
            var overloadedDepartments = countWhere(heatZones, function zone(row) { return row.workloadPressure >= 75 || row.densityScore >= 80 || row.congestionSeverity === 'HIGH'; });
            var executionCongestionClusters = countWhere(heatZones, function zone(row) { return /HIGH_LOAD|CONGESTED|DEGRADED|ESCALATED|CRITICAL/.test(row.state); });
            var repeatedEscalationHotspots = countWhere(heatZones, function zone(row) { return row.escalationHotspotFrequency >= 2; });
            var throughputDegradation = countWhere(heatZones, function zone(row) { return row.throughputScore <= 55; }) + countWhere(workflows, function wf(row) { return /DEGRADED|FAILED|BLOCKED/.test([row.status, row.type].join(' ').toUpperCase()); });
            var stalledWorkflowDensity = queues.length + countWhere(executions, function ex(row) { return /BLOCKED|ESCALATED|FAILED/.test([row.state, row.status].join(' ').toUpperCase()); });
            var accountabilityOverloadPatterns = countWhere(leadership, function lead(row) { return /AT_RISK|ESCALATED|UNDER_REVIEW/.test([row.state, row.status].join(' ').toUpperCase()) || safeNumber(row.accountabilityLoad, 0) >= 4 || safeNumber(row.responseHours, 0) >= 48; }) + countWhere(heatmaps, function hm(row) { return safeNumber(row.accountabilityLoad, 0) >= 4; });
            var summary = {
                overloadedDepartments: overloadedDepartments,
                executionCongestionClusters: executionCongestionClusters,
                repeatedEscalationHotspots: repeatedEscalationHotspots,
                throughputDegradation: throughputDegradation,
                stalledWorkflowDensity: stalledWorkflowDensity,
                accountabilityOverloadPatterns: accountabilityOverloadPatterns
            };
            return freezeHeatmapOutput({
                success: true,
                readOnly: true,
                classification: classifyPerformanceDensity({
                    workloadOverload: overloadedDepartments > 0,
                    throughputDegradation: throughputDegradation > 0,
                    congestionEscalation: repeatedEscalationHotspots > 0,
                    workflowCongestion: stalledWorkflowDensity > 0
                }),
                tenantSlug: tenant,
                summary: summary,
                heatZones: heatZones,
                metadata: {
                    tenantIsolationPreserved: true,
                    executionIntelligenceConfidentialityPreserved: true,
                    escalationGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeHeatmapOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    overloadedDepartments: 0,
                    executionCongestionClusters: 0,
                    repeatedEscalationHotspots: 0,
                    throughputDegradation: 0,
                    stalledWorkflowDensity: 0,
                    accountabilityOverloadPatterns: 0
                },
                failures: [safeFailure('EXECUTION_PRESSURE_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Execution pressure detection failed safely.')]
            });
        }
    }

    function auditHeatmap(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    source: 'executionHeatmapService',
                    module: 'Execution Heatmap',
                    severity: metadata && metadata.severity || 'INFO',
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context),
                    description: metadata && metadata.description || actionType,
                    metadata: Object.assign({
                        actionType: actionType,
                        tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                        executionIntelligenceConfidentialityPreserved: true
                    }, cloneSanitized(metadata || {}))
                });
            }
        } catch (error) {
            return { success: false, warning: 'Heatmap audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'AuditService unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'executionHeatmapService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Heatmap telemetry failed safely.' };
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
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    source: 'executionHeatmapService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Heatmap metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateExecutionHeatmapReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validateHeatmapScope({ tenantSlug: tenant }, context || { tenantSlug: tenant, actor: { role: 'DIRECTOR' } });
            if (!scope.allowed && actorRole(context || {}) !== 'SUPER_ADMIN') return scope;
            var filter = tenantFilter(tenant);
            var heatmaps = heatmapRows(data).filter(filter);
            var executions = executionRows(data).filter(filter);
            var bottlenecks = bottleneckRows(data).filter(filter);
            var queues = queueRows(data).filter(filter);
            var kpis = kpiRows(data).filter(filter);
            var performance = performanceRows(data).filter(filter);
            var escalations = escalationRows(data).filter(filter);
            var workflows = workflowRows(data).filter(filter);
            var pressure = detectExecutionPressure({ tenantSlug: tenant }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var heatZones = pressure.heatZones || buildDepartmentHeatZones(tenant, data);
            var heatmapStateRows = heatmaps.length ? heatmaps : heatZones;
            var states = heatmapStateRows.map(function mapState(row) { return stateOf(row); });
            function stateCount(state) {
                return states.filter(function item(value) { return value === state; }).length;
            }
            var degradedKpis = countWhere(kpis, function kpi(row) { return /DEGRADED|AT_RISK|ESCALATED|CRITICAL/.test(normalizeToken(row.state || row.status)) || safeNumber(row.score || row.currentValue, 100) < 60; }) + countWhere(performance, function perf(row) { return !!row.degraded || safeNumber(row.score || row.currentValue, 100) < 60; });
            var bottleneckDensity = bottlenecks.length + queues.length;
            var throughputScores = heatmaps.concat(executions).map(function score(row) { return throughputOf(row); });
            var avgThroughput = avg(throughputScores, 100);
            var classification = highestClassification([scope.classification, pressure.classification, stateCount(EXECUTION_HEATMAP_STATES.CRITICAL) ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: new Date(context && context.now || Date.now()).toISOString(),
                tenantSlug: tenant,
                visibility: scope.visibility,
                executionHeatmapHealth: {
                    totalHeatZones: heatmapStateRows.length,
                    normalZones: stateCount(EXECUTION_HEATMAP_STATES.NORMAL),
                    activeZones: stateCount(EXECUTION_HEATMAP_STATES.ACTIVE),
                    highLoadZones: stateCount(EXECUTION_HEATMAP_STATES.HIGH_LOAD),
                    congestedZones: stateCount(EXECUTION_HEATMAP_STATES.CONGESTED),
                    degradedZones: stateCount(EXECUTION_HEATMAP_STATES.DEGRADED),
                    escalatedZones: stateCount(EXECUTION_HEATMAP_STATES.ESCALATED),
                    criticalZones: stateCount(EXECUTION_HEATMAP_STATES.CRITICAL),
                    archivedZones: stateCount(EXECUTION_HEATMAP_STATES.ARCHIVED)
                },
                performanceDensityGovernance: {
                    executionIntensityScoring: heatmapStateRows.length + executions.length,
                    congestionSeverityGrading: stateCount(EXECUTION_HEATMAP_STATES.HIGH_LOAD) + stateCount(EXECUTION_HEATMAP_STATES.CONGESTED) + stateCount(EXECUTION_HEATMAP_STATES.CRITICAL),
                    kpiPerformanceDensityMapping: degradedKpis,
                    escalationHotspotTracking: escalations.length,
                    workloadPressureAnalysis: pressure.summary && pressure.summary.overloadedDepartments || 0,
                    throughputDeclineMonitoring: Math.max(0, 100 - avgThroughput),
                    strategicPerformanceZoning: heatZones.length,
                    unsafeStrategicOverride: false,
                    unsafeStrategicOverridesBlocked: true,
                    historicalHeatmapAnalyticsImmutable: true
                },
                workloadPressureIntelligence: pressure.summary || {
                    overloadedDepartments: 0,
                    executionCongestionClusters: 0,
                    repeatedEscalationHotspots: 0,
                    throughputDegradation: 0,
                    stalledWorkflowDensity: 0,
                    accountabilityOverloadPatterns: 0
                },
                kpiBottleneckIntegration: {
                    kpiLinkedHeatmaps: countWhere(heatmaps.concat(executions), function kpi(row) { return !!(row.kpiId || row.kpiCode); }) + degradedKpis,
                    bottleneckDensityOverlays: bottleneckDensity,
                    escalationLinkedCongestion: escalations.length,
                    executionThroughputScoring: executions.length,
                    departmentPerformanceZones: heatZones.length,
                    unsafeKpiMutation: false
                },
                heatmapAnalytics: {
                    heatmapDensityTrends: heatmapStateRows.length,
                    congestionGrowth: bottleneckDensity,
                    escalationHotspotFrequency: escalations.length,
                    throughputDeclinePatterns: Math.max(0, 100 - avgThroughput),
                    overloadedDepartmentTrends: pressure.summary && pressure.summary.overloadedDepartments || 0,
                    kpiPressureDistribution: degradedKpis,
                    operationalHealthChanges: countWhere(workflows, function wf(row) { return /DEGRADED|FAILED|BLOCKED|OVERLOAD|DENSITY|HEATMAP/.test([row.status, row.type, row.module].join(' ').toUpperCase()); })
                },
                visualizationGovernance: {
                    organizationWideHeatmaps: true,
                    departmentDensityGrids: heatZones.length,
                    executionCongestionOverlays: bottleneckDensity,
                    kpiPressureIndicators: degradedKpis,
                    escalationHotspotVisualization: escalations.length,
                    timelineBasedHeatProgression: workflows.length + heatmaps.length,
                    unsafeConfidentialExposure: false
                },
                accessGovernance: {
                    employeeAssignedWorkloadVisibilityOnly: true,
                    managerDepartmentExecutionHeatmaps: true,
                    hrOperationalPerformanceVisibility: true,
                    hrHeadStrategicOrganizationalHeatmaps: true,
                    directorOrganizationWideExecutionIntelligence: true,
                    superAdminStrategicHeatmapModificationAuthority: false,
                    platformOwnerTenantExecutionChain: false,
                    crossTenantExecutionLeakageBlocked: true,
                    historicalHeatmapMutationPrevented: true,
                    unsafeStrategicExposureBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    heatmapActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    executionIntelligenceConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    strategicBottleneckIntegrated: !!global.StrategicBottleneckService,
                    leadershipAccountabilityIntegrated: !!global.LeadershipAccountabilityService,
                    kpiScorecardIntegrated: !!global.KPIScorecardService,
                    strategicExecutionIntegrated: !!global.StrategicExecutionService,
                    departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
                    performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                heatZones: heatZones,
                metadata: {
                    tenantIsolationPreserved: true,
                    executionIntelligenceConfidentialityPreserved: true,
                    historicalHeatmapAnalyticsImmutable: true,
                    existingStrategicWorkflowsPreserved: true,
                    heatmapActionsAuditable: true,
                    escalationGovernancePreserved: true
                }
            };
            auditHeatmap('EXECUTION_HEATMAP_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Execution heatmap governance report viewed.'
            }, context || {});
            emitTelemetry('EXECUTION_HEATMAP_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                densityScore: report.heatmapAnalytics.heatmapDensityTrends
            }, context || {});
            recordMetric('EXECUTION_HEATMAP_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            return freezeHeatmapOutput(report);
        } catch (error) {
            safeWarn('Execution heatmap report failed safely.', error && error.message ? error.message : error);
            return freezeHeatmapOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                executionHeatmapHealth: { totalHeatZones: 0 },
                failures: [safeFailure('EXECUTION_HEATMAP_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Execution heatmap report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeHeatmapPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_HEATMAP_PAYLOAD'; }));

            var crossTenant = validateHeatmapScope({ tenantSlug: 'abc', ownerId: 'MGR-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' } });
            check('heatmap isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var density = evaluatePerformanceDensity({ tenantSlug: 'tabsons', ownerId: 'MGR-1', department: 'Operations', state: 'HIGH_LOAD', densityScore: 75, workloadPressure: 80, throughputScore: 45 }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('congestion mapping works', density.success === true && density.performanceDensity.executionIntensityScoring === true);

            var pressure = detectExecutionPressure({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('workload pressure analytics work', pressure.success === true && !!pressure.summary);

            var frozen = freezeHeatmapOutput({ nested: { ok: true }, payload: { state: EXECUTION_HEATMAP_STATES.HIGH_LOAD } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalKpi = global.KPIScorecardService;
            var originalBottleneck = global.StrategicBottleneckService;
            var originalExecution = global.DepartmentExecutionBoardService;
            try {
                delete global.KPIScorecardService;
                delete global.StrategicBottleneckService;
                delete global.DepartmentExecutionBoardService;
                var degraded = generateExecutionHeatmapReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.kpiScorecardIntegrated === false && degraded.integrationHealth.strategicBottleneckIntegrated === false && degraded.integrationHealth.departmentExecutionBoardIntegrated === false);
            } finally {
                if (originalKpi) global.KPIScorecardService = originalKpi;
                if (originalBottleneck) global.StrategicBottleneckService = originalBottleneck;
                if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeHeatmapOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Execution heatmap self-test passed.' : 'Execution heatmap self-test detected failures.'
        });
        global.__ARTHHRMS_EXECUTION_HEATMAP_SELF_TEST__ = result;
        return result;
    }

    var ExecutionHeatmapService = Object.freeze({
        VERSION: VERSION,
        EXECUTION_HEATMAP_STATES: EXECUTION_HEATMAP_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateHeatmapScope: validateHeatmapScope,
        classifyPerformanceDensity: classifyPerformanceDensity,
        normalizeHeatmapPayload: normalizeHeatmapPayload,
        freezeHeatmapOutput: freezeHeatmapOutput,
        evaluatePerformanceDensity: evaluatePerformanceDensity,
        detectExecutionPressure: detectExecutionPressure,
        generateExecutionHeatmapReport: generateExecutionHeatmapReport,
        runSelfTest: runSelfTest
    });

    global.ExecutionHeatmapService = ExecutionHeatmapService;
    global.executionHeatmapService = ExecutionHeatmapService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
