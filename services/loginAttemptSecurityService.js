/**
 * loginAttemptSecurityService.js
 * ARTHHRMS - Enterprise Authentication Protection Framework
 *
 * Tracks login attempts, lockouts, suspicious login indicators, and
 * authentication analytics without storing credentials or raw network secrets.
 */
(function attachLoginAttemptSecurityService(global) {
    'use strict';

    var PREFIX = '[LoginAttemptSecurityService]';
    var SOURCE = 'loginAttemptSecurityService';
    var MAX_HISTORY = 1000;

    var ACCOUNT_STATES = Object.freeze({
        ACTIVE: 'ACTIVE',
        WARNING: 'WARNING',
        LOCKED: 'LOCKED',
        SECURITY_REVIEW: 'SECURITY_REVIEW',
        DISABLED: 'DISABLED'
    });

    var OUTCOMES = Object.freeze({
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
        BLOCKED: 'BLOCKED'
    });

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var DEFAULT_POLICY = Object.freeze({
        warningThreshold: 1,
        elevatedMonitoringThreshold: 3,
        lockoutThreshold: 5,
        securityReviewThreshold: 10,
        lockoutMinutes: 15,
        cooldownWindowMinutes: 15,
        velocityWindowMinutes: 10,
        maxAttemptsPerWindow: 8,
        credentialStuffingPrincipalThreshold: 3,
        impossibleTravelMinutes: 120
    });

    var SECRET_KEY_PATTERN = /(password|secret|token|jwt|credential|authorization|private[_-]?key|otp|passcode)/i;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get();
        } catch (error) {}
        return {};
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {
            safeWarn('Login security persistence failed safely.', { error: error && error.message });
        }
        return false;
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function nowIso() {
        try { return new Date().toISOString(); } catch (error) { return String(Date.now()); }
    }

    function timeMs(value) {
        var date = value ? new Date(value) : new Date();
        var ms = date.getTime();
        return Number.isFinite(ms) ? ms : Date.now();
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function cloneSanitized(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 5) return safeString(value, '');
        if (Array.isArray(value)) return value.slice(0, 150).map(function mapItem(item) { return cloneSanitized(item, currentDepth + 1); });
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function copyKey(key) {
                if (SECRET_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], currentDepth + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function freezeLoginSecurityOutput(value) {
        return deepFreeze(cloneSanitized(value, 0));
    }

    function normalizeRole(role) {
        if (global.authService && typeof global.authService.normalizeRole === 'function') {
            return safeString(global.authService.normalizeRole(role), '').toLowerCase();
        }
        var normalized = safeString(role, '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (normalized === 'platformowner' || normalized === 'owner' || normalized === 'root') return 'platform_owner';
        if (normalized === 'superadmin') return 'super_admin';
        if (normalized === 'hrhead') return 'hr_head';
        if (normalized === 'emp') return 'employee';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value, '').trim().toLowerCase();
        slug = slug.replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function tenantSlugFromId(value) {
        var token = safeString(value, '').trim().toLowerCase();
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function tenantOf(input) {
        var source = isPlainObject(input) ? input : {};
        var meta = isPlainObject(source.metadata) ? source.metadata : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.companySlug || meta.tenantSlug || meta.tenant_slug || '');
        var tenantId = safeString(source.tenantId || source.tenant_id || source.companyId || source.company_id || meta.tenantId || meta.companyId || '', '').trim();
        if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
        return { tenantSlug: tenantSlug, tenantId: tenantId };
    }

    function normalizeEmail(value) {
        return safeString(value, '').trim().toLowerCase();
    }

    function hashToken(value) {
        var text = safeString(value, '');
        var hash = 0;
        for (var index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash).toString(36).toUpperCase();
    }

    function maskEmail(email) {
        var value = normalizeEmail(email);
        if (!value || value.indexOf('@') === -1) return value ? 'user-' + hashToken(value).slice(0, 6) : '';
        var parts = value.split('@');
        var prefix = parts[0].slice(0, 2);
        return prefix + '***@' + parts[1];
    }

    function coarseIp(value) {
        var ip = safeString(value, '').trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            var parts = ip.split('.');
            return parts[0] + '.' + parts[1] + '.x.x';
        }
        return '';
    }

    function browserFromUserAgent(userAgent) {
        var ua = safeString(userAgent, '').toLowerCase();
        if (ua.indexOf('edg') !== -1) return 'Edge';
        if (ua.indexOf('chrome') !== -1) return 'Chrome';
        if (ua.indexOf('firefox') !== -1) return 'Firefox';
        if (ua.indexOf('safari') !== -1) return 'Safari';
        return ua ? 'Other' : 'Unknown';
    }

    function osFromUserAgent(userAgent, platform) {
        var text = (safeString(userAgent, '') + ' ' + safeString(platform, '')).toLowerCase();
        if (text.indexOf('windows') !== -1 || text.indexOf('win') !== -1) return 'Windows';
        if (text.indexOf('mac') !== -1) return 'macOS';
        if (text.indexOf('android') !== -1) return 'Android';
        if (text.indexOf('iphone') !== -1 || text.indexOf('ipad') !== -1 || text.indexOf('ios') !== -1) return 'iOS';
        if (text.indexOf('linux') !== -1) return 'Linux';
        return 'Unknown';
    }

    function normalizeDevice(input) {
        try {
            if (global.SessionGovernanceService && typeof global.SessionGovernanceService.normalizeDeviceMetadata === 'function') {
                return global.SessionGovernanceService.normalizeDeviceMetadata(input || {});
            }
        } catch (error) {}
        var source = isPlainObject(input) ? input : {};
        var nav = global.navigator || {};
        var userAgent = safeString(source.userAgent || nav.userAgent || '', '');
        var platform = safeString(source.platform || nav.platform || '', '');
        var browser = safeString(source.browser || browserFromUserAgent(userAgent), 'Unknown');
        var os = safeString(source.os || osFromUserAgent(userAgent, platform), 'Unknown');
        var suppliedFingerprint = safeString(source.deviceFingerprint || source.fingerprint || '', '');
        var fingerprint = /^DEV-/i.test(suppliedFingerprint) ? suppliedFingerprint : 'DEV-' + hashToken([browser, os, platform, source.source || 'login'].join('|'));
        var geo = isPlainObject(source.geo) ? source.geo : {};
        return freezeLoginSecurityOutput({
            deviceFingerprint: fingerprint,
            browser: browser,
            os: os,
            deviceClass: /mobile|android|iphone|ipad/i.test(userAgent) ? 'mobile' : 'desktop',
            loginSurface: safeString(source.source || source.loginSurface || 'browser', 'browser'),
            approximateGeo: {
                country: safeString(source.country || geo.country || '', '').slice(0, 32),
                region: safeString(source.region || geo.region || '', '').slice(0, 32),
                timezone: safeString(source.timezone || geo.timezone || '', '').slice(0, 64)
            },
            ipRange: coarseIp(source.ipRange || source.ipAddress || source.ip || ''),
            capturedAt: safeString(source.capturedAt || nowIso(), nowIso())
        });
    }

    function normalizePolicy(input) {
        var source = isPlainObject(input) ? input : {};
        var policy = Object.assign({}, DEFAULT_POLICY, source);
        Object.keys(DEFAULT_POLICY).forEach(function normalizeNumber(key) {
            policy[key] = Math.max(1, Number(policy[key] || DEFAULT_POLICY[key]) || DEFAULT_POLICY[key]);
        });
        return policy;
    }

    function ensureAuthData(data) {
        data.loginAttemptHistory = Array.isArray(data.loginAttemptHistory) ? data.loginAttemptHistory.slice() : [];
        data.loginLockoutHistory = Array.isArray(data.loginLockoutHistory) ? data.loginLockoutHistory.slice() : [];
        data.authenticationSecurityHistory = Array.isArray(data.authenticationSecurityHistory) ? data.authenticationSecurityHistory.slice() : [];
        data.loginSecurityState = isPlainObject(data.loginSecurityState) ? Object.assign({}, data.loginSecurityState) : {};
        return data;
    }

    function findUserByPrincipal(source, data) {
        var email = normalizeEmail(source.email || source.username || source.login || '');
        var userId = safeString(source.userId || source.authUserId || '', '');
        var employeeId = safeString(source.employeeId || source.empId || '', '');
        var users = Array.isArray(data.users) ? data.users : [];
        return users.find(function byUser(row) {
            if (userId && safeString(row.id, '') === userId) return true;
            if (employeeId && safeString(row.empId || row.employeeId, '') === employeeId) return true;
            return email && normalizeEmail(row.email) === email;
        }) || null;
    }

    function resolvePrincipal(source, data, context) {
        var user = findUserByPrincipal(source, data);
        var actor = context && context.actor || {};
        var email = normalizeEmail(source.email || source.username || source.login || user && user.email || actor.email || '');
        var tenant = tenantOf(Object.assign({}, context || {}, user || {}, source));
        var settings = data.companySettings || {};
        if (!tenant.tenantSlug) tenant.tenantSlug = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || '');
        if (!tenant.tenantId) tenant.tenantId = safeString(user && user.tenantId || settings.tenantId || '', '');
        return {
            email: email,
            maskedEmail: maskEmail(email),
            userId: safeString(source.userId || source.authUserId || user && user.id || '', ''),
            employeeId: safeString(source.employeeId || source.empId || user && (user.empId || user.employeeId) || '', ''),
            role: normalizeRole(source.role || user && user.role || actor.role || 'employee'),
            tenantSlug: tenant.tenantSlug,
            tenantId: tenant.tenantId
        };
    }

    function stateKey(principal) {
        return [principal.tenantSlug || 'platform', principal.email || principal.userId || principal.employeeId || 'unknown'].join('::');
    }

    function recentAttempts(attempts, principal, policy, nowMs) {
        var cutoff = nowMs - policy.cooldownWindowMinutes * 60000;
        return attempts.filter(function matches(row) {
            return row.tenantSlug === principal.tenantSlug &&
                (row.email === principal.email || (principal.userId && row.userId === principal.userId) || (principal.employeeId && row.employeeId === principal.employeeId)) &&
                timeMs(row.timestamp) >= cutoff;
        });
    }

    function latestSuccess(attempts, principal) {
        return attempts.filter(function matches(row) {
            return row.tenantSlug === principal.tenantSlug &&
                (row.email === principal.email || (principal.userId && row.userId === principal.userId) || (principal.employeeId && row.employeeId === principal.employeeId)) &&
                row.outcome === OUTCOMES.SUCCESS;
        }).sort(function sortDesc(a, b) { return timeMs(b.timestamp) - timeMs(a.timestamp); })[0] || null;
    }

    function accountStateForFailures(failedCount, policy) {
        if (failedCount >= policy.securityReviewThreshold) return ACCOUNT_STATES.SECURITY_REVIEW;
        if (failedCount >= policy.lockoutThreshold) return ACCOUNT_STATES.LOCKED;
        if (failedCount >= policy.warningThreshold) return ACCOUNT_STATES.WARNING;
        return ACCOUNT_STATES.ACTIVE;
    }

    function severityForState(state) {
        if (state === ACCOUNT_STATES.SECURITY_REVIEW) return SEVERITIES.CRITICAL;
        if (state === ACCOUNT_STATES.LOCKED) return SEVERITIES.HIGH;
        if (state === ACCOUNT_STATES.WARNING) return SEVERITIES.WARNING;
        return SEVERITIES.INFO;
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'LOGIN_SECURITY_FAILURE'),
            severity: safeString(severity || SEVERITIES.HIGH, SEVERITIES.HIGH).toUpperCase(),
            message: safeString(message, 'Login security failure.'),
            metadata: freezeLoginSecurityOutput(metadata || {})
        });
    }

    function safeFinding(code, severity, message, metadata) {
        return Object.freeze({
            findingCode: safeString(code, 'LOGIN_SECURITY_FINDING'),
            severity: safeString(severity || SEVERITIES.WARNING, SEVERITIES.WARNING).toUpperCase(),
            message: safeString(message, 'Login security finding.'),
            metadata: freezeLoginSecurityOutput(metadata || {})
        });
    }

    function auditAuth(eventType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return false;
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: eventType,
                    actionType: eventType,
                    module: 'Authentication Security',
                    source: SOURCE,
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    actorRole: context && context.actor && context.actor.role || 'system',
                    metadata: cloneSanitized(metadata || {})
                }, { source: SOURCE });
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context && context.actor && context.actor.role || 'system',
                    context && context.actor && (context.actor.id || context.actor.email) || '',
                    eventType,
                    'Authentication Security',
                    metadata && (metadata.userId || metadata.email || metadata.maskedEmail) || '',
                    metadata && metadata.description || eventType
                );
                return true;
            }
        } catch (error) {
            safeWarn('Authentication security audit failed safely.', { eventType: eventType, error: error && error.message });
        }
        return false;
    }

    function emitMetric(eventType, metadata) {
        try {
            if (global.OrchestrationMetricsService && typeof global.OrchestrationMetricsService.recordWorkflowMetric === 'function') {
                global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, cloneSanitized(metadata || {})));
                return true;
            }
        } catch (error) {}
        return false;
    }

    function appendBounded(list, row) {
        var next = Array.isArray(list) ? list.slice() : [];
        next.push(cloneSanitized(Object.assign({ immutable: true }, row)));
        if (next.length > MAX_HISTORY) next = next.slice(-MAX_HISTORY);
        return next;
    }

    function roleCanReview(role) {
        return ['hr', 'hr_head', 'director', 'super_admin', 'platform_owner'].indexOf(normalizeRole(role)) !== -1;
    }

    function canSeeAttempt(row, context) {
        var actor = context && context.actor || {};
        var role = normalizeRole(actor.role || context && context.role || '');
        var scope = tenantOf(context || {});
        if (role === 'platform_owner') return true;
        if (roleCanReview(role)) return !!scope.tenantSlug && row.tenantSlug === scope.tenantSlug;
        if (scope.tenantSlug && row.tenantSlug !== scope.tenantSlug) return false;
        return (actor.email && normalizeEmail(actor.email) === row.email) ||
            (actor.id && safeString(actor.id, '') === safeString(row.userId, '')) ||
            (actor.userId && safeString(actor.userId, '') === safeString(row.userId, '')) ||
            (actor.empId && safeString(actor.empId, '') === safeString(row.employeeId, '')) ||
            (actor.employeeId && safeString(actor.employeeId, '') === safeString(row.employeeId, ''));
    }

    function detectSuspiciousLogin(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var data = rawData();
            var principal = resolvePrincipal(source, data, context);
            var device = normalizeDevice(source.device || source.deviceMetadata || source);
            var policy = normalizePolicy(context.policy || source.policy);
            var attempts = Array.isArray(data.loginAttemptHistory) ? data.loginAttemptHistory : [];
            var nowMs = timeMs(source.loginAt || source.timestamp || nowIso());
            var findings = [];
            var recent = recentAttempts(attempts, principal, policy, nowMs);
            var failed = recent.filter(function failedOnly(row) { return row.outcome === OUTCOMES.FAILED || row.outcome === OUTCOMES.BLOCKED; });
            var successes = attempts.filter(function successOnly(row) {
                return row.tenantSlug === principal.tenantSlug &&
                    (row.email === principal.email || row.userId === principal.userId || row.employeeId === principal.employeeId) &&
                    row.outcome === OUTCOMES.SUCCESS;
            });
            var knownDevice = successes.some(function sameDevice(row) { return row.device && row.device.deviceFingerprint === device.deviceFingerprint; });
            if ((source.outcome || '').toUpperCase() === OUTCOMES.SUCCESS && successes.length && !knownDevice) {
                findings.push(safeFinding('NEW_DEVICE_LOGIN', SEVERITIES.WARNING, 'Successful login from a new device for this account.', { maskedEmail: principal.maskedEmail, browser: device.browser, os: device.os }));
            }
            if (failed.length >= policy.elevatedMonitoringThreshold) {
                findings.push(safeFinding('EXCESSIVE_FAILED_LOGINS', failed.length >= policy.lockoutThreshold ? SEVERITIES.HIGH : SEVERITIES.WARNING, 'Repeated failed login attempts detected within the cooldown window.', { failedCount: failed.length }));
            }
            if (recent.length >= policy.maxAttemptsPerWindow) {
                findings.push(safeFinding('ABNORMAL_LOGIN_VELOCITY', SEVERITIES.HIGH, 'Abnormal login velocity detected for this account.', { attemptCount: recent.length }));
            }
            var sameRangePrincipals = {};
            if (device.ipRange) {
                attempts.filter(function sameRange(row) {
                    return row.tenantSlug === principal.tenantSlug && row.device && row.device.ipRange === device.ipRange && timeMs(row.timestamp) >= nowMs - policy.velocityWindowMinutes * 60000;
                }).forEach(function collectPrincipal(row) {
                    sameRangePrincipals[row.email || row.userId || row.employeeId || row.maskedEmail] = true;
                });
                if (Object.keys(sameRangePrincipals).length >= policy.credentialStuffingPrincipalThreshold) {
                    findings.push(safeFinding('CREDENTIAL_STUFFING_PATTERN', SEVERITIES.CRITICAL, 'Multiple principals are failing from the same coarse network range.', { principalCount: Object.keys(sameRangePrincipals).length }));
                }
            }
            var latest = latestSuccess(attempts, principal);
            if (latest && latest.device && latest.device.approximateGeo && device.approximateGeo &&
                latest.device.approximateGeo.country && device.approximateGeo.country &&
                latest.device.approximateGeo.country !== device.approximateGeo.country &&
                Math.abs(nowMs - timeMs(latest.timestamp)) <= policy.impossibleTravelMinutes * 60000) {
                findings.push(safeFinding('IMPOSSIBLE_TRAVEL_LOGIN', SEVERITIES.HIGH, 'Country changed too quickly between successful login events.', {}));
            }
            var riskLevel = findings.some(function critical(item) { return item.severity === SEVERITIES.CRITICAL; }) ? SEVERITIES.CRITICAL :
                findings.some(function high(item) { return item.severity === SEVERITIES.HIGH; }) ? SEVERITIES.HIGH :
                findings.length ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeLoginSecurityOutput({
                success: true,
                suspicious: findings.length > 0,
                riskLevel: riskLevel,
                findings: findings,
                evidence: {
                    recentAttempts: recent.length,
                    recentFailures: failed.length,
                    knownDevice: knownDevice,
                    tenantSlug: principal.tenantSlug
                },
                confidence: findings.length ? 82 : 70,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                suspicious: true,
                riskLevel: SEVERITIES.HIGH,
                findings: [safeFinding('SUSPICIOUS_LOGIN_DETECTION_FAILED_SAFE', SEVERITIES.HIGH, 'Suspicious login detection failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function applyLockoutPolicy(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var data = ensureAuthData(rawData());
            var principal = resolvePrincipal(source, data, context);
            var policy = normalizePolicy(context.policy || source.policy);
            var key = stateKey(principal);
            var current = data.loginSecurityState[key] || {};
            if (current.accountState === ACCOUNT_STATES.LOCKED && current.lockedUntil && timeMs(current.lockedUntil) <= timeMs(source.now || context.now || nowIso())) {
                current = Object.assign({}, current, {
                    accountState: ACCOUNT_STATES.ACTIVE,
                    locked: false,
                    unlockedAt: nowIso(),
                    unlockReason: 'auto_unlock'
                });
                data.loginSecurityState[key] = current;
                data.loginLockoutHistory = appendBounded(data.loginLockoutHistory, {
                    lockoutId: 'UNLOCK-' + Date.now() + '-' + hashToken(key).slice(0, 5),
                    eventType: 'AUTO_UNLOCK',
                    tenantSlug: principal.tenantSlug,
                    tenantId: principal.tenantId,
                    userId: principal.userId,
                    employeeId: principal.employeeId,
                    email: principal.email,
                    maskedEmail: principal.maskedEmail,
                    accountState: ACCOUNT_STATES.ACTIVE,
                    timestamp: nowIso()
                });
                saveData(data);
            }
            var locked = current.accountState === ACCOUNT_STATES.LOCKED || current.accountState === ACCOUNT_STATES.SECURITY_REVIEW || current.accountState === ACCOUNT_STATES.DISABLED;
            return freezeLoginSecurityOutput({
                success: true,
                locked: locked,
                accountState: current.accountState || ACCOUNT_STATES.ACTIVE,
                failedCount: Number(current.failedCount || 0),
                lockoutCount: Number(current.lockoutCount || 0),
                lockedUntil: current.lockedUntil || '',
                securityReviewRequired: current.accountState === ACCOUNT_STATES.SECURITY_REVIEW,
                policy: {
                    lockoutThreshold: policy.lockoutThreshold,
                    securityReviewThreshold: policy.securityReviewThreshold,
                    lockoutMinutes: policy.lockoutMinutes
                },
                metadata: { tenantIsolationPreserved: true, authenticationGovernancePreserved: true },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                locked: true,
                accountState: ACCOUNT_STATES.SECURITY_REVIEW,
                failures: [safeFailure('LOCKOUT_POLICY_FAILED_SAFE', SEVERITIES.HIGH, 'Lockout policy failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function recordLoginAttempt(input, contextInput) {
        try {
            if (!isPlainObject(input)) {
                return freezeLoginSecurityOutput({
                    success: false,
                    outcome: OUTCOMES.BLOCKED,
                    failures: [safeFailure('MALFORMED_LOGIN_ATTEMPT_PAYLOAD', SEVERITIES.HIGH, 'Login attempt payload is missing or malformed.', {})],
                    timestamp: nowIso()
                });
            }
            var context = isPlainObject(contextInput) ? contextInput : {};
            var data = ensureAuthData(rawData());
            var principal = resolvePrincipal(input, data, context);
            var policy = normalizePolicy(context.policy || input.policy);
            var device = normalizeDevice(input.device || input.deviceMetadata || input);
            var outcome = safeString(input.outcome || input.status || '', '').trim().toUpperCase();
            if (outcome !== OUTCOMES.SUCCESS && outcome !== OUTCOMES.FAILED && outcome !== OUTCOMES.BLOCKED) outcome = input.success === true ? OUTCOMES.SUCCESS : OUTCOMES.FAILED;
            var timestamp = safeString(input.loginAt || input.timestamp || nowIso(), nowIso());
            var key = stateKey(principal);
            var previousState = data.loginSecurityState[key] || { accountState: ACCOUNT_STATES.ACTIVE, failedCount: 0, lockoutCount: 0 };
            var recent = recentAttempts(data.loginAttemptHistory, principal, policy, timeMs(timestamp));
            var failedCount = outcome === OUTCOMES.FAILED ?
                recent.filter(function failed(row) { return row.outcome === OUTCOMES.FAILED || row.outcome === OUTCOMES.BLOCKED; }).length + 1 :
                (outcome === OUTCOMES.SUCCESS ? 0 : Number(previousState.failedCount || 0));
            var accountState = outcome === OUTCOMES.SUCCESS ? ACCOUNT_STATES.ACTIVE : accountStateForFailures(failedCount, policy);
            if (outcome === OUTCOMES.BLOCKED && previousState.accountState) accountState = previousState.accountState;
            var locked = accountState === ACCOUNT_STATES.LOCKED || accountState === ACCOUNT_STATES.SECURITY_REVIEW || accountState === ACCOUNT_STATES.DISABLED;
            var lockedUntil = locked && accountState === ACCOUNT_STATES.LOCKED ? new Date(timeMs(timestamp) + policy.lockoutMinutes * 60000).toISOString() : '';
            var suspicious = detectSuspiciousLogin(Object.assign({}, input, { outcome: outcome, device: device, tenantSlug: principal.tenantSlug }), context);
            var attempt = {
                attemptId: 'LA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: principal.tenantSlug,
                tenantId: principal.tenantId,
                userId: principal.userId,
                employeeId: principal.employeeId,
                email: principal.email,
                maskedEmail: principal.maskedEmail,
                role: principal.role,
                outcome: outcome,
                accountState: accountState,
                failedCount: failedCount,
                source: safeString(input.source || input.loginSource || input.route || 'auth', 'auth').slice(0, 80),
                failureReason: outcome === OUTCOMES.FAILED || outcome === OUTCOMES.BLOCKED ? safeString(input.failureReason || input.reason || 'AUTHENTICATION_FAILED', 'AUTHENTICATION_FAILED').slice(0, 80) : '',
                device: device,
                riskLevel: suspicious.riskLevel || severityForState(accountState),
                suspicious: suspicious.suspicious === true || locked,
                timestamp: timestamp
            };
            data.loginAttemptHistory = appendBounded(data.loginAttemptHistory, attempt);
            var nextState = {
                accountState: accountState,
                failedCount: failedCount,
                lockoutCount: Number(previousState.lockoutCount || 0) + ((locked && previousState.accountState !== accountState) ? 1 : 0),
                locked: locked,
                lockedUntil: lockedUntil,
                securityReviewRequired: accountState === ACCOUNT_STATES.SECURITY_REVIEW,
                updatedAt: nowIso(),
                lastAttemptAt: timestamp,
                userId: principal.userId,
                employeeId: principal.employeeId,
                email: principal.email,
                maskedEmail: principal.maskedEmail,
                tenantSlug: principal.tenantSlug,
                tenantId: principal.tenantId
            };
            if (outcome === OUTCOMES.SUCCESS) {
                nextState.locked = false;
                nextState.lockedUntil = '';
                nextState.securityReviewRequired = false;
            }
            data.loginSecurityState[key] = nextState;
            if (locked) {
                data.loginLockoutHistory = appendBounded(data.loginLockoutHistory, {
                    lockoutId: 'LOCK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                    eventType: accountState === ACCOUNT_STATES.SECURITY_REVIEW ? 'SECURITY_REVIEW_FLAG' : 'ACCOUNT_LOCKED',
                    tenantSlug: principal.tenantSlug,
                    tenantId: principal.tenantId,
                    userId: principal.userId,
                    employeeId: principal.employeeId,
                    email: principal.email,
                    maskedEmail: principal.maskedEmail,
                    failedCount: failedCount,
                    accountState: accountState,
                    lockedUntil: lockedUntil,
                    timestamp: nowIso()
                });
            }
            saveData(data);
            auditAuth('LOGIN_ATTEMPT_' + outcome, {
                tenantSlug: principal.tenantSlug,
                userId: principal.userId,
                maskedEmail: principal.maskedEmail,
                outcome: outcome,
                accountState: accountState,
                severity: severityForState(accountState),
                description: 'Authentication attempt recorded.'
            }, context);
            emitMetric('LOGIN_ATTEMPT_' + outcome, { tenantSlug: principal.tenantSlug, status: outcome, severity: severityForState(accountState) });
            if (locked && !context.skipNotification) {
                generateSecurityAlert({
                    email: principal.email,
                    userId: principal.userId,
                    employeeId: principal.employeeId,
                    tenantSlug: principal.tenantSlug,
                    alertType: accountState === ACCOUNT_STATES.SECURITY_REVIEW ? 'SECURITY_REVIEW' : 'ACCOUNT_LOCKOUT',
                    severity: severityForState(accountState),
                    message: accountState === ACCOUNT_STATES.SECURITY_REVIEW ? 'Account requires security review after repeated login failures.' : 'Account temporarily locked after repeated login failures.'
                }, Object.assign({}, context, { skipAuditPersistence: true }));
            }
            return freezeLoginSecurityOutput({
                success: true,
                attempt: attempt,
                outcome: outcome,
                accountState: accountState,
                failedCount: failedCount,
                locked: locked,
                lockedUntil: lockedUntil,
                suspicious: suspicious.suspicious === true,
                findings: suspicious.findings || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    credentialsExposed: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                outcome: OUTCOMES.BLOCKED,
                accountState: ACCOUNT_STATES.SECURITY_REVIEW,
                failures: [safeFailure('LOGIN_ATTEMPT_RECORD_FAILED_SAFE', SEVERITIES.HIGH, 'Login attempt recording failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function unlockAccount(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var role = normalizeRole(context.actor && context.actor.role || context.role || '');
            if (['hr', 'hr_head', 'director', 'super_admin', 'platform_owner'].indexOf(role) === -1) {
                return freezeLoginSecurityOutput({
                    success: false,
                    accountState: ACCOUNT_STATES.LOCKED,
                    failures: [safeFailure('AUTH_UNLOCK_PERMISSION_BLOCKED', SEVERITIES.HIGH, 'This role cannot unlock accounts.', {})],
                    timestamp: nowIso()
                });
            }
            var source = isPlainObject(input) ? input : {};
            var data = ensureAuthData(rawData());
            var principal = resolvePrincipal(source, data, context);
            var scope = tenantOf(context);
            if (role !== 'platform_owner' && scope.tenantSlug && principal.tenantSlug && scope.tenantSlug !== principal.tenantSlug) {
                return freezeLoginSecurityOutput({
                    success: false,
                    accountState: ACCOUNT_STATES.LOCKED,
                    failures: [safeFailure('CROSS_TENANT_AUTH_UNLOCK_BLOCKED', SEVERITIES.CRITICAL, 'Cannot unlock an account outside the active tenant.', {})],
                    timestamp: nowIso()
                });
            }
            var key = stateKey(principal);
            data.loginSecurityState[key] = Object.assign({}, data.loginSecurityState[key] || {}, {
                accountState: ACCOUNT_STATES.ACTIVE,
                locked: false,
                failedCount: 0,
                lockedUntil: '',
                securityReviewRequired: false,
                unlockedAt: nowIso(),
                unlockReason: safeString(source.reason || 'manual_unlock', 'manual_unlock').slice(0, 80)
            });
            data.loginLockoutHistory = appendBounded(data.loginLockoutHistory, {
                lockoutId: 'UNLOCK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                eventType: 'MANUAL_UNLOCK',
                tenantSlug: principal.tenantSlug,
                tenantId: principal.tenantId,
                userId: principal.userId,
                employeeId: principal.employeeId,
                email: principal.email,
                maskedEmail: principal.maskedEmail,
                accountState: ACCOUNT_STATES.ACTIVE,
                actorRole: role,
                reason: safeString(source.reason || 'manual_unlock', 'manual_unlock').slice(0, 80),
                timestamp: nowIso()
            });
            saveData(data);
            auditAuth('ACCOUNT_UNLOCKED', { tenantSlug: principal.tenantSlug, userId: principal.userId, maskedEmail: principal.maskedEmail, severity: 'INFO', description: 'Account lockout cleared.' }, context);
            return freezeLoginSecurityOutput({
                success: true,
                unlocked: true,
                accountState: ACCOUNT_STATES.ACTIVE,
                tenantSlug: principal.tenantSlug,
                userId: principal.userId,
                metadata: { tenantIsolationPreserved: true, authenticationGovernancePreserved: true },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                accountState: ACCOUNT_STATES.LOCKED,
                failures: [safeFailure('ACCOUNT_UNLOCK_FAILED_SAFE', SEVERITIES.HIGH, 'Account unlock failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function calculateLoginRisk(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var data = ensureAuthData(rawData());
            var principal = resolvePrincipal(source, data, context);
            var policy = normalizePolicy(context.policy || source.policy);
            var attempts = recentAttempts(data.loginAttemptHistory, principal, policy, timeMs(source.now || context.now || nowIso()));
            var failures = attempts.filter(function failed(row) { return row.outcome === OUTCOMES.FAILED || row.outcome === OUTCOMES.BLOCKED; }).length;
            var successes = attempts.filter(function success(row) { return row.outcome === OUTCOMES.SUCCESS; }).length;
            var suspicious = attempts.filter(function risky(row) { return row.suspicious === true || row.riskLevel === SEVERITIES.HIGH || row.riskLevel === SEVERITIES.CRITICAL; }).length;
            var state = data.loginSecurityState[stateKey(principal)] || {};
            var lockouts = Number(state.lockoutCount || 0);
            var score = Math.max(0, Math.min(100, 100 - failures * 8 - lockouts * 25 - suspicious * 12 + Math.min(successes * 4, 8)));
            var trust = Math.max(0, Math.min(100, score - (state.accountState === ACCOUNT_STATES.LOCKED ? 20 : state.accountState === ACCOUNT_STATES.SECURITY_REVIEW ? 40 : 0)));
            var level = score < 35 ? SEVERITIES.CRITICAL : score < 60 ? SEVERITIES.HIGH : score < 80 ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeLoginSecurityOutput({
                success: true,
                loginRiskScore: Math.round(score),
                authenticationTrustScore: Math.round(trust),
                riskLevel: level,
                failedCount: failures,
                successCount: successes,
                lockoutCount: lockouts,
                accountState: state.accountState || ACCOUNT_STATES.ACTIVE,
                evidence: { tenantSlug: principal.tenantSlug, maskedEmail: principal.maskedEmail },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                loginRiskScore: 0,
                riskLevel: SEVERITIES.HIGH,
                failures: [safeFailure('LOGIN_RISK_FAILED_SAFE', SEVERITIES.HIGH, 'Login risk calculation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function generateSecurityAlert(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var data = ensureAuthData(rawData());
            var principal = resolvePrincipal(source, data, context);
            var severity = safeString(source.severity || SEVERITIES.WARNING, SEVERITIES.WARNING).toUpperCase();
            var alert = {
                alertId: 'AUTH-ALERT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                alertType: safeString(source.alertType || 'SUSPICIOUS_LOGIN', 'SUSPICIOUS_LOGIN').slice(0, 80),
                tenantSlug: principal.tenantSlug,
                tenantId: principal.tenantId,
                userId: principal.userId,
                employeeId: principal.employeeId,
                email: principal.email,
                maskedEmail: principal.maskedEmail,
                severity: severity,
                message: safeString(source.message || 'Authentication security alert generated.', 'Authentication security alert generated.').slice(0, 240),
                createdAt: nowIso()
            };
            data.authenticationSecurityHistory = appendBounded(data.authenticationSecurityHistory, alert);
            saveData(data);
            var notificationResult = null;
            try {
                if (global.NotificationCenterService && typeof global.NotificationCenterService.createNotification === 'function') {
                    notificationResult = global.NotificationCenterService.createNotification({
                        tenantSlug: principal.tenantSlug,
                        title: alert.alertType.replace(/_/g, ' '),
                        message: alert.message,
                        category: severity === SEVERITIES.CRITICAL ? 'INCIDENT' : 'SYSTEM',
                        priority: severity === SEVERITIES.CRITICAL ? 'CRITICAL' : severity === SEVERITIES.HIGH ? 'HIGH' : 'NORMAL',
                        recipientUserId: principal.userId,
                        targetUserId: principal.userId,
                        targetRole: 'HR',
                        dedupeKey: alert.alertType + '-' + principal.tenantSlug + '-' + (principal.userId || principal.email)
                    }, Object.assign({}, context, { actor: context.actor || { role: 'system', id: SOURCE } }));
                }
            } catch (notificationError) {
                notificationResult = { success: false, message: 'Notification integration failed safely.' };
            }
            auditAuth('AUTH_SECURITY_ALERT_GENERATED', { tenantSlug: principal.tenantSlug, userId: principal.userId, maskedEmail: principal.maskedEmail, severity: severity, description: alert.message }, context);
            return freezeLoginSecurityOutput({
                success: true,
                alert: alert,
                notification: notificationResult,
                metadata: {
                    tenantIsolationPreserved: true,
                    notificationGovernanceIntegrated: !!notificationResult,
                    credentialsExposed: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                failures: [safeFailure('SECURITY_ALERT_FAILED_SAFE', SEVERITIES.HIGH, 'Security alert generation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function summarizeAttempts(attempts, lockouts) {
        var total = attempts.length;
        var successes = attempts.filter(function success(row) { return row.outcome === OUTCOMES.SUCCESS; }).length;
        var failures = attempts.filter(function failure(row) { return row.outcome === OUTCOMES.FAILED || row.outcome === OUTCOMES.BLOCKED; }).length;
        var suspicious = attempts.filter(function suspicious(row) { return row.suspicious === true || row.riskLevel === SEVERITIES.HIGH || row.riskLevel === SEVERITIES.CRITICAL; }).length;
        var lockoutCount = lockouts.length;
        var successRate = total ? Math.round((successes / total) * 100) : 100;
        var failureRate = total ? Math.round((failures / total) * 100) : 0;
        var suspiciousRate = total ? Math.round((suspicious / total) * 100) : 0;
        var authenticationScore = Math.max(0, Math.min(100, 100 - failureRate - suspiciousRate - lockoutCount * 4));
        return {
            totalAttempts: total,
            successfulLogins: successes,
            failedLogins: failures,
            lockouts: lockoutCount,
            suspiciousActivity: suspicious,
            loginSuccessRate: successRate,
            loginFailureRate: failureRate,
            suspiciousActivityRate: suspiciousRate,
            authenticationScore: authenticationScore,
            loginSecurityScore: Math.max(0, Math.min(100, authenticationScore - (lockoutCount ? 8 : 0))),
            workforceSecurityScore: Math.max(0, Math.min(100, Math.round((authenticationScore + successRate) / 2)))
        };
    }

    function publicAttempt(row) {
        return {
            attemptId: row.attemptId,
            tenantSlug: row.tenantSlug,
            tenantId: row.tenantId,
            userId: row.userId,
            employeeId: row.employeeId,
            email: row.email,
            maskedEmail: row.maskedEmail,
            role: row.role,
            outcome: row.outcome,
            accountState: row.accountState,
            failedCount: row.failedCount,
            source: row.source,
            failureReason: row.failureReason,
            device: row.device,
            riskLevel: row.riskLevel,
            suspicious: row.suspicious,
            timestamp: row.timestamp
        };
    }

    function generateAuthenticationSecurityReport(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var data = ensureAuthData(rawData());
            var role = normalizeRole(context.actor && context.actor.role || context.role || '');
            var scope = tenantOf(Object.assign({}, context, source));
            if (!roleCanReview(role) && role !== 'employee' && role !== 'manager') {
                return freezeLoginSecurityOutput({
                    success: false,
                    attempts: [],
                    failures: [safeFailure('AUTH_SECURITY_REPORT_PERMISSION_BLOCKED', SEVERITIES.HIGH, 'This role cannot review authentication security reports.', {})],
                    timestamp: nowIso()
                });
            }
            var attempts = data.loginAttemptHistory.filter(function visible(row) {
                if (scope.tenantSlug && row.tenantSlug && row.tenantSlug !== scope.tenantSlug) return false;
                return canSeeAttempt(row, context);
            }).map(publicAttempt);
            var lockouts = data.loginLockoutHistory.filter(function visibleLockout(row) {
                if (scope.tenantSlug && row.tenantSlug && row.tenantSlug !== scope.tenantSlug) return false;
                if (role === 'platform_owner') return true;
                if (roleCanReview(role)) return row.tenantSlug === scope.tenantSlug;
                return canSeeAttempt(row, context);
            });
            var analytics = summarizeAttempts(attempts, lockouts);
            if (!context.skipAuditPersistence) {
                data.authenticationSecurityHistory = appendBounded(data.authenticationSecurityHistory, {
                    analyticsId: 'AUTH-AN-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                    tenantSlug: scope.tenantSlug,
                    analytics: analytics,
                    actorRole: role,
                    createdAt: nowIso()
                });
                saveData(data);
                auditAuth('AUTH_SECURITY_REPORT_REVIEWED', { tenantSlug: scope.tenantSlug, analytics: analytics, severity: 'INFO', description: 'Authentication security report reviewed.' }, context);
            }
            return freezeLoginSecurityOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                attempts: attempts.slice(-100).reverse(),
                lockouts: lockouts.slice(-100).reverse(),
                analytics: analytics,
                governance: {
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    credentialsExposed: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeLoginSecurityOutput({
                success: false,
                attempts: [],
                analytics: {},
                failures: [safeFailure('AUTH_SECURITY_REPORT_FAILED_SAFE', SEVERITIES.HIGH, 'Authentication security report failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        var originalDb = global.DB;
        var selfData = {
            companySettings: { tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
            users: [{ id: 'SELF-U', email: 'self@example.com', role: 'employee', empId: 'SELF-E', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true }],
            loginAttemptHistory: [],
            loginLockoutHistory: [],
            authenticationSecurityHistory: [],
            notifications: [],
            auditLogs: []
        };
        function record(name, passed, details) {
            checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
        }
        global.DB = {
            get: function get() { return selfData; },
            save: function save(next) { selfData = next || selfData; return selfData; },
            writeAuditLog: function writeAuditLog(actorRole, actorId, actionType, module, targetId, description) {
                selfData.auditLogs = Array.isArray(selfData.auditLogs) ? selfData.auditLogs : [];
                selfData.auditLogs.push({ actorRole: actorRole, actorId: actorId, actionType: actionType, module: module, targetId: targetId, description: description });
            }
        };
        try {
            var ctx = { actor: { role: 'EMPLOYEE', id: 'SELF-U', userId: 'SELF-U', empId: 'SELF-E', email: 'self@example.com' }, tenantSlug: 'tabsons' };
            var failed = null;
            for (var i = 0; i < 5; i += 1) {
                failed = recordLoginAttempt({ email: 'self@example.com', tenantSlug: 'tabsons', outcome: 'FAILED', device: { userAgent: 'Chrome', ipAddress: '10.1.2.3' } }, ctx);
            }
            record('login tracking works', selfData.loginAttemptHistory.length === 5, failed);
            record('lockout works', failed && failed.accountState === ACCOUNT_STATES.LOCKED && failed.locked === true, failed);
            var risk = calculateLoginRisk({ email: 'self@example.com', tenantSlug: 'tabsons' }, ctx);
            record('brute-force protection works', risk.success === true && risk.loginRiskScore < 80, risk);
            unlockAccount({ email: 'self@example.com', tenantSlug: 'tabsons', reason: 'self_test' }, { actor: { role: 'HR', id: 'HR-SELF' }, tenantSlug: 'tabsons' });
            recordLoginAttempt({ email: 'self@example.com', tenantSlug: 'tabsons', outcome: 'SUCCESS', device: { userAgent: 'Chrome', deviceFingerprint: 'DEV-A' } }, ctx);
            var suspicious = detectSuspiciousLogin({ email: 'self@example.com', tenantSlug: 'tabsons', outcome: 'SUCCESS', device: { userAgent: 'Firefox', deviceFingerprint: 'DEV-B' } }, ctx);
            record('suspicious login detection works', suspicious.success === true && suspicious.suspicious === true, suspicious);
            var report = generateAuthenticationSecurityReport({ tenantSlug: 'tabsons' }, { actor: { role: 'HR', id: 'HR-SELF' }, tenantSlug: 'tabsons' });
            record('analytics work', report.success === true && typeof report.analytics.authenticationScore === 'number', report.analytics);
            var immutable = freezeLoginSecurityOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.nested), immutable);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'self-test failed'));
        } finally {
            if (originalDb) global.DB = originalDb;
            else {
                try { delete global.DB; } catch (deleteError) { global.DB = originalDb; }
            }
        }
        return freezeLoginSecurityOutput({ passed: checks.every(function all(item) { return item.passed; }), tests: checks });
    }

    var LoginAttemptSecurityService = Object.freeze({
        ACCOUNT_STATES: ACCOUNT_STATES,
        OUTCOMES: OUTCOMES,
        DEFAULT_POLICY: DEFAULT_POLICY,
        recordLoginAttempt: recordLoginAttempt,
        calculateLoginRisk: calculateLoginRisk,
        applyLockoutPolicy: applyLockoutPolicy,
        detectSuspiciousLogin: detectSuspiciousLogin,
        generateSecurityAlert: generateSecurityAlert,
        generateAuthenticationSecurityReport: generateAuthenticationSecurityReport,
        unlockAccount: unlockAccount,
        freezeLoginSecurityOutput: freezeLoginSecurityOutput
    });

    global.LoginAttemptSecurityService = LoginAttemptSecurityService;
    global.loginAttemptSecurityService = LoginAttemptSecurityService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_LOGIN_SECURITY_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_LOGIN_SECURITY_SELF_TEST__ = freezeLoginSecurityOutput({
                passed: false,
                tests: [{ name: 'self-test initialization failed safely', passed: false, details: error && error.message ? error.message : safeString(error, '') }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
