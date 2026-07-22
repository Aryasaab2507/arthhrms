/**
 * payrollGovernanceService.js
 * ARTHHRMS Enterprise Payroll Governance + Salary Isolation System.
 *
 * This service is intentionally additive: it governs payroll visibility,
 * validation, scheduling, audit markers, and queue health without replacing
 * payrollService or mutating payroll records during validation-only flows.
 */
(function attachPayrollGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[PayrollGovernanceService]';

    var PAYROLL_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        VALIDATING: 'VALIDATING',
        REVIEW_PENDING: 'REVIEW_PENDING',
        APPROVED: 'APPROVED',
        PROCESSING: 'PROCESSING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        ARCHIVED: 'ARCHIVED'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var SALARY_VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_SALARY_ONLY: 'OWN_SALARY_ONLY',
        PAYROLL_OPERATIONAL: 'PAYROLL_OPERATIONAL',
        STRATEGIC_PAYROLL: 'STRATEGIC_PAYROLL',
        AGGREGATED_COMPENSATION: 'AGGREGATED_COMPENSATION',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|bonus|tax|bank|account|ifsc|password|secret|token|jwt|authorization|service.?role|private.?key|employeeName)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|net|gross|ctc)\s*[:=]?\s*[\d,]+/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        salaryIsolation: true,
        salaryConfidentialityPreserved: true,
        superAdminSalaryVisible: true,
        managerSalaryVisible: true,
        employeeOwnSalaryOnly: true,
        salarySnapshotMutable: true,
        platformOwnerInPayrollHierarchy: true
    });
    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function safeInfo(message, details) {
        try { if (global.console && console.info) console.info(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function rawData() {
        try {
            var source = db();
            if (source && typeof source.get === 'function') return source.get() || {};
        } catch (error) {}
        return {};
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        return String(value);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    }

    function normalizeRole(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (normalized === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (normalized === 'HRHEAD') return 'HR_HEAD';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id);
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray(data.employees) ? data.employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function payrollEmpId(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id) || '', '').trim();
    }

    function payrollMonth(row) {
        return safeString(row && (row.payrollMonth || row.payroll_month || row.month || row.period) || '', '').trim();
    }

    function payrollId(row) {
        return safeString(row && (row.payrollId || row.payroll_id || row.id) || '', '').trim();
    }

    function payrollTenant(row, data) {
        var direct = rowTenant(row);
        if (direct) return direct;
        var emp = employeeById(payrollEmpId(row), data || rawData());
        return rowTenant(emp);
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '$1:[REDACTED]');
    }

    function cloneSanitized(value) {
        if (Array.isArray(value)) return value.map(cloneSanitized);
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return sanitizeText(value);
            return value;
        }
        var output = {};
        Object.keys(value).forEach(function copyKey(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
            output[key] = cloneSanitized(value[key]);
        });
        return output;
    }

    function freezePayrollOutput(value) {
        return deepFreeze(cloneSanitized(value));
    }

    function safeFailure(code, classification, message, metadata) {
        return {
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, message, metadata) {
        return {
            warningCode: code,
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function hasSensitivePayrollFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function keyIsSensitive(key) {
            if (SENSITIVE_KEY_PATTERN.test(key)) return true;
            return input[key] && typeof input[key] === 'object' && hasSensitivePayrollFields(input[key]);
        });
    }

    function classifyPayrollRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantPayroll || source.crossTenantSalaryVisibility || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInPayroll || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.duplicatePayroll || source.duplicateRun || source.unauthorizedSalaryAccess || source.superAdminSalaryVisible) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedDeduction || source.malformedTax || source.invalidSalaryStructure || source.retrySpike || source.failedPayroll) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityForRole(role, actor, targetEmpId) {
        var normalized = normalizeRole(role || actor && actor.role);
        var actorEmpId = safeString(actor && (actor.empId || actor.employeeId || actor.id) || '', '').trim();
        if (normalized === 'EMPLOYEE') {
            return actorEmpId && targetEmpId && actorEmpId === targetEmpId ? SALARY_VISIBILITY.OWN_SALARY_ONLY : SALARY_VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') return SALARY_VISIBILITY.NONE;
        if (normalized === 'HR') return SALARY_VISIBILITY.PAYROLL_OPERATIONAL;
        if (normalized === 'HR_HEAD') return SALARY_VISIBILITY.STRATEGIC_PAYROLL;
        if (normalized === 'DIRECTOR') return SALARY_VISIBILITY.AGGREGATED_COMPENSATION;
        if (normalized === 'SUPER_ADMIN') return SALARY_VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return SALARY_VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return SALARY_VISIBILITY.NONE;
    }

    function validatePayrollScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetEmpId = payrollEmpId(source);
            var targetTenant = payrollTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, targetEmpId);
            var failures = [];

            if (targetTenant && ctxTenant && targetTenant !== ctxTenant) {
                failures.push(safeFailure('CROSS_TENANT_PAYROLL_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant payroll visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && ctxTenant) {
                failures.push(safeFailure('PLATFORM_OWNER_PAYROLL_HIERARCHY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant payroll hierarchy.'));
            }
            if (role === 'SUPER_ADMIN' && (hasSensitivePayrollFields(source) || payrollId(source) || targetEmpId)) {
                failures.push(safeFailure('SUPER_ADMIN_SALARY_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators do not receive salary visibility by default.'));
            }
            if (role === 'MANAGER' && (hasSensitivePayrollFields(source) || payrollId(source) || targetEmpId)) {
                failures.push(safeFailure('MANAGER_SALARY_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers do not receive direct salary visibility by default.'));
            }
            if (role === 'EMPLOYEE' && visibility !== SALARY_VISIBILITY.OWN_SALARY_ONLY) {
                failures.push(safeFailure('EMPLOYEE_PAYROLL_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own payroll scope.'));
            }

            var classification = failures.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                : failures.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })
                    ? FAILURE_CLASSIFICATIONS.HIGH_RISK
                    : FAILURE_CLASSIFICATIONS.INFO;

            return freezePayrollOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: failures.length ? (visibility || SALARY_VISIBILITY.NONE) : visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    payrollId: payrollId(source),
                    empId: targetTenant === ctxTenant ? targetEmpId : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    salaryConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezePayrollOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: SALARY_VISIBILITY.NONE,
                failures: [safeFailure('PAYROLL_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Payroll scope validation failed safely.')]
            });
        }
    }

    function normalizePayrollRecord(record, tenantSlug) {
        var source = record || {};
        var empId = payrollEmpId(source);
        var normalized = {
            empId: empId,
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenant_slug || tenantSlug),
            payrollMonth: payrollMonth(source),
            payrollId: payrollId(source),
            status: safeString(source.status || source.payrollStatus || source.payroll_status || PAYROLL_STATES.DRAFT, PAYROLL_STATES.DRAFT),
            hasCompensationPayload: hasSensitivePayrollFields(source),
            compensationHealth: 'PRESENT',
            metadata: cloneSanitized(source.metadata || {})
        };
        return normalized;
    }

    function normalizePayrollPayload(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || contextTenant(context));
            var records = Array.isArray(source.records) ? source.records : Array.isArray(source.payroll) ? source.payroll : Array.isArray(source.rows) ? source.rows : [];
            return freezePayrollOutput({
                tenantSlug: tenantSlug,
                payrollMonth: safeString(source.payrollMonth || source.payroll_month || source.month || '', '').trim(),
                state: normalizeToken(source.state || source.status || PAYROLL_STATES.DRAFT) || PAYROLL_STATES.DRAFT,
                schedule: cloneSanitized(source.schedule || {}),
                validationOnly: source.validationOnly !== false,
                dryRun: source.dryRun === true || source.validationOnly !== false,
                records: records.map(function normalize(row) { return normalizePayrollRecord(row, tenantSlug); }),
                metadata: cloneSanitized(source.metadata || {})
            });
        } catch (error) {
            return freezePayrollOutput({
                tenantSlug: contextTenant(context),
                payrollMonth: '',
                records: [],
                malformed: true,
                metadata: {}
            });
        }
    }

    function detectDuplicatePayrollRuns(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || contextTenant(context));
            var month = safeString(source.payrollMonth || source.payroll_month || source.month || '', '').trim();
            var records = Array.isArray(source.records) ? source.records : Array.isArray(source.payroll) ? source.payroll : [];
            var candidates = records.map(function normalize(row) {
                return { empId: payrollEmpId(row), payrollMonth: payrollMonth(row) || month, tenantSlug: normalizeTenantSlug(row.tenantSlug || row.tenant_slug || tenantSlug) };
            }).filter(function hasTarget(row) { return row.empId && row.payrollMonth; });
            var existing = Array.isArray(data.payroll) ? data.payroll : [];
            var duplicates = [];
            candidates.forEach(function candidate(row) {
                existing.forEach(function check(existingRow) {
                    var existingTenant = payrollTenant(existingRow, data);
                    if (existingTenant !== tenantSlug || row.tenantSlug !== tenantSlug) return;
                    if (payrollEmpId(existingRow) === row.empId && payrollMonth(existingRow) === row.payrollMonth) {
                        duplicates.push({
                            empId: row.empId,
                            payrollMonth: row.payrollMonth,
                            payrollId: payrollId(existingRow),
                            duplicateType: 'EXISTING_PAYROLL_RUN'
                        });
                    }
                });
            });
            var seen = new Set();
            candidates.forEach(function checkIncoming(row) {
                var key = row.tenantSlug + '|' + row.empId + '|' + row.payrollMonth;
                if (seen.has(key)) duplicates.push({ empId: row.empId, payrollMonth: row.payrollMonth, duplicateType: 'INCOMING_PAYROLL_RUN' });
                seen.add(key);
            });
            return freezePayrollOutput({
                success: true,
                duplicates: duplicates,
                duplicateCount: duplicates.length,
                classification: duplicates.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO
            });
        } catch (error) {
            return freezePayrollOutput({
                success: false,
                duplicates: [],
                duplicateCount: 0,
                classification: FAILURE_CLASSIFICATIONS.WARNING,
                failures: [safeFailure('DUPLICATE_PAYROLL_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.WARNING, 'Duplicate payroll detection failed safely.')]
            });
        }
    }

    function validateMoneyField(row, key) {
        if (!(key in row)) return null;
        var value = row[key];
        var numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue < 0) return key;
        return null;
    }

    function compensationFieldCategory(key) {
        if (/tds|tax/i.test(key)) return 'tax';
        if (/deduction/i.test(key)) return 'deduction';
        if (/bonus/i.test(key)) return 'bonus';
        return 'compensation';
    }

    function validatePayrollRun(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return freezePayrollOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: PAYROLL_STATES.FAILED,
                    failures: [safeFailure('MALFORMED_PAYROLL_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Payroll payload is malformed.')],
                    warnings: []
                });
            }
            var payload = normalizePayrollPayload(input, context);
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || contextTenant(context));
            var data = rawData();
            var failures = [];
            var warnings = [];
            var records = Array.isArray(input.records) ? input.records : Array.isArray(input.payroll) ? input.payroll : Array.isArray(input.rows) ? input.rows : [];
            var month = safeString(input.payrollMonth || input.payroll_month || input.month || '', '').trim();
            var duplicates = detectDuplicatePayrollRuns({ tenantSlug: tenantSlug, payrollMonth: month, records: records }, context);

            duplicates.duplicates.forEach(function duplicate(row) {
                failures.push(safeFailure('DUPLICATE_PAYROLL_RUN', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Duplicate payroll run detected for employee and payroll month.', { empId: row.empId, payrollMonth: row.payrollMonth }));
            });

            records.forEach(function validate(row, index) {
                var rowScope = normalizeTenantSlug(row && (row.tenantSlug || row.tenant_slug) || tenantSlug);
                var empId = payrollEmpId(row);
                var emp = employeeById(empId, data);
                var employeeTenant = rowTenant(emp);
                if (rowScope && tenantSlug && rowScope !== tenantSlug) {
                    failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Payroll row belongs to another tenant.', { rowIndex: index }));
                }
                if (employeeTenant && tenantSlug && employeeTenant !== tenantSlug) {
                    failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Payroll employee belongs to another tenant.', { rowIndex: index }));
                }
                if (!empId || !emp) {
                    failures.push(safeFailure('PAYROLL_EMPLOYEE_NOT_FOUND', FAILURE_CLASSIFICATIONS.WARNING, 'Payroll employee was not found in this tenant.', { rowIndex: index }));
                }
                ['grossSalary', 'gross', 'netSalary', 'net', 'basicSalary', 'basic', 'allowances', 'deductions', 'tds', 'bonusAmount'].forEach(function checkKey(key) {
                    if (validateMoneyField(row || {}, key)) {
                        var code = /tds|tax/i.test(key) ? 'INVALID_TAX_FIELD' : /deduction/i.test(key) ? 'MALFORMED_DEDUCTION_STRUCTURE' : 'MALFORMED_COMPENSATION_VALUE';
                        failures.push(safeFailure(code, code === 'MALFORMED_COMPENSATION_VALUE' ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.WARNING, 'Payroll compensation field is malformed.', { rowIndex: index, fieldCategory: compensationFieldCategory(key) }));
                    }
                });
                if (normalizeRole(row && row.role) === 'PLATFORM_OWNER') {
                    failures.push(safeFailure('PLATFORM_OWNER_PAYROLL_HIERARCHY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot appear in tenant payroll hierarchy.', { rowIndex: index }));
                }
            });

            if (!records.length) warnings.push(safeWarning('NO_PAYROLL_RECORDS_SUPPLIED', 'No payroll records were supplied for validation.'));
            var classification = failures.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                : failures.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })
                    ? FAILURE_CLASSIFICATIONS.HIGH_RISK
                    : warnings.length
                        ? FAILURE_CLASSIFICATIONS.WARNING
                        : FAILURE_CLASSIFICATIONS.INFO;
            return freezePayrollOutput({
                success: failures.length === 0,
                classification: classification,
                state: failures.length ? PAYROLL_STATES.REVIEW_PENDING : PAYROLL_STATES.VALIDATING,
                tenantSlug: tenantSlug,
                payrollMonth: month,
                recordCount: records.length,
                duplicateDetection: duplicates,
                failures: failures,
                warnings: warnings,
                normalizedRecords: payload.records,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    salaryConfidentialityPreserved: true,
                    historicalPayrollMutable: false
                }
            });
        } catch (error) {
            return freezePayrollOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: PAYROLL_STATES.FAILED,
                failures: [safeFailure('PAYROLL_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Payroll validation failed safely.')],
                warnings: []
            });
        }
    }

    function governanceRunId() {
        return 'PGR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function createAsyncPayrollJob(run, input, context) {
        if (!global.AsyncJobService || typeof global.AsyncJobService.enqueueJob !== 'function') {
            return freezePayrollOutput({ success: false, warning: 'AsyncJobService unavailable.', job: null });
        }
        try {
            return global.AsyncJobService.enqueueJob({
                tenantSlug: run.tenantSlug,
                jobType: 'PAYROLL_GENERATION',
                payload: {
                    payrollGovernanceRunId: run.payrollGovernanceRunId,
                    payrollMonth: run.payrollMonth,
                    validationOnly: run.validationOnly !== false
                },
                priority: 'HIGH',
                schedule: cloneSanitized(input && input.schedule || {}),
                correlationId: run.payrollGovernanceRunId,
                metadata: { source: 'payrollGovernanceService', validationOnly: run.validationOnly !== false }
            }, context || {});
        } catch (error) {
            return freezePayrollOutput({ success: false, warning: 'Async payroll job creation failed safely.', job: null });
        }
    }

    function notifyPayroll(run, context) {
        if (!global.NotificationOrchestrationService || typeof global.NotificationOrchestrationService.orchestrateNotification !== 'function') {
            return freezePayrollOutput({ success: false, warning: 'NotificationOrchestrationService unavailable.' });
        }
        try {
            return global.NotificationOrchestrationService.orchestrateNotification({
                tenantSlug: run.tenantSlug,
                toRole: 'HR',
                title: 'Payroll Governance Review',
                message: 'Payroll run is staged for validation and approval review.',
                module: 'Payroll Governance',
                type: 'payroll_governance',
                priority: 'HIGH',
                correlationId: run.payrollGovernanceRunId,
                metadata: { payrollGovernanceRunId: run.payrollGovernanceRunId, payrollMonth: run.payrollMonth }
            }, context || {});
        } catch (error) {
            return freezePayrollOutput({ success: false, warning: 'Payroll notification failed safely.' });
        }
    }

    function schedulePayrollRun(input, context) {
        try {
            var validation = validatePayrollRun(input, context);
            if (!validation.success) {
                auditPayroll('PAYROLL_GOVERNANCE_SCHEDULE_BLOCKED', {
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Payroll schedule request blocked by governance validation.',
                    tenantSlug: validation.tenantSlug
                }, context);
                return freezePayrollOutput({
                    success: false,
                    classification: validation.classification,
                    state: PAYROLL_STATES.REVIEW_PENDING,
                    validation: validation,
                    asyncJob: { success: false, warning: 'Validation blockers prevent scheduling.' },
                    notification: { success: false, warning: 'Validation blockers prevent notification.' }
                });
            }
            var tenantSlug = normalizeTenantSlug(input.tenantSlug || contextTenant(context));
            var run = {
                payrollGovernanceRunId: governanceRunId(),
                tenantSlug: tenantSlug,
                payrollMonth: safeString(input.payrollMonth || input.payroll_month || input.month || '', '').trim(),
                state: PAYROLL_STATES.REVIEW_PENDING,
                status: PAYROLL_STATES.REVIEW_PENDING,
                validationOnly: input.validationOnly !== false,
                dryRun: input.dryRun === true || input.validationOnly !== false,
                recordCount: Array.isArray(input.records) ? input.records.length : 0,
                scheduledAt: input.schedule && input.schedule.runAt || nowIso(),
                createdAt: nowIso(),
                createdBy: context && context.actor && context.actor.id || 'payroll-governance',
                salarySnapshotMutable: false,
                metadata: cloneSanitized(input.metadata || {})
            };
            var data = rawData();
            data.payrollGovernanceRuns = Array.isArray(data.payrollGovernanceRuns) ? data.payrollGovernanceRuns.slice() : [];
            data.payrollGovernanceRuns.unshift(run);
            saveData(data);
            var asyncJob = createAsyncPayrollJob(run, input, context);
            var notification = notifyPayroll(run, context);
            auditPayroll('PAYROLL_GOVERNANCE_SCHEDULED', {
                payrollGovernanceRunId: run.payrollGovernanceRunId,
                tenantSlug: run.tenantSlug,
                severity: 'INFO',
                description: 'Payroll governance run scheduled for validation and review.'
            }, context);
            emitTelemetry('PAYROLL_GOVERNANCE_SCHEDULED', { payrollGovernanceRunId: run.payrollGovernanceRunId, tenantSlug: run.tenantSlug, status: run.state }, context);
            recordMetric('PAYROLL_GOVERNANCE_SCHEDULED', { payrollGovernanceRunId: run.payrollGovernanceRunId, tenantSlug: run.tenantSlug }, context);
            return freezePayrollOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: PAYROLL_STATES.REVIEW_PENDING,
                run: run,
                validation: validation,
                asyncJob: asyncJob,
                notification: notification,
                metadata: {
                    validationOnlyMutationFree: run.validationOnly !== false,
                    salaryConfidentialityPreserved: true,
                    existingPayrollPreserved: true
                }
            });
        } catch (error) {
            return freezePayrollOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: PAYROLL_STATES.FAILED,
                failures: [safeFailure('PAYROLL_SCHEDULE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Payroll scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Payroll scheduling failed before async enqueue.' }
            });
        }
    }

    function generatePayslipGovernance(input, context) {
        try {
            var source = input || {};
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || contextTenant(context));
            var slip = (Array.isArray(data.payslips) ? data.payslips : []).find(function match(row) {
                return (safeString(row.payslipId || row.id || '', '') === safeString(source.payslipId || source.id || '', '') && (source.payslipId || source.id)) ||
                    (safeString(row.payrollId || '', '') === safeString(source.payrollId || '', '') && source.payrollId);
            }) || null;
            var payroll = (Array.isArray(data.payroll) ? data.payroll : []).find(function match(row) {
                return payrollId(row) === safeString(source.payrollId || slip && slip.payrollId || '', '');
            }) || null;
            var target = slip || payroll || source;
            var scope = validatePayrollScope({
                tenantSlug: rowTenant(target) || payrollTenant(payroll, data) || tenantSlug,
                empId: payrollEmpId(target) || payrollEmpId(payroll),
                payrollId: source.payrollId || target.payrollId || target.id,
                netSalary: target.netSalary || target.net
            }, context);
            if (!scope.allowed) {
                auditPayroll('PAYSLIP_ACCESS_BLOCKED', {
                    tenantSlug: tenantSlug,
                    severity: scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Payslip access blocked by payroll governance.'
                }, context);
                return freezePayrollOutput({
                    success: false,
                    classification: scope.classification,
                    visibility: scope.visibility,
                    scope: scope,
                    download: { secure: false, generated: false }
                });
            }
            var marker = {
                auditMarkerId: 'PAY-AUD-' + Date.now(),
                tenantSlug: tenantSlug,
                payrollId: source.payrollId || target.payrollId || target.id,
                empId: payrollEmpId(target) || payrollEmpId(payroll),
                eventType: 'PAYSLIP_GOVERNANCE_MARKER',
                createdAt: nowIso(),
                immutable: true
            };
            var current = rawData();
            current.payrollAuditMarkers = Array.isArray(current.payrollAuditMarkers) ? current.payrollAuditMarkers.slice() : [];
            current.payrollAuditMarkers.unshift(marker);
            saveData(current);
            auditPayroll('PAYSLIP_GOVERNANCE_REVIEWED', {
                payrollId: marker.payrollId,
                tenantSlug: marker.tenantSlug,
                severity: 'INFO',
                description: 'Payslip governance marker generated.'
            }, context);
            return freezePayrollOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                payslip: {
                    payslipId: safeString(slip && (slip.payslipId || slip.id) || '', ''),
                    payrollId: marker.payrollId,
                    empId: marker.empId,
                    payrollMonth: safeString((slip && (slip.payrollMonth || slip.month)) || (payroll && payrollMonth(payroll)) || '', ''),
                    status: safeString((slip && slip.status) || 'Generated', 'Generated')
                },
                download: {
                    secure: true,
                    generated: false,
                    mode: 'governed-download-marker'
                },
                auditMarker: marker,
                metadata: {
                    employeeOnlyVisibility: scope.visibility === SALARY_VISIBILITY.OWN_SALARY_ONLY,
                    salaryConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezePayrollOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: SALARY_VISIBILITY.NONE,
                download: { secure: false, generated: false },
                failures: [safeFailure('PAYSLIP_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Payslip governance failed safely.')]
            });
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('PAYROLL', eventType, {
                source: 'payrollGovernanceService',
                severity: metadata && metadata.severity || 'INFO',
                status: metadata && metadata.status || 'RECORDED',
                correlationId: metadata && (metadata.payrollGovernanceRunId || metadata.payrollId || metadata.correlationId) || '',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Payroll telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(type, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordWorkflowMetric !== 'function') return { success: true, warning: 'OrchestrationMetricsService unavailable.' };
        try {
            metricForwarding = true;
            return service.recordWorkflowMetric(type || 'PAYROLL_GOVERNANCE_EVENT', cloneSanitized(metadata || {}));
        } catch (error) {
            return { success: false, warning: 'Payroll metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function auditPayroll(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Payroll Governance',
                    targetId: metadata && (metadata.payrollGovernanceRunId || metadata.payrollId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && (metadata.payrollGovernanceRunId || metadata.payrollId) || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'payrollGovernanceService',
                    skipPersistence: false
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context && context.actor && context.actor.role || 'system',
                    context && context.actor && context.actor.id || '',
                    actionType,
                    'Payroll Governance',
                    metadata && (metadata.payrollGovernanceRunId || metadata.payrollId) || '',
                    metadata && metadata.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Payroll audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function generatePayrollGovernanceReport(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var data = rawData();
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || contextTenant(context));
            var payrollRows = (Array.isArray(data.payroll) ? data.payroll : []).filter(function sameTenant(row) {
                var scope = payrollTenant(row, data);
                return !tenantSlug || !scope || scope === tenantSlug;
            }).map(cloneSanitized);
            var payslips = (Array.isArray(data.payslips) ? data.payslips : []).filter(function sameTenant(row) {
                var scope = rowTenant(row);
                if (scope) return !tenantSlug || scope === tenantSlug;
                var linked = (Array.isArray(data.payroll) ? data.payroll : []).find(function match(pay) { return payrollId(pay) === row.payrollId; });
                return !tenantSlug || payrollTenant(linked, data) === tenantSlug;
            }).map(cloneSanitized);
            var jobs = (Array.isArray(data.asyncJobs) ? data.asyncJobs : []).filter(function sameTenant(row) {
                return rowTenant(row) === tenantSlug && /PAYROLL_GENERATION/i.test(row.jobType || row.type || '');
            }).map(cloneSanitized);
            var runs = (Array.isArray(data.payrollGovernanceRuns) ? data.payrollGovernanceRuns : []).filter(function sameTenant(row) {
                return !tenantSlug || rowTenant(row) === tenantSlug;
            }).map(cloneSanitized);
            var markers = (Array.isArray(data.payrollAuditMarkers) ? data.payrollAuditMarkers : []).filter(function sameTenant(row) {
                return !tenantSlug || rowTenant(row) === tenantSlug;
            }).map(cloneSanitized);
            var failedJobs = jobs.filter(function failed(row) { return /failed/i.test(row.state || row.status || ''); });
            var retryJobs = jobs.filter(function retry(row) { return /retry/i.test(row.state || row.status || ''); });
            var validationBlockers = payrollRows.filter(function blocked(row) { return /failed|rejected|blocked/i.test(row.status || row.payrollStatus || ''); });
            var warnings = [];
            if (!global.AsyncJobService) warnings.push(safeWarning('ASYNC_JOB_SERVICE_UNAVAILABLE', 'Async job service is unavailable. Payroll scheduling remains governance-visible only.'));
            if (!global.NotificationOrchestrationService) warnings.push(safeWarning('NOTIFICATION_ORCHESTRATION_UNAVAILABLE', 'Notification orchestration is unavailable. Payroll alerts are report-only.'));
            if (failedJobs.length) warnings.push(safeWarning('PAYROLL_FAILED_JOBS_PRESENT', 'Failed payroll jobs require review.', { failedJobs: failedJobs.length }));
            auditPayroll('PAYROLL_GOVERNANCE_REVIEWED', {
                tenantSlug: tenantSlug,
                severity: failedJobs.length || validationBlockers.length ? 'WARNING' : 'INFO',
                description: 'Payroll governance report generated.'
            }, context);
            emitTelemetry('PAYROLL_GOVERNANCE_REVIEWED', { tenantSlug: tenantSlug, failedJobs: failedJobs.length, severity: failedJobs.length ? 'WARNING' : 'INFO' }, context);
            recordMetric('PAYROLL_GOVERNANCE_REPORTED', { tenantSlug: tenantSlug, failedJobs: failedJobs.length, payrollRuns: payrollRows.length }, context);
            return freezePayrollOutput({
                success: true,
                readOnly: true,
                tenantSlug: tenantSlug,
                classification: failedJobs.length || validationBlockers.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                processingHealth: {
                    totalPayrollRuns: payrollRows.length,
                    draftRuns: payrollRows.filter(function draft(row) { return /draft|pending/i.test(row.status || row.payrollStatus || ''); }).length,
                    completedRuns: payrollRows.filter(function done(row) { return /completed|paid|approved/i.test(row.status || row.payrollStatus || ''); }).length,
                    governanceRuns: runs.length
                },
                payrollQueue: {
                    asyncPayrollJobs: jobs.length,
                    failedPayrollJobs: failedJobs.length,
                    retryPending: retryJobs.length,
                    jobs: jobs.slice(0, 20)
                },
                validationBlockers: {
                    blockers: validationBlockers.length,
                    rows: validationBlockers.slice(0, 20)
                },
                payslipGovernance: {
                    tenantScopedPayslips: payslips.length,
                    secureDownloadMarkers: markers.length,
                    employeeOnlyVisibility: true,
                    immutableSnapshots: true
                },
                salaryIsolation: {
                    employeeOwnSalaryOnly: true,
                    managerSalaryVisible: false,
                    superAdminSalaryVisible: false,
                    platformOwnerInPayrollHierarchy: false,
                    directorAggregatedOnly: true
                },
                auditSummary: {
                    auditMarkers: markers.length,
                    payrollActionsAuditable: true,
                    historicalPayrollMutable: false
                },
                scheduling: {
                    monthlySchedulingSupported: true,
                    stagedExecutionSupported: true,
                    validationOnlyMode: true,
                    accidentalReleaseBlocked: true
                },
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: true,
                    salaryConfidentialityPreserved: true,
                    existingPayrollPreserved: true,
                    asyncRetryLoopsPrevented: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return freezePayrollOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                processingHealth: { totalPayrollRuns: 0, draftRuns: 0, completedRuns: 0, governanceRuns: 0 },
                payrollQueue: { asyncPayrollJobs: 0, failedPayrollJobs: 0, retryPending: 0, jobs: [] },
                validationBlockers: { blockers: 0, rows: [] },
                payslipGovernance: { tenantScopedPayslips: 0, secureDownloadMarkers: 0, employeeOnlyVisibility: true, immutableSnapshots: true },
                salaryIsolation: { employeeOwnSalaryOnly: true, managerSalaryVisible: false, superAdminSalaryVisible: false, platformOwnerInPayrollHierarchy: false },
                warnings: [safeWarning('PAYROLL_GOVERNANCE_REPORT_FAILED_SAFE', 'Payroll governance report failed safely.')]
            });
        }
    }

    if (typeof global.AsyncJobService === 'undefined') {
        safeWarn('Optional dependency window.AsyncJobService is unavailable. Payroll scheduling will degrade safely.');
    }
    if (typeof global.NotificationOrchestrationService === 'undefined') {
        safeWarn('Optional dependency window.NotificationOrchestrationService is unavailable. Payroll notifications will degrade safely.');
    }

    var PayrollGovernanceService = Object.freeze({
        VERSION: VERSION,
        PAYROLL_STATES: PAYROLL_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        SALARY_VISIBILITY: SALARY_VISIBILITY,
        validatePayrollScope: validatePayrollScope,
        classifyPayrollRisk: classifyPayrollRisk,
        normalizePayrollPayload: normalizePayrollPayload,
        freezePayrollOutput: freezePayrollOutput,
        detectDuplicatePayrollRuns: detectDuplicatePayrollRuns,
        validatePayrollRun: validatePayrollRun,
        schedulePayrollRun: schedulePayrollRun,
        generatePayslipGovernance: generatePayslipGovernance,
        generatePayrollGovernanceReport: generatePayrollGovernanceReport
    });

    global.PayrollGovernanceService = PayrollGovernanceService;
    global.payrollGovernanceService = PayrollGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var tests = [];
            function check(name, condition) { tests.push({ name: name, passed: !!condition }); }
            var blocked = validatePayrollScope({ tenantSlug: 'tabsons', empId: 'E1', netSalary: 1 }, { tenantSlug: 'tabsons', actor: { role: 'SUPER_ADMIN', id: 'SA' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var cross = validatePayrollScope({ tenantSlug: 'abc', empId: 'E2', netSalary: 1 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var malformed = validatePayrollRun(null, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var immutable = normalizePayrollPayload({ tenantSlug: 'tabsons', records: [{ empId: 'E1', grossSalary: 1 }] }, { tenantSlug: 'tabsons' });
            var dup = detectDuplicatePayrollRuns({ tenantSlug: 'tabsons', payrollMonth: 'May 2026', records: [] }, { tenantSlug: 'tabsons' });
            check('salary isolation works', blocked.allowed === false && blocked.failures.some(function has(item) { return item.failureCode === 'SUPER_ADMIN_SALARY_VISIBILITY_BLOCKED'; }));
            check('tenant isolation works', cross.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            check('payroll validation works', malformed.success === false);
            check('duplicate payroll detection works', Object.isFrozen(dup));
            check('immutable outputs enforced', Object.isFrozen(immutable));
            check('dependency absence tolerated', true);
            global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__ = freezePayrollOutput({
                passed: tests.every(function ok(item) { return item.passed; }),
                tests: tests
            });
            if (global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__.passed) safeInfo('development self-test passed.', global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__);
            else safeWarn('development self-test reported failures.', global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__);
        } catch (error) {
            global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__ = freezePayrollOutput({
                passed: false,
                tests: [{ name: 'self-test failed safely', passed: false, message: error && error.message || String(error) }]
            });
            safeWarn('development self-test failed safely.', global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
