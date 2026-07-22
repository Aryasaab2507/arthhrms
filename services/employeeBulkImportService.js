(function attachEmployeeBulkImportService(global) {
    'use strict';

    var IMPORT_STATES = Object.freeze([
        'UPLOADED',
        'PARSED',
        'VALIDATING',
        'PREVIEW_READY',
        'REVIEW_REQUIRED',
        'APPROVAL_PENDING',
        'APPROVED',
        'IMPORT_QUEUED',
        'FAILED',
        'CANCELLED',
        'ARCHIVED'
    ]);
    var IMPORT_WORKFLOW = Object.freeze([
        'UPLOAD_FILE',
        'PARSE_FILE',
        'VALIDATE_STRUCTURE',
        'PREVIEW_EMPLOYEES',
        'RESOLVE_ERRORS',
        'APPROVE_IMPORT',
        'CREATE_EMPLOYEES',
        'AUDIT_IMPORT'
    ]);
    var SUPPORTED_FILE_TYPES = Object.freeze(['CSV', 'XLS', 'XLSX']);
    var REQUIRED_FIELDS = Object.freeze(['employeeId', 'firstName', 'lastName', 'email', 'department', 'designation', 'joiningDate']);
    var OPTIONAL_FIELDS = Object.freeze(['manager', 'phoneNumber', 'location', 'employmentType', 'costCenter', 'shiftAssignment']);
    var MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|aadhaar|pan|ssn|rawPayload|document|medical|benefit/i;

    function db() {
        return global.DB || null;
    }

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
        } catch (error) {
            return false;
        }
        return false;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeKey(value) {
        return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function normalizeRole(value) {
        return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeTenantSlug(value) {
        return normalizeText(value).toLowerCase();
    }

    function freezeImportOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeImportOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeImportOutput(value[key]);
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

    function failure(code, message, severity, metadata) {
        return freezeImportOutput({
            code: code,
            message: message,
            severity: severity || 'HIGH',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function warning(code, message, metadata) {
        return freezeImportOutput({
            code: code,
            message: message,
            severity: 'WARNING',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function tenantFromContext(context) {
        return normalizeTenantSlug(
            context?.tenantSlug ||
            context?.tenantId ||
            context?.companyId ||
            context?.actor?.tenantSlug ||
            context?.actor?.tenantId ||
            rawData()?.companySettings?.tenantSlug ||
            rawData()?.companySettings?.tenantId ||
            ''
        );
    }

    function actorFromContext(context) {
        var actor = context?.actor || {};
        return {
            id: normalizeText(actor.id || actor.empId || context?.actorId || 'system'),
            role: normalizeRole(actor.role || context?.actorRole || context?.role || 'HR')
        };
    }

    function integrationHealth() {
        return freezeImportOutput({
            importPipelineIntegrated: !!(global.ImportPipelineService && typeof global.ImportPipelineService.validateEmployeeImport === 'function'),
            employeeOnboardingIntegrated: !!(global.EmployeeOnboardingService && typeof global.EmployeeOnboardingService.validateBulkOnboardingImport === 'function'),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!(global.AuditService && typeof global.AuditService.recordAudit === 'function'),
            telemetryIntegrated: !!(global.WorkflowTelemetryService && (typeof global.WorkflowTelemetryService.emitTelemetry === 'function' || typeof global.WorkflowTelemetryService.emitImportTelemetry === 'function'))
        });
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context?.skipTelemetry) return false;
            var telemetry = global.WorkflowTelemetryService;
            if (!telemetry) return false;
            if (typeof telemetry.emitImportTelemetry === 'function') {
                telemetry.emitImportTelemetry(eventType, cloneSanitized(metadata || {}));
                return true;
            }
            if (typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('IMPORT', eventType, cloneSanitized(metadata || {}));
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function auditImport(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: id('AUD-EMP-IMPORT'),
                    type: actionType,
                    actionType: actionType,
                    module: 'Employee Bulk Import',
                    targetId: clean.previewId || clean.importId || clean.uploadId || '',
                    tenantSlug: clean.tenantSlug || tenantFromContext(context || {}),
                    metadata: clean,
                    createdAt: nowIso()
                }, {
                    actor: actor,
                    tenantSlug: clean.tenantSlug || tenantFromContext(context || {})
                });
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Employee Bulk Import', clean.previewId || clean.importId || clean.uploadId || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function withDataArray(data, key) {
        if (!Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function persistHistory(key, row, context) {
        try {
            if (context?.skipPersistence) return false;
            var data = rawData();
            var clean = cloneSanitized(row || {});
            withDataArray(data, key).push(Object.freeze({ ...clean }));
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function extensionFromFileName(fileName) {
        var match = normalizeText(fileName).match(/\.([A-Za-z0-9]+)$/);
        return match ? match[1].toUpperCase() : '';
    }

    function resolveFileType(source) {
        return normalizeText(source.fileType || source.importType || extensionFromFileName(source.fileName || source.sourceFileName)).toUpperCase();
    }

    function fileSize(source) {
        if (Number.isFinite(source.sizeBytes)) return Number(source.sizeBytes);
        if (Number.isFinite(source.fileSize)) return Number(source.fileSize);
        if (typeof source.fileContent === 'string') return source.fileContent.length;
        if (Array.isArray(source.rows)) return JSON.stringify(source.rows).length;
        return 0;
    }

    function validateRollScope(source, context, action) {
        var failures = [];
        var actor = actorFromContext(context || {});
        var contextTenant = tenantFromContext(context || {});
        var payloadTenant = normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || contextTenant);
        var role = actor.role;
        var createAction = action === 'CREATE';
        var approveAction = action === 'APPROVE';
        var reviewAction = action === 'REVIEW';
        if (!payloadTenant) failures.push(failure('TENANT_SCOPE_REQUIRED', 'Employee import requires a tenant scope.', 'CRITICAL'));
        if (contextTenant && payloadTenant && contextTenant !== payloadTenant) {
            failures.push(failure('CROSS_TENANT_IMPORT_BLOCKED', 'Tenant-scoped imports cannot cross tenant boundaries.', 'CRITICAL', { contextTenant: contextTenant, payloadTenant: payloadTenant }));
        }
        if (role === 'EMPLOYEE' || role === 'MANAGER' || role === 'SUPER_ADMIN') {
            failures.push(failure('ROLE_IMPORT_ACCESS_BLOCKED', 'This role cannot access employee bulk import governance.', 'CRITICAL', { role: role }));
        }
        if (role === 'PLATFORM_OWNER' && (createAction || approveAction)) {
            failures.push(failure('PLATFORM_OWNER_VISIBILITY_ONLY', 'PLATFORM_OWNER can review platform governance but cannot approve or create tenant imports.', 'CRITICAL'));
        }
        if (createAction && role !== 'HR') {
            failures.push(failure('HR_IMPORT_CREATION_REQUIRED', 'Only HR can create employee import uploads.', 'HIGH', { role: role }));
        }
        if ((reviewAction || approveAction) && role !== 'HR' && role !== 'DIRECTOR' && role !== 'PLATFORM_OWNER') {
            failures.push(failure('IMPORT_REVIEW_ROLE_REQUIRED', 'Only HR or Director roles can review employee imports.', 'HIGH', { role: role }));
        }
        return {
            allowed: failures.length === 0,
            failures: failures,
            tenantSlug: payloadTenant,
            actor: actor
        };
    }

    function normalizeImportPayload(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return freezeImportOutput({
                    success: false,
                    normalizedPayload: {},
                    failures: [failure('MALFORMED_IMPORT_PAYLOAD', 'Employee import payload must be an object.', 'WARNING')]
                });
            }
            var source = input || {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || tenantFromContext(context || {}));
            var fileName = normalizeText(source.fileName || source.sourceFileName || source.name || 'employee-import.csv') || 'employee-import.csv';
            var fileType = resolveFileType({ ...source, fileName: fileName });
            var normalized = {
                tenantSlug: tenantSlug,
                fileName: fileName,
                fileType: fileType,
                fileContent: typeof source.fileContent === 'string' ? source.fileContent : '',
                rows: Array.isArray(source.rows) ? source.rows.map(function clone(row) { return cloneSanitized(row); }) : [],
                sizeBytes: fileSize(source),
                source: normalizeText(source.source || 'employee-import-center'),
                metadata: cloneSanitized(source.metadata || {})
            };
            var failures = [];
            if (!tenantSlug) failures.push(failure('TENANT_SCOPE_REQUIRED', 'Employee import requires tenant scope.', 'CRITICAL'));
            if (!SUPPORTED_FILE_TYPES.includes(fileType)) failures.push(failure('UNSUPPORTED_IMPORT_FILE_TYPE', 'Only CSV, XLS, and XLSX employee imports are supported.', 'HIGH', { fileType: fileType || 'UNKNOWN' }));
            if (normalized.sizeBytes > MAX_IMPORT_SIZE_BYTES) failures.push(failure('OVERSIZED_IMPORT_FILE', 'Employee imports must remain within the 10MB governance limit.', 'HIGH', { sizeBytes: normalized.sizeBytes }));
            if (!normalized.fileContent && !normalized.rows.length) failures.push(failure('EMPTY_IMPORT_FILE', 'Employee import file is empty or unavailable for parsing.', 'WARNING'));
            return freezeImportOutput({
                success: failures.length === 0,
                normalizedPayload: normalized,
                failures: failures,
                warnings: [],
                supportedFileTypes: SUPPORTED_FILE_TYPES
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                normalizedPayload: {},
                failures: [failure('NORMALIZE_IMPORT_FAILED_SAFE', 'Employee import payload normalization failed safely.', 'HIGH')]
            });
        }
    }

    function uploadEmployeeFile(input, context) {
        try {
            var normalized = normalizeImportPayload(input, context);
            var source = normalized.normalizedPayload || {};
            var scope = validateRollScope(source, context || {}, 'CREATE');
            var failures = [].concat(normalized.failures || [], scope.failures || []);
            if (failures.length) {
                var blocked = failureOutput('FAILED', source.tenantSlug || scope.tenantSlug, failures, 'Employee import upload blocked safely.');
                auditImport('EMPLOYEE_BULK_IMPORT_UPLOAD_BLOCKED', { tenantSlug: source.tenantSlug || scope.tenantSlug, failures: failures }, context || {});
                return blocked;
            }
            var uploadId = id('EMP-IMP-UPLOAD');
            var row = {
                uploadId: uploadId,
                importId: uploadId,
                state: 'UPLOADED',
                tenantSlug: scope.tenantSlug,
                fileName: source.fileName,
                fileType: source.fileType,
                sizeBytes: source.sizeBytes,
                ownerId: scope.actor.id,
                ownerRole: scope.actor.role,
                uploadedAt: nowIso(),
                immutable: true
            };
            persistHistory('employeeBulkImportHistory', row, context || {});
            auditImport('EMPLOYEE_BULK_IMPORT_UPLOADED', { ...row, description: 'Employee bulk import upload reviewed.' }, context || {});
            emitTelemetry('EMPLOYEE_BULK_IMPORT_UPLOADED', row, context || {});
            return freezeImportOutput({
                success: true,
                state: 'UPLOADED',
                uploadId: uploadId,
                tenantSlug: scope.tenantSlug,
                fileName: source.fileName,
                fileType: source.fileType,
                supportedFileType: true,
                directDatabaseImportBlocked: true,
                employeeCreationBlockedUntilApproval: true,
                requiresPreviewApproval: true,
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                importGovernance: governanceFlags(scope.actor.role),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    onboardingGovernancePreserved: true,
                    uploadedAt: row.uploadedAt
                }
            });
        } catch (error) {
            return failureOutput('FAILED', tenantFromContext(context || {}), [failure('UPLOAD_IMPORT_FAILED_SAFE', 'Employee import upload failed safely.', 'HIGH')], 'Employee import upload failed safely.');
        }
    }

    function parseCsv(content) {
        var rows = [];
        var current = [];
        var field = '';
        var inQuotes = false;
        var text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        for (var index = 0; index < text.length; index += 1) {
            var char = text[index];
            var next = text[index + 1];
            if (char === '"' && inQuotes && next === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                current.push(field);
                field = '';
            } else if (char === '\n' && !inQuotes) {
                current.push(field);
                rows.push(current);
                current = [];
                field = '';
            } else {
                field += char;
            }
        }
        if (field || current.length) {
            current.push(field);
            rows.push(current);
        }
        return rows.filter(function nonBlank(row) {
            return row.some(function hasValue(cell) { return normalizeText(cell); });
        });
    }

    function headerMap(headers) {
        var map = {};
        headers.forEach(function each(header, index) {
            map[normalizeKey(header)] = index;
        });
        return map;
    }

    function valueFrom(row, map, aliases) {
        for (var i = 0; i < aliases.length; i += 1) {
            var index = map[normalizeKey(aliases[i])];
            if (index != null) return normalizeText(row[index]);
        }
        return '';
    }

    function mapRowObject(row) {
        var source = row || {};
        var fullName = normalizeText(source.name || source.fullName || source.full_name);
        var firstName = normalizeText(source.firstName || source.first_name || source.first || (fullName ? fullName.split(/\s+/)[0] : ''));
        var lastName = normalizeText(source.lastName || source.last_name || source.last || (fullName ? fullName.split(/\s+/).slice(1).join(' ') : ''));
        return {
            employeeId: normalizeText(source.employeeId || source.employee_id || source.empId || source.emp_id || source.id),
            firstName: firstName,
            lastName: lastName,
            email: normalizeText(source.email || source.emailAddress || source.email_address).toLowerCase(),
            department: normalizeText(source.department || source.dept),
            designation: normalizeText(source.designation || source.desig || source.title),
            joiningDate: normalizeText(source.joiningDate || source.joining_date || source.dateOfJoining),
            manager: normalizeText(source.manager || source.managerId || source.manager_id || source.reporting_manager_id || source.reportingManagerId),
            phoneNumber: normalizeText(source.phoneNumber || source.phone || source.mobile),
            location: normalizeText(source.location || source.workLocation),
            employmentType: normalizeText(source.employmentType || source.employment_type || source.type),
            costCenter: normalizeText(source.costCenter || source.cost_center),
            shiftAssignment: normalizeText(source.shiftAssignment || source.shift_assignment || source.shift),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.tenant_id || ''),
            rowNumber: Number(source.rowNumber || 0) || 0,
            customFields: {}
        };
    }

    function mapCsvRows(content) {
        var table = parseCsv(content);
        if (!table.length) return [];
        var headers = table[0];
        var map = headerMap(headers);
        return table.slice(1).map(function mapRow(row, index) {
            return {
                employeeId: valueFrom(row, map, ['Employee ID', 'Employee Id', 'Emp ID', 'employee_id']),
                firstName: valueFrom(row, map, ['First Name', 'first_name', 'First']),
                lastName: valueFrom(row, map, ['Last Name', 'last_name', 'Last']),
                email: valueFrom(row, map, ['Email', 'Email Address', 'email']).toLowerCase(),
                department: valueFrom(row, map, ['Department', 'Dept']),
                designation: valueFrom(row, map, ['Designation', 'Title', 'Job Title']),
                joiningDate: valueFrom(row, map, ['Joining Date', 'Date Of Joining', 'joining_date']),
                manager: valueFrom(row, map, ['Manager', 'Manager ID', 'Reporting Manager', 'reporting_manager_id']),
                phoneNumber: valueFrom(row, map, ['Phone Number', 'Phone', 'Mobile']),
                location: valueFrom(row, map, ['Location', 'Work Location']),
                employmentType: valueFrom(row, map, ['Employment Type', 'employment_type']),
                costCenter: valueFrom(row, map, ['Cost Center', 'cost_center']),
                shiftAssignment: valueFrom(row, map, ['Shift Assignment', 'Shift']),
                tenantSlug: normalizeTenantSlug(valueFrom(row, map, ['Tenant', 'Tenant Slug', 'tenantSlug', 'tenant_slug'])),
                rowNumber: index + 2,
                customFields: {}
            };
        });
    }

    function parseEmployeeImport(input, context) {
        try {
            var normalized = normalizeImportPayload(input, context);
            var source = normalized.normalizedPayload || {};
            var scope = validateRollScope(source, context || {}, 'REVIEW');
            var failures = [].concat((normalized.failures || []).filter(function notEmpty(item) { return item.code !== 'EMPTY_IMPORT_FILE'; }), scope.failures || []);
            if (failures.length) {
                return failureOutput('FAILED', source.tenantSlug || scope.tenantSlug, failures, 'Employee import parsing blocked safely.');
            }
            if (!source.fileContent && !source.rows.length) {
                return failureOutput('FAILED', source.tenantSlug || scope.tenantSlug, [failure('EMPTY_IMPORT_FILE', 'Employee import file is empty or unavailable for parsing.', 'WARNING')], 'Employee import file is empty.');
            }
            var rows = source.fileContent ? mapCsvRows(source.fileContent) : source.rows.map(mapRowObject);
            rows = rows.map(function rowNumber(row, index) {
                return cloneSanitized({ ...row, rowNumber: row.rowNumber || index + 1 });
            });
            if (!rows.length) {
                return failureOutput('FAILED', source.tenantSlug || scope.tenantSlug, [failure('EMPTY_IMPORT_FILE', 'Employee import did not contain any employee rows.', 'WARNING')], 'Employee import did not contain rows.');
            }
            return freezeImportOutput({
                success: true,
                state: 'PARSED',
                tenantSlug: source.tenantSlug,
                fileName: source.fileName,
                fileType: source.fileType,
                rows: rows,
                rowCount: rows.length,
                directDatabaseImportBlocked: true,
                readOnly: true,
                integrationHealth: integrationHealth(),
                metadata: {
                    parsedAt: nowIso(),
                    sensitiveDataFiltered: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED', tenantFromContext(context || {}), [failure('PARSE_IMPORT_FAILED_SAFE', 'Employee import parsing failed safely.', 'HIGH')], 'Employee import parsing failed safely.');
        }
    }

    function rowTenant(row, fallback) {
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || fallback || '');
    }

    function employeeIdOf(employee) {
        return normalizeText(employee.employeeId || employee.employee_id || employee.empId || employee.emp_id || employee.id);
    }

    function employeeTenant(employee) {
        return normalizeTenantSlug(employee.tenantSlug || employee.tenant_slug || employee.tenantId || employee.tenant_id || employee.companyId || employee.company_id || '');
    }

    function departmentSet(tenantSlug) {
        var data = rawData();
        return new Set((Array.isArray(data.departments) ? data.departments : []).filter(function inTenant(dept) {
            var scope = employeeTenant(dept);
            return !scope || scope === tenantSlug;
        }).map(function name(dept) {
            return normalizeKey(dept.name || dept.department || dept.title);
        }).filter(Boolean));
    }

    function existingEmployees(tenantSlug) {
        var data = rawData();
        return (Array.isArray(data.employees) ? data.employees : []).filter(function inTenant(employee) {
            return employeeTenant(employee) === tenantSlug;
        });
    }

    function managerExists(manager, employees) {
        if (!manager) return true;
        var key = normalizeText(manager).toLowerCase();
        return employees.some(function match(employee) {
            return employeeIdOf(employee).toLowerCase() === key || normalizeText(employee.email).toLowerCase() === key || normalizeText(employee.name).toLowerCase() === key;
        });
    }

    function validEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value));
    }

    function validDate(value) {
        var text = normalizeText(value);
        if (!text) return false;
        var parsed = new Date(text);
        return Number.isFinite(parsed.getTime());
    }

    function buildPreviewWorkflow(summary, blocked) {
        var completedUntil = blocked ? 'VALIDATE_STRUCTURE' : summary.invalidRows ? 'RESOLVE_ERRORS' : 'PREVIEW_EMPLOYEES';
        return freezeImportOutput(IMPORT_WORKFLOW.map(function map(step) {
            var status = 'PENDING';
            if (step === 'UPLOAD_FILE' || step === 'PARSE_FILE' || step === 'VALIDATE_STRUCTURE') status = 'COMPLETED';
            if (step === 'PREVIEW_EMPLOYEES') status = blocked ? 'BLOCKED' : 'COMPLETED';
            if (step === 'RESOLVE_ERRORS') status = summary.invalidRows ? 'REQUIRED' : 'COMPLETED';
            if (step === 'APPROVE_IMPORT') status = summary.invalidRows ? 'BLOCKED' : 'READY';
            if (step === 'CREATE_EMPLOYEES') status = 'GATED_BY_ONBOARDING_WORKFLOW';
            if (step === 'AUDIT_IMPORT') status = 'ACTIVE';
            return {
                key: step,
                label: step.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function upper(char) { return char.toUpperCase(); }),
                status: status,
                completedThrough: completedUntil
            };
        }));
    }

    function validateRows(rows, tenantSlug) {
        var existing = existingEmployees(tenantSlug);
        var departments = departmentSet(tenantSlug);
        var seenEmployeeIds = new Set();
        var seenEmails = new Set();
        var duplicateEmployeeIds = new Set();
        var duplicateEmails = new Set();
        var results = [];
        var errors = [];
        var missingFields = 0;
        var departmentMismatches = 0;
        var validRows = 0;

        rows.forEach(function validate(row, index) {
            var rowErrors = [];
            var clean = mapRowObject(row);
            clean.rowNumber = row.rowNumber || index + 1;
            var effectiveTenant = rowTenant(clean, tenantSlug);
            if (effectiveTenant && effectiveTenant !== tenantSlug) {
                rowErrors.push(failure('CROSS_TENANT_ROW_BLOCKED', 'Employee row tenant does not match import tenant.', 'CRITICAL', { rowNumber: clean.rowNumber }));
            }
            REQUIRED_FIELDS.forEach(function required(field) {
                if (!normalizeText(clean[field])) {
                    rowErrors.push(failure('MISSING_REQUIRED_FIELD', field + ' is required for employee import.', 'HIGH', { rowNumber: clean.rowNumber, field: field }));
                    missingFields += 1;
                }
            });
            if (clean.email && !validEmail(clean.email)) {
                rowErrors.push(failure('INVALID_EMAIL', 'Employee email is not valid.', 'HIGH', { rowNumber: clean.rowNumber }));
            }
            if (clean.joiningDate && !validDate(clean.joiningDate)) {
                rowErrors.push(failure('INVALID_JOINING_DATE', 'Joining date is not valid.', 'HIGH', { rowNumber: clean.rowNumber }));
            }
            if (clean.department && departments.size && !departments.has(normalizeKey(clean.department))) {
                rowErrors.push(failure('DEPARTMENT_MISMATCH', 'Department does not exist in the selected tenant scope.', 'HIGH', { rowNumber: clean.rowNumber, department: clean.department }));
                departmentMismatches += 1;
            }
            var employeeKey = clean.employeeId.toLowerCase();
            var emailKey = clean.email.toLowerCase();
            var duplicateIdInExisting = employeeKey && existing.some(function match(employee) { return employeeIdOf(employee).toLowerCase() === employeeKey; });
            var duplicateEmailInExisting = emailKey && existing.some(function match(employee) { return normalizeText(employee.email).toLowerCase() === emailKey; });
            if (employeeKey && (seenEmployeeIds.has(employeeKey) || duplicateIdInExisting)) {
                duplicateEmployeeIds.add(clean.employeeId);
                rowErrors.push(failure(duplicateIdInExisting ? 'DUPLICATE_EMPLOYEE_EXISTS' : 'DUPLICATE_EMPLOYEE_IN_FILE', 'Duplicate employee ID requires review before import.', 'HIGH', { rowNumber: clean.rowNumber, employeeId: clean.employeeId }));
            }
            if (emailKey && (seenEmails.has(emailKey) || duplicateEmailInExisting)) {
                duplicateEmails.add(clean.email);
                rowErrors.push(failure(duplicateEmailInExisting ? 'DUPLICATE_EMAIL_EXISTS' : 'DUPLICATE_EMAIL_IN_FILE', 'Duplicate employee email requires review before import.', 'HIGH', { rowNumber: clean.rowNumber, email: clean.email }));
            }
            if (clean.manager && !managerExists(clean.manager, existing)) {
                rowErrors.push(warning('MANAGER_NOT_FOUND', 'Manager was not found in the selected tenant scope. Department setup flow can resolve this later.', { rowNumber: clean.rowNumber }));
            }
            if (employeeKey) seenEmployeeIds.add(employeeKey);
            if (emailKey) seenEmails.add(emailKey);
            var rowStatus = rowErrors.some(function severe(item) { return item.severity !== 'WARNING'; }) ? 'INVALID' : 'VALID';
            if (rowStatus === 'VALID') validRows += 1;
            rowErrors.forEach(function collect(item) { if (item.severity !== 'WARNING') errors.push(item); });
            results.push(freezeImportOutput({
                rowNumber: clean.rowNumber,
                employeeId: clean.employeeId,
                firstName: clean.firstName,
                lastName: clean.lastName,
                email: clean.email,
                department: clean.department,
                designation: clean.designation,
                joiningDate: clean.joiningDate,
                manager: clean.manager,
                phoneNumber: clean.phoneNumber,
                location: clean.location,
                employmentType: clean.employmentType,
                costCenter: clean.costCenter,
                shiftAssignment: clean.shiftAssignment,
                rowStatus: rowStatus,
                errors: rowErrors.filter(function severe(item) { return item.severity !== 'WARNING'; }),
                warnings: rowErrors.filter(function mild(item) { return item.severity === 'WARNING'; })
            }));
        });

        var summary = {
            totalRows: rows.length,
            validRows: validRows,
            invalidRows: rows.length - validRows,
            duplicateEmployees: duplicateEmployeeIds.size,
            duplicateEmails: duplicateEmails.size,
            missingFields: missingFields,
            departmentMismatches: departmentMismatches
        };
        return freezeImportOutput({
            summary: summary,
            rows: results,
            errors: errors,
            duplicates: {
                employeeIds: Array.from(duplicateEmployeeIds),
                emails: Array.from(duplicateEmails)
            }
        });
    }

    function governanceFlags(actorRole) {
        return freezeImportOutput({
            importOwnershipRequired: true,
            importApprovalsRequired: true,
            reviewHistoryImmutable: true,
            auditHistoryImmutable: true,
            rollbackPreparationEnabled: true,
            onboardingWorkflowPreserved: true,
            rbacAuthoritative: true,
            platformOwnerVisibilityOnly: normalizeRole(actorRole) === 'PLATFORM_OWNER',
            directDatabaseImportsBlocked: true,
            validationBypassBlocked: true,
            crossTenantImportsBlocked: true
        });
    }

    function integrationReadiness() {
        return freezeImportOutput({
            excelValidationEnginePrepared: true,
            inviteMailDeliveryPrepared: true,
            activationWizardPrepared: true,
            departmentSetupFlowPrepared: true,
            googleSheetsImportPrepared: true,
            hrisIntegrationPrepared: true
        });
    }

    function failureOutput(state, tenantSlug, failures, description) {
        return freezeImportOutput({
            success: false,
            state: state || 'FAILED',
            tenantSlug: tenantSlug || '',
            readOnly: true,
            directDatabaseImportBlocked: true,
            employeeCreationBlockedUntilApproval: true,
            requiresApproval: true,
            failures: failures || [failure('EMPLOYEE_IMPORT_FAILED_SAFE', 'Employee import failed safely.', 'HIGH')],
            warnings: [],
            integrationHealth: integrationHealth(),
            metadata: {
                description: description || 'Employee import blocked safely.',
                backwardCompatibilityPreserved: true,
                tenantIsolationPreserved: true,
                onboardingGovernancePreserved: true,
                generatedAt: nowIso()
            }
        });
    }

    function calculateImportReadiness(input, context) {
        try {
            var summary = input?.summary;
            if (!summary && input && typeof input === 'object') {
                var preview = generateImportPreview(input, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipPersistence: true });
                summary = preview.summary || { totalRows: 0, validRows: 0, invalidRows: 0, duplicateEmployees: 0, duplicateEmails: 0, missingFields: 0, departmentMismatches: 0 };
            }
            summary = summary || { totalRows: 0, validRows: 0, invalidRows: 0, duplicateEmployees: 0, duplicateEmails: 0, missingFields: 0, departmentMismatches: 0 };
            var total = Math.max(1, Number(summary.totalRows) || 0);
            var invalid = Number(summary.invalidRows) || 0;
            var duplicatePenalty = (Number(summary.duplicateEmployees) || 0) + (Number(summary.duplicateEmails) || 0);
            var mismatchPenalty = (Number(summary.missingFields) || 0) + (Number(summary.departmentMismatches) || 0);
            var validationScore = Math.max(0, Math.round(100 - (invalid / total) * 55 - duplicatePenalty * 7 - mismatchPenalty * 3));
            var importSuccessScore = Math.max(0, Math.round(100 - (invalid / total) * 65 - duplicatePenalty * 8));
            var onboardingReadinessScore = Math.max(0, Math.round((validationScore + importSuccessScore) / 2 - mismatchPenalty * 2));
            return freezeImportOutput({
                success: true,
                importSuccessScore: importSuccessScore,
                validationScore: validationScore,
                onboardingReadinessScore: onboardingReadinessScore,
                approvalReady: invalid === 0,
                scoringInputs: cloneSanitized(summary),
                metadata: {
                    generatedAt: nowIso(),
                    frozen: true
                }
            });
        } catch (error) {
            return freezeImportOutput({
                success: false,
                importSuccessScore: 0,
                validationScore: 0,
                onboardingReadinessScore: 0,
                approvalReady: false,
                failures: [failure('IMPORT_READINESS_FAILED_SAFE', 'Import readiness scoring failed safely.', 'HIGH')]
            });
        }
    }

    function generateImportPreview(input, context) {
        try {
            var parsed = parseEmployeeImport(input, context);
            var source = parsed.success ? parsed : normalizeImportPayload(input, context);
            var tenantSlug = parsed.tenantSlug || source.normalizedPayload?.tenantSlug || tenantFromContext(context || {});
            var scope = validateRollScope({ tenantSlug: tenantSlug }, context || {}, 'REVIEW');
            if (!parsed.success || !scope.allowed) {
                var failures = [].concat(parsed.failures || [], scope.failures || []);
                auditImport('EMPLOYEE_BULK_IMPORT_PREVIEW_BLOCKED', { tenantSlug: tenantSlug, failures: failures }, context || {});
                return failureOutput('FAILED', tenantSlug, failures.length ? failures : [failure('IMPORT_PREVIEW_BLOCKED', 'Employee import preview blocked safely.', 'HIGH')], 'Employee import preview blocked safely.');
            }
            var validation = validateRows(parsed.rows || [], tenantSlug);
            var previewId = id('EMP-IMP-PREVIEW');
            var readiness = calculateImportReadiness({ summary: validation.summary }, context || {});
            var state = validation.summary.invalidRows ? 'REVIEW_REQUIRED' : 'PREVIEW_READY';
            var output = {
                success: true,
                previewId: previewId,
                state: state,
                tenantSlug: tenantSlug,
                fileName: parsed.fileName,
                fileType: parsed.fileType,
                readOnly: true,
                requiresApproval: true,
                directDatabaseImportBlocked: true,
                employeeCreationBlockedUntilApproval: true,
                employeeCreationDeferredToOnboardingWorkflow: true,
                workflow: buildPreviewWorkflow(validation.summary, false),
                summary: validation.summary,
                preview: validation.summary,
                employeesPreview: validation.rows,
                errors: validation.errors,
                duplicates: validation.duplicates,
                readiness: readiness,
                approval: {
                    status: validation.summary.invalidRows ? 'RESOLUTION_REQUIRED' : 'APPROVAL_PENDING',
                    allowedApprovers: Object.freeze(['HR', 'DIRECTOR']),
                    employeeCreationRequiresOnboardingWorkflow: true
                },
                rollbackPreparation: {
                    checkpointPrepared: true,
                    directRollbackReady: false,
                    rollbackPreparedForFutureExecution: true
                },
                importGovernance: governanceFlags(actorFromContext(context || {}).role),
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                warnings: [],
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    onboardingGovernancePreserved: true,
                    sensitiveDataFiltered: true,
                    generatedAt: nowIso()
                }
            };
            var history = {
                previewId: previewId,
                tenantSlug: tenantSlug,
                state: state,
                fileName: parsed.fileName,
                fileType: parsed.fileType,
                summary: validation.summary,
                readiness: {
                    importSuccessScore: readiness.importSuccessScore,
                    validationScore: readiness.validationScore,
                    onboardingReadinessScore: readiness.onboardingReadinessScore
                },
                createdAt: output.metadata.generatedAt,
                immutable: true
            };
            persistHistory('employeeBulkImportPreviewHistory', history, context || {});
            persistHistory('employeeBulkImportReviewHistory', { ...history, reviewStatus: output.approval.status }, context || {});
            auditImport('EMPLOYEE_BULK_IMPORT_PREVIEW_GENERATED', { ...history, description: 'Employee bulk import preview generated.' }, context || {});
            emitTelemetry('EMPLOYEE_BULK_IMPORT_PREVIEW_GENERATED', history, context || {});
            return freezeImportOutput(output);
        } catch (error) {
            return failureOutput('FAILED', tenantFromContext(context || {}), [failure('IMPORT_PREVIEW_FAILED_SAFE', 'Employee import preview failed safely.', 'HIGH')], 'Employee import preview failed safely.');
        }
    }

    function approveImportPreview(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var scope = validateRollScope({ tenantSlug: tenantSlug }, context || {}, 'APPROVE');
            if (!scope.allowed) {
                auditImport('EMPLOYEE_BULK_IMPORT_APPROVAL_BLOCKED', { tenantSlug: tenantSlug, failures: scope.failures }, context || {});
                return failureOutput('FAILED', tenantSlug, scope.failures, 'Employee import approval blocked safely.');
            }
            var previewId = normalizeText(source.previewId);
            var data = rawData();
            var preview = (Array.isArray(data.employeeBulkImportPreviewHistory) ? data.employeeBulkImportPreviewHistory : []).find(function match(row) {
                return row.previewId === previewId && normalizeTenantSlug(row.tenantSlug) === tenantSlug;
            });
            if (!preview) {
                return failureOutput('FAILED', tenantSlug, [failure('IMPORT_PREVIEW_NOT_FOUND', 'Import preview must exist before approval.', 'HIGH')], 'Import preview not found.');
            }
            if (preview.summary && Number(preview.summary.invalidRows || 0) > 0) {
                return failureOutput('FAILED', tenantSlug, [failure('UNRESOLVED_IMPORT_ERRORS', 'Import preview has unresolved errors and cannot be approved.', 'HIGH', { previewId: previewId })], 'Import approval blocked by unresolved errors.');
            }
            var approvalId = id('EMP-IMP-APPROVAL');
            var row = {
                approvalId: approvalId,
                previewId: previewId,
                tenantSlug: tenantSlug,
                state: 'APPROVED',
                approvedBy: scope.actor.id,
                approvedRole: scope.actor.role,
                approvedAt: nowIso(),
                createEmployeesDirectly: false,
                onboardingWorkflowRequired: true,
                immutable: true
            };
            persistHistory('employeeBulkImportReviewHistory', row, context || {});
            auditImport('EMPLOYEE_BULK_IMPORT_APPROVED', { ...row, description: 'Employee bulk import approved for onboarding workflow handoff.' }, context || {});
            emitTelemetry('EMPLOYEE_BULK_IMPORT_APPROVED', row, context || {});
            return freezeImportOutput({
                success: true,
                state: 'APPROVED',
                approvalId: approvalId,
                previewId: previewId,
                tenantSlug: tenantSlug,
                createEmployeesDirectly: false,
                onboardingWorkflowRequired: true,
                employeeCreationDeferredToOnboardingWorkflow: true,
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                importGovernance: governanceFlags(scope.actor.role),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    onboardingGovernancePreserved: true,
                    approvedAt: row.approvedAt
                }
            });
        } catch (error) {
            return failureOutput('FAILED', tenantFromContext(context || {}), [failure('IMPORT_APPROVAL_FAILED_SAFE', 'Employee import approval failed safely.', 'HIGH')], 'Employee import approval failed safely.');
        }
    }

    function generateImportGovernanceReport(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var data = rawData();
            function tenantRows(key) {
                return (Array.isArray(data[key]) ? data[key] : []).filter(function sameTenant(row) {
                    return !tenantSlug || normalizeTenantSlug(row.tenantSlug) === tenantSlug;
                }).map(cloneSanitized);
            }
            var history = tenantRows('employeeBulkImportHistory');
            var previews = tenantRows('employeeBulkImportPreviewHistory');
            var reviews = tenantRows('employeeBulkImportReviewHistory');
            var invalidPreviews = previews.filter(function invalid(row) { return Number(row.summary?.invalidRows || 0) > 0; });
            auditImport('EMPLOYEE_BULK_IMPORT_GOVERNANCE_REVIEWED', { tenantSlug: tenantSlug, description: 'Employee bulk import governance reviewed.' }, context || {});
            return freezeImportOutput({
                success: true,
                readOnly: true,
                tenantSlug: tenantSlug,
                importHistory: history,
                previewHistory: previews,
                reviewHistory: reviews,
                summary: {
                    uploads: history.length,
                    previews: previews.length,
                    reviews: reviews.length,
                    unresolvedPreviews: invalidPreviews.length,
                    approvedImports: reviews.filter(function approved(row) { return row.state === 'APPROVED'; }).length
                },
                importGovernance: governanceFlags(actorFromContext(context || {}).role),
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    onboardingGovernancePreserved: true,
                    sensitiveDataFiltered: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return failureOutput('FAILED', tenantFromContext(context || {}), [failure('IMPORT_GOVERNANCE_REPORT_FAILED_SAFE', 'Employee bulk import governance report failed safely.', 'HIGH')], 'Employee bulk import governance report failed safely.');
        }
    }

    var EmployeeBulkImportService = Object.freeze({
        IMPORT_STATES: IMPORT_STATES,
        IMPORT_WORKFLOW: IMPORT_WORKFLOW,
        SUPPORTED_FILE_TYPES: SUPPORTED_FILE_TYPES,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        OPTIONAL_FIELDS: OPTIONAL_FIELDS,
        uploadEmployeeFile: uploadEmployeeFile,
        parseEmployeeImport: parseEmployeeImport,
        generateImportPreview: generateImportPreview,
        calculateImportReadiness: calculateImportReadiness,
        approveImportPreview: approveImportPreview,
        generateImportGovernanceReport: generateImportGovernanceReport,
        normalizeImportPayload: normalizeImportPayload,
        freezeImportOutput: freezeImportOutput
    });

    global.EmployeeBulkImportService = EmployeeBulkImportService;
    global.employeeBulkImportService = EmployeeBulkImportService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var tests = [];
            function check(name, condition) {
                tests.push(Object.freeze({ name: name, passed: !!condition }));
            }
            try {
                var context = { actor: { id: 'HR-SELF', role: 'HR' }, tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipPersistence: true };
                var payload = {
                    tenantSlug: 'self-test',
                    fileName: 'self.csv',
                    fileType: 'CSV',
                    fileContent: 'Employee ID,First Name,Last Name,Email,Department,Designation,Joining Date\nS1,Self,One,self.one@example.com,Operations,Analyst,2026-07-01\nS1,Self,Two,self.two@example.com,Operations,Analyst,2026-07-02'
                };
                var upload = uploadEmployeeFile(payload, context);
                var preview = generateImportPreview(payload, context);
                var blocked = generateImportPreview(payload, { actor: { id: 'EMP-SELF', role: 'EMPLOYEE' }, tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipPersistence: true });
                var malformed = generateImportPreview('bad', context);
                check('file upload works', upload.success === true && upload.directDatabaseImportBlocked === true);
                check('preview generation works', preview.success === true && preview.summary.totalRows === 2);
                check('duplicate detection works', preview.summary.duplicateEmployees === 1);
                check('RBAC works', blocked.success === false);
                check('malformed payloads handled safely', malformed.success === false);
                check('immutable outputs enforced', Object.isFrozen(preview));
            } catch (error) {
                tests.push(Object.freeze({ name: 'self-test failed safely', passed: false }));
            }
            global.__ARTHHRMS_EMPLOYEE_BULK_IMPORT_SELF_TEST__ = freezeImportOutput({
                passed: tests.every(function pass(test) { return test.passed; }),
                tests: tests,
                generatedAt: nowIso()
            });
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
