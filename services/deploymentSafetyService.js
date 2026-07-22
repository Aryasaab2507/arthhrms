// Deployment safety and pilot-environment guardrails for ARTHHRMS.
(function (global) {
    function db() { return global.DB; }

    function currentActor() {
        const user = global.authService?.getCurrentUser?.() || {};
        return {
            role: user.role || 'system',
            id: user.id || user.empId || user.email || '',
            name: user.name || user.email || user.id || 'System'
        };
    }

    function toast(message, type = 'warn') {
        if (typeof global.toast === 'function') global.toast(message, type);
        else if (global.errorService?.showMessage) global.errorService.showMessage(message, type);
        else if (global.console) console.warn(message);
    }

    function canConfirm(options = {}) {
        return options.confirm !== false && typeof global.confirm === 'function';
    }

    function getEnvironmentState() {
        return db().getEnvironmentState ? db().getEnvironmentState() : { mode: 'DEVELOPMENT' };
    }

    function checkAction(actionType, payload = {}) {
        return db().checkDeploymentAction
            ? db().checkDeploymentAction(actionType, payload, currentActor())
            : { allowed: true, requiresConfirmation: false, mode: 'DEVELOPMENT' };
    }

    function guardAction(actionType, payload = {}, options = {}) {
        const safety = checkAction(actionType, payload);
        if (!safety.allowed) {
            toast(safety.warning || 'Action blocked by deployment safety controls.', 'warn');
            db().logDeploymentEvent?.({
                eventType: 'DEPLOYMENT_ACTION_BLOCKED',
                status: 'Blocked',
                message: safety.warning || actionType + ' blocked',
                actor: currentActor(),
                metadata: { actionType, payload, safety }
            });
            return { ok: false, blocked: true, safety, reason: safety.warning };
        }
        if (safety.requiresConfirmation && canConfirm(options)) {
            const label = options.label || actionType.replace(/_/g, ' ');
            const accepted = global.confirm(`${safety.mode} safety warning:\n\n${safety.warning}\n\nContinue with ${label}?`);
            if (!accepted) {
                db().logDeploymentEvent?.({
                    eventType: 'DEPLOYMENT_ACTION_CANCELLED',
                    status: 'Cancelled',
                    message: `${label} cancelled after ${safety.mode} warning`,
                    actor: currentActor(),
                    metadata: { actionType, payload, safety }
                });
                return { ok: false, cancelled: true, safety, reason: 'Cancelled by user' };
            }
        }
        if (safety.requiresConfirmation || safety.level === 'CRITICAL') {
            db().logDeploymentEvent?.({
                eventType: 'DEPLOYMENT_ACTION_CONFIRMED',
                status: safety.level || 'Confirmed',
                message: `${actionType.replace(/_/g, ' ')} passed deployment safety gate`,
                actor: currentActor(),
                metadata: { actionType, payload, safety }
            });
        }
        return { ok: true, safety };
    }

    function setEnvironmentMode(mode, reason = '') {
        const guard = guardAction('environment_change', { targetMode: mode }, { label: 'environment mode change' });
        if (!guard.ok) return guard;
        return db().setEnvironmentMode(mode, currentActor(), reason);
    }

    function createCheckpoint(label = '') {
        return db().createDeploymentCheckpoint?.(label || 'Manual deployment checkpoint', currentActor(), { source: 'deploymentSafetyService' });
    }

    function getHealthSnapshot() {
        const env = getEnvironmentState();
        const migration = global.migrationControlService?.getSummary?.() || db().getMigrationHealthSummary?.() || {};
        const install = db().getInstallHealth?.() || {};
        return {
            environment: env.mode,
            setupComplete: !!install.setupCompleted,
            supabaseConfigured: !!global.supabaseClientService?.hasConfig?.(),
            migration,
            checkpoints: db().getDeploymentCheckpoints?.().length || 0,
            lastQaRun: db().getQaValidationRuns?.()[0] || null
        };
    }

    const service = {
        getEnvironmentState,
        checkAction,
        guardAction,
        setEnvironmentMode,
        createCheckpoint,
        getCheckpoints: () => db().getDeploymentCheckpoints?.() || [],
        getLogs: () => db().getDeploymentLogs?.() || [],
        getHealthSnapshot,
        saveQaRun: (run = {}) => db().saveQaValidationRun?.(run, currentActor()),
        getQaRuns: () => db().getQaValidationRuns?.() || []
    };

    global.deploymentSafetyService = { ...(global.deploymentSafetyService || {}), ...service };
})(typeof window !== 'undefined' ? window : globalThis);
