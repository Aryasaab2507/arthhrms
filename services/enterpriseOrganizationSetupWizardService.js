/**
 * enterpriseOrganizationSetupWizardService.js
 * ARTHHRMS - Enterprise Organization Setup Wizard
 *
 * Provides a guided, tenant-safe first-use organization onboarding layer.
 * This service stores wizard metadata and onboarding configuration only.
 * It does not modify employee, leave, attendance, payroll, or approval workflows.
 */
(function attachEnterpriseOrganizationSetupWizardService(global) {
    'use strict';

    var PREFIX = '[EnterpriseOrganizationSetupWizardService]';
    var SOURCE = 'enterpriseOrganizationSetupWizardService';
    var DRAFT_TABLE = 'enterpriseOrganizationSetupDrafts';
    var HISTORY_TABLE = 'enterpriseOrganizationProvisioningHistory';
    var AUDIT_TABLE = 'enterpriseOrganizationSetupAuditHistory';

    var WIZARD_STEPS = deepFreeze([
        { index: 1, key: 'organizationInformation', label: 'Organization Information' },
        { index: 2, key: 'organizationStructure', label: 'Organization Structure' },
        { index: 3, key: 'workingConfiguration', label: 'Working Configuration' },
        { index: 4, key: 'leaveConfiguration', label: 'Leave Configuration' },
        { index: 5, key: 'payrollConfiguration', label: 'Payroll Configuration' },
        { index: 6, key: 'identitySecurity', label: 'Identity & Security' },
        { index: 7, key: 'notifications', label: 'Notifications' },
        { index: 8, key: 'administrator', label: 'Administrator' },
        { index: 9, key: 'review', label: 'Review' },
        { index: 10, key: 'provisionTenant', label: 'Provision Tenant' }
    ]);

    var REQUIRED_ORG_INFO = Object.freeze([
        'companyName',
        'legalName',
        'organizationCode',
        'industry',
        'companySize',
        'website',
        'timeZone',
        'currency',
        'language',
        'fiscalYearStart'
    ]);

    var DEFAULT_TENANT_ROLES = Object.freeze(['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN']);

    function warn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        return String(value).trim();
    }

    function isPlainObject(value) {
        return !!value && Object.prototype.toString.call(value) === '[object Object]';
    }

    function isSensitiveKey(key) {
        var lower = safeString(key, '').toLowerCase();
        return lower === 'password' ||
            lower === 'passwordhash' ||
            lower === 'password_hash' ||
            lower === 'secret' ||
            lower === 'clientsecret' ||
            lower === 'client_secret' ||
            lower === 'apikey' ||
            lower === 'api_key' ||
            lower === 'sessionid' ||
            lower === 'session_id' ||
            /^(access|refresh|id)[_-]?token$/.test(lower) ||
            /^private[_-]?key$/.test(lower);
    }

    function cloneValue(value, depth) {
        if (depth > 20) return null;
        if (Array.isArray(value)) return value.slice(0, 1000).map(function cloneArray(item) {
            return cloneValue(item, depth + 1);
        });
        if (isPlainObject(value)) {
            var out = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (isSensitiveKey(key)) return;
                out[key] = cloneValue(value[key], depth + 1);
            });
            return out;
        }
        return value;
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key], refs);
        });
        return Object.freeze(value);
    }

    function freezeOrganizationSetupWizardOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function failure(code, field, message, severity, metadata) {
        return freezeOrganizationSetupWizardOutput({
            code: safeString(code, 'VALIDATION_FAILED'),
            field: safeString(field, ''),
            message: safeString(message, 'Validation failed.'),
            severity: safeString(severity, 'HIGH').toUpperCase(),
            metadata: cloneValue(metadata || {}, 0)
        });
    }

    function warning(code, message, recommendation, metadata) {
        return freezeOrganizationSetupWizardOutput({
            code: safeString(code, 'SETUP_WARNING'),
            message: safeString(message, 'Review setup before provisioning.'),
            recommendation: safeString(recommendation, 'Review this configuration before continuing.'),
            metadata: cloneValue(metadata || {}, 0)
        });
    }

    function normalizeTenantSlug(value) {
        if (global.TenantProvisioningService && typeof global.TenantProvisioningService.normalizeTenantSlug === 'function') {
            return global.TenantProvisioningService.normalizeTenantSlug(value);
        }
        return safeString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
    }

    function normalizeCode(value) {
        return safeString(value, '').toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    }

    function normalizeEmail(value) {
        return safeString(value, '').toLowerCase();
    }

    function isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeString(value, ''));
    }

    function isUrl(value) {
        var text = safeString(value, '');
        return /^https?:\/\/[^\s.]+\.[^\s]+/i.test(text);
    }

    function actorFromContext(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.actorId || actor.userId || actor.email || '', ''),
            email: normalizeEmail(actor.email || ''),
            role: safeString(actor.role || actor.actorRole || context && context.role || 'setup_owner', 'setup_owner').toLowerCase(),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            warn('DB read failed safely.', { error: error && error.message });
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
            warn('DB save failed safely.', { error: error && error.message });
        }
        return false;
    }

    function arrayFor(data, key) {
        if (!data[key]) data[key] = [];
        if (!Array.isArray(data[key])) data[key] = [];
        return data[key];
    }

    function stepExists(stepKey) {
        return WIZARD_STEPS.some(function match(step) { return step.key === stepKey; });
    }

    function orgInfoFromDraft(draft) {
        return isPlainObject(draft && draft.organizationInformation) ? draft.organizationInformation : {};
    }

    function tenantSlugFromDraft(draft) {
        var info = orgInfoFromDraft(draft);
        return normalizeTenantSlug(
            draft && (draft.tenantSlug || draft.tenantId) ||
            info.organizationCode ||
            info.companyName ||
            ''
        );
    }

    function accessFailures(operation, draft, context) {
        var actor = actorFromContext(context || {});
        var targetTenant = tenantSlugFromDraft(draft || {});
        var failures = [];
        var role = actor.role;
        var platformLevel = role === 'platform_owner' || role === 'setup_owner';
        var tenantRole = ['super_admin', 'admin', 'hr'].indexOf(role) !== -1;

        if (!platformLevel && !tenantRole) {
            failures.push(failure('SETUP_ROLE_DENIED', 'actor.role', 'Actor role cannot access organization setup wizard.', 'HIGH'));
        }
        if (operation === 'PROVISION' && role !== 'platform_owner') {
            failures.push(failure('PLATFORM_OWNER_REQUIRED', 'actor.role', 'Only PLATFORM_OWNER can provision a new tenant.', 'CRITICAL'));
        }
        if (actor.tenantSlug && targetTenant && actor.tenantSlug !== targetTenant && !platformLevel) {
            failures.push(failure('CROSS_TENANT_SETUP_BLOCKED', 'tenantSlug', 'Cross-tenant setup access is blocked.', 'CRITICAL'));
        }
        return {
            actor: actor,
            failures: failures,
            targetTenant: targetTenant
        };
    }

    function failureOutput(code, message, failures, metadata) {
        return freezeOrganizationSetupWizardOutput({
            success: false,
            valid: false,
            code: safeString(code, 'SETUP_FAILED'),
            message: safeString(message, 'Organization setup failed safely.'),
            failures: failures && failures.length ? failures : [failure(code, '', message || 'Organization setup failed safely.')],
            warnings: [],
            metadata: cloneValue(metadata || {}, 0),
            timestamp: nowIso()
        });
    }

    function normalizeOrganizationInfo(values) {
        var source = isPlainObject(values) ? values : {};
        return {
            companyName: safeString(source.companyName || source.company_name, ''),
            legalName: safeString(source.legalName || source.legal_name, ''),
            organizationCode: normalizeCode(source.organizationCode || source.organization_code || source.tenantSlug || source.tenant_slug),
            industry: safeString(source.industry, ''),
            companySize: safeString(source.companySize || source.company_size, ''),
            registrationNumber: safeString(source.registrationNumber || source.registration_number, ''),
            taxId: safeString(source.taxId || source.tax_id, ''),
            website: safeString(source.website, ''),
            timeZone: safeString(source.timeZone || source.timezone || source.time_zone, ''),
            currency: safeString(source.currency, '').toUpperCase(),
            language: safeString(source.language || source.locale, ''),
            fiscalYearStart: safeString(source.fiscalYearStart || source.fiscal_year_start || source.fiscalYear || '', ''),
            logoUpload: cloneValue(source.logoUpload || source.logo || source.logoFile || null, 0)
        };
    }

    function normalizeNamedRows(rows) {
        var source = Array.isArray(rows) ? rows : [];
        var seen = {};
        var normalized = [];
        var warnings = [];
        source.forEach(function each(row, index) {
            var item = isPlainObject(row) ? row : { name: row };
            var name = safeString(item.name || item.Name || item.departmentName || item.locationName || '', '');
            var code = normalizeCode(item.code || item.Code || item.departmentCode || item.locationCode || name);
            if (!name && !code) return;
            var key = code || name.toLowerCase();
            if (seen[key]) {
                warnings.push(warning('DUPLICATE_STRUCTURE_ROW', 'Duplicate organization structure row was ignored.', 'Keep structure codes unique.', { index: index + 1, code: key }));
                return;
            }
            seen[key] = true;
            normalized.push({
                name: name || code,
                code: code,
                metadata: cloneValue(item.metadata || {}, 0)
            });
        });
        return { rows: normalized, warnings: warnings };
    }

    function normalizeOrganizationStructure(values) {
        var source = isPlainObject(values) ? values : {};
        var departments = normalizeNamedRows(source.departments || []);
        var branches = normalizeNamedRows(source.branches || []);
        var businessUnits = normalizeNamedRows(source.businessUnits || source.business_units || []);
        var costCenters = normalizeNamedRows(source.costCenters || source.cost_centers || []);
        var locations = normalizeNamedRows(source.locations || []);
        var warnings = []
            .concat(departments.warnings)
            .concat(branches.warnings)
            .concat(businessUnits.warnings)
            .concat(costCenters.warnings)
            .concat(locations.warnings);
        return {
            headOffice: cloneValue(source.headOffice || source.head_office || {}, 0),
            branches: branches.rows,
            businessUnits: businessUnits.rows,
            departments: departments.rows,
            costCenters: costCenters.rows,
            locations: locations.rows,
            importWarnings: warnings
        };
    }

    function normalizeWorkingConfiguration(values, fallbackTimeZone) {
        var source = isPlainObject(values) ? values : {};
        return {
            workWeek: Array.isArray(source.workWeek || source.work_week) ? (source.workWeek || source.work_week).map(function day(value) { return safeString(value, '').toUpperCase(); }).filter(Boolean) : [],
            officeHours: cloneValue(source.officeHours || source.office_hours || {}, 0),
            timeZone: safeString(source.timeZone || source.timezone || source.time_zone || fallbackTimeZone || '', ''),
            shiftStrategy: safeString(source.shiftStrategy || source.shift_strategy, ''),
            attendanceMode: safeString(source.attendanceMode || source.attendance_mode, ''),
            weekendRules: cloneValue(source.weekendRules || source.weekend_rules || {}, 0),
            publicHolidays: Array.isArray(source.publicHolidays || source.public_holidays) ? cloneValue(source.publicHolidays || source.public_holidays, 0) : []
        };
    }

    function normalizeAdministrator(values) {
        var source = isPlainObject(values) ? values : {};
        return {
            name: safeString(source.name, ''),
            email: normalizeEmail(source.email),
            phone: safeString(source.phone, ''),
            role: safeString(source.role || 'super_admin', 'super_admin').toLowerCase(),
            mfa: !!(source.mfa || source.mfaRequired || source.requireMfa)
        };
    }

    function normalizeDraft(input, context) {
        var source = isPlainObject(input && input.draft) ? input.draft : (isPlainObject(input) ? input : {});
        var draftId = safeString(source.draftId || input && input.draftId || '', '');
        var organizationInformation = normalizeOrganizationInfo(source.organizationInformation || {});
        if (input && input.stepKey === 'organizationInformation' && isPlainObject(input.values)) {
            organizationInformation = normalizeOrganizationInfo(input.values);
        }
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || organizationInformation.organizationCode || organizationInformation.companyName || draftId);
        if (!draftId) draftId = 'ORGSETUP-' + (tenantSlug || Date.now());
        var structure = normalizeOrganizationStructure(source.organizationStructure || {});
        var working = normalizeWorkingConfiguration(source.workingConfiguration || {}, organizationInformation.timeZone);
        if (input && input.stepKey && input.stepKey !== 'organizationInformation' && isPlainObject(input.values)) {
            if (input.stepKey === 'organizationStructure') structure = normalizeOrganizationStructure(input.values);
            if (input.stepKey === 'workingConfiguration') working = normalizeWorkingConfiguration(input.values, organizationInformation.timeZone);
        }
        var draft = {
            draftId: draftId,
            tenantSlug: tenantSlug,
            status: safeString(source.status || 'DRAFT', 'DRAFT').toUpperCase(),
            organizationInformation: organizationInformation,
            organizationStructure: structure,
            workingConfiguration: working,
            leaveConfiguration: cloneValue(source.leaveConfiguration || {}, 0),
            payrollConfiguration: cloneValue(source.payrollConfiguration || {}, 0),
            identitySecurity: cloneValue(source.identitySecurity || {}, 0),
            notifications: cloneValue(source.notifications || {}, 0),
            administrator: normalizeAdministrator(source.administrator || {}),
            createDefaultDepartments: source.createDefaultDepartments !== false,
            enabledModules: cloneValue(source.enabledModules || ['employees', 'attendance', 'leave', 'payroll', 'notifications'], 0),
            metadata: cloneValue(source.metadata || {}, 0),
            createdAt: safeString(source.createdAt, ''),
            updatedAt: safeString(source.updatedAt, '')
        };
        if (input && input.stepKey && input.stepKey !== 'organizationInformation' && input.stepKey !== 'organizationStructure' && input.stepKey !== 'workingConfiguration' && isPlainObject(input.values)) {
            draft[input.stepKey] = input.stepKey === 'administrator' ? normalizeAdministrator(input.values) : cloneValue(input.values, 0);
        }
        draft.tenantSlug = tenantSlugFromDraft(draft);
        var actor = actorFromContext(context || {});
        draft.updatedBy = safeString(source.updatedBy || actor.id || actor.email || '', '');
        return draft;
    }

    function existingDrafts(data) {
        return Array.isArray(data[DRAFT_TABLE]) ? data[DRAFT_TABLE] : [];
    }

    function detectDuplicateOrganization(values, context) {
        var info = normalizeOrganizationInfo(values || {});
        var slug = normalizeTenantSlug(info.organizationCode || info.companyName);
        var data = rawData();
        var currentDraftId = safeString(context && context.draftId || '', '');
        var duplicates = [];
        function pushIf(label, row, code) {
            if (row) duplicates.push({
                source: label,
                code: safeString(code || slug, ''),
                name: safeString(row.companyName || row.legalName || row.tenantSlug || row.tenantId || '', '')
            });
        }
        (Array.isArray(data.platformTenants) ? data.platformTenants : []).forEach(function eachTenant(row) {
            var rowSlug = normalizeTenantSlug(row && (row.tenantSlug || row.tenant_slug || row.slug || row.companyName || row.tenantId));
            if (rowSlug && rowSlug === slug) pushIf('platformTenants', row, rowSlug);
        });
        var settings = data.companySettings || {};
        if (!context || !context.ignoreCurrentCompanySettings) if (slug && normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyName) === slug) {
            pushIf('companySettings', settings, slug);
        }
        existingDrafts(data).forEach(function eachDraft(row) {
            if (currentDraftId && row.draftId === currentDraftId) return;
            var rowSlug = tenantSlugFromDraft(row);
            if (rowSlug && rowSlug === slug) pushIf(DRAFT_TABLE, row.organizationInformation || row, rowSlug);
        });
        return freezeOrganizationSetupWizardOutput({
            duplicate: duplicates.length > 0,
            organizationCode: info.organizationCode,
            tenantSlug: slug,
            duplicates: duplicates
        });
    }

    function validationResult(stepKey, valid, inlineErrors, failures, warnings, normalized) {
        return freezeOrganizationSetupWizardOutput({
            success: true,
            stepKey: stepKey,
            valid: !!valid,
            inlineErrors: inlineErrors || {},
            failures: failures || [],
            warnings: warnings || [],
            normalized: normalized || {},
            timestamp: nowIso()
        });
    }

    function addRequiredError(field, message, inlineErrors, failures) {
        inlineErrors[field] = message;
        failures.push(failure('REQUIRED_FIELD_MISSING', field, message, 'HIGH'));
    }

    function validateOrganizationInfo(values, context) {
        var info = normalizeOrganizationInfo(values);
        var inlineErrors = {};
        var failures = [];
        var warnings = [];
        REQUIRED_ORG_INFO.forEach(function each(field) {
            if (!safeString(info[field], '')) addRequiredError(field, field + ' is required.', inlineErrors, failures);
        });
        if (info.website && !isUrl(info.website)) {
            inlineErrors.website = 'Website must start with http:// or https://.';
            failures.push(failure('WEBSITE_INVALID', 'website', 'Website must be a valid URL.', 'MEDIUM'));
        }
        if (info.logoUpload && Number(info.logoUpload.size || 0) > 5 * 1024 * 1024) {
            warnings.push(warning('LOGO_SIZE_REVIEW', 'Logo upload is larger than 5MB.', 'Use an optimized PNG, WebP, or SVG logo.'));
        }
        var duplicate = detectDuplicateOrganization(info, context || {});
        if (duplicate.duplicate) {
            inlineErrors.organizationCode = 'Organization code is already in use.';
            failures.push(failure('DUPLICATE_ORGANIZATION_CODE', 'organizationCode', 'Organization code already exists.', 'CRITICAL', { duplicateCount: duplicate.duplicates.length }));
        }
        return validationResult('organizationInformation', failures.length === 0, inlineErrors, failures, warnings, info);
    }

    function validateOrganizationStructure(values) {
        var structure = normalizeOrganizationStructure(values);
        var inlineErrors = {};
        var failures = [];
        var warnings = structure.importWarnings || [];
        if (!safeString(structure.headOffice && (structure.headOffice.name || structure.headOffice.locationCode), '')) {
            addRequiredError('headOffice', 'Head office is required.', inlineErrors, failures);
        }
        if (!structure.departments.length) addRequiredError('departments', 'At least one department is required.', inlineErrors, failures);
        if (!structure.locations.length && !structure.branches.length) {
            warnings.push(warning('LOCATION_DETAILS_RECOMMENDED', 'At least one branch or location is recommended.', 'Add work locations before employee import.'));
        }
        return validationResult('organizationStructure', failures.length === 0, inlineErrors, failures, warnings, structure);
    }

    function validateWorkingConfiguration(values, context) {
        var working = normalizeWorkingConfiguration(values, context && context.timeZone);
        var inlineErrors = {};
        var failures = [];
        if (!working.workWeek.length) addRequiredError('workWeek', 'Work week is required.', inlineErrors, failures);
        if (!safeString(working.officeHours && working.officeHours.start, '') || !safeString(working.officeHours && working.officeHours.end, '')) {
            addRequiredError('officeHours', 'Office start and end time are required.', inlineErrors, failures);
        }
        ['timeZone', 'shiftStrategy', 'attendanceMode'].forEach(function required(field) {
            if (!safeString(working[field], '')) addRequiredError(field, field + ' is required.', inlineErrors, failures);
        });
        return validationResult('workingConfiguration', failures.length === 0, inlineErrors, failures, [], working);
    }

    function validateLeaveConfiguration(values) {
        var source = isPlainObject(values) ? values : {};
        var inlineErrors = {};
        var failures = [];
        var leaveTypes = Array.isArray(source.leaveTypes || source.leave_types) ? (source.leaveTypes || source.leave_types) : [];
        if (!leaveTypes.length) addRequiredError('leaveTypes', 'At least one leave type is required.', inlineErrors, failures);
        if (!isPlainObject(source.approvalRules || source.approval_rules)) addRequiredError('approvalRules', 'Leave approval rules are required.', inlineErrors, failures);
        return validationResult('leaveConfiguration', failures.length === 0, inlineErrors, failures, [], cloneValue(source, 0));
    }

    function validatePayrollConfiguration(values) {
        var source = isPlainObject(values) ? values : {};
        var inlineErrors = {};
        var failures = [];
        if (!safeString(source.payrollFrequency || source.payroll_frequency, '')) addRequiredError('payrollFrequency', 'Payroll frequency is required.', inlineErrors, failures);
        if (!safeString(source.salaryStructure || source.salary_structure, '')) addRequiredError('salaryStructure', 'Salary structure is required.', inlineErrors, failures);
        if (!Array.isArray(source.components) || !source.components.length) addRequiredError('components', 'At least one payroll component is required.', inlineErrors, failures);
        if (!isPlainObject(source.paymentCycle || source.payment_cycle)) addRequiredError('paymentCycle', 'Payment cycle is required.', inlineErrors, failures);
        return validationResult('payrollConfiguration', failures.length === 0, inlineErrors, failures, [], cloneValue(source, 0));
    }

    function validateIdentitySecurity(values) {
        var source = isPlainObject(values) ? values : {};
        var inlineErrors = {};
        var failures = [];
        var warnings = [];
        if (!safeString(source.authenticationMethod || source.authentication_method, '')) addRequiredError('authenticationMethod', 'Authentication method is required.', inlineErrors, failures);
        if (!isPlainObject(source.passwordPolicy || source.password_policy)) addRequiredError('passwordPolicy', 'Password policy is required.', inlineErrors, failures);
        if (!Number(source.sessionTimeoutMinutes || source.session_timeout_minutes || 0)) addRequiredError('sessionTimeoutMinutes', 'Session timeout is required.', inlineErrors, failures);
        if (!source.mfa) warnings.push(warning('MFA_RECOMMENDED', 'MFA is disabled for setup.', 'Enable MFA for administrators before production launch.'));
        return validationResult('identitySecurity', failures.length === 0, inlineErrors, failures, warnings, cloneValue(source, 0));
    }

    function validateNotifications(values) {
        var source = isPlainObject(values) ? values : {};
        var warnings = [];
        var channels = ['email', 'sms', 'pushNotifications', 'push'];
        var enabled = channels.some(function channel(key) { return !!(source[key] && source[key].enabled); });
        if (!enabled) warnings.push(warning('NO_NOTIFICATION_CHANNELS_ENABLED', 'No notification channels are enabled.', 'Enable email, SMS, or push before inviting employees.'));
        return validationResult('notifications', true, {}, [], warnings, cloneValue(source, 0));
    }

    function validateAdministrator(values) {
        var admin = normalizeAdministrator(values);
        var inlineErrors = {};
        var failures = [];
        var warnings = [];
        if (!admin.name) addRequiredError('name', 'Administrator name is required.', inlineErrors, failures);
        if (!admin.email) addRequiredError('email', 'Administrator email is required.', inlineErrors, failures);
        if (admin.email && !isEmail(admin.email)) {
            inlineErrors.email = 'Administrator email is invalid.';
            failures.push(failure('ADMIN_EMAIL_INVALID', 'email', 'Administrator email must be valid.', 'HIGH'));
        }
        if (['super_admin', 'admin', 'hr'].indexOf(admin.role) === -1) {
            inlineErrors.role = 'Administrator role must be super_admin, admin, or hr.';
            failures.push(failure('ADMIN_ROLE_INVALID', 'role', 'Administrator role is not allowed for first setup.', 'HIGH'));
        }
        if (!admin.mfa) warnings.push(warning('ADMIN_MFA_RECOMMENDED', 'Administrator MFA is not enabled.', 'Require MFA for the first administrator.'));
        return validationResult('administrator', failures.length === 0, inlineErrors, failures, warnings, admin);
    }

    function validateStep(input, context) {
        try {
            var stepKey = safeString(input && (input.stepKey || input.key), '');
            if (!stepExists(stepKey)) {
                return validationResult(stepKey || 'unknown', false, { stepKey: 'Unknown setup step.' }, [failure('UNKNOWN_STEP', 'stepKey', 'Unknown setup wizard step.', 'HIGH')], [], {});
            }
            var values = input && input.values !== undefined ? input.values : input;
            if (stepKey === 'organizationInformation') return validateOrganizationInfo(values, context || {});
            if (stepKey === 'organizationStructure') return validateOrganizationStructure(values);
            if (stepKey === 'workingConfiguration') return validateWorkingConfiguration(values, context || {});
            if (stepKey === 'leaveConfiguration') return validateLeaveConfiguration(values);
            if (stepKey === 'payrollConfiguration') return validatePayrollConfiguration(values);
            if (stepKey === 'identitySecurity') return validateIdentitySecurity(values);
            if (stepKey === 'notifications') return validateNotifications(values);
            if (stepKey === 'administrator') return validateAdministrator(values);
            if (stepKey === 'review' || stepKey === 'provisionTenant') {
                var review = generateReviewSummary(values, context || {});
                return validationResult(stepKey, !!review.readyToProvision, {}, review.validationErrors || [], review.warnings || [], review);
            }
            return validationResult(stepKey, true, {}, [], [], cloneValue(values || {}, 0));
        } catch (error) {
            return validationResult('unknown', false, { runtime: 'Validation recovered safely.' }, [failure('SETUP_VALIDATION_FAILED', '', 'Setup validation failed safely.', 'HIGH', { error: error && error.message })], [], {});
        }
    }

    function importFromRows(rows, context) {
        try {
            var structure = {
                headOffice: {},
                branches: [],
                businessUnits: [],
                departments: [],
                costCenters: [],
                locations: []
            };
            var warnings = [];
            var seen = {};
            (Array.isArray(rows) ? rows : []).slice(0, 5000).forEach(function each(row, index) {
                var item = isPlainObject(row) ? row : {};
                var rawType = safeString(item.type || item.Type || item.category || item.Category, '').toLowerCase();
                var name = safeString(item.name || item.Name || item.title || item.Title, '');
                var code = normalizeCode(item.code || item.Code || name);
                if (!rawType || !name) {
                    warnings.push(warning('MALFORMED_STRUCTURE_ROW', 'Malformed structure row was skipped.', 'Provide Type, Name, and Code columns.', { index: index + 1 }));
                    return;
                }
                var target = rawType.indexOf('head') !== -1 ? 'headOffice'
                    : rawType.indexOf('branch') !== -1 ? 'branches'
                    : rawType.indexOf('business') !== -1 || rawType.indexOf('unit') !== -1 ? 'businessUnits'
                    : rawType.indexOf('department') !== -1 ? 'departments'
                    : rawType.indexOf('cost') !== -1 ? 'costCenters'
                    : rawType.indexOf('location') !== -1 ? 'locations'
                    : '';
                if (!target) {
                    warnings.push(warning('UNKNOWN_STRUCTURE_ROW_TYPE', 'Unknown structure row type was skipped.', 'Use Head Office, Branch, Business Unit, Department, Cost Center, or Location.', { index: index + 1, type: rawType }));
                    return;
                }
                var dedupe = target + ':' + (code || name.toLowerCase());
                if (seen[dedupe]) {
                    warnings.push(warning('DUPLICATE_STRUCTURE_ROW', 'Duplicate organization structure row was ignored.', 'Keep import codes unique within each structure type.', { index: index + 1, code: code }));
                    return;
                }
                seen[dedupe] = true;
                var record = { name: name, code: code, tenantSlug: normalizeTenantSlug(context && context.tenantSlug || '') };
                if (target === 'headOffice') structure.headOffice = record;
                else structure[target].push(record);
            });
            return freezeOrganizationSetupWizardOutput({
                success: true,
                structure: structure,
                warnings: warnings,
                failures: [],
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('STRUCTURE_IMPORT_FAILED', 'Organization structure import failed safely.', [failure('STRUCTURE_IMPORT_FAILED', '', 'Organization structure import failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function validateDraftSteps(draft, context) {
        var checks = [
            validateOrganizationInfo(draft.organizationInformation, Object.assign({}, context || {}, { draftId: draft.draftId })),
            validateOrganizationStructure(draft.organizationStructure),
            validateWorkingConfiguration(draft.workingConfiguration, { timeZone: draft.organizationInformation.timeZone }),
            validateLeaveConfiguration(draft.leaveConfiguration),
            validatePayrollConfiguration(draft.payrollConfiguration),
            validateIdentitySecurity(draft.identitySecurity),
            validateNotifications(draft.notifications),
            validateAdministrator(draft.administrator)
        ];
        return checks;
    }

    function generateReviewSummary(input, context) {
        try {
            var draft = normalizeDraft(input || {}, context || {});
            var access = accessFailures('VIEW', draft, context || {});
            if (access.failures.length) return failureOutput('ACCESS_BLOCKED', 'Organization setup review access was blocked.', access.failures);
            var checks = validateDraftSteps(draft, context || {});
            var missingRequiredFields = [];
            var validationErrors = [];
            var warnings = [];
            checks.forEach(function eachCheck(check) {
                Object.keys(check.inlineErrors || {}).forEach(function eachField(field) {
                    missingRequiredFields.push({ stepKey: check.stepKey, field: field, message: check.inlineErrors[field] });
                });
                validationErrors = validationErrors.concat(check.failures || []);
                warnings = warnings.concat(check.warnings || []);
            });
            var ready = validationErrors.length === 0;
            var configurationSummary = WIZARD_STEPS.slice(0, 8).map(function summary(step) {
                var check = checks.find(function find(item) { return item.stepKey === step.key; }) || {};
                return {
                    stepKey: step.key,
                    label: step.label,
                    status: check.valid ? 'READY' : 'NEEDS_ATTENTION',
                    warningCount: (check.warnings || []).length,
                    errorCount: (check.failures || []).length
                };
            });
            return freezeOrganizationSetupWizardOutput({
                success: true,
                draftId: draft.draftId,
                tenantSlug: draft.tenantSlug,
                readyToProvision: ready,
                missingRequiredFields: missingRequiredFields,
                validationErrors: validationErrors,
                warnings: warnings,
                configurationSummary: configurationSummary,
                governance: {
                    tenantIsolationPreserved: true,
                    backwardCompatible: true,
                    businessWorkflowsModified: false,
                    schemaMigrationRequired: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('REVIEW_SUMMARY_FAILED', 'Review summary failed safely.', [failure('REVIEW_SUMMARY_FAILED', '', 'Review summary failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function completionScore(draft, context) {
        var checks = validateDraftSteps(draft, context || {});
        var ready = checks.filter(function readyCheck(check) { return check.valid; }).length;
        return Math.round((ready / Math.max(checks.length, 1)) * 100);
    }

    function saveStepDraft(input, context) {
        try {
            var stepKey = safeString(input && input.stepKey, '');
            if (!stepExists(stepKey)) return failureOutput('UNKNOWN_STEP', 'Unknown setup wizard step.', [failure('UNKNOWN_STEP', 'stepKey', 'Unknown setup wizard step.', 'HIGH')]);
            var draft = normalizeDraft(input || {}, context || {});
            var access = accessFailures('SAVE', draft, context || {});
            if (access.failures.length) return failureOutput('ACCESS_BLOCKED', 'Organization setup draft access was blocked.', access.failures);
            var validation = validateStep({ stepKey: stepKey, values: draft[stepKey] }, Object.assign({}, context || {}, { draftId: draft.draftId }));
            if (!validation.valid) {
                return freezeOrganizationSetupWizardOutput({
                    success: false,
                    saved: false,
                    draftId: draft.draftId,
                    stepKey: stepKey,
                    inlineErrors: validation.inlineErrors,
                    failures: validation.failures,
                    warnings: validation.warnings,
                    timestamp: nowIso()
                });
            }
            var now = nowIso();
            draft.status = 'DRAFT';
            draft.resumeToken = safeString(draft.resumeToken || 'RESUME-' + draft.draftId + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(), '');
            draft.completionScore = completionScore(draft, context || {});
            draft.createdAt = draft.createdAt || now;
            draft.updatedAt = now;
            if (!context || !context.skipPersistence) {
                var data = rawData();
                var drafts = existingDrafts(data).filter(function notSame(row) { return row.draftId !== draft.draftId; });
                drafts.unshift(cloneValue(draft, 0));
                data[DRAFT_TABLE] = drafts.slice(0, 200);
                saveData(data);
                audit('ENTERPRISE_ORGANIZATION_SETUP_DRAFT_SAVED', access.actor, { draftId: draft.draftId, tenantSlug: draft.tenantSlug, stepKey: stepKey });
            }
            return freezeOrganizationSetupWizardOutput({
                success: true,
                saved: true,
                draft: draft,
                validation: validation,
                timestamp: now
            });
        } catch (error) {
            return failureOutput('DRAFT_SAVE_FAILED', 'Organization setup draft save failed safely.', [failure('DRAFT_SAVE_FAILED', '', 'Draft save failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function resumeDraft(input, context) {
        try {
            var draftId = safeString(input && (input.draftId || input.id), '');
            var resumeToken = safeString(input && input.resumeToken, '');
            var data = rawData();
            var found = existingDrafts(data).find(function match(row) {
                return (draftId && row.draftId === draftId) || (resumeToken && row.resumeToken === resumeToken);
            });
            if (!found) return failureOutput('DRAFT_NOT_FOUND', 'Organization setup draft was not found.', [failure('DRAFT_NOT_FOUND', 'draftId', 'Organization setup draft was not found.', 'MEDIUM')]);
            var draft = normalizeDraft(found, context || {});
            var access = accessFailures('VIEW', draft, context || {});
            if (access.failures.length) return failureOutput('ACCESS_BLOCKED', 'Organization setup draft access was blocked.', access.failures);
            audit('ENTERPRISE_ORGANIZATION_SETUP_DRAFT_RESUMED', access.actor, { draftId: draft.draftId, tenantSlug: draft.tenantSlug });
            return freezeOrganizationSetupWizardOutput({
                success: true,
                draft: draft,
                readiness: calculateSetupReadiness(draft, context || {}),
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('DRAFT_RESUME_FAILED', 'Organization setup draft resume failed safely.', [failure('DRAFT_RESUME_FAILED', '', 'Draft resume failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function calculateSetupReadiness(input, context) {
        try {
            var draft = normalizeDraft(input || {}, context || {});
            var checks = validateDraftSteps(draft, context || {});
            var validCount = checks.filter(function ok(check) { return check.valid; }).length;
            var warningCount = checks.reduce(function sum(acc, check) { return acc + (check.warnings || []).length; }, 0);
            var base = Math.round((validCount / checks.length) * 100);
            var structureSize = ['branches', 'businessUnits', 'departments', 'costCenters', 'locations'].reduce(function count(acc, key) {
                return acc + ((draft.organizationStructure && draft.organizationStructure[key] || []).length);
            }, 0);
            var scaleReadiness = Math.max(0, Math.min(100, base - Math.min(5, warningCount) + (structureSize > 100 ? 5 : 0)));
            return freezeOrganizationSetupWizardOutput({
                success: true,
                draftId: draft.draftId,
                tenantSlug: draft.tenantSlug,
                setupReadinessScore: base,
                scaleReadinessScore: scaleReadiness,
                onboardingCapacity: draft.organizationInformation.companySize || 'UNSPECIFIED',
                readyToProvision: checks.every(function all(check) { return check.valid; }),
                warnings: checks.reduce(function collect(acc, check) { return acc.concat(check.warnings || []); }, []),
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('READINESS_CALCULATION_FAILED', 'Setup readiness calculation failed safely.', [failure('READINESS_CALCULATION_FAILED', '', 'Readiness calculation failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function audit(action, actor, metadata) {
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: action,
                    actionType: action,
                    actorRole: actor && actor.role || 'setup_owner',
                    actorId: actor && (actor.id || actor.email) || '',
                    module: 'Enterprise Organization Setup',
                    targetId: metadata && (metadata.draftId || metadata.tenantSlug) || '',
                    source: SOURCE,
                    severity: 'INFO',
                    metadata: Object.assign({ tenantIsolationPreserved: true }, cloneValue(metadata || {}, 0))
                }, { source: SOURCE });
            } else if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor && actor.role || 'setup_owner', actor && actor.id || '', action, 'Enterprise Organization Setup', metadata && (metadata.draftId || metadata.tenantSlug) || '', JSON.stringify(cloneValue(metadata || {}, 0)));
            }
            var data = rawData();
            var rows = arrayFor(data, AUDIT_TABLE);
            rows.unshift({
                auditId: 'EOSA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                actionType: action,
                actorRole: actor && actor.role || 'setup_owner',
                actorId: actor && (actor.id || actor.email) || '',
                tenantSlug: metadata && metadata.tenantSlug || '',
                draftId: metadata && metadata.draftId || '',
                timestamp: nowIso(),
                immutable: true,
                metadata: cloneValue(metadata || {}, 0)
            });
            data[AUDIT_TABLE] = rows.slice(0, 500);
            saveData(data);
            return true;
        } catch (error) {
            warn('Audit failed safely.', { error: error && error.message });
            return false;
        }
    }

    function setupPayloadFromDraft(draft) {
        var info = draft.organizationInformation;
        var structure = draft.organizationStructure || {};
        var departments = (structure.departments || []).map(function dept(row) { return row.name || row.code; }).filter(Boolean);
        if (!departments.length) departments = ['HR', 'Operations', 'Finance', 'Engineering', 'Management'];
        return {
            tenant_slug: draft.tenantSlug,
            company_profile: {
                company_name: info.companyName,
                company_email: draft.administrator.email,
                company_phone: draft.administrator.phone,
                timezone: info.timeZone,
                country: safeString(info.country || 'India', 'India'),
                working_days: draft.workingConfiguration.workWeek || ['MON', 'TUE', 'WED', 'THU', 'FRI'],
                fiscal_year: info.fiscalYearStart,
                default_currency: info.currency
            },
            departments: departments,
            role_matrix: DEFAULT_TENANT_ROLES.slice(),
            manager_structure: [],
            policies: {
                leave_policy: 'configured',
                attendance_policy: draft.workingConfiguration.attendanceMode || 'configured',
                holiday_policy: 'configured',
                working_hours: (draft.workingConfiguration.officeHours && draft.workingConfiguration.officeHours.start || '') + '-' + (draft.workingConfiguration.officeHours && draft.workingConfiguration.officeHours.end || ''),
                onboarding_defaults: 'invite_required'
            },
            features: {
                attendance: true,
                payroll: true,
                strategic_deliverables: false,
                expense_management: false,
                onboarding_workflows: true
            },
            pilot: {
                pilot_employee_count: 0,
                pilot_departments: departments.slice(0, 3),
                staged_onboarding: true,
                activation_stage: 'setup_only'
            }
        };
    }

    function upsertTenantDepartmentRecords(data, draft) {
        if (draft.createDefaultDepartments === false) return;
        var rows = arrayFor(data, 'tenantDepartmentRecords');
        var tenantSlug = draft.tenantSlug;
        var existing = {};
        rows.forEach(function each(row) {
            if (normalizeTenantSlug(row && row.tenantSlug) === tenantSlug) existing[normalizeCode(row.departmentCode || row.code || row.departmentName)] = true;
        });
        (draft.organizationStructure.departments || []).forEach(function eachDepartment(dept) {
            var code = normalizeCode(dept.code || dept.name);
            if (!code || existing[code]) return;
            existing[code] = true;
            rows.push({
                departmentId: tenantSlug + '-' + code,
                tenantSlug: tenantSlug,
                tenantId: 'TEN-' + tenantSlug,
                departmentName: dept.name,
                departmentCode: code,
                parentDepartmentCode: '',
                state: 'ACTIVE',
                active: true,
                level: 'DEPARTMENT',
                source: SOURCE,
                createdAt: nowIso()
            });
        });
    }

    function stageAdministratorOnboarding(data, draft) {
        var admin = draft.administrator;
        data.authInvites = Array.isArray(data.authInvites) ? data.authInvites : [];
        var existing = data.authInvites.find(function byEmail(invite) {
            return normalizeEmail(invite && invite.email) === admin.email && invite.tenantSlug === draft.tenantSlug;
        });
        if (existing) return existing;
        var inviteId = 'INV-SETUP-' + Date.now();
        var row = {
            inviteId: inviteId,
            id: inviteId,
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            role: admin.role,
            empId: null,
            tenantSlug: draft.tenantSlug,
            tenantId: 'TEN-' + draft.tenantSlug,
            mfaRequired: !!admin.mfa,
            status: 'Secure Onboarding Required',
            inviteStatus: 'Secure Onboarding Required',
            activationStatus: 'Not Activated',
            redirectTo: 'auth-callback.html',
            invitedBy: draft.updatedBy || 'enterprise-setup',
            invitedByRole: 'platform_owner',
            createdAt: nowIso(),
            failureReason: 'A server-side authenticated invitation is required before this account exists.'
        };
        data.authInvites.unshift(row);
        return row;
    }

    function persistProvisionedConfiguration(draft, tenant, setupResult, actor) {
        var data = rawData();
        var info = draft.organizationInformation;
        data.companySettings = Object.assign({}, data.companySettings || {}, {
            companyName: info.companyName,
            legalName: info.legalName,
            organizationCode: info.organizationCode,
            tenantSlug: draft.tenantSlug,
            tenantId: 'TEN-' + draft.tenantSlug,
            companyLogoUrl: info.logoUpload && (info.logoUpload.url || info.logoUpload.name) || data.companySettings && data.companySettings.companyLogoUrl || '',
            timezone: info.timeZone,
            currency: info.currency,
            language: info.language,
            fiscalYearStart: info.fiscalYearStart,
            website: info.website,
            industry: info.industry,
            companySize: info.companySize
        });
        data.settings = Object.assign({}, data.settings || {}, {
            companyName: info.companyName,
            timezone: info.timeZone,
            currency: info.currency
        });
        data.organizationStructureByTenant = data.organizationStructureByTenant || {};
        data.organizationStructureByTenant[draft.tenantSlug] = cloneValue(draft.organizationStructure, 0);
        data.workingConfigurationByTenant = data.workingConfigurationByTenant || {};
        data.workingConfigurationByTenant[draft.tenantSlug] = cloneValue(draft.workingConfiguration, 0);
        data.leaveConfigurationByTenant = data.leaveConfigurationByTenant || {};
        data.leaveConfigurationByTenant[draft.tenantSlug] = cloneValue(draft.leaveConfiguration, 0);
        data.payrollConfigurationByTenant = data.payrollConfigurationByTenant || {};
        data.payrollConfigurationByTenant[draft.tenantSlug] = cloneValue(draft.payrollConfiguration, 0);
        data.identitySecurityConfigurationByTenant = data.identitySecurityConfigurationByTenant || {};
        data.identitySecurityConfigurationByTenant[draft.tenantSlug] = cloneValue(draft.identitySecurity, 0);
        data.notificationConfigurationByTenant = data.notificationConfigurationByTenant || {};
        data.notificationConfigurationByTenant[draft.tenantSlug] = cloneValue(draft.notifications, 0);
        data.enterpriseOrganizationSetupState = data.enterpriseOrganizationSetupState || {};
        data.enterpriseOrganizationSetupState[draft.tenantSlug] = {
            status: 'PROVISIONED',
            draftId: draft.draftId,
            tenantId: tenant && tenant.tenantId || 'TEN-' + draft.tenantSlug,
            provisionedAt: nowIso(),
            provisionedBy: actor.id || actor.email || '',
            setupRecordId: setupResult && setupResult.setup && setupResult.setup.setupId || ''
        };
        upsertTenantDepartmentRecords(data, draft);
        var administrator = stageAdministratorOnboarding(data, draft);
        var history = arrayFor(data, HISTORY_TABLE);
        history.unshift({
            provisioningId: 'EOP-' + Date.now(),
            draftId: draft.draftId,
            tenantSlug: draft.tenantSlug,
            tenantId: tenant && tenant.tenantId || 'TEN-' + draft.tenantSlug,
            administratorEmail: administrator.email,
            status: 'PROVISIONED',
            immutable: true,
            createdAt: nowIso(),
            governance: {
                tenantIsolationPreserved: true,
                businessWorkflowsModified: false,
                schemaMigrationRequired: false,
                futureScaleSupported: true
            }
        });
        data[HISTORY_TABLE] = history.slice(0, 300);
        data[DRAFT_TABLE] = existingDrafts(data).map(function mark(row) {
            if (row.draftId !== draft.draftId) return row;
            var next = cloneValue(row, 0);
            next.status = 'PROVISIONED';
            next.provisionedAt = nowIso();
            return next;
        });
        saveData(data);
        return administrator;
    }

    function provisionTenant(input, context) {
        try {
            var draft = normalizeDraft(input || {}, context || {});
            var access = accessFailures('PROVISION', draft, context || {});
            if (access.failures.length) return failureOutput('ACCESS_BLOCKED', 'Tenant provisioning access was blocked.', access.failures);
            var review = generateReviewSummary(draft, Object.assign({}, context || {}, { ignoreCurrentCompanySettings: true }));
            if (!review.success || !review.readyToProvision) {
                return freezeOrganizationSetupWizardOutput({
                    success: false,
                    provisioned: false,
                    draftId: draft.draftId,
                    tenantSlug: draft.tenantSlug,
                    review: review,
                    failures: review.validationErrors || [],
                    warnings: review.warnings || [],
                    timestamp: nowIso()
                });
            }

            var tenantResult = global.TenantProvisioningService && typeof global.TenantProvisioningService.provisionTenant === 'function'
                ? global.TenantProvisioningService.provisionTenant({
                    company_name: draft.organizationInformation.companyName,
                    tenant_slug: draft.tenantSlug,
                    company_email: draft.administrator.email,
                    company_phone: draft.administrator.phone,
                    company_size: draft.organizationInformation.companySize,
                    onboarding_stage: 'setup_only',
                    plan_type: 'enterprise',
                    timezone: draft.organizationInformation.timeZone,
                    country: 'India'
                }, { actor: { role: 'platform_owner', id: access.actor.id || 'enterprise-setup', email: access.actor.email } })
                : { success: true, created: true, tenant: { tenantId: 'TEN-' + draft.tenantSlug, tenantSlug: draft.tenantSlug, companyName: draft.organizationInformation.companyName } };

            if (!tenantResult.success) {
                return freezeOrganizationSetupWizardOutput({
                    success: false,
                    provisioned: false,
                    draftId: draft.draftId,
                    tenantSlug: draft.tenantSlug,
                    failures: tenantResult.failures || [failure('TENANT_PROVISIONING_FAILED', '', 'Tenant provisioning failed.', 'CRITICAL')],
                    warnings: tenantResult.warnings || [],
                    timestamp: nowIso()
                });
            }

            var setupResult = global.OrganizationSetupService && typeof global.OrganizationSetupService.saveOrganizationSetup === 'function'
                ? global.OrganizationSetupService.saveOrganizationSetup(setupPayloadFromDraft(draft), {
                    actor: { role: 'platform_owner', id: access.actor.id, email: access.actor.email, tenantSlug: draft.tenantSlug },
                    secureProvisioning: true
                })
                : { success: true, saved: true, setup: { setupId: 'ORGSETUP-' + draft.tenantSlug } };

            if (setupResult.success === false) {
                return freezeOrganizationSetupWizardOutput({
                    success: false,
                    provisioned: false,
                    draftId: draft.draftId,
                    tenantSlug: draft.tenantSlug,
                    failures: setupResult.failures || [failure('ORGANIZATION_SETUP_SAVE_FAILED', '', 'Organization setup save failed.', 'HIGH')],
                    warnings: setupResult.warnings || [],
                    timestamp: nowIso()
                });
            }

            var administrator = persistProvisionedConfiguration(draft, tenantResult.tenant, setupResult, access.actor);
            audit('ENTERPRISE_ORGANIZATION_SETUP_PROVISIONED', access.actor, { draftId: draft.draftId, tenantSlug: draft.tenantSlug, administratorEmail: administrator.email });

            return freezeOrganizationSetupWizardOutput({
                success: true,
                provisioned: true,
                draftId: draft.draftId,
                tenant: tenantResult.tenant,
                administrator: {
                    id: administrator.id,
                    name: administrator.name,
                    email: administrator.email,
                    role: administrator.role,
                    inviteStatus: administrator.inviteStatus,
                    mfaRequired: administrator.mfaRequired
                },
                setup: setupResult.setup || null,
                governance: {
                    tenantIsolationPreserved: true,
                    backwardCompatible: true,
                    businessWorkflowsModified: false,
                    schemaMigrationRequired: false,
                    futureScaleSupported: true
                },
                analytics: calculateSetupReadiness(draft, context || {}),
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('TENANT_PROVISIONING_ORCHESTRATION_FAILED', 'Tenant provisioning orchestration failed safely.', [failure('TENANT_PROVISIONING_ORCHESTRATION_FAILED', '', 'Tenant provisioning orchestration failed safely.', 'CRITICAL', { error: error && error.message })]);
        }
    }

    function getWizardState(input, context) {
        var draft = normalizeDraft(input || {}, context || {});
        var review = generateReviewSummary(draft, context || {});
        return freezeOrganizationSetupWizardOutput({
            success: true,
            draft: draft,
            review: review,
            readiness: calculateSetupReadiness(draft, context || {}),
            steps: WIZARD_STEPS,
            timestamp: nowIso()
        });
    }

    var OrganizationSetupValidator = Object.freeze({
        validateStep: validateStep,
        generateReviewSummary: generateReviewSummary,
        detectDuplicateOrganization: detectDuplicateOrganization,
        calculateSetupReadiness: calculateSetupReadiness
    });

    var OrganizationStructureImporter = Object.freeze({
        importFromRows: importFromRows,
        importOrganizationStructure: importFromRows
    });

    var OrganizationDraftManager = Object.freeze({
        saveStepDraft: saveStepDraft,
        resumeDraft: resumeDraft
    });

    var TenantProvisioningOrchestrator = Object.freeze({
        provisionTenant: provisionTenant
    });

    var OrganizationSetupAnalytics = Object.freeze({
        calculateSetupReadiness: calculateSetupReadiness
    });

    var OrganizationSetupWizard = Object.freeze({
        WIZARD_STEPS: WIZARD_STEPS,
        saveStepDraft: saveStepDraft,
        resumeDraft: resumeDraft,
        validateStep: validateStep,
        importOrganizationStructure: importFromRows,
        generateReviewSummary: generateReviewSummary,
        provisionTenant: provisionTenant,
        calculateSetupReadiness: calculateSetupReadiness,
        getWizardState: getWizardState
    });

    var EnterpriseOrganizationSetupWizardService = Object.freeze({
        WIZARD_STEPS: WIZARD_STEPS,
        OrganizationSetupWizard: OrganizationSetupWizard,
        OrganizationSetupValidator: OrganizationSetupValidator,
        OrganizationStructureImporter: OrganizationStructureImporter,
        OrganizationDraftManager: OrganizationDraftManager,
        TenantProvisioningOrchestrator: TenantProvisioningOrchestrator,
        OrganizationSetupAnalytics: OrganizationSetupAnalytics,
        saveStepDraft: saveStepDraft,
        resumeDraft: resumeDraft,
        validateStep: validateStep,
        importOrganizationStructure: importFromRows,
        generateReviewSummary: generateReviewSummary,
        provisionTenant: provisionTenant,
        calculateSetupReadiness: calculateSetupReadiness,
        getWizardState: getWizardState,
        freezeOrganizationSetupWizardOutput: freezeOrganizationSetupWizardOutput
    });

    global.EnterpriseOrganizationSetupWizardService = EnterpriseOrganizationSetupWizardService;
    global.enterpriseOrganizationSetupWizardService = EnterpriseOrganizationSetupWizardService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            var invalid = validateStep({ stepKey: 'organizationInformation', values: {} }, { draftId: 'self-test' });
            record('organization information validation works', invalid.valid === false && !!invalid.inlineErrors.companyName, invalid);
            var imported = importFromRows([{ Type: 'Department', Name: 'HR', Code: 'HR' }, { Type: 'Department', Name: 'HR', Code: 'HR' }], { tenantSlug: 'self-test' });
            record('structure import de-duplicates rows', imported.success === true && imported.structure.departments.length === 1 && imported.warnings.length === 1, imported);
            var frozen = freezeOrganizationSetupWizardOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            var unknown = validateStep({ stepKey: 'not-real', values: {} }, {});
            record('unknown steps fail safely', unknown.valid === false && unknown.failures.length > 0, unknown);
            global.__ARTHHRMS_ENTERPRISE_ORG_SETUP_WIZARD_SELF_TEST__ = Object.freeze({
                passed: checks.every(function all(check) { return check.passed; }),
                tests: Object.freeze(checks.slice())
            });
        } catch (error) {
            global.__ARTHHRMS_ENTERPRISE_ORG_SETUP_WIZARD_SELF_TEST__ = Object.freeze({
                passed: false,
                tests: Object.freeze([Object.freeze({ name: 'self-test runtime safety', passed: false, details: error && error.message || String(error) })])
            });
        }
    }

    if (!db()) warn('Optional DB dependency not detected. Wizard persistence will be disabled safely.');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
