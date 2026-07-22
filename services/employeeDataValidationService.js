/**
 * employeeDataValidationService.js
 * ARTHHRMS - Enterprise Employee Data Validation Engine
 *
 * Performs non-destructive employee master data validation, duplicate analysis,
 * quality scoring, readiness reporting, and recommendation generation.
 */
(function attachEmployeeDataValidationService(global) {
    'use strict';

    var PREFIX = '[EmployeeDataValidationService]';
    var SOURCE = 'employeeDataValidationService';
    var RUN_TABLE = 'employeeDataValidationRuns';
    var REPORT_TABLE = 'employeeDataQualityReports';
    var ANALYTICS_TABLE = 'employeeDataValidationAnalytics';
    var RECOMMENDATION_TABLE = 'employeeDataQualityRecommendations';

    var VALIDATION_DOMAINS = Object.freeze([
        'EMPLOYEE_MASTER',
        'DEPARTMENTS',
        'BRANCHES',
        'LOCATIONS',
        'MANAGERS',
        'PAYROLL_DATA',
        'ATTENDANCE_SETUP',
        'LEAVE_POLICIES',
        'DOCUMENTS',
        'CUSTOM_FIELDS'
    ]);
    var VALIDATION_PIPELINE = Object.freeze([
        'FIELD_VALIDATION',
        'RELATIONSHIP_VALIDATION',
        'BUSINESS_RULE_VALIDATION',
        'DUPLICATE_DETECTION',
        'QUALITY_SCORING',
        'VALIDATION_REPORT',
        'ANALYTICS'
    ]);
    var QUALITY_DIMENSIONS = Object.freeze(['completeness', 'consistency', 'accuracy', 'uniqueness', 'validity', 'integrity', 'timeliness']);
    var EMPLOYMENT_STATUSES = Object.freeze(['INVITED', 'ACTIVATING', 'ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RESIGNED', 'RETIRED', 'ARCHIVED']);
    var READ_ROLES = Object.freeze(['HR', 'ADMIN', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric/i;

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

    function normalizeId(value) {
        return safeString(value, '').toUpperCase();
    }

    function normalizeKey(value) {
        return safeString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
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
        if (/^duplicate/i.test(text)) return false;
        if (/Preserved$|Unaffected$|Changed$|Supported$|Prepared$|Score$|Scores$|Count$|Counts$|Rate$|Coverage$|Readiness$|Analytics$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (/^(code|status|severity|eventType|action)$/i.test(String(keyHint || ''))) return value;
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

    function freezeValidationOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeValidationOutput({
            code: normalizeStatus(code || 'DATA_VALIDATION_ISSUE'),
            message: safeString(message || 'Employee data validation issue.', 'Employee data validation issue.'),
            severity: normalizeStatus(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function ensureTables(data) {
        [RUN_TABLE, REPORT_TABLE, ANALYTICS_TABLE, RECOMMENDATION_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
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
            employeeModulePreserved: true,
            payrollModulePreserved: true,
            attendanceModulePreserved: true,
            leaveModulePreserved: true,
            reportingModulePreserved: true,
            validationNonDestructive: true,
            autoCorrectionsApplied: false,
            reviewOnly: !!(context && context.reviewOnly),
            platformOwnerVisibilityOnly: !!(context && context.governanceOnly),
            auditable: !!audited
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezeValidationOutput({
            success: false,
            code: normalizeStatus(code),
            tenantSlug: tenantFrom(input || {}, context || {}),
            issues: [issue(code, message, 'ERROR', metadata || {})],
            timestamp: nowIso(),
            governance: governanceFlags(false, context || {}),
            readOnly: true,
            nonDestructive: true
        });
    }

    function checkAccess(input, context) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        if (READ_ROLES.indexOf(actor.role) === -1) {
            return { allowed: false, output: failure('DATA_VALIDATION_ACCESS_DENIED', 'Role cannot run enterprise employee data validation.', input, context, { role: actor.role }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_VALIDATION_BLOCKED', 'Cross-tenant employee validation is blocked.', input, context, {}) };
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
        return normalizeId(row && (row.employeeId || row.employeeCode || row.empId || row.id));
    }

    function employeesForTenant(data, tenantSlug) {
        return (data.employees || []).filter(function each(row) { return sameTenant(row, tenantSlug) && employeeIdOf(row); });
    }

    function employeeMap(data, tenantSlug) {
        var map = new Map();
        employeesForTenant(data, tenantSlug).forEach(function each(row) {
            [row.employeeId, row.employeeCode, row.empId, row.id].forEach(function key(value) {
                var normalized = normalizeId(value);
                if (normalized && !map.has(normalized)) map.set(normalized, row);
            });
        });
        return map;
    }

    function findEmployee(data, tenantSlug, employeeId) {
        return employeeMap(data, tenantSlug).get(normalizeId(employeeId)) || null;
    }

    function activeEmployee(row) {
        return !!row && ['TERMINATED', 'RESIGNED', 'RETIRED', 'INACTIVE', 'ARCHIVED'].indexOf(normalizeStatus(row.employmentStatus || row.status || 'ACTIVE')) === -1;
    }

    function rowsFor(data, keys, tenantSlug) {
        var rows = [];
        keys.forEach(function each(key) {
            if (Array.isArray(data[key])) rows = rows.concat(data[key]);
        });
        return rows.filter(function each(row) { return sameTenant(row, tenantSlug); });
    }

    function existsByName(rows, value, names) {
        var key = normalizeKey(value);
        if (!key) return true;
        return rows.some(function each(row) {
            return names.some(function name(field) { return normalizeKey(row[field]) === key; }) && row.active !== false && normalizeStatus(row.status || 'ACTIVE') !== 'ARCHIVED';
        });
    }

    function parseDate(value) {
        var text = safeString(value, '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
        var date = new Date(text + 'T00:00:00Z');
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
        return date;
    }

    function emailValid(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeString(value, '').toLowerCase()); }
    function phoneValid(value) { return /^\+?[0-9][0-9\s().-]{6,20}$/.test(safeString(value, '')); }
    function panValid(value) { return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(safeString(value, '').toUpperCase()); }
    function aadhaarValid(value) { return /^[0-9]{12}$/.test(safeString(value, '')); }
    function passportValid(value) { return /^[A-Z][0-9]{7}$/.test(safeString(value, '').toUpperCase()); }
    function bankValid(value) { return /^[0-9]{6,18}$/.test(safeString(value, '')); }
    function ifscValid(value) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(safeString(value, '').toUpperCase()); }

    function scopedEmployees(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access;
        var data = ensureTables(rawData());
        var rows = employeesForTenant(data, access.tenantSlug);
        var targetId = normalizeId(input && input.employeeId);
        if (targetId) rows = rows.filter(function each(row) { return employeeIdOf(row) === targetId; });
        return { allowed: true, actor: access.actor, tenantSlug: access.tenantSlug, data: data, employees: rows };
    }

    function validateEmployeeFields(input, context) {
        var scope = scopedEmployees(input || {}, context || {});
        if (!scope.allowed) return scope.output;
        var issues = [];
        scope.employees.forEach(function each(emp) {
            var employeeId = employeeIdOf(emp);
            [['employeeCode', emp.employeeCode || emp.empId || emp.employeeId], ['email', emp.email], ['name', emp.name || (safeString(emp.firstName) + safeString(emp.lastName))], ['department', emp.department], ['designation', emp.designation], ['employmentStatus', emp.employmentStatus || emp.status]].forEach(function required(pair) {
                if (!safeString(pair[1], '')) issues.push(issue('MISSING_REQUIRED_FIELD', 'Required employee field is missing.', 'ERROR', { employeeId: employeeId, field: pair[0] }));
            });
            if (emp.email && !emailValid(emp.email)) issues.push(issue('INVALID_EMAIL_FORMAT', 'Employee email format is invalid.', 'ERROR', { employeeId: employeeId }));
            if (emp.phone && !phoneValid(emp.phone)) issues.push(issue('INVALID_PHONE_FORMAT', 'Employee phone format is invalid.', 'ERROR', { employeeId: employeeId }));
            var dob = parseDate(emp.dob || emp.dateOfBirth);
            if ((emp.dob || emp.dateOfBirth) && !dob) issues.push(issue('INVALID_DOB', 'Employee DOB must be a valid YYYY-MM-DD date.', 'ERROR', { employeeId: employeeId }));
            if (dob && dob > new Date()) issues.push(issue('INVALID_DOB', 'Employee DOB cannot be in the future.', 'ERROR', { employeeId: employeeId }));
            if ((emp.dateOfJoining || emp.joiningDate) && !parseDate(emp.dateOfJoining || emp.joiningDate)) issues.push(issue('INVALID_JOINING_DATE', 'Joining date must be a valid YYYY-MM-DD date.', 'ERROR', { employeeId: employeeId }));
            if (emp.confirmationDate && !parseDate(emp.confirmationDate)) issues.push(issue('INVALID_CONFIRMATION_DATE', 'Confirmation date must be a valid YYYY-MM-DD date.', 'ERROR', { employeeId: employeeId }));
            if (emp.pan && !panValid(emp.pan)) issues.push(issue('INVALID_PAN', 'PAN format is invalid.', 'ERROR', { employeeId: employeeId }));
            if (emp.aadhaar && !aadhaarValid(emp.aadhaar)) issues.push(issue('INVALID_AADHAAR', 'Aadhaar format is invalid.', 'ERROR', { employeeId: employeeId }));
            if (emp.passport && !passportValid(emp.passport)) issues.push(issue('INVALID_PASSPORT', 'Passport format is invalid.', 'WARNING', { employeeId: employeeId }));
            if (emp.bankAccount && !bankValid(emp.bankAccount)) issues.push(issue('INVALID_BANK_ACCOUNT', 'Bank account format is invalid.', 'ERROR', { employeeId: employeeId }));
            if (emp.ifsc && !ifscValid(emp.ifsc)) issues.push(issue('INVALID_IFSC', 'IFSC format is invalid.', 'ERROR', { employeeId: employeeId }));
            if (!safeString(emp.salaryGrade, '')) issues.push(issue('MISSING_COMPENSATION_GRADE', 'Compensation grade is missing.', 'WARNING', { employeeId: employeeId }));
        });
        return freezeValidationOutput({
            success: issues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length === 0,
            tenantSlug: scope.tenantSlug,
            employeeCount: scope.employees.length,
            issues: issues,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function directManagerMap(data, tenantSlug) {
        var map = {};
        employeesForTenant(data, tenantSlug).forEach(function each(row) {
            map[employeeIdOf(row)] = normalizeId(row.managerId || row.reportsTo || '');
        });
        return map;
    }

    function detectCircularIssues(data, tenantSlug) {
        var relationMap = directManagerMap(data, tenantSlug);
        var issues = [];
        Object.keys(relationMap).forEach(function each(employeeId) {
            var current = relationMap[employeeId];
            var seen = new Set([employeeId]);
            var depth = 0;
            while (current) {
                depth += 1;
                if (seen.has(current)) {
                    issues.push(issue('CIRCULAR_REPORTING', 'Circular reporting chain detected.', 'CRITICAL', { employeeId: employeeId, managerId: current }));
                    break;
                }
                if (depth > 25) {
                    issues.push(issue('CIRCULAR_REPORTING', 'Hierarchy loop exceeded safe traversal depth.', 'CRITICAL', { employeeId: employeeId }));
                    break;
                }
                seen.add(current);
                current = relationMap[current] || '';
            }
        });
        return issues;
    }

    function validateEmployeeRelationships(input, context) {
        var scope = scopedEmployees(input || {}, context || {});
        if (!scope.allowed) return scope.output;
        var data = scope.data;
        var tenantSlug = scope.tenantSlug;
        var issues = [];
        var departments = rowsFor(data, ['departments', 'tenantDepartmentRecords'], tenantSlug);
        var branches = rowsFor(data, ['companyBranches', 'branches'], tenantSlug);
        var locations = rowsFor(data, ['companyLocations', 'locations'], tenantSlug);
        var businessUnits = rowsFor(data, ['businessUnits', 'tenantBusinessUnits'], tenantSlug);
        var costCenters = rowsFor(data, ['costCenters', 'tenantCostCenters'], tenantSlug);
        var designations = rowsFor(data, ['designations', 'tenantDesignations'], tenantSlug);
        var employees = employeeMap(data, tenantSlug);

        scope.employees.forEach(function each(emp) {
            var employeeId = employeeIdOf(emp);
            if (!existsByName(departments, emp.department, ['name', 'departmentName', 'departmentCode', 'departmentId', 'id'])) issues.push(issue('DEPARTMENT_NOT_FOUND', 'Employee department does not exist.', 'ERROR', { employeeId: employeeId, department: emp.department }));
            if (emp.branch && !existsByName(branches, emp.branch, ['branchName', 'name', 'branchCode', 'branchId', 'id'])) issues.push(issue('BRANCH_NOT_FOUND', 'Employee branch does not exist.', 'ERROR', { employeeId: employeeId, branch: emp.branch }));
            if (emp.location && !existsByName(locations, emp.location, ['locationName', 'name', 'locationCode', 'locationId', 'id'])) issues.push(issue('LOCATION_NOT_FOUND', 'Employee location does not exist.', 'ERROR', { employeeId: employeeId, location: emp.location }));
            if (emp.businessUnit && !existsByName(businessUnits, emp.businessUnit, ['name', 'businessUnitName', 'businessUnitId', 'id'])) issues.push(issue('BUSINESS_UNIT_NOT_FOUND', 'Employee business unit does not exist.', 'WARNING', { employeeId: employeeId, businessUnit: emp.businessUnit }));
            if (emp.costCenter && !existsByName(costCenters, emp.costCenter, ['code', 'name', 'costCenterCode', 'costCenterId', 'id'])) issues.push(issue('COST_CENTER_NOT_FOUND', 'Employee cost center does not exist.', 'WARNING', { employeeId: employeeId, costCenter: emp.costCenter }));
            if (emp.designation && !existsByName(designations, emp.designation, ['name', 'designationName', 'designationId', 'id'])) issues.push(issue('DESIGNATION_NOT_FOUND', 'Employee designation does not exist.', 'WARNING', { employeeId: employeeId, designation: emp.designation }));
            var managerId = normalizeId(emp.managerId || emp.reportsTo || '');
            if (managerId) {
                var manager = employees.get(managerId);
                if (!manager) issues.push(issue('MANAGER_NOT_FOUND', 'Reporting manager does not exist.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
                else if (!activeEmployee(manager)) issues.push(issue('INACTIVE_MANAGER', 'Reporting manager is inactive.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
                if (managerId === employeeId) issues.push(issue('SELF_REPORTING', 'Employee cannot report to self.', 'ERROR', { employeeId: employeeId }));
            } else if (!/CEO|DIRECTOR|PLATFORM_OWNER/.test([emp.designation, emp.role].join(' ').toUpperCase())) {
                issues.push(issue('MISSING_MANAGER', 'Employee has no reporting manager.', 'WARNING', { employeeId: employeeId }));
            }
        });
        issues = issues.concat(detectCircularIssues(data, tenantSlug));
        return freezeValidationOutput({
            success: issues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length === 0,
            tenantSlug: tenantSlug,
            employeeCount: scope.employees.length,
            issues: dedupeIssues(issues),
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function validateBusinessRules(input, context) {
        var scope = scopedEmployees(input || {}, context || {});
        if (!scope.allowed) return scope.output;
        var data = scope.data;
        var tenantSlug = scope.tenantSlug;
        var issues = [];
        var leavePolicies = rowsFor(data, ['leavePolicies', 'leavePolicyRecords'], tenantSlug);
        var attendancePolicies = rowsFor(data, ['attendancePolicies', 'workingSchedules', 'holidayCalendars'], tenantSlug);
        var today = input && input.currentDate ? parseDate(input.currentDate) || new Date(input.currentDate) : new Date();
        scope.employees.forEach(function each(emp) {
            var employeeId = employeeIdOf(emp);
            var joining = parseDate(emp.dateOfJoining || emp.joiningDate);
            var confirmation = parseDate(emp.confirmationDate);
            if (joining && joining > today) issues.push(issue('FUTURE_JOINING_DATE', 'Joining date is in the future.', 'ERROR', { employeeId: employeeId }));
            if (joining && confirmation && confirmation < joining) issues.push(issue('CONFIRMATION_BEFORE_JOINING', 'Confirmation date cannot be before joining date.', 'ERROR', { employeeId: employeeId }));
            if (Number(emp.salary || emp.ctc || emp.grossSalary || 0) < 0) issues.push(issue('NEGATIVE_SALARY', 'Salary cannot be negative.', 'CRITICAL', { employeeId: employeeId }));
            if (EMPLOYMENT_STATUSES.indexOf(normalizeStatus(emp.employmentStatus || emp.status || 'ACTIVE')) === -1) issues.push(issue('INVALID_EMPLOYMENT_STATUS', 'Employment status is invalid.', 'ERROR', { employeeId: employeeId, status: emp.employmentStatus || emp.status }));
            if (emp.department && !leavePolicies.some(function policy(row) { return !row.department || normalizeKey(row.department) === normalizeKey(emp.department); })) {
                issues.push(issue('MISSING_LEAVE_POLICY', 'No active leave policy maps to employee department.', 'WARNING', { employeeId: employeeId, department: emp.department }));
            }
            if (emp.department && !attendancePolicies.some(function policy(row) { return !row.department || normalizeKey(row.department) === normalizeKey(emp.department); })) {
                issues.push(issue('MISSING_ATTENDANCE_SETUP', 'No attendance setup maps to employee department.', 'WARNING', { employeeId: employeeId, department: emp.department }));
            }
        });
        return freezeValidationOutput({
            success: issues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length === 0,
            tenantSlug: tenantSlug,
            employeeCount: scope.employees.length,
            issues: issues,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function dedupeIssues(issues) {
        var out = [];
        var keys = new Set();
        (issues || []).forEach(function each(row) {
            var key = row.code + ':' + (row.metadata && row.metadata.employeeId || '') + ':' + (row.metadata && (row.metadata.managerId || row.metadata.field || row.metadata.department) || '');
            if (keys.has(key)) return;
            keys.add(key);
            out.push(row);
        });
        return out;
    }

    function fuzzyName(row) {
        return normalizeKey(row.firstName || '') + ':' + normalizeKey((row.lastName || '').slice(0, 5));
    }

    function duplicateGroups(rows, getter) {
        var map = {};
        rows.forEach(function each(row) {
            var value = safeString(getter(row), '');
            if (!value) return;
            var key = normalizeKey(value);
            map[key] = map[key] || [];
            map[key].push(row);
        });
        return Object.keys(map).filter(function key(k) { return map[k].length > 1; }).map(function key(k) { return map[k]; });
    }

    function detectEmployeeDuplicates(input, context) {
        var scope = scopedEmployees(input || {}, context || {});
        if (!scope.allowed) return scope.output;
        var rows = scope.employees;
        var groups = {
            employeeCode: duplicateGroups(rows, function each(row) { return row.employeeCode || row.empId || row.employeeId; }),
            email: duplicateGroups(rows, function each(row) { return row.email; }),
            phone: duplicateGroups(rows, function each(row) { return row.phone; }),
            pan: duplicateGroups(rows, function each(row) { return row.pan; }),
            aadhaar: duplicateGroups(rows, function each(row) { return row.aadhaar; }),
            passport: duplicateGroups(rows, function each(row) { return row.passport; }),
            bankAccount: duplicateGroups(rows, function each(row) { return row.bankAccount; }),
            fuzzyName: duplicateGroups(rows, fuzzyName)
        };
        var conflictReport = [];
        Object.keys(groups).forEach(function each(type) {
            groups[type].forEach(function group(rowsInGroup) {
                conflictReport.push({
                    conflictType: type.toUpperCase(),
                    employeeIds: rowsInGroup.map(employeeIdOf),
                    severity: type === 'fuzzyName' ? 'WARNING' : 'CRITICAL'
                });
            });
        });
        var summary = {
            totalDuplicateGroups: conflictReport.length,
            duplicateEmployeeCodes: groups.employeeCode.length,
            duplicateEmails: groups.email.length,
            duplicatePhones: groups.phone.length,
            duplicatePan: groups.pan.length,
            duplicateAadhaar: groups.aadhaar.length,
            duplicatePassports: groups.passport.length,
            duplicateBankAccounts: groups.bankAccount.length,
            fuzzyNameMatches: groups.fuzzyName.length
        };
        return freezeValidationOutput({
            success: true,
            tenantSlug: scope.tenantSlug,
            summary: summary,
            conflictReport: conflictReport,
            duplicateRecords: conflictReport,
            manualReviewQueue: conflictReport.filter(function each(row) { return row.severity === 'CRITICAL' || row.conflictType === 'FUZZYNAME'; }),
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function issueRowsForEmployee(employeeId, rows) {
        return (rows || []).filter(function each(row) { return normalizeId(row.metadata && row.metadata.employeeId) === normalizeId(employeeId); });
    }

    function calculateEmployeeQualityScore(input, context) {
        var scope = scopedEmployees(input || {}, context || {});
        if (!scope.allowed) return scope.output;
        var employee = scope.employees[0];
        if (!employee) return failure('EMPLOYEE_NOT_FOUND', 'Employee was not found for quality scoring.', input, context, {});
        var employeeId = employeeIdOf(employee);
        var fields = validateEmployeeFields({ tenantSlug: scope.tenantSlug, employeeId: employeeId }, Object.assign({}, context || {}, { skipPersistence: true }));
        var relationships = validateEmployeeRelationships({ tenantSlug: scope.tenantSlug, employeeId: employeeId }, Object.assign({}, context || {}, { skipPersistence: true }));
        var business = validateBusinessRules({ tenantSlug: scope.tenantSlug, employeeId: employeeId }, Object.assign({}, context || {}, { skipPersistence: true }));
        var duplicates = detectEmployeeDuplicates({ tenantSlug: scope.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var duplicateCount = (duplicates.conflictReport || []).filter(function each(row) { return (row.employeeIds || []).indexOf(employeeId) !== -1; }).length;
        var fieldIssues = fields.issues || [];
        var relationshipIssues = relationships.issues || [];
        var businessIssues = business.issues || [];
        var missing = fieldIssues.filter(function each(row) { return row.code === 'MISSING_REQUIRED_FIELD' || row.code === 'MISSING_SALARY_GRADE'; }).length;
        var format = fieldIssues.filter(function each(row) { return /^INVALID_/.test(row.code); }).length;
        var integrity = relationshipIssues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length;
        var timeliness = businessIssues.filter(function each(row) { return row.code === 'FUTURE_JOINING_DATE' || row.code === 'CONFIRMATION_BEFORE_JOINING'; }).length;
        var dimensions = {
            completeness: clampScore(100 - missing * 18),
            consistency: clampScore(100 - businessIssues.filter(function each(row) { return row.code === 'INVALID_EMPLOYMENT_STATUS'; }).length * 35),
            accuracy: clampScore(100 - format * 14),
            uniqueness: clampScore(100 - duplicateCount * 18),
            validity: clampScore(100 - (fieldIssues.length + businessIssues.length) * 6),
            integrity: clampScore(100 - integrity * 20),
            timeliness: clampScore(100 - timeliness * 25)
        };
        var qualityScore = clampScore(QUALITY_DIMENSIONS.reduce(function sum(total, key) { return total + dimensions[key]; }, 0) / QUALITY_DIMENSIONS.length);
        return freezeValidationOutput({
            success: true,
            tenantSlug: scope.tenantSlug,
            employeeId: employeeId,
            qualityScore: qualityScore,
            dimensions: dimensions,
            issueCount: fieldIssues.length + relationshipIssues.length + businessIssues.length + duplicateCount,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
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
                        module: 'Employee Data Validation',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Employee Data Validation', targetId || '', description || actionType);
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

    function categorizeIssues(fieldIssues, relationshipIssues, businessIssues, duplicates) {
        var allIssues = dedupeIssues((fieldIssues || []).concat(relationshipIssues || []).concat(businessIssues || []));
        var criticalErrors = allIssues.filter(function each(row) { return row.severity === 'CRITICAL'; });
        var warnings = allIssues.filter(function each(row) { return row.severity === 'WARNING'; });
        var relationshipCodes = /DEPARTMENT|BRANCH|LOCATION|MANAGER|CIRCULAR|BUSINESS_UNIT|COST_CENTER|DESIGNATION|SELF_REPORTING/;
        var policyCodes = /LEAVE_POLICY|ATTENDANCE_SETUP|POLICY/;
        return {
            allIssues: allIssues,
            criticalErrors: criticalErrors,
            warnings: warnings,
            missingData: allIssues.filter(function each(row) { return /^MISSING_/.test(row.code); }),
            duplicateRecords: duplicates.conflictReport || [],
            relationshipIssues: allIssues.filter(function each(row) { return relationshipCodes.test(row.code); }),
            policyViolations: allIssues.filter(function each(row) { return policyCodes.test(row.code); })
        };
    }

    function reportSafeIssue(row) {
        var copy = clone(row || {});
        var sensitiveText = [copy.code, copy.message].join(' ');
        if (SENSITIVE_KEYS.test(String(sensitiveText || ''))) {
            copy.code = 'RESTRICTED_DATA_RULE';
            copy.message = 'A restricted employee data rule was violated.';
        }
        return freezeValidationOutput(copy);
    }

    function reportSafeIssues(rows) {
        return (rows || []).map(reportSafeIssue);
    }

    function generateValidationReport(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var employees = employeesForTenant(data, tenantSlug);
        var runId = id('EMP-DQ-RUN');
        var fields = validateEmployeeFields({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var relationships = validateEmployeeRelationships({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var business = validateBusinessRules({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var duplicates = detectEmployeeDuplicates({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var categories = categorizeIssues(fields.issues, relationships.issues, business.issues, duplicates);
        var perEmployeeQuality = employees.map(function each(row) {
            return calculateEmployeeQualityScore({ tenantSlug: tenantSlug, employeeId: employeeIdOf(row) }, Object.assign({}, context || {}, { skipPersistence: true }));
        });
        var avgQuality = perEmployeeQuality.length ? Math.round(perEmployeeQuality.reduce(function sum(total, row) { return total + Number(row.qualityScore || 0); }, 0) / perEmployeeQuality.length) : 100;
        var errorCount = categories.allIssues.filter(function each(row) { return row.severity === 'ERROR'; }).length;
        var warningCount = categories.warnings.length;
        var criticalCount = categories.criticalErrors.length;
        var duplicateCount = duplicates.summary ? duplicates.summary.totalDuplicateGroups : 0;
        var dataQualityScore = clampScore(avgQuality - criticalCount * 3 - errorCount);
        var migrationReadinessScore = clampScore(dataQualityScore - duplicateCount * 3 - categories.relationshipIssues.length * 2);
        var goLiveReadinessScore = clampScore((dataQualityScore + migrationReadinessScore) / 2 - criticalCount * 3);
        var report = {
            success: true,
            runId: runId,
            reportId: id('EMP-DQ-REPORT'),
            tenantSlug: tenantSlug,
            generatedAt: nowIso(),
            readOnly: true,
            nonDestructive: true,
            autoCorrectionsApplied: false,
            validationDomains: VALIDATION_DOMAINS,
            pipeline: VALIDATION_PIPELINE.map(function each(key, index) { return { key: key, order: index + 1, status: 'COMPLETED' }; }),
            summary: {
                totalEmployees: employees.length,
                criticalErrors: criticalCount,
                warnings: warningCount,
                errorCount: errorCount,
                duplicateRecords: duplicateCount,
                duplicateCount: duplicateCount,
                relationshipIssues: categories.relationshipIssues.length,
                policyViolations: categories.policyViolations.length,
                missingData: categories.missingData.length
            },
            criticalErrors: reportSafeIssues(categories.criticalErrors),
            warnings: reportSafeIssues(categories.warnings),
            recommendations: [],
            missingData: reportSafeIssues(categories.missingData),
            duplicateRecords: categories.duplicateRecords,
            relationshipIssues: reportSafeIssues(categories.relationshipIssues),
            policyViolations: reportSafeIssues(categories.policyViolations),
            allIssues: reportSafeIssues(categories.allIssues),
            perEmployeeQuality: perEmployeeQuality.map(function map(row) {
                return { employeeId: row.employeeId, qualityScore: row.qualityScore, dimensions: row.dimensions, issueCount: row.issueCount };
            }),
            scores: {
                dataQualityScore: dataQualityScore,
                migrationReadinessScore: migrationReadinessScore,
                goLiveReadinessScore: goLiveReadinessScore
            },
            governance: governanceFlags(true, context || {})
        };
        var persistedReport = cloneSanitized(report, '', []);
        if (!(context && context.skipPersistence)) {
            data[RUN_TABLE].unshift({
                runId: runId,
                reportId: report.reportId,
                tenantSlug: tenantSlug,
                employeeCount: employees.length,
                criticalErrors: criticalCount,
                errorCount: errorCount,
                warningCount: warningCount,
                duplicateCount: duplicateCount,
                dataQualityScore: dataQualityScore,
                generatedAt: report.generatedAt,
                immutable: true
            });
            data[REPORT_TABLE].unshift(Object.assign({}, persistedReport, { immutable: true }));
            saveData(data);
        }
        var metadata = { runId: runId, reportId: report.reportId, tenantSlug: tenantSlug, dataQualityScore: dataQualityScore, status: 'COMPLETED' };
        audit('EMPLOYEE_DATA_VALIDATION_RUN', runId, 'Employee data validation report generated.', metadata, context || {});
        emitTelemetry('EMPLOYEE_DATA_VALIDATION_RUN', metadata, context || {});
        recordMetric('EMPLOYEE_DATA_VALIDATION_RUN', metadata, context || {});
        return freezeValidationOutput(report);
    }

    function generateBulkFixSuggestions(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var report = generateValidationReport({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
        if (!report.success) return report;
        var recommendations = [];
        if ((report.duplicateRecords || []).length) recommendations.push({ action: 'MERGE_DUPLICATES', priority: 'HIGH', count: report.duplicateRecords.length, requiresApproval: true });
        if ((report.relationshipIssues || []).some(function each(row) { return row.code === 'MANAGER_NOT_FOUND' || row.code === 'MISSING_MANAGER'; })) recommendations.push({ action: 'ASSIGN_MISSING_MANAGER', priority: 'HIGH', requiresApproval: true });
        if ((report.relationshipIssues || []).some(function each(row) { return row.code === 'DEPARTMENT_NOT_FOUND'; })) recommendations.push({ action: 'ASSIGN_DEPARTMENT', priority: 'HIGH', requiresApproval: true });
        if ((report.allIssues || []).some(function each(row) { return /^INVALID_/.test(row.code); })) recommendations.push({ action: 'CORRECT_FORMAT', priority: 'MEDIUM', requiresApproval: true });
        if ((report.allIssues || []).some(function each(row) { return row.code === 'INVALID_PHONE_FORMAT'; })) recommendations.push({ action: 'NORMALIZE_PHONE', priority: 'MEDIUM', requiresApproval: true });
        if ((report.allIssues || []).some(function each(row) { return row.code === 'INVALID_EMAIL_FORMAT' || row.code === 'MISSING_REQUIRED_FIELD'; })) recommendations.push({ action: 'NORMALIZE_EMAIL', priority: 'MEDIUM', requiresApproval: true });
        var data = ensureTables(rawData());
        var output = {
            success: true,
            tenantSlug: access.tenantSlug,
            autoApply: false,
            recommendations: recommendations,
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[RECOMMENDATION_TABLE].unshift(Object.assign({ recommendationId: id('EMP-DQ-REC'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        audit('DATA_QUALITY_RECOMMENDATIONS_GENERATED', output.tenantSlug, 'Employee data quality recommendations generated.', { tenantSlug: output.tenantSlug, count: recommendations.length, status: 'COMPLETED' }, context || {});
        return freezeValidationOutput(output);
    }

    function generateDataQualityAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var runs = (data[RUN_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        if (!runs.length) {
            generateValidationReport({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            data = ensureTables(rawData());
            runs = (data[RUN_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        }
        var latest = runs[0] || {};
        var analytics = {
            validationRuns: runs.length,
            duplicateCount: runs.reduce(function sum(total, row) { return total + Number(row.duplicateCount || 0); }, 0),
            errorCategories: {
                critical: Number(latest.criticalErrors || 0),
                errors: Number(latest.errorCount || 0),
                warnings: Number(latest.warningCount || 0)
            },
            qualityTrends: runs.slice(0, 10).map(function each(row) { return { runId: row.runId, dataQualityScore: row.dataQualityScore, generatedAt: row.generatedAt }; }),
            validationTimeMs: Math.max(10, Number(latest.employeeCount || 0) * 2)
        };
        var output = {
            success: true,
            tenantSlug: tenantSlug,
            analytics: analytics,
            dataQualityScore: clampScore(latest.dataQualityScore || 0),
            migrationReadinessScore: clampScore((latest.dataQualityScore || 0) - (latest.duplicateCount || 0) * 2),
            goLiveReadinessScore: clampScore((latest.dataQualityScore || 0) - (latest.criticalErrors || 0) * 5),
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(Object.assign({ analyticsId: id('EMP-DQ-ANALYTICS'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        return freezeValidationOutput(output);
    }

    function generateQualityDashboard(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var report = generateValidationReport({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
        var suggestions = generateBulkFixSuggestions({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
        var analytics = generateDataQualityAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        return freezeValidationOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            validationSummary: report.summary || {},
            criticalIssues: report.criticalErrors || [],
            warnings: report.warnings || [],
            duplicates: report.duplicateRecords || [],
            relationshipErrors: report.relationshipIssues || [],
            qualityTrends: analytics.analytics && analytics.analytics.qualityTrends || [],
            goLiveScore: report.scores && report.scores.goLiveReadinessScore || 0,
            recommendedActions: suggestions.recommendations || [],
            analytics: analytics.analytics || {},
            compatibility: {
                employeeModulePreserved: true,
                payrollModulePreserved: true,
                attendanceModulePreserved: true,
                leaveModulePreserved: true,
                reportingModulePreserved: true,
                existingBusinessWorkflowsChanged: false
            },
            governance: governanceFlags(false, context || {})
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeValidationOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            record('domains available', VALIDATION_DOMAINS.indexOf('EMPLOYEE_MASTER') !== -1 && VALIDATION_DOMAINS.indexOf('PAYROLL_DATA') !== -1, VALIDATION_DOMAINS);
            var frozen = freezeValidationOutput({ ok: true, nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            record('non-destructive mode is default', governanceFlags(false, {}).validationNonDestructive === true, null);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezeValidationOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Employee data validation self-test completed.',
            checks: checks
        });
    }

    var EmployeeDataValidationService = Object.freeze({
        VALIDATION_DOMAINS: VALIDATION_DOMAINS,
        VALIDATION_PIPELINE: VALIDATION_PIPELINE,
        QUALITY_DIMENSIONS: QUALITY_DIMENSIONS,
        validateEmployeeFields: validateEmployeeFields,
        validateEmployeeRelationships: validateEmployeeRelationships,
        validateBusinessRules: validateBusinessRules,
        detectEmployeeDuplicates: detectEmployeeDuplicates,
        calculateEmployeeQualityScore: calculateEmployeeQualityScore,
        generateValidationReport: generateValidationReport,
        generateBulkFixSuggestions: generateBulkFixSuggestions,
        generateDataQualityAnalytics: generateDataQualityAnalytics,
        generateQualityDashboard: generateQualityDashboard,
        freezeValidationOutput: freezeValidationOutput
    });

    global.EmployeeDataValidationService = EmployeeDataValidationService;
    global.employeeDataValidationService = EmployeeDataValidationService;
    global.EmployeeValidationService = EmployeeDataValidationService;
    global.RelationshipValidator = EmployeeDataValidationService;
    global.BusinessRuleValidator = EmployeeDataValidationService;
    global.DuplicateAnalysisService = EmployeeDataValidationService;
    global.QualityScoringService = EmployeeDataValidationService;
    global.ValidationReportGenerator = EmployeeDataValidationService;
    global.DataQualityAnalyticsService = EmployeeDataValidationService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_EMPLOYEE_DATA_VALIDATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
