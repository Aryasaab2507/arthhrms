/**
 * managerUATService.js
 * Tenant-scoped, non-destructive manager workflow acceptance governance.
 */
(function attachManagerUATService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var SOURCE = 'managerUATService';
    var MAX_TEST_CASES = 10000;
    var MAX_HISTORY = 5000;
    var MAX_OPERATION_HISTORY = 100000;
    var MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
    var MAX_RECORDING_BYTES = 250 * 1024 * 1024;
    var ACCESS_ROLES = Object.freeze(['MANAGER', 'DEPARTMENT_HEAD', 'HR', 'HR_MANAGER', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var ADMIN_ROLES = Object.freeze(['DEPARTMENT_HEAD', 'HR', 'HR_MANAGER', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var EXECUTION_STATES = Object.freeze(['NOT_STARTED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED']);
    var CASE_STATUSES = Object.freeze(['NOT_EXECUTED', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED']);
    var APPROVAL_TYPES = Object.freeze(['SINGLE_LEVEL', 'MULTI_LEVEL', 'PARALLEL', 'CONDITIONAL', 'ESCALATION', 'DELEGATION', 'HISTORY']);
    var WORKFLOW_TYPES = Object.freeze(['LEAVE_REQUEST', 'ATTENDANCE_REGULARIZATION', 'SHIFT_SWAP', 'EXPENSE_CLAIM', 'RECRUITMENT_REQUEST', 'PROMOTION_REQUEST', 'TRANSFER_REQUEST', 'TRAINING_REQUEST', 'CUSTOM']);
    var SIGNOFF_STAGES = Object.freeze(['MANAGER', 'DEPARTMENT_HEAD', 'HR_VALIDATION']);
    var EVIDENCE_TYPES = Object.freeze(['SCREENSHOT', 'VIDEO', 'ATTACHMENT', 'COMMENT', 'APPROVAL_NOTE', 'LINKED_BUG', 'LOG_REFERENCE']);
    var TABLES = Object.freeze({
        suites: 'managerUATSuites',
        cases: 'managerUATTestCases',
        executions: 'managerUATExecutions',
        events: 'managerUATExecutionEvents',
        results: 'managerUATResultHistory',
        approvalValidations: 'managerUATApprovalValidations',
        workflowValidations: 'managerUATWorkflowValidations',
        evidence: 'managerUATEvidence',
        issues: 'managerUATIssues',
        issueHistory: 'managerUATIssueHistory',
        signoffs: 'managerUATSignoffs',
        analytics: 'managerUATAnalytics',
        checkpoints: 'managerUATRecoveryCheckpoints',
        revocations: 'managerUATRevocations',
        reports: 'managerUATBackgroundReports',
        audit: 'managerUATAuditHistory'
    });
    var SENSITIVE_KEY = /(password|secret|token|authorization|credential|private.?key|api.?key|cookie|session.?id|salary|compensation|bank|aadhaar|passport|government.?id|tax.?id|date.?of.?birth|employee.?email|employee.?phone|raw.?file|file.?content|binary|base64)/i;
    var SENSITIVE_VALUE = /(bearer\s+[a-z0-9._=-]+|password\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|private company data)/ig;
    var idCounter = 0;

    var SUITE_LIBRARY = Object.freeze([
        { code: 'EMPLOYEE_DASHBOARD', name: 'Employee Dashboard', cases: [
            ['TEAM_SUMMARY', 'Verify manager team summary', 'A reporting hierarchy snapshot exists.', ['Open the manager dashboard.', 'Compare employee totals with the approved hierarchy snapshot.', 'Verify denied employee records remain hidden.'], 'The dashboard contains only authorized reporting employees and accurate totals.', 'CRITICAL']
        ]},
        { code: 'TEAM_MANAGEMENT', name: 'Team Management', cases: [
            ['TEAM_VISIBILITY', 'Verify reporting employee visibility', 'Direct and matrix reports are configured.', ['Search direct reports.', 'Review matrix relationships.', 'Test an out-of-scope employee.'], 'Only authorized team relationships are visible.', 'CRITICAL'],
            ['TEAM_AVAILABILITY', 'Verify calendar and availability', 'Team calendars and policies are published.', ['Open team calendar.', 'Review leave, shift, and availability indicators.'], 'Availability is accurate and permission filtered.', 'HIGH']
        ]},
        { code: 'LEAVE_APPROVAL', name: 'Leave Approval', cases: [
            ['LEAVE_APPROVAL_CHAIN', 'Validate leave approval chain', 'A sandbox request and published approval chain exist.', ['Review request context.', 'Record the observed approval outcome.', 'Verify history and notifications.'], 'Leave approval follows the frozen manager and approval snapshots.', 'CRITICAL']
        ]},
        { code: 'ATTENDANCE_APPROVAL', name: 'Attendance Approval', cases: [
            ['ATTENDANCE_APPROVAL_CHAIN', 'Validate attendance approval', 'A sandbox attendance exception exists.', ['Review exception.', 'Record the observed decision.', 'Verify history.'], 'The configured attendance approval chain is honored.', 'CRITICAL']
        ]},
        { code: 'REGULARIZATION', name: 'Regularization', cases: [
            ['REGULARIZATION_FLOW', 'Validate attendance regularization', 'A sandbox regularization request exists.', ['Review requested correction.', 'Record the observed manager outcome.', 'Verify audit evidence.'], 'Regularization follows authorization and approval rules without changing historical attendance.', 'CRITICAL']
        ]},
        { code: 'SHIFT_APPROVAL', name: 'Shift Approval', cases: [
            ['SHIFT_APPROVAL_CHAIN', 'Validate shift approval', 'A sandbox shift request exists.', ['Review shift conflicts.', 'Record the observed approval outcome.'], 'Shift approval respects roster and policy conflicts.', 'HIGH']
        ]},
        { code: 'ROSTER_MANAGEMENT', name: 'Roster Management', cases: [
            ['ROSTER_COVERAGE', 'Verify roster coverage and manager scope', 'A published roster exists.', ['Review team coverage.', 'Identify gaps and conflicts.', 'Verify out-of-scope teams are hidden.'], 'Coverage and conflict indicators match the tenant roster snapshot.', 'HIGH']
        ]},
        { code: 'EXPENSE_APPROVAL', name: 'Expense Approval', cases: [
            ['EXPENSE_APPROVAL_CHAIN', 'Validate expense approval', 'A sandbox expense claim exists.', ['Review policy checks.', 'Record approval outcome.', 'Verify escalation behavior.'], 'Expense approval follows thresholds and the frozen chain.', 'CRITICAL']
        ]},
        { code: 'RECRUITMENT_APPROVAL', name: 'Recruitment Approval', cases: [
            ['RECRUITMENT_APPROVAL_CHAIN', 'Validate recruitment approval', 'A sandbox requisition exists.', ['Review requisition.', 'Record conditional approval outcome.', 'Verify history.'], 'Recruitment approval follows configured conditions.', 'HIGH']
        ]},
        { code: 'PERFORMANCE_REVIEW', name: 'Performance Review', cases: [
            ['PERFORMANCE_MANAGER_REVIEW', 'Validate manager performance review', 'A sandbox review cycle exists.', ['Open assigned review.', 'Record observed review completion.', 'Verify visibility and history.'], 'Only assigned reviews are available and required stages are enforced.', 'HIGH']
        ]},
        { code: 'TRAINING_APPROVAL', name: 'Training Approval', cases: [
            ['TRAINING_APPROVAL_CHAIN', 'Validate training approval', 'A sandbox training request exists.', ['Review eligibility.', 'Record the observed outcome.', 'Verify notifications.'], 'Training approval follows eligibility and manager scope.', 'MEDIUM']
        ]},
        { code: 'PROMOTION_RECOMMENDATION', name: 'Promotion Recommendation', cases: [
            ['PROMOTION_RECOMMENDATION_FLOW', 'Validate promotion recommendation', 'A sandbox promotion candidate exists.', ['Review supporting evidence.', 'Record recommendation outcome.', 'Verify downstream approval remains pending.'], 'Recommendation is recorded without applying an employee change.', 'CRITICAL']
        ]},
        { code: 'TRANSFER_APPROVAL', name: 'Transfer Approval', cases: [
            ['TRANSFER_APPROVAL_CHAIN', 'Validate transfer approval', 'A sandbox transfer request exists.', ['Review destination and hierarchy impact.', 'Record observed approval.', 'Verify effective-date controls.'], 'Transfer approval follows the configured chain without modifying employee placement.', 'CRITICAL']
        ]},
        { code: 'EXIT_CLEARANCE', name: 'Exit Clearance', cases: [
            ['EXIT_CLEARANCE_FLOW', 'Validate manager exit clearance', 'A sandbox separation request exists.', ['Review manager clearance tasks.', 'Record observed completion.', 'Verify protected settlement remains unposted.'], 'Clearance follows permissions and does not change payroll or employment records.', 'CRITICAL']
        ]},
        { code: 'CUSTOM_MANAGER_WORKFLOWS', name: 'Custom Manager Workflows', cases: [
            ['APPROVAL_PATTERNS', 'Validate enterprise approval patterns', 'Sandbox approval plans are configured.', ['Validate single and multi-level paths.', 'Validate parallel and conditional paths.', 'Validate delegation and escalation.', 'Review immutable history.'], 'All approval patterns match approved configuration and remain tenant scoped.', 'CRITICAL'],
            ['MANAGER_NOTIFICATIONS', 'Verify manager notifications and pending tasks', 'Notification and task providers are configured.', ['Review pending task list.', 'Review sandbox notification evidence.', 'Verify no live action was executed.'], 'Manager tasks and notifications are traceable and correctly scoped.', 'HIGH']
        ]}
    ]);

    function db() { try { return global.DB || null; } catch (error) { return null; } }
    function rawData() { try { return db() && typeof db().get === 'function' ? db().get() || {} : {}; } catch (error) { return {}; } }
    function saveData(data) { try { if (db() && typeof db().save === 'function') { db().save(data || {}); return true; } } catch (error) {} return false; }
    function ensureTables(data) {
        var store = data || {};
        Object.keys(TABLES).forEach(function each(key) { if (!Array.isArray(store[TABLES[key]])) store[TABLES[key]] = []; });
        if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
        return store;
    }
    function safeString(value, fallback) { if (value === null || typeof value === 'undefined') return fallback || ''; try { return String(value); } catch (error) { return fallback || ''; } }
    function safeNumber(value, fallback) { var number = Number(value); return Number.isFinite(number) ? number : Number(fallback || 0); }
    function token(value) { return safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); }
    function normalizeTenant(value) { return safeString(value, '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); }
    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        var aliases = { DEPARTMENTHEAD: 'DEPARTMENT_HEAD', HRMANAGER: 'HR_MANAGER', HRHEAD: 'HR_HEAD', SUPERADMIN: 'SUPER_ADMIN', PLATFORMOWNER: 'PLATFORM_OWNER' };
        return aliases[role] || role || 'EMPLOYEE';
    }
    function defaultTenant() { var data = rawData(); return normalizeTenant((data.companySettings || {}).tenantSlug || (data.companySettings || {}).tenantId || 'default'); }
    function contextTenant(context) { var source = context || {}; var row = source.actor || {}; return normalizeTenant(source.tenantSlug || source.tenantId || row.tenantSlug || row.tenantId || ''); }
    function actor(context) { var source = context || {}; var row = source.actor || {}; return { id: safeString(row.id || source.actorId || 'SYSTEM', 'SYSTEM'), role: normalizeRole(row.role || source.role || 'EMPLOYEE'), tenantSlug: normalizeTenant(row.tenantSlug || source.tenantSlug || source.tenantId || defaultTenant()) }; }
    function nowMs(context) { var time = context && context.now ? new Date(context.now).getTime() : Date.now(); return Number.isFinite(time) ? time : Date.now(); }
    function nowIso(context) { return new Date(nowMs(context || {})).toISOString(); }
    function createId(prefix) { idCounter += 1; return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + idCounter.toString(36).toUpperCase().padStart(4, '0'); }
    function clamp(value) { return Math.max(0, Math.min(100, Math.round(safeNumber(value, 0)))); }
    function stableStringify(value) {
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function map(key) { return JSON.stringify(key) + ':' + stableStringify(value[key]); }).join(',') + '}';
        return JSON.stringify(value);
    }
    function fingerprint(value) {
        var text = stableStringify(value);
        var hash = 2166136261;
        for (var index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24); }
        return 'FNV1A32-' + (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
    }
    function cloneSafe(value, key, seen) {
        var refs = seen || [];
        if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (SENSITIVE_KEY.test(key || '')) return '[REDACTED]';
        if (!value || typeof value !== 'object') return typeof value === 'string' ? value.replace(SENSITIVE_VALUE, '[REDACTED]').slice(0, 4000) : value;
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function map(item) { return cloneSafe(item, '', refs.slice()); }).filter(function keep(item) { return typeof item !== 'undefined'; });
        var output = {};
        Object.keys(value).forEach(function each(name) { if (name === '__proto__' || name === 'prototype' || name === 'constructor') return; var next = cloneSafe(value[name], name, refs.slice()); if (typeof next !== 'undefined') output[name] = next; });
        return output;
    }
    function freezeDeep(value, seen) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; var refs = seen || []; if (refs.indexOf(value) !== -1) return value; refs.push(value); Object.keys(value).forEach(function each(key) { freezeDeep(value[key], refs.slice()); }); try { Object.freeze(value); } catch (error) {} return value; }
    function freezeOutput(value) { return freezeDeep(cloneSafe(value || {}, '', []), []); }
    function result(success, code, message, extra) { return freezeOutput(Object.assign({ success: success === true, code: token(code || (success ? 'MANAGER_UAT_OPERATION_COMPLETED' : 'MANAGER_UAT_OPERATION_FAILED')), message: safeString(message, success ? 'Operation completed.' : 'Operation failed.') }, extra || {})); }
    function governanceFlags(extra) { return Object.assign({ backwardCompatibilityPreserved: true, tenantIsolationPreserved: true, productionDataModified: false, existingManagerWorkflowsUnmodified: true, existingEmployeeRecordsUnmodified: true, existingApprovalEngineUnmodified: true, destructiveActionsExecuted: false, liveWorkflowExecutionAllowed: false, auditLoggingEnabled: true, testExecutionReproducible: true, governanceRecordsReversibleByRevocation: true, deploymentTriggered: false }, extra || {}); }
    function rowTenant(row) { return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.organizationId || row.companyId) || ''); }
    function sameTenant(row, tenantSlug) { var owner = rowTenant(row); return owner ? owner === normalizeTenant(tenantSlug) : normalizeTenant(tenantSlug) === defaultTenant(); }
    function validateAccess(input, context, adminRequired) {
        var target = normalizeTenant((input || {}).tenantSlug || (input || {}).tenantId || contextTenant(context) || defaultTenant());
        var caller = contextTenant(context) || target;
        var active = actor(context || {});
        if (!target) return { allowed: false, code: 'TENANT_REQUIRED', message: 'A tenant scope is required.' };
        if (caller && caller !== target) return { allowed: false, code: 'TENANT_ACCESS_DENIED', message: 'Manager UAT operations are tenant scoped.' };
        var roles = adminRequired ? ADMIN_ROLES : ACCESS_ROLES;
        if (roles.indexOf(active.role) === -1) return { allowed: false, code: adminRequired ? 'MANAGER_UAT_ADMIN_RBAC_DENIED' : 'MANAGER_UAT_RBAC_DENIED', message: 'The current role cannot perform this Manager UAT operation.' };
        return { allowed: true, tenantSlug: target, actor: active };
    }
    function historyLimit(table) {
        if (table === TABLES.cases) return MAX_TEST_CASES;
        if ([TABLES.events, TABLES.results, TABLES.approvalValidations, TABLES.workflowValidations, TABLES.checkpoints, TABLES.audit].indexOf(table) !== -1) return MAX_OPERATION_HISTORY;
        return MAX_HISTORY;
    }
    function persist(table, row) { var data = ensureTables(rawData()); data[table].unshift(Object.assign({}, cloneSafe(row, '', []), { immutable: row.immutable === true })); data[table] = data[table].slice(0, historyLimit(table)); saveData(data); }
    function replaceRow(table, tenantSlug, idField, idValue, next) { var data = ensureTables(rawData()); var index = data[table].findIndex(function find(row) { return sameTenant(row, tenantSlug) && row[idField] === idValue; }); if (index === -1) return false; data[table][index] = cloneSafe(next, '', []); saveData(data); return true; }
    function emitTelemetry(eventType, metadata, context) { if (context && context.skipTelemetry) return; try { if (global.WorkflowTelemetryService && typeof global.WorkflowTelemetryService.emitWorkflowTelemetry === 'function') global.WorkflowTelemetryService.emitWorkflowTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: cloneSafe(metadata || {}, '', []) }); } catch (error) {} }
    function recordMetric(eventType, metadata, context) { if (context && context.skipMetrics) return; try { if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, cloneSafe(metadata || {}, '', []))); } catch (error) {} }
    function audit(actionType, tenantSlug, entityId, metadata, context) {
        if (context && context.skipAuditPersistence) return null;
        var active = actor(context || {});
        var row = { auditId: createId('MGR-UAT-AUDIT'), actionType: token(actionType), module: 'Manager UAT', entityType: 'MANAGER_UAT', entityId: safeString(entityId || tenantSlug, tenantSlug), tenantSlug: tenantSlug, actorId: active.id, actorRole: active.role, timestamp: nowIso(context), metadata: cloneSafe(metadata || {}, '', []), immutable: true };
        persist(TABLES.audit, row);
        try { if (global.AuditService && typeof global.AuditService.recordAudit === 'function') global.AuditService.recordAudit(row, context || {}); else { var data = ensureTables(rawData()); data.auditLogs.unshift(row); data.auditLogs = data.auditLogs.slice(0, MAX_HISTORY); saveData(data); } } catch (error) {}
        return row;
    }
    function event(execution, type, details, context) {
        var row = { eventId: createId('MGR-UAT-EVENT'), tenantSlug: execution.tenantSlug, executionId: execution.executionId, sequence: safeNumber(execution.eventSequence, 0) + 1, eventType: token(type), executionVersion: execution.version, actorId: actor(context || {}).id, timestamp: nowIso(context), details: cloneSafe(details || {}, '', []), immutable: true };
        persist(TABLES.events, row);
        persist(TABLES.checkpoints, { checkpointId: createId('MGR-UAT-CP'), tenantSlug: execution.tenantSlug, executionId: execution.executionId, eventId: row.eventId, executionVersion: execution.version, status: execution.status, manifestFingerprint: execution.manifestFingerprint, createdAt: row.timestamp, recoverable: true, immutable: true });
        execution.eventSequence = row.sequence;
        return row;
    }
    function executionById(data, tenantSlug, executionId) { return (data[TABLES.executions] || []).find(function find(row) { return sameTenant(row, tenantSlug) && row.executionId === safeString(executionId, ''); }); }
    function checkVersion(execution, input) { return typeof input.expectedVersion === 'undefined' || safeNumber(input.expectedVersion, -1) === safeNumber(execution.version, 0); }
    function suiteId(tenantSlug, code) { return 'MGR-UAT-SUITE-' + normalizeTenant(tenantSlug).toUpperCase() + '-' + token(code); }
    function testId(tenantSlug, suiteCode, caseCode) { return 'MGR-UAT-' + normalizeTenant(tenantSlug).toUpperCase() + '-' + token(suiteCode) + '-' + token(caseCode); }
    function activeRevocations(data, tenantSlug, executionId) { return (data[TABLES.revocations] || []).filter(function keep(row) { return sameTenant(row, tenantSlug) && (!executionId || row.executionId === executionId); }); }
    function isRevoked(rows, entityType, entityId) { return rows.some(function some(row) { return row.entityType === token(entityType) && row.entityId === entityId; }); }

    function initializeLibrary(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var suitesAdded = 0;
        var casesAdded = 0;
        SUITE_LIBRARY.forEach(function each(definition) {
            var id = suiteId(access.tenantSlug, definition.code);
            if (!data[TABLES.suites].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.suiteId === id; })) {
                data[TABLES.suites].push({ suiteId: id, tenantSlug: access.tenantSlug, code: definition.code, name: definition.name, status: 'ACTIVE', predefined: true, version: 1, createdAt: nowIso(context), createdBy: access.actor.id, immutableIdentity: true });
                suitesAdded += 1;
            }
            definition.cases.forEach(function eachCase(definitionCase) {
                var idCase = testId(access.tenantSlug, definition.code, definitionCase[0]);
                if (data[TABLES.cases].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.testId === idCase; })) return;
                data[TABLES.cases].push({ testId: idCase, tenantSlug: access.tenantSlug, suiteId: id, module: definition.code, description: definitionCase[1], businessScenario: definitionCase[1], preconditions: definitionCase[2], executionSteps: definitionCase[3], expectedResult: definitionCase[4], priority: definitionCase[5], mandatory: definitionCase[5] === 'CRITICAL', status: 'ACTIVE', version: 1, createdAt: nowIso(context), immutableIdentity: true });
                casesAdded += 1;
            });
        });
        data[TABLES.suites] = data[TABLES.suites].slice(0, 2000);
        data[TABLES.cases] = data[TABLES.cases].slice(0, MAX_TEST_CASES);
        saveData(data);
        audit('MANAGER_UAT_LIBRARY_INITIALIZED', access.tenantSlug, access.tenantSlug, { suitesAdded: suitesAdded, casesAdded: casesAdded }, context || {});
        return result(true, 'MANAGER_UAT_LIBRARY_INITIALIZED', 'Manager UAT library initialized.', { suiteCount: data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length, caseCount: data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length, suitesAdded: suitesAdded, casesAdded: casesAdded, governance: governanceFlags() });
    }

    function createCustomSuite(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var code = token(input.code || input.name);
        if (!code || !safeString(input.name, '').trim()) return result(false, 'MANAGER_UAT_SUITE_INVALID', 'Suite name and code are required.');
        var data = ensureTables(rawData());
        if (data[TABLES.suites].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.code === code; })) return result(false, 'MANAGER_UAT_SUITE_DUPLICATE', 'A suite with this code already exists.');
        var suite = { suiteId: suiteId(access.tenantSlug, 'CUSTOM-' + code), tenantSlug: access.tenantSlug, code: code, name: safeString(input.name, '').slice(0, 200), description: safeString(input.description, '').slice(0, 1000), status: 'ACTIVE', predefined: false, version: 1, createdAt: nowIso(context), createdBy: access.actor.id, immutableIdentity: true };
        persist(TABLES.suites, suite);
        audit('MANAGER_UAT_CUSTOM_SUITE_CREATED', access.tenantSlug, suite.suiteId, { code: suite.code }, context || {});
        return result(true, 'MANAGER_UAT_CUSTOM_SUITE_CREATED', 'Custom manager UAT suite created.', { suite: suite, governance: governanceFlags() });
    }

    function addTestCase(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var suite = data[TABLES.suites].find(function find(row) { return sameTenant(row, access.tenantSlug) && row.suiteId === input.suiteId; });
        if (!suite) return result(false, 'MANAGER_UAT_SUITE_NOT_FOUND', 'The manager UAT suite was not found.');
        if (!safeString(input.description || input.businessScenario, '').trim() || !Array.isArray(input.executionSteps) || !input.executionSteps.length || !safeString(input.expectedResult, '').trim()) return result(false, 'MANAGER_UAT_TEST_CASE_INVALID', 'Description, execution steps, and expected result are required.');
        var code = token(input.code || createId('CASE'));
        var id = testId(access.tenantSlug, suite.code, code);
        if (data[TABLES.cases].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.testId === id; })) return result(false, 'MANAGER_UAT_TEST_CASE_DUPLICATE', 'The manager UAT test case already exists.');
        var testCase = { testId: id, tenantSlug: access.tenantSlug, suiteId: suite.suiteId, module: token(input.module || suite.code), description: safeString(input.description || input.businessScenario, '').slice(0, 800), businessScenario: safeString(input.businessScenario || input.description, '').slice(0, 800), preconditions: safeString(input.preconditions, '').slice(0, 1500), executionSteps: input.executionSteps.slice(0, 100).map(function map(step) { return safeString(step, '').slice(0, 500); }), expectedResult: safeString(input.expectedResult, '').slice(0, 1500), priority: token(input.priority || 'MEDIUM'), mandatory: input.mandatory === true, status: 'ACTIVE', version: 1, createdAt: nowIso(context), createdBy: access.actor.id, immutableIdentity: true };
        persist(TABLES.cases, testCase);
        audit('MANAGER_UAT_TEST_CASE_CREATED', access.tenantSlug, testCase.testId, { suiteId: suite.suiteId, module: testCase.module }, context || {});
        return result(true, 'MANAGER_UAT_TEST_CASE_CREATED', 'Manager UAT test case created.', { testCase: testCase, governance: governanceFlags() });
    }

    function listLibrary(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        return result(true, 'MANAGER_UAT_LIBRARY_LISTED', 'Manager UAT library loaded.', { tenantSlug: access.tenantSlug, suites: data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }), testCases: data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }), governance: governanceFlags() });
    }

    function startExecution(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var managerId = safeString(input.managerId || access.actor.id, '').trim();
        if (!managerId) return result(false, 'MANAGER_UAT_MANAGER_REQUIRED', 'A manager identity is required.');
        var data = ensureTables(rawData());
        if (!data[TABLES.suites].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.status === 'ACTIVE'; })) return result(false, 'MANAGER_UAT_LIBRARY_NOT_INITIALIZED', 'An authorized administrator must initialize the manager UAT library before execution.');
        var suiteIds = Array.isArray(input.suiteIds) && input.suiteIds.length ? input.suiteIds.slice(0, 100) : data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.status === 'ACTIVE'; }).map(function map(row) { return row.suiteId; });
        var suites = data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && suiteIds.indexOf(row.suiteId) !== -1 && row.status === 'ACTIVE'; });
        var cases = data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && suiteIds.indexOf(row.suiteId) !== -1 && row.status === 'ACTIVE'; });
        if (!suites.length || !cases.length) return result(false, 'MANAGER_UAT_MANIFEST_EMPTY', 'At least one active suite and test case are required.');
        var hierarchySnapshot = cloneSafe(input.hierarchySnapshot || { managerId: managerId, reportingEmployeeIds: [], approvalPaths: [] }, '', []);
        hierarchySnapshot.managerId = safeString(hierarchySnapshot.managerId || managerId, managerId);
        hierarchySnapshot.tenantSlug = access.tenantSlug;
        var snapshotSuites = suites.map(function map(row) { return { suiteId: row.suiteId, code: row.code, name: row.name, version: row.version }; });
        var snapshotCases = cases.map(function map(row) { return { testId: row.testId, suiteId: row.suiteId, module: row.module, description: row.description, businessScenario: row.businessScenario, preconditions: row.preconditions, executionSteps: row.executionSteps, expectedResult: row.expectedResult, priority: row.priority, mandatory: row.mandatory, version: row.version }; });
        var manifest = { serviceVersion: VERSION, tenantSlug: access.tenantSlug, managerId: managerId, suiteSnapshot: snapshotSuites, testCaseSnapshot: snapshotCases, hierarchySnapshot: hierarchySnapshot, seed: safeString(input.seed || createId('MANIFEST'), '').slice(0, 200) };
        var states = {};
        snapshotCases.forEach(function each(row) { states[row.testId] = { testId: row.testId, module: row.module, priority: row.priority, mandatory: row.mandatory, status: 'NOT_EXECUTED', actualResult: '', attemptCount: 0, retestCount: 0, evidenceCount: 0, issueCount: 0 }; });
        var execution = { executionId: createId('MGR-UAT-RUN'), tenantSlug: access.tenantSlug, name: safeString(input.name || 'Manager UAT ' + nowIso(context).slice(0, 10), '').slice(0, 300), managerId: managerId, status: 'RUNNING', outcome: '', version: 1, eventSequence: 0, totalCases: snapshotCases.length, manifest: manifest, manifestFingerprint: fingerprint(manifest), caseStates: states, managerSnapshot: hierarchySnapshot, startedBy: access.actor.id, startedAt: nowIso(context), reproducible: true, productionDataModified: false, immutableIdentity: true };
        persist(TABLES.executions, execution);
        event(execution, 'EXECUTION_STARTED', { totalCases: execution.totalCases, managerId: managerId, manifestFingerprint: execution.manifestFingerprint }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('MANAGER_UAT_EXECUTION_STARTED', access.tenantSlug, execution.executionId, { totalCases: execution.totalCases, managerId: managerId, manifestFingerprint: execution.manifestFingerprint }, context || {});
        emitTelemetry('MANAGER_UAT_EXECUTION_STARTED', { tenantSlug: access.tenantSlug, executionId: execution.executionId, status: execution.status }, context || {});
        return result(true, 'MANAGER_UAT_EXECUTION_STARTED', 'Manager UAT execution started.', { execution: execution, governance: governanceFlags() });
    }

    function transitionExecution(input, context, targetStatus, eventType) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (!checkVersion(execution, input)) return result(false, 'MANAGER_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var allowed = { PAUSED: ['RUNNING'], RUNNING: ['PAUSED'], CANCELLED: ['RUNNING', 'PAUSED'] };
        if ((allowed[targetStatus] || []).indexOf(execution.status) === -1) return result(false, 'MANAGER_UAT_INVALID_STATE_TRANSITION', 'The requested execution state transition is not allowed.');
        execution.status = targetStatus;
        execution.version += 1;
        if (targetStatus === 'PAUSED') execution.pausedAt = nowIso(context);
        if (targetStatus === 'RUNNING') execution.pausedAt = '';
        if (targetStatus === 'CANCELLED') execution.cancelledAt = nowIso(context);
        event(execution, eventType, { reason: safeString(input.reason, '').slice(0, 500) }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('MANAGER_UAT_' + eventType, access.tenantSlug, execution.executionId, { status: execution.status, version: execution.version }, context || {});
        return result(true, 'MANAGER_UAT_' + eventType, 'Manager UAT execution state updated.', { execution: execution, governance: governanceFlags() });
    }
    function pauseExecution(input, context) { return transitionExecution(input, context, 'PAUSED', 'EXECUTION_PAUSED'); }
    function resumeExecution(input, context) { return transitionExecution(input, context, 'RUNNING', 'EXECUTION_RESUMED'); }
    function cancelExecution(input, context) { return transitionExecution(input, context, 'CANCELLED', 'EXECUTION_CANCELLED'); }

    function recordTestResult(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (execution.status !== 'RUNNING') return result(false, 'MANAGER_UAT_EXECUTION_NOT_RUNNING', 'Test results can only be recorded while the execution is running.');
        if (!checkVersion(execution, input)) return result(false, 'MANAGER_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var state = execution.caseStates && execution.caseStates[input.testId];
        if (!state) return result(false, 'MANAGER_UAT_TEST_CASE_NOT_IN_RUN', 'The test case is not part of this execution manifest.');
        var status = token(input.status);
        if (CASE_STATUSES.indexOf(status) === -1 || status === 'NOT_EXECUTED') return result(false, 'MANAGER_UAT_RESULT_STATUS_INVALID', 'Result status must be passed, failed, blocked, or skipped.');
        if ((status === 'PASSED' || status === 'FAILED') && !safeString(input.actualResult, '').trim()) return result(false, 'MANAGER_UAT_ACTUAL_RESULT_REQUIRED', 'An actual result is required for passed and failed cases.');
        var previousStatus = state.status;
        var isRetest = input.retest === true || ['FAILED', 'BLOCKED'].indexOf(previousStatus) !== -1;
        state.status = status;
        state.actualResult = safeString(input.actualResult, '').slice(0, 2000);
        state.executedBy = access.actor.id;
        state.updatedAt = nowIso(context);
        state.attemptCount = safeNumber(state.attemptCount, 0) + 1;
        if (isRetest) state.retestCount = safeNumber(state.retestCount, 0) + 1;
        state.lastExecutionType = isRetest ? 'RETEST' : 'INITIAL';
        execution.version += 1;
        var history = { resultId: createId('MGR-UAT-RESULT'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: input.testId, attempt: state.attemptCount, retest: isRetest, previousStatus: previousStatus, status: status, actualResult: state.actualResult, executedBy: access.actor.id, executedAt: state.updatedAt, executionVersion: execution.version, immutable: true };
        persist(TABLES.results, history);
        event(execution, isRetest ? 'TEST_RETESTED' : 'TEST_RESULT_RECORDED', { testId: input.testId, previousStatus: previousStatus, status: status, attempt: state.attemptCount }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit(isRetest ? 'MANAGER_UAT_TEST_RETESTED' : 'MANAGER_UAT_TEST_RESULT_RECORDED', access.tenantSlug, history.resultId, { executionId: execution.executionId, testId: input.testId, previousStatus: previousStatus, status: status }, context || {});
        recordMetric(status === 'FAILED' ? 'MANAGER_UAT_TEST_FAILED' : 'MANAGER_UAT_TEST_RESULT_RECORDED', { tenantSlug: access.tenantSlug, status: status, failed: status === 'FAILED' }, context || {});
        return result(true, 'MANAGER_UAT_TEST_RESULT_RECORDED', 'Manager UAT result recorded.', { executionId: execution.executionId, executionVersion: execution.version, caseState: state, result: history, governance: governanceFlags() });
    }

    function bulkExecute(input, context) {
        var rows = Array.isArray(input && input.results) ? input.results.slice(0, MAX_TEST_CASES) : [];
        if (!rows.length) return result(false, 'MANAGER_UAT_BULK_RESULTS_REQUIRED', 'Bulk execution requires explicit test results.');
        var recorded = [];
        var failures = [];
        var expectedVersion = input.expectedVersion;
        rows.forEach(function each(row) {
            var response = recordTestResult(Object.assign({}, row, { tenantSlug: input.tenantSlug, executionId: input.executionId, expectedVersion: expectedVersion }), context || {});
            if (response.success) { recorded.push(response.result); expectedVersion = response.executionVersion; } else failures.push({ testId: row.testId, code: response.code });
        });
        return result(failures.length === 0, failures.length ? 'MANAGER_UAT_BULK_EXECUTION_PARTIAL' : 'MANAGER_UAT_BULK_EXECUTION_COMPLETED', failures.length ? 'Bulk execution completed with rejected rows.' : 'Bulk execution completed.', { executionId: input.executionId, recorded: recorded, failures: failures, finalVersion: expectedVersion, governance: governanceFlags() });
    }

    function retryFailedCases(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        var eligible = Object.keys(execution.caseStates || {}).filter(function keep(id) { return ['FAILED', 'BLOCKED'].indexOf(execution.caseStates[id].status) !== -1; });
        var supplied = Array.isArray(input.results) ? input.results.filter(function keep(row) { return eligible.indexOf(row.testId) !== -1; }).map(function map(row) { return Object.assign({}, row, { retest: true }); }) : [];
        if (!supplied.length) return result(true, 'MANAGER_UAT_RETRY_QUEUE_READY', 'Failed and blocked cases selected for retry.', { testIds: eligible, count: eligible.length, governance: governanceFlags() });
        return bulkExecute({ tenantSlug: access.tenantSlug, executionId: execution.executionId, expectedVersion: input.expectedVersion, results: supplied }, context || {});
    }

    function completeExecution(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (execution.status !== 'RUNNING') return result(false, 'MANAGER_UAT_EXECUTION_NOT_RUNNING', 'Only a running execution can be completed.');
        if (!checkVersion(execution, input)) return result(false, 'MANAGER_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var states = Object.keys(execution.caseStates || {}).map(function map(id) { return execution.caseStates[id]; });
        var pending = states.filter(function keep(row) { return row.mandatory && ['NOT_EXECUTED', 'SKIPPED'].indexOf(row.status) !== -1; });
        if (pending.length) return result(false, 'MANDATORY_MANAGER_UAT_CASES_PENDING', 'Every mandatory manager scenario must be executed before completion.', { pendingCount: pending.length });
        execution.status = 'COMPLETED';
        execution.version += 1;
        execution.completedAt = nowIso(context);
        execution.outcome = states.some(function some(row) { return row.mandatory && ['FAILED', 'BLOCKED'].indexOf(row.status) !== -1; }) ? 'FAILED' : 'PASSED';
        event(execution, 'EXECUTION_COMPLETED', { outcome: execution.outcome }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('MANAGER_UAT_EXECUTION_COMPLETED', access.tenantSlug, execution.executionId, { outcome: execution.outcome, version: execution.version }, context || {});
        return result(true, 'MANAGER_UAT_EXECUTION_COMPLETED', 'Manager UAT execution completed.', { execution: execution, governance: governanceFlags() });
    }

    function normalizeApprovers(rows, tenantSlug) {
        return (Array.isArray(rows) ? rows : []).slice(0, 100).map(function map(row, index) { var item = typeof row === 'string' ? { id: row } : row || {}; return { id: safeString(item.id || item.employeeId || item.userId, '').trim(), role: normalizeRole(item.role || 'MANAGER'), level: safeNumber(item.level, index + 1), tenantSlug: normalizeTenant(item.tenantSlug || item.tenantId || tenantSlug) }; });
    }
    function duplicateIds(rows) { var seen = {}; return rows.map(function map(row) { return safeString(row.id || row, '').trim(); }).filter(function keep(id) { if (!id) return false; if (seen[id]) return true; seen[id] = true; return false; }); }
    function containsCycle(path) { return duplicateIds((Array.isArray(path) ? path : []).map(function map(row) { return { id: typeof row === 'string' ? row : row && (row.id || row.employeeId) }; })).length > 0; }

    function validateApprovalScenario(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (execution.status !== 'RUNNING') return result(false, 'MANAGER_UAT_EXECUTION_NOT_RUNNING', 'Approval validation requires a running UAT execution.');
        if (!checkVersion(execution, input)) return result(false, 'MANAGER_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var approvalType = token(input.approvalType || input.type);
        if (APPROVAL_TYPES.indexOf(approvalType) === -1) return result(false, 'MANAGER_UAT_APPROVAL_TYPE_INVALID', 'The approval validation type is unsupported.');
        var approvers = normalizeApprovers(input.approvers, access.tenantSlug);
        if (approvers.some(function some(row) { return row.tenantSlug !== access.tenantSlug; })) return result(false, 'TENANT_ACCESS_DENIED', 'Cross-tenant approvers are forbidden.');
        var findings = [];
        var requesterId = safeString(input.requesterId, '').trim();
        if (approvers.some(function some(row) { return row.id && row.id === requesterId; })) findings.push({ code: 'SELF_APPROVAL', severity: 'CRITICAL' });
        if (duplicateIds(approvers).length) findings.push({ code: 'DUPLICATE_APPROVER', severity: 'HIGH' });
        if (containsCycle(input.approvalPath || approvers)) findings.push({ code: 'CIRCULAR_APPROVAL', severity: 'CRITICAL' });
        if (approvalType === 'SINGLE_LEVEL' && approvers.length !== 1) findings.push({ code: 'SINGLE_APPROVER_REQUIRED', severity: 'HIGH' });
        if (['MULTI_LEVEL', 'PARALLEL'].indexOf(approvalType) !== -1 && approvers.length < 2) findings.push({ code: 'MULTIPLE_APPROVERS_REQUIRED', severity: 'HIGH' });
        if (approvalType === 'DELEGATION') {
            var expires = new Date(input.delegationExpiresAt || '').getTime();
            if (!Number.isFinite(expires) || expires <= nowMs(context)) findings.push({ code: 'DELEGATION_EXPIRED', severity: 'CRITICAL' });
        }
        var snapshotManager = safeString(execution.managerSnapshot && execution.managerSnapshot.managerId || execution.managerId, '');
        var currentManager = safeString(input.currentManagerId || snapshotManager, '');
        if (currentManager && snapshotManager && currentManager !== snapshotManager) findings.push({ code: 'MANAGER_CHANGED_DURING_UAT', severity: 'HIGH' });
        var actualStatus = token(input.actualStatus || input.actualResult);
        if (!actualStatus) return result(false, 'MANAGER_UAT_ACTUAL_APPROVAL_RESULT_REQUIRED', 'An observed approval result is required.');
        var successful = ['PASSED', 'SUCCESS', 'APPROVED', 'VALID'].indexOf(actualStatus) !== -1;
        var validationStatus = findings.some(function some(row) { return row.severity === 'CRITICAL'; }) ? 'BLOCKED' : findings.length || !successful ? 'FAILED' : 'PASSED';
        var validation = { validationId: createId('MGR-UAT-APPROVAL'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: safeString(input.testId, ''), approvalType: approvalType, scenario: safeString(input.scenario, '').slice(0, 800), requesterId: requesterId, approvers: approvers, expectedOutcome: safeString(input.expectedOutcome, '').slice(0, 1200), actualStatus: actualStatus, status: validationStatus, findings: findings, managerSnapshotId: snapshotManager, currentManagerId: currentManager, validatedBy: access.actor.id, validatedAt: nowIso(context), productionActionExecuted: false, immutable: true };
        persist(TABLES.approvalValidations, validation);
        execution.version += 1;
        event(execution, 'APPROVAL_VALIDATED', { validationId: validation.validationId, approvalType: approvalType, status: validationStatus, findings: findings.map(function map(row) { return row.code; }) }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('MANAGER_UAT_APPROVAL_VALIDATED', access.tenantSlug, validation.validationId, { executionId: execution.executionId, approvalType: approvalType, status: validationStatus }, context || {});
        emitTelemetry('MANAGER_UAT_APPROVAL_VALIDATED', { tenantSlug: access.tenantSlug, executionId: execution.executionId, status: validationStatus }, context || {});
        return result(validationStatus === 'PASSED', validationStatus === 'PASSED' ? 'MANAGER_UAT_APPROVAL_VALIDATED' : 'MANAGER_UAT_APPROVAL_VALIDATION_FAILED', validationStatus === 'PASSED' ? 'Approval scenario passed validation.' : 'Approval scenario recorded with governance findings.', { validation: validation, executionVersion: execution.version, governance: governanceFlags() });
    }

    function validateWorkflowScenario(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (execution.status !== 'RUNNING') return result(false, 'MANAGER_UAT_EXECUTION_NOT_RUNNING', 'Workflow validation requires a running UAT execution.');
        if (!checkVersion(execution, input)) return result(false, 'MANAGER_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var workflowType = token(input.workflowType || input.type || 'CUSTOM');
        if (WORKFLOW_TYPES.indexOf(workflowType) === -1) return result(false, 'MANAGER_UAT_WORKFLOW_TYPE_INVALID', 'The workflow validation type is unsupported.');
        var sourceTenant = normalizeTenant(input.sourceTenantSlug || input.sourceTenantId || access.tenantSlug);
        if (sourceTenant !== access.tenantSlug) return result(false, 'TENANT_ACCESS_DENIED', 'Cross-tenant workflow evidence is forbidden.');
        var observed = token(input.actualStatus || input.actualResult);
        if (!observed) return result(false, 'MANAGER_UAT_ACTUAL_WORKFLOW_RESULT_REQUIRED', 'An observed workflow result is required.');
        var successful = ['PASSED', 'SUCCESS', 'APPROVED', 'COMPLETED', 'VALID'].indexOf(observed) !== -1;
        var expected = token(input.expectedStatus || 'COMPLETED');
        var status = successful || observed === expected ? 'PASSED' : 'FAILED';
        var validation = { validationId: createId('MGR-UAT-WORKFLOW'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: safeString(input.testId, ''), workflowType: workflowType, scenario: safeString(input.scenario, '').slice(0, 800), expectedStatus: expected, actualStatus: observed, status: status, workflowReference: safeString(input.workflowReference, '').slice(0, 300), observedLogs: safeString(input.logReference, '').slice(0, 500), validatedBy: access.actor.id, validatedAt: nowIso(context), productionActionExecuted: false, liveWorkflowInvoked: false, immutable: true };
        persist(TABLES.workflowValidations, validation);
        execution.version += 1;
        event(execution, 'WORKFLOW_VALIDATED', { validationId: validation.validationId, workflowType: workflowType, status: status }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('MANAGER_UAT_WORKFLOW_VALIDATED', access.tenantSlug, validation.validationId, { executionId: execution.executionId, workflowType: workflowType, status: status }, context || {});
        return result(status === 'PASSED', status === 'PASSED' ? 'MANAGER_UAT_WORKFLOW_VALIDATED' : 'MANAGER_UAT_WORKFLOW_VALIDATION_FAILED', status === 'PASSED' ? 'Workflow scenario passed validation.' : 'Workflow scenario failed validation.', { validation: validation, executionVersion: execution.version, governance: governanceFlags() });
    }

    function addEvidence(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (input.testId && !execution.caseStates[input.testId]) return result(false, 'MANAGER_UAT_TEST_CASE_NOT_IN_RUN', 'The evidence test case is not part of this execution.');
        var type = token(input.evidenceType || input.type);
        if (EVIDENCE_TYPES.indexOf(type) === -1) return result(false, 'MANAGER_UAT_EVIDENCE_TYPE_INVALID', 'The evidence type is unsupported.');
        var size = safeNumber(input.sizeBytes, 0);
        var max = type === 'VIDEO' ? MAX_RECORDING_BYTES : MAX_ATTACHMENT_BYTES;
        if (size > max) return result(false, 'MANAGER_UAT_EVIDENCE_TOO_LARGE', 'Evidence exceeds the configured size limit.', { maxBytes: max });
        if (['SCREENSHOT', 'VIDEO', 'ATTACHMENT'].indexOf(type) !== -1 && !safeString(input.storageReference || input.attachmentId, '').trim()) return result(false, 'MANAGER_UAT_EVIDENCE_STORAGE_REFERENCE_REQUIRED', 'Uploaded evidence requires a governed storage reference.');
        var evidence = { evidenceId: createId('MGR-UAT-EVIDENCE'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: safeString(input.testId, ''), issueId: safeString(input.issueId, ''), evidenceType: type, title: safeString(input.title, '').slice(0, 300), comment: safeString(input.comment || input.notes, '').slice(0, 2000), storageReference: safeString(input.storageReference || input.attachmentId, '').slice(0, 500), mimeType: safeString(input.mimeType, '').slice(0, 120), sizeBytes: size, checksum: safeString(input.checksum, '').slice(0, 256), fingerprint: fingerprint({ executionId: execution.executionId, testId: input.testId || '', type: type, storageReference: input.storageReference || input.attachmentId || '', checksum: input.checksum || '', sizeBytes: size }), uploadedBy: access.actor.id, uploadedAt: nowIso(context), rawContentStored: false, immutable: true };
        persist(TABLES.evidence, evidence);
        if (input.testId) { execution.caseStates[input.testId].evidenceCount = safeNumber(execution.caseStates[input.testId].evidenceCount, 0) + 1; execution.version += 1; event(execution, 'EVIDENCE_ADDED', { evidenceId: evidence.evidenceId, testId: input.testId, evidenceType: type }, context || {}); replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution); }
        audit('MANAGER_UAT_EVIDENCE_ADDED', access.tenantSlug, evidence.evidenceId, { executionId: execution.executionId, evidenceType: type, fingerprint: evidence.fingerprint }, context || {});
        return result(true, 'MANAGER_UAT_EVIDENCE_ADDED', 'Manager UAT evidence metadata recorded.', { evidence: evidence, executionVersion: execution.version, governance: governanceFlags() });
    }

    function createIssue(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        if (!execution.caseStates[input.testId]) return result(false, 'MANAGER_UAT_TEST_CASE_NOT_IN_RUN', 'The issue test case is not part of this execution.');
        if (!safeString(input.title, '').trim() || !safeString(input.stepsToReproduce || input.steps, '').trim()) return result(false, 'MANAGER_UAT_ISSUE_INVALID', 'Issue title and reproduction steps are required.');
        var issue = { issueId: createId('MGR-UAT-BUG'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: input.testId, title: safeString(input.title, '').slice(0, 400), severity: token(input.severity || 'MEDIUM'), priority: token(input.priority || 'MEDIUM'), module: token(input.module || execution.caseStates[input.testId].module), stepsToReproduce: safeString(input.stepsToReproduce || input.steps, '').slice(0, 3000), assignedDeveloper: safeString(input.assignedDeveloper, '').slice(0, 200), resolutionStatus: 'OPEN', createdBy: access.actor.id, createdAt: nowIso(context), productionDataModified: false, immutableIdentity: true };
        persist(TABLES.issues, issue);
        persist(TABLES.issueHistory, { historyId: createId('MGR-UAT-BUG-HIST'), tenantSlug: access.tenantSlug, issueId: issue.issueId, previousStatus: '', status: 'OPEN', changedBy: access.actor.id, changedAt: issue.createdAt, immutable: true });
        execution.caseStates[input.testId].issueCount = safeNumber(execution.caseStates[input.testId].issueCount, 0) + 1;
        execution.version += 1;
        event(execution, 'ISSUE_CREATED', { issueId: issue.issueId, testId: input.testId, severity: issue.severity }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('MANAGER_UAT_ISSUE_CREATED', access.tenantSlug, issue.issueId, { executionId: execution.executionId, severity: issue.severity }, context || {});
        return result(true, 'MANAGER_UAT_ISSUE_CREATED', 'Manager UAT issue created.', { issue: issue, executionVersion: execution.version, governance: governanceFlags() });
    }

    function updateIssue(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var issue = data[TABLES.issues].find(function find(row) { return sameTenant(row, access.tenantSlug) && row.issueId === input.issueId; });
        if (!issue) return result(false, 'MANAGER_UAT_ISSUE_NOT_FOUND', 'The manager UAT issue was not found.');
        var status = token(input.resolutionStatus || issue.resolutionStatus);
        if (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'].indexOf(status) === -1) return result(false, 'MANAGER_UAT_ISSUE_STATUS_INVALID', 'The issue status is invalid.');
        var previous = issue.resolutionStatus;
        issue.resolutionStatus = status;
        issue.assignedDeveloper = safeString(input.assignedDeveloper || issue.assignedDeveloper, '').slice(0, 200);
        issue.resolutionNotes = safeString(input.resolutionNotes, '').slice(0, 2000);
        issue.updatedAt = nowIso(context);
        replaceRow(TABLES.issues, access.tenantSlug, 'issueId', issue.issueId, issue);
        persist(TABLES.issueHistory, { historyId: createId('MGR-UAT-BUG-HIST'), tenantSlug: access.tenantSlug, issueId: issue.issueId, previousStatus: previous, status: status, changedBy: access.actor.id, changedAt: issue.updatedAt, immutable: true });
        audit('MANAGER_UAT_ISSUE_UPDATED', access.tenantSlug, issue.issueId, { previousStatus: previous, status: status }, context || {});
        return result(true, 'MANAGER_UAT_ISSUE_UPDATED', 'Manager UAT issue updated.', { issue: issue, governance: governanceFlags() });
    }

    function executionMatrix(execution) {
        var states = Object.keys(execution && execution.caseStates || {}).map(function map(id) { return execution.caseStates[id]; });
        var matrix = { passed: 0, failed: 0, blocked: 0, skipped: 0, notExecuted: 0, retested: 0, total: states.length };
        states.forEach(function each(row) { var key = row.status === 'PASSED' ? 'passed' : row.status === 'FAILED' ? 'failed' : row.status === 'BLOCKED' ? 'blocked' : row.status === 'SKIPPED' ? 'skipped' : 'notExecuted'; matrix[key] += 1; if (safeNumber(row.retestCount, 0) > 0) matrix.retested += 1; });
        matrix.executed = matrix.total - matrix.notExecuted;
        matrix.passPercentage = matrix.executed ? clamp((matrix.passed / matrix.executed) * 100) : 0;
        matrix.progressPercentage = matrix.total ? clamp((matrix.executed / matrix.total) * 100) : 0;
        return matrix;
    }

    function generateAnalytics(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = input.executionId ? executionById(data, access.tenantSlug, input.executionId) : data[TABLES.executions].find(function find(row) { return sameTenant(row, access.tenantSlug); });
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        var revocations = activeRevocations(data, access.tenantSlug, execution.executionId);
        var issues = data[TABLES.issues].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && !isRevoked(revocations, 'ISSUE', row.issueId); });
        var approvals = data[TABLES.approvalValidations].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && !isRevoked(revocations, 'APPROVAL_VALIDATION', row.validationId); });
        var workflows = data[TABLES.workflowValidations].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && !isRevoked(revocations, 'WORKFLOW_VALIDATION', row.validationId); });
        var matrix = executionMatrix(execution);
        var openCritical = issues.filter(function keep(row) { return row.severity === 'CRITICAL' && ['RESOLVED', 'CLOSED'].indexOf(row.resolutionStatus) === -1; }).length;
        var approvalSuccessRate = approvals.length ? clamp((approvals.filter(function keep(row) { return row.status === 'PASSED'; }).length / approvals.length) * 100) : 0;
        var workflowSuccessRate = workflows.length ? clamp((workflows.filter(function keep(row) { return row.status === 'PASSED'; }).length / workflows.length) * 100) : 0;
        var moduleMap = {};
        Object.keys(execution.caseStates || {}).forEach(function each(id) { var row = execution.caseStates[id]; var key = row.module || 'OTHER'; if (!moduleMap[key]) moduleMap[key] = { module: key, total: 0, passed: 0, failed: 0 }; moduleMap[key].total += 1; if (row.status === 'PASSED') moduleMap[key].passed += 1; if (['FAILED', 'BLOCKED'].indexOf(row.status) !== -1) moduleMap[key].failed += 1; });
        var moduleHealth = Object.keys(moduleMap).map(function map(key) { var row = moduleMap[key]; row.healthScore = row.total ? clamp((row.passed / row.total) * 100) : 0; return row; });
        var mandatoryFailures = Object.keys(execution.caseStates || {}).filter(function keep(id) { var row = execution.caseStates[id]; return row.mandatory && ['FAILED', 'BLOCKED', 'NOT_EXECUTED', 'SKIPPED'].indexOf(row.status) !== -1; }).length;
        var bugDensity = matrix.total ? Math.round((issues.length / matrix.total) * 1000) / 10 : 0;
        var approvalFactor = approvals.length ? approvalSuccessRate : matrix.passPercentage;
        var workflowFactor = workflows.length ? workflowSuccessRate : matrix.passPercentage;
        var readiness = clamp(matrix.passPercentage * 0.5 + approvalFactor * 0.2 + workflowFactor * 0.2 + Math.max(0, 100 - bugDensity) * 0.1 - mandatoryFailures * 8 - openCritical * 15);
        var analytics = { analyticsId: createId('MGR-UAT-ANALYTICS'), tenantSlug: access.tenantSlug, executionId: execution.executionId, executionProgress: matrix.progressPercentage, passRate: matrix.passPercentage, approvalSuccessRate: approvalSuccessRate, workflowSuccessRate: workflowSuccessRate, bugDensity: bugDensity, managerReadinessScore: readiness, moduleHealth: moduleHealth, matrix: matrix, openCriticalIssues: openCritical, mandatoryFailures: mandatoryFailures, approvalValidationCount: approvals.length, workflowValidationCount: workflows.length, generatedAt: nowIso(context), immutable: true };
        if (!(context && context.skipPersistence)) persist(TABLES.analytics, analytics);
        return result(true, 'MANAGER_UAT_ANALYTICS_GENERATED', 'Manager UAT analytics generated.', { analytics: analytics, governance: governanceFlags() });
    }

    function signatureProvider(context) { if (context && context.signatureProvider && typeof context.signatureProvider.sign === 'function') return context.signatureProvider; try { if (global.ManagerUATDigitalSignatureService && typeof global.ManagerUATDigitalSignatureService.sign === 'function') return global.ManagerUATDigitalSignatureService; } catch (error) {} return null; }
    function stageAllowedForRole(stage, role) { if (['SUPER_ADMIN', 'PLATFORM_OWNER'].indexOf(role) !== -1) return true; if (stage === 'HR_VALIDATION') return ['HR', 'HR_MANAGER', 'HR_HEAD'].indexOf(role) !== -1; return stage === role; }
    function signoff(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        if (input.confirmed !== true) return result(false, 'MANAGER_UAT_SIGNOFF_CONFIRMATION_REQUIRED', 'Explicit sign-off confirmation is required.');
        var stage = token(input.stage || access.actor.role);
        if (SIGNOFF_STAGES.indexOf(stage) === -1) return result(false, 'MANAGER_UAT_SIGNOFF_STAGE_INVALID', 'The sign-off stage is invalid.');
        if (!stageAllowedForRole(stage, access.actor.role)) return result(false, 'MANAGER_UAT_SIGNOFF_ROLE_MISMATCH', 'The signer role does not match the requested sign-off stage.');
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution || execution.status !== 'COMPLETED') return result(false, 'MANAGER_UAT_SIGNOFF_EXECUTION_INCOMPLETE', 'The manager UAT execution must be completed before sign-off.');
        if (execution.outcome !== 'PASSED') return result(false, 'MANAGER_UAT_SIGNOFF_BLOCKED', 'Mandatory manager scenarios must pass before sign-off.');
        if (stage === 'MANAGER' && safeString(input.currentManagerId || execution.managerId, '') !== safeString(execution.managerId, '')) return result(false, 'MANAGER_UAT_MANAGER_CHANGED', 'The manager changed after the execution snapshot; a new run is required.');
        var revocations = activeRevocations(data, access.tenantSlug, execution.executionId);
        var existing = data[TABLES.signoffs].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && row.status === 'SIGNED' && !isRevoked(revocations, 'SIGNOFF', row.signoffId); });
        if (existing.some(function some(row) { return row.stage === stage; })) return result(false, 'MANAGER_UAT_SIGNOFF_CONFLICT', 'This sign-off stage is already completed.');
        var stageIndex = SIGNOFF_STAGES.indexOf(stage);
        var missingPrior = SIGNOFF_STAGES.slice(0, stageIndex).some(function some(required) { return !existing.some(function signed(row) { return row.stage === required; }); });
        if (missingPrior) return result(false, 'MANAGER_UAT_SIGNOFF_SEQUENCE_INVALID', 'Previous manager UAT sign-off stages must be completed first.');
        var criticalOpen = data[TABLES.issues].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && row.severity === 'CRITICAL' && ['RESOLVED', 'CLOSED'].indexOf(row.resolutionStatus) === -1 && !isRevoked(revocations, 'ISSUE', row.issueId); });
        if (criticalOpen) return result(false, 'MANAGER_UAT_SIGNOFF_CRITICAL_ISSUES_OPEN', 'Critical manager UAT issues must be resolved before sign-off.');
        var provider = signatureProvider(context || {});
        if (!provider) return result(false, 'MANAGER_UAT_SIGNATURE_PROVIDER_UNAVAILABLE', 'A configured digital signature provider is required.');
        var envelope = { executionId: execution.executionId, manifestFingerprint: execution.manifestFingerprint, tenantSlug: access.tenantSlug, stage: stage, signerId: access.actor.id, timestamp: nowIso(context), serviceVersion: VERSION };
        var signed;
        try { signed = provider.sign(stableStringify(envelope), { stage: stage, tenantSlug: access.tenantSlug, algorithm: 'SHA-256' }); } catch (error) { return result(false, 'MANAGER_UAT_SIGNATURE_FAILED', 'The digital signature provider failed safely.'); }
        if (!signed || typeof signed.then === 'function' || !safeString(typeof signed === 'string' ? signed : signed.signature, '').trim()) return result(false, 'MANAGER_UAT_SIGNATURE_INVALID', 'The signature provider returned an invalid signature.');
        var row = { signoffId: createId('MGR-UAT-SIGNOFF'), tenantSlug: access.tenantSlug, executionId: execution.executionId, stage: stage, status: 'SIGNED', signerId: access.actor.id, signerRole: access.actor.role, timestamp: envelope.timestamp, remarks: safeString(input.remarks, '').slice(0, 1200), digitalSignature: safeString(typeof signed === 'string' ? signed : signed.signature, ''), signatureAlgorithm: safeString(signed.algorithm || 'SHA-256', 'SHA-256'), signingKeyId: safeString(signed.keyId || 'configured-provider', 'configured-provider'), manifestFingerprint: execution.manifestFingerprint, readyForGoLiveReview: stage === 'HR_VALIDATION', productionDataModified: false, immutable: true };
        persist(TABLES.signoffs, row);
        audit('MANAGER_UAT_SIGNOFF_RECORDED', access.tenantSlug, row.signoffId, { executionId: execution.executionId, stage: stage, manifestFingerprint: execution.manifestFingerprint }, context || {});
        return result(true, 'MANAGER_UAT_SIGNOFF_RECORDED', 'Manager UAT sign-off recorded.', { signoff: row, governance: governanceFlags({ humanSignoffRecorded: true }) });
    }

    function revokeGovernanceRecord(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var entityType = token(input.entityType);
        var map = { SIGNOFF: { table: TABLES.signoffs, id: 'signoffId' }, EVIDENCE: { table: TABLES.evidence, id: 'evidenceId' }, ISSUE: { table: TABLES.issues, id: 'issueId' }, APPROVAL_VALIDATION: { table: TABLES.approvalValidations, id: 'validationId' }, WORKFLOW_VALIDATION: { table: TABLES.workflowValidations, id: 'validationId' } };
        if (!map[entityType]) return result(false, 'MANAGER_UAT_REVOCATION_TYPE_INVALID', 'The governance record type cannot be revoked.');
        if (!safeString(input.reason, '').trim()) return result(false, 'MANAGER_UAT_REVOCATION_REASON_REQUIRED', 'A revocation reason is required.');
        var data = ensureTables(rawData());
        var source = data[map[entityType].table].find(function find(row) { return sameTenant(row, access.tenantSlug) && row[map[entityType].id] === input.entityId; });
        if (!source) return result(false, 'MANAGER_UAT_REVOCATION_TARGET_NOT_FOUND', 'The governance record was not found.');
        if (data[TABLES.revocations].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.entityType === entityType && row.entityId === input.entityId; })) return result(false, 'MANAGER_UAT_REVOCATION_DUPLICATE', 'The governance record is already revoked.');
        var revocation = { revocationId: createId('MGR-UAT-REVOKE'), tenantSlug: access.tenantSlug, executionId: source.executionId || '', entityType: entityType, entityId: input.entityId, reason: safeString(input.reason, '').slice(0, 1200), revokedBy: access.actor.id, revokedAt: nowIso(context), sourceFingerprint: fingerprint(source), sourceRecordPreserved: true, immutable: true };
        persist(TABLES.revocations, revocation);
        audit('MANAGER_UAT_GOVERNANCE_RECORD_REVOKED', access.tenantSlug, revocation.revocationId, { entityType: entityType, entityId: input.entityId, sourceRecordPreserved: true }, context || {});
        return result(true, 'MANAGER_UAT_GOVERNANCE_RECORD_REVOKED', 'Governance record revoked without deleting its audit history.', { revocation: revocation, governance: governanceFlags({ sourceRecordPreserved: true }) });
    }

    function scheduleBackgroundAnalytics(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'MANAGER_UAT_EXECUTION_NOT_FOUND', 'The manager UAT execution was not found.');
        var job = { reportJobId: createId('MGR-UAT-REPORT'), tenantSlug: access.tenantSlug, executionId: execution.executionId, status: 'QUEUED', background: true, cachedOutput: true, requestedBy: access.actor.id, requestedAt: nowIso(context), productionTrafficImpact: 'NONE', immutable: true };
        var queue = null;
        try { if (global.AsyncJobService && typeof global.AsyncJobService.enqueueJob === 'function') queue = global.AsyncJobService.enqueueJob({ tenantSlug: access.tenantSlug, jobType: 'MANAGER_UAT_ANALYTICS', entityId: execution.executionId, metadata: { reportJobId: job.reportJobId } }, context || {}); } catch (error) {}
        job.queueJobId = queue && queue.job && (queue.job.jobId || queue.job.id) || '';
        persist(TABLES.reports, job);
        audit('MANAGER_UAT_BACKGROUND_ANALYTICS_QUEUED', access.tenantSlug, job.reportJobId, { executionId: execution.executionId, queueJobId: job.queueJobId }, context || {});
        return result(true, 'MANAGER_UAT_BACKGROUND_ANALYTICS_QUEUED', 'Background manager UAT analytics queued.', { reportJob: job, queue: queue, governance: governanceFlags() });
    }

    function generateDashboard(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var executions = data[TABLES.executions].filter(function keep(row) { return sameTenant(row, access.tenantSlug); });
        var execution = input.executionId ? executionById(data, access.tenantSlug, input.executionId) : executions[0] || null;
        var analyticsResponse = execution ? generateAnalytics({ tenantSlug: access.tenantSlug, executionId: execution.executionId }, Object.assign({}, context || {}, { skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) : null;
        var revocations = activeRevocations(data, access.tenantSlug, execution && execution.executionId);
        function rows(table, entityType, idField) { return execution ? data[table].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId; }).map(function map(row) { return Object.assign({}, row, { revoked: isRevoked(revocations, entityType, row[idField]) }); }) : []; }
        var cases = execution ? execution.manifest.testCaseSnapshot.map(function map(testCase) { return Object.assign({}, testCase, execution.caseStates[testCase.testId] || {}); }) : [];
        return result(true, 'MANAGER_UAT_DASHBOARD_GENERATED', 'Manager UAT dashboard generated.', {
            tenantSlug: access.tenantSlug,
            activeExecution: execution ? { executionId: execution.executionId, name: execution.name, managerId: execution.managerId, status: execution.status, outcome: execution.outcome || '', version: execution.version, startedAt: execution.startedAt, completedAt: execution.completedAt, manifestFingerprint: execution.manifestFingerprint, reproducible: execution.reproducible } : null,
            executionProgress: analyticsResponse && analyticsResponse.analytics ? analyticsResponse.analytics.executionProgress : 0,
            pendingTests: cases.filter(function keep(row) { return row.status === 'NOT_EXECUTED'; }),
            testCases: cases,
            criticalFailures: cases.filter(function keep(row) { return ['FAILED', 'BLOCKED'].indexOf(row.status) !== -1 && row.priority === 'CRITICAL'; }),
            approvalValidations: rows(TABLES.approvalValidations, 'APPROVAL_VALIDATION', 'validationId'),
            workflowValidations: rows(TABLES.workflowValidations, 'WORKFLOW_VALIDATION', 'validationId'),
            evidence: rows(TABLES.evidence, 'EVIDENCE', 'evidenceId').slice(0, 100),
            issues: rows(TABLES.issues, 'ISSUE', 'issueId').slice(0, 200),
            signoffs: rows(TABLES.signoffs, 'SIGNOFF', 'signoffId'),
            revocations: revocations,
            analytics: analyticsResponse && analyticsResponse.analytics || null,
            executionHistory: executions.slice(0, 50).map(function map(row) { return { executionId: row.executionId, name: row.name, managerId: row.managerId, status: row.status, outcome: row.outcome || '', startedAt: row.startedAt, completedAt: row.completedAt, manifestFingerprint: row.manifestFingerprint }; }),
            generatedAt: nowIso(context),
            governance: governanceFlags()
        });
    }

    function runSelfTest() {
        var snapshot = '';
        try { snapshot = JSON.stringify(rawData()); } catch (error) { snapshot = ''; }
        var checks = [];
        function record(name, passed, details) { checks.push({ name: name, passed: !!passed, details: details || null }); }
        try {
            var tenant = defaultTenant();
            var base = { tenantSlug: tenant, actor: { id: 'SELF-MANAGER', role: 'MANAGER', tenantSlug: tenant }, now: '2026-01-01T00:00:00.000Z', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, signatureProvider: { sign: function sign(value, options) { return { signature: fingerprint({ value: value, stage: options.stage }), algorithm: 'FNV1A-32', keyId: 'SELF-TEST' }; } } };
            initializeLibrary({ tenantSlug: tenant }, Object.assign({}, base, { actor: { id: 'SELF-ADMIN', role: 'ADMIN', tenantSlug: tenant } }));
            var started = startExecution({ tenantSlug: tenant, managerId: 'SELF-MANAGER', suiteIds: [suiteId(tenant, 'LEAVE_APPROVAL')], hierarchySnapshot: { managerId: 'SELF-MANAGER', reportingEmployeeIds: ['SELF-EMPLOYEE'] }, seed: 'SELF-TEST' }, base);
            var testCase = started.execution.manifest.testCaseSnapshot[0];
            var approval = validateApprovalScenario({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, approvalType: 'SINGLE_LEVEL', requesterId: 'SELF-EMPLOYEE', approvers: ['SELF-MANAGER'], actualStatus: 'PASSED', expectedVersion: started.execution.version }, base);
            var workflow = validateWorkflowScenario({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, workflowType: 'LEAVE_REQUEST', actualStatus: 'COMPLETED', expectedVersion: approval.executionVersion }, base);
            var evidence = addEvidence({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, evidenceType: 'COMMENT', comment: 'Self-test evidence.' }, base);
            var testResult = recordTestResult({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, status: 'PASSED', actualResult: 'Expected state observed.', expectedVersion: evidence.executionVersion }, base);
            var completed = completeExecution({ tenantSlug: tenant, executionId: started.execution.executionId, expectedVersion: testResult.executionVersion }, base);
            var manager = signoff({ tenantSlug: tenant, executionId: started.execution.executionId, stage: 'MANAGER', confirmed: true }, base);
            var head = signoff({ tenantSlug: tenant, executionId: started.execution.executionId, stage: 'DEPARTMENT_HEAD', confirmed: true }, Object.assign({}, base, { actor: { id: 'SELF-HEAD', role: 'DEPARTMENT_HEAD', tenantSlug: tenant } }));
            var hr = signoff({ tenantSlug: tenant, executionId: started.execution.executionId, stage: 'HR_VALIDATION', confirmed: true }, Object.assign({}, base, { actor: { id: 'SELF-HR', role: 'HR', tenantSlug: tenant } }));
            var analytics = generateAnalytics({ tenantSlug: tenant, executionId: started.execution.executionId }, Object.assign({}, base, { skipPersistence: true }));
            record('manager test suites work', started.success && started.execution.reproducible);
            record('workflow validation works', workflow.success && workflow.validation.liveWorkflowInvoked === false);
            record('approval validation works', approval.success && approval.validation.productionActionExecuted === false);
            record('evidence upload works', evidence.success && evidence.evidence.rawContentStored === false);
            record('sign-off works', completed.success && manager.success && head.success && hr.success && hr.signoff.readyForGoLiveReview);
            record('analytics generated', analytics.success && analytics.analytics.managerReadinessScore >= 90, analytics.analytics || analytics);
            record('tenant isolation preserved', listLibrary({ tenantSlug: 'different-tenant' }, base).code === 'TENANT_ACCESS_DENIED');
        } catch (error) { record('self-test completes safely', false, safeString(error && error.message, 'Self-test failure')); }
        finally { if (snapshot) { try { saveData(JSON.parse(snapshot)); } catch (error) {} } }
        return freezeOutput({ passed: checks.every(function every(row) { return row.passed; }), timestamp: nowIso(), version: VERSION, summary: 'Manager UAT self-test completed.', checks: checks });
    }

    var ManagerWorkflowValidator = freezeDeep({ validateWorkflowScenario: validateWorkflowScenario }, []);
    var ApprovalValidationEngine = freezeDeep({ validateApprovalScenario: validateApprovalScenario }, []);
    var EvidenceService = freezeDeep({ addEvidence: addEvidence, revokeGovernanceRecord: revokeGovernanceRecord }, []);
    var ManagerSignoffService = freezeDeep({ signoff: signoff, revokeGovernanceRecord: revokeGovernanceRecord }, []);
    var ManagerAnalyticsService = freezeDeep({ generateAnalytics: generateAnalytics, generateDashboard: generateDashboard, scheduleBackgroundAnalytics: scheduleBackgroundAnalytics }, []);
    var CoreManagerUATService = freezeDeep({ initializeLibrary: initializeLibrary, createCustomSuite: createCustomSuite, addTestCase: addTestCase, listLibrary: listLibrary, startExecution: startExecution, pauseExecution: pauseExecution, resumeExecution: resumeExecution, cancelExecution: cancelExecution, recordTestResult: recordTestResult, bulkExecute: bulkExecute, retryFailedCases: retryFailedCases, completeExecution: completeExecution, validateWorkflowScenario: validateWorkflowScenario, validateApprovalScenario: validateApprovalScenario, addEvidence: addEvidence, createIssue: createIssue, updateIssue: updateIssue, signoff: signoff, revokeGovernanceRecord: revokeGovernanceRecord, generateAnalytics: generateAnalytics, generateDashboard: generateDashboard, scheduleBackgroundAnalytics: scheduleBackgroundAnalytics }, []);
    var api = freezeDeep({
        VERSION: VERSION, SOURCE: SOURCE, TABLES: TABLES, EXECUTION_STATES: EXECUTION_STATES, CASE_STATUSES: CASE_STATUSES, APPROVAL_TYPES: APPROVAL_TYPES, WORKFLOW_TYPES: WORKFLOW_TYPES, SIGNOFF_STAGES: SIGNOFF_STAGES, EVIDENCE_TYPES: EVIDENCE_TYPES,
        ManagerUATService: CoreManagerUATService, ManagerWorkflowValidator: ManagerWorkflowValidator, ApprovalValidationEngine: ApprovalValidationEngine, EvidenceService: EvidenceService, ManagerSignoffService: ManagerSignoffService, ManagerAnalyticsService: ManagerAnalyticsService,
        initializeLibrary: initializeLibrary, createCustomSuite: createCustomSuite, addTestCase: addTestCase, listLibrary: listLibrary, startExecution: startExecution, pauseExecution: pauseExecution, resumeExecution: resumeExecution, cancelExecution: cancelExecution, recordTestResult: recordTestResult, bulkExecute: bulkExecute, retryFailedCases: retryFailedCases, completeExecution: completeExecution,
        validateWorkflowScenario: validateWorkflowScenario, validateApprovalScenario: validateApprovalScenario, addEvidence: addEvidence, createIssue: createIssue, updateIssue: updateIssue, signoff: signoff, revokeGovernanceRecord: revokeGovernanceRecord, executionMatrix: executionMatrix, generateAnalytics: generateAnalytics, generateDashboard: generateDashboard, scheduleBackgroundAnalytics: scheduleBackgroundAnalytics,
        fingerprint: fingerprint, freezeOutput: freezeOutput, runSelfTest: runSelfTest, governance: freezeOutput(governanceFlags())
    }, []);
    global.ManagerUATService = api;
    global.managerUATService = api;
    global.ManagerWorkflowValidator = ManagerWorkflowValidator;
    global.ApprovalValidationEngine = ApprovalValidationEngine;
    global.ManagerUATEvidenceService = EvidenceService;
    global.ManagerSignoffService = ManagerSignoffService;
    global.ManagerAnalyticsService = ManagerAnalyticsService;
    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) global.__ARTHHRMS_MANAGER_UAT_SELF_TEST__ = runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
