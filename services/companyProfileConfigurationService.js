/**
 * companyProfileConfigurationService.js
 * ARTHHRMS - Company Profile & Business Configuration Center
 *
 * Tenant-scoped, versioned, auditable organization-level configuration.
 * This service updates configuration metadata only and does not mutate HR workflows.
 */
(function attachCompanyProfileConfigurationService(global) {
    'use strict';

    var PREFIX = '[CompanyProfileConfigurationService]';
    var SOURCE = 'companyProfileConfigurationService';
    var CONFIG_TABLE = 'companyProfileConfigurations';
    var VERSION_TABLE = 'companyConfigurationVersions';
    var AUDIT_TABLE = 'companyConfigurationAuditHistory';
    var ANALYTICS_TABLE = 'companyConfigurationAnalytics';

    var MODULE_KEYS = Object.freeze([
        'attendance', 'payroll', 'recruitment', 'performance', 'assets', 'travel',
        'expenses', 'documents', 'training', 'aiAssistant', 'marketplace', 'workflows'
    ]);

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            safeWarn('DB read failed safely.', error && error.message);
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
            safeWarn('DB save failed safely.', error && error.message);
        }
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function safeString(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        return String(value).trim();
    }

    function isPlainObject(value) {
        return !!value && Object.prototype.toString.call(value) === '[object Object]';
    }

    function normalizeRole(value) {
        return safeString(value, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeTenant(value) {
        return safeString(value, '').toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function normalizeCode(value) {
        return safeString(value, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    }

    function normalizeEmail(value) {
        return safeString(value, '').toLowerCase();
    }

    function isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeString(value, ''));
    }

    function isUrl(value) {
        var text = safeString(value, '');
        return !text || /^https?:\/\/[^\s.]+\.[^\s]+/i.test(text);
    }

    function isHex(value) {
        return /^#[0-9a-f]{6}$/i.test(safeString(value, ''));
    }

    function clone(value, depth) {
        if (depth > 25) return null;
        if (Array.isArray(value)) {
            return value.slice(0, 5000).map(function each(item) { return clone(item, depth + 1); });
        }
        if (isPlainObject(value)) {
            var out = {};
            Object.keys(value).forEach(function key(name) {
                if (/password|secret|token|private[_-]?key|api[_-]?key|client[_-]?secret/i.test(name)) return;
                out[name] = clone(value[name], depth + 1);
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
        Object.keys(value).forEach(function each(key) { deepFreeze(value[key], refs); });
        return Object.freeze(value);
    }

    function freezeConfigurationOutput(value) {
        return deepFreeze(clone(value || {}, 0));
    }

    function issue(code, message, severity, metadata) {
        return freezeConfigurationOutput({
            code: normalizeCode(code || 'CONFIGURATION_ISSUE'),
            message: safeString(message, 'Configuration issue.'),
            severity: normalizeCode(severity || 'HIGH'),
            metadata: clone(metadata || {}, 0)
        });
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.actorId || actor.userId || actor.email || '', ''),
            email: normalizeEmail(actor.email || ''),
            role: normalizeRole(actor.role || actor.actorRole || context && context.role || ''),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function tenantFrom(input, context) {
        var data = rawData();
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.companyId) ||
            context && (context.tenantSlug || context.tenantId) ||
            context && context.actor && (context.actor.tenantSlug || context.actor.tenantId) ||
            data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId) ||
            'default'
        );
    }

    function ensureTables(data) {
        if (!data[CONFIG_TABLE] || Array.isArray(data[CONFIG_TABLE])) data[CONFIG_TABLE] = {};
        if (!Array.isArray(data[VERSION_TABLE])) data[VERSION_TABLE] = [];
        if (!Array.isArray(data[AUDIT_TABLE])) data[AUDIT_TABLE] = [];
        if (!Array.isArray(data[ANALYTICS_TABLE])) data[ANALYTICS_TABLE] = [];
        if (!data.tenantFeatureFlags || Array.isArray(data.tenantFeatureFlags)) data.tenantFeatureFlags = {};
    }

    function failureOutput(code, tenantSlug, failures) {
        return freezeConfigurationOutput({
            success: false,
            tenantSlug: normalizeTenant(tenantSlug),
            failures: failures && failures.length ? failures : [issue(code, 'Company configuration failed safely.', 'HIGH')],
            warnings: [],
            timestamp: nowIso(),
            governance: {
                tenantIsolationPreserved: true,
                backwardCompatible: true,
                hrWorkflowsModified: false,
                audited: false,
                versioned: false
            }
        });
    }

    function validateAccess(input, context, operation) {
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actor = contextActor(context || {});
        var role = actor.role;
        var allowedRoles = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'ADMIN', 'HR'];
        var manageRoles = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'ADMIN'];
        var failures = [];
        if (allowedRoles.indexOf(role) === -1) {
            failures.push(issue('CONFIGURATION_ACCESS_DENIED', 'Role cannot access company configuration.', 'HIGH', { role: role }));
        }
        if (operation !== 'VIEW' && manageRoles.indexOf(role) === -1) {
            failures.push(issue('CONFIGURATION_MANAGE_DENIED', 'Role cannot modify company configuration.', 'HIGH', { role: role }));
        }
        if (actor.tenantSlug && actor.tenantSlug !== tenantSlug && role !== 'PLATFORM_OWNER') {
            failures.push(issue('CROSS_TENANT_CONFIGURATION_BLOCKED', 'Cross-tenant configuration access is blocked.', 'CRITICAL', { actorTenant: actor.tenantSlug, targetTenant: tenantSlug }));
        }
        return { allowed: failures.length === 0, actor: actor, tenantSlug: tenantSlug, failures: failures };
    }

    function defaultConfiguration(tenantSlug) {
        var data = rawData();
        var settings = data.companySettings || {};
        var tenant = (Array.isArray(data.platformTenants) ? data.platformTenants : []).find(function find(row) {
            return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId)) === tenantSlug;
        }) || {};
        var companyName = settings.companyName || tenant.companyName || '';
        return {
            tenantSlug: tenantSlug,
            companyProfile: {
                companyName: companyName,
                legalEntityName: settings.legalEntityName || settings.legalEntity || tenant.legalEntity || companyName,
                brandName: settings.brandName || companyName,
                companyCode: normalizeCode(settings.companyCode || tenant.companyCode || tenantSlug || companyName),
                registrationNumber: settings.registrationNumber || '',
                gstVatNumber: settings.gstVatNumber || settings.gst || '',
                panTin: settings.panTin || settings.pan || '',
                industry: settings.industry || tenant.industry || '',
                companySize: settings.companySize || tenant.companySize || '',
                companyType: settings.companyType || '',
                website: settings.website || '',
                officialEmail: settings.officialEmail || settings.companyEmail || '',
                phoneNumbers: Array.isArray(settings.phoneNumbers) ? settings.phoneNumbers : (settings.companyPhone ? [settings.companyPhone] : []),
                logo: settings.logo || settings.companyLogoUrl || '',
                brandAssets: Array.isArray(settings.brandAssets) ? settings.brandAssets : []
            },
            addresses: Array.isArray(settings.addresses) ? settings.addresses : [],
            businessSettings: {
                fiscalYear: settings.fiscalYear || 'APR-MAR',
                financialYear: settings.financialYear || '',
                businessCalendar: settings.businessCalendar || '',
                currency: settings.currency || 'INR',
                numberFormat: settings.numberFormat || 'en-IN',
                dateFormat: settings.dateFormat || 'DD/MM/YYYY',
                timeFormat: settings.timeFormat || '24H',
                languages: Array.isArray(settings.languages) ? settings.languages : ['en'],
                defaultTimeZone: settings.timezone || settings.defaultTimeZone || 'Asia/Kolkata',
                weekStartDay: settings.weekStartDay || 'MON'
            },
            organizationStructure: {
                businessUnits: [],
                departments: [],
                divisions: [],
                costCenters: [],
                profitCenters: [],
                legalEntities: [],
                locations: [],
                hierarchy: []
            },
            branding: {
                primaryLogo: settings.companyLogoUrl || '',
                darkLogo: '',
                favicon: '',
                primaryColor: '#1a56db',
                secondaryColor: '#0ea5e9',
                accentColor: '#059669',
                emailBranding: false,
                pdfBranding: false,
                portalBranding: true
            },
            moduleConfiguration: {},
            organizationPreferences: {
                workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
                defaultLeaveYear: 'FISCAL',
                attendanceRules: { graceMinutes: Number(settings.attendanceGraceMinutes || 15) },
                payrollFrequency: 'MONTHLY',
                defaultShift: 'GENERAL',
                approvalDefaults: {},
                notificationDefaults: {},
                documentNumberFormats: {},
                employeeIdFormat: ''
            },
            updatedAt: '',
            updatedBy: ''
        };
    }

    function getActiveConfiguration(tenantSlug, data) {
        ensureTables(data);
        var existing = data[CONFIG_TABLE][tenantSlug];
        if (existing && isPlainObject(existing)) return Object.assign(defaultConfiguration(tenantSlug), clone(existing, 0));
        return defaultConfiguration(tenantSlug);
    }

    function normalizeNamedRows(rows) {
        var source = Array.isArray(rows) ? rows : [];
        var seen = {};
        var normalized = [];
        source.slice(0, 5000).forEach(function each(row) {
            var item = isPlainObject(row) ? row : { name: row };
            var name = safeString(item.name || item.title || item.departmentName || item.locationName || '', '');
            var code = normalizeCode(item.code || item.departmentCode || item.locationCode || name);
            if (!name && !code) return;
            var key = code || name.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            normalized.push(Object.assign({}, clone(item, 0), { name: name || code, code: code }));
        });
        return normalized;
    }

    function normalizeProfile(profile) {
        var source = isPlainObject(profile) ? profile : {};
        return {
            companyName: safeString(source.companyName || source.company_name, ''),
            legalEntityName: safeString(source.legalEntityName || source.legalName || source.legal_entity_name, ''),
            brandName: safeString(source.brandName || source.brand_name, ''),
            companyCode: normalizeCode(source.companyCode || source.company_code),
            registrationNumber: safeString(source.registrationNumber || source.registration_number, ''),
            gstVatNumber: safeString(source.gstVatNumber || source.gst || source.vat || source.gst_vat_number, ''),
            panTin: safeString(source.panTin || source.pan || source.tin || source.pan_tin, ''),
            industry: safeString(source.industry, ''),
            companySize: safeString(source.companySize || source.company_size, ''),
            companyType: safeString(source.companyType || source.company_type, ''),
            website: safeString(source.website, ''),
            officialEmail: normalizeEmail(source.officialEmail || source.companyEmail || source.email || ''),
            phoneNumbers: Array.isArray(source.phoneNumbers) ? source.phoneNumbers.map(function phone(v) { return safeString(v, ''); }).filter(Boolean) : (source.phone ? [safeString(source.phone, '')] : []),
            logo: safeString(source.logo || source.companyLogoUrl || '', ''),
            brandAssets: Array.isArray(source.brandAssets) ? clone(source.brandAssets, 0) : []
        };
    }

    function normalizeAddressType(value) {
        var normalized = normalizeCode(value || 'BRANCH');
        var allowed = {
            HEAD_OFFICE: true,
            BRANCH: true,
            REGIONAL_OFFICE: true,
            WAREHOUSE: true,
            FACTORY: true,
            REMOTE_OFFICE: true
        };
        return allowed[normalized] ? normalized : 'BRANCH';
    }

    function normalizeAddresses(addresses) {
        var source = Array.isArray(addresses) ? addresses : [];
        var seen = {};
        var normalized = [];
        source.slice(0, 5000).forEach(function each(row) {
            var item = isPlainObject(row) ? row : {};
            var type = normalizeAddressType(item.type || item.addressType);
            var name = safeString(item.name || item.officeName || item.locationName || '', '');
            var address = {
                type: type,
                name: name,
                country: safeString(item.country, ''),
                state: safeString(item.state || item.province, ''),
                city: safeString(item.city, ''),
                postalCode: safeString(item.postalCode || item.zip || item.pincode, ''),
                timezone: safeString(item.timezone || item.timeZone, ''),
                gps: safeString(item.gps || item.coordinates, '')
            };
            if (!address.name && !address.country && !address.city) return;
            var key = [address.type, address.name.toLowerCase(), address.city.toLowerCase(), address.postalCode].join(':');
            if (seen[key]) return;
            seen[key] = true;
            normalized.push(address);
        });
        return normalized;
    }

    function normalizeBusinessSettings(settings) {
        var source = isPlainObject(settings) ? settings : {};
        return {
            fiscalYear: safeString(source.fiscalYear || source.fiscal_year, ''),
            financialYear: safeString(source.financialYear || source.financial_year, ''),
            businessCalendar: safeString(source.businessCalendar || source.business_calendar, ''),
            currency: safeString(source.currency, '').toUpperCase(),
            numberFormat: safeString(source.numberFormat || source.number_format, ''),
            dateFormat: safeString(source.dateFormat || source.date_format, ''),
            timeFormat: safeString(source.timeFormat || source.time_format, ''),
            languages: Array.isArray(source.languages) ? source.languages.map(function lang(v) { return safeString(v, ''); }).filter(Boolean) : [],
            defaultTimeZone: safeString(source.defaultTimeZone || source.timezone || source.default_time_zone, ''),
            weekStartDay: safeString(source.weekStartDay || source.week_start_day, '').toUpperCase()
        };
    }

    function normalizeStructure(structure) {
        var source = isPlainObject(structure) ? structure : {};
        return {
            businessUnits: normalizeNamedRows(source.businessUnits || source.business_units || []),
            departments: normalizeNamedRows(source.departments || []),
            divisions: normalizeNamedRows(source.divisions || []),
            costCenters: normalizeNamedRows(source.costCenters || source.cost_centers || []),
            profitCenters: normalizeNamedRows(source.profitCenters || source.profit_centers || []),
            legalEntities: normalizeNamedRows(source.legalEntities || source.legal_entities || []),
            locations: normalizeNamedRows(source.locations || []),
            hierarchy: Array.isArray(source.hierarchy) ? clone(source.hierarchy, 0) : []
        };
    }

    function normalizeBranding(branding) {
        var source = isPlainObject(branding) ? branding : {};
        return {
            primaryLogo: safeString(source.primaryLogo || source.logo || '', ''),
            darkLogo: safeString(source.darkLogo || '', ''),
            favicon: safeString(source.favicon || '', ''),
            primaryColor: safeString(source.primaryColor || '#1a56db', '#1a56db'),
            secondaryColor: safeString(source.secondaryColor || '#0ea5e9', '#0ea5e9'),
            accentColor: safeString(source.accentColor || '#059669', '#059669'),
            emailBranding: !!source.emailBranding,
            pdfBranding: !!source.pdfBranding,
            portalBranding: source.portalBranding !== false
        };
    }

    function normalizeModules(modules) {
        var source = isPlainObject(modules) ? modules : {};
        var out = {};
        MODULE_KEYS.forEach(function each(key) { out[key] = !!source[key]; });
        return out;
    }

    function normalizePreferences(preferences) {
        var source = isPlainObject(preferences) ? preferences : {};
        return {
            workingDays: Array.isArray(source.workingDays) ? source.workingDays.map(function day(v) { return safeString(v, '').toUpperCase(); }).filter(Boolean) : [],
            defaultLeaveYear: safeString(source.defaultLeaveYear || source.default_leave_year, ''),
            attendanceRules: clone(source.attendanceRules || source.attendance_rules || {}, 0),
            payrollFrequency: safeString(source.payrollFrequency || source.payroll_frequency, ''),
            defaultShift: safeString(source.defaultShift || source.default_shift, ''),
            approvalDefaults: clone(source.approvalDefaults || source.approval_defaults || {}, 0),
            notificationDefaults: clone(source.notificationDefaults || source.notification_defaults || {}, 0),
            documentNumberFormats: clone(source.documentNumberFormats || source.document_number_formats || {}, 0),
            employeeIdFormat: safeString(source.employeeIdFormat || source.employee_id_format, '')
        };
    }

    function duplicateCompanyCode(code, tenantSlug, data) {
        var normalized = normalizeCode(code);
        if (!normalized) return false;
        var rows = [];
        (Array.isArray(data.platformTenants) ? data.platformTenants : []).forEach(function each(row) { rows.push(row); });
        Object.keys(data[CONFIG_TABLE] || {}).forEach(function each(key) {
            rows.push(Object.assign({ tenantSlug: key }, data[CONFIG_TABLE][key].companyProfile || {}));
        });
        return rows.some(function same(row) {
            var rowTenant = normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId));
            if (rowTenant === tenantSlug) return false;
            return normalizeCode(row && (row.companyCode || row.organizationCode || row.code)) === normalized;
        });
    }

    function validateProfile(profile, tenantSlug, data) {
        var failures = [];
        if (!profile.companyName) failures.push(issue('COMPANY_NAME_REQUIRED', 'Company name is required.', 'HIGH'));
        if (!profile.legalEntityName) failures.push(issue('LEGAL_ENTITY_REQUIRED', 'Legal entity name is required.', 'HIGH'));
        if (!profile.companyCode) failures.push(issue('COMPANY_CODE_REQUIRED', 'Company code is required.', 'HIGH'));
        if (profile.companyCode && duplicateCompanyCode(profile.companyCode, tenantSlug, data)) failures.push(issue('DUPLICATE_COMPANY_CODE', 'Company code already belongs to another tenant.', 'CRITICAL'));
        if (profile.officialEmail && !isEmail(profile.officialEmail)) failures.push(issue('INVALID_OFFICIAL_EMAIL', 'Official email is invalid.', 'HIGH'));
        if (profile.website && !isUrl(profile.website)) failures.push(issue('INVALID_WEBSITE', 'Website URL is invalid.', 'MEDIUM'));
        if (profile.gstVatNumber && !/^[A-Z0-9-]{8,20}$/i.test(profile.gstVatNumber)) failures.push(issue('INVALID_GST_VAT_NUMBER', 'GST/VAT number contains invalid characters.', 'HIGH'));
        if (profile.panTin && !/^[A-Z0-9-]{6,20}$/i.test(profile.panTin)) failures.push(issue('INVALID_PAN_TIN', 'PAN/TIN contains invalid characters.', 'HIGH'));
        return failures;
    }

    function validateAddresses(addresses) {
        var failures = [];
        var headOfficeCount = 0;
        (addresses || []).forEach(function each(row, index) {
            if (row.type === 'HEAD_OFFICE') headOfficeCount += 1;
            ['name', 'country', 'state', 'city', 'postalCode', 'timezone'].forEach(function required(field) {
                if (!row[field]) failures.push(issue('ADDRESS_FIELD_REQUIRED', 'Address ' + (index + 1) + ' is missing ' + field + '.', 'HIGH', { index: index, field: field }));
            });
            if (row.gps && !/^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/.test(row.gps)) {
                failures.push(issue('INVALID_ADDRESS_GPS', 'GPS coordinates must use latitude,longitude format.', 'MEDIUM', { index: index }));
            }
        });
        if (headOfficeCount > 1) failures.push(issue('DUPLICATE_HEAD_OFFICE', 'Only one head office address can be marked as primary.', 'HIGH'));
        return failures;
    }

    function validateBranding(branding) {
        var failures = [];
        ['primaryLogo', 'darkLogo', 'favicon'].forEach(function each(key) {
            if (branding[key] && !isUrl(branding[key])) failures.push(issue('INVALID_BRAND_ASSET_URL', key + ' must be a valid URL.', 'MEDIUM', { field: key }));
        });
        ['primaryColor', 'secondaryColor', 'accentColor'].forEach(function each(key) {
            if (!isHex(branding[key])) failures.push(issue('INVALID_BRAND_COLOR', key + ' must be a 6-digit hex color.', 'HIGH', { field: key }));
        });
        return failures;
    }

    function versionNumber(data, tenantSlug) {
        return data[VERSION_TABLE].filter(function match(row) { return row.tenantSlug === tenantSlug; }).length + 1;
    }

    function audit(actionType, metadata, context) {
        var actor = contextActor(context || {});
        var clean = clone(metadata || {}, 0);
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.email,
                    module: 'Company Configuration',
                    targetId: clean.versionId || clean.tenantSlug || '',
                    source: SOURCE,
                    severity: 'INFO',
                    metadata: Object.assign({ tenantIsolationPreserved: true }, clean)
                }, { source: SOURCE });
            } else if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Company Configuration', clean.versionId || clean.tenantSlug || '', JSON.stringify(clean));
            }
        } catch (error) {
            safeWarn('External audit failed safely.', error && error.message);
        }
        return true;
    }

    function persistVersion(data, tenantSlug, domain, previousValue, newValue, reason, context, rollbackOf) {
        var actor = contextActor(context || {});
        var row = {
            versionId: 'CCFG-' + tenantSlug + '-' + String(versionNumber(data, tenantSlug)).padStart(4, '0'),
            tenantSlug: tenantSlug,
            domain: domain,
            version: versionNumber(data, tenantSlug),
            timestamp: nowIso(),
            changedBy: actor.id || actor.email || actor.role,
            changedByRole: actor.role,
            previousValue: clone(previousValue || {}, 0),
            newValue: clone(newValue || {}, 0),
            reason: safeString(reason || 'Configuration updated.', 'Configuration updated.'),
            rollbackSupported: true,
            rollbackOf: rollbackOf || '',
            immutable: true
        };
        data[VERSION_TABLE].unshift(row);
        data[VERSION_TABLE] = data[VERSION_TABLE].slice(0, 1000);
        data[AUDIT_TABLE].unshift({
            auditId: 'CCAUD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            tenantSlug: tenantSlug,
            actionType: rollbackOf ? 'COMPANY_CONFIGURATION_ROLLBACK' : 'COMPANY_CONFIGURATION_UPDATED',
            domain: domain,
            versionId: row.versionId,
            changedBy: row.changedBy,
            changedByRole: row.changedByRole,
            timestamp: row.timestamp,
            immutable: true,
            metadata: { reason: row.reason, rollbackOf: rollbackOf || '' }
        });
        data[AUDIT_TABLE] = data[AUDIT_TABLE].slice(0, 1000);
        data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
        data.auditLogs.unshift({
            id: 'AL' + String((data.auditLogs.length || 0) + 1).padStart(4, '0'),
            date: row.timestamp,
            userRole: row.changedByRole || 'system',
            actorRole: row.changedByRole || 'system',
            actorId: row.changedBy || '',
            action: rollbackOf ? 'COMPANY_CONFIGURATION_ROLLBACK' : 'COMPANY_CONFIGURATION_UPDATED',
            actionType: rollbackOf ? 'COMPANY_CONFIGURATION_ROLLBACK' : 'COMPANY_CONFIGURATION_UPDATED',
            module: 'Company Configuration',
            targetId: row.versionId,
            tenantSlug: tenantSlug,
            description: (rollbackOf ? 'Company configuration rollback: ' : 'Company configuration update: ') + domain
        });
        data.auditLogs = data.auditLogs.slice(0, 500);
        audit(rollbackOf ? 'COMPANY_CONFIGURATION_ROLLBACK' : 'COMPANY_CONFIGURATION_UPDATED', { tenantSlug: tenantSlug, domain: domain, versionId: row.versionId, reason: row.reason }, context || {});
        return row;
    }

    function syncCompatibleCompanySettings(data, tenantSlug, config) {
        var currentTenant = normalizeTenant(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
        if (currentTenant && currentTenant !== tenantSlug) return;
        var profile = config.companyProfile || {};
        var business = config.businessSettings || {};
        var branding = config.branding || {};
        data.companySettings = Object.assign({}, data.companySettings || {}, {
            tenantSlug: tenantSlug,
            tenantId: data.companySettings && data.companySettings.tenantId || 'TEN-' + tenantSlug,
            companyId: data.companySettings && data.companySettings.companyId || 'TEN-' + tenantSlug,
            companyName: profile.companyName || data.companySettings && data.companySettings.companyName || '',
            legalEntityName: profile.legalEntityName || '',
            brandName: profile.brandName || '',
            companyCode: profile.companyCode || data.companySettings && data.companySettings.companyCode || '',
            registrationNumber: profile.registrationNumber || '',
            gstVatNumber: profile.gstVatNumber || '',
            panTin: profile.panTin || '',
            industry: profile.industry || '',
            companySize: profile.companySize || '',
            companyType: profile.companyType || '',
            website: profile.website || '',
            officialEmail: profile.officialEmail || '',
            companyLogoUrl: branding.primaryLogo || profile.logo || data.companySettings && data.companySettings.companyLogoUrl || '',
            timezone: business.defaultTimeZone || data.companySettings && data.companySettings.timezone || 'Asia/Kolkata',
            currency: business.currency || data.companySettings && data.companySettings.currency || 'INR',
            fiscalYear: business.fiscalYear || '',
            weekStartDay: business.weekStartDay || '',
            addresses: clone(config.addresses || [], 0)
        });
        data.settings = Object.assign({}, data.settings || {}, {
            companyName: data.companySettings.companyName,
            timezone: data.companySettings.timezone,
            currency: data.companySettings.currency
        });
    }

    function persistDomain(input, context, domain, normalizer, validator) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var current = getActiveConfiguration(scope.tenantSlug, data);
            var newValue = normalizer(input && input[domain]);
            var failures = validator ? validator(newValue, scope.tenantSlug, data) : [];
            if (failures.length) return failureOutput('VALIDATION_BLOCKED', scope.tenantSlug, failures);
            var previousValue = clone(current[domain] || {}, 0);
            current[domain] = newValue;
            current.tenantSlug = scope.tenantSlug;
            current.updatedAt = nowIso();
            current.updatedBy = scope.actor.id || scope.actor.email || '';
            data[CONFIG_TABLE][scope.tenantSlug] = clone(current, 0);
            if (domain === 'moduleConfiguration') {
                data.tenantFeatureFlags[scope.tenantSlug] = {};
                Object.keys(newValue).forEach(function each(key) {
                    data.tenantFeatureFlags[scope.tenantSlug][key] = {
                        enabled: !!newValue[key],
                        source: SOURCE,
                        tenantSlug: scope.tenantSlug,
                        updatedAt: current.updatedAt
                    };
                });
            }
            syncCompatibleCompanySettings(data, scope.tenantSlug, current);
            var version = persistVersion(data, scope.tenantSlug, domain, previousValue, newValue, input && input.reason, context || {});
            saveData(data);
            return freezeConfigurationOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                domain: domain,
                configuration: current,
                version: version,
                warnings: [],
                failures: [],
                governance: {
                    tenantIsolationPreserved: true,
                    backwardCompatible: true,
                    hrWorkflowsModified: false,
                    audited: true,
                    versioned: true,
                    rollbackSupported: true
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('CONFIGURATION_UPDATE_FAILED', tenantFrom(input || {}, context || {}), [issue('CONFIGURATION_UPDATE_FAILED', 'Configuration update failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function updateCompanyProfile(input, context) {
        return persistDomain(input, context, 'companyProfile', normalizeProfile, validateProfile);
    }

    function updateAddressManagement(input, context) {
        return persistDomain(input, context, 'addresses', normalizeAddresses, validateAddresses);
    }

    function updateBusinessConfiguration(input, context) {
        return persistDomain(input, context, 'businessSettings', normalizeBusinessSettings, function validate(settings) {
            var failures = [];
            if (!settings.fiscalYear) failures.push(issue('FISCAL_YEAR_REQUIRED', 'Fiscal year is required.', 'HIGH'));
            if (!settings.currency) failures.push(issue('CURRENCY_REQUIRED', 'Currency is required.', 'HIGH'));
            if (!settings.defaultTimeZone) failures.push(issue('TIMEZONE_REQUIRED', 'Default timezone is required.', 'HIGH'));
            return failures;
        });
    }

    function updateOrganizationStructure(input, context) {
        return persistDomain(input, context, 'organizationStructure', normalizeStructure, function validate(structure) {
            var failures = [];
            var duplicateCodes = {};
            ['businessUnits', 'departments', 'divisions', 'costCenters', 'profitCenters', 'legalEntities', 'locations'].forEach(function each(key) {
                (structure[key] || []).forEach(function rowEach(row) {
                    var code = key + ':' + row.code;
                    if (duplicateCodes[code]) failures.push(issue('DUPLICATE_STRUCTURE_CODE', 'Organization structure codes must be unique in each category.', 'HIGH', { category: key, code: row.code }));
                    duplicateCodes[code] = true;
                });
            });
            return failures;
        });
    }

    function updateBranding(input, context) {
        return persistDomain(input, context, 'branding', normalizeBranding, validateBranding);
    }

    function updateModuleConfiguration(input, context) {
        return persistDomain(input, context, 'moduleConfiguration', normalizeModules, null);
    }

    function updateOrganizationPreferences(input, context) {
        return persistDomain(input, context, 'organizationPreferences', normalizePreferences, function validate(preferences) {
            var failures = [];
            if (!preferences.workingDays.length) failures.push(issue('WORKING_DAYS_REQUIRED', 'Working days are required.', 'HIGH'));
            if (!preferences.payrollFrequency) failures.push(issue('PAYROLL_FREQUENCY_REQUIRED', 'Payroll frequency is required.', 'HIGH'));
            return failures;
        });
    }

    function getCompanyProfile(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'VIEW');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var config = getActiveConfiguration(scope.tenantSlug, data);
            return freezeConfigurationOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                profile: config.companyProfile,
                configuration: config,
                timestamp: nowIso(),
                governance: {
                    tenantIsolationPreserved: true,
                    backwardCompatible: true,
                    hrWorkflowsModified: false
                }
            });
        } catch (error) {
            return failureOutput('COMPANY_PROFILE_LOAD_FAILED', tenantFrom(input || {}, context || {}), [issue('COMPANY_PROFILE_LOAD_FAILED', 'Company profile load failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function getVersionHistory(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'VIEW');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var rows = (rawData()[VERSION_TABLE] || []).filter(function same(row) {
                return normalizeTenant(row && row.tenantSlug) === scope.tenantSlug;
            });
            return freezeConfigurationOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                versions: rows,
                count: rows.length,
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('VERSION_HISTORY_LOAD_FAILED', tenantFrom(input || {}, context || {}), [issue('VERSION_HISTORY_LOAD_FAILED', 'Version history load failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function rollbackConfiguration(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var versionId = safeString(input && input.versionId, '');
            var source = data[VERSION_TABLE].find(function match(row) {
                return row.versionId === versionId && normalizeTenant(row.tenantSlug) === scope.tenantSlug;
            });
            if (!source) return failureOutput('VERSION_NOT_FOUND', scope.tenantSlug, [issue('VERSION_NOT_FOUND', 'Rollback source version was not found.', 'HIGH')]);
            var current = getActiveConfiguration(scope.tenantSlug, data);
            var domain = source.domain;
            var previous = clone(current[domain] || {}, 0);
            current[domain] = clone(source.previousValue || {}, 0);
            current.updatedAt = nowIso();
            current.updatedBy = scope.actor.id || scope.actor.email || '';
            data[CONFIG_TABLE][scope.tenantSlug] = clone(current, 0);
            if (domain === 'moduleConfiguration') {
                data.tenantFeatureFlags[scope.tenantSlug] = {};
                Object.keys(current[domain] || {}).forEach(function each(key) {
                    data.tenantFeatureFlags[scope.tenantSlug][key] = { enabled: !!current[domain][key], source: SOURCE, tenantSlug: scope.tenantSlug, updatedAt: current.updatedAt };
                });
            }
            syncCompatibleCompanySettings(data, scope.tenantSlug, current);
            var version = persistVersion(data, scope.tenantSlug, domain, previous, current[domain], input && input.reason || 'Configuration rollback.', context || {}, source.versionId);
            saveData(data);
            return freezeConfigurationOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                domain: domain,
                configuration: current,
                rolledBackTo: source.versionId,
                version: version,
                timestamp: nowIso(),
                governance: {
                    tenantIsolationPreserved: true,
                    backwardCompatible: true,
                    hrWorkflowsModified: false,
                    audited: true,
                    versioned: true
                }
            });
        } catch (error) {
            return failureOutput('ROLLBACK_FAILED', tenantFrom(input || {}, context || {}), [issue('ROLLBACK_FAILED', 'Configuration rollback failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function calculateConfigurationHealth(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'VIEW');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var config = getActiveConfiguration(scope.tenantSlug, data);
            var structure = config.organizationStructure || {};
            var departmentCount = (structure.departments || []).length;
            var branchCount = (config.addresses || []).filter(function branch(row) { return /BRANCH|REGIONAL|WAREHOUSE|FACTORY|REMOTE/i.test(row.type || ''); }).length + (structure.locations || []).length;
            var modulesEnabled = Object.keys(config.moduleConfiguration || {}).filter(function enabled(key) { return !!config.moduleConfiguration[key]; }).length;
            var profileFields = ['companyName', 'legalEntityName', 'companyCode', 'industry', 'companySize', 'website', 'officialEmail'];
            var profileScore = Math.round(profileFields.filter(function has(field) { return !!safeString(config.companyProfile && config.companyProfile[field], ''); }).length / profileFields.length * 100);
            var businessScore = config.businessSettings && config.businessSettings.currency && config.businessSettings.defaultTimeZone && config.businessSettings.fiscalYear ? 100 : 60;
            var brandingScore = config.branding && config.branding.primaryLogo && config.branding.portalBranding ? 100 : 70;
            var structureScore = Math.min(100, 55 + departmentCount * 2 + (structure.businessUnits || []).length * 8 + (structure.locations || []).length * 5);
            var configurationHealthScore = Math.round((profileScore + businessScore + brandingScore + structureScore) / 4);
            var organizationMaturityScore = Math.min(100, Math.round((configurationHealthScore * 0.62) + Math.min(25, modulesEnabled * 3) + Math.min(15, departmentCount / 12)));
            var analytics = {
                tenantSlug: scope.tenantSlug,
                configurationChanges: (data[VERSION_TABLE] || []).filter(function same(row) { return row.tenantSlug === scope.tenantSlug; }).length,
                moduleUsage: modulesEnabled,
                organizationGrowth: Math.max(departmentCount, branchCount),
                branchCount: branchCount,
                departmentCount: departmentCount,
                employeeCapacity: config.companyProfile.companySize || '',
                configurationHealthScore: configurationHealthScore,
                organizationMaturityScore: organizationMaturityScore,
                generatedAt: nowIso()
            };
            data[ANALYTICS_TABLE].unshift(analytics);
            data[ANALYTICS_TABLE] = data[ANALYTICS_TABLE].slice(0, 300);
            saveData(data);
            return freezeConfigurationOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                configurationHealthScore: configurationHealthScore,
                organizationMaturityScore: organizationMaturityScore,
                analytics: analytics,
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('CONFIGURATION_HEALTH_FAILED', tenantFrom(input || {}, context || {}), [issue('CONFIGURATION_HEALTH_FAILED', 'Configuration health calculation failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function getCompanyProfileCenter(input, context) {
        var profile = getCompanyProfile(input || {}, context || {});
        if (!profile.success) return profile;
        return freezeConfigurationOutput({
            success: true,
            tenantSlug: profile.tenantSlug,
            configuration: profile.configuration,
            health: calculateConfigurationHealth(input || {}, context || {}),
            history: getVersionHistory(input || {}, context || {}),
            timestamp: nowIso()
        });
    }

    var CompanyProfileService = Object.freeze({
        getCompanyProfile: getCompanyProfile,
        updateCompanyProfile: updateCompanyProfile
    });
    var AddressManagementService = Object.freeze({
        updateAddressManagement: updateAddressManagement
    });
    var BusinessConfigurationService = Object.freeze({
        updateBusinessConfiguration: updateBusinessConfiguration
    });
    var OrganizationStructureService = Object.freeze({
        updateOrganizationStructure: updateOrganizationStructure
    });
    var BrandingService = Object.freeze({
        updateBranding: updateBranding
    });
    var ConfigurationVersionService = Object.freeze({
        getVersionHistory: getVersionHistory,
        rollbackConfiguration: rollbackConfiguration
    });
    var ConfigurationHealthService = Object.freeze({
        calculateConfigurationHealth: calculateConfigurationHealth
    });

    var service = Object.freeze({
        MODULE_KEYS: MODULE_KEYS,
        CompanyProfileService: CompanyProfileService,
        AddressManagementService: AddressManagementService,
        BusinessConfigurationService: BusinessConfigurationService,
        OrganizationStructureService: OrganizationStructureService,
        BrandingService: BrandingService,
        ConfigurationVersionService: ConfigurationVersionService,
        ConfigurationHealthService: ConfigurationHealthService,
        getCompanyProfile: getCompanyProfile,
        updateCompanyProfile: updateCompanyProfile,
        updateAddressManagement: updateAddressManagement,
        updateBusinessConfiguration: updateBusinessConfiguration,
        updateOrganizationStructure: updateOrganizationStructure,
        updateBranding: updateBranding,
        updateModuleConfiguration: updateModuleConfiguration,
        updateOrganizationPreferences: updateOrganizationPreferences,
        getVersionHistory: getVersionHistory,
        rollbackConfiguration: rollbackConfiguration,
        calculateConfigurationHealth: calculateConfigurationHealth,
        getCompanyProfileCenter: getCompanyProfileCenter,
        freezeConfigurationOutput: freezeConfigurationOutput
    });

    global.CompanyProfileConfigurationService = service;
    global.companyProfileConfigurationService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            var sampleContext = { tenantSlug: 'self-test', actor: { role: 'SUPER_ADMIN', tenantSlug: 'self-test', id: 'SELF' } };
            var loaded = getCompanyProfile({ tenantSlug: 'self-test' }, sampleContext);
            record('company profile loads', loaded.success === true && loaded.tenantSlug === 'self-test', loaded);
            var blocked = getCompanyProfile({ tenantSlug: 'self-test' }, { tenantSlug: 'other', actor: { role: 'HR', tenantSlug: 'other', id: 'HR' } });
            record('tenant isolation preserved', blocked.success === false && blocked.failures.some(function find(row) { return row.code === 'CROSS_TENANT_CONFIGURATION_BLOCKED'; }), blocked);
            var frozen = freezeConfigurationOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            global.__ARTHHRMS_COMPANY_PROFILE_CONFIGURATION_SELF_TEST__ = Object.freeze({
                passed: checks.every(function ok(row) { return row.passed; }),
                tests: Object.freeze(checks.slice())
            });
        } catch (error) {
            global.__ARTHHRMS_COMPANY_PROFILE_CONFIGURATION_SELF_TEST__ = Object.freeze({
                passed: false,
                tests: Object.freeze([Object.freeze({ name: 'self-test runtime safety', passed: false, details: error && error.message || String(error) })])
            });
        }
    }

    if (!db()) safeWarn('Optional DB dependency not detected. Configuration persistence will degrade safely.');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
