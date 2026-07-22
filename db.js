// ============================================================
// ARTHHRMS - Complete Database
// Version: 3.0 (Enterprise Ready)
// Company: ArthHRMS (अर्थपूर्ण HR समाधान)
// ============================================================

const DB = {
    _state: null,
    _suppressPersistence: 0,

    _cloneState(value) {
        return JSON.parse(JSON.stringify(value == null ? null : value));
    },

    // ==================== INITIALIZATION ====================
    
    init() {
        if (this._state) return this.get();
        const seed = this.shouldUseCleanInstallSeed() ? this.getCleanInstallData() : this.getSeedData();
        this._state = this._cloneState(seed);
        return this.get();
    },
    
    readRuntimeFlag(name, fallback = false) {
        const normalize = value => {
            if (value === true || value === false) return value;
            if (value === undefined || value === null || value === '') return fallback;
            return String(value).trim().toLowerCase() === 'true';
        };
        try {
            const injected = (typeof globalThis !== 'undefined' && globalThis.ARTHHRMS_CONFIG) || {};
            if (injected.flags && injected.flags[name] !== undefined) return normalize(injected.flags[name]);
            if (injected[name] !== undefined) return normalize(injected[name]);
        } catch (e) {}
        try {
            const env = (typeof process !== 'undefined' && process.env) || {};
            if (env[name] !== undefined) return normalize(env[name]);
        } catch (e) {}
        try {
            const node = document.querySelector(`meta[name="arthhrms:${name.toLowerCase().replace(/_/g, '-')}"]`);
            if (node) return normalize(node.getAttribute('content'));
        } catch (e) {}
        return fallback;
    },

    isDevelopmentMode() {
        return this.readRuntimeFlag('DEVELOPMENT_MODE', true);
    },

    isProductionMode() {
        return this.readRuntimeFlag('PRODUCTION_MODE', false);
    },

    isPilotMode() {
        return !this.isProductionMode() && this.readRuntimeFlag('PILOT_MODE', false);
    },

    getEnvironmentMode() {
        if (this.isProductionMode()) return 'PRODUCTION';
        if (this.isPilotMode()) return 'PILOT';
        return 'DEVELOPMENT';
    },

    isDemoMode() {
        return this.readRuntimeFlag('DEMO_MODE', this.isDevelopmentMode());
    },

    shouldUseCleanInstallSeed() {
        return this.isProductionMode() && !this.isDevelopmentMode();
    },

    getPlatformRoles() {
        return ['employee', 'manager', 'admin', 'hr', 'super_admin', 'platform_owner'];
    },

    getDefaultFeatureFlags() {
        const roles = (allowed = {}) => ({
            employee: false,
            manager: false,
            admin: false,
            hr: false,
            super_admin: false,
            platform_owner: true,
            ...allowed
        });
        const feature = (key, label, allowed, options = {}) => ({
            key,
            label,
            enabled: options.enabled !== false,
            experimental: !!options.experimental,
            emergencyDisabled: false,
            roles: roles(allowed)
        });

        return {
            employees: feature('employees', 'Employee Master', { hr: true, super_admin: true }),
            attendance: feature('attendance', 'Attendance', { employee: true, manager: true, admin: true, hr: true, super_admin: true }),
            attendanceRegularization: feature('attendanceRegularization', 'Attendance Regularization', { admin: true, hr: true, super_admin: true }),
            leave: feature('leave', 'Leave Management', { employee: true, manager: true, hr: true, super_admin: true }),
            payroll: feature('payroll', 'Payroll', { employee: true, hr: true, super_admin: true }),
            expenseClaims: feature('expenseClaims', 'Expense Claims', { employee: true, manager: true, hr: true, super_admin: true }),
            performance: feature('performance', 'Performance Reviews', { employee: true, manager: true, hr: true, super_admin: true }),
            appraisal: feature('appraisal', 'Appraisals', { manager: true, hr: true, super_admin: true }),
            recruitment: feature('recruitment', 'Recruitment', { hr: true, super_admin: true }),
            strategicDeliverables: feature('strategicDeliverables', 'Strategic Deliverables', { employee: true, manager: true, hr: true, super_admin: true }),
            lifecycle: feature('lifecycle', 'Onboarding & Exit', { employee: true, admin: true, hr: true, super_admin: true }),
            training: feature('training', 'Training', { employee: true, manager: true, admin: true, hr: true, super_admin: true }),
            documents: feature('documents', 'Documents', { employee: true, admin: true, hr: true, super_admin: true }),
            documentVerification: feature('documentVerification', 'Document Verification', { admin: true, hr: true, super_admin: true }),
            helpdesk: feature('helpdesk', 'Helpdesk', { employee: true, admin: true, hr: true, super_admin: true }),
            imports: feature('imports', 'Data Import Center', { admin: true, hr: true, super_admin: true }),
            notifications: feature('notifications', 'Notifications', { employee: true, manager: true, admin: true, hr: true, super_admin: true }),
            reports: feature('reports', 'Reports', { admin: true, hr: true, super_admin: true }),
            whatsapp: feature('whatsapp', 'WhatsApp Logs', { hr: true, super_admin: true }),
            userManagement: feature('userManagement', 'User Management', { super_admin: true }),
            teamManagement: feature('teamManagement', 'Team Management', { manager: true, super_admin: true }),
            tasks: feature('tasks', 'Task Assignment', { manager: true }),
            companySettings: feature('companySettings', 'Company Settings', { super_admin: true }),
            rolePermissions: feature('rolePermissions', 'Role Permissions', { super_admin: true }),
            auditLogs: feature('auditLogs', 'Audit Logs', { super_admin: true }),
            broadcast: feature('broadcast', 'Broadcast Center', { super_admin: true }),
            systemSettings: feature('systemSettings', 'System Settings', { super_admin: true }),
            aiInsights: feature('aiInsights', 'AI Insights', { hr: true, super_admin: true }, { enabled: false, experimental: true })
        };
    },

    getDefaultPlatformGovernance() {
        return {
            version: 1,
            preset: 'STANDARD_COMPANY',
            maintenanceMode: false,
            safeMode: false,
            emergencyDisabled: false,
            branding: {
                platformName: 'ARTHHRMS',
                companyName: 'ArthHRMS',
                logoUrl: '',
                identityLabel: 'Platform Control Center',
                themeAccent: '#1a56db'
            },
            features: this.getDefaultFeatureFlags(),
            rollbackSnapshots: [],
            updatedAt: new Date().toISOString(),
            updatedBy: 'system'
        };
    },

    _mergePlatformGovernance(current = {}) {
        const defaults = this.getDefaultPlatformGovernance();
        const merged = {
            ...defaults,
            ...current,
            branding: { ...defaults.branding, ...(current.branding || {}) },
            features: { ...defaults.features },
            rollbackSnapshots: Array.isArray(current.rollbackSnapshots) ? current.rollbackSnapshots.slice(0, 5) : []
        };
        Object.entries(defaults.features).forEach(([key, def]) => {
            const existing = (current.features || {})[key] || {};
            merged.features[key] = {
                ...def,
                ...existing,
                roles: { ...def.roles, ...(existing.roles || {}) }
            };
        });
        Object.entries(current.features || {}).forEach(([key, existing]) => {
            if (!merged.features[key]) {
                merged.features[key] = {
                    key,
                    label: existing.label || key,
                    enabled: existing.enabled !== false,
                    experimental: !!existing.experimental,
                    emergencyDisabled: !!existing.emergencyDisabled,
                    roles: { platform_owner: true, ...(existing.roles || {}) }
                };
            }
        });
        return merged;
    },

    getDefaultInstallState(isCleanInstall = false) {
        return {
            setupCompleted: !isCleanInstall,
            status: isCleanInstall ? 'Pending Setup' : 'Ready for Onboarding',
            productionMode: this.isProductionMode(),
            pilotMode: this.isPilotMode(),
            developmentMode: this.isDevelopmentMode(),
            demoMode: this.isDemoMode(),
            environmentMode: this.getEnvironmentMode(),
            initializedAt: new Date().toISOString(),
            completedAt: isCleanInstall ? '' : new Date().toISOString(),
            companyEmail: '',
            setupVersion: 1
        };
    },

    _mergeInstallState(current = {}) {
        return {
            ...this.getDefaultInstallState(false),
            ...current,
            productionMode: this.isProductionMode(),
            pilotMode: this.isPilotMode(),
            developmentMode: this.isDevelopmentMode(),
            demoMode: this.isDemoMode(),
            environmentMode: this.getEnvironmentMode()
        };
    },

    _ensureInstallState(data) {
        const before = JSON.stringify(data.installState || {});
        if (!data.installState || Array.isArray(data.installState)) {
            const hasPlatformOwner = (data.users || []).some(u => String(u.role || '') === 'platform_owner');
            data.installState = this.getDefaultInstallState(!hasPlatformOwner && this.shouldUseCleanInstallSeed());
        } else {
            data.installState = this._mergeInstallState(data.installState);
        }
        return JSON.stringify(data.installState || {}) !== before;
    },

    _ensurePlatformGovernance(data) {
        let changed = false;
        if (!data.platformGovernance || Array.isArray(data.platformGovernance)) {
            data.platformGovernance = this.getDefaultPlatformGovernance();
            changed = true;
        } else {
            const before = JSON.stringify(data.platformGovernance);
            data.platformGovernance = this._mergePlatformGovernance(data.platformGovernance);
            changed = JSON.stringify(data.platformGovernance) !== before || changed;
        }

        return changed;
    },

    stripLocalAuthCredentials(data) {
        let changed = false;
        const removePassword = record => {
            if (!record || !Object.prototype.hasOwnProperty.call(record, 'password')) return;
            delete record.password;
            changed = true;
        };
        (data.users || []).forEach(user => {
            removePassword(user);
            if (!user.authUserId && user.active) {
                user.active = false;
                user.authStatus = 'Invite Required';
                user.inviteStatus = user.inviteStatus === 'Legacy Local' ? 'Not Invited' : (user.inviteStatus || 'Not Invited');
                user.activationStatus = 'Not Activated';
                changed = true;
            }
        });
        (data.employees || []).forEach(removePassword);
        if (data.hr && Object.prototype.hasOwnProperty.call(data.hr, 'password')) {
            delete data.hr.password;
            changed = true;
        }
        return changed;
    },

    getMigrationModuleDefinitions() {
        return {
            employees: {
                order: 1,
                moduleKey: 'employees',
                label: 'Employee Master',
                sqlFile: 'context/sql/employees.sql',
                tables: ['employees'],
                runtimeFlag: 'USE_SUPABASE_EMPLOYEES',
                dependencies: []
            },
            attendance: {
                order: 2,
                moduleKey: 'attendance',
                label: 'Attendance',
                sqlFile: 'context/sql/attendance.sql',
                tables: ['attendance'],
                runtimeFlag: 'USE_SUPABASE_ATTENDANCE',
                dependencies: ['employees']
            },
            leaveRequests: {
                order: 3,
                moduleKey: 'leaveRequests',
                label: 'Leave Requests',
                sqlFile: 'context/sql/leaveRequests.sql',
                tables: ['leave_requests'],
                runtimeFlag: 'USE_SUPABASE_LEAVE',
                dependencies: ['employees', 'attendance']
            },
            expenseClaims: {
                order: 4,
                moduleKey: 'expenseClaims',
                label: 'Expense Claims',
                sqlFile: 'context/sql/expenseClaims.sql',
                tables: ['expense_claims'],
                runtimeFlag: 'USE_SUPABASE_EXPENSES',
                dependencies: ['employees']
            },
            payroll: {
                order: 5,
                moduleKey: 'payroll',
                label: 'Payroll',
                sqlFile: 'context/sql/payroll.sql',
                tables: ['salary_structures', 'payroll_cycles', 'payroll_records', 'payslips'],
                runtimeFlag: 'USE_SUPABASE_PAYROLL',
                dependencies: ['employees', 'attendance', 'leaveRequests', 'expenseClaims']
            },
            notifications_workflow: {
                order: 6,
                moduleKey: 'notifications_workflow',
                label: 'Notifications + Workflow',
                sqlFile: 'context/sql/notifications_workflow.sql',
                tables: ['notifications', 'pending_actions', 'workflow_events', 'audit_logs'],
                runtimeFlag: '',
                dependencies: ['employees']
            },
            import_batches: {
                order: 7,
                moduleKey: 'import_batches',
                label: 'Import Batches',
                sqlFile: 'context/sql/import_batches.sql',
                tables: ['import_batches'],
                runtimeFlag: 'USE_SUPABASE_IMPORTS',
                dependencies: ['employees']
            },
            staging_tables: {
                order: 8,
                moduleKey: 'staging_tables',
                label: 'Import Staging Tables',
                sqlFile: 'context/sql/staging_*.sql',
                tables: ['staging_employees', 'staging_attendance', 'staging_payroll'],
                runtimeFlag: 'USE_SUPABASE_IMPORTS',
                dependencies: ['import_batches']
            },
            auth_invitations: {
                order: 9,
                moduleKey: 'auth_invitations',
                label: 'Auth Invitations',
                sqlFile: 'context/sql/auth_invitations.sql',
                tables: ['auth_invitations'],
                runtimeFlag: 'USE_SUPABASE_INVITES',
                dependencies: ['employees']
            },
            platform_governance: {
                order: 10,
                moduleKey: 'platform_governance',
                label: 'Platform Governance',
                sqlFile: 'context/sql/platform_governance.sql',
                tables: ['platform_governance', 'platform_feature_flags', 'platform_feature_role_access'],
                runtimeFlag: '',
                dependencies: ['employees']
            },
            storage_policies: {
                order: 11,
                moduleKey: 'storage_policies',
                label: 'Storage Policies',
                sqlFile: 'context/sql/storage_policies.sql',
                tables: [],
                runtimeFlag: 'USE_SUPABASE_STORAGE',
                dependencies: ['employees', 'expenseClaims', 'payroll']
            },
            rls_security_hardening: {
                order: 12,
                moduleKey: 'rls_security_hardening',
                label: 'RLS Security Hardening',
                sqlFile: 'context/sql/rls_security_hardening.sql',
                tables: [],
                runtimeFlag: '',
                dependencies: ['employees', 'attendance', 'leaveRequests', 'expenseClaims', 'payroll']
            },
            security_policy_tests: {
                order: 13,
                moduleKey: 'security_policy_tests',
                label: 'Security Policy Tests',
                sqlFile: 'context/sql/security_policy_tests.sql',
                tables: [],
                runtimeFlag: '',
                dependencies: ['rls_security_hardening']
            }
        };
    },

    getDefaultMigrationState() {
        const modules = {};
        Object.entries(this.getMigrationModuleDefinitions()).forEach(([key, def]) => {
            modules[key] = {
                ...def,
                mode: 'LOCAL',
                status: 'Not Verified',
                health: 'UNKNOWN',
                lastCheckedAt: '',
                verifiedAt: '',
                activatedAt: '',
                activatedBy: '',
                lastError: '',
                rollbackAvailable: true,
                notes: ''
            };
        });
        return {
            version: 1,
            strategy: 'CONTROLLED_MODULE_ACTIVATION',
            modules,
            healthSummary: {},
            updatedAt: new Date().toISOString(),
            updatedBy: 'system'
        };
    },

    _mergeMigrationState(current = {}) {
        const defaults = this.getDefaultMigrationState();
        const currentModules = current.modules || current;
        const merged = {
            ...defaults,
            ...current,
            modules: { ...defaults.modules },
            healthSummary: { ...(current.healthSummary || {}) }
        };
        Object.entries(defaults.modules).forEach(([key, def]) => {
            const existing = currentModules[key] || {};
            merged.modules[key] = {
                ...def,
                ...existing,
                ...this.getMigrationModuleDefinitions()[key],
                mode: ['LOCAL', 'HYBRID', 'LIVE'].includes(String(existing.mode || '').toUpperCase()) ? String(existing.mode).toUpperCase() : 'LOCAL',
                health: String(existing.health || 'UNKNOWN').toUpperCase(),
                rollbackAvailable: existing.rollbackAvailable !== false
            };
        });
        return merged;
    },

    _ensureMigrationState(data) {
        const before = JSON.stringify(data.migrationState || {});
        if (!data.migrationState || Array.isArray(data.migrationState)) {
            data.migrationState = this.getDefaultMigrationState();
        } else {
            data.migrationState = this._mergeMigrationState(data.migrationState);
        }
        if (!Array.isArray(data.migrationLogs)) data.migrationLogs = [];
        return JSON.stringify(data.migrationState || {}) !== before;
    },

    setRuntimeFlag(name, value) {
        try {
            const config = (typeof globalThis !== 'undefined' && globalThis.ARTHHRMS_CONFIG) || {};
            config.flags = { ...(config.flags || {}), [name]: !!value };
            if (typeof globalThis !== 'undefined') globalThis.ARTHHRMS_CONFIG = config;
            return config;
        } catch (e) {
            return null;
        }
    },

    getMigrationState() {
        const d = this.get();
        const merged = this._mergeMigrationState(d.migrationState || {});
        if (JSON.stringify(d.migrationState || {}) !== JSON.stringify(merged)) {
            d.migrationState = merged;
            if (!Array.isArray(d.migrationLogs)) d.migrationLogs = [];
            this.save(d);
        }
        return merged;
    },

    getMigrationModules() {
        return Object.values(this.getMigrationState().modules || {}).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    },

    _migrationActor(actorInput = {}) {
        if (typeof actorInput === 'string') return { role: '', id: '', name: actorInput, source: '', roleTrusted: false };
        return {
            role: actorInput.role || actorInput.userRole || '',
            id: actorInput.id || actorInput.empId || actorInput.email || '',
            name: actorInput.name || actorInput.email || actorInput.id || '',
            source: actorInput.source || '',
            roleTrusted: actorInput.roleTrusted === true
        };
    },

    logMigrationEvent(event = {}) {
        const d = this.get();
        if (!d.migrationLogs) d.migrationLogs = [];
        const logId = event.logId || event.id || this.generateRecordId('migrationLog', d);
        const actor = this._migrationActor(event.actor || {});
        const row = {
            id: logId,
            logId,
            loggedAt: event.loggedAt || new Date().toISOString(),
            moduleKey: event.moduleKey || event.module || 'general',
            eventType: event.eventType || event.type || 'MIGRATION_EVENT',
            status: event.status || 'Info',
            message: event.message || '',
            source: event.source || 'migration-control',
            actorRole: actor.role,
            actorId: actor.id,
            metadata: event.metadata || {}
        };
        d.migrationLogs.unshift(row);
        d.migrationLogs = d.migrationLogs.slice(0, 300);
        this._appendAudit(
            d,
            actor.role,
            String(row.eventType).toLowerCase().replace(/_/g, ' '),
            row.message || `${row.moduleKey} migration event`,
            'Supabase Migration',
            row.moduleKey,
            actor.id
        );
        this.save(d);
        return row;
    },

    getMigrationLogs(moduleKey = '') {
        let rows = this.get().migrationLogs || [];
        if (moduleKey) rows = rows.filter(row => row.moduleKey === moduleKey);
        return rows.sort((a, b) => (b.loggedAt || '').localeCompare(a.loggedAt || ''));
    },

    setModuleMigrationMode(moduleKey, mode, actorInput = {}, note = '') {
        const nextMode = String(mode || '').toUpperCase();
        if (!['LOCAL', 'HYBRID', 'LIVE'].includes(nextMode)) return { ok: false, message: 'Migration mode must be LOCAL, HYBRID, or LIVE' };
        const d = this.get();
        d.migrationState = this._mergeMigrationState(d.migrationState || {});
        const module = d.migrationState.modules[moduleKey];
        if (!module) return { ok: false, message: 'Unknown migration module: ' + moduleKey };
        const actor = this._migrationActor(actorInput);
        const previousMode = module.mode || 'LOCAL';
        module.mode = nextMode;
        module.status = nextMode === 'LOCAL' ? 'Fallback Local' : (nextMode === 'HYBRID' ? 'Hybrid Active' : 'Live Active');
        module.activatedAt = new Date().toISOString();
        module.activatedBy = actor.name;
        module.notes = note || module.notes || '';
        module.rollbackAvailable = true;
        d.migrationState.updatedAt = module.activatedAt;
        d.migrationState.updatedBy = actor.name;
        if (module.runtimeFlag) this.setRuntimeFlag(module.runtimeFlag, nextMode !== 'LOCAL');
        this.save(d);
        return {
            ok: true,
            module,
            log: this.logMigrationEvent({
                moduleKey,
                eventType: 'MIGRATION_MODE_CHANGED',
                status: nextMode,
                message: `${module.label} migration mode changed from ${previousMode} to ${nextMode}${note ? ': ' + note : ''}`,
                actor,
                metadata: { previousMode, nextMode, runtimeFlag: module.runtimeFlag || '' }
            })
        };
    },

    recordMigrationHealth(moduleKey, result = {}, actorInput = {}) {
        const d = this.get();
        d.migrationState = this._mergeMigrationState(d.migrationState || {});
        const module = d.migrationState.modules[moduleKey];
        if (!module) return { ok: false, message: 'Unknown migration module: ' + moduleKey };
        const actor = this._migrationActor(actorInput);
        const healthText = String(result.health || (result.ok === true ? 'HEALTHY' : 'FAILED')).toUpperCase();
        const healthy = healthText === 'HEALTHY';
        const failed = ['FAILED', 'MISSING', 'BLOCKED'].includes(healthText);
        module.health = healthText;
        module.status = result.status || (healthy ? 'Verified' : (failed ? 'Verification Failed' : 'Review Required'));
        module.lastCheckedAt = result.checkedAt || new Date().toISOString();
        module.verifiedAt = healthy ? module.lastCheckedAt : module.verifiedAt || '';
        module.lastError = healthy ? '' : (result.reason || result.error || result.message || 'Verification failed');
        module.tableHealth = result.tableHealth || module.tableHealth || [];
        module.rlsStatus = result.rlsStatus || module.rlsStatus || 'Not Tested';
        d.migrationState.healthSummary = this.getMigrationHealthSummary(d.migrationState);
        d.migrationState.updatedAt = module.lastCheckedAt;
        d.migrationState.updatedBy = actor.name;
        this.save(d);
        return {
            ok: healthy,
            module,
            log: this.logMigrationEvent({
                moduleKey,
                eventType: healthy ? 'MIGRATION_HEALTH_VERIFIED' : (failed ? 'MIGRATION_HEALTH_FAILED' : 'MIGRATION_HEALTH_REVIEW'),
                status: module.health,
                message: `${module.label} health check ${healthy ? 'passed' : 'failed'}${module.lastError ? ': ' + module.lastError : ''}`,
                actor,
                metadata: result
            })
        };
    },

    recordMigrationFallback(moduleKey, reason = '', actorInput = {}) {
        const result = this.setModuleMigrationMode(moduleKey, 'LOCAL', actorInput, reason || 'Fallback activated');
        this.logMigrationEvent({
            moduleKey,
            eventType: 'MIGRATION_FALLBACK_ACTIVATED',
            status: 'LOCAL',
            message: `${moduleKey} fallback activated${reason ? ': ' + reason : ''}`,
            actor: actorInput,
            metadata: { reason }
        });
        return result;
    },

    getMigrationHealthSummary(stateInput = null) {
        const state = stateInput || this.getMigrationState();
        const modules = Object.values(state.modules || {});
        const count = predicate => modules.filter(predicate).length;
        return {
            totalModules: modules.length,
            local: count(m => m.mode === 'LOCAL'),
            hybrid: count(m => m.mode === 'HYBRID'),
            live: count(m => m.mode === 'LIVE'),
            healthy: count(m => m.health === 'HEALTHY'),
            failed: count(m => ['FAILED', 'MISSING', 'BLOCKED'].includes(m.health)),
            unknown: count(m => !m.health || m.health === 'UNKNOWN'),
            lastUpdatedAt: state.updatedAt || ''
        };
    },

    getImportReadiness(importType = '', rowCount = 0) {
        const type = String(importType || '').trim();
        const map = { employees: 'employees', attendance: 'attendance', payroll: 'payroll', leave: 'leaveRequests' };
        const moduleKey = map[type] || type;
        const state = this.getMigrationState();
        const module = state.modules[moduleKey];
        const totalRows = Number(rowCount || 0);
        const production = this.isProductionMode();
        const largeImportLimit = production ? 100 : 1000;
        const warnings = [];
        if (!module) return { ok: true, warnings: ['No migration readiness rule exists for this import type'], moduleKey, totalRows };
        if (module.health !== 'HEALTHY') warnings.push(`${module.label} Supabase table verification is not healthy`);
        if (!['HYBRID', 'LIVE'].includes(module.mode)) warnings.push(`${module.label} is still in LOCAL mode`);
        if (production && totalRows > largeImportLimit && warnings.length) {
            return {
                ok: false,
                blocked: true,
                reason: `Large production ${type} import is locked until ${module.label} is verified and set to HYBRID or LIVE mode`,
                moduleKey,
                totalRows,
                limit: largeImportLimit,
                warnings
            };
        }
        return { ok: true, blocked: false, moduleKey, totalRows, limit: largeImportLimit, warnings };
    },

    generateMigrationTestDataset(options = {}) {
        if (this.isProductionMode() || !this.isDevelopmentMode()) {
            const message = 'Test dataset generation is available only in development mode';
            this.logMigrationEvent({ moduleKey: 'test_data', eventType: 'TEST_DATA_BLOCKED', status: 'Blocked', message, actor: options.actor || {} });
            return { blocked: true, message };
        }
        const d = this.get();
        const today = this.today();
        const month = new Date(today).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        const ids = ['ARTH-EMP-2026-9001', 'ARTH-EMP-2026-9002', 'ARTH-EMP-2026-9003'];
        const employees = [
            { id: ids[0], empId: ids[0], name: 'Test Manager', fullName: 'Test Manager', dept: 'Operations', department: 'Operations', desig: 'Operations Manager', designation: 'Operations Manager', managerId: null, salary: 120000, doj: today, branch: 'Test Branch', shiftId: 'SH002', email: 'test.manager@example.com', mobile: '9000000001', employmentStatus: 'Active' },
            { id: ids[1], empId: ids[1], name: 'Test Employee One', fullName: 'Test Employee One', dept: 'Operations', department: 'Operations', desig: 'Coordinator', designation: 'Coordinator', managerId: ids[0], salary: 55000, doj: today, branch: 'Test Branch', shiftId: 'SH002', email: 'test.employee.one@example.com', mobile: '9000000002', employmentStatus: 'Active' },
            { id: ids[2], empId: ids[2], name: 'Test Employee Two', fullName: 'Test Employee Two', dept: 'Finance', department: 'Finance', desig: 'Analyst', designation: 'Analyst', managerId: ids[0], salary: 68000, doj: today, branch: 'Test Branch', shiftId: 'SH002', email: 'test.employee.two@example.com', mobile: '9000000003', employmentStatus: 'Active' }
        ];
        return {
            generatedAt: new Date().toISOString(),
            mode: 'development-only',
            employees,
            attendance: ids.map((empId, idx) => ({ empId, date: today, checkIn: idx === 0 ? '09:00' : '09:12', checkOut: '18:00', status: idx === 1 ? 'Late' : 'Present', shiftId: 'SH002' })),
            leaveRequests: [{ leaveId: 'LVTEST9001', empId: ids[1], type: 'Casual Leave', from: today, to: today, reason: 'Test migration leave', status: 'Pending', managerStatus: 'Pending', hrStatus: 'Pending', finalStatus: 'Pending' }],
            expenseClaims: [{ expenseId: 'ECTEST9001', empId: ids[1], category: 'Travel', expenseDate: today, amount: 1250, currency: 'INR', description: 'Test migration expense', status: 'Pending Manager Approval' }],
            payroll: ids.map(empId => ({ payrollId: 'PAYTEST' + empId.slice(-1), empId, payrollMonth: month, basicSalary: 40000, allowances: 10000, deductions: 2500, leaveDeductions: 0, expenseReimbursements: 0, overtimeAmount: 0, bonusAmount: 0, netSalary: 47500, payrollStatus: 'Pending' })),
            note: 'Generated data is not inserted automatically. Use only in development/test environments.'
        };
    },

    getDefaultDeploymentState() {
        return {
            version: 1,
            environmentMode: this.getEnvironmentMode(),
            pilotMode: this.isPilotMode(),
            rolloutStage: this.isPilotMode() ? 'Pilot Validation' : (this.isProductionMode() ? 'Production Controlled' : 'Development'),
            pilotLimits: {
                maxEmployees: 50,
                maxImportRows: 50,
                maxPayrollEmployees: 10,
                maxBulkActionRows: 25
            },
            productionConfirmations: {
                payrollGeneration: true,
                importCommit: true,
                rolePermissionChange: true,
                environmentChange: true
            },
            lastValidationAt: '',
            lastValidationScore: 0,
            lastValidationStatus: 'Not Run',
            updatedAt: new Date().toISOString(),
            updatedBy: 'system'
        };
    },

    _mergeDeploymentState(current = {}) {
        const defaults = this.getDefaultDeploymentState();
        return {
            ...defaults,
            ...current,
            environmentMode: this.getEnvironmentMode(),
            pilotMode: this.isPilotMode(),
            pilotLimits: { ...defaults.pilotLimits, ...(current.pilotLimits || {}) },
            productionConfirmations: { ...defaults.productionConfirmations, ...(current.productionConfirmations || {}) }
        };
    },

    _ensureDeploymentState(data) {
        const before = JSON.stringify(data.deploymentState || {});
        if (!data.deploymentState || Array.isArray(data.deploymentState)) {
            data.deploymentState = this.getDefaultDeploymentState();
        } else {
            data.deploymentState = this._mergeDeploymentState(data.deploymentState);
        }
        if (!Array.isArray(data.deploymentLogs)) data.deploymentLogs = [];
        if (!Array.isArray(data.deploymentCheckpoints)) data.deploymentCheckpoints = [];
        if (!Array.isArray(data.qaValidationRuns)) data.qaValidationRuns = [];
        return JSON.stringify(data.deploymentState || {}) !== before;
    },

    getEnvironmentState() {
        const d = this.get();
        if (this._ensureDeploymentState(d) || this._ensureInstallState(d)) this.save(d);
        return {
            mode: this.getEnvironmentMode(),
            isDevelopment: this.getEnvironmentMode() === 'DEVELOPMENT',
            isPilot: this.getEnvironmentMode() === 'PILOT',
            isProduction: this.getEnvironmentMode() === 'PRODUCTION',
            productionMode: this.isProductionMode(),
            pilotMode: this.isPilotMode(),
            developmentMode: this.isDevelopmentMode(),
            demoMode: this.isDemoMode(),
            deploymentState: d.deploymentState,
            installState: d.installState
        };
    },

    setEnvironmentMode(mode = 'DEVELOPMENT', actorInput = {}, reason = '') {
        const normalized = String(mode || 'DEVELOPMENT').trim().toUpperCase();
        if (!['DEVELOPMENT', 'PILOT', 'PRODUCTION'].includes(normalized)) return { ok: false, error: 'Environment mode must be DEVELOPMENT, PILOT, or PRODUCTION' };
        const actor = this._migrationActor(actorInput);
        const safety = this.checkDeploymentAction('environment_change', { targetMode: normalized }, actor);
        if (!safety.allowed) return { ok: false, blocked: true, reason: safety.warning, safety };
        const previous = this.getEnvironmentMode();
        const flags = {
            PRODUCTION_MODE: normalized === 'PRODUCTION',
            PILOT_MODE: normalized === 'PILOT',
            DEVELOPMENT_MODE: normalized === 'DEVELOPMENT',
            DEMO_MODE: normalized === 'DEVELOPMENT'
        };
        Object.entries(flags).forEach(([key, value]) => this.setRuntimeFlag(key, value));
        const d = this.get();
        this._ensureDeploymentState(d);
        this._ensureInstallState(d);
        d.deploymentState = {
            ...this._mergeDeploymentState(d.deploymentState),
            environmentMode: normalized,
            pilotMode: normalized === 'PILOT',
            rolloutStage: normalized === 'PILOT' ? 'Pilot Validation' : (normalized === 'PRODUCTION' ? 'Production Controlled' : 'Development'),
            updatedAt: new Date().toISOString(),
            updatedBy: actor.name
        };
        d.installState = {
            ...this._mergeInstallState(d.installState),
            environmentMode: normalized,
            productionMode: normalized === 'PRODUCTION',
            pilotMode: normalized === 'PILOT',
            developmentMode: normalized === 'DEVELOPMENT',
            demoMode: normalized === 'DEVELOPMENT'
        };
        this._appendAudit(d, actor.role, 'environment mode changed', `Environment changed from ${previous} to ${normalized}${reason ? ': ' + reason : ''}`, 'Deployment Safety', normalized, actor.id);
        this.save(d);
        return {
            ok: true,
            environment: this.getEnvironmentState(),
            log: this.logDeploymentEvent({
                eventType: 'ENVIRONMENT_MODE_CHANGED',
                status: normalized,
                message: `Environment changed from ${previous} to ${normalized}`,
                actor,
                metadata: { previous, next: normalized, reason }
            })
        };
    },

    getDeploymentSafetyLimits() {
        const d = this.get();
        const state = this._mergeDeploymentState(d.deploymentState || {});
        return state.pilotLimits || this.getDefaultDeploymentState().pilotLimits;
    },

    checkDeploymentAction(actionType = '', payload = {}, actorInput = {}) {
        const mode = this.getEnvironmentMode();
        const action = String(actionType || '').trim();
        const limits = this.getDeploymentSafetyLimits();
        const count = Number(payload.rowCount ?? payload.employeeCount ?? payload.count ?? payload.totalRows ?? 0);
        const critical = ['payroll_generation', 'import_commit', 'role_permission_change', 'feature_change', 'environment_change', 'bulk_delete', 'migration_mode_change'].includes(action);
        const result = {
            allowed: true,
            requiresConfirmation: false,
            level: 'LOW',
            warning: '',
            mode,
            actionType: action,
            limits,
            count
        };
        if (mode === 'PILOT') {
            result.level = 'MEDIUM';
            if ((action === 'import_stage' || action === 'import_commit') && count > limits.maxImportRows) {
                return { ...result, allowed: false, level: 'HIGH', warning: `Pilot mode blocks imports above ${limits.maxImportRows} rows.` };
            }
            if (action === 'payroll_generation' && count > limits.maxPayrollEmployees) {
                return { ...result, allowed: false, level: 'HIGH', warning: `Pilot mode blocks payroll generation above ${limits.maxPayrollEmployees} employees.` };
            }
            if (action === 'bulk_delete' && count > limits.maxBulkActionRows) {
                return { ...result, allowed: false, level: 'CRITICAL', warning: `Pilot mode blocks bulk destructive actions above ${limits.maxBulkActionRows} rows.` };
            }
            if (critical) {
                result.requiresConfirmation = true;
                result.warning = 'Pilot mode is active. Confirm this controlled rollout action before continuing.';
            }
        }
        if (mode === 'PRODUCTION') {
            result.level = critical ? 'CRITICAL' : 'MEDIUM';
            if (action === 'bulk_delete') {
                return { ...result, allowed: false, warning: 'Production mode blocks bulk destructive actions from the frontend.' };
            }
            if (critical) {
                result.requiresConfirmation = true;
                result.warning = 'Production mode is active. Confirm this critical action and ensure a rollback checkpoint exists.';
            }
        }
        return result;
    },

    logDeploymentEvent(event = {}) {
        const d = this.get();
        if (!d.deploymentLogs) d.deploymentLogs = [];
        const actor = this._migrationActor(event.actor || {});
        const deploymentLogId = event.deploymentLogId || event.id || this.generateDeploymentLogId(d);
        const row = {
            id: deploymentLogId,
            deploymentLogId,
            loggedAt: event.loggedAt || new Date().toISOString(),
            environmentMode: event.environmentMode || this.getEnvironmentMode(),
            eventType: event.eventType || event.type || 'DEPLOYMENT_EVENT',
            status: event.status || 'Info',
            message: event.message || '',
            actorRole: actor.role,
            actorId: actor.id,
            metadata: event.metadata || {}
        };
        d.deploymentLogs.unshift(row);
        d.deploymentLogs = d.deploymentLogs.slice(0, 300);
        this._appendAudit(d, actor.role, String(row.eventType).toLowerCase().replace(/_/g, ' '), row.message || 'Deployment event recorded', 'Deployment Safety', row.deploymentLogId, actor.id);
        this.save(d);
        return row;
    },

    getDeploymentLogs() {
        return (this.get().deploymentLogs || []).sort((a, b) => (b.loggedAt || '').localeCompare(a.loggedAt || ''));
    },

    createDeploymentCheckpoint(label = 'Manual Checkpoint', actorInput = {}, metadata = {}) {
        const d = this.get();
        if (!d.deploymentCheckpoints) d.deploymentCheckpoints = [];
        const actor = this._migrationActor(actorInput);
        const checkpointId = this.generateDeploymentCheckpointId(d);
        const snapshot = {
            installState: this._mergeInstallState(d.installState || {}),
            deploymentState: this._mergeDeploymentState(d.deploymentState || {}),
            platformGovernance: this._mergePlatformGovernance(d.platformGovernance || {}),
            migrationState: this._mergeMigrationState(d.migrationState || {}),
            companySettings: d.companySettings || {},
            counts: {
                users: (d.users || []).length,
                employees: (d.employees || []).length,
                attendance: (d.attendance || []).length,
                leaveRequests: (d.leaveRequests || []).length,
                expenseClaims: (d.expenseClaims || []).length,
                payroll: (d.payroll || []).length,
                importBatches: (d.importBatches || []).length
            }
        };
        const row = {
            id: checkpointId,
            checkpointId,
            label,
            createdAt: new Date().toISOString(),
            createdBy: actor.name,
            environmentMode: this.getEnvironmentMode(),
            rollbackReady: true,
            snapshot,
            metadata
        };
        d.deploymentCheckpoints.unshift(row);
        d.deploymentCheckpoints = d.deploymentCheckpoints.slice(0, 10);
        this._appendAudit(d, actor.role, 'deployment checkpoint created', `Deployment checkpoint created: ${label}`, 'Deployment Safety', checkpointId, actor.id);
        this.save(d);
        this.logDeploymentEvent({ eventType: 'DEPLOYMENT_CHECKPOINT_CREATED', status: 'Ready', message: `Deployment checkpoint created: ${label}`, actor, metadata: { checkpointId } });
        return row;
    },

    getDeploymentCheckpoints() {
        return (this.get().deploymentCheckpoints || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },

    saveQaValidationRun(run = {}, actorInput = {}) {
        const d = this.get();
        if (!d.qaValidationRuns) d.qaValidationRuns = [];
        const actor = this._migrationActor(actorInput);
        const qaRunId = run.qaRunId || run.id || this.generateQaValidationRunId(d);
        const row = {
            id: qaRunId,
            qaRunId,
            runAt: run.runAt || new Date().toISOString(),
            environmentMode: run.environmentMode || this.getEnvironmentMode(),
            status: run.status || 'Completed',
            score: Number(run.score || 0),
            failedCount: Number(run.failedCount || 0),
            warningCount: Number(run.warningCount || 0),
            moduleResults: run.moduleResults || [],
            workflowResults: run.workflowResults || [],
            rlsStatus: run.rlsStatus || 'Not Tested',
            createdBy: actor.name
        };
        d.qaValidationRuns.unshift(row);
        d.qaValidationRuns = d.qaValidationRuns.slice(0, 50);
        this._ensureDeploymentState(d);
        d.deploymentState.lastValidationAt = row.runAt;
        d.deploymentState.lastValidationScore = row.score;
        d.deploymentState.lastValidationStatus = row.status;
        this._appendAudit(d, actor.role, 'qa validation run', `QA validation completed with score ${row.score}%`, 'QA Validation', qaRunId, actor.id);
        this.save(d);
        return row;
    },

    getQaValidationRuns() {
        return (this.get().qaValidationRuns || []).sort((a, b) => (b.runAt || '').localeCompare(a.runAt || ''));
    },

    saveTestLabRun(run = {}, actorInput = {}) {
        const d = this.get();
        if (!Array.isArray(d.testLabRuns)) d.testLabRuns = [];
        const actor = this._migrationActor ? this._migrationActor(actorInput) : { role: actorInput.role || 'platform_owner', id: actorInput.id || '', name: actorInput.name || 'Platform Owner' };
        const testRunId = run.testRunId || run.id || this.generateTestLabRunId(d);
        const row = {
            id: testRunId,
            testRunId,
            runAt: run.runAt || new Date().toISOString(),
            preset: run.preset || 'small',
            environmentMode: run.environmentMode || this.getEnvironmentMode(),
            status: run.status || 'Completed',
            score: Number(run.score || 0),
            summary: run.summary || {},
            results: run.results || [],
            observations: run.observations || {},
            isolationVerified: run.isolationVerified !== false,
            createdBy: actor.name,
            actorRole: actor.role,
            metadata: run.metadata || {}
        };
        d.testLabRuns.unshift(row);
        d.testLabRuns = d.testLabRuns.slice(0, 75);
        this._appendAudit(d, actor.role, 'enterprise test lab run', `Enterprise test lab completed with score ${row.score}%`, 'Enterprise Test Lab', testRunId, actor.id);
        this.save(d);
        this.logDeploymentEvent?.({
            eventType: 'ENTERPRISE_TEST_LAB_RUN',
            status: row.status,
            message: `Enterprise test lab completed with score ${row.score}%`,
            actor,
            metadata: { testRunId, preset: row.preset, summary: row.summary }
        });
        return row;
    },

    getTestLabRuns() {
        return (this.get().testLabRuns || []).sort((a, b) => (b.runAt || '').localeCompare(a.runAt || ''));
    },

    saveOperationIncident(incident = {}, actorInput = {}) {
        const d = this.get();
        if (!Array.isArray(d.operationIncidents)) d.operationIncidents = [];
        const actor = this._migrationActor ? this._migrationActor(actorInput) : { role: actorInput.role || 'system', id: actorInput.id || '', name: actorInput.name || 'System' };
        const incidentId = incident.incidentId || incident.id || this.generateOperationIncidentId(d);
        const existingIdx = d.operationIncidents.findIndex(row => (row.incidentId || row.id) === incidentId);
        const previous = existingIdx > -1 ? d.operationIncidents[existingIdx] : {};
        const row = {
            ...previous,
            id: incidentId,
            incidentId,
            createdAt: previous.createdAt || incident.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            severity: String(incident.severity || previous.severity || 'MEDIUM').toUpperCase(),
            module: incident.module || previous.module || 'System',
            title: incident.title || previous.title || 'Operational Incident',
            description: incident.description || previous.description || '',
            source: incident.source || previous.source || 'monitoring',
            status: incident.status || previous.status || 'Open',
            resolutionNote: incident.resolutionNote || previous.resolutionNote || '',
            resolvedAt: incident.resolvedAt || previous.resolvedAt || '',
            affectedRecordId: incident.affectedRecordId || previous.affectedRecordId || '',
            linkedAuditId: incident.linkedAuditId || previous.linkedAuditId || '',
            linkedDeploymentLogId: incident.linkedDeploymentLogId || previous.linkedDeploymentLogId || '',
            recoveryAction: incident.recoveryAction || previous.recoveryAction || '',
            metadata: { ...(previous.metadata || {}), ...(incident.metadata || {}) },
            createdBy: previous.createdBy || actor.name,
            actorRole: actor.role
        };
        if (existingIdx > -1) d.operationIncidents[existingIdx] = row;
        else d.operationIncidents.unshift(row);
        d.operationIncidents = d.operationIncidents.slice(0, 300);
        this._appendAudit(d, actor.role, 'operation incident logged', `${row.severity} incident: ${row.title}`, 'Operations Monitoring', incidentId, actor.id);
        this.save(d);
        return row;
    },

    updateOperationIncident(incidentId, updates = {}, actorInput = {}) {
        const d = this.get();
        const idx = (d.operationIncidents || []).findIndex(row => (row.incidentId || row.id) === incidentId);
        if (idx === -1) return null;
        const actor = this._migrationActor ? this._migrationActor(actorInput) : { role: actorInput.role || 'system', id: actorInput.id || '', name: actorInput.name || 'System' };
        const row = {
            ...d.operationIncidents[idx],
            ...updates,
            id: d.operationIncidents[idx].id,
            incidentId: d.operationIncidents[idx].incidentId,
            updatedAt: new Date().toISOString()
        };
        if (row.status === 'Resolved' && !row.resolvedAt) row.resolvedAt = new Date().toISOString();
        d.operationIncidents[idx] = row;
        this._appendAudit(d, actor.role, 'operation incident updated', `Incident ${incidentId} updated to ${row.status}`, 'Operations Monitoring', incidentId, actor.id);
        this.save(d);
        return row;
    },

    getOperationIncidents(filters = {}) {
        let rows = this.get().operationIncidents || [];
        if (filters.status) rows = rows.filter(row => row.status === filters.status);
        if (filters.module) rows = rows.filter(row => String(row.module || '').toLowerCase() === String(filters.module).toLowerCase());
        if (filters.severity) rows = rows.filter(row => row.severity === String(filters.severity).toUpperCase());
        if (filters.active) rows = rows.filter(row => !['Resolved', 'Closed'].includes(row.status));
        return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },

    saveOperationMetric(metric = {}) {
        const d = this.get();
        if (!Array.isArray(d.operationMetrics)) d.operationMetrics = [];
        const metricId = metric.metricId || metric.id || this.generateOperationMetricId(d);
        const row = {
            id: metricId,
            metricId,
            recordedAt: metric.recordedAt || new Date().toISOString(),
            module: metric.module || 'System',
            operation: metric.operation || metric.action || 'operation',
            durationMs: Number(metric.durationMs || 0),
            status: metric.status || 'OK',
            thresholdMs: Number(metric.thresholdMs || 0),
            recordCount: Number(metric.recordCount || 0),
            metadata: metric.metadata || {}
        };
        d.operationMetrics.unshift(row);
        d.operationMetrics = d.operationMetrics.slice(0, 500);
        this.save(d);
        return row;
    },

    getOperationMetrics(filters = {}) {
        let rows = this.get().operationMetrics || [];
        if (filters.module) rows = rows.filter(row => String(row.module || '').toLowerCase() === String(filters.module).toLowerCase());
        if (filters.operation) rows = rows.filter(row => row.operation === filters.operation);
        if (filters.slowOnly) rows = rows.filter(row => row.status === 'Slow' || (row.thresholdMs && row.durationMs > row.thresholdMs));
        return rows.sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
    },

    saveServiceError(errorInput = {}, context = {}) {
        const d = this.get();
        if (!Array.isArray(d.serviceErrorLogs)) d.serviceErrorLogs = [];
        const errorId = errorInput.errorId || errorInput.id || this.generateServiceErrorId(d);
        const row = {
            id: errorId,
            errorId,
            occurredAt: errorInput.occurredAt || new Date().toISOString(),
            module: context.module || errorInput.module || 'System',
            action: context.action || errorInput.action || 'operation',
            severity: String(context.severity || errorInput.severity || 'MEDIUM').toUpperCase(),
            message: errorInput.message || String(errorInput || 'Unknown error'),
            stack: errorInput.stack || '',
            source: context.source || errorInput.source || 'service',
            metadata: context.metadata || errorInput.metadata || {}
        };
        d.serviceErrorLogs.unshift(row);
        d.serviceErrorLogs = d.serviceErrorLogs.slice(0, 500);
        this.save(d);
        return row;
    },

    getServiceErrorLogs(filters = {}) {
        let rows = this.get().serviceErrorLogs || [];
        if (filters.module) rows = rows.filter(row => String(row.module || '').toLowerCase() === String(filters.module).toLowerCase());
        if (filters.severity) rows = rows.filter(row => row.severity === String(filters.severity).toUpperCase());
        return rows.sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''));
    },

    getOperationsMonitoringSummary() {
        const d = this.get();
        const activeIncidents = (d.operationIncidents || []).filter(row => !['Resolved', 'Closed'].includes(row.status));
        const criticalIncidents = activeIncidents.filter(row => row.severity === 'CRITICAL');
        const failedImports = (d.importBatches || []).filter(row => /failed|blocked/i.test(row.status || '')).length;
        const payrollIssues = (d.payroll || []).filter(row => /failed|error|blocked/i.test(row.status || row.payrollStatus || '')).length;
        const failedWorkflows = (d.workflowEvents || []).filter(row => /failed|rejected|blocked|overdue/i.test(row.status || row.type || '')).length;
        const slowOperations = (d.operationMetrics || []).filter(row => row.status === 'Slow' || (row.thresholdMs && row.durationMs > row.thresholdMs)).length;
        return {
            activeIncidents: activeIncidents.length,
            criticalIncidents: criticalIncidents.length,
            failedImports,
            payrollIssues,
            failedWorkflows,
            slowOperations,
            serviceErrors: (d.serviceErrorLogs || []).length,
            pendingRecoveryActions: activeIncidents.filter(row => row.recoveryAction).length,
            lastIncidentAt: activeIncidents[0]?.createdAt || ''
        };
    },

    getCleanInstallData() {
        const data = this.getSeedData();
        [
            'users', 'employees', 'attendance', 'leaveRequests', 'payroll', 'teams',
            'expenseClaims', 'performanceGoals', 'appraisals', 'reviewCycles',
            'jobOpenings', 'jobApplications', 'onboardingTasks', 'resignationRequests',
            'exitInterviews', 'documentVerifications', 'attendanceRegularizations',
            'helpdeskTickets', 'onboardingCollections', 'strategicDeliverables',
            'deliverableReviews', 'courseEnrollments', 'empTraining', 'documents',
            'notifications', 'whatsappLogs', 'customReports', 'importLogs',
            'importBatches', 'importStagingRows', 'importRollbackLogs', 'authInvites',
            'workflowEvents', 'pendingActions', 'payrollCycles', 'salaryStructures',
            'payslips', 'migrationLogs', 'deploymentLogs', 'deploymentCheckpoints', 'qaValidationRuns', 'testLabRuns',
            'operationIncidents', 'operationMetrics', 'serviceErrorLogs'
        ].forEach(table => { data[table] = []; });
        data.roster = {};
        data.companySettings = {
            ...data.companySettings,
            companyName: '',
            companyLogoUrl: '',
            timezone: 'Asia/Kolkata',
            currency: 'INR'
        };
        data.settings = { ...data.settings, companyName: '', timezone: 'Asia/Kolkata', currency: 'INR' };
        data.installState = this.getDefaultInstallState(true);
        data.platformGovernance = this.getDefaultPlatformGovernance();
        data.migrationState = this.getDefaultMigrationState();
        data.deploymentState = this.getDefaultDeploymentState();
        data.platformGovernance.updatedBy = 'clean-install';
        data.auditLogs = [];
        return data;
    },

    removeLegacyDemoBusinessData(data) {
        const demoIdentities = new Map([
            ['EMP001', ['Rahul Kumar', 'demo.manager@example.invalid']],
            ['EMP002', ['Priya Sharma', 'demo.employee-1@example.invalid']],
            ['EMP003', ['Amit Verma', 'demo.employee-2@example.invalid']],
            ['EMP004', ['Sneha Mehta', 'demo.employee-3@example.invalid']],
            ['EMP005', ['Nikhil Khanna', 'demo.employee-4@example.invalid']]
        ]);
        const demoEmployeeIds = new Set((data.employees || []).filter(employee => {
            const identity = demoIdentities.get(employee.id);
            return identity && employee.name === identity[0] && employee.email === identity[1];
        }).map(employee => employee.id));
        const demoUserEmails = new Set([
            'demo.admin@example.invalid',
            'demo.hr@example.invalid',
            'demo.manager@example.invalid',
            'demo.employee-1@example.invalid',
            'demo.employee-2@example.invalid',
            'demo.employee-3@example.invalid',
            'demo.employee-4@example.invalid'
        ]);
        const hasLegacyDemo = demoEmployeeIds.size > 0 || (data.users || []).some(user => demoUserEmails.has(user.email));
        if (!hasLegacyDemo) return false;

        const filterRows = (table, predicate) => {
            if (!Array.isArray(data[table])) return;
            data[table] = data[table].filter(predicate);
        };
        filterRows('users', user => !demoUserEmails.has(user.email) && !demoEmployeeIds.has(user.empId));
        filterRows('employees', employee => !demoEmployeeIds.has(employee.id));
        ['attendance', 'leaveRequests', 'payroll', 'expenseClaims', 'performanceGoals', 'appraisals',
            'onboardingTasks', 'resignationRequests', 'exitInterviews', 'documentVerifications',
            'attendanceRegularizations', 'helpdeskTickets', 'onboardingCollections', 'strategicDeliverables',
            'courseEnrollments', 'empTraining'].forEach(table => {
            filterRows(table, row => !demoEmployeeIds.has(row.empId) && !demoEmployeeIds.has(row.employeeId));
        });
        filterRows('deliverableReviews', row => !demoEmployeeIds.has(row.empId) && !demoEmployeeIds.has(row.employeeId) && !demoEmployeeIds.has(row.reviewerId));
        filterRows('documents', row => !demoEmployeeIds.has(row.empId) && !demoEmployeeIds.has(row.employeeId) && !demoEmployeeIds.has(row.assignedTo));
        filterRows('notifications', row => !demoEmployeeIds.has(row.empId) && !demoEmployeeIds.has(row.employeeId) && !demoEmployeeIds.has(row.toEmpId));
        filterRows('teams', team => team.id !== 'TM001' && !demoEmployeeIds.has(team.managerId) && !(team.memberIds || []).some(id => demoEmployeeIds.has(id)));
        if (data.settings?.companyName === 'ArthHRMS') data.settings.companyName = '';
        if (data.companySettings?.companyName === 'ArthHRMS') data.companySettings.companyName = '';
        return true;
    },

    getSeedData() {
        return {
            users: [],
            
            employees: [],
            
            attendance: [],
            
            leaveRequests: [],
            
            payroll: [],
            
            shifts: [
                { id:'SH001', name:'Morning Shift', startTime:'06:00', endTime:'14:00', graceMinutes:15, color:'#0ea5e9', desc:'Early morning shift' },
                { id:'SH002', name:'General Shift', startTime:'09:00', endTime:'18:00', graceMinutes:15, color:'#1a56db', desc:'Regular office hours' },
                { id:'SH003', name:'Afternoon Shift', startTime:'14:00', endTime:'22:00', graceMinutes:15, color:'#d97706', desc:'Afternoon shift' },
                { id:'SH004', name:'Night Shift', startTime:'22:00', endTime:'06:00', graceMinutes:15, color:'#7c3aed', desc:'Night shift' }
            ],
            
            teams: [],
            
            expenseClaims: [],
            performanceGoals: [],
            appraisals: [],
            reviewCycles: [],
            jobOpenings: [],
            jobApplications: [],
            onboardingTasks: [],
            resignationRequests: [],
            exitInterviews: [],
            documentVerifications: [],
            attendanceRegularizations: [],
            helpdeskTickets: [],
            onboardingCollections: [],
            strategicDeliverables: [],
            deliverableReviews: [],
            courses: [],
            courseEnrollments: [],
            training: [],
            empTraining: [],
            documents: [],
            notifications: [],
            whatsappLogs: [],
            roster: {},
            customReports: [],
            importLogs: [],
            importBatches: [],
            importStagingRows: [],
            importRollbackLogs: [],
            authInvites: [],
            migrationState: this.getDefaultMigrationState(),
            migrationLogs: [],
            deploymentState: this.getDefaultDeploymentState(),
            deploymentLogs: [],
            deploymentCheckpoints: [],
            qaValidationRuns: [],
            testLabRuns: [],
            operationIncidents: [],
            operationMetrics: [],
            serviceErrorLogs: [],
            
            settings: {
                companyName: '',
                timezone: 'Asia/Kolkata',
                currency: 'INR',
                expenseApprovalLevels: 2
            },
            companySettings: {
                companyName: '',
                companyLogoUrl: '',
                timezone: 'Asia/Kolkata',
                currency: 'INR',
                monthlyPayrollDate: 30,
                defaultAnnualLeaveDays: 20,
                attendanceGraceMinutes: 15,
                workWeekPattern: 'Monday to Friday'
            },
            rolePermissions: {
                adminHelpdesk: true,
                adminAttendanceRegularization: true,
                managerExpenseApprovals: true,
                employeePayslips: true,
                hrRecruitment: true,
                hrAppraisals: true
            },
            platformGovernance: this.getDefaultPlatformGovernance(),
            auditLogs: []
        };
    },
    
    get() {
        if (!this._state) this.init();
        return this._cloneState(this._state);
    },
    
    save(data) {
        const previous = this._state ? this._cloneState(this._state) : null;
        this._state = this._cloneState(data || {});
        if (!this._suppressPersistence && typeof globalThis !== 'undefined' && globalThis.supabasePersistenceService?.enqueueSnapshot) {
            globalThis.supabasePersistenceService.enqueueSnapshot(previous, this._cloneState(this._state));
        }
        return this.get();
    },

    replaceState(data, options = {}) {
        this._suppressPersistence += 1;
        try {
            this._state = this._cloneState(data || this.getCleanInstallData());
            if (options.migrate) this.migrate();
        } finally {
            this._suppressPersistence = Math.max(0, this._suppressPersistence - 1);
        }
        return this.get();
    },

    reset(options = {}) {
        const previous = this._state ? this._cloneState(this._state) : {};
        const next = options.clean === false ? this.getSeedData() : this.getCleanInstallData();
        this._state = this._cloneState(next);
        if (!options.skipPersistence && typeof globalThis !== 'undefined' && globalThis.supabasePersistenceService?.enqueueSnapshot) {
            globalThis.supabasePersistenceService.enqueueSnapshot(previous, this.get());
        }
        return this.get();
    },

    whenPersistenceIdle() {
        return typeof globalThis !== 'undefined' && globalThis.supabasePersistenceService?.flush
            ? globalThis.supabasePersistenceService.flush()
            : Promise.resolve();
    },
    
    migrate() {
        const d = this.get();
        let changed = false;
        changed = this.removeLegacyDemoBusinessData(d) || changed;
        changed = this.stripLocalAuthCredentials(d) || changed;
        
        const tables = ['users', 'employees', 'attendance', 'leaveRequests', 'payroll', 'shifts', 'teams',
            'expenseClaims', 'performanceGoals', 'appraisals', 'reviewCycles', 'jobOpenings', 'jobApplications',
            'onboardingTasks', 'resignationRequests', 'exitInterviews', 'documentVerifications', 'attendanceRegularizations',
            'helpdeskTickets', 'onboardingCollections', 'strategicDeliverables', 'deliverableReviews', 'courses', 'courseEnrollments', 'training', 'empTraining', 'documents', 'notifications',
            'whatsappLogs', 'roster', 'customReports', 'importLogs', 'importBatches', 'importStagingRows', 'importRollbackLogs', 'auditLogs', 'workflowEvents', 'pendingActions',
            'payrollCycles', 'salaryStructures', 'payslips', 'migrationLogs', 'deploymentLogs', 'deploymentCheckpoints', 'qaValidationRuns', 'testLabRuns',
            'operationIncidents', 'operationMetrics', 'serviceErrorLogs'];
        
        tables.forEach(table => {
            if (!d[table]) {
                d[table] = [];
                changed = true;
            }
        });
        
        if (!d.settings || Array.isArray(d.settings)) {
            d.settings = { companyName: '', timezone: 'Asia/Kolkata', currency: 'INR', expenseApprovalLevels: 2 };
            changed = true;
        }
        if (!d.companySettings || Array.isArray(d.companySettings)) {
            d.companySettings = {
                companyName: d.settings.companyName || '',
                companyLogoUrl: d.settings.companyLogoUrl || '',
                timezone: d.settings.timezone || 'Asia/Kolkata',
                currency: d.settings.currency || 'INR',
                monthlyPayrollDate: d.settings.monthlyPayrollDate || 30,
                defaultAnnualLeaveDays: d.settings.defaultAnnualLeaveDays || 20,
                attendanceGraceMinutes: d.settings.attendanceGraceMinutes || 15,
                workWeekPattern: d.settings.workWeekPattern || 'Monday to Friday'
            };
            changed = true;
        }
        if (!d.rolePermissions || Array.isArray(d.rolePermissions)) {
            d.rolePermissions = {
                adminHelpdesk: true,
                adminAttendanceRegularization: true,
                managerExpenseApprovals: true,
                employeePayslips: true,
                hrRecruitment: true,
                hrAppraisals: true
            };
            changed = true;
        } else {
            const defaults = {
                adminHelpdesk: true,
                adminAttendanceRegularization: true,
                managerExpenseApprovals: true,
                employeePayslips: true,
                hrRecruitment: true,
                hrAppraisals: true
            };
            Object.keys(defaults).forEach(k => {
                if (d.rolePermissions[k] === undefined) {
                    d.rolePermissions[k] = defaults[k];
                    changed = true;
                }
            });
        }
        if (!Array.isArray(d.auditLogs)) {
            d.auditLogs = [];
            changed = true;
        }
        changed = this._ensureInstallState(d) || changed;
        changed = this._ensurePlatformGovernance(d) || changed;
        changed = this._ensureMigrationState(d) || changed;
        changed = this._ensureDeploymentState(d) || changed;
        changed = this.enforceProductionMode(d) || changed;
        
        changed = this.normalizeDataArchitecture(d) || changed;
        if (!Array.isArray(d.expenseClaims)) {
            d.expenseClaims = [];
            changed = true;
        }
        d.expenseClaims.forEach(c => {
            if (c.claimId && !c.id) { c.id = c.claimId; changed = true; }
            if (c.managerRemarks && !c.managerRemark) { c.managerRemark = c.managerRemarks; changed = true; }
            if (c.financeRemarks && !c.hrRemark) { c.hrRemark = c.financeRemarks; changed = true; }
            if (c.billFile && !c.billFileName) { c.billFileName = c.billFile; changed = true; }
            if (!c.status) { c.status = 'Pending Manager Approval'; changed = true; }
            if (c.status === 'Pending') { c.status = 'Pending Manager Approval'; changed = true; }
            if (c.status === 'Manager Approved') { c.status = 'Pending HR Payment'; changed = true; }
            if (c.status === 'Rejected') {
                c.status = c.hrRemark ? 'Rejected by HR' : 'Rejected by Manager';
                changed = true;
            }
            if (!c.expenseId) { c.expenseId = c.id || c.claimId || this.generateExpenseId(d); changed = true; }
            if (!c.id) { c.id = c.expenseId; changed = true; }
            if (!c.date && c.expenseDate) { c.date = c.expenseDate; changed = true; }
            if (!c.expenseDate) { c.expenseDate = c.date || this.today(); changed = true; }
            if (!c.currency) { c.currency = d.companySettings?.currency || d.settings?.currency || 'INR'; changed = true; }
            if (!c.attachmentUrl && c.billFileName) { c.attachmentUrl = ''; changed = true; }
            if (!c.attachmentFileName && c.billFileName) { c.attachmentFileName = c.billFileName; changed = true; }
            const st = String(c.status || 'Pending Manager Approval');
            const nextManagerStatus = st === 'Pending Manager Approval' ? 'Pending' : st === 'Rejected by Manager' ? 'Rejected' : (c.managerStatus || 'Approved');
            const nextFinanceStatus = st === 'Paid' ? 'Paid' : st === 'Rejected by HR' ? 'Rejected' : st === 'Pending HR Payment' ? (c.financeStatus || 'Pending') : st === 'Rejected by Manager' ? 'Not Required' : (c.financeStatus || 'Pending');
            const nextFinalStatus = st === 'Paid' ? 'Paid' : st.indexOf('Rejected') > -1 ? 'Rejected' : st === 'Pending HR Payment' ? (c.financeStatus === 'Approved' ? 'Approved' : 'Manager Approved') : (c.finalStatus || 'Pending');
            if (!c.managerStatus) { c.managerStatus = nextManagerStatus; changed = true; }
            if (!c.financeStatus) { c.financeStatus = nextFinanceStatus; changed = true; }
            if (!c.finalStatus) { c.finalStatus = nextFinalStatus; changed = true; }
            if (c.amount !== undefined && typeof c.amount !== 'number') {
                c.amount = Number(c.amount) || 0;
                changed = true;
            }
            if (!c.managerRemark) { c.managerRemark = ''; changed = true; }
            if (!c.hrRemark) { c.hrRemark = ''; changed = true; }
            if (!c.submittedOn) { c.submittedOn = c.date || this.today(); changed = true; }
        });

        if (!Array.isArray(d.payrollCycles)) { d.payrollCycles = []; changed = true; }
        if (!Array.isArray(d.salaryStructures)) { d.salaryStructures = []; changed = true; }
        if (!Array.isArray(d.payslips)) { d.payslips = []; changed = true; }
        if (!Array.isArray(d.payroll)) { d.payroll = []; changed = true; }
        const payrollIds = new Set();
        d.payroll.forEach(p => {
            const resolvedEmpId = this.resolveEmployeeId(p.empId || p.employeeId, d);
            if (resolvedEmpId && p.empId !== resolvedEmpId) { p.empId = resolvedEmpId; changed = true; }
            let payrollId = p.payrollId || p.id || this.generatePayrollId(d);
            if (!payrollId || payrollIds.has(payrollId)) {
                payrollId = this.generatePayrollId(d);
                changed = true;
            }
            payrollIds.add(payrollId);
            if (p.payrollId !== payrollId) { p.payrollId = payrollId; changed = true; }
            if (p.id !== payrollId) { p.id = payrollId; changed = true; }
            if (!p.payrollMonth && p.month) { p.payrollMonth = p.month; changed = true; }
            if (!p.month && p.payrollMonth) { p.month = p.payrollMonth; changed = true; }
            if (!p.payrollMonth) { p.payrollMonth = p.month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }); changed = true; }
            if (p.basicSalary === undefined) { p.basicSalary = Number(p.basic || 0); changed = true; }
            if (p.basic === undefined) { p.basic = Number(p.basicSalary || 0); changed = true; }
            ['basicSalary', 'basic', 'hra', 'special', 'transport', 'pf', 'esic', 'pt', 'tds'].forEach(k => {
                if (p[k] !== undefined && typeof p[k] !== 'number') { p[k] = Number(p[k]) || 0; changed = true; }
            });
            const allowanceTotal = Number(p.hra || 0) + Number(p.special || 0) + Number(p.transport || 0);
            if (p.allowances === undefined) { p.allowances = allowanceTotal; changed = true; }
            if (p.deductions === undefined) { p.deductions = Number(p.pf || 0) + Number(p.esic || 0) + Number(p.pt || 0) + Number(p.tds || 0); changed = true; }
            if (p.leaveDeductions === undefined) { p.leaveDeductions = 0; changed = true; }
            if (p.expenseReimbursements === undefined) { p.expenseReimbursements = 0; changed = true; }
            if (p.overtimeAmount === undefined) { p.overtimeAmount = 0; changed = true; }
            if (p.bonusAmount === undefined) { p.bonusAmount = 0; changed = true; }
            ['allowances', 'deductions', 'leaveDeductions', 'expenseReimbursements', 'overtimeAmount', 'bonusAmount'].forEach(k => {
                if (typeof p[k] !== 'number') { p[k] = Number(p[k]) || 0; changed = true; }
            });
            if (p.grossSalary === undefined) { p.grossSalary = Number(p.gross || (Number(p.basicSalary || p.basic || 0) + Number(p.allowances || 0) + Number(p.overtimeAmount || 0) + Number(p.bonusAmount || 0))); changed = true; }
            if (p.gross === undefined) { p.gross = Number(p.grossSalary || 0); changed = true; }
            if (p.netSalary === undefined) { p.netSalary = Math.max(0, Number(p.net || (Number(p.grossSalary || p.gross || 0) + Number(p.expenseReimbursements || 0) - Number(p.deductions || 0) - Number(p.leaveDeductions || 0)))); changed = true; }
            if (p.net === undefined) { p.net = Number(p.netSalary || 0); changed = true; }
            if (!p.payrollStatus) { p.payrollStatus = p.status || 'Pending'; changed = true; }
            if (!p.status) { p.status = p.payrollStatus; changed = true; }
            if (p.status !== p.payrollStatus) { p.status = p.payrollStatus; changed = true; }
            if (!p.processedAt && p.status !== 'Paid') { p.processedAt = p.createdAt || null; changed = true; }
            if (p.status === 'Paid' && !p.paidAt && p.paidOn) { p.paidAt = String(p.paidOn).includes('T') ? p.paidOn : new Date(String(p.paidOn) + 'T00:00:00').toISOString(); changed = true; }
            if (!p.calculationMeta) { p.calculationMeta = {}; changed = true; }
        });
        d.salaryStructures.forEach(s => {
            if (!s.structureId) { s.structureId = s.id || 'SAL' + String(d.salaryStructures.indexOf(s) + 1).padStart(4, '0'); changed = true; }
            if (!s.id) { s.id = s.structureId; changed = true; }
            const resolvedEmpId = this.resolveEmployeeId(s.empId || s.employeeId, d);
            if (resolvedEmpId && s.empId !== resolvedEmpId) { s.empId = resolvedEmpId; changed = true; }
            if (!s.effectiveFrom) { s.effectiveFrom = this.today(); changed = true; }
            if (!s.currency) { s.currency = d.companySettings?.currency || d.settings?.currency || 'INR'; changed = true; }
            if (!s.status) { s.status = 'Active'; changed = true; }
            ['basicSalary', 'hra', 'allowances', 'deductions', 'overtimeRate', 'bonusPlaceholder'].forEach(k => {
                if (s[k] === undefined) { s[k] = 0; changed = true; }
                if (typeof s[k] !== 'number') { s[k] = Number(s[k]) || 0; changed = true; }
            });
        });
        d.payslips.forEach(p => {
            if (!p.payslipId) { p.payslipId = p.id || 'PS' + String(d.payslips.indexOf(p) + 1).padStart(4, '0'); changed = true; }
            if (!p.id) { p.id = p.payslipId; changed = true; }
            if (!p.payrollMonth && p.month) { p.payrollMonth = p.month; changed = true; }
            if (!p.status) { p.status = 'Generated'; changed = true; }
            if (!p.generatedAt) { p.generatedAt = new Date().toISOString(); changed = true; }
        });

        if (!Array.isArray(d.jobOpenings)) {
            d.jobOpenings = [];
            changed = true;
        }
        d.jobOpenings.forEach(j => {
            if (j.dept && !j.department) { j.department = j.dept; changed = true; }
            if (j.numberOfOpenings !== undefined && j.openings === undefined) { j.openings = j.numberOfOpenings; changed = true; }
            if (j.openings !== undefined && typeof j.openings !== 'number') {
                j.openings = Number(j.openings) || 1;
                changed = true;
            }
            if (!j.status) { j.status = 'Open'; changed = true; }
            if (!j.postedOn) { j.postedOn = this.today(); changed = true; }
            if (j.description === undefined) { j.description = ''; changed = true; }
            if (j.location === undefined) { j.location = ''; changed = true; }
        });
        if (!Array.isArray(d.jobApplications)) {
            d.jobApplications = [];
            changed = true;
        }
        d.jobApplications.forEach(a => {
            if (a.resume && !a.resumeFileName) { a.resumeFileName = a.resume; changed = true; }
            if (a.status && !a.pipelineStage) { a.pipelineStage = a.status; changed = true; }
            if (!a.pipelineStage || a.pipelineStage === 'New') { a.pipelineStage = 'Applied'; changed = true; }
            if (a.status !== a.pipelineStage) { a.status = a.pipelineStage; changed = true; }
            if (a.expectedSalary !== undefined && typeof a.expectedSalary !== 'number') {
                a.expectedSalary = Number(a.expectedSalary) || 0;
                changed = true;
            }
            if (!a.appliedOn) { a.appliedOn = this.today(); changed = true; }
            if (a.currentCompany === undefined) { a.currentCompany = ''; changed = true; }
        });

        if (!Array.isArray(d.onboardingTasks)) {
            d.onboardingTasks = [];
            changed = true;
        }
        d.onboardingTasks.forEach(t => {
            if (!t.status) { t.status = t.completed ? 'Completed' : 'Pending'; changed = true; }
            if (t.completed === undefined) { t.completed = t.status === 'Completed'; changed = true; }
            if (!t.taskType) { t.taskType = t.type || t.task || 'document_collection'; changed = true; }
            if (!t.task) { t.task = t.taskType; changed = true; }
            if (t.notes === undefined) { t.notes = ''; changed = true; }
            if (!t.assignedOn) { t.assignedOn = this.today(); changed = true; }
        });
        if (!Array.isArray(d.resignationRequests)) {
            d.resignationRequests = [];
            changed = true;
        }
        d.resignationRequests.forEach(r => {
            if (!r.status) { r.status = 'Pending'; changed = true; }
            if (!r.submittedOn) { r.submittedOn = this.today(); changed = true; }
            if (r.exitChecklist === undefined) { r.exitChecklist = []; changed = true; }
            if (r.finalSettlementComplete === undefined) { r.finalSettlementComplete = false; changed = true; }
            if (r.hrNotes === undefined) { r.hrNotes = ''; changed = true; }
        });
        if (!Array.isArray(d.exitInterviews)) {
            d.exitInterviews = [];
            changed = true;
        }
        d.exitInterviews.forEach(x => {
            if (!x.submittedOn) { x.submittedOn = this.today(); changed = true; }
            if (x.notes === undefined && x.feedback !== undefined) { x.notes = x.feedback; changed = true; }
        });

        if (!Array.isArray(d.documentVerifications)) { d.documentVerifications = []; changed = true; }
        d.documentVerifications.forEach(v => {
            if (!v.savedOn) { v.savedOn = this.today(); changed = true; }
            ['aadhaarStatus', 'panStatus', 'bankStatus', 'educationStatus', 'joiningStatus'].forEach(k => {
                if (!v[k]) { v[k] = 'Missing'; changed = true; }
            });
            if (v.remark === undefined) { v.remark = ''; changed = true; }
        });

        if (!Array.isArray(d.attendanceRegularizations)) { d.attendanceRegularizations = []; changed = true; }
        d.attendanceRegularizations.forEach(r => {
            if (!r.savedOn) { r.savedOn = this.today(); changed = true; }
            if (r.reason === undefined) { r.reason = ''; changed = true; }
            if (!r.status) { r.status = r.requestedOn && !r.decidedOn ? 'Pending' : 'Approved'; changed = true; }
        });

        if (!Array.isArray(d.helpdeskTickets)) { d.helpdeskTickets = []; changed = true; }
        d.helpdeskTickets.forEach(t => {
            if (!t.status) { t.status = 'Open'; changed = true; }
            if (!t.createdOn) { t.createdOn = this.today(); changed = true; }
            if (t.resolutionNote === undefined) { t.resolutionNote = ''; changed = true; }
        });

        if (!Array.isArray(d.onboardingCollections)) { d.onboardingCollections = []; changed = true; }
        d.onboardingCollections.forEach(c => {
            if (!c.savedOn) { c.savedOn = this.today(); changed = true; }
            ['photoSubmitted', 'bankFormSubmitted', 'idProofSubmitted', 'educationProofSubmitted', 'policySigned', 'welcomeKitIssued'].forEach(k => {
                if (c[k] === undefined) { c[k] = false; changed = true; }
            });
        });

        if (!Array.isArray(d.strategicDeliverables)) { d.strategicDeliverables = []; changed = true; }
        d.strategicDeliverables.forEach((item, index) => {
            const emp = (d.employees || []).find(e => e.id === item.empId);
            const high = Number(emp?.salary || item.salary || 0) >= 100000;
            if (!item.deliverableId) { item.deliverableId = item.id || ('SD' + String(index + 1).padStart(4, '0')); changed = true; }
            if (!item.id) { item.id = item.deliverableId; changed = true; }
            if (item.id !== item.deliverableId) { item.id = item.deliverableId; changed = true; }
            if (!item.employeeName) { item.employeeName = emp?.name || ''; changed = true; }
            if (!item.department) { item.department = emp?.dept || ''; changed = true; }
            if (!item.designation) { item.designation = emp?.desig || ''; changed = true; }
            if (item.salary === undefined) { item.salary = Number(emp?.salary || 0); changed = true; }
            if (!item.accountabilityTier) { item.accountabilityTier = high ? 'High Accountability Resource' : 'Standard Accountability Resource'; changed = true; }
            if (!item.deliverableTitle) { item.deliverableTitle = item.title || ''; changed = true; }
            if (item.title !== item.deliverableTitle) { item.title = item.deliverableTitle; changed = true; }
            if (!item.businessObjective) { item.businessObjective = item.description || ''; changed = true; }
            if (!item.expectedOutcome) { item.expectedOutcome = item.targetOutcome || item.kpi || ''; changed = true; }
            if (item.targetOutcome !== item.expectedOutcome) { item.targetOutcome = item.expectedOutcome; changed = true; }
            if (!item.assignedDate) { item.assignedDate = item.createdOn || this.today(); changed = true; }
            if (!item.createdOn) { item.createdOn = item.assignedDate; changed = true; }
            if (!item.deadlineDate) { item.deadlineDate = item.dueDate || this.today(); changed = true; }
            if (item.dueDate !== item.deadlineDate) { item.dueDate = item.deadlineDate; changed = true; }
            if (!item.reviewFrequency) { item.reviewFrequency = 'Monthly'; changed = true; }
            if (!item.assignedBy) { item.assignedBy = 'HR'; changed = true; }
            if (!item.priority) { item.priority = 'Medium'; changed = true; }
            if (!item.quarter) { item.quarter = this.currentQuarter(); changed = true; }
            const progress = Math.min(100, Math.max(0, Number(item.progressPercent ?? item.progress ?? 0) || 0));
            if (item.progressPercent !== progress) { item.progressPercent = progress; changed = true; }
            if (item.progress !== progress) { item.progress = progress; changed = true; }
            if (!item.currentStatus) { item.currentStatus = item.status || 'Active'; changed = true; }
            if (!item.status) { item.status = item.currentStatus; changed = true; }
            const closureLabels = ['Achieved', 'Partially Achieved', 'Failed', 'Exceeded'];
            if (!item.finalClosureStatus) { item.finalClosureStatus = closureLabels.includes(item.status) ? item.status : 'Open'; changed = true; }
            if (item.finalClosureStatus !== 'Open' && item.currentStatus !== 'Closed') { item.currentStatus = 'Closed'; item.status = 'Closed'; changed = true; }
            if (item.highAccountability !== high) { item.highAccountability = high; changed = true; }
            if (!item.managerId) { item.managerId = emp?.managerId || ''; changed = true; }
            const governanceService = (typeof window !== 'undefined' ? window : globalThis).deliverableGovernanceService;
            if (governanceService?.normalizeDeliverableRecord) {
                const governed = governanceService.normalizeDeliverableRecord(item, d);
                ['strategicOwnerId', 'strategicOwnerRole', 'strategicOwnerName', 'reviewerId', 'reviewerRole', 'sponsorRole', 'contributors', 'governanceState', 'workflowState', 'strategicRoles', 'employeeIsContributorOnly', 'accountabilityModel'].forEach(key => {
                    if (JSON.stringify(item[key]) !== JSON.stringify(governed[key])) { item[key] = governed[key]; changed = true; }
                });
            }
        });
        if (!Array.isArray(d.deliverableReviews)) { d.deliverableReviews = []; changed = true; }
        d.deliverableReviews.forEach((r, index) => {
            if (!r.reviewId) { r.reviewId = r.id || ('DR' + String(index + 1).padStart(4, '0')); changed = true; }
            if (!r.id) { r.id = r.reviewId; changed = true; }
            if (r.id !== r.reviewId) { r.id = r.reviewId; changed = true; }
            if (!r.reviewDate) { r.reviewDate = r.reviewedOn || this.today(); changed = true; }
            if (!r.reviewedOn) { r.reviewedOn = r.reviewDate; changed = true; }
            if (!r.reviewMonth) { r.reviewMonth = String(r.reviewDate || this.today()).slice(0, 7); changed = true; }
            if (!r.employeeProgressNote) { r.employeeProgressNote = ''; changed = true; }
            if (!r.managerAchievements) { r.managerAchievements = ''; changed = true; }
            if (!r.managerBottlenecks) { r.managerBottlenecks = ''; changed = true; }
            if (!r.managerRemark) { r.managerRemark = r.note || ''; changed = true; }
            if (!r.reviewStatus) { r.reviewStatus = r.riskLevel || 'Attention'; changed = true; }
            if (!r.riskLevel) { r.riskLevel = r.reviewStatus; changed = true; }
            const progress = Math.min(100, Math.max(0, Number(r.progressPercent ?? r.progress ?? 0) || 0));
            if (r.progressPercent !== progress) { r.progressPercent = progress; changed = true; }
            if (r.progress !== progress) { r.progress = progress; changed = true; }
            if (!r.note) { r.note = r.managerRemark || r.employeeProgressNote || ''; changed = true; }
            if (!r.reviewerAction) {
                r.reviewerAction = r.managerId ? 'APPROVE_PROGRESS' : 'CONTRIBUTOR_UPDATE';
                changed = true;
            }
            if (!r.governanceState) {
                r.governanceState = r.reviewerAction === 'CONTRIBUTOR_UPDATE' ? 'UNDER_REVIEW' : 'APPROVED';
                changed = true;
            }
        });
        
        if (changed) this.save(d);
    },
    
    // ==================== HELPER FUNCTIONS ====================
    
    today() { 
        return new Date().toISOString().split('T')[0]; 
    },

    currentQuarter(date = new Date()) {
        const q = Math.floor(date.getMonth() / 3) + 1;
        return date.getFullYear() + '-Q' + q;
    },
    
    now() {
        return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    },
    
    timeToMins(hhmm) {
        const [h, m] = (hhmm || '00:00').split(':').map(Number);
        return h * 60 + m;
    },
    
    addMinutes(time, minutes) {
        const total = this.timeToMins(time) + minutes;
        return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    },
    
    calcWorkingHours(inTime, outTime) {
        const toSecs = t => { const p = t.split(':').map(Number); return p[0] * 3600 + p[1] * 60 + (p[2] || 0); };
        let diff = toSecs(outTime) - toSecs(inTime);
        if (diff < 0) diff += 86400;
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },
    
    dateDiff(from, to) {
        return Math.max(1, Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1);
    },

    getEmployeeIdYear() {
        return String(new Date().getFullYear());
    },

    getEmployeeIdPrefix(year = this.getEmployeeIdYear()) {
        return `ARTH-EMP-${year}`;
    },

    isOfficialEmployeeId(id) {
        return /^ARTH-EMP-\d{4}-\d{4,}$/i.test(String(id || '').trim());
    },

    isLegacyEmployeeId(id) {
        return /^EMP\d+$/i.test(String(id || '').trim());
    },

    extractEmployeeIdNumber(id) {
        const text = String(id || '').trim().toUpperCase();
        if (this.isOfficialEmployeeId(text)) return Number(text.split('-').pop()) || 0;
        if (this.isLegacyEmployeeId(text)) return Number(text.replace(/^EMP/i, '')) || 0;
        return Number(text.replace(/\D/g, '')) || 0;
    },

    normalizeEmployeeIdText(id) {
        return String(id || '').trim().toUpperCase();
    },

    generateEmployeeId(data = null, reserved = new Set(), options = {}) {
        const d = data || this.get();
        const year = String(options.year || this.getEmployeeIdYear());
        const prefix = this.getEmployeeIdPrefix(year);
        let max = 0;
        const used = new Set([...reserved].map(id => this.normalizeEmployeeIdText(id)));
        (d.employees || []).forEach(e => {
            const ids = [e.id, e.empId, e.employeeId, e.employeeCode, e.companyEmployeeCode, e.legacyEmpId, ...(e.legacyIds || [])];
            ids.forEach(raw => {
                const id = this.normalizeEmployeeIdText(raw);
                if (this.isOfficialEmployeeId(id)) {
                    used.add(id);
                    if (id.startsWith(prefix)) max = Math.max(max, this.extractEmployeeIdNumber(id));
                }
            });
        });
        let next = max + 1;
        let candidate = `${prefix}-${String(next).padStart(4, '0')}`;
        while (used.has(candidate)) {
            next += 1;
            candidate = `${prefix}-${String(next).padStart(4, '0')}`;
        }
        return candidate;
    },

    generateUserId(data = null) {
        const d = data || this.get();
        const max = (d.users || []).reduce((m, u) => Math.max(m, Number(String(u.id || '').replace(/\D/g, '')) || 0), 0);
        return 'USR' + String(max + 1).padStart(3, '0');
    },

    generateSequentialId(prefix, rows = [], pad = 3, key = 'id') {
        const max = (rows || []).reduce((m, row) => Math.max(m, Number(String(row[key] || row.id || '').replace(/\D/g, '')) || 0), 0);
        return prefix + String(max + 1).padStart(pad, '0');
    },

    generateRecordId(type, data = null, reserved = new Set()) {
        const d = data || this.get();
        const config = {
            employee: { table: 'employees', prefix: '', pad: 4, generator: 'employee' },
            attendance: { table: 'attendance', prefix: 'AT', pad: 4, key: 'attendanceId' },
            leave: { table: 'leaveRequests', prefix: 'LV', pad: 4 },
            expense: { table: 'expenseClaims', prefix: 'EC', pad: 4 },
            payroll: { table: 'payroll', prefix: 'PAY', pad: 4, key: 'payrollId' },
            notification: { table: 'notifications', prefix: 'N', pad: 4 },
            deliverable: { table: 'strategicDeliverables', prefix: 'SD', pad: 4, key: 'deliverableId' },
            deliverableReview: { table: 'deliverableReviews', prefix: 'DR', pad: 4, key: 'reviewId' },
            helpdesk: { table: 'helpdeskTickets', prefix: 'HD', pad: 4 },
            importLog: { table: 'importLogs', prefix: 'IMP', pad: 4, key: 'importId' },
            importBatch: { table: 'importBatches', prefix: 'IB', pad: 4, key: 'importBatchId' },
            importStagingRow: { table: 'importStagingRows', prefix: 'STG', pad: 5, key: 'stagingId' },
            importRollbackLog: { table: 'importRollbackLogs', prefix: 'RB', pad: 4, key: 'rollbackId' }
            ,authInvite: { table: 'authInvites', prefix: 'INV', pad: 4, key: 'inviteId' },
            migrationLog: { table: 'migrationLogs', prefix: 'MIG', pad: 4, key: 'logId' },
            deploymentLog: { table: 'deploymentLogs', prefix: 'DEP', pad: 4, key: 'deploymentLogId' },
            deploymentCheckpoint: { table: 'deploymentCheckpoints', prefix: 'DCP', pad: 4, key: 'checkpointId' },
            qaValidationRun: { table: 'qaValidationRuns', prefix: 'QA', pad: 4, key: 'qaRunId' },
            testLabRun: { table: 'testLabRuns', prefix: 'TL', pad: 4, key: 'testRunId' },
            operationIncident: { table: 'operationIncidents', prefix: 'INC', pad: 4, key: 'incidentId' },
            operationMetric: { table: 'operationMetrics', prefix: 'MET', pad: 4, key: 'metricId' },
            serviceError: { table: 'serviceErrorLogs', prefix: 'ERR', pad: 4, key: 'errorId' }
        }[type] || { table: '', prefix: String(type || 'ID').toUpperCase(), pad: 4 };
        if (config.generator === 'employee') return this.generateEmployeeId(d, reserved);
        const rows = d[config.table] || [];
        const key = config.key || 'id';
        const used = new Set([
            ...rows.map(row => String(row[key] || row.id || '')),
            ...[...reserved].map(String)
        ].filter(Boolean));
        let max = 0;
        used.forEach(id => { max = Math.max(max, Number(String(id).replace(/\D/g, '')) || 0); });
        let nextNo = max + 1;
        let next = config.prefix + String(nextNo).padStart(config.pad, '0');
        while (used.has(next)) {
            nextNo += 1;
            next = config.prefix + String(nextNo).padStart(config.pad, '0');
        }
        return next;
    },

    generateLeaveId(data = null) { return this.generateRecordId('leave', data); },
    generateAttendanceId(data = null) { return this.generateRecordId('attendance', data); },
    generateExpenseId(data = null) { return this.generateRecordId('expense', data); },
    generatePayrollId(data = null) { return this.generateRecordId('payroll', data); },
    generateNotificationId(data = null) { return this.generateRecordId('notification', data); },
    generateDeliverableId(data = null) { return this.generateRecordId('deliverable', data); },
    generateDeliverableReviewId(data = null) { return this.generateRecordId('deliverableReview', data); },
    generateHelpdeskTicketId(data = null) { return this.generateRecordId('helpdesk', data); },
    generateImportBatchId(data = null) { return this.generateRecordId('importBatch', data); },
    generateImportStagingRowId(data = null) { return this.generateRecordId('importStagingRow', data); },
    generateImportRollbackLogId(data = null) { return this.generateRecordId('importRollbackLog', data); },
    generateAuthInviteId(data = null, reserved = new Set()) { return this.generateRecordId('authInvite', data, reserved); },
    generateDeploymentLogId(data = null) { return this.generateRecordId('deploymentLog', data); },
    generateDeploymentCheckpointId(data = null) { return this.generateRecordId('deploymentCheckpoint', data); },
    generateQaValidationRunId(data = null) { return this.generateRecordId('qaValidationRun', data); },
    generateTestLabRunId(data = null) { return this.generateRecordId('testLabRun', data); },
    generateOperationIncidentId(data = null) { return this.generateRecordId('operationIncident', data); },
    generateOperationMetricId(data = null) { return this.generateRecordId('operationMetric', data); },
    generateServiceErrorId(data = null) { return this.generateRecordId('serviceError', data); },

    normalizeText(value, fallback = '') {
        return String(value ?? fallback).trim().replace(/\s+/g, ' ');
    },

    normalizeDepartmentName(value, fallback = 'General') {
        const text = this.normalizeText(value, fallback);
        return text.split(' ').map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '').join(' ');
    },

    normalizeDesignationName(value, fallback = 'Employee') {
        return this.normalizeText(value, fallback);
    },

    normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    },

    normalizePhone(value) {
        return String(value || '').replace(/\D/g, '').slice(0, 15);
    },

    getEmployeeIdentityMap(data = null) {
        const d = data || this.get();
        const map = new Map();
        const add = (key, empId) => {
            const k = String(key || '').trim();
            if (k && empId && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), empId);
        };
        const nameCounts = {};
        (d.employees || []).forEach(e => {
            const name = String(e.name || '').trim().toLowerCase();
            if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
        });
        (d.employees || []).forEach(e => {
            const empId = e.id;
            [e.id, e.empId, e.employeeId, e.employeeCode, e.companyEmployeeCode, e.legacyEmpId, ...(e.legacyIds || [])].forEach(v => add(v, empId));
            add(e.email, empId);
            const name = String(e.name || '').trim();
            if (name && nameCounts[name.toLowerCase()] === 1) add(name, empId);
        });
        return map;
    },

    validateManagerId(managerId, data = null, employeeId = '') {
        if (!managerId) return '';
        const d = data || this.get();
        const resolved = this.resolveEmployeeId(managerId, d);
        const exists = (d.employees || []).some(e => e.id === resolved);
        if (!exists || (employeeId && resolved === employeeId)) return '';
        return resolved;
    },

    normalizeEmployeePayload(emp = {}, data = null) {
        const d = data || this.get();
        const safeEmployee = { ...emp };
        delete safeEmployee.password;
        const dept = this.normalizeDepartmentName(emp.dept || emp.department, 'General');
        const desig = this.normalizeDesignationName(emp.desig || emp.designation || emp.officialDesignation, 'Employee');
        const branch = this.normalizeText(emp.branch || emp.location || emp.workLocation, 'Head Office');
        const salary = Number(emp.salary || 0);
        const id = this.normalizeEmployeeIdText(emp.id || emp.empId || emp.employeeId || '');
        return {
            ...safeEmployee,
            authUserId: emp.authUserId || emp.auth_user_id || null,
            id: id || emp.id,
            empId: id || emp.empId || emp.id,
            employeeId: id || emp.employeeId || emp.id,
            name: this.normalizeText(emp.name || emp.fullName, ''),
            dept,
            department: dept,
            desig,
            designation: desig,
            officialDesignation: desig,
            branch,
            location: this.normalizeText(emp.location || branch, branch),
            email: this.normalizeEmail(emp.email),
            mobile: this.normalizePhone(emp.mobile || emp.phone),
            phone: this.normalizePhone(emp.phone || emp.mobile),
            salary,
            leaveBalance: emp.leaveBalance !== undefined ? Number(emp.leaveBalance) || 0 : Number(this.getCompanySettings?.().defaultAnnualLeaveDays || 20),
            shiftId: emp.shiftId || 'SH002',
            photo: emp.photo === undefined ? null : emp.photo,
            managerId: this.validateManagerId(emp.managerId, d, id) || null,
            employeeCode: emp.employeeCode || emp.companyEmployeeCode || id || '',
            companyEmployeeCode: emp.companyEmployeeCode || emp.employeeCode || id || '',
            accountabilityTier: salary >= 100000 ? 'High Accountability Resource' : 'Standard Accountability Resource',
            role: emp.role || 'employee',
            inviteStatus: emp.inviteStatus || emp.invitationStatus || 'Not Invited',
            invitationStatus: emp.invitationStatus || emp.inviteStatus || 'Not Invited',
            activationStatus: emp.activationStatus || (emp.authUserId || emp.auth_user_id ? 'Active' : 'Not Activated'),
            emailVerified: !!(emp.emailVerified || emp.emailVerifiedAt),
            emailVerifiedAt: emp.emailVerifiedAt || '',
            invitedAt: emp.invitedAt || emp.inviteSentAt || '',
            inviteSentAt: emp.inviteSentAt || emp.invitedAt || ''
        };
    },

    resolveEmployeeId(rawId, data = null) {
        if (rawId === null || rawId === undefined || rawId === '') return rawId;
        const id = String(rawId).trim();
        const d = data || this.get();
        const mapped = this.getEmployeeIdentityMap(d).get(id.toLowerCase());
        return mapped || id;
    },

    findDuplicateValues(rows = [], getter) {
        const seen = new Map();
        const duplicates = [];
        (rows || []).forEach(row => {
            const value = String(getter(row) || '').trim().toLowerCase();
            if (!value) return;
            if (!seen.has(value)) seen.set(value, []);
            seen.get(value).push(row);
        });
        seen.forEach(group => { if (group.length > 1) duplicates.push(group); });
        return duplicates;
    },

    detectDuplicateEmployees(data = null) {
        const d = data || this.get();
        const employees = d.employees || [];
        return {
            empIds: this.findDuplicateValues(employees, e => e.id),
            emails: this.findDuplicateValues(employees, e => e.email),
            phones: this.findDuplicateValues(employees, e => e.mobile || e.phone)
        };
    },

    detectDuplicateAttendanceDay(empId, date, data = null) {
        const d = data || this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.attendance || []).filter(a => a.empId === officialId && a.date === date);
    },

    detectDuplicatePayrollMonth(empId, month, data = null) {
        const d = data || this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.payroll || []).filter(p => p.empId === officialId && p.month === month);
    },

    getRelationshipAudit(data = null) {
        const d = data || this.get();
        const employeeIds = new Set((d.employees || []).map(e => e.id));
        const invalidManagers = (d.employees || [])
            .filter(e => e.managerId && !employeeIds.has(e.managerId))
            .map(e => ({ empId: e.id, managerId: e.managerId }));
        const brokenEmployeeLinks = [];
        ['attendance', 'leaveRequests', 'payroll', 'expenseClaims', 'performanceGoals', 'appraisals',
            'onboardingTasks', 'resignationRequests', 'exitInterviews', 'courseEnrollments', 'empTraining',
            'documentVerifications', 'attendanceRegularizations', 'helpdeskTickets', 'onboardingCollections',
            'strategicDeliverables', 'deliverableReviews'].forEach(table => {
            (d[table] || []).forEach(row => {
                if (row.empId && !employeeIds.has(row.empId)) brokenEmployeeLinks.push({ table, id: row.id || row.deliverableId || row.reviewId || '', empId: row.empId });
            });
        });
        return { invalidManagers, brokenEmployeeLinks, duplicateEmployees: this.detectDuplicateEmployees(d) };
    },

    normalizeDataArchitecture(d) {
        let changed = false;
        if (!Array.isArray(d.users)) d.users = [];
        if (!Array.isArray(d.employees)) d.employees = [];
        if (!Array.isArray(d.authInvites)) { d.authInvites = []; changed = true; }

        const seenUserIds = new Set();
        const seenUserKeys = new Set();
        d.users = d.users.filter(u => {
            const key = `${String(u.email || '').toLowerCase()}::${u.role || ''}`;
            if (seenUserKeys.has(key)) { changed = true; return false; }
            seenUserKeys.add(key);
            if (!u.id || seenUserIds.has(u.id)) {
                u.id = this.generateUserId(d);
                changed = true;
            }
            if (!u.authStatus) { u.authStatus = u.authUserId ? 'Supabase Linked' : 'Invite Required'; changed = true; }
            if (!u.inviteStatus) { u.inviteStatus = u.authUserId ? 'Activated' : 'Not Invited'; changed = true; }
            if (!u.activationStatus) { u.activationStatus = u.active ? 'Active' : 'Not Activated'; changed = true; }
            if (!u.authUserId && u.auth_user_id) { u.authUserId = u.auth_user_id; changed = true; }
            seenUserIds.add(u.id);
            return true;
        });

        const reserved = new Set();
        d.employees.forEach(e => {
            const oldId = this.normalizeEmployeeIdText(e.id || e.empId || e.employeeId || '');
            let nextId = oldId && this.isOfficialEmployeeId(oldId) && !reserved.has(oldId) ? oldId : this.generateEmployeeId(d, reserved);
            if (!oldId) {
                e.id = nextId;
                changed = true;
            } else if (oldId !== nextId) {
                e.legacyEmpId = e.legacyEmpId || oldId;
                e.legacyIds = Array.from(new Set([...(e.legacyIds || []), oldId].filter(Boolean)));
                e.id = nextId;
                changed = true;
            }
            reserved.add(e.id);
        });

        const normalizeEmployee = e => {
            const before = JSON.stringify(e);
            const normalized = this.normalizeEmployeePayload(e, d);
            Object.assign(e, normalized);
            e.employeeCode = e.employeeCode || e.id;
            e.companyEmployeeCode = e.companyEmployeeCode || e.employeeCode || e.id;
            if (e.legacyEmpId) e.legacyIds = Array.from(new Set([...(e.legacyIds || []), e.legacyEmpId]));
            if (!e.authStatus) { e.authStatus = e.authUserId ? 'Supabase Linked' : 'Invite Required'; changed = true; }
            if (!e.inviteStatus) { e.inviteStatus = e.authUserId ? 'Activated' : 'Not Invited'; changed = true; }
            if (!e.invitationStatus) { e.invitationStatus = e.inviteStatus; changed = true; }
            if (!e.activationStatus) { e.activationStatus = e.authUserId ? 'Active' : 'Not Activated'; changed = true; }
            if (!e.role) { e.role = 'employee'; changed = true; }
            if (e.managerId) {
                const managerId = this.validateManagerId(e.managerId, d, e.id);
                if (e.managerId !== managerId) { e.managerId = managerId || null; changed = true; }
            }
            if (JSON.stringify(e) !== before) changed = true;
        };
        d.employees.forEach(normalizeEmployee);

        const seenAuthInviteIds = new Set();
        d.authInvites.forEach(inv => {
            if (!inv.inviteId || seenAuthInviteIds.has(inv.inviteId)) { inv.inviteId = this.generateAuthInviteId(d, seenAuthInviteIds); changed = true; }
            seenAuthInviteIds.add(inv.inviteId);
            if (inv.empId) {
                const next = this.resolveEmployeeId(inv.empId, d);
                if (next !== inv.empId) { inv.empId = next; changed = true; }
            }
            if (!inv.status) { inv.status = inv.inviteStatus || 'Pending'; changed = true; }
            if (!inv.inviteStatus) { inv.inviteStatus = inv.status; changed = true; }
            if (!inv.createdAt) { inv.createdAt = new Date().toISOString(); changed = true; }
        });

        const normalizeEmpField = (row, field = 'empId') => {
            if (!row) return;
            if (row.employeeId && !row[field]) row[field] = row.employeeId;
            if (row[field]) {
                const next = this.resolveEmployeeId(row[field], d);
                if (next !== row[field]) { row[field] = next; changed = true; }
            }
            if (row.employeeId && row.employeeId !== row[field]) { row.employeeId = row[field]; changed = true; }
        };
        const empTables = ['attendance', 'leaveRequests', 'payroll', 'expenseClaims', 'performanceGoals', 'appraisals',
            'onboardingTasks', 'resignationRequests', 'exitInterviews', 'courseEnrollments', 'empTraining',
            'documentVerifications', 'attendanceRegularizations', 'helpdeskTickets', 'onboardingCollections',
            'strategicDeliverables', 'deliverableReviews'];
        empTables.forEach(table => {
            if (Array.isArray(d[table])) d[table].forEach(row => normalizeEmpField(row, 'empId'));
        });

        const attendanceIds = new Set();
        (d.attendance || []).forEach(row => {
            const currentId = row.attendanceId || (/^AT\d+$/i.test(String(row.id || '')) ? row.id : '');
            let nextId = currentId;
            if (!nextId || attendanceIds.has(nextId)) {
                nextId = this.generateRecordId('attendance', d, attendanceIds);
                changed = true;
            }
            if (row.attendanceId !== nextId) { row.attendanceId = nextId; changed = true; }
            if (!row.id) { row.id = nextId; changed = true; }
            if (!row.attendanceDate) { row.attendanceDate = row.date; changed = true; }
            if (!row.regularizationStatus) { row.regularizationStatus = 'None'; changed = true; }
            if (row.lateMinutes === undefined || row.lateMinutes === null) { row.lateMinutes = 0; changed = true; }
            attendanceIds.add(nextId);
        });

        const leaveIds = new Set();
        (d.leaveRequests || []).forEach((row, idx) => {
            const currentId = row.leaveId || row.id || '';
            let nextId = currentId;
            if (!nextId || leaveIds.has(nextId)) {
                nextId = this.generateRecordId('leave', d, leaveIds);
                changed = true;
            }
            const normalized = this._normalizeLeaveRecord({ ...row, id: nextId, leaveId: nextId }, d);
            if (JSON.stringify(row) !== JSON.stringify(normalized)) {
                d.leaveRequests[idx] = normalized;
                changed = true;
            }
            leaveIds.add(nextId);
        });

        (d.strategicDeliverables || []).forEach(row => {
            if (row.managerId) {
                const next = this.validateManagerId(row.managerId, d, row.empId);
                if (next !== row.managerId) { row.managerId = next; changed = true; }
            }
        });
        (d.deliverableReviews || []).forEach(row => {
            if (row.managerId) {
                const next = this.validateManagerId(row.managerId, d, row.empId);
                if (next !== row.managerId) { row.managerId = next; changed = true; }
            }
        });
        (d.users || []).forEach(u => {
            if (u.empId) {
                const next = this.resolveEmployeeId(u.empId, d);
                if (next !== u.empId) { u.empId = next; changed = true; }
            }
        });
        (d.teams || []).forEach(t => {
            if (t.managerId) {
                const next = this.validateManagerId(t.managerId, d);
                if (next !== t.managerId) { t.managerId = next; changed = true; }
            }
            const employeeIds = new Set((d.employees || []).map(e => e.id));
            const members = Array.from(new Set((t.memberIds || []).map(id => this.resolveEmployeeId(id, d)).filter(id => employeeIds.has(id))));
            if (JSON.stringify(members) !== JSON.stringify(t.memberIds || [])) { t.memberIds = members; changed = true; }
            members.forEach(empId => {
                const emp = d.employees.find(e => e.id === empId);
                if (emp && empId !== t.managerId && !emp.managerId) { emp.managerId = t.managerId; changed = true; }
            });
        });
        (d.documents || []).forEach(doc => {
            const roleTargets = ['ALL', 'HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE'];
            ['assignedTo', 'uploadedBy'].forEach(field => {
                if (doc[field] && !roleTargets.includes(this.normalizeRoleTarget(doc[field]))) {
                    const next = this.resolveEmployeeId(doc[field], d);
                    if (next !== doc[field]) { doc[field] = next; changed = true; }
                }
            });
        });
        (d.notifications || []).forEach(n => {
            const roleTargets = ['ALL', 'HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE'];
            const normalizeTarget = value => {
                const role = this.normalizeRoleTarget(value);
                if (!value || roleTargets.includes(role)) return role || value;
                return this.resolveEmployeeId(value, d);
            };
            if (Array.isArray(n.to)) {
                const next = n.to.map(normalizeTarget);
                if (JSON.stringify(next) !== JSON.stringify(n.to)) { n.to = next; changed = true; }
            } else {
                const next = normalizeTarget(n.to);
                if (next !== n.to) { n.to = next; changed = true; }
            }
            if (Array.isArray(n.readBy)) {
                const nextReadBy = n.readBy.map(normalizeTarget);
                if (JSON.stringify(nextReadBy) !== JSON.stringify(n.readBy)) { n.readBy = nextReadBy; changed = true; }
            }
        });
        if (d.roster && typeof d.roster === 'object' && !Array.isArray(d.roster)) {
            const nextRoster = {};
            Object.entries(d.roster).forEach(([empId, value]) => {
                const next = this.resolveEmployeeId(empId, d);
                nextRoster[next] = { ...(nextRoster[next] || {}), ...(value || {}) };
            });
            if (JSON.stringify(nextRoster) !== JSON.stringify(d.roster)) { d.roster = nextRoster; changed = true; }
        }
        return changed;
    },

    normalizeRoleTarget(role) {
        const raw = String(role || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (!raw) return '';
        if (raw === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (raw === 'PLATFORMOWNER' || raw === 'OWNER' || raw === 'ROOT') return 'PLATFORM_OWNER';
        if (raw === 'EMP') return 'EMPLOYEE';
        if (raw === 'ALL') return 'ALL';
        return raw;
    },

    _notificationTargets(notif = {}) {
        const targets = new Set();
        const add = value => {
            if (value === null || value === undefined || value === '') return;
            const raw = String(value).trim();
            const role = this.normalizeRoleTarget(raw);
            if (['ALL', 'HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE'].includes(role)) targets.add(role);
            else targets.add(raw);
        };
        if (Array.isArray(notif.to)) notif.to.forEach(add);
        else add(notif.to);
        add(notif.toRole);
        add(notif.toEmpId);
        return targets;
    },

    _sortNotifications(rows = []) {
        return [...rows].sort((a, b) =>
            (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '') ||
            String(b.id || '').localeCompare(String(a.id || ''))
        );
    },

    _pushNotification(data, toRole, toEmpId, title, message, module = 'General', type = 'info') {
        if (!data.notifications) data.notifications = [];
        const roleKey = this.normalizeRoleTarget(toRole);
        const empId = toEmpId ? this.resolveEmployeeId(toEmpId, data) : '';
        const target = empId || roleKey || 'ALL';
        const row = {
            id: this.generateNotificationId(data),
            readBy: [],
            to: target,
            toRole: empId ? '' : target,
            toEmpId: empId || '',
            title: title || 'Notification',
            msg: message || '',
            message: message || '',
            module: module || 'General',
            date: this.today(),
            createdAt: new Date().toISOString(),
            type: type || 'info'
        };
        data.notifications.unshift(row);
        if (data.notifications.length > 500) data.notifications = data.notifications.slice(0, 500);
        return row;
    },

    pushNotification(toRole, toEmpId, title, message, module = 'General') {
        const d = this.get();
        const row = this._pushNotification(d, toRole, toEmpId, title, message, module, 'info');
        this.save(d);
        return row;
    },

    getNotificationsByRole(role) {
        const roleKey = this.normalizeRoleTarget(role);
        return this._sortNotifications((this.get().notifications || []).filter(n => {
            const targets = this._notificationTargets(n);
            return targets.has('ALL') || targets.has(roleKey);
        }));
    },

    getNotificationsByEmp(empId) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return this._sortNotifications((d.notifications || []).filter(n => {
            const targets = this._notificationTargets(n);
            return targets.has('ALL') || targets.has(officialId);
        }));
    },

    markNotificationRead(notifId, target = '') {
        const d = this.get();
        const notif = (d.notifications || []).find(n => n.id === notifId);
        if (!notif) return false;
        const roleKey = this.normalizeRoleTarget(target);
            const readTarget = ['ALL', 'HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE'].includes(roleKey)
            ? roleKey
            : this.resolveEmployeeId(target || 'ALL', d);
        if (!notif.readBy) notif.readBy = [];
        if (!notif.readBy.includes(readTarget)) notif.readBy.push(readTarget);
        this.save(d);
        return true;
    },

    getUnreadNotificationCount(target) {
        const roleKey = this.normalizeRoleTarget(target);
        const normalizedTarget = ['HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE', 'ALL'].includes(roleKey)
            ? roleKey
            : this.resolveEmployeeId(target);
        const rows = ['HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE', 'ALL'].includes(normalizedTarget)
            ? this.getNotificationsByRole(normalizedTarget)
            : this.getNotificationsByEmp(normalizedTarget);
        return rows.filter(n => !(n.readBy || []).includes(normalizedTarget)).length;
    },

    _appendAudit(data, userRole, action, description, module = 'General', targetId = '', actorId = '') {
        if (!data.auditLogs) data.auditLogs = [];
        const nextNo = data.auditLogs.reduce((max, log) => Math.max(max, Number(String(log.id || log.logId || '').replace(/\D/g, '')) || 0), 0) + 1;
        data.auditLogs.unshift({
            id: 'AL' + String(nextNo).padStart(4, '0'),
            date: new Date().toISOString(),
            userRole: userRole || 'system',
            actorRole: userRole || 'system',
            actorId: actorId || '',
            action: action || 'System Activity',
            actionType: action || 'System Activity',
            module: module || 'General',
            targetId: targetId || '',
            description: description || ''
        });
        if (data.auditLogs.length > 500) data.auditLogs = data.auditLogs.slice(0, 500);
    },

    logAudit(userRole, action, description) {
        return this.writeAuditLog(userRole, '', action, 'General', '', description);
    },

    writeAuditLog(actorRole, actorId, actionType, module, targetId, description) {
        const d = this.get();
        const resolvedActorId = actorId ? this.resolveEmployeeId(actorId, d) : '';
        this._appendAudit(d, actorRole, actionType, description, module, targetId, resolvedActorId);
        this.save(d);
        return d.auditLogs[0];
    },

    _emitWorkflowEvent(type, payload = {}) {
        const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
        if (!root.workflowEngine || typeof root.workflowEngine.emitWorkflowEvent !== 'function') return null;
        return root.workflowEngine.emitWorkflowEvent(type, {
            suppressNotification: true,
            suppressAudit: true,
            ...payload
        });
    },

    getAuditLogs(module = '') {
        let rows = this.get().auditLogs || [];
        if (module) rows = rows.filter(l => String(l.module || '').toLowerCase() === String(module).toLowerCase());
        return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
    },

    getCompanySettings() {
        const d = this.get();
        return d.companySettings || {
            companyName: d.settings?.companyName || '',
            companyLogoUrl: '',
            timezone: d.settings?.timezone || 'Asia/Kolkata',
            currency: d.settings?.currency || 'INR',
            monthlyPayrollDate: 30,
            defaultAnnualLeaveDays: 20,
            attendanceGraceMinutes: 15,
            workWeekPattern: 'Monday to Friday'
        };
    },

    saveCompanySettings(settings = {}) {
        const d = this.get();
        const current = d.companySettings || this.getCompanySettings();
        d.companySettings = {
            ...current,
            ...settings,
            monthlyPayrollDate: Number(settings.monthlyPayrollDate || current.monthlyPayrollDate || 30),
            defaultAnnualLeaveDays: Number(settings.defaultAnnualLeaveDays || current.defaultAnnualLeaveDays || 20),
            attendanceGraceMinutes: Number(settings.attendanceGraceMinutes || current.attendanceGraceMinutes || 15)
        };
        d.settings = { ...(d.settings || {}), companyName: d.companySettings.companyName, timezone: d.companySettings.timezone, currency: d.companySettings.currency };
        this._appendAudit(d, 'super_admin', 'settings changed', 'Company policy settings updated');
        this.save(d);
        return d.companySettings;
    },

    getRolePermissions() {
        return this.get().rolePermissions || {};
    },

    saveRolePermissions(permissions = {}) {
        const d = this.get();
        d.rolePermissions = { ...(d.rolePermissions || {}), ...permissions };
        this._appendAudit(d, 'super_admin', 'settings changed', 'Role access permissions updated');
        this.save(d);
        return d.rolePermissions;
    },

    isSetupRequired(data = null) {
        const d = data || this.get();
        const install = this._mergeInstallState(d.installState || {});
        return !install.setupCompleted;
    },

    enforceProductionMode(d) {
        const changed = this.stripLocalAuthCredentials(d);
        d.installState = {
            ...(d.installState || {}),
            productionMode: true,
            pilotMode: false,
            developmentMode: false,
            demoMode: false,
            environmentMode: 'PRODUCTION',
            demoCredentialsDisabled: true
        };
        return changed;
    },

    getInstallState() {
        const d = this.get();
        if (this._ensureInstallState(d)) this.save(d);
        return d.installState;
    },

    getInstallHealth() {
        const d = this.get();
        const hasPlatformOwner = (d.users || []).some(u => u.role === 'platform_owner');
        const setupRequired = this.isSetupRequired(d);
        return {
            productionMode: this.isProductionMode(),
            pilotMode: this.isPilotMode(),
            developmentMode: this.isDevelopmentMode(),
            demoMode: this.isDemoMode(),
            environmentMode: this.getEnvironmentMode(),
            setupCompleted: !setupRequired,
            setupRequired,
            hasPlatformOwner,
            employeeCount: (d.employees || []).length,
            userCount: (d.users || []).length,
            demoPasswordUsers: 0,
            localAuthAllowed: false,
            inviteEndpointConfigured: !!(
                ((typeof globalThis !== 'undefined' && globalThis.ARTHHRMS_CONFIG) || {}).INVITE_USER_ENDPOINT ||
                ((typeof globalThis !== 'undefined' && globalThis.supabaseClientService?.readConfig?.().INVITE_USER_ENDPOINT) || '')
            )
        };
    },

    completeInitialSetup(payload = {}) {
        const d = this.get();
        if (!this.isSetupRequired(d)) {
            return { ok: false, error: 'Initial setup is already complete.' };
        }
        const company = payload.company || {};
        const owner = payload.platformOwner || {};
        const initialUser = payload.initialUser || {};
        const ownerEmail = this.normalizeEmail(owner.email);
        const initialEmail = this.normalizeEmail(initialUser.email);
        const ownerAuthUserId = String(owner.authUserId || owner.auth_user_id || '').trim();
        const ownerRole = String(owner.role || '').trim().toLowerCase();
        if (!company.companyName || !owner.name || !ownerEmail || !ownerAuthUserId) {
            return { ok: false, error: 'Company and authenticated platform owner identity are required.' };
        }
        if (ownerRole !== 'platform_owner' || owner.source !== 'supabase' || owner.roleTrusted !== true) {
            return { ok: false, error: 'Initial setup requires a server-validated Platform Owner session.' };
        }
        if ((d.users || []).some(u => u.role === 'platform_owner')) {
            return { ok: false, error: 'Platform owner already exists.' };
        }

        d.companySettings = {
            ...(d.companySettings || {}),
            companyName: company.companyName,
            companyLogoUrl: company.logoUrl || '',
            timezone: company.timezone || 'Asia/Kolkata',
            currency: company.currency || d.companySettings?.currency || 'INR'
        };
        d.settings = {
            ...(d.settings || {}),
            companyName: d.companySettings.companyName,
            timezone: d.companySettings.timezone,
            currency: d.companySettings.currency
        };
        d.platformGovernance = this._mergePlatformGovernance({
            ...(d.platformGovernance || {}),
            branding: {
                ...(d.platformGovernance?.branding || {}),
                platformName: 'ARTHHRMS',
                companyName: company.companyName,
                logoUrl: company.logoUrl || '',
                identityLabel: 'Platform Control Center'
            },
            updatedBy: owner.name,
            updatedAt: new Date().toISOString()
        });
        d.users = d.users || [];
        const ownerUser = {
            id: 'USR000',
            name: owner.name,
            email: ownerEmail,
            role: 'platform_owner',
            empId: null,
            authUserId: ownerAuthUserId,
            active: true,
            authStatus: 'Supabase Linked',
            inviteStatus: 'Activated',
            activationStatus: 'Active',
            createdAt: new Date().toISOString()
        };
        d.users.unshift(ownerUser);

        let createdInitialUser = null;
        if (initialEmail && initialUser.name && initialUser.role) {
            const role = ['hr', 'admin', 'super_admin'].includes(initialUser.role) ? initialUser.role : 'hr';
            d.authInvites = d.authInvites || [];
            const inviteId = this.generateAuthInviteId(d);
            createdInitialUser = {
                inviteId,
                id: inviteId,
                name: initialUser.name,
                email: initialEmail,
                role,
                empId: null,
                status: 'Secure Onboarding Required',
                inviteStatus: 'Secure Onboarding Required',
                activationStatus: 'Not Activated',
                redirectTo: 'auth-callback.html',
                invitedBy: ownerUser.id,
                invitedByRole: 'platform_owner',
                createdAt: new Date().toISOString(),
                failureReason: 'A server-side authenticated invitation is required before this account exists.'
            };
            d.authInvites.unshift(createdInitialUser);
        }

        d.installState = {
            ...this._mergeInstallState(d.installState || {}),
            setupCompleted: true,
            status: 'Installed',
            companyEmail: company.companyEmail || '',
            completedAt: new Date().toISOString(),
            completedBy: ownerEmail,
            demoCredentialsDisabled: this.isProductionMode() && !this.isDevelopmentMode()
        };
        this._appendAudit(d, 'platform_owner', 'initial setup completed', `Initial setup completed for ${company.companyName}`, 'Installation', 'initial-setup', ownerUser.id);
        this._appendAudit(d, 'platform_owner', 'platform owner created', `Platform owner created: ${ownerEmail}`, 'Security', ownerUser.id, ownerUser.id);
        if (createdInitialUser) this._appendAudit(d, 'platform_owner', 'initial ops onboarding staged', `${createdInitialUser.role} secure onboarding required: ${createdInitialUser.email}`, 'Security', createdInitialUser.id, ownerUser.id);
        this.save(d);
        return { ok: true, ownerUser, initialUser: createdInitialUser, installState: d.installState };
    },

    _platformActor(actor = {}) {
        if (typeof actor === 'string') return { role: '', id: '', name: actor, source: '', roleTrusted: false };
        return {
            role: actor.role || actor.actorRole || '',
            id: actor.id || actor.actorId || actor.userId || '',
            name: actor.name || actor.email || actor.id || '',
            source: actor.source || '',
            roleTrusted: actor.roleTrusted === true
        };
    },

    _snapshotPlatformGovernance(current = {}, actor = {}, reason = 'configuration change') {
        const clean = JSON.parse(JSON.stringify(current || {}));
        clean.rollbackSnapshots = [];
        return {
            snapshotId: 'PGS' + Date.now(),
            createdAt: new Date().toISOString(),
            createdBy: actor.name || actor.id || 'Platform Owner',
            reason,
            config: clean
        };
    },

    getPlatformGovernance() {
        const d = this.get();
        if (this._ensurePlatformGovernance(d)) this.save(d);
        return d.platformGovernance;
    },

    getFeatureFlags() {
        return this.getPlatformGovernance().features || {};
    },

    getPlatformFeature(featureKey) {
        return this.getFeatureFlags()[featureKey] || null;
    },

    savePlatformGovernance(config = {}, actorInput = {}, reason = 'platform configuration updated') {
        const d = this.get();
        this._ensurePlatformGovernance(d);
        const actor = this._platformActor(actorInput);
        if (String(actor.role || '').replace(/[\s-]+/g, '_').toLowerCase() !== 'platform_owner' || !actor.id || actor.source !== 'supabase' || actor.roleTrusted !== true) {
            throw new Error('A trusted Platform Owner session is required to change platform governance.');
        }
        const current = this._mergePlatformGovernance(d.platformGovernance);
        const snapshot = this._snapshotPlatformGovernance(current, actor, reason);
        const next = this._mergePlatformGovernance({
            ...current,
            ...config,
            branding: { ...(current.branding || {}), ...(config.branding || {}) },
            features: { ...(current.features || {}), ...(config.features || {}) },
            rollbackSnapshots: [snapshot, ...(current.rollbackSnapshots || [])].slice(0, 5),
            updatedAt: new Date().toISOString(),
            updatedBy: actor.name
        });
        d.platformGovernance = next;
        if (config.branding) {
            d.companySettings = {
                ...(d.companySettings || {}),
                companyName: next.branding.companyName || d.companySettings?.companyName || 'ArthHRMS',
                companyLogoUrl: next.branding.logoUrl || d.companySettings?.companyLogoUrl || ''
            };
            d.settings = {
                ...(d.settings || {}),
                companyName: d.companySettings.companyName
            };
        }
        this._appendAudit(d, actor.role, 'platform governance changed', reason, 'Platform Governance', 'platformGovernance', actor.id);
        this.save(d);
        return next;
    },

    applyPlatformPreset(preset = 'STANDARD_COMPANY', actorInput = {}) {
        const normalized = String(preset || 'STANDARD_COMPANY').trim().toUpperCase();
        const base = normalized === 'STANDARD_COMPANY'
            ? this.getDefaultFeatureFlags()
            : JSON.parse(JSON.stringify(this.getPlatformGovernance().features || this.getDefaultFeatureFlags()));
        const disable = keys => keys.forEach(key => {
            if (base[key]) {
                base[key].enabled = false;
                base[key].emergencyDisabled = false;
            }
        });
        const enable = keys => keys.forEach(key => {
            if (base[key]) {
                base[key].enabled = true;
                base[key].emergencyDisabled = false;
            }
        });
        if (normalized === 'SMALL_BUSINESS') {
            enable(['employees', 'attendance', 'attendanceRegularization', 'leave', 'payroll', 'expenseClaims', 'lifecycle', 'training', 'documents', 'documentVerification', 'helpdesk', 'notifications', 'reports', 'companySettings', 'rolePermissions', 'auditLogs', 'broadcast', 'userManagement', 'teamManagement', 'tasks', 'systemSettings']);
            disable(['recruitment', 'strategicDeliverables', 'performance', 'appraisal', 'imports', 'whatsapp', 'aiInsights']);
        } else if (normalized === 'ENTERPRISE_MODE') {
            Object.keys(base).forEach(key => {
                base[key].enabled = key !== 'aiInsights' ? true : !!base[key].enabled;
                base[key].emergencyDisabled = false;
            });
        }
        return this.savePlatformGovernance({ preset: normalized, features: base }, actorInput, `Platform preset applied: ${normalized}`);
    },

    setFeatureFlag(featureKey, updates = {}, actorInput = {}, reason = '') {
        const d = this.get();
        this._ensurePlatformGovernance(d);
        const current = this._mergePlatformGovernance(d.platformGovernance);
        const feature = current.features[featureKey] || {
            key: featureKey,
            label: featureKey,
            enabled: true,
            experimental: false,
            emergencyDisabled: false,
            roles: { platform_owner: true }
        };
        current.features[featureKey] = {
            ...feature,
            ...updates,
            roles: { ...(feature.roles || {}), ...(updates.roles || {}) }
        };
        return this.savePlatformGovernance({ features: current.features }, actorInput, reason || `Feature flag changed: ${featureKey}`);
    },

    setFeatureRoleAccess(featureKey, role, allowed, actorInput = {}) {
        const normalizedRole = String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        const currentFeature = this.getPlatformFeature(featureKey) || { key: featureKey, label: featureKey, enabled: true, roles: {} };
        const roles = { ...(currentFeature.roles || {}), [normalizedRole]: !!allowed };
        if (normalizedRole !== 'platform_owner') roles.platform_owner = true;
        return this.setFeatureFlag(featureKey, { roles }, actorInput, `Role access changed: ${featureKey} / ${normalizedRole} = ${!!allowed}`);
    },

    canAccessFeature(featureKey, role = '') {
        if (!featureKey) return true;
        const normalizedRole = String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        const governance = this.getPlatformGovernance();
        const feature = (governance.features || {})[featureKey];
        if (!feature) return true;
        if (normalizedRole === 'platform_owner') return true;
        if (governance.maintenanceMode || governance.emergencyDisabled || governance.safeMode) return false;
        if (feature.enabled === false || feature.emergencyDisabled) return false;
        return feature.roles ? feature.roles[normalizedRole] !== false && !!feature.roles[normalizedRole] : true;
    },

    rollbackPlatformGovernance(snapshotId, actorInput = {}) {
        const current = this.getPlatformGovernance();
        const snapshot = (current.rollbackSnapshots || []).find(s => s.snapshotId === snapshotId);
        if (!snapshot || !snapshot.config) return null;
        const restored = this._mergePlatformGovernance({
            ...snapshot.config,
            rollbackSnapshots: current.rollbackSnapshots || [],
            updatedAt: new Date().toISOString()
        });
        return this.savePlatformGovernance(restored, actorInput, `Platform governance rolled back to ${snapshotId}`);
    },

    sendBroadcastNotice(title, message, priority = 'Normal') {
        const d = this.get();
        const notice = this._pushNotification(d, 'ALL', '', title || 'Organization Notice', message || '', 'Broadcast', priority === 'Urgent' ? 'warn' : 'info');
        notice.priority = priority;
        this._appendAudit(d, 'super_admin', 'broadcast sent', `${priority} notice published: ${notice.title}`, 'Broadcast', notice.id);
        this.save(d);
        return notice;
    },
    
    // ==================== USER FUNCTIONS ====================
    
    getUsers() { 
        return this.get().users || []; 
    },
    
    getUser(id) { 
        return this.get().users.find(u => u.id === id); 
    },
    
    addUser(u) {
        const d = this.get();
        if (!d.users) d.users = [];
        const safeUser = { ...u };
        delete safeUser.password;
        const active = u.active === undefined ? false : !!u.active;
        const row = {
            ...safeUser,
            id: u.id && !(d.users || []).some(x => x.id === u.id) ? u.id : this.generateUserId(d),
            empId: u.empId ? this.resolveEmployeeId(u.empId, d) : (u.empId || null),
            authStatus: u.authStatus || (u.authUserId ? 'Supabase Linked' : 'Invite Required'),
            inviteStatus: u.inviteStatus || 'Not Invited',
            activationStatus: u.activationStatus || (active ? 'Active' : 'Not Activated'),
            active,
            lifecycleStatus: u.lifecycleStatus || (active ? 'Active' : 'Invite Pending')
        };
        d.users.push(row);
        this.save(d);
        return row;
    },
    
    updateUser(id, fields) {
        const d = this.get();
        const i = (d.users || []).findIndex(u => u.id === id);
        if (i > -1) {
            const safeFields = { ...fields };
            delete safeFields.password;
            if (safeFields.empId) safeFields.empId = this.resolveEmployeeId(safeFields.empId, d);
            d.users[i] = { ...d.users[i], ...safeFields };
            if (d.users[i].auth_user_id && !d.users[i].authUserId) d.users[i].authUserId = d.users[i].auth_user_id;
            this.save(d);
            return true;
        }
        return false;
    },
    
    deleteUser(id) {
        return this.suspendUser(id, 'Soft delete requested');
    },

    suspendUser(id, reason = 'Suspended') {
        const d = this.get();
        const idx = (d.users || []).findIndex(u => u.id === id);
        if (idx < 0) return false;
        d.users[idx] = {
            ...d.users[idx],
            active: false,
            lifecycleStatus: 'Suspended',
            activationStatus: 'Suspended',
            inviteStatus: 'Suspended',
            authStatus: 'Suspended',
            suspendedAt: new Date().toISOString(),
            suspensionReason: reason
        };
        if (d.users[idx].empId) {
            const emp = (d.employees || []).find(e => e.id === this.resolveEmployeeId(d.users[idx].empId, d));
            if (emp) {
                emp.activationStatus = 'Suspended';
                emp.inviteStatus = 'Suspended';
                emp.authStatus = 'Suspended';
            }
        }
        this._appendAudit(d, 'super_admin', 'user suspended', `User suspended: ${d.users[idx].email}`, 'Auth', id);
        this.save(d);
        return true;
    },
    
    // ==================== EMPLOYEE FUNCTIONS ====================
    
    getEmployees() { 
        return this.get().employees || []; 
    },
    
    getEmployee(id) { 
        const d = this.get();
        const officialId = this.resolveEmployeeId(id, d);
        return (d.employees || []).find(e => e.id === officialId) || null; 
    },
    
    addEmployee(emp) {
        const d = this.get();
        const proposedId = this.normalizeEmployeeIdText(emp.id || emp.empId || emp.employeeId || emp.employeeCode || '');
        const officialId = proposedId && this.isOfficialEmployeeId(proposedId) && !d.employees.some(e => e.id === proposedId)
            ? proposedId
            : this.generateEmployeeId(d);
        const row = this.normalizeEmployeePayload({ ...emp, id: officialId }, d);
        row.id = officialId;
        row.empId = officialId;
        row.employeeId = officialId;
        row.employeeCode = row.employeeCode || (proposedId && !this.isOfficialEmployeeId(proposedId) ? proposedId : officialId);
        row.companyEmployeeCode = row.companyEmployeeCode || row.employeeCode;
        row.authStatus = row.authStatus || 'Invite Required';
        row.inviteStatus = row.inviteStatus || 'Not Invited';
        row.invitationStatus = row.invitationStatus || row.inviteStatus;
        row.activationStatus = row.activationStatus || 'Not Activated';
        if (proposedId && proposedId !== officialId) {
            row.legacyEmpId = proposedId;
            row.legacyIds = Array.from(new Set([...(row.legacyIds || []), proposedId]));
        }
        d.employees.push(row);
        this._appendAudit(d, 'hr', 'employee created', `Employee created: ${row.name} (${row.id})`);
        this.save(d);
        return row;
    },
    
    updateEmployee(id, fields) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(id, d);
        const i = d.employees.findIndex(e => e.id === officialId);
        if (i > -1) {
            const before = { ...d.employees[i] };
            const merged = this.normalizeEmployeePayload({ ...d.employees[i], ...fields, id: d.employees[i].id }, d);
            d.employees[i] = { ...d.employees[i], ...merged, id: d.employees[i].id };
            this._appendAudit(d, 'hr', 'employee updated', `Employee updated: ${d.employees[i].name} (${d.employees[i].id})`, 'Employee Master', d.employees[i].id);
            if (before.authUserId !== d.employees[i].authUserId) {
                this._appendAudit(d, 'hr', 'employee auth mapping changed', `Auth user mapping changed for ${d.employees[i].id}`, 'Security', d.employees[i].id);
            }
            this.save(d);
            return true;
        }
        return false;
    },

    // ==================== AUTH INVITATION FUNCTIONS ====================

    getAuthInvites() {
        return this.get().authInvites || [];
    },

    getAuthInvite(inviteId) {
        return (this.get().authInvites || []).find(i => i.inviteId === inviteId || i.id === inviteId) || null;
    },

    getAuthInvitesByEmployee(empId) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.authInvites || []).filter(i => i.empId === officialId);
    },

    getLatestAuthInviteForEmployee(empId) {
        return this.getAuthInvitesByEmployee(empId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
    },

    getLatestAuthInviteByEmail(email) {
        const target = this.normalizeEmail(email);
        return (this.get().authInvites || [])
            .filter(i => this.normalizeEmail(i.email) === target)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
    },

    findUserByEmail(email) {
        const target = this.normalizeEmail(email);
        return (this.get().users || []).find(u => this.normalizeEmail(u.email) === target) || null;
    },

    findEmployeeByEmail(email) {
        const target = this.normalizeEmail(email);
        return (this.get().employees || []).find(e => this.normalizeEmail(e.email) === target) || null;
    },

    createAuthInvite(payload = {}) {
        const d = this.get();
        if (!Array.isArray(d.authInvites)) d.authInvites = [];
        const empId = payload.empId ? this.resolveEmployeeId(payload.empId, d) : '';
        const now = new Date().toISOString();
        const inviteId = payload.inviteId || this.generateAuthInviteId(d);
        const row = {
            inviteId,
            id: inviteId,
            empId,
            email: this.normalizeEmail(payload.email),
            role: payload.role || 'employee',
            name: payload.name || (empId ? this.getEmployee(empId)?.name : '') || '',
            status: payload.status || 'Pending',
            inviteStatus: payload.inviteStatus || payload.status || 'Pending',
            activationStatus: payload.activationStatus || 'Invite Pending',
            authUserId: payload.authUserId || payload.auth_user_id || '',
            redirectTo: payload.redirectTo || '',
            invitedBy: payload.invitedBy || '',
            invitedByRole: payload.invitedByRole || 'system',
            sentAt: payload.sentAt || '',
            acceptedAt: payload.acceptedAt || '',
            emailVerifiedAt: payload.emailVerifiedAt || '',
            failureReason: payload.failureReason || '',
            createdAt: payload.createdAt || now,
            updatedAt: now
        };
        row.id = row.inviteId;
        d.authInvites.unshift(row);
        if (empId) {
            const empIdx = d.employees.findIndex(e => e.id === empId);
            if (empIdx > -1) {
                d.employees[empIdx].inviteStatus = row.inviteStatus;
                d.employees[empIdx].invitationStatus = row.inviteStatus;
                d.employees[empIdx].activationStatus = row.activationStatus;
                d.employees[empIdx].authStatus = row.authUserId ? 'Supabase Linked' : 'Invite Pending';
                d.employees[empIdx].invitedAt = row.sentAt || row.createdAt;
                d.employees[empIdx].inviteSentAt = row.sentAt || row.createdAt;
                if (row.authUserId) d.employees[empIdx].authUserId = row.authUserId;
            }
        }
        const existingUser = row.email ? (d.users || []).find(u => this.normalizeEmail(u.email) === row.email) : null;
        if (existingUser) {
            existingUser.role = row.role || existingUser.role;
            existingUser.empId = empId || existingUser.empId || null;
            existingUser.inviteStatus = row.inviteStatus;
            existingUser.activationStatus = row.activationStatus;
            existingUser.authStatus = row.authUserId ? 'Supabase Linked' : 'Invite Pending';
            existingUser.lifecycleStatus = row.activationStatus || existingUser.lifecycleStatus || 'Invite Pending';
            if (row.authUserId) existingUser.authUserId = row.authUserId;
        } else if (row.email) {
            d.users.push({
                id: this.generateUserId(d),
                name: row.name || row.email,
                email: row.email,
                role: row.role || 'employee',
                empId: empId || null,
                active: false,
                authStatus: row.authUserId ? 'Supabase Linked' : 'Invite Pending',
                inviteStatus: row.inviteStatus,
                activationStatus: row.activationStatus,
                lifecycleStatus: row.activationStatus || 'Invite Pending',
                authUserId: row.authUserId || ''
            });
        }
        this._appendAudit(d, row.invitedByRole || 'system', 'auth invite created', `Invite created for ${row.email || empId}`, 'Auth Invite', row.inviteId, row.invitedBy);
        this.save(d);
        return row;
    },

    updateAuthInvite(inviteId, fields = {}) {
        const d = this.get();
        const idx = (d.authInvites || []).findIndex(i => i.inviteId === inviteId || i.id === inviteId);
        if (idx < 0) return null;
        const row = { ...d.authInvites[idx], ...fields, updatedAt: new Date().toISOString() };
        row.inviteStatus = row.inviteStatus || row.status;
        row.status = row.status || row.inviteStatus;
        d.authInvites[idx] = row;
        if (row.empId) {
            const empIdx = d.employees.findIndex(e => e.id === row.empId);
            if (empIdx > -1) {
                d.employees[empIdx].inviteStatus = row.inviteStatus || row.status;
                d.employees[empIdx].invitationStatus = row.inviteStatus || row.status;
                d.employees[empIdx].activationStatus = row.activationStatus || d.employees[empIdx].activationStatus;
                if (row.authUserId) d.employees[empIdx].authUserId = row.authUserId;
                if (row.emailVerifiedAt) d.employees[empIdx].emailVerifiedAt = row.emailVerifiedAt;
                d.employees[empIdx].authStatus = row.authUserId ? 'Supabase Linked' : (row.activationStatus || d.employees[empIdx].authStatus);
            }
        }
        const user = row.email ? (d.users || []).find(u => this.normalizeEmail(u.email) === row.email) : null;
        if (user) {
            user.inviteStatus = row.inviteStatus || row.status;
            user.activationStatus = row.activationStatus || user.activationStatus;
            if (row.authUserId) user.authUserId = row.authUserId;
            if (row.activationStatus === 'Active') user.active = true;
            if (row.activationStatus === 'Suspended') user.active = false;
            user.lifecycleStatus = row.activationStatus || user.lifecycleStatus;
        }
        this._appendAudit(d, row.invitedByRole || 'system', 'auth invite updated', `Invite updated for ${row.email || row.empId}: ${row.activationStatus || row.inviteStatus}`, 'Auth Invite', row.inviteId, row.invitedBy);
        this.save(d);
        return row;
    },

    linkAuthUserToEmployee(empId, authUserId, status = 'Active') {
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        if (!officialId || !authUserId) return { ok: false, error: 'Employee ID and auth user ID are required' };
        const duplicate = (d.employees || []).find(e => e.authUserId === authUserId && e.id !== officialId);
        if (duplicate) return { ok: false, error: `Auth user already linked to ${duplicate.id}` };
        const emp = (d.employees || []).find(e => e.id === officialId);
        if (!emp) return { ok: false, error: 'Employee not found' };
        emp.authUserId = authUserId;
        emp.authStatus = 'Supabase Linked';
        emp.activationStatus = status;
        emp.inviteStatus = status === 'Active' ? 'Activated' : (status === 'Invite Sent' ? 'Invite Sent' : (emp.inviteStatus || 'Invite Sent'));
        const user = (d.users || []).find(u => u.empId === officialId || this.normalizeEmail(u.email) === this.normalizeEmail(emp.email));
        if (user) {
            user.authUserId = authUserId;
            user.authStatus = 'Supabase Linked';
            user.activationStatus = status;
            user.inviteStatus = emp.inviteStatus;
            user.active = status === 'Active' ? true : user.active;
            user.lifecycleStatus = status;
        }
        this._appendAudit(d, 'system', 'auth user linked', `Auth user linked to ${officialId}`, 'Auth Invite', officialId);
        this.save(d);
        return { ok: true, emp };
    },
    
    deleteEmployee(id) {
        return this.archiveEmployee(id, 'Soft delete requested');
    },

    archiveEmployee(id, reason = 'Archived') {
        const d = this.get();
        const officialId = this.resolveEmployeeId(id, d);
        const idx = (d.employees || []).findIndex(e => e.id === officialId);
        if (idx < 0) return false;
        d.employees[idx] = {
            ...d.employees[idx],
            employmentStatus: 'Archived',
            status: 'Archived',
            active: false,
            authStatus: 'Archived',
            inviteStatus: 'Suspended',
            invitationStatus: 'Suspended',
            activationStatus: 'Suspended',
            archivedAt: new Date().toISOString(),
            archiveReason: reason
        };
        (d.users || []).forEach(u => {
            if (u.empId === officialId) {
                u.active = false;
                u.lifecycleStatus = 'Suspended';
                u.authStatus = 'Suspended';
                u.inviteStatus = 'Suspended';
                u.activationStatus = 'Suspended';
                u.suspendedAt = u.suspendedAt || new Date().toISOString();
                u.suspensionReason = reason;
            }
        });
        this._appendAudit(d, 'hr', 'employee archived', `Employee archived: ${officialId}`, 'Employee Master', officialId);
        this.save(d);
        return true;
    },
    
    savePhoto(empId, base64) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        const i = d.employees.findIndex(e => e.id === empId);
        if (i > -1) {
            d.employees[i].photo = base64;
            this.save(d);
            return true;
        }
        return false;
    },
    
    // ==================== ATTENDANCE FUNCTIONS ====================
    
    getTodayAttendance() {
        const d = this.get();
        const t = this.today();
        return (d.attendance || []).filter(a => a.date === t);
    },
    
    getEmpAttendance(empId) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.attendance || []).filter(a => a.empId === officialId).sort((a, b) => b.date.localeCompare(a.date));
    },
    
    markAttendance(empId, type) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        const t = this.today();
        const now = this.now();
        
        let idx = d.attendance.findIndex(a => a.empId === empId && a.date === t);
        if (idx === -1) {
            const attendanceId = this.generateAttendanceId(d);
            d.attendance.push({ id: attendanceId, attendanceId, empId, date: t, attendanceDate: t, checkIn: null, checkOut: null, status: 'Absent', shiftId: null, workingHours: null, lateMinutes: 0, regularizationStatus: 'None' });
            idx = d.attendance.length - 1;
        }
        
        if (type === 'in') {
            if (d.attendance[idx].checkIn) return { error: 'Already checked in at ' + d.attendance[idx].checkIn };
            d.attendance[idx].checkIn = now;
            const emp = d.employees.find(e => e.id === empId);
            const shiftId = emp?.shiftId || 'SH002';
            const shift = (d.shifts || []).find(s => s.id === shiftId);
            d.attendance[idx].shiftId = shiftId;
            if (shift) {
                const lateThreshold = this.addMinutes(shift.startTime, shift.graceMinutes || 15);
                d.attendance[idx].lateMinutes = Math.max(0, this.timeToMins(now.slice(0, 5)) - this.timeToMins(lateThreshold));
                d.attendance[idx].status = d.attendance[idx].lateMinutes > 0 ? 'Late' : 'Present';
            } else {
                d.attendance[idx].lateMinutes = 0;
                d.attendance[idx].status = 'Present';
            }
        }
        
        if (type === 'out') {
            if (!d.attendance[idx].checkIn) return { error: 'Please check in first' };
            if (d.attendance[idx].checkOut) return { error: 'Already checked out at ' + d.attendance[idx].checkOut };
            d.attendance[idx].checkOut = now;
            d.attendance[idx].workingHours = this.calcWorkingHours(d.attendance[idx].checkIn, now);
        }
        
        this.save(d);
        return d.attendance[idx];
    },
    
    // ==================== LEAVE FUNCTIONS ====================
    
    getLeaveRequests() { 
        return this.get().leaveRequests || []; 
    },
    
    getEmpLeave(empId) { 
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.leaveRequests || []).filter(l => l.empId === officialId); 
    },

    normalizeLeaveType(type = '') {
        const text = String(type || '').trim();
        if (/sick|\bsl\b/i.test(text)) return 'Sick Leave';
        if (/earned|\bel\b/i.test(text)) return 'Earned Leave';
        if (/casual|\bcl\b/i.test(text)) return 'Casual Leave';
        if (/work from home|wfh/i.test(text)) return 'Work From Home';
        return text || 'Casual Leave';
    },

    _normalizeLeaveRecord(row, data = null) {
        const d = data || this.get();
        const leaveId = row.leaveId || row.id || this.generateLeaveId(d);
        const fromDate = row.fromDate || row.from || this.today();
        const toDate = row.toDate || row.to || fromDate;
        const totalDays = Number(row.totalDays || this.dateDiff(fromDate, toDate));
        const status = row.status || row.finalStatus || 'Pending';
        const managerStatus = row.managerStatus || (status === 'Rejected' ? 'Rejected' : status === 'Approved' ? 'Approved' : 'Pending');
        const hrStatus = row.hrStatus || (row.finalStatus === 'Approved' ? 'Approved' : row.finalStatus === 'Rejected' ? 'Rejected' : 'Pending');
        const finalStatus = row.finalStatus || (status === 'Rejected' ? 'Rejected' : status === 'Approved' && hrStatus === 'Approved' ? 'Approved' : status === 'Approved' ? 'Manager Approved' : 'Pending');
        return {
            ...row,
            id: leaveId,
            leaveId,
            empId: this.resolveEmployeeId(row.empId || row.employeeId, d),
            type: this.normalizeLeaveType(row.type || row.leaveType),
            leaveType: this.normalizeLeaveType(row.leaveType || row.type),
            from: fromDate,
            fromDate,
            to: toDate,
            toDate,
            totalDays,
            reason: String(row.reason || '').trim().replace(/\s+/g, ' '),
            managerStatus,
            hrStatus,
            finalStatus,
            status: finalStatus === 'Rejected' ? 'Rejected' : finalStatus === 'Cancelled' ? 'Cancelled' : finalStatus === 'Pending' ? 'Pending' : 'Approved',
            appliedOn: row.appliedOn || (row.appliedAt ? String(row.appliedAt).slice(0, 10) : this.today()),
            appliedAt: row.appliedAt || new Date().toISOString(),
            decidedOn: row.decidedOn || (row.reviewedAt ? String(row.reviewedAt).slice(0, 10) : null),
            reviewedAt: row.reviewedAt || null,
            remarks: row.remarks || row.hrMessage || '',
            hrMessage: row.hrMessage || row.remarks || '',
            document: row.document || row.documentUrl || null,
            documentUrl: row.documentUrl || row.document || null,
            balanceDeducted: !!row.balanceDeducted,
            source: row.source || 'local'
        };
    },

    _syncApprovedLeaveAttendance(d, leave) {
        if (!leave || leave.finalStatus !== 'Approved') return;
        if (!Array.isArray(d.attendance)) d.attendance = [];
        const parse = value => {
            const [y, m, day] = String(value || '').split('-').map(Number);
            return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(day) ? new Date(Date.UTC(y, m - 1, day)) : null;
        };
        const format = date => date.toISOString().slice(0, 10);
        let cursor = parse(leave.from);
        const end = parse(leave.to);
        while (cursor && end && cursor <= end) {
            const date = format(cursor);
            let att = d.attendance.find(a => a.empId === leave.empId && a.date === date);
            if (!att) {
                const attendanceId = this.generateAttendanceId(d);
                att = { id: attendanceId, attendanceId, empId: leave.empId, date, attendanceDate: date, checkIn: null, checkOut: null, status: 'Leave', shiftId: null, workingHours: null, lateMinutes: 0, regularizationStatus: 'None' };
                d.attendance.push(att);
            } else {
                att.status = 'Leave';
                att.checkIn = null;
                att.checkOut = null;
                att.workingHours = null;
            }
            cursor.setDate(cursor.getDate() + 1);
        }
    },
    
    applyLeave(req) {
        const d = this.get();
        req = { ...(req || {}), empId: this.resolveEmployeeId(req?.empId, d) };
        if (!req.empId || !(d.employees || []).some(e => e.id === req.empId)) throw new Error('Valid employee is required.');
        const reason = (req?.reason || '').trim().replace(/\s+/g, ' ');
        const words = reason ? reason.split(' ').length : 0;
        if (!words) throw new Error('Leave reason is required.');
        if (words > 30) throw new Error('Leave reason must be 30 words or less.');
        if (!req.from || !req.to || req.from > req.to) throw new Error('Valid leave dates are required.');
        const days = this.dateDiff(req.from, req.to);
        const empBalance = Number((d.employees || []).find(e => e.id === req.empId)?.leaveBalance || 0);
        if (days > empBalance) throw new Error('Not enough leave balance.');
        
        const existing = d.leaveRequests.find(l => l.empId === req.empId && l.status === 'Pending' && 
            ((req.from >= l.from && req.from <= l.to) || (req.to >= l.from && req.to <= l.to)));
        if (existing) throw new Error('You already have a pending leave request for these dates.');
        
        req.reason = reason;
        req.id = req.leaveId || req.id || this.generateLeaveId(d);
        req.leaveId = req.id;
        req.type = this.normalizeLeaveType(req.type || req.leaveType);
        req.leaveType = req.type;
        req.fromDate = req.from;
        req.toDate = req.to;
        req.totalDays = days;
        req.managerStatus = req.managerStatus || 'Pending';
        req.hrStatus = req.hrStatus || 'Pending';
        req.finalStatus = req.finalStatus || 'Pending';
        req.status = 'Pending';
        req.appliedOn = this.today();
        req.appliedAt = req.appliedAt || new Date().toISOString();
        req.hrMessage = '';
        req.remarks = '';
        req.document = req.document || null;
        req.documentUrl = req.document;
        req.decidedOn = null;
        req.reviewedAt = null;
        req.balanceDeducted = false;
        req.source = req.source || 'local';
        d.leaveRequests.push(req);
        const emp = (d.employees || []).find(e => e.id === req.empId);
        const managerId = emp?.managerId || '';
        this._pushNotification(
            d,
            managerId ? '' : 'HR',
            managerId,
            'New Leave Request',
            `${emp?.name || req.empId} applied for ${req.type} (${req.from} to ${req.to})`,
            'Leave',
            'info'
        );
        this._appendAudit(d, 'employee', 'leave applied', `Leave ${req.id} applied by ${req.empId}`, 'Leave', req.id, req.empId);
        this.save(d);
        this._emitWorkflowEvent('LEAVE_APPLIED', {
            actorRole: 'employee',
            actorId: req.empId,
            module: 'Leave',
            targetId: req.id,
            empId: req.empId,
            targetEmpId: req.empId,
            priority: 'MEDIUM',
            message: `Leave ${req.id} applied by ${req.empId}`,
            metadata: { empId: req.empId, managerId, from: req.from, to: req.to, leaveType: req.type }
        });
        return req;
    },
    
    updateLeave(id, status, hrMessage = '', actorRole = 'hr', actorId = '') {
        const d = this.get();
        const i = d.leaveRequests.findIndex(l => l.id === id);
        if (i > -1) {
            const role = String(actorRole || 'hr').toLowerCase();
            const leave = this._normalizeLeaveRecord(d.leaveRequests[i], d);
            if (['Approved', 'Rejected'].includes(leave.finalStatus) && role !== 'hr') return leave;
            if (leave.finalStatus === 'Approved' && role === 'hr' && status === 'Approved') return leave;

            leave.hrMessage = hrMessage;
            leave.remarks = hrMessage || leave.remarks || '';
            leave.reviewedAt = new Date().toISOString();
            leave.decidedOn = this.today();
            if (role === 'manager') {
                leave.managerStatus = status;
                leave.hrStatus = status === 'Rejected' ? 'Not Required' : 'Pending';
                leave.finalStatus = status === 'Approved' ? 'Manager Approved' : 'Rejected';
                leave.status = status;
            } else {
                if (status === 'Approved' && leave.managerStatus === 'Pending') leave.managerStatus = 'Not Required';
                leave.hrStatus = status;
                leave.finalStatus = status;
                leave.status = status;
            }

            const empIdx = d.employees.findIndex(e => e.id === leave.empId);
            if (leave.finalStatus === 'Approved' && empIdx > -1 && !leave.balanceDeducted) {
                const days = Number(leave.totalDays || this.dateDiff(leave.from, leave.to));
                d.employees[empIdx].leaveBalance = Math.max(0, Number(d.employees[empIdx].leaveBalance || 0) - days);
                leave.balanceDeducted = true;
                this._syncApprovedLeaveAttendance(d, leave);
            }
            d.leaveRequests[i] = leave;
            
            const noteMsg = hrMessage
                ? `Your leave (${leave.from} to ${leave.to}) has been ${status.toLowerCase()}. Note: ${hrMessage}`
                : `Your leave (${leave.from} to ${leave.to}) has been ${status.toLowerCase()}.`;
            
            this._pushNotification(d, '', leave.empId, 'Leave ' + (role === 'manager' && status === 'Approved' ? 'Manager Approved' : status), noteMsg, 'Leave', status === 'Approved' ? 'success' : 'warn');
            if (actorRole === 'manager' && status === 'Approved') {
                const emp = d.employees.find(e => e.id === leave.empId);
                this._pushNotification(d, 'HR', '', 'Leave Approved by Manager', `${emp?.name || leave.empId} leave ${leave.id} is approved by manager and visible for HR closure.`, 'Leave', 'info');
            }
            
            const emp = d.employees.find(e => e.id === leave.empId);
            if (emp) {
                this.sendWhatsApp(emp.mobile, emp.name, 
                    status === 'Approved' ? 'leave_approved' : 'leave_rejected',
                    leave.from + ' to ' + leave.to + (hrMessage ? '. Note: ' + hrMessage : ''));
            }
            const actionLabel = role === 'manager' && status === 'Approved' ? 'leave manager approved' : status === 'Approved' ? 'leave approved' : 'leave rejected';
            this._appendAudit(d, actorRole || 'hr', actionLabel, `Leave ${leave.id} ${status.toLowerCase()} for ${leave.empId}`, 'Leave', leave.id, actorId || '');
            
            this.save(d);
            this._emitWorkflowEvent(status === 'Rejected' ? 'LEAVE_REJECTED' : 'LEAVE_APPROVED', {
                actorRole: actorRole || 'hr',
                actorId,
                module: 'Leave',
                targetId: leave.id,
                empId: leave.empId,
                targetEmpId: leave.empId,
                priority: status === 'Rejected' ? 'HIGH' : 'MEDIUM',
                message: `Leave ${leave.id} ${status.toLowerCase()} for ${leave.empId}`,
                metadata: { empId: leave.empId, from: leave.from, to: leave.to, managerStatus: leave.managerStatus, hrStatus: leave.hrStatus, finalStatus: leave.finalStatus }
            });
            return leave;
        }
        return null;
    },
    
    // ==================== SHIFT FUNCTIONS ====================
    
    getShifts() { 
        const shifts = this.get().shifts || [];
        return shifts.length ? shifts : [
            { id:'SH002', name:'General Shift', startTime:'09:00', endTime:'18:00', graceMinutes:15, color:'#1a56db', desc:'Regular office hours' }
        ]; 
    },
    
    getShift(id) { 
        return this.getShifts().find(s => s.id === id) || this.getShifts()[0] || null; 
    },
    
    addShift(shift) {
        const d = this.get();
        if (!d.shifts) d.shifts = [];
        shift.id = 'SH' + String(d.shifts.length + 1).padStart(3, '0');
        d.shifts.push(shift);
        this.save(d);
        return shift;
    },
    
    updateShift(id, fields) {
        const d = this.get();
        const i = d.shifts.findIndex(s => s.id === id);
        if (i > -1) {
            d.shifts[i] = { ...d.shifts[i], ...fields };
            this.save(d);
            return true;
        }
        return false;
    },
    
    deleteShift(id) {
        const d = this.get();
        d.shifts = d.shifts.filter(s => s.id !== id);
        this.save(d);
    },
    
    // ==================== TEAM FUNCTIONS ====================
    
    getTeams() { 
        return this.get().teams || []; 
    },
    
    getTeam(id) { 
        return this.get().teams.find(t => t.id === id); 
    },
    
    getManagerTeam(managerId) { 
        const d = this.get();
        const officialId = this.resolveEmployeeId(managerId, d);
        return (d.teams || []).find(t => t.managerId === officialId); 
    },
    
    addTeam(team) {
        const d = this.get();
        if (!d.teams) d.teams = [];
        const row = {
            ...team,
            id: team.id || 'TM' + String(d.teams.length + 1).padStart(3, '0'),
            managerId: this.resolveEmployeeId(team.managerId, d),
            memberIds: (team.memberIds || []).map(id => this.resolveEmployeeId(id, d)).filter(Boolean),
            createdOn: team.createdOn || this.today()
        };
        d.teams.push(row);
        this.save(d);
        return row;
    },
    
    updateTeam(id, fields) {
        const d = this.get();
        const i = (d.teams || []).findIndex(t => t.id === id);
        if (i > -1) {
            if (fields.managerId) fields.managerId = this.resolveEmployeeId(fields.managerId, d);
            if (Array.isArray(fields.memberIds)) fields.memberIds = fields.memberIds.map(empId => this.resolveEmployeeId(empId, d)).filter(Boolean);
            d.teams[i] = { ...d.teams[i], ...fields };
            this.save(d);
            return true;
        }
        return false;
    },
    
    deleteTeam(id) {
        const d = this.get();
        d.teams = (d.teams || []).filter(t => t.id !== id);
        this.save(d);
    },
    
    // ==================== EXPENSE CLAIMS ====================
    
    getExpenseClaims(filters = {}) {
        const d = this.get();
        let claims = d.expenseClaims || [];
        if (filters.empId) {
            const officialId = this.resolveEmployeeId(filters.empId, d);
            claims = claims.filter(c => c.empId === officialId);
        }
        if (filters.status) claims = claims.filter(c => c.status === filters.status);
        return claims.sort((a, b) => (b.submittedOn || b.date || '').localeCompare(a.submittedOn || a.date || ''));
    },
    
    addExpenseClaim(claim) {
        const d = this.get();
        if (!d.expenseClaims) d.expenseClaims = [];
        const empId = this.resolveEmployeeId(claim.empId, d);
        const newClaim = {
            id: claim.id || this.generateExpenseId(d),
            empId,
            date: claim.date || claim.expenseDate || this.today(),
            expenseDate: claim.expenseDate || claim.date || this.today(),
            category: claim.category,
            amount: Number(claim.amount) || 0,
            currency: claim.currency || d.companySettings?.currency || d.settings?.currency || 'INR',
            description: claim.description || '',
            billFileName: claim.billFileName || claim.billFile || '',
            attachmentFileName: claim.attachmentFileName || claim.billFileName || claim.billFile || '',
            attachmentUrl: claim.attachmentUrl || '',
            status: 'Pending Manager Approval',
            managerStatus: 'Pending',
            financeStatus: 'Pending',
            finalStatus: 'Pending',
            managerRemark: '',
            hrRemark: '',
            financeRemarks: '',
            remarks: '',
            level: 1,
            submittedOn: this.today(),
            submittedAt: claim.submittedAt || new Date().toISOString(),
            reviewedAt: null,
            paidAt: null
        };
        newClaim.expenseId = newClaim.id;
        d.expenseClaims.push(newClaim);
        const emp = (d.employees || []).find(e => e.id === newClaim.empId);
        this._pushNotification(
            d,
            emp?.managerId ? '' : 'MANAGER',
            emp?.managerId || '',
            'New Expense Claim',
            `${emp?.name || newClaim.empId} submitted ${newClaim.category} claim ${newClaim.id}`,
            'Expense',
            'info'
        );
        this._appendAudit(d, 'employee', 'expense submitted', `Expense claim ${newClaim.id} submitted for ${newClaim.category}`, 'Expense', newClaim.id, newClaim.empId);
        this.save(d);
        this._emitWorkflowEvent('EXPENSE_SUBMITTED', {
            actorRole: 'employee',
            actorId: newClaim.empId,
            module: 'Expense',
            targetId: newClaim.id,
            empId: newClaim.empId,
            targetEmpId: newClaim.empId,
            priority: 'MEDIUM',
            message: `Expense claim ${newClaim.id} submitted for ${newClaim.category}`,
            metadata: { empId: newClaim.empId, managerId: emp?.managerId || '', amount: newClaim.amount, category: newClaim.category }
        });
        return newClaim;
    },
    
    getExpenseClaimsByEmp(empId) {
        return this.getExpenseClaims({ empId });
    },
    
    getExpenseClaimsForManager(managerId) {
        const d = this.get();
        managerId = this.resolveEmployeeId(managerId, d);
        const team = (d.teams || []).find(t => t.managerId === managerId);
        const teamIds = new Set([
            ...((team && team.memberIds) || []).filter(id => id !== managerId),
            ...(d.employees || []).filter(e => e.managerId === managerId).map(e => e.id)
        ]);
        return (d.expenseClaims || [])
            .filter(c => teamIds.has(c.empId) && c.status === 'Pending Manager Approval')
            .sort((a, b) => (b.submittedOn || b.date || '').localeCompare(a.submittedOn || a.date || ''));
    },
    
    getExpenseClaimsForHR() {
        const d = this.get();
        return (d.expenseClaims || [])
            .filter(c => c.status === 'Pending HR Payment')
            .sort((a, b) => (b.submittedOn || b.date || '').localeCompare(a.submittedOn || a.date || ''));
    },
    
    approveExpenseClaimByManager(id, managerRemark = '', actorId = '') {
        const d = this.get();
        const claim = (d.expenseClaims || []).find(c => c.id === id);
        if (!claim) return false;
        claim.status = 'Pending HR Payment';
        claim.managerStatus = 'Approved';
        claim.financeStatus = claim.financeStatus || 'Pending';
        claim.finalStatus = 'Manager Approved';
        claim.level = 2;
        claim.managerRemark = managerRemark;
        claim.managerRemarks = managerRemark;
        claim.approvedByManagerOn = this.today();
        claim.reviewedAt = new Date().toISOString();
        this._pushNotification(d, 'HR', '', 'Expense Pending HR Payment', `Expense claim ${claim.id} is manager approved and awaiting HR payment.`, 'Expense', 'info');
        this._appendAudit(d, 'manager', 'expense approved', `Expense claim ${claim.id} approved by manager`, 'Expense', claim.id, actorId || '');
        this.save(d);
        this._emitWorkflowEvent('EXPENSE_APPROVED', {
            actorRole: 'manager',
            actorId,
            module: 'Expense',
            targetId: claim.id,
            empId: claim.empId,
            targetEmpId: claim.empId,
            priority: 'HIGH',
            message: `Expense claim ${claim.id} approved by manager`,
            metadata: { empId: claim.empId, amount: claim.amount, status: claim.status }
        });
        return true;
    },
    
    rejectExpenseClaimByManager(id, managerRemark = '', actorId = '') {
        const d = this.get();
        const claim = (d.expenseClaims || []).find(c => c.id === id);
        if (!claim) return false;
        claim.status = 'Rejected by Manager';
        claim.managerStatus = 'Rejected';
        claim.financeStatus = 'Not Required';
        claim.finalStatus = 'Rejected';
        claim.level = 1;
        claim.managerRemark = managerRemark;
        claim.managerRemarks = managerRemark;
        claim.rejectedByManagerOn = this.today();
        claim.reviewedAt = new Date().toISOString();
        this._pushNotification(d, '', claim.empId, 'Expense Rejected by Manager', `Expense claim ${claim.id} was rejected by manager.${managerRemark ? ' Remark: ' + managerRemark : ''}`, 'Expense', 'warn');
        this._pushNotification(d, 'HR', '', 'Expense Rejected by Manager', `Expense claim ${claim.id} was rejected at manager level.`, 'Expense', 'warn');
        this._appendAudit(d, 'manager', 'expense rejected', `Expense claim ${claim.id} rejected by manager`, 'Expense', claim.id, actorId || '');
        this.save(d);
        this._emitWorkflowEvent('EXPENSE_REJECTED', {
            actorRole: 'manager',
            actorId,
            module: 'Expense',
            targetId: claim.id,
            empId: claim.empId,
            targetEmpId: claim.empId,
            priority: 'HIGH',
            message: `Expense claim ${claim.id} rejected by manager`,
            metadata: { empId: claim.empId, amount: claim.amount, status: claim.status }
        });
        return true;
    },
    
    processExpenseClaimByHR(id, action, hrRemark = '', actorId = '') {
        const d = this.get();
        const claim = (d.expenseClaims || []).find(c => c.id === id);
        if (!claim) return false;
        claim.hrRemark = hrRemark;
        claim.financeRemarks = hrRemark;
        claim.processedByHROn = this.today();
        if (action === 'paid') {
            claim.status = 'Paid';
            claim.managerStatus = claim.managerStatus || 'Approved';
            claim.financeStatus = 'Paid';
            claim.finalStatus = 'Paid';
            claim.level = 3;
            claim.paymentDate = this.today();
            claim.paidAt = new Date().toISOString();
            this._pushNotification(d, '', claim.empId, 'Expense Paid', `Expense claim ${claim.id} has been marked paid.${hrRemark ? ' Remark: ' + hrRemark : ''}`, 'Expense', 'success');
            this._appendAudit(d, 'hr', 'expense paid', `Expense claim ${claim.id} marked paid`, 'Expense', claim.id, actorId || '');
        } else if (action === 'reject') {
            claim.status = 'Rejected by HR';
            claim.managerStatus = claim.managerStatus || 'Approved';
            claim.financeStatus = 'Rejected';
            claim.finalStatus = 'Rejected';
            claim.level = 2;
            this._pushNotification(d, '', claim.empId, 'Expense On Hold', `Expense claim ${claim.id} was put on hold by HR.${hrRemark ? ' Remark: ' + hrRemark : ''}`, 'Expense', 'warn');
            this._appendAudit(d, 'hr', 'expense rejected', `Expense claim ${claim.id} rejected by HR`, 'Expense', claim.id, actorId || '');
        } else {
            return false;
        }
        claim.reviewedAt = claim.reviewedAt || new Date().toISOString();
        this.save(d);
        this._emitWorkflowEvent(action === 'paid' ? 'EXPENSE_PAID' : 'EXPENSE_REJECTED', {
            actorRole: 'hr',
            actorId: actorId || '',
            module: 'Expense',
            targetId: claim.id,
            empId: claim.empId,
            targetEmpId: claim.empId,
            priority: action === 'paid' ? 'LOW' : 'HIGH',
            message: `Expense claim ${claim.id} ${action === 'paid' ? 'marked paid' : 'put on hold by HR'}`,
            metadata: { empId: claim.empId, amount: claim.amount, status: claim.status }
        });
        return true;
    },
    
    approveExpenseClaim(id, role, remarks) {
        if (role === 'manager') return this.approveExpenseClaimByManager(id, remarks);
        if (role === 'finance' || role === 'hr') return this.processExpenseClaimByHR(id, 'paid', remarks);
        return false;
    },
    
    rejectExpenseClaim(id, role, remarks) {
        if (role === 'manager') return this.rejectExpenseClaimByManager(id, remarks);
        if (role === 'finance' || role === 'hr') return this.processExpenseClaimByHR(id, 'reject', remarks);
        return false;
    },
    
    // ==================== PERFORMANCE ====================
    
    getPerformanceGoals(empId) {
        const d = this.get();
        let goals = d.performanceGoals || [];
        if (empId) {
            const officialId = this.resolveEmployeeId(empId, d);
            goals = goals.filter(g => g.empId === officialId);
        }
        return goals;
    },
    
    addPerformanceGoal(goal) {
        const d = this.get();
        if (!d.performanceGoals) d.performanceGoals = [];
        const empId = this.resolveEmployeeId(goal.empId, d);
        const row = {
            id: goal.id || 'PG' + String((d.performanceGoals || []).length + 1).padStart(3, '0'),
            empId,
            reviewCycleId: goal.reviewCycleId || goal.cycleId || '',
            kraTitle: goal.kraTitle || goal.title || '',
            targetMetric: goal.targetMetric || goal.target || '',
            weightage: Number(goal.weightage || 0),
            dueDate: goal.dueDate || '',
            status: goal.status || 'Assigned',
            selfRating: goal.selfRating || '',
            selfComments: goal.selfComments || goal.selfComment || '',
            managerRating: goal.managerRating || '',
            managerComments: goal.managerComments || goal.managerComment || ''
        };
        d.performanceGoals.push(row);
        this.save(d);
        return row;
    },

    getReviewCycles() {
        return (this.get().reviewCycles || []).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    },

    addReviewCycle(cycle = {}) {
        const d = this.get();
        if (!d.reviewCycles) d.reviewCycles = [];
        const row = {
            id: cycle.id || 'RC' + String((d.reviewCycles || []).length + 1).padStart(3, '0'),
            name: cycle.name || cycle.cycleName || '',
            startDate: cycle.startDate || '',
            endDate: cycle.endDate || '',
            status: cycle.status || 'Active',
            createdOn: cycle.createdOn || this.today()
        };
        d.reviewCycles.push(row);
        this.save(d);
        return row;
    },

    getGoalsByEmployee(empId) {
        return this.getPerformanceGoals(this.resolveEmployeeId(empId));
    },

    getGoalsForManager(managerId) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(managerId, d);
        const team = (d.teams || []).find(t => t.managerId === officialId);
        const teamIds = new Set([
            ...((team && team.memberIds) || []).filter(id => id !== officialId),
            ...(d.employees || []).filter(e => e.managerId === officialId).map(e => e.id)
        ]);
        return (d.performanceGoals || []).filter(g => teamIds.has(g.empId) && !g.managerRating);
    },

    submitSelfReview(goalId, rating, comments = '') {
        this.updateSelfRating(goalId, rating, comments);
        return true;
    },

    submitManagerReview(goalId, rating, comments = '') {
        this.updateManagerRating(goalId, rating, comments);
        return true;
    },

    finalizeAppraisal(appraisal = {}) {
        const d = this.get();
        if (!d.appraisals) d.appraisals = [];
        const empId = this.resolveEmployeeId(appraisal.empId, d);
        const row = {
            id: appraisal.id || 'AP' + String((d.appraisals || []).length + 1).padStart(3, '0'),
            empId,
            reviewCycleId: appraisal.reviewCycleId || appraisal.cycleId || '',
            finalRating: Number(appraisal.finalRating || 0),
            promotionRecommended: !!appraisal.promotionRecommended,
            incrementNote: appraisal.incrementNote || '',
            status: appraisal.status || 'Finalized',
            finalizedOn: appraisal.finalizedOn || this.today()
        };
        d.appraisals.push(row);
        this._appendAudit(d, 'hr', 'appraisal finalized', `Appraisal finalized for ${empId}`);
        this.save(d);
        return row;
    },

    getAppraisalHistoryByEmp(empId) {
        const officialId = this.resolveEmployeeId(empId);
        return (this.get().appraisals || []).filter(a => a.empId === officialId).sort((a, b) => (b.finalizedOn || '').localeCompare(a.finalizedOn || ''));
    },
    
    updateSelfRating(goalId, rating, comments) {
        const d = this.get();
        const goal = d.performanceGoals.find(g => g.id === goalId);
        if (goal) {
            goal.selfRating = rating;
            goal.selfComments = comments;
            goal.selfComment = comments;
            goal.status = 'Self Reviewed';
            this.save(d);
        }
    },
    
    updateManagerRating(goalId, rating, comments) {
        const d = this.get();
        const goal = d.performanceGoals.find(g => g.id === goalId);
        if (goal) {
            goal.managerRating = rating;
            goal.managerComments = comments;
            goal.managerComment = comments;
            goal.status = 'Manager Reviewed';
            this._appendAudit(d, 'manager', 'appraisal finalized', `Manager rating saved for goal ${goalId}`);
            this.save(d);
        }
    },
    
    // RECRUITMENT_MODULE_DB_START
    // ==================== RECRUITMENT ====================
    
    getRecruitmentStages() {
        return ['Applied', 'Screening', 'Interview', 'Offered', 'Hired', 'Rejected'];
    },

    getJobOpenings(filters = {}) {
        let jobs = this.get().jobOpenings || [];
        if (filters.status) jobs = jobs.filter(j => j.status === filters.status);
        if (filters.department) jobs = jobs.filter(j => j.department === filters.department || j.dept === filters.department);
        return jobs.sort((a, b) => (b.postedOn || '').localeCompare(a.postedOn || ''));
    },

    getJobOpening(id) {
        return (this.get().jobOpenings || []).find(j => j.id === id) || null;
    },
    
    addJobOpening(job) {
        const d = this.get();
        if (!d.jobOpenings) d.jobOpenings = [];
        const nextNo = d.jobOpenings.reduce((max, j) => Math.max(max, Number(String(j.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const newJob = {
            id: job.id || ('JO' + String(nextNo).padStart(3, '0')),
            title: job.title || '',
            department: job.department || job.dept || '',
            openings: Number(job.openings || job.numberOfOpenings) || 1,
            location: job.location || '',
            description: job.description || '',
            status: job.status || 'Open',
            postedOn: job.postedOn || this.today()
        };
        d.jobOpenings.push(newJob);
        this.save(d);
        return newJob;
    },

    updateJobOpening(id, fields = {}) {
        const d = this.get();
        const job = (d.jobOpenings || []).find(j => j.id === id);
        if (!job) return false;
        Object.assign(job, fields);
        if (fields.dept && !fields.department) job.department = fields.dept;
        if (job.openings !== undefined) job.openings = Number(job.openings) || 1;
        this.save(d);
        return true;
    },

    deleteJobOpening(id) {
        const d = this.get();
        const before = (d.jobOpenings || []).length;
        d.jobOpenings = (d.jobOpenings || []).filter(j => j.id !== id);
        this.save(d);
        return d.jobOpenings.length !== before;
    },

    getJobApplications(filters = {}) {
        let applications = this.get().jobApplications || [];
        if (filters.jobId) applications = applications.filter(a => a.jobId === filters.jobId);
        if (filters.pipelineStage) applications = applications.filter(a => a.pipelineStage === filters.pipelineStage || a.status === filters.pipelineStage);
        if (filters.status) applications = applications.filter(a => a.status === filters.status || a.pipelineStage === filters.status);
        return applications.sort((a, b) => (b.appliedOn || '').localeCompare(a.appliedOn || ''));
    },

    getJobApplication(id) {
        return (this.get().jobApplications || []).find(a => a.id === id) || null;
    },
    
    addJobApplication(application) {
        const d = this.get();
        if (!d.jobApplications) d.jobApplications = [];
        const nextNo = d.jobApplications.reduce((max, a) => Math.max(max, Number(String(a.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const stage = application.pipelineStage || application.status || 'Applied';
        const newApplication = {
            id: application.id || ('JA' + String(nextNo).padStart(3, '0')),
            jobId: application.jobId || '',
            candidateName: application.candidateName || '',
            email: application.email || '',
            mobile: application.mobile || '',
            resumeFileName: application.resumeFileName || application.resume || '',
            currentCompany: application.currentCompany || '',
            expectedSalary: Number(application.expectedSalary) || 0,
            pipelineStage: stage,
            status: stage,
            appliedOn: application.appliedOn || this.today()
        };
        d.jobApplications.push(newApplication);
        this.save(d);
        return newApplication;
    },

    updateJobApplication(id, fields = {}) {
        const d = this.get();
        const application = (d.jobApplications || []).find(a => a.id === id);
        if (!application) return false;
        Object.assign(application, fields);
        if (fields.resume && !fields.resumeFileName) application.resumeFileName = fields.resume;
        if (fields.pipelineStage || fields.status) {
            const stage = fields.pipelineStage || fields.status;
            application.pipelineStage = stage;
            application.status = stage;
            application.stageUpdatedOn = this.today();
        }
        if (application.expectedSalary !== undefined) application.expectedSalary = Number(application.expectedSalary) || 0;
        this.save(d);
        return true;
    },

    deleteJobApplication(id) {
        const d = this.get();
        const before = (d.jobApplications || []).length;
        d.jobApplications = (d.jobApplications || []).filter(a => a.id !== id);
        this.save(d);
        return d.jobApplications.length !== before;
    },

    moveCandidateStage(applicationId, pipelineStage) {
        if (!this.getRecruitmentStages().includes(pipelineStage)) return false;
        return this.updateJobApplication(applicationId, { pipelineStage, status: pipelineStage });
    },

    getRecruitmentStats() {
        const d = this.get();
        const jobs = d.jobOpenings || [];
        const applications = d.jobApplications || [];
        const stats = {
            openJobs: jobs.filter(j => j.status === 'Open').length,
            totalOpenings: jobs.reduce((sum, j) => sum + (Number(j.openings) || 0), 0),
            totalApplications: applications.length,
            applied: 0,
            screening: 0,
            interview: 0,
            offered: 0,
            hired: 0,
            rejected: 0
        };
        applications.forEach(a => {
            const key = String(a.pipelineStage || a.status || 'Applied').toLowerCase();
            if (stats[key] !== undefined) stats[key] += 1;
        });
        return stats;
    },
    // RECRUITMENT_MODULE_DB_END

    // STRATEGIC_DELIVERABLES_DB_START
    // ==================== STRATEGIC DELIVERABLES ====================

    createStrategicDeliverable(deliverable = {}) {
        const d = this.get();
        if (!d.strategicDeliverables) d.strategicDeliverables = [];
        const empId = this.resolveEmployeeId(deliverable.empId, d);
        const emp = (d.employees || []).find(e => e.id === empId);
        const managerId = this.resolveEmployeeId(deliverable.managerId || emp?.managerId || '', d);
        const deliverableId = deliverable.deliverableId || deliverable.id || this.generateDeliverableId(d);
        const salary = Number(emp?.salary || deliverable.salary || 0);
        const accountabilityTier = salary >= 100000 ? 'High Accountability Resource' : 'Standard Accountability Resource';
        const deadlineDate = deliverable.deadlineDate || deliverable.dueDate || this.today();
        const assignedDate = deliverable.assignedDate || deliverable.createdOn || this.today();
        const progress = Math.min(100, Math.max(0, Number(deliverable.progressPercent ?? deliverable.progress ?? 0) || 0));
        const row = {
            deliverableId,
            id: deliverableId,
            empId: empId || '',
            employeeName: emp?.name || deliverable.employeeName || '',
            department: emp?.dept || deliverable.department || '',
            designation: emp?.desig || deliverable.designation || '',
            managerId: managerId || '',
            salary,
            accountabilityTier,
            deliverableTitle: deliverable.deliverableTitle || deliverable.title || '',
            title: deliverable.deliverableTitle || deliverable.title || '',
            businessObjective: deliverable.businessObjective || deliverable.description || '',
            description: deliverable.businessObjective || deliverable.description || '',
            expectedOutcome: deliverable.expectedOutcome || deliverable.targetOutcome || deliverable.kpi || '',
            targetOutcome: deliverable.expectedOutcome || deliverable.targetOutcome || deliverable.kpi || '',
            assignedDate,
            deadlineDate,
            dueDate: deadlineDate,
            reviewFrequency: deliverable.reviewFrequency || 'Monthly',
            priority: deliverable.priority || 'Medium',
            assignedBy: deliverable.assignedBy || 'HR',
            progressPercent: progress,
            progress,
            currentStatus: deliverable.currentStatus || deliverable.status || 'Active',
            status: deliverable.currentStatus || deliverable.status || 'Active',
            finalClosureStatus: deliverable.finalClosureStatus || 'Open',
            quarter: deliverable.quarter || this.currentQuarter(new Date(deadlineDate)),
            createdOn: assignedDate,
            closedOn: deliverable.closedOn || null,
            closureNote: deliverable.closureNote || '',
            highAccountability: salary >= 100000
        };
        const governanceService = (typeof window !== 'undefined' ? window : globalThis).deliverableGovernanceService;
        if (governanceService?.normalizeDeliverableRecord) {
            Object.assign(row, governanceService.normalizeDeliverableRecord(row, d));
            governanceService.recordGovernanceMetric?.('STRATEGIC_ACCOUNTABILITY_CREATED', {
                deliverableId: row.deliverableId,
                strategicOwnerRole: row.strategicOwnerRole,
                delayed: false
            });
        }
        d.strategicDeliverables.unshift(row);
        if (row.empId) this._pushNotification(d, '', row.empId, row.employeeIsContributorOnly ? 'Strategic Contributor Assignment' : 'Strategic Accountability Assigned', `${row.deliverableTitle} requires contributor progress support by ${row.deadlineDate}.`, 'Strategic Deliverables', row.priority === 'Critical' ? 'warn' : 'info');
        if (row.strategicOwnerId && row.strategicOwnerId !== row.empId) this._pushNotification(d, '', row.strategicOwnerId, 'Strategic Accountability Created', `${row.strategicOwnerName || row.strategicOwnerId} owns ${row.deliverableTitle}. Reviewer follow-up required.`, 'Strategic Deliverables', row.priority === 'Critical' ? 'warn' : 'info');
        if (row.managerId && row.managerId !== row.strategicOwnerId) this._pushNotification(d, '', row.managerId, 'Strategic Deliverable Review Required', `${row.employeeName || row.empId} is contributing to ${row.deliverableTitle}. Review cadence required.`, 'Strategic Deliverables', row.priority === 'Critical' ? 'warn' : 'info');
        this._appendAudit(d, 'hr', 'strategic accountability created', `${row.deliverableTitle} owner ${row.strategicOwnerName || row.strategicOwnerId || row.empId}`, 'Strategic Deliverables', row.deliverableId, row.assignedBy);
        governanceService?.auditGovernance?.('STRATEGIC_ACCOUNTABILITY_CREATED', row, { actorId: row.assignedBy || 'HR' });
        this.save(d);
        this._emitWorkflowEvent('DELIVERABLE_ASSIGNED', {
            actorRole: 'hr',
            actorId: row.assignedBy,
            module: 'Strategic Deliverables',
            targetId: row.deliverableId,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: row.priority === 'Critical' ? 'CRITICAL' : row.priority === 'High' ? 'HIGH' : 'MEDIUM',
            message: `${row.deliverableTitle} accountability created for ${row.strategicOwnerName || row.strategicOwnerId || row.empId}`,
            metadata: { empId: row.empId, managerId: row.managerId, strategicOwnerId: row.strategicOwnerId, strategicOwnerRole: row.strategicOwnerRole, reviewerId: row.reviewerId, sponsorRole: row.sponsorRole, contributors: row.contributors, deadlineDate: row.deadlineDate, accountabilityTier: row.accountabilityTier, governanceState: row.governanceState }
        });
        return row;
    },

    getStrategicDeliverables(filters = {}) {
        const d = this.get();
        const governanceService = (typeof window !== 'undefined' ? window : globalThis).deliverableGovernanceService;
        let rows = d.strategicDeliverables || [];
        if (governanceService?.normalizeDeliverableRecord) rows = rows.map(row => governanceService.normalizeDeliverableRecord(row, d));
        if (filters.status) rows = rows.filter(r => r.status === filters.status || r.currentStatus === filters.status || r.finalClosureStatus === filters.status);
        if (filters.finalClosureStatus) rows = rows.filter(r => r.finalClosureStatus === filters.finalClosureStatus);
        if (filters.quarter) rows = rows.filter(r => r.quarter === filters.quarter);
        return rows.sort((a, b) => (a.deadlineDate || a.dueDate || '').localeCompare(b.deadlineDate || b.dueDate || '') || (b.deliverableId || b.id || '').localeCompare(a.deliverableId || a.id || ''));
    },

    getStrategicDeliverablesByEmployee(empId) {
        const officialId = this.resolveEmployeeId(empId);
        const governanceService = (typeof window !== 'undefined' ? window : globalThis).deliverableGovernanceService;
        return this.getStrategicDeliverables().filter(r => governanceService?.isContributorOnDeliverable ? governanceService.isContributorOnDeliverable(r, officialId, this.get()) : r.empId === officialId);
    },

    getStrategicDeliverablesByManager(managerId) {
        const d = this.get();
        managerId = this.resolveEmployeeId(managerId, d);
        const team = (d.teams || []).find(t => t.managerId === managerId);
        const teamIds = new Set([
            ...((team && team.memberIds) || []),
            ...(d.employees || []).filter(e => e.managerId === managerId).map(e => e.id)
        ]);
        return this.getStrategicDeliverables().filter(r => r.managerId === managerId || r.reviewerId === managerId || r.strategicOwnerId === managerId || teamIds.has(r.empId) || (r.contributors || []).some(c => teamIds.has(c.empId)));
    },

    addDeliverableReview(review = {}) {
        const d = this.get();
        if (!d.deliverableReviews) d.deliverableReviews = [];
        const deliverable = (d.strategicDeliverables || []).find(x => x.id === review.deliverableId || x.deliverableId === review.deliverableId);
        if (!deliverable) return null;
        const explicitManagerId = review.managerId ? this.resolveEmployeeId(review.managerId, d) : '';
        const managerId = explicitManagerId || this.resolveEmployeeId(deliverable.managerId || '', d);
        const reviewId = review.reviewId || review.id || this.generateDeliverableReviewId(d);
        const reviewDate = review.reviewDate || review.reviewedOn || this.today();
        const progress = Math.min(100, Math.max(0, Number(review.progressPercent ?? review.progress ?? deliverable.progressPercent ?? deliverable.progress ?? 0) || 0));
        const reviewStatus = review.reviewStatus || review.riskLevel || 'Attention';
        const isManagerReview = !!(explicitManagerId || review.managerAchievements || review.managerBottlenecks || review.managerRemark || review.note);
        const governanceService = (typeof window !== 'undefined' ? window : globalThis).deliverableGovernanceService;
        const governedDeliverable = governanceService?.normalizeDeliverableRecord ? governanceService.normalizeDeliverableRecord(deliverable, d) : deliverable;
        const governedReview = governanceService?.normalizeReviewEntry ? governanceService.normalizeReviewEntry(review, governedDeliverable, d) : {};
        const row = {
            reviewId,
            id: reviewId,
            deliverableId: deliverable.deliverableId || deliverable.id,
            empId: deliverable.empId,
            managerId: managerId || '',
            reviewerId: governedReview.reviewerId || managerId || governedDeliverable.reviewerId || '',
            reviewerRole: governedReview.reviewerRole || governedDeliverable.reviewerRole || 'manager',
            reviewerAction: governedReview.reviewerAction || (isManagerReview ? 'APPROVE_PROGRESS' : 'CONTRIBUTOR_UPDATE'),
            review_id: reviewId,
            deliverable_id: deliverable.deliverableId || deliverable.id,
            contributor_id: deliverable.empId,
            reviewer_id: governedReview.reviewerId || managerId || governedDeliverable.reviewerId || '',
            reviewDate,
            reviewedOn: reviewDate,
            submitted_at: reviewDate,
            reviewMonth: review.reviewMonth || String(reviewDate).slice(0, 7),
            employeeProgressNote: review.employeeProgressNote || '',
            managerAchievements: review.managerAchievements || '',
            managerBottlenecks: review.managerBottlenecks || '',
            managerRemark: review.managerRemark || review.note || '',
            reviewStatus: governedReview.reviewStatus || reviewStatus,
            riskLevel: governedReview.riskLevel || reviewStatus,
            governanceState: governedReview.governanceState || (isManagerReview ? 'APPROVED' : 'UNDER_REVIEW'),
            review_status: governedReview.contributorUpdate ? 'PENDING_REVIEW' : (governedReview.governanceState || 'APPROVED'),
            risk_level: governedReview.riskLevel || reviewStatus,
            escalation_state: governedReview.governanceState || (isManagerReview ? 'APPROVED' : 'UNDER_REVIEW'),
            contributorUpdate: !!governedReview.contributorUpdate,
            progressPercent: progress,
            progress,
            note: review.managerRemark || review.note || review.employeeProgressNote || ''
        };
        deliverable.progressPercent = row.progressPercent;
        deliverable.progress = row.progressPercent;
        deliverable.lastRiskLevel = row.reviewStatus;
        deliverable.lastReviewOn = row.reviewedOn;
        const outcome = governanceService?.applyReviewOutcome ? governanceService.applyReviewOutcome(deliverable, row) : null;
        deliverable.currentStatus = outcome?.currentStatus || (row.progressPercent >= 100 ? 'Ready for Closure' : (row.reviewStatus === 'Critical' ? 'At Risk' : 'Under Review'));
        deliverable.status = outcome?.status || deliverable.currentStatus;
        deliverable.governanceState = outcome?.governanceState || row.governanceState;
        deliverable.workflowState = deliverable.governanceState;
        if (outcome?.lastRiskLevel) deliverable.lastRiskLevel = outcome.lastRiskLevel;
        d.deliverableReviews.unshift(row);
        if (isManagerReview) {
            this._pushNotification(d, 'HR', '', 'Strategic Accountability Review Submitted', `${deliverable.strategicOwnerName || deliverable.employeeName || deliverable.empId} review for ${deliverable.deliverableTitle || deliverable.title} is ${row.reviewStatus} at ${row.progressPercent}%.`, 'Strategic Deliverables', row.reviewStatus === 'Critical' ? 'warn' : 'info');
            this._appendAudit(d, 'manager', 'strategic review decision', `${deliverable.deliverableId || deliverable.id} ${row.reviewerAction} at ${row.progressPercent}% with ${row.reviewStatus} status`, 'Strategic Deliverables', row.reviewId, managerId);
            governanceService?.auditGovernance?.('STRATEGIC_REVIEW_DECISION', row, { actorId: managerId });
            governanceService?.recordGovernanceMetric?.('STRATEGIC_REVIEW_DECISION', { deliverableId: deliverable.deliverableId || deliverable.id, reviewerAction: row.reviewerAction, severity: row.reviewStatus });
        } else {
            const reviewerTarget = row.reviewerId || deliverable.managerId || deliverable.strategicOwnerId;
            if (reviewerTarget) this._pushNotification(d, '', reviewerTarget, 'Contributor Progress Update', `${deliverable.employeeName || deliverable.empId} added a contributor update for ${deliverable.deliverableTitle || deliverable.title}. Review action is required.`, 'Strategic Deliverables', 'info');
            this._appendAudit(d, 'employee', 'contributor progress update added', `${deliverable.deliverableId || deliverable.id} updated by contributor`, 'Strategic Deliverables', row.reviewId, deliverable.empId);
            governanceService?.auditGovernance?.('STRATEGIC_CONTRIBUTOR_UPDATE', row, { actorId: deliverable.empId });
            governanceService?.recordGovernanceMetric?.('STRATEGIC_CONTRIBUTOR_UPDATE', { deliverableId: deliverable.deliverableId || deliverable.id, reviewerId: reviewerTarget });
        }
        this.save(d);
        this._emitWorkflowEvent('DELIVERABLE_REVIEWED', {
            actorRole: isManagerReview ? 'manager' : 'employee',
            actorId: isManagerReview ? managerId : deliverable.empId,
            module: 'Strategic Deliverables',
            targetId: row.reviewId,
            empId: deliverable.empId,
            targetEmpId: deliverable.empId,
            priority: row.reviewStatus === 'Critical' ? 'CRITICAL' : row.reviewStatus === 'Attention' ? 'HIGH' : 'MEDIUM',
            message: `${deliverable.deliverableId || deliverable.id} ${row.reviewerAction} at ${row.progressPercent}% with ${row.reviewStatus} status`,
            metadata: { empId: deliverable.empId, managerId, reviewerId: row.reviewerId, reviewerRole: row.reviewerRole, reviewerAction: row.reviewerAction, governanceState: row.governanceState, deliverableId: deliverable.deliverableId || deliverable.id, reviewId: row.reviewId, reviewStatus: row.reviewStatus, progressPercent: row.progressPercent }
        });
        return row;
    },

    closeDeliverable(id, closureStatusOrNote = 'Achieved', closureNote = '') {
        const d = this.get();
        const item = (d.strategicDeliverables || []).find(x => x.id === id || x.deliverableId === id);
        if (!item) return false;
        const closureLabels = ['Achieved', 'Partially Achieved', 'Failed', 'Exceeded'];
        const isStatus = closureLabels.includes(closureStatusOrNote);
        const finalStatus = isStatus ? closureStatusOrNote : (Number(item.progressPercent ?? item.progress ?? 0) >= 100 ? 'Achieved' : 'Partially Achieved');
        const note = isStatus ? closureNote : closureStatusOrNote;
        item.finalClosureStatus = finalStatus;
        item.currentStatus = 'Closed';
        item.status = 'Closed';
        item.governanceState = 'COMPLETED';
        item.workflowState = 'COMPLETED';
        item.progressPercent = finalStatus === 'Achieved' || finalStatus === 'Exceeded' ? 100 : Math.min(99, Number(item.progressPercent ?? item.progress ?? 0) || 0);
        item.progress = item.progressPercent;
        item.closedOn = this.today();
        item.closureNote = note || item.closureNote || 'Closed by HR';
        this._pushNotification(d, '', item.empId, 'Strategic Deliverable Closed', `${item.deliverableTitle || item.title} was closed as ${item.finalClosureStatus}.`, 'Strategic Deliverables', item.finalClosureStatus === 'Failed' ? 'warn' : 'success');
        this._appendAudit(d, 'hr', 'strategic deliverable closed', `${item.deliverableId || item.id} closed for ${item.empId} as ${item.finalClosureStatus}`, 'Strategic Deliverables', item.deliverableId || item.id);
        const governanceService = (typeof window !== 'undefined' ? window : globalThis).deliverableGovernanceService;
        governanceService?.auditGovernance?.('STRATEGIC_ACCOUNTABILITY_CLOSED', item, { actorId: 'HR' });
        governanceService?.recordGovernanceMetric?.('STRATEGIC_ACCOUNTABILITY_CLOSED', { deliverableId: item.deliverableId || item.id, closureStatus: item.finalClosureStatus });
        this.save(d);
        this._emitWorkflowEvent('DELIVERABLE_CLOSED', {
            actorRole: 'hr',
            actorId: '',
            module: 'Strategic Deliverables',
            targetId: item.deliverableId || item.id,
            empId: item.empId,
            targetEmpId: item.empId,
            priority: item.finalClosureStatus === 'Failed' ? 'HIGH' : 'LOW',
            message: `${item.deliverableId || item.id} closed as ${item.finalClosureStatus}`,
            metadata: { empId: item.empId, managerId: item.managerId, closureStatus: item.finalClosureStatus, progressPercent: item.progressPercent }
        });
        return true;
    },

    getStrategicAnalytics(scope = {}) {
        const d = this.get();
        const todayDate = this.today();
        const currentQuarter = this.currentQuarter();
        const employees = d.employees || [];
        let deliverables = d.strategicDeliverables || [];
        if (scope.empId) deliverables = deliverables.filter(x => x.empId === this.resolveEmployeeId(scope.empId, d));
        if (scope.managerId) {
            const allowed = new Set(this.getStrategicDeliverablesByManager(this.resolveEmployeeId(scope.managerId, d)).map(x => x.id));
            deliverables = deliverables.filter(x => allowed.has(x.id));
        }
        const deliverableIds = new Set(deliverables.map(x => x.deliverableId || x.id));
        const reviews = (d.deliverableReviews || []).filter(r => deliverableIds.has(r.deliverableId));
        const active = deliverables.filter(x => (x.finalClosureStatus || 'Open') === 'Open' && !['Closed', 'Achieved'].includes(x.status));
        const delayed = active.filter(x => (x.deadlineDate || x.dueDate || '') < todayDate && Number(x.progressPercent ?? x.progress ?? 0) < 100);
        const critical = reviews.filter(r => (r.reviewStatus || r.riskLevel) === 'Critical').length;
        const closedThisQuarter = deliverables.filter(x => x.closedOn && this.currentQuarter(new Date(x.closedOn)) === currentQuarter);
        const achievedThisQuarter = closedThisQuarter.filter(x => ['Achieved', 'Exceeded'].includes(x.finalClosureStatus || x.status)).length;
        const failedCommitments = deliverables.filter(x => (x.finalClosureStatus || x.status) === 'Failed').length;
        const highEmployees = employees.filter(e => Number(e.salary || 0) >= 100000);
        const highRisk = active.filter(x => Number(x.salary || (employees.find(e => e.id === x.empId) || {}).salary || 0) >= 100000 && ((x.deadlineDate || x.dueDate || '') < todayDate || ['Critical', 'At Risk'].includes(x.lastRiskLevel || x.currentStatus || ''))).length;
        const completionScore = deliverables.length ? Math.round(deliverables.reduce((s, x) => s + (Number(x.progressPercent ?? x.progress) || 0), 0) / deliverables.length) : 0;
        const reviewAlerts = reviews.filter(r => ['Critical', 'Attention', 'At Risk'].includes(r.reviewStatus || r.riskLevel)).length;
        const quarterlyAchievementRatio = closedThisQuarter.length ? Math.round(achievedThisQuarter / closedThisQuarter.length * 100) : 0;
        const accountabilityScore = Math.max(0, Math.round(completionScore - delayed.length * 8 - critical * 5 - failedCommitments * 10));
        return {
            total: deliverables.length,
            active: active.length,
            delayed: delayed.length,
            criticalRiskReviews: critical,
            achievedThisQuarter,
            failedCommitments,
            highAccountabilityEmployees: highEmployees.length,
            highSalaryAtRisk: highRisk,
            completionScore,
            reviewAlerts,
            quarterlyAchievementRatio,
            accountabilityScore,
            pendingReview: active.filter(x => !x.lastReviewOn).length,
            lowProgressEmployees: new Set(active.filter(x => Number(x.progress || 0) < 50).map(x => x.empId)).size
        };
    },
    // STRATEGIC_DELIVERABLES_DB_END
    
    // LIFECYCLE_MODULE_DB_START
    // ==================== ONBOARDING & EXIT LIFECYCLE ====================

    getOnboardingTaskTypes() {
        return [
            { id: 'document_collection', label: 'Document Collection' },
            { id: 'it_setup', label: 'IT Setup' },
            { id: 'induction', label: 'Induction' },
            { id: 'bank_details', label: 'Bank Details' },
            { id: 'policy_signing', label: 'Policy Signing' }
        ];
    },
    
    getOnboardingTasks(empId = null) {
        const d = this.get();
        let tasks = d.onboardingTasks || [];
        if (empId) tasks = tasks.filter(t => t.empId === this.resolveEmployeeId(empId, d));
        return tasks.sort((a, b) => (b.assignedOn || '').localeCompare(a.assignedOn || '') || (a.id || '').localeCompare(b.id || ''));
    },
    
    getOnboardingTask(id) {
        return (this.get().onboardingTasks || []).find(t => t.id === id) || null;
    },
    
    addOnboardingTask(task) {
        const d = this.get();
        if (!d.onboardingTasks) d.onboardingTasks = [];
        const nextNo = d.onboardingTasks.reduce((max, t) => Math.max(max, Number(String(t.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const taskType = task.taskType || task.type || task.task || 'document_collection';
        const typeDef = this.getOnboardingTaskTypes().find(t => t.id === taskType);
        const empId = this.resolveEmployeeId(task.empId, d);
        const newTask = {
            id: task.id || ('OB' + String(nextNo).padStart(3, '0')),
            empId: empId || '',
            taskType,
            task: task.task || (typeDef ? typeDef.label : taskType),
            notes: task.notes || '',
            completed: !!task.completed,
            status: task.completed ? 'Completed' : (task.status || 'Pending'),
            assignedOn: task.assignedOn || this.today(),
            completedOn: task.completedOn || null
        };
        d.onboardingTasks.push(newTask);
        this.save(d);
        return newTask;
    },

    updateOnboardingTask(id, fields = {}) {
        const d = this.get();
        const task = (d.onboardingTasks || []).find(t => t.id === id);
        if (!task) return false;
        if (fields.empId) fields.empId = this.resolveEmployeeId(fields.empId, d);
        Object.assign(task, fields);
        if (fields.completed !== undefined) {
            task.completed = !!fields.completed;
            task.status = task.completed ? 'Completed' : 'Pending';
            task.completedOn = task.completed ? (fields.completedOn || this.today()) : null;
        }
        this.save(d);
        return true;
    },
    
    completeOnboardingTask(taskId) {
        return this.updateOnboardingTask(taskId, { completed: true, completedOn: this.today() });
    },

    deleteOnboardingTask(id) {
        const d = this.get();
        const before = (d.onboardingTasks || []).length;
        d.onboardingTasks = (d.onboardingTasks || []).filter(t => t.id !== id);
        this.save(d);
        return d.onboardingTasks.length !== before;
    },

    getResignationRequests(empId = null) {
        const d = this.get();
        let requests = d.resignationRequests || [];
        if (empId) requests = requests.filter(r => r.empId === this.resolveEmployeeId(empId, d));
        return requests.sort((a, b) => (b.submittedOn || '').localeCompare(a.submittedOn || '') || (b.id || '').localeCompare(a.id || ''));
    },

    getResignationRequest(id) {
        return (this.get().resignationRequests || []).find(r => r.id === id) || null;
    },

    addResignationRequest(req) {
        const d = this.get();
        if (!d.resignationRequests) d.resignationRequests = [];
        const empId = this.resolveEmployeeId(req.empId, d);
        const active = d.resignationRequests.find(r => r.empId === empId && ['Pending', 'Approved'].includes(r.status));
        if (active) throw new Error('An active resignation request already exists.');
        const nextNo = d.resignationRequests.reduce((max, r) => Math.max(max, Number(String(r.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const newReq = {
            id: req.id || ('RS' + String(nextNo).padStart(3, '0')),
            empId: empId || '',
            lastWorkingDate: req.lastWorkingDate || '',
            reason: req.reason || '',
            status: req.status || 'Pending',
            submittedOn: req.submittedOn || this.today(),
            approvedOn: req.approvedOn || null,
            exitChecklist: Array.isArray(req.exitChecklist) ? req.exitChecklist : [],
            finalSettlementComplete: !!req.finalSettlementComplete,
            finalSettlementOn: req.finalSettlementOn || null,
            hrNotes: req.hrNotes || ''
        };
        d.resignationRequests.push(newReq);
        this.save(d);
        return newReq;
    },

    updateResignationRequest(id, fields = {}) {
        const d = this.get();
        const req = (d.resignationRequests || []).find(r => r.id === id);
        if (!req) return false;
        if (fields.empId) fields.empId = this.resolveEmployeeId(fields.empId, d);
        Object.assign(req, fields);
        if (fields.status === 'Approved' && !req.approvedOn) req.approvedOn = this.today();
        if (fields.finalSettlementComplete) req.finalSettlementOn = fields.finalSettlementOn || this.today();
        if (fields.status === 'Approved') this._appendAudit(d, 'hr', 'resignation approved', `Resignation ${id} approved for ${req.empId}`);
        if (fields.finalSettlementComplete) this._appendAudit(d, 'hr', 'final settlement complete', `Final settlement completed for resignation ${id}`);
        this.save(d);
        return true;
    },

    approveResignation(id) {
        return this.updateResignationRequest(id, { status: 'Approved', approvedOn: this.today() });
    },

    assignExitChecklist(id, checklist = []) {
        const items = checklist.map(item => String(item).trim()).filter(Boolean).map(item => ({ item, completed: false }));
        return this.updateResignationRequest(id, { exitChecklist: items });
    },

    markFinalSettlementComplete(id) {
        return this.updateResignationRequest(id, { finalSettlementComplete: true, finalSettlementOn: this.today() });
    },

    deleteResignationRequest(id) {
        const d = this.get();
        const before = (d.resignationRequests || []).length;
        d.resignationRequests = (d.resignationRequests || []).filter(r => r.id !== id);
        this.save(d);
        return d.resignationRequests.length !== before;
    },

    getExitInterviews(empId = null) {
        const d = this.get();
        let interviews = d.exitInterviews || [];
        if (empId) interviews = interviews.filter(x => x.empId === this.resolveEmployeeId(empId, d));
        return interviews.sort((a, b) => (b.submittedOn || '').localeCompare(a.submittedOn || '') || (b.id || '').localeCompare(a.id || ''));
    },
    
    submitExitInterview(data) {
        const d = this.get();
        if (!d.exitInterviews) d.exitInterviews = [];
        const empId = this.resolveEmployeeId(data.empId, d);
        const nextNo = d.exitInterviews.reduce((max, x) => Math.max(max, Number(String(x.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const interview = {
            id: data.id || ('EX' + String(nextNo).padStart(3, '0')),
            resignationId: data.resignationId || '',
            empId: empId || '',
            reason: data.reason || '',
            notes: data.notes || data.feedback || '',
            submittedOn: data.submittedOn || this.today()
        };
        d.exitInterviews.push(interview);
        this.save(d);
        return interview;
    },

    updateExitInterview(id, fields = {}) {
        const d = this.get();
        const interview = (d.exitInterviews || []).find(x => x.id === id);
        if (!interview) return false;
        if (fields.empId) fields.empId = this.resolveEmployeeId(fields.empId, d);
        Object.assign(interview, fields);
        this.save(d);
        return true;
    },

    deleteExitInterview(id) {
        const d = this.get();
        const before = (d.exitInterviews || []).length;
        d.exitInterviews = (d.exitInterviews || []).filter(x => x.id !== id);
        this.save(d);
        return d.exitInterviews.length !== before;
    },
    // LIFECYCLE_MODULE_DB_END
    
    // ==================== TRAINING ====================
    
    getCourses() { return this.get().courses || []; },
    getTrainings() { return this.get().training || []; },
    
    enrollInCourse(empId, courseId) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        const enrollment = { id: 'EN' + Date.now(), empId, courseId, progress: 0, status: 'In Progress', enrolledOn: this.today() };
        if (!d.courseEnrollments) d.courseEnrollments = [];
        d.courseEnrollments.push(enrollment);
        this.save(d);
        return enrollment;
    },
    
    updateCourseProgress(empId, courseId, progress) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        const enrollment = (d.courseEnrollments || []).find(e => e.empId === empId && e.courseId === courseId);
        if (enrollment) {
            enrollment.progress = Math.min(100, progress);
            enrollment.status = enrollment.progress >= 100 ? 'Completed' : 'In Progress';
            if (enrollment.status === 'Completed') enrollment.completedOn = this.today();
            this.save(d);
        }
    },
    
    getEmpTraining(empId) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        const enrollments = (d.courseEnrollments || []).filter(et => et.empId === empId);
        const courses = d.courses || [];
        return enrollments.map(et => ({ ...et, ...courses.find(c => c.id === et.courseId) }));
    },
    
    updateTrainingProgress(empId, trainingId, completed) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        const enrollment = (d.courseEnrollments || []).find(et => et.empId === empId && et.courseId === trainingId);
        if (enrollment) {
            enrollment.progress = Math.min(100, Math.floor(completed / 5 * 100));
            enrollment.status = enrollment.progress >= 100 ? 'Completed' : 'In Progress';
            if (enrollment.status === 'Completed') enrollment.completedOn = this.today();
            this.save(d);
        }
    },
    
    // ==================== DOCUMENTS ====================
    
    getDocuments() { return this.get().documents || []; },
    
    getEmpDocuments(empId) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.documents || []).filter(doc =>
            doc.assignedToAll || doc.assignedTo === officialId
        );
    },
    
    getMyUploadedDocs(empId) {
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.documents || []).filter(doc => 
            doc.source === 'employee' && doc.uploadedBy === officialId
        );
    },
    
    addDocument(doc) {
        const d = this.get();
        if (!d.documents) d.documents = [];
        if (doc.assignedTo && !['ALL', 'HR', 'MANAGER'].includes(doc.assignedTo)) doc.assignedTo = this.resolveEmployeeId(doc.assignedTo, d);
        if (doc.uploadedBy) doc.uploadedBy = this.resolveEmployeeId(doc.uploadedBy, d);
        doc.id = 'DOC' + String(d.documents.length + 1).padStart(3, '0') + '_' + Date.now();
        doc.uploadedOn = this.today();
        doc.source = doc.source || 'hr';
        d.documents.push(doc);
        
        if (doc.source === 'hr') {
            if (doc.assignedToAll) {
                d.notifications.unshift({
                    id: 'N' + Date.now(),
                    readBy: [],
                    to: 'ALL',
                    title: 'New Document: ' + doc.name,
                    msg: 'HR has shared a new document: ' + (doc.description || ''),
                    date: this.today(),
                    type: 'info'
                });
            } else if (doc.assignedTo && doc.assignedTo !== 'ALL') {
                d.notifications.unshift({
                    id: 'N' + Date.now(),
                    readBy: [],
                    to: doc.assignedTo,
                    title: 'New Document: ' + doc.name,
                    msg: 'HR has shared a document with you: ' + (doc.description || ''),
                    date: this.today(),
                    type: 'info'
                });
            }
        }
        this.save(d);
        return doc;
    },
    
    deleteDocument(id) {
        const d = this.get();
        d.documents = (d.documents || []).filter(doc => doc.id !== id);
        this.save(d);
    },
    
    // ==================== NOTIFICATIONS ====================
    
    getNotifs(recipient) {
        const roleKey = this.normalizeRoleTarget(recipient);
        if (['ALL', 'HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE'].includes(roleKey)) {
            return this.getNotificationsByRole(roleKey);
        }
        return this.getNotificationsByEmp(recipient);
    },
    
    getUnreadCount(recipient) {
        return this.getUnreadNotificationCount(recipient);
    },
    
    addNotif(notif) {
        const d = this.get();
        const target = Array.isArray(notif.to) ? notif.to[0] : notif.to;
        const roleKey = this.normalizeRoleTarget(target);
        const isRole = ['ALL', 'HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER', 'EMPLOYEE'].includes(roleKey);
        const row = this._pushNotification(
            d,
            isRole ? roleKey : '',
            isRole ? '' : target,
            notif.title,
            notif.msg || notif.message || '',
            notif.module || 'General',
            notif.type || 'info'
        );
        Object.assign(row, { ...notif, id: row.id, readBy: row.readBy, date: row.date, createdAt: row.createdAt });
        this.save(d);
        return row;
    },
    
    markRead(notifId, recipient) {
        return this.markNotificationRead(notifId, recipient);
    },
    
    markAllRead(recipient) {
        this.getNotifs(recipient).forEach(n => this.markNotificationRead(n.id, recipient));
    },
    
    deleteNotif(notifId) {
        const d = this.get();
        d.notifications = (d.notifications || []).filter(n => n.id !== notifId);
        this.save(d);
    },
    
    // ==================== PAYROLL ====================
    
    getPayroll() { return this.get().payroll || []; },
    
    getEmpPayroll(empId) { 
        const d = this.get();
        const officialId = this.resolveEmployeeId(empId, d);
        return (d.payroll || []).filter(p => p.empId === officialId); 
    },
    
    getPayrollMonths() {
        const months = [...new Set(this.get().payroll.map(p => p.payrollMonth || p.month).filter(Boolean))];
        return months.sort((a, b) => {
            try { return new Date(b + ' 1') - new Date(a + ' 1'); } catch(e) { return 0; }
        });
    },
    
    approvePayrollRecord(id, actorId = 'HR', remarks = '') {
        const d = this.get();
        const i = d.payroll.findIndex(p => (p.payrollId || p.id) === id);
        if (i > -1) {
            d.payroll[i].status = 'Approved';
            d.payroll[i].payrollStatus = 'Approved';
            d.payroll[i].approvedBy = actorId || 'HR';
            d.payroll[i].approvedAt = new Date().toISOString();
            d.payroll[i].remarks = remarks || d.payroll[i].remarks || '';
            this._appendAudit(d, 'hr', 'payroll approved', `Payroll ${id} approved`, 'Payroll', id, actorId || '');
            this.save(d);
            this._emitWorkflowEvent('PAYROLL_APPROVED', {
                actorRole: 'hr',
                actorId: actorId || '',
                module: 'Payroll',
                targetId: id,
                empId: d.payroll[i].empId,
                targetEmpId: d.payroll[i].empId,
                message: `Payroll ${id} approved for ${d.payroll[i].payrollMonth || d.payroll[i].month}.`,
                priority: 'HIGH'
            });
            return d.payroll[i];
        }
        return null;
    },
    
    markPayrollPaid(id, paidOn, actorId = 'HR') {
        const d = this.get();
        const i = d.payroll.findIndex(p => (p.payrollId || p.id) === id);
        if (i > -1) {
            d.payroll[i].status = 'Paid';
            d.payroll[i].payrollStatus = 'Paid';
            d.payroll[i].paidOn = paidOn || this.today();
            d.payroll[i].paidAt = new Date().toISOString();
            this._appendAudit(d, 'hr', 'payroll paid', `Payroll ${id} marked paid`, 'Payroll', id, actorId || '');
            this.save(d);
            this._emitWorkflowEvent('PAYROLL_PAID', {
                actorRole: 'hr',
                actorId: actorId || '',
                module: 'Payroll',
                targetId: id,
                empId: d.payroll[i].empId,
                targetEmpId: d.payroll[i].empId,
                message: `Salary paid for ${d.payroll[i].empId} (${d.payroll[i].payrollMonth || d.payroll[i].month}).`,
                priority: 'HIGH'
            });
            return d.payroll[i];
        }
        return null;
    },
    
    // ==================== CUSTOM REPORTS ====================
    
    getCustomReports() { return this.get().customReports || []; },
    
    saveCustomReport(report) {
        const d = this.get();
        if (!d.customReports) d.customReports = [];
        report.id = 'CR' + String(d.customReports.length + 1).padStart(3, '0') + '_' + Date.now();
        report.savedOn = this.today();
        d.customReports.push(report);
        this.save(d);
        return report;
    },
    
    deleteCustomReport(id) {
        const d = this.get();
        d.customReports = (d.customReports || []).filter(r => r.id !== id);
        this.save(d);
    },
    
    // ==================== WHATSAPP ====================
    
    getWhatsappLogs() { return this.get().whatsappLogs || []; },
    
    sendWhatsApp(mobile, empName, event, details) {
        const templates = {
            leave_approved: `✅ Hi ${empName}, your leave request (${details}) has been APPROVED by HR. – ArthHRMS`,
            leave_rejected: `❌ Hi ${empName}, your leave request (${details}) has been REJECTED by HR. – ArthHRMS`,
            salary_credited: `💰 Hi ${empName}, your salary of ₹${details} has been credited. – ArthHRMS`,
            custom: details
        };
        const message = templates[event] || details;
        const log = { 
            id: 'WA' + Date.now(), 
            mobile, 
            empName, 
            event, 
            message, 
            status: 'simulated', 
            sent: new Date().toISOString() 
        };
        
        const d = this.get();
        if (!d.whatsappLogs) d.whatsappLogs = [];
        d.whatsappLogs.unshift(log);
        if (d.whatsappLogs.length > 200) d.whatsappLogs = d.whatsappLogs.slice(0, 200);
        this.save(d);
        return log;
    },
    
    // ==================== ANALYTICS ====================
    
    getAnalytics() {
        const d = this.get();
        const t = this.today();
        const att = d.attendance.filter(a => a.date === t);
        const total = d.employees.length;
        const present = att.filter(a => a.status === 'Present').length;
        const late = att.filter(a => a.status === 'Late').length;
        const onLeave = att.filter(a => a.status === 'Leave').length;
        const absent = att.filter(a => a.status === 'Absent').length;
        
        const dates = [...new Set(d.attendance.map(a => a.date))].sort().slice(-7);
        const trend = dates.map(date => {
            const recs = d.attendance.filter(a => a.date === date);
            return { date, present: recs.filter(a => a.status === 'Present' || a.status === 'Late').length, absent: recs.filter(a => a.status === 'Absent').length };
        });
        
        const deptMap = {};
        d.employees.forEach(e => { deptMap[e.dept] = (deptMap[e.dept] || 0) + 1; });
        
        const pendingLeave = d.leaveRequests.filter(l => l.status === 'Pending').length;
        const totalPayroll = d.payroll.reduce((s, p) => s + (p.net || 0), 0);
        
        return { total, present, late, onLeave, absent, trend, deptMap, pendingLeave, totalPayroll };
    },
    
    // ==================== ROSTER ====================
    
    getRoster() { return this.get().roster || {}; },
    
    updateRoster(empId, date, value) {
        const d = this.get();
        empId = this.resolveEmployeeId(empId, d);
        if (!d.roster) d.roster = {};
        if (!d.roster[empId]) d.roster[empId] = {};
        if (value === '') delete d.roster[empId][date];
        else d.roster[empId][date] = value;
        this.save(d);
    },

    // ==================== ADMIN HR OPERATIONS DESK ====================

    getDocumentVerifications(empId = null) {
        const d = this.get();
        let rows = d.documentVerifications || [];
        if (empId) rows = rows.filter(r => r.empId === this.resolveEmployeeId(empId, d));
        return rows.sort((a, b) => (b.savedOn || '').localeCompare(a.savedOn || '') || (b.id || '').localeCompare(a.id || ''));
    },

    saveDocumentVerification(record) {
        const d = this.get();
        if (!d.documentVerifications) d.documentVerifications = [];
        const empId = this.resolveEmployeeId(record.empId, d);
        const nextNo = d.documentVerifications.reduce((max, r) => Math.max(max, Number(String(r.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const row = {
            id: record.id || ('DV' + String(nextNo).padStart(3, '0')),
            empId: empId || '',
            aadhaarStatus: record.aadhaarStatus || 'Missing',
            panStatus: record.panStatus || 'Missing',
            bankStatus: record.bankStatus || 'Missing',
            educationStatus: record.educationStatus || 'Missing',
            joiningStatus: record.joiningStatus || 'Missing',
            remark: record.remark || '',
            savedOn: record.savedOn || this.today()
        };
        d.documentVerifications.unshift(row);
        this.save(d);
        this._emitWorkflowEvent('DOCUMENT_VERIFICATION_SAVED', {
            actorRole: 'admin',
            module: 'Documents',
            targetId: row.id,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: ['Missing', 'Reupload Required'].some(s => [row.aadhaarStatus, row.panStatus, row.bankStatus, row.educationStatus, row.joiningStatus].includes(s)) ? 'HIGH' : 'LOW',
            message: `Document verification saved for ${row.empId}`,
            metadata: { empId: row.empId, verificationId: row.id }
        });
        return row;
    },

    getAttendanceRegularizations(empId = null) {
        const d = this.get();
        let rows = d.attendanceRegularizations || [];
        if (empId) rows = rows.filter(r => r.empId === this.resolveEmployeeId(empId, d));
        return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
    },

    requestAttendanceRegularization(record) {
        const d = this.get();
        if (!d.attendanceRegularizations) d.attendanceRegularizations = [];
        const empId = this.resolveEmployeeId(record.empId, d);
        const nextNo = d.attendanceRegularizations.reduce((max, r) => Math.max(max, Number(String(r.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const row = {
            id: record.id || ('AR' + String(nextNo).padStart(3, '0')),
            empId: empId || '',
            date: record.date || this.today(),
            checkIn: record.checkIn || null,
            checkOut: record.checkOut || null,
            reason: record.reason || '',
            status: 'Pending',
            requestedOn: record.requestedOn || this.today(),
            savedOn: record.savedOn || null
        };
        d.attendanceRegularizations.unshift(row);
        const emp = (d.employees || []).find(e => e.id === row.empId);
        this._pushNotification(d, 'ADMIN', '', 'Attendance Regularization Request', `${emp?.name || row.empId} requested attendance correction for ${row.date}.`, 'Attendance Regularization', 'info');
        this._appendAudit(d, 'employee', 'attendance regularization requested', `Attendance correction requested for ${row.empId} on ${row.date}`, 'Attendance Regularization', row.id, row.empId);
        this.save(d);
        this._emitWorkflowEvent('ATTENDANCE_REGULARIZATION_REQUESTED', {
            actorRole: 'employee',
            actorId: row.empId,
            module: 'Attendance Regularization',
            targetId: row.id,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: 'MEDIUM',
            message: `Attendance correction requested for ${row.empId} on ${row.date}`,
            metadata: { empId: row.empId, date: row.date, checkIn: row.checkIn, checkOut: row.checkOut }
        });
        return row;
    },

    addAttendanceRegularization(record) {
        const d = this.get();
        if (!d.attendanceRegularizations) d.attendanceRegularizations = [];
        if (!d.attendance) d.attendance = [];
        const empId = this.resolveEmployeeId(record.empId, d);
        const nextNo = d.attendanceRegularizations.reduce((max, r) => Math.max(max, Number(String(r.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const checkIn = record.checkIn || null;
        const checkOut = record.checkOut || null;
        const row = {
            id: record.id || ('AR' + String(nextNo).padStart(3, '0')),
            empId: empId || '',
            date: record.date || this.today(),
            checkIn,
            checkOut,
            reason: record.reason || '',
            status: record.status || 'Approved',
            decidedOn: record.decidedOn || this.today(),
            savedOn: record.savedOn || this.today()
        };
        d.attendanceRegularizations.unshift(row);
        let att = d.attendance.find(a => a.empId === row.empId && a.date === row.date);
        if (!att) {
            const attendanceId = this.generateAttendanceId(d);
            att = { id: attendanceId, attendanceId, empId: row.empId, date: row.date, attendanceDate: row.date, checkIn: null, checkOut: null, status: 'Absent', shiftId: null, workingHours: null, lateMinutes: 0, regularizationStatus: 'None' };
            d.attendance.push(att);
        }
        const emp = (d.employees || []).find(e => e.id === row.empId);
        att.checkIn = checkIn;
        att.checkOut = checkOut;
        att.shiftId = emp?.shiftId || att.shiftId || 'SH002';
        att.status = checkIn ? 'Present' : 'Absent';
        att.workingHours = checkIn && checkOut ? this.calcWorkingHours(checkIn, checkOut) : null;
        this._pushNotification(d, '', row.empId, 'Attendance Regularized', `Attendance corrected for ${row.date}.${row.reason ? ' Reason: ' + row.reason : ''}`, 'Attendance Regularization', 'success');
        this._pushNotification(d, 'HR', '', 'Attendance Regularization Completed', `Admin corrected attendance for ${row.empId} on ${row.date}.`, 'Attendance Regularization', 'info');
        this._appendAudit(d, 'admin', 'attendance regularized', `Attendance corrected for ${row.empId} on ${row.date}`, 'Attendance Regularization', row.id);
        this.save(d);
        this._emitWorkflowEvent('ATTENDANCE_REGULARIZATION_APPROVED', {
            actorRole: 'admin',
            module: 'Attendance Regularization',
            targetId: row.id,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: 'LOW',
            message: `Attendance corrected for ${row.empId} on ${row.date}`,
            metadata: { empId: row.empId, date: row.date, checkIn: row.checkIn, checkOut: row.checkOut }
        });
        return row;
    },

    updateAttendanceRegularizationStatus(id, status, note = '') {
        const d = this.get();
        const row = (d.attendanceRegularizations || []).find(r => r.id === id);
        if (!row) return false;
        row.status = status || row.status || 'Approved';
        row.decisionNote = note;
        if (row.status === 'Approved') {
            let att = (d.attendance || []).find(a => a.empId === row.empId && a.date === row.date);
            if (!att) {
                if (!d.attendance) d.attendance = [];
                const attendanceId = this.generateAttendanceId(d);
                att = { id: attendanceId, attendanceId, empId: row.empId, date: row.date, attendanceDate: row.date, checkIn: null, checkOut: null, status: 'Absent', shiftId: null, workingHours: null, lateMinutes: 0, regularizationStatus: 'None' };
                d.attendance.push(att);
            }
            const emp = (d.employees || []).find(e => e.id === row.empId);
            att.checkIn = row.checkIn || null;
            att.checkOut = row.checkOut || null;
            att.shiftId = emp?.shiftId || att.shiftId || 'SH002';
            att.status = row.checkIn ? 'Present' : 'Absent';
            att.workingHours = row.checkIn && row.checkOut ? this.calcWorkingHours(row.checkIn, row.checkOut) : null;
            row.decidedOn = this.today();
            row.savedOn = this.today();
            this._pushNotification(d, '', row.empId, 'Attendance Regularization Approved', `Attendance correction request ${row.id} was approved.${note ? ' Note: ' + note : ''}`, 'Attendance Regularization', 'success');
            this._pushNotification(d, 'HR', '', 'Attendance Regularization Approved', `Admin approved request ${row.id} for ${row.empId}.`, 'Attendance Regularization', 'info');
            this._appendAudit(d, 'admin', 'attendance regularization approved', `Attendance regularization ${row.id} approved`, 'Attendance Regularization', row.id);
            this.save(d);
            this._emitWorkflowEvent('ATTENDANCE_REGULARIZATION_APPROVED', {
                actorRole: 'admin',
                module: 'Attendance Regularization',
                targetId: row.id,
                empId: row.empId,
                targetEmpId: row.empId,
                priority: 'LOW',
                message: `Attendance regularization ${row.id} approved`,
                metadata: { empId: row.empId, date: row.date, checkIn: row.checkIn, checkOut: row.checkOut }
            });
            return true;
        }
        this._pushNotification(d, '', row.empId, 'Attendance Regularization ' + row.status, `Attendance correction request ${row.id} was ${String(row.status).toLowerCase()}.${note ? ' Note: ' + note : ''}`, 'Attendance Regularization', row.status === 'Rejected' ? 'warn' : 'info');
        this._pushNotification(d, 'HR', '', 'Attendance Regularization ' + row.status, `Admin marked request ${row.id} ${row.status}.`, 'Attendance Regularization', row.status === 'Rejected' ? 'warn' : 'info');
        this._appendAudit(d, 'admin', 'attendance regularization ' + String(row.status).toLowerCase(), `Attendance regularization ${row.id} ${row.status}`, 'Attendance Regularization', row.id);
        this.save(d);
        this._emitWorkflowEvent(row.status === 'Rejected' ? 'ATTENDANCE_REGULARIZATION_REJECTED' : 'ATTENDANCE_REGULARIZATION_APPROVED', {
            actorRole: 'admin',
            module: 'Attendance Regularization',
            targetId: row.id,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: row.status === 'Rejected' ? 'HIGH' : 'MEDIUM',
            message: `Attendance regularization ${row.id} ${row.status}`,
            metadata: { empId: row.empId, date: row.date, checkIn: row.checkIn, checkOut: row.checkOut }
        });
        return true;
    },

    getHelpdeskTickets(filters = {}) {
        const d = this.get();
        let rows = d.helpdeskTickets || [];
        if (filters.empId) rows = rows.filter(t => t.empId === this.resolveEmployeeId(filters.empId, d));
        if (filters.status) rows = rows.filter(t => t.status === filters.status);
        return rows.sort((a, b) => (b.createdOn || '').localeCompare(a.createdOn || '') || (b.id || '').localeCompare(a.id || ''));
    },

    getHelpdeskTicket(id) {
        return (this.get().helpdeskTickets || []).find(t => t.id === id) || null;
    },

    addHelpdeskTicket(ticket) {
        const d = this.get();
        if (!d.helpdeskTickets) d.helpdeskTickets = [];
        const empId = this.resolveEmployeeId(ticket.empId, d);
        const row = {
            id: ticket.id || this.generateHelpdeskTicketId(d),
            empId: empId || '',
            category: ticket.category || 'Other',
            issueDescription: ticket.issueDescription || '',
            status: ticket.status || 'Open',
            resolutionNote: ticket.resolutionNote || '',
            createdByRole: ticket.createdByRole || ticket.actorRole || 'employee',
            createdOn: ticket.createdOn || this.today(),
            resolvedOn: ticket.status === 'Resolved' ? (ticket.resolvedOn || this.today()) : (ticket.resolvedOn || null)
        };
        d.helpdeskTickets.unshift(row);
        if (row.createdByRole === 'employee') {
            const emp = (d.employees || []).find(e => e.id === row.empId);
            this._pushNotification(d, 'ADMIN', '', 'New Helpdesk Ticket', `${emp?.name || row.empId} raised ${row.category}: ${row.issueDescription}`, 'Helpdesk', 'info');
        }
        this._appendAudit(d, row.createdByRole, 'helpdesk ticket created', `Helpdesk ticket ${row.id} created for ${row.empId}`, 'Helpdesk', row.id, row.empId);
        this.save(d);
        this._emitWorkflowEvent('HELPDESK_TICKET_RAISED', {
            actorRole: row.createdByRole,
            actorId: row.empId,
            module: 'Helpdesk',
            targetId: row.id,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: row.status === 'Open' ? 'MEDIUM' : 'LOW',
            message: `Helpdesk ticket ${row.id} created for ${row.empId}`,
            metadata: { empId: row.empId, ticketId: row.id, category: row.category, status: row.status }
        });
        return row;
    },

    updateHelpdeskTicket(id, fields = {}) {
        const d = this.get();
        const ticket = (d.helpdeskTickets || []).find(t => t.id === id);
        if (!ticket) return false;
        if (fields.empId) fields.empId = this.resolveEmployeeId(fields.empId, d);
        Object.assign(ticket, fields);
        if (fields.status === 'Resolved' && !ticket.resolvedOn) {
            ticket.resolvedOn = this.today();
            this._pushNotification(d, '', ticket.empId, 'Helpdesk Ticket Resolved', `Ticket ${ticket.id} has been resolved.${ticket.resolutionNote ? ' Note: ' + ticket.resolutionNote : ''}`, 'Helpdesk', 'success');
            this._appendAudit(d, 'admin', 'helpdesk ticket resolved', `Helpdesk ticket ${ticket.id} resolved`, 'Helpdesk', ticket.id);
        } else {
            this._appendAudit(d, 'admin', 'helpdesk ticket updated', `Helpdesk ticket ${ticket.id} updated`, 'Helpdesk', ticket.id);
        }
        this.save(d);
        this._emitWorkflowEvent(ticket.status === 'Resolved' ? 'HELPDESK_TICKET_RESOLVED' : 'HELPDESK_TICKET_RAISED', {
            actorRole: 'admin',
            module: 'Helpdesk',
            targetId: ticket.id,
            empId: ticket.empId,
            targetEmpId: ticket.empId,
            priority: ticket.status === 'Resolved' ? 'LOW' : 'MEDIUM',
            message: `Helpdesk ticket ${ticket.id} ${ticket.status || 'updated'}`,
            metadata: { empId: ticket.empId, ticketId: ticket.id, category: ticket.category, status: ticket.status }
        });
        return true;
    },

    deleteHelpdeskTicket(id) {
        const d = this.get();
        const before = (d.helpdeskTickets || []).length;
        d.helpdeskTickets = (d.helpdeskTickets || []).filter(t => t.id !== id);
        this.save(d);
        return d.helpdeskTickets.length !== before;
    },

    getOnboardingCollections(empId = null) {
        const d = this.get();
        let rows = d.onboardingCollections || [];
        if (empId) rows = rows.filter(c => c.empId === this.resolveEmployeeId(empId, d));
        return rows.sort((a, b) => (b.savedOn || '').localeCompare(a.savedOn || '') || (b.id || '').localeCompare(a.id || ''));
    },

    saveOnboardingCollection(record) {
        const d = this.get();
        if (!d.onboardingCollections) d.onboardingCollections = [];
        const empId = this.resolveEmployeeId(record.empId, d);
        const nextNo = d.onboardingCollections.reduce((max, c) => Math.max(max, Number(String(c.id || '').replace(/\D/g, '')) || 0), 0) + 1;
        const row = {
            id: record.id || ('OC' + String(nextNo).padStart(3, '0')),
            empId: empId || '',
            photoSubmitted: !!record.photoSubmitted,
            bankFormSubmitted: !!record.bankFormSubmitted,
            idProofSubmitted: !!record.idProofSubmitted,
            educationProofSubmitted: !!record.educationProofSubmitted,
            policySigned: !!record.policySigned,
            welcomeKitIssued: !!record.welcomeKitIssued,
            savedOn: record.savedOn || this.today()
        };
        const idx = d.onboardingCollections.findIndex(c => c.empId === row.empId);
        if (idx > -1) d.onboardingCollections[idx] = { ...d.onboardingCollections[idx], ...row, id: d.onboardingCollections[idx].id };
        else d.onboardingCollections.unshift(row);
        this._pushNotification(d, '', row.empId, 'Onboarding Documents Updated', 'Your onboarding document collection status has been updated by HR operations.', 'Onboarding', 'info');
        this._pushNotification(d, 'HR', '', 'Onboarding Collection Updated', `Onboarding collection saved for ${row.empId}.`, 'Onboarding', 'info');
        this._appendAudit(d, 'admin', 'onboarding collection saved', `Onboarding collection saved for ${row.empId}`, 'Onboarding', row.id);
        this.save(d);
        this._emitWorkflowEvent('ONBOARDING_COLLECTION_SAVED', {
            actorRole: 'admin',
            module: 'Onboarding',
            targetId: row.id,
            empId: row.empId,
            targetEmpId: row.empId,
            priority: [row.photoSubmitted, row.bankFormSubmitted, row.idProofSubmitted, row.educationProofSubmitted, row.policySigned, row.welcomeKitIssued].every(Boolean) ? 'LOW' : 'MEDIUM',
            message: `Onboarding collection saved for ${row.empId}`,
            metadata: { empId: row.empId, onboardingCollectionId: row.id }
        });
        return idx > -1 ? d.onboardingCollections[idx] : row;
    },

    // ==================== IMPORT / EXPORT FOUNDATION ====================

    bulkImportEmployees(rows = []) {
        const d = this.get();
        if (!d.employees) d.employees = [];
        let imported = 0, updated = 0, skipped = 0;
        const errors = [];
        rows.forEach((row, idx) => {
            try {
                const name = this.normalizeText(row.name || row.Name || row.fullName || row['Full Name']);
                if (!name) { skipped++; errors.push(`Row ${idx + 1}: missing employee name`); return; }
                const rawId = this.normalizeEmployeeIdText(row.empId || row.employeeId || row.id || row.EmpID || row.EmployeeID || row.employeeCode || '');
                const officialId = rawId ? this.resolveEmployeeId(rawId, d) : '';
                const existing = officialId && (d.employees || []).find(e => e.id === officialId);
                const payload = this.normalizeEmployeePayload({
                    id: existing?.id,
                    name,
                    email: row.email || row.Email || existing?.email || '',
                    mobile: row.mobile || row.Mobile || existing?.mobile || '',
                    dept: row.dept || row.department || row.Department || existing?.dept || 'General',
                    desig: row.desig || row.designation || row.Designation || existing?.desig || 'Employee',
                    doj: row.doj || row.DOJ || existing?.doj || '',
                    dob: row.dob || row.DOB || existing?.dob || '',
                    salary: row.salary || row.Salary || existing?.salary || 0,
                    managerId: row.managerId || row.ManagerID || existing?.managerId || null,
                    branch: row.branch || row.location || row.Location || existing?.branch || 'Head Office',
                    address: row.address || row.Address || existing?.address || '',
                    authStatus: existing?.authStatus || 'Invite Required',
                    inviteStatus: existing?.inviteStatus || 'Not Invited',
                    activationStatus: existing?.activationStatus || 'Not Activated',
                    leaveBalance: row.leaveBalance ?? existing?.leaveBalance
                }, d);
                if (payload.managerId) payload.managerId = this.resolveEmployeeId(payload.managerId, d);
                if (existing) {
                    Object.assign(existing, payload, { id: existing.id });
                    updated++;
                } else {
                    payload.id = rawId && this.isOfficialEmployeeId(rawId) && !d.employees.some(e => e.id === rawId) ? rawId : this.generateEmployeeId(d);
                    payload.empId = payload.id;
                    payload.employeeId = payload.id;
                    payload.employeeCode = payload.employeeCode || (rawId && !this.isOfficialEmployeeId(rawId) ? rawId : payload.id);
                    payload.companyEmployeeCode = payload.companyEmployeeCode || payload.employeeCode;
                    if (rawId && rawId !== payload.id) {
                        payload.legacyEmpId = rawId;
                        payload.legacyIds = Array.from(new Set([...(payload.legacyIds || []), rawId]));
                    }
                    d.employees.push(payload);
                    imported++;
                }
            } catch (err) {
                skipped++;
                errors.push(`Row ${idx + 1}: ${err.message || err}`);
            }
        });
        this.normalizeDataArchitecture(d);
        if (!d.importLogs) d.importLogs = [];
        const logId = this.generateRecordId('importLog', d);
        const log = { id: logId, importId: logId, type: 'employees', importType: 'employees', fileName: 'bulkImportEmployees', totalRows: rows.length, successRows: imported + updated, failedRows: skipped, duplicateRows: updated, imported, updated, skipped, errors, importedBy: 'system', importedAt: new Date().toISOString(), date: this.today() };
        d.importLogs.unshift(log);
        this.save(d);
        return log;
    },

    bulkImportAttendance(rows = []) {
        const d = this.get();
        if (!d.attendance) d.attendance = [];
        let imported = 0, updated = 0, skipped = 0;
        const errors = [];
        rows.forEach((row, idx) => {
            const empId = this.resolveEmployeeId(row.empId || row.employeeId || row.EmpID || row.EmployeeID, d);
            const date = row.date || row.Date;
            if (!empId || !date || !d.employees.some(e => e.id === empId)) { skipped++; errors.push(`Row ${idx + 1}: invalid employee/date`); return; }
            const checkIn = row.checkIn || row.CheckIn || null;
            const checkOut = row.checkOut || row.CheckOut || null;
            const rec = {
                empId, date, checkIn, checkOut,
                attendanceDate: date,
                status: row.status || row.Status || (checkIn ? 'Present' : 'Absent'),
                shiftId: row.shiftId || row.ShiftID || (d.employees.find(e => e.id === empId)?.shiftId || 'SH002'),
                workingHours: row.workingHours || row.WorkingHours || (checkIn && checkOut ? this.calcWorkingHours(checkIn, checkOut) : null),
                regularizationStatus: row.regularizationStatus || row.RegularizationStatus || 'None',
                lateMinutes: Number(row.lateMinutes || row.LateMinutes || 0)
            };
            const existing = d.attendance.find(a => a.empId === empId && a.date === date);
            if (existing) {
                const attendanceId = existing.attendanceId || existing.id || this.generateAttendanceId(d);
                Object.assign(existing, rec, { id: existing.id || attendanceId, attendanceId });
                updated++;
            }
            else {
                const attendanceId = this.generateAttendanceId(d);
                d.attendance.push({ id: attendanceId, attendanceId, ...rec });
                imported++;
            }
        });
        if (!d.importLogs) d.importLogs = [];
        const logId = this.generateRecordId('importLog', d);
        const log = { id: logId, importId: logId, type: 'attendance', importType: 'attendance', fileName: 'bulkImportAttendance', totalRows: rows.length, successRows: imported + updated, failedRows: skipped, duplicateRows: updated, imported, updated, skipped, errors, importedBy: 'system', importedAt: new Date().toISOString(), date: this.today() };
        d.importLogs.unshift(log);
        this.save(d);
        return log;
    },

    bulkImportPayroll(rows = []) {
        const d = this.get();
        if (!d.payroll) d.payroll = [];
        let imported = 0, updated = 0, skipped = 0;
        const errors = [];
        rows.forEach((row, idx) => {
            const empId = this.resolveEmployeeId(row.empId || row.employeeId || row.EmpID || row.EmployeeID, d);
            const month = row.month || row.Month;
            if (!empId || !month || !d.employees.some(e => e.id === empId)) { skipped++; errors.push(`Row ${idx + 1}: invalid employee/month`); return; }
            const basic = Number(row.basic || row.Basic || 0), hra = Number(row.hra || row.HRA || 0);
            const special = Number(row.special || row.Special || 0), transport = Number(row.transport || row.Transport || 0);
            const pf = Number(row.pf || row.PF || 0), esic = Number(row.esic || row.ESIC || 0), pt = Number(row.pt || row.PT || 0), tds = Number(row.tds || row.TDS || 0);
            const deductions = pf + esic + pt + tds + Number(row.leaveDeductions || row.LeaveDeductions || 0);
            const expenseReimbursements = Number(row.expenseReimbursements || row.ExpenseReimbursements || 0);
            const overtimeAmount = Number(row.overtimeAmount || row.OvertimeAmount || 0);
            const bonusAmount = Number(row.bonusAmount || row.BonusAmount || 0);
            const allowances = Number(row.allowances || row.Allowances || (hra + special + transport));
            const gross = Number(row.gross || row.Gross || row.grossSalary || (basic + allowances + overtimeAmount + bonusAmount));
            const net = Math.max(0, Number(row.net || row.Net || row.netSalary || (gross + expenseReimbursements - deductions)));
            const payrollStatus = row.payrollStatus || row.PayrollStatus || row.status || row.Status || 'Pending';
            const rec = { id: row.id || row.ID || row.payrollId || row.PayrollID || this.generatePayrollId(d), empId, month, payrollMonth: month, basic, basicSalary: basic, hra, special, transport, allowances, pf, esic, pt, tds, deductions: pf + esic + pt + tds, leaveDeductions: Number(row.leaveDeductions || row.LeaveDeductions || 0), expenseReimbursements, overtimeAmount, bonusAmount, gross, grossSalary: gross, net, netSalary: net, status: payrollStatus, payrollStatus, paidOn: row.paidOn || row.PaidOn || null, processedAt: row.processedAt || row.ProcessedAt || new Date().toISOString(), remarks: row.remarks || row.Remarks || '' };
            rec.payrollId = rec.id;
            const existing = d.payroll.find(p => p.empId === empId && (p.payrollMonth || p.month) === month);
            if (existing) { Object.assign(existing, rec, { id: existing.id, payrollId: existing.payrollId || existing.id }); updated++; }
            else { d.payroll.push(rec); imported++; }
        });
        if (!d.importLogs) d.importLogs = [];
        const logId = this.generateRecordId('importLog', d);
        const log = { id: logId, importId: logId, type: 'payroll', importType: 'payroll', fileName: 'bulkImportPayroll', totalRows: rows.length, successRows: imported + updated, failedRows: skipped, duplicateRows: updated, imported, updated, skipped, errors, importedBy: 'system', importedAt: new Date().toISOString(), date: this.today() };
        d.importLogs.unshift(log);
        this.normalizeDataArchitecture(d);
        this.save(d);
        return log;
    },

    exportEmployeesData() {
        return (this.get().employees || []).map(e => ({
            empId: e.id,
            employeeCode: e.employeeCode || e.id,
            legacyEmpId: e.legacyEmpId || '',
            name: e.name || '',
            department: e.dept || e.department || '',
            designation: e.desig || e.designation || '',
            branch: e.branch || '',
            location: e.location || '',
            managerId: e.managerId || '',
            email: e.email || '',
            mobile: e.mobile || '',
            salary: Number(e.salary || 0),
            doj: e.doj || '',
            leaveBalance: Number(e.leaveBalance || 0),
            accountabilityTier: e.accountabilityTier || ''
        }));
    },

    exportAttendanceData() {
        const d = this.get();
        return (d.attendance || []).map(a => {
            const e = (d.employees || []).find(emp => emp.id === a.empId) || {};
            return {
                empId: a.empId,
                name: e.name || '',
                department: e.dept || '',
                date: a.date,
                checkIn: a.checkIn || '',
                checkOut: a.checkOut || '',
                workingHours: a.workingHours || '',
                status: a.status || '',
                shiftId: a.shiftId || ''
            };
        });
    },
    
    // ==================== IMPORT LOGS ====================
    
    getImportLogs() { return this.get().importLogs || []; },
    
    addImportLog(log) {
        const d = this.get();
        if (!d.importLogs) d.importLogs = [];
        const row = {
            importId: log.importId || log.id || this.generateRecordId('importLog', d),
            id: log.id || log.importId || this.generateRecordId('importLog', d),
            importType: log.importType || log.type || 'unknown',
            type: log.type || log.importType || 'unknown',
            fileName: log.fileName || '',
            totalRows: Number(log.totalRows || 0),
            successRows: Number(log.successRows ?? log.imported ?? 0),
            failedRows: Number(log.failedRows ?? log.errors?.length ?? log.errors ?? 0) || 0,
            duplicateRows: Number(log.duplicateRows ?? log.dupes ?? 0),
            imported: Number(log.imported || 0),
            updated: Number(log.updated || 0),
            skipped: Number(log.skipped || 0),
            errors: Array.isArray(log.errors) ? log.errors : [],
            importedBy: log.importedBy || 'HR',
            importedAt: log.importedAt || new Date().toISOString(),
            backend: log.backend || 'local',
            importBatchId: log.importBatchId || '',
            status: log.status || 'Committed',
            rollbackEligible: log.rollbackEligible !== undefined ? !!log.rollbackEligible : false,
            date: log.date || this.today()
        };
        d.importLogs.unshift(row);
        this.save(d);
        return row;
    },

    getImportBatches() { return this.get().importBatches || []; },

    getImportBatch(importBatchId) {
        return (this.get().importBatches || []).find(b => b.importBatchId === importBatchId || b.id === importBatchId) || null;
    },

    getImportStagingRows(importBatchId = '') {
        const rows = this.get().importStagingRows || [];
        return importBatchId ? rows.filter(r => r.importBatchId === importBatchId) : rows;
    },

    saveImportBatch(batch = {}) {
        const d = this.get();
        if (!d.importBatches) d.importBatches = [];
        const importBatchId = batch.importBatchId || batch.id || this.generateImportBatchId(d);
        const row = {
            id: importBatchId,
            importBatchId,
            importType: batch.importType || batch.type || 'unknown',
            type: batch.type || batch.importType || 'unknown',
            fileName: batch.fileName || '',
            uploadedBy: batch.uploadedBy || 'HR',
            uploadedRole: batch.uploadedRole || 'hr',
            uploadedAt: batch.uploadedAt || new Date().toISOString(),
            totalRows: Number(batch.totalRows || 0),
            passedRows: Number(batch.passedRows || batch.successRows || 0),
            warningRows: Number(batch.warningRows || 0),
            failedRows: Number(batch.failedRows || 0),
            committedRows: Number(batch.committedRows || 0),
            skippedRows: Number(batch.skippedRows || 0),
            status: batch.status || 'Staged',
            backend: batch.backend || 'local',
            rollbackEligible: batch.rollbackEligible !== undefined ? !!batch.rollbackEligible : true,
            validationSummary: batch.validationSummary || {},
            commitSummary: batch.commitSummary || {},
            rollbackSummary: batch.rollbackSummary || {},
            rollbackItems: Array.isArray(batch.rollbackItems) ? batch.rollbackItems : [],
            committedBy: batch.committedBy || '',
            committedAt: batch.committedAt || null,
            cancelledBy: batch.cancelledBy || '',
            cancelledAt: batch.cancelledAt || null,
            rolledBackBy: batch.rolledBackBy || '',
            rolledBackAt: batch.rolledBackAt || null
        };
        const idx = d.importBatches.findIndex(b => b.importBatchId === importBatchId || b.id === importBatchId);
        if (idx > -1) d.importBatches[idx] = { ...d.importBatches[idx], ...row };
        else d.importBatches.unshift(row);
        this.save(d);
        return row;
    },

    saveImportStagingRows(importBatchId, rows = []) {
        const d = this.get();
        if (!d.importStagingRows) d.importStagingRows = [];
        d.importStagingRows = d.importStagingRows.filter(r => r.importBatchId !== importBatchId);
        rows.forEach(row => {
            const stagingId = row.stagingId || row.id || this.generateImportStagingRowId(d);
            d.importStagingRows.push({
                id: stagingId,
                stagingId,
                importBatchId,
                importType: row.importType || row.type || 'unknown',
                type: row.type || row.importType || 'unknown',
                rowNumber: Number(row.rowNumber || row._rowIndex || 0),
                rawRowData: row.rawRowData || {},
                validationStatus: row.validationStatus || row._status || 'PENDING',
                validationErrors: Array.isArray(row.validationErrors) ? row.validationErrors : (row._errors || []),
                validationWarnings: Array.isArray(row.validationWarnings) ? row.validationWarnings : (row._warnings || []),
                normalizedData: row.normalizedData || {},
                uploadedBy: row.uploadedBy || 'HR',
                uploadedAt: row.uploadedAt || new Date().toISOString(),
                committed: !!row.committed,
                committedAt: row.committedAt || null,
                liveRecordId: row.liveRecordId || '',
                rollbackMetadata: row.rollbackMetadata || {}
            });
        });
        this.save(d);
        return d.importStagingRows.filter(r => r.importBatchId === importBatchId);
    },

    updateImportStagingRows(importBatchId, updater) {
        const d = this.get();
        if (!d.importStagingRows) d.importStagingRows = [];
        d.importStagingRows = d.importStagingRows.map(row => row.importBatchId === importBatchId ? updater({ ...row }) : row);
        this.save(d);
        return d.importStagingRows.filter(r => r.importBatchId === importBatchId);
    },

    addImportRollbackLog(log = {}) {
        const d = this.get();
        if (!d.importRollbackLogs) d.importRollbackLogs = [];
        const rollbackId = log.rollbackId || log.id || this.generateImportRollbackLogId(d);
        const row = {
            id: rollbackId,
            rollbackId,
            importBatchId: log.importBatchId || '',
            importType: log.importType || log.type || '',
            rolledBackBy: log.rolledBackBy || 'HR',
            rolledBackAt: log.rolledBackAt || new Date().toISOString(),
            restoredRows: Number(log.restoredRows || 0),
            removedRows: Number(log.removedRows || 0),
            errors: Array.isArray(log.errors) ? log.errors : []
        };
        d.importRollbackLogs.unshift(row);
        this.save(d);
        return row;
    },
    
    clearImportLogs() {
        const d = this.get();
        d.importLogs = [];
        this.save(d);
    }
};

if (typeof window !== 'undefined') window.DB = DB;
if (typeof globalThis !== 'undefined') globalThis.DB = DB;

// ==================== SERVICE LAYER ALIASES ====================
// Thin grouped facades preserve the synchronous UI contract over authenticated persistence.
DB.UtilityService = {
    today: () => DB.today(),
    currentQuarter: (date) => DB.currentQuarter(date),
    generateEmployeeId: () => DB.generateEmployeeId(),
    generateRecordId: (type) => DB.generateRecordId(type),
    isOfficialEmployeeId: (id) => DB.isOfficialEmployeeId(id),
    isLegacyEmployeeId: (id) => DB.isLegacyEmployeeId(id),
    resolveEmployeeId: (id) => DB.resolveEmployeeId(id),
    normalizeDepartmentName: (value) => DB.normalizeDepartmentName(value),
    normalizeDesignationName: (value) => DB.normalizeDesignationName(value),
    normalizeEmail: (value) => DB.normalizeEmail(value),
    normalizePhone: (value) => DB.normalizePhone(value),
    validateManagerId: (managerId, employeeId = '') => DB.validateManagerId(managerId, null, employeeId),
    detectDuplicateEmployees: () => DB.detectDuplicateEmployees(),
    detectDuplicateAttendanceDay: (empId, date) => DB.detectDuplicateAttendanceDay(empId, date),
    detectDuplicatePayrollMonth: (empId, month) => DB.detectDuplicatePayrollMonth(empId, month),
    getRelationshipAudit: () => DB.getRelationshipAudit(),
    normalizeDataArchitecture: () => { const d = DB.get(); const changed = DB.normalizeDataArchitecture(d); if (changed) DB.save(d); return changed; }
};
DB.EmployeeService = {
    list: () => DB.getEmployees(),
    get: (id) => DB.getEmployee(id),
    create: (emp) => DB.addEmployee(emp),
    update: (id, fields) => DB.updateEmployee(id, fields),
    delete: (id) => DB.deleteEmployee(id),
    bulkImport: (rows) => DB.bulkImportEmployees(rows),
    export: () => DB.exportEmployeesData()
};
DB.AttendanceService = {
    today: () => DB.getTodayAttendance(),
    byEmployee: (empId) => DB.getEmpAttendance(empId),
    mark: (empId, type) => DB.markAttendance(empId, type),
    bulkImport: (rows) => DB.bulkImportAttendance(rows),
    export: () => DB.exportAttendanceData()
};
DB.LeaveService = {
    all: () => DB.getLeaveRequests(),
    byEmployee: (empId) => DB.getEmpLeave(empId),
    apply: (req) => DB.applyLeave(req),
    update: (id, status, msg, actorRole, actorId) => DB.updateLeave(id, status, msg, actorRole, actorId),
    balances: (empId) => (typeof leaveService !== 'undefined' && leaveService.getLeaveBalances ? leaveService.getLeaveBalances(empId) : null)
};
DB.PayrollService = {
    all: () => DB.getPayroll(),
    byEmployee: (empId) => DB.getEmpPayroll(empId),
    approve: (id, actorId, remarks) => DB.approvePayrollRecord(id, actorId, remarks),
    markPaid: (id, paidOn, actorId) => DB.markPayrollPaid(id, paidOn, actorId),
    bulkImport: (rows) => DB.bulkImportPayroll(rows),
    salaryStructures: () => DB.get().salaryStructures || [],
    payslips: (empId = '') => {
        const d = DB.get();
        const officialId = empId ? DB.resolveEmployeeId(empId, d) : '';
        return (d.payslips || []).filter(p => !officialId || p.empId === officialId);
    }
};
DB.ExpenseService = {
    all: (filters) => DB.getExpenseClaims(filters),
    byEmployee: (empId) => DB.getExpenseClaimsByEmp(empId),
    forManager: (managerId) => DB.getExpenseClaimsForManager(managerId),
    forHR: () => DB.getExpenseClaimsForHR(),
    create: (claim) => DB.addExpenseClaim(claim),
    approveManager: (id, remark, actorId) => DB.approveExpenseClaimByManager(id, remark, actorId),
    rejectManager: (id, remark, actorId) => DB.rejectExpenseClaimByManager(id, remark, actorId),
    processHR: (id, action, remark, actorId) => DB.processExpenseClaimByHR(id, action, remark, actorId)
};
DB.PerformanceService = {
    goalsByEmployee: (empId) => DB.getGoalsByEmployee(empId),
    goalsForManager: (managerId) => DB.getGoalsForManager(managerId),
    submitSelfReview: (goalId, rating, comments) => DB.submitSelfReview(goalId, rating, comments),
    submitManagerReview: (goalId, rating, comments) => DB.submitManagerReview(goalId, rating, comments),
    finalizeAppraisal: (appraisal) => DB.finalizeAppraisal(appraisal)
};
DB.DeliverableService = {
    create: (deliverable) => DB.createStrategicDeliverable(deliverable),
    all: (filters) => DB.getStrategicDeliverables(filters),
    byEmployee: (empId) => DB.getStrategicDeliverablesByEmployee(empId),
    byManager: (managerId) => DB.getStrategicDeliverablesByManager(managerId),
    review: (review) => DB.addDeliverableReview(review),
    close: (id, note) => DB.closeDeliverable(id, note),
    analytics: (scope) => DB.getStrategicAnalytics(scope)
};
DB.NotificationService = {
    push: (toRole, toEmpId, title, message, module) => DB.pushNotification(toRole, toEmpId, title, message, module),
    byRole: (role) => DB.getNotificationsByRole(role),
    byEmployee: (empId) => DB.getNotificationsByEmp(empId),
    markRead: (notifId, target) => DB.markNotificationRead(notifId, target),
    unreadCount: (target) => DB.getUnreadNotificationCount(target)
};
DB.AuditService = {
    write: (actorRole, actorId, actionType, module, targetId, description) => DB.writeAuditLog(actorRole, actorId, actionType, module, targetId, description),
    list: (module) => DB.getAuditLogs(module)
};
DB.AuthService = {
    getCurrentUser: () => {
        const service = typeof window !== 'undefined' ? window.authService : null;
        return service && service !== DB.AuthService && typeof service.getCurrentUser === 'function'
            ? service.getCurrentUser()
            : null;
    },
    getCurrentEmployee: () => {
        const service = typeof window !== 'undefined' ? window.authService : null;
        return service && service !== DB.AuthService && typeof service.getCurrentEmployee === 'function'
            ? service.getCurrentEmployee()
            : null;
    },
    clearSession: () => {
        if (typeof sessionStorage === 'undefined') return;
        ['currentUser', 'currentEmployee', 'empUser', 'hrUser', 'mgrUser', 'adUser', 'saUser', 'platformOwnerUser'].forEach(k => sessionStorage.removeItem(k));
    }
};
DB.AuthInviteService = {
    list: () => DB.getAuthInvites(),
    byEmployee: (empId) => DB.getAuthInvitesByEmployee(empId),
    latestForEmployee: (empId) => DB.getLatestAuthInviteForEmployee(empId),
    latestByEmail: (email) => DB.getLatestAuthInviteByEmail(email),
    create: (payload) => DB.createAuthInvite(payload),
    update: (inviteId, fields) => DB.updateAuthInvite(inviteId, fields),
    linkAuthUser: (empId, authUserId, status) => DB.linkAuthUserToEmployee(empId, authUserId, status)
};
DB.InstallService = {
    state: () => DB.getInstallState(),
    health: () => DB.getInstallHealth(),
    isSetupRequired: () => DB.isSetupRequired(),
    completeSetup: (payload) => DB.completeInitialSetup(payload),
    isProductionMode: () => DB.isProductionMode(),
    isPilotMode: () => DB.isPilotMode(),
    isDevelopmentMode: () => DB.isDevelopmentMode(),
    isDemoMode: () => DB.isDemoMode(),
    environment: () => DB.getEnvironmentState()
};
DB.PlatformGovernanceService = {
    get: () => DB.getPlatformGovernance(),
    save: (config, actor, reason) => DB.savePlatformGovernance(config, actor, reason),
    features: () => DB.getFeatureFlags(),
    feature: (key) => DB.getPlatformFeature(key),
    canAccess: (featureKey, role) => DB.canAccessFeature(featureKey, role),
    setFeatureFlag: (featureKey, updates, actor) => DB.setFeatureFlag(featureKey, updates, actor),
    setFeatureRoleAccess: (featureKey, role, allowed, actor) => DB.setFeatureRoleAccess(featureKey, role, allowed, actor),
    applyPreset: (preset, actor) => DB.applyPlatformPreset(preset, actor),
    rollback: (snapshotId, actor) => DB.rollbackPlatformGovernance(snapshotId, actor),
    roles: () => DB.getPlatformRoles()
};
DB.MigrationControlService = {
    definitions: () => DB.getMigrationModuleDefinitions(),
    state: () => DB.getMigrationState(),
    modules: () => DB.getMigrationModules(),
    setMode: (moduleKey, mode, actor, note) => DB.setModuleMigrationMode(moduleKey, mode, actor, note),
    recordHealth: (moduleKey, result, actor) => DB.recordMigrationHealth(moduleKey, result, actor),
    recordFallback: (moduleKey, reason, actor) => DB.recordMigrationFallback(moduleKey, reason, actor),
    summary: () => DB.getMigrationHealthSummary(),
    logs: (moduleKey) => DB.getMigrationLogs(moduleKey),
    importReadiness: (importType, rowCount) => DB.getImportReadiness(importType, rowCount),
    generateTestDataset: (options) => DB.generateMigrationTestDataset(options)
};
DB.DeploymentSafetyService = {
    environment: () => DB.getEnvironmentState(),
    setEnvironment: (mode, actor, reason) => DB.setEnvironmentMode(mode, actor, reason),
    limits: () => DB.getDeploymentSafetyLimits(),
    checkAction: (actionType, payload, actor) => DB.checkDeploymentAction(actionType, payload, actor),
    log: (event) => DB.logDeploymentEvent(event),
    logs: () => DB.getDeploymentLogs(),
    checkpoint: (label, actor, metadata) => DB.createDeploymentCheckpoint(label, actor, metadata),
    checkpoints: () => DB.getDeploymentCheckpoints(),
    saveQaRun: (run, actor) => DB.saveQaValidationRun(run, actor),
    qaRuns: () => DB.getQaValidationRuns()
};
DB.TestLabService = {
    saveRun: (run, actor) => DB.saveTestLabRun(run, actor),
    runs: () => DB.getTestLabRuns(),
    generateId: () => DB.generateTestLabRunId()
};
DB.OperationsMonitoringService = {
    saveIncident: (incident, actor) => DB.saveOperationIncident(incident, actor),
    updateIncident: (incidentId, updates, actor) => DB.updateOperationIncident(incidentId, updates, actor),
    incidents: (filters) => DB.getOperationIncidents(filters),
    saveMetric: (metric) => DB.saveOperationMetric(metric),
    metrics: (filters) => DB.getOperationMetrics(filters),
    saveError: (error, context) => DB.saveServiceError(error, context),
    errors: (filters) => DB.getServiceErrorLogs(filters),
    summary: () => DB.getOperationsMonitoringSummary()
};

// Gradual migration bridge: future UI can call employeeService.getEmployees()
// while existing dashboards continue to call DB.getEmployees() safely.
if (typeof window !== 'undefined') {
    window.utilityService = {
        today: DB.UtilityService.today,
        currentQuarter: DB.UtilityService.currentQuarter,
        generateEmployeeId: DB.UtilityService.generateEmployeeId,
        generateRecordId: DB.UtilityService.generateRecordId,
        isOfficialEmployeeId: DB.UtilityService.isOfficialEmployeeId,
        isLegacyEmployeeId: DB.UtilityService.isLegacyEmployeeId,
        resolveEmployeeId: DB.UtilityService.resolveEmployeeId,
        normalizeDepartmentName: DB.UtilityService.normalizeDepartmentName,
        normalizeDesignationName: DB.UtilityService.normalizeDesignationName,
        normalizeEmail: DB.UtilityService.normalizeEmail,
        normalizePhone: DB.UtilityService.normalizePhone,
        validateManagerId: DB.UtilityService.validateManagerId,
        detectDuplicateEmployees: DB.UtilityService.detectDuplicateEmployees,
        detectDuplicateAttendanceDay: DB.UtilityService.detectDuplicateAttendanceDay,
        detectDuplicatePayrollMonth: DB.UtilityService.detectDuplicatePayrollMonth,
        getRelationshipAudit: DB.UtilityService.getRelationshipAudit,
        normalizeDataArchitecture: DB.UtilityService.normalizeDataArchitecture
    };
    window.employeeService = {
        getEmployees: DB.EmployeeService.list,
        getEmployee: DB.EmployeeService.get,
        createEmployee: DB.EmployeeService.create,
        updateEmployee: DB.EmployeeService.update,
        deleteEmployee: DB.EmployeeService.delete,
        bulkImportEmployees: DB.EmployeeService.bulkImport,
        exportEmployeesData: DB.EmployeeService.export
    };
    window.attendanceService = {
        getTodayAttendance: DB.AttendanceService.today,
        getAttendanceByEmployee: DB.AttendanceService.byEmployee,
        markAttendance: DB.AttendanceService.mark,
        bulkImportAttendance: DB.AttendanceService.bulkImport,
        exportAttendanceData: DB.AttendanceService.export
    };
    window.leaveService = {
        getLeaveRequests: DB.LeaveService.all,
        getLeaveByEmployee: DB.LeaveService.byEmployee,
        applyLeave: DB.LeaveService.apply,
        updateLeave: DB.LeaveService.update,
        getLeaveBalances: DB.LeaveService.balances
    };
    window.expenseService = {
        getExpenseClaims: DB.ExpenseService.all,
        getExpenseClaimsByEmployee: DB.ExpenseService.byEmployee,
        getExpenseClaimsForManager: DB.ExpenseService.forManager,
        getExpenseClaimsForHR: DB.ExpenseService.forHR,
        createExpenseClaim: DB.ExpenseService.create,
        submitExpense: DB.ExpenseService.create,
        approveExpenseManager: DB.ExpenseService.approveManager,
        rejectExpenseManager: DB.ExpenseService.rejectManager,
        markExpensePaid: (id, remark) => DB.ExpenseService.processHR(id, 'paid', remark),
        rejectExpense: (id, remark) => DB.ExpenseService.processHR(id, 'reject', remark)
    };
    window.notificationService = {
        pushNotification: DB.NotificationService.push,
        getNotificationsByRole: DB.NotificationService.byRole,
        getNotificationsByEmployee: DB.NotificationService.byEmployee,
        markNotificationRead: DB.NotificationService.markRead,
        getUnreadNotificationCount: DB.NotificationService.unreadCount
    };
    window.authLocalProfileService = DB.AuthService;
    window.authInviteLocalService = DB.AuthInviteService;
    window.installLocalService = DB.InstallService;
    window.platformGovernanceLocalService = DB.PlatformGovernanceService;
    window.migrationControlLocalService = DB.MigrationControlService;
    window.deploymentSafetyLocalService = DB.DeploymentSafetyService;
    window.enterpriseTestLabLocalService = DB.TestLabService;
    window.operationsMonitoringLocalService = DB.OperationsMonitoringService;
}

// Initialize on load
DB.init();
DB.migrate();

// ==================== GLOBAL HELPER FUNCTIONS ====================

function today() { 
    return new Date().toISOString().split('T')[0]; 
}

function yesterday() { 
    const d = new Date(); 
    d.setDate(d.getDate() - 1); 
    return d.toISOString().split('T')[0]; 
}

function timeNow() { 
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); 
}

function dateDiff(from, to) { 
    return DB.dateDiff(from, to); 
}

function downloadCSV(filename, rows) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const security = window.FrontendSecurityService;
    const escapeCell = security?.escapeCSVCell || (value => {
        let text = String(value ?? '').replace(/\r?\n/g, ' ');
        if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = "'" + text;
        return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    });
    const csv = [keys.map(escapeCell).join(','), ...rows.map(r => keys.map(k => escapeCell(r[k])).join(','))].join('\n');
    if (security?.downloadBlob) {
        security.downloadBlob(csv, filename, 'text/csv;charset=utf-8');
        return;
    }
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename;
    a.click();
}

function downloadJSON(filename, data) {
    const security = window.FrontendSecurityService;
    const content = JSON.stringify(data, null, 2);
    if (security?.downloadBlob) {
        security.downloadBlob(content, filename, 'application/json;charset=utf-8');
        return;
    }
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(content);
    a.download = filename;
    a.click();
}

function printArea(html, title = 'Report') {
    const security = window.FrontendSecurityService;
    if (!security?.printDocument) return false;
    return security.printDocument(html, title);
}
