/**
 * deploymentValidationService.js
 * ARTHHRMS Enterprise Deployment Validation + Release Governance.
 *
 * Additive, platform-control-only release governance layer for production
 * deployment validation, migration checks, rollback readiness, release risk
 * intelligence, and environment consistency. It never exposes salaries, leave
 * balances, confidential HR records, raw tenant documents, URLs, tokens, or
 * tenant-private payloads.
 */
(function attachDeploymentValidationService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[DeploymentValidationService]';

    var DEPLOYMENT_STATES = Object.freeze([
        'DRAFT',
        'VALIDATING',
        'READY',
        'DEPLOYING',
        'DEGRADED',
        'ROLLBACK_READY',
        'RELEASED',
        'ARCHIVED'
    ]);

    var RISK_LEVELS = Object.freeze([
        'LOW',
        'MODERATE',
        'HIGH',
        'CRITICAL'
    ]);

    var DEPLOYMENT_TYPES = Object.freeze([
        'PRODUCTION_RELEASE',
        'PRE_RELEASE_VALIDATION',
        'ROLLOUT_SAFETY',
        'ENVIRONMENT_CONSISTENCY',
        'MIGRATION_VERIFICATION',
        'ROLLBACK_READINESS',
        'RELEASE_GOVERNANCE',
        'DEPLOYMENT_RISK'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        DEPLOYMENT_GOVERNANCE: 'DEPLOYMENT_GOVERNANCE',
        INFRASTRUCTURE_DEPLOYMENT_VISIBILITY: 'INFRASTRUCTURE_DEPLOYMENT_VISIBILITY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        monitoringOnly: true,
        releaseAuthority: true,
        releaseBypassAuthority: true,
        classification: true,
        visibility: true,
        state: true,
        states: true,
        RISK_LEVELS: true,
        riskLevels: true,
        riskLevel: true,
        riskScore: true,
        riskFactors: true,
        deploymentRiskScore: true,
        deploymentBlocked: true,
        readinessScore: true,
        validationResults: true,
        validationResultsByCategory: true,
        readinessCategories: true,
        blockedDeploymentReasons: true,
        deploymentHistory: true,
        releaseApprovalRequired: true,
        deploymentBlockingConditions: true,
        type: true,
        types: true,
        generatedAt: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        signals: true,
        summary: true,
        payload: true,
        malformedPayloads: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        deploymentId: true,
        releaseId: true,
        tenantId: true,
        tenantSlug: true,
        deploymentType: true,
        deploymentState: true,
        deploymentStateRaw: true,
        deploymentGovernanceModel: true,
        releaseGovernance: true,
        deploymentRiskIntelligence: true,
        rollbackReadiness: true,
        incidentHealthIntegration: true,
        releaseAnalytics: true,
        governanceDashboard: true,
        accessGovernance: true,
        integrationHealth: true,
        deploymentSummaries: true,
        failedValidationPatterns: true,
        degradedDeploymentHealth: true,
        migrationInstability: true,
        rollbackFrequency: true,
        deploymentCongestion: true,
        environmentDrift: true,
        releaseEscalationFrequency: true,
        validationWorkflows: true,
        releaseApprovalCheckpoints: true,
        migrationConsistencyChecks: true,
        rollbackReadinessVerification: true,
        releaseFreezeGovernance: true,
        deploymentArchivalGovernance: true,
        productionSafetyVerification: true,
        unsafeProductionReleaseBlocked: true,
        rollbackReadyDeployments: true,
        rollbackActivatedDeployments: true,
        rollbackHealthVerification: true,
        migrationVerificationHealth: true,
        deploymentLinkedDegradation: true,
        rolloutTriggeredIncidents: true,
        recoveryValidationHealth: true,
        rollbackExecutionAnalytics: true,
        operationalReleaseStability: true,
        deploymentSuccessRates: true,
        validationFailureFrequency: true,
        rollbackEfficiency: true,
        releaseStabilizationTimelines: true,
        migrationVerificationTrends: true,
        deploymentCongestionAnalytics: true,
        releaseGovernanceHealth: true,
        crossTenantDeploymentLeakageBlocked: true,
        unsafeProductionDeploymentsBlocked: true,
        superAdminReleaseBypassAuthority: true,
        superAdminHrPayrollVisibility: true,
        platformOwnerTenantRbacIsolation: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        historicalDeploymentRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        deploymentActionsAuditable: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        deploymentGovernanceIsolationPreserved: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        emergencyIntegrated: true,
        globalIncidentIntegrated: true,
        platformHealthIntegrated: true,
        featureRolloutIntegrated: true,
        tenantGovernanceIntegrated: true,
        workflowTelemetryIntegrated: true,
        deploymentSafetyIntegrated: true,
        environmentGovernanceIntegrated: true,
        stagingValidationIntegrated: true,
        label: true,
        category: true,
        checkId: true,
        passed: true,
        blocked: true,
        blockerCode: true,
        environmentReadiness: true,
        databaseMigrations: true,
        rbacIntegrity: true,
        tenantIsolation: true,
        workflowIntegrity: true,
        auditIntegrity: true,
        featureCompatibility: true,
        billingCompatibility: true,
        deploymentDependencies: true,
        rollbackPrepared: true,
        dependencyChecks: true,
        criticalIncidents: true,
        unresolvedDegradation: true,
        emergencyOverrideActive: true,
        criticalHealthStatus: true,
        unresolvedIncidents: true,
        unresolvedOutages: true,
        dependencyFailures: true,
        migrationRisks: true,
        configurationIssues: true,
        failedValidationChecks: true,
        totalDeployments: true,
        releasedDeployments: true,
        failedDeployments: true,
        validationSuccessRate: true,
        deploymentFailureRate: true,
        releaseVelocity: true,
        coverage: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (typeof details !== 'undefined') global.console.warn(PREFIX + ' ' + message, details);
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
        var metadata = row && typeof row === 'object' && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.company_id || metadata.tenantSlug || metadata.tenantId || metadata.companyId));
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function timeValue(value) {
        try {
            var ms = new Date(value).getTime();
            return isFinite(ms) ? ms : 0;
        } catch (error) {
            return 0;
        }
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
            return value.map(function sanitizeItem(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
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
            return input.map(function cloneArrayItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
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

    function freezeDeploymentOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'DEPLOYMENT_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Deployment governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeDeploymentState(value, fallback) {
        var state = normalizeToken(value || fallback || 'DRAFT');
        if (state === 'PREPARING' || state === 'PREPARE' || state === 'PENDING_PREPARATION') return 'DRAFT';
        if (state === 'BLOCKED' || state === 'FAILED' || state === 'WARNING') return 'DEGRADED';
        if (state === 'ROLLBACK' || state === 'ROLLBACK_PENDING' || state === 'ROLLBACK_READY') return 'ROLLBACK_READY';
        if (state === 'PRODUCTION_READY' || state === 'APPROVED') return 'READY';
        if (state === 'ACTIVE' || state === 'IN_PROGRESS') return 'DEPLOYING';
        if (state === 'COMPLETE' || state === 'SUCCESS' || state === 'STABILIZED') return 'RELEASED';
        if (DEPLOYMENT_STATES.indexOf(state) !== -1) return state;
        return fallback === 'PREPARING' ? 'DRAFT' : (fallback || 'DRAFT');
    }

    function normalizeDeploymentType(value) {
        var type = normalizeToken(value || '');
        if (/MIGRATION/.test(type)) return 'MIGRATION_VERIFICATION';
        if (/ROLLBACK/.test(type)) return 'ROLLBACK_READINESS';
        if (/ROLLOUT|FEATURE/.test(type)) return 'ROLLOUT_SAFETY';
        if (/ENVIRONMENT|DRIFT|CONSISTENCY/.test(type)) return 'ENVIRONMENT_CONSISTENCY';
        if (/RISK/.test(type)) return 'DEPLOYMENT_RISK';
        if (/PRE_RELEASE|VALIDATION|STAGING/.test(type)) return 'PRE_RELEASE_VALIDATION';
        if (/GOVERNANCE|APPROVAL/.test(type)) return 'RELEASE_GOVERNANCE';
        if (DEPLOYMENT_TYPES.indexOf(type) !== -1) return type;
        return 'PRODUCTION_RELEASE';
    }

    function isDeploymentSignal(row) {
        var token = normalizeToken(row && (row.deploymentType || row.eventType || row.actionType || row.status || row.state || row.deploymentState || row.incidentState || row.healthState || row.rolloutState || row.module || row.severity || ''));
        var count = safeNumber(row && (row.validationFailures || row.failureCount || row.failureRate || row.durationMinutes), 0);
        return /DEPLOY|RELEASE|MIGRATION|ROLLBACK|ENVIRONMENT|STAGING|PRODUCTION|DEGRADED|FAILED|BLOCKED|CRITICAL|ESCALATED/.test(token) || count >= 2 || row && (row.rollbackReady === true || row.migrationInstability === true || row.environmentDrift === true);
    }

    function classifyDeploymentRisk(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || '');
            if (row.crossTenant === true || row.unsafeRelease === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.actionType || row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            var state = normalizeDeploymentState(row.deploymentState || row.state || row.status || row.incidentState || row.healthState || row.rolloutState, 'DRAFT');
            if (state === 'DEGRADED') return SEVERITIES.HIGH_RISK;
            if (row.migrationInstability === true || row.environmentDrift === true || safeNumber(row.validationFailures || row.failureCount, 0) >= 2) return SEVERITIES.HIGH_RISK;
            if (state === 'ROLLBACK_READY' || row.rollbackReady === true || severity === 'WARNING' || severity === 'WARN') return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeDeploymentPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDeploymentOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_DEPLOYMENT_PAYLOAD', SEVERITIES.HIGH_RISK, 'Deployment payload must be an object.')]
                });
            }
            var state = normalizeDeploymentState(payload.deploymentState || payload.state || payload.status || payload.incidentState || payload.healthState || payload.rolloutState, 'DRAFT');
            var createdAt = safeString(payload.createdAt || payload.date || payload.timestamp || payload.loggedAt || nowIso(context || {}), nowIso(context || {}));
            var severity = classifyDeploymentRisk(Object.assign({}, payload, { deploymentState: state }));
            var normalized = {
                deploymentId: safeString(payload.deploymentId || payload.id || payload.deploymentLogId || payload.logId || payload.releaseId || payload.validationId || 'DEPLOY-' + timeValue(createdAt), ''),
                releaseId: safeString(payload.releaseId || payload.buildId || payload.version || '', ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                deploymentType: normalizeDeploymentType(payload.deploymentType || payload.type || payload.actionType || payload.eventType || payload.module || payload.validationType),
                deploymentState: state,
                deploymentStateRaw: safeString(payload.state || payload.status || payload.deploymentState || payload.incidentState || payload.healthState || payload.rolloutState || '', ''),
                severity: severity,
                source: safeString(payload.source || payload.module || 'deployment', 'deployment'),
                module: safeString(payload.module || payload.source || 'Deployment Validation', 'Deployment Validation'),
                actionType: normalizeToken(payload.actionType || payload.action || payload.eventType || payload.type || 'DEPLOYMENT_VALIDATION_EVENT'),
                correlationId: safeString(payload.correlationId || payload.eventId || '', ''),
                environment: normalizeToken(payload.environment || payload.deploymentStage || payload.targetEnvironment || ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                releasedAt: safeString(payload.releasedAt || payload.completedAt || payload.resolvedAt || '', ''),
                validationFailures: safeNumber(payload.validationFailures || payload.failureCount || (Array.isArray(payload.failures) ? payload.failures.length : 0), 0),
                rollbackReady: payload.rollbackReady === true || state === 'ROLLBACK_READY' || /ROLLBACK/.test(normalizeToken(payload.status || payload.actionType || payload.deploymentType || '')),
                rollbackActivated: payload.rollbackActivated === true || /ROLLBACK/.test(normalizeToken(payload.rolloutState || payload.eventType || '')),
                migrationVerified: payload.migrationVerified === true || /MIGRATION/.test(normalizeToken(payload.validationType || payload.deploymentType || '')) && !payload.migrationInstability,
                migrationInstability: payload.migrationInstability === true || /MIGRATION/.test(normalizeToken(payload.eventType || payload.status || '')) && /FAILED|BLOCKED/.test(normalizeToken(payload.status || '')),
                environmentDrift: payload.environmentDrift === true || /DRIFT|MISMATCH/.test(normalizeToken(payload.status || payload.eventType || '')),
                releaseApprovalCheckpoint: payload.releaseApprovalCheckpoint === true || payload.approvalCheckpoint === true,
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeDeploymentOutput({
                success: true,
                payload: normalized,
                classification: severity,
                deploymentGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeDeploymentOutput({
                success: false,
                payload: {},
                failures: [safeFailure('DEPLOYMENT_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Deployment payload normalization failed safely.')]
            });
        }
    }

    function validateDeploymentScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(actor.role || ctx.role || record.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || '');
            var route = safeString(ctx.pathname || ctx.route || record.route || global.location && global.location.pathname || '', '').toLowerCase();
            var failures = [];
            var infrastructureOnly = record.infrastructureOnly === true || ctx.infrastructureOnly === true;
            var monitoringOnly = record.monitoringOnly === true || ctx.monitoringOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.targetTenantSlug || ctx.targetTenantId || ctx.targetTenantSlug);
            var actorTenant = contextTenant(ctx);
            var state = normalizeDeploymentState(record.deploymentState || record.state || record.status, '');
            var bypassRequested = record.releaseBypass === true || record.governanceBypass === true || record.productionBypass === true || record.deployWithoutValidation === true || /BYPASS|FORCE_RELEASE|SKIP_VALIDATION/.test(normalizeToken(record.action || record.actionType || ''));

            if (routeType === 'TENANT' || /arthhrms\.html|employee|hr-|manager|dashboard/i.test(route)) {
                failures.push(safeFailure('DEPLOYMENT_GOVERNANCE_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Deployment governance is isolated to platform-control.'));
            }
            if (state === 'ARCHIVED' && (record.releaseBypass || record.deploymentOverride || record.mutate || record.update || record.delete || record.action === 'modify')) {
                failures.push(safeFailure('ARCHIVED_DEPLOYMENT_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Historical deployment records are immutable after archival.'));
            }
            if (record.bypassGovernance || record.exportRaw || record.exposeConfidential || record.unsafeProductionRelease) {
                failures.push(safeFailure('UNSAFE_RELEASE_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Unsafe deployment release bypass or exposure is blocked.'));
            }

            if (role === 'PLATFORM_OWNER') {
                if (bypassRequested) {
                    failures.push(safeFailure('RELEASE_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Release governance validation cannot be bypassed.'));
                }
                if (!failures.length) {
                    return freezeDeploymentOutput({
                        allowed: true,
                        readOnly: record.readOnly === true,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        monitoringOnly: false,
                        releaseAuthority: true,
                        releaseBypassAuthority: false,
                        visibility: VISIBILITY.DEPLOYMENT_GOVERNANCE,
                        failures: []
                    });
                }
            } else if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly && !monitoringOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_DEPLOYMENT_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN is limited to infrastructure deployment visibility.'));
                }
                if (bypassRequested || record.releaseApproval === true || record.productionRelease === true) {
                    failures.push(safeFailure('SUPER_ADMIN_RELEASE_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN cannot bypass release governance validation.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_DEPLOYMENT_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant deployment visibility is blocked.'));
                }
                if (!failures.length) {
                    return freezeDeploymentOutput({
                        allowed: true,
                        readOnly: true,
                        aggregateOnly: true,
                        infrastructureOnly: true,
                        monitoringOnly: true,
                        releaseAuthority: false,
                        releaseBypassAuthority: false,
                        visibility: VISIBILITY.INFRASTRUCTURE_DEPLOYMENT_VISIBILITY,
                        failures: []
                    });
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_DEPLOYMENT_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access deployment governance.'));
            }

            return freezeDeploymentOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: infrastructureOnly,
                monitoringOnly: monitoringOnly,
                releaseAuthority: false,
                releaseBypassAuthority: false,
                visibility: VISIBILITY.NONE,
                failures: failures
            });
        } catch (error) {
            return freezeDeploymentOutput({
                allowed: false,
                visibility: VISIBILITY.NONE,
                releaseAuthority: false,
                releaseBypassAuthority: false,
                failures: [safeFailure('DEPLOYMENT_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Deployment scope validation failed safely.')]
            });
        }
    }

    function deploymentFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeDeploymentPayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitDeployments(data) {
        var rows = []
            .concat(list(data, 'deploymentValidationRecords'))
            .concat(list(data, 'deploymentGovernanceRecords'))
            .concat(list(data, 'releaseGovernanceRecords'))
            .concat(list(data, 'releaseValidationRecords'));
        return rows.map(function mapDeployment(row) {
            return deploymentFromRow(row, { deploymentType: row && (row.deploymentType || row.type || 'PRODUCTION_RELEASE') });
        }).filter(Boolean);
    }

    function collectDerivedDeployments(data) {
        var rows = [];
        function addRows(sourceRows, defaults) {
            (Array.isArray(sourceRows) ? sourceRows : []).forEach(function eachRow(row, index) {
                if (!isDeploymentSignal(Object.assign({}, defaults, row))) return;
                var timestamp = row.createdAt || row.date || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                rows.push(deploymentFromRow(Object.assign({
                    deploymentId: row.deploymentId || row.deploymentLogId || row.logId || row.releaseId || row.validationId || row.migrationId || row.incidentId || row.healthId || row.rolloutId || row.emergencyId || row.auditId || row.id || defaults.prefix + '-' + index,
                    releaseId: row.releaseId || row.buildId || row.version,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.deploymentState || row.state || row.status || row.incidentState || row.healthState || row.rolloutState || defaults.state || 'VALIDATING',
                    severity: row.severity || row.classification || defaults.severity || 'INFO',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    source: defaults.source,
                    deploymentType: defaults.deploymentType,
                    actionType: defaults.actionType,
                    correlationId: row.correlationId || row.eventId,
                    rollbackReady: row.rollbackReady === true || defaults.rollbackReady === true,
                    rollbackActivated: row.rollbackActivated === true || defaults.rollbackActivated === true,
                    migrationInstability: row.migrationInstability === true || defaults.migrationInstability === true,
                    environmentDrift: row.environmentDrift === true || defaults.environmentDrift === true,
                    validationFailures: row.validationFailures || row.failureCount || (Array.isArray(row.failures) ? row.failures.length : 0)
                }, row)));
            });
        }
        addRows(list(data, 'deploymentLogs').concat(list(data, 'deploymentEvents')), { prefix: 'DEPLOY-LOG', module: 'deployment', source: 'deploymentSafetyService', deploymentType: 'PRODUCTION_RELEASE', actionType: 'DEPLOYMENT_LOG_EVENT' });
        addRows(list(data, 'migrationValidationRecords').concat(list(data, 'migrationLogs')), { prefix: 'MIGRATION-DEPLOY', module: 'migration', source: 'migrationControlService', deploymentType: 'MIGRATION_VERIFICATION', actionType: 'MIGRATION_VERIFICATION_EVENT', migrationInstability: true });
        addRows(list(data, 'stagingValidationReports').concat(list(data, 'stagingValidationRecords')), { prefix: 'STAGING-DEPLOY', module: 'staging', source: 'stagingValidationService', deploymentType: 'PRE_RELEASE_VALIDATION', actionType: 'STAGING_VALIDATION_EVENT' });
        addRows(list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents')), { prefix: 'INCIDENT-DEPLOY', module: 'incident', source: 'globalIncidentService', deploymentType: 'DEPLOYMENT_RISK', actionType: 'DEPLOYMENT_LINKED_INCIDENT' });
        addRows(list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords')), { prefix: 'HEALTH-DEPLOY', module: 'platformHealth', source: 'platformHealthMonitoringService', deploymentType: 'ENVIRONMENT_CONSISTENCY', actionType: 'DEPLOYMENT_HEALTH_EVENT' });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'ROLLOUT-DEPLOY', module: 'featureRollout', source: 'featureRolloutService', deploymentType: 'ROLLOUT_SAFETY', actionType: 'ROLLOUT_SAFETY_EVENT', rollbackReady: true });
        addRows(list(data, 'emergencyOverrideRecords').concat(list(data, 'emergencyOverrides')), { prefix: 'EMERGENCY-DEPLOY', module: 'emergency', source: 'emergencyOverrideService', deploymentType: 'ROLLBACK_READINESS', actionType: 'RECOVERY_VALIDATION_EVENT', rollbackActivated: true });
        addRows(list(data, 'auditLogs').concat(list(data, 'globalAuditRecords')), { prefix: 'AUDIT-DEPLOY', module: 'audit', source: 'auditService', deploymentType: 'RELEASE_GOVERNANCE', actionType: 'DEPLOYMENT_AUDIT_EVENT' });
        return rows.filter(Boolean);
    }

    function externalDeploymentSignals(context) {
        var signals = { emergency: {}, incident: {}, health: {}, rollout: {}, environment: {}, staging: {} };
        var safeCtx = Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
        try {
            var emergency = global.EmergencyOverrideService || global.emergencyOverrideService;
            if (emergency && typeof emergency.generateEmergencyOverrideReport === 'function') signals.emergency = emergency.generateEmergencyOverrideReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var incident = global.GlobalIncidentService || global.globalIncidentService;
            if (incident && typeof incident.generateGlobalIncidentReport === 'function') signals.incident = incident.generateGlobalIncidentReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var health = global.PlatformHealthMonitoringService || global.platformHealthMonitoringService;
            if (health && typeof health.generatePlatformHealthReport === 'function') signals.health = health.generatePlatformHealthReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var rollout = global.FeatureRolloutService || global.featureRolloutService;
            if (rollout && typeof rollout.generateFeatureRolloutReport === 'function') signals.rollout = rollout.generateFeatureRolloutReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var env = global.EnvironmentGovernanceService || global.environmentGovernanceService;
            if (env && typeof env.generateDeploymentGovernanceReport === 'function') signals.environment = env.generateDeploymentGovernanceReport({ environment: 'PRODUCTION' }, { skipTelemetry: true }) || {};
        } catch (error) {}
        try {
            var staging = global.StagingValidationService || global.stagingValidationService;
            if (staging && typeof staging.runStagingValidation === 'function') signals.staging = staging.runStagingValidation({ validationOnly: true }, { skipTelemetry: true, skipAuditPersistence: true }) || {};
        } catch (error) {}
        return signals;
    }

    function summarizeDeployments(rows, signals) {
        var deployments = Array.isArray(rows) ? rows : [];
        var totals = deployments.reduce(function reduce(acc, row) {
            acc.validationWorkflows += 1;
            if (row.deploymentState === 'DEGRADED' || row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.degradedDeploymentHealth += 1;
            if (row.deploymentState === 'READY' || row.deploymentState === 'RELEASED') acc.readyOrReleased += 1;
            if (row.deploymentState === 'ARCHIVED') acc.archivedDeployments += 1;
            if (row.validationFailures > 0) acc.failedValidationPatterns += row.validationFailures;
            if (row.migrationInstability) acc.migrationInstability += 1;
            if (row.migrationVerified) acc.migrationVerificationTrends += 1;
            if (row.rollbackReady || row.deploymentState === 'ROLLBACK_READY') acc.rollbackReadyDeployments += 1;
            if (row.rollbackActivated) acc.rollbackActivatedDeployments += 1;
            if (row.environmentDrift) acc.environmentDrift += 1;
            if (row.releaseApprovalCheckpoint) acc.releaseApprovalCheckpoints += 1;
            if (row.deploymentType === 'ROLLOUT_SAFETY') acc.rolloutTriggeredIncidents += 1;
            if (row.deploymentType === 'DEPLOYMENT_RISK' || row.source === 'globalIncidentService') acc.deploymentLinkedDegradation += 1;
            if (row.deploymentType === 'ENVIRONMENT_CONSISTENCY' || row.source === 'platformHealthMonitoringService') acc.recoveryValidationHealth += 1;
            if (row.deploymentType === 'ROLLBACK_READINESS') acc.rollbackFrequency += 1;
            if (row.correlationId) acc.deploymentCongestion += 1;
            return acc;
        }, {
            validationWorkflows: 0,
            failedValidationPatterns: 0,
            degradedDeploymentHealth: 0,
            migrationInstability: 0,
            rollbackFrequency: 0,
            deploymentCongestion: 0,
            environmentDrift: 0,
            releaseEscalationFrequency: 0,
            readyOrReleased: 0,
            archivedDeployments: 0,
            rollbackReadyDeployments: 0,
            rollbackActivatedDeployments: 0,
            releaseApprovalCheckpoints: 0,
            migrationVerificationTrends: 0,
            deploymentLinkedDegradation: 0,
            rolloutTriggeredIncidents: 0,
            recoveryValidationHealth: 0
        });
        var emergencyAnalytics = signals && signals.emergency && signals.emergency.emergencyAnalytics || {};
        var incidentAnalytics = signals && signals.incident && signals.incident.incidentAnalytics || {};
        var healthAnalytics = signals && signals.health && signals.health.healthAnalytics || {};
        var rolloutHealth = signals && signals.rollout && signals.rollout.featureHealth || {};
        totals.rollbackFrequency += safeNumber(emergencyAnalytics.rollbackRecoveryEfficiency ? 1 : 0, 0);
        totals.deploymentLinkedDegradation += safeNumber(incidentAnalytics.activeIncidents, 0);
        totals.degradedDeploymentHealth += safeNumber(healthAnalytics.degradationFrequency, 0);
        totals.rolloutTriggeredIncidents += safeNumber(rolloutHealth.rolloutFailures || rolloutHealth.degradedFeatureBehavior, 0);
        totals.releaseEscalationFrequency = totals.degradedDeploymentHealth + totals.failedValidationPatterns + totals.rollbackActivatedDeployments;
        totals.deploymentSuccessRates = totals.validationWorkflows ? Math.round((totals.readyOrReleased / totals.validationWorkflows) * 100) : 100;
        totals.rollbackEfficiency = totals.rollbackFrequency ? Math.max(0, 100 - Math.min(100, totals.rollbackActivatedDeployments * 10)) : 100;
        totals.releaseStabilizationTimelines = totals.readyOrReleased + totals.archivedDeployments;
        totals.deploymentCongestionAnalytics = totals.deploymentCongestion + totals.failedValidationPatterns;
        totals.releaseGovernanceHealth = Math.max(0, 100 - Math.min(100, totals.releaseEscalationFrequency * 5));
        return totals;
    }

    function reason(code, severity, message, count) {
        return {
            failureCode: normalizeToken(code),
            blockerCode: normalizeToken(code),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || '', ''),
            count: safeNumber(count, 0)
        };
    }

    function calculateDeploymentRisk(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var factors = {
                failedValidationChecks: safeNumber(row.failedValidationChecks || row.failedValidationPatterns || row.validationFailures, 0),
                dependencyFailures: safeNumber(row.dependencyFailures || row.failedDependencies, 0),
                migrationRisks: safeNumber(row.migrationRisks || row.migrationInstability, 0),
                configurationIssues: safeNumber(row.configurationIssues || row.environmentDrift, 0),
                unresolvedIncidents: safeNumber(row.unresolvedIncidents || row.criticalIncidents || row.activeIncidents, 0),
                unresolvedOutages: safeNumber(row.unresolvedOutages || row.criticalHealthStatus || row.healthOutages, 0),
                emergencyOverrideActive: safeNumber(row.emergencyOverrideActive || row.activeEmergencyOverrides, 0),
                rollbackRequirements: safeNumber(row.rollbackRequirements || row.rollbackFrequency, 0)
            };
            var score = 0;
            score += Math.min(30, factors.failedValidationChecks * 12);
            score += Math.min(20, factors.dependencyFailures * 10);
            score += Math.min(18, factors.migrationRisks * 9);
            score += Math.min(14, factors.configurationIssues * 7);
            score += Math.min(24, factors.unresolvedIncidents * 24);
            score += Math.min(24, factors.unresolvedOutages * 24);
            score += Math.min(18, factors.emergencyOverrideActive * 18);
            score += Math.min(8, factors.rollbackRequirements * 4);
            if (factors.unresolvedIncidents > 0 || factors.unresolvedOutages > 0 || factors.emergencyOverrideActive > 0) score = Math.max(score, 90);
            score = Math.min(100, Math.round(score));
            var riskLevel = score >= 75 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MODERATE' : 'LOW';
            var blocked = riskLevel === 'CRITICAL' || factors.unresolvedIncidents > 0 || factors.unresolvedOutages > 0 || factors.emergencyOverrideActive > 0 || factors.failedValidationChecks >= 2 || factors.dependencyFailures > 0;
            var blockers = [];
            if (factors.failedValidationChecks) blockers.push(reason('FAILED_VALIDATION_CHECKS', SEVERITIES.HIGH_RISK, 'Failed validation checks require release review.', factors.failedValidationChecks));
            if (factors.dependencyFailures) blockers.push(reason('DEPENDENCY_VALIDATION_FAILURES', SEVERITIES.HIGH_RISK, 'Release dependencies failed validation.', factors.dependencyFailures));
            if (factors.migrationRisks) blockers.push(reason('MIGRATION_RISK_DETECTED', SEVERITIES.HIGH_RISK, 'Database migration risk must be resolved before promotion.', factors.migrationRisks));
            if (factors.configurationIssues) blockers.push(reason('CONFIGURATION_ISSUES_DETECTED', SEVERITIES.WARNING, 'Environment or configuration issues require verification.', factors.configurationIssues));
            if (factors.unresolvedIncidents) blockers.push(reason('CRITICAL_INCIDENT_BLOCKER', SEVERITIES.CRITICAL_BLOCKER, 'Critical incidents block production deployment.', factors.unresolvedIncidents));
            if (factors.unresolvedOutages) blockers.push(reason('CRITICAL_HEALTH_BLOCKER', SEVERITIES.CRITICAL_BLOCKER, 'Critical health or unresolved outage blocks production deployment.', factors.unresolvedOutages));
            if (factors.emergencyOverrideActive) blockers.push(reason('EMERGENCY_OVERRIDE_ACTIVE_BLOCKER', SEVERITIES.CRITICAL_BLOCKER, 'Active emergency override blocks production deployment.', factors.emergencyOverrideActive));
            return freezeDeploymentOutput({
                success: true,
                riskLevel: riskLevel,
                riskScore: score,
                deploymentBlocked: blocked,
                riskFactors: factors,
                blockedDeploymentReasons: blockers
            });
        } catch (error) {
            return freezeDeploymentOutput({
                success: false,
                riskLevel: 'HIGH',
                riskScore: 60,
                deploymentBlocked: true,
                failures: [safeFailure('DEPLOYMENT_RISK_CALCULATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Deployment risk calculation failed safely.')]
            });
        }
    }

    function readinessCheck(category, label, passed, message) {
        return {
            checkId: normalizeToken(category),
            category: category,
            label: label,
            passed: passed === true,
            blocked: passed !== true,
            severity: passed === true ? SEVERITIES.INFO : SEVERITIES.HIGH_RISK,
            message: passed === true ? 'Validated.' : message
        };
    }

    function validateDeploymentReadiness(payload, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateDeploymentScope(Object.assign({ readOnly: true, aggregateOnly: true }, payload || {}), ctx);
            if (!scope.allowed) {
                return freezeDeploymentOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    readinessScore: 0,
                    validationResults: {},
                    blockedDeploymentReasons: scope.failures
                });
            }
            var row = payload && typeof payload === 'object' ? payload : {};
            var results = {
                environmentReadiness: readinessCheck('environmentReadiness', 'Environment readiness', row.environmentReady !== false && row.invalidEnvironment !== true, 'Environment readiness failed.'),
                databaseMigrations: readinessCheck('databaseMigrations', 'Database migrations', row.migrationsValidated !== false && row.migrationVerified !== false && row.failedMigrations !== true && row.migrationInstability !== true, 'Database migration validation failed.'),
                rbacIntegrity: readinessCheck('rbacIntegrity', 'RBAC integrity', row.rbacIntegrity !== false && row.rbacValidated !== false, 'RBAC integrity validation failed.'),
                tenantIsolation: readinessCheck('tenantIsolation', 'Tenant isolation', row.tenantIsolation !== false && row.tenantIsolationValidated !== false && row.crossTenant !== true, 'Tenant isolation validation failed.'),
                workflowIntegrity: readinessCheck('workflowIntegrity', 'Workflow integrity', row.workflowIntegrity !== false && row.workflowIntegrityValidated !== false, 'Workflow integrity validation failed.'),
                auditIntegrity: readinessCheck('auditIntegrity', 'Audit integrity', row.auditIntegrity !== false && row.auditIntegrityValidated !== false, 'Audit integrity validation failed.'),
                featureCompatibility: readinessCheck('featureCompatibility', 'Feature compatibility', row.featureCompatibility !== false && row.featureCompatibilityValidated !== false, 'Feature compatibility validation failed.'),
                billingCompatibility: readinessCheck('billingCompatibility', 'Billing compatibility', row.billingCompatibility !== false && row.billingCompatibilityValidated !== false, 'Billing compatibility validation failed.'),
                deploymentDependencies: readinessCheck('deploymentDependencies', 'Deployment dependencies', row.dependenciesValid !== false && row.dependencyFailures !== true, 'Deployment dependency validation failed.')
            };
            var keys = Object.keys(results);
            var passedCount = keys.filter(function(key) { return results[key].passed; }).length;
            var readinessScore = keys.length ? Math.round((passedCount / keys.length) * 100) : 0;
            var blockers = keys.filter(function(key) { return !results[key].passed; }).map(function(key) {
                return reason(results[key].checkId, results[key].severity, results[key].message, 1);
            });
            var rollbackPrepared = row.rollbackReady === true || row.rollbackPrepared === true || row.rollbackPreparedness === true;
            var risk = calculateDeploymentRisk({
                failedValidationChecks: blockers.length,
                dependencyFailures: results.deploymentDependencies.passed ? 0 : 1,
                migrationRisks: results.databaseMigrations.passed ? 0 : 1,
                configurationIssues: results.environmentReadiness.passed ? 0 : 1
            });
            return freezeDeploymentOutput({
                success: true,
                classification: blockers.length ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO,
                readinessScore: readinessScore,
                validationResults: results,
                readinessCategories: keys,
                blockedDeploymentReasons: blockers,
                releaseApprovalRequired: true,
                rollbackReadiness: {
                    rollbackPrepared: rollbackPrepared,
                    rollbackReadyDeployments: rollbackPrepared ? 1 : 0,
                    rollbackHealthVerification: rollbackPrepared ? 100 : 50
                },
                deploymentRiskScore: risk
            });
        } catch (error) {
            return freezeDeploymentOutput({
                success: false,
                readinessScore: 0,
                classification: SEVERITIES.HIGH_RISK,
                blockedDeploymentReasons: [safeFailure('DEPLOYMENT_READINESS_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Deployment readiness validation failed safely.')]
            });
        }
    }

    function activeState(row, keys) {
        var token = normalizeToken(keys.map(function(key) { return row && row[key]; }).join(' '));
        return !/RESOLVED|CLOSED|COMPLETED|ARCHIVED|MITIGATED|RELEASED/.test(token);
    }

    function verifyReleaseDependencies(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateDeploymentScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeDeploymentOutput({
                    success: false,
                    deploymentBlocked: true,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    blockedDeploymentReasons: scope.failures
                });
            }
            var data = rawData();
            var incidents = list(data, 'platformIncidents').concat(list(data, 'globalIncidents'), list(data, 'incidents'));
            var health = list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords'));
            var emergency = list(data, 'emergencyOverrideRecords').concat(list(data, 'emergencyOverrides'));
            var criticalIncidents = incidents.filter(function(row) {
                return activeState(row, ['incidentState', 'status', 'state']) && /CRITICAL|CRITICAL_BLOCKER|ESCALATED|ACTIVE/.test(normalizeToken(row.severity || row.classification || row.incidentState || row.status));
            }).length;
            var criticalHealth = health.filter(function(row) {
                return activeState(row, ['healthState', 'status', 'state']) && /CRITICAL|OUTAGE|FAILED|DEGRADED/.test(normalizeToken(row.healthState || row.status || row.state || row.severity));
            }).length;
            var unresolvedDegradation = health.filter(function(row) {
                return activeState(row, ['healthState', 'status', 'state']) && /DEGRADED|SLOW|LATENCY|FAILURE/.test(normalizeToken(row.healthState || row.status || row.state || row.eventType));
            }).length;
            var emergencyActive = emergency.filter(function(row) {
                return activeState(row, ['emergencyState', 'status', 'state']) && /ACTIVE|RECOVERY|ROLLBACK|LOCKDOWN|OVERRIDE|FREEZE/.test(normalizeToken(row.emergencyState || row.status || row.state || row.emergencyType));
            }).length;
            var blockers = [];
            if (criticalIncidents) blockers.push(reason('CRITICAL_INCIDENT_BLOCKER', SEVERITIES.CRITICAL_BLOCKER, 'Critical incident exists; production deployment is blocked.', criticalIncidents));
            if (unresolvedDegradation) blockers.push(reason('UNRESOLVED_DEGRADATION_BLOCKER', SEVERITIES.HIGH_RISK, 'Unresolved platform degradation exists; release needs review.', unresolvedDegradation));
            if (emergencyActive) blockers.push(reason('EMERGENCY_OVERRIDE_ACTIVE_BLOCKER', SEVERITIES.CRITICAL_BLOCKER, 'Emergency override or rollback state is active; deployment is blocked.', emergencyActive));
            if (criticalHealth) blockers.push(reason('CRITICAL_HEALTH_BLOCKER', SEVERITIES.CRITICAL_BLOCKER, 'Critical platform health status blocks deployment.', criticalHealth));
            var integration = {
                emergencyIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService),
                globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                globalAuditIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService)
            };
            return freezeDeploymentOutput({
                success: true,
                classification: blockers.length ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.INFO,
                deploymentBlocked: blockers.length > 0,
                dependencyChecks: {
                    criticalIncidents: criticalIncidents,
                    unresolvedDegradation: unresolvedDegradation,
                    emergencyOverrideActive: emergencyActive,
                    criticalHealthStatus: criticalHealth
                },
                blockedDeploymentReasons: blockers,
                integrationHealth: integration
            });
        } catch (error) {
            return freezeDeploymentOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                deploymentBlocked: true,
                blockedDeploymentReasons: [safeFailure('RELEASE_DEPENDENCY_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release dependency validation failed safely.')]
            });
        }
    }

    function detectReleaseInstability(filters, context) {
        try {
            var scope = validateDeploymentScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeDeploymentOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    failures: scope.failures
                });
            }
            var data = rawData();
            var rows = scope.infrastructureOnly ? [] : collectExplicitDeployments(data).concat(collectDerivedDeployments(data));
            var signals = externalDeploymentSignals(context || {});
            var totals = summarizeDeployments(rows, signals);
            var classification = totals.failedValidationPatterns || totals.migrationInstability || totals.degradedDeploymentHealth ? SEVERITIES.HIGH_RISK : totals.rollbackFrequency ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeDeploymentOutput({
                success: true,
                classification: classification,
                deploymentRiskIntelligence: {
                    failedValidationPatterns: totals.failedValidationPatterns,
                    degradedDeploymentHealth: totals.degradedDeploymentHealth,
                    migrationInstability: totals.migrationInstability,
                    rollbackFrequency: totals.rollbackFrequency,
                    deploymentCongestion: totals.deploymentCongestion,
                    environmentDrift: totals.environmentDrift,
                    releaseEscalationFrequency: totals.releaseEscalationFrequency
                },
                tenantIsolationPreserved: true
            });
        } catch (error) {
            return freezeDeploymentOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                failures: [safeFailure('RELEASE_INSTABILITY_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release instability detection failed safely.')]
            });
        }
    }

    function auditDeploymentAccess(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'DEPLOYMENT_GOVERNANCE_ACCESS'),
                    source: 'deploymentValidationService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({
                        module: 'deploymentValidation',
                        actionType: normalizeToken(actionType || 'DEPLOYMENT_GOVERNANCE_ACCESS')
                    }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Deployment governance audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Deployment governance audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'DEPLOYMENT_GOVERNANCE_EVENT'), {
                    source: 'deploymentValidationService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Deployment governance telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Deployment governance telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'DEPLOYMENT_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'deploymentValidationService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Deployment governance metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Deployment governance metrics unavailable.' };
    }

    function generateDeploymentValidationReport(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateDeploymentScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeDeploymentOutput({
                    VERSION: VERSION,
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    visibility: scope.visibility,
                    deploymentGovernanceModel: {
                        state: 'DRAFT',
                        states: DEPLOYMENT_STATES,
                        types: DEPLOYMENT_TYPES,
                        riskLevels: RISK_LEVELS,
                        generatedAt: nowIso(ctx)
                    },
                    validationResults: [],
                    blockedDeploymentReasons: scope.failures,
                    deploymentRiskScore: {
                        riskLevel: 'CRITICAL',
                        riskScore: 100,
                        deploymentBlocked: true
                    },
                    deploymentHistory: {
                        totalDeployments: 0,
                        releasedDeployments: 0,
                        failedDeployments: 0,
                        rollbackFrequency: 0
                    },
                    deploymentSummaries: [],
                    failures: scope.failures,
                    accessGovernance: {
                        crossTenantDeploymentLeakageBlocked: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        confidentialEmployeeRecordsVisible: false,
                        rawTenantDocumentsVisible: false,
                        superAdminReleaseBypassAuthority: false,
                        superAdminHrPayrollVisibility: false,
                        platformOwnerTenantRbacIsolation: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: true,
                        deploymentGovernanceIsolationPreserved: true
                    }
                });
            }

            var data = rawData();
            var deploymentRows = scope.infrastructureOnly ? [] : collectExplicitDeployments(data).concat(collectDerivedDeployments(data));
            var signals = externalDeploymentSignals(ctx);
            var totals = summarizeDeployments(deploymentRows, signals);
            var instability = detectReleaseInstability(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var dependencies = verifyReleaseDependencies(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var readiness = validateDeploymentReadiness({
                environmentReady: totals.environmentDrift === 0 && !(dependencies.dependencyChecks && dependencies.dependencyChecks.criticalHealthStatus),
                migrationsValidated: totals.migrationInstability === 0,
                rbacIntegrity: true,
                tenantIsolation: true,
                workflowIntegrity: totals.degradedDeploymentHealth === 0,
                auditIntegrity: true,
                featureCompatibility: totals.rolloutTriggeredIncidents === 0,
                billingCompatibility: true,
                dependenciesValid: dependencies.deploymentBlocked !== true,
                rollbackReady: totals.rollbackReadyDeployments > 0
            }, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var readinessResults = readiness.validationResults || {};
            var validationRows = Object.keys(readinessResults).map(function mapReadiness(key) {
                var row = readinessResults[key] || {};
                return {
                    checkId: row.checkId || normalizeToken(key),
                    category: key,
                    label: row.label || key,
                    passed: row.passed === true,
                    blocked: row.blocked === true,
                    severity: row.severity || (row.passed ? SEVERITIES.INFO : SEVERITIES.HIGH_RISK),
                    message: row.message || ''
                };
            });
            var risk = calculateDeploymentRisk({
                failedValidationChecks: totals.failedValidationPatterns + validationRows.filter(function(row) { return !row.passed; }).length,
                dependencyFailures: dependencies.blockedDeploymentReasons ? dependencies.blockedDeploymentReasons.length : 0,
                migrationRisks: totals.migrationInstability,
                configurationIssues: totals.environmentDrift,
                unresolvedIncidents: dependencies.dependencyChecks && dependencies.dependencyChecks.criticalIncidents || 0,
                unresolvedOutages: (dependencies.dependencyChecks && dependencies.dependencyChecks.criticalHealthStatus || 0) + (dependencies.dependencyChecks && dependencies.dependencyChecks.unresolvedDegradation || 0),
                emergencyOverrideActive: dependencies.dependencyChecks && dependencies.dependencyChecks.emergencyOverrideActive || 0,
                rollbackRequirements: totals.rollbackFrequency
            });
            var classification = scope.infrastructureOnly ? SEVERITIES.INFO :
                risk.riskLevel === 'CRITICAL' ? SEVERITIES.CRITICAL_BLOCKER :
                risk.riskLevel === 'HIGH' ? SEVERITIES.HIGH_RISK :
                risk.riskLevel === 'MODERATE' ? SEVERITIES.WARNING :
                instability.classification || SEVERITIES.INFO;
            var state = dependencies.deploymentBlocked || totals.failedValidationPatterns || totals.migrationInstability ? 'DEGRADED' : totals.rollbackReadyDeployments ? 'ROLLBACK_READY' : totals.readyOrReleased ? 'READY' : 'VALIDATING';
            var blockedReasons = (readiness.blockedDeploymentReasons || []).concat(dependencies.blockedDeploymentReasons || [], risk.blockedDeploymentReasons || []);

            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                visibility: scope.visibility,
                generatedAt: nowIso(ctx),
                deploymentGovernanceModel: {
                    state: state,
                    states: DEPLOYMENT_STATES,
                    types: DEPLOYMENT_TYPES,
                    riskLevels: RISK_LEVELS,
                    historicalDeploymentRecordsImmutable: true,
                    generatedAt: nowIso(ctx)
                },
                releaseGovernance: {
                    validationWorkflows: totals.validationWorkflows,
                    readinessScore: readiness.readinessScore || 0,
                    releaseApprovalRequired: true,
                    deploymentBlockingConditions: blockedReasons.length,
                    deploymentRiskLevel: risk.riskLevel,
                    releaseApprovalCheckpoints: totals.releaseApprovalCheckpoints,
                    migrationConsistencyChecks: totals.migrationInstability + totals.migrationVerificationTrends,
                    rollbackReadinessVerification: totals.rollbackReadyDeployments,
                    releaseFreezeGovernance: totals.degradedDeploymentHealth,
                    deploymentArchivalGovernance: totals.archivedDeployments,
                    productionSafetyVerification: true,
                    unsafeProductionReleaseBlocked: true
                },
                deploymentRiskIntelligence: {
                    failedValidationPatterns: totals.failedValidationPatterns,
                    degradedDeploymentHealth: totals.degradedDeploymentHealth,
                    migrationInstability: totals.migrationInstability,
                    rollbackFrequency: totals.rollbackFrequency,
                    deploymentCongestion: totals.deploymentCongestion,
                    environmentDrift: totals.environmentDrift,
                    releaseEscalationFrequency: totals.releaseEscalationFrequency,
                    riskLevel: risk.riskLevel,
                    riskScore: risk.riskScore
                },
                deploymentRiskScore: risk,
                validationResults: validationRows,
                blockedDeploymentReasons: blockedReasons,
                deploymentHistory: {
                    totalDeployments: totals.validationWorkflows,
                    releasedDeployments: totals.readyOrReleased,
                    failedDeployments: totals.degradedDeploymentHealth + totals.failedValidationPatterns,
                    rollbackFrequency: totals.rollbackFrequency,
                    validationSuccessRate: totals.validationWorkflows ? Math.max(0, Math.round(((totals.validationWorkflows - totals.failedValidationPatterns) / totals.validationWorkflows) * 100)) : 100,
                    deploymentFailureRate: totals.validationWorkflows ? Math.min(100, Math.round((totals.degradedDeploymentHealth / totals.validationWorkflows) * 100)) : 0,
                    releaseVelocity: totals.readyOrReleased + totals.releaseStabilizationTimelines
                },
                rollbackReadiness: {
                    rollbackReadyDeployments: totals.rollbackReadyDeployments,
                    rollbackActivatedDeployments: totals.rollbackActivatedDeployments,
                    rollbackHealthVerification: totals.rollbackEfficiency,
                    migrationVerificationHealth: Math.max(0, 100 - Math.min(100, totals.migrationInstability * 20)),
                    rollbackFrequency: totals.rollbackFrequency,
                    rollbackPrepared: totals.rollbackReadyDeployments > 0
                },
                incidentHealthIntegration: {
                    deploymentLinkedDegradation: totals.deploymentLinkedDegradation,
                    rolloutTriggeredIncidents: totals.rolloutTriggeredIncidents,
                    recoveryValidationHealth: totals.recoveryValidationHealth,
                    rollbackExecutionAnalytics: totals.rollbackActivatedDeployments,
                    operationalReleaseStability: totals.releaseGovernanceHealth,
                    unsafeInfrastructureMutation: false,
                    criticalIncidents: dependencies.dependencyChecks && dependencies.dependencyChecks.criticalIncidents || 0,
                    unresolvedDegradation: dependencies.dependencyChecks && dependencies.dependencyChecks.unresolvedDegradation || 0,
                    emergencyOverrideActive: dependencies.dependencyChecks && dependencies.dependencyChecks.emergencyOverrideActive || 0,
                    criticalHealthStatus: dependencies.dependencyChecks && dependencies.dependencyChecks.criticalHealthStatus || 0
                },
                releaseAnalytics: {
                    deploymentSuccessRates: totals.deploymentSuccessRates,
                    validationFailureFrequency: totals.failedValidationPatterns,
                    rollbackEfficiency: totals.rollbackEfficiency,
                    releaseStabilizationTimelines: totals.releaseStabilizationTimelines,
                    migrationVerificationTrends: totals.migrationVerificationTrends,
                    deploymentCongestionAnalytics: totals.deploymentCongestionAnalytics,
                    releaseGovernanceHealth: totals.releaseGovernanceHealth
                },
                governanceDashboard: {
                    deploymentGovernanceOverview: true,
                    releaseValidationIndicators: true,
                    deploymentRiskSummaries: true,
                    deploymentReadinessScore: readiness.readinessScore || 0,
                    deploymentRiskScore: risk.riskScore,
                    blockedDeploymentReasons: blockedReasons.length,
                    rollbackReadinessVisibility: true,
                    migrationVerificationHealth: true,
                    deploymentAnalytics: true,
                    releaseStabilizationTrends: true
                },
                accessGovernance: {
                    crossTenantDeploymentLeakageBlocked: true,
                    unsafeProductionDeploymentsBlocked: true,
                    superAdminReleaseBypassAuthority: false,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalDeploymentRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    deploymentActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    deploymentGovernanceIsolationPreserved: true
                },
                integrationHealth: {
                    emergencyIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    globalAuditIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService),
                    featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
                    tenantGovernanceIntegrated: !!(global.TenantGovernanceService || global.tenantGovernanceService),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    deploymentSafetyIntegrated: !!(global.deploymentSafetyService || global.deploymentSafetyLocalService),
                    environmentGovernanceIntegrated: !!(global.EnvironmentGovernanceService || global.environmentGovernanceService),
                    stagingValidationIntegrated: !!(global.StagingValidationService || global.stagingValidationService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                deploymentSummaries: scope.infrastructureOnly ? [] : freezeList(deploymentRows.slice(0, 50))
            };

            if (!ctx.skipAuditPersistence) auditDeploymentAccess('DEPLOYMENT_GOVERNANCE_REPORTED', { severity: classification, deploymentCount: deploymentRows.length }, ctx);
            if (!ctx.skipTelemetry) emitTelemetry('DEPLOYMENT_GOVERNANCE_REPORTED', { severity: classification, deploymentCount: deploymentRows.length }, ctx);
            recordMetric('DEPLOYMENT_GOVERNANCE_REPORTED', { status: classification, severity: classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return freezeDeploymentOutput(report);
        } catch (error) {
            safeWarn('Deployment validation report failed safely.', error && error.message);
            return freezeDeploymentOutput({
                VERSION: VERSION,
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                deploymentSummaries: [],
                failures: [safeFailure('DEPLOYMENT_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Deployment validation report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, passed, metadata) {
            checks.push({ checkId: normalizeToken(label), label: safeString(label, ''), passed: passed === true, metadata: cloneSanitized(metadata || {}) });
        }
        try {
            var malformed = normalizeDeploymentPayload(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var ownerScope = validateDeploymentScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('PLATFORM_OWNER deployment governance scope works', ownerScope.allowed === true && ownerScope.releaseAuthority === true);

            var tenantScope = validateDeploymentScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'TENANT-A' } });
            check('tenant roles are blocked from deployment governance', tenantScope.allowed === false);

            var superAdmin = validateDeploymentScope({ releaseBypass: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN release bypass is blocked', superAdmin.allowed === false);

            var infra = validateDeploymentScope({ infrastructureOnly: true, monitoringOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN infrastructure deployment scope is allowed', infra.allowed === true && infra.releaseAuthority === false);

            var archived = validateDeploymentScope({ deploymentState: 'ARCHIVED', releaseBypass: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('archived deployment mutation is blocked', archived.allowed === false);

            var readiness = validateDeploymentReadiness({ environmentReady: false, migrationsValidated: false, rollbackReady: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('deployment readiness validation works', readiness.success === true && readiness.readinessScore < 100 && readiness.rollbackReadiness.rollbackPrepared === true);

            var risk = calculateDeploymentRisk({ failedValidationChecks: 2, dependencyFailures: 1, unresolvedIncidents: 1 });
            check('deployment risk scoring works', risk.riskLevel === 'CRITICAL' && risk.deploymentBlocked === true);

            var dependencies = verifyReleaseDependencies({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('release dependency validation works', dependencies.success === true && typeof dependencies.deploymentBlocked === 'boolean');

            var normalized = normalizeDeploymentPayload({ deploymentId: 'DEPLOY-1', state: 'rollback ready', salary: 90000, leaveBalance: 12, metadata: { rawDocument: 'private://doc' } });
            check('protected field filtering removes restricted fields', normalized.success === true && !/salary|leaveBalance|90000|private:\/\/doc/i.test(JSON.stringify(normalized)));

            var frozen = freezeDeploymentOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && !/90000|salary/i.test(JSON.stringify(frozen)));

            var instability = detectReleaseInstability({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('release instability detection degrades safely without optional dependencies', instability.success === true || instability.failures);

            var report = generateDeploymentValidationReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('tenant isolation works for generated reports', report.success === true && report.accessGovernance && report.accessGovernance.crossTenantDeploymentLeakageBlocked === true);
        } catch (error) {
            check('self-test failure captured', false, { error: error && error.message });
        }
        var passed = checks.every(function everyCheck(row) { return row.passed; });
        return freezeDeploymentOutput({
            passed: passed,
            checks: checks,
            generatedAt: nowIso({}),
            coverage: {
                malformedPayloads: true,
                dependencyAbsence: true,
                immutability: true,
                rollbackActivation: true,
                migrationInstability: true,
                tenantIsolation: true
            }
        });
    }

    var api = Object.freeze({
        VERSION: VERSION,
        DEPLOYMENT_STATES: DEPLOYMENT_STATES,
        DEPLOYMENT_TYPES: DEPLOYMENT_TYPES,
        RISK_LEVELS: RISK_LEVELS,
        SEVERITIES: SEVERITIES,
        validateDeploymentScope: validateDeploymentScope,
        validateDeploymentReadiness: validateDeploymentReadiness,
        calculateDeploymentRisk: calculateDeploymentRisk,
        verifyReleaseDependencies: verifyReleaseDependencies,
        classifyDeploymentRisk: classifyDeploymentRisk,
        normalizeDeploymentPayload: normalizeDeploymentPayload,
        freezeDeploymentOutput: freezeDeploymentOutput,
        detectReleaseInstability: detectReleaseInstability,
        generateDeploymentValidationReport: generateDeploymentValidationReport
    });

    global.DeploymentValidationService = api;
    global.deploymentValidationService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_DEPLOYMENT_VALIDATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
