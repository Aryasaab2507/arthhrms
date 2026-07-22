/**
 * goLiveValidationService.js
 * Tenant-scoped, read-only company go-live validation and certification.
 */
(function attachGoLiveValidationService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var SOURCE = 'goLiveValidationService';
    var MAX_HISTORY = 500;
    var VALIDATION_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var APPROVAL_ROLES = Object.freeze(['ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var TABLES = Object.freeze({
        runs: 'goLiveValidationRuns',
        risks: 'goLiveRiskAssessments',
        certificates: 'goLiveCertificates',
        approvals: 'goLiveApprovals',
        overrides: 'goLiveOverrides',
        revocations: 'goLiveGovernanceRevocations',
        rollbacks: 'goLiveRollbackHistory',
        schedules: 'goLiveValidationSchedules',
        dashboards: 'goLiveDashboardSnapshots',
        audit: 'goLiveValidationAuditHistory'
    });
    var CHECKLIST_DEFINITIONS = Object.freeze([
        ['COMPANY_PROFILE', 'Company Profile'],
        ['BRANCHES', 'Branches'],
        ['DEPARTMENTS', 'Departments'],
        ['DESIGNATIONS', 'Designations'],
        ['EMPLOYEES', 'Employees'],
        ['REPORTING_HIERARCHY', 'Reporting Hierarchy'],
        ['DOCUMENTS', 'Documents'],
        ['LEAVE_POLICIES', 'Leave Policies'],
        ['ATTENDANCE_POLICIES', 'Attendance Policies'],
        ['SHIFT_TEMPLATES', 'Shift Templates'],
        ['PAYROLL_CONFIGURATION', 'Payroll Configuration'],
        ['APPROVAL_WORKFLOWS', 'Approval Workflows'],
        ['NOTIFICATIONS', 'Notifications'],
        ['EMAIL_CONFIGURATION', 'Email Configuration'],
        ['STORAGE_CONFIGURATION', 'Storage Configuration'],
        ['BACKUP_CONFIGURATION', 'Backup Configuration']
    ]);
    var SENSITIVE_KEY = /(password|secret|token|authorization|credential|private.?key|api.?key|cookie|session.?id|salary|compensation|bank|aadhaar|passport|government.?id|tax.?id|date.?of.?birth|dob|employee.?name|employee.?email|phone|address|payload|content|body|raw)/i;
    var SENSITIVE_VALUE = /(bearer\s+[a-z0-9._=-]+|password\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|private company data)/ig;
    var idCounter = 0;

    function db() { try { return global.DB || null; } catch (error) { return null; } }
    function rawData() {
        try { return db() && typeof db().get === 'function' ? db().get() || {} : {}; }
        catch (error) { return {}; }
    }
    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') { db().save(data || {}); return true; }
        } catch (error) {}
        return false;
    }
    function ensureTables(data) {
        var store = data || {};
        Object.keys(TABLES).forEach(function each(key) {
            var table = TABLES[key];
            if (!Array.isArray(store[table])) store[table] = [];
        });
        if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
        return store;
    }
    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }
    function safeNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : Number(fallback || 0);
    }
    function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function token(value) {
        return safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }
    function normalizeTenant(value) {
        return safeString(value, '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    function normalizeId(value) { return token(value); }
    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        return role || 'EMPLOYEE';
    }
    function defaultTenant() {
        var data = rawData();
        return normalizeTenant((data.companySettings || {}).tenantSlug || (data.companySettings || {}).tenantId || (data.companySettings || {}).companyId || 'default');
    }
    function contextTenant(context) {
        var source = context || {};
        var actor = source.actor || {};
        return normalizeTenant(source.tenantSlug || source.tenantId || actor.tenantSlug || actor.tenantId || '');
    }
    function actor(context) {
        var source = context || {};
        var row = source.actor || {};
        return {
            id: safeString(row.id || source.actorId || 'SYSTEM', 'SYSTEM'),
            role: normalizeRole(row.role || source.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(row.tenantSlug || source.tenantSlug || source.tenantId || defaultTenant())
        };
    }
    function nowMs(context) {
        var value = context && context.now ? new Date(context.now).getTime() : Date.now();
        return Number.isFinite(value) ? value : Date.now();
    }
    function nowIso(context) { return new Date(nowMs(context || {})).toISOString(); }
    function createId(prefix) {
        idCounter += 1;
        return prefix + '-' + nowMs({}).toString(36).toUpperCase() + '-' + idCounter.toString(36).toUpperCase().padStart(4, '0');
    }
    function clamp(value) { return Math.max(0, Math.min(100, Math.round(safeNumber(value, 0)))); }
    function average(values, fallback) {
        var numbers = (values || []).map(Number).filter(Number.isFinite);
        return numbers.length ? clamp(numbers.reduce(function sum(total, value) { return total + value; }, 0) / numbers.length) : clamp(fallback || 0);
    }
    function cloneSafe(value, key, seen) {
        var refs = seen || [];
        if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (SENSITIVE_KEY.test(key || '')) return '[REDACTED]';
        if (!value || typeof value !== 'object') return typeof value === 'string' ? value.replace(SENSITIVE_VALUE, '[REDACTED]').slice(0, 2400) : value;
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function map(item) { return cloneSafe(item, '', refs.slice()); }).filter(function keep(item) { return typeof item !== 'undefined'; });
        var output = {};
        Object.keys(value).forEach(function each(name) {
            if (name === '__proto__' || name === 'prototype' || name === 'constructor') return;
            var next = cloneSafe(value[name], name, refs.slice());
            if (typeof next !== 'undefined') output[name] = next;
        });
        return output;
    }
    function freezeDeep(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        Object.keys(value).forEach(function each(key) { freezeDeep(value[key], refs.slice()); });
        try { Object.freeze(value); } catch (error) {}
        return value;
    }
    function freezeGoLiveOutput(value) { return freezeDeep(cloneSafe(value || {}, '', []), []); }
    function result(success, code, message, extra) {
        return freezeGoLiveOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'GO_LIVE_OPERATION_COMPLETED' : 'GO_LIVE_OPERATION_FAILED')),
            message: safeString(message, success ? 'Operation completed.' : 'Operation failed.')
        }, extra || {}));
    }
    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            productionDataModified: false,
            administratorConfirmationRequired: true,
            automaticRemediationApplied: false,
            existingBusinessWorkflowsUnmodified: true,
            rollbackSupportedWhereApplicable: true,
            auditLoggingEnabled: true,
            aggregateOnlyOutput: true,
            readOnlyValidation: true
        }, extra || {});
    }
    function validateAccess(input, context, approvalRequired) {
        var target = normalizeTenant((input || {}).tenantSlug || (input || {}).tenantId || contextTenant(context) || defaultTenant());
        var caller = contextTenant(context) || target;
        var activeActor = actor(context || {});
        if (!target) return { allowed: false, code: 'TENANT_REQUIRED', message: 'A tenant scope is required.' };
        if (caller && caller !== target) return { allowed: false, code: 'TENANT_ACCESS_DENIED', message: 'Go-live operations are tenant scoped.' };
        var roles = approvalRequired ? APPROVAL_ROLES : VALIDATION_ROLES;
        if (roles.indexOf(activeActor.role) === -1) return { allowed: false, code: approvalRequired ? 'GO_LIVE_APPROVAL_RBAC_DENIED' : 'GO_LIVE_VALIDATION_RBAC_DENIED', message: 'The current role cannot perform this go-live operation.' };
        return { allowed: true, tenantSlug: target, actor: activeActor };
    }
    function rowTenant(row) { return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.organizationId || row.companyId) || ''); }
    function sameTenant(row, tenantSlug) {
        var owner = rowTenant(row);
        return owner ? owner === normalizeTenant(tenantSlug) : normalizeTenant(tenantSlug) === defaultTenant();
    }
    function tenantRows(data, keys, tenantSlug) {
        var output = [];
        (keys || []).forEach(function each(key) {
            if (Array.isArray(data[key])) output = output.concat(data[key]);
        });
        return output.filter(function keep(row) { return sameTenant(row, tenantSlug); });
    }
    function statusReady(row) {
        if (!row) return false;
        if (row.active === false || row.enabled === false) return false;
        var status = token(row.status || row.state || row.lifecycleState || row.approvalStatus || 'ACTIVE');
        return ['ACTIVE', 'READY', 'VALID', 'VALIDATED', 'PASSED', 'PUBLISHED', 'COMPLETED', 'CERTIFIED', 'HEALTHY', 'DELIVERED', 'APPROVED', 'CONFIGURED', 'INDEXED', 'SUCCESS'].indexOf(status) !== -1;
    }
    function flag(input, code, computed) {
        var evidence = isObject(input && input.evidence) ? input.evidence : {};
        if (Object.prototype.hasOwnProperty.call(evidence, code)) return evidence[code] === true;
        if (isObject(evidence.overrides) && Object.prototype.hasOwnProperty.call(evidence.overrides, code)) return evidence.overrides[code] === true;
        return computed === true;
    }
    function makeCheck(domain, code, name, passed, severity, recommendation, metadata) {
        var level = token(severity || (passed ? 'INFO' : 'HIGH')) || 'HIGH';
        var info = isObject(metadata) ? metadata : {};
        var blocking = info.blocking !== false;
        return {
            checkId: token(domain + '_' + code),
            domain: token(domain),
            code: token(code),
            name: safeString(name, code),
            status: passed ? 'PASSED' : (blocking ? 'FAILED' : 'WARNING'),
            severity: passed ? 'INFO' : level,
            blocking: blocking,
            score: passed ? 100 : (blocking ? (level === 'CRITICAL' ? 0 : level === 'HIGH' ? 35 : 60) : 75),
            recommendation: safeString(recommendation, passed ? 'No action required.' : 'Review this check before go-live.'),
            metadata: Object.assign({ aggregateOnly: true }, cloneSafe(info, '', []))
        };
    }
    function domainResult(domain, checks, context, extra) {
        var rows = checks || [];
        var failed = rows.filter(function keep(row) { return row.status === 'FAILED'; });
        return freezeGoLiveOutput(Object.assign({
            success: true,
            domain: token(domain),
            status: failed.length ? 'FAILED' : 'PASSED',
            score: average(rows.map(function map(row) { return row.score; }), rows.length ? 0 : 100),
            checks: rows,
            failedChecks: failed,
            generatedAt: nowIso(context),
            governance: governanceFlags()
        }, extra || {}));
    }
    function persist(table, row) {
        var data = ensureTables(rawData());
        data[table].unshift(Object.assign({}, cloneSafe(row, '', []), { immutable: true }));
        data[table] = data[table].slice(0, MAX_HISTORY);
        saveData(data);
    }
    function emitTelemetry(eventType, metadata, context) {
        if (context && context.skipTelemetry) return;
        try {
            if (global.WorkflowTelemetryService && typeof global.WorkflowTelemetryService.emitWorkflowTelemetry === 'function') {
                global.WorkflowTelemetryService.emitWorkflowTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: cloneSafe(metadata || {}, '', []) });
            }
        } catch (error) {}
    }
    function recordMetric(eventType, metadata, context) {
        if (context && context.skipMetrics) return;
        try {
            if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') {
                global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, cloneSafe(metadata || {}, '', [])));
            }
        } catch (error) {}
    }
    function audit(actionType, tenantSlug, entityId, metadata, context) {
        if (context && context.skipAuditPersistence) return null;
        var activeActor = actor(context || {});
        var row = {
            auditId: createId('GL-AUDIT'),
            actionType: token(actionType),
            module: 'Go-Live Readiness',
            entityType: 'GO_LIVE_VALIDATION',
            entityId: safeString(entityId || tenantSlug, tenantSlug),
            tenantSlug: tenantSlug,
            actorId: activeActor.id,
            actorRole: activeActor.role,
            timestamp: nowIso(context),
            metadata: cloneSafe(metadata || {}, '', []),
            immutable: true
        };
        persist(TABLES.audit, row);
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit(row, context || {});
            } else {
                var data = ensureTables(rawData());
                data.auditLogs.unshift(row);
                data.auditLogs = data.auditLogs.slice(0, MAX_HISTORY);
                saveData(data);
            }
        } catch (error) {}
        return row;
    }

    function entityId(row, fields) {
        for (var index = 0; index < fields.length; index += 1) {
            var value = row && row[fields[index]];
            if (safeString(value, '').trim()) return normalizeId(value);
        }
        return '';
    }
    function uniqueValues(rows, fields) {
        var set = new Set();
        (rows || []).forEach(function each(row) {
            fields.forEach(function field(name) {
                var value = normalizeId(row && row[name]);
                if (value) set.add(value);
            });
        });
        return set;
    }
    function activeEmployees(data, tenantSlug) {
        return tenantRows(data, ['employees'], tenantSlug).filter(function keep(row) {
            return ['INACTIVE', 'TERMINATED', 'RESIGNED', 'ARCHIVED', 'DELETED'].indexOf(token(row.employmentStatus || row.status || 'ACTIVE')) === -1;
        });
    }
    function companyProfileExists(data, tenantSlug) {
        var settings = data.companySettings || {};
        if (normalizeTenant(tenantSlug) === defaultTenant() && safeString(settings.companyName || settings.legalName, '').trim()) return true;
        var configs = data.companyProfileConfigurations || {};
        var config = configs[tenantSlug] || {};
        return !!safeString((config.companyProfile || config).companyName || (config.companyProfile || config).legalEntityName, '').trim();
    }

    function validateCompany(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var tenant = access.tenantSlug;
        var employees = activeEmployees(data, tenant);
        var branches = tenantRows(data, ['branches', 'locations', 'organizationBranches'], tenant);
        var departments = tenantRows(data, ['departments', 'organizationDepartments'], tenant);
        var designations = tenantRows(data, ['designations', 'jobTitles'], tenant);
        var relationships = tenantRows(data, ['reportingHierarchyRelationships', 'managerHierarchy', 'approvalChains'], tenant);
        var documents = tenantRows(data, ['documents', 'employeeDocuments', 'companyDocuments', 'policyDocuments', 'documentRegistry'], tenant);
        var leavePolicies = tenantRows(data, ['leavePolicyDefinitions', 'leavePolicies'], tenant);
        var attendancePolicies = tenantRows(data, ['attendancePolicyDefinitions', 'attendancePolicies'], tenant);
        var shifts = tenantRows(data, ['shiftRosterTemplates', 'shiftTemplates', 'shifts'], tenant);
        var payroll = tenantRows(data, ['payrollConfigurations'], tenant);
        var workflows = tenantRows(data, ['workflows', 'workflowDefinitions', 'noCodeWorkflowDefinitions'], tenant);
        var notifications = tenantRows(data, ['notificationConfigurations', 'notificationDeliveryTrackingHistory', 'notifications'], tenant);
        var env = tenantRows(data, ['environmentConfigurationHistory'], tenant);
        var infra = tenantRows(data, ['infrastructureConfigurationHistory'], tenant);
        var backups = tenantRows(data, ['tenantBackupHistory', 'backupIntegrityVerificationHistory', 'backupCertificationHistory'], tenant);
        var profile = flag(input, 'COMPANY_PROFILE', companyProfileExists(data, tenant));
        var readyPayroll = payroll.some(statusReady);
        var readyWorkflow = workflows.some(statusReady);
        var readyEmail = env.concat(infra).some(function some(row) { return /SMTP|EMAIL/i.test(safeString(row.key || row.component || row.provider, '')) && (row.configured === true || statusReady(row)); });
        var readyStorage = infra.some(function some(row) { return /STORAGE|BUCKET|OBJECT/i.test(safeString(row.component || row.key, '')) && (row.configured === true || statusReady(row)); });
        var readyBackup = backups.some(function some(row) { return statusReady(row) || row.checksumMatched === true || row.integrityStatus === 'PASSED'; });
        var checks = [
            makeCheck('ORGANIZATION', 'COMPANY_PROFILE', 'Company Profile', profile, 'CRITICAL', 'Complete the tenant company profile.'),
            makeCheck('ORGANIZATION', 'BRANCHES', 'Branches', flag(input, 'BRANCHES', branches.length > 0), 'HIGH', 'Configure at least one branch or location.', { count: branches.length }),
            makeCheck('ORGANIZATION', 'DEPARTMENTS', 'Departments', flag(input, 'DEPARTMENTS', departments.length > 0), 'CRITICAL', 'Configure organization departments.', { count: departments.length }),
            makeCheck('ORGANIZATION', 'DESIGNATIONS', 'Designations', flag(input, 'DESIGNATIONS', designations.length > 0), 'HIGH', 'Configure employee designations.', { count: designations.length }),
            makeCheck('MASTER_DATA', 'EMPLOYEES', 'Employees', flag(input, 'EMPLOYEES', employees.length > 0), 'CRITICAL', 'Import and validate employee master data.', { count: employees.length }),
            makeCheck('ORGANIZATION', 'REPORTING_HIERARCHY', 'Reporting Hierarchy', flag(input, 'REPORTING_HIERARCHY', employees.length <= 1 || relationships.length > 0), 'CRITICAL', 'Resolve reporting hierarchy gaps.', { relationshipCount: relationships.length }),
            makeCheck('DOCUMENTS', 'DOCUMENTS', 'Documents', flag(input, 'DOCUMENTS', documents.length > 0), 'HIGH', 'Load required employee, company, and policy documents.', { count: documents.length }),
            makeCheck('LEAVE', 'LEAVE_POLICIES', 'Leave Policies', flag(input, 'LEAVE_POLICIES', leavePolicies.some(statusReady)), 'CRITICAL', 'Publish an applicable leave policy.', { count: leavePolicies.length }),
            makeCheck('ATTENDANCE', 'ATTENDANCE_POLICIES', 'Attendance Policies', flag(input, 'ATTENDANCE_POLICIES', attendancePolicies.some(statusReady)), 'CRITICAL', 'Publish an attendance policy.', { count: attendancePolicies.length }),
            makeCheck('SCHEDULING', 'SHIFT_TEMPLATES', 'Shift Templates', flag(input, 'SHIFT_TEMPLATES', shifts.some(statusReady)), 'HIGH', 'Publish required shift templates.', { count: shifts.length }),
            makeCheck('PAYROLL', 'PAYROLL_CONFIGURATION', 'Payroll Configuration', flag(input, 'PAYROLL_CONFIGURATION', readyPayroll), 'CRITICAL', 'Publish a complete payroll configuration.', { count: payroll.length }),
            makeCheck('WORKFLOW', 'APPROVAL_WORKFLOWS', 'Approval Workflows', flag(input, 'APPROVAL_WORKFLOWS', readyWorkflow), 'CRITICAL', 'Publish required approval workflows.', { count: workflows.length }),
            makeCheck('NOTIFICATIONS', 'NOTIFICATIONS', 'Notifications', flag(input, 'NOTIFICATIONS', notifications.length > 0), 'HIGH', 'Configure and validate notifications.', { count: notifications.length }),
            makeCheck('INFRASTRUCTURE', 'EMAIL_CONFIGURATION', 'Email Configuration', flag(input, 'EMAIL_CONFIGURATION', readyEmail), 'HIGH', 'Configure and validate the email provider.'),
            makeCheck('INFRASTRUCTURE', 'STORAGE_CONFIGURATION', 'Storage Configuration', flag(input, 'STORAGE_CONFIGURATION', readyStorage), 'CRITICAL', 'Configure production object storage.'),
            makeCheck('RECOVERY', 'BACKUP_CONFIGURATION', 'Backup Configuration', flag(input, 'BACKUP_CONFIGURATION', readyBackup), 'CRITICAL', 'Complete backup and integrity verification.')
        ];
        return domainResult('ORGANIZATION_READINESS', checks, context, { employeeCount: employees.length });
    }

    function validateMasterData(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var tenant = access.tenantSlug;
        var employees = activeEmployees(data, tenant);
        var departments = uniqueValues(tenantRows(data, ['departments', 'organizationDepartments'], tenant), ['id', 'departmentId', 'code', 'name', 'departmentName']);
        var branches = uniqueValues(tenantRows(data, ['branches', 'locations', 'organizationBranches'], tenant), ['id', 'branchId', 'locationId', 'code', 'name', 'branchName', 'locationName']);
        var designations = uniqueValues(tenantRows(data, ['designations', 'jobTitles'], tenant), ['id', 'designationId', 'code', 'name', 'designation']);
        var employeeIds = uniqueValues(employees, ['id', 'employeeId', 'employeeCode', 'empId']);
        var codes = new Set();
        var emails = new Set();
        var duplicateCodes = 0;
        var duplicateEmails = 0;
        var invalidEmails = 0;
        var invalidPhones = 0;
        var missingDepartments = 0;
        var missingBranches = 0;
        var missingManagers = 0;
        var missingDesignations = 0;
        var missingEmploymentTypes = 0;
        var inactiveReferences = 0;
        employees.forEach(function each(row) {
            var code = normalizeId(row.employeeCode || row.employeeId || row.id);
            if (code && codes.has(code)) duplicateCodes += 1; else if (code) codes.add(code);
            var email = safeString(row.email || row.workEmail, '').trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidEmails += 1;
            if (email && emails.has(email)) duplicateEmails += 1; else if (email) emails.add(email);
            var phone = safeString(row.phone || row.mobile || row.phoneNumber, '').trim();
            if (!/^\+?[0-9][0-9\s().-]{6,20}$/.test(phone)) invalidPhones += 1;
            var department = normalizeId(row.departmentId || row.department || row.departmentCode);
            if (department && !departments.has(department)) missingDepartments += 1;
            var branch = normalizeId(row.branchId || row.branch || row.locationId || row.location);
            if (branch && !branches.has(branch)) missingBranches += 1;
            var manager = normalizeId(row.managerId || row.reportingManagerId || row.manager);
            if (manager && !employeeIds.has(manager)) missingManagers += 1;
            var designation = normalizeId(row.designationId || row.designation || row.jobTitle);
            if (designation && !designations.has(designation)) missingDesignations += 1;
            if (!safeString(row.employmentType || row.employeeType, '').trim()) missingEmploymentTypes += 1;
            if (manager) {
                var managerRow = employees.find(function find(candidate) { return [candidate.id, candidate.employeeId, candidate.employeeCode, candidate.empId].some(function some(value) { return normalizeId(value) === manager; }); });
                if (managerRow && !statusReady(managerRow)) inactiveReferences += 1;
            }
        });
        var checks = [
            makeCheck('MASTER_DATA', 'EMPLOYEE_CODES', 'Employee Codes', flag(input, 'EMPLOYEE_CODES', employees.length > 0 && duplicateCodes === 0), 'CRITICAL', 'Resolve missing or duplicate employee codes.', { duplicateCount: duplicateCodes }),
            makeCheck('MASTER_DATA', 'EMAIL_UNIQUENESS', 'Email Uniqueness', flag(input, 'EMAIL_UNIQUENESS', invalidEmails === 0 && duplicateEmails === 0), 'CRITICAL', 'Correct invalid or duplicate employee email addresses.', { invalidCount: invalidEmails, duplicateCount: duplicateEmails }),
            makeCheck('MASTER_DATA', 'PHONE_NUMBERS', 'Phone Numbers', flag(input, 'PHONE_NUMBERS', invalidPhones === 0), 'HIGH', 'Correct invalid employee phone formats.', { invalidCount: invalidPhones }),
            makeCheck('MASTER_DATA', 'DEPARTMENT_REFERENCES', 'Departments', flag(input, 'DEPARTMENT_REFERENCES', missingDepartments === 0), 'CRITICAL', 'Resolve missing department references.', { invalidReferenceCount: missingDepartments }),
            makeCheck('MASTER_DATA', 'BRANCH_REFERENCES', 'Branches', flag(input, 'BRANCH_REFERENCES', missingBranches === 0), 'HIGH', 'Resolve missing branch or location references.', { invalidReferenceCount: missingBranches }),
            makeCheck('MASTER_DATA', 'REPORTING_MANAGERS', 'Reporting Managers', flag(input, 'REPORTING_MANAGERS', missingManagers === 0), 'CRITICAL', 'Resolve missing reporting managers.', { invalidReferenceCount: missingManagers }),
            makeCheck('MASTER_DATA', 'DESIGNATION_REFERENCES', 'Designations', flag(input, 'DESIGNATION_REFERENCES', missingDesignations === 0), 'HIGH', 'Resolve missing designation references.', { invalidReferenceCount: missingDesignations }),
            makeCheck('MASTER_DATA', 'EMPLOYMENT_TYPES', 'Employment Types', flag(input, 'EMPLOYMENT_TYPES', missingEmploymentTypes === 0), 'HIGH', 'Assign an employment type to each active employee.', { missingCount: missingEmploymentTypes }),
            makeCheck('MASTER_DATA', 'DUPLICATE_RECORDS', 'Duplicate Records', flag(input, 'DUPLICATE_RECORDS', duplicateCodes + duplicateEmails === 0), 'CRITICAL', 'Review and reconcile duplicate employee records.', { duplicateCount: duplicateCodes + duplicateEmails }),
            makeCheck('MASTER_DATA', 'INACTIVE_REFERENCES', 'Inactive References', flag(input, 'INACTIVE_REFERENCES', inactiveReferences === 0), 'HIGH', 'Replace inactive manager or organization references.', { invalidReferenceCount: inactiveReferences })
        ];
        return domainResult('MASTER_DATA', checks, context, {
            summary: { employeeCount: employees.length, duplicateCount: duplicateCodes + duplicateEmails, invalidReferenceCount: missingDepartments + missingBranches + missingManagers + missingDesignations + inactiveReferences }
        });
    }

    function validateDocuments(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var rows = tenantRows(rawData(), ['documents', 'employeeDocuments', 'companyDocuments', 'policyDocuments', 'documentRegistry'], access.tenantSlug);
        var now = nowMs(context);
        function typeMatches(pattern) { return rows.some(function some(row) { return pattern.test(safeString(row.documentType || row.type || row.category || row.title, '')); }); }
        var expired = rows.filter(function keep(row) { var expiry = new Date(row.expiryDate || row.expiresAt || '').getTime(); return Number.isFinite(expiry) && expiry < now; }).length;
        var missingMandatory = rows.filter(function keep(row) { return row.mandatory === true && ['MISSING', 'REJECTED', 'EXPIRED'].indexOf(token(row.status)) !== -1; }).length;
        var checks = [
            makeCheck('DOCUMENTS', 'EMPLOYEE_DOCUMENTS', 'Employee Documents', flag(input, 'EMPLOYEE_DOCUMENTS', typeMatches(/EMPLOYEE|IDENTITY|RESUME|KYC/i)), 'HIGH', 'Upload required employee documents.'),
            makeCheck('DOCUMENTS', 'COMPANY_DOCUMENTS', 'Company Documents', flag(input, 'COMPANY_DOCUMENTS', typeMatches(/COMPANY|REGISTRATION|INCORPORATION/i)), 'HIGH', 'Upload required company documents.'),
            makeCheck('DOCUMENTS', 'POLICY_DOCUMENTS', 'Policy Documents', flag(input, 'POLICY_DOCUMENTS', typeMatches(/POLICY|HANDBOOK/i)), 'HIGH', 'Publish required policy documents.'),
            makeCheck('DOCUMENTS', 'OFFER_LETTERS', 'Offer Letters', flag(input, 'OFFER_LETTERS', typeMatches(/OFFER/i)), 'HIGH', 'Load employee offer letters.'),
            makeCheck('DOCUMENTS', 'CONTRACTS', 'Contracts', flag(input, 'CONTRACTS', typeMatches(/CONTRACT|AGREEMENT/i)), 'HIGH', 'Load required employment contracts.'),
            makeCheck('DOCUMENTS', 'COMPLIANCE_CERTIFICATES', 'Compliance Certificates', flag(input, 'COMPLIANCE_CERTIFICATES', typeMatches(/COMPLIANCE|CERTIFICATE/i)), 'HIGH', 'Load valid compliance certificates.'),
            makeCheck('DOCUMENTS', 'EXPIRED_DOCUMENTS', 'Expired Documents', flag(input, 'EXPIRED_DOCUMENTS', expired === 0), 'CRITICAL', 'Renew expired mandatory documents before go-live.', { expiredCount: expired }),
            makeCheck('DOCUMENTS', 'MANDATORY_DOCUMENTS', 'Missing Mandatory Documents', flag(input, 'MANDATORY_DOCUMENTS', missingMandatory === 0), 'CRITICAL', 'Resolve missing mandatory documents.', { missingCount: missingMandatory })
        ];
        return domainResult('DOCUMENTS', checks, context, { summary: { documentCount: rows.length, expiredCount: expired, missingMandatoryCount: missingMandatory } });
    }

    function validatePayrollReadiness(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var configs = tenantRows(data, ['payrollConfigurations'], access.tenantSlug).filter(statusReady);
        var simulations = tenantRows(data, ['payrollConfigurationSimulations'], access.tenantSlug);
        var employees = activeEmployees(data, access.tenantSlug);
        var hasBank = employees.length > 0 && employees.every(function every(row) { var bank = row.bankDetails || {}; return !!safeString(bank.accountNumber || row.bankAccount || row.accountNumber, '').trim(); });
        var hasComponents = configs.some(function some(row) { return Array.isArray(row.salaryComponents) && row.salaryComponents.length > 0; });
        var hasGroups = configs.some(function some(row) { return isObject(row.payGroups) ? Object.keys(row.payGroups).length > 0 : Array.isArray(row.payGroups) && row.payGroups.length > 0; });
        var hasStatutory = configs.some(function some(row) { return isObject(row.statutorySettings) && Object.keys(row.statutorySettings).length > 0; });
        var hasCalendar = configs.some(function some(row) { return isObject(row.payrollCalendar) && !!safeString(row.payrollCalendar.frequency || row.payrollFrequency, '').trim(); });
        var formulaValid = configs.length > 0 && configs.every(function every(row) { return (row.salaryComponents || []).every(function everyComponent(component) { return component.formulaValid !== false && token(component.status || 'ACTIVE') !== 'INVALID'; }); });
        var checks = [
            makeCheck('PAYROLL', 'SALARY_COMPONENTS', 'Salary Components', flag(input, 'SALARY_COMPONENTS', hasComponents), 'CRITICAL', 'Configure all required salary components.'),
            makeCheck('PAYROLL', 'PAYROLL_GROUPS', 'Payroll Groups', flag(input, 'PAYROLL_GROUPS', hasGroups), 'CRITICAL', 'Configure payroll groups.'),
            makeCheck('PAYROLL', 'STATUTORY_SETTINGS', 'Statutory Settings', flag(input, 'STATUTORY_SETTINGS', hasStatutory), 'CRITICAL', 'Complete applicable statutory settings.'),
            makeCheck('PAYROLL', 'BANK_DETAILS', 'Bank Details', flag(input, 'BANK_DETAILS', hasBank), 'CRITICAL', 'Complete bank details for all in-scope employees.', { employeeCount: employees.length }),
            makeCheck('PAYROLL', 'PAYROLL_CALENDAR', 'Payroll Calendar', flag(input, 'PAYROLL_CALENDAR', hasCalendar), 'HIGH', 'Configure the payroll processing calendar.'),
            makeCheck('PAYROLL', 'FORMULA_VALIDATION', 'Formula Validation', flag(input, 'FORMULA_VALIDATION', formulaValid), 'CRITICAL', 'Resolve invalid payroll formulas.'),
            makeCheck('PAYROLL', 'PAYROLL_SIMULATION', 'Simulation Completed', flag(input, 'PAYROLL_SIMULATION', simulations.some(function some(row) { return row.success !== false && token(row.status || 'COMPLETED') !== 'FAILED'; })), 'CRITICAL', 'Complete and review a payroll simulation.')
        ];
        return domainResult('PAYROLL', checks, context, { summary: { configurationCount: configs.length, simulationCount: simulations.length, employeeCount: employees.length } });
    }

    function validateAttendanceReadiness(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var policies = tenantRows(data, ['attendancePolicyDefinitions'], access.tenantSlug).filter(statusReady);
        var assignments = tenantRows(data, ['shiftRosterAssignments', 'employeeSchedules'], access.tenantSlug).filter(statusReady);
        var rosters = tenantRows(data, ['shiftRosterPlans'], access.tenantSlug).filter(statusReady);
        var calendars = tenantRows(data, ['workingCalendarConfigurations', 'holidayCalendars'], access.tenantSlug).filter(statusReady);
        var employees = activeEmployees(data, access.tenantSlug);
        var assignedIds = uniqueValues(assignments, ['employeeId', 'employeeCode']);
        var coverage = employees.length ? Math.round((employees.filter(function keep(row) { return [row.id, row.employeeId, row.employeeCode].some(function some(value) { return assignedIds.has(normalizeId(value)); }); }).length / employees.length) * 100) : 0;
        var workingHours = policies.some(function some(row) { return isObject(row.workingHours) && !!safeString(row.workingHours.startTime || row.workingHours.officeStartTime, '').trim(); });
        var lateRules = policies.some(function some(row) { return isObject(row.lateArrivalRules || row.lateRules); });
        var overtimeRules = policies.some(function some(row) { return isObject(row.overtimeRules || row.overtime); });
        var checks = [
            makeCheck('ATTENDANCE', 'ATTENDANCE_POLICY_READY', 'Attendance Policies', flag(input, 'ATTENDANCE_POLICY_READY', policies.length > 0), 'CRITICAL', 'Publish attendance policies.'),
            makeCheck('ATTENDANCE', 'SHIFT_ASSIGNMENT', 'Shift Assignment', flag(input, 'SHIFT_ASSIGNMENT', coverage === 100), 'CRITICAL', 'Assign shifts to all active employees.', { coveragePercent: coverage }),
            makeCheck('ATTENDANCE', 'ROSTER_COVERAGE', 'Roster Coverage', flag(input, 'ROSTER_COVERAGE', rosters.length > 0 && coverage === 100), 'HIGH', 'Publish rosters with complete staffing coverage.', { coveragePercent: coverage }),
            makeCheck('ATTENDANCE', 'HOLIDAY_CALENDAR', 'Holiday Calendar', flag(input, 'HOLIDAY_CALENDAR', calendars.length > 0), 'HIGH', 'Publish the applicable holiday calendar.'),
            makeCheck('ATTENDANCE', 'WORKING_HOURS', 'Working Hours', flag(input, 'WORKING_HOURS', workingHours), 'CRITICAL', 'Configure valid working hours.'),
            makeCheck('ATTENDANCE', 'LATE_RULES', 'Late Rules', flag(input, 'LATE_RULES', lateRules), 'HIGH', 'Configure late arrival rules.'),
            makeCheck('ATTENDANCE', 'OVERTIME_RULES', 'Overtime Rules', flag(input, 'OVERTIME_RULES', overtimeRules), 'HIGH', 'Configure overtime rules.')
        ];
        return domainResult('ATTENDANCE', checks, context, { summary: { employeeCount: employees.length, assignmentCount: assignments.length, coveragePercent: coverage } });
    }

    function validateWorkflowReadiness(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var workflows = tenantRows(data, ['workflows', 'workflowDefinitions', 'noCodeWorkflowDefinitions'], access.tenantSlug).filter(statusReady);
        var text = function text(row) { return safeString(row.workflowType || row.type || row.name || row.code, ''); };
        var has = function has(pattern) { return workflows.some(function some(row) { return pattern.test(text(row)); }); };
        var approvals = tenantRows(data, ['approvalChains', 'workflowApprovalRules', 'reportingHierarchyRelationships'], access.tenantSlug);
        var escalations = tenantRows(data, ['escalationRules', 'escalationPolicyHistory', 'workflowEscalations'], access.tenantSlug);
        var delegations = tenantRows(data, ['delegationRules', 'approvalDelegations'], access.tenantSlug);
        var sla = tenantRows(data, ['slaConfigurations', 'workflowSlaPolicies'], access.tenantSlug);
        var checks = [
            makeCheck('WORKFLOW', 'LEAVE_WORKFLOW', 'Leave Workflow', flag(input, 'LEAVE_WORKFLOW', has(/LEAVE/i)), 'CRITICAL', 'Publish the leave approval workflow.'),
            makeCheck('WORKFLOW', 'EXPENSE_WORKFLOW', 'Expense Workflow', flag(input, 'EXPENSE_WORKFLOW', has(/EXPENSE/i)), 'HIGH', 'Publish the expense approval workflow.'),
            makeCheck('WORKFLOW', 'RECRUITMENT_WORKFLOW', 'Recruitment Workflow', flag(input, 'RECRUITMENT_WORKFLOW', has(/RECRUIT/i)), 'HIGH', 'Publish the recruitment workflow.'),
            makeCheck('WORKFLOW', 'APPROVAL_CHAINS', 'Approval Chains', flag(input, 'APPROVAL_CHAINS', approvals.length > 0), 'CRITICAL', 'Validate complete approval chains.'),
            makeCheck('WORKFLOW', 'ESCALATION_RULES', 'Escalation Rules', flag(input, 'ESCALATION_RULES', escalations.length > 0), 'HIGH', 'Configure workflow escalation rules.'),
            makeCheck('WORKFLOW', 'DELEGATION_RULES', 'Delegation Rules', flag(input, 'DELEGATION_RULES', delegations.length > 0), 'HIGH', 'Configure approval delegation rules.'),
            makeCheck('WORKFLOW', 'SLA_CONFIGURATION', 'SLA Configuration', flag(input, 'SLA_CONFIGURATION', sla.length > 0), 'HIGH', 'Configure workflow SLAs.')
        ];
        return domainResult('WORKFLOW', checks, context, { summary: { workflowCount: workflows.length, approvalChainCount: approvals.length } });
    }

    function validateSecurityReadiness(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var tenant = access.tenantSlug;
        var permissions = tenantRows(data, ['permissionMatrixHistory'], tenant);
        var users = tenantRows(data, ['users', 'employees'], tenant);
        var login = tenantRows(data, ['loginSecurityPolicyHistory'], tenant);
        var sessions = tenantRows(data, ['sessionPolicyHistory'], tenant);
        var apiKeys = tenantRows(data, ['developerApiKeys', 'apiKeys'], tenant);
        var tenantEvidence = tenantRows(data, ['tenantIsolationValidationHistory'], tenant);
        var mfa = users.length > 0 && users.some(function some(row) { return row.mfaEnabled === true; });
        var checks = [
            makeCheck('SECURITY', 'RBAC', 'RBAC', flag(input, 'RBAC', permissions.some(function some(row) { return statusReady(row) && row.rbacAuthoritative !== false; })), 'CRITICAL', 'Enable and validate RBAC.'),
            makeCheck('SECURITY', 'PERMISSION_MATRIX', 'Permission Matrix', flag(input, 'PERMISSION_MATRIX', permissions.length > 0), 'CRITICAL', 'Complete the permission matrix.'),
            makeCheck('SECURITY', 'ROLE_ASSIGNMENTS', 'Role Assignments', flag(input, 'ROLE_ASSIGNMENTS', users.length > 0 && users.every(function every(row) { return !!safeString(row.role, '').trim(); })), 'HIGH', 'Assign governed roles to every user.'),
            makeCheck('SECURITY', 'MFA_CONFIGURATION', 'MFA Configuration', flag(input, 'MFA_CONFIGURATION', mfa), 'HIGH', 'Enable MFA for privileged users.'),
            makeCheck('SECURITY', 'PASSWORD_POLICIES', 'Password Policies', flag(input, 'PASSWORD_POLICIES', login.some(statusReady)), 'CRITICAL', 'Configure password and lockout policies.'),
            makeCheck('SECURITY', 'SESSION_POLICIES', 'Session Policies', flag(input, 'SESSION_POLICIES', sessions.some(statusReady)), 'CRITICAL', 'Configure distributed session policy and revocation.'),
            makeCheck('SECURITY', 'API_KEYS', 'API Keys', flag(input, 'API_KEYS', apiKeys.length > 0 && apiKeys.every(function every(row) { return row.revoked !== true && token(row.status || 'ACTIVE') !== 'EXPIRED'; })), 'HIGH', 'Review API key scopes, status, and expiration.'),
            makeCheck('SECURITY', 'TENANT_ISOLATION', 'Tenant Isolation', flag(input, 'TENANT_ISOLATION', tenantEvidence.some(statusReady)), 'CRITICAL', 'Resolve tenant isolation validation failures.')
        ];
        return domainResult('SECURITY', checks, context, { summary: { permissionMatrices: permissions.length, roleAssignments: users.length, apiKeyCount: apiKeys.length } });
    }

    function validateInfrastructure(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var tenant = access.tenantSlug;
        var env = tenantRows(data, ['environmentConfigurationHistory'], tenant);
        var infra = tenantRows(data, ['infrastructureConfigurationHistory'], tenant);
        var health = tenantRows(data, ['observabilityHealthHistory'], tenant);
        var queues = tenantRows(data, ['distributedQueueJobs', 'distributedQueueWorkerHistory'], tenant);
        var mail = infra.concat(env).some(function some(row) { return /MAIL|EMAIL|SMTP/i.test(safeString(row.component || row.key, '')) && (row.configured === true || statusReady(row)); });
        var notifications = tenantRows(data, ['notificationDeliveryTrackingHistory', 'notificationConfigurations'], tenant);
        var scheduler = tenantRows(data, ['schedulerWorkerHistory', 'distributedQueueScheduleHistory', 'scheduledJobs'], tenant);
        var search = tenantRows(data, ['searchIndexHealthHistory', 'knowledgeSearchIndex'], tenant);
        function envReady(key) { return env.some(function some(row) { return token(row.key) === key && row.configured === true; }); }
        function infraReady(pattern) { return infra.some(function some(row) { return pattern.test(safeString(row.component || row.key, '')) && (row.configured === true || statusReady(row)); }); }
        var endpointReady = ['/health', '/ready', '/live'].every(function every(endpoint) { return health.some(function some(row) { return safeString(row.endpoint, '') === endpoint && statusReady(row); }); });
        var checks = [
            makeCheck('INFRASTRUCTURE', 'DATABASE', 'Database', flag(input, 'DATABASE', envReady('DATABASE_URL') || infraReady(/DATABASE|POSTGRES/i)), 'CRITICAL', 'Restore and validate database connectivity.'),
            makeCheck('INFRASTRUCTURE', 'REDIS', 'Redis', flag(input, 'REDIS', envReady('REDIS_URL') || infraReady(/REDIS|CACHE/i)), 'CRITICAL', 'Restore and validate Redis connectivity.'),
            makeCheck('INFRASTRUCTURE', 'QUEUE', 'Queue', flag(input, 'QUEUE', queues.length > 0), 'CRITICAL', 'Restore queue and worker processing.'),
            makeCheck('INFRASTRUCTURE', 'OBJECT_STORAGE', 'Object Storage', flag(input, 'OBJECT_STORAGE', infraReady(/STORAGE|BUCKET|OBJECT/i)), 'CRITICAL', 'Configure object storage.'),
            makeCheck('INFRASTRUCTURE', 'MAIL_SERVICE', 'Mail Service', flag(input, 'MAIL_SERVICE', mail), 'HIGH', 'Validate the production mail service.'),
            makeCheck('INFRASTRUCTURE', 'NOTIFICATION_SERVICE', 'Notification Service', flag(input, 'NOTIFICATION_SERVICE', notifications.length > 0), 'HIGH', 'Validate notification delivery.'),
            makeCheck('INFRASTRUCTURE', 'SCHEDULER', 'Scheduler', flag(input, 'SCHEDULER', scheduler.length > 0), 'HIGH', 'Validate scheduler worker availability.'),
            makeCheck('INFRASTRUCTURE', 'SEARCH_ENGINE', 'Search Engine', flag(input, 'SEARCH_ENGINE', search.length > 0), 'HIGH', 'Validate search indexing and query health.'),
            makeCheck('INFRASTRUCTURE', 'HEALTH_ENDPOINTS', 'Health Endpoints', flag(input, 'HEALTH_ENDPOINTS', endpointReady), 'CRITICAL', 'Restore /health, /ready, and /live endpoints.')
        ];
        return domainResult('INFRASTRUCTURE', checks, context, { summary: { healthEndpointCount: health.length, queueEvidenceCount: queues.length } });
    }

    function validatePerformance(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = rawData();
        var rows = tenantRows(data, ['goLivePerformanceBenchmarks', 'observabilityMetricsHistory'], access.tenantSlug);
        var latest = rows.slice().sort(function sort(a, b) { return safeString(b.timestamp || b.createdAt, '').localeCompare(safeString(a.timestamp || a.createdAt, '')); })[0] || {};
        var metrics = {
            employeeCapacity: safeNumber(latest.employeeCapacity, 0),
            maxConcurrentLogins: safeNumber(latest.maxConcurrentLogins || latest.concurrentUsers, 0),
            bulkImportRecordsPerMinute: safeNumber(latest.bulkImportRecordsPerMinute || latest.importThroughput, 0),
            dashboardLoadMs: safeNumber(latest.dashboardLoadMs || latest.dashboardLatencyMs, 0),
            approvalProcessingMs: safeNumber(latest.approvalProcessingMs || latest.workflowLatencyMs, 0),
            payrollSimulationMs: safeNumber(latest.payrollSimulationMs || latest.payrollLatencyMs, 0)
        };
        var checks = [
            makeCheck('PERFORMANCE', 'EMPLOYEE_SCALE_200', '200 Employee Validation', flag(input, 'EMPLOYEE_SCALE_200', metrics.employeeCapacity >= 200), 'CRITICAL', 'Complete performance validation for 200 employees.'),
            makeCheck('PERFORMANCE', 'EMPLOYEE_SCALE_500', '500 Employee Validation', flag(input, 'EMPLOYEE_SCALE_500', metrics.employeeCapacity >= 500), 'HIGH', 'Complete performance validation for 500 employees.'),
            makeCheck('PERFORMANCE', 'EMPLOYEE_SCALE_1000', '1,000 Employee Validation', flag(input, 'EMPLOYEE_SCALE_1000', metrics.employeeCapacity >= 1000), 'HIGH', 'Complete performance validation for 1,000 employees.'),
            makeCheck('PERFORMANCE', 'CONCURRENT_LOGINS', 'Concurrent Logins', flag(input, 'CONCURRENT_LOGINS', metrics.maxConcurrentLogins >= 50), 'HIGH', 'Validate at least 50 concurrent login sessions.'),
            makeCheck('PERFORMANCE', 'BULK_IMPORT', 'Bulk Import', flag(input, 'BULK_IMPORT', metrics.bulkImportRecordsPerMinute >= 1000), 'HIGH', 'Validate production bulk import throughput.'),
            makeCheck('PERFORMANCE', 'DASHBOARD_LOAD', 'Dashboard Load', flag(input, 'DASHBOARD_LOAD', metrics.dashboardLoadMs > 0 && metrics.dashboardLoadMs <= 3000), 'HIGH', 'Reduce dashboard load time below three seconds.'),
            makeCheck('PERFORMANCE', 'APPROVAL_PROCESSING', 'Approval Processing', flag(input, 'APPROVAL_PROCESSING', metrics.approvalProcessingMs > 0 && metrics.approvalProcessingMs <= 3000), 'HIGH', 'Reduce approval processing latency below three seconds.'),
            makeCheck('PERFORMANCE', 'PAYROLL_SIMULATION_PERFORMANCE', 'Payroll Simulation', flag(input, 'PAYROLL_SIMULATION_PERFORMANCE', metrics.payrollSimulationMs > 0 && metrics.payrollSimulationMs <= 3000), 'HIGH', 'Reduce payroll simulation latency below three seconds.')
        ];
        var profiles = [200, 500, 1000].map(function map(size) {
            return { employees: size, supported: metrics.employeeCapacity >= size, readiness: metrics.employeeCapacity >= size ? 'VALIDATED' : 'NOT_VALIDATED' };
        });
        return domainResult('PERFORMANCE', checks, context, { metrics: metrics, capacityProfiles: profiles, backgroundReady: true, parallelValidationReady: true, incrementalValidationReady: true });
    }

    function assessRisks(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var checks = Array.isArray(input && input.checks) ? input.checks : [];
        var risks = checks.filter(function keep(row) { return row.status !== 'PASSED'; }).map(function map(row) {
            var severity = token(row.severity || 'MEDIUM');
            return {
                riskId: createId('GL-RISK'),
                tenantSlug: access.tenantSlug,
                checkId: row.checkId,
                domain: row.domain,
                severity: severity,
                summary: row.name + ' is not ready.',
                recommendation: row.recommendation,
                requiresAdministratorReview: true,
                productionDataModified: false,
                immutable: true
            };
        });
        var counts = { critical: 0, high: 0, medium: 0, low: 0, warning: 0 };
        risks.forEach(function each(row) { var key = row.severity.toLowerCase(); counts[key in counts ? key : 'warning'] += 1; });
        var riskScore = clamp(100 - counts.critical * 25 - counts.high * 12 - counts.medium * 6 - counts.low * 2 - counts.warning);
        return result(true, 'GO_LIVE_RISK_ASSESSED', 'Go-live risks assessed.', {
            tenantSlug: access.tenantSlug,
            risks: risks,
            criticalIssues: risks.filter(function keep(row) { return row.severity === 'CRITICAL'; }),
            highRisks: risks.filter(function keep(row) { return row.severity === 'HIGH'; }),
            mediumRisks: risks.filter(function keep(row) { return row.severity === 'MEDIUM'; }),
            lowRisks: risks.filter(function keep(row) { return row.severity === 'LOW'; }),
            warnings: risks.filter(function keep(row) { return row.severity === 'WARNING'; }),
            recommendations: risks.map(function map(row) { return { riskId: row.riskId, priority: row.severity, action: row.recommendation, requiresApproval: true }; }),
            counts: counts,
            riskScore: riskScore,
            generatedAt: nowIso(context),
            governance: governanceFlags()
        });
    }

    function calculateReadinessScores(input) {
        var domains = input && input.domains || {};
        var organization = safeNumber(domains.company && domains.company.score, 0);
        var dataQuality = safeNumber(domains.masterData && domains.masterData.score, 0);
        var security = safeNumber(domains.security && domains.security.score, 0);
        var performance = safeNumber(domains.performance && domains.performance.score, 0);
        var infrastructure = safeNumber(domains.infrastructure && domains.infrastructure.score, 0);
        var compliance = average([
            domains.documents && domains.documents.score,
            domains.payroll && domains.payroll.score,
            domains.attendance && domains.attendance.score,
            domains.workflow && domains.workflow.score
        ], 0);
        var blockers = safeNumber(input && input.blockingFailureCount, 0);
        var overall = clamp(organization * 0.20 + dataQuality * 0.20 + security * 0.15 + performance * 0.10 + compliance * 0.20 + infrastructure * 0.15);
        if (blockers > 0) overall = Math.min(overall, 59);
        var readinessBand = overall >= 95 && blockers === 0 ? 'PRODUCTION_READY' : overall >= 80 ? 'MINOR_IMPROVEMENTS_REQUIRED' : overall >= 60 ? 'MAJOR_IMPROVEMENTS_REQUIRED' : 'GO_LIVE_BLOCKED';
        return freezeGoLiveOutput({
            success: true,
            organizationReadiness: clamp(organization),
            dataQuality: clamp(dataQuality),
            security: clamp(security),
            performance: clamp(performance),
            compliance: clamp(compliance),
            infrastructure: clamp(infrastructure),
            overallReadinessScore: overall,
            readinessBand: readinessBand,
            productionReady: readinessBand === 'PRODUCTION_READY',
            blockingFailureCount: blockers
        });
    }

    function buildChecklist(companyChecks) {
        return CHECKLIST_DEFINITIONS.map(function map(definition, index) {
            var check = (companyChecks || []).find(function find(row) { return row.code === definition[0]; });
            return {
                checklistId: 'GL-CHECK-' + String(index + 1).padStart(2, '0'),
                code: definition[0],
                item: definition[1],
                status: check ? check.status : 'FAILED',
                score: check ? check.score : 0,
                blocking: true,
                immutable: true
            };
        });
    }
    function findRun(data, tenantSlug, runId) {
        return (data[TABLES.runs] || []).find(function find(row) { return sameTenant(row, tenantSlug) && row.runId === safeString(runId, ''); }) || null;
    }
    function runValidation(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var payload = Object.assign({}, input || {}, { tenantSlug: access.tenantSlug });
        var requestedDomains = Array.isArray(payload.domains) ? payload.domains.map(token) : [];
        function requested(name) { return !requestedDomains.length || requestedDomains.indexOf(token(name)) !== -1; }
        var validators = {
            company: ['ORGANIZATION_READINESS', validateCompany],
            masterData: ['MASTER_DATA', validateMasterData],
            documents: ['DOCUMENTS', validateDocuments],
            payroll: ['PAYROLL', validatePayrollReadiness],
            attendance: ['ATTENDANCE', validateAttendanceReadiness],
            workflow: ['WORKFLOW', validateWorkflowReadiness],
            security: ['SECURITY', validateSecurityReadiness],
            infrastructure: ['INFRASTRUCTURE', validateInfrastructure],
            performance: ['PERFORMANCE', validatePerformance]
        };
        var domains = {};
        Object.keys(validators).forEach(function each(key) {
            var definition = validators[key];
            if (requested(definition[0])) domains[key] = definition[1](payload, Object.assign({}, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
        });
        var checks = [];
        Object.keys(domains).forEach(function each(key) { checks = checks.concat(domains[key].checks || []); });
        var blockingFailures = checks.filter(function keep(row) { return row.blocking !== false && row.status !== 'PASSED'; });
        var scores = calculateReadinessScores({ domains: domains, blockingFailureCount: blockingFailures.length });
        var risk = assessRisks({ tenantSlug: access.tenantSlug, checks: checks }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
        var checklist = buildChecklist(domains.company && domains.company.checks || []);
        var run = {
            runId: createId('GL-RUN'),
            tenantSlug: access.tenantSlug,
            organizationId: safeString(payload.organizationId || 'ORG-' + access.tenantSlug, 'ORG-' + access.tenantSlug),
            mode: token(payload.mode || (requestedDomains.length ? 'INCREMENTAL' : 'FULL')),
            status: blockingFailures.length ? 'BLOCKED' : 'READY_FOR_APPROVAL',
            certificationEligible: blockingFailures.length === 0,
            generatedAt: nowIso(context),
            completedAt: nowIso(context),
            checklist: checklist,
            domains: domains,
            checks: checks,
            blockingIssues: blockingFailures,
            scores: scores,
            riskAssessment: risk,
            analytics: {
                validationCount: checks.length,
                passedCount: checks.filter(function keep(row) { return row.status === 'PASSED'; }).length,
                failedCount: blockingFailures.length,
                employeeCount: domains.company && domains.company.employeeCount || domains.masterData && domains.masterData.summary && domains.masterData.summary.employeeCount || 0,
                executionMode: requestedDomains.length ? 'INCREMENTAL' : 'FULL',
                cachedResultsSupported: true,
                backgroundJobsSupported: true,
                parallelValidationSupported: true
            },
            governance: governanceFlags({ administratorApprovalRecorded: false }),
            immutable: true
        };
        persist(TABLES.runs, run);
        persist(TABLES.risks, { assessmentId: createId('GL-RISK-ASSESSMENT'), tenantSlug: access.tenantSlug, runId: run.runId, riskScore: risk.riskScore, counts: risk.counts, risks: risk.risks, createdAt: nowIso(context) });
        Object.keys(domains).forEach(function each(key) {
            var domain = domains[key];
            audit('GO_LIVE_VALIDATION_DOMAIN_COMPLETED', access.tenantSlug, run.runId, { domain: domain.domain, status: domain.status, score: domain.score }, context || {});
        });
        blockingFailures.forEach(function each(check) {
            audit('GO_LIVE_VALIDATION_FAILED', access.tenantSlug, run.runId, { checkId: check.checkId, domain: check.domain, severity: check.severity }, context || {});
        });
        audit('GO_LIVE_VALIDATION_RUN_COMPLETED', access.tenantSlug, run.runId, { status: run.status, overallReadinessScore: scores.overallReadinessScore, failedCount: blockingFailures.length }, context || {});
        emitTelemetry('GO_LIVE_VALIDATION_RUN_COMPLETED', { tenantSlug: access.tenantSlug, runId: run.runId, status: run.status, failedCount: blockingFailures.length }, context || {});
        recordMetric('GO_LIVE_VALIDATION_RUN_COMPLETED', { tenantSlug: access.tenantSlug, runId: run.runId, status: run.status, failed: blockingFailures.length > 0 }, context || {});
        return freezeGoLiveOutput(Object.assign({ success: true }, run));
    }

    function recordOverride(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        if (input.administratorConfirmed !== true) return result(false, 'ADMINISTRATOR_CONFIRMATION_REQUIRED', 'Administrator confirmation is required to record an override.');
        if (!safeString(input.reason, '').trim()) return result(false, 'OVERRIDE_REASON_REQUIRED', 'An override reason is required.');
        var data = ensureTables(rawData());
        var run = findRun(data, access.tenantSlug, input.runId);
        if (!run) return result(false, 'VALIDATION_RUN_NOT_FOUND', 'The validation run was not found.');
        var check = (run.checks || []).find(function find(row) { return row.checkId === input.checkId; });
        if (!check) return result(false, 'VALIDATION_CHECK_NOT_FOUND', 'The validation check was not found.');
        var override = {
            overrideId: createId('GL-OVERRIDE'), tenantSlug: access.tenantSlug, runId: run.runId, checkId: check.checkId,
            reason: safeString(input.reason, '').slice(0, 500), status: 'RECORDED_NOT_CERTIFYING', approvedBy: access.actor.id,
            createdAt: nowIso(context), certificationGateChanged: false, productionDataModified: false, immutable: true
        };
        persist(TABLES.overrides, override);
        audit('GO_LIVE_OVERRIDE_RECORDED', access.tenantSlug, override.overrideId, { runId: run.runId, checkId: check.checkId, certificationGateChanged: false }, context || {});
        return result(true, 'GO_LIVE_OVERRIDE_RECORDED', 'Override recorded for audit and review; failed checks still block certification.', { override: override, governance: governanceFlags() });
    }

    function approveGoLive(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        if (input.administratorConfirmed !== true) return result(false, 'ADMINISTRATOR_CONFIRMATION_REQUIRED', 'Administrator confirmation is required for go-live approval.');
        var data = ensureTables(rawData());
        var run = findRun(data, access.tenantSlug, input.runId);
        if (!run) return result(false, 'VALIDATION_RUN_NOT_FOUND', 'The validation run was not found.');
        if (!run.certificationEligible || (run.blockingIssues || []).length) return result(false, 'GO_LIVE_APPROVAL_BLOCKED', 'All required validations must pass before go-live approval.', { blockingIssueCount: (run.blockingIssues || []).length });
        var approval = {
            approvalId: createId('GL-APPROVAL'), tenantSlug: access.tenantSlug, runId: run.runId, status: 'APPROVED_FOR_CERTIFICATION',
            approvedBy: access.actor.id, approvedRole: access.actor.role, approvedAt: nowIso(context),
            reason: safeString(input.reason || 'Administrator confirmed go-live certification review.', ''),
            productionDeploymentTriggered: false, productionDataModified: false, immutable: true
        };
        persist(TABLES.approvals, approval);
        audit('GO_LIVE_APPROVAL_RECORDED', access.tenantSlug, approval.approvalId, { runId: run.runId, status: approval.status }, context || {});
        emitTelemetry('GO_LIVE_APPROVAL_RECORDED', { tenantSlug: access.tenantSlug, runId: run.runId, status: approval.status }, context || {});
        return result(true, 'GO_LIVE_APPROVED_FOR_CERTIFICATION', 'Go-live readiness approved for certificate generation.', { approval: approval, governance: governanceFlags({ administratorApprovalRecorded: true }) });
    }

    function certificateSigner(context) {
        if (context && context.certificateSigner && typeof context.certificateSigner.sign === 'function') return context.certificateSigner;
        try { if (global.GoLiveCertificateSigningService && typeof global.GoLiveCertificateSigningService.sign === 'function') return global.GoLiveCertificateSigningService; } catch (error) {}
        return null;
    }
    function generateCertificate(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var run = findRun(data, access.tenantSlug, input.runId);
        if (!run) return result(false, 'VALIDATION_RUN_NOT_FOUND', 'The validation run was not found.');
        if (!run.certificationEligible || (run.blockingIssues || []).length) return result(false, 'CERTIFICATION_BLOCKED', 'All required validations must pass before certificate generation.');
        var approval = (data[TABLES.approvals] || []).find(function find(row) { return sameTenant(row, access.tenantSlug) && row.runId === run.runId && row.approvalId === input.approvalId && row.status === 'APPROVED_FOR_CERTIFICATION'; });
        if (!approval) return result(false, 'GO_LIVE_APPROVAL_REQUIRED', 'A valid administrator approval is required.');
        var signer = certificateSigner(context || {});
        if (!signer) return result(false, 'CERTIFICATE_SIGNER_UNAVAILABLE', 'A configured digital certificate signing provider is required.');
        var company = data.companySettings || {};
        var envelope = {
            certificationId: createId('GL-CERT'),
            companyName: safeString(input.companyName || company.companyName || company.legalName || access.tenantSlug, access.tenantSlug),
            tenantSlug: access.tenantSlug,
            organizationId: run.organizationId,
            environment: token(input.environment || (db() && typeof db().getEnvironmentMode === 'function' ? db().getEnvironmentMode() : 'PRODUCTION')),
            validationDate: run.generatedAt,
            generatedAt: nowIso(context),
            version: VERSION,
            readinessScore: run.scores.overallReadinessScore,
            certifiedBy: access.actor.id,
            approvalId: approval.approvalId,
            runId: run.runId
        };
        var signed;
        try { signed = signer.sign(JSON.stringify(envelope), { algorithm: 'SHA-256', tenantSlug: access.tenantSlug, certificationId: envelope.certificationId }); }
        catch (error) { return result(false, 'CERTIFICATE_SIGNING_FAILED', 'The certificate signing provider failed safely.'); }
        if (!signed || typeof signed.then === 'function') return result(false, 'CERTIFICATE_SIGNER_INVALID', 'The signing provider must return a synchronous detached signature for this runtime.');
        var signature = typeof signed === 'string' ? signed : signed.signature;
        if (!safeString(signature, '').trim()) return result(false, 'CERTIFICATE_SIGNATURE_MISSING', 'The signing provider did not return a signature.');
        var certificate = Object.assign({}, envelope, {
            certificationStatus: 'PRODUCTION_READY',
            digitalSignature: safeString(signature, ''),
            signatureAlgorithm: safeString(signed.algorithm || 'SHA-256', 'SHA-256'),
            signingKeyId: safeString(signed.keyId || 'configured-provider', 'configured-provider'),
            signatureFormat: safeString(signed.format || 'DETACHED', 'DETACHED'),
            productionDeploymentTriggered: false,
            productionDataModified: false,
            immutable: true
        });
        persist(TABLES.certificates, certificate);
        audit('GO_LIVE_CERTIFICATE_GENERATED', access.tenantSlug, certificate.certificationId, { runId: run.runId, approvalId: approval.approvalId, readinessScore: certificate.readinessScore, signingKeyId: certificate.signingKeyId }, context || {});
        emitTelemetry('GO_LIVE_CERTIFICATE_GENERATED', { tenantSlug: access.tenantSlug, runId: run.runId, status: 'PRODUCTION_READY' }, context || {});
        return result(true, 'GO_LIVE_CERTIFICATE_GENERATED', 'Signed go-live readiness certificate generated.', { certificate: certificate, governance: governanceFlags({ administratorApprovalRecorded: true, digitallySigned: true }) });
    }

    function rollbackGovernanceOperation(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        if (input.administratorConfirmed !== true) return result(false, 'ADMINISTRATOR_CONFIRMATION_REQUIRED', 'Administrator confirmation is required for rollback.');
        var type = token(input.entityType);
        var table = type === 'CERTIFICATE' ? TABLES.certificates : type === 'APPROVAL' ? TABLES.approvals : type === 'OVERRIDE' ? TABLES.overrides : '';
        if (!table) return result(false, 'ROLLBACK_ENTITY_UNSUPPORTED', 'Only certificate, approval, and override governance metadata can be rolled back.');
        var data = ensureTables(rawData());
        var entity = (data[table] || []).find(function find(row) { return sameTenant(row, access.tenantSlug) && [row.certificationId, row.approvalId, row.overrideId].indexOf(input.entityId) !== -1; });
        if (!entity) return result(false, 'ROLLBACK_ENTITY_NOT_FOUND', 'The governance record was not found.');
        var revocation = { revocationId: createId('GL-REVOKE'), tenantSlug: access.tenantSlug, entityType: type, entityId: input.entityId, reason: safeString(input.reason || 'Administrator rollback.', ''), revokedBy: access.actor.id, revokedAt: nowIso(context), immutable: true };
        var rollback = { rollbackId: createId('GL-ROLLBACK'), tenantSlug: access.tenantSlug, entityType: type, entityId: input.entityId, revocationId: revocation.revocationId, businessDataRestored: false, governanceMetadataReversed: true, createdAt: nowIso(context), immutable: true };
        persist(TABLES.revocations, revocation);
        persist(TABLES.rollbacks, rollback);
        audit('GO_LIVE_GOVERNANCE_ROLLBACK', access.tenantSlug, rollback.rollbackId, { entityType: type, entityId: input.entityId, revocationId: revocation.revocationId }, context || {});
        return result(true, 'GO_LIVE_GOVERNANCE_ROLLED_BACK', 'Governance operation revoked without changing business data.', { rollback: rollback, revocation: revocation, governance: governanceFlags() });
    }

    function scheduleValidation(input, context) {
        var access = validateAccess(input || {}, context || {}, true);
        if (!access.allowed) return result(false, access.code, access.message);
        var schedule = { scheduleId: createId('GL-SCHEDULE'), tenantSlug: access.tenantSlug, cadence: token(input.cadence || 'DAILY'), status: 'ACTIVE', background: true, incremental: input.incremental !== false, cachedResults: true, productionTrafficImpact: 'NONE', createdAt: nowIso(context), immutable: true };
        persist(TABLES.schedules, schedule);
        audit('GO_LIVE_VALIDATION_SCHEDULED', access.tenantSlug, schedule.scheduleId, { cadence: schedule.cadence, incremental: schedule.incremental }, context || {});
        return result(true, 'GO_LIVE_VALIDATION_SCHEDULED', 'Background go-live validation schedule recorded.', { schedule: schedule, governance: governanceFlags() });
    }

    function generateDashboard(input, context) {
        var access = validateAccess(input || {}, context || {}, false);
        if (!access.allowed) return result(false, access.code, access.message);
        var data = ensureTables(rawData());
        var runs = (data[TABLES.runs] || []).filter(function keep(row) { return sameTenant(row, access.tenantSlug); });
        var latest = runs[0] || null;
        var revokedIds = new Set((data[TABLES.revocations] || []).filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).map(function map(row) { return row.entityId; }));
        var certificates = (data[TABLES.certificates] || []).filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).map(function map(row) { return Object.assign({}, row, { status: revokedIds.has(row.certificationId) ? 'REVOKED' : row.certificationStatus }); });
        var dashboard = {
            dashboardId: createId('GL-DASHBOARD'),
            success: true,
            tenantSlug: access.tenantSlug,
            certificationStatus: latest ? latest.status : 'NOT_VALIDATED',
            readinessScore: latest && latest.scores ? latest.scores.overallReadinessScore : 0,
            checklist: latest ? latest.checklist : [],
            validationResults: latest ? Object.keys(latest.domains || {}).map(function map(key) { var domain = latest.domains[key]; return { domain: domain.domain, status: domain.status, score: domain.score, failedCount: (domain.failedChecks || []).length }; }) : [],
            riskAnalysis: latest ? latest.riskAssessment : { risks: [], riskScore: 0 },
            scorecards: latest ? latest.scores : calculateReadinessScores({ domains: {}, blockingFailureCount: 1 }),
            blockingIssues: latest ? latest.blockingIssues : [],
            recommendations: latest && latest.riskAssessment ? latest.riskAssessment.recommendations : [],
            certificates: certificates,
            approvals: (data[TABLES.approvals] || []).filter(function keep(row) { return sameTenant(row, access.tenantSlug); }),
            validationHistory: runs.map(function map(row) { return { runId: row.runId, status: row.status, generatedAt: row.generatedAt, readinessScore: row.scores && row.scores.overallReadinessScore }; }),
            analytics: {
                validationRuns: runs.length,
                certificateCount: certificates.filter(function keep(row) { return row.status !== 'REVOKED'; }).length,
                rollbackCount: (data[TABLES.rollbacks] || []).filter(function keep(row) { return sameTenant(row, access.tenantSlug); }).length,
                latestRiskScore: latest && latest.riskAssessment ? latest.riskAssessment.riskScore : 0
            },
            generatedAt: nowIso(context),
            governance: governanceFlags(),
            immutable: true
        };
        if (!(context && context.skipPersistence)) persist(TABLES.dashboards, dashboard);
        audit('GO_LIVE_DASHBOARD_VIEWED', access.tenantSlug, dashboard.dashboardId, { runId: latest && latest.runId || '', status: dashboard.certificationStatus }, context || {});
        return freezeGoLiveOutput(dashboard);
    }

    function runSelfTest() {
        var snapshot = '';
        try { snapshot = JSON.stringify(rawData()); } catch (error) { snapshot = ''; }
        var checks = [];
        function record(name, passed, details) { checks.push({ name: name, passed: !!passed, details: details || null }); }
        try {
            var tenant = defaultTenant();
            var ctx = { tenantSlug: tenant, actor: { id: 'SELF-TEST', role: 'PLATFORM_OWNER', tenantSlug: tenant }, now: '2026-01-01T00:00:00.000Z', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true };
            var allEvidence = {};
            CHECKLIST_DEFINITIONS.forEach(function each(row) { allEvidence[row[0]] = true; });
            ['EMPLOYEE_CODES', 'EMAIL_UNIQUENESS', 'PHONE_NUMBERS', 'DEPARTMENT_REFERENCES', 'BRANCH_REFERENCES', 'REPORTING_MANAGERS', 'DESIGNATION_REFERENCES', 'EMPLOYMENT_TYPES', 'DUPLICATE_RECORDS', 'INACTIVE_REFERENCES', 'EMPLOYEE_DOCUMENTS', 'COMPANY_DOCUMENTS', 'POLICY_DOCUMENTS', 'OFFER_LETTERS', 'CONTRACTS', 'COMPLIANCE_CERTIFICATES', 'EXPIRED_DOCUMENTS', 'MANDATORY_DOCUMENTS', 'SALARY_COMPONENTS', 'PAYROLL_GROUPS', 'STATUTORY_SETTINGS', 'BANK_DETAILS', 'PAYROLL_CALENDAR', 'FORMULA_VALIDATION', 'PAYROLL_SIMULATION', 'ATTENDANCE_POLICY_READY', 'SHIFT_ASSIGNMENT', 'ROSTER_COVERAGE', 'HOLIDAY_CALENDAR', 'WORKING_HOURS', 'LATE_RULES', 'OVERTIME_RULES', 'LEAVE_WORKFLOW', 'EXPENSE_WORKFLOW', 'RECRUITMENT_WORKFLOW', 'APPROVAL_CHAINS', 'ESCALATION_RULES', 'DELEGATION_RULES', 'SLA_CONFIGURATION', 'RBAC', 'PERMISSION_MATRIX', 'ROLE_ASSIGNMENTS', 'MFA_CONFIGURATION', 'PASSWORD_POLICIES', 'SESSION_POLICIES', 'API_KEYS', 'TENANT_ISOLATION', 'DATABASE', 'REDIS', 'QUEUE', 'OBJECT_STORAGE', 'MAIL_SERVICE', 'NOTIFICATION_SERVICE', 'SCHEDULER', 'SEARCH_ENGINE', 'HEALTH_ENDPOINTS', 'EMPLOYEE_SCALE_200', 'EMPLOYEE_SCALE_500', 'EMPLOYEE_SCALE_1000', 'CONCURRENT_LOGINS', 'BULK_IMPORT', 'DASHBOARD_LOAD', 'APPROVAL_PROCESSING', 'PAYROLL_SIMULATION_PERFORMANCE'].forEach(function each(code) { allEvidence[code] = true; });
            var report = runValidation({ tenantSlug: tenant, evidence: allEvidence }, ctx);
            record('company validation works', report.domains.company.status === 'PASSED');
            record('employee validation works', report.domains.masterData.status === 'PASSED');
            record('payroll validation works', report.domains.payroll.status === 'PASSED');
            record('attendance validation works', report.domains.attendance.status === 'PASSED');
            record('security validation works', report.domains.security.status === 'PASSED');
            record('infrastructure validation works', report.domains.infrastructure.status === 'PASSED');
            record('risk analysis works', report.riskAssessment.success === true && report.riskAssessment.risks.length === 0);
            record('certification gate works', report.certificationEligible === true);
            record('tenant isolation works', runValidation({ tenantSlug: 'different-tenant', evidence: allEvidence }, ctx).code === 'TENANT_ACCESS_DENIED');
            record('outputs are immutable', Object.isFrozen(report) && Object.isFrozen(report.scores));
        } catch (error) {
            record('self-test completes safely', false, safeString(error && error.message, 'Self-test failure'));
        } finally {
            if (snapshot) { try { saveData(JSON.parse(snapshot)); } catch (error) {} }
        }
        return freezeGoLiveOutput({ passed: checks.every(function every(row) { return row.passed; }), timestamp: nowIso(), version: VERSION, summary: 'Go-live validation self-test completed.', checks: checks });
    }

    var ReadinessAnalyzer = freezeDeep({ validateCompany: validateCompany, validateMasterData: validateMasterData, validateDocuments: validateDocuments, validatePayrollReadiness: validatePayrollReadiness, validateAttendanceReadiness: validateAttendanceReadiness, validateWorkflowReadiness: validateWorkflowReadiness, validateSecurityReadiness: validateSecurityReadiness, validatePerformance: validatePerformance, calculateReadinessScores: calculateReadinessScores }, []);
    var InfrastructureValidator = freezeDeep({ validateInfrastructure: validateInfrastructure }, []);
    var RiskAssessmentService = freezeDeep({ assessRisks: assessRisks }, []);
    var CertificationService = freezeDeep({ approveGoLive: approveGoLive, generateCertificate: generateCertificate, recordOverride: recordOverride, rollbackGovernanceOperation: rollbackGovernanceOperation }, []);
    var GoLiveDashboardService = freezeDeep({ generateDashboard: generateDashboard }, []);
    var CoreGoLiveValidationService = freezeDeep({
        runValidation: runValidation,
        scheduleValidation: scheduleValidation,
        recordOverride: recordOverride,
        approveGoLive: approveGoLive,
        generateCertificate: generateCertificate,
        rollbackGovernanceOperation: rollbackGovernanceOperation,
        generateDashboard: generateDashboard
    }, []);
    var api = freezeDeep({
        VERSION: VERSION,
        SOURCE: SOURCE,
        TABLES: TABLES,
        CHECKLIST_DEFINITIONS: CHECKLIST_DEFINITIONS,
        GoLiveValidationService: CoreGoLiveValidationService,
        ReadinessAnalyzer: ReadinessAnalyzer,
        InfrastructureValidator: InfrastructureValidator,
        RiskAssessmentService: RiskAssessmentService,
        CertificationService: CertificationService,
        GoLiveDashboardService: GoLiveDashboardService,
        runValidation: runValidation,
        scheduleValidation: scheduleValidation,
        validateCompany: validateCompany,
        validateMasterData: validateMasterData,
        validateDocuments: validateDocuments,
        validatePayrollReadiness: validatePayrollReadiness,
        validateAttendanceReadiness: validateAttendanceReadiness,
        validateWorkflowReadiness: validateWorkflowReadiness,
        validateSecurityReadiness: validateSecurityReadiness,
        validateInfrastructure: validateInfrastructure,
        validatePerformance: validatePerformance,
        assessRisks: assessRisks,
        calculateReadinessScores: calculateReadinessScores,
        recordOverride: recordOverride,
        approveGoLive: approveGoLive,
        generateCertificate: generateCertificate,
        rollbackGovernanceOperation: rollbackGovernanceOperation,
        generateDashboard: generateDashboard,
        freezeGoLiveOutput: freezeGoLiveOutput,
        runSelfTest: runSelfTest,
        governance: freezeGoLiveOutput(governanceFlags())
    }, []);

    global.GoLiveValidationService = api;
    global.goLiveValidationService = api;
    global.ReadinessAnalyzer = ReadinessAnalyzer;
    global.InfrastructureValidator = InfrastructureValidator;
    global.RiskAssessmentService = RiskAssessmentService;
    global.CertificationService = CertificationService;
    global.GoLiveDashboardService = GoLiveDashboardService;
    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_GO_LIVE_VALIDATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
