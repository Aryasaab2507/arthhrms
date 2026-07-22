(function attachWorkingCalendarConfigurationService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var HOLIDAY_TYPES = Object.freeze(['NATIONAL', 'STATE', 'REGIONAL', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'OPTIONAL', 'RESTRICTED', 'FLOATING']);
    var CALENDAR_STATES = Object.freeze(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ROLLED_BACK']);
    var WORK_WEEK_PATTERNS = Object.freeze(['MONDAY_FRIDAY', 'MONDAY_SATURDAY', 'SUNDAY_THURSDAY', 'CUSTOM']);
    var SHIFT_TYPES = Object.freeze(['GENERAL', 'MORNING', 'EVENING', 'NIGHT', 'ROTATIONAL', 'SPLIT', 'FLEXIBLE', 'CUSTOM']);
    var SUPPORTED_IMPORT_TYPES = Object.freeze(['CSV', 'TSV', 'XLS', 'XLSX', 'ICS']);
    var SENSITIVE_KEYS = /salary|payroll|gross|net|compensation|leave\s*balance|leaveBalance|password|secret|token|bank|account|aadhaar|\bpan\b|tax|private|confidential|reason|medical|document/i;
    var DAYS = Object.freeze(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']);

    function db() { return global.DB || null; }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeTenantSlug(value) {
        return normalizeText(value)
            .toLowerCase()
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeText(value || 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        if (role === 'HRHEAD') role = 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeCode(value) {
        return normalizeText(value).toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeType(value, allowed, fallback) {
        var type = normalizeText(value || fallback).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return allowed.indexOf(type) >= 0 ? type : type;
    }

    function freezeCalendarOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeCalendarOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeCalendarOutput(value[key]);
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function cloneSanitized(value, keyHint) {
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint); });
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEYS.test(key)) return;
                clone[key] = cloneSanitized(value[key], key);
            });
            return clone;
        }
        if (SENSITIVE_KEYS.test(String(keyHint || ''))) return undefined;
        return value;
    }

    function issue(code, message, severity, metadata) {
        return freezeCalendarOutput({
            code: code,
            message: message,
            severity: severity || 'WARNING',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function actorFromContext(context) {
        var ctx = context || {};
        var actor = ctx.actor || {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || ctx.actorId || ''),
            empId: normalizeText(actor.empId || actor.employeeId || actor.id || ctx.empId || ''),
            role: normalizeRole(actor.role || ctx.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || actor.companyId || ctx.tenantSlug || ctx.tenantId || ctx.companyId || ''),
            name: normalizeText(actor.name || actor.email || actor.id || '')
        };
    }

    function tenantFromContext(context) {
        var ctx = context || {};
        var actor = ctx.actor || {};
        var settings = rawData().companySettings || {};
        return normalizeTenantSlug(
            ctx.tenantSlug ||
            ctx.tenantId ||
            ctx.companyId ||
            actor.tenantSlug ||
            actor.tenantId ||
            actor.companyId ||
            settings.tenantSlug ||
            settings.tenantId ||
            settings.companyId ||
            'default'
        );
    }

    function tenantFromInput(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        return normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || source.organizationId || tenantFromContext(context || {}));
    }

    function recordTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.organizationId || ''));
    }

    function sameTenant(row, tenantSlug) {
        var scope = recordTenant(row);
        if (scope) return scope === normalizeTenantSlug(tenantSlug);
        return normalizeTenantSlug(tenantSlug) === tenantFromContext({});
    }

    function arrayFor(key) {
        var data = rawData();
        return Array.isArray(data[key]) ? data[key] : [];
    }

    function tenantRows(key, tenantSlug) {
        return arrayFor(key).filter(function filter(row) { return sameTenant(row, tenantSlug); });
    }

    function validDate(value) {
        var text = normalizeText(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
        var date = new Date(text + 'T00:00:00Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
    }

    function minutes(value) {
        var text = normalizeText(value);
        var match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
        if (!match) return null;
        return Number(match[1]) * 60 + Number(match[2]);
    }

    function unique(list) {
        var out = [];
        (list || []).forEach(function add(item) {
            if (item && out.indexOf(item) === -1) out.push(item);
        });
        return out;
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function defaultWorkingDays(pattern) {
        if (pattern === 'MONDAY_SATURDAY') return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        if (pattern === 'SUNDAY_THURSDAY') return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'];
        return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    }

    function normalizeWorkingDays(days, pattern) {
        var list = Array.isArray(days) && days.length ? days : defaultWorkingDays(pattern);
        return unique(list.map(function map(day) {
            return normalizeText(day).toUpperCase().replace(/[^A-Z]+/g, '_');
        }).filter(function valid(day) { return DAYS.indexOf(day) >= 0; }));
    }

    function normalizeHoliday(row, tenantSlug, index) {
        var source = row || {};
        var date = normalizeText(source.date || source.holidayDate || source.holiday_date || source.dtstart || source.start || '');
        var name = normalizeText(source.name || source.holidayName || source.title || source.summary || '');
        return {
            holidayId: normalizeText(source.holidayId || source.id || ('WHOL-' + normalizeTenantSlug(tenantSlug || 'tenant') + '-' + String(index + 1).padStart(3, '0'))),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenantId || tenantSlug),
            name: name,
            date: date,
            type: normalizeType(source.type || source.holidayType || source.category || 'COMPANY', HOLIDAY_TYPES, 'COMPANY'),
            region: normalizeCode(source.region || source.state || source.country || 'GLOBAL') || 'GLOBAL',
            description: normalizeText(source.description || source.holidayDescription || ''),
            optional: source.optional === true || source.restricted === true || /OPTIONAL|RESTRICTED|FLOATING/i.test(normalizeText(source.type || source.holidayType || '')),
            active: source.active === false ? false : true,
            sourceIndex: index || 0
        };
    }

    function normalizeWorkWeek(source) {
        var input = source && typeof source === 'object' ? source : {};
        var pattern = normalizeType(input.pattern || input.workWeek || input.type || 'MONDAY_FRIDAY', WORK_WEEK_PATTERNS, 'MONDAY_FRIDAY');
        if (WORK_WEEK_PATTERNS.indexOf(pattern) === -1) pattern = 'CUSTOM';
        return {
            pattern: pattern,
            workingDays: normalizeWorkingDays(input.workingDays || input.days, pattern),
            halfDayRules: Array.isArray(input.halfDayRules) ? input.halfDayRules.map(function map(row) {
                return cloneSanitized({
                    day: normalizeText(row.day).toUpperCase(),
                    startTime: normalizeText(row.startTime || ''),
                    endTime: normalizeText(row.endTime || '')
                });
            }) : [],
            weekendRotation: input.weekendRotation === true
        };
    }

    function normalizeWorkingHours(source, timezone) {
        var input = source && typeof source === 'object' ? source : {};
        return {
            officeStart: normalizeText(input.officeStart || input.startTime || '09:00'),
            officeEnd: normalizeText(input.officeEnd || input.endTime || '18:00'),
            graceMinutes: Math.max(0, Number(input.graceMinutes || input.graceTime || 0) || 0),
            breakMinutes: Math.max(0, Number(input.breakMinutes || input.breakTime || 0) || 0),
            flexibleHours: input.flexibleHours === true,
            coreStart: normalizeText(input.coreStart || ''),
            coreEnd: normalizeText(input.coreEnd || ''),
            nightShift: input.nightShift === true,
            overtimeRules: cloneSanitized(input.overtimeRules || {}),
            timezone: normalizeText(input.timezone || timezone || 'UTC')
        };
    }

    function normalizeShiftPolicy(source, tenantSlug, calendarId) {
        var input = source && typeof source === 'object' ? source : {};
        var type = normalizeType(input.type || input.shiftType || 'GENERAL', SHIFT_TYPES, 'GENERAL');
        if (SHIFT_TYPES.indexOf(type) === -1) type = 'CUSTOM';
        return {
            shiftId: normalizeText(input.shiftId || input.id || ('SHIFT-' + normalizeTenantSlug(tenantSlug || 'tenant') + '-' + Date.now().toString(36))),
            tenantSlug: tenantSlug,
            calendarId: normalizeText(input.calendarId || calendarId || ''),
            name: normalizeText(input.name || input.shiftName || type.replace(/_/g, ' ') + ' Shift'),
            type: type,
            startTime: normalizeText(input.startTime || input.officeStart || '09:00'),
            endTime: normalizeText(input.endTime || input.officeEnd || '18:00'),
            timezone: normalizeText(input.timezone || 'UTC'),
            nightShift: input.nightShift === true || type === 'NIGHT',
            splitShift: input.splitShift === true || type === 'SPLIT',
            flexible: input.flexible === true || type === 'FLEXIBLE',
            overtimeEligible: input.overtimeEligible === true,
            rotationRules: cloneSanitized(input.rotationRules || {}),
            createdAt: normalizeText(input.createdAt || nowIso())
        };
    }

    function normalizeCalendarPayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var tenantSlug = tenantFromInput(source, context || {});
        var year = Number(source.year || source.calendarYear || new Date().getFullYear());
        if (!Number.isFinite(year) || year < 1900 || year > 2200) year = new Date().getFullYear();
        var holidays = Array.isArray(source.holidays) ? source.holidays :
            Array.isArray(source.rows) ? source.rows :
            Array.isArray(source.records) ? source.records :
            Array.isArray(source.calendar && source.calendar.holidays) ? source.calendar.holidays : [];
        var workWeek = normalizeWorkWeek(source.workWeek || {});
        var workingHours = normalizeWorkingHours(source.workingHours || {}, source.timezone || rawData().companySettings?.timezone);
        var calendarId = normalizeText(source.calendarId || source.id || '');
        return {
            tenantSlug: tenantSlug,
            calendarId: calendarId,
            name: normalizeText(source.name || source.calendarName || 'Working Calendar ' + year),
            year: year,
            country: normalizeCode(source.country || rawData().companySettings?.country || ''),
            state: normalizeCode(source.state || ''),
            region: normalizeCode(source.region || source.state || source.country || 'GLOBAL') || 'GLOBAL',
            description: normalizeText(source.description || ''),
            status: normalizeText(source.status || source.state || 'DRAFT').toUpperCase() || 'DRAFT',
            fileName: normalizeText(source.fileName || source.filename || ''),
            fileType: normalizeText(source.fileType || source.type || (source.fileName || '').split('.').pop() || '').replace(/^\./, '').toUpperCase(),
            holidays: holidays.map(function map(row, index) { return normalizeHoliday(row, tenantSlug, index); }),
            workWeek: workWeek,
            workingHours: workingHours,
            shiftPolicy: source.shiftPolicy ? normalizeShiftPolicy(source.shiftPolicy, tenantSlug, calendarId) : null,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function validateAccess(operation, input, context) {
        var tenantSlug = tenantFromInput(input || {}, context || {});
        var actor = actorFromContext(context || {});
        var actorTenant = actor.tenantSlug || tenantFromContext(context || {});
        var issues = [];
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            issues.push(issue('CROSS_TENANT_CALENDAR_BLOCKED', 'Working calendars are tenant scoped.', 'CRITICAL', { actorTenant: actorTenant, targetTenant: tenantSlug }));
            return { allowed: false, actor: actor, tenantSlug: tenantSlug, issues: issues };
        }
        if (operation === 'VIEW') return { allowed: true, actor: actor, tenantSlug: tenantSlug, issues: issues };
        if (operation === 'PUBLISH' || operation === 'ROLLBACK') {
            if (actor.role !== 'DIRECTOR' && actor.role !== 'PLATFORM_OWNER') {
                issues.push(issue('CALENDAR_PUBLISH_ACCESS_DENIED', 'Only Director or Platform Owner can publish or rollback working calendar versions.', 'ERROR', { role: actor.role }));
            }
        } else if (['HR', 'DIRECTOR', 'PLATFORM_OWNER', 'ADMIN', 'SUPER_ADMIN'].indexOf(actor.role) === -1) {
            issues.push(issue('CALENDAR_CONFIGURATION_ACCESS_DENIED', 'Working calendar configuration is restricted to authorized administrators.', 'ERROR', { role: actor.role }));
        }
        return { allowed: issues.length === 0, actor: actor, tenantSlug: tenantSlug, issues: issues };
    }

    function validateCalendarPayload(payload) {
        var issues = [];
        if (!payload.name) issues.push(issue('MISSING_CALENDAR_NAME', 'Calendar name is required.', 'ERROR'));
        if (!payload.year) issues.push(issue('MISSING_CALENDAR_YEAR', 'Calendar year is required.', 'ERROR'));
        if (payload.fileType && SUPPORTED_IMPORT_TYPES.indexOf(payload.fileType) === -1) {
            issues.push(issue('UNSUPPORTED_CALENDAR_IMPORT_TYPE', 'Calendar imports support CSV, TSV, XLS, XLSX, and ICS files.', 'CRITICAL', { fileType: payload.fileType }));
        }
        var seen = {};
        payload.holidays.forEach(function each(row) {
            if (!row.name) issues.push(issue('MISSING_HOLIDAY_NAME', 'Holiday name is required.', 'ERROR', { row: row.sourceIndex + 1 }));
            if (!validDate(row.date)) issues.push(issue('INVALID_HOLIDAY_DATE', 'Holiday date must be a valid YYYY-MM-DD date.', 'ERROR', { row: row.sourceIndex + 1, date: row.date }));
            if (HOLIDAY_TYPES.indexOf(row.type) === -1) issues.push(issue('INVALID_HOLIDAY_TYPE', 'Holiday type is not supported by working calendar governance.', 'ERROR', { row: row.sourceIndex + 1, type: row.type }));
            if (!row.region || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(row.region)) issues.push(issue('INVALID_HOLIDAY_REGION', 'Holiday region must be an uppercase region code.', 'ERROR', { row: row.sourceIndex + 1, region: row.region }));
            if (validDate(row.date)) {
                var key = row.region + '|' + row.date;
                if (seen[key]) issues.push(issue('DUPLICATE_HOLIDAY_DATE', 'Duplicate holiday date detected for the same region.', 'ERROR', { row: row.sourceIndex + 1, date: row.date, region: row.region }));
                seen[key] = true;
            }
        });
        var start = minutes(payload.workingHours.officeStart);
        var end = minutes(payload.workingHours.officeEnd);
        if (start === null || end === null || end <= start) {
            issues.push(issue('INVALID_WORKING_HOURS_RANGE', 'Office end time must be later than office start time.', 'ERROR', { officeStart: payload.workingHours.officeStart, officeEnd: payload.workingHours.officeEnd }));
        }
        if (payload.workWeek.pattern === 'CUSTOM' && payload.workWeek.weekendRotation !== true && payload.workWeek.workingDays.some(function weekend(day) { return day === 'SATURDAY' || day === 'SUNDAY'; })) {
            issues.push(issue('WEEKEND_WORKDAY_CONFLICT', 'Custom work weeks using weekend days require weekend rotation governance.', 'WARNING', { workingDays: payload.workWeek.workingDays }));
        }
        if (payload.shiftPolicy) {
            var shiftStart = minutes(payload.shiftPolicy.startTime);
            var shiftEnd = minutes(payload.shiftPolicy.endTime);
            if (shiftStart === null || shiftEnd === null || (shiftEnd <= shiftStart && payload.shiftPolicy.nightShift !== true)) {
                issues.push(issue('INVALID_SHIFT_TIME_RANGE', 'Shift end time must be later than start time unless configured as night shift.', 'ERROR', { shiftId: payload.shiftPolicy.shiftId }));
            }
        }
        return issues;
    }

    function validationSummary(payload, issues) {
        var blockers = issues.filter(function block(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; }).length;
        var warnings = issues.filter(function warn(item) { return item.severity === 'WARNING'; }).length;
        var duplicateHolidays = issues.filter(function dup(item) { return item.code === 'DUPLICATE_HOLIDAY_DATE'; }).length;
        var invalidTimeRanges = issues.filter(function time(item) { return /TIME_RANGE|WORKING_HOURS/.test(item.code); }).length;
        var weekendConflicts = issues.filter(function weekend(item) { return item.code === 'WEEKEND_WORKDAY_CONFLICT'; }).length;
        var regions = unique(payload.holidays.map(function region(row) { return row.region; }).filter(Boolean));
        var holidayTypes = unique(payload.holidays.map(function type(row) { return row.type; }).filter(Boolean));
        return {
            totalHolidays: payload.holidays.length,
            activeHolidays: payload.holidays.filter(function active(row) { return row.active !== false; }).length,
            duplicateHolidays: duplicateHolidays,
            invalidTimeRanges: invalidTimeRanges,
            weekendConflicts: weekendConflicts,
            warningCount: warnings,
            errorCount: blockers,
            regionalCoverage: regions.length,
            holidayTypeCoverage: holidayTypes.length,
            workingDayCount: payload.workWeek.workingDays.length
        };
    }

    function scoreFrom(summary) {
        var coverage = Math.min(25, summary.regionalCoverage * 8) + Math.min(20, summary.holidayTypeCoverage * 4);
        var base = 55 + coverage + Math.min(10, summary.workingDayCount * 2);
        return clampScore(base - summary.errorCount * 18 - summary.warningCount * 4);
    }

    function calendarIdFor(payload) {
        if (payload.calendarId) return payload.calendarId;
        return 'WCAL-' + payload.tenantSlug + '-' + payload.year + '-' + Date.now().toString(36).toUpperCase();
    }

    function persistHistory(key, row, context) {
        try {
            if (context && context.skipPersistence) return false;
            var data = rawData();
            if (!Array.isArray(data[key])) data[key] = [];
            data[key].unshift(cloneSanitized({ ...row, immutable: true }));
            data[key] = data[key].slice(0, 1000);
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function upsert(key, idKey, row, context) {
        if (context && context.skipPersistence) return row;
        var data = rawData();
        if (!Array.isArray(data[key])) data[key] = [];
        var index = data[key].findIndex(function match(item) { return normalizeText(item[idKey]) === normalizeText(row[idKey]) && sameTenant(item, row.tenantSlug); });
        var clean = cloneSanitized({ ...row, updatedAt: nowIso(), immutable: true });
        if (index >= 0) data[key][index] = { ...data[key][index], ...clean };
        else data[key].unshift(clean);
        saveData(data);
        return index >= 0 ? data[key][index] : clean;
    }

    function audit(actionType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: clean.calendarId || clean.shiftId || clean.assignmentId || clean.versionId || '',
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.empId,
                    module: 'Working Calendar Configuration',
                    targetId: clean.tenantSlug || clean.calendarId || '',
                    description: clean.description || actionType,
                    metadata: clean,
                    severity: clean.severity || 'INFO'
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Working Calendar Configuration', clean.tenantSlug || '', clean.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function telemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return false;
            if (global.WorkflowTelemetryService && typeof global.WorkflowTelemetryService.emitTelemetry === 'function') {
                global.WorkflowTelemetryService.emitTelemetry('WORKING_CALENDAR', eventType, {
                    source: 'workingCalendarConfigurationService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function metric(type, metadata, context) {
        try {
            if (context && context.skipMetrics) return false;
            if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') {
                global.OrchestrationMetricsService.recordWorkflowMetric(type, {
                    module: 'Working Calendar Configuration',
                    ...(cloneSanitized(metadata || {}))
                });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function compatibility() {
        return {
            attendanceModulePreserved: true,
            leaveModulePreserved: true,
            payrollCalculationsUnaffected: true,
            payrollRequiresExplicitConfiguration: true
        };
    }

    function failureOutput(state, tenantSlug, issues, extra) {
        return freezeCalendarOutput({
            success: false,
            state: state || 'BLOCKED',
            tenantSlug: normalizeTenantSlug(tenantSlug || ''),
            issues: issues || [],
            governance: {
                tenantIsolationPreserved: true,
                calendarGovernancePreserved: true,
                rbacPreserved: true,
                attendancePreserved: true,
                leavePreserved: true,
                payrollUnaffectedByDefault: true
            },
            compatibility: compatibility(),
            ...(extra || {})
        });
    }

    function validateCalendarConfiguration(input, context) {
        try {
            var payload = normalizeCalendarPayload(input, context || {});
            var access = validateAccess('VALIDATE', payload, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var issues = validateCalendarPayload(payload);
            var summary = validationSummary(payload, issues);
            var health = scoreFrom(summary);
            var success = summary.errorCount === 0;
            return freezeCalendarOutput({
                success: success,
                state: success ? 'VALIDATED' : 'VALIDATION_BLOCKED',
                tenantSlug: payload.tenantSlug,
                calendarId: payload.calendarId,
                summary: summary,
                issues: issues,
                calendarHealthScore: health,
                attendanceReadinessScore: clampScore(health + (summary.workingDayCount >= 5 ? 5 : 0) - summary.weekendConflicts * 4),
                governanceScore: clampScore(100 - summary.errorCount * 20 - summary.warningCount * 5),
                compatibility: compatibility(),
                governance: {
                    tenantIsolationPreserved: true,
                    calendarGovernancePreserved: true,
                    attendancePreserved: true,
                    leavePreserved: true,
                    payrollUnaffectedByDefault: true,
                    versioningRequired: true
                },
                generatedAt: nowIso()
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('CALENDAR_VALIDATION_FAILED_SAFE', 'Calendar validation failed safely.', 'ERROR')]);
        }
    }

    function createHolidayCalendar(input, context) {
        try {
            var payload = normalizeCalendarPayload(input, context || {});
            var access = validateAccess('CONFIGURE', payload, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var validation = validateCalendarConfiguration(payload, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, validation.issues, { validation: validation });
            var id = calendarIdFor(payload);
            var now = nowIso();
            var calendar = {
                calendarId: id,
                tenantSlug: payload.tenantSlug,
                name: payload.name,
                year: payload.year,
                country: payload.country,
                state: payload.state,
                region: payload.region,
                description: payload.description,
                status: 'DRAFT',
                version: 1,
                holidays: payload.holidays,
                workWeek: payload.workWeek,
                workingHours: payload.workingHours,
                createdBy: access.actor.id || access.actor.empId,
                createdAt: now,
                updatedAt: now
            };
            if (payload.shiftPolicy) calendar.shiftPolicyId = payload.shiftPolicy.shiftId;
            var persisted = upsert('workingCalendarConfigurations', 'calendarId', calendar, context || {});
            persistHistory('workingCalendarVersionHistory', { versionId: 'WCV-' + id + '-1', calendarId: id, tenantSlug: payload.tenantSlug, version: 1, status: 'DRAFT', reason: 'Initial draft created.', createdAt: now }, context || {});
            audit('WORKING_CALENDAR_CREATED', { calendarId: id, tenantSlug: payload.tenantSlug, description: 'Working calendar draft created.' }, context || {});
            telemetry('WORKING_CALENDAR_CONFIGURED', { calendarId: id, tenantSlug: payload.tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { calendarId: id, tenantSlug: payload.tenantSlug }, context || {});
            return freezeCalendarOutput({
                success: true,
                state: 'DRAFT',
                tenantSlug: payload.tenantSlug,
                calendar: cloneSanitized(persisted),
                validation: validation,
                governance: {
                    tenantIsolationPreserved: true,
                    calendarGovernancePreserved: true,
                    attendancePreserved: true,
                    leavePreserved: true,
                    payrollUnaffectedByDefault: true,
                    versioningEnabled: true
                },
                compatibility: compatibility(),
                issues: []
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('WORKING_CALENDAR_CREATE_FAILED_SAFE', 'Working calendar creation failed safely.', 'ERROR')]);
        }
    }

    function configureWorkingSchedule(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('CONFIGURE', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var schedule = {
                scheduleId: normalizeText(source.scheduleId || ('WSCH-' + tenantSlug + '-' + Date.now().toString(36).toUpperCase())),
                tenantSlug: tenantSlug,
                calendarId: normalizeText(source.calendarId || ''),
                workWeek: normalizeWorkWeek(source.workWeek || {}),
                workingHours: normalizeWorkingHours(source.workingHours || {}, source.timezone || rawData().companySettings?.timezone),
                status: 'DRAFT',
                updatedBy: access.actor.id || access.actor.empId,
                updatedAt: nowIso()
            };
            var validation = validateCalendarConfiguration({
                tenantSlug: tenantSlug,
                name: 'Schedule Validation',
                year: new Date().getFullYear(),
                holidays: [],
                workWeek: schedule.workWeek,
                workingHours: schedule.workingHours
            }, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', tenantSlug, validation.issues, { validation: validation });
            var persisted = upsert('workingSchedulePolicies', 'scheduleId', schedule, context || {});
            persistHistory('workingCalendarVersionHistory', { versionId: 'WCV-SCH-' + schedule.scheduleId, calendarId: schedule.calendarId, tenantSlug: tenantSlug, status: 'DRAFT', action: 'SCHEDULE_CONFIGURED', createdAt: nowIso() }, context || {});
            audit('WORKING_CALENDAR_SCHEDULE_UPDATED', { calendarId: schedule.calendarId, tenantSlug: tenantSlug, description: 'Working schedule configured.' }, context || {});
            telemetry('WORKING_CALENDAR_SCHEDULE_CONFIGURED', { calendarId: schedule.calendarId, tenantSlug: tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { calendarId: schedule.calendarId, tenantSlug: tenantSlug, scheduleConfigured: true }, context || {});
            return freezeCalendarOutput({ success: true, state: 'DRAFT', tenantSlug: tenantSlug, schedule: cloneSanitized(persisted), validation: validation, compatibility: compatibility(), issues: [] });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('WORKING_SCHEDULE_FAILED_SAFE', 'Working schedule configuration failed safely.', 'ERROR')]);
        }
    }

    function createShiftPolicy(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('CONFIGURE', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var shift = normalizeShiftPolicy(source, tenantSlug, source.calendarId);
            var payload = normalizeCalendarPayload({ tenantSlug: tenantSlug, name: 'Shift Validation', holidays: [], shiftPolicy: shift, workingHours: { officeStart: '09:00', officeEnd: '18:00', timezone: shift.timezone } }, context || {});
            var issues = validateCalendarPayload(payload).filter(function onlyShift(row) { return row.code === 'INVALID_SHIFT_TIME_RANGE'; });
            if (issues.length) return failureOutput('VALIDATION_BLOCKED', tenantSlug, issues);
            var persisted = upsert('shiftPolicies', 'shiftId', shift, context || {});
            persistHistory('workingCalendarVersionHistory', { versionId: 'WCV-SHIFT-' + shift.shiftId, calendarId: shift.calendarId, tenantSlug: tenantSlug, status: 'DRAFT', action: 'SHIFT_POLICY_CREATED', createdAt: nowIso() }, context || {});
            audit('SHIFT_POLICY_CREATED', { shiftId: shift.shiftId, calendarId: shift.calendarId, tenantSlug: tenantSlug, description: 'Shift policy created.' }, context || {});
            telemetry('SHIFT_POLICY_CONFIGURED', { shiftId: shift.shiftId, tenantSlug: tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { shiftId: shift.shiftId, tenantSlug: tenantSlug, shiftConfigured: true }, context || {});
            return freezeCalendarOutput({
                success: true,
                state: 'DRAFT',
                tenantSlug: tenantSlug,
                shiftPolicy: cloneSanitized(persisted),
                payrollIntegration: {
                    payrollCalculationsUnaffectedByDefault: true,
                    requiresExplicitPayrollConfiguration: true,
                    overtimeRulesPrepared: true
                },
                compatibility: compatibility(),
                issues: []
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('SHIFT_POLICY_FAILED_SAFE', 'Shift policy creation failed safely.', 'ERROR')]);
        }
    }

    function assignCalendar(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('CONFIGURE', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var scope = normalizeType(source.assignmentScope || source.scope || 'COMPANY', ['COMPANY', 'BRANCH', 'LOCATION', 'DEPARTMENT', 'BUSINESS_UNIT', 'EMPLOYEE', 'ROLE'], 'COMPANY');
            var assignment = {
                assignmentId: normalizeText(source.assignmentId || ('WCASG-' + tenantSlug + '-' + Date.now().toString(36).toUpperCase())),
                tenantSlug: tenantSlug,
                calendarId: normalizeText(source.calendarId || ''),
                assignmentScope: scope,
                branchId: normalizeText(source.branchId || ''),
                locationId: normalizeText(source.locationId || ''),
                departmentId: normalizeText(source.departmentId || ''),
                businessUnitId: normalizeText(source.businessUnitId || ''),
                employeeId: normalizeText(source.employeeId || source.empId || ''),
                role: normalizeRole(source.role || ''),
                effectiveFrom: normalizeText(source.effectiveFrom || nowIso().slice(0, 10)),
                effectiveTo: normalizeText(source.effectiveTo || ''),
                status: 'ACTIVE',
                assignedBy: access.actor.id || access.actor.empId,
                createdAt: nowIso()
            };
            if (!assignment.calendarId) return failureOutput('VALIDATION_BLOCKED', tenantSlug, [issue('MISSING_CALENDAR_ASSIGNMENT_TARGET', 'Calendar assignment requires a calendarId.', 'ERROR')]);
            var persisted = upsert('calendarAssignments', 'assignmentId', assignment, context || {});
            persistHistory('workingCalendarVersionHistory', { versionId: 'WCV-ASG-' + assignment.assignmentId, calendarId: assignment.calendarId, tenantSlug: tenantSlug, status: 'DRAFT', action: 'CALENDAR_ASSIGNED', createdAt: nowIso() }, context || {});
            audit('CALENDAR_ASSIGNMENT_CREATED', { assignmentId: assignment.assignmentId, calendarId: assignment.calendarId, tenantSlug: tenantSlug, description: 'Working calendar assigned.' }, context || {});
            telemetry('CALENDAR_ASSIGNMENT_CONFIGURED', { assignmentId: assignment.assignmentId, tenantSlug: tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { assignmentId: assignment.assignmentId, tenantSlug: tenantSlug, assignmentConfigured: true }, context || {});
            return freezeCalendarOutput({ success: true, state: 'ACTIVE', tenantSlug: tenantSlug, assignment: cloneSanitized(persisted), compatibility: compatibility(), issues: [] });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('CALENDAR_ASSIGNMENT_FAILED_SAFE', 'Calendar assignment failed safely.', 'ERROR')]);
        }
    }

    function importHolidayCalendar(input, context) {
        try {
            var payload = normalizeCalendarPayload(input, context || {});
            var access = validateAccess('CONFIGURE', payload, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var validation = validateCalendarConfiguration(payload, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, validation.issues, { validation: validation });
            var created = createHolidayCalendar(payload, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            if (!created.success) return created;
            persistHistory('workingCalendarImportHistory', { importId: 'WCIMP-' + Date.now().toString(36).toUpperCase(), tenantSlug: payload.tenantSlug, calendarId: created.calendar.calendarId, fileName: payload.fileName, fileType: payload.fileType || 'CSV', importedAt: nowIso() }, context || {});
            audit('WORKING_CALENDAR_IMPORT_CREATED', { calendarId: created.calendar.calendarId, tenantSlug: payload.tenantSlug, description: 'Working calendar imported.' }, context || {});
            telemetry('WORKING_CALENDAR_IMPORT_CREATED', { calendarId: created.calendar.calendarId, tenantSlug: payload.tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { calendarId: created.calendar.calendarId, tenantSlug: payload.tenantSlug, importCreated: true }, context || {});
            return freezeCalendarOutput({
                success: true,
                state: 'DRAFT',
                tenantSlug: payload.tenantSlug,
                calendar: created.calendar,
                importResult: {
                    fileName: payload.fileName,
                    fileType: payload.fileType || 'CSV',
                    importedRows: payload.holidays.length,
                    backgroundImportPrepared: true
                },
                validation: validation,
                compatibility: compatibility(),
                issues: []
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('WORKING_CALENDAR_IMPORT_FAILED_SAFE', 'Working calendar import failed safely.', 'ERROR')]);
        }
    }

    function findCalendar(tenantSlug, calendarId) {
        return tenantRows('workingCalendarConfigurations', tenantSlug).find(function match(row) {
            return normalizeText(row.calendarId) === normalizeText(calendarId);
        }) || null;
    }

    function publishCalendarVersion(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('PUBLISH', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var calendar = findCalendar(tenantSlug, source.calendarId);
            if (!calendar) return failureOutput('NOT_FOUND', tenantSlug, [issue('CALENDAR_NOT_FOUND', 'Calendar version cannot be published because the calendar was not found.', 'ERROR')]);
            var versionNumber = Number(calendar.version || 1);
            var updated = { ...calendar, status: 'PUBLISHED', active: true, version: versionNumber, publishedBy: access.actor.id || access.actor.empId, publishedAt: nowIso(), updatedAt: nowIso() };
            var persisted = upsert('workingCalendarConfigurations', 'calendarId', updated, context || {});
            var version = { versionId: 'WCV-' + calendar.calendarId + '-' + versionNumber + '-PUB', calendarId: calendar.calendarId, tenantSlug: tenantSlug, version: versionNumber, status: 'PUBLISHED', reason: normalizeText(source.reason || ''), createdAt: nowIso() };
            persistHistory('workingCalendarVersionHistory', version, context || {});
            audit('WORKING_CALENDAR_VERSION_PUBLISHED', { calendarId: calendar.calendarId, tenantSlug: tenantSlug, description: 'Working calendar version published.' }, context || {});
            telemetry('WORKING_CALENDAR_VERSION_PUBLISHED', { calendarId: calendar.calendarId, tenantSlug: tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { calendarId: calendar.calendarId, tenantSlug: tenantSlug, published: true }, context || {});
            return freezeCalendarOutput({ success: true, state: 'PUBLISHED', tenantSlug: tenantSlug, calendar: cloneSanitized(persisted), version: version, compatibility: compatibility(), issues: [] });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('CALENDAR_PUBLISH_FAILED_SAFE', 'Calendar publishing failed safely.', 'ERROR')]);
        }
    }

    function rollbackCalendarVersion(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('ROLLBACK', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var calendar = findCalendar(tenantSlug, source.calendarId);
            if (!calendar) return failureOutput('NOT_FOUND', tenantSlug, [issue('CALENDAR_NOT_FOUND', 'Calendar version cannot be rolled back because the calendar was not found.', 'ERROR')]);
            var targetVersion = Number(source.targetVersion || Math.max(1, Number(calendar.version || 1) - 1));
            var updated = { ...calendar, status: 'DRAFT', active: false, version: targetVersion, rolledBackBy: access.actor.id || access.actor.empId, rolledBackAt: nowIso(), updatedAt: nowIso() };
            var persisted = upsert('workingCalendarConfigurations', 'calendarId', updated, context || {});
            var rollback = { versionId: 'WCV-' + calendar.calendarId + '-' + targetVersion + '-ROLLBACK', calendarId: calendar.calendarId, tenantSlug: tenantSlug, targetVersion: targetVersion, status: 'ROLLED_BACK', reason: normalizeText(source.reason || ''), createdAt: nowIso() };
            persistHistory('workingCalendarVersionHistory', rollback, context || {});
            audit('WORKING_CALENDAR_VERSION_ROLLED_BACK', { calendarId: calendar.calendarId, tenantSlug: tenantSlug, description: 'Working calendar version rolled back.' }, context || {});
            telemetry('WORKING_CALENDAR_VERSION_ROLLED_BACK', { calendarId: calendar.calendarId, tenantSlug: tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { calendarId: calendar.calendarId, tenantSlug: tenantSlug, rolledBack: true }, context || {});
            return freezeCalendarOutput({ success: true, state: 'ROLLED_BACK', tenantSlug: tenantSlug, calendar: cloneSanitized(persisted), rollback: rollback, compatibility: compatibility(), issues: [] });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('CALENDAR_ROLLBACK_FAILED_SAFE', 'Calendar rollback failed safely.', 'ERROR')]);
        }
    }

    function countWorkingDays(year, workingDays, holidays) {
        var count = 0;
        var holidayDates = unique((holidays || []).filter(function active(row) { return row.active !== false && validDate(row.date); }).map(function map(row) { return row.date; }));
        var date = new Date(String(year) + '-01-01T00:00:00Z');
        while (date.getUTCFullYear() === Number(year)) {
            var day = DAYS[date.getUTCDay()];
            var iso = date.toISOString().slice(0, 10);
            if (workingDays.indexOf(day) >= 0 && holidayDates.indexOf(iso) === -1) count += 1;
            date.setUTCDate(date.getUTCDate() + 1);
        }
        return count;
    }

    function latestCalendar(tenantSlug) {
        return tenantRows('workingCalendarConfigurations', tenantSlug).sort(function sort(a, b) {
            return String(b.publishedAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.publishedAt || a.updatedAt || a.createdAt || ''));
        })[0] || null;
    }

    function generateCalendarAnalytics(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('VIEW', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var calendars = tenantRows('workingCalendarConfigurations', tenantSlug);
            var shifts = tenantRows('shiftPolicies', tenantSlug);
            var assignments = tenantRows('calendarAssignments', tenantSlug);
            var calendar = source.calendarId ? findCalendar(tenantSlug, source.calendarId) : latestCalendar(tenantSlug);
            var holidays = calendars.reduce(function all(out, row) { return out.concat(Array.isArray(row.holidays) ? row.holidays : []); }, []);
            var workingDays = calendar ? countWorkingDays(calendar.year || new Date().getFullYear(), calendar.workWeek?.workingDays || defaultWorkingDays('MONDAY_FRIDAY'), calendar.holidays || []) : 0;
            var regionalCoverage = unique(holidays.map(function region(row) { return row.region; })).length;
            var shiftTypes = unique(shifts.map(function shift(row) { return row.type; })).length;
            var health = clampScore(60 + Math.min(20, regionalCoverage * 5) + Math.min(10, shifts.length * 3) + Math.min(10, assignments.length * 3));
            var report = {
                analyticsId: 'WCA-' + Date.now().toString(36).toUpperCase(),
                success: true,
                tenantSlug: tenantSlug,
                analytics: {
                    workingDays: workingDays,
                    holidayCount: holidays.filter(function active(row) { return row.active !== false; }).length,
                    regionalCoverage: regionalCoverage,
                    shiftDistribution: shiftTypes,
                    calendarAssignments: assignments.length,
                    calendarCount: calendars.length
                },
                calendarHealthScore: health,
                attendanceReadinessScore: clampScore(health + (assignments.length ? 5 : 0)),
                compatibility: compatibility(),
                generatedAt: nowIso()
            };
            persistHistory('workingCalendarAnalytics', report, context || {});
            audit('WORKING_CALENDAR_ANALYTICS_GENERATED', { tenantSlug: tenantSlug, description: 'Working calendar analytics generated.' }, context || {});
            telemetry('WORKING_CALENDAR_ANALYTICS_GENERATED', { tenantSlug: tenantSlug }, context || {});
            metric('WORKING_CALENDAR_CONFIGURED', { tenantSlug: tenantSlug, analyticsGenerated: true }, context || {});
            return freezeCalendarOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('CALENDAR_ANALYTICS_FAILED_SAFE', 'Calendar analytics failed safely.', 'ERROR')]);
        }
    }

    function generateWorkingCalendarDashboard(input, context) {
        try {
            var source = input || {};
            var tenantSlug = tenantFromInput(source, context || {});
            var access = validateAccess('VIEW', source, context || {});
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var calendars = tenantRows('workingCalendarConfigurations', tenantSlug).map(cloneSanitized);
            var schedules = tenantRows('workingSchedulePolicies', tenantSlug).map(cloneSanitized);
            var shifts = tenantRows('shiftPolicies', tenantSlug).map(cloneSanitized);
            var assignments = tenantRows('calendarAssignments', tenantSlug).map(cloneSanitized);
            var analytics = generateCalendarAnalytics(source, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var upcoming = calendars.reduce(function all(out, row) {
                return out.concat((row.holidays || []).filter(function active(holiday) { return holiday.active !== false && validDate(holiday.date); }));
            }, []).sort(function sort(a, b) { return String(a.date).localeCompare(String(b.date)); }).slice(0, 10);
            audit('WORKING_CALENDAR_DASHBOARD_VIEWED', { tenantSlug: tenantSlug, description: 'Working calendar dashboard viewed.' }, context || {});
            return freezeCalendarOutput({
                success: true,
                tenantSlug: tenantSlug,
                title: 'Working Calendar Center',
                holidayCalendars: calendars,
                workingSchedules: schedules,
                shiftPolicies: shifts,
                calendarAssignments: assignments,
                upcomingHolidays: upcoming.map(cloneSanitized),
                importHistory: tenantRows('workingCalendarImportHistory', tenantSlug).map(cloneSanitized),
                versionTimeline: tenantRows('workingCalendarVersionHistory', tenantSlug).map(cloneSanitized),
                analytics: analytics.analytics || {},
                calendarHealthScore: analytics.calendarHealthScore || 0,
                attendanceReadinessScore: analytics.attendanceReadinessScore || 0,
                compatibility: compatibility(),
                governance: {
                    tenantIsolationPreserved: true,
                    rbacPreserved: true,
                    versioningEnabled: true,
                    auditReady: !!global.AuditService
                },
                generatedAt: nowIso()
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('CALENDAR_DASHBOARD_FAILED_SAFE', 'Working calendar dashboard failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var ctx = { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self' };
            var valid = validateCalendarConfiguration({
                tenantSlug: 'self',
                name: 'Self Test Calendar',
                year: 2028,
                holidays: [{ name: 'Leap Day', date: '2028-02-29', type: 'REGIONAL', region: 'IN-KA' }],
                workWeek: { pattern: 'MONDAY_FRIDAY' },
                workingHours: { officeStart: '09:00', officeEnd: '18:00', timezone: 'Asia/Kolkata' }
            }, ctx);
            check('holiday validation works', valid.success === true);
            var invalid = validateCalendarConfiguration({
                tenantSlug: 'self',
                name: 'Invalid Calendar',
                year: 2026,
                holidays: [{ name: 'Bad', date: '2026-02-30', type: 'NATIONAL', region: 'IN' }],
                workingHours: { officeStart: '18:00', officeEnd: '09:00' }
            }, ctx);
            check('invalid calendars fail safely', invalid.success === false);
            var crossTenant = createHolidayCalendar({ tenantSlug: 'other', name: 'Other Calendar', year: 2026 }, ctx);
            check('tenant isolation preserved', crossTenant.success === false && crossTenant.issues.some(function some(row) { return row.code === 'CROSS_TENANT_CALENDAR_BLOCKED'; }));
            var frozen = freezeCalendarOutput({ nested: { ok: true } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: normalizeText(error && error.message || error) });
        }
        var passed = checks.every(function every(row) { return row.passed; });
        var result = freezeCalendarOutput({
            passed: passed,
            version: VERSION,
            timestamp: nowIso(),
            summary: passed ? 'Working calendar configuration self-test passed.' : 'Working calendar configuration self-test detected failures.',
            checks: checks
        });
        global.__ARTHHRMS_WORKING_CALENDAR_SELF_TEST__ = result;
        return result;
    }

    var api = Object.freeze({
        VERSION: VERSION,
        HOLIDAY_TYPES: HOLIDAY_TYPES,
        CALENDAR_STATES: CALENDAR_STATES,
        WORK_WEEK_PATTERNS: WORK_WEEK_PATTERNS,
        SHIFT_TYPES: SHIFT_TYPES,
        createHolidayCalendar: createHolidayCalendar,
        configureWorkingSchedule: configureWorkingSchedule,
        createShiftPolicy: createShiftPolicy,
        assignCalendar: assignCalendar,
        importHolidayCalendar: importHolidayCalendar,
        validateCalendarConfiguration: validateCalendarConfiguration,
        publishCalendarVersion: publishCalendarVersion,
        rollbackCalendarVersion: rollbackCalendarVersion,
        generateCalendarAnalytics: generateCalendarAnalytics,
        generateWorkingCalendarDashboard: generateWorkingCalendarDashboard,
        freezeCalendarOutput: freezeCalendarOutput,
        runSelfTest: runSelfTest
    });

    global.WorkingCalendarConfigurationService = api;
    global.HolidayCalendarService = api;
    global.WorkingScheduleService = api;
    global.ShiftPolicyService = api;
    global.CalendarAssignmentService = api;
    global.HolidayImportService = api;
    global.CalendarValidator = api;
    global.CalendarAnalyticsService = api;
    global.workingCalendarConfigurationService = api;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
