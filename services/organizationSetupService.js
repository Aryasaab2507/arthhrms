/**
 * organizationSetupService.js
 * ARTHHRMS - Organization Setup + Initialization Flow
 *
 * PURPOSE:
 * Provides centralized first-time tenant organization setup governance for
 * company profile, departments, role matrix, manager structure, policies,
 * feature selection, pilot configuration, and activation readiness.
 *
 * This service manages tenant-scoped setup metadata ONLY.
 * It does NOT create employee records automatically.
 * It does NOT expose PLATFORM_OWNER inside tenant setup flows.
 * It does NOT bypass tenant isolation.
 *
 * ARCHITECTURE RULE:
 * Organization setup must remain isolated from platform ownership governance.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.TenantProvisioningService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachOrganizationSetupService(global) {
    'use strict';

    var PREFIX = '[OrganizationSetupService]';
    var DEFAULT_SOURCE = 'organizationSetupService';

    var SETUP_STAGES = Object.freeze([
        'COMPANY_PROFILE',
        'DEPARTMENT_SETUP',
        'ROLE_CONFIGURATION',
        'MANAGER_STRUCTURE',
        'POLICY_CONFIGURATION',
        'FEATURE_SELECTION',
        'PILOT_CONFIGURATION',
        'ACTIVATION_READY'
    ]);

    var TENANT_ROLES = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'HR',
        'HR_HEAD',
        'DIRECTOR',
        'SUPER_ADMIN'
    ]);

    var SETUP_ACTOR_ROLES = Object.freeze([
        'platform_owner',
        'admin',
        'super_admin',
        'hr',
        'hr_head',
        'director'
    ]);

    var FEATURE_KEYS = Object.freeze([
        'attendance',
        'payroll',
        'strategic_deliverables',
        'expense_management',
        'onboarding_workflows'
    ]);

    var DEFAULT_DEPARTMENTS = Object.freeze([
        'HR',
        'Operations',
        'Finance',
        'Engineering',
        'Management'
    ]);

    var DEFAULT_POLICIES = Object.freeze({
        leave_policy: 'standard',
        attendance_policy: 'standard',
        holiday_policy: 'standard',
        working_hours: '09:30-18:30',
        onboarding_defaults: 'invite_required'
    });

    function safeWarn(message, details) {
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
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 4) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, 200).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (/password|secret|token|service[_-]?role|private[_-]?key/i.test(key)) return;
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

    function freezeSetupOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return deepFreeze(list.slice().map(function freezeItem(item) {
            return isPlainObject(item) ? cloneValue(item, 0) : item;
        }));
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, 0) : {};
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'ORGANIZATION_SETUP_FAILURE'),
            severity: safeString(severity, 'HIGH').toUpperCase(),
            message: safeString(message, 'Organization setup failure.'),
            metadata: freezeSetupOutput(safeMetadata(metadata || {}))
        });
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'ORGANIZATION_SETUP_WARNING'),
            severity: safeString(severity, 'WARNING').toUpperCase(),
            message: safeString(message, 'Organization setup warning.'),
            recommendation: safeString(recommendation, 'Review organization setup before activation.'),
            metadata: freezeSetupOutput(safeMetadata(metadata || {}))
        });
    }

    function safeRecommendation(code, message, metadata) {
        return Object.freeze({
            recommendationCode: safeString(code, 'ORGANIZATION_SETUP_RECOMMENDATION'),
            message: safeString(message, 'Continue guided organization setup.'),
            metadata: freezeSetupOutput(safeMetadata(metadata || {}))
        });
    }

    function normalizeRole(role) {
        var normalized = safeString(role, '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (normalized === 'superadmin') return 'super_admin';
        if (normalized === 'hrhead') return 'hr_head';
        if (normalized === 'platformowner' || normalized === 'owner' || normalized === 'root') return 'platform_owner';
        return normalized;
    }

    function roleConstant(role) {
        return normalizeRole(role).toUpperCase();
    }

    function normalizeTenantSlug(value) {
        if (global.TenantProvisioningService && typeof global.TenantProvisioningService.normalizeTenantSlug === 'function') {
            return global.TenantProvisioningService.normalizeTenantSlug(value);
        }
        var slug = safeString(value, '').trim().toLowerCase();
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-');
        slug = slug.replace(/-+/g, '-');
        slug = slug.replace(/^-|-$/g, '');
        return slug;
    }

    function isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeString(value, '').trim());
    }

    function getRawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get();
        } catch (error) {}
        return {};
    }

    function saveRawData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {
            safeWarn('Organization setup persistence failed safely.', { error: error && error.message });
        }
        return false;
    }

    function normalizeActor(actor) {
        var source = isPlainObject(actor) ? actor : {};
        return {
            role: normalizeRole(source.role || source.actorRole || ''),
            id: safeString(source.id || source.actorId || source.userId || source.empId || '', ''),
            name: safeString(source.name || source.email || source.id || '', ''),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.companyId || source.organizationId || '')
        };
    }

    function setupScopeFailures(tenantSlug, context, options) {
        var actor = normalizeActor(context && context.actor || {});
        var targetTenant = normalizeTenantSlug(tenantSlug || (context && context.tenantSlug) || '');
        var failures = [];
        var allowPlatformRead = options && options.readOnly === true && actor.role === 'platform_owner';
        var allowSecureProvisioning = context && context.secureProvisioning === true && actor.role === 'platform_owner';

        if (!targetTenant && !(options && options.allowMissingTenant)) {
            failures.push(safeFailure('TENANT_SLUG_REQUIRED', 'HIGH', 'Tenant slug is required for organization setup.'));
        }

        if (actor.role === 'platform_owner' && !allowPlatformRead && !allowSecureProvisioning) {
            failures.push(safeFailure('PLATFORM_OWNER_SETUP_BLOCKED', 'CRITICAL', 'PLATFORM_OWNER cannot perform tenant setup actions.', { tenantSlug: targetTenant }));
        }

        if (actor.role && actor.role !== 'platform_owner' && SETUP_ACTOR_ROLES.indexOf(actor.role) === -1 && !(options && options.allowBootstrapActor)) {
            failures.push(safeFailure('SETUP_ACTOR_ROLE_BLOCKED', 'HIGH', 'Actor role cannot change organization setup.', { actorRole: actor.role }));
        }

        if (actor.tenantSlug && targetTenant && actor.tenantSlug !== targetTenant && !allowPlatformRead) {
            failures.push(safeFailure('CROSS_TENANT_SETUP_BLOCKED', 'CRITICAL', 'Cross-tenant organization setup is blocked.', { actorTenant: actor.tenantSlug, targetTenant: targetTenant }));
        }

        return {
            actor: actor,
            tenantSlug: targetTenant,
            failures: failures
        };
    }

    function normalizeWorkingDays(days) {
        var source = Array.isArray(days) ? days : safeString(days, '').split(/[,\s]+/);
        var allowed = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        var seen = {};
        var result = [];
        source.forEach(function eachDay(day) {
            var normalized = safeString(day, '').trim().toUpperCase().slice(0, 3);
            if (allowed.indexOf(normalized) !== -1 && !seen[normalized]) {
                seen[normalized] = true;
                result.push(normalized);
            }
        });
        return result.length ? result : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    }

    function normalizeCompanyProfile(profile) {
        var source = isPlainObject(profile) ? profile : {};
        return freezeSetupOutput({
            companyName: safeString(source.company_name || source.companyName || source.name, '').trim(),
            companyLogo: safeString(source.company_logo || source.companyLogo || source.logoUrl || '', '').trim(),
            companyEmail: safeString(source.company_email || source.companyEmail || source.email || '', '').trim().toLowerCase(),
            companyPhone: safeString(source.company_phone || source.companyPhone || source.phone || '', '').trim(),
            timezone: safeString(source.timezone || 'Asia/Kolkata', 'Asia/Kolkata').trim(),
            country: safeString(source.country || 'India', 'India').trim(),
            workingDays: freezeList(normalizeWorkingDays(source.working_days || source.workingDays)),
            fiscalYear: safeString(source.fiscal_year || source.fiscalYear || 'APR-MAR', 'APR-MAR').trim().toUpperCase(),
            defaultCurrency: safeString(source.default_currency || source.defaultCurrency || source.currency || 'INR', 'INR').trim().toUpperCase()
        });
    }

    function normalizeDepartmentName(value) {
        return safeString(value, '').trim().replace(/\s+/g, ' ');
    }

    function normalizeDepartmentStructure(departments) {
        try {
            var source = Array.isArray(departments) && departments.length ? departments : DEFAULT_DEPARTMENTS;
            var seen = {};
            var normalized = [];
            var failures = [];
            source.forEach(function eachDepartment(item, index) {
                var raw = isPlainObject(item) ? item.name || item.department || item.label : item;
                var name = normalizeDepartmentName(raw);
                var key = name.toLowerCase();
                if (!name) {
                    failures.push(safeFailure('DEPARTMENT_NAME_REQUIRED', 'HIGH', 'Department name is required.', { index: index }));
                    return;
                }
                if (seen[key]) {
                    failures.push(safeFailure('DUPLICATE_DEPARTMENT', 'HIGH', 'Duplicate department names are blocked.', { department: name }));
                    return;
                }
                seen[key] = true;
                normalized.push({
                    departmentId: normalizeTenantSlug(name),
                    name: name,
                    parentDepartment: normalizeDepartmentName(isPlainObject(item) ? item.parentDepartment || item.parent || '' : ''),
                    departmentHeadId: safeString(isPlainObject(item) ? item.departmentHeadId || item.headId || '' : '', '')
                });
            });
            return freezeSetupOutput({
                success: true,
                valid: failures.length === 0,
                departments: normalized,
                failures: failures,
                warnings: [],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                valid: false,
                departments: [],
                failures: [safeFailure('DEPARTMENT_NORMALIZATION_FAILED', 'HIGH', 'Department setup failed safely.')],
                warnings: [safeWarning('DEPARTMENT_NORMALIZATION_RECOVERED', 'WARNING', 'Department setup recovered from malformed input.', 'Review department rows and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    function normalizeRoleMatrix(roles) {
        var source = Array.isArray(roles) && roles.length ? roles : TENANT_ROLES;
        var seen = {};
        var normalized = [];
        var failures = [];
        source.forEach(function eachRole(role) {
            var key = roleConstant(role);
            if (key === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_ROLE_BLOCKED', 'CRITICAL', 'PLATFORM_OWNER cannot appear in tenant setup role matrix.'));
                return;
            }
            if (TENANT_ROLES.indexOf(key) === -1) {
                failures.push(safeFailure('UNKNOWN_SETUP_ROLE_BLOCKED', 'HIGH', 'Unknown setup role is blocked.', { role: safeString(role, '') }));
                return;
            }
            if (!seen[key]) {
                seen[key] = true;
                normalized.push(key);
            }
        });
        return freezeSetupOutput({
            success: true,
            valid: failures.length === 0,
            roles: normalized,
            failures: failures,
            warnings: [],
            timestamp: nowIso()
        });
    }

    function normalizeManagerRows(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.slice(0, 500).map(function mapRow(row) {
            var source = isPlainObject(row) ? row : {};
            return {
                employeeId: safeString(source.employee_id || source.employeeId || source.empId || source.id || '', '').trim(),
                managerId: safeString(source.manager_id || source.managerId || source.reporting_manager_id || source.reportingManagerId || '', '').trim(),
                department: normalizeDepartmentName(source.department || source.dept || ''),
                tenantSlug: normalizeTenantSlug(source.tenant_slug || source.tenantSlug || source.tenantId || source.companyId || '')
            };
        });
    }

    function validateManagerHierarchy(rows, context) {
        try {
            var tenantSlug = normalizeTenantSlug(context && context.tenantSlug || '');
            var normalized = normalizeManagerRows(rows);
            var failures = [];
            var warnings = [];
            var graph = {};

            normalized.forEach(function eachManager(row, index) {
                if (!row.employeeId) return;
                if (row.managerId && row.employeeId === row.managerId) {
                    failures.push(safeFailure('SELF_REPORTING_BLOCKED', 'HIGH', 'Self-reporting manager assignments are blocked.', { employeeId: row.employeeId }));
                }
                if (tenantSlug && row.tenantSlug && row.tenantSlug !== tenantSlug) {
                    failures.push(safeFailure('CROSS_TENANT_MANAGER_MAPPING_BLOCKED', 'CRITICAL', 'Cross-tenant manager mapping is blocked.', { index: index, employeeTenant: row.tenantSlug, setupTenant: tenantSlug }));
                }
                if (row.managerId) graph[row.employeeId] = row.managerId;
            });

            Object.keys(graph).forEach(function detectCycle(start) {
                var seen = {};
                var current = start;
                while (graph[current]) {
                    if (seen[current]) {
                        failures.push(safeFailure('CIRCULAR_MANAGER_CHAIN', 'CRITICAL', 'Circular manager hierarchy is blocked.', { employeeId: start }));
                        break;
                    }
                    seen[current] = true;
                    current = graph[current];
                }
            });

            if (!normalized.length) {
                warnings.push(safeWarning('MANAGER_STRUCTURE_EMPTY', 'WARNING', 'Manager hierarchy is not configured yet.', 'Add manager mappings before broad onboarding.'));
            }

            return freezeSetupOutput({
                success: true,
                valid: failures.length === 0,
                managerStructure: normalized,
                failures: failures,
                warnings: warnings,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                valid: false,
                managerStructure: [],
                failures: [safeFailure('MANAGER_HIERARCHY_VALIDATION_FAILED', 'HIGH', 'Manager hierarchy validation failed safely.')],
                warnings: [safeWarning('MANAGER_HIERARCHY_RECOVERED', 'WARNING', 'Manager hierarchy validation recovered from malformed input.', 'Review reporting chain rows and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    function normalizePolicies(policies) {
        var source = isPlainObject(policies) ? policies : {};
        return freezeSetupOutput({
            leavePolicy: safeString(source.leave_policy || source.leavePolicy || DEFAULT_POLICIES.leave_policy, DEFAULT_POLICIES.leave_policy),
            attendancePolicy: safeString(source.attendance_policy || source.attendancePolicy || DEFAULT_POLICIES.attendance_policy, DEFAULT_POLICIES.attendance_policy),
            holidayPolicy: safeString(source.holiday_policy || source.holidayPolicy || DEFAULT_POLICIES.holiday_policy, DEFAULT_POLICIES.holiday_policy),
            workingHours: safeString(source.working_hours || source.workingHours || DEFAULT_POLICIES.working_hours, DEFAULT_POLICIES.working_hours),
            onboardingDefaults: safeString(source.onboarding_defaults || source.onboardingDefaults || DEFAULT_POLICIES.onboarding_defaults, DEFAULT_POLICIES.onboarding_defaults)
        });
    }

    function normalizeFeatures(features) {
        var source = isPlainObject(features) ? features : {};
        var output = {};
        FEATURE_KEYS.forEach(function eachFeature(key) {
            output[key] = source[key] !== false;
        });
        return freezeSetupOutput(output);
    }

    function normalizePilotConfig(pilot) {
        var source = isPlainObject(pilot) ? pilot : {};
        var count = Number(source.pilot_employee_count || source.pilotEmployeeCount || 0);
        if (!isFinite(count) || count < 0) count = 0;
        var departments = Array.isArray(source.pilot_departments || source.pilotDepartments)
            ? (source.pilot_departments || source.pilotDepartments).map(normalizeDepartmentName).filter(Boolean)
            : [];
        return freezeSetupOutput({
            pilotEmployeeCount: Math.min(Math.round(count), 500),
            pilotDepartments: freezeList(departments),
            stagedOnboarding: source.staged_onboarding !== false && source.stagedOnboarding !== false,
            activationStage: safeString(source.activation_stage || source.activationStage || 'pilot_group', 'pilot_group').trim().replace(/[\s-]+/g, '_').toLowerCase()
        });
    }

    function normalizeSetupPayload(payload) {
        var source = isPlainObject(payload) ? cloneValue(payload, 0) : {};
        var companyProfile = normalizeCompanyProfile(source.company_profile || source.companyProfile || source.company || {});
        return freezeSetupOutput({
            tenantSlug: normalizeTenantSlug(source.tenant_slug || source.tenantSlug || source.tenantId || source.companyId || companyProfile.companyName),
            companyProfile: companyProfile,
            departments: normalizeDepartmentStructure(source.departments || source.department_setup || source.departmentSetup).departments,
            roleMatrix: normalizeRoleMatrix(source.role_matrix || source.roleMatrix || source.roles).roles,
            managerStructure: normalizeManagerRows(source.manager_structure || source.managerStructure || source.managers),
            policies: normalizePolicies(source.policies || source.policy_configuration || source.policyConfiguration),
            features: normalizeFeatures(source.features || source.feature_selection || source.featureSelection),
            pilot: normalizePilotConfig(source.pilot || source.pilot_configuration || source.pilotConfiguration),
            metadata: freezeSetupOutput(safeMetadata(source.metadata || {}))
        });
    }

    function collectValidation(payload, context) {
        var normalized = normalizeSetupPayload(payload);
        var scope = setupScopeFailures(normalized.tenantSlug, context, {});
        var failures = scope.failures.slice();
        var warnings = [];

        if (!normalized.companyProfile.companyName) {
            failures.push(safeFailure('COMPANY_NAME_REQUIRED', 'HIGH', 'Company name is required for organization setup.'));
        }
        if (normalized.companyProfile.companyEmail && !isEmail(normalized.companyProfile.companyEmail)) {
            failures.push(safeFailure('COMPANY_EMAIL_INVALID', 'HIGH', 'Company email is invalid.'));
        }
        if (!normalized.companyProfile.timezone) {
            failures.push(safeFailure('TIMEZONE_REQUIRED', 'HIGH', 'Timezone is required for organization setup.'));
        }
        if (!normalized.companyProfile.defaultCurrency) {
            failures.push(safeFailure('DEFAULT_CURRENCY_REQUIRED', 'HIGH', 'Default currency is required for organization setup.'));
        }

        var departmentValidation = normalizeDepartmentStructure(payload && (payload.departments || payload.department_setup || payload.departmentSetup));
        failures = failures.concat(departmentValidation.failures || []);
        warnings = warnings.concat(departmentValidation.warnings || []);

        var roleValidation = normalizeRoleMatrix(payload && (payload.role_matrix || payload.roleMatrix || payload.roles));
        failures = failures.concat(roleValidation.failures || []);
        warnings = warnings.concat(roleValidation.warnings || []);

        var managerValidation = validateManagerHierarchy(payload && (payload.manager_structure || payload.managerStructure || payload.managers), { tenantSlug: normalized.tenantSlug });
        failures = failures.concat(managerValidation.failures || []);
        warnings = warnings.concat(managerValidation.warnings || []);

        if (roleValidation.roles.indexOf('SUPER_ADMIN') === -1) {
            warnings.push(safeWarning('SUPER_ADMIN_NOT_CONFIGURED', 'WARNING', 'Tenant system administration role is not configured.', 'Keep SUPER_ADMIN for company IT/system administration.'));
        }
        if (!normalized.features.onboarding_workflows) {
            warnings.push(safeWarning('ONBOARDING_WORKFLOWS_DISABLED', 'WARNING', 'Onboarding workflows are disabled for setup.', 'Enable onboarding workflows before pilot activation.'));
        }

        return {
            normalized: normalized,
            scope: scope,
            failures: failures,
            warnings: warnings,
            departmentValidation: departmentValidation,
            roleValidation: roleValidation,
            managerValidation: managerValidation
        };
    }

    function classifyActivationReadiness(payload, context) {
        try {
            var collected = collectValidation(payload || {}, context || { actor: { role: 'super_admin', tenantSlug: normalizeTenantSlug(payload && (payload.tenant_slug || payload.tenantSlug)) } });
            var failures = collected.failures.slice();
            var warnings = collected.warnings.slice();
            var setup = collected.normalized;
            var departmentsReady = setup.departments.length >= 2;
            var rolesReady = ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN'].every(function hasRole(role) {
                return setup.roleMatrix.indexOf(role) !== -1;
            });
            var policiesReady = !!(setup.policies.leavePolicy && setup.policies.attendancePolicy && setup.policies.workingHours);
            var featuresReady = !!setup.features.onboarding_workflows;
            var pilotReady = !!(setup.pilot.stagedOnboarding && setup.pilot.pilotEmployeeCount > 0);

            if (!departmentsReady) {
                failures.push(safeFailure('DEPARTMENT_SETUP_INCOMPLETE', 'HIGH', 'At least two departments are required before activation.'));
            }
            if (!rolesReady) {
                failures.push(safeFailure('ROLE_MATRIX_INCOMPLETE', 'HIGH', 'Tenant role matrix must include all tenant roles before activation.'));
            }
            if (!policiesReady) {
                failures.push(safeFailure('POLICY_CONFIGURATION_INCOMPLETE', 'HIGH', 'Policy configuration is required before activation.'));
            }
            if (!featuresReady) {
                failures.push(safeFailure('FEATURE_SELECTION_UNSAFE', 'HIGH', 'Onboarding workflows must remain enabled before activation.'));
            }
            if (setup.pilot.activationStage === 'full_activation') {
                failures.push(safeFailure('UNSAFE_FULL_ACTIVATION_BLOCKED', 'CRITICAL', 'Full activation cannot be selected from first-time setup.'));
            }
            if (!pilotReady) {
                warnings.push(safeWarning('PILOT_CONFIGURATION_INCOMPLETE', 'WARNING', 'Pilot configuration is incomplete.', 'Configure pilot employee count and staged onboarding before invite rollout.'));
            }

            var ready = failures.length === 0;
            var readiness = ready ? 'ACTIVATION_READY' : 'BLOCKED';
            if (ready && !pilotReady) readiness = 'PILOT_CONFIGURATION';

            return freezeSetupOutput({
                success: true,
                ready: ready,
                readiness: readiness,
                failures: failures,
                warnings: warnings,
                summary: {
                    departmentsReady: departmentsReady,
                    rolesReady: rolesReady,
                    policiesReady: policiesReady,
                    featuresReady: featuresReady,
                    pilotReady: pilotReady
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                ready: false,
                readiness: 'BLOCKED',
                failures: [safeFailure('ACTIVATION_READINESS_FAILED', 'HIGH', 'Activation readiness failed safely.')],
                warnings: [safeWarning('ACTIVATION_READINESS_RECOVERED', 'WARNING', 'Activation readiness recovered from malformed input.', 'Review setup payload and retry.', { error: error && error.message })],
                summary: {},
                timestamp: nowIso()
            });
        }
    }

    function validateOrganizationSetup(payload, context) {
        try {
            var collected = collectValidation(payload || {}, context || {});
            var readiness = classifyActivationReadiness(payload || {}, context || {});
            var failures = collected.failures.concat(readiness.failures || []);
            var seen = {};
            failures = failures.filter(function uniqueFailure(item) {
                var key = item.failureCode + ':' + (item.metadata && JSON.stringify(item.metadata) || '');
                if (seen[key]) return false;
                seen[key] = true;
                return true;
            });
            var warnings = collected.warnings.concat(readiness.warnings || []);
            return freezeSetupOutput({
                success: true,
                validationType: 'ORGANIZATION_SETUP',
                passed: failures.length === 0,
                setup: collected.normalized,
                readiness: failures.length === 0 ? readiness.readiness : 'BLOCKED',
                warnings: warnings,
                failures: failures,
                recommendations: [
                    safeRecommendation('COMPLETE_GUIDED_SETUP', 'Complete each setup stage before pilot activation.'),
                    safeRecommendation('KEEP_SETUP_TENANT_SCOPED', 'Use only same-tenant setup actors and tenant roles.')
                ],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                validationType: 'ORGANIZATION_SETUP',
                passed: false,
                setup: normalizeSetupPayload({}),
                readiness: 'BLOCKED',
                warnings: [safeWarning('ORGANIZATION_SETUP_VALIDATION_RECOVERED', 'WARNING', 'Organization setup validation recovered from an internal error.', 'Review setup payload and retry.', { error: error && error.message })],
                failures: [safeFailure('ORGANIZATION_SETUP_VALIDATION_FAILED', 'HIGH', 'Organization setup validation failed safely.')],
                recommendations: [safeRecommendation('RETRY_ORGANIZATION_SETUP_VALIDATION', 'Retry validation with a tenant-scoped setup payload.')],
                timestamp: nowIso()
            });
        }
    }

    function currentStageFor(validation) {
        if (!validation || validation.failures && validation.failures.length) return 'COMPANY_PROFILE';
        return 'ACTIVATION_READY';
    }

    function buildSetupRecord(validation, actor) {
        var setup = validation.setup || normalizeSetupPayload({});
        var timestamp = nowIso();
        return freezeSetupOutput({
            setupId: 'ORGSETUP-' + setup.tenantSlug,
            tenantSlug: setup.tenantSlug,
            currentStage: currentStageFor(validation),
            companyProfile: setup.companyProfile,
            departments: setup.departments,
            roleMatrix: setup.roleMatrix,
            managerStructure: setup.managerStructure,
            policies: setup.policies,
            features: setup.features,
            pilot: setup.pilot,
            activationReadiness: validation.readiness || 'BLOCKED',
            blockers: validation.failures || [],
            warnings: validation.warnings || [],
            createdAt: timestamp,
            updatedAt: timestamp,
            updatedBy: actor && (actor.id || actor.name) || '',
            metadata: freezeSetupOutput({
                tenantScoped: true,
                platformOwnerVisible: false,
                sensitiveHrDataIncluded: false
            })
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
            safeWarn('Organization setup telemetry failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function auditSetup(eventType, actor, metadata) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                eventType: eventType,
                actionType: eventType,
                actorRole: actor && actor.role || 'super_admin',
                actorId: actor && (actor.id || actor.empId || actor.email) || '',
                module: 'Organization Setup',
                source: DEFAULT_SOURCE,
                severity: 'INFO',
                metadata: safeMetadata(metadata || {})
            }, {
                source: DEFAULT_SOURCE
            });
            return true;
        } catch (error) {
            safeWarn('Organization setup audit failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function recordMetric(eventType, metadata) {
        try {
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: DEFAULT_SOURCE }, safeMetadata(metadata || {})));
            return true;
        } catch (error) {
            safeWarn('Organization setup metrics failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function setupRows(data) {
        var rows = data && data.organizationSetups;
        if (Array.isArray(rows)) return rows.slice();
        if (isPlainObject(rows)) {
            return Object.keys(rows).map(function byKey(key) {
                return rows[key];
            });
        }
        return [];
    }

    function saveOrganizationSetup(payload, context) {
        try {
            var actor = normalizeActor(context && context.actor || {});
            var validation = validateOrganizationSetup(payload || {}, context || {});
            if (!validation.passed) {
                var blocked = freezeSetupOutput({
                    success: false,
                    saved: false,
                    setup: validation.setup,
                    warnings: validation.warnings,
                    failures: validation.failures,
                    recommendations: validation.recommendations,
                    timestamp: nowIso()
                });
                emitTelemetry('ORGANIZATION_SETUP_BLOCKED', { tenantSlug: validation.setup && validation.setup.tenantSlug, failureCount: validation.failures.length }, 'WARNING');
                auditSetup('ORGANIZATION_SETUP_BLOCKED', actor, { tenantSlug: validation.setup && validation.setup.tenantSlug, failureCount: validation.failures.length });
                return blocked;
            }

            var record = buildSetupRecord(validation, actor);
            var data = getRawData();
            data.organizationSetups = data.organizationSetups || {};
            if (Array.isArray(data.organizationSetups)) {
                var rows = data.organizationSetups.filter(function notSame(row) {
                    return normalizeTenantSlug(row && (row.tenantSlug || row.tenant_slug)) !== record.tenantSlug;
                });
                rows.push(cloneValue(record, 0));
                data.organizationSetups = rows;
            } else {
                data.organizationSetups[record.tenantSlug] = cloneValue(record, 0);
            }
            saveRawData(data);

            var result = freezeSetupOutput({
                success: true,
                saved: true,
                setup: record,
                warnings: validation.warnings,
                failures: [],
                recommendations: validation.recommendations,
                timestamp: nowIso()
            });
            emitTelemetry('ORGANIZATION_SETUP_SAVED', { tenantSlug: record.tenantSlug, readiness: record.activationReadiness }, 'INFO');
            auditSetup('ORGANIZATION_SETUP_SAVED', actor, { tenantSlug: record.tenantSlug, readiness: record.activationReadiness });
            recordMetric('ORGANIZATION_SETUP_SAVED', { tenantSlug: record.tenantSlug });
            return result;
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                saved: false,
                setup: null,
                warnings: [safeWarning('ORGANIZATION_SETUP_SAVE_RECOVERED', 'WARNING', 'Organization setup save recovered from an internal error.', 'Review setup payload and retry.', { error: error && error.message })],
                failures: [safeFailure('ORGANIZATION_SETUP_SAVE_FAILED', 'HIGH', 'Organization setup save failed safely.')],
                recommendations: [safeRecommendation('RETRY_ORGANIZATION_SETUP_SAVE', 'Retry setup save with tenant-scoped inputs.')],
                timestamp: nowIso()
            });
        }
    }

    function getOrganizationSetup(tenantSlug, context) {
        try {
            var scope = setupScopeFailures(tenantSlug, context || {}, { readOnly: true });
            if (scope.failures.length) {
                return freezeSetupOutput({
                    success: false,
                    setup: null,
                    warnings: [],
                    failures: scope.failures,
                    timestamp: nowIso()
                });
            }
            var data = getRawData();
            var rows = setupRows(data);
            var target = normalizeTenantSlug(tenantSlug);
            var found = rows.find(function byTenant(row) {
                return normalizeTenantSlug(row && (row.tenantSlug || row.tenant_slug)) === target;
            });
            return freezeSetupOutput({
                success: true,
                setup: found ? cloneValue(found, 0) : null,
                warnings: found ? [] : [safeWarning('ORGANIZATION_SETUP_NOT_FOUND', 'WARNING', 'No organization setup metadata exists for this tenant.', 'Complete the organization setup wizard.')],
                failures: [],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                setup: null,
                warnings: [safeWarning('ORGANIZATION_SETUP_READ_RECOVERED', 'WARNING', 'Organization setup read recovered from an internal error.', 'Review setup metadata and retry.', { error: error && error.message })],
                failures: [safeFailure('ORGANIZATION_SETUP_READ_FAILED', 'HIGH', 'Organization setup read failed safely.')],
                timestamp: nowIso()
            });
        }
    }

    function getSetupGovernanceView(context) {
        try {
            var actor = normalizeActor(context && context.actor || {});
            var readOnly = context && context.readOnly === true;
            if (actor.role === 'platform_owner' && !readOnly) {
                return freezeSetupOutput({
                    success: false,
                    setups: [],
                    summary: {},
                    warnings: [],
                    failures: [safeFailure('PLATFORM_OWNER_SETUP_BLOCKED', 'CRITICAL', 'PLATFORM_OWNER cannot perform tenant setup actions.')],
                    timestamp: nowIso()
                });
            }
            var data = getRawData();
            var rows = setupRows(data).map(function normalizeRecord(row) {
                var record = isPlainObject(row) ? cloneValue(row, 0) : {};
                record.tenantSlug = normalizeTenantSlug(record.tenantSlug || record.tenant_slug);
                record.roleMatrix = (Array.isArray(record.roleMatrix) ? record.roleMatrix : []).filter(function noPlatformOwner(role) {
                    return roleConstant(role) !== 'PLATFORM_OWNER';
                });
                record.metadata = Object.assign({}, safeMetadata(record.metadata || {}), { sensitiveHrDataIncluded: false });
                return record;
            });
            if (actor.role !== 'platform_owner' && actor.tenantSlug) {
                rows = rows.filter(function sameTenant(row) {
                    return row.tenantSlug === actor.tenantSlug;
                });
            }
            var summary = rows.reduce(function aggregate(acc, row) {
                acc.total += 1;
                if (row.currentStage === 'ACTIVATION_READY') acc.activationReady += 1;
                if ((row.blockers || []).length) acc.blocked += 1;
                return acc;
            }, { total: 0, activationReady: 0, blocked: 0 });
            return freezeSetupOutput({
                success: true,
                setups: rows,
                summary: summary,
                warnings: [],
                failures: [],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeSetupOutput({
                success: false,
                setups: [],
                summary: {},
                warnings: [safeWarning('SETUP_GOVERNANCE_VIEW_RECOVERED', 'WARNING', 'Setup governance view recovered from an internal error.', 'Review setup metadata and retry.', { error: error && error.message })],
                failures: [safeFailure('SETUP_GOVERNANCE_VIEW_FAILED', 'HIGH', 'Setup governance view failed safely.')],
                timestamp: nowIso()
            });
        }
    }

    var OrganizationSetupService = Object.freeze({
        SETUP_STAGES: SETUP_STAGES,
        TENANT_ROLES: TENANT_ROLES,
        FEATURE_KEYS: FEATURE_KEYS,
        DEFAULT_DEPARTMENTS: DEFAULT_DEPARTMENTS,
        DEFAULT_POLICIES: DEFAULT_POLICIES,
        validateOrganizationSetup: validateOrganizationSetup,
        normalizeDepartmentStructure: normalizeDepartmentStructure,
        validateManagerHierarchy: validateManagerHierarchy,
        classifyActivationReadiness: classifyActivationReadiness,
        saveOrganizationSetup: saveOrganizationSetup,
        getOrganizationSetup: getOrganizationSetup,
        getSetupGovernanceView: getSetupGovernanceView,
        freezeSetupOutput: freezeSetupOutput
    });

    if (!db()) {
        safeWarn('Optional DB dependency not detected. Organization setup will use supplied metadata only.');
    }
    if (!global.WorkflowTelemetryService) {
        safeWarn('Optional WorkflowTelemetryService dependency not detected. Setup telemetry is disabled.');
    }

    global.OrganizationSetupService = OrganizationSetupService;
    global.organizationSetupService = OrganizationSetupService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            try {
                var deps = normalizeDepartmentStructure(['HR', 'hr']);
                record('department validation works', deps.valid === false && deps.failures.some(function duplicate(item) {
                    return item.failureCode === 'DUPLICATE_DEPARTMENT';
                }), deps);

                var roles = validateOrganizationSetup({ tenant_slug: 'self-test', company_profile: { company_name: 'Self Test' }, role_matrix: ['EMPLOYEE', 'PLATFORM_OWNER'] }, { actor: { role: 'super_admin', tenantSlug: 'self-test' } });
                record('PLATFORM_OWNER blocked correctly', roles.passed === false && roles.failures.some(function blocked(item) {
                    return item.failureCode === 'PLATFORM_OWNER_ROLE_BLOCKED';
                }), roles);

                var circular = validateManagerHierarchy([
                    { employee_id: 'A', manager_id: 'B', tenant_slug: 'self-test' },
                    { employee_id: 'B', manager_id: 'A', tenant_slug: 'self-test' }
                ], { tenantSlug: 'self-test' });
                record('manager hierarchy validation works', circular.valid === false && circular.failures.some(function cycle(item) {
                    return item.failureCode === 'CIRCULAR_MANAGER_CHAIN';
                }), circular);

                var readiness = classifyActivationReadiness({ tenant_slug: 'self-test', company_profile: { company_name: 'Self Test' }, pilot: { activation_stage: 'full_activation' } });
                record('activation blockers classified correctly', readiness.ready === false && readiness.failures.some(function unsafe(item) {
                    return item.failureCode === 'UNSAFE_FULL_ACTIVATION_BLOCKED';
                }), readiness);

                var immutable = freezeSetupOutput({ list: [{ stable: true }] });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.list), immutable);

                var malformed = validateOrganizationSetup('bad-payload', { actor: { role: 'super_admin', tenantSlug: 'self-test' } });
                record('malformed payloads handled safely', malformed.passed === false && malformed.failures.length > 0, malformed);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            }
            try {
                global.__ARTHHRMS_ORGANIZATION_SETUP_SELF_TEST__ = Object.freeze({
                    passed: checks.every(function allPassed(item) { return item.passed; }),
                    tests: Object.freeze(checks.slice())
                });
            } catch (error) {
                safeWarn('Self-test result storage failed safely.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
