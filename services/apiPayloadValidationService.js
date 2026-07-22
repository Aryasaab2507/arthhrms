/**
 * apiPayloadValidationService.js
 * ARTHHRMS - API Payload Validation Layer
 *
 * Centralized, tenant-aware request validation and sanitization. The service
 * records metadata-only validation history and exposes a controller wrapper
 * that cannot execute until every validation stage succeeds.
 */
(function attachApiPayloadValidationService(global) {
    'use strict';

    var SOURCE = 'apiPayloadValidationService';
    var MAX_PAYLOAD_BYTES = 1024 * 1024;
    var MAX_DEPTH = 12;
    var MAX_ARRAY_ITEMS = 1000;
    var VALIDATION_STAGES = Object.freeze([
        'INCOMING_REQUEST',
        'AUTHENTICATION_CHECK',
        'AUTHORIZATION_CHECK',
        'SCHEMA_VALIDATION',
        'FIELD_VALIDATION',
        'SANITIZATION',
        'NORMALIZATION',
        'BUSINESS_RULE_VALIDATION',
        'CONTROLLER_EXECUTION'
    ]);
    var ROLES = Object.freeze(['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN', 'PLATFORM_OWNER']);
    var SEVERITY_WEIGHT = Object.freeze({ INFO: 0, WARNING: 8, ERROR: 20, CRITICAL: 40 });
    var DANGEROUS_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
    var SCRIPT_PATTERN = /<\s*(script|iframe|object|embed|svg|math)\b|javascript\s*:|data\s*:\s*text\/html|\bon\w+\s*=/i;
    var ENCODED_SCRIPT_PATTERN = /(?:&lt;|&#0*60;|&#x0*3c;)\s*(script|iframe|object|embed|svg|math)\b|javascript\s*(?:&#0*58;|&#x0*3a;)/i;
    var SQL_PATTERN = /\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+[a-z0-9_]+\s+set|exec(?:ute)?\s*\(|or\s+1\s*=\s*1)\b|--|\/\*/i;
    var CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
    var HTML_PATTERN = /<[^>]*>/g;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data || {});
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

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'ROOT' || role === 'OWNER') role = 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'HRHEAD') role = 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function nowIso(context) {
        try {
            var value = context && context.now ? new Date(context.now) : new Date();
            return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
        } catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function cloneValue(value, seen) {
        if (!value || typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function map(item) { return cloneValue(item, refs.slice()); });
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (DANGEROUS_KEYS.indexOf(key) !== -1) return;
            output[key] = cloneValue(value[key], refs.slice());
        });
        return output;
    }

    function freezeValidationResult(value) {
        var cloned = cloneValue(value, []);
        function freeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { freeze(item[key]); });
            return Object.freeze(item);
        }
        return freeze(cloned);
    }

    function issue(code, path, message, severity, stage) {
        return freezeValidationResult({
            code: normalizeToken(code || 'PAYLOAD_VIOLATION'),
            path: safeString(path || '$', '$').slice(0, 180),
            message: safeString(message || 'Payload validation failed.', '').slice(0, 240),
            severity: normalizeToken(severity || 'ERROR'),
            stage: normalizeToken(stage || 'FIELD_VALIDATION')
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: safeString(actor.id || actor.userId || actor.empId || actor.employeeId || '', '').trim(),
            role: normalizeRole(actor.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || actor.companyId || '')
        };
    }

    function contextTenant(context) {
        var actor = context && context.actor ? context.actor : {};
        var settings = rawData().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            actor.tenantSlug || actor.tenantId || actor.companyId ||
            settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function explicitTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenant(row && (
            row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id ||
            row.companyId || row.company_id || row.organizationId ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
    }

    function defaultTenant(data) {
        var settings = data && data.companySettings ? data.companySettings : {};
        return normalizeTenant(settings.tenantSlug || settings.tenantId || settings.companyId || 'default');
    }

    function governanceFlags() {
        return {
            validationRequiredBeforeController: true,
            frontendPayloadsUntrusted: true,
            tenantIsolationPreserved: true,
            apiGovernancePreserved: true,
            roleBypassAllowed: false,
            rawPayloadPersisted: false,
            immutableHistory: true,
            backwardCompatibilityPreserved: true
        };
    }

    function byteLength(value) {
        var text = safeString(value, '');
        try {
            if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
        } catch (error) {}
        try { return unescape(encodeURIComponent(text)).length; } catch (error) { return text.length; }
    }

    function safeEndpoint(value) {
        var text = safeString(value || '', '').trim().replace(CONTROL_PATTERN, '');
        try {
            if (/^https?:\/\//i.test(text) && typeof URL !== 'undefined') text = new URL(text).pathname;
        } catch (error) {}
        text = text.split('?')[0].split('#')[0];
        return text.slice(0, 180);
    }

    function persistHistory(key, record) {
        var data = rawData();
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(cloneValue(record, []));
        saveData(data);
        return record;
    }

    function audit(actionType, metadata, context) {
        if (context && context.skipAuditPersistence) return false;
        var actor = actorFromContext(context || {});
        var meta = metadata || {};
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    actorId: actor.id,
                    actorRole: actor.role,
                    source: SOURCE,
                    module: 'API Payload Validation',
                    severity: meta.severity || (meta.success === false ? 'WARNING' : 'INFO'),
                    metadata: Object.assign({}, meta, { actionType: actionType, module: 'API Payload Validation' })
                }, { actor: actor, source: SOURCE });
                return true;
            }
        } catch (error) {}
        try {
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'API Payload Validation', meta.tenantSlug || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function notifySecurityEvent(record, context) {
        if (!record || Number(record.validationRiskScore || 0) < 70) return false;
        try {
            var center = global.NotificationCenterService || global.notificationCenterService;
            if (center && typeof center.createNotification === 'function') {
                center.createNotification({
                    tenantSlug: record.tenantSlug,
                    title: 'API validation security event',
                    message: 'A high-risk request was blocked by API validation governance.',
                    category: 'SECURITY', priority: 'HIGH', targetRoles: ['PLATFORM_OWNER', 'SUPER_ADMIN'],
                    dedupeKey: 'api-validation-' + record.tenantSlug + '-' + record.endpoint + '-' + record.stage
                }, context || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function standardFailure(stage, violations, metadata, context) {
        var items = Array.isArray(violations) && violations.length ? violations : [issue('VALIDATION_FAILED', '$', 'Request validation failed.', 'ERROR', stage)];
        var info = metadata || {};
        return freezeValidationResult({
            success: false,
            error_code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            details: {
                requestId: safeString(info.requestId || '', ''),
                stage: normalizeToken(stage || 'FIELD_VALIDATION'),
                violations: items,
                validationRiskScore: clampScore(info.validationRiskScore || 0),
                requestTrustScore: clampScore(info.requestTrustScore === undefined ? 100 : info.requestTrustScore),
                controllerExecuted: false
            },
            governance: governanceFlags(),
            timestamp: nowIso(context || {})
        });
    }

    function valueType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (Number.isInteger(value)) return 'integer';
        return typeof value;
    }

    function normalizedEnumValue(value, rule) {
        if (typeof value !== 'string') return value;
        var mode = normalizeToken(rule && rule.normalize || '');
        if (mode === 'ROLE' || mode === 'TOKEN') return normalizeToken(value);
        if (mode === 'TENANT') return normalizeTenant(value);
        if (mode === 'EMAIL' || mode === 'LOWERCASE') return safeString(value, '').trim().toLowerCase();
        return value;
    }

    function executeRegistryRule(ruleId, value, context, path) {
        try {
            var registry = global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService;
            if (!registry || typeof registry.executeValidationRule !== 'function') return null;
            return registry.executeValidationRule(ruleId, value, {
                source: SOURCE,
                field: safeString(path || '$', '$').slice(0, 120)
            }, context || {});
        } catch (error) { return null; }
    }

    function validateNode(value, rule, path, violations, depth, context) {
        var schema = rule && typeof rule === 'object' ? rule : {};
        if (depth > MAX_DEPTH) {
            violations.push(issue('MAXIMUM_NESTING_EXCEEDED', path, 'Payload nesting exceeds the supported depth.', 'CRITICAL', 'SCHEMA_VALIDATION'));
            return;
        }
        var actual = valueType(value);
        var expected = safeString(schema.type || '', '').toLowerCase();
        if (expected) {
            var typeMatches = actual === expected || (expected === 'number' && (actual === 'number' || actual === 'integer'));
            if (!typeMatches) {
                violations.push(issue('INVALID_FIELD_TYPE', path, 'Field type does not match the schema.', 'ERROR', 'SCHEMA_VALIDATION'));
                return;
            }
        }
        if (actual === 'object') {
            var required = Array.isArray(schema.required) ? schema.required : [];
            required.forEach(function requiredField(key) {
                if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === null || value[key] === '') {
                    violations.push(issue('REQUIRED_FIELD_MISSING', path + '.' + key, 'A required field is missing.', 'ERROR', 'SCHEMA_VALIDATION'));
                }
            });
            var properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
            Object.keys(value).forEach(function each(key) {
                if (DANGEROUS_KEYS.indexOf(key) !== -1) {
                    violations.push(issue('DANGEROUS_OBJECT_KEY', path + '.' + key, 'Dangerous object key was blocked.', 'CRITICAL', 'SCHEMA_VALIDATION'));
                    return;
                }
                if (!Object.prototype.hasOwnProperty.call(properties, key)) {
                    if (schema.additionalProperties === false) violations.push(issue('UNEXPECTED_FIELD', path + '.' + key, 'Unexpected field is not allowed by the schema.', 'ERROR', 'SCHEMA_VALIDATION'));
                    return;
                }
                validateNode(value[key], properties[key], path + '.' + key, violations, depth + 1, context);
            });
            return;
        }
        if (actual === 'array') {
            var maxItems = Number.isFinite(Number(schema.maxItems)) ? Number(schema.maxItems) : MAX_ARRAY_ITEMS;
            if (value.length > maxItems) violations.push(issue('ARRAY_TOO_LARGE', path, 'Array exceeds the allowed item count.', 'ERROR', 'FIELD_VALIDATION'));
            if (Number.isFinite(Number(schema.minItems)) && value.length < Number(schema.minItems)) violations.push(issue('ARRAY_TOO_SMALL', path, 'Array does not contain enough items.', 'ERROR', 'FIELD_VALIDATION'));
            if (schema.items) value.slice(0, MAX_ARRAY_ITEMS + 1).forEach(function each(item, index) { validateNode(item, schema.items, path + '[' + index + ']', violations, depth + 1, context); });
            return;
        }
        if (actual === 'string') {
            var text = safeString(value, '').trim();
            if (Number.isFinite(Number(schema.minLength)) && text.length < Number(schema.minLength)) violations.push(issue('FIELD_TOO_SHORT', path, 'Field is shorter than allowed.', 'ERROR', 'FIELD_VALIDATION'));
            if (Number.isFinite(Number(schema.maxLength)) && text.length > Number(schema.maxLength)) violations.push(issue('FIELD_TOO_LONG', path, 'Field exceeds the allowed length.', 'ERROR', 'FIELD_VALIDATION'));
            if (schema.format === 'email') {
                var emailRegistryResult = executeRegistryRule('EMAIL', text, context || {}, path);
                var emailValid = emailRegistryResult ? emailRegistryResult.success === true : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
                if (!emailValid) violations.push(issue('INVALID_EMAIL_FORMAT', path, 'Email format is invalid.', 'ERROR', 'FIELD_VALIDATION'));
            }
            if (schema.format === 'date' && !Number.isFinite(Date.parse(text))) violations.push(issue('INVALID_DATE_FORMAT', path, 'Date format is invalid.', 'ERROR', 'FIELD_VALIDATION'));
            if (schema.pattern) {
                try { if (!(new RegExp(schema.pattern)).test(text)) violations.push(issue('FIELD_PATTERN_MISMATCH', path, 'Field does not match the required format.', 'ERROR', 'FIELD_VALIDATION')); }
                catch (error) { violations.push(issue('INVALID_SCHEMA_PATTERN', path, 'Schema pattern is invalid.', 'ERROR', 'SCHEMA_VALIDATION')); }
            }
        }
        if (actual === 'number' || actual === 'integer') {
            if (Number.isFinite(Number(schema.minimum)) && Number(value) < Number(schema.minimum)) violations.push(issue('VALUE_BELOW_MINIMUM', path, 'Value is below the allowed minimum.', 'ERROR', 'FIELD_VALIDATION'));
            if (Number.isFinite(Number(schema.maximum)) && Number(value) > Number(schema.maximum)) violations.push(issue('VALUE_ABOVE_MAXIMUM', path, 'Value exceeds the allowed maximum.', 'ERROR', 'FIELD_VALIDATION'));
        }
        if (Array.isArray(schema.enum)) {
            var candidate = normalizedEnumValue(value, schema);
            var allowed = schema.enum.some(function match(item) { return normalizedEnumValue(item, schema) === candidate; });
            if (!allowed) violations.push(issue('INVALID_ENUM_VALUE', path, 'Field value is not in the allowed set.', 'ERROR', 'FIELD_VALIDATION'));
        }
        if (schema.validationRule && schema.format !== 'email') {
            var reusableRule = executeRegistryRule(schema.validationRule, value, context || {}, path);
            if (reusableRule && !reusableRule.success) violations.push(issue(reusableRule.code || 'REUSABLE_RULE_FAILED', path, reusableRule.message || 'Reusable validation rule failed.', 'ERROR', 'FIELD_VALIDATION'));
        }
    }

    function validatePayload(payload, schema, context) {
        try {
            if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
                return freezeValidationResult({ success: false, issues: [issue('SCHEMA_REQUIRED', '$', 'A validation schema is required.', 'CRITICAL', 'SCHEMA_VALIDATION')], stage: 'SCHEMA_VALIDATION' });
            }
            var violations = [];
            validateNode(payload, schema, '$', violations, 0, context || {});
            return freezeValidationResult({
                success: violations.length === 0,
                stage: violations.some(function schemaIssue(item) { return item.stage === 'SCHEMA_VALIDATION'; }) ? 'SCHEMA_VALIDATION' : 'FIELD_VALIDATION',
                issues: violations,
                violationCount: violations.length,
                validatedAt: nowIso(context || {})
            });
        } catch (error) {
            return freezeValidationResult({ success: false, stage: 'SCHEMA_VALIDATION', issues: [issue('SCHEMA_VALIDATION_FAILED_SAFE', '$', 'Schema validation failed safely.', 'ERROR', 'SCHEMA_VALIDATION')] });
        }
    }

    function sanitizePayload(payload, context) {
        var events = [];
        var issues = [];
        var seen = [];
        function sanitize(value, path, depth) {
            if (depth > MAX_DEPTH) {
                issues.push(issue('MAXIMUM_NESTING_EXCEEDED', path, 'Payload nesting exceeds the supported depth.', 'CRITICAL', 'SANITIZATION'));
                return null;
            }
            if (typeof value === 'string') {
                if (SCRIPT_PATTERN.test(value) || ENCODED_SCRIPT_PATTERN.test(value)) {
                    issues.push(issue('SCRIPT_INJECTION_DETECTED', path, 'Script injection content was blocked.', 'CRITICAL', 'SANITIZATION'));
                    return '';
                }
                if (SQL_PATTERN.test(value)) {
                    issues.push(issue('SQL_INJECTION_DETECTED', path, 'SQL injection content was blocked.', 'CRITICAL', 'SANITIZATION'));
                    return '';
                }
                var clean = value.replace(CONTROL_PATTERN, '');
                if (clean !== value) events.push(issue('CONTROL_CHARACTERS_REMOVED', path, 'Control characters were removed.', 'INFO', 'SANITIZATION'));
                var withoutHtml = clean.replace(HTML_PATTERN, '');
                if (withoutHtml !== clean) events.push(issue('HTML_REMOVED', path, 'HTML markup was removed.', 'INFO', 'SANITIZATION'));
                return withoutHtml;
            }
            if (!value || typeof value !== 'object') return value;
            if (seen.indexOf(value) !== -1) {
                issues.push(issue('CIRCULAR_PAYLOAD_DETECTED', path, 'Circular payload structure was blocked.', 'CRITICAL', 'SANITIZATION'));
                return null;
            }
            seen.push(value);
            if (Array.isArray(value)) {
                if (value.length > MAX_ARRAY_ITEMS) issues.push(issue('ARRAY_TOO_LARGE', path, 'Array exceeds the supported item count.', 'ERROR', 'SANITIZATION'));
                var list = value.slice(0, MAX_ARRAY_ITEMS).map(function map(item, index) { return sanitize(item, path + '[' + index + ']', depth + 1); });
                seen.pop();
                return list;
            }
            var output = {};
            Object.keys(value).forEach(function each(key) {
                if (DANGEROUS_KEYS.indexOf(key) !== -1) {
                    issues.push(issue('PROTOTYPE_POLLUTION_ATTEMPT', path + '.' + key, 'Dangerous object key was blocked.', 'CRITICAL', 'SANITIZATION'));
                    return;
                }
                output[key] = sanitize(value[key], path + '.' + key, depth + 1);
            });
            seen.pop();
            return output;
        }
        try {
            var sanitized = sanitize(payload, '$', 0);
            return freezeValidationResult({ success: issues.length === 0, stage: 'SANITIZATION', payload: sanitized, events: events, issues: issues, sanitized: events.length > 0 });
        } catch (error) {
            return freezeValidationResult({ success: false, stage: 'SANITIZATION', payload: {}, events: events, issues: [issue('SANITIZATION_FAILED_SAFE', '$', 'Payload sanitization failed safely.', 'ERROR', 'SANITIZATION')] });
        }
    }

    function normalizePayload(payload, schema, context) {
        function normalize(value, rule, key) {
            var nodeRule = rule && typeof rule === 'object' ? rule : {};
            if (Array.isArray(value)) return value.map(function map(item) { return normalize(item, nodeRule.items || {}, key); });
            if (value && typeof value === 'object') {
                var object = {};
                var properties = nodeRule.properties && typeof nodeRule.properties === 'object' ? nodeRule.properties : {};
                Object.keys(value).forEach(function each(childKey) { object[childKey] = normalize(value[childKey], properties[childKey] || {}, childKey); });
                return object;
            }
            if (typeof value !== 'string') return value;
            var text = value.trim();
            var mode = normalizeToken(nodeRule.normalize || '');
            var keyToken = normalizeToken(key || '');
            if (mode === 'TENANT' || keyToken === 'TENANT_SLUG' || keyToken === 'TENANT_ID') return normalizeTenant(text);
            if (mode === 'EMAIL' || /EMAIL$/.test(keyToken)) return text.toLowerCase();
            if (mode === 'ROLE') return normalizeRole(text);
            if (mode === 'TOKEN') return normalizeToken(text);
            if (mode === 'LOWERCASE') return text.toLowerCase();
            if (mode === 'UPPERCASE') return text.toUpperCase();
            if (mode === 'DATE') {
                var date = new Date(text);
                return Number.isFinite(date.getTime()) ? date.toISOString() : text;
            }
            return text;
        }
        try {
            if (!payload || typeof payload !== 'object') return freezeValidationResult({ success: false, stage: 'NORMALIZATION', issues: [issue('OBJECT_PAYLOAD_REQUIRED', '$', 'Payload must be an object.', 'ERROR', 'NORMALIZATION')] });
            return freezeValidationResult({ success: true, stage: 'NORMALIZATION', payload: normalize(payload, schema || {}, ''), issues: [], normalizedAt: nowIso(context || {}) });
        } catch (error) {
            return freezeValidationResult({ success: false, stage: 'NORMALIZATION', issues: [issue('NORMALIZATION_FAILED_SAFE', '$', 'Payload normalization failed safely.', 'ERROR', 'NORMALIZATION')] });
        }
    }

    function rowMatchesTenant(row, tenantSlug, data) {
        var tenant = explicitTenant(row);
        if (!tenant && tenantSlug === defaultTenant(data)) tenant = defaultTenant(data);
        return tenant === tenantSlug;
    }

    function findTenantRecord(collections, idValue, idFields, tenantSlug) {
        var data = rawData();
        var target = safeString(idValue, '').trim().toLowerCase();
        var found = null;
        (Array.isArray(collections) ? collections : [collections]).some(function findCollection(collection) {
            return (Array.isArray(data[collection]) ? data[collection] : []).some(function findRow(row) {
                var matches = idFields.some(function field(fieldName) { return safeString(row[fieldName], '').trim().toLowerCase() === target; });
                if (matches && rowMatchesTenant(row, tenantSlug, data)) {
                    found = row;
                    return true;
                }
                return false;
            });
        });
        return found;
    }

    function validateBusinessRules(payload, rules, context) {
        try {
            var source = rules && typeof rules === 'object' ? rules : {};
            var actor = actorFromContext(context || {});
            var tenantSlug = normalizeTenant(payload && (payload.tenantSlug || payload.tenantId) || contextTenant(context || {}));
            var violations = [];
            if (!tenantSlug) violations.push(issue('TENANT_IDENTIFIER_REQUIRED', '$.tenantSlug', 'Tenant identifier is required.', 'CRITICAL', 'BUSINESS_RULE_VALIDATION'));
            var tenantRegistryResult = tenantSlug ? executeRegistryRule('TENANT_ACCESS', {
                tenantSlug: tenantSlug,
                ownerTenantSlug: tenantSlug,
                actorTenantSlug: actor.tenantSlug || contextTenant(context || {})
            }, context || {}, '$.tenantSlug') : null;
            var tenantOwnershipFailed = tenantRegistryResult ? tenantRegistryResult.success !== true : actor.tenantSlug && tenantSlug && actor.tenantSlug !== tenantSlug;
            if (tenantOwnershipFailed) violations.push(issue('TENANT_OWNERSHIP_VIOLATION', '$.tenantSlug', 'Tenant ownership validation failed.', 'CRITICAL', 'BUSINESS_RULE_VALIDATION'));
            if (source.employeeField && payload[source.employeeField]) {
                var employee = findTenantRecord('employees', payload[source.employeeField], ['id', 'empId', 'employeeId', 'userId'], tenantSlug);
                if (!employee) violations.push(issue('EMPLOYEE_NOT_FOUND_IN_TENANT', '$.' + source.employeeField, 'Employee does not exist in tenant scope.', 'ERROR', 'BUSINESS_RULE_VALIDATION'));
            }
            if (source.departmentField && payload[source.departmentField]) {
                var department = findTenantRecord(['tenantDepartmentRecords', 'departmentSetupRecords', 'departments'], payload[source.departmentField], ['id', 'departmentId', 'departmentCode', 'code', 'departmentName', 'name'], tenantSlug);
                if (!department) violations.push(issue('DEPARTMENT_NOT_FOUND_IN_TENANT', '$.' + source.departmentField, 'Department does not exist in tenant scope.', 'ERROR', 'BUSINESS_RULE_VALIDATION'));
            }
            if (source.workflowField && payload[source.workflowField]) {
                var workflow = findTenantRecord(['workflowEvents', 'workflowInstances', 'pendingActions'], payload[source.workflowField], ['id', 'eventId', 'workflowId', 'actionId'], tenantSlug);
                if (!workflow) violations.push(issue('WORKFLOW_NOT_FOUND_IN_TENANT', '$.' + source.workflowField, 'Workflow does not exist in tenant scope.', 'ERROR', 'BUSINESS_RULE_VALIDATION'));
                else if (Array.isArray(source.allowedWorkflowStates) && source.allowedWorkflowStates.length) {
                    var workflowState = normalizeToken(workflow.state || workflow.status || workflow.workflowState || '');
                    if (source.allowedWorkflowStates.map(normalizeToken).indexOf(workflowState) === -1) violations.push(issue('WORKFLOW_NOT_ELIGIBLE', '$.' + source.workflowField, 'Workflow is not eligible for this operation.', 'ERROR', 'BUSINESS_RULE_VALIDATION'));
                }
            }
            if (source.lifecycleField && payload[source.lifecycleField] && Array.isArray(source.allowedLifecycleStates)) {
                var lifecycleState = normalizeToken(payload[source.lifecycleField]);
                if (source.allowedLifecycleStates.map(normalizeToken).indexOf(lifecycleState) === -1) violations.push(issue('LIFECYCLE_NOT_ELIGIBLE', '$.' + source.lifecycleField, 'Lifecycle state is not eligible for this operation.', 'ERROR', 'BUSINESS_RULE_VALIDATION'));
            }
            if (Array.isArray(source.allowedRoles) && source.allowedRoles.map(normalizeRole).indexOf(actor.role) === -1) violations.push(issue('BUSINESS_ROLE_CONSTRAINT_FAILED', '$', 'Role is not eligible for this business operation.', 'ERROR', 'BUSINESS_RULE_VALIDATION'));
            return freezeValidationResult({ success: violations.length === 0, stage: 'BUSINESS_RULE_VALIDATION', tenantSlug: tenantSlug, issues: violations, validatedAt: nowIso(context || {}) });
        } catch (error) {
            return freezeValidationResult({ success: false, stage: 'BUSINESS_RULE_VALIDATION', issues: [issue('BUSINESS_RULE_VALIDATION_FAILED_SAFE', '$', 'Business rule validation failed safely.', 'ERROR', 'BUSINESS_RULE_VALIDATION')] });
        }
    }

    function tenantHistory(key, tenantSlug) {
        return (Array.isArray(rawData()[key]) ? rawData()[key] : []).filter(function filter(row) { return explicitTenant(row) === tenantSlug; });
    }

    function calculateRequestTrust(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var actorId = safeString(source.actorId || actorFromContext(context || {}).id, '').trim();
            var endpoint = safeEndpoint(source.endpoint || context && context.endpoint || '');
            var history = tenantHistory('apiValidationHistory', tenantSlug).filter(function relevant(row) {
                return (!actorId || row.actorId === actorId) && (!endpoint || row.endpoint === endpoint);
            }).slice(-20);
            var failures = history.filter(function failed(row) { return row.outcome === 'BLOCKED'; }).length;
            var current = Array.isArray(source.violations) ? source.violations : [];
            var currentRisk = current.reduce(function sum(total, item) { return total + (SEVERITY_WEIGHT[normalizeToken(item.severity)] || 10); }, 0);
            var repeatedRisk = failures >= 10 ? 35 : failures >= 5 ? 22 : failures >= 3 ? 12 : failures * 3;
            var securityRisk = current.filter(function security(item) { return /INJECTION|SPOOFING|POLLUTION|OVERSIZED|TOO_LARGE/.test(item.code || ''); }).length * 15;
            var risk = clampScore(currentRisk + repeatedRisk + securityRisk);
            return freezeValidationResult({
                success: true, tenantSlug: tenantSlug, validationRiskScore: risk, requestTrustScore: clampScore(100 - risk),
                recentFailures: failures, repeatedFailureDetected: failures >= 3,
                governance: governanceFlags(), calculatedAt: nowIso(context || {})
            });
        } catch (error) {
            return freezeValidationResult({ success: false, validationRiskScore: 100, requestTrustScore: 0, issues: [issue('REQUEST_TRUST_FAILED_SAFE', '$', 'Request trust calculation failed safely.', 'ERROR', 'FIELD_VALIDATION')] });
        }
    }

    function requestMetadata(request, context, requestId, tenantSlug) {
        var actor = actorFromContext(context || {});
        return {
            requestId: requestId,
            tenantSlug: tenantSlug,
            actorId: actor.id,
            actorRole: actor.role,
            endpoint: safeEndpoint(request && request.endpoint || context && context.endpoint || ''),
            method: normalizeToken(request && request.method || 'POST'),
            timestamp: nowIso(context || {})
        };
    }

    function recordValidation(request, context, requestId, tenantSlug, outcome, stage, violations, sanitizationEvents, trust) {
        var meta = requestMetadata(request, context, requestId, tenantSlug);
        var record = Object.assign({}, meta, {
            validationId: createId('APV'), outcome: outcome, stage: stage,
            violationCount: violations.length, sanitizationCount: sanitizationEvents.length,
            validationRiskScore: trust.validationRiskScore, requestTrustScore: trust.requestTrustScore,
            rawPayloadPersisted: false
        });
        persistHistory('apiValidationHistory', record);
        violations.concat(sanitizationEvents).forEach(function each(item) {
            persistHistory('apiViolationHistory', {
                violationId: createId('APX'), requestId: requestId, tenantSlug: tenantSlug,
                actorId: meta.actorId, endpoint: meta.endpoint, stage: item.stage || stage,
                code: item.code, path: item.path, severity: item.severity, timestamp: meta.timestamp,
                rawValuePersisted: false
            });
        });
        return record;
    }

    function parsePayload(input) {
        if (typeof input === 'string') {
            try { return { success: true, payload: JSON.parse(input) }; }
            catch (error) { return { success: false, issues: [issue('MALFORMED_JSON', '$', 'Request body is not valid JSON.', 'ERROR', 'INCOMING_REQUEST')] }; }
        }
        if (!input || typeof input !== 'object') return { success: false, issues: [issue('OBJECT_PAYLOAD_REQUIRED', '$', 'Request payload must be an object.', 'ERROR', 'INCOMING_REQUEST')] };
        return { success: true, payload: input };
    }

    function requestTenant(request, payload, context) {
        return normalizeTenant(
            request && (request.tenantSlug || request.tenantId || request.companyId) ||
            payload && (payload.tenantSlug || payload.tenantId || payload.companyId) ||
            contextTenant(context || {})
        );
    }

    function finalizeBlocked(request, config, context, requestId, tenantSlug, stage, violations, sanitizationEvents) {
        var trust = calculateRequestTrust({ tenantSlug: tenantSlug, actorId: actorFromContext(context || {}).id, endpoint: request && request.endpoint, violations: violations }, context || {});
        var record = recordValidation(request || {}, context || {}, requestId, tenantSlug, 'BLOCKED', stage, violations, sanitizationEvents || [], trust);
        audit('API_REQUEST_VALIDATION_BLOCKED', {
            tenantSlug: tenantSlug, requestId: requestId, stage: stage, violationCount: violations.length,
            severity: trust.validationRiskScore >= 70 ? 'CRITICAL' : 'WARNING', success: false,
            description: 'API request was blocked before controller execution.'
        }, context || {});
        if ((sanitizationEvents || []).length) audit('PAYLOAD_SANITIZATION_APPLIED', { tenantSlug: tenantSlug, requestId: requestId, eventCount: sanitizationEvents.length, description: 'Payload sanitization events were recorded.' }, context || {});
        notifySecurityEvent(record, context || {});
        return standardFailure(stage, violations, { requestId: requestId, validationRiskScore: trust.validationRiskScore, requestTrustScore: trust.requestTrustScore }, context || {});
    }

    function validateApiRequest(request, config, context) {
        var requestId = createId('APR');
        var options = config && typeof config === 'object' ? config : {};
        var incoming = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
        var preliminaryTenant = normalizeTenant(incoming.tenantSlug || contextTenant(context || {}));
        try {
            if (!request || typeof request !== 'object' || Array.isArray(request)) return finalizeBlocked({}, options, context || {}, requestId, preliminaryTenant, 'INCOMING_REQUEST', [issue('MALFORMED_REQUEST', '$', 'Request envelope must be an object.', 'ERROR', 'INCOMING_REQUEST')], []);
            var rawText = typeof incoming.payload === 'string' ? incoming.payload : (function stringify() { try { return JSON.stringify(incoming.payload); } catch (error) { return ''; } })();
            if (!rawText && incoming.payload && typeof incoming.payload === 'object') return finalizeBlocked(incoming, options, context || {}, requestId, preliminaryTenant, 'INCOMING_REQUEST', [issue('MALFORMED_JSON', '$', 'Request payload could not be serialized.', 'ERROR', 'INCOMING_REQUEST')], []);
            var maxBytes = Number.isFinite(Number(options.maxPayloadBytes)) ? Math.max(64, Number(options.maxPayloadBytes)) : MAX_PAYLOAD_BYTES;
            if (byteLength(rawText) > maxBytes) return finalizeBlocked(incoming, options, context || {}, requestId, preliminaryTenant, 'INCOMING_REQUEST', [issue('PAYLOAD_TOO_LARGE', '$', 'Request payload exceeds the allowed size.', 'CRITICAL', 'INCOMING_REQUEST')], []);
            var parsed = parsePayload(incoming.payload);
            if (!parsed.success) return finalizeBlocked(incoming, options, context || {}, requestId, preliminaryTenant, 'INCOMING_REQUEST', parsed.issues, []);
            var payload = parsed.payload;
            var tenantSlug = requestTenant(incoming, payload, context || {});
            var actor = actorFromContext(context || {});
            if (!actor.id) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'AUTHENTICATION_CHECK', [issue('AUTHENTICATION_REQUIRED', '$', 'Authenticated actor is required.', 'CRITICAL', 'AUTHENTICATION_CHECK')], []);
            var allowedRoles = Array.isArray(options.allowedRoles) && options.allowedRoles.length ? options.allowedRoles.map(normalizeRole) : ROLES.slice();
            if (allowedRoles.indexOf(actor.role) === -1) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'AUTHORIZATION_CHECK', [issue('ROLE_NOT_AUTHORIZED', '$', 'Actor role is not authorized for this request.', 'CRITICAL', 'AUTHORIZATION_CHECK')], []);
            var payloadTenant = normalizeTenant(payload && (payload.tenantSlug || payload.tenantId || payload.companyId));
            var actorCanTarget = actor.tenantSlug && actor.tenantSlug === tenantSlug;
            var platformTargetValidated = (actor.role === 'PLATFORM_OWNER' || actor.role === 'SUPER_ADMIN') && context && context.validatedTenantAccess === true && contextTenant(context) === tenantSlug;
            if (!tenantSlug || (actor.tenantSlug && actor.tenantSlug !== tenantSlug) || (!actor.tenantSlug && !platformTargetValidated) || (payloadTenant && payloadTenant !== tenantSlug)) {
                return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'AUTHORIZATION_CHECK', [issue('TENANT_SPOOFING_DETECTED', '$.tenantSlug', 'Tenant identifier does not match the validated actor scope.', 'CRITICAL', 'AUTHORIZATION_CHECK')], []);
            }
            if (!actorCanTarget && !platformTargetValidated) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'AUTHORIZATION_CHECK', [issue('TENANT_ACCESS_NOT_VALIDATED', '$.tenantSlug', 'Tenant access has not been validated.', 'CRITICAL', 'AUTHORIZATION_CHECK')], []);
            var schemaValidation = validatePayload(payload, options.schema, context || {});
            if (!schemaValidation.success) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, schemaValidation.stage || 'SCHEMA_VALIDATION', schemaValidation.issues, []);
            var sanitization = sanitizePayload(payload, context || {});
            if (!sanitization.success) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'SANITIZATION', sanitization.issues, sanitization.events || []);
            var normalization = normalizePayload(sanitization.payload, options.schema, context || {});
            if (!normalization.success) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'NORMALIZATION', normalization.issues, sanitization.events || []);
            var normalizedTenant = normalizeTenant(normalization.payload && (normalization.payload.tenantSlug || normalization.payload.tenantId || normalization.payload.companyId));
            if (normalizedTenant && normalizedTenant !== tenantSlug) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'NORMALIZATION', [issue('TENANT_NORMALIZATION_CONFLICT', '$.tenantSlug', 'Normalized tenant does not match request scope.', 'CRITICAL', 'NORMALIZATION')], sanitization.events || []);
            var business = validateBusinessRules(normalization.payload, options.businessRules || {}, Object.assign({}, context || {}, { tenantSlug: tenantSlug }));
            if (!business.success) return finalizeBlocked(incoming, options, context || {}, requestId, tenantSlug, 'BUSINESS_RULE_VALIDATION', business.issues, sanitization.events || []);
            var trust = calculateRequestTrust({ tenantSlug: tenantSlug, actorId: actor.id, endpoint: incoming.endpoint, violations: [] }, context || {});
            var record = recordValidation(incoming, context || {}, requestId, tenantSlug, 'VALIDATED', 'CONTROLLER_EXECUTION', [], sanitization.events || [], trust);
            audit('API_REQUEST_VALIDATED', { tenantSlug: tenantSlug, requestId: requestId, sanitizationCount: (sanitization.events || []).length, description: 'API request passed validation before controller execution.' }, context || {});
            if ((sanitization.events || []).length) audit('PAYLOAD_SANITIZATION_APPLIED', { tenantSlug: tenantSlug, requestId: requestId, eventCount: sanitization.events.length, description: 'Payload sanitization events were recorded.' }, context || {});
            return freezeValidationResult({
                success: true,
                message: 'Request validation passed.',
                data: { payload: normalization.payload },
                validation: {
                    requestId: requestId, stage: 'CONTROLLER_EXECUTION', controllerExecutionAllowed: true,
                    sanitizationEvents: sanitization.events.length, validationRiskScore: trust.validationRiskScore,
                    requestTrustScore: trust.requestTrustScore, validationId: record.validationId
                },
                governance: governanceFlags(), timestamp: nowIso(context || {})
            });
        } catch (error) {
            return finalizeBlocked(incoming, options, context || {}, requestId, preliminaryTenant, 'INCOMING_REQUEST', [issue('REQUEST_VALIDATION_FAILED_SAFE', '$', 'Request validation failed safely.', 'ERROR', 'INCOMING_REQUEST')], []);
        }
    }

    async function executeValidatedRequest(request, config, context, controller) {
        var validation = validateApiRequest(request, config || {}, context || {});
        if (!validation.success) return validation;
        if (typeof controller !== 'function') return standardFailure('CONTROLLER_EXECUTION', [issue('CONTROLLER_REQUIRED', '$', 'A controller function is required.', 'ERROR', 'CONTROLLER_EXECUTION')], { requestId: validation.validation.requestId, validationRiskScore: validation.validation.validationRiskScore, requestTrustScore: validation.validation.requestTrustScore }, context || {});
        try {
            var result = await controller(validation.data.payload, freezeValidationResult({
                requestId: validation.validation.requestId,
                tenantSlug: requestTenant(request || {}, validation.data.payload, context || {}),
                actor: actorFromContext(context || {}),
                validation: validation.validation
            }));
            return freezeValidationResult({
                success: true, message: 'Request validated and controller executed.', data: result,
                validation: Object.assign({}, validation.validation, { controllerExecuted: true }),
                governance: governanceFlags(), timestamp: nowIso(context || {})
            });
        } catch (error) {
            audit('API_CONTROLLER_EXECUTION_FAILED', { tenantSlug: requestTenant(request || {}, validation.data.payload, context || {}), requestId: validation.validation.requestId, success: false, severity: 'ERROR', description: 'Validated controller execution failed safely.' }, context || {});
            try {
                if (global.ErrorHandlingFrameworkService && typeof global.ErrorHandlingFrameworkService.createApiError === 'function') {
                    return global.ErrorHandlingFrameworkService.createApiError(error, Object.assign({}, context || {}, { module: 'API Payload Validation', action: 'controller execution', endpoint: safeEndpoint(request && request.endpoint) }));
                }
            } catch (frameworkError) {}
            return freezeValidationResult({ success: false, error_code: 'SERVER_ERROR', message: 'Something went wrong. Our team has been notified.', details: { requestId: validation.validation.requestId, controllerExecuted: true } });
        }
    }

    function createValidationMiddleware(config) {
        var options = freezeValidationResult(config || {});
        return async function validationMiddleware(request, context, controller) {
            return executeValidatedRequest(request, options, context || {}, controller);
        };
    }

    function reportAccess(input, context) {
        var actor = actorFromContext(context || {});
        var tenantSlug = normalizeTenant(input && (input.tenantSlug || input.tenantId) || contextTenant(context || {}));
        var allowed = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR'].indexOf(actor.role) !== -1;
        if (actor.tenantSlug && actor.tenantSlug !== tenantSlug) allowed = false;
        if (!actor.tenantSlug && actor.role !== 'PLATFORM_OWNER' && actor.role !== 'SUPER_ADMIN') allowed = false;
        if (!actor.tenantSlug && (actor.role === 'PLATFORM_OWNER' || actor.role === 'SUPER_ADMIN') && !(context && context.validatedTenantAccess === true)) allowed = false;
        return { allowed: allowed && !!tenantSlug, actor: actor, tenantSlug: tenantSlug };
    }

    function generateApiValidationReport(input, context) {
        try {
            var access = reportAccess(input || {}, context || {});
            if (!access.allowed) return standardFailure('AUTHORIZATION_CHECK', [issue('API_VALIDATION_REPORT_ACCESS_DENIED', '$', 'API validation analytics access denied.', 'CRITICAL', 'AUTHORIZATION_CHECK')], {}, context || {});
            var history = tenantHistory('apiValidationHistory', access.tenantSlug);
            var violations = tenantHistory('apiViolationHistory', access.tenantSlug);
            var failures = history.filter(function failed(row) { return row.outcome === 'BLOCKED'; });
            var successes = history.filter(function passed(row) { return row.outcome === 'VALIDATED'; });
            var schemaFailures = violations.filter(function schema(row) { return row.stage === 'SCHEMA_VALIDATION' || row.stage === 'FIELD_VALIDATION'; }).length;
            var sanitizationEvents = violations.filter(function sanitize(row) { return row.stage === 'SANITIZATION'; }).length;
            var securityViolations = violations.filter(function security(row) { return /INJECTION|SPOOFING|POLLUTION|AUTHENTICATION|AUTHORIZATION|TOO_LARGE/.test(row.code || '') || row.severity === 'CRITICAL'; }).length;
            var total = history.length;
            var passRate = total ? successes.length / total : 1;
            var apiHealthScore = clampScore(passRate * 70 + (securityViolations ? Math.max(0, 20 - securityViolations * 2) : 20) + (global.ErrorHandlingFrameworkService ? 10 : 5));
            var complianceScore = clampScore(100 - (total ? (failures.length / total) * 45 : 0) - Math.min(35, securityViolations * 4));
            var qualityScore = clampScore(passRate * 100 - Math.min(40, sanitizationEvents * 2));
            var report = {
                success: true, tenantSlug: access.tenantSlug,
                apiHealthScore: apiHealthScore,
                validationComplianceScore: complianceScore,
                requestQualityScore: qualityScore,
                analytics: {
                    totalRequests: total, validatedRequests: successes.length, validationFailures: failures.length,
                    payloadViolations: violations.length, schemaFailures: schemaFailures,
                    sanitizationEvents: sanitizationEvents, securityViolations: securityViolations,
                    oversizedPayloads: violations.filter(function oversized(row) { return row.code === 'PAYLOAD_TOO_LARGE'; }).length,
                    tenantSpoofingAttempts: violations.filter(function spoof(row) { return row.code === 'TENANT_SPOOFING_DETECTED'; }).length
                },
                recentRequests: history.slice(-30).reverse().map(function map(row) {
                    return {
                        requestId: row.requestId, endpoint: row.endpoint, method: row.method,
                        outcome: row.outcome, stage: row.stage, violationCount: row.violationCount,
                        validationRiskScore: row.validationRiskScore, requestTrustScore: row.requestTrustScore,
                        timestamp: row.timestamp
                    };
                }),
                securityEvents: violations.filter(function critical(row) { return row.severity === 'CRITICAL'; }).slice(-20).reverse().map(function map(row) {
                    return {
                        eventId: row.violationId, category: /SPOOFING/.test(row.code || '') ? 'TENANT_SECURITY' : /INJECTION|POLLUTION/.test(row.code || '') ? 'INJECTION_ATTEMPT' : 'REQUEST_SECURITY',
                        stage: row.stage, severity: row.severity, endpoint: row.endpoint, timestamp: row.timestamp
                    };
                }),
                integrations: {
                    validationRegistry: !!(global.ValidationRegistry || global.ValidationRegistryService),
                    errorHandlingFramework: !!global.ErrorHandlingFrameworkService,
                    authenticationSecurity: !!global.LoginAttemptSecurityService || !!global.authService,
                    auditGovernance: !!global.AuditService,
                    apiMiddleware: true,
                    notificationGovernance: !!global.NotificationCenterService
                },
                governance: governanceFlags(), generatedAt: nowIso(context || {})
            };
            if (!(context && context.skipAnalyticsPersistence)) {
                persistHistory('apiValidationAnalytics', {
                    analyticsId: createId('APA'), tenantSlug: access.tenantSlug,
                    apiHealthScore: apiHealthScore, validationComplianceScore: complianceScore,
                    requestQualityScore: qualityScore, totalRequests: total, validationFailures: failures.length,
                    securityViolations: securityViolations, generatedAt: report.generatedAt
                });
            }
            audit('API_VALIDATION_ANALYTICS_REVIEWED', { tenantSlug: access.tenantSlug, totalRequests: total, description: 'API validation governance analytics reviewed.' }, context || {});
            return freezeValidationResult(report);
        } catch (error) {
            return standardFailure('FIELD_VALIDATION', [issue('API_VALIDATION_REPORT_FAILED_SAFE', '$', 'API validation report failed safely.', 'ERROR', 'FIELD_VALIDATION')], {}, context || {});
        }
    }

    function runSelfTest() {
        var simpleSchema = { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } };
        var valid = validatePayload({ name: 'Asha' }, simpleSchema, {});
        var invalid = validatePayload({}, simpleSchema, {});
        var sanitized = sanitizePayload({ name: '<b>Asha</b>' }, {});
        var business = validateBusinessRules({ tenantSlug: 'self-test', lifecycleState: 'ACTIVE' }, { lifecycleField: 'lifecycleState', allowedLifecycleStates: ['ACTIVE'] }, { tenantSlug: 'self-test', actor: { id: 'SELF', role: 'EMPLOYEE', tenantSlug: 'self-test' } });
        var frozen = freezeValidationResult({ nested: { value: 1 } });
        var checks = [
            { name: 'schema validation works', passed: valid.success && !invalid.success },
            { name: 'sanitization works', passed: sanitized.success && sanitized.payload.name === 'Asha' },
            { name: 'business validation works', passed: business.success },
            { name: 'tenant validation works', passed: normalizeTenant('TEN-tabsons') === 'tabsons' },
            { name: 'immutable outputs enforced', passed: Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) }
        ];
        var result = freezeValidationResult({ passed: checks.every(function pass(check) { return check.passed; }), checks: checks, summary: 'API payload validation self-test completed.' });
        global.__ARTHHRMS_API_VALIDATION_SELF_TEST__ = result;
        return result;
    }

    var ApiPayloadValidationService = Object.freeze({
        VALIDATION_STAGES: VALIDATION_STAGES,
        ROLES: ROLES,
        MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
        validatePayload: validatePayload,
        sanitizePayload: sanitizePayload,
        normalizePayload: normalizePayload,
        validateBusinessRules: validateBusinessRules,
        calculateRequestTrust: calculateRequestTrust,
        freezeValidationResult: freezeValidationResult,
        validateApiRequest: validateApiRequest,
        executeValidatedRequest: executeValidatedRequest,
        createValidationMiddleware: createValidationMiddleware,
        generateApiValidationReport: generateApiValidationReport,
        runSelfTest: runSelfTest
    });

    global.ApiPayloadValidationService = ApiPayloadValidationService;
    global.apiPayloadValidationService = ApiPayloadValidationService;

    if (global.__ARTHHRMS_DEV__) runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
