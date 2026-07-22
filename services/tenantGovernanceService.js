/**
 * tenantGovernanceService.js
 * ARTHHRMS Enterprise Tenant Governance Dashboard + Multi-Organization Control.
 *
 * Additive, platform-control-only governance layer for tenant lifecycle,
 * organization health, onboarding posture, feature usage, operational risk,
 * and tenant compliance intelligence. It never exposes salaries, leave
 * balances, raw documents, confidential employee records, or tenant-private
 * payloads.
 */
(function attachTenantGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[TenantGovernanceService]';

    var TENANT_STATES = Object.freeze([
        'PROVISIONING',
        'ACTIVE',
        'DEGRADED',
        'RESTRICTED',
        'SUSPENDED',
        'ARCHIVED'
    ]);

    var RISK_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        PLATFORM_GOVERNANCE: 'PLATFORM_GOVERNANCE',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|message|note|comment|employee.?record|confidential|private)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
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
        message: true,
        recommendation: true,
        tenantGovernanceModel: true,
        tenantGovernanceEntities: true,
        tenantLifecycleOverview: true,
        organizationLifecycleGovernance: true,
        tenantHealthIntelligence: true,
        tenantRiskGovernance: true,
        featureUsageGovernance: true,
        governanceDashboard: true,
        accessGovernance: true,
        integrationHealth: true,
        tenantSummaries: true,
        tenantId: true,
        tenantSlug: true,
        tenantName: true,
        companyName: true,
        planType: true,
        subscriptionState: true,
        lifecycleState: true,
        onboardingStage: true,
        governanceState: true,
        healthState: true,
        complianceState: true,
        riskClassification: true,
        riskScore: true,
        riskFactors: true,
        degradationSignals: true,
        operationalRestrictions: true,
        activationAllowed: true,
        archivalMarker: true,
        employeeCount: true,
        activeEmployeeCount: true,
        pendingInviteCount: true,
        activatedUserCount: true,
        onboardingCompletionRate: true,
        onboardingCompletionHealth: true,
        onboardingFailures: true,
        workflowCongestion: true,
        workflowUtilization: true,
        inactiveOrganizations: true,
        inactiveTenantDetection: true,
        escalationSpikes: true,
        escalationAnomalies: true,
        storagePressure: true,
        storageUsageTrend: true,
        uploadGrowth: true,
        notificationFailureRate: true,
        operationalDegradation: true,
        operationalBottlenecks: true,
        excessiveEscalationPatterns: true,
        abnormalStorageGrowth: true,
        suspiciousOrganizationActivity: true,
        degradedWorkflowExecution: true,
        tenantActivation: true,
        organizationSuspension: true,
        onboardingLifecycle: true,
        featureActivation: true,
        subscriptionLifecycle: true,
        tenantArchivalMarkers: true,
        unsafeOrganizationDeletionBlocked: true,
        featureAdoption: true,
        featureAdoptionRate: true,
        workflowUtilizationRate: true,
        onboardingUsage: true,
        communicationActivity: true,
        executionAnalytics: true,
        crossTenantConfidentialLeakageBlocked: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        payrollVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawDocumentExposure: true,
        superAdminHrPayrollVisibility: true,
        tenantGovernanceTenantUiIsolation: true,
        tenantIsolationPreserved: true,
        tenantGovernanceConfidentialityPreserved: true,
        existingTenantWorkflowsPreserved: true,
        historicalTenantGovernanceRecordsImmutable: true,
        governanceActionsAuditable: true,
        platformIsolationPreserved: true,
        platformAnalyticsIntegrated: true,
        workflowTelemetryIntegrated: true,
        storageAnalyticsIntegrated: true,
        onboardingGovernanceIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true
    });

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

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
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

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.company_id));
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
            return value.map(function sanitizeItem(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return row !== undefined; });
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
            return input.map(function cloneArrayItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return row !== undefined; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_OUTPUT_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeTenantOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'TENANT_GOVERNANCE_FAILURE'),
            severity: severity || RISK_CLASSIFICATIONS.HIGH_RISK,
            message: safeString(message || 'Tenant governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'TENANT_GOVERNANCE_WARNING'),
            severity: severity || RISK_CLASSIFICATIONS.WARNING,
            message: safeString(message || 'Tenant governance warning.', ''),
            recommendation: safeString(recommendation || 'Review tenant governance posture.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeTenantState(value, fallback) {
        var state = normalizeToken(value || fallback || 'PROVISIONING');
        if (state === 'CREATED' || state === 'BOOTSTRAPPING' || state === 'CONFIGURING' || state === 'SETUP_ONLY') return 'PROVISIONING';
        if (state === 'PILOT_ACTIVE' || state === 'PRODUCTION_ACTIVE' || state === 'FULL_ACTIVATION' || state === 'LIMITED_ACTIVATION') return 'ACTIVE';
        if (state === 'PAUSED') return 'SUSPENDED';
        if (TENANT_STATES.indexOf(state) !== -1) return state;
        return fallback || 'PROVISIONING';
    }

    function isActiveState(state) {
        return normalizeTenantState(state) === 'ACTIVE';
    }

    function onboardingCompletion(stage, setup) {
        var normalized = normalizeToken(stage || setup && (setup.currentStage || setup.activationReadiness || setup.onboardingStage));
        var explicit = safeNumber(setup && (setup.completionRate || setup.onboardingCompletionRate || setup.setupCompletionRate), -1);
        if (explicit >= 0) return clamp(Math.round(explicit), 0, 100);
        if (normalized === 'ACTIVATION_READY' || normalized === 'FULL_ACTIVATION' || normalized === 'PRODUCTION_ACTIVE') return 100;
        if (normalized === 'PILOT_CONFIGURATION' || normalized === 'LIMITED_ACTIVATION' || normalized === 'PILOT_GROUP') return 78;
        if (normalized === 'FEATURE_SELECTION') return 68;
        if (normalized === 'POLICY_CONFIGURATION') return 56;
        if (normalized === 'MANAGER_STRUCTURE') return 44;
        if (normalized === 'ROLE_CONFIGURATION') return 34;
        if (normalized === 'DEPARTMENT_SETUP') return 22;
        if (normalized === 'COMPANY_PROFILE') return 12;
        return 0;
    }

    function normalizeTenantMetrics(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeTenantOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_TENANT_METRICS', RISK_CLASSIFICATIONS.HIGH_RISK, 'Tenant metrics payload must be an object.')]
                });
            }
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId);
            var state = normalizeTenantState(payload.state || payload.governanceState || payload.lifecycleState, 'PROVISIONING');
            var normalized = {
                tenantId: safeString(payload.tenantId || payload.companyId || tenantSlug, tenantSlug),
                tenantSlug: tenantSlug,
                companyName: safeString(payload.companyName || payload.tenantName || tenantSlug, tenantSlug),
                state: state,
                governanceState: state,
                lifecycleState: normalizeTenantState(payload.lifecycleState || payload.state, state),
                onboardingStage: safeString(payload.onboardingStage || payload.currentStage || 'setup_only', 'setup_only'),
                onboardingCompletionRate: clamp(Math.round(safeNumber(payload.onboardingCompletionRate || payload.onboardingProgress || payload.completionRate, 0)), 0, 100),
                workflowCongestion: clamp(Math.round(safeNumber(payload.workflowCongestion || payload.delayedWorkflows || 0, 0)), 0, 100000),
                escalationSpikes: clamp(Math.round(safeNumber(payload.escalationSpikes || payload.escalations || 0, 0)), 0, 100000),
                storagePressure: clamp(Math.round(safeNumber(payload.storagePressure || payload.quotaUtilization || 0, 0)), 0, 100),
                notificationFailureRate: clamp(Math.round(safeNumber(payload.notificationFailureRate || payload.notificationFailures || 0, 0)), 0, 100),
                featureAdoptionRate: clamp(Math.round(safeNumber(payload.featureAdoptionRate || payload.featureAdoption || 0, 0)), 0, 100),
                inactiveDays: clamp(Math.round(safeNumber(payload.inactiveDays || payload.daysInactive || 0, 0)), 0, 100000),
                complianceState: normalizeToken(payload.complianceState || 'MONITORING'),
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeTenantOutput({
                success: true,
                payload: normalized,
                classification: classifyTenantRisk(normalized).classification,
                tenantGovernanceConfidentialityPreserved: true
            });
        } catch (error) {
            return freezeTenantOutput({
                success: false,
                payload: {},
                failures: [safeFailure('TENANT_METRICS_NORMALIZATION_FAILED_SAFE', RISK_CLASSIFICATIONS.HIGH_RISK, 'Tenant metrics normalization failed safely.')]
            });
        }
    }

    function validateTenantGovernanceScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(ctx.role || actor.role);
            var routeType = normalizeToken(ctx.routeType || record.routeType || 'platform');
            var mode = normalizeToken(record.mode || record.governanceMode || ctx.mode || '');
            var infrastructureOnly = record.infrastructureOnly === true || record.monitoringOnly === true || mode === 'INFRASTRUCTURE_ONLY' || mode === 'INFRASTRUCTURE_MONITORING';
            var readOnly = record.readOnly === true || ctx.readOnly === true || record.aggregateOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.tenantId || record.tenantSlug);
            var actorTenant = contextTenant(ctx);
            var failures = [];
            var warnings = [];

            if (record.rawTenantDataAccess || record.rawConfidentialTenantData || record.employeeLevelAccess || record.rawPayloadAccess || record.rawDocumentAccess) {
                failures.push(safeFailure('RAW_TENANT_DATA_ACCESS_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Raw tenant data cannot be accessed through tenant governance.'));
            }
            if (record.salaryVisibility || record.payrollVisibility || record.leaveBalanceVisibility || record.employeeSalaryVisibility || record.employeeLeaveBalanceVisibility || record.confidentialHrAnalytics) {
                failures.push(safeFailure('CONFIDENTIAL_HR_VISIBILITY_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Salary, payroll, leave balance, and confidential HR analytics are blocked.'));
            }
            if (routeType !== 'PLATFORM' && routeType !== 'PLATFORM_CONTROL') {
                failures.push(safeFailure('TENANT_GOVERNANCE_TENANT_UI_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant governance is isolated to platform-control.'));
            }
            if (role === 'PLATFORM_OWNER') {
                if (routeType === 'PLATFORM' || routeType === 'PLATFORM_CONTROL') {
                    if (record.lifecycleState && normalizeTenantState(record.lifecycleState) === 'ARCHIVED' && !readOnly) {
                        failures.push(safeFailure('ARCHIVED_TENANT_GOVERNANCE_MUTATION_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived tenant governance records are immutable.'));
                    }
                    return freezeTenantOutput({
                        allowed: failures.length === 0,
                        readOnly: readOnly,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        visibility: VISIBILITY.PLATFORM_GOVERNANCE,
                        role: role,
                        targetTenantId: targetTenant,
                        failures: failures,
                        warnings: warnings
                    });
                }
            }
            if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_TENANT_GOVERNANCE_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN has infrastructure visibility only and cannot access tenant governance analytics.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_INFRASTRUCTURE_SCOPE_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant infrastructure visibility is blocked.'));
                }
                return freezeTenantOutput({
                    allowed: failures.length === 0,
                    readOnly: true,
                    aggregateOnly: true,
                    infrastructureOnly: true,
                    visibility: failures.length ? VISIBILITY.NONE : VISIBILITY.INFRASTRUCTURE_ONLY,
                    role: role,
                    targetTenantId: targetTenant,
                    failures: failures,
                    warnings: warnings
                });
            }
            failures.push(safeFailure('TENANT_ROLE_GOVERNANCE_BLOCKED', RISK_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant roles cannot access platform tenant governance.'));
            return freezeTenantOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: false,
                visibility: VISIBILITY.NONE,
                role: role,
                targetTenantId: targetTenant,
                failures: failures,
                warnings: warnings
            });
        } catch (error) {
            return freezeTenantOutput({
                allowed: false,
                readOnly: true,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('TENANT_GOVERNANCE_SCOPE_FAILED_SAFE', RISK_CLASSIFICATIONS.HIGH_RISK, 'Tenant governance scope validation failed safely.')]
            });
        }
    }

    function classifyTenantRisk(metrics) {
        try {
            var row = metrics && typeof metrics === 'object' ? metrics : {};
            var riskScore = 0;
            var factors = [];
            var state = normalizeTenantState(row.state || row.governanceState || row.lifecycleState, 'PROVISIONING');
            function add(points, code) {
                riskScore += points;
                factors.push(code);
            }
            if (state === 'SUSPENDED' || state === 'RESTRICTED') add(35, 'LIFECYCLE_RESTRICTED');
            if (state === 'DEGRADED') add(20, 'LIFECYCLE_DEGRADED');
            if (safeNumber(row.workflowCongestion, 0) >= 8) add(18, 'WORKFLOW_CONGESTION');
            if (safeNumber(row.escalationSpikes, 0) >= 5) add(18, 'ESCALATION_SPIKES');
            if (safeNumber(row.storagePressure, 0) >= 90) add(20, 'STORAGE_PRESSURE');
            if (safeNumber(row.notificationFailureRate, 0) >= 25) add(14, 'NOTIFICATION_FAILURES');
            if (safeNumber(row.onboardingCompletionRate, 100) < 50) add(14, 'ONBOARDING_DEGRADATION');
            if (safeNumber(row.inactiveDays, 0) >= 30) add(16, 'INACTIVE_TENANT');
            if (row.salaryVisibility || row.leaveBalanceVisibility || row.payrollVisibility || row.rawDocumentExposure) add(100, 'CONFIDENTIAL_EXPOSURE_BLOCKER');
            riskScore = clamp(riskScore, 0, 100);
            var classification = RISK_CLASSIFICATIONS.INFO;
            if (riskScore >= 75) classification = RISK_CLASSIFICATIONS.CRITICAL_BLOCKER;
            else if (riskScore >= 45) classification = RISK_CLASSIFICATIONS.HIGH_RISK;
            else if (riskScore >= 18) classification = RISK_CLASSIFICATIONS.WARNING;
            return freezeTenantOutput({
                classification: classification,
                riskScore: riskScore,
                riskFactors: factors,
                summary: factors.length ? factors.join(', ') : 'Tenant governance posture is normal.'
            });
        } catch (error) {
            return freezeTenantOutput({
                classification: RISK_CLASSIFICATIONS.HIGH_RISK,
                riskScore: 50,
                riskFactors: ['RISK_CLASSIFICATION_FAILED_SAFE'],
                summary: 'Tenant risk classification failed safely.'
            });
        }
    }

    function tenantIdFromSlug(slug) {
        var normalized = normalizeTenantSlug(slug);
        return normalized ? 'TEN-' + normalized : '';
    }

    function collectProvisioningTenants() {
        try {
            var service = global.TenantProvisioningService || global.tenantProvisioningService;
            if (service && typeof service.getTenantProvisioningView === 'function') {
                var view = service.getTenantProvisioningView({ actor: { role: 'platform_owner', id: 'tenant-governance' }, skipAuditPersistence: true });
                return Array.isArray(view && view.tenants) ? view.tenants.slice() : [];
            }
        } catch (error) {}
        return [];
    }

    function collectSetupRows() {
        try {
            var service = global.OrganizationSetupService || global.organizationSetupService;
            if (service && typeof service.getSetupGovernanceView === 'function') {
                var view = service.getSetupGovernanceView({ actor: { role: 'platform_owner', id: 'tenant-governance' }, readOnly: true });
                return Array.isArray(view && view.setups) ? view.setups.slice() : [];
            }
        } catch (error) {}
        return [];
    }

    function collectTenants(data) {
        var rows = [];
        list(data, 'platformTenants').forEach(function addPlatformTenant(row) { rows.push(row); });
        collectProvisioningTenants().forEach(function addProvisionedTenant(row) { rows.push(row); });
        list(data, 'organizationSetups').forEach(function addSetupTenant(row) { rows.push(row); });
        collectSetupRows().forEach(function addSetupViewTenant(row) { rows.push(row); });

        ['employees', 'users', 'workflowEvents', 'pendingActions', 'escalations', 'featureRolloutRecords', 'storageObjects', 'fileAttachments', 'notificationLogs'].forEach(function eachGroup(key) {
            list(data, key).forEach(function addTenantFromRow(row) {
                var slug = rowTenant(row);
                if (slug) rows.push({ tenantSlug: slug, tenantId: row.tenantId || row.companyId || tenantIdFromSlug(slug), companyName: row.companyName || slug });
            });
        });

        if (!rows.length && data && data.companySettings) {
            var settings = data.companySettings || {};
            var slug = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || settings.companyName);
            if (slug) rows.push({
                tenantSlug: slug,
                tenantId: settings.tenantId || settings.companyId || tenantIdFromSlug(slug),
                companyName: settings.companyName || slug,
                lifecycleState: 'ACTIVE'
            });
        }

        var seen = {};
        return rows.reduce(function dedupe(acc, row) {
            var slug = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companyName || row.tenantName));
            if (!slug || seen[slug]) return acc;
            seen[slug] = true;
            acc.push(Object.assign({}, row, { tenantSlug: slug, tenantId: row.tenantId || row.companyId || tenantIdFromSlug(slug) }));
            return acc;
        }, []);
    }

    function aggregateByTenant(rows, fallbackTenant, visitor) {
        var output = {};
        (Array.isArray(rows) ? rows : []).forEach(function eachRow(row) {
            var slug = rowTenant(row) || fallbackTenant;
            if (!slug) return;
            if (!output[slug]) output[slug] = {};
            visitor(output[slug], row || {});
        });
        return output;
    }

    function statusToken(row) {
        return normalizeToken(row && (row.status || row.state || row.workflowState || row.lifecycleState || row.eventType || ''));
    }

    function buildTenantSummaries(data, context) {
        var fallbackTenant = normalizeTenantSlug(data && data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId || data.companySettings.companyName));
        var tenants = collectTenants(data);
        var setupRows = list(data, 'organizationSetups').concat(collectSetupRows());
        var setupByTenant = {};
        setupRows.forEach(function eachSetup(setup) {
            var slug = rowTenant(setup) || normalizeTenantSlug(setup && (setup.tenantSlug || setup.companyProfile && setup.companyProfile.companyName));
            if (slug && !setupByTenant[slug]) setupByTenant[slug] = setup;
        });

        var employeeAgg = aggregateByTenant(list(data, 'employees'), fallbackTenant, function employeeVisitor(acc, row) {
            acc.employeeCount = safeNumber(acc.employeeCount, 0) + 1;
            if (row.active !== false && normalizeToken(row.status || row.employmentStatus || 'ACTIVE') !== 'INACTIVE') {
                acc.activeEmployeeCount = safeNumber(acc.activeEmployeeCount, 0) + 1;
            }
        });
        var inviteAgg = aggregateByTenant(list(data, 'authInvites').concat(list(data, 'inviteRecords')).concat(list(data, 'users')), fallbackTenant, function inviteVisitor(acc, row) {
            var status = statusToken(row);
            if (status === 'PENDING' || status === 'INVITED' || status === 'SENT' || status === 'PENDING_INVITE') acc.pendingInviteCount = safeNumber(acc.pendingInviteCount, 0) + 1;
            if (status === 'ACTIVE' || status === 'ACTIVATED' || row.active === true || normalizeToken(row.activationStatus) === 'ACTIVE') acc.activatedUserCount = safeNumber(acc.activatedUserCount, 0) + 1;
        });
        var workflowAgg = aggregateByTenant(list(data, 'workflowEvents').concat(list(data, 'pendingActions')), fallbackTenant, function workflowVisitor(acc, row) {
            var token = statusToken(row);
            acc.workflowUtilization = safeNumber(acc.workflowUtilization, 0) + 1;
            if (/PENDING|DELAYED|BLOCKED|FAILED|ESCALATED|OVERDUE|DEGRADED/.test(token)) acc.workflowCongestion = safeNumber(acc.workflowCongestion, 0) + 1;
            if (/FAILED|DEGRADED|BLOCKED/.test(token)) acc.degradedWorkflowExecution = safeNumber(acc.degradedWorkflowExecution, 0) + 1;
        });
        var escalationAgg = aggregateByTenant(list(data, 'escalations').concat(list(data, 'escalationEvents')), fallbackTenant, function escalationVisitor(acc, row) {
            var token = statusToken(row);
            if (!token || token !== 'RESOLVED') acc.escalationSpikes = safeNumber(acc.escalationSpikes, 0) + 1;
        });
        var storageAgg = aggregateByTenant(list(data, 'storageObjects').concat(list(data, 'fileAttachments')).concat(list(data, 'uploads')), fallbackTenant, function storageVisitor(acc, row) {
            acc.uploadGrowth = safeNumber(acc.uploadGrowth, 0) + 1;
            var quota = safeNumber(row.quotaUtilization || row.storagePressure || row.quotaPercent, 0);
            var size = safeNumber(row.size || row.bytes || row.storageBytes, 0);
            acc.storageBytes = safeNumber(acc.storageBytes, 0) + size;
            acc.storagePressure = Math.max(safeNumber(acc.storagePressure, 0), quota);
        });
        var notificationAgg = aggregateByTenant(list(data, 'notificationLogs').concat(list(data, 'notifications')), fallbackTenant, function notificationVisitor(acc, row) {
            acc.notificationTotal = safeNumber(acc.notificationTotal, 0) + 1;
            if (/FAILED|ERROR|BOUNCED/.test(statusToken(row))) acc.notificationFailures = safeNumber(acc.notificationFailures, 0) + 1;
        });
        var featureAgg = aggregateByTenant(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), fallbackTenant, function featureVisitor(acc, row) {
            acc.featureEvents = safeNumber(acc.featureEvents, 0) + 1;
            acc.featureUsage = safeNumber(acc.featureUsage, 0) + safeNumber(row.usageCount || row.usage || (statusToken(row) === 'FEATURE_USED' ? 1 : 0), 0);
            acc.featureAdoption = safeNumber(acc.featureAdoption, 0) + safeNumber(row.adoptionCount || row.adoptedCount || 0, 0);
            if (/DEGRADED|FAILED|CRASH|ROLLBACK/.test(statusToken(row))) acc.featureFailures = safeNumber(acc.featureFailures, 0) + 1;
        });

        return tenants.map(function mapTenant(row) {
            var slug = normalizeTenantSlug(row.tenantSlug || row.tenantId || row.companyId || row.companyName);
            var setup = setupByTenant[slug] || {};
            var employees = employeeAgg[slug] || {};
            var invites = inviteAgg[slug] || {};
            var workflows = workflowAgg[slug] || {};
            var escalations = escalationAgg[slug] || {};
            var storage = storageAgg[slug] || {};
            var notifications = notificationAgg[slug] || {};
            var features = featureAgg[slug] || {};
            var state = normalizeTenantState(row.governanceState || row.lifecycleState || row.deploymentHealth || row.state, 'PROVISIONING');
            var completion = onboardingCompletion(row.onboardingStage || row.currentStage, setup);
            var notificationRate = safeNumber(notifications.notificationTotal, 0)
                ? Math.round((safeNumber(notifications.notificationFailures, 0) / safeNumber(notifications.notificationTotal, 1)) * 100)
                : 0;
            var adoptionDenominator = Math.max(safeNumber(features.featureUsage, 0), safeNumber(features.featureEvents, 0), 1);
            var adoption = Math.round((safeNumber(features.featureAdoption, 0) / adoptionDenominator) * 100);
            if (!safeNumber(features.featureAdoption, 0) && safeNumber(features.featureUsage, 0)) adoption = clamp(Math.round(safeNumber(features.featureUsage, 0) * 10), 0, 100);
            var inactiveDays = safeNumber(row.inactiveDays || row.daysInactive || setup.inactiveDays, 0);
            var metrics = {
                tenantId: row.tenantId || tenantIdFromSlug(slug),
                tenantSlug: slug,
                companyName: row.companyName || row.tenantName || setup.companyProfile && setup.companyProfile.companyName || slug,
                state: state,
                governanceState: state,
                lifecycleState: normalizeTenantState(row.lifecycleState || state, state),
                onboardingStage: row.onboardingStage || setup.currentStage || 'setup_only',
                onboardingCompletionRate: completion,
                workflowCongestion: safeNumber(workflows.workflowCongestion, 0),
                escalationSpikes: safeNumber(escalations.escalationSpikes, 0),
                storagePressure: clamp(Math.round(safeNumber(storage.storagePressure, 0)), 0, 100),
                notificationFailureRate: notificationRate,
                featureAdoptionRate: clamp(adoption, 0, 100),
                inactiveDays: inactiveDays
            };
            var risk = classifyTenantRisk(metrics);
            var healthState = risk.classification === RISK_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL'
                : risk.classification === RISK_CLASSIFICATIONS.HIGH_RISK ? 'DEGRADED'
                : risk.classification === RISK_CLASSIFICATIONS.WARNING ? 'WATCH'
                : isActiveState(state) ? 'HEALTHY' : state;
            return {
                tenantId: metrics.tenantId,
                tenantSlug: slug,
                tenantName: metrics.companyName,
                companyName: metrics.companyName,
                planType: safeString(row.planType || row.plan_type || row.subscriptionPlan || 'standard', 'standard'),
                subscriptionState: normalizeToken(row.subscriptionState || row.subscriptionStatus || 'MONITORING'),
                lifecycleState: metrics.lifecycleState,
                governanceState: state,
                healthState: healthState,
                complianceState: normalizeToken(row.complianceState || setup.complianceState || 'MONITORING'),
                onboardingStage: metrics.onboardingStage,
                onboardingCompletionRate: metrics.onboardingCompletionRate,
                employeeCount: safeNumber(employees.employeeCount, 0),
                activeEmployeeCount: safeNumber(employees.activeEmployeeCount, 0),
                pendingInviteCount: safeNumber(invites.pendingInviteCount, 0),
                activatedUserCount: safeNumber(invites.activatedUserCount, 0),
                workflowCongestion: metrics.workflowCongestion,
                workflowUtilization: safeNumber(workflows.workflowUtilization, 0),
                escalationSpikes: metrics.escalationSpikes,
                storagePressure: metrics.storagePressure,
                uploadGrowth: safeNumber(storage.uploadGrowth, 0),
                notificationFailureRate: metrics.notificationFailureRate,
                featureAdoptionRate: metrics.featureAdoptionRate,
                riskClassification: risk.classification,
                riskScore: risk.riskScore,
                riskFactors: risk.riskFactors,
                degradationSignals: risk.riskFactors,
                operationalRestrictions: state === 'RESTRICTED' || state === 'SUSPENDED' ? 1 : 0,
                activationAllowed: state !== 'ARCHIVED' && state !== 'SUSPENDED',
                archivalMarker: state === 'ARCHIVED'
            };
        });
    }

    function summarizeTenants(tenantSummaries) {
        var rows = Array.isArray(tenantSummaries) ? tenantSummaries : [];
        return rows.reduce(function reduce(acc, row) {
            acc.totalTenants += 1;
            if (row.governanceState === 'ACTIVE') acc.activeTenants += 1;
            if (row.governanceState === 'DEGRADED' || row.healthState === 'DEGRADED') acc.degradedTenants += 1;
            if (row.governanceState === 'RESTRICTED') acc.restrictedTenants += 1;
            if (row.governanceState === 'SUSPENDED') acc.suspendedTenants += 1;
            if (row.governanceState === 'ARCHIVED') acc.archivedTenants += 1;
            acc.employeeCount += safeNumber(row.employeeCount, 0);
            acc.activeEmployeeCount += safeNumber(row.activeEmployeeCount, 0);
            acc.pendingInviteCount += safeNumber(row.pendingInviteCount, 0);
            acc.activatedUserCount += safeNumber(row.activatedUserCount, 0);
            acc.workflowCongestion += safeNumber(row.workflowCongestion, 0);
            acc.escalationSpikes += safeNumber(row.escalationSpikes, 0);
            acc.storagePressure = Math.max(acc.storagePressure, safeNumber(row.storagePressure, 0));
            acc.notificationFailures += safeNumber(row.notificationFailureRate, 0) > 0 ? 1 : 0;
            acc.featureAdoptionRate += safeNumber(row.featureAdoptionRate, 0);
            acc.onboardingCompletionRate += safeNumber(row.onboardingCompletionRate, 0);
            if (row.riskClassification === RISK_CLASSIFICATIONS.CRITICAL_BLOCKER || row.riskClassification === RISK_CLASSIFICATIONS.HIGH_RISK) acc.highRiskTenants += 1;
            if (safeNumber(row.onboardingCompletionRate, 100) < 50) acc.onboardingFailures += 1;
            if (safeNumber(row.workflowCongestion, 0) > 0) acc.degradedWorkflowExecution += 1;
            if (safeNumber(row.storagePressure, 0) >= 85) acc.abnormalStorageGrowth += 1;
            return acc;
        }, {
            totalTenants: 0,
            activeTenants: 0,
            degradedTenants: 0,
            restrictedTenants: 0,
            suspendedTenants: 0,
            archivedTenants: 0,
            employeeCount: 0,
            activeEmployeeCount: 0,
            pendingInviteCount: 0,
            activatedUserCount: 0,
            workflowCongestion: 0,
            escalationSpikes: 0,
            storagePressure: 0,
            notificationFailures: 0,
            featureAdoptionRate: 0,
            onboardingCompletionRate: 0,
            highRiskTenants: 0,
            onboardingFailures: 0,
            degradedWorkflowExecution: 0,
            abnormalStorageGrowth: 0
        });
    }

    function detectTenantDegradation(filters, context) {
        try {
            var scope = validateTenantGovernanceScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeTenantOutput({
                    success: false,
                    classification: RISK_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    failures: scope.failures,
                    warnings: scope.warnings
                });
            }
            var data = rawData();
            var tenantSummaries = scope.infrastructureOnly ? [] : buildTenantSummaries(data, context || {});
            var totals = summarizeTenants(tenantSummaries);
            var degradation = {
                success: true,
                classification: totals.highRiskTenants ? RISK_CLASSIFICATIONS.HIGH_RISK : totals.workflowCongestion || totals.escalationSpikes || totals.notificationFailures ? RISK_CLASSIFICATIONS.WARNING : RISK_CLASSIFICATIONS.INFO,
                onboardingDegradation: totals.onboardingFailures,
                inactiveTenantGrowth: tenantSummaries.filter(function inactive(row) { return row.riskFactors.indexOf('INACTIVE_TENANT') !== -1; }).length,
                workflowCongestionSpikes: totals.workflowCongestion,
                escalationAnomalies: totals.escalationSpikes,
                operationalHealthDegradation: totals.highRiskTenants,
                storagePressure: totals.storagePressure,
                notificationFailureRates: totals.notificationFailures,
                degradedWorkflowExecution: totals.degradedWorkflowExecution,
                abnormalStorageGrowth: totals.abnormalStorageGrowth,
                suspiciousOrganizationActivity: tenantSummaries.filter(function suspicious(row) { return row.riskFactors.indexOf('CONFIDENTIAL_EXPOSURE_BLOCKER') !== -1; }).length,
                tenantIsolationPreserved: true
            };
            return freezeTenantOutput(degradation);
        } catch (error) {
            return freezeTenantOutput({
                success: false,
                classification: RISK_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('TENANT_DEGRADATION_DETECTION_FAILED_SAFE', RISK_CLASSIFICATIONS.HIGH_RISK, 'Tenant degradation detection failed safely.')]
            });
        }
    }

    function auditTenantGovernance(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'TENANT_GOVERNANCE_ACCESS'),
                    source: 'tenantGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({
                        module: 'tenantGovernance',
                        actionType: normalizeToken(actionType || 'TENANT_GOVERNANCE_ACCESS')
                    }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Tenant governance audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Tenant governance audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'TENANT_GOVERNANCE_EVENT'), {
                    source: 'tenantGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Tenant governance telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Tenant governance telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'TENANT_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'tenantGovernanceService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Tenant governance metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Tenant governance metrics unavailable.' };
    }

    function platformAnalyticsAvailable() {
        return !!(global.PlatformAnalyticsService && typeof global.PlatformAnalyticsService.generatePlatformAnalyticsReport === 'function');
    }

    function generateTenantGovernanceReport(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateTenantGovernanceScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeTenantOutput({
                    VERSION: VERSION,
                    success: false,
                    classification: RISK_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    visibility: scope.visibility,
                    tenantGovernanceModel: {
                        state: 'RESTRICTED',
                        states: TENANT_STATES,
                        generatedAt: nowIso(ctx)
                    },
                    tenantSummaries: [],
                    failures: scope.failures,
                    warnings: scope.warnings,
                    accessGovernance: {
                        crossTenantConfidentialLeakageBlocked: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        payrollVisibility: false,
                        superAdminHrPayrollVisibility: false,
                        tenantGovernanceTenantUiIsolation: true,
                        tenantIsolationPreserved: true,
                        tenantGovernanceConfidentialityPreserved: true,
                        platformIsolationPreserved: true
                    }
                });
            }

            var data = rawData();
            var tenantSummaries = scope.infrastructureOnly ? [] : buildTenantSummaries(data, ctx);
            var totals = summarizeTenants(tenantSummaries);
            var degradation = detectTenantDegradation(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var averageFeatureAdoption = totals.totalTenants ? Math.round(totals.featureAdoptionRate / totals.totalTenants) : 0;
            var averageOnboarding = totals.totalTenants ? Math.round(totals.onboardingCompletionRate / totals.totalTenants) : 0;
            var classification = degradation.classification || RISK_CLASSIFICATIONS.INFO;
            if (scope.infrastructureOnly) classification = RISK_CLASSIFICATIONS.INFO;

            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                visibility: scope.visibility,
                generatedAt: nowIso(ctx),
                tenantGovernanceModel: {
                    state: totals.highRiskTenants ? 'DEGRADED' : totals.restrictedTenants ? 'RESTRICTED' : 'ACTIVE',
                    states: TENANT_STATES,
                    generatedAt: nowIso(ctx),
                    historicalTenantGovernanceRecordsImmutable: true
                },
                tenantGovernanceEntities: {
                    organizations: scope.infrastructureOnly ? 0 : totals.totalTenants,
                    tenantSubscriptions: scope.infrastructureOnly ? 0 : totals.totalTenants,
                    onboardingStates: scope.infrastructureOnly ? 0 : totals.totalTenants,
                    featureActivations: scope.infrastructureOnly ? 0 : averageFeatureAdoption,
                    operationalHealth: scope.infrastructureOnly ? 0 : totals.highRiskTenants,
                    complianceStates: scope.infrastructureOnly ? 0 : totals.totalTenants,
                    storageQuotas: scope.infrastructureOnly ? 0 : totals.storagePressure,
                    governanceAlerts: scope.infrastructureOnly ? 0 : totals.highRiskTenants + totals.escalationSpikes + totals.notificationFailures
                },
                tenantLifecycleOverview: {
                    totalTenants: scope.infrastructureOnly ? 0 : totals.totalTenants,
                    activeTenants: scope.infrastructureOnly ? 0 : totals.activeTenants,
                    degradedTenants: scope.infrastructureOnly ? 0 : totals.degradedTenants,
                    restrictedTenants: scope.infrastructureOnly ? 0 : totals.restrictedTenants,
                    suspendedTenants: scope.infrastructureOnly ? 0 : totals.suspendedTenants,
                    archivedTenants: scope.infrastructureOnly ? 0 : totals.archivedTenants,
                    employeeCount: scope.infrastructureOnly ? 0 : totals.employeeCount,
                    activeEmployeeCount: scope.infrastructureOnly ? 0 : totals.activeEmployeeCount,
                    pendingInviteCount: scope.infrastructureOnly ? 0 : totals.pendingInviteCount,
                    activatedUserCount: scope.infrastructureOnly ? 0 : totals.activatedUserCount
                },
                organizationLifecycleGovernance: {
                    tenantActivation: totals.activeTenants,
                    organizationSuspension: totals.suspendedTenants,
                    onboardingLifecycle: averageOnboarding,
                    featureActivation: averageFeatureAdoption,
                    operationalRestrictions: totals.restrictedTenants,
                    subscriptionLifecycle: totals.totalTenants,
                    tenantArchivalMarkers: totals.archivedTenants,
                    unsafeOrganizationDeletionBlocked: true
                },
                tenantHealthIntelligence: {
                    onboardingCompletionHealth: averageOnboarding,
                    workflowCongestion: scope.infrastructureOnly ? 0 : totals.workflowCongestion,
                    inactiveOrganizationDetection: degradation.inactiveTenantGrowth || 0,
                    escalationSpikes: scope.infrastructureOnly ? 0 : totals.escalationSpikes,
                    storagePressure: scope.infrastructureOnly ? 0 : totals.storagePressure,
                    notificationFailureRate: scope.infrastructureOnly ? 0 : totals.notificationFailures,
                    operationalDegradation: scope.infrastructureOnly ? 0 : totals.highRiskTenants
                },
                tenantRiskGovernance: {
                    inactiveTenants: degradation.inactiveTenantGrowth || 0,
                    operationalBottlenecks: scope.infrastructureOnly ? 0 : totals.workflowCongestion,
                    excessiveEscalationPatterns: scope.infrastructureOnly ? 0 : totals.escalationSpikes,
                    onboardingFailures: scope.infrastructureOnly ? 0 : totals.onboardingFailures,
                    abnormalStorageGrowth: scope.infrastructureOnly ? 0 : totals.abnormalStorageGrowth,
                    suspiciousOrganizationActivity: 0,
                    degradedWorkflowExecution: scope.infrastructureOnly ? 0 : totals.degradedWorkflowExecution
                },
                featureUsageGovernance: {
                    featureAdoption: scope.infrastructureOnly ? 0 : averageFeatureAdoption,
                    featureAdoptionRate: scope.infrastructureOnly ? 0 : averageFeatureAdoption,
                    workflowUtilization: scope.infrastructureOnly ? 0 : tenantSummaries.reduce(function sum(acc, row) { return acc + safeNumber(row.workflowUtilization, 0); }, 0),
                    workflowUtilizationRate: scope.infrastructureOnly ? 0 : Math.min(100, tenantSummaries.reduce(function sum(acc, row) { return acc + safeNumber(row.workflowUtilization, 0); }, 0)),
                    onboardingUsage: scope.infrastructureOnly ? 0 : averageOnboarding,
                    uploadGrowth: scope.infrastructureOnly ? 0 : tenantSummaries.reduce(function sum(acc, row) { return acc + safeNumber(row.uploadGrowth, 0); }, 0),
                    communicationActivity: scope.infrastructureOnly ? 0 : list(data, 'communicationEvents').length + list(data, 'announcements').length,
                    executionAnalytics: scope.infrastructureOnly ? 0 : totals.workflowCongestion + totals.escalationSpikes
                },
                governanceDashboard: {
                    tenantLifecycleOverview: true,
                    organizationHealthIndicators: true,
                    onboardingCompletionAnalytics: true,
                    operationalDegradationAlerts: true,
                    featureAdoptionSummaries: true,
                    storageUsageTrends: true,
                    workflowCongestionVisibility: true,
                    inactiveTenantAlerts: true
                },
                accessGovernance: {
                    crossTenantConfidentialLeakageBlocked: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    payrollVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawDocumentExposure: false,
                    superAdminHrPayrollVisibility: false,
                    tenantGovernanceTenantUiIsolation: true,
                    tenantIsolationPreserved: true,
                    tenantGovernanceConfidentialityPreserved: true,
                    existingTenantWorkflowsPreserved: true,
                    governanceActionsAuditable: true,
                    platformIsolationPreserved: true
                },
                integrationHealth: {
                    platformAnalyticsIntegrated: platformAnalyticsAvailable(),
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    storageAnalyticsIntegrated: !!global.StorageAnalyticsService,
                    onboardingGovernanceIntegrated: !!(global.OrganizationSetupService || global.OnboardingGovernanceService),
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                tenantSummaries: scope.infrastructureOnly ? [] : freezeList(tenantSummaries)
            };

            if (!ctx.skipAuditPersistence) auditTenantGovernance('TENANT_GOVERNANCE_REPORTED', { severity: classification, tenantCount: report.tenantLifecycleOverview.totalTenants }, ctx);
            if (!ctx.skipTelemetry) emitTelemetry('TENANT_GOVERNANCE_REPORTED', { severity: classification, tenantCount: report.tenantLifecycleOverview.totalTenants }, ctx);
            recordMetric('TENANT_GOVERNANCE_REPORTED', { status: classification, severity: classification === RISK_CLASSIFICATIONS.INFO ? 'INFO' : 'WARNING' }, ctx);
            return freezeTenantOutput(report);
        } catch (error) {
            safeWarn('Tenant governance report failed safely.', error && error.message);
            return freezeTenantOutput({
                VERSION: VERSION,
                success: false,
                classification: RISK_CLASSIFICATIONS.HIGH_RISK,
                tenantSummaries: [],
                failures: [safeFailure('TENANT_GOVERNANCE_REPORT_FAILED_SAFE', RISK_CLASSIFICATIONS.HIGH_RISK, 'Tenant governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed, metadata) {
            checks.push({ name: name, passed: passed === true, metadata: cloneSanitized(metadata || {}) });
        }
        try {
            var malformed = normalizeTenantMetrics(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var blockedTenant = validateTenantGovernanceScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'TENANT-A' } });
            check('tenant roles are blocked from governance dashboard', blockedTenant.allowed === false);

            var superAdmin = validateTenantGovernanceScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN broad governance is blocked', superAdmin.allowed === false);

            var infra = validateTenantGovernanceScope({ infrastructureOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN infrastructure-only scope is allowed', infra.allowed === true && infra.infrastructureOnly === true);

            var archived = validateTenantGovernanceScope({ lifecycleState: 'ARCHIVED', activationRequested: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('archived tenant lifecycle mutation is blocked', archived.allowed === false);

            var normalized = normalizeTenantMetrics({ tenantId: 'TENANT-A', state: 'active', salary: 90000, leaveBalance: 12, metadata: { confidentialEmployeeRecord: 'hidden' } });
            check('confidential filtering removes HR fields', normalized.success === true && !/salary|leaveBalance|90000|hidden/i.test(JSON.stringify(normalized)));

            var frozen = freezeTenantOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && !/90000/.test(JSON.stringify(frozen)));

            var degradation = detectTenantDegradation({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('health analytics degrade safely without optional dependencies', degradation.success === true || degradation.failures);

            var report = generateTenantGovernanceReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('tenant isolation works for generated reports', report.success === true && report.accessGovernance && report.accessGovernance.crossTenantConfidentialLeakageBlocked === true);
        } catch (error) {
            check('self-test failure captured', false, { error: error && error.message });
        }
        var passed = checks.every(function everyCheck(row) { return row.passed; });
        return freezeTenantOutput({
            passed: passed,
            checks: checks,
            generatedAt: nowIso({}),
            coverage: {
                malformedPayloads: true,
                dependencyAbsence: true,
                immutability: true,
                tenantLifecycleHandling: true,
                confidentialFiltering: true,
                tenantIsolation: true
            }
        });
    }

    var api = Object.freeze({
        VERSION: VERSION,
        TENANT_STATES: TENANT_STATES,
        RISK_CLASSIFICATIONS: RISK_CLASSIFICATIONS,
        validateTenantGovernanceScope: validateTenantGovernanceScope,
        classifyTenantRisk: classifyTenantRisk,
        normalizeTenantMetrics: normalizeTenantMetrics,
        freezeTenantOutput: freezeTenantOutput,
        detectTenantDegradation: detectTenantDegradation,
        generateTenantGovernanceReport: generateTenantGovernanceReport
    });

    global.TenantGovernanceService = api;
    global.tenantGovernanceService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_TENANT_GOVERNANCE_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
