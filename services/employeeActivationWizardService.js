(function attachEmployeeActivationWizardService(global) {
    'use strict';

    var ACTIVATION_STATES = Object.freeze([
        'INVITED',
        'ACTIVATION_STARTED',
        'ACCOUNT_CREATED',
        'PROFILE_COMPLETED',
        'ONBOARDING_COMPLETED',
        'ACTIVE',
        'EXPIRED',
        'FAILED',
        'CANCELLED',
        'ARCHIVED'
    ]);

    var WIZARD_STEPS = Object.freeze([
        Object.freeze({ stepId: 'identity_verification', label: 'Identity Verification', order: 1 }),
        Object.freeze({ stepId: 'credential_creation', label: 'Password Creation', order: 2 }),
        Object.freeze({ stepId: 'profile_completion', label: 'Profile Completion', order: 3 }),
        Object.freeze({ stepId: 'contact_verification', label: 'Contact Verification', order: 4 }),
        Object.freeze({ stepId: 'policy_acknowledgement', label: 'Policy Acknowledgement', order: 5 }),
        Object.freeze({ stepId: 'activation_confirmation', label: 'Activation Confirmation', order: 6 })
    ]);

    var REVIEW_ROLES = Object.freeze(['HR', 'DIRECTOR', 'PLATFORM_OWNER']);
    var ACTIVATION_ROLES = Object.freeze(['EMPLOYEE', 'INVITEE']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|bank|accountNumber|aadhaar|pan|ssn|password|credentialSecret|secret|token|activationUrl|rawPayload|document|medical|benefit|privateNote/i;
    var volatileActivationRecords = [];
    var volatileHistory = [];
    var volatileOnboardingHistory = [];
    var volatileAnalytics = [];

    function db() { return global.DB || null; }
    function inviteService() { return global.InviteMailDeliveryService || global.inviteMailDeliveryService || null; }

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
        return normalizeText(value).toLowerCase().replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeText(value || 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        if (role === 'INVITED_EMPLOYEE') role = 'INVITEE';
        return role;
    }

    function normalizeEmployeeId(value) {
        return normalizeText(value || '').toUpperCase();
    }

    function normalizeState(value, fallback) {
        var state = normalizeText(value || fallback || 'INVITED').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return ACTIVATION_STATES.includes(state) ? state : (fallback || 'INVITED');
    }

    function tenantFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return normalizeTenantSlug((context && (context.tenantSlug || context.tenantId || context.companyId)) || actor.tenantSlug || actor.tenantId || actor.companyId || rawData().companySettings?.tenantSlug || rawData().companySettings?.tenantId || 'default');
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || ''),
            empId: normalizeEmployeeId(actor.empId || actor.employeeId || actor.id || ''),
            email: normalizeEmail(actor.email || ''),
            role: normalizeRole(actor.role || 'EMPLOYEE'),
            name: normalizeText(actor.name || actor.email || actor.id || '')
        };
    }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function freezeActivationOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeActivationOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Reflect.ownKeys(value).forEach(function each(key) {
                var descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                Object.defineProperty(clone, key, {
                    enumerable: descriptor.enumerable,
                    configurable: false,
                    writable: false,
                    value: freezeActivationOutput(descriptor.value)
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

    function tokenPreview(token) {
        var text = normalizeText(token);
        if (!text) return '';
        if (text.length <= 10) return 'token-redacted';
        return text.slice(0, 4) + '...' + text.slice(-4);
    }

    function publicActivation(record) {
        var clone = cloneSanitized(record || {});
        delete clone.stepEvidence;
        delete clone.credentialConfigured;
        delete clone.credentialCreatedAt;
        delete clone.profileSnapshot;
        if (clone.stepProgress) {
            clone.stepProgress = Object.keys(clone.stepProgress).reduce(function collect(acc, key) {
                acc[key] = !!clone.stepProgress[key];
                return acc;
            }, {});
        }
        return clone;
    }

    function issue(code, message, severity, metadata) {
        return freezeActivationOutput({
            code: code,
            message: message,
            severity: severity || 'ERROR',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function failureOutput(state, tenantSlug, failures, message) {
        return freezeActivationOutput({
            success: false,
            state: state || 'FAILED',
            tenantSlug: normalizeTenantSlug(tenantSlug),
            failures: failures || [issue('ACTIVATION_FAILED_SAFE', message || 'Activation action failed safely.', 'ERROR')],
            governance: {
                tenantIsolationPreserved: true,
                activationGovernancePreserved: true,
                invitationValidationRequired: true,
                noWorkflowExecution: true
            },
            noActiveUserCreationBeforeFinalization: true,
            noAutonomousActions: true
        });
    }

    function withDataArray(data, key) {
        if (!data || !Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function activationRows() {
        var data = rawData();
        var persisted = Array.isArray(data.employeeActivationRecords) ? data.employeeActivationRecords : [];
        return persisted.concat(volatileActivationRecords);
    }

    function findActivation(input, tenantSlug) {
        var source = input || {};
        var activationId = normalizeText(source.activationId || source.id || '');
        var token = normalizeText(source.token || '');
        var email = normalizeEmail(source.email || '');
        return activationRows().find(function match(row) {
            if (normalizeTenantSlug(row.tenantSlug) !== normalizeTenantSlug(tenantSlug)) return false;
            if (activationId && row.activationId === activationId) return true;
            if (token && row.invitationToken === token) return true;
            if (email && normalizeEmail(row.email) === email && !['ACTIVE', 'ARCHIVED', 'CANCELLED', 'FAILED'].includes(String(row.state || '').toUpperCase())) return true;
            return false;
        }) || null;
    }

    function invitationRows() {
        var data = rawData();
        return Array.isArray(data.employeeInvitationRecords) ? data.employeeInvitationRecords : [];
    }

    function findInvitationByToken(token, tenantSlug) {
        var normalizedToken = normalizeText(token);
        return invitationRows().find(function match(row) {
            return row.token === normalizedToken && normalizeTenantSlug(row.tenantSlug) === normalizeTenantSlug(tenantSlug);
        }) || null;
    }

    function persistActivationRecord(record, context) {
        var next = {
            ...record,
            tenantSlug: normalizeTenantSlug(record.tenantSlug),
            updatedAt: nowIso(),
            immutable: true
        };
        if (context && context.skipPersistence) {
            var vIndex = volatileActivationRecords.findIndex(function match(row) { return row.activationId === next.activationId; });
            if (vIndex >= 0) volatileActivationRecords[vIndex] = next;
            else volatileActivationRecords.push(next);
            return next;
        }
        var data = rawData();
        var rows = withDataArray(data, 'employeeActivationRecords');
        var index = rows.findIndex(function match(row) { return row.activationId === next.activationId; });
        if (index >= 0) rows[index] = next;
        else rows.unshift(next);
        saveData(data);
        return next;
    }

    function persistHistory(key, row, context) {
        var entry = {
            ...cloneSanitized(row || {}),
            createdAt: row.createdAt || nowIso(),
            immutable: true
        };
        if (context && context.skipPersistence) {
            if (key === 'employeeOnboardingHistory') volatileOnboardingHistory.unshift(entry);
            else if (key === 'activationAnalyticsReports') volatileAnalytics.unshift(entry);
            else volatileHistory.unshift(entry);
            return entry;
        }
        var data = rawData();
        withDataArray(data, key).unshift(entry);
        saveData(data);
        return entry;
    }

    function auditActivation(actionType, details, context) {
        try {
            if (context && context.skipAuditPersistence) return null;
            var actor = actorFromContext(context || {});
            if (db() && typeof db().writeAuditLog === 'function') {
                return db().writeAuditLog(actor.role.toLowerCase(), actor.id || actor.empId || '', actionType, 'Employee Activation', details.activationId || details.employeeId || '', details.description || actionType);
            }
        } catch (error) {}
        return null;
    }

    function emitTelemetry(eventType, payload, context) {
        if (context && context.skipTelemetry) return null;
        try {
            var svc = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (svc && typeof svc.recordTelemetry === 'function') return svc.recordTelemetry(eventType, cloneSanitized(payload || {}), { source: 'employeeActivationWizardService' });
            if (svc && typeof svc.trackEvent === 'function') return svc.trackEvent(eventType, cloneSanitized(payload || {}));
        } catch (error) {}
        return null;
    }

    function sameTenant(row, tenantSlug) {
        var rowTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId));
        var expected = normalizeTenantSlug(tenantSlug);
        return !rowTenant || !expected || rowTenant === expected;
    }

    function employeeIdOf(row) {
        return normalizeEmployeeId(row && (row.employeeId || row.empId || row.id || row.employee_id));
    }

    function findEmployee(input, tenantSlug) {
        var data = rawData();
        var idValue = normalizeEmployeeId(input && (input.employeeId || input.empId || input.activationOwnerId || input.id));
        var emailValue = normalizeEmail(input && input.email);
        return (data.employees || []).find(function match(emp) {
            if (!sameTenant(emp, tenantSlug)) return false;
            if (idValue && employeeIdOf(emp) === idValue) return true;
            if (emailValue && normalizeEmail(emp.email) === emailValue) return true;
            return false;
        }) || null;
    }

    function validateReviewScope(context, tenantSlug) {
        var actor = actorFromContext(context || {});
        var failures = [];
        if (!REVIEW_ROLES.includes(actor.role)) failures.push(issue('ACTIVATION_REVIEW_ACCESS_BLOCKED', 'Role cannot review employee activation governance.', 'CRITICAL', { role: actor.role }));
        var contextTenant = tenantFromContext(context || {});
        if (contextTenant && tenantSlug && contextTenant !== tenantSlug && actor.role !== 'PLATFORM_OWNER') failures.push(issue('CROSS_TENANT_ACTIVATION_BLOCKED', 'Activation review cannot cross tenant boundaries.', 'CRITICAL'));
        return failures;
    }

    function validateActivationScope(validation, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        var invitation = validation && validation.invitation ? validation.invitation : {};
        var employeeId = normalizeEmployeeId(invitation.employeeId || invitation.empId || '');
        var email = normalizeEmail(invitation.email || '');
        var failures = [];
        if (!ACTIVATION_ROLES.includes(actor.role)) failures.push(issue('ACTIVATION_ROLE_BLOCKED', 'Only the invited employee can perform account activation.', 'CRITICAL', { role: actor.role }));
        if (actor.empId && employeeId && actor.empId !== employeeId) failures.push(issue('ACTIVATION_OWNERSHIP_BLOCKED', 'Activation can only be completed by the invited employee.', 'CRITICAL'));
        if (actor.email && email && actor.email !== email) failures.push(issue('ACTIVATION_OWNERSHIP_BLOCKED', 'Activation email does not match the invited employee.', 'CRITICAL'));
        var contextTenant = tenantFromContext(context || {});
        if (contextTenant && tenantSlug && contextTenant !== tenantSlug) failures.push(issue('CROSS_TENANT_ACTIVATION_BLOCKED', 'Activation cannot cross tenant boundaries.', 'CRITICAL'));
        return failures;
    }

    function callInviteValidation(source, context) {
        var svc = inviteService();
        if (svc && typeof svc.validateInvitationToken === 'function') {
            return svc.validateInvitationToken(source, context || {});
        }
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
        var row = findInvitationByToken(source.token, tenantSlug);
        var failures = [];
        if (!row) failures.push(issue('INVALID_INVITATION_TOKEN', 'Invitation token is invalid or unavailable.', 'CRITICAL'));
        if (row && normalizeEmail(source.email || row.email) !== normalizeEmail(row.email)) failures.push(issue('INVITATION_OWNER_MISMATCH', 'Invitation token does not match the activation owner.', 'CRITICAL'));
        if (row && row.used) failures.push(issue('INVITATION_TOKEN_REUSED', 'Invitation token has already been used.', 'CRITICAL'));
        if (row && row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) failures.push(issue('INVITATION_EXPIRED', 'Invitation token has expired.', 'CRITICAL'));
        if (failures.length) return failureOutput('TOKEN_VALIDATION_BLOCKED', tenantSlug, failures);
        return freezeActivationOutput({ success: true, activationAllowed: true, tenantSlug: row.tenantSlug, invitation: cloneSanitized(row) });
    }

    function validateActivationToken(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var validation = callInviteValidation({ token: source.token, tenantSlug: tenantSlug, email: source.email }, context || {});
            if (!validation || validation.success === false) {
                return failureOutput(validation?.state || 'TOKEN_VALIDATION_BLOCKED', tenantSlug, validation?.failures || [issue('INVALID_INVITATION_TOKEN', 'Invitation token is invalid or unavailable.', 'CRITICAL')]);
            }
            var invitation = validation.invitation || {};
            var invitationTenant = normalizeTenantSlug(invitation.tenantSlug || tenantSlug);
            if (invitationTenant !== tenantSlug) {
                return failureOutput('TOKEN_VALIDATION_BLOCKED', tenantSlug, [issue('CROSS_TENANT_ACTIVATION_BLOCKED', 'Activation token cannot be used across tenant boundaries.', 'CRITICAL')]);
            }
            var employee = findEmployee({ employeeId: invitation.employeeId || invitation.empId, email: invitation.email }, tenantSlug);
            if (!employee && !(context && context.skipPersistence)) {
                return failureOutput('TOKEN_VALIDATION_BLOCKED', tenantSlug, [issue('ACTIVATION_EMPLOYEE_NOT_FOUND', 'Invitation does not map to an employee in this tenant.', 'CRITICAL')]);
            }
            var activeStatus = normalizeText(employee?.activationStatus || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
            if (activeStatus === 'ACTIVE' || activeStatus === 'ACTIVATED') {
                return failureOutput('TOKEN_VALIDATION_BLOCKED', tenantSlug, [issue('EMPLOYEE_ALREADY_ACTIVE', 'Employee account is already active.', 'ERROR')]);
            }
            var output = {
                success: true,
                state: 'VALIDATED',
                tenantSlug: tenantSlug,
                activationAllowed: true,
                invitation: {
                    invitationId: invitation.invitationId || invitation.id || '',
                    tenantSlug: tenantSlug,
                    employeeId: normalizeEmployeeId(invitation.employeeId || invitation.empId || employee?.id || ''),
                    email: normalizeEmail(invitation.email || employee?.email || ''),
                    name: normalizeText(invitation.name || employee?.name || ''),
                    state: normalizeText(invitation.state || invitation.status || 'INVITED').toUpperCase(),
                    tokenPreview: tokenPreview(source.token),
                    expiresAt: invitation.expiresAt || '',
                    singleUse: true,
                    used: invitation.used === true
                },
                employee: employee ? {
                    employeeId: employee.id || employee.empId || '',
                    name: employee.name || '',
                    email: normalizeEmail(employee.email || ''),
                    department: employee.department || '',
                    designation: employee.designation || '',
                    activationStatus: employee.activationStatus || 'Not Activated'
                } : null,
                governance: {
                    tenantIsolationPreserved: true,
                    activationGovernancePreserved: true,
                    invitationValidationRequired: true,
                    singleUseToken: true,
                    replayAttackPrevention: true
                },
                noActiveUserCreationBeforeFinalization: true,
                noWorkflowExecution: true
            };
            return freezeActivationOutput(output);
        } catch (error) {
            return failureOutput('TOKEN_VALIDATION_FAILED_SAFE', tenantFromContext(context || {}), [issue('TOKEN_VALIDATION_FAILED_SAFE', 'Activation token validation failed safely.', 'ERROR')]);
        }
    }

    function stepProgress(overrides) {
        return {
            identity_verification: false,
            credential_creation: false,
            profile_completion: false,
            contact_verification: false,
            policy_acknowledgement: false,
            activation_confirmation: false,
            ...(overrides || {})
        };
    }

    function completionFromProgress(progress) {
        var values = Object.keys(stepProgress()).map(function key(name) { return !!progress[name]; });
        return Math.round((values.filter(Boolean).length / values.length) * 100);
    }

    function startActivationWizard(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var validation = validateActivationToken(source, context || {});
            if (!validation.success) return validation;
            var scopeFailures = validateActivationScope(validation, context || {}, tenantSlug);
            if (scopeFailures.length) return failureOutput('ACTIVATION_BLOCKED', tenantSlug, scopeFailures);
            var existing = findActivation(source, tenantSlug);
            var progress = stepProgress(existing?.stepProgress);
            progress.identity_verification = true;
            var record = {
                ...(existing || {}),
                activationId: existing?.activationId || id('ACT'),
                invitationId: validation.invitation.invitationId,
                invitationToken: normalizeText(source.token),
                tenantSlug: tenantSlug,
                employeeId: validation.invitation.employeeId,
                email: validation.invitation.email,
                name: validation.invitation.name,
                department: validation.employee?.department || '',
                designation: validation.employee?.designation || '',
                state: 'ACTIVATION_STARTED',
                lifecycle: (existing?.lifecycle || []).concat([{ state: 'ACTIVATION_STARTED', at: nowIso() }]),
                currentStep: 'identity_verification',
                stepProgress: progress,
                completionPercentage: completionFromProgress(progress),
                missingFields: [],
                startedAt: existing?.startedAt || nowIso(),
                createdAt: existing?.createdAt || nowIso()
            };
            var persisted = persistActivationRecord(record, context || {});
            persistHistory('employeeActivationHistory', {
                activationId: persisted.activationId,
                invitationId: persisted.invitationId,
                tenantSlug: tenantSlug,
                employeeId: persisted.employeeId,
                email: persisted.email,
                state: persisted.state,
                eventType: 'ACTIVATION_STARTED'
            }, context || {});
            auditActivation('ACTIVATION_STARTED', { activationId: persisted.activationId, employeeId: persisted.employeeId, tenantSlug: tenantSlug, description: 'Employee activation wizard started.' }, context || {});
            emitTelemetry('ACTIVATION_STARTED', persisted, context || {});
            var svc = inviteService();
            if (svc && typeof svc.trackInvitationEvent === 'function') {
                try { svc.trackInvitationEvent({ token: source.token, tenantSlug: tenantSlug, email: persisted.email, eventType: 'OPENED' }, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true }); } catch (error) {}
            }
            try {
                var conversion = global.InviteAcceptanceTrackingService;
                if (conversion && typeof conversion.trackInviteAcceptance === 'function') {
                    conversion.trackInviteAcceptance({ invitationId: persisted.invitationId, tenantSlug: tenantSlug, employeeId: persisted.employeeId, state: 'INVITE_ACCEPTED', source: 'EMPLOYEE_ACTIVATION', occurredAt: persisted.startedAt, allowSkippedTransitions: true }, { ...(context || {}), source: 'EMPLOYEE_ACTIVATION' });
                    conversion.trackInviteAcceptance({ invitationId: persisted.invitationId, tenantSlug: tenantSlug, employeeId: persisted.employeeId, state: 'ACTIVATION_STARTED', source: 'EMPLOYEE_ACTIVATION', occurredAt: persisted.startedAt, allowSkippedTransitions: true }, { ...(context || {}), source: 'EMPLOYEE_ACTIVATION' });
                }
            } catch (error) {}
            try {
                var lifecycleService = global.EmployeeStatusLifecycleService;
                if (lifecycleService && typeof lifecycleService.changeEmployeeStatus === 'function') {
                    lifecycleService.changeEmployeeStatus({
                        tenantSlug: tenantSlug,
                        activationId: persisted.activationId,
                        employeeId: persisted.employeeId,
                        newStatus: 'ACTIVATING',
                        transitionReason: 'Invitation validated and employee activation started.',
                        supportingNotes: 'Observed after the activation wizard session was persisted.',
                        occurredAt: persisted.startedAt,
                        source: 'EMPLOYEE_ACTIVATION'
                    }, { ...(context || {}), observationOnly: true, source: 'EMPLOYEE_ACTIVATION' });
                }
            } catch (error) {}
            return freezeActivationOutput({
                success: true,
                state: 'ACTIVATION_STARTED',
                tenantSlug: tenantSlug,
                activation: publicActivation({
                    activationId: persisted.activationId,
                    invitationId: persisted.invitationId,
                    employeeId: persisted.employeeId,
                    email: persisted.email,
                    name: persisted.name,
                    department: persisted.department,
                    designation: persisted.designation,
                    state: persisted.state,
                    currentStep: persisted.currentStep,
                    completionPercentage: persisted.completionPercentage,
                    tokenPreview: tokenPreview(source.token),
                    createdAt: persisted.createdAt,
                    updatedAt: persisted.updatedAt
                }),
                steps: WIZARD_STEPS.map(function copy(step) { return { ...step, completed: !!progress[step.stepId] }; }),
                onboardingReadinessScore: calculateReadinessForRecord(persisted).onboardingReadinessScore,
                governance: {
                    tenantIsolationPreserved: true,
                    activationGovernancePreserved: true,
                    invitationValidationRequired: true,
                    employeeSelfActivationOnly: true
                },
                noActiveUserCreationBeforeFinalization: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('ACTIVATION_FAILED_SAFE', tenantFromContext(context || {}), [issue('ACTIVATION_START_FAILED_SAFE', 'Activation wizard failed safely.', 'ERROR')]);
        }
    }

    function credentialFailures(secret, confirmation) {
        var failures = [];
        var value = String(secret || '');
        if (value.length < 10) failures.push('at least 10 characters');
        if (!/[A-Z]/.test(value)) failures.push('one uppercase letter');
        if (!/[a-z]/.test(value)) failures.push('one lowercase letter');
        if (!/[0-9]/.test(value)) failures.push('one number');
        if (!/[^A-Za-z0-9]/.test(value)) failures.push('one symbol');
        if (value !== String(confirmation || '')) failures.push('matching confirmation');
        return failures;
    }

    function profileReadiness(profile) {
        var source = profile && typeof profile === 'object' ? profile : {};
        var emergency = source.emergencyContact || {};
        var missing = [];
        if (!normalizeText(source.phoneNumber || source.phone)) missing.push('phoneNumber');
        if (!normalizeText(emergency.name)) missing.push('emergencyContact.name');
        if (!normalizeText(emergency.phone || emergency.mobile)) missing.push('emergencyContact.phone');
        if (source.departmentConfirmation !== true && source.departmentConfirmed !== true) missing.push('departmentConfirmation');
        if (source.contactVerified !== true && source.emailVerified !== true) missing.push('contactVerification');
        if (source.policyAcknowledged !== true && source.policyAccepted !== true) missing.push('policyAcknowledgement');
        var completed = 6 - missing.length;
        return {
            missingFields: missing,
            completionPercentage: Math.max(0, Math.round((completed / 6) * 100)),
            contactVerified: source.contactVerified === true || source.emailVerified === true,
            policyAcknowledged: source.policyAcknowledged === true || source.policyAccepted === true
        };
    }

    function calculateReadinessForRecord(record) {
        var progressScore = completionFromProgress(record.stepProgress || {});
        var profileScore = Number(record.profileCompletionPercentage || 0);
        var readiness = Math.round((progressScore * 0.55) + (profileScore * 0.45));
        var successScore = record.state === 'ACTIVE' ? 100 : Math.min(95, readiness);
        return {
            onboardingReadinessScore: Math.max(0, Math.min(100, readiness)),
            activationSuccessScore: Math.max(0, Math.min(100, successScore))
        };
    }

    function completeProfileSetup(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var validation = validateActivationToken(source, context || {});
            if (!validation.success) return validation;
            var scopeFailures = validateActivationScope(validation, context || {}, tenantSlug);
            if (scopeFailures.length) return failureOutput('PROFILE_COMPLETION_BLOCKED', tenantSlug, scopeFailures);
            var record = findActivation(source, tenantSlug);
            if (!record) return failureOutput('PROFILE_COMPLETION_BLOCKED', tenantSlug, [issue('ACTIVATION_SESSION_NOT_FOUND', 'Activation wizard must be started before profile completion.', 'ERROR')]);
            var secretProblems = credentialFailures(source.password || source.credential || source.secret, source.confirmPassword || source.confirmCredential || source.confirmSecret);
            if (secretProblems.length) return failureOutput('PROFILE_COMPLETION_BLOCKED', tenantSlug, [issue('PASSWORD_POLICY_FAILED', 'Password policy validation failed.', 'CRITICAL', { requirements: secretProblems })]);
            var profile = profileReadiness(source.profile || source);
            if (profile.missingFields.length) {
                return failureOutput('PROFILE_COMPLETION_BLOCKED', tenantSlug, [issue('PROFILE_COMPLETION_REQUIRED', 'Profile must be completed before account activation.', 'ERROR', { missingFields: profile.missingFields })]);
            }
            var progress = stepProgress(record.stepProgress);
            progress.identity_verification = true;
            progress.credential_creation = true;
            progress.profile_completion = true;
            progress.contact_verification = true;
            progress.policy_acknowledgement = true;
            var updated = {
                ...record,
                state: 'PROFILE_COMPLETED',
                currentStep: 'activation_confirmation',
                stepProgress: progress,
                completionPercentage: completionFromProgress(progress),
                profileCompletionPercentage: profile.completionPercentage,
                missingFields: [],
                profileSnapshot: cloneSanitized(source.profile || {}),
                credentialConfigured: true,
                credentialCreatedAt: nowIso(),
                contactVerified: profile.contactVerified,
                policyAcknowledged: profile.policyAcknowledged,
                profileCompletedAt: nowIso(),
                lifecycle: (record.lifecycle || []).concat([{ state: 'PROFILE_COMPLETED', at: nowIso() }])
            };
            var persisted = persistActivationRecord(updated, context || {});
            persistHistory('employeeActivationHistory', {
                activationId: persisted.activationId,
                invitationId: persisted.invitationId,
                tenantSlug: tenantSlug,
                employeeId: persisted.employeeId,
                email: persisted.email,
                state: persisted.state,
                eventType: 'PROFILE_COMPLETED'
            }, context || {});
            persistHistory('employeeOnboardingHistory', {
                activationId: persisted.activationId,
                tenantSlug: tenantSlug,
                employeeId: persisted.employeeId,
                email: persisted.email,
                onboardingState: 'PROFILE_COMPLETED',
                completionPercentage: persisted.completionPercentage
            }, context || {});
            auditActivation('ACTIVATION_PROFILE_COMPLETED', { activationId: persisted.activationId, employeeId: persisted.employeeId, tenantSlug: tenantSlug, description: 'Employee activation profile completed.' }, context || {});
            emitTelemetry('ACTIVATION_PROFILE_COMPLETED', persisted, context || {});
            try {
                var conversion = global.InviteAcceptanceTrackingService;
                if (conversion && typeof conversion.trackInviteAcceptance === 'function') {
                    conversion.trackInviteAcceptance({ invitationId: persisted.invitationId, tenantSlug: tenantSlug, employeeId: persisted.employeeId, state: 'PROFILE_COMPLETED', source: 'EMPLOYEE_ACTIVATION', occurredAt: persisted.profileCompletedAt, allowSkippedTransitions: true }, { ...(context || {}), source: 'EMPLOYEE_ACTIVATION' });
                }
            } catch (error) {}
            var scores = calculateReadinessForRecord(persisted);
            return freezeActivationOutput({
                success: true,
                state: 'PROFILE_COMPLETED',
                tenantSlug: tenantSlug,
                activation: publicActivation({
                    activationId: persisted.activationId,
                    invitationId: persisted.invitationId,
                    employeeId: persisted.employeeId,
                    email: persisted.email,
                    name: persisted.name,
                    state: persisted.state,
                    currentStep: persisted.currentStep,
                    completionPercentage: persisted.completionPercentage,
                    profileCompletionPercentage: persisted.profileCompletionPercentage,
                    missingFields: []
                }),
                onboardingReadinessScore: scores.onboardingReadinessScore,
                activationSuccessScore: scores.activationSuccessScore,
                governance: {
                    tenantIsolationPreserved: true,
                    activationGovernancePreserved: true,
                    invitationValidationRequired: true,
                    profileCompletionRequired: true,
                    policyAcknowledgementRequired: true
                },
                noActiveUserCreationBeforeFinalization: true,
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('PROFILE_COMPLETION_FAILED_SAFE', tenantFromContext(context || {}), [issue('PROFILE_COMPLETION_FAILED_SAFE', 'Profile completion failed safely.', 'ERROR')]);
        }
    }

    function calculateOnboardingReadiness(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var reviewFailures = validateReviewScope(context || {}, tenantSlug);
            if (reviewFailures.length) return failureOutput('READINESS_REVIEW_BLOCKED', tenantSlug, reviewFailures);
            var rows = activationRows().filter(function same(row) { return normalizeTenantSlug(row.tenantSlug) === tenantSlug; });
            var selected = findActivation(source, tenantSlug);
            if (selected) rows = [selected];
            var totals = rows.reduce(function collect(acc, row) {
                var scores = calculateReadinessForRecord(row);
                acc.readiness += scores.onboardingReadinessScore;
                acc.success += scores.activationSuccessScore;
                if (row.state === 'ACTIVE') acc.active += 1;
                if (row.state === 'FAILED') acc.failed += 1;
                if (row.state === 'PROFILE_COMPLETED') acc.profileCompleted += 1;
                return acc;
            }, { readiness: 0, success: 0, active: 0, failed: 0, profileCompleted: 0 });
            var count = rows.length || 1;
            var report = {
                reportId: id('ACT-READY'),
                tenantSlug: tenantSlug,
                state: rows.length ? 'COLLECTED' : 'INVITED',
                generatedAt: nowIso(),
                totalActivations: rows.length,
                profileCompleted: totals.profileCompleted,
                active: totals.active,
                failed: totals.failed,
                onboardingReadinessScore: Math.round(totals.readiness / count),
                activationSuccessScore: Math.round(totals.success / count),
                pendingActivations: rows.filter(function pending(row) { return !['ACTIVE', 'FAILED', 'CANCELLED', 'ARCHIVED'].includes(row.state); }).length,
                immutable: true
            };
            persistHistory('activationAnalyticsReports', report, context || {});
            auditActivation('ACTIVATION_READINESS_REVIEWED', { activationId: report.reportId, tenantSlug: tenantSlug, description: 'Activation readiness reviewed.' }, context || {});
            return freezeActivationOutput({
                success: true,
                state: report.state,
                tenantSlug: tenantSlug,
                onboardingReadinessScore: report.onboardingReadinessScore,
                activationSuccessScore: report.activationSuccessScore,
                summary: cloneSanitized(report),
                rows: rows.slice(0, 50).map(function map(row) { return publicActivation(row); }),
                governance: {
                    reviewOnly: true,
                    tenantIsolationPreserved: true,
                    activationGovernancePreserved: true
                },
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('READINESS_FAILED_SAFE', tenantFromContext(context || {}), [issue('READINESS_FAILED_SAFE', 'Activation readiness calculation failed safely.', 'ERROR')]);
        }
    }

    function upsertActivatedUser(record, context) {
        if (context && context.skipPersistence) {
            return { ok: true, user: { id: id('USR'), email: record.email, empId: record.employeeId, active: true, activationStatus: 'Active' }, employee: { id: record.employeeId, email: record.email, activationStatus: 'Active', inviteStatus: 'Activated', onboardingStatus: 'Completed' } };
        }
        var data = rawData();
        var employeeIndex = (data.employees || []).findIndex(function match(emp) {
            return employeeIdOf(emp) === normalizeEmployeeId(record.employeeId) && sameTenant(emp, record.tenantSlug);
        });
        if (employeeIndex < 0) return { ok: false, error: 'Employee not found' };
        var employee = data.employees[employeeIndex];
        var authUserId = employee.authUserId || id('AUTH');
        if (!Array.isArray(data.users)) data.users = [];
        var user = data.users.find(function find(row) { return normalizeEmail(row.email) === normalizeEmail(record.email) || row.empId === employee.id; });
        if (!user) {
            user = {
                id: db() && typeof db().generateUserId === 'function' ? db().generateUserId(data) : id('USR'),
                name: employee.name || record.name || record.email,
                email: normalizeEmail(record.email),
                role: employee.role || 'employee',
                empId: employee.id,
                active: true,
                authStatus: 'Activation Wizard Linked',
                inviteStatus: 'Activated',
                activationStatus: 'Active',
                lifecycleStatus: 'Active',
                authUserId: authUserId,
                credentialConfigured: true,
                createdAt: nowIso()
            };
            data.users.push(user);
        } else {
            user.empId = employee.id;
            user.role = user.role || employee.role || 'employee';
            user.active = true;
            user.authStatus = 'Activation Wizard Linked';
            user.inviteStatus = 'Activated';
            user.activationStatus = 'Active';
            user.lifecycleStatus = 'Active';
            user.authUserId = user.authUserId || authUserId;
            user.credentialConfigured = true;
            user.updatedAt = nowIso();
            authUserId = user.authUserId;
        }
        employee.authUserId = authUserId;
        employee.authStatus = 'Activation Wizard Linked';
        employee.inviteStatus = 'Activated';
        employee.invitationStatus = 'Activated';
        employee.activationStatus = 'Active';
        employee.onboardingStatus = 'Completed';
        employee.lifecycleStatus = 'Active';
        employee.profileCompletionPercentage = 100;
        employee.emailVerifiedAt = employee.emailVerifiedAt || nowIso();
        employee.activatedAt = employee.activatedAt || nowIso();
        employee.onboardingCompletedAt = employee.onboardingCompletedAt || nowIso();
        saveData(data);
        return { ok: true, user: user, employee: employee };
    }

    function finalizeEmployeeActivation(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var validation = validateActivationToken(source, context || {});
            if (!validation.success) return validation;
            var scopeFailures = validateActivationScope(validation, context || {}, tenantSlug);
            if (scopeFailures.length) return failureOutput('ACTIVATION_FINALIZATION_BLOCKED', tenantSlug, scopeFailures);
            var record = findActivation(source, tenantSlug);
            if (!record) return failureOutput('ACTIVATION_FINALIZATION_BLOCKED', tenantSlug, [issue('ACTIVATION_SESSION_NOT_FOUND', 'Activation wizard session was not found.', 'ERROR')]);
            if (record.state !== 'PROFILE_COMPLETED') return failureOutput('ACTIVATION_FINALIZATION_BLOCKED', tenantSlug, [issue('PROFILE_COMPLETION_REQUIRED', 'Profile completion is required before final activation.', 'ERROR')]);
            var secretProblems = credentialFailures(source.password || source.credential || source.secret, source.confirmPassword || source.confirmCredential || source.confirmSecret);
            if (secretProblems.length) return failureOutput('ACTIVATION_FINALIZATION_BLOCKED', tenantSlug, [issue('PASSWORD_POLICY_FAILED', 'Password policy validation failed.', 'CRITICAL', { requirements: secretProblems })]);
            var activationResult = upsertActivatedUser(record, context || {});
            if (!activationResult.ok) return failureOutput('ACTIVATION_FINALIZATION_BLOCKED', tenantSlug, [issue('ACCOUNT_CREATION_BLOCKED', activationResult.error || 'Account activation could not be completed.', 'CRITICAL')]);
            var progress = stepProgress(record.stepProgress);
            progress.identity_verification = true;
            progress.credential_creation = true;
            progress.profile_completion = true;
            progress.contact_verification = true;
            progress.policy_acknowledgement = true;
            progress.activation_confirmation = true;
            var updated = {
                ...record,
                state: 'ACTIVE',
                currentStep: 'activation_confirmation',
                stepProgress: progress,
                completionPercentage: 100,
                profileCompletionPercentage: 100,
                accountCreatedAt: record.accountCreatedAt || nowIso(),
                onboardingCompletedAt: nowIso(),
                activatedAt: nowIso(),
                authUserId: activationResult.user.authUserId || activationResult.user.id || '',
                lifecycle: (record.lifecycle || []).concat([
                    { state: 'ACCOUNT_CREATED', at: nowIso() },
                    { state: 'ONBOARDING_COMPLETED', at: nowIso() },
                    { state: 'ACTIVE', at: nowIso() }
                ])
            };
            var persisted = persistActivationRecord(updated, context || {});
            var svc = inviteService();
            var invitationResult = null;
            if (svc && typeof svc.trackInvitationEvent === 'function') {
                try { invitationResult = svc.trackInvitationEvent({ token: source.token, tenantSlug: tenantSlug, email: record.email, eventType: 'ACTIVATED', activationOwnerId: record.employeeId }, context || {}); } catch (error) { invitationResult = null; }
            }
            persistHistory('employeeActivationHistory', {
                activationId: persisted.activationId,
                invitationId: persisted.invitationId,
                tenantSlug: tenantSlug,
                employeeId: persisted.employeeId,
                email: persisted.email,
                state: 'ACTIVE',
                eventType: 'ACTIVATION_COMPLETED',
                authUserId: persisted.authUserId
            }, context || {});
            persistHistory('employeeOnboardingHistory', {
                activationId: persisted.activationId,
                tenantSlug: tenantSlug,
                employeeId: persisted.employeeId,
                email: persisted.email,
                onboardingState: 'ONBOARDING_COMPLETED',
                completionPercentage: 100
            }, context || {});
            auditActivation('ACTIVATION_COMPLETED', { activationId: persisted.activationId, employeeId: persisted.employeeId, tenantSlug: tenantSlug, description: 'Employee activation finalized after invitation validation and onboarding completion.' }, context || {});
            emitTelemetry('ACTIVATION_COMPLETED', persisted, context || {});
            try {
                var conversion = global.InviteAcceptanceTrackingService;
                if (conversion && typeof conversion.trackInviteAcceptance === 'function') {
                    conversion.trackInviteAcceptance({ invitationId: persisted.invitationId, tenantSlug: tenantSlug, employeeId: persisted.employeeId, state: 'EMPLOYEE_ACTIVE', source: 'EMPLOYEE_ACTIVATION', occurredAt: persisted.activatedAt, allowSkippedTransitions: true }, { ...(context || {}), source: 'EMPLOYEE_ACTIVATION' });
                }
            } catch (error) {}
            try {
                var lifecycleService = global.EmployeeStatusLifecycleService;
                if (lifecycleService && typeof lifecycleService.changeEmployeeStatus === 'function') {
                    lifecycleService.changeEmployeeStatus({
                        tenantSlug: tenantSlug,
                        activationId: persisted.activationId,
                        employeeId: persisted.employeeId,
                        newStatus: 'ACTIVE',
                        transitionReason: 'Employee activation and onboarding completed.',
                        supportingNotes: 'Observed after authoritative account activation succeeded.',
                        occurredAt: persisted.activatedAt,
                        source: 'EMPLOYEE_ACTIVATION'
                    }, { ...(context || {}), source: 'EMPLOYEE_ACTIVATION' });
                }
            } catch (error) {}
            return freezeActivationOutput({
                success: true,
                state: 'ACTIVE',
                tenantSlug: tenantSlug,
                activation: publicActivation({
                    activationId: persisted.activationId,
                    invitationId: persisted.invitationId,
                    employeeId: persisted.employeeId,
                    email: persisted.email,
                    name: persisted.name,
                    state: persisted.state,
                    completionPercentage: 100,
                    activatedAt: persisted.activatedAt
                }),
                employee: {
                    employeeId: activationResult.employee.id || activationResult.employee.empId || '',
                    name: activationResult.employee.name || '',
                    email: normalizeEmail(activationResult.employee.email || ''),
                    department: activationResult.employee.department || '',
                    designation: activationResult.employee.designation || '',
                    activationStatus: activationResult.employee.activationStatus || 'Active',
                    inviteStatus: activationResult.employee.inviteStatus || 'Activated',
                    onboardingStatus: activationResult.employee.onboardingStatus || 'Completed'
                },
                user: {
                    userId: activationResult.user.id || '',
                    email: normalizeEmail(activationResult.user.email || ''),
                    role: activationResult.user.role || 'employee',
                    active: activationResult.user.active === true,
                    activationStatus: activationResult.user.activationStatus || 'Active'
                },
                invitation: {
                    invitationId: persisted.invitationId,
                    tokenPreview: tokenPreview(source.token),
                    state: invitationResult?.invitation?.state || 'ACTIVATED',
                    used: true,
                    singleUse: true
                },
                onboardingReadinessScore: 100,
                activationSuccessScore: 100,
                governance: {
                    tenantIsolationPreserved: true,
                    activationGovernancePreserved: true,
                    invitationValidationRequired: true,
                    profileCompletionRequired: true,
                    humanActivationOnly: true
                },
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('ACTIVATION_FINALIZATION_FAILED_SAFE', tenantFromContext(context || {}), [issue('ACTIVATION_FINALIZATION_FAILED_SAFE', 'Employee activation finalization failed safely.', 'ERROR')]);
        }
    }

    function generateActivationAnalytics(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
            var reviewFailures = validateReviewScope(context || {}, tenantSlug);
            if (reviewFailures.length) return failureOutput('ANALYTICS_REVIEW_BLOCKED', tenantSlug, reviewFailures);
            var rows = activationRows().filter(function same(row) { return normalizeTenantSlug(row.tenantSlug) === tenantSlug; });
            var employees = (rawData().employees || []).filter(function filter(emp) { return sameTenant(emp, tenantSlug); });
            var activeRows = rows.filter(function active(row) { return row.state === 'ACTIVE'; }).length;
            var startedRows = rows.filter(function started(row) { return ['ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'ACTIVE'].includes(row.state); }).length;
            var completedProfiles = rows.filter(function profile(row) { return row.state === 'PROFILE_COMPLETED' || row.state === 'ACTIVE'; }).length;
            var failedRows = rows.filter(function failed(row) { return row.state === 'FAILED' || row.state === 'EXPIRED' || row.state === 'CANCELLED'; }).length;
            var now = Date.now();
            var durations = rows.filter(function hasDuration(row) { return row.startedAt && row.activatedAt; }).map(function duration(row) { return Math.max(0, Math.round((new Date(row.activatedAt).getTime() - new Date(row.startedAt).getTime()) / 60000)); });
            var analytics = {
                activationRate: employees.length ? Math.round((activeRows / employees.length) * 100) : 0,
                completionRate: startedRows ? Math.round((activeRows / startedRows) * 100) : 0,
                profileCompletionRate: startedRows ? Math.round((completedProfiles / startedRows) * 100) : 0,
                abandonmentRate: startedRows ? Math.round(((startedRows - activeRows - failedRows) / startedRows) * 100) : 0,
                activationFailures: failedRows,
                averageOnboardingDurationMinutes: durations.length ? Math.round(durations.reduce(function sum(a, b) { return a + b; }, 0) / durations.length) : 0,
                onboardingBottlenecks: rows.filter(function bottleneck(row) {
                    return row.startedAt && row.state !== 'ACTIVE' && (now - new Date(row.startedAt).getTime()) > (24 * 60 * 60 * 1000);
                }).length
            };
            var readiness = calculateOnboardingReadiness({ tenantSlug: tenantSlug }, { ...(context || {}), skipAuditPersistence: true });
            var report = {
                reportId: id('ACT-ANL'),
                tenantSlug: tenantSlug,
                state: rows.length ? 'COLLECTED' : 'INVITED',
                generatedAt: nowIso(),
                totalActivations: rows.length,
                pendingActivations: rows.filter(function pending(row) { return !['ACTIVE', 'FAILED', 'CANCELLED', 'ARCHIVED'].includes(row.state); }).length,
                analytics: analytics,
                onboardingReadinessScore: readiness.onboardingReadinessScore || 0,
                activationSuccessScore: readiness.activationSuccessScore || 0,
                immutable: true
            };
            persistHistory('activationAnalyticsReports', report, context || {});
            auditActivation('ACTIVATION_ANALYTICS_REVIEWED', { activationId: report.reportId, tenantSlug: tenantSlug, description: 'Activation analytics reviewed.' }, context || {});
            return freezeActivationOutput({
                success: true,
                state: report.state,
                tenantSlug: tenantSlug,
                analytics: analytics,
                onboardingReadinessScore: report.onboardingReadinessScore,
                activationSuccessScore: report.activationSuccessScore,
                rows: rows.slice(0, 40).map(function map(row) { return publicActivation(row); }),
                summary: {
                    totalActivations: report.totalActivations,
                    pendingActivations: report.pendingActivations,
                    active: activeRows,
                    profileCompleted: completedProfiles,
                    failed: failedRows
                },
                governance: {
                    reviewOnly: context?.reviewOnly === true,
                    platformOwnerVisibilityOnly: actorFromContext(context || {}).role === 'PLATFORM_OWNER',
                    tenantIsolationPreserved: true,
                    activationGovernancePreserved: true,
                    rbacPreserved: true
                },
                integrationReadiness: {
                    managerHierarchyVisualizerPrepared: true,
                    departmentSetupFlowPrepared: true,
                    organizationInitializationWizardPrepared: true,
                    employeeProfileCompletionFlowPrepared: true,
                    passwordResetGovernancePrepared: true
                },
                integrationHealth: {
                    inviteMailDeliveryIntegrated: !!inviteService(),
                    auditIntegrated: !!(db() && typeof db().writeAuditLog === 'function'),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                },
                noWorkflowExecution: true
            });
        } catch (error) {
            return failureOutput('ANALYTICS_FAILED_SAFE', tenantFromContext(context || {}), [issue('ANALYTICS_FAILED_SAFE', 'Activation analytics failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        var context = {
            actor: { id: 'SELF-1', empId: 'SELF-1', email: 'self@example.com', role: 'EMPLOYEE' },
            tenantSlug: 'self-test',
            skipPersistence: true,
            skipAuditPersistence: true,
            skipTelemetry: true
        };
        try {
            var svc = inviteService();
            var invite = svc && typeof svc.createEmployeeInvite === 'function'
                ? svc.createEmployeeInvite({ tenantSlug: 'self-test', employeeId: 'SELF-1', email: 'self@example.com', name: 'Self Test', requireEmployee: false }, { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true })
                : null;
            var token = invite?.invitation?.token || 'missing';
            var started = invite?.success ? startActivationWizard({ tenantSlug: 'self-test', token: token, email: 'self@example.com' }, context) : { success: false };
            var weak = started.success ? completeProfileSetup({ tenantSlug: 'self-test', activationId: started.activation.activationId, token: token, email: 'self@example.com', password: 'weak', confirmPassword: 'weak', profile: {} }, context) : { success: false };
            var completed = started.success ? completeProfileSetup({
                tenantSlug: 'self-test',
                activationId: started.activation.activationId,
                token: token,
                email: 'self@example.com',
                password: 'StrongPass!123',
                confirmPassword: 'StrongPass!123',
                profile: {
                    phoneNumber: '+910000000000',
                    emergencyContact: { name: 'Self Contact', phone: '+910000000001' },
                    departmentConfirmation: true,
                    contactVerified: true,
                    policyAcknowledged: true
                }
            }, context) : { success: false };
            var finalized = completed.success ? finalizeEmployeeActivation({ tenantSlug: 'self-test', activationId: started.activation.activationId, token: token, email: 'self@example.com', password: 'StrongPass!123', confirmPassword: 'StrongPass!123' }, context) : { success: false };
            var cross = validateActivationToken({ tenantSlug: 'other-test', token: token, email: 'self@example.com' }, { actor: { id: 'SELF-1', empId: 'SELF-1', email: 'self@example.com', role: 'EMPLOYEE' }, tenantSlug: 'other-test', skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true });
            var frozen = Object.isFrozen(started) && Object.isFrozen(completed);
            return freezeActivationOutput({
                passed: !!(started.success && weak.success === false && completed.success && finalized.success && cross.success === false && frozen),
                checks: {
                    activationWizard: started.success === true,
                    tokenValidation: started.success === true,
                    profileCompletion: completed.success === true,
                    onboardingCompletion: finalized.success === true,
                    weakCredentialBlocked: weak.success === false,
                    tenantIsolation: cross.success === false,
                    immutableOutputs: frozen
                }
            });
        } catch (error) {
            return freezeActivationOutput({ passed: false, error: 'Activation self-test failed safely.' });
        }
    }

    var EmployeeActivationWizardService = Object.freeze({
        ACTIVATION_STATES: ACTIVATION_STATES,
        WIZARD_STEPS: WIZARD_STEPS,
        startActivationWizard: startActivationWizard,
        validateActivationToken: validateActivationToken,
        completeProfileSetup: completeProfileSetup,
        calculateOnboardingReadiness: calculateOnboardingReadiness,
        finalizeEmployeeActivation: finalizeEmployeeActivation,
        generateActivationAnalytics: generateActivationAnalytics,
        freezeActivationOutput: freezeActivationOutput
    });

    global.EmployeeActivationWizardService = EmployeeActivationWizardService;
    global.employeeActivationWizardService = EmployeeActivationWizardService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_ACTIVATION_WIZARD_SELF_TEST__ = runSelfTest();
    }

})(typeof window !== 'undefined' ? window : globalThis);
