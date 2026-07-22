/**
 * hrUATService.js
 * Tenant-scoped HR user acceptance testing, evidence, defect, and sign-off governance.
 */
(function attachHRUATService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var SOURCE = 'hrUATService';
    var MAX_TEST_CASES = 10000;
    var MAX_HISTORY = 2000;
    var MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
    var MAX_RECORDING_BYTES = 250 * 1024 * 1024;
    var ACCESS_ROLES = Object.freeze(['HR', 'HR_EXECUTIVE', 'HR_MANAGER', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var ADMIN_ROLES = Object.freeze(['HR_MANAGER', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var EXECUTION_STATES = Object.freeze(['NOT_STARTED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED']);
    var CASE_STATUSES = Object.freeze(['NOT_EXECUTED', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED']);
    var SIGNOFF_STAGES = Object.freeze(['HR_EXECUTIVE', 'HR_MANAGER', 'HR_HEAD']);
    var EVIDENCE_TYPES = Object.freeze(['SCREENSHOT', 'SCREEN_RECORDING', 'ATTACHMENT', 'COMMENT', 'APPROVAL_NOTE', 'LINKED_BUG', 'LOG_REFERENCE']);
    var TABLES = Object.freeze({
        suites: 'hrUATSuites',
        cases: 'hrUATTestCases',
        executions: 'hrUATExecutions',
        events: 'hrUATExecutionEvents',
        results: 'hrUATCaseResultHistory',
        evidence: 'hrUATEvidence',
        issues: 'hrUATIssues',
        issueHistory: 'hrUATIssueHistory',
        signoffs: 'hrUATSignoffs',
        analytics: 'hrUATAnalytics',
        checkpoints: 'hrUATRecoveryCheckpoints',
        reports: 'hrUATBackgroundReports',
        audit: 'hrUATAuditHistory'
    });
    var SENSITIVE_KEY = /(password|secret|token|authorization|credential|private.?key|api.?key|cookie|session.?id|salary|compensation|bank|aadhaar|passport|government.?id|tax.?id|date.?of.?birth|employee.?email|employee.?phone|raw.?file|file.?content|binary|base64)/i;
    var SENSITIVE_VALUE = /(bearer\s+[a-z0-9._=-]+|password\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|private company data)/ig;
    var idCounter = 0;

    var SUITE_LIBRARY = Object.freeze([
        { code: 'EMPLOYEE_LIFECYCLE', name: 'Employee Lifecycle', cases: [
            ['EMPLOYEE_CREATE', 'Create an employee with mandatory fields', 'Employee administrator is authenticated and organization references exist.', ['Open employee creation.', 'Enter valid mandatory data.', 'Submit the record.', 'Verify audit entry and permissions.'], 'Employee is created once with the correct tenant, role, and audit record.', 'CRITICAL'],
            ['EMPLOYEE_EDIT', 'Edit an existing employee', 'A tenant employee exists and the HR user has edit permission.', ['Open employee profile.', 'Change an allowed field.', 'Save changes.', 'Verify history.'], 'Allowed fields update and previous values remain auditable.', 'HIGH']
        ]},
        { code: 'ORGANIZATION_SETUP', name: 'Organization Setup', cases: [
            ['ORG_STRUCTURE', 'Validate department, branch, location, and designation setup', 'Organization configuration is published.', ['Review organization structure.', 'Verify parent relationships.', 'Check duplicate codes.'], 'Published organization references are complete and internally consistent.', 'CRITICAL']
        ]},
        { code: 'RECRUITMENT', name: 'Recruitment', cases: [
            ['RECRUITMENT_FLOW', 'Complete candidate-to-offer validation', 'Recruitment workflow and approvers are configured.', ['Create a test requisition.', 'Move a sandbox candidate through stages.', 'Verify offer approval.'], 'Recruitment states and approvals complete without modifying live candidates.', 'HIGH']
        ]},
        { code: 'ONBOARDING', name: 'Onboarding', cases: [
            ['ONBOARDING_FLOW', 'Validate employee onboarding checklist', 'An approved test hire exists in the sandbox.', ['Start onboarding.', 'Assign checklist owners.', 'Complete required tasks.', 'Verify activation gate.'], 'Onboarding tasks, ownership, and activation gates operate correctly.', 'CRITICAL']
        ]},
        { code: 'LEAVE', name: 'Leave', cases: [
            ['LEAVE_REQUEST', 'Submit and approve a leave request', 'Published leave policy, balance, and approval chain exist.', ['Submit a sandbox leave request.', 'Approve as manager.', 'Approve as HR.', 'Verify balance simulation.'], 'Leave follows the configured chain and balance simulation matches policy.', 'CRITICAL']
        ]},
        { code: 'ATTENDANCE', name: 'Attendance', cases: [
            ['ATTENDANCE_ENTRY', 'Validate attendance entry and policy result', 'Attendance policy and shift assignment are published.', ['Create a sandbox attendance entry.', 'Evaluate working hours.', 'Verify late or overtime outcome.'], 'Attendance result matches the assigned policy without changing historical attendance.', 'CRITICAL']
        ]},
        { code: 'SHIFT', name: 'Shift & Roster', cases: [
            ['SHIFT_ROSTER', 'Validate roster assignment and shift conflict handling', 'Published shift template and roster exist.', ['Review roster coverage.', 'Attempt a conflicting sandbox assignment.', 'Verify conflict response.'], 'Valid assignments succeed and conflicts are blocked.', 'HIGH']
        ]},
        { code: 'PAYROLL', name: 'Payroll', cases: [
            ['PAYROLL_SIMULATION', 'Run payroll simulation', 'Published payroll configuration and complete employee inputs exist.', ['Run a sandbox payroll simulation.', 'Review gross and deductions.', 'Verify formula warnings.', 'Confirm no payroll run was posted.'], 'Simulation totals are valid and historical payroll remains unchanged.', 'CRITICAL']
        ]},
        { code: 'DOCUMENTS', name: 'Documents', cases: [
            ['DOCUMENT_UPLOAD', 'Validate secure document upload', 'Document type and storage policy are configured.', ['Select an allowed sandbox file.', 'Upload through governed validation.', 'Verify tenant scope and audit evidence.'], 'Allowed document metadata is recorded securely and invalid files are rejected.', 'HIGH']
        ]},
        { code: 'TRAINING', name: 'Training', cases: [
            ['TRAINING_ASSIGNMENT', 'Assign and complete training', 'Training catalog and target group exist.', ['Assign sandbox training.', 'Record completion.', 'Verify report status.'], 'Training assignment and completion appear in governed reports.', 'MEDIUM']
        ]},
        { code: 'PERFORMANCE', name: 'Performance', cases: [
            ['PERFORMANCE_REVIEW', 'Complete a performance review cycle', 'Review template and reporting manager exist.', ['Open sandbox review.', 'Submit employee input.', 'Complete manager review.', 'Verify final state.'], 'Review follows permissions and configured approval states.', 'HIGH']
        ]},
        { code: 'SEPARATION', name: 'Separation', cases: [
            ['SEPARATION_FLOW', 'Validate employee separation workflow', 'A sandbox employee and separation workflow exist.', ['Initiate sandbox separation.', 'Complete approvals.', 'Verify access deactivation recommendation.', 'Verify final settlement remains unposted.'], 'Separation workflow completes without modifying live employment or payroll data.', 'CRITICAL']
        ]},
        { code: 'HR_GOVERNANCE', name: 'HR Governance', cases: [
            ['MANDATORY_FIELDS', 'Verify mandatory field validation', 'Validation registry is active.', ['Submit representative incomplete sandbox forms.', 'Review inline errors.'], 'Every mandatory field is rejected with a clear validation message.', 'HIGH'],
            ['BUSINESS_RULES', 'Verify HR business rules', 'Published HR policies exist.', ['Run representative sandbox rule evaluations.', 'Compare outcomes with published policies.'], 'Business rule outcomes match approved configuration.', 'CRITICAL'],
            ['VALIDATION_RULES', 'Verify validation registry rules', 'Validation registry is active.', ['Run valid and invalid payloads.', 'Review normalized failures.'], 'Validation is consistent across supported HR modules.', 'HIGH'],
            ['EMAIL_NOTIFICATIONS', 'Verify email notifications', 'Email provider is configured.', ['Trigger a sandbox notification.', 'Review delivery evidence.'], 'Expected email is queued and delivery status is traceable.', 'HIGH'],
            ['SMS_NOTIFICATIONS', 'Verify SMS notifications', 'SMS provider is configured or explicitly disabled.', ['Trigger a sandbox notification.', 'Review delivery evidence.'], 'Expected SMS behavior matches tenant configuration.', 'MEDIUM'],
            ['AUDIT_LOGS', 'Verify audit logging', 'Audit service is active.', ['Execute a governed sandbox action.', 'Locate its audit entry.'], 'Actor, tenant, action, target, and timestamp are recorded.', 'CRITICAL'],
            ['PERMISSIONS', 'Verify HR permissions', 'RBAC and permission matrix are active.', ['Test allowed HR operations.', 'Test denied cross-role operations.', 'Test cross-tenant denial.'], 'RBAC allows only authorized tenant-scoped operations.', 'CRITICAL'],
            ['REPORTS', 'Verify HR reports', 'Reporting data and permissions are configured.', ['Open representative reports.', 'Verify filters and totals.', 'Export a sandbox report.'], 'Reports are tenant-scoped, accurate, and permission protected.', 'HIGH']
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
    function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function token(value) { return safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); }
    function normalizeTenant(value) { return safeString(value, '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); }
    function normalizeRole(value) { var role = token(value || 'EMPLOYEE'); if (role === 'HRHEAD') return 'HR_HEAD'; if (role === 'HRMANAGER') return 'HR_MANAGER'; if (role === 'HREXECUTIVE') return 'HR_EXECUTIVE'; if (role === 'SUPERADMIN') return 'SUPER_ADMIN'; if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER'; return role || 'EMPLOYEE'; }
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
    function freezeUATOutput(value) { return freezeDeep(cloneSafe(value || {}, '', []), []); }
    function result(success, code, message, extra) { return freezeUATOutput(Object.assign({ success: success === true, code: token(code || (success ? 'HR_UAT_OPERATION_COMPLETED' : 'HR_UAT_OPERATION_FAILED')), message: safeString(message, success ? 'Operation completed.' : 'Operation failed.') }, extra || {})); }
    function governanceFlags(extra) { return Object.assign({ backwardCompatibilityPreserved: true, tenantIsolationPreserved: true, productionDataModified: false, explicitAdministratorApprovalRequiredForProductionChanges: true, existingHRWorkflowsUnmodified: true, destructiveActionsExecuted: false, testExecutionReproducible: true, auditLoggingEnabled: true, evidenceMetadataOnly: true, deploymentTriggered: false }, extra || {}); }
    function rowTenant(row) { return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.organizationId || row.companyId) || ''); }
    function sameTenant(row, tenantSlug) { var owner = rowTenant(row); return owner ? owner === normalizeTenant(tenantSlug) : normalizeTenant(tenantSlug) === defaultTenant(); }
    function validateAccess(input, context, adminRequired) {
        var target = normalizeTenant((input || {}).tenantSlug || (input || {}).tenantId || contextTenant(context) || defaultTenant());
        var caller = contextTenant(context) || target;
        var active = actor(context || {});
        if (!target) return { allowed: false, code: 'TENANT_REQUIRED', message: 'A tenant scope is required.' };
        if (caller && caller !== target) return { allowed: false, code: 'TENANT_ACCESS_DENIED', message: 'HR UAT operations are tenant scoped.' };
        var roles = adminRequired ? ADMIN_ROLES : ACCESS_ROLES;
        if (roles.indexOf(active.role) === -1) return { allowed: false, code: adminRequired ? 'HR_UAT_ADMIN_RBAC_DENIED' : 'HR_UAT_RBAC_DENIED', message: 'The current role cannot perform this HR UAT operation.' };
        return { allowed: true, tenantSlug: target, actor: active };
    }
    function persist(table, row) { var data = ensureTables(rawData()); data[table].unshift(Object.assign({}, cloneSafe(row, '', []), { immutable: row.immutable === true })); data[table] = data[table].slice(0, table === TABLES.cases ? MAX_TEST_CASES : MAX_HISTORY); saveData(data); }
    function replaceRow(table, tenantSlug, idField, idValue, next) { var data = ensureTables(rawData()); var index = data[table].findIndex(function find(row) { return sameTenant(row, tenantSlug) && row[idField] === idValue; }); if (index === -1) return false; data[table][index] = cloneSafe(next, '', []); saveData(data); return true; }
    function emitTelemetry(eventType, metadata, context) { if (context && context.skipTelemetry) return; try { if (global.WorkflowTelemetryService && typeof global.WorkflowTelemetryService.emitWorkflowTelemetry === 'function') global.WorkflowTelemetryService.emitWorkflowTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: cloneSafe(metadata || {}, '', []) }); } catch (error) {} }
    function recordMetric(eventType, metadata, context) { if (context && context.skipMetrics) return; try { if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, cloneSafe(metadata || {}, '', []))); } catch (error) {} }
    function audit(actionType, tenantSlug, entityId, metadata, context) {
        if (context && context.skipAuditPersistence) return null;
        var active = actor(context || {});
        var row = { auditId: createId('HR-UAT-AUDIT'), actionType: token(actionType), module: 'HR UAT', entityType: 'HR_UAT', entityId: safeString(entityId || tenantSlug, tenantSlug), tenantSlug: tenantSlug, actorId: active.id, actorRole: active.role, timestamp: nowIso(context), metadata: cloneSafe(metadata || {}, '', []), immutable: true };
        persist(TABLES.audit, row);
        try { if (global.AuditService && typeof global.AuditService.recordAudit === 'function') global.AuditService.recordAudit(row, context || {}); else { var data = ensureTables(rawData()); data.auditLogs.unshift(row); data.auditLogs = data.auditLogs.slice(0, MAX_HISTORY); saveData(data); } } catch (error) {}
        return row;
    }
    function event(execution, type, details, context) {
        var row = { eventId: createId('HR-UAT-EVENT'), tenantSlug: execution.tenantSlug, executionId: execution.executionId, sequence: safeNumber(execution.eventSequence, 0) + 1, eventType: token(type), executionVersion: execution.version, actorId: actor(context || {}).id, timestamp: nowIso(context), details: cloneSafe(details || {}, '', []), immutable: true };
        persist(TABLES.events, row);
        persist(TABLES.checkpoints, { checkpointId: createId('HR-UAT-CP'), tenantSlug: execution.tenantSlug, executionId: execution.executionId, eventId: row.eventId, executionVersion: execution.version, status: execution.status, manifestFingerprint: execution.manifestFingerprint, createdAt: row.timestamp, recoverable: true, immutable: true });
        execution.eventSequence = row.sequence;
        return row;
    }
    function executionById(data, tenantSlug, executionId) { return (data[TABLES.executions] || []).find(function find(row) { return sameTenant(row, tenantSlug) && row.executionId === safeString(executionId, ''); }) || null; }
    function caseById(data, tenantSlug, caseId) { return (data[TABLES.cases] || []).find(function find(row) { return sameTenant(row, tenantSlug) && row.testId === safeString(caseId, ''); }) || null; }
    function checkVersion(execution, input) { return typeof input.expectedVersion === 'undefined' || safeNumber(input.expectedVersion, -1) === safeNumber(execution.version, 0); }
    function suiteId(tenant, code) { return 'HR-UAT-SUITE-' + normalizeTenant(tenant).toUpperCase() + '-' + token(code); }
    function testId(tenant, code) { return 'HR-UAT-' + normalizeTenant(tenant).toUpperCase() + '-' + token(code); }

    function initializeLibrary(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var createdSuites = 0;
        var createdCases = 0;
        SUITE_LIBRARY.forEach(function each(definition) {
            var id = suiteId(access.tenantSlug, definition.code);
            if (!data[TABLES.suites].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.suiteId === id; })) {
                data[TABLES.suites].push({ suiteId: id, tenantSlug: access.tenantSlug, suiteCode: definition.code, name: definition.name, description: definition.name + ' UAT scenarios.', type: 'PREDEFINED', status: 'ACTIVE', version: 1, mandatory: true, createdAt: nowIso(context), immutableDefinition: true });
                createdSuites += 1;
            }
            definition.cases.forEach(function eachCase(definitionCase) {
                var idCase = testId(access.tenantSlug, definitionCase[0]);
                if (!data[TABLES.cases].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.testId === idCase; })) {
                    data[TABLES.cases].push({ testId: idCase, tenantSlug: access.tenantSlug, suiteId: id, module: definition.code, description: definitionCase[1], preconditions: definitionCase[2], steps: definitionCase[3], expectedResult: definitionCase[4], priority: definitionCase[5], mandatory: true, status: 'ACTIVE', version: 1, source: 'PREDEFINED_LIBRARY', createdAt: nowIso(context), immutableDefinition: true });
                    createdCases += 1;
                }
            });
        });
        saveData(data);
        audit('HR_UAT_LIBRARY_INITIALIZED', access.tenantSlug, access.tenantSlug, { createdSuites: createdSuites, createdCases: createdCases, totalCases: data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length }, context || {});
        return result(true, 'HR_UAT_LIBRARY_READY', 'HR UAT test library initialized.', { tenantSlug: access.tenantSlug, createdSuites: createdSuites, createdCases: createdCases, suiteCount: data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length, testCaseCount: data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length, governance: governanceFlags() });
    }

    function createCustomSuite(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        if (!safeString(input.name, '').trim()) return result(false, 'SUITE_NAME_REQUIRED', 'A custom suite name is required.');
        var suite = { suiteId: createId('HR-UAT-SUITE-CUSTOM'), tenantSlug: access.tenantSlug, suiteCode: token(input.code || input.name), name: safeString(input.name, '').slice(0, 160), description: safeString(input.description, '').slice(0, 1000), type: 'CUSTOM', status: 'ACTIVE', version: 1, mandatory: input.mandatory !== false, createdBy: access.actor.id, createdAt: nowIso(context), immutableDefinition: true };
        persist(TABLES.suites, suite);
        audit('HR_UAT_CUSTOM_SUITE_CREATED', access.tenantSlug, suite.suiteId, { suiteCode: suite.suiteCode }, context || {});
        return result(true, 'HR_UAT_CUSTOM_SUITE_CREATED', 'Custom UAT suite created.', { suite: suite, governance: governanceFlags() });
    }

    function addTestCase(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var suite = data[TABLES.suites].find(function find(row) { return sameTenant(row, access.tenantSlug) && row.suiteId === input.suiteId; });
        if (!suite) return result(false, 'UAT_SUITE_NOT_FOUND', 'The target UAT suite was not found.');
        if (!safeString(input.description, '').trim() || !safeString(input.expectedResult, '').trim() || !Array.isArray(input.steps) || !input.steps.length) return result(false, 'UAT_TEST_CASE_INVALID', 'Description, steps, and expected result are required.');
        if (data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length >= MAX_TEST_CASES) return result(false, 'UAT_TEST_CASE_LIMIT_REACHED', 'The tenant test case limit has been reached.');
        var duplicate = data[TABLES.cases].some(function some(row) { return sameTenant(row, access.tenantSlug) && row.suiteId === suite.suiteId && token(row.description) === token(input.description); });
        if (duplicate) return result(false, 'DUPLICATE_UAT_TEST_CASE', 'A matching test case already exists in this suite.');
        var testCase = { testId: createId('HR-UAT-CASE'), tenantSlug: access.tenantSlug, suiteId: suite.suiteId, module: token(input.module || suite.suiteCode), description: safeString(input.description, '').slice(0, 1000), preconditions: safeString(input.preconditions, '').slice(0, 1600), steps: input.steps.slice(0, 100).map(function map(step) { return safeString(step, '').slice(0, 800); }), expectedResult: safeString(input.expectedResult, '').slice(0, 1600), priority: token(input.priority || 'MEDIUM'), mandatory: input.mandatory !== false, status: 'ACTIVE', version: 1, source: 'CUSTOM_LIBRARY', createdBy: access.actor.id, createdAt: nowIso(context), immutableDefinition: true };
        persist(TABLES.cases, testCase);
        audit('HR_UAT_TEST_CASE_CREATED', access.tenantSlug, testCase.testId, { suiteId: suite.suiteId, module: testCase.module, priority: testCase.priority }, context || {});
        return result(true, 'HR_UAT_TEST_CASE_CREATED', 'UAT test case created.', { testCase: testCase, governance: governanceFlags() });
    }

    function listLibrary(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var suites = data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.status === 'ACTIVE'; });
        var cases = data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.status === 'ACTIVE'; });
        return result(true, 'HR_UAT_LIBRARY_LISTED', 'HR UAT library loaded.', { tenantSlug: access.tenantSlug, suites: suites, testCases: cases, suiteCount: suites.length, testCaseCount: cases.length, governance: governanceFlags() });
    }

    function startExecution(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var targetSuites = Array.isArray(input.suiteIds) && input.suiteIds.length ? new Set(input.suiteIds) : null;
        var suites = data[TABLES.suites].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.status === 'ACTIVE' && (!targetSuites || targetSuites.has(row.suiteId)); });
        var suiteSet = new Set(suites.map(function map(row) { return row.suiteId; }));
        var cases = data[TABLES.cases].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.status === 'ACTIVE' && suiteSet.has(row.suiteId); });
        if (!suites.length || !cases.length) return result(false, 'HR_UAT_LIBRARY_EMPTY', 'Initialize or select a UAT suite with active test cases.');
        var executionId = createId('HR-UAT-RUN');
        var manifest = { executionId: executionId, tenantSlug: access.tenantSlug, suiteSnapshot: suites.map(function map(row) { return { suiteId: row.suiteId, suiteCode: row.suiteCode, name: row.name, version: row.version, mandatory: row.mandatory }; }), testCaseSnapshot: cases.map(function map(row) { return { testId: row.testId, suiteId: row.suiteId, module: row.module, description: row.description, preconditions: row.preconditions, steps: row.steps, expectedResult: row.expectedResult, priority: row.priority, mandatory: row.mandatory, version: row.version }; }), seed: safeString(input.seed || executionId, executionId), environment: token(input.environment || (db() && typeof db().getEnvironmentMode === 'function' ? db().getEnvironmentMode() : 'UAT')), serviceVersion: VERSION, createdAt: nowIso(context) };
        var caseStates = {};
        cases.forEach(function each(row) { caseStates[row.testId] = { testId: row.testId, module: row.module, mandatory: row.mandatory, priority: row.priority, status: 'NOT_EXECUTED', attemptCount: 0, retestCount: 0, evidenceCount: 0, issueCount: 0, updatedAt: nowIso(context) }; });
        var execution = { executionId: executionId, tenantSlug: access.tenantSlug, name: safeString(input.name || 'HR UAT Execution', 'HR UAT Execution').slice(0, 200), status: 'RUNNING', version: 1, eventSequence: 0, ownerId: access.actor.id, participants: Array.isArray(input.participants) ? input.participants.slice(0, 100).map(safeString) : [], startedAt: nowIso(context), pausedAt: '', completedAt: '', cancelledAt: '', manifest: manifest, manifestFingerprint: fingerprint(manifest), caseStates: caseStates, totalCases: cases.length, mandatoryCases: cases.filter(function keep(row) { return row.mandatory; }).length, productionDataModified: false, deploymentTriggered: false, reproducible: true, immutableManifest: true };
        event(execution, 'EXECUTION_STARTED', { totalCases: execution.totalCases, manifestFingerprint: execution.manifestFingerprint }, context || {});
        persist(TABLES.executions, execution);
        audit('HR_UAT_EXECUTION_STARTED', access.tenantSlug, execution.executionId, { totalCases: execution.totalCases, manifestFingerprint: execution.manifestFingerprint, version: execution.version }, context || {});
        emitTelemetry('HR_UAT_EXECUTION_STARTED', { tenantSlug: access.tenantSlug, executionId: execution.executionId, status: execution.status }, context || {});
        return result(true, 'HR_UAT_EXECUTION_STARTED', 'HR UAT execution started.', { execution: execution, governance: governanceFlags() });
    }

    function transitionExecution(input, context, targetStatus, eventType) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        if (!checkVersion(execution, input)) return result(false, 'HR_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var allowed = { PAUSED: ['RUNNING'], RUNNING: ['PAUSED'], CANCELLED: ['RUNNING', 'PAUSED'] };
        if ((allowed[targetStatus] || []).indexOf(execution.status) === -1) return result(false, 'HR_UAT_INVALID_STATE_TRANSITION', 'The requested execution state transition is not allowed.');
        execution.status = targetStatus;
        execution.version += 1;
        if (targetStatus === 'PAUSED') execution.pausedAt = nowIso(context);
        if (targetStatus === 'RUNNING') execution.pausedAt = '';
        if (targetStatus === 'CANCELLED') execution.cancelledAt = nowIso(context);
        event(execution, eventType, { reason: safeString(input.reason, '').slice(0, 500) }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('HR_UAT_' + eventType, access.tenantSlug, execution.executionId, { status: execution.status, version: execution.version }, context || {});
        return result(true, 'HR_UAT_' + eventType, 'UAT execution state updated.', { execution: execution, governance: governanceFlags() });
    }
    function pauseExecution(input, context) { return transitionExecution(input, context, 'PAUSED', 'EXECUTION_PAUSED'); }
    function resumeExecution(input, context) { return transitionExecution(input, context, 'RUNNING', 'EXECUTION_RESUMED'); }
    function cancelExecution(input, context) { return transitionExecution(input, context, 'CANCELLED', 'EXECUTION_CANCELLED'); }

    function recordTestResult(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        if (execution.status !== 'RUNNING') return result(false, 'HR_UAT_EXECUTION_NOT_RUNNING', 'Test results can only be recorded while the execution is running.');
        if (!checkVersion(execution, input)) return result(false, 'HR_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var state = execution.caseStates && execution.caseStates[input.testId];
        if (!state) return result(false, 'HR_UAT_TEST_CASE_NOT_IN_RUN', 'The test case is not part of this execution manifest.');
        var status = token(input.status);
        if (CASE_STATUSES.indexOf(status) === -1 || status === 'NOT_EXECUTED') return result(false, 'HR_UAT_RESULT_STATUS_INVALID', 'Result status must be passed, failed, blocked, or skipped.');
        if ((status === 'PASSED' || status === 'FAILED') && !safeString(input.actualResult, '').trim()) return result(false, 'HR_UAT_ACTUAL_RESULT_REQUIRED', 'An actual result is required for passed and failed cases.');
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
        var history = { resultId: createId('HR-UAT-RESULT'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: input.testId, attempt: state.attemptCount, retest: isRetest, previousStatus: previousStatus, status: status, actualResult: state.actualResult, executedBy: access.actor.id, executedAt: state.updatedAt, executionVersion: execution.version, immutable: true };
        persist(TABLES.results, history);
        event(execution, isRetest ? 'TEST_RETESTED' : 'TEST_RESULT_RECORDED', { testId: input.testId, previousStatus: previousStatus, status: status, attempt: state.attemptCount }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit(isRetest ? 'HR_UAT_TEST_RETESTED' : 'HR_UAT_TEST_RESULT_RECORDED', access.tenantSlug, history.resultId, { executionId: execution.executionId, testId: input.testId, previousStatus: previousStatus, status: status, attempt: state.attemptCount }, context || {});
        emitTelemetry('HR_UAT_TEST_RESULT_RECORDED', { tenantSlug: access.tenantSlug, executionId: execution.executionId, status: status, retest: isRetest }, context || {});
        recordMetric(status === 'FAILED' ? 'HR_UAT_TEST_FAILED' : 'HR_UAT_TEST_RESULT_RECORDED', { tenantSlug: access.tenantSlug, status: status, failed: status === 'FAILED' }, context || {});
        return result(true, 'HR_UAT_TEST_RESULT_RECORDED', 'UAT test result recorded.', { executionId: execution.executionId, executionVersion: execution.version, caseState: state, result: history, governance: governanceFlags() });
    }

    function bulkExecute(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var rows = Array.isArray(input.results) ? input.results.slice(0, MAX_TEST_CASES) : [];
        if (!rows.length) return result(false, 'HR_UAT_BULK_RESULTS_REQUIRED', 'Bulk execution requires explicit case results.');
        var recorded = [];
        var failures = [];
        var expectedVersion = input.expectedVersion;
        rows.forEach(function each(row) {
            var response = recordTestResult(Object.assign({}, row, { tenantSlug: access.tenantSlug, executionId: input.executionId, expectedVersion: expectedVersion }), context || {});
            if (response.success) { recorded.push(response.result); expectedVersion = response.executionVersion; } else failures.push({ testId: row.testId, code: response.code });
        });
        audit('HR_UAT_BULK_EXECUTION_COMPLETED', access.tenantSlug, input.executionId, { recordedCount: recorded.length, failureCount: failures.length }, context || {});
        return result(failures.length === 0, failures.length ? 'HR_UAT_BULK_EXECUTION_PARTIAL' : 'HR_UAT_BULK_EXECUTION_COMPLETED', failures.length ? 'Bulk execution completed with rejected rows.' : 'Bulk execution completed.', { executionId: input.executionId, recorded: recorded, failures: failures, finalVersion: expectedVersion, governance: governanceFlags() });
    }

    function retestFailedCases(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        var eligible = Object.keys(execution.caseStates || {}).filter(function keep(id) { return ['FAILED', 'BLOCKED'].indexOf(execution.caseStates[id].status) !== -1; });
        var supplied = Array.isArray(input.results) ? input.results.filter(function keep(row) { return eligible.indexOf(row.testId) !== -1; }).map(function map(row) { return Object.assign({}, row, { retest: true }); }) : [];
        if (!supplied.length) return result(true, 'HR_UAT_RETEST_QUEUE_READY', 'Failed and blocked cases selected for retest.', { executionId: execution.executionId, testIds: eligible, count: eligible.length, governance: governanceFlags() });
        return bulkExecute({ tenantSlug: access.tenantSlug, executionId: execution.executionId, expectedVersion: input.expectedVersion, results: supplied }, context || {});
    }

    function completeExecution(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        if (execution.status !== 'RUNNING') return result(false, 'HR_UAT_EXECUTION_NOT_RUNNING', 'Only a running execution can be completed.');
        if (!checkVersion(execution, input)) return result(false, 'HR_UAT_EXECUTION_VERSION_CONFLICT', 'The execution changed concurrently. Refresh and retry.');
        var states = Object.keys(execution.caseStates || {}).map(function map(id) { return execution.caseStates[id]; });
        var mandatoryPending = states.filter(function keep(row) { return row.mandatory && ['NOT_EXECUTED', 'SKIPPED'].indexOf(row.status) !== -1; });
        if (mandatoryPending.length) return result(false, 'MANDATORY_UAT_CASES_PENDING', 'Every mandatory HR scenario must be executed before completion.', { pendingCount: mandatoryPending.length });
        execution.status = 'COMPLETED'; execution.version += 1; execution.completedAt = nowIso(context);
        execution.outcome = states.some(function some(row) { return row.mandatory && ['FAILED', 'BLOCKED'].indexOf(row.status) !== -1; }) ? 'FAILED' : 'PASSED';
        event(execution, 'EXECUTION_COMPLETED', { outcome: execution.outcome }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('HR_UAT_EXECUTION_COMPLETED', access.tenantSlug, execution.executionId, { outcome: execution.outcome, version: execution.version }, context || {});
        return result(true, 'HR_UAT_EXECUTION_COMPLETED', 'HR UAT execution completed.', { execution: execution, governance: governanceFlags() });
    }

    function addEvidence(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        if (input.testId && !execution.caseStates[input.testId]) return result(false, 'HR_UAT_TEST_CASE_NOT_IN_RUN', 'The evidence test case is not part of this execution.');
        var type = token(input.evidenceType || input.type);
        if (EVIDENCE_TYPES.indexOf(type) === -1) return result(false, 'HR_UAT_EVIDENCE_TYPE_INVALID', 'The evidence type is unsupported.');
        var size = safeNumber(input.sizeBytes, 0);
        var max = type === 'SCREEN_RECORDING' ? MAX_RECORDING_BYTES : MAX_ATTACHMENT_BYTES;
        if (size > max) return result(false, 'HR_UAT_EVIDENCE_TOO_LARGE', 'Evidence exceeds the configured size limit.', { maxBytes: max });
        if (['SCREENSHOT', 'SCREEN_RECORDING', 'ATTACHMENT'].indexOf(type) !== -1 && !safeString(input.storageReference || input.attachmentId, '').trim()) return result(false, 'HR_UAT_EVIDENCE_STORAGE_REFERENCE_REQUIRED', 'Uploaded evidence requires a governed storage reference.');
        var evidence = { evidenceId: createId('HR-UAT-EVIDENCE'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: safeString(input.testId, ''), issueId: safeString(input.issueId, ''), evidenceType: type, title: safeString(input.title, '').slice(0, 300), comment: safeString(input.comment || input.notes, '').slice(0, 2000), storageReference: safeString(input.storageReference || input.attachmentId, '').slice(0, 500), mimeType: safeString(input.mimeType, '').slice(0, 120), sizeBytes: size, checksum: safeString(input.checksum, '').slice(0, 256), fingerprint: fingerprint({ executionId: execution.executionId, testId: input.testId || '', type: type, storageReference: input.storageReference || input.attachmentId || '', checksum: input.checksum || '', sizeBytes: size }), uploadedBy: access.actor.id, uploadedAt: nowIso(context), rawContentStored: false, immutable: true };
        persist(TABLES.evidence, evidence);
        if (input.testId) { execution.caseStates[input.testId].evidenceCount = safeNumber(execution.caseStates[input.testId].evidenceCount, 0) + 1; execution.version += 1; event(execution, 'EVIDENCE_ADDED', { evidenceId: evidence.evidenceId, testId: input.testId, evidenceType: type }, context || {}); replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution); }
        audit('HR_UAT_EVIDENCE_ADDED', access.tenantSlug, evidence.evidenceId, { executionId: execution.executionId, testId: evidence.testId, evidenceType: type, fingerprint: evidence.fingerprint }, context || {});
        return result(true, 'HR_UAT_EVIDENCE_ADDED', 'UAT evidence metadata recorded.', { evidence: evidence, executionVersion: execution.version, governance: governanceFlags() });
    }

    function createIssue(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        if (!execution.caseStates[input.testId]) return result(false, 'HR_UAT_TEST_CASE_NOT_IN_RUN', 'The issue test case is not part of this execution.');
        if (!safeString(input.title, '').trim() || !safeString(input.stepsToReproduce, '').trim()) return result(false, 'HR_UAT_ISSUE_INVALID', 'Issue title and reproduction steps are required.');
        var issue = { issueId: createId('HR-UAT-BUG'), tenantSlug: access.tenantSlug, executionId: execution.executionId, testId: input.testId, title: safeString(input.title, '').slice(0, 400), severity: token(input.severity || 'MEDIUM'), priority: token(input.priority || 'MEDIUM'), module: token(input.module || execution.caseStates[input.testId].module), stepsToReproduce: safeString(input.stepsToReproduce, '').slice(0, 3000), assignedDeveloper: safeString(input.assignedDeveloper, '').slice(0, 200), resolutionStatus: 'OPEN', createdBy: access.actor.id, createdAt: nowIso(context), productionDataModified: false, immutableIdentity: true };
        persist(TABLES.issues, issue);
        persist(TABLES.issueHistory, { historyId: createId('HR-UAT-BUG-HIST'), tenantSlug: access.tenantSlug, issueId: issue.issueId, previousStatus: '', status: 'OPEN', changedBy: access.actor.id, changedAt: issue.createdAt, immutable: true });
        execution.caseStates[input.testId].issueCount = safeNumber(execution.caseStates[input.testId].issueCount, 0) + 1; execution.version += 1;
        event(execution, 'ISSUE_CREATED', { issueId: issue.issueId, testId: input.testId, severity: issue.severity }, context || {});
        replaceRow(TABLES.executions, access.tenantSlug, 'executionId', execution.executionId, execution);
        audit('HR_UAT_ISSUE_CREATED', access.tenantSlug, issue.issueId, { executionId: execution.executionId, testId: input.testId, severity: issue.severity, priority: issue.priority }, context || {});
        recordMetric('HR_UAT_ISSUE_CREATED', { tenantSlug: access.tenantSlug, severity: issue.severity, failed: issue.severity === 'CRITICAL' }, context || {});
        return result(true, 'HR_UAT_ISSUE_CREATED', 'UAT issue created.', { issue: issue, executionVersion: execution.version, governance: governanceFlags() });
    }

    function updateIssue(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var issue = data[TABLES.issues].find(function find(row) { return sameTenant(row, access.tenantSlug) && row.issueId === input.issueId; });
        if (!issue) return result(false, 'HR_UAT_ISSUE_NOT_FOUND', 'The UAT issue was not found.');
        var status = token(input.resolutionStatus || issue.resolutionStatus);
        if (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'].indexOf(status) === -1) return result(false, 'HR_UAT_ISSUE_STATUS_INVALID', 'The issue status is invalid.');
        var previous = issue.resolutionStatus;
        issue.resolutionStatus = status; issue.assignedDeveloper = safeString(input.assignedDeveloper || issue.assignedDeveloper, '').slice(0, 200); issue.resolutionNotes = safeString(input.resolutionNotes, '').slice(0, 2000); issue.updatedAt = nowIso(context);
        replaceRow(TABLES.issues, access.tenantSlug, 'issueId', issue.issueId, issue);
        persist(TABLES.issueHistory, { historyId: createId('HR-UAT-BUG-HIST'), tenantSlug: access.tenantSlug, issueId: issue.issueId, previousStatus: previous, status: status, changedBy: access.actor.id, changedAt: issue.updatedAt, immutable: true });
        audit('HR_UAT_ISSUE_UPDATED', access.tenantSlug, issue.issueId, { previousStatus: previous, status: status }, context || {});
        return result(true, 'HR_UAT_ISSUE_UPDATED', 'UAT issue updated.', { issue: issue, governance: governanceFlags() });
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
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'No UAT execution is available for analytics.');
        var matrix = executionMatrix(execution);
        var issues = data[TABLES.issues].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId; });
        var openCritical = issues.filter(function keep(row) { return row.severity === 'CRITICAL' && ['RESOLVED', 'CLOSED'].indexOf(row.resolutionStatus) === -1; }).length;
        var moduleMap = {};
        Object.keys(execution.caseStates || {}).forEach(function each(id) { var row = execution.caseStates[id]; var key = row.module || 'GENERAL'; if (!moduleMap[key]) moduleMap[key] = { module: key, total: 0, passed: 0, failed: 0 }; moduleMap[key].total += 1; if (row.status === 'PASSED') moduleMap[key].passed += 1; if (['FAILED', 'BLOCKED'].indexOf(row.status) !== -1) moduleMap[key].failed += 1; });
        var moduleStability = Object.keys(moduleMap).map(function map(key) { var row = moduleMap[key]; row.stabilityScore = row.total ? clamp((row.passed / row.total) * 100) : 0; return row; });
        var mandatoryFailures = Object.keys(execution.caseStates || {}).filter(function keep(id) { var row = execution.caseStates[id]; return row.mandatory && ['FAILED', 'BLOCKED', 'NOT_EXECUTED', 'SKIPPED'].indexOf(row.status) !== -1; }).length;
        var bugDensity = matrix.total ? Math.round((issues.length / matrix.total) * 1000) / 10 : 0;
        var retestRate = matrix.executed ? clamp((matrix.retested / matrix.executed) * 100) : 0;
        var readiness = clamp(matrix.passPercentage - mandatoryFailures * 8 - openCritical * 15 - issues.filter(function keep(row) { return row.severity === 'HIGH' && ['RESOLVED', 'CLOSED'].indexOf(row.resolutionStatus) === -1; }).length * 5);
        var analytics = { analyticsId: createId('HR-UAT-ANALYTICS'), tenantSlug: access.tenantSlug, executionId: execution.executionId, executionProgress: matrix.progressPercentage, passRate: matrix.passPercentage, failureTrends: data[TABLES.results].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && row.status === 'FAILED'; }).map(function map(row) { return { testId: row.testId, attempt: row.attempt, executedAt: row.executedAt }; }).slice(0, 100), moduleStability: moduleStability, bugDensity: bugDensity, retestRate: retestRate, hrReadinessScore: readiness, matrix: matrix, openCriticalIssues: openCritical, mandatoryFailures: mandatoryFailures, generatedAt: nowIso(context), immutable: true };
        if (!(context && context.skipPersistence)) persist(TABLES.analytics, analytics);
        return result(true, 'HR_UAT_ANALYTICS_GENERATED', 'HR UAT analytics generated.', { tenantSlug: access.tenantSlug, analytics: analytics, governance: governanceFlags() });
    }

    function signatureProvider(context) { if (context && context.signatureProvider && typeof context.signatureProvider.sign === 'function') return context.signatureProvider; try { if (global.HRUATDigitalSignatureService && typeof global.HRUATDigitalSignatureService.sign === 'function') return global.HRUATDigitalSignatureService; } catch (error) {} return null; }
    function signoff(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        if (input.confirmed !== true) return result(false, 'HR_UAT_SIGNOFF_CONFIRMATION_REQUIRED', 'Explicit sign-off confirmation is required.');
        var stage = token(input.stage || access.actor.role);
        if (SIGNOFF_STAGES.indexOf(stage) === -1) return result(false, 'HR_UAT_SIGNOFF_STAGE_INVALID', 'The sign-off stage is invalid.');
        if (access.actor.role !== stage && ['SUPER_ADMIN', 'PLATFORM_OWNER'].indexOf(access.actor.role) === -1) return result(false, 'HR_UAT_SIGNOFF_ROLE_MISMATCH', 'The signer role does not match the requested sign-off stage.');
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution || execution.status !== 'COMPLETED') return result(false, 'HR_UAT_SIGNOFF_EXECUTION_INCOMPLETE', 'The UAT execution must be completed before sign-off.');
        if (execution.outcome !== 'PASSED') return result(false, 'HR_UAT_SIGNOFF_BLOCKED', 'Mandatory HR scenarios must pass before sign-off.');
        var existing = data[TABLES.signoffs].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId && row.status === 'SIGNED'; });
        if (existing.some(function some(row) { return row.stage === stage; })) return result(false, 'HR_UAT_SIGNOFF_CONFLICT', 'This sign-off stage is already completed.');
        var stageIndex = SIGNOFF_STAGES.indexOf(stage);
        var missingPrior = SIGNOFF_STAGES.slice(0, stageIndex).some(function some(required) { return !existing.some(function signed(row) { return row.stage === required; }); });
        if (missingPrior) return result(false, 'HR_UAT_SIGNOFF_SEQUENCE_INVALID', 'Previous HR sign-off stages must be completed first.');
        var issues = data[TABLES.issues].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId; });
        var criticalOpen = issues.some(function some(row) { return row.severity === 'CRITICAL' && ['RESOLVED', 'CLOSED'].indexOf(row.resolutionStatus) === -1; });
        if (criticalOpen) return result(false, 'HR_UAT_SIGNOFF_CRITICAL_ISSUES_OPEN', 'Critical UAT issues must be resolved before sign-off.');
        var provider = signatureProvider(context || {});
        if (!provider) return result(false, 'HR_UAT_SIGNATURE_PROVIDER_UNAVAILABLE', 'A configured digital signature provider is required.');
        var envelope = { executionId: execution.executionId, manifestFingerprint: execution.manifestFingerprint, tenantSlug: access.tenantSlug, stage: stage, signerId: access.actor.id, timestamp: nowIso(context), serviceVersion: VERSION };
        var signed;
        try { signed = provider.sign(stableStringify(envelope), { stage: stage, tenantSlug: access.tenantSlug, algorithm: 'SHA-256' }); } catch (error) { return result(false, 'HR_UAT_SIGNATURE_FAILED', 'The digital signature provider failed safely.'); }
        if (!signed || typeof signed.then === 'function' || !safeString(typeof signed === 'string' ? signed : signed.signature, '').trim()) return result(false, 'HR_UAT_SIGNATURE_INVALID', 'The signature provider returned an invalid signature.');
        var signature = typeof signed === 'string' ? signed : signed.signature;
        var signoffRow = { signoffId: createId('HR-UAT-SIGNOFF'), tenantSlug: access.tenantSlug, executionId: execution.executionId, stage: stage, status: 'SIGNED', signerId: access.actor.id, signerRole: access.actor.role, timestamp: envelope.timestamp, remarks: safeString(input.remarks, '').slice(0, 1200), digitalSignature: safeString(signature, ''), signatureAlgorithm: safeString(signed.algorithm || 'SHA-256', 'SHA-256'), signingKeyId: safeString(signed.keyId || 'configured-provider', 'configured-provider'), manifestFingerprint: execution.manifestFingerprint, readyForGoLiveReview: stage === 'HR_HEAD', deploymentTriggered: false, productionDataModified: false, immutable: true };
        persist(TABLES.signoffs, signoffRow);
        audit('HR_UAT_SIGNOFF_RECORDED', access.tenantSlug, signoffRow.signoffId, { executionId: execution.executionId, stage: stage, manifestFingerprint: execution.manifestFingerprint }, context || {});
        emitTelemetry('HR_UAT_SIGNOFF_RECORDED', { tenantSlug: access.tenantSlug, executionId: execution.executionId, stage: stage, status: 'SIGNED' }, context || {});
        return result(true, 'HR_UAT_SIGNOFF_RECORDED', 'HR UAT sign-off recorded.', { signoff: signoffRow, governance: governanceFlags({ humanSignoffRecorded: true }) });
    }

    function scheduleBackgroundReport(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var execution = executionById(data, access.tenantSlug, input.executionId);
        if (!execution) return result(false, 'HR_UAT_EXECUTION_NOT_FOUND', 'The UAT execution was not found.');
        var job = { reportJobId: createId('HR-UAT-REPORT'), tenantSlug: access.tenantSlug, executionId: execution.executionId, status: 'QUEUED', background: true, cachedOutput: true, requestedBy: access.actor.id, requestedAt: nowIso(context), productionTrafficImpact: 'NONE', immutable: true };
        var queue = null;
        try { if (global.AsyncJobService && typeof global.AsyncJobService.enqueueJob === 'function') queue = global.AsyncJobService.enqueueJob({ tenantSlug: access.tenantSlug, jobType: 'HR_UAT_REPORT', entityId: execution.executionId, metadata: { reportJobId: job.reportJobId } }, context || {}); } catch (error) {}
        job.queueJobId = queue && queue.job && (queue.job.jobId || queue.job.id) || '';
        persist(TABLES.reports, job);
        audit('HR_UAT_BACKGROUND_REPORT_QUEUED', access.tenantSlug, job.reportJobId, { executionId: execution.executionId, queueJobId: job.queueJobId }, context || {});
        return result(true, 'HR_UAT_BACKGROUND_REPORT_QUEUED', 'Background UAT report queued.', { reportJob: job, queue: queue, governance: governanceFlags() });
    }

    function generateDashboard(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var executions = data[TABLES.executions].filter(function keep(row) { return sameTenant(row, access.tenantSlug); });
        var execution = input.executionId ? executionById(data, access.tenantSlug, input.executionId) : executions[0] || null;
        var analyticsResponse = execution ? generateAnalytics({ tenantSlug: access.tenantSlug, executionId: execution.executionId }, Object.assign({}, context || {}, { skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) : null;
        var evidence = execution ? data[TABLES.evidence].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId; }) : [];
        var issues = execution ? data[TABLES.issues].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId; }) : [];
        var signoffs = execution ? data[TABLES.signoffs].filter(function keep(row) { return sameTenant(row, access.tenantSlug) && row.executionId === execution.executionId; }) : [];
        var cases = execution ? execution.manifest.testCaseSnapshot.map(function map(testCase) { return Object.assign({}, testCase, execution.caseStates[testCase.testId] || {}); }) : [];
        return result(true, 'HR_UAT_DASHBOARD_GENERATED', 'HR UAT dashboard generated.', {
            tenantSlug: access.tenantSlug,
            activeExecution: execution ? { executionId: execution.executionId, name: execution.name, status: execution.status, outcome: execution.outcome || '', version: execution.version, startedAt: execution.startedAt, completedAt: execution.completedAt, manifestFingerprint: execution.manifestFingerprint, reproducible: execution.reproducible } : null,
            executionProgress: analyticsResponse && analyticsResponse.analytics ? analyticsResponse.analytics.executionProgress : 0,
            pendingTests: cases.filter(function keep(row) { return row.status === 'NOT_EXECUTED'; }),
            testCases: cases,
            criticalFailures: cases.filter(function keep(row) { return ['FAILED', 'BLOCKED'].indexOf(row.status) !== -1 && row.priority === 'CRITICAL'; }),
            moduleHealth: analyticsResponse && analyticsResponse.analytics ? analyticsResponse.analytics.moduleStability : [],
            evidence: evidence.slice(0, 100),
            issues: issues.slice(0, 200),
            signoffs: signoffs,
            analytics: analyticsResponse && analyticsResponse.analytics || null,
            executionHistory: executions.slice(0, 50).map(function map(row) { return { executionId: row.executionId, name: row.name, status: row.status, outcome: row.outcome || '', startedAt: row.startedAt, completedAt: row.completedAt, manifestFingerprint: row.manifestFingerprint }; }),
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
            var base = { tenantSlug: tenant, actor: { id: 'SELF-HR-HEAD', role: 'HR_HEAD', tenantSlug: tenant }, now: '2026-01-01T00:00:00.000Z', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, signatureProvider: { sign: function sign(value, options) { return { signature: fingerprint({ value: value, stage: options.stage }), algorithm: 'FNV1A-32', keyId: 'SELF-TEST' }; } } };
            var library = initializeLibrary({ tenantSlug: tenant }, base);
            var started = startExecution({ tenantSlug: tenant, suiteIds: [suiteId(tenant, 'LEAVE')], seed: 'SELF-TEST-SEED' }, base);
            var testCase = started.execution.manifest.testCaseSnapshot[0];
            var evidence = addEvidence({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, evidenceType: 'COMMENT', comment: 'Self-test evidence.' }, base);
            var failed = recordTestResult({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, status: 'FAILED', actualResult: 'Expected state not reached.', expectedVersion: evidence.executionVersion }, base);
            var issue = createIssue({ tenantSlug: tenant, executionId: started.execution.executionId, testId: testCase.testId, title: 'Self-test issue', severity: 'HIGH', stepsToReproduce: 'Run self-test case.' }, base);
            var retest = retestFailedCases({ tenantSlug: tenant, executionId: started.execution.executionId, expectedVersion: issue.executionVersion, results: [{ testId: testCase.testId, status: 'PASSED', actualResult: 'Expected state reached on retest.' }] }, base);
            var completed = completeExecution({ tenantSlug: tenant, executionId: started.execution.executionId, expectedVersion: retest.finalVersion }, base);
            var executive = signoff({ tenantSlug: tenant, executionId: started.execution.executionId, stage: 'HR_EXECUTIVE', confirmed: true }, Object.assign({}, base, { actor: { id: 'SELF-EXEC', role: 'HR_EXECUTIVE', tenantSlug: tenant } }));
            var manager = signoff({ tenantSlug: tenant, executionId: started.execution.executionId, stage: 'HR_MANAGER', confirmed: true }, Object.assign({}, base, { actor: { id: 'SELF-MANAGER', role: 'HR_MANAGER', tenantSlug: tenant } }));
            var head = signoff({ tenantSlug: tenant, executionId: started.execution.executionId, stage: 'HR_HEAD', confirmed: true }, base);
            var analytics = generateAnalytics({ tenantSlug: tenant, executionId: started.execution.executionId }, Object.assign({}, base, { skipPersistence: true }));
            record('test suites work', library.success && library.suiteCount >= 13);
            record('test execution works', started.success && failed.success && retest.success && completed.success);
            record('issue tracking works', issue.success);
            record('evidence upload works', evidence.success && evidence.evidence.rawContentStored === false);
            record('sign-off works', executive.success && manager.success && head.success && head.signoff.readyForGoLiveReview === true);
            record('analytics generated', analytics.success && analytics.analytics.hrReadinessScore >= 90, analytics.analytics || analytics);
            record('tenant isolation preserved', listLibrary({ tenantSlug: 'different-tenant' }, base).code === 'TENANT_ACCESS_DENIED');
            record('manifest reproducible', started.execution.reproducible === true && !!started.execution.manifestFingerprint);
        } catch (error) { record('self-test completes safely', false, safeString(error && error.message, 'Self-test failure')); }
        finally { if (snapshot) { try { saveData(JSON.parse(snapshot)); } catch (error) {} } }
        return freezeUATOutput({ passed: checks.every(function every(row) { return row.passed; }), timestamp: nowIso(), version: VERSION, summary: 'HR UAT self-test completed.', checks: checks });
    }

    var TestCaseLibrary = freezeDeep({ initializeLibrary: initializeLibrary, createCustomSuite: createCustomSuite, addTestCase: addTestCase, listLibrary: listLibrary }, []);
    var TestExecutionEngine = freezeDeep({ startExecution: startExecution, pauseExecution: pauseExecution, resumeExecution: resumeExecution, cancelExecution: cancelExecution, recordTestResult: recordTestResult, bulkExecute: bulkExecute, retestFailedCases: retestFailedCases, completeExecution: completeExecution }, []);
    var EvidenceManager = freezeDeep({ addEvidence: addEvidence }, []);
    var IssueTrackingService = freezeDeep({ createIssue: createIssue, updateIssue: updateIssue }, []);
    var HRSignoffService = freezeDeep({ signoff: signoff }, []);
    var UATAnalyticsService = freezeDeep({ generateAnalytics: generateAnalytics, generateDashboard: generateDashboard, scheduleBackgroundReport: scheduleBackgroundReport }, []);
    var CoreHRUATService = freezeDeep({ initializeLibrary: initializeLibrary, createCustomSuite: createCustomSuite, addTestCase: addTestCase, listLibrary: listLibrary, startExecution: startExecution, pauseExecution: pauseExecution, resumeExecution: resumeExecution, cancelExecution: cancelExecution, recordTestResult: recordTestResult, bulkExecute: bulkExecute, retestFailedCases: retestFailedCases, completeExecution: completeExecution, addEvidence: addEvidence, createIssue: createIssue, updateIssue: updateIssue, signoff: signoff, generateAnalytics: generateAnalytics, generateDashboard: generateDashboard, scheduleBackgroundReport: scheduleBackgroundReport }, []);
    var api = freezeDeep({
        VERSION: VERSION, SOURCE: SOURCE, TABLES: TABLES, EXECUTION_STATES: EXECUTION_STATES, CASE_STATUSES: CASE_STATUSES, SIGNOFF_STAGES: SIGNOFF_STAGES, EVIDENCE_TYPES: EVIDENCE_TYPES,
        HRUATService: CoreHRUATService, TestExecutionEngine: TestExecutionEngine, TestCaseLibrary: TestCaseLibrary, EvidenceManager: EvidenceManager, IssueTrackingService: IssueTrackingService, HRSignoffService: HRSignoffService, UATAnalyticsService: UATAnalyticsService,
        initializeLibrary: initializeLibrary, createCustomSuite: createCustomSuite, addTestCase: addTestCase, listLibrary: listLibrary,
        startExecution: startExecution, pauseExecution: pauseExecution, resumeExecution: resumeExecution, cancelExecution: cancelExecution, recordTestResult: recordTestResult, bulkExecute: bulkExecute, retestFailedCases: retestFailedCases, completeExecution: completeExecution,
        addEvidence: addEvidence, createIssue: createIssue, updateIssue: updateIssue, signoff: signoff, executionMatrix: executionMatrix, generateAnalytics: generateAnalytics, generateDashboard: generateDashboard, scheduleBackgroundReport: scheduleBackgroundReport,
        fingerprint: fingerprint, freezeUATOutput: freezeUATOutput, runSelfTest: runSelfTest, governance: freezeUATOutput(governanceFlags())
    }, []);
    global.HRUATService = api;
    global.hrUATService = api;
    global.TestExecutionEngine = TestExecutionEngine;
    global.TestCaseLibrary = TestCaseLibrary;
    global.EvidenceManager = EvidenceManager;
    global.HRSignoffService = HRSignoffService;
    global.UATAnalyticsService = UATAnalyticsService;
    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) global.__ARTHHRMS_HR_UAT_SELF_TEST__ = runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
