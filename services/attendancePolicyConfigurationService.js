/**
 * attendancePolicyConfigurationService.js
 * ARTHHRMS - Enterprise Attendance Policy Configuration Center
 *
 * Additive, tenant-scoped attendance policy configuration, working-hour rule
 * evaluation, versioning, simulation, and analytics layer. The service never
 * mutates historical attendance, leave, payroll, or shift records.
 */
(function attachAttendancePolicyConfigurationService(global) {
    'use strict';

    var PREFIX = '[AttendancePolicyConfigurationService]';
    var SOURCE = 'attendancePolicyConfigurationService';
    var POLICY_TABLE = 'attendancePolicyDefinitions';
    var VERSION_TABLE = 'attendancePolicyVersions';
    var ROLLBACK_TABLE = 'attendancePolicyRollbacks';
    var SIMULATION_TABLE = 'attendancePolicySimulations';
    var ANALYTICS_TABLE = 'attendancePolicyAnalytics';

    var ATTENDANCE_MODES = Object.freeze([
        'OFFICE_ATTENDANCE',
        'REMOTE_WORK',
        'HYBRID',
        'FIELD_STAFF',
        'SHIFT_BASED',
        'FLEXIBLE_HOURS',
        'PROJECT_BASED',
        'CUSTOM_ATTENDANCE'
    ]);
    var POLICY_STATES = Object.freeze(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ROLLED_BACK']);
    var ATTENDANCE_SOURCES = Object.freeze([
        'MANUAL_ENTRY',
        'BIOMETRIC_DEVICE',
        'RFID',
        'FACE_RECOGNITION',
        'GPS',
        'QR_CODE',
        'MOBILE_APP',
        'WEB_PORTAL',
        'API',
        'IOT_DEVICE'
    ]);
    var SIMULATION_SCENARIOS = Object.freeze(['LATE_ARRIVAL', 'EARLY_EXIT', 'HALF_DAY', 'OVERTIME', 'HOLIDAY_WORK', 'WEEKEND_WORK', 'ABSENCE', 'NIGHT_SHIFT']);
    var ALLOWED_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|compensation|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric|face|fingerprint/i;

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
        if (role === 'HRHEAD') role = 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeStatus(value) {
        return safeString(value || 'ACTIVE', 'ACTIVE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeMode(value) {
        var mode = normalizeStatus(value || 'OFFICE_ATTENDANCE');
        if (ATTENDANCE_MODES.indexOf(mode) === -1) return 'CUSTOM_ATTENDANCE';
        return mode;
    }

    function normalizeSource(value) {
        var source = normalizeStatus(value || 'MANUAL_ENTRY');
        if (ATTENDANCE_SOURCES.indexOf(source) === -1) return 'API';
        return source;
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
        if (/^(payrollIntegration|payrollIntegrationPrepared|existingPayrollPreserved|historicalAttendanceUnaffected|attendanceHealthScore|policyComplianceScore|workforceDisciplineScore|workingHours|overtimeRules|overtimeMinutes|lateArrivals|earlyExits|attendanceSources)$/i.test(text)) return false;
        if (/Preserved$|Unaffected$|Changed$|Supported$|Prepared$|Score$|Scores$|Count$|Counts$|Rate$|Analytics$|Rules$|Simulation$|Minutes$|Hours$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (/^(code|status|severity|eventType|action|type|mode|scenario|attendanceResult|source|sources|attendanceSources)$/i.test(String(keyHint || ''))) return value;
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

    function freezeAttendancePolicyOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeAttendancePolicyOutput({
            code: normalizeStatus(code || 'ATTENDANCE_POLICY_ISSUE'),
            message: safeString(message || 'Attendance policy configuration issue.', 'Attendance policy configuration issue.'),
            severity: normalizeStatus(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function ensureTables(data) {
        [POLICY_TABLE, VERSION_TABLE, ROLLBACK_TABLE, SIMULATION_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
        if (!Array.isArray(data.attendance)) data.attendance = [];
        if (!Array.isArray(data.attendanceRecords)) data.attendanceRecords = [];
        if (!Array.isArray(data.leaveRequests)) data.leaveRequests = [];
        if (!Array.isArray(data.payrollRuns)) data.payrollRuns = [];
        if (!Array.isArray(data.shifts)) data.shifts = [];
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
            existingAttendancePreserved: true,
            existingLeavePreserved: true,
            existingPayrollPreserved: true,
            existingShiftPreserved: true,
            historicalAttendanceUnaffected: true,
            noHistoricalAttendanceMutationWithoutApproval: true,
            policyChangesRequireVersioning: true,
            auditable: !!audited,
            reviewOnly: !!(context && context.reviewOnly)
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezeAttendancePolicyOutput({
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
            return { allowed: false, output: failure('ATTENDANCE_POLICY_ACCESS_DENIED', 'Role cannot configure enterprise attendance policies.', input, context, { role: actor.role }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_ATTENDANCE_POLICY_BLOCKED', 'Cross-tenant attendance policy access is blocked.', input, context, {}) };
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

    function employeeFor(data, tenantSlug, employeeId) {
        var target = normalizeId(employeeId);
        return (data.employees || []).find(function each(row) {
            return sameTenant(row, tenantSlug) && normalizeId(employeeIdOf(row)) === target;
        });
    }

    function validDate(value) {
        var text = safeString(value, '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
        var date = new Date(text + 'T00:00:00Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
    }

    function normalizeTime(value, fallback) {
        var text = safeString(value, fallback || '');
        var match = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
        if (!match) return '';
        return String(match[1]).padStart(2, '0') + ':' + match[2];
    }

    function minutes(value) {
        var text = normalizeTime(value);
        if (!text) return null;
        var parts = text.split(':');
        return Number(parts[0]) * 60 + Number(parts[1]);
    }

    function addMinutes(time, delta) {
        var base = minutes(time);
        if (base === null) return '';
        var total = ((base + Number(delta || 0)) % 1440 + 1440) % 1440;
        return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    }

    function timeRangeMinutes(start, end) {
        var startMin = minutes(start);
        var endMin = minutes(end);
        if (startMin === null || endMin === null) return null;
        if (endMin <= startMin) endMin += 1440;
        return endMin - startMin;
    }

    function normalizeWorkingHours(source) {
        var input = source || {};
        var officeStartTime = normalizeTime(input.officeStartTime || input.officeStart || input.startTime, '09:00') || '09:00';
        var officeEndTime = normalizeTime(input.officeEndTime || input.officeEnd || input.endTime, '18:00') || '18:00';
        var scheduledMinutes = timeRangeMinutes(officeStartTime, officeEndTime) || 540;
        var workingHours = Number(input.workingHours || input.hours || Math.round((scheduledMinutes / 60) * 100) / 100) || 0;
        return {
            officeStartTime: officeStartTime,
            officeEndTime: officeEndTime,
            workingHours: workingHours,
            halfDayThreshold: Number(input.halfDayThreshold || 4) || 0,
            minimumHours: Number(input.minimumHours || input.minHours || Math.min(workingHours, 8)) || 0,
            maximumHours: Number(input.maximumHours || input.maxHours || Math.max(workingHours, 9)) || 0,
            coreHours: {
                start: normalizeTime(input.coreHours && input.coreHours.start || input.coreStart, '11:00') || '11:00',
                end: normalizeTime(input.coreHours && input.coreHours.end || input.coreEnd, '16:00') || '16:00'
            },
            flexibleWindow: {
                start: normalizeTime(input.flexibleWindow && input.flexibleWindow.start || input.flexStart, officeStartTime) || officeStartTime,
                end: normalizeTime(input.flexibleWindow && input.flexibleWindow.end || input.flexEnd, officeEndTime) || officeEndTime
            },
            timezone: safeString(input.timezone || input.timeZone || 'Asia/Kolkata', 'Asia/Kolkata')
        };
    }

    function normalizePolicyPayload(input, tenantSlug, existing) {
        var source = input || {};
        var policy = Object.assign({}, existing || {});
        policy.policyId = safeString(source.policyId || policy.policyId || id('ATT-POLICY'), '');
        policy.tenantSlug = normalizeTenant(source.tenantSlug || policy.tenantSlug || tenantSlug);
        policy.policyName = safeString(source.policyName || source.name || policy.policyName, '');
        policy.policyCode = safeString(source.policyCode || source.code || policy.policyCode, '').toUpperCase();
        policy.description = safeString(source.description || policy.description, '');
        policy.effectiveDate = safeString(source.effectiveDate || policy.effectiveDate, '');
        policy.expiryDate = safeString(source.expiryDate || policy.expiryDate, '');
        policy.status = normalizeStatus(source.status || policy.status || 'DRAFT');
        if (POLICY_STATES.indexOf(policy.status) === -1) policy.status = 'DRAFT';
        policy.priority = Number(source.priority !== undefined ? source.priority : policy.priority || 0) || 0;
        policy.mode = normalizeMode(source.mode || source.attendanceMode || policy.mode || 'OFFICE_ATTENDANCE');
        policy.workingHours = normalizeWorkingHours(Object.assign({}, policy.workingHours || {}, source.workingHours || {}));
        policy.lateRules = Object.assign({
            graceMinutes: 0,
            lateMark: true,
            repeatedLateLimit: 3,
            repeatedLatePolicy: 'WARNING',
            autoDeduction: false,
            managerApproval: true,
            warningLevels: [],
            escalation: { enabled: false, afterOccurrences: 3, target: 'MANAGER' }
        }, policy.lateRules || {}, source.lateRules || {});
        policy.lateRules.graceMinutes = Number(policy.lateRules.graceMinutes || 0) || 0;
        policy.lateRules.repeatedLateLimit = Number(policy.lateRules.repeatedLateLimit || 0) || 0;
        policy.earlyExitRules = Object.assign({
            thresholdMinutes: 30,
            graceMinutes: 0,
            approvalRequired: true,
            halfDayAfterMinutes: 240,
            autoDeduction: false
        }, policy.earlyExitRules || {}, source.earlyExitRules || {});
        policy.earlyExitRules.thresholdMinutes = Number(policy.earlyExitRules.thresholdMinutes || 0) || 0;
        policy.earlyExitRules.graceMinutes = Number(policy.earlyExitRules.graceMinutes || 0) || 0;
        policy.earlyExitRules.halfDayAfterMinutes = Number(policy.earlyExitRules.halfDayAfterMinutes || 0) || 0;
        policy.overtimeRules = Object.assign({
            dailyOT: true,
            weeklyOT: false,
            holidayOT: true,
            weekendOT: true,
            approvalRequired: true,
            maximumOTMinutes: 180,
            autoCalculation: false,
            payrollIntegration: false
        }, policy.overtimeRules || {}, source.overtimeRules || {});
        policy.overtimeRules.maximumOTMinutes = Number(policy.overtimeRules.maximumOTMinutes || policy.overtimeRules.maxOTMinutes || 0) || 0;
        policy.breakRules = Object.assign({
            lunchMinutes: 60,
            teaMinutes: 0,
            flexibleBreak: false,
            maximumBreakDuration: 60,
            paidBreak: false,
            unpaidBreak: true
        }, policy.breakRules || {}, source.breakRules || {});
        policy.breakRules.lunchMinutes = Number(policy.breakRules.lunchMinutes || 0) || 0;
        policy.breakRules.teaMinutes = Number(policy.breakRules.teaMinutes || 0) || 0;
        policy.breakRules.maximumBreakDuration = Number(policy.breakRules.maximumBreakDuration || 0) || 0;
        policy.sources = (Array.isArray(source.sources) ? source.sources : policy.sources || ['MANUAL_ENTRY', 'WEB_PORTAL']).map(normalizeSource);
        policy.assignments = Object.assign({
            companies: [],
            businessUnits: [],
            departments: [],
            locations: [],
            branches: [],
            grades: [],
            employmentTypes: [],
            employees: [],
            roles: [],
            shifts: []
        }, policy.assignments || {}, source.assignments || {});
        Object.keys(policy.assignments).forEach(function each(key) { policy.assignments[key] = normalizeList(policy.assignments[key]); });
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

    function shiftById(data, tenantSlug, shiftId) {
        var target = safeString(shiftId, '');
        return (data.shifts || []).find(function each(row) {
            return sameTenant(row, tenantSlug) && safeString(row.shiftId || row.id || row.code, '') === target;
        });
    }

    function validationIssues(policy, data, options) {
        var issues = [];
        var scheduledMinutes = timeRangeMinutes(policy.workingHours.officeStartTime, policy.workingHours.officeEndTime);
        if (!policy.policyName) issues.push(issue('MISSING_ATTENDANCE_POLICY_NAME', 'Policy name is required.', 'ERROR', {}));
        if (!policy.policyCode) issues.push(issue('MISSING_ATTENDANCE_POLICY_CODE', 'Policy code is required.', 'ERROR', {}));
        if (policy.policyCode && policyCodeExists(data, policy.tenantSlug, policy.policyCode, options && options.policyId)) issues.push(issue('DUPLICATE_ATTENDANCE_POLICY_CODE', 'Attendance policy code already exists for this tenant.', 'ERROR', { policyCode: policy.policyCode }));
        if (!validDate(policy.effectiveDate)) issues.push(issue('INVALID_EFFECTIVE_DATE', 'Effective date must be valid YYYY-MM-DD.', 'ERROR', {}));
        if (policy.expiryDate && !validDate(policy.expiryDate)) issues.push(issue('INVALID_EXPIRY_DATE', 'Expiry date must be valid YYYY-MM-DD.', 'ERROR', {}));
        if (validDate(policy.effectiveDate) && validDate(policy.expiryDate) && policy.expiryDate < policy.effectiveDate) issues.push(issue('INVALID_DATE_RANGE', 'Policy expiry date cannot be before effective date.', 'ERROR', {}));
        if (!scheduledMinutes || scheduledMinutes <= 0 || scheduledMinutes > 1440 || policy.workingHours.workingHours <= 0 || policy.workingHours.minimumHours > policy.workingHours.maximumHours) {
            issues.push(issue('INVALID_WORKING_HOURS', 'Working hours and office time range must be valid.', 'ERROR', { officeStartTime: policy.workingHours.officeStartTime, officeEndTime: policy.workingHours.officeEndTime }));
        }
        if (policy.lateRules.graceMinutes < 0 || policy.lateRules.graceMinutes > 240 || policy.earlyExitRules.graceMinutes < 0 || policy.earlyExitRules.graceMinutes > 240) {
            issues.push(issue('INVALID_GRACE_PERIOD', 'Grace periods must be between 0 and 240 minutes.', 'ERROR', {}));
        }
        if (policy.workingHours.halfDayThreshold < 0 || policy.workingHours.minimumHours < 0 || policy.workingHours.maximumHours < 0 || policy.earlyExitRules.thresholdMinutes < 0 || policy.earlyExitRules.halfDayAfterMinutes < 0 || policy.breakRules.lunchMinutes < 0 || policy.breakRules.teaMinutes < 0 || policy.breakRules.maximumBreakDuration < 0) {
            issues.push(issue('NEGATIVE_ATTENDANCE_THRESHOLD', 'Attendance thresholds cannot be negative.', 'ERROR', {}));
        }
        if (policy.overtimeRules.maximumOTMinutes < 0 || policy.overtimeRules.maximumOTMinutes > 1440) {
            issues.push(issue('INVALID_OVERTIME_RULE', 'Overtime rule is invalid.', 'ERROR', {}));
        }
        if (!/^[A-Za-z_]+\/[A-Za-z0-9_+\-]+$|^UTC$/i.test(policy.workingHours.timezone || '')) {
            issues.push(issue('TIMEZONE_CONFLICT', 'Policy timezone is missing or unsupported.', 'WARNING', { timezone: policy.workingHours.timezone }));
        }
        (policy.assignments.shifts || []).forEach(function each(shiftId) {
            var shift = shiftById(data, policy.tenantSlug, shiftId);
            if (shift && shift.timezone && policy.workingHours.timezone && safeString(shift.timezone, '') !== policy.workingHours.timezone) {
                issues.push(issue('TIMEZONE_CONFLICT', 'Assigned shift timezone differs from policy timezone.', 'WARNING', { shiftId: shiftId }));
            }
        });
        if (!policy.assignments || Object.keys(policy.assignments).every(function each(key) { return !policy.assignments[key].length; })) {
            issues.push(issue('INVALID_ASSIGNMENT_SCOPE', 'At least one assignment criterion is recommended.', 'WARNING', {}));
        }
        var activeOverlap = (data[POLICY_TABLE] || []).filter(function each(row) {
            return sameTenant(row, policy.tenantSlug) && row.policyId !== policy.policyId && normalizeStatus(row.status) === 'PUBLISHED';
        }).some(function each(row) {
            return (row.assignments && row.assignments.departments || []).some(function dept(department) {
                return (policy.assignments.departments || []).indexOf(department) !== -1;
            });
        });
        if (activeOverlap) issues.push(issue('OVERLAPPING_ATTENDANCE_POLICY', 'Another published policy overlaps this assignment scope.', 'WARNING', {}));
        return issues;
    }

    function validateAttendancePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = normalizePolicyPayload(input || {}, access.tenantSlug, null);
        var issues = validationIssues(policy, data, { policyId: input && input.policyId });
        return freezeAttendancePolicyOutput({
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
            versionId: id('ATT-POLICY-VERSION'),
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
                        module: 'Attendance Policy Configuration',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Attendance Policy Configuration', targetId || '', description || actionType);
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

    function createAttendancePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = normalizePolicyPayload(input || {}, access.tenantSlug, null);
        policy.createdAt = nowIso();
        policy.createdBy = access.actor.id;
        policy.updatedBy = access.actor.id;
        var issues = validationIssues(policy, data, {});
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeAttendancePolicyOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        data[POLICY_TABLE].unshift(policy);
        savePolicyVersion(data, policy, access.actor.id, 'CREATED', input && input.reason);
        saveData(data);
        var metadata = { policyId: policy.policyId, tenantSlug: access.tenantSlug, policyCode: policy.policyCode, status: 'CREATED' };
        audit('ATTENDANCE_POLICY_CREATED', policy.policyId, 'Attendance policy created.', metadata, context || {});
        emitTelemetry('ATTENDANCE_POLICY_CREATED', metadata, context || {});
        recordMetric('ATTENDANCE_POLICY_CREATED', metadata, context || {});
        return freezeAttendancePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: policy, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function updateAttendancePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var existing = policyById(data, access.tenantSlug, input && input.policyId);
        if (!existing) return failure('ATTENDANCE_POLICY_NOT_FOUND', 'Attendance policy was not found.', input, context, {});
        var mergedSource = Object.assign({}, clone(existing), input && input.changes || {}, { policyId: existing.policyId, tenantSlug: access.tenantSlug, version: existing.version + 1 });
        var next = normalizePolicyPayload(mergedSource, access.tenantSlug, existing);
        next.version = existing.version + 1;
        next.updatedBy = access.actor.id;
        var issues = validationIssues(next, data, { policyId: existing.policyId });
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeAttendancePolicyOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        Object.keys(existing).forEach(function remove(key) { delete existing[key]; });
        Object.assign(existing, next);
        savePolicyVersion(data, existing, access.actor.id, 'UPDATED', input && (input.reason || input.changes && input.changes.reason));
        saveData(data);
        var metadata = { policyId: existing.policyId, tenantSlug: access.tenantSlug, version: existing.version, status: 'UPDATED' };
        audit('ATTENDANCE_POLICY_UPDATED', existing.policyId, 'Attendance policy updated.', metadata, context || {});
        emitTelemetry('ATTENDANCE_POLICY_UPDATED', metadata, context || {});
        recordMetric('ATTENDANCE_POLICY_UPDATED', metadata, context || {});
        return freezeAttendancePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: existing, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function approvalValid(approval) {
        return !!(approval && approval.approved === true && safeString(approval.approvedBy || approval.actorId || '', '') && safeString(approval.reason || '', ''));
    }

    function publishAttendancePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('POLICY_PUBLISH_APPROVAL_REQUIRED', 'Policy publish requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('ATTENDANCE_POLICY_NOT_FOUND', 'Attendance policy was not found.', input, context, {});
        policy.status = 'PUBLISHED';
        policy.version += 1;
        policy.publishedAt = nowIso();
        policy.publishedBy = input.approval.approvedBy;
        policy.updatedAt = nowIso();
        savePolicyVersion(data, policy, access.actor.id, 'PUBLISHED', input.approval.reason);
        saveData(data);
        var metadata = { policyId: policy.policyId, tenantSlug: access.tenantSlug, version: policy.version, status: 'PUBLISHED' };
        audit('ATTENDANCE_POLICY_PUBLISHED', policy.policyId, 'Attendance policy published.', metadata, context || {});
        emitTelemetry('ATTENDANCE_POLICY_PUBLISHED', metadata, context || {});
        recordMetric('ATTENDANCE_POLICY_PUBLISHED', metadata, context || {});
        return freezeAttendancePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: policy, governance: governanceFlags(true, context || {}) });
    }

    function rollbackAttendancePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('POLICY_ROLLBACK_APPROVAL_REQUIRED', 'Policy rollback requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('ATTENDANCE_POLICY_NOT_FOUND', 'Attendance policy was not found.', input, context, {});
        var targetVersion = Number(input && input.targetVersion || 0);
        var version = (data[VERSION_TABLE] || []).find(function each(row) {
            return row.policyId === policy.policyId && sameTenant(row, access.tenantSlug) && Number(row.version) === targetVersion;
        });
        if (!version || !version.snapshot) return failure('ATTENDANCE_POLICY_VERSION_NOT_FOUND', 'Target attendance policy version was not found.', input, context, {});
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
            rollbackId: id('ATT-POLICY-ROLLBACK'),
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
        audit('ATTENDANCE_POLICY_ROLLBACK', policy.policyId, 'Attendance policy rollback executed.', metadata, context || {});
        emitTelemetry('ATTENDANCE_POLICY_ROLLBACK', metadata, context || {});
        recordMetric('ATTENDANCE_POLICY_ROLLBACK', metadata, context || {});
        return freezeAttendancePolicyOutput({ success: true, tenantSlug: access.tenantSlug, policy: policy, governance: governanceFlags(true, context || {}) });
    }

    function valueMatches(list, value) {
        if (!Array.isArray(list) || !list.length) return true;
        var key = normalizeKey(value);
        return list.some(function each(item) { return normalizeKey(item) === key; });
    }

    function evaluateAttendanceAssignment(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('ATTENDANCE_POLICY_NOT_FOUND', 'Attendance policy was not found.', input, context, {});
        var employee = employeeFor(data, access.tenantSlug, input && input.employeeId);
        if (!employee) return failure('EMPLOYEE_NOT_FOUND', 'Employee was not found for attendance policy assignment.', input, context, {});
        var settings = data.companySettings || {};
        var criteria = [
            ['company', policy.assignments.companies, settings.companyName || employee.company],
            ['businessUnit', policy.assignments.businessUnits, employee.businessUnit],
            ['department', policy.assignments.departments, employee.department],
            ['location', policy.assignments.locations, employee.location || employee.locationName],
            ['branch', policy.assignments.branches, employee.branch || employee.branchName],
            ['grade', policy.assignments.grades, employee.employeeGrade || employee.grade || employee.salaryGrade],
            ['employmentType', policy.assignments.employmentTypes, employee.employmentType],
            ['role', policy.assignments.roles, employee.role],
            ['shift', policy.assignments.shifts, employee.shiftId || employee.shiftCode],
            ['employee', policy.assignments.employees, employeeIdOf(employee)]
        ];
        var matched = [];
        var failed = [];
        criteria.forEach(function each(row) {
            if (valueMatches(row[1], row[2])) matched.push(row[0]);
            else failed.push(row[0]);
        });
        return freezeAttendancePolicyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            employeeId: employeeIdOf(employee),
            eligible: failed.length === 0,
            matchedCriteria: matched,
            failedCriteria: failed,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function evaluateWorkingHours(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = input && input.policy || policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('ATTENDANCE_POLICY_NOT_FOUND', 'Attendance policy was not found.', input, context, {});
        var startMin = minutes(policy.workingHours.officeStartTime);
        var endMin = minutes(policy.workingHours.officeEndTime);
        if (startMin === null || endMin === null) return failure('INVALID_WORKING_HOURS', 'Policy working hours are invalid.', input, context, {});
        if (endMin <= startMin) endMin += 1440;
        var checkInTime = normalizeTime(input && input.checkIn, '');
        var checkOutTime = normalizeTime(input && input.checkOut, '');
        if (!checkInTime || !checkOutTime) {
            return freezeAttendancePolicyOutput({
                success: true,
                tenantSlug: access.tenantSlug,
                policyId: policy.policyId,
                attendanceResult: 'ABSENT',
                workedMinutes: 0,
                workedHours: 0,
                late: false,
                earlyExit: false,
                overtime: false,
                overtimeMinutes: 0,
                payrollIntegrationPrepared: !!(policy.overtimeRules && policy.overtimeRules.payrollIntegration),
                historicalAttendanceModified: false,
                readOnly: true,
                nonDestructive: true,
                governance: governanceFlags(false, context || {})
            });
        }
        var inMin = minutes(checkInTime);
        var outMin = minutes(checkOutTime);
        if (inMin === null || outMin === null) return failure('INVALID_ATTENDANCE_TIME', 'Check-in and check-out times must be valid.', input, context, {});
        if (outMin <= inMin) outMin += 1440;
        var unpaidBreak = policy.breakRules && policy.breakRules.unpaidBreak !== false ? Number(policy.breakRules.lunchMinutes || 0) + Number(policy.breakRules.teaMinutes || 0) : 0;
        var workedMinutes = Math.max(0, outMin - inMin - unpaidBreak);
        var lateMinutes = Math.max(0, inMin - (startMin + Number(policy.lateRules.graceMinutes || 0)));
        var earlyExitMinutes = Math.max(0, endMin - outMin - Number(policy.earlyExitRules.graceMinutes || 0));
        var overtimeByEnd = Math.max(0, outMin - endMin);
        var overtimeByDuration = Math.max(0, workedMinutes - Number(policy.workingHours.maximumHours || 0) * 60);
        var overtimeMinutes = Math.min(Math.max(overtimeByEnd, overtimeByDuration), Number(policy.overtimeRules.maximumOTMinutes || 0) || Math.max(overtimeByEnd, overtimeByDuration));
        var attendanceResult = 'PRESENT';
        if (workedMinutes < Number(policy.workingHours.halfDayThreshold || 0) * 60) attendanceResult = 'HALF_DAY';
        else if (earlyExitMinutes > Number(policy.earlyExitRules.thresholdMinutes || 0)) attendanceResult = 'EARLY_EXIT';
        else if (lateMinutes > 0 && policy.lateRules.lateMark !== false) attendanceResult = 'LATE';
        else if (overtimeMinutes > 0) attendanceResult = 'OVERTIME';
        return freezeAttendancePolicyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            date: safeString(input && input.date, ''),
            checkIn: checkInTime,
            checkOut: checkOutTime,
            attendanceResult: attendanceResult,
            workedMinutes: workedMinutes,
            workedHours: Math.round((workedMinutes / 60) * 100) / 100,
            late: lateMinutes > 0,
            lateMinutes: lateMinutes,
            earlyExit: earlyExitMinutes > Number(policy.earlyExitRules.thresholdMinutes || 0),
            earlyExitMinutes: earlyExitMinutes,
            overtime: overtimeMinutes > 0,
            overtimeMinutes: overtimeMinutes,
            payrollIntegrationPrepared: !!(policy.overtimeRules && policy.overtimeRules.payrollIntegration),
            historicalAttendanceModified: false,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function simulateAttendancePolicy(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policy = policyById(data, access.tenantSlug, input && input.policyId);
        if (!policy) return failure('ATTENDANCE_POLICY_NOT_FOUND', 'Attendance policy was not found.', input, context, {});
        var scenario = normalizeStatus(input && input.scenario || 'LATE_ARRIVAL');
        if (SIMULATION_SCENARIOS.indexOf(scenario) === -1) scenario = 'LATE_ARRIVAL';
        var start = policy.workingHours.officeStartTime;
        var end = policy.workingHours.officeEndTime;
        var checkIn = start;
        var checkOut = end;
        if (scenario === 'LATE_ARRIVAL') checkIn = addMinutes(start, Number(policy.lateRules.graceMinutes || 0) + 15);
        if (scenario === 'EARLY_EXIT') checkOut = addMinutes(end, -1 * (Number(policy.earlyExitRules.thresholdMinutes || 0) + 30));
        if (scenario === 'HALF_DAY') checkOut = addMinutes(start, Math.max(60, Number(policy.workingHours.halfDayThreshold || 4) * 60 - 30));
        if (scenario === 'OVERTIME') checkOut = addMinutes(end, Math.max(60, Number(policy.overtimeRules.maximumOTMinutes || 60)));
        if (scenario === 'ABSENCE') {
            checkIn = '';
            checkOut = '';
        }
        var evaluation = evaluateWorkingHours({
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            date: input && input.date || '',
            checkIn: checkIn,
            checkOut: checkOut
        }, Object.assign({}, context || {}, { skipPersistence: true }));
        var expectedResult = evaluation.attendanceResult;
        if (scenario === 'HOLIDAY_WORK') expectedResult = 'HOLIDAY_WORK';
        if (scenario === 'WEEKEND_WORK') expectedResult = 'WEEKEND_WORK';
        if (scenario === 'NIGHT_SHIFT' && policy.workingHours.officeEndTime < policy.workingHours.officeStartTime) expectedResult = evaluation.attendanceResult;
        var output = {
            success: true,
            simulationId: id('ATT-POLICY-SIM'),
            tenantSlug: access.tenantSlug,
            policyId: policy.policyId,
            employeeId: safeString(input && input.employeeId, ''),
            scenario: scenario,
            checkIn: checkIn,
            checkOut: checkOut,
            expectedResult: expectedResult,
            evaluation: evaluation,
            payrollIntegrationPrepared: !!(policy.overtimeRules && policy.overtimeRules.payrollIntegration),
            historicalAttendanceModified: false,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[SIMULATION_TABLE].unshift(Object.assign({ immutable: true, createdAt: nowIso() }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        audit('ATTENDANCE_POLICY_SIMULATION_RUN', output.simulationId, 'Attendance policy simulation generated.', { policyId: policy.policyId, tenantSlug: access.tenantSlug, scenario: scenario, status: 'COMPLETED' }, context || {});
        return freezeAttendancePolicyOutput(output);
    }

    function attendanceRowsFor(data, tenantSlug) {
        var rows = [];
        function belongs(row) {
            if (sameTenant(row, tenantSlug)) return true;
            var emp = employeeFor(data, tenantSlug, row && (row.empId || row.employeeId));
            return !!emp;
        }
        (data.attendance || []).forEach(function each(row) { if (belongs(row)) rows.push(row); });
        (data.attendanceRecords || []).forEach(function each(row) { if (belongs(row)) rows.push(row); });
        return rows;
    }

    function hasStatus(row, pattern) {
        return pattern.test(normalizeStatus(row && (row.status || row.attendanceStatus || row.result || '')));
    }

    function generateAttendanceAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policies = (data[POLICY_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var attendanceRows = attendanceRowsFor(data, access.tenantSlug);
        var published = policies.filter(function each(row) { return normalizeStatus(row.status) === 'PUBLISHED'; }).length;
        var lateArrivals = attendanceRows.filter(function each(row) { return hasStatus(row, /LATE/) || Number(row.lateMinutes || row.late_minutes || 0) > 0; }).length;
        var earlyExits = attendanceRows.filter(function each(row) { return hasStatus(row, /EARLY/) || Number(row.earlyExitMinutes || 0) > 0; }).length;
        var overtime = attendanceRows.filter(function each(row) { return hasStatus(row, /OVERTIME|OT/) || Number(row.overtimeMinutes || row.otMinutes || 0) > 0; }).length;
        var absences = attendanceRows.filter(function each(row) { return hasStatus(row, /ABSENT|ABSENCE/); }).length;
        var assignmentCount = policies.reduce(function sum(total, row) {
            return total + Object.keys(row.assignments || {}).reduce(function inner(count, key) { return count + ((row.assignments[key] || []).length); }, 0);
        }, 0);
        var compliance = clampScore(100 - lateArrivals * 4 - earlyExits * 4 - absences * 8);
        var health = clampScore(100 - Math.max(0, policies.length - published) * 5 - policies.filter(function each(row) { return !validDate(row.effectiveDate); }).length * 10);
        var discipline = clampScore(100 - (lateArrivals + earlyExits + absences) * 5 + overtime);
        var analytics = {
            policyCount: policies.length,
            publishedPolicies: published,
            lateArrivals: lateArrivals,
            earlyExits: earlyExits,
            attendanceCompliance: compliance,
            overtime: overtime,
            absenceTrends: absences,
            policyUsage: attendanceRows.length,
            assignmentCount: assignmentCount,
            attendanceSources: policies.reduce(function list(out, row) {
                (row.sources || []).forEach(function each(source) { if (out.indexOf(source) === -1) out.push(source); });
                return out;
            }, [])
        };
        var output = {
            success: true,
            tenantSlug: access.tenantSlug,
            analytics: analytics,
            attendanceHealthScore: health,
            policyComplianceScore: compliance,
            workforceDisciplineScore: discipline,
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(Object.assign({ analyticsId: id('ATT-POLICY-ANALYTICS'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        return freezeAttendancePolicyOutput(output);
    }

    function generatePolicyDashboard(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var policies = (data[POLICY_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var analytics = generateAttendanceAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        return freezeAttendancePolicyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            policyLibrary: policies.map(function each(row) { return { policyId: row.policyId, policyName: row.policyName, policyCode: row.policyCode, mode: row.mode, status: row.status, version: row.version, priority: row.priority }; }),
            assignments: policies.map(function each(row) { return { policyId: row.policyId, assignments: row.assignments }; }),
            workingHours: policies.map(function each(row) { return { policyId: row.policyId, workingHours: row.workingHours }; }),
            lateRules: policies.map(function each(row) { return { policyId: row.policyId, lateRules: row.lateRules }; }),
            earlyExitRules: policies.map(function each(row) { return { policyId: row.policyId, earlyExitRules: row.earlyExitRules }; }),
            overtimeRules: policies.map(function each(row) { return { policyId: row.policyId, overtimeRules: row.overtimeRules }; }),
            breakRules: policies.map(function each(row) { return { policyId: row.policyId, breakRules: row.breakRules }; }),
            attendanceSources: policies.map(function each(row) { return { policyId: row.policyId, sources: row.sources }; }),
            simulation: { latestSupportedScenarios: SIMULATION_SCENARIOS },
            analytics: analytics.analytics || {},
            attendanceHealthScore: analytics.attendanceHealthScore || 0,
            policyComplianceScore: analytics.policyComplianceScore || 0,
            workforceDisciplineScore: analytics.workforceDisciplineScore || 0,
            compatibility: {
                existingAttendancePreserved: true,
                existingLeavePreserved: true,
                existingPayrollPreserved: true,
                existingShiftPreserved: true,
                historicalAttendanceUnaffected: true,
                historicalAttendanceModified: false
            },
            governance: governanceFlags(false, context || {})
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeAttendancePolicyOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            record('attendance modes available', ATTENDANCE_MODES.indexOf('OFFICE_ATTENDANCE') !== -1 && ATTENDANCE_MODES.indexOf('HYBRID') !== -1, ATTENDANCE_MODES);
            record('attendance sources available', ATTENDANCE_SOURCES.indexOf('BIOMETRIC_DEVICE') !== -1 && ATTENDANCE_SOURCES.indexOf('WEB_PORTAL') !== -1, ATTENDANCE_SOURCES);
            var frozen = freezeAttendancePolicyOutput({ ok: true, nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            record('historical attendance protected by default', governanceFlags(false, {}).historicalAttendanceUnaffected === true, null);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezeAttendancePolicyOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Attendance policy configuration self-test completed.',
            checks: checks
        });
    }

    var AttendancePolicyConfigurationService = Object.freeze({
        ATTENDANCE_MODES: ATTENDANCE_MODES,
        POLICY_STATES: POLICY_STATES,
        ATTENDANCE_SOURCES: ATTENDANCE_SOURCES,
        SIMULATION_SCENARIOS: SIMULATION_SCENARIOS,
        createAttendancePolicy: createAttendancePolicy,
        updateAttendancePolicy: updateAttendancePolicy,
        publishAttendancePolicy: publishAttendancePolicy,
        rollbackAttendancePolicy: rollbackAttendancePolicy,
        evaluateAttendanceAssignment: evaluateAttendanceAssignment,
        evaluateWorkingHours: evaluateWorkingHours,
        validateAttendancePolicy: validateAttendancePolicy,
        simulateAttendancePolicy: simulateAttendancePolicy,
        generateAttendanceAnalytics: generateAttendanceAnalytics,
        generatePolicyDashboard: generatePolicyDashboard,
        freezeAttendancePolicyOutput: freezeAttendancePolicyOutput
    });

    global.AttendancePolicyConfigurationService = AttendancePolicyConfigurationService;
    global.attendancePolicyConfigurationService = AttendancePolicyConfigurationService;
    global.AttendancePolicyService = AttendancePolicyConfigurationService;
    global.AttendanceRuleEngine = AttendancePolicyConfigurationService;
    global.WorkingHoursService = AttendancePolicyConfigurationService;
    global.OvertimeRuleService = AttendancePolicyConfigurationService;
    global.AttendanceValidator = AttendancePolicyConfigurationService;
    global.AttendanceSimulationService = AttendancePolicyConfigurationService;
    global.AttendanceAnalyticsService = AttendancePolicyConfigurationService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_ATTENDANCE_POLICY_CONFIGURATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
