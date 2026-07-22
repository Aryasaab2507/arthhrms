/**
 * expenseGovernanceService.js
 * ARTHHRMS Enterprise Expense + Reimbursement Governance System.
 *
 * Additive governance layer for expense visibility, receipt privacy,
 * reimbursement validation, async reimbursement processing, and policy
 * enforcement. It does not replace expenseService or mutate historical claims
 * during validation-only flows.
 */
(function attachExpenseGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[ExpenseGovernanceService]';

    var EXPENSE_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        SUBMITTED: 'SUBMITTED',
        REVIEW_PENDING: 'REVIEW_PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        REIMBURSED: 'REIMBURSED',
        FAILED: 'FAILED',
        ARCHIVED: 'ARCHIVED'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_EXPENSE_ONLY: 'OWN_EXPENSE_ONLY',
        TEAM_EXPENSE_VISIBILITY: 'TEAM_EXPENSE_VISIBILITY',
        OPERATIONAL_REIMBURSEMENT_VISIBILITY: 'OPERATIONAL_REIMBURSEMENT_VISIBILITY',
        STRATEGIC_EXPENSE_SUMMARIES: 'STRATEGIC_EXPENSE_SUMMARIES',
        ORG_LEVEL_EXPENSE_ANALYTICS: 'ORG_LEVEL_EXPENSE_ANALYTICS',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var VALID_CATEGORIES = Object.freeze([
        'TRAVEL',
        'MEALS',
        'LODGING',
        'SUPPLIES',
        'SOFTWARE',
        'TRAINING',
        'COMMUNICATION',
        'OTHER'
    ]);

    var RESTRICTED_CATEGORIES = Object.freeze([
        'ALCOHOL',
        'PERSONAL',
        'CRYPTO',
        'GIFTS',
        'LOBBYING'
    ]);

    var CATEGORY_LIMITS = Object.freeze({
        TRAVEL: 10000,
        MEALS: 3000,
        LODGING: 20000,
        SUPPLIES: 5000,
        SOFTWARE: 15000,
        TRAINING: 12000,
        COMMUNICATION: 5000,
        OTHER: 2500
    });

    var ALLOWED_RECEIPT_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png'
    ]);

    var ALLOWED_RECEIPT_EXTENSIONS = Object.freeze(['pdf', 'jpg', 'jpeg', 'png']);
    var MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

    var SENSITIVE_KEY_PATTERN = /(amount|receipt|attachment|bill|description|remark|private.?note|merchant|vendor|employeeName|salary|payroll|payslip|compensation|ctc|gross|net|basic|hra|pf|tds|allowance|deduction|bonus|tax|bank|account|ifsc|password|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\bprivate\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        reimbursementHealth: true,
        reimbursementConfidentialityPreserved: true,
        reimbursementWorkflowsPreserved: true,
        asyncReimbursement: true,
        asyncReimbursementJobs: true,
        receiptGovernance: true,
        receiptAccessRoleScoped: true,
        receiptStoragePrivate: true,
        receiptUploadHealth: true,
        tenantScopedReceipts: true,
        publicReceiptWarnings: true,
        superAdminApprovalAuthority: true,
        platformOwnerInReimbursementHierarchy: true,
        duplicateClaimDetection: true,
        duplicateClaimCount: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
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

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.id) || '', '').trim();
    }

    function expenseIdOf(row) {
        return safeString(row && (row.expenseId || row.expense_id || row.claimId || row.claim_id || row.id) || '', '').trim();
    }

    function expenseDateOf(row) {
        return safeString(row && (row.expenseDate || row.expense_date || row.date || row.submittedOn || row.submitted_on) || '', '').slice(0, 10);
    }

    function categoryOf(row) {
        return normalizeToken(row && row.category || '');
    }

    function valueOf(row) {
        var raw = row && (row.amount || row.claimAmount || row.reimbursementAmount || row.total);
        var value = Number(raw);
        return Number.isFinite(value) ? value : NaN;
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray(data.employees) ? data.employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function employeeTenant(empId, data) {
        return rowTenant(employeeById(empId, data || rawData()));
    }

    function sourceTenant(row, data) {
        return rowTenant(row) || employeeTenant(empIdOf(row), data || rawData());
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reporting_manager_id || '', '') === safeString(managerId || '', ''));
    }

    function expenseRows(data) {
        return Array.isArray((data || rawData()).expenseClaims) ? (data || rawData()).expenseClaims : [];
    }

    function asyncRows(data) {
        return Array.isArray((data || rawData()).asyncJobs) ? (data || rawData()).asyncJobs : [];
    }

    function receiptRows(data) {
        return Array.isArray((data || rawData()).expenseReceipts) ? (data || rawData()).expenseReceipts : [];
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
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

    function freezeExpenseOutput(value) {
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

    function hasSensitiveExpenseFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasSensitiveExpenseFields(input[key]);
        });
    }

    function highestClassification(items, fallback) {
        var list = Array.isArray(items) ? items : [];
        if (list.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (list.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (list.some(function warning(item) { return item.classification === FAILURE_CLASSIFICATIONS.WARNING; })) return FAILURE_CLASSIFICATIONS.WARNING;
        return fallback || FAILURE_CLASSIFICATIONS.INFO;
    }

    function classifyExpenseRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantExpense || source.crossTenantReceipt || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.publicReceipt || source.platformOwnerInHierarchy || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.duplicateClaim || source.unsafeReimbursementApproval || source.policyViolation || source.invalidApprovalChain) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedReceipt || source.unsupportedUpload || source.invalidCategory || source.retrySpike || source.failedReimbursement) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityForRole(role, actor, targetEmpId, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var actorEmpId = safeString(actor && (actor.empId || actor.employeeId || actor.id) || '', '').trim();
        if (normalized === 'EMPLOYEE') {
            return actorEmpId && targetEmpId && actorEmpId === targetEmpId ? VISIBILITY.OWN_EXPENSE_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return managerOwnsEmployee(actorEmpId, targetEmpId, data) ? VISIBILITY.TEAM_EXPENSE_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.OPERATIONAL_REIMBURSEMENT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_EXPENSE_SUMMARIES;
        if (normalized === 'DIRECTOR') return VISIBILITY.ORG_LEVEL_EXPENSE_ANALYTICS;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateExpenseScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetEmpId = empIdOf(source);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, targetEmpId, data);
            var failures = [];

            if (targetTenant && ctxTenant && targetTenant !== ctxTenant) {
                failures.push(safeFailure('CROSS_TENANT_EXPENSE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant expense visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && ctxTenant) {
                failures.push(safeFailure('PLATFORM_OWNER_REIMBURSEMENT_HIERARCHY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant reimbursement hierarchy.'));
            }
            if (role === 'SUPER_ADMIN' && (source.approveReimbursement === true || source.processReimbursement === true || source.markReimbursed === true || source.approve === true || source.action === 'APPROVE')) {
                failures.push(safeFailure('SUPER_ADMIN_REIMBURSEMENT_APPROVAL_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators cannot approve reimbursements directly.'));
            }
            if (role === 'SUPER_ADMIN' && hasSensitiveExpenseFields(source)) {
                failures.push(safeFailure('SUPER_ADMIN_REIMBURSEMENT_DETAIL_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_EXPENSE_ONLY) {
                failures.push(safeFailure('EMPLOYEE_EXPENSE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own expense scope.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.TEAM_EXPENSE_VISIBILITY) {
                failures.push(safeFailure('MANAGER_TEAM_EXPENSE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team expense scope.'));
            }

            var classification = highestClassification(failures);
            return freezeExpenseOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    empId: targetTenant === ctxTenant ? targetEmpId : '',
                    expenseId: targetTenant === ctxTenant ? expenseIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    reimbursementConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeExpenseOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('EXPENSE_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Expense scope validation failed safely.')]
            });
        }
    }

    function normalizeExpensePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeExpenseOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_EXPENSE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Expense payload is malformed.')]
                });
            }
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, rawData()) || ctxTenant;
            return freezeExpenseOutput({
                success: true,
                tenantSlug: ctxTenant || srcTenant,
                payload: {
                    tenantSlug: srcTenant,
                    empId: empIdOf(payload),
                    expenseId: expenseIdOf(payload),
                    category: categoryOf(payload) || 'OTHER',
                    expenseDate: expenseDateOf(payload),
                    currency: safeString(payload.currency || rawData().companySettings?.currency || 'INR', 'INR'),
                    state: normalizeExpenseState(payload.state || payload.status || EXPENSE_STATES.SUBMITTED),
                    valueProvided: Number.isFinite(valueOf(payload)),
                    hasFile: !!(payload.file || payload.upload || payload.attachment || payload.receipt)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    reimbursementConfidentialityPreserved: true,
                    receiptAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeExpenseOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('EXPENSE_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Expense payload normalization failed safely.')]
            });
        }
    }

    function normalizeExpenseState(value) {
        var normalized = normalizeToken(value);
        if (['PENDING_MANAGER_APPROVAL', 'PENDING', 'SUBMITTED'].indexOf(normalized) !== -1) return EXPENSE_STATES.SUBMITTED;
        if (['PENDING_HR_PAYMENT', 'PAYMENT_PENDING', 'MANAGER_APPROVED', 'APPROVED_BY_MANAGER'].indexOf(normalized) !== -1) return EXPENSE_STATES.APPROVED;
        if (['PAID', 'REIMBURSED'].indexOf(normalized) !== -1) return EXPENSE_STATES.REIMBURSED;
        if (normalized.indexOf('REJECTED') !== -1) return EXPENSE_STATES.REJECTED;
        if (EXPENSE_STATES[normalized]) return EXPENSE_STATES[normalized];
        return EXPENSE_STATES.REVIEW_PENDING;
    }

    function supportedReceiptType(receipt) {
        var mime = safeString(receipt && (receipt.mimeType || receipt.type || receipt.fileType) || '', '').trim().toLowerCase();
        var fileName = safeString(receipt && (receipt.fileName || receipt.name || receipt.billFileName) || '', '').trim();
        var extension = fileName.split('.').pop().toLowerCase();
        return (!mime || ALLOWED_RECEIPT_TYPES.indexOf(mime) !== -1) && (!extension || extension === fileName.toLowerCase() || ALLOWED_RECEIPT_EXTENSIONS.indexOf(extension) !== -1);
    }

    function receiptPubliclyExposed(receipt) {
        if (!receipt || typeof receipt !== 'object') return false;
        if (receipt.isPublic === true || receipt.public === true || receipt.publicUrl) return true;
        var url = safeString(receipt.url || receipt.signedUrl || receipt.attachmentUrl || receipt.receiptUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function validateReceiptGovernance(receipt, context) {
        try {
            if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
                return freezeExpenseOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_RECEIPT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Receipt payload is malformed.')]
                });
            }
            var source = { ...receipt, tenantSlug: receipt.tenantSlug || contextTenant(context) };
            var scope = validateExpenseScope(source, context);
            var failures = scope.failures ? scope.failures.slice() : [];
            var size = Number(receipt.size || receipt.fileSize || 0);
            if (!supportedReceiptType(receipt)) {
                failures.push(safeFailure('UNSUPPORTED_RECEIPT_UPLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Receipt upload type is not supported.', { allowedTypes: ALLOWED_RECEIPT_TYPES.slice() }));
            }
            if (Number.isFinite(size) && size > MAX_RECEIPT_BYTES) {
                failures.push(safeFailure('RECEIPT_UPLOAD_TOO_LARGE', FAILURE_CLASSIFICATIONS.WARNING, 'Receipt upload exceeds the configured limit.', { maxMB: 8 }));
            }
            if (receiptPubliclyExposed(receipt)) {
                failures.push(safeFailure('PUBLIC_RECEIPT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public file exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezeExpenseOutput({
                success: failures.length === 0,
                classification: classification,
                secureStorageRequired: true,
                visibility: scope.visibility || VISIBILITY.NONE,
                failures: failures,
                receiptGovernance: {
                    secureStorage: true,
                    receiptAccessRoleScoped: true,
                    signedAccessOnly: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    reimbursementConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeExpenseOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('RECEIPT_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Receipt governance validation failed safely.')]
            });
        }
    }

    function detectDuplicateClaims(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeExpenseOutput({
                    success: false,
                    duplicates: [],
                    duplicateClaimDetection: true,
                    warnings: [safeWarning('MALFORMED_DUPLICATE_CHECK_PAYLOAD', 'Duplicate detection payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context) || sourceTenant(payload, data);
            var targetTenant = sourceTenant(payload, data) || ctxTenant;
            var empId = empIdOf(payload);
            var category = categoryOf(payload);
            var date = expenseDateOf(payload);
            var value = valueOf(payload);
            var id = expenseIdOf(payload);
            var duplicates = expenseRows(data).filter(function duplicate(row) {
                var rowId = expenseIdOf(row);
                var categoryMatches = categoryOf(row) === category || VALID_CATEGORIES.indexOf(category) === -1;
                if (id && rowId && id === rowId) return false;
                return sourceTenant(row, data) === targetTenant
                    && targetTenant === ctxTenant
                    && empIdOf(row) === empId
                    && categoryMatches
                    && expenseDateOf(row) === date
                    && Number(valueOf(row)) === Number(value);
            }).map(function reference(row) {
                return {
                    expenseId: expenseIdOf(row),
                    empId: empIdOf(row),
                    category: categoryOf(row),
                    expenseDate: expenseDateOf(row),
                    state: normalizeExpenseState(row.status || row.state)
                };
            });
            return freezeExpenseOutput({
                success: true,
                duplicateClaimDetection: true,
                duplicateClaimCount: duplicates.length,
                duplicates: duplicates,
                classification: duplicates.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO
            });
        } catch (error) {
            return freezeExpenseOutput({
                success: false,
                duplicates: [],
                duplicateClaimDetection: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                warnings: [safeWarning('DUPLICATE_EXPENSE_CHECK_FAILED_SAFE', 'Duplicate expense detection failed safely.')]
            });
        }
    }

    function validateApprovalChain(chain) {
        if (!Array.isArray(chain)) return [];
        return chain.filter(function unsafe(step) {
            var role = normalizeRole(step && (step.role || step.actorRole || step.approverRole));
            return !role || role === 'PLATFORM_OWNER' || role === 'SUPER_ADMIN' || ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR'].indexOf(role) === -1;
        });
    }

    function validateExpenseClaim(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeExpenseOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_EXPENSE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Expense payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(payload, data) || ctxTenant;
            var failures = [];
            var scope = validateExpenseScope(payload, context);
            failures = failures.concat(scope.failures || []);

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Expense claim tenant mismatch was blocked.', { expectedTenant: ctxTenant }));
            }

            var value = valueOf(payload);
            if (!Number.isFinite(value) || value <= 0) {
                failures.push(safeFailure('MALFORMED_EXPENSE_VALUE', FAILURE_CLASSIFICATIONS.WARNING, 'Expense value must be a positive number.'));
            }

            var category = categoryOf(payload);
            if (!category || VALID_CATEGORIES.indexOf(category) === -1) {
                failures.push(safeFailure('INVALID_REIMBURSEMENT_CATEGORY', FAILURE_CLASSIFICATIONS.WARNING, 'Expense category is not approved for reimbursement.'));
            }

            var duplicate = detectDuplicateClaims(payload, context);
            if (duplicate.duplicates && duplicate.duplicates.length) {
                failures.push(safeFailure('DUPLICATE_EXPENSE_CLAIM', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Duplicate expense claim detected.', { duplicateClaimCount: duplicate.duplicates.length }));
            }

            var receipt = payload.receipt || payload.attachment || payload.file || (payload.attachmentFileName || payload.receiptUrl || payload.attachmentUrl ? payload : null);
            if (receipt) {
                var receiptValidation = validateReceiptGovernance({ ...receipt, tenantSlug: targetTenant, empId: empIdOf(payload), expenseId: expenseIdOf(payload) }, context);
                failures = failures.concat((receiptValidation.failures || []).filter(function uniqueReceiptFailure(item) {
                    return !failures.some(function existing(existingItem) { return existingItem.failureCode === item.failureCode; });
                }));
            }

            var limit = CATEGORY_LIMITS[category] || 0;
            if (RESTRICTED_CATEGORIES.indexOf(category) !== -1 || (limit && Number.isFinite(value) && value > limit)) {
                failures.push(safeFailure('EXPENSE_POLICY_VIOLATION', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Expense policy violation detected.', { category: VALID_CATEGORIES.indexOf(category) === -1 ? 'UNAPPROVED' : category }));
            }

            if (validateApprovalChain(payload.approvalChain || payload.approvers || []).length) {
                failures.push(safeFailure('INVALID_REIMBURSEMENT_APPROVAL_CHAIN', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Unsafe reimbursement approval chain was blocked.'));
            }

            var classification = highestClassification(failures);
            return freezeExpenseOutput({
                success: failures.length === 0,
                classification: classification,
                state: failures.length ? EXPENSE_STATES.REVIEW_PENDING : EXPENSE_STATES.SUBMITTED,
                normalized: normalizeExpensePayload(payload, context).payload || null,
                failures: failures,
                warnings: failures.filter(function warning(item) { return item.classification === FAILURE_CLASSIFICATIONS.WARNING; }),
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    reimbursementConfidentialityPreserved: true,
                    receiptAccessRoleScoped: true,
                    approvalGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeExpenseOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('EXPENSE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Expense validation failed safely.')]
            });
        }
    }

    function auditExpense(actionType, metadata, context) {
        if (auditForwarding || context?.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Expense Governance',
                    targetId: metadata?.expenseId || metadata?.targetId || '',
                    description: metadata?.description || actionType,
                    actorRole: context?.actor?.role || 'hr',
                    actorId: context?.actor?.id || '',
                    severity: metadata?.severity || 'INFO',
                    correlationId: metadata?.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'expenseGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context?.actor?.role || 'hr', context?.actor?.id || '', actionType, 'Expense Governance', metadata?.expenseId || '', metadata?.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Expense audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context?.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('EXPENSE_GOVERNANCE', eventType, {
                    source: 'expenseGovernanceService',
                    severity: metadata?.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata?.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Expense telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'WorkflowTelemetryService unavailable.' };
    }

    function recordMetric(metricType, context) {
        if (metricForwarding || context?.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: contextTenant(context),
                    source: 'expenseGovernanceService'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Expense metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function findExpense(payload, data, tenantSlug) {
        var id = expenseIdOf(payload);
        if (!id) return payload && typeof payload === 'object' ? payload : null;
        return expenseRows(data).find(function match(row) {
            return expenseIdOf(row) === id && (!tenantSlug || sourceTenant(row, data) === tenantSlug);
        }) || payload;
    }

    function persistGovernanceRun(run, context) {
        if (context?.preview || context?.readOnly) return freezeExpenseOutput(run);
        var data = rawData();
        data.expenseGovernanceRuns = Array.isArray(data.expenseGovernanceRuns) ? data.expenseGovernanceRuns.slice() : [];
        data.expenseGovernanceRuns.unshift(cloneSanitized(run));
        if (data.expenseGovernanceRuns.length > 150) data.expenseGovernanceRuns = data.expenseGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezeExpenseOutput(run);
    }

    function scheduleReimbursementProcessing(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeExpenseOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: EXPENSE_STATES.REVIEW_PENDING,
                    failures: [safeFailure('MALFORMED_REIMBURSEMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Reimbursement payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context) || sourceTenant(payload, data);
            var source = findExpense(payload, data, ctxTenant) || payload;
            var validation = validateExpenseScope({ ...source, approveReimbursement: false }, context);
            if (!validation.allowed) {
                auditExpense('REIMBURSEMENT_PROCESSING_BLOCKED', {
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    tenantSlug: ctxTenant,
                    description: 'Unsafe reimbursement processing was blocked.'
                }, context);
                emitTelemetry('REIMBURSEMENT_PROCESSING_BLOCKED', { severity: 'WARNING', tenantSlug: ctxTenant }, context);
                return freezeExpenseOutput({
                    success: false,
                    classification: validation.classification,
                    state: EXPENSE_STATES.REVIEW_PENDING,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Reimbursement processing blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        reimbursementConfidentialityPreserved: true
                    }
                });
            }

            var runId = 'EXPGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                expenseId: expenseIdOf(source),
                state: EXPENSE_STATES.REVIEW_PENDING,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(),
                reimbursementGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; reimbursement remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'REIMBURSEMENT_PROCESSING',
                    priority: 'HIGH',
                    correlationId: expenseIdOf(source) || runId,
                    payload: {
                        expenseId: expenseIdOf(source),
                        governanceRunId: runId
                    },
                    schedule: payload.schedule || {}
                }, {
                    tenantSlug: ctxTenant,
                    actor: context?.actor,
                    skipAuditPersistence: context?.skipAuditPersistence,
                    skipTelemetry: context?.skipTelemetry,
                    skipMetrics: context?.skipMetrics
                });
            }

            if (global.NotificationOrchestrationService && typeof global.NotificationOrchestrationService.orchestrateNotification === 'function' && !context?.skipNotification) {
                try {
                    global.NotificationOrchestrationService.orchestrateNotification({
                        tenantSlug: ctxTenant,
                        module: 'Expense',
                        category: 'REIMBURSEMENT_PROCESSING',
                        targetRole: 'HR',
                        priority: 'HIGH',
                        title: 'Reimbursement Processing Review',
                        message: 'A reimbursement processing job is ready for finance review.',
                        correlationId: expenseIdOf(source) || runId
                    }, {
                        tenantSlug: ctxTenant,
                        actor: context?.actor,
                        skipAuditPersistence: context?.skipAuditPersistence,
                        skipTelemetry: context?.skipTelemetry,
                        skipMetrics: context?.skipMetrics
                    });
                } catch (notifyError) {}
            }

            auditExpense('REIMBURSEMENT_PROCESSING_SCHEDULED', {
                expenseId: expenseIdOf(source),
                tenantSlug: ctxTenant,
                description: 'Reimbursement processing scheduled through expense governance.'
            }, context);
            emitTelemetry('REIMBURSEMENT_PROCESSING_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('REIMBURSEMENT_PROCESSING_SCHEDULED', context);

            return freezeExpenseOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: EXPENSE_STATES.REVIEW_PENDING,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    reimbursementConfidentialityPreserved: true,
                    asyncReimbursement: true,
                    existingWorkflowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Reimbursement scheduling failed safely.', error && error.message ? error.message : error);
            return freezeExpenseOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: EXPENSE_STATES.REVIEW_PENDING,
                failures: [safeFailure('REIMBURSEMENT_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Reimbursement scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Reimbursement scheduling failed safely.' }
            });
        }
    }

    function isDelayed(row) {
        var date = expenseDateOf(row) || safeString(row && row.submittedAt || '', '').slice(0, 10);
        if (!date) return false;
        var created = new Date(date + 'T00:00:00').getTime();
        if (Number.isNaN(created)) return false;
        return (Date.now() - created) / 86400000 > 2 && ['Paid', 'Reimbursed', 'Rejected by Manager', 'Rejected by HR', 'Rejected'].indexOf(safeString(row.status || row.finalStatus || '', '')) === -1;
    }

    function publicReceiptCount(rows, receipts) {
        var rowsWithPublic = rows.filter(function publicRow(row) {
            return receiptPubliclyExposed({
                publicUrl: row.publicUrl,
                receiptUrl: row.receiptUrl,
                attachmentUrl: row.attachmentUrl,
                isPublic: row.isPublic
            });
        }).length;
        return rowsWithPublic + receipts.filter(receiptPubliclyExposed).length;
    }

    function countPolicyViolations(rows) {
        return rows.filter(function policy(row) {
            var category = categoryOf(row);
            var value = valueOf(row);
            return RESTRICTED_CATEGORIES.indexOf(category) !== -1 || (CATEGORY_LIMITS[category] && Number.isFinite(value) && value > CATEGORY_LIMITS[category]);
        }).length;
    }

    function generateExpenseGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var ctxTenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = expenseRows(data).filter(function sameTenant(row) { return sourceTenant(row, data) === ctxTenant; });
            var receipts = receiptRows(data).filter(function sameReceiptTenant(row) { return sourceTenant(row, data) === ctxTenant; });
            var reimbursementJobs = asyncRows(data).filter(function job(row) {
                return rowTenant(row) === ctxTenant && normalizeToken(row.jobType || row.type) === 'REIMBURSEMENT_PROCESSING';
            });
            var pendingManager = rows.filter(function pending(row) {
                return ['Pending Manager Approval', 'Submitted', 'Pending'].indexOf(safeString(row.status || row.finalStatus || '', '')) !== -1;
            }).length;
            var pendingFinance = rows.filter(function pending(row) {
                return ['Approved by Manager', 'Pending HR Payment', 'Finance Approved', 'Pending Payment', 'Payment Pending'].indexOf(safeString(row.status || row.finalStatus || '', '')) !== -1;
            }).length;
            var failed = rows.filter(function failedRow(row) {
                return /failed|rejected/i.test(safeString(row.status || row.finalStatus || '', ''));
            }).length;
            var reimbursed = rows.filter(function paid(row) {
                return /paid|reimbursed/i.test(safeString(row.status || row.finalStatus || row.financeStatus || '', ''));
            }).length;
            var delayed = rows.filter(isDelayed).length;
            var duplicates = rows.reduce(function collect(acc, row) {
                var duplicate = detectDuplicateClaims(row, { tenantSlug: ctxTenant });
                return acc + ((duplicate.duplicates || []).length ? 1 : 0);
            }, 0);

            var report = {
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                generatedAt: nowIso(),
                tenantSlug: ctxTenant,
                reimbursementHealth: {
                    totalExpenseClaims: rows.length,
                    pendingManagerReview: pendingManager,
                    pendingFinanceAction: pendingFinance,
                    reimbursedClaims: reimbursed,
                    failedReimbursements: failed,
                    delayedApprovals: delayed
                },
                receiptGovernance: {
                    tenantScopedReceipts: receipts.length + rows.filter(function hasAttachment(row) { return !!(row.attachmentUrl || row.receiptUrl || row.billFileName || row.attachmentFileName); }).length,
                    publicReceiptWarnings: publicReceiptCount(rows, receipts),
                    receiptStoragePrivate: true,
                    receiptAccessRoleScoped: true
                },
                policyEnforcement: {
                    policyViolations: countPolicyViolations(rows),
                    duplicateClaimCount: duplicates,
                    duplicateClaimDetection: true,
                    superAdminApprovalAuthority: false
                },
                approvalGovernance: {
                    delayedApprovals: delayed,
                    pendingManagerReview: pendingManager,
                    pendingFinanceAction: pendingFinance,
                    escalationReady: delayed > 0
                },
                asyncReimbursement: {
                    asyncReimbursementJobs: reimbursementJobs.length,
                    retryPending: reimbursementJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length,
                    failedJobs: reimbursementJobs.filter(function failedJob(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length,
                    queueGovernancePreserved: true
                },
                visibility: {
                    employeeOwnExpensesOnly: true,
                    managerTeamExpenseVisibility: true,
                    superAdminApprovalAuthority: false,
                    platformOwnerInReimbursementHierarchy: false,
                    receiptAccessRoleScoped: true
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    reimbursementConfidentialityPreserved: true,
                    sensitiveReceiptsFiltered: true,
                    existingWorkflowEventsPreserved: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditExpense('EXPENSE_GOVERNANCE_REPORT_VIEWED', { tenantSlug: ctxTenant, description: 'Expense governance report viewed.' }, context);
            emitTelemetry('EXPENSE_GOVERNANCE_REPORT_VIEWED', { tenantSlug: ctxTenant, status: 'VIEWED' }, context);
            recordMetric('EXPENSE_GOVERNANCE_REPORT_VIEWED', context);
            return freezeExpenseOutput(report);
        } catch (error) {
            return freezeExpenseOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                reimbursementHealth: { totalExpenseClaims: 0, pendingManagerReview: 0, pendingFinanceAction: 0, failedReimbursements: 0 },
                receiptGovernance: { tenantScopedReceipts: 0, publicReceiptWarnings: 0, receiptStoragePrivate: true, receiptAccessRoleScoped: true },
                asyncReimbursement: { asyncReimbursementJobs: 0, retryPending: 0, failedJobs: 0 },
                failures: [safeFailure('EXPENSE_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Expense governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ name: name, passed: !!condition });
        }
        try {
            var malformed = validateExpenseClaim(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_EXPENSE_PAYLOAD'; }));

            var crossTenant = validateExpenseScope({ tenantSlug: 'abc', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('tenant expense isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var publicReceipt = validateReceiptGovernance({ tenantSlug: 'tabsons', empId: 'EMP-1', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/receipt.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('receipt governance works', publicReceipt.success === false && publicReceipt.failures.some(function item(row) { return row.failureCode === 'PUBLIC_RECEIPT_EXPOSURE_BLOCKED'; }));

            var invalid = validateExpenseClaim({ tenantSlug: 'tabsons', empId: 'EMP-1', category: 'Alcohol', date: '2026-05-20', amount: 100, approvalChain: [{ role: 'PLATFORM_OWNER' }] }, { tenantSlug: 'tabsons', actor: { role: 'EMPLOYEE', empId: 'EMP-1', id: 'EMP-1' } });
            check('reimbursement workflows block unsafe policy states', invalid.success === false && invalid.failures.some(function item(row) { return row.failureCode === 'INVALID_REIMBURSEMENT_APPROVAL_CHAIN'; }));

            var immutable = normalizeExpensePayload({ tenantSlug: 'tabsons', empId: 'EMP-1', category: 'Travel', amount: 50 }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleReimbursementProcessing({ tenantSlug: 'tabsons', expenseId: 'SELF-EXP-1', empId: 'EMP-1', category: 'Travel', date: '2026-05-20', validationOnly: true }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ name: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeExpenseOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Expense governance self-test passed.' : 'Expense governance self-test detected failures.'
        });
        global.__ARTHHRMS_EXPENSE_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var ExpenseGovernanceService = Object.freeze({
        VERSION: VERSION,
        EXPENSE_STATES: EXPENSE_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyExpenseRisk: classifyExpenseRisk,
        validateExpenseScope: validateExpenseScope,
        validateExpenseClaim: validateExpenseClaim,
        validateReceiptGovernance: validateReceiptGovernance,
        normalizeExpensePayload: normalizeExpensePayload,
        freezeExpenseOutput: freezeExpenseOutput,
        detectDuplicateClaims: detectDuplicateClaims,
        scheduleReimbursementProcessing: scheduleReimbursementProcessing,
        generateExpenseGovernanceReport: generateExpenseGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.ExpenseGovernanceService = ExpenseGovernanceService;
    global.expenseGovernanceService = ExpenseGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
