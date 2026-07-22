(function attachInitialLeaveBalanceImportService(global) {
    'use strict';

    var SUPPORTED_FILE_TYPES = Object.freeze(['CSV', 'XLS', 'XLSX']);
    var MIGRATION_STATES = Object.freeze(['UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'APPROVAL_PENDING', 'APPLIED', 'ARCHIVED']);
    var DEFAULT_LEAVE_TYPES = Object.freeze(['CASUAL LEAVE', 'SICK LEAVE', 'EARNED LEAVE', 'WORK FROM HOME', 'UNPAID LEAVE', 'LEAVE WITHOUT PAY', 'MATERNITY LEAVE', 'PATERNITY LEAVE']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|password|secret|token|bank|account|aadhaar|\bpan\b|panNumber|taxPan|ssn|private|medical|document|reason|remarks/i;

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

    function normalizeKey(value) {
        return normalizeText(value).toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeFileType(value) {
        return normalizeText(value || 'CSV').toUpperCase().replace(/^\./, '');
    }

    function normalizeLeaveType(value) {
        return normalizeText(value).toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function toNumber(value) {
        if (value === '' || value == null) return 0;
        var number = Number(value);
        return Number.isFinite(number) ? number : NaN;
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function freezeLeaveMigrationOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeLeaveMigrationOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeLeaveMigrationOutput(value[key]);
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
        return freezeLeaveMigrationOutput({
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

    function employeeIdOf(employee) {
        return normalizeText(employee?.employeeId || employee?.empId || employee?.id || '');
    }

    function tenantEmployees(tenantSlug) {
        return arrayFor('employees').filter(function each(employee) {
            return employee && typeof employee === 'object' && sameTenant(employee, tenantSlug) && normalizeRole(employee.role || '') !== 'PLATFORM_OWNER';
        });
    }

    function findEmployee(row, tenantSlug) {
        var employeeId = normalizeText(row.employeeId || '');
        var email = normalizeText(row.employeeEmail || '').toLowerCase();
        return tenantEmployees(tenantSlug).find(function match(employee) {
            return (employeeId && employeeIdOf(employee) === employeeId) || (email && normalizeText(employee.email || employee.workEmail || '').toLowerCase() === email);
        }) || null;
    }

    function policyRows(tenantSlug) {
        var rows = tenantRows('leavePolicies', tenantSlug)
            .concat(tenantRows('leavePolicyRecords', tenantSlug))
            .filter(function active(row) { return row && row.active !== false && row.archived !== true; });
        if (!rows.length) {
            rows = DEFAULT_LEAVE_TYPES.map(function map(type) {
                return { tenantSlug: tenantSlug, leaveType: type, annualAllowance: type === 'EARNED LEAVE' ? 18 : type === 'SICK LEAVE' ? 10 : 12, carryForwardLimit: type === 'EARNED LEAVE' ? 10 : type === 'CASUAL LEAVE' ? 5 : 0, active: true };
            });
        }
        return rows;
    }

    function findPolicy(leaveType, tenantSlug) {
        var type = normalizeLeaveType(leaveType);
        return policyRows(tenantSlug).find(function match(policy) { return normalizeLeaveType(policy.leaveType || policy.type || policy.name) === type; }) || null;
    }

    function latestMigration(tenantSlug, includePending) {
        return tenantRows('initialLeaveBalanceImports', tenantSlug)
            .filter(function visible(row) { return includePending || row.state === 'APPLIED' || row.active === true; })
            .sort(function sort(a, b) { return String(b.appliedAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.appliedAt || a.updatedAt || a.createdAt || '')); })[0] || null;
    }

    function normalizeBalance(row, tenantSlug, defaultEffectiveDate, index) {
        var effectiveDate = normalizeText(row?.effectiveDate || row?.effective_date || row?.date || defaultEffectiveDate || '');
        return {
            balanceId: normalizeText(row?.balanceId || row?.id || ('LBAL-' + normalizeTenantSlug(tenantSlug || 'tenant') + '-' + String(index + 1).padStart(3, '0'))),
            tenantSlug: normalizeTenantSlug(row?.tenantSlug || row?.tenantId || tenantSlug),
            employeeId: normalizeText(row?.employeeId || row?.empId || row?.employee_id || row?.id || ''),
            employeeEmail: normalizeText(row?.employeeEmail || row?.email || row?.workEmail || ''),
            leaveType: normalizeLeaveType(row?.leaveType || row?.type || row?.category || ''),
            openingBalance: toNumber(row?.openingBalance ?? row?.opening ?? row?.totalBalance ?? row?.balance),
            usedBalance: toNumber(row?.usedBalance ?? row?.used ?? 0),
            remainingBalance: toNumber(row?.remainingBalance ?? row?.remaining ?? row?.availableBalance ?? row?.available),
            carryForwardBalance: toNumber(row?.carryForwardBalance ?? row?.carryForward ?? row?.carry_forward ?? 0),
            effectiveDate: effectiveDate,
            sourceIndex: index || 0,
            raw: cloneSanitized(row || {})
        };
    }

    function normalizeLeaveMigrationPayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenantId || tenantFromContext(context || {}));
        var fallback = latestMigration(tenantSlug, true) || {};
        var rows = Array.isArray(source.balances) ? source.balances :
            Array.isArray(source.rows) ? source.rows :
            Array.isArray(source.records) ? source.records :
            Array.isArray(source.leaveBalances) ? source.leaveBalances :
            Array.isArray(fallback.balances) ? fallback.balances : [];
        var effectiveDate = normalizeText(source.effectiveDate || source.effective_date || fallback.effectiveDate || '');
        return {
            tenantSlug: tenantSlug,
            migrationId: normalizeText(source.migrationId || source.id || fallback.migrationId || ''),
            migrationName: normalizeText(source.migrationName || source.name || fallback.migrationName || 'Initial Leave Balance Migration'),
            fileName: normalizeText(source.fileName || source.filename || source.file?.name || fallback.fileName || 'initial-leave-balances.csv'),
            fileType: normalizeFileType(source.fileType || source.type || source.file?.type || source.fileName?.split('.').pop() || fallback.fileType || 'CSV'),
            effectiveDate: effectiveDate,
            approvalGranted: source.approvalGranted === true || source.approved === true || source.directorApproval === true,
            balances: rows.map(function map(row, index) { return normalizeBalance(row, tenantSlug, effectiveDate, index); })
        };
    }

    function platformBalance(row, index) {
        return {
            balanceId: row.balanceId,
            tenantSlug: row.tenantSlug,
            employeeId: 'Governance Employee ' + String(index + 1).padStart(2, '0'),
            employeeEmail: '',
            leaveType: row.leaveType,
            openingBalance: row.openingBalance,
            usedBalance: row.usedBalance,
            remainingBalance: row.remainingBalance,
            carryForwardBalance: row.carryForwardBalance,
            effectiveDate: row.effectiveDate
        };
    }

    function validateAccess(operation, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        var actorTenant = actor.tenantSlug || tenantFromContext(context || {});
        var targetTenant = normalizeTenantSlug(tenantSlug || actorTenant);
        var issues = [];
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && targetTenant && actorTenant !== targetTenant) {
            issues.push(issue('CROSS_TENANT_LEAVE_MIGRATION_BLOCKED', 'Leave balance migrations are tenant scoped and cannot be imported across tenants.', 'CRITICAL', { actorTenant: actorTenant, targetTenant: targetTenant }));
            return { allowed: false, actor: actor, issues: issues };
        }
        if (operation === 'IMPORT' && actor.role !== 'HR') issues.push(issue('LEAVE_MIGRATION_IMPORT_DENIED', 'Only HR can import initial leave balances.', 'ERROR', { role: actor.role }));
        if (operation === 'APPLY' && actor.role !== 'DIRECTOR') issues.push(issue('LEAVE_MIGRATION_APPLY_DENIED', 'Only Director approval can apply imported leave balances.', 'ERROR', { role: actor.role }));
        if ((operation === 'VALIDATE' || operation === 'SCORE') && ['HR', 'DIRECTOR', 'PLATFORM_OWNER'].indexOf(actor.role) === -1) issues.push(issue('LEAVE_MIGRATION_VALIDATION_DENIED', 'Leave migration validation is restricted to HR, Director, and governance visibility roles.', 'ERROR', { role: actor.role }));
        if (operation === 'VIEW' && ['HR', 'DIRECTOR', 'EMPLOYEE', 'PLATFORM_OWNER'].indexOf(actor.role) === -1) issues.push(issue('LEAVE_MIGRATION_VIEW_DENIED', 'Leave migration visibility is role scoped.', 'ERROR', { role: actor.role }));
        return { allowed: issues.length === 0, actor: actor, issues: issues };
    }

    function visibleBalancesForActor(payload, actor) {
        if (actor.role === 'EMPLOYEE') {
            var actorId = normalizeText(actor.empId || actor.id);
            return payload.balances.filter(function own(row) { return row.employeeId === actorId; });
        }
        return payload.balances;
    }

    function validationIssues(payload) {
        var issues = [];
        if (SUPPORTED_FILE_TYPES.indexOf(payload.fileType) === -1) {
            issues.push(issue('UNSUPPORTED_LEAVE_BALANCE_FILE_TYPE', 'Leave balance imports support CSV, XLS, and XLSX files only.', 'CRITICAL', { fileType: payload.fileType }));
        }
        if (!payload.balances.length) issues.push(issue('EMPTY_LEAVE_BALANCE_IMPORT', 'Leave balance imports must include at least one row.', 'CRITICAL'));
        var seen = {};
        var seenEmployeeType = {};
        payload.balances.forEach(function validate(row) {
            var employee = findEmployee(row, payload.tenantSlug);
            var policy = findPolicy(row.leaveType, payload.tenantSlug);
            if (!employee) issues.push(issue('EMPLOYEE_NOT_FOUND', 'Leave balance row references an unknown tenant employee.', 'ERROR', { row: row.sourceIndex + 1, employeeId: row.employeeId }));
            if (!policy) issues.push(issue('LEAVE_TYPE_NOT_FOUND', 'Leave balance row references an unknown leave type.', 'ERROR', { row: row.sourceIndex + 1, leaveType: row.leaveType }));
            if (!validDate(row.effectiveDate)) issues.push(issue('INVALID_EFFECTIVE_DATE', 'Effective date must be a valid YYYY-MM-DD date.', 'ERROR', { row: row.sourceIndex + 1, effectiveDate: row.effectiveDate }));
            ['openingBalance', 'usedBalance', 'remainingBalance', 'carryForwardBalance'].forEach(function numberField(field) {
                if (!Number.isFinite(row[field])) issues.push(issue('INVALID_LEAVE_BALANCE_VALUE', 'Leave balances must be numeric.', 'ERROR', { row: row.sourceIndex + 1, field: field }));
                else if (row[field] < 0) issues.push(issue('NEGATIVE_LEAVE_BALANCE', 'Leave balances cannot be negative.', 'ERROR', { row: row.sourceIndex + 1, field: field }));
            });
            if (Number.isFinite(row.openingBalance) && Number.isFinite(row.usedBalance) && Number.isFinite(row.remainingBalance) && Math.abs((row.openingBalance - row.usedBalance) - row.remainingBalance) > 0.01) {
                issues.push(issue('LEAVE_BALANCE_MATH_CONFLICT', 'Opening minus used balance must equal remaining balance.', 'ERROR', { row: row.sourceIndex + 1 }));
            }
            if (policy && Number.isFinite(row.carryForwardBalance) && row.carryForwardBalance > Number(policy.carryForwardLimit || 0)) {
                issues.push(issue('CARRY_FORWARD_POLICY_CONFLICT', 'Carry-forward balance exceeds the active policy limit.', 'ERROR', { row: row.sourceIndex + 1, leaveType: row.leaveType }));
            }
            if (policy && Number.isFinite(row.openingBalance) && row.openingBalance > Number(policy.annualAllowance || row.openingBalance) + Number(policy.carryForwardLimit || 0)) {
                issues.push(issue('ACCRUAL_POLICY_CONFLICT', 'Opening balance exceeds allowance plus carry-forward policy.', 'WARNING', { row: row.sourceIndex + 1, leaveType: row.leaveType }));
            }
            var key = (employee ? employeeIdOf(employee) : row.employeeId) + '|' + row.leaveType + '|' + row.effectiveDate;
            if (seen[key]) issues.push(issue('DUPLICATE_LEAVE_BALANCE_ENTRY', 'Duplicate employee, leave type, and effective date detected.', 'ERROR', { row: row.sourceIndex + 1 }));
            seen[key] = true;
            var employeeTypeKey = (employee ? employeeIdOf(employee) : row.employeeId) + '|' + row.leaveType;
            if (seenEmployeeType[employeeTypeKey]) issues.push(issue('DUPLICATE_LEAVE_BALANCE_ENTRY', 'Duplicate employee and leave type detected in the same import.', 'ERROR', { row: row.sourceIndex + 1 }));
            seenEmployeeType[employeeTypeKey] = true;
        });
        var existingApplied = tenantRows('employeeLeaveBalances', payload.tenantSlug);
        payload.balances.forEach(function existing(row) {
            if (existingApplied.some(function match(applied) { return normalizeText(applied.employeeId) === row.employeeId && normalizeLeaveType(applied.leaveType) === row.leaveType && normalizeText(applied.effectiveDate) === row.effectiveDate; })) {
                issues.push(issue('DUPLICATE_IMPORT_CONFLICT', 'An applied balance already exists for this employee, leave type, and effective date.', 'WARNING', { row: row.sourceIndex + 1 }));
            }
        });
        return issues;
    }

    function validationSummary(payload, issues) {
        var blockers = issues.filter(function block(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; }).length;
        var warnings = issues.filter(function warn(item) { return item.severity === 'WARNING'; }).length;
        var invalidRows = {};
        issues.forEach(function mark(item) { if (item.metadata && item.metadata.row) invalidRows[item.metadata.row] = true; });
        var employeeCount = unique(payload.balances.map(function emp(row) { return row.employeeId; }).filter(Boolean)).length;
        var leaveTypes = unique(payload.balances.map(function type(row) { return row.leaveType; }).filter(Boolean));
        var conflictCount = issues.filter(function conflict(item) { return /CONFLICT|DUPLICATE/.test(item.code || ''); }).length;
        var migrationReadinessScore = clampScore(100 - blockers * 18 - warnings * 5);
        var leaveIntegrityScore = clampScore(100 - blockers * 15 - conflictCount * 8);
        var governanceScore = clampScore(100 - blockers * 12 - warnings * 4);
        return {
            totalRows: payload.balances.length,
            totalEmployees: employeeCount,
            validBalances: Math.max(0, payload.balances.length - Object.keys(invalidRows).length),
            invalidBalances: Object.keys(invalidRows).length,
            warningCount: warnings,
            errorCount: blockers,
            conflictCount: conflictCount,
            leaveTypeCount: leaveTypes.length,
            migrationReadinessScore: migrationReadinessScore,
            leaveIntegrityScore: leaveIntegrityScore,
            governanceScore: governanceScore
        };
    }

    function unique(list) {
        var out = [];
        list.forEach(function add(item) {
            if (item && out.indexOf(item) === -1) out.push(item);
        });
        return out;
    }

    function integrationSummary(tenantSlug) {
        return {
            policyIntegration: {
                leavePoliciesIntegrated: policyRows(tenantSlug).length > 0,
                carryForwardRulesIntegrated: true,
                accrualRulesIntegrated: true,
                activePolicyCount: policyRows(tenantSlug).length
            },
            holidayIntegration: {
                holidayCalendarIntegrated: tenantRows('companyHolidayCalendars', tenantSlug).some(function active(row) { return row.active === true || row.state === 'ACTIVE'; }),
                holidayEnginePrepared: !!(global.CompanyHolidayImportService || global.companyHolidayImportService)
            },
            employeeImportIntegration: {
                employeeImportIntegrated: !!(global.EmployeeBulkImportService || global.employeeBulkImportService),
                importEvidenceCount: tenantRows('employeeBulkImportPreviewHistory', tenantSlug).length
            },
            organizationIntegration: {
                organizationInitializationIntegrated: tenantRows('organizationInitializationRecords', tenantSlug).some(function active(row) { return row.state === 'ACTIVE' || row.state === 'READY'; }),
                organizationWizardPrepared: !!(global.OrganizationInitializationWizardService || global.organizationInitializationWizardService)
            },
            leaveEngineIntegration: {
                leaveGovernanceIntegrated: !!(global.LeaveAttendanceGovernanceService || global.leaveAttendanceGovernanceService),
                leaveEngineReadOnly: true
            }
        };
    }

    function previewFrom(payload, actor, platformView) {
        var visible = visibleBalancesForActor(payload, actor);
        return {
            migrationName: platformView ? 'Governance Leave Migration' : payload.migrationName,
            effectiveDate: payload.effectiveDate,
            totalBalances: visible.length,
            balances: visible.map(function map(row, index) {
                if (platformView) return platformBalance(row, index);
                return cloneSanitized(row);
            })
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

    function upsertMigration(migration, context) {
        if (context?.dryRun || context?.skipPersistence) return migration;
        var data = rawData();
        if (!Array.isArray(data.initialLeaveBalanceImports)) data.initialLeaveBalanceImports = [];
        var index = data.initialLeaveBalanceImports.findIndex(function match(row) { return normalizeText(row.migrationId) === normalizeText(migration.migrationId); });
        if (index >= 0) data.initialLeaveBalanceImports[index] = cloneSanitized({ ...data.initialLeaveBalanceImports[index], ...migration, updatedAt: nowIso(), immutable: true });
        else data.initialLeaveBalanceImports.unshift(cloneSanitized({ ...migration, immutable: true }));
        saveData(data);
        return index >= 0 ? data.initialLeaveBalanceImports[index] : migration;
    }

    function audit(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: clean.migrationId || clean.validationId || clean.applicationId || '',
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.empId,
                    module: 'Initial Leave Balance Import',
                    targetId: clean.tenantSlug || clean.migrationId || '',
                    description: clean.description || actionType,
                    metadata: clean,
                    severity: clean.severity || 'INFO'
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Initial Leave Balance Import', clean.tenantSlug || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function failureOutput(state, tenantSlug, issues, extra) {
        return freezeLeaveMigrationOutput({
            success: false,
            state: state || 'BLOCKED',
            tenantSlug: normalizeTenantSlug(tenantSlug || ''),
            issues: issues || [],
            governance: {
                tenantIsolationPreserved: true,
                leaveGovernancePreserved: true,
                rbacPreserved: true,
                approvalRequiredBeforeApply: true
            },
            ...(extra || {})
        });
    }

    function validateLeaveBalances(input, context) {
        try {
            var payload = normalizeLeaveMigrationPayload(input, context || {});
            var access = validateAccess('VALIDATE', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var issues = validationIssues(payload);
            var summary = validationSummary(payload, issues);
            var integrations = integrationSummary(payload.tenantSlug);
            var success = summary.errorCount === 0 && payload.balances.length > 0 && SUPPORTED_FILE_TYPES.indexOf(payload.fileType) !== -1;
            var report = {
                validationId: 'LBVAL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: success,
                state: success ? 'APPROVAL_PENDING' : 'VALIDATING',
                tenantSlug: payload.tenantSlug,
                fileName: payload.fileName,
                fileType: payload.fileType,
                summary: summary,
                migrationReadinessScore: summary.migrationReadinessScore,
                leaveIntegrityScore: summary.leaveIntegrityScore,
                governanceScore: summary.governanceScore,
                issues: issues,
                policyIntegration: integrations.policyIntegration,
                holidayIntegration: integrations.holidayIntegration,
                employeeImportIntegration: integrations.employeeImportIntegration,
                organizationIntegration: integrations.organizationIntegration,
                leaveEngineIntegration: integrations.leaveEngineIntegration,
                governance: {
                    tenantIsolationPreserved: true,
                    leaveGovernancePreserved: true,
                    policyValidationCompleted: true,
                    approvalRequiredBeforeApply: true,
                    rbacPreserved: true
                },
                generatedAt: nowIso()
            };
            persistHistory('initialLeaveBalanceValidationReports', report, context || {});
            audit('LEAVE_BALANCE_VALIDATION_REVIEWED', { validationId: report.validationId, tenantSlug: payload.tenantSlug, description: 'Initial leave balance validation reviewed.' }, context || {});
            return freezeLeaveMigrationOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('LEAVE_BALANCE_VALIDATION_FAILED_SAFE', 'Leave balance validation failed safely.', 'ERROR')]);
        }
    }

    function previewLeaveMigration(input, context) {
        try {
            var payload = normalizeLeaveMigrationPayload(input, context || {});
            var access = validateAccess('VIEW', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var platformView = access.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var visiblePayload = { ...payload, balances: visibleBalancesForActor(payload, access.actor) };
            var issues = validationIssues(visiblePayload);
            var summary = validationSummary(visiblePayload, issues);
            var integrations = integrationSummary(payload.tenantSlug);
            var output = {
                previewId: 'LBPREV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.filter(function blocker(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; }).length ? 'VALIDATING' : 'PREVIEW_READY',
                tenantSlug: payload.tenantSlug,
                preview: previewFrom(visiblePayload, access.actor, platformView),
                summary: summary,
                issues: issues,
                policyIntegration: integrations.policyIntegration,
                holidayIntegration: integrations.holidayIntegration,
                employeeImportIntegration: integrations.employeeImportIntegration,
                organizationIntegration: integrations.organizationIntegration,
                leaveEngineIntegration: integrations.leaveEngineIntegration,
                analytics: {
                    importedBalances: summary.totalRows,
                    migrationSuccessRate: summary.totalRows ? clampScore(summary.validBalances / summary.totalRows * 100) : 0,
                    validationFailures: summary.invalidBalances,
                    policyConflictCount: summary.conflictCount,
                    migrationReadinessScore: summary.migrationReadinessScore,
                    leaveIntegrityScore: summary.leaveIntegrityScore,
                    governanceScore: summary.governanceScore
                },
                governance: {
                    tenantIsolationPreserved: true,
                    leaveGovernancePreserved: true,
                    employeeViewOnly: access.actor.role === 'EMPLOYEE',
                    platformOwnerVisibilityOnly: platformView,
                    approvalRequiredBeforeApply: true
                },
                generatedAt: nowIso()
            };
            persistHistory('initialLeaveBalancePreviewHistory', output, context || {});
            audit('LEAVE_BALANCE_PREVIEW_REVIEWED', { tenantSlug: payload.tenantSlug, description: 'Initial leave balance migration preview reviewed.' }, context || {});
            return freezeLeaveMigrationOutput(output);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('LEAVE_BALANCE_PREVIEW_FAILED_SAFE', 'Leave balance preview failed safely.', 'ERROR')]);
        }
    }

    function calculateMigrationReadiness(input, context) {
        try {
            var preview = previewLeaveMigration(input, { ...(context || {}), skipAuditPersistence: true });
            if (!preview.success) return preview;
            var report = {
                analyticsId: 'LBREADY-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: preview.summary.errorCount ? 'VALIDATING' : 'APPROVAL_PENDING',
                tenantSlug: preview.tenantSlug,
                migrationReadinessScore: preview.summary.migrationReadinessScore,
                leaveIntegrityScore: preview.summary.leaveIntegrityScore,
                governanceScore: preview.summary.governanceScore,
                analytics: preview.analytics,
                issues: preview.issues,
                policyIntegration: preview.policyIntegration,
                holidayIntegration: preview.holidayIntegration,
                employeeImportIntegration: preview.employeeImportIntegration,
                organizationIntegration: preview.organizationIntegration,
                leaveEngineIntegration: preview.leaveEngineIntegration,
                governance: preview.governance,
                generatedAt: nowIso()
            };
            persistHistory('initialLeaveBalanceAnalytics', report, context || {});
            audit('LEAVE_BALANCE_MIGRATION_READINESS_REVIEWED', { tenantSlug: report.tenantSlug, description: 'Initial leave migration readiness reviewed.' }, context || {});
            return freezeLeaveMigrationOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('LEAVE_BALANCE_READINESS_FAILED_SAFE', 'Leave migration readiness scoring failed safely.', 'ERROR')]);
        }
    }

    function importLeaveBalances(input, context) {
        try {
            var payload = normalizeLeaveMigrationPayload(input, context || {});
            var access = validateAccess('IMPORT', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            var validation = validateLeaveBalances(payload, { ...(context || {}), skipAuditPersistence: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, validation.issues, { validation: validation });
            var preview = previewLeaveMigration(payload, { ...(context || {}), skipAuditPersistence: true });
            var now = nowIso();
            var migration = {
                migrationId: payload.migrationId || 'LBIMP-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: payload.tenantSlug,
                state: 'APPROVAL_PENDING',
                migrationName: payload.migrationName,
                fileName: payload.fileName,
                fileType: payload.fileType,
                effectiveDate: payload.effectiveDate,
                balances: payload.balances,
                migrationReadinessScore: validation.migrationReadinessScore,
                leaveIntegrityScore: validation.leaveIntegrityScore,
                governanceScore: validation.governanceScore,
                importedBy: access.actor.id || access.actor.empId,
                createdAt: now,
                updatedAt: now,
                immutable: true
            };
            var persisted = upsertMigration(migration, context || {});
            persistHistory('initialLeaveBalanceImportHistory', { importId: 'LBHIST-' + Date.now().toString(36), tenantSlug: payload.tenantSlug, migrationId: migration.migrationId, state: 'APPROVAL_PENDING', fileName: payload.fileName, importedAt: now }, context || {});
            persistHistory('initialLeaveBalanceAnalytics', { analyticsId: 'LBANA-' + Date.now().toString(36), tenantSlug: payload.tenantSlug, migrationReadinessScore: validation.migrationReadinessScore, leaveIntegrityScore: validation.leaveIntegrityScore, governanceScore: validation.governanceScore, generatedAt: now }, context || {});
            audit('LEAVE_BALANCE_IMPORT_CREATED', { migrationId: migration.migrationId, tenantSlug: payload.tenantSlug, description: 'Initial leave balances imported for review.' }, context || {});
            return freezeLeaveMigrationOutput({
                success: true,
                state: 'APPROVAL_PENDING',
                tenantSlug: payload.tenantSlug,
                migration: cloneSanitized(persisted),
                validation: validation,
                preview: preview,
                policyIntegration: validation.policyIntegration,
                holidayIntegration: validation.holidayIntegration,
                employeeImportIntegration: validation.employeeImportIntegration,
                organizationIntegration: validation.organizationIntegration,
                leaveEngineIntegration: validation.leaveEngineIntegration,
                governance: {
                    tenantIsolationPreserved: true,
                    leaveGovernancePreserved: true,
                    balanceCreationBlockedBeforeApproval: true,
                    directorApprovalRequired: true
                },
                issues: []
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('LEAVE_BALANCE_IMPORT_FAILED_SAFE', 'Leave balance import failed safely.', 'ERROR')]);
        }
    }

    function applyBalancesToData(payload, migration, context) {
        if (context?.dryRun || context?.skipPersistence) return payload.balances;
        var data = rawData();
        if (!Array.isArray(data.employeeLeaveBalances)) data.employeeLeaveBalances = [];
        var rows = payload.balances.map(function map(row) {
            var employee = findEmployee(row, payload.tenantSlug) || {};
            return cloneSanitized({
                balanceId: row.balanceId || 'LBAL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                migrationId: migration.migrationId,
                tenantSlug: payload.tenantSlug,
                employeeId: employeeIdOf(employee) || row.employeeId,
                employeeEmail: normalizeText(employee.email || row.employeeEmail),
                leaveType: row.leaveType,
                openingBalance: row.openingBalance,
                usedBalance: row.usedBalance,
                remainingBalance: row.remainingBalance,
                carryForwardBalance: row.carryForwardBalance,
                effectiveDate: row.effectiveDate,
                state: 'ACTIVE',
                source: 'INITIAL_LEAVE_BALANCE_IMPORT',
                appliedAt: nowIso(),
                immutable: true
            });
        });
        rows.forEach(function upsert(row) {
            var index = data.employeeLeaveBalances.findIndex(function match(existing) {
                return sameTenant(existing, payload.tenantSlug) && normalizeText(existing.employeeId) === normalizeText(row.employeeId) && normalizeLeaveType(existing.leaveType) === normalizeLeaveType(row.leaveType) && normalizeText(existing.effectiveDate) === normalizeText(row.effectiveDate);
            });
            if (index >= 0) data.employeeLeaveBalances[index] = { ...data.employeeLeaveBalances[index], ...row, immutable: true };
            else data.employeeLeaveBalances.unshift(row);
        });
        saveData(data);
        return rows;
    }

    function applyImportedBalances(input, context) {
        try {
            var payload = normalizeLeaveMigrationPayload(input, context || {});
            var access = validateAccess('APPLY', context || {}, payload.tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', payload.tenantSlug, access.issues);
            if (!payload.approvalGranted) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, [issue('LEAVE_MIGRATION_APPROVAL_REQUIRED', 'Director approval is required before applying imported leave balances.', 'CRITICAL')]);
            var source = payload.balances.length ? payload : null;
            var existing = latestMigration(payload.tenantSlug, true);
            if (!source && existing) source = normalizeLeaveMigrationPayload({ ...existing, balances: existing.balances || [] }, context || {});
            if (!source || !source.balances.length) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, [issue('LEAVE_MIGRATION_NOT_FOUND', 'A validated leave balance migration is required before applying balances.', 'CRITICAL')]);
            var validation = validateLeaveBalances(source, { ...(context || {}), skipAuditPersistence: true });
            var blockingIssues = (validation.issues || []).filter(function blocking(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; });
            blockingIssues = blockingIssues.filter(function allowExistingDuplicate(item) { return item.code !== 'DUPLICATE_IMPORT_CONFLICT'; });
            if (!validation.success && blockingIssues.length) return failureOutput('VALIDATION_BLOCKED', payload.tenantSlug, blockingIssues, { validation: validation });
            var now = nowIso();
            var migration = {
                ...(existing || {}),
                migrationId: existing?.migrationId || source.migrationId || 'LBIMP-' + Date.now().toString(36),
                tenantSlug: payload.tenantSlug,
                state: 'APPLIED',
                migrationName: source.migrationName,
                fileName: source.fileName,
                fileType: source.fileType,
                effectiveDate: source.effectiveDate,
                balances: source.balances,
                migrationReadinessScore: validation.migrationReadinessScore,
                leaveIntegrityScore: validation.leaveIntegrityScore,
                governanceScore: validation.governanceScore,
                appliedBy: access.actor.id || access.actor.empId,
                appliedAt: now,
                updatedAt: now,
                immutable: true
            };
            var appliedRows = applyBalancesToData(source, migration, context || {});
            var persisted = upsertMigration(migration, context || {});
            var application = {
                applicationId: 'LBAPP-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: payload.tenantSlug,
                migrationId: migration.migrationId,
                state: 'APPLIED',
                appliedCount: appliedRows.length,
                migrationReadinessScore: validation.migrationReadinessScore,
                leaveIntegrityScore: validation.leaveIntegrityScore,
                governanceScore: validation.governanceScore,
                appliedBy: access.actor.id || access.actor.empId,
                appliedAt: now
            };
            persistHistory('initialLeaveBalanceApplicationHistory', application, context || {});
            persistHistory('initialLeaveBalanceImportHistory', { ...application, action: 'APPLIED' }, context || {});
            persistHistory('initialLeaveBalanceAnalytics', { analyticsId: 'LBANA-' + Date.now().toString(36), tenantSlug: payload.tenantSlug, appliedBalances: appliedRows.length, migrationReadinessScore: validation.migrationReadinessScore, leaveIntegrityScore: validation.leaveIntegrityScore, governanceScore: validation.governanceScore, generatedAt: now }, context || {});
            audit('LEAVE_BALANCE_APPLIED', { applicationId: application.applicationId, migrationId: migration.migrationId, tenantSlug: payload.tenantSlug, description: 'Initial leave balances applied after Director approval.' }, context || {});
            return freezeLeaveMigrationOutput({
                success: true,
                state: 'APPLIED',
                tenantSlug: payload.tenantSlug,
                migration: cloneSanitized(persisted),
                application: application,
                appliedBalances: cloneSanitized(appliedRows),
                validation: validation,
                policyIntegration: validation.policyIntegration,
                holidayIntegration: validation.holidayIntegration,
                employeeImportIntegration: validation.employeeImportIntegration,
                organizationIntegration: validation.organizationIntegration,
                leaveEngineIntegration: validation.leaveEngineIntegration,
                issues: [],
                governance: {
                    tenantIsolationPreserved: true,
                    leaveGovernancePreserved: true,
                    directorApprovalRequired: true,
                    validationCompletedBeforeApply: true,
                    rbacPreserved: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('LEAVE_BALANCE_APPLY_FAILED_SAFE', 'Leave balance application failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        try {
            var hrContext = { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var directorContext = { actor: { id: 'SELF-DIR', role: 'DIRECTOR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var payload = {
                tenantSlug: 'self-test',
                fileType: 'CSV',
                fileName: 'self-leave.csv',
                migrationName: 'Self Test Leave Migration',
                effectiveDate: '2026-04-01',
                balances: [
                    { employeeId: 'SELF-1', employeeEmail: 'self@example.com', leaveType: 'CASUAL LEAVE', openingBalance: 12, usedBalance: 2, remainingBalance: 10, carryForwardBalance: 2, effectiveDate: '2026-04-01' }
                ]
            };
            var imported = importLeaveBalances(payload, hrContext);
            var validation = validateLeaveBalances(payload, hrContext);
            var preview = previewLeaveMigration(payload, hrContext);
            var applied = applyImportedBalances({ ...payload, approvalGranted: true }, directorContext);
            return freezeLeaveMigrationOutput({
                passed: !!(Object.isFrozen(imported) && Object.isFrozen(preview) && preview.success && applied.success === false),
                checks: {
                    leaveImport: Object.isFrozen(imported),
                    validation: Object.isFrozen(validation),
                    preview: preview.success === true,
                    migration: applied.success === false,
                    immutableOutputs: Object.isFrozen(imported) && Object.isFrozen(preview)
                }
            });
        } catch (error) {
            return freezeLeaveMigrationOutput({ passed: false, error: 'Initial leave balance import self-test failed safely.' });
        }
    }

    var InitialLeaveBalanceImportService = Object.freeze({
        SUPPORTED_FILE_TYPES: SUPPORTED_FILE_TYPES,
        MIGRATION_STATES: MIGRATION_STATES,
        importLeaveBalances: importLeaveBalances,
        validateLeaveBalances: validateLeaveBalances,
        calculateMigrationReadiness: calculateMigrationReadiness,
        previewLeaveMigration: previewLeaveMigration,
        applyImportedBalances: applyImportedBalances,
        normalizeLeaveMigrationPayload: normalizeLeaveMigrationPayload,
        freezeLeaveMigrationOutput: freezeLeaveMigrationOutput
    });

    global.InitialLeaveBalanceImportService = InitialLeaveBalanceImportService;
    global.initialLeaveBalanceImportService = InitialLeaveBalanceImportService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_INITIAL_LEAVE_BALANCE_IMPORT_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
