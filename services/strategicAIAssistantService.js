/**
 * strategicAIAssistantService.js
 * ARTHHRMS - Strategic AI Assistant Foundation + Enterprise Knowledge Intelligence Layer
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware conversational intelligence over strategic
 * KPI, OKR, dependency, escalation, executive, workforce, operational, and
 * governance signals.
 *
 * AI SAFETY:
 * AI output is advisory only. This service never approves, rejects, modifies
 * records, executes workflows, triggers automations, changes permissions, or
 * bypasses governance.
 *
 * @version 1.0.0
 */
(function attachStrategicAIAssistantService(global) {
    'use strict';

    var PREFIX = '[StrategicAIAssistantService]';
    var MAX_ROWS = 1200;
    var MAX_HISTORY = 500;

    var KNOWLEDGE_DOMAINS = Object.freeze(['kpi_intelligence', 'okr_intelligence', 'dependency_intelligence', 'escalation_intelligence', 'executive_intelligence', 'workforce_intelligence', 'operational_intelligence', 'governance_intelligence']);
    var RESPONSE_TYPES = Object.freeze(['summary', 'insights', 'recommendations', 'forecasts', 'explanations', 'trend_analysis', 'executive_briefing']);
    var PRIORITIES = Object.freeze(['INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

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

    function freezeAssistantOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacAuthoritative: true,
            aiAdvisoryOnly: true,
            explainableOutputsOnly: true,
            auditableInteractions: true,
            noAutonomousActions: true,
            noRecordModification: true,
            noApprovalExecution: true,
            noWorkflowExecution: true,
            noAutomationTrigger: true,
            noPermissionChanges: true,
            noGovernanceBypass: true,
            answersExplainsSummarizesRecommendsOnly: true,
            immutableConversationHistory: true,
            immutableRecommendationHistory: true,
            immutableAnalytics: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            executiveIntelligenceIntegrated: !!(global.ExecutiveDecisionIntelligenceService || global.executiveDecisionIntelligenceService),
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
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'EXECUTIVE') return { scope: 'STRATEGIC_ASSISTANT_VISIBILITY', role: role };
        if (role === 'HR') return { scope: 'HR_ASSISTANT_VISIBILITY', role: role, department: actorDepartment(context) || 'HR' };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_ASSISTANT_VISIBILITY', role: role, department: actorDepartment(context), actorId: actorId(context) };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_GOVERNANCE_VISIBILITY_ONLY', role: role };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_VISIBILITY_ONLY', role: role };
        return { scope: 'PERSONAL_ASSISTANT_VISIBILITY', role: role, department: actorDepartment(context), actorId: actorId(context) };
    }

    function normalizeDomain(value) {
        var raw = safeString(value || '', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (/kpi|forecast|target/.test(raw)) return 'kpi_intelligence';
        if (/okr|objective|key_result|goal/.test(raw)) return 'okr_intelligence';
        if (/dependency|block|bottleneck/.test(raw)) return 'dependency_intelligence';
        if (/escalation|approval|urgent/.test(raw)) return 'escalation_intelligence';
        if (/executive|brief|leadership/.test(raw)) return 'executive_intelligence';
        if (/workforce|employee|people|hr/.test(raw)) return 'workforce_intelligence';
        if (/operational|workflow|throughput|simulation/.test(raw)) return 'operational_intelligence';
        if (/governance|audit|control|permission/.test(raw)) return 'governance_intelligence';
        return KNOWLEDGE_DOMAINS.indexOf(raw) !== -1 ? raw : 'operational_intelligence';
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

    function filterByScope(rows, context, departmentKeys) {
        var visibility = visibilityForContext(context || {});
        var dept = safeString(visibility.department, '');
        if (visibility.scope === 'STRATEGIC_ASSISTANT_VISIBILITY') return rows.slice();
        if (visibility.scope === 'HR_ASSISTANT_VISIBILITY') {
            return rows.filter(function hrRow(row) {
                return /hr|people|workforce|employee/i.test((departmentKeys || ['department', 'domain']).map(function key(rowKey) { return safeString(row[rowKey], ''); }).join(' '));
            });
        }
        if (visibility.scope === 'DEPARTMENT_ASSISTANT_VISIBILITY') {
            return rows.filter(function deptRow(row) {
                var haystack = (departmentKeys || ['department', 'departmentName', 'sourceDepartment', 'targetDepartment', 'ownerDepartment']).map(function key(rowKey) { return safeString(row[rowKey], ''); }).join(' ');
                return dept && haystack.indexOf(dept) !== -1;
            });
        }
        if (visibility.scope === 'PERSONAL_ASSISTANT_VISIBILITY') {
            var id = safeString(visibility.actorId, '');
            return rows.filter(function personalRow(row) {
                return id && [row.ownerId, row.assigneeId, row.employeeId, row.actorId, row.userId].map(function toText(value) { return safeString(value, ''); }).indexOf(id) !== -1;
            });
        }
        return [];
    }

    function tenantRows(rows, tenantSlug, context, departmentKeys) {
        return filterByScope(arrayOf(rows, MAX_ROWS).filter(function tenantRow(row) { return sameTenant(row, tenantSlug); }), context || {}, departmentKeys).map(function clone(row) { return cloneSanitized(row); });
    }

    function validateAssistantScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeAssistantOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant assistant intelligence is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
            if (role === 'PLATFORM_OWNER') {
                return freezeAssistantOutput({ success: false, allowed: false, classification: 'PLATFORM_OWNER_ASSISTANT_BLOCKED', message: 'PLATFORM_OWNER has governance visibility only and cannot run tenant assistant intelligence.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'SUPER_ADMIN') {
                return freezeAssistantOutput({ success: false, allowed: false, classification: 'SUPER_ADMIN_ASSISTANT_BLOCKED', message: 'SUPER_ADMIN has infrastructure visibility only and cannot run tenant assistant intelligence.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            return freezeAssistantOutput({ success: true, allowed: true, classification: 'ASSISTANT_SCOPE_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
        } catch (error) {
            safeWarn('validateAssistantScope failed safely', error && error.message);
            return freezeAssistantOutput({ success: false, allowed: false, classification: 'ASSISTANT_SCOPE_ERROR', message: 'Assistant scope validation failed safely.', governance: governanceFlags() });
        }
    }

    function sourceDataFallback(data) {
        return {
            kpiIntelligence: arrayOf(data && (data.kpiScorecards || data.kpis), MAX_ROWS),
            okrIntelligence: arrayOf(data && (data.okrObjectives || data.objectives), MAX_ROWS),
            dependencyIntelligence: arrayOf(data && (data.crossDepartmentDependencies || data.deliverableDependencies), MAX_ROWS),
            escalationIntelligence: arrayOf(data && (data.escalations || data.escalationPredictions), MAX_ROWS),
            executiveIntelligence: arrayOf(data && (data.executiveInsightHistory || data.executiveRecommendationHistory), MAX_ROWS),
            workforceIntelligence: arrayOf(data && (data.workforceInsights || data.employeeLifecycleAnalytics), MAX_ROWS),
            operationalIntelligence: arrayOf(data && (data.workflowEvents || data.workflowSimulationHistory), MAX_ROWS),
            governanceIntelligence: arrayOf(data && (data.auditLogs || data.governanceEvents), MAX_ROWS)
        };
    }

    function classifyQuestion(query) {
        var text = safeString(query, '').toLowerCase();
        var categories = [];
        if (/risk|warning|threat|concern/.test(text)) categories.push('risks');
        if (/department|underperform|performance/.test(text)) categories.push('department_performance');
        if (/okr|objective|goal/.test(text)) categories.push('okrs');
        if (/bottleneck|block|dependency/.test(text)) categories.push('bottlenecks');
        if (/escalat|approval|likely/.test(text)) categories.push('escalations');
        if (/kpi|target|forecast|miss/.test(text)) categories.push('kpis');
        if (/brief|executive|summary/.test(text)) categories.push('executive_briefing');
        if (!categories.length) categories.push('general_summary');
        return categories;
    }

    function normalizeAssistantPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeAssistantOutput({
                    success: false,
                    classification: 'MALFORMED_ASSISTANT_PAYLOAD',
                    message: 'Assistant payload must be an object.',
                    failures: [{ failureCode: 'MALFORMED_ASSISTANT_PAYLOAD' }],
                    governance: governanceFlags()
                });
            }
            var query = safeString(payload.query || payload.question || '', '').trim();
            if (!query) {
                return freezeAssistantOutput({
                    success: false,
                    classification: 'MALFORMED_ASSISTANT_QUERY',
                    message: 'Assistant query must be a non-empty string.',
                    failures: [{ failureCode: 'MALFORMED_ASSISTANT_QUERY' }],
                    governance: governanceFlags()
                });
            }
            var data = rawData();
            var tenantSlug = resolveTenant(payload, context || {}, data);
            var ctxTenant = contextTenant(context || {});
            if (tenantSlug && ctxTenant && tenantSlug !== ctxTenant) {
                return freezeAssistantOutput({
                    success: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant assistant intelligence is blocked.',
                    tenantSlug: tenantSlug,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var scope = validateAssistantScope(payload, context || {});
            if (!scope.allowed) return scope;
            var fallback = sourceDataFallback(data);
            var domains = arrayOf(payload.knowledgeDomains, 40).map(normalizeDomain);
            if (!domains.length) domains = KNOWLEDGE_DOMAINS.slice();
            var normalized = {
                success: true,
                classification: 'ASSISTANT_PAYLOAD_NORMALIZED',
                tenantSlug: tenantSlug,
                query: redactString(query).slice(0, 800),
                mode: safeString(payload.mode || 'strategic_insights', 'strategic_insights').toLowerCase(),
                responseType: safeString(payload.responseType || '', '').toLowerCase(),
                knowledgeDomains: domains,
                questionCategories: classifyQuestion(query),
                kpiIntelligence: tenantRows(payload.kpiIntelligence || fallback.kpiIntelligence, tenantSlug, context, ['department', 'domain']),
                okrIntelligence: tenantRows(payload.okrIntelligence || fallback.okrIntelligence, tenantSlug, context, ['department', 'ownerDepartment', 'domain']),
                dependencyIntelligence: tenantRows(payload.dependencyIntelligence || fallback.dependencyIntelligence, tenantSlug, context, ['department', 'sourceDepartment', 'targetDepartment', 'domain']),
                escalationIntelligence: tenantRows(payload.escalationIntelligence || fallback.escalationIntelligence, tenantSlug, context, ['department', 'domain']),
                executiveIntelligence: tenantRows(payload.executiveIntelligence || fallback.executiveIntelligence, tenantSlug, context, ['department', 'domain']),
                workforceIntelligence: tenantRows(payload.workforceIntelligence || fallback.workforceIntelligence, tenantSlug, context, ['department', 'domain']),
                operationalIntelligence: tenantRows(payload.operationalIntelligence || fallback.operationalIntelligence, tenantSlug, context, ['department', 'domain']),
                governanceIntelligence: tenantRows(payload.governanceIntelligence || fallback.governanceIntelligence, tenantSlug, context, ['department', 'domain']),
                analytics: cloneSanitized(payload.analytics || {}),
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            };
            var totalRows = normalized.kpiIntelligence.length + normalized.okrIntelligence.length + normalized.dependencyIntelligence.length + normalized.escalationIntelligence.length + normalized.executiveIntelligence.length + normalized.workforceIntelligence.length + normalized.operationalIntelligence.length + normalized.governanceIntelligence.length;
            normalized.edgeCases = {
                insufficientContextDetected: totalRows < 3,
                sparseDatasetsDetected: totalRows < 6,
                missingAnalyticsDetected: !payload.analytics || Object.keys(payload.analytics || {}).length === 0,
                conflictingDataDetected: detectConflictingData(normalized),
                rbacRestrictionsApplied: normalized.visibility.scope !== 'STRATEGIC_ASSISTANT_VISIBILITY'
            };
            normalized.assistantWarnings = [];
            if (normalized.edgeCases.sparseDatasetsDetected) normalized.assistantWarnings.push({ warningCode: 'SPARSE_ASSISTANT_CONTEXT', severity: 'MODERATE', message: 'Assistant response is using sparse tenant-scoped context.' });
            if (normalized.edgeCases.conflictingDataDetected) normalized.assistantWarnings.push({ warningCode: 'CONFLICTING_ASSISTANT_CONTEXT', severity: 'HIGH', message: 'Conflicting assistant evidence requires human review.' });
            if (normalized.edgeCases.rbacRestrictionsApplied) normalized.assistantWarnings.push({ warningCode: 'RBAC_CONTEXT_RESTRICTED', severity: 'INFO', message: 'Assistant context was restricted by role visibility.' });
            return freezeAssistantOutput(normalized);
        } catch (error) {
            safeWarn('normalizeAssistantPayload failed safely', error && error.message);
            return freezeAssistantOutput({ success: false, classification: 'ASSISTANT_NORMALIZATION_ERROR', message: 'Assistant payload normalization failed safely.', governance: governanceFlags() });
        }
    }

    function detectConflictingData(normalized) {
        try {
            var riskScores = arrayOf(normalized.riskIntelligence || normalized.executiveIntelligence, MAX_ROWS).map(function score(row) { return safeNumber(row.riskScore || row.score || row.confidenceScore, 0); });
            return riskScores.some(function high(value) { return value >= 80; }) && riskScores.some(function low(value) { return value > 0 && value <= 25; });
        } catch (error) {
            return false;
        }
    }

    function evidenceRow(domain, title, detail, score, source, severity) {
        return {
            domain: normalizeDomain(domain),
            title: safeString(title || domain, 'Evidence'),
            detail: safeString(detail || 'Tenant-scoped evidence is available.', 'Tenant-scoped evidence is available.'),
            score: clamp(score, 0, 100),
            severity: severity || severityFromScore(score || 0),
            source: safeString(source || domain, 'assistant_context')
        };
    }

    function collectEvidence(normalized) {
        var evidence = [];
        normalized.kpiIntelligence.forEach(function kpi(row) {
            var probability = clamp(row.achievementProbability || row.forecastConfidence || row.score || row.currentValue || 50, 0, 100);
            if (probability < 70 || /kpi|target|forecast|miss|risk/i.test(normalized.query)) {
                evidence.push(evidenceRow('kpi_intelligence', row.kpiName || row.title || 'KPI forecast', row.explanation || ('Achievement probability ' + probability + '%'), 100 - probability, 'kpi_intelligence', severityFromScore(probability, true)));
            }
        });
        normalized.okrIntelligence.forEach(function okr(row) {
            var progress = clamp(row.progressPercent || row.completionPercentage || row.completionRate || row.progress || 0, 0, 100);
            if (progress < 70 || /okr|objective|goal/i.test(normalized.query)) {
                evidence.push(evidenceRow('okr_intelligence', row.title || row.objectiveTitle || 'OKR progress', 'Progress is ' + progress + '% for ' + safeString(row.department || 'the current scope', 'the current scope') + '.', 100 - progress, 'okr_intelligence', progress < 55 ? 'HIGH' : 'MODERATE'));
            }
        });
        normalized.dependencyIntelligence.forEach(function (dep) {
            var blocked = /blocked|delayed|risk/i.test(safeString(dep.state || dep.status || '', ''));
            var score = clamp(dep.bottleneckScore || dep.riskScore || dep.delayDays * 10 || (blocked ? 74 : 35), 0, 100);
            if (blocked || score >= 45 || /dependency|bottleneck|block/i.test(normalized.query)) {
                evidence.push(evidenceRow('dependency_intelligence', dep.dependencyId || 'Dependency signal', dep.explanation || ('Dependency state ' + safeString(dep.state || dep.status || 'active', 'active')), score, 'dependency_intelligence', severityFromScore(score)));
            }
        });
        normalized.escalationIntelligence.forEach(function escalation(row) {
            var probability = clamp(row.escalationProbability || row.urgencyScore || row.riskScore || 50, 0, 100);
            evidence.push(evidenceRow('escalation_intelligence', row.title || 'Escalation forecast', row.explanation || ('Escalation probability ' + probability + '%'), probability, 'escalation_intelligence', severityFromScore(probability)));
        });
        normalized.executiveIntelligence.forEach(function (exec) {
            var score = clamp(exec.confidenceScore || exec.riskScore || exec.score || 60, 0, 100);
            evidence.push(evidenceRow('executive_intelligence', exec.title || exec.recommendationTitle || 'Executive insight', exec.reason || exec.explanation || exec.expectedImpact || 'Executive intelligence signal available.', score, 'executive_intelligence', exec.severity || severityFromScore(score)));
        });
        normalized.workforceIntelligence.forEach(function (workforce) {
            var score = clamp(workforce.score || workforce.riskScore || workforce.capacityScore || 50, 0, 100);
            evidence.push(evidenceRow('workforce_intelligence', workforce.signal || workforce.title || 'Workforce signal', workforce.explanation || ('Workforce score ' + score + '%'), score, 'workforce_intelligence', severityFromScore(score)));
        });
        normalized.operationalIntelligence.forEach(function (ops) {
            var score = clamp(ops.score || ops.impactScore || ops.riskScore || 50, 0, 100);
            evidence.push(evidenceRow('operational_intelligence', ops.signal || ops.title || 'Operational signal', ops.explanation || ('Operational score ' + score + '%'), score, 'operational_intelligence', severityFromScore(score)));
        });
        normalized.governanceIntelligence.forEach(function (gov) {
            evidence.push(evidenceRow('governance_intelligence', gov.control || gov.title || 'Governance control', gov.status || gov.explanation || 'Governance signal available.', 60, 'governance_intelligence', 'INFO'));
        });
        if (!evidence.length) {
            evidence.push(evidenceRow('governance_intelligence', 'Limited context', 'The assistant found limited tenant-scoped evidence for this question.', 45, 'assistant_context', 'MODERATE'));
        }
        return evidence.slice(0, 40);
    }

    function recommendationFromEvidence(row) {
        var domainLabel = row.domain.replace(/_/g, ' ');
        if (row.domain === 'kpi_intelligence') return 'Review forecasted KPI misses and confirm owner-level mitigation for ' + row.title + '.';
        if (row.domain === 'okr_intelligence') return 'Review at-risk OKR progress with the accountable owner and unblock execution support.';
        if (row.domain === 'dependency_intelligence') return 'Resolve the blocking dependency path before it cascades into wider execution delay.';
        if (row.domain === 'escalation_intelligence') return 'Use human leadership review to preempt likely escalation without auto-triggering workflow changes.';
        if (row.domain === 'workforce_intelligence') return 'Review workforce capacity signals with HR governance before changing assignments.';
        if (row.domain === 'operational_intelligence') return 'Inspect throughput or workflow slowdown signals before changing operational plans.';
        return 'Review ' + domainLabel + ' evidence with the responsible human owner.';
    }

    function calculateResponseConfidence(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeAssistantPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var evidence = collectEvidence(normalized);
            var rows = normalized.kpiIntelligence.length + normalized.okrIntelligence.length + normalized.dependencyIntelligence.length + normalized.escalationIntelligence.length + normalized.executiveIntelligence.length + normalized.workforceIntelligence.length + normalized.operationalIntelligence.length + normalized.governanceIntelligence.length;
            var coverage = clamp(Math.round((normalized.knowledgeDomains.length / KNOWLEDGE_DOMAINS.length) * 100), 0, 100);
            var evidenceStrength = clamp(Math.round(average(evidence.map(function item(row) { return row.score; }))), 0, 100);
            var analytics = normalized.analytics || {};
            var assistantAdoptionScore = clamp(analytics.assistantUsage || analytics.assistantAdoptionScore || Math.min(100, rows * 8), 0, 100);
            var knowledgeCoverageScore = clamp(analytics.knowledgeCoverageScore || Math.round(average([coverage, Math.min(100, rows * 12)])), 0, 100);
            var responseEffectivenessScore = clamp(analytics.responseEffectiveness || analytics.insightEffectiveness || analytics.searchEffectiveness || Math.round(average([knowledgeCoverageScore, evidenceStrength, 65])), 0, 100);
            var confidenceScore = clamp(analytics.responseConfidence || Math.round(average([knowledgeCoverageScore, responseEffectivenessScore, evidenceStrength || 55])), 0, 100);
            return freezeAssistantOutput({
                success: true,
                classification: 'ASSISTANT_CONFIDENCE_CALCULATED',
                assistantAdoptionScore: assistantAdoptionScore,
                knowledgeCoverageScore: knowledgeCoverageScore,
                responseEffectivenessScore: responseEffectivenessScore,
                confidenceScore: confidenceScore,
                evidenceCount: evidence.length,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('calculateResponseConfidence failed safely', error && error.message);
            return freezeAssistantOutput({ success: false, classification: 'ASSISTANT_CONFIDENCE_ERROR', message: 'Assistant confidence calculation failed safely.', governance: governanceFlags() });
        }
    }

    function responseTypeFor(normalized) {
        if (normalized.responseType && RESPONSE_TYPES.indexOf(normalized.responseType) !== -1) return normalized.responseType;
        if (normalized.questionCategories.indexOf('executive_briefing') !== -1) return 'executive_briefing';
        if (/why|explain|reason/.test(normalized.query.toLowerCase())) return 'explanations';
        if (/forecast|likely|predict|miss/.test(normalized.query.toLowerCase())) return 'forecasts';
        if (/recommend|should|action/.test(normalized.query.toLowerCase())) return 'recommendations';
        if (/trend/.test(normalized.query.toLowerCase())) return 'trend_analysis';
        if (/risk|okr|bottleneck|department|kpi|dependency/.test(normalized.query.toLowerCase())) return 'insights';
        return 'summary';
    }

    function buildAnswer(normalized, evidence, recommendations, confidence) {
        var top = evidence.slice(0, 4);
        var riskCount = evidence.filter(function risk(row) { return row.severity === 'HIGH' || row.severity === 'CRITICAL'; }).length;
        var domains = top.map(function domain(row) { return row.domain.replace(/_/g, ' '); }).filter(function unique(value, index, list) { return list.indexOf(value) === index; });
        var lead = 'I found ' + evidence.length + ' tenant-scoped evidence point(s)';
        if (riskCount) lead += ', including ' + riskCount + ' high-priority signal(s)';
        lead += ' across ' + (domains.join(', ') || 'available governance context') + '.';
        var detail = top.map(function item(row) { return row.title + ': ' + row.detail; }).join(' ');
        var next = recommendations.length ? ' Recommended next step: ' + recommendations[0] : ' Recommended next step: gather more tenant-scoped context before acting.';
        return lead + ' ' + detail + next + ' Confidence: ' + confidence.confidenceScore + '%.';
    }

    function buildContextualResponse(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeAssistantPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var evidence = collectEvidence(normalized);
            var confidence = calculateResponseConfidence(normalized, context || {});
            var recommendations = evidence.filter(function actionable(row) { return row.severity !== 'INFO'; }).slice(0, 8).map(recommendationFromEvidence);
            if (!recommendations.length) recommendations.push('Continue monitoring the scoped intelligence and ask a more specific follow-up if needed.');
            var response = {
                responseType: responseTypeFor(normalized),
                answer: buildAnswer(normalized, evidence, recommendations, confidence),
                evidence: evidence,
                recommendations: recommendations,
                confidenceScore: confidence.confidenceScore,
                reasoningSummary: 'The assistant matched the question to ' + normalized.questionCategories.join(', ') + ', filtered data by tenant and role, ranked evidence by severity and score, and generated advisory-only recommendations.',
                explainability: {
                    evidenceBased: true,
                    confidence: confidence.confidenceScore,
                    reasoningSummary: 'Role-scoped evidence was used; no records, workflows, approvals, automations, or permissions were changed.'
                }
            };
            return freezeAssistantOutput({
                success: true,
                classification: 'CONTEXTUAL_ASSISTANT_RESPONSE_READY',
                tenantSlug: normalized.tenantSlug,
                context: {
                    tenantSlug: normalized.tenantSlug,
                    role: normalized.visibility.role,
                    scope: normalized.visibility.scope,
                    department: normalized.visibility.department || '',
                    knowledgeCoverageScore: confidence.knowledgeCoverageScore,
                    questionCategories: normalized.questionCategories
                },
                response: response,
                edgeCases: normalized.edgeCases,
                assistantWarnings: normalized.assistantWarnings,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('buildContextualResponse failed safely', error && error.message);
            return freezeAssistantOutput({ success: false, classification: 'CONTEXTUAL_RESPONSE_ERROR', message: 'Contextual assistant response failed safely.', governance: governanceFlags() });
        }
    }

    function explainAssistantResponse(response, context) {
        try {
            if (!isPlainObject(response)) {
                return freezeAssistantOutput({ success: false, classification: 'MALFORMED_ASSISTANT_RESPONSE', message: 'Assistant response must be an object.', governance: governanceFlags() });
            }
            var evidence = arrayOf(response.evidence || response.supportingEvidence, 20).map(function evidenceText(item) {
                if (isPlainObject(item)) return item.detail || item.title || item.source || 'Evidence item';
                return safeString(item, 'Evidence item');
            }).filter(Boolean);
            if (!evidence.length) evidence.push('Assistant response was generated from tenant-scoped role-approved context.');
            var recommendations = arrayOf(response.recommendations || [], 12).map(function recommendationText(item) {
                return safeString(item.action || item.recommendation || item, 'Human review recommended');
            });
            var confidence = clamp(response.confidenceScore || response.confidence || 55, 0, 100);
            var summary = safeString(response.reasoningSummary || '', '').trim();
            if (!summary || /^AI says so$/i.test(summary)) {
                summary = 'The response is based on tenant-scoped evidence, role visibility, domain relevance, severity, and confidence signals.';
            }
            return freezeAssistantOutput({
                success: true,
                classification: 'ASSISTANT_RESPONSE_EXPLAINED',
                explanation: {
                    reasoningSummary: summary,
                    evidence: evidence,
                    recommendations: recommendations,
                    confidenceScore: confidence,
                    governanceSummary: 'Advisory-only response; no workflow execution, record modification, approval action, automation trigger, or permission change occurred.'
                },
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('explainAssistantResponse failed safely', error && error.message);
            return freezeAssistantOutput({ success: false, classification: 'ASSISTANT_EXPLAIN_ERROR', message: 'Assistant response explainability failed safely.', governance: governanceFlags() });
        }
    }

    function appendHistory(data, table, row) {
        try {
            data[table] = arrayOf(data[table], MAX_HISTORY - 1);
            data[table].push(cloneSanitized(row));
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordAudit(eventType, details, context) {
        if (context && context.skipAuditPersistence) return false;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.record === 'function') {
                service.record(eventType, cloneSanitized(details || {}), context || {});
                return true;
            }
            if (service && typeof service.log === 'function') {
                service.log(eventType, cloneSanitized(details || {}), context || {});
                return true;
            }
            var data = rawData();
            data.auditLogs = arrayOf(data.auditLogs, MAX_HISTORY - 1);
            data.auditLogs.push({
                auditId: 'AUD-AIASSIST-' + Date.now(),
                actionType: eventType,
                tenantSlug: contextTenant(context || {}),
                actorId: actorId(context || {}),
                details: cloneSanitized(details || {}),
                createdAt: nowIso()
            });
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

    function processAssistantQuery(payload, context) {
        try {
            var normalized = normalizeAssistantPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var contextual = buildContextualResponse(normalized, context || {});
            if (!contextual.success) return contextual;
            var explanation = explainAssistantResponse(contextual.response, context || {});
            var confidence = calculateResponseConfidence(normalized, context || {});
            var output = {
                success: true,
                readOnly: true,
                classification: 'STRATEGIC_AI_ASSISTANT_RESPONSE_READY',
                tenantSlug: normalized.tenantSlug,
                query: normalized.query,
                mode: normalized.mode,
                responseType: contextual.response.responseType,
                answer: contextual.response.answer,
                evidence: contextual.response.evidence,
                recommendations: contextual.response.recommendations,
                forecasts: contextual.response.evidence.filter(function forecast(row) { return row.domain === 'kpi_intelligence' || row.domain === 'escalation_intelligence'; }),
                insights: contextual.response.evidence,
                confidenceScore: contextual.response.confidenceScore,
                reasoningSummary: contextual.response.reasoningSummary,
                explanation: explanation.explanation,
                context: contextual.context,
                visibility: normalized.visibility,
                analytics: {
                    questionCategories: normalized.questionCategories,
                    assistantUsage: safeNumber(normalized.analytics.assistantUsage, 1),
                    recommendationUsage: safeNumber(normalized.analytics.recommendationUsage, contextual.response.recommendations.length),
                    responseConfidence: confidence.confidenceScore,
                    insightEffectiveness: confidence.responseEffectivenessScore,
                    searchEffectiveness: clamp(normalized.analytics.searchEffectiveness || confidence.knowledgeCoverageScore, 0, 100),
                    assistantAdoptionScore: confidence.assistantAdoptionScore,
                    knowledgeCoverageScore: confidence.knowledgeCoverageScore,
                    responseEffectivenessScore: confidence.responseEffectivenessScore
                },
                edgeCases: normalized.edgeCases,
                assistantWarnings: normalized.assistantWarnings,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {}),
                generatedAt: nowIso()
            };
            var data = rawData();
            appendHistory(data, 'assistantConversationHistory', { historyId: 'AICH-' + Date.now(), tenantSlug: normalized.tenantSlug, query: normalized.query, responseType: output.responseType, confidenceScore: output.confidenceScore, immutable: true, createdAt: output.generatedAt });
            appendHistory(data, 'assistantRecommendationHistory', { historyId: 'AIRH-' + Date.now(), tenantSlug: normalized.tenantSlug, recommendationCount: output.recommendations.length, immutable: true, createdAt: output.generatedAt });
            appendHistory(data, 'assistantAnalyticsHistory', { historyId: 'AIAH-' + Date.now(), tenantSlug: normalized.tenantSlug, assistantAdoptionScore: confidence.assistantAdoptionScore, knowledgeCoverageScore: confidence.knowledgeCoverageScore, responseEffectivenessScore: confidence.responseEffectivenessScore, immutable: true, createdAt: output.generatedAt });
            saveData(data);
            recordAudit('STRATEGIC_AI_ASSISTANT_INTERACTION', {
                queryCategory: normalized.questionCategories.join(','),
                responseType: output.responseType,
                evidenceCount: output.evidence.length,
                recommendationCount: output.recommendations.length
            }, context || {});
            recordTelemetry('STRATEGIC_AI_ASSISTANT_INTERACTION', {
                responseConfidence: output.confidenceScore,
                evidenceCount: output.evidence.length
            }, context || {});
            return freezeAssistantOutput(output);
        } catch (error) {
            safeWarn('processAssistantQuery failed safely', error && error.message);
            return freezeAssistantOutput({ success: false, classification: 'ASSISTANT_PROCESSING_ERROR', message: 'Assistant query processing failed safely.', governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var context = { tenantSlug: 'self-test', actor: { id: 'DIR', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
        var payload = {
            tenantSlug: 'self-test',
            query: 'What are our top risks and bottlenecks?',
            knowledgeDomains: ['kpi_intelligence', 'dependency_intelligence', 'governance_intelligence'],
            kpiIntelligence: [{ tenantSlug: 'self-test', domain: 'kpi_intelligence', kpiName: 'Delivery KPI', achievementProbability: 62, forecastConfidence: 70 }],
            dependencyIntelligence: [{ tenantSlug: 'self-test', domain: 'dependency_intelligence', dependencyId: 'DEP', state: 'BLOCKED', bottleneckScore: 72 }],
            governanceIntelligence: [{ tenantSlug: 'self-test', domain: 'governance_intelligence', control: 'AI advisory only', status: 'ENFORCED' }]
        };
        var checks = [];
        function add(name, passed) { checks.push({ name: name, passed: !!passed }); }
        try {
            var malformed = normalizeAssistantPayload({ tenantSlug: 'self-test', query: '' }, context);
            add('malformed queries fail safely', malformed.success === false && Object.isFrozen(malformed));
            var normalized = normalizeAssistantPayload(payload, context);
            add('RBAC filtering works', normalized.success && normalized.visibility.scope === 'STRATEGIC_ASSISTANT_VISIBILITY');
            var contextual = buildContextualResponse(payload, context);
            add('contextual responses work', contextual.success && contextual.response.evidence.length > 0);
            var processed = processAssistantQuery(payload, context);
            add('assistant queries work', processed.success && processed.answer && processed.evidence.length > 0);
            var explained = explainAssistantResponse(processed, context);
            add('explainability works', explained.success && explained.explanation.evidence.length > 0 && explained.explanation.reasoningSummary);
            add('immutable outputs enforced', Object.isFrozen(processed) && Object.isFrozen(processed.evidence));
        } catch (error) {
            add('self-test completed without uncaught throw', false);
        }
        var result = freezeAssistantOutput({
            passed: checks.every(function ok(item) { return item.passed; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_STRATEGIC_AI_ASSISTANT_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        version: '1.0.0',
        KNOWLEDGE_DOMAINS: KNOWLEDGE_DOMAINS,
        RESPONSE_TYPES: RESPONSE_TYPES,
        processAssistantQuery: processAssistantQuery,
        buildContextualResponse: buildContextualResponse,
        calculateResponseConfidence: calculateResponseConfidence,
        explainAssistantResponse: explainAssistantResponse,
        normalizeAssistantPayload: normalizeAssistantPayload,
        freezeAssistantOutput: freezeAssistantOutput,
        validateAssistantScope: validateAssistantScope,
        runSelfTest: runSelfTest
    });

    try {
        global.StrategicAIAssistantService = service;
        global.strategicAIAssistantService = service;
    } catch (error) {
        safeWarn('Service export failed safely', error && error.message);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
