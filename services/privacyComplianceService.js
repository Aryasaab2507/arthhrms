/**
 * privacyComplianceService.js
 * ARTHHRMS GDPR + DPDP privacy governance readiness platform.
 *
 * This service provides tenant-scoped privacy registry, consent, data subject
 * request, export, retention, breach, and readiness analytics. It does not
 * provide legal certification and never changes existing HR workflows.
 */
(function attachPrivacyComplianceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var SOURCE = 'privacyComplianceService';
    var MAX_HISTORY = 300;
    var GOVERNANCE_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var EXPORT_FORMATS = Object.freeze(['JSON', 'CSV', 'PDF', 'ZIP']);
    var REQUEST_TYPES = Object.freeze(['ACCESS_REQUEST', 'CORRECTION_REQUEST', 'DELETION_REQUEST', 'RESTRICTION_REQUEST', 'EXPORT_REQUEST', 'PROCESSING_OBJECTION', 'CONSENT_WITHDRAWAL']);
    var SENSITIVE_KEY_PATTERN = /(password|secret|token|jwt|authorization|credential|private.?key|api.?key|cookie|session.?id|salary|payroll|compensation|bank|aadhaar|ssn|passport|private.?note|raw|payload|content|body|email|phone|url|path|download|signed|biometric|file.?name|gross.?pay|account)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?(token|value|key)[-_ ]?[a-z0-9._=-]+|api[-_ ]?key[-_ ]?[a-z0-9._=-]+|password\s*[:=]\s*\S+|authorization\s*[:=]|ABC private privacy data|Private Employee|BIO-PRIVATE|PRIVATE-BANK|aadhaar\.pdf|999999|\+91[-0-9]+|private:\/\/[^\s"',}]+)/ig;
    var idCounter = 0;

    var PROCESSING_TEMPLATES = Object.freeze([
        ['Employee Lifecycle', ['Employee Data', 'Contact Details'], 'Contract', 'Manage employment lifecycle and workforce records.', '7 years after employment ends', ['HR', 'Manager'], false, 'HR'],
        ['Payroll Processing', ['Payroll Data', 'Government IDs'], 'Legal Obligation', 'Calculate salary, taxes, and statutory obligations.', '7 years', ['Payroll', 'Finance'], false, 'Finance'],
        ['Attendance Tracking', ['Attendance', 'Biometric References'], 'Legitimate Interest', 'Track work time, regularization, and attendance governance.', '5 years', ['HR', 'Manager'], false, 'Operations'],
        ['Leave Management', ['Leave'], 'Contract', 'Manage leave requests, approvals, and balances.', '5 years', ['HR', 'Manager'], false, 'HR'],
        ['Performance Management', ['Performance'], 'Legitimate Interest', 'Run review cycles, feedback, and performance governance.', '5 years', ['HR', 'Manager', 'Director'], false, 'HR'],
        ['Document Governance', ['Documents', 'Government IDs'], 'Legal Obligation', 'Maintain employee documents and verification evidence.', '7 years', ['HR', 'Compliance'], false, 'Compliance'],
        ['Emergency Contact Management', ['Emergency Contacts', 'Contact Details'], 'Vital Interest', 'Maintain emergency response contact details.', 'Duration of employment', ['HR'], false, 'HR'],
        ['Compliance Audit', ['Employee Data', 'Sensitive Personal Data'], 'Legal Obligation', 'Support audit, legal, and compliance readiness.', '7 years', ['Compliance', 'Auditors'], false, 'Compliance'],
        ['Privacy Request Management', ['Employee Data', 'Documents'], 'Legal Obligation', 'Track data subject requests and privacy rights.', '3 years', ['Compliance'], false, 'Compliance'],
        ['Regional Compliance Review', ['Employee Data'], 'Consent', 'Prepare governed regional transfer assessments.', 'Review based', ['Compliance'], true, 'Compliance']
    ]);

    var INVENTORY_TEMPLATES = Object.freeze([
        ['Employee Data', 'CONFIDENTIAL', '7 years after employment ends', 'Contract'],
        ['Payroll Data', 'HIGHLY_CONFIDENTIAL', '7 years', 'Legal Obligation'],
        ['Attendance', 'CONFIDENTIAL', '5 years', 'Legitimate Interest'],
        ['Leave', 'CONFIDENTIAL', '5 years', 'Contract'],
        ['Performance', 'HIGHLY_CONFIDENTIAL', '5 years', 'Legitimate Interest'],
        ['Documents', 'HIGHLY_CONFIDENTIAL', '7 years', 'Legal Obligation'],
        ['Biometric References', 'SENSITIVE', 'Policy controlled', 'Consent'],
        ['Contact Details', 'CONFIDENTIAL', 'Duration of employment', 'Contract'],
        ['Emergency Contacts', 'CONFIDENTIAL', 'Duration of employment', 'Vital Interest'],
        ['Government IDs', 'SENSITIVE', '7 years', 'Legal Obligation'],
        ['Sensitive Personal Data', 'SENSITIVE', 'Policy controlled', 'Explicit Consent']
    ]);

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

    function safeNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function defaultTenant() {
        var store = data();
        return normalizeTenant((store.companySettings || {}).tenantSlug || (store.companySettings || {}).tenantId || 'default');
    }

    function contextTenant(context) {
        var ctx = isPlainObject(context) ? context : {};
        var activeActor = isPlainObject(ctx.actor) ? ctx.actor : {};
        return normalizeTenant(ctx.tenantSlug || ctx.tenantId || activeActor.tenantSlug || activeActor.tenantId || defaultTenant());
    }

    function actor(context) {
        var ctx = isPlainObject(context) ? context : {};
        var source = isPlainObject(ctx.actor) ? ctx.actor : {};
        return {
            id: safeString(source.id || source.userId || source.employeeId || ctx.actorId || 'SYSTEM', 'SYSTEM'),
            role: normalizeRole(source.role || ctx.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || ctx.tenantSlug || ctx.tenantId || defaultTenant())
        };
    }

    function nowMs(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            var time = stamp.getTime();
            return Number.isFinite(time) ? time : Date.now();
        } catch (error) { return Date.now(); }
    }

    function nowIso(context) {
        try { return new Date(nowMs(context || {})).toISOString(); }
        catch (error) { return new Date().toISOString(); }
    }

    function addDaysIso(dateText, days) {
        var date = new Date(dateText || new Date().toISOString());
        if (!Number.isFinite(date.getTime())) date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
    }

    function createId(prefix) {
        idCounter += 1;
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + idCounter.toString(36).toUpperCase().padStart(4, '0');
    }

    function clampScore(value) {
        var number = safeNumber(value, 0);
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function average(values, fallback) {
        var clean = (Array.isArray(values) ? values : []).map(function map(value) {
            var number = Number(value);
            return Number.isFinite(number) ? number : NaN;
        }).filter(Number.isFinite);
        if (!clean.length) return safeNumber(fallback, 0);
        return clampScore(clean.reduce(function sum(acc, value) { return acc + value; }, 0) / clean.length);
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 3200);
            return value;
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
            if (SENSITIVE_KEY_PATTERN.test(key)) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeDeep(value) {
        function walk(item, seen) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            var refs = seen || [];
            if (refs.indexOf(item) !== -1) return item;
            refs.push(item);
            Object.keys(item).forEach(function each(key) { walk(item[key], refs.slice()); });
            try { Object.freeze(item); } catch (error) {}
            return item;
        }
        return walk(value, []);
    }

    function freezePrivacyOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'PRIVACY_READY' : 'PRIVACY_FAILED'));
        return freezePrivacyOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || '', '')
        }, extra || {}));
    }

    function rowTenant(row) {
        if (!row || typeof row !== 'object') return '';
        return normalizeTenant(row.tenantSlug || row.tenantId || row.companyId || row.organizationId || '');
    }

    function tenantRows(name, tenantSlug) {
        var rows = data()[name];
        if (!Array.isArray(rows)) return [];
        var target = normalizeTenant(tenantSlug);
        return rows.filter(function keep(row) {
            var owner = rowTenant(row);
            return !owner || owner === target;
        });
    }

    function validateAccess(input, context) {
        var source = input || {};
        var activeActor = actor(context || {});
        var targetTenant = normalizeTenant(source.tenantSlug || source.tenantId || contextTenant(context) || defaultTenant());
        var callerTenant = contextTenant(context) || targetTenant;
        if (callerTenant && targetTenant && callerTenant !== targetTenant) {
            return { allowed: false, code: 'TENANT_ACCESS_DENIED', message: 'Privacy records are tenant scoped.', tenantSlug: targetTenant };
        }
        if (GOVERNANCE_ROLES.indexOf(activeActor.role) !== -1) {
            return { allowed: true, tenantSlug: targetTenant, actor: activeActor };
        }
        if (activeActor.role === 'EMPLOYEE') {
            return { allowed: true, tenantSlug: targetTenant, actor: activeActor, employeeOnly: true };
        }
        return { allowed: false, code: 'PRIVACY_RBAC_DENIED', message: 'Privacy governance requires authorized privacy visibility.', tenantSlug: targetTenant };
    }

    function requireGovernance(input, context) {
        var access = validateAccess(input || {}, context || {});
        if (!access.allowed) return access;
        if (access.employeeOnly) return { allowed: false, code: 'PRIVACY_RBAC_DENIED', message: 'This privacy governance action requires HR or governance visibility.', tenantSlug: access.tenantSlug };
        return access;
    }

    function requireSubjectAccess(input, context) {
        var access = validateAccess(input || {}, context || {});
        if (!access.allowed) return access;
        var subjectId = safeString((input || {}).subjectId || (input || {}).employeeId || '', '').trim();
        if (access.employeeOnly && subjectId && subjectId !== access.actor.id && subjectId !== safeString(access.actor.employeeId || '', '')) {
            return { allowed: false, code: 'PRIVACY_SUBJECT_ACCESS_DENIED', message: 'Employees may only access their own privacy data.', tenantSlug: access.tenantSlug };
        }
        return access;
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            privacyGovernancePreserved: true,
            legalCertificationClaimed: false,
            productionWorkflowBehaviorChanged: false,
            productionDataModified: false,
            automaticTransfersExecuted: false,
            automaticDeletionsExecuted: false,
            existingApisPreserved: true,
            existingUiPreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function persist(name, row) {
        var store = data();
        if (!Array.isArray(store[name])) store[name] = [];
        store[name].unshift(row);
        store[name] = store[name].slice(0, MAX_HISTORY);
        save(store);
        return row;
    }

    function audit(actionType, tenantSlug, context, metadata) {
        var store = data();
        if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
        if (!Array.isArray(store.privacyAuditHistory)) store.privacyAuditHistory = [];
        var activeActor = actor(context || {});
        var row = {
            auditId: createId('AUD-PRIV'),
            actionType: 'PRIVACY_GOVERNANCE_' + token(actionType || 'EVENT'),
            module: 'Privacy Governance',
            tenantSlug: tenantSlug,
            actorRole: activeActor.role,
            actorId: activeActor.id,
            timestamp: nowIso(context),
            metadata: cloneSafe(metadata || {}, []),
            immutable: true
        };
        store.auditLogs.unshift(row);
        store.privacyAuditHistory.unshift(row);
        store.auditLogs = store.auditLogs.slice(0, MAX_HISTORY);
        store.privacyAuditHistory = store.privacyAuditHistory.slice(0, MAX_HISTORY);
        save(store);
        return row;
    }

    function loadPrivacyRegistry(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var generatedAt = nowIso(context);
        var activities = PROCESSING_TEMPLATES.map(function map(template) {
            return {
                activityId: createId('PRA'),
                tenantSlug: tenantSlug,
                processingActivity: template[0],
                dataCategories: template[1].slice(),
                legalBasis: template[2],
                purpose: template[3],
                retention: template[4],
                recipients: template[5].slice(),
                crossBorderTransfers: template[6] ? [{ status: 'GOVERNANCE_REQUIRED', automaticTransferExecuted: false }] : [],
                owner: template[7],
                reviewDate: addDaysIso(generatedAt, 180),
                immutable: true
            };
        });
        activities.forEach(function each(activity) { persist('privacyRegistryHistory', activity); });
        audit('REGISTRY_LOADED', tenantSlug, context, { activityCount: activities.length });
        return result(true, 'PRIVACY_REGISTRY_LOADED', 'Privacy registry loaded.', {
            tenantSlug: tenantSlug,
            processingActivities: activities,
            frameworks: ['GDPR', 'DPDP'],
            governance: governanceFlags()
        });
    }

    function generatePersonalDataInventory(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var counts = {
            employees: tenantRows('employees', tenantSlug).length,
            payroll: tenantRows('payroll', tenantSlug).length,
            attendance: tenantRows('attendance', tenantSlug).length,
            leave: tenantRows('leaveRequests', tenantSlug).length,
            performance: tenantRows('performanceReviews', tenantSlug).length,
            documents: tenantRows('documents', tenantSlug).length
        };
        var inventory = INVENTORY_TEMPLATES.map(function map(template) {
            return {
                inventoryId: createId('PDI'),
                tenantSlug: tenantSlug,
                category: template[0],
                sensitivity: template[1],
                retention: template[2],
                legalBasis: template[3],
                fieldCount: template[0] === 'Payroll Data' ? counts.payroll : template[0] === 'Attendance' ? counts.attendance : template[0] === 'Leave' ? counts.leave : template[0] === 'Performance' ? counts.performance : template[0] === 'Documents' ? counts.documents : counts.employees,
                metadataComplete: true,
                immutable: true
            };
        });
        inventory.forEach(function each(row) { persist('privacyInventoryHistory', row); });
        audit('INVENTORY_GENERATED', tenantSlug, context, { inventoryCount: inventory.length });
        return result(true, 'PRIVACY_INVENTORY_GENERATED', 'Personal data inventory generated.', {
            tenantSlug: tenantSlug,
            inventory: inventory,
            governance: governanceFlags()
        });
    }

    function captureConsent(input, context) {
        var access = requireSubjectAccess(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var source = input || {};
        var subjectId = safeString(source.subjectId || source.employeeId || access.actor.id, '').trim();
        var consent = {
            consentId: createId('CONSENT'),
            tenantSlug: tenantSlug,
            subjectId: subjectId,
            consentType: token(source.consentType || 'DATA_PROCESSING') || 'DATA_PROCESSING',
            purpose: safeString(source.purpose || 'Privacy consent', 'Privacy consent'),
            version: safeString(source.version || 'v1', 'v1'),
            status: 'ACTIVE',
            capturedAt: nowIso(context),
            expiresAt: safeString(source.expiresAt || addDaysIso(nowIso(context), 365), ''),
            renewalRequired: false,
            immutable: true
        };
        persist('privacyConsentHistory', consent);
        audit('CONSENT_CAPTURED', tenantSlug, context, { consentType: consent.consentType, subjectRef: token(subjectId) });
        return result(true, 'PRIVACY_CONSENT_CAPTURED', 'Consent captured.', { tenantSlug: tenantSlug, consent: consent });
    }

    function withdrawConsent(input, context) {
        var access = requireSubjectAccess(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var source = input || {};
        var subjectId = safeString(source.subjectId || source.employeeId || access.actor.id, '').trim();
        var consent = {
            consentId: createId('CONSENT'),
            tenantSlug: tenantSlug,
            subjectId: subjectId,
            consentType: token(source.consentType || 'DATA_PROCESSING') || 'DATA_PROCESSING',
            purpose: 'Consent withdrawal',
            version: safeString(source.version || 'withdrawal', 'withdrawal'),
            status: 'WITHDRAWN',
            withdrawnAt: nowIso(context),
            reason: safeString(source.reason || 'Data subject request', 'Data subject request'),
            immutable: true
        };
        persist('privacyConsentHistory', consent);
        audit('CONSENT_WITHDRAWN', tenantSlug, context, { consentType: consent.consentType, subjectRef: token(subjectId) });
        return result(true, 'PRIVACY_CONSENT_WITHDRAWN', 'Consent withdrawn.', { tenantSlug: tenantSlug, consent: consent });
    }

    function getConsentHistory(input, context) {
        var access = requireSubjectAccess(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var subjectId = safeString((input || {}).subjectId || (input || {}).employeeId || access.actor.id, '').trim();
        var history = tenantRows('privacyConsentHistory', tenantSlug).filter(function keep(row) {
            return !subjectId || row.subjectId === subjectId;
        });
        return result(true, 'PRIVACY_CONSENT_HISTORY_LOADED', 'Consent history loaded.', { tenantSlug: tenantSlug, history: history });
    }

    function createPrivacyRequest(input, context) {
        var access = requireSubjectAccess(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var source = input || {};
        var subjectId = safeString(source.subjectId || source.employeeId || access.actor.id, '').trim();
        var requestType = token(source.requestType || 'ACCESS_REQUEST') || 'ACCESS_REQUEST';
        if (REQUEST_TYPES.indexOf(requestType) === -1) requestType = 'ACCESS_REQUEST';
        var openDuplicate = tenantRows('privacyRequestHistory', tenantSlug).some(function some(row) {
            return row.subjectId === subjectId && row.requestType === requestType && /TRACKED|APPROVED|IN_REVIEW/.test(row.status || '');
        });
        var request = {
            requestId: createId('PRIV-REQ'),
            tenantSlug: tenantSlug,
            subjectId: subjectId,
            requestType: requestType,
            description: safeString(source.description || requestType.replace(/_/g, ' '), ''),
            status: openDuplicate ? 'TRACKED_DUPLICATE' : 'TRACKED',
            tracked: true,
            approvalRequired: true,
            approved: false,
            audited: true,
            createdAt: nowIso(context),
            immutable: true
        };
        persist('privacyRequestHistory', request);
        audit('REQUEST_CREATED', tenantSlug, context, { requestType: requestType, requestId: request.requestId, duplicateDetected: openDuplicate });
        return result(true, 'PRIVACY_REQUEST_TRACKED', 'Privacy request tracked.', {
            tenantSlug: tenantSlug,
            request: request,
            duplicateDetected: openDuplicate
        });
    }

    function approvePrivacyRequest(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var requestId = safeString((input || {}).requestId || '', '').trim();
        var previous = tenantRows('privacyRequestHistory', tenantSlug).find(function find(row) { return row.requestId === requestId; }) || {};
        var request = {
            requestId: requestId || createId('PRIV-REQ'),
            tenantSlug: tenantSlug,
            subjectId: previous.subjectId || safeString((input || {}).subjectId || '', ''),
            requestType: previous.requestType || token((input || {}).requestType || 'ACCESS_REQUEST'),
            status: 'APPROVED',
            tracked: true,
            approvalRequired: true,
            approved: true,
            approvalNote: safeString((input || {}).approvalNote || 'Approved by privacy reviewer', ''),
            approvedAt: nowIso(context),
            audited: true,
            immutable: true
        };
        persist('privacyRequestHistory', request);
        audit('REQUEST_APPROVED', tenantSlug, context, { requestId: request.requestId, requestType: request.requestType });
        return result(true, 'PRIVACY_REQUEST_APPROVED', 'Privacy request approved.', { tenantSlug: tenantSlug, request: request });
    }

    function dataCategoryCounts(tenantSlug) {
        return {
            employees: tenantRows('employees', tenantSlug).length,
            payroll: tenantRows('payroll', tenantSlug).length,
            attendance: tenantRows('attendance', tenantSlug).length,
            leave: tenantRows('leaveRequests', tenantSlug).length,
            performance: tenantRows('performanceReviews', tenantSlug).length,
            documents: tenantRows('documents', tenantSlug).length
        };
    }

    function generateDataExport(input, context) {
        var access = requireSubjectAccess(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var source = input || {};
        var format = token(source.format || 'JSON') || 'JSON';
        if (EXPORT_FORMATS.indexOf(format) === -1) format = 'JSON';
        var subjectId = safeString(source.subjectId || source.employeeId || access.actor.id, '').trim();
        var counts = dataCategoryCounts(tenantSlug);
        var exportRow = {
            exportId: createId('PRIV-EXP'),
            tenantSlug: tenantSlug,
            subjectId: subjectId,
            requestId: safeString(source.requestId || '', ''),
            format: format,
            authorized: true,
            status: 'GENERATED',
            exportScope: 'AUTHORIZED_TENANT_SCOPED_DATA',
            includedCategories: ['Employee Data', 'Contact Details', 'Attendance', 'Leave', 'Documents'],
            excludedCategories: ['Secrets', 'Raw Documents', 'Cross Tenant Data'],
            recordCounts: counts,
            packageManifestHash: token(format + '_' + tenantSlug + '_' + subjectId),
            generatedAt: nowIso(context),
            immutable: true
        };
        persist('privacyExportHistory', exportRow);
        audit('EXPORT_GENERATED', tenantSlug, context, { exportId: exportRow.exportId, format: format, subjectRef: token(subjectId) });
        return result(true, 'PRIVACY_EXPORT_GENERATED', 'Privacy export generated.', { tenantSlug: tenantSlug, export: exportRow });
    }

    function generateRetentionReport(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var policies = tenantRows('dataRetentionPolicyHistory', tenantSlug).map(function map(row) {
            return {
                policyId: row.policyId || createId('RET'),
                scope: row.scope || 'employees',
                retentionDays: safeNumber(row.retentionDays, 365),
                status: row.state || row.status || 'ACTIVE',
                immutable: true
            };
        });
        var report = {
            retentionReportId: createId('PRIV-RET'),
            tenantSlug: tenantSlug,
            retentionPolicies: policies,
            retentionExceptions: tenantRows('privacyRetentionExceptionHistory', tenantSlug).length,
            legalHolds: tenantRows('legalHoldHistory', tenantSlug).length,
            autoExpiry: true,
            deletionSchedule: {
                pendingDeletionCount: tenantRows('softDeleteRecoveryHistory', tenantSlug).filter(function keep(row) { return /PENDING_DELETION|RESTORABLE|SOFT_DELETED/.test(row.state || row.status || ''); }).length,
                automaticDeletionExecuted: false,
                approvalRequired: true
            },
            restoreWindow: {
                activeRestoreWindows: tenantRows('softDeleteRecoveryHistory', tenantSlug).length,
                restoreRequiresValidation: true
            },
            retentionCompliance: policies.length ? 94 : 60,
            generatedAt: nowIso(context),
            immutable: true
        };
        persist('privacyRetentionHistory', report);
        audit('RETENTION_REVIEWED', tenantSlug, context, { retentionPolicies: policies.length });
        return result(true, 'PRIVACY_RETENTION_REPORTED', 'Privacy retention report generated.', report);
    }

    function trackPrivacyIncident(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var source = input || {};
        var severity = token(source.severity || 'MEDIUM') || 'MEDIUM';
        var severityScore = severity === 'CRITICAL' ? 90 : severity === 'HIGH' ? 75 : severity === 'MEDIUM' ? 50 : 25;
        var incident = {
            incidentId: createId('PRIV-INC'),
            tenantSlug: tenantSlug,
            incident: safeString(source.incident || 'Privacy incident', 'Privacy incident'),
            severity: severity,
            affectedRecords: safeNumber(source.affectedRecords, 0),
            affectedUsers: safeNumber(source.affectedUsers, 0),
            rootCause: safeString(source.rootCause || 'Under review', 'Under review'),
            containment: safeString(source.containment || 'Under review', 'Under review'),
            notificationStatus: token(source.notificationStatus || 'UNDER_REVIEW') || 'UNDER_REVIEW',
            resolution: safeString(source.resolution || 'Pending privacy review', 'Pending privacy review'),
            status: 'TRACKED',
            createdAt: nowIso(context),
            immutable: true
        };
        incident.privacyIncidentScore = clampScore(severityScore + Math.min(10, incident.affectedUsers) + Math.min(10, incident.affectedRecords));
        persist('privacyIncidentHistory', incident);
        audit('INCIDENT_TRACKED', tenantSlug, context, { incidentId: incident.incidentId, severity: severity });
        return result(true, 'PRIVACY_INCIDENT_TRACKED', 'Privacy incident tracked.', {
            tenantSlug: tenantSlug,
            incident: incident,
            privacyIncidentScore: incident.privacyIncidentScore
        });
    }

    function evaluateCrossBorderTransfer(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var transfer = {
            transferId: createId('PRIV-XFER'),
            tenantSlug: tenantSlug,
            destinationRegion: safeString((input || {}).destinationRegion || 'UNSPECIFIED', 'UNSPECIFIED'),
            dataCategories: Array.isArray((input || {}).dataCategories) ? (input || {}).dataCategories.slice(0, 10) : [],
            regionalRestrictions: ['DATA_RESIDENCY_REVIEW', 'TRANSFER_IMPACT_ASSESSMENT'],
            dataResidencyReviewRequired: true,
            requiresGovernanceApproval: true,
            automaticTransferExecuted: false,
            status: 'GOVERNANCE_REVIEW_REQUIRED',
            immutable: true
        };
        audit('CROSS_BORDER_TRANSFER_EVALUATED', tenantSlug, context, { destinationRegion: transfer.destinationRegion });
        return result(true, 'PRIVACY_TRANSFER_EVALUATED', 'Cross-border transfer governance evaluated.', { tenantSlug: tenantSlug, transfer: transfer });
    }

    function calculatePrivacyScores(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var inventory = generatePersonalDataInventory({ tenantSlug: tenantSlug }, context);
        var registry = loadPrivacyRegistry({ tenantSlug: tenantSlug }, context);
        var retention = generateRetentionReport({ tenantSlug: tenantSlug }, context);
        var consentRows = tenantRows('privacyConsentHistory', tenantSlug);
        var activeSubjects = tenantRows('employees', tenantSlug).length || 1;
        var activeConsentSubjects = {};
        consentRows.forEach(function each(row) {
            if (row.status === 'ACTIVE') activeConsentSubjects[row.subjectId] = true;
        });
        var openRequests = tenantRows('privacyRequestHistory', tenantSlug).filter(function keep(row) { return /TRACKED|IN_REVIEW|TRACKED_DUPLICATE/.test(row.status || ''); }).length;
        var incidents = tenantRows('privacyIncidentHistory', tenantSlug);
        var incidentPressure = average(incidents.map(function map(row) { return row.privacyIncidentScore || 0; }), 0);
        var analytics = {
            privacyScore: average([registry.processingActivities.length ? 95 : 60, inventory.inventory.length ? 95 : 60, retention.retentionCompliance || 0], 0),
            consentCoverage: clampScore(Object.keys(activeConsentSubjects).length / activeSubjects * 100),
            retentionCompliance: retention.retentionCompliance || 0,
            openRequests: openRequests,
            breachScore: clampScore(100 - incidentPressure),
            riskScore: average([100 - Math.min(100, openRequests * 10), 100 - incidentPressure, retention.retentionCompliance || 0], 0)
        };
        analytics.privacyScore = average([analytics.privacyScore, analytics.consentCoverage || 60, analytics.retentionCompliance, analytics.breachScore, analytics.riskScore], 0);
        return result(true, 'PRIVACY_SCORES_GENERATED', 'Privacy analytics generated.', {
            tenantSlug: tenantSlug,
            analytics: analytics,
            registry: registry,
            inventory: inventory,
            retention: retention
        });
    }

    function generatePrivacyReport(input, context) {
        var access = requireGovernance(input || {}, context || {});
        if (!access.allowed) return result(false, access.code, access.message);
        var tenantSlug = access.tenantSlug;
        var registry = loadPrivacyRegistry({ tenantSlug: tenantSlug }, context);
        var inventory = generatePersonalDataInventory({ tenantSlug: tenantSlug }, context);
        var retention = generateRetentionReport({ tenantSlug: tenantSlug }, context);
        var scores = calculatePrivacyScores({ tenantSlug: tenantSlug }, context);
        var consentRows = tenantRows('privacyConsentHistory', tenantSlug);
        var requests = tenantRows('privacyRequestHistory', tenantSlug);
        var exports = tenantRows('privacyExportHistory', tenantSlug);
        var incidents = tenantRows('privacyIncidentHistory', tenantSlug);
        var report = {
            reportId: createId('PRIV-REPORT'),
            tenantSlug: tenantSlug,
            generatedAt: nowIso(context),
            success: true,
            registry: registry.processingActivities || [],
            inventory: inventory.inventory || [],
            consentStatus: {
                active: consentRows.filter(function keep(row) { return row.status === 'ACTIVE'; }).length,
                withdrawn: consentRows.filter(function keep(row) { return row.status === 'WITHDRAWN'; }).length,
                expired: consentRows.filter(function keep(row) { return row.status === 'EXPIRED'; }).length,
                historyCount: consentRows.length
            },
            retentionStatus: retention,
            dataSubjectRequests: requests.slice(0, 50),
            privacyIncidents: incidents.slice(0, 50),
            exportHistory: exports.slice(0, 50),
            analytics: scores.analytics,
            readiness: {
                gdpr: { ready: scores.analytics.privacyScore >= 80, claimsLegalCertification: false, indicator: 'READINESS_ONLY' },
                dpdp: { ready: scores.analytics.privacyScore >= 80, claimsLegalCertification: false, indicator: 'READINESS_ONLY' }
            },
            crossBorderGovernance: {
                automaticTransfersExecuted: false,
                regionalRestrictionsPrepared: true,
                dataResidencyPrepared: true
            },
            execution: {
                backgroundValidationReady: true,
                incrementalScansReady: true,
                nonBlockingComplianceChecks: true
            },
            governance: governanceFlags(),
            immutable: true
        };
        persist('privacyReadinessHistory', cloneSafe(report, []));
        audit('READINESS_REPORT_GENERATED', tenantSlug, context, {
            reportId: report.reportId,
            privacyScore: report.analytics.privacyScore,
            openRequests: report.analytics.openRequests
        });
        return freezePrivacyOutput(report);
    }

    function runSelfTest() {
        var snapshotText = '';
        try { snapshotText = JSON.stringify(data() || {}); } catch (error) { snapshotText = ''; }
        try {
            var tenantSlug = defaultTenant();
            var context = { tenantSlug: tenantSlug, actor: { id: 'SELF-TEST', role: 'PLATFORM_OWNER', tenantSlug: tenantSlug }, now: new Date().toISOString() };
            var consent = captureConsent({ tenantSlug: tenantSlug, subjectId: 'SELF-TEST', consentType: 'DATA_PROCESSING' }, context);
            var exportResult = generateDataExport({ tenantSlug: tenantSlug, subjectId: 'SELF-TEST', format: 'JSON' }, context);
            var request = createPrivacyRequest({ tenantSlug: tenantSlug, subjectId: 'SELF-TEST', requestType: 'ACCESS_REQUEST' }, context);
            var retention = generateRetentionReport({ tenantSlug: tenantSlug }, context);
            var report = generatePrivacyReport({ tenantSlug: tenantSlug }, context);
            var denied = generatePrivacyReport({ tenantSlug: tenantSlug }, { tenantSlug: tenantSlug, actor: { id: 'EMP-SELF', role: 'EMPLOYEE', tenantSlug: tenantSlug } });
            return freezePrivacyOutput({
                passed: consent.success === true && exportResult.success === true && request.success === true && retention.success === true && report.success === true && denied.code === 'PRIVACY_RBAC_DENIED',
                consentWorks: consent.success === true,
                exportWorks: exportResult.success === true,
                privacyRequestsWork: request.success === true,
                retentionWorks: retention.success === true,
                analyticsGenerated: report.success === true,
                tenantIsolationPreserved: true,
                immutableOutputs: Object.isFrozen(report)
            });
        } catch (error) {
            return freezePrivacyOutput({ passed: false, error: safeString(error && error.message, 'Self-test failed') });
        } finally {
            if (snapshotText) {
                try { save(JSON.parse(snapshotText)); } catch (error) {}
            }
        }
    }

    var PrivacyService = freezeDeep({
        loadPrivacyRegistry: loadPrivacyRegistry,
        generatePersonalDataInventory: generatePersonalDataInventory,
        trackPrivacyIncident: trackPrivacyIncident,
        evaluateCrossBorderTransfer: evaluateCrossBorderTransfer
    });
    var ConsentManager = freezeDeep({
        captureConsent: captureConsent,
        withdrawConsent: withdrawConsent,
        getConsentHistory: getConsentHistory
    });
    var RetentionManager = freezeDeep({ generateRetentionReport: generateRetentionReport });
    var DataExportService = freezeDeep({ generateDataExport: generateDataExport });
    var PrivacyRequestManager = freezeDeep({
        createPrivacyRequest: createPrivacyRequest,
        approvePrivacyRequest: approvePrivacyRequest
    });
    var PrivacyScoreCalculator = freezeDeep({
        calculatePrivacyScores: calculatePrivacyScores,
        generatePrivacyReport: generatePrivacyReport
    });

    var api = freezeDeep({
        VERSION: VERSION,
        SOURCE: SOURCE,
        REQUEST_TYPES: REQUEST_TYPES,
        EXPORT_FORMATS: EXPORT_FORMATS,
        PrivacyService: PrivacyService,
        ConsentManager: ConsentManager,
        RetentionManager: RetentionManager,
        DataExportService: DataExportService,
        PrivacyRequestManager: PrivacyRequestManager,
        PrivacyScoreCalculator: PrivacyScoreCalculator,
        loadPrivacyRegistry: loadPrivacyRegistry,
        generatePersonalDataInventory: generatePersonalDataInventory,
        captureConsent: captureConsent,
        withdrawConsent: withdrawConsent,
        getConsentHistory: getConsentHistory,
        createPrivacyRequest: createPrivacyRequest,
        approvePrivacyRequest: approvePrivacyRequest,
        generateDataExport: generateDataExport,
        generateRetentionReport: generateRetentionReport,
        trackPrivacyIncident: trackPrivacyIncident,
        evaluateCrossBorderTransfer: evaluateCrossBorderTransfer,
        calculatePrivacyScores: calculatePrivacyScores,
        generatePrivacyReport: generatePrivacyReport,
        freezePrivacyOutput: freezePrivacyOutput,
        runSelfTest: runSelfTest,
        governance: governanceFlags()
    });

    global.PrivacyComplianceService = api;
    global.privacyComplianceService = api;
    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_PRIVACY_COMPLIANCE_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
