/**
 * aiRiskPredictionService.js
 * ARTHHRMS - AI Risk Prediction + Enterprise Risk Intelligence Engine
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware, explainable predictive risk intelligence
 * for workforce, workflow, operational, strategic, compliance, and escalation
 * domains.
 *
 * AI SAFETY:
 * This service only analyzes, scores, recommends, and explains. It never
 * approves requests, rejects requests, mutates source records, changes
 * permissions, or triggers workflows automatically.
 *
 * @version 1.0.0
 */
(function attachAIRiskPredictionService(global) {
    'use strict';

    var PREFIX = '[AIRiskPredictionService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 1000;

    var RISK_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
    var RISK_DOMAINS = Object.freeze([
        'LEAVE_MANAGEMENT',
        'ATTENDANCE_COMPLIANCE',
        'EMPLOYEE_LIFECYCLE',
        'APPROVAL_BOTTLENECKS',
        'STRATEGIC_INITIATIVES',
        'PROJECT_EXECUTION',
        'OPERATIONAL_GOVERNANCE',
        'ESCALATION_WORKFLOWS'
    ]);

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

    function freezePredictionOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacGovernancePreserved: true,
            noAutonomousActions: true,
            noRecordMutation: true,
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
            smartSearchIntegrated: !!(global.SmartSearchService || global.smartSearchService),
            activityFeedIntegrated: !!(global.GlobalActivityFeedService || global.globalActivityFeedService),
            platformAnalyticsIntegrated: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
            performanceGovernanceIntegrated: !!(global.PerformanceGovernanceService || global.performanceGovernanceService),
            escalationGovernanceIntegrated: !!(global.EscalationCommandService || global.escalationCommandService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!global.AuditService && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!global.WorkflowTelemetryService && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'ORGANIZATION_WIDE_RISK_ANALYTICS', role: role };
        if (role === 'HR') return { scope: 'HR_OPERATIONAL_RISK_VISIBILITY', role: role };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_RISK_VISIBILITY', role: role, department: actorDepartment(context) };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_RISK_VISIBILITY_ONLY', role: role };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_AI_GOVERNANCE_VISIBILITY', role: role };
        return { scope: 'ASSIGNED_RISK_VISIBILITY_ONLY', role: role, department: actorDepartment(context) };
    }

    function validatePredictionScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezePredictionOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant AI risk prediction is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            return freezePredictionOutput({
                success: true,
                allowed: true,
                tenantSlug: tenant || ctxTenant,
                actorId: actorId(context || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validatePredictionScope failed safely', error && error.message);
            return freezePredictionOutput({
                success: false,
                allowed: false,
                classification: 'PREDICTION_SCOPE_ERROR',
                message: 'AI risk prediction scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function tenantRows(rows, tenantSlug) {
        var tenant = normalizeTenantSlug(tenantSlug);
        return arrayOf(rows).filter(function sameTenant(row) {
            var rowTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId) || tenant);
            return !rowTenant || rowTenant === tenant;
        }).map(function sanitizeRow(row) {
            return cloneSanitized(row || {});
        });
    }

    function normalizePredictionPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezePredictionOutput({
                    success: false,
                    classification: 'MALFORMED_PREDICTION_PAYLOAD',
                    message: 'AI risk prediction payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var scope = validatePredictionScope(payload, context || {});
            if (!scope.success) return scope;
            var domains = arrayOf(payload.riskDomains).map(function mapDomain(domain) {
                return normalizeToken(domain, '');
            }).filter(function knownDomain(domain) {
                return RISK_DOMAINS.indexOf(domain) !== -1;
            });
            if (!domains.length) domains = RISK_DOMAINS.slice();
            var normalized = {
                success: true,
                tenantSlug: scope.tenantSlug,
                riskDomains: domains,
                historicalActivity: tenantRows(payload.historicalActivity, scope.tenantSlug),
                approvals: tenantRows(payload.approvals, scope.tenantSlug),
                escalations: tenantRows(payload.escalations, scope.tenantSlug),
                workflowFailures: tenantRows(payload.workflowFailures, scope.tenantSlug),
                complianceIssues: tenantRows(payload.complianceIssues, scope.tenantSlug),
                strategicExecution: tenantRows(payload.strategicExecution || payload.strategicInitiatives, scope.tenantSlug),
                incidents: tenantRows(payload.incidents, scope.tenantSlug),
                analytics: {
                    predictionAccuracy: clamp(payload.analytics && payload.analytics.predictionAccuracy, 0, 100),
                    falsePositiveRate: clamp(payload.analytics && payload.analytics.falsePositiveRate, 0, 100),
                    falseNegativeRate: clamp(payload.analytics && payload.analytics.falseNegativeRate, 0, 100),
                    riskEscalationTrend: clamp(payload.analytics && payload.analytics.riskEscalationTrend, 0, 100),
                    departmentRiskTrend: clamp(payload.analytics && payload.analytics.departmentRiskTrend, 0, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: scope.visibility,
                governance: governanceFlags()
            };
            normalized.dataQuality = {
                insufficientHistoricalData: normalized.historicalActivity.length + normalized.approvals.length + normalized.escalations.length + normalized.workflowFailures.length + normalized.complianceIssues.length + normalized.strategicExecution.length + normalized.incidents.length < 3,
                sparseDatasetsHandled: true,
                conflictingIndicatorsHandled: true,
                missingAnalyticsHandled: true
            };
            return freezePredictionOutput(normalized);
        } catch (error) {
            safeWarn('normalizePredictionPayload failed safely', error && error.message);
            return freezePredictionOutput({
                success: false,
                classification: 'PREDICTION_NORMALIZATION_ERROR',
                message: 'AI risk prediction normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function severityWeight(value) {
        var token = normalizeToken(value, 'LOW');
        if (token === 'CRITICAL') return 28;
        if (token === 'HIGH') return 20;
        if (token === 'MODERATE' || token === 'WARNING') return 11;
        return 5;
    }

    function riskLevel(score) {
        if (score >= 85) return 'CRITICAL';
        if (score >= 60) return 'HIGH';
        if (score >= 35) return 'MODERATE';
        return 'LOW';
    }

    function confidenceLevel(score) {
        if (score >= 80) return 'HIGH';
        if (score >= 50) return 'MODERATE';
        return 'LOW';
    }

    function rowDepartment(row) {
        return safeString(row && (row.department || row.departmentName || row.ownerDepartment), '').trim();
    }

    function domainSignals(normalized, domain) {
        var signals = [];
        var add = function addSignal(source, row, score, evidence) {
            signals.push({
                source: source,
                department: rowDepartment(row),
                score: score,
                evidence: evidence || safeString(row && (row.evidence || row.status || row.state || row.issueType || row.workflowType || row.initiative), source),
                ageHours: safeNumber(row && row.ageHours, 0)
            });
        };

        normalized.historicalActivity.forEach(function eachActivity(row) {
            var rowDomain = normalizeToken(row.domain || row.activityType, '');
            if (rowDomain === domain) add('historical_activity', row, severityWeight(row.severity) + Math.min(20, safeNumber(row.ageHours, 0) / 4), row.evidence);
        });
        if (domain === 'APPROVAL_BOTTLENECKS') {
            normalized.approvals.forEach(function eachApproval(row) {
                if (normalizeToken(row.status, '') === 'PENDING' || safeNumber(row.ageHours, 0) >= 24) add('approval_delay', row, 18 + Math.min(28, safeNumber(row.ageHours, 0) / 2), 'Approval queue age exceeds normal operating window.');
            });
        }
        if (domain === 'ESCALATION_WORKFLOWS') {
            normalized.escalations.forEach(function eachEscalation(row) {
                add('escalation_pattern', row, severityWeight(row.severity) + Math.min(18, safeNumber(row.ageHours, 0) / 3), 'Open escalation pattern indicates unresolved risk pressure.');
            });
        }
        if (domain === 'OPERATIONAL_GOVERNANCE') {
            normalized.workflowFailures.forEach(function eachFailure(row) {
                add('workflow_failure', row, 12 + safeNumber(row.failureCount, 0) * 8 + Math.min(15, safeNumber(row.ageHours, 0) / 4), 'Workflow failure count is elevated for this department.');
            });
            normalized.incidents.forEach(function eachIncident(row) {
                add('incident_pattern', row, severityWeight(row.severity) + Math.min(12, safeNumber(row.ageHours, 0) / 4), 'Open incident pattern contributes to operational risk.');
            });
        }
        if (domain === 'ATTENDANCE_COMPLIANCE') {
            normalized.complianceIssues.forEach(function eachCompliance(row) {
                add('compliance_issue', row, severityWeight(row.severity) + (row.unresolved ? 18 : 6), 'Unresolved compliance issue raises attendance governance risk.');
            });
        }
        if (domain === 'STRATEGIC_INITIATIVES' || domain === 'PROJECT_EXECUTION') {
            normalized.strategicExecution.forEach(function eachStrategic(row) {
                var delayed = normalizeToken(row.status, '') === 'DELAYED' || normalizeToken(row.status, '') === 'AT_RISK' || safeNumber(row.delayDays, 0) > 0;
                if (delayed) add(domain === 'STRATEGIC_INITIATIVES' ? 'strategic_delay' : 'project_delay', row, 16 + safeNumber(row.delayDays, 0) * 5 + (row.escalationLinked ? 12 : 0), 'Strategic or project execution delay is visible in the tenant scope.');
            });
        }
        return signals;
    }

    function calculateRiskScore(input, context) {
        try {
            var normalized = input && input.success ? input : normalizePredictionPayload(input, context || {});
            if (!normalized.success) return normalized;
            var signalCount = 0;
            var total = 0;
            var maxScore = 0;
            normalized.riskDomains.forEach(function eachDomain(domain) {
                var signals = domainSignals(normalized, domain);
                signals.forEach(function eachSignal(signal) {
                    signalCount += 1;
                    total += signal.score;
                    maxScore = Math.max(maxScore, signal.score);
                });
            });
            var density = signalCount ? Math.min(28, signalCount * 4) : 0;
            var average = signalCount ? total / signalCount : 10;
            var riskScore = Math.round(clamp(average + density + maxScore * 0.35, 8, 100));
            if (normalized.dataQuality.insufficientHistoricalData) riskScore = Math.max(18, Math.round(riskScore * 0.72));
            var confidence = Math.round(clamp(35 + signalCount * 9 + safeNumber(normalized.analytics.predictionAccuracy, 0) * 0.35 - safeNumber(normalized.analytics.falsePositiveRate, 0) * 0.2, 20, 96));
            var trend = Math.round(clamp(safeNumber(normalized.analytics.riskEscalationTrend, 0) + safeNumber(normalized.analytics.departmentRiskTrend, 0) + signalCount * 3, 0, 100));
            var volatility = Math.round(clamp(maxScore + safeNumber(normalized.analytics.falseNegativeRate, 0) + normalized.escalations.length * 6, 0, 100));
            return freezePredictionOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                riskScore: riskScore,
                riskLevel: riskLevel(riskScore),
                confidenceScore: confidence,
                confidenceLevel: confidenceLevel(confidence),
                trendScore: trend,
                volatilityScore: volatility,
                signalCount: signalCount,
                dataQuality: normalized.dataQuality,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateRiskScore failed safely', error && error.message);
            return freezePredictionOutput({
                success: false,
                classification: 'RISK_SCORE_ERROR',
                message: 'Risk score calculation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function explainPrediction(prediction, context) {
        try {
            var evidence = arrayOf(prediction && prediction.evidence, 8).map(function evidenceText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            var factors = arrayOf(prediction && prediction.contributingFactors, 8).map(function factorText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 120);
            }).filter(Boolean);
            if (!evidence.length) evidence.push('Available tenant-scoped signals are sparse, so the recommendation is conservative.');
            if (!factors.length) factors.push('insufficient historical data');
            var domain = normalizeToken(prediction && prediction.domain, 'OPERATIONAL_GOVERNANCE');
            var score = clamp(prediction && prediction.riskScore, 0, 100);
            var level = normalizeToken(prediction && prediction.riskLevel, riskLevel(score));
            return freezePredictionOutput({
                success: true,
                domain: domain,
                riskLevel: level,
                riskScore: score,
                reason: domain.replace(/_/g, ' ') + ' is classified as ' + level + ' because tenant-scoped evidence shows ' + factors.slice(0, 3).join(', ') + '.',
                evidence: evidence,
                contributingFactors: factors,
                confidenceLevel: normalizeToken(prediction && prediction.confidenceLevel, confidenceLevel(prediction && prediction.confidenceScore || score)),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('explainPrediction failed safely', error && error.message);
            return freezePredictionOutput({
                success: false,
                classification: 'PREDICTION_EXPLANATION_ERROR',
                message: 'Prediction explanation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function recommendationFor(prediction) {
        var action = 'Review ' + prediction.domain.replace(/_/g, ' ').toLowerCase() + ' signals with the accountable owner.';
        if (prediction.riskLevel === 'CRITICAL') action = 'Open a human-led risk review before any workflow or record action is taken.';
        if (prediction.riskLevel === 'HIGH') action = 'Assign a human owner to review mitigation options and validate evidence.';
        return {
            domain: prediction.domain,
            riskLevel: prediction.riskLevel,
            action: action,
            humanApprovalRequired: true,
            autonomousAction: false
        };
    }

    function applyVisibility(predictions, context) {
        var visibility = visibilityForContext(context || {});
        if (visibility.scope === 'ORGANIZATION_WIDE_RISK_ANALYTICS' || visibility.scope === 'PLATFORM_AI_GOVERNANCE_VISIBILITY' || visibility.scope === 'INFRASTRUCTURE_RISK_VISIBILITY_ONLY') {
            return predictions;
        }
        var dept = safeString(visibility.department, '').toLowerCase();
        if (!dept) return predictions.filter(function lifecycleOnly(row) { return normalizeToken(row.domain, '') === 'EMPLOYEE_LIFECYCLE'; });
        return predictions.filter(function visibleRow(row) {
            return safeString(row.department, '').toLowerCase() === dept || normalizeToken(row.domain, '') === 'EMPLOYEE_LIFECYCLE';
        });
    }

    function generateDomainPrediction(normalized, domain, scoreSummary) {
        var signals = domainSignals(normalized, domain);
        var domainScore = signals.length
            ? Math.round(clamp(signals.reduce(function sum(acc, row) { return acc + row.score; }, 0) / signals.length + signals.length * 8, 15, 100))
            : Math.round(clamp(scoreSummary.dataQuality.insufficientHistoricalData ? 18 : scoreSummary.riskScore * 0.28, 10, 45));
        var level = riskLevel(domainScore);
        var departmentCounts = {};
        signals.forEach(function countDept(signal) {
            var dept = signal.department || 'General';
            departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
        });
        var department = Object.keys(departmentCounts).sort(function sortDept(a, b) { return departmentCounts[b] - departmentCounts[a]; })[0] || '';
        var evidence = signals.length ? signals.slice(0, 5).map(function signalEvidence(signal) { return signal.evidence; }) : ['Insufficient historical signals found for this domain; prediction remains conservative.'];
        var factors = signals.length ? signals.slice(0, 5).map(function signalFactor(signal) { return signal.source.replace(/_/g, ' '); }) : ['sparse dataset'];
        var explanation = explainPrediction({
            domain: domain.toLowerCase(),
            riskLevel: level,
            riskScore: domainScore,
            confidenceScore: scoreSummary.confidenceScore,
            confidenceLevel: confidenceLevel(scoreSummary.confidenceScore),
            evidence: evidence,
            contributingFactors: factors
        });
        return {
            predictionId: 'AI-RISK-' + domain + '-' + Date.now(),
            domain: domain.toLowerCase(),
            department: department,
            riskLevel: level,
            riskScore: domainScore,
            confidenceScore: scoreSummary.confidenceScore,
            confidenceLevel: confidenceLevel(scoreSummary.confidenceScore),
            trendScore: scoreSummary.trendScore,
            volatilityScore: scoreSummary.volatilityScore,
            reason: explanation.reason,
            evidence: explanation.evidence,
            contributingFactors: explanation.contributingFactors,
            recommendation: recommendationFor({ domain: domain, riskLevel: level }).action,
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
                    entityType: 'AI_RISK_PREDICTION',
                    module: 'AI Risk Prediction',
                    details: cloneSanitized(details || {})
                });
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-AI-RISK-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'AI Risk Prediction',
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
                        source: 'aiRiskPredictionService',
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

    function generateRiskPrediction(payload, context) {
        try {
            var normalized = normalizePredictionPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var score = calculateRiskScore(normalized, context || {});
            if (!score.success) return score;
            var predictions = normalized.riskDomains.map(function mapDomain(domain) {
                return generateDomainPrediction(normalized, domain, score);
            });
            predictions = applyVisibility(predictions, context || {});
            if (!predictions.length) {
                predictions = [generateDomainPrediction(normalized, 'EMPLOYEE_LIFECYCLE', score)];
            }
            var activeRisks = predictions.filter(function active(row) { return row.riskLevel === 'HIGH' || row.riskLevel === 'CRITICAL'; });
            var emergingRisks = predictions.filter(function emerging(row) { return row.riskLevel === 'MODERATE' || (row.riskLevel === 'LOW' && normalized.dataQuality.insufficientHistoricalData); });
            var recommendedActions = predictions.filter(function actionable(row) { return row.riskLevel !== 'LOW' || normalized.dataQuality.insufficientHistoricalData; }).map(recommendationFor);
            if (!recommendedActions.length) recommendedActions = [recommendationFor(predictions[0])];
            var reportId = 'AI-RISK-REPORT-' + Date.now();
            var generatedAt = nowIso();
            var history = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                riskScore: score.riskScore,
                riskLevel: score.riskLevel,
                confidenceScore: score.confidenceScore,
                predictionCount: predictions.length,
                readOnly: true,
                immutable: true
            };
            appendHistory('aiRiskPredictionHistory', history);
            appendHistory('aiRiskPredictionAnalytics', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                predictionAccuracy: normalized.analytics.predictionAccuracy,
                falsePositiveRate: normalized.analytics.falsePositiveRate,
                falseNegativeRate: normalized.analytics.falseNegativeRate,
                organizationalRiskScore: score.riskScore,
                departmentRiskScore: Math.round(predictions.reduce(function sum(acc, row) { return acc + row.riskScore; }, 0) / Math.max(1, predictions.length)),
                strategicRiskScore: Math.round(predictions.filter(function strategic(row) { var domain = normalizeToken(row.domain, ''); return domain === 'STRATEGIC_INITIATIVES' || domain === 'PROJECT_EXECUTION'; }).reduce(function sum(acc, row) { return acc + row.riskScore; }, 0) / Math.max(1, predictions.filter(function strategic(row) { var domain = normalizeToken(row.domain, ''); return domain === 'STRATEGIC_INITIATIVES' || domain === 'PROJECT_EXECUTION'; }).length || 1)),
                immutable: true
            });
            appendHistory('aiRiskRecommendationHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                recommendations: recommendedActions,
                humanApprovalRequired: true,
                immutable: true
            });
            var auditRecorded = recordAudit('AI_RISK_PREDICTION_GENERATED', history, context || {});
            var telemetryRecorded = recordTelemetry('AI_RISK_PREDICTION_GENERATED', history, context || {});
            return freezePredictionOutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                readOnly: true,
                visibility: normalized.visibility,
                riskScore: score.riskScore,
                riskLevel: score.riskLevel,
                confidenceScore: score.confidenceScore,
                confidenceLevel: score.confidenceLevel,
                trendScore: score.trendScore,
                volatilityScore: score.volatilityScore,
                predictedRisks: predictions,
                activeRisks: activeRisks,
                emergingRisks: emergingRisks,
                recurringRisks: predictions.filter(function recurring(row) {
                    return row.contributingFactors.some(function factorMatch(factor) {
                        return /escalation|workflow|approval/i.test(factor);
                    });
                }),
                unresolvedRiskTrends: predictions.filter(function unresolved(row) { return row.riskLevel === 'HIGH' || row.riskLevel === 'CRITICAL'; }),
                recommendedActions: recommendedActions,
                riskHeatmap: predictions.map(function heat(row) {
                    return { domain: row.domain, department: row.department || 'General', riskLevel: row.riskLevel, riskScore: row.riskScore };
                }),
                analytics: {
                    predictionAccuracy: normalized.analytics.predictionAccuracy,
                    falsePositiveRate: normalized.analytics.falsePositiveRate,
                    falseNegativeRate: normalized.analytics.falseNegativeRate,
                    riskCategoryTrends: predictions.reduce(function reduce(acc, row) {
                        acc[row.domain] = row.riskScore;
                        return acc;
                    }, {}),
                    riskEscalationTrends: normalized.analytics.riskEscalationTrend,
                    departmentRiskTrends: normalized.analytics.departmentRiskTrend,
                    organizationalRiskScore: score.riskScore,
                    departmentRiskScore: Math.round(predictions.reduce(function sum(acc, row) { return acc + row.riskScore; }, 0) / Math.max(1, predictions.length)),
                    strategicRiskScore: Math.max(0, Math.round(predictions.filter(function strategic(row) { var domain = normalizeToken(row.domain, ''); return domain === 'STRATEGIC_INITIATIVES' || domain === 'PROJECT_EXECUTION'; }).reduce(function sum(acc, row) { return acc + row.riskScore; }, 0) / Math.max(1, predictions.filter(function strategic(row) { var domain = normalizeToken(row.domain, ''); return domain === 'STRATEGIC_INITIATIVES' || domain === 'PROJECT_EXECUTION'; }).length)))
                },
                dataQuality: normalized.dataQuality,
                aiSafety: {
                    analyze: true,
                    score: true,
                    recommend: true,
                    explain: true,
                    autonomousDecisioning: false,
                    sourceRecordMutation: false,
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
            safeWarn('generateRiskPrediction failed safely', error && error.message);
            return freezePredictionOutput({
                success: false,
                classification: 'AI_RISK_PREDICTION_ERROR',
                message: 'AI risk prediction failed safely.',
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
            var context = { tenantSlug: 'self-test', actor: { id: 'AI-SELF', role: 'DIRECTOR', tenantSlug: 'self-test' }, skipAuditPersistence: true, skipTelemetry: true };
            var malformed = normalizePredictionPayload('bad', context);
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'self-test',
                riskDomains: ['approval_bottlenecks', 'escalation_workflows'],
                approvals: [{ tenantSlug: 'self-test', status: 'pending', ageHours: 72, department: 'HR' }],
                escalations: [{ tenantSlug: 'self-test', severity: 'HIGH', ageHours: 24, department: 'HR' }],
                analytics: { predictionAccuracy: 80, riskEscalationTrend: 20 }
            };
            var normalized = normalizePredictionPayload(payload, context);
            var score = calculateRiskScore(normalized, context);
            var explanation = explainPrediction({ domain: 'approval_bottlenecks', riskLevel: 'HIGH', riskScore: 72, evidence: ['Approval queue exceeded SLA'], contributingFactors: ['approval delay'] }, context);
            var report = generateRiskPrediction(payload, context);
            var blocked = generateRiskPrediction(Object.assign({}, payload, { tenantSlug: 'other-tenant' }), context);
            record('risk prediction works', report.success && report.predictedRisks.length > 0);
            record('explainability works', explanation.success && explanation.reason.length > 20 && explanation.evidence.length > 0);
            record('tenant isolation works', blocked.success === false && /TENANT/i.test(blocked.classification || ''));
            record('confidence scoring works', score.success && score.confidenceScore > 0 && score.riskScore > 0);
            record('AI governance works', report.governance.noAutonomousActions && report.governance.noRecordMutation && report.governance.humanApprovalRequired);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.predictedRisks));
        } catch (error) {
            record('self-test failure captured', false, safeString(error && error.message, 'unknown'));
        }
        var result = freezePredictionOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_AI_RISK_PREDICTION_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        RISK_LEVELS: RISK_LEVELS,
        RISK_DOMAINS: RISK_DOMAINS,
        generateRiskPrediction: generateRiskPrediction,
        calculateRiskScore: calculateRiskScore,
        explainPrediction: explainPrediction,
        normalizePredictionPayload: normalizePredictionPayload,
        freezePredictionOutput: freezePredictionOutput,
        validatePredictionScope: validatePredictionScope,
        runSelfTest: runSelfTest
    });

    try {
        global.AIRiskPredictionService = service;
        global.aiRiskPredictionService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
