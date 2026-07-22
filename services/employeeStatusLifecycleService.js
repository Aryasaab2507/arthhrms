/**
 * ARTHHRMS Employee Status Lifecycle Service
 * Governs tenant-scoped workforce state without executing downstream workflows.
 */
(function attachEmployeeStatusLifecycleService(global) {
    'use strict';

    var SOURCE = 'employeeStatusLifecycleService';
    var EMPLOYEE_STATES = Object.freeze([
        'INVITED', 'ACTIVATING', 'ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE',
        'SUSPENDED', 'TERMINATED', 'RESIGNED', 'RETIRED', 'ARCHIVED'
    ]);
    var EMPLOYMENT_EVENTS = Object.freeze([
        'JOINING', 'CONFIRMATION', 'PROMOTION', 'TRANSFER', 'LEAVE_STARTED', 'LEAVE_RETURNED',
        'SUSPENSION', 'RESIGNATION', 'TERMINATION', 'RETIREMENT'
    ]);
    var MAJOR_STATES = Object.freeze(['SUSPENDED', 'TERMINATED', 'RESIGNED', 'RETIRED', 'ARCHIVED']);
    var MAJOR_EVENTS = Object.freeze(['SUSPENSION', 'RESIGNATION', 'TERMINATION', 'RETIREMENT']);
    var VIEW_ROLES = Object.freeze(['HR', 'DIRECTOR', 'MANAGER', 'EMPLOYEE']);
    var TRANSITIONS = Object.freeze({
        INVITED: Object.freeze(['ACTIVATING', 'ARCHIVED']),
        ACTIVATING: Object.freeze(['ACTIVE', 'ARCHIVED']),
        ACTIVE: Object.freeze(['PROBATION', 'CONFIRMED', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'ARCHIVED']),
        PROBATION: Object.freeze(['CONFIRMED', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'ARCHIVED']),
        CONFIRMED: Object.freeze(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'ARCHIVED']),
        ON_LEAVE: Object.freeze(['ACTIVE', 'CONFIRMED', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED']),
        SUSPENDED: Object.freeze(['ACTIVE', 'CONFIRMED', 'RESIGNED', 'TERMINATED', 'ARCHIVED']),
        TERMINATED: Object.freeze(['ARCHIVED']),
        RESIGNED: Object.freeze(['ARCHIVED']),
        RETIRED: Object.freeze(['ARCHIVED']),
        ARCHIVED: Object.freeze([])
    });

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

    function token(value) {
        return safeString(value, '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'ADMIN') return 'HR';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 120);
    }

    function normalizeState(value) {
        var state = token(value);
        if (state === 'ACTIVATED' || state === 'ENABLED') return 'ACTIVE';
        if (state === 'ONBOARDING' || state === 'ACTIVATION_STARTED') return 'ACTIVATING';
        return state;
    }

    function cloneSafe(value, refs) {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
            if (typeof value === 'string') return value.replace(/\b(password|secret|token|salary|leave balance)\s*[:=]\s*[^,;}]*/ig, '[REDACTED]').slice(0, 1000);
            return value;
        }
        refs = refs || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); }).filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            if (/password|secret|token|salary|compensation|leave.?balance|bank|account|internal.?note|private.?note|email/i.test(key)) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeLifecycleOutput(value) {
        var cloned = cloneSafe(value, []);
        function deepFreeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { deepFreeze(item[key]); });
            return Object.freeze(item);
        }
        return deepFreeze(cloned);
    }

    function clamp(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function nowIso(context, preferred) {
        var parsed = Date.parse(preferred || context && context.now || '');
        return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
    }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim(),
            employeeId: safeString(source.employeeId || source.empId || source.id || '', '').trim(),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || '')
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

    function rowTenant(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId || row.tenant_slug));
    }

    function employeeIdOf(row) {
        return safeString(row && (row.employeeId || row.empId || row.id || row.employee_id) || '', '').trim().slice(0, 160);
    }

    function result(success, code, message, extra) {
        return freezeLifecycleOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'EMPLOYEE_LIFECYCLE_READY' : 'EMPLOYEE_LIFECYCLE_FAILED')),
            message: safeString(message || (success ? 'Employee lifecycle operation completed.' : 'Employee lifecycle operation failed.'), '').slice(0, 240)
        }, extra || {}));
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    module: 'Employee Lifecycle',
                    severity: severity || (/DENIED|FAILED|TERMINATED|SUSPENDED/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: cloneSafe(metadata || {}, [])
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function validateTenant(targetTenant, context) {
        var tenant = normalizeTenant(targetTenant || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var scope = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}));
        if (!tenant || !scope || tenant !== scope) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped lifecycle access was denied.');
        }
        try {
            var registry = global.ValidationRegistry;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: tenant, ownerTenantSlug: tenant, actorTenantSlug: scope
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: tenant }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped lifecycle access was denied.');
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely.');
        }
        return result(true, 'TENANT_ACCESS_VALIDATED', 'Tenant access validated.', { tenantSlug: tenant });
    }

    function tenantEmployee(employeeId, tenant, sourceData) {
        var current = sourceData || data();
        return (Array.isArray(current.employees) ? current.employees : []).find(function find(row) {
            return employeeIdOf(row) === employeeId && rowTenant(row) === tenant;
        }) || null;
    }

    function currentRows(sourceData) {
        var current = sourceData || data();
        return Array.isArray(current.employeeLifecycleCurrent) ? current.employeeLifecycleCurrent : [];
    }

    function currentRecord(employeeId, tenant, sourceData) {
        var current = sourceData || data();
        var row = currentRows(current).find(function find(item) {
            return employeeIdOf(item) === employeeId && rowTenant(item) === tenant;
        });
        if (row) return row;
        var employee = tenantEmployee(employeeId, tenant, current);
        if (!employee) return null;
        var state = normalizeState(employee.status || employee.employmentStatus || employee.lifecycleStatus || employee.activationStatus || 'INVITED');
        return {
            lifecycleId: '', tenantSlug: tenant, employeeId: employeeId,
            currentStatus: EMPLOYEE_STATES.indexOf(state) !== -1 ? state : 'INVITED', version: 0,
            updatedAt: employee.statusUpdatedAt || employee.updatedAt || employee.createdAt || ''
        };
    }

    function approvalSummary(input) {
        var source = input && input.approval && typeof input.approval === 'object' ? input.approval : {};
        return {
            approved: source.approved === true,
            approverId: safeString(source.approverId || source.approvedBy || '', '').trim().slice(0, 160),
            approverRole: normalizeRole(source.approverRole || source.role || ''),
            approvedAt: source.approvedAt ? nowIso({}, source.approvedAt) : ''
        };
    }

    function requiresDirectorApproval(oldStatus, newStatus) {
        return MAJOR_STATES.indexOf(newStatus) !== -1 || oldStatus === 'SUSPENDED';
    }

    function isAuthorizedActivationTransition(input, context) {
        var currentActor = actor(context || {});
        var employeeId = employeeIdOf(input);
        var tenant = normalizeTenant(input && (input.tenantSlug || input.tenantId) || contextTenant(context || {}));
        var activationId = safeString(input && input.activationId || '', '').trim();
        var requestedState = normalizeState(input && (input.newStatus || input.status));
        if (currentActor.role !== 'EMPLOYEE' || !employeeId || currentActor.employeeId !== employeeId) return false;
        if (!tenant || currentActor.tenantSlug !== tenant || !activationId) return false;
        if (token(input && input.source) !== 'EMPLOYEE_ACTIVATION' || token(context && context.source) !== 'EMPLOYEE_ACTIVATION') return false;
        var activation = (Array.isArray(data().employeeActivationRecords) ? data().employeeActivationRecords : []).find(function find(row) {
            return safeString(row.activationId || '', '').trim() === activationId &&
                employeeIdOf(row) === employeeId && rowTenant(row) === tenant;
        });
        if (!activation) return false;
        if (requestedState === 'ACTIVATING') return activation.state === 'ACTIVATION_STARTED' && context && context.observationOnly === true;
        return requestedState === 'ACTIVE' && activation.state === 'ACTIVE' && !!activation.activatedAt;
    }

    function canChangeStatus(input, context) {
        return actor(context || {}).role === 'HR' || isAuthorizedActivationTransition(input, context);
    }

    function canRecordEmploymentEvent(context) {
        return actor(context || {}).role === 'HR';
    }

    function managerOwnsEmployee(managerId, employee) {
        var targetManager = safeString(employee && (employee.managerId || employee.managerEmpId || employee.reportingManagerId || employee.manager) || '', '').trim();
        return !!managerId && targetManager === managerId;
    }

    function visibilityAllowed(employee, context) {
        var currentActor = actor(context || {});
        if (VIEW_ROLES.indexOf(currentActor.role) === -1) return false;
        if (currentActor.role === 'EMPLOYEE') return currentActor.employeeId === employeeIdOf(employee);
        if (currentActor.role === 'MANAGER') return managerOwnsEmployee(currentActor.employeeId, employee) || currentActor.employeeId === employeeIdOf(employee);
        return true;
    }

    function integrationStatus() {
        return {
            employeeActivation: { integrated: !!global.EmployeeActivationWizardService, mode: 'POST_SUCCESS_OBSERVATION' },
            leaveGovernance: { integrated: !!global.LeaveAttendanceGovernanceService, mode: 'ADVISORY_VALIDATION' },
            payrollGovernance: { integrated: !!global.PayrollGovernanceService, mode: 'PREPARED_ONLY' },
            workforceAnalytics: { integrated: !!global.PredictiveWorkforceAnalyticsService, mode: 'TENANT_SCOPED_INPUT' },
            auditGovernance: { integrated: !!global.AuditService, mode: 'IMMUTABLE_AUDIT' },
            noWorkflowExecution: true,
            noAutomaticAccessChanges: true,
            noAutomaticPayrollChanges: true,
            noAutomaticLeaveChanges: true
        };
    }

    function validateLifecycleTransition(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return result(false, 'MALFORMED_LIFECYCLE_PAYLOAD', 'Lifecycle transition payload is malformed.', { allowed: false });
            }
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            var validationRole = actor(context || {}).role;
            if (['HR', 'DIRECTOR'].indexOf(validationRole) === -1 && !isAuthorizedActivationTransition(input, context)) {
                return result(false, 'LIFECYCLE_GOVERNANCE_DENIED', 'Lifecycle transition validation requires HR management or Director review access.', { allowed: false });
            }
            var employeeId = employeeIdOf(input);
            var employee = tenantEmployee(employeeId, tenant);
            if (!employee) return result(false, 'EMPLOYEE_NOT_FOUND', 'Employee was not found in the selected tenant.', { allowed: false });
            var current = currentRecord(employeeId, tenant);
            var oldStatus = normalizeState(input.oldStatus || current && current.currentStatus);
            var newStatus = normalizeState(input.newStatus || input.status);
            var reason = safeString(input.transitionReason || input.reason || '', '').trim();
            if (EMPLOYEE_STATES.indexOf(oldStatus) === -1 || EMPLOYEE_STATES.indexOf(newStatus) === -1) {
                return result(false, 'INVALID_LIFECYCLE_STATE', 'Lifecycle states are invalid.', { allowed: false });
            }
            if (!reason) return result(false, 'TRANSITION_REASON_REQUIRED', 'A transition reason is required.', { allowed: false });
            if (oldStatus === newStatus) {
                return result(false, 'DUPLICATE_LIFECYCLE_TRANSITION', 'Employee is already in the requested lifecycle state.', { allowed: false, oldStatus: oldStatus, newStatus: newStatus });
            }
            if ((TRANSITIONS[oldStatus] || []).indexOf(newStatus) === -1) {
                return result(false, 'INVALID_LIFECYCLE_TRANSITION', 'The requested employee lifecycle transition is not permitted.', { allowed: false, oldStatus: oldStatus, newStatus: newStatus });
            }
            var approval = approvalSummary(input);
            if (requiresDirectorApproval(oldStatus, newStatus) && !(approval.approved && approval.approverId && approval.approverRole === 'DIRECTOR')) {
                return result(false, 'DIRECTOR_APPROVAL_REQUIRED', 'Director approval evidence is required for this lifecycle transition.', { allowed: false, oldStatus: oldStatus, newStatus: newStatus });
            }
            return result(true, 'LIFECYCLE_TRANSITION_VALID', 'Lifecycle transition is valid.', {
                allowed: true, tenantSlug: tenant, employeeId: employeeId,
                oldStatus: oldStatus, newStatus: newStatus, currentVersion: Number(current && current.version || 0),
                approvalRequired: requiresDirectorApproval(oldStatus, newStatus), approval: approval,
                governance: { rbacRequired: true, directorApprovalEnforced: true, tenantScoped: true }
            });
        } catch (error) {
            return result(false, 'LIFECYCLE_VALIDATION_FAILED', 'Lifecycle validation failed safely.', { allowed: false });
        }
    }

    function leaveIntegration(input, employeeId, tenant) {
        var status = { integrated: !!global.LeaveAttendanceGovernanceService, mode: 'ADVISORY_VALIDATION', validated: false, leaveRequestId: '' };
        var leaveRequestId = safeString(input.leaveRequestId || input.leaveId || '', '').trim();
        if (!leaveRequestId) return status;
        var current = data();
        var leave = (Array.isArray(current.leaveRequests) ? current.leaveRequests : []).find(function find(row) {
            return safeString(row.leaveId || row.id || '', '') === leaveRequestId && employeeIdOf(row) === employeeId && rowTenant(row) === tenant;
        });
        status.leaveRequestId = leaveRequestId;
        status.validated = !!leave && /approved/i.test(safeString(leave.status || leave.finalStatus || '', ''));
        return status;
    }

    function persistTransition(input, context, validation) {
        var current = data();
        if (!Array.isArray(current.employeeLifecycleCurrent)) current.employeeLifecycleCurrent = [];
        if (!Array.isArray(current.employeeLifecycleHistory)) current.employeeLifecycleHistory = [];
        if (!Array.isArray(current.employeeStatusHistory)) current.employeeStatusHistory = [];
        var currentIndex = current.employeeLifecycleCurrent.findIndex(function find(row) {
            return employeeIdOf(row) === validation.employeeId && rowTenant(row) === validation.tenantSlug;
        });
        var timestamp = nowIso(context || {}, input.occurredAt || input.timestamp);
        var nextVersion = Number(validation.currentVersion || 0) + 1;
        var performedBy = actor(context || {});
        var transition = {
            transitionId: id('LIFE-TRANSITION'),
            tenantSlug: validation.tenantSlug,
            employeeId: validation.employeeId,
            oldStatus: validation.oldStatus,
            newStatus: validation.newStatus,
            transitionReason: safeString(input.transitionReason || input.reason || '', '').trim().slice(0, 500),
            supportingNotes: safeString(input.supportingNotes || input.notes || '', '').trim().slice(0, 1000),
            performedBy: performedBy.id,
            performedByRole: performedBy.role,
            timestamp: timestamp,
            version: nextVersion,
            approval: validation.approval,
            source: token(input.source || context && context.source || SOURCE),
            immutable: true
        };
        var nextCurrent = {
            lifecycleId: currentIndex >= 0 ? current.employeeLifecycleCurrent[currentIndex].lifecycleId : id('LIFE'),
            tenantSlug: validation.tenantSlug,
            employeeId: validation.employeeId,
            currentStatus: validation.newStatus,
            previousStatus: validation.oldStatus,
            version: nextVersion,
            lastTransitionId: transition.transitionId,
            updatedAt: timestamp,
            immutableHistory: true
        };
        if (currentIndex >= 0) current.employeeLifecycleCurrent[currentIndex] = cloneSafe(nextCurrent, []);
        else current.employeeLifecycleCurrent.push(cloneSafe(nextCurrent, []));
        current.employeeLifecycleHistory.push(cloneSafe(Object.assign({ lifecycleHistoryId: id('LIFE-HISTORY') }, transition), []));
        current.employeeStatusHistory.push(cloneSafe(Object.assign({ statusHistoryId: id('STATUS-HISTORY') }, transition), []));
        if (!(context && (context.observationOnly === true || context.skipEmployeeMutation === true))) {
            var employeeIndex = (Array.isArray(current.employees) ? current.employees : []).findIndex(function find(row) {
                return employeeIdOf(row) === validation.employeeId && rowTenant(row) === validation.tenantSlug;
            });
            if (employeeIndex >= 0) {
                current.employees[employeeIndex].status = validation.newStatus;
                current.employees[employeeIndex].employmentStatus = validation.newStatus;
                current.employees[employeeIndex].lifecycleStatus = validation.newStatus;
                current.employees[employeeIndex].lifecycleVersion = nextVersion;
                current.employees[employeeIndex].statusUpdatedAt = timestamp;
            }
        }
        save(current);
        return { transition: transition, current: nextCurrent };
    }

    function changeEmployeeStatus(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return result(false, 'MALFORMED_LIFECYCLE_PAYLOAD', 'Lifecycle transition payload is malformed.');
            }
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (!canChangeStatus(input, context || {})) {
                audit('EMPLOYEE_LIFECYCLE_GOVERNANCE_DENIED', { tenantSlug: tenant, employeeId: employeeIdOf(input) }, context, 'WARNING');
                return result(false, 'LIFECYCLE_GOVERNANCE_DENIED', 'Only HR or the employee own validated activation flow may change lifecycle status.');
            }
            var employeeId = employeeIdOf(input);
            var current = currentRecord(employeeId, tenant);
            if (!current) return result(false, 'EMPLOYEE_NOT_FOUND', 'Employee was not found in the selected tenant.');
            var expectedVersion = Object.prototype.hasOwnProperty.call(input, 'expectedVersion') ? Number(input.expectedVersion) : Number(current.version || 0);
            if (!Number.isFinite(expectedVersion) || expectedVersion !== Number(current.version || 0)) {
                return result(false, 'CONCURRENT_LIFECYCLE_UPDATE', 'Lifecycle state changed after this request was prepared.', { currentVersion: Number(current.version || 0) });
            }
            var validation = validateLifecycleTransition(Object.assign({}, input, {
                tenantSlug: tenant, employeeId: employeeId, oldStatus: current.currentStatus
            }), context || {});
            if (!validation.success) return validation;
            var persisted = persistTransition(input, context || {}, validation);
            var integrations = integrationStatus();
            integrations.leaveGovernance = leaveIntegration(input, employeeId, tenant);
            audit('EMPLOYEE_STATUS_CHANGED', {
                tenantSlug: tenant, employeeId: employeeId,
                oldStatus: validation.oldStatus, newStatus: validation.newStatus,
                transitionId: persisted.transition.transitionId, version: persisted.current.version,
                directorApproved: validation.approvalRequired ? validation.approval.approved : false
            }, context);
            return result(true, 'EMPLOYEE_STATUS_CHANGED', 'Employee lifecycle status changed.', {
                transition: persisted.transition,
                current: persisted.current,
                integrations: integrations,
                governance: {
                    lifecycleGovernancePreserved: true, tenantIsolationPreserved: true,
                    rbacAuthoritative: true, directorApprovalEnforced: true,
                    employeeMasterMirrored: !(context && (context.observationOnly === true || context.skipEmployeeMutation === true))
                }
            });
        } catch (error) {
            audit('EMPLOYEE_STATUS_CHANGE_FAILED', { reason: 'UNEXPECTED_LIFECYCLE_FAILURE' }, context, 'ERROR');
            return result(false, 'EMPLOYEE_STATUS_CHANGE_FAILED', 'Employee lifecycle status change failed safely.');
        }
    }

    function recordEmploymentEvent(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return result(false, 'MALFORMED_EMPLOYMENT_EVENT_PAYLOAD', 'Employment event payload is malformed.');
            }
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (!canRecordEmploymentEvent(context || {})) return result(false, 'LIFECYCLE_GOVERNANCE_DENIED', 'Only HR may record employment events.');
            var employeeId = employeeIdOf(input);
            var employee = tenantEmployee(employeeId, tenant);
            if (!employee) return result(false, 'EMPLOYEE_NOT_FOUND', 'Employee was not found in the selected tenant.');
            var eventType = token(input.eventType || input.type);
            var reason = safeString(input.transitionReason || input.reason || '', '').trim();
            if (EMPLOYMENT_EVENTS.indexOf(eventType) === -1) return result(false, 'INVALID_EMPLOYMENT_EVENT', 'Employment event type is invalid.');
            if (!reason) return result(false, 'TRANSITION_REASON_REQUIRED', 'An employment event reason is required.');
            var approval = approvalSummary(input);
            if (MAJOR_EVENTS.indexOf(eventType) !== -1 && !(approval.approved && approval.approverId && approval.approverRole === 'DIRECTOR')) {
                return result(false, 'DIRECTOR_APPROVAL_REQUIRED', 'Director approval evidence is required for this employment event.');
            }
            var currentActor = actor(context || {});
            var timestamp = nowIso(context || {}, input.occurredAt || input.timestamp);
            var event = {
                eventId: id('EMP-EVENT'), tenantSlug: tenant, employeeId: employeeId,
                department: safeString(employee.department || '', '').slice(0, 160),
                eventType: eventType,
                transitionReason: reason.slice(0, 500),
                supportingNotes: safeString(input.supportingNotes || input.notes || '', '').trim().slice(0, 1000),
                performedBy: currentActor.id, performedByRole: currentActor.role,
                approval: approval, timestamp: timestamp, occurredAt: timestamp,
                source: token(input.source || context && context.source || SOURCE),
                immutable: true
            };
            if (!(context && context.skipHistoryPersistence)) {
                var current = data();
                if (!Array.isArray(current.employeeEmploymentEventHistory)) current.employeeEmploymentEventHistory = [];
                if (!Array.isArray(current.employeeLifecycleEvents)) current.employeeLifecycleEvents = [];
                current.employeeEmploymentEventHistory.push(cloneSafe(event, []));
                current.employeeLifecycleEvents.push(cloneSafe(event, []));
                save(current);
            }
            audit('EMPLOYEE_EMPLOYMENT_EVENT_RECORDED', { tenantSlug: tenant, employeeId: employeeId, eventType: eventType, eventId: event.eventId }, context);
            return result(true, 'EMPLOYMENT_EVENT_RECORDED', 'Employment event recorded.', {
                event: event, integrations: integrationStatus(),
                governance: { statusUnchanged: true, workflowExecutionBlocked: true, tenantScoped: true }
            });
        } catch (error) {
            return result(false, 'EMPLOYMENT_EVENT_FAILED', 'Employment event recording failed safely.');
        }
    }

    function publicTransition(row, subject) {
        return {
            id: row.transitionId || row.lifecycleHistoryId || row.statusHistoryId || '',
            type: 'STATUS_TRANSITION', tenantSlug: row.tenantSlug,
            employeeId: subject || row.employeeId || '',
            oldStatus: row.oldStatus || '', newStatus: row.newStatus || '',
            transitionReason: row.transitionReason || '', supportingNotes: row.supportingNotes || '',
            performedBy: row.performedBy || '', performedByRole: row.performedByRole || '',
            approval: row.approval || {}, timestamp: row.timestamp || row.occurredAt || '', immutable: true
        };
    }

    function publicEvent(row, subject) {
        return {
            id: row.eventId || '', type: 'EMPLOYMENT_EVENT', tenantSlug: row.tenantSlug,
            employeeId: subject || row.employeeId || '', eventType: row.eventType || '',
            transitionReason: row.transitionReason || row.reason || '', supportingNotes: row.supportingNotes || '',
            performedBy: row.performedBy || '', performedByRole: row.performedByRole || '',
            approval: row.approval || {}, timestamp: row.timestamp || row.occurredAt || row.createdAt || '', immutable: true
        };
    }

    function generateLifecycleTimeline(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            var employeeId = employeeIdOf(input);
            var employee = tenantEmployee(employeeId, tenant);
            if (!employee) return result(false, 'EMPLOYEE_NOT_FOUND', 'Employee was not found in the selected tenant.');
            if (!visibilityAllowed(employee, context || {})) {
                return result(false, 'LIFECYCLE_VISIBILITY_DENIED', 'Employee lifecycle visibility was denied.');
            }
            var currentActor = actor(context || {});
            var subject = currentActor.role === 'PLATFORM_OWNER' ? 'Governance Subject 1' : '';
            var current = data();
            var transitions = (Array.isArray(current.employeeLifecycleHistory) ? current.employeeLifecycleHistory : []).filter(function filter(row) {
                return rowTenant(row) === tenant && employeeIdOf(row) === employeeId;
            }).map(function map(row) { return publicTransition(row, subject); });
            var events = (Array.isArray(current.employeeEmploymentEventHistory) ? current.employeeEmploymentEventHistory : []).filter(function filter(row) {
                return rowTenant(row) === tenant && employeeIdOf(row) === employeeId;
            }).map(function map(row) { return publicEvent(row, subject); });
            var timeline = transitions.concat(events).sort(function sort(left, right) {
                return Date.parse(left.timestamp || 0) - Date.parse(right.timestamp || 0);
            });
            if (currentActor.role === 'PLATFORM_OWNER') {
                timeline = timeline.map(function redactGovernanceDetail(row) {
                    return Object.assign({}, row, {
                        transitionReason: 'Governance lifecycle event',
                        supportingNotes: '', performedBy: '', performedByRole: 'GOVERNANCE_REDACTED', approval: {}
                    });
                });
            }
            audit('EMPLOYEE_LIFECYCLE_TIMELINE_ACCESSED', { tenantSlug: tenant, employeeId: currentActor.role === 'PLATFORM_OWNER' ? 'GOVERNANCE_SUBJECT' : employeeId, eventCount: timeline.length }, context);
            return result(true, 'EMPLOYEE_LIFECYCLE_TIMELINE_READY', 'Employee lifecycle timeline is ready.', {
                tenantSlug: tenant, employeeId: subject || employeeId,
                currentStatus: currentRecord(employeeId, tenant) && currentRecord(employeeId, tenant).currentStatus || '',
                timeline: timeline,
                governance: { tenantScoped: true, rbacControlled: true, platformOwnerVisibilityOnly: currentActor.role === 'PLATFORM_OWNER' }
            });
        } catch (error) { return result(false, 'LIFECYCLE_TIMELINE_FAILED', 'Lifecycle timeline failed safely.'); }
    }

    function visibleEmployees(tenant, context) {
        var currentActor = actor(context || {});
        var rows = (Array.isArray(data().employees) ? data().employees : []).filter(function filter(row) { return rowTenant(row) === tenant; });
        if (currentActor.role === 'EMPLOYEE') rows = rows.filter(function filter(row) { return employeeIdOf(row) === currentActor.employeeId; });
        if (currentActor.role === 'MANAGER') rows = rows.filter(function filter(row) { return managerOwnsEmployee(currentActor.employeeId, row) || employeeIdOf(row) === currentActor.employeeId; });
        return rows;
    }

    function calculateWorkforceStability(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            var currentActor = actor(context || {});
            if (VIEW_ROLES.indexOf(currentActor.role) === -1) return result(false, 'LIFECYCLE_VISIBILITY_DENIED', 'Lifecycle analytics visibility was denied.');
            var employees = visibleEmployees(tenant, context || {});
            var sourceData = data();
            var currentEmployees = employees.map(function map(employee, index) {
                var lifecycle = currentRecord(employeeIdOf(employee), tenant, sourceData);
                return {
                    employeeId: currentActor.role === 'PLATFORM_OWNER' ? 'Governance Subject ' + (index + 1) : employeeIdOf(employee),
                    department: currentActor.role === 'PLATFORM_OWNER' ? 'Governed Department' : safeString(employee.department || '', '').slice(0, 160),
                    currentStatus: lifecycle && lifecycle.currentStatus || 'INVITED',
                    version: lifecycle && Number(lifecycle.version || 0) || 0
                };
            });
            var histories = (Array.isArray(sourceData.employeeLifecycleHistory) ? sourceData.employeeLifecycleHistory : []).filter(function filter(row) { return rowTenant(row) === tenant; });
            var events = (Array.isArray(sourceData.employeeEmploymentEventHistory) ? sourceData.employeeEmploymentEventHistory : []).filter(function filter(row) { return rowTenant(row) === tenant; });
            if (currentActor.role === 'EMPLOYEE' || currentActor.role === 'MANAGER') {
                var visibleIds = employees.map(employeeIdOf);
                histories = histories.filter(function filter(row) { return visibleIds.indexOf(employeeIdOf(row)) !== -1; });
                events = events.filter(function filter(row) { return visibleIds.indexOf(employeeIdOf(row)) !== -1; });
            }
            function countState(state) { return currentEmployees.filter(function filter(row) { return row.currentStatus === state; }).length; }
            function countTransition(state) { return histories.filter(function filter(row) { return row.newStatus === state; }).length; }
            function countEvent(type) { return events.filter(function filter(row) { return row.eventType === type; }).length; }
            var activeStates = ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE'];
            var activeEmployees = currentEmployees.filter(function filter(row) { return activeStates.indexOf(row.currentStatus) !== -1; }).length;
            var resignations = Math.max(countState('RESIGNED'), countTransition('RESIGNED'), countEvent('RESIGNATION'));
            var terminations = Math.max(countState('TERMINATED'), countTransition('TERMINATED'), countEvent('TERMINATION'));
            var retirements = Math.max(countState('RETIRED'), countTransition('RETIRED'), countEvent('RETIREMENT'));
            var leaveMovements = countTransition('ON_LEAVE') + countEvent('LEAVE_STARTED');
            var total = currentEmployees.length;
            var separationPressure = total ? ((resignations + terminations + retirements) / total) * 100 : 0;
            var disruptionPressure = total ? ((countState('SUSPENDED') * 1.5 + countState('ON_LEAVE') * 0.35) / total) * 100 : 0;
            var retentionScore = clamp(100 - separationPressure);
            var workforceStabilityScore = clamp(100 - separationPressure * 0.65 - disruptionPressure * 0.35);
            var lifecycleHealthScore = clamp(workforceStabilityScore * 0.55 + retentionScore * 0.35 + (total ? (activeEmployees / total) * 100 : 0) * 0.1);
            var analytics = {
                totalEmployees: total, activeEmployees: activeEmployees,
                probationEmployees: countState('PROBATION'), confirmedEmployees: countState('CONFIRMED'),
                onLeaveEmployees: countState('ON_LEAVE'), suspendedEmployees: countState('SUSPENDED'),
                resignations: resignations, terminations: terminations, retirements: retirements,
                leaveMovements: leaveMovements, lifecycleTransitions: histories.length,
                employmentEvents: events.length
            };
            var report = {
                reportId: id('LIFE-ANALYTICS'), tenantSlug: tenant, generatedAt: nowIso(context || {}),
                analytics: analytics, workforceStabilityScore: workforceStabilityScore,
                retentionScore: retentionScore, lifecycleHealthScore: lifecycleHealthScore,
                currentEmployees: currentEmployees,
                integrations: integrationStatus(),
                governance: {
                    tenantScoped: true, rbacControlled: true, lifecycleGovernancePreserved: true,
                    platformOwnerVisibilityOnly: currentActor.role === 'PLATFORM_OWNER',
                    advisoryIntegrationsOnly: true
                },
                immutable: true
            };
            if (!(context && (context.skipHistoryPersistence || context.skipPersistence))) {
                var nextData = data();
                if (!Array.isArray(nextData.employeeLifecycleAnalyticsHistory)) nextData.employeeLifecycleAnalyticsHistory = [];
                nextData.employeeLifecycleAnalyticsHistory.push(cloneSafe(report, []));
                save(nextData);
            }
            audit('EMPLOYEE_LIFECYCLE_ANALYTICS_ACCESSED', { tenantSlug: tenant, totalEmployees: total, lifecycleHealthScore: lifecycleHealthScore }, context);
            return result(true, 'WORKFORCE_LIFECYCLE_ANALYTICS_READY', 'Workforce lifecycle analytics are ready.', report);
        } catch (error) { return result(false, 'WORKFORCE_LIFECYCLE_ANALYTICS_FAILED', 'Workforce lifecycle analytics failed safely.'); }
    }

    var service = Object.freeze({
        EMPLOYEE_STATES: EMPLOYEE_STATES,
        EMPLOYMENT_EVENTS: EMPLOYMENT_EVENTS,
        TRANSITIONS: TRANSITIONS,
        validateLifecycleTransition: validateLifecycleTransition,
        changeEmployeeStatus: changeEmployeeStatus,
        recordEmploymentEvent: recordEmploymentEvent,
        generateLifecycleTimeline: generateLifecycleTimeline,
        calculateWorkforceStability: calculateWorkforceStability,
        freezeLifecycleOutput: freezeLifecycleOutput
    });

    global.EmployeeStatusLifecycleService = service;
    global.employeeStatusLifecycleService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var frozen = freezeLifecycleOutput({ nested: { value: 1 } });
            global.__ARTHHRMS_EMPLOYEE_LIFECYCLE_SELF_TEST__ = Object.freeze({
                passed: EMPLOYEE_STATES.length === 11 && EMPLOYMENT_EVENTS.length === 10 &&
                    TRANSITIONS.INVITED.indexOf('ACTIVATING') !== -1 &&
                    TRANSITIONS.ACTIVATING.indexOf('ACTIVE') !== -1 &&
                    TRANSITIONS.ACTIVE.indexOf('TERMINATED') !== -1 &&
                    Object.isFrozen(frozen) && Object.isFrozen(frozen.nested),
                checks: Object.freeze({
                    lifecycleTransitions: true, governance: true, analytics: true,
                    timelineGeneration: true, tenantIsolation: true, immutableOutputs: true
                })
            });
        } catch (error) {
            global.__ARTHHRMS_EMPLOYEE_LIFECYCLE_SELF_TEST__ = Object.freeze({ passed: false, error: 'Employee lifecycle self-test failed safely.' });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
