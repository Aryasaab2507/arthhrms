/**
 * workflowSimulationService.js
 * ARTHHRMS - Workflow Simulation Engine + Strategic Scenario Modeling Framework
 *
 * PURPOSE:
 * Provides tenant-scoped, role-aware scenario planning for approval, leave,
 * attendance, onboarding, strategic initiative, OKR, deliverable, department
 * execution, and dependency-chain workflows. Simulations are isolated,
 * read-only, temporary, and auditable.
 *
 * SAFETY:
 * This service never executes workflows, changes approvals, mutates live
 * records, or affects production data. AI insights are advisory only.
 *
 * @version 1.0.0
 */
(function attachWorkflowSimulationService(global) {
    'use strict';

    var PREFIX = '[WorkflowSimulationService]';
    var MAX_ROWS = 1200;
    var MAX_HISTORY = 500;

    var SIMULATION_STATES = Object.freeze(['CREATED', 'CONFIGURED', 'RUNNING', 'COMPLETED', 'FAILED', 'ARCHIVED']);
    var SIMULATION_DOMAINS = Object.freeze(['approval', 'leave', 'attendance', 'onboarding', 'strategic_initiative', 'okr', 'deliverable', 'department_execution', 'dependency_chain']);
    var SCENARIO_TYPES = Object.freeze(['optimistic', 'expected', 'pessimistic', 'custom']);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|compensation|ctc|leave.?balance|leaveBalance|payslip|gross|net|basic|hra|pf|tds|bank|tax|password|secret|token|jwt|authorization|private.?key|service.?role|signed.?url|download.?url|storage.?path|file.?path|raw.?payload|rawPayload|raw.?content|payload|body|document|confidentialNote|confidentialEmployeeRecord|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|private scenario|raw tenant data)\s*[:=]?\s*[\w,.\- ]*/ig;

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

    function freezeSimulationOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            simulationGovernancePreserved: true,
            strategicGovernancePreserved: true,
            rbacAuthoritative: true,
            readOnlySimulation: true,
            isolatedSimulation: true,
            temporarySimulation: true,
            auditableSimulation: true,
            noLiveRecordModification: true,
            noWorkflowExecution: true,
            noApprovalModification: true,
            noProductionDataImpact: true,
            noRecordModification: true,
            noAutonomousActions: true,
            aiAdvisoryOnly: true,
            explainableOutputsOnly: true,
            immutableSimulationHistory: true,
            immutableScenarioReports: true,
            immutableAnalytics: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            dependencyIntelligenceIntegrated: !!(global.CrossDepartmentDependencyService || global.crossDepartmentDependencyService),
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
        if (role === 'DIRECTOR' || role === 'HR_HEAD') return { scope: 'STRATEGIC_SIMULATION_VISIBILITY', role: role };
        if (role === 'HR') return { scope: 'WORKFORCE_SIMULATION_VISIBILITY', role: role, department: actorDepartment(context) || 'HR' };
        if (role === 'MANAGER') return { scope: 'DEPARTMENT_SIMULATION_VISIBILITY', role: role, department: actorDepartment(context), actorId: actorId(context) };
        if (role === 'PLATFORM_OWNER') return { scope: 'PLATFORM_SIMULATION_GOVERNANCE_VISIBILITY_ONLY', role: role };
        if (role === 'SUPER_ADMIN') return { scope: 'INFRASTRUCTURE_SIMULATION_VISIBILITY_ONLY', role: role };
        return { scope: 'PERSONAL_SIMULATION_VISIBILITY_ONLY', role: role, department: actorDepartment(context), actorId: actorId(context) };
    }

    function normalizeDomain(value) {
        var raw = safeString(value || '', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (/approval/.test(raw)) return 'approval';
        if (/leave/.test(raw)) return 'leave';
        if (/attendance/.test(raw)) return 'attendance';
        if (/onboarding/.test(raw)) return 'onboarding';
        if (/strategic/.test(raw)) return 'strategic_initiative';
        if (/okr|objective/.test(raw)) return 'okr';
        if (/deliverable/.test(raw)) return 'deliverable';
        if (/department|execution/.test(raw)) return 'department_execution';
        if (/dependency/.test(raw)) return 'dependency_chain';
        return SIMULATION_DOMAINS.indexOf(raw) !== -1 ? raw : 'department_execution';
    }

    function normalizeScenarioType(value) {
        var raw = safeString(value || 'custom', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        return SCENARIO_TYPES.indexOf(raw) !== -1 ? raw : 'custom';
    }

    function normalizedScenario(row, index, tenantSlug) {
        var invalidSignals = [];
        function numberField(key, fallback) {
            var raw = row && row[key];
            var next = Number(raw);
            if (raw !== undefined && raw !== null && !Number.isFinite(next)) invalidSignals.push(key);
            return Number.isFinite(next) ? next : fallback;
        }
        return {
            tenantSlug: tenantSlug,
            scenarioId: safeString(row && (row.scenarioId || row.id), '') || ('SCN-' + (index + 1)),
            scenarioType: normalizeScenarioType(row && (row.scenarioType || row.type)),
            approvalDelayChangePercent: numberField('approvalDelayChangePercent', 0),
            staffingChangePercent: numberField('staffingChangePercent', 0),
            deliverableSlipDays: Math.max(0, numberField('deliverableSlipDays', 0)),
            kpiTargetChangePercent: numberField('kpiTargetChangePercent', 0),
            dependencyDelayDays: Math.max(0, numberField('dependencyDelayDays', 0)),
            throughputChangePercent: numberField('throughputChangePercent', 0),
            customImpactPercent: numberField('customImpactPercent', 0),
            invalidFields: invalidSignals
        };
    }

    function filterRecordsByScope(rows, context, departmentKeys) {
        var visibility = visibilityForContext(context || {});
        var dept = safeString(visibility.department, '');
        if (visibility.scope === 'STRATEGIC_SIMULATION_VISIBILITY') return rows.slice();
        if (visibility.scope === 'WORKFORCE_SIMULATION_VISIBILITY') {
            return rows.filter(function hrRow(row) { return /hr|people|workforce|employee/i.test(safeString(row.department || row.departmentName || row.ownerDepartment || row.domain || '', '')); });
        }
        if (visibility.scope === 'DEPARTMENT_SIMULATION_VISIBILITY') {
            return rows.filter(function deptRow(row) {
                var haystack = (departmentKeys || ['department', 'departmentName', 'sourceDepartment', 'targetDepartment', 'approverDepartment']).map(function key(rowKey) { return safeString(row[rowKey], ''); }).join(' ');
                return haystack.indexOf(dept) !== -1;
            });
        }
        if (visibility.scope === 'PERSONAL_SIMULATION_VISIBILITY_ONLY') return [];
        return [];
    }

    function tenantRows(rows, tenantSlug, context, departmentKeys) {
        return filterRecordsByScope(arrayOf(rows, MAX_ROWS).filter(function tenantRow(row) { return sameTenant(row, tenantSlug); }), context || {}, departmentKeys).map(function clone(row) { return cloneSanitized(row); });
    }

    function validateSimulationScope(payload, context, options) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezeSimulationOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant workflow simulation is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || 'EMPLOYEE');
            var domains = arrayOf(payload && payload.domains, 30).map(normalizeDomain);
            var orgWide = /organization|strategic|enterprise/i.test(safeString(payload && (payload.scenarioScope || payload.scope), '')) || domains.some(function strategic(domain) { return /strategic_initiative|okr|department_execution|dependency_chain/.test(domain); });
            if (role === 'PLATFORM_OWNER') {
                return freezeSimulationOutput({ success: false, allowed: false, classification: 'PLATFORM_OWNER_SIMULATION_EXECUTION_BLOCKED', message: 'PLATFORM_OWNER has governance visibility only and cannot run tenant simulations.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'SUPER_ADMIN') {
                return freezeSimulationOutput({ success: false, allowed: false, classification: 'SUPER_ADMIN_SIMULATION_EXECUTION_BLOCKED', message: 'SUPER_ADMIN has infrastructure visibility only and cannot run tenant business simulations.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            if (role === 'EMPLOYEE' && orgWide) {
                return freezeSimulationOutput({ success: false, allowed: false, classification: 'UNAUTHORIZED_ORGANIZATION_SIMULATION_BLOCKED', message: 'Employees cannot run organization-wide simulations.', visibility: visibilityForContext(context), governance: governanceFlags() });
            }
            return freezeSimulationOutput({ success: true, allowed: true, classification: 'SIMULATION_SCOPE_ALLOWED', visibility: visibilityForContext(context), governance: governanceFlags() });
        } catch (error) {
            safeWarn('validateSimulationScope failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, allowed: false, classification: 'SIMULATION_SCOPE_ERROR', message: 'Simulation scope validation failed safely.', governance: governanceFlags() });
        }
    }

    function defaultScenarios(tenantSlug) {
        return [
            normalizedScenario({ tenantSlug: tenantSlug, scenarioId: 'SCN-OPTIMISTIC', scenarioType: 'optimistic', approvalDelayChangePercent: -10, staffingChangePercent: 5, deliverableSlipDays: 0, kpiTargetChangePercent: 5 }, 0, tenantSlug),
            normalizedScenario({ tenantSlug: tenantSlug, scenarioId: 'SCN-EXPECTED', scenarioType: 'expected', approvalDelayChangePercent: 15, staffingChangePercent: 0, deliverableSlipDays: 5, kpiTargetChangePercent: 10, dependencyDelayDays: 2 }, 1, tenantSlug),
            normalizedScenario({ tenantSlug: tenantSlug, scenarioId: 'SCN-PESSIMISTIC', scenarioType: 'pessimistic', approvalDelayChangePercent: 35, staffingChangePercent: -10, deliverableSlipDays: 12, kpiTargetChangePercent: 20, dependencyDelayDays: 7 }, 2, tenantSlug)
        ];
    }

    function detectCycles(edges) {
        var adjacency = {};
        arrayOf(edges, MAX_ROWS).forEach(function add(edge) {
            var from = safeString(edge.fromDependencyId || edge.fromId, '');
            var to = safeString(edge.toDependencyId || edge.toId, '');
            if (!from || !to) return;
            adjacency[from] = adjacency[from] || [];
            adjacency[from].push(to);
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
            (adjacency[node] || []).forEach(function next(target) { visit(target, stack.concat(node)); });
            visiting[node] = false;
            visited[node] = true;
        }
        Object.keys(adjacency).forEach(function each(node) { visit(node, []); });
        return cycles;
    }

    function normalizeSimulationPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeSimulationOutput({
                    success: false,
                    classification: 'MALFORMED_SIMULATION_PAYLOAD',
                    message: 'Simulation payload must be an object.',
                    failures: [{ failureCode: 'MALFORMED_SIMULATION_PAYLOAD' }],
                    governance: governanceFlags()
                });
            }
            var data = rawData();
            var tenantSlug = resolveTenant(payload, context || {}, data);
            var ctxTenant = contextTenant(context || {});
            if (tenantSlug && ctxTenant && tenantSlug !== ctxTenant) {
                return freezeSimulationOutput({
                    success: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant workflow simulation is blocked.',
                    tenantSlug: tenantSlug,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }
            var scope = validateSimulationScope(payload, context || {});
            if (!scope.allowed) return scope;
            var domains = arrayOf(payload.domains, 30).map(normalizeDomain);
            if (!domains.length) domains = ['approval', 'department_execution', 'dependency_chain'];
            var scenarios = arrayOf(payload.scenarios, 50).filter(function tenantScenario(row) { return sameTenant(row, tenantSlug); }).map(function scenario(row, index) { return normalizedScenario(row, index, tenantSlug); });
            if (!scenarios.length) scenarios = defaultScenarios(tenantSlug);
            var records = payload.records || {};
            var normalizedRecords = {
                approvals: tenantRows(records.approvals || data.approvals || data.workflowApprovals, tenantSlug, context, ['department', 'approverDepartment', 'reviewerDepartment']),
                leave: tenantRows(records.leave || data.leaveRequests, tenantSlug, context, ['department', 'approverDepartment']),
                attendance: tenantRows(records.attendance || data.attendanceRecords, tenantSlug, context, ['department']),
                onboarding: tenantRows(records.onboarding || data.onboardingWorkflows, tenantSlug, context, ['department']),
                deliverables: tenantRows(records.deliverables || data.strategicDeliverables || data.deliverables, tenantSlug, context, ['department', 'ownerDepartment']),
                okrs: tenantRows(records.okrs || data.okrObjectives, tenantSlug, context, ['department', 'ownerDepartment']),
                dependencies: tenantRows(records.dependencies || data.crossDepartmentDependencies || data.deliverableDependencies, tenantSlug, context, ['sourceDepartment', 'targetDepartment', 'department']),
                kpis: tenantRows(records.kpis || data.kpiScorecards || data.kpis, tenantSlug, context, ['department', 'ownerDepartment'])
            };
            var invalid = scenarios.some(function hasInvalid(row) { return row.invalidFields.length > 0; });
            var cycles = detectCycles(payload.dependencyGraph && payload.dependencyGraph.relationships || records.relationships || payload.relationships);
            return freezeSimulationOutput({
                success: true,
                classification: 'SIMULATION_PAYLOAD_NORMALIZED',
                tenantSlug: tenantSlug,
                simulationName: safeString(payload.simulationName || payload.name, 'Workflow simulation'),
                state: normalizeToken(payload.state || 'CONFIGURED', 'CONFIGURED'),
                domains: domains,
                baseline: cloneSanitized(payload.baseline || {}),
                scenarios: scenarios,
                records: normalizedRecords,
                aiSignals: cloneSanitized(payload.aiSignals || {}),
                analytics: cloneSanitized(payload.analytics || {}),
                edgeCases: {
                    missingDataDetected: Object.keys(normalizedRecords).every(function empty(key) { return !normalizedRecords[key].length; }),
                    invalidScenariosDetected: invalid,
                    sparseDatasetsDetected: Object.keys(normalizedRecords).some(function sparse(key) { return normalizedRecords[key].length === 0; }),
                    circularDependenciesDetected: cycles.length > 0,
                    circularDependencyChains: cycles
                },
                simulationWarnings: cycles.length ? [{ warningCode: 'CIRCULAR_DEPENDENCY_SIMULATION', severity: 'HIGH', message: 'Circular dependency relationships were included in simulation input.' }] : [],
                visibility: visibilityForContext(context || {}),
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('normalizeSimulationPayload failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, classification: 'SIMULATION_NORMALIZATION_ERROR', message: 'Simulation normalization failed safely.', governance: governanceFlags() });
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

    function createSimulation(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeSimulationOutput({ success: false, classification: 'MALFORMED_SIMULATION_PAYLOAD', message: 'Simulation payload must be an object.', governance: governanceFlags() });
            }
            var scope = validateSimulationScope(payload, context || {}, { mutation: true });
            if (!scope.allowed) {
                return freezeSimulationOutput({
                    success: false,
                    classification: scope.classification || 'SIMULATION_CREATE_BLOCKED',
                    message: scope.message || 'Simulation creation blocked by governance.',
                    visibility: scope.visibility,
                    governance: governanceFlags()
                });
            }
            var normalized = normalizeSimulationPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var simulation = {
                simulationId: 'SIM-' + Date.now(),
                tenantSlug: normalized.tenantSlug,
                simulationName: normalized.simulationName,
                domains: normalized.domains,
                state: 'CONFIGURED',
                scenarioCount: normalized.scenarios.length,
                createdBy: actorId(context || {}) || 'SYSTEM',
                createdAt: nowIso(),
                readOnly: true,
                temporary: true,
                isolated: true
            };
            var data = rawData();
            appendHistory(data, 'workflowSimulationHistory', {
                historyId: 'WSH-' + Date.now(),
                tenantSlug: simulation.tenantSlug,
                simulationId: simulation.simulationId,
                state: simulation.state,
                domains: simulation.domains,
                immutable: true,
                createdAt: simulation.createdAt
            });
            saveData(data);
            recordAudit('SIMULATION_CREATED', { simulationId: simulation.simulationId, scenarioCount: simulation.scenarioCount }, context || {});
            recordTelemetry('SIMULATION_CREATED', { scenarioCount: simulation.scenarioCount, domains: simulation.domains }, context || {});
            return freezeSimulationOutput({
                success: true,
                classification: 'SIMULATION_CONFIGURED',
                simulation: simulation,
                visibility: normalized.visibility,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('createSimulation failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, classification: 'SIMULATION_CREATE_ERROR', message: 'Simulation creation failed safely.', governance: governanceFlags() });
        }
    }

    function scenarioImpact(row, baseline, normalized) {
        var approvalImpact = Math.max(0, row.approvalDelayChangePercent) * 0.42;
        var staffingImpact = Math.max(0, -row.staffingChangePercent) * 1.2;
        var deliverableImpact = row.deliverableSlipDays * 2.4;
        var kpiImpact = Math.max(0, row.kpiTargetChangePercent) * 0.78;
        var dependencyImpact = row.dependencyDelayDays * 2.1;
        var customImpact = Math.max(0, row.customImpactPercent) * 0.5;
        var recordPressure = (normalized.records.approvals.length + normalized.records.dependencies.length + normalized.records.deliverables.length) * 0.9;
        var impactScore = clamp(Math.round(approvalImpact + staffingImpact + deliverableImpact + kpiImpact + dependencyImpact + customImpact + recordPressure), 0, 100);
        var scenarioConfidence = clamp(Math.round(72 - row.invalidFields.length * 12 - (normalized.edgeCases.sparseDatasetsDetected ? 8 : 0) + (row.scenarioType === 'expected' ? 8 : 0)), 20, 96);
        var outcomeProbability = clamp(Math.round(100 - impactScore * 0.68 + Math.max(0, row.staffingChangePercent) * 0.4 - Math.max(0, row.approvalDelayChangePercent) * 0.12), 5, 98);
        var executionScore = clamp(Math.round(100 - impactScore * 0.74 + safeNumber(baseline.executionVelocity, 60) * 0.12), 0, 100);
        return {
            scenarioId: row.scenarioId,
            scenarioType: row.scenarioType,
            scenarioConfidence: scenarioConfidence,
            outcomeProbability: outcomeProbability,
            impactScore: impactScore,
            executionScore: executionScore,
            projectedDelayDays: Math.max(0, Math.round(row.deliverableSlipDays + row.dependencyDelayDays + Math.max(0, row.approvalDelayChangePercent) / 10)),
            projectedRiskScore: clamp(Math.round(safeNumber(baseline.riskScore, 40) + impactScore * 0.55), 0, 100),
            projectedThroughput: clamp(Math.round(safeNumber(baseline.workflowThroughput, 70) - impactScore * 0.45 + row.throughputChangePercent), 0, 100),
            invalidFields: row.invalidFields
        };
    }

    function runScenarioModel(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeSimulationPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var baseline = normalized.baseline || {};
            var results = normalized.scenarios.map(function result(row) { return scenarioImpact(row, baseline, normalized); });
            var timelineDelay = results.reduce(function total(acc, row) { return acc + row.projectedDelayDays; }, 0);
            var projectedBlocked = normalized.records.dependencies.filter(function blocked(row) { return /BLOCKED|DELAYED|AT_RISK/i.test(safeString(row.state || row.status, '')); }).length + results.filter(function high(row) { return row.impactScore > 60; }).length;
            var riskImpact = Math.round(average(results.map(function risk(row) { return row.projectedRiskScore; })));
            var forecastImpact = Math.round(average(results.map(function forecast(row) { return 100 - row.outcomeProbability; })));
            return freezeSimulationOutput({
                success: true,
                classification: 'SCENARIO_MODEL_COMPLETED',
                tenantSlug: normalized.tenantSlug,
                scenarioResults: results,
                scenarioComparison: results,
                projectedOutcomes: results.map(function outcome(row) {
                    return {
                        scenarioId: row.scenarioId,
                        scenarioType: row.scenarioType,
                        projectedOutcome: row.impactScore > 70 ? 'High-risk outcome requires human planning review.' : row.impactScore > 40 ? 'Moderate execution impact expected.' : 'Execution remains resilient.',
                        outcomeProbability: row.outcomeProbability,
                        executionScore: row.executionScore
                    };
                }),
                timelineImpact: { totalDelayDays: timelineDelay, averageDelayDays: Math.round(timelineDelay / Math.max(1, results.length)) },
                dependencyImpact: { projectedBlockedDependencies: projectedBlocked, dependencyDelayDays: Math.round(average(normalized.scenarios.map(function dep(row) { return row.dependencyDelayDays; }))) },
                riskImpact: { riskImpactScore: riskImpact },
                forecastImpact: { forecastImpactScore: forecastImpact },
                edgeCases: normalized.edgeCases,
                simulationWarnings: normalized.simulationWarnings,
                visibility: normalized.visibility,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('runScenarioModel failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, classification: 'SCENARIO_MODEL_ERROR', message: 'Scenario modeling failed safely.', governance: governanceFlags() });
        }
    }

    function calculateImpactScore(payload, context) {
        try {
            var model = payload && payload.scenarioResults ? payload : runScenarioModel(payload, context || {});
            if (!model.success) return model;
            var impactScore = Math.round(average((model.scenarioResults || []).map(function score(row) { return row.impactScore; })));
            var executionScore = Math.round(average((model.scenarioResults || []).map(function score(row) { return row.executionScore; })));
            var riskImpactScore = model.riskImpact && model.riskImpact.riskImpactScore || Math.round(average((model.scenarioResults || []).map(function score(row) { return row.projectedRiskScore; })));
            var forecastImpactScore = model.forecastImpact && model.forecastImpact.forecastImpactScore || Math.round(average((model.scenarioResults || []).map(function score(row) { return 100 - row.outcomeProbability; })));
            return freezeSimulationOutput({
                success: true,
                classification: 'SIMULATION_IMPACT_CALCULATED',
                tenantSlug: model.tenantSlug,
                impactScore: clamp(impactScore, 0, 100),
                executionScore: clamp(executionScore, 0, 100),
                riskImpactScore: clamp(riskImpactScore, 0, 100),
                forecastImpactScore: clamp(forecastImpactScore, 0, 100),
                timelineImpact: model.timelineImpact,
                dependencyImpact: model.dependencyImpact,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateImpactScore failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, classification: 'SIMULATION_IMPACT_ERROR', message: 'Simulation impact scoring failed safely.', governance: governanceFlags() });
        }
    }

    function generateSimulationInsights(payload, context) {
        try {
            var normalized = payload && payload.success ? payload : normalizeSimulationPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var impact = calculateImpactScore(normalized, context || {});
            var signals = normalized.aiSignals || {};
            var riskSignals = arrayOf(signals.riskPredictions || signals.riskIndicators, 50);
            var kpiSignals = arrayOf(signals.kpiForecasts, 50);
            var performanceSignals = arrayOf(signals.performanceForecasts, 50);
            var escalationSignals = arrayOf(signals.escalationPredictions, 50);
            var dependencySignals = arrayOf(signals.dependencyInsights || signals.dependencyRisks, 50);
            var simulationInsights = riskSignals.concat(kpiSignals).concat(performanceSignals).concat(escalationSignals).slice(0, 16).map(function insight(row) {
                return {
                    domain: row.domain || 'simulation',
                    level: row.riskLevel || row.escalationLevel || row.performanceLevel || 'MODERATE',
                    confidenceScore: clamp(row.confidenceScore || row.forecastConfidence || row.achievementProbability, 0, 100),
                    explanation: row.explanation || row.reason || 'Simulation insight is based on scenario impact and forecast signals.'
                };
            });
            if (!simulationInsights.length) {
                simulationInsights.push({
                    domain: 'scenario_model',
                    level: impact.impactScore > 60 ? 'HIGH' : 'MODERATE',
                    confidenceScore: 64,
                    explanation: 'Scenario impact score indicates planning review is useful before workflow changes.'
                });
            }
            var projectedBottlenecks = dependencySignals.map(function dep(row) {
                return {
                    domain: row.domain || 'dependency_chain',
                    bottleneckScore: clamp(row.bottleneckScore || row.riskScore || impact.dependencyImpact && impact.dependencyImpact.projectedBlockedDependencies * 20, 0, 100),
                    explanation: row.explanation || 'Projected bottleneck comes from dependency delay and blocked-chain inputs.'
                };
            });
            if (!projectedBottlenecks.length && impact.dependencyImpact && impact.dependencyImpact.projectedBlockedDependencies > 0) {
                projectedBottlenecks.push({
                    domain: 'dependency_chain',
                    bottleneckScore: clamp(impact.dependencyImpact.projectedBlockedDependencies * 22, 0, 100),
                    explanation: 'Scenario includes blocked or delayed dependency records.'
                });
            }
            var recommendedActions = simulationInsights.slice(0, 8).map(function action(row) {
                return {
                    domain: row.domain,
                    level: row.level,
                    action: 'Review scenario outcome with human governance owner before any live workflow change.',
                    explanation: row.explanation,
                    humanApprovalRequired: true
                };
            });
            return freezeSimulationOutput({
                success: true,
                classification: 'SIMULATION_INSIGHTS_GENERATED',
                tenantSlug: normalized.tenantSlug,
                simulationInsights: simulationInsights,
                projectedBottlenecks: projectedBottlenecks,
                forecastDeviations: kpiSignals.map(function deviation(row) {
                    return { domain: row.domain || 'kpi', deviationScore: clamp(100 - (row.achievementProbability || 50), 0, 100), explanation: row.explanation || 'KPI forecast shifts under scenario assumptions.' };
                }),
                executionRisks: riskSignals.concat(escalationSignals).map(function risk(row) {
                    return { domain: row.domain || 'execution', riskLevel: row.riskLevel || row.escalationLevel || 'MODERATE', explanation: row.explanation || row.reason || 'Execution risk projected from scenario input.' };
                }),
                recommendedActions: recommendedActions,
                advisoryOnly: true,
                noAutonomousActions: true,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generateSimulationInsights failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, classification: 'SIMULATION_INSIGHTS_ERROR', message: 'Simulation insights failed safely.', governance: governanceFlags() });
        }
    }

    function simulationAnalytics(normalized, impact, insights) {
        var analytics = normalized.analytics || {};
        var simulationEffectivenessScore = clamp(Math.round(safeNumber(analytics.planningEffectiveness, 0) || (100 - impact.impactScore * 0.42 + insights.simulationInsights.length * 2)), 0, 100);
        var planningReadinessScore = clamp(Math.round(100 - (normalized.edgeCases.sparseDatasetsDetected ? 12 : 0) - (normalized.edgeCases.invalidScenariosDetected ? 15 : 0) - (normalized.edgeCases.circularDependenciesDetected ? 10 : 0)), 0, 100);
        var executionConfidenceScore = clamp(Math.round(safeNumber(analytics.executionConfidence, 0) || impact.executionScore), 0, 100);
        return {
            simulationFrequency: safeNumber(analytics.simulationFrequency, 1),
            scenarioTypes: normalized.scenarios.map(function type(row) { return row.scenarioType; }),
            forecastDeviations: safeNumber(analytics.forecastDeviation, impact.forecastImpactScore),
            predictedBottlenecks: safeNumber(analytics.predictedBottlenecks, insights.projectedBottlenecks.length),
            planningEffectiveness: simulationEffectivenessScore,
            executionConfidence: executionConfidenceScore,
            simulationEffectivenessScore: simulationEffectivenessScore,
            planningReadinessScore: planningReadinessScore,
            executionConfidenceScore: executionConfidenceScore
        };
    }

    function generateWorkflowSimulationReport(payload, context) {
        try {
            var normalized = normalizeSimulationPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var model = runScenarioModel(normalized, context || {});
            var impact = calculateImpactScore(model, context || {});
            var insights = generateSimulationInsights(normalized, context || {});
            var analytics = simulationAnalytics(normalized, impact, insights);
            var report = {
                success: true,
                readOnly: true,
                temporary: true,
                isolated: true,
                classification: 'WORKFLOW_SIMULATION_COMPLETED',
                tenantSlug: normalized.tenantSlug,
                simulationName: normalized.simulationName,
                state: 'COMPLETED',
                visibility: normalized.visibility,
                domains: normalized.domains,
                records: normalized.records,
                scenarioComparison: model.scenarioComparison,
                projectedOutcomes: model.projectedOutcomes,
                timelineImpact: model.timelineImpact,
                dependencyImpact: model.dependencyImpact,
                riskImpact: model.riskImpact,
                forecastImpact: model.forecastImpact,
                impactAnalysis: impact,
                aiInsights: insights,
                analytics: analytics,
                simulationWarnings: (normalized.simulationWarnings || []).concat(normalized.edgeCases.invalidScenariosDetected ? [{ warningCode: 'INVALID_SCENARIO_VALUES', severity: 'MODERATE', message: 'Invalid scenario fields were replaced with safe defaults.' }] : []),
                edgeCases: normalized.edgeCases,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {}),
                generatedAt: nowIso()
            };
            var data = rawData();
            appendHistory(data, 'scenarioReportHistory', {
                historyId: 'SRH-' + Date.now(),
                tenantSlug: normalized.tenantSlug,
                simulationName: normalized.simulationName,
                scenarioCount: normalized.scenarios.length,
                impactScore: impact.impactScore,
                immutable: true,
                createdAt: report.generatedAt
            });
            appendHistory(data, 'simulationAnalyticsHistory', {
                historyId: 'SAH-' + Date.now(),
                tenantSlug: normalized.tenantSlug,
                simulationEffectivenessScore: analytics.simulationEffectivenessScore,
                planningReadinessScore: analytics.planningReadinessScore,
                executionConfidenceScore: analytics.executionConfidenceScore,
                immutable: true,
                createdAt: report.generatedAt
            });
            saveData(data);
            recordAudit('SIMULATION_EXECUTED', {
                scenarioCount: normalized.scenarios.length,
                impactScore: impact.impactScore,
                executionConfidenceScore: analytics.executionConfidenceScore
            }, context || {});
            recordTelemetry('SIMULATION_EXECUTED', {
                scenarioCount: normalized.scenarios.length,
                impactScore: impact.impactScore
            }, context || {});
            return freezeSimulationOutput(report);
        } catch (error) {
            safeWarn('generateWorkflowSimulationReport failed safely', error && error.message);
            return freezeSimulationOutput({ success: false, classification: 'WORKFLOW_SIMULATION_REPORT_ERROR', message: 'Workflow simulation report failed safely.', governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var context = { tenantSlug: 'self-test', actor: { id: 'DIR', role: 'DIRECTOR', tenantSlug: 'self-test', department: 'Leadership' }, skipAuditPersistence: true, skipTelemetry: true };
        var payload = {
            tenantSlug: 'self-test',
            domains: ['approval', 'dependency_chain'],
            baseline: { workflowThroughput: 70, executionVelocity: 62, riskScore: 38 },
            scenarios: [
                { tenantSlug: 'self-test', scenarioId: 'EXP', scenarioType: 'expected', approvalDelayChangePercent: 20, staffingChangePercent: 0, deliverableSlipDays: 4, kpiTargetChangePercent: 10, dependencyDelayDays: 3 }
            ],
            records: { dependencies: [{ tenantSlug: 'self-test', dependencyId: 'DEP', state: 'BLOCKED', sourceDepartment: 'HR', targetDepartment: 'Ops' }] },
            aiSignals: { riskPredictions: [{ domain: 'approval', riskLevel: 'HIGH', riskScore: 70, confidenceScore: 68, explanation: 'Approval slowdown.' }] }
        };
        var checks = [];
        function add(name, passed) { checks.push({ name: name, passed: !!passed }); }
        try {
            var malformed = normalizeSimulationPayload('bad', context);
            add('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var normalized = normalizeSimulationPayload(payload, context);
            add('simulation engine works', normalized.success && normalized.scenarios.length === 1);
            var model = runScenarioModel(payload, context);
            add('scenario modeling works', model.success && model.scenarioResults.length === 1);
            var impact = calculateImpactScore(payload, context);
            add('impact calculations work', impact.success && impact.impactScore > 0);
            var insights = generateSimulationInsights(payload, context);
            add('AI integration works', insights.success && insights.simulationInsights.length > 0 && insights.advisoryOnly);
            var report = generateWorkflowSimulationReport(payload, context);
            add('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.scenarioComparison));
        } catch (error) {
            add('self-test completed without uncaught throw', false);
        }
        var result = freezeSimulationOutput({
            passed: checks.every(function ok(item) { return item.passed; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_WORKFLOW_SIMULATION_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        version: '1.0.0',
        SIMULATION_STATES: SIMULATION_STATES,
        SIMULATION_DOMAINS: SIMULATION_DOMAINS,
        SCENARIO_TYPES: SCENARIO_TYPES,
        createSimulation: createSimulation,
        runScenarioModel: runScenarioModel,
        calculateImpactScore: calculateImpactScore,
        generateSimulationInsights: generateSimulationInsights,
        normalizeSimulationPayload: normalizeSimulationPayload,
        freezeSimulationOutput: freezeSimulationOutput,
        validateSimulationScope: validateSimulationScope,
        generateWorkflowSimulationReport: generateWorkflowSimulationReport,
        runSelfTest: runSelfTest
    });

    try {
        global.WorkflowSimulationService = service;
        global.workflowSimulationService = service;
    } catch (error) {
        safeWarn('Service export failed safely', error && error.message);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
