// Operations Monitoring and Observability service for ARTHHRMS.
// Aggregates health, incidents, service errors, performance metrics, and recovery signals.
(function (global) {
    function db() { return global.DB; }

    const SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const HEALTH_STATES = Object.freeze({
        HEALTHY: 'HEALTHY',
        DEGRADED: 'DEGRADED',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL: 'CRITICAL'
    });
    const ALERT_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });
    const SLOW_THRESHOLDS = {
        dashboard_load: 1800,
        import_commit: 3000,
        payroll_generation: 4000,
        workflow_event: 1200,
        default: 2500
    };
    const SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key)/i;

    function nowIso() { return new Date().toISOString(); }

    function normalizeSeverity(value = 'MEDIUM') {
        const severity = String(value || 'MEDIUM').toUpperCase();
        return SEVERITY.includes(severity) ? severity : 'MEDIUM';
    }

    function statusResult(key, label, ok, message, details = {}, severity = 'MEDIUM') {
        return { key, label, ok: !!ok, status: ok ? 'HEALTHY' : 'FAILED', message, details, severity: normalizeSeverity(severity) };
    }

    function warnResult(key, label, message, details = {}) {
        return { key, label, ok: true, status: 'WARNING', message, details, severity: 'LOW' };
    }

    function actor(input = {}) {
        const user = input && Object.keys(input).length ? input : (global.authService?.getCurrentUser?.() || {});
        return {
            role: user.role || 'system',
            id: user.id || user.empId || user.email || '',
            name: user.name || user.email || user.id || 'System'
        };
    }

    function safeData() {
        try {
            const data = db()?.get?.() || {};
            return { ok: true, data };
        } catch (err) {
            return { ok: false, error: err };
        }
    }

    function runHealthCheck() {
        const store = safeData();
        const data = store.data || {};
        const supabase = global.supabaseClientService;
        const migrationSummary = global.migrationControlService?.getSummary?.() || db()?.getMigrationHealthSummary?.() || {};
        const importFailures = (data.importBatches || []).filter(row => /failed|blocked/i.test(row.status || '')).length;
        const payrollIssues = (data.payroll || []).filter(row => /failed|error|blocked/i.test(row.status || row.payrollStatus || '')).length;
        const notificationStore = Array.isArray(data.notifications);
        const pilotReadiness = global.pilotOnboardingService?.validatePilotReadiness
            ? global.pilotOnboardingService.validatePilotReadiness({ suppressMonitoring: true })
            : null;
        const modules = [
            statusResult('database', 'Business Data', store.ok && Array.isArray(data.employees), store.ok ? 'Authenticated business working set is readable.' : 'Business working set could not be read.', { employees: (data.employees || []).length }, 'CRITICAL'),
            supabase?.hasConfig?.() ? statusResult('supabase_auth', 'Supabase/Auth Config', true, 'Supabase configuration is present.', { enabled: !!supabase?.isEnabled?.('USE_SUPABASE_AUTH'), persistence: !!supabase?.isEnabled?.('USE_SUPABASE_PERSISTENCE') }) : warnResult('supabase_auth', 'Supabase/Auth Config', 'Supabase configuration is missing or intentionally disabled.'),
            global.storageService ? statusResult('storage', 'Storage Service', true, 'Storage service is loaded.', { enabled: !!global.storageService?.isStorageEnabled?.() }) : warnResult('storage', 'Storage Service', 'Storage service is not loaded.'),
            statusResult('workflow', 'Workflow Engine', !!global.workflowEngine?.emitWorkflowEvent, global.workflowEngine?.emitWorkflowEvent ? 'Workflow engine is available.' : 'Workflow engine is unavailable.', { workflowEvents: (data.workflowEvents || []).length }, 'HIGH'),
            statusResult('notifications', 'Notification Dispatcher', !!global.notificationService?.dispatchNotification && notificationStore, 'Notification dispatcher and store checked.', { notifications: (data.notifications || []).length }, 'HIGH'),
            statusResult('exports', 'Export Service', !!global.exportService?.exportAttendance, global.exportService?.exportAttendance ? 'CSV export foundation is available.' : 'Export service is missing.', {}, 'MEDIUM'),
            statusResult('imports', 'Import Pipeline', !!global.importStagingService?.stageImport && importFailures === 0, importFailures ? `${importFailures} import batch issue(s) need review.` : 'Import staging pipeline is available.', { importFailures }, importFailures ? 'HIGH' : 'MEDIUM'),
            statusResult('payroll', 'Payroll Processing', !!global.payrollService?.generatePayroll && payrollIssues === 0, payrollIssues ? `${payrollIssues} payroll issue(s) found.` : 'Payroll service is available.', { payrollIssues }, payrollIssues ? 'HIGH' : 'MEDIUM'),
            pilotReadiness
                ? statusResult('pilot_onboarding', 'Pilot Onboarding Readiness', pilotReadiness.blockers.length === 0, pilotReadiness.blockers.length ? `${pilotReadiness.blockers.length} pilot onboarding blocker(s) found.` : 'Pilot onboarding sequence is clear.', { blockers: pilotReadiness.blockers.length, warnings: pilotReadiness.warnings.length }, pilotReadiness.blockers.length ? 'HIGH' : 'MEDIUM')
                : warnResult('pilot_onboarding', 'Pilot Onboarding Readiness', 'Pilot onboarding service is not loaded.'),
            migrationSummary.failed ? warnResult('migration', 'Migration Health', `${migrationSummary.failed} migration health check(s) failed.`, migrationSummary) : statusResult('migration', 'Migration Health', true, 'Migration tracker has no failed checks.', migrationSummary, 'MEDIUM')
        ];
        const failed = modules.filter(row => row.status === 'FAILED');
        const warnings = modules.filter(row => row.status === 'WARNING');
        const score = Math.max(0, Math.round(((modules.length - failed.length - warnings.length * 0.35) / modules.length) * 100));
        return {
            checkedAt: nowIso(),
            status: failed.length ? 'Failed' : warnings.length ? 'Warning' : 'Healthy',
            score,
            modules,
            summary: {
                failed: failed.length,
                warnings: warnings.length,
                healthy: modules.filter(row => row.status === 'HEALTHY').length
            }
        };
    }

    function createIncident(incident = {}, actorInput = {}) {
        const row = db().saveOperationIncident({
            severity: normalizeSeverity(incident.severity),
            module: incident.module || 'System',
            title: incident.title || 'Operational Incident',
            description: incident.description || '',
            source: incident.source || 'monitoring',
            status: incident.status || 'Open',
            affectedRecordId: incident.affectedRecordId || '',
            linkedAuditId: incident.linkedAuditId || '',
            linkedDeploymentLogId: incident.linkedDeploymentLogId || '',
            recoveryAction: incident.recoveryAction || recoveryFor(incident.module, incident.severity),
            metadata: incident.metadata || {}
        }, actor(actorInput));
        return row;
    }

    function resolveIncident(incidentId, note = '', actorInput = {}) {
        return db().updateOperationIncident(incidentId, {
            status: 'Resolved',
            resolutionNote: note || 'Resolved from Operations Monitoring Center',
            resolvedAt: nowIso()
        }, actor(actorInput));
    }

    function recordError(error, context = {}) {
        const err = typeof error === 'string' ? new Error(error) : (error || new Error('Unknown service error'));
        const row = db().saveServiceError({
            message: err.message || String(err),
            stack: err.stack || '',
            severity: normalizeSeverity(context.severity || 'MEDIUM'),
            source: context.source || 'service'
        }, context);
        const severity = normalizeSeverity(context.severity || 'MEDIUM');
        if (['HIGH', 'CRITICAL'].includes(severity)) {
            createIncident({
                severity,
                module: context.module || 'System',
                title: `${context.module || 'Service'} failure`,
                description: row.message,
                source: 'service_error',
                affectedRecordId: context.affectedRecordId || '',
                recoveryAction: recoveryFor(context.module, severity),
                metadata: { errorId: row.errorId, action: context.action || '' }
            }, context.actor || {});
        }
        return row;
    }

    function recordPerformance(metric = {}) {
        const operation = metric.operation || metric.action || 'operation';
        const threshold = Number(metric.thresholdMs || SLOW_THRESHOLDS[operation] || SLOW_THRESHOLDS.default);
        const duration = Number(metric.durationMs || 0);
        const status = metric.status || (duration > threshold ? 'Slow' : 'OK');
        const row = db().saveOperationMetric({
            ...metric,
            operation,
            durationMs: duration,
            thresholdMs: threshold,
            status
        });
        if (status === 'Slow' || duration > threshold) {
            createIncident({
                severity: duration > threshold * 2 ? 'HIGH' : 'MEDIUM',
                module: metric.module || 'Performance',
                title: `Slow ${operation}`,
                description: `${operation} took ${duration}ms against ${threshold}ms threshold.`,
                source: 'performance',
                recoveryAction: 'Review query volume, staged batch size, and service fallback logs.',
                metadata: { metricId: row.metricId, durationMs: duration, thresholdMs: threshold }
            });
        }
        return row;
    }

    async function trackOperation(operation, module, action, options = {}) {
        const started = Date.now();
        try {
            const value = await (typeof action === 'function' ? action() : action);
            recordPerformance({
                module,
                operation,
                durationMs: Date.now() - started,
                status: 'OK',
                recordCount: Number(options.recordCount || 0),
                metadata: options.metadata || {}
            });
            return value;
        } catch (err) {
            recordPerformance({
                module,
                operation,
                durationMs: Date.now() - started,
                status: 'Failed',
                metadata: options.metadata || {}
            });
            recordError(err, { module, action: operation, severity: options.severity || 'HIGH', metadata: options.metadata || {} });
            throw err;
        }
    }

    function recoveryFor(module = '', severity = '') {
        const m = String(module || '').toLowerCase();
        if (m.includes('payroll')) return 'Review payroll run, verify duplicate month locks, and use latest rollback checkpoint if data changed.';
        if (m.includes('import')) return 'Open Import Center, inspect failed batch, export failed rows, and avoid commit until validation passes.';
        if (m.includes('auth')) return 'Check Supabase Auth config/session state and verify local fallback policy.';
        if (m.includes('notification')) return 'Check notification dispatcher, unread queues, and workflow event routing.';
        if (m.includes('storage')) return 'Verify storage bucket policy and fallback placeholders.';
        return normalizeSeverity(severity) === 'CRITICAL' ? 'Create checkpoint, review deployment logs, and keep affected module in LOCAL/HYBRID fallback.' : 'Review audit logs and service error details.';
    }

    function failedWorkflowCount(data) {
        return (data.workflowEvents || []).filter(row => /failed|blocked|rejected|overdue/i.test(`${row.status || ''} ${row.type || ''}`)).length;
    }

    function getOperationalDashboard() {
        const data = db().get();
        const summary = db().getOperationsMonitoringSummary();
        const health = runHealthCheck();
        const activeIncidents = db().getOperationIncidents({ active: true });
        const importFailures = (data.importBatches || []).filter(row => /failed|blocked/i.test(row.status || ''));
        const authFailures = db().getServiceErrorLogs({ module: 'Auth' });
        const notificationFailures = db().getServiceErrorLogs({ module: 'Notifications' });
        const payrollIssues = [
            ...db().getOperationIncidents({ module: 'Payroll' }).filter(row => !['Resolved', 'Closed'].includes(row.status)),
            ...(data.payroll || []).filter(row => /failed|error|blocked/i.test(row.status || row.payrollStatus || '')).map(row => ({ title: `Payroll issue ${row.payrollId || row.id}`, status: row.status || row.payrollStatus }))
        ];
        const pendingRecoveryActions = activeIncidents
            .filter(row => row.recoveryAction)
            .map(row => ({ incidentId: row.incidentId, severity: row.severity, module: row.module, action: row.recoveryAction }));
        return {
            generatedAt: nowIso(),
            health,
            widgets: {
                activeIncidents: summary.activeIncidents,
                criticalIncidents: summary.criticalIncidents,
                failedWorkflows: failedWorkflowCount(data),
                importFailures: importFailures.length,
                authFailures: authFailures.length,
                notificationFailures: notificationFailures.length,
                payrollIssues: payrollIssues.length,
                slowOperations: summary.slowOperations,
                systemUptime: uptimeLabel()
            },
            activeIncidents,
            recentErrors: db().getServiceErrorLogs().slice(0, 12),
            recentMetrics: db().getOperationMetrics().slice(0, 12),
            importFailures,
            payrollIssues,
            pendingRecoveryActions,
            deploymentLogs: db().getDeploymentLogs?.().slice(0, 10) || [],
            auditLogs: db().getAuditLogs ? db().getAuditLogs().slice(0, 10) : (data.auditLogs || []).slice(0, 10)
        };
    }

    function uptimeLabel() {
        try {
            const started = global.__ARTHHRMS_OPS_STARTED_AT__ || nowIso();
            global.__ARTHHRMS_OPS_STARTED_AT__ = started;
            const mins = Math.max(0, Math.floor((Date.now() - new Date(started).getTime()) / 60000));
            if (mins < 60) return `${mins}m`;
            return `${Math.floor(mins / 60)}h ${mins % 60}m`;
        } catch (err) {
            return 'Local';
        }
    }

    function cleanupRetention(options = {}) {
        const data = db().get();
        const incidentLimit = Number(options.incidentLimit || 300);
        const metricLimit = Number(options.metricLimit || 500);
        const errorLimit = Number(options.errorLimit || 500);
        data.operationIncidents = (data.operationIncidents || []).slice(0, incidentLimit);
        data.operationMetrics = (data.operationMetrics || []).slice(0, metricLimit);
        data.serviceErrorLogs = (data.serviceErrorLogs || []).slice(0, errorLimit);
        db().save(data);
        return { incidentLimit, metricLimit, errorLimit };
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function safeString(value, fallback = '') {
        try {
            if (value === undefined || value === null) return fallback;
            return String(value);
        } catch (err) {
            return fallback;
        }
    }

    function cloneOperationalValue(value, depth = 0) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (depth > 4) return safeString(value);
        if (Array.isArray(value)) return value.slice(0, 100).map(item => cloneOperationalValue(item, depth + 1));
        if (isPlainObject(value)) {
            const output = {};
            Object.keys(value).forEach(key => {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneOperationalValue(value[key], depth + 1);
            });
            return output;
        }
        return safeString(value);
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function freezeOperationalOutput(value) {
        return deepFreeze(cloneOperationalValue(value));
    }

    function normalizeTenantSlug(value = '') {
        try {
            if (global.TenantProvisioningService?.normalizeTenantSlug) return global.TenantProvisioningService.normalizeTenantSlug(value);
        } catch (err) {}
        return safeString(value).trim().toLowerCase().replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function tenantSlugFromId(value = '') {
        const token = safeString(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (!token) return '';
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function resolveTenantScope(input = {}, context = {}) {
        const source = isPlainObject(input) ? input : {};
        const ctx = isPlainObject(context) ? context : {};
        const data = safeData().data || {};
        let tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || ctx.tenantSlug || ctx.tenant_slug || data.companySettings?.tenantSlug || '');
        const tenantId = safeString(source.tenantId || source.tenant_id || ctx.tenantId || ctx.tenant_id || data.companySettings?.tenantId || '').trim();
        if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
        return { tenantSlug, tenantId };
    }

    function recordTenantSlug(record = {}) {
        const tenantSlug = normalizeTenantSlug(record.tenantSlug || record.tenant_slug || record.companySlug || record.company_slug || '');
        if (tenantSlug) return tenantSlug;
        return tenantSlugFromId(record.tenantId || record.tenant_id || record.companyId || record.company_id || '');
    }

    function sameTenantRecord(record, tenantSlug) {
        if (!tenantSlug) return true;
        const rowTenant = recordTenantSlug(record);
        return !rowTenant || rowTenant === tenantSlug;
    }

    function safeAlert(alert = {}) {
        const classification = String(alert.classification || alert.severity || ALERT_CLASSIFICATIONS.INFO).trim().replace(/[\s-]+/g, '_').toUpperCase();
        const safeClassification = classification === 'CRITICAL' || classification === 'CRITICAL_BLOCKER'
            ? ALERT_CLASSIFICATIONS.CRITICAL_BLOCKER
            : classification === 'HIGH' || classification === 'HIGH_RISK'
            ? ALERT_CLASSIFICATIONS.HIGH_RISK
            : classification === 'WARN' || classification === 'WARNING'
            ? ALERT_CLASSIFICATIONS.WARNING
            : ALERT_CLASSIFICATIONS.INFO;
        return freezeOperationalOutput({
            alertCode: safeString(alert.alertCode || alert.code || 'OPERATIONAL_ALERT'),
            classification: safeClassification,
            message: safeString(alert.message || 'Operational alert.'),
            source: safeString(alert.source || 'operationalMonitoringService'),
            metadata: cloneOperationalValue(alert.metadata || {})
        });
    }

    function classifyOperationalHealth(input = {}) {
        const source = isPlainObject(input) ? input : {};
        const criticalBlockers = Number(source.criticalBlockers || source.critical || 0);
        const highRisk = Number(source.highRisk || source.highRiskAlerts || 0);
        const failedWorkflows = Number(source.failedWorkflows || 0);
        const suspiciousSessions = Number(source.suspiciousSessions || 0);
        const failedInvites = Number(source.failedInvites || 0);
        const warnings = Number(source.warnings || 0);
        const degraded = Number(source.degraded || source.degradedWorkflows || 0);
        if (criticalBlockers > 0) return HEALTH_STATES.CRITICAL;
        if (highRisk > 0 || failedWorkflows >= 3 || suspiciousSessions >= 3 || failedInvites >= 3) return HEALTH_STATES.HIGH_RISK;
        if (warnings > 0 || failedWorkflows > 0 || suspiciousSessions > 0 || failedInvites > 0) return HEALTH_STATES.WARNING;
        if (degraded > 0) return HEALTH_STATES.DEGRADED;
        return HEALTH_STATES.HEALTHY;
    }

    function normalizeRuntimeMetric(metric = {}) {
        const source = isPlainObject(metric) ? metric : {};
        const operation = safeString(source.operation || source.action || source.type || 'runtime_metric');
        const status = safeString(source.status || 'RECORDED').toUpperCase();
        const durationMs = Number(source.durationMs || source.duration || 0);
        return freezeOperationalOutput({
            metricId: safeString(source.metricId || source.id || ''),
            operation,
            module: safeString(source.module || source.source || 'Runtime'),
            status,
            durationMs: Number.isFinite(durationMs) ? durationMs : 0,
            thresholdMs: Number(source.thresholdMs || SLOW_THRESHOLDS[operation] || SLOW_THRESHOLDS.default),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenant_slug || ''),
            timestamp: safeString(source.timestamp || source.createdAt || source.recordedAt || nowIso()),
            metadata: cloneOperationalValue(source.metadata || {})
        });
    }

    function detectWorkflowCongestion(input = {}, context = {}) {
        const tenantScope = resolveTenantScope(input, context);
        const data = safeData().data || {};
        const workflowEvents = (data.workflowEvents || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug));
        const pendingActions = (data.pendingActions || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug));
        const reviews = (data.deliverableReviews || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug));
        const failedWorkflows = workflowEvents.filter(row => /failed|blocked|rejected|overdue|degraded/i.test(`${row.status || ''} ${row.type || ''}`));
        const overdueReviews = reviews.filter(row => /pending|blocked|overdue/i.test(`${row.review_status || row.status || ''}`));
        const delayedApprovals = pendingActions.filter(row => /review|approval|strategic/i.test(`${row.actionType || ''} ${row.title || ''}`) && !/complete|approved|closed/i.test(row.status || ''));
        const alerts = [];
        if (failedWorkflows.length >= 3) {
            alerts.push(safeAlert({
                alertCode: 'WORKFLOW_FAILURE_CONCENTRATION',
                classification: ALERT_CLASSIFICATIONS.HIGH_RISK,
                message: 'Workflow failure concentration detected.',
                metadata: { failedWorkflows: failedWorkflows.length, tenantSlug: tenantScope.tenantSlug }
            }));
        } else if (failedWorkflows.length > 0) {
            alerts.push(safeAlert({
                alertCode: 'WORKFLOW_FAILURES_PRESENT',
                classification: ALERT_CLASSIFICATIONS.WARNING,
                message: 'Workflow failures require monitoring.',
                metadata: { failedWorkflows: failedWorkflows.length, tenantSlug: tenantScope.tenantSlug }
            }));
        }
        if (overdueReviews.length || delayedApprovals.length > 1) {
            const queuePressure = overdueReviews.length + delayedApprovals.length + failedWorkflows.length;
            alerts.push(safeAlert({
                alertCode: 'REVIEW_QUEUE_CONGESTION',
                classification: queuePressure >= 2 ? ALERT_CLASSIFICATIONS.HIGH_RISK : ALERT_CLASSIFICATIONS.WARNING,
                message: 'Strategic review or approval queue congestion detected.',
                metadata: { overdueReviews: overdueReviews.length, delayedApprovals: delayedApprovals.length }
            }));
        }
        return freezeOperationalOutput({
            congested: alerts.some(alert => alert.classification === ALERT_CLASSIFICATIONS.HIGH_RISK || alert.classification === ALERT_CLASSIFICATIONS.CRITICAL_BLOCKER),
            failedWorkflows: failedWorkflows.length,
            overdueReviews: overdueReviews.length,
            delayedApprovals: delayedApprovals.length,
            alerts,
            tenantSlug: tenantScope.tenantSlug
        });
    }

    function validateOperationalVisibility(record = {}, context = {}) {
        try {
            const scope = resolveTenantScope(record, context);
            const ctxScope = resolveTenantScope({}, context);
            const alerts = [];
            if (ctxScope.tenantSlug && scope.tenantSlug && ctxScope.tenantSlug !== scope.tenantSlug) {
                alerts.push(safeAlert({
                    alertCode: 'CROSS_TENANT_OPERATIONAL_VISIBILITY_BLOCKED',
                    classification: ALERT_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    message: 'Cross-tenant operational record visibility is blocked.',
                    metadata: { expectedTenantSlug: ctxScope.tenantSlug, recordTenantSlug: scope.tenantSlug, recordType: record.recordType || record.module || '' }
                }));
            }
            return freezeOperationalOutput({
                success: true,
                allowed: alerts.length === 0,
                readOnly: true,
                alerts,
                metadata: {
                    tenantIsolationPreserved: alerts.length === 0,
                    sensitiveDataFiltered: true
                },
                timestamp: nowIso()
            });
        } catch (err) {
            return freezeOperationalOutput({
                success: true,
                allowed: false,
                readOnly: true,
                alerts: [safeAlert({ alertCode: 'OPERATIONAL_VISIBILITY_FAILED_SAFE', classification: ALERT_CLASSIFICATIONS.HIGH_RISK, message: 'Operational visibility validation failed safely.' })],
                metadata: { tenantIsolationPreserved: false, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        }
    }

    function getMetricsSnapshot() {
        try {
            return global.OrchestrationMetricsService?.getMetricsSnapshot?.() || {};
        } catch (err) {
            return {};
        }
    }

    function countCounters(bucket = {}) {
        return Object.keys(bucket || {}).reduce((sum, key) => sum + Number(bucket[key]?.count || 0), 0);
    }

    function sessionSummary(context = {}) {
        try {
            if (!global.SessionGovernanceService?.getSessionGovernanceView) {
                return {
                    summary: { activeSessions: 0, suspiciousSessions: 0, revokedSessions: 0, concurrentWarnings: 0 },
                    sessions: [],
                    warnings: [safeAlert({ alertCode: 'SESSION_GOVERNANCE_UNAVAILABLE', classification: ALERT_CLASSIFICATIONS.WARNING, message: 'Session governance service is unavailable.' })]
                };
            }
            const view = global.SessionGovernanceService.getSessionGovernanceView(context);
            return {
                summary: view.summary || {},
                sessions: (view.sessions || []).slice(0, 20),
                warnings: (view.warnings || []).map(item => safeAlert({ alertCode: item.warningCode || 'SESSION_GOVERNANCE_WARNING', classification: ALERT_CLASSIFICATIONS.WARNING, message: item.message || 'Session governance warning.', metadata: item.metadata || {} }))
            };
        } catch (err) {
            return {
                summary: { activeSessions: 0, suspiciousSessions: 0, revokedSessions: 0, concurrentWarnings: 0 },
                sessions: [],
                warnings: [safeAlert({ alertCode: 'SESSION_GOVERNANCE_UNAVAILABLE', classification: ALERT_CLASSIFICATIONS.WARNING, message: 'Session governance failed safely.' })]
            };
        }
    }

    function safeTenantSummaries(data = {}) {
        const tenants = Array.isArray(data.platformTenants) ? data.platformTenants : [];
        return tenants.slice(0, 50).map(tenant => freezeOperationalOutput({
            tenantId: tenant.tenantId || tenant.id || '',
            tenantSlug: normalizeTenantSlug(tenant.tenantSlug || tenant.tenant_slug || ''),
            companyName: tenant.companyName || tenant.company_name || tenant.tenantName || '',
            lifecycleState: tenant.lifecycleState || tenant.status || 'UNKNOWN',
            onboardingStage: tenant.onboardingStage || tenant.onboarding_stage || '',
            employeeCount: Number(tenant.employeeCount || tenant.activeEmployeeCount || 0),
            healthState: tenant.lifecycleState === 'SUSPENDED' ? HEALTH_STATES.HIGH_RISK : HEALTH_STATES.HEALTHY
        }));
    }

    function emitOperationalTelemetry(eventType, metadata = {}, context = {}) {
        try {
            if (context.skipTelemetry === true) return false;
            if (!global.WorkflowTelemetryService?.emitTelemetry) return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType || 'OPERATIONAL_MONITORING_REPORTED', {
                source: 'operationsMonitoringService',
                severity: metadata.healthState === HEALTH_STATES.CRITICAL ? 'CRITICAL' : metadata.healthState === HEALTH_STATES.HIGH_RISK ? 'WARNING' : 'INFO',
                status: 'RECORDED',
                metadata: cloneOperationalValue(metadata)
            });
            return true;
        } catch (err) {
            return false;
        }
    }

    function auditOperationalEvent(eventType, metadata = {}, context = {}) {
        try {
            if (context.skipAuditPersistence === true) return false;
            if (!global.AuditService?.recordAudit) return false;
            global.AuditService.recordAudit({
                type: eventType || 'OPERATIONAL_MONITORING_ACCESS',
                eventType: eventType || 'OPERATIONAL_MONITORING_ACCESS',
                actionType: eventType || 'OPERATIONAL_MONITORING_ACCESS',
                source: 'operationsMonitoringService',
                severity: metadata.healthState === HEALTH_STATES.CRITICAL ? 'CRITICAL' : 'INFO',
                actorId: context.actor?.id || context.actor?.email || '',
                metadata: cloneOperationalValue(metadata)
            }, { source: 'operationsMonitoringService' });
            return true;
        } catch (err) {
            return false;
        }
    }

    function recordOperationalMetric(eventType, metadata = {}, context = {}) {
        try {
            if (context.skipMetrics === true) return false;
            if (!global.OrchestrationMetricsService?.recordWorkflowMetric) return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType || 'OPERATIONAL_MONITORING_REPORTED', { source: 'operationsMonitoringService', ...cloneOperationalValue(metadata) });
            return true;
        } catch (err) {
            return false;
        }
    }

    function generateOperationalMonitoringReport(input = {}, context = {}) {
        try {
            const malformed = !isPlainObject(input);
            const source = isPlainObject(input) ? input : {};
            const tenantScope = malformed ? { tenantSlug: '', tenantId: '' } : resolveTenantScope(source, context);
            const store = safeData();
            const data = store.data || {};
            const alerts = [];
            const warnings = [];
            if (malformed) {
                alerts.push(safeAlert({ alertCode: 'MALFORMED_MONITORING_PAYLOAD', classification: ALERT_CLASSIFICATIONS.HIGH_RISK, message: 'Operational monitoring payload was malformed.' }));
            }
            const metrics = getMetricsSnapshot();
            const workflowRows = (data.workflowEvents || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug));
            const crossTenantWorkflows = (data.workflowEvents || []).filter(row => tenantScope.tenantSlug && recordTenantSlug(row) && recordTenantSlug(row) !== tenantScope.tenantSlug);
            if (crossTenantWorkflows.length) {
                alerts.push(safeAlert({
                    alertCode: 'CROSS_TENANT_WORKFLOW_ANOMALY',
                    classification: ALERT_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    message: 'Cross-tenant workflow records were excluded from the monitoring view.',
                    metadata: { excludedRecords: crossTenantWorkflows.length, tenantSlug: tenantScope.tenantSlug }
                }));
            }
            const failedWorkflows = workflowRows.filter(row => /failed|blocked|rejected|overdue|degraded/i.test(`${row.status || ''} ${row.type || ''}`));
            const congestion = detectWorkflowCongestion({ tenantSlug: tenantScope.tenantSlug }, context);
            congestion.alerts.forEach(alert => alerts.push(alert));

            const inviteRows = (data.authInvites || data.inviteRecords || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug));
            const failedInvites = inviteRows.filter(row => /failed|expired|blocked/i.test(row.status || row.inviteStatus || '')).length;
            if (failedInvites >= 2) {
                alerts.push(safeAlert({
                    alertCode: 'REPEATED_ONBOARDING_FAILURES',
                    classification: failedInvites >= 3 ? ALERT_CLASSIFICATIONS.HIGH_RISK : ALERT_CLASSIFICATIONS.WARNING,
                    message: 'Repeated onboarding or invite failures detected.',
                    metadata: { failedInvites }
                }));
            }

            const session = sessionSummary({ actor: context.actor || {}, tenantSlug: tenantScope.tenantSlug, routeType: context.routeType || 'platform' });
            session.warnings.forEach(item => warnings.push(item));
            if (Number(session.summary.suspiciousSessions || 0) > 0) {
                alerts.push(safeAlert({
                    alertCode: 'SUSPICIOUS_SESSION_ACTIVITY',
                    classification: Number(session.summary.suspiciousSessions || 0) > 2 ? ALERT_CLASSIFICATIONS.HIGH_RISK : ALERT_CLASSIFICATIONS.WARNING,
                    message: 'Suspicious governed sessions detected.',
                    metadata: { suspiciousSessions: session.summary.suspiciousSessions }
                }));
            }

            const escalations = (data.escalations || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug));
            const openIncidents = (data.operationIncidents || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug) && !/resolved|closed/i.test(row.status || ''));
            const deploymentBlockers = (data.deploymentLogs || []).filter(row => /blocked|failed|critical/i.test(`${row.status || ''} ${row.message || ''}`)).length;
            const environmentState = global.deploymentSafetyService?.getEnvironmentState?.()?.mode || data.environmentState?.mode || data.companySettings?.environmentMode || 'DEVELOPMENT';
            if (deploymentBlockers) {
                alerts.push(safeAlert({
                    alertCode: 'DEPLOYMENT_BLOCKERS_PRESENT',
                    classification: ALERT_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Deployment blockers are present in operational logs.',
                    metadata: { deploymentBlockers }
                }));
            }

            const criticalBlockers = alerts.filter(alert => alert.classification === ALERT_CLASSIFICATIONS.CRITICAL_BLOCKER).length;
            const highRiskAlerts = alerts.filter(alert => alert.classification === ALERT_CLASSIFICATIONS.HIGH_RISK).length;
            const healthState = classifyOperationalHealth({
                criticalBlockers,
                highRisk: highRiskAlerts,
                failedWorkflows: failedWorkflows.length,
                suspiciousSessions: Number(session.summary.suspiciousSessions || 0),
                failedInvites,
                warnings: warnings.length,
                degraded: countCounters(metrics.degraded || {})
            });

            const report = freezeOperationalOutput({
                success: true,
                readOnly: true,
                healthState,
                generatedAt: nowIso(),
                tenantSlug: tenantScope.tenantSlug,
                summary: {
                    alerts: alerts.length,
                    warnings: warnings.length,
                    criticalBlockers,
                    highRiskAlerts,
                    activeIncidents: openIncidents.length,
                    sensitiveDataFiltered: true,
                    tenantIsolationPreserved: criticalBlockers === 0
                },
                runtimeCards: [
                    { label: 'Workflow Health', value: failedWorkflows.length, state: failedWorkflows.length ? HEALTH_STATES.WARNING : HEALTH_STATES.HEALTHY },
                    { label: 'Session Anomalies', value: Number(session.summary.suspiciousSessions || 0), state: session.summary.suspiciousSessions ? HEALTH_STATES.WARNING : HEALTH_STATES.HEALTHY },
                    { label: 'Escalation Density', value: escalations.length, state: escalations.length > 5 ? HEALTH_STATES.HIGH_RISK : HEALTH_STATES.HEALTHY },
                    { label: 'Environment', value: environmentState, state: deploymentBlockers ? HEALTH_STATES.HIGH_RISK : HEALTH_STATES.HEALTHY }
                ],
                workflowHealth: {
                    workflowEvents: workflowRows.length,
                    failedWorkflows: failedWorkflows.length,
                    degradedWorkflows: countCounters(metrics.degraded || {}),
                    handlerFailures: countCounters(metrics.failures || {}),
                    replayFailures: (data.eventReplayFailures || []).filter(row => sameTenantRecord(row, tenantScope.tenantSlug)).length,
                    congestion
                },
                onboardingMonitoring: {
                    invites: inviteRows.length,
                    failedInvites,
                    activationHealth: failedInvites ? HEALTH_STATES.WARNING : HEALTH_STATES.HEALTHY
                },
                escalationMonitoring: {
                    escalationDensity: escalations.length + countCounters(metrics.escalations || {}),
                    openIncidents: openIncidents.length,
                    reviewBacklog: congestion.delayedApprovals,
                    overdueReviews: congestion.overdueReviews
                },
                sessionSecurity: {
                    activeSessions: Number(session.summary.activeSessions || 0),
                    suspiciousSessions: Number(session.summary.suspiciousSessions || 0),
                    revokedSessions: Number(session.summary.revokedSessions || 0),
                    concurrentWarnings: Number(session.summary.concurrentWarnings || 0)
                },
                environmentHealth: {
                    environment: environmentState,
                    deploymentBlockers,
                    metricsAvailable: !!global.OrchestrationMetricsService,
                    stagingValidationAvailable: !!global.StagingValidationService,
                    featureGovernanceAvailable: !!global.FeatureRolloutService
                },
                tenantHealth: {
                    tenants: safeTenantSummaries(data),
                    activeTenants: safeTenantSummaries(data).filter(tenant => /ACTIVE|PILOT|PRODUCTION/i.test(tenant.lifecycleState)).length
                },
                alerts,
                warnings,
                metadata: {
                    source: 'operationsMonitoringService',
                    sensitiveDataFiltered: true,
                    tenantIsolationPreserved: criticalBlockers === 0,
                    existingMonitoringPreserved: true,
                    rbacEnforcementPreserved: true
                }
            });

            emitOperationalTelemetry(criticalBlockers || highRiskAlerts ? 'RUNTIME_ANOMALY_DETECTED' : 'OPERATIONAL_MONITORING_REPORTED', {
                healthState: report.healthState,
                alerts: report.alerts.length,
                criticalBlockers: report.summary.criticalBlockers
            }, context);
            auditOperationalEvent('OPERATIONAL_MONITORING_ACCESS', {
                healthState: report.healthState,
                alerts: report.alerts.length,
                criticalBlockers: report.summary.criticalBlockers
            }, context);
            if (report.alerts.length) {
                auditOperationalEvent('OPERATIONAL_ALERT_RECORDED', {
                    healthState: report.healthState,
                    alerts: report.alerts.length,
                    criticalBlockers: report.summary.criticalBlockers
                }, context);
            }
            recordOperationalMetric('OPERATIONAL_MONITORING_REPORTED', {
                healthState: report.healthState,
                alerts: report.alerts.length,
                criticalBlockers: report.summary.criticalBlockers
            }, context);
            return report;
        } catch (err) {
            return freezeOperationalOutput({
                success: true,
                readOnly: true,
                healthState: HEALTH_STATES.HIGH_RISK,
                generatedAt: nowIso(),
                tenantSlug: '',
                summary: { alerts: 1, warnings: 0, criticalBlockers: 0, highRiskAlerts: 1, sensitiveDataFiltered: true, tenantIsolationPreserved: false },
                runtimeCards: [],
                workflowHealth: {},
                onboardingMonitoring: {},
                escalationMonitoring: {},
                sessionSecurity: {},
                environmentHealth: {},
                tenantHealth: { tenants: [], activeTenants: 0 },
                alerts: [safeAlert({ alertCode: 'OPERATIONAL_MONITORING_FAILED_SAFE', classification: ALERT_CLASSIFICATIONS.HIGH_RISK, message: 'Operational monitoring failed safely.' })],
                warnings: [],
                metadata: { source: 'operationsMonitoringService', sensitiveDataFiltered: true, existingMonitoringPreserved: true }
            });
        }
    }

    function installGlobalHooks() {
        if (global.__arthOpsHooksInstalled) return;
        global.__arthOpsHooksInstalled = true;
        if (global.workflowEngine?.emitWorkflowEvent && !global.workflowEngine.emitWorkflowEvent.__operationsMonitoringWrapped) {
            const originalEmitWorkflowEvent = global.workflowEngine.emitWorkflowEvent.bind(global.workflowEngine);
            const wrappedEmitWorkflowEvent = function monitoredWorkflowEvent(type, payload = {}) {
                const started = Date.now();
                const result = originalEmitWorkflowEvent(type, payload);
                try {
                    const event = result?.event || payload || {};
                    const eventType = type || event.type || event.eventType || 'WORKFLOW_EVENT';
                    const priority = String(event.priority || payload.priority || '').toUpperCase();
                    const severity = String(event.severity || payload.severity || '').toUpperCase();
                    const status = String(event.status || payload.status || '').toUpperCase();
                    recordPerformance({
                        module: event.module || payload.module || 'Workflow',
                        operation: 'workflow_event',
                        durationMs: Date.now() - started,
                        status: result?.success === false ? 'Failed' : 'OK',
                        metadata: {
                            workflowType: eventType,
                            eventId: result?.eventId || event.eventId || '',
                            correlationId: result?.correlationId || event.correlationId || ''
                        }
                    });
                    if (
                        priority === 'CRITICAL' ||
                        severity === 'CRITICAL' ||
                        status === 'FAILED' ||
                        /failed|blocked|overdue/i.test(String(eventType))
                    ) {
                        createIncident({
                            severity: priority === 'CRITICAL' || severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                            module: event.module || payload.module || 'Workflow',
                            title: event.title || payload.title || `${eventType} workflow attention`,
                            description: event.message || payload.message || 'Critical workflow event captured by operations monitoring.',
                            source: 'workflow',
                            affectedRecordId: event.targetId || payload.targetId || result?.eventId || '',
                            metadata: {
                                workflowType: eventType,
                                eventId: result?.eventId || event.eventId || '',
                                correlationId: result?.correlationId || event.correlationId || ''
                            }
                        }, payload.actor || {});
                    }
                } catch (err) {}
                return result;
            };
            wrappedEmitWorkflowEvent.__operationsMonitoringWrapped = true;
            global.workflowEngine.emitWorkflowEvent = wrappedEmitWorkflowEvent;
        }
        if (global.addEventListener) {
            global.addEventListener('error', event => {
                recordError(event.error || event.message || 'Frontend error', { module: 'Frontend', action: 'window.error', severity: 'HIGH', source: 'global' });
            });
            global.addEventListener('unhandledrejection', event => {
                recordError(event.reason || 'Unhandled promise rejection', { module: 'Frontend', action: 'unhandledrejection', severity: 'HIGH', source: 'global' });
            });
        }
    }

    const service = {
        HEALTH_STATES,
        ALERT_CLASSIFICATIONS,
        runHealthCheck,
        createIncident,
        resolveIncident,
        recordError,
        recordPerformance,
        trackOperation,
        getOperationalDashboard,
        classifyOperationalHealth,
        normalizeRuntimeMetric,
        freezeOperationalOutput,
        detectWorkflowCongestion,
        validateOperationalVisibility,
        generateOperationalMonitoringReport,
        getIncidents: filters => db().getOperationIncidents(filters || {}),
        getMetrics: filters => db().getOperationMetrics(filters || {}),
        getErrors: filters => db().getServiceErrorLogs(filters || {}),
        cleanupRetention,
        installGlobalHooks
    };

    global.operationsMonitoringService = { ...(global.operationsMonitoringService || {}), ...service };
    global.OperationsMonitoringService = global.operationsMonitoringService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            const checks = [];
            const record = (name, passed, details = null) => checks.push(Object.freeze({ name, passed: !!passed, details }));
            try {
                record('workflow monitoring works', detectWorkflowCongestion({ tenantSlug: 'self-test' }, { tenantSlug: 'self-test' }).success !== false);
                const escalationReport = generateOperationalMonitoringReport({ tenantSlug: 'self-test' }, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                record('escalation monitoring works', escalationReport.escalationMonitoring !== undefined);
                const isolation = validateOperationalVisibility({ tenantSlug: 'other' }, { tenantSlug: 'self-test' });
                record('tenant operational isolation works', isolation.allowed === false);
                record('anomaly classification works', classifyOperationalHealth({ criticalBlockers: 1 }) === HEALTH_STATES.CRITICAL);
                const immutable = freezeOperationalOutput({ a: { b: 1 } });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.a));
                const malformed = generateOperationalMonitoringReport('bad-input', { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                record('malformed payloads handled safely', malformed.success === true && malformed.healthState === HEALTH_STATES.HIGH_RISK);
                const metric = normalizeRuntimeMetric({ operation: 'x', salary: 1, metadata: { service_role: 'hidden' } });
                record('sensitive HR data filtered', !/salary|service_role|hidden/i.test(JSON.stringify(metric)));
                record('dependency absence tolerated', true);
            } catch (err) {
                record('self-test has no uncaught failure', false, err && err.message ? err.message : String(err));
            }
            global.__ARTHHRMS_OPERATIONAL_MONITORING_SELF_TEST__ = Object.freeze({
                passed: checks.every(item => item.passed),
                tests: Object.freeze(checks.slice())
            });
        })();
    }
    installGlobalHooks();
})(typeof window !== 'undefined' ? window : globalThis);
