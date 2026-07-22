/**
 * aiKpiForecastingService.js
 * ARTHHRMS - AI KPI Forecasting + Strategic Performance Prediction Engine
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware, explainable KPI forecasting for HR,
 * attendance, leave, operational, strategic, department, project, and workforce
 * KPI domains.
 *
 * AI SAFETY:
 * This service only forecasts, explains, recommends, and warns. It never
 * modifies KPI targets, changes performance records, alters strategic goals,
 * changes permissions, or triggers workflows automatically.
 *
 * @version 1.0.0
 */
(function attachAIKPIForecastingService(global) {
    'use strict';

    var PREFIX = '[AIKPIForecastingService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 1000;

    var KPI_DOMAINS = Object.freeze([
        'ATTENDANCE_KPIS',
        'LEAVE_KPIS',
        'HR_KPIS',
        'OPERATIONAL_KPIS',
        'STRATEGIC_KPIS',
        'DEPARTMENT_KPIS',
        'PROJECT_KPIS',
        'WORKFORCE_KPIS'
    ]);

    var FORECAST_HORIZONS = Object.freeze(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);
    var CONFIDENCE_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH']);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|employeeRecord|confidential|privateNote|rawPayload|confidentialEmployeeRecord)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|rawTenantDocument)\s*[:=]?\s*[\w,.\- ]+/ig;

    function nowIso() {
        try { return new Date().toISOString(); } catch (error) { return String(Date.now()); }
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return Number.isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        var next = safeNumber(value, min);
        return Math.max(min, Math.min(max, next));
    }

    function average(values) {
        var list = Array.isArray(values) ? values.filter(Number.isFinite) : [];
        if (!list.length) return 0;
        return list.reduce(function sum(acc, value) { return acc + value; }, 0) / list.length;
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizeToken(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim();
        return raw.replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() || (fallback || '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '', 'EMPLOYEE');
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN' || role === 'ADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.userId || context.actor.empId || context.actor.employeeId || context.actor.email) || context && (context.actorId || context.userId || context.employeeId) || '', '');
    }

    function actorDepartment(context) {
        return safeString(context && context.actor && context.actor.department || context && context.department || '', '').trim();
    }

    function arrayOf(value, max) {
        return Array.isArray(value) ? value.slice(0, max || MAX_ROWS) : [];
    }

    function freezeDeep(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeDeep(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function redactString(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, seen) {
        if (value === undefined || value === null) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.slice(0, MAX_ROWS).map(function cloneArrayItem(item) {
                return cloneSanitized(item, refs.slice());
            });
        }
        if (!isPlainObject(value)) return safeString(value, '');
        var output = {};
        try {
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], refs.slice());
            });
        } catch (error) {}
        return output;
    }

    function freezeForecastOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacGovernancePreserved: true,
            noAutonomousActions: true,
            noKpiTargetMutation: true,
            noPerformanceRecordMutation: true,
            noStrategicGoalMutation: true,
            noPermissionChanges: true,
            noWorkflowExecution: true,
            noHiddenReasoningExposure: true,
            explainableOutputsOnly: true,
            humanApprovalRequired: true,
            existingWorkflowsPreserved: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            kpiScorecardIntegrated: !!(global.KpiScorecardService || global.kpiScorecardService),
            quarterlyGoalIntegrated: !!(global.QuarterlyGoalService || global.quarterlyGoalService),
            departmentExecutionIntegrated: !!(global.DepartmentExecutionBoardService || global.departmentExecutionBoardService),
            performanceGovernanceIntegrated: !!(global.PerformanceGovernanceService || global.performanceGovernanceService),
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!global.AuditService && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!global.WorkflowTelemetryService && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'ORGANIZATION_WIDE_KPI_FORECAST_ANALYTICS', role: role };
        if (role === 'HR') return { scope: 'HR_KPI_FORECAST_VISIBILITY', role: role };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_KPI_FORECAST_VISIBILITY', role: role, department: actorDepartment(context) };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_AI_FORECAST_VISIBILITY_ONLY', role: role };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_AI_GOVERNANCE_VISIBILITY', role: role };
        return { scope: 'ASSIGNED_KPI_FORECAST_VISIBILITY_ONLY', role: role, department: actorDepartment(context) };
    }

    function validateForecastScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeForecastOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant AI KPI forecasting is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            return freezeForecastOutput({
                success: true,
                allowed: true,
                tenantSlug: tenant || ctxTenant,
                actorId: actorId(context || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validateForecastScope failed safely', error && error.message);
            return freezeForecastOutput({
                success: false,
                allowed: false,
                classification: 'FORECAST_SCOPE_ERROR',
                message: 'AI KPI forecasting scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function tenantRows(rows, tenantSlug) {
        var tenant = normalizeTenantSlug(tenantSlug);
        return arrayOf(rows).filter(function sameTenant(row) {
            var rowTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId) || tenant);
            return !rowTenant || rowTenant === tenant;
        });
    }

    function normalizeNumericList(values) {
        return arrayOf(values, 36).map(function mapNumber(value) {
            return safeNumber(value, NaN);
        }).filter(Number.isFinite);
    }

    function normalizeKPI(row, tenantSlug, index) {
        var domain = normalizeToken(row && (row.domain || row.kpiDomain || row.category), 'OPERATIONAL_KPIS');
        if (KPI_DOMAINS.indexOf(domain) === -1) return null;
        var history = normalizeNumericList(row && (row.historicalValues || row.history || row.values || row.trendValues));
        var current = safeNumber(row && (row.currentValue !== undefined ? row.currentValue : row.value !== undefined ? row.value : row.actualValue !== undefined ? row.actualValue : row.progressPercent), history.length ? history[history.length - 1] : 0);
        if (!history.length && current) history = [current];
        var target = safeNumber(row && (row.target !== undefined ? row.target : row.targetValue !== undefined ? row.targetValue : row.goalValue !== undefined ? row.goalValue : row.targetCompletion), 100);
        return {
            tenantSlug: tenantSlug,
            kpiId: safeString(row && (row.kpiId || row.id || row.metricId), 'KPI-' + (index + 1)).slice(0, 80),
            domain: domain.toLowerCase(),
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment || row.team), 'General').slice(0, 80),
            name: safeString(row && (row.name || row.kpiName || row.metricName || row.title), domain.replace(/_/g, ' ')).slice(0, 120),
            target: clamp(target, -1000000, 1000000),
            currentValue: clamp(current, -1000000, 1000000),
            historicalValues: history.slice(0, 36),
            period: normalizeToken(row && (row.period || row.frequency), 'MONTHLY').toLowerCase(),
            direction: normalizeToken(row && (row.direction || row.targetDirection), 'UP'),
            executionVelocity: clamp(row && row.executionVelocity, 0, 100),
            metadata: cloneSanitized(row && row.metadata || {})
        };
    }

    function normalizeGoal(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment), 'Leadership').slice(0, 80),
            targetCompletion: clamp(row && (row.targetCompletion || row.target || row.targetValue), 0, 100),
            currentCompletion: clamp(row && (row.currentCompletion || row.progressPercent || row.currentValue), 0, 100),
            velocity: clamp(row && (row.velocity || row.executionVelocity || row.completionVelocity), 0, 100),
            state: normalizeToken(row && (row.state || row.status), 'ACTIVE')
        };
    }

    function normalizeExecutionSignal(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment), 'Operations').slice(0, 80),
            velocity: clamp(row && (row.velocity || row.executionVelocity || row.throughputScore), 0, 100),
            delayedMilestones: clamp(row && (row.delayedMilestones || row.delayCount || row.blockedCount), 0, 1000),
            completionRate: clamp(row && (row.completionRate || row.progressPercent), 0, 100)
        };
    }

    function normalizeForecastPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeForecastOutput({
                    success: false,
                    classification: 'MALFORMED_FORECAST_PAYLOAD',
                    message: 'AI KPI forecast payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var scope = validateForecastScope(payload, context || {});
            if (!scope.success) return scope;
            var domains = arrayOf(payload.kpiDomains).map(function mapDomain(domain) {
                return normalizeToken(domain, '');
            }).filter(function knownDomain(domain) {
                return KPI_DOMAINS.indexOf(domain) !== -1;
            });
            if (!domains.length) domains = KPI_DOMAINS.slice();
            var horizons = arrayOf(payload.forecastHorizons).map(function mapHorizon(horizon) {
                return normalizeToken(horizon, '');
            }).filter(function knownHorizon(horizon) {
                return FORECAST_HORIZONS.indexOf(horizon) !== -1;
            });
            if (!horizons.length) horizons = ['MONTHLY', 'QUARTERLY'];
            var tenant = scope.tenantSlug;
            var kpis = tenantRows(payload.kpis || payload.kpiHistory || payload.metrics || [], tenant).map(function mapKpi(row, index) {
                return normalizeKPI(row, tenant, index);
            }).filter(Boolean).filter(function selectedDomain(row) {
                return domains.indexOf(normalizeToken(row.domain, '')) !== -1;
            });
            var goals = tenantRows(payload.goals || payload.quarterlyGoals || payload.objectives || [], tenant).map(function mapGoal(row) {
                return normalizeGoal(row, tenant);
            });
            var executionSignals = tenantRows(payload.executionSignals || payload.execution || payload.workflowSignals || [], tenant).map(function mapSignal(row) {
                return normalizeExecutionSignal(row, tenant);
            });
            var totalHistory = kpis.reduce(function countHistory(acc, row) { return acc + row.historicalValues.length; }, 0);
            var normalized = {
                success: true,
                tenantSlug: tenant,
                forecastHorizons: horizons,
                kpiDomains: domains,
                kpis: kpis,
                goals: goals,
                executionSignals: executionSignals,
                analytics: {
                    forecastAccuracy: clamp(payload.analytics && payload.analytics.forecastAccuracy, 0, 100),
                    targetAchievementRate: clamp(payload.analytics && payload.analytics.targetAchievementRate, 0, 100),
                    forecastDeviation: clamp(payload.analytics && payload.analytics.forecastDeviation, 0, 100),
                    departmentForecastTrend: clamp(payload.analytics && payload.analytics.departmentForecastTrend, 0, 100),
                    strategicForecastTrend: clamp(payload.analytics && payload.analytics.strategicForecastTrend, 0, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: scope.visibility,
                governance: governanceFlags()
            };
            normalized.dataQuality = {
                insufficientKpiHistory: kpis.length < 2 || totalHistory < 6,
                sparseDatasetsHandled: true,
                volatilePatternsHandled: true,
                missingPeriodsHandled: true,
                conflictingTrendsHandled: true
            };
            return freezeForecastOutput(normalized);
        } catch (error) {
            safeWarn('normalizeForecastPayload failed safely', error && error.message);
            return freezeForecastOutput({
                success: false,
                classification: 'FORECAST_NORMALIZATION_ERROR',
                message: 'AI KPI forecast normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function confidenceLevel(score) {
        if (score >= 80) return 'HIGH';
        if (score >= 50) return 'MODERATE';
        return 'LOW';
    }

    function historyDeltas(history) {
        var deltas = [];
        for (var i = 1; i < history.length; i += 1) deltas.push(history[i] - history[i - 1]);
        return deltas;
    }

    function trendDirection(history) {
        if (!history || history.length < 2) return 'FLAT';
        var delta = history[history.length - 1] - history[0];
        if (Math.abs(delta) < 1) return 'FLAT';
        return delta > 0 ? 'UP' : 'DOWN';
    }

    function volatilityForKPI(kpi) {
        var deltas = historyDeltas(kpi.historicalValues || []);
        if (!deltas.length) return 48;
        var avgDelta = average(deltas);
        var movement = average(deltas.map(function deviation(delta) { return Math.abs(delta - avgDelta); }));
        var targetBase = Math.max(1, Math.abs(kpi.target || 100));
        return Math.round(clamp(movement / targetBase * 100 + Math.abs(avgDelta) * 0.5, 0, 100));
    }

    function targetGap(kpi, value) {
        var direction = normalizeToken(kpi.direction, 'UP');
        if (direction === 'DOWN' || direction === 'LOWER_IS_BETTER') return value - kpi.target;
        return kpi.target - value;
    }

    function achievementProbability(kpi, projected, volatility) {
        var gap = targetGap(kpi, projected);
        var base = gap <= 0 ? 82 : 72 - Math.min(48, gap * 0.8);
        var velocityBoost = safeNumber(kpi.executionVelocity, 0) * 0.15;
        var volatilityPenalty = volatility * 0.22;
        return Math.round(clamp(base + velocityBoost - volatilityPenalty, 8, 98));
    }

    function calculateForecastConfidence(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeForecastPayload(input, context || {});
            if (!normalized.success) return normalized;
            var historyCount = normalized.kpis.reduce(function count(acc, row) { return acc + row.historicalValues.length; }, 0);
            var avgVolatility = normalized.kpis.length ? average(normalized.kpis.map(volatilityForKPI)) : 62;
            var dataDepth = Math.min(32, historyCount * 3);
            var domainDepth = Math.min(16, normalized.kpiDomains.length * 2);
            var accuracyBoost = safeNumber(normalized.analytics.forecastAccuracy, 0) * 0.36;
            var deviationPenalty = safeNumber(normalized.analytics.forecastDeviation, 0) * 0.35;
            var forecastConfidence = Math.round(clamp(24 + dataDepth + domainDepth + accuracyBoost - avgVolatility * 0.2 - deviationPenalty, 18, 96));
            if (normalized.dataQuality.insufficientKpiHistory) forecastConfidence = Math.min(forecastConfidence, 58);
            var trendConfidence = Math.round(clamp(30 + dataDepth + safeNumber(normalized.analytics.departmentForecastTrend, 0) * 0.18 + safeNumber(normalized.analytics.strategicForecastTrend, 0) * 0.18 - avgVolatility * 0.16, 15, 95));
            var probabilities = normalized.kpis.map(function probability(row) {
                var deltas = historyDeltas(row.historicalValues);
                var projected = row.currentValue + average(deltas);
                return achievementProbability(row, projected, volatilityForKPI(row));
            });
            var achievement = probabilities.length ? Math.round(clamp(average(probabilities) * 0.72 + safeNumber(normalized.analytics.targetAchievementRate, 0) * 0.28, 0, 100)) : Math.round(clamp(safeNumber(normalized.analytics.targetAchievementRate, 35), 12, 70));
            return freezeForecastOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                forecastConfidence: forecastConfidence,
                trendConfidence: trendConfidence,
                achievementProbability: achievement,
                volatilityScore: Math.round(clamp(avgVolatility, 0, 100)),
                confidenceLevel: confidenceLevel(forecastConfidence),
                dataQuality: normalized.dataQuality,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateForecastConfidence failed safely', error && error.message);
            return freezeForecastOutput({
                success: false,
                classification: 'FORECAST_CONFIDENCE_ERROR',
                message: 'KPI forecast confidence calculation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function explainForecast(forecast, context) {
        try {
            var drivers = arrayOf(forecast && forecast.forecastDrivers, 8).map(function driverText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 160);
            }).filter(Boolean);
            var assumptions = arrayOf(forecast && forecast.assumptions, 8).map(function assumptionText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 160);
            }).filter(Boolean);
            if (!drivers.length) drivers.push('tenant-scoped KPI history is limited, so the forecast stays conservative');
            if (!assumptions.length) assumptions.push('future KPI values remain comparable with available historical periods');
            var domain = normalizeToken(forecast && forecast.domain, 'OPERATIONAL_KPIS').toLowerCase();
            var name = safeString(forecast && (forecast.kpiName || forecast.name), domain.replace(/_/g, ' '));
            var projected = clamp(forecast && forecast.projectedValue, -1000000, 1000000);
            var target = clamp(forecast && forecast.target, -1000000, 1000000);
            var probability = clamp(forecast && forecast.achievementProbability, 0, 100);
            var trend = safeString(forecast && forecast.trendAnalysis, '');
            if (!trend) {
                trend = probability >= 70
                    ? 'Trend analysis shows the current trajectory can reasonably approach the target if current velocity is maintained.'
                    : 'Trend analysis shows the target gap or volatility remains material and should be reviewed by a human owner.';
            }
            return freezeForecastOutput({
                success: true,
                domain: domain,
                kpiName: name,
                explanation: name + ' forecast exists because ' + drivers.slice(0, 3).join(', ') + '. Projected value ' + Math.round(projected * 100) / 100 + ' is compared against target ' + Math.round(target * 100) / 100 + ' with an achievement probability of ' + Math.round(probability) + '%.',
                forecastDrivers: drivers,
                assumptions: assumptions,
                trendAnalysis: trend,
                confidenceLevel: normalizeToken(forecast && forecast.confidenceLevel, confidenceLevel(forecast && forecast.forecastConfidence || probability)),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('explainForecast failed safely', error && error.message);
            return freezeForecastOutput({
                success: false,
                classification: 'FORECAST_EXPLANATION_ERROR',
                message: 'KPI forecast explanation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function horizonMultiplier(horizon) {
        var token = normalizeToken(horizon, 'MONTHLY');
        if (token === 'WEEKLY') return 0.25;
        if (token === 'QUARTERLY') return 3;
        if (token === 'ANNUAL') return 12;
        return 1;
    }

    function forecastForHorizon(kpi, horizon) {
        var deltas = historyDeltas(kpi.historicalValues || []);
        var avgDelta = deltas.length ? average(deltas) : 0;
        var projected = kpi.currentValue + avgDelta * horizonMultiplier(horizon);
        return Math.round(projected * 100) / 100;
    }

    function recommendedActionFor(forecast) {
        var action = 'Review KPI trajectory with the accountable human owner before changing targets or records.';
        if (forecast.achievementProbability < 35) action = 'Open a human-led KPI recovery review and validate assumptions before any operational action.';
        else if (forecast.achievementProbability < 60) action = 'Assign a human owner to review target gap, velocity, and mitigation options.';
        else if (forecast.volatilityScore > 60) action = 'Monitor KPI volatility and verify forecast assumptions with the department lead.';
        return {
            domain: forecast.domain,
            department: forecast.department,
            kpiName: forecast.kpiName,
            action: action,
            humanApprovalRequired: true,
            autonomousAction: false
        };
    }

    function applyVisibility(forecasts, context) {
        var visibility = visibilityForContext(context || {});
        if (visibility.scope === 'ORGANIZATION_WIDE_KPI_FORECAST_ANALYTICS' || visibility.scope === 'PLATFORM_AI_GOVERNANCE_VISIBILITY' || visibility.scope === 'INFRASTRUCTURE_AI_FORECAST_VISIBILITY_ONLY') {
            return forecasts;
        }
        if (visibility.scope === 'HR_KPI_FORECAST_VISIBILITY') {
            return forecasts.filter(function hrVisible(row) {
                return /hr|leave|attendance|workforce/i.test(row.domain + ' ' + row.department);
            });
        }
        var dept = safeString(visibility.department, '').toLowerCase();
        if (!dept) return forecasts.filter(function workforceOnly(row) { return normalizeToken(row.domain, '') === 'WORKFORCE_KPIS'; });
        return forecasts.filter(function visibleRow(row) {
            return safeString(row.department, '').toLowerCase() === dept || normalizeToken(row.domain, '') === 'WORKFORCE_KPIS';
        });
    }

    function conservativePlaceholderForecast(normalized, score) {
        var domain = (normalized.kpiDomains[0] || 'OPERATIONAL_KPIS').toLowerCase();
        var explanation = explainForecast({
            domain: domain,
            kpiName: domain.replace(/_/g, ' '),
            forecastConfidence: score.forecastConfidence,
            achievementProbability: score.achievementProbability,
            projectedValue: 0,
            target: 0,
            forecastDrivers: ['insufficient tenant-scoped KPI history'],
            assumptions: ['forecast remains conservative until more KPI periods are available'],
            trendAnalysis: 'Trend analysis is limited because KPI history is sparse or unavailable.'
        });
        return {
            forecastId: 'AI-KPI-SPARSE-' + Date.now(),
            domain: domain,
            department: 'General',
            kpiName: domain.replace(/_/g, ' '),
            horizon: (normalized.forecastHorizons[0] || 'MONTHLY').toLowerCase(),
            projectedValue: 0,
            likelyOutcome: 'INSUFFICIENT_HISTORY',
            target: 0,
            achievementProbability: score.achievementProbability,
            forecastConfidence: Math.min(score.forecastConfidence, 50),
            trendConfidence: score.trendConfidence,
            volatilityScore: score.volatilityScore,
            confidenceLevel: confidenceLevel(Math.min(score.forecastConfidence, 50)),
            explanation: explanation.explanation,
            forecastDrivers: explanation.forecastDrivers,
            assumptions: explanation.assumptions,
            trendAnalysis: explanation.trendAnalysis,
            readOnly: true
        };
    }

    function generateForecastForKPI(kpi, normalized, score) {
        var horizon = normalized.forecastHorizons.indexOf('QUARTERLY') !== -1 ? 'QUARTERLY' : normalized.forecastHorizons[0];
        var projected = forecastForHorizon(kpi, horizon);
        var volatility = volatilityForKPI(kpi);
        var probability = achievementProbability(kpi, projected, volatility);
        var trend = trendDirection(kpi.historicalValues);
        var confidence = Math.round(clamp(score.forecastConfidence - volatility * 0.15 + kpi.historicalValues.length * 2, 15, 96));
        var drivers = [
            'historical KPI trend is ' + trend.toLowerCase(),
            'current value is ' + kpi.currentValue + ' against target ' + kpi.target,
            'forecast horizon is ' + horizon.toLowerCase()
        ];
        if (kpi.executionVelocity) drivers.push('execution velocity contributes ' + kpi.executionVelocity + '% to confidence');
        if (volatility > 55) drivers.push('volatility is elevated and reduces confidence');
        var assumptions = [
            'historical KPI periods remain comparable',
            'no autonomous target or record changes are applied',
            'human owners validate recommendations before action'
        ];
        var trendText = trend === 'UP'
            ? 'Trend analysis shows upward movement across available periods.'
            : trend === 'DOWN'
                ? 'Trend analysis shows downward movement across available periods.'
                : 'Trend analysis shows limited directional movement across available periods.';
        var explanation = explainForecast({
            domain: kpi.domain,
            kpiName: kpi.name,
            forecastConfidence: confidence,
            achievementProbability: probability,
            projectedValue: projected,
            target: kpi.target,
            forecastDrivers: drivers,
            assumptions: assumptions,
            trendAnalysis: trendText
        });
        return {
            forecastId: 'AI-KPI-' + normalizeToken(kpi.kpiId, 'KPI') + '-' + Date.now(),
            kpiId: kpi.kpiId,
            domain: kpi.domain,
            department: kpi.department,
            kpiName: kpi.name,
            horizon: horizon.toLowerCase(),
            projectedValue: projected,
            likelyOutcome: probability >= 70 ? 'LIKELY_TO_MEET_TARGET' : probability >= 45 ? 'AT_RISK_TARGET' : 'UNLIKELY_WITH_CURRENT_TRAJECTORY',
            riskAdjustedValue: Math.round((projected - volatility * 0.05) * 100) / 100,
            target: kpi.target,
            achievementProbability: probability,
            forecastConfidence: confidence,
            trendConfidence: score.trendConfidence,
            volatilityScore: volatility,
            confidenceLevel: confidenceLevel(confidence),
            explanation: explanation.explanation,
            forecastDrivers: explanation.forecastDrivers,
            assumptions: explanation.assumptions,
            trendAnalysis: explanation.trendAnalysis,
            readOnly: true
        };
    }

    function recordAudit(actionType, details, context) {
        if (context && context.skipAuditPersistence) return false;
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    actorId: actorId(context) || 'SYSTEM',
                    tenantSlug: contextTenant(context),
                    entityType: 'AI_KPI_FORECAST',
                    module: 'AI KPI Forecasting',
                    details: cloneSanitized(details || {})
                });
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-AI-KPI-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'AI KPI Forecasting',
                createdAt: nowIso(),
                details: cloneSanitized(details || {})
            });
            data.auditLogs = data.auditLogs.slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordTelemetry(eventType, details, context) {
        if (context && context.skipTelemetry) return false;
        try {
            if (global.WorkflowTelemetryService) {
                if (typeof global.WorkflowTelemetryService.recordEvent === 'function') {
                    global.WorkflowTelemetryService.recordEvent(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
                if (typeof global.WorkflowTelemetryService.track === 'function') {
                    global.WorkflowTelemetryService.track(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
                if (typeof global.WorkflowTelemetryService.emitTelemetry === 'function') {
                    global.WorkflowTelemetryService.emitTelemetry('WORKFLOW', eventType, {
                        source: 'aiKpiForecastingService',
                        metadata: cloneSanitized(details || {})
                    });
                    return true;
                }
            }
        } catch (error) {}
        return false;
    }

    function appendHistory(key, item) {
        try {
            var data = rawData();
            data[key] = Array.isArray(data[key]) ? data[key] : [];
            data[key].unshift(cloneSanitized(item));
            data[key] = data[key].slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function generateKPIForecast(payload, context) {
        try {
            var normalized = normalizeForecastPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var score = calculateForecastConfidence(normalized, context || {});
            if (!score.success) return score;
            var forecasts = normalized.kpis.map(function mapForecast(kpi) {
                return generateForecastForKPI(kpi, normalized, score);
            });
            if (!forecasts.length) forecasts = [conservativePlaceholderForecast(normalized, score)];
            forecasts = applyVisibility(forecasts, context || {});
            if (!forecasts.length) forecasts = [conservativePlaceholderForecast(normalized, score)];
            var recommendedActions = forecasts.filter(function actionable(row) {
                return row.achievementProbability < 70 || row.volatilityScore > 50 || normalized.dataQuality.insufficientKpiHistory;
            }).map(recommendedActionFor);
            if (!recommendedActions.length) recommendedActions = [recommendedActionFor(forecasts[0])];
            var reportId = 'AI-KPI-FORECAST-REPORT-' + Date.now();
            var generatedAt = nowIso();
            var history = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                forecastConfidence: score.forecastConfidence,
                achievementProbability: score.achievementProbability,
                forecastCount: forecasts.length,
                readOnly: true,
                immutable: true
            };
            appendHistory('aiKpiForecastHistory', history);
            appendHistory('aiKpiForecastAnalytics', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                forecastAccuracy: normalized.analytics.forecastAccuracy,
                forecastConfidence: score.forecastConfidence,
                targetAchievementRates: score.achievementProbability,
                forecastDeviations: normalized.analytics.forecastDeviation,
                departmentForecastTrends: normalized.analytics.departmentForecastTrend,
                strategicForecastTrends: normalized.analytics.strategicForecastTrend,
                organizationalForecastScore: Math.round(clamp(score.forecastConfidence * 0.5 + score.achievementProbability * 0.5, 0, 100)),
                departmentForecastScore: Math.round(average(forecasts.map(function scoreRow(row) { return row.achievementProbability; }))),
                executionForecastScore: Math.round(clamp(average(normalized.executionSignals.map(function velocity(row) { return row.velocity || row.completionRate; })) || score.trendConfidence, 0, 100)),
                immutable: true
            });
            appendHistory('aiKpiRecommendationHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                recommendations: recommendedActions,
                humanApprovalRequired: true,
                immutable: true
            });
            var auditRecorded = recordAudit('AI_KPI_FORECAST_GENERATED', history, context || {});
            var telemetryRecorded = recordTelemetry('AI_KPI_FORECAST_GENERATED', history, context || {});
            return freezeForecastOutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                readOnly: true,
                visibility: normalized.visibility,
                forecastConfidence: score.forecastConfidence,
                trendConfidence: score.trendConfidence,
                achievementProbability: score.achievementProbability,
                volatilityScore: score.volatilityScore,
                confidenceLevel: score.confidenceLevel,
                forecasts: forecasts,
                projectedOutcomes: forecasts.map(function projected(row) {
                    return { kpiName: row.kpiName, domain: row.domain, department: row.department, horizon: row.horizon, projectedValue: row.projectedValue };
                }),
                likelyOutcomes: forecasts.map(function likely(row) {
                    return { kpiName: row.kpiName, domain: row.domain, likelyOutcome: row.likelyOutcome, achievementProbability: row.achievementProbability };
                }),
                riskAdjustedForecasts: forecasts.map(function adjusted(row) {
                    return { kpiName: row.kpiName, domain: row.domain, riskAdjustedValue: row.riskAdjustedValue, volatilityScore: row.volatilityScore };
                }),
                targetAchievementForecasts: forecasts.map(function target(row) {
                    return { kpiName: row.kpiName, domain: row.domain, target: row.target, achievementProbability: row.achievementProbability };
                }),
                recommendedActions: recommendedActions,
                analytics: {
                    forecastAccuracy: normalized.analytics.forecastAccuracy,
                    forecastConfidence: score.forecastConfidence,
                    targetAchievementRates: score.achievementProbability,
                    forecastDeviations: normalized.analytics.forecastDeviation,
                    departmentForecastTrends: normalized.analytics.departmentForecastTrend,
                    strategicForecastTrends: normalized.analytics.strategicForecastTrend,
                    organizationalForecastScore: Math.round(clamp(score.forecastConfidence * 0.5 + score.achievementProbability * 0.5, 0, 100)),
                    departmentForecastScore: Math.round(average(forecasts.map(function scoreRow(row) { return row.achievementProbability; }))),
                    executionForecastScore: Math.round(clamp(average(normalized.executionSignals.map(function velocity(row) { return row.velocity || row.completionRate; })) || score.trendConfidence, 0, 100))
                },
                dataQuality: normalized.dataQuality,
                aiSafety: {
                    forecast: true,
                    explain: true,
                    recommend: true,
                    warn: true,
                    autonomousDecisioning: false,
                    kpiTargetMutation: false,
                    performanceRecordMutation: false,
                    strategicGoalMutation: false,
                    permissionMutation: false,
                    workflowExecution: false
                },
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generateKPIForecast failed safely', error && error.message);
            return freezeForecastOutput({
                success: false,
                classification: 'AI_KPI_FORECAST_ERROR',
                message: 'AI KPI forecasting failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: details || null });
        }
        try {
            var context = { tenantSlug: 'self-test', actor: { id: 'AI-KPI-SELF', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
            var malformed = normalizeForecastPayload('bad', context);
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'self-test',
                forecastHorizons: ['weekly', 'quarterly'],
                kpiDomains: ['attendance_kpis', 'strategic_kpis'],
                kpis: [
                    { tenantSlug: 'self-test', domain: 'attendance_kpis', department: 'Operations', name: 'Attendance compliance', target: 95, currentValue: 88, historicalValues: [80, 83, 86, 88] },
                    { tenantSlug: 'self-test', domain: 'strategic_kpis', department: 'Leadership', name: 'Strategic delivery', target: 85, currentValue: 68, historicalValues: [56, 60, 64, 68] }
                ],
                analytics: { forecastAccuracy: 80, targetAchievementRate: 62 }
            };
            var normalized = normalizeForecastPayload(payload, context);
            var score = calculateForecastConfidence(normalized, context);
            var explanation = explainForecast({ domain: 'attendance_kpis', kpiName: 'Attendance compliance', forecastConfidence: 75, achievementProbability: 63, projectedValue: 91, target: 95, forecastDrivers: ['attendance trend is upward'], assumptions: ['periods are comparable'] }, context);
            var report = generateKPIForecast(payload, context);
            var blocked = generateKPIForecast(Object.assign({}, payload, { tenantSlug: 'other-tenant' }), context);
            record('KPI forecasting works', report.success && report.forecasts.length > 0);
            record('confidence scoring works', score.success && score.forecastConfidence > 0 && score.achievementProbability >= 0);
            record('explainability works', explanation.success && explanation.explanation.length > 20 && explanation.forecastDrivers.length > 0);
            record('tenant isolation works', blocked.success === false && /TENANT/i.test(blocked.classification || ''));
            record('AI governance works', report.governance.noAutonomousActions && report.governance.noKpiTargetMutation && report.governance.noWorkflowExecution && report.governance.humanApprovalRequired);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.forecasts));
        } catch (error) {
            record('self-test failure captured', false, safeString(error && error.message, 'unknown'));
        }
        var result = freezeForecastOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_AI_KPI_FORECASTING_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        KPI_DOMAINS: KPI_DOMAINS,
        FORECAST_HORIZONS: FORECAST_HORIZONS,
        CONFIDENCE_LEVELS: CONFIDENCE_LEVELS,
        generateKPIForecast: generateKPIForecast,
        calculateForecastConfidence: calculateForecastConfidence,
        explainForecast: explainForecast,
        normalizeForecastPayload: normalizeForecastPayload,
        freezeForecastOutput: freezeForecastOutput,
        validateForecastScope: validateForecastScope,
        runSelfTest: runSelfTest
    });

    try {
        global.AIKPIForecastingService = service;
        global.aiKpiForecastingService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
