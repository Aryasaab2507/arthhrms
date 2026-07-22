/**
 * kpiScorecardService.js
 * ARTHHRMS - KPI Scorecard Governance Service
 *
 * Read-only KPI scorecard reporting and governance. This service never mutates
 * historical KPI, goal, execution, deliverable, or escalation records.
 */
(function attachKPIScorecardService(global) {
    'use strict';

    var SOURCE = 'kpiScorecardService';
    var KPI_STATES = Object.freeze({
        HEALTHY: 'HEALTHY',
        AT_RISK: 'AT_RISK',
        DEGRADED: 'DEGRADED',
        REVIEW_PENDING: 'REVIEW_PENDING',
        ARCHIVED: 'ARCHIVED'
    });
    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });
    var SENSITIVE_KEY_PATTERN = /salary|payroll|compensation|executiveNotes|private|confidential|password|secret|token|bank|aadhaar|pan|employeeName|ownerId|empId|employeeId|kpiId|scorecardId/i;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try { return db() && typeof db().get === 'function' ? db().get() : {}; } catch (error) { return {}; }
    }

    function nowIso(context) {
        try {
            if (context && context.now) return new Date(context.now).toISOString();
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function safeString(value, fallback) {
        try {
            if (value === null || value === undefined) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizeRole(value) {
        var role = safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value, '').trim().toLowerCase().replace(/^ten[-_]/, '').replace(/^tenant[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function normalizeState(value) {
        var state = safeString(value || KPI_STATES.HEALTHY, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return KPI_STATES[state] || state || KPI_STATES.HEALTHY;
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return Number.isFinite(next) ? next : (fallback || 0);
    }

    function cloneSafe(value, depth) {
        var level = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (level > 5) return safeString(value, '');
        if (Array.isArray(value)) return value.slice(0, 500).map(function each(item) { return cloneSafe(item, level + 1); });
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSafe(value[key], level + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function each(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function freezeKPIOutput(value) {
        return deepFreeze(cloneSafe(value || {}, 0));
    }

    function failure(code, classification, message) {
        return freezeKPIOutput({
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.HIGH_RISK,
            message: message || code
        });
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.userId || actor.email || '', ''),
            empId: safeString(actor.empId || actor.employeeId || actor.id || '', ''),
            role: normalizeRole(actor.role || context && context.role || ''),
            department: safeString(actor.department || context && context.department || '', ''),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function tenantFrom(input, context) {
        var source = data();
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.companyId) ||
            context && (context.tenantSlug || context.tenantId) ||
            context && context.actor && (context.actor.tenantSlug || context.actor.tenantId) ||
            source.companySettings && (source.companySettings.tenantSlug || source.companySettings.tenantId || source.companySettings.companyId) ||
            'default'
        );
    }

    function rowTenant(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId || row.organizationId) || '');
    }

    function sameTenant(row, tenantSlug) {
        var current = rowTenant(row);
        return current ? current === tenantSlug : tenantSlug === tenantFrom({}, {});
    }

    function percent(part, total) {
        var denominator = safeNumber(total);
        if (!denominator) return 0;
        return Math.max(0, Math.min(100, Math.round((safeNumber(part) / denominator) * 100)));
    }

    function classifyKPIRisk(input) {
        var source = isPlainObject(input) ? input : {};
        if (source.crossTenant || source.historicalMutation || source.platformOwnerTenantChain) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.unsafeKPIOverride || source.degradedKPI || source.archivedMutation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.benchmarkCongestion || source.reviewPending) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function validateKPIScope(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var tenantSlug = tenantFrom(payload, context || {});
        var actor = contextActor(context || {});
        var failures = [];
        var visibility = 'NONE';
        var classification = FAILURE_CLASSIFICATIONS.INFO;

        if (actor.tenantSlug && actor.tenantSlug !== tenantSlug && actor.role !== 'PLATFORM_OWNER') {
            failures.push(failure('CROSS_TENANT_KPI_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant KPI visibility was blocked.'));
        }
        if (actor.role === 'PLATFORM_OWNER') {
            failures.push(failure('PLATFORM_OWNER_TENANT_KPI_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant KPI chains.'));
        }
        if (normalizeState(payload.state) === KPI_STATES.ARCHIVED && payload.kpiOverride) {
            failures.push(failure('ARCHIVED_KPI_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Archived KPI mutation was blocked.'));
        }
        if (actor.role === 'SUPER_ADMIN' && payload.kpiOverride) {
            failures.push(failure('SUPER_ADMIN_KPI_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot mutate strategic KPI scoring.'));
        }

        if (!failures.length) {
            if (actor.role === 'EMPLOYEE' && (payload.ownerId === actor.empId || payload.ownerId === actor.id)) visibility = 'ASSIGNED_KPI_ONLY';
            else if (actor.role === 'MANAGER' && (!payload.department || payload.department === actor.department)) visibility = 'DEPARTMENT_KPI_VISIBILITY';
            else if (actor.role === 'HR' || actor.role === 'HR_HEAD') visibility = 'WORKFORCE_KPI_VISIBILITY';
            else if (actor.role === 'DIRECTOR') visibility = 'ORGANIZATION_KPI_VISIBILITY';
            else if (actor.role === 'SUPER_ADMIN') visibility = 'KPI_INFRASTRUCTURE_VISIBILITY';
            else failures.push(failure('KPI_SCOPE_DENIED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'KPI scope denied.'));
        }

        if (failures.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })) classification = FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        else if (failures.length) classification = FAILURE_CLASSIFICATIONS.HIGH_RISK;

        return freezeKPIOutput({
            allowed: failures.length === 0,
            visibility: failures.length ? 'NONE' : visibility,
            classification: classification,
            failures: failures,
            tenantIsolationPreserved: true,
            rbacPreserved: true
        });
    }

    function normalizeKPIPayload(input, context) {
        if (!isPlainObject(input)) {
            return freezeKPIOutput({
                success: false,
                failures: [failure('MALFORMED_KPI_PAYLOAD', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'KPI payload is malformed.')]
            });
        }
        return freezeKPIOutput({
            success: true,
            payload: {
                tenantSlug: tenantFrom(input, context || {}),
                department: safeString(input.department || '', ''),
                state: normalizeState(input.state),
                quarter: safeString(input.quarter || '', ''),
                targetValue: safeNumber(input.targetValue),
                actualValue: safeNumber(input.actualValue),
                benchmarkThreshold: safeNumber(input.benchmarkThreshold || input.threshold),
                trend: safeString(input.trend || '', '').toUpperCase()
            }
        });
    }

    function tenantRows(name, tenantSlug) {
        var source = data();
        var rows = Array.isArray(source[name]) ? source[name] : [];
        return rows.filter(function same(row) { return sameTenant(row, tenantSlug); });
    }

    function scorecards(tenantSlug, quarter) {
        return tenantRows('kpiScorecards', tenantSlug).filter(function match(row) {
            return !quarter || safeString(row.quarter || '', '') === quarter;
        });
    }

    function benchmarks(tenantSlug) { return tenantRows('kpiBenchmarks', tenantSlug); }
    function goals(tenantSlug) { return tenantRows('quarterlyGoals', tenantSlug); }
    function performanceGoals(tenantSlug) { return tenantRows('performanceGoals', tenantSlug); }
    function executions(tenantSlug) { return tenantRows('departmentExecutionRecords', tenantSlug); }
    function timelines(tenantSlug) { return tenantRows('deliverableTimelineRecords', tenantSlug); }
    function escalations(tenantSlug) { return tenantRows('escalations', tenantSlug); }
    function workflowEvents(tenantSlug) { return tenantRows('workflowEvents', tenantSlug); }

    function isDegraded(row) {
        var state = normalizeState(row && row.state);
        var actual = safeNumber(row && row.actualValue);
        var threshold = safeNumber(row && (row.benchmarkThreshold || row.threshold));
        return state === KPI_STATES.DEGRADED || (!!threshold && actual < threshold);
    }

    function isAtRisk(row) {
        var state = normalizeState(row && row.state);
        return state === KPI_STATES.AT_RISK || state === KPI_STATES.REVIEW_PENDING || isDegraded(row);
    }

    function emitTelemetry(eventType, metadata, context) {
        if (context && context.skipTelemetry) return;
        try {
            var telemetry = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (telemetry && typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('GOVERNANCE', eventType, Object.assign({ source: SOURCE }, cloneSafe(metadata || {}, 0)));
            } else if (telemetry && typeof telemetry.emitWorkflowTelemetry === 'function') {
                telemetry.emitWorkflowTelemetry(eventType, Object.assign({ source: SOURCE }, cloneSafe(metadata || {}, 0)));
            }
        } catch (error) {}
    }

    function recordMetric(type, metadata, context) {
        if (context && context.skipMetrics) return;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(type, Object.assign({ module: 'KPI Scorecard' }, cloneSafe(metadata || {}, 0)));
            }
        } catch (error) {}
    }

    function audit(actionType, metadata, context) {
        if (context && context.skipAuditPersistence) return;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                service.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    module: 'KPI Scorecard',
                    source: SOURCE,
                    severity: 'INFO',
                    metadata: Object.assign({ tenantIsolationPreserved: true }, cloneSafe(metadata || {}, 0))
                }, context || {});
            } else if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(contextActor(context || {}).role || 'SYSTEM', contextActor(context || {}).id || '', actionType, 'KPI Scorecard', '', actionType);
            }
        } catch (error) {}
    }

    function evaluateBenchmarkGovernance(input, context) {
        var normalized = normalizeKPIPayload(input || {}, context || {});
        if (!normalized.success) return normalized;
        var payload = normalized.payload;
        return freezeKPIOutput({
            success: true,
            classification: classifyKPIRisk({ benchmarkCongestion: payload.actualValue < payload.benchmarkThreshold }),
            benchmarkGovernance: {
                benchmarkThresholdGovernance: true,
                unsafeKPIOverridesBlocked: true,
                kpiVersionHistory: true,
                benchmarkGap: Math.max(0, payload.benchmarkThreshold - payload.actualValue),
                benchmarkCompliant: payload.actualValue >= payload.benchmarkThreshold
            },
            timestamp: nowIso(context)
        });
    }

    function detectStrategicKPIDegradation(input, context) {
        var tenantSlug = tenantFrom(input || {}, context || {});
        var rows = scorecards(tenantSlug, input && input.quarter);
        var degraded = rows.filter(isDegraded);
        var down = rows.filter(function trend(row) { return /DOWN|DECLINE|DROP/i.test(safeString(row.trend || '', '')) || isDegraded(row); });
        var executionFailures = executions(tenantSlug).filter(function failed(row) { return /BLOCKED|FAILED|DELAYED|AT_RISK/i.test([row.state, row.status].join(' ')); });
        var bottlenecks = timelines(tenantSlug).filter(function risky(row) { return /AT_RISK|DELAYED|BLOCKED/i.test([row.state, row.status].join(' ')); });
        var byDepartment = {};
        rows.filter(isAtRisk).forEach(function each(row) {
            var dept = safeString(row.department || 'Unassigned', 'Unassigned');
            byDepartment[dept] = (byDepartment[dept] || 0) + 1;
        });
        var escalated = escalations(tenantSlug).filter(function each(row) { return !/ACKNOWLEDGED|CLOSED|RESOLVED/i.test(safeString(row.status || '', '')); });
        var signals = [
            { signalType: 'KPI_DEGRADATION', count: degraded.length },
            { signalType: 'PERFORMANCE_DROP', count: down.length },
            { signalType: 'EXECUTION_LINKED_FAILURE', count: executionFailures.length },
            { signalType: 'STRATEGIC_BOTTLENECK', count: bottlenecks.length },
            { signalType: 'ESCALATION_LINKED_KPI_RISK', count: escalated.length }
        ];
        return freezeKPIOutput({
            success: true,
            summary: {
                kpiDegradation: degraded.length,
                repeatedPerformanceDrops: down.length,
                executionLinkedKPIFailures: executionFailures.length,
                strategicBottlenecks: bottlenecks.length + escalated.length,
                departmentKPICongestion: Object.keys(byDepartment).filter(function congested(key) { return byDepartment[key] > 1; }).length || (Object.keys(byDepartment).length ? 1 : 0),
                unresolvedEscalationLinkedKPIRisks: escalated.length
            },
            signals: signals,
            timestamp: nowIso(context)
        });
    }

    function escalateDegradedKPI(input, context) {
        var scope = validateKPIScope(Object.assign({}, input || {}, { kpiOverride: false }), context || {});
        if (!scope.allowed) {
            return freezeKPIOutput({
                success: false,
                classification: scope.classification,
                failures: scope.failures
            });
        }
        emitTelemetry('KPI_DEGRADED_ESCALATED', { status: 'ESCALATED' }, context || {});
        recordMetric('KPI_DEGRADED_ESCALATED', { status: 'ESCALATED' }, context || {});
        audit('KPI_DEGRADED_ESCALATED', { status: 'ESCALATED' }, context || {});
        return freezeKPIOutput({
            success: true,
            classification: classifyKPIRisk({ degradedKPI: true }),
            degradedKPIEscalation: {
                escalationGovernancePreserved: true,
                approvalBypassPrevented: true,
                readOnlyRecommendation: true,
                recommendedAction: 'Review KPI degradation with accountable owner and linked execution board.'
            },
            timestamp: nowIso(context)
        });
    }

    function integrationHealth() {
        return {
            quarterlyGoalIntegrated: !!global.QuarterlyGoalService,
            departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
            performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
            escalationCommandIntegrated: !!global.EscalationCommandService,
            communicationGovernanceIntegrated: !!global.CommunicationGovernanceService
        };
    }

    function generateKPIScorecardReport(input, context) {
        var tenantSlug = tenantFrom(input || {}, context || {});
        var quarter = input && input.quarter || '';
        var rows = scorecards(tenantSlug, quarter);
        var activeRows = rows.filter(function active(row) { return normalizeState(row.state) !== KPI_STATES.ARCHIVED; });
        var degraded = activeRows.filter(function each(row) { return normalizeState(row.state) === KPI_STATES.DEGRADED; });
        var atRisk = activeRows.filter(function each(row) { return normalizeState(row.state) === KPI_STATES.AT_RISK || isDegraded(row); });
        var healthy = activeRows.filter(function each(row) { return normalizeState(row.state) === KPI_STATES.HEALTHY && !isDegraded(row); });
        var targetManaged = benchmarks(tenantSlug).length || activeRows.filter(function target(row) { return row.targetValue !== undefined || row.benchmarkThreshold !== undefined; }).length;
        var degradation = detectStrategicKPIDegradation({ tenantSlug: tenantSlug, quarter: quarter }, context || {});
        var goalRows = goals(tenantSlug).filter(function sameQuarter(row) { return !quarter || row.quarter === quarter; });
        var executionRows = executions(tenantSlug);
        var benchmarkRows = benchmarks(tenantSlug);
        var completed = activeRows.filter(function complete(row) { return safeNumber(row.actualValue) >= safeNumber(row.targetValue || row.benchmarkThreshold); }).length;
        var avgBenchmark = activeRows.length ? Math.round(activeRows.reduce(function sum(total, row) {
            var target = safeNumber(row.targetValue || row.benchmarkThreshold || 100, 100);
            return total + percent(row.actualValue, target);
        }, 0) / activeRows.length) : 0;
        var departments = {};
        activeRows.forEach(function each(row) {
            var dept = safeString(row.department || 'Unassigned', 'Unassigned');
            if (!departments[dept]) departments[dept] = { total: 0, degraded: 0 };
            departments[dept].total += 1;
            if (isDegraded(row)) departments[dept].degraded += 1;
        });

        var report = {
            success: true,
            readOnly: true,
            tenantSlug: tenantSlug,
            quarter: quarter,
            generatedAt: nowIso(context),
            kpiScorecardHealth: {
                totalScorecards: activeRows.length,
                healthyScorecards: healthy.length,
                degradedScorecards: degraded.length,
                atRiskScorecards: atRisk.length,
                archivedScorecardsExcluded: rows.length - activeRows.length
            },
            kpiGovernance: {
                kpiTargetManagement: targetManaged,
                unsafeKPIOverride: false,
                historicalKPIScorecardsImmutable: true,
                benchmarkThresholdGovernance: true
            },
            trendIntelligence: {
                kpiDegradation: degradation.summary.kpiDegradation,
                repeatedPerformanceDrops: degradation.summary.repeatedPerformanceDrops,
                executionLinkedKPIFailures: degradation.summary.executionLinkedKPIFailures
            },
            performanceBenchmarking: {
                departmentBenchmarkComparisons: benchmarkRows.length,
                benchmarkAchievementHealth: avgBenchmark,
                benchmarkCongestion: benchmarkRows.filter(function congested(row) { return !!row.congested; }).length
            },
            goalExecutionIntegration: {
                kpiLinkedGoals: goalRows.filter(function linked(row) { return !!row.kpiId; }).length,
                executionAwareScorecards: activeRows.filter(function linked(row) { return !!(row.goalId || row.deliverableId || row.milestoneId); }).length + executionRows.filter(function linked(row) { return !!row.kpiId; }).length,
                unsafeExecutionMutation: false
            },
            kpiAnalytics: {
                kpiCompletionRate: percent(completed, activeRows.length),
                degradedKPIFrequency: degraded.length,
                escalationLinkedKPIImpact: escalations(tenantSlug).filter(function linked(row) { return !!row.kpiId; }).length,
                departmentKPIPerformance: Math.max(0, 100 - Object.keys(departments).reduce(function sum(total, dept) { return total + departments[dept].degraded; }, 0) * 10)
            },
            accessGovernance: {
                superAdminKPIMutationAuthority: false,
                platformOwnerTenantKPIChain: false,
                tenantIsolationPreserved: true,
                rbacPreserved: true
            },
            integrationHealth: integrationHealth(),
            metadata: {
                workflowEventsAnalyzed: workflowEvents(tenantSlug).filter(function match(row) { return /KPI|SCORECARD|BENCHMARK/i.test([row.type, row.eventType, row.module].join(' ')); }).length,
                performanceGoalsAnalyzed: performanceGoals(tenantSlug).length
            }
        };
        audit('KPI_SCORECARD_REPORTED', { tenantSlug: tenantSlug, quarter: quarter }, context || {});
        emitTelemetry('KPI_SCORECARD_REPORTED', { tenantSlug: tenantSlug, quarter: quarter, status: 'REPORTED' }, context || {});
        recordMetric('KPI_SCORECARD_REPORTED', { tenantSlug: tenantSlug, quarter: quarter, status: 'REPORTED' }, context || {});
        return freezeKPIOutput(report);
    }

    function generateScorecard(input, context) { return generateKPIScorecardReport(input || {}, context || {}); }
    function generateDepartmentScorecard(input, context) { return generateKPIScorecardReport(input || {}, context || {}); }
    function generateOrganizationScorecard(input, context) { return generateKPIScorecardReport(input || {}, context || {}); }
    function generateTrendAnalysis(input, context) { return detectStrategicKPIDegradation(input || {}, context || {}); }
    function generateRiskSummary(input, context) {
        var degradation = detectStrategicKPIDegradation(input || {}, context || {});
        return freezeKPIOutput({ success: degradation.success, riskSummary: degradation.summary, timestamp: nowIso(context) });
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed) { checks.push(Object.freeze({ name: name, passed: !!passed })); }
        try {
            check('critical classification works', classifyKPIRisk({ crossTenant: true }) === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            check('high risk classification works', classifyKPIRisk({ degradedKPI: true }) === FAILURE_CLASSIFICATIONS.HIGH_RISK);
            check('malformed payload fails safely', normalizeKPIPayload(null).success === false);
            check('platform owner tenant chain blocked', validateKPIScope({ tenantSlug: 'self-test' }, { tenantSlug: 'self-test', actor: { role: 'PLATFORM_OWNER', tenantSlug: 'self-test' } }).allowed === false);
            check('outputs immutable', Object.isFrozen(freezeKPIOutput({ nested: { ok: true } }).nested));
        } catch (error) {
            checks.push(Object.freeze({ name: 'self-test runtime safety', passed: false }));
        }
        return freezeKPIOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'KPI scorecard governance development self-test.',
            checks: checks
        });
    }

    var api = Object.freeze({
        KPI_STATES: KPI_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        classifyKPIRisk: classifyKPIRisk,
        validateKPIScope: validateKPIScope,
        normalizeKPIPayload: normalizeKPIPayload,
        evaluateBenchmarkGovernance: evaluateBenchmarkGovernance,
        detectStrategicKPIDegradation: detectStrategicKPIDegradation,
        escalateDegradedKPI: escalateDegradedKPI,
        generateKPIScorecardReport: generateKPIScorecardReport,
        generateScorecard: generateScorecard,
        generateDepartmentScorecard: generateDepartmentScorecard,
        generateOrganizationScorecard: generateOrganizationScorecard,
        generateTrendAnalysis: generateTrendAnalysis,
        generateRiskSummary: generateRiskSummary,
        freezeKPIOutput: freezeKPIOutput
    });

    global.KPIScorecardService = api;
    global.KpiScorecardService = api;
    global.kpiScorecardService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_KPI_SCORECARD_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
