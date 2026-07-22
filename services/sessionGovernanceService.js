/**
 * sessionGovernanceService.js
 * ARTHHRMS - Session + Access Governance System
 *
 * PURPOSE:
 * Provides centralized enterprise session security and access governance for
 * session lifecycle validation, device visibility, concurrent session risk,
 * suspicious access detection, tenant-safe session isolation, and revocation.
 *
 * This service manages session governance metadata ONLY.
 * It does NOT rewrite authentication flows.
 * It does NOT expose auth secrets.
 * It does NOT expose session data across tenants.
 *
 * ARCHITECTURE RULE:
 * Session governance must remain isolated from tenant business workflows.
 *
 * STABILITY:
 * Existing auth flows and compatible session storage remain supported.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.TenantIsolationService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachSessionGovernanceService(global) {
    'use strict';

    var PREFIX = '[SessionGovernanceService]';
    var DEFAULT_SOURCE = 'sessionGovernanceService';
    var MAX_SESSIONS = 500;

    var SESSION_STATES = Object.freeze({
        LOGIN: 'LOGIN',
        SESSION_CREATED: 'SESSION_CREATED',
        ACTIVE: 'ACTIVE',
        IDLE: 'IDLE',
        EXPIRED: 'EXPIRED',
        TERMINATED: 'TERMINATED',
        SUSPICIOUS: 'SUSPICIOUS',
        REVOKED: 'REVOKED',
        FORCED_LOGOUT: 'FORCED_LOGOUT'
    });

    var RISK_LEVELS = Object.freeze({
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var DEFAULT_POLICY = Object.freeze({
        idleTimeoutMinutes: 30,
        absoluteLifetimeHours: 12,
        maxConcurrentSessions: 3,
        suspiciousDeviceSwitchMinutes: 10,
        impossibleTravelMinutes: 120
    });

    var SECRET_KEY_PATTERN = /(password|secret|token|jwt|access[_-]?token|refresh[_-]?token|service[_-]?role|private[_-]?key|authorization)/i;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        try {
            return global.DB || null;
        } catch (error) {
            return null;
        }
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
            safeWarn('Session governance persistence failed safely.', { error: error && error.message });
        }
        return false;
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
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

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 4) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, 100).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (SECRET_KEY_PATTERN.test(key)) return;
                output[key] = cloneValue(value[key], currentDepth + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function freezeSessionOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return deepFreeze(list.slice(0, MAX_SESSIONS).map(function freezeItem(item) {
            return isPlainObject(item) ? cloneValue(item, 0) : item;
        }));
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, 0) : {};
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
        try {
            if (global.TenantProvisioningService && typeof global.TenantProvisioningService.normalizeTenantSlug === 'function') {
                return global.TenantProvisioningService.normalizeTenantSlug(value);
            }
        } catch (error) {}
        var slug = safeString(value, '').trim().toLowerCase();
        slug = slug.replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function tenantSlugFromId(value) {
        var token = safeString(value, '').trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (!token) return '';
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function tenantOf(input) {
        var source = isPlainObject(input) ? input : {};
        var metadata = isPlainObject(source.metadata) ? source.metadata : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.companySlug || source.company_slug || metadata.tenantSlug || metadata.tenant_slug || '');
        var tenantId = safeString(source.tenantId || source.tenant_id || source.companyId || source.company_id || source.organizationId || source.orgId || metadata.tenantId || metadata.companyId || '', '').trim();
        if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
        return {
            tenantSlug: tenantSlug,
            tenantId: tenantId
        };
    }

    function normalizeSessionState(value, fallback) {
        var normalized = safeString(value || fallback || SESSION_STATES.ACTIVE, SESSION_STATES.ACTIVE).trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (SESSION_STATES[normalized]) return SESSION_STATES[normalized];
        return fallback || SESSION_STATES.ACTIVE;
    }

    function normalizePolicy(input) {
        var source = isPlainObject(input) ? input : {};
        var policy = Object.assign({}, DEFAULT_POLICY, source);
        policy.idleTimeoutMinutes = Math.max(1, Number(policy.idleTimeoutMinutes || policy.inactivityTimeoutMinutes || DEFAULT_POLICY.idleTimeoutMinutes) || DEFAULT_POLICY.idleTimeoutMinutes);
        policy.inactivityTimeoutMinutes = policy.idleTimeoutMinutes;
        policy.absoluteLifetimeHours = Math.max(1, Number(policy.absoluteLifetimeHours || policy.absoluteSessionHours || DEFAULT_POLICY.absoluteLifetimeHours) || DEFAULT_POLICY.absoluteLifetimeHours);
        policy.absoluteSessionHours = policy.absoluteLifetimeHours;
        policy.rememberMeDays = Math.max(1, Number(policy.rememberMeDays || 14) || 14);
        policy.maxConcurrentSessions = Math.max(1, Number(policy.maxConcurrentSessions || DEFAULT_POLICY.maxConcurrentSessions) || DEFAULT_POLICY.maxConcurrentSessions);
        policy.suspiciousDeviceSwitchMinutes = Math.max(1, Number(policy.suspiciousDeviceSwitchMinutes || DEFAULT_POLICY.suspiciousDeviceSwitchMinutes) || DEFAULT_POLICY.suspiciousDeviceSwitchMinutes);
        policy.impossibleTravelMinutes = Math.max(1, Number(policy.impossibleTravelMinutes || DEFAULT_POLICY.impossibleTravelMinutes) || DEFAULT_POLICY.impossibleTravelMinutes);
        return policy;
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

    function hashToken(value) {
        var text = safeString(value, '');
        var hash = 0;
        for (var index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash).toString(36).toUpperCase();
    }

    function coarseIp(value) {
        var ip = safeString(value, '').trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            var parts = ip.split('.');
            return parts[0] + '.' + parts[1] + '.x.x';
        }
        return '';
    }

    function normalizeDeviceMetadata(input) {
        try {
            var source = isPlainObject(input) ? input : {};
            var nav = global.navigator || {};
            var userAgent = safeString(source.userAgent || source.ua || nav.userAgent || '', '');
            var platform = safeString(source.platform || nav.platform || '', '');
            var browser = safeString(source.browser || browserFromUserAgent(userAgent), 'Unknown');
            var os = safeString(source.os || source.operatingSystem || osFromUserAgent(userAgent, platform), 'Unknown');
            var sourceName = safeString(source.sessionSource || source.source || 'browser', 'browser');
            var geo = isPlainObject(source.geo) ? source.geo : {};
            var timezone = safeString(source.timezone || geo.timezone || (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '', '');
            var country = safeString(source.country || geo.country || '', '').slice(0, 32);
            var region = safeString(source.region || geo.region || '', '').slice(0, 32);
            var suppliedFingerprint = safeString(source.deviceFingerprint || source.fingerprint || '', '');
            var fingerprintSeed = suppliedFingerprint || [browser, os, platform, sourceName, timezone].join('|');
            var normalizedFingerprint = /^DEV-/i.test(suppliedFingerprint) ? suppliedFingerprint : 'DEV-' + hashToken(fingerprintSeed);

            return freezeSessionOutput({
                deviceFingerprint: normalizedFingerprint,
                browser: browser,
                os: os,
                deviceClass: /mobile|android|iphone|ipad/i.test(userAgent) ? 'mobile' : 'desktop',
                loginSurface: sourceName,
                approximateGeo: {
                    country: country,
                    region: region,
                    timezone: timezone
                },
                ipRange: coarseIp(source.ipRange || source.ipAddress || source.ip || ''),
                capturedAt: safeString(source.capturedAt || nowIso(), nowIso())
            });
        } catch (error) {
            return freezeSessionOutput({
                deviceFingerprint: 'DEV-UNKNOWN',
                browser: 'Unknown',
                os: 'Unknown',
                deviceClass: 'unknown',
                loginSurface: 'unknown',
                approximateGeo: { country: '', region: '', timezone: '' },
                ipRange: '',
                capturedAt: nowIso()
            });
        }
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'SESSION_GOVERNANCE_FAILURE'),
            severity: safeString(severity || RISK_LEVELS.HIGH, RISK_LEVELS.HIGH).toUpperCase(),
            message: safeString(message, 'Session governance failure.'),
            metadata: freezeSessionOutput(safeMetadata(metadata || {}))
        });
    }

    function safeFinding(code, severity, message, metadata) {
        return Object.freeze({
            findingCode: safeString(code, 'SESSION_GOVERNANCE_FINDING'),
            severity: safeString(severity || RISK_LEVELS.MEDIUM, RISK_LEVELS.MEDIUM).toUpperCase(),
            message: safeString(message, 'Session governance finding.'),
            metadata: freezeSessionOutput(safeMetadata(metadata || {}))
        });
    }

    function safeWarning(code, message, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'SESSION_GOVERNANCE_WARNING'),
            severity: 'WARNING',
            message: safeString(message, 'Session governance warning.'),
            metadata: freezeSessionOutput(safeMetadata(metadata || {}))
        });
    }

    function generateSessionId() {
        return 'SES-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function getSessionStore() {
        var data = rawData();
        var governance = isPlainObject(data.sessionGovernance) ? data.sessionGovernance : {};
        return {
            data: data,
            governance: governance,
            sessions: Array.isArray(governance.sessions) ? governance.sessions.slice() : [],
            policies: isPlainObject(governance.policies) ? governance.policies : {}
        };
    }

    function saveSessionStore(store, sessions) {
        var data = store && store.data || rawData();
        var governance = Object.assign({}, isPlainObject(data.sessionGovernance) ? data.sessionGovernance : {});
        governance.sessions = sessions.slice(-MAX_SESSIONS).map(function cloneSession(session) {
            return cloneValue(session, 0);
        });
        data.sessionGovernance = governance;
        return saveData(data);
    }

    function withDataArray(data, key) {
        if (!Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function appendImmutableHistory(key, row) {
        try {
            var data = rawData();
            var rows = withDataArray(data, key);
            rows.unshift(Object.assign({}, cloneValue(row || {}, 0), {
                immutable: true,
                recordedAt: nowIso()
            }));
            if (rows.length > MAX_SESSIONS) data[key] = rows.slice(0, MAX_SESSIONS);
            saveData(data);
            return true;
        } catch (error) {
            safeWarn('Session history persistence failed safely.', { key: key, error: error && error.message });
            return false;
        }
    }

    function actorFromContext(contextInput) {
        var context = isPlainObject(contextInput) ? contextInput : {};
        var actor = isPlainObject(context.actor) ? context.actor : {};
        return {
            id: safeString(actor.id || actor.userId || context.userId || '', ''),
            userId: safeString(actor.userId || actor.id || context.userId || '', ''),
            empId: safeString(actor.empId || actor.employeeId || context.empId || context.employeeId || '', ''),
            email: safeString(actor.email || context.email || '', '').toLowerCase(),
            role: normalizeRole(actor.role || context.role || ''),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || context.tenantSlug || ''),
            tenantId: safeString(actor.tenantId || context.tenantId || '', '')
        };
    }

    function sameTenantSlug(a, b) {
        var left = normalizeTenantSlug(a || '');
        var right = normalizeTenantSlug(b || '');
        return !!left && !!right && left === right;
    }

    function sessionOwnerMatches(session, actor) {
        if (!session || !actor) return false;
        return (!!actor.userId && safeString(session.userId, '') === actor.userId) ||
            (!!actor.id && safeString(session.userId, '') === actor.id) ||
            (!!actor.empId && safeString(session.employeeId, '') === actor.empId) ||
            (!!actor.email && safeString(session.metadata && session.metadata.email || '', '').toLowerCase() === actor.email);
    }

    function roleCanReviewTenantSessions(role) {
        var normalized = normalizeRole(role);
        return ['hr', 'hr_head', 'director', 'super_admin', 'platform_owner'].indexOf(normalized) >= 0;
    }

    function roleCanMutateSession(session, contextInput, userId) {
        var actor = actorFromContext(contextInput);
        var role = actor.role;
        if (role === 'platform_owner' || role === 'super_admin') return true;
        if (role === 'employee') {
            if (userId && actor.userId && userId === actor.userId) return true;
            return sessionOwnerMatches(session, actor);
        }
        return false;
    }

    function auditAndHistory(eventType, session, context, extra) {
        var payload = Object.assign({
            historyId: 'SH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
            eventType: eventType,
            sessionId: session && session.sessionId || '',
            userId: session && session.userId || '',
            employeeId: session && session.employeeId || '',
            tenantSlug: session && session.tenantSlug || context && context.tenantSlug || '',
            state: session && session.state || '',
            createdAt: nowIso()
        }, safeMetadata(extra || {}));
        appendImmutableHistory('sessionHistory', payload);
        auditSession(eventType, payload, context || {});
        return payload;
    }

    function persistDeviceHistory(session, context, trustScore) {
        var device = session && session.device || {};
        var row = {
            deviceHistoryId: 'DH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
            eventType: 'DEVICE_REGISTERED',
            trustedDeviceId: device.deviceFingerprint || '',
            sessionId: session && session.sessionId || '',
            userId: session && session.userId || '',
            employeeId: session && session.employeeId || '',
            tenantSlug: session && session.tenantSlug || '',
            browser: device.browser || 'Unknown',
            os: device.os || 'Unknown',
            deviceClass: device.deviceClass || 'unknown',
            loginSurface: device.loginSurface || 'browser',
            approximateGeo: device.approximateGeo || {},
            ipRange: device.ipRange || '',
            trustScore: Number(trustScore || 0),
            createdAt: nowIso()
        };
        appendImmutableHistory('deviceHistory', row);
        auditSession('DEVICE_REGISTERED', row, context || {});
        return row;
    }

    function normalizeSession(input, context) {
        var source = isPlainObject(input) ? input : {};
        var ctx = isPlainObject(context) ? context : {};
        var tenant = tenantOf(Object.assign({}, ctx, source));
        var policy = normalizePolicy(ctx.policy || source.policy);
        var loginAt = safeString(source.loginAt || source.login_at || ctx.loginAt || nowIso(), nowIso());
        var expiresAt = safeString(source.expiresAt || source.expires_at || new Date(timeMs(loginAt) + policy.absoluteLifetimeHours * 60 * 60 * 1000).toISOString(), '');
        return freezeSessionOutput({
            sessionId: safeString(source.sessionId || source.session_id || generateSessionId(), ''),
            userId: safeString(source.userId || source.user_id || source.id || source.authUserId || ctx.userId || '', ''),
            employeeId: safeString(source.employeeId || source.empId || source.emp_id || ctx.employeeId || ctx.empId || '', ''),
            role: normalizeRole(source.role || ctx.role || ''),
            tenantSlug: tenant.tenantSlug,
            tenantId: tenant.tenantId,
            state: normalizeSessionState(source.state || source.sessionState, SESSION_STATES.ACTIVE),
            loginAt: loginAt,
            lastActivityAt: safeString(source.lastActivityAt || source.last_activity_at || ctx.lastActivityAt || loginAt, loginAt),
            expiresAt: expiresAt,
            source: safeString(source.source || source.sessionSource || ctx.source || 'auth', 'auth'),
            device: normalizeDeviceMetadata(source.device || source.deviceMetadata || ctx.device || {}),
            metadata: freezeSessionOutput(safeMetadata(source.metadata || {}))
        });
    }

    function findStoredSession(sessionInput, store) {
        var source = isPlainObject(sessionInput) ? sessionInput : {};
        var sessionId = safeString(source.sessionId || source.session_id || sessionInput, '').trim();
        var sessions = store && store.sessions || getSessionStore().sessions;
        if (sessionId) {
            var found = sessions.find(function findById(row) {
                return safeString(row && (row.sessionId || row.session_id), '') === sessionId;
            });
            if (found) return normalizeSession(found);
        }
        if (isPlainObject(sessionInput)) return normalizeSession(sessionInput);
        return null;
    }

    function sessionExpired(session, policy, nowValue) {
        var nowMs = timeMs(nowValue || nowIso());
        if (session.state === SESSION_STATES.EXPIRED || session.state === SESSION_STATES.REVOKED || session.state === SESSION_STATES.TERMINATED) return true;
        if (session.expiresAt && timeMs(session.expiresAt) <= nowMs) return true;
        if (session.lastActivityAt && timeMs(session.lastActivityAt) + policy.idleTimeoutMinutes * 60 * 1000 <= nowMs) return true;
        return false;
    }

    function sessionsForUser(userId, sessions) {
        var id = safeString(userId, '');
        return (sessions || []).filter(function sameUser(session) {
            return safeString(session && session.userId, '') === id && normalizeSessionState(session.state) === SESSION_STATES.ACTIVE;
        });
    }

    function riskFromFindings(findings) {
        if (findings.some(function hasCritical(item) { return item.severity === RISK_LEVELS.CRITICAL; })) return RISK_LEVELS.CRITICAL;
        if (findings.some(function hasHigh(item) { return item.severity === RISK_LEVELS.HIGH; })) return RISK_LEVELS.HIGH;
        if (findings.some(function hasMedium(item) { return item.severity === RISK_LEVELS.MEDIUM; })) return RISK_LEVELS.MEDIUM;
        return RISK_LEVELS.LOW;
    }

    function detectSuspiciousAccess(attemptInput, contextInput) {
        try {
            var attempt = isPlainObject(attemptInput) ? cloneValue(attemptInput, 0) : {};
            var context = isPlainObject(contextInput) ? contextInput : {};
            var scope = tenantOf(context);
            var attemptTenant = tenantOf(attempt);
            var policy = normalizePolicy(context.policy || attempt.policy);
            var store = getSessionStore();
            var findings = [];
            var warnings = [];
            var session = normalizeSession(attempt, context);
            var activeSessions = sessionsForUser(session.userId, store.sessions);
            var activeDevices = {};

            activeSessions.forEach(function markDevice(row) {
                var normalized = normalizeSession(row);
                if (normalized.device && normalized.device.deviceFingerprint) activeDevices[normalized.device.deviceFingerprint] = true;
            });

            if (scope.tenantSlug && attemptTenant.tenantSlug && scope.tenantSlug !== attemptTenant.tenantSlug) {
                findings.push(safeFinding('SUSPICIOUS_TENANT_MISMATCH', RISK_LEVELS.CRITICAL, 'Session tenant does not match the active access scope.', {
                    expectedTenantSlug: scope.tenantSlug,
                    sessionTenantSlug: attemptTenant.tenantSlug
                }));
            }

            if (normalizeRole(attempt.role) === 'platform_owner' && scope.tenantSlug && context.routeType === 'tenant') {
                findings.push(safeFinding('PLATFORM_OWNER_TENANT_ACCESS_ATTEMPT', RISK_LEVELS.CRITICAL, 'PLATFORM_OWNER session attempted tenant route access.', {
                    tenantSlug: scope.tenantSlug
                }));
            }

            if (activeSessions.length >= policy.maxConcurrentSessions) {
                findings.push(safeFinding('CONCURRENT_SESSION_LIMIT_EXCEEDED', RISK_LEVELS.HIGH, 'Concurrent active session limit was exceeded.', {
                    userId: session.userId,
                    activeSessions: activeSessions.length,
                    maxConcurrentSessions: policy.maxConcurrentSessions
                }));
            }

            if (Object.keys(activeDevices).length >= policy.maxConcurrentSessions) {
                findings.push(safeFinding('MULTIPLE_ACTIVE_DEVICES', RISK_LEVELS.HIGH, 'Multiple active devices detected for the same user.', {
                    userId: session.userId,
                    activeDeviceCount: Object.keys(activeDevices).length
                }));
            }

            if (attempt.failedAttempts && Number(attempt.failedAttempts) >= 5) {
                findings.push(safeFinding('REPEATED_FAILED_ACCESS', RISK_LEVELS.HIGH, 'Repeated failed access attempts detected.', {
                    failedAttempts: Number(attempt.failedAttempts)
                }));
            }

            if (!isPlainObject(attemptInput)) {
                findings.push(safeFinding('MALFORMED_SESSION_PAYLOAD', RISK_LEVELS.HIGH, 'Malformed session payload was handled safely.', {}));
            }

            var riskLevel = riskFromFindings(findings);
            var result = freezeSessionOutput({
                success: true,
                suspicious: findings.length > 0,
                riskLevel: riskLevel,
                findings: freezeList(findings),
                warnings: freezeList(warnings),
                metadata: {
                    activeSessions: activeSessions.length,
                    activeDevices: Object.keys(activeDevices).length,
                    tenantSlug: scope.tenantSlug || attemptTenant.tenantSlug,
                    rawPersonalFingerprintStored: false
                },
                timestamp: nowIso()
            });

            if (result.suspicious) {
                emitTelemetry('SUSPICIOUS_ACCESS_DETECTED', {
                    riskLevel: result.riskLevel,
                    findingCount: result.findings.length,
                    tenantSlug: result.metadata.tenantSlug
                }, result.riskLevel === RISK_LEVELS.CRITICAL ? 'CRITICAL' : 'WARNING');
                auditSession('SUSPICIOUS_ACCESS_DETECTED', {
                    riskLevel: result.riskLevel,
                    findingCount: result.findings.length,
                    tenantSlug: result.metadata.tenantSlug
                }, context);
            }

            return result;
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                suspicious: true,
                riskLevel: RISK_LEVELS.HIGH,
                findings: [safeFinding('SUSPICIOUS_ACCESS_FAILED_SAFE', RISK_LEVELS.HIGH, 'Suspicious access detection failed safely.', {})],
                warnings: [],
                metadata: {},
                timestamp: nowIso()
            });
        }
    }

    function validateSessionScope(sessionInput, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var store = getSessionStore();
            var session = findStoredSession(sessionInput, store);
            var scope = tenantOf(context);
            var policy = normalizePolicy(context.policy || store.policies.default);
            var failures = [];
            var warnings = [];
            var allowed = true;

            if (!session || !session.sessionId) {
                failures.push(safeFailure('MALFORMED_SESSION_PAYLOAD', RISK_LEVELS.HIGH, 'Session payload is missing or malformed.', {}));
                allowed = false;
            } else {
                if (session.state === SESSION_STATES.REVOKED) {
                    failures.push(safeFailure('SESSION_REVOKED', RISK_LEVELS.HIGH, 'Session has been revoked.', { sessionId: session.sessionId }));
                    allowed = false;
                }

                if (session.state === SESSION_STATES.TERMINATED) {
                    failures.push(safeFailure('SESSION_TERMINATED', RISK_LEVELS.HIGH, 'Session has been terminated.', { sessionId: session.sessionId }));
                    allowed = false;
                }

                if (sessionExpired(session, policy, context.now)) {
                    failures.push(safeFailure('SESSION_EXPIRED', RISK_LEVELS.HIGH, 'Session has expired or exceeded idle timeout.', { sessionId: session.sessionId }));
                    allowed = false;
                    markSessionState(session.sessionId, SESSION_STATES.EXPIRED, { reason: 'expiry_validation' });
                }

                if (scope.tenantSlug && session.tenantSlug && scope.tenantSlug !== session.tenantSlug) {
                    failures.push(safeFailure('CROSS_TENANT_SESSION_SCOPE', RISK_LEVELS.CRITICAL, 'Session tenant does not match the requested tenant scope.', {
                        sessionId: session.sessionId,
                        expectedTenantSlug: scope.tenantSlug,
                        sessionTenantSlug: session.tenantSlug
                    }));
                    allowed = false;
                }

                if (scope.tenantId && session.tenantId && scope.tenantId !== session.tenantId) {
                    failures.push(safeFailure('CROSS_TENANT_SESSION_ID_SCOPE', RISK_LEVELS.CRITICAL, 'Session tenant identifier does not match the requested tenant scope.', {
                        sessionId: session.sessionId
                    }));
                    allowed = false;
                }

                if (session.role === 'platform_owner' && context.routeType === 'tenant') {
                    failures.push(safeFailure('PLATFORM_OWNER_TENANT_SESSION_BLOCKED', RISK_LEVELS.CRITICAL, 'PLATFORM_OWNER sessions must use isolated platform governance routes.', {
                        sessionId: session.sessionId
                    }));
                    allowed = false;
                }
            }

            return freezeSessionOutput({
                success: true,
                allowed: allowed && failures.length === 0,
                state: session && session.state || SESSION_STATES.EXPIRED,
                riskLevel: failures.some(function hasCritical(item) { return item.severity === RISK_LEVELS.CRITICAL; }) ? RISK_LEVELS.CRITICAL : failures.length ? RISK_LEVELS.HIGH : RISK_LEVELS.LOW,
                failures: freezeList(failures),
                warnings: freezeList(warnings),
                session: session ? publicSession(session) : null,
                metadata: {
                    tenantIsolationPreserved: failures.every(function noCrossTenant(item) {
                        return item.failureCode.indexOf('CROSS_TENANT') !== 0;
                    }),
                    secretsExposed: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                allowed: false,
                state: SESSION_STATES.EXPIRED,
                riskLevel: RISK_LEVELS.HIGH,
                failures: [safeFailure('SESSION_SCOPE_VALIDATION_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session scope validation failed safely.', {})],
                warnings: [],
                session: null,
                metadata: { secretsExposed: false },
                timestamp: nowIso()
            });
        }
    }

    function publicSession(sessionInput) {
        var session = normalizeSession(sessionInput);
        return freezeSessionOutput({
            sessionId: session.sessionId,
            userId: session.userId,
            employeeId: session.employeeId,
            role: session.role,
            tenantSlug: session.tenantSlug,
            tenantId: session.tenantId,
            state: session.state,
            loginAt: session.loginAt,
            lastActivityAt: session.lastActivityAt,
            expiresAt: session.expiresAt,
            source: session.source,
            device: session.device,
            metadata: safeMetadata(session.metadata || {})
        });
    }

    function markSessionState(sessionId, state, metadata) {
        var store = getSessionStore();
        var targetId = safeString(sessionId, '');
        var changed = false;
        var nextSessions = store.sessions.map(function updateSession(row) {
            if (safeString(row && row.sessionId, '') !== targetId) return row;
            changed = true;
            return Object.assign({}, row, {
                state: normalizeSessionState(state),
                updatedAt: nowIso(),
                metadata: Object.assign({}, isPlainObject(row.metadata) ? row.metadata : {}, safeMetadata(metadata || {}))
            });
        });
        if (changed) saveSessionStore(store, nextSessions);
        return changed;
    }

    function recordSessionStart(userInput, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var session = normalizeSession(userInput, context);
            var risk = detectSuspiciousAccess(session, context);
            var nextSession = Object.assign({}, cloneValue(session, 0), {
                state: risk.suspicious ? SESSION_STATES.SUSPICIOUS : SESSION_STATES.ACTIVE,
                riskLevel: risk.riskLevel,
                riskFindings: (risk.findings || []).map(function findingCode(item) { return item.findingCode; })
            });
            var store = getSessionStore();
            var sessions = store.sessions.filter(function removeDuplicate(row) {
                return safeString(row && row.sessionId, '') !== nextSession.sessionId;
            });
            sessions.push(nextSession);
            saveSessionStore(store, sessions);
            emitTelemetry('SESSION_GOVERNANCE_RECORDED', {
                sessionId: nextSession.sessionId,
                role: nextSession.role,
                tenantSlug: nextSession.tenantSlug,
                riskLevel: nextSession.riskLevel
            }, nextSession.riskLevel === RISK_LEVELS.CRITICAL ? 'CRITICAL' : nextSession.riskLevel === RISK_LEVELS.HIGH ? 'WARNING' : 'INFO');
            auditSession('SESSION_STARTED', {
                sessionId: nextSession.sessionId,
                role: nextSession.role,
                tenantSlug: nextSession.tenantSlug,
                riskLevel: nextSession.riskLevel
            }, context);
            recordMetric('SESSION_GOVERNANCE_RECORDED', {
                status: nextSession.state,
                severity: nextSession.riskLevel === RISK_LEVELS.CRITICAL ? 'CRITICAL' : nextSession.riskLevel === RISK_LEVELS.HIGH ? 'ERROR' : 'INFO',
                tenantSlug: nextSession.tenantSlug
            });
            return freezeSessionOutput({
                success: true,
                recorded: true,
                session: publicSession(nextSession),
                risk: risk,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                recorded: false,
                session: null,
                risk: { suspicious: true, riskLevel: RISK_LEVELS.HIGH },
                failures: [safeFailure('SESSION_RECORD_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session start recording failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function createSession(sessionInput, contextInput) {
        try {
            if (!isPlainObject(sessionInput)) {
                return freezeSessionOutput({
                    success: false,
                    state: SESSION_STATES.TERMINATED,
                    failures: [safeFailure('MALFORMED_SESSION_PAYLOAD', RISK_LEVELS.HIGH, 'Session payload is missing or malformed.', {})],
                    governance: { tenantIsolationPreserved: true, sessionGovernancePreserved: true },
                    timestamp: nowIso()
                });
            }
            var context = isPlainObject(contextInput) ? contextInput : {};
            var policy = normalizePolicy(context.policy || sessionInput.policy);
            var loginAt = safeString(sessionInput.loginAt || nowIso(), nowIso());
            var lifetimeMs = sessionInput.rememberMe ? policy.rememberMeDays * 24 * 60 * 60 * 1000 : policy.absoluteLifetimeHours * 60 * 60 * 1000;
            var normalized = normalizeSession(Object.assign({}, sessionInput, {
                state: SESSION_STATES.ACTIVE,
                loginAt: loginAt,
                lastActivityAt: sessionInput.lastActivityAt || loginAt,
                expiresAt: sessionInput.expiresAt || new Date(timeMs(loginAt) + lifetimeMs).toISOString()
            }), context);
            var created = recordSessionStart(normalized, context);
            if (!created.success) return created;
            var session = created.session;
            var trust = calculateDeviceTrust({
                tenantSlug: session.tenantSlug,
                userId: session.userId,
                employeeId: session.employeeId,
                device: session.device
            }, context);
            auditAndHistory('SESSION_CREATED', session, context, {
                lifecycle: ['LOGIN', 'SESSION_CREATED', 'ACTIVE', 'IDLE', 'EXPIRED', 'TERMINATED'],
                riskLevel: created.risk && created.risk.riskLevel || RISK_LEVELS.LOW
            });
            var deviceRow = persistDeviceHistory(session, context, trust.deviceTrustScore);
            return freezeSessionOutput({
                success: true,
                state: session.state,
                session: session,
                device: {
                    trustedDeviceId: deviceRow.trustedDeviceId,
                    trusted: trust.trusted,
                    deviceTrustScore: trust.deviceTrustScore
                },
                risk: created.risk,
                policy: {
                    inactivityTimeoutMinutes: policy.inactivityTimeoutMinutes,
                    absoluteSessionHours: policy.absoluteSessionHours,
                    rememberMeDays: policy.rememberMeDays,
                    maxConcurrentSessions: policy.maxConcurrentSessions
                },
                governance: {
                    tenantIsolationPreserved: true,
                    sessionGovernancePreserved: true,
                    rawSecretsExposed: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                state: SESSION_STATES.TERMINATED,
                failures: [safeFailure('SESSION_CREATE_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session creation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function expireSession(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : { sessionId: input };
            var store = getSessionStore();
            var session = findStoredSession(source, store);
            if (!session || !session.sessionId) {
                return freezeSessionOutput({
                    success: false,
                    state: SESSION_STATES.EXPIRED,
                    failures: [safeFailure('SESSION_NOT_FOUND', RISK_LEVELS.HIGH, 'Session was not found for expiry.', {})],
                    timestamp: nowIso()
                });
            }
            var scope = tenantOf(Object.assign({}, context, source));
            if (scope.tenantSlug && session.tenantSlug && scope.tenantSlug !== session.tenantSlug) {
                return freezeSessionOutput({
                    success: false,
                    state: session.state,
                    failures: [safeFailure('CROSS_TENANT_SESSION_SCOPE', RISK_LEVELS.CRITICAL, 'Cannot expire a session outside the active tenant scope.', {})],
                    timestamp: nowIso()
                });
            }
            var changed = markSessionState(session.sessionId, SESSION_STATES.EXPIRED, {
                expiredAt: nowIso(),
                reason: source.reason || 'expiry_policy'
            });
            var expired = Object.assign({}, cloneValue(session, 0), { state: SESSION_STATES.EXPIRED, expiredAt: nowIso() });
            if (changed) {
                auditAndHistory('SESSION_EXPIRED', expired, context, { reason: source.reason || 'expiry_policy' });
                emitTelemetry('SESSION_EXPIRED', { sessionId: session.sessionId, tenantSlug: session.tenantSlug }, 'WARNING');
                recordMetric('SESSION_EXPIRED', { status: 'EXPIRED', severity: 'WARNING', tenantSlug: session.tenantSlug });
            }
            return freezeSessionOutput({
                success: true,
                expired: changed,
                state: SESSION_STATES.EXPIRED,
                session: publicSession(expired),
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                state: SESSION_STATES.EXPIRED,
                failures: [safeFailure('SESSION_EXPIRY_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session expiry failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function calculateDeviceTrust(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var scope = tenantOf(Object.assign({}, context, source));
            var device = normalizeDeviceMetadata(source.device || source.deviceMetadata || source);
            var data = rawData();
            var history = (data.deviceHistory || []).filter(function sameDeviceTenant(row) {
                return (!scope.tenantSlug || sameTenantSlug(row.tenantSlug, scope.tenantSlug)) &&
                    (!source.userId || safeString(row.userId, '') === safeString(source.userId, ''));
            });
            var knownDevice = history.some(function known(row) {
                return safeString(row.trustedDeviceId || row.deviceFingerprint, '') === device.deviceFingerprint;
            });
            var sameBrowser = history.some(function knownBrowser(row) {
                return safeString(row.browser, '') === device.browser && safeString(row.os, '') === device.os;
            });
            var score = 45;
            if (knownDevice) score += 35;
            if (sameBrowser) score += 10;
            if (device.ipRange) score += 5;
            if (device.approximateGeo && device.approximateGeo.country) score += 5;
            if (history.length > 8 && !knownDevice) score -= 10;
            score = Math.max(0, Math.min(100, Math.round(score)));
            return freezeSessionOutput({
                success: true,
                trusted: score >= 70,
                deviceTrustScore: score,
                trustedDeviceId: device.deviceFingerprint,
                device: device,
                recentDeviceHistory: freezeList(history.slice(0, 12).map(function deviceRow(row) {
                    return {
                        trustedDeviceId: row.trustedDeviceId || row.deviceFingerprint || '',
                        browser: row.browser || 'Unknown',
                        os: row.os || 'Unknown',
                        deviceClass: row.deviceClass || 'unknown',
                        trustScore: Number(row.trustScore || 0),
                        createdAt: row.createdAt || row.recordedAt || ''
                    };
                })),
                metadata: { rawSecretsExposed: false, tenantIsolationPreserved: true },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                trusted: false,
                deviceTrustScore: 0,
                failures: [safeFailure('DEVICE_TRUST_FAILED_SAFE', RISK_LEVELS.HIGH, 'Device trust calculation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function calculateSessionRisk(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var store = getSessionStore();
            var session = findStoredSession(source, store) || normalizeSession(source, context);
            var suspicious = detectSuspiciousAccess(Object.assign({}, cloneValue(session, 0), source), context);
            var activeSessions = sessionsForUser(session.userId || source.userId, store.sessions).filter(function sameTenantActive(row) {
                return !session.tenantSlug || normalizeTenantSlug(row.tenantSlug) === session.tenantSlug;
            });
            var deviceTrust = calculateDeviceTrust({ tenantSlug: session.tenantSlug, userId: session.userId || source.userId, device: source.device || session.device }, context);
            var alerts = (suspicious.findings || []).map(function mapFinding(item) {
                return {
                    alertCode: item.findingCode,
                    severity: item.severity,
                    message: item.message
                };
            });
            if (activeSessions.length > normalizePolicy(context.policy || source.policy).maxConcurrentSessions) {
                alerts.push({ alertCode: 'EXCESSIVE_SESSION_CREATION', severity: RISK_LEVELS.HIGH, message: 'Active session count exceeds policy.' });
            }
            var penalty = alerts.reduce(function sum(total, item) {
                return total + (item.severity === RISK_LEVELS.CRITICAL ? 35 : item.severity === RISK_LEVELS.HIGH ? 20 : 8);
            }, 0);
            var trustPenalty = Math.max(0, 70 - (deviceTrust.deviceTrustScore || 0));
            var riskScore = Math.max(0, Math.min(100, Math.round(100 - penalty - trustPenalty)));
            return freezeSessionOutput({
                success: true,
                suspicious: alerts.length > 0,
                riskLevel: suspicious.riskLevel || (alerts.length ? RISK_LEVELS.HIGH : RISK_LEVELS.LOW),
                sessionRiskScore: riskScore,
                deviceTrustScore: deviceTrust.deviceTrustScore || 0,
                securityAlerts: freezeList(alerts),
                activeSessionCount: activeSessions.length,
                metadata: { tenantIsolationPreserved: true, rawSecretsExposed: false },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                suspicious: true,
                riskLevel: RISK_LEVELS.HIGH,
                sessionRiskScore: 0,
                securityAlerts: [safeFinding('SESSION_RISK_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session risk calculation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function revokeSession(sessionId, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var store = getSessionStore();
            var targetSession = findStoredSession(sessionId, store);
            if (targetSession && !roleCanMutateSession(targetSession, context, targetSession.userId)) {
                return freezeSessionOutput({
                    success: false,
                    revoked: false,
                    sessionId: safeString(sessionId, ''),
                    failures: [safeFailure('SESSION_REVOKE_PERMISSION_BLOCKED', RISK_LEVELS.HIGH, 'This role cannot revoke the requested session.', {})],
                    timestamp: nowIso()
                });
            }
            var scope = tenantOf(context);
            if (targetSession && scope.tenantSlug && targetSession.tenantSlug && scope.tenantSlug !== targetSession.tenantSlug) {
                return freezeSessionOutput({
                    success: false,
                    revoked: false,
                    sessionId: safeString(sessionId, ''),
                    failures: [safeFailure('CROSS_TENANT_SESSION_SCOPE', RISK_LEVELS.CRITICAL, 'Cannot revoke a session outside the active tenant scope.', {})],
                    timestamp: nowIso()
                });
            }
            var changed = markSessionState(sessionId, SESSION_STATES.REVOKED, {
                revokedBy: context.actor && (context.actor.id || context.actor.email) || '',
                revokedByRole: context.actor && context.actor.role || '',
                revokedAt: nowIso()
            });
            if (changed) {
                emitTelemetry('SESSION_REVOKED', { sessionId: sessionId, tenantSlug: context.tenantSlug || '' }, 'WARNING');
                auditSession('SESSION_REVOKED', { sessionId: sessionId, tenantSlug: context.tenantSlug || '' }, context);
                auditAndHistory('SESSION_REVOKED', Object.assign({}, cloneValue(targetSession || {}, 0), { state: SESSION_STATES.REVOKED }), context, {
                    revokedBy: context.actor && (context.actor.id || context.actor.email) || ''
                });
                recordMetric('SESSION_REVOKED', { status: 'REVOKED', severity: 'WARNING', tenantSlug: context.tenantSlug || '' });
            }
            return freezeSessionOutput({
                success: true,
                revoked: changed,
                state: changed ? SESSION_STATES.REVOKED : (targetSession && targetSession.state || ''),
                sessionId: safeString(sessionId, ''),
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                revoked: false,
                sessionId: safeString(sessionId, ''),
                failures: [safeFailure('SESSION_REVOKE_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session revocation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function forceTenantLogout(tenantScope, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var scope = tenantOf(tenantScope);
            var store = getSessionStore();
            var count = 0;
            var sessions = store.sessions.map(function revokeTenant(row) {
                var tenant = tenantOf(row);
                if (scope.tenantSlug && tenant.tenantSlug === scope.tenantSlug && normalizeRole(row.role) !== 'platform_owner') {
                    count += 1;
                    return Object.assign({}, row, { state: SESSION_STATES.REVOKED, updatedAt: nowIso() });
                }
                return row;
            });
            if (count) {
                saveSessionStore(store, sessions);
                auditSession('TENANT_SESSIONS_REVOKED', { tenantSlug: scope.tenantSlug, revokedCount: count }, context);
                emitTelemetry('TENANT_SESSIONS_REVOKED', { tenantSlug: scope.tenantSlug, revokedCount: count }, 'WARNING');
            }
            return freezeSessionOutput({
                success: true,
                revokedCount: count,
                tenantSlug: scope.tenantSlug,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                revokedCount: 0,
                tenantSlug: '',
                failures: [safeFailure('TENANT_LOGOUT_FAILED_SAFE', RISK_LEVELS.HIGH, 'Tenant-wide logout failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function revokeAllSessions(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var scope = tenantOf(Object.assign({}, context, source));
            var userId = safeString(source.userId || source.authUserId || context.userId || context.actor && (context.actor.userId || context.actor.id) || '', '');
            var employeeId = safeString(source.employeeId || source.empId || context.employeeId || context.actor && (context.actor.empId || context.actor.employeeId) || '', '');
            var preserveSessionId = safeString(source.preserveSessionId || source.currentSessionId || '', '');
            if (!userId && !employeeId) {
                return freezeSessionOutput({
                    success: false,
                    revokedCount: 0,
                    failures: [safeFailure('SESSION_USER_REQUIRED', RISK_LEVELS.HIGH, 'User or employee identifier is required for all-device revocation.', {})],
                    timestamp: nowIso()
                });
            }
            if (!roleCanMutateSession({ userId: userId, employeeId: employeeId, tenantSlug: scope.tenantSlug }, context, userId)) {
                return freezeSessionOutput({
                    success: false,
                    revokedCount: 0,
                    failures: [safeFailure('SESSION_REVOKE_PERMISSION_BLOCKED', RISK_LEVELS.HIGH, 'This role cannot revoke sessions for the requested account.', {})],
                    timestamp: nowIso()
                });
            }
            var store = getSessionStore();
            var revokedCount = 0;
            var revokedRows = [];
            var sessions = store.sessions.map(function revokeRow(row) {
                var session = normalizeSession(row);
                if (scope.tenantSlug && session.tenantSlug && session.tenantSlug !== scope.tenantSlug) return row;
                var sameUser = (userId && session.userId === userId) || (employeeId && session.employeeId === employeeId);
                if (!sameUser || session.sessionId === preserveSessionId) return row;
                if ([SESSION_STATES.REVOKED, SESSION_STATES.EXPIRED, SESSION_STATES.TERMINATED].indexOf(session.state) >= 0) return row;
                revokedCount += 1;
                var revoked = Object.assign({}, row, {
                    state: SESSION_STATES.REVOKED,
                    updatedAt: nowIso(),
                    metadata: Object.assign({}, isPlainObject(row.metadata) ? row.metadata : {}, {
                        revokedAt: nowIso(),
                        revokedBy: context.actor && (context.actor.id || context.actor.email) || '',
                        revokedReason: source.reason || 'all_devices'
                    })
                });
                revokedRows.push(revoked);
                return revoked;
            });
            if (revokedCount) {
                saveSessionStore(store, sessions);
                revokedRows.forEach(function history(row) {
                    auditAndHistory('SESSION_REVOKED_ALL_DEVICES', normalizeSession(row), context, {
                        preserveSessionId: preserveSessionId,
                        reason: source.reason || 'all_devices'
                    });
                });
                emitTelemetry('SESSION_REVOKED_ALL_DEVICES', { userId: userId, tenantSlug: scope.tenantSlug, revokedCount: revokedCount }, 'WARNING');
                recordMetric('SESSION_REVOKED_ALL_DEVICES', { status: 'REVOKED', severity: 'WARNING', tenantSlug: scope.tenantSlug });
            }
            var data = rawData();
            ['authSessions', 'activeSessions', 'sessions'].forEach(function revokeLegacy(key) {
                if (!Array.isArray(data[key])) return;
                data[key].forEach(function markLegacy(row) {
                    if (scope.tenantSlug && row.tenantSlug && normalizeTenantSlug(row.tenantSlug) !== scope.tenantSlug) return;
                    if ((userId && safeString(row.userId || row.authUserId, '') === userId) || (employeeId && safeString(row.employeeId || row.empId, '') === employeeId)) {
                        if (row.sessionId !== preserveSessionId) {
                            row.active = false;
                            row.revoked = true;
                            row.revokedAt = nowIso();
                            row.revokedReason = source.reason || 'all_devices';
                        }
                    }
                });
            });
            saveData(data);
            auditSession('SESSION_REVOKED_ALL_DEVICES', { userId: userId, employeeId: employeeId, tenantSlug: scope.tenantSlug, revokedCount: revokedCount }, context);
            return freezeSessionOutput({
                success: true,
                state: SESSION_STATES.REVOKED,
                revokedCount: revokedCount,
                preserveSessionId: preserveSessionId,
                tenantSlug: scope.tenantSlug,
                userId: userId,
                employeeId: employeeId,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                revokedCount: 0,
                failures: [safeFailure('SESSION_REVOKE_ALL_FAILED_SAFE', RISK_LEVELS.HIGH, 'All-device session revocation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function averageDurationMinutes(sessions) {
        if (!sessions.length) return 0;
        var total = sessions.reduce(function sum(duration, row) {
            var session = normalizeSession(row);
            var end = session.state === SESSION_STATES.ACTIVE ? timeMs(session.lastActivityAt || nowIso()) : timeMs(session.updatedAt || session.expiresAt || session.lastActivityAt || nowIso());
            return duration + Math.max(0, end - timeMs(session.loginAt));
        }, 0);
        return Math.round(total / sessions.length / 60000);
    }

    function generateSessionAnalytics(input, contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var source = isPlainObject(input) ? input : {};
            var scope = tenantOf(Object.assign({}, context, source));
            var role = normalizeRole(context.actor && context.actor.role || context.role || '');
            if (!roleCanReviewTenantSessions(role) && role !== 'employee') {
                return freezeSessionOutput({
                    success: false,
                    failures: [safeFailure('SESSION_ANALYTICS_PERMISSION_BLOCKED', RISK_LEVELS.HIGH, 'This role cannot review session analytics.', {})],
                    timestamp: nowIso()
                });
            }
            var store = getSessionStore();
            var sessions = store.sessions.map(function normalizeRow(row) { return normalizeSession(row); }).filter(function visible(row) {
                if (scope.tenantSlug && row.tenantSlug && row.tenantSlug !== scope.tenantSlug) return false;
                if (role === 'employee') return sessionOwnerMatches(row, actorFromContext(context));
                if (row.role === 'platform_owner' && role !== 'platform_owner') return false;
                return true;
            });
            var summary = summarizeSessions(sessions);
            var devices = {};
            sessions.forEach(function eachDevice(row) {
                if (row.device && row.device.deviceFingerprint) devices[row.device.deviceFingerprint] = true;
            });
            var forcedLogoutRate = sessions.length ? Math.round((sessions.filter(function forced(row) { return row.state === SESSION_STATES.FORCED_LOGOUT || row.metadata && row.metadata.revokedReason === 'organization_forced_logout'; }).length / sessions.length) * 100) : 0;
            var expiryRate = sessions.length ? Math.round((summary.expiredSessions / sessions.length) * 100) : 0;
            var suspiciousRate = sessions.length ? Math.round((summary.suspiciousSessions / sessions.length) * 100) : 0;
            var sessionHealthScore = Math.max(0, Math.min(100, 95 - expiryRate - suspiciousRate - Math.round(forcedLogoutRate / 2)));
            var deviceTrustScore = Math.max(0, Math.min(100, 90 - Math.max(0, Object.keys(devices).length - sessions.length) * 5 - suspiciousRate));
            var authenticationSecurityScore = Math.max(0, Math.min(100, Math.round((sessionHealthScore + deviceTrustScore) / 2) - summary.concurrentWarnings * 5));
            var analytics = {
                activeSessions: summary.activeSessions,
                deviceCount: Object.keys(devices).length,
                averageSessionDurationMinutes: averageDurationMinutes(sessions),
                sessionExpiryRate: expiryRate,
                forcedLogoutRate: forcedLogoutRate,
                suspiciousActivityRate: suspiciousRate,
                sessionHealthScore: sessionHealthScore,
                deviceTrustScore: deviceTrustScore,
                authenticationSecurityScore: authenticationSecurityScore
            };
            if (!context.skipAuditPersistence) {
                appendImmutableHistory('sessionAnalytics', {
                    analyticsId: 'SA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                    tenantSlug: scope.tenantSlug,
                    analytics: analytics,
                    actorRole: role,
                    createdAt: nowIso()
                });
                auditSession('SESSION_ANALYTICS_REVIEWED', { tenantSlug: scope.tenantSlug, analytics: analytics }, context);
            }
            return freezeSessionOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                analytics: analytics,
                summary: summary,
                securityAlerts: freezeList(sessions.filter(function risky(row) {
                    return row.state === SESSION_STATES.SUSPICIOUS || row.riskLevel === RISK_LEVELS.HIGH || row.riskLevel === RISK_LEVELS.CRITICAL;
                }).slice(0, 20).map(function alert(row) {
                    return { alertCode: 'SUSPICIOUS_SESSION', severity: row.riskLevel || RISK_LEVELS.HIGH, sessionId: row.sessionId, userId: row.userId };
                })),
                metadata: { tenantIsolationPreserved: true, sensitiveSessionDataExposed: false },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                analytics: {},
                failures: [safeFailure('SESSION_ANALYTICS_FAILED_SAFE', RISK_LEVELS.HIGH, 'Session analytics failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function viewerCanSeeSession(session, context) {
        var actor = context && context.actor || {};
        var actorRole = normalizeRole(actor.role || context.role || '');
        var scope = tenantOf(context || {});
        var role = normalizeRole(session.role);
        if (actorRole === 'platform_owner') return true;
        if (role === 'platform_owner') return false;
        if (actorRole === 'hr' || actorRole === 'hr_head' || actorRole === 'director') {
            return !!scope.tenantSlug && session.tenantSlug === scope.tenantSlug;
        }
        if (actorRole === 'super_admin') {
            if (!scope.tenantSlug) return true;
            return !session.tenantSlug || session.tenantSlug === scope.tenantSlug;
        }
        if (!scope.tenantSlug) return false;
        return session.tenantSlug === scope.tenantSlug && session.userId === safeString(actor.id || actor.userId, '');
    }

    function summarizeSessions(sessions) {
        var summary = {
            totalSessions: sessions.length,
            activeSessions: 0,
            idleSessions: 0,
            expiredSessions: 0,
            revokedSessions: 0,
            suspiciousSessions: 0,
            tenantMismatchRisks: 0,
            concurrentWarnings: 0
        };
        var byUser = {};
        sessions.forEach(function countSession(row) {
            var session = normalizeSession(row);
            if (session.state === SESSION_STATES.ACTIVE) summary.activeSessions += 1;
            if (session.state === SESSION_STATES.IDLE) summary.idleSessions += 1;
            if (session.state === SESSION_STATES.EXPIRED) summary.expiredSessions += 1;
            if (session.state === SESSION_STATES.REVOKED) summary.revokedSessions += 1;
            if (session.state === SESSION_STATES.SUSPICIOUS || session.riskLevel === RISK_LEVELS.HIGH || session.riskLevel === RISK_LEVELS.CRITICAL) summary.suspiciousSessions += 1;
            if (session.userId) byUser[session.userId] = (byUser[session.userId] || 0) + 1;
        });
        Object.keys(byUser).forEach(function countConcurrent(userId) {
            if (byUser[userId] > DEFAULT_POLICY.maxConcurrentSessions) summary.concurrentWarnings += 1;
        });
        return summary;
    }

    function getSessionGovernanceView(contextInput) {
        try {
            var context = isPlainObject(contextInput) ? contextInput : {};
            var store = getSessionStore();
            var sessions = store.sessions.map(function normalizeRow(row) {
                return publicSession(row);
            }).filter(function filterVisible(row) {
                return viewerCanSeeSession(row, context);
            });
            var summary = summarizeSessions(sessions);
            return freezeSessionOutput({
                success: true,
                sessions: freezeList(sessions),
                summary: freezeSessionOutput(summary),
                warnings: summary.concurrentWarnings ? [safeWarning('CONCURRENT_SESSION_WARNINGS', 'One or more users exceed the recommended concurrent session count.', { count: summary.concurrentWarnings })] : [],
                metadata: {
                    platformOwnerIsolated: sessions.every(function noPlatformOwner(row) {
                        return normalizeRole(context.actor && context.actor.role) === 'platform_owner' || row.role !== 'platform_owner';
                    }),
                    tenantScoped: true,
                    sensitiveHrDataExposed: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSessionOutput({
                success: false,
                sessions: [],
                summary: {},
                warnings: [safeWarning('SESSION_VIEW_FAILED_SAFE', 'Session governance view failed safely.', {})],
                metadata: { sensitiveHrDataExposed: false },
                timestamp: nowIso()
            });
        }
    }

    function validateAccess(sessionInput, contextInput) {
        var scope = validateSessionScope(sessionInput, contextInput);
        var suspicious = detectSuspiciousAccess(sessionInput, contextInput);
        return freezeSessionOutput({
            success: scope.success !== false && suspicious.success !== false,
            allowed: scope.allowed === true && suspicious.riskLevel !== RISK_LEVELS.CRITICAL,
            session: scope.session,
            riskLevel: suspicious.riskLevel === RISK_LEVELS.CRITICAL ? RISK_LEVELS.CRITICAL : scope.riskLevel,
            failures: freezeList((scope.failures || []).concat((suspicious.findings || []).filter(function criticalFinding(item) {
                return item.severity === RISK_LEVELS.CRITICAL;
            }).map(function findingToFailure(item) {
                return safeFailure(item.findingCode, item.severity, item.message, item.metadata);
            }))),
            warnings: freezeList((scope.warnings || []).concat((suspicious.findings || []).filter(function warningFinding(item) {
                return item.severity !== RISK_LEVELS.CRITICAL;
            }))),
            metadata: {
                tenantSafe: scope.allowed === true,
                suspicious: suspicious.suspicious === true
            },
            timestamp: nowIso()
        });
    }

    function emitTelemetry(eventType, metadata, severity) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                source: DEFAULT_SOURCE,
                severity: severity || 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata || {})
            });
            return true;
        } catch (error) {
            safeWarn('Session telemetry failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function auditSession(eventType, metadata, context) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                eventType: eventType,
                actionType: eventType,
                module: 'Session Governance',
                source: DEFAULT_SOURCE,
                severity: eventType.indexOf('SUSPICIOUS') !== -1 || eventType.indexOf('REVOKED') !== -1 ? 'WARNING' : 'INFO',
                actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                actorRole: context && context.actor && context.actor.role || 'system',
                metadata: safeMetadata(metadata || {})
            }, { source: DEFAULT_SOURCE });
            return true;
        } catch (error) {
            safeWarn('Session audit failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function recordMetric(eventType, metadata) {
        try {
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: DEFAULT_SOURCE }, safeMetadata(metadata || {})));
            return true;
        } catch (error) {
            safeWarn('Session metrics failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    var SessionGovernanceService = Object.freeze({
        SESSION_STATES: SESSION_STATES,
        RISK_LEVELS: RISK_LEVELS,
        DEFAULT_POLICY: DEFAULT_POLICY,
        normalizeDeviceMetadata: normalizeDeviceMetadata,
        validateSessionScope: validateSessionScope,
        classifySessionRisk: detectSuspiciousAccess,
        detectSuspiciousAccess: detectSuspiciousAccess,
        createSession: createSession,
        expireSession: expireSession,
        recordSessionStart: recordSessionStart,
        revokeSession: revokeSession,
        revokeAllSessions: revokeAllSessions,
        calculateSessionRisk: calculateSessionRisk,
        calculateDeviceTrust: calculateDeviceTrust,
        generateSessionAnalytics: generateSessionAnalytics,
        forceTenantLogout: forceTenantLogout,
        validateAccess: validateAccess,
        getSessionGovernanceView: getSessionGovernanceView,
        freezeSessionOutput: freezeSessionOutput
    });

    if (!db()) {
        safeWarn('Optional DB dependency not detected. Session governance will use supplied evidence only.');
    }

    global.SessionGovernanceService = SessionGovernanceService;
    global.sessionGovernanceService = SessionGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            var originalDb = global.DB;
            var selfTestData = {
                companySettings: { tenantSlug: 'tabsons' },
                sessionGovernance: { sessions: [], policies: {} },
                sessionHistory: [],
                deviceHistory: [],
                sessionAnalytics: [],
                auditLogs: []
            };
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }

            global.DB = {
                get: function get() { return selfTestData; },
                save: function save(nextData) { selfTestData = nextData || selfTestData; return selfTestData; },
                getData: function getData() { return selfTestData; },
                saveData: function saveData(nextData) { selfTestData = nextData || selfTestData; return selfTestData; },
                writeAuditLog: function writeAuditLog(entry) {
                    selfTestData.auditLogs = withDataArray(selfTestData.auditLogs);
                    selfTestData.auditLogs.push(Object.assign({ id: 'SELF-AUDIT-' + selfTestData.auditLogs.length }, entry || {}));
                }
            };

            try {
                var expired = validateSessionScope({ sessionId: 'SELF-EXPIRED', userId: 'U1', role: 'employee', tenantSlug: 'tabsons', loginAt: '2026-05-20T00:00:00.000Z', expiresAt: '2026-05-20T01:00:00.000Z' }, { tenantSlug: 'tabsons', now: '2026-05-22T00:00:00.000Z' });
                record('session expiry works', expired.allowed === false && expired.failures.some(function hasExpired(item) { return item.failureCode === 'SESSION_EXPIRED'; }), expired);

                var suspicious = detectSuspiciousAccess({ userId: 'U1', tenantSlug: 'abc', failedAttempts: 5 }, { tenantSlug: 'tabsons' });
                record('suspicious session detection works', suspicious.suspicious === true && suspicious.riskLevel === RISK_LEVELS.CRITICAL, suspicious);

                var tenant = validateSessionScope({ userId: 'U2', role: 'employee', tenantSlug: 'abc', expiresAt: '2026-05-23T00:00:00.000Z' }, { tenantSlug: 'tabsons', now: '2026-05-22T00:00:00.000Z' });
                record('tenant session isolation works', tenant.allowed === false && tenant.failures.some(function hasTenant(item) { return item.failureCode === 'CROSS_TENANT_SESSION_SCOPE'; }), tenant);

                var concurrent = detectSuspiciousAccess({ userId: 'SELF-CON', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', policy: { maxConcurrentSessions: 1 } });
                record('concurrent session governance works', concurrent.success === true, concurrent);

                var immutable = normalizeDeviceMetadata({ userAgent: 'Chrome', ipAddress: '10.1.2.3' });
                record('immutable outputs enforced', Object.isFrozen(immutable) && JSON.stringify(immutable).indexOf('10.1.2.3') === -1, immutable);

                var selfContext = { tenantSlug: 'tabsons', actor: { id: 'SELF-U', userId: 'SELF-U', empId: 'SELF-E', role: 'employee' }, policy: { inactivityTimeoutMinutes: 30, absoluteSessionHours: 12, rememberMeDays: 14, maxConcurrentSessions: 3 } };
                var created = createSession({ sessionId: 'SELF-CREATED', userId: 'SELF-U', employeeId: 'SELF-E', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { userAgent: 'Chrome on Windows', ipAddress: '10.1.2.3' } }, selfContext);
                record('session creation works', created.success === true && created.session && created.session.state === SESSION_STATES.ACTIVE, created);

                var trust = calculateDeviceTrust({ tenantSlug: 'tabsons', userId: 'SELF-U', device: created.session && created.session.device }, selfContext);
                record('device tracking works', trust.success === true && typeof trust.deviceTrustScore === 'number' && JSON.stringify(trust).indexOf('10.1.2.3') === -1, trust);

                var expiredCreated = expireSession({ sessionId: 'SELF-CREATED', tenantSlug: 'tabsons', reason: 'self_test_expiry' }, selfContext);
                record('expiry helper works', expiredCreated.success === true && expiredCreated.state === SESSION_STATES.EXPIRED, expiredCreated);

                createSession({ sessionId: 'SELF-REVOKE-A', userId: 'SELF-U', employeeId: 'SELF-E', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { browser: 'Chrome', deviceFingerprint: 'DEV-SELF-A' } }, selfContext);
                createSession({ sessionId: 'SELF-REVOKE-B', userId: 'SELF-U', employeeId: 'SELF-E', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { browser: 'Edge', deviceFingerprint: 'DEV-SELF-B' } }, selfContext);
                var revokedAll = revokeAllSessions({ tenantSlug: 'tabsons', userId: 'SELF-U', employeeId: 'SELF-E', reason: 'self_test_logout_all' }, selfContext);
                record('all-device revoke works', revokedAll.success === true && revokedAll.revokedCount >= 2, revokedAll);

                var analytics = generateSessionAnalytics({ tenantSlug: 'tabsons' }, selfContext);
                record('session analytics work', analytics.success === true && analytics.analytics && typeof analytics.analytics.sessionHealthScore === 'number', analytics);

                var revoke = revokeSession('missing-session', { actor: { role: 'super_admin' }, tenantSlug: 'tabsons' });
                record('session revocation handles absence safely', revoke.success === true && revoke.revoked === false, revoke);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            } finally {
                if (originalDb) {
                    global.DB = originalDb;
                } else {
                    try { delete global.DB; } catch (deleteError) { global.DB = originalDb; }
                }
            }

            try {
                global.__ARTHHRMS_SESSION_GOVERNANCE_SELF_TEST__ = Object.freeze({
                    passed: checks.every(function allPassed(item) { return item.passed; }),
                    tests: Object.freeze(checks.slice())
                });
            } catch (error) {
                safeWarn('Self-test result storage failed safely.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
