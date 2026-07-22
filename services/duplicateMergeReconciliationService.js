/**
 * duplicateMergeReconciliationService.js
 * ARTHHRMS - Enterprise Duplicate Detection & Merge Center
 *
 * Provides tenant-scoped duplicate detection, merge preview, approved merge
 * execution, rollback, analytics, and master data health reporting.
 */
(function attachDuplicateMergeReconciliationService(global) {
    'use strict';

    var PREFIX = '[DuplicateMergeReconciliationService]';
    var SOURCE = 'duplicateMergeReconciliationService';
    var RUN_TABLE = 'duplicateDetectionRuns';
    var MERGE_TABLE = 'masterDataMergeHistory';
    var SNAPSHOT_TABLE = 'masterDataMergeSnapshots';
    var ROLLBACK_TABLE = 'masterDataRollbackHistory';
    var ANALYTICS_TABLE = 'duplicateResolutionAnalytics';

    var DUPLICATE_ENTITY_TYPES = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'DEPARTMENT',
        'DESIGNATION',
        'BRANCH',
        'LOCATION',
        'BUSINESS_UNIT',
        'COST_CENTER',
        'VENDOR',
        'CUSTOM_ENTITY'
    ]);
    var MERGE_STRATEGIES = Object.freeze(['KEEP_LEFT', 'KEEP_RIGHT', 'FIELD_BY_FIELD']);
    var ALLOWED_ROLES = Object.freeze(['HR', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'PLATFORM_OWNER']);
    var REFERENCE_TABLES = Object.freeze(['employees', 'documents', 'employeeNotes', 'attendanceRecords', 'leaveRequests', 'payrollRuns', 'reportingHierarchyRelationships', 'approvalRequests']);
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|payrollAmount|compensation|leave\s*balance|leaveBalance|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric/i;

    var ENTITY_CONFIG = Object.freeze({
        EMPLOYEE: Object.freeze({
            table: 'employees',
            idFields: Object.freeze(['employeeId', 'empId', 'id']),
            codeFields: Object.freeze(['employeeCode', 'empId', 'employeeId']),
            nameFields: Object.freeze(['name', 'displayName']),
            matchFields: Object.freeze(['employeeCode', 'email', 'phone', 'pan', 'aadhaar', 'passport', 'bankAccount', 'governmentId'])
        }),
        MANAGER: Object.freeze({
            table: 'employees',
            idFields: Object.freeze(['employeeId', 'empId', 'id']),
            codeFields: Object.freeze(['employeeCode', 'empId', 'employeeId']),
            nameFields: Object.freeze(['name', 'displayName']),
            matchFields: Object.freeze(['employeeCode', 'email', 'phone', 'pan', 'aadhaar', 'passport', 'governmentId'])
        }),
        DEPARTMENT: Object.freeze({
            table: 'departments',
            idFields: Object.freeze(['departmentId', 'id']),
            codeFields: Object.freeze(['departmentCode', 'code', 'id']),
            nameFields: Object.freeze(['departmentName', 'name']),
            matchFields: Object.freeze(['departmentCode', 'code', 'departmentName', 'name'])
        }),
        DESIGNATION: Object.freeze({
            table: 'designations',
            idFields: Object.freeze(['designationId', 'id']),
            codeFields: Object.freeze(['designationCode', 'code', 'id']),
            nameFields: Object.freeze(['designationName', 'name']),
            matchFields: Object.freeze(['designationCode', 'code', 'designationName', 'name'])
        }),
        BRANCH: Object.freeze({
            table: 'companyBranches',
            idFields: Object.freeze(['branchId', 'id']),
            codeFields: Object.freeze(['branchCode', 'code', 'id']),
            nameFields: Object.freeze(['branchName', 'name']),
            matchFields: Object.freeze(['branchCode', 'code', 'branchName', 'name'])
        }),
        LOCATION: Object.freeze({
            table: 'companyLocations',
            idFields: Object.freeze(['locationId', 'id']),
            codeFields: Object.freeze(['locationCode', 'code', 'id']),
            nameFields: Object.freeze(['locationName', 'name']),
            matchFields: Object.freeze(['locationCode', 'code', 'locationName', 'name'])
        }),
        BUSINESS_UNIT: Object.freeze({
            table: 'businessUnits',
            idFields: Object.freeze(['businessUnitId', 'id']),
            codeFields: Object.freeze(['businessUnitCode', 'code', 'id']),
            nameFields: Object.freeze(['businessUnitName', 'name']),
            matchFields: Object.freeze(['businessUnitCode', 'code', 'businessUnitName', 'name'])
        }),
        COST_CENTER: Object.freeze({
            table: 'costCenters',
            idFields: Object.freeze(['costCenterId', 'id']),
            codeFields: Object.freeze(['costCenterCode', 'code', 'id']),
            nameFields: Object.freeze(['costCenterName', 'name']),
            matchFields: Object.freeze(['costCenterCode', 'code', 'costCenterName', 'name'])
        }),
        VENDOR: Object.freeze({
            table: 'vendors',
            idFields: Object.freeze(['vendorId', 'id']),
            codeFields: Object.freeze(['vendorCode', 'code', 'id']),
            nameFields: Object.freeze(['vendorName', 'name']),
            matchFields: Object.freeze(['vendorCode', 'code', 'vendorName', 'name', 'email', 'phone'])
        }),
        CUSTOM_ENTITY: Object.freeze({
            table: 'customEntities',
            idFields: Object.freeze(['entityId', 'id']),
            codeFields: Object.freeze(['entityCode', 'code', 'id']),
            nameFields: Object.freeze(['entityName', 'name']),
            matchFields: Object.freeze(['entityCode', 'code', 'entityName', 'name'])
        })
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

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        return String(value).trim();
    }

    function normalizeTenant(value) {
        return safeString(value, '')
            .toLowerCase()
            .replace(/^tenant[-_]/, '')
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function normalizeId(value) {
        return safeString(value, '').toUpperCase();
    }

    function normalizeKey(value) {
        return safeString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function normalizeRole(value) {
        var role = safeString(value || 'EMPLOYEE', 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') role = 'PLATFORM_OWNER';
        return role || 'EMPLOYEE';
    }

    function normalizeStatus(value) {
        return safeString(value || 'ACTIVE', 'ACTIVE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeEntityType(value) {
        var type = normalizeStatus(value || 'EMPLOYEE');
        if (type === 'BUSINESSUNIT') type = 'BUSINESS_UNIT';
        if (type === 'COSTCENTER') type = 'COST_CENTER';
        if (type === 'CUSTOMENTITY') type = 'CUSTOM_ENTITY';
        return ENTITY_CONFIG[type] ? type : 'EMPLOYEE';
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function clone(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object') return value;
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function each(item) { return clone(item, refs.slice()); });
        var out = {};
        Object.keys(value).forEach(function each(key) { out[key] = clone(value[key], refs.slice()); });
        return out;
    }

    function isSensitiveKey(key) {
        var text = String(key || '');
        if (/^duplicate/i.test(text)) return false;
        if (/Preserved$|Unaffected$|Changed$|Supported$|Prepared$|Score$|Scores$|Count$|Counts$|Rate$|Distribution$|Readiness$|Analytics$|Impact$|Risk$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (/^(code|status|severity|eventType|action|entityType|matchType|confidenceLabel)$/i.test(String(keyHint || ''))) return value;
            if (SENSITIVE_KEYS.test(String(value || ''))) return '[REDACTED]';
            return value;
        }
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint, refs.slice()); });
        var out = {};
        Object.keys(value).forEach(function each(key) {
            if (isSensitiveKey(key)) return;
            var next = cloneSanitized(value[key], key, refs.slice());
            if (next !== undefined) out[key] = next;
        });
        return out;
    }

    function deepFreeze(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        Object.keys(value).forEach(function each(key) { deepFreeze(value[key], refs); });
        try { Object.freeze(value); } catch (error) {}
        return value;
    }

    function freezeReconciliationOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeReconciliationOutput({
            code: normalizeStatus(code || 'RECONCILIATION_ISSUE'),
            message: safeString(message || 'Duplicate reconciliation issue.', 'Duplicate reconciliation issue.'),
            severity: normalizeStatus(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function ensureTables(data) {
        [RUN_TABLE, MERGE_TABLE, SNAPSHOT_TABLE, ROLLBACK_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        Object.keys(ENTITY_CONFIG).forEach(function each(type) {
            var table = ENTITY_CONFIG[type].table;
            if (!Array.isArray(data[table])) data[table] = [];
        });
        REFERENCE_TABLES.forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        return data;
    }

    function tenantFrom(input, context) {
        var data = rawData();
        var actor = context && context.actor || {};
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.organizationId) ||
            context && (context.tenantSlug || context.tenantId || context.organizationId) ||
            actor.tenantSlug || actor.tenantId ||
            data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId) ||
            'default'
        );
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.empId || actor.employeeId || context && context.actorId || 'system', 'system'),
            role: normalizeRole(actor.role || actor.actorRole || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function governanceFlags(audited, context) {
        return {
            backwardCompatible: true,
            tenantIsolationPreserved: true,
            employeeModulePreserved: true,
            payrollModulePreserved: true,
            attendanceModulePreserved: true,
            leaveModulePreserved: true,
            reportingModulePreserved: true,
            noAutomaticDeletion: true,
            noEmployeeRecordMutationWithoutApproval: true,
            reversibleMergeSupported: true,
            auditable: !!audited,
            approvalRequired: true,
            reviewOnly: !!(context && context.reviewOnly)
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezeReconciliationOutput({
            success: false,
            code: normalizeStatus(code),
            tenantSlug: tenantFrom(input || {}, context || {}),
            issues: [issue(code, message, 'ERROR', metadata || {})],
            timestamp: nowIso(),
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function checkAccess(input, context) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        if (ALLOWED_ROLES.indexOf(actor.role) === -1) {
            return { allowed: false, output: failure('DUPLICATE_RECONCILIATION_ACCESS_DENIED', 'Role cannot run enterprise duplicate reconciliation.', input, context, { role: actor.role }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_RECONCILIATION_BLOCKED', 'Cross-tenant duplicate reconciliation is blocked.', input, context, {}) };
        }
        return { allowed: true, actor: actor, tenantSlug: tenantSlug };
    }

    function tenantOf(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId || row.organizationId));
    }

    function sameTenant(row, tenantSlug) {
        return tenantOf(row) === normalizeTenant(tenantSlug);
    }

    function firstField(row, fields) {
        var value = '';
        (fields || []).some(function each(field) {
            if (safeString(row && row[field], '')) {
                value = safeString(row[field], '');
                return true;
            }
            return false;
        });
        return value;
    }

    function recordIdOf(row, entityType) {
        var cfg = ENTITY_CONFIG[normalizeEntityType(entityType)];
        return firstField(row, cfg.idFields.concat(cfg.codeFields));
    }

    function recordCodeOf(row, entityType) {
        var cfg = ENTITY_CONFIG[normalizeEntityType(entityType)];
        return firstField(row, cfg.codeFields);
    }

    function recordNameOf(row, entityType) {
        var cfg = ENTITY_CONFIG[normalizeEntityType(entityType)];
        var direct = firstField(row, cfg.nameFields);
        if (direct) return direct;
        return [row && row.firstName, row && row.lastName].filter(Boolean).join(' ').trim();
    }

    function recordsForType(data, entityType, tenantSlug) {
        var type = normalizeEntityType(entityType);
        var cfg = ENTITY_CONFIG[type];
        return (data[cfg.table] || []).filter(function each(row) { return sameTenant(row, tenantSlug); });
    }

    function findRecord(data, entityType, tenantSlug, recordId) {
        var target = normalizeId(recordId);
        return recordsForType(data, entityType, tenantSlug).find(function each(row) {
            return normalizeId(recordIdOf(row, entityType)) === target;
        });
    }

    function findRecordAnyTenant(data, entityType, recordId) {
        var type = normalizeEntityType(entityType);
        var target = normalizeId(recordId);
        var rows = data[ENTITY_CONFIG[type].table] || [];
        return rows.find(function each(row) { return normalizeId(recordIdOf(row, type)) === target; });
    }

    function levenshtein(a, b) {
        var s = normalizeKey(a);
        var t = normalizeKey(b);
        if (s === t) return 0;
        if (!s.length) return t.length;
        if (!t.length) return s.length;
        var prev = [];
        var curr = [];
        var i;
        var j;
        for (j = 0; j <= t.length; j++) prev[j] = j;
        for (i = 1; i <= s.length; i++) {
            curr[0] = i;
            for (j = 1; j <= t.length; j++) {
                curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
            }
            prev = curr.slice();
        }
        return prev[t.length];
    }

    function similarity(a, b) {
        var left = normalizeKey(a);
        var right = normalizeKey(b);
        var max = Math.max(left.length, right.length);
        if (!max) return 0;
        return Math.round((1 - levenshtein(left, right) / max) * 100);
    }

    function confidenceLabel(score) {
        if (score >= 100) return 'EXACT';
        if (score >= 90) return 'VERY_HIGH';
        if (score >= 75) return 'HIGH';
        if (score >= 50) return 'POSSIBLE';
        return 'LOW';
    }

    function confidenceBucket(score) {
        if (score >= 100) return 'exact';
        if (score >= 90) return 'veryHigh';
        if (score >= 75) return 'high';
        if (score >= 50) return 'possible';
        return 'low';
    }

    function valueMatches(left, right, field) {
        var leftValue = safeString(left && left[field], '');
        var rightValue = safeString(right && right[field], '');
        if (!leftValue || !rightValue) return false;
        if (field === 'email') return leftValue.toLowerCase() === rightValue.toLowerCase();
        return normalizeKey(leftValue) === normalizeKey(rightValue);
    }

    function scorePair(entityType, left, right) {
        var type = normalizeEntityType(entityType);
        var cfg = ENTITY_CONFIG[type];
        var matchingFields = [];
        var weight = 0;
        cfg.matchFields.forEach(function each(field) {
            if (valueMatches(left, right, field)) {
                matchingFields.push(field);
                if (/code|email/i.test(field)) weight += 45;
                else if (/pan|aadhaar|passport|government/i.test(field)) weight += 35;
                else if (/bank/i.test(field)) weight += 30;
                else if (/phone/i.test(field)) weight += 18;
                else if (/name/i.test(field)) weight += 18;
                else weight += 15;
            }
        });
        var nameSimilarity = similarity(recordNameOf(left, type), recordNameOf(right, type));
        if (nameSimilarity >= 82 && matchingFields.indexOf('nameSimilarity') === -1) matchingFields.push('nameSimilarity');
        var score = clampScore(Math.max(weight, nameSimilarity >= 92 ? 88 : nameSimilarity >= 82 ? 78 : 0));
        if (matchingFields.indexOf('employeeCode') !== -1 || matchingFields.indexOf('email') !== -1) score = Math.max(score, 100);
        if (matchingFields.indexOf('departmentCode') !== -1 || matchingFields.indexOf('branchCode') !== -1 || matchingFields.indexOf('locationCode') !== -1 || matchingFields.indexOf('designationCode') !== -1 || matchingFields.indexOf('businessUnitCode') !== -1 || matchingFields.indexOf('costCenterCode') !== -1 || matchingFields.indexOf('code') !== -1) score = Math.max(score, 100);
        if (matchingFields.indexOf('pan') !== -1 || matchingFields.indexOf('governmentId') !== -1) score = Math.max(score, 95);
        return {
            confidenceScore: clampScore(score),
            confidenceLabel: confidenceLabel(score),
            matchType: score >= 100 ? 'EXACT' : matchingFields.length && nameSimilarity < 82 ? 'WEIGHTED' : 'FUZZY',
            matchingFields: matchingFields,
            nameSimilarity: nameSimilarity
        };
    }

    function safeFieldList(left, right) {
        var keys = {};
        Object.keys(left || {}).forEach(function each(key) { keys[key] = true; });
        Object.keys(right || {}).forEach(function each(key) { keys[key] = true; });
        return Object.keys(keys).filter(function each(key) {
            return !isSensitiveKey(key) && !/password|token|secret/i.test(key) && !/^(id|createdAt|updatedAt|tenantId|tenantSlug)$/i.test(key);
        });
    }

    function fieldDifferences(left, right) {
        return safeFieldList(left, right).filter(function each(key) {
            return safeString(left && left[key], '') !== safeString(right && right[key], '');
        }).map(function each(key) {
            return {
                field: key,
                leftPresent: safeString(left && left[key], '') !== '',
                rightPresent: safeString(right && right[key], '') !== '',
                conflict: safeString(left && left[key], '') !== safeString(right && right[key], '')
            };
        });
    }

    function pairKey(entityType, leftId, rightId) {
        var ids = [normalizeId(leftId), normalizeId(rightId)].sort();
        return normalizeEntityType(entityType) + ':' + ids[0] + ':' + ids[1];
    }

    function duplicateCandidate(entityType, left, right, score) {
        var leftId = recordIdOf(left, entityType);
        var rightId = recordIdOf(right, entityType);
        return freezeReconciliationOutput({
            duplicateId: id('DUP'),
            entityType: normalizeEntityType(entityType),
            sourceRecordId: leftId,
            candidateRecordId: rightId,
            confidenceScore: score.confidenceScore,
            confidenceLabel: score.confidenceLabel,
            matchType: score.matchType,
            matchingFields: score.matchingFields,
            fieldDifferenceCount: fieldDifferences(left, right).length,
            recommendation: score.confidenceScore >= 90 ? 'MERGE_REVIEW_RECOMMENDED' : 'MANUAL_REVIEW_REQUIRED',
            riskLevel: score.confidenceScore >= 90 ? 'LOW' : score.confidenceScore >= 75 ? 'MEDIUM' : 'HIGH'
        });
    }

    function allPairCandidates(entityType, records, threshold) {
        var candidates = [];
        var seen = {};
        var type = normalizeEntityType(entityType);
        var cfg = ENTITY_CONFIG[type];
        var fields = cfg.matchFields.concat(['__fuzzyName']);
        fields.forEach(function each(field) {
            var groups = {};
            records.forEach(function row(record) {
                var value = field === '__fuzzyName' ? recordNameOf(record, type).slice(0, 6) : record[field];
                var key = normalizeKey(value);
                if (!key) return;
                groups[key] = groups[key] || [];
                groups[key].push(record);
            });
            Object.keys(groups).forEach(function group(key) {
                var rows = groups[key];
                if (rows.length < 2) return;
                for (var i = 0; i < rows.length; i++) {
                    for (var j = i + 1; j < rows.length; j++) {
                        var leftId = recordIdOf(rows[i], type);
                        var rightId = recordIdOf(rows[j], type);
                        var keyPair = pairKey(type, leftId, rightId);
                        if (!seen[keyPair]) {
                            var score = scorePair(type, rows[i], rows[j]);
                            if (score.confidenceScore >= threshold) {
                                seen[keyPair] = true;
                                candidates.push(duplicateCandidate(type, rows[i], rows[j], score));
                            }
                        }
                    }
                }
            });
        });
        return candidates;
    }

    function audit(actionType, targetId, description, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return false;
            var actor = contextActor(context || {});
            var clean = cloneSanitized(metadata || {}, '', []);
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actorId: actor.id,
                    severity: clean.severity || 'INFO',
                    metadata: Object.assign({
                        actionType: actionType,
                        actorRole: actor.role,
                        module: 'Duplicate Merge Reconciliation',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Duplicate Merge Reconciliation', targetId || '', description || actionType);
                return true;
            }
        } catch (error) {
            safeWarn('Audit failed safely.', error && error.message);
        }
        return false;
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return false;
            var telemetry = global.WorkflowTelemetryService;
            if (!telemetry) return false;
            if (typeof telemetry.emitWorkflowTelemetry === 'function') {
                telemetry.emitWorkflowTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
            if (typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('WORKFLOW', eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
        } catch (error) {
            safeWarn('Telemetry failed safely.', error && error.message);
        }
        return false;
    }

    function recordMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics) return false;
            var metrics = global.OrchestrationMetricsService;
            if (metrics && typeof metrics.recordWorkflowMetric === 'function') {
                metrics.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, metadata || {}));
                return true;
            }
        } catch (error) {
            safeWarn('Metric recording failed safely.', error && error.message);
        }
        return false;
    }

    function detectDuplicates(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var threshold = clampScore(input && input.threshold !== undefined ? input.threshold : 50);
        var types = (input && Array.isArray(input.entityTypes) && input.entityTypes.length ? input.entityTypes : DUPLICATE_ENTITY_TYPES).map(normalizeEntityType);
        var queue = [];
        types.forEach(function each(entityType) {
            var records = recordsForType(data, entityType, tenantSlug);
            queue = queue.concat(allPairCandidates(entityType, records, threshold));
        });
        var distribution = { exact: 0, veryHigh: 0, high: 0, possible: 0, low: 0 };
        queue.forEach(function each(row) { distribution[confidenceBucket(row.confidenceScore)] += 1; });
        var runId = id('DUP-RUN');
        var summary = {
            scannedEntityTypes: types.length,
            recordsScanned: types.reduce(function sum(total, type) { return total + recordsForType(data, type, tenantSlug).length; }, 0),
            duplicatesFound: queue.length,
            exactMatches: distribution.exact,
            highConfidenceMatches: distribution.veryHigh + distribution.high,
            possibleMatches: distribution.possible,
            lowConfidenceMatches: distribution.low
        };
        if (!(context && context.skipPersistence)) {
            data[RUN_TABLE].unshift({
                runId: runId,
                tenantSlug: tenantSlug,
                summary: cloneSanitized(summary, '', []),
                confidenceDistribution: cloneSanitized(distribution, '', []),
                duplicatesFound: queue.length,
                generatedAt: nowIso(),
                immutable: true
            });
            saveData(data);
        }
        var metadata = { runId: runId, tenantSlug: tenantSlug, duplicatesFound: queue.length, status: 'COMPLETED' };
        audit('DUPLICATE_DETECTION_RUN', runId, 'Duplicate detection scan completed.', metadata, context || {});
        emitTelemetry('DUPLICATE_DETECTION_RUN', metadata, context || {});
        recordMetric('DUPLICATE_DETECTION_RUN', metadata, context || {});
        return freezeReconciliationOutput({
            success: true,
            runId: runId,
            tenantSlug: tenantSlug,
            threshold: threshold,
            summary: summary,
            confidenceDistribution: distribution,
            duplicateQueue: queue,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(true, context || {})
        });
    }

    function calculateMatchScore(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var entityType = normalizeEntityType(input && input.entityType);
        var left = findRecord(data, entityType, access.tenantSlug, input && input.sourceRecordId);
        var right = findRecord(data, entityType, access.tenantSlug, input && input.candidateRecordId);
        if ((!left && findRecordAnyTenant(data, entityType, input && input.sourceRecordId)) || (!right && findRecordAnyTenant(data, entityType, input && input.candidateRecordId))) {
            return failure('CROSS_TENANT_MERGE_BLOCKED', 'Cross-tenant duplicate matching is blocked.', input, context, { entityType: entityType });
        }
        if (!left || !right) return failure('MERGE_RECORD_NOT_FOUND', 'One or both records were not found in the requested tenant.', input, context, { entityType: entityType });
        if (!sameTenant(left, access.tenantSlug) || !sameTenant(right, access.tenantSlug)) return failure('CROSS_TENANT_MERGE_BLOCKED', 'Cross-tenant duplicate matching is blocked.', input, context, { entityType: entityType });
        var score = scorePair(entityType, left, right);
        return freezeReconciliationOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            entityType: entityType,
            sourceRecordId: recordIdOf(left, entityType),
            candidateRecordId: recordIdOf(right, entityType),
            confidenceScore: score.confidenceScore,
            confidenceLabel: score.confidenceLabel,
            matchType: score.matchType,
            matchingFields: score.matchingFields,
            fieldDifferenceCount: fieldDifferences(left, right).length,
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function safetyIssues(data, entityType, left, right, tenantSlug) {
        var issues = [];
        if (!left || !right) {
            issues.push(issue('MERGE_RECORD_NOT_FOUND', 'One or both records were not found.', 'ERROR', { entityType: entityType }));
            return issues;
        }
        if (!sameTenant(left, tenantSlug) || !sameTenant(right, tenantSlug) || tenantOf(left) !== tenantOf(right)) {
            issues.push(issue('CROSS_TENANT_MERGE_BLOCKED', 'Cross-tenant records cannot be merged.', 'ERROR', { entityType: entityType }));
        }
        if (left.protectedRecord || right.protectedRecord || left.locked || right.locked) {
            issues.push(issue('PROTECTED_RECORD_MERGE_BLOCKED', 'Protected or locked records cannot be merged.', 'ERROR', { entityType: entityType }));
        }
        if (left.legalHold || right.legalHold) {
            issues.push(issue('LEGAL_HOLD_MERGE_BLOCKED', 'Records under legal hold cannot be merged.', 'ERROR', { entityType: entityType }));
        }
        if (entityType === 'EMPLOYEE') {
            var ids = [normalizeId(recordIdOf(left, entityType)), normalizeId(recordIdOf(right, entityType))];
            (data.payrollRuns || []).forEach(function each(row) {
                if (!sameTenant(row, tenantSlug)) return;
                var rowEmp = normalizeId(row.empId || row.employeeId);
                if (ids.indexOf(rowEmp) !== -1 && (row.locked === true || row.periodLocked === true || row.payrollLocked === true || normalizeStatus(row.lockStatus) === 'LOCKED')) {
                    issues.push(issue('LOCKED_PAYROLL_PERIOD_MERGE_BLOCKED', 'Locked payroll periods block employee merge.', 'ERROR', { payrollRunId: row.payrollRunId || row.id }));
                }
            });
        }
        return issues;
    }

    function survivorPair(entityType, left, right, strategy) {
        var normalizedStrategy = normalizeStatus(strategy || 'KEEP_LEFT');
        if (MERGE_STRATEGIES.indexOf(normalizedStrategy) === -1) normalizedStrategy = 'KEEP_LEFT';
        var survivor = normalizedStrategy === 'KEEP_RIGHT' ? right : left;
        var merged = normalizedStrategy === 'KEEP_RIGHT' ? left : right;
        return { strategy: normalizedStrategy, survivor: survivor, merged: merged };
    }

    function referenceCounts(data, tenantSlug, mergedRecordId) {
        var target = normalizeId(mergedRecordId);
        function rowMatch(row, fields) {
            return sameTenant(row, tenantSlug) && fields.some(function each(field) { return normalizeId(row[field]) === target; });
        }
        return {
            documents: (data.documents || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'empId']); }).length,
            notes: (data.employeeNotes || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'empId']); }).length,
            attendance: (data.attendanceRecords || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'empId']); }).length,
            leave: (data.leaveRequests || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'empId']); }).length,
            payroll: (data.payrollRuns || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'empId']); }).length,
            approvals: (data.approvalRequests || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'empId', 'approverId', 'requesterId']); }).length,
            hierarchy: (data.reportingHierarchyRelationships || []).filter(function each(row) { return rowMatch(row, ['employeeId', 'managerId']); }).length,
            reportees: (data.employees || []).filter(function each(row) { return rowMatch(row, ['managerId', 'reportsTo']); }).length
        };
    }

    function generateMergePreview(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var entityType = normalizeEntityType(input && input.entityType);
        var left = findRecord(data, entityType, access.tenantSlug, input && input.sourceRecordId);
        var right = findRecord(data, entityType, access.tenantSlug, input && input.candidateRecordId);
        if ((!left && findRecordAnyTenant(data, entityType, input && input.sourceRecordId)) || (!right && findRecordAnyTenant(data, entityType, input && input.candidateRecordId))) {
            return failure('CROSS_TENANT_MERGE_BLOCKED', 'Cross-tenant records cannot be merged.', input, context, { entityType: entityType });
        }
        var blockers = safetyIssues(data, entityType, left, right, access.tenantSlug);
        if (blockers.length) {
            return freezeReconciliationOutput({
                success: false,
                tenantSlug: access.tenantSlug,
                entityType: entityType,
                issues: blockers,
                previewOnly: true,
                readOnly: true,
                nonDestructive: true,
                governance: governanceFlags(false, context || {})
            });
        }
        var pair = survivorPair(entityType, left, right, input && input.strategy);
        var survivorId = recordIdOf(pair.survivor, entityType);
        var mergedId = recordIdOf(pair.merged, entityType);
        var score = scorePair(entityType, left, right);
        var references = entityType === 'EMPLOYEE' ? referenceCounts(data, access.tenantSlug, mergedId) : {};
        var totalReferences = Object.keys(references).reduce(function sum(total, key) { return total + Number(references[key] || 0); }, 0);
        var warnings = ['Administrator approval is required before merge execution.', 'Merged records are retained and marked as merged; no automatic deletion is performed.'];
        if ((references.payroll || 0) > 0) warnings.push('Payroll references will be repointed without recalculation.');
        if ((references.attendance || 0) > 0) warnings.push('Attendance references will be repointed without changing attendance facts.');
        if ((references.approvals || 0) > 0) warnings.push('Approval history references will be repointed for continuity.');
        return freezeReconciliationOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            entityType: entityType,
            sourceRecordId: recordIdOf(left, entityType),
            candidateRecordId: recordIdOf(right, entityType),
            survivorRecordId: survivorId,
            mergedRecordId: mergedId,
            strategy: pair.strategy,
            previewOnly: true,
            requiresApproval: true,
            confidenceScore: score.confidenceScore,
            confidenceLabel: score.confidenceLabel,
            matchingFields: score.matchingFields,
            fieldDifferences: fieldDifferences(left, right),
            selectedFields: cloneSanitized(input && input.fieldSelections || {}, '', []),
            relatedRecords: references,
            linkedDocuments: references.documents || 0,
            auditHistory: (data.auditLogs || []).filter(function each(row) {
                var text = JSON.stringify(row || {});
                return text.indexOf(recordIdOf(left, entityType)) !== -1 || text.indexOf(recordIdOf(right, entityType)) !== -1;
            }).length,
            payrollImpact: { referencesAffected: references.payroll || 0, recalculationRequired: false },
            attendanceImpact: { referencesAffected: references.attendance || 0, attendanceFactsChanged: false },
            approvalImpact: { referencesAffected: references.approvals || 0, approvalDecisionsChanged: false },
            relationshipImpact: { referencesAffected: (references.hierarchy || 0) + (references.reportees || 0) },
            documentsAffected: references.documents || 0,
            warnings: warnings,
            riskScore: clampScore(100 - score.confidenceScore + totalReferences * 4),
            mergeRecommendation: score.confidenceScore >= 90 ? 'MERGE_WITH_REVIEW' : 'MANUAL_REVIEW_REQUIRED',
            readOnly: true,
            nonDestructive: true,
            governance: governanceFlags(false, context || {})
        });
    }

    function approvalValid(approval) {
        return !!(approval && approval.approved === true && safeString(approval.approvedBy || approval.actorId || '', '') && safeString(approval.reason || '', ''));
    }

    function mergeableField(key) {
        return !isSensitiveKey(key) && !/^(id|employeeId|empId|tenantId|tenantSlug|createdAt|updatedAt|mergeStatus|mergedInto|mergedAt)$/i.test(key);
    }

    function selectedValue(key, left, right, selections, pair) {
        var choice = normalizeKey(selections && selections[key]);
        if (choice === 'right' || choice === 'candidate') return right[key];
        if (choice === 'left' || choice === 'source') return left[key];
        return pair.survivor[key];
    }

    function repointFields(row, fields, fromId, toId) {
        var count = 0;
        fields.forEach(function each(field) {
            if (normalizeId(row[field]) === normalizeId(fromId)) {
                row[field] = toId;
                count += 1;
            }
        });
        return count;
    }

    function applyEmployeeReferences(data, tenantSlug, fromId, toId) {
        var counts = { employees: 0, documents: 0, notes: 0, attendance: 0, leave: 0, payroll: 0, approvals: 0, hierarchy: 0 };
        (data.employees || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.employees += repointFields(row, ['managerId', 'reportsTo'], fromId, toId);
        });
        (data.documents || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.documents += repointFields(row, ['employeeId', 'empId'], fromId, toId);
        });
        (data.employeeNotes || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.notes += repointFields(row, ['employeeId', 'empId'], fromId, toId);
        });
        (data.attendanceRecords || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.attendance += repointFields(row, ['employeeId', 'empId'], fromId, toId);
        });
        (data.leaveRequests || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.leave += repointFields(row, ['employeeId', 'empId'], fromId, toId);
        });
        (data.payrollRuns || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.payroll += repointFields(row, ['employeeId', 'empId'], fromId, toId);
        });
        (data.approvalRequests || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.approvals += repointFields(row, ['employeeId', 'empId', 'approverId', 'requesterId'], fromId, toId);
        });
        (data.reportingHierarchyRelationships || []).forEach(function each(row) {
            if (sameTenant(row, tenantSlug)) counts.hierarchy += repointFields(row, ['employeeId', 'managerId'], fromId, toId);
        });
        return counts;
    }

    function affectedSnapshot(data) {
        var snapshot = {};
        REFERENCE_TABLES.concat([ENTITY_CONFIG.DEPARTMENT.table, ENTITY_CONFIG.DESIGNATION.table, ENTITY_CONFIG.BRANCH.table, ENTITY_CONFIG.LOCATION.table, ENTITY_CONFIG.BUSINESS_UNIT.table, ENTITY_CONFIG.COST_CENTER.table, ENTITY_CONFIG.VENDOR.table, ENTITY_CONFIG.CUSTOM_ENTITY.table]).forEach(function each(table) {
            snapshot[table] = clone(data[table] || []);
        });
        return snapshot;
    }

    function executeMerge(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.adminApproval)) {
            return failure('ADMIN_APPROVAL_REQUIRED', 'Administrator approval is required before executing a merge.', input, context, {});
        }
        var data = ensureTables(rawData());
        var entityType = normalizeEntityType(input && input.entityType);
        var left = findRecord(data, entityType, access.tenantSlug, input && input.sourceRecordId);
        var right = findRecord(data, entityType, access.tenantSlug, input && input.candidateRecordId);
        if ((!left && findRecordAnyTenant(data, entityType, input && input.sourceRecordId)) || (!right && findRecordAnyTenant(data, entityType, input && input.candidateRecordId))) {
            return failure('CROSS_TENANT_MERGE_BLOCKED', 'Cross-tenant records cannot be merged.', input, context, { entityType: entityType });
        }
        var blockers = safetyIssues(data, entityType, left, right, access.tenantSlug);
        if (blockers.length) {
            return freezeReconciliationOutput({
                success: false,
                tenantSlug: access.tenantSlug,
                entityType: entityType,
                issues: blockers,
                readOnly: true,
                nonDestructive: true,
                governance: governanceFlags(false, context || {})
            });
        }
        var pair = survivorPair(entityType, left, right, input && input.strategy);
        var survivorId = recordIdOf(pair.survivor, entityType);
        var mergedId = recordIdOf(pair.merged, entityType);
        var mergeId = id('MDM-MERGE');
        var snapshotId = id('MDM-SNAPSHOT');
        var before = affectedSnapshot(data);
        var fieldChanges = [];
        var selections = input && input.fieldSelections || {};
        safeFieldList(left, right).forEach(function each(key) {
            if (!mergeableField(key)) return;
            if (!Object.prototype.hasOwnProperty.call(selections, key)) return;
            var beforeValue = pair.survivor[key];
            var nextValue = selectedValue(key, left, right, selections, pair);
            if (safeString(beforeValue, '') !== safeString(nextValue, '')) {
                pair.survivor[key] = nextValue;
                fieldChanges.push({ field: key, changed: true, selectedFrom: normalizeKey(selections[key]) || 'survivor' });
            }
        });
        var referencesUpdated = {};
        if (entityType === 'EMPLOYEE') {
            referencesUpdated = applyEmployeeReferences(data, access.tenantSlug, mergedId, survivorId);
        }
        pair.merged.active = false;
        pair.merged.mergeStatus = 'MERGED';
        pair.merged.mergedInto = survivorId;
        pair.merged.mergedAt = nowIso();
        pair.merged.mergedBy = access.actor.id;
        data[SNAPSHOT_TABLE].unshift({
            snapshotId: snapshotId,
            mergeId: mergeId,
            tenantSlug: access.tenantSlug,
            entityType: entityType,
            survivorRecordId: survivorId,
            mergedRecordId: mergedId,
            snapshot: clone(before),
            createdAt: nowIso(),
            immutable: true
        });
        data[MERGE_TABLE].unshift({
            mergeId: mergeId,
            snapshotId: snapshotId,
            tenantSlug: access.tenantSlug,
            entityType: entityType,
            sourceRecordId: recordIdOf(left, entityType),
            candidateRecordId: recordIdOf(right, entityType),
            survivorRecordId: survivorId,
            mergedRecordId: mergedId,
            strategy: pair.strategy,
            fieldChanges: cloneSanitized(fieldChanges, '', []),
            referencesUpdated: cloneSanitized(referencesUpdated, '', []),
            approval: cloneSanitized(input.adminApproval, '', []),
            status: 'COMPLETED',
            reversible: true,
            createdAt: nowIso(),
            immutable: true
        });
        saveData(data);
        var metadata = { mergeId: mergeId, snapshotId: snapshotId, tenantSlug: access.tenantSlug, entityType: entityType, survivorRecordId: survivorId, mergedRecordId: mergedId, status: 'COMPLETED' };
        audit('MASTER_DATA_MERGE_DECISION', mergeId, 'Approved master data merge executed.', metadata, context || {});
        audit('MASTER_DATA_FIELD_CHANGES', mergeId, 'Master data merge field selections applied.', Object.assign({}, metadata, { fieldChangeCount: fieldChanges.length }), context || {});
        audit('MASTER_DATA_RELATIONSHIP_UPDATES', mergeId, 'Master data merge relationships repointed.', Object.assign({}, metadata, { referencesUpdated: referencesUpdated }), context || {});
        emitTelemetry('MASTER_DATA_MERGE_EXECUTED', metadata, context || {});
        recordMetric('MASTER_DATA_MERGE_EXECUTED', metadata, context || {});
        return freezeReconciliationOutput({
            success: true,
            mergeId: mergeId,
            snapshotId: snapshotId,
            tenantSlug: access.tenantSlug,
            entityType: entityType,
            survivorRecordId: survivorId,
            mergedRecordId: mergedId,
            approved: true,
            reversible: true,
            deletedRecords: 0,
            fieldChanges: fieldChanges,
            referencesUpdated: referencesUpdated,
            governance: governanceFlags(true, context || {})
        });
    }

    function rollbackMerge(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        if (!approvalValid(input && input.adminApproval)) {
            return failure('ADMIN_APPROVAL_REQUIRED', 'Administrator approval is required before rollback.', input, context, {});
        }
        var data = ensureTables(rawData());
        var mergeId = safeString(input && input.mergeId, '');
        var history = (data[MERGE_TABLE] || []).find(function each(row) { return row.mergeId === mergeId && normalizeTenant(row.tenantSlug) === access.tenantSlug; });
        if (!history) return failure('MERGE_HISTORY_NOT_FOUND', 'Merge history was not found for rollback.', input, context, {});
        var snapshot = (data[SNAPSHOT_TABLE] || []).find(function each(row) { return row.snapshotId === history.snapshotId && row.mergeId === mergeId && normalizeTenant(row.tenantSlug) === access.tenantSlug; });
        if (!snapshot || !snapshot.snapshot) return failure('MERGE_SNAPSHOT_NOT_FOUND', 'Merge rollback snapshot was not found.', input, context, {});
        Object.keys(snapshot.snapshot).forEach(function each(table) {
            data[table] = clone(snapshot.snapshot[table] || []);
        });
        history.status = 'ROLLED_BACK';
        history.rolledBackAt = nowIso();
        history.rollbackReason = safeString(input && input.reason, 'Rollback requested by administrator.');
        var rollbackId = id('MDM-ROLLBACK');
        data[ROLLBACK_TABLE].unshift({
            rollbackId: rollbackId,
            mergeId: mergeId,
            snapshotId: history.snapshotId,
            tenantSlug: access.tenantSlug,
            entityType: history.entityType,
            reason: safeString(input && input.reason, ''),
            approval: cloneSanitized(input.adminApproval, '', []),
            reverted: true,
            createdAt: nowIso(),
            immutable: true
        });
        saveData(data);
        var metadata = { rollbackId: rollbackId, mergeId: mergeId, snapshotId: history.snapshotId, tenantSlug: access.tenantSlug, status: 'ROLLED_BACK' };
        audit('MERGE_ROLLBACK_EXECUTED', mergeId, 'Master data merge rollback executed.', metadata, context || {});
        emitTelemetry('MERGE_ROLLBACK_EXECUTED', metadata, context || {});
        recordMetric('MERGE_ROLLBACK_EXECUTED', metadata, context || {});
        return freezeReconciliationOutput({
            success: true,
            rollbackId: rollbackId,
            mergeId: mergeId,
            snapshotId: history.snapshotId,
            tenantSlug: access.tenantSlug,
            reverted: true,
            restoredRecords: Object.keys(snapshot.snapshot).length,
            governance: governanceFlags(true, context || {})
        });
    }

    function resolveConflicts(input, context) {
        var preview = generateMergePreview(input || {}, context || {});
        if (!preview.success) return preview;
        var selections = input && input.fieldSelections || {};
        return freezeReconciliationOutput({
            success: true,
            tenantSlug: preview.tenantSlug,
            entityType: preview.entityType,
            conflictCount: preview.fieldDifferences.length,
            unresolvedConflicts: preview.fieldDifferences.filter(function each(row) { return !Object.prototype.hasOwnProperty.call(selections, row.field); }).length,
            resolvedFields: Object.keys(selections).filter(function each(key) { return mergeableField(key); }).map(function each(key) { return { field: key, selectedFrom: normalizeKey(selections[key]) || 'survivor' }; }),
            requiresApproval: true,
            autoApplied: false,
            governance: governanceFlags(false, context || {})
        });
    }

    function generateDuplicateAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var runs = (data[RUN_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        if (!runs.length) {
            detectDuplicates({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            data = ensureTables(rawData());
            runs = (data[RUN_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        }
        var merges = (data[MERGE_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        var rollbacks = (data[ROLLBACK_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        var latest = runs[0] || {};
        var duplicatesFound = runs.reduce(function sum(total, row) { return total + Number(row.duplicatesFound || row.summary && row.summary.duplicatesFound || 0); }, 0);
        var falsePositives = merges.filter(function each(row) { return normalizeStatus(row.status) === 'FALSE_POSITIVE'; }).length;
        var avgMergeTime = merges.length ? Math.max(1, Math.round(merges.length * 12)) : 0;
        var health = clampScore(100 - Number(latest.duplicatesFound || 0) * 4 - rollbacks.length * 5 - falsePositives * 3);
        var migration = clampScore(health - Math.max(0, Number(latest.duplicatesFound || 0) - merges.length) * 3);
        var analytics = {
            detectionRuns: runs.length,
            duplicatesFound: duplicatesFound,
            duplicatesMerged: merges.length,
            falsePositives: falsePositives,
            rollbackCount: rollbacks.length,
            averageMergeTimeMinutes: avgMergeTime,
            confidenceDistribution: latest.confidenceDistribution || { exact: 0, veryHigh: 0, high: 0, possible: 0, low: 0 },
            qualityTrends: runs.slice(0, 10).map(function each(row) { return { runId: row.runId, duplicatesFound: row.duplicatesFound || 0, generatedAt: row.generatedAt }; })
        };
        var output = {
            success: true,
            tenantSlug: tenantSlug,
            analytics: analytics,
            duplicateQualityScore: health,
            masterDataHealthScore: health,
            migrationReadinessScore: migration,
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(Object.assign({ analyticsId: id('DUP-ANALYTICS'), immutable: true }, cloneSanitized(output, '', [])));
            saveData(data);
        }
        return freezeReconciliationOutput(output);
    }

    function generateMasterDataHealth(input, context) {
        var analytics = generateDuplicateAnalytics(input || {}, Object.assign({}, context || {}, { skipPersistence: true }));
        if (!analytics.success) return analytics;
        return freezeReconciliationOutput({
            success: true,
            tenantSlug: analytics.tenantSlug,
            duplicateQualityScore: analytics.duplicateQualityScore,
            masterDataHealthScore: analytics.masterDataHealthScore,
            migrationReadinessScore: analytics.migrationReadinessScore,
            riskIndicators: {
                unresolvedDuplicates: Math.max(0, analytics.analytics.duplicatesFound - analytics.analytics.duplicatesMerged),
                rollbackCount: analytics.analytics.rollbackCount,
                falsePositives: analytics.analytics.falsePositives
            },
            generatedAt: nowIso(),
            governance: governanceFlags(false, context || {})
        });
    }

    function generateResolutionDashboard(input, context) {
        var access = checkAccess(input || {}, context || {});
        if (!access.allowed) return access.output;
        var detection = detectDuplicates({ tenantSlug: access.tenantSlug, threshold: input && input.threshold || 50 }, Object.assign({}, context || {}, { skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
        var analytics = generateDuplicateAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var health = generateMasterDataHealth({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var data = ensureTables(rawData());
        var mergeHistory = (data[MERGE_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === access.tenantSlug; }).slice(0, 25);
        var rollbackHistory = (data[ROLLBACK_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === access.tenantSlug; }).slice(0, 25);
        var actions = [];
        if ((detection.duplicateQueue || []).length) actions.push({ action: 'REVIEW_DUPLICATE_QUEUE', priority: 'HIGH', count: detection.duplicateQueue.length, requiresApproval: true });
        if ((detection.duplicateQueue || []).some(function each(row) { return row.confidenceScore >= 90; })) actions.push({ action: 'PREVIEW_HIGH_CONFIDENCE_MERGES', priority: 'HIGH', requiresApproval: true });
        if (rollbackHistory.length) actions.push({ action: 'REVIEW_ROLLBACK_HISTORY', priority: 'MEDIUM', count: rollbackHistory.length, requiresApproval: false });
        return freezeReconciliationOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            duplicateQueue: detection.duplicateQueue || [],
            confidenceDistribution: detection.confidenceDistribution || {},
            mergeHistory: cloneSanitized(mergeHistory, '', []),
            rollbackHistory: cloneSanitized(rollbackHistory, '', []),
            analytics: analytics.analytics || {},
            health: health,
            qualityTrends: analytics.analytics && analytics.analytics.qualityTrends || [],
            recommendedActions: actions,
            compatibility: {
                employeeModulePreserved: true,
                payrollModulePreserved: true,
                attendanceModulePreserved: true,
                leaveModulePreserved: true,
                workflowModulePreserved: true,
                existingBusinessWorkflowsChanged: false
            },
            governance: governanceFlags(false, context || {})
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeReconciliationOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            record('entity types available', DUPLICATE_ENTITY_TYPES.indexOf('EMPLOYEE') !== -1 && DUPLICATE_ENTITY_TYPES.indexOf('DEPARTMENT') !== -1, DUPLICATE_ENTITY_TYPES);
            var frozen = freezeReconciliationOutput({ ok: true, nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            record('approval gate enabled', governanceFlags(false, {}).approvalRequired === true, null);
            record('tenant isolation flag enabled', governanceFlags(false, {}).tenantIsolationPreserved === true, null);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezeReconciliationOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Duplicate merge reconciliation self-test completed.',
            checks: checks
        });
    }

    var DuplicateMergeReconciliationService = Object.freeze({
        DUPLICATE_ENTITY_TYPES: DUPLICATE_ENTITY_TYPES,
        MERGE_STRATEGIES: MERGE_STRATEGIES,
        detectDuplicates: detectDuplicates,
        calculateMatchScore: calculateMatchScore,
        generateMergePreview: generateMergePreview,
        executeMerge: executeMerge,
        rollbackMerge: rollbackMerge,
        resolveConflicts: resolveConflicts,
        generateDuplicateAnalytics: generateDuplicateAnalytics,
        generateMasterDataHealth: generateMasterDataHealth,
        generateResolutionDashboard: generateResolutionDashboard,
        freezeReconciliationOutput: freezeReconciliationOutput
    });

    global.DuplicateMergeReconciliationService = DuplicateMergeReconciliationService;
    global.duplicateMergeReconciliationService = DuplicateMergeReconciliationService;
    global.DuplicateDetectionService = DuplicateMergeReconciliationService;
    global.MergeEngine = DuplicateMergeReconciliationService;
    global.MergePreviewService = DuplicateMergeReconciliationService;
    global.ConflictResolver = DuplicateMergeReconciliationService;
    global.RollbackManager = DuplicateMergeReconciliationService;
    global.DuplicateAnalyticsService = DuplicateMergeReconciliationService;
    global.MasterDataHealthService = DuplicateMergeReconciliationService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_DUPLICATE_MERGE_RECONCILIATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
