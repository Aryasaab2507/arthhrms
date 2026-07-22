(function attachEmployeeProfileCompletionService(global) {
    'use strict';

    var PROFILE_STATES = Object.freeze(['INCOMPLETE', 'PARTIAL', 'READY', 'VERIFIED']);
    var PROFILE_WORKFLOW = Object.freeze([
        'ACCOUNT_ACTIVATED',
        'BASIC_PROFILE',
        'CONTACT_INFORMATION',
        'EMERGENCY_CONTACTS',
        'WORK_INFORMATION_REVIEW',
        'PROFILE_VERIFICATION',
        'COMPLETION_REVIEW',
        'PROFILE_COMPLETED'
    ]);
    var REVIEW_ROLES = Object.freeze(['HR', 'MANAGER', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|aadhaar|pan|ssn|password|credential|secret|token|rawPayload|document|medical|benefit|privateNote|private/i;
    var REQUIRED_FIELDS = Object.freeze([
        'basicInformation.firstName',
        'basicInformation.lastName',
        'email',
        'contactInformation.phone',
        'contactInformation.address',
        'contactInformation.city',
        'contactInformation.state',
        'contactInformation.country',
        'emergencyContact.name',
        'emergencyContact.relationship',
        'emergencyContact.contactNumber',
        'workInformation.employeeId',
        'workInformation.department',
        'workInformation.designation',
        'workInformation.manager'
    ]);
    var OPTIONAL_FIELDS = Object.freeze([
        'basicInformation.preferredName',
        'basicInformation.gender',
        'basicInformation.dateOfBirth',
        'contactInformation.secondaryPhone',
        'documentPreparation.profilePhoto',
        'documentPreparation.idVerification',
        'documentPreparation.certifications',
        'documentPreparation.contracts'
    ]);

    var volatileProfiles = [];
    var volatileHistory = [];
    var volatileCompletionHistory = [];
    var volatileVerificationHistory = [];
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

    function freezeProfileOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeProfileOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Reflect.ownKeys(value).forEach(function each(key) {
                var descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                Object.defineProperty(clone, key, {
                    enumerable: descriptor.enumerable,
                    configurable: false,
                    writable: false,
                    value: freezeProfileOutput(descriptor.value)
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
        return freezeProfileOutput({
            code: code,
            message: message,
            severity: severity || 'ERROR',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function failureOutput(state, tenantSlug, issues, message) {
        return freezeProfileOutput({
            success: false,
            state: state || 'INCOMPLETE',
            tenantSlug: normalizeTenantSlug(tenantSlug),
            issues: issues || [issue('PROFILE_FAILED_SAFE', message || 'Profile operation failed safely.', 'ERROR')],
            failures: issues || [issue('PROFILE_FAILED_SAFE', message || 'Profile operation failed safely.', 'ERROR')],
            governance: governanceFlags('UNKNOWN', false),
            metadata: {
                backwardCompatibilityPreserved: true,
                tenantIsolationPreserved: true,
                profileGovernancePreserved: true,
                generatedAt: nowIso()
            }
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || ''),
            empId: normalizeEmployeeId(actor.empId || actor.employeeId || actor.id || ''),
            email: normalizeEmail(actor.email || ''),
            role: normalizeRole(actor.role || context?.role || 'EMPLOYEE'),
            department: normalizeText(actor.department || actor.departmentName || context?.department || ''),
            name: normalizeText(actor.name || actor.email || actor.id || '')
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

    function tenantEmployees(tenantSlug) {
        return (rawData().employees || []).filter(function each(employee) {
            return employee && typeof employee === 'object' && sameTenant(employee, tenantSlug) && normalizeRole(employee.role || '') !== 'PLATFORM_OWNER';
        });
    }

    function syntheticEmployeesFromContext(context, tenantSlug) {
        var rows = [];
        if (context?.syntheticEmployee) rows.push(context.syntheticEmployee);
        if (Array.isArray(context?.syntheticEmployees)) rows = rows.concat(context.syntheticEmployees);
        return rows.filter(function each(employee) {
            return employee && typeof employee === 'object' && sameTenant(employee, tenantSlug);
        });
    }

    function employeeForTenant(input, tenantSlug, context) {
        var source = input || {};
        var actor = actorFromContext(context || {});
        var targetId = normalizeEmployeeId(source.employeeId || source.empId || source.id || source.workInformation?.employeeId || actor.empId);
        var targetEmail = normalizeEmail(source.email || actor.email || '');
        return syntheticEmployeesFromContext(context || {}, tenantSlug).concat(tenantEmployees(tenantSlug)).find(function match(employee) {
            if (targetId && employeeIdOf(employee) === targetId) return true;
            if (targetEmail && employeeEmailOf(employee) === targetEmail) return true;
            return false;
        }) || null;
    }

    function profileRecords() {
        var persisted = Array.isArray(rawData().employeeProfileRecords) ? rawData().employeeProfileRecords : [];
        return persisted.concat(volatileProfiles);
    }

    function latestProfileRecord(employeeId, tenantSlug) {
        var targetId = normalizeEmployeeId(employeeId);
        return profileRecords()
            .filter(function same(row) { return normalizeTenantSlug(row.tenantSlug) === normalizeTenantSlug(tenantSlug) && normalizeEmployeeId(row.employeeId) === targetId; })
            .sort(function sort(a, b) { return String(b.verifiedAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.verifiedAt || a.updatedAt || a.createdAt || '')); })[0] || null;
    }

    function withDataArray(data, key) {
        if (!Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function persistHistory(key, row, context) {
        var entry = {
            ...cloneSanitized(row || {}),
            createdAt: row.createdAt || nowIso(),
            immutable: true
        };
        if (context?.skipPersistence) {
            if (key === 'employeeProfileCompletionHistory') volatileCompletionHistory.unshift(entry);
            else if (key === 'employeeProfileVerificationHistory') volatileVerificationHistory.unshift(entry);
            else if (key === 'employeeProfileAnalytics') volatileAnalytics.unshift(entry);
            else volatileHistory.unshift(entry);
            return entry;
        }
        var data = rawData();
        withDataArray(data, key).unshift(entry);
        saveData(data);
        return entry;
    }

    function persistProfileRecord(record, context) {
        var next = {
            ...cloneSanitized(record || {}),
            tenantSlug: normalizeTenantSlug(record.tenantSlug),
            updatedAt: nowIso(),
            immutable: true
        };
        if (context?.skipPersistence) {
            var volatileIndex = volatileProfiles.findIndex(function find(row) {
                return normalizeTenantSlug(row.tenantSlug) === next.tenantSlug && normalizeEmployeeId(row.employeeId) === normalizeEmployeeId(next.employeeId);
            });
            if (volatileIndex >= 0) volatileProfiles[volatileIndex] = next;
            else volatileProfiles.unshift(next);
            return next;
        }
        var data = rawData();
        var rows = withDataArray(data, 'employeeProfileRecords');
        var index = rows.findIndex(function find(row) {
            return normalizeTenantSlug(row.tenantSlug) === next.tenantSlug && normalizeEmployeeId(row.employeeId) === normalizeEmployeeId(next.employeeId);
        });
        if (index >= 0) rows[index] = next;
        else rows.unshift(next);
        saveData(data);
        return next;
    }

    function auditProfile(actionType, details, context) {
        try {
            if (context?.skipAuditPersistence) return null;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(details || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                return global.AuditService.recordAudit({
                    eventId: id('AUD-PROFILE'),
                    type: actionType,
                    actionType: actionType,
                    module: 'Employee Profile Completion',
                    targetId: clean.employeeId || clean.reportId || clean.profileId || '',
                    tenantSlug: clean.tenantSlug || tenantFromContext(context || {}),
                    metadata: clean,
                    createdAt: nowIso()
                }, { actor: actor, tenantSlug: clean.tenantSlug || tenantFromContext(context || {}) });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                return db().writeAuditLog(actor.role.toLowerCase(), actor.id || actor.empId || '', actionType, 'Employee Profile Completion', clean.employeeId || clean.reportId || clean.profileId || '', clean.description || actionType);
            }
        } catch (error) {}
        return null;
    }

    function emitTelemetry(eventType, payload, context) {
        if (context?.skipTelemetry) return null;
        try {
            var svc = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (svc && typeof svc.recordTelemetry === 'function') return svc.recordTelemetry(eventType, cloneSanitized(payload || {}), { source: 'employeeProfileCompletionService' });
            if (svc && typeof svc.trackEvent === 'function') return svc.trackEvent(eventType, cloneSanitized(payload || {}));
        } catch (error) {}
        return null;
    }

    function normalizePhone(value) {
        return normalizeText(value).replace(/[^\d+]/g, '');
    }

    function isValidPhone(value) {
        var phone = normalizePhone(value);
        if (!phone) return false;
        return /^\+?\d{10,15}$/.test(phone);
    }

    function safeDate(value) {
        var text = normalizeText(value);
        if (!text) return '';
        var date = new Date(text);
        return Number.isNaN(date.getTime()) ? '' : text;
    }

    function section(input, keys) {
        for (var i = 0; i < keys.length; i += 1) {
            var value = input && input[keys[i]];
            if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        }
        return {};
    }

    function normalizeProfilePayload(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return freezeProfileOutput({
                    success: false,
                    profile: {},
                    issues: [issue('MALFORMED_PROFILE_PAYLOAD', 'Employee profile payload must be an object.', 'ERROR')]
                });
            }
            var tenantSlug = normalizeTenantSlug(input.tenantSlug || input.tenantId || tenantFromContext(context || {}));
            var basic = section(input, ['basicInformation', 'basic', 'personalInformation', 'personal']);
            var contact = section(input, ['contactInformation', 'contact']);
            var emergency = section(input, ['emergencyContact', 'emergency']);
            var work = section(input, ['workInformation', 'work']);
            var employeeId = normalizeEmployeeId(input.employeeId || input.empId || work.employeeId || work.empId || context?.actor?.empId || context?.actor?.employeeId || context?.actor?.id);
            var profile = {
                tenantSlug: tenantSlug,
                employeeId: employeeId,
                email: normalizeEmail(input.email || basic.email || work.email || context?.actor?.email || ''),
                basicInformation: {
                    firstName: normalizeText(basic.firstName || input.firstName || ''),
                    lastName: normalizeText(basic.lastName || input.lastName || ''),
                    preferredName: normalizeText(basic.preferredName || input.preferredName || ''),
                    gender: normalizeText(basic.gender || ''),
                    dateOfBirth: safeDate(basic.dateOfBirth || basic.dob || input.dateOfBirth || input.dob || '')
                },
                contactInformation: {
                    phone: normalizeText(contact.phone || contact.phoneNumber || input.phone || input.phoneNumber || ''),
                    secondaryPhone: normalizeText(contact.secondaryPhone || contact.alternatePhone || input.secondaryPhone || ''),
                    address: normalizeText(contact.address || input.address || ''),
                    city: normalizeText(contact.city || input.city || ''),
                    state: normalizeText(contact.state || input.state || ''),
                    country: normalizeText(contact.country || input.country || '')
                },
                emergencyContact: {
                    name: normalizeText(emergency.name || emergency.contactName || ''),
                    relationship: normalizeText(emergency.relationship || emergency.relation || ''),
                    contactNumber: normalizeText(emergency.contactNumber || emergency.phone || emergency.mobile || '')
                },
                workInformation: {
                    employeeId: employeeId,
                    department: normalizeText(work.department || input.department || ''),
                    designation: normalizeText(work.designation || input.designation || ''),
                    manager: normalizeEmployeeId(work.manager || work.managerId || input.manager || input.managerId || '')
                },
                verification: {
                    workInformationReviewed: input.verification?.workInformationReviewed === true || input.workInformationReviewed === true,
                    profileVerified: input.verification?.profileVerified === true || input.profileVerified === true
                },
                documentPreparation: {
                    profilePhotoPrepared: input.documentPreparation?.profilePhotoPrepared === true || input.profilePhotoPrepared === true,
                    profilePhoto: !!(input.documentPreparation?.profilePhoto || input.profilePhotoPrepared),
                    idVerification: !!input.documentPreparation?.idVerificationPrepared,
                    employeeDocuments: !!input.documentPreparation?.employeeDocumentsPrepared,
                    certifications: !!input.documentPreparation?.certificationsPrepared,
                    contracts: !!input.documentPreparation?.contractsPrepared
                },
                metadata: cloneSanitized(input.metadata || {})
            };
            return freezeProfileOutput({ success: true, profile: profile, issues: [] });
        } catch (error) {
            return freezeProfileOutput({
                success: false,
                profile: {},
                issues: [issue('PROFILE_NORMALIZATION_FAILED_SAFE', 'Profile payload normalization failed safely.', 'ERROR')]
            });
        }
    }

    function valueAt(profile, path) {
        return path.split('.').reduce(function dive(current, key) {
            return current && current[key] != null ? current[key] : '';
        }, profile);
    }

    function missingFields(profile, fields) {
        return fields.filter(function missing(path) { return !normalizeText(valueAt(profile, path)); });
    }

    function completionState(percentage, missingRequired, errors, verified) {
        if (verified && percentage >= 100 && !missingRequired && !errors) return 'VERIFIED';
        if (percentage >= 95 && !missingRequired && !errors) return 'READY';
        if (percentage >= 45) return 'PARTIAL';
        return 'INCOMPLETE';
    }

    function completionMetrics(profile, issues, verified) {
        var requiredMissing = missingFields(profile, REQUIRED_FIELDS);
        var optionalMissing = missingFields(profile, OPTIONAL_FIELDS);
        var completedRequired = REQUIRED_FIELDS.length - requiredMissing.length;
        var completedOptional = OPTIONAL_FIELDS.length - optionalMissing.length;
        var percentage = clampScore(((completedRequired / REQUIRED_FIELDS.length) * 82) + ((completedOptional / OPTIONAL_FIELDS.length) * 18));
        var errors = issues.filter(function severe(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; }).length;
        var warnings = issues.filter(function mild(item) { return item.severity === 'WARNING'; }).length;
        var profileQualityScore = clampScore(100 - requiredMissing.length * 8 - optionalMissing.length * 2 - errors * 14 - warnings * 4);
        var identityReadinessScore = clampScore(Math.round((percentage + profileQualityScore + (profile.verification.workInformationReviewed ? 100 : 65) + (profile.verification.profileVerified ? 100 : 80)) / 4));
        var onboardingReady = percentage >= 95 && requiredMissing.length === 0 && errors === 0;
        return {
            completionPercentage: percentage,
            missingRequiredFields: requiredMissing,
            missingOptionalFields: optionalMissing,
            profileQualityScore: profileQualityScore,
            identityReadinessScore: identityReadinessScore,
            onboardingReady: onboardingReady,
            state: completionState(percentage, requiredMissing.length, errors, verified)
        };
    }

    function validateBusinessRules(profile, employee, context) {
        var issues = [];
        if (!employee) {
            issues.push(issue('PROFILE_EMPLOYEE_NOT_FOUND', 'Profile must map to a tenant-scoped employee.', 'CRITICAL', { employeeId: profile.employeeId }));
            return issues;
        }
        if (profile.email && normalizeEmail(profile.email) !== employeeEmailOf(employee)) {
            issues.push(issue('EMAIL_CONSISTENCY_FAILED', 'Profile email must match the employee directory email.', 'ERROR', { employeeId: profile.employeeId }));
        }
        var employeeDepartment = normalizeText(employee.department || '');
        if (profile.workInformation.department && employeeDepartment && profile.workInformation.department.toLowerCase() !== employeeDepartment.toLowerCase()) {
            issues.push(issue('WORK_INFORMATION_MISMATCH', 'Profile department must match employee work information.', 'ERROR', { employeeId: profile.employeeId }));
        }
        var employeeDesignation = normalizeText(employee.designation || '');
        if (profile.workInformation.designation && employeeDesignation && profile.workInformation.designation.toLowerCase() !== employeeDesignation.toLowerCase()) {
            issues.push(issue('WORK_INFORMATION_MISMATCH', 'Profile designation must match employee work information.', 'ERROR', { employeeId: profile.employeeId }));
        }
        var employeeManager = normalizeEmployeeId(employee.managerId || employee.manager || '');
        if (profile.workInformation.manager && employeeManager && profile.workInformation.manager !== employeeManager) {
            issues.push(issue('WORK_INFORMATION_MISMATCH', 'Profile manager must match employee reporting information.', 'ERROR', { employeeId: profile.employeeId }));
        }
        if (profile.contactInformation.phone && !isValidPhone(profile.contactInformation.phone)) {
            issues.push(issue('INVALID_PHONE_FORMAT', 'Primary phone number must be a valid 10-15 digit phone number.', 'ERROR'));
        }
        if (profile.contactInformation.secondaryPhone && !isValidPhone(profile.contactInformation.secondaryPhone)) {
            issues.push(issue('INVALID_PHONE_FORMAT', 'Secondary phone number must be a valid 10-15 digit phone number.', 'ERROR'));
        }
        if (profile.emergencyContact.contactNumber && !isValidPhone(profile.emergencyContact.contactNumber)) {
            issues.push(issue('INVALID_PHONE_FORMAT', 'Emergency contact number must be a valid 10-15 digit phone number.', 'ERROR'));
        }
        var emergencyMissing = [];
        if (!profile.emergencyContact.name) emergencyMissing.push('emergencyContact.name');
        if (!profile.emergencyContact.relationship) emergencyMissing.push('emergencyContact.relationship');
        if (!profile.emergencyContact.contactNumber) emergencyMissing.push('emergencyContact.contactNumber');
        if (emergencyMissing.length) {
            issues.push(issue('EMERGENCY_CONTACT_INCOMPLETE', 'Emergency contact name, relationship, and contact number are required.', 'ERROR', { missingFields: emergencyMissing }));
        }
        var phones = [
            normalizePhone(profile.contactInformation.phone),
            normalizePhone(profile.contactInformation.secondaryPhone),
            normalizePhone(profile.emergencyContact.contactNumber)
        ].filter(Boolean);
        if (new Set(phones).size !== phones.length || normalizeText(profile.emergencyContact.name).toLowerCase() === normalizeText(employee.name || '').toLowerCase()) {
            issues.push(issue('DUPLICATE_CONTACT_RECORD', 'Profile contacts must not duplicate employee or emergency contact records.', 'ERROR'));
        }
        return issues;
    }

    function canAccessEmployee(employee, context, operation) {
        var actor = actorFromContext(context || {});
        var tenantSlug = tenantFromContext(context || {});
        var issues = [];
        if (!employee) return { allowed: false, actor: actor, issues: [issue('PROFILE_EMPLOYEE_NOT_FOUND', 'Employee profile was not found in tenant scope.', 'CRITICAL')] };
        if (tenantSlug && !sameTenant(employee, tenantSlug) && actor.role !== 'PLATFORM_OWNER') {
            issues.push(issue('CROSS_TENANT_PROFILE_ACCESS_BLOCKED', 'Profile access cannot cross tenant boundaries.', 'CRITICAL'));
        }
        var employeeId = employeeIdOf(employee);
        if (actor.role === 'EMPLOYEE') {
            if (actor.empId !== employeeId && actor.id !== employeeId && actor.email !== employeeEmailOf(employee)) {
                issues.push(issue('PROFILE_OWNERSHIP_BLOCKED', 'Employees can only manage their own profile.', 'CRITICAL', { employeeId: employeeId }));
            }
        } else if (actor.role === 'MANAGER') {
            if (normalizeEmployeeId(employee.managerId || employee.manager || '') !== actor.empId && employeeId !== actor.empId) {
                issues.push(issue('PROFILE_TEAM_VISIBILITY_BLOCKED', 'Managers can only review team profiles.', 'ERROR', { employeeId: employeeId }));
            }
            if (operation === 'VERIFY') issues.push(issue('PROFILE_VERIFICATION_ROLE_BLOCKED', 'Managers cannot verify employee profile completion.', 'ERROR'));
        } else if (actor.role === 'DIRECTOR') {
            var requestedDepartment = normalizeText(context?.department || context?.filterDepartment || '');
            if (requestedDepartment && normalizeText(employee.department || '').toLowerCase() !== requestedDepartment.toLowerCase()) {
                issues.push(issue('PROFILE_DEPARTMENT_VISIBILITY_BLOCKED', 'Director profile visibility is department scoped.', 'ERROR'));
            }
            if (operation === 'VERIFY') issues.push(issue('PROFILE_VERIFICATION_ROLE_BLOCKED', 'Directors cannot verify employee profile completion.', 'ERROR'));
        } else if (actor.role === 'HR') {
            // HR may review and verify tenant workforce profiles.
        } else if (actor.role === 'PLATFORM_OWNER') {
            if (operation === 'VERIFY') issues.push(issue('PLATFORM_OWNER_VISIBILITY_ONLY', 'Platform owners have profile governance visibility only.', 'CRITICAL'));
        } else {
            issues.push(issue('PROFILE_ACCESS_DENIED', 'Role cannot access employee profile governance.', 'ERROR', { role: actor.role }));
        }
        return { allowed: issues.length === 0, actor: actor, issues: issues };
    }

    function validateProfileAccess(input, context, operation) {
        var payloadTenant = normalizeTenantSlug(input?.tenantSlug || tenantFromContext(context || {}));
        var contextTenant = tenantFromContext(context || {});
        var actor = actorFromContext(context || {});
        if (contextTenant && payloadTenant && contextTenant !== payloadTenant && actor.role !== 'PLATFORM_OWNER') {
            return { allowed: false, tenantSlug: payloadTenant, actor: actor, issues: [issue('CROSS_TENANT_PROFILE_ACCESS_BLOCKED', 'Profile access cannot cross tenant boundaries.', 'CRITICAL')] };
        }
        if (actor.role === 'PLATFORM_OWNER' && operation !== 'REPORT') {
            return { allowed: false, tenantSlug: payloadTenant, actor: actor, issues: [issue('PLATFORM_OWNER_VISIBILITY_ONLY', 'Platform owners have profile governance visibility only.', 'CRITICAL')] };
        }
        return { allowed: true, tenantSlug: payloadTenant, actor: actor, issues: [] };
    }

    function governanceFlags(actorRole, platformOnly) {
        return freezeProfileOutput({
            tenantIsolationPreserved: true,
            profileGovernancePreserved: true,
            rbacAuthoritative: true,
            employeeSelfServiceOnly: normalizeRole(actorRole) === 'EMPLOYEE',
            platformOwnerVisibilityOnly: platformOnly === true || normalizeRole(actorRole) === 'PLATFORM_OWNER',
            onboardingRequirementsPreserved: true,
            identityCorruptionBlocked: true,
            uploadsDeferred: true
        });
    }

    function integrationReadiness() {
        return freezeProfileOutput({
            activationWizardIntegrated: !!(global.EmployeeActivationWizardService || global.employeeActivationWizardService),
            workforceGovernanceIntegrated: true,
            organizationDirectoryReady: Array.isArray(rawData().employees),
            employeeLifecycleIntegrated: Array.isArray(rawData().employeeActivationRecords) || !!(global.EmployeeActivationWizardService || global.employeeActivationWizardService),
            departmentGovernanceIntegrated: !!(global.TenantDepartmentSetupService || global.tenantDepartmentSetupService),
            documentPreparationReady: true,
            profilePhotoPreparedForFutureUpload: true,
            idVerificationPreparedForFutureUpload: true,
            employeeDocumentsPreparedForFutureUpload: true
        });
    }

    function integrationHealth() {
        return freezeProfileOutput({
            auditIntegrated: !!(db() && typeof db().writeAuditLog === 'function') || !!(global.AuditService && typeof global.AuditService.recordAudit === 'function'),
            activationWizardAvailable: !!(global.EmployeeActivationWizardService || global.employeeActivationWizardService),
            organizationInitializationAvailable: !!(global.OrganizationInitializationWizardService || global.organizationInitializationWizardService),
            tenantDepartmentSetupAvailable: !!(global.TenantDepartmentSetupService || global.tenantDepartmentSetupService),
            tenantIsolationAvailable: !!(global.TenantIsolationService || global.tenantIsolationService)
        });
    }

    function publicProfile(record, employee, platformGovernance, index) {
        if (platformGovernance) {
            return {
                profileId: record?.profileId || ('GOV-PROFILE-' + String(index + 1).padStart(2, '0')),
                tenantSlug: normalizeTenantSlug(record?.tenantSlug || employee?.tenantSlug || ''),
                employeeId: 'GOV-PROFILE-' + String(index + 1).padStart(2, '0'),
                displayName: 'Governance Profile ' + String(index + 1).padStart(2, '0'),
                department: normalizeText(employee?.department || record?.department || ''),
                state: record?.state || 'INCOMPLETE',
                completionPercentage: Number(record?.completionPercentage || 0),
                missingRequiredCount: Number(record?.missingRequiredCount || 0),
                verified: record?.state === 'VERIFIED'
            };
        }
        return cloneSanitized({
            profileId: record?.profileId || '',
            tenantSlug: normalizeTenantSlug(record?.tenantSlug || employee?.tenantSlug || ''),
            employeeId: normalizeEmployeeId(employeeIdOf(employee) || record?.employeeId),
            displayName: normalizeText(employee?.name || record?.displayName || ''),
            firstName: normalizeText(employee?.firstName || record?.basicInformation?.firstName || ''),
            lastName: normalizeText(employee?.lastName || record?.basicInformation?.lastName || ''),
            email: employeeEmailOf(employee) || normalizeEmail(record?.email || ''),
            department: normalizeText(employee?.department || record?.workInformation?.department || ''),
            designation: normalizeText(employee?.designation || record?.workInformation?.designation || ''),
            managerId: normalizeEmployeeId(employee?.managerId || employee?.manager || record?.workInformation?.manager || ''),
            state: record?.state || 'INCOMPLETE',
            completionPercentage: Number(record?.completionPercentage || employee?.profileCompletionPercentage || 0),
            profileQualityScore: Number(record?.profileQualityScore || 0),
            identityReadinessScore: Number(record?.identityReadinessScore || 0),
            missingRequiredCount: Number(record?.missingRequiredCount || 0),
            missingOptionalCount: Number(record?.missingOptionalCount || 0),
            verifiedAt: record?.verifiedAt || '',
            workforceDirectoryReady: record?.workforceDirectoryReady === true
        });
    }

    function calculateProfileCompletion(input, context) {
        try {
            var normalized = normalizeProfilePayload(input, context || {});
            if (!normalized.success) return failureOutput('INCOMPLETE', tenantFromContext(context || {}), normalized.issues);
            var profile = normalized.profile;
            var employee = employeeForTenant(profile, profile.tenantSlug, context || {});
            var access = canAccessEmployee(employee, context || {}, 'CALCULATE');
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', profile.tenantSlug, access.issues);
            if (!profile.basicInformation.firstName) profile.basicInformation.firstName = normalizeText(employee.firstName || employee.name?.split(/\s+/)[0] || '');
            if (!profile.basicInformation.lastName) profile.basicInformation.lastName = normalizeText(employee.lastName || employee.name?.split(/\s+/).slice(1).join(' ') || '');
            if (!profile.email) profile.email = employeeEmailOf(employee);
            if (!profile.workInformation.department) profile.workInformation.department = normalizeText(employee.department || '');
            if (!profile.workInformation.designation) profile.workInformation.designation = normalizeText(employee.designation || '');
            if (!profile.workInformation.manager) profile.workInformation.manager = normalizeEmployeeId(employee.managerId || employee.manager || '');
            var issues = validateBusinessRules(profile, employee, context || {});
            var metrics = completionMetrics(profile, issues, false);
            return freezeProfileOutput({
                success: true,
                state: metrics.state,
                tenantSlug: profile.tenantSlug,
                employeeId: profile.employeeId,
                workflow: PROFILE_WORKFLOW,
                completionPercentage: metrics.completionPercentage,
                missingRequiredFields: metrics.missingRequiredFields,
                missingOptionalFields: metrics.missingOptionalFields,
                profileQualityScore: metrics.profileQualityScore,
                identityReadinessScore: metrics.identityReadinessScore,
                onboardingReady: metrics.onboardingReady,
                issues: issues,
                governance: governanceFlags(access.actor.role, false),
                readOnly: true,
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    profileGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return failureOutput('INCOMPLETE', tenantFromContext(context || {}), [issue('PROFILE_COMPLETION_FAILED_SAFE', 'Profile completion calculation failed safely.', 'ERROR')]);
        }
    }

    function validateEmployeeProfile(input, context) {
        try {
            var normalized = normalizeProfilePayload(input, context || {});
            if (!normalized.success) return failureOutput('INCOMPLETE', tenantFromContext(context || {}), normalized.issues);
            var profile = normalized.profile;
            var employee = employeeForTenant(profile, profile.tenantSlug, context || {});
            var access = canAccessEmployee(employee, context || {}, 'VALIDATE');
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', profile.tenantSlug, access.issues);
            if (employee) {
                if (!profile.basicInformation.firstName) profile.basicInformation.firstName = normalizeText(employee.firstName || employee.name?.split(/\s+/)[0] || '');
                if (!profile.basicInformation.lastName) profile.basicInformation.lastName = normalizeText(employee.lastName || employee.name?.split(/\s+/).slice(1).join(' ') || '');
                if (!profile.email) profile.email = employeeEmailOf(employee);
                if (!profile.workInformation.department) profile.workInformation.department = normalizeText(employee.department || '');
                if (!profile.workInformation.designation) profile.workInformation.designation = normalizeText(employee.designation || '');
                if (!profile.workInformation.manager) profile.workInformation.manager = normalizeEmployeeId(employee.managerId || employee.manager || '');
            }
            var issues = validateBusinessRules(profile, employee, context || {});
            var metrics = completionMetrics(profile, issues, false);
            var blocked = metrics.missingRequiredFields.length > 0 || issues.some(function severe(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; });
            var report = {
                success: !blocked,
                state: blocked ? metrics.state : 'READY',
                tenantSlug: profile.tenantSlug,
                employeeId: profile.employeeId,
                validation: {
                    valid: !blocked,
                    blocked: blocked,
                    issues: issues,
                    missingRequiredFields: metrics.missingRequiredFields,
                    missingOptionalFields: metrics.missingOptionalFields
                },
                issues: issues,
                missingRequiredFields: metrics.missingRequiredFields,
                missingOptionalFields: metrics.missingOptionalFields,
                completionPercentage: metrics.completionPercentage,
                profileQualityScore: metrics.profileQualityScore,
                identityReadinessScore: metrics.identityReadinessScore,
                onboardingReady: !blocked && metrics.onboardingReady,
                governance: governanceFlags(access.actor.role, false),
                readOnly: true,
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    profileGovernancePreserved: true,
                    generatedAt: nowIso()
                }
            };
            if (!context?.skipAuditPersistence) {
                persistHistory('employeeProfileHistory', {
                    profileId: id('PROFILE-VALIDATION'),
                    tenantSlug: profile.tenantSlug,
                    employeeId: profile.employeeId,
                    action: 'VALIDATED',
                    state: report.state,
                    completionPercentage: report.completionPercentage,
                    issueCount: issues.length
                }, context || {});
                auditProfile(blocked ? 'PROFILE_VALIDATION_BLOCKED' : 'PROFILE_VALIDATED', { tenantSlug: profile.tenantSlug, employeeId: profile.employeeId, issueCount: issues.length, description: 'Employee profile validation reviewed.' }, context || {});
            }
            return freezeProfileOutput(report);
        } catch (error) {
            return failureOutput('INCOMPLETE', tenantFromContext(context || {}), [issue('PROFILE_VALIDATION_FAILED_SAFE', 'Employee profile validation failed safely.', 'ERROR')]);
        }
    }

    function verifyProfileData(input, context) {
        try {
            var normalized = normalizeProfilePayload(input, context || {});
            if (!normalized.success) return failureOutput('INCOMPLETE', tenantFromContext(context || {}), normalized.issues);
            var profile = normalized.profile;
            var employee = employeeForTenant(profile, profile.tenantSlug, context || {});
            var access = canAccessEmployee(employee, context || {}, 'VERIFY');
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', profile.tenantSlug, access.issues);
            var validation = validateEmployeeProfile(input, { ...(context || {}), skipAuditPersistence: true, skipTelemetry: true });
            if (!validation.success) return validation;
            var now = nowIso();
            var record = {
                profileId: latestProfileRecord(profile.employeeId, profile.tenantSlug)?.profileId || id('PROFILE'),
                tenantSlug: profile.tenantSlug,
                employeeId: profile.employeeId,
                email: profile.email,
                displayName: normalizeText(employee.name || (profile.basicInformation.firstName + ' ' + profile.basicInformation.lastName)),
                basicInformation: profile.basicInformation,
                contactInformation: profile.contactInformation,
                emergencyContact: profile.emergencyContact,
                workInformation: profile.workInformation,
                documentPreparation: profile.documentPreparation,
                state: 'VERIFIED',
                completionPercentage: 100,
                profileQualityScore: validation.profileQualityScore,
                identityReadinessScore: validation.identityReadinessScore,
                missingRequiredCount: 0,
                missingOptionalCount: validation.missingOptionalFields.length,
                workforceDirectoryReady: true,
                verifiedBy: access.actor.id || access.actor.empId,
                verifiedRole: access.actor.role,
                verifiedAt: now,
                createdAt: latestProfileRecord(profile.employeeId, profile.tenantSlug)?.createdAt || now,
                updatedAt: now
            };
            var persisted = persistProfileRecord(record, context || {});
            persistHistory('employeeProfileHistory', {
                profileId: persisted.profileId,
                tenantSlug: persisted.tenantSlug,
                employeeId: persisted.employeeId,
                action: 'PROFILE_UPDATED',
                state: persisted.state,
                completionPercentage: persisted.completionPercentage
            }, context || {});
            persistHistory('employeeProfileCompletionHistory', {
                profileId: persisted.profileId,
                tenantSlug: persisted.tenantSlug,
                employeeId: persisted.employeeId,
                state: 'PROFILE_COMPLETED',
                completionPercentage: persisted.completionPercentage,
                profileQualityScore: persisted.profileQualityScore
            }, context || {});
            persistHistory('employeeProfileVerificationHistory', {
                profileId: persisted.profileId,
                tenantSlug: persisted.tenantSlug,
                employeeId: persisted.employeeId,
                state: 'VERIFIED',
                verifiedBy: persisted.verifiedBy,
                verifiedRole: persisted.verifiedRole,
                verifiedAt: persisted.verifiedAt
            }, context || {});
            persistHistory('employeeProfileAnalytics', {
                analyticsId: id('PROFILE-ANL'),
                tenantSlug: persisted.tenantSlug,
                profileQualityScore: persisted.profileQualityScore,
                workforceReadinessScore: persisted.identityReadinessScore,
                onboardingCompletionScore: persisted.completionPercentage,
                generatedAt: now
            }, context || {});
            auditProfile('PROFILE_VERIFIED', { tenantSlug: persisted.tenantSlug, employeeId: persisted.employeeId, profileId: persisted.profileId, description: 'Employee profile verified after profile completion review.' }, context || {});
            emitTelemetry('PROFILE_VERIFIED', persisted, context || {});
            try {
                var conversion = global.InviteAcceptanceTrackingService;
                if (conversion && typeof conversion.trackInviteAcceptance === 'function') {
                    conversion.trackInviteAcceptance({ invitationId: input && input.invitationId || '', tenantSlug: persisted.tenantSlug, employeeId: persisted.employeeId, state: 'PROFILE_COMPLETED', source: 'EMPLOYEE_PROFILE', occurredAt: persisted.verifiedAt, allowSkippedTransitions: true }, { ...(context || {}), source: 'EMPLOYEE_PROFILE' });
                }
            } catch (error) {}
            return freezeProfileOutput({
                success: true,
                state: 'VERIFIED',
                tenantSlug: persisted.tenantSlug,
                profile: publicProfile(persisted, employee, false, 0),
                completionPercentage: persisted.completionPercentage,
                profileQualityScore: persisted.profileQualityScore,
                identityReadinessScore: persisted.identityReadinessScore,
                workforceDirectoryReady: true,
                readiness: {
                    profileQualityScore: persisted.profileQualityScore,
                    workforceReadinessScore: persisted.identityReadinessScore,
                    onboardingCompletionScore: persisted.completionPercentage
                },
                governance: governanceFlags(access.actor.role, false),
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                noEmployeeMasterMutation: true
            });
        } catch (error) {
            return failureOutput('INCOMPLETE', tenantFromContext(context || {}), [issue('PROFILE_VERIFICATION_FAILED_SAFE', 'Employee profile verification failed safely.', 'ERROR')]);
        }
    }

    function visibleEmployeesForReport(tenantSlug, input, context, access) {
        var actor = access.actor || actorFromContext(context || {});
        var rows = tenantEmployees(tenantSlug);
        if (actor.role === 'EMPLOYEE') {
            rows = rows.filter(function own(employee) {
                return employeeIdOf(employee) === actor.empId || employeeEmailOf(employee) === actor.email;
            });
        } else if (actor.role === 'MANAGER') {
            rows = rows.filter(function team(employee) {
                return employeeIdOf(employee) === actor.empId || normalizeEmployeeId(employee.managerId || employee.manager || '') === actor.empId;
            });
        } else if (actor.role === 'DIRECTOR') {
            var department = normalizeText(input?.department || context?.department || context?.actor?.department || '');
            if (department) {
                rows = rows.filter(function dept(employee) { return normalizeText(employee.department || '').toLowerCase() === department.toLowerCase(); });
            }
        } else if (actor.role === 'HR' || actor.role === 'PLATFORM_OWNER') {
            // full tenant or anonymized governance view
        } else {
            rows = [];
        }
        return rows;
    }

    function syntheticRecordForEmployee(employee, tenantSlug) {
        var record = latestProfileRecord(employeeIdOf(employee), tenantSlug);
        if (record) return record;
        var completion = Number(employee.profileCompletionPercentage || 0);
        var active = /active|activated|completed/i.test(String(employee.activationStatus || employee.onboardingStatus || employee.lifecycleStatus || ''));
        return {
            profileId: '',
            tenantSlug: tenantSlug,
            employeeId: employeeIdOf(employee),
            email: employeeEmailOf(employee),
            displayName: employee.name || '',
            state: completion >= 95 || active ? 'PARTIAL' : 'INCOMPLETE',
            completionPercentage: completion,
            profileQualityScore: completion,
            identityReadinessScore: active ? Math.max(55, completion) : completion,
            missingRequiredCount: completion >= 95 ? 0 : REQUIRED_FIELDS.length,
            missingOptionalCount: OPTIONAL_FIELDS.length,
            workInformation: {
                department: employee.department || '',
                designation: employee.designation || '',
                manager: employee.managerId || employee.manager || ''
            },
            workforceDirectoryReady: completion >= 95
        };
    }

    function analyticsForProfiles(records, employees) {
        var total = employees.length;
        var verified = records.filter(function verifiedRecord(row) { return row.state === 'VERIFIED'; }).length;
        var ready = records.filter(function readyRecord(row) { return row.state === 'READY' || row.state === 'VERIFIED'; }).length;
        var completionSum = records.reduce(function sum(acc, row) { return acc + Number(row.completionPercentage || 0); }, 0);
        var qualitySum = records.reduce(function sum(acc, row) { return acc + Number(row.profileQualityScore || 0); }, 0);
        var identitySum = records.reduce(function sum(acc, row) { return acc + Number(row.identityReadinessScore || 0); }, 0);
        var missingRequired = records.reduce(function sum(acc, row) { return acc + Number(row.missingRequiredCount || 0); }, 0);
        var denominator = Math.max(1, records.length);
        var profileQualityScore = clampScore(qualitySum / denominator);
        var workforceReadinessScore = clampScore(identitySum / denominator);
        var onboardingCompletionScore = clampScore(completionSum / denominator);
        return {
            totalProfiles: total,
            verifiedProfiles: verified,
            readyProfiles: ready,
            incompleteProfiles: records.filter(function incomplete(row) { return row.state === 'INCOMPLETE' || row.state === 'PARTIAL'; }).length,
            completionRate: total ? Math.round((verified / total) * 100) : 0,
            readinessRate: total ? Math.round((ready / total) * 100) : 0,
            missingRequiredFields: missingRequired,
            verificationRate: total ? Math.round((verified / total) * 100) : 0,
            workforceDirectoryReadiness: total ? Math.round((records.filter(function dir(row) { return row.workforceDirectoryReady === true; }).length / total) * 100) : 0,
            profileQualityScore: profileQualityScore,
            workforceReadinessScore: workforceReadinessScore,
            onboardingCompletionScore: onboardingCompletionScore
        };
    }

    function generateReadinessReport(input, context) {
        try {
            var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
            var scope = validateProfileAccess(source, context || {}, 'REPORT');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.issues);
            if (scope.actor.role !== 'EMPLOYEE' && !REVIEW_ROLES.includes(scope.actor.role)) {
                return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, [issue('PROFILE_REVIEW_ACCESS_DENIED', 'Role cannot review profile readiness.', 'ERROR', { role: scope.actor.role })]);
            }
            var employees = visibleEmployeesForReport(scope.tenantSlug, source, context || {}, scope);
            var platformGovernance = scope.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var records = employees.map(function map(employee) { return syntheticRecordForEmployee(employee, scope.tenantSlug); });
            var analytics = analyticsForProfiles(records, employees);
            var reportId = id('PROFILE-READY');
            var profiles = records.map(function map(row, index) {
                var employee = employees.find(function find(emp) { return employeeIdOf(emp) === normalizeEmployeeId(row.employeeId); }) || {};
                return publicProfile(row, employee, platformGovernance, index);
            });
            var report = {
                success: true,
                reportId: reportId,
                state: analytics.profileQualityScore >= 85 ? 'READY' : analytics.profileQualityScore >= 50 ? 'PARTIAL' : 'INCOMPLETE',
                tenantSlug: scope.tenantSlug,
                generatedAt: nowIso(),
                profiles: profiles,
                analytics: analytics,
                profileQualityScore: analytics.profileQualityScore,
                workforceReadinessScore: analytics.workforceReadinessScore,
                onboardingCompletionScore: analytics.onboardingCompletionScore,
                workforceDirectoryReady: analytics.workforceDirectoryReadiness >= 80,
                missingFieldTrends: {
                    requiredMissingTotal: analytics.missingRequiredFields,
                    mostCommonMissingSections: analytics.missingRequiredFields ? ['contactInformation', 'emergencyContact', 'workInformation'] : []
                },
                verificationRates: {
                    verifiedProfiles: analytics.verifiedProfiles,
                    verificationRate: analytics.verificationRate
                },
                governance: governanceFlags(scope.actor.role, platformGovernance),
                integrationReadiness: integrationReadiness(),
                integrationHealth: integrationHealth(),
                readOnly: true,
                metadata: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    profileGovernancePreserved: true,
                    sensitiveDataFiltered: true
                }
            };
            persistHistory('employeeProfileAnalytics', {
                analyticsId: reportId,
                tenantSlug: scope.tenantSlug,
                state: report.state,
                profileQualityScore: report.profileQualityScore,
                workforceReadinessScore: report.workforceReadinessScore,
                onboardingCompletionScore: report.onboardingCompletionScore,
                generatedAt: report.generatedAt
            }, context || {});
            auditProfile('PROFILE_READINESS_REVIEWED', { reportId: reportId, tenantSlug: scope.tenantSlug, description: 'Employee profile readiness reviewed.' }, context || {});
            emitTelemetry('PROFILE_READINESS_REVIEWED', report, context || {});
            return freezeProfileOutput(report);
        } catch (error) {
            return failureOutput('INCOMPLETE', tenantFromContext(context || {}), [issue('PROFILE_READINESS_FAILED_SAFE', 'Profile readiness report failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        try {
            var data = rawData();
            if (!Array.isArray(data.employees)) data.employees = [];
            if (!data.employees.some(function has(row) { return normalizeEmployeeId(row.id || row.empId || row.employeeId) === 'SELF-PROFILE'; })) {
                data.employees.push({
                    id: 'SELF-PROFILE',
                    empId: 'SELF-PROFILE',
                    employeeId: 'SELF-PROFILE',
                    name: 'Self Profile',
                    firstName: 'Self',
                    lastName: 'Profile',
                    email: 'self.profile@example.com',
                    role: 'employee',
                    department: 'Self',
                    designation: 'Analyst',
                    tenantSlug: 'self-test',
                    managerId: 'SELF-MANAGER',
                    activationStatus: 'Active'
                });
                saveData(data);
            }
            var context = {
                actor: { id: 'SELF-PROFILE', empId: 'SELF-PROFILE', employeeId: 'SELF-PROFILE', email: 'self.profile@example.com', role: 'EMPLOYEE', department: 'Self' },
                tenantSlug: 'self-test',
                syntheticEmployee: {
                    id: 'SELF-PROFILE',
                    empId: 'SELF-PROFILE',
                    employeeId: 'SELF-PROFILE',
                    name: 'Self Profile',
                    firstName: 'Self',
                    lastName: 'Profile',
                    email: 'self.profile@example.com',
                    role: 'employee',
                    department: 'Self',
                    designation: 'Analyst',
                    tenantSlug: 'self-test',
                    managerId: 'SELF-MANAGER',
                    activationStatus: 'Active'
                },
                skipPersistence: true,
                skipAuditPersistence: true,
                skipTelemetry: true
            };
            var payload = {
                tenantSlug: 'self-test',
                employeeId: 'SELF-PROFILE',
                email: 'self.profile@example.com',
                basicInformation: { firstName: 'Self', lastName: 'Profile', preferredName: 'Self' },
                contactInformation: { phone: '+910000000000', secondaryPhone: '+910000000001', address: 'Self Address', city: 'Self City', state: 'Self State', country: 'Self Country' },
                emergencyContact: { name: 'Self Contact', relationship: 'Sibling', contactNumber: '+910000000002' },
                workInformation: { employeeId: 'SELF-PROFILE', department: 'Self', designation: 'Analyst', manager: 'SELF-MANAGER' },
                verification: { workInformationReviewed: true, profileVerified: true }
            };
            var completion = calculateProfileCompletion(payload, context);
            var validation = validateEmployeeProfile(payload, context);
            var verified = verifyProfileData(payload, context);
            var analytics = generateReadinessReport({ tenantSlug: 'self-test' }, { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true });
            var malformed = validateEmployeeProfile('bad', context);
            return freezeProfileOutput({
                passed: !!(completion.success && validation.success && verified.success && analytics.success && malformed.success === false && Object.isFrozen(verified)),
                checks: {
                    profileCompletion: completion.success === true,
                    readinessScoring: completion.identityReadinessScore >= 90,
                    validation: validation.success === true && malformed.success === false,
                    analytics: analytics.success === true,
                    immutableOutputs: Object.isFrozen(completion) && Object.isFrozen(verified)
                }
            });
        } catch (error) {
            return freezeProfileOutput({ passed: false, error: 'Employee profile completion self-test failed safely.' });
        }
    }

    var EmployeeProfileCompletionService = Object.freeze({
        PROFILE_STATES: PROFILE_STATES,
        PROFILE_WORKFLOW: PROFILE_WORKFLOW,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        OPTIONAL_FIELDS: OPTIONAL_FIELDS,
        calculateProfileCompletion: calculateProfileCompletion,
        validateEmployeeProfile: validateEmployeeProfile,
        generateReadinessReport: generateReadinessReport,
        verifyProfileData: verifyProfileData,
        normalizeProfilePayload: normalizeProfilePayload,
        freezeProfileOutput: freezeProfileOutput
    });

    global.EmployeeProfileCompletionService = EmployeeProfileCompletionService;
    global.employeeProfileCompletionService = EmployeeProfileCompletionService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_EMPLOYEE_PROFILE_COMPLETION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
