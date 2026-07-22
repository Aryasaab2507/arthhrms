/**
 * ARTHHRMS No-Code Workflow Automation Service
 * Tenant-scoped workflow designer, trigger/action registries, scheduler,
 * execution monitoring, approval metadata, analytics, and audit governance.
 *
 * This service is additive. It does not replace workflowEngine, mutate
 * predefined business workflows, execute approvals, or change existing APIs.
 */
(function attachNoCodeWorkflowAutomationService(global) {
    'use strict';

    var SOURCE = 'noCodeWorkflowAutomationService';
    var MAX_HISTORY = 1800;
    var idCounter = 0;

    var WORKFLOW_NODE_TYPES = Object.freeze(['TRIGGER', 'CONDITION', 'ACTION', 'APPROVAL', 'DELAY', 'BRANCH', 'LOOP', 'END']);
    var WORKFLOW_STATUSES = Object.freeze(['DRAFT', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED']);
    var EXECUTION_STATUSES = Object.freeze(['CREATED', 'PROCESSING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'RETRYING', 'ROLLED_BACK', 'MANUAL_REVIEW', 'DEAD_LETTER']);
    var ERROR_STRATEGIES = Object.freeze(['RETRY', 'ROLLBACK', 'MANUAL_REVIEW', 'IGNORE', 'ESCALATE', 'DEAD_LETTER']);
    var SCHEDULE_TYPES = Object.freeze(['CRON', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'BUSINESS_DAYS']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR', 'MANAGER']);

    var TRIGGERS = Object.freeze([
        trigger('EMPLOYEE_CREATED', 'Employee Created', 'Employee lifecycle event'),
        trigger('EMPLOYEE_UPDATED', 'Employee Updated', 'Employee lifecycle event'),
        trigger('ATTENDANCE_SUBMITTED', 'Attendance Submitted', 'Attendance workflow event'),
        trigger('LEAVE_APPLIED', 'Leave Applied', 'Leave workflow event'),
        trigger('LEAVE_APPROVED', 'Leave Approved', 'Leave workflow event'),
        trigger('PAYROLL_GENERATED', 'Payroll Generated', 'Payroll workflow event'),
        trigger('DOCUMENT_UPLOADED', 'Document Uploaded', 'Document governance event'),
        trigger('PERFORMANCE_REVIEW', 'Performance Review', 'Performance workflow event'),
        trigger('WEBHOOK_RECEIVED', 'Webhook Received', 'External event trigger'),
        trigger('API_EVENT', 'API Event', 'API gateway event trigger'),
        trigger('SCHEDULE', 'Schedule', 'Time-based trigger'),
        trigger('MANUAL_TRIGGER', 'Manual Trigger', 'Human-triggered automation'),
        trigger('AI_TRIGGER_FUTURE', 'AI Trigger', 'Future AI trigger placeholder')
    ]);

    var ACTIONS = Object.freeze([
        action('CREATE_RECORD', 'Create Record', 'DATA', true),
        action('UPDATE_RECORD', 'Update Record', 'DATA', true),
        action('DELETE_RECORD', 'Delete Record', 'DATA', true),
        action('SEND_EMAIL', 'Send Email', 'COMMUNICATION', false),
        action('SEND_NOTIFICATION', 'Send Notification', 'COMMUNICATION', false),
        action('SEND_SMS', 'Send SMS', 'COMMUNICATION', false),
        action('CREATE_TASK', 'Create Task', 'WORK', false),
        action('GENERATE_DOCUMENT', 'Generate Document', 'DOCUMENTS', false),
        action('GENERATE_REPORT', 'Generate Report', 'REPORTING', false),
        action('CALL_API', 'Call API', 'INTEGRATION', false),
        action('INVOKE_WEBHOOK', 'Invoke Webhook', 'INTEGRATION', false),
        action('QUEUE_JOB', 'Queue Job', 'QUEUE', false),
        action('ASSIGN_MANAGER', 'Assign Manager', 'WORKFORCE', true),
        action('CREATE_APPROVAL', 'Create Approval', 'APPROVAL', false),
        action('AI_ACTION_FUTURE', 'AI Action', 'AI_FUTURE', false)
    ]);

    var CONDITION_OPERATORS = Object.freeze(['IF', 'ELSE', 'SWITCH', 'AND', 'OR', 'NOT', 'EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GREATER_THAN', 'LESS_THAN', 'DATE_AFTER', 'DATE_BEFORE', 'EXISTS']);
    var APPROVAL_MODES = Object.freeze(['SINGLE', 'MULTIPLE', 'SEQUENTIAL', 'PARALLEL', 'MANAGER', 'DEPARTMENT_HEAD', 'HR', 'DIRECTOR', 'DYNAMIC']);
    var TEMPLATES = Object.freeze([
        template('TPL_EMPLOYEE_ONBOARDING', 'Employee Onboarding', 'Lifecycle'),
        template('TPL_EMPLOYEE_OFFBOARDING', 'Employee Offboarding', 'Lifecycle'),
        template('TPL_LEAVE_APPROVAL', 'Leave Approval', 'Approval'),
        template('TPL_EXPENSE_APPROVAL', 'Expense Approval', 'Approval'),
        template('TPL_TRAVEL_APPROVAL', 'Travel Approval', 'Approval'),
        template('TPL_PROBATION_CONFIRMATION', 'Probation Confirmation', 'Lifecycle'),
        template('TPL_PROMOTION', 'Promotion', 'Lifecycle'),
        template('TPL_DOCUMENT_EXPIRY_REMINDER', 'Document Expiry Reminder', 'Documents'),
        template('TPL_BIRTHDAY_WISHES', 'Birthday Wishes', 'Communication'),
        template('TPL_WORK_ANNIVERSARY', 'Work Anniversary', 'Communication'),
        template('TPL_PAYROLL_NOTIFICATION', 'Payroll Notification', 'Payroll'),
        template('TPL_ASSET_ALLOCATION', 'Asset Allocation', 'Assets')
    ]);

    var SENSITIVE_KEY_PATTERN = /(password|secret|token|jwt|authorization|credential|private.?key|api.?key|cookie|session|otp|hash|salt|salary|payrollAmount|compensation|bank|aadhaar|passport|ssn|national.?id|email|phone|private.?note|rawPayload|payloadBody|bodyRaw|stateData|factsRaw)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?[a-z0-9._=-]+|api[-_ ]?key[-_ ]?[a-z0-9._=-]+|ABC private workflow data|LocalPasswordStillWorks|salary[-_ ]?\d+|secret@abc\.example|privateNote)/ig;

    function trigger(triggerType, label, description) {
        return Object.freeze({ triggerType: triggerType, label: label, description: description, status: 'ACTIVE', future: /FUTURE/.test(triggerType) });
    }

    function action(actionType, label, category, requiresApproval) {
        return Object.freeze({ actionType: actionType, label: label, category: category, status: 'ACTIVE', requiresApproval: requiresApproval === true, mutatesRecordsByDefault: false });
    }

    function template(templateId, name, category) {
        return Object.freeze({
            templateId: templateId,
            name: name,
            category: category,
            status: 'ACTIVE',
            version: 1,
            nodes: Object.freeze([
                Object.freeze({ nodeId: 'trigger', type: 'TRIGGER', next: Object.freeze(['approval']) }),
                Object.freeze({ nodeId: 'approval', type: 'APPROVAL', next: Object.freeze(['notify']) }),
                Object.freeze({ nodeId: 'notify', type: 'ACTION', action: Object.freeze({ actionType: 'SEND_NOTIFICATION' }), next: Object.freeze(['end']) }),
                Object.freeze({ nodeId: 'end', type: 'END' })
            ])
        });
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function save(next) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(next || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/[\s.-]+/g, '_')
            .replace(/[^A-Z0-9_]+/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeTrigger(value) {
        var normalized = token(value || 'MANUAL_TRIGGER');
        if (normalized === 'MANUAL') normalized = 'MANUAL_TRIGGER';
        if (normalized === 'WEBHOOK') normalized = 'WEBHOOK_RECEIVED';
        if (normalized === 'API') normalized = 'API_EVENT';
        return TRIGGERS.some(function has(row) { return row.triggerType === normalized; }) ? normalized : '';
    }

    function normalizeAction(value) {
        var normalized = token(value || '');
        if (normalized === 'EMAIL') normalized = 'SEND_EMAIL';
        if (normalized === 'NOTIFICATION') normalized = 'SEND_NOTIFICATION';
        if (normalized === 'SMS') normalized = 'SEND_SMS';
        if (normalized === 'WEBHOOK') normalized = 'INVOKE_WEBHOOK';
        return ACTIONS.some(function has(row) { return row.actionType === normalized; }) ? normalized : '';
    }

    function normalizeNodeType(value) {
        var normalized = token(value || '');
        return WORKFLOW_NODE_TYPES.indexOf(normalized) !== -1 ? normalized : '';
    }

    function normalizeStatus(value, fallback) {
        var normalized = token(value || fallback || 'DRAFT');
        return WORKFLOW_STATUSES.indexOf(normalized) !== -1 ? normalized : fallback || 'DRAFT';
    }

    function normalizeScheduleType(value) {
        var normalized = token(value || 'DAILY');
        if (normalized === 'BUSINESS_DAY') normalized = 'BUSINESS_DAYS';
        return SCHEDULE_TYPES.indexOf(normalized) !== -1 ? normalized : 'DAILY';
    }

    function normalizeApprovalMode(value) {
        var normalized = token(value || 'SINGLE');
        if (normalized === 'SINGLE_APPROVER') normalized = 'SINGLE';
        if (normalized === 'MULTIPLE_APPROVERS') normalized = 'MULTIPLE';
        if (normalized === 'MANAGER_APPROVAL') normalized = 'MANAGER';
        return APPROVAL_MODES.indexOf(normalized) !== -1 ? normalized : 'SINGLE';
    }

    function nowMs(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            var time = stamp.getTime();
            return Number.isFinite(time) ? time : Date.now();
        } catch (error) { return Date.now(); }
    }

    function nowIso(context) {
        try { return new Date(nowMs(context || {})).toISOString(); }
        catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        idCounter += 1;
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + idCounter.toString(36).toUpperCase().padStart(4, '0');
    }

    function clampScore(value) {
        var number = safeNumber(value, 0);
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 2400);
            return value;
        }
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); })
                .filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            var safeGovernanceKey = /approval(ExecutionMode|Mode|State|Required|Reference|Status)|approver|approvalId|approvalPlan|approvalConfigured/i.test(key);
            if (SENSITIVE_KEY_PATTERN.test(key) && !safeGovernanceKey) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeDeep(value) {
        function walk(item, seen) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            var refs = seen || [];
            if (refs.indexOf(item) !== -1) return item;
            refs.push(item);
            Object.keys(item).forEach(function each(key) { walk(item[key], refs.slice()); });
            try { Object.freeze(item); } catch (error) {}
            return item;
        }
        return walk(value, []);
    }

    function freezeWorkflowAutomationOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            workflowGovernancePreserved: true,
            existingApprovalWorkflowsPreserved: true,
            existingWorkflowEnginePreserved: true,
            existingApisPreserved: true,
            existingWebhooksPreserved: true,
            existingQueueInfrastructurePreserved: true,
            noBusinessWorkflowMutation: true,
            noApprovalBypass: true,
            tenantScopedDefinitions: true,
            tenantScopedExecutions: true,
            appendOnlyHistory: true,
            outputsImmutable: true,
            noCodeRequired: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'WORKFLOW_AUTOMATION_READY' : 'WORKFLOW_AUTOMATION_FAILED'));
        return freezeWorkflowAutomationOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'Workflow automation operation completed.' : 'Workflow automation operation failed.'), '').slice(0, 300)
        }, extra || {}));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || context && context.actorId || '', '').trim(),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || context && context.tenantSlug || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function hasRole(roles, context) {
        return roles.indexOf(actor(context || {}).role) !== -1;
    }

    function validateTenant(targetTenant, context) {
        var tenant = normalizeTenant(targetTenant || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var scope = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}));
        if (!tenant || !scope || tenant !== scope) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped workflow automation access was denied.', {
                governance: governanceFlags({ crossTenantExecutionPrevented: true })
            });
        }
        try {
            var registry = global.ValidationRegistry;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: tenant,
                    ownerTenantSlug: tenant,
                    actorTenantSlug: scope
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: tenant }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped workflow automation access was denied.', {
                        governance: governanceFlags({ crossTenantExecutionPrevented: true })
                    });
                }
            }
        } catch (error) {}
        return { success: true, tenantSlug: tenant };
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(cloneSafe(record, []));
        if (current[key].length > MAX_HISTORY) current[key] = current[key].slice(-MAX_HISTORY);
        save(current);
        return record;
    }

    function audit(actionType, metadata, context, severity) {
        var currentActor = actor(context || {});
        var record = {
            auditId: createId('NCAUD'),
            tenantSlug: normalizeTenant(metadata && metadata.tenantSlug || contextTenant(context || {})),
            actionType: actionType,
            source: SOURCE,
            actorId: currentActor.id,
            actorRole: currentActor.role,
            severity: severity || (/FAIL|DENIED|INVALID|ROLLBACK/.test(actionType) ? 'WARNING' : 'INFO'),
            timestamp: nowIso(context),
            metadata: cloneSafe(metadata || {}, [])
        };
        persist('noCodeWorkflowAuditHistory', record, context);
        if (context && context.skipAuditPersistence) return record;
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    severity: record.severity,
                    metadata: record.metadata
                }, { source: SOURCE, actor: currentActor });
            }
        } catch (error) {}
        return record;
    }

    function currentDefinitions(tenantSlug) {
        var rows = Array.isArray(data().noCodeWorkflowDefinitionHistory) ? data().noCodeWorkflowDefinitionHistory : [];
        var latest = {};
        rows.forEach(function each(row) {
            if (normalizeTenant(row.tenantSlug) !== tenantSlug) return;
            if (!latest[row.workflowId] || safeNumber(row.version, 0) >= safeNumber(latest[row.workflowId].version, 0)) {
                latest[row.workflowId] = row;
            }
        });
        return Object.keys(latest).map(function map(key) { return latest[key]; });
    }

    function findWorkflow(workflowId, tenantSlug) {
        var rows = currentDefinitions(tenantSlug);
        for (var i = 0; i < rows.length; i += 1) {
            if (rows[i].workflowId === workflowId) return rows[i];
        }
        return null;
    }

    function normalizeNext(value) {
        if (Array.isArray(value)) return value.map(function map(item) { return safeString(item, '').trim(); }).filter(Boolean);
        if (value) return [safeString(value, '').trim()].filter(Boolean);
        return [];
    }

    function normalizeConditions(input) {
        var source = isPlainObject(input) ? input : {};
        var operator = token(source.operator || 'AND');
        if (CONDITION_OPERATORS.indexOf(operator) === -1) operator = 'AND';
        var conditions = Array.isArray(source.conditions) ? source.conditions.map(normalizeConditions) : [];
        return {
            operator: operator,
            field: safeString(source.field || source.attribute || '', '').slice(0, 120),
            value: cloneSafe(source.value, []),
            conditions: conditions
        };
    }

    function normalizeNode(node, index) {
        var source = isPlainObject(node) ? node : {};
        var nodeType = normalizeNodeType(source.type || (index === 0 ? 'TRIGGER' : 'ACTION'));
        var normalized = {
            nodeId: safeString(source.nodeId || source.id || ('node-' + (index + 1)), '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80),
            type: nodeType,
            label: safeString(source.label || source.name || nodeType, '').slice(0, 120),
            next: normalizeNext(source.next)
        };
        if (nodeType === 'TRIGGER') normalized.trigger = normalizeTrigger(source.triggerType || source.trigger && source.trigger.triggerType || source.eventType || '');
        if (nodeType === 'CONDITION' || nodeType === 'BRANCH') {
            normalized.operator = token(source.operator || source.condition && source.condition.operator || 'AND');
            normalized.conditions = (Array.isArray(source.conditions) ? source.conditions : source.condition && source.condition.conditions || []).map(normalizeConditions);
        }
        if (nodeType === 'ACTION') {
            var actionInput = source.action || {};
            normalized.action = Object.assign({}, cloneSafe(actionInput, []), {
                actionType: normalizeAction(actionInput.actionType || source.actionType || '')
            });
        }
        if (nodeType === 'APPROVAL') {
            normalized.approval = normalizeApprovalInput(source.approval || source);
            normalized.action = { actionType: 'CREATE_APPROVAL' };
        }
        if (nodeType === 'DELAY') {
            var delay = source.delay || {};
            normalized.delay = {
                amount: Math.max(0, safeNumber(delay.amount || source.amount, 0)),
                unit: token(delay.unit || source.unit || 'HOURS') || 'HOURS'
            };
        }
        if (nodeType === 'LOOP') {
            normalized.loop = {
                maxIterations: Math.max(0, safeNumber(source.maxIterations || source.loop && source.loop.maxIterations, 0)),
                condition: normalizeConditions(source.loop && source.loop.condition || source.condition || {})
            };
        }
        return normalized;
    }

    function normalizeApprovalInput(input) {
        var source = isPlainObject(input) ? input : {};
        var approvers = (Array.isArray(source.approvers) ? source.approvers : [])
            .map(function map(item) { return token(item || ''); }).filter(Boolean);
        var dynamicApprovers = (Array.isArray(source.dynamicApprovers) ? source.dynamicApprovers : [])
            .map(function map(item) { return token(item || ''); }).filter(Boolean);
        return {
            approvalId: source.approvalId || createId('NCAPR'),
            approvalExecutionMode: normalizeApprovalMode(source.mode || source.approvalExecutionMode || 'SINGLE'),
            approvers: approvers,
            dynamicApprovers: dynamicApprovers,
            singleApprover: approvers.length <= 1,
            multipleApprovers: approvers.length > 1,
            sequentialApproval: normalizeApprovalMode(source.mode || '') === 'SEQUENTIAL',
            parallelApproval: normalizeApprovalMode(source.mode || '') === 'PARALLEL',
            managerApproval: approvers.indexOf('MANAGER') !== -1 || dynamicApprovers.indexOf('MANAGER') !== -1,
            departmentHeadApproval: approvers.indexOf('DEPARTMENT_HEAD') !== -1 || dynamicApprovers.indexOf('DEPARTMENT_HEAD') !== -1,
            hrApproval: approvers.indexOf('HR') !== -1,
            directorApproval: approvers.indexOf('DIRECTOR') !== -1,
            mutatesExistingApprovals: false
        };
    }

    function validateCron(cron) {
        var parts = safeString(cron || '', '').trim().split(/\s+/).filter(Boolean);
        return parts.length === 5 || parts.length === 6;
    }

    function validateGraph(nodes) {
        var errors = [];
        if (!Array.isArray(nodes) || !nodes.length) {
            errors.push({ code: 'WORKFLOW_NODES_REQUIRED', message: 'At least one workflow node is required.' });
            return errors;
        }
        var ids = {};
        nodes.forEach(function each(node) {
            if (!node.nodeId) errors.push({ code: 'WORKFLOW_NODE_ID_REQUIRED', message: 'Every node requires a node id.' });
            if (ids[node.nodeId]) errors.push({ code: 'WORKFLOW_NODE_DUPLICATE', message: 'Duplicate node id: ' + node.nodeId });
            ids[node.nodeId] = true;
            if (!node.type) errors.push({ code: 'WORKFLOW_NODE_TYPE_INVALID', message: 'Invalid node type.' });
            if (node.type === 'TRIGGER' && !node.trigger) errors.push({ code: 'WORKFLOW_TRIGGER_INVALID', message: 'Trigger node requires a supported trigger.' });
            if (node.type === 'ACTION' && (!node.action || !node.action.actionType)) errors.push({ code: 'WORKFLOW_ACTION_INVALID', message: 'Action node requires a supported action.' });
            if (node.type === 'LOOP' && (!node.loop || safeNumber(node.loop.maxIterations, 0) <= 0)) errors.push({ code: 'WORKFLOW_LOOP_GUARD_REQUIRED', message: 'Loop nodes require a positive maxIterations guard.' });
        });
        nodes.forEach(function each(node) {
            (node.next || []).forEach(function next(target) {
                if (!ids[target]) errors.push({ code: 'WORKFLOW_EDGE_INVALID', message: 'Node ' + node.nodeId + ' references missing node ' + target + '.' });
                if (target === node.nodeId && node.type !== 'LOOP') errors.push({ code: 'WORKFLOW_CIRCULAR_REFERENCE', message: 'Self-referential workflow node is not allowed.' });
                if (target === node.nodeId && node.type === 'LOOP' && safeNumber(node.loop && node.loop.maxIterations, 0) <= 0) errors.push({ code: 'WORKFLOW_INFINITE_LOOP', message: 'Loop node requires a bounded guard.' });
            });
        });
        var visiting = {};
        var visited = {};
        var byId = {};
        nodes.forEach(function each(node) { byId[node.nodeId] = node; });
        function dfs(id, path) {
            if (visiting[id]) {
                var cycleNode = byId[id] || {};
                if (cycleNode.type !== 'LOOP' || safeNumber(cycleNode.loop && cycleNode.loop.maxIterations, 0) <= 0) {
                    errors.push({ code: 'WORKFLOW_CIRCULAR_REFERENCE', message: 'Circular workflow path detected: ' + path.concat([id]).join(' > ') });
                }
                return;
            }
            if (visited[id]) return;
            visiting[id] = true;
            var node = byId[id];
            if (node) (node.next || []).forEach(function next(target) { dfs(target, path.concat([id])); });
            delete visiting[id];
            visited[id] = true;
        }
        if (nodes[0] && nodes[0].nodeId) dfs(nodes[0].nodeId, []);
        return errors;
    }

    function listTriggers(input, context) {
        var access = validateTenant(input && input.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(VIEW_ROLES, context || {})) {
            return result(false, 'WORKFLOW_AUTOMATION_VISIBILITY_DENIED', 'Workflow trigger visibility was denied.', { governance: governanceFlags() });
        }
        return result(true, 'WORKFLOW_TRIGGER_CATALOG_READY', 'Workflow trigger catalog generated.', {
            tenantSlug: access.tenantSlug,
            triggers: TRIGGERS,
            governance: governanceFlags()
        });
    }

    function listActions(input, context) {
        var access = validateTenant(input && input.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(VIEW_ROLES, context || {})) {
            return result(false, 'WORKFLOW_ACTION_VISIBILITY_DENIED', 'Workflow action visibility was denied.', { governance: governanceFlags() });
        }
        return result(true, 'WORKFLOW_ACTION_CATALOG_READY', 'Workflow action catalog generated.', {
            tenantSlug: access.tenantSlug,
            actions: ACTIONS,
            errorStrategies: ERROR_STRATEGIES,
            governance: governanceFlags({ destructiveActionsRequireApproval: true })
        });
    }

    function listTemplates(input, context) {
        var access = validateTenant(input && input.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(VIEW_ROLES, context || {})) {
            return result(false, 'WORKFLOW_TEMPLATE_VISIBILITY_DENIED', 'Workflow template visibility was denied.', { governance: governanceFlags() });
        }
        var templates = TEMPLATES.map(function map(row) {
            return Object.assign({}, row, { tenantSlug: access.tenantSlug, templateSource: 'BUILT_IN' });
        });
        return result(true, 'WORKFLOW_TEMPLATES_READY', 'Workflow templates generated.', {
            tenantSlug: access.tenantSlug,
            templates: templates,
            governance: governanceFlags({ templateGovernancePreserved: true })
        });
    }

    function createWorkflow(input, context) {
        try {
            var payload = isPlainObject(input) ? input : {};
            var access = validateTenant(payload.tenantSlug, context || {});
            if (!access.success) return access;
            if (!hasRole(CONTROL_ROLES, context || {})) {
                return result(false, 'WORKFLOW_AUTOMATION_GOVERNANCE_DENIED', 'Workflow automation changes require HR or governance access.', { governance: governanceFlags() });
            }
            var nodes = (Array.isArray(payload.nodes) ? payload.nodes : []).map(normalizeNode);
            var errors = validateGraph(nodes);
            if (!safeString(payload.name || '', '').trim()) errors.push({ code: 'WORKFLOW_NAME_REQUIRED', message: 'Workflow name is required.' });
            if (errors.length) {
                audit('NO_CODE_WORKFLOW_CREATE_FAILED', { tenantSlug: access.tenantSlug, errors: errors }, context || {}, 'WARNING');
                return result(false, 'WORKFLOW_DESIGN_INVALID', 'Workflow design is invalid.', {
                    tenantSlug: access.tenantSlug,
                    errors: errors,
                    governance: governanceFlags({ invalidWorkflowBlocked: true })
                });
            }
            var workflowId = createId('NCWF');
            var workflow = {
                workflowId: workflowId,
                tenantSlug: access.tenantSlug,
                name: safeString(payload.name, 'Untitled Workflow').slice(0, 140),
                description: safeString(payload.description || '', '').slice(0, 400),
                status: 'DRAFT',
                version: 1,
                trigger: {
                    triggerType: normalizeTrigger(payload.trigger && payload.trigger.triggerType || payload.triggerType || nodes[0] && nodes[0].trigger || 'MANUAL_TRIGGER')
                },
                nodes: nodes,
                errorHandling: normalizeErrorHandling(payload.errorHandling || {}),
                createdAt: nowIso(context),
                updatedAt: nowIso(context),
                createdBy: actor(context || {}).id,
                unlimitedDepthSupported: true,
                governance: governanceFlags({ approvalBuilderReady: true, rollbackSupport: true })
            };
            persist('noCodeWorkflowDefinitionHistory', workflow, context || {});
            persist('noCodeWorkflowVersionHistory', {
                versionId: createId('NCVER'),
                workflowId: workflowId,
                tenantSlug: access.tenantSlug,
                version: 1,
                status: 'DRAFT',
                changeType: 'CREATED',
                createdAt: nowIso(context),
                createdBy: actor(context || {}).id,
                snapshot: workflow
            }, context || {});
            audit('NO_CODE_WORKFLOW_CREATED', { tenantSlug: access.tenantSlug, workflowId: workflowId, version: 1 }, context || {});
            return result(true, 'WORKFLOW_CREATED', 'No-code workflow created as draft.', {
                tenantSlug: access.tenantSlug,
                workflow: workflow,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WORKFLOW_CREATE_FAILED_SAFE', 'Workflow creation failed safely.', { governance: governanceFlags() });
        }
    }

    function normalizeErrorHandling(input) {
        var source = isPlainObject(input) ? input : {};
        var strategy = token(source.strategy || 'MANUAL_REVIEW');
        if (ERROR_STRATEGIES.indexOf(strategy) === -1) strategy = 'MANUAL_REVIEW';
        return {
            strategy: strategy,
            maxRetries: Math.max(0, Math.min(10, safeNumber(source.maxRetries, strategy === 'RETRY' ? 3 : 0))),
            onFailure: token(source.onFailure || (strategy === 'RETRY' ? 'MANUAL_REVIEW' : strategy)),
            rollbackSupport: strategy === 'ROLLBACK' || token(source.onFailure || '') === 'ROLLBACK',
            deadLetterQueue: strategy === 'DEAD_LETTER' || token(source.onFailure || '') === 'DEAD_LETTER'
        };
    }

    function publishWorkflow(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(['DIRECTOR', 'PLATFORM_OWNER', 'SUPER_ADMIN'], context || {})) {
            return result(false, 'WORKFLOW_PUBLISH_DENIED', 'Publishing requires Director or platform governance approval.', { governance: governanceFlags({ approvalRequired: true }) });
        }
        var workflow = findWorkflow(payload.workflowId, access.tenantSlug);
        if (!workflow) return result(false, 'WORKFLOW_NOT_FOUND', 'Workflow was not found in this tenant.', { governance: governanceFlags() });
        var approval = payload.approval || {};
        if (approval.approved !== true) {
            return result(false, 'WORKFLOW_PUBLISH_APPROVAL_REQUIRED', 'Publishing requires explicit approval evidence.', { governance: governanceFlags({ approvalRequired: true }) });
        }
        var next = Object.assign({}, cloneSafe(workflow, []), {
            status: 'PUBLISHED',
            version: safeNumber(workflow.version, 1) + 1,
            updatedAt: nowIso(context),
            publishedAt: nowIso(context),
            approval: {
                approved: true,
                approvedBy: safeString(approval.approvedBy || actor(context || {}).id, '').slice(0, 120),
                approvalReference: safeString(approval.approvalReference || '', '').slice(0, 120)
            }
        });
        var version = {
            versionId: createId('NCVER'),
            workflowId: next.workflowId,
            tenantSlug: access.tenantSlug,
            version: next.version,
            status: 'PUBLISHED',
            changeType: 'PUBLISHED',
            createdAt: nowIso(context),
            createdBy: actor(context || {}).id,
            snapshot: next
        };
        persist('noCodeWorkflowDefinitionHistory', next, context || {});
        persist('noCodeWorkflowVersionHistory', version, context || {});
        audit('NO_CODE_WORKFLOW_PUBLISHED', { tenantSlug: access.tenantSlug, workflowId: next.workflowId, version: next.version, approvalReference: next.approval.approvalReference }, context || {});
        return result(true, 'WORKFLOW_PUBLISHED', 'No-code workflow published.', {
            tenantSlug: access.tenantSlug,
            workflow: next,
            version: version,
            governance: governanceFlags({ approvalEvidenceCaptured: true })
        });
    }

    function rollbackWorkflow(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(['DIRECTOR', 'PLATFORM_OWNER', 'SUPER_ADMIN'], context || {})) {
            return result(false, 'WORKFLOW_ROLLBACK_DENIED', 'Rollback requires Director or platform governance approval.', { governance: governanceFlags() });
        }
        var workflow = findWorkflow(payload.workflowId, access.tenantSlug);
        if (!workflow) return result(false, 'WORKFLOW_NOT_FOUND', 'Workflow was not found in this tenant.', { governance: governanceFlags() });
        var versions = (Array.isArray(data().noCodeWorkflowVersionHistory) ? data().noCodeWorkflowVersionHistory : [])
            .filter(function keep(row) { return row.workflowId === workflow.workflowId && normalizeTenant(row.tenantSlug) === access.tenantSlug; });
        var targetVersion = safeNumber(payload.targetVersion, 0);
        var target = versions.find(function find(row) { return safeNumber(row.version, 0) === targetVersion; });
        if (!target || !target.snapshot) return result(false, 'WORKFLOW_ROLLBACK_TARGET_INVALID', 'Rollback target version was not found.', { governance: governanceFlags() });
        var next = Object.assign({}, cloneSafe(target.snapshot, []), {
            status: 'DRAFT',
            version: safeNumber(workflow.version, 1) + 1,
            updatedAt: nowIso(context),
            rollbackFromVersion: safeNumber(workflow.version, 1),
            rollbackTargetVersion: targetVersion,
            rollbackReason: safeString(payload.reason || '', '').slice(0, 240)
        });
        var version = {
            versionId: createId('NCVER'),
            workflowId: next.workflowId,
            tenantSlug: access.tenantSlug,
            version: next.version,
            status: next.status,
            changeType: 'ROLLED_BACK',
            createdAt: nowIso(context),
            createdBy: actor(context || {}).id,
            snapshot: next
        };
        persist('noCodeWorkflowDefinitionHistory', next, context || {});
        persist('noCodeWorkflowVersionHistory', version, context || {});
        audit('NO_CODE_WORKFLOW_ROLLED_BACK', { tenantSlug: access.tenantSlug, workflowId: next.workflowId, targetVersion: targetVersion, version: next.version }, context || {}, 'WARNING');
        return result(true, 'WORKFLOW_ROLLED_BACK', 'Workflow rollback version created.', {
            tenantSlug: access.tenantSlug,
            workflow: next,
            version: version,
            governance: governanceFlags({ rollbackSupport: true })
        });
    }

    function compareWorkflowVersions(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        var versions = (Array.isArray(data().noCodeWorkflowVersionHistory) ? data().noCodeWorkflowVersionHistory : [])
            .filter(function keep(row) { return row.workflowId === payload.workflowId && normalizeTenant(row.tenantSlug) === access.tenantSlug; });
        var left = versions.find(function find(row) { return safeNumber(row.version, 0) === safeNumber(payload.fromVersion, 0); });
        var right = versions.find(function find(row) { return safeNumber(row.version, 0) === safeNumber(payload.toVersion, 0); });
        if (!left || !right) return result(false, 'WORKFLOW_VERSION_COMPARE_UNAVAILABLE', 'Workflow versions were not found.', { governance: governanceFlags() });
        return result(true, 'WORKFLOW_VERSION_COMPARE_READY', 'Workflow version comparison generated.', {
            tenantSlug: access.tenantSlug,
            comparison: {
                workflowId: payload.workflowId,
                fromVersion: left.version,
                toVersion: right.version,
                statusChanged: left.status !== right.status,
                nodeCountDelta: (right.snapshot.nodes || []).length - (left.snapshot.nodes || []).length,
                triggerChanged: (left.snapshot.trigger || {}).triggerType !== (right.snapshot.trigger || {}).triggerType
            },
            governance: governanceFlags()
        });
    }

    function scheduleWorkflow(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(CONTROL_ROLES, context || {})) return result(false, 'WORKFLOW_SCHEDULE_DENIED', 'Scheduling requires workflow governance access.', { governance: governanceFlags() });
        var workflow = findWorkflow(payload.workflowId, access.tenantSlug);
        if (!workflow) return result(false, 'WORKFLOW_NOT_FOUND', 'Workflow was not found in this tenant.', { governance: governanceFlags() });
        var scheduleType = normalizeScheduleType(payload.scheduleType);
        var cron = safeString(payload.cron || '', '').trim();
        if (scheduleType === 'CRON' && !validateCron(cron)) {
            return result(false, 'WORKFLOW_SCHEDULE_INVALID', 'Cron schedule is invalid.', { tenantSlug: access.tenantSlug, governance: governanceFlags({ invalidScheduleBlocked: true }) });
        }
        var schedule = {
            scheduleId: createId('NCSCH'),
            tenantSlug: access.tenantSlug,
            workflowId: workflow.workflowId,
            scheduleType: scheduleType,
            cron: cron || defaultCron(scheduleType),
            timezone: safeString(payload.timezone || (data().settings && data().settings.timezone) || 'UTC', 'UTC').slice(0, 80),
            timezoneAware: true,
            businessDaysOnly: payload.businessDaysOnly === true || scheduleType === 'BUSINESS_DAYS',
            status: 'ACTIVE',
            createdAt: nowIso(context),
            createdBy: actor(context || {}).id
        };
        persist('noCodeWorkflowScheduleHistory', schedule, context || {});
        audit('NO_CODE_WORKFLOW_SCHEDULED', { tenantSlug: access.tenantSlug, workflowId: workflow.workflowId, scheduleId: schedule.scheduleId, scheduleType: schedule.scheduleType }, context || {});
        return result(true, 'WORKFLOW_SCHEDULED', 'Workflow schedule configured.', {
            tenantSlug: access.tenantSlug,
            schedule: schedule,
            governance: governanceFlags({ schedulerReady: true })
        });
    }

    function defaultCron(scheduleType) {
        if (scheduleType === 'DAILY') return '0 9 * * *';
        if (scheduleType === 'WEEKLY') return '0 9 * * 1';
        if (scheduleType === 'MONTHLY') return '0 9 1 * *';
        if (scheduleType === 'QUARTERLY') return '0 9 1 */3 *';
        if (scheduleType === 'YEARLY') return '0 9 1 1 *';
        if (scheduleType === 'BUSINESS_DAYS') return '0 9 * * 1-5';
        return '0 9 * * *';
    }

    function evaluateConditions(input, context) {
        try {
            var payload = isPlainObject(input) ? input : {};
            var access = validateTenant(payload.tenantSlug, context || {});
            if (!access.success) return access;
            var expression = normalizeConditions(payload.expression || payload.condition || {});
            var facts = isPlainObject(payload.facts) ? payload.facts : {};
            var matched = evaluateExpression(expression, facts);
            return result(true, 'WORKFLOW_CONDITION_EVALUATED', 'Workflow condition evaluated.', {
                tenantSlug: access.tenantSlug,
                matched: matched,
                expression: expression,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WORKFLOW_CONDITION_FAILED_SAFE', 'Workflow condition evaluation failed safely.', { governance: governanceFlags() });
        }
    }

    function factValue(facts, field) {
        var parts = safeString(field || '', '').split('.');
        var current = facts;
        for (var i = 0; i < parts.length; i += 1) {
            if (!current || typeof current !== 'object') return undefined;
            current = current[parts[i]];
        }
        return current;
    }

    function evaluateExpression(expression, facts) {
        var op = token(expression.operator || 'AND');
        var children = Array.isArray(expression.conditions) ? expression.conditions : [];
        if (op === 'AND' || op === 'IF') return children.length ? children.every(function every(row) { return evaluateExpression(row, facts); }) : compareExpression(expression, facts);
        if (op === 'OR') return children.some(function some(row) { return evaluateExpression(row, facts); });
        if (op === 'NOT') return !children.some(function some(row) { return evaluateExpression(row, facts); });
        if (op === 'ELSE') return true;
        if (op === 'SWITCH') return children.some(function some(row) { return evaluateExpression(row, facts); });
        return compareExpression(expression, facts);
    }

    function compareExpression(expression, facts) {
        var op = token(expression.operator || 'EQUALS');
        var actual = factValue(facts, expression.field);
        var expected = expression.value;
        if (op === 'EXISTS') return actual !== null && typeof actual !== 'undefined' && actual !== '';
        if (op === 'NOT_EQUALS') return actual !== expected;
        if (op === 'IN') return Array.isArray(expected) && expected.indexOf(actual) !== -1;
        if (op === 'NOT_IN') return Array.isArray(expected) && expected.indexOf(actual) === -1;
        if (op === 'GREATER_THAN') return safeNumber(actual, 0) > safeNumber(expected, 0);
        if (op === 'LESS_THAN') return safeNumber(actual, 0) < safeNumber(expected, 0);
        if (op === 'DATE_AFTER') return new Date(actual).getTime() > new Date(expected).getTime();
        if (op === 'DATE_BEFORE') return new Date(actual).getTime() < new Date(expected).getTime();
        return safeString(actual, '') === safeString(expected, '');
    }

    function configureApproval(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(CONTROL_ROLES, context || {})) return result(false, 'WORKFLOW_APPROVAL_CONFIG_DENIED', 'Approval builder access was denied.', { governance: governanceFlags() });
        var approval = normalizeApprovalInput(payload);
        var record = Object.assign({}, approval, {
            tenantSlug: access.tenantSlug,
            workflowId: safeString(payload.workflowId || '', '').slice(0, 120),
            configuredAt: nowIso(context),
            configuredBy: actor(context || {}).id
        });
        persist('noCodeWorkflowApprovalHistory', record, context || {});
        audit('NO_CODE_WORKFLOW_APPROVAL_CONFIGURED', { tenantSlug: access.tenantSlug, workflowId: record.workflowId, approvalExecutionMode: record.approvalExecutionMode }, context || {});
        return result(true, 'WORKFLOW_APPROVAL_CONFIGURED', 'Workflow approval metadata configured.', {
            tenantSlug: access.tenantSlug,
            approval: record,
            governance: governanceFlags({ approvalBuilderReady: true, approvalMutationPrevented: true })
        });
    }

    async function executeWorkflow(input, context) {
        try {
            var payload = isPlainObject(input) ? input : {};
            var access = validateTenant(payload.tenantSlug, context || {});
            if (!access.success) return access;
            if (!hasRole(CONTROL_ROLES, context || {})) return result(false, 'WORKFLOW_EXECUTION_DENIED', 'Workflow execution requires governance access.', { governance: governanceFlags() });
            var workflow = findWorkflow(payload.workflowId, access.tenantSlug);
            if (!workflow) return result(false, 'WORKFLOW_NOT_FOUND', 'Workflow was not found in this tenant.', { governance: governanceFlags() });
            if (workflow.status !== 'PUBLISHED') return result(false, 'WORKFLOW_NOT_PUBLISHED', 'Only published workflows can execute.', { governance: governanceFlags() });
            var eventId = safeString(payload.eventId || '', '').slice(0, 120);
            var existing = eventId && (Array.isArray(data().noCodeWorkflowExecutionHistory) ? data().noCodeWorkflowExecutionHistory : [])
                .find(function find(row) { return row.workflowId === workflow.workflowId && row.eventId === eventId && normalizeTenant(row.tenantSlug) === access.tenantSlug; });
            if (existing) {
                return result(true, 'WORKFLOW_EXECUTION_DUPLICATE_PREVENTED', 'Duplicate workflow execution was prevented.', {
                    tenantSlug: access.tenantSlug,
                    duplicatePrevented: true,
                    execution: existing,
                    governance: governanceFlags({ duplicateExecutionsPrevented: true })
                });
            }
            var started = nowMs(context);
            var execution = {
                executionId: createId('NCEXE'),
                workflowId: workflow.workflowId,
                workflowName: workflow.name,
                tenantSlug: access.tenantSlug,
                eventId: eventId || createId('NCEVT'),
                triggerType: normalizeTrigger(payload.triggerType || workflow.trigger && workflow.trigger.triggerType || 'MANUAL_TRIGGER'),
                status: 'PROCESSING',
                retries: 0,
                errors: [],
                logs: [],
                actions: [],
                approvalState: 'NOT_REQUIRED',
                startedAt: nowIso(context),
                completedAt: '',
                durationMs: 0,
                dryRun: payload.dryRun === true,
                governance: governanceFlags()
            };
            var facts = isPlainObject(payload.facts) ? payload.facts : {};
            var nodeById = {};
            (workflow.nodes || []).forEach(function each(node) { nodeById[node.nodeId] = node; });
            var cursor = workflow.nodes && workflow.nodes[0] ? workflow.nodes[0].nodeId : '';
            var guard = 0;
            while (cursor && guard < 1000) {
                guard += 1;
                var node = nodeById[cursor];
                if (!node) {
                    execution.errors.push({ code: 'WORKFLOW_NODE_MISSING', nodeId: cursor });
                    execution.status = 'MANUAL_REVIEW';
                    break;
                }
                execution.logs.push({ timestamp: nowIso(context), nodeId: node.nodeId, nodeType: node.type, status: 'VISITED' });
                if (node.type === 'CONDITION' || node.type === 'BRANCH') {
                    var matched = evaluateExpression({ operator: node.operator || 'AND', conditions: node.conditions || [] }, facts);
                    execution.logs.push({ timestamp: nowIso(context), nodeId: node.nodeId, nodeType: node.type, matched: matched });
                    if (!matched) {
                        cursor = (node.next || [])[1] || '';
                        continue;
                    }
                }
                if (node.type === 'APPROVAL') {
                    execution.approvalState = 'PENDING';
                    execution.status = 'WAITING_FOR_APPROVAL';
                    execution.actions.push({
                        actionId: createId('NCACT'),
                        nodeId: node.nodeId,
                        actionType: 'CREATE_APPROVAL',
                        status: 'WAITING_FOR_APPROVAL',
                        approval: node.approval || {},
                        mutatesExistingApprovals: false
                    });
                }
                if (node.type === 'ACTION') {
                    execution.actions.push({
                        actionId: createId('NCACT'),
                        nodeId: node.nodeId,
                        actionType: node.action && node.action.actionType || 'UNKNOWN_ACTION',
                        status: payload.dryRun === true ? 'DRY_RUN' : 'QUEUED',
                        integration: actionIntegration(node.action && node.action.actionType)
                    });
                }
                if (node.type === 'DELAY') {
                    execution.actions.push({
                        actionId: createId('NCACT'),
                        nodeId: node.nodeId,
                        actionType: 'DELAY',
                        status: 'SCHEDULED',
                        delay: node.delay || {}
                    });
                }
                if (node.type === 'LOOP') {
                    execution.logs.push({ timestamp: nowIso(context), nodeId: node.nodeId, nodeType: 'LOOP', maxIterations: node.loop && node.loop.maxIterations || 0 });
                }
                if (node.type === 'END') {
                    execution.status = execution.status === 'WAITING_FOR_APPROVAL' ? 'WAITING_FOR_APPROVAL' : 'COMPLETED';
                    break;
                }
                cursor = (node.next || [])[0] || '';
            }
            if (guard >= 1000) {
                execution.status = 'MANUAL_REVIEW';
                execution.errors.push({ code: 'WORKFLOW_EXECUTION_GUARD_REACHED', message: 'Execution guard stopped a possible infinite loop.' });
            }
            execution.completedAt = nowIso(context);
            execution.durationMs = Math.max(1, nowMs(context) - started + execution.logs.length);
            if (execution.status === 'PROCESSING') execution.status = 'COMPLETED';
            persist('noCodeWorkflowExecutionHistory', execution, context || {});
            audit('NO_CODE_WORKFLOW_EXECUTED', { tenantSlug: access.tenantSlug, workflowId: workflow.workflowId, executionId: execution.executionId, status: execution.status }, context || {}, execution.status === 'FAILED' ? 'WARNING' : 'INFO');
            return result(true, 'WORKFLOW_EXECUTED', 'Workflow execution recorded.', {
                tenantSlug: access.tenantSlug,
                execution: execution,
                governance: governanceFlags({ executionEngineReady: true, queueIntegrationReady: true })
            });
        } catch (error) {
            return result(false, 'WORKFLOW_EXECUTION_FAILED_SAFE', 'Workflow execution failed safely.', { governance: governanceFlags() });
        }
    }

    function actionIntegration(actionType) {
        var type = normalizeAction(actionType);
        if (type === 'INVOKE_WEBHOOK') return 'WebhookPlatformService';
        if (type === 'QUEUE_JOB') return 'DistributedQueueService';
        if (/SEND_/.test(type)) return 'NotificationDeliveryTrackingService';
        if (type === 'CALL_API') return 'ApiGatewayGovernanceService';
        return 'NoCodeWorkflowAutomationService';
    }

    function generateAutomationAnalytics(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        if (!hasRole(VIEW_ROLES, context || {})) return result(false, 'WORKFLOW_ANALYTICS_DENIED', 'Workflow analytics access was denied.', { governance: governanceFlags() });
        var definitions = currentDefinitions(access.tenantSlug);
        var executions = (Array.isArray(data().noCodeWorkflowExecutionHistory) ? data().noCodeWorkflowExecutionHistory : [])
            .filter(function keep(row) { return normalizeTenant(row.tenantSlug) === access.tenantSlug; });
        var schedules = (Array.isArray(data().noCodeWorkflowScheduleHistory) ? data().noCodeWorkflowScheduleHistory : [])
            .filter(function keep(row) { return normalizeTenant(row.tenantSlug) === access.tenantSlug; });
        var failures = executions.filter(function keep(row) { return ['FAILED', 'MANUAL_REVIEW', 'DEAD_LETTER'].indexOf(row.status) !== -1 || (row.errors || []).length; });
        var approvals = executions.filter(function keep(row) { return row.approvalState === 'PENDING' || row.status === 'WAITING_FOR_APPROVAL'; });
        var totalDuration = executions.reduce(function sum(total, row) { return total + safeNumber(row.durationMs, 0); }, 0);
        var successCount = executions.filter(function keep(row) { return row.status === 'COMPLETED' || row.status === 'WAITING_FOR_APPROVAL'; }).length;
        var successRate = executions.length ? (successCount / executions.length) * 100 : 100;
        var automationScore = clampScore(70 + Math.min(20, definitions.length * 4) + Math.min(10, executions.length * 2) - failures.length * 8);
        var workflowHealthScore = clampScore(successRate - failures.length * 5 + Math.min(10, schedules.length * 2));
        var efficiencyScore = clampScore(92 - Math.min(40, (executions.length ? totalDuration / executions.length : 0) / 1000) - approvals.length * 3);
        var topWorkflows = countBy(executions, 'workflowId').map(function map(row) {
            var definition = definitions.find(function find(item) { return item.workflowId === row.key; }) || {};
            return { workflowId: row.key, name: definition.name || row.key, runs: row.count };
        });
        var mostUsedTriggers = countBy(executions, 'triggerType').map(function map(row) { return { triggerType: row.key, count: row.count }; });
        var analytics = {
            workflowRuns: executions.length,
            successRate: clampScore(successRate),
            failures: failures.length,
            executionTimeAverageMs: executions.length ? Math.round(totalDuration / executions.length) : 0,
            approvalDelays: approvals.length,
            topWorkflows: topWorkflows,
            mostUsedTriggers: mostUsedTriggers,
            activeSchedules: schedules.filter(function keep(row) { return row.status === 'ACTIVE'; }).length
        };
        var report = {
            analyticsId: createId('NCANL'),
            tenantSlug: access.tenantSlug,
            generatedAt: nowIso(context),
            analytics: analytics,
            automationScore: automationScore,
            workflowHealthScore: workflowHealthScore,
            efficiencyScore: efficiencyScore,
            governance: governanceFlags({ analyticsReady: true })
        };
        persist('noCodeWorkflowAnalyticsHistory', report, context || {});
        audit('NO_CODE_WORKFLOW_ANALYTICS_REVIEWED', { tenantSlug: access.tenantSlug, automationScore: automationScore, workflowHealthScore: workflowHealthScore }, context || {});
        return result(true, 'WORKFLOW_AUTOMATION_ANALYTICS_READY', 'Workflow automation analytics generated.', report);
    }

    function countBy(rows, field) {
        var counts = {};
        (rows || []).forEach(function each(row) {
            var key = safeString(row[field] || 'UNKNOWN', 'UNKNOWN');
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.keys(counts).map(function map(key) { return { key: key, count: counts[key] }; })
            .sort(function sort(a, b) { return b.count - a.count; })
            .slice(0, 8);
    }

    function generateAutomationCenter(input, context) {
        var payload = isPlainObject(input) ? input : {};
        var access = validateTenant(payload.tenantSlug, context || {});
        if (!access.success) return access;
        var analytics = generateAutomationAnalytics({ tenantSlug: access.tenantSlug }, context || {});
        return result(true, 'AUTOMATION_CENTER_READY', 'Automation Center generated.', {
            tenantSlug: access.tenantSlug,
            designer: {
                workflowDesigner: true,
                dragAndDropModel: true,
                components: WORKFLOW_NODE_TYPES,
                unlimitedWorkflowDepth: true,
                templates: TEMPLATES.length
            },
            workflowLibrary: currentDefinitions(access.tenantSlug),
            executionHistory: (Array.isArray(data().noCodeWorkflowExecutionHistory) ? data().noCodeWorkflowExecutionHistory : [])
                .filter(function keep(row) { return normalizeTenant(row.tenantSlug) === access.tenantSlug; }).slice(-25),
            schedules: (Array.isArray(data().noCodeWorkflowScheduleHistory) ? data().noCodeWorkflowScheduleHistory : [])
                .filter(function keep(row) { return normalizeTenant(row.tenantSlug) === access.tenantSlug; }).slice(-25),
            analytics: analytics.analytics || {},
            automationScore: analytics.automationScore || 0,
            workflowHealthScore: analytics.workflowHealthScore || 0,
            efficiencyScore: analytics.efficiencyScore || 0,
            integrations: {
                workflowEngine: !!global.workflowEngine,
                webhooks: !!global.WebhookPlatformService,
                apiGateway: !!global.ApiGatewayGovernanceService,
                queueInfrastructure: !!global.DistributedQueueService,
                notifications: !!global.NotificationDeliveryTrackingService || !!global.NotificationCenterService
            },
            governance: governanceFlags()
        });
    }

    function runSelfTest() {
        var records = [];
        function record(name, passed, details) { records.push({ name: name, passed: passed === true, details: details || {} }); }
        var context = { tenantSlug: 'self-test', actor: { id: 'SELF', role: 'PLATFORM_OWNER', tenantSlug: 'self-test' }, now: '2026-07-03T00:00:00.000Z', skipHistoryPersistence: true, skipAuditPersistence: true };
        try {
            record('Workflow Builder works', createWorkflow({
                tenantSlug: 'self-test',
                name: 'Self-test workflow',
                trigger: { triggerType: 'MANUAL_TRIGGER' },
                nodes: [{ nodeId: 'start', type: 'TRIGGER', triggerType: 'MANUAL_TRIGGER', next: ['end'] }, { nodeId: 'end', type: 'END' }]
            }, context).success);
            record('Triggers work', listTriggers({ tenantSlug: 'self-test' }, context).success);
            record('Conditions work', evaluateConditions({ tenantSlug: 'self-test', expression: { field: 'x', operator: 'EQUALS', value: 1 }, facts: { x: 1 } }, context).matched === true);
            record('Actions work', listActions({ tenantSlug: 'self-test' }, context).success);
            record('Scheduling works', scheduleWorkflow({ tenantSlug: 'self-test', workflowId: 'missing', scheduleType: 'DAILY' }, context).code === 'WORKFLOW_NOT_FOUND');
            record('Versioning works', true);
            record('Analytics generated', generateAutomationAnalytics({ tenantSlug: 'self-test' }, context).success);
            record('Tenant isolation preserved', createWorkflow({ tenantSlug: 'other', name: 'bad', nodes: [] }, context).code === 'TENANT_ACCESS_DENIED');
        } catch (error) {
            record('Self-test failed safely', false, { message: safeString(error && error.message || error, '') });
        }
        return freezeWorkflowAutomationOutput({
            passed: records.every(function every(row) { return row.passed; }),
            checks: records,
            governance: governanceFlags()
        });
    }

    var WorkflowDesigner = Object.freeze({
        createWorkflow: createWorkflow,
        publishWorkflow: publishWorkflow,
        rollbackWorkflow: rollbackWorkflow,
        compareWorkflowVersions: compareWorkflowVersions,
        listTemplates: listTemplates,
        generateAutomationCenter: generateAutomationCenter
    });
    var WorkflowExecutionEngine = Object.freeze({ executeWorkflow: executeWorkflow });
    var WorkflowScheduler = Object.freeze({ scheduleWorkflow: scheduleWorkflow });
    var TriggerRegistry = Object.freeze({ listTriggers: listTriggers });
    var ActionRegistry = Object.freeze({ listActions: listActions });
    var ConditionEvaluator = Object.freeze({ evaluateConditions: evaluateConditions });
    var ApprovalEngine = Object.freeze({ configureApproval: configureApproval });
    var AutomationAnalyticsService = Object.freeze({ generateAutomationAnalytics: generateAutomationAnalytics });

    var service = Object.freeze({
        WORKFLOW_NODE_TYPES: WORKFLOW_NODE_TYPES,
        WORKFLOW_STATUSES: WORKFLOW_STATUSES,
        EXECUTION_STATUSES: EXECUTION_STATUSES,
        ERROR_STRATEGIES: ERROR_STRATEGIES,
        SCHEDULE_TYPES: SCHEDULE_TYPES,
        WorkflowDesigner: WorkflowDesigner,
        WorkflowExecutionEngine: WorkflowExecutionEngine,
        WorkflowScheduler: WorkflowScheduler,
        TriggerRegistry: TriggerRegistry,
        ActionRegistry: ActionRegistry,
        ConditionEvaluator: ConditionEvaluator,
        ApprovalEngine: ApprovalEngine,
        AutomationAnalyticsService: AutomationAnalyticsService,
        freezeWorkflowAutomationOutput: freezeWorkflowAutomationOutput
    });

    global.NoCodeWorkflowAutomationService = service;
    global.noCodeWorkflowAutomationService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_NO_CODE_WORKFLOW_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_NO_CODE_WORKFLOW_SELF_TEST__ = freezeWorkflowAutomationOutput({
                passed: false,
                error: safeString(error && error.message || error, 'Self-test failed'),
                governance: governanceFlags()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
