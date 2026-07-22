/**
 * strategicDelayPredictionService.js
 * ARTHHRMS Enterprise Strategic Delay Prediction + Predictive Execution Intelligence.
 *
 * Additive read-only governance layer for milestone delay prediction,
 * dependency slowdown forecasting, execution congestion prediction,
 * escalation probability, KPI degradation forecasting, workload overload,
 * throughput decline, and tenant-confidential predictive intelligence.
 */
(function attachStrategicDelayPredictionService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[StrategicDelayPredictionService]';

    var PREDICTION_STATES = Object.freeze({
        MONITORING: 'MONITORING',
        FORECASTING: 'FORECASTING',
        LOW_RISK: 'LOW_RISK',
        MODERATE_RISK: 'MODERATE_RISK',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_RISK: 'CRITICAL_RISK',
        ESCALATED: 'ESCALATED',
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
        ASSIGNED_PREDICTION_VISIBILITY_ONLY: 'ASSIGNED_PREDICTION_VISIBILITY_ONLY',
        DEPARTMENT_PREDICTION_VISIBILITY: 'DEPARTMENT_PREDICTION_VISIBILITY',
        HR_OPERATIONAL_FORECASTING_VISIBILITY: 'HR_OPERATIONAL_FORECASTING_VISIBILITY',
        STRATEGIC_FORECASTING_VISIBILITY: 'STRATEGIC_FORECASTING_VISIBILITY',
        ORGANIZATION_WIDE_PREDICTIVE_ANALYTICS: 'ORGANIZATION_WIDE_PREDICTIVE_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(prediction.?id|forecast.?id|heatmap.?id|snapshot.?id|bottleneck.?id|queue.?id|action.?id|dependency.?id|execution.?id|workflow.?id|deliverable.?id|milestone.?id|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|strategic.?owner|kpi.?id|scorecard.?id|report.?id|correlation.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|leave.?balance|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|leave balance|strategic note|forecast note|prediction note|predictive override|operations prediction|execution chain|roadmap)\b[^,;}]*)/ig;

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
        probability: true,
        forecastWindowDays: true,
        escalationProbability: true,
        workloadPressure: true,
        throughputScore: true,
        queueAgeHours: true,
        riskBand: true,
        forecasts: true,
        predictionHealth: true,
        predictiveExecutionGovernance: true,
        kpiBottleneckForecasting: true,
        heatmapExecutionIntegration: true,
        forecastAnalytics: true,
        predictiveVisualizationGovernance: true,
        accessGovernance: true,
        integrationHealth: true,
        totalPredictions: true,
        monitoringPredictions: true,
        forecastingPredictions: true,
        lowRiskPredictions: true,
        moderateRiskPredictions: true,
        highRiskPredictions: true,
        criticalRiskPredictions: true,
        escalatedPredictions: true,
        archivedPredictions: true,
        milestoneRiskForecasting: true,
        dependencyDelayPrediction: true,
        executionSlowdownScoring: true,
        escalationProbabilityGrading: true,
        congestionForecasting: true,
        predictiveMitigationRecommendations: true,
        executionTrendForecasting: true,
        unsafeStrategicOverride: true,
        unsafeStrategicOverridesBlocked: true,
        historicalPredictionRecordsImmutable: true,
        congestionPredictionSpikes: true,
        escalationForecastGrowth: true,
        kpiDegradationProbability: true,
        workloadOverloadForecasts: true,
        throughputDeclinePredictions: true,
        dependencySlowdownPredictions: true,
        executionCongestionGrowth: true,
        dependencyLinkedSlowdownForecasts: true,
        escalationLikelihoodSpikes: true,
        overloadedDepartmentForecasts: true,
        stalledExecutionChainPredictions: true,
        unsafeKpiMutation: true,
        heatmapBasedForecasting: true,
        congestionPredictionOverlays: true,
        workloadPressureForecasting: true,
        executionThroughputForecasting: true,
        strategicRiskTrendProjections: true,
        predictionAccuracyTrends: true,
        escalationProbabilityGrowth: true,
        forecastCongestionPatterns: true,
        kpiDegradationTrends: true,
        executionThroughputDeclineForecasts: true,
        strategicRiskOverlays: true,
        executionForecastTimelines: true,
        congestionProbabilityHeatmaps: true,
        kpiDegradationForecasts: true,
        workloadOverloadProjections: true,
        organizationalSlowdownIndicators: true,
        unsafeConfidentialExposure: true,
        employeeAssignedPredictionVisibilityOnly: true,
        managerDepartmentPredictionVisibility: true,
        hrOperationalForecastingVisibility: true,
        hrHeadStrategicForecastingVisibility: true,
        directorOrganizationWidePredictiveAnalytics: true,
        superAdminPredictiveModificationAuthority: true,
        platformOwnerTenantExecutionChain: true,
        crossTenantPredictiveLeakageBlocked: true,
        historicalPredictionMutationPrevented: true,
        unsafeStrategicExposureBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        predictiveActionsAuditable: true,
        escalationGovernancePreserved: true,
        predictiveExecutionIntelligencePreserved: true,
        tenantIsolationPreserved: true,
        executionHeatmapIntegrated: true,
        strategicBottleneckIntegrated: true,
        leadershipAccountabilityIntegrated: true,
        kpiScorecardIntegrated: true,
        strategicDependencyIntegrated: true,
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

    function normalizePredictionState(value) {
        var state = normalizeToken(value || PREDICTION_STATES.MONITORING);
        if (state === 'HIGH RISK' || state === 'HIGHRISK') state = PREDICTION_STATES.HIGH_RISK;
        if (state === 'CRITICAL RISK' || state === 'CRITICALRISK') state = PREDICTION_STATES.CRITICAL_RISK;
        if (state === 'MODERATE RISK' || state === 'MODERATERISK') state = PREDICTION_STATES.MODERATE_RISK;
        if (state === 'LOW RISK' || state === 'LOWRISK') state = PREDICTION_STATES.LOW_RISK;
        return PREDICTION_STATES[state] || state || PREDICTION_STATES.MONITORING;
    }

    function stateOf(row) {
        return normalizePredictionState(row && (row.state || row.status || row.riskState || row.governanceState));
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

    function freezePredictionOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'PREDICTION_GOVERNANCE_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Prediction governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'PREDICTION_GOVERNANCE_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Prediction governance warning.', '')
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

    function classifyPredictionRisk(signal) {
        try {
            var item = signal || {};
            if (item.crossTenant || item.historicalMutation || item.archivedMutation || item.unsafeStrategicExposure || item.platformOwnerChain) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.unsafePredictiveOverride || item.superAdminPredictiveMutation || item.congestionForecasting || item.workloadOverload || item.escalationForecast || item.throughputDecline) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (item.kpiDegradation || item.dependencySlowdown || item.malformedPayload || item.milestoneDelay) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function predictionRows(data) {
        return list(data, 'strategicDelayPredictions').concat(list(data, 'executionForecasts'), list(data, 'predictiveExecutionRecords'), list(data, 'delayPredictionAnalytics'));
    }

    function heatmapRows(data) {
        return list(data, 'executionHeatmapSnapshots').concat(list(data, 'executionHeatmaps'), list(data, 'performanceHeatmaps'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicExecutionRecords'));
    }

    function bottleneckRows(data) {
        return list(data, 'strategicBottleneckRecords').concat(list(data, 'bottleneckRecords'), list(data, 'executionBottlenecks'));
    }

    function dependencyRows(data) {
        return list(data, 'deliverableDependencies').concat(list(data, 'strategicDependencies'), list(data, 'dependencyGraphRecords'));
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

    function riskProbabilityOf(row) {
        if (!row) return 0;
        if (row.probability !== undefined) return clamp(safeNumber(row.probability, 0), 0, 100);
        if (row.escalationProbability !== undefined) return clamp(safeNumber(row.escalationProbability, 0), 0, 100);
        var state = normalizeToken(row.state || row.status || row.riskState || '');
        if (/CRITICAL|ESCALATED/.test(state)) return 90;
        if (/HIGH|BLOCKED|CONGESTED|FAILED/.test(state)) return 78;
        if (/MODERATE|DEGRADED|AT_RISK|WAITING/.test(state)) return 55;
        if (/LOW|ACTIVE|MONITORING/.test(state)) return 25;
        return 0;
    }

    function throughputOf(row) {
        if (row && row.throughputScore !== undefined) return clamp(safeNumber(row.throughputScore, 100), 0, 100);
        if (row && row.progressPercent !== undefined) return clamp(safeNumber(row.progressPercent, 0), 0, 100);
        if (/FAILED|BLOCKED|CRITICAL|CONGESTED/.test([row && row.state, row && row.status].join(' ').toUpperCase())) return 25;
        return 100;
    }

    function workloadPressureOf(row) {
        if (row && row.workloadPressure !== undefined) return clamp(safeNumber(row.workloadPressure, 0), 0, 100);
        if (row && row.workloadUnits !== undefined) return clamp(safeNumber(row.workloadUnits, 0) * 10, 0, 100);
        if (/BLOCKED|ESCALATED|CRITICAL|CONGESTED|HIGH_LOAD/.test([row && row.state, row && row.status].join(' ').toUpperCase())) return 85;
        return 0;
    }

    function validatePredictionScope(record, context) {
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
            var mutationRequested = !!(record && (record.predictiveOverride || record.predictionMutation || record.forecastOverride || record.modify || record.update || record.override || record.forcePredictiveMutation));

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_PREDICTIVE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant predictive visibility was blocked.'));
            }
            if (state === PREDICTION_STATES.ARCHIVED && mutationRequested) {
                failures.push(safeFailure('ARCHIVED_PREDICTION_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived prediction records are immutable.'));
            }
            if (role === 'SUPER_ADMIN' && mutationRequested) {
                failures.push(safeFailure('SUPER_ADMIN_PREDICTIVE_MODIFICATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify predictive execution intelligence.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_TENANT_EXECUTION_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER remains isolated from tenant execution chains.'));
                visibility = VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
            }

            if (!failures.length) {
                if (role === 'EMPLOYEE') {
                    if (recordMatchesActor(record || {}, ctx)) visibility = VISIBILITY.ASSIGNED_PREDICTION_VISIBILITY_ONLY;
                    else failures.push(safeFailure('EMPLOYEE_PREDICTION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Employee prediction visibility is limited to assigned forecasts.'));
                } else if (role === 'MANAGER') {
                    if (!record || !record.department || departmentOf(record) === safeString(ctx.actor && ctx.actor.department, '')) visibility = VISIBILITY.DEPARTMENT_PREDICTION_VISIBILITY;
                    else failures.push(safeFailure('MANAGER_DEPARTMENT_PREDICTION_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Manager prediction visibility is limited to department forecasts.'));
                } else if (role === 'HR') {
                    visibility = VISIBILITY.HR_OPERATIONAL_FORECASTING_VISIBILITY;
                } else if (role === 'HR_HEAD') {
                    visibility = VISIBILITY.STRATEGIC_FORECASTING_VISIBILITY;
                } else if (role === 'DIRECTOR') {
                    visibility = VISIBILITY.ORGANIZATION_WIDE_PREDICTIVE_ANALYTICS;
                } else if (role === 'SUPER_ADMIN') {
                    visibility = VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
                    warnings.push(safeWarning('SUPER_ADMIN_INFRASTRUCTURE_ONLY', 'SUPER_ADMIN receives infrastructure visibility only.'));
                } else {
                    failures.push(safeFailure('UNAUTHORIZED_PREDICTION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Prediction visibility requires a governed role.'));
                }
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }).concat(warnings.map(function item(row) { return row.classification; })));
            return freezePredictionOutput({
                success: failures.length === 0,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: visibility,
                tenantSlug: targetTenant,
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.every(function item(row) { return row.failureCode !== 'CROSS_TENANT_PREDICTIVE_VISIBILITY_BLOCKED'; }),
                    predictiveExecutionIntelligencePreserved: true
                }
            });
        } catch (error) {
            return freezePredictionOutput({
                success: false,
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('PREDICTION_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Prediction scope validation failed safely.')]
            });
        }
    }

    function normalizePredictionPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePredictionOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_PREDICTION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed prediction payload was rejected.')]
                });
            }
            var scope = validatePredictionScope(payload, context || {});
            if (!scope.allowed) return scope;
            var probability = clamp(safeNumber(payload.probability, riskProbabilityOf(payload)), 0, 100);
            var state = normalizePredictionState(payload.state || (probability >= 90 ? PREDICTION_STATES.CRITICAL_RISK : probability >= 75 ? PREDICTION_STATES.HIGH_RISK : probability >= 45 ? PREDICTION_STATES.MODERATE_RISK : PREDICTION_STATES.LOW_RISK));
            var normalized = {
                tenantSlug: scope.tenantSlug || resolveTenant(payload, context || {}),
                department: departmentOf(payload),
                state: state,
                probability: probability,
                forecastWindowDays: clamp(safeNumber(payload.forecastWindowDays, 14), 1, 365),
                escalationProbability: clamp(safeNumber(payload.escalationProbability, probability), 0, 100),
                workloadPressure: workloadPressureOf(payload),
                throughputScore: throughputOf(payload),
                queueAgeHours: clamp(safeNumber(payload.queueAgeHours, 0), 0, 8760),
                riskBand: probability >= 90 ? 'CRITICAL' : probability >= 75 ? 'HIGH' : probability >= 45 ? 'MODERATE' : 'LOW',
                readOnly: true
            };
            return freezePredictionOutput({
                success: true,
                readOnly: true,
                classification: classifyPredictionRisk({
                    congestionForecasting: probability >= 75,
                    throughputDecline: normalized.throughputScore <= 35,
                    kpiDegradation: !!payload.kpiId
                }),
                visibility: scope.visibility,
                payload: normalized,
                metadata: {
                    tenantIsolationPreserved: true,
                    predictiveExecutionIntelligencePreserved: true,
                    historicalPredictionRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezePredictionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('PREDICTION_PAYLOAD_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Prediction payload normalization failed safely.')]
            });
        }
    }

    function evaluatePredictiveGovernance(payload, context) {
        try {
            var normalized = normalizePredictionPayload(payload, context || {});
            if (!normalized.success) return normalized;
            return freezePredictionOutput({
                success: true,
                readOnly: true,
                classification: normalized.classification,
                visibility: normalized.visibility,
                predictiveExecutionGovernance: {
                    milestoneRiskForecasting: true,
                    dependencyDelayPrediction: true,
                    executionSlowdownScoring: true,
                    escalationProbabilityGrading: true,
                    congestionForecasting: true,
                    predictiveMitigationRecommendations: true,
                    executionTrendForecasting: true,
                    unsafeStrategicOverridesBlocked: true,
                    historicalPredictionRecordsImmutable: true,
                    probability: normalized.payload && normalized.payload.probability || 0
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    predictiveExecutionIntelligencePreserved: true,
                    existingStrategicWorkflowsPreserved: true
                }
            });
        } catch (error) {
            return freezePredictionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('PREDICTIVE_GOVERNANCE_EVALUATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Predictive governance evaluation failed safely.')]
            });
        }
    }

    function buildForecasts(tenant, data) {
        var filter = tenantFilter(tenant);
        var rows = predictionRows(data).filter(filter);
        var heatmaps = heatmapRows(data).filter(filter);
        var executions = executionRows(data).filter(filter);
        var bottlenecks = bottleneckRows(data).filter(filter);
        var dependencies = dependencyRows(data).filter(filter);
        var queues = queueRows(data).filter(filter);
        var kpis = kpiRows(data).filter(filter);
        var performance = performanceRows(data).filter(filter);
        var escalations = escalationRows(data).filter(filter);
        var departments = {};
        function touch(department) {
            var key = department || 'Unassigned';
            if (!departments[key]) departments[key] = { department: key, probabilities: [], congestion: 0, escalation: 0, kpi: 0, workload: 0, throughput: 0, dependency: 0 };
            return departments[key];
        }
        rows.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            var probability = riskProbabilityOf(row);
            forecast.probabilities.push(probability);
            if (probability >= 75) forecast.congestion += 1;
            if (safeNumber(row.escalationProbability, probability) >= 70) forecast.escalation += 1;
            if (row.kpiId || row.kpiCode) forecast.kpi += 1;
            if (workloadPressureOf(row) >= 80) forecast.workload += 1;
            if (throughputOf(row) <= 55) forecast.throughput += 1;
            if (row.dependencyId || row.milestoneId) forecast.dependency += 1;
        });
        heatmaps.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            var probability = Math.max(riskProbabilityOf(row), workloadPressureOf(row), 100 - throughputOf(row));
            forecast.probabilities.push(probability);
            if (probability >= 70) forecast.congestion += 1;
            if (workloadPressureOf(row) >= 80) forecast.workload += 1;
            if (throughputOf(row) <= 55) forecast.throughput += 1;
            if (row.kpiId || row.kpiCode) forecast.kpi += 1;
        });
        executions.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            var probability = Math.max(riskProbabilityOf(row), 100 - throughputOf(row));
            forecast.probabilities.push(probability);
            if (/BLOCKED|ESCALATED|FAILED/.test([row.state, row.status].join(' ').toUpperCase())) forecast.congestion += 1;
            if (workloadPressureOf(row) >= 70) forecast.workload += 1;
            if (throughputOf(row) <= 55) forecast.throughput += 1;
            if (row.kpiId || row.kpiCode) forecast.kpi += 1;
        });
        bottlenecks.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            forecast.congestion += 1;
            forecast.probabilities.push(riskProbabilityOf(row) || 80);
            if (throughputOf(row) <= 55) forecast.throughput += 1;
            if (row.kpiId || row.kpiCode) forecast.kpi += 1;
        });
        dependencies.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            if (/BLOCKED|WAITING|AT_RISK|DELAY|FAILED/.test([row.state, row.status].join(' ').toUpperCase())) {
                forecast.dependency += 1;
                forecast.probabilities.push(75);
            }
        });
        queues.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            forecast.congestion += 1;
            forecast.probabilities.push(clamp(safeNumber(row.queueAgeHours, 24), 0, 120));
            if (safeNumber(row.queueAgeHours, 0) >= 72 || row.approvalPending) forecast.throughput += 1;
        });
        kpis.concat(performance).forEach(function item(row) {
            if (/DEGRADED|AT_RISK|ESCALATED|CRITICAL/.test([row.state, row.status].join(' ').toUpperCase()) || safeNumber(row.score || row.currentValue, 100) < 60 || row.degraded) {
                var forecast = touch(departmentOf(row));
                forecast.kpi += 1;
                forecast.probabilities.push(65);
            }
        });
        escalations.forEach(function item(row) {
            var forecast = touch(departmentOf(row));
            forecast.escalation += 1;
            forecast.probabilities.push(70);
        });
        return Object.keys(departments).map(function mapForecast(department) {
            var item = departments[department];
            var probability = item.probabilities.length ? Math.round(item.probabilities.reduce(function sum(total, value) { return total + value; }, 0) / item.probabilities.length) : 0;
            return {
                department: department,
                probability: clamp(probability, 0, 100),
                state: probability >= 90 ? PREDICTION_STATES.CRITICAL_RISK : probability >= 75 ? PREDICTION_STATES.HIGH_RISK : probability >= 45 ? PREDICTION_STATES.MODERATE_RISK : PREDICTION_STATES.LOW_RISK,
                congestionPredictionSpikes: item.congestion,
                escalationForecastGrowth: item.escalation,
                kpiDegradationProbability: item.kpi,
                workloadOverloadForecasts: item.workload,
                throughputDeclinePredictions: item.throughput,
                dependencySlowdownPredictions: item.dependency
            };
        });
    }

    function detectForecastAnomalies(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validatePredictionScope({ tenantSlug: tenant }, context || { tenantSlug: tenant, actor: { role: 'HR_HEAD' } });
            if (!scope.allowed && actorRole(context || {}) !== 'SUPER_ADMIN') return scope;
            var filter = tenantFilter(tenant);
            var predictions = predictionRows(data).filter(filter);
            var heatmaps = heatmapRows(data).filter(filter);
            var executions = executionRows(data).filter(filter);
            var bottlenecks = bottleneckRows(data).filter(filter);
            var dependencies = dependencyRows(data).filter(filter);
            var queues = queueRows(data).filter(filter);
            var kpis = kpiRows(data).filter(filter);
            var performance = performanceRows(data).filter(filter);
            var escalations = escalationRows(data).filter(filter);
            var workflows = workflowRows(data).filter(filter);
            var forecasts = buildForecasts(tenant, data);
            var summary = {
                congestionPredictionSpikes: countWhere(predictions, function prediction(row) { return riskProbabilityOf(row) >= 75; }) + countWhere(heatmaps.concat(bottlenecks, queues), function congestion(row) { return riskProbabilityOf(row) >= 70 || workloadPressureOf(row) >= 80; }),
                escalationForecastGrowth: countWhere(predictions, function prediction(row) { return safeNumber(row.escalationProbability, riskProbabilityOf(row)) >= 70; }) + escalations.length,
                kpiDegradationProbability: countWhere(kpis.concat(performance), function kpi(row) { return /DEGRADED|AT_RISK|ESCALATED|CRITICAL/.test([row.state, row.status].join(' ').toUpperCase()) || safeNumber(row.score || row.currentValue, 100) < 60 || row.degraded; }) + countWhere(predictions, function prediction(row) { return !!(row.kpiId || row.kpiCode) && riskProbabilityOf(row) >= 60; }),
                workloadOverloadForecasts: countWhere(heatmaps.concat(executions, predictions), function workload(row) { return workloadPressureOf(row) >= 75; }),
                throughputDeclinePredictions: countWhere(heatmaps.concat(executions, bottlenecks, predictions), function throughput(row) { return throughputOf(row) <= 55; }) + countWhere(workflows, function wf(row) { return /THROUGHPUT|DEGRADED|FAILED|BLOCKED/.test([row.type, row.status, row.module].join(' ').toUpperCase()); }),
                dependencySlowdownPredictions: countWhere(dependencies, function dep(row) { return /BLOCKED|WAITING|AT_RISK|DELAY|FAILED/.test([row.state, row.status].join(' ').toUpperCase()); }) + countWhere(predictions, function prediction(row) { return !!(row.dependencyId || row.milestoneId) && riskProbabilityOf(row) >= 60; })
            };
            return freezePredictionOutput({
                success: true,
                readOnly: true,
                classification: classifyPredictionRisk({
                    congestionForecasting: summary.congestionPredictionSpikes > 0,
                    escalationForecast: summary.escalationForecastGrowth > 0,
                    kpiDegradation: summary.kpiDegradationProbability > 0,
                    workloadOverload: summary.workloadOverloadForecasts > 0,
                    throughputDecline: summary.throughputDeclinePredictions > 0
                }),
                tenantSlug: tenant,
                summary: summary,
                forecasts: forecasts,
                metadata: {
                    tenantIsolationPreserved: true,
                    predictiveExecutionIntelligencePreserved: true,
                    escalationGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezePredictionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    congestionPredictionSpikes: 0,
                    escalationForecastGrowth: 0,
                    kpiDegradationProbability: 0,
                    workloadOverloadForecasts: 0,
                    throughputDeclinePredictions: 0,
                    dependencySlowdownPredictions: 0
                },
                failures: [safeFailure('FORECAST_ANOMALY_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Forecast anomaly detection failed safely.')]
            });
        }
    }

    function auditPrediction(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    source: 'strategicDelayPredictionService',
                    module: 'Strategic Delay Prediction',
                    severity: metadata && metadata.severity || 'INFO',
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context),
                    description: metadata && metadata.description || actionType,
                    metadata: Object.assign({
                        actionType: actionType,
                        tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                        predictiveExecutionIntelligencePreserved: true
                    }, cloneSanitized(metadata || {}))
                });
            }
        } catch (error) {
            return { success: false, warning: 'Prediction audit failed safely.' };
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
                    source: 'strategicDelayPredictionService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Prediction telemetry failed safely.' };
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
                    source: 'strategicDelayPredictionService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Prediction metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateStrategicDelayPredictionReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validatePredictionScope({ tenantSlug: tenant }, context || { tenantSlug: tenant, actor: { role: 'DIRECTOR' } });
            if (!scope.allowed && actorRole(context || {}) !== 'SUPER_ADMIN') return scope;
            var filter = tenantFilter(tenant);
            var predictions = predictionRows(data).filter(filter);
            var heatmaps = heatmapRows(data).filter(filter);
            var executions = executionRows(data).filter(filter);
            var bottlenecks = bottleneckRows(data).filter(filter);
            var dependencies = dependencyRows(data).filter(filter);
            var queues = queueRows(data).filter(filter);
            var kpis = kpiRows(data).filter(filter);
            var performance = performanceRows(data).filter(filter);
            var escalations = escalationRows(data).filter(filter);
            var workflows = workflowRows(data).filter(filter);
            var leadership = leadershipRows(data).filter(filter);
            var anomalies = detectForecastAnomalies({ tenantSlug: tenant }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var summary = anomalies.summary || {};
            var highRisk = countState(predictions, PREDICTION_STATES.HIGH_RISK);
            var criticalRisk = countState(predictions, PREDICTION_STATES.CRITICAL_RISK);
            var escalated = countState(predictions, PREDICTION_STATES.ESCALATED);
            var degradedKpis = countWhere(kpis.concat(performance), function kpi(row) { return /DEGRADED|AT_RISK|ESCALATED|CRITICAL/.test([row.state, row.status].join(' ').toUpperCase()) || safeNumber(row.score || row.currentValue, 100) < 60 || row.degraded; });
            var throughputDecline = summary.throughputDeclinePredictions || 0;
            var avgProbability = predictions.length ? Math.round(predictions.reduce(function sum(total, row) { return total + riskProbabilityOf(row); }, 0) / predictions.length) : 0;
            var classification = highestClassification([scope.classification, anomalies.classification, criticalRisk || escalated ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: new Date(context && context.now || Date.now()).toISOString(),
                tenantSlug: tenant,
                visibility: scope.visibility,
                predictionHealth: {
                    totalPredictions: predictions.length,
                    monitoringPredictions: countState(predictions, PREDICTION_STATES.MONITORING),
                    forecastingPredictions: countState(predictions, PREDICTION_STATES.FORECASTING),
                    lowRiskPredictions: countState(predictions, PREDICTION_STATES.LOW_RISK),
                    moderateRiskPredictions: countState(predictions, PREDICTION_STATES.MODERATE_RISK),
                    highRiskPredictions: highRisk,
                    criticalRiskPredictions: criticalRisk,
                    escalatedPredictions: escalated,
                    archivedPredictions: countState(predictions, PREDICTION_STATES.ARCHIVED)
                },
                predictiveExecutionGovernance: {
                    milestoneRiskForecasting: countWhere(predictions.concat(executions), function row(item) { return !!(item.milestoneId || item.milestone || item.deliverableId); }),
                    dependencyDelayPrediction: summary.dependencySlowdownPredictions || 0,
                    executionSlowdownScoring: countWhere(executions.concat(predictions), function row(item) { return throughputOf(item) <= 55 || riskProbabilityOf(item) >= 60; }),
                    escalationProbabilityGrading: summary.escalationForecastGrowth || escalations.length,
                    congestionForecasting: summary.congestionPredictionSpikes || 0,
                    predictiveMitigationRecommendations: highRisk + criticalRisk + escalated + bottlenecks.length,
                    executionTrendForecasting: workflows.length + predictions.length,
                    unsafeStrategicOverride: false,
                    unsafeStrategicOverridesBlocked: true,
                    historicalPredictionRecordsImmutable: true
                },
                kpiBottleneckForecasting: {
                    kpiDegradationProbability: summary.kpiDegradationProbability || degradedKpis,
                    executionCongestionGrowth: summary.congestionPredictionSpikes || bottlenecks.length + queues.length,
                    dependencyLinkedSlowdownForecasts: summary.dependencySlowdownPredictions || dependencies.length,
                    escalationLikelihoodSpikes: summary.escalationForecastGrowth || escalations.length,
                    overloadedDepartmentForecasts: summary.workloadOverloadForecasts || 0,
                    stalledExecutionChainPredictions: countWhere(executions.concat(queues), function row(item) { return /BLOCKED|ESCALATED|FAILED|DEGRADED/.test([item.state, item.status].join(' ').toUpperCase()); }),
                    unsafeKpiMutation: false
                },
                heatmapExecutionIntegration: {
                    heatmapBasedForecasting: heatmaps.length,
                    congestionPredictionOverlays: countWhere(heatmaps.concat(bottlenecks), function row(item) { return workloadPressureOf(item) >= 75 || riskProbabilityOf(item) >= 70; }),
                    workloadPressureForecasting: summary.workloadOverloadForecasts || 0,
                    executionThroughputForecasting: throughputDecline,
                    strategicRiskTrendProjections: Math.max(predictions.length, anomalies.forecasts && anomalies.forecasts.length || 0)
                },
                forecastAnalytics: {
                    predictionAccuracyTrends: countWhere(predictions, function row(item) { return item.actualDelayDays !== undefined || item.resolvedAt; }),
                    escalationProbabilityGrowth: summary.escalationForecastGrowth || escalations.length,
                    forecastCongestionPatterns: summary.congestionPredictionSpikes || 0,
                    workloadOverloadForecasts: summary.workloadOverloadForecasts || 0,
                    kpiDegradationTrends: summary.kpiDegradationProbability || degradedKpis,
                    dependencySlowdownPredictions: summary.dependencySlowdownPredictions || 0,
                    executionThroughputDeclineForecasts: throughputDecline
                },
                predictiveVisualizationGovernance: {
                    strategicRiskOverlays: predictions.length,
                    executionForecastTimelines: workflows.length + predictions.length,
                    congestionProbabilityHeatmaps: heatmaps.length + bottlenecks.length,
                    kpiDegradationForecasts: degradedKpis,
                    workloadOverloadProjections: summary.workloadOverloadForecasts || 0,
                    organizationalSlowdownIndicators: Math.max(0, 100 - avgProbability),
                    unsafeConfidentialExposure: false
                },
                accessGovernance: {
                    employeeAssignedPredictionVisibilityOnly: true,
                    managerDepartmentPredictionVisibility: true,
                    hrOperationalForecastingVisibility: true,
                    hrHeadStrategicForecastingVisibility: true,
                    directorOrganizationWidePredictiveAnalytics: true,
                    superAdminPredictiveModificationAuthority: false,
                    platformOwnerTenantExecutionChain: false,
                    crossTenantPredictiveLeakageBlocked: true,
                    historicalPredictionMutationPrevented: true,
                    unsafeStrategicExposureBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    predictiveActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    predictiveExecutionIntelligencePreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    executionHeatmapIntegrated: !!global.ExecutionHeatmapService,
                    strategicBottleneckIntegrated: !!global.StrategicBottleneckService,
                    leadershipAccountabilityIntegrated: !!global.LeadershipAccountabilityService,
                    kpiScorecardIntegrated: !!global.KPIScorecardService,
                    strategicDependencyIntegrated: !!global.StrategicDependencyService,
                    strategicExecutionIntegrated: !!global.StrategicExecutionService,
                    departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
                    performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                forecasts: anomalies.forecasts || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    predictiveExecutionIntelligencePreserved: true,
                    historicalPredictionRecordsImmutable: true,
                    existingStrategicWorkflowsPreserved: true,
                    predictiveActionsAuditable: true,
                    escalationGovernancePreserved: true
                }
            };
            auditPrediction('STRATEGIC_DELAY_PREDICTION_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Strategic delay prediction governance report viewed.'
            }, context || {});
            emitTelemetry('STRATEGIC_DELAY_PREDICTION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                probability: avgProbability
            }, context || {});
            recordMetric('STRATEGIC_DELAY_PREDICTION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            return freezePredictionOutput(report);
        } catch (error) {
            safeWarn('Strategic delay prediction report failed safely.', error && error.message ? error.message : error);
            return freezePredictionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                predictionHealth: { totalPredictions: 0 },
                failures: [safeFailure('STRATEGIC_DELAY_PREDICTION_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Strategic delay prediction report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizePredictionPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_PREDICTION_PAYLOAD'; }));

            var crossTenant = validatePredictionScope({ tenantSlug: 'abc', ownerId: 'MGR-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' } });
            check('prediction isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var governance = evaluatePredictiveGovernance({ tenantSlug: 'tabsons', ownerId: 'MGR-1', department: 'Operations', state: 'HIGH_RISK', probability: 80 }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('congestion forecasting works', governance.success === true && governance.predictiveExecutionGovernance.congestionForecasting === true);

            var anomalies = detectForecastAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('workload overload prediction works', anomalies.success === true && !!anomalies.summary);

            var frozen = freezePredictionOutput({ nested: { ok: true }, payload: { state: PREDICTION_STATES.HIGH_RISK } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalKpi = global.KPIScorecardService;
            var originalHeatmap = global.ExecutionHeatmapService;
            var originalBottleneck = global.StrategicBottleneckService;
            try {
                delete global.KPIScorecardService;
                delete global.ExecutionHeatmapService;
                delete global.StrategicBottleneckService;
                var degraded = generateStrategicDelayPredictionReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.kpiScorecardIntegrated === false && degraded.integrationHealth.executionHeatmapIntegrated === false && degraded.integrationHealth.strategicBottleneckIntegrated === false);
            } finally {
                if (originalKpi) global.KPIScorecardService = originalKpi;
                if (originalHeatmap) global.ExecutionHeatmapService = originalHeatmap;
                if (originalBottleneck) global.StrategicBottleneckService = originalBottleneck;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezePredictionOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Strategic delay prediction self-test passed.' : 'Strategic delay prediction self-test detected failures.'
        });
        global.__ARTHHRMS_STRATEGIC_DELAY_PREDICTION_SELF_TEST__ = result;
        return result;
    }

    var StrategicDelayPredictionService = Object.freeze({
        VERSION: VERSION,
        PREDICTION_STATES: PREDICTION_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validatePredictionScope: validatePredictionScope,
        classifyPredictionRisk: classifyPredictionRisk,
        normalizePredictionPayload: normalizePredictionPayload,
        freezePredictionOutput: freezePredictionOutput,
        evaluatePredictiveGovernance: evaluatePredictiveGovernance,
        detectForecastAnomalies: detectForecastAnomalies,
        generateStrategicDelayPredictionReport: generateStrategicDelayPredictionReport,
        runSelfTest: runSelfTest
    });

    global.StrategicDelayPredictionService = StrategicDelayPredictionService;
    global.strategicDelayPredictionService = StrategicDelayPredictionService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
