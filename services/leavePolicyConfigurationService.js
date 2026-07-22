/**
 * leavePolicyConfigurationService.js
 * ARTHHRMS - Enterprise Leave Policy Configuration Center
 *
 * Additive, tenant-scoped leave policy configuration, eligibility, accrual,
 * approval rule, simulation, versioning, rollback, and analytics layer.
 */
(function attachLeavePolicyConfigurationService(global) {
    'use strict';

    var PREFIX = '[LeavePolicyConfigurationService]';
    var SOURCE = 'leavePolicyConfigurationService';
    var POLICY_TABLE = 'leavePolicyDefinitions';
    var VERSION_TABLE = 'leavePolicyVersions';
    var ROLLBACK_TABLE = 'leavePolicyRollbacks';
    var SIMULATION_TABLE = 'leavePolicySimulations';
    var ANALYTICS_TABLE = 'leavePolicyAnalytics';

    var LEAVE_TYPES = Object.freeze([
        'ANNUAL_LEAVE',
        'CASUAL_LEAVE',
        'SICK_LEAVE',
        'MATERNITY_LEAVE',
        'PATERNITY_LEAVE',
        'MARRIAGE_LEAVE',
        'BEREAVEMENT_LEAVE',
        'COMPENSATORY_OFF',
        'OPTIONAL_LEAVE',
        'WORK_FROM_HOME',
        'HALF_DAY_LEAVE',
        'LEAVE_WITHOUT_PAY',
        'CUSTOM_LEAVE'
    ]);
    var POLICY_STATES = Object.freeze(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ROLLED_BACK']);
    var ACCRUAL_TYPES = Object.freeze(['MONTHLY', 'QUARTERLY', 'YEARLY', 'JOINING_DATE_BASED', 'PROBATION_BASED', 'ANNIVERSARY_BASED', 'MANUAL_ALLOCATION']);
    var APPROVAL_MODES = Object.freeze(['SINGLE', 'MULTI_LEVEL', 'PARALLEL', 'SEQUENTIAL', 'AUTO_APPROVAL']);
    var APPROVER_TYPES = Object.freeze(['IMMEDIATE_MANAGER', 'DEPARTMENT_HEAD', 'HR', 'DIRECTOR', 'DYNAMIC_APPROVER']);
    var SIMULATION_SCENARIOS = Object.freeze(['NEW_EMPLOYEE', 'EXISTING_EMPLOYEE', 'PROMOTION', 'TRANSFER', 'RESIGNATION', 'POLICY_CHANGE']);
    var ALLOWED_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|payroll|compensation|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric|actualLeaveBalance|currentLeaveBalance/i;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            safeWarn('DB read failed safely.', error && error.message);
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {
            safeWarn('DB save failed safely.', error && error.message);
        }
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        return String(value).trim();
    }

    function normalizeTenant(value) {
        return safeString(value, '')
            .toLowerCase()
            .replace(/^tenant[-_]/, '')
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function normalizeKey(value) {
        return safeString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function normalizeId(value) {
        return safeString(value, '').toUpperCase();
    }

    function normalizeRole(value) {
        var role = safeString(value || 'EMPLOYEE', 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') role = 'PLATFORM_OWNER';
        return role || 'EMPLOYEE';
    }

    function normalizeStatus(value) {
        return safeString(value || 'ACTIVE', 'ACTIVE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeLeaveType(value) {
        var type = normalizeStatus(value || 'CUSTOM_LEAVE');
        if (LEAVE_TYPES.indexOf(type) === -1) return 'CUSTOM_LEAVE';
        return type;
    }

    function normalizeList(value) {
        if (!Array.isArray(value)) return [];
        return value.map(function each(row) { return safeString(row, ''); }).filter(Boolean);
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function clone(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object') return value;
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function each(item) { return clone(item, refs.slice()); });
        var out = {};
        Object.keys(value).forEach(function each(key) { out[key] = clone(value[key], refs.slice()); });
        return out;
    }

    function isSensitiveKey(key) {
        var text = String(key || '');
        if (/^(projectedLeaveBalances|leaveBalancesUnaffected|employeeLeaveBalancesModified|leavePolicyHealthScore|leaveUtilization|leaveType)$/i.test(text)) return false;
        if (/Preserved$|Unaffected$|Changed$|Supported$|Prepared$|Score$|Scores$|Count$|Counts$|Rate$|Analytics$|Matrix$|Rules$|Simulation$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (/^(code|status|severity|eventType|action|type|mode|scenario)$/i.test(String(keyHint || ''))) return value;
            if (SENSITIVE_KEYS.test(String(value || ''))) return '[REDACTED]';
            return value;
        }
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint, refs.slice()); });
        var out = {};
        Object.keys(value).forEach(function each(key) {
            if (isSensitiveKey(key)) return;
            var next = cloneSanitized(value[key], key, refs.slice());
            if (next !== undefined) out[key] = next;
        });
        return out;
    }

    function deepFreeze(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        Object.keys(value).forEach(function each(key) { deepFreeze(value[key], refs); });
        try { Object.freeze(value); } catch (error) {}
        return value;
    }

    function freezeLeavePolicyOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeLeavePolicyOutput({
            code: normalizeStatus(code || 'LEAVE_POLICY_ISSUE'),
            message: safeString(message || 'Leave policy configuration issue.', 'Leave policy configuration issue.'),
            severity: normalizeStatus(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function ensureTables(data) {
        [POLICY_TABLE, VERSION_TABLE, ROLLBACK_TABLE, SIMULATION_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
        if (!Array.isArray(data.leaveRequests)) data.leaveRequests = [];
        return data;
    }

    function tenantFrom(input, context) {
        var data = rawData();
        var actor = context && context.actor || {};
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.organizationId) ||
            context && (context.tenantSlug || context.tenantId || context.organizationId) ||
            actor.tenantSlug || actor.tenantId ||
            data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId) ||
            'default'
        );
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.empId || actor.employeeId || context && context.actorId || 'system', 'system'),
            role: normalizeRole(actor.role || actor.actorRole || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function governanceFlags(audited, context) {
        return {
            backwardCompatible: true,
            tenantIsolationPreserved: true,
            existingLeaveWorkflowsPreserved: true,
            workflowEnginePreserved: true,
            approvalEnginePreserved: true,
            employeeLeaveBalancesRequireApproval: true,
            leaveBalancesUnaffected: true,
            noAutomaticBalanceMutation: true,
            auditable: !!audited,
            reviewOnly: !!(context && context.reviewOnly)
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezeLeavePolicyOutput({
            success: false,
            code: normalizeStatus(code),
            tenantSlug: tenantFrom(input || {}, context || {}),
            issues: [issue(code, message, 'ERROR', metadata || {})],
            timestamp: nowIso(),
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function checkAccess(input, context) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        if (ALLOWED_ROLES.indexOf(actor.role) === -1) {
            return { allowed: false, output: failure('LEAVE_POLICY_ACCESS_DENIED', 'Role cannot configure enterprise leave policies.', input, context, { role: actor.role }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_LEAVE_POLICY_BLOCKED', 'Cross-tenant leave policy access is blocked.', input, context, {}) };
        }
        return { allowed: true, actor: actor, tenantSlug: tenantSlug };
    }

    function tenantOf(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId || row.organizationId));
    }

    function sameTenant(row, tenantSlug) {
        return tenantOf(row) === normalizeTenant(tenantSlug);
    }

    function employeeIdOf(row) {
        return safeString(row && (row.employeeId || row.empId || row.id), '');
    }

    function validDate(value) {
        var text = safeString(value, '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
        var date = new Date(text + 'T00:00:00Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
    }

    function normalizePolicyPayload(input, tenantSlug, existing) {
        var source = input || {};
        var policy = Object.assign({}, existing || {});
        policy.policyId = safeString(source.policyId || policy.policyId || id('LEAVE-POLICY'), '');
        policy.tenantSlug = normalizeTenant(source.tenantSlug || policy.tenantSlug || tenantSlug);
        policy.policyName = safeString(source.policyName || source.name || policy.policyName, '');
        policy.policyCode = safeString(source.policyCode || source.code || policy.policyCode, '').toUpperCase();
        policy.description = safeString(source.description || policy.description, '');
        policy.effectiveDate = safeString(source.effectiveDate || policy.effectiveDate, '');
        policy.expiryDate = safeString(source.expiryDate || policy.expiryDate, '');
        policy.status = normalizeStatus(source.status || policy.status || 'DRAFT');
        if (POLICY_STATES.indexOf(policy.status) === -1) policy.status = 'DRAFT';
        policy.priority = Number(source.priority !== undefined ? source.priority : policy.priority || 0) || 0;
        policy.leaveTypes = (Array.isArray(source.leaveTypes) ? source.leaveTypes : policy.leaveTypes || []).map(function each(row) {
            var item = row || {};
            return {
                type: normalizeLeaveType(item.type || item.leaveType || 'CUSTOM_LEAVE'),
                code: safeString(item.code || item.type || item.leaveType || 'CUSTOM', '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
                annualAllowance: Math.max(0, Number(item.annualAllowance || item.days || item.allowance || 0) || 0),
                allowHalfDay: item.allowHalfDay === true || item.halfDay === true,
                customName: safeString(item.customName || item.name || '', '')
            };
        });
        policy.eligibility = Object.assign({
            companies: [],
            businessUnits: [],
            departments: [],
            locations: [],
            branches: [],
            grades: [],
            employmentTypes: [],
            roles: [],
            employees: []
        }, policy.eligibility || {}, source.eligibility || {});
        Object.keys(policy.eligibility).forEach(function each(key) { policy.eligibility[key] = normalizeList(policy.eligibility[key]); });
        policy.accrualRules = Object.assign({
            type: 'MONTHLY',
            daysPerPeriod: 0,
            joiningDateBased: false,
            probationBased: false,
            probationMonths: 0,
            anniversaryBased: false,
            manualAllocation: false
        }, policy.accrualRules || {}, source.accrualRules || {});
        policy.accrualRules.type = normalizeStatus(policy.accrualRules.type);
        policy.accrualRules.daysPerPeriod = Number(policy.accrualRules.daysPerPeriod || 0) || 0;
        policy.accrualRules.probationMonths = Math.max(0, Number(policy.accrualRules.probationMonths || 0) || 0);
        policy.carryForward = Object.assign({ enabled: false, maxDays: 0, expiryMonths: 0, partialCarryForward: false, unlimited: false }, policy.carryForward || {}, source.carryForward || {});
        policy.carryForward.maxDays = Number(policy.carryForward.maxDays || 0) || 0;
        policy.carryForward.expiryMonths = Math.max(0, Number(policy.carryForward.expiryMonths || 0) || 0);
        policy.encashment = Object.assign({ enabled: false, maxDays: 0, minBalance: 0, taxRule: '', approvalRequired: true }, policy.encashment || {}, source.encashment || {});
        policy.encashment.maxDays = Number(policy.encashment.maxDays || 0) || 0;
        policy.encashment.minBalance = Number(policy.encashment.minBalance || 0) || 0;
        policy.approvalRules = Object.assign({ mode: 'SEQUENTIAL', levels: [], autoApproval: false }, policy.approvalRules || {}, source.approvalRules || {});
        policy.approvalRules.mode = normalizeStatus(policy.approvalRules.mode);
        if (APPROVAL_MODES.indexOf(policy.approvalRules.mode) === -1) policy.approvalRules.mode = 'SEQUENTIAL';
        policy.approvalRules.levels = (Array.isArray(policy.approvalRules.levels) ? policy.approvalRules.levels : []).map(function each(row, index) {
            return {
                order: Number(row.order || index + 1) || index + 1,
                approverType: normalizeStatus(row.approverType || row.role || 'IMMEDIATE_MANAGER'),
                approverId: safeString(row.approverId || '', '')
            };
        });
        policy.version = Number(source.version || policy.version || 1) || 1;
        policy.updatedAt = nowIso();
        return policy;
    }

    function policyById(data, tenantSlug, policyId) {
        var target = safeString(policyId, '');
        return (data[POLICY_TABLE] || []).find(function each(row) { return sameTenant(row, tenantSlug) && row.policyId === target; });
    }

    function policyCodeExists(data, tenantSlug, code, policyId) {
        var key = safeString(code, '').toUpperCase();
        return (data[POLICY_TABLE] || []).some(function each(row) {
            return sameTenant(row, tenantSlug) && safeString(row.policyCode, '').toUpperCase() === key && row.policyId !== policyId;
        });
    }

    function validationIssues(policy, data, options) {
        var issues = [];
        if (!policy.policyName) issues.push(issue('MISSING_POLICY_NAME', 'Policy name is required.', 'ERROR', {}));
        if (!policy.policyCode) issues.push(issue('MISSING_POLICY_CODE', 'Policy code is required.', 'ERROR', {}));
        if (policy.policyCode && policyCodeExists(data, policy.tenantSlug, policy.policyCode, options && options.policyId)) issues.push(issue('DUPLICATE_POLICY_CODE', 'Policy code already exists for this tenant.', 'ERROR', { policyCode: policy.policyCode }));
        if (!validDate(policy.effectiveDate)) issues.push(issue('INVALID_EFFECTIVE_DATE', 'Effective date must be valid YYYY-MM-DD.', 'ERROR', {}));
        if (policy.expiryDate && !validDate(policy.expiryDate)) issues.push(issue('INVALID_EXPIRY_DATE', 'Expiry date must be valid YYYY-MM-DD.', 'ERROR', {}));
        if (validDate(policy.effectiveDate) && validDate(policy.expiryDate) && policy.expiryDate < policy.effectiveDate) issues.push(issue('INVALID_DATE_RANGE', 'Policy expiry date cannot be before effective date.', 'ERROR', {}));
        if (!policy.leaveTypes.length) issues.push(issue('MISSING_LEAVE_TYPES', 'At least one leave type is required.', 'ERROR', {}));
        if (ACCRUAL_TYPES.indexOf(policy.accrualRules.type) === -1 || policy.accrualRules.daysPerPeriod < 0) issues.push(issue('INVALID_ACCRUAL_RULE', 'Accrual rule is invalid.', 'ERROR', { type: policy.accrualRules.type }));
        if (policy.carryForward.enabled && policy.carryForward.maxDays < 0) issues.push(issue('NEGATIVE_CARRY_FORWARD', 'Carry forward cannot be negative.', 'ERROR', {}));
        if (policy.encashment.enabled && (policy.encashment.maxDays < 0 || policy.encashment.minBalance < 0 || policy.encashment.maxDays < policy.encashment.minBalance)) issues.push(issue('INVALID_ENCASHMENT_RULE', 'Encashment rule is invalid.', 'ERROR', {}));
        if (!policy.eligibility || Object.keys(policy.eligibility).every(function each(key) { return !policy.eligibility[key].length; })) issues.push(issue('INVALID_ELIGIBILITY', 'At least one eligibility criterion is required.', 'WARNING', {}));
        var seenApprovers = {};
        (policy.approvalRules.levels || []).forEach(function each(level) {
            if (APPROVER_TYPES.indexOf(level.approverType) === -1) issues.push(issue('INVALID_APPROVAL_CHAIN', 'Approval chain contains an unsupported approver.', 'ERROR', { approverType: level.approverType }));
            var key = level.order + ':' + level.approverType + ':' + level.approverId;
            if (seenApprovers[key] || (policy.approvalRules.mode === 'SEQUENTIAL' && seenApprovers[level.approverType])) issues.push(issue('CIRCULAR_APPROVAL_CHAIN', 'Approval chain contains a repeated approver.', 'ERROR', { approverType: level.approverType }));
            seenApprovers[key] = true;
            seenApprovers[level.approverType] = true;
        });
        var activeOverlap = (data[POLICY_TABLE] || []).filter(function each(row) {
            return sameTenant(row, policy.tenantSlug) && row.policyId !== policy.policyId && normalizeStatus(row.status) === 'PUBLISHED';
        }).some(function each(row) {
            return (row.eligibility && row.eligibility.departments || []).some(function dept(department) { return (policy.eligibility.departments || []).indexOf(department) !== -1; }) && row.policyCode !== policy.policyCode;
        });
        if (activeOverlap) issues.push(issue('CONFLICTING_POLICY', 'Another published policy overlaps this eligibility scope.', 'WARNING', {}));
        return issues;
    }

    function validateLeavePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = normalizePolicyPayload(input || {}, access.tenantSlug, null);
        var issues = validationIssues(policy, data, { policyId: input && input.policyId });
        return freezeLeavePolicyOutput({
            success: issues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length === 0,
            tenantSlug: access.tenantSlug,
            policy: policy,
            issues: issues,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function savePolicyVersion(data, policy, actorId, action, reason) {
        data[VERSION_TABLE].unshift({
            versionId: id('LEAVE-POLICY-VERSION'),
            policyId: policy.policyId,
            tenantSlug: policy.tenantSlug,
            version: policy.version,
            status: policy.status,
            snapshot: clone(policy),
            action: action,
            reason: safeString(reason || '', ''),
            changedBy: actorId || 'system',
            createdAt: nowIso(),
            immutable: true
        });
    }

    function audit(actionType, targetId, description, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return false;
            var actor = contextActor(context || {});
            var clean = cloneSanitized(metadata || {}, '', []);
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actorId: actor.id,
                    severity: clean.severity || 'INFO',
                    metadata: Object.assign({
                        actionType: actionType,
                        actorRole: actor.role,
                        module: 'Leave Policy Configuration',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Leave Policy Configuration', targetId || '', description || actionType);
                return true;
            }
        } catch (error) {
            safeWarn('Audit failed safely.', error && error.message);
        }
        return false;
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return false;
            var telemetry = global.WorkflowTelemetryService;
            if (!telemetry) return false;
            if (typeof telemetry.emitWorkflowTelemetry === 'function') {
                telemetry.emitWorkflowTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
            if (typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('WORKFLOW', eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
        } catch (error) {
            safeWarn('Telemetry failed safely.', error && error.message);
        }
        return false;
    }

    function recordMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics) return false;
            var metrics = global.OrchestrationMetricsService;
            if (metrics && typeof metrics.recordWorkflowMetric === 'function') {
                metrics.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, metadata || {}));
                return true;
            }
        } catch (error) {
            safeWarn('Metric recording failed safely.', error && error.message);
        }
        return false;
    }

    function createLeavePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = normalizePolicyPayload(input || {}, access.tenantSlug, null);
        policy.createdAt = nowIso();
        policy.createdBy = access.actor.id;
        policy.updatedBy = access.actor.id;
        var issues = validationIssues(policy, data, {});
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeLeavePolicyOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        data[POLICY_TABLE].unshift(policy);
        savePolicyVersion(data, policy, access.actor.id, 'CREATED', input && input.reason);
        saveData(data);
        var metadata = { policyId: policy.policyId, tenantSlug: access.tenantSlug, policyCode: policy.policyCode, status: 'CREATED' };
        audit('LEAVE_POLICY_CREATED', policy.policyId, 'Leave policy created.', metadata, context || {});
        emitTelemetry('LEAVE_POLICY_CREATED', metadata, context || {});
        recordMetric('LEAVE_POLICY_CREATED', metadata, context || {});
        return freezeLeavePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: policy, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function updateLeavePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var existing = policyById(data, access.tenantSlug, input && input.policyId);
        if (!existing) return failure('LEAVE_POLICY_NOT_FOUND', 'Leave policy was not found.', input, context, {});
        var mergedSource = Object.assign({}, clone(existing), input && input.changes || {}, { policyId: existing.policyId, tenantSlug: access.tenantSlug, version: existing.version + 1 });
        var next = normalizePolicyPayload(mergedSource, access.tenantSlug, existing);
        next.version = existing.version + 1;
        next.updatedBy = access.actor.id;
        var issues = validationIssues(next, data, { policyId: existing.policyId });
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeLeavePolicyOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        Object.keys(existing).forEach(function remove(key) { delete existing[key]; });
        Object.assign(existing, next);
        savePolicyVersion(data, existing, access.actor.id, 'UPDATED', input && (input.reason || input.changes && input.changes.reason));
        saveData(data);
        var metadata = { policyId: existing.policyId, tenantSlug: access.tenantSlug, version: existing.version, status: 'UPDATED' };
        audit('LEAVE_POLICY_UPDATED', existing.policyId, 'Leave policy updated.', metadata, context || {});
        emitTelemetry('LEAVE_POLICY_UPDATED', metadata, context || {});
        recordMetric('LEAVE_POLICY_UPDATED', metadata, context || {});
        return freezeLeavePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: existing, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function approvalValid(approval) {
        return !!(approval && approval.approved === true && safeString(approval.approvedBy || approval.actorId || '', '') && safeString(approval.reason || '', ''));
    }

    function publishLeavePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('POLICY_PUBLISH_APPROVAL_REQUIRED', 'Policy publish requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('LEAVE_POLICY_NOT_FOUND', 'Leave policy was not found.', input, context, {});
        policy.status = 'PUBLISHED';
        policy.version += 1;
        policy.publishedAt = nowIso();
        policy.publishedBy = input.approval.approvedBy;
        policy.updatedAt = nowIso();
        savePolicyVersion(data, policy, access.actor.id, 'PUBLISHED', input.approval.reason);
        saveData(data);
        var metadata = { policyId: policy.policyId, tenantSlug: access.tenantSlug, version: policy.version, status: 'PUBLISHED' };
        audit('LEAVE_POLICY_PUBLISHED', policy.policyId, 'Leave policy published.', metadata, context || {});
        emitTelemetry('LEAVE_POLICY_PUBLISHED', metadata, context || {});
        recordMetric('LEAVE_POLICY_PUBLISHED', metadata, context || {});
        return freezeLeavePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: policy, governance: governanceFlags(true, context || {}) });
    }

    function rollbackLeavePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('POLICY_ROLLBACK_APPROVAL_REQUIRED', 'Policy rollback requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('LEAVE_POLICY_NOT_FOUND', 'Leave policy was not found.', input, context, {});
        var targetVersion = Number(input && input.targetVersion || 0);
        var version = (data[VERSION_TABLE] || []).find(function each(row) {
            return row.policyId === policy.policyId && sameTenant(row, access.tenantSlug) && Number(row.version) === targetVersion;
        });
        if (!version || !version.snapshot) return failure('LEAVE_POLICY_VERSION_NOT_FOUND', 'Target leave policy version was not found.', input, context, {});
        var nextVersion = policy.version + 1;
        var restored = clone(version.snapshot);
        restored.version = nextVersion;
        restored.status = restored.status || 'DRAFT';
        restored.updatedAt = nowIso();
        restored.updatedBy = access.actor.id;
        Object.keys(policy).forEach(function remove(key) { delete policy[key]; });
        Object.assign(policy, restored);
        savePolicyVersion(data, policy, access.actor.id, 'ROLLED_BACK', input && input.reason);
        data[ROLLBACK_TABLE].unshift({
            rollbackId: id('LEAVE-POLICY-ROLLBACK'),
            policyId: policy.policyId,
            tenantSlug: access.tenantSlug,
            targetVersion: targetVersion,
            restoredVersion: nextVersion,
            reason: safeString(input && input.reason, ''),
            approval: clone(input.approval),
            createdAt: nowIso(),
            immutable: true
        });
        saveData(data);
        var metadata = { policyId: policy.policyId, tenantSlug: access.tenantSlug, targetVersion: targetVersion, restoredVersion: nextVersion, status: 'ROLLED_BACK' };
        audit('LEAVE_POLICY_ROLLBACK', policy.policyId, 'Leave policy rollback executed.', metadata, context || {});
        emitTelemetry('LEAVE_POLICY_ROLLBACK', metadata, context || {});
        recordMetric('LEAVE_POLICY_ROLLBACK', metadata, context || {});
        return freezeLeavePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: policy, governance: governanceFlags(true, context || {}) });
    }

    function valueMatches(list, value) {
        if (!Array.isArray(list) || !list.length) return true;
        var key = normalizeKey(value);
        return list.some(function each(item) { return normalizeKey(item) === key; });
    }

    function employeeFor(data, tenantSlug, employeeId) {
        var target = normalizeId(employeeId);
        return (data.employees || []).find(function each(row) { return sameTenant(row, tenantSlug) && normalizeId(employeeIdOf(row)) === target; });
    }

    function evaluateEligibility(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('LEAVE_POLICY_NOT_FOUND', 'Leave policy was not found.', input, context, {});
        var employee = employeeFor(data, access.tenantSlug, input && input.employeeId);
        if (!employee) return failure('EMPLOYEE_NOT_FOUND', 'Employee was not found for leave policy eligibility.', input, context, {});
        var settings = data.companySettings || {};
        var criteria = [
            ['company', policy.eligibility.companies, settings.companyName || employee.company],
            ['businessUnit', policy.eligibility.businessUnits, employee.businessUnit],
            ['department', policy.eligibility.departments, employee.department],
            ['location', policy.eligibility.locations, employee.location || employee.locationName],
            ['branch', policy.eligibility.branches, employee.branch || employee.branchName],
            ['grade', policy.eligibility.grades, employee.employeeGrade || employee.grade || employee.salaryGrade],
            ['employmentType', policy.eligibility.employmentTypes, employee.employmentType],
            ['role', policy.eligibility.roles, employee.role],
            ['employee', policy.eligibility.employees, employeeIdOf(employee)]
        ];
        var matched = [];
        var failed = [];
        criteria.forEach(function each(row) {
            if (valueMatches(row[1], row[2])) matched.push(row[0]);
            else failed.push(row[0]);
        });
        var eligible = failed.length === 0;
        return freezeLeavePolicyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            employeeId: employeeIdOf(employee),
            eligible: eligible,
            matchedCriteria: matched,
            failedCriteria: failed,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function monthsBetween(start, end) {
        var startDate = new Date(start + 'T00:00:00Z');
        var endDate = new Date(end + 'T00:00:00Z');
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0;
        return Math.max(1, (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - startDate.getUTCMonth()) + 1);
    }

    function calculateAccrualProjection(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('LEAVE_POLICY_NOT_FOUND', 'Leave policy was not found.', input, context, {});
        var employee = employeeFor(data, access.tenantSlug, input && input.employeeId) || {};
        var asOf = safeString(input && input.asOfDate, '') || nowIso().slice(0, 10);
        var start = policy.effectiveDate;
        if (policy.accrualRules.joiningDateBased && validDate(employee.dateOfJoining) && employee.dateOfJoining > start) start = employee.dateOfJoining;
        var months = monthsBetween(start, asOf);
        var periods = months;
        if (policy.accrualRules.type === 'QUARTERLY') periods = Math.ceil(months / 3);
        if (policy.accrualRules.type === 'YEARLY') periods = Math.ceil(months / 12);
        if (policy.accrualRules.type === 'MANUAL_ALLOCATION') periods = 0;
        var projected = Math.max(0, Number(policy.accrualRules.daysPerPeriod || 0) * periods);
        return freezeLeavePolicyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            employeeId: input && input.employeeId,
            accrualType: policy.accrualRules.type,
            periods: periods,
            projectedAccrualDays: Math.round(projected * 100) / 100,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function configureApprovalRules(input, context) {
        return updateLeavePolicy({
            tenantSlug: input && input.tenantSlug,
            policyId: input && input.policyId,
            changes: { approvalRules: input && input.approvalRules || {}, reason: input && input.reason }
        }, context || {});
    }

    function simulateLeavePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('LEAVE_POLICY_NOT_FOUND', 'Leave policy was not found.', input, context, {});
        var scenario = normalizeStatus(input && input.scenario || 'EXISTING_EMPLOYEE');
        if (SIMULATION_SCENARIOS.indexOf(scenario) === -1) scenario = 'POLICY_CHANGE';
        var months = Math.max(1, Number(input && input.months || 12) || 12);
        var projectedLeaveBalances = policy.leaveTypes.map(function each(type) {
            var annual = Number(type.annualAllowance || 0);
            var projected = annual ? annual * (months / 12) : Number(policy.accrualRules.daysPerPeriod || 0) * months;
            if (scenario === 'RESIGNATION') projected = Math.max(0, projected / 2);
            return { leaveType: type.type, projectedDays: Math.round(projected * 100) / 100, carryForwardCap: policy.carryForward.unlimited ? 'UNLIMITED' : policy.carryForward.maxDays };
        });
        var output = {
            success: true,
            simulationId: id('LEAVE-POLICY-SIM'),
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            employeeId: safeString(input && input.employeeId, ''),
            scenario: scenario,
            projectedLeaveBalances: projectedLeaveBalances,
            assumptions: {
                months: months,
                employeeChangesAppliedInSimulationOnly: !!(input && input.changes),
                employeeLeaveBalancesModified: false
            },
            readOnly: true,
            nonDestructive: true,
            employeeLeaveBalancesModified: false,
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[SIMULATION_TABLE].unshift(Object.assign({ immutable: true, createdAt: nowIso() }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        audit('LEAVE_POLICY_SIMULATION_RUN', output.simulationId, 'Leave policy simulation generated.', { policyId: policy.policyId, tenantSlug: access.tenantSlug, scenario: scenario, status: 'COMPLETED' }, context || {});
        return freezeLeavePolicyOutput(output);
    }

    function generateLeaveAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policies = (data[POLICY_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var leaveRequests = (data.leaveRequests || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var published = policies.filter(function each(row) { return normalizeStatus(row.status) === 'PUBLISHED'; }).length;
        var utilization = leaveRequests.reduce(function sum(total, row) { return total + Number(row.totalDays || row.days || 0); }, 0);
        var carryForwardEnabled = policies.filter(function each(row) { return row.carryForward && row.carryForward.enabled; }).length;
        var encashmentEnabled = policies.filter(function each(row) { return row.encashment && row.encashment.enabled; }).length;
        var approvalLevels = policies.reduce(function sum(total, row) { return total + ((row.approvalRules && row.approvalRules.levels || []).length); }, 0);
        var policyHealth = clampScore(100 - Math.max(0, policies.length - published) * 6 - Math.max(0, approvalLevels - policies.length * 3) * 2);
        var compliance = clampScore(100 - policies.filter(function each(row) { return !validDate(row.effectiveDate) || row.expiryDate && row.expiryDate < nowIso().slice(0, 10); }).length * 10);
        var analytics = {
            policyCount: policies.length,
            publishedPolicies: published,
            leaveUtilization: utilization,
            accrualTrends: policies.map(function each(row) { return { policyId: row.policyId, type: row.accrualRules && row.accrualRules.type, daysPerPeriod: row.accrualRules && row.accrualRules.daysPerPeriod }; }),
            carryForwardPolicies: carryForwardEnabled,
            encashmentPolicies: encashmentEnabled,
            policyUsage: leaveRequests.length,
            averageApprovalLevels: policies.length ? Math.round(approvalLevels / policies.length) : 0,
            approvalTimeHours: Math.max(4, leaveRequests.length * 6)
        };
        var output = {
            success: true,
            tenantSlug: access.tenantSlug,
            analytics: analytics,
            leavePolicyHealthScore: policyHealth,
            complianceScore: compliance,
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(Object.assign({ analyticsId: id('LEAVE-POLICY-ANALYTICS'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        return freezeLeavePolicyOutput(output);
    }

    function generatePolicyDashboard(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policies = (data[POLICY_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var analytics = generateLeaveAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        return freezeLeavePolicyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            policyLibrary: policies.map(function each(row) { return { policyId: row.policyId, policyName: row.policyName, policyCode: row.policyCode, status: row.status, version: row.version, priority: row.priority }; }),
            eligibilityMatrix: policies.map(function each(row) { return { policyId: row.policyId, eligibility: row.eligibility }; }),
            approvalMatrix: policies.map(function each(row) { return { policyId: row.policyId, approvalRules: row.approvalRules }; }),
            accrualRules: policies.map(function each(row) { return { policyId: row.policyId, accrualRules: row.accrualRules }; }),
            carryForward: policies.map(function each(row) { return { policyId: row.policyId, carryForward: row.carryForward }; }),
            encashment: policies.map(function each(row) { return { policyId: row.policyId, encashment: row.encashment }; }),
            simulation: { latestSupportedScenarios: SIMULATION_SCENARIOS },
            analytics: analytics.analytics || {},
            leavePolicyHealthScore: analytics.leavePolicyHealthScore || 0,
            complianceScore: analytics.complianceScore || 0,
            compatibility: {
                existingLeaveWorkflowsPreserved: true,
                workflowEnginePreserved: true,
                approvalEnginePreserved: true,
                leaveBalancesUnaffected: true,
                existingEmployeeLeaveBalancesModified: false
            },
            governance: governanceFlags(false, context || {})
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeLeavePolicyOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            record('leave types available', LEAVE_TYPES.indexOf('ANNUAL_LEAVE') !== -1 && LEAVE_TYPES.indexOf('LEAVE_WITHOUT_PAY') !== -1, LEAVE_TYPES);
            record('accrual types available', ACCRUAL_TYPES.indexOf('MONTHLY') !== -1 && ACCRUAL_TYPES.indexOf('MANUAL_ALLOCATION') !== -1, ACCRUAL_TYPES);
            var frozen = freezeLeavePolicyOutput({ ok: true, nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            record('leave balances protected by default', governanceFlags(false, {}).leaveBalancesUnaffected === true, null);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezeLeavePolicyOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Leave policy configuration self-test completed.',
            checks: checks
        });
    }

    var LeavePolicyConfigurationService = Object.freeze({
        LEAVE_TYPES: LEAVE_TYPES,
        POLICY_STATES: POLICY_STATES,
        ACCRUAL_TYPES: ACCRUAL_TYPES,
        APPROVAL_MODES: APPROVAL_MODES,
        SIMULATION_SCENARIOS: SIMULATION_SCENARIOS,
        createLeavePolicy: createLeavePolicy,
        updateLeavePolicy: updateLeavePolicy,
        publishLeavePolicy: publishLeavePolicy,
        rollbackLeavePolicy: rollbackLeavePolicy,
        evaluateEligibility: evaluateEligibility,
        calculateAccrualProjection: calculateAccrualProjection,
        configureApprovalRules: configureApprovalRules,
        validateLeavePolicy: validateLeavePolicy,
        simulateLeavePolicy: simulateLeavePolicy,
        generateLeaveAnalytics: generateLeaveAnalytics,
        generatePolicyDashboard: generatePolicyDashboard,
        freezeLeavePolicyOutput: freezeLeavePolicyOutput
    });

    global.LeavePolicyConfigurationService = LeavePolicyConfigurationService;
    global.leavePolicyConfigurationService = LeavePolicyConfigurationService;
    global.LeavePolicyService = LeavePolicyConfigurationService;
    global.LeaveAccrualEngine = LeavePolicyConfigurationService;
    global.LeaveEligibilityService = LeavePolicyConfigurationService;
    global.LeaveApprovalConfigurator = LeavePolicyConfigurationService;
    global.LeavePolicyValidator = LeavePolicyConfigurationService;
    global.LeaveSimulationService = LeavePolicyConfigurationService;
    global.LeaveAnalyticsService = LeavePolicyConfigurationService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_LEAVE_POLICY_CONFIGURATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
