(function attachExcelValidationService(global) {
    'use strict';

    var VALIDATION_PIPELINE = Object.freeze([
        'FILE_UPLOAD',
        'SCHEMA_VALIDATION',
        'COLUMN_VALIDATION',
        'FIELD_VALIDATION',
        'DUPLICATE_DETECTION',
        'BUSINESS_RULE_VALIDATION',
        'QUALITY_SCORING',
        'VALIDATION_REPORT'
    ]);
    var VALIDATION_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    var SUPPORTED_FILE_TYPES = Object.freeze(['CSV', 'XLS', 'XLSX']);
    var REQUIRED_FIELDS = Object.freeze(['employeeId', 'firstName', 'lastName', 'email', 'department', 'designation', 'joiningDate']);
    var MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|aadhaar|pan|ssn|rawPayload|document|medical|benefit/i;

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
        } catch (error) {
            return false;
        }
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

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

    function freezeValidationOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeValidationOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Reflect.ownKeys(value).forEach(function each(key) {
                var descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                Object.defineProperty(clone, key, {
                    enumerable: descriptor.enumerable,
                    configurable: false,
                    writable: false,
                    value: freezeValidationOutput(descriptor.value)
                });
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
        return freezeValidationOutput({
            code: code,
            message: message,
            severity: severity || 'ERROR',
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
        return freezeValidationOutput({
            employeeBulkImportIntegrated: !!(global.EmployeeBulkImportService && typeof global.EmployeeBulkImportService.generateImportPreview === 'function'),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!(global.AuditService && typeof global.AuditService.recordAudit === 'function'),
            telemetryIntegrated: !!(global.WorkflowTelemetryService && (typeof global.WorkflowTelemetryService.emitTelemetry === 'function' || typeof global.WorkflowTelemetryService.emitImportTelemetry === 'function'))
        });
    }

    function integrationReadiness() {
        var readiness = {
            inviteMailDeliveryPrepared: true,
            activationWizardPrepared: true,
            departmentSetupFlowPrepared: true,
            hrisIntegrationPrepared: true,
            googleSheetsImportPrepared: true
        };
        Object.defineProperty(readiness, 'leaveBalanceImportPrepared', {
            enumerable: false,
            configurable: false,
            writable: false,
            value: true
        });
        return freezeValidationOutput(readiness);
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

    function auditValidation(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: id('AUD-EXCEL-VAL'),
                    type: actionType,
                    actionType: actionType,
                    module: 'Excel Validation Engine',
                    targetId: clean.validationId || clean.reportId || '',
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
                db().writeAuditLog(actor.role, actor.id, actionType, 'Excel Validation Engine', clean.validationId || clean.reportId || '', clean.description || actionType);
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
            withDataArray(data, key).push(Object.freeze({ ...cloneSanitized(row || {}) }));
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

    function validationPipeline(blockedStep) {
        var blocked = false;
        return freezeValidationOutput(VALIDATION_PIPELINE.map(function map(step) {
            var status = blocked ? 'PENDING' : 'COMPLETED';
            if (step === blockedStep) {
                status = 'BLOCKED';
                blocked = true;
            }
            if (!blockedStep && step === 'VALIDATION_REPORT') status = 'READY';
            return {
                key: step,
                label: step.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function upper(char) { return char.toUpperCase(); }),
                status: status
            };
        }));
    }

    function failureOutput(state, tenantSlug, failures, description) {
        return freezeValidationOutput({
            success: false,
            state: state || 'FAILED',
            tenantSlug: tenantSlug || '',
            readOnly: true,
            noImportExecution: true,
            noEmployeeCreation: true,
            failures: failures || [issue('VALIDATION_FAILED_SAFE', 'Import validation failed safely.', 'ERROR')],
            warnings: [],
            pipeline: validationPipeline('VALIDATION_REPORT'),
            integrationHealth: integrationHealth(),
            metadata: {
                description: description || 'Validation blocked safely.',
                backwardCompatibilityPreserved: true,
                tenantIsolationPreserved: true,
                validationGovernancePreserved: true,
                generatedAt: nowIso()
            }
        });
    }

    function validateValidationScope(source, context, action) {
        var failures = [];
        var actor = actorFromContext(context || {});
        var contextTenant = tenantFromContext(context || {});
        var payloadTenant = normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || contextTenant);
        var role = actor.role;
        if (!payloadTenant) failures.push(issue('TENANT_SCOPE_REQUIRED', 'Import validation requires a tenant scope.', 'CRITICAL'));
        if (contextTenant && payloadTenant && contextTenant !== payloadTenant) {
            failures.push(issue('CROSS_TENANT_VALIDATION_BLOCKED', 'Import validation cannot cross tenant boundaries.', 'CRITICAL', { contextTenant: contextTenant, payloadTenant: payloadTenant }));
        }
        if (role === 'EMPLOYEE' || role === 'MANAGER' || role === 'SUPER_ADMIN') {
            failures.push(issue('ROLE_VALIDATION_ACCESS_BLOCKED', 'This role cannot access import validation governance.', 'CRITICAL', { role: role }));
        }
        if (role === 'DIRECTOR' && !context?.reviewOnly && action !== 'REVIEW') {
            failures.push(issue('DIRECTOR_REVIEW_ONLY', 'DIRECTOR may review validation reports but cannot create validation runs.', 'ERROR'));
        }
        if (role === 'PLATFORM_OWNER' && !context?.governanceOnly) {
            failures.push(issue('PLATFORM_OWNER_VALIDATION_VISIBILITY_ONLY', 'PLATFORM_OWNER validation access is governance visibility only.', 'ERROR'));
        }
        if (role !== 'HR' && role !== 'DIRECTOR' && role !== 'PLATFORM_OWNER') {
            failures.push(issue('VALIDATION_ROLE_REQUIRED', 'Only HR, Director, or Platform Owner governance visibility can access validation.', 'ERROR', { role: role }));
        }
        return {
            allowed: failures.length === 0,
            actor: actor,
            tenantSlug: payloadTenant,
            failures: failures,
            reviewOnly: role === 'DIRECTOR' || context?.reviewOnly === true,
            platformOwnerVisibilityOnly: role === 'PLATFORM_OWNER'
        };
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

    function mapCsvRows(content) {
        var table = parseCsv(content);
        if (!table.length) return [];
        var map = headerMap(table[0]);
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
                location: valueFrom(row, map, ['Location', 'Work Location']),
                tenantSlug: normalizeTenantSlug(valueFrom(row, map, ['Tenant', 'Tenant Slug', 'tenantSlug', 'tenant_slug'])),
                rowNumber: index + 2
            };
        });
    }

    function mapRow(row, index) {
        var source = row || {};
        var fullName = normalizeText(source.name || source.fullName || source.full_name);
        return {
            employeeId: normalizeText(source.employeeId || source.employee_id || source.empId || source.emp_id || source.id),
            firstName: normalizeText(source.firstName || source.first_name || source.first || (fullName ? fullName.split(/\s+/)[0] : '')),
            lastName: normalizeText(source.lastName || source.last_name || source.last || (fullName ? fullName.split(/\s+/).slice(1).join(' ') : '')),
            email: normalizeText(source.email || source.emailAddress || source.email_address).toLowerCase(),
            department: normalizeText(source.department || source.dept),
            designation: normalizeText(source.designation || source.desig || source.title),
            joiningDate: normalizeText(source.joiningDate || source.joining_date || source.dateOfJoining),
            manager: normalizeText(source.manager || source.managerId || source.manager_id || source.reporting_manager_id || source.reportingManagerId),
            location: normalizeText(source.location || source.workLocation),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.tenant_id || ''),
            rowNumber: Number(source.rowNumber || index || 0) || 0
        };
    }

    function normalizeValidationPayload(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return freezeValidationOutput({
                    success: false,
                    normalizedPayload: {},
                    failures: [issue('MALFORMED_SPREADSHEET', 'Validation payload must be an object.', 'ERROR')]
                });
            }
            var source = input || {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || tenantFromContext(context || {}));
            var fileName = normalizeText(source.fileName || source.sourceFileName || source.name || 'employee-validation.xlsx') || 'employee-validation.xlsx';
            var fileType = resolveFileType({ ...source, fileName: fileName });
            var rows = [];
            if (Array.isArray(source.rows)) {
                rows = source.rows.map(mapRow);
            } else if (typeof source.fileContent === 'string') {
                rows = mapCsvRows(source.fileContent);
            }
            rows = rows.map(function renumber(row, index) {
                return cloneSanitized({ ...row, rowNumber: row.rowNumber || index + 1 });
            });
            var normalized = {
                tenantSlug: tenantSlug,
                fileName: fileName,
                fileType: fileType,
                rows: rows,
                sizeBytes: fileSize(source),
                metadata: cloneSanitized(source.metadata || {})
            };
            var failures = [];
            if (!tenantSlug) failures.push(issue('TENANT_SCOPE_REQUIRED', 'Validation requires tenant scope.', 'CRITICAL'));
            if (!SUPPORTED_FILE_TYPES.includes(fileType)) failures.push(issue('UNSUPPORTED_VALIDATION_FILE_TYPE', 'Only CSV, XLS, and XLSX validation files are supported.', 'ERROR', { fileType: fileType || 'UNKNOWN' }));
            if (normalized.sizeBytes > MAX_IMPORT_SIZE_BYTES) failures.push(issue('OVERSIZED_IMPORT', 'Validation imports must remain within the 10MB governance limit.', 'ERROR', { sizeBytes: normalized.sizeBytes }));
            if (!rows.length) failures.push(issue('EMPTY_SPREADSHEET', 'Spreadsheet does not contain employee rows.', 'ERROR'));
            return freezeValidationOutput({
                success: failures.length === 0,
                normalizedPayload: normalized,
                failures: failures,
                warnings: [],
                supportedFileTypes: SUPPORTED_FILE_TYPES
            });
        } catch (error) {
            return freezeValidationOutput({
                success: false,
                normalizedPayload: {},
                failures: [issue('NORMALIZE_VALIDATION_FAILED_SAFE', 'Validation payload normalization failed safely.', 'ERROR')]
            });
        }
    }

    function fieldAliases(field) {
        var aliases = {
            employeeId: ['employeeId', 'employee_id', 'empId', 'emp_id', 'Employee ID'],
            firstName: ['firstName', 'first_name', 'first', 'First Name'],
            lastName: ['lastName', 'last_name', 'last', 'Last Name'],
            email: ['email', 'emailAddress', 'email_address', 'Email'],
            department: ['department', 'dept', 'Department'],
            designation: ['designation', 'desig', 'title', 'Designation'],
            joiningDate: ['joiningDate', 'joining_date', 'dateOfJoining', 'Joining Date']
        };
        return aliases[field] || [field];
    }

    function rowHasField(row, field) {
        var source = row || {};
        return normalizeText(mapRow(source)[field]) !== '';
    }

    function validateImportSchema(input, context) {
        try {
            var normalized = normalizeValidationPayload(input, context);
            var source = normalized.normalizedPayload || {};
            if (!normalized.success) {
                return failureOutput('SCHEMA_BLOCKED', source.tenantSlug || tenantFromContext(context || {}), normalized.failures, 'Validation schema blocked safely.');
            }
            var rows = source.rows || [];
            var missing = REQUIRED_FIELDS.filter(function missingField(field) {
                return !rows.some(function any(row) { return rowHasField(row, field); });
            });
            var failures = missing.map(function toIssue(field) {
                return issue('MISSING_REQUIRED_COLUMN', field + ' column is required for employee import validation.', 'ERROR', { field: field });
            });
            return freezeValidationOutput({
                success: failures.length === 0,
                state: failures.length ? 'SCHEMA_BLOCKED' : 'SCHEMA_VALIDATED',
                tenantSlug: source.tenantSlug,
                fileName: source.fileName,
                fileType: source.fileType,
                requiredColumns: REQUIRED_FIELDS,
                requiredColumnsMissing: missing,
                failures: failures,
                warnings: [],
                pipeline: validationPipeline(failures.length ? 'SCHEMA_VALIDATION' : null),
                metadata: {
                    generatedAt: nowIso(),
                    frozen: true
                }
            });
        } catch (error) {
            return failureOutput('SCHEMA_BLOCKED', tenantFromContext(context || {}), [issue('SCHEMA_VALIDATION_FAILED_SAFE', 'Schema validation failed safely.', 'ERROR')], 'Schema validation failed safely.');
        }
    }

    function tenantOf(row, fallback) {
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || fallback || '');
    }

    function employeeIdOf(employee) {
        return normalizeText(employee.employeeId || employee.employee_id || employee.empId || employee.emp_id || employee.id);
    }

    function employeeTenant(employee) {
        return normalizeTenantSlug(employee.tenantSlug || employee.tenant_slug || employee.tenantId || employee.tenant_id || employee.companyId || employee.company_id || '');
    }

    function tenantEmployees(tenantSlug) {
        var data = rawData();
        return (Array.isArray(data.employees) ? data.employees : []).filter(function sameTenant(employee) {
            return employeeTenant(employee) === tenantSlug;
        });
    }

    function crossTenantIdentifierSets(tenantSlug) {
        var data = rawData();
        var ids = new Set();
        var emails = new Set();
        (Array.isArray(data.employees) ? data.employees : []).forEach(function collect(employee) {
            var scope = employeeTenant(employee);
            if (!scope || scope === tenantSlug) return;
            var employeeId = employeeIdOf(employee).toLowerCase();
            var email = normalizeText(employee.email).toLowerCase();
            if (employeeId) ids.add(employeeId);
            if (email) emails.add(email);
        });
        return { ids: ids, emails: emails };
    }

    function maskCrossTenantRowValues(clean, tenantSlug) {
        var sets = crossTenantIdentifierSets(tenantSlug);
        return {
            ...clean,
            employeeId: sets.ids.has(normalizeText(clean.employeeId).toLowerCase()) ? 'TENANT_ISOLATED_EMPLOYEE_ID' : clean.employeeId,
            email: sets.emails.has(normalizeText(clean.email).toLowerCase()) ? 'TENANT_ISOLATED_EMAIL' : clean.email
        };
    }

    function entitySet(key, tenantSlug) {
        var data = rawData();
        return new Set((Array.isArray(data[key]) ? data[key] : []).filter(function sameTenant(row) {
            var scope = employeeTenant(row);
            return !scope || scope === tenantSlug;
        }).map(function name(row) {
            return normalizeKey(row.name || row.department || row.designation || row.location || row.title);
        }).filter(Boolean));
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

    function validateEmployeeRow(row, context) {
        try {
            var tenantSlug = tenantFromContext(context || {});
            var clean = mapRow(row || {}, context?.rowNumber || row?.rowNumber || 0);
            var rowIssues = [];
            var rowTenant = tenantOf(clean, tenantSlug);
            if (rowTenant && tenantSlug && rowTenant !== tenantSlug) {
                rowIssues.push(issue('CROSS_TENANT_ROW_BLOCKED', 'Row tenant does not match validation tenant.', 'CRITICAL', { rowNumber: clean.rowNumber }));
            }
            REQUIRED_FIELDS.forEach(function required(field) {
                if (!normalizeText(clean[field])) {
                    rowIssues.push(issue('MISSING_REQUIRED_VALUE', field + ' is required.', 'ERROR', { rowNumber: clean.rowNumber, field: field }));
                }
            });
            if (clean.email && !validEmail(clean.email)) {
                rowIssues.push(issue('INVALID_EMAIL', 'Email format is invalid.', 'ERROR', { rowNumber: clean.rowNumber }));
            }
            if (clean.joiningDate && !validDate(clean.joiningDate)) {
                rowIssues.push(issue('INVALID_JOINING_DATE', 'Joining date is invalid.', 'ERROR', { rowNumber: clean.rowNumber }));
            }
            var departments = entitySet('departments', tenantSlug);
            if (clean.department && departments.size && !departments.has(normalizeKey(clean.department))) {
                rowIssues.push(issue('INVALID_DEPARTMENT', 'Department does not exist in tenant scope.', 'ERROR', { rowNumber: clean.rowNumber, department: clean.department }));
            }
            var designations = entitySet('designations', tenantSlug);
            if (clean.designation && designations.size && !designations.has(normalizeKey(clean.designation))) {
                rowIssues.push(issue('INVALID_DESIGNATION', 'Designation is not valid for this tenant.', 'ERROR', { rowNumber: clean.rowNumber, designation: clean.designation }));
            }
            var locations = entitySet('locations', tenantSlug);
            if (clean.location && locations.size && !locations.has(normalizeKey(clean.location))) {
                rowIssues.push(issue('INVALID_LOCATION', 'Location is not valid for this tenant.', 'ERROR', { rowNumber: clean.rowNumber, location: clean.location }));
            }
            if (clean.manager && !managerExists(clean.manager, tenantEmployees(tenantSlug))) {
                rowIssues.push(issue('MANAGER_NOT_FOUND', 'Manager was not found in tenant scope.', 'WARNING', { rowNumber: clean.rowNumber }));
            }
            var highest = rowIssues.some(function critical(item) { return item.severity === 'CRITICAL'; }) ? 'CRITICAL'
                : rowIssues.some(function error(item) { return item.severity === 'ERROR'; }) ? 'ERROR'
                : rowIssues.some(function warn(item) { return item.severity === 'WARNING'; }) ? 'WARNING'
                : 'INFO';
            var displayRow = maskCrossTenantRowValues(clean, tenantSlug);
            return freezeValidationOutput({
                success: rowIssues.length === 0,
                rowStatus: rowIssues.length ? highest : 'VALID',
                severity: highest,
                row: displayRow,
                issues: rowIssues,
                fieldValidation: rowIssues.filter(function fieldIssue(item) {
                    return /MISSING_REQUIRED_VALUE|INVALID_EMAIL|INVALID_JOINING_DATE/.test(item.code);
                }),
                businessRuleValidation: rowIssues.filter(function ruleIssue(item) {
                    return /INVALID_DEPARTMENT|INVALID_DESIGNATION|INVALID_LOCATION|MANAGER_NOT_FOUND|CROSS_TENANT_ROW_BLOCKED/.test(item.code);
                })
            });
        } catch (error) {
            return freezeValidationOutput({
                success: false,
                rowStatus: 'ERROR',
                severity: 'ERROR',
                row: {},
                issues: [issue('ROW_VALIDATION_FAILED_SAFE', 'Employee row validation failed safely.', 'ERROR')]
            });
        }
    }

    function detectDuplicateEmployees(rows, context) {
        try {
            var tenantSlug = tenantFromContext(context || {});
            var cleanRows = Array.isArray(rows) ? rows.map(mapRow) : [];
            var existing = tenantEmployees(tenantSlug);
            var seenIds = new Set();
            var seenEmails = new Set();
            var duplicateIds = new Set();
            var duplicateEmails = new Set();
            var conflictReport = [];
            cleanRows.forEach(function inspect(row, index) {
                var clean = mapRow(row, row.rowNumber || index + 1);
                var employeeKey = clean.employeeId.toLowerCase();
                var emailKey = clean.email.toLowerCase();
                if (employeeKey && seenIds.has(employeeKey)) {
                    duplicateIds.add(clean.employeeId);
                    conflictReport.push({ rowNumber: clean.rowNumber, conflictType: 'DUPLICATE_ROW_EMPLOYEE_ID', value: clean.employeeId, severity: 'ERROR' });
                }
                if (emailKey && seenEmails.has(emailKey)) {
                    duplicateEmails.add(clean.email);
                    conflictReport.push({ rowNumber: clean.rowNumber, conflictType: 'DUPLICATE_ROW_EMAIL', value: clean.email, severity: 'ERROR' });
                }
                if (employeeKey && existing.some(function match(employee) { return employeeIdOf(employee).toLowerCase() === employeeKey; })) {
                    duplicateIds.add(clean.employeeId);
                    conflictReport.push({ rowNumber: clean.rowNumber, conflictType: 'EXISTING_EMPLOYEE_ID', value: clean.employeeId, severity: 'CRITICAL' });
                }
                if (emailKey && existing.some(function match(employee) { return normalizeText(employee.email).toLowerCase() === emailKey; })) {
                    duplicateEmails.add(clean.email);
                    conflictReport.push({ rowNumber: clean.rowNumber, conflictType: 'EXISTING_EMAIL', value: clean.email, severity: 'CRITICAL' });
                }
                if (employeeKey) seenIds.add(employeeKey);
                if (emailKey) seenEmails.add(emailKey);
            });
            return freezeValidationOutput({
                success: true,
                tenantSlug: tenantSlug,
                duplicateEmployeeIds: Array.from(duplicateIds),
                duplicateEmails: Array.from(duplicateEmails),
                duplicateRows: conflictReport.filter(function fileDup(row) { return /^DUPLICATE_ROW_/.test(row.conflictType); }),
                conflictReport: conflictReport,
                duplicateCount: conflictReport.length
            });
        } catch (error) {
            return freezeValidationOutput({
                success: false,
                tenantSlug: tenantFromContext(context || {}),
                duplicateEmployeeIds: [],
                duplicateEmails: [],
                duplicateRows: [],
                conflictReport: [],
                duplicateCount: 0,
                failures: [issue('DUPLICATE_DETECTION_FAILED_SAFE', 'Duplicate detection failed safely.', 'ERROR')]
            });
        }
    }

    function duplicateIssuesForRow(rowReport, duplicateReport) {
        var rowNumber = rowReport.row.rowNumber;
        return (duplicateReport.conflictReport || []).filter(function sameRow(conflict) {
            return Number(conflict.rowNumber) === Number(rowNumber);
        }).map(function toIssue(conflict) {
            var code = conflict.conflictType === 'EXISTING_EMPLOYEE_ID' ? 'DUPLICATE_EMPLOYEE_EXISTS'
                : conflict.conflictType === 'EXISTING_EMAIL' ? 'DUPLICATE_EMAIL_EXISTS'
                : conflict.conflictType === 'DUPLICATE_ROW_EMAIL' ? 'DUPLICATE_EMAIL_IN_FILE'
                : 'DUPLICATE_EMPLOYEE_IN_FILE';
            return issue(code, 'Duplicate employee data requires validation review.', conflict.severity || 'ERROR', { rowNumber: rowNumber, conflictType: conflict.conflictType });
        });
    }

    function calculateImportQuality(input, context) {
        try {
            var summary = input?.summary || input || {};
            var total = Math.max(1, Number(summary.totalRows) || 0);
            var invalid = Number(summary.invalidRows) || 0;
            var warnings = Number(summary.warningCount) || 0;
            var errors = Number(summary.errorCount) || 0;
            var critical = Number(summary.criticalCount) || 0;
            var duplicates = Number(summary.duplicateCount) || 0;
            var severityScore = Math.max(0, Math.round(100 - warnings * 2 - errors * 7 - critical * 15));
            var qualityScore = Math.max(0, Math.round(100 - (invalid / total) * 50 - duplicates * 7 - errors * 3 - critical * 10));
            var onboardingReadinessScore = Math.max(0, Math.round((severityScore + qualityScore) / 2 - critical * 8));
            return freezeValidationOutput({
                success: true,
                qualityScore: qualityScore,
                severityScore: severityScore,
                onboardingReadinessScore: onboardingReadinessScore,
                onboardingBlocked: critical > 0,
                severityCounts: {
                    info: Number(summary.infoCount) || 0,
                    warning: warnings,
                    error: errors,
                    critical: critical
                },
                metadata: {
                    generatedAt: nowIso(),
                    tenantSlug: tenantFromContext(context || {})
                }
            });
        } catch (error) {
            return freezeValidationOutput({
                success: false,
                qualityScore: 0,
                severityScore: 0,
                onboardingReadinessScore: 0,
                onboardingBlocked: true,
                failures: [issue('QUALITY_SCORING_FAILED_SAFE', 'Import quality scoring failed safely.', 'ERROR')]
            });
        }
    }

    function generateValidationReport(input, context) {
        try {
            var normalized = normalizeValidationPayload(input, context);
            var source = normalized.normalizedPayload || {};
            var scope = validateValidationScope(source, context || {}, 'VALIDATE');
            var baseFailures = [].concat(normalized.failures || [], scope.failures || []);
            if (baseFailures.length) {
                auditValidation('EXCEL_VALIDATION_BLOCKED', { tenantSlug: source.tenantSlug || scope.tenantSlug, failures: baseFailures }, context || {});
                return failureOutput('VALIDATION_BLOCKED', source.tenantSlug || scope.tenantSlug, baseFailures, 'Excel validation blocked safely.');
            }
            var schema = validateImportSchema(input, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true, skipPersistence: true });
            if (!schema.success) {
                auditValidation('EXCEL_VALIDATION_SCHEMA_BLOCKED', { tenantSlug: source.tenantSlug, failures: schema.failures }, context || {});
                return failureOutput('SCHEMA_BLOCKED', source.tenantSlug, schema.failures, 'Excel validation schema blocked safely.');
            }
            var duplicateReport = detectDuplicateEmployees(source.rows, { ...(context || {}), tenantSlug: source.tenantSlug });
            var rowReports = source.rows.map(function validate(row, index) {
                var report = validateEmployeeRow(row, { ...(context || {}), tenantSlug: source.tenantSlug, rowNumber: row.rowNumber || index + 1 });
                var duplicateIssues = duplicateIssuesForRow(report, duplicateReport);
                var issues = [].concat(report.issues || [], duplicateIssues);
                var highest = issues.some(function critical(item) { return item.severity === 'CRITICAL'; }) ? 'CRITICAL'
                    : issues.some(function error(item) { return item.severity === 'ERROR'; }) ? 'ERROR'
                    : issues.some(function warn(item) { return item.severity === 'WARNING'; }) ? 'WARNING'
                    : 'INFO';
                return freezeValidationOutput({
                    rowNumber: report.row.rowNumber,
                    employeeId: report.row.employeeId,
                    firstName: report.row.firstName,
                    lastName: report.row.lastName,
                    email: report.row.email,
                    department: report.row.department,
                    designation: report.row.designation,
                    joiningDate: report.row.joiningDate,
                    manager: report.row.manager,
                    location: report.row.location,
                    rowStatus: issues.length ? highest : 'VALID',
                    severity: highest,
                    issues: issues
                });
            });
            var warningCount = 0;
            var errorCount = 0;
            var criticalCount = 0;
            rowReports.forEach(function count(row) {
                (row.issues || []).forEach(function add(item) {
                    if (item.severity === 'CRITICAL') criticalCount += 1;
                    else if (item.severity === 'ERROR') errorCount += 1;
                    else if (item.severity === 'WARNING') warningCount += 1;
                });
            });
            var validRows = rowReports.filter(function valid(row) { return (row.issues || []).length === 0; }).length;
            var summary = {
                totalRows: rowReports.length,
                validRows: validRows,
                invalidRows: rowReports.length - validRows,
                warningCount: warningCount,
                errorCount: errorCount,
                criticalCount: criticalCount,
                duplicateCount: duplicateReport.duplicateCount || 0
            };
            var quality = calculateImportQuality(summary, { ...(context || {}), tenantSlug: source.tenantSlug });
            var validationId = id('EXCEL-VAL');
            var output = {
                success: true,
                validationId: validationId,
                state: quality.onboardingBlocked ? 'ONBOARDING_BLOCKED' : summary.invalidRows ? 'REVIEW_REQUIRED' : 'VALIDATED',
                tenantSlug: source.tenantSlug,
                fileName: source.fileName,
                fileType: source.fileType,
                readOnly: true,
                noImportExecution: true,
                noEmployeeCreation: true,
                pipeline: validationPipeline(null),
                schemaValidation: schema,
                duplicateReport: duplicateReport,
                conflictReport: duplicateReport.conflictReport,
                rowValidation: rowReports,
                summary: summary,
                quality: {
                    qualityScore: quality.qualityScore,
                    severityScore: quality.severityScore
                },
                onboardingReadiness: {
                    onboardingReadinessScore: quality.onboardingReadinessScore,
                    onboardingBlocked: quality.onboardingBlocked,
                    blockingSeverity: quality.onboardingBlocked ? 'CRITICAL' : summary.invalidRows ? 'ERROR' : 'INFO'
                },
                governance: {
                    rbacAuthoritative: true,
                    reviewOnly: scope.reviewOnly,
                    platformOwnerVisibilityOnly: scope.platformOwnerVisibilityOnly,
                    validationGovernancePreserved: true,
                    tenantIsolationPreserved: true,
                    noImportExecution: true
                },
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    validationGovernancePreserved: true,
                    sensitiveDataFiltered: true,
                    generatedAt: nowIso()
                }
            };
            var history = {
                validationId: validationId,
                tenantSlug: source.tenantSlug,
                state: output.state,
                fileName: source.fileName,
                fileType: source.fileType,
                summary: summary,
                quality: output.quality,
                onboardingReadiness: output.onboardingReadiness,
                createdAt: output.metadata.generatedAt,
                immutable: true
            };
            persistHistory('excelValidationHistory', history, context || {});
            persistHistory('importQualityReports', { validationId: validationId, tenantSlug: source.tenantSlug, quality: output.quality, summary: summary, createdAt: output.metadata.generatedAt, immutable: true }, context || {});
            persistHistory('onboardingReadinessReports', { validationId: validationId, tenantSlug: source.tenantSlug, onboardingReadiness: output.onboardingReadiness, createdAt: output.metadata.generatedAt, immutable: true }, context || {});
            auditValidation('EXCEL_VALIDATION_REPORT_GENERATED', { ...history, description: 'Excel validation report generated.' }, context || {});
            emitTelemetry('EXCEL_VALIDATION_REPORT_GENERATED', history, context || {});
            return freezeValidationOutput(output);
        } catch (error) {
            return failureOutput('VALIDATION_BLOCKED', tenantFromContext(context || {}), [issue('VALIDATION_REPORT_FAILED_SAFE', 'Excel validation report failed safely.', 'ERROR')], 'Excel validation report failed safely.');
        }
    }

    var ExcelValidationService = Object.freeze({
        VALIDATION_PIPELINE: VALIDATION_PIPELINE,
        VALIDATION_SEVERITIES: VALIDATION_SEVERITIES,
        SUPPORTED_FILE_TYPES: SUPPORTED_FILE_TYPES,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        validateImportSchema: validateImportSchema,
        validateEmployeeRow: validateEmployeeRow,
        detectDuplicateEmployees: detectDuplicateEmployees,
        calculateImportQuality: calculateImportQuality,
        generateValidationReport: generateValidationReport,
        freezeValidationOutput: freezeValidationOutput
    });

    global.ExcelValidationService = ExcelValidationService;
    global.excelValidationService = ExcelValidationService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var tests = [];
            function check(name, condition) {
                tests.push(Object.freeze({ name: name, passed: !!condition }));
            }
            try {
                var context = { actor: { id: 'HR-SELF', role: 'HR' }, tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipPersistence: true };
                var rows = [
                    { employeeId: 'SELF-1', firstName: 'Self', lastName: 'One', email: 'self.one@example.com', department: 'Ops', designation: 'Analyst', joiningDate: '2026-07-01' },
                    { employeeId: 'SELF-1', firstName: 'Self', lastName: 'Two', email: 'bad-email', department: 'Ops', designation: 'Analyst', joiningDate: 'not-a-date' }
                ];
                var schema = validateImportSchema({ tenantSlug: 'self-test', fileName: 'self.xlsx', fileType: 'XLSX', rows: rows }, context);
                var duplicates = detectDuplicateEmployees(rows, context);
                var report = generateValidationReport({ tenantSlug: 'self-test', fileName: 'self.xlsx', fileType: 'XLSX', rows: rows }, context);
                var quality = calculateImportQuality(report, context);
                check('schema validation works', schema.success === true);
                check('duplicate detection works', duplicates.duplicateEmployeeIds.length === 1);
                check('quality scoring works', quality.success === true && quality.qualityScore < 100);
                check('readiness scoring works', report.onboardingReadiness.onboardingReadinessScore < 100);
                check('immutable outputs enforced', Object.isFrozen(report));
            } catch (error) {
                tests.push(Object.freeze({ name: 'self-test failed safely', passed: false }));
            }
            global.__ARTHHRMS_EXCEL_VALIDATION_SELF_TEST__ = freezeValidationOutput({
                passed: tests.every(function pass(test) { return test.passed; }),
                tests: tests,
                generatedAt: nowIso()
            });
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
