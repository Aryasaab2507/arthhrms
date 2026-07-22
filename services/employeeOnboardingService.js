/**
 * employeeOnboardingService.js
 * ARTHHRMS - Enterprise Employee Onboarding Hardening Layer
 *
 * PURPOSE:
 * Provides enterprise-safe employee onboarding validation for staged pilot
 * activation, tenant-safe bulk import, role governance, and manager mapping.
 *
 * This service does NOT:
 * - mutate production records during validation
 * - expose platform ownership to tenant onboarding
 * - bypass RLS
 * - expose service-role secrets
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const ONBOARDING_LIFECYCLE = Object.freeze(['INVITED', 'PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DISABLED']);
    const PILOT_STAGES = Object.freeze(['pilot_group_1', 'pilot_group_2', 'full_activation']);
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'HIGH', 'CRITICAL']);

    function db() { return global.DB || null; }

    function data() {
        try { return db()?.get ? db().get() : {}; } catch (err) { return {}; }
    }

    function cloneObject(input) {
        const out = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
        Object.keys(input).forEach(key => {
            const value = input[key];
            out[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value;
        });
        return out;
    }

    function freezeOnboardingOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(item => freezeOnboardingOutput(item)));
        if (value && typeof value === 'object') {
            const clone = {};
            Object.keys(value).forEach(key => { clone[key] = freezeOnboardingOutput(value[key]); });
            return Object.freeze(clone);
        }
        return value;
    }

    function safeSeverity(value, fallback = 'HIGH') {
        const normalized = String(value || fallback).trim().toUpperCase();
        return SEVERITIES.includes(normalized) ? normalized : fallback;
    }

    function safeFailure(failureCode, severity, message, metadata = {}) {
        return freezeOnboardingOutput({
            failureCode: String(failureCode || 'ONBOARDING_VALIDATION_FAILURE'),
            severity: safeSeverity(severity),
            message: String(message || 'Onboarding validation failed.'),
            metadata: cloneObject(metadata)
        });
    }

    function safeWarning(warningCode, message, metadata = {}) {
        return freezeOnboardingOutput({
            warningCode: String(warningCode || 'ONBOARDING_VALIDATION_WARNING'),
            severity: 'WARNING',
            message: String(message || 'Onboarding validation warning.'),
            metadata: cloneObject(metadata)
        });
    }

    function normalizeEmail(email) {
        try { return db()?.normalizeEmail ? db().normalizeEmail(email) : String(email || '').trim().toLowerCase(); } catch (err) { return String(email || '').trim().toLowerCase(); }
    }

    function normalizeOnboardingRole(role) {
        if (global.InviteGovernanceService?.normalizeOnboardingRole) return global.InviteGovernanceService.normalizeOnboardingRole(role);
        const raw = String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'hrhead') return 'hr_head';
        if (raw === 'platform_owner' || raw === 'platformowner' || raw === 'owner' || raw === 'root') return '';
        return ['employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin'].includes(raw) ? raw : '';
    }

    function normalizeTenant(value) {
        return String(value || '').trim();
    }

    function tenantOf(record = {}) {
        return normalizeTenant(record.tenantId || record.companyId || record.organizationId || record.orgId || record.tenant_id || record.company_id);
    }

    function defaultTenant(sourceData = data()) {
        const settings = sourceData.companySettings || sourceData.settings || {};
        return tenantOf(settings) || normalizeTenant(settings.companyName || '');
    }

    function resolveEmployeeId(empId, sourceData = data()) {
        const raw = String(empId || '').trim();
        if (!raw) return '';
        try { return db()?.resolveEmployeeId ? db().resolveEmployeeId(raw, sourceData) : raw; } catch (err) { return raw; }
    }

    function findEmployee(empId, sourceData = data()) {
        const id = resolveEmployeeId(empId, sourceData);
        return (sourceData.employees || []).find(emp => emp.id === id || emp.empId === id || emp.employeeId === id) || null;
    }

    function isInactive(record = {}) {
        return /inactive|archived|suspended|terminated|disabled/i.test(`${record.employmentStatus || ''} ${record.status || ''} ${record.activationStatus || ''} ${record.lifecycleStatus || ''}`);
    }

    function safeDate(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) return text;
        return date.toISOString().slice(0, 10);
    }

    function mapBulkRow(row = {}) {
        const source = cloneObject(row);
        const employeeId = source.employee_id || source.employeeId || source.empId || source.id || source.employee_code || source.employeeCode || '';
        const managerId = source.reporting_manager_id || source.reportingManagerId || source.managerId || source.manager_id || '';
        const joiningDate = source.joining_date || source.joiningDate || source.joinDate || source.doj || '';
        return {
            employee_id: String(employeeId || '').trim(),
            empId: String(employeeId || '').trim(),
            name: String(source.name || source.fullName || source.full_name || source.employeeName || '').trim(),
            fullName: String(source.name || source.fullName || source.full_name || source.employeeName || '').trim(),
            email: normalizeEmail(source.email || source.email_id || source.emailId || ''),
            department: String(source.department || source.dept || '').trim(),
            designation: String(source.designation || source.desig || '').trim(),
            role: normalizeOnboardingRole(source.role || source.portalRole || 'employee'),
            rawRole: source.role || source.portalRole || 'employee',
            reporting_manager_id: String(managerId || '').trim(),
            managerId: String(managerId || '').trim(),
            joining_date: safeDate(joiningDate),
            joinDate: safeDate(joiningDate),
            tenantId: normalizeTenant(source.tenant_id || source.tenantId || source.companyId || source.company_id || ''),
            companyId: normalizeTenant(source.companyId || source.company_id || source.tenant_id || source.tenantId || ''),
            __raw: source
        };
    }

    function emitTelemetry(eventType, metadata = {}, severity = 'INFO') {
        try {
            if (global.WorkflowTelemetryService?.emitTelemetry) {
                global.WorkflowTelemetryService.emitTelemetry('AUTH', eventType, {
                    source: 'employeeOnboardingService',
                    severity,
                    status: severity === 'INFO' ? 'PASSED' : 'BLOCKED',
                    metadata: cloneObject(metadata)
                });
            }
        } catch (err) {}
    }

    function auditOnboarding(eventType, payload = {}, context = {}) {
        try {
            if (global.AuditService?.recordAudit) {
                global.AuditService.recordAudit({
                    eventType,
                    module: 'Employee Onboarding',
                    eventId: payload.empId || payload.employee_id || payload.batchId || '',
                    actorId: context.actorId || context.id || '',
                    employeeId: payload.empId || payload.employee_id || '',
                    source: 'employeeOnboardingService',
                    severity: payload.severity || 'INFO',
                    metadata: cloneObject(payload.metadata || payload)
                }, context);
            }
        } catch (err) {}
    }

    function addFailure(list, code, severity, message, metadata) {
        list.push(safeFailure(code, severity, message, metadata));
    }

    function validateBulkImportRow(row = {}, context = {}, state = {}) {
        try {
            const sourceData = state.data || data();
            const normalized = mapBulkRow(row);
            const failures = [];
            const warnings = [];
            const tenant = normalizeTenant(context.tenantId || context.companyId || defaultTenant(sourceData));
            const rowTenant = normalized.tenantId || normalized.companyId || tenant;
            const employeeId = resolveEmployeeId(normalized.employee_id, sourceData);
            normalized.employee_id = employeeId || normalized.employee_id;
            normalized.empId = normalized.employee_id;

            if (!normalized.employee_id) addFailure(failures, 'EMPLOYEE_ID_REQUIRED', 'HIGH', 'employee_id is required.');
            if (!normalized.name) addFailure(failures, 'EMPLOYEE_NAME_REQUIRED', 'HIGH', 'Employee name is required.');
            if (!normalized.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) addFailure(failures, 'EMPLOYEE_EMAIL_INVALID', 'HIGH', 'A valid employee email is required.');
            if (!normalized.department) addFailure(failures, 'DEPARTMENT_REQUIRED', 'HIGH', 'Department is required.');
            if (!normalized.designation) addFailure(failures, 'DESIGNATION_REQUIRED', 'HIGH', 'Designation is required.');
            if (!normalized.joining_date || !/^\d{4}-\d{2}-\d{2}$/.test(normalized.joining_date)) addFailure(failures, 'JOINING_DATE_INVALID', 'HIGH', 'joining_date must be YYYY-MM-DD.');
            if (!normalized.role) {
                const platformAttempt = /platform|owner|root/i.test(String(normalized.rawRole || ''));
                addFailure(failures, platformAttempt ? 'UNSAFE_ROLE_ASSIGNMENT' : 'INVALID_ROLE_ASSIGNMENT', 'HIGH', 'Role is not allowed for tenant onboarding.', { role: normalized.rawRole });
            }
            if (tenant && rowTenant && rowTenant !== tenant) addFailure(failures, 'CROSS_TENANT_ONBOARDING_BLOCKED', 'CRITICAL', 'Employee row belongs to a different tenant than the onboarding context.', { tenant, rowTenant });

            const existingEmployee = findEmployee(normalized.employee_id, sourceData);
            if (existingEmployee) warnings.push(safeWarning('EXISTING_EMPLOYEE_UPDATE', 'Existing employee will be updated if this import is committed.', { empId: normalized.employee_id }));

            const existingEmailOwner = (sourceData.employees || []).find(emp => normalizeEmail(emp.email) === normalized.email && emp.id !== normalized.employee_id);
            if (existingEmailOwner) addFailure(failures, 'EMAIL_ALREADY_ASSIGNED', 'HIGH', 'Email already belongs to another employee.', { email: normalized.email, owner: existingEmailOwner.id });

            if (state.seenEmployeeIds) {
                const idKey = normalized.employee_id.toLowerCase();
                if (idKey && state.seenEmployeeIds.has(idKey)) addFailure(failures, 'DUPLICATE_EMPLOYEE_ID_IN_FILE', 'HIGH', 'Duplicate employee_id inside import file.', { empId: normalized.employee_id });
                if (idKey) state.seenEmployeeIds.add(idKey);
            }
            if (state.seenEmails) {
                const emailKey = normalized.email.toLowerCase();
                if (emailKey && state.seenEmails.has(emailKey)) addFailure(failures, 'DUPLICATE_EMAIL_IN_FILE', 'HIGH', 'Duplicate email inside import file.', { email: normalized.email });
                if (emailKey) state.seenEmails.add(emailKey);
            }

            const managerId = resolveEmployeeId(normalized.reporting_manager_id, sourceData);
            if (managerId) {
                normalized.reporting_manager_id = managerId;
                normalized.managerId = managerId;
                if (managerId === normalized.employee_id) addFailure(failures, 'SELF_MANAGER_NOT_ALLOWED', 'HIGH', 'Employee cannot report to self.', { empId: normalized.employee_id });
                const manager = findEmployee(managerId, sourceData);
                const incomingManager = (state.incomingRows || []).find(item => resolveEmployeeId(item.employee_id || item.empId, sourceData) === managerId);
                if (!manager && !incomingManager) addFailure(failures, 'MANAGER_NOT_FOUND', 'HIGH', 'Reporting manager does not exist in tenant or current import batch.', { managerId });
                if (manager && isInactive(manager)) addFailure(failures, 'INACTIVE_MANAGER_BLOCKED', 'HIGH', 'Inactive managers cannot be assigned for onboarding.', { managerId });
                if (manager && tenant && tenantOf(manager) && tenantOf(manager) !== tenant) addFailure(failures, 'CROSS_TENANT_MANAGER_BLOCKED', 'CRITICAL', 'Reporting manager belongs to a different tenant.', { managerId, managerTenant: tenantOf(manager), tenant });
            }

            return freezeOnboardingOutput({
                success: failures.length === 0,
                rowStatus: failures.length ? 'FAILED' : warnings.length ? 'WARNING' : 'SUCCESS',
                failures,
                warnings,
                normalizedRow: normalized
            });
        } catch (err) {
            return freezeOnboardingOutput({
                success: false,
                rowStatus: 'FAILED',
                failures: [safeFailure('BULK_ROW_VALIDATION_FAILED_SAFE', 'HIGH', 'Bulk import row validation failed safely.')],
                warnings: [],
                normalizedRow: {}
            });
        }
    }

    function detectCircularManagerChains(rows = [], context = {}) {
        try {
            const sourceData = context.data || data();
            const graph = {};
            rows.forEach(row => {
                const mapped = row.normalizedRow || mapBulkRow(row);
                const empId = resolveEmployeeId(mapped.employee_id || mapped.empId, sourceData);
                const managerId = resolveEmployeeId(mapped.reporting_manager_id || mapped.managerId, sourceData);
                if (empId && managerId) graph[empId] = managerId;
            });
            const failures = [];
            Object.keys(graph).forEach(empId => {
                const path = [];
                const seen = new Set();
                let cursor = empId;
                while (cursor && graph[cursor]) {
                    if (seen.has(cursor)) {
                        path.push(cursor);
                        failures.push(safeFailure('CIRCULAR_MANAGER_CHAIN', 'HIGH', 'Circular manager hierarchy detected.', { chain: path.slice() }));
                        return;
                    }
                    seen.add(cursor);
                    path.push(cursor);
                    cursor = graph[cursor];
                }
            });
            return freezeOnboardingOutput(failures);
        } catch (err) {
            return freezeOnboardingOutput([safeFailure('CIRCULAR_MANAGER_CHECK_FAILED_SAFE', 'HIGH', 'Circular manager validation failed safely.')]);
        }
    }

    function validateManagerHierarchy(rows = [], context = {}) {
        try {
            const sourceData = data();
            const tenant = normalizeTenant(context.tenantId || context.companyId || defaultTenant(sourceData));
            const mappedRows = (rows || []).map(mapBulkRow);
            const failures = [];
            mappedRows.forEach(row => {
                const empId = resolveEmployeeId(row.employee_id, sourceData);
                const managerId = resolveEmployeeId(row.reporting_manager_id, sourceData);
                if (managerId && managerId === empId) addFailure(failures, 'SELF_MANAGER_NOT_ALLOWED', 'HIGH', 'Employee cannot report to self.', { empId });
                const manager = managerId ? findEmployee(managerId, sourceData) : null;
                if (manager && tenant && tenantOf(manager) && tenantOf(manager) !== tenant) addFailure(failures, 'CROSS_TENANT_MANAGER_BLOCKED', 'CRITICAL', 'Reporting manager belongs to a different tenant.', { managerId, tenant, managerTenant: tenantOf(manager) });
                if (manager && isInactive(manager)) addFailure(failures, 'INACTIVE_MANAGER_BLOCKED', 'HIGH', 'Inactive manager cannot be used in onboarding hierarchy.', { managerId });
            });
            failures.push(...detectCircularManagerChains(mappedRows, { data: sourceData }));
            return freezeOnboardingOutput({
                success: failures.length === 0,
                failures,
                warnings: [],
                checkedRows: mappedRows.length
            });
        } catch (err) {
            return freezeOnboardingOutput({ success: false, failures: [safeFailure('MANAGER_HIERARCHY_FAILED_SAFE', 'HIGH', 'Manager hierarchy validation failed safely.')], warnings: [], checkedRows: 0 });
        }
    }

    function validateBulkOnboardingImport(rows = [], options = {}) {
        try {
            const sourceData = data();
            const state = {
                data: sourceData,
                seenEmployeeIds: new Set(),
                seenEmails: new Set(),
                incomingRows: rows || []
            };
            const dryRun = options.dryRun !== false;
            const allRows = (rows || []).map((row, index) => {
                const validation = validateBulkImportRow({ ...row, _rowIndex: row._rowIndex || index + 2 }, options, state);
                return freezeOnboardingOutput({
                    rowIndex: row._rowIndex || index + 2,
                    ...validation
                });
            });
            const hierarchy = validateManagerHierarchy(allRows.map(row => row.normalizedRow), options);
            const hierarchyFailures = hierarchy.failures || [];
            const failedRows = allRows.map(row => {
                const failures = (row.failures || []).slice();
                const empId = row.normalizedRow?.employee_id || '';
                hierarchyFailures.forEach(failure => {
                    const meta = failure.metadata || {};
                    const chain = meta.chain || [];
                    if (meta.empId === empId || chain.includes(empId)) failures.push(failure);
                });
                return freezeOnboardingOutput({ ...row, failures, success: failures.length === 0, rowStatus: failures.length ? 'FAILED' : row.rowStatus });
            });
            const successRows = failedRows.filter(row => row.success);
            const warningRows = failedRows.filter(row => row.success && row.warnings.length);
            const failuresOnly = failedRows.filter(row => !row.success);
            const duplicates = failuresOnly.filter(row => row.failures.some(failure => /DUPLICATE/.test(failure.failureCode)));
            const output = {
                success: failuresOnly.length === 0,
                blocked: failuresOnly.length > 0,
                dryRun,
                replayVisible: true,
                summary: {
                    totalRows: failedRows.length,
                    successRows: successRows.length,
                    warningRows: warningRows.length,
                    failedRows: failuresOnly.length,
                    duplicateRows: duplicates.length,
                    executableRows: successRows.length + warningRows.length
                },
                successRows,
                warningRows,
                failedRows: failuresOnly,
                duplicateRows: duplicates,
                hierarchy,
                normalizedImportRows: successRows.map(row => ({
                    empId: row.normalizedRow.employee_id,
                    fullName: row.normalizedRow.name,
                    email: row.normalizedRow.email,
                    department: row.normalizedRow.department,
                    designation: row.normalizedRow.designation,
                    managerId: row.normalizedRow.reporting_manager_id,
                    joinDate: row.normalizedRow.joining_date,
                    role: row.normalizedRow.role,
                    employmentStatus: 'Active'
                })),
                generatedAt: new Date().toISOString()
            };
            emitTelemetry(output.success ? 'BULK_ONBOARDING_VALIDATED' : 'BULK_ONBOARDING_BLOCKED', {
                totalRows: output.summary.totalRows,
                failedRows: output.summary.failedRows,
                duplicateRows: output.summary.duplicateRows,
                dryRun
            }, output.success ? 'INFO' : 'HIGH');
            if (!output.success) auditOnboarding('BULK_ONBOARDING_VALIDATION_BLOCKED', { batchId: 'dry-run', severity: 'HIGH', metadata: output.summary }, options);
            return freezeOnboardingOutput(output);
        } catch (err) {
            return freezeOnboardingOutput({
                success: false,
                blocked: true,
                dryRun: options.dryRun !== false,
                replayVisible: true,
                summary: { totalRows: 0, successRows: 0, warningRows: 0, failedRows: 0, duplicateRows: 0, executableRows: 0 },
                successRows: [],
                warningRows: [],
                failedRows: [],
                duplicateRows: [],
                hierarchy: { success: false, failures: [safeFailure('BULK_ONBOARDING_FAILED_SAFE', 'HIGH', 'Bulk onboarding validation failed safely.')] },
                normalizedImportRows: [],
                generatedAt: new Date().toISOString()
            });
        }
    }

    function createPilotActivationPlan(employeeIds = [], options = {}) {
        try {
            const stage = String(options.stage || 'pilot_group_1').trim();
            const sourceData = data();
            const tenant = normalizeTenant(options.tenantId || options.companyId || defaultTenant(sourceData));
            const failures = [];
            if (!PILOT_STAGES.includes(stage)) addFailure(failures, 'INVALID_PILOT_STAGE', 'HIGH', 'Pilot activation stage is invalid.', { stage });
            const employees = (employeeIds || []).map(id => {
                const emp = findEmployee(id, sourceData);
                if (!emp) {
                    failures.push(safeFailure('EMPLOYEE_NOT_FOUND', 'HIGH', 'Pilot activation references a missing employee.', { empId: id }));
                    return null;
                }
                if (tenant && tenantOf(emp) && tenantOf(emp) !== tenant) failures.push(safeFailure('CROSS_TENANT_ONBOARDING_BLOCKED', 'CRITICAL', 'Pilot activation cannot include employees from another tenant.', { empId: emp.id, tenant, employeeTenant: tenantOf(emp) }));
                return {
                    empId: emp.id,
                    name: emp.name,
                    email: emp.email,
                    role: normalizeOnboardingRole(emp.role || 'employee') || 'employee',
                    currentActivationStatus: emp.activationStatus || 'Not Activated',
                    nextLifecycleStatus: stage === 'full_activation' ? 'ACTIVE' : 'INVITED'
                };
            }).filter(Boolean);
            const result = {
                success: failures.length === 0,
                blocked: failures.length > 0,
                stage,
                tenantId: tenant,
                employees,
                failures,
                warnings: [],
                replayVisible: true,
                generatedAt: new Date().toISOString()
            };
            emitTelemetry(result.success ? 'PILOT_ACTIVATION_PLAN_CREATED' : 'PILOT_ACTIVATION_PLAN_BLOCKED', { stage, count: employees.length, failureCount: failures.length }, result.success ? 'INFO' : 'HIGH');
            return freezeOnboardingOutput(result);
        } catch (err) {
            return freezeOnboardingOutput({ success: false, blocked: true, stage: '', employees: [], failures: [safeFailure('PILOT_PLAN_FAILED_SAFE', 'HIGH', 'Pilot activation planning failed safely.')], warnings: [], replayVisible: true, generatedAt: new Date().toISOString() });
        }
    }

    function validateOnboardingRlsIsolation(context = {}) {
        try {
            if (!global.RLSValidationService?.validateTenantIsolation) {
                return freezeOnboardingOutput({
                    success: true,
                    validationType: 'ONBOARDING_RLS_ISOLATION',
                    passed: false,
                    warnings: [safeWarning('RLS_VALIDATION_SERVICE_MISSING', 'RLS validation service is not loaded.')],
                    failures: [safeFailure('RLS_ONBOARDING_UNVERIFIED', 'HIGH', 'Onboarding tenant isolation must be verified before production activation.')],
                    recommendations: [],
                    timestamp: new Date().toISOString()
                });
            }
            const result = global.RLSValidationService.validateTenantIsolation(context);
            emitTelemetry(result.passed ? 'ONBOARDING_RLS_VALIDATED' : 'ONBOARDING_RLS_BLOCKED', { failureCount: result.failures?.length || 0 }, result.passed ? 'INFO' : 'HIGH');
            return freezeOnboardingOutput(result);
        } catch (err) {
            return freezeOnboardingOutput({ success: false, validationType: 'ONBOARDING_RLS_ISOLATION', passed: false, warnings: [], failures: [safeFailure('RLS_ONBOARDING_FAILED_SAFE', 'HIGH', 'Onboarding RLS validation failed safely.')], recommendations: [], timestamp: new Date().toISOString() });
        }
    }

    function validateInvitePayload(payload = {}, context = {}) {
        if (global.InviteGovernanceService?.validateInvitePayload) return global.InviteGovernanceService.validateInvitePayload(payload, context);
        return freezeOnboardingOutput({ success: false, blocked: true, failures: [safeFailure('INVITE_GOVERNANCE_MISSING', 'HIGH', 'Invite governance service is required.')], warnings: [], normalizedPayload: {} });
    }

    function runSelfTest() {
        const roleBlocked = normalizeOnboardingRole('platform_owner') === '';
        const row = validateBulkImportRow({ employee_id: 'E1', role: 'platform_owner' }, { tenantId: 'T1' }, { data: { employees: [] }, seenEmployeeIds: new Set(), seenEmails: new Set(), incomingRows: [] });
        const hierarchy = validateManagerHierarchy([{ employee_id: 'A', reporting_manager_id: 'A', tenant_id: 'T1' }], { tenantId: 'T1' });
        const checks = [
            roleBlocked,
            row.failures.some(item => item.failureCode === 'UNSAFE_ROLE_ASSIGNMENT'),
            hierarchy.failures.some(item => item.failureCode === 'SELF_MANAGER_NOT_ALLOWED'),
            Object.isFrozen(row),
            Object.isFrozen(hierarchy)
        ];
        if (!checks.every(Boolean)) {
            try { console.warn('[employeeOnboardingService] Self-test warnings detected.', checks); } catch (err) {}
        }
        return checks.every(Boolean);
    }

    const api = Object.freeze({
        ONBOARDING_LIFECYCLE,
        PILOT_STAGES,
        normalizeOnboardingRole,
        validateInvitePayload,
        validateManagerHierarchy,
        detectCircularManagerChains,
        freezeOnboardingOutput,
        validateBulkImportRow,
        validateBulkOnboardingImport,
        createPilotActivationPlan,
        validateOnboardingRlsIsolation,
        runSelfTest
    });

    global.EmployeeOnboardingService = api;
    global.employeeOnboardingService = api;

    if (global.__ARTHHRMS_DEV__) {
        try { runSelfTest(); } catch (err) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
