(function attachInviteMailDeliveryService(global) {
    'use strict';

    var INVITATION_STATES = Object.freeze([
        'CREATED',
        'QUEUED',
        'SENT',
        'DELIVERED',
        'OPENED',
        'ACTIVATED',
        'COMPLETED',
        'FAILED',
        'EXPIRED',
        'CANCELLED',
        'ARCHIVED'
    ]);
    var INVITATION_LIFECYCLE = Object.freeze(['CREATED', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'ACTIVATED', 'COMPLETED']);
    var DELIVERY_PROVIDERS = Object.freeze(['SMTP', 'SENDGRID', 'AMAZON_SES', 'MICROSOFT_GRAPH', 'DEVELOPMENT_LOCAL']);
    var TERMINAL_STATES = Object.freeze(['ACTIVATED', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED', 'ARCHIVED']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|aadhaar|pan|ssn|password|secret|tokenHash|rawPayload|document|medical|benefit/i;
    var volatileInvitationRecords = [];

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
        } catch (error) {
            return false;
        }
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function addHours(iso, hours) {
        var start = iso ? new Date(iso) : new Date();
        return new Date(start.getTime() + (Number(hours || 0) * 60 * 60 * 1000)).toISOString();
    }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeRole(value) {
        var role = normalizeText(value || 'HR').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'HRHEAD') role = 'HR_HEAD';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        return role;
    }

    function normalizeTenantSlug(value) {
        return normalizeText(value).toLowerCase().replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeEmail(value) {
        try {
            if (db() && typeof db().normalizeEmail === 'function') return db().normalizeEmail(value);
        } catch (error) {}
        return normalizeText(value).toLowerCase();
    }

    function normalizeEmployeeId(value) {
        return normalizeText(value || '').toUpperCase();
    }

    function isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
    }

    function isActivatedStatus(value) {
        var state = normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return state === 'ACTIVE' || state === 'ACTIVATED' || state === 'COMPLETED';
    }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function freezeInvitationOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeInvitationOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Reflect.ownKeys(value).forEach(function each(key) {
                var descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                Object.defineProperty(clone, key, {
                    enumerable: descriptor.enumerable,
                    configurable: false,
                    writable: false,
                    value: freezeInvitationOutput(descriptor.value)
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
        return freezeInvitationOutput({
            code: code,
            message: message,
            severity: severity || 'ERROR',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function tenantFromContext(context) {
        return normalizeTenantSlug(
            context?.tenantSlug ||
            context?.tenantId ||
            context?.companyId ||
            context?.actor?.tenantSlug ||
            context?.actor?.tenantId ||
            rawData()?.companySettings?.tenantSlug ||
            rawData()?.companySettings?.tenantId ||
            ''
        );
    }

    function actorFromContext(context) {
        var actor = context?.actor || {};
        return {
            id: normalizeText(actor.id || actor.empId || context?.actorId || 'system'),
            role: normalizeRole(actor.role || context?.actorRole || context?.role || 'HR')
        };
    }

    function withDataArray(data, key) {
        if (!Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function persistHistory(key, row, context) {
        try {
            if (context?.skipPersistence) return false;
            var data = rawData();
            withDataArray(data, key).push(Object.freeze({ ...cloneSanitized(row || {}) }));
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function persistInvitation(row, context) {
        try {
            if (context?.skipPersistence) {
                var volatileClean = cloneSanitized(row || {});
                var volatileIndex = volatileInvitationRecords.findIndex(function match(item) {
                    return item.invitationId === volatileClean.invitationId || item.id === volatileClean.invitationId || (item.token && volatileClean.token && item.token === volatileClean.token);
                });
                if (volatileIndex >= 0) volatileInvitationRecords[volatileIndex] = { ...volatileInvitationRecords[volatileIndex], ...volatileClean, updatedAt: nowIso() };
                else volatileInvitationRecords.unshift(volatileClean);
                return volatileClean;
            }
            if (context?.skipPersistence) return row;
            var data = rawData();
            var invitations = withDataArray(data, 'employeeInvitationRecords');
            var clean = cloneSanitized(row || {});
            var index = invitations.findIndex(function match(item) {
                return item.invitationId === clean.invitationId || item.id === clean.invitationId || (item.token && clean.token && item.token === clean.token);
            });
            if (index >= 0) invitations[index] = { ...invitations[index], ...clean, updatedAt: nowIso() };
            else invitations.unshift(clean);
            saveData(data);
            return clean;
        } catch (error) {
            return row;
        }
    }

    function invitationRows() {
        var data = rawData();
        var persisted = Array.isArray(data.employeeInvitationRecords) ? data.employeeInvitationRecords : [];
        return persisted.concat(volatileInvitationRecords);
    }

    function integrationHealth() {
        return freezeInvitationOutput({
            authInviteAdapterAvailable: !!(global.authInviteService && typeof global.authInviteService.sendInvite === 'function'),
            employeeBulkImportIntegrated: !!(global.EmployeeBulkImportService && typeof global.EmployeeBulkImportService.generateImportPreview === 'function'),
            excelValidationIntegrated: !!(global.ExcelValidationService && typeof global.ExcelValidationService.generateValidationReport === 'function'),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService),
            auditIntegrated: !!(global.AuditService && typeof global.AuditService.recordAudit === 'function'),
            telemetryIntegrated: !!(global.WorkflowTelemetryService && (typeof global.WorkflowTelemetryService.emitTelemetry === 'function' || typeof global.WorkflowTelemetryService.emitImportTelemetry === 'function')),
            providerAbstractionReady: true
        });
    }

    function integrationReadiness() {
        return freezeInvitationOutput({
            employeeActivationWizardPrepared: true,
            managerHierarchyVisualizerPrepared: true,
            departmentSetupFlowPrepared: true,
            organizationInitializationWizardPrepared: true,
            smtpProviderPrepared: true,
            sendGridProviderPrepared: true,
            amazonSesProviderPrepared: true,
            microsoftGraphProviderPrepared: true
        });
    }

    function auditInvitation(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: id('AUD-INVITE'),
                    type: actionType,
                    actionType: actionType,
                    module: 'Invite Mail Delivery',
                    targetId: clean.invitationId || clean.deliveryId || clean.analyticsId || '',
                    tenantSlug: clean.tenantSlug || tenantFromContext(context || {}),
                    metadata: clean,
                    createdAt: nowIso()
                }, {
                    actor: actor,
                    tenantSlug: clean.tenantSlug || tenantFromContext(context || {})
                });
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Invite Mail Delivery', clean.invitationId || clean.deliveryId || clean.analyticsId || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context?.skipTelemetry) return false;
            var telemetry = global.WorkflowTelemetryService;
            if (!telemetry) return false;
            if (typeof telemetry.emitImportTelemetry === 'function') {
                telemetry.emitImportTelemetry(eventType, cloneSanitized(metadata || {}));
                return true;
            }
            if (typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('INVITATION', eventType, cloneSanitized(metadata || {}));
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function randomBytes(length) {
        var size = length || 32;
        try {
            var cryptoObj = global.crypto;
            if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
                var bytes = new Uint8Array(size);
                cryptoObj.getRandomValues(bytes);
                return Array.prototype.slice.call(bytes);
            }
        } catch (error) {}
        try {
            if (typeof require === 'function') {
                return Array.prototype.slice.call(require('node:crypto').randomBytes(size));
            }
        } catch (error) {}
        var fallback = [];
        for (var i = 0; i < size; i += 1) fallback.push(Math.floor(Math.random() * 256));
        return fallback;
    }

    function base64Url(bytes) {
        var binary = '';
        bytes.forEach(function each(byte) { binary += String.fromCharCode(byte); });
        try {
            if (typeof btoa === 'function') return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        } catch (error) {}
        try {
            if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
        } catch (error) {}
        return bytes.map(function hex(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }

    function generateInvitationToken(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var employeeId = normalizeEmployeeId(source.employeeId || source.empId || source.employeeIdNumber || source.id);
            var email = normalizeEmail(source.email);
            if (!tenantSlug) {
                return failureOutput('TOKEN_GENERATION_BLOCKED', '', [issue('TENANT_SCOPE_REQUIRED', 'Invitation token generation requires a tenant scope.', 'CRITICAL')]);
            }
            var token = 'ivt_' + base64Url(randomBytes(36));
            return freezeInvitationOutput({
                success: true,
                token: token,
                tokenPreview: token.slice(0, 12) + '...',
                tenantSlug: tenantSlug,
                employeeId: employeeId,
                email: email,
                singleUse: true,
                generatedAt: nowIso(),
                expiresAt: addHours(nowIso(), Number(source.expiresInHours || 72))
            });
        } catch (error) {
            return failureOutput('TOKEN_GENERATION_FAILED_SAFE', tenantFromContext(context || {}), [issue('TOKEN_GENERATION_FAILED_SAFE', 'Invitation token generation failed safely.', 'ERROR')]);
        }
    }

    function tenantRecordValue(record) {
        return normalizeTenantSlug(record?.tenantSlug || record?.tenantId || record?.companyId || '');
    }

    function employeeTenant(record) {
        return tenantRecordValue(record);
    }

    function employeesForTenant(tenantSlug) {
        return (rawData().employees || []).filter(function sameTenant(emp) {
            return employeeTenant(emp) === tenantSlug;
        });
    }

    function findEmployeeInTenant(employeeId, email, tenantSlug) {
        var targetId = normalizeEmployeeId(employeeId);
        var targetEmail = normalizeEmail(email);
        return employeesForTenant(tenantSlug).find(function match(emp) {
            return (targetId && normalizeEmployeeId(emp.id || emp.empId || emp.employeeId) === targetId) ||
                (targetEmail && normalizeEmail(emp.email) === targetEmail);
        }) || null;
    }

    function existsEmployeeOutsideTenant(employeeId, email, tenantSlug) {
        var targetId = normalizeEmployeeId(employeeId);
        var targetEmail = normalizeEmail(email);
        return (rawData().employees || []).some(function match(emp) {
            var rowTenant = employeeTenant(emp);
            if (!rowTenant || rowTenant === tenantSlug) return false;
            return (targetId && normalizeEmployeeId(emp.id || emp.empId || emp.employeeId) === targetId) ||
                (targetEmail && normalizeEmail(emp.email) === targetEmail);
        });
    }

    function validateScope(source, context, action) {
        var failures = [];
        var actor = actorFromContext(context || {});
        var contextTenant = tenantFromContext(context || {});
        var payloadTenant = normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || contextTenant);
        var role = actor.role;
        var writeAction = ['CREATE', 'SEND', 'RESEND', 'CANCEL', 'BULK'].includes(action);
        if (!payloadTenant) failures.push(issue('TENANT_SCOPE_REQUIRED', 'Employee invitation governance requires a tenant scope.', 'CRITICAL'));
        if (contextTenant && payloadTenant && contextTenant !== payloadTenant) {
            failures.push(issue('CROSS_TENANT_INVITATION_BLOCKED', 'Tenant-scoped invitations cannot cross tenant boundaries.', 'CRITICAL', { contextTenant: contextTenant, payloadTenant: payloadTenant }));
        }
        if (role === 'EMPLOYEE' || role === 'MANAGER' || role === 'SUPER_ADMIN') {
            failures.push(issue('ROLE_INVITATION_ACCESS_BLOCKED', 'This role cannot access invitation governance.', 'CRITICAL', { role: role }));
        }
        if (role === 'PLATFORM_OWNER' && writeAction) {
            failures.push(issue('PLATFORM_OWNER_VISIBILITY_ONLY', 'PLATFORM_OWNER can review invitation governance but cannot create, send, resend, or cancel tenant invitations.', 'CRITICAL'));
        }
        if ((action === 'REVIEW' || action === 'ANALYTICS') && role === 'PLATFORM_OWNER' && !context?.governanceOnly) {
            failures.push(issue('PLATFORM_OWNER_GOVERNANCE_SCOPE_REQUIRED', 'PLATFORM_OWNER invitation visibility must be requested as governance-only.', 'HIGH'));
        }
        if ((action === 'CREATE' || action === 'SEND' || action === 'RESEND' || action === 'CANCEL' || action === 'BULK') && role !== 'HR') {
            failures.push(issue('HR_INVITATION_ACTION_REQUIRED', 'Only HR can create, send, resend, cancel, or bulk queue employee invitations.', 'HIGH', { role: role }));
        }
        return {
            actor: actor,
            tenantSlug: payloadTenant,
            failures: failures,
            reviewOnly: action === 'REVIEW' || context?.reviewOnly === true,
            platformOwnerVisibilityOnly: role === 'PLATFORM_OWNER'
        };
    }

    function normalizeInvitePayload(input, context, action) {
        var source = input && typeof input === 'object' ? cloneSanitized(input) : {};
        var scope = validateScope(source, context || {}, action || 'CREATE');
        var employeeId = normalizeEmployeeId(source.employeeId || source.empId || source.employeeIdNumber || source.id);
        var email = normalizeEmail(source.email);
        var employee = findEmployeeInTenant(employeeId, email, scope.tenantSlug);
        if (employee) {
            employeeId = normalizeEmployeeId(employee.id || employee.empId || employee.employeeId || employeeId);
            email = normalizeEmail(email || employee.email);
        }
        var name = normalizeText(source.name || source.fullName || employee?.name || [source.firstName, source.lastName].filter(Boolean).join(' ') || email);
        var role = normalizeText(source.role || employee?.role || 'employee').toLowerCase();
        var expiresAt = source.expiresAt || addHours(nowIso(), Number(source.expiresInHours || 72));
        var failures = scope.failures.slice();
        if (!email || !isEmail(email)) failures.push(issue('INVALID_INVITATION_EMAIL', 'Employee invitation requires a valid email address.', 'ERROR'));
        if (existsEmployeeOutsideTenant(employeeId, email, scope.tenantSlug)) {
            failures.push(issue('CROSS_TENANT_INVITATION_BLOCKED', 'Invitation target belongs to another tenant scope.', 'CRITICAL', { tenantSlug: scope.tenantSlug }));
            email = email && employee ? email : 'TENANT_ISOLATED_EMAIL';
            employeeId = employeeId && employee ? employeeId : 'TENANT_ISOLATED_EMPLOYEE_ID';
        }
        if (!employee && employeeId && !existsEmployeeOutsideTenant(employeeId, email, scope.tenantSlug) && source.requireEmployee !== false) {
            failures.push(issue('INVITATION_EMPLOYEE_NOT_FOUND', 'Invitation target must exist inside the selected tenant before delivery.', 'ERROR', { employeeId: employeeId }));
        }
        if (employee && (employee.authUserId || isActivatedStatus(employee.activationStatus) || isActivatedStatus(employee.inviteStatus))) {
            failures.push(issue('EMPLOYEE_ALREADY_ACTIVE', 'Active employees cannot receive onboarding activation invitations.', 'ERROR', { employeeId: employeeId }));
        }
        return {
            tenantSlug: scope.tenantSlug,
            actor: scope.actor,
            employeeId: employeeId,
            email: email,
            name: name,
            role: role,
            expiresAt: expiresAt,
            metadata: cloneSanitized(source.metadata || {}),
            source: source,
            employee: employee,
            failures: failures,
            governance: {
                reviewOnly: scope.reviewOnly,
                platformOwnerVisibilityOnly: scope.platformOwnerVisibilityOnly,
                tenantIsolationPreserved: failures.every(function notCrossTenant(failure) { return failure.code !== 'CROSS_TENANT_INVITATION_BLOCKED'; }),
                invitationGovernancePreserved: true,
                noActiveUserCreation: true,
                noWorkflowExecution: true
            }
        };
    }

    function activeInvitationExists(employeeId, email, tenantSlug) {
        var targetId = normalizeEmployeeId(employeeId);
        var targetEmail = normalizeEmail(email);
        return invitationRows().some(function active(row) {
            if (normalizeTenantSlug(row.tenantSlug) !== tenantSlug) return false;
            if (TERMINAL_STATES.includes(String(row.state || row.status || '').toUpperCase())) return false;
            return (targetId && normalizeEmployeeId(row.employeeId || row.empId) === targetId) ||
                (targetEmail && normalizeEmail(row.email) === targetEmail);
        });
    }

    function activationUrlFor(invitation, source) {
        var base = normalizeText(source.activationBaseUrl || source.redirectTo || global.location?.origin || 'auth-callback.html');
        if (!/auth-callback\.html|activation|invite/i.test(base)) {
            base = base.replace(/\/$/, '') + '/auth-callback.html';
        }
        var separator = base.indexOf('?') >= 0 ? '&' : '?';
        return base + separator + 'token=' + encodeURIComponent(invitation.token) + '&tenant=' + encodeURIComponent(invitation.tenantSlug);
    }

    function lifecycleEvent(state, metadata) {
        return freezeInvitationOutput({
            state: state,
            at: nowIso(),
            metadata: cloneSanitized(metadata || {})
        });
    }

    function failureOutput(state, tenantSlug, failures, description) {
        return freezeInvitationOutput({
            success: false,
            state: state || 'FAILED',
            tenantSlug: tenantSlug || '',
            failures: failures || [],
            description: description || 'Invitation governance blocked safely.',
            noActiveUserCreation: true,
            noWorkflowExecution: true,
            metadata: {
                tenantIsolationPreserved: !(failures || []).some(function cross(failure) { return failure.code === 'CROSS_TENANT_INVITATION_BLOCKED' || failure.code === 'CROSS_TENANT_ACTIVATION_BLOCKED'; }),
                invitationGovernancePreserved: true
            },
            generatedAt: nowIso()
        });
    }

    function createEmployeeInvite(input, context) {
        try {
            var normalized = normalizeInvitePayload(input || {}, context || {}, 'CREATE');
            if (normalized.failures.length) {
                auditInvitation('INVITATION_CREATION_BLOCKED', { tenantSlug: normalized.tenantSlug, failures: normalized.failures, description: 'Invitation creation blocked.' }, context || {});
                return failureOutput('CREATION_BLOCKED', normalized.tenantSlug, normalized.failures, 'Invitation creation blocked.');
            }
            if (activeInvitationExists(normalized.employeeId, normalized.email, normalized.tenantSlug)) {
                var duplicateFailure = issue('DUPLICATE_ACTIVE_INVITATION', 'An active invitation already exists for this employee or email.', 'ERROR', { employeeId: normalized.employeeId });
                return failureOutput('CREATION_BLOCKED', normalized.tenantSlug, [duplicateFailure], 'Duplicate active invitation blocked.');
            }
            var tokenResult = generateInvitationToken({
                tenantSlug: normalized.tenantSlug,
                employeeId: normalized.employeeId,
                email: normalized.email,
                expiresAt: normalized.expiresAt
            }, context || {});
            if (!tokenResult.success) return tokenResult;
            var invitationId = id('INVITE');
            var invitation = {
                invitationId: invitationId,
                id: invitationId,
                tenantSlug: normalized.tenantSlug,
                employeeId: normalized.employeeId,
                email: normalized.email,
                name: normalized.name,
                role: normalized.role,
                state: 'CREATED',
                status: 'CREATED',
                deliveryStatus: 'PENDING',
                token: tokenResult.token,
                tokenPreview: tokenResult.tokenPreview,
                singleUse: true,
                used: false,
                activationUrl: '',
                expiresAt: normalized.expiresAt || tokenResult.expiresAt,
                metadata: normalized.metadata,
                lifecycle: [lifecycleEvent('CREATED', { actorId: normalized.actor.id })],
                createdBy: normalized.actor.id,
                createdByRole: normalized.actor.role,
                createdAt: nowIso(),
                updatedAt: nowIso()
            };
            invitation.activationUrl = activationUrlFor(invitation, normalized.source || {});
            persistInvitation(invitation, context || {});
            persistHistory('invitationDeliveryLogs', {
                deliveryId: id('DELIVERY'),
                invitationId: invitationId,
                tenantSlug: normalized.tenantSlug,
                employeeId: normalized.employeeId,
                email: normalized.email,
                state: 'CREATED',
                status: 'CREATED',
                provider: 'NOT_SENT',
                createdAt: nowIso(),
                immutable: true
            }, context || {});
            trackInviteConversion(invitation, 'CREATED', context || {}, { occurredAt: invitation.createdAt });
            auditInvitation('INVITATION_CREATED', { invitationId: invitationId, tenantSlug: normalized.tenantSlug, description: 'Employee invitation created.' }, context || {});
            emitTelemetry('INVITATION_CREATED', { invitationId: invitationId, tenantSlug: normalized.tenantSlug }, context || {});
            return freezeInvitationOutput({
                success: true,
                state: 'CREATED',
                tenantSlug: normalized.tenantSlug,
                invitation: invitation,
                governance: normalized.governance,
                integrationHealth: integrationHealth(),
                integrationReadiness: integrationReadiness(),
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('CREATION_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_CREATION_FAILED_SAFE', 'Invitation creation failed safely.', 'ERROR')]);
        }
    }

    function findInvitationByIdOrToken(input, tenantSlug) {
        var invitationId = normalizeText(input?.invitationId || input?.inviteId || input?.id);
        var token = normalizeText(input?.token);
        return invitationRows().find(function match(row) {
            if (tenantSlug && normalizeTenantSlug(row.tenantSlug) !== tenantSlug) return false;
            return (invitationId && (row.invitationId === invitationId || row.id === invitationId)) || (token && row.token === token);
        }) || null;
    }

    function providerFromContext(context) {
        var adapter = context?.providerAdapter || context?.deliveryProvider || null;
        if (adapter && typeof adapter.send === 'function') return adapter;
        return {
            provider: 'DEVELOPMENT_LOCAL',
            send: function send(message) {
                return { ok: true, providerMessageId: 'DEV-' + base64Url(randomBytes(10)), message: 'Development local invite queued.', messagePreview: message.subject };
            }
        };
    }

    function trackNotificationDelivery(invitation, state, context, metadata) {
        if (context && context.skipDeliveryTracking) return null;
        try {
            var service = global.NotificationDeliveryTrackingService || global.notificationDeliveryTrackingService;
            if (!service || typeof service.trackNotificationDelivery !== 'function') return null;
            var details = metadata && typeof metadata === 'object' ? metadata : {};
            var mappedState = state === 'ACTIVATED' || state === 'COMPLETED' ? 'ACKNOWLEDGED' : state;
            return service.trackNotificationDelivery({
                notificationId: invitation.invitationId,
                tenantSlug: invitation.tenantSlug,
                channel: 'EMAIL',
                state: mappedState,
                recipientId: invitation.employeeId,
                recipient: invitation.email,
                source: 'INVITE_DELIVERY',
                correlationId: invitation.invitationId,
                providerEventId: details.providerEventId || 'INVITE-' + mappedState + '-' + invitation.invitationId,
                occurredAt: details.occurredAt || nowIso(),
                errorCode: details.errorCode || '',
                message: details.message || ''
            }, { ...(context || {}) });
        } catch (error) { return null; }
    }

    function trackInviteConversion(invitation, state, context, metadata) {
        if (context && context.skipInviteAcceptanceTracking) return null;
        try {
            var service = global.InviteAcceptanceTrackingService || global.inviteAcceptanceTrackingService;
            if (!service || typeof service.trackInviteAcceptance !== 'function') return null;
            var stateMap = {
                CREATED: 'INVITE_CREATED', SENT: 'INVITE_SENT', DELIVERED: 'INVITE_DELIVERED',
                OPENED: 'INVITE_OPENED', ACTIVATED: 'EMPLOYEE_ACTIVE', COMPLETED: 'EMPLOYEE_ACTIVE',
                FAILED: 'FAILED', EXPIRED: 'EXPIRED', CANCELLED: 'CANCELLED'
            };
            var mappedState = stateMap[String(state || '').toUpperCase()];
            if (!mappedState) return null;
            var details = metadata && typeof metadata === 'object' ? metadata : {};
            return service.trackInviteAcceptance({
                invitationId: invitation.invitationId,
                tenantSlug: invitation.tenantSlug,
                employeeId: invitation.employeeId,
                state: mappedState,
                source: 'INVITE_DELIVERY',
                providerEventId: details.providerEventId || 'INVITE-CONVERSION-' + mappedState + '-' + invitation.invitationId,
                occurredAt: details.occurredAt || nowIso(),
                lateConfirmation: details.lateConfirmation === true,
                allowSkippedTransitions: details.allowSkippedTransitions === true
            }, { ...(context || {}), source: 'INVITE_DELIVERY' });
        } catch (error) { return null; }
    }

    function sendWithProvider(invitation, context) {
        var adapter = providerFromContext(context || {});
        var provider = normalizeText(adapter.provider || adapter.name || 'DEVELOPMENT_LOCAL').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (!DELIVERY_PROVIDERS.includes(provider)) provider = 'DEVELOPMENT_LOCAL';
        try {
            var result = adapter.send({
                to: invitation.email,
                subject: 'Activate your ARTHHRMS account',
                activationUrl: invitation.activationUrl,
                tenantSlug: invitation.tenantSlug,
                invitationId: invitation.invitationId
            });
            if (result && typeof result.then === 'function') {
                return { provider: provider, ok: false, deferred: true, error: 'Async provider delivery is not supported in this synchronous governance surface.' };
            }
            if (result && result.ok === false) return { provider: provider, ok: false, error: result.error || result.message || 'Provider rejected invite.' };
            return { provider: provider, ok: true, result: cloneSanitized(result || {}) };
        } catch (error) {
            return { provider: provider, ok: false, error: error && error.message || String(error) };
        }
    }

    function updateInvitation(row, fields, context) {
        var next = {
            ...(row || {}),
            ...(fields || {}),
            updatedAt: nowIso()
        };
        persistInvitation(next, context || {});
        return next;
    }

    function sendEmployeeInvite(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var normalized = normalizeInvitePayload(source, context || {}, 'SEND');
            if (normalized.failures.length) {
                auditInvitation('INVITATION_SEND_BLOCKED', { tenantSlug: normalized.tenantSlug, failures: normalized.failures, description: 'Invitation send blocked.' }, context || {});
                return failureOutput('SEND_BLOCKED', normalized.tenantSlug, normalized.failures, 'Invitation send blocked.');
            }
            var existing = findInvitationByIdOrToken(source, normalized.tenantSlug);
            var createResult = null;
            if (!existing) {
                createResult = createEmployeeInvite(source, context || {});
                if (!createResult.success) return createResult;
                existing = createResult.invitation;
            }
            if (TERMINAL_STATES.includes(String(existing.state || '').toUpperCase())) {
                return failureOutput('SEND_BLOCKED', normalized.tenantSlug, [issue('INVITATION_TERMINAL_STATE', 'Terminal invitations cannot be sent or resent.', 'ERROR', { state: existing.state })]);
            }
            var queued = updateInvitation(existing, {
                state: 'QUEUED',
                status: 'QUEUED',
                deliveryStatus: 'QUEUED',
                lifecycle: (existing.lifecycle || []).concat([lifecycleEvent('QUEUED', { actorId: normalized.actor.id })])
            }, context || {});
            trackNotificationDelivery(queued, 'QUEUED', context || {});
            trackNotificationDelivery(queued, 'PROCESSING', context || {}, { providerEventId: 'INVITE-PROCESSING-' + queued.invitationId });
            var delivery = sendWithProvider(queued, context || {});
            var deliveryId = id('DELIVERY');
            var sentAt = nowIso();
            var nextState = delivery.ok ? 'SENT' : 'FAILED';
            var updated = updateInvitation(queued, {
                state: nextState,
                status: nextState,
                deliveryStatus: delivery.ok ? 'SENT' : 'FAILED',
                provider: delivery.provider,
                providerMessageId: delivery.result?.providerMessageId || '',
                sentAt: delivery.ok ? sentAt : '',
                failureReason: delivery.ok ? '' : delivery.error,
                lifecycle: (queued.lifecycle || []).concat([lifecycleEvent(nextState, { provider: delivery.provider, deliveryId: deliveryId })])
            }, context || {});
            var log = {
                deliveryId: deliveryId,
                invitationId: updated.invitationId,
                tenantSlug: updated.tenantSlug,
                employeeId: updated.employeeId,
                email: updated.email,
                provider: delivery.provider,
                status: delivery.ok ? 'SENT' : 'FAILED',
                state: nextState,
                providerMessageId: delivery.result?.providerMessageId || '',
                failureReason: delivery.ok ? '' : delivery.error,
                sentAt: delivery.ok ? sentAt : '',
                createdAt: sentAt,
                immutable: true
            };
            persistHistory('invitationDeliveryLogs', log, context || {});
            trackNotificationDelivery(updated, nextState, context || {}, {
                providerEventId: deliveryId,
                occurredAt: sentAt,
                errorCode: delivery.ok ? '' : 'INVITATION_DELIVERY_FAILED',
                message: delivery.ok ? '' : delivery.error
            });
            trackInviteConversion(updated, nextState, context || {}, { providerEventId: deliveryId, occurredAt: sentAt });
            auditInvitation(delivery.ok ? 'INVITATION_SENT' : 'INVITATION_FAILED', { ...log, description: delivery.ok ? 'Employee invitation sent.' : 'Employee invitation delivery failed.' }, context || {});
            emitTelemetry(delivery.ok ? 'INVITATION_SENT' : 'INVITATION_FAILED', log, context || {});
            return freezeInvitationOutput({
                success: delivery.ok,
                state: nextState,
                tenantSlug: updated.tenantSlug,
                invitation: updated,
                delivery: log,
                providerResult: delivery.result || {},
                failures: delivery.ok ? [] : [issue('INVITATION_DELIVERY_FAILED', delivery.error || 'Invitation delivery failed.', 'ERROR')],
                governance: normalized.governance,
                integrationHealth: integrationHealth(),
                integrationReadiness: integrationReadiness(),
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('SEND_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_SEND_FAILED_SAFE', 'Invitation send failed safely.', 'ERROR')]);
        }
    }

    function createBulkInvites(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var scope = validateScope(source, context || {}, 'BULK');
            if (scope.failures.length) {
                auditInvitation('INVITATION_BULK_BLOCKED', { tenantSlug: scope.tenantSlug, failures: scope.failures, description: 'Bulk invitation blocked.' }, context || {});
                return failureOutput('BULK_BLOCKED', scope.tenantSlug, scope.failures, 'Bulk invitation blocked.');
            }
            var employees = Array.isArray(source.employees) ? source.employees : [];
            if (!employees.length && source.inviteAllValidEmployees) {
                employees = employeesForTenant(scope.tenantSlug).filter(function eligible(emp) {
                    return !(emp.authUserId || isActivatedStatus(emp.activationStatus) || isActivatedStatus(emp.inviteStatus));
                });
            }
            var created = [];
            var failures = [];
            var failedRows = 0;
            employees.forEach(function each(row, index) {
                var employeeId = row.employeeId || row.empId || row.id;
                if (existsEmployeeOutsideTenant(employeeId, row.email, scope.tenantSlug)) {
                    failedRows += 1;
                    failures.push(issue('CROSS_TENANT_INVITATION_BLOCKED', 'Invitation target belongs to another tenant scope.', 'CRITICAL', { rowNumber: index + 1 }));
                    return;
                }
                var result = createEmployeeInvite({
                    ...row,
                    tenantSlug: scope.tenantSlug,
                    employeeId: employeeId,
                    requireEmployee: row.requireEmployee
                }, context || {});
                if (result.success) created.push(result.invitation);
                else {
                    failedRows += 1;
                    (result.failures || []).forEach(function eachFailure(failure) { failures.push(freezeInvitationOutput({ ...failure, rowNumber: index + 1 })); });
                }
            });
            var summary = {
                totalRows: employees.length,
                created: created.length,
                failed: failedRows,
                stagedBatches: Math.ceil(Math.max(1, created.length) / Math.max(1, Number(source.batchSize || 25))),
                invitationReadinessScore: employees.length ? Math.max(0, Math.round(created.length / employees.length * 100)) : 0,
                deliveryScore: 0
            };
            var batch = {
                batchId: id('INVITE-BATCH'),
                tenantSlug: scope.tenantSlug,
                mode: source.mode || (source.inviteAllValidEmployees ? 'all_valid' : 'selected'),
                summary: summary,
                invitationIds: created.map(function map(row) { return row.invitationId; }),
                failureCount: failedRows,
                createdAt: nowIso(),
                immutable: true
            };
            persistHistory('invitationDeliveryLogs', { ...batch, state: 'BULK_CREATED', status: 'CREATED', provider: 'BULK_PREP' }, context || {});
            auditInvitation('INVITATION_BULK_CREATED', { ...batch, description: 'Bulk employee invitations staged.' }, context || {});
            emitTelemetry('INVITATION_BULK_CREATED', batch, context || {});
            return freezeInvitationOutput({
                success: true,
                state: 'BULK_CREATED',
                tenantSlug: scope.tenantSlug,
                summary: summary,
                invitations: created,
                failures: failures,
                batch: batch,
                governance: {
                    reviewOnly: false,
                    tenantIsolationPreserved: !failures.some(function cross(failure) { return failure.code === 'CROSS_TENANT_INVITATION_BLOCKED'; }),
                    invitationGovernancePreserved: true,
                    stagedBatchesEnabled: true
                },
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('BULK_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_BULK_FAILED_SAFE', 'Bulk invitation workflow failed safely.', 'ERROR')]);
        }
    }

    function validateInvitationToken(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var requestedTenant = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var token = normalizeText(source.token);
            var row = invitationRows().find(function match(invitation) { return invitation.token === token; });
            var failures = [];
            if (!token || !row) failures.push(issue('INVALID_INVITATION_TOKEN', 'Invitation token is invalid or unavailable.', 'CRITICAL'));
            if (row && normalizeTenantSlug(row.tenantSlug) !== requestedTenant) failures.push(issue('CROSS_TENANT_ACTIVATION_BLOCKED', 'Invitation token cannot be used across tenant boundaries.', 'CRITICAL'));
            if (row && normalizeEmail(source.email || row.email) !== normalizeEmail(row.email)) failures.push(issue('INVITATION_OWNER_MISMATCH', 'Invitation token does not match the activation owner.', 'CRITICAL'));
            if (row && row.used) failures.push(issue('INVITATION_TOKEN_REUSED', 'Invitation token has already been used.', 'CRITICAL'));
            if (row && row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) failures.push(issue('INVITATION_EXPIRED', 'Invitation token has expired.', 'CRITICAL'));
            if (row && ['CANCELLED', 'ARCHIVED', 'FAILED'].includes(String(row.state || '').toUpperCase())) failures.push(issue('INVITATION_NOT_ACTIVE', 'Invitation is not active for activation.', 'ERROR', { state: row.state }));
            if (failures.length) {
                var tenant = row ? normalizeTenantSlug(row.tenantSlug) : requestedTenant;
                auditInvitation('INVITATION_TOKEN_VALIDATION_BLOCKED', { invitationId: row?.invitationId || '', tenantSlug: tenant, failures: failures, description: 'Invitation token validation blocked.' }, context || {});
                return failureOutput('TOKEN_VALIDATION_BLOCKED', tenant, failures, 'Invitation token validation blocked.');
            }
            auditInvitation('INVITATION_TOKEN_VALIDATED', { invitationId: row.invitationId, tenantSlug: row.tenantSlug, description: 'Invitation token validated.' }, context || {});
            return freezeInvitationOutput({
                success: true,
                state: 'VALIDATED',
                tenantSlug: row.tenantSlug,
                activationAllowed: true,
                invitation: cloneSanitized(row),
                governance: {
                    tenantIsolationPreserved: true,
                    invitationGovernancePreserved: true,
                    singleUseToken: true,
                    replayAttackPrevention: true
                },
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('TOKEN_VALIDATION_FAILED_SAFE', tenantFromContext(context || {}), [issue('TOKEN_VALIDATION_FAILED_SAFE', 'Invitation token validation failed safely.', 'ERROR')]);
        }
    }

    function trackInvitationEvent(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var eventType = normalizeText(source.eventType || source.state || 'OPENED').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
            if (!['DELIVERED', 'OPENED', 'ACTIVATED', 'COMPLETED', 'FAILED', 'EXPIRED', 'BOUNCED'].includes(eventType)) {
                return failureOutput('TRACKING_BLOCKED', tenantFromContext(context || {}), [issue('INVALID_INVITATION_EVENT', 'Invitation tracking event is not supported.', 'ERROR', { eventType: eventType })]);
            }
            var validation = validateInvitationToken(source, context || {});
            if (!validation.success && eventType !== 'FAILED' && eventType !== 'EXPIRED' && eventType !== 'BOUNCED') return validation;
            var tenant = normalizeTenantSlug(source.tenantSlug || validation.tenantSlug || tenantFromContext(context || {}));
            var row = findInvitationByIdOrToken(source, tenant);
            if (!row) return failureOutput('TRACKING_BLOCKED', tenant, [issue('INVITATION_NOT_FOUND', 'Invitation was not found for tracking.', 'ERROR')]);
            var mappedState = eventType === 'BOUNCED' ? 'FAILED' : eventType;
            var used = row.used || mappedState === 'ACTIVATED' || mappedState === 'COMPLETED';
            var updated = updateInvitation(row, {
                state: mappedState,
                status: mappedState,
                deliveryStatus: mappedState === 'FAILED' ? 'FAILED' : (row.deliveryStatus || mappedState),
                used: used,
                usedAt: used ? (row.usedAt || nowIso()) : row.usedAt || '',
                openedAt: mappedState === 'OPENED' ? nowIso() : row.openedAt || '',
                deliveredAt: mappedState === 'DELIVERED' ? nowIso() : row.deliveredAt || '',
                activatedAt: mappedState === 'ACTIVATED' ? nowIso() : row.activatedAt || '',
                completedAt: mappedState === 'COMPLETED' ? nowIso() : row.completedAt || '',
                failureReason: mappedState === 'FAILED' ? (source.failureReason || source.reason || row.failureReason || 'Delivery failed') : row.failureReason || '',
                lifecycle: (row.lifecycle || []).concat([lifecycleEvent(mappedState, { activationOwnerId: source.activationOwnerId || '', eventType: eventType })])
            }, context || {});
            var activationLog = {
                activationId: id('INV-ACT'),
                invitationId: updated.invitationId,
                tenantSlug: updated.tenantSlug,
                employeeId: updated.employeeId,
                email: updated.email,
                eventType: mappedState,
                activationOwnerId: normalizeText(source.activationOwnerId || ''),
                createdAt: nowIso(),
                immutable: true
            };
            persistHistory('invitationActivationHistory', activationLog, context || {});
            trackNotificationDelivery(updated, mappedState, context || {}, {
                providerEventId: activationLog.activationId,
                occurredAt: activationLog.createdAt,
                errorCode: mappedState === 'FAILED' ? 'INVITATION_DELIVERY_FAILED' : '',
                message: mappedState === 'FAILED' ? updated.failureReason : ''
            });
            trackInviteConversion(updated, mappedState, context || {}, {
                providerEventId: activationLog.activationId,
                occurredAt: activationLog.createdAt,
                allowSkippedTransitions: mappedState === 'OPENED' || mappedState === 'ACTIVATED' || mappedState === 'COMPLETED'
            });
            auditInvitation('INVITATION_' + mappedState, { ...activationLog, description: 'Invitation lifecycle event tracked.' }, context || {});
            emitTelemetry('INVITATION_' + mappedState, activationLog, context || {});
            return freezeInvitationOutput({
                success: true,
                state: mappedState,
                tenantSlug: updated.tenantSlug,
                invitation: updated,
                activation: activationLog,
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('TRACKING_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_TRACKING_FAILED_SAFE', 'Invitation tracking failed safely.', 'ERROR')]);
        }
    }

    function calculateInvitationReadiness(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var scope = validateScope(source, context || {}, 'REVIEW');
            var employees = Array.isArray(source.employees) ? source.employees : employeesForTenant(scope.tenantSlug);
            var failures = scope.failures.slice();
            var valid = 0;
            var duplicateEmails = new Set();
            var seenEmails = new Set();
            employees.forEach(function each(row, index) {
                var email = normalizeEmail(row.email);
                var employeeId = row.employeeId || row.empId || row.id;
                var rowOk = true;
                if (!isEmail(email)) {
                    failures.push(issue('INVALID_INVITATION_EMAIL', 'Employee invitation requires a valid email address.', 'ERROR', { rowNumber: index + 1 }));
                    rowOk = false;
                }
                if (seenEmails.has(email)) duplicateEmails.add(email);
                if (email) seenEmails.add(email);
                if (existsEmployeeOutsideTenant(employeeId, email, scope.tenantSlug)) {
                    failures.push(issue('CROSS_TENANT_INVITATION_BLOCKED', 'Invitation target belongs to another tenant scope.', 'CRITICAL', { rowNumber: index + 1 }));
                    rowOk = false;
                }
                if (rowOk) valid += 1;
            });
            duplicateEmails.forEach(function each(email) {
                failures.push(issue('DUPLICATE_INVITATION_EMAIL', 'Duplicate invitation email appears in the selected batch.', 'WARNING', { email: 'DUPLICATE_EMAIL' }));
            });
            var total = employees.length;
            var critical = failures.filter(function criticalFailure(item) { return item.severity === 'CRITICAL'; }).length;
            var errors = failures.filter(function errorFailure(item) { return item.severity === 'ERROR'; }).length;
            var warnings = failures.filter(function warnFailure(item) { return item.severity === 'WARNING'; }).length;
            var base = total ? Math.round(valid / total * 100) : 0;
            var penalty = critical * 25 + errors * 12 + warnings * 5;
            var invitationReadinessScore = Math.max(0, Math.min(100, base - penalty));
            var deliveryScore = Math.max(0, Math.min(100, 100 - errors * 10 - critical * 20 - duplicateEmails.size * 5));
            return freezeInvitationOutput({
                success: true,
                state: critical ? 'BLOCKED' : errors ? 'REVIEW_REQUIRED' : 'READY',
                tenantSlug: scope.tenantSlug,
                summary: {
                    totalRows: total,
                    validRows: valid,
                    invalidRows: total - valid,
                    warningCount: warnings,
                    errorCount: errors,
                    criticalCount: critical,
                    duplicateEmails: duplicateEmails.size
                },
                invitationReadinessScore: invitationReadinessScore,
                deliveryScore: deliveryScore,
                onboardingReadinessScore: Math.min(invitationReadinessScore, deliveryScore),
                failures: failures,
                governance: {
                    reviewOnly: true,
                    tenantIsolationPreserved: !failures.some(function cross(failure) { return failure.code === 'CROSS_TENANT_INVITATION_BLOCKED'; }),
                    invitationGovernancePreserved: true
                },
                integrationHealth: integrationHealth(),
                integrationReadiness: integrationReadiness(),
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('READINESS_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_READINESS_FAILED_SAFE', 'Invitation readiness scoring failed safely.', 'ERROR')]);
        }
    }

    function cancelEmployeeInvite(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var scope = validateScope(source, context || {}, 'CANCEL');
            if (scope.failures.length) return failureOutput('CANCEL_BLOCKED', scope.tenantSlug, scope.failures, 'Invitation cancellation blocked.');
            var row = findInvitationByIdOrToken(source, scope.tenantSlug);
            if (!row) return failureOutput('CANCEL_BLOCKED', scope.tenantSlug, [issue('INVITATION_NOT_FOUND', 'Invitation was not found for cancellation.', 'ERROR')]);
            if (['ACTIVATED', 'COMPLETED', 'ARCHIVED'].includes(String(row.state || '').toUpperCase())) {
                return failureOutput('CANCEL_BLOCKED', scope.tenantSlug, [issue('INVITATION_TERMINAL_STATE', 'Completed invitations cannot be cancelled.', 'ERROR', { state: row.state })]);
            }
            var updated = updateInvitation(row, {
                state: 'CANCELLED',
                status: 'CANCELLED',
                deliveryStatus: 'CANCELLED',
                cancelledAt: nowIso(),
                lifecycle: (row.lifecycle || []).concat([lifecycleEvent('CANCELLED', { actorId: scope.actor.id })])
            }, context || {});
            trackInviteConversion(updated, 'CANCELLED', context || {}, { occurredAt: updated.cancelledAt });
            auditInvitation('INVITATION_CANCELLED', { invitationId: updated.invitationId, tenantSlug: updated.tenantSlug, description: 'Employee invitation cancelled.' }, context || {});
            return freezeInvitationOutput({
                success: true,
                state: 'CANCELLED',
                tenantSlug: updated.tenantSlug,
                invitation: updated,
                noActiveUserCreation: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('CANCEL_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_CANCEL_FAILED_SAFE', 'Invitation cancellation failed safely.', 'ERROR')]);
        }
    }

    function resendEmployeeInvite(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var scope = validateScope(source, context || {}, 'RESEND');
            if (scope.failures.length) return failureOutput('RESEND_BLOCKED', scope.tenantSlug, scope.failures, 'Invitation resend blocked.');
            var row = findInvitationByIdOrToken(source, scope.tenantSlug);
            if (!row) return failureOutput('RESEND_BLOCKED', scope.tenantSlug, [issue('INVITATION_NOT_FOUND', 'Invitation was not found for resend.', 'ERROR')]);
            if (['ACTIVATED', 'COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(String(row.state || '').toUpperCase())) {
                return failureOutput('RESEND_BLOCKED', scope.tenantSlug, [issue('INVITATION_TERMINAL_STATE', 'Terminal invitations cannot be resent.', 'ERROR', { state: row.state })]);
            }
            return sendEmployeeInvite({ ...row, invitationId: row.invitationId, tenantSlug: row.tenantSlug, employeeId: row.employeeId, email: row.email, requireEmployee: false }, context || {});
        } catch (error) {
            return failureOutput('RESEND_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_RESEND_FAILED_SAFE', 'Invitation resend failed safely.', 'ERROR')]);
        }
    }

    function generateInvitationAnalytics(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var scope = validateScope(source, context || {}, 'ANALYTICS');
            if (scope.failures.length) {
                auditInvitation('INVITATION_ANALYTICS_BLOCKED', { tenantSlug: scope.tenantSlug, failures: scope.failures, description: 'Invitation analytics blocked.' }, context || {});
                return failureOutput('ANALYTICS_BLOCKED', scope.tenantSlug, scope.failures, 'Invitation analytics blocked.');
            }
            var rows = invitationRows().filter(function sameTenant(row) {
                return normalizeTenantSlug(row.tenantSlug) === scope.tenantSlug;
            });
            var deliveryLogs = (rawData().invitationDeliveryLogs || []).filter(function sameTenant(row) {
                return normalizeTenantSlug(row.tenantSlug) === scope.tenantSlug;
            });
            var sent = rows.filter(function state(row) { return ['SENT', 'DELIVERED', 'OPENED', 'ACTIVATED', 'COMPLETED'].includes(String(row.state || '').toUpperCase()); }).length;
            var delivered = rows.filter(function state(row) { return ['DELIVERED', 'OPENED', 'ACTIVATED', 'COMPLETED'].includes(String(row.state || '').toUpperCase()); }).length;
            var opened = rows.filter(function state(row) { return ['OPENED', 'ACTIVATED', 'COMPLETED'].includes(String(row.state || '').toUpperCase()); }).length;
            var activated = rows.filter(function state(row) { return ['ACTIVATED', 'COMPLETED'].includes(String(row.state || '').toUpperCase()); }).length;
            var failed = rows.filter(function state(row) { return ['FAILED', 'EXPIRED', 'CANCELLED'].includes(String(row.state || '').toUpperCase()); }).length;
            var total = rows.length;
            var deliverySuccessRate = sent ? Math.round(delivered / sent * 100) : 0;
            var activationRate = total ? Math.round(activated / total * 100) : 0;
            var bounceRate = deliveryLogs.length ? Math.round(deliveryLogs.filter(function failedLog(log) { return /failed|bounce/i.test(String(log.status || log.state || '')); }).length / deliveryLogs.length * 100) : 0;
            var invitationEffectivenessScore = Math.max(0, Math.min(100, Math.round((deliverySuccessRate + activationRate + Math.max(0, 100 - bounceRate)) / 3)));
            var report = {
                analyticsId: id('INV-ANALYTICS'),
                tenantSlug: scope.tenantSlug,
                success: true,
                state: total ? 'COLLECTED' : 'EMPTY',
                summary: {
                    totalInvitations: total,
                    queued: rows.filter(function state(row) { return String(row.state || '').toUpperCase() === 'QUEUED'; }).length,
                    sent: sent,
                    delivered: delivered,
                    opened: opened,
                    activated: activated,
                    failed: failed,
                    activationRate: activationRate,
                    deliverySuccessRate: deliverySuccessRate,
                    bounceRate: bounceRate,
                    activationCompletionRate: total ? Math.round(rows.filter(function state(row) { return String(row.state || '').toUpperCase() === 'COMPLETED'; }).length / total * 100) : 0,
                    onboardingConversionRate: activationRate
                },
                onboardingReadinessScore: Math.max(0, Math.min(100, invitationEffectivenessScore)),
                invitationEffectivenessScore: invitationEffectivenessScore,
                rows: rows.slice(0, 50).map(function summarize(row) {
                    return {
                        invitationId: row.invitationId,
                        employeeId: row.employeeId,
                        email: row.email,
                        name: row.name,
                        state: row.state,
                        deliveryStatus: row.deliveryStatus,
                        expiresAt: row.expiresAt,
                        sentAt: row.sentAt || '',
                        activatedAt: row.activatedAt || ''
                    };
                }),
                governance: {
                    reviewOnly: scope.reviewOnly,
                    platformOwnerVisibilityOnly: scope.platformOwnerVisibilityOnly,
                    tenantIsolationPreserved: true,
                    invitationGovernancePreserved: true
                },
                integrationHealth: integrationHealth(),
                integrationReadiness: integrationReadiness(),
                noActiveUserCreation: true,
                noWorkflowExecution: true,
                generatedAt: nowIso(),
                immutable: true
            };
            persistHistory('invitationAnalyticsReports', report, context || {});
            auditInvitation('INVITATION_ANALYTICS_REVIEWED', { analyticsId: report.analyticsId, tenantSlug: report.tenantSlug, description: 'Invitation analytics reviewed.' }, context || {});
            return freezeInvitationOutput(report);
        } catch (error) {
            return failureOutput('ANALYTICS_FAILED_SAFE', tenantFromContext(context || {}), [issue('INVITATION_ANALYTICS_FAILED_SAFE', 'Invitation analytics failed safely.', 'ERROR')]);
        }
    }

    var InviteMailDeliveryService = Object.freeze({
        INVITATION_STATES: INVITATION_STATES,
        INVITATION_LIFECYCLE: INVITATION_LIFECYCLE,
        DELIVERY_PROVIDERS: DELIVERY_PROVIDERS,
        generateInvitationToken: generateInvitationToken,
        createEmployeeInvite: createEmployeeInvite,
        sendEmployeeInvite: sendEmployeeInvite,
        resendEmployeeInvite: resendEmployeeInvite,
        cancelEmployeeInvite: cancelEmployeeInvite,
        createBulkInvites: createBulkInvites,
        validateInvitationToken: validateInvitationToken,
        trackInvitationEvent: trackInvitationEvent,
        calculateInvitationReadiness: calculateInvitationReadiness,
        generateInvitationAnalytics: generateInvitationAnalytics,
        freezeInvitationOutput: freezeInvitationOutput
    });

    global.InviteMailDeliveryService = InviteMailDeliveryService;
    global.inviteMailDeliveryService = InviteMailDeliveryService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var tests = [];
            function check(name, condition) {
                tests.push(Object.freeze({ name: name, passed: !!condition }));
            }
            try {
                var context = { actor: { id: 'HR-SELF', role: 'HR' }, tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipPersistence: true };
                var token = generateInvitationToken({ tenantSlug: 'self-test', employeeId: 'SELF-1', email: 'self@example.com' }, context);
                var invite = createEmployeeInvite({ tenantSlug: 'self-test', employeeId: 'SELF-1', email: 'self@example.com', name: 'Self Test', requireEmployee: false }, context);
                var bulk = createBulkInvites({ tenantSlug: 'self-test', employees: [{ employeeId: 'SELF-1', email: 'self@example.com', requireEmployee: false }, { employeeId: 'SELF-2', email: 'bad-email', requireEmployee: false }] }, context);
                var validation = invite.success ? validateInvitationToken({ tenantSlug: 'self-test', token: invite.invitation.token, email: 'self@example.com' }, context) : { success: false };
                var activated = invite.success ? trackInvitationEvent({ tenantSlug: 'self-test', token: invite.invitation.token, email: 'self@example.com', eventType: 'ACTIVATED', activationOwnerId: 'SELF-1' }, context) : { success: false };
                check('invite generation works', token.success === true && invite.success === true);
                check('token validation works', validation.success === true);
                check('bulk invite workflows work', bulk.success === true && bulk.summary.failed >= 1);
                check('activation tracking works', activated.success === true && activated.invitation.used === true);
                check('immutable outputs enforced', Object.isFrozen(invite));
            } catch (error) {
                tests.push(Object.freeze({ name: 'self-test failed safely', passed: false }));
            }
            global.__ARTHHRMS_INVITE_MAIL_SELF_TEST__ = freezeInvitationOutput({
                passed: tests.every(function pass(test) { return test.passed; }),
                tests: tests,
                generatedAt: nowIso()
            });
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
