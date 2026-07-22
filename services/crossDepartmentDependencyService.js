/**
 * crossDepartmentDependencyService.js
 * ARTHHRMS - Cross-Department Dependency Intelligence + Strategic Execution Relationship Engine
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware dependency mapping across departments,
 * teams, deliverables, objectives, key results, projects, approvals, and
 * operational workstreams. The service is read-heavy and governance-safe:
 * it analyzes, maps, scores, forecasts, and explains dependency risk without
 * modifying workflows, ownership, execution plans, or approvals.
 *
 * AI SAFETY:
 * AI output is advisory only. This service never lets AI modify dependencies,
 * change ownership, alter execution plans, bypass governance, or trigger
 * autonomous interventions.
 *
 * @version 1.0.0
 */
(function attachCrossDepartmentDependencyService(global) {
    'use strict';

    var PREFIX = '[CrossDepartmentDependencyService]';
    var MAX_ROWS = 1200;
    var MAX_HISTORY = 500;

    var DEPENDENCY_STATES = Object.freeze(['NOT_STARTED', 'ACTIVE', 'BLOCKED', 'DELAYED', 'AT_RISK', 'COMPLETED', 'ARCHIVED']);
    var DEPENDENCY_TYPES = Object.freeze(['department', 'team', 'deliverable', 'objective', 'key_result', 'project', 'approval', 'operational']);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|compensation|ctc|leave.?balance|leaveBalance|payslip|gross|net|basic|hra|pf|tds|bank|tax|password|secret|token|jwt|authorization|private.?key|service.?role|signed.?url|download.?url|storage.?path|file.?path|raw.?payload|rawPayload|raw.?content|payload|body|document|confidentialNote|confidentialEmployeeRecord|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|private chain|raw tenant data)\s*[:=]?\s*[\w,.\- ]*/ig;

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

    function sameTenant(row, tenantSlug) {
        var rowScope = rowTenant(row);
        return !tenantSlug || !rowScope || rowScope === tenantSlug;
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

    function freezeDependencyOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            strategicGovernancePreserved: true,
            rbacAuthoritative: true,
            existingWorkflowsPreserved: true,
            noWorkflowModification: true,
            noAutonomousInterventions: true,
            noGovernanceBypass: true,
            noCrossTenantLeakage: true,
            aiAdvisoryOnly: true,
            noAutonomousModifications: true,
            noDependencyMutationByAI: true,
            noOwnershipChange: true,
            noExecutionPlanMutation: true,
            noApprovalChainMutation: true,
            explainableRecommendationsOnly: true,
            immutableDependencyHistory: true,
            immutableGraphHistory: true,
            immutableAnalytics: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            strategicDependencyIntegrated: !!(global.StrategicDependencyService || global.strategicDependencyService),
            advancedOkrIntegrated: !!(global.AdvancedOKRService || global.advancedOkrService),
            aiRiskPredictionIntegrated: !!(global.AIRiskPredictionService || global.aiRiskPredictionService),
            aiKpiForecastingIntegrated: !!(global.AIKPIForecastingService || global.aiKpiForecastingService),
            smartEscalationPredictionIntegrated: !!(global.SmartEscalationPredictionService || global.smartEscalationPredictionService),
            organizationPerformanceForecastingIntegrated: !!(global.OrganizationPerformanceForecastingService || global.organizationPerformanceForecastingService),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!(global.AuditService || global.auditService) && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService) && !(context && context.skipTelemetry)
        };
    }

    function visibilityForContext(context) {
        var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'STRATEGIC_DEPENDENCY_VISIBILITY', role: role };
        if (role === 'HR') return { scope: 'WORKFORCE_DEPENDENCY_VISIBILITY', role: role, department: actorDepartment(context) || 'HR' };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_DEPENDENCY_VISIBILITY', role: role, department: actorDepartment(context), actorId: actorId(context) };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_GOVERNANCE_VISIBILITY_ONLY', role: role };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_VISIBILITY_ONLY', role: role };
        return { scope: 'ASSIGNED_DEPENDENCY_VISIBILITY', role: role, department: actorDepartment(context), actorId: actorId(context) };
    }

    function normalizeDependencyType(value) {
        var raw = safeString(value || 'operational', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (/depart/.test(raw)) return 'department';
        if (/team/.test(raw)) return 'team';
        if (/deliver/.test(raw)) return 'deliverable';
        if (/object|okr/.test(raw)) return 'objective';
        if (/key.?result|kr/.test(raw)) return 'key_result';
        if (/project/.test(raw)) return 'project';
        if (/approval/.test(raw)) return 'approval';
        if (DEPENDENCY_TYPES.indexOf(raw) !== -1) return raw;
        return 'operational';
    }

    function normalizeDependencyState(value) {
        var state = normalizeToken(value || '', 'ACTIVE');
        if (state === 'WAITING' || state === 'PENDING') return 'NOT_STARTED';
        if (state === 'IN_PROGRESS' || state === 'OPEN') return 'ACTIVE';
        if (state === 'RISK' || state === 'HIGH_RISK') return 'AT_RISK';
        if (state === 'DONE' || state === 'RESOLVED' || state === 'ACHIEVED') return 'COMPLETED';
        return DEPENDENCY_STATES.indexOf(state) !== -1 ? state : 'ACTIVE';
    }

    function dependencyIdOf(row, index) {
        return safeString(row && (row.dependencyId || row.id || row.dependency_id || row.relationshipId || row.linkId), '') || ('DEP-' + (index + 1));
    }

    function normalizeDependencyRow(row, index, tenantSlug) {
        var sourceDepartment = safeString(row && (row.sourceDepartment || row.fromDepartment || row.department || row.ownerDepartment), '').trim();
        var targetDepartment = safeString(row && (row.targetDepartment || row.toDepartment || row.blockingDepartment || row.dependentDepartment), '').trim();
        var sourceId = safeString(row && (row.sourceId || row.fromId || row.fromObjectiveId || row.deliverableId || row.objectiveId || row.projectId || sourceDepartment), '').trim();
        var targetId = safeString(row && (row.targetId || row.toId || row.toObjectiveId || row.dependsOnDeliverableId || row.dependsOnObjectiveId || row.blockingId || targetDepartment), '').trim();
        return {
            tenantSlug: tenantSlug,
            dependencyId: dependencyIdOf(row, index),
            dependencyType: normalizeDependencyType(row && (row.dependencyType || row.type || row.category)),
            sourceId: sourceId,
            targetId: targetId,
            sourceDepartment: sourceDepartment || sourceId || 'General',
            targetDepartment: targetDepartment || targetId || 'General',
            ownerId: safeString(row && (row.ownerId || row.ownerEmpId || row.strategicOwnerId || row.managerId), '').trim(),
            assigneeId: safeString(row && (row.assigneeId || row.empId || row.employeeId || row.contributorId || row.reviewerId), '').trim(),
            state: normalizeDependencyState(row && (row.state || row.status || row.governanceState)),
            progressPercent: clamp(row && (row.progressPercent || row.completionPercent || row.completionRate || row.currentValue), 0, 100),
            delayDays: Math.max(0, safeNumber(row && (row.delayDays || row.daysDelayed || row.overdueDays), 0)),
            blockerCount: Math.max(0, safeNumber(row && (row.blockerCount || row.blockedCount || row.blockageCount), 0)),
            critical: !!(row && (row.critical || row.isCritical || row.priority === 'CRITICAL')),
            dueDate: safeString(row && (row.dueDate || row.deadlineDate || row.targetDate), ''),
            kpiId: safeString(row && row.kpiId, ''),
            objectiveId: safeString(row && row.objectiveId, ''),
            keyResultId: safeString(row && (row.keyResultId || row.krId), ''),
            projectId: safeString(row && row.projectId, ''),
            approvalId: safeString(row && row.approvalId, ''),
            metadata: cloneSanitized(row && row.metadata || {})
        };
    }

    function normalizeRelationshipRow(row, index, tenantSlug) {
        return {
            tenantSlug: tenantSlug,
            relationshipId: safeString(row && (row.relationshipId || row.id), '') || ('REL-' + (index + 1)),
            fromDependencyId: safeString(row && (row.fromDependencyId || row.fromId || row.sourceDependencyId), '').trim(),
            toDependencyId: safeString(row && (row.toDependencyId || row.toId || row.targetDependencyId), '').trim(),
            relationshipType: normalizeToken(row && (row.relationshipType || row.type), 'LINKED'),
            state: normalizeDependencyState(row && (row.state || row.status || 'ACTIVE'))
        };
    }

    function normalizeExecutionChain(row, index, tenantSlug, visibleIds) {
        var dependencyIds = arrayOf(row && row.dependencyIds, 60).map(function depId(item) { return safeString(item, ''); }).filter(function hasId(item) { return item && (!visibleIds || visibleIds[item]); });
        return {
            tenantSlug: tenantSlug,
            chainId: safeString(row && (row.chainId || row.id), '') || ('CHAIN-' + (index + 1)),
            departmentPath: arrayOf(row && row.departmentPath, 60).map(function dep(item) { return safeString(item, ''); }).filter(Boolean),
            dependencyIds: dependencyIds,
            state: normalizeDependencyState(row && (row.state || row.status || 'ACTIVE')),
            delayDays: Math.max(0, safeNumber(row && (row.delayDays || row.daysDelayed), 0))
        };
    }

    function filterByVisibility(rows, context) {
        var visibility = visibilityForContext(context || {});
        var dept = safeString(visibility.department, '').trim();
        var userId = safeString(visibility.actorId, '').trim();
        if (visibility.scope === 'STRATEGIC_DEPENDENCY_VISIBILITY') return rows.slice();
        if (visibility.scope === 'WORKFORCE_DEPENDENCY_VISIBILITY') {
            return rows.filter(function hrDependency(row) {
                return /hr|people|workforce|employee/i.test(row.sourceDepartment + ' ' + row.targetDepartment + ' ' + row.dependencyType);
            });
        }
        if (visibility.scope === 'DEPARTMENT_DEPENDENCY_VISIBILITY') {
            return rows.filter(function departmentDependency(row) {
                return row.sourceDepartment === dept || row.targetDepartment === dept || row.ownerId === userId || row.assigneeId === userId;
            });
        }
        if (visibility.scope === 'ASSIGNED_DEPENDENCY_VISIBILITY') {
            return rows.filter(function assignedDependency(row) {
                return row.ownerId === userId || row.assigneeId === userId;
            });
        }
        if (visibility.scope === 'PLATFORM_GOVERNANCE_VISIBILITY_ONLY' || visibility.scope === 'INFRASTRUCTURE_VISIBILITY_ONLY') {
            return [];
        }
        return [];
    }

    function validateDependencyScope(payload, context, options) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeDependencyOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant dependency visibility is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
            var mutation = !!(options && options.mutation || payload && payload.dependencyMutation);
            if (mutation && (role === 'PLATFORM_OWNER' || role === 'SUPER_ADMIN')) {
                return freezeDependencyOutput({
                    success: false,
                    allowed: false,
                    classification: role + '_DEPENDENCY_MUTATION_BLOCKED',
                    message: role + ' cannot mutate tenant strategic dependency chains.',
                    visibility: visibilityForContext(context),
                    governance: governanceFlags()
                });
            }
            if (mutation && normalizeDependencyState(payload && payload.state) === 'ARCHIVED') {
                return freezeDependencyOutput({
                    success: false,
                    allowed: false,
                    classification: 'ARCHIVED_DEPENDENCY_MUTATION_BLOCKED',
                    message: 'Archived dependency history cannot be mutated.',
                    visibility: visibilityForContext(context),
                    governance: governanceFlags()
                });
            }
            if (!mutation) {
                return freezeDependencyOutput({
                    success: true,
                    allowed: true,
                    classification: 'DEPENDENCY_SCOPE_ALLOWED',
                    visibility: visibilityForContext(context),
                    governance: governanceFlags()
                });
            }
            var sourceDept = safeString(payload && (payload.sourceDepartment || payload.fromDepartment), '').trim();
            var targetDept = safeString(payload && (payload.targetDepartment || payload.toDepartment), '').trim();
            var dept = actorDepartment(context || {});
            var userId = actorId(context || {});
            var owner = safeString(payload && (payload.ownerId || payload.assigneeId), '');
            if (role === 'DIRECTOR' || role === 'HR_HEAD') {
                return freezeDependencyOutput({ success: true, allowed: true, classification: 'DEPENDENCY_MUTATION_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'HR' && (/hr|people|workforce|employee/i.test(sourceDept + ' ' + targetDept + ' ' + normalizeDependencyType(payload && payload.dependencyType)))) {
                return freezeDependencyOutput({ success: true, allowed: true, classification: 'HR_DEPENDENCY_MUTATION_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'MANAGER' && (sourceDept === dept || targetDept === dept || owner === userId)) {
                return freezeDependencyOutput({ success: true, allowed: true, classification: 'MANAGER_DEPENDENCY_MUTATION_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'EMPLOYEE' && owner === userId && (!sourceDept || sourceDept === dept) && (!targetDept || targetDept === dept)) {
                return freezeDependencyOutput({ success: true, allowed: true, classification: 'ASSIGNED_DEPENDENCY_MUTATION_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            return freezeDependencyOutput({
                success: false,
                allowed: false,
                classification: 'UNAUTHORIZED_DEPENDENCY_MUTATION_BLOCKED',
                message: 'Dependency mutation is blocked by role and scope governance.',
                visibility: visibilityForContext(context),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validateDependencyScope failed safely', error && error.message);
            return freezeDependencyOutput({ success: false, allowed: false, classification: 'DEPENDENCY_SCOPE_ERROR', message: 'Dependency scope validation failed safely.', governance: governanceFlags() });
        }
    }

    function mapDbRowsToDependencies(data, tenantSlug) {
        var rows = [];
        arrayOf(data && data.crossDepartmentDependencies).forEach(function addCross(row) { rows.push(row); });
        arrayOf(data && data.deliverableDependencies).forEach(function addDeliverable(row) { rows.push(row); });
        arrayOf(data && data.okrDependencies).forEach(function addOkr(row) { rows.push(row); });
        arrayOf(data && data.strategicDeliverables).forEach(function addDeliverableDependency(row) {
            var deps = arrayOf(row && (row.dependencies || row.dependsOn || row.dependencyIds), 20);
            deps.forEach(function addDep(depId, index) {
                rows.push({
                    tenantSlug: row.tenantSlug,
                    dependencyId: safeString(row.deliverableId || row.id, 'DEL') + '-DEP-' + (index + 1),
                    dependencyType: 'deliverable',
                    sourceId: row.deliverableId || row.id,
                    targetId: depId,
                    sourceDepartment: row.department || row.ownerDepartment,
                    targetDepartment: row.targetDepartment || 'Upstream',
                    ownerId: row.strategicOwnerId || row.ownerId || row.reviewerId,
                    assigneeId: row.empId || row.assigneeId,
                    state: row.governanceState || row.status,
                    progressPercent: row.progressPercent,
                    dueDate: row.deadlineDate,
                    kpiId: row.kpiId
                });
            });
        });
        return rows.filter(function inTenant(row) { return sameTenant(row, tenantSlug); });
    }

    function detectCyclesFromEdges(edges) {
        var adjacency = {};
        edges.forEach(function addEdge(edge) {
            if (!edge.fromDependencyId || !edge.toDependencyId) return;
            adjacency[edge.fromDependencyId] = adjacency[edge.fromDependencyId] || [];
            adjacency[edge.fromDependencyId].push(edge.toDependencyId);
        });
        var visiting = {};
        var visited = {};
        var cycles = [];
        function visit(node, stack) {
            if (visiting[node]) {
                var start = stack.indexOf(node);
                cycles.push((start >= 0 ? stack.slice(start) : stack).concat(node));
                return;
            }
            if (visited[node]) return;
            visiting[node] = true;
            (adjacency[node] || []).forEach(function next(target) {
                visit(target, stack.concat(node));
            });
            visiting[node] = false;
            visited[node] = true;
        }
        Object.keys(adjacency).forEach(function eachNode(node) { visit(node, []); });
        return cycles;
    }

    function buildGraphs(dependencies, relationships, chains) {
        var dependencyIds = {};
        dependencies.forEach(function collect(row) { dependencyIds[row.dependencyId] = true; });
        var edges = relationships.filter(function validRelationship(row) {
            return row.fromDependencyId && row.toDependencyId && dependencyIds[row.fromDependencyId] && dependencyIds[row.toDependencyId];
        });
        if (!edges.length) {
            dependencies.forEach(function fallbackEdge(row) {
                var upstreamIds = arrayOf(row.upstreamDependencyIds || row.dependsOnDependencyIds, 20);
                upstreamIds.forEach(function eachUpstream(upstreamId) {
                    if (dependencyIds[upstreamId]) {
                        edges.push({
                            tenantSlug: row.tenantSlug,
                            relationshipId: upstreamId + '-' + row.dependencyId,
                            fromDependencyId: upstreamId,
                            toDependencyId: row.dependencyId,
                            relationshipType: 'UPSTREAM',
                            state: row.state
                        });
                    }
                });
            });
        }
        var departments = {};
        var departmentEdges = [];
        dependencies.forEach(function collectDepartment(row) {
            departments[row.sourceDepartment || 'General'] = true;
            departments[row.targetDepartment || 'General'] = true;
            if ((row.sourceDepartment || 'General') !== (row.targetDepartment || 'General')) {
                departmentEdges.push({
                    fromDepartment: row.sourceDepartment || 'General',
                    toDepartment: row.targetDepartment || 'General',
                    dependencyId: row.dependencyId,
                    state: row.state,
                    delayDays: row.delayDays
                });
            }
        });
        var graphChains = chains.slice();
        if (!graphChains.length && edges.length) {
            graphChains.push({
                chainId: 'CHAIN-DERIVED-1',
                departmentPath: departmentEdges.slice(0, 8).map(function dep(row) { return row.fromDepartment; }).concat(departmentEdges.length ? departmentEdges[departmentEdges.length - 1].toDepartment : []),
                dependencyIds: edges.map(function edgeId(row) { return row.fromDependencyId; }).concat(edges.length ? edges[edges.length - 1].toDependencyId : []).filter(Boolean),
                state: dependencies.some(function blocked(row) { return /BLOCKED|DELAYED|AT_RISK/.test(row.state); }) ? 'BLOCKED' : 'ACTIVE',
                delayDays: dependencies.reduce(function total(acc, row) { return acc + (row.delayDays || 0); }, 0)
            });
        }
        return {
            dependencyGraph: {
                nodes: dependencies.map(function node(row) {
                    return {
                        dependencyId: row.dependencyId,
                        dependencyType: row.dependencyType,
                        state: row.state,
                        sourceDepartment: row.sourceDepartment,
                        targetDepartment: row.targetDepartment,
                        progressPercent: row.progressPercent
                    };
                }),
                edges: edges.map(function edge(row) {
                    return {
                        fromDependencyId: row.fromDependencyId,
                        toDependencyId: row.toDependencyId,
                        relationshipType: row.relationshipType,
                        state: row.state
                    };
                })
            },
            relationshipGraph: {
                nodes: Object.keys(departments).map(function dept(name) { return { department: name }; }),
                edges: departmentEdges
            },
            executionGraph: {
                chains: graphChains
            }
        };
    }

    function edgeCasesFor(dependencies, relationships, chains) {
        var ids = {};
        dependencies.forEach(function collect(row) { ids[row.dependencyId] = true; });
        var cycles = detectCyclesFromEdges(relationships);
        var orphanDependencies = dependencies.filter(function orphan(row) {
            return !row.sourceId || !row.targetId || !row.sourceDepartment || !row.targetDepartment;
        });
        var missingOwnership = dependencies.filter(function missing(row) {
            return !row.ownerId && !row.assigneeId;
        });
        var brokenRelationships = relationships.filter(function broken(row) {
            return !ids[row.fromDependencyId] || !ids[row.toDependencyId];
        });
        var brokenExecutionChains = chains.filter(function brokenChain(row) {
            return arrayOf(row.dependencyIds).some(function missing(depId) { return !ids[depId]; });
        });
        return {
            circularDependenciesDetected: cycles.length > 0,
            circularDependencyChains: cycles,
            orphanDependenciesDetected: orphanDependencies.length > 0,
            orphanDependencies: orphanDependencies.map(function id(row) { return row.dependencyId; }),
            missingOwnershipDetected: missingOwnership.length > 0,
            missingOwnership: missingOwnership.map(function id(row) { return row.dependencyId; }),
            brokenExecutionChainsDetected: brokenExecutionChains.length > 0,
            brokenRelationshipsDetected: brokenRelationships.length > 0
        };
    }

    function warningsFor(edgeCases, dependencies) {
        var warnings = [];
        if (edgeCases.circularDependenciesDetected) warnings.push({ warningCode: 'CIRCULAR_DEPENDENCY_DETECTED', severity: 'CRITICAL', message: 'Circular dependency chains require human review.' });
        if (edgeCases.orphanDependenciesDetected) warnings.push({ warningCode: 'ORPHAN_DEPENDENCY_DETECTED', severity: 'HIGH', message: 'Dependencies with missing source or target are present.' });
        if (edgeCases.missingOwnershipDetected) warnings.push({ warningCode: 'MISSING_DEPENDENCY_OWNERSHIP', severity: 'HIGH', message: 'One or more dependencies have no owner or assignee.' });
        if (edgeCases.brokenExecutionChainsDetected || edgeCases.brokenRelationshipsDetected) warnings.push({ warningCode: 'BROKEN_EXECUTION_CHAIN', severity: 'HIGH', message: 'Relationship or execution chain references are incomplete.' });
        dependencies.filter(function blocked(row) { return /BLOCKED|DELAYED|AT_RISK/.test(row.state); }).slice(0, 8).forEach(function addBlocked(row) {
            warnings.push({ warningCode: row.state + '_DEPENDENCY', severity: row.state === 'BLOCKED' ? 'HIGH' : 'MODERATE', dependencyId: row.dependencyId, message: row.sourceDepartment + ' to ' + row.targetDepartment + ' requires review.' });
        });
        return warnings;
    }

    function normalizeDependencyPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeDependencyOutput({
                    success: false,
                    classification: 'MALFORMED_DEPENDENCY_PAYLOAD',
                    message: 'Dependency payload must be an object.',
                    failures: [{ failureCode: 'MALFORMED_DEPENDENCY_PAYLOAD' }],
                    governance: governanceFlags()
                });
            }
            var data = rawData();
            var tenantSlug = resolveTenant(payload, context, data);
            var ctxTenant = contextTenant(context || {});
            if (tenantSlug && ctxTenant && tenantSlug !== ctxTenant) {
                return freezeDependencyOutput({
                    success: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant dependency intelligence is blocked.',
                    tenantSlug: tenantSlug,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var payloadRows = arrayOf(payload.dependencies, MAX_ROWS);
            var sourceRows = payloadRows.length ? payloadRows : mapDbRowsToDependencies(data, tenantSlug);
            var dependencies = sourceRows.filter(function tenantDependency(row) {
                return sameTenant(row, tenantSlug);
            }).map(function normalize(row, index) {
                return normalizeDependencyRow(row, index, tenantSlug);
            });
            dependencies = filterByVisibility(dependencies, context || {});
            var dependencyIdSet = {};
            dependencies.forEach(function collectId(row) { dependencyIdSet[row.dependencyId] = true; });
            var relationships = arrayOf(payload.relationships, MAX_ROWS).filter(function tenantRelationship(row) {
                return sameTenant(row, tenantSlug);
            }).map(function normalizeRel(row, index) {
                return normalizeRelationshipRow(row, index, tenantSlug);
            }).filter(function visibleRelationship(row) {
                return dependencyIdSet[row.fromDependencyId] && dependencyIdSet[row.toDependencyId];
            });
            var chains = arrayOf(payload.executionChains, MAX_ROWS).filter(function tenantChain(row) {
                return sameTenant(row, tenantSlug);
            }).map(function normalizeChain(row, index) {
                return normalizeExecutionChain(row, index, tenantSlug, dependencyIdSet);
            }).filter(function hasChain(row) {
                return row.dependencyIds.length || row.departmentPath.length;
            });
            var graphs = buildGraphs(dependencies, relationships, chains);
            var edgeCases = edgeCasesFor(dependencies, relationships, chains);
            var warnings = warningsFor(edgeCases, dependencies);
            return freezeDependencyOutput({
                success: true,
                classification: 'DEPENDENCY_PAYLOAD_NORMALIZED',
                tenantSlug: tenantSlug,
                visibility: visibilityForContext(context || {}),
                dependencies: dependencies,
                relationships: relationships,
                executionChains: chains,
                dependencyGraph: graphs.dependencyGraph,
                relationshipGraph: graphs.relationshipGraph,
                executionGraph: graphs.executionGraph,
                edgeCases: edgeCases,
                dependencyWarnings: warnings,
                analytics: cloneSanitized(payload.analytics || {}),
                aiSignals: cloneSanitized(payload.aiSignals || {}),
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('normalizeDependencyPayload failed safely', error && error.message);
            return freezeDependencyOutput({
                success: false,
                classification: 'DEPENDENCY_NORMALIZATION_ERROR',
                message: 'Dependency payload normalization failed safely.',
                governance: governanceFlags()
            });
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

    function createDependency(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeDependencyOutput({ success: false, classification: 'MALFORMED_DEPENDENCY_PAYLOAD', message: 'Dependency payload must be an object.', governance: governanceFlags() });
            }
            var scope = validateDependencyScope(payload, context || {}, { mutation: true });
            if (!scope.allowed) {
                return freezeDependencyOutput({
                    success: false,
                    classification: scope.classification || 'DEPENDENCY_CREATE_BLOCKED',
                    message: scope.message || 'Dependency creation blocked by governance.',
                    visibility: scope.visibility,
                    governance: governanceFlags()
                });
            }
            var tenantSlug = resolveTenant(payload, context || {}, rawData());
            var dependency = normalizeDependencyRow(payload, 0, tenantSlug);
            dependency.dependencyId = dependency.dependencyId || ('DEP-' + Date.now());
            dependency.createdAt = nowIso();
            dependency.createdBy = actorId(context || {}) || 'SYSTEM';
            var data = rawData();
            data.crossDepartmentDependencies = arrayOf(data.crossDepartmentDependencies, MAX_HISTORY);
            data.crossDepartmentDependencies.push(cloneSanitized(dependency));
            appendHistory(data, 'dependencyHistory', {
                historyId: 'DH-' + Date.now(),
                tenantSlug: tenantSlug,
                dependencyId: dependency.dependencyId,
                action: 'CREATED',
                actorId: actorId(context || {}) || 'SYSTEM',
                createdAt: dependency.createdAt,
                immutable: true
            });
            saveData(data);
            recordAudit('DEPENDENCY_CREATED', { dependencyId: dependency.dependencyId, dependencyType: dependency.dependencyType, state: dependency.state }, context || {});
            recordTelemetry('DEPENDENCY_CREATED', { dependencyType: dependency.dependencyType, state: dependency.state }, context || {});
            return freezeDependencyOutput({
                success: true,
                classification: 'DEPENDENCY_CREATED',
                dependency: dependency,
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('createDependency failed safely', error && error.message);
            return freezeDependencyOutput({ success: false, classification: 'DEPENDENCY_CREATE_ERROR', message: 'Dependency creation failed safely.', governance: governanceFlags() });
        }
    }

    function buildDependencyGraph(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeDependencyPayload(input, context || {});
            if (!normalized.success) return normalized;
            return freezeDependencyOutput({
                success: true,
                classification: 'DEPENDENCY_GRAPH_BUILT',
                tenantSlug: normalized.tenantSlug,
                dependencyGraph: normalized.dependencyGraph,
                relationshipGraph: normalized.relationshipGraph,
                executionGraph: normalized.executionGraph,
                edgeCases: normalized.edgeCases,
                dependencyWarnings: normalized.dependencyWarnings,
                visibility: normalized.visibility,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('buildDependencyGraph failed safely', error && error.message);
            return freezeDependencyOutput({ success: false, classification: 'DEPENDENCY_GRAPH_ERROR', message: 'Dependency graph generation failed safely.', governance: governanceFlags() });
        }
    }

    function analyzeCriticalPath(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeDependencyPayload(input, context || {});
            if (!normalized.success) return normalized;
            var dependencies = normalized.dependencies || [];
            var blocked = dependencies.filter(function blockedRow(row) { return /BLOCKED|DELAYED|AT_RISK/.test(row.state); });
            var critical = dependencies.filter(function criticalRow(row) {
                return row.critical || /BLOCKED|DELAYED|AT_RISK/.test(row.state) || row.delayDays > 0 || row.blockerCount > 0;
            });
            var departmentCounts = {};
            blocked.forEach(function count(row) {
                departmentCounts[row.sourceDepartment] = (departmentCounts[row.sourceDepartment] || 0) + 1;
                departmentCounts[row.targetDepartment] = (departmentCounts[row.targetDepartment] || 0) + 1;
            });
            var hotspots = Object.keys(departmentCounts).sort(function desc(a, b) { return departmentCounts[b] - departmentCounts[a]; }).map(function toHotspot(department) {
                return { department: department, bottleneckCount: departmentCounts[department], severity: departmentCounts[department] > 2 ? 'HIGH' : 'MODERATE' };
            });
            var blockingChains = (normalized.executionGraph && normalized.executionGraph.chains || []).filter(function chain(row) {
                return /BLOCKED|DELAYED|AT_RISK/.test(row.state) || row.delayDays > 0 || arrayOf(row.dependencyIds).some(function hasBlocked(depId) {
                    return blocked.some(function match(item) { return item.dependencyId === depId; });
                });
            });
            var delayLoad = dependencies.reduce(function sum(acc, row) { return acc + (row.delayDays || 0) + (row.blockerCount || 0) * 2; }, 0);
            var bottleneckScore = clamp(Math.round((blocked.length / Math.max(1, dependencies.length)) * 65 + delayLoad * 2 + hotspots.length * 4), 0, 100);
            var criticalPathScore = clamp(Math.round((critical.length / Math.max(1, dependencies.length)) * 55 + blockingChains.length * 12 + delayLoad), 0, 100);
            var executionDependencyScore = clamp(100 - Math.round(bottleneckScore * 0.55 + criticalPathScore * 0.25), 0, 100);
            return freezeDependencyOutput({
                success: true,
                classification: 'CRITICAL_PATH_ANALYZED',
                tenantSlug: normalized.tenantSlug,
                criticalPathScore: criticalPathScore,
                bottleneckScore: bottleneckScore,
                executionDependencyScore: executionDependencyScore,
                criticalDependencies: critical,
                executionBottlenecks: blocked,
                blockingChains: blockingChains,
                delayPropagation: blockingChains.map(function mapChain(row) {
                    return { chainId: row.chainId, departmentPath: row.departmentPath, delayDays: row.delayDays, state: row.state };
                }),
                dependencyHotspots: hotspots,
                dependencyGraph: normalized.dependencyGraph,
                edgeCases: normalized.edgeCases,
                dependencyWarnings: normalized.dependencyWarnings,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('analyzeCriticalPath failed safely', error && error.message);
            return freezeDependencyOutput({ success: false, classification: 'CRITICAL_PATH_ERROR', message: 'Critical path analysis failed safely.', governance: governanceFlags() });
        }
    }

    function calculateDependencyHealth(input, context) {
        try {
            var normalized = input && input.success ? input : normalizeDependencyPayload(input, context || {});
            if (!normalized.success) return normalized;
            var dependencies = normalized.dependencies || [];
            var analytics = normalized.analytics || {};
            var total = dependencies.length;
            var completed = dependencies.filter(function done(row) { return row.state === 'COMPLETED'; }).length;
            var blocked = dependencies.filter(function block(row) { return /BLOCKED|DELAYED|AT_RISK/.test(row.state); }).length;
            var crossDepartment = dependencies.filter(function cross(row) { return row.sourceDepartment !== row.targetDepartment; }).length;
            var completionRate = total ? Math.round((completed / total) * 100) : 0;
            var progressAverage = Math.round(average(dependencies.map(function progress(row) { return safeNumber(row.progressPercent, 0); })));
            var dependencyHealthScore = clamp(Math.round(safeNumber(analytics.strategicDependencyHealth, 0) || (progressAverage * 0.55 + completionRate * 0.25 + (100 - blocked * 12) * 0.2)), 0, 100);
            var executionDependencyScore = clamp(Math.round(100 - (blocked / Math.max(1, total)) * 55 - average(dependencies.map(function delay(row) { return row.delayDays || 0; })) * 2), 0, 100);
            var collaborationScore = clamp(Math.round(safeNumber(analytics.crossTeamCollaborationTrend, 0) || (100 - Math.max(0, blocked - 1) * 9 + Math.min(20, crossDepartment * 3))), 0, 100);
            return freezeDependencyOutput({
                success: true,
                classification: 'DEPENDENCY_HEALTH_CALCULATED',
                tenantSlug: normalized.tenantSlug,
                dependencyHealthScore: dependencyHealthScore,
                executionDependencyScore: executionDependencyScore,
                collaborationScore: collaborationScore,
                dependencyCompletionRates: safeNumber(analytics.dependencyCompletionRate, completionRate),
                bottleneckFrequency: safeNumber(analytics.bottleneckFrequency, blocked),
                blockedDependencyTrends: safeNumber(analytics.blockedDependencyTrend, blocked),
                crossTeamCollaborationTrends: safeNumber(analytics.crossTeamCollaborationTrend, collaborationScore),
                executionChainDelays: safeNumber(analytics.executionChainDelay, average(dependencies.map(function delay(row) { return row.delayDays || 0; }))),
                strategicDependencyHealth: dependencyHealthScore,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateDependencyHealth failed safely', error && error.message);
            return freezeDependencyOutput({ success: false, classification: 'DEPENDENCY_HEALTH_ERROR', message: 'Dependency health calculation failed safely.', governance: governanceFlags() });
        }
    }

    function aiSignalsFromPayload(payload) {
        var signals = payload && payload.aiSignals || {};
        var dependencyRisks = arrayOf(signals.riskPredictions || signals.riskIndicators, 50).map(function risk(row) {
            return {
                domain: row.domain || 'dependency_execution',
                riskLevel: row.riskLevel || row.escalationLevel || 'MODERATE',
                riskScore: clamp(row.riskScore || row.escalationProbability || row.impactScore, 0, 100),
                confidenceScore: clamp(row.confidenceScore || row.forecastConfidence, 0, 100),
                explanation: row.explanation || row.reason || 'Dependency risk is based on blocked or delayed execution signals.'
            };
        });
        var escalationRisks = arrayOf(signals.escalationPredictions, 50).map(function escalation(row) {
            return {
                domain: row.domain || 'dependency_escalation',
                escalationLevel: row.escalationLevel || row.riskLevel || 'MODERATE',
                escalationProbability: clamp(row.escalationProbability || row.riskScore, 0, 100),
                urgencyScore: clamp(row.urgencyScore || row.impactScore, 0, 100),
                explanation: row.explanation || row.reason || 'Escalation risk is based on delay and unresolved dependency signals.'
            };
        });
        var kpiForecasts = arrayOf(signals.kpiForecasts, 50).map(function forecast(row) {
            return {
                domain: row.domain || 'strategic_kpi',
                achievementProbability: clamp(row.achievementProbability || row.forecastedCompletion, 0, 100),
                confidenceScore: clamp(row.forecastConfidence || row.confidenceScore, 0, 100),
                explanation: row.explanation || 'KPI forecast depends on upstream dependency health.'
            };
        });
        var performanceForecasts = arrayOf(signals.performanceForecasts, 50).map(function performance(row) {
            return {
                domain: row.domain || 'department_performance',
                achievementProbability: clamp(row.achievementProbability || row.performanceScore, 0, 100),
                performanceLevel: row.performanceLevel || row.riskLevel || 'ON_TRACK',
                explanation: row.explanation || 'Performance forecast reflects collaboration and execution-chain health.'
            };
        });
        return {
            dependencyRisks: dependencyRisks,
            delayPredictions: escalationRisks,
            bottleneckForecasts: dependencyRisks.filter(function high(row) { return /HIGH|CRITICAL/.test(row.riskLevel); }),
            executionImpactForecasts: kpiForecasts.concat(performanceForecasts),
            recommendedActions: dependencyRisks.concat(escalationRisks).slice(0, 10).map(function action(row) {
                return {
                    domain: row.domain,
                    riskLevel: row.riskLevel || row.escalationLevel || 'MODERATE',
                    action: 'Review dependency with accountable department owners; AI advisory only, no automatic workflow change.',
                    explanation: row.explanation,
                    humanApprovalRequired: true
                };
            }),
            advisoryOnly: true,
            noAutonomousModifications: true
        };
    }

    function generateDependencyIntelligenceReport(payload, context) {
        try {
            var normalized = normalizeDependencyPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var graph = buildDependencyGraph(normalized, context || {});
            var critical = analyzeCriticalPath(normalized, context || {});
            var health = calculateDependencyHealth(normalized, context || {});
            var aiInsights = aiSignalsFromPayload(normalized);
            if (!aiInsights.recommendedActions.length && critical.bottleneckScore > 0) {
                aiInsights.recommendedActions.push({
                    domain: 'critical_path',
                    riskLevel: critical.bottleneckScore > 70 ? 'HIGH' : 'MODERATE',
                    action: 'Review critical path dependencies with human governance owners.',
                    explanation: 'Bottleneck score indicates blocked, delayed, or at-risk cross-department dependencies.',
                    humanApprovalRequired: true
                });
            }
            var report = {
                success: true,
                readOnly: true,
                classification: 'DEPENDENCY_INTELLIGENCE_READY',
                tenantSlug: normalized.tenantSlug,
                visibility: normalized.visibility,
                dependencies: normalized.dependencies,
                relationships: normalized.relationships,
                dependencyGraph: graph.dependencyGraph,
                executionGraph: graph.executionGraph,
                relationshipGraph: graph.relationshipGraph,
                criticalPath: critical,
                bottleneckAnalysis: {
                    bottleneckScore: critical.bottleneckScore,
                    bottleneckHotspots: critical.dependencyHotspots,
                    executionBottlenecks: critical.executionBottlenecks,
                    blockingChains: critical.blockingChains,
                    delayPropagation: critical.delayPropagation
                },
                aiInsights: aiInsights,
                analytics: {
                    dependencyCompletionRates: health.dependencyCompletionRates,
                    bottleneckFrequency: health.bottleneckFrequency,
                    blockedDependencyTrends: health.blockedDependencyTrends,
                    crossTeamCollaborationTrends: health.crossTeamCollaborationTrends,
                    executionChainDelays: health.executionChainDelays,
                    strategicDependencyHealth: health.strategicDependencyHealth,
                    dependencyHealthScore: health.dependencyHealthScore,
                    executionDependencyScore: health.executionDependencyScore,
                    collaborationScore: health.collaborationScore
                },
                dependencyWarnings: normalized.dependencyWarnings,
                edgeCases: normalized.edgeCases,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {}),
                generatedAt: nowIso()
            };
            var data = rawData();
            appendHistory(data, 'dependencyGraphHistory', {
                historyId: 'DGH-' + Date.now(),
                tenantSlug: normalized.tenantSlug,
                edgeCount: graph.dependencyGraph.edges.length,
                nodeCount: graph.dependencyGraph.nodes.length,
                immutable: true,
                createdAt: report.generatedAt
            });
            appendHistory(data, 'dependencyAnalyticsHistory', {
                historyId: 'DAH-' + Date.now(),
                tenantSlug: normalized.tenantSlug,
                dependencyHealthScore: health.dependencyHealthScore,
                executionDependencyScore: health.executionDependencyScore,
                collaborationScore: health.collaborationScore,
                immutable: true,
                createdAt: report.generatedAt
            });
            saveData(data);
            recordAudit('DEPENDENCY_INTELLIGENCE_REVIEWED', {
                dependencyCount: normalized.dependencies.length,
                criticalPathScore: critical.criticalPathScore,
                bottleneckScore: critical.bottleneckScore
            }, context || {});
            recordTelemetry('DEPENDENCY_INTELLIGENCE_REVIEWED', {
                dependencyCount: normalized.dependencies.length,
                bottleneckScore: critical.bottleneckScore
            }, context || {});
            return freezeDependencyOutput(report);
        } catch (error) {
            safeWarn('generateDependencyIntelligenceReport failed safely', error && error.message);
            return freezeDependencyOutput({ success: false, classification: 'DEPENDENCY_INTELLIGENCE_REPORT_ERROR', message: 'Dependency intelligence report failed safely.', governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var context = { tenantSlug: 'self-test', actor: { id: 'DIR', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
        var payload = {
            tenantSlug: 'self-test',
            dependencies: [
                { tenantSlug: 'self-test', dependencyId: 'A', sourceId: 'Leadership', targetId: 'HR', sourceDepartment: 'Leadership', targetDepartment: 'HR', ownerId: 'DIR', state: 'ACTIVE', progressPercent: 80 },
                { tenantSlug: 'self-test', dependencyId: 'B', sourceId: 'HR', targetId: 'Ops', sourceDepartment: 'HR', targetDepartment: 'Operations', ownerId: 'HR', state: 'BLOCKED', progressPercent: 20, delayDays: 3 }
            ],
            relationships: [{ tenantSlug: 'self-test', fromDependencyId: 'A', toDependencyId: 'B' }],
            aiSignals: { riskPredictions: [{ domain: 'dependency', riskLevel: 'HIGH', riskScore: 75, confidenceScore: 70, explanation: 'Blocked downstream dependency.' }] }
        };
        var checks = [];
        function add(name, passed) { checks.push({ name: name, passed: !!passed }); }
        try {
            var malformed = normalizeDependencyPayload('bad', context);
            add('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var normalized = normalizeDependencyPayload(payload, context);
            add('dependency graph works', normalized.success && normalized.dependencyGraph.edges.length === 1);
            var critical = analyzeCriticalPath(payload, context);
            add('critical path analysis works', critical.success && critical.bottleneckScore > 0);
            add('bottleneck detection works', critical.dependencyHotspots.length > 0);
            var report = generateDependencyIntelligenceReport(payload, context);
            add('AI insight integration works', report.success && report.aiInsights.dependencyRisks.length > 0 && report.aiInsights.advisoryOnly);
            add('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.dependencyGraph));
        } catch (error) {
            add('self-test completed without uncaught throw', false);
        }
        var result = freezeDependencyOutput({
            passed: checks.every(function ok(item) { return item.passed; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_CROSS_DEPARTMENT_DEPENDENCY_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        version: '1.0.0',
        DEPENDENCY_STATES: DEPENDENCY_STATES,
        DEPENDENCY_TYPES: DEPENDENCY_TYPES,
        createDependency: createDependency,
        analyzeCriticalPath: analyzeCriticalPath,
        calculateDependencyHealth: calculateDependencyHealth,
        buildDependencyGraph: buildDependencyGraph,
        normalizeDependencyPayload: normalizeDependencyPayload,
        freezeDependencyOutput: freezeDependencyOutput,
        validateDependencyScope: validateDependencyScope,
        generateDependencyIntelligenceReport: generateDependencyIntelligenceReport,
        runSelfTest: runSelfTest
    });

    try {
        global.CrossDepartmentDependencyService = service;
        global.crossDepartmentDependencyService = service;
    } catch (error) {
        safeWarn('Service export failed safely', error && error.message);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
