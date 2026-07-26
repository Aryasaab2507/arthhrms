/**
 * platformGovernanceService.js
 * ARTHHRMS — Platform Governance Isolation Layer
 *
 * PURPOSE:
 * Provides strict isolation between tenant/company hierarchy
 * and ArthHRMS platform ownership governance.
 *
 * This service manages:
 * - platform owner visibility isolation
 * - tenant boundary enforcement
 * - governance access separation
 * - global governance authorization
 *
 * This service does NOT:
 * - expose platform ownership to tenants
 * - inject platform users into tenant org structures
 * - bypass audit visibility
 *
 * ARCHITECTURE RULE:
 * Platform governance must remain isolated from tenant operations.
 *
 * STABILITY:
 * Tenant behavior must remain backward-compatible.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    function db() { return global.DB; }

    const SECTION_FEATURE_MAP = {
        employees: 'employees',
        attendance: 'attendance',
        roster: 'attendance',
        shifts: 'attendance',
        regularization: 'attendanceRegularization',
        leave: 'leave',
        payroll: 'payroll',
        expenses: 'expenseClaims',
        performance: 'performance',
        cycles: 'appraisal',
        appraisals: 'appraisal',
        strategic: 'strategicDeliverables',
        deliverables: 'strategicDeliverables',
        recruitment: 'recruitment',
        lifecycle: 'lifecycle',
        training: 'training',
        documents: 'documents',
        docverify: 'documentVerification',
        onboardingdesk: 'lifecycle',
        helpdesk: 'helpdesk',
        import: 'imports',
        imports: 'imports',
        notifications: 'notifications',
        reports: 'reports',
        customreports: 'reports',
        whatsapp: 'whatsapp',
        users: 'userManagement',
        teams: 'teamManagement',
        tasks: 'tasks',
        'company-policy': 'companySettings',
        'role-permissions': 'rolePermissions',
        'audit-logs': 'auditLogs',
        broadcast: 'broadcast',
        settings: 'systemSettings'
    };

    const SAFE_DEFAULT_SECTION = {
        employee: 'home',
        manager: 'dashboard',
        admin: 'dashboard',
        hr: 'dashboard',
        super_admin: 'dashboard',
        platform_owner: 'overview'
    };

    const TENANT_ROLES = Object.freeze(['employee', 'manager', 'hr', 'hr_head', 'director', 'admin', 'super_admin']);
    const PLATFORM_ROLES = Object.freeze(['platform_owner']);
    const GOVERNANCE_ENTRYPOINT = 'platform-control.html';
    const PLATFORM_ROUTE_NAMES = Object.freeze(['platform-control.html', 'company-setup.html']);
    const SENSITIVE_TENANT_FIELDS = Object.freeze([
        'salary',
        'salaryAmount',
        'basicSalary',
        'grossSalary',
        'netSalary',
        'payrollAmount',
        'payroll',
        'payslip',
        'ctc',
        'compensation',
        'compensationStructure',
        'salaryStructure',
        'leaveBalance',
        'leave_balance',
        'leaveEntitlement',
        'leave_balance_values',
        'basic',
        'gross',
        'net',
        'allowances',
        'deductions',
        'hra',
        'pf',
        'tds',
        'bonusAmount',
        'overtimeAmount'
    ]);

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn('[PlatformGovernanceService] ' + message, details);
                else global.console.warn('[PlatformGovernanceService] ' + message);
            }
        } catch (err) {}
    }

    function safeCloneObject(input) {
        const output = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                output[key] = input[key];
            });
        } catch (err) {}
        return output;
    }

    function freezePlainObject(input) {
        const output = safeCloneObject(input);
        Object.keys(output).forEach(key => {
            if (Array.isArray(output[key])) output[key] = Object.freeze(output[key].slice());
            else if (output[key] && typeof output[key] === 'object') output[key] = Object.freeze(safeCloneObject(output[key]));
        });
        return Object.freeze(output);
    }

    function freezeArray(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return Object.freeze(list.map(item => {
            if (item && typeof item === 'object') return freezePlainObject(item);
            return item;
        }));
    }

    function safeMetadata(metadata) {
        const source = safeCloneObject(metadata);
        const output = {};
        Object.keys(source).forEach(key => {
            if (source[key] === null || typeof source[key] === 'string' || typeof source[key] === 'number' || typeof source[key] === 'boolean') output[key] = source[key];
            else if (Array.isArray(source[key])) output[key] = source[key].slice(0, 20);
            else if (source[key] && typeof source[key] === 'object') output[key] = safeCloneObject(source[key]);
        });
        return output;
    }

    function freezeGovernanceOutput(output) {
        if (Array.isArray(output)) return freezeArray(output);
        return freezePlainObject(output || {});
    }

    function normalizeRole(role) {
        if (global.authService?.normalizeRole) return global.authService.normalizeRole(role);
        const raw = String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'platformowner' || raw === 'owner' || raw === 'root') return 'platform_owner';
        if (raw === 'emp') return 'employee';
        return raw;
    }

    function currentUser() {
        try {
            if (global.authService?.getCurrentUser) return global.authService.getCurrentUser();
        } catch (err) {
        }
        return null;
    }

    function currentRole() {
        return normalizeRole(currentUser()?.role || '');
    }

    function isPlatformOwner(input) {
        const role = typeof input === 'object' && input !== null ? input.role : input;
        return normalizeRole(role) === 'platform_owner';
    }

    function isTenantRole(role) {
        return TENANT_ROLES.includes(normalizeRole(role));
    }

    function isTenantViewer(role) {
        const normalized = normalizeRole(role);
        return isTenantRole(normalized) && normalized !== 'platform_owner';
    }

    function platformScope(options) {
        const scope = String(options?.scope || options?.context || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        return scope === 'platform' || scope === 'platform_governance' || scope === 'governance';
    }

    function currentPathname() {
        try {
            return String(global.location?.pathname || '').split('/').pop().toLowerCase();
        } catch (err) {
            return '';
        }
    }

    function currentHostname() {
        try {
            return String(global.location?.hostname || '').toLowerCase();
        } catch (err) {
            return '';
        }
    }

    function isPlatformRoute(pathname) {
        try {
            const suppliedPath = pathname === undefined || pathname === null;
            const supplied = suppliedPath ? currentPathname() : String(pathname || '');
            const path = supplied.split('?')[0].split('#')[0].split('/').pop().toLowerCase();
            if (!suppliedPath) return PLATFORM_ROUTE_NAMES.includes(path);
            const host = currentHostname();
            return PLATFORM_ROUTE_NAMES.includes(path) ||
                host.indexOf('owner.') === 0 ||
                host.indexOf('platform.') === 0;
        } catch (err) {
            return false;
        }
    }

    function emitGovernanceTelemetry(eventType, metadata) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                source: 'platformGovernanceService',
                severity: 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata)
            });
            return true;
        } catch (err) {
            safeWarn('Governance telemetry failed safely.', { eventType, error: err?.message || String(err) });
            return false;
        }
    }

    function auditGovernanceAccess(eventType, actorInput, metadata) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType || 'PLATFORM_GOVERNANCE_ACCESS',
                eventType: eventType || 'PLATFORM_GOVERNANCE_ACCESS',
                actorId: actorInput?.id || actorInput?.empId || actorInput?.email || '',
                employeeId: actorInput?.empId || '',
                source: 'platformGovernanceService',
                severity: 'INFO',
                metadata: safeMetadata(metadata)
            }, {
                source: 'platformGovernanceService',
                actor: actorInput || {}
            });
            return true;
        } catch (err) {
            safeWarn('Governance audit failed safely.', { eventType, error: err?.message || String(err) });
            return false;
        }
    }

    function filterVisibleRoles(roles, viewer = currentUser(), options = {}) {
        try {
            const source = Array.isArray(roles) && roles.length
                ? roles.slice()
                : TENANT_ROLES.slice();
            const viewerRole = normalizeRole(typeof viewer === 'object' ? viewer?.role : viewer);
            const includePlatform = isPlatformOwner(viewerRole) && platformScope(options) && options.includePlatformOwner === true;
            const filtered = [];
            source.forEach(role => {
                const normalized = normalizeRole(role);
                if (!normalized) return;
                if (normalized === 'platform_owner' && !includePlatform) return;
                if (!includePlatform && !isTenantRole(normalized)) return;
                if (filtered.indexOf(normalized) === -1) filtered.push(normalized);
            });
            return Object.freeze(filtered);
        } catch (err) {
            safeWarn('Role visibility filtering failed safely.', { error: err?.message || String(err) });
            return Object.freeze(TENANT_ROLES.slice());
        }
    }

    function hidePlatformOwnerRole(role) {
        return normalizeRole(role) !== 'platform_owner';
    }

    function filterTenantRoles(roles) {
        return filterVisibleRoles(Array.isArray(roles) ? roles : TENANT_ROLES, { role: 'super_admin' }, { scope: 'tenant' });
    }

    function safeRoleVisibility(roles, viewer, options) {
        return freezeGovernanceOutput({
            roles: filterVisibleRoles(roles, viewer, options),
            platformOwnerHidden: !(isPlatformOwner(typeof viewer === 'object' ? viewer?.role : viewer) && platformScope(options) && options?.includePlatformOwner === true),
            tenantRoles: TENANT_ROLES.slice()
        });
    }

    function hasExplicitHrVisibility(input) {
        return input?.hrVisibilityGranted === true ||
            input?.canViewHRData === true ||
            input?.canViewCompensation === true ||
            input?.permissions?.hrVisibility === true ||
            input?.permissions?.compensation === true;
    }

    function canAccessHrSensitiveData(role, options = {}) {
        const normalized = normalizeRole(role);
        if (isPlatformOwner(normalized)) return platformScope(options) && hasExplicitHrVisibility(options);
        if (normalized === 'hr' || normalized === 'hr_head' || normalized === 'director') return true;
        if (normalized === 'super_admin') return hasExplicitHrVisibility(options);
        return false;
    }

    function isSensitiveTenantField(fieldName) {
        const normalized = String(fieldName || '').trim();
        if (SENSITIVE_TENANT_FIELDS.includes(normalized)) return true;
        const lower = normalized.toLowerCase();
        return lower.indexOf('salary') !== -1 ||
            lower.indexOf('payroll') !== -1 ||
            lower.indexOf('compensation') !== -1 ||
            lower === 'ctc' ||
            lower === 'net' ||
            lower === 'gross' ||
            lower === 'leavebalance' ||
            lower === 'leave_balance';
    }

    function stripSensitiveTenantFields(record, viewer = currentUser(), options = {}) {
        const source = safeCloneObject(record);
        const viewerRole = normalizeRole(typeof viewer === 'object' ? viewer?.role : viewer);
        if (canAccessHrSensitiveData(viewerRole, options)) return freezePlainObject(source);
        Object.keys(source).forEach(key => {
            if (isSensitiveTenantField(key)) delete source[key];
        });
        return freezePlainObject(source);
    }

    function sameTenant(user, viewer, options) {
        const requiredTenant = options?.tenantId || options?.companyId || options?.organizationId || '';
        const userTenant = user?.tenantId || user?.companyId || user?.organizationId || user?.orgId || '';
        const viewerTenant = viewer?.tenantId || viewer?.companyId || viewer?.organizationId || viewer?.orgId || '';
        if (!requiredTenant) return true;
        return String(userTenant || '') === String(requiredTenant);
    }

    function filterVisibleUsers(users, viewer = currentUser(), options = {}) {
        try {
            const source = Array.isArray(users) ? users.slice() : [];
            const viewerRole = normalizeRole(typeof viewer === 'object' ? viewer?.role : viewer);
            const includePlatform = isPlatformOwner(viewerRole) && platformScope(options) && options.includePlatformOwners === true;
            const filtered = [];
            source.forEach(user => {
                if (!user || typeof user !== 'object') return;
                const role = normalizeRole(user.role || user.userRole || user.accessRole || '');
                if (role === 'platform_owner' && !includePlatform) return;
                if (!includePlatform && role && !isTenantRole(role)) return;
                if (!sameTenant(user, typeof viewer === 'object' ? viewer : {}, options)) return;
                filtered.push(stripSensitiveTenantFields(user, viewer, options));
            });
            return Object.freeze(filtered);
        } catch (err) {
            safeWarn('User visibility filtering failed safely.', { error: err?.message || String(err) });
            return Object.freeze([]);
        }
    }

    function isPlatformCredential(record, key) {
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (normalizedKey.indexOf('po_') === 0 || normalizedKey.indexOf('platform') !== -1 || normalizedKey.indexOf('owner') !== -1) return true;
        if (!record || typeof record !== 'object') return false;
        return isPlatformOwner(record.role || record.userRole || record.type);
    }

    function filterTenantCredentials(credentials) {
        try {
            if (Array.isArray(credentials)) {
                return Object.freeze(credentials
                    .filter(item => !isPlatformCredential(item))
                    .map(item => item && typeof item === 'object' ? freezePlainObject(item) : item));
            }
            const source = safeCloneObject(credentials);
            const output = {};
            Object.keys(source).forEach(key => {
                if (isPlatformCredential(source[key], key)) return;
                output[key] = source[key];
            });
            return freezePlainObject(output);
        } catch (err) {
            safeWarn('Tenant credential filtering failed safely.', { error: err?.message || String(err) });
            return Array.isArray(credentials) ? Object.freeze([]) : Object.freeze({});
        }
    }

    function safeUserVisibility(users, viewer, options) {
        const visibleUsers = filterVisibleUsers(users, viewer, options);
        return freezeGovernanceOutput({
            users: visibleUsers,
            count: visibleUsers.length,
            platformOwnerHidden: !((isPlatformOwner(typeof viewer === 'object' ? viewer?.role : viewer)) && platformScope(options) && options?.includePlatformOwners === true)
        });
    }

    function getGovernanceEntrypoint() {
        return GOVERNANCE_ENTRYPOINT;
    }

    function canAccessTenantDashboard(role = currentRole()) {
        return !isPlatformOwner(role) && isTenantRole(role);
    }

    function authorizePlatformGovernanceAccess(actorInput = currentUser(), action = 'platform_governance_access', metadata = {}) {
        const normalizedActor = actorInput || {};
        const allowed = isPlatformOwner(normalizedActor);
        const result = freezeGovernanceOutput({
            success: true,
            allowed,
            action: String(action || 'platform_governance_access'),
            route: GOVERNANCE_ENTRYPOINT,
            reason: allowed ? 'PLATFORM_OWNER_AUTHORIZED' : 'PLATFORM_OWNER_REQUIRED'
        });
        emitGovernanceTelemetry('PLATFORM_GOVERNANCE_ACCESS_EVALUATED', { action, allowed, actorRole: normalizeRole(normalizedActor.role) });
        auditGovernanceAccess(allowed ? 'PLATFORM_GOVERNANCE_ACCESS_ALLOWED' : 'PLATFORM_GOVERNANCE_ACCESS_DENIED', normalizedActor, metadata);
        return result;
    }

    function toast(message) {
        if (typeof global.toast === 'function') global.toast(message);
        else if (global.console) console.warn(message);
    }

    function getGovernance() {
        if (db()?.getPlatformGovernance) return db().getPlatformGovernance();
        return global.platformGovernanceLocalService?.get ? global.platformGovernanceLocalService.get() : null;
    }

    function featureForSection(sectionId) {
        return SECTION_FEATURE_MAP[sectionId] || '';
    }

    function featureLabel(featureKey) {
        const feature = getGovernance()?.features?.[featureKey];
        return feature?.label || featureKey || 'Feature';
    }

    function canAccessFeature(featureKey, role = currentRole()) {
        if (!featureKey) return true;
        const normalized = normalizeRole(role);
        if (db()?.canAccessFeature) return db().canAccessFeature(featureKey, normalized);
        const governance = getGovernance();
        const feature = governance?.features?.[featureKey];
        if (!feature) return true;
        if (normalized === 'platform_owner') return true;
        if (governance.maintenanceMode || governance.safeMode || governance.emergencyDisabled) return false;
        if (feature.enabled === false || feature.emergencyDisabled) return false;
        return !!feature.roles?.[normalized];
    }

    function canAccessSection(sectionId, role = currentRole()) {
        return canAccessFeature(featureForSection(sectionId), role);
    }

    function guardSection(sectionId, role = currentRole()) {
        const featureKey = featureForSection(sectionId);
        if (!featureKey) return true;
        if (canAccessFeature(featureKey, role)) return true;
        const governance = getGovernance();
        const systemLocked = governance?.maintenanceMode || governance?.safeMode || governance?.emergencyDisabled;
        toast(systemLocked
            ? 'Platform is in controlled mode. This module is temporarily unavailable.'
            : `${featureLabel(featureKey)} is disabled for your role by Platform Control Center.`);
        return false;
    }

    function extractShowId(node) {
        const onclick = node?.getAttribute?.('onclick') || '';
        const match = onclick.match(/show\(['"]([^'"]+)['"]/);
        return match ? match[1] : '';
    }

    function setGovernedVisibility(node, visible) {
        if (!node || node.dataset.governanceStatic === 'true') return;
        if (!visible) {
            if (node.dataset.govDisplay === undefined) node.dataset.govDisplay = node.style.display || '';
            node.dataset.governanceHidden = 'true';
            node.style.display = 'none';
        } else if (node.dataset.governanceHidden === 'true') {
            node.style.display = node.dataset.govDisplay || '';
            delete node.dataset.governanceHidden;
        }
    }

    function renderModeBanner(role = currentRole()) {
        if (!global.document) return;
        const governance = getGovernance();
        const old = global.document.getElementById('platformModeBanner');
        if (old) old.remove();
        if (!governance || role === 'platform_owner') return;
        const activeModes = [];
        if (governance.maintenanceMode) activeModes.push('Maintenance');
        if (governance.safeMode) activeModes.push('Safe Mode');
        if (governance.emergencyDisabled) activeModes.push('Emergency Disable');
        if (!activeModes.length) return;
        const host = global.document.querySelector('.main') || global.document.body;
        const banner = global.document.createElement('div');
        banner.id = 'platformModeBanner';
        banner.style.cssText = 'margin:10px 18px;padding:10px 12px;border:1px solid #fecaca;background:#fee2e2;color:#991b1b;border-radius:10px;font-size:.78rem;font-weight:800';
        banner.textContent = `Platform Control Center: ${activeModes.join(' + ')} active. Some modules are temporarily unavailable.`;
        host.insertBefore(banner, host.firstChild);
    }

    function installHealth() {
        if (global.authService?.getInstallHealth) return global.authService.getInstallHealth();
        if (db()?.getInstallHealth) return db().getInstallHealth();
        return null;
    }

    function applyInstallModeUI() {
        if (!global.document) return;
        const health = installHealth();
        if (!health) return;
        global.document.querySelectorAll('input[type="password"]').forEach(input => {
            input.value = '';
            input.placeholder = input.placeholder || 'Production auth required';
        });
        global.document.querySelectorAll('.hint').forEach(node => {
            if (/demo/i.test(node.textContent || '')) node.textContent = 'Production mode: use verified invite-based authentication.';
        });
        global.document.querySelectorAll('button').forEach(btn => {
            if (/reset demo data/i.test(btn.textContent || '')) btn.style.display = 'none';
        });
        global.document.querySelectorAll('.demo-credentials').forEach(node => {
            node.innerHTML = '<strong>Production Mode</strong><br>Demo credentials are disabled. Complete first-time setup or use verified invite-based authentication.';
        });
    }

    function applyToPage(role = currentRole()) {
        if (!global.document) return;
        const normalizedRole = normalizeRole(role);
        global.document.querySelectorAll('[onclick*="show("]').forEach(node => {
            const sectionId = extractShowId(node);
            if (!sectionId) return;
            setGovernedVisibility(node, canAccessSection(sectionId, normalizedRole));
        });
        global.document.querySelectorAll('.section[id^="sec-"]').forEach(section => {
            const sectionId = section.id.replace(/^sec-/, '');
            setGovernedVisibility(section, canAccessSection(sectionId, normalizedRole));
        });
        global.document.querySelectorAll('.snav-group').forEach(group => {
            let cursor = group.nextElementSibling;
            let hasVisibleItem = false;
            while (cursor && !cursor.classList.contains('snav-group')) {
                if (cursor.classList?.contains('snav') && cursor.style.display !== 'none') hasVisibleItem = true;
                cursor = cursor.nextElementSibling;
            }
            setGovernedVisibility(group, hasVisibleItem);
        });
        renderModeBanner(normalizedRole);
        applyInstallModeUI();
    }

    function wrapShow() {
        if (typeof global.show !== 'function' || global.show.__platformGovernanceWrapped) return;
        const original = global.show;
        const wrapped = function (id, el) {
            if (!guardSection(id)) return false;
            return original.apply(this, arguments);
        };
        wrapped.__platformGovernanceWrapped = true;
        global.show = wrapped;
    }

    function enforceInitialVisibility() {
        wrapShow();
        applyToPage();
        const active = global.document?.querySelector?.('.section.on[id^="sec-"]');
        const activeId = active ? active.id.replace(/^sec-/, '') : '';
        if (activeId && !canAccessSection(activeId)) {
            const fallback = SAFE_DEFAULT_SECTION[currentRole()] || 'dashboard';
            if (typeof global.show === 'function' && global.document.getElementById('sec-' + fallback)) {
                global.show(fallback, global.document.querySelector(`[onclick*="show('${fallback}'"]`));
            }
        }
    }

    function actor() {
        const user = currentUser() || {};
        return {
            role: normalizeRole(user.role),
            id: user.id || user.empId || '',
            name: user.name || user.email || '',
            source: user.source || '',
            roleTrusted: user.roleTrusted === true
        };
    }

    function requirePlatformAccess(action) {
        const currentActor = actor();
        if (!global.rbacEnforcementService?.requireAccess) throw new Error('RBAC enforcement service is unavailable.');
        global.rbacEnforcementService.requireAccess({ resource: 'platform_governance', action, actor: currentActor });
        return currentActor;
    }

    const service = {
        SECTION_FEATURE_MAP,
        TENANT_ROLES,
        PLATFORM_ROLES,
        getGovernance,
        getRoles: (viewer, options) => {
            const resolvedViewer = viewer || currentUser();
            const resolvedOptions = Object.assign({}, options || {});
            if (!resolvedOptions.scope && isPlatformOwner(resolvedViewer) && isPlatformRoute()) {
                resolvedOptions.scope = 'platform_governance';
                resolvedOptions.includePlatformOwner = true;
            }
            return filterVisibleRoles(db()?.getPlatformRoles ? db().getPlatformRoles() : TENANT_ROLES, resolvedViewer, resolvedOptions);
        },
        getTenantRoles: () => Object.freeze(TENANT_ROLES.slice()),
        getPlatformRoles: () => Object.freeze(PLATFORM_ROLES.slice()),
        getFeatures: () => getGovernance()?.features || {},
        featureForSection,
        canAccessFeature,
        canAccessSection,
        guardSection,
        applyToPage,
        refresh: enforceInitialVisibility,
        saveGovernance: (config, reason) => db().savePlatformGovernance(config, requirePlatformAccess('manage'), reason),
        setFeatureFlag: (featureKey, updates) => db().setFeatureFlag(featureKey, updates, requirePlatformAccess('manage')),
        setFeatureRoleAccess: (featureKey, role, allowed) => db().setFeatureRoleAccess(featureKey, role, allowed, requirePlatformAccess('manage')),
        applyPreset: preset => db().applyPlatformPreset(preset, requirePlatformAccess('manage')),
        rollback: snapshotId => db().rollbackPlatformGovernance(snapshotId, requirePlatformAccess('manage')),
        isPlatformOwner,
        isPlatformRoute,
        isTenantRole,
        hidePlatformOwnerRole,
        filterTenantRoles,
        filterVisibleRoles,
        filterVisibleUsers,
        filterTenantCredentials,
        safeRoleVisibility,
        safeUserVisibility,
        stripSensitiveTenantFields,
        canAccessHrSensitiveData,
        canAccessTenantDashboard,
        authorizePlatformGovernanceAccess,
        getGovernanceEntrypoint,
        freezeGovernanceOutput
    };

    const frozenService = Object.freeze(service);
    global.PlatformGovernanceService = frozenService;
    global.platformGovernanceService = frozenService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            const originalTelemetry = global.WorkflowTelemetryService;
            const results = [];
            const check = (name, passed) => results.push(Object.freeze({ name, passed: !!passed }));

            const tenantRoles = filterVisibleRoles(['employee', 'manager', 'platform_owner', 'super_admin'], { role: 'super_admin' });
            check('PLATFORM_OWNER hidden from tenants', tenantRoles.indexOf('platform_owner') === -1 && tenantRoles.indexOf('super_admin') !== -1);
            check('tenant role filtering works', filterTenantRoles(['employee', 'platform_owner', 'hr']).indexOf('platform_owner') === -1);

            const visibleUsers = filterVisibleUsers([
                { id: 'U1', role: 'employee', salary: 50000, leaveBalance: 12 },
                { id: 'U0', role: 'platform_owner', salary: 999999, leaveBalance: 99 }
            ], { role: 'super_admin' });
            check('tenant visibility removes platform owner', visibleUsers.length === 1 && visibleUsers[0].role === 'employee');
            const filteredCredentials = filterTenantCredentials({
                po_identity: 'platform-identity',
                po_password: 'redacted',
                tenant_identity: 'tenant-identity'
            });
            check('credential filtering works', filteredCredentials.po_identity === undefined && filteredCredentials.po_password === undefined && filteredCredentials.tenant_identity === 'tenant-identity');
            check('hidden route isolation works', isPlatformRoute('platform-control.html') && !isPlatformRoute('tenant-login.html') && !isPlatformRoute('ArthHRMS.html'));
            check('SUPER_ADMIN salary visibility removed', visibleUsers[0].salary === undefined);
            check('SUPER_ADMIN leave balance visibility removed', visibleUsers[0].leaveBalance === undefined);
            check('immutable outputs enforced', Object.isFrozen(visibleUsers) && Object.isFrozen(visibleUsers[0]) && Object.isFrozen(tenantRoles));

            const malformed = filterVisibleUsers('bad-payload', { role: 'super_admin' });
            check('malformed payloads handled safely', Array.isArray(malformed) && malformed.length === 0);

            global.WorkflowTelemetryService = {
                emitTelemetry() {
                    throw new Error('self-test telemetry failure');
                }
            };
            const authResult = authorizePlatformGovernanceAccess({ role: 'platform_owner', id: 'TEST' }, 'self_test');
            check('telemetry failures isolated', authResult.allowed === true);
            global.WorkflowTelemetryService = originalTelemetry;

            try {
                global.__ARTHHRMS_PLATFORM_GOVERNANCE_SELF_TEST__ = Object.freeze(results.slice());
            } catch (err) {
                safeWarn('Platform governance self-test result storage failed.', { error: err?.message || String(err) });
            }
        })();
    }

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', () => {
            setTimeout(enforceInitialVisibility, 0);
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
