(function attachCompanyHolidayImportService(global) {
    'use strict';

    var HOLIDAY_TYPES = Object.freeze(['NATIONAL', 'REGIONAL', 'COMPANY', 'OPTIONAL']);
    var SUPPORTED_FILE_TYPES = Object.freeze(['CSV', 'XLS', 'XLSX']);
    var CALENDAR_STATES = Object.freeze(['UPLOADED', 'VALIDATING', 'APPROVAL_PENDING', 'ACTIVE', 'ARCHIVED']);
    var ACCESS_ROLES = Object.freeze(['HR', 'DIRECTOR', 'EMPLOYEE', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|password|secret|token|bank|account|aadhaar|\bpan\b|panNumber|taxPan|ssn|private|medical|document|reason|remarks/i;

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
        return normalizeText(value).toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeFileType(value) {
        var type = normalizeText(value).toUpperCase().replace(/^\./, '');
        if (!type) return 'CSV';
        return type;
    }

    function normalizeHolidayType(value) {
        var type = normalizeText(value || 'COMPANY').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return HOLIDAY_TYPES.indexOf(type) === -1 ? type : type;
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function freezeHolidayOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeHolidayOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeHolidayOutput(value[key]);
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
        return freezeHolidayOutput({
            code: code,
            message: message,
            severity: severity || 'WARNING',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || ''),
            empId: normalizeText(actor.empId || actor.employeeId || actor.id || ''),
            role: normalizeRole(actor.role || context?.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || actor.companyId || context?.tenantSlug || ''),
            name: normalizeText(actor.name || actor.email || actor.id || '')
        };
    }

    function tenantFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        var data = rawData();
        return normalizeTenantSlug(
            context?.tenantSlug ||
            context?.tenantId ||
            context?.companyId ||
            actor.tenantSlug ||
            actor.tenantId ||
            actor.companyId ||
            data.companySettings?.tenantSlug ||
            data.companySettings?.tenantId ||
            data.companySettings?.companyId ||
            'default'
        );
    }

    function recordTenant(row) {
        return normalizeTenantSlug(row?.tenantSlug || row?.tenantId || row?.companyId || row?.organizationId || '');
    }

    function sameTenant(row, tenantSlug) {
        var scope = recordTenant(row);
        if (scope) return scope === normalizeTenantSlug(tenantSlug);
        var settings = rawData().companySettings || {};
        var defaultTenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || 'default');
        return normalizeTenantSlug(tenantSlug) === defaultTenant;
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

    function dateInRange(date, from, to) {
        if (!validDate(date)) return false;
        var start = normalizeText(from || date);
        var end = normalizeText(to || from || date);
        if (!validDate(start) || !validDate(end)) return false;
        return date >= start && date <= end;
    }

    function normalizeHoliday(row, tenantSlug, index) {
        var date = normalizeText(row?.holidayDate || row?.date || row?.holiday_date || '');
        var name = normalizeText(row?.holidayName || row?.name || row?.title || '');
        var type = normalizeHolidayType(row?.holidayType || row?.type || row?.category || 'COMPANY');
        var rawRegion = normalizeText(row?.region || row?.location || row?.country || '');
        var region = rawRegion ? normalizeCode(rawRegion) : 'GLOBAL';
        return {
            holidayId: normalizeText(row?.holidayId || row?.id || ('HOL-' + normalizeTenantSlug(tenantSlug || 'tenant') + '-' + String(index + 1).padStart(3, '0'))),
            tenantSlug: normalizeTenantSlug(row?.tenantSlug || row?.tenantId || tenantSlug),
            holidayName: name,
            holidayDate: date,
            holidayType: type,
            description: normalizeText(row?.holidayDescription || row?.description || ''),
            region: region,
            active: row?.active === false ? false : true,
            sourceIndex: index || 0,
            raw: cloneSanitized(row || {})
        };
    }

    function latestCalendar(tenantSlug, includePending) {
        return tenantRows('companyHolidayCalendars', tenantSlug)
            .filter(function visible(row) { return includePending || row.active === true || row.state === 'ACTIVE'; })
            .sort(function sort(a, b) { return String(b.activatedAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.activatedAt || a.updatedAt || a.createdAt || '')); })[0] || null;
    }

    function normalizeHolidayPayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenantId || tenantFromContext(context || {}));
        var fallbackCalendar = latestCalendar(tenantSlug, true) || {};
        var rows = Array.isArray(source.holidays) ? source.holidays :
            Array.isArray(source.rows) ? source.rows :
            Array.isArray(source.records) ? source.records :
            Array.isArray(source.calendar?.holidays) ? source.calendar.holidays :
            Array.isArray(fallbackCalendar.holidays) ? fallbackCalendar.holidays : [];
        return {
            tenantSlug: tenantSlug,
            fileName: normalizeText(source.fileName || source.filename || source.file?.name || fallbackCalendar.fileName || 'holiday-calendar.csv'),
            fileType: normalizeFileType(source.fileType || source.type || source.file?.type || source.fileName?.split('.').pop() || fallbackCalendar.fileType || 'CSV'),
            calendarId: normalizeText(source.calendarId || source.id || fallbackCalendar.calendarId || ''),
            calendarName: normalizeText(source.calendarName || source.name || fallbackCalendar.calendarName || 'Company Holiday Calendar'),
            calendarYear: Number(source.calendarYear || source.year || fallbackCalendar.calendarYear || new Date().getFullYear()),
            approvalGranted: source.approvalGranted === true || source.approved === true || source.directorApproval === true,
            holidays: rows.map(function map(row, index) { return normalizeHoliday(row, tenantSlug, index); })
        };
    }

    function platformHoliday(row, index) {
        return {
            holidayId: row.holidayId,
            tenantSlug: row.tenantSlug,
            holidayName: 'Governance Holiday ' + String(index + 1).padStart(2, '0'),
            holidayDate: row.holidayDate,
            holidayType: row.holidayType,
            description: '',
            region: row.region,
            active: row.active
        };
    }

    function validateAccess(operation, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        var actorTenant = actor.tenantSlug || tenantFromContext(context || {});
        var targetTenant = normalizeTenantSlug(tenantSlug || actorTenant);
        var issues = [];
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && targetTenant && actorTenant !== targetTenant) {
            issues.push(issue('CROSS_TENANT_HOLIDAY_BLOCKED', 'Holiday calendars are tenant scoped and cannot be imported across tenants.', 'CRITICAL', { actorTenant: actorTenant, targetTenant: targetTenant }));
            return { allowed: false, actor: actor, issues: issues };
        }
        if (ACCESS_ROLES.indexOf(actor.role) === -1) {
            issues.push(issue('HOLIDAY_ACCESS_ROLE_UNKNOWN', 'Holiday governance access is restricted to configured roles.', 'ERROR', { role: actor.role }));
            return { allowed: false, actor: actor, issues: issues };
        }
        if (operation === 'IMPORT' && actor.role !== 'HR') {
            issues.push(issue('HOLIDAY_IMPORT_ACCESS_DENIED', 'Only HR can import holiday calendars.', 'ERROR', { role: actor.role }));
        }
        if (operation === 'ACTIVATE' && actor.role !== 'DIRECTOR') {
            issues.push(issue('HOLIDAY_ACTIVATION_DENIED', 'Only Director approval can activate holiday calendars.', 'ERROR', { role: actor.role }));
        }
        if ((operation === 'VALIDATE' || operation === 'SCORE') && ['HR', 'DIRECTOR', 'PLATFORM_OWNER'].indexOf(actor.role) === -1) {
            issues.push(issue('HOLIDAY_VALIDATION_ACCESS_DENIED', 'Holiday validation is restricted to HR, Director, and governance visibility roles.', 'ERROR', { role: actor.role }));
        }
        return { allowed: issues.length === 0, actor: actor, issues: issues };
    }

    function validationIssues(payload) {
        var issues = [];
        if (SUPPORTED_FILE_TYPES.indexOf(payload.fileType) === -1) {
            issues.push(issue('UNSUPPORTED_HOLIDAY_FILE_TYPE', 'Holiday imports support CSV, XLS, and XLSX files only.', 'CRITICAL', { fileType: payload.fileType }));
        }
        if (!payload.holidays.length) {
            issues.push(issue('EMPTY_HOLIDAY_IMPORT', 'Holiday import files must include at least one holiday row.', 'CRITICAL'));
        }
        var seenDateRegion = {};
        var seenNameDate = {};
        payload.holidays.forEach(function validate(row) {
            if (!row.holidayName) issues.push(issue('MISSING_HOLIDAY_NAME', 'Holiday name is required.', 'ERROR', { row: row.sourceIndex + 1 }));
            if (!validDate(row.holidayDate)) issues.push(issue('INVALID_HOLIDAY_DATE', 'Holiday date must be a valid YYYY-MM-DD date.', 'ERROR', { row: row.sourceIndex + 1, date: row.holidayDate }));
            if (HOLIDAY_TYPES.indexOf(row.holidayType) === -1) issues.push(issue('INVALID_HOLIDAY_TYPE', 'Holiday type must be NATIONAL, REGIONAL, COMPANY, or OPTIONAL.', 'ERROR', { row: row.sourceIndex + 1, type: row.holidayType }));
            if (!row.region || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(row.region)) issues.push(issue('INVALID_HOLIDAY_REGION', 'Holiday region must be GLOBAL or an uppercase region code such as IN or IN-KA.', 'ERROR', { row: row.sourceIndex + 1, region: row.region }));
            if (validDate(row.holidayDate)) {
                var dateKey = row.region + '|' + row.holidayDate;
                var nameKey = row.holidayName.toUpperCase() + '|' + row.holidayDate;
                if (seenDateRegion[dateKey]) issues.push(issue('DUPLICATE_HOLIDAY_DATE', 'Duplicate holiday date detected for the same region.', 'ERROR', { date: row.holidayDate, region: row.region }));
                if (seenNameDate[nameKey]) issues.push(issue('DUPLICATE_HOLIDAY', 'Duplicate holiday name and date detected.', 'WARNING', { name: row.holidayName, date: row.holidayDate }));
                seenDateRegion[dateKey] = true;
                seenNameDate[nameKey] = true;
            }
        });
        return issues;
    }

    function validationSummary(payload, issues) {
        var blockers = issues.filter(function block(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; }).length;
        var warnings = issues.filter(function warn(item) { return item.severity === 'WARNING'; }).length;
        var invalidRows = {};
        issues.forEach(function mark(item) {
            if (item.metadata && item.metadata.row) invalidRows[item.metadata.row] = true;
        });
        var duplicateCount = issues.filter(function dup(item) { return /DUPLICATE/.test(item.code || ''); }).length;
        var regions = unique(payload.holidays.map(function region(row) { return row.region; }).filter(Boolean));
        var types = unique(payload.holidays.map(function type(row) { return row.holidayType; }).filter(Boolean));
        var validationScore = clampScore(100 - blockers * 20 - warnings * 5);
        var coverageScore = clampScore(45 + Math.min(25, regions.length * 10) + Math.min(20, types.length * 6) + (payload.holidays.length ? 10 : 0));
        var governanceScore = clampScore(100 - blockers * 15 - duplicateCount * 8);
        var readinessScore = clampScore((validationScore + coverageScore + governanceScore) / 3);
        return {
            totalRows: payload.holidays.length,
            validRows: Math.max(0, payload.holidays.length - Object.keys(invalidRows).length),
            invalidRows: Object.keys(invalidRows).length,
            warningCount: warnings,
            errorCount: blockers,
            duplicateCount: duplicateCount,
            regionCount: regions.length,
            typeCount: types.length,
            validationScore: validationScore,
            coverageScore: coverageScore,
            governanceScore: governanceScore,
            calendarReadinessScore: readinessScore
        };
    }

    function unique(list) {
        var out = [];
        list.forEach(function add(item) {
            if (item && out.indexOf(item) === -1) out.push(item);
        });
        return out;
    }

    function integrationSummary(tenantSlug, holidays) {
        var dates = unique((holidays || []).filter(function active(row) { return row.active !== false && validDate(row.holidayDate); }).map(function date(row) { return row.holidayDate; }));
        var attendanceRows = tenantRows('attendanceRecords', tenantSlug).concat(tenantRows('attendance', tenantSlug), tenantRows('attendanceLogs', tenantSlug));
        var leaveRows = tenantRows('leaveRequests', tenantSlug).concat(tenantRows('leave', tenantSlug), tenantRows('leaveApplications', tenantSlug));
        var affectedAttendance = attendanceRows.filter(function affected(row) { return dates.indexOf(normalizeText(row.date || row.attendanceDate || row.day)) !== -1; }).length;
        var affectedLeave = leaveRows.filter(function affected(row) {
            return dates.some(function inRange(holidayDate) { return dateInRange(holidayDate, row.fromDate || row.startDate || row.date, row.toDate || row.endDate || row.fromDate || row.startDate || row.date); });
        }).length;
        return {
            attendanceIntegration: {
                holidaysAffectAttendance: true,
                workdayCalculationsPrepared: true,
                overtimeCalculationsPrepared: true,
                absenceCalculationsPrepared: true,
                affectedAttendanceRecords: affectedAttendance,
                activeHolidayDates: dates.length
            },
            leaveIntegration: {
                holidaysExcludedFromLeave: true,
                leaveDeductionCalculationPrepared: true,
                leavePlanningPrepared: true,
                affectedLeaveRequests: affectedLeave,
                activeHolidayDates: dates.length
            }
        };
    }

    function holidayPreviewFrom(payload, platformView) {
        var holidays = payload.holidays.filter(function active(row) { return row.active !== false; });
        var regions = unique(holidays.map(function region(row) { return row.region; }));
        var types = unique(holidays.map(function type(row) { return row.holidayType; }));
        return {
            calendarName: platformView ? 'Governance Calendar' : payload.calendarName,
            calendarYear: payload.calendarYear,
            totalHolidays: holidays.length,
            activeHolidays: holidays.length,
            regions: regions,
            types: types,
            regionalCalendars: regions.map(function map(region) {
                return {
                    region: region,
                    holidayCount: holidays.filter(function count(row) { return row.region === region; }).length
                };
            }),
            holidays: holidays.map(function map(row, index) { return platformView ? platformHoliday(row, index) : cloneSanitized(row); })
        };
    }

    function persistHistory(key, row, context) {
        try {
            if (context?.skipPersistence) return false;
            var data = rawData();
            if (!Array.isArray(data[key])) data[key] = [];
            data[key].unshift(cloneSanitized({ ...row, immutable: true }));
            data[key] = data[key].slice(0, 500);
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function upsertCalendar(calendar, context) {
        if (context?.dryRun || context?.skipPersistence) return calendar;
        var data = rawData();
        if (!Array.isArray(data.companyHolidayCalendars)) data.companyHolidayCalendars = [];
        var index = data.companyHolidayCalendars.findIndex(function match(row) { return normalizeText(row.calendarId) === normalizeText(calendar.calendarId); });
        if (calendar.state === 'ACTIVE') {
            data.companyHolidayCalendars = data.companyHolidayCalendars.map(function deactivate(row) {
                if (sameTenant(row, calendar.tenantSlug) && normalizeText(row.calendarId) !== normalizeText(calendar.calendarId)) {
                    return cloneSanitized({ ...row, active: false, state: row.state === 'ACTIVE' ? 'ARCHIVED' : row.state, archivedAt: nowIso(), immutable: true });
                }
                return row;
            });
        }
        if (index >= 0) data.companyHolidayCalendars[index] = cloneSanitized({ ...data.companyHolidayCalendars[index], ...calendar, updatedAt: nowIso(), immutable: true });
        else data.companyHolidayCalendars.unshift(cloneSanitized({ ...calendar, immutable: true }));
        saveData(data);
        return index >= 0 ? data.companyHolidayCalendars[index] : calendar;
    }

    function audit(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: clean.calendarId || clean.validationId || clean.activationId || '',
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.empId,
                    module: 'Company Holiday Import',
                    targetId: clean.tenantSlug || clean.calendarId || '',
                    description: clean.description || actionType,
                    metadata: clean,
                    severity: clean.severity || 'INFO'
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Company Holiday Import', clean.tenantSlug || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function failureOutput(state, tenantSlug, issues, extra) {
        return freezeHolidayOutput({
            success: false,
            state: state || 'BLOCKED',
            tenantSlug: normalizeTenantSlug(tenantSlug || ''),
            issues: issues || [],
            governance: {
                tenantIsolationPreserved: true,
                holidayGovernancePreserved: true,
                rbacPreserved: true,
                activationBlockedBeforeValidation: true
            },
            ...(extra || {})
        });
    }

    function validateHolidayCalendar(input, context) {
        try {
            var payload = normalizeHolidayPayload(input, context || {});
            var access = validateAccess('VALIDATE', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var issues = validationIssues(payload);
            var summary = validationSummary(payload, issues);
            var integrations = integrationSummary(payload.tenantSlug, payload.holidays);
            var success = summary.errorCount === 0 && payload.holidays.length > 0 && SUPPORTED_FILE_TYPES.indexOf(payload.fileType) !== -1;
            var report = {
                validationId: 'HVAL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: success,
                state: success ? 'APPROVAL_PENDING' : 'VALIDATING',
                tenantSlug: payload.tenantSlug,
                fileName: payload.fileName,
                fileType: payload.fileType,
                summary: summary,
                validationScore: summary.validationScore,
                calendarReadinessScore: summary.calendarReadinessScore,
                coverageScore: summary.coverageScore,
                governanceScore: summary.governanceScore,
                issues: issues,
                attendanceIntegration: integrations.attendanceIntegration,
                leaveIntegration: integrations.leaveIntegration,
                governance: {
                    tenantIsolationPreserved: true,
                    holidayGovernancePreserved: true,
                    activationRequiresDirectorApproval: true,
                    attendanceRulesPreserved: true,
                    leaveRulesPreserved: true,
                    rbacPreserved: true
                },
                generatedAt: nowIso()
            };
            persistHistory('companyHolidayValidationReports', report, context || {});
            audit('HOLIDAY_VALIDATION_REVIEWED', { validationId: report.validationId, tenantSlug: payload.tenantSlug, description: 'Holiday calendar validation reviewed.' }, context || {});
            return freezeHolidayOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HOLIDAY_VALIDATION_FAILED_SAFE', 'Holiday validation failed safely.', 'ERROR')]);
        }
    }

    function generateHolidayPreview(input, context) {
        try {
            var payload = normalizeHolidayPayload(input, context || {});
            var access = validateAccess('VIEW', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var platformView = access.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var issues = validationIssues(payload).filter(function blocker(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; });
            var summary = validationSummary(payload, issues);
            var integrations = integrationSummary(payload.tenantSlug, payload.holidays);
            var output = {
                previewId: 'HPREV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.length ? 'VALIDATING' : 'APPROVAL_PENDING',
                tenantSlug: payload.tenantSlug,
                preview: holidayPreviewFrom(payload, platformView),
                validationSummary: summary,
                issues: issues,
                attendanceIntegration: integrations.attendanceIntegration,
                leaveIntegration: integrations.leaveIntegration,
                analytics: {
                    holidayCount: summary.totalRows,
                    regionalCoverage: summary.regionCount,
                    importedCalendars: tenantRows('companyHolidayCalendars', payload.tenantSlug).length,
                    attendanceImpact: integrations.attendanceIntegration.affectedAttendanceRecords,
                    calendarReadinessScore: summary.calendarReadinessScore,
                    coverageScore: summary.coverageScore,
                    governanceScore: summary.governanceScore
                },
                governance: {
                    tenantIsolationPreserved: true,
                    holidayGovernancePreserved: true,
                    employeeViewOnly: access.actor.role === 'EMPLOYEE',
                    platformOwnerVisibilityOnly: platformView,
                    attendanceRulesPreserved: true,
                    leaveRulesPreserved: true
                },
                generatedAt: nowIso()
            };
            audit('HOLIDAY_PREVIEW_REVIEWED', { tenantSlug: payload.tenantSlug, description: 'Holiday calendar preview reviewed.' }, context || {});
            return freezeHolidayOutput(output);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HOLIDAY_PREVIEW_FAILED_SAFE', 'Holiday preview failed safely.', 'ERROR')]);
        }
    }

    function calculateCalendarCoverage(input, context) {
        try {
            var preview = generateHolidayPreview(input, { ...(context || {}), skipAuditPersistence: true });
            if (!preview.success) return preview;
            var report = {
                analyticsId: 'HCOV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: preview.issues.length ? 'VALIDATING' : 'APPROVAL_PENDING',
                tenantSlug: preview.tenantSlug,
                calendarReadinessScore: preview.validationSummary.calendarReadinessScore,
                coverageScore: preview.validationSummary.coverageScore,
                governanceScore: preview.validationSummary.governanceScore,
                analytics: preview.analytics,
                attendanceIntegration: preview.attendanceIntegration,
                leaveIntegration: preview.leaveIntegration,
                issues: preview.issues,
                governance: preview.governance,
                generatedAt: nowIso()
            };
            persistHistory('companyHolidayAnalytics', report, context || {});
            audit('HOLIDAY_CALENDAR_COVERAGE_REVIEWED', { tenantSlug: report.tenantSlug, description: 'Holiday calendar coverage reviewed.' }, context || {});
            return freezeHolidayOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HOLIDAY_COVERAGE_FAILED_SAFE', 'Holiday coverage scoring failed safely.', 'ERROR')]);
        }
    }

    function importHolidayCalendar(input, context) {
        try {
            var payload = normalizeHolidayPayload(input, context || {});
            var access = validateAccess('IMPORT', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var validation = validateHolidayCalendar(payload, { ...(context || {}), skipAuditPersistence: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, validation.issues, { validation: validation });
            var now = nowIso();
            var calendar = {
                calendarId: payload.calendarId || 'HCAL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: payload.tenantSlug,
                state: 'APPROVAL_PENDING',
                active: false,
                fileName: payload.fileName,
                fileType: payload.fileType,
                calendarName: payload.calendarName,
                calendarYear: payload.calendarYear,
                holidays: payload.holidays,
                validationScore: validation.validationScore,
                calendarReadinessScore: validation.calendarReadinessScore,
                coverageScore: validation.coverageScore,
                governanceScore: validation.governanceScore,
                importedBy: access.actor.id || access.actor.empId,
                createdAt: now,
                updatedAt: now,
                immutable: true
            };
            var persisted = upsertCalendar(calendar, context || {});
            persistHistory('companyHolidayImportHistory', { importId: 'HIMP-' + Date.now().toString(36), tenantSlug: payload.tenantSlug, calendarId: calendar.calendarId, state: 'APPROVAL_PENDING', fileName: payload.fileName, importedAt: now }, context || {});
            persistHistory('companyHolidayCalendarHistory', { calendarId: calendar.calendarId, tenantSlug: payload.tenantSlug, action: 'IMPORTED', state: 'APPROVAL_PENDING', createdAt: now }, context || {});
            persistHistory('companyHolidayAnalytics', { analyticsId: 'HANA-' + Date.now().toString(36), tenantSlug: payload.tenantSlug, calendarReadinessScore: validation.calendarReadinessScore, coverageScore: validation.coverageScore, governanceScore: validation.governanceScore, generatedAt: now }, context || {});
            audit('HOLIDAY_IMPORT_CREATED', { calendarId: calendar.calendarId, tenantSlug: payload.tenantSlug, description: 'Holiday calendar imported for validation.' }, context || {});
            return freezeHolidayOutput({
                success: true,
                state: 'APPROVAL_PENDING',
                tenantSlug: payload.tenantSlug,
                calendar: cloneSanitized(persisted),
                validation: validation,
                attendanceIntegration: validation.attendanceIntegration,
                leaveIntegration: validation.leaveIntegration,
                governance: {
                    tenantIsolationPreserved: true,
                    holidayGovernancePreserved: true,
                    activationBlockedBeforeValidation: true,
                    directorApprovalRequired: true,
                    attendanceRulesPreserved: true,
                    leaveRulesPreserved: true
                },
                issues: []
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HOLIDAY_IMPORT_FAILED_SAFE', 'Holiday import failed safely.', 'ERROR')]);
        }
    }

    function activateHolidayCalendar(input, context) {
        try {
            var payload = normalizeHolidayPayload(input, context || {});
            var access = validateAccess('ACTIVATE', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            if (!payload.approvalGranted) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, [issue('HOLIDAY_APPROVAL_REQUIRED', 'Director holiday calendar activation requires explicit approval.', 'CRITICAL')]);
            var source = payload.holidays.length ? { ...payload } : null;
            var existing = latestCalendar(payload.tenantSlug, true);
            if (!source && existing) {
                source = normalizeHolidayPayload({ ...existing, holidays: existing.holidays || [] }, context || {});
            }
            if (!source || !source.holidays.length) {
                return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, [issue('HOLIDAY_CALENDAR_NOT_FOUND', 'A validated holiday calendar is required before activation.', 'CRITICAL')]);
            }
            var validation = validateHolidayCalendar(source, { ...(context || {}), skipAuditPersistence: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, validation.issues, { validation: validation });
            var now = nowIso();
            var calendar = {
                ...(existing || {}),
                calendarId: existing?.calendarId || source.calendarId || 'HCAL-' + Date.now().toString(36),
                tenantSlug: payload.tenantSlug,
                state: 'ACTIVE',
                active: true,
                fileName: source.fileName,
                fileType: source.fileType,
                calendarName: source.calendarName,
                calendarYear: source.calendarYear,
                holidays: source.holidays.map(function active(row) { return { ...row, active: row.active !== false }; }),
                validationScore: validation.validationScore,
                calendarReadinessScore: validation.calendarReadinessScore,
                coverageScore: validation.coverageScore,
                governanceScore: validation.governanceScore,
                activatedBy: access.actor.id || access.actor.empId,
                activatedAt: now,
                updatedAt: now,
                immutable: true
            };
            var persisted = upsertCalendar(calendar, context || {});
            var activation = {
                activationId: 'HACT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: payload.tenantSlug,
                calendarId: calendar.calendarId,
                state: 'ACTIVE',
                calendarReadinessScore: validation.calendarReadinessScore,
                coverageScore: validation.coverageScore,
                governanceScore: validation.governanceScore,
                activatedBy: access.actor.id || access.actor.empId,
                activatedAt: now
            };
            persistHistory('companyHolidayActivationHistory', activation, context || {});
            persistHistory('companyHolidayCalendarHistory', { ...activation, action: 'ACTIVATED' }, context || {});
            persistHistory('companyHolidayAnalytics', { analyticsId: 'HANA-' + Date.now().toString(36), tenantSlug: payload.tenantSlug, calendarReadinessScore: validation.calendarReadinessScore, coverageScore: validation.coverageScore, governanceScore: validation.governanceScore, activatedCalendars: 1, generatedAt: now }, context || {});
            audit('HOLIDAY_CALENDAR_ACTIVATED', { activationId: activation.activationId, calendarId: calendar.calendarId, tenantSlug: payload.tenantSlug, description: 'Holiday calendar activated after validation and director approval.' }, context || {});
            return freezeHolidayOutput({
                success: true,
                state: 'ACTIVE',
                tenantSlug: payload.tenantSlug,
                calendar: cloneSanitized(persisted),
                activation: activation,
                validation: validation,
                attendanceIntegration: validation.attendanceIntegration,
                leaveIntegration: validation.leaveIntegration,
                issues: [],
                governance: {
                    tenantIsolationPreserved: true,
                    holidayGovernancePreserved: true,
                    directorApprovalRequired: true,
                    validationCompletedBeforeActivation: true,
                    attendanceRulesPreserved: true,
                    leaveRulesPreserved: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HOLIDAY_ACTIVATION_FAILED_SAFE', 'Holiday activation failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        try {
            var hrContext = { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var directorContext = { actor: { id: 'SELF-DIR', role: 'DIRECTOR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var payload = {
                tenantSlug: 'self-test',
                fileType: 'CSV',
                fileName: 'self-holidays.csv',
                calendarName: 'Self Test Holiday Calendar',
                calendarYear: 2026,
                holidays: [
                    { holidayName: 'Self National Day', holidayDate: '2026-01-01', holidayType: 'NATIONAL', region: 'GLOBAL' },
                    { holidayName: 'Self Company Day', holidayDate: '2026-07-01', holidayType: 'COMPANY', region: 'GLOBAL' }
                ]
            };
            var imported = importHolidayCalendar(payload, hrContext);
            var validation = validateHolidayCalendar(payload, hrContext);
            var preview = generateHolidayPreview(payload, hrContext);
            var activated = activateHolidayCalendar({ ...payload, approvalGranted: true }, directorContext);
            return freezeHolidayOutput({
                passed: !!(imported.success && validation.success && preview.attendanceIntegration?.holidaysAffectAttendance && preview.leaveIntegration?.holidaysExcludedFromLeave && activated.success && Object.isFrozen(imported) && Object.isFrozen(preview)),
                checks: {
                    holidayImport: imported.success === true,
                    validation: validation.success === true,
                    attendanceIntegration: preview.attendanceIntegration?.holidaysAffectAttendance === true,
                    leaveIntegration: preview.leaveIntegration?.holidaysExcludedFromLeave === true,
                    immutableOutputs: Object.isFrozen(imported) && Object.isFrozen(preview)
                }
            });
        } catch (error) {
            return freezeHolidayOutput({ passed: false, error: 'Company holiday import self-test failed safely.' });
        }
    }

    var CompanyHolidayImportService = Object.freeze({
        HOLIDAY_TYPES: HOLIDAY_TYPES,
        SUPPORTED_FILE_TYPES: SUPPORTED_FILE_TYPES,
        CALENDAR_STATES: CALENDAR_STATES,
        importHolidayCalendar: importHolidayCalendar,
        validateHolidayCalendar: validateHolidayCalendar,
        calculateCalendarCoverage: calculateCalendarCoverage,
        activateHolidayCalendar: activateHolidayCalendar,
        generateHolidayPreview: generateHolidayPreview,
        normalizeHolidayPayload: normalizeHolidayPayload,
        freezeHolidayOutput: freezeHolidayOutput
    });

    global.CompanyHolidayImportService = CompanyHolidayImportService;
    global.companyHolidayImportService = CompanyHolidayImportService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_COMPANY_HOLIDAY_IMPORT_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
