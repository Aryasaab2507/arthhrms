/**
 * executiveDecisionIntelligenceService.js
 * ARTHHRMS - Executive Decision Intelligence + Leadership Insight Engine
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware executive decision support, strategic
 * briefings, leadership recommendations, organizational health intelligence,
 * opportunity detection, and explainable decision-impact forecasts.
 *
 * AI SAFETY:
 * AI output is advisory only. This service never makes autonomous decisions,
 * modifies business records, changes goals, executes workflows, or bypasses
 * governance.
 *
 * @version 1.0.0
 */
(function attachExecutiveDecisionIntelligenceService(global) {
    'use strict';

    var PREFIX = '[ExecutiveDecisionIntelligenceService]';
    var MAX_ROWS = 1200;
    var MAX_HISTORY = 500;

    var INTELLIGENCE_DOMAINS = Object.freeze(['organizational_performance', 'workforce_health', 'strategic_execution', 'department_performance', 'risk_exposure', 'kpi_achievement', 'dependency_health', 'operational_efficiency']);
    var INSIGHT_TYPES = Object.freeze(['opportunity', 'warning', 'recommendation', 'strategic_insight', 'trend_insight', 'performance_insight', 'governance_insight']);
    var SEVERITIES = Object.freeze(['INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|compensation|ctc|leave.?balance|leaveBalance|payslip|gross|net|basic|hra|pf|tds|bank|tax|password|secret|token|jwt|authorization|private.?key|service.?role|signed.?url|download.?url|storage.?path|file.?path|raw.?payload|rawPayload|raw.?content|payload|body|document|confidentialNote|confidentialEmployeeRecord|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|private KPI|private risk|raw tenant data)\s*[:=]?\s*[\w,.\- ]*/ig;

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

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.userId || context.actor.empId || context.actor.employeeId || context.actor.email) || context && (context.actorId || context.userId || context.employeeId) || '', '');
    }

    function actorDepartment(context) {
        return safeString(context && context.actor && (context.actor.department || context.actor.departmentName) || context && (context.department || context.departmentName) || '', '').trim();
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

    function freezeExecutiveOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            executiveGovernancePreserved: true,
            rbacAuthoritative: true,
            aiAdvisoryOnly: true,
            noAutonomousDecisions: true,
            noBusinessRecordModification: true,
            noGoalMutation: true,
            noWorkflowExecution: true,
            noPermissionChanges: true,
            noGovernanceBypass: true,
            analyzeSummarizeForecastRecommendOnly: true,
            explainableOutputsOnly: true,
            immutableInsightHistory: true,
            immutableBriefingHistory: true,
            immutableRecommendationHistory: true,
            immutableAnalytics: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            aiKpiForecastingIntegrated: !!(global.AIKPIForecastingService || global.aiKpiForecastingService),
            smartEscalationPredictionIntegrated: !!(global.SmartEscalationPredictionService || global.smartEscalationPredictionService),
            organizationPerformanceForecastingIntegrated: !!(global.OrganizationPerformanceForecastingService || global.organizationPerformanceForecastingService),
            advancedOkrIntegrated: !!(global.AdvancedOKRService || global.advancedOkrService),
            dependencyIntelligenceIntegrated: !!(global.CrossDepartmentDependencyService || global.crossDepartmentDependencyService),
            workflowSimulationIntegrated: !!(global.WorkflowSimulationService || global.workflowSimulationService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!(global.AuditService || global.auditService) && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService) && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'EXECUTIVE') return { scope: 'STRATEGIC_EXECUTIVE_VISIBILITY', role: role };
        if (role === 'HR') return { scope: 'HR_INTELLIGENCE_VISIBILITY', role: role, department: actorDepartment(context) || 'HR' };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_INTELLIGENCE_VISIBILITY', role: role, department: actorDepartment(context), actorId: actorId(context) };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_GOVERNANCE_VISIBILITY_ONLY', role: role };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_VISIBILITY_ONLY', role: role };
        return { scope: 'ASSIGNED_INTELLIGENCE_VISIBILITY_ONLY', role: role, department: actorDepartment(context), actorId: actorId(context) };
    }

    function normalizeDomain(value) {
        var raw = safeString(value || '', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (/organization/.test(raw)) return 'organizational_performance';
        if (/workforce|employee|hr/.test(raw)) return 'workforce_health';
        if (/strategic|okr|execution/.test(raw)) return 'strategic_execution';
        if (/department/.test(raw)) return 'department_performance';
        if (/risk/.test(raw)) return 'risk_exposure';
        if (/kpi|achievement/.test(raw)) return 'kpi_achievement';
        if (/dependency/.test(raw)) return 'dependency_health';
        if (/operational|workflow|efficiency/.test(raw)) return 'operational_efficiency';
        return INTELLIGENCE_DOMAINS.indexOf(raw) !== -1 ? raw : 'operational_efficiency';
    }

    function normalizeSeverity(value, fallback) {
        var severity = normalizeToken(value || fallback || 'INFO', 'INFO');
        return SEVERITIES.indexOf(severity) !== -1 ? severity : 'INFO';
    }

    function filterByScope(rows, context, departmentKeys) {
        var visibility = visibilityForContext(context || {});
        var dept = safeString(visibility.department, '');
        if (visibility.scope === 'STRATEGIC_EXECUTIVE_VISIBILITY') return rows.slice();
        if (visibility.scope === 'HR_INTELLIGENCE_VISIBILITY') {
            return rows.filter(function hrRow(row) {
                return /hr|people|workforce|employee/i.test((departmentKeys || ['department', 'domain']).map(function key(rowKey) { return safeString(row[rowKey], ''); }).join(' '));
            });
        }
        if (visibility.scope === 'DEPARTMENT_INTELLIGENCE_VISIBILITY') {
            return rows.filter(function deptRow(row) {
                var haystack = (departmentKeys || ['department', 'departmentName', 'sourceDepartment', 'targetDepartment', 'ownerDepartment']).map(function key(rowKey) { return safeString(row[rowKey], ''); }).join(' ');
                return haystack.indexOf(dept) !== -1;
            });
        }
        return [];
    }

    function tenantRows(rows, tenantSlug, context, departmentKeys) {
        return filterByScope(arrayOf(rows, MAX_ROWS).filter(function tenantRow(row) { return sameTenant(row, tenantSlug); }), context || {}, departmentKeys).map(function clone(row) { return cloneSanitized(row); });
    }

    function validateExecutiveScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeExecutiveOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant executive intelligence is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
            if (role === 'PLATFORM_OWNER') {
                return freezeExecutiveOutput({ success: false, allowed: false, classification: 'PLATFORM_OWNER_EXECUTIVE_INTELLIGENCE_BLOCKED', message: 'PLATFORM_OWNER has governance visibility only and cannot run tenant executive intelligence.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'SUPER_ADMIN') {
                return freezeExecutiveOutput({ success: false, allowed: false, classification: 'SUPER_ADMIN_EXECUTIVE_INTELLIGENCE_BLOCKED', message: 'SUPER_ADMIN has infrastructure visibility only and cannot run tenant executive intelligence.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            return freezeExecutiveOutput({ success: true, allowed: true, classification: 'EXECUTIVE_SCOPE_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
        } catch (error) {
            safeWarn('validateExecutiveScope failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, allowed: false, classification: 'EXECUTIVE_SCOPE_ERROR', message: 'Executive scope validation failed safely.', governance: governanceFlags() });
        }
    }

    function sourceDataFallback(data, tenantSlug) {
        return {
            kpiForecasts: arrayOf(data && (data.kpiScorecards || data.kpis), MAX_ROWS),
            riskPredictions: arrayOf(data && (data.riskPredictions || data.aiRiskPredictions), MAX_ROWS),
            escalationPredictions: arrayOf(data && (data.escalations || data.escalationPredictions), MAX_ROWS),
            okrProgress: arrayOf(data && (data.okrObjectives || data.objectives), MAX_ROWS),
            dependencyIntelligence: arrayOf(data && (data.crossDepartmentDependencies || data.deliverableDependencies), MAX_ROWS),
            workflowSimulations: arrayOf(data && data.workflowSimulationHistory, MAX_ROWS),
            organizationalTrends: [],
            departmentPerformance: arrayOf(data && (data.departmentPerformance || data.performanceGoals), MAX_ROWS)
        };
    }

    function detectRecommendationConflict(rows) {
        var byDomain = {};
        arrayOf(rows, MAX_ROWS).forEach(function each(row) {
            var domain = normalizeDomain(row && row.domain);
            var action = safeString(row && row.action, '').toLowerCase();
            byDomain[domain] = byDomain[domain] || [];
            byDomain[domain].push(action);
        });
        return Object.keys(byDomain).some(function domainHasConflict(domain) {
            var text = byDomain[domain].join(' | ');
            return /increase/.test(text) && /reduce/.test(text);
        });
    }

    function normalizeExecutivePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeExecutiveOutput({
                    success: false,
                    classification: 'MALFORMED_EXECUTIVE_PAYLOAD',
                    message: 'Executive intelligence payload must be an object.',
                    failures: [{ failureCode: 'MALFORMED_EXECUTIVE_PAYLOAD' }],
                    governance: governanceFlags()
                });
            }
            var data = rawData();
            var tenantSlug = resolveTenant(payload, context || {}, data);
            var ctxTenant = contextTenant(context || {});
            if (tenantSlug && ctxTenant && tenantSlug !== ctxTenant) {
                return freezeExecutiveOutput({
                    success: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant executive intelligence is blocked.',
                    tenantSlug: tenantSlug,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var scope = validateExecutiveScope(payload, context || {});
            if (!scope.allowed) return scope;
            var fallback = sourceDataFallback(data, tenantSlug);
            var domains = arrayOf(payload.intelligenceDomains, 40).map(normalizeDomain);
            if (!domains.length) domains = INTELLIGENCE_DOMAINS.slice();
            var normalized = {
                success: true,
                classification: 'EXECUTIVE_PAYLOAD_NORMALIZED',
                tenantSlug: tenantSlug,
                briefingCadence: safeString(payload.briefingCadence || 'weekly', 'weekly').toLowerCase(),
                intelligenceDomains: domains,
                kpiForecasts: tenantRows(payload.kpiForecasts || fallback.kpiForecasts, tenantSlug, context, ['department', 'domain']),
                riskPredictions: tenantRows(payload.riskPredictions || fallback.riskPredictions, tenantSlug, context, ['department', 'domain']),
                escalationPredictions: tenantRows(payload.escalationPredictions || fallback.escalationPredictions, tenantSlug, context, ['department', 'domain']),
                okrProgress: tenantRows(payload.okrProgress || fallback.okrProgress, tenantSlug, context, ['department', 'ownerDepartment', 'domain']),
                dependencyIntelligence: tenantRows(payload.dependencyIntelligence || fallback.dependencyIntelligence, tenantSlug, context, ['department', 'sourceDepartment', 'targetDepartment', 'domain']),
                workflowSimulations: tenantRows(payload.workflowSimulations || fallback.workflowSimulations, tenantSlug, context, ['department', 'domain']),
                organizationalTrends: tenantRows(payload.organizationalTrends || fallback.organizationalTrends, tenantSlug, context, ['department', 'domain']),
                departmentPerformance: tenantRows(payload.departmentPerformance || fallback.departmentPerformance, tenantSlug, context, ['department', 'domain']),
                recommendations: tenantRows(payload.recommendations || [], tenantSlug, context, ['department', 'domain']),
                analytics: cloneSanitized(payload.analytics || {}),
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            };
            var totalRows = normalized.kpiForecasts.length + normalized.riskPredictions.length + normalized.escalationPredictions.length + normalized.okrProgress.length + normalized.dependencyIntelligence.length + normalized.workflowSimulations.length + normalized.organizationalTrends.length + normalized.departmentPerformance.length;
            normalized.edgeCases = {
                insufficientDataDetected: totalRows < 3,
                sparseDatasetsDetected: totalRows < 6,
                missingDependenciesDetected: !normalized.integrationHealth.aiRiskPredictionIntegrated || !normalized.integrationHealth.aiKpiForecastingIntegrated || !normalized.integrationHealth.workflowSimulationIntegrated,
                conflictingRecommendationsDetected: detectRecommendationConflict(normalized.recommendations)
            };
            normalized.executiveWarnings = [];
            if (normalized.edgeCases.sparseDatasetsDetected) normalized.executiveWarnings.push({ warningCode: 'SPARSE_EXECUTIVE_DATASET', severity: 'MODERATE', message: 'Executive intelligence is using sparse tenant-scoped data.' });
            if (normalized.edgeCases.conflictingRecommendationsDetected) normalized.executiveWarnings.push({ warningCode: 'CONFLICTING_RECOMMENDATIONS_DETECTED', severity: 'HIGH', message: 'Conflicting recommendation directions require human executive review.' });
            return freezeExecutiveOutput(normalized);
        } catch (error) {
            safeWarn('normalizeExecutivePayload failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, classification: 'EXECUTIVE_NORMALIZATION_ERROR', message: 'Executive payload normalization failed safely.', governance: governanceFlags() });
        }
    }

    function severityFromScore(score, inverse) {
        var value = clamp(score, 0, 100);
        if (inverse) value = 100 - value;
        if (value >= 85) return 'CRITICAL';
        if (value >= 70) return 'HIGH';
        if (value >= 45) return 'MODERATE';
        if (value >= 20) return 'LOW';
        return 'INFO';
    }

    function insightRow(type, domain, severity, title, reason, evidence, confidence, expectedImpact, factors) {
        return {
            insightType: type,
            domain: normalizeDomain(domain),
            severity: normalizeSeverity(severity, 'INFO'),
            title: title,
            reason: reason,
            supportingEvidence: arrayOf(evidence, 8),
            contributingFactors: arrayOf(factors, 8),
            confidenceScore: clamp(confidence, 0, 100),
            expectedImpact: expectedImpact
        };
    }

    function generateExecutiveInsights(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeExecutivePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var insights = [];
            normalized.riskPredictions.forEach(function risk(row) {
                var score = clamp(row.riskScore || row.escalationProbability || 50, 0, 100);
                insights.push(insightRow('warning', row.domain || 'risk_exposure', row.riskLevel || severityFromScore(score), 'Risk exposure requires executive attention', row.explanation || row.reason || 'Risk score is elevated in tenant-scoped signals.', ['Risk score ' + score + '%'], row.confidenceScore || 65, 'Reduce unresolved governance and execution risk.', ['risk_prediction', row.domain || 'risk_exposure']));
            });
            normalized.escalationPredictions.forEach(function escalation(row) {
                var score = clamp(row.escalationProbability || row.urgencyScore || 50, 0, 100);
                insights.push(insightRow('warning', row.domain || 'strategic_execution', row.escalationLevel || severityFromScore(score), 'Escalation probability is rising', row.explanation || 'Escalation prediction shows elevated urgency.', ['Escalation probability ' + score + '%'], row.confidenceScore || row.urgencyScore || 65, 'Improve management attention before escalation becomes critical.', ['escalation_prediction']));
            });
            normalized.kpiForecasts.forEach(function kpi(row) {
                var achievement = clamp(row.achievementProbability || row.forecastedCompletion || row.currentValue || 50, 0, 100);
                var type = achievement >= 75 ? 'opportunity' : 'performance_insight';
                insights.push(insightRow(type, row.domain || 'kpi_achievement', severityFromScore(achievement, true), achievement >= 75 ? 'KPI trajectory can be amplified' : 'KPI achievement is below target path', row.explanation || 'KPI forecast indicates decision support is useful.', ['Achievement probability ' + achievement + '%'], row.forecastConfidence || row.confidenceScore || 64, achievement >= 75 ? 'Capture upside by reinforcing current execution.' : 'Improve target achievement probability with focused intervention.', ['kpi_forecast']));
            });
            normalized.okrProgress.forEach(function okr(row) {
                var progress = clamp(row.progressPercent || row.completionRate || 0, 0, 100);
                insights.push(insightRow(progress >= 70 ? 'opportunity' : 'strategic_insight', row.domain || 'strategic_execution', severityFromScore(progress, true), progress >= 70 ? 'OKR progress indicates execution momentum' : 'OKR progress needs leadership support', safeString(row.title || 'Strategic objective', 'Strategic objective') + ' is at ' + progress + '% progress.', ['OKR progress ' + progress + '%'], row.confidenceScore || 66, progress >= 70 ? 'Increase strategic momentum.' : 'Reduce strategic execution gap.', ['okr_progress']));
            });
            normalized.dependencyIntelligence.forEach(function (dep) {
                var bottleneck = clamp(dep.bottleneckScore || (100 - (dep.dependencyHealthScore || 60)), 0, 100);
                insights.push(insightRow('governance_insight', dep.domain || 'dependency_health', severityFromScore(bottleneck), 'Dependency health shapes execution confidence', dep.explanation || 'Dependency intelligence indicates handoff or blockage pressure.', ['Bottleneck score ' + bottleneck + '%'], dep.confidenceScore || 68, 'Reduce cross-functional execution drag.', ['dependency_intelligence']));
            });
            normalized.workflowSimulations.forEach(function (sim) {
                var impact = clamp(sim.impactScore || (100 - (sim.executionScore || 70)), 0, 100);
                insights.push(insightRow('trend_insight', sim.domain || 'operational_efficiency', severityFromScore(impact), 'Scenario modeling shows decision impact', sim.projectedOutcome || sim.explanation || 'Workflow simulation generated a decision-impact forecast.', ['Impact score ' + impact + '%'], sim.confidenceScore || 63, 'Plan mitigation before production workflow changes.', ['workflow_simulation']));
            });
            normalized.departmentPerformance.forEach(function (perf) {
                var score = clamp(perf.performanceScore || perf.score || 60, 0, 100);
                insights.push(insightRow(score >= 72 ? 'opportunity' : 'performance_insight', perf.domain || 'department_performance', severityFromScore(score, true), score >= 72 ? 'Department performance can be scaled' : 'Department performance needs review', (perf.department || 'Department') + ' performance score is ' + score + '%.', ['Performance score ' + score + '%'], perf.confidenceScore || 66, score >= 72 ? 'Scale effective practices.' : 'Improve departmental execution reliability.', ['department_performance']));
            });
            if (!insights.length) {
                insights.push(insightRow('governance_insight', 'organizational_performance', 'MODERATE', 'Executive intelligence has limited data', 'Insufficient tenant-scoped data was available, so conservative governance review is recommended.', ['Sparse executive dataset'], 50, 'Improve planning quality by connecting more source systems.', ['sparse_dataset']));
            }
            var opportunities = insights.filter(function opportunity(row) { return row.insightType === 'opportunity'; });
            if (!opportunities.length) {
                opportunities.push(insightRow('opportunity', 'organizational_performance', 'INFO', 'Executive operating rhythm can improve', 'A recurring executive review cadence can improve decision quality.', ['Briefing cadence available'], 60, 'Increase leadership alignment.', ['executive_cadence']));
            }
            var warnings = insights.filter(function warning(row) { return row.severity === 'HIGH' || row.severity === 'CRITICAL' || row.insightType === 'warning'; });
            var recommendations = insights.slice(0, 12).map(function rec(row) {
                return {
                    domain: row.domain,
                    severity: row.severity,
                    action: row.severity === 'CRITICAL' || row.severity === 'HIGH' ? 'Review this item in the next executive governance forum.' : 'Monitor this signal and assign human follow-up if trend worsens.',
                    reason: row.reason,
                    supportingEvidence: row.supportingEvidence,
                    contributingFactors: row.contributingFactors,
                    confidenceScore: row.confidenceScore,
                    expectedImpact: row.expectedImpact,
                    humanApprovalRequired: true
                };
            });
            return freezeExecutiveOutput({
                success: true,
                classification: 'EXECUTIVE_INSIGHTS_GENERATED',
                tenantSlug: normalized.tenantSlug,
                insights: insights,
                opportunities: opportunities,
                warnings: warnings,
                recommendations: recommendations,
                governance: governanceFlags(),
                visibility: normalized.visibility,
                integrationHealth: normalized.integrationHealth
            });
        } catch (error) {
            safeWarn('generateExecutiveInsights failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, classification: 'EXECUTIVE_INSIGHTS_ERROR', message: 'Executive insight generation failed safely.', governance: governanceFlags() });
        }
    }

    function explainRecommendation(recommendation, context) {
        try {
            if (!isPlainObject(recommendation)) {
                return freezeExecutiveOutput({ success: false, classification: 'MALFORMED_RECOMMENDATION', message: 'Recommendation must be an object.', governance: governanceFlags() });
            }
            var reason = safeString(recommendation.reason || recommendation.explanation, '').trim() || 'Recommendation is based on tenant-scoped executive intelligence signals.';
            if (/^AI recommends this$/i.test(reason)) reason = 'Recommendation is based on supporting evidence and contributing factors, not autonomous AI decision-making.';
            var output = {
                success: true,
                classification: 'RECOMMENDATION_EXPLAINED',
                recommendation: {
                    domain: normalizeDomain(recommendation.domain),
                    severity: normalizeSeverity(recommendation.severity || recommendation.riskLevel, 'MODERATE'),
                    action: safeString(recommendation.action || 'Review with human executive owner.', 'Review with human executive owner.'),
                    reason: reason,
                    supportingEvidence: arrayOf(recommendation.supportingEvidence || recommendation.evidence, 12).map(function evidence(item) { return safeString(item, ''); }).filter(Boolean),
                    contributingFactors: arrayOf(recommendation.contributingFactors, 12).map(function factor(item) { return safeString(item, ''); }).filter(Boolean),
                    confidenceScore: clamp(recommendation.confidenceScore || recommendation.confidence || 60, 0, 100),
                    expectedImpact: safeString(recommendation.expectedImpact || 'Improve executive decision quality.', 'Improve executive decision quality.'),
                    humanApprovalRequired: true
                },
                governance: governanceFlags(),
                visibility: visibilityForContext(context || {})
            };
            if (!output.recommendation.supportingEvidence.length) output.recommendation.supportingEvidence.push('Tenant-scoped intelligence signal');
            if (!output.recommendation.contributingFactors.length) output.recommendation.contributingFactors.push('executive_intelligence');
            return freezeExecutiveOutput(output);
        } catch (error) {
            safeWarn('explainRecommendation failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, classification: 'RECOMMENDATION_EXPLAIN_ERROR', message: 'Recommendation explainability failed safely.', governance: governanceFlags() });
        }
    }

    function calculateStrategicReadiness(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeExecutivePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var analytics = normalized.analytics || {};
            var kpiAvg = average(normalized.kpiForecasts.map(function score(row) { return clamp(row.achievementProbability || row.forecastedCompletion || row.currentValue, 0, 100); }));
            var riskAvg = average(normalized.riskPredictions.map(function score(row) { return clamp(row.riskScore || row.escalationProbability, 0, 100); }));
            var okrAvg = average(normalized.okrProgress.map(function score(row) { return clamp(row.progressPercent || row.completionRate, 0, 100); }));
            var depAvg = average(normalized.dependencyIntelligence.map(function score(row) { return clamp(row.dependencyHealthScore || (100 - (row.bottleneckScore || 0)), 0, 100); }));
            var perfAvg = average(normalized.departmentPerformance.map(function score(row) { return clamp(row.performanceScore || row.score, 0, 100); }));
            var simAvg = average(normalized.workflowSimulations.map(function score(row) { return clamp(row.executionScore || (100 - (row.impactScore || 0)), 0, 100); }));
            var executiveIntelligenceScore = clamp(Math.round(average([safeNumber(analytics.insightEffectiveness, 0), safeNumber(analytics.recommendationAccuracy, 0), kpiAvg || 60, depAvg || 60, simAvg || 60])), 0, 100);
            var leadershipEffectivenessScore = clamp(Math.round(average([safeNumber(analytics.executiveEngagement, 0), okrAvg || 60, perfAvg || 60, 100 - (riskAvg || 40)])), 0, 100);
            var strategicReadinessScore = clamp(Math.round(average([executiveIntelligenceScore, leadershipEffectivenessScore, kpiAvg || 60, okrAvg || 60, depAvg || 60, simAvg || 60]) - (normalized.edgeCases.sparseDatasetsDetected ? 8 : 0)), 0, 100);
            return freezeExecutiveOutput({
                success: true,
                classification: 'STRATEGIC_READINESS_CALCULATED',
                tenantSlug: normalized.tenantSlug,
                executiveIntelligenceScore: executiveIntelligenceScore,
                leadershipEffectivenessScore: leadershipEffectivenessScore,
                strategicReadinessScore: strategicReadinessScore,
                strategicHealthTrend: clamp(analytics.strategicHealthTrend || strategicReadinessScore, 0, 100),
                recommendationAccuracy: clamp(analytics.recommendationAccuracy || executiveIntelligenceScore, 0, 100),
                insightEffectiveness: clamp(analytics.insightEffectiveness || executiveIntelligenceScore, 0, 100),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateStrategicReadiness failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, classification: 'STRATEGIC_READINESS_ERROR', message: 'Strategic readiness calculation failed safely.', governance: governanceFlags() });
        }
    }

    function briefingForPeriod(period, insights, readiness, normalized) {
        var topRisks = insights.warnings.slice(0, period === 'daily' ? 3 : 6);
        var topOpportunities = insights.opportunities.slice(0, period === 'daily' ? 2 : 5);
        var bottlenecks = insights.insights.filter(function bottleneck(row) { return /dependency|operational|strategic/.test(row.domain) && (row.severity === 'HIGH' || row.severity === 'CRITICAL' || row.insightType === 'governance_insight'); }).slice(0, 5);
        return {
            period: period,
            tenantSlug: normalized.tenantSlug,
            executiveSummary: 'Executive intelligence generated ' + insights.insights.length + ' tenant-scoped insight(s), with strategic readiness at ' + readiness.strategicReadinessScore + '%.',
            topRisks: topRisks,
            topOpportunities: topOpportunities,
            strategicBottlenecks: bottlenecks,
            executionHealth: readiness.strategicReadinessScore,
            workforceIndicators: insights.insights.filter(function workforce(row) { return row.domain === 'workforce_health'; }).slice(0, 4),
            generatedAt: nowIso()
        };
    }

    function buildExecutiveBriefing(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeExecutivePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var insights = generateExecutiveInsights(normalized, context || {});
            var readiness = calculateStrategicReadiness(normalized, context || {});
            var briefings = {
                daily: briefingForPeriod('daily', insights, readiness, normalized),
                weekly: briefingForPeriod('weekly', insights, readiness, normalized),
                monthly: briefingForPeriod('monthly', insights, readiness, normalized),
                quarterly: briefingForPeriod('quarterly', insights, readiness, normalized)
            };
            return freezeExecutiveOutput({
                success: true,
                classification: 'EXECUTIVE_BRIEFINGS_BUILT',
                tenantSlug: normalized.tenantSlug,
                briefings: briefings,
                governance: governanceFlags(),
                visibility: normalized.visibility,
                integrationHealth: normalized.integrationHealth
            });
        } catch (error) {
            safeWarn('buildExecutiveBriefing failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, classification: 'EXECUTIVE_BRIEFING_ERROR', message: 'Executive briefing generation failed safely.', governance: governanceFlags() });
        }
    }

    function appendHistory(data, key, record) {
        data[key] = arrayOf(data[key], MAX_HISTORY);
        data[key].push(cloneSanitized(record));
        if (data[key].length > MAX_HISTORY) data[key] = data[key].slice(data[key].length - MAX_HISTORY);
    }

    function recordAudit(eventType, details, context) {
        if (context && context.skipAuditPersistence) return false;
        var event = {
            actionType: eventType,
            eventType: eventType,
            actorId: actorId(context || {}) || 'SYSTEM',
            tenantSlug: contextTenant(context || {}),
            createdAt: nowIso(),
            details: cloneSanitized(details || {})
        };
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                service.recordAudit(event);
                return true;
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = arrayOf(data.auditLogs, MAX_HISTORY);
            data.auditLogs.push(event);
            saveData(data);
            return true;
        } catch (error) {}
        return false;
    }

    function recordTelemetry(eventType, details, context) {
        if (context && context.skipTelemetry) return false;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.recordEvent === 'function') {
                service.recordEvent(eventType, cloneSanitized(details || {}), context || {});
                return true;
            }
            if (service && typeof service.track === 'function') {
                service.track(eventType, cloneSanitized(details || {}), context || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function generateExecutiveDecisionReport(payload, context) {
        try {
            var normalized = normalizeExecutivePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var insights = generateExecutiveInsights(normalized, context || {});
            var briefing = buildExecutiveBriefing(normalized, context || {});
            var readiness = calculateStrategicReadiness(normalized, context || {});
            var explainedRecommendations = insights.recommendations.map(function explain(row) {
                return explainRecommendation(row, context || {}).recommendation;
            }).filter(Boolean);
            var impactForecasts = insights.insights.slice(0, 12).map(function impact(row) {
                return {
                    domain: row.domain,
                    severity: row.severity,
                    confidenceScore: row.confidenceScore,
                    expectedImpact: row.expectedImpact
                };
            });
            var expectedOutcomes = explainedRecommendations.slice(0, 10).map(function outcome(row) {
                return { domain: row.domain, expectedOutcome: row.expectedImpact, confidenceScore: row.confidenceScore };
            });
            var report = {
                success: true,
                readOnly: true,
                classification: 'EXECUTIVE_DECISION_INTELLIGENCE_READY',
                tenantSlug: normalized.tenantSlug,
                visibility: normalized.visibility,
                intelligenceDomains: normalized.intelligenceDomains,
                kpiForecasts: normalized.kpiForecasts,
                riskPredictions: normalized.riskPredictions,
                escalationPredictions: normalized.escalationPredictions,
                okrProgress: normalized.okrProgress,
                dependencyIntelligence: normalized.dependencyIntelligence,
                workflowSimulations: normalized.workflowSimulations,
                organizationalTrends: normalized.organizationalTrends,
                departmentPerformance: normalized.departmentPerformance,
                insights: insights.insights,
                opportunities: insights.opportunities,
                warnings: insights.warnings,
                decisionSummaries: insights.insights.slice(0, 8).map(function summary(row) {
                    return { domain: row.domain, severity: row.severity, summary: row.title, reason: row.reason, confidenceScore: row.confidenceScore };
                }),
                executiveBriefings: briefing.briefings,
                strategicRecommendations: explainedRecommendations,
                expectedOutcomes: expectedOutcomes,
                impactForecasts: impactForecasts,
                intelligenceTimeline: insights.insights.slice(0, 12).map(function timeline(row, index) {
                    return { sequence: index + 1, type: row.insightType, domain: row.domain, severity: row.severity, title: row.title };
                }),
                analytics: {
                    recommendationUsage: safeNumber(normalized.analytics.recommendationUsage, explainedRecommendations.length),
                    insightCategories: INSIGHT_TYPES.map(function type(typeName) {
                        return { type: typeName, count: insights.insights.filter(function match(row) { return row.insightType === typeName; }).length };
                    }),
                    executiveEngagement: clamp(normalized.analytics.executiveEngagement || readiness.leadershipEffectivenessScore, 0, 100),
                    recommendationAccuracy: readiness.recommendationAccuracy,
                    insightEffectiveness: readiness.insightEffectiveness,
                    strategicHealthTrends: readiness.strategicHealthTrend,
                    executiveIntelligenceScore: readiness.executiveIntelligenceScore,
                    leadershipEffectivenessScore: readiness.leadershipEffectivenessScore,
                    strategicReadinessScore: readiness.strategicReadinessScore
                },
                edgeCases: normalized.edgeCases,
                executiveWarnings: (normalized.executiveWarnings || []),
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {}),
                generatedAt: nowIso()
            };
            var data = rawData();
            appendHistory(data, 'executiveInsightHistory', { historyId: 'EIH-' + Date.now(), tenantSlug: normalized.tenantSlug, insightCount: insights.insights.length, immutable: true, createdAt: report.generatedAt });
            appendHistory(data, 'executiveBriefingHistory', { historyId: 'EBH-' + Date.now(), tenantSlug: normalized.tenantSlug, periods: ['daily', 'weekly', 'monthly', 'quarterly'], immutable: true, createdAt: report.generatedAt });
            appendHistory(data, 'executiveRecommendationHistory', { historyId: 'ERH-' + Date.now(), tenantSlug: normalized.tenantSlug, recommendationCount: explainedRecommendations.length, immutable: true, createdAt: report.generatedAt });
            appendHistory(data, 'executiveAnalyticsHistory', { historyId: 'EAH-' + Date.now(), tenantSlug: normalized.tenantSlug, strategicReadinessScore: readiness.strategicReadinessScore, executiveIntelligenceScore: readiness.executiveIntelligenceScore, immutable: true, createdAt: report.generatedAt });
            saveData(data);
            recordAudit('EXECUTIVE_INTELLIGENCE_GENERATED', {
                insightCount: insights.insights.length,
                recommendationCount: explainedRecommendations.length,
                strategicReadinessScore: readiness.strategicReadinessScore
            }, context || {});
            recordTelemetry('EXECUTIVE_INTELLIGENCE_GENERATED', {
                insightCount: insights.insights.length,
                strategicReadinessScore: readiness.strategicReadinessScore
            }, context || {});
            return freezeExecutiveOutput(report);
        } catch (error) {
            safeWarn('generateExecutiveDecisionReport failed safely', error && error.message);
            return freezeExecutiveOutput({ success: false, classification: 'EXECUTIVE_DECISION_REPORT_ERROR', message: 'Executive decision report failed safely.', governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var context = { tenantSlug: 'self-test', actor: { id: 'DIR', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
        var payload = {
            tenantSlug: 'self-test',
            intelligenceDomains: ['risk_exposure', 'kpi_achievement', 'dependency_health'],
            kpiForecasts: [{ tenantSlug: 'self-test', domain: 'kpi_achievement', achievementProbability: 64, forecastConfidence: 70, explanation: 'KPI below target.' }],
            riskPredictions: [{ tenantSlug: 'self-test', domain: 'risk_exposure', riskLevel: 'HIGH', riskScore: 78, confidenceScore: 75, explanation: 'Risk is elevated.' }],
            dependencyIntelligence: [{ tenantSlug: 'self-test', domain: 'dependency_health', dependencyHealthScore: 58, bottleneckScore: 68, explanation: 'Dependency bottleneck.' }]
        };
        var checks = [];
        function add(name, passed) { checks.push({ name: name, passed: !!passed }); }
        try {
            var malformed = normalizeExecutivePayload('bad', context);
            add('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var insights = generateExecutiveInsights(payload, context);
            add('insight generation works', insights.success && insights.insights.length > 0);
            var briefing = buildExecutiveBriefing(payload, context);
            add('executive briefings work', briefing.success && briefing.briefings.weekly.topRisks.length > 0);
            var recommendation = explainRecommendation(insights.recommendations[0], context);
            add('recommendation engine works', recommendation.success && recommendation.recommendation.reason);
            add('explainability works', recommendation.recommendation.supportingEvidence.length > 0 && recommendation.recommendation.expectedImpact);
            var report = generateExecutiveDecisionReport(payload, context);
            add('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.strategicRecommendations));
        } catch (error) {
            add('self-test completed without uncaught throw', false);
        }
        var result = freezeExecutiveOutput({
            passed: checks.every(function ok(item) { return item.passed; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_EXECUTIVE_DECISION_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        version: '1.0.0',
        INTELLIGENCE_DOMAINS: INTELLIGENCE_DOMAINS,
        INSIGHT_TYPES: INSIGHT_TYPES,
        SEVERITIES: SEVERITIES,
        generateExecutiveInsights: generateExecutiveInsights,
        buildExecutiveBriefing: buildExecutiveBriefing,
        calculateStrategicReadiness: calculateStrategicReadiness,
        explainRecommendation: explainRecommendation,
        normalizeExecutivePayload: normalizeExecutivePayload,
        freezeExecutiveOutput: freezeExecutiveOutput,
        validateExecutiveScope: validateExecutiveScope,
        generateExecutiveDecisionReport: generateExecutiveDecisionReport,
        runSelfTest: runSelfTest
    });

    try {
        global.ExecutiveDecisionIntelligenceService = service;
        global.executiveDecisionIntelligenceService = service;
    } catch (error) {
        safeWarn('Service export failed safely', error && error.message);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
