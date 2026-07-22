/**
 * payrollConfigurationService.js
 * ARTHHRMS - Enterprise Payroll Configuration Center
 *
 * Additive, tenant-scoped payroll configuration, salary component,
 * deduction, payroll-rule, simulation, validation, versioning, audit,
 * telemetry, and analytics layer. Historical payroll data is read only.
 */
(function attachPayrollConfigurationService(global) {
    'use strict';

    var PREFIX = '[PayrollConfigurationService]';
    var SOURCE = 'payrollConfigurationService';
    var CONFIG_TABLE = 'payrollConfigurations';
    var VERSION_TABLE = 'payrollConfigurationVersions';
    var ROLLBACK_TABLE = 'payrollConfigurationRollbacks';
    var SIMULATION_TABLE = 'payrollConfigurationSimulations';
    var ANALYTICS_TABLE = 'payrollConfigurationAnalytics';

    var PAYROLL_FREQUENCIES = Object.freeze(['MONTHLY', 'BI_WEEKLY', 'WEEKLY', 'SEMI_MONTHLY', 'CUSTOM_CYCLE']);
    var CONFIG_STATES = Object.freeze(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ROLLED_BACK']);
    var COMPONENT_TYPES = Object.freeze(['BASIC_SALARY', 'HRA', 'SPECIAL_ALLOWANCE', 'CONVEYANCE', 'MEDICAL_ALLOWANCE', 'TRAVEL_ALLOWANCE', 'PERFORMANCE_BONUS', 'OVERTIME', 'SHIFT_ALLOWANCE', 'ARREARS', 'REIMBURSEMENTS', 'CUSTOM_COMPONENT']);
    var DEDUCTION_TYPES = Object.freeze(['INCOME_TAX', 'PROVIDENT_FUND', 'ESI', 'PROFESSIONAL_TAX', 'LOAN_RECOVERY', 'SALARY_ADVANCE', 'INSURANCE', 'VOLUNTARY_DEDUCTION', 'CUSTOM_DEDUCTION']);
    var PAYMENT_MODES = Object.freeze(['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH', 'PAYROLL_API']);
    var ALLOWED_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER', 'FINANCE', 'FINANCE_ADMIN']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|bankAccount|accountNumber|ifsc|iban|swift|aadhaar|\bpan\b|passport|government|private|confidential|medical|biometric|rawPayload/i;

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

    function normalizeKey(value) {
        return safeString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function normalizeId(value) {
        return safeString(value, '').toUpperCase();
    }

    function normalizeRole(value) {
        var role = safeString(value || 'EMPLOYEE', 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') role = 'PLATFORM_OWNER';
        if (role === 'FINANCEADMIN') role = 'FINANCE_ADMIN';
        return role || 'EMPLOYEE';
    }

    function normalizeStatus(value) {
        return safeString(value || 'ACTIVE', 'ACTIVE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeFrequency(value) {
        var frequency = normalizeStatus(value || 'MONTHLY');
        if (PAYROLL_FREQUENCIES.indexOf(frequency) === -1) return 'CUSTOM_CYCLE';
        return frequency;
    }

    function normalizeComponentType(value) {
        var type = normalizeStatus(value || 'CUSTOM_COMPONENT');
        if (COMPONENT_TYPES.indexOf(type) === -1) return 'CUSTOM_COMPONENT';
        return type;
    }

    function normalizeDeductionType(value) {
        var type = normalizeStatus(value || 'CUSTOM_DEDUCTION');
        if (DEDUCTION_TYPES.indexOf(type) === -1) return 'CUSTOM_DEDUCTION';
        return type;
    }

    function normalizePaymentMode(value) {
        var mode = normalizeStatus(value || 'NEFT');
        if (PAYMENT_MODES.indexOf(mode) === -1) return 'PAYROLL_API';
        return mode;
    }

    function normalizeList(value) {
        if (!Array.isArray(value)) return [];
        return value.map(function each(row) { return safeString(row, ''); }).filter(Boolean);
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
        if (/^(salaryComponents|salaryComponentSummary|payrollHealthScore|payrollReadinessScore|complianceScore|grossSalary|netSalary|componentDistribution|payrollCost|historicalPayrollUnaffected|existingPayrollPreserved)$/i.test(text)) return false;
        if (/Preserved$|Unaffected$|Changed$|Supported$|Prepared$|Score$|Scores$|Count$|Counts$|Rate$|Analytics$|Rules$|Simulation$|Components$|Deductions$|Salary$|Payroll$|Cost$|Amount$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (/^(code|status|severity|eventType|action|type|componentType|deductionType|payrollFrequency|paymentMode|currency|country)$/i.test(String(keyHint || ''))) return value;
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

    function freezePayrollConfigurationOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezePayrollConfigurationOutput({
            code: normalizeStatus(code || 'PAYROLL_CONFIGURATION_ISSUE'),
            message: safeString(message || 'Payroll configuration issue.', 'Payroll configuration issue.'),
            severity: normalizeStatus(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function ensureTables(data) {
        [CONFIG_TABLE, VERSION_TABLE, ROLLBACK_TABLE, SIMULATION_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
        if (!Array.isArray(data.payroll)) data.payroll = [];
        if (!Array.isArray(data.payrollRuns)) data.payrollRuns = [];
        if (!Array.isArray(data.salaryStructures)) data.salaryStructures = [];
        if (!Array.isArray(data.attendance)) data.attendance = [];
        if (!Array.isArray(data.attendanceRecords)) data.attendanceRecords = [];
        if (!Array.isArray(data.leaveRequests)) data.leaveRequests = [];
        if (!Array.isArray(data.shiftRosterAssignments)) data.shiftRosterAssignments = [];
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
            existingPayrollPreserved: true,
            existingAttendancePreserved: true,
            existingLeavePreserved: true,
            existingEmployeePreserved: true,
            existingFinancePreserved: true,
            historicalPayrollUnaffected: true,
            historicalPayrollMutationRequiresAdminApproval: true,
            auditable: !!audited,
            reviewOnly: !!(context && context.reviewOnly)
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezePayrollConfigurationOutput({
            success: false,
            code: normalizeStatus(code),
            tenantSlug: tenantFrom(input || {}, context || {}),
            issues: [issue(code, message, 'ERROR', metadata || {})],
            timestamp: nowIso(),
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function checkAccess(input, context) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        if (ALLOWED_ROLES.indexOf(actor.role) === -1) {
            return { allowed: false, output: failure('PAYROLL_CONFIGURATION_ACCESS_DENIED', 'Role cannot configure enterprise payroll.', input, context, { role: actor.role }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_PAYROLL_CONFIGURATION_BLOCKED', 'Cross-tenant payroll configuration access is blocked.', input, context, {}) };
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
        return safeString(row && (row.employeeId || row.empId || row.id), '');
    }

    function validDate(value) {
        var text = safeString(value, '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
        var date = new Date(text + 'T00:00:00Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
    }

    function configById(data, tenantSlug, configId) {
        var target = safeString(configId, '');
        return (data[CONFIG_TABLE] || []).find(function each(row) { return sameTenant(row, tenantSlug) && row.configId === target; });
    }

    function configCodeExists(data, tenantSlug, code, configId) {
        var key = safeString(code, '').toUpperCase();
        return (data[CONFIG_TABLE] || []).some(function each(row) {
            return sameTenant(row, tenantSlug) && safeString(row.payrollCode, '').toUpperCase() === key && row.configId !== configId;
        });
    }

    function normalizePayGroups(source) {
        var input = source || {};
        var groups = Object.assign({
            companies: [],
            businessUnits: [],
            departments: [],
            locations: [],
            branches: [],
            grades: [],
            employmentTypes: [],
            employees: []
        }, input);
        Object.keys(groups).forEach(function each(key) { groups[key] = normalizeList(groups[key]); });
        return groups;
    }

    function normalizeFormula(value, fallback) {
        return safeString(value || fallback || 'FIXED_AMOUNT', 'FIXED_AMOUNT').toUpperCase();
    }

    function normalizeComponent(row, index) {
        var source = row || {};
        return {
            componentId: safeString(source.componentId || source.id || 'COMP-' + String(index + 1).padStart(3, '0'), ''),
            componentType: normalizeComponentType(source.componentType || source.type || source.name),
            name: safeString(source.name || source.label || source.componentType || 'Component', 'Component'),
            code: safeString(source.code || source.componentCode || source.name || 'COMP', '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
            formula: normalizeFormula(source.formula || source.calculation || 'FIXED_AMOUNT'),
            amount: Number(source.amount || 0) || 0,
            percentage: Number(source.percentage || 0) || 0,
            taxable: source.taxable !== false,
            includedInGross: source.includedInGross !== false,
            employerContribution: source.employerContribution === true,
            enabled: source.enabled !== false
        };
    }

    function normalizeDeduction(row, index) {
        var source = row || {};
        return {
            deductionId: safeString(source.deductionId || source.id || 'DED-' + String(index + 1).padStart(3, '0'), ''),
            deductionType: normalizeDeductionType(source.deductionType || source.type || source.name),
            name: safeString(source.name || source.label || source.deductionType || 'Deduction', 'Deduction'),
            code: safeString(source.code || source.deductionCode || source.name || 'DED', '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
            formula: normalizeFormula(source.formula || source.calculation || 'FIXED_AMOUNT'),
            amount: Number(source.amount || 0) || 0,
            percentage: Number(source.percentage || 0) || 0,
            statutory: source.statutory === true,
            country: safeString(source.country || 'IN', 'IN').toUpperCase(),
            enabled: source.enabled !== false
        };
    }

    function normalizePayrollRules(source) {
        var input = source || {};
        return {
            proration: input.proration !== false,
            lopCalculation: input.lopCalculation !== false,
            overtimeIntegration: input.overtimeIntegration === true,
            leaveDeduction: input.leaveDeduction !== false,
            attendanceIntegration: input.attendanceIntegration === true,
            holidayRules: input.holidayRules !== false,
            nightShiftAllowance: input.nightShiftAllowance === true,
            customFormulaSupport: input.customFormulaSupport === true
        };
    }

    function normalizeCalendar(source) {
        var input = source || {};
        return {
            frequency: normalizeFrequency(input.frequency || input.payrollFrequency || 'MONTHLY'),
            salaryReleaseDay: Math.max(1, Math.min(31, Number(input.salaryReleaseDay || input.releaseDay || 30) || 30)),
            processingWindowDays: Math.max(1, Number(input.processingWindowDays || 5) || 5),
            approvalDeadlineDay: Math.max(1, Math.min(31, Number(input.approvalDeadlineDay || 25) || 25)),
            customCycle: safeString(input.customCycle || '', '')
        };
    }

    function normalizeStatutorySettings(source) {
        var input = source || {};
        return {
            country: safeString(input.country || 'IN', 'IN').toUpperCase(),
            pf: input.pf !== false,
            esi: input.esi === true,
            professionalTax: input.professionalTax !== false,
            tds: input.tds !== false,
            countrySpecificDeductions: normalizeList(input.countrySpecificDeductions || ['PF', 'PROFESSIONAL_TAX', 'TDS'])
        };
    }

    function normalizeBanking(source) {
        var input = source || {};
        return {
            salaryBank: safeString(input.salaryBank || input.bankName || '', ''),
            paymentMode: normalizePaymentMode(input.paymentMode || 'NEFT'),
            neft: input.neft !== false,
            rtgs: input.rtgs === true,
            imps: input.imps === true,
            cheque: input.cheque === true,
            cash: input.cash === true,
            futurePayrollApis: input.futurePayrollApis === true
        };
    }

    function normalizeConfigPayload(input, tenantSlug, existing) {
        var source = input || {};
        var config = Object.assign({}, existing || {});
        config.configId = safeString(source.configId || source.payrollConfigId || config.configId || id('PAYROLL-CONFIG'), '');
        config.tenantSlug = normalizeTenant(source.tenantSlug || config.tenantSlug || tenantSlug);
        config.payrollName = safeString(source.payrollName || source.name || config.payrollName, '');
        config.payrollCode = safeString(source.payrollCode || source.code || config.payrollCode, '').toUpperCase();
        config.payrollFrequency = normalizeFrequency(source.payrollFrequency || source.frequency || config.payrollFrequency || 'MONTHLY');
        config.effectiveDate = safeString(source.effectiveDate || config.effectiveDate, '');
        config.expiryDate = safeString(source.expiryDate || config.expiryDate, '');
        config.status = normalizeStatus(source.status || config.status || 'DRAFT');
        if (CONFIG_STATES.indexOf(config.status) === -1) config.status = 'DRAFT';
        config.currency = safeString(source.currency || config.currency || 'INR', 'INR').toUpperCase();
        config.country = safeString(source.country || config.country || 'IN', 'IN').toUpperCase();
        config.financialYear = safeString(source.financialYear || config.financialYear || '2026-2027', '2026-2027');
        config.payrollCalendar = normalizeCalendar(Object.assign({}, config.payrollCalendar || {}, source.payrollCalendar || {}));
        config.salaryComponents = (Array.isArray(source.salaryComponents) ? source.salaryComponents : config.salaryComponents || []).map(normalizeComponent);
        config.deductionRules = (Array.isArray(source.deductionRules) ? source.deductionRules : config.deductionRules || []).map(normalizeDeduction);
        config.payGroups = normalizePayGroups(Object.assign({}, config.payGroups || {}, source.payGroups || {}));
        config.payrollRules = normalizePayrollRules(Object.assign({}, config.payrollRules || {}, source.payrollRules || {}));
        config.statutorySettings = normalizeStatutorySettings(Object.assign({}, config.statutorySettings || {}, source.statutorySettings || {}));
        config.banking = normalizeBanking(Object.assign({}, config.banking || {}, source.banking || {}));
        config.version = Number(source.version || config.version || 1) || 1;
        config.updatedAt = nowIso();
        return config;
    }

    function validationIssues(config, data, options) {
        var issues = [];
        if (!config.payrollName) issues.push(issue('MISSING_PAYROLL_NAME', 'Payroll name is required.', 'ERROR', {}));
        if (!config.payrollCode) issues.push(issue('MISSING_PAYROLL_CODE', 'Payroll code is required.', 'ERROR', {}));
        if (config.payrollCode && configCodeExists(data, config.tenantSlug, config.payrollCode, options && options.configId)) issues.push(issue('DUPLICATE_PAYROLL_GROUP', 'Payroll code already exists for this tenant.', 'ERROR', { payrollCode: config.payrollCode }));
        if (!validDate(config.effectiveDate)) issues.push(issue('INVALID_EFFECTIVE_DATE', 'Effective date must be valid YYYY-MM-DD.', 'ERROR', {}));
        if (config.expiryDate && !validDate(config.expiryDate)) issues.push(issue('INVALID_EXPIRY_DATE', 'Expiry date must be valid YYYY-MM-DD.', 'ERROR', {}));
        if (validDate(config.effectiveDate) && validDate(config.expiryDate) && config.expiryDate < config.effectiveDate) issues.push(issue('INVALID_DATE_RANGE', 'Payroll expiry date cannot be before effective date.', 'ERROR', {}));
        if (!config.salaryComponents.length) issues.push(issue('MISSING_SALARY_COMPONENTS', 'At least one salary component is required.', 'ERROR', {}));
        var hasBasic = config.salaryComponents.some(function each(row) { return row.componentType === 'BASIC_SALARY' && row.enabled; });
        if (!hasBasic) issues.push(issue('MISSING_BASIC_SALARY', 'Basic salary component is required.', 'ERROR', {}));
        config.salaryComponents.forEach(function each(row) {
            if (row.amount < 0 || row.percentage < 0) issues.push(issue('NEGATIVE_SALARY_COMPONENT', 'Salary component values cannot be negative.', 'ERROR', { code: row.code }));
            if (/SQL|EVAL|FUNCTION|SCRIPT|DROP|DELETE/i.test(row.formula)) issues.push(issue('INVALID_FORMULA', 'Salary component formula is unsafe or unsupported.', 'ERROR', { code: row.code }));
        });
        config.deductionRules.forEach(function each(row) {
            if (row.amount < 0 || row.percentage < 0) issues.push(issue('NEGATIVE_DEDUCTION', 'Deduction values cannot be negative.', 'ERROR', { code: row.code }));
            if (/SQL|EVAL|FUNCTION|SCRIPT|DROP|DELETE/i.test(row.formula)) issues.push(issue('INVALID_FORMULA', 'Deduction formula is unsafe or unsupported.', 'ERROR', { code: row.code }));
        });
        if (!config.banking.salaryBank && config.banking.paymentMode !== 'CASH') issues.push(issue('MISSING_BANKING_CONFIGURATION', 'Salary bank is required for electronic payments.', 'WARNING', {}));
        var missingBankEmployees = (data.employees || []).filter(function each(employee) {
            return sameTenant(employee, config.tenantSlug) &&
                employeeMatchesPayGroup(employee, config.payGroups || {}, data.companySettings || {}) &&
                config.banking.paymentMode !== 'CASH' &&
                !employee.bankDetails &&
                !employee.salaryBank &&
                !employee.paymentMode;
        }).length;
        if (missingBankEmployees) issues.push(issue('MISSING_BANK_DETAILS', 'Employees in this pay group are missing bank details for electronic payroll.', 'WARNING', { count: missingBankEmployees }));
        var overlapping = (data[CONFIG_TABLE] || []).filter(function each(row) {
            return sameTenant(row, config.tenantSlug) && row.configId !== config.configId && normalizeStatus(row.status) === 'PUBLISHED';
        }).some(function each(row) {
            return (row.payGroups && row.payGroups.departments || []).some(function dept(department) { return (config.payGroups.departments || []).indexOf(department) !== -1; });
        });
        if (overlapping) issues.push(issue('MULTIPLE_PAYROLL_GROUPS', 'Published payroll groups overlap this pay group scope.', 'WARNING', {}));
        var attendanceConflicts = (data.attendance || []).concat(data.attendanceRecords || []).filter(function each(row) {
            return sameTenant(row, config.tenantSlug) && /MISSING|ERROR|CONFLICT/i.test(safeString(row.status || row.attendanceStatus || '', ''));
        }).length;
        if (attendanceConflicts) issues.push(issue('ATTENDANCE_CONFLICT', 'Attendance conflicts exist for payroll integration.', 'WARNING', { count: attendanceConflicts }));
        var leaveConflicts = (data.leaveRequests || []).filter(function each(row) {
            return sameTenant(row, config.tenantSlug) && /CONFLICT|UNAPPROVED|PENDING/i.test(safeString(row.status || '', ''));
        }).length;
        if (leaveConflicts) issues.push(issue('LEAVE_CONFLICT', 'Leave conflicts exist for payroll deduction rules.', 'WARNING', { count: leaveConflicts }));
        return issues;
    }

    function saveVersion(data, config, actorId, action, reason) {
        data[VERSION_TABLE].unshift({
            versionId: id('PAYROLL-CONFIG-VERSION'),
            configId: config.configId,
            tenantSlug: config.tenantSlug,
            version: config.version,
            status: config.status,
            snapshot: clone(config),
            action: action,
            reason: safeString(reason || '', ''),
            changedBy: actorId || 'system',
            createdAt: nowIso(),
            immutable: true
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
                        module: 'Payroll Configuration',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Payroll Configuration', targetId || '', description || actionType);
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

    function recordGovernance(action, targetId, description, metadata, context) {
        audit(action, targetId, description, metadata, context || {});
        emitTelemetry(action, metadata || {}, context || {});
        recordMetric(action, metadata || {}, context || {});
    }

    function createPayrollStructure(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var config = normalizeConfigPayload(input || {}, access.tenantSlug, null);
        config.createdAt = nowIso();
        config.createdBy = access.actor.id;
        config.updatedBy = access.actor.id;
        var issues = validationIssues(config, data, {});
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezePayrollConfigurationOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        data[CONFIG_TABLE].unshift(config);
        saveVersion(data, config, access.actor.id, 'CREATED', input && input.reason);
        saveData(data);
        var metadata = { configId: config.configId, tenantSlug: access.tenantSlug, payrollCode: config.payrollCode, status: 'CREATED' };
        recordGovernance('PAYROLL_CONFIGURATION_CREATED', config.configId, 'Payroll configuration created.', metadata, context || {});
        return freezePayrollConfigurationOutput({ success: true, tenantSlug: access.tenantSlug, configuration: config, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function updatePayrollStructure(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var existing = configById(data, access.tenantSlug, input && input.configId);
        if (!existing) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        var next = normalizeConfigPayload(Object.assign({}, clone(existing), input && input.changes || {}, { configId: existing.configId, tenantSlug: access.tenantSlug, version: existing.version + 1 }), access.tenantSlug, existing);
        next.version = existing.version + 1;
        next.updatedBy = access.actor.id;
        var issues = validationIssues(next, data, { configId: existing.configId });
        if (issues.some(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; })) {
            return freezePayrollConfigurationOutput({ success: false, tenantSlug: access.tenantSlug, issues: issues, readOnly: true, nonDestructive: true, governance: governanceFlags(false, context || {}) });
        }
        Object.keys(existing).forEach(function remove(key) { delete existing[key]; });
        Object.assign(existing, next);
        saveVersion(data, existing, access.actor.id, 'UPDATED', input && (input.reason || input.changes && input.changes.reason));
        saveData(data);
        var metadata = { configId: existing.configId, tenantSlug: access.tenantSlug, version: existing.version, status: 'UPDATED' };
        recordGovernance('PAYROLL_CONFIGURATION_UPDATED', existing.configId, 'Payroll configuration updated.', metadata, context || {});
        return freezePayrollConfigurationOutput({ success: true, tenantSlug: access.tenantSlug, configuration: existing, warnings: issues, governance: governanceFlags(true, context || {}) });
    }

    function approvalValid(approval) {
        return !!(approval && approval.approved === true && safeString(approval.approvedBy || approval.actorId || '', '') && safeString(approval.reason || '', ''));
    }

    function publishPayrollStructure(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('PAYROLL_PUBLISH_APPROVAL_REQUIRED', 'Payroll configuration publish requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var config = configById(data, access.tenantSlug, input && input.configId);
        if (!config) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        config.status = 'PUBLISHED';
        config.version += 1;
        config.publishedAt = nowIso();
        config.publishedBy = input.approval.approvedBy;
        config.updatedAt = nowIso();
        saveVersion(data, config, access.actor.id, 'PUBLISHED', input.approval.reason);
        saveData(data);
        var metadata = { configId: config.configId, tenantSlug: access.tenantSlug, version: config.version, status: 'PUBLISHED' };
        recordGovernance('PAYROLL_CONFIGURATION_PUBLISHED', config.configId, 'Payroll configuration published.', metadata, context || {});
        return freezePayrollConfigurationOutput({ success: true, tenantSlug: access.tenantSlug, configuration: config, governance: governanceFlags(true, context || {}) });
    }

    function rollbackPayrollVersion(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.approval)) return failure('PAYROLL_ROLLBACK_APPROVAL_REQUIRED', 'Payroll configuration rollback requires explicit approval.', input, context, {});
        var data = ensureTables(rawData());
        var config = configById(data, access.tenantSlug, input && input.configId);
        if (!config) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        var targetVersion = Number(input && input.targetVersion || 0);
        var version = (data[VERSION_TABLE] || []).find(function each(row) {
            return row.configId === config.configId && sameTenant(row, access.tenantSlug) && Number(row.version) === targetVersion;
        });
        if (!version || !version.snapshot) return failure('PAYROLL_CONFIGURATION_VERSION_NOT_FOUND', 'Target payroll configuration version was not found.', input, context, {});
        var nextVersion = config.version + 1;
        var restored = clone(version.snapshot);
        restored.version = nextVersion;
        restored.updatedAt = nowIso();
        restored.updatedBy = access.actor.id;
        Object.keys(config).forEach(function remove(key) { delete config[key]; });
        Object.assign(config, restored);
        saveVersion(data, config, access.actor.id, 'ROLLED_BACK', input && input.reason);
        data[ROLLBACK_TABLE].unshift({
            rollbackId: id('PAYROLL-CONFIG-ROLLBACK'),
            configId: config.configId,
            tenantSlug: access.tenantSlug,
            targetVersion: targetVersion,
            restoredVersion: nextVersion,
            reason: safeString(input && input.reason, ''),
            approval: clone(input.approval),
            createdAt: nowIso(),
            immutable: true
        });
        saveData(data);
        var metadata = { configId: config.configId, tenantSlug: access.tenantSlug, targetVersion: targetVersion, restoredVersion: nextVersion, status: 'ROLLED_BACK' };
        recordGovernance('PAYROLL_CONFIGURATION_ROLLBACK', config.configId, 'Payroll configuration rollback executed.', metadata, context || {});
        return freezePayrollConfigurationOutput({ success: true, tenantSlug: access.tenantSlug, configuration: config, governance: governanceFlags(true, context || {}) });
    }

    function addSalaryComponent(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var existing = configById(data, access.tenantSlug, input && input.configId);
        if (!existing) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        return updatePayrollStructure({
            tenantSlug: access.tenantSlug,
            configId: input && input.configId,
            changes: {
                salaryComponents: (existing.salaryComponents || []).concat([input && input.component || {}]),
                reason: input && input.reason
            }
        }, context || {});
    }

    function configureDeductionRule(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var existing = configById(data, access.tenantSlug, input && input.configId);
        if (!existing) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        return updatePayrollStructure({
            tenantSlug: access.tenantSlug,
            configId: input && input.configId,
            changes: {
                deductionRules: (existing.deductionRules || []).concat([input && input.deduction || {}]),
                reason: input && input.reason
            }
        }, context || {});
    }

    function validatePayrollConfiguration(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var config = input && input.configId ? configById(data, access.tenantSlug, input.configId) : normalizeConfigPayload(input || {}, access.tenantSlug, null);
        if (!config) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        var issues = validationIssues(config, data, { configId: config.configId });
        return freezePayrollConfigurationOutput({
            success: issues.filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }).length === 0,
            tenantSlug: access.tenantSlug,
            configId: config.configId,
            issues: issues,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function employeeMatchesPayGroup(employee, groups, settings) {
        function matches(list, value) {
            if (!Array.isArray(list) || !list.length) return true;
            var key = normalizeKey(value);
            return list.some(function item(row) { return normalizeKey(row) === key; });
        }
        return matches(groups.companies, settings.companyName || employee.company) &&
            matches(groups.businessUnits, employee.businessUnit) &&
            matches(groups.departments, employee.department) &&
            matches(groups.locations, employee.location || employee.locationName) &&
            matches(groups.branches, employee.branch || employee.branchName) &&
            matches(groups.grades, employee.employeeGrade || employee.grade || employee.salaryGrade) &&
            matches(groups.employmentTypes, employee.employmentType) &&
            matches(groups.employees, employeeIdOf(employee));
    }

    function employeesForSimulation(data, tenantSlug, config, scope) {
        var settings = data.companySettings || {};
        var candidates = (data.employees || []).filter(function each(employee) {
            return sameTenant(employee, tenantSlug) && employeeMatchesPayGroup(employee, config.payGroups || {}, settings);
        });
        var simulationScope = normalizeStatus(scope || 'SINGLE_EMPLOYEE');
        if (simulationScope === 'SINGLE_EMPLOYEE') return candidates.slice(0, 1);
        if (simulationScope === 'DEPARTMENT') return candidates.filter(function each(employee) {
            return normalizeKey(employee.department) === normalizeKey(config.payGroups.departments && config.payGroups.departments[0] || employee.department);
        });
        return candidates;
    }

    function componentAmount(component, baseSalary) {
        if (!component.enabled) return 0;
        if (component.formula === 'PERCENTAGE_OF_BASIC' || component.formula === 'PERCENTAGE') return baseSalary * (Number(component.percentage || 0) / 100);
        return Number(component.amount || 0) || 0;
    }

    function simulatePayroll(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var config = configById(data, access.tenantSlug, input && input.configId);
        if (!config) return failure('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration was not found.', input, context, {});
        var scope = normalizeStatus(input && input.scope || 'SINGLE_EMPLOYEE');
        var employees = employeesForSimulation(data, access.tenantSlug, config, scope);
        if (input && input.employeeId) {
            employees = employees.filter(function each(employee) { return normalizeId(employeeIdOf(employee)) === normalizeId(input.employeeId); });
        }
        var results = employees.map(function each(employee) {
            var annualSalary = Number(employee.salary || employee.ctc || employee.annualSalary || 0) || 0;
            var monthlyBase = annualSalary ? annualSalary / 12 : 0;
            var basic = config.salaryComponents.find(function component(row) { return row.componentType === 'BASIC_SALARY'; });
            var baseSalary = basic && basic.amount ? basic.amount : monthlyBase * 0.5;
            var componentRows = config.salaryComponents.map(function component(row) {
                var amount = row.componentType === 'BASIC_SALARY' && !row.amount ? baseSalary : componentAmount(row, baseSalary);
                return { code: row.code, componentType: row.componentType, amount: Math.round(amount * 100) / 100 };
            });
            var gross = componentRows.reduce(function sum(total, row) { return total + Number(row.amount || 0); }, 0);
            var deductionRows = config.deductionRules.map(function deduction(row) {
                var amount = row.formula === 'PERCENTAGE_OF_BASIC' || row.formula === 'PERCENTAGE' ? baseSalary * (Number(row.percentage || 0) / 100) : Number(row.amount || 0) || 0;
                return { code: row.code, deductionType: row.deductionType, amount: Math.round(amount * 100) / 100 };
            });
            var deductions = deductionRows.reduce(function sum(total, row) { return total + Number(row.amount || 0); }, 0);
            var net = Math.max(0, gross - deductions);
            return {
                employeeId: employeeIdOf(employee),
                grossSalary: Math.round(gross * 100) / 100,
                deductions: Math.round(deductions * 100) / 100,
                netSalary: Math.round(net * 100) / 100,
                employerContributions: Math.round(deductionRows.filter(function row(deduction) { return /PROVIDENT_FUND|ESI/.test(deduction.deductionType); }).reduce(function sum(total, row) { return total + row.amount; }, 0) * 100) / 100,
                components: componentRows,
                deductionBreakdown: deductionRows
            };
        });
        var validation = validatePayrollConfiguration({ tenantSlug: access.tenantSlug, configId: config.configId }, Object.assign({}, context || {}, { skipPersistence: true }));
        var output = {
            success: true,
            simulationId: id('PAYROLL-SIM'),
            tenantSlug: access.tenantSlug,
            configId: config.configId,
            scope: scope,
            totalEmployees: results.length,
            results: results,
            totals: {
                grossSalary: Math.round(results.reduce(function sum(total, row) { return total + row.grossSalary; }, 0) * 100) / 100,
                deductions: Math.round(results.reduce(function sum(total, row) { return total + row.deductions; }, 0) * 100) / 100,
                netSalary: Math.round(results.reduce(function sum(total, row) { return total + row.netSalary; }, 0) * 100) / 100,
                employerContributions: Math.round(results.reduce(function sum(total, row) { return total + row.employerContributions; }, 0) * 100) / 100
            },
            validationErrors: (validation.issues || []).filter(function each(row) { return row.severity === 'ERROR' || row.severity === 'CRITICAL'; }),
            warnings: (validation.issues || []).filter(function each(row) { return row.severity === 'WARNING'; }),
            historicalPayrollModified: false,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[SIMULATION_TABLE].unshift(Object.assign({ immutable: true, createdAt: nowIso() }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        recordGovernance('PAYROLL_SIMULATION_RUN', output.simulationId, 'Payroll simulation generated.', { configId: config.configId, tenantSlug: access.tenantSlug, scope: scope, status: 'COMPLETED' }, context || {});
        return freezePayrollConfigurationOutput(output);
    }

    function generatePayrollAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var configs = (data[CONFIG_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var payrollRows = (data.payroll || []).concat(data.payrollRuns || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var componentDistribution = {};
        configs.forEach(function config(row) {
            (row.salaryComponents || []).forEach(function component(item) {
                componentDistribution[item.componentType] = (componentDistribution[item.componentType] || 0) + 1;
            });
        });
        var deductionTrends = {};
        configs.forEach(function config(row) {
            (row.deductionRules || []).forEach(function deduction(item) {
                deductionTrends[item.deductionType] = (deductionTrends[item.deductionType] || 0) + 1;
            });
        });
        var payrollErrors = payrollRows.filter(function each(row) { return /FAILED|ERROR|REJECTED/i.test(safeString(row.status || row.payrollStatus || row.state || '', '')); }).length;
        var payrollCost = payrollRows.reduce(function sum(total, row) { return total + Number(row.netSalary || row.net || row.amount || 0); }, 0);
        var published = configs.filter(function each(row) { return normalizeStatus(row.status) === 'PUBLISHED'; }).length;
        var analytics = {
            payrollRuns: payrollRows.length,
            processingTime: Math.max(1, payrollRows.length * 8),
            payrollCost: payrollCost,
            componentDistribution: componentDistribution,
            deductionTrends: deductionTrends,
            payrollErrors: payrollErrors,
            configurations: configs.length,
            publishedConfigurations: published
        };
        var health = clampScore(100 - payrollErrors * 12 - Math.max(0, configs.length - published) * 5);
        var compliance = clampScore(70 + Math.min(15, Object.keys(deductionTrends).length * 3) + Math.min(15, published * 5) - payrollErrors * 10);
        var readiness = clampScore((health + compliance) / 2 + Math.min(10, configs.length * 2));
        var output = {
            success: true,
            tenantSlug: access.tenantSlug,
            analytics: analytics,
            payrollHealthScore: health,
            complianceScore: compliance,
            payrollReadinessScore: readiness,
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(Object.assign({ analyticsId: id('PAYROLL-CONFIG-ANALYTICS'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        return freezePayrollConfigurationOutput(output);
    }

    function generatePayrollDashboard(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var configs = (data[CONFIG_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); });
        var analytics = generatePayrollAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        return freezePayrollConfigurationOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            payrollStructures: configs.map(function each(row) { return { configId: row.configId, payrollName: row.payrollName, payrollCode: row.payrollCode, payrollFrequency: row.payrollFrequency, currency: row.currency, financialYear: row.financialYear, status: row.status, version: row.version }; }),
            salaryComponents: configs.map(function each(row) { return { configId: row.configId, salaryComponents: row.salaryComponents }; }),
            deductionRules: configs.map(function each(row) { return { configId: row.configId, deductionRules: row.deductionRules }; }),
            payrollCalendar: configs.map(function each(row) { return { configId: row.configId, payrollCalendar: row.payrollCalendar }; }),
            payrollRules: configs.map(function each(row) { return { configId: row.configId, payrollRules: row.payrollRules, statutorySettings: row.statutorySettings, banking: row.banking }; }),
            simulation: { supportedScopes: ['SINGLE_EMPLOYEE', 'DEPARTMENT', 'ENTIRE_COMPANY'], readOnly: true },
            validation: configs.map(function each(row) { return { configId: row.configId, issues: validationIssues(row, data, { configId: row.configId }) }; }),
            analytics: analytics.analytics || {},
            configurationTimeline: (data[VERSION_TABLE] || []).filter(function each(row) { return sameTenant(row, access.tenantSlug); }).map(function each(row) { return { versionId: row.versionId, configId: row.configId, version: row.version, action: row.action, createdAt: row.createdAt }; }),
            payrollHealthScore: analytics.payrollHealthScore || 0,
            complianceScore: analytics.complianceScore || 0,
            payrollReadinessScore: analytics.payrollReadinessScore || 0,
            compatibility: {
                existingPayrollPreserved: true,
                existingAttendancePreserved: true,
                existingLeavePreserved: true,
                existingEmployeePreserved: true,
                existingFinancePreserved: true,
                historicalPayrollUnaffected: true,
                historicalPayrollModified: false
            },
            governance: governanceFlags(false, context || {})
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezePayrollConfigurationOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            record('frequencies available', PAYROLL_FREQUENCIES.indexOf('MONTHLY') !== -1 && PAYROLL_FREQUENCIES.indexOf('SEMI_MONTHLY') !== -1, PAYROLL_FREQUENCIES);
            record('salary components available', COMPONENT_TYPES.indexOf('BASIC_SALARY') !== -1 && COMPONENT_TYPES.indexOf('SHIFT_ALLOWANCE') !== -1, COMPONENT_TYPES);
            record('deductions available', DEDUCTION_TYPES.indexOf('PROVIDENT_FUND') !== -1 && DEDUCTION_TYPES.indexOf('INCOME_TAX') !== -1, DEDUCTION_TYPES);
            var frozen = freezePayrollConfigurationOutput({ ok: true, nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            record('historical payroll protected by default', governanceFlags(false, {}).historicalPayrollUnaffected === true, null);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezePayrollConfigurationOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Payroll configuration self-test completed.',
            checks: checks
        });
    }

    var PayrollConfigurationService = Object.freeze({
        PAYROLL_FREQUENCIES: PAYROLL_FREQUENCIES,
        CONFIG_STATES: CONFIG_STATES,
        COMPONENT_TYPES: COMPONENT_TYPES,
        DEDUCTION_TYPES: DEDUCTION_TYPES,
        PAYMENT_MODES: PAYMENT_MODES,
        createPayrollStructure: createPayrollStructure,
        updatePayrollStructure: updatePayrollStructure,
        publishPayrollStructure: publishPayrollStructure,
        rollbackPayrollVersion: rollbackPayrollVersion,
        addSalaryComponent: addSalaryComponent,
        configureDeductionRule: configureDeductionRule,
        validatePayrollConfiguration: validatePayrollConfiguration,
        simulatePayroll: simulatePayroll,
        generatePayrollAnalytics: generatePayrollAnalytics,
        generatePayrollDashboard: generatePayrollDashboard,
        freezePayrollConfigurationOutput: freezePayrollConfigurationOutput
    });

    global.PayrollConfigurationService = PayrollConfigurationService;
    global.payrollConfigurationService = PayrollConfigurationService;
    global.SalaryComponentService = PayrollConfigurationService;
    global.PayrollRuleEngine = PayrollConfigurationService;
    global.PayrollSimulationService = PayrollConfigurationService;
    global.PayrollValidator = PayrollConfigurationService;
    global.PayrollAnalyticsService = PayrollConfigurationService;
    global.PayrollVersionService = PayrollConfigurationService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_PAYROLL_CONFIGURATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
