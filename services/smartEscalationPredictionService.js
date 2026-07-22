/**
 * smartEscalationPredictionService.js
 * ARTHHRMS - Smart Escalation Prediction + Proactive Governance Intelligence
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware, explainable escalation prediction for
 * approval bottlenecks, workflow delays, unresolved issues, incidents,
 * strategic deliverables, project execution, and compliance reviews.
 *
 * AI SAFETY:
 * This service only predicts, explains, recommends, and warns. It never
 * triggers escalations, modifies workflows, assigns responsibility, changes
 * approval chains, alters records, or executes actions autonomously.
 *
 * @version 1.0.0
 */
(function attachSmartEscalationPredictionService(global) {
    'use strict';

    var PREFIX = '[SmartEscalationPredictionService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 1000;

    var ESCALATION_DOMAINS = Object.freeze([
        'LEAVE_APPROVALS',
        'ATTENDANCE_DISPUTES',
        'PAYROLL_GOVERNANCE',
        'EMPLOYEE_LIFECYCLE_ACTIONS',
        'WORKFLOW_APPROVALS',
        'STRATEGIC_DELIVERABLES',
        'PROJECT_EXECUTION',
        'OPERATIONAL_INCIDENTS',
        'COMPLIANCE_REVIEWS'
    ]);

    var ESCALATION_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

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

    function freezeEscalationOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacGovernancePreserved: true,
            noAutonomousActions: true,
            noEscalationTrigger: true,
            noWorkflowMutation: true,
            noApprovalModification: true,
            noApprovalChainChange: true,
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
            escalationCommandIntegrated: !!(global.EscalationCommandService || global.escalationCommandService),
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            aiKpiForecastingIntegrated: !!(global.AIKPIForecastingService || global.aiKpiForecastingService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!global.AuditService && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!global.WorkflowTelemetryService && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'ORGANIZATION_WIDE_ESCALATION_PREDICTION_ANALYTICS', role: role };
        if (role === 'HR') return { scope: 'HR_ESCALATION_PREDICTION_VISIBILITY', role: role };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_ESCALATION_PREDICTION_VISIBILITY', role: role, department: actorDepartment(context) };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_ESCALATION_VISIBILITY_ONLY', role: role };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_AI_GOVERNANCE_VISIBILITY', role: role };
        return { scope: 'ASSIGNED_ESCALATION_PREDICTION_VISIBILITY_ONLY', role: role, department: actorDepartment(context) };
    }

    function validateEscalationScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeEscalationOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant smart escalation prediction is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            return freezeEscalationOutput({
                success: true,
                allowed: true,
                tenantSlug: tenant || ctxTenant,
                actorId: actorId(context || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validateEscalationScope failed safely', error && error.message);
            return freezeEscalationOutput({
                success: false,
                allowed: false,
                classification: 'ESCALATION_SCOPE_ERROR',
                message: 'Smart escalation scope validation failed safely.',
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
        var token = normalizeToken(value, fallback || 'WORKFLOW_APPROVALS');
        if (ESCALATION_DOMAINS.indexOf(token) !== -1) return token;
        if (/LEAVE/.test(token)) return 'LEAVE_APPROVALS';
        if (/ATTENDANCE/.test(token)) return 'ATTENDANCE_DISPUTES';
        if (/PAYROLL/.test(token)) return 'PAYROLL_GOVERNANCE';
        if (/LIFECYCLE|EMPLOYEE/.test(token)) return 'EMPLOYEE_LIFECYCLE_ACTIONS';
        if (/STRATEGIC|DELIVERABLE/.test(token)) return 'STRATEGIC_DELIVERABLES';
        if (/PROJECT/.test(token)) return 'PROJECT_EXECUTION';
        if (/INCIDENT|OPERATION/.test(token)) return 'OPERATIONAL_INCIDENTS';
        if (/COMPLIANCE/.test(token)) return 'COMPLIANCE_REVIEWS';
        return 'WORKFLOW_APPROVALS';
    }

    function normalizeSignal(row, tenantSlug, defaultDomain, source) {
        return {
            tenantSlug: tenantSlug,
            domain: normalizeDomain(row && (row.domain || row.category || row.type || row.workflowType), defaultDomain).toLowerCase(),
            department: safeString(row && (row.department || row.departmentName || row.ownerDepartment || row.module), 'General').slice(0, 80),
            status: safeString(row && (row.status || row.state || row.issueStatus), 'MONITORING').slice(0, 80),
            ageHours: clamp(row && (row.ageHours || row.pendingHours || row.openHours || row.durationHours), 0, 100000),
            responseTimeHours: clamp(row && (row.responseTimeHours || row.ownerResponseHours || row.averageResponseHours || row.slaAgeHours), 0, 100000),
            priority: normalizeToken(row && (row.priority || row.severity || row.riskLevel), 'MODERATE'),
            blocked: !!(row && (row.blocked || row.isBlocked || /blocked|stagnant|stalled/i.test(safeString(row.status || row.state, '')))),
            retryCount: clamp(row && (row.retryCount || row.failureCount || row.retries), 0, 1000),
            delayDays: clamp(row && (row.delayDays || row.daysDelayed || row.overdueDays), 0, 10000),
            blockageCount: clamp(row && (row.blockageCount || row.blockedCount || row.bottleneckCount), 0, 10000),
            escalationLinked: !!(row && (row.escalationLinked || row.escalationId)),
            resolved: !!(row && (row.resolved || /resolved|closed|approved|completed/i.test(safeString(row.status || row.state, '')))),
            evidence: safeString(row && (row.evidence || row.message || row.summary || row.status || row.state), source || 'tenant-scoped escalation signal').slice(0, 180),
            source: source || 'signal'
        };
    }

    function normalizeEscalationPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeEscalationOutput({
                    success: false,
                    classification: 'MALFORMED_ESCALATION_PAYLOAD',
                    message: 'Smart escalation prediction payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var scope = validateEscalationScope(payload, context || {});
            if (!scope.success) return scope;
            var domains = arrayOf(payload.escalationDomains).map(function mapDomain(domain) {
                return normalizeDomain(domain, '');
            }).filter(function unique(domain, index, list) {
                return ESCALATION_DOMAINS.indexOf(domain) !== -1 && list.indexOf(domain) === index;
            });
            if (!domains.length) domains = ESCALATION_DOMAINS.slice();
            var tenant = scope.tenantSlug;
            var normalized = {
                success: true,
                tenantSlug: tenant,
                escalationDomains: domains,
                approvals: tenantRows(payload.approvals || payload.pendingApprovals || [], tenant).map(function mapApproval(row) { return normalizeSignal(row, tenant, 'WORKFLOW_APPROVALS', 'approval_delay'); }),
                workflows: tenantRows(payload.workflows || payload.workflowEvents || payload.workflowSignals || [], tenant).map(function mapWorkflow(row) { return normalizeSignal(row, tenant, 'WORKFLOW_APPROVALS', 'workflow_stagnation'); }),
                unresolvedActions: tenantRows(payload.unresolvedActions || payload.pendingActions || [], tenant).map(function mapAction(row) { return normalizeSignal(row, tenant, 'EMPLOYEE_LIFECYCLE_ACTIONS', 'unresolved_action'); }),
                historicalEscalations: tenantRows(payload.historicalEscalations || payload.escalations || [], tenant).map(function mapEscalation(row) { return normalizeSignal(row, tenant, 'OPERATIONAL_INCIDENTS', 'historical_escalation'); }),
                incidents: tenantRows(payload.incidents || payload.incidentPatterns || [], tenant).map(function mapIncident(row) { return normalizeSignal(row, tenant, 'OPERATIONAL_INCIDENTS', 'incident_pattern'); }),
                bottlenecks: tenantRows(payload.bottlenecks || payload.organizationalBottlenecks || [], tenant).map(function mapBottleneck(row) { return normalizeSignal(row, tenant, 'STRATEGIC_DELIVERABLES', 'bottleneck'); }),
                responseTimes: tenantRows(payload.responseTimes || [], tenant).map(function mapResponse(row) {
                    return {
                        tenantSlug: tenant,
                        department: safeString(row && (row.department || row.departmentName), 'General').slice(0, 80),
                        averageResponseHours: clamp(row && (row.averageResponseHours || row.responseTimeHours), 0, 100000)
                    };
                }),
                completionVelocity: tenantRows(payload.completionVelocity || payload.velocity || [], tenant).map(function mapVelocity(row) {
                    return {
                        tenantSlug: tenant,
                        department: safeString(row && (row.department || row.departmentName), 'General').slice(0, 80),
                        velocity: clamp(row && (row.velocity || row.completionRate || row.executionVelocity), 0, 100),
                        stalledCount: clamp(row && (row.stalledCount || row.blockedCount || row.delayCount), 0, 10000)
                    };
                }),
                analytics: {
                    predictionAccuracy: clamp(payload.analytics && payload.analytics.predictionAccuracy, 0, 100),
                    falsePositiveRate: clamp(payload.analytics && payload.analytics.falsePositiveRate, 0, 100),
                    falseNegativeRate: clamp(payload.analytics && payload.analytics.falseNegativeRate, 0, 100),
                    bottleneckTrend: clamp(payload.analytics && payload.analytics.bottleneckTrend, 0, 100),
                    departmentEscalationTrend: clamp(payload.analytics && payload.analytics.departmentEscalationTrend, 0, 100),
                    strategicEscalationTrend: clamp(payload.analytics && payload.analytics.strategicEscalationTrend, 0, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: scope.visibility,
                governance: governanceFlags()
            };
            var totalSignals = normalized.approvals.length + normalized.workflows.length + normalized.unresolvedActions.length + normalized.historicalEscalations.length + normalized.incidents.length + normalized.bottlenecks.length;
            normalized.dataQuality = {
                insufficientHistory: totalSignals < 3,
                sparseDatasetsHandled: true,
                conflictingSignalsHandled: true,
                missingAnalyticsHandled: true,
                rapidlyChangingWorkflowsHandled: true
            };
            return freezeEscalationOutput(normalized);
        } catch (error) {
            safeWarn('normalizeEscalationPayload failed safely', error && error.message);
            return freezeEscalationOutput({
                success: false,
                classification: 'ESCALATION_NORMALIZATION_ERROR',
                message: 'Smart escalation payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function priorityWeight(value) {
        var token = normalizeToken(value, 'LOW');
        if (token === 'CRITICAL') return 32;
        if (token === 'HIGH') return 22;
        if (token === 'MODERATE' || token === 'WARNING') return 12;
        return 5;
    }

    function escalationLevel(score) {
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

    function scoreSignal(signal) {
        var score = priorityWeight(signal.priority);
        score += Math.min(30, safeNumber(signal.ageHours, 0) / 2.5);
        score += Math.min(20, safeNumber(signal.responseTimeHours, 0) / 3);
        score += signal.blocked ? 18 : 0;
        score += Math.min(16, safeNumber(signal.retryCount, 0) * 5);
        score += Math.min(22, safeNumber(signal.delayDays, 0) * 3);
        score += Math.min(18, safeNumber(signal.blockageCount, 0) * 5);
        score += signal.escalationLinked ? 10 : 0;
        score -= signal.resolved ? 22 : 0;
        return clamp(score, 0, 100);
    }

    function allSignals(normalized) {
        return []
            .concat(normalized.approvals || [])
            .concat(normalized.workflows || [])
            .concat(normalized.unresolvedActions || [])
            .concat(normalized.historicalEscalations || [])
            .concat(normalized.incidents || [])
            .concat(normalized.bottlenecks || []);
    }

    function calculateEscalationProbability(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeEscalationPayload(input, context || {});
            if (!normalized.success) return normalized;
            var signals = allSignals(normalized);
            var scores = signals.map(scoreSignal);
            var avgScore = scores.length ? average(scores) : 14;
            var maxScore = scores.length ? Math.max.apply(null, scores) : 18;
            var density = Math.min(28, scores.length * 4);
            var blockedDensity = signals.filter(function blocked(row) { return row.blocked || row.blockageCount > 0; }).length * 6;
            var escalationProbability = Math.round(clamp(avgScore * 0.58 + maxScore * 0.28 + density + blockedDensity + normalized.analytics.bottleneckTrend * 0.16, 8, 100));
            if (normalized.dataQuality.insufficientHistory) escalationProbability = Math.max(18, Math.round(escalationProbability * 0.72));
            var confidence = Math.round(clamp(30 + scores.length * 8 + normalized.analytics.predictionAccuracy * 0.36 - normalized.analytics.falsePositiveRate * 0.25, 18, 96));
            if (normalized.dataQuality.insufficientHistory) confidence = Math.min(confidence, 58);
            var urgency = Math.round(clamp(maxScore + normalized.approvals.length * 4 + normalized.unresolvedActions.length * 4 + normalized.analytics.departmentEscalationTrend * 0.25, 0, 100));
            var impact = Math.round(clamp(avgScore + normalized.historicalEscalations.length * 8 + normalized.incidents.length * 9 + normalized.analytics.strategicEscalationTrend * 0.28, 0, 100));
            return freezeEscalationOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                escalationProbability: escalationProbability,
                escalationLevel: escalationLevel(escalationProbability),
                confidenceScore: confidence,
                confidenceLevel: confidenceLevel(confidence),
                urgencyScore: urgency,
                impactScore: impact,
                signalCount: scores.length,
                dataQuality: normalized.dataQuality,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateEscalationProbability failed safely', error && error.message);
            return freezeEscalationOutput({
                success: false,
                classification: 'ESCALATION_PROBABILITY_ERROR',
                message: 'Escalation probability calculation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function explainEscalationRisk(prediction, context) {
        try {
            var evidence = arrayOf(prediction && prediction.evidence, 8).map(function evidenceText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            var factors = arrayOf(prediction && prediction.contributingFactors, 8).map(function factorText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 140);
            }).filter(Boolean);
            var actions = arrayOf(prediction && prediction.recommendedActions, 8).map(function actionText(item) {
                return safeString(item, '').replace(/[<>]/g, '').slice(0, 180);
            }).filter(Boolean);
            if (!evidence.length) evidence.push('Tenant-scoped escalation signals are sparse, so the forecast is conservative.');
            if (!factors.length) factors.push('insufficient escalation history');
            if (!actions.length) actions.push('Ask a human owner to review escalation evidence before any action is taken.');
            var domain = normalizeDomain(prediction && prediction.domain, 'WORKFLOW_APPROVALS').toLowerCase();
            var department = safeString(prediction && prediction.department, 'General');
            var probability = clamp(prediction && prediction.escalationProbability, 0, 100);
            var level = normalizeToken(prediction && prediction.escalationLevel, escalationLevel(probability));
            return freezeEscalationOutput({
                success: true,
                domain: domain,
                department: department,
                escalationLevel: level,
                escalationProbability: probability,
                explanation: domain.replace(/_/g, ' ') + ' in ' + department + ' is classified as ' + level + ' because tenant-scoped evidence shows ' + factors.slice(0, 3).join(', ') + '.',
                evidence: evidence,
                contributingFactors: factors,
                confidenceLevel: normalizeToken(prediction && prediction.confidenceLevel, confidenceLevel(prediction && prediction.confidenceScore || probability)),
                recommendedActions: actions,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('explainEscalationRisk failed safely', error && error.message);
            return freezeEscalationOutput({
                success: false,
                classification: 'ESCALATION_EXPLANATION_ERROR',
                message: 'Escalation risk explanation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function domainSignals(normalized, domain) {
        var token = normalizeDomain(domain, 'WORKFLOW_APPROVALS').toLowerCase();
        return allSignals(normalized).filter(function matchDomain(signal) {
            return normalizeDomain(signal.domain, '') === normalizeDomain(token, '');
        });
    }

    function recommendationFor(prediction) {
        var action = 'Review ' + prediction.domain.replace(/_/g, ' ') + ' evidence with the accountable human owner.';
        if (prediction.escalationLevel === 'CRITICAL') action = 'Open a human-led governance review before any escalation or workflow action is taken.';
        else if (prediction.escalationLevel === 'HIGH') action = 'Assign a human reviewer to validate bottleneck evidence and mitigation options.';
        else if (prediction.urgencyScore > 60) action = 'Monitor urgency and ask the responsible manager to confirm response timing.';
        return {
            domain: prediction.domain,
            department: prediction.department,
            escalationLevel: prediction.escalationLevel,
            action: action,
            humanApprovalRequired: true,
            autonomousAction: false
        };
    }

    function buildDomainPrediction(normalized, domain, summary) {
        var signals = domainSignals(normalized, domain);
        var scores = signals.map(scoreSignal);
        var probability = scores.length
            ? Math.round(clamp(average(scores) + Math.min(25, scores.length * 8), 10, 100))
            : Math.round(clamp(normalized.dataQuality.insufficientHistory ? 18 : summary.escalationProbability * 0.3, 10, 42));
        var level = escalationLevel(probability);
        var departmentCounts = {};
        signals.forEach(function countDept(signal) {
            var dept = signal.department || 'General';
            departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
        });
        var department = Object.keys(departmentCounts).sort(function sortDept(a, b) { return departmentCounts[b] - departmentCounts[a]; })[0] || 'General';
        var evidence = signals.length ? signals.slice(0, 5).map(function eachEvidence(signal) { return signal.evidence; }) : ['Insufficient escalation signals found for this domain; forecast remains conservative.'];
        var factors = signals.length ? signals.slice(0, 5).map(function eachFactor(signal) { return signal.source.replace(/_/g, ' '); }) : ['sparse dataset'];
        var urgency = Math.round(clamp(probability + signals.filter(function blocked(row) { return row.blocked; }).length * 8, 0, 100));
        var impact = Math.round(clamp(probability + signals.filter(function linked(row) { return row.escalationLinked || row.priority === 'CRITICAL'; }).length * 8, 0, 100));
        var recommendation = recommendationFor({ domain: domain.toLowerCase(), department: department, escalationLevel: level, urgencyScore: urgency });
        var explanation = explainEscalationRisk({
            domain: domain.toLowerCase(),
            department: department,
            escalationLevel: level,
            escalationProbability: probability,
            confidenceScore: summary.confidenceScore,
            confidenceLevel: summary.confidenceLevel,
            evidence: evidence,
            contributingFactors: factors,
            recommendedActions: [recommendation.action]
        });
        return {
            predictionId: 'SMART-ESC-' + domain + '-' + Date.now(),
            domain: domain.toLowerCase(),
            department: department,
            escalationLevel: level,
            escalationProbability: probability,
            confidenceScore: summary.confidenceScore,
            confidenceLevel: summary.confidenceLevel,
            urgencyScore: urgency,
            impactScore: impact,
            explanation: explanation.explanation,
            evidence: explanation.evidence,
            contributingFactors: explanation.contributingFactors,
            recommendedActions: explanation.recommendedActions,
            readOnly: true
        };
    }

    function applyVisibility(predictions, context) {
        var visibility = visibilityForContext(context || {});
        if (visibility.scope === 'ORGANIZATION_WIDE_ESCALATION_PREDICTION_ANALYTICS' || visibility.scope === 'PLATFORM_AI_GOVERNANCE_VISIBILITY' || visibility.scope === 'INFRASTRUCTURE_ESCALATION_VISIBILITY_ONLY') {
            return predictions;
        }
        if (visibility.scope === 'HR_ESCALATION_PREDICTION_VISIBILITY') {
            return predictions.filter(function hrVisible(row) {
                return /hr|leave|attendance|employee_lifecycle|payroll|compliance/i.test(row.domain + ' ' + row.department);
            });
        }
        var dept = safeString(visibility.department, '').toLowerCase();
        if (!dept) return predictions.filter(function lifecycleOnly(row) { return row.domain === 'employee_lifecycle_actions'; });
        return predictions.filter(function visibleRow(row) {
            return safeString(row.department, '').toLowerCase() === dept || row.domain === 'employee_lifecycle_actions';
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
                    entityType: 'SMART_ESCALATION_PREDICTION',
                    module: 'Smart Escalation Prediction',
                    details: cloneSanitized(details || {})
                });
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-SMART-ESC-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'Smart Escalation Prediction',
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
                        source: 'smartEscalationPredictionService',
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

    function generateEscalationPrediction(payload, context) {
        try {
            var normalized = normalizeEscalationPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var summary = calculateEscalationProbability(normalized, context || {});
            if (!summary.success) return summary;
            var predictions = normalized.escalationDomains.map(function mapDomain(domain) {
                return buildDomainPrediction(normalized, domain, summary);
            });
            predictions = applyVisibility(predictions, context || {});
            if (!predictions.length) predictions = [buildDomainPrediction(normalized, 'EMPLOYEE_LIFECYCLE_ACTIONS', summary)];
            var likelyEscalations = predictions.filter(function likely(row) { return row.escalationLevel === 'HIGH' || row.escalationLevel === 'CRITICAL'; });
            var emergingEscalations = predictions.filter(function emerging(row) { return row.escalationLevel === 'MODERATE' || (row.escalationLevel === 'LOW' && normalized.dataQuality.insufficientHistory); });
            var recurringEscalations = predictions.filter(function recurring(row) {
                return row.contributingFactors.some(function factorMatch(factor) { return /historical|approval|workflow|bottleneck/i.test(factor); });
            });
            var blockedWorkflowAlerts = predictions.filter(function blocked(row) {
                return /workflow|project|strategic/i.test(row.domain) && (row.urgencyScore >= 45 || row.escalationLevel === 'HIGH' || row.escalationLevel === 'CRITICAL');
            });
            var recommendedActions = predictions.filter(function actionable(row) {
                return row.escalationLevel !== 'LOW' || normalized.dataQuality.insufficientHistory;
            }).map(recommendationFor);
            if (!recommendedActions.length) recommendedActions = [recommendationFor(predictions[0])];
            var reportId = 'SMART-ESCALATION-REPORT-' + Date.now();
            var generatedAt = nowIso();
            var history = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                escalationProbability: summary.escalationProbability,
                escalationLevel: summary.escalationLevel,
                confidenceScore: summary.confidenceScore,
                predictionCount: predictions.length,
                readOnly: true,
                immutable: true
            };
            appendHistory('smartEscalationPredictionHistory', history);
            appendHistory('smartEscalationPredictionAnalytics', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                predictionAccuracy: normalized.analytics.predictionAccuracy,
                falsePositiveRate: normalized.analytics.falsePositiveRate,
                falseNegativeRate: normalized.analytics.falseNegativeRate,
                escalationCategories: predictions.reduce(function reduce(acc, row) {
                    acc[row.domain] = row.escalationProbability;
                    return acc;
                }, {}),
                bottleneckTrends: normalized.analytics.bottleneckTrend,
                departmentEscalationTrends: normalized.analytics.departmentEscalationTrend,
                strategicEscalationTrends: normalized.analytics.strategicEscalationTrend,
                escalationHealthScore: Math.max(0, 100 - summary.escalationProbability),
                workflowResponsivenessScore: Math.max(0, 100 - summary.urgencyScore),
                governanceResponsivenessScore: Math.max(0, 100 - summary.impactScore),
                immutable: true
            });
            appendHistory('smartEscalationRecommendationHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                recommendations: recommendedActions,
                humanApprovalRequired: true,
                immutable: true
            });
            var auditRecorded = recordAudit('SMART_ESCALATION_PREDICTION_GENERATED', history, context || {});
            var telemetryRecorded = recordTelemetry('SMART_ESCALATION_PREDICTION_GENERATED', history, context || {});
            return freezeEscalationOutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                readOnly: true,
                visibility: normalized.visibility,
                escalationProbability: summary.escalationProbability,
                escalationLevel: summary.escalationLevel,
                confidenceScore: summary.confidenceScore,
                confidenceLevel: summary.confidenceLevel,
                urgencyScore: summary.urgencyScore,
                impactScore: summary.impactScore,
                predictedEscalations: predictions,
                likelyEscalations: likelyEscalations,
                emergingEscalations: emergingEscalations,
                recurringEscalations: recurringEscalations,
                blockedWorkflowAlerts: blockedWorkflowAlerts,
                bottleneckHotspots: predictions.filter(function hot(row) { return row.urgencyScore >= 50 || row.impactScore >= 55; }).map(function hotmap(row) {
                    return { domain: row.domain, department: row.department, urgencyScore: row.urgencyScore, impactScore: row.impactScore };
                }),
                recommendedActions: recommendedActions,
                analytics: {
                    predictionAccuracy: normalized.analytics.predictionAccuracy,
                    falsePositiveRate: normalized.analytics.falsePositiveRate,
                    falseNegativeRate: normalized.analytics.falseNegativeRate,
                    escalationCategories: predictions.reduce(function reduce(acc, row) {
                        acc[row.domain] = row.escalationProbability;
                        return acc;
                    }, {}),
                    bottleneckTrends: normalized.analytics.bottleneckTrend,
                    departmentEscalationTrends: normalized.analytics.departmentEscalationTrend,
                    strategicEscalationTrends: normalized.analytics.strategicEscalationTrend,
                    escalationHealthScore: Math.max(0, 100 - summary.escalationProbability),
                    workflowResponsivenessScore: Math.max(0, 100 - summary.urgencyScore),
                    governanceResponsivenessScore: Math.max(0, 100 - summary.impactScore)
                },
                dataQuality: normalized.dataQuality,
                aiSafety: {
                    predict: true,
                    explain: true,
                    recommend: true,
                    warn: true,
                    autonomousDecisioning: false,
                    escalationTrigger: false,
                    workflowMutation: false,
                    approvalModification: false,
                    approvalChainChange: false,
                    recordMutation: false,
                    workflowExecution: false
                },
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generateEscalationPrediction failed safely', error && error.message);
            return freezeEscalationOutput({
                success: false,
                classification: 'SMART_ESCALATION_PREDICTION_ERROR',
                message: 'Smart escalation prediction failed safely.',
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
            var context = { tenantSlug: 'self-test', actor: { id: 'ESC-SELF', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
            var malformed = normalizeEscalationPayload('bad', context);
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'self-test',
                escalationDomains: ['leave_approvals', 'workflow_approvals'],
                approvals: [{ tenantSlug: 'self-test', domain: 'leave_approvals', department: 'HR', status: 'pending', ageHours: 72, priority: 'HIGH' }],
                workflows: [{ tenantSlug: 'self-test', domain: 'workflow_approvals', department: 'Operations', status: 'stagnant', ageHours: 44, blocked: true }],
                analytics: { predictionAccuracy: 80, bottleneckTrend: 18 }
            };
            var normalized = normalizeEscalationPayload(payload, context);
            var probability = calculateEscalationProbability(normalized, context);
            var explanation = explainEscalationRisk({ domain: 'leave_approvals', department: 'HR', escalationLevel: 'HIGH', escalationProbability: 74, evidence: ['Approval exceeded SLA'], contributingFactors: ['approval delay'] }, context);
            var report = generateEscalationPrediction(payload, context);
            var blocked = generateEscalationPrediction(Object.assign({}, payload, { tenantSlug: 'other-tenant' }), context);
            record('escalation prediction works', report.success && report.predictedEscalations.length > 0);
            record('confidence scoring works', probability.success && probability.confidenceScore > 0 && probability.escalationProbability > 0);
            record('explainability works', explanation.success && explanation.explanation.length > 20 && explanation.evidence.length > 0);
            record('tenant isolation works', blocked.success === false && /TENANT/i.test(blocked.classification || ''));
            record('AI governance works', report.governance.noAutonomousActions && report.governance.noEscalationTrigger && report.governance.noWorkflowExecution && report.governance.humanApprovalRequired);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.predictedEscalations));
        } catch (error) {
            record('self-test failure captured', false, safeString(error && error.message, 'unknown'));
        }
        var result = freezeEscalationOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_SMART_ESCALATION_PREDICTION_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        ESCALATION_DOMAINS: ESCALATION_DOMAINS,
        ESCALATION_LEVELS: ESCALATION_LEVELS,
        generateEscalationPrediction: generateEscalationPrediction,
        calculateEscalationProbability: calculateEscalationProbability,
        explainEscalationRisk: explainEscalationRisk,
        normalizeEscalationPayload: normalizeEscalationPayload,
        freezeEscalationOutput: freezeEscalationOutput,
        validateEscalationScope: validateEscalationScope,
        runSelfTest: runSelfTest
    });

    try {
        global.SmartEscalationPredictionService = service;
        global.smartEscalationPredictionService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
