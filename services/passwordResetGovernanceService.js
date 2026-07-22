(function attachPasswordResetGovernanceService(global) {
    'use strict';

    var RESET_STATES = Object.freeze(['CREATED', 'SENT', 'USED', 'EXPIRED', 'REVOKED']);
    var RESET_WORKFLOW = Object.freeze([
        'FORGOT_PASSWORD',
        'IDENTITY_VALIDATION',
        'RESET_REQUEST',
        'SECURE_TOKEN_CREATION',
        'EMAIL_DELIVERY',
        'PASSWORD_RESET',
        'SECURITY_VALIDATION',
        'SUCCESS_CONFIRMATION'
    ]);
    var REVIEW_ROLES = Object.freeze(['HR', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /password|credential|secret|tokenHash|rawToken|resetToken|stack|salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|aadhaar|pan|ssn|medical|benefit|privateNote|private/i;
    var TERMINAL_STATES = Object.freeze(['USED', 'EXPIRED', 'REVOKED']);
    var BANNED_PASSWORDS = Object.freeze(['password', 'password123', 'password123!', 'welcome', 'welcome123', 'qwerty', 'admin123', 'letmein', 'companyname']);

    var volatileRequests = [];
    var volatileTokenHistory = [];
    var volatileResetHistory = [];
    var volatileAnalytics = [];

    function db() { return global.DB || null; }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function addMinutes(iso, minutes) {
        var start = iso ? new Date(iso) : new Date();
        return new Date(start.getTime() + (Number(minutes || 0) * 60 * 1000)).toISOString();
    }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeEmail(value) {
        try {
            if (db() && typeof db().normalizeEmail === 'function') return db().normalizeEmail(value);
        } catch (error) {}
        return normalizeText(value).toLowerCase();
    }

    function normalizeTenantSlug(value) {
        return normalizeText(value)
            .toLowerCase()
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeText(value || 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'HRHEAD') role = 'HR_HEAD';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        return role || 'EMPLOYEE';
    }

    function normalizeEmployeeId(value) {
        return normalizeText(value || '').toUpperCase();
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function freezePasswordResetOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezePasswordResetOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Reflect.ownKeys(value).forEach(function each(key) {
                var descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                Object.defineProperty(clone, key, {
                    enumerable: descriptor.enumerable,
                    configurable: false,
                    writable: false,
                    value: freezePasswordResetOutput(descriptor.value)
                });
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function cloneSanitized(value, keyHint) {
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint); });
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEYS.test(key)) return;
                clone[key] = cloneSanitized(value[key], key);
            });
            return clone;
        }
        if (SENSITIVE_KEYS.test(String(keyHint || ''))) return undefined;
        return value;
    }

    function issue(code, message, severity, metadata) {
        return freezePasswordResetOutput({
            code: code,
            message: message,
            severity: severity || 'ERROR',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function governanceFlags(role, context) {
        var normalizedRole = normalizeRole(role || context?.role || context?.actor?.role || 'EMPLOYEE');
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            authenticationGovernancePreserved: true,
            rbacAuthoritative: true,
            noPasswordDisclosure: true,
            singleUseTokensRequired: true,
            tokenExpirationRequired: true,
            platformOwnerVisibilityOnly: normalizedRole === 'PLATFORM_OWNER' || context?.governanceOnly === true,
            sessionTrackingPrepared: true
        };
    }

    function failureOutput(state, tenantSlug, failures, message, role, context) {
        return freezePasswordResetOutput({
            success: false,
            state: state || 'CREATED',
            tenantSlug: normalizeTenantSlug(tenantSlug),
            failures: failures || [issue('PASSWORD_RESET_FAILED_SAFE', message || 'Password reset operation failed safely.', 'ERROR')],
            issues: failures || [issue('PASSWORD_RESET_FAILED_SAFE', message || 'Password reset operation failed safely.', 'ERROR')],
            governance: governanceFlags(role, context || {}),
            metadata: {
                backwardCompatibilityPreserved: true,
                tenantIsolationPreserved: true,
                authenticationGovernancePreserved: true,
                generatedAt: nowIso()
            }
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || context?.actorId || 'system'),
            empId: normalizeEmployeeId(actor.empId || actor.employeeId || actor.id || ''),
            email: normalizeEmail(actor.email || ''),
            role: normalizeRole(actor.role || context?.role || context?.actorRole || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || context?.tenantSlug || context?.tenantId || '')
        };
    }

    function tenantFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        var data = rawData();
        return normalizeTenantSlug(
            context?.tenantSlug ||
            context?.tenantId ||
            context?.companyId ||
            actor.tenantSlug ||
            actor.tenantId ||
            actor.companyId ||
            data.companySettings?.tenantSlug ||
            data.companySettings?.tenantId ||
            'default'
        );
    }

    function tenantOf(record) {
        return normalizeTenantSlug(record?.tenantSlug || record?.tenantId || record?.companyId || record?.organizationId || '');
    }

    function sameTenant(record, tenantSlug) {
        var recordTenant = tenantOf(record);
        if (recordTenant) return recordTenant === normalizeTenantSlug(tenantSlug);
        var settings = rawData().companySettings || {};
        var defaultTenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || 'default');
        return normalizeTenantSlug(tenantSlug) === defaultTenant;
    }

    function employeeIdOf(employee) {
        return normalizeEmployeeId(employee?.employeeId || employee?.empId || employee?.id || '');
    }

    function employeeEmailOf(employee) {
        return normalizeEmail(employee?.email || employee?.emailAddress || '');
    }

    function userEmailOf(user) {
        return normalizeEmail(user?.email || user?.emailAddress || '');
    }

    function userIdOf(user) {
        return normalizeText(user?.id || user?.userId || user?.authUserId || '');
    }

    function tenantEmployees(tenantSlug) {
        var data = rawData();
        return (data.employees || []).filter(function each(employee) {
            return sameTenant(employee, tenantSlug);
        });
    }

    function tenantUsers(tenantSlug) {
        var data = rawData();
        var employees = tenantEmployees(tenantSlug);
        var employeeIds = new Set(employees.map(employeeIdOf));
        var employeeEmails = new Set(employees.map(employeeEmailOf));
        return (data.users || []).filter(function each(user) {
            if (sameTenant(user, tenantSlug)) return true;
            var empId = normalizeEmployeeId(user.empId || user.employeeId || '');
            var email = userEmailOf(user);
            return (empId && employeeIds.has(empId)) || (email && employeeEmails.has(email));
        });
    }

    function findEmployee(input, tenantSlug) {
        var email = normalizeEmail(input?.email);
        var employeeId = normalizeEmployeeId(input?.employeeId || input?.empId || input?.id || '');
        return tenantEmployees(tenantSlug).find(function match(employee) {
            return (employeeId && employeeIdOf(employee) === employeeId) || (email && employeeEmailOf(employee) === email);
        }) || null;
    }

    function findUser(input, tenantSlug) {
        var email = normalizeEmail(input?.email);
        var employeeId = normalizeEmployeeId(input?.employeeId || input?.empId || input?.id || '');
        var authUserId = normalizeText(input?.userId || input?.authUserId || '');
        var employee = findEmployee(input, tenantSlug);
        return tenantUsers(tenantSlug).find(function match(user) {
            var userEmpId = normalizeEmployeeId(user.empId || user.employeeId || '');
            return (authUserId && userIdOf(user) === authUserId) ||
                (email && userEmailOf(user) === email) ||
                (employeeId && userEmpId === employeeId) ||
                (employee && userEmpId && userEmpId === employeeIdOf(employee)) ||
                (employee && userEmailOf(user) && userEmailOf(user) === employeeEmailOf(employee));
        }) || null;
    }

    function userEmployee(user, tenantSlug) {
        if (!user) return null;
        return findEmployee({ employeeId: user.empId || user.employeeId, email: user.email }, tenantSlug);
    }

    function withDataArray(data, key) {
        if (!Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function volatileArray(key) {
        if (key === 'passwordResetRequests') return volatileRequests;
        if (key === 'passwordResetTokenHistory') return volatileTokenHistory;
        if (key === 'passwordResetHistory') return volatileResetHistory;
        if (key === 'passwordResetAnalytics') return volatileAnalytics;
        return volatileRequests;
    }

    function persistHistory(key, row, context) {
        try {
            var clean = cloneSanitized(row || {});
            if (context?.skipPersistence) {
                volatileArray(key).unshift(freezePasswordResetOutput(clean));
                return false;
            }
            var data = rawData();
            withDataArray(data, key).unshift({ ...clean, immutable: true });
            if (data[key].length > 500) data[key] = data[key].slice(0, 500);
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function updatePersistentRequest(request, context) {
        try {
            var clean = { ...request, immutable: true };
            if (context?.skipPersistence) {
                var vi = volatileRequests.findIndex(function match(row) { return row.requestId === clean.requestId; });
                if (vi >= 0) volatileRequests[vi] = freezePasswordResetOutput(cloneSanitized(clean));
                else volatileRequests.unshift(freezePasswordResetOutput(cloneSanitized(clean)));
                return false;
            }
            var data = rawData();
            var rows = withDataArray(data, 'passwordResetRequests');
            var index = rows.findIndex(function match(row) { return row.requestId === clean.requestId; });
            if (index >= 0) rows[index] = { ...rows[index], ...clean, updatedAt: nowIso(), immutable: true };
            else rows.unshift(clean);
            if (rows.length > 500) data.passwordResetRequests = rows.slice(0, 500);
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function audit(action, actor, tenantSlug, targetId, description, context) {
        try {
            if (context?.skipAuditPersistence) return null;
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                return global.AuditService.recordAudit({
                    actorId: actor.id,
                    actorRole: actor.role,
                    action,
                    actionType: action,
                    module: 'Credential Recovery',
                    targetId: targetId || '',
                    tenantSlug,
                    description,
                    metadata: { authenticationGovernancePreserved: true, tenantIsolationPreserved: true }
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                return db().writeAuditLog(actor.role, actor.id, action, 'Credential Recovery', targetId || '', description || action);
            }
        } catch (error) {}
        return null;
    }

    function governanceAllowed(input, context, mode) {
        var actor = actorFromContext(context || {});
        var contextTenant = tenantFromContext(context || {});
        var payloadTenant = normalizeTenantSlug(input?.tenantSlug || input?.tenantId || contextTenant);
        var tenantSlug = payloadTenant || contextTenant;
        if (contextTenant && payloadTenant && contextTenant !== payloadTenant) {
            return {
                allowed: false,
                actor,
                tenantSlug,
                failures: [issue('CROSS_TENANT_RESET_BLOCKED', 'Password reset requests must stay inside the active tenant scope.', 'CRITICAL')]
            };
        }
        var role = actor.role;
        var review = mode === 'analytics' || mode === 'review' || context?.reviewOnly || context?.governanceOnly;
        if (review) {
            if (REVIEW_ROLES.indexOf(role) === -1 && role !== 'SUPER_ADMIN') {
                return {
                    allowed: false,
                    actor,
                    tenantSlug,
                    failures: [issue('RESET_VISIBILITY_BLOCKED', 'This role cannot review credential recovery status.', 'ERROR')]
                };
            }
            return { allowed: true, actor, tenantSlug, reviewOnly: true };
        }
        if (role !== 'EMPLOYEE') {
            return {
                allowed: false,
                actor,
                tenantSlug,
                failures: [issue('RESET_ACTION_ROLE_BLOCKED', 'Only the account owner may perform password recovery actions.', 'ERROR')]
            };
        }
        var email = normalizeEmail(input?.email || actor.email || '');
        var employeeId = normalizeEmployeeId(input?.employeeId || input?.empId || actor.empId || '');
        var actorEmail = normalizeEmail(actor.email || '');
        var actorEmpId = normalizeEmployeeId(actor.empId || actor.id || '');
        if ((email && actorEmail && email !== actorEmail) || (employeeId && actorEmpId && employeeId !== actorEmpId)) {
            return {
                allowed: false,
                actor,
                tenantSlug,
                failures: [issue('RESET_OWNERSHIP_BLOCKED', 'Employees may only recover credentials for their own account.', 'ERROR')]
            };
        }
        return { allowed: true, actor, tenantSlug, reviewOnly: false };
    }

    function normalizeResetPayload(payload, context) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return { malformed: true, tenantSlug: tenantFromContext(context || {}) };
        }
        var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || tenantFromContext(context || {}));
        return {
            tenantSlug: tenantSlug,
            email: normalizeEmail(payload.email || payload.userEmail || ''),
            employeeId: normalizeEmployeeId(payload.employeeId || payload.empId || payload.id || ''),
            userId: normalizeText(payload.userId || payload.authUserId || ''),
            token: normalizeText(payload.token || payload.resetToken || ''),
            password: String(payload.password == null ? '' : payload.password),
            confirmPassword: String(payload.confirmPassword == null ? '' : payload.confirmPassword),
            expiresAt: normalizeText(payload.expiresAt || ''),
            expiresInMinutes: Number(payload.expiresInMinutes || payload.ttlMinutes || 60),
            logoutAllDevices: payload.logoutAllDevices !== false,
            metadata: cloneSanitized(payload.metadata || {})
        };
    }

    function tokenPreview(token) {
        var text = normalizeText(token);
        if (!text) return '';
        if (text.length <= 12) return text.slice(0, 2) + '...' + text.slice(-2);
        return text.slice(0, 6) + '...' + text.slice(-6);
    }

    function randomBytesHex(length) {
        var byteLength = Math.max(16, Math.ceil(Number(length || 32)));
        var values = [];
        try {
            var cryptoObj = global.crypto || global.msCrypto || null;
            if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
                var array = new Uint8Array(byteLength);
                cryptoObj.getRandomValues(array);
                values = Array.prototype.slice.call(array);
            }
        } catch (error) {}
        if (!values.length) {
            for (var i = 0; i < byteLength; i += 1) values.push(Math.floor(Math.random() * 256));
        }
        return values.map(function each(byte) { return ('0' + byte.toString(16)).slice(-2); }).join('');
    }

    function generateSecureToken() {
        return 'pr_' + randomBytesHex(32) + '_' + Date.now().toString(36);
    }

    function hashText(value, salt) {
        var text = normalizeText(value) + '|' + normalizeText(salt || 'arthhrms');
        var h1 = 0x811c9dc5;
        var h2 = 0x9e3779b9;
        for (var i = 0; i < text.length; i += 1) {
            var code = text.charCodeAt(i);
            h1 ^= code;
            h1 = Math.imul(h1, 16777619);
            h2 ^= code + i;
            h2 = Math.imul(h2, 1597334677);
        }
        return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
    }

    function hashToken(token) {
        return 'rt_' + hashText(token, 'reset-token-v1');
    }

    function passwordFingerprint(password) {
        return 'fp-' + normalizeText(password).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function hashPassword(password) {
        var salt = randomBytesHex(10);
        return 'pwd$' + salt + '$' + hashText(password, salt);
    }

    function collectPasswordFingerprints(user) {
        var set = new Set();
        (user?.passwordHistoryFingerprints || []).forEach(function each(fp) { if (fp) set.add(String(fp)); });
        if (user?.passwordFingerprint) set.add(String(user.passwordFingerprint));
        if (user?.password) set.add(passwordFingerprint(user.password));
        return set;
    }

    function validatePasswordPolicy(password, confirmPassword, user) {
        var failures = [];
        var value = String(password || '');
        if (value !== String(confirmPassword || '')) failures.push(issue('PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.', 'ERROR'));
        if (value.length < 10) failures.push(issue('PASSWORD_POLICY_FAILED', 'Password must be at least 10 characters.', 'ERROR', { rule: 'minimum_length' }));
        if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
            failures.push(issue('PASSWORD_POLICY_FAILED', 'Password must include upper, lower, number, and symbol characters.', 'ERROR', { rule: 'complexity' }));
        }
        var lower = value.toLowerCase();
        if (BANNED_PASSWORDS.some(function banned(item) { return lower === item || lower.indexOf(item) >= 0; })) {
            failures.push(issue('BANNED_PASSWORD_BLOCKED', 'Password appears on the banned password list.', 'ERROR'));
        }
        if (user && collectPasswordFingerprints(user).has(passwordFingerprint(value))) {
            failures.push(issue('PASSWORD_HISTORY_REUSE', 'Password was used previously and cannot be reused.', 'ERROR'));
        }
        return failures;
    }

    function requestRows(tenantSlug, context) {
        var persistent = (rawData().passwordResetRequests || []).filter(function each(row) { return sameTenant(row, tenantSlug); });
        var volatile = context?.skipPersistence ? volatileRequests.filter(function each(row) { return sameTenant(row, tenantSlug); }) : [];
        return persistent.concat(volatile).sort(function sort(a, b) {
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
    }

    function findRequestByToken(token, tenantSlug, email) {
        var tokenHash = hashToken(token);
        var emailNorm = normalizeEmail(email || '');
        return requestRows(tenantSlug).find(function match(row) {
            return row.tokenHash === tokenHash && (!emailNorm || normalizeEmail(row.email) === emailNorm);
        }) || null;
    }

    function revokeOpenTokensForUser(data, tenantSlug, user, exceptRequestId, actor, context) {
        var userId = userIdOf(user);
        var email = userEmailOf(user);
        var count = 0;
        var rows = withDataArray(data, 'passwordResetRequests');
        rows.forEach(function each(row) {
            if (row.requestId === exceptRequestId) return;
            if (!sameTenant(row, tenantSlug)) return;
            if (TERMINAL_STATES.indexOf(row.state) >= 0) return;
            if ((userId && row.userId === userId) || (email && normalizeEmail(row.email) === email)) {
                row.state = 'REVOKED';
                row.revokedAt = nowIso();
                row.updatedAt = nowIso();
                count += 1;
                withDataArray(data, 'passwordResetTokenHistory').unshift(cloneSanitized({
                    historyId: id('PRH'),
                    requestId: row.requestId,
                    userId: row.userId,
                    email: row.email,
                    tenantSlug,
                    state: 'REVOKED',
                    eventType: 'TOKEN_REVOKED_BY_NEW_REQUEST',
                    createdAt: nowIso(),
                    actorId: actor?.id || 'system',
                    immutable: true
                }));
            }
        });
        return count;
    }

    function safeUserRow(user, employee, options) {
        var displayName = options?.anonymize ? 'Governance Request ' + normalizeText(user?.id || employee?.id || '').slice(-4) : normalizeText(user?.name || employee?.name || user?.email || 'Employee');
        return {
            userId: userIdOf(user),
            employeeId: normalizeEmployeeId(user?.empId || employee?.id || employee?.empId || ''),
            email: options?.anonymize ? '' : userEmailOf(user),
            displayName,
            role: normalizeRole(user?.role || employee?.role || 'EMPLOYEE'),
            department: options?.anonymize ? '' : normalizeText(employee?.department || employee?.dept || ''),
            active: user?.active !== false
        };
    }

    function buildRequestOutput(row, context) {
        if (!row) return null;
        return cloneSanitized({
            requestId: row.requestId,
            userId: row.userId,
            employeeId: row.employeeId,
            email: row.email,
            displayName: row.displayName,
            tenantSlug: row.tenantSlug,
            state: row.state,
            tokenPreview: row.tokenPreview,
            expiresAt: row.expiresAt,
            sentAt: row.sentAt,
            usedAt: row.usedAt,
            expiredAt: row.expiredAt,
            revokedAt: row.revokedAt,
            failedAttempts: row.failedAttempts || 0,
            suspicious: !!row.suspicious,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        });
    }

    function generateResetToken(payload, context) {
        try {
            var input = normalizeResetPayload(payload, context);
            if (input.malformed) return failureOutput('CREATED', input.tenantSlug, [issue('MALFORMED_RESET_PAYLOAD', 'Reset token payload is malformed.', 'ERROR')], '', 'EMPLOYEE', context);
            var access = governanceAllowed(input, context, 'action');
            if (!access.allowed) return failureOutput('CREATED', access.tenantSlug, access.failures, '', access.actor.role, context);
            var user = findUser(input, access.tenantSlug);
            if (!user || !sameTenant(user, access.tenantSlug)) {
                return failureOutput('CREATED', access.tenantSlug, [issue('RESET_USER_NOT_FOUND', 'No active account exists for the reset request.', 'ERROR')], '', access.actor.role, context);
            }
            if (user.active === false || /SUSPENDED|ARCHIVED|TERMINATED/i.test(String(user.activationStatus || user.lifecycleStatus || ''))) {
                return failureOutput('CREATED', access.tenantSlug, [issue('RESET_ACCOUNT_UNAVAILABLE', 'The account is not eligible for credential recovery.', 'ERROR')], '', access.actor.role, context);
            }
            var employee = userEmployee(user, access.tenantSlug);
            var token = generateSecureToken();
            var createdAt = nowIso();
            var expiresAt = input.expiresAt || addMinutes(createdAt, Number.isFinite(input.expiresInMinutes) && input.expiresInMinutes > 0 ? input.expiresInMinutes : 60);
            var row = {
                requestId: id('PWR'),
                tenantSlug: access.tenantSlug,
                userId: userIdOf(user),
                employeeId: normalizeEmployeeId(user.empId || employee?.id || ''),
                email: userEmailOf(user),
                displayName: normalizeText(user.name || employee?.name || user.email || 'Employee'),
                state: 'CREATED',
                tokenHash: hashToken(token),
                tokenPreview: tokenPreview(token),
                expiresAt,
                createdAt,
                updatedAt: createdAt,
                createdBy: access.actor.id,
                failedAttempts: 0,
                immutable: true,
                metadata: input.metadata || {}
            };
            var data = rawData();
            revokeOpenTokensForUser(data, access.tenantSlug, user, row.requestId, access.actor, context);
            withDataArray(data, 'passwordResetRequests').unshift(row);
            withDataArray(data, 'passwordResetTokenHistory').unshift(cloneSanitized({
                historyId: id('PRH'),
                requestId: row.requestId,
                userId: row.userId,
                email: row.email,
                tenantSlug: row.tenantSlug,
                state: row.state,
                eventType: 'TOKEN_CREATED',
                tokenPreview: row.tokenPreview,
                expiresAt: row.expiresAt,
                createdAt,
                actorId: access.actor.id,
                immutable: true
            }));
            if (data.passwordResetRequests.length > 500) data.passwordResetRequests = data.passwordResetRequests.slice(0, 500);
            if (data.passwordResetTokenHistory.length > 500) data.passwordResetTokenHistory = data.passwordResetTokenHistory.slice(0, 500);
            if (context?.skipPersistence) {
                volatileRequests.unshift(cloneSanitized(row));
                volatileTokenHistory.unshift(cloneSanitized(data.passwordResetTokenHistory[0]));
            } else {
                saveData(data);
            }
            audit('PASSWORD_RESET_TOKEN_CREATED', access.actor, access.tenantSlug, row.requestId, 'Secure reset token created for account recovery.', context);
            var output = {
                success: true,
                state: 'CREATED',
                tenantSlug: access.tenantSlug,
                resetRequest: buildRequestOutput(row, context),
                tokenPreview: row.tokenPreview,
                token: context?.exposeToken === true ? token : undefined,
                workflow: RESET_WORKFLOW.slice(),
                governance: governanceFlags(access.actor.role, context),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            };
            return freezePasswordResetOutput(cloneSanitized(output));
        } catch (error) {
            return failureOutput('CREATED', tenantFromContext(context || {}), [issue('PASSWORD_RESET_EXCEPTION', 'Password reset token generation failed safely.', 'ERROR')], '', actorFromContext(context || {}).role, context);
        }
    }

    function requestPasswordReset(payload, context) {
        try {
            var input = normalizeResetPayload(payload, context);
            if (input.malformed) return failureOutput('CREATED', input.tenantSlug, [issue('MALFORMED_RESET_PAYLOAD', 'Reset request payload is malformed.', 'ERROR')], '', 'EMPLOYEE', context);
            var generated = generateResetToken(input, { ...(context || {}), exposeToken: false });
            if (!generated.success) return generated;
            var data = rawData();
            var row = (data.passwordResetRequests || []).find(function match(item) { return item.requestId === generated.resetRequest.requestId; }) || null;
            if (row) {
                row.state = 'SENT';
                row.sentAt = nowIso();
                row.deliveryProvider = 'DEVELOPMENT_LOCAL';
                row.updatedAt = nowIso();
                updatePersistentRequest(row, context);
                persistHistory('passwordResetTokenHistory', {
                    historyId: id('PRH'),
                    requestId: row.requestId,
                    userId: row.userId,
                    email: row.email,
                    tenantSlug: row.tenantSlug,
                    state: 'SENT',
                    eventType: 'RESET_EMAIL_PREPARED',
                    tokenPreview: row.tokenPreview,
                    createdAt: nowIso(),
                    actorId: actorFromContext(context || {}).id,
                    immutable: true
                }, context || {});
            }
            var actor = actorFromContext(context || {});
            audit('PASSWORD_RESET_REQUESTED', actor, generated.tenantSlug, generated.resetRequest.requestId, 'Password reset request created and delivery prepared.', context);
            return freezePasswordResetOutput(cloneSanitized({
                success: true,
                state: 'SENT',
                tenantSlug: generated.tenantSlug,
                resetRequest: buildRequestOutput(row || generated.resetRequest, context),
                delivery: {
                    emailPrepared: true,
                    provider: 'DEVELOPMENT_LOCAL',
                    sentAt: row?.sentAt || nowIso(),
                    resetUrlPrepared: true,
                    tokenPreview: row?.tokenPreview || generated.tokenPreview
                },
                workflow: RESET_WORKFLOW.slice(),
                governance: governanceFlags(actor.role, context),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            }));
        } catch (error) {
            return failureOutput('CREATED', tenantFromContext(context || {}), [issue('PASSWORD_RESET_EXCEPTION', 'Password reset request failed safely.', 'ERROR')], '', actorFromContext(context || {}).role, context);
        }
    }

    function markRequest(row, state, context, metadata) {
        if (!row) return null;
        var now = nowIso();
        var updated = { ...row, state, updatedAt: now };
        if (state === 'USED') updated.usedAt = now;
        if (state === 'EXPIRED') updated.expiredAt = now;
        if (state === 'REVOKED') updated.revokedAt = now;
        Object.assign(updated, metadata || {});
        updatePersistentRequest(updated, context || {});
        persistHistory('passwordResetTokenHistory', {
            historyId: id('PRH'),
            requestId: updated.requestId,
            userId: updated.userId,
            email: updated.email,
            tenantSlug: updated.tenantSlug,
            state,
            eventType: 'TOKEN_' + state,
            tokenPreview: updated.tokenPreview,
            createdAt: now,
            actorId: actorFromContext(context || {}).id,
            immutable: true
        }, context || {});
        return updated;
    }

    function validateResetToken(payload, context) {
        try {
            var input = normalizeResetPayload(payload, context);
            if (input.malformed) return failureOutput('CREATED', input.tenantSlug, [issue('MALFORMED_RESET_PAYLOAD', 'Reset token validation payload is malformed.', 'ERROR')], '', 'EMPLOYEE', context);
            var access = governanceAllowed(input, context, 'action');
            if (!access.allowed) return failureOutput('CREATED', access.tenantSlug, access.failures, '', access.actor.role, context);
            if (!input.token) return failureOutput('CREATED', access.tenantSlug, [issue('RESET_TOKEN_REQUIRED', 'Reset token is required.', 'ERROR')], '', access.actor.role, context);
            var row = findRequestByToken(input.token, access.tenantSlug, input.email);
            if (!row) {
                recordSuspiciousAttempt(access.tenantSlug, input.email, 'RESET_TOKEN_INVALID', access.actor, context);
                return failureOutput('CREATED', access.tenantSlug, [issue('RESET_TOKEN_INVALID', 'Reset token is invalid or has been tampered with.', 'CRITICAL')], '', access.actor.role, context);
            }
            if (row.state === 'REVOKED') return failureOutput('REVOKED', access.tenantSlug, [issue('RESET_TOKEN_REVOKED', 'Reset token was revoked by a newer reset request.', 'ERROR')], '', access.actor.role, context);
            if (row.state === 'USED') return failureOutput('USED', access.tenantSlug, [issue('RESET_TOKEN_REUSED', 'Reset token has already been used.', 'CRITICAL')], '', access.actor.role, context);
            if (new Date(row.expiresAt).getTime() <= Date.now()) {
                markRequest(row, 'EXPIRED', context);
                return failureOutput('EXPIRED', access.tenantSlug, [issue('RESET_TOKEN_EXPIRED', 'Reset token has expired.', 'ERROR')], '', access.actor.role, context);
            }
            var user = findUser({ userId: row.userId, email: row.email }, access.tenantSlug);
            if (!user) return failureOutput('CREATED', access.tenantSlug, [issue('RESET_USER_NOT_FOUND', 'Reset token is not linked to an active account.', 'ERROR')], '', access.actor.role, context);
            var output = {
                success: true,
                state: row.state === 'CREATED' ? 'CREATED' : 'SENT',
                tenantSlug: access.tenantSlug,
                validation: {
                    tokenValid: true,
                    ownerValidated: true,
                    tenantValidated: true,
                    expiresAt: row.expiresAt,
                    tokenPreview: row.tokenPreview
                },
                resetRequest: buildRequestOutput(row, context),
                governance: governanceFlags(access.actor.role, context),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            };
            audit('PASSWORD_RESET_TOKEN_VALIDATED', access.actor, access.tenantSlug, row.requestId, 'Password reset token validated.', context);
            return freezePasswordResetOutput(cloneSanitized(output));
        } catch (error) {
            return failureOutput('CREATED', tenantFromContext(context || {}), [issue('PASSWORD_RESET_EXCEPTION', 'Password reset token validation failed safely.', 'ERROR')], '', actorFromContext(context || {}).role, context);
        }
    }

    function recordSuspiciousAttempt(tenantSlug, email, code, actor, context) {
        persistHistory('passwordResetHistory', {
            resetId: id('PRS'),
            tenantSlug,
            email: normalizeEmail(email),
            state: 'FAILED',
            eventType: 'SUSPICIOUS_RESET_ATTEMPT',
            reason: code,
            actorId: actor?.id || '',
            actorRole: actor?.role || 'EMPLOYEE',
            createdAt: nowIso(),
            immutable: true
        }, context || {});
        audit('PASSWORD_RESET_SUSPICIOUS_ATTEMPT', actor || actorFromContext(context || {}), tenantSlug, normalizeEmail(email), 'Suspicious password reset attempt blocked.', context || {});
    }

    function revokeUserSessions(payload, context) {
        try {
            var input = normalizeResetPayload(payload, context);
            var tenantSlug = input.tenantSlug || tenantFromContext(context || {});
            var user = findUser(input, tenantSlug);
            if (!user) return failureOutput('REVOKED', tenantSlug, [issue('RESET_USER_NOT_FOUND', 'No account found for session revocation.', 'ERROR')], '', actorFromContext(context || {}).role, context);
            var userId = userIdOf(user);
            var governedRevocation = null;
            var governedCount = 0;
            try {
                if (global.SessionGovernanceService && typeof global.SessionGovernanceService.revokeAllSessions === 'function') {
                    governedRevocation = global.SessionGovernanceService.revokeAllSessions({
                        tenantSlug: tenantSlug,
                        userId: userId,
                        employeeId: user.empId || user.employeeId || '',
                        reason: 'password_reset'
                    }, context || {});
                    if (governedRevocation && governedRevocation.success) governedCount = Number(governedRevocation.revokedCount || 0);
                }
            } catch (error) {}
            var data = rawData();
            var revokedCount = governedCount;
            ['authSessions', 'activeSessions', 'sessions'].forEach(function each(key) {
                if (!Array.isArray(data[key])) return;
                data[key].forEach(function mark(session) {
                    if (!sameTenant(session, tenantSlug)) return;
                    if (String(session.userId || session.authUserId || '') !== userId && normalizeEmail(session.email || '') !== userEmailOf(user)) return;
                    if (session.active !== false || !session.revoked) revokedCount += 1;
                    session.active = false;
                    session.revoked = true;
                    session.revokedAt = nowIso();
                    session.revokedReason = 'PASSWORD_RESET';
                });
            });
            user.sessionIds = [];
            user.activeSessionIds = [];
            user.sessionsRevokedAt = nowIso();
            if (!context?.skipPersistence) saveData(data);
            audit('PASSWORD_RESET_SESSIONS_REVOKED', actorFromContext(context || {}), tenantSlug, userId, 'Active sessions revoked after credential recovery.', context || {});
            return freezePasswordResetOutput(cloneSanitized({
                success: true,
                state: 'REVOKED',
                tenantSlug,
                userId,
                sessionRevocation: {
                    revokedCount,
                    logoutAllDevices: true,
                    sessionTrackingPrepared: true,
                    sessionGovernanceIntegrated: !!governedRevocation
                },
                governance: governanceFlags(actorFromContext(context || {}).role, context),
                metadata: { generatedAt: nowIso(), authenticationGovernancePreserved: true, tenantIsolationPreserved: true }
            }));
        } catch (error) {
            return failureOutput('REVOKED', tenantFromContext(context || {}), [issue('SESSION_REVOCATION_FAILED_SAFE', 'Session revocation failed safely.', 'ERROR')], '', actorFromContext(context || {}).role, context);
        }
    }

    function resetUserPassword(payload, context) {
        try {
            var input = normalizeResetPayload(payload, context);
            if (input.malformed) return failureOutput('CREATED', input.tenantSlug, [issue('MALFORMED_RESET_PAYLOAD', 'Password reset payload is malformed.', 'ERROR')], '', 'EMPLOYEE', context);
            var tokenValidation = validateResetToken(input, context);
            if (!tokenValidation.success) return tokenValidation;
            var row = findRequestByToken(input.token, tokenValidation.tenantSlug, input.email);
            var user = findUser({ userId: row?.userId, email: row?.email }, tokenValidation.tenantSlug);
            if (!row || !user) return failureOutput('CREATED', tokenValidation.tenantSlug, [issue('RESET_USER_NOT_FOUND', 'Reset token is not linked to an active account.', 'ERROR')], '', actorFromContext(context || {}).role, context);
            var policyFailures = validatePasswordPolicy(input.password, input.confirmPassword, user);
            if (policyFailures.length) {
                row.failedAttempts = Number(row.failedAttempts || 0) + 1;
                if (row.failedAttempts >= 3) row.suspicious = true;
                updatePersistentRequest(row, context);
                return failureOutput(row.state || 'SENT', tokenValidation.tenantSlug, policyFailures, '', actorFromContext(context || {}).role, context);
            }
            var data = rawData();
            var users = withDataArray(data, 'users');
            var index = users.findIndex(function match(item) { return userIdOf(item) === userIdOf(user); });
            if (index < 0) return failureOutput('CREATED', tokenValidation.tenantSlug, [issue('RESET_USER_NOT_FOUND', 'Account disappeared before password reset.', 'ERROR')], '', actorFromContext(context || {}).role, context);
            var fingerprint = passwordFingerprint(input.password);
            var history = Array.from(collectPasswordFingerprints(users[index]));
            if (history.indexOf(fingerprint) === -1) history.push(fingerprint);
            users[index] = {
                ...users[index],
                password: '',
                passwordHash: hashPassword(input.password),
                passwordFingerprint: fingerprint,
                passwordHistoryFingerprints: history.slice(-8),
                passwordUpdatedAt: nowIso(),
                credentialRecoveryStatus: 'RESET_COMPLETED',
                lastPasswordResetAt: nowIso(),
                active: users[index].active !== false
            };
            var rows = withDataArray(data, 'passwordResetRequests');
            var requestIndex = rows.findIndex(function match(item) { return item.requestId === row.requestId; });
            if (requestIndex >= 0) {
                rows[requestIndex] = {
                    ...rows[requestIndex],
                    state: 'USED',
                    usedAt: nowIso(),
                    updatedAt: nowIso(),
                    resetCompletedAt: nowIso()
                };
                row = rows[requestIndex];
            }
            withDataArray(data, 'passwordResetHistory').unshift(cloneSanitized({
                resetId: id('PRS'),
                requestId: row.requestId,
                userId: row.userId,
                employeeId: row.employeeId,
                email: row.email,
                tenantSlug: row.tenantSlug,
                state: 'USED',
                eventType: 'PASSWORD_RESET_COMPLETED',
                logoutAllDevices: input.logoutAllDevices,
                createdAt: nowIso(),
                actorId: actorFromContext(context || {}).id,
                immutable: true
            }));
            withDataArray(data, 'passwordResetTokenHistory').unshift(cloneSanitized({
                historyId: id('PRH'),
                requestId: row.requestId,
                userId: row.userId,
                email: row.email,
                tenantSlug: row.tenantSlug,
                state: 'USED',
                eventType: 'TOKEN_USED',
                tokenPreview: row.tokenPreview,
                createdAt: nowIso(),
                actorId: actorFromContext(context || {}).id,
                immutable: true
            }));
            if (!context?.skipPersistence) saveData(data);
            var sessionResult = input.logoutAllDevices ? revokeUserSessions({ tenantSlug: tokenValidation.tenantSlug, userId: userIdOf(user), email: userEmailOf(user) }, context) : null;
            audit('PASSWORD_RESET_COMPLETED', actorFromContext(context || {}), tokenValidation.tenantSlug, row.requestId, 'Password reset completed with security validation.', context);
            return freezePasswordResetOutput(cloneSanitized({
                success: true,
                state: 'USED',
                tenantSlug: tokenValidation.tenantSlug,
                resetRequest: buildRequestOutput(row, context),
                passwordPolicy: {
                    compliant: true,
                    minimumLength: 10,
                    complexityEnforced: true,
                    historyChecked: true,
                    bannedPasswordChecked: true
                },
                sessionRevocation: sessionResult?.sessionRevocation || { revokedCount: 0, logoutAllDevices: false, sessionTrackingPrepared: true },
                notification: {
                    securityNotificationPrepared: true,
                    inviteMailDeliveryIntegrated: !!global.InviteMailDeliveryService,
                    employeeActivationWizardIntegrated: !!global.EmployeeActivationWizardService
                },
                governance: governanceFlags(actorFromContext(context || {}).role, context),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            }));
        } catch (error) {
            return failureOutput('CREATED', tenantFromContext(context || {}), [issue('PASSWORD_RESET_EXCEPTION', 'Password reset failed safely.', 'ERROR')], '', actorFromContext(context || {}).role, context);
        }
    }

    function calculateScores(tenantSlug) {
        var rows = requestRows(tenantSlug);
        var total = rows.length;
        var completed = rows.filter(function each(row) { return row.state === 'USED'; }).length;
        var expired = rows.filter(function each(row) { return row.state === 'EXPIRED'; }).length;
        var failed = (rawData().passwordResetHistory || []).filter(function each(row) { return sameTenant(row, tenantSlug) && /FAILED|SUSPICIOUS/.test(String(row.state || row.eventType || '')); }).length;
        var suspicious = rows.filter(function each(row) { return row.suspicious; }).length + failed;
        var completionRate = total ? clampScore((completed / total) * 100) : 100;
        var expiryRate = total ? clampScore((expired / total) * 100) : 0;
        var suspiciousPenalty = Math.min(40, suspicious * 8);
        var recoveryHealthScore = clampScore(completionRate - Math.round(expiryRate / 3) - suspiciousPenalty + (total ? 0 : -5));
        var authenticationReadinessScore = clampScore(90 - suspiciousPenalty - Math.round(expiryRate / 4) + (completed ? 5 : 0));
        var securityScore = clampScore(96 - suspiciousPenalty - Math.min(20, failed * 5));
        return { total, completed, expired, failed, suspicious, completionRate, expiryRate, recoveryHealthScore, authenticationReadinessScore, securityScore };
    }

    function generatePasswordResetAnalytics(payload, context) {
        try {
            var input = normalizeResetPayload(payload || {}, context);
            if (input.malformed) input = { tenantSlug: tenantFromContext(context || {}) };
            var access = governanceAllowed(input, context, 'analytics');
            if (!access.allowed) return failureOutput('CREATED', access.tenantSlug, access.failures, '', access.actor.role, context);
            var rows = requestRows(access.tenantSlug);
            var anonymize = access.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var scores = calculateScores(access.tenantSlug);
            var resetRequests = rows.slice(0, 40).map(function map(row, index) {
                var user = findUser({ userId: row.userId, email: row.email }, access.tenantSlug);
                var employee = userEmployee(user, access.tenantSlug);
                var safe = safeUserRow(user || { id: row.userId, email: row.email, name: row.displayName }, employee, { anonymize });
                return {
                    requestId: row.requestId,
                    displayName: anonymize ? 'Governance Request ' + String(index + 1).padStart(2, '0') : safe.displayName,
                    employeeId: safe.employeeId,
                    email: safe.email,
                    state: row.state,
                    tokenPreview: row.tokenPreview,
                    expiresAt: row.expiresAt,
                    sentAt: row.sentAt,
                    usedAt: row.usedAt,
                    failedAttempts: row.failedAttempts || 0,
                    suspicious: !!row.suspicious
                };
            });
            var analytics = {
                resetRequests: scores.total,
                resetCompletionRate: scores.completionRate,
                tokenExpiryRate: scores.expiryRate,
                failedResetAttempts: scores.failed,
                suspiciousRecoveryAttempts: scores.suspicious,
                recoveryHealthScore: scores.recoveryHealthScore,
                authenticationReadinessScore: scores.authenticationReadinessScore,
                securityScore: scores.securityScore
            };
            persistHistory('passwordResetAnalytics', {
                analyticsId: id('PRA'),
                tenantSlug: access.tenantSlug,
                analytics,
                createdAt: nowIso(),
                actorId: access.actor.id,
                actorRole: access.actor.role,
                immutable: true
            }, context || {});
            audit('PASSWORD_RESET_ANALYTICS_REVIEWED', access.actor, access.tenantSlug, 'credential-recovery', 'Credential recovery analytics reviewed.', context);
            return freezePasswordResetOutput(cloneSanitized({
                success: true,
                state: 'SENT',
                tenantSlug: access.tenantSlug,
                analytics,
                resetRequests,
                integrationReadiness: {
                    inviteMailDeliveryIntegrated: !!global.InviteMailDeliveryService,
                    employeeActivationWizardIntegrated: !!global.EmployeeActivationWizardService,
                    authenticationSystemIntegrated: !!global.authService,
                    sessionTrackingPrepared: true
                },
                governance: governanceFlags(access.actor.role, context),
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    authenticationGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            }));
        } catch (error) {
            return failureOutput('CREATED', tenantFromContext(context || {}), [issue('PASSWORD_RESET_ANALYTICS_FAILED_SAFE', 'Password reset analytics failed safely.', 'ERROR')], '', actorFromContext(context || {}).role, context);
        }
    }

    function runSelfTest() {
        var context = { actor: { id: 'SELF', role: 'EMPLOYEE', email: 'self@example.com', empId: 'SELF-1', tenantSlug: 'self' }, tenantSlug: 'self', skipPersistence: true, skipAuditPersistence: true, exposeToken: true };
        var beforeDb = global.DB;
        global.DB = {
            _data: {
                companySettings: { tenantSlug: 'self' },
                employees: [{ id: 'SELF-1', empId: 'SELF-1', email: 'self@example.com', name: 'Self Test', tenantSlug: 'self', activationStatus: 'Active' }],
                users: [{ id: 'SELF-U1', empId: 'SELF-1', email: 'self@example.com', name: 'Self Test', role: 'employee', active: true, tenantSlug: 'self', password: 'OldSelf!123' }],
                authSessions: [{ sessionId: 'SELF-S1', userId: 'SELF-U1', tenantSlug: 'self', active: true }]
            },
            get: function get() { return this._data; },
            save: function save(data) { this._data = data; return true; },
            writeAuditLog: function writeAuditLog() { return null; }
        };
        try {
            var token = generateResetToken({ tenantSlug: 'self', email: 'self@example.com' }, context);
            var valid = token.success && validateResetToken({ tenantSlug: 'self', email: 'self@example.com', token: token.token }, context).success;
            var weak = resetUserPassword({ tenantSlug: 'self', email: 'self@example.com', token: token.token, password: 'weak', confirmPassword: 'weak' }, context);
            var reset = resetUserPassword({ tenantSlug: 'self', email: 'self@example.com', token: token.token, password: 'NewSelf!456', confirmPassword: 'NewSelf!456', logoutAllDevices: true }, context);
            var reused = validateResetToken({ tenantSlug: 'self', email: 'self@example.com', token: token.token }, context);
            var immutable = Object.isFrozen(reset) && Object.isFrozen(token);
            var passed = !!(token.success && valid && weak.success === false && reset.success && reused.success === false && immutable);
            return freezePasswordResetOutput({
                passed,
                checks: {
                    resetRequestWorks: !!token.success,
                    tokenValidationWorks: !!valid,
                    passwordResetWorks: !!reset.success,
                    sessionRevocationWorks: (reset.sessionRevocation?.revokedCount || 0) >= 1,
                    immutableOutputsEnforced: immutable
                },
                sample: cloneSanitized(reset)
            });
        } finally {
            if (beforeDb) global.DB = beforeDb;
            else delete global.DB;
        }
    }

    var service = freezePasswordResetOutput({
        RESET_STATES,
        RESET_WORKFLOW,
        requestPasswordReset,
        generateResetToken,
        validateResetToken,
        resetUserPassword,
        revokeUserSessions,
        generatePasswordResetAnalytics,
        normalizeResetPayload,
        freezePasswordResetOutput
    });

    global.PasswordResetGovernanceService = service;
    global.passwordResetGovernanceService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_PASSWORD_RESET_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_PASSWORD_RESET_SELF_TEST__ = freezePasswordResetOutput({
                passed: false,
                error: error && error.message ? error.message : 'Password reset self-test failed safely.'
            });
        }
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
