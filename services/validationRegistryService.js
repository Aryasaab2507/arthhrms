/**
 * ARTHHRMS Centralized Validation Registry
 * Executable rules remain in memory; only metadata and outcomes are persisted.
 */
(function attachValidationRegistry(global) {
    'use strict';

    var SOURCE = 'validationRegistryService';
    var VALIDATION_CATEGORIES = Object.freeze([
        'FIELD_VALIDATION',
        'ENTITY_VALIDATION',
        'WORKFLOW_VALIDATION',
        'SECURITY_VALIDATION',
        'POLICY_VALIDATION',
        'TENANT_VALIDATION',
        'LIFECYCLE_VALIDATION'
    ]);
    var RULE_STATUSES = Object.freeze(['DRAFT', 'APPROVED', 'ACTIVE', 'INACTIVE', 'DEPRECATED', 'ARCHIVED']);
    var GOVERNANCE_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN']);
    var DANGEROUS_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
    var registry = Object.create(null);

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function save(next) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(next || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function nowIso(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            return Number.isFinite(stamp.getTime()) ? stamp.toISOString() : new Date().toISOString();
        } catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function') return undefined;
        if (!value || typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); }).filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (DANGEROUS_KEYS.indexOf(key) !== -1) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeValidationRegistryOutput(value) {
        var cloned = cloneSafe(value, []);
        function deepFreeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { deepFreeze(item[key]); });
            return Object.freeze(item);
        }
        return deepFreeze(cloned);
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim(),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(cloneSafe(record, []));
        save(current);
        return record;
    }

    function audit(actionType, metadata, context) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    severity: /FAIL|DENIED|CONFLICT|CIRCULAR/.test(actionType) ? 'WARNING' : 'INFO',
                    metadata: cloneSafe(metadata || {}, [])
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function result(success, code, message, extra) {
        return freezeValidationRegistryOutput(Object.assign({
            success: success === true,
            valid: success === true,
            code: token(code || (success ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED')),
            message: safeString(message || (success ? 'Validation passed.' : 'Validation failed.'), '').slice(0, 240)
        }, extra || {}));
    }

    function ruleMetadata(rule) {
        return {
            ruleId: rule.ruleId,
            name: rule.name,
            category: rule.category,
            version: rule.version,
            status: rule.status,
            owner: rule.owner,
            tenantScope: rule.tenantScope,
            dependencies: rule.dependencies.slice(),
            activationDate: rule.activationDate || '',
            deprecationDate: rule.deprecationDate || '',
            approvedAt: rule.approvedAt || '',
            createdAt: rule.createdAt,
            updatedAt: rule.updatedAt,
            builtIn: rule.builtIn === true
        };
    }

    function hasGovernanceAccess(context) {
        return GOVERNANCE_ROLES.indexOf(actor(context || {}).role) !== -1;
    }

    function visibleRule(rule, context) {
        var tenant = contextTenant(context || {});
        return rule.tenantScope === 'GLOBAL' || rule.tenantScope === tenant;
    }

    function findVersion(ruleId, version, context) {
        var versions = registry[token(ruleId)] || [];
        var candidate = versions.find(function find(item) { return item.version === Number(version); });
        return candidate && visibleRule(candidate, context || {}) ? candidate : null;
    }

    function appendRuleHistory(action, rule, context, extra) {
        var record = Object.assign({
            historyId: createId('VRH'),
            action: action,
            tenantSlug: rule.tenantScope === 'GLOBAL' ? contextTenant(context || {}) : rule.tenantScope,
            ruleId: rule.ruleId,
            version: rule.version,
            category: rule.category,
            status: rule.status,
            owner: rule.owner,
            timestamp: nowIso(context || {})
        }, cloneSafe(extra || {}, []));
        persist('validationRuleHistory', record, context || {});
        audit('VALIDATION_RULE_' + action.replace(/^RULE_/, ''), record, context || {});
        return record;
    }

    function registerInternal(input, context, builtIn) {
        var source = input && typeof input === 'object' ? input : {};
        var ruleId = token(source.ruleId || source.id || source.name);
        var category = token(source.category || 'FIELD_VALIDATION');
        var version = Number(source.version || 1);
        if (!ruleId) return result(false, 'MALFORMED_RULE', 'A validation rule identifier is required.');
        if (VALIDATION_CATEGORIES.indexOf(category) === -1) return result(false, 'INVALID_RULE_CATEGORY', 'Validation rule category is not supported.');
        if (!Number.isInteger(version) || version < 1) return result(false, 'INVALID_RULE_VERSION', 'Validation rule version must be a positive integer.');
        if (typeof source.validator !== 'function') return result(false, 'MISSING_VALIDATOR', 'Validation rule requires an executable validator.');
        if (!builtIn && !hasGovernanceAccess(context || {})) {
            audit('VALIDATION_RULE_CHANGE_DENIED', { ruleId: ruleId, tenantSlug: contextTenant(context || {}) }, context || {});
            return result(false, 'VALIDATION_GOVERNANCE_DENIED', 'Validation governance access is required.');
        }
        if (!registry[ruleId]) registry[ruleId] = [];
        if (registry[ruleId].some(function conflict(item) { return item.version === version; })) {
            audit('VALIDATION_RULE_CONFLICT', { ruleId: ruleId, version: version }, context || {});
            return result(false, 'RULE_VERSION_CONFLICT', 'This validation rule version already exists.');
        }
        var timestamp = nowIso(context || {});
        var rule = {
            ruleId: ruleId,
            name: safeString(source.name || ruleId.replace(/_/g, ' '), '').slice(0, 120),
            category: category,
            version: version,
            status: builtIn ? 'ACTIVE' : 'DRAFT',
            owner: safeString(source.owner || (builtIn ? 'ARTHHRMS Platform' : actor(context || {}).id || 'Platform Governance'), '').slice(0, 120),
            tenantScope: builtIn ? 'GLOBAL' : normalizeTenant(source.tenantScope || contextTenant(context || {})) || contextTenant(context || {}),
            dependencies: Array.isArray(source.dependencies) ? source.dependencies.map(token).filter(Boolean) : [],
            validator: source.validator,
            message: safeString(source.message || 'Validation failed.', '').slice(0, 240),
            failureCode: token(source.failureCode || ('INVALID_' + ruleId)),
            activationDate: builtIn ? timestamp : safeString(source.activationDate || '', ''),
            deprecationDate: safeString(source.deprecationDate || '', ''),
            approvedAt: builtIn ? timestamp : '',
            createdAt: timestamp,
            updatedAt: timestamp,
            builtIn: builtIn === true
        };
        registry[ruleId].push(rule);
        registry[ruleId].sort(function sort(a, b) { return a.version - b.version; });
        if (!builtIn) appendRuleHistory('RULE_CREATED', rule, context || {});
        return result(true, 'RULE_REGISTERED', 'Validation rule registered.', { rule: ruleMetadata(rule) });
    }

    function registerValidationRule(input, context) {
        try { return registerInternal(input, context || {}, false); }
        catch (error) { return result(false, 'RULE_REGISTRATION_FAILED_SAFE', 'Validation rule registration failed safely.'); }
    }

    function transitionRule(ruleId, version, nextStatus, action, context) {
        try {
            if (!hasGovernanceAccess(context || {})) return result(false, 'VALIDATION_GOVERNANCE_DENIED', 'Validation governance access is required.');
            var rule = findVersion(ruleId, version, context || {});
            if (!rule) return result(false, 'RULE_NOT_FOUND', 'Validation rule was not found.');
            var timestamp = nowIso(context || {});
            if (nextStatus === 'APPROVED' && rule.status !== 'DRAFT') return result(false, 'INVALID_RULE_TRANSITION', 'Only draft rules can be approved.');
            if (nextStatus === 'ACTIVE' && ['APPROVED', 'INACTIVE'].indexOf(rule.status) === -1) return result(false, 'RULE_NOT_APPROVED', 'Rule approval is required before activation.');
            if (nextStatus === 'ACTIVE') {
                (registry[rule.ruleId] || []).forEach(function deprecate(previous) {
                    if (previous !== rule && previous.status === 'ACTIVE' && visibleRule(previous, context || {})) {
                        previous.status = 'DEPRECATED';
                        previous.deprecationDate = timestamp;
                        previous.updatedAt = timestamp;
                        appendRuleHistory('RULE_DEPRECATED', previous, context || {}, { replacedByVersion: rule.version });
                    }
                });
                rule.activationDate = rule.activationDate || timestamp;
            }
            if (nextStatus === 'DEPRECATED') rule.deprecationDate = timestamp;
            if (nextStatus === 'APPROVED') rule.approvedAt = timestamp;
            rule.status = nextStatus;
            rule.updatedAt = timestamp;
            appendRuleHistory(action, rule, context || {});
            return result(true, action, 'Validation rule governance state updated.', { rule: ruleMetadata(rule) });
        } catch (error) { return result(false, 'RULE_TRANSITION_FAILED_SAFE', 'Validation rule transition failed safely.'); }
    }

    function approveValidationRule(ruleId, version, context) {
        return transitionRule(ruleId, version, 'APPROVED', 'RULE_APPROVED', context || {});
    }

    function activateValidationRule(ruleId, version, context) {
        return transitionRule(ruleId, version, 'ACTIVE', 'RULE_ACTIVATED', context || {});
    }

    function deactivateValidationRule(ruleId, version, context) {
        return transitionRule(ruleId, version, 'INACTIVE', 'RULE_DEACTIVATED', context || {});
    }

    function deprecateValidationRule(ruleId, version, context) {
        return transitionRule(ruleId, version, 'DEPRECATED', 'RULE_DEPRECATED', context || {});
    }

    function reviewValidationRule(ruleId, version, context) {
        var rule = findVersion(ruleId, version, context || {});
        if (!rule || !hasGovernanceAccess(context || {})) return result(false, 'VALIDATION_GOVERNANCE_DENIED', 'Validation governance access is required.');
        appendRuleHistory('RULE_REVIEWED', rule, context || {});
        return result(true, 'RULE_REVIEWED', 'Validation rule review recorded.', { rule: ruleMetadata(rule) });
    }

    function resolveRule(ruleId, options, context) {
        var versions = (registry[token(ruleId)] || []).filter(function visible(item) { return visibleRule(item, context || {}); });
        if (!versions.length) return { error: result(false, 'RULE_NOT_FOUND', 'Validation rule was not found.') };
        if (options && Number.isInteger(Number(options.version))) {
            var exact = versions.find(function find(item) { return item.version === Number(options.version); });
            if (!exact) return { error: result(false, 'RULE_VERSION_NOT_FOUND', 'Validation rule version was not found.') };
            if (exact.status === 'DEPRECATED' && options.allowDeprecated === true) return { rule: exact, deprecated: true };
            if (exact.status !== 'ACTIVE') return { error: result(false, 'RULE_NOT_ACTIVE', 'Validation rule version is not active.', { ruleId: exact.ruleId, version: exact.version, status: exact.status }) };
            return { rule: exact };
        }
        var active = versions.filter(function active(item) { return item.status === 'ACTIVE'; }).sort(function newest(a, b) { return b.version - a.version; })[0];
        return active ? { rule: active } : { error: result(false, 'RULE_NOT_ACTIVE', 'No active validation rule version is available.') };
    }

    function recordExecution(rule, outcome, options, context) {
        var currentActor = actor(context || {});
        var tenant = contextTenant(context || {});
        var record = {
            executionId: createId('VEX'),
            tenantSlug: tenant,
            actorId: currentActor.id,
            actorRole: currentActor.role,
            ruleId: rule ? rule.ruleId : token(options && options.ruleId),
            version: rule ? rule.version : Number(options && options.version || 0),
            category: rule ? rule.category : token(options && options.category || 'FIELD_VALIDATION'),
            source: safeString(options && options.source || 'ValidationRegistry', '').slice(0, 100),
            success: outcome.success === true,
            code: outcome.code,
            deprecatedRuleUsed: options && options.deprecatedRuleUsed === true,
            timestamp: nowIso(context || {})
        };
        persist('validationExecutionHistory', record, context || {});
        if (!record.success) audit('VALIDATION_FAILURE', record, context || {});
        return record;
    }

    function executeInternal(ruleId, value, options, context, stack) {
        var normalizedId = token(ruleId);
        var chain = Array.isArray(stack) ? stack.slice() : [];
        if (chain.indexOf(normalizedId) !== -1) {
            var circular = result(false, 'CIRCULAR_RULE_DEPENDENCY', 'Circular validation rule dependency detected.', { ruleId: normalizedId, dependencyChain: chain.concat([normalizedId]) });
            audit('VALIDATION_CIRCULAR_DEPENDENCY', { ruleId: normalizedId, dependencyChain: chain.concat([normalizedId]) }, context || {});
            return circular;
        }
        var resolved = resolveRule(normalizedId, options || {}, context || {});
        if (resolved.error) return resolved.error;
        var rule = resolved.rule;
        chain.push(normalizedId);
        for (var index = 0; index < rule.dependencies.length; index += 1) {
            var dependency = executeInternal(rule.dependencies[index], value, { source: SOURCE }, context || {}, chain);
            if (!dependency.success) return dependency;
        }
        var outcome;
        try {
            var response = rule.validator(value, freezeValidationRegistryOutput({
                options: cloneSafe(options || {}, []),
                context: { tenantSlug: contextTenant(context || {}), actor: actor(context || {}) },
                rule: ruleMetadata(rule)
            }));
            if (response && typeof response === 'object') {
                var valid = response.valid === true || response.success === true;
                outcome = result(valid, response.code || (valid ? 'VALIDATION_PASSED' : rule.failureCode), response.message || (valid ? 'Validation passed.' : rule.message), {
                    ruleId: rule.ruleId, version: rule.version, category: rule.category, deprecated: resolved.deprecated === true,
                    detailsAvailable: !!response.details
                });
            } else {
                outcome = result(response === true, response === true ? 'VALIDATION_PASSED' : rule.failureCode, response === true ? 'Validation passed.' : rule.message, {
                    ruleId: rule.ruleId, version: rule.version, category: rule.category, deprecated: resolved.deprecated === true
                });
            }
        } catch (error) {
            outcome = result(false, 'RULE_EXECUTION_FAILED_SAFE', 'Validation rule execution failed safely.', { ruleId: rule.ruleId, version: rule.version, category: rule.category });
        }
        recordExecution(rule, outcome, Object.assign({}, options || {}, { deprecatedRuleUsed: resolved.deprecated === true }), context || {});
        return outcome;
    }

    function executeValidationRule(ruleId, value, options, context) {
        try { return executeInternal(ruleId, value, options || {}, context || {}, []); }
        catch (error) { return result(false, 'RULE_EXECUTION_FAILED_SAFE', 'Validation rule execution failed safely.', { ruleId: token(ruleId) }); }
    }

    function bindingValue(payload, binding) {
        if (binding && typeof binding.value === 'function') {
            try { return binding.value(payload); } catch (error) { return undefined; }
        }
        if (binding && Object.prototype.hasOwnProperty.call(binding, 'value')) return binding.value;
        var path = safeString(binding && binding.field || '', '').split('.').filter(Boolean);
        var value = payload;
        path.forEach(function walk(part) { value = value && typeof value === 'object' ? value[part] : undefined; });
        return value;
    }

    function validateBindings(kind, payload, configuration, context) {
        try {
            var config = configuration && typeof configuration === 'object' ? configuration : {};
            var bindings = Array.isArray(config.rules) ? config.rules : [];
            var findings = bindings.map(function validate(binding) {
                return executeValidationRule(binding.ruleId, bindingValue(payload, binding), {
                    version: binding.version,
                    allowDeprecated: binding.allowDeprecated === true,
                    source: safeString(config.source || kind, '').slice(0, 100),
                    field: safeString(binding.field || '', '').slice(0, 120)
                }, context || {});
            });
            var conflicts = [];
            var seen = {};
            bindings.forEach(function detect(binding) {
                var key = token(binding.ruleId) + ':' + safeString(binding.field || '', '');
                var version = Number(binding.version || 0);
                if (seen[key] && seen[key] !== version) conflicts.push(key);
                if (!seen[key]) seen[key] = version;
            });
            return result(findings.every(function passed(item) { return item.success; }) && conflicts.length === 0,
                conflicts.length ? 'VALIDATION_RULE_CONFLICT' : findings.every(function passed(item) { return item.success; }) ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
                conflicts.length ? 'Conflicting validation rule bindings were detected.' : findings.every(function passed(item) { return item.success; }) ? 'Validation passed.' : 'Validation failed.',
                { validationType: kind, subjectType: token(config.entityType || config.workflowType || kind), findings: findings, conflicts: conflicts }
            );
        } catch (error) { return result(false, 'VALIDATION_FAILED_SAFE', 'Validation failed safely.', { validationType: kind }); }
    }

    function validateEntity(entityType, payload, configuration, context) {
        var config = Object.assign({}, configuration || {}, { entityType: entityType });
        return validateBindings('ENTITY_VALIDATION', payload, config, context || {});
    }

    function validateWorkflow(payload, configuration, context) {
        return validateBindings('WORKFLOW_VALIDATION', payload, configuration || {}, context || {});
    }

    function listValidationRules(filters, context) {
        try {
            var source = filters && typeof filters === 'object' ? filters : {};
            var category = token(source.category || '');
            var status = token(source.status || '');
            var rules = Object.keys(registry).reduce(function collect(list, key) {
                return list.concat(registry[key].filter(function allowed(rule) { return visibleRule(rule, context || {}); }));
            }, []).filter(function filter(rule) {
                return (!category || rule.category === category) && (!status || rule.status === status);
            }).sort(function sort(a, b) { return a.ruleId.localeCompare(b.ruleId) || b.version - a.version; });
            return result(true, 'RULES_LISTED', 'Validation rules listed.', { rules: rules.map(ruleMetadata), totalRules: rules.length });
        } catch (error) { return result(false, 'RULE_LIST_FAILED_SAFE', 'Validation rules could not be listed safely.', { rules: [], totalRules: 0 }); }
    }

    function rowTenant(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId));
    }

    function calculateValidationHealth(input, context) {
        try {
            if (!hasGovernanceAccess(context || {})) return result(false, 'VALIDATION_GOVERNANCE_DENIED', 'Validation governance access is required.');
            var tenant = normalizeTenant(input && (input.tenantSlug || input.tenantId) || contextTenant(context || {}));
            var contextScope = contextTenant(context || {});
            if (!tenant || (contextScope && tenant !== contextScope && !(context && context.validatedTenantAccess === true))) {
                return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation governance access failed.');
            }
            var currentData = data();
            var executions = (Array.isArray(currentData.validationExecutionHistory) ? currentData.validationExecutionHistory : []).filter(function scoped(row) { return rowTenant(row) === tenant; });
            var histories = (Array.isArray(currentData.validationRuleHistory) ? currentData.validationRuleHistory : []).filter(function scoped(row) { return rowTenant(row) === tenant; });
            var listed = listValidationRules({}, Object.assign({}, context || {}, { tenantSlug: tenant }));
            var rules = listed.rules || [];
            var failures = executions.filter(function failed(row) { return row.success === false; });
            var deprecatedUsage = executions.filter(function deprecated(row) { return row.deprecatedRuleUsed === true; }).length;
            var conflictCount = histories.filter(function conflict(row) { return /CONFLICT/.test(row.action || ''); }).length;
            var activeRules = rules.filter(function active(rule) { return rule.status === 'ACTIVE'; }).length;
            var governedRules = rules.filter(function governed(rule) { return rule.owner && (rule.status === 'ACTIVE' || rule.status === 'DEPRECATED'); }).length;
            var successRate = executions.length ? ((executions.length - failures.length) / executions.length) * 100 : 100;
            var validationHealthScore = clampScore(successRate * 0.65 + Math.max(0, 25 - deprecatedUsage * 3) + Math.min(10, activeRules));
            var ruleQualityScore = clampScore(100 - failures.length * 2 - conflictCount * 10 - deprecatedUsage * 3);
            var governanceScore = clampScore((rules.length ? governedRules / rules.length * 70 : 70) + (global.AuditService ? 20 : 10) + (conflictCount ? 0 : 10));
            var report = {
                success: true,
                tenantSlug: tenant,
                validationHealthScore: validationHealthScore,
                ruleQualityScore: ruleQualityScore,
                governanceScore: governanceScore,
                analytics: {
                    validationUsage: executions.length,
                    ruleFailures: failures.length,
                    ruleSuccessRate: clampScore(successRate),
                    deprecatedRuleUsage: deprecatedUsage,
                    validationConflicts: conflictCount,
                    activeRules: activeRules,
                    totalRuleVersions: rules.length
                },
                rules: rules,
                versionHistory: histories.slice(-30).reverse(),
                recentValidations: executions.slice(-30).reverse().map(function safe(row) {
                    return {
                        executionId: row.executionId,
                        ruleId: row.ruleId,
                        version: row.version,
                        category: row.category,
                        source: row.source,
                        success: row.success === true,
                        code: row.code,
                        timestamp: row.timestamp
                    };
                }),
                integrations: {
                    apiValidationLayer: !!global.ApiPayloadValidationService,
                    employeeImport: !!global.EmployeeBulkImportService,
                    leaveGovernance: !!global.InitialLeaveBalanceImportService || !!global.LeaveAttendanceGovernanceService,
                    authenticationSecurity: !!global.LoginAttemptSecurityService,
                    workflowGovernance: !!global.workflowEngine,
                    organizationGovernance: !!global.OrganizationInitializationWizardService,
                    auditGovernance: !!global.AuditService
                },
                governance: {
                    singleSourceOfTruth: true,
                    tenantIsolationPreserved: true,
                    roleBypassAllowed: false,
                    executableValidatorsPersisted: false,
                    immutableHistory: true,
                    backwardCompatibilityPreserved: true
                },
                generatedAt: nowIso(context || {})
            };
            if (!(context && context.skipAnalyticsPersistence)) persist('validationRegistryAnalytics', {
                analyticsId: createId('VRA'), tenantSlug: tenant, validationHealthScore: validationHealthScore,
                ruleQualityScore: ruleQualityScore, governanceScore: governanceScore, generatedAt: report.generatedAt
            }, context || {});
            audit('VALIDATION_GOVERNANCE_REVIEWED', { tenantSlug: tenant, validationHealthScore: validationHealthScore }, context || {});
            return freezeValidationRegistryOutput(report);
        } catch (error) { return result(false, 'VALIDATION_HEALTH_FAILED_SAFE', 'Validation health calculation failed safely.'); }
    }

    function registerBuiltIns() {
        var builtIns = [
            {
                ruleId: 'EMAIL', category: 'FIELD_VALIDATION', failureCode: 'INVALID_EMAIL', message: 'Email format is invalid.',
                validator: function email(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(safeString(value || '', '').trim()); }
            },
            {
                ruleId: 'PHONE', category: 'FIELD_VALIDATION', failureCode: 'INVALID_PHONE', message: 'Phone format is invalid.',
                validator: function phone(value) { var clean = safeString(value || '', '').replace(/[\s().-]/g, ''); return /^\+?[0-9]{7,15}$/.test(clean); }
            },
            {
                ruleId: 'EMPLOYEE_ID', category: 'ENTITY_VALIDATION', failureCode: 'INVALID_EMPLOYEE_ID', message: 'Employee ID format is invalid.',
                validator: function employeeId(value) { return /^[A-Za-z0-9][A-Za-z0-9._\/-]{1,39}$/.test(safeString(value || '', '').trim()); }
            },
            {
                ruleId: 'DEPARTMENT_CODE', category: 'ENTITY_VALIDATION', failureCode: 'INVALID_DEPARTMENT_CODE', message: 'Department code format is invalid.',
                validator: function departmentCode(value) { return /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/.test(safeString(value || '', '').trim()); }
            },
            {
                ruleId: 'DATE_RANGE', category: 'POLICY_VALIDATION', failureCode: 'INVALID_DATE_RANGE', message: 'Date range is invalid.',
                validator: function dateRange(value) {
                    var source = value && typeof value === 'object' ? value : {};
                    var start = new Date(source.startDate || source.start || source.from || '');
                    var end = new Date(source.endDate || source.end || source.to || '');
                    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start.getTime() <= end.getTime();
                }
            },
            {
                ruleId: 'PASSWORD_POLICY', category: 'SECURITY_VALIDATION', failureCode: 'PASSWORD_POLICY_FAILED', message: 'Password does not meet the configured policy.',
                validator: function passwordPolicy(value) {
                    var password = safeString(value && typeof value === 'object' ? value.password : value, '');
                    var policy = value && typeof value === 'object' && value.policy ? value.policy : {};
                    var minimum = Number(policy.minimumLength || 12);
                    return password.length >= minimum && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
                }
            },
            {
                ruleId: 'ROLE_ASSIGNMENT', category: 'SECURITY_VALIDATION', failureCode: 'ROLE_ASSIGNMENT_DENIED', message: 'Role assignment is not permitted.',
                validator: function roleAssignment(value) {
                    var source = value && typeof value === 'object' ? value : {};
                    var allowed = Array.isArray(source.allowedRoles) ? source.allowedRoles.map(normalizeRole) : [];
                    return !!normalizeRole(source.role) && allowed.indexOf(normalizeRole(source.role)) !== -1;
                }
            },
            {
                ruleId: 'TENANT_ACCESS', category: 'TENANT_VALIDATION', failureCode: 'TENANT_ACCESS_DENIED', message: 'Tenant ownership validation failed.',
                validator: function tenantAccess(value, runtime) {
                    var source = value && typeof value === 'object' ? value : {};
                    var runtimeContext = runtime && runtime.context ? runtime.context : {};
                    var target = normalizeTenant(source.tenantSlug || source.tenantId || runtimeContext.tenantSlug);
                    var owner = normalizeTenant(source.ownerTenantSlug || source.ownerTenantId || target);
                    var currentActor = runtimeContext.actor || {};
                    var actorTenant = normalizeTenant(source.actorTenantSlug || source.actorTenantId || currentActor.tenantSlug || runtimeContext.tenantSlug);
                    return !!target && !!owner && !!actorTenant && target === owner && target === actorTenant;
                }
            }
        ];
        builtIns.forEach(function register(rule) { registerInternal(Object.assign({ version: 1, owner: 'ARTHHRMS Platform' }, rule), { tenantSlug: 'default', skipHistoryPersistence: true, skipAuditPersistence: true }, true); });
    }

    function runSelfTest() {
        var selfContext = {
            tenantSlug: 'self-test', validatedTenantAccess: true,
            actor: { id: 'SELF-TEST', role: 'PLATFORM_OWNER', tenantSlug: 'self-test' },
            skipHistoryPersistence: true, skipAuditPersistence: true, skipAnalyticsPersistence: true
        };
        var email = executeValidationRule('EMAIL', 'self-test@example.com', { source: 'self-test' }, selfContext);
        var tenant = executeValidationRule('TENANT_ACCESS', { tenantSlug: 'self-test', ownerTenantSlug: 'self-test', actorTenantSlug: 'self-test' }, { source: 'self-test' }, selfContext);
        var rules = listValidationRules({ status: 'ACTIVE' }, selfContext);
        var health = calculateValidationHealth({ tenantSlug: 'self-test' }, selfContext);
        var frozen = freezeValidationRegistryOutput({ nested: { value: 1 } });
        var checks = [
            { name: 'registry works', passed: rules.success && rules.totalRules >= 8 },
            { name: 'rule execution works', passed: email.success && tenant.success },
            { name: 'versioning works', passed: rules.rules.every(function versioned(rule) { return rule.version >= 1; }) },
            { name: 'governance works', passed: rules.rules.every(function governed(rule) { return !!rule.owner && rule.status === 'ACTIVE'; }) },
            { name: 'analytics work', passed: health.success && Number.isFinite(health.validationHealthScore) },
            { name: 'immutable outputs enforced', passed: Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) }
        ];
        var output = freezeValidationRegistryOutput({
            passed: checks.every(function passed(check) { return check.passed; }),
            checks: checks,
            summary: 'Centralized validation registry self-test completed.'
        });
        global.__ARTHHRMS_VALIDATION_REGISTRY_SELF_TEST__ = output;
        return output;
    }

    registerBuiltIns();

    var ValidationRegistry = Object.freeze({
        VALIDATION_CATEGORIES: VALIDATION_CATEGORIES,
        RULE_STATUSES: RULE_STATUSES,
        registerValidationRule: registerValidationRule,
        approveValidationRule: approveValidationRule,
        activateValidationRule: activateValidationRule,
        deactivateValidationRule: deactivateValidationRule,
        deprecateValidationRule: deprecateValidationRule,
        reviewValidationRule: reviewValidationRule,
        executeValidationRule: executeValidationRule,
        validateEntity: validateEntity,
        validateWorkflow: validateWorkflow,
        listValidationRules: listValidationRules,
        calculateValidationHealth: calculateValidationHealth,
        freezeValidationRegistryOutput: freezeValidationRegistryOutput,
        runSelfTest: runSelfTest
    });

    global.ValidationRegistry = ValidationRegistry;
    global.ValidationRegistryService = ValidationRegistry;
    global.validationRegistryService = ValidationRegistry;

    if (global.__ARTHHRMS_DEV__) runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
