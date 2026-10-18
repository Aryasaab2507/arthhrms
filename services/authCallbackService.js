// Auth callback dispatcher. It exchanges callback credentials exactly once and
// routes the verified session to the matching flow.
(function (global) {
    'use strict';

    const CALLBACK_TYPES = Object.freeze({
        INVITE: 'invite',
        RECOVERY: 'recovery',
        MAGIC_LINK: 'magiclink',
        SIGNUP: 'signup',
        EMAIL_CONFIRMATION: 'email_confirmation'
    });
    const SUPPORTED_CALLBACK_TYPES = Object.freeze(Object.values(CALLBACK_TYPES));

    function normalizeCallbackType(value) {
        const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (normalized === 'password_recovery' || normalized === 'password_reset') return CALLBACK_TYPES.RECOVERY;
        if (normalized === 'magic_link') return CALLBACK_TYPES.MAGIC_LINK;
        if (normalized === 'email' || normalized === 'confirmation' || normalized === 'email_confirm') {
            return CALLBACK_TYPES.EMAIL_CONFIRMATION;
        }
        return SUPPORTED_CALLBACK_TYPES.includes(normalized) ? normalized : '';
    }

    function callbackTypeFromEvent(event) {
        const normalized = String(event || '').trim().toUpperCase();
        if (normalized === 'PASSWORD_RECOVERY') return CALLBACK_TYPES.RECOVERY;
        if (normalized === 'SIGNED_IN') return CALLBACK_TYPES.MAGIC_LINK;
        if (normalized === 'USER_UPDATED') return CALLBACK_TYPES.EMAIL_CONFIRMATION;
        return '';
    }

    function parseCallbackParams(url = '') {
        const source = String(url || global.location?.href || `${global.location?.search || ''}${global.location?.hash || ''}`);
        const base = global.location?.origin && !String(global.location.origin).startsWith('file:')
            ? global.location.origin
            : 'https://arthhrms.invalid';
        try {
            const parsed = new URL(source || '/', base);
            const combined = new URLSearchParams(parsed.search);
            const hash = new URLSearchParams(String(parsed.hash || '').replace(/^#/, ''));
            hash.forEach((value, key) => combined.set(key, value));
            return Object.fromEntries(combined);
        } catch (_error) {
            const combined = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
            return Object.fromEntries(combined);
        }
    }

    function detectCallbackType(input = {}) {
        const params = input.params || parseCallbackParams(input.url || '');
        return normalizeCallbackType(input.type || params.type || params.flow) || callbackTypeFromEvent(input.event);
    }

    function callbackHasCredentials(params = {}) {
        return !!(
            params.code ||
            params.token_hash ||
            (params.access_token && params.refresh_token)
        );
    }

    function sessionExpired(session) {
        const expiresAt = Number(session?.expires_at || 0);
        return !expiresAt || expiresAt <= Math.floor(Date.now() / 1000);
    }

    function callbackError(error, type = '') {
        if (type === CALLBACK_TYPES.RECOVERY) {
            return {
                ok: false,
                type,
                ...global.passwordRecoveryService?.mapError?.(error)
            };
        }
        const raw = [error?.code, error?.message, error?.error_description]
            .filter(Boolean).join(' ').toLowerCase();
        const expired = /expired|otp_expired|invalid.*(token|otp|claim|jwt)|already.*used/.test(raw);
        return {
            ok: false,
            type,
            code: expired ? 'AUTH_LINK_EXPIRED' : 'AUTH_CALLBACK_FAILED',
            error: expired
                ? 'Authentication link expired. Request a new link.'
                : 'Authentication could not be completed. Try again or request a new link.'
        };
    }

    async function establishSession(input = {}) {
        if (input.session) return input.session;
        const params = input.params || parseCallbackParams(input.url || '');
        if (params.error || params.error_description || params.error_code) {
            const error = new Error(params.error_description || params.error || 'Authentication callback failed');
            error.code = params.error_code || params.error || '';
            throw error;
        }
        if (!callbackHasCredentials(params)) throw new Error('Authentication callback credentials are missing');

        const client = global.supabaseClientService?.getClient?.();
        if (!client?.auth) throw new Error('Supabase auth client is not available');

        let result;
        if (params.token_hash && params.type) {
            const requestedType = normalizeCallbackType(params.type);
            const otpType = requestedType === CALLBACK_TYPES.EMAIL_CONFIRMATION ? 'email' : params.type;
            result = await client.auth.verifyOtp({ token_hash: params.token_hash, type: otpType });
        } else if (params.access_token && params.refresh_token) {
            if (!client.auth.setSession) throw new Error('Supabase callback session exchange is unavailable');
            result = await client.auth.setSession({
                access_token: params.access_token,
                refresh_token: params.refresh_token
            });
        } else if (params.code) {
            if (!client.auth.exchangeCodeForSession) throw new Error('Supabase PKCE session exchange is unavailable');
            result = await client.auth.exchangeCodeForSession(params.code);
        }

        if (result?.error) throw result.error;
        const session = result?.data?.session || null;
        if (!session?.access_token || !session.user?.id || sessionExpired(session)) {
            throw new Error('Authentication session invalid');
        }
        const verified = await client.auth.getUser(session.access_token);
        if (verified.error || !verified.data?.user || verified.data.user.id !== session.user.id) {
            throw verified.error || new Error('Authentication session validation failed');
        }
        return {
            ...session,
            user: verified.data.user,
            callbackType: normalizeCallbackType(result?.data?.redirectType)
        };
    }

    async function handleSessionCallback(type, session) {
        if (!session?.user?.id) {
            return { ok: false, type, error: 'Authentication session could not be established.' };
        }
        return {
            ok: true,
            type,
            userId: session.user.id,
            redirectTo: global.authService?.getRoleRedirect?.(session.user.app_metadata?.role) || 'ArthHRMS.html'
        };
    }

    async function dispatchAuthCallback(input = {}) {
        const params = input.params || parseCallbackParams(input.url || '');
        let type = detectCallbackType({ ...input, params });
        try {
            const session = await establishSession({ ...input, params });
            type = type || normalizeCallbackType(session.callbackType);

            if (!type && global.authInviteService?.hasMatchingInvite?.(session.user)) {
                type = CALLBACK_TYPES.INVITE;
            }

            switch (type) {
                case CALLBACK_TYPES.RECOVERY:
                    if (!global.passwordRecoveryService?.beginRecovery) {
                        return {
                            ok: false,
                            type,
                            code: 'RECOVERY_HANDLER_UNAVAILABLE',
                            error: 'Password recovery is unavailable. Try again later.'
                        };
                    }
                    return global.passwordRecoveryService.beginRecovery(session);
                case CALLBACK_TYPES.INVITE: {
                    if (!global.authInviteService?.beginInvitePasswordCreation) {
                        return {
                            ok: false,
                            type,
                            code: 'INVITE_HANDLER_UNAVAILABLE',
                            error: 'Invitation password setup is unavailable. Try again later.'
                        };
                    }
                    const result = global.authInviteService.beginInvitePasswordCreation({ session });
                    return { ...result, type };
                }
                case CALLBACK_TYPES.MAGIC_LINK:
                case CALLBACK_TYPES.SIGNUP:
                case CALLBACK_TYPES.EMAIL_CONFIRMATION:
                    return handleSessionCallback(type, session);
                default:
                    return {
                        ok: false,
                        type: '',
                        code: 'AUTH_CALLBACK_TYPE_REQUIRED',
                        error: 'The authentication link type is missing or unsupported.'
                    };
            }
        } catch (error) {
            global.operationsMonitoringService?.recordError?.(error, {
                module: 'Authentication',
                action: 'dispatchAuthCallback',
                severity: 'HIGH'
            });
            return callbackError(error, type);
        }
    }

    global.authCallbackService = Object.freeze({
        CALLBACK_TYPES,
        detectCallbackType,
        dispatchAuthCallback,
        parseCallbackParams
    });
})(typeof window !== 'undefined' ? window : globalThis);
