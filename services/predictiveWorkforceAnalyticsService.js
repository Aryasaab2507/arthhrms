/**
 * predictiveWorkforceAnalyticsService.js
 * ARTHHRMS - Predictive Workforce Analytics + Workforce Intelligence Forecasting Engine
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware, explainable workforce forecasting for
 * workforce growth, capacity, utilization, attendance, leave demand, hiring
 * demand, staffing gaps, engagement, and workforce health.
 *
 * AI SAFETY:
 * AI output is advisory only. This service never hires, terminates, approves
 * leave, approves promotions, modifies employee records, mutates workforce
 * structure, executes workflows, changes permissions, or bypasses governance.
 *
 * @version 1.0.0
 */
(function attachPredictiveWorkforceAnalyticsService(global) {
    'use strict';

    var PREFIX = '[PredictiveWorkforceAnalyticsService]';
    var MAX_ROWS = 1200;
    var MAX_HISTORY = 500;

    var FORECAST_DOMAINS = Object.freeze([
        'WORKFORCE_GROWTH',
        'WORKFORCE_CAPACITY',
        'ATTENDANCE_PATTERNS',
        'LEAVE_DEMAND',
        'DEPARTMENT_UTILIZATION',
        'WORKFORCE_ENGAGEMENT',
        'HIRING_DEMAND',
        'STAFFING_GAPS'
    ]);

    var FORECAST_HORIZONS = Object.freeze(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);
    var RISK_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|payroll.?amount|payslip|compensation|ctc|gross|net|basic|hra|pf|tds|allowance|deduction|leave.?balance|leaveBalance|bank|tax|password|secret|token|jwt|authorization|private.?key|service.?role|signed.?url|download.?url|storage.?path|file.?path|document|raw.?payload|rawPayload|raw.?content|payload|body|confidentialEmployeeRecord|confidentialNote|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|private tenant workforce data|raw tenant data)\s*[:=]?\s*[\w,.\- ]*/ig;

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

    function arrayOf(value, max) {
        return Array.isArray(value) ? value.slice(0, max || MAX_ROWS) : [];
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
        if (role === 'CEO' || role === 'CFO' || role === 'COO' || role === 'CHRO' || role === 'EXECUTIVE') return 'EXECUTIVE';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeDomain(value, fallback) {
        var domain = normalizeToken(value, fallback || 'WORKFORCE_CAPACITY');
        if (domain === 'CAPACITY') return 'WORKFORCE_CAPACITY';
        if (domain === 'ATTENDANCE') return 'ATTENDANCE_PATTERNS';
        if (domain === 'LEAVE') return 'LEAVE_DEMAND';
        if (domain === 'UTILIZATION') return 'DEPARTMENT_UTILIZATION';
        if (domain === 'ENGAGEMENT') return 'WORKFORCE_ENGAGEMENT';
        if (domain === 'HIRING') return 'HIRING_DEMAND';
        if (domain === 'STAFFING') return 'STAFFING_GAPS';
        return FORECAST_DOMAINS.indexOf(domain) !== -1 ? domain : (fallback || 'WORKFORCE_CAPACITY');
    }

    function normalizeHorizon(value, fallback) {
        var horizon = normalizeToken(value, fallback || 'MONTHLY');
        return FORECAST_HORIZONS.indexOf(horizon) !== -1 ? horizon : (fallback || 'MONTHLY');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.userId || context.actor.empId || context.actor.employeeId || context.actor.email) || context && (context.actorId || context.userId || context.employeeId) || '', '');
    }

    function actorDepartment(context) {
        return safeString(context && context.actor && (context.actor.department || context.actor.departmentName) || context && (context.department || context.departmentName) || '', '').trim();
    }

    function actorRole(context) {
        return normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug));
    }

    function sameTenant(row, tenantSlug) {
        var rowScope = rowTenant(row);
        return !tenantSlug || !rowScope || rowScope === tenantSlug;
    }

    function defaultTenant(data) {
        var source = data || rawData();
        var settings = source && source.companySettings || {};
        var tenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || settings.companySlug);
        if (tenant) return tenant;
        var first = Array.isArray(source && source.platformTenants) ? source.platformTenants[0] : null;
        return normalizeTenantSlug(first && (first.tenantSlug || first.tenantId || first.companyId));
    }

    function resolveTenant(payload, context, data) {
        return normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId)) || contextTenant(context || {}) || defaultTenant(data);
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

    function freezeWorkforceOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            workforceAnalyticsGovernancePreserved: true,
            aiGovernancePreserved: true,
            rbacAuthoritative: true,
            aiAdvisoryOnly: true,
            explainableOutputsOnly: true,
            noAutonomousActions: true,
            noHRDecisionMaking: true,
            noHiringAction: true,
            noTerminationAction: true,
            noLeaveApproval: true,
            noPromotionApproval: true,
            noEmployeeRecordModification: true,
            noWorkforceStructureMutation: true,
            noWorkflowExecution: true,
            noPermissionChanges: true,
            noGovernanceBypass: true,
            immutableForecastHistory: true,
            immutableWorkforceReports: true,
            immutableRecommendationHistory: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            strategicAIAssistantIntegrated: !!(global.StrategicAIAssistantService || global.strategicAIAssistantService),
            executiveDecisionIntelligenceIntegrated: !!(global.ExecutiveDecisionIntelligenceService || global.executiveDecisionIntelligenceService),
            organizationPerformanceForecastingIntegrated: !!(global.OrganizationPerformanceForecastingService || global.organizationPerformanceForecastingService),
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            aiKpiForecastingIntegrated: !!(global.AIKPIForecastingService || global.aiKpiForecastingService),
            smartEscalationPredictionIntegrated: !!(global.SmartEscalationPredictionService || global.smartEscalationPredictionService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!(global.AuditService || global.auditService) && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService) && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = actorRole(context || {});
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'EXECUTIVE') return { scope: 'ORGANIZATION_WORKFORCE_FORECAST_VISIBILITY', role: role };
        if (role === 'HR') return { scope: 'HR_WORKFORCE_FORECAST_VISIBILITY', role: role };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_WORKFORCE_FORECAST_VISIBILITY', role: role, department: actorDepartment(context) };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_WORKFORCE_FORECAST_VISIBILITY_ONLY', role: role };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_WORKFORCE_GOVERNANCE_VISIBILITY_ONLY', role: role };
        return { scope: 'ASSIGNED_WORKFORCE_FORECAST_VISIBILITY_ONLY', role: role, department: actorDepartment(context), actorId: actorId(context) };
    }

    function validateWorkforceScope(payload, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(payload || {}, context || {}, data);
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeWorkforceOutput({
                    success: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Predictive workforce analytics blocked because payload tenant does not match context tenant.',
                    tenantSlug: ctxTenant || tenant,
                    governance: governanceFlags()
                });
            }
            var visibility = visibilityForContext(context || {});
            if (visibility.scope === 'INFRASTRUCTURE_WORKFORCE_FORECAST_VISIBILITY_ONLY') {
                return freezeWorkforceOutput({
                    success: false,
                    classification: 'INFRASTRUCTURE_ONLY_ROLE_BLOCKED',
                    message: 'SUPER_ADMIN can monitor infrastructure only and cannot access tenant workforce forecasts.',
                    tenantSlug: tenant,
                    visibility: visibility,
                    governance: governanceFlags()
                });
            }
            if (visibility.scope === 'PLATFORM_WORKFORCE_GOVERNANCE_VISIBILITY_ONLY') {
                return freezeWorkforceOutput({
                    success: false,
                    classification: 'PLATFORM_GOVERNANCE_ONLY_ROLE_BLOCKED',
                    message: 'PLATFORM_OWNER remains isolated from tenant workforce forecast chains.',
                    tenantSlug: tenant,
                    visibility: visibility,
                    governance: governanceFlags()
                });
            }
            return {
                success: true,
                tenantSlug: tenant,
                visibility: visibility
            };
        } catch (error) {
            safeWarn('validateWorkforceScope failed safely', error && error.message);
            return freezeWorkforceOutput({
                success: false,
                classification: 'WORKFORCE_SCOPE_VALIDATION_ERROR',
                message: 'Predictive workforce analytics scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function tenantRows(rows, tenantSlug) {
        return arrayOf(rows).filter(function scoped(row) {
            return isPlainObject(row) && sameTenant(row, tenantSlug);
        });
    }

    function normalizeDepartment(row, fallback) {
        return safeString(row && (row.department || row.departmentName || row.team || row.unit || row.ownerDepartment), fallback || 'Workforce').slice(0, 80) || (fallback || 'Workforce');
    }

    function normalizeAttendance(row, tenantSlug) {
        var status = normalizeToken(row && (row.status || row.state || row.attendanceStatus), 'PRESENT');
        var attendanceRate = row && row.attendanceRate !== undefined ? safeNumber(row.attendanceRate, 0) : (/present|approved|checked_in/i.test(status) ? 92 : /late/i.test(status) ? 72 : /absent|missing/i.test(status) ? 35 : 78);
        var absenceRate = row && row.absenceRate !== undefined ? safeNumber(row.absenceRate, 0) : Math.max(0, 100 - attendanceRate);
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'Operations'),
            period: safeString(row && (row.period || row.date || row.month || row.week), ''),
            attendanceRate: clamp(attendanceRate, 0, 100),
            absenceRate: clamp(absenceRate, 0, 100),
            lateRate: clamp(row && (row.lateRate || row.latePercent || row.latenessRate), 0, 100),
            headcount: clamp(row && (row.headcount || row.employeeCount || row.totalEmployees), 0, 100000),
            source: 'attendance_history'
        };
    }

    function normalizeLeave(row, tenantSlug) {
        var requested = clamp(row && (row.requestedDays || row.leaveDays || row.totalLeaveDays || row.days), 0, 100000);
        var approved = clamp(row && (row.approvedDays || row.approvedLeaveDays), 0, 100000);
        var pending = clamp(row && (row.pendingRequests || row.pendingCount || (/pending|review|open/i.test(safeString(row && (row.status || row.state), '')) ? 1 : 0)), 0, 100000);
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'HR'),
            period: safeString(row && (row.period || row.date || row.month || row.week), ''),
            requestedDays: requested,
            approvedDays: approved,
            pendingRequests: pending,
            seasonalIndex: clamp(row && (row.seasonalIndex || row.seasonality || row.demandIndex), 0, 5),
            source: 'leave_history'
        };
    }

    function normalizeDistribution(row, tenantSlug) {
        var headcount = clamp(row && (row.headcount || row.employeeCount || row.currentHeadcount || row.count), 0, 100000);
        var target = clamp(row && (row.targetHeadcount || row.requiredHeadcount || row.capacityTarget), 0, 100000);
        if (!target && headcount) target = headcount;
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'Workforce'),
            headcount: headcount,
            targetHeadcount: target,
            utilizationRate: clamp(row && (row.utilizationRate || row.utilization || row.capacityUtilization), 0, 100),
            openRoles: clamp(row && (row.openRoles || row.openRequisitions || row.vacancies), 0, 10000),
            attritionRisk: clamp(row && (row.attritionRisk || row.retentionRisk || row.riskScore), 0, 100),
            source: 'workforce_distribution'
        };
    }

    function normalizeLifecycle(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'Workforce'),
            eventType: normalizeToken(row && (row.eventType || row.type || row.category), 'LIFECYCLE'),
            volume: clamp(row && (row.volume || row.count || row.total), 0, 100000),
            riskScore: clamp(row && (row.riskScore || row.severityScore || row.impactScore), 0, 100),
            source: 'employee_lifecycle_trend'
        };
    }

    function normalizeOnboarding(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'HR'),
            completionRate: clamp(row && (row.completionRate || row.progressPercent || row.onboardingCompletion), 0, 100),
            cycleDays: clamp(row && (row.cycleDays || row.durationDays || row.daysOpen), 0, 10000),
            delayedCount: clamp(row && (row.delayedCount || row.blockedCount || row.overdueCount || (/delayed|blocked|overdue/i.test(safeString(row && (row.status || row.state), '')) ? 1 : 0)), 0, 100000),
            source: 'onboarding_trend'
        };
    }

    function normalizeGrowth(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'Workforce'),
            period: safeString(row && (row.period || row.month || row.quarter || row.year), ''),
            growthRate: clamp(row && (row.growthRate || row.headcountGrowth || row.growth), -100, 200),
            hiringVelocity: clamp(row && (row.hiringVelocity || row.hires || row.hiredCount), 0, 100000),
            targetGrowthRate: clamp(row && (row.targetGrowthRate || row.growthTarget || row.target), -100, 200),
            source: 'workforce_growth_trend'
        };
    }

    function normalizeStaffing(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'Workforce'),
            staffingGap: clamp(row && (row.staffingGap || row.gap || row.openRoles || row.vacancies), 0, 100000),
            utilizationRate: clamp(row && (row.utilizationRate || row.utilization || row.capacityUtilization), 0, 100),
            capacityRisk: clamp(row && (row.capacityRisk || row.riskScore || row.workloadRisk), 0, 100),
            source: 'department_staffing_trend'
        };
    }

    function normalizeEngagement(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            department: normalizeDepartment(row, 'Workforce'),
            engagementScore: clamp(row && (row.engagementScore || row.engagement || row.activityScore), 0, 100),
            sentimentScore: clamp(row && (row.sentimentScore || row.sentiment || row.moraleScore), 0, 100),
            workloadPressure: clamp(row && (row.workloadPressure || row.pressureScore || row.utilizationRisk), 0, 100),
            source: 'engagement_signal'
        };
    }

    function normalizeEmployeeDistribution(employees, tenantSlug) {
        var counts = {};
        tenantRows(employees, tenantSlug).forEach(function count(row) {
            var dept = normalizeDepartment(row, 'Workforce');
            counts[dept] = counts[dept] || { tenantSlug: tenantSlug, department: dept, headcount: 0, targetHeadcount: 0, utilizationRate: 70, openRoles: 0, attritionRisk: 0, source: 'employee_headcount' };
            counts[dept].headcount += 1;
            counts[dept].targetHeadcount = Math.max(counts[dept].targetHeadcount, counts[dept].headcount);
        });
        return Object.keys(counts).map(function toRow(key) { return counts[key]; });
    }

    function roleScopeFilter(rows, visibility) {
        var list = arrayOf(rows);
        if (!visibility || visibility.scope === 'ORGANIZATION_WORKFORCE_FORECAST_VISIBILITY' || visibility.scope === 'HR_WORKFORCE_FORECAST_VISIBILITY') return list;
        if (visibility.scope === 'DEPARTMENT_WORKFORCE_FORECAST_VISIBILITY') {
            var dept = safeString(visibility.department, '').toLowerCase();
            return dept ? list.filter(function deptVisible(row) { return safeString(row.department, '').toLowerCase() === dept; }) : [];
        }
        if (visibility.scope === 'ASSIGNED_WORKFORCE_FORECAST_VISIBILITY_ONLY') {
            var own = safeString(visibility.actorId, '').toLowerCase();
            var ownDept = safeString(visibility.department, '').toLowerCase();
            return list.filter(function ownVisible(row) {
                var rowOwner = safeString(row.empId || row.employeeId || row.actorId || row.ownerId, '').toLowerCase();
                return own && rowOwner === own || ownDept && safeString(row.department, '').toLowerCase() === ownDept;
            });
        }
        return [];
    }

    function normalizeWorkforcePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeWorkforceOutput({
                    success: false,
                    classification: 'MALFORMED_WORKFORCE_PAYLOAD',
                    message: 'Predictive workforce analytics payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var scope = validateWorkforceScope(payload, context || {});
            if (!scope.success) return scope;
            var tenant = scope.tenantSlug;
            var data = rawData();
            var domains = arrayOf(payload.forecastDomains || payload.domains).map(function mapDomain(domain) {
                return normalizeDomain(domain, '');
            }).filter(function unique(domain, index, list) {
                return FORECAST_DOMAINS.indexOf(domain) !== -1 && list.indexOf(domain) === index;
            });
            if (!domains.length) domains = FORECAST_DOMAINS.slice();
            var horizons = arrayOf(payload.forecastHorizons || payload.horizons).map(function mapHorizon(horizon) {
                return normalizeHorizon(horizon, '');
            }).filter(function unique(horizon, index, list) {
                return FORECAST_HORIZONS.indexOf(horizon) !== -1 && list.indexOf(horizon) === index;
            });
            if (!horizons.length) horizons = FORECAST_HORIZONS.slice();

            var rawAttendance = arrayOf(payload.attendanceHistory || payload.attendance || payload.attendanceRecords);
            var rawLeave = arrayOf(payload.leaveHistory || payload.leaveDemand || payload.leaveRequests);
            var rawDistribution = arrayOf(payload.workforceDistribution || payload.departmentDistribution || payload.employees);
            var rawLifecycle = arrayOf(payload.employeeLifecycleTrends || payload.lifecycleTrends || payload.employeeLifecycleEvents);
            var rawOnboarding = arrayOf(payload.onboardingTrends || payload.onboarding || payload.onboardingWorkflows);
            var rawGrowth = arrayOf(payload.workforceGrowthTrends || payload.growthTrends);
            var rawStaffing = arrayOf(payload.departmentStaffingTrends || payload.staffingTrends || payload.capacitySignals);
            var rawEngagement = arrayOf(payload.engagementSignals || payload.workforceEngagement || payload.engagement);

            if (!rawAttendance.length && payload.useDbFallback === true) rawAttendance = arrayOf(data.attendanceRecords || data.attendance || data.attendanceRegularization);
            if (!rawLeave.length && payload.useDbFallback === true) rawLeave = arrayOf(data.leaveRequests || data.leave);
            if (!rawDistribution.length && payload.useDbFallback === true) rawDistribution = arrayOf(data.workforceDistribution || data.employees);
            if (!rawLifecycle.length && payload.useDbFallback === true) rawLifecycle = arrayOf(data.employeeLifecycleEvents || data.lifecycleEvents);
            if (!rawOnboarding.length && payload.useDbFallback === true) rawOnboarding = arrayOf(data.onboardingWorkflows || data.onboardingTasks);

            var normalized = {
                success: true,
                tenantSlug: tenant,
                forecastDomains: domains,
                forecastHorizons: horizons,
                attendanceHistory: roleScopeFilter(tenantRows(rawAttendance, tenant).map(function mapAttendance(row) { return normalizeAttendance(row, tenant); }), scope.visibility),
                leaveHistory: roleScopeFilter(tenantRows(rawLeave, tenant).map(function mapLeave(row) { return normalizeLeave(row, tenant); }), scope.visibility),
                workforceDistribution: roleScopeFilter(tenantRows(rawDistribution, tenant).map(function mapDistribution(row) { return normalizeDistribution(row, tenant); }), scope.visibility),
                employeeLifecycleTrends: roleScopeFilter(tenantRows(rawLifecycle, tenant).map(function mapLifecycle(row) { return normalizeLifecycle(row, tenant); }), scope.visibility),
                onboardingTrends: roleScopeFilter(tenantRows(rawOnboarding, tenant).map(function mapOnboarding(row) { return normalizeOnboarding(row, tenant); }), scope.visibility),
                workforceGrowthTrends: roleScopeFilter(tenantRows(rawGrowth, tenant).map(function mapGrowth(row) { return normalizeGrowth(row, tenant); }), scope.visibility),
                departmentStaffingTrends: roleScopeFilter(tenantRows(rawStaffing, tenant).map(function mapStaffing(row) { return normalizeStaffing(row, tenant); }), scope.visibility),
                engagementSignals: roleScopeFilter(tenantRows(rawEngagement, tenant).map(function mapEngagement(row) { return normalizeEngagement(row, tenant); }), scope.visibility),
                analytics: {
                    workforceForecastAccuracy: clamp(payload.analytics && payload.analytics.workforceForecastAccuracy, 0, 100),
                    staffingTrend: clamp(payload.analytics && payload.analytics.staffingTrend, -100, 100),
                    utilizationTrend: clamp(payload.analytics && payload.analytics.utilizationTrend, -100, 100),
                    workforceStabilityTrend: clamp(payload.analytics && payload.analytics.workforceStabilityTrend, -100, 100),
                    leaveDemandTrend: clamp(payload.analytics && payload.analytics.leaveDemandTrend, -100, 100),
                    attendanceForecastingTrend: clamp(payload.analytics && payload.analytics.attendanceForecastingTrend, -100, 100),
                    hiringDemandTrend: clamp(payload.analytics && payload.analytics.hiringDemandTrend, -100, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: scope.visibility,
                governance: governanceFlags()
            };
            if (!normalized.workforceDistribution.length && payload.useDbFallback === true) {
                normalized.workforceDistribution = roleScopeFilter(normalizeEmployeeDistribution(data.employees || [], tenant), scope.visibility);
            }
            var signalCount = normalized.attendanceHistory.length + normalized.leaveHistory.length + normalized.workforceDistribution.length + normalized.employeeLifecycleTrends.length + normalized.onboardingTrends.length + normalized.workforceGrowthTrends.length + normalized.departmentStaffingTrends.length + normalized.engagementSignals.length;
            var seasonalSpikes = normalized.leaveHistory.some(function spike(row) {
                return row.seasonalIndex >= 1.15 || row.requestedDays > Math.max(8, row.approvedDays * 1.35);
            });
            var conflicting = normalized.engagementSignals.some(function conflict(row) {
                return row.engagementScore >= 70 && row.workloadPressure >= 75;
            }) || normalized.workforceDistribution.some(function conflict(row) {
                return row.utilizationRate >= 85 && row.openRoles === 0 && row.attritionRisk >= 20;
            });
            normalized.dataQuality = {
                insufficientWorkforceHistoryDetected: signalCount < 3,
                sparseDatasetsDetected: signalCount < 6,
                seasonalWorkforceSpikesHandled: true,
                seasonalWorkforceSpikesDetected: seasonalSpikes,
                conflictingWorkforceIndicatorsHandled: true,
                conflictingWorkforceIndicatorsDetected: conflicting,
                malformedPayloadsHandled: true
            };
            normalized.warnings = [];
            if (normalized.dataQuality.insufficientWorkforceHistoryDetected) normalized.warnings.push('Workforce history is limited, so forecasts use conservative confidence.');
            if (normalized.dataQuality.seasonalWorkforceSpikesDetected) normalized.warnings.push('Leave demand contains seasonal pressure signals.');
            if (normalized.dataQuality.conflictingWorkforceIndicatorsDetected) normalized.warnings.push('Workforce indicators conflict and require human review.');
            return freezeWorkforceOutput(normalized);
        } catch (error) {
            safeWarn('normalizeWorkforcePayload failed safely', error && error.message);
            return freezeWorkforceOutput({
                success: false,
                classification: 'WORKFORCE_NORMALIZATION_ERROR',
                message: 'Predictive workforce analytics payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function confidenceLevel(score) {
        if (score >= 80) return 'HIGH';
        if (score >= 50) return 'MODERATE';
        return 'LOW';
    }

    function riskLevel(score) {
        if (score >= 82) return 'CRITICAL';
        if (score >= 64) return 'HIGH';
        if (score >= 40) return 'MODERATE';
        return 'LOW';
    }

    function averageAttendance(normalized) {
        return average(normalized.attendanceHistory.map(function rowScore(row) {
            return row.attendanceRate - row.lateRate * 0.2 - row.absenceRate * 0.35;
        })) || 72;
    }

    function leavePressure(normalized) {
        return clamp(average(normalized.leaveHistory.map(function rowPressure(row) {
            var approvalGap = Math.max(0, row.requestedDays - row.approvedDays);
            return row.pendingRequests * 8 + approvalGap * 1.4 + row.seasonalIndex * 10;
        })) || 28, 0, 100);
    }

    function utilizationScore(normalized) {
        var distribution = normalized.workforceDistribution.map(function rowScore(row) { return row.utilizationRate; }).filter(Number.isFinite);
        var staffing = normalized.departmentStaffingTrends.map(function rowScore(row) { return row.utilizationRate; }).filter(Number.isFinite);
        return clamp(average(distribution.concat(staffing)) || 68, 0, 100);
    }

    function gapPressure(normalized) {
        return clamp(average(
            normalized.workforceDistribution.map(function rowGap(row) {
                var target = Math.max(1, row.targetHeadcount || row.headcount || 1);
                var deficit = Math.max(0, target - row.headcount);
                return deficit / target * 100 + row.openRoles * 4 + row.attritionRisk * 0.18;
            }).concat(normalized.departmentStaffingTrends.map(function staffingGap(row) {
                return row.staffingGap * 7 + row.capacityRisk * 0.35;
            }))
        ) || 24, 0, 100);
    }

    function engagementHealth(normalized) {
        return clamp(average(normalized.engagementSignals.map(function rowScore(row) {
            return row.engagementScore * 0.45 + row.sentimentScore * 0.35 + (100 - row.workloadPressure) * 0.2;
        })) || 70, 0, 100);
    }

    function onboardingHealth(normalized) {
        return clamp(average(normalized.onboardingTrends.map(function rowScore(row) {
            return row.completionRate * 0.7 + (100 - Math.min(100, row.cycleDays * 2)) * 0.2 + (100 - Math.min(100, row.delayedCount * 12)) * 0.1;
        })) || 72, 0, 100);
    }

    function calculateWorkforceHealth(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeWorkforcePayload(input, context || {});
            if (!normalized.success) return normalized;
            var attendance = averageAttendance(normalized);
            var leaveLoad = leavePressure(normalized);
            var utilization = utilizationScore(normalized);
            var gap = gapPressure(normalized);
            var engagement = engagementHealth(normalized);
            var onboarding = onboardingHealth(normalized);
            var trend = average([
                normalized.analytics.staffingTrend,
                normalized.analytics.utilizationTrend,
                normalized.analytics.attendanceForecastingTrend,
                -normalized.analytics.leaveDemandTrend,
                normalized.analytics.workforceStabilityTrend
            ]) * 0.12;
            var health = Math.round(clamp(attendance * 0.18 + (100 - leaveLoad) * 0.16 + (100 - Math.abs(utilization - 74)) * 0.18 + (100 - gap) * 0.2 + engagement * 0.16 + onboarding * 0.12 + trend, 5, 98));
            if (normalized.dataQuality.insufficientWorkforceHistoryDetected) health = Math.round(clamp(health * 0.9, 8, 78));
            var intelligence = Math.round(clamp(health * 0.7 + Math.min(100, (normalized.attendanceHistory.length + normalized.leaveHistory.length + normalized.workforceDistribution.length + normalized.departmentStaffingTrends.length + normalized.engagementSignals.length) * 6) * 0.3, 0, 100));
            var readiness = Math.round(clamp(health * 0.5 + (100 - gap) * 0.3 + onboarding * 0.2, 0, 100));
            var stability = Math.round(clamp(100 - gap * 0.35 - leaveLoad * 0.22 - Math.max(0, utilization - 82) * 0.8 + engagement * 0.18 + normalized.analytics.workforceStabilityTrend * 0.12, 0, 100));
            var confidence = Math.round(clamp(28 + normalized.analytics.workforceForecastAccuracy * 0.36 + Math.min(34, (normalized.attendanceHistory.length + normalized.leaveHistory.length + normalized.workforceDistribution.length + normalized.departmentStaffingTrends.length) * 4) - (normalized.dataQuality.sparseDatasetsDetected ? 12 : 0), 18, 96));
            return freezeWorkforceOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                workforceIntelligenceScore: intelligence,
                workforceReadinessScore: readiness,
                workforceHealthScore: health,
                workforceStabilityScore: stability,
                utilizationScore: Math.round(utilization),
                leavePressureScore: Math.round(leaveLoad),
                staffingGapPressureScore: Math.round(gap),
                engagementHealthScore: Math.round(engagement),
                attendanceHealthScore: Math.round(attendance),
                onboardingHealthScore: Math.round(onboarding),
                confidenceScore: confidence,
                confidenceLevel: confidenceLevel(confidence),
                workforceRiskLevel: riskLevel(100 - health + Math.max(0, utilization - 80) * 0.6 + gap * 0.24),
                dataQuality: normalized.dataQuality,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateWorkforceHealth failed safely', error && error.message);
            return freezeWorkforceOutput({
                success: false,
                classification: 'WORKFORCE_HEALTH_ERROR',
                message: 'Workforce health calculation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function departmentsFrom(normalized) {
        var counts = {};
        [].concat(normalized.workforceDistribution, normalized.departmentStaffingTrends, normalized.attendanceHistory, normalized.leaveHistory, normalized.engagementSignals, normalized.workforceGrowthTrends, normalized.onboardingTrends).forEach(function count(row) {
            var dept = normalizeDepartment(row, 'Workforce');
            counts[dept] = true;
        });
        return Object.keys(counts);
    }

    function rowsForDepartment(rows, department) {
        return arrayOf(rows).filter(function match(row) {
            return safeString(row && row.department, '').toLowerCase() === safeString(department, '').toLowerCase();
        });
    }

    function calculateCapacityForecast(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeWorkforcePayload(input, context || {});
            if (!normalized.success) return normalized;
            var health = calculateWorkforceHealth(normalized, context || {});
            if (!health.success) return health;
            var departments = departmentsFrom(normalized);
            if (!departments.length) departments = ['Workforce'];
            var staffingForecasts = departments.map(function deptForecast(department) {
                var distribution = rowsForDepartment(normalized.workforceDistribution, department);
                var staffing = rowsForDepartment(normalized.departmentStaffingTrends, department);
                var growth = rowsForDepartment(normalized.workforceGrowthTrends, department);
                var headcount = Math.round(average(distribution.map(function rowValue(row) { return row.headcount; })) || 0);
                var target = Math.round(average(distribution.map(function rowValue(row) { return row.targetHeadcount; })) || headcount);
                var gap = Math.round(average(staffing.map(function rowValue(row) { return row.staffingGap; }).concat(distribution.map(function rowValue(row) { return Math.max(0, row.targetHeadcount - row.headcount); }))) || 0);
                var utilization = Math.round(average(staffing.map(function rowValue(row) { return row.utilizationRate; }).concat(distribution.map(function rowValue(row) { return row.utilizationRate; }))) || health.utilizationScore);
                var hiringVelocity = Math.round(average(growth.map(function rowValue(row) { return row.hiringVelocity; })) || 0);
                var demandScore = Math.round(clamp(gap * 12 + Math.max(0, utilization - 78) * 1.4 + Math.max(0, target - headcount) * 7 - hiringVelocity * 1.5, 0, 100));
                return {
                    department: department,
                    scope: 'department_summary',
                    currentHeadcount: headcount,
                    targetHeadcount: target,
                    staffingGap: gap,
                    utilizationRate: utilization,
                    hiringDemandScore: demandScore,
                    riskLevel: riskLevel(demandScore),
                    recommendedAction: demandScore >= 64 ? 'Ask HR leadership to review staffing coverage before changing workforce structures.' : 'Maintain monitoring and validate demand with the accountable human owner.',
                    readOnly: true
                };
            });
            var capacityForecasts = normalized.forecastHorizons.map(function horizonForecast(horizon) {
                var horizonFactor = horizon === 'WEEKLY' ? 0.7 : horizon === 'MONTHLY' ? 1 : horizon === 'QUARTERLY' ? 1.28 : 1.56;
                var pressure = clamp((100 - health.workforceReadinessScore) * 0.5 + health.staffingGapPressureScore * 0.32 + Math.max(0, health.utilizationScore - 78) * 1.2, 0, 100);
                return {
                    horizon: horizon.toLowerCase(),
                    capacityPressureScore: Math.round(clamp(pressure * horizonFactor, 0, 100)),
                    workforceUtilizationScore: health.utilizationScore,
                    readinessScore: Math.round(clamp(health.workforceReadinessScore - pressure * 0.08 * horizonFactor, 0, 100)),
                    confidenceScore: health.confidenceScore,
                    riskLevel: riskLevel(pressure * horizonFactor),
                    readOnly: true
                };
            });
            var hiringDemandForecasts = staffingForecasts.filter(function demand(row) {
                return row.hiringDemandScore >= 35 || row.staffingGap > 0;
            });
            if (!hiringDemandForecasts.length) hiringDemandForecasts = staffingForecasts.slice(0, 1);
            return freezeWorkforceOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                workforceUtilizationScore: health.utilizationScore,
                capacityForecasts: capacityForecasts,
                staffingForecasts: staffingForecasts,
                hiringDemandForecasts: hiringDemandForecasts,
                confidenceScore: health.confidenceScore,
                confidenceLevel: health.confidenceLevel,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateCapacityForecast failed safely', error && error.message);
            return freezeWorkforceOutput({
                success: false,
                classification: 'WORKFORCE_CAPACITY_ERROR',
                message: 'Workforce capacity forecast failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function explainWorkforceForecast(forecast, context) {
        try {
            var factors = arrayOf(forecast && forecast.contributingFactors, 8).map(function factorText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            var assumptions = arrayOf(forecast && forecast.assumptions, 8).map(function assumptionText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            var actions = arrayOf(forecast && forecast.recommendedActions, 8).map(function actionText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 220);
            }).filter(Boolean);
            if (!factors.length) factors.push('tenant-scoped workforce history is limited, so the forecast remains conservative');
            if (!assumptions.length) assumptions.push('available workforce history remains comparable and human HR leaders validate recommendations');
            if (!actions.length) actions.push('Ask the accountable HR or business leader to review the forecast evidence before changing workforce structures, leave decisions, or employee records.');
            var domain = normalizeDomain(forecast && forecast.domain, 'WORKFORCE_CAPACITY').toLowerCase();
            var department = safeString(forecast && forecast.department, 'Workforce');
            var score = clamp(forecast && (forecast.workforceHealthScore || forecast.score || forecast.capacityPressureScore), 0, 100);
            var confidence = clamp(forecast && forecast.confidenceScore, 0, 100);
            var level = normalizeToken(forecast && (forecast.forecastLevel || forecast.riskLevel), riskLevel(score));
            return freezeWorkforceOutput({
                success: true,
                domain: domain,
                department: department,
                forecastLevel: level,
                workforceHealthScore: score,
                confidenceScore: confidence,
                confidenceLevel: normalizeToken(forecast && forecast.confidenceLevel, confidenceLevel(confidence)),
                explanation: domain.replace(/_/g, ' ') + ' for ' + department + ' is classified as ' + level + ' because tenant-scoped evidence shows ' + factors.slice(0, 3).join(', ') + '. The forecast uses workforce score ' + Math.round(score) + '% and confidence ' + Math.round(confidence) + '%.',
                contributingFactors: factors,
                assumptions: assumptions,
                recommendedActions: actions,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('explainWorkforceForecast failed safely', error && error.message);
            return freezeWorkforceOutput({
                success: false,
                classification: 'WORKFORCE_EXPLANATION_ERROR',
                message: 'Workforce forecast explanation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function collectDepartmentRows(normalized, department) {
        return []
            .concat(rowsForDepartment(normalized.attendanceHistory, department))
            .concat(rowsForDepartment(normalized.leaveHistory, department))
            .concat(rowsForDepartment(normalized.workforceDistribution, department))
            .concat(rowsForDepartment(normalized.departmentStaffingTrends, department))
            .concat(rowsForDepartment(normalized.engagementSignals, department))
            .concat(rowsForDepartment(normalized.workforceGrowthTrends, department))
            .concat(rowsForDepartment(normalized.employeeLifecycleTrends, department))
            .concat(rowsForDepartment(normalized.onboardingTrends, department));
    }

    function departmentMetric(normalized, department, health) {
        var attendance = average(rowsForDepartment(normalized.attendanceHistory, department).map(function rowValue(row) { return row.attendanceRate - row.absenceRate * 0.2; })) || health.attendanceHealthScore;
        var leave = clamp(average(rowsForDepartment(normalized.leaveHistory, department).map(function rowValue(row) { return row.pendingRequests * 8 + Math.max(0, row.requestedDays - row.approvedDays) * 1.2; })) || health.leavePressureScore, 0, 100);
        var utilization = average(rowsForDepartment(normalized.departmentStaffingTrends, department).map(function rowValue(row) { return row.utilizationRate; }).concat(rowsForDepartment(normalized.workforceDistribution, department).map(function rowValue(row) { return row.utilizationRate; }))) || health.utilizationScore;
        var gap = average(rowsForDepartment(normalized.departmentStaffingTrends, department).map(function rowValue(row) { return row.staffingGap * 8 + row.capacityRisk * 0.3; })) || health.staffingGapPressureScore;
        var engagement = average(rowsForDepartment(normalized.engagementSignals, department).map(function rowValue(row) { return row.engagementScore * 0.5 + row.sentimentScore * 0.3 + (100 - row.workloadPressure) * 0.2; })) || health.engagementHealthScore;
        var healthScore = Math.round(clamp(attendance * 0.16 + (100 - leave) * 0.16 + (100 - Math.abs(utilization - 74)) * 0.2 + (100 - gap) * 0.24 + engagement * 0.24, 0, 100));
        var risk = Math.round(clamp(100 - healthScore + leave * 0.2 + Math.max(0, utilization - 82) * 0.7 + gap * 0.18, 0, 100));
        return { healthScore: healthScore, riskScore: risk, utilization: Math.round(utilization), leavePressure: Math.round(leave), staffingGapPressure: Math.round(gap), engagement: Math.round(engagement) };
    }

    function recommendationFor(forecast) {
        var action = 'Ask the accountable human owner to review workforce evidence before changing staffing, leave, promotion, or employee records.';
        if (forecast.riskLevel === 'CRITICAL') action = 'Open a human-led workforce capacity review and validate coverage risks before any HR action.';
        else if (forecast.riskLevel === 'HIGH') action = 'Ask HR and the department owner to review staffing gaps, leave demand, and attendance coverage.';
        else if (forecast.domain === 'hiring_demand') action = 'Validate hiring demand with approved requisition governance before any recruitment action.';
        return {
            domain: forecast.domain,
            department: forecast.department,
            riskLevel: forecast.riskLevel,
            action: action,
            humanApprovalRequired: true,
            autonomousAction: false
        };
    }

    function buildDomainForecast(normalized, domain, horizon, department, health) {
        var rows = collectDepartmentRows(normalized, department);
        var metric = departmentMetric(normalized, department, health);
        var token = normalizeDomain(domain, 'WORKFORCE_CAPACITY');
        var horizonToken = normalizeHorizon(horizon, 'MONTHLY');
        var factor = horizonToken === 'WEEKLY' ? 0.82 : horizonToken === 'MONTHLY' ? 1 : horizonToken === 'QUARTERLY' ? 1.15 : 1.3;
        var risk = metric.riskScore;
        if (token === 'LEAVE_DEMAND') risk = metric.leavePressure * factor + normalized.analytics.leaveDemandTrend * 0.2;
        else if (token === 'ATTENDANCE_PATTERNS') risk = (100 - health.attendanceHealthScore) * factor + Math.max(0, normalized.analytics.attendanceForecastingTrend) * 0.18;
        else if (token === 'HIRING_DEMAND' || token === 'STAFFING_GAPS') risk = metric.staffingGapPressure * factor + normalized.analytics.hiringDemandTrend * 0.25;
        else if (token === 'DEPARTMENT_UTILIZATION' || token === 'WORKFORCE_CAPACITY') risk = Math.max(0, metric.utilization - 70) * 2 * factor + metric.staffingGapPressure * 0.28;
        else if (token === 'WORKFORCE_ENGAGEMENT') risk = (100 - metric.engagement) * factor;
        else if (token === 'WORKFORCE_GROWTH') risk = Math.max(0, 65 - average(rowsForDepartment(normalized.workforceGrowthTrends, department).map(function rowValue(row) { return 50 + row.growthRate - Math.max(0, row.targetGrowthRate - row.growthRate) * 2 + row.hiringVelocity; }))) * factor;
        risk = Math.round(clamp(risk, 0, 100));
        var projectedHealth = Math.round(clamp(metric.healthScore - risk * 0.12 + normalized.analytics.workforceStabilityTrend * 0.05, 0, 100));
        var level = riskLevel(risk);
        var factors = [];
        if (rows.length) factors = rows.slice(0, 4).map(function factorRow(row) {
            return (row.source || 'workforce signal').replace(/_/g, ' ') + ' in ' + (row.department || department);
        });
        if (!factors.length) factors.push('insufficient tenant-scoped workforce history for this domain');
        if (risk >= 64) factors.push('risk pressure exceeds normal workforce planning threshold');
        if (metric.utilization >= 84) factors.push('department utilization is above target planning range');
        var forecast = {
            forecastId: 'WORKFORCE-' + token + '-' + horizonToken + '-' + Date.now(),
            domain: token.toLowerCase(),
            horizon: horizonToken.toLowerCase(),
            department: department,
            scope: rows.length ? 'department_detail' : 'department_summary',
            workforceHealthScore: projectedHealth,
            utilizationScore: metric.utilization,
            capacityPressureScore: risk,
            confidenceScore: health.confidenceScore,
            confidenceLevel: health.confidenceLevel,
            riskLevel: level,
            forecastLevel: level,
            projectedOutcome: risk >= 82 ? 'CRITICAL_WORKFORCE_REVIEW_NEEDED' : risk >= 64 ? 'CAPACITY_PRESSURE_LIKELY' : risk >= 40 ? 'MONITOR_WORKFORCE_TREND' : 'WORKFORCE_STABLE',
            opportunityIndicator: projectedHealth >= 72 && risk < 45,
            contributingFactors: factors,
            assumptions: [
                'tenant-scoped workforce history remains comparable',
                'AI output is advisory and read-only',
                'human HR leaders validate recommendations before any workforce action'
            ],
            recommendedActions: [recommendationFor({ domain: token.toLowerCase(), department: department, riskLevel: level }).action],
            readOnly: true
        };
        var explanation = explainWorkforceForecast(forecast);
        forecast.explanation = explanation.explanation;
        forecast.contributingFactors = explanation.contributingFactors;
        forecast.assumptions = explanation.assumptions;
        forecast.recommendedActions = explanation.recommendedActions;
        forecast.confidenceLevel = explanation.confidenceLevel;
        return forecast;
    }

    function applyForecastVisibility(forecasts, context) {
        var visibility = visibilityForContext(context || {});
        if (visibility.scope === 'ORGANIZATION_WORKFORCE_FORECAST_VISIBILITY' || visibility.scope === 'HR_WORKFORCE_FORECAST_VISIBILITY') return forecasts;
        if (visibility.scope === 'DEPARTMENT_WORKFORCE_FORECAST_VISIBILITY') {
            var dept = safeString(visibility.department, '').toLowerCase();
            return dept ? forecasts.filter(function rowVisible(row) { return safeString(row.department, '').toLowerCase() === dept || row.scope === 'department_summary' && forecasts.length === 1; }) : [];
        }
        if (visibility.scope === 'ASSIGNED_WORKFORCE_FORECAST_VISIBILITY_ONLY') {
            var ownDept = safeString(visibility.department, '').toLowerCase();
            return ownDept ? forecasts.filter(function rowVisible(row) { return safeString(row.department, '').toLowerCase() === ownDept; }) : [];
        }
        return [];
    }

    function recordAudit(actionType, details, context) {
        if (context && context.skipAuditPersistence) return false;
        try {
            var audit = global.AuditService || global.auditService;
            if (audit && typeof audit.recordAudit === 'function') {
                audit.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    actorId: actorId(context) || 'SYSTEM',
                    tenantSlug: contextTenant(context),
                    entityType: 'PREDICTIVE_WORKFORCE_FORECAST',
                    module: 'Predictive Workforce Analytics',
                    details: cloneSanitized(details || {})
                });
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-WORKFORCE-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'Predictive Workforce Analytics',
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
            var telemetry = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (telemetry) {
                if (typeof telemetry.recordEvent === 'function') {
                    telemetry.recordEvent(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
                if (typeof telemetry.track === 'function') {
                    telemetry.track(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
                if (typeof telemetry.emitTelemetry === 'function') {
                    telemetry.emitTelemetry('WORKFLOW', eventType, {
                        source: 'predictiveWorkforceAnalyticsService',
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

    function generateWorkforceForecast(payload, context) {
        try {
            var normalized = normalizeWorkforcePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var health = calculateWorkforceHealth(normalized, context || {});
            if (!health.success) return health;
            var capacity = calculateCapacityForecast(normalized, context || {});
            if (!capacity.success) return capacity;
            var departments = departmentsFrom(normalized);
            if (!departments.length) departments = [actorDepartment(context) || 'Workforce'];
            var forecasts = [];
            normalized.forecastHorizons.forEach(function eachHorizon(horizon) {
                normalized.forecastDomains.forEach(function eachDomain(domain) {
                    departments.forEach(function eachDepartment(department) {
                        forecasts.push(buildDomainForecast(normalized, domain, horizon, department, health));
                    });
                });
            });
            forecasts = applyForecastVisibility(forecasts, context || {});
            if (!forecasts.length) forecasts = [buildDomainForecast(normalized, 'WORKFORCE_CAPACITY', 'MONTHLY', actorDepartment(context) || 'Workforce', health)];
            var weeklyForecasts = forecasts.filter(function horizon(row) { return row.horizon === 'weekly'; });
            var monthlyForecasts = forecasts.filter(function horizon(row) { return row.horizon === 'monthly'; });
            var quarterlyForecasts = forecasts.filter(function horizon(row) { return row.horizon === 'quarterly'; });
            var annualForecasts = forecasts.filter(function horizon(row) { return row.horizon === 'annual'; });
            var workforceRiskIndicators = forecasts.filter(function risk(row) { return row.riskLevel === 'HIGH' || row.riskLevel === 'CRITICAL' || row.capacityPressureScore >= 58; });
            if (!workforceRiskIndicators.length) workforceRiskIndicators = forecasts.filter(function risk(row) { return row.capacityPressureScore >= 35; }).slice(0, 3);
            var workforceOpportunityIndicators = forecasts.filter(function opportunity(row) { return row.opportunityIndicator || row.workforceHealthScore >= 72; });
            if (!workforceOpportunityIndicators.length) workforceOpportunityIndicators = forecasts.slice(0, 1);
            var hiringRecommendations = capacity.hiringDemandForecasts.map(function hiring(row) {
                return {
                    department: row.department,
                    hiringDemandScore: row.hiringDemandScore,
                    staffingGap: row.staffingGap,
                    recommendation: row.recommendedAction,
                    humanApprovalRequired: true,
                    autonomousAction: false
                };
            });
            var recommendedActions = workforceRiskIndicators.slice(0, 8).map(recommendationFor);
            if (!recommendedActions.length) recommendedActions = forecasts.slice(0, 1).map(recommendationFor);
            var reportId = 'PREDICTIVE-WORKFORCE-REPORT-' + Date.now();
            var generatedAt = nowIso();
            var history = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                workforceHealthScore: health.workforceHealthScore,
                workforceReadinessScore: health.workforceReadinessScore,
                confidenceScore: health.confidenceScore,
                forecastCount: forecasts.length,
                readOnly: true,
                immutable: true
            };
            appendHistory('predictiveWorkforceForecastHistory', history);
            appendHistory('predictiveWorkforceReportHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                workforceHealthScore: health.workforceHealthScore,
                workforceRiskLevel: health.workforceRiskLevel,
                riskIndicatorCount: workforceRiskIndicators.length,
                immutable: true
            });
            appendHistory('predictiveWorkforceRecommendationHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                recommendations: recommendedActions.concat(hiringRecommendations),
                humanApprovalRequired: true,
                immutable: true
            });
            appendHistory('predictiveWorkforceAnalyticsHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                workforceForecastAccuracy: normalized.analytics.workforceForecastAccuracy,
                staffingTrends: normalized.analytics.staffingTrend,
                utilizationTrends: normalized.analytics.utilizationTrend,
                workforceStabilityTrends: normalized.analytics.workforceStabilityTrend,
                leaveDemandTrends: normalized.analytics.leaveDemandTrend,
                attendanceForecastingTrends: normalized.analytics.attendanceForecastingTrend,
                hiringDemandTrends: normalized.analytics.hiringDemandTrend,
                workforceIntelligenceScore: health.workforceIntelligenceScore,
                workforceReadinessScore: health.workforceReadinessScore,
                workforceHealthScore: health.workforceHealthScore,
                immutable: true
            });
            var auditRecorded = recordAudit('PREDICTIVE_WORKFORCE_FORECAST_GENERATED', history, context || {});
            var telemetryRecorded = recordTelemetry('PREDICTIVE_WORKFORCE_FORECAST_GENERATED', history, context || {});
            return freezeWorkforceOutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                readOnly: true,
                visibility: normalized.visibility,
                workforceIntelligenceScore: health.workforceIntelligenceScore,
                workforceReadinessScore: health.workforceReadinessScore,
                workforceHealthScore: health.workforceHealthScore,
                workforceStabilityScore: health.workforceStabilityScore,
                workforceRiskLevel: health.workforceRiskLevel,
                confidenceScore: health.confidenceScore,
                confidenceLevel: health.confidenceLevel,
                utilizationScore: health.utilizationScore,
                forecasts: forecasts,
                weeklyForecasts: weeklyForecasts,
                monthlyForecasts: monthlyForecasts,
                quarterlyForecasts: quarterlyForecasts,
                annualForecasts: annualForecasts,
                staffingForecasts: capacity.staffingForecasts,
                capacityForecasts: capacity.capacityForecasts,
                workforceRiskIndicators: workforceRiskIndicators,
                workforceOpportunityIndicators: workforceOpportunityIndicators,
                hiringRecommendations: hiringRecommendations,
                recommendedActions: recommendedActions,
                analytics: {
                    workforceForecastAccuracy: normalized.analytics.workforceForecastAccuracy,
                    staffingTrends: normalized.analytics.staffingTrend,
                    utilizationTrends: normalized.analytics.utilizationTrend,
                    workforceStabilityTrends: normalized.analytics.workforceStabilityTrend,
                    leaveDemandTrends: normalized.analytics.leaveDemandTrend,
                    attendanceForecastingTrends: normalized.analytics.attendanceForecastingTrend,
                    hiringDemandTrends: normalized.analytics.hiringDemandTrend,
                    workforceIntelligenceScore: health.workforceIntelligenceScore,
                    workforceReadinessScore: health.workforceReadinessScore,
                    workforceHealthScore: health.workforceHealthScore
                },
                dataQuality: normalized.dataQuality,
                aiSafety: {
                    forecast: true,
                    explain: true,
                    recommend: true,
                    warn: true,
                    autonomousDecisioning: false,
                    hrDecisionMaking: false,
                    hiringAction: false,
                    terminationAction: false,
                    leaveApproval: false,
                    promotionApproval: false,
                    employeeRecordMutation: false,
                    workforceStructureMutation: false,
                    workflowExecution: false,
                    permissionMutation: false
                },
                governance: governanceFlags(),
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditRecorded: auditRecorded,
                    telemetryRecorded: telemetryRecorded
                }),
                warnings: normalized.warnings
            });
        } catch (error) {
            safeWarn('generateWorkforceForecast failed safely', error && error.message);
            return freezeWorkforceOutput({
                success: false,
                classification: 'WORKFORCE_FORECAST_ERROR',
                message: 'Predictive workforce analytics generation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function runSelfTest() {
        var result = {
            passed: false,
            tests: [],
            generatedAt: nowIso()
        };
        function test(name, fn) {
            try {
                var details = fn();
                result.tests.push({ name: name, ok: true, details: details || {} });
            } catch (error) {
                result.tests.push({ name: name, ok: false, message: error && error.message || String(error) });
            }
        }
        var context = { tenantSlug: 'self-test', actor: { id: 'DIR-SELF', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
        var payload = {
            tenantSlug: 'self-test',
            forecastDomains: ['workforce_capacity', 'leave_demand', 'hiring_demand'],
            forecastHorizons: ['weekly', 'monthly'],
            attendanceHistory: [{ tenantSlug: 'self-test', department: 'Operations', attendanceRate: 84, absenceRate: 8, lateRate: 4 }],
            leaveHistory: [{ tenantSlug: 'self-test', department: 'Operations', requestedDays: 22, approvedDays: 13, pendingRequests: 4, seasonalIndex: 1.3 }],
            workforceDistribution: [{ tenantSlug: 'self-test', department: 'Operations', headcount: 14, targetHeadcount: 19, utilizationRate: 89, openRoles: 3 }],
            departmentStaffingTrends: [{ tenantSlug: 'self-test', department: 'Operations', staffingGap: 5, utilizationRate: 89, capacityRisk: 71 }],
            engagementSignals: [{ tenantSlug: 'self-test', department: 'Operations', engagementScore: 66, sentimentScore: 63, workloadPressure: 76 }],
            analytics: { workforceForecastAccuracy: 76, staffingTrend: 10, utilizationTrend: 12, leaveDemandTrend: 14, hiringDemandTrend: 15 }
        };
        test('malformed payloads handled safely', function malformed() {
            var output = normalizeWorkforcePayload(null, context);
            if (output.success !== false || !Object.isFrozen(output)) throw new Error('Malformed payload did not fail as frozen output.');
            return { classification: output.classification };
        });
        test('workforce forecasting works', function forecast() {
            var output = generateWorkforceForecast(payload, context);
            if (!output.success || !output.forecasts.length) throw new Error('Forecast did not generate.');
            return { forecasts: output.forecasts.length, health: output.workforceHealthScore };
        });
        test('capacity forecasting works', function capacity() {
            var output = calculateCapacityForecast(payload, context);
            if (!output.success || !output.capacityForecasts.length) throw new Error('Capacity forecast did not generate.');
            return { capacityForecasts: output.capacityForecasts.length };
        });
        test('explainability works', function explainability() {
            var output = explainWorkforceForecast({ domain: 'workforce_capacity', department: 'Operations', workforceHealthScore: 62, confidenceScore: 70, contributingFactors: ['utilization pressure'], assumptions: ['tenant scope'], recommendedActions: ['human review'] }, context);
            if (!output.success || !output.explanation || !output.contributingFactors.length) throw new Error('Explanation missing.');
            return { confidence: output.confidenceLevel };
        });
        test('tenant isolation works', function isolation() {
            var blocked = generateWorkforceForecast(Object.assign({}, payload, { tenantSlug: 'other-tenant' }), context);
            if (blocked.success !== false) throw new Error('Cross-tenant payload was not blocked.');
            return { classification: blocked.classification };
        });
        test('immutable outputs enforced', function immutable() {
            var output = generateWorkforceForecast(payload, context);
            if (!Object.isFrozen(output) || !Object.isFrozen(output.forecasts)) throw new Error('Forecast output not frozen.');
            return { frozen: true };
        });
        result.passed = result.tests.every(function all(testRow) { return !!testRow.ok; });
        return freezeWorkforceOutput(result);
    }

    if (global.__ARTHHRMS_DEV__) {
        try { global.__ARTHHRMS_PREDICTIVE_WORKFORCE_SELF_TEST__ = runSelfTest(); } catch (error) {
            global.__ARTHHRMS_PREDICTIVE_WORKFORCE_SELF_TEST__ = freezeWorkforceOutput({
                passed: false,
                tests: [{ name: 'self-test failed safely', ok: false, message: error && error.message || String(error) }],
                generatedAt: nowIso()
            });
        }
    }

    var service = freezeDeep({
        FORECAST_DOMAINS: FORECAST_DOMAINS,
        FORECAST_HORIZONS: FORECAST_HORIZONS,
        RISK_LEVELS: RISK_LEVELS,
        generateWorkforceForecast: generateWorkforceForecast,
        calculateWorkforceHealth: calculateWorkforceHealth,
        calculateCapacityForecast: calculateCapacityForecast,
        explainWorkforceForecast: explainWorkforceForecast,
        normalizeWorkforcePayload: normalizeWorkforcePayload,
        freezeWorkforceOutput: freezeWorkforceOutput,
        governanceFlags: function governanceFlagsExport() { return freezeWorkforceOutput(governanceFlags()); }
    });

    try {
        global.PredictiveWorkforceAnalyticsService = service;
        global.predictiveWorkforceAnalyticsService = service;
    } catch (error) {}
})(typeof window !== 'undefined' ? window : globalThis);
