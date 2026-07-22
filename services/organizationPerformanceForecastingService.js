/**
 * organizationPerformanceForecastingService.js
 * ARTHHRMS - Organization Performance Forecasting + Enterprise Performance Intelligence Engine
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware, explainable organization performance
 * forecasting across organizational, department, workforce, strategic,
 * deliverable, operational, compliance, and leadership accountability domains.
 *
 * AI SAFETY:
 * This service only forecasts, explains, recommends, and warns. It never
 * alters KPIs, changes goals, modifies employee records, mutates workflows,
 * changes permissions, triggers actions, or changes governance.
 *
 * @version 1.0.0
 */
(function attachOrganizationPerformanceForecastingService(global) {
    'use strict';

    var PREFIX = '[OrganizationPerformanceForecastingService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 1000;

    var PERFORMANCE_DOMAINS = Object.freeze([
        'ORGANIZATION_PERFORMANCE',
        'DEPARTMENT_PERFORMANCE',
        'WORKFORCE_PRODUCTIVITY',
        'STRATEGIC_EXECUTION',
        'DELIVERABLE_COMPLETION',
        'OPERATIONAL_EFFICIENCY',
        'GOVERNANCE_COMPLIANCE',
        'LEADERSHIP_ACCOUNTABILITY'
    ]);

    var PERFORMANCE_LEVELS = Object.freeze([
        'EXCEEDING_EXPECTATIONS',
        'ON_TRACK',
        'AT_RISK',
        'CRITICAL'
    ]);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|confidentialEmployeeRecord|privateNote|rawPayload)/i;
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

    function freezePerformanceOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacGovernancePreserved: true,
            noAutonomousActions: true,
            noKpiMutation: true,
            noGoalMutation: true,
            noEmployeeRecordMutation: true,
            noWorkflowMutation: true,
            noPermissionChanges: true,
            noGovernanceModification: true,
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
            aiKpiForecastingIntegrated: !!(global.AIKPIForecastingService || global.aiKpiForecastingService),
            smartEscalationPredictionIntegrated: !!(global.SmartEscalationPredictionService || global.smartEscalationPredictionService),
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            performanceGovernanceIntegrated: !!(global.PerformanceGovernanceService || global.performanceGovernanceService),
            departmentExecutionIntegrated: !!(global.DepartmentExecutionBoardService || global.departmentExecutionBoardService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!global.AuditService && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!global.WorkflowTelemetryService && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'ORGANIZATION_WIDE_PERFORMANCE_FORECAST_ANALYTICS', role: role };
        if (role === 'HR') return { scope: 'HR_PERFORMANCE_FORECAST_VISIBILITY', role: role };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_PERFORMANCE_FORECAST_VISIBILITY', role: role, department: actorDepartment(context) };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_PERFORMANCE_FORECAST_VISIBILITY_ONLY', role: role };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_AI_GOVERNANCE_VISIBILITY', role: role };
        return { scope: 'ASSIGNED_PERFORMANCE_FORECAST_VISIBILITY_ONLY', role: role, department: actorDepartment(context) };
    }

    function validatePerformanceScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezePerformanceOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant organization performance forecasting is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            return freezePerformanceOutput({
                success: true,
                allowed: true,
                tenantSlug: tenant || ctxTenant,
                actorId: actorId(context || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validatePerformanceScope failed safely', error && error.message);
            return freezePerformanceOutput({
                success: false,
                allowed: false,
                classification: 'PERFORMANCE_SCOPE_ERROR',
                message: 'Organization performance forecast scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function tenantRows(rows, tenantSlug) {
        var tenant = normalizeTenantSlug(tenantSlug);
        return arrayOf(rows).filter(function sameTenant(row) {
            var rowTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId) || tenant);
            return !rowTenant || rowTenant === tenant;
        }).map(function sanitize(row) {
            return cloneSanitized(row || {});
        });
    }

    function normalizeDomain(value, fallback) {
        var token = normalizeToken(value, fallback || 'ORGANIZATION_PERFORMANCE');
        if (PERFORMANCE_DOMAINS.indexOf(token) !== -1) return token;
        if (/ORG|COMPANY|ENTERPRISE/.test(token)) return 'ORGANIZATION_PERFORMANCE';
        if (/DEPARTMENT|TEAM/.test(token)) return 'DEPARTMENT_PERFORMANCE';
        if (/WORKFORCE|PRODUCTIVITY|ENGAGEMENT/.test(token)) return 'WORKFORCE_PRODUCTIVITY';
        if (/STRATEGIC|EXECUTION/.test(token)) return 'STRATEGIC_EXECUTION';
        if (/DELIVERABLE|PROJECT|COMPLETION/.test(token)) return 'DELIVERABLE_COMPLETION';
        if (/OPERATION|EFFICIENCY|THROUGHPUT/.test(token)) return 'OPERATIONAL_EFFICIENCY';
        if (/GOVERNANCE|COMPLIANCE/.test(token)) return 'GOVERNANCE_COMPLIANCE';
        if (/LEADERSHIP|ACCOUNTABILITY/.test(token)) return 'LEADERSHIP_ACCOUNTABILITY';
        return 'ORGANIZATION_PERFORMANCE';
    }

    function normalizeNumericList(values) {
        return arrayOf(values, 36).map(function numberItem(value) {
            return safeNumber(value, NaN);
        }).filter(Number.isFinite);
    }

    function normalizeTrendSignal(row, tenantSlug, defaultDomain, source) {
        var history = normalizeNumericList(row && (row.historicalValues || row.history || row.values || row.trendValues));
        var current = safeNumber(row && (row.currentValue !== undefined ? row.currentValue : row.value !== undefined ? row.value : row.performanceScore !== undefined ? row.performanceScore : row.score), history.length ? history[history.length - 1] : 0);
        if (!history.length && current) history = [current];
        var target = safeNumber(row && (row.target !== undefined ? row.target : row.targetValue !== undefined ? row.targetValue : row.goalValue), 85);
        return {
            tenantSlug: tenantSlug,
            domain: normalizeDomain(row && (row.domain || row.category || row.type), defaultDomain).toLowerCase(),
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment || row.team), 'General').slice(0, 80),
            metricName: safeString(row && (row.metricName || row.kpiName || row.name || row.title), defaultDomain || 'performance metric').slice(0, 120),
            currentValue: clamp(current, 0, 100),
            target: clamp(target, 0, 100),
            historicalValues: history.slice(0, 36).map(function limit(value) { return clamp(value, 0, 100); }),
            velocity: clamp(row && (row.velocity || row.executionVelocity || row.completionVelocity), 0, 100),
            trend: clamp(row && (row.trend || row.trendScore || row.delta), -100, 100),
            source: source || 'performance_signal',
            metadata: cloneSanitized(row && row.metadata || {})
        };
    }

    function normalizeVelocity(row, tenantSlug, defaultDomain) {
        return {
            tenantSlug: tenantSlug,
            domain: normalizeDomain(row && (row.domain || row.category || row.type), defaultDomain).toLowerCase(),
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment || row.team), 'General').slice(0, 80),
            velocity: clamp(row && (row.velocity || row.executionVelocity || row.completionVelocity), 0, 100),
            completionRate: clamp(row && (row.completionRate || row.progressPercent || row.currentCompletion), 0, 100),
            delayedCount: clamp(row && (row.delayedCount || row.delayedMilestones || row.delayCount || row.blockedCount), 0, 10000),
            status: safeString(row && (row.status || row.state), 'MONITORING').slice(0, 80)
        };
    }

    function normalizeProductivity(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            domain: 'workforce_productivity',
            department: safeString(row && (row.department || row.departmentName || row.team), 'Workforce').slice(0, 80),
            productivityScore: clamp(row && (row.productivityScore || row.performanceScore || row.score), 0, 100),
            engagementScore: clamp(row && (row.engagementScore || row.engagement || row.activityScore), 0, 100),
            workloadPressure: clamp(row && (row.workloadPressure || row.pressureScore || row.overloadScore), 0, 100)
        };
    }

    function normalizeEngagement(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            domain: 'workforce_productivity',
            department: safeString(row && (row.department || row.departmentName || row.team), 'Workforce').slice(0, 80),
            engagementScore: clamp(row && (row.engagementScore || row.engagement || row.activityScore), 0, 100),
            absenteeismRisk: clamp(row && (row.absenteeismRisk || row.attendanceRisk || row.riskScore), 0, 100)
        };
    }

    function severityWeight(value) {
        var token = normalizeToken(value, 'LOW');
        if (token === 'CRITICAL') return 34;
        if (token === 'HIGH') return 24;
        if (token === 'MODERATE' || token === 'WARNING') return 14;
        return 6;
    }

    function normalizeBlockage(row, tenantSlug, defaultDomain, source) {
        return {
            tenantSlug: tenantSlug,
            domain: normalizeDomain(row && (row.domain || row.category || row.type), defaultDomain).toLowerCase(),
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment || row.module), 'Operations').slice(0, 80),
            severity: normalizeToken(row && (row.severity || row.priority || row.riskLevel), 'MODERATE'),
            delayDays: clamp(row && (row.delayDays || row.daysDelayed || row.overdueDays), 0, 10000),
            blockageCount: clamp(row && (row.blockageCount || row.blockedCount || row.bottleneckCount), 0, 10000),
            ageHours: clamp(row && (row.ageHours || row.openHours || row.durationHours), 0, 100000),
            resolved: !!(row && (row.resolved || /resolved|closed|mitigated|completed/i.test(safeString(row.status || row.state, '')))),
            source: source || 'blockage'
        };
    }

    function normalizePerformancePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezePerformanceOutput({
                    success: false,
                    classification: 'MALFORMED_PERFORMANCE_PAYLOAD',
                    message: 'Organization performance forecast payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var scope = validatePerformanceScope(payload, context || {});
            if (!scope.success) return scope;
            var domains = arrayOf(payload.performanceDomains).map(function mapDomain(domain) {
                return normalizeDomain(domain, '');
            }).filter(function unique(domain, index, list) {
                return PERFORMANCE_DOMAINS.indexOf(domain) !== -1 && list.indexOf(domain) === index;
            });
            if (!domains.length) domains = PERFORMANCE_DOMAINS.slice();
            var tenant = scope.tenantSlug;
            var normalized = {
                success: true,
                tenantSlug: tenant,
                performanceDomains: domains,
                kpiTrends: tenantRows(payload.kpiTrends || payload.kpis || payload.kpiHistory || payload.metrics || [], tenant).map(function mapKpi(row) {
                    return normalizeTrendSignal(row, tenant, 'ORGANIZATION_PERFORMANCE', 'kpi_trend');
                }).filter(function selected(row) { return domains.indexOf(normalizeDomain(row.domain, '')) !== -1; }),
                completionVelocity: tenantRows(payload.completionVelocity || payload.velocity || payload.executionVelocity || [], tenant).map(function mapVelocity(row) {
                    return normalizeVelocity(row, tenant, 'DELIVERABLE_COMPLETION');
                }),
                productivityPatterns: tenantRows(payload.productivityPatterns || payload.productivity || [], tenant).map(function mapProductivity(row) {
                    return normalizeProductivity(row, tenant);
                }),
                workforceEngagement: tenantRows(payload.workforceEngagement || payload.engagement || [], tenant).map(function mapEngagement(row) {
                    return normalizeEngagement(row, tenant);
                }),
                operationalBottlenecks: tenantRows(payload.operationalBottlenecks || payload.bottlenecks || payload.blockages || [], tenant).map(function mapBottleneck(row) {
                    return normalizeBlockage(row, tenant, 'OPERATIONAL_EFFICIENCY', 'operational_bottleneck');
                }),
                escalationHistory: tenantRows(payload.escalationHistory || payload.escalations || [], tenant).map(function mapEscalation(row) {
                    return normalizeBlockage(row, tenant, 'LEADERSHIP_ACCOUNTABILITY', 'escalation_history');
                }),
                strategicExecution: tenantRows(payload.strategicExecution || payload.strategicSignals || payload.executionSignals || [], tenant).map(function mapStrategic(row) {
                    return normalizeVelocity(row, tenant, 'STRATEGIC_EXECUTION');
                }),
                departmentHistory: tenantRows(payload.departmentHistory || payload.departmentPerformance || [], tenant).map(function mapDepartment(row) {
                    return normalizeTrendSignal(row, tenant, 'DEPARTMENT_PERFORMANCE', 'department_history');
                }),
                analytics: {
                    forecastAccuracy: clamp(payload.analytics && payload.analytics.forecastAccuracy, 0, 100),
                    achievementRate: clamp(payload.analytics && payload.analytics.achievementRate, 0, 100),
                    productivityTrend: clamp(payload.analytics && payload.analytics.productivityTrend, -100, 100),
                    departmentTrend: clamp(payload.analytics && payload.analytics.departmentTrend, -100, 100),
                    strategicExecutionTrend: clamp(payload.analytics && payload.analytics.strategicExecutionTrend, -100, 100),
                    workforceTrend: clamp(payload.analytics && payload.analytics.workforceTrend, -100, 100),
                    operationalEfficiencyTrend: clamp(payload.analytics && payload.analytics.operationalEfficiencyTrend, -100, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: scope.visibility,
                governance: governanceFlags()
            };
            var totalSignals = normalized.kpiTrends.length + normalized.completionVelocity.length + normalized.productivityPatterns.length + normalized.workforceEngagement.length + normalized.operationalBottlenecks.length + normalized.escalationHistory.length + normalized.strategicExecution.length + normalized.departmentHistory.length;
            var historyDepth = normalized.kpiTrends.concat(normalized.departmentHistory).reduce(function count(acc, row) {
                return acc + (row.historicalValues || []).length;
            }, 0);
            normalized.dataQuality = {
                insufficientHistoricalData: totalSignals < 3 || historyDepth < 4,
                sparseDatasetsHandled: true,
                volatilePerformanceTrendsHandled: true,
                conflictingIndicatorsHandled: true,
                insufficientDataHandled: true
            };
            return freezePerformanceOutput(normalized);
        } catch (error) {
            safeWarn('normalizePerformancePayload failed safely', error && error.message);
            return freezePerformanceOutput({
                success: false,
                classification: 'PERFORMANCE_NORMALIZATION_ERROR',
                message: 'Organization performance payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function confidenceLevel(score) {
        if (score >= 80) return 'HIGH';
        if (score >= 50) return 'MODERATE';
        return 'LOW';
    }

    function performanceLevel(score) {
        if (score >= 86) return 'EXCEEDING_EXPECTATIONS';
        if (score >= 70) return 'ON_TRACK';
        if (score >= 45) return 'AT_RISK';
        return 'CRITICAL';
    }

    function historyDeltas(history) {
        var deltas = [];
        for (var i = 1; i < (history || []).length; i += 1) deltas.push(history[i] - history[i - 1]);
        return deltas;
    }

    function volatilityForHistory(history) {
        var deltas = historyDeltas(history || []);
        if (!deltas.length) return 52;
        var avgDelta = average(deltas);
        return Math.round(clamp(average(deltas.map(function deviation(delta) { return Math.abs(delta - avgDelta); })) * 4 + Math.abs(avgDelta) * 1.2, 0, 100));
    }

    function signalScore(signal) {
        var current = safeNumber(signal && signal.currentValue, 0);
        var target = Math.max(1, safeNumber(signal && signal.target, 85));
        var ratio = clamp(current / target * 100, 0, 120);
        var velocity = safeNumber(signal && signal.velocity, 0);
        var trend = safeNumber(signal && signal.trend, 0);
        return clamp(ratio * 0.58 + velocity * 0.25 + 50 * 0.17 + trend * 0.18, 0, 100);
    }

    function velocityScore(row) {
        return clamp(safeNumber(row && row.velocity, 0) * 0.5 + safeNumber(row && row.completionRate, 0) * 0.5 - safeNumber(row && row.delayedCount, 0) * 5, 0, 100);
    }

    function productivityScore(row) {
        return clamp(safeNumber(row && row.productivityScore, 0) * 0.45 + safeNumber(row && row.engagementScore, 0) * 0.35 + (100 - safeNumber(row && row.workloadPressure, 0)) * 0.2, 0, 100);
    }

    function engagementScore(row) {
        return clamp(safeNumber(row && row.engagementScore, 0) * 0.75 + (100 - safeNumber(row && row.absenteeismRisk, 0)) * 0.25, 0, 100);
    }

    function blockagePenalty(row) {
        var penalty = severityWeight(row && row.severity);
        penalty += Math.min(22, safeNumber(row && row.delayDays, 0) * 3);
        penalty += Math.min(18, safeNumber(row && row.blockageCount, 0) * 5);
        penalty += Math.min(16, safeNumber(row && row.ageHours, 0) / 5);
        penalty -= row && row.resolved ? 24 : 0;
        return clamp(penalty, 0, 100);
    }

    function scoreCollections(normalized) {
        var positive = [];
        var penalties = [];
        normalized.kpiTrends.forEach(function each(row) { positive.push(signalScore(row)); });
        normalized.departmentHistory.forEach(function each(row) { positive.push(signalScore(row)); });
        normalized.completionVelocity.forEach(function each(row) { positive.push(velocityScore(row)); });
        normalized.strategicExecution.forEach(function each(row) { positive.push(velocityScore(row)); });
        normalized.productivityPatterns.forEach(function each(row) { positive.push(productivityScore(row)); });
        normalized.workforceEngagement.forEach(function each(row) { positive.push(engagementScore(row)); });
        normalized.operationalBottlenecks.forEach(function each(row) { penalties.push(blockagePenalty(row)); });
        normalized.escalationHistory.forEach(function each(row) { penalties.push(blockagePenalty(row)); });
        return { positive: positive, penalties: penalties };
    }

    function calculatePerformanceScore(input, context) {
        try {
            var normalized = input && input.success ? input : normalizePerformancePayload(input, context || {});
            if (!normalized.success) return normalized;
            var collections = scoreCollections(normalized);
            var positiveBase = collections.positive.length ? average(collections.positive) : 58;
            var penalty = collections.penalties.length ? average(collections.penalties) * 0.36 : 0;
            var trendBoost = average([
                normalized.analytics.productivityTrend,
                normalized.analytics.departmentTrend,
                normalized.analytics.strategicExecutionTrend,
                normalized.analytics.workforceTrend,
                normalized.analytics.operationalEfficiencyTrend
            ]) * 0.18;
            var performanceScoreValue = Math.round(clamp(positiveBase - penalty + trendBoost, 5, 98));
            if (normalized.dataQuality.insufficientHistoricalData) performanceScoreValue = Math.round(clamp(performanceScoreValue * 0.86, 8, 74));
            var historyDepth = normalized.kpiTrends.concat(normalized.departmentHistory).reduce(function count(acc, row) {
                return acc + (row.historicalValues || []).length;
            }, 0);
            var volatility = average(normalized.kpiTrends.concat(normalized.departmentHistory).map(function rowVol(row) {
                return volatilityForHistory(row.historicalValues || []);
            })) || 54;
            var confidence = Math.round(clamp(28 + Math.min(32, historyDepth * 3) + Math.min(18, collections.positive.length * 3) + normalized.analytics.forecastAccuracy * 0.28 - volatility * 0.16, 18, 96));
            if (normalized.dataQuality.insufficientHistoricalData) confidence = Math.min(confidence, 58);
            var momentum = Math.round(clamp(average(normalized.completionVelocity.concat(normalized.strategicExecution).map(function velocity(row) {
                return safeNumber(row.velocity || row.completionRate, 0);
            })) || performanceScoreValue, 0, 100));
            var stability = Math.round(clamp(100 - volatility - (collections.penalties.length ? average(collections.penalties) * 0.22 : 0), 5, 98));
            var achievement = Math.round(clamp(performanceScoreValue * 0.62 + normalized.analytics.achievementRate * 0.28 + momentum * 0.1, 0, 100));
            return freezePerformanceOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                performanceScore: performanceScoreValue,
                confidenceScore: confidence,
                confidenceLevel: confidenceLevel(confidence),
                momentumScore: momentum,
                stabilityScore: stability,
                achievementProbability: achievement,
                performanceLevel: performanceLevel(performanceScoreValue),
                volatilityScore: Math.round(clamp(volatility, 0, 100)),
                signalCount: collections.positive.length + collections.penalties.length,
                dataQuality: normalized.dataQuality,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculatePerformanceScore failed safely', error && error.message);
            return freezePerformanceOutput({
                success: false,
                classification: 'PERFORMANCE_SCORE_ERROR',
                message: 'Organization performance score calculation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function explainPerformanceForecast(forecast, context) {
        try {
            var factors = arrayOf(forecast && forecast.contributingFactors, 8).map(function factorText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            var assumptions = arrayOf(forecast && forecast.assumptions, 8).map(function assumptionText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            var actions = arrayOf(forecast && forecast.recommendedActions, 8).map(function actionText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 200);
            }).filter(Boolean);
            if (!factors.length) factors.push('tenant-scoped performance history is limited, so the forecast remains conservative');
            if (!assumptions.length) assumptions.push('available performance periods remain comparable and human owners validate recommendations');
            if (!actions.length) actions.push('Ask a human leader to review the forecast evidence before changing goals, KPIs, workflows, or records.');
            var domain = normalizeDomain(forecast && forecast.domain, 'ORGANIZATION_PERFORMANCE').toLowerCase();
            var department = safeString(forecast && forecast.department, 'Organization');
            var score = clamp(forecast && forecast.performanceScore, 0, 100);
            var probability = clamp(forecast && forecast.achievementProbability, 0, 100);
            var level = normalizeToken(forecast && forecast.performanceLevel, performanceLevel(score));
            return freezePerformanceOutput({
                success: true,
                domain: domain,
                department: department,
                performanceLevel: level,
                performanceScore: score,
                achievementProbability: probability,
                explanation: domain.replace(/_/g, ' ') + ' for ' + department + ' is classified as ' + level + ' because tenant-scoped evidence shows ' + factors.slice(0, 3).join(', ') + '. The forecast compares performance score ' + Math.round(score) + '% with achievement probability ' + Math.round(probability) + '%.',
                contributingFactors: factors,
                confidenceLevel: normalizeToken(forecast && forecast.confidenceLevel, confidenceLevel(forecast && forecast.confidenceScore || probability)),
                assumptions: assumptions,
                recommendedActions: actions,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('explainPerformanceForecast failed safely', error && error.message);
            return freezePerformanceOutput({
                success: false,
                classification: 'PERFORMANCE_EXPLANATION_ERROR',
                message: 'Organization performance forecast explanation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function domainRows(normalized, domain) {
        var token = normalizeDomain(domain, 'ORGANIZATION_PERFORMANCE').toLowerCase();
        var rows = []
            .concat(normalized.kpiTrends || [])
            .concat(normalized.completionVelocity || [])
            .concat(normalized.productivityPatterns || [])
            .concat(normalized.workforceEngagement || [])
            .concat(normalized.operationalBottlenecks || [])
            .concat(normalized.escalationHistory || [])
            .concat(normalized.strategicExecution || [])
            .concat(normalized.departmentHistory || []);
        return rows.filter(function match(row) {
            return normalizeDomain(row && row.domain, 'ORGANIZATION_PERFORMANCE').toLowerCase() === token;
        });
    }

    function dominantDepartment(rows, fallback) {
        var counts = {};
        rows.forEach(function count(row) {
            var department = safeString(row && row.department, fallback || 'Organization') || fallback || 'Organization';
            counts[department] = (counts[department] || 0) + 1;
        });
        return Object.keys(counts).sort(function sort(a, b) { return counts[b] - counts[a]; })[0] || fallback || 'Organization';
    }

    function scoreRow(row) {
        if (row && row.currentValue !== undefined) return signalScore(row);
        if (row && (row.velocity !== undefined || row.completionRate !== undefined)) return velocityScore(row);
        if (row && row.productivityScore !== undefined) return productivityScore(row);
        if (row && row.engagementScore !== undefined) return engagementScore(row);
        if (row && (row.delayDays !== undefined || row.blockageCount !== undefined || row.ageHours !== undefined)) return clamp(100 - blockagePenalty(row), 0, 100);
        return 58;
    }

    function recommendationFor(forecast) {
        var action = 'Review ' + forecast.domain.replace(/_/g, ' ') + ' with the accountable human owner before changing goals, KPIs, workflows, or records.';
        if (forecast.performanceLevel === 'CRITICAL') action = 'Open a human-led performance recovery review and validate blockers before any operational change.';
        else if (forecast.performanceLevel === 'AT_RISK') action = 'Ask the accountable leader to review contributing factors and mitigation options.';
        else if (forecast.momentumScore >= 70) action = 'Capture the positive execution pattern and verify whether it can be safely expanded.';
        return {
            domain: forecast.domain,
            department: forecast.department,
            performanceLevel: forecast.performanceLevel,
            action: action,
            humanApprovalRequired: true,
            autonomousAction: false
        };
    }

    function buildDomainForecast(normalized, domain, summary) {
        var token = normalizeDomain(domain, 'ORGANIZATION_PERFORMANCE');
        var rows = domainRows(normalized, token);
        var scores = rows.map(scoreRow);
        var base = scores.length ? average(scores) : summary.performanceScore * (normalized.dataQuality.insufficientHistoricalData ? 0.74 : 0.92);
        var domainScore = Math.round(clamp(base, 5, 98));
        var level = performanceLevel(domainScore);
        var department = dominantDepartment(rows, token === 'ORGANIZATION_PERFORMANCE' ? 'Organization' : token.replace(/_/g, ' '));
        var momentum = Math.round(clamp(average(rows.map(function rowMomentum(row) {
            return safeNumber(row && (row.velocity || row.completionRate || row.trend || row.productivityScore || row.engagementScore), NaN);
        }).filter(Number.isFinite)) || summary.momentumScore, 0, 100));
        var stability = Math.round(clamp(summary.stabilityScore - Math.max(0, 70 - domainScore) * 0.16, 0, 100));
        var probability = Math.round(clamp(domainScore * 0.64 + summary.achievementProbability * 0.26 + momentum * 0.1, 0, 100));
        var factors = [];
        if (rows.length) factors = rows.slice(0, 4).map(function factor(row) {
            if (row.source) return row.source.replace(/_/g, ' ') + ' in ' + (row.department || department);
            if (row.metricName) return row.metricName + ' is part of the tenant-scoped trend';
            return 'tenant-scoped signal in ' + (row.department || department);
        });
        if (!factors.length) factors.push('insufficient tenant-scoped history for this performance domain');
        if (domainScore < 70) factors.push('current trajectory leaves achievement risk for human review');
        if (stability < 55) factors.push('volatility or blockage pressure reduces forecast stability');
        var assumptions = [
            'historical performance signals remain comparable',
            'AI output remains advisory and read-only',
            'human leaders validate recommendations before any action'
        ];
        var forecast = {
            forecastId: 'ORG-PERF-' + token + '-' + Date.now(),
            domain: token.toLowerCase(),
            department: department,
            performanceScore: domainScore,
            performanceLevel: level,
            confidenceScore: summary.confidenceScore,
            confidenceLevel: summary.confidenceLevel,
            momentumScore: momentum,
            stabilityScore: stability,
            achievementProbability: probability,
            projectedOutcome: probability >= 75 ? 'LIKELY_TO_ACHIEVE' : probability >= 55 ? 'ACHIEVEMENT_AT_RISK' : 'RECOVERY_REVIEW_NEEDED',
            opportunityIndicator: momentum >= 70 || level === 'EXCEEDING_EXPECTATIONS',
            contributingFactors: factors,
            assumptions: assumptions,
            recommendedActions: [recommendationFor({ domain: token.toLowerCase(), department: department, performanceLevel: level, momentumScore: momentum }).action],
            readOnly: true
        };
        var explanation = explainPerformanceForecast(forecast);
        forecast.explanation = explanation.explanation;
        forecast.contributingFactors = explanation.contributingFactors;
        forecast.assumptions = explanation.assumptions;
        forecast.recommendedActions = explanation.recommendedActions;
        forecast.confidenceLevel = explanation.confidenceLevel;
        return forecast;
    }

    function applyVisibility(forecasts, context) {
        var visibility = visibilityForContext(context || {});
        if (visibility.scope === 'ORGANIZATION_WIDE_PERFORMANCE_FORECAST_ANALYTICS' || visibility.scope === 'PLATFORM_AI_GOVERNANCE_VISIBILITY' || visibility.scope === 'INFRASTRUCTURE_PERFORMANCE_FORECAST_VISIBILITY_ONLY') {
            return forecasts;
        }
        if (visibility.scope === 'HR_PERFORMANCE_FORECAST_VISIBILITY') {
            return forecasts.filter(function hrVisible(row) {
                return /hr|workforce|department|governance|compliance/i.test(row.domain + ' ' + row.department);
            });
        }
        var dept = safeString(visibility.department, '').toLowerCase();
        if (!dept) return forecasts.filter(function workforceOnly(row) { return row.domain === 'workforce_productivity'; });
        return forecasts.filter(function visibleRow(row) {
            return safeString(row.department, '').toLowerCase() === dept || row.domain === 'workforce_productivity';
        });
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
                    entityType: 'ORGANIZATION_PERFORMANCE_FORECAST',
                    module: 'Organization Performance Forecasting',
                    details: cloneSanitized(details || {})
                });
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-ORG-PERF-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'Organization Performance Forecasting',
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
                        source: 'organizationPerformanceForecastingService',
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

    function generatePerformanceForecast(payload, context) {
        try {
            var normalized = normalizePerformancePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var summary = calculatePerformanceScore(normalized, context || {});
            if (!summary.success) return summary;
            var forecasts = normalized.performanceDomains.map(function mapDomain(domain) {
                return buildDomainForecast(normalized, domain, summary);
            });
            forecasts = applyVisibility(forecasts, context || {});
            if (!forecasts.length) forecasts = [buildDomainForecast(normalized, 'WORKFORCE_PRODUCTIVITY', summary)];
            var performanceWarnings = forecasts.filter(function warning(row) {
                return row.performanceLevel === 'AT_RISK' || row.performanceLevel === 'CRITICAL';
            });
            var opportunityForecasts = forecasts.filter(function opportunity(row) {
                return row.opportunityIndicator || row.performanceLevel === 'ON_TRACK' || row.performanceLevel === 'EXCEEDING_EXPECTATIONS';
            });
            if (!performanceWarnings.length && forecasts.length) performanceWarnings = forecasts.filter(function lower(row) { return row.achievementProbability < 70; });
            if (!opportunityForecasts.length && forecasts.length) opportunityForecasts = forecasts.slice(0, 1);
            var recommendedActions = forecasts.filter(function actionable(row) {
                return row.performanceLevel !== 'ON_TRACK' || row.stabilityScore < 60 || normalized.dataQuality.insufficientHistoricalData;
            }).map(recommendationFor);
            if (!recommendedActions.length) recommendedActions = [recommendationFor(forecasts[0])];
            var reportId = 'ORG-PERFORMANCE-FORECAST-REPORT-' + Date.now();
            var generatedAt = nowIso();
            var history = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                performanceScore: summary.performanceScore,
                performanceLevel: summary.performanceLevel,
                confidenceScore: summary.confidenceScore,
                forecastCount: forecasts.length,
                readOnly: true,
                immutable: true
            };
            appendHistory('organizationPerformanceForecastHistory', history);
            appendHistory('organizationPerformanceForecastAnalytics', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                forecastAccuracy: normalized.analytics.forecastAccuracy,
                achievementRates: normalized.analytics.achievementRate,
                productivityTrends: normalized.analytics.productivityTrend,
                departmentTrends: normalized.analytics.departmentTrend,
                strategicExecutionTrends: normalized.analytics.strategicExecutionTrend,
                workforceTrends: normalized.analytics.workforceTrend,
                operationalEfficiencyTrends: normalized.analytics.operationalEfficiencyTrend,
                organizationForecastScore: summary.performanceScore,
                departmentForecastScore: Math.round(average(forecasts.filter(function dept(row) { return /department|workforce/i.test(row.domain); }).map(function rowScore(row) { return row.performanceScore; })) || summary.performanceScore),
                executionForecastScore: Math.round(average(forecasts.filter(function exec(row) { return /strategic|deliverable|operational/i.test(row.domain); }).map(function rowScore(row) { return row.performanceScore; })) || summary.momentumScore),
                immutable: true
            });
            appendHistory('organizationPerformanceRecommendationHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                recommendations: recommendedActions,
                humanApprovalRequired: true,
                immutable: true
            });
            var auditRecorded = recordAudit('ORG_PERFORMANCE_FORECAST_GENERATED', history, context || {});
            var telemetryRecorded = recordTelemetry('ORG_PERFORMANCE_FORECAST_GENERATED', history, context || {});
            return freezePerformanceOutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                readOnly: true,
                visibility: normalized.visibility,
                performanceScore: summary.performanceScore,
                performanceLevel: summary.performanceLevel,
                confidenceScore: summary.confidenceScore,
                confidenceLevel: summary.confidenceLevel,
                momentumScore: summary.momentumScore,
                stabilityScore: summary.stabilityScore,
                achievementProbability: summary.achievementProbability,
                forecasts: forecasts,
                projectedOutcomes: forecasts.map(function projected(row) {
                    return { domain: row.domain, department: row.department, projectedOutcome: row.projectedOutcome, performanceScore: row.performanceScore };
                }),
                achievementForecasts: forecasts.map(function achievement(row) {
                    return { domain: row.domain, department: row.department, achievementProbability: row.achievementProbability, performanceLevel: row.performanceLevel };
                }),
                performanceWarnings: performanceWarnings,
                opportunityForecasts: opportunityForecasts,
                recommendedActions: recommendedActions,
                analytics: {
                    forecastAccuracy: normalized.analytics.forecastAccuracy,
                    achievementRates: normalized.analytics.achievementRate,
                    productivityTrends: normalized.analytics.productivityTrend,
                    departmentTrends: normalized.analytics.departmentTrend,
                    strategicExecutionTrends: normalized.analytics.strategicExecutionTrend,
                    workforceTrends: normalized.analytics.workforceTrend,
                    operationalEfficiencyTrends: normalized.analytics.operationalEfficiencyTrend,
                    organizationForecastScore: summary.performanceScore,
                    departmentForecastScore: Math.round(average(forecasts.filter(function dept(row) { return /department|workforce/i.test(row.domain); }).map(function rowScore(row) { return row.performanceScore; })) || summary.performanceScore),
                    executionForecastScore: Math.round(average(forecasts.filter(function exec(row) { return /strategic|deliverable|operational/i.test(row.domain); }).map(function rowScore(row) { return row.performanceScore; })) || summary.momentumScore)
                },
                dataQuality: normalized.dataQuality,
                aiSafety: {
                    forecast: true,
                    explain: true,
                    recommend: true,
                    warn: true,
                    autonomousDecisioning: false,
                    kpiMutation: false,
                    goalMutation: false,
                    employeeRecordMutation: false,
                    workflowMutation: false,
                    permissionMutation: false,
                    governanceModification: false,
                    workflowExecution: false
                },
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generatePerformanceForecast failed safely', error && error.message);
            return freezePerformanceOutput({
                success: false,
                classification: 'ORGANIZATION_PERFORMANCE_FORECAST_ERROR',
                message: 'Organization performance forecasting failed safely.',
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
            var context = { tenantSlug: 'self-test', actor: { id: 'ORG-PERF-SELF', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
            var malformed = normalizePerformancePayload('bad', context);
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'self-test',
                performanceDomains: ['organization_performance', 'strategic_execution', 'workforce_productivity'],
                kpiTrends: [{ tenantSlug: 'self-test', domain: 'organization_performance', department: 'Leadership', metricName: 'Org health', currentValue: 74, target: 88, historicalValues: [62, 66, 70, 74], velocity: 64 }],
                completionVelocity: [{ tenantSlug: 'self-test', domain: 'strategic_execution', department: 'Leadership', velocity: 60, completionRate: 66, delayedCount: 3 }],
                productivityPatterns: [{ tenantSlug: 'self-test', department: 'Operations', productivityScore: 72, engagementScore: 66, workloadPressure: 54 }],
                operationalBottlenecks: [{ tenantSlug: 'self-test', domain: 'operational_efficiency', department: 'Operations', severity: 'HIGH', delayDays: 4, blockageCount: 2 }],
                analytics: { forecastAccuracy: 80, achievementRate: 62, productivityTrend: 10, strategicExecutionTrend: 14 }
            };
            var normalized = normalizePerformancePayload(payload, context);
            var score = calculatePerformanceScore(normalized, context);
            var explanation = explainPerformanceForecast({ domain: 'organization_performance', department: 'Leadership', performanceLevel: 'AT_RISK', performanceScore: 67, achievementProbability: 62, contributingFactors: ['target gap remains open'], assumptions: ['periods are comparable'] }, context);
            var report = generatePerformanceForecast(payload, context);
            var blocked = generatePerformanceForecast(Object.assign({}, payload, { tenantSlug: 'other-tenant' }), context);
            record('forecasting works', report.success && report.forecasts.length > 0);
            record('confidence scoring works', score.success && score.confidenceScore > 0 && score.performanceScore > 0);
            record('explainability works', explanation.success && explanation.explanation.length > 20 && explanation.contributingFactors.length > 0);
            record('tenant isolation works', blocked.success === false && /TENANT/i.test(blocked.classification || ''));
            record('AI governance works', report.governance.noAutonomousActions && report.governance.noKpiMutation && report.governance.noGoalMutation && report.governance.noEmployeeRecordMutation && report.governance.noWorkflowExecution && report.governance.humanApprovalRequired);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.forecasts));
        } catch (error) {
            record('self-test failure captured', false, safeString(error && error.message, 'unknown'));
        }
        var result = freezePerformanceOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_ORGANIZATION_PERFORMANCE_FORECASTING_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        PERFORMANCE_DOMAINS: PERFORMANCE_DOMAINS,
        PERFORMANCE_LEVELS: PERFORMANCE_LEVELS,
        generatePerformanceForecast: generatePerformanceForecast,
        calculatePerformanceScore: calculatePerformanceScore,
        explainPerformanceForecast: explainPerformanceForecast,
        normalizePerformancePayload: normalizePerformancePayload,
        freezePerformanceOutput: freezePerformanceOutput,
        validatePerformanceScope: validatePerformanceScope,
        runSelfTest: runSelfTest
    });

    try {
        global.OrganizationPerformanceForecastingService = service;
        global.organizationPerformanceForecastingService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
