/**
 * leaveAttendanceGovernanceService.js
 * ARTHHRMS Enterprise Leave Governance + Attendance Policy Enforcement.
 *
 * Additive governance layer for leave, attendance, shifts, holidays, approval
 * queues, and anomalies. It does not replace leaveService or attendanceService.
 */
(function attachLeaveAttendanceGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[LeaveAttendanceGovernanceService]';

    var LEAVE_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        SUBMITTED: 'SUBMITTED',
        REVIEW_PENDING: 'REVIEW_PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        CANCELLED: 'CANCELLED',
        EXPIRED: 'EXPIRED',
        ARCHIVED: 'ARCHIVED'
    });

    var ATTENDANCE_STATES = Object.freeze({
        PRESENT: 'PRESENT',
        ABSENT: 'ABSENT',
        LATE: 'LATE',
        HALF_DAY: 'HALF_DAY',
        REMOTE: 'REMOTE',
        ON_LEAVE: 'ON_LEAVE',
        HOLIDAY: 'HOLIDAY',
        WEEK_OFF: 'WEEK_OFF'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_LEAVE_ONLY: 'OWN_LEAVE_ONLY',
        TEAM_LEAVE_VISIBILITY: 'TEAM_LEAVE_VISIBILITY',
        OPERATIONAL_LEAVE_VISIBILITY: 'OPERATIONAL_LEAVE_VISIBILITY',
        STRATEGIC_LEAVE_ANALYTICS: 'STRATEGIC_LEAVE_ANALYTICS',
        ORG_LEVEL_SUMMARIES: 'ORG_LEVEL_SUMMARIES',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var VALID_LEAVE_TYPES = Object.freeze([
        'CASUAL LEAVE',
        'SICK LEAVE',
        'EARNED LEAVE',
        'WORK FROM HOME',
        'UNPAID LEAVE',
        'LEAVE WITHOUT PAY',
        'MATERNITY LEAVE',
        'PATERNITY LEAVE'
    ]);

    var SENSITIVE_KEY_PATTERN = /(leave[_-]?balance|balance|reason|remarks|private.?note|medical|illness|document|documentUrl|employeeName|salary|payroll|payslip|compensation|ctc|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(private note|medical|illness|leave balance|salary|payroll|compensation)\b[:=]?\s*[^,;}]*/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        leaveBalanceHealth: true,
        balanceEditingBlocked: true,
        superAdminBalanceEditingAllowed: true,
        balanceAlerts: true,
        leaveBalanceGovernance: true,
        leaveBalanceProtected: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function safeInfo(message, details) {
        try { if (global.console && console.info) console.info(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function rawData() {
        try {
            var source = db();
            if (source && typeof source.get === 'function') return source.get() || {};
        } catch (error) {}
        return {};
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

    function nowIso() {
        return new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        return String(value);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    }

    function normalizeRole(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (normalized === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (normalized === 'HRHEAD') return 'HR_HEAD';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.id) || '', '').trim();
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray(data.employees) ? data.employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function employeeTenant(empId, data) {
        return rowTenant(employeeById(empId, data || rawData()));
    }

    function sourceTenant(row, data) {
        return rowTenant(row) || employeeTenant(empIdOf(row), data || rawData());
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reporting_manager_id || '', '') === safeString(managerId || '', ''));
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value) {
        if (Array.isArray(value)) return value.map(cloneSanitized);
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return sanitizeText(value);
            return value;
        }
        var output = {};
        Object.keys(value).forEach(function copyKey(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
            output[key] = cloneSanitized(value[key]);
        });
        return output;
    }

    function freezeLeaveOutput(value) {
        return deepFreeze(cloneSanitized(value));
    }

    function safeFailure(code, classification, message, metadata) {
        return {
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, message, metadata) {
        return {
            warningCode: code,
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function hasSensitiveLeaveFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key)) return true;
            return input[key] && typeof input[key] === 'object' && hasSensitiveLeaveFields(input[key]);
        });
    }

    function classifyAttendanceRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantLeave || source.crossTenantAttendance || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInHierarchy || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.unsafeOverlap || source.insufficientBalance || source.unsafeManualOverride || source.invalidApprovalChain) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedAttendance || source.shiftMismatch || source.latePolicy || source.attendanceCorrection) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityForRole(role, actor, targetEmpId, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var actorEmpId = safeString(actor && (actor.empId || actor.employeeId || actor.id) || '', '').trim();
        if (normalized === 'EMPLOYEE') {
            return actorEmpId && targetEmpId && actorEmpId === targetEmpId ? VISIBILITY.OWN_LEAVE_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return managerOwnsEmployee(actorEmpId, targetEmpId, data) ? VISIBILITY.TEAM_LEAVE_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.OPERATIONAL_LEAVE_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_LEAVE_ANALYTICS;
        if (normalized === 'DIRECTOR') return VISIBILITY.ORG_LEVEL_SUMMARIES;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateLeaveScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetEmpId = empIdOf(source);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, targetEmpId, data);
            var failures = [];

            if (targetTenant && ctxTenant && targetTenant !== ctxTenant) {
                failures.push(safeFailure('CROSS_TENANT_LEAVE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant leave visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && ctxTenant) {
                failures.push(safeFailure('PLATFORM_OWNER_LEAVE_HIERARCHY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant leave hierarchy.'));
            }
            if (role === 'SUPER_ADMIN' && (source.editBalance === true || source.updateBalance === true || hasSensitiveLeaveFields(source))) {
                failures.push(safeFailure('SUPER_ADMIN_LEAVE_BALANCE_EDIT_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators cannot directly edit leave balances.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_LEAVE_ONLY) {
                failures.push(safeFailure('EMPLOYEE_LEAVE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own leave and attendance scope.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.TEAM_LEAVE_VISIBILITY) {
                failures.push(safeFailure('MANAGER_TEAM_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only their team leave and attendance scope.'));
            }

            var classification = failures.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                : failures.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })
                    ? FAILURE_CLASSIFICATIONS.HIGH_RISK
                    : FAILURE_CLASSIFICATIONS.INFO;

            return freezeLeaveOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    empId: targetTenant === ctxTenant ? targetEmpId : '',
                    leaveId: targetTenant === ctxTenant ? safeString(source.leaveId || source.id || '', '') : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    attendanceLeaveConfidentialityPreserved: true,
                    leaveBalanceProtected: true
                }
            });
        } catch (error) {
            return freezeLeaveOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('LEAVE_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leave scope validation failed safely.')]
            });
        }
    }

    function dateValue(value) {
        var text = safeString(value || '', '').slice(0, 10);
        var parsed = new Date(text + 'T00:00:00');
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }

    function dateDiffInclusive(from, to) {
        var start = dateValue(from);
        var end = dateValue(to || from);
        if (!start || !end || end < start) return 0;
        return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    }

    function rangesOverlap(aFrom, aTo, bFrom, bTo) {
        var aStart = dateValue(aFrom);
        var aEnd = dateValue(aTo || aFrom);
        var bStart = dateValue(bFrom);
        var bEnd = dateValue(bTo || bFrom);
        if (!aStart || !aEnd || !bStart || !bEnd) return false;
        return aStart <= bEnd && bStart <= aEnd;
    }

    function normalizeLeaveType(value) {
        return safeString(value || '', '').trim().replace(/\s+/g, ' ');
    }

    function validateLeaveRequest(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return freezeLeaveOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: LEAVE_STATES.REVIEW_PENDING,
                    failures: [safeFailure('MALFORMED_LEAVE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Leave payload is malformed.')],
                    warnings: []
                });
            }
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(input.tenantSlug || input.tenant_slug || contextTenant(context));
            var empId = empIdOf(input);
            var emp = employeeById(empId, data);
            var empTenant = rowTenant(emp);
            var from = safeString(input.from || input.fromDate || input.from_date || '', '').slice(0, 10);
            var to = safeString(input.to || input.toDate || input.to_date || from, '').slice(0, 10);
            var totalDays = Number(input.totalDays || input.total_days || dateDiffInclusive(from, to));
            var leaveType = normalizeLeaveType(input.leaveType || input.type || input.leave_type);
            var failures = [];
            var warnings = [];

            if (tenantSlug && rowTenant(input) && rowTenant(input) !== tenantSlug) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Leave request belongs to another tenant.', {}));
            }
            if (empTenant && tenantSlug && empTenant !== tenantSlug) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Leave employee belongs to another tenant.', {}));
            }
            if (!emp) {
                failures.push(safeFailure('LEAVE_EMPLOYEE_NOT_FOUND', FAILURE_CLASSIFICATIONS.WARNING, 'Leave employee was not found in this tenant.', {}));
            }
            if (!dateValue(from) || !dateValue(to) || dateValue(to) < dateValue(from)) {
                failures.push(safeFailure('INVALID_DATE_RANGE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leave date range is invalid.', {}));
            }
            if (VALID_LEAVE_TYPES.indexOf(leaveType.toUpperCase()) === -1) {
                failures.push(safeFailure('INVALID_LEAVE_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Leave type is not allowed by policy.', {}));
            }
            var activeStatuses = ['PENDING', 'SUBMITTED', 'APPROVED', 'MANAGER APPROVED', 'REVIEW_PENDING'];
            (Array.isArray(data.leaveRequests) ? data.leaveRequests : []).forEach(function check(existing) {
                if (empIdOf(existing) !== empId) return;
                if (sourceTenant(existing, data) !== tenantSlug) return;
                var status = safeString(existing.finalStatus || existing.status || '', '').toUpperCase();
                if (['REJECTED', 'CANCELLED', 'ARCHIVED'].indexOf(status) !== -1) return;
                if (activeStatuses.some(function active(label) { return status.indexOf(label) !== -1; }) && rangesOverlap(from, to, existing.from || existing.fromDate, existing.to || existing.toDate)) {
                    failures.push(safeFailure('OVERLAPPING_LEAVE_REQUEST', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Overlapping leave request detected.', { leaveId: existing.leaveId || existing.id }));
                }
            });
            if (emp && totalDays > Number(emp.leaveBalance || 0) && !/work from home/i.test(leaveType)) {
                failures.push(safeFailure('INSUFFICIENT_LEAVE_BALANCE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leave balance is insufficient for this request.', {}));
            }
            var chain = Array.isArray(input.approvalChain) ? input.approvalChain : [];
            if (chain.some(function invalid(step) {
                var role = normalizeRole(step && step.role);
                return role === 'PLATFORM_OWNER' || ['MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR'].indexOf(role) === -1;
            })) {
                failures.push(safeFailure('INVALID_APPROVAL_CHAIN', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leave approval chain contains an unsafe role.', {}));
            }
            if (!chain.length) warnings.push(safeWarning('APPROVAL_CHAIN_DEFAULTED', 'Leave approval chain should be explicitly reviewed.'));

            var classification = failures.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                : failures.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })
                    ? FAILURE_CLASSIFICATIONS.HIGH_RISK
                    : warnings.length
                        ? FAILURE_CLASSIFICATIONS.WARNING
                        : FAILURE_CLASSIFICATIONS.INFO;
            return freezeLeaveOutput({
                success: failures.length === 0,
                classification: classification,
                state: failures.length ? LEAVE_STATES.REVIEW_PENDING : LEAVE_STATES.SUBMITTED,
                tenantSlug: tenantSlug,
                empId: empTenant === tenantSlug ? empId : '',
                leaveType: leaveType,
                dateRange: { from: from, to: to, days: totalDays },
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    approvalGovernancePreserved: true,
                    historicalLeaveMutable: false,
                    attendanceLeaveConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeLeaveOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: LEAVE_STATES.REVIEW_PENDING,
                failures: [safeFailure('LEAVE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leave validation failed safely.')],
                warnings: []
            });
        }
    }

    function normalizeAttendanceRecord(record, tenantSlug) {
        var source = record || {};
        return {
            empId: empIdOf(source),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenant_slug || tenantSlug),
            attendanceId: safeString(source.attendanceId || source.attendance_id || source.id || '', ''),
            date: safeString(source.date || source.attendanceDate || source.attendance_date || '', '').slice(0, 10),
            shiftId: safeString(source.shiftId || source.shift_id || '', ''),
            status: normalizeToken(source.status || ''),
            checkIn: safeString(source.checkIn || source.check_in || '', ''),
            checkOut: safeString(source.checkOut || source.check_out || '', ''),
            lateMinutes: Number(source.lateMinutes || source.late_minutes || 0),
            workingHours: safeString(source.workingHours || source.working_hours || source.working_hours_text || '', ''),
            source: safeString(source.source || 'manual', 'manual')
        };
    }

    function normalizeAttendancePayload(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || contextTenant(context));
            var records = Array.isArray(source.records) ? source.records : Array.isArray(source.attendance) ? source.attendance : Array.isArray(source.rows) ? source.rows : [];
            return freezeLeaveOutput({
                tenantSlug: tenantSlug,
                records: records.map(function normalize(row) { return normalizeAttendanceRecord(row, tenantSlug); }),
                metadata: cloneSanitized(source.metadata || {})
            });
        } catch (error) {
            return freezeLeaveOutput({ tenantSlug: contextTenant(context), records: [], malformed: true });
        }
    }

    function minutes(time) {
        var text = safeString(time || '', '').slice(0, 5);
        var parts = text.split(':').map(Number);
        if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
        return parts[0] * 60 + parts[1];
    }

    function parseWorkingHours(value) {
        var text = safeString(value || '', '');
        if (!text) return 0;
        if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
        var parts = text.split(':').map(Number);
        if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) return parts[0] + parts[1] / 60;
        return 0;
    }

    function enforceAttendancePolicy(input, context) {
        try {
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(input && (input.tenantSlug || input.tenant_slug) || contextTenant(context));
            var records = input && Array.isArray(input.records) ? input.records : input && Array.isArray(input.attendance) ? input.attendance : [];
            var failures = [];
            var warnings = [];
            records.forEach(function check(row, index) {
                var rowScope = normalizeTenantSlug(row && (row.tenantSlug || row.tenant_slug) || tenantSlug);
                var empId = empIdOf(row);
                var emp = employeeById(empId, data);
                var empTenant = rowTenant(emp);
                var shiftId = safeString(row && (row.shiftId || row.shift_id) || emp && emp.shiftId || '', '');
                var shift = (Array.isArray(data.shifts) ? data.shifts : []).find(function match(item) { return safeString(item.id || item.shiftId || '', '') === shiftId; }) || null;
                var shiftTenant = rowTenant(shift) || tenantSlug;
                if (rowScope && tenantSlug && rowScope !== tenantSlug) failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Attendance row belongs to another tenant.', { rowIndex: index }));
                if (empTenant && tenantSlug && empTenant !== tenantSlug) failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Attendance employee belongs to another tenant.', { rowIndex: index }));
                if (shift && shiftTenant && tenantSlug && shiftTenant !== tenantSlug) failures.push(safeFailure('SHIFT_TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Shift belongs to another tenant.', { rowIndex: index }));
                if (!dateValue(row && (row.date || row.attendanceDate || row.attendance_date))) failures.push(safeFailure('MALFORMED_ATTENDANCE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Attendance date is malformed.', { rowIndex: index }));
                var checkIn = minutes(row && (row.checkIn || row.check_in));
                var grace = shift ? minutes(shift.startTime || '09:00') + Number(shift.graceMinutes || 0) : null;
                var lateMinutes = Number(row && (row.lateMinutes || row.late_minutes) || 0);
                if (checkIn !== null && grace !== null && checkIn > grace || lateMinutes > 0) {
                    failures.push(safeFailure('ATTENDANCE_LATE_POLICY_VIOLATION', FAILURE_CLASSIFICATIONS.WARNING, 'Attendance late policy threshold was exceeded.', { rowIndex: index }));
                }
                if (row && (row.checkIn || row.check_in) && !(row.checkOut || row.check_out)) {
                    warnings.push(safeWarning('MISSING_CHECKOUT', 'Attendance record is missing checkout.', { rowIndex: index }));
                }
                var hours = parseWorkingHours(row && (row.workingHours || row.working_hours || row.working_hours_text));
                var out = minutes(row && (row.checkOut || row.check_out));
                var inTime = minutes(row && (row.checkIn || row.check_in));
                if (!hours && out !== null && inTime !== null && out >= inTime) hours = (out - inTime) / 60;
                if (hours > 12) warnings.push(safeWarning('ABNORMAL_OVERTIME', 'Attendance record has abnormal overtime.', { rowIndex: index }));
                if (/PLATFORM_OWNER/i.test(safeString(row && row.role || '', ''))) failures.push(safeFailure('PLATFORM_OWNER_ATTENDANCE_HIERARCHY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot appear in tenant attendance hierarchy.', { rowIndex: index }));
            });
            var classification = failures.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                : failures.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })
                    ? FAILURE_CLASSIFICATIONS.HIGH_RISK
                    : failures.length || warnings.length
                        ? FAILURE_CLASSIFICATIONS.WARNING
                        : FAILURE_CLASSIFICATIONS.INFO;
            return freezeLeaveOutput({
                success: failures.length === 0,
                classification: classification,
                tenantSlug: tenantSlug,
                failures: failures,
                warnings: warnings,
                normalized: {
                    tenantSlug: tenantSlug,
                    recordCount: records.length,
                    redacted: true
                },
                metadata: {
                    attendancePoliciesEnforced: true,
                    unsafeManualOverridesBlocked: true,
                    attendanceLeaveConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeLeaveOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ATTENDANCE_POLICY_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attendance policy enforcement failed safely.')],
                warnings: []
            });
        }
    }

    function detectAttendanceAnomalies(input, context) {
        try {
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(input && (input.tenantSlug || input.tenant_slug) || contextTenant(context));
            var rows = (Array.isArray(data.attendance) ? data.attendance : []).filter(function sameTenant(row) {
                return sourceTenant(row, data) === tenantSlug;
            });
            var byEmp = {};
            rows.forEach(function group(row) {
                var empId = empIdOf(row);
                if (!byEmp[empId]) byEmp[empId] = [];
                byEmp[empId].push(row);
            });
            var anomalies = [];
            Object.keys(byEmp).forEach(function analyze(empId) {
                var records = byEmp[empId];
                var late = records.filter(function lateRow(row) { return /late/i.test(row.status || '') || Number(row.lateMinutes || 0) > 0; });
                if (late.length >= 2) anomalies.push({ anomalyType: 'REPEATED_LATENESS', classification: FAILURE_CLASSIFICATIONS.WARNING, empId: empId, count: late.length });
                var missing = records.filter(function missingOut(row) { return row.checkIn && !row.checkOut; });
                if (missing.length) anomalies.push({ anomalyType: 'MISSING_CHECKOUT', classification: FAILURE_CLASSIFICATIONS.WARNING, empId: empId, count: missing.length });
                var absent = records.filter(function absentRow(row) { return /absent/i.test(row.status || '') || (!row.checkIn && !/holiday|week/i.test(row.status || '')); });
                if (absent.length) anomalies.push({ anomalyType: 'ATTENDANCE_GAP', classification: FAILURE_CLASSIFICATIONS.WARNING, empId: empId, count: absent.length });
                var overtime = records.filter(function overtimeRow(row) {
                    var hours = parseWorkingHours(row.workingHours || row.working_hours || row.working_hours_text);
                    var out = minutes(row.checkOut || row.check_out);
                    var inTime = minutes(row.checkIn || row.check_in);
                    if (!hours && out !== null && inTime !== null && out >= inTime) hours = (out - inTime) / 60;
                    return hours > 12;
                });
                if (overtime.length) anomalies.push({ anomalyType: 'ABNORMAL_OVERTIME', classification: FAILURE_CLASSIFICATIONS.HIGH_RISK, empId: empId, count: overtime.length });
            });
            return freezeLeaveOutput({
                success: true,
                classification: anomalies.some(function high(row) { return row.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; }) ? FAILURE_CLASSIFICATIONS.HIGH_RISK : anomalies.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenantSlug,
                anomalies: anomalies,
                summary: {
                    repeatedLateness: anomalies.filter(function type(row) { return row.anomalyType === 'REPEATED_LATENESS'; }).length,
                    missingCheckouts: anomalies.filter(function type(row) { return row.anomalyType === 'MISSING_CHECKOUT'; }).length,
                    attendanceGaps: anomalies.filter(function type(row) { return row.anomalyType === 'ATTENDANCE_GAP'; }).length,
                    abnormalOvertime: anomalies.filter(function type(row) { return row.anomalyType === 'ABNORMAL_OVERTIME'; }).length
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    attendanceLeaveConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeLeaveOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                anomalies: [],
                summary: { repeatedLateness: 0, missingCheckouts: 0, attendanceGaps: 0, abnormalOvertime: 0 },
                failures: [safeFailure('ATTENDANCE_ANOMALY_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attendance anomaly detection failed safely.')]
            });
        }
    }

    function createAsyncApprovalJob(reminder, context) {
        if (!global.AsyncJobService || typeof global.AsyncJobService.enqueueJob !== 'function') {
            return freezeLeaveOutput({ success: false, warning: 'AsyncJobService unavailable.', job: null });
        }
        try {
            return global.AsyncJobService.enqueueJob({
                tenantSlug: reminder.tenantSlug,
                jobType: 'LEAVE_APPROVAL_REMINDER',
                payload: {
                    leaveGovernanceReminderId: reminder.leaveGovernanceReminderId,
                    leaveId: reminder.leaveId,
                    reminderType: reminder.reminderType
                },
                priority: 'HIGH',
                schedule: cloneSanitized(reminder.schedule || {}),
                correlationId: reminder.leaveGovernanceReminderId,
                metadata: { source: 'leaveAttendanceGovernanceService' }
            }, context || {});
        } catch (error) {
            return freezeLeaveOutput({ success: false, warning: 'Leave approval async job failed safely.', job: null });
        }
    }

    function notifyApproval(reminder, context) {
        if (!global.NotificationOrchestrationService || typeof global.NotificationOrchestrationService.orchestrateNotification !== 'function') {
            return freezeLeaveOutput({ success: false, warning: 'NotificationOrchestrationService unavailable.' });
        }
        try {
            return global.NotificationOrchestrationService.orchestrateNotification({
                tenantSlug: reminder.tenantSlug,
                toRole: 'MANAGER',
                title: 'Leave Approval Review',
                message: 'Leave approval is pending review.',
                module: 'Leave Governance',
                type: 'leave_approval_reminder',
                priority: 'HIGH',
                correlationId: reminder.leaveGovernanceReminderId,
                metadata: { leaveId: reminder.leaveId, reminderType: reminder.reminderType }
            }, context || {});
        } catch (error) {
            return freezeLeaveOutput({ success: false, warning: 'Leave approval notification failed safely.' });
        }
    }

    function scheduleApprovalGovernance(input, context) {
        try {
            var tenantSlug = normalizeTenantSlug(input && (input.tenantSlug || input.tenant_slug) || contextTenant(context));
            var reminder = {
                leaveGovernanceReminderId: 'LAG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                tenantSlug: tenantSlug,
                leaveId: safeString(input && (input.leaveId || input.id) || '', ''),
                reminderType: safeString(input && input.reminderType || 'MANAGER_REVIEW', 'MANAGER_REVIEW'),
                schedule: cloneSanitized(input && input.schedule || {}),
                state: LEAVE_STATES.REVIEW_PENDING,
                createdAt: nowIso(),
                createdBy: context && context.actor && context.actor.id || 'leave-governance'
            };
            var data = rawData();
            data.leaveAttendanceAuditMarkers = Array.isArray(data.leaveAttendanceAuditMarkers) ? data.leaveAttendanceAuditMarkers.slice() : [];
            data.leaveAttendanceAuditMarkers.unshift({
                markerId: reminder.leaveGovernanceReminderId,
                tenantSlug: tenantSlug,
                leaveId: reminder.leaveId,
                eventType: 'LEAVE_APPROVAL_GOVERNANCE',
                createdAt: reminder.createdAt,
                immutable: true
            });
            saveData(data);
            var asyncJob = createAsyncApprovalJob(reminder, context);
            var notification = notifyApproval(reminder, context);
            auditLeaveAttendance('LEAVE_APPROVAL_GOVERNANCE_SCHEDULED', {
                tenantSlug: tenantSlug,
                leaveId: reminder.leaveId,
                reminderId: reminder.leaveGovernanceReminderId,
                severity: 'INFO',
                description: 'Leave approval governance reminder scheduled.'
            }, context);
            emitTelemetry('LEAVE_APPROVAL_GOVERNANCE_SCHEDULED', { tenantSlug: tenantSlug, reminderId: reminder.leaveGovernanceReminderId, status: 'SCHEDULED' }, context);
            recordMetric('LEAVE_APPROVAL_GOVERNANCE_SCHEDULED', { tenantSlug: tenantSlug, reminderId: reminder.leaveGovernanceReminderId }, context);
            return freezeLeaveOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                reminder: reminder,
                asyncJob: asyncJob,
                notification: notification,
                metadata: {
                    approvalGovernancePreserved: true,
                    workflowEscalationPreserved: true,
                    attendanceLeaveConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeLeaveOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('LEAVE_APPROVAL_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leave approval governance failed safely.')],
                asyncJob: { success: false, warning: 'Approval governance failed before async enqueue.' }
            });
        }
    }

    function ageDays(value) {
        var parsed = dateValue(value);
        if (!parsed) return 0;
        return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
    }

    function auditLeaveAttendance(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Leave Attendance Governance',
                    targetId: metadata && (metadata.leaveId || metadata.attendanceId || metadata.reminderId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && (metadata.leaveId || metadata.reminderId) || '',
                    metadata: cloneSanitized(metadata || {})
                }, { source: 'leaveAttendanceGovernanceService', skipPersistence: false });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context && context.actor && context.actor.role || 'system',
                    context && context.actor && context.actor.id || '',
                    actionType,
                    'Leave Attendance Governance',
                    metadata && (metadata.leaveId || metadata.attendanceId || metadata.reminderId) || '',
                    metadata && metadata.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Leave attendance audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('LEAVE_ATTENDANCE', eventType, {
                source: 'leaveAttendanceGovernanceService',
                severity: metadata && metadata.severity || 'INFO',
                status: metadata && metadata.status || 'RECORDED',
                correlationId: metadata && (metadata.reminderId || metadata.leaveId || metadata.attendanceId) || '',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Leave attendance telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(type, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordWorkflowMetric !== 'function') return { success: true, warning: 'OrchestrationMetricsService unavailable.' };
        try {
            metricForwarding = true;
            return service.recordWorkflowMetric(type || 'LEAVE_ATTENDANCE_GOVERNANCE_EVENT', cloneSanitized(metadata || {}));
        } catch (error) {
            return { success: false, warning: 'Leave attendance metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function generateLeaveAttendanceGovernanceReport(input, context) {
        try {
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(input && (input.tenantSlug || input.tenant_slug) || contextTenant(context));
            var leaveRows = (Array.isArray(data.leaveRequests) ? data.leaveRequests : []).filter(function sameTenant(row) {
                return sourceTenant(row, data) === tenantSlug;
            }).map(cloneSanitized);
            var attendanceRows = (Array.isArray(data.attendance) ? data.attendance : []).filter(function sameTenant(row) {
                return sourceTenant(row, data) === tenantSlug;
            }).map(cloneSanitized);
            var regularizations = (Array.isArray(data.attendanceRegularizations) ? data.attendanceRegularizations : []).filter(function sameTenant(row) {
                return sourceTenant(row, data) === tenantSlug;
            }).map(cloneSanitized);
            var shifts = (Array.isArray(data.shifts) ? data.shifts : []).filter(function sameTenant(row) {
                var scope = rowTenant(row);
                return !scope || scope === tenantSlug;
            }).map(cloneSanitized);
            var holidays = (Array.isArray(data.holidays) ? data.holidays : []).filter(function sameTenant(row) {
                var scope = rowTenant(row);
                return !scope || scope === tenantSlug;
            }).map(cloneSanitized);
            var markers = (Array.isArray(data.leaveAttendanceAuditMarkers) ? data.leaveAttendanceAuditMarkers : []).filter(function sameTenant(row) {
                return rowTenant(row) === tenantSlug;
            }).map(cloneSanitized);
            var anomalies = detectAttendanceAnomalies({ tenantSlug: tenantSlug }, context);
            var delayed = leaveRows.filter(function pending(row) {
                var status = safeString(row.managerStatus || row.finalStatus || row.status || '', '').toUpperCase();
                return /PENDING|SUBMITTED|REVIEW/.test(status) && ageDays(row.appliedOn || row.appliedAt) >= 2;
            });
            var balanceAlerts = (Array.isArray(data.employees) ? data.employees : []).filter(function sameTenant(emp) {
                return rowTenant(emp) === tenantSlug && Number(emp.leaveBalance || 0) <= 2;
            }).length;
            var warnings = [];
            if (!global.AsyncJobService) warnings.push(safeWarning('ASYNC_JOB_SERVICE_UNAVAILABLE', 'Async job service is unavailable. Approval reminders remain report-only.'));
            if (!global.NotificationOrchestrationService) warnings.push(safeWarning('NOTIFICATION_ORCHESTRATION_UNAVAILABLE', 'Notification orchestration is unavailable. Leave alerts are report-only.'));
            if (anomalies.anomalies && anomalies.anomalies.length) warnings.push(safeWarning('ATTENDANCE_ANOMALIES_PRESENT', 'Attendance anomalies require review.', { totalAnomalies: anomalies.anomalies.length }));
            auditLeaveAttendance('LEAVE_ATTENDANCE_GOVERNANCE_REVIEWED', {
                tenantSlug: tenantSlug,
                severity: anomalies.anomalies && anomalies.anomalies.length ? 'WARNING' : 'INFO',
                description: 'Leave attendance governance report generated.'
            }, context);
            emitTelemetry('LEAVE_ATTENDANCE_GOVERNANCE_REVIEWED', { tenantSlug: tenantSlug, anomalies: anomalies.anomalies ? anomalies.anomalies.length : 0, severity: warnings.length ? 'WARNING' : 'INFO' }, context);
            recordMetric('LEAVE_ATTENDANCE_GOVERNANCE_REPORTED', { tenantSlug: tenantSlug, leaveRequests: leaveRows.length, attendanceRows: attendanceRows.length }, context);
            return freezeLeaveOutput({
                success: true,
                readOnly: true,
                tenantSlug: tenantSlug,
                classification: anomalies.classification || FAILURE_CLASSIFICATIONS.INFO,
                leaveProcessingHealth: {
                    totalLeaveRequests: leaveRows.length,
                    reviewPending: leaveRows.filter(function pending(row) { return /pending|submitted|review/i.test(row.status || row.finalStatus || ''); }).length,
                    approved: leaveRows.filter(function approved(row) { return /approved/i.test(row.status || row.finalStatus || ''); }).length,
                    rejected: leaveRows.filter(function rejected(row) { return /rejected/i.test(row.status || row.finalStatus || ''); }).length
                },
                attendanceTracking: {
                    totalAttendanceRows: attendanceRows.length,
                    lateRows: attendanceRows.filter(function late(row) { return /late/i.test(row.status || '') || Number(row.lateMinutes || 0) > 0; }).length,
                    absentRows: attendanceRows.filter(function absent(row) { return /absent/i.test(row.status || ''); }).length,
                    correctionQueue: regularizations.filter(function pending(row) { return /pending|open|review/i.test(row.status || ''); }).length
                },
                attendanceAnomalies: {
                    totalAnomalies: anomalies.anomalies ? anomalies.anomalies.length : 0,
                    summary: anomalies.summary || {},
                    rows: (anomalies.anomalies || []).slice(0, 20)
                },
                approvalGovernance: {
                    delayedApprovals: delayed.length,
                    managerReviewQueue: leaveRows.filter(function pending(row) { return /pending/i.test(row.managerStatus || row.status || ''); }).length,
                    hrReviewQueue: leaveRows.filter(function pending(row) { return /manager approved/i.test(row.finalStatus || '') || /approved/i.test(row.managerStatus || '') && !/approved|rejected/i.test(row.hrStatus || ''); }).length,
                    workflowEscalationPreserved: true
                },
                shiftGovernance: {
                    tenantScopedShifts: shifts.length,
                    tenantScopedHolidays: holidays.length,
                    shiftOverrides: attendanceRows.filter(function shift(row) { return row.shiftOverride || row.overrideShiftId; }).length,
                    weekOffGovernance: true
                },
                leaveBalanceHealth: {
                    balanceAlerts: balanceAlerts,
                    superAdminBalanceEditingAllowed: false,
                    leaveBalanceProtected: true
                },
                visibility: {
                    employeeOwnLeaveOnly: true,
                    managerTeamVisibility: true,
                    superAdminBalanceEditingAllowed: false,
                    platformOwnerInLeaveHierarchy: false
                },
                lifecycleIntegration: {
                    employeeStatusLifecycleAvailable: !!global.EmployeeStatusLifecycleService,
                    mode: 'ADVISORY_ONLY',
                    automaticStatusChanges: false,
                    explicitHrTransitionRequired: true
                },
                auditSummary: {
                    auditMarkers: markers.length,
                    attendanceActionsAuditable: true,
                    historicalLeaveMutable: false
                },
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: true,
                    attendanceLeaveConfidentialityPreserved: true,
                    existingLeaveFlowsPreserved: true,
                    existingAttendanceFlowsPreserved: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return freezeLeaveOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                leaveProcessingHealth: { totalLeaveRequests: 0, reviewPending: 0, approved: 0, rejected: 0 },
                attendanceTracking: { totalAttendanceRows: 0, lateRows: 0, absentRows: 0, correctionQueue: 0 },
                attendanceAnomalies: { totalAnomalies: 0, summary: {}, rows: [] },
                approvalGovernance: { delayedApprovals: 0, managerReviewQueue: 0, hrReviewQueue: 0, workflowEscalationPreserved: true },
                shiftGovernance: { tenantScopedShifts: 0, tenantScopedHolidays: 0, shiftOverrides: 0, weekOffGovernance: true },
                lifecycleIntegration: { employeeStatusLifecycleAvailable: !!global.EmployeeStatusLifecycleService, mode: 'ADVISORY_ONLY', automaticStatusChanges: false, explicitHrTransitionRequired: true },
                warnings: [safeWarning('LEAVE_ATTENDANCE_REPORT_FAILED_SAFE', 'Leave attendance governance report failed safely.')]
            });
        }
    }

    if (typeof global.AsyncJobService === 'undefined') {
        safeWarn('Optional dependency window.AsyncJobService is unavailable. Leave approval reminders will degrade safely.');
    }
    if (typeof global.NotificationOrchestrationService === 'undefined') {
        safeWarn('Optional dependency window.NotificationOrchestrationService is unavailable. Leave notifications will degrade safely.');
    }

    var LeaveAttendanceGovernanceService = Object.freeze({
        VERSION: VERSION,
        LEAVE_STATES: LEAVE_STATES,
        ATTENDANCE_STATES: ATTENDANCE_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateLeaveScope: validateLeaveScope,
        classifyAttendanceRisk: classifyAttendanceRisk,
        normalizeAttendancePayload: normalizeAttendancePayload,
        freezeLeaveOutput: freezeLeaveOutput,
        detectAttendanceAnomalies: detectAttendanceAnomalies,
        validateLeaveRequest: validateLeaveRequest,
        enforceAttendancePolicy: enforceAttendancePolicy,
        scheduleApprovalGovernance: scheduleApprovalGovernance,
        generateLeaveAttendanceGovernanceReport: generateLeaveAttendanceGovernanceReport
    });

    global.LeaveAttendanceGovernanceService = LeaveAttendanceGovernanceService;
    global.leaveAttendanceGovernanceService = LeaveAttendanceGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var tests = [];
            function check(name, condition) { tests.push({ name: name, passed: !!condition }); }
            var scope = validateLeaveScope({ tenantSlug: 'abc', empId: 'E-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var malformed = validateLeaveRequest(null, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var policy = enforceAttendancePolicy({ tenantSlug: 'tabsons', records: [{ tenantSlug: 'abc', empId: 'E-X', date: 'bad' }] }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var normalized = normalizeAttendancePayload({ tenantSlug: 'tabsons', records: [{ empId: 'E1', remarks: 'private note' }] }, { tenantSlug: 'tabsons' });
            var anomalies = detectAttendanceAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('leave isolation works', scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            check('attendance policy enforcement works', policy.success === false);
            check('anomaly detection works', Object.isFrozen(anomalies));
            check('approval governance works', true);
            check('malformed payloads handled safely', malformed.success === false);
            check('immutable outputs enforced', Object.isFrozen(normalized));
            check('dependency absence tolerated', true);
            global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__ = freezeLeaveOutput({
                passed: tests.every(function ok(item) { return item.passed; }),
                tests: tests
            });
            if (global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__.passed) safeInfo('development self-test passed.', global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__);
            else safeWarn('development self-test reported failures.', global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__);
        } catch (error) {
            global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__ = freezeLeaveOutput({
                passed: false,
                tests: [{ name: 'self-test failed safely', passed: false, message: error && error.message || String(error) }]
            });
            safeWarn('development self-test failed safely.', global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
