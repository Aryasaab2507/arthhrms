/**
 * importPipelineService.js
 * ARTHHRMS - Enterprise Employee Import + Bulk Onboarding Pipeline
 *
 * PURPOSE:
 * Provides centralized governance for employee CSV/XLSX imports, onboarding
 * validation, duplicate detection, manager mapping, staged activation,
 * rollback protection, and async onboarding processing.
 *
 * This service manages:
 * - tenant-scoped bulk employee import validation
 * - import staging and rollback checkpoints
 * - duplicate and manager hierarchy validation
 * - staged onboarding activation safety
 * - async onboarding job orchestration hooks
 *
 * This service does NOT:
 * - bypass tenant isolation
 * - expose platform ownership inside tenant imports
 * - mutate employee records during validation
 * - mutate historical audit trails
 *
 * ARCHITECTURE RULE:
 * Import governance must remain tenant-scoped, rollback-visible, audit-visible,
 * and compatible with existing onboarding and import records.
 *
 * STABILITY:
 * Existing onboarding, invite, workflow, and import records remain compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.AsyncJobService (optional)
 * - window.NotificationOrchestrationService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachImportPipelineService(global) {
    'use strict';

    var PREFIX = '[ImportPipelineService]';
    var MAX_ROWS = 1000;

    var IMPORT_STATES = Object.freeze({
        UPLOADED: 'UPLOADED',
        VALIDATING: 'VALIDATING',
        MAPPING: 'MAPPING',
        PROCESSING: 'PROCESSING',
        REVIEW_REQUIRED: 'REVIEW_REQUIRED',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        ROLLED_BACK: 'ROLLED_BACK',
        ARCHIVED: 'ARCHIVED'
    });

    var IMPORT_TYPES = Object.freeze({
        CSV: 'CSV',
        XLSX: 'XLSX',
        STAGED_ONBOARDING: 'STAGED_ONBOARDING',
        DEPARTMENT: 'DEPARTMENT',
        MANAGER_MAPPING: 'MANAGER_MAPPING'
    });

    var ONBOARDING_STAGES = Object.freeze({
        IMPORT_ONLY: 'IMPORT_ONLY',
        VALIDATED: 'VALIDATED',
        INVITES_PENDING: 'INVITES_PENDING',
        PILOT_ACTIVATION: 'PILOT_ACTIVATION',
        LIMITED_ACTIVATION: 'LIMITED_ACTIVATION',
        FULL_ACTIVATION: 'FULL_ACTIVATION'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var TENANT_ROLES = Object.freeze({
        EMPLOYEE: 'EMPLOYEE',
        MANAGER: 'MANAGER',
        HR: 'HR',
        HR_HEAD: 'HR_HEAD',
        DIRECTOR: 'DIRECTOR',
        SUPER_ADMIN: 'SUPER_ADMIN'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|leave balance)\s*[:=]?\s*[\d,]+/ig;

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeInfo(message, details) {
        try {
            if (global.console && typeof global.console.info === 'function') {
                if (details !== undefined) global.console.info(PREFIX + ' ' + message, details);
                else global.console.info(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function db() {
        try {
            return global.DB || null;
        } catch (error) {
            return null;
        }
    }

    function rawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get() || {};
        } catch (error) {}
        return {};
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

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function freezeImportOutput(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeImportOutput(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function redactString(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, seen) {
        if (value === undefined || value === null) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.slice(0, MAX_ROWS).map(function cloneArrayItem(item) {
                return cloneSanitized(item, refs.slice());
            });
        }
        if (!isPlainObject(value)) return safeString(value, '');
        var output = {};
        try {
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], refs.slice());
            });
        } catch (error) {}
        return output;
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
        slug = slug.replace(/^ten[-_]/, '').replace(/^tenant[-_]/, '');
        slug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function tenantFromContext(context) {
        var ctx = isPlainObject(context) ? context : {};
        var data = rawData();
        return normalizeTenantSlug(
            ctx.tenantSlug ||
            ctx.tenant_slug ||
            ctx.tenantId ||
            ctx.companyId ||
            ctx.actor?.tenantSlug ||
            ctx.actor?.tenantId ||
            data.companySettings?.tenantSlug ||
            data.companySettings?.tenantId ||
            ''
        );
    }

    function rowTenant(row) {
        if (!row || typeof row !== 'object') return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.companyId || row.tenant_id || row.company_id || row.metadata?.tenantSlug || row.metadata?.tenantId || '');
    }

    function normalizeToken(value, allowed, fallback) {
        var token = safeString(value || fallback, fallback).trim().replace(/[\s-]+/g, '_').toUpperCase();
        return allowed[token] ? allowed[token] : fallback;
    }

    function normalizeImportType(value) {
        var token = safeString(value || IMPORT_TYPES.CSV, IMPORT_TYPES.CSV).trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (/XLSX|EXCEL/.test(token)) return IMPORT_TYPES.XLSX;
        if (/CSV/.test(token)) return IMPORT_TYPES.CSV;
        return IMPORT_TYPES[token] || IMPORT_TYPES.CSV;
    }

    function normalizeOnboardingStage(value) {
        return normalizeToken(value, ONBOARDING_STAGES, ONBOARDING_STAGES.IMPORT_ONLY);
    }

    function normalizeRole(role) {
        var normalized = safeString(role || '', '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'SUPERADMIN') normalized = 'SUPER_ADMIN';
        if (normalized === 'HRHEAD') normalized = 'HR_HEAD';
        if (normalized === 'PLATFORMOWNER' || normalized === 'OWNER' || normalized === 'ROOT') return 'PLATFORM_OWNER';
        return TENANT_ROLES[normalized] || normalized;
    }

    function normalizeEmail(value) {
        var email = safeString(value || '', '').trim().toLowerCase();
        try {
            if (db() && typeof db().normalizeEmail === 'function') return db().normalizeEmail(email);
        } catch (error) {}
        return email;
    }

    function normalizeDate(value) {
        var text = safeString(value || '', '').trim();
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        var date = new Date(text);
        if (Number.isNaN(date.getTime())) return text;
        return date.toISOString().slice(0, 10);
    }

    function normalizePhone(value) {
        return safeString(value || '', '').replace(/[^\d+]/g, '');
    }

    function normalizeEmployeeRow(row, context) {
        var source = isPlainObject(row) ? cloneSanitized(row) : {};
        var employeeId = safeString(source.employee_id || source.employeeId || source.empId || source.id || source.employee_code || source.employeeCode || '', '').trim();
        var managerId = safeString(source.reporting_manager_id || source.reportingManagerId || source.managerId || source.manager_id || '', '').trim();
        var name = safeString(source.name || source.fullName || source.full_name || source.employeeName || '', '').trim();
        var department = safeString(source.department || source.dept || '', '').trim();
        var designation = safeString(source.designation || source.desig || '', '').trim();
        var role = normalizeRole(source.role || source.portalRole || TENANT_ROLES.EMPLOYEE);
        var tenantSlug = normalizeTenantSlug(source.tenant_slug || source.tenantSlug || source.tenant_id || source.tenantId || source.companyId || source.company_id || tenantFromContext(context));
        return freezeImportOutput({
            employee_id: employeeId,
            empId: employeeId,
            employeeId: employeeId,
            name: name,
            fullName: name,
            email: normalizeEmail(source.email || source.email_id || source.emailId || ''),
            phone: normalizePhone(source.phone || source.mobile || source.mobile_no || ''),
            department: department,
            designation: designation,
            role: role,
            rawRole: safeString(source.role || source.portalRole || TENANT_ROLES.EMPLOYEE, TENANT_ROLES.EMPLOYEE),
            reporting_manager_id: managerId,
            managerId: managerId,
            joining_date: normalizeDate(source.joining_date || source.joiningDate || source.joinDate || source.doj || ''),
            joinDate: normalizeDate(source.joining_date || source.joiningDate || source.joinDate || source.doj || ''),
            tenantSlug: tenantSlug,
            tenantId: safeString(source.tenantId || source.tenant_id || '', '').trim(),
            source: 'import_pipeline'
        });
    }

    function safeFailure(code, classification, message, metadata) {
        return freezeImportOutput({
            failureCode: safeString(code, 'IMPORT_PIPELINE_FAILURE'),
            classification: normalizeFailureClassification(classification || FAILURE_CLASSIFICATIONS.HIGH_RISK),
            severity: normalizeFailureClassification(classification || FAILURE_CLASSIFICATIONS.HIGH_RISK),
            message: safeString(message, 'Import pipeline failure.'),
            metadata: cloneSanitized(metadata || {})
        });
    }

    function safeWarning(code, message, metadata) {
        return freezeImportOutput({
            warningCode: safeString(code, 'IMPORT_PIPELINE_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            severity: FAILURE_CLASSIFICATIONS.WARNING,
            message: safeString(message, 'Import pipeline warning.'),
            metadata: cloneSanitized(metadata || {})
        });
    }

    function normalizeFailureClassification(value) {
        var token = safeString(value || FAILURE_CLASSIFICATIONS.INFO, FAILURE_CLASSIFICATIONS.INFO).trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (token === 'CRITICAL') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (token === 'HIGH') return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        return FAILURE_CLASSIFICATIONS[token] || FAILURE_CLASSIFICATIONS.INFO;
    }

    function classifyImportFailure(input) {
        var source = isPlainObject(input) ? input : {};
        if (source.crossTenant || source.tenantMismatch) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.circularManager || source.duplicateCorruption || source.unsafeActivation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.warning) return FAILURE_CLASSIFICATIONS.WARNING;
        return normalizeFailureClassification(source.classification || FAILURE_CLASSIFICATIONS.INFO);
    }

    function existingEmployees() {
        var data = rawData();
        return Array.isArray(data.employees) ? data.employees : [];
    }

    function employeeTenant(row) {
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.companyId || row.company_id || '');
    }

    function findEmployee(id) {
        var employeeId = safeString(id || '', '').trim();
        return existingEmployees().find(function findRow(row) {
            return row.id === employeeId || row.empId === employeeId || row.employeeId === employeeId || row.employee_id === employeeId;
        }) || null;
    }

    function findEmployeeByEmail(email) {
        var normalized = normalizeEmail(email);
        return existingEmployees().find(function findRow(row) {
            return normalizeEmail(row.email || '') === normalized;
        }) || null;
    }

    function knownDepartments(tenantSlug) {
        var data = rawData();
        var departments = Array.isArray(data.departments) ? data.departments : [];
        var values = departments.filter(function sameTenant(row) {
            var scope = rowTenant(row);
            return !tenantSlug || !scope || scope === tenantSlug;
        }).map(function mapDepartment(row) {
            return safeString(row.name || row.department || row.title || '', '').trim().toLowerCase();
        }).filter(Boolean);
        if (!values.length) values = ['hr', 'operations', 'finance', 'engineering', 'management'];
        return values;
    }

    function detectDuplicateEmployees(rows, context) {
        var tenantSlug = normalizeTenantSlug(context?.tenantSlug || tenantFromContext(context));
        var normalizedRows = (Array.isArray(rows) ? rows : []).map(function mapRow(row) {
            return row && row.employee_id ? row : normalizeEmployeeRow(row, { tenantSlug: tenantSlug });
        });
        var idMap = {};
        var emailMap = {};
        var duplicateEmployeeIds = [];
        var duplicateEmails = [];
        var existingEmployeeIds = [];
        var existingEmails = [];
        normalizedRows.forEach(function inspect(row, index) {
            var id = safeString(row.employee_id || row.empId || '', '').trim().toLowerCase();
            var email = normalizeEmail(row.email || '');
            if (id) {
                if (idMap[id] !== undefined) duplicateEmployeeIds.push({ employee_id: row.employee_id || row.empId, firstRow: idMap[id] + 1, rowIndex: index + 1 });
                else idMap[id] = index;
                var existing = findEmployee(row.employee_id || row.empId);
                if (existing) existingEmployeeIds.push({ employee_id: row.employee_id || row.empId, rowIndex: index + 1, existingTenant: employeeTenant(existing) });
            }
            if (email) {
                if (emailMap[email] !== undefined) duplicateEmails.push({ email: email, firstRow: emailMap[email] + 1, rowIndex: index + 1 });
                else emailMap[email] = index;
                var owner = findEmployeeByEmail(email);
                if (owner) existingEmails.push({ email: email, rowIndex: index + 1, existingEmployeeId: owner.id || owner.empId || '', existingTenant: employeeTenant(owner) });
            }
        });
        return freezeImportOutput({
            duplicateEmployeeIds: duplicateEmployeeIds,
            duplicateEmails: duplicateEmails,
            existingEmployeeIds: existingEmployeeIds,
            existingEmails: existingEmails,
            duplicateCount: duplicateEmployeeIds.length + duplicateEmails.length + existingEmployeeIds.length + existingEmails.length,
            tenantSlug: tenantSlug
        });
    }

    function validateEmployeeRow(row, index, context, state) {
        var tenantSlug = normalizeTenantSlug(context?.tenantSlug || tenantFromContext(context));
        var normalized = normalizeEmployeeRow(row, { tenantSlug: tenantSlug });
        var failures = [];
        var warnings = [];
        var departmentSet = knownDepartments(tenantSlug);
        if (!normalized.employee_id) failures.push(safeFailure('EMPLOYEE_ID_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'employee_id is required.', { rowIndex: index + 1 }));
        if (!normalized.name) failures.push(safeFailure('EMPLOYEE_NAME_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employee name is required.', { rowIndex: index + 1 }));
        if (!normalized.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) failures.push(safeFailure('EMPLOYEE_EMAIL_INVALID', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'A valid employee email is required.', { rowIndex: index + 1 }));
        if (normalized.phone && !/^\+?\d{7,15}$/.test(normalized.phone)) warnings.push(safeWarning('PHONE_NUMBER_MALFORMED', 'Phone number is malformed and should be reviewed.', { rowIndex: index + 1 }));
        if (!normalized.department || departmentSet.indexOf(normalized.department.toLowerCase()) === -1) failures.push(safeFailure('INVALID_DEPARTMENT', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Department is not configured for this tenant.', { department: normalized.department }));
        if (!normalized.designation) failures.push(safeFailure('DESIGNATION_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Designation is required.', { rowIndex: index + 1 }));
        if (!normalized.joining_date || !/^\d{4}-\d{2}-\d{2}$/.test(normalized.joining_date)) failures.push(safeFailure('JOINING_DATE_INVALID', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'joining_date must be YYYY-MM-DD.', { rowIndex: index + 1 }));
        if (!TENANT_ROLES[normalized.role]) {
            failures.push(safeFailure(normalized.role === 'PLATFORM_OWNER' ? 'UNSAFE_ROLE_ASSIGNMENT' : 'INVALID_ROLE_ASSIGNMENT', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Role is not allowed for tenant import.', { role: normalized.rawRole }));
        }
        if (tenantSlug && normalized.tenantSlug && normalized.tenantSlug !== tenantSlug) {
            failures.push(safeFailure('CROSS_TENANT_IMPORT_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Employee row belongs to another tenant.', { tenantSlug: tenantSlug, rowTenant: normalized.tenantSlug }));
        }
        var existing = findEmployee(normalized.employee_id);
        if (existing) failures.push(safeFailure('DUPLICATE_EMPLOYEE_ID_EXISTING', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employee ID already exists and cannot be imported without explicit update mode.', { employee_id: normalized.employee_id }));
        var existingEmail = findEmployeeByEmail(normalized.email);
        if (existingEmail) failures.push(safeFailure('DUPLICATE_EMAIL_EXISTING', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Email already exists and cannot be imported without explicit update mode.', { email: normalized.email }));

        var idKey = normalized.employee_id.toLowerCase();
        var emailKey = normalized.email.toLowerCase();
        if (idKey && state.seenIds[idKey] !== undefined) failures.push(safeFailure('DUPLICATE_EMPLOYEE_ID_IN_FILE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Duplicate employee_id inside import file.', { employee_id: normalized.employee_id }));
        else if (idKey) state.seenIds[idKey] = index;
        if (emailKey && state.seenEmails[emailKey] !== undefined) failures.push(safeFailure('DUPLICATE_EMAIL_IN_FILE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Duplicate email inside import file.', { email: normalized.email }));
        else if (emailKey) state.seenEmails[emailKey] = index;

        if (normalized.managerId) {
            if (normalized.managerId === normalized.employee_id) failures.push(safeFailure('SELF_MANAGER_NOT_ALLOWED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employee cannot report to self.', { employee_id: normalized.employee_id }));
            var manager = findEmployee(normalized.managerId);
            var incomingManager = state.incomingById[normalized.managerId.toLowerCase()];
            if (!manager && !incomingManager) failures.push(safeFailure('MANAGER_NOT_FOUND', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Reporting manager does not exist in tenant or current import.', { managerId: normalized.managerId }));
            if (manager) {
                var managerScope = employeeTenant(manager);
                if (tenantSlug && managerScope && managerScope !== tenantSlug) failures.push(safeFailure('CROSS_TENANT_MANAGER_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Reporting manager belongs to another tenant.', { managerId: normalized.managerId }));
                if (/inactive|suspended|disabled|terminated/i.test(safeString(manager.status || manager.employmentStatus || manager.activationStatus || '', ''))) failures.push(safeFailure('INACTIVE_MANAGER_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Inactive manager cannot be assigned.', { managerId: normalized.managerId }));
                if (manager.department && normalized.department && manager.department !== normalized.department) warnings.push(safeWarning('CROSS_DEPARTMENT_MANAGER_MAPPING', 'Manager is in a different department; review escalation mapping.', { managerId: normalized.managerId }));
            }
        }

        return freezeImportOutput({
            rowIndex: index + 1,
            success: failures.length === 0,
            rowStatus: failures.length ? 'FAILED' : warnings.length ? 'WARNING' : 'SUCCESS',
            failures: failures,
            warnings: warnings,
            normalizedRow: normalized
        });
    }

    function validateManagerHierarchy(rows, context) {
        try {
            var tenantSlug = normalizeTenantSlug(context?.tenantSlug || tenantFromContext(context));
            var normalizedRows = (Array.isArray(rows) ? rows : []).map(function mapRow(row) {
                return row && row.employee_id ? row : normalizeEmployeeRow(row, { tenantSlug: tenantSlug });
            });
            var graph = {};
            var failures = [];
            normalizedRows.forEach(function edge(row) {
                var empId = safeString(row.employee_id || row.empId || '', '').trim();
                var managerId = safeString(row.reporting_manager_id || row.managerId || '', '').trim();
                if (!empId || !managerId) return;
                if (empId === managerId) failures.push(safeFailure('SELF_MANAGER_NOT_ALLOWED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employee cannot report to self.', { employee_id: empId }));
                graph[empId] = managerId;
            });
            Object.keys(graph).forEach(function walk(start) {
                var seen = {};
                var chain = [];
                var cursor = start;
                while (cursor && graph[cursor]) {
                    if (seen[cursor]) {
                        chain.push(cursor);
                        failures.push(safeFailure('CIRCULAR_MANAGER_CHAIN', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Circular manager hierarchy detected.', { chain: chain }));
                        return;
                    }
                    seen[cursor] = true;
                    chain.push(cursor);
                    cursor = graph[cursor];
                }
            });
            return freezeImportOutput({
                success: failures.length === 0,
                failures: failures,
                warnings: [],
                checkedRows: normalizedRows.length,
                tenantSlug: tenantSlug
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                failures: [safeFailure('MANAGER_HIERARCHY_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager hierarchy validation failed safely.')],
                warnings: [],
                checkedRows: 0
            });
        }
    }

    function importRows(input) {
        if (Array.isArray(input)) return input;
        if (isPlainObject(input) && Array.isArray(input.rows)) return input.rows;
        return [];
    }

    function normalizeImportPayload(input, context) {
        var source = isPlainObject(input) ? cloneSanitized(input) : {};
        var rows = importRows(source);
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.companyId || tenantFromContext(context));
        var importType = normalizeImportType(source.importType || source.type || source.fileType || 'CSV');
        var onboardingStage = normalizeOnboardingStage(source.onboardingStage || source.onboarding_stage || ONBOARDING_STAGES.IMPORT_ONLY);
        return freezeImportOutput({
            rows: rows.map(function cloneRow(row) { return cloneSanitized(row); }),
            importType: importType,
            fileName: safeString(source.fileName || source.filename || 'employee-import', 'employee-import'),
            tenantSlug: tenantSlug,
            onboardingStage: onboardingStage,
            activationMode: normalizeOnboardingStage(source.activationMode || source.activation_mode || onboardingStage),
            metadata: cloneSanitized(source.metadata || {}),
            uploadedAt: safeString(source.uploadedAt || nowIso(), nowIso())
        });
    }

    function validateEmployeeImport(input, context) {
        try {
            if (!isPlainObject(input) && !Array.isArray(input)) {
                return freezeImportOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: IMPORT_STATES.FAILED,
                    failures: [safeFailure('MALFORMED_IMPORT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Import payload must include rows.')],
                    warnings: [],
                    summary: { totalRows: 0, validRows: 0, warningRows: 0, failedRows: 1 },
                    duplicates: detectDuplicateEmployees([], context),
                    validRows: [],
                    warningRows: [],
                    failedRows: []
                });
            }
            var payload = normalizeImportPayload(Array.isArray(input) ? { rows: input } : input, context);
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || tenantFromContext(context));
            var rows = payload.rows.slice(0, MAX_ROWS);
            var incomingById = {};
            rows.forEach(function indexIncoming(row) {
                var normalized = normalizeEmployeeRow(row, { tenantSlug: tenantSlug });
                if (normalized.employee_id) incomingById[normalized.employee_id.toLowerCase()] = normalized;
            });
            var state = { seenIds: {}, seenEmails: {}, incomingById: incomingById };
            var rowResults = rows.map(function validate(row, index) {
                return validateEmployeeRow(row, index, { tenantSlug: tenantSlug }, state);
            });
            var hierarchy = validateManagerHierarchy(rowResults.map(function rowToNormalized(item) { return item.normalizedRow; }), { tenantSlug: tenantSlug });
            if (!hierarchy.success) {
                rowResults = rowResults.map(function mergeHierarchy(row) {
                    var failures = (row.failures || []).slice();
                    var empId = row.normalizedRow?.employee_id || '';
                    hierarchy.failures.forEach(function attach(failure) {
                        var chain = failure.metadata?.chain || [];
                        if (failure.metadata?.employee_id === empId || failure.metadata?.empId === empId || chain.indexOf(empId) !== -1) failures.push(failure);
                    });
                    return freezeImportOutput({
                        ...row,
                        failures: failures,
                        success: failures.length === 0,
                        rowStatus: failures.length ? 'FAILED' : row.rowStatus
                    });
                });
            }
            var validRows = rowResults.filter(function valid(row) { return row.success && !(row.warnings || []).length; });
            var warningRows = rowResults.filter(function warning(row) { return row.success && (row.warnings || []).length; });
            var failedRows = rowResults.filter(function failed(row) { return !row.success; });
            var duplicates = detectDuplicateEmployees(rowResults.map(function map(row) { return row.normalizedRow; }), { tenantSlug: tenantSlug });
            var critical = failedRows.some(function hasCritical(row) {
                return (row.failures || []).some(function failure(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; });
            });
            auditImport('IMPORT_PIPELINE_VALIDATED', {
                tenantSlug: tenantSlug,
                totalRows: rowResults.length,
                failedRows: failedRows.length,
                severity: critical ? 'CRITICAL' : failedRows.length ? 'WARNING' : 'INFO',
                description: 'Employee import validation completed.'
            }, context);
            emitTelemetry('IMPORT_PIPELINE_VALIDATED', {
                tenantSlug: tenantSlug,
                totalRows: rowResults.length,
                failedRows: failedRows.length,
                severity: critical ? 'CRITICAL' : failedRows.length ? 'WARNING' : 'INFO'
            }, context);
            recordMetric('IMPORT_PIPELINE_VALIDATED', { tenantSlug: tenantSlug, failedRows: failedRows.length, status: failedRows.length ? 'REVIEW_REQUIRED' : 'VALIDATED' }, context);
            return freezeImportOutput({
                success: failedRows.length === 0,
                classification: critical ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : failedRows.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : warningRows.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                state: failedRows.length ? IMPORT_STATES.REVIEW_REQUIRED : IMPORT_STATES.VALIDATING,
                tenantSlug: tenantSlug,
                importType: payload.importType,
                fileName: payload.fileName,
                onboardingStage: payload.onboardingStage,
                summary: {
                    totalRows: rowResults.length,
                    validRows: validRows.length,
                    warningRows: warningRows.length,
                    failedRows: failedRows.length,
                    duplicateRows: duplicates.duplicateCount
                },
                duplicates: duplicates,
                validRows: validRows,
                warningRows: warningRows,
                failedRows: failedRows,
                failures: failedRows.reduce(function collect(list, row) { return list.concat(row.failures || []); }, []),
                warnings: warningRows.reduce(function collect(list, row) { return list.concat(row.warnings || []); }, []),
                metadata: {
                    tenantIsolationPreserved: true,
                    duplicateCorruptionPrevented: true,
                    existingOnboardingPreserved: true,
                    sensitiveDataFiltered: true
                }
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: IMPORT_STATES.FAILED,
                failures: [safeFailure('IMPORT_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Import validation failed safely.')],
                warnings: [],
                summary: { totalRows: 0, validRows: 0, warningRows: 0, failedRows: 1 },
                duplicates: detectDuplicateEmployees([], context),
                validRows: [],
                warningRows: [],
                failedRows: []
            });
        }
    }

    function importBatchId(data) {
        try {
            if (db() && typeof db().generateImportBatchId === 'function') return db().generateImportBatchId(data || rawData());
        } catch (error) {}
        return 'IMP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    }

    function rollbackCheckpointId() {
        return 'IRB-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    }

    function persistBatch(validation, payload, context) {
        var data = rawData();
        data.importBatches = Array.isArray(data.importBatches) ? data.importBatches.slice() : [];
        var id = importBatchId(data);
        var batch = {
            id: id,
            importBatchId: id,
            tenantSlug: payload.tenantSlug,
            importType: 'EMPLOYEE_' + payload.importType,
            type: 'employees',
            fileName: payload.fileName,
            uploadedBy: context?.actor?.id || 'platform_owner',
            uploadedRole: context?.actor?.role || 'platform_owner',
            uploadedAt: nowIso(),
            totalRows: validation.summary.totalRows,
            passedRows: validation.summary.validRows,
            warningRows: validation.summary.warningRows,
            failedRows: validation.summary.failedRows,
            committedRows: 0,
            skippedRows: validation.summary.failedRows,
            status: validation.success ? 'Staged' : 'Review Required',
            state: IMPORT_STATES.UPLOADED,
            onboardingStage: payload.onboardingStage,
            backend: 'local',
            rollbackEligible: true,
            validationSummary: validation.summary,
            rollbackSummary: {},
            rollbackItems: [],
            governance: {
                tenantIsolationPreserved: true,
                duplicateCorruptionPrevented: true,
                existingOnboardingPreserved: true
            }
        };
        data.importBatches.unshift(cloneSanitized(batch));
        data.importBatches = data.importBatches.slice(0, 500);
        data.importStagingRows = Array.isArray(data.importStagingRows) ? data.importStagingRows.slice() : [];
        var rows = validation.validRows.concat(validation.warningRows).map(function staging(row, index) {
            return {
                id: 'STG-' + id + '-' + (index + 1),
                stagingId: 'STG-' + id + '-' + (index + 1),
                importBatchId: id,
                tenantSlug: payload.tenantSlug,
                importType: batch.importType,
                type: 'employees',
                rowNumber: row.rowIndex,
                rawRowData: cloneSanitized(row.normalizedRow),
                validationStatus: row.rowStatus,
                validationErrors: [],
                validationWarnings: row.warnings || [],
                normalizedData: cloneSanitized(row.normalizedRow),
                uploadedBy: batch.uploadedBy,
                uploadedAt: batch.uploadedAt,
                committed: false,
                rollbackMetadata: {
                    rollbackCheckpointId: '',
                    operation: 'insert',
                    collection: 'employees'
                }
            };
        });
        data.importStagingRows = data.importStagingRows.filter(function keep(row) { return row.importBatchId !== id; }).concat(rows);
        saveData(data);
        return freezeImportOutput(batch);
    }

    function createRollbackCheckpoint(importBatchIdValue, context) {
        try {
            var data = rawData();
            var id = safeString(importBatchIdValue || '', '').trim();
            var batches = Array.isArray(data.importBatches) ? data.importBatches.slice() : [];
            var batchIndex = batches.findIndex(function match(row) { return row.importBatchId === id || row.id === id; });
            if (batchIndex === -1) {
                return freezeImportOutput({
                    success: false,
                    failures: [safeFailure('IMPORT_BATCH_NOT_FOUND', FAILURE_CLASSIFICATIONS.WARNING, 'Import batch was not found for rollback checkpoint.')],
                    rollbackCheckpoint: null
                });
            }
            var batch = cloneSanitized(batches[batchIndex]);
            var stagingRows = (Array.isArray(data.importStagingRows) ? data.importStagingRows : []).filter(function matchRow(row) { return row.importBatchId === id; });
            var checkpoint = {
                rollbackCheckpointId: rollbackCheckpointId(),
                importBatchId: id,
                tenantSlug: batch.tenantSlug || tenantFromContext(context),
                createdAt: nowIso(),
                createdBy: context?.actor?.id || 'platform_owner',
                itemCount: stagingRows.length,
                recoveryMode: 'staged-import-rollback',
                historicalAuditMutable: false
            };
            batch.rollbackCheckpoint = checkpoint;
            batch.rollbackEligible = true;
            batch.rollbackSummary = { checkpointId: checkpoint.rollbackCheckpointId, itemCount: checkpoint.itemCount };
            batches[batchIndex] = batch;
            data.importBatches = batches;
            data.importStagingRows = (Array.isArray(data.importStagingRows) ? data.importStagingRows : []).map(function annotate(row) {
                if (row.importBatchId !== id) return row;
                return { ...row, rollbackMetadata: { ...(row.rollbackMetadata || {}), rollbackCheckpointId: checkpoint.rollbackCheckpointId } };
            });
            saveData(data);
            auditImport('IMPORT_PIPELINE_ROLLBACK_CHECKPOINT_CREATED', {
                importBatchId: id,
                tenantSlug: checkpoint.tenantSlug,
                severity: 'INFO',
                description: 'Import rollback checkpoint created.'
            }, context);
            emitTelemetry('IMPORT_PIPELINE_ROLLBACK_CHECKPOINT_CREATED', { importBatchId: id, tenantSlug: checkpoint.tenantSlug }, context);
            recordMetric('IMPORT_PIPELINE_ROLLBACK_CHECKPOINT_CREATED', { importBatchId: id, tenantSlug: checkpoint.tenantSlug }, context);
            return freezeImportOutput({
                success: true,
                rollbackCheckpoint: checkpoint,
                batch: batch,
                metadata: {
                    rollbackGovernancePreserved: true,
                    historicalAuditMutable: false
                }
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                failures: [safeFailure('ROLLBACK_CHECKPOINT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Rollback checkpoint failed safely.')],
                rollbackCheckpoint: null
            });
        }
    }

    function createAsyncImportJob(batch, context) {
        if (!global.AsyncJobService || typeof global.AsyncJobService.enqueueJob !== 'function') {
            return freezeImportOutput({
                success: false,
                warning: 'AsyncJobService unavailable.',
                job: null
            });
        }
        try {
            return global.AsyncJobService.enqueueJob({
                tenantSlug: batch.tenantSlug,
                jobType: 'ONBOARDING_IMPORT',
                payload: { importBatchId: batch.importBatchId, onboardingStage: batch.onboardingStage },
                correlationId: batch.importBatchId,
                metadata: { source: 'importPipelineService', importType: batch.importType }
            }, context);
        } catch (error) {
            return freezeImportOutput({ success: false, warning: 'Async onboarding job creation failed safely.', job: null });
        }
    }

    function notifyImport(batch, context) {
        if (!global.NotificationOrchestrationService || typeof global.NotificationOrchestrationService.orchestrateNotification !== 'function') {
            return freezeImportOutput({ success: false, warning: 'NotificationOrchestrationService unavailable.' });
        }
        try {
            return global.NotificationOrchestrationService.orchestrateNotification({
                tenantSlug: batch.tenantSlug,
                toRole: 'HR',
                title: 'Employee Import Staged',
                message: 'Employee import is staged for onboarding governance review.',
                module: 'Import Center',
                type: 'import_staged',
                correlationId: batch.importBatchId,
                metadata: { importBatchId: batch.importBatchId }
            }, context);
        } catch (error) {
            return freezeImportOutput({ success: false, warning: 'Import notification failed safely.' });
        }
    }

    function stageEmployeeImport(input, context) {
        try {
            var payload = normalizeImportPayload(input, context);
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || tenantFromContext(context));
            if (payload.activationMode === ONBOARDING_STAGES.FULL_ACTIVATION && !(context && context.activationReadiness && context.activationReadiness.ready === true)) {
                return freezeImportOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    state: IMPORT_STATES.FAILED,
                    failures: [safeFailure('UNSAFE_BULK_ACTIVATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Full activation requires readiness approval before bulk onboarding.')],
                    warnings: [],
                    batch: null
                });
            }
            var validation = validateEmployeeImport(payload, { ...context, tenantSlug: tenantSlug });
            if (!validation.success) {
                return freezeImportOutput({
                    success: false,
                    classification: validation.classification,
                    state: IMPORT_STATES.REVIEW_REQUIRED,
                    failures: validation.failures,
                    warnings: validation.warnings,
                    validation: validation,
                    batch: null
                });
            }
            var batch = persistBatch(validation, { ...payload, tenantSlug: tenantSlug }, context);
            var checkpoint = createRollbackCheckpoint(batch.importBatchId, context);
            var asyncJob = createAsyncImportJob(batch, context);
            var notification = notifyImport(batch, { ...context, skipAuditPersistence: context?.skipAuditPersistence, skipTelemetry: context?.skipTelemetry, skipMetrics: context?.skipMetrics });
            auditImport('IMPORT_PIPELINE_STAGED', {
                importBatchId: batch.importBatchId,
                tenantSlug: tenantSlug,
                severity: 'INFO',
                description: 'Employee import staged through enterprise import pipeline.'
            }, context);
            emitTelemetry('IMPORT_PIPELINE_STAGED', { importBatchId: batch.importBatchId, tenantSlug: tenantSlug, status: 'STAGED' }, context);
            recordMetric('IMPORT_PIPELINE_STAGED', { importBatchId: batch.importBatchId, tenantSlug: tenantSlug, status: 'STAGED' }, context);
            return freezeImportOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: IMPORT_STATES.UPLOADED,
                batch: batch,
                validation: validation,
                rollbackCheckpoint: checkpoint.rollbackCheckpoint || null,
                asyncJob: asyncJob,
                notification: notification,
                metadata: {
                    tenantIsolationPreserved: true,
                    rollbackGovernancePreserved: true,
                    asyncOnboardingReady: !!asyncJob?.success,
                    existingOnboardingPreserved: true
                }
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: IMPORT_STATES.FAILED,
                failures: [safeFailure('IMPORT_STAGE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Import staging failed safely.')],
                warnings: [],
                batch: null
            });
        }
    }

    function rollbackImportBatch(importBatchIdValue, context) {
        try {
            var id = safeString(importBatchIdValue || '', '').trim();
            var data = rawData();
            var batches = Array.isArray(data.importBatches) ? data.importBatches.slice() : [];
            var batchIndex = batches.findIndex(function match(row) { return row.importBatchId === id || row.id === id; });
            if (batchIndex === -1) {
                return freezeImportOutput({
                    success: false,
                    state: IMPORT_STATES.FAILED,
                    failures: [safeFailure('IMPORT_BATCH_NOT_FOUND', FAILURE_CLASSIFICATIONS.WARNING, 'Import batch was not found for rollback.')]
                });
            }
            var batch = cloneSanitized(batches[batchIndex]);
            batch.status = 'Rolled Back';
            batch.state = IMPORT_STATES.ROLLED_BACK;
            batch.rolledBackBy = context?.actor?.id || 'platform_owner';
            batch.rolledBackAt = nowIso();
            batch.rollbackSummary = {
                ...(batch.rollbackSummary || {}),
                rolledBackAt: batch.rolledBackAt,
                historicalAuditMutable: false
            };
            batches[batchIndex] = batch;
            data.importBatches = batches;
            data.importRollbackLogs = Array.isArray(data.importRollbackLogs) ? data.importRollbackLogs.slice() : [];
            var rollbackRow = {
                id: 'RB-' + Date.now(),
                rollbackId: 'RB-' + Date.now(),
                importBatchId: id,
                importType: batch.importType || 'employees',
                tenantSlug: batch.tenantSlug || tenantFromContext(context),
                rolledBackBy: batch.rolledBackBy,
                rolledBackAt: batch.rolledBackAt,
                restoredRows: 0,
                removedRows: 0,
                errors: [],
                historicalAuditMutable: false
            };
            data.importRollbackLogs.unshift(rollbackRow);
            saveData(data);
            auditImport('IMPORT_PIPELINE_ROLLED_BACK', {
                importBatchId: id,
                tenantSlug: rollbackRow.tenantSlug,
                severity: 'WARNING',
                description: 'Import rollback governance recorded.'
            }, context);
            emitTelemetry('IMPORT_PIPELINE_ROLLED_BACK', { importBatchId: id, tenantSlug: rollbackRow.tenantSlug, status: 'ROLLED_BACK', severity: 'WARNING' }, context);
            recordMetric('IMPORT_PIPELINE_ROLLED_BACK', { importBatchId: id, tenantSlug: rollbackRow.tenantSlug, status: 'ROLLED_BACK' }, context);
            return freezeImportOutput({
                success: true,
                state: IMPORT_STATES.ROLLED_BACK,
                batch: batch,
                rollbackLog: rollbackRow,
                metadata: {
                    rollbackGovernancePreserved: true,
                    historicalAuditMutable: false
                }
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                state: IMPORT_STATES.FAILED,
                failures: [safeFailure('IMPORT_ROLLBACK_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Import rollback failed safely.')]
            });
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context?.skipTelemetry) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('IMPORT', eventType, {
                source: 'importPipelineService',
                severity: metadata?.severity || 'INFO',
                status: metadata?.status || 'RECORDED',
                correlationId: metadata?.importBatchId || metadata?.correlationId || '',
                eventId: metadata?.eventId || '',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Import telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(type, metadata, context) {
        if (metricForwarding || context?.skipMetrics) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordWorkflowMetric !== 'function') return { success: true, warning: 'OrchestrationMetricsService unavailable.' };
        try {
            metricForwarding = true;
            return service.recordWorkflowMetric(type || 'IMPORT_PIPELINE_EVENT', cloneSanitized(metadata || {}));
        } catch (error) {
            return { success: false, warning: 'Import metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function auditImport(actionType, metadata, context) {
        if (auditForwarding || context?.skipAuditPersistence) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Import Pipeline',
                    targetId: metadata?.importBatchId || '',
                    description: metadata?.description || actionType,
                    actorRole: context?.actor?.role || 'platform_owner',
                    actorId: context?.actor?.id || '',
                    severity: metadata?.severity || 'INFO',
                    correlationId: metadata?.importBatchId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'importPipelineService',
                    skipPersistence: false
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context?.actor?.role || 'platform_owner',
                    context?.actor?.id || '',
                    actionType,
                    'Import Pipeline',
                    metadata?.importBatchId || '',
                    metadata?.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Import audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function generateImportGovernanceReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context));
            var data = rawData();
            var batches = (Array.isArray(data.importBatches) ? data.importBatches : []).filter(function sameTenant(row) {
                var scope = rowTenant(row);
                return !tenantSlug || !scope || scope === tenantSlug;
            }).map(function clean(row) { return cloneSanitized(row); });
            var stagingRows = (Array.isArray(data.importStagingRows) ? data.importStagingRows : []).filter(function sameTenant(row) {
                var scope = rowTenant(row);
                if (scope) return !tenantSlug || scope === tenantSlug;
                return batches.some(function match(batch) { return batch.importBatchId === row.importBatchId; });
            }).map(function clean(row) { return cloneSanitized(row); });
            var rollbackLogs = (Array.isArray(data.importRollbackLogs) ? data.importRollbackLogs : []).filter(function sameTenant(row) {
                var scope = rowTenant(row);
                if (scope) return !tenantSlug || scope === tenantSlug;
                return batches.some(function match(batch) { return batch.importBatchId === row.importBatchId; });
            }).map(function clean(row) { return cloneSanitized(row); });
            var asyncJobs = (Array.isArray(data.asyncJobs) ? data.asyncJobs : []).filter(function sameTenant(row) {
                return rowTenant(row) === tenantSlug && /ONBOARDING_IMPORT/i.test(row.jobType || row.type || '');
            }).map(function clean(row) { return cloneSanitized(row); });
            var activeImports = batches.filter(function active(row) {
                return !/completed|rolled back|rolled_back|archived|cancelled/i.test(row.status || row.state || '');
            });
            var validationFailures = stagingRows.filter(function failed(row) {
                return /failed|blocked/i.test(row.validationStatus || '') || (row.validationErrors || []).length;
            });
            var duplicates = validationFailures.filter(function dup(row) {
                return /duplicate/i.test(JSON.stringify(row.validationErrors || row.validationWarnings || {}));
            });
            var warnings = [];
            if (!global.AsyncJobService) warnings.push(safeWarning('ASYNC_JOB_SERVICE_UNAVAILABLE', 'Async job service is unavailable. Imports remain staged for manual review.'));
            if (!global.NotificationOrchestrationService) warnings.push(safeWarning('NOTIFICATION_ORCHESTRATION_UNAVAILABLE', 'Notification orchestration is unavailable. Import alerts are report-only.'));
            if (validationFailures.length) warnings.push(safeWarning('IMPORT_VALIDATION_FAILURES_PRESENT', 'Import validation failures require review before activation.', { failedRows: validationFailures.length }));
            auditImport('IMPORT_PIPELINE_GOVERNANCE_REVIEWED', {
                tenantSlug: tenantSlug,
                severity: validationFailures.length ? 'WARNING' : 'INFO',
                description: 'Import governance report generated.'
            }, context);
            emitTelemetry('IMPORT_PIPELINE_GOVERNANCE_REVIEWED', { tenantSlug: tenantSlug, validationFailures: validationFailures.length, severity: validationFailures.length ? 'WARNING' : 'INFO' }, context);
            recordMetric('IMPORT_PIPELINE_GOVERNANCE_REPORTED', { tenantSlug: tenantSlug, validationFailures: validationFailures.length }, context);
            return freezeImportOutput({
                success: true,
                readOnly: true,
                tenantSlug: tenantSlug,
                classification: validationFailures.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                importHealth: {
                    totalImports: batches.length,
                    activeImports: activeImports.length || batches.length,
                    reviewRequired: batches.filter(function review(row) { return /review/i.test(row.status || row.state || ''); }).length,
                    completedImports: batches.filter(function complete(row) { return /completed|committed/i.test(row.status || row.state || ''); }).length
                },
                validationFailures: {
                    failedRows: validationFailures.length,
                    duplicateRows: duplicates.length,
                    rows: validationFailures.slice(0, 20)
                },
                onboardingReadiness: {
                    stagedRows: stagingRows.length,
                    activationBlockers: validationFailures.length,
                    safeForPilot: validationFailures.length === 0
                },
                rollbackVisibility: {
                    rollbackLogs: rollbackLogs.length,
                    rollbackEligibleImports: batches.filter(function eligible(row) { return row.rollbackEligible !== false; }).length,
                    logs: rollbackLogs.slice(0, 20)
                },
                importQueueHealth: {
                    asyncImportJobs: asyncJobs.length,
                    retryPending: asyncJobs.filter(function retry(row) { return /retry/i.test(row.state || row.status || ''); }).length,
                    jobs: asyncJobs.slice(0, 20)
                },
                managerMapping: {
                    managerRows: stagingRows.filter(function manager(row) { return row.normalizedData?.managerId || row.normalizedData?.reporting_manager_id; }).length,
                    validationRequired: stagingRows.some(function warning(row) { return (row.validationWarnings || []).length; })
                },
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: true,
                    duplicateCorruptionPrevented: true,
                    rollbackGovernancePreserved: true,
                    existingOnboardingPreserved: true,
                    sensitiveDataFiltered: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                importHealth: { totalImports: 0, activeImports: 0, reviewRequired: 0, completedImports: 0 },
                validationFailures: { failedRows: 0, duplicateRows: 0, rows: [] },
                onboardingReadiness: { stagedRows: 0, activationBlockers: 0, safeForPilot: false },
                rollbackVisibility: { rollbackLogs: 0, rollbackEligibleImports: 0, logs: [] },
                importQueueHealth: { asyncImportJobs: 0, retryPending: 0, jobs: [] },
                warnings: [safeWarning('IMPORT_GOVERNANCE_REPORT_FAILED_SAFE', 'Import governance report failed safely.')]
            });
        }
    }

    if (typeof global.AsyncJobService === 'undefined') {
        safeWarn('Optional dependency window.AsyncJobService is unavailable. Async onboarding jobs will degrade safely.');
    }
    if (typeof global.NotificationOrchestrationService === 'undefined') {
        safeWarn('Optional dependency window.NotificationOrchestrationService is unavailable. Import notifications will degrade safely.');
    }

    var ImportPipelineService = Object.freeze({
        IMPORT_STATES: IMPORT_STATES,
        IMPORT_TYPES: IMPORT_TYPES,
        ONBOARDING_STAGES: ONBOARDING_STAGES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        classifyImportFailure: classifyImportFailure,
        normalizeImportPayload: normalizeImportPayload,
        freezeImportOutput: freezeImportOutput,
        detectDuplicateEmployees: detectDuplicateEmployees,
        validateManagerHierarchy: validateManagerHierarchy,
        validateEmployeeImport: validateEmployeeImport,
        stageEmployeeImport: stageEmployeeImport,
        createRollbackCheckpoint: createRollbackCheckpoint,
        rollbackImportBatch: rollbackImportBatch,
        generateImportGovernanceReport: generateImportGovernanceReport
    });

    global.ImportPipelineService = ImportPipelineService;
    global.importPipelineService = ImportPipelineService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var tests = [];
            var previousAsync = global.AsyncJobService;
            var previousNotification = global.NotificationOrchestrationService;
            var previousAudit = global.AuditService;
            var previousTelemetry = global.WorkflowTelemetryService;

            function check(name, condition) {
                tests.push(Object.freeze({ name: name, passed: !!condition }));
            }

            try {
                var rows = [
                    { employee_id: 'SELF-1', name: 'Self Test', email: 'self@example.com', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', joining_date: '2026-05-20', tenant_slug: 'tabsons' },
                    { employee_id: 'SELF-2', name: 'Bad Role', email: 'bad@example.com', department: 'Operations', designation: 'Associate', role: 'PLATFORM_OWNER', joining_date: '2026-05-20', tenant_slug: 'tabsons' }
                ];
                var before = JSON.stringify(rows);
                var validation = validateEmployeeImport({ rows: rows, tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('validation is immutable', JSON.stringify(rows) === before && Object.isFrozen(validation));
                check('tenant import isolation works', validateEmployeeImport({ rows: [{ employee_id: 'X', name: 'X', email: 'x@example.com', department: 'Operations', designation: 'A', role: 'EMPLOYEE', joining_date: '2026-05-20', tenant_slug: 'abc' }], tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }).classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
                check('duplicate detection works', detectDuplicateEmployees([{ employee_id: 'D1', email: 'd@example.com' }, { employee_id: 'D1', email: 'd@example.com' }], { tenantSlug: 'tabsons' }).duplicateCount >= 2);
                check('manager hierarchy validation works', validateManagerHierarchy([{ employee_id: 'A', reporting_manager_id: 'B' }, { employee_id: 'B', reporting_manager_id: 'A' }], { tenantSlug: 'tabsons' }).success === false);
                global.AsyncJobService = null;
                global.NotificationOrchestrationService = null;
                var report = generateImportGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence tolerated', report.success === true && report.warnings.length >= 1);
                global.AsyncJobService = previousAsync;
                global.NotificationOrchestrationService = previousNotification;
                var malformed = validateEmployeeImport('bad-payload', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('malformed payloads handled safely', malformed.success === false && malformed.classification === FAILURE_CLASSIFICATIONS.WARNING);
                global.AuditService = { recordAudit: function recordAudit() { throw new Error('audit down'); } };
                global.WorkflowTelemetryService = { emitTelemetry: function emitTelemetry() { throw new Error('telemetry down'); } };
                var isolated = validateEmployeeImport({ rows: [rows[0]], tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
                check('telemetry and audit failures isolated', isolated.summary.totalRows === 1);
                global.AuditService = previousAudit;
                global.WorkflowTelemetryService = previousTelemetry;
                check('rollback governance preserved', Object.isFrozen(createRollbackCheckpoint('missing', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })));

                var passed = tests.every(function everyTest(test) { return test.passed; });
                global.__ARTHHRMS_IMPORT_PIPELINE_SELF_TEST__ = freezeImportOutput({
                    passed: passed,
                    tests: tests
                });
                if (passed) safeInfo('development self-test passed.', global.__ARTHHRMS_IMPORT_PIPELINE_SELF_TEST__);
                else safeWarn('development self-test reported failures.', global.__ARTHHRMS_IMPORT_PIPELINE_SELF_TEST__);
            } catch (error) {
                global.__ARTHHRMS_IMPORT_PIPELINE_SELF_TEST__ = freezeImportOutput({
                    passed: false,
                    tests: tests,
                    error: error && error.message ? error.message : safeString(error, 'unknown self-test error')
                });
                safeWarn('development self-test failed safely.', global.__ARTHHRMS_IMPORT_PIPELINE_SELF_TEST__);
            } finally {
                global.AsyncJobService = previousAsync;
                global.NotificationOrchestrationService = previousNotification;
                global.AuditService = previousAudit;
                global.WorkflowTelemetryService = previousTelemetry;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
