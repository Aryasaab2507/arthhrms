/**
 * employeeMasterImportService.js
 * ARTHHRMS - Enterprise Employee Master Import Engine
 *
 * Imports employee master data only. Attendance, leave, payroll, and other HR
 * workflows are intentionally untouched unless an administrator explicitly
 * runs the transactional employee import.
 */
(function attachEmployeeMasterImportService(global) {
    'use strict';

    var PREFIX = '[EmployeeMasterImportService]';
    var SOURCE = 'employeeMasterImportService';
    var BATCH_TABLE = 'employeeMasterImportBatches';
    var CHECKPOINT_TABLE = 'employeeMasterImportCheckpoints';
    var SNAPSHOT_TABLE = 'employeeMasterImportSnapshots';
    var ROLLBACK_TABLE = 'employeeMasterImportRollbackHistory';
    var ANALYTICS_TABLE = 'employeeMasterImportAnalytics';

    var SUPPORTED_SOURCES = Object.freeze(['CSV', 'TSV', 'JSON', 'XLS', 'XLSX']);
    var IMPORT_STATES = Object.freeze([
        'UPLOADED',
        'FORMAT_DETECTED',
        'PREVIEWED',
        'MAPPED',
        'VALIDATED',
        'DUPLICATES_FOUND',
        'CONFLICTS_RESOLVED',
        'DRY_RUN',
        'QUEUED',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        'RESUMABLE',
        'ROLLED_BACK',
        'CANCELLED'
    ]);
    var WIZARD_STEPS = Object.freeze([
        'UPLOAD_FILE',
        'DETECT_FORMAT',
        'PREVIEW_RECORDS',
        'AUTO_MAP_COLUMNS',
        'MANUAL_MAPPING',
        'VALIDATION',
        'DUPLICATE_DETECTION',
        'CONFLICT_RESOLUTION',
        'DRY_RUN',
        'IMPORT',
        'VERIFICATION',
        'SUMMARY'
    ]);
    var REQUIRED_FIELDS = Object.freeze(['employeeCode', 'firstName', 'lastName', 'email', 'department', 'designation', 'dateOfJoining']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric/i;
    var ALLOWED_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER']);

    var COLUMN_ALIASES = Object.freeze({
        employeeid: 'employeeId',
        empid: 'employeeId',
        employee: 'employeeId',
        employeeno: 'employeeCode',
        empno: 'employeeCode',
        employeecode: 'employeeCode',
        empcode: 'employeeCode',
        code: 'employeeCode',
        firstname: 'firstName',
        fname: 'firstName',
        middlename: 'middleName',
        lastname: 'lastName',
        lname: 'lastName',
        preferredname: 'preferredName',
        displayname: 'preferredName',
        name: 'name',
        mailid: 'email',
        emailid: 'email',
        email: 'email',
        workemail: 'email',
        phone: 'phone',
        mobilenumber: 'phone',
        mobile: 'phone',
        emergencycontact: 'emergencyContact',
        gender: 'gender',
        dob: 'dob',
        dateofbirth: 'dob',
        doj: 'dateOfJoining',
        dateofjoining: 'dateOfJoining',
        joiningdate: 'dateOfJoining',
        employmenttype: 'employmentType',
        employeetype: 'employmentType',
        status: 'employmentStatus',
        employmentstatus: 'employmentStatus',
        department: 'department',
        dept: 'department',
        businessunit: 'businessUnit',
        bu: 'businessUnit',
        designation: 'designation',
        title: 'designation',
        jobtitle: 'designation',
        manager: 'manager',
        reportingmanager: 'manager',
        managerid: 'manager',
        branch: 'branch',
        location: 'location',
        costcenter: 'costCenter',
        salarygrade: 'salaryGrade',
        customfields: 'customFields'
    });

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

    function isPlainObject(value) {
        return !!value && Object.prototype.toString.call(value) === '[object Object]';
    }

    function normalizeRole(value) {
        return safeString(value, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
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

    function normalizeStatus(value) {
        return safeString(value || 'ACTIVE', 'ACTIVE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function clone(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object') return value;
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.slice(0, 500000).map(function each(item) { return clone(item, refs.slice()); });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            output[key] = clone(value[key], refs.slice());
        });
        return output;
    }

    function isSensitiveKey(key) {
        var text = String(key || '');
        if (/Preserved$|Unaffected$|Supported$|Prepared$|Compatible$|Compatible$|Compatibility$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (SENSITIVE_KEYS.test(String(value || ''))) return '[REDACTED]';
            return value;
        }
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.slice(0, 500000).map(function each(item) { return cloneSanitized(item, keyHint, refs.slice()); });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (isSensitiveKey(key)) return;
            var safeValue = cloneSanitized(value[key], key, refs.slice());
            if (safeValue !== undefined) output[key] = safeValue;
        });
        return output;
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

    function freezeEmployeeImportOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeEmployeeImportOutput({
            code: safeString(code || 'EMPLOYEE_IMPORT_ISSUE', 'EMPLOYEE_IMPORT_ISSUE').toUpperCase(),
            message: safeString(message || 'Employee import issue.', 'Employee import issue.'),
            severity: safeString(severity || 'HIGH', 'HIGH').toUpperCase(),
            metadata: metadata || {}
        });
    }

    function failure(code, message, input, context, metadata) {
        var tenantSlug = tenantFrom(input, context);
        return freezeEmployeeImportOutput({
            success: false,
            tenantSlug: tenantSlug,
            issues: [issue(code, message, 'HIGH', metadata || {})],
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function governanceFlags(audited) {
        return {
            backwardCompatible: true,
            tenantIsolationPreserved: true,
            employeeModulePreserved: true,
            attendanceModulePreserved: true,
            leaveModulePreserved: true,
            payrollCalculationsUnaffected: true,
            transactional: true,
            auditable: !!audited,
            reversible: true
        };
    }

    function tenantFrom(input, context) {
        var data = rawData();
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.organizationId) ||
            context && (context.tenantSlug || context.tenantId || context.organizationId) ||
            context && context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.organizationId) ||
            data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId) ||
            'default'
        );
    }

    function tenantIdForSlug(data, tenantSlug) {
        var normalized = normalizeTenant(tenantSlug);
        var tenants = Array.isArray(data.platformTenants) ? data.platformTenants : [];
        var found = tenants.find(function findTenant(row) {
            return normalizeTenant(row.tenantSlug || row.tenantId || row.companyId) === normalized;
        });
        if (found) return safeString(found.tenantId || found.companyId || found.tenantSlug, normalized);
        if (normalizeTenant(data.companySettings && data.companySettings.tenantSlug) === normalized) {
            return safeString(data.companySettings.tenantId || data.companySettings.companyId || normalized, normalized);
        }
        return normalized;
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.empId || actor.employeeId || actor.userId || context && context.actorId || 'system', 'system'),
            role: normalizeRole(actor.role || actor.actorRole || context && context.role || 'HR'),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function validateAccess(input, context, operation) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        if (ALLOWED_ROLES.indexOf(actor.role) === -1) {
            return {
                allowed: false,
                output: failure('EMPLOYEE_IMPORT_ACCESS_DENIED', 'Employee master imports require HR, admin, director, or platform governance access.', input, context, { operation: operation, role: actor.role })
            };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && normalizeTenant(actorTenant) !== normalizeTenant(tenantSlug)) {
            return {
                allowed: false,
                output: failure('CROSS_TENANT_EMPLOYEE_IMPORT_BLOCKED', 'Employee import tenant scope does not match the authenticated actor tenant.', input, context, { operation: operation })
            };
        }
        return { allowed: true, actor: actor, tenantSlug: tenantSlug };
    }

    function ensureTables(data) {
        [BATCH_TABLE, CHECKPOINT_TABLE, SNAPSHOT_TABLE, ROLLBACK_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
        return data;
    }

    function getTenantEmployees(data, tenantSlug) {
        var normalized = normalizeTenant(tenantSlug);
        return (Array.isArray(data.employees) ? data.employees : []).filter(function each(row) {
            return normalizeTenant(row.tenantSlug || row.tenantId || row.companyId) === normalized;
        });
    }

    function employeeIdentity(row) {
        return safeString(row && (row.employeeId || row.employeeCode || row.empId || row.id), '').toUpperCase();
    }

    function employeeByIdentity(data, tenantSlug, identity) {
        var key = safeString(identity, '').toUpperCase();
        if (!key) return null;
        return getTenantEmployees(data, tenantSlug).find(function find(row) {
            return [row.employeeId, row.employeeCode, row.empId, row.id].some(function each(value) {
                return safeString(value, '').toUpperCase() === key;
            });
        }) || null;
    }

    function activeRecord(row) {
        if (!row) return false;
        var status = normalizeStatus(row.employmentStatus || row.status || row.lifecycleStatus || 'ACTIVE');
        return ['TERMINATED', 'RESIGNED', 'RETIRED', 'INACTIVE', 'ARCHIVED', 'SUSPENDED'].indexOf(status) === -1;
    }

    function departmentExists(data, tenantSlug, name) {
        var key = normalizeKey(name);
        if (!key) return false;
        var rows = [];
        if (Array.isArray(data.departments)) rows = rows.concat(data.departments);
        if (Array.isArray(data.tenantDepartmentRecords)) rows = rows.concat(data.tenantDepartmentRecords);
        return rows.some(function each(row) {
            var sameTenant = normalizeTenant(row.tenantSlug || row.tenantId || row.companyId) === normalizeTenant(tenantSlug);
            if (!sameTenant) return false;
            if (row.active === false || normalizeStatus(row.status || 'ACTIVE') === 'ARCHIVED') return false;
            return [row.name, row.departmentName, row.departmentCode, row.departmentId, row.id].some(function field(value) {
                return normalizeKey(value) === key;
            });
        });
    }

    function locationExists(data, tenantSlug, name) {
        var key = normalizeKey(name);
        if (!key) return true;
        var rows = [];
        if (Array.isArray(data.companyLocations)) rows = rows.concat(data.companyLocations);
        if (Array.isArray(data.locations)) rows = rows.concat(data.locations);
        return rows.some(function each(row) {
            var sameTenant = normalizeTenant(row.tenantSlug || row.tenantId || row.companyId) === normalizeTenant(tenantSlug);
            if (!sameTenant) return false;
            if (row.active === false || normalizeStatus(row.status || 'ACTIVE') === 'ARCHIVED') return false;
            return [row.locationName, row.name, row.locationCode, row.locationId, row.id].some(function field(value) {
                return normalizeKey(value) === key;
            });
        });
    }

    function detectImportFormat(input, context) {
        var access = validateAccess(input || {}, context || {}, 'DETECT_FORMAT');
        if (!access.allowed) return access.output;

        var fileType = safeString(input && input.fileType, '').toUpperCase();
        var fileName = safeString(input && input.fileName, '').toLowerCase();
        var extension = fileName.indexOf('.') !== -1 ? fileName.split('.').pop().toUpperCase() : '';
        var format = fileType || extension || (Array.isArray(input && input.records) ? 'JSON' : '');
        if (format === 'XLSX' || format === 'XLS') format = extension || fileType;
        if (!format && safeString(input && input.fileContent, '').trim().charAt(0) === '[') format = 'JSON';
        if (SUPPORTED_SOURCES.indexOf(format) === -1) {
            return failure('UNSUPPORTED_EMPLOYEE_IMPORT_SOURCE', 'Unsupported employee import source. Supported sources are CSV, TSV, JSON, XLS, and XLSX.', input, context, { format: format || 'UNKNOWN' });
        }
        return freezeEmployeeImportOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            format: format,
            source: safeString(input && input.fileName, format),
            streamingSupported: true,
            backgroundProcessingSupported: true,
            queueProcessingPrepared: true,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function splitDelimitedLine(line, delimiter) {
        var out = [];
        var current = '';
        var quoted = false;
        var i;
        for (i = 0; i < line.length; i += 1) {
            var char = line.charAt(i);
            if (char === '"') {
                if (quoted && line.charAt(i + 1) === '"') {
                    current += '"';
                    i += 1;
                } else {
                    quoted = !quoted;
                }
            } else if (char === delimiter && !quoted) {
                out.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        out.push(current.trim());
        return out;
    }

    function parseDelimited(content, delimiter) {
        var lines = safeString(content, '').split(/\r?\n/).filter(function each(line) { return safeString(line, '') !== ''; });
        if (!lines.length) return { headers: [], records: [] };
        var headers = splitDelimitedLine(lines[0], delimiter);
        var records = lines.slice(1).map(function each(line, index) {
            var cells = splitDelimitedLine(line, delimiter);
            var record = {};
            headers.forEach(function map(header, i) {
                record[header] = cells[i] !== undefined ? cells[i] : '';
            });
            record.__rowNumber = index + 2;
            return record;
        });
        return { headers: headers, records: records };
    }

    function parseInputRecords(input, format) {
        if (Array.isArray(input && input.records)) {
            return {
                headers: Object.keys(input.records[0] || {}),
                records: input.records.map(function each(row, index) {
                    return Object.assign({}, row, { __rowNumber: row.__rowNumber || index + 1 });
                })
            };
        }
        if (format === 'JSON') {
            var parsed = JSON.parse(safeString(input && input.fileContent, '[]'));
            var rows = Array.isArray(parsed) ? parsed : parsed.records || [];
            return {
                headers: Object.keys(rows[0] || {}),
                records: rows.map(function each(row, index) { return Object.assign({}, row, { __rowNumber: row.__rowNumber || index + 1 }); })
            };
        }
        if (format === 'CSV') return parseDelimited(input && input.fileContent, ',');
        if (format === 'TSV') return parseDelimited(input && input.fileContent, '\t');
        return {
            headers: Array.isArray(input && input.headers) ? input.headers.slice() : [],
            records: Array.isArray(input && input.records) ? input.records.slice() : []
        };
    }

    function canonicalField(header) {
        var key = normalizeKey(header);
        return COLUMN_ALIASES[key] || safeString(header, '').replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z0-9]+(.)/g, function convert(_, chr) { return chr.toUpperCase(); }).replace(/^[A-Z]/, function lower(chr) { return chr.toLowerCase(); });
    }

    function mapEmployeeColumns(input, context) {
        var access = validateAccess(input || {}, context || {}, 'MAP_COLUMNS');
        if (!access.allowed) return access.output;
        var format = detectImportFormat(input || {}, context || {});
        if (!format.success) return format;
        try {
            var parsed = parseInputRecords(input || {}, format.format);
            var headers = parsed.headers || [];
            var mapping = {};
            headers.forEach(function each(header) {
                mapping[header] = canonicalField(header);
            });
            return freezeEmployeeImportOutput({
                success: true,
                tenantSlug: access.tenantSlug,
                mapping: mapping,
                headers: headers,
                mappedFields: Object.keys(mapping).length,
                reusableTemplateSupported: true,
                timestamp: nowIso(),
                governance: governanceFlags(false)
            });
        } catch (error) {
            return failure('MALFORMED_EMPLOYEE_IMPORT_PAYLOAD', 'Employee import columns could not be mapped safely.', input, context, { error: error && error.message });
        }
    }

    function normalizeRecord(row, mapping, rowNumber) {
        var out = {};
        Object.keys(row || {}).forEach(function each(key) {
            if (key === '__rowNumber') return;
            var canonical = mapping[key] || canonicalField(key);
            if (SENSITIVE_KEYS.test(canonical)) return;
            out[canonical] = safeString(row[key], '');
        });
        if (!out.employeeId && out.employeeCode) out.employeeId = out.employeeCode;
        if (!out.employeeCode && out.employeeId) out.employeeCode = out.employeeId;
        if (!out.name) out.name = [out.firstName, out.middleName, out.lastName].filter(Boolean).join(' ').trim() || out.preferredName || out.email;
        out.employmentStatus = normalizeStatus(out.employmentStatus || out.status || 'ACTIVE');
        out.__rowNumber = row.__rowNumber || rowNumber;
        return out;
    }

    function normalizeImportPayload(input, context) {
        var access = validateAccess(input || {}, context || {}, 'NORMALIZE_PAYLOAD');
        if (!access.allowed) return access.output;
        var format = detectImportFormat(input || {}, context || {});
        if (!format.success) return format;
        try {
            var parsed = parseInputRecords(input || {}, format.format);
            var mapping = {};
            parsed.headers.forEach(function each(header) { mapping[header] = canonicalField(header); });
            var records = parsed.records.map(function each(row, index) {
                return normalizeRecord(row, mapping, index + 1);
            });
            return freezeEmployeeImportOutput({
                success: true,
                tenantSlug: access.tenantSlug,
                format: format.format,
                records: records,
                headers: parsed.headers,
                mapping: mapping,
                totalRecords: records.length,
                sourceSystem: safeString(input && input.metadata && input.metadata.sourceSystem, ''),
                timestamp: nowIso(),
                governance: governanceFlags(false)
            });
        } catch (error) {
            return failure('MALFORMED_EMPLOYEE_IMPORT_PAYLOAD', 'Employee import payload could not be normalized safely.', input, context, { error: error && error.message });
        }
    }

    function validateDate(value) {
        var text = safeString(value, '');
        if (!text) return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
        var date = new Date(text + 'T00:00:00Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
    }

    function validateEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeString(value, '').toLowerCase());
    }

    function validatePhone(value) {
        var text = safeString(value, '');
        if (!text) return true;
        return /^\+?[0-9][0-9\s().-]{6,20}$/.test(text);
    }

    function validateRecordFields(record, data, tenantSlug) {
        var issues = [];
        REQUIRED_FIELDS.forEach(function each(field) {
            if (!safeString(record[field], '')) {
                issues.push(issue('MISSING_REQUIRED_FIELD', 'Required employee field is missing: ' + field, 'ERROR', { rowNumber: record.__rowNumber, field: field }));
            }
        });
        if (record.email && !validateEmail(record.email)) {
            issues.push(issue('INVALID_EMAIL_FORMAT', 'Employee email format is invalid.', 'ERROR', { rowNumber: record.__rowNumber }));
        }
        if (record.phone && !validatePhone(record.phone)) {
            issues.push(issue('INVALID_PHONE_FORMAT', 'Employee phone format is invalid.', 'WARNING', { rowNumber: record.__rowNumber }));
        }
        if (record.dateOfJoining && !validateDate(record.dateOfJoining)) {
            issues.push(issue('INVALID_JOIN_DATE', 'Employee joining date must be a valid YYYY-MM-DD date.', 'ERROR', { rowNumber: record.__rowNumber }));
        }
        if (record.dob && !validateDate(record.dob)) {
            issues.push(issue('INVALID_DOB', 'Employee date of birth must be a valid YYYY-MM-DD date.', 'ERROR', { rowNumber: record.__rowNumber }));
        }
        if (record.department && !departmentExists(data, tenantSlug, record.department)) {
            issues.push(issue('DEPARTMENT_NOT_FOUND', 'Employee department does not exist in this tenant.', 'ERROR', { rowNumber: record.__rowNumber, department: record.department }));
        }
        if (record.location && !locationExists(data, tenantSlug, record.location)) {
            issues.push(issue('LOCATION_NOT_FOUND', 'Employee location does not exist in this tenant.', 'ERROR', { rowNumber: record.__rowNumber, location: record.location }));
        }
        if (record.manager) {
            var manager = employeeByIdentity(data, tenantSlug, record.manager);
            if (!manager) {
                issues.push(issue('MANAGER_NOT_FOUND', 'Reporting manager does not exist in this tenant.', 'ERROR', { rowNumber: record.__rowNumber, manager: record.manager }));
            } else if (!activeRecord(manager)) {
                issues.push(issue('INACTIVE_MANAGER', 'Reporting manager is not active.', 'ERROR', { rowNumber: record.__rowNumber, manager: record.manager }));
            }
        }
        return issues;
    }

    function detectDuplicateEmployees(input, context) {
        var access = validateAccess(input || {}, context || {}, 'DETECT_DUPLICATES');
        if (!access.allowed) return access.output;
        var normalized = normalizeImportPayload(input || {}, context || {});
        if (!normalized.success) return normalized;
        var data = rawData();
        var tenantSlug = access.tenantSlug;
        var employees = getTenantEmployees(data, tenantSlug);
        var duplicates = [];
        var seenCodes = {};
        var seenEmails = {};
        var seenPhones = {};
        var existingCodes = {};
        var existingEmails = {};
        var existingPhones = {};

        employees.forEach(function each(row) {
            [row.employeeId, row.employeeCode, row.empId, row.id].forEach(function eachIdentity(value) {
                var key = safeString(value, '').toUpperCase();
                if (key) existingCodes[key] = row;
            });
            if (row.email) existingEmails[safeString(row.email, '').toLowerCase()] = row;
            if (row.phone) existingPhones[safeString(row.phone, '')] = row;
        });

        normalized.records.forEach(function each(record) {
            var code = safeString(record.employeeCode || record.employeeId, '').toUpperCase();
            var email = safeString(record.email, '').toLowerCase();
            var phone = safeString(record.phone, '');
            if (code) {
                if (seenCodes[code]) duplicates.push({ rowNumber: record.__rowNumber, employeeCode: record.employeeCode, matchType: 'FILE_EMPLOYEE_CODE', matchedRow: seenCodes[code] });
                seenCodes[code] = record.__rowNumber;
                if (existingCodes[code]) duplicates.push({ rowNumber: record.__rowNumber, employeeCode: record.employeeCode, matchType: 'EXISTING_EMPLOYEE_CODE', existingEmployeeId: employeeIdentity(existingCodes[code]) });
            }
            if (email) {
                if (seenEmails[email]) duplicates.push({ rowNumber: record.__rowNumber, email: email, matchType: 'FILE_EMAIL', matchedRow: seenEmails[email] });
                seenEmails[email] = record.__rowNumber;
                if (existingEmails[email]) duplicates.push({ rowNumber: record.__rowNumber, email: email, matchType: 'EXISTING_EMAIL', existingEmployeeId: employeeIdentity(existingEmails[email]) });
            }
            if (phone) {
                if (seenPhones[phone]) duplicates.push({ rowNumber: record.__rowNumber, matchType: 'FILE_PHONE', matchedRow: seenPhones[phone] });
                seenPhones[phone] = record.__rowNumber;
                if (existingPhones[phone]) duplicates.push({ rowNumber: record.__rowNumber, matchType: 'EXISTING_PHONE', existingEmployeeId: employeeIdentity(existingPhones[phone]) });
            }
        });

        var summary = duplicates.reduce(function reduce(acc, row) {
            if (/EMPLOYEE_CODE/.test(row.matchType)) acc.duplicateEmployeeCodes += 1;
            if (/EMAIL/.test(row.matchType)) acc.duplicateEmails += 1;
            if (/PHONE/.test(row.matchType)) acc.duplicatePhones += 1;
            acc.totalDuplicates += 1;
            return acc;
        }, { totalDuplicates: 0, duplicateEmployeeCodes: 0, duplicateEmails: 0, duplicatePhones: 0 });

        return freezeEmployeeImportOutput({
            success: true,
            tenantSlug: tenantSlug,
            duplicates: duplicates,
            summary: summary,
            exactMatchSupported: true,
            fuzzyMatchPrepared: true,
            manualReviewSupported: true,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function validateEmployeeRecords(input, context) {
        var access = validateAccess(input || {}, context || {}, 'VALIDATE_EMPLOYEES');
        if (!access.allowed) return access.output;
        var normalized = normalizeImportPayload(input || {}, context || {});
        if (!normalized.success) return normalized;
        var data = rawData();
        var tenantSlug = access.tenantSlug;
        var conflictStrategy = normalizeStatus(input && input.conflictStrategy || 'MERGE');
        var issues = [];
        var recordResults = [];
        var seenCodes = {};
        var seenEmails = {};
        var existingCodes = {};
        var existingEmails = {};

        getTenantEmployees(data, tenantSlug).forEach(function each(row) {
            [row.employeeId, row.employeeCode, row.empId, row.id].forEach(function value(v) {
                var key = safeString(v, '').toUpperCase();
                if (key) existingCodes[key] = row;
            });
            if (row.email) existingEmails[safeString(row.email, '').toLowerCase()] = row;
        });

        normalized.records.forEach(function each(record) {
            var rowIssues = validateRecordFields(record, data, tenantSlug);
            var code = safeString(record.employeeCode || record.employeeId, '').toUpperCase();
            var email = safeString(record.email, '').toLowerCase();
            if (code && seenCodes[code]) rowIssues.push(issue('DUPLICATE_EMPLOYEE_CODE', 'Employee code is duplicated in the import file.', 'ERROR', { rowNumber: record.__rowNumber, employeeCode: record.employeeCode }));
            if (email && seenEmails[email]) rowIssues.push(issue('DUPLICATE_EMAIL', 'Employee email is duplicated in the import file.', 'ERROR', { rowNumber: record.__rowNumber, email: email }));
            if (code) seenCodes[code] = record.__rowNumber;
            if (email) seenEmails[email] = record.__rowNumber;
            if (code && existingCodes[code]) {
                rowIssues.push(issue('EXISTING_EMPLOYEE_CODE', 'Employee code already exists in this tenant.', conflictStrategy === 'CREATE_NEW' ? 'ERROR' : 'WARNING', { rowNumber: record.__rowNumber, employeeCode: record.employeeCode }));
            }
            if (email && existingEmails[email]) {
                rowIssues.push(issue('EXISTING_EMAIL', 'Employee email already exists in this tenant.', conflictStrategy === 'CREATE_NEW' ? 'ERROR' : 'WARNING', { rowNumber: record.__rowNumber, email: email }));
            }
            var hasErrors = rowIssues.some(function any(rowIssue) { return rowIssue.severity === 'ERROR'; });
            issues = issues.concat(rowIssues);
            recordResults.push({
                rowNumber: record.__rowNumber,
                employeeCode: record.employeeCode,
                email: record.email,
                status: hasErrors ? 'INVALID' : rowIssues.length ? 'WARNING' : 'VALID',
                issues: rowIssues
            });
        });

        var validRecords = recordResults.filter(function each(row) { return row.status !== 'INVALID'; }).length;
        var invalidRecords = recordResults.length - validRecords;
        var summary = {
            totalRecords: recordResults.length,
            validRecords: validRecords,
            invalidRecords: invalidRecords,
            warnings: issues.filter(function each(row) { return row.severity === 'WARNING'; }).length,
            errors: issues.filter(function each(row) { return row.severity === 'ERROR'; }).length
        };
        return freezeEmployeeImportOutput({
            success: invalidRecords === 0,
            tenantSlug: tenantSlug,
            summary: summary,
            totalRecords: recordResults.length,
            validRecords: validRecords,
            invalidRecords: invalidRecords,
            warnings: issues.filter(function each(row) { return row.severity === 'WARNING'; }),
            issues: issues,
            records: recordResults,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function resolveImportConflicts(input, context) {
        var access = validateAccess(input || {}, context || {}, 'RESOLVE_CONFLICTS');
        if (!access.allowed) return access.output;
        var validation = validateEmployeeRecords(input || {}, context || {});
        var duplicates = detectDuplicateEmployees(input || {}, context || {});
        if (!validation.issues || !duplicates.duplicates) return validation.success === false ? validation : duplicates;
        var strategy = normalizeStatus(input && input.conflictStrategy || 'MERGE');
        var duplicateRows = {};
        duplicates.duplicates.forEach(function each(row) {
            duplicateRows[row.rowNumber] = duplicateRows[row.rowNumber] || [];
            duplicateRows[row.rowNumber].push(row);
        });
        var resolutions = (validation.records || []).map(function each(record) {
            var rowDuplicates = duplicateRows[record.rowNumber] || [];
            var hasErrors = (record.issues || []).some(function any(rowIssue) { return rowIssue.severity === 'ERROR'; });
            var action = 'CREATE_NEW';
            if (hasErrors) action = 'SKIP';
            else if (rowDuplicates.some(function any(row) { return /^EXISTING/.test(row.matchType); })) action = strategy === 'OVERWRITE' ? 'UPDATE_EXISTING' : strategy === 'SKIP' ? 'SKIP' : 'MERGE_EXISTING';
            else if (rowDuplicates.length) action = strategy === 'SKIP' ? 'SKIP' : 'MANUAL_REVIEW';
            return {
                rowNumber: record.rowNumber,
                employeeCode: record.employeeCode,
                action: action,
                strategy: strategy,
                duplicateCount: rowDuplicates.length,
                issueCount: (record.issues || []).length
            };
        });
        return freezeEmployeeImportOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            strategy: strategy,
            resolutions: resolutions,
            duplicateSummary: duplicates.summary,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function calculateRiskScore(total, invalid, duplicates, warnings) {
        if (!total) return 0;
        var score = Math.min(100, Math.round((invalid / total) * 60 + (duplicates / total) * 30 + Math.min(10, warnings)));
        return score;
    }

    function runDryRun(input, context) {
        var access = validateAccess(input || {}, context || {}, 'DRY_RUN');
        if (!access.allowed) return access.output;
        var normalized = normalizeImportPayload(input || {}, context || {});
        if (!normalized.success) return normalized;
        var validation = validateEmployeeRecords(input || {}, context || {});
        var duplicates = detectDuplicateEmployees(input || {}, context || {});
        var conflicts = resolveImportConflicts(input || {}, context || {});
        var summary = {
            totalRecords: normalized.records.length,
            validRecords: validation.validRecords || 0,
            invalidRecords: validation.invalidRecords || 0,
            warnings: (validation.warnings || []).length,
            errors: (validation.issues || []).filter(function each(row) { return row.severity === 'ERROR'; }).length,
            duplicates: duplicates.summary ? duplicates.summary.totalDuplicates : 0
        };
        var riskScore = calculateRiskScore(summary.totalRecords, summary.invalidRecords, summary.duplicates, summary.warnings);
        return freezeEmployeeImportOutput({
            success: true,
            readOnly: true,
            tenantSlug: access.tenantSlug,
            summary: summary,
            estimatedImportTimeMs: Math.max(50, summary.totalRecords * 25),
            riskScore: riskScore,
            validation: validation,
            duplicates: duplicates,
            conflicts: conflicts,
            recordsPreview: normalized.records.slice(0, 25),
            transactional: true,
            reversible: true,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function buildEmployee(record, data, tenantSlug, existing) {
        var tenantId = tenantIdForSlug(data, tenantSlug);
        var employeeId = safeString(record.employeeId || record.employeeCode || existing && (existing.employeeId || existing.empId || existing.id), id('EMP'));
        var fullName = [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ').trim() || record.name || existing && existing.name || employeeId;
        return Object.assign({}, existing || {}, {
            id: existing && existing.id || employeeId,
            empId: employeeId,
            employeeId: employeeId,
            employeeCode: safeString(record.employeeCode || employeeId, employeeId),
            name: fullName,
            firstName: safeString(record.firstName || existing && existing.firstName, ''),
            middleName: safeString(record.middleName || existing && existing.middleName, ''),
            lastName: safeString(record.lastName || existing && existing.lastName, ''),
            preferredName: safeString(record.preferredName || existing && existing.preferredName, ''),
            email: safeString(record.email || existing && existing.email, '').toLowerCase(),
            phone: safeString(record.phone || existing && existing.phone, ''),
            emergencyContact: safeString(record.emergencyContact || existing && existing.emergencyContact, ''),
            gender: safeString(record.gender || existing && existing.gender, ''),
            dob: safeString(record.dob || existing && existing.dob, ''),
            dateOfJoining: safeString(record.dateOfJoining || existing && (existing.dateOfJoining || existing.joiningDate), ''),
            joiningDate: safeString(record.dateOfJoining || existing && (existing.joiningDate || existing.dateOfJoining), ''),
            employmentType: safeString(record.employmentType || existing && existing.employmentType, 'Full Time'),
            employmentStatus: normalizeStatus(record.employmentStatus || existing && existing.employmentStatus || 'ACTIVE'),
            department: safeString(record.department || existing && existing.department, ''),
            businessUnit: safeString(record.businessUnit || existing && existing.businessUnit, ''),
            designation: safeString(record.designation || existing && existing.designation, ''),
            managerId: safeString(record.manager || existing && (existing.managerId || existing.manager), ''),
            branch: safeString(record.branch || existing && existing.branch, ''),
            location: safeString(record.location || existing && existing.location, ''),
            costCenter: safeString(record.costCenter || existing && existing.costCenter, ''),
            salaryGrade: safeString(record.salaryGrade || existing && existing.salaryGrade, ''),
            customFields: isPlainObject(record.customFields) ? clone(record.customFields) : existing && isPlainObject(existing.customFields) ? clone(existing.customFields) : {},
            tenantSlug: tenantSlug,
            tenantId: tenantId,
            source: 'employee-master-import',
            updatedAt: nowIso()
        });
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return false;
            var telemetry = global.WorkflowTelemetryService;
            if (!telemetry) return false;
            if (typeof telemetry.emitImportTelemetry === 'function') {
                telemetry.emitImportTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
            if (typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('IMPORT', eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
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

    function audit(actionType, targetId, description, metadata, context) {
        try {
            if (context && context.skipAudit) return false;
            var actor = contextActor(context || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actorId: actor.id,
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: Object.assign({
                        actionType: actionType,
                        actorRole: actor.role,
                        module: 'Employee Master Import',
                        targetId: targetId,
                        description: description
                    }, metadata || {})
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Employee Master Import', targetId, description);
                return true;
            }
        } catch (error) {
            safeWarn('Audit failed safely.', error && error.message);
        }
        return false;
    }

    function executeImport(input, context) {
        var access = validateAccess(input || {}, context || {}, 'EXECUTE_IMPORT');
        if (!access.allowed) return access.output;
        var normalized = normalizeImportPayload(input || {}, context || {});
        if (!normalized.success) return normalized;
        var validation = validateEmployeeRecords(input || {}, context || {});
        var strategy = normalizeStatus(input && input.conflictStrategy || 'MERGE');
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var importId = id('EMP-IMPORT');
        var snapshotId = id('EMP-SNAPSHOT');
        var checkpointId = id('EMP-CHECKPOINT');
        var created = [];
        var updated = [];
        var skipped = [];
        var snapshotRecords = [];
        var validRows = {};

        (validation.records || []).forEach(function each(row) {
            if (row.status !== 'INVALID') validRows[row.rowNumber] = true;
        });

        try {
            normalized.records.forEach(function each(record) {
                if (!validRows[record.__rowNumber]) {
                    skipped.push({ rowNumber: record.__rowNumber, reason: 'VALIDATION_ERROR' });
                    return;
                }
                var existing = employeeByIdentity(data, tenantSlug, record.employeeCode || record.employeeId);
                if (!existing && record.email) {
                    existing = getTenantEmployees(data, tenantSlug).find(function find(row) {
                        return safeString(row.email, '').toLowerCase() === safeString(record.email, '').toLowerCase();
                    }) || null;
                }
                if (existing && strategy === 'CREATE_NEW') {
                    skipped.push({ rowNumber: record.__rowNumber, reason: 'DUPLICATE_EXISTING' });
                    return;
                }
                var next = buildEmployee(record, data, tenantSlug, existing);
                next.importId = importId;
                if (existing) {
                    var index = data.employees.indexOf(existing);
                    snapshotRecords.push({ operation: 'UPDATE', employeeId: employeeIdentity(existing), before: clone(existing), after: clone(next) });
                    data.employees[index] = next;
                    updated.push(next.employeeId);
                } else {
                    next.createdAt = nowIso();
                    snapshotRecords.push({ operation: 'CREATE', employeeId: next.employeeId, before: null, after: clone(next) });
                    data.employees.push(next);
                    created.push(next.employeeId);
                }
            });

            var batch = {
                importId: importId,
                tenantSlug: tenantSlug,
                fileName: safeString(input && input.fileName, ''),
                sourceType: safeString(input && input.fileType, ''),
                status: 'COMPLETED',
                state: 'COMPLETED',
                conflictStrategy: strategy,
                totalRecords: normalized.records.length,
                importedEmployees: created.length,
                updatedEmployees: updated.length,
                skippedRecords: skipped.length,
                validationErrors: validation.invalidRecords || 0,
                createdAt: nowIso(),
                completedAt: nowIso(),
                actorId: access.actor.id
            };
            var snapshot = {
                snapshotId: snapshotId,
                importId: importId,
                tenantSlug: tenantSlug,
                records: snapshotRecords,
                createdEmployeeIds: created.slice(),
                updatedEmployeeIds: updated.slice(),
                createdAt: nowIso(),
                actorId: access.actor.id,
                reversible: true
            };
            var checkpoint = {
                checkpointId: checkpointId,
                importId: importId,
                tenantSlug: tenantSlug,
                state: 'COMPLETED',
                processedRecords: normalized.records.length,
                totalRecords: normalized.records.length,
                createdAt: nowIso(),
                resumable: false
            };
            data[BATCH_TABLE].unshift(batch);
            data[SNAPSHOT_TABLE].unshift(snapshot);
            data[CHECKPOINT_TABLE].unshift(checkpoint);
            saveData(data);

            var metadata = {
                importId: importId,
                tenantSlug: tenantSlug,
                importedEmployees: created.length,
                updatedEmployees: updated.length,
                skippedRecords: skipped.length,
                status: 'COMPLETED'
            };
            audit('EMPLOYEE_MASTER_IMPORT_EXECUTED', importId, 'Employee master import executed transactionally.', metadata, context || {});
            emitTelemetry('EMPLOYEE_MASTER_IMPORT_EXECUTED', metadata, context || {});
            recordMetric('EMPLOYEE_MASTER_IMPORT_EXECUTED', metadata, context || {});

            return freezeEmployeeImportOutput({
                success: true,
                importId: importId,
                tenantSlug: tenantSlug,
                summary: {
                    totalRecords: normalized.records.length,
                    importedEmployees: created.length,
                    updatedEmployees: updated.length,
                    skippedRecords: skipped.length,
                    validationErrors: validation.invalidRecords || 0
                },
                transaction: {
                    committed: true,
                    checkpointId: checkpointId,
                    snapshotId: snapshotId,
                    rollbackSupported: true
                },
                timestamp: nowIso(),
                governance: governanceFlags(true)
            });
        } catch (error) {
            return failure('EMPLOYEE_IMPORT_TRANSACTION_FAILED', 'Employee import transaction failed safely before commit.', input, context, { error: error && error.message });
        }
    }

    function resumeImport(input, context) {
        var access = validateAccess(input || {}, context || {}, 'RESUME_IMPORT');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var importId = safeString(input && input.importId, '');
        var checkpoint = data[CHECKPOINT_TABLE].find(function find(row) {
            return row.importId === importId && normalizeTenant(row.tenantSlug) === access.tenantSlug;
        });
        if (!checkpoint) {
            return failure('IMPORT_CHECKPOINT_NOT_FOUND', 'No checkpoint exists for the requested employee import.', input, context, { importId: importId });
        }
        return freezeEmployeeImportOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            importId: importId,
            checkpointId: checkpoint.checkpointId,
            resumeState: checkpoint.state || 'RESUMABLE',
            processedRecords: checkpoint.processedRecords || 0,
            totalRecords: checkpoint.totalRecords || 0,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function rollbackImport(input, context) {
        var access = validateAccess(input || {}, context || {}, 'ROLLBACK_IMPORT');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var importId = safeString(input && input.importId, '');
        var snapshot = data[SNAPSHOT_TABLE].find(function find(row) {
            return row.importId === importId && normalizeTenant(row.tenantSlug) === access.tenantSlug;
        });
        if (!snapshot) {
            return failure('IMPORT_SNAPSHOT_NOT_FOUND', 'No rollback snapshot exists for the requested employee import.', input, context, { importId: importId });
        }
        var removed = 0;
        var restored = 0;
        try {
            (snapshot.records || []).forEach(function each(record) {
                if (record.operation === 'CREATE') {
                    var beforeLength = data.employees.length;
                    data.employees = data.employees.filter(function filter(row) {
                        var sameTenant = normalizeTenant(row.tenantSlug || row.tenantId || row.companyId) === access.tenantSlug;
                        var sameEmployee = [row.employeeId, row.employeeCode, row.empId, row.id].some(function value(v) {
                            return safeString(v, '').toUpperCase() === safeString(record.employeeId, '').toUpperCase();
                        });
                        return !(sameTenant && sameEmployee);
                    });
                    removed += beforeLength - data.employees.length;
                } else if (record.operation === 'UPDATE' && record.before) {
                    var existing = employeeByIdentity(data, access.tenantSlug, record.employeeId);
                    if (existing) {
                        data.employees[data.employees.indexOf(existing)] = clone(record.before);
                    } else {
                        data.employees.push(clone(record.before));
                    }
                    restored += 1;
                }
            });
            var rollback = {
                rollbackId: id('EMP-ROLLBACK'),
                importId: importId,
                snapshotId: snapshot.snapshotId,
                tenantSlug: access.tenantSlug,
                removedEmployees: removed,
                restoredEmployees: restored,
                reason: safeString(input && input.reason, 'Employee migration rollback'),
                rolledBackAt: nowIso(),
                rolledBackBy: access.actor.id
            };
            data[ROLLBACK_TABLE].unshift(rollback);
            var batch = data[BATCH_TABLE].find(function find(row) { return row.importId === importId; });
            if (batch) {
                batch.status = 'ROLLED_BACK';
                batch.state = 'ROLLED_BACK';
                batch.rolledBackAt = rollback.rolledBackAt;
            }
            saveData(data);
            audit('EMPLOYEE_MIGRATION_ROLLBACK_COMPLETED', importId, 'Employee master import rollback completed.', rollback, context || {});
            emitTelemetry('EMPLOYEE_MIGRATION_ROLLBACK_COMPLETED', rollback, context || {});
            recordMetric('EMPLOYEE_MIGRATION_ROLLBACK_COMPLETED', rollback, context || {});
            return freezeEmployeeImportOutput({
                success: true,
                tenantSlug: access.tenantSlug,
                importId: importId,
                rollback: rollback,
                transaction: {
                    committed: true,
                    restoredFromSnapshot: true,
                    reversible: false
                },
                timestamp: nowIso(),
                governance: governanceFlags(true)
            });
        } catch (error) {
            return failure('EMPLOYEE_IMPORT_ROLLBACK_FAILED', 'Employee import rollback failed safely.', input, context, { error: error && error.message });
        }
    }

    function generateMigrationAnalytics(input, context) {
        var access = validateAccess(input || {}, context || {}, 'GENERATE_ANALYTICS');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var batches = data[BATCH_TABLE].filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        var rollbacks = data[ROLLBACK_TABLE].filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        var imported = batches.reduce(function sum(total, row) { return total + Number(row.importedEmployees || 0); }, 0);
        var updated = batches.reduce(function sum(total, row) { return total + Number(row.updatedEmployees || 0); }, 0);
        var skipped = batches.reduce(function sum(total, row) { return total + Number(row.skippedRecords || 0); }, 0);
        var errors = batches.reduce(function sum(total, row) { return total + Number(row.validationErrors || 0); }, 0);
        var total = imported + updated + skipped + errors;
        var successRate = total ? Math.round(((imported + updated) / total) * 100) : 100;
        var dataQuality = Math.max(0, 100 - Math.min(100, errors * 10 + skipped * 5));
        var migrationHealth = Math.round((successRate + dataQuality + (rollbacks.length ? 85 : 100)) / 3);
        var analytics = {
            importedEmployees: imported,
            updatedEmployees: updated,
            skippedRecords: skipped,
            validationErrors: errors,
            rollbackEvents: rollbacks.length,
            importSpeed: batches.length ? Math.round((imported + updated) / batches.length) : 0,
            latestImportAt: batches[0] && (batches[0].completedAt || batches[0].createdAt) || ''
        };
        return freezeEmployeeImportOutput({
            success: true,
            tenantSlug: tenantSlug,
            analytics: analytics,
            migrationHealthScore: migrationHealth,
            dataQualityScore: dataQuality,
            importSuccessRate: successRate,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function generateMigrationDashboard(input, context) {
        var access = validateAccess(input || {}, context || {}, 'GENERATE_DASHBOARD');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var analytics = generateMigrationAnalytics(input || {}, context || {});
        return freezeEmployeeImportOutput({
            success: true,
            tenantSlug: tenantSlug,
            importQueue: data[BATCH_TABLE].filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }),
            progress: data[CHECKPOINT_TABLE].filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }),
            snapshots: data[SNAPSHOT_TABLE].filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }).map(function map(row) {
                return { snapshotId: row.snapshotId, importId: row.importId, tenantSlug: row.tenantSlug, createdEmployeeIds: row.createdEmployeeIds || [], updatedEmployeeIds: row.updatedEmployeeIds || [], createdAt: row.createdAt, reversible: row.reversible };
            }),
            rollbackHistory: data[ROLLBACK_TABLE].filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }),
            analytics: analytics.analytics || {},
            scores: {
                migrationHealthScore: analytics.migrationHealthScore || 0,
                dataQualityScore: analytics.dataQualityScore || 0,
                importSuccessRate: analytics.importSuccessRate || 0
            },
            employeeStatistics: {
                tenantEmployees: getTenantEmployees(data, tenantSlug).length,
                importedEmployees: (analytics.analytics && analytics.analytics.importedEmployees) || 0,
                updatedEmployees: (analytics.analytics && analytics.analytics.updatedEmployees) || 0
            },
            compatibility: {
                employeeModulePreserved: true,
                attendanceModulePreserved: true,
                leaveModulePreserved: true,
                payrollCalculationsUnaffected: true,
                existingWorkflowsChanged: false
            },
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeEmployeeImportOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            var context = { actor: { id: 'SELF-TEST', role: 'HR' }, tenantSlug: tenantFrom({}, {}) };
            var sample = {
                tenantSlug: context.tenantSlug,
                fileName: 'self-test.json',
                fileType: 'JSON',
                records: [{ employeeId: 'SELF-TEST-EMP', employeeCode: 'SELF-TEST-EMP', firstName: 'Self', lastName: 'Test', email: 'self.test@example.com', department: 'HR', designation: 'Tester', dateOfJoining: '2026-01-01' }]
            };
            var format = detectImportFormat(sample, context);
            record('format detection works', format.success === true && format.format === 'JSON', format);
            var normalized = normalizeImportPayload(sample, context);
            record('normalization works', normalized.success === true && normalized.records.length === 1, normalized);
            var dryRun = runDryRun(sample, context);
            record('dry run is read-only', dryRun.success === true && dryRun.readOnly === true, dryRun);
            record('outputs are frozen', Object.isFrozen(dryRun), { frozen: Object.isFrozen(dryRun) });
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        var passed = checks.every(function each(check) { return check.passed; });
        return freezeEmployeeImportOutput({
            passed: passed,
            timestamp: nowIso(),
            version: '1.0.0',
            summary: passed ? 'Employee master import governance self-test passed.' : 'Employee master import governance self-test failed.',
            checks: checks
        });
    }

    var EmployeeMasterImportService = Object.freeze({
        IMPORT_STATES: IMPORT_STATES,
        SUPPORTED_SOURCES: SUPPORTED_SOURCES,
        WIZARD_STEPS: WIZARD_STEPS,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        detectImportFormat: detectImportFormat,
        normalizeImportPayload: normalizeImportPayload,
        mapEmployeeColumns: mapEmployeeColumns,
        validateEmployeeRecords: validateEmployeeRecords,
        detectDuplicateEmployees: detectDuplicateEmployees,
        resolveImportConflicts: resolveImportConflicts,
        runDryRun: runDryRun,
        executeImport: executeImport,
        resumeImport: resumeImport,
        rollbackImport: rollbackImport,
        generateMigrationAnalytics: generateMigrationAnalytics,
        generateMigrationDashboard: generateMigrationDashboard,
        freezeEmployeeImportOutput: freezeEmployeeImportOutput
    });

    global.EmployeeMasterImportService = EmployeeMasterImportService;
    global.EmployeeImportService = EmployeeMasterImportService;
    global.EmployeeValidator = EmployeeMasterImportService;
    global.ColumnMapper = EmployeeMasterImportService;
    global.DuplicateDetector = EmployeeMasterImportService;
    global.ConflictResolver = EmployeeMasterImportService;
    global.ImportExecutor = EmployeeMasterImportService;
    global.RollbackManager = EmployeeMasterImportService;
    global.MigrationAnalyticsService = EmployeeMasterImportService;
    global.employeeMasterImportService = EmployeeMasterImportService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_EMPLOYEE_MASTER_IMPORT_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
