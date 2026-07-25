/**
 * tenantBillingService.js
 * ARTHHRMS Enterprise Tenant Billing Foundation + Subscription Governance.
 *
 * Additive, platform-control-only billing governance for tenant subscriptions,
 * plan lifecycle, renewal health, payment state indicators, invoice foundation
 * readiness, and usage-linked billing intelligence. It does not expose employee
 * salaries, payroll internals, leave balances, confidential HR records, raw
 * tenant documents, or tenant-private payloads.
 */
(function attachTenantBillingService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[TenantBillingService]';

    var BILLING_STATES = Object.freeze([
        'TRIAL',
        'ACTIVE',
        'PAST_DUE',
        'LIMITED',
        'SUSPENDED',
        'CANCELLED',
        'ARCHIVED'
    ]);

    var BILLING_TYPES = Object.freeze([
        'SUBSCRIPTION',
        'PLAN_GOVERNANCE',
        'RENEWAL',
        'INVOICE_FOUNDATION',
        'PAYMENT_STATE',
        'USAGE_LINKED_BILLING',
        'BILLING_ANALYTICS'
    ]);

    var CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ISOLATED_BILLING_GOVERNANCE: 'ISOLATED_BILLING_GOVERNANCE',
        BILLING_INFRASTRUCTURE_ONLY: 'BILLING_INFRASTRUCTURE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|invoice.?url|receipt.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|message|note|comment|email|phone|name|confidential|private)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_BILLING_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        classification: true,
        visibility: true,
        state: true,
        states: true,
        billingState: true,
        billingType: true,
        billingTypes: true,
        billingId: true,
        subscriptionId: true,
        tenantId: true,
        tenantSlug: true,
        targetTenantId: true,
        targetTenantSlug: true,
        generatedAt: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        signals: true,
        summary: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        description: true,
        healthSignals: true,
        planKey: true,
        planTier: true,
        usageTier: true,
        paymentStatus: true,
        invoiceState: true,
        renewalStatus: true,
        billingRestriction: true,
        abnormalUsageGrowth: true,
        renewalFailures: true,
        subscriptionAnomalies: true,
        billingRestrictionEvents: true,
        inactiveBillingAccounts: true,
        paymentFailures: true,
        upgradeTrends: true,
        downgradeTrends: true,
        tenantBillingModel: true,
        billingGovernanceOverview: true,
        subscriptionLifecycle: true,
        renewalGovernance: true,
        analyticsIntegration: true,
        billingIntelligence: true,
        billingSummaries: true,
        accessGovernance: true,
        integrationHealth: true,
        governanceDashboard: true,
        activeSubscriptions: true,
        trialSubscriptions: true,
        pastDueSubscriptions: true,
        limitedSubscriptions: true,
        suspendedSubscriptions: true,
        cancelledSubscriptions: true,
        archivedSubscriptions: true,
        totalSubscriptions: true,
        planDistribution: true,
        usageTierDistribution: true,
        invoiceFoundations: true,
        paymentStateTracking: true,
        renewalWorkflowHealth: true,
        subscriptionGrowth: true,
        subscriptionRetentionTrends: true,
        usageBasedGrowthPatterns: true,
        operationalBillingDensity: true,
        tenantLifecycleRevenueTrends: true,
        featureAdoptionVsSubscription: true,
        renewalHealthIndicators: true,
        usageLinkedSubscriptionTiers: true,
        operationalConsumptionTrends: true,
        storageLinkedBillingGrowth: true,
        workflowUsageDensity: true,
        onboardingLinkedActivationAnalytics: true,
        workflowUsage: true,
        storageGrowthBytes: true,
        featureUsage: true,
        onboardingActivation: true,
        crossTenantBillingLeakageBlocked: true,
        unsafeFinancialExposureBlocked: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        payrollVisibility: true,
        confidentialHrRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        superAdminFinancialGovernanceAccess: true,
        superAdminInfrastructureOnly: true,
        platformOwnerTenantRbacIsolation: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        billingGovernanceIsolationPreserved: true,
        billingGovernanceAuthority: true,
        historicalBillingRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        billingGovernanceActionsAuditable: true,
        tenantUsageIntegrated: true,
        platformAnalyticsIntegrated: true,
        tenantGovernanceIntegrated: true,
        workflowTelemetryIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        anomalyDetectionReady: true,
        subscriptionCount: true
    });

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                global.console.warn(PREFIX, message, details || '');
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            var state = source && typeof source.get === 'function' ? source.get() || {} : {};
            var projection = global.PlatformAggregateIntegrationService?.getProjection?.() || {};
            return Object.assign({}, state, projection);
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') source.save(data);
        } catch (error) {}
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '')
            .trim()
            .toLowerCase()
            .replace(/^tenant[-_]/, '')
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9_-]/g, '')
            .replace(/_+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function normalizePlanKey(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unassigned';
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.targetTenantSlug || row.targetTenantId));
    }

    function targetTenant(record, context) {
        return normalizeTenantSlug(record && (record.targetTenantSlug || record.targetTenantId || record.tenantSlug || record.tenantId || record.companyId)) || contextTenant(context);
    }

    function sameTenant(left, right) {
        var a = normalizeTenantSlug(left);
        var b = normalizeTenantSlug(right);
        return !!a && !!b && a === b;
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key], refs); });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function sanitizedValue(value, key, seen) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
            return value.map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) {
            return input.map(function item(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_BILLING_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeBillingOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'TENANT_BILLING_FAILURE'),
            classification: classification || CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Tenant billing governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'TENANT_BILLING_WARNING'),
            classification: CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Tenant billing governance warning.', '')
        };
        if (metadata && typeof metadata === 'object') warning.metadata = cloneSanitized(metadata);
        return deepFreeze(warning);
    }

    function highestClassification(values) {
        var order = {};
        order[CLASSIFICATIONS.INFO] = 0;
        order[CLASSIFICATIONS.WARNING] = 1;
        order[CLASSIFICATIONS.HIGH_RISK] = 2;
        order[CLASSIFICATIONS.CRITICAL_BLOCKER] = 3;
        return (values || []).reduce(function choose(current, value) {
            var normalized = CLASSIFICATIONS[normalizeToken(value)] || value || CLASSIFICATIONS.INFO;
            return (order[normalized] || 0) > (order[current] || 0) ? normalized : current;
        }, CLASSIFICATIONS.INFO);
    }

    function normalizeBillingState(value) {
        var state = normalizeToken(value || 'ACTIVE');
        if (state === 'PASTDUE' || state === 'DUE' || state === 'PAST_DUE') return 'PAST_DUE';
        if (state === 'LIMIT' || state === 'LIMITED') return 'LIMITED';
        if (state === 'SUSPEND' || state === 'SUSPENDED') return 'SUSPENDED';
        if (state === 'CANCEL' || state === 'CANCELLED' || state === 'CANCELED') return 'CANCELLED';
        if (state === 'ARCHIVE' || state === 'ARCHIVED') return 'ARCHIVED';
        if (state === 'TRIAL') return 'TRIAL';
        return BILLING_STATES.indexOf(state) !== -1 ? state : 'ACTIVE';
    }

    function failureState(row) {
        return /FAILED|FAILURE|ERROR|PAST_DUE|SUSPENDED|LIMITED|REJECTED|BLOCKED|DEGRADED|DENIED/i.test([
            row && row.status,
            row && row.state,
            row && row.billingState,
            row && row.invoiceState,
            row && row.paymentStatus,
            row && row.renewalStatus,
            row && row.failureReason
        ].join(' '));
    }

    function tenantRows(data) {
        var rows = list(data, 'platformTenants').concat(list(data, 'tenantGovernanceRecords'), list(data, 'tenants'));
        return rows.length ? rows : [];
    }

    function billingRows(data) {
        return list(data, 'tenantBillingRecords').concat(list(data, 'subscriptionRecords'), list(data, 'tenantSubscriptionRecords'), list(data, 'billingGovernanceRecords'));
    }

    function planRows(data) {
        return list(data, 'billingPlanRecords').concat(list(data, 'planRecords'), list(data, 'subscriptionPlanRecords'));
    }

    function invoiceRows(data) {
        return list(data, 'invoiceFoundationRecords').concat(list(data, 'invoiceRecords'), list(data, 'billingInvoiceRecords'));
    }

    function paymentRows(data) {
        return list(data, 'paymentStateRecords').concat(list(data, 'paymentRecords'), list(data, 'billingPaymentRecords'));
    }

    function usageRows(data) {
        return list(data, 'tenantUsageRecords').concat(list(data, 'tenantConsumptionRecords'), list(data, 'usageAnalyticsRecords'));
    }

    function workflowRows(data) {
        return list(data, 'workflowTelemetryEvents').concat(list(data, 'workflowEvents'), list(data, 'workflowTelemetry'));
    }

    function filterTenant(rows, tenant) {
        if (!tenant) return (rows || []).slice();
        return (rows || []).filter(function match(row) { return sameTenant(rowTenant(row), tenant); });
    }

    function classifyBillingRisk(signal) {
        try {
            var item = signal || {};
            var severity = normalizeToken(item.severity || item.classification || '');
            if (severity === 'CRITICAL' || severity === 'CRITICAL_BLOCKER') return CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.crossTenant || item.rawConfidentialTenantData || item.rawTenantDataAccess || item.salaryVisibility || item.leaveBalanceVisibility || item.payrollVisibility || item.financialExposure || item.unsafeFinancialExposure || item.superAdminFinancialGovernanceAccess) {
                return CLASSIFICATIONS.CRITICAL_BLOCKER;
            }
            if (item.permissionBypass || item.platformOwnerTenantRbacExposure || item.rawDocumentExposure) return CLASSIFICATIONS.CRITICAL_BLOCKER;
            if ((safeNumber(item.renewalFailures, 0) > 0 && item.billingRestriction) || item.subscriptionAnomaly || item.abnormalUsageGrowth || item.billingState === 'PAST_DUE' || item.billingState === 'SUSPENDED') return CLASSIFICATIONS.HIGH_RISK;
            if (item.downgradeTrend || item.upgradeTrend || item.inactiveBillingAccount || item.paymentFailure || item.billingRestriction) return CLASSIFICATIONS.WARNING;
            return CLASSIFICATIONS.INFO;
        } catch (error) {
            return CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function validateBillingScope(scope, context) {
        try {
            var record = scope || {};
            var ctx = context || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || 'PLATFORM');
            var actorTenant = contextTenant(ctx);
            var target = targetTenant(record, ctx);
            var infrastructureOnly = record.infrastructureOnly === true || record.billingInfrastructureMonitoring === true || normalizeToken(record.mode || '') === 'INFRASTRUCTURE_MONITORING';
            var failures = [];
            var visibility = VISIBILITY.NONE;
            var billingGovernanceAuthority = false;

            if (record.rawTenantDataAccess || record.employeeLevelAccess || record.rawConfidentialTenantData || record.rawPayloadAccess) {
                failures.push(safeFailure('RAW_CONFIDENTIAL_BILLING_DATA_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Raw confidential billing data access was blocked.'));
            }
            if (record.salaryVisibility || record.payrollVisibility || record.leaveBalanceVisibility || record.financialGovernanceAccess || record.planAssignmentRequested || record.subscriptionMutationRequested || record.analyticsExportAttempt) {
                if (role === 'SUPER_ADMIN') {
                    failures.push(safeFailure('SUPER_ADMIN_FINANCIAL_GOVERNANCE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN billing visibility is infrastructure-only. Financial governance is blocked.'));
                } else if (role !== 'PLATFORM_OWNER') {
                    failures.push(safeFailure('TENANT_FINANCIAL_GOVERNANCE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant roles cannot access platform billing governance.'));
                }
            }
            if (normalizeBillingState(record.billingState || record.state) === 'ARCHIVED' && (record.mutationRequested || record.updateRequested || record.deleteRequested || record.overrideRequested || record.planAssignmentRequested)) {
                failures.push(safeFailure('ARCHIVED_BILLING_MUTATION_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived tenant billing records are immutable.'));
            }

            if (role === 'PLATFORM_OWNER') {
                visibility = VISIBILITY.ISOLATED_BILLING_GOVERNANCE;
                billingGovernanceAuthority = true;
                if (routeType && routeType !== 'PLATFORM') {
                    failures.push(safeFailure('PLATFORM_OWNER_TENANT_UI_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER billing governance is isolated to platform-control.'));
                }
            } else if (role === 'SUPER_ADMIN') {
                visibility = VISIBILITY.BILLING_INFRASTRUCTURE_ONLY;
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_INFRASTRUCTURE_ONLY_BILLING', CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN may only monitor billing infrastructure health.'));
                }
                if (actorTenant && target && actorTenant !== target) {
                    failures.push(safeFailure('SUPER_ADMIN_CROSS_TENANT_BILLING_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN cross-tenant billing traversal was blocked.'));
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_BILLING_GOVERNANCE_BLOCKED', CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant roles cannot access platform billing governance.'));
            }

            return freezeBillingOutput({
                success: !failures.length,
                allowed: !failures.length,
                classification: highestClassification(failures.map(function map(row) { return row.classification; })),
                visibility: visibility,
                failures: failures,
                metadata: {
                    aggregateOnly: true,
                    readOnly: true,
                    infrastructureOnly: role === 'SUPER_ADMIN' ? infrastructureOnly : false,
                    billingGovernanceAuthority: billingGovernanceAuthority,
                    tenantIsolationPreserved: !failures.some(function critical(row) { return row.failureCode === 'RAW_CONFIDENTIAL_BILLING_DATA_BLOCKED' || row.failureCode === 'SUPER_ADMIN_CROSS_TENANT_BILLING_BLOCKED'; }),
                    billingGovernanceIsolationPreserved: true,
                    historicalBillingRecordsImmutable: true,
                    platformOwnerTenantRbacIsolation: true
                }
            });
        } catch (error) {
            return freezeBillingOutput({
                success: false,
                allowed: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('TENANT_BILLING_SCOPE_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Tenant billing scope validation failed safely.')]
            });
        }
    }

    function normalizeBillingPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeBillingOutput({
                    success: false,
                    classification: CLASSIFICATIONS.WARNING,
                    state: 'LIMITED',
                    failures: [safeFailure('MALFORMED_BILLING_PAYLOAD', CLASSIFICATIONS.WARNING, 'Tenant billing payload is malformed.')]
                });
            }
            var state = normalizeBillingState(payload.state || payload.billingState || payload.status || 'ACTIVE');
            var normalized = {
                billingId: safeString(payload.billingId || payload.id || '', ''),
                subscriptionId: safeString(payload.subscriptionId || payload.subId || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || contextTenant(context)),
                state: state,
                billingState: state,
                billingType: normalizeToken(payload.billingType || payload.type || 'SUBSCRIPTION'),
                planKey: normalizePlanKey(payload.planKey || payload.plan || payload.planType),
                planTier: normalizeToken(payload.planTier || payload.tier || payload.planType || 'UNASSIGNED'),
                usageTier: normalizeToken(payload.usageTier || payload.usageBand || 'STANDARD'),
                invoiceState: normalizeToken(payload.invoiceState || payload.invoiceStatus || 'UNISSUED'),
                paymentStatus: normalizeToken(payload.paymentStatus || payload.paymentState || 'UNKNOWN'),
                renewalStatus: normalizeToken(payload.renewalStatus || payload.renewalState || 'UNKNOWN'),
                renewalFailures: safeNumber(payload.renewalFailures || payload.renewalFailureCount || payload.retryCount, 0),
                billingRestriction: payload.billingRestriction === true || state === 'LIMITED' || state === 'SUSPENDED',
                abnormalUsageGrowth: payload.abnormalUsageGrowth === true || payload.usageSpike === true,
                storageGrowthBytes: safeNumber(payload.storageGrowthBytes || payload.storageGrowth || 0, 0),
                workflowUsage: safeNumber(payload.workflowUsage || payload.workflowEvents || 0, 0),
                featureUsage: safeNumber(payload.featureUsage || payload.featureEvents || 0, 0),
                onboardingActivation: safeNumber(payload.onboardingActivation || payload.onboardingCompletions || 0, 0),
                metadata: {
                    readOnly: true,
                    aggregateOnly: true,
                    billingGovernanceIsolationPreserved: true,
                    historicalBillingRecordsImmutable: true,
                    tenantIsolationPreserved: true
                }
            };
            return freezeBillingOutput({
                success: true,
                classification: classifyBillingRisk(normalized),
                payload: normalized
            });
        } catch (error) {
            return freezeBillingOutput({
                success: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                state: 'LIMITED',
                failures: [safeFailure('BILLING_PAYLOAD_NORMALIZATION_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Tenant billing normalization failed safely.')]
            });
        }
    }

    function collectTenantSlices(data, tenant) {
        return {
            tenants: filterTenant(tenantRows(data), tenant),
            billing: filterTenant(billingRows(data), tenant),
            plans: planRows(data),
            invoices: filterTenant(invoiceRows(data), tenant),
            payments: filterTenant(paymentRows(data), tenant),
            usage: filterTenant(usageRows(data), tenant),
            workflows: filterTenant(workflowRows(data), tenant)
        };
    }

    function countBy(rows, getter) {
        return (rows || []).reduce(function reduce(acc, row) {
            var key = safeString(getter(row) || 'unknown', 'unknown').trim() || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    }

    function calculateBillingMetrics(slices) {
        var billing = slices.billing || [];
        var invoices = slices.invoices || [];
        var payments = slices.payments || [];
        var usage = slices.usage || [];
        var renewalFailures = billing.filter(function failed(row) {
            return safeNumber(row && (row.renewalFailures || row.renewalFailureCount), 0) > 0 || /FAILED|PAST_DUE/i.test([row && row.renewalStatus, row && row.invoiceState, row && row.paymentStatus].join(' '));
        }).length + invoices.filter(function failed(row) { return row && (row.renewalFailure === true || failureState(row)); }).length;
        var subscriptionAnomalies = billing.filter(function anomaly(row) {
            var state = normalizeBillingState(row && (row.billingState || row.state));
            return state === 'PAST_DUE' || state === 'LIMITED' || state === 'SUSPENDED' || row.billingRestriction === true;
        }).length;
        var abnormalUsageGrowth = billing.filter(function growth(row) {
            return row && (row.abnormalUsageGrowth === true || safeNumber(row.storageGrowthBytes, 0) >= 5000 || safeNumber(row.workflowUsage || row.workflowEvents, 0) >= 100);
        }).length + usage.filter(function growth(row) {
            return row && (row.activitySpike === true || safeNumber(row.storageGrowthBytes, 0) >= 5000 || safeNumber(row.workflowEvents, 0) >= 100);
        }).length;
        var paymentFailures = payments.filter(failureState).length + billing.filter(function failed(row) { return /FAILED|PAST_DUE/i.test([row && row.paymentStatus, row && row.invoiceState].join(' ')); }).length;
        return {
            activeSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'ACTIVE'; }).length,
            trialSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'TRIAL'; }).length,
            pastDueSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'PAST_DUE'; }).length,
            limitedSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'LIMITED'; }).length,
            suspendedSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'SUSPENDED'; }).length,
            cancelledSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'CANCELLED'; }).length,
            archivedSubscriptions: billing.filter(function row(row) { return normalizeBillingState(row && (row.billingState || row.state)) === 'ARCHIVED'; }).length,
            totalSubscriptions: billing.length,
            planDistribution: countBy(billing, function plan(row) { return normalizePlanKey(row && (row.planKey || row.planType || row.plan)); }),
            usageTierDistribution: countBy(billing, function tier(row) { return normalizeToken(row && (row.usageTier || row.usageBand || 'STANDARD')); }),
            invoiceFoundations: invoices.length,
            paymentStateTracking: payments.length,
            renewalFailures: renewalFailures,
            subscriptionAnomalies: subscriptionAnomalies,
            abnormalUsageGrowth: abnormalUsageGrowth,
            billingRestrictionEvents: billing.filter(function restricted(row) { return row && (row.billingRestriction === true || normalizeBillingState(row.billingState || row.state) === 'LIMITED'); }).length,
            inactiveBillingAccounts: billing.filter(function inactive(row) { return /CANCELLED|ARCHIVED|SUSPENDED/i.test(normalizeBillingState(row && (row.billingState || row.state))); }).length,
            paymentFailures: paymentFailures,
            workflowUsage: billing.reduce(function total(sum, row) { return sum + safeNumber(row && (row.workflowUsage || row.workflowEvents), 0); }, 0) + usage.reduce(function total(sum, row) { return sum + safeNumber(row && row.workflowEvents, 0); }, 0),
            storageGrowthBytes: billing.reduce(function total(sum, row) { return sum + safeNumber(row && row.storageGrowthBytes, 0); }, 0) + usage.reduce(function total(sum, row) { return sum + safeNumber(row && row.storageGrowthBytes, 0); }, 0),
            featureUsage: billing.reduce(function total(sum, row) { return sum + safeNumber(row && (row.featureUsage || row.featureEvents), 0); }, 0) + usage.reduce(function total(sum, row) { return sum + safeNumber(row && row.featureEvents, 0); }, 0),
            onboardingActivation: billing.reduce(function total(sum, row) { return sum + safeNumber(row && (row.onboardingActivation || row.onboardingCompletions), 0); }, 0)
        };
    }

    function detectBillingAnomalies(filters, context) {
        try {
            var data = rawData();
            var tenant = targetTenant(filters || {}, context || {});
            var slices = collectTenantSlices(data, tenant);
            var metrics = calculateBillingMetrics(slices);
            var signals = [];
            if (metrics.renewalFailures) signals.push(safeWarning('RENEWAL_FAILURES', 'Renewal failures detected.', { count: metrics.renewalFailures }));
            if (metrics.subscriptionAnomalies) signals.push(safeWarning('SUBSCRIPTION_ANOMALIES', 'Subscription lifecycle anomalies detected.', { count: metrics.subscriptionAnomalies }));
            if (metrics.abnormalUsageGrowth) signals.push(safeWarning('ABNORMAL_USAGE_GROWTH', 'Usage-linked billing growth anomaly detected.', { count: metrics.abnormalUsageGrowth }));
            if (metrics.billingRestrictionEvents) signals.push(safeWarning('BILLING_RESTRICTIONS', 'Billing restriction events detected.', { count: metrics.billingRestrictionEvents }));
            if (metrics.paymentFailures) signals.push(safeWarning('PAYMENT_FAILURES', 'Payment state failures detected.', { count: metrics.paymentFailures }));
            return freezeBillingOutput({
                success: true,
                classification: signals.length ? CLASSIFICATIONS.WARNING : CLASSIFICATIONS.INFO,
                state: signals.length ? 'PAST_DUE' : 'ACTIVE',
                summary: {
                    renewalFailures: metrics.renewalFailures,
                    subscriptionAnomalies: metrics.subscriptionAnomalies,
                    abnormalUsageGrowth: metrics.abnormalUsageGrowth,
                    billingRestrictionEvents: metrics.billingRestrictionEvents,
                    inactiveBillingAccounts: metrics.inactiveBillingAccounts,
                    paymentFailures: metrics.paymentFailures
                },
                healthSignals: signals,
                metadata: {
                    aggregateOnly: true,
                    billingGovernanceIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    anomalyDetectionReady: true
                }
            });
        } catch (error) {
            safeWarn('Billing anomaly detection failed safely.', error && error.message);
            return freezeBillingOutput({
                success: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                state: 'LIMITED',
                summary: {
                    renewalFailures: 0,
                    subscriptionAnomalies: 0,
                    abnormalUsageGrowth: 0,
                    billingRestrictionEvents: 0,
                    inactiveBillingAccounts: 0,
                    paymentFailures: 0
                },
                failures: [safeFailure('BILLING_ANOMALY_DETECTION_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Billing anomaly detection failed safely.')]
            });
        }
    }

    function billingSummary(row) {
        var normalized = normalizeBillingPayload(row || {}, {});
        var payload = normalized.payload || {};
        return {
            billingId: payload.billingId || '',
            subscriptionId: payload.subscriptionId || '',
            tenantSlug: payload.tenantSlug || rowTenant(row),
            billingState: payload.billingState || 'ACTIVE',
            planKey: payload.planKey || 'unassigned',
            planTier: payload.planTier || 'UNASSIGNED',
            usageTier: payload.usageTier || 'STANDARD',
            renewalStatus: payload.renewalStatus || 'UNKNOWN',
            paymentStatus: payload.paymentStatus || 'UNKNOWN',
            invoiceState: payload.invoiceState || 'UNISSUED',
            classification: classifyBillingRisk(payload),
            renewalFailures: payload.renewalFailures || 0,
            billingRestriction: !!payload.billingRestriction,
            abnormalUsageGrowth: !!payload.abnormalUsageGrowth,
            workflowUsage: payload.workflowUsage || 0,
            storageGrowthBytes: payload.storageGrowthBytes || 0,
            featureUsage: payload.featureUsage || 0
        };
    }

    function integrationHealth() {
        return {
            tenantUsageIntegrated: !!(global.TenantUsageIntelligenceService || global.tenantUsageIntelligenceService),
            platformAnalyticsIntegrated: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
            tenantGovernanceIntegrated: !!(global.TenantGovernanceService || global.tenantGovernanceService),
            workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
            auditReady: !!(global.AuditService || global.auditService),
            telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
            metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService),
            anomalyDetectionReady: true
        };
    }

    function baseAccessGovernance(scope, role) {
        var superAdmin = normalizeRole(role) === 'SUPER_ADMIN';
        return {
            crossTenantBillingLeakageBlocked: true,
            unsafeFinancialExposureBlocked: true,
            salaryVisibility: false,
            leaveBalanceVisibility: false,
            payrollVisibility: false,
            confidentialHrRecordsVisible: false,
            rawTenantDocumentsVisible: false,
            superAdminFinancialGovernanceAccess: false,
            superAdminInfrastructureOnly: superAdmin,
            platformOwnerTenantRbacIsolation: true,
            platformIsolationPreserved: true,
            tenantIsolationPreserved: scope && scope.metadata ? scope.metadata.tenantIsolationPreserved !== false : true,
            billingGovernanceIsolationPreserved: true,
            historicalBillingRecordsImmutable: true,
            existingTenantWorkflowsPreserved: true,
            billingGovernanceActionsAuditable: true,
            billingGovernanceAuthority: scope && scope.metadata ? scope.metadata.billingGovernanceAuthority === true : false
        };
    }

    function recordAuditAndTelemetry(action, report, context) {
        var ctx = context || {};
        var data = rawData();
        var timestamp = nowIso(ctx);
        var metadata = {
            tenantSlug: report && report.tenantBillingModel && report.tenantBillingModel.tenantSlug || '',
            classification: report && report.classification || CLASSIFICATIONS.INFO,
            aggregateOnly: true,
            confidentialFiltering: true
        };
        if (!ctx.skipAuditPersistence) {
            try {
                if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                    global.AuditService.recordAudit({
                        action: action,
                        actionType: action,
                        type: 'TENANT_BILLING_GOVERNANCE',
                        module: 'Tenant Billing',
                        severity: metadata.classification === CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : metadata.classification === CLASSIFICATIONS.HIGH_RISK ? 'ERROR' : metadata.classification === CLASSIFICATIONS.WARNING ? 'WARNING' : 'INFO',
                        description: 'Tenant billing governance access recorded.',
                        metadata: metadata
                    }, { actor: ctx.actor || {}, skipPersistence: false });
                }
            } catch (error) {}
            try {
                data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
                data.auditLogs.unshift({
                    id: 'TBG-AUD-' + Date.now(),
                    action: action,
                    type: 'TENANT_BILLING_GOVERNANCE',
                    eventType: action,
                    module: 'Tenant Billing',
                    timestamp: timestamp,
                    metadata: cloneSanitized(metadata)
                });
            } catch (error) {}
        }
        if (!ctx.skipTelemetry) {
            try {
                if (global.WorkflowTelemetryService && typeof global.WorkflowTelemetryService.emitWorkflowTelemetry === 'function') {
                    global.WorkflowTelemetryService.emitWorkflowTelemetry(action, {
                        source: 'TenantBillingService',
                        severity: metadata.classification === CLASSIFICATIONS.INFO ? 'INFO' : 'WARNING',
                        metadata: metadata
                    });
                }
            } catch (error) {}
            try {
                data.workflowTelemetry = Array.isArray(data.workflowTelemetry) ? data.workflowTelemetry : [];
                data.workflowTelemetry.unshift({
                    telemetryId: 'TBG-TEL-' + Date.now(),
                    eventType: action,
                    metricType: 'TENANT_BILLING_GOVERNANCE',
                    source: 'TenantBillingService',
                    timestamp: timestamp,
                    metadata: cloneSanitized(metadata)
                });
            } catch (error) {}
        }
        if (!ctx.skipMetrics) {
            try {
                if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') {
                    global.OrchestrationMetricsService.recordWorkflowMetric('TENANT_BILLING_GOVERNANCE', {
                        status: 'RECORDED',
                        severity: metadata.classification === CLASSIFICATIONS.INFO ? 'INFO' : 'WARNING',
                        tenantSlug: metadata.tenantSlug
                    });
                }
            } catch (error) {}
            try {
                data.orchestrationMetrics = Array.isArray(data.orchestrationMetrics) ? data.orchestrationMetrics : [];
                data.orchestrationMetrics.unshift({
                    metric: 'tenant_billing_governance',
                    metricType: 'tenant_billing_governance',
                    name: 'tenant_billing_report',
                    timestamp: timestamp,
                    metadata: cloneSanitized(metadata)
                });
            } catch (error) {}
        }
        saveData(data);
    }

    function generateTenantBillingReport(filters, context) {
        try {
            var input = filters || {};
            var ctx = context || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var scope = validateBillingScope(input, ctx);
            if (!scope.allowed) {
                return freezeBillingOutput({
                    success: false,
                    classification: scope.classification,
                    tenantBillingModel: {
                        version: VERSION,
                        state: 'LIMITED',
                        readOnly: true,
                        aggregateOnly: true,
                        generatedAt: nowIso(ctx)
                    },
                    accessGovernance: baseAccessGovernance(scope, role),
                    failures: scope.failures,
                    integrationHealth: integrationHealth(),
                    billingSummaries: []
                });
            }

            var data = rawData();
            var tenant = targetTenant(input, ctx);
            var slices = collectTenantSlices(data, tenant);
            var metrics = calculateBillingMetrics(slices);
            var anomalies = detectBillingAnomalies(input, ctx);
            var infrastructureOnly = role === 'SUPER_ADMIN';
            var summaries = infrastructureOnly ? [] : slices.billing.map(billingSummary).slice(0, 25);
            var risk = classifyBillingRisk({
                renewalFailures: metrics.renewalFailures,
                billingRestriction: metrics.billingRestrictionEvents > 0,
                subscriptionAnomaly: metrics.subscriptionAnomalies > 0,
                abnormalUsageGrowth: metrics.abnormalUsageGrowth > 0
            });
            var classification = highestClassification([risk, scope.classification]);
            var state = metrics.suspendedSubscriptions ? 'SUSPENDED' :
                metrics.pastDueSubscriptions ? 'PAST_DUE' :
                metrics.limitedSubscriptions ? 'LIMITED' :
                metrics.trialSubscriptions && !metrics.activeSubscriptions ? 'TRIAL' : 'ACTIVE';
            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                tenantBillingModel: {
                    version: VERSION,
                    state: state,
                    states: BILLING_STATES.slice(),
                    billingTypes: BILLING_TYPES.slice(),
                    tenantSlug: tenant,
                    readOnly: true,
                    aggregateOnly: true,
                    generatedAt: nowIso(ctx)
                },
                billingGovernanceOverview: {
                    totalSubscriptions: metrics.totalSubscriptions,
                    activeSubscriptions: metrics.activeSubscriptions,
                    trialSubscriptions: metrics.trialSubscriptions,
                    pastDueSubscriptions: metrics.pastDueSubscriptions,
                    limitedSubscriptions: metrics.limitedSubscriptions,
                    suspendedSubscriptions: metrics.suspendedSubscriptions,
                    cancelledSubscriptions: metrics.cancelledSubscriptions,
                    archivedSubscriptions: metrics.archivedSubscriptions,
                    planDistribution: metrics.planDistribution,
                    usageTierDistribution: metrics.usageTierDistribution
                },
                subscriptionLifecycle: {
                    planAssignment: slices.plans.length,
                    subscriptionActivation: metrics.activeSubscriptions,
                    suspensionGovernance: metrics.suspendedSubscriptions + metrics.limitedSubscriptions,
                    billingRestrictionHandling: metrics.billingRestrictionEvents,
                    invoiceLifecycleTracking: metrics.invoiceFoundations,
                    archivalGovernance: metrics.archivedSubscriptions,
                    historicalBillingRecordsImmutable: true
                },
                renewalGovernance: {
                    renewalWorkflowHealth: metrics.renewalFailures ? 'REVIEW' : 'HEALTHY',
                    renewalFailures: metrics.renewalFailures,
                    paymentFailures: metrics.paymentFailures,
                    inactiveBillingAccounts: metrics.inactiveBillingAccounts,
                    billingRestrictionEvents: metrics.billingRestrictionEvents
                },
                analyticsIntegration: {
                    usageLinkedSubscriptionTiers: Object.keys(metrics.usageTierDistribution).length,
                    operationalConsumptionTrends: metrics.workflowUsage + metrics.featureUsage,
                    storageLinkedBillingGrowth: metrics.storageGrowthBytes,
                    workflowUsageDensity: metrics.workflowUsage,
                    onboardingLinkedActivationAnalytics: metrics.onboardingActivation,
                    tenantUsageIntegrated: integrationHealth().tenantUsageIntegrated,
                    platformAnalyticsIntegrated: integrationHealth().platformAnalyticsIntegrated
                },
                billingIntelligence: {
                    subscriptionGrowth: metrics.totalSubscriptions,
                    subscriptionRetentionTrends: Math.max(0, metrics.activeSubscriptions - metrics.cancelledSubscriptions),
                    usageBasedGrowthPatterns: metrics.abnormalUsageGrowth,
                    operationalBillingDensity: metrics.workflowUsage + metrics.featureUsage + metrics.onboardingActivation,
                    tenantLifecycleRevenueTrends: metrics.planDistribution,
                    featureAdoptionVsSubscription: metrics.featureUsage,
                    renewalHealthIndicators: metrics.renewalFailures + metrics.paymentFailures
                },
                accessGovernance: baseAccessGovernance(scope, role),
                integrationHealth: integrationHealth(),
                billingSummaries: summaries,
                governanceDashboard: {
                    state: state,
                    renewalFailures: metrics.renewalFailures,
                    subscriptionAnomalies: metrics.subscriptionAnomalies,
                    abnormalUsageGrowth: metrics.abnormalUsageGrowth,
                    billingRestrictionEvents: metrics.billingRestrictionEvents,
                    billingGovernanceIsolationPreserved: true
                },
                healthSignals: anomalies.healthSignals || []
            };
            recordAuditAndTelemetry('TENANT_BILLING_GOVERNANCE_REVIEWED', report, ctx);
            return freezeBillingOutput(report);
        } catch (error) {
            safeWarn('Tenant billing report failed safely.', error && error.message);
            return freezeBillingOutput({
                success: false,
                classification: CLASSIFICATIONS.HIGH_RISK,
                tenantBillingModel: {
                    version: VERSION,
                    state: 'LIMITED',
                    readOnly: true,
                    aggregateOnly: true,
                    generatedAt: nowIso(context || {})
                },
                failures: [safeFailure('TENANT_BILLING_REPORT_FAILED_SAFE', CLASSIFICATIONS.HIGH_RISK, 'Tenant billing report failed safely.')],
                integrationHealth: integrationHealth(),
                billingSummaries: []
            });
        }
    }

    function runSelfTest() {
        var tests = [];
        function record(name, ok, details) {
            tests.push(Object.freeze({ name: name, ok: !!ok, details: details || null }));
        }
        var previousUsage = global.TenantUsageIntelligenceService;
        var previousPlatform = global.PlatformAnalyticsService;
        try {
            var malformed = normalizeBillingPayload(null, { actor: { role: 'PLATFORM_OWNER' } });
            record('malformed payloads fail safely', malformed.success === false && malformed.classification === CLASSIFICATIONS.WARNING, malformed);

            var frozen = freezeBillingOutput({ salary: 10, nested: { leaveBalance: 2, subscriptionCount: 3 } });
            record('immutability enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && frozen.nested.subscriptionCount === 3 && typeof frozen.salary === 'undefined', frozen);

            var owner = validateBillingScope({ tenantSlug: 'self' }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            var tenantDenied = validateBillingScope({ tenantSlug: 'self' }, { routeType: 'tenant', actor: { role: 'DIRECTOR', tenantSlug: 'self' } });
            var superAdminDenied = validateBillingScope({ financialGovernanceAccess: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN' } });
            record('billing isolation works', owner.allowed === true && tenantDenied.allowed === false && superAdminDenied.allowed === false, { owner: owner.allowed, tenantDenied: tenantDenied.allowed, superAdminDenied: superAdminDenied.allowed });

            var archived = validateBillingScope({ billingState: 'ARCHIVED', mutationRequested: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            record('subscription governance blocks archived mutation', archived.allowed === false, archived);

            var anomalies = detectBillingAnomalies({
                tenantSlug: 'self',
                records: [{ tenantSlug: 'self', billingState: 'PAST_DUE', renewalFailures: 1, billingRestriction: true, abnormalUsageGrowth: true }]
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            var risk = classifyBillingRisk({ renewalFailures: 1, billingRestriction: true });
            record('renewal tracking and billing analytics work', anomalies.success === true && risk === CLASSIFICATIONS.HIGH_RISK, { anomalies: anomalies.summary, risk: risk });

            global.TenantUsageIntelligenceService = undefined;
            global.tenantUsageIntelligenceService = undefined;
            global.PlatformAnalyticsService = undefined;
            global.platformAnalyticsService = undefined;
            var degraded = generateTenantBillingReport({ tenantSlug: 'self' }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('dependency absence is safe', degraded.success === true && degraded.integrationHealth.tenantUsageIntegrated === false && degraded.integrationHealth.platformAnalyticsIntegrated === false, degraded.integrationHealth);
        } catch (error) {
            record('self-test exception isolation', false, { message: error && error.message ? error.message : safeString(error, 'unknown') });
        } finally {
            global.TenantUsageIntelligenceService = previousUsage;
            global.tenantUsageIntelligenceService = previousUsage;
            global.PlatformAnalyticsService = previousPlatform;
            global.platformAnalyticsService = previousPlatform;
        }
        return freezeBillingOutput({
            passed: tests.every(function pass(test) { return test.ok; }),
            tests: tests
        });
    }

    var TenantBillingService = Object.freeze({
        VERSION: VERSION,
        BILLING_STATES: BILLING_STATES,
        BILLING_TYPES: BILLING_TYPES,
        CLASSIFICATIONS: CLASSIFICATIONS,
        validateBillingScope: validateBillingScope,
        classifyBillingRisk: classifyBillingRisk,
        normalizeBillingPayload: normalizeBillingPayload,
        freezeBillingOutput: freezeBillingOutput,
        detectBillingAnomalies: detectBillingAnomalies,
        generateTenantBillingReport: generateTenantBillingReport,
        runSelfTest: runSelfTest
    });

    global.TenantBillingService = TenantBillingService;
    global.tenantBillingService = TenantBillingService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_TENANT_BILLING_SELF_TEST__ = runSelfTest();
        try {
            if (global.console && typeof global.console.info === 'function') {
                console.info(PREFIX, 'Development self-test ' + (global.__ARTHHRMS_TENANT_BILLING_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_TENANT_BILLING_SELF_TEST__);
            }
        } catch (error) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
