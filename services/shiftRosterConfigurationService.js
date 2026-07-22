/**
 * shiftRosterConfigurationService.js
 * ARTHHRMS - Enterprise Shift & Roster Configuration Center
 *
 * Additive, tenant-scoped workforce scheduling layer for shift templates,
 * roster generation, rotations, assignments, shift swaps, validation,
 * forecasting, versioning, audit, telemetry, and analytics.
 */
(function attachShiftRosterConfigurationService(global) {
    'use strict';

    var PREFIX = '[ShiftRosterConfigurationService]';
    var SOURCE = 'shiftRosterConfigurationService';
    var TEMPLATE_TABLE = 'shiftRosterTemplates';
    var ROSTER_TABLE = 'shiftRosterPlans';
    var ASSIGNMENT_TABLE = 'shiftRosterAssignments';
    var SWAP_TABLE = 'shiftSwapRequests';
    var VERSION_TABLE = 'shiftRosterVersions';
    var ROLLBACK_TABLE = 'shiftRosterRollbacks';
    var ANALYTICS_TABLE = 'shiftRosterAnalytics';

    var SHIFT_TYPES = Object.freeze(['GENERAL_SHIFT', 'MORNING_SHIFT', 'AFTERNOON_SHIFT', 'EVENING_SHIFT', 'NIGHT_SHIFT', 'SPLIT_SHIFT', 'FLEXIBLE_SHIFT', 'REMOTE_SHIFT', 'ON_CALL_SHIFT', 'CUSTOM_SHIFT']);
    var ROSTER_TYPES = Object.freeze(['DAILY_ROSTER', 'WEEKLY_ROSTER', 'MONTHLY_ROSTER', 'ROTATIONAL_ROSTER', 'FIXED_ROSTER', 'HYBRID_ROSTER', 'DEPARTMENT_ROSTER', 'PROJECT_ROSTER']);
    var ROTATION_TYPES = Object.freeze(['MORNING_EVENING', 'EVENING_NIGHT', 'WEEKLY_ROTATION', 'MONTHLY_ROTATION', 'CUSTOM_ROTATION', 'AUTOMATIC_ROTATION', 'MANUAL_ROTATION']);
    var ROSTER_STATES = Object.freeze(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ROLLED_BACK']);
    var SWAP_STATES = Object.freeze(['REQUESTED', 'ELIGIBLE', 'APPROVED', 'REJECTED', 'CANCELLED']);
    var ALLOWED_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER', 'MANAGER']);
    var CONFIG_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|payroll|compensation|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric|face|fingerprint/i;

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

    function normalizeShiftType(value) {
        var type = normalizeStatus(value || 'GENERAL_SHIFT');
        if (SHIFT_TYPES.indexOf(type) === -1) return 'CUSTOM_SHIFT';
        return type;
    }

    function normalizeRosterType(value) {
        var type = normalizeStatus(value || 'WEEKLY_ROSTER');
        if (ROSTER_TYPES.indexOf(type) === -1) return 'HYBRID_ROSTER';
        return type;
    }

    function normalizeRotationType(value) {
        var type = normalizeStatus(value || 'WEEKLY_ROTATION');
        if (ROTATION_TYPES.indexOf(type) === -1) return 'CUSTOM_ROTATION';
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
        if (/^(payrollIntegrationPrepared|existingPayrollPreserved|existingAttendancePreserved|existingLeavePreserved|existingApprovalPreserved|existingSchedulesPreserved|employeeSchedulesUnaffected|shiftUtilization|overtimeRisk|coverageScore|rosterHealthScore|schedulingEfficiencyScore|workingHours|maximumHours|minimumRestHours|forecasting|forecast)$/i.test(text)) return false;
        if (/Preserved$|Unaffected$|Changed$|Supported$|Prepared$|Score$|Scores$|Count$|Counts$|Rate$|Analytics$|Rules$|Forecast$|Forecasting$|Minutes$|Hours$|Coverage$|Capacity$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (/^(code|status|severity|eventType|action|type|shiftType|rosterType|rotationType|state|swapState)$/i.test(String(keyHint || ''))) return value;
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

    function freezeRosterOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeRosterOutput({
            code: normalizeStatus(code || 'SHIFT_ROSTER_ISSUE'),
            message: safeString(message || 'Shift and roster configuration issue.', 'Shift and roster configuration issue.'),
            severity: normalizeStatus(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function ensureTables(data) {
        [TEMPLATE_TABLE, ROSTER_TABLE, ASSIGNMENT_TABLE, SWAP_TABLE, VERSION_TABLE, ROLLBACK_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
        if (!Array.isArray(data.shifts)) data.shifts = [];
        if (!Array.isArray(data.attendance)) data.attendance = [];
        if (!Array.isArray(data.attendanceRecords)) data.attendanceRecords = [];
        if (!Array.isArray(data.leaveRequests)) data.leaveRequests = [];
        if (!Array.isArray(data.payrollRuns)) data.payrollRuns = [];
        if (!Array.isArray(data.employeeSchedules)) data.employeeSchedules = [];
        if (!Array.isArray(data.workingCalendarConfigurations)) data.workingCalendarConfigurations = [];
        if (!Array.isArray(data.attendancePolicyDefinitions)) data.attendancePolicyDefinitions = [];
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
            empId: safeString(actor.empId || actor.employeeId || actor.id || context && context.empId || '', ''),
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
            existingApprovalPreserved: true,
            existingSchedulesPreserved: true,
            employeeSchedulesUnaffected: true,
            scheduleMutationRequiresAdminApproval: true,
            auditable: !!audited,
            reviewOnly: !!(context && context.reviewOnly)
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezeRosterOutput({
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

    function checkAccess(input, context, options) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        var roles = options && options.roles || (options && options.configOnly ? CONFIG_ROLES : ALLOWED_ROLES);
        if (roles.indexOf(actor.role) === -1) {
            return { allowed: false, output: failure('SHIFT_ROSTER_ACCESS_DENIED', 'Role cannot manage enterprise shift and roster configuration.', input, context, { role: actor.role }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_SHIFT_ROSTER_BLOCKED', 'Cross-tenant shift and roster access is blocked.', input, context, {}) };
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

    function datesBetween(start, end, maxDays) {
        if (!validDate(start) || !validDate(end) || end < start) return [];
        var out = [];
        var current = new Date(start + 'T00:00:00Z');
        var last = new Date(end + 'T00:00:00Z');
        var limit = Math.max(1, Math.min(Number(maxDays || 62), 366));
        while (current <= last && out.length < limit) {
            out.push(current.toISOString().slice(0, 10));
            current.setUTCDate(current.getUTCDate() + 1);
        }
        return out;
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

    function shiftDurationMinutes(start, end) {
        var startMin = minutes(start);
        var endMin = minutes(end);
        if (startMin === null || endMin === null) return null;
        if (endMin <= startMin) endMin += 1440;
        return endMin - startMin;
    }

    function normalizeTemplatePayload(input, tenantSlug, existing) {
        var source = input || {};
        var template = Object.assign({}, existing || {});
        var hasStart = source.startTime !== undefined || template.startTime !== undefined;
        var hasEnd = source.endTime !== undefined || template.endTime !== undefined;
        var rawStart = hasStart ? source.startTime || template.startTime : '09:00';
        var rawEnd = hasEnd ? source.endTime || template.endTime : '18:00';
        var duration = shiftDurationMinutes(rawStart, rawEnd);
        template.templateId = safeString(source.templateId || source.shiftTemplateId || template.templateId || id('SHIFT-TEMPLATE'), '');
        template.tenantSlug = normalizeTenant(source.tenantSlug || template.tenantSlug || tenantSlug);
        template.shiftName = safeString(source.shiftName || source.name || template.shiftName, '');
        template.shiftCode = safeString(source.shiftCode || source.code || template.shiftCode, '').toUpperCase();
        template.description = safeString(source.description || template.description, '');
        template.shiftType = normalizeShiftType(source.shiftType || source.type || template.shiftType || 'GENERAL_SHIFT');
        template.startTime = normalizeTime(rawStart, hasStart ? '' : '09:00');
        template.endTime = normalizeTime(rawEnd, hasEnd ? '' : '18:00');
        template.breakDurationMinutes = Math.max(0, Number(source.breakDurationMinutes !== undefined ? source.breakDurationMinutes : template.breakDurationMinutes || 60) || 0);
        template.graceMinutes = Math.max(0, Number(source.graceMinutes !== undefined ? source.graceMinutes : template.graceMinutes || 0) || 0);
        template.coreHours = Object.assign({ start: '11:00', end: '16:00' }, template.coreHours || {}, source.coreHours || {});
        template.coreHours.start = normalizeTime(template.coreHours.start, '11:00') || '11:00';
        template.coreHours.end = normalizeTime(template.coreHours.end, '16:00') || '16:00';
        template.workingHours = Number(source.workingHours !== undefined ? source.workingHours : template.workingHours || Math.max(1, Math.round(((duration || 540) - template.breakDurationMinutes) / 60 * 100) / 100)) || 0;
        template.timezone = safeString(source.timezone || template.timezone || 'Asia/Kolkata', 'Asia/Kolkata');
        template.status = normalizeStatus(source.status || template.status || 'DRAFT');
        if (ROSTER_STATES.indexOf(template.status) === -1) template.status = 'DRAFT';
        template.version = Number(source.version || template.version || 1) || 1;
        template.updatedAt = nowIso();
        return template;
    }

    function normalizeAssignmentScope(source) {
        var input = source || {};
        var scope = Object.assign({
            companies: [],
            businessUnits: [],
            departments: [],
            locations: [],
            branches: [],
            projects: [],
            teams: [],
            employees: []
        }, input);
        Object.keys(scope).forEach(function each(key) { scope[key] = normalizeList(scope[key]); });
        return scope;
    }

    function normalizeRosterPayload(input, tenantSlug, existing) {
        var source = input || {};
        var roster = Object.assign({}, existing || {});
        roster.rosterId = safeString(source.rosterId || roster.rosterId || id('ROSTER'), '');
        roster.tenantSlug = normalizeTenant(source.tenantSlug || roster.tenantSlug || tenantSlug);
        roster.rosterName = safeString(source.rosterName || source.name || roster.rosterName, '');
        roster.rosterCode = safeString(source.rosterCode || source.code || roster.rosterCode, '').toUpperCase();
        roster.description = safeString(source.description || roster.description, '');
        roster.rosterType = normalizeRosterType(source.rosterType || source.type || roster.rosterType || 'WEEKLY_ROSTER');
        roster.startDate = safeString(source.startDate || roster.startDate, '');
        roster.endDate = safeString(source.endDate || roster.endDate, '');
        roster.effectiveDate = safeString(source.effectiveDate || roster.effectiveDate || roster.startDate, '');
        roster.status = normalizeStatus(source.status || roster.status || 'DRAFT');
        if (ROSTER_STATES.indexOf(roster.status) === -1) roster.status = 'DRAFT';
        roster.assignmentScope = normalizeAssignmentScope(Object.assign({}, roster.assignmentScope || {}, source.assignmentScope || {}));
        roster.rotationRules = Object.assign({
            rotationType: 'WEEKLY_ROTATION',
            automaticRotation: false,
            manualRotation: true,
            sequence: [],
            intervalDays: 7
        }, roster.rotationRules || {}, source.rotationRules || {});
        roster.rotationRules.rotationType = normalizeRotationType(roster.rotationRules.rotationType);
        roster.rotationRules.sequence = normalizeList(roster.rotationRules.sequence);
        roster.rotationRules.intervalDays = Math.max(1, Number(roster.rotationRules.intervalDays || 7) || 7);
        roster.entries = (Array.isArray(source.entries) ? source.entries : roster.entries || []).map(function each(row) {
            return normalizeRosterEntry(row, tenantSlug, roster.rosterId);
        });
        roster.version = Number(source.version || roster.version || 1) || 1;
        roster.updatedAt = nowIso();
        return roster;
    }

    function normalizeRosterEntry(row, tenantSlug, rosterId) {
        var source = row || {};
        return {
            entryId: safeString(source.entryId || source.id || id('ROSTER-ENTRY'), ''),
            rosterId: safeString(source.rosterId || rosterId || '', ''),
            tenantSlug: normalizeTenant(source.tenantSlug || tenantSlug),
            employeeId: safeString(source.employeeId || source.empId || '', ''),
            templateId: safeString(source.templateId || source.shiftTemplateId || source.shiftId || '', ''),
            date: safeString(source.date || source.shiftDate || '', ''),
            assignmentType: normalizeStatus(source.assignmentType || 'ROSTER'),
            project: safeString(source.project || '', ''),
            team: safeString(source.team || '', ''),
            status: normalizeStatus(source.status || 'DRAFT')
        };
    }

    function templateById(data, tenantSlug, templateId) {
        var target = safeString(templateId, '');
        return (data[TEMPLATE_TABLE] || []).find(function each(row) {
            return sameTenant(row, tenantSlug) && (row.templateId === target || row.shiftCode === target);
        });
    }

    function rosterById(data, tenantSlug, rosterId) {
        var target = safeString(rosterId, '');
        return (data[ROSTER_TABLE] || []).find(function each(row) {
            return sameTenant(row, tenantSlug) && row.rosterId === target;
        });
    }

    function templateCodeExists(data, tenantSlug, code, templateId) {
        var key = safeString(code, '').toUpperCase();
        return (data[TEMPLATE_TABLE] || []).some(function each(row) {
            return sameTenant(row, tenantSlug) && safeString(row.shiftCode, '').toUpperCase() === key && row.templateId !== templateId;
        });
    }

    function rosterCodeExists(data, tenantSlug, code, rosterId) {
        var key = safeString(code, '').toUpperCase();
        return (data[ROSTER_TABLE] || []).some(function each(row) {
            return sameTenant(row, tenantSlug) && safeString(row.rosterCode, '').toUpperCase() === key && row.rosterId !== rosterId;
        });
    }

    function templateIssues(template, data, options) {
        var issues = [];
        var duration = shiftDurationMinutes(template.startTime, template.endTime);
        if (!template.shiftName) issues.push(issue('MISSING_SHIFT_NAME', 'Shift name is required.', 'ERROR', {}));
        if (!template.shiftCode) issues.push(issue('MISSING_SHIFT_CODE', 'Shift code is required.', 'ERROR', {}));
        if (template.shiftCode && templateCodeExists(data, template.tenantSlug, template.shiftCode, options && options.templateId)) issues.push(issue('DUPLICATE_SHIFT_CODE', 'Shift code already exists for this tenant.', 'ERROR', { shiftCode: template.shiftCode }));
        if (!duration || duration <= 0 || duration > 1440) issues.push(issue('INVALID_SHIFT_TIME_RANGE', 'Shift start and end time must define a valid range.', 'ERROR', {}));
        if (template.workingHours <= 0 || template.workingHours * 60 > (duration || 0)) issues.push(issue('INVALID_WORKING_HOURS', 'Working hours must fit inside the shift range.', 'ERROR', {}));
        if (template.breakDurationMinutes < 0 || template.breakDurationMinutes > (duration || 0)) issues.push(issue('INVALID_BREAK_DURATION', 'Break duration must fit inside the shift range.', 'ERROR', {}));
        if (template.graceMinutes < 0 || template.graceMinutes > 240) issues.push(issue('INVALID_GRACE_TIME', 'Grace time must be between 0 and 240 minutes.', 'ERROR', {}));
        if (!/^[A-Za-z_]+\/[A-Za-z0-9_+\-]+$|^UTC$/i.test(template.timezone || '')) issues.push(issue('TIMEZONE_CONFLICT', 'Shift timezone is missing or unsupported.', 'WARNING', { timezone: template.timezone }));
        return issues;
    }

    function entriesOverlap(entryA, entryB, templateA, templateB) {
        if (!entryA || !entryB || !templateA || !templateB) return false;
        if (entryA.employeeId !== entryB.employeeId || entryA.date !== entryB.date) return false;
        var startA = minutes(templateA.startTime);
        var endA = minutes(templateA.endTime);
        var startB = minutes(templateB.startTime);
        var endB = minutes(templateB.endTime);
        if (startA === null || endA === null || startB === null || endB === null) return false;
        if (endA <= startA) endA += 1440;
        if (endB <= startB) endB += 1440;
        return startA < endB && startB < endA;
    }

    function leaveConflict(data, tenantSlug, employeeId, date) {
        return (data.leaveRequests || []).some(function each(row) {
            if (!sameTenant(row, tenantSlug) || normalizeId(row.empId || row.employeeId) !== normalizeId(employeeId)) return false;
            var status = normalizeStatus(row.status || '');
            if (/REJECTED|CANCELLED/.test(status)) return false;
            var from = safeString(row.fromDate || row.startDate || row.date || row.appliedOn, '');
            var to = safeString(row.toDate || row.endDate || from, from);
            return validDate(from) && validDate(to) && date >= from && date <= to;
        });
    }

    function holidayConflict(data, tenantSlug, date) {
        return (data.workingCalendarConfigurations || []).filter(function each(row) {
            return sameTenant(row, tenantSlug) && normalizeStatus(row.status || 'PUBLISHED') === 'PUBLISHED';
        }).some(function each(calendar) {
            return (calendar.holidays || []).some(function holiday(row) { return safeString(row.date || row.holidayDate, '') === date; });
        });
    }

    function rosterIssues(roster, data, options) {
        var issues = [];
        if (!roster.rosterName) issues.push(issue('MISSING_ROSTER_NAME', 'Roster name is required.', 'ERROR', {}));
        if (!roster.rosterCode) issues.push(issue('MISSING_ROSTER_CODE', 'Roster code is required.', 'ERROR', {}));
        if (roster.rosterCode && rosterCodeExists(data, roster.tenantSlug, roster.rosterCode, options && options.rosterId)) issues.push(issue('DUPLICATE_ROSTER_CODE', 'Roster code already exists for this tenant.', 'ERROR', { rosterCode: roster.rosterCode }));
        if (!validDate(roster.startDate) || !validDate(roster.endDate) || roster.endDate < roster.startDate) issues.push(issue('INVALID_ROSTER_DATE_RANGE', 'Roster date range must be valid.', 'ERROR', {}));
        var assignmentKeys = {};
        (roster.entries || []).forEach(function each(entry, index) {
            if (!validDate(entry.date)) issues.push(issue('INVALID_ROSTER_ENTRY_DATE', 'Roster entry date is invalid.', 'ERROR', { index: index }));
            if (!employeeFor(data, roster.tenantSlug, entry.employeeId)) issues.push(issue('EMPLOYEE_NOT_FOUND', 'Roster entry employee was not found.', 'ERROR', { employeeId: entry.employeeId }));
            if (!templateById(data, roster.tenantSlug, entry.templateId)) issues.push(issue('SHIFT_TEMPLATE_NOT_FOUND', 'Roster entry shift template was not found.', 'ERROR', { templateId: entry.templateId }));
            var key = normalizeId(entry.employeeId) + ':' + entry.date;
            if (assignmentKeys[key]) issues.push(issue('DUPLICATE_ASSIGNMENT', 'Employee has duplicate roster assignments on the same date.', 'ERROR', { employeeId: entry.employeeId, date: entry.date }));
            assignmentKeys[key] = true;
            if (leaveConflict(data, roster.tenantSlug, entry.employeeId, entry.date)) issues.push(issue('LEAVE_CONFLICT', 'Roster entry overlaps an active leave request.', 'WARNING', { employeeId: entry.employeeId, date: entry.date }));
            if (holidayConflict(data, roster.tenantSlug, entry.date)) issues.push(issue('HOLIDAY_CONFLICT', 'Roster entry overlaps a configured holiday.', 'WARNING', { date: entry.date }));
        });
        for (var i = 0; i < roster.entries.length; i += 1) {
            for (var j = i + 1; j < roster.entries.length; j += 1) {
                var entryA = roster.entries[i];
                var entryB = roster.entries[j];
                if (entriesOverlap(entryA, entryB, templateById(data, roster.tenantSlug, entryA.templateId), templateById(data, roster.tenantSlug, entryB.templateId))) {
                    issues.push(issue('OVERLAPPING_SHIFTS', 'Roster contains overlapping shifts for an employee.', 'ERROR', { employeeId: entryA.employeeId, date: entryA.date }));
                }
            }
        }
        var employeeDayHours = {};
        (roster.entries || []).forEach(function each(entry) {
            var template = templateById(data, roster.tenantSlug, entry.templateId);
            if (!template) return;
            var key = normalizeId(entry.employeeId) + ':' + entry.date;
            employeeDayHours[key] = (employeeDayHours[key] || 0) + Number(template.workingHours || 0);
        });
        Object.keys(employeeDayHours).forEach(function each(key) {
            if (employeeDayHours[key] > 12) issues.push(issue('MAXIMUM_HOURS_EXCEEDED', 'Roster exceeds maximum recommended daily hours.', 'WARNING', { key: key }));
        });
        return issues;
    }

    function approvalValid(approval) {
        return !!(approval && approval.approved === true && safeString(approval.approvedBy || approval.actorId || '', '') && safeString(approval.reason || '', ''));
    }

    function saveVersion(data, entityType, entity, actorId, action, reason) {
        data[VERSION_TABLE].unshift({
            versionId: id('SHIFT-ROSTER-VERSION'),
            entityType: entityType,
            entityId: entity.templateId || entity.rosterId || entity.assignmentId || '',
            tenantSlug: entity.tenantSlug,
            version: entity.version || 1,
            status: entity.status || '',
            snapshot: clone(entity),
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
                        module: 'Shift Roster Configuration',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Shift Roster Configuration', targetId || '', description || actionType);
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

    function recordGovernance(action, targetId, description, metadata, context) {
        audit(action, targetId, description, metadata, context || {});
        emitTelemetry(action, metadata || {}, context || {});
        recordMetric(action, metadata || {}, context || {});
    }

    function createShiftTemplate(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var template = normalizeTemplatePayload(input || {}, access.tenantSlug, null);
        template.createdAt = nowIso();
        template.createdBy = access.actor.id;
        template.updatedBy = access.actor.id;
        var issues = templateIssues(template, data, {});
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeRosterOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        data[TEMPLATE_TABLE].unshift(template);
        saveVersion(data, 'SHIFT_TEMPLATE', template, access.actor.id, 'CREATED', input && input.reason);
        saveData(data);
        var metadata = { templateId: template.templateId, tenantSlug: access.tenantSlug, shiftCode: template.shiftCode, status: 'CREATED' };
        recordGovernance('SHIFT_TEMPLATE_CREATED', template.templateId, 'Shift template created.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, template: template, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function updateShiftTemplate(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var existing = templateById(data, access.tenantSlug, input && (input.templateId || input.shiftTemplateId));
        if (!existing) return failure('SHIFT_TEMPLATE_NOT_FOUND', 'Shift template was not found.', input, context, {});
        var next = normalizeTemplatePayload(Object.assign({}, clone(existing), input && input.changes || {}, { templateId: existing.templateId, tenantSlug: access.tenantSlug, version: existing.version + 1 }), access.tenantSlug, existing);
        next.version = existing.version + 1;
        next.updatedBy = access.actor.id;
        var issues = templateIssues(next, data, { templateId: existing.templateId });
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeRosterOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        Object.keys(existing).forEach(function remove(key) { delete existing[key]; });
        Object.assign(existing, next);
        saveVersion(data, 'SHIFT_TEMPLATE', existing, access.actor.id, 'UPDATED', input && (input.reason || input.changes && input.changes.reason));
        saveData(data);
        var metadata = { templateId: existing.templateId, tenantSlug: access.tenantSlug, version: existing.version, status: 'UPDATED' };
        recordGovernance('SHIFT_TEMPLATE_UPDATED', existing.templateId, 'Shift template updated.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, template: existing, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function publishShiftTemplate(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('SHIFT_TEMPLATE_PUBLISH_APPROVAL_REQUIRED', 'Shift template publish requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var template = templateById(data, access.tenantSlug, input && (input.templateId || input.shiftTemplateId));
        if (!template) return failure('SHIFT_TEMPLATE_NOT_FOUND', 'Shift template was not found.', input, context, {});
        template.status = 'PUBLISHED';
        template.version += 1;
        template.publishedAt = nowIso();
        template.publishedBy = input.approval.approvedBy;
        template.updatedAt = nowIso();
        saveVersion(data, 'SHIFT_TEMPLATE', template, access.actor.id, 'PUBLISHED', input.approval.reason);
        saveData(data);
        var metadata = { templateId: template.templateId, tenantSlug: access.tenantSlug, version: template.version, status: 'PUBLISHED' };
        recordGovernance('SHIFT_TEMPLATE_PUBLISHED', template.templateId, 'Shift template published.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, template: template, governance: governanceFlags(true, context || {}) });
    }

    function employeesForScope(data, tenantSlug, scope) {
        var settings = data.companySettings || {};
        return (data.employees || []).filter(function each(employee) {
            if (!sameTenant(employee, tenantSlug)) return false;
            function matches(list, value) {
                if (!Array.isArray(list) || !list.length) return true;
                var key = normalizeKey(value);
                return list.some(function item(row) { return normalizeKey(row) === key; });
            }
            return matches(scope.companies, settings.companyName || employee.company) &&
                matches(scope.businessUnits, employee.businessUnit) &&
                matches(scope.departments, employee.department) &&
                matches(scope.locations, employee.location || employee.locationName) &&
                matches(scope.branches, employee.branch || employee.branchName) &&
                matches(scope.projects, employee.project) &&
                matches(scope.teams, employee.team) &&
                matches(scope.employees, employeeIdOf(employee));
        });
    }

    function templateSequence(data, tenantSlug, requested) {
        var ids = normalizeList(requested);
        var templates = ids.map(function each(templateId) { return templateById(data, tenantSlug, templateId); }).filter(Boolean);
        if (templates.length) return templates;
        return (data[TEMPLATE_TABLE] || []).filter(function each(row) { return sameTenant(row, tenantSlug); }).slice(0, 1);
    }

    function generateRoster(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var roster = normalizeRosterPayload(input || {}, access.tenantSlug, null);
        var people = employeesForScope(data, access.tenantSlug, roster.assignmentScope);
        var sequence = templateSequence(data, access.tenantSlug, roster.rotationRules.sequence);
        var dates = datesBetween(roster.startDate, roster.endDate, input && input.maxDays || 35);
        if (!roster.entries.length && people.length && sequence.length && dates.length) {
            roster.entries = [];
            people.forEach(function eachEmployee(employee, employeeIndex) {
                dates.forEach(function eachDate(date, dayIndex) {
                    var template = sequence[(employeeIndex + Math.floor(dayIndex / roster.rotationRules.intervalDays)) % sequence.length];
                    roster.entries.push(normalizeRosterEntry({
                        employeeId: employeeIdOf(employee),
                        templateId: template.templateId,
                        date: date,
                        status: 'DRAFT'
                    }, access.tenantSlug, roster.rosterId));
                });
            });
        }
        roster.createdAt = nowIso();
        roster.createdBy = access.actor.id;
        roster.updatedBy = access.actor.id;
        var issues = rosterIssues(roster, data, {});
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeRosterOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        data[ROSTER_TABLE].unshift(roster);
        saveVersion(data, 'ROSTER', roster, access.actor.id, 'GENERATED', input && input.reason);
        saveData(data);
        var metadata = { rosterId: roster.rosterId, tenantSlug: access.tenantSlug, entries: roster.entries.length, status: 'GENERATED' };
        recordGovernance('ROSTER_GENERATED', roster.rosterId, 'Roster generated.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, roster: roster, warnings: issues, generatedEntries: roster.entries.length, governance: governanceFlags(true, context || {}) });
    }

    function applyRotation(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var roster = rosterById(data, access.tenantSlug, input && input.rosterId);
        if (!roster) return failure('ROSTER_NOT_FOUND', 'Roster was not found.', input, context, {});
        var sequence = templateSequence(data, access.tenantSlug, input && input.sequence || roster.rotationRules.sequence);
        if (!sequence.length) return failure('SHIFT_TEMPLATE_NOT_FOUND', 'At least one shift template is required for rotation.', input, context, {});
        roster.entries = (roster.entries || []).map(function each(entry, index) {
            var next = clone(entry);
            next.templateId = sequence[index % sequence.length].templateId;
            return next;
        });
        roster.rotationRules.rotationType = normalizeRotationType(input && input.rotationType || roster.rotationRules.rotationType);
        roster.rotationRules.sequence = sequence.map(function each(template) { return template.templateId; });
        roster.version += 1;
        roster.updatedAt = nowIso();
        roster.updatedBy = access.actor.id;
        saveVersion(data, 'ROSTER', roster, access.actor.id, 'ROTATED', input && input.reason);
        saveData(data);
        var metadata = { rosterId: roster.rosterId, tenantSlug: access.tenantSlug, rotationType: roster.rotationRules.rotationType, status: 'ROTATED' };
        recordGovernance('ROSTER_ROTATION_APPLIED', roster.rosterId, 'Roster rotation applied.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, roster: roster, rotation: roster.rotationRules, governance: governanceFlags(true, context || {}) });
    }

    function validateRoster(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: false });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var roster = input && input.roster || rosterById(data, access.tenantSlug, input && input.rosterId);
        if (!roster) roster = normalizeRosterPayload(input || {}, access.tenantSlug, null);
        var issues = rosterIssues(roster, data, { rosterId: roster.rosterId });
        return freezeRosterOutput({
            success: issues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length === 0,
            tenantSlug: access.tenantSlug,
            rosterId: roster.rosterId,
            issues: issues,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function assignShift(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('SHIFT_ASSIGNMENT_APPROVAL_REQUIRED', 'Shift assignment requires explicit administrator approval.', input, context, {});
        var data = ensureTables(rawData());
        var template = templateById(data, access.tenantSlug, input && (input.templateId || input.shiftTemplateId));
        if (!template) return failure('SHIFT_TEMPLATE_NOT_FOUND', 'Shift template was not found.', input, context, {});
        var employee = employeeFor(data, access.tenantSlug, input && input.employeeId);
        if (!employee) return failure('EMPLOYEE_NOT_FOUND', 'Employee was not found for shift assignment.', input, context, {});
        if (input && input.employeeTenantSlug && normalizeTenant(input.employeeTenantSlug) !== access.tenantSlug) return failure('CROSS_TENANT_SHIFT_ROSTER_BLOCKED', 'Cross-tenant shift assignment is blocked.', input, context, {});
        var assignment = {
            assignmentId: id('SHIFT-ASSIGNMENT'),
            tenantSlug: access.tenantSlug,
            employeeId: employeeIdOf(employee),
            templateId: template.templateId,
            effectiveDate: safeString(input && input.effectiveDate || input && input.date || nowIso().slice(0, 10), ''),
            assignmentScope: normalizeAssignmentScope(input && input.assignmentScope || {}),
            status: 'APPROVED',
            approval: clone(input.approval),
            version: 1,
            createdAt: nowIso(),
            createdBy: access.actor.id,
            immutable: true,
            employeeScheduleMutated: false
        };
        data[ASSIGNMENT_TABLE].unshift(assignment);
        saveVersion(data, 'SHIFT_ASSIGNMENT', assignment, access.actor.id, 'ASSIGNED', input && input.reason);
        saveData(data);
        var metadata = { assignmentId: assignment.assignmentId, tenantSlug: access.tenantSlug, templateId: template.templateId, status: 'ASSIGNED' };
        recordGovernance('SHIFT_ASSIGNMENT_APPROVED', assignment.assignmentId, 'Shift assignment approved.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, assignment: assignment, employeeScheduleMutated: false, governance: governanceFlags(true, context || {}) });
    }

    function requestShiftSwap(input, context) {
        var access = checkAccess(input || {}, context || {}, { roles: ALLOWED_ROLES.concat(['EMPLOYEE']) });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var requester = employeeFor(data, access.tenantSlug, input && input.requesterEmployeeId);
        var target = employeeFor(data, access.tenantSlug, input && input.targetEmployeeId);
        if (!requester || !target) return failure('EMPLOYEE_NOT_FOUND', 'Both employees must exist in the requesting tenant.', input, context, {});
        var fromTemplate = templateById(data, access.tenantSlug, input && input.fromTemplateId);
        var toTemplate = templateById(data, access.tenantSlug, input && input.toTemplateId);
        if (!fromTemplate || !toTemplate) return failure('SHIFT_TEMPLATE_NOT_FOUND', 'Both shift templates must exist for swap eligibility.', input, context, {});
        var eligible = !leaveConflict(data, access.tenantSlug, employeeIdOf(requester), input && input.date) && !leaveConflict(data, access.tenantSlug, employeeIdOf(target), input && input.date);
        var swap = {
            swapId: id('SHIFT-SWAP'),
            tenantSlug: access.tenantSlug,
            requesterEmployeeId: employeeIdOf(requester),
            targetEmployeeId: employeeIdOf(target),
            fromTemplateId: fromTemplate.templateId,
            toTemplateId: toTemplate.templateId,
            date: safeString(input && input.date || nowIso().slice(0, 10), ''),
            reason: safeString(input && input.reason || '', ''),
            eligibility: {
                eligible: eligible,
                leaveConflict: !eligible,
                crossTenantBlocked: false
            },
            status: eligible ? 'ELIGIBLE' : 'REQUESTED',
            createdAt: nowIso(),
            createdBy: access.actor.id,
            approved: false,
            scheduleMutated: false
        };
        data[SWAP_TABLE].unshift(swap);
        saveData(data);
        var metadata = { swapId: swap.swapId, tenantSlug: access.tenantSlug, status: swap.status };
        recordGovernance('SHIFT_SWAP_REQUESTED', swap.swapId, 'Shift swap requested.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, swap: swap, governance: governanceFlags(true, context || {}) });
    }

    function approveShiftSwap(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: false });
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('SHIFT_SWAP_APPROVAL_REQUIRED', 'Shift swap requires manager or administrator approval.', input, context, {});
        var data = ensureTables(rawData());
        var swap = (data[SWAP_TABLE] || []).find(function each(row) { return sameTenant(row, access.tenantSlug) && row.swapId === safeString(input && input.swapId, ''); });
        if (!swap) return failure('SHIFT_SWAP_NOT_FOUND', 'Shift swap request was not found.', input, context, {});
        swap.status = input && input.approval && input.approval.approved === true ? 'APPROVED' : 'REJECTED';
        swap.approved = swap.status === 'APPROVED';
        swap.approval = clone(input.approval);
        swap.approvedAt = nowIso();
        swap.approvedBy = input.approval.approvedBy;
        swap.scheduleMutated = false;
        saveData(data);
        var metadata = { swapId: swap.swapId, tenantSlug: access.tenantSlug, status: swap.status };
        recordGovernance('SHIFT_SWAP_APPROVED', swap.swapId, 'Shift swap approval recorded.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, swap: swap, scheduleMutated: false, governance: governanceFlags(true, context || {}) });
    }

    function publishRoster(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('ROSTER_PUBLISH_APPROVAL_REQUIRED', 'Roster publish requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var roster = rosterById(data, access.tenantSlug, input && input.rosterId);
        if (!roster) return failure('ROSTER_NOT_FOUND', 'Roster was not found.', input, context, {});
        var validation = rosterIssues(roster, data, { rosterId: roster.rosterId });
        if (validation.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezeRosterOutput({ success: false, tenantSlug: access.tenantSlug, issues: validation, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        roster.status = 'PUBLISHED';
        roster.version += 1;
        roster.publishedAt = nowIso();
        roster.publishedBy = input.approval.approvedBy;
        roster.updatedAt = nowIso();
        saveVersion(data, 'ROSTER', roster, access.actor.id, 'PUBLISHED', input.approval.reason);
        saveData(data);
        var metadata = { rosterId: roster.rosterId, tenantSlug: access.tenantSlug, version: roster.version, status: 'PUBLISHED' };
        recordGovernance('ROSTER_PUBLISHED', roster.rosterId, 'Roster published.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, roster: roster, warnings: validation, governance: governanceFlags(true, context || {}) });
    }

    function rollbackRosterVersion(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: true });
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('ROSTER_ROLLBACK_APPROVAL_REQUIRED', 'Roster rollback requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var roster = rosterById(data, access.tenantSlug, input && input.rosterId);
        if (!roster) return failure('ROSTER_NOT_FOUND', 'Roster was not found.', input, context, {});
        var targetVersion = Number(input && input.targetVersion || 0);
        var version = (data[VERSION_TABLE] || []).find(function each(row) {
            return row.entityType === 'ROSTER' && row.entityId === roster.rosterId && sameTenant(row, access.tenantSlug) && Number(row.version) === targetVersion;
        });
        if (!version || !version.snapshot) return failure('ROSTER_VERSION_NOT_FOUND', 'Target roster version was not found.', input, context, {});
        var nextVersion = roster.version + 1;
        var restored = clone(version.snapshot);
        restored.version = nextVersion;
        restored.updatedAt = nowIso();
        restored.updatedBy = access.actor.id;
        Object.keys(roster).forEach(function remove(key) { delete roster[key]; });
        Object.assign(roster, restored);
        saveVersion(data, 'ROSTER', roster, access.actor.id, 'ROLLED_BACK', input && input.reason);
        data[ROLLBACK_TABLE].unshift({
            rollbackId: id('SHIFT-ROSTER-ROLLBACK'),
            rosterId: roster.rosterId,
            tenantSlug: access.tenantSlug,
            targetVersion: targetVersion,
            restoredVersion: nextVersion,
            reason: safeString(input && input.reason, ''),
            approval: clone(input.approval),
            createdAt: nowIso(),
            immutable: true
        });
        saveData(data);
        var metadata = { rosterId: roster.rosterId, tenantSlug: access.tenantSlug, targetVersion: targetVersion, restoredVersion: nextVersion, status: 'ROLLED_BACK' };
        recordGovernance('ROSTER_ROLLBACK', roster.rosterId, 'Roster rollback executed.', metadata, context || {});
        return freezeRosterOutput({ success: true, tenantSlug: access.tenantSlug, roster: roster, governance: governanceFlags(true, context || {}) });
    }

    function generateForecast(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: false });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var rosters = (data[ROSTER_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var employees = (data.employees || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var entries = rosters.reduce(function flat(out, roster) { return out.concat(roster.entries || []); }, []);
        var assigned = {};
        entries.forEach(function each(entry) { assigned[normalizeId(entry.employeeId)] = true; });
        var unassignedEmployees = employees.filter(function each(employee) { return !assigned[normalizeId(employeeIdOf(employee))]; }).map(function each(employee) {
            return { employeeId: employeeIdOf(employee), department: employee.department || '', location: employee.location || '' };
        });
        var coverageByDate = {};
        entries.forEach(function each(entry) {
            coverageByDate[entry.date] = (coverageByDate[entry.date] || 0) + 1;
        });
        var overloaded = [];
        var hours = {};
        entries.forEach(function each(entry) {
            var template = templateById(data, access.tenantSlug, entry.templateId);
            if (!template) return;
            var key = normalizeId(entry.employeeId);
            hours[key] = (hours[key] || 0) + Number(template.workingHours || 0);
        });
        Object.keys(hours).forEach(function each(employeeId) {
            if (hours[employeeId] > 54) overloaded.push({ employeeId: employeeId, scheduledHours: hours[employeeId] });
        });
        var expectedCoverage = Math.max(1, Number(input && input.expectedCoverage || Math.ceil(employees.length * 0.75)) || 1);
        var shiftGaps = Object.keys(coverageByDate).filter(function each(date) { return coverageByDate[date] < expectedCoverage; }).map(function each(date) {
            return { date: date, assigned: coverageByDate[date], expected: expectedCoverage };
        });
        var forecast = {
            staffingCoverage: entries.length,
            shiftCapacity: Object.keys(coverageByDate).length * expectedCoverage,
            unassignedEmployees: unassignedEmployees,
            overloadedEmployees: overloaded,
            shiftGaps: shiftGaps,
            futureWorkforceRequirements: Math.max(0, shiftGaps.length * expectedCoverage - entries.length)
        };
        return freezeRosterOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            forecast: forecast,
            coverageScore: clampScore(forecast.shiftCapacity ? (entries.length / forecast.shiftCapacity) * 100 : 0),
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function generateSchedulingAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: false });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var templates = (data[TEMPLATE_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var rosters = (data[ROSTER_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var assignments = (data[ASSIGNMENT_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var swaps = (data[SWAP_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var entries = rosters.reduce(function flat(out, roster) { return out.concat(roster.entries || []); }, []);
        var published = rosters.filter(function each(row) { return normalizeStatus(row.status) === 'PUBLISHED'; }).length;
        var overtimeRisk = entries.filter(function each(entry) {
            var template = templateById(data, access.tenantSlug, entry.templateId);
            return template && Number(template.workingHours || 0) >= 10;
        }).length;
        var coverage = generateForecast({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var analytics = {
            shiftTemplates: templates.length,
            rosters: rosters.length,
            publishedRosters: published,
            rosterChanges: (data[VERSION_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); }).length,
            shiftUtilization: entries.length,
            coverage: coverage.forecast ? coverage.forecast.staffingCoverage : 0,
            swapRequests: swaps.length,
            approvedSwaps: swaps.filter(function each(row) { return row.status === 'APPROVED'; }).length,
            assignments: assignments.length,
            overtimeRisk: overtimeRisk,
            attendanceCompliance: 100 - Math.min(50, overtimeRisk * 5)
        };
        var rosterHealth = clampScore(70 + Math.min(15, templates.length * 3) + Math.min(15, published * 5) - overtimeRisk * 2);
        var efficiency = clampScore(80 + Math.min(10, assignments.length * 2) - Math.max(0, swaps.length - analytics.approvedSwaps) * 3);
        var output = {
            success: true,
            tenantSlug: access.tenantSlug,
            analytics: analytics,
            rosterHealthScore: rosterHealth,
            schedulingEfficiencyScore: efficiency,
            coverageScore: coverage.coverageScore || 0,
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(Object.assign({ analyticsId: id('SHIFT-ROSTER-ANALYTICS'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        return freezeRosterOutput(output);
    }

    function generateRosterDashboard(input, context) {
        var access = checkAccess(input || {}, context || {}, { configOnly: false });
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var templates = (data[TEMPLATE_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var rosters = (data[ROSTER_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var assignments = (data[ASSIGNMENT_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var swaps = (data[SWAP_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var analytics = generateSchedulingAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var forecast = generateForecast({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        return freezeRosterOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            shiftTemplates: templates.map(function each(row) { return { templateId: row.templateId, shiftName: row.shiftName, shiftCode: row.shiftCode, shiftType: row.shiftType, startTime: row.startTime, endTime: row.endTime, workingHours: row.workingHours, status: row.status, version: row.version }; }),
            rosterCalendar: rosters.map(function each(row) { return { rosterId: row.rosterId, rosterName: row.rosterName, rosterCode: row.rosterCode, rosterType: row.rosterType, startDate: row.startDate, endDate: row.endDate, status: row.status, version: row.version, entries: (row.entries || []).length }; }),
            assignments: assignments.map(function each(row) { return { assignmentId: row.assignmentId, employeeId: row.employeeId, templateId: row.templateId, effectiveDate: row.effectiveDate, status: row.status }; }),
            coverageMap: forecast.forecast || {},
            shiftSwaps: swaps.map(function each(row) { return { swapId: row.swapId, requesterEmployeeId: row.requesterEmployeeId, targetEmployeeId: row.targetEmployeeId, date: row.date, status: row.status, eligible: row.eligibility && row.eligibility.eligible }; }),
            forecast: forecast.forecast || {},
            analytics: analytics.analytics || {},
            upcomingRotations: rosters.map(function each(row) { return { rosterId: row.rosterId, rotationRules: row.rotationRules }; }),
            rosterHealthScore: analytics.rosterHealthScore || 0,
            schedulingEfficiencyScore: analytics.schedulingEfficiencyScore || 0,
            coverageScore: analytics.coverageScore || 0,
            compatibility: {
                existingAttendancePreserved: true,
                existingLeavePreserved: true,
                existingPayrollPreserved: true,
                existingApprovalPreserved: true,
                existingSchedulesPreserved: true,
                employeeSchedulesUnaffected: true
            },
            governance: governanceFlags(false, context || {})
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeRosterOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            record('shift types available', SHIFT_TYPES.indexOf('NIGHT_SHIFT') !== -1 && SHIFT_TYPES.indexOf('ON_CALL_SHIFT') !== -1, SHIFT_TYPES);
            record('roster types available', ROSTER_TYPES.indexOf('ROTATIONAL_ROSTER') !== -1 && ROSTER_TYPES.indexOf('PROJECT_ROSTER') !== -1, ROSTER_TYPES);
            record('rotation types available', ROTATION_TYPES.indexOf('WEEKLY_ROTATION') !== -1 && ROTATION_TYPES.indexOf('EVENING_NIGHT') !== -1, ROTATION_TYPES);
            var frozen = freezeRosterOutput({ ok: true, nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            record('employee schedules protected by default', governanceFlags(false, {}).employeeSchedulesUnaffected === true, null);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezeRosterOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Shift and roster configuration self-test completed.',
            checks: checks
        });
    }

    var ShiftRosterConfigurationService = Object.freeze({
        SHIFT_TYPES: SHIFT_TYPES,
        ROSTER_TYPES: ROSTER_TYPES,
        ROTATION_TYPES: ROTATION_TYPES,
        ROSTER_STATES: ROSTER_STATES,
        SWAP_STATES: SWAP_STATES,
        createShiftTemplate: createShiftTemplate,
        updateShiftTemplate: updateShiftTemplate,
        publishShiftTemplate: publishShiftTemplate,
        generateRoster: generateRoster,
        publishRoster: publishRoster,
        applyRotation: applyRotation,
        assignShift: assignShift,
        requestShiftSwap: requestShiftSwap,
        approveShiftSwap: approveShiftSwap,
        validateRoster: validateRoster,
        rollbackRosterVersion: rollbackRosterVersion,
        generateForecast: generateForecast,
        generateSchedulingAnalytics: generateSchedulingAnalytics,
        generateRosterDashboard: generateRosterDashboard,
        freezeRosterOutput: freezeRosterOutput
    });

    global.ShiftRosterConfigurationService = ShiftRosterConfigurationService;
    global.shiftRosterConfigurationService = ShiftRosterConfigurationService;
    global.ShiftTemplateService = ShiftRosterConfigurationService;
    global.RosterEngine = ShiftRosterConfigurationService;
    global.RotationEngine = ShiftRosterConfigurationService;
    global.ShiftAssignmentService = ShiftRosterConfigurationService;
    global.ShiftSwapService = ShiftRosterConfigurationService;
    global.RosterValidator = ShiftRosterConfigurationService;
    global.SchedulingAnalyticsService = ShiftRosterConfigurationService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_SHIFT_ROSTER_CONFIGURATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
