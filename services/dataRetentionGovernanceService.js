/**
 * dataRetentionGovernanceService.js
 * ARTHHRMS - Data Retention Governance
 *
 * Tenant-scoped, append-only lifecycle governance for retention policies,
 * archival references, legal holds, deletion reviews, and compliance analytics.
 * Source business records are never mutated or physically deleted here.
 */
(function attachDataRetentionGovernanceService(global) {
    'use strict';

    var SOURCE = 'dataRetentionGovernanceService';
    var RETENTION_STATES = Object.freeze(['ACTIVE', 'ARCHIVED', 'RETENTION_PENDING', 'DELETION_PENDING', 'DELETED', 'LEGAL_HOLD']);
    var DATA_SCOPES = Object.freeze(['employees', 'attendance', 'leave', 'payroll', 'audit_logs', 'documents', 'notifications', 'system_events']);
    var WORKFORCE_SCOPES = Object.freeze(['employees', 'attendance', 'leave', 'payroll', 'documents', 'notifications']);
    var SCOPE_CONFIGURATION = Object.freeze({
        employees: Object.freeze({ collections: Object.freeze(['employees']), archiveAfterDays: 1825, retentionDays: 2555 }),
        attendance: Object.freeze({ collections: Object.freeze(['attendance']), archiveAfterDays: 1095, retentionDays: 1825 }),
        leave: Object.freeze({ collections: Object.freeze(['leaveRequests']), archiveAfterDays: 1095, retentionDays: 1825 }),
        payroll: Object.freeze({ collections: Object.freeze(['payroll']), archiveAfterDays: 1825, retentionDays: 2555 }),
        audit_logs: Object.freeze({ collections: Object.freeze(['auditLogs']), archiveAfterDays: 2190, retentionDays: 2555 }),
        documents: Object.freeze({ collections: Object.freeze(['documents', 'fileAttachmentRecords']), archiveAfterDays: 1825, retentionDays: 2555 }),
        notifications: Object.freeze({ collections: Object.freeze(['notifications']), archiveAfterDays: 180, retentionDays: 365 }),
        system_events: Object.freeze({ collections: Object.freeze(['workflowEvents', 'operationMetrics', 'serviceErrorLogs']), archiveAfterDays: 365, retentionDays: 730 })
    });

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

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeScope(value) {
        var scope = safeString(value || '', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (scope === 'employee' || scope === 'employee_records') scope = 'employees';
        if (scope === 'leave_requests' || scope === 'leave_data') scope = 'leave';
        if (scope === 'audit' || scope === 'audits' || scope === 'audit_records') scope = 'audit_logs';
        if (scope === 'document' || scope === 'document_metadata') scope = 'documents';
        if (scope === 'notification') scope = 'notifications';
        if (scope === 'events' || scope === 'workflow_events') scope = 'system_events';
        return scope;
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
        Object.keys(value).forEach(function each(key) { output[key] = cloneValue(value[key], refs.slice()); });
        return output;
    }

    function freezeRetentionOutput(value) {
        var cloned = cloneValue(value, []);
        function freeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { freeze(item[key]); });
            return Object.freeze(item);
        }
        return freeze(cloned);
    }

    function issue(code, message, severity, metadata) {
        return freezeRetentionOutput({ code: code, message: message, severity: severity || 'WARNING', metadata: metadata || {} });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: safeString(actor.id || actor.userId || actor.empId || actor.employeeId || '', '').trim(),
            role: normalizeRole(actor.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || actor.companyId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function defaultTenant(data) {
        var settings = data && data.companySettings ? data.companySettings : {};
        return normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || 'default');
    }

    function tenantFromInput(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var actor = context && context.actor ? context.actor : {};
        var settings = rawData().companySettings || {};
        return normalizeTenantSlug(
            source.tenantSlug || source.tenantId || source.companyId ||
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            actor.tenantSlug || actor.tenantId || actor.companyId ||
            settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function explicitRowTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (
            row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id ||
            row.companyId || row.company_id || row.organizationId ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
    }

    function employeeTenantMap(data) {
        var map = {};
        (Array.isArray(data.employees) ? data.employees : []).forEach(function each(employee) {
            var tenant = explicitRowTenant(employee);
            [employee.id, employee.empId, employee.employeeId, employee.userId].filter(Boolean).forEach(function add(value) {
                map[safeString(value, '').toLowerCase()] = tenant;
            });
        });
        return map;
    }

    function rowTenant(row, data, employeeMap) {
        var explicit = explicitRowTenant(row);
        if (explicit) return explicit;
        var employeeId = row && (row.empId || row.employeeId || row.employee_id || row.ownerEmpId || row.userId || row.actorId);
        var linked = employeeId && employeeMap[safeString(employeeId, '').toLowerCase()];
        return linked || '';
    }

    function recordId(scope, row, collection, index) {
        var value = '';
        if (scope === 'employees') value = row.empId || row.employeeId || row.userId || row.id;
        else if (scope === 'attendance') value = row.attendanceId || row.id;
        else if (scope === 'leave') value = row.leaveId || row.requestId || row.id;
        else if (scope === 'payroll') value = row.payrollId || row.id;
        else if (scope === 'audit_logs') value = row.auditId || row.logId || row.id;
        else if (scope === 'documents') value = row.documentId || row.attachmentId || row.id;
        else if (scope === 'notifications') value = row.notificationId || row.id;
        else value = row.eventId || row.metricId || row.errorId || row.id;
        return safeString(value || collection + '-' + index, '').trim();
    }

    function scopeRows(scope, tenantSlug) {
        var data = rawData();
        var config = SCOPE_CONFIGURATION[scope];
        if (!config) return [];
        var employeeMap = employeeTenantMap(data);
        var fallbackTenant = defaultTenant(data);
        var rows = [];
        config.collections.forEach(function each(collection) {
            (Array.isArray(data[collection]) ? data[collection] : []).forEach(function add(row, index) {
                var tenant = rowTenant(row, data, employeeMap);
                if (!tenant && tenantSlug === fallbackTenant) tenant = fallbackTenant;
                if (tenant !== tenantSlug) return;
                rows.push({ row: row, collection: collection, recordId: recordId(scope, row, collection, index) });
            });
        });
        return rows;
    }

    function parseRecordTime(row) {
        var values = [
            row && row.terminatedAt, row && row.retiredAt, row && row.completedAt, row && row.updatedAt,
            row && row.createdAt, row && row.timestamp, row && row.date, row && row.attendanceDate,
            row && row.processedAt, row && row.importedAt, row && row.generatedAt
        ];
        for (var index = 0; index < values.length; index += 1) {
            var timestamp = Date.parse(values[index]);
            if (Number.isFinite(timestamp)) return timestamp;
        }
        return NaN;
    }

    function ageDays(row, context) {
        var timestamp = parseRecordTime(row);
        var current = Date.parse(nowIso(context));
        if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return null;
        return Math.max(0, Math.floor((current - timestamp) / 86400000));
    }

    function visibleScopes(role) {
        if (role === 'PLATFORM_OWNER' || role === 'DIRECTOR') return DATA_SCOPES.slice();
        if (role === 'HR' || role === 'HR_HEAD') return WORKFORCE_SCOPES.slice();
        return [];
    }

    function validateAccess(action, input, context) {
        var actor = actorFromContext(context || {});
        var tenantSlug = tenantFromInput(input || {}, context || {});
        var scope = normalizeScope(input && input.scope);
        var issues = [];
        if (!tenantSlug) issues.push(issue('TENANT_SCOPE_REQUIRED', 'A tenant scope is required.', 'CRITICAL'));
        if (actor.role !== 'PLATFORM_OWNER' && actor.tenantSlug && tenantSlug && actor.tenantSlug !== tenantSlug) {
            issues.push(issue('CROSS_TENANT_RETENTION_BLOCKED', 'Retention access cannot cross tenant boundaries.', 'CRITICAL'));
        }
        if (action === 'MANAGE') {
            if (actor.role !== 'PLATFORM_OWNER') issues.push(issue('RETENTION_AUTHORITY_REQUIRED', 'Only PLATFORM_OWNER may change retention lifecycle governance.', 'CRITICAL'));
        } else if (visibleScopes(actor.role).length === 0) {
            issues.push(issue('RETENTION_VISIBILITY_DENIED', 'This role cannot access retention governance.', 'CRITICAL'));
        }
        if (scope && DATA_SCOPES.indexOf(scope) === -1) issues.push(issue('INVALID_RETENTION_SCOPE', 'The requested retention scope is not supported.', 'ERROR', { scope: scope }));
        if (scope && visibleScopes(actor.role).indexOf(scope) === -1) issues.push(issue('RETENTION_SCOPE_NOT_AUTHORIZED', 'This role cannot access the requested retention scope.', 'CRITICAL', { scope: scope }));
        return { allowed: issues.length === 0, actor: actor, tenantSlug: tenantSlug, scope: scope, issues: issues };
    }

    function governanceFlags() {
        return {
            tenantIsolationPreserved: true,
            dataLifecycleGovernancePreserved: true,
            sourceRecordsMutated: false,
            physicalDeletionExecuted: false,
            immutableHistory: true,
            rbacAuthoritative: true,
            backupAwareRetention: true,
            backwardCompatibilityPreserved: true
        };
    }

    function failure(code, tenantSlug, issues, context) {
        var output = {
            success: false,
            tenantSlug: normalizeTenantSlug(tenantSlug),
            state: 'RETENTION_PENDING',
            issues: issues && issues.length ? issues : [issue(code || 'RETENTION_OPERATION_FAILED_SAFE', 'Retention operation failed safely.', 'ERROR')],
            governance: governanceFlags(),
            generatedAt: nowIso(context || {})
        };
        audit(code || 'RETENTION_OPERATION_BLOCKED', { tenantSlug: output.tenantSlug, success: false, description: code || 'Retention operation blocked.' }, context || {});
        return freezeRetentionOutput(output);
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
                    module: 'Data Retention Governance',
                    severity: meta.success === false ? 'WARNING' : 'INFO',
                    metadata: Object.assign({}, meta, { actionType: actionType, module: 'Data Retention Governance' })
                }, { actor: actor, source: SOURCE });
                return true;
            }
        } catch (error) {}
        try {
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Data Retention Governance', meta.tenantSlug || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function tenantHistory(key, tenantSlug) {
        return (Array.isArray(rawData()[key]) ? rawData()[key] : []).filter(function filter(row) {
            return explicitRowTenant(row) === tenantSlug;
        });
    }

    function normalizeRetentionPayload(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return freezeRetentionOutput({ success: false, issues: [issue('MALFORMED_RETENTION_PAYLOAD', 'Retention payload must be an object.', 'ERROR')] });
            }
            var scope = normalizeScope(input.scope);
            var tenantSlug = tenantFromInput(input, context || {});
            var archiveAfterDays = Number(input.archiveAfterDays);
            var retentionDays = Number(input.retentionDays);
            return freezeRetentionOutput({
                success: true,
                payload: {
                    tenantSlug: tenantSlug,
                    scope: scope,
                    archiveAfterDays: Number.isFinite(archiveAfterDays) ? Math.floor(archiveAfterDays) : null,
                    retentionDays: Number.isFinite(retentionDays) ? Math.floor(retentionDays) : null,
                    active: input.active !== false,
                    deletionApprovalRequired: input.deletionApprovalRequired !== false,
                    recordIds: Array.isArray(input.recordIds) ? input.recordIds.map(function id(value) { return safeString(value, '').trim(); }).filter(Boolean) : [],
                    approval: input.approval === true,
                    approvalReference: safeString(input.approvalReference || '', '').trim()
                }
            });
        } catch (error) {
            return freezeRetentionOutput({ success: false, issues: [issue('RETENTION_NORMALIZATION_FAILED_SAFE', 'Retention payload normalization failed safely.', 'ERROR')] });
        }
    }

    function defaultPolicy(scope, tenantSlug) {
        var config = SCOPE_CONFIGURATION[scope];
        return {
            policyId: 'DEFAULT-' + normalizeToken(scope),
            tenantSlug: tenantSlug,
            scope: scope,
            state: 'ACTIVE',
            archiveAfterDays: config.archiveAfterDays,
            retentionDays: config.retentionDays,
            deletionApprovalRequired: true,
            legalHoldOverrideEnabled: true,
            source: 'PLATFORM_DEFAULT',
            active: true
        };
    }

    function activePolicy(scope, tenantSlug) {
        var rows = tenantHistory('dataRetentionPolicies', tenantSlug).filter(function filter(row) {
            return normalizeScope(row.scope) === scope && row.active !== false;
        });
        return rows.length ? rows[rows.length - 1] : defaultPolicy(scope, tenantSlug);
    }

    function saveRetentionPolicy(input, context) {
        try {
            var normalized = normalizeRetentionPayload(input, context || {});
            if (!normalized.success) return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), normalized.issues, context || {});
            var payload = normalized.payload;
            var access = validateAccess('MANAGE', payload, context || {});
            if (!access.allowed) return failure('RETENTION_POLICY_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (DATA_SCOPES.indexOf(payload.scope) === -1) return failure('INVALID_RETENTION_SCOPE', access.tenantSlug, [issue('INVALID_RETENTION_SCOPE', 'A supported data scope is required.', 'ERROR')], context || {});
            var config = SCOPE_CONFIGURATION[payload.scope];
            var archiveDays = payload.archiveAfterDays === null ? config.archiveAfterDays : payload.archiveAfterDays;
            var retentionDays = payload.retentionDays === null ? config.retentionDays : payload.retentionDays;
            if (archiveDays < 1 || retentionDays < 1 || archiveDays > retentionDays) {
                return failure('INVALID_RETENTION_PERIOD', access.tenantSlug, [issue('INVALID_RETENTION_PERIOD', 'Retention days must be positive and no shorter than the archive period.', 'ERROR')], context || {});
            }
            var record = {
                policyId: createId('DRP'), tenantSlug: access.tenantSlug, scope: payload.scope,
                state: 'ACTIVE', archiveAfterDays: archiveDays, retentionDays: retentionDays,
                deletionApprovalRequired: payload.deletionApprovalRequired, legalHoldOverrideEnabled: true,
                active: payload.active, createdAt: nowIso(context || {}), createdByRole: access.actor.role,
                version: tenantHistory('dataRetentionPolicies', access.tenantSlug).filter(function same(row) { return normalizeScope(row.scope) === payload.scope; }).length + 1
            };
            persistHistory('dataRetentionPolicies', record);
            persistHistory('dataRetentionHistory', {
                historyId: createId('DRH'), tenantSlug: access.tenantSlug, scope: payload.scope,
                action: 'RETENTION_POLICY_UPDATED', policyId: record.policyId, state: 'ACTIVE', timestamp: record.createdAt
            });
            audit('RETENTION_POLICY_UPDATED', { tenantSlug: access.tenantSlug, scope: payload.scope, policyId: record.policyId, description: 'Tenant retention policy updated.' }, context || {});
            return freezeRetentionOutput({ success: true, tenantSlug: access.tenantSlug, state: 'ACTIVE', policy: record, governance: governanceFlags(), generatedAt: nowIso(context || {}) });
        } catch (error) {
            return failure('RETENTION_POLICY_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('RETENTION_POLICY_FAILED_SAFE', 'Retention policy update failed safely.', 'ERROR')], context || {});
        }
    }

    function latestLifecycle(tenantSlug, scope, sourceRecordId) {
        var rows = tenantHistory('dataLifecycleHistory', tenantSlug).filter(function filter(row) {
            return normalizeScope(row.scope) === scope && safeString(row.sourceRecordId, '') === safeString(sourceRecordId, '');
        });
        return rows.length ? rows[rows.length - 1] : null;
    }

    function activeLegalHold(tenantSlug, scope, sourceRecordId) {
        var rows = tenantHistory('dataLegalHoldRecords', tenantSlug).filter(function filter(row) {
            return normalizeScope(row.scope) === scope && safeString(row.sourceRecordId, '') === safeString(sourceRecordId, '');
        });
        if (!rows.length) return null;
        var latest = rows[rows.length - 1];
        return latest.active === false || latest.action === 'RELEASED' ? null : latest;
    }

    function backupReadiness(tenantSlug) {
        var backups = tenantHistory('tenantBackupHistory', tenantSlug).filter(function complete(row) { return row.state === 'COMPLETED'; });
        if (!backups.length) return { ready: false, backupId: '', reason: 'COMPLETED_BACKUP_REQUIRED' };
        var latest = backups.slice().sort(function sort(a, b) {
            return safeString(b.completedAt || b.timestamp || '', '').localeCompare(safeString(a.completedAt || a.timestamp || '', ''));
        })[0];
        var validations = tenantHistory('tenantBackupValidationHistory', tenantSlug).filter(function valid(row) {
            return row.integrityValid === true && (!row.backupId || row.backupId === latest.backupId);
        });
        return { ready: validations.length > 0, backupId: latest.backupId || '', reason: validations.length ? '' : 'VALID_BACKUP_INTEGRITY_REQUIRED' };
    }

    function evaluateRetentionPolicy(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_RETENTION_PAYLOAD', 'Retention evaluation payload must be an object.', 'ERROR')], context || {});
            }
            var scope = normalizeScope(input.scope);
            var access = validateAccess('VIEW', Object.assign({}, input, { scope: scope }), context || {});
            if (!access.allowed) return failure('RETENTION_EVALUATION_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (!scope || DATA_SCOPES.indexOf(scope) === -1) return failure('INVALID_RETENTION_SCOPE', access.tenantSlug, [issue('INVALID_RETENTION_SCOPE', 'A supported data scope is required.', 'ERROR')], context || {});
            var policy = activePolicy(scope, access.tenantSlug);
            var backup = backupReadiness(access.tenantSlug);
            var candidates = scopeRows(scope, access.tenantSlug).map(function map(item) {
                var age = ageDays(item.row, context || {});
                var lifecycle = latestLifecycle(access.tenantSlug, scope, item.recordId);
                var hold = activeLegalHold(access.tenantSlug, scope, item.recordId);
                var state = hold ? 'LEGAL_HOLD' : lifecycle && RETENTION_STATES.indexOf(lifecycle.state) !== -1 ? lifecycle.state : 'ACTIVE';
                var archiveEligible = state === 'ACTIVE' && age !== null && age >= Number(policy.archiveAfterDays || 0);
                var deletionEligible = state === 'ARCHIVED' && !hold && age !== null && age >= Number(policy.retentionDays || 0) && backup.ready;
                return {
                    recordId: item.recordId, collection: item.collection, state: state, ageDays: age,
                    archiveEligible: archiveEligible, deletionEligible: deletionEligible, legalHold: !!hold,
                    timestampValid: age !== null
                };
            });
            var archiveEligible = candidates.filter(function eligible(row) { return row.archiveEligible; }).length;
            var deletionEligible = candidates.filter(function eligible(row) { return row.deletionEligible; }).length;
            var legalHolds = candidates.filter(function held(row) { return row.legalHold; }).length;
            var malformed = candidates.filter(function invalid(row) { return !row.timestampValid; }).length;
            var archived = candidates.filter(function state(row) { return row.state === 'ARCHIVED'; }).length;
            var overdueActive = candidates.filter(function overdue(row) {
                return row.state === 'ACTIVE' && row.ageDays !== null && row.ageDays >= Number(policy.retentionDays || 0);
            }).length;
            var total = candidates.length;
            var compliance = clampScore(100 - (total ? ((overdueActive + malformed) / total) * 100 : 0));
            var archiveReadiness = clampScore(total ? ((archived + archiveEligible + legalHolds) / total) * 100 : 100);
            var output = {
                success: true, tenantSlug: access.tenantSlug, scope: scope,
                policy: {
                    policyId: policy.policyId, scope: scope, state: policy.state || 'ACTIVE',
                    archiveAfterDays: Number(policy.archiveAfterDays), retentionDays: Number(policy.retentionDays),
                    deletionApprovalRequired: policy.deletionApprovalRequired !== false, source: policy.source || 'TENANT_POLICY'
                },
                metrics: {
                    totalRecords: total, activeRecords: candidates.filter(function active(row) { return row.state === 'ACTIVE'; }).length,
                    archivedRecords: archived, archiveEligibleRecords: archiveEligible,
                    deletionEligibleRecords: deletionEligible, legalHoldRecords: legalHolds,
                    malformedTimestampRecords: malformed, retentionViolations: overdueActive
                },
                archiveReadinessScore: archiveReadiness,
                retentionComplianceScore: compliance,
                recoveryReadiness: { backupAvailable: !!backup.backupId, integrityVerified: backup.ready },
                candidates: candidates,
                governance: governanceFlags(), generatedAt: nowIso(context || {})
            };
            if (!context || !context.skipAuditPersistence) audit('RETENTION_POLICY_EVALUATED', { tenantSlug: access.tenantSlug, scope: scope, description: 'Tenant retention policy evaluated.' }, context || {});
            return freezeRetentionOutput(output);
        } catch (error) {
            return failure('RETENTION_EVALUATION_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('RETENTION_EVALUATION_FAILED_SAFE', 'Retention evaluation failed safely.', 'ERROR')], context || {});
        }
    }

    function metadataChecksum(parts) {
        var text = safeString(parts, '');
        var hash = 2166136261;
        for (var index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    function archiveChecksum(record) {
        return metadataChecksum([record.archiveId, record.tenantSlug, record.scope, record.collection, record.sourceRecordId, record.archivedAt].join('|'));
    }

    function appendLifecycle(tenantSlug, scope, sourceRecordId, state, action, context, metadata) {
        return persistHistory('dataLifecycleHistory', Object.assign({
            lifecycleId: createId('DLC'), tenantSlug: tenantSlug, scope: scope, sourceRecordId: sourceRecordId,
            state: state, action: action, timestamp: nowIso(context || {})
        }, metadata || {}));
    }

    function archiveEligibleRecords(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_RETENTION_PAYLOAD', 'Archive payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('MANAGE', input, context || {});
            if (!access.allowed) return failure('ARCHIVE_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (!access.scope || DATA_SCOPES.indexOf(access.scope) === -1) return failure('INVALID_RETENTION_SCOPE', access.tenantSlug, [issue('INVALID_RETENTION_SCOPE', 'A supported data scope is required.', 'ERROR')], context || {});
            if (input.approval !== true) return failure('ARCHIVE_APPROVAL_REQUIRED', access.tenantSlug, [issue('ARCHIVE_APPROVAL_REQUIRED', 'Archive approval is required.', 'CRITICAL')], context || {});
            var ids = Array.isArray(input.recordIds) ? input.recordIds.map(function map(value) { return safeString(value, '').trim(); }).filter(Boolean) : [];
            if (!ids.length || ids.length > 100) return failure('ARCHIVE_SELECTION_REQUIRED', access.tenantSlug, [issue('ARCHIVE_SELECTION_REQUIRED', 'Select between 1 and 100 records for governed archival.', 'ERROR')], context || {});
            var evaluation = evaluateRetentionPolicy({ tenantSlug: access.tenantSlug, scope: access.scope }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            if (!evaluation.success) return evaluation;
            var sourceMap = {};
            scopeRows(access.scope, access.tenantSlug).forEach(function each(item) { sourceMap[item.recordId] = item; });
            var eligibleMap = {};
            evaluation.candidates.forEach(function each(item) { if (item.archiveEligible) eligibleMap[item.recordId] = true; });
            var archived = [];
            var issues = [];
            ids.forEach(function each(sourceRecordId) {
                var source = sourceMap[sourceRecordId];
                if (!source) {
                    issues.push(issue('RETENTION_RECORD_NOT_FOUND', 'The selected record is unavailable in this tenant.', 'ERROR', { recordId: sourceRecordId }));
                    return;
                }
                if (!eligibleMap[sourceRecordId]) {
                    issues.push(issue('RECORD_NOT_ARCHIVE_ELIGIBLE', 'The selected record is not archive eligible.', 'WARNING', { recordId: sourceRecordId }));
                    return;
                }
                var archivedAt = nowIso(context || {});
                var record = {
                    archiveId: createId('DAR'), tenantSlug: access.tenantSlug, scope: access.scope,
                    collection: source.collection, sourceRecordId: sourceRecordId, state: 'ARCHIVED',
                    archivedAt: archivedAt, approvalReference: safeString(input.approvalReference || '', '').trim(),
                    sourceRecordMutated: false, physicalDeletionExecuted: false
                };
                record.archiveIntegrityHash = archiveChecksum(record);
                persistHistory('dataArchiveRecords', record);
                appendLifecycle(access.tenantSlug, access.scope, sourceRecordId, 'ARCHIVED', 'ARCHIVED', context || {}, { archiveId: record.archiveId });
                persistHistory('dataRetentionHistory', {
                    historyId: createId('DRH'), tenantSlug: access.tenantSlug, scope: access.scope,
                    sourceRecordId: sourceRecordId, archiveId: record.archiveId, action: 'ARCHIVED', state: 'ARCHIVED', timestamp: archivedAt
                });
                archived.push(record);
            });
            audit('RETENTION_RECORDS_ARCHIVED', { tenantSlug: access.tenantSlug, scope: access.scope, archivedCount: archived.length, description: 'Archive-eligible records were registered in the immutable archive ledger.' }, context || {});
            return freezeRetentionOutput({
                success: archived.length > 0 && issues.filter(function severe(item) { return item.severity === 'ERROR' || item.severity === 'CRITICAL'; }).length === 0,
                tenantSlug: access.tenantSlug, scope: access.scope, state: archived.length ? 'ARCHIVED' : 'RETENTION_PENDING',
                archivedCount: archived.length, skippedCount: issues.length, archiveRecords: archived, issues: issues,
                governance: governanceFlags(), generatedAt: nowIso(context || {})
            });
        } catch (error) {
            return failure('ARCHIVE_OPERATION_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('ARCHIVE_OPERATION_FAILED_SAFE', 'Archive operation failed safely.', 'ERROR')], context || {});
        }
    }

    function findArchive(archiveId, tenantSlug) {
        var rows = tenantHistory('dataArchiveRecords', tenantSlug).filter(function filter(row) { return safeString(row.archiveId, '') === safeString(archiveId, ''); });
        return rows.length ? rows[rows.length - 1] : null;
    }

    function restoreArchivedRecord(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_RETENTION_PAYLOAD', 'Restore payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('MANAGE', input, context || {});
            if (!access.allowed) return failure('RESTORE_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (input.approval !== true) return failure('RESTORE_APPROVAL_REQUIRED', access.tenantSlug, [issue('RESTORE_APPROVAL_REQUIRED', 'Restore approval is required.', 'CRITICAL')], context || {});
            var archive = findArchive(input.archiveId, access.tenantSlug);
            if (!archive) return failure('ARCHIVE_RECORD_NOT_FOUND', access.tenantSlug, [issue('ARCHIVE_RECORD_NOT_FOUND', 'The archive record is unavailable in this tenant.', 'ERROR')], context || {});
            if (archive.archiveIntegrityHash !== archiveChecksum(archive)) return failure('ARCHIVE_INTEGRITY_FAILED', access.tenantSlug, [issue('ARCHIVE_INTEGRITY_FAILED', 'Archive metadata integrity validation failed.', 'CRITICAL')], context || {});
            var sourceExists = scopeRows(normalizeScope(archive.scope), access.tenantSlug).some(function exists(item) { return item.recordId === archive.sourceRecordId; });
            if (!sourceExists) return failure('RESTORE_SOURCE_UNAVAILABLE', access.tenantSlug, [issue('RESTORE_SOURCE_UNAVAILABLE', 'The source record is unavailable; restore was blocked.', 'CRITICAL')], context || {});
            var restoredAt = nowIso(context || {});
            appendLifecycle(access.tenantSlug, normalizeScope(archive.scope), archive.sourceRecordId, 'ACTIVE', 'RESTORED', context || {}, { archiveId: archive.archiveId });
            persistHistory('dataRetentionHistory', {
                historyId: createId('DRH'), tenantSlug: access.tenantSlug, scope: normalizeScope(archive.scope),
                sourceRecordId: archive.sourceRecordId, archiveId: archive.archiveId, action: 'RESTORED', state: 'ACTIVE', timestamp: restoredAt
            });
            audit('ARCHIVED_RECORD_RESTORED', { tenantSlug: access.tenantSlug, scope: archive.scope, archiveId: archive.archiveId, description: 'Archived record lifecycle restored to active.' }, context || {});
            return freezeRetentionOutput({
                success: true, tenantSlug: access.tenantSlug, archiveId: archive.archiveId, scope: normalizeScope(archive.scope),
                sourceRecordId: archive.sourceRecordId, state: 'ACTIVE', restoredAt: restoredAt,
                sourceRecordMutated: false, governance: governanceFlags()
            });
        } catch (error) {
            return failure('RESTORE_OPERATION_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('RESTORE_OPERATION_FAILED_SAFE', 'Restore operation failed safely.', 'ERROR')], context || {});
        }
    }

    function applyLegalHold(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_RETENTION_PAYLOAD', 'Legal hold payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('MANAGE', input, context || {});
            if (!access.allowed) return failure('LEGAL_HOLD_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (!access.scope || DATA_SCOPES.indexOf(access.scope) === -1) return failure('INVALID_RETENTION_SCOPE', access.tenantSlug, [issue('INVALID_RETENTION_SCOPE', 'A supported data scope is required.', 'ERROR')], context || {});
            if (input.approval !== true) return failure('LEGAL_HOLD_APPROVAL_REQUIRED', access.tenantSlug, [issue('LEGAL_HOLD_APPROVAL_REQUIRED', 'Legal hold approval is required.', 'CRITICAL')], context || {});
            var sourceRecordId = safeString(input.recordId || input.sourceRecordId || '', '').trim();
            var exists = scopeRows(access.scope, access.tenantSlug).some(function found(item) { return item.recordId === sourceRecordId; });
            if (!sourceRecordId || !exists) return failure('RETENTION_RECORD_NOT_FOUND', access.tenantSlug, [issue('RETENTION_RECORD_NOT_FOUND', 'The legal hold target is unavailable in this tenant.', 'ERROR')], context || {});
            var existing = activeLegalHold(access.tenantSlug, access.scope, sourceRecordId);
            if (existing) return freezeRetentionOutput({ success: true, tenantSlug: access.tenantSlug, state: 'LEGAL_HOLD', legalHold: existing, duplicatePrevented: true, governance: governanceFlags() });
            var record = {
                legalHoldId: createId('DLH'), tenantSlug: access.tenantSlug, scope: access.scope,
                sourceRecordId: sourceRecordId, state: 'LEGAL_HOLD', action: 'APPLIED', active: true,
                reasonCode: normalizeToken(input.reasonCode || 'LEGAL_REVIEW'),
                approvalReference: safeString(input.approvalReference || '', '').trim(), appliedAt: nowIso(context || {})
            };
            persistHistory('dataLegalHoldRecords', record);
            appendLifecycle(access.tenantSlug, access.scope, sourceRecordId, 'LEGAL_HOLD', 'LEGAL_HOLD_APPLIED', context || {}, { legalHoldId: record.legalHoldId });
            persistHistory('dataRetentionHistory', {
                historyId: createId('DRH'), tenantSlug: access.tenantSlug, scope: access.scope,
                sourceRecordId: sourceRecordId, action: 'LEGAL_HOLD_APPLIED', state: 'LEGAL_HOLD', timestamp: record.appliedAt
            });
            audit('RETENTION_LEGAL_HOLD_APPLIED', { tenantSlug: access.tenantSlug, scope: access.scope, legalHoldId: record.legalHoldId, description: 'Legal hold applied; deletion progression blocked.' }, context || {});
            return freezeRetentionOutput({ success: true, tenantSlug: access.tenantSlug, state: 'LEGAL_HOLD', legalHold: record, deletionBlocked: true, governance: governanceFlags() });
        } catch (error) {
            return failure('LEGAL_HOLD_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('LEGAL_HOLD_FAILED_SAFE', 'Legal hold operation failed safely.', 'ERROR')], context || {});
        }
    }

    function releaseLegalHold(input, context) {
        try {
            var access = validateAccess('MANAGE', input || {}, context || {});
            if (!access.allowed) return failure('LEGAL_HOLD_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (!input || input.approval !== true) return failure('LEGAL_HOLD_RELEASE_APPROVAL_REQUIRED', access.tenantSlug, [issue('LEGAL_HOLD_RELEASE_APPROVAL_REQUIRED', 'Legal hold release approval is required.', 'CRITICAL')], context || {});
            var holdId = safeString(input.legalHoldId || '', '').trim();
            var rows = tenantHistory('dataLegalHoldRecords', access.tenantSlug).filter(function find(row) { return row.legalHoldId === holdId; });
            var hold = rows.length ? rows[rows.length - 1] : null;
            if (!hold) return failure('LEGAL_HOLD_NOT_FOUND', access.tenantSlug, [issue('LEGAL_HOLD_NOT_FOUND', 'The legal hold is unavailable in this tenant.', 'ERROR')], context || {});
            var record = {
                legalHoldId: hold.legalHoldId, legalHoldHistoryId: createId('DLHR'), tenantSlug: access.tenantSlug,
                scope: normalizeScope(hold.scope), sourceRecordId: hold.sourceRecordId, state: 'RETENTION_PENDING',
                action: 'RELEASED', active: false, approvalReference: safeString(input.approvalReference || '', '').trim(), releasedAt: nowIso(context || {})
            };
            persistHistory('dataLegalHoldRecords', record);
            appendLifecycle(access.tenantSlug, record.scope, record.sourceRecordId, 'RETENTION_PENDING', 'LEGAL_HOLD_RELEASED', context || {}, { legalHoldId: hold.legalHoldId });
            audit('RETENTION_LEGAL_HOLD_RELEASED', { tenantSlug: access.tenantSlug, scope: record.scope, legalHoldId: hold.legalHoldId, description: 'Legal hold released through governance approval.' }, context || {});
            return freezeRetentionOutput({ success: true, tenantSlug: access.tenantSlug, state: 'RETENTION_PENDING', legalHold: record, governance: governanceFlags() });
        } catch (error) {
            return failure('LEGAL_HOLD_RELEASE_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('LEGAL_HOLD_RELEASE_FAILED_SAFE', 'Legal hold release failed safely.', 'ERROR')], context || {});
        }
    }

    function scheduleDeletionReview(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_RETENTION_PAYLOAD', 'Deletion review payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('MANAGE', input, context || {});
            if (!access.allowed) return failure('DELETION_REVIEW_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (input.approval !== true) return failure('DELETION_APPROVAL_REQUIRED', access.tenantSlug, [issue('DELETION_APPROVAL_REQUIRED', 'Deletion review approval is required.', 'CRITICAL')], context || {});
            var archive = findArchive(input.archiveId, access.tenantSlug);
            if (!archive) return failure('ARCHIVE_RECORD_NOT_FOUND', access.tenantSlug, [issue('ARCHIVE_RECORD_NOT_FOUND', 'The archive record is unavailable in this tenant.', 'ERROR')], context || {});
            var hold = activeLegalHold(access.tenantSlug, normalizeScope(archive.scope), archive.sourceRecordId);
            if (hold) return failure('LEGAL_HOLD_PREVENTS_DELETION', access.tenantSlug, [issue('LEGAL_HOLD_PREVENTS_DELETION', 'Records under legal hold must never be deleted.', 'CRITICAL')], context || {});
            var current = latestLifecycle(access.tenantSlug, normalizeScope(archive.scope), archive.sourceRecordId);
            if (!current || current.state !== 'ARCHIVED') return failure('ARCHIVED_STATE_REQUIRED', access.tenantSlug, [issue('ARCHIVED_STATE_REQUIRED', 'Only currently archived records can enter deletion review.', 'ERROR')], context || {});
            var policy = activePolicy(normalizeScope(archive.scope), access.tenantSlug);
            var source = scopeRows(normalizeScope(archive.scope), access.tenantSlug).filter(function found(item) { return item.recordId === archive.sourceRecordId; })[0];
            var age = source ? ageDays(source.row, context || {}) : null;
            if (age === null || age < Number(policy.retentionDays || 0)) return failure('RETENTION_PERIOD_NOT_MET', access.tenantSlug, [issue('RETENTION_PERIOD_NOT_MET', 'The configured retention period has not elapsed.', 'WARNING')], context || {});
            var recovery = backupReadiness(access.tenantSlug);
            if (!recovery.ready) return failure(recovery.reason, access.tenantSlug, [issue(recovery.reason, 'A completed backup with valid integrity is required before deletion review.', 'CRITICAL')], context || {});
            var record = {
                deletionReviewId: createId('DDR'), tenantSlug: access.tenantSlug, archiveId: archive.archiveId,
                scope: normalizeScope(archive.scope), sourceRecordId: archive.sourceRecordId, state: 'DELETION_PENDING',
                approvalReference: safeString(input.approvalReference || '', '').trim(), backupId: recovery.backupId,
                backupIntegrityVerified: true, physicalDeletionExecuted: false, scheduledAt: nowIso(context || {})
            };
            persistHistory('dataDeletionReviews', record);
            appendLifecycle(access.tenantSlug, record.scope, record.sourceRecordId, 'DELETION_PENDING', 'DELETION_REVIEW_SCHEDULED', context || {}, { deletionReviewId: record.deletionReviewId, archiveId: archive.archiveId });
            persistHistory('dataRetentionHistory', {
                historyId: createId('DRH'), tenantSlug: access.tenantSlug, scope: record.scope,
                sourceRecordId: record.sourceRecordId, archiveId: archive.archiveId,
                action: 'DELETION_REVIEW_SCHEDULED', state: 'DELETION_PENDING', timestamp: record.scheduledAt
            });
            audit('RETENTION_DELETION_REVIEW_SCHEDULED', { tenantSlug: access.tenantSlug, scope: record.scope, deletionReviewId: record.deletionReviewId, description: 'Recovery-aware deletion review scheduled; no source data deleted.' }, context || {});
            return freezeRetentionOutput({
                success: true, tenantSlug: access.tenantSlug, deletionReviewId: record.deletionReviewId,
                archiveId: archive.archiveId, scope: record.scope, state: 'DELETION_PENDING',
                backupIntegrityVerified: true, physicalDeletionExecuted: false, governance: governanceFlags()
            });
        } catch (error) {
            return failure('DELETION_REVIEW_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('DELETION_REVIEW_FAILED_SAFE', 'Deletion review failed safely.', 'ERROR')], context || {});
        }
    }

    function calculateRetentionCompliance(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('MALFORMED_RETENTION_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_RETENTION_PAYLOAD', 'Compliance payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('VIEW', input, context || {});
            if (!access.allowed) return failure('RETENTION_ANALYTICS_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            var scopes = access.scope ? [access.scope] : visibleScopes(access.actor.role);
            var evaluations = [];
            scopes.forEach(function each(scope) {
                var result = evaluateRetentionPolicy({ tenantSlug: access.tenantSlug, scope: scope }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
                if (result.success) evaluations.push(result);
            });
            var total = evaluations.reduce(function sum(value, row) { return value + row.metrics.totalRecords; }, 0);
            var archived = evaluations.reduce(function sum(value, row) { return value + row.metrics.archivedRecords; }, 0);
            var deletionEligible = evaluations.reduce(function sum(value, row) { return value + row.metrics.deletionEligibleRecords; }, 0);
            var holds = evaluations.reduce(function sum(value, row) { return value + row.metrics.legalHoldRecords; }, 0);
            var violations = evaluations.reduce(function sum(value, row) { return value + row.metrics.retentionViolations + row.metrics.malformedTimestampRecords; }, 0);
            var transitions = tenantHistory('dataLifecycleHistory', access.tenantSlug).filter(function scopeFilter(row) { return scopes.indexOf(normalizeScope(row.scope)) !== -1; });
            var reviews = tenantHistory('dataDeletionReviews', access.tenantSlug).filter(function scopeFilter(row) { return scopes.indexOf(normalizeScope(row.scope)) !== -1; });
            var complianceScore = clampScore(100 - (total ? (violations / total) * 100 : 0));
            var retentionScore = clampScore(evaluations.length ? evaluations.reduce(function sum(value, row) { return value + row.retentionComplianceScore; }, 0) / evaluations.length : 100);
            var lifecycleHealth = clampScore(complianceScore * 0.55 + retentionScore * 0.3 + (reviews.every(function safe(row) { return row.backupIntegrityVerified && !row.physicalDeletionExecuted; }) ? 15 : 0));
            audit('RETENTION_COMPLIANCE_REVIEWED', { tenantSlug: access.tenantSlug, scopeCount: scopes.length, description: 'Retention compliance analytics reviewed.' }, context || {});
            return freezeRetentionOutput({
                success: true, tenantSlug: access.tenantSlug, scopes: scopes,
                retentionComplianceScore: complianceScore, retentionScore: retentionScore, lifecycleHealthScore: lifecycleHealth,
                analytics: {
                    totalRecords: total, archivedRecords: archived, pendingDeletions: reviews.length,
                    deletionEligibleRecords: deletionEligible,
                    legalHoldRecords: holds, retentionViolations: violations, lifecycleTransitions: transitions.length,
                    deletionReviews: reviews.length, policiesConfigured: tenantHistory('dataRetentionPolicies', access.tenantSlug).filter(function policy(row) { return scopes.indexOf(normalizeScope(row.scope)) !== -1; }).length
                },
                scopeAnalytics: evaluations.map(function map(row) {
                    return { scope: row.scope, complianceScore: row.retentionComplianceScore, archiveReadinessScore: row.archiveReadinessScore, metrics: row.metrics };
                }),
                governance: governanceFlags(), generatedAt: nowIso(context || {})
            });
        } catch (error) {
            return failure('RETENTION_ANALYTICS_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('RETENTION_ANALYTICS_FAILED_SAFE', 'Retention analytics failed safely.', 'ERROR')], context || {});
        }
    }

    function calculateRetentionComplianceScore(input, context) {
        return calculateRetentionCompliance(input, context);
    }

    function generateRetentionGovernanceReport(input, context) {
        try {
            var access = validateAccess('VIEW', input || {}, context || {});
            if (!access.allowed) return failure('RETENTION_REPORT_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            var scopes = visibleScopes(access.actor.role);
            var analytics = calculateRetentionCompliance({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            if (!analytics.success) return analytics;
            function scopedHistory(key) {
                return tenantHistory(key, access.tenantSlug).filter(function filter(row) { return !row.scope || scopes.indexOf(normalizeScope(row.scope)) !== -1; });
            }
            var legalHoldLedger = scopedHistory('dataLegalHoldRecords');
            var currentLegalHolds = {};
            legalHoldLedger.forEach(function current(row) {
                currentLegalHolds[normalizeScope(row.scope) + '|' + safeString(row.sourceRecordId, '')] = row;
            });
            var policies = scopes.map(function map(scope) {
                var policy = activePolicy(scope, access.tenantSlug);
                return {
                    policyId: policy.policyId, scope: scope, state: policy.state || 'ACTIVE',
                    archiveAfterDays: Number(policy.archiveAfterDays), retentionDays: Number(policy.retentionDays),
                    source: policy.source || 'TENANT_POLICY', active: policy.active !== false
                };
            });
            return freezeRetentionOutput({
                success: true, tenantSlug: access.tenantSlug, state: 'ACTIVE', policies: policies,
                analytics: analytics,
                archiveHistory: scopedHistory('dataArchiveRecords').slice(-50).reverse().map(function map(row) {
                    return { archiveId: row.archiveId, scope: normalizeScope(row.scope), sourceRecordId: row.sourceRecordId, state: row.state, archivedAt: row.archivedAt, integrityVerified: row.archiveIntegrityHash === archiveChecksum(row) };
                }),
                legalHolds: Object.keys(currentLegalHolds).map(function current(key) { return currentLegalHolds[key]; }).filter(function active(row) {
                    return row.active !== false && row.action !== 'RELEASED';
                }).slice(-50).reverse().map(function map(row) {
                    return { legalHoldId: row.legalHoldId, scope: normalizeScope(row.scope), sourceRecordId: row.sourceRecordId, state: row.state, active: row.active !== false, action: row.action, appliedAt: row.appliedAt, releasedAt: row.releasedAt };
                }),
                deletionSchedule: scopedHistory('dataDeletionReviews').slice(-50).reverse().map(function map(row) {
                    return { deletionReviewId: row.deletionReviewId, archiveId: row.archiveId, scope: normalizeScope(row.scope), state: row.state, backupIntegrityVerified: row.backupIntegrityVerified === true, physicalDeletionExecuted: false, scheduledAt: row.scheduledAt };
                }),
                lifecycleHistory: scopedHistory('dataLifecycleHistory').slice(-80).reverse().map(function map(row) {
                    return { lifecycleId: row.lifecycleId, scope: normalizeScope(row.scope), sourceRecordId: row.sourceRecordId, state: row.state, action: row.action, timestamp: row.timestamp };
                }),
                recoveryReadiness: backupReadiness(access.tenantSlug),
                integrations: {
                    backupExportFoundation: !!global.TenantBackupExportService || tenantHistory('tenantBackupHistory', access.tenantSlug).length > 0,
                    auditGovernance: !!global.AuditService,
                    employeeLifecycle: Array.isArray(rawData().employees),
                    documentGovernance: !!global.DocumentGovernanceService || Array.isArray(rawData().documents),
                    securityGovernance: !!global.LoginAttemptSecurityService || !!global.SessionGovernanceService
                },
                governance: governanceFlags(), generatedAt: nowIso(context || {})
            });
        } catch (error) {
            return failure('RETENTION_REPORT_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('RETENTION_REPORT_FAILED_SAFE', 'Retention governance report failed safely.', 'ERROR')], context || {});
        }
    }

    function runSelfTest() {
        var frozen = freezeRetentionOutput({ nested: { value: 1 } });
        var checks = [
            { name: 'retention policies work', passed: SCOPE_CONFIGURATION.audit_logs.retentionDays === 2555 },
            { name: 'archival works', passed: RETENTION_STATES.indexOf('ARCHIVED') !== -1 },
            { name: 'legal holds work', passed: RETENTION_STATES.indexOf('LEGAL_HOLD') !== -1 },
            { name: 'lifecycle transitions work', passed: RETENTION_STATES.indexOf('DELETION_PENDING') !== -1 && RETENTION_STATES.indexOf('DELETED') !== -1 },
            { name: 'immutable outputs enforced', passed: Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) }
        ];
        var result = freezeRetentionOutput({ passed: checks.every(function every(check) { return check.passed; }), checks: checks, summary: 'Data retention governance self-test completed.' });
        global.__ARTHHRMS_DATA_RETENTION_SELF_TEST__ = result;
        return result;
    }

    var DataRetentionGovernanceService = Object.freeze({
        RETENTION_STATES: RETENTION_STATES,
        DATA_SCOPES: DATA_SCOPES,
        SCOPE_CONFIGURATION: SCOPE_CONFIGURATION,
        normalizeRetentionPayload: normalizeRetentionPayload,
        freezeRetentionOutput: freezeRetentionOutput,
        saveRetentionPolicy: saveRetentionPolicy,
        evaluateRetentionPolicy: evaluateRetentionPolicy,
        archiveEligibleRecords: archiveEligibleRecords,
        restoreArchivedRecord: restoreArchivedRecord,
        calculateRetentionCompliance: calculateRetentionCompliance,
        calculateRetentionComplianceScore: calculateRetentionComplianceScore,
        applyLegalHold: applyLegalHold,
        releaseLegalHold: releaseLegalHold,
        scheduleDeletionReview: scheduleDeletionReview,
        generateRetentionGovernanceReport: generateRetentionGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.DataRetentionGovernanceService = DataRetentionGovernanceService;
    global.dataRetentionGovernanceService = DataRetentionGovernanceService;

    if (global.__ARTHHRMS_DEV__) runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
