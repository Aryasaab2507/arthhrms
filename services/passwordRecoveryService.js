// Password recovery is intentionally isolated from invitation onboarding.
(function (global) {
    'use strict';

    const RECOVERY_TYPE = 'recovery';
    const PASSWORD_REQUIREMENTS = Object.freeze({
        minimumLength: 12
    });
    let pendingRecovery = null;

    function db() {
        return global.DB || null;
    }

    function sessionExpired(session) {
        const expiresAt = Number(session?.expires_at || 0);
        return !expiresAt || expiresAt <= Math.floor(Date.now() / 1000);
    }

    function mapError(error) {
        const raw = [
            error?.code,
            error?.name,
            error?.message,
            error?.error_description
        ].filter(Boolean).join(' ').toLowerCase();

        if (/user.*(deleted|not found)|account.*(deleted|not found)/.test(raw)) {
            return {
                code: 'RECOVERY_USER_UNAVAILABLE',
                error: 'This user account is no longer available. Contact your administrator.'
            };
        }
        if (/network|fetch|offline|timeout|connection/.test(raw)) {
            return {
                code: 'RECOVERY_NETWORK_ERROR',
                error: 'We could not connect to the authentication service. Check your connection and try again.'
            };
        }
        if (/weak|password.*(short|strength|require)|same password/.test(raw)) {
            return {
                code: 'RECOVERY_PASSWORD_REJECTED',
                error: 'The password was rejected. Use at least 12 characters with uppercase, lowercase, number, and special character.'
            };
        }
        if (/expired|otp_expired|invalid.*(token|otp|claim|jwt)|(?:token|jwt).*invalid|already.*used|session.*(missing|invalid|required)|refresh_token_not_found/.test(raw)) {
            return {
                code: 'RECOVERY_LINK_EXPIRED',
                error: 'Recovery link expired. Request another password reset.'
            };
        }
        return {
            code: 'RECOVERY_FAILED',
            error: 'Password recovery could not be completed. Request another password reset or try again.'
        };
    }

    function evaluatePassword(password) {
        const value = String(password || '');
        const checks = Object.freeze({
            minimumLength: value.length >= PASSWORD_REQUIREMENTS.minimumLength,
            uppercase: /[A-Z]/.test(value),
            lowercase: /[a-z]/.test(value),
            number: /[0-9]/.test(value),
            specialCharacter: /[^A-Za-z0-9\s]/.test(value)
        });
        const score = Object.values(checks).filter(Boolean).length;
        return Object.freeze({
            valid: score === Object.keys(checks).length,
            score,
            maximumScore: Object.keys(checks).length,
            checks
        });
    }

    function beginRecovery(session) {
        if (!session?.access_token || !session?.user?.id || sessionExpired(session)) {
            pendingRecovery = null;
            return { ok: false, type: RECOVERY_TYPE, ...mapError(new Error('Recovery session invalid')) };
        }
        pendingRecovery = Object.freeze({
            userId: session.user.id,
            expiresAt: Number(session.expires_at || 0),
            establishedAt: Date.now()
        });
        global.authService?.clearSession?.();
        return {
            ok: true,
            type: RECOVERY_TYPE,
            action: 'reset_password',
            userId: session.user.id
        };
    }

    async function audit(actionType, userId, description) {
        try {
            db()?.writeAuditLog?.(
                'system',
                userId,
                actionType,
                'Authentication',
                userId,
                description
            );
        } catch (error) {
            global.operationsMonitoringService?.recordError?.(error, {
                module: 'Authentication',
                action: 'auditPasswordRecovery',
                severity: 'MEDIUM'
            });
        }
    }

    async function completePasswordRecovery(password) {
        const policy = evaluatePassword(password);
        if (!policy.valid) {
            return {
                ok: false,
                type: RECOVERY_TYPE,
                code: 'RECOVERY_PASSWORD_WEAK',
                error: 'Use at least 12 characters with uppercase, lowercase, number, and special character.',
                policy
            };
        }
        if (!pendingRecovery?.userId) {
            return { ok: false, type: RECOVERY_TYPE, ...mapError(new Error('Recovery session missing')) };
        }

        const client = global.supabaseClientService?.getClient?.();
        if (!client?.auth?.updateUser) {
            return {
                ok: false,
                type: RECOVERY_TYPE,
                code: 'RECOVERY_SERVICE_UNAVAILABLE',
                error: 'The authentication service is unavailable. Try again later.'
            };
        }

        try {
            const sessionResult = await client.auth.getSession();
            const session = sessionResult?.data?.session;
            if (
                sessionResult?.error ||
                !session?.access_token ||
                sessionExpired(session) ||
                session.user?.id !== pendingRecovery.userId
            ) {
                pendingRecovery = null;
                throw sessionResult?.error || new Error('Recovery session invalid');
            }

            const verified = await client.auth.getUser(session.access_token);
            if (verified.error || !verified.data?.user || verified.data.user.id !== pendingRecovery.userId) {
                pendingRecovery = null;
                throw verified.error || new Error('Recovery session invalid');
            }

            const result = await client.auth.updateUser({ password: String(password) });
            if (result.error || !result.data?.user) throw result.error || new Error('Password update failed');

            const userId = pendingRecovery.userId;
            pendingRecovery = null;
            await audit(
                'password recovery completed',
                userId,
                'Password updated through a validated Supabase recovery session.'
            );
            try {
                if (client.auth.signOut) await client.auth.signOut({ scope: 'local' });
            } catch (_error) {}
            global.authService?.clearSession?.();
            return {
                ok: true,
                type: RECOVERY_TYPE,
                message: 'Password updated successfully.'
            };
        } catch (error) {
            const userId = pendingRecovery?.userId || '';
            if (userId) {
                await audit(
                    'password recovery failed',
                    userId,
                    'Password recovery failed before completion.'
                );
            }
            global.operationsMonitoringService?.recordError?.(error, {
                module: 'Authentication',
                action: 'completePasswordRecovery',
                severity: 'HIGH'
            });
            return { ok: false, type: RECOVERY_TYPE, ...mapError(error) };
        }
    }

    global.passwordRecoveryService = Object.freeze({
        PASSWORD_REQUIREMENTS,
        beginRecovery,
        completePasswordRecovery,
        evaluatePassword,
        mapError
    });
})(typeof window !== 'undefined' ? window : globalThis);
