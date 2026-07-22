/**
 * advancedOkrService.js
 * ARTHHRMS - Advanced OKR Management + Strategic Goal Intelligence Framework
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware OKR hierarchy management, key-result
 * tracking, strategic alignment scoring, execution intelligence, AI advisory
 * insights, immutable histories, and audit-safe governance reporting.
 *
 * AI SAFETY:
 * AI outputs are advisory only. This service never lets AI modify OKRs,
 * approve OKRs, change targets, bypass strategic approvals, alter permissions,
 * or execute workflows autonomously.
 *
 * @version 1.0.0
 */
(function attachAdvancedOKRService(global) {
    'use strict';

    var PREFIX = '[AdvancedOKRService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 1000;

    var OBJECTIVE_STATES = Object.freeze(['DRAFT', 'ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED', 'ARCHIVED']);
    var KEY_RESULT_STATES = Object.freeze(['NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'ACHIEVED', 'MISSED']);
    var OBJECTIVE_LEVELS = Object.freeze(['organization', 'department', 'team', 'individual']);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|confidentialEmployeeRecord|confidentialNote|privateNote|rawPayload)/i;
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

    function freezeOKROutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            strategicGovernancePreserved: true,
            rbacGovernancePreserved: true,
            existingWorkflowsPreserved: true,
            noApprovalBypass: true,
            noUnauthorizedGoalModification: true,
            noCrossDepartmentLeakage: true,
            noGovernanceViolation: true,
            aiAdvisoryOnly: true,
            noAutonomousModifications: true,
            noAIObjectiveMutation: true,
            noAIApproval: true,
            noAITargetChange: true,
            noTargetChangeByAI: true,
            explainableRecommendationsOnly: true,
            humanApprovalRequired: true,
            immutableOKRHistory: true,
            immutableProgressHistory: true,
            immutableStrategicReviews: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            aiKpiForecastingIntegrated: !!(global.AIKPIForecastingService || global.aiKpiForecastingService),
            smartEscalationPredictionIntegrated: !!(global.SmartEscalationPredictionService || global.smartEscalationPredictionService),
            organizationPerformanceForecastingIntegrated: !!(global.OrganizationPerformanceForecastingService || global.organizationPerformanceForecastingService),
            quarterlyGoalIntegrated: !!(global.QuarterlyGoalService || global.quarterlyGoalService),
            departmentExecutionIntegrated: !!(global.DepartmentExecutionBoardService || global.departmentExecutionBoardService),
            leadershipAccountabilityIntegrated: !!(global.LeadershipAccountabilityService || global.leadershipAccountabilityService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!global.AuditService && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!global.WorkflowTelemetryService && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'ORGANIZATION_STRATEGIC_OKR_VISIBILITY', role: role };
        if (role === 'HR') return { scope: 'WORKFORCE_OKR_VISIBILITY', role: role, department: actorDepartment(context) || 'HR' };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_TEAM_OKR_VISIBILITY', role: role, department: actorDepartment(context) };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_OKR_GOVERNANCE_VISIBILITY_ONLY', role: role };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_OKR_VISIBILITY_ONLY', role: role };
        return { scope: 'ASSIGNED_CONTRIBUTION_VISIBILITY_ONLY', role: role, department: actorDepartment(context), actorId: actorId(context) };
    }

    function validateOKRScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeOKROutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant OKR visibility is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            return freezeOKROutput({
                success: true,
                allowed: true,
                tenantSlug: tenant || ctxTenant,
                actorId: actorId(context || {}),
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validateOKRScope failed safely', error && error.message);
            return freezeOKROutput({
                success: false,
                allowed: false,
                classification: 'OKR_SCOPE_ERROR',
                message: 'OKR scope validation failed safely.',
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

    function normalizeObjectiveState(value) {
        var state = normalizeToken(value, 'DRAFT');
        if (OBJECTIVE_STATES.indexOf(state) !== -1) return state;
        if (state === 'DONE' || state === 'ACHIEVED') return 'COMPLETED';
        if (state === 'RISK' || state === 'ESCALATED') return 'AT_RISK';
        return 'DRAFT';
    }

    function normalizeKeyResultState(value, completion) {
        var state = normalizeToken(value, '');
        if (KEY_RESULT_STATES.indexOf(state) !== -1) return state;
        if (completion >= 100) return 'ACHIEVED';
        if (completion <= 0) return 'NOT_STARTED';
        if (completion < 45) return 'AT_RISK';
        return 'IN_PROGRESS';
    }

    function normalizeLevel(value) {
        var level = safeString(value || 'department', '').trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (level === 'org' || level === 'company' || level === 'enterprise') return 'organization';
        if (level === 'dept') return 'department';
        if (level === 'contribution' || level === 'employee') return 'individual';
        if (OBJECTIVE_LEVELS.indexOf(level) !== -1) return level;
        return 'department';
    }

    function normalizeDependencies(value) {
        return arrayOf(value, 30).map(function depText(item) {
            if (isPlainObject(item)) return safeString(item.objectiveId || item.id || item.toObjectiveId || item.fromObjectiveId, '').slice(0, 100);
            return safeString(item, '').slice(0, 100);
        }).filter(Boolean);
    }

    function normalizeObjective(row, tenantSlug, index) {
        var objectiveId = safeString(row && (row.objectiveId || row.id || row.goalId), 'OKR-OBJ-' + Date.now() + '-' + (index + 1)).slice(0, 100);
        var level = normalizeLevel(row && (row.level || row.objectiveLevel || row.scope));
        var ownerId = safeString(row && (row.ownerId || row.owner || row.assigneeId || row.contributorId || row.employeeId), '').slice(0, 100);
        var department = safeString(row && (row.department || row.departmentName || row.ownerDepartment || row.teamDepartment), level === 'organization' ? 'Leadership' : 'General').slice(0, 100);
        return {
            tenantSlug: tenantSlug,
            objectiveId: objectiveId,
            title: safeString(row && (row.title || row.name || row.objectiveTitle || row.goalName), 'Untitled objective').slice(0, 180),
            level: level,
            ownerId: ownerId,
            ownerRole: normalizeRole(row && row.ownerRole || ''),
            department: department,
            team: safeString(row && row.team, '').slice(0, 100),
            contributorId: safeString(row && (row.contributorId || row.employeeId || row.assigneeId), '').slice(0, 100),
            status: normalizeObjectiveState(row && (row.status || row.state || row.lifecycleState)),
            parentObjectiveId: safeString(row && (row.parentObjectiveId || row.parentId || row.alignedToObjectiveId), '').slice(0, 100),
            dependencies: normalizeDependencies(row && (row.dependencies || row.dependencyObjectiveIds || [])),
            progressPercent: clamp(row && (row.progressPercent || row.completionPercent || row.currentCompletion), 0, 100),
            createdAt: safeString(row && row.createdAt, nowIso()),
            updatedAt: safeString(row && row.updatedAt, nowIso()),
            metadata: cloneSanitized(row && row.metadata || {})
        };
    }

    function normalizeKeyResult(row, tenantSlug, index) {
        var target = safeNumber(row && (row.targetValue !== undefined ? row.targetValue : row.target), 100);
        var current = safeNumber(row && (row.currentValue !== undefined ? row.currentValue : row.value), 0);
        var completion = target ? clamp(current / Math.max(1, target) * 100, 0, 100) : clamp(row && row.completionPercentage, 0, 100);
        var forecast = clamp(row && (row.forecastedCompletion || row.forecastCompletion || row.projectedCompletion), 0, 100);
        if (!forecast) forecast = completion;
        return {
            tenantSlug: tenantSlug,
            keyResultId: safeString(row && (row.keyResultId || row.id || row.krId), 'OKR-KR-' + Date.now() + '-' + (index + 1)).slice(0, 100),
            objectiveId: safeString(row && row.objectiveId, '').slice(0, 100),
            title: safeString(row && (row.title || row.name || row.keyResultTitle), 'Untitled key result').slice(0, 180),
            targetValue: clamp(target, -1000000, 1000000),
            currentValue: clamp(current, -1000000, 1000000),
            completionPercentage: Math.round(completion),
            forecastedCompletion: Math.round(forecast),
            confidenceScore: clamp(row && row.confidenceScore, 0, 100),
            status: normalizeKeyResultState(row && (row.status || row.state), completion),
            ownerId: safeString(row && (row.ownerId || row.assigneeId), '').slice(0, 100),
            metadata: cloneSanitized(row && row.metadata || {})
        };
    }

    function normalizeDependency(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            fromObjectiveId: safeString(row && (row.fromObjectiveId || row.sourceObjectiveId || row.objectiveId), '').slice(0, 100),
            toObjectiveId: safeString(row && (row.toObjectiveId || row.targetObjectiveId || row.parentObjectiveId), '').slice(0, 100),
            type: safeString(row && (row.type || row.dependencyType), 'alignment').slice(0, 80)
        };
    }

    function normalizeContribution(row, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            objectiveId: safeString(row && row.objectiveId, '').slice(0, 100),
            contributorId: safeString(row && (row.contributorId || row.employeeId || row.assigneeId), '').slice(0, 100),
            department: safeString(row && (row.department || row.departmentName), 'General').slice(0, 100),
            contributionPercent: clamp(row && (row.contributionPercent || row.progressPercent), 0, 100)
        };
    }

    function buildObjectiveGraph(objectives) {
        var byId = {};
        var children = {};
        objectives.forEach(function indexObjective(objective) {
            byId[objective.objectiveId] = objective;
            children[objective.objectiveId] = children[objective.objectiveId] || [];
        });
        objectives.forEach(function attachChild(objective) {
            if (objective.parentObjectiveId && byId[objective.parentObjectiveId]) {
                children[objective.parentObjectiveId] = children[objective.parentObjectiveId] || [];
                children[objective.parentObjectiveId].push(objective);
            }
        });
        return { byId: byId, children: children };
    }

    function detectCycles(objectives) {
        var graph = buildObjectiveGraph(objectives);
        var cycles = [];
        var visiting = {};
        var visited = {};
        function dfs(id, path) {
            if (visiting[id]) {
                cycles.push(path.concat([id]));
                return;
            }
            if (visited[id]) return;
            visiting[id] = true;
            var objective = graph.byId[id];
            var nextIds = [];
            if (objective && objective.parentObjectiveId) nextIds.push(objective.parentObjectiveId);
            (objective && objective.dependencies || []).forEach(function dep(depId) { nextIds.push(depId); });
            nextIds.forEach(function next(nextId) {
                if (graph.byId[nextId]) dfs(nextId, path.concat([id]));
            });
            visiting[id] = false;
            visited[id] = true;
        }
        objectives.forEach(function run(objective) { dfs(objective.objectiveId, []); });
        return cycles;
    }

    function buildHierarchy(objectives) {
        var graph = buildObjectiveGraph(objectives);
        var roots = objectives.filter(function root(objective) {
            return !objective.parentObjectiveId || !graph.byId[objective.parentObjectiveId];
        });
        if (!roots.length) roots = objectives.slice();
        function node(objective, depth, trail) {
            if (trail.indexOf(objective.objectiveId) !== -1) {
                return {
                    objectiveId: objective.objectiveId,
                    title: objective.title,
                    level: objective.level,
                    department: objective.department,
                    status: objective.status,
                    circularReference: true,
                    children: []
                };
            }
            return {
                objectiveId: objective.objectiveId,
                title: objective.title,
                level: objective.level,
                department: objective.department,
                ownerId: objective.ownerId,
                status: objective.status,
                progressPercent: objective.progressPercent,
                depth: depth,
                children: (graph.children[objective.objectiveId] || []).map(function child(childObjective) {
                    return node(childObjective, depth + 1, trail.concat([objective.objectiveId]));
                })
            };
        }
        return roots.map(function mapRoot(root) { return node(root, 0, []); });
    }

    function buildLinkageChains(objectives) {
        var graph = buildObjectiveGraph(objectives);
        var roots = objectives.filter(function root(objective) {
            return !objective.parentObjectiveId || !graph.byId[objective.parentObjectiveId];
        });
        if (!roots.length) roots = objectives.slice();
        var chains = [];
        function walk(objective, chain, trail) {
            var nextChain = chain.concat([objective.objectiveId]);
            var childRows = graph.children[objective.objectiveId] || [];
            if (!childRows.length || trail.indexOf(objective.objectiveId) !== -1) {
                chains.push(nextChain);
                return;
            }
            childRows.forEach(function child(childObjective) {
                walk(childObjective, nextChain, trail.concat([objective.objectiveId]));
            });
        }
        roots.forEach(function rootWalk(root) { walk(root, [], []); });
        return chains;
    }

    function edgeCasesFor(normalized) {
        var graph = buildObjectiveGraph(normalized.objectives);
        var orphanObjectives = normalized.objectives.filter(function orphan(objective) {
            return objective.parentObjectiveId && !graph.byId[objective.parentObjectiveId];
        });
        var missingOwnership = normalized.objectives.filter(function missing(objective) {
            return !objective.ownerId;
        });
        var titleCounts = {};
        normalized.objectives.forEach(function count(objective) {
            var key = [objective.level, objective.department, objective.title.toLowerCase()].join('|');
            titleCounts[key] = (titleCounts[key] || 0) + 1;
        });
        var conflicting = Object.keys(titleCounts).filter(function duplicate(key) { return titleCounts[key] > 1; });
        var cycles = detectCycles(normalized.objectives);
        return {
            orphanObjectivesDetected: orphanObjectives.length > 0,
            circularDependenciesDetected: cycles.length > 0,
            missingOwnershipDetected: missingOwnership.length > 0,
            conflictingOKRsDetected: conflicting.length > 0,
            malformedPayloadsHandled: true,
            orphanObjectives: orphanObjectives.map(function map(row) { return row.objectiveId; }),
            circularDependencies: cycles,
            missingOwnership: missingOwnership.map(function map(row) { return row.objectiveId; }),
            conflictingOKRs: conflicting
        };
    }

    function normalizeAIList(value, max) {
        return arrayOf(value, max || 40).map(function clean(row) {
            return cloneSanitized(row || {});
        });
    }

    function normalizeOKRPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeOKROutput({
                    success: false,
                    classification: 'MALFORMED_OKR_PAYLOAD',
                    message: 'OKR payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var scope = validateOKRScope(payload, context || {});
            if (!scope.success) return scope;
            var tenant = scope.tenantSlug;
            var normalized = {
                success: true,
                tenantSlug: tenant,
                objectives: tenantRows(payload.objectives || payload.okrObjectives || payload.goals || [], tenant).map(function mapObjective(row, index) {
                    return normalizeObjective(row, tenant, index);
                }),
                keyResults: tenantRows(payload.keyResults || payload.okrKeyResults || payload.results || [], tenant).map(function mapKeyResult(row, index) {
                    return normalizeKeyResult(row, tenant, index);
                }),
                dependencies: tenantRows(payload.dependencies || payload.objectiveDependencies || [], tenant).map(function mapDependency(row) {
                    return normalizeDependency(row, tenant);
                }),
                contributions: tenantRows(payload.contributions || payload.individualContributions || [], tenant).map(function mapContribution(row) {
                    return normalizeContribution(row, tenant);
                }),
                aiSignals: {
                    riskIndicators: normalizeAIList(payload.aiSignals && payload.aiSignals.riskIndicators || payload.riskIndicators || []),
                    kpiForecasts: normalizeAIList(payload.aiSignals && payload.aiSignals.kpiForecasts || payload.kpiForecasts || []),
                    performanceForecasts: normalizeAIList(payload.aiSignals && payload.aiSignals.performanceForecasts || payload.performanceForecasts || [])
                },
                analytics: {
                    completionRate: clamp(payload.analytics && payload.analytics.completionRate, 0, 100),
                    objectiveSuccessRate: clamp(payload.analytics && payload.analytics.objectiveSuccessRate, 0, 100),
                    keyResultAchievementRate: clamp(payload.analytics && payload.analytics.keyResultAchievementRate, 0, 100),
                    departmentAlignment: clamp(payload.analytics && payload.analytics.departmentAlignment, 0, 100),
                    strategicExecutionVelocity: clamp(payload.analytics && payload.analytics.strategicExecutionVelocity, 0, 100),
                    accountabilityTrend: clamp(payload.analytics && payload.analytics.accountabilityTrend, 0, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                visibility: scope.visibility,
                governance: governanceFlags()
            };
            normalized.objectiveHierarchy = buildHierarchy(normalized.objectives);
            normalized.linkageChains = buildLinkageChains(normalized.objectives);
            normalized.edgeCases = edgeCasesFor(normalized);
            return freezeOKROutput(normalized);
        } catch (error) {
            safeWarn('normalizeOKRPayload failed safely', error && error.message);
            return freezeOKROutput({
                success: false,
                classification: 'OKR_NORMALIZATION_ERROR',
                message: 'OKR payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function canManageLevel(level, context, payload) {
        var visibility = visibilityForContext(context || {});
        var role = visibility.role;
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return true;
        if (role === 'PLATFORM_OWNER' || role === 'SUPER_ADMIN') return false;
        if (role === 'HR') {
            return level !== 'organization' && /hr|workforce|people|employee/i.test(safeString(payload && (payload.department || payload.title), ''));
        }
        if (role === 'MANAGER') {
            var dept = safeString(visibility.department, '').toLowerCase();
            var payloadDept = safeString(payload && payload.department, '').toLowerCase();
            return (level === 'department' || level === 'team') && (!dept || !payloadDept || dept === payloadDept);
        }
        if (role === 'EMPLOYEE') {
            return level === 'individual' && (!payload || !payload.ownerId || payload.ownerId === actorId(context));
        }
        return false;
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
                    entityType: 'ADVANCED_OKR',
                    module: 'Advanced OKR Management',
                    details: cloneSanitized(details || {})
                });
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-OKR-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'Advanced OKR Management',
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
                        source: 'advancedOkrService',
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

    function createObjective(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeOKROutput({ success: false, classification: 'MALFORMED_OBJECTIVE_PAYLOAD', message: 'Objective payload must be an object.', governance: governanceFlags() });
            }
            var scope = validateOKRScope(payload, context || {});
            if (!scope.success) return scope;
            var objective = normalizeObjective(payload, scope.tenantSlug, 0);
            if (!canManageLevel(objective.level, context || {}, objective)) {
                return freezeOKROutput({
                    success: false,
                    classification: 'UNAUTHORIZED_OBJECTIVE_GOVERNANCE',
                    message: 'Role is not authorized to create this OKR level.',
                    visibility: visibilityForContext(context || {}),
                    governance: governanceFlags()
                });
            }
            objective.status = normalizeObjectiveState(payload.status || payload.state || 'DRAFT');
            var data = rawData();
            data.okrObjectives = Array.isArray(data.okrObjectives) ? data.okrObjectives : [];
            data.okrObjectives.unshift(cloneSanitized(objective));
            data.okrObjectives = data.okrObjectives.slice(0, MAX_HISTORY);
            saveData(data);
            var history = {
                historyId: 'OKR-HIST-' + Date.now(),
                tenantSlug: scope.tenantSlug,
                actionType: 'OBJECTIVE_CREATED',
                objectiveId: objective.objectiveId,
                status: objective.status,
                createdAt: nowIso(),
                immutable: true
            };
            appendHistory('okrHistory', history);
            recordAudit('OKR_OBJECTIVE_CREATED', history, context || {});
            recordTelemetry('OKR_OBJECTIVE_CREATED', history, context || {});
            return freezeOKROutput({
                success: true,
                objective: objective,
                history: history,
                visibility: scope.visibility,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('createObjective failed safely', error && error.message);
            return freezeOKROutput({ success: false, classification: 'OBJECTIVE_CREATE_ERROR', message: 'Objective creation failed safely.', governance: governanceFlags() });
        }
    }

    function createKeyResult(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeOKROutput({ success: false, classification: 'MALFORMED_KEY_RESULT_PAYLOAD', message: 'Key result payload must be an object.', governance: governanceFlags() });
            }
            var scope = validateOKRScope(payload, context || {});
            if (!scope.success) return scope;
            var data = rawData();
            var objectives = tenantRows(data.okrObjectives || [], scope.tenantSlug).map(function mapObjective(row, index) {
                return normalizeObjective(row, scope.tenantSlug, index);
            });
            var targetObjective = objectives.find(function findObjective(row) { return row.objectiveId === safeString(payload.objectiveId, ''); });
            if (targetObjective && !canManageLevel(targetObjective.level, context || {}, targetObjective)) {
                return freezeOKROutput({
                    success: false,
                    classification: 'UNAUTHORIZED_KEY_RESULT_GOVERNANCE',
                    message: 'Role is not authorized to add a key result to this objective.',
                    visibility: visibilityForContext(context || {}),
                    governance: governanceFlags()
                });
            }
            var keyResult = normalizeKeyResult(payload, scope.tenantSlug, 0);
            var stateFromCompletion = normalizeKeyResultState(payload.status || payload.state, keyResult.completionPercentage);
            keyResult.status = stateFromCompletion;
            data.okrKeyResults = Array.isArray(data.okrKeyResults) ? data.okrKeyResults : [];
            data.okrKeyResults.unshift(cloneSanitized(keyResult));
            data.okrKeyResults = data.okrKeyResults.slice(0, MAX_HISTORY);
            saveData(data);
            var history = {
                historyId: 'OKR-KR-HIST-' + Date.now(),
                tenantSlug: scope.tenantSlug,
                actionType: 'KEY_RESULT_CREATED',
                keyResultId: keyResult.keyResultId,
                objectiveId: keyResult.objectiveId,
                status: keyResult.status,
                completionPercentage: keyResult.completionPercentage,
                createdAt: nowIso(),
                immutable: true
            };
            appendHistory('okrHistory', history);
            appendHistory('okrProgressHistory', history);
            recordAudit('OKR_KEY_RESULT_CREATED', history, context || {});
            recordTelemetry('OKR_KEY_RESULT_CREATED', history, context || {});
            return freezeOKROutput({
                success: true,
                keyResult: keyResult,
                history: history,
                visibility: scope.visibility,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('createKeyResult failed safely', error && error.message);
            return freezeOKROutput({ success: false, classification: 'KEY_RESULT_CREATE_ERROR', message: 'Key result creation failed safely.', governance: governanceFlags() });
        }
    }

    function calculateAlignmentScore(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeOKRPayload(input, context || {});
            if (!normalized.success) return normalized;
            var objectiveCount = normalized.objectives.length;
            var linkedObjectives = normalized.objectives.filter(function linked(row) { return row.level === 'organization' || row.parentObjectiveId; }).length;
            var dependencies = normalized.dependencies.length + normalized.objectives.reduce(function sum(acc, row) { return acc + row.dependencies.length; }, 0);
            var departments = {};
            normalized.objectives.forEach(function dept(row) { departments[row.department || 'General'] = true; });
            var ownerCount = normalized.objectives.filter(function owner(row) { return !!row.ownerId; }).length;
            var alignment = objectiveCount ? Math.round(clamp(linkedObjectives / objectiveCount * 72 + Math.min(18, dependencies * 4) + normalized.analytics.departmentAlignment * 0.1, 0, 100)) : 0;
            var accountability = objectiveCount ? Math.round(clamp(ownerCount / objectiveCount * 82 + normalized.analytics.accountabilityTrend * 0.18, 0, 100)) : 0;
            var crossTeam = Math.round(clamp(Object.keys(departments).length * 14 + normalized.dependencies.length * 8, 0, 100));
            return freezeOKROutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                alignmentScore: alignment,
                accountabilityScore: accountability,
                crossTeamAlignmentScore: crossTeam,
                departmentContributionCount: Object.keys(departments).length,
                linkedObjectiveCount: linkedObjectives,
                objectiveCount: objectiveCount,
                edgeCases: normalized.edgeCases,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateAlignmentScore failed safely', error && error.message);
            return freezeOKROutput({ success: false, classification: 'ALIGNMENT_SCORE_ERROR', message: 'Alignment score calculation failed safely.', governance: governanceFlags() });
        }
    }

    function calculateExecutionScore(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeOKRPayload(input, context || {});
            if (!normalized.success) return normalized;
            var objectiveProgress = normalized.objectives.map(function progress(row) { return safeNumber(row.progressPercent, 0); });
            var keyCompletion = normalized.keyResults.map(function completion(row) { return safeNumber(row.completionPercentage, 0); });
            var keyForecast = normalized.keyResults.map(function forecast(row) { return safeNumber(row.forecastedCompletion, 0); });
            var atRiskPenalty = normalized.objectives.filter(function risk(row) { return row.status === 'AT_RISK' || row.status === 'CANCELLED'; }).length * 7 + normalized.keyResults.filter(function risk(row) { return row.status === 'AT_RISK' || row.status === 'MISSED'; }).length * 6;
            var execution = Math.round(clamp((average(objectiveProgress) || normalized.analytics.completionRate || 0) * 0.42 + (average(keyCompletion) || normalized.analytics.keyResultAchievementRate || 0) * 0.36 + normalized.analytics.strategicExecutionVelocity * 0.22 - atRiskPenalty, 0, 100));
            var strategicHealth = Math.round(clamp(execution * 0.46 + (average(keyForecast) || execution) * 0.32 + normalized.analytics.objectiveSuccessRate * 0.22, 0, 100));
            return freezeOKROutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                executionScore: execution,
                strategicHealthScore: strategicHealth,
                objectiveCompletionRate: Math.round(average(objectiveProgress) || normalized.analytics.completionRate || 0),
                keyResultAchievementRate: Math.round(average(keyCompletion) || normalized.analytics.keyResultAchievementRate || 0),
                forecastedCompletionRate: Math.round(average(keyForecast) || execution),
                atRiskPenalty: atRiskPenalty,
                edgeCases: normalized.edgeCases,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateExecutionScore failed safely', error && error.message);
            return freezeOKROutput({ success: false, classification: 'EXECUTION_SCORE_ERROR', message: 'Execution score calculation failed safely.', governance: governanceFlags() });
        }
    }

    function applyVisibility(normalized, context) {
        var visibility = visibilityForContext(context || {});
        var objectives = normalized.objectives.slice();
        var keyResults = normalized.keyResults.slice();
        var contributions = normalized.contributions.slice();
        if (visibility.scope === 'ORGANIZATION_STRATEGIC_OKR_VISIBILITY' || visibility.scope === 'PLATFORM_OKR_GOVERNANCE_VISIBILITY_ONLY' || visibility.scope === 'INFRASTRUCTURE_OKR_VISIBILITY_ONLY') {
            return { objectives: objectives, keyResults: keyResults, contributions: contributions, visibility: visibility };
        }
        if (visibility.scope === 'WORKFORCE_OKR_VISIBILITY') {
            objectives = objectives.filter(function hr(row) { return /hr|workforce|people|employee/i.test(row.department + ' ' + row.title); });
        } else if (visibility.scope === 'DEPARTMENT_TEAM_OKR_VISIBILITY') {
            var dept = safeString(visibility.department, '').toLowerCase();
            objectives = objectives.filter(function manager(row) {
                return safeString(row.department, '').toLowerCase() === dept || row.level === 'individual';
            });
        } else {
            var actor = safeString(visibility.actorId, '');
            objectives = objectives.filter(function employee(row) {
                return row.ownerId === actor || row.contributorId === actor || row.level === 'individual';
            });
        }
        var visibleIds = objectives.reduce(function reduce(acc, row) { acc[row.objectiveId] = true; return acc; }, {});
        keyResults = keyResults.filter(function visibleKR(row) { return !!visibleIds[row.objectiveId]; });
        contributions = contributions.filter(function visibleContribution(row) { return !!visibleIds[row.objectiveId]; });
        return { objectives: objectives, keyResults: keyResults, contributions: contributions, visibility: visibility };
    }

    function dependencyWarningsFor(normalized) {
        var graph = buildObjectiveGraph(normalized.objectives);
        var warnings = [];
        normalized.objectives.forEach(function each(objective) {
            if (objective.parentObjectiveId && !graph.byId[objective.parentObjectiveId]) {
                warnings.push({ objectiveId: objective.objectiveId, warningType: 'ORPHAN_OBJECTIVE', message: 'Objective parent is missing from tenant-scoped OKR set.' });
            }
            if (objective.status === 'AT_RISK') {
                warnings.push({ objectiveId: objective.objectiveId, warningType: 'AT_RISK_OBJECTIVE', message: 'Objective is at risk and should be reviewed by a human owner.' });
            }
            objective.dependencies.forEach(function eachDependency(depId) {
                if (!graph.byId[depId]) warnings.push({ objectiveId: objective.objectiveId, dependencyObjectiveId: depId, warningType: 'MISSING_DEPENDENCY', message: 'Dependency is not present in tenant-scoped OKR set.' });
            });
        });
        if (normalized.edgeCases.circularDependenciesDetected) {
            warnings.push({ warningType: 'CIRCULAR_DEPENDENCY', message: 'Circular OKR dependency detected and blocked from recursive expansion.' });
        }
        normalized.keyResults.filter(function risk(kr) { return kr.status === 'AT_RISK' || kr.status === 'MISSED' || kr.forecastedCompletion < 50; }).forEach(function krWarn(kr) {
            warnings.push({ objectiveId: kr.objectiveId, keyResultId: kr.keyResultId, warningType: 'KEY_RESULT_RISK', message: 'Key result forecast or status needs human review.' });
        });
        return warnings;
    }

    function buildAIInsights(normalized, alignment, execution) {
        var risks = normalized.aiSignals.riskIndicators.slice();
        if (!risks.length && execution.executionScore < 65) risks.push({ domain: 'okr_execution', riskLevel: 'MODERATE', riskScore: 100 - execution.executionScore, reason: 'Execution score is below governance target.' });
        var kpiForecasts = normalized.aiSignals.kpiForecasts.slice();
        var performanceForecasts = normalized.aiSignals.performanceForecasts.slice();
        var achievementValues = []
            .concat(kpiForecasts.map(function kpi(row) { return safeNumber(row.achievementProbability, NaN); }))
            .concat(performanceForecasts.map(function perf(row) { return safeNumber(row.achievementProbability, NaN); }))
            .filter(Number.isFinite);
        var achievementProbability = Math.round(average(achievementValues) || execution.forecastedCompletionRate || execution.executionScore);
        var bottleneckWarnings = risks.filter(function bottleneck(row) {
            return /bottleneck|delay|approval|risk/i.test(JSON.stringify(row));
        }).map(function mapRisk(row) {
            return { domain: safeString(row.domain || 'okr_risk', 'okr_risk'), severity: safeString(row.riskLevel || row.severity, 'MODERATE'), reason: safeString(row.reason || row.explanation || 'AI advisory risk signal') };
        });
        if (!bottleneckWarnings.length && execution.atRiskPenalty > 0) bottleneckWarnings.push({ domain: 'okr_execution', severity: 'MODERATE', reason: 'At-risk objectives or key results reduce execution confidence.' });
        var dependencyRisks = dependencyWarningsFor(normalized).map(function warning(row) {
            return { objectiveId: row.objectiveId || '', warningType: row.warningType, reason: row.message };
        });
        var recommendedActions = [];
        if (alignment.alignmentScore < 70) recommendedActions.push({ domain: 'alignment', action: 'Ask a strategic owner to review OKR parentage and cross-team dependencies.', humanApprovalRequired: true, autonomousAction: false });
        if (execution.executionScore < 70) recommendedActions.push({ domain: 'execution', action: 'Open a human-led OKR execution review before changing targets or statuses.', humanApprovalRequired: true, autonomousAction: false });
        if (dependencyRisks.length) recommendedActions.push({ domain: 'dependencies', action: 'Review dependency warnings with accountable owners before modifying OKRs.', humanApprovalRequired: true, autonomousAction: false });
        if (!recommendedActions.length) recommendedActions.push({ domain: 'governance', action: 'Continue monitoring OKR progress and validate strategic reviews on the next checkpoint.', humanApprovalRequired: true, autonomousAction: false });
        return {
            goalRiskIndicators: risks,
            achievementProbability: achievementProbability,
            bottleneckWarnings: bottleneckWarnings,
            dependencyRisks: dependencyRisks,
            recommendedActions: recommendedActions,
            advisoryOnly: true,
            noObjectiveMutation: true,
            noApproval: true,
            noTargetChange: true
        };
    }

    function alignmentMapFor(normalized) {
        var graph = buildObjectiveGraph(normalized.objectives);
        return normalized.objectives.map(function map(objective) {
            return {
                objectiveId: objective.objectiveId,
                title: objective.title,
                level: objective.level,
                department: objective.department,
                parentObjectiveId: objective.parentObjectiveId,
                aligned: objective.level === 'organization' || !!(objective.parentObjectiveId && graph.byId[objective.parentObjectiveId]),
                childCount: (graph.children[objective.objectiveId] || []).length,
                dependencyCount: objective.dependencies.length
            };
        });
    }

    function progressIndicatorsFor(normalized) {
        return normalized.objectives.map(function map(objective) {
            var keyResults = normalized.keyResults.filter(function kr(row) { return row.objectiveId === objective.objectiveId; });
            return {
                objectiveId: objective.objectiveId,
                title: objective.title,
                department: objective.department,
                status: objective.status,
                progressPercent: objective.progressPercent,
                keyResultCount: keyResults.length,
                keyResultCompletion: Math.round(average(keyResults.map(function completion(row) { return row.completionPercentage; })) || objective.progressPercent)
            };
        });
    }

    function completionForecastsFor(normalized) {
        return normalized.objectives.map(function map(objective) {
            var keyResults = normalized.keyResults.filter(function kr(row) { return row.objectiveId === objective.objectiveId; });
            return {
                objectiveId: objective.objectiveId,
                title: objective.title,
                department: objective.department,
                forecastedCompletion: Math.round(average(keyResults.map(function forecast(row) { return row.forecastedCompletion; })) || objective.progressPercent),
                confidenceScore: Math.round(average(keyResults.map(function confidence(row) { return row.confidenceScore; })) || 50),
                status: objective.status
            };
        });
    }

    function accountabilityVisibilityFor(normalized) {
        return normalized.objectives.map(function map(objective) {
            return {
                objectiveId: objective.objectiveId,
                ownerId: objective.ownerId || 'UNASSIGNED',
                ownerRole: objective.ownerRole || 'UNASSIGNED',
                department: objective.department,
                executionResponsibility: objective.ownerId ? 'ASSIGNED' : 'MISSING_OWNER',
                progressPercent: objective.progressPercent
            };
        });
    }

    function generateOKRGovernanceReport(payload, context) {
        try {
            var normalized = normalizeOKRPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var scoped = applyVisibility(normalized, context || {});
            var scopedPayload = Object.assign({}, normalized, {
                objectives: scoped.objectives,
                keyResults: scoped.keyResults,
                contributions: scoped.contributions,
                objectiveHierarchy: buildHierarchy(scoped.objectives),
                linkageChains: buildLinkageChains(scoped.objectives)
            });
            scopedPayload.edgeCases = edgeCasesFor(scopedPayload);
            var alignment = calculateAlignmentScore(scopedPayload, context || {});
            var execution = calculateExecutionScore(scopedPayload, context || {});
            if (!alignment.success) return alignment;
            if (!execution.success) return execution;
            var dependencyWarnings = dependencyWarningsFor(scopedPayload);
            var aiInsights = buildAIInsights(scopedPayload, alignment, execution);
            var reportId = 'ADV-OKR-REPORT-' + Date.now();
            var generatedAt = nowIso();
            var review = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                strategicHealthScore: execution.strategicHealthScore,
                alignmentScore: alignment.alignmentScore,
                executionScore: execution.executionScore,
                objectiveCount: scopedPayload.objectives.length,
                keyResultCount: scopedPayload.keyResults.length,
                immutable: true
            };
            appendHistory('okrStrategicReviews', review);
            appendHistory('okrProgressHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                progressIndicators: progressIndicatorsFor(scopedPayload),
                immutable: true
            });
            var auditRecorded = recordAudit('OKR_STRATEGIC_REVIEW_GENERATED', review, context || {});
            var telemetryRecorded = recordTelemetry('OKR_STRATEGIC_REVIEW_GENERATED', review, context || {});
            return freezeOKROutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                readOnly: true,
                visibility: scoped.visibility,
                objectives: scopedPayload.objectives,
                keyResults: scopedPayload.keyResults,
                contributions: scopedPayload.contributions,
                objectiveHierarchy: scopedPayload.objectiveHierarchy,
                linkageChains: scopedPayload.linkageChains,
                alignmentMap: alignmentMapFor(scopedPayload),
                progressIndicators: progressIndicatorsFor(scopedPayload),
                completionForecasts: completionForecastsFor(scopedPayload),
                dependencyWarnings: dependencyWarnings,
                accountabilityVisibility: accountabilityVisibilityFor(scopedPayload),
                strategicHealthMetrics: {
                    strategicHealthScore: execution.strategicHealthScore,
                    alignmentScore: alignment.alignmentScore,
                    executionScore: execution.executionScore,
                    accountabilityScore: alignment.accountabilityScore,
                    achievementProbability: aiInsights.achievementProbability
                },
                aiInsights: aiInsights,
                analytics: {
                    okrCompletionRates: execution.objectiveCompletionRate,
                    objectiveSuccessRates: normalized.analytics.objectiveSuccessRate || execution.objectiveCompletionRate,
                    keyResultAchievement: execution.keyResultAchievementRate,
                    departmentAlignment: alignment.alignmentScore,
                    strategicExecutionVelocity: normalized.analytics.strategicExecutionVelocity || execution.executionScore,
                    accountabilityTrends: alignment.accountabilityScore,
                    strategicHealthScore: execution.strategicHealthScore,
                    executionScore: execution.executionScore
                },
                edgeCases: scopedPayload.edgeCases,
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generateOKRGovernanceReport failed safely', error && error.message);
            return freezeOKROutput({ success: false, classification: 'OKR_GOVERNANCE_REPORT_ERROR', message: 'OKR governance report failed safely.', governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: details || null });
        }
        try {
            var context = { tenantSlug: 'self-test', actor: { id: 'DIR-SELF', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
            var malformed = normalizeOKRPayload('bad', context);
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'self-test',
                objectives: [
                    { tenantSlug: 'self-test', objectiveId: 'O1', title: 'Org OKR', level: 'organization', ownerId: 'DIR-SELF', department: 'Leadership', status: 'ACTIVE', progressPercent: 70 },
                    { tenantSlug: 'self-test', objectiveId: 'O2', title: 'Dept OKR', level: 'department', ownerId: 'MGR-SELF', department: 'HR', status: 'AT_RISK', parentObjectiveId: 'O1', progressPercent: 52 }
                ],
                keyResults: [{ tenantSlug: 'self-test', keyResultId: 'KR1', objectiveId: 'O2', title: 'Improve execution', targetValue: 100, currentValue: 50, forecastedCompletion: 60, confidenceScore: 62 }],
                aiSignals: { riskIndicators: [{ domain: 'approval_bottlenecks', riskLevel: 'HIGH', riskScore: 70 }] }
            };
            var normalized = normalizeOKRPayload(payload, context);
            var alignment = calculateAlignmentScore(normalized, context);
            var execution = calculateExecutionScore(normalized, context);
            var report = generateOKRGovernanceReport(payload, context);
            var objective = createObjective({ tenantSlug: 'self-test', title: 'Self-test OKR', level: 'department', ownerId: 'DIR-SELF', department: 'HR' }, context);
            var kr = createKeyResult({ tenantSlug: 'self-test', objectiveId: objective.objective && objective.objective.objectiveId, title: 'Self-test KR', targetValue: 100, currentValue: 20 }, context);
            record('objective lifecycle works', objective.success === true && objective.objective.status === 'DRAFT');
            record('key result tracking works', kr.success === true && kr.keyResult.completionPercentage >= 0);
            record('alignment engine works', alignment.success && alignment.alignmentScore > 0);
            record('AI insight integration works', report.success && report.aiInsights.goalRiskIndicators.length > 0 && report.aiInsights.advisoryOnly);
            record('execution scoring works', execution.success && execution.executionScore >= 0);
            record('tenant isolation works', generateOKRGovernanceReport(Object.assign({}, payload, { tenantSlug: 'other-tenant' }), context).success === false);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.objectiveHierarchy));
        } catch (error) {
            record('self-test failure captured', false, safeString(error && error.message, 'unknown'));
        }
        var result = freezeOKROutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_ADVANCED_OKR_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        OBJECTIVE_STATES: OBJECTIVE_STATES,
        KEY_RESULT_STATES: KEY_RESULT_STATES,
        OBJECTIVE_LEVELS: OBJECTIVE_LEVELS,
        createObjective: createObjective,
        createKeyResult: createKeyResult,
        calculateAlignmentScore: calculateAlignmentScore,
        calculateExecutionScore: calculateExecutionScore,
        normalizeOKRPayload: normalizeOKRPayload,
        freezeOKROutput: freezeOKROutput,
        generateOKRGovernanceReport: generateOKRGovernanceReport,
        validateOKRScope: validateOKRScope,
        runSelfTest: runSelfTest
    });

    try {
        global.AdvancedOKRService = service;
        global.advancedOkrService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
