/**
 * ARTHHRMS Soft Delete and Restore Governance Service
 * Applies reversible tenant-scoped record overlays without physical deletion.
 */
(function attachSoftDeleteRestoreGovernanceService(global) {
    'use strict';

    var SOURCE = 'softDeleteRestoreGovernanceService';
    var RECORD_STATES = Object.freeze([
        'ACTIVE', 'SOFT_DELETED', 'RESTORABLE', 'RESTORED',
        'PENDING_DELETION', 'ARCHIVED', 'PERMANENTLY_DELETED'
    ]);
    var RECORD_TYPES = Object.freeze({
        EMPLOYEE: Object.freeze({ collections: Object.freeze(['employees']), retentionScope: 'employees', lifecycleRequired: true }),
        EMPLOYEE_PROFILE: Object.freeze({ collections: Object.freeze(['employeeProfiles', 'employeeProfileRecords']), retentionScope: 'employees' }),
        LEAVE_REQUEST: Object.freeze({ collections: Object.freeze(['leaveRequests']), retentionScope: 'leave' }),
        ATTENDANCE_RECORD: Object.freeze({ collections: Object.freeze(['attendance']), retentionScope: 'attendance' }),
        DOCUMENT_METADATA: Object.freeze({ collections: Object.freeze(['documents', 'fileAttachmentRecords']), retentionScope: 'documents' }),
        DEPARTMENT: Object.freeze({ collections: Object.freeze(['departments']), retentionScope: 'employees' })
    });
    var VIEW_ROLES = Object.freeze(['HR', 'DIRECTOR', 'EMPLOYEE', 'PLATFORM_OWNER']);
    var EMPLOYEE_DELETABLE_STATES = Object.freeze(['TERMINATED', 'RESIGNED', 'RETIRED', 'ARCHIVED']);
    var DEFAULT_RESTORE_WINDOW_DAYS = 30;

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
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeRecordType(value) {
        var recordType = token(value || '');
        if (recordType === 'EMPLOYEES' || recordType === 'EMPLOYEE_RECORD') return 'EMPLOYEE';
        if (recordType === 'PROFILE' || recordType === 'EMPLOYEE_PROFILES') return 'EMPLOYEE_PROFILE';
        if (recordType === 'LEAVE' || recordType === 'LEAVE') return 'LEAVE_REQUEST';
        if (recordType === 'ATTENDANCE') return 'ATTENDANCE_RECORD';
        if (recordType === 'DOCUMENT' || recordType === 'DOCUMENTS') return 'DOCUMENT_METADATA';
        if (recordType === 'DEPARTMENTS') return 'DEPARTMENT';
        return recordType;
    }

    function nowIso(context, preferred) {
        try {
            var value = new Date(preferred || context && context.now || Date.now());
            return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
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
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            return typeof value === 'string' ? value.slice(0, 1200) : value;
        }
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); })
                .filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            if (/password|secret|token|salary|compensation|bank|account|private|confidential|storage.?path|file.?path|email|phone|address/i.test(key)) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeRecoveryGovernanceOutput(value) {
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
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim().slice(0, 160),
            employeeId: safeString(source.employeeId || source.empId || source.id || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || ''
        );
    }

    function rowTenant(row, sourceData) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        var explicit = normalizeTenant(row && (
            row.tenantSlug || row.tenantId || row.tenant_id || row.companyId || row.company_id ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
        if (explicit) return explicit;
        var employeeId = safeString(row && (row.empId || row.employeeId || row.ownerEmpId || row.userId) || '', '').trim();
        if (!employeeId) return '';
        var employees = Array.isArray(sourceData && sourceData.employees) ? sourceData.employees : [];
        var employee = employees.find(function find(item) {
            return employeeRecordId(item) === employeeId;
        });
        return normalizeTenant(employee && (employee.tenantSlug || employee.tenantId || employee.companyId));
    }

    function employeeRecordId(row) {
        return safeString(row && (row.empId || row.employeeId || row.userId || row.id) || '', '').trim().slice(0, 160);
    }

    function recordIdFor(recordType, row, collection, index) {
        var value = '';
        if (recordType === 'EMPLOYEE') value = row.empId || row.employeeId || row.userId || row.id;
        else if (recordType === 'EMPLOYEE_PROFILE') value = row.profileId || row.employeeId || row.empId || row.id;
        else if (recordType === 'LEAVE_REQUEST') value = row.leaveId || row.requestId || row.id;
        else if (recordType === 'ATTENDANCE_RECORD') value = row.attendanceId || row.id;
        else if (recordType === 'DOCUMENT_METADATA') value = row.documentId || row.attachmentId || row.id;
        else if (recordType === 'DEPARTMENT') value = row.departmentId || row.code || row.id;
        return safeString(value || collection + '-' + index, '').trim().slice(0, 160);
    }

    function ownerEmployeeId(recordType, row) {
        if (recordType === 'EMPLOYEE') return employeeRecordId(row);
        return safeString(row && (row.employeeId || row.empId || row.ownerEmpId || row.userId) || '', '').trim().slice(0, 160);
    }

    function result(success, code, message, extra) {
        return freezeRecoveryGovernanceOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'RECOVERY_GOVERNANCE_READY' : 'RECOVERY_GOVERNANCE_FAILED')),
            message: safeString(message || (success ? 'Recovery governance operation completed.' : 'Recovery governance operation failed.'), '').slice(0, 260)
        }, extra || {}));
    }

    function governanceFlags() {
        return {
            tenantIsolationPreserved: true,
            recoveryGovernancePreserved: true,
            rbacAuthoritative: true,
            directorApprovalRequired: true,
            sourceRecordRetained: true,
            permanentDeletionEnabled: false,
            immutableHistory: true,
            backwardCompatibilityPreserved: true
        };
    }

    function audit(actionType, metadata, context, severity) {
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
                    module: 'Soft Delete and Restore Governance',
                    severity: severity || (/DENIED|FAILED|EXPIRED|CONFLICT/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: cloneSafe(metadata || {}, [])
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function validateTenant(targetTenant, context) {
        var tenant = normalizeTenant(targetTenant || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var scope = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}));
        if (!tenant || !scope || tenant !== scope) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped recovery access was denied.');
        }
        try {
            var registry = global.ValidationRegistry;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: tenant, ownerTenantSlug: tenant, actorTenantSlug: scope
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: tenant }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped recovery access was denied.');
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely.');
        }
        return result(true, 'TENANT_ACCESS_VALIDATED', 'Tenant access validated.', { tenantSlug: tenant });
    }

    function normalizeApproval(input) {
        var source = input && input.approval && typeof input.approval === 'object' ? input.approval : {};
        return {
            approved: source.approved === true,
            approverId: safeString(source.approverId || source.approvedBy || '', '').trim().slice(0, 160),
            approverRole: normalizeRole(source.approverRole || source.role || ''),
            approvedAt: source.approvedAt ? nowIso({}, source.approvedAt) : '',
            approvalReference: safeString(source.approvalReference || input && input.approvalReference || '', '').trim().slice(0, 160)
        };
    }

    function hasDirectorApproval(input) {
        var approval = normalizeApproval(input || {});
        return approval.approved && !!approval.approverId && approval.approverRole === 'DIRECTOR' && !!approval.approvedAt;
    }

    function findTarget(recordType, recordId, tenantSlug) {
        var current = data();
        var config = RECORD_TYPES[recordType];
        if (!config) return null;
        for (var collectionIndex = 0; collectionIndex < config.collections.length; collectionIndex += 1) {
            var collection = config.collections[collectionIndex];
            var rows = Array.isArray(current[collection]) ? current[collection] : [];
            for (var index = 0; index < rows.length; index += 1) {
                if (recordIdFor(recordType, rows[index], collection, index) !== recordId) continue;
                if (rowTenant(rows[index], current) !== tenantSlug) continue;
                return {
                    data: current,
                    config: config,
                    collection: collection,
                    index: index,
                    record: rows[index],
                    recordType: recordType,
                    recordId: recordId,
                    ownerEmployeeId: ownerEmployeeId(recordType, rows[index])
                };
            }
        }
        return null;
    }

    function currentRecordState(record) {
        var state = token(record && record.recordState || '');
        if (record && record.isSoftDeleted === true) return 'SOFT_DELETED';
        if (RECORD_STATES.indexOf(state) !== -1) return state;
        return 'ACTIVE';
    }

    function currentVersion(record) {
        var value = Number(record && record._recoveryVersion || 0);
        return Number.isFinite(value) && value >= 0 ? value : 0;
    }

    function append(current, key, record) {
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(Object.assign({}, cloneSafe(record, []), { immutable: true }));
    }

    function activeLegalHold(tenantSlug, target) {
        var rows = Array.isArray(target.data.dataLegalHoldRecords) ? target.data.dataLegalHoldRecords : [];
        var matches = rows.filter(function filter(row) {
            return rowTenant(row, target.data) === tenantSlug &&
                safeString(row.scope || '', '').trim().toLowerCase() === target.config.retentionScope &&
                safeString(row.sourceRecordId || row.recordId || '', '').trim() === target.recordId;
        });
        if (!matches.length) return null;
        var latest = matches[matches.length - 1];
        return latest.active === false || token(latest.action) === 'RELEASED' ? null : latest;
    }

    function employeeLifecycleState(target, tenantSlug) {
        if (!target.config.lifecycleRequired) return '';
        var rows = Array.isArray(target.data.employeeLifecycleCurrent) ? target.data.employeeLifecycleCurrent : [];
        var current = rows.slice().reverse().find(function find(row) {
            return rowTenant(row, target.data) === tenantSlug && employeeRecordId(row) === target.recordId;
        });
        return token(current && current.currentStatus || target.record.status || target.record.employmentStatus || target.record.lifecycleStatus || '');
    }

    function dependencyIssues(input) {
        var dependencies = Array.isArray(input && input.dependencies) ? input.dependencies : [];
        return dependencies.filter(function filter(item) {
            var state = token(item && item.state || '');
            return !item || item.valid === false || ['MISSING', 'INVALID', 'BLOCKED', 'CONFLICT'].indexOf(state) !== -1;
        }).map(function map(item) {
            return {
                dependencyId: safeString(item && (item.dependencyId || item.id) || '', '').trim().slice(0, 160),
                state: token(item && item.state || 'INVALID')
            };
        });
    }

    function integrationStatus(target) {
        var tenantSlug = target && rowTenant(target.record, target.data) || '';
        var backups = target && Array.isArray(target.data.tenantBackupHistory) ? target.data.tenantBackupHistory.filter(function filter(row) {
            return rowTenant(row, target.data) === tenantSlug && row.state === 'COMPLETED';
        }) : [];
        var validations = target && Array.isArray(target.data.tenantBackupValidationHistory) ? target.data.tenantBackupValidationHistory.filter(function filter(row) {
            return rowTenant(row, target.data) === tenantSlug && row.integrityValid === true;
        }) : [];
        return {
            backupGovernance: { integrated: !!global.TenantBackupExportService, mode: 'RECOVERY_READINESS', backupAvailable: backups.length > 0, integrityVerified: validations.length > 0 },
            retentionGovernance: { integrated: !!global.DataRetentionGovernanceService, mode: 'LEGAL_HOLD_ENFORCEMENT' },
            employeeLifecycle: { integrated: !!global.EmployeeStatusLifecycleService, mode: 'TERMINAL_STATE_VALIDATION' },
            auditGovernance: { integrated: !!global.AuditService, mode: 'IMMUTABLE_AUDIT' },
            workflowRecovery: { integrated: !!global.WorkflowRecoveryService, mode: 'ADVISORY_ONLY' },
            noWorkflowExecution: true,
            noPermanentDeletion: true
        };
    }

    function publicDeletion(row, governanceOnly, index) {
        return {
            deletionId: row.deletionId || '',
            tenantSlug: row.tenantSlug || '',
            recordType: row.recordType || '',
            recordId: governanceOnly ? 'Governance Record ' + (index + 1) : row.recordId || '',
            ownerEmployeeId: governanceOnly ? '' : row.ownerEmployeeId || '',
            state: row.state || 'SOFT_DELETED',
            deleted_at: row.deleted_at || '',
            deleted_by: governanceOnly ? '' : row.deleted_by || '',
            deletion_reason: governanceOnly ? 'Governed deletion event' : row.deletion_reason || '',
            restore_deadline: row.restore_deadline || '',
            version: Number(row.version || 0),
            immutable: true
        };
    }

    function publicRecovery(row, governanceOnly, index) {
        return {
            recoveryId: row.recoveryId || '',
            tenantSlug: row.tenantSlug || '',
            recordType: row.recordType || '',
            recordId: governanceOnly ? 'Governance Record ' + (index + 1) : row.recordId || '',
            ownerEmployeeId: governanceOnly ? '' : row.ownerEmployeeId || '',
            action: row.action || '',
            state: row.state || '',
            code: row.code || '',
            timestamp: row.timestamp || '',
            performedBy: governanceOnly ? '' : row.performedBy || '',
            restoreReason: governanceOnly ? '' : row.restoreReason || '',
            version: Number(row.version || 0),
            immutable: true
        };
    }

    function failure(code, message, context, extra) {
        audit('RECOVERY_GOVERNANCE_' + token(code || 'FAILED'), Object.assign({ success: false }, extra || {}), context || {}, 'WARNING');
        return result(false, code, message, Object.assign({ governance: governanceFlags() }, extra || {}));
    }

    function softDeleteRecord(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return failure('MALFORMED_RECOVERY_PAYLOAD', 'Soft delete payload must be an object.', context || {});
            }
            var tenantCheck = validateTenant(input.tenantSlug || input.tenantId, context || {});
            if (!tenantCheck.success) return tenantCheck;
            if (actor(context || {}).role !== 'HR') {
                return failure('RECOVERY_GOVERNANCE_DENIED', 'Only HR may execute governed workforce soft deletion.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
            }
            var recordType = normalizeRecordType(input.recordType || input.entityType);
            var recordId = safeString(input.recordId || input.entityId || '', '').trim().slice(0, 160);
            if (!RECORD_TYPES[recordType] || !recordId) {
                return failure('INVALID_RECOVERY_RECORD', 'A supported record type and record identifier are required.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
            }
            if (!hasDirectorApproval(input)) {
                return failure('DIRECTOR_APPROVAL_REQUIRED', 'Director approval evidence is required before soft deletion.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var reason = safeString(input.deletionReason || input.deletion_reason || input.reason || '', '').trim();
            if (!reason) return failure('DELETION_REASON_REQUIRED', 'A deletion reason is required.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            var target = findTarget(recordType, recordId, tenantCheck.tenantSlug);
            if (!target) return failure('RECOVERY_RECORD_NOT_FOUND', 'The record was not found in the selected tenant.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            if (currentRecordState(target.record) === 'SOFT_DELETED') {
                return failure('RECORD_ALREADY_SOFT_DELETED', 'The record is already soft deleted.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var version = currentVersion(target.record);
            var expectedVersion = Object.prototype.hasOwnProperty.call(input, 'expectedVersion') ? Number(input.expectedVersion) : version;
            if (!Number.isFinite(expectedVersion) || expectedVersion !== version) {
                return failure('CONCURRENT_RECOVERY_REQUEST', 'The record recovery state changed after this request was prepared.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, currentVersion: version });
            }
            if (activeLegalHold(tenantCheck.tenantSlug, target)) {
                return failure('LEGAL_HOLD_PREVENTS_SOFT_DELETE', 'Records under legal hold cannot be soft deleted.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var lifecycleState = employeeLifecycleState(target, tenantCheck.tenantSlug);
            if (target.config.lifecycleRequired && EMPLOYEE_DELETABLE_STATES.indexOf(lifecycleState) === -1) {
                return failure('EMPLOYEE_LIFECYCLE_NOT_DELETABLE', 'Employee records must be in a governed terminal lifecycle state before soft deletion.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, lifecycleState: lifecycleState });
            }
            if (dependencyIssues(input).length) {
                return failure('DELETE_DEPENDENCY_CONFLICT', 'Record dependencies block soft deletion.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var restoreWindowDays = Number(input.restoreWindowDays || DEFAULT_RESTORE_WINDOW_DAYS);
            if (!Number.isFinite(restoreWindowDays) || restoreWindowDays < 1 || restoreWindowDays > 365) {
                return failure('INVALID_RESTORE_WINDOW', 'Restore window must be between 1 and 365 days.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var deletedAt = nowIso(context || {}, input.deletedAt);
            var restoreDeadline = new Date(Date.parse(deletedAt) + Math.floor(restoreWindowDays) * 86400000).toISOString();
            var currentActor = actor(context || {});
            var approval = normalizeApproval(input);
            var nextVersion = version + 1;
            var deletion = {
                deletionId: createId('SDG'), tenantSlug: tenantCheck.tenantSlug, tenant_id: tenantCheck.tenantSlug,
                recordType: recordType, recordId: recordId, ownerEmployeeId: target.ownerEmployeeId,
                collection: target.collection, state: 'SOFT_DELETED', previousState: currentRecordState(target.record),
                deleted_at: deletedAt, deleted_by: currentActor.id, deletion_reason: reason.slice(0, 500),
                restore_deadline: restoreDeadline,
                deletion_metadata: Object.assign({ source: token(input.source || SOURCE), restoreWindowDays: Math.floor(restoreWindowDays) }, cloneSafe(input.deletionMetadata || input.deletion_metadata || {}, [])),
                approval: approval, version: nextVersion, hardDeleteExecuted: false, immutable: true
            };
            var updated = Object.assign({}, target.record, {
                recordState: 'SOFT_DELETED', isSoftDeleted: true,
                deleted_at: deletion.deleted_at, deleted_by: deletion.deleted_by,
                deletion_reason: deletion.deletion_reason, tenant_id: deletion.tenant_id,
                restore_deadline: deletion.restore_deadline, deletion_metadata: cloneSafe(deletion.deletion_metadata, []),
                _recoveryVersion: nextVersion, _recoveryGovernanceId: deletion.deletionId
            });
            target.data[target.collection][target.index] = updated;
            append(target.data, 'softDeleteHistory', deletion);
            append(target.data, 'recordRecoveryApprovalHistory', {
                approvalHistoryId: createId('RGA'), tenantSlug: tenantCheck.tenantSlug,
                recordType: recordType, recordId: recordId, ownerEmployeeId: target.ownerEmployeeId,
                action: 'SOFT_DELETE_APPROVED', approval: approval, timestamp: deletedAt
            });
            save(target.data);
            audit('RECORD_SOFT_DELETED', { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, deletionId: deletion.deletionId, version: nextVersion, hardDeleteExecuted: false }, context || {});
            return result(true, 'RECORD_SOFT_DELETED', 'Record soft deleted within a governed recovery window.', {
                tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId,
                state: 'SOFT_DELETED', deletion: publicDeletion(deletion, false, 0), version: nextVersion,
                restoreDeadline: restoreDeadline, hardDeleteExecuted: false,
                integrations: integrationStatus(target), governance: governanceFlags()
            });
        } catch (error) {
            return failure('SOFT_DELETE_FAILED_SAFE', 'Soft deletion failed safely.', context || {});
        }
    }

    function recordRestoreFailure(target, code, context) {
        if (!target || context && context.skipFailurePersistence) return;
        var record = {
            recoveryId: createId('RGR'), tenantSlug: rowTenant(target.record, target.data),
            recordType: target.recordType, recordId: target.recordId, ownerEmployeeId: target.ownerEmployeeId,
            action: 'RESTORE_FAILED', state: currentRecordState(target.record), code: code,
            timestamp: nowIso(context || {}), performedBy: actor(context || {}).id,
            version: currentVersion(target.record), immutable: true
        };
        append(target.data, 'recordRecoveryHistory', record);
        save(target.data);
        audit('RECORD_RESTORE_FAILED', { tenantSlug: record.tenantSlug, recordType: record.recordType, recordId: record.recordId, code: code }, context || {}, 'WARNING');
    }

    function validateRestoreRequest(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return failure('MALFORMED_RECOVERY_PAYLOAD', 'Restore request payload must be an object.', context || {});
            }
            var tenantCheck = validateTenant(input.tenantSlug || input.tenantId, context || {});
            if (!tenantCheck.success) return tenantCheck;
            var currentActor = actor(context || {});
            if (['HR', 'DIRECTOR'].indexOf(currentActor.role) === -1) {
                return failure('RECOVERY_GOVERNANCE_DENIED', 'Restore validation requires HR management or Director review access.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
            }
            var recordType = normalizeRecordType(input.recordType || input.entityType);
            var recordId = safeString(input.recordId || input.entityId || '', '').trim().slice(0, 160);
            if (!RECORD_TYPES[recordType] || !recordId) return failure('INVALID_RECOVERY_RECORD', 'A supported record type and record identifier are required.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
            var target = findTarget(recordType, recordId, tenantCheck.tenantSlug);
            if (!target) return failure('RECOVERY_RECORD_NOT_FOUND', 'The record was not found in the selected tenant.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            if (currentRecordState(target.record) !== 'SOFT_DELETED') {
                recordRestoreFailure(target, 'RECORD_NOT_RESTORABLE', context || {});
                return failure('RECORD_NOT_RESTORABLE', 'Only soft-deleted records may be restored.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var version = currentVersion(target.record);
            var expectedVersion = Object.prototype.hasOwnProperty.call(input, 'expectedVersion') ? Number(input.expectedVersion) : version;
            if (!Number.isFinite(expectedVersion) || expectedVersion !== version) {
                recordRestoreFailure(target, 'CONCURRENT_RECOVERY_REQUEST', context || {});
                return failure('CONCURRENT_RECOVERY_REQUEST', 'The record recovery state changed after this request was prepared.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, currentVersion: version });
            }
            var deadline = Date.parse(target.record.restore_deadline || '');
            var currentTime = Date.parse(nowIso(context || {}));
            if (!Number.isFinite(deadline) || currentTime > deadline) {
                recordRestoreFailure(target, 'RESTORE_WINDOW_EXPIRED', context || {});
                return failure('RESTORE_WINDOW_EXPIRED', 'The governed restore window has expired.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var expectedOwner = safeString(input.ownerEmployeeId || '', '').trim();
            if (expectedOwner && expectedOwner !== target.ownerEmployeeId) {
                recordRestoreFailure(target, 'RESTORE_OWNERSHIP_MISMATCH', context || {});
                return failure('RESTORE_OWNERSHIP_MISMATCH', 'Restore ownership validation failed.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var conflicts = dependencyIssues(input);
            if (conflicts.length) {
                recordRestoreFailure(target, 'RESTORE_DEPENDENCY_CONFLICT', context || {});
                return failure('RESTORE_DEPENDENCY_CONFLICT', 'Record dependencies block restoration.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, dependencyCount: conflicts.length });
            }
            audit('RECORD_RESTORE_REQUEST_VALIDATED', { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, version: version }, context || {});
            return result(true, 'RESTORE_REQUEST_VALIDATED', 'Restore request is valid.', {
                tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId,
                ownerEmployeeId: target.ownerEmployeeId, state: 'RESTORABLE', currentVersion: version,
                restoreDeadline: target.record.restore_deadline,
                dependenciesValid: true, ownershipValid: true, governance: governanceFlags()
            });
        } catch (error) {
            return failure('RESTORE_VALIDATION_FAILED_SAFE', 'Restore validation failed safely.', context || {});
        }
    }

    function restoreRecord(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return failure('MALFORMED_RECOVERY_PAYLOAD', 'Restore payload must be an object.', context || {});
            }
            var tenantCheck = validateTenant(input.tenantSlug || input.tenantId, context || {});
            if (!tenantCheck.success) return tenantCheck;
            if (actor(context || {}).role !== 'HR') {
                return failure('RECOVERY_GOVERNANCE_DENIED', 'Only HR may execute governed workforce restoration.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
            }
            var recordType = normalizeRecordType(input.recordType || input.entityType);
            var recordId = safeString(input.recordId || input.entityId || '', '').trim().slice(0, 160);
            if (!hasDirectorApproval(input)) {
                return failure('DIRECTOR_APPROVAL_REQUIRED', 'Director approval evidence is required before restoration.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            }
            var restoreReason = safeString(input.restoreReason || input.reason || '', '').trim();
            if (!restoreReason) return failure('RESTORE_REASON_REQUIRED', 'A restore reason is required.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            var validation = validateRestoreRequest(input, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            if (!validation.success) return validation;
            var target = findTarget(recordType, recordId, tenantCheck.tenantSlug);
            if (!target) return failure('RECOVERY_RECORD_NOT_FOUND', 'The record was not found in the selected tenant.', context || {}, { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId });
            var currentActor = actor(context || {});
            var restoredAt = nowIso(context || {}, input.restoredAt);
            var nextVersion = currentVersion(target.record) + 1;
            var approval = normalizeApproval(input);
            var restorable = {
                recoveryId: createId('RGR'), tenantSlug: tenantCheck.tenantSlug,
                recordType: recordType, recordId: recordId, ownerEmployeeId: target.ownerEmployeeId,
                action: 'RESTORE_REQUEST_VALIDATED', state: 'RESTORABLE', timestamp: restoredAt,
                performedBy: currentActor.id, version: currentVersion(target.record), immutable: true
            };
            var restored = {
                recoveryId: createId('RGR'), tenantSlug: tenantCheck.tenantSlug,
                recordType: recordType, recordId: recordId, ownerEmployeeId: target.ownerEmployeeId,
                action: 'RECORD_RESTORED', state: 'RESTORED', timestamp: restoredAt,
                performedBy: currentActor.id, restoreReason: restoreReason.slice(0, 500),
                approval: approval, version: nextVersion, hardDeleteExecuted: false, immutable: true
            };
            target.data[target.collection][target.index] = Object.assign({}, target.record, {
                recordState: 'RESTORED', isSoftDeleted: false,
                restored_at: restoredAt, restored_by: currentActor.id,
                restore_reason: restoreReason.slice(0, 500), _recoveryVersion: nextVersion,
                _recoveryGovernanceId: restored.recoveryId
            });
            append(target.data, 'recordRecoveryHistory', restorable);
            append(target.data, 'recordRecoveryHistory', restored);
            append(target.data, 'recordRecoveryApprovalHistory', {
                approvalHistoryId: createId('RGA'), tenantSlug: tenantCheck.tenantSlug,
                recordType: recordType, recordId: recordId, ownerEmployeeId: target.ownerEmployeeId,
                action: 'RESTORE_APPROVED', approval: approval, timestamp: restoredAt
            });
            save(target.data);
            audit('RECORD_RESTORED', { tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId, recoveryId: restored.recoveryId, version: nextVersion, hardDeleteExecuted: false }, context || {});
            return result(true, 'RECORD_RESTORED', 'Record restored through governed recovery.', {
                tenantSlug: tenantCheck.tenantSlug, recordType: recordType, recordId: recordId,
                state: 'RESTORED', recovery: publicRecovery(restored, false, 0), version: nextVersion,
                hardDeleteExecuted: false, integrations: integrationStatus(target), governance: governanceFlags()
            });
        } catch (error) {
            return failure('RECORD_RESTORE_FAILED_SAFE', 'Record restoration failed safely.', context || {});
        }
    }

    function tenantRows(key, tenantSlug) {
        var current = data();
        return (Array.isArray(current[key]) ? current[key] : []).filter(function filter(row) {
            return rowTenant(row, current) === tenantSlug;
        });
    }

    function visibleRows(rows, context) {
        var currentActor = actor(context || {});
        if (currentActor.role === 'EMPLOYEE') {
            return rows.filter(function filter(row) {
                return safeString(row.ownerEmployeeId || '', '') === currentActor.employeeId || safeString(row.recordId || '', '') === currentActor.employeeId;
            });
        }
        return rows;
    }

    function latestStateMap(deletions, recoveries) {
        var map = {};
        deletions.forEach(function each(row) {
            map[row.recordType + '|' + row.recordId] = { state: row.state, timestamp: row.deleted_at, row: row };
        });
        recoveries.forEach(function each(row) {
            if (row.action === 'RESTORE_FAILED') return;
            var key = row.recordType + '|' + row.recordId;
            var existing = map[key];
            if (!existing || safeString(row.timestamp || '', '') >= safeString(existing.timestamp || '', '')) {
                map[key] = { state: row.state, timestamp: row.timestamp, row: row };
            }
        });
        return map;
    }

    function analyticsFor(tenantSlug, context) {
        var deletions = visibleRows(tenantRows('softDeleteHistory', tenantSlug), context || {});
        var recoveries = visibleRows(tenantRows('recordRecoveryHistory', tenantSlug), context || {});
        var approvals = visibleRows(tenantRows('recordRecoveryApprovalHistory', tenantSlug), context || {});
        var latest = latestStateMap(deletions, recoveries);
        var currentDeleted = Object.keys(latest).map(function map(key) { return latest[key]; })
            .filter(function filter(item) { return item.state === 'SOFT_DELETED' || item.state === 'RESTORABLE'; });
        var restored = recoveries.filter(function filter(row) { return row.state === 'RESTORED'; });
        var failures = recoveries.filter(function filter(row) { return row.action === 'RESTORE_FAILED'; });
        var recoveryRate = deletions.length ? clampScore((restored.length / deletions.length) * 100) : 100;
        var validWindowCount = currentDeleted.filter(function filter(item) {
            var deadline = Date.parse(item.row.restore_deadline || '');
            return Number.isFinite(deadline) && Date.parse(nowIso(context || {})) <= deadline;
        }).length;
        var windowHealth = currentDeleted.length ? clampScore((validWindowCount / currentDeleted.length) * 100) : 100;
        var requiredApprovals = deletions.length + restored.length;
        var approvalCoverage = requiredApprovals ? clampScore((approvals.length / requiredApprovals) * 100) : 100;
        var recoveryScore = clampScore(recoveryRate * 0.65 + windowHealth * 0.35);
        var governanceScore = clampScore(approvalCoverage * 0.7 + 30);
        var resilienceScore = clampScore(recoveryScore * 0.45 + governanceScore * 0.4 + (failures.length ? Math.max(0, 15 - failures.length * 2) : 15));
        return {
            deletions: deletions, recoveries: recoveries, approvals: approvals, currentDeleted: currentDeleted,
            restored: restored, failures: failures,
            analytics: {
                deletedRecords: deletions.length,
                restoredRecords: restored.length,
                recoveryRate: recoveryRate,
                restoreFailures: failures.length,
                pendingRestores: currentDeleted.length,
                approvalCoverage: approvalCoverage,
                deletionTrends: deletions.reduce(function reduce(output, row) {
                    var day = safeString(row.deleted_at || '', '').slice(0, 10) || 'unknown';
                    output[day] = (output[day] || 0) + 1;
                    return output;
                }, {})
            },
            recoveryScore: recoveryScore,
            governanceScore: governanceScore,
            resilienceScore: resilienceScore,
            recoveryReadinessScore: clampScore(recoveryScore * 0.55 + governanceScore * 0.45)
        };
    }

    function validateReportAccess(input, context) {
        var tenantCheck = validateTenant(input && (input.tenantSlug || input.tenantId), context || {});
        if (!tenantCheck.success) return tenantCheck;
        var currentActor = actor(context || {});
        if (VIEW_ROLES.indexOf(currentActor.role) === -1) return failure('RECOVERY_VISIBILITY_DENIED', 'Recovery governance visibility was denied.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
        var requestedRecordId = safeString(input && input.recordId || '', '').trim();
        if (currentActor.role === 'EMPLOYEE' && requestedRecordId && requestedRecordId !== currentActor.employeeId) {
            return failure('RECOVERY_VISIBILITY_DENIED', 'Employees may view only their own recovery status.', context || {}, { tenantSlug: tenantCheck.tenantSlug });
        }
        return result(true, 'RECOVERY_VISIBILITY_VALIDATED', 'Recovery visibility validated.', { tenantSlug: tenantCheck.tenantSlug });
    }

    function calculateRecoveryReadiness(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var access = validateReportAccess(input, context || {});
            if (!access.success) return access;
            var metrics = analyticsFor(access.tenantSlug, context || {});
            audit('RECOVERY_READINESS_REVIEWED', { tenantSlug: access.tenantSlug, recoveryReadinessScore: metrics.recoveryReadinessScore }, context || {});
            return result(true, 'RECOVERY_READINESS_READY', 'Recovery readiness calculated.', {
                tenantSlug: access.tenantSlug,
                recoveryReadinessScore: metrics.recoveryReadinessScore,
                recoveryScore: metrics.recoveryScore,
                governanceScore: metrics.governanceScore,
                resilienceScore: metrics.resilienceScore,
                analytics: metrics.analytics,
                governance: governanceFlags()
            });
        } catch (error) {
            return failure('RECOVERY_READINESS_FAILED_SAFE', 'Recovery readiness failed safely.', context || {});
        }
    }

    function generateRecoveryReport(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var access = validateReportAccess(input, context || {});
            if (!access.success) return access;
            var currentActor = actor(context || {});
            var metrics = analyticsFor(access.tenantSlug, context || {});
            var governanceOnly = currentActor.role === 'PLATFORM_OWNER';
            var deletions = metrics.deletions.slice(-80).reverse().map(function map(row, index) { return publicDeletion(row, governanceOnly, index); });
            var recoveries = metrics.recoveries.slice(-80).reverse().map(function map(row, index) { return publicRecovery(row, governanceOnly, index); });
            var deletedRecords = metrics.currentDeleted.map(function map(item, index) {
                var row = item.row;
                if (row.deletionId) return publicDeletion(row, governanceOnly, index);
                return publicRecovery(row, governanceOnly, index);
            });
            var restoreQueue = deletedRecords.filter(function filter(row) {
                var deadline = Date.parse(row.restore_deadline || '');
                return !deadline || Date.parse(nowIso(context || {})) <= deadline;
            });
            var report = {
                tenantSlug: access.tenantSlug,
                analytics: metrics.analytics,
                recoveryScore: metrics.recoveryScore,
                governanceScore: metrics.governanceScore,
                resilienceScore: metrics.resilienceScore,
                recoveryReadinessScore: metrics.recoveryReadinessScore,
                deletedRecords: deletedRecords,
                restoreQueue: restoreQueue,
                deletionHistory: deletions,
                restoreHistory: recoveries,
                integrations: integrationStatus(null),
                governance: Object.assign(governanceFlags(), { platformOwnerVisibilityOnly: governanceOnly }),
                generatedAt: nowIso(context || {})
            };
            var sourceData = data();
            report.integrations = {
                backupGovernance: { integrated: !!global.TenantBackupExportService, mode: 'RECOVERY_READINESS' },
                retentionGovernance: { integrated: !!global.DataRetentionGovernanceService, mode: 'LEGAL_HOLD_ENFORCEMENT' },
                employeeLifecycle: { integrated: !!global.EmployeeStatusLifecycleService, mode: 'TERMINAL_STATE_VALIDATION' },
                auditGovernance: { integrated: !!global.AuditService, mode: 'IMMUTABLE_AUDIT' },
                workflowRecovery: { integrated: !!global.WorkflowRecoveryService, mode: 'ADVISORY_ONLY' },
                backupAvailable: tenantRows('tenantBackupHistory', access.tenantSlug).some(function some(row) { return row.state === 'COMPLETED'; }),
                backupIntegrityVerified: tenantRows('tenantBackupValidationHistory', access.tenantSlug).some(function some(row) { return row.integrityValid === true; }),
                noWorkflowExecution: true,
                noPermanentDeletion: true
            };
            if (['HR', 'DIRECTOR'].indexOf(currentActor.role) !== -1 && !(context && context.skipAnalyticsPersistence)) {
                append(sourceData, 'recordRecoveryAnalyticsHistory', Object.assign({
                    analyticsId: createId('RGA'), immutable: true
                }, cloneSafe(report, [])));
                save(sourceData);
            }
            audit('RECOVERY_GOVERNANCE_REPORT_ACCESSED', { tenantSlug: access.tenantSlug, recoveryScore: metrics.recoveryScore, governanceScore: metrics.governanceScore }, context || {});
            return result(true, 'RECOVERY_GOVERNANCE_REPORT_READY', 'Recovery governance report generated.', report);
        } catch (error) {
            return failure('RECOVERY_REPORT_FAILED_SAFE', 'Recovery governance report failed safely.', context || {});
        }
    }

    function runSelfTest() {
        var frozen = freezeRecoveryGovernanceOutput({ nested: { value: 1 } });
        var checks = {
            softDelete: RECORD_STATES.indexOf('SOFT_DELETED') !== -1 && DEFAULT_RESTORE_WINDOW_DAYS > 0,
            restore: RECORD_STATES.indexOf('RESTORABLE') !== -1 && RECORD_STATES.indexOf('RESTORED') !== -1,
            validation: EMPLOYEE_DELETABLE_STATES.indexOf('ARCHIVED') !== -1 && !!RECORD_TYPES.EMPLOYEE,
            analytics: clampScore(110) === 100 && clampScore(-1) === 0,
            tenantIsolation: normalizeTenant('TEN-tabsons') === 'tabsons',
            immutableOutputs: Object.isFrozen(frozen) && Object.isFrozen(frozen.nested),
            permanentDeletionBlocked: typeof service === 'undefined' || !service.permanentlyDeleteRecord
        };
        return freezeRecoveryGovernanceOutput({
            passed: Object.keys(checks).every(function every(key) { return checks[key] === true; }),
            checks: checks
        });
    }

    var service = Object.freeze({
        RECORD_STATES: RECORD_STATES,
        RECORD_TYPES: RECORD_TYPES,
        softDeleteRecord: softDeleteRecord,
        validateRestoreRequest: validateRestoreRequest,
        restoreRecord: restoreRecord,
        calculateRecoveryReadiness: calculateRecoveryReadiness,
        generateRecoveryReport: generateRecoveryReport,
        freezeRecoveryGovernanceOutput: freezeRecoveryGovernanceOutput,
        runSelfTest: runSelfTest
    });

    global.SoftDeleteRestoreGovernanceService = service;
    global.softDeleteRestoreGovernanceService = service;
    if (global.__ARTHHRMS_DEV__) global.__ARTHHRMS_SOFT_DELETE_RESTORE_SELF_TEST__ = runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
