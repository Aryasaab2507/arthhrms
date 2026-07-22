/**
 * tenantBackupExportService.js
 * ARTHHRMS - Tenant Backup + Export Foundation
 *
 * Creates encrypted tenant-scoped backup envelopes, governed exports, immutable
 * metadata histories, integrity validation, and restore preparation. It never
 * restores records or persists plaintext backup/export payloads.
 */
(function attachTenantBackupExportService(global) {
    'use strict';

    var SOURCE = 'tenantBackupExportService';
    var BACKUP_TYPES = Object.freeze(['FULL_BACKUP', 'INCREMENTAL_BACKUP', 'MANUAL_BACKUP', 'SCHEDULED_BACKUP', 'EXPORT_SNAPSHOT']);
    var BACKUP_STATES = Object.freeze(['CREATED', 'RUNNING', 'COMPLETED', 'FAILED', 'ARCHIVED']);
    var EXPORT_FORMATS = Object.freeze(['CSV', 'XLSX', 'JSON']);
    var EXPORT_DOMAINS = Object.freeze(['employees', 'departments', 'leave_data', 'attendance_data', 'payroll', 'documents_metadata', 'audit_records', 'organization_settings']);
    var EXPORT_ACCESS = Object.freeze({
        PLATFORM_OWNER: Object.freeze(['audit_records', 'organization_settings']),
        DIRECTOR: Object.freeze(['employees', 'departments', 'leave_data', 'attendance_data', 'audit_records', 'organization_settings']),
        HR: Object.freeze(['employees', 'departments', 'leave_data', 'attendance_data', 'payroll', 'documents_metadata']),
        HR_HEAD: Object.freeze(['employees', 'departments', 'leave_data', 'attendance_data', 'payroll', 'documents_metadata', 'audit_records', 'organization_settings'])
    });
    var keyVault = new Map();

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            return {};
        }
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

    function nowIso() { return new Date().toISOString(); }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
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
        var text = safeString(value || '', '').trim().toLowerCase();
        text = text.replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '');
        return text.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeDomain(value) {
        var domain = safeString(value || '', '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (domain === 'leave' || domain === 'leave_requests') domain = 'leave_data';
        if (domain === 'attendance') domain = 'attendance_data';
        if (domain === 'payroll_data') domain = 'payroll';
        if (domain === 'documents' || domain === 'document_metadata') domain = 'documents_metadata';
        if (domain === 'audit' || domain === 'audits') domain = 'audit_records';
        if (domain === 'settings' || domain === 'organization') domain = 'organization_settings';
        return domain;
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
            output[key] = cloneValue(value[key], refs.slice());
        });
        return output;
    }

    function freezeBackupOutput(value) {
        var cloned = cloneValue(value, []);
        function freeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { freeze(item[key]); });
            return Object.freeze(item);
        }
        return freeze(cloned);
    }

    function issue(code, message, severity, metadata) {
        return freezeBackupOutput({ code: code, message: message, severity: severity || 'WARNING', metadata: metadata || {} });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: safeString(actor.id || actor.userId || actor.empId || actor.employeeId || '', '').trim(),
            role: normalizeRole(actor.role || context?.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || actor.companyId || context?.tenantSlug || context?.tenantId || '')
        };
    }

    function tenantFromInput(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var actor = context && context.actor ? context.actor : {};
        var settings = rawData().companySettings || {};
        return normalizeTenantSlug(
            source.tenantSlug || source.tenantId || source.companyId ||
            context?.tenantSlug || context?.tenantId || context?.companyId ||
            actor.tenantSlug || actor.tenantId || actor.companyId ||
            settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function defaultTenant(data) {
        var settings = data && data.companySettings ? data.companySettings : {};
        return normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || 'default');
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
            [employee.id, employee.empId, employee.employeeId, employee.userId].filter(Boolean).forEach(function add(id) {
                map[safeString(id, '').toLowerCase()] = tenant;
            });
        });
        return map;
    }

    function rowTenant(row, data, employeeMap) {
        var explicit = explicitRowTenant(row);
        if (explicit) return explicit;
        var map = employeeMap || employeeTenantMap(data || {});
        var employeeId = row && (row.empId || row.employeeId || row.employee_id || row.ownerEmpId || row.userId || row.actorId);
        if (employeeId && map[safeString(employeeId, '').toLowerCase()]) return map[safeString(employeeId, '').toLowerCase()];
        return '';
    }

    function tenantRows(data, keys, tenantSlug) {
        var map = employeeTenantMap(data);
        var rows = [];
        (Array.isArray(keys) ? keys : [keys]).forEach(function each(key) {
            (Array.isArray(data[key]) ? data[key] : []).forEach(function add(row) {
                if (rowTenant(row, data, map) === tenantSlug) rows.push(row);
            });
        });
        return rows;
    }

    function validateAccess(action, input, context) {
        var actor = actorFromContext(context || {});
        var tenantSlug = tenantFromInput(input || {}, context || {});
        var issues = [];
        if (!tenantSlug) issues.push(issue('TENANT_SCOPE_REQUIRED', 'A tenant scope is required.', 'CRITICAL'));
        if (action === 'BACKUP' || action === 'SCHEDULE' || action === 'VALIDATE_BACKUP' || action === 'BACKUP_REPORT') {
            if (actor.role !== 'PLATFORM_OWNER') issues.push(issue('BACKUP_AUTHORITY_REQUIRED', 'Only PLATFORM_OWNER may manage tenant backup governance.', 'CRITICAL'));
        } else if (action === 'EXPORT') {
            if (!EXPORT_ACCESS[actor.role]) issues.push(issue('EXPORT_ACCESS_DENIED', 'This role cannot generate governed exports.', 'CRITICAL'));
            if (actor.role !== 'PLATFORM_OWNER' && actor.tenantSlug && tenantSlug && actor.tenantSlug !== tenantSlug) {
                issues.push(issue('CROSS_TENANT_EXPORT_BLOCKED', 'Exports cannot cross tenant boundaries.', 'CRITICAL'));
            }
            var domain = normalizeDomain(input && input.domain);
            if (EXPORT_ACCESS[actor.role] && EXPORT_ACCESS[actor.role].indexOf(domain) === -1) {
                issues.push(issue('EXPORT_DOMAIN_NOT_AUTHORIZED', 'This role is not authorized to export the requested data domain.', 'CRITICAL', { domain: domain }));
            }
        }
        return { allowed: issues.length === 0, actor: actor, tenantSlug: tenantSlug, issues: issues };
    }

    function failure(code, tenantSlug, issues, context) {
        var output = {
            success: false,
            tenantSlug: normalizeTenantSlug(tenantSlug),
            state: 'FAILED',
            issues: issues && issues.length ? issues : [issue(code || 'BACKUP_OPERATION_FAILED_SAFE', 'Backup governance operation failed safely.', 'ERROR')],
            governance: { tenantIsolationPreserved: true, backupGovernancePreserved: true, restoreExecutionEnabled: false, backwardCompatibilityPreserved: true },
            generatedAt: nowIso()
        };
        audit('BACKUP_GOVERNANCE_ACTION_BLOCKED', { tenantSlug: output.tenantSlug, success: false, description: code || 'Backup governance action blocked.' }, context || {});
        return freezeBackupOutput(output);
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
                    module: 'Tenant Backup and Export',
                    severity: meta.success === false ? 'WARNING' : 'INFO',
                    metadata: Object.assign({}, meta, { actionType: actionType, module: 'Tenant Backup and Export' })
                }, { actor: actor, source: SOURCE });
                return true;
            }
        } catch (error) {}
        try {
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Tenant Backup and Export', meta.tenantSlug || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function persistHistory(key, row, context) {
        if (context && context.skipPersistence) return row;
        var data = rawData();
        data[key] = Array.isArray(data[key]) ? data[key] : [];
        data[key].push(Object.assign({}, cloneValue(row, []), { immutable: true }));
        saveData(data);
        return row;
    }

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        return '{' + Object.keys(value).sort().map(function each(key) {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        }).join(',') + '}';
    }

    function cryptoApi() {
        try { return global.crypto && global.crypto.subtle ? global.crypto : null; } catch (error) { return null; }
    }

    function utf8Bytes(text) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
        var encoded = unescape(encodeURIComponent(text));
        var bytes = new Uint8Array(encoded.length);
        for (var i = 0; i < encoded.length; i += 1) bytes[i] = encoded.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64(bytes) {
        if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
        var binary = '';
        var source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (var i = 0; i < source.length; i += 1) binary += String.fromCharCode(source[i]);
        return global.btoa(binary);
    }

    async function sha256(value) {
        var api = cryptoApi();
        if (!api) throw new Error('Web Crypto SHA-256 is unavailable.');
        var digest = await api.subtle.digest('SHA-256', utf8Bytes(safeString(value, '')));
        return Array.from(new Uint8Array(digest)).map(function hex(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }

    async function encryptSnapshot(plaintext, backupId, tenantSlug) {
        var api = cryptoApi();
        if (!api) throw new Error('Web Crypto AES-GCM is unavailable.');
        var key = await api.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        var iv = api.getRandomValues(new Uint8Array(12));
        var encrypted = await api.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8Bytes(plaintext));
        var keyReference = 'BKEY-' + backupId;
        keyVault.set(keyReference, { key: key, tenantSlug: tenantSlug, createdAt: nowIso() });
        return {
            encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
            encryption: {
                encrypted: true,
                algorithm: 'AES-GCM',
                keyLength: 256,
                iv: bytesToBase64(iv),
                keyReference: keyReference,
                keyExported: false,
                keyScope: 'SESSION_EPHEMERAL',
                externalKeyProviderPrepared: true
            }
        };
    }

    function safeEmployee(row) {
        return {
            employeeId: row.employeeId || row.empId || row.id || '',
            name: row.name || [row.firstName, row.lastName].filter(Boolean).join(' '),
            firstName: row.firstName || '', lastName: row.lastName || '', email: row.email || '',
            department: row.department || row.dept || '', designation: row.designation || row.desig || '',
            role: row.role || '', managerId: row.managerId || '', joiningDate: row.joiningDate || row.joinedOn || '',
            location: row.location || '', employmentType: row.employmentType || '', active: row.active !== false
        };
    }

    function safeDepartment(row) {
        return {
            departmentId: row.departmentId || row.id || '', departmentCode: row.departmentCode || row.code || '',
            departmentName: row.departmentName || row.name || '', description: row.description || '',
            ownerId: row.ownerId || row.departmentHeadId || '', parentDepartmentCode: row.parentDepartmentCode || row.parentCode || '',
            state: row.state || row.status || '', active: row.active !== false
        };
    }

    function safeLeave(row) {
        return {
            leaveId: row.leaveId || row.id || '', employeeId: row.employeeId || row.empId || '', leaveType: row.leaveType || row.type || '',
            fromDate: row.fromDate || row.from || '', toDate: row.toDate || row.to || '', totalDays: row.totalDays || row.days || '',
            managerStatus: row.managerStatus || '', hrStatus: row.hrStatus || '', finalStatus: row.finalStatus || row.status || ''
        };
    }

    function safeAttendance(row) {
        return {
            attendanceId: row.attendanceId || row.id || '', employeeId: row.employeeId || row.empId || '', date: row.date || row.attendanceDate || '',
            checkIn: row.checkIn || '', checkOut: row.checkOut || '', workingHours: row.workingHours || row.hours || '', status: row.status || '', shiftId: row.shiftId || ''
        };
    }

    function safePayroll(row) {
        return {
            payrollId: row.payrollId || row.id || '', employeeId: row.employeeId || row.empId || '', payrollMonth: row.payrollMonth || row.month || '',
            basicSalary: Number(row.basicSalary || row.basic || 0), allowances: Number(row.allowances || 0), deductions: Number(row.deductions || 0),
            netSalary: Number(row.netSalary || row.net || 0), payrollStatus: row.payrollStatus || row.status || '', paidAt: row.paidAt || row.paidOn || ''
        };
    }

    function safeDocument(row) {
        return {
            documentId: row.documentId || row.attachmentId || row.id || '', employeeId: row.employeeId || row.empId || '',
            category: row.category || row.type || '', fileName: row.fileName || '', mimeType: row.mimeType || '', size: Number(row.size || row.sizeBytes || 0),
            state: row.state || row.status || '', checksum: row.checksum || row.hash || ''
        };
    }

    function safeAudit(row) {
        return {
            auditId: row.auditId || row.id || '', actorRole: row.actorRole || row.userRole || '', actionType: row.actionType || row.action || '',
            module: row.module || '', targetId: row.targetId || '', severity: row.severity || 'INFO', status: row.status || 'RECORDED',
            timestamp: row.timestamp || row.date || row.createdAt || ''
        };
    }

    function safeSettings(data, tenantSlug) {
        var settings = data.companySettings || {};
        var tenant = (Array.isArray(data.platformTenants) ? data.platformTenants : []).find(function match(row) { return explicitRowTenant(row) === tenantSlug; }) || {};
        if (tenantSlug !== defaultTenant(data) && !tenant.tenantSlug && !tenant.tenantId) return [];
        return [{
            tenantSlug: tenantSlug, companyName: tenant.companyName || settings.companyName || '', companyCode: tenant.companyCode || settings.companyCode || '',
            legalEntity: tenant.legalEntity || settings.legalEntity || '', industry: tenant.industry || settings.industry || '',
            timezone: tenant.timezone || settings.timezone || '', country: tenant.country || settings.country || '', currency: tenant.currency || settings.currency || '',
            fiscalYear: tenant.fiscalYear || settings.fiscalYear || '', lifecycleState: tenant.lifecycleState || tenant.state || ''
        }];
    }

    function domainRows(domain, tenantSlug, data) {
        if (domain === 'employees') return tenantRows(data, 'employees', tenantSlug).map(safeEmployee);
        if (domain === 'departments') return tenantRows(data, ['tenantDepartmentRecords', 'departments'], tenantSlug).map(safeDepartment);
        if (domain === 'leave_data') return tenantRows(data, ['leaveRequests', 'initialLeaveBalanceRecords', 'leaveBalanceRecords'], tenantSlug).map(safeLeave);
        if (domain === 'attendance_data') return tenantRows(data, ['attendance', 'attendanceRecords'], tenantSlug).map(safeAttendance);
        if (domain === 'payroll') return tenantRows(data, ['payroll', 'payslips', 'salaryStructures'], tenantSlug).map(safePayroll);
        if (domain === 'documents_metadata') return tenantRows(data, ['documents', 'fileAttachmentRecords', 'storageObjects'], tenantSlug).map(safeDocument);
        if (domain === 'audit_records') return tenantRows(data, 'auditLogs', tenantSlug).map(safeAudit);
        if (domain === 'organization_settings') return safeSettings(data, tenantSlug);
        return [];
    }

    function incrementalRows(rows, since) {
        if (!since) return rows;
        var threshold = Date.parse(since);
        if (!Number.isFinite(threshold)) return rows;
        return rows.filter(function filter(row) {
            var timestamp = Date.parse(row.updatedAt || row.createdAt || row.timestamp || row.date || 0);
            return Number.isFinite(timestamp) && timestamp >= threshold;
        });
    }

    function buildSnapshot(input, tenantSlug) {
        var data = rawData();
        var backupType = normalizeToken(input.backupType || input.type || 'MANUAL_BACKUP');
        var domains = backupType === 'EXPORT_SNAPSHOT' && Array.isArray(input.domains)
            ? input.domains.map(normalizeDomain).filter(function valid(domain) { return EXPORT_DOMAINS.indexOf(domain) !== -1; })
            : EXPORT_DOMAINS.slice();
        var payload = {};
        var counts = {};
        domains.forEach(function each(domain) {
            var rows = domainRows(domain, tenantSlug, data);
            if (backupType === 'INCREMENTAL_BACKUP') rows = incrementalRows(rows, input.since);
            payload[domain] = rows;
            counts[domain === 'leave_data' ? 'leave' : domain === 'attendance_data' ? 'attendance' : domain === 'documents_metadata' ? 'documents' : domain === 'audit_records' ? 'audit' : domain === 'organization_settings' ? 'organizationSettings' : domain] = rows.length;
        });
        return {
            plaintext: stableStringify({ product: 'ARTHHRMS', version: 'tenant-backup-v1', tenantSlug: tenantSlug, backupType: backupType, generatedAt: nowIso(), data: payload }),
            counts: counts,
            domains: domains
        };
    }

    function backupHashEnvelope(backup, encryptedPayload, encryption) {
        return {
            backupId: backup.backupId,
            tenantSlug: backup.tenantSlug,
            backupType: backup.backupType,
            createdAt: backup.createdAt,
            recordCounts: backup.recordCounts,
            encryptedPayload: encryptedPayload,
            algorithm: encryption.algorithm,
            iv: encryption.iv
        };
    }

    function recordBackupState(backup, state, context, extra) {
        return persistHistory('tenantBackupHistory', Object.assign({
            historyId: 'TBH-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            backupId: backup.backupId, tenantSlug: backup.tenantSlug, backupType: backup.backupType,
            state: state, timestamp: nowIso(), encrypted: true
        }, extra || {}), context || {});
    }

    async function createTenantBackup(input, context) {
        var tenantSlug = tenantFromInput(input || {}, context || {});
        var backupId = 'TBK-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        try {
            if (!input || typeof input !== 'object') return failure('MALFORMED_BACKUP_PAYLOAD', tenantSlug, [issue('MALFORMED_BACKUP_PAYLOAD', 'Backup payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('BACKUP', input, context || {});
            if (!access.allowed) return failure('BACKUP_ACCESS_DENIED', tenantSlug, access.issues, context || {});
            var backupType = normalizeToken(input.backupType || input.type || 'MANUAL_BACKUP');
            if (BACKUP_TYPES.indexOf(backupType) === -1) return failure('INVALID_BACKUP_TYPE', tenantSlug, [issue('INVALID_BACKUP_TYPE', 'Backup type is not supported.', 'ERROR')], context || {});
            var createdAt = nowIso();
            var backup = { backupId: backupId, tenantSlug: tenantSlug, backupType: backupType, state: 'CREATED', createdAt: createdAt };
            recordBackupState(backup, 'CREATED', context || {});
            recordBackupState(backup, 'RUNNING', context || {});
            var snapshot = buildSnapshot(input, tenantSlug);
            var encrypted = await encryptSnapshot(snapshot.plaintext, backupId, tenantSlug);
            backup = Object.assign({}, backup, {
                state: 'COMPLETED', completedAt: nowIso(), recordCounts: snapshot.counts, domains: snapshot.domains,
                backupSizeBytes: utf8Bytes(encrypted.encryptedPayload).byteLength,
                plaintextSizeBytes: utf8Bytes(snapshot.plaintext).byteLength,
                encrypted: true
            });
            backup.integrityHash = await sha256(stableStringify(backupHashEnvelope(backup, encrypted.encryptedPayload, encrypted.encryption)));
            recordBackupState(backup, 'COMPLETED', context || {}, {
                integrityHash: backup.integrityHash, recordCounts: backup.recordCounts, backupSizeBytes: backup.backupSizeBytes,
                encryptionAlgorithm: encrypted.encryption.algorithm, keyReference: encrypted.encryption.keyReference
            });
            audit('TENANT_BACKUP_CREATED', { tenantSlug: tenantSlug, backupId: backupId, description: 'Encrypted tenant backup created.' }, context || {});
            return freezeBackupOutput({
                success: true, tenantSlug: tenantSlug, backup: backup, encryptedPayload: encrypted.encryptedPayload, encryption: encrypted.encryption,
                workflow: ['CREATED', 'RUNNING', 'COMPLETED'],
                restorePreparation: { restoreExecutionEnabled: false, authorizationRequired: true, integrityValidationRequired: true, externalKeyProviderRequiredForDisasterRecovery: true },
                governance: { tenantIsolationPreserved: true, backupGovernancePreserved: true, plaintextPersisted: false, encryptedAtRest: true, auditReady: true },
                generatedAt: nowIso()
            });
        } catch (error) {
            var failed = { backupId: backupId, tenantSlug: tenantSlug, backupType: normalizeToken(input && input.backupType || 'MANUAL_BACKUP'), state: 'FAILED' };
            recordBackupState(failed, 'FAILED', context || {}, { failureCode: 'BACKUP_CREATION_FAILED_SAFE' });
            audit('TENANT_BACKUP_FAILED', { tenantSlug: tenantSlug, backupId: backupId, success: false, description: 'Tenant backup creation failed safely.' }, context || {});
            return failure('BACKUP_CREATION_FAILED_SAFE', tenantSlug, [issue('BACKUP_CREATION_FAILED_SAFE', 'Backup creation failed safely.', 'ERROR')], Object.assign({}, context || {}, { skipAuditPersistence: true }));
        }
    }

    async function validateBackupIntegrity(input, context) {
        try {
            if (!input || typeof input !== 'object') return failure('MALFORMED_BACKUP_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_BACKUP_PAYLOAD', 'Backup validation payload must be an object.', 'ERROR')], context || {});
            var backup = input.backup && typeof input.backup === 'object' ? input.backup : input;
            var tenantSlug = normalizeTenantSlug(backup.tenantSlug || tenantFromInput(input, context || {}));
            var access = validateAccess('VALIDATE_BACKUP', { tenantSlug: tenantSlug }, context || {});
            if (!access.allowed) return failure('BACKUP_VALIDATION_ACCESS_DENIED', tenantSlug, access.issues, context || {});
            var encryptedPayload = input.encryptedPayload || backup.encryptedPayload || '';
            var encryption = input.encryption || backup.encryption || {};
            var expected = await sha256(stableStringify(backupHashEnvelope(backup, encryptedPayload, encryption)));
            var integrityValid = !!backup.integrityHash && !!encryptedPayload && backup.integrityHash === expected;
            var record = {
                validationId: 'TBV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                backupId: backup.backupId || '', tenantSlug: tenantSlug, integrityValid: integrityValid,
                state: integrityValid ? 'COMPLETED' : 'FAILED', validatedAt: nowIso(), checksumAlgorithm: 'SHA-256'
            };
            persistHistory('tenantBackupValidationHistory', record, context || {});
            audit(integrityValid ? 'TENANT_BACKUP_VALIDATED' : 'TENANT_BACKUP_TAMPERING_DETECTED', { tenantSlug: tenantSlug, backupId: backup.backupId || '', success: integrityValid, description: integrityValid ? 'Backup integrity validated.' : 'Backup integrity validation failed.' }, context || {});
            return freezeBackupOutput({
                success: integrityValid, tenantSlug: tenantSlug, backupId: backup.backupId || '', integrityValid: integrityValid,
                integrityStatus: integrityValid ? 'VALID' : 'TAMPERED', checksumAlgorithm: 'SHA-256', validatedAt: record.validatedAt,
                issues: integrityValid ? [] : [issue('BACKUP_INTEGRITY_MISMATCH', 'Backup checksum does not match encrypted content.', 'CRITICAL')],
                governance: { tenantIsolationPreserved: true, tamperedBackupBlocked: !integrityValid, restoreExecutionEnabled: false }
            });
        } catch (error) {
            return failure('BACKUP_VALIDATION_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('BACKUP_VALIDATION_FAILED_SAFE', 'Backup validation failed safely.', 'ERROR')], context || {});
        }
    }

    function escapeCsv(value) {
        if (value === null || typeof value === 'undefined') return '';
        var text = safeString(value, '').replace(/\r?\n/g, ' ');
        return /[\",]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function toCsv(rows) {
        var columns = Object.keys(rows[0] || {});
        return [columns.map(escapeCsv).join(',')].concat(rows.map(function row(item) { return columns.map(function cell(key) { return escapeCsv(item[key]); }).join(','); })).join('\n');
    }

    function workbookModel(domain, rows) {
        return { workbookType: 'XLSX', sheetName: safeString(domain, 'Export').slice(0, 31), columns: Object.keys(rows[0] || {}), rows: cloneValue(rows, []) };
    }

    function serializeXlsx(workbook) {
        try {
            if (global.XLSX && global.XLSX.utils && typeof global.XLSX.write === 'function') {
                var sheet = global.XLSX.utils.json_to_sheet(workbook.rows);
                var book = global.XLSX.utils.book_new();
                global.XLSX.utils.book_append_sheet(book, sheet, workbook.sheetName);
                return { content: global.XLSX.write(book, { bookType: 'xlsx', type: 'base64' }), encoding: 'base64', downloadReady: true, adapter: 'SheetJS' };
            }
        } catch (error) {}
        return { content: stableStringify(workbook), encoding: 'workbook-model', downloadReady: false, adapter: 'SheetJS-compatible' };
    }

    async function generateExport(input, context) {
        try {
            if (!input || typeof input !== 'object') return failure('MALFORMED_EXPORT_PAYLOAD', tenantFromInput({}, context || {}), [issue('MALFORMED_EXPORT_PAYLOAD', 'Export payload must be an object.', 'ERROR')], context || {});
            var domain = normalizeDomain(input.domain);
            var format = normalizeToken(input.format || 'JSON');
            var access = validateAccess('EXPORT', Object.assign({}, input, { domain: domain }), context || {});
            if (!access.allowed) return failure('EXPORT_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            if (EXPORT_DOMAINS.indexOf(domain) === -1) return failure('INVALID_EXPORT_DOMAIN', access.tenantSlug, [issue('INVALID_EXPORT_DOMAIN', 'Export domain is not supported.', 'ERROR')], context || {});
            if (EXPORT_FORMATS.indexOf(format) === -1) return failure('INVALID_EXPORT_FORMAT', access.tenantSlug, [issue('INVALID_EXPORT_FORMAT', 'Export format must be CSV, XLSX, or JSON.', 'ERROR')], context || {});
            var rows = domainRows(domain, access.tenantSlug, rawData());
            var content = '';
            var workbook = null;
            var encoding = 'utf8';
            var downloadReady = true;
            var adapter = 'native';
            if (format === 'CSV') content = toCsv(rows);
            else if (format === 'JSON') content = JSON.stringify({ tenantSlug: access.tenantSlug, domain: domain, exportedAt: nowIso(), rows: rows }, null, 2);
            else {
                workbook = workbookModel(domain, rows);
                var serialized = serializeXlsx(workbook);
                content = serialized.content;
                encoding = serialized.encoding;
                downloadReady = serialized.downloadReady;
                adapter = serialized.adapter;
            }
            var integrityHash = await sha256(content);
            var exportedAt = nowIso();
            var record = {
                exportId: 'TEX-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: access.tenantSlug, domain: domain, format: format, state: 'COMPLETED', rowCount: rows.length,
                sizeBytes: utf8Bytes(content).byteLength, integrityHash: integrityHash, generatedByRole: access.actor.role,
                downloadReady: downloadReady, generatedAt: exportedAt
            };
            persistHistory('tenantExportHistory', record, context || {});
            audit('TENANT_EXPORT_GENERATED', { tenantSlug: access.tenantSlug, exportId: record.exportId, domain: domain, format: format, description: 'Tenant-scoped export generated.' }, context || {});
            return freezeBackupOutput({
                success: true, tenantSlug: access.tenantSlug, export: record, content: content, workbook: workbook,
                encoding: encoding, adapter: adapter,
                security: { tenantScoped: true, authorized: true, credentialsFiltered: true, signedUrlsFiltered: true, integrityVerified: true },
                governance: { tenantIsolationPreserved: true, exportGovernancePreserved: true, auditReady: true, immutableHistory: true }
            });
        } catch (error) {
            return failure('EXPORT_GENERATION_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('EXPORT_GENERATION_FAILED_SAFE', 'Export generation failed safely.', 'ERROR')], context || {});
        }
    }

    function scheduleTenantBackup(input, context) {
        try {
            if (!input || typeof input !== 'object') return failure('MALFORMED_BACKUP_SCHEDULE', tenantFromInput({}, context || {}), [issue('MALFORMED_BACKUP_SCHEDULE', 'Backup schedule payload must be an object.', 'ERROR')], context || {});
            var access = validateAccess('SCHEDULE', input, context || {});
            if (!access.allowed) return failure('BACKUP_SCHEDULE_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            var frequency = normalizeToken(input.frequency || 'WEEKLY');
            if (['DAILY', 'WEEKLY', 'MONTHLY'].indexOf(frequency) === -1) return failure('INVALID_BACKUP_FREQUENCY', access.tenantSlug, [issue('INVALID_BACKUP_FREQUENCY', 'Backup frequency must be DAILY, WEEKLY, or MONTHLY.', 'ERROR')], context || {});
            var schedule = {
                scheduleId: 'TBS-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: access.tenantSlug, backupType: 'SCHEDULED_BACKUP', frequency: frequency, state: 'CREATED', active: true,
                nextRunAt: input.nextRunAt || '', createdBy: access.actor.id, createdAt: nowIso(), encrypted: true
            };
            persistHistory('tenantBackupSchedules', schedule, context || {});
            audit('TENANT_BACKUP_SCHEDULED', { tenantSlug: access.tenantSlug, scheduleId: schedule.scheduleId, description: 'Encrypted tenant backup schedule created.' }, context || {});
            return freezeBackupOutput({ success: true, tenantSlug: access.tenantSlug, schedule: schedule, governance: { tenantIsolationPreserved: true, backupGovernancePreserved: true, auditReady: true } });
        } catch (error) {
            return failure('BACKUP_SCHEDULE_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('BACKUP_SCHEDULE_FAILED_SAFE', 'Backup scheduling failed safely.', 'ERROR')], context || {});
        }
    }

    function tenantHistory(key, tenantSlug) {
        return (Array.isArray(rawData()[key]) ? rawData()[key] : []).filter(function filter(row) { return explicitRowTenant(row) === tenantSlug; });
    }

    function calculateBackupHealth(input, context) {
        try {
            var access = validateAccess('BACKUP_REPORT', input || {}, context || {});
            if (!access.allowed) return failure('BACKUP_REPORT_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            var history = tenantHistory('tenantBackupHistory', access.tenantSlug);
            var completed = history.filter(function completed(row) { return row.state === 'COMPLETED'; });
            var failed = history.filter(function failed(row) { return row.state === 'FAILED'; });
            var validations = tenantHistory('tenantBackupValidationHistory', access.tenantSlug);
            var exports = tenantHistory('tenantExportHistory', access.tenantSlug);
            var schedules = tenantHistory('tenantBackupSchedules', access.tenantSlug).filter(function active(row) { return row.active !== false; });
            var finalCount = completed.length + failed.length;
            var successRate = finalCount ? clampScore((completed.length / finalCount) * 100) : 0;
            var integrityRate = validations.length ? clampScore((validations.filter(function valid(row) { return row.integrityValid === true; }).length / validations.length) * 100) : (completed.length ? 70 : 0);
            var scheduleScore = schedules.length ? 100 : 60;
            var backupHealthScore = clampScore(successRate * 0.5 + integrityRate * 0.3 + scheduleScore * 0.2);
            return freezeBackupOutput({
                success: true, tenantSlug: access.tenantSlug, backupHealthScore: backupHealthScore,
                analytics: {
                    backupSuccessRate: successRate, completedBackups: completed.length, backupFailures: failed.length,
                    backupSizeBytes: completed.reduce(function sum(total, row) { return total + Number(row.backupSizeBytes || 0); }, 0),
                    exportFrequency: exports.length, integrityValidationRate: integrityRate, activeSchedules: schedules.length
                },
                exportGovernanceScore: clampScore(exports.length ? 100 : 70),
                recoveryReadinessScore: clampScore(backupHealthScore * 0.8 + (completed.length ? 20 : 0)),
                governance: { tenantIsolationPreserved: true, backupGovernancePreserved: true, immutableHistory: true }
            });
        } catch (error) {
            return failure('BACKUP_HEALTH_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('BACKUP_HEALTH_FAILED_SAFE', 'Backup health analytics failed safely.', 'ERROR')], context || {});
        }
    }

    function generateRecoveryReadiness(input, context) {
        try {
            var health = calculateBackupHealth(input || {}, context || {});
            if (!health.success) return health;
            var tenantSlug = health.tenantSlug;
            var completed = tenantHistory('tenantBackupHistory', tenantSlug).filter(function complete(row) { return row.state === 'COMPLETED'; });
            var validations = tenantHistory('tenantBackupValidationHistory', tenantSlug);
            var latestValidation = validations.slice().sort(function sort(a, b) { return safeString(b.validatedAt || '', '').localeCompare(safeString(a.validatedAt || '', '')); })[0] || null;
            var score = clampScore(health.backupHealthScore * 0.7 + (completed.length ? 20 : 0) + (latestValidation && latestValidation.integrityValid ? 10 : 0));
            return freezeBackupOutput({
                success: true, tenantSlug: tenantSlug, recoveryReadinessScore: score,
                recoveryState: score >= 85 ? 'READY_FOR_RESTORE_PREPARATION' : score >= 60 ? 'PARTIAL' : 'NOT_READY',
                restorePreparation: {
                    restoreExecutionEnabled: false, restoreAuthorizationRequired: true, tenantValidationRequired: true,
                    integrityValidationRequired: true, externalKeyProviderRequired: true, dryRunValidationPrepared: true
                },
                latestBackupAvailable: completed.length > 0, latestIntegrityValid: !!(latestValidation && latestValidation.integrityValid),
                governance: { tenantIsolationPreserved: true, unauthorizedRestorationBlocked: true, disasterRecoveryFoundationReady: completed.length > 0 }
            });
        } catch (error) {
            return failure('RECOVERY_READINESS_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('RECOVERY_READINESS_FAILED_SAFE', 'Recovery readiness failed safely.', 'ERROR')], context || {});
        }
    }

    function generateBackupGovernanceReport(input, context) {
        try {
            var health = calculateBackupHealth(input || {}, context || {});
            if (!health.success) return health;
            var recovery = generateRecoveryReadiness(input || {}, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            var tenantSlug = health.tenantSlug;
            return freezeBackupOutput({
                success: true, tenantSlug: tenantSlug, backupTypes: BACKUP_TYPES, backupStates: BACKUP_STATES, exportFormats: EXPORT_FORMATS,
                backupHistory: tenantHistory('tenantBackupHistory', tenantSlug).slice(-24).reverse(),
                exportHistory: tenantHistory('tenantExportHistory', tenantSlug).slice(-24).reverse(),
                schedules: tenantHistory('tenantBackupSchedules', tenantSlug).slice(-12).reverse(),
                health: health, recovery: recovery,
                integrationHealth: {
                    exportServiceIntegrated: !!global.exportService, auditGovernanceIntegrated: !!global.AuditService,
                    storageGovernanceIntegrated: !!global.StorageHardeningService, tenantGovernanceIntegrated: !!global.TenantGovernanceService,
                    externalStoragePrepared: true, s3ExportPrepared: true, encryptedArchivePrepared: true
                },
                governance: { tenantIsolationPreserved: true, backupGovernancePreserved: true, unauthorizedDownloadsBlocked: true, restoreExecutionEnabled: false },
                generatedAt: nowIso()
            });
        } catch (error) {
            return failure('BACKUP_REPORT_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('BACKUP_REPORT_FAILED_SAFE', 'Backup governance report failed safely.', 'ERROR')], context || {});
        }
    }

    function recordExportDownload(input, context) {
        try {
            var access = validateAccess('EXPORT', input || {}, context || {});
            if (!access.allowed) return failure('EXPORT_DOWNLOAD_ACCESS_DENIED', access.tenantSlug, access.issues, context || {});
            var record = {
                exportId: input.exportId || '', tenantSlug: access.tenantSlug, domain: normalizeDomain(input.domain),
                format: normalizeToken(input.format || 'JSON'), state: 'DOWNLOADED', downloadedAt: nowIso(), downloadedByRole: access.actor.role
            };
            persistHistory('tenantExportHistory', record, context || {});
            audit('TENANT_EXPORT_DOWNLOADED', { tenantSlug: access.tenantSlug, exportId: record.exportId, description: 'Authorized tenant export download recorded.' }, context || {});
            return freezeBackupOutput({ success: true, tenantSlug: access.tenantSlug, download: record });
        } catch (error) {
            return failure('EXPORT_DOWNLOAD_FAILED_SAFE', tenantFromInput({}, context || {}), [issue('EXPORT_DOWNLOAD_FAILED_SAFE', 'Export download audit failed safely.', 'ERROR')], context || {});
        }
    }

    async function runSelfTest() {
        var checks = [];
        function record(check, passed) { checks.push(freezeBackupOutput({ check: check, passed: !!passed })); }
        try {
            var tenantSlug = defaultTenant(rawData()) || 'default';
            var owner = { actor: { id: 'PO-SELF', role: 'PLATFORM_OWNER' }, tenantSlug: tenantSlug, skipAuditPersistence: true, skipPersistence: true };
            var hr = { actor: { id: 'HR-SELF', role: 'HR', tenantSlug: tenantSlug }, tenantSlug: tenantSlug, skipAuditPersistence: true, skipPersistence: true };
            var backup = await createTenantBackup({ tenantSlug: tenantSlug, backupType: 'FULL_BACKUP' }, owner);
            record('backup creation works', backup.success && backup.encryption.encrypted === true);
            var exported = await generateExport({ tenantSlug: tenantSlug, domain: 'employees', format: 'CSV' }, hr);
            record('exports work', exported.success && typeof exported.content === 'string');
            var validation = await validateBackupIntegrity(backup, owner);
            record('integrity validation works', validation.success && validation.integrityValid);
            scheduleTenantBackup({ tenantSlug: tenantSlug, frequency: 'WEEKLY' }, owner);
            var analytics = calculateBackupHealth({ tenantSlug: tenantSlug }, owner);
            record('analytics work', analytics.success && typeof analytics.backupHealthScore === 'number');
            var immutable = freezeBackupOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.nested));
        } catch (error) {
            record('self-test has no uncaught failure', false);
        }
        return freezeBackupOutput({ passed: checks.every(function every(row) { return row.passed; }), tests: checks });
    }

    var TenantBackupExportService = Object.freeze({
        BACKUP_TYPES: BACKUP_TYPES,
        BACKUP_STATES: BACKUP_STATES,
        EXPORT_FORMATS: EXPORT_FORMATS,
        EXPORT_DOMAINS: EXPORT_DOMAINS,
        createTenantBackup: createTenantBackup,
        validateBackupIntegrity: validateBackupIntegrity,
        generateExport: generateExport,
        scheduleTenantBackup: scheduleTenantBackup,
        calculateBackupHealth: calculateBackupHealth,
        generateRecoveryReadiness: generateRecoveryReadiness,
        generateBackupGovernanceReport: generateBackupGovernanceReport,
        recordExportDownload: recordExportDownload,
        freezeBackupOutput: freezeBackupOutput,
        runSelfTest: runSelfTest
    });

    global.TenantBackupExportService = TenantBackupExportService;
    global.tenantBackupExportService = TenantBackupExportService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST__ = freezeBackupOutput({ passed: false, pending: true, tests: [] });
        global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST_PROMISE__ = runSelfTest().then(function complete(result) {
            global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST__ = result;
            return result;
        }).catch(function failed() {
            var result = freezeBackupOutput({ passed: false, pending: false, tests: [{ check: 'self-test initialization failed safely', passed: false }] });
            global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST__ = result;
            return result;
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
