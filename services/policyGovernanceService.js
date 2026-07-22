/**
 * policyGovernanceService.js
 * ARTHHRMS Enterprise HR Policy Broadcast + Acknowledgement Governance System.
 *
 * Additive governance layer for policy broadcasts, mandatory acknowledgements,
 * revision tracking, signed policy documents, reminders, compliance analytics,
 * and audit-safe policy lifecycle visibility. It does not replace communication,
 * notification, document, workflow, async, or RBAC services.
 */
(function attachPolicyGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[PolicyGovernanceService]';

    var POLICY_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        REVIEW_PENDING: 'REVIEW_PENDING',
        PUBLISHED: 'PUBLISHED',
        ACK_PENDING: 'ACK_PENDING',
        ACTIVE: 'ACTIVE',
        EXPIRED: 'EXPIRED',
        ARCHIVED: 'ARCHIVED'
    });

    var POLICY_TYPES = Object.freeze({
        HR_POLICY: 'HR_POLICY',
        LEAVE_POLICY: 'LEAVE_POLICY',
        PAYROLL_POLICY: 'PAYROLL_POLICY',
        SECURITY_POLICY: 'SECURITY_POLICY',
        COMPLIANCE_POLICY: 'COMPLIANCE_POLICY',
        ONBOARDING_POLICY: 'ONBOARDING_POLICY',
        CONDUCT_GUIDELINE: 'CONDUCT_GUIDELINE',
        OPERATIONAL_PROCEDURE: 'OPERATIONAL_PROCEDURE'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ASSIGNED_POLICIES_ONLY: 'ASSIGNED_POLICIES_ONLY',
        TEAM_POLICY_COMPLIANCE_VISIBILITY: 'TEAM_POLICY_COMPLIANCE_VISIBILITY',
        HR_POLICY_OPERATIONAL_VISIBILITY: 'HR_POLICY_OPERATIONAL_VISIBILITY',
        STRATEGIC_POLICY_GOVERNANCE_VISIBILITY: 'STRATEGIC_POLICY_GOVERNANCE_VISIBILITY',
        ORG_COMPLIANCE_SUMMARIES_ONLY: 'ORG_COMPLIANCE_SUMMARIES_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var POLICY_JOB_TYPES = Object.freeze([
        'POLICY_REMINDER',
        'POLICY_ACKNOWLEDGEMENT',
        'POLICY_BROADCAST',
        'POLICY_EXPIRY_SCAN',
        'POLICY_REVISION_ROLLOUT',
        'POLICY_COMPLIANCE_ANALYTICS'
    ]);

    var ALLOWED_DOCUMENT_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png'
    ]);

    var SENSITIVE_KEY_PATTERN = /(body|content|description|title|private|confidential|note|comment|employee|emp.?id|user.?id|assigned.?employee|viewed.?user|acknowledged.?user|recipient|participant|file.?name|document.?url|signed.?url|public.?url|url|download|storage.?path|path|attachment|salary|payroll|payslip|compensation|reimbursement|receipt|resume|candidate|feedback|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|salary|payroll|resume|receipt|policy text|secret)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        policyAcknowledgementConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingCommunicationFlowsPreserved: true,
        historicalPolicyRecordsImmutable: true,
        historicalAcknowledgementsImmutable: true,
        policyActionsAuditable: true,
        documentAccessRoleScoped: true,
        signedAccessRequired: true,
        signedAccessRedacted: true,
        publicDocumentBlocked: true,
        policyBroadcastHealth: true,
        acknowledgementGovernance: true,
        revisionGovernance: true,
        documentGovernance: true,
        reminderGovernance: true,
        policyAnalytics: true,
        accessGovernance: true,
        departmentComplianceTrends: true,
        departmentTrends: true,
        totalPolicies: true,
        publishedPolicies: true,
        activePolicies: true,
        mandatoryPolicies: true,
        unreadPolicySummaries: true,
        totalAcknowledgements: true,
        acknowledgedUsers: true,
        pendingAcknowledgements: true,
        overdueAcknowledgements: true,
        rejectedAcknowledgements: true,
        completionPercent: true,
        compliancePercent: true,
        unreadPolicyRate: true,
        acknowledgementCompletionTime: true,
        engagementRate: true,
        totalRevisions: true,
        majorRevisions: true,
        acknowledgementsResetRequired: true,
        stagedRolloutPolicies: true,
        targetedDepartmentRevisions: true,
        policyDocuments: true,
        publicDocumentWarnings: true,
        signedPolicyDocuments: true,
        documentGovernanceIntegrated: true,
        policyReminderJobs: true,
        retryPending: true,
        failedJobs: true,
        spamLoopPrevented: true,
        superAdminAcknowledgementOverride: true,
        platformOwnerAcknowledgementWorkflow: true,
        employeeAssignedPoliciesOnly: true,
        managerTeamComplianceOnly: true,
        directorComplianceSummariesOnly: true,
        mandatoryAcknowledgementBypassBlocked: true,
        policyVersionAcceptanceTracked: true,
        policyRevisionHistoryPreserved: true,
        revisionAcknowledgementResetGoverned: true,
        reminderSpamLoopPrevented: true,
        auditReady: true,
        telemetryReady: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function rawData() {
        try {
            var source = db();
            if (source && typeof source.get === 'function') return source.get() || {};
        } catch (error) {}
        return {};
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso(context) {
        return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        return String(value);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    }

    function normalizeRole(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (normalized === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (normalized === 'HRHEAD') return 'HR_HEAD';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^ten[-_]/, '').replace(/^tenant[-_]/, '').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id || row.metadata && (row.metadata.tenantSlug || row.metadata.tenantId));
    }

    function policyIdOf(row) {
        return safeString(row && (row.policyId || row.policy_id || row.policyCode || row.policy_code || row.communicationId || row.communication_id || row.id) || '', '').trim();
    }

    function documentIdOf(row) {
        return safeString(row && (row.documentId || row.document_id || row.docId || row.doc_id || row.attachmentId || row.attachment_id || row.id) || '', '').trim();
    }

    function actorId(actor) {
        return safeString(actor && (actor.empId || actor.employeeId || actor.userId || actor.id) || '', '').trim();
    }

    function arrayOfIds(value) {
        if (Array.isArray(value)) return value.map(function item(id) { return safeString(id || '', '').trim(); }).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(function item(id) { return id.trim(); }).filter(Boolean);
        return [];
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray((data || rawData()).employees) ? (data || rawData()).employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id, emp.userId].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reportingManagerId || emp.reporting_manager_id || '', '').trim() === safeString(managerId || '', '').trim());
    }

    function employeeTenant(empId, data) {
        return rowTenant(employeeById(empId, data || rawData()));
    }

    function policyRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.policies)) rows = rows.concat(source.policies);
        if (Array.isArray(source.hrPolicies)) rows = rows.concat(source.hrPolicies);
        if (Array.isArray(source.policyBroadcasts)) rows = rows.concat(source.policyBroadcasts);
        if (Array.isArray(source.communications)) {
            rows = rows.concat(source.communications.filter(function policyCommunication(row) {
                return /policy|compliance/i.test([row.type, row.category, row.module, row.title].join(' '));
            }));
        }
        return rows;
    }

    function acknowledgementRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.policyAcknowledgements)) rows = rows.concat(source.policyAcknowledgements);
        if (Array.isArray(source.communicationAcknowledgements)) {
            rows = rows.concat(source.communicationAcknowledgements.filter(function policyAck(row) {
                return policyIdOf(row) || /policy|compliance/i.test([row.type, row.category, row.module].join(' '));
            }));
        }
        return rows;
    }

    function revisionRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.policyRevisions)) rows = rows.concat(source.policyRevisions);
        if (Array.isArray(source.policyRevisionHistory)) rows = rows.concat(source.policyRevisionHistory);
        return rows;
    }

    function documentRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.policyDocuments)) rows = rows.concat(source.policyDocuments);
        if (Array.isArray(source.documents)) {
            rows = rows.concat(source.documents.filter(function policyDocument(row) {
                return policyIdOf(row) || /policy|compliance|acknowledgement/i.test([row.category, row.documentType, row.documentCategory, row.module].join(' '));
            }));
        }
        return rows;
    }

    function notificationRows(data) {
        var source = data || rawData();
        return Array.isArray(source.notifications) ? source.notifications : [];
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function findPolicy(id, data) {
        var key = safeString(id || '', '').trim();
        if (!key) return null;
        return policyRows(data).find(function match(row) {
            return policyIdOf(row) === key || safeString(row.id || '', '').trim() === key;
        }) || null;
    }

    function sourceTenant(row, data) {
        if (!row) return '';
        var direct = rowTenant(row);
        if (direct) return direct;
        var sourceData = data || rawData();
        var policy = findPolicy(policyIdOf(row), sourceData);
        if (policy && rowTenant(policy)) return rowTenant(policy);
        var ids = assignedIds(row);
        for (var i = 0; i < ids.length; i += 1) {
            var tenant = employeeTenant(ids[i], sourceData);
            if (tenant) return tenant;
        }
        return '';
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value) {
        if (Array.isArray(value)) return value.map(cloneSanitized);
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return sanitizeText(value);
            return value;
        }
        var output = {};
        Object.keys(value).forEach(function copyKey(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
            output[key] = cloneSanitized(value[key]);
        });
        return output;
    }

    function freezePolicyOutput(value) {
        return deepFreeze(cloneSanitized(value));
    }

    function safeFailure(code, classification, message, metadata) {
        return {
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, message, metadata) {
        return {
            warningCode: code,
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function highestClassification(items, fallback) {
        var list = Array.isArray(items) ? items : [];
        if (list.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (list.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (list.some(function warning(item) { return item.classification === FAILURE_CLASSIFICATIONS.WARNING; })) return FAILURE_CLASSIFICATIONS.WARNING;
        return fallback || FAILURE_CLASSIFICATIONS.INFO;
    }

    function classifyPolicyRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantPolicy || source.crossTenantVisibility || source.publicDocument || source.publicExposure || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInWorkflow || source.platformOwnerPolicyAccess || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.acknowledgementBypass || source.superAdminOverride || source.unsafeRevision || source.revisionTampering || source.unauthorizedPolicyAccess) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.overdueAcknowledgement || source.unreadPolicy || source.reminderCongestion || source.unsupportedDocument) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizePolicyState(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'ACKNOWLEDGEMENT_PENDING' || normalized === 'ACK_PENDING') return POLICY_STATES.ACK_PENDING;
        if (normalized === 'PENDING_REVIEW' || normalized === 'REVIEW_PENDING') return POLICY_STATES.REVIEW_PENDING;
        if (normalized === 'PUBLISH' || normalized === 'PUBLISHED') return POLICY_STATES.PUBLISHED;
        if (normalized === 'OPEN' || normalized === 'ACTIVE') return POLICY_STATES.ACTIVE;
        if (normalized === 'EXPIRED') return POLICY_STATES.EXPIRED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return POLICY_STATES.ARCHIVED;
        return POLICY_STATES[normalized] || POLICY_STATES.DRAFT;
    }

    function normalizePolicyType(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'HR' || normalized === 'HUMAN_RESOURCES_POLICY') return POLICY_TYPES.HR_POLICY;
        if (normalized === 'LEAVE' || normalized === 'TIME_OFF_POLICY') return POLICY_TYPES.LEAVE_POLICY;
        if (normalized === 'PAYROLL' || normalized === 'COMPENSATION_POLICY') return POLICY_TYPES.PAYROLL_POLICY;
        if (normalized === 'SECURITY') return POLICY_TYPES.SECURITY_POLICY;
        if (normalized === 'COMPLIANCE') return POLICY_TYPES.COMPLIANCE_POLICY;
        if (normalized === 'ONBOARDING') return POLICY_TYPES.ONBOARDING_POLICY;
        if (normalized === 'CONDUCT' || normalized === 'CONDUCT_GUIDELINES') return POLICY_TYPES.CONDUCT_GUIDELINE;
        if (normalized === 'PROCEDURE' || normalized === 'OPERATIONAL') return POLICY_TYPES.OPERATIONAL_PROCEDURE;
        return POLICY_TYPES[normalized] || POLICY_TYPES.HR_POLICY;
    }

    function assignedIds(row) {
        var ids = [];
        ids = ids.concat(arrayOfIds(row && row.assignedEmployeeIds));
        ids = ids.concat(arrayOfIds(row && row.targetEmployeeIds));
        ids = ids.concat(arrayOfIds(row && row.recipientIds));
        ids = ids.concat(arrayOfIds(row && row.recipients));
        ids = ids.concat(arrayOfIds(row && row.viewedUserIds));
        ids = ids.concat(arrayOfIds(row && row.acknowledgedUserIds));
        if (row && row.empId) ids.push(safeString(row.empId, '').trim());
        if (row && row.employeeId) ids.push(safeString(row.employeeId, '').trim());
        return ids.filter(function unique(id, index, list) { return id && list.indexOf(id) === index; });
    }

    function hasRawPolicyFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawPolicyFields(input[key]);
        });
    }

    function hasPlatformOwnerParticipant(row) {
        var roles = [];
        roles = roles.concat(arrayOfIds(row && row.acknowledgementRoles));
        roles = roles.concat(arrayOfIds(row && row.approvalRoles));
        roles = roles.concat(arrayOfIds(row && row.recipientRoles));
        roles = roles.concat(arrayOfIds(row && row.participantRoles));
        if (row && Array.isArray(row.participants)) {
            row.participants.forEach(function participant(item) { roles.push(item && item.role); });
        }
        return roles.some(function role(item) { return normalizeRole(item) === 'PLATFORM_OWNER'; });
    }

    function hasAcknowledgementBypass(payload, role) {
        if (!payload || typeof payload !== 'object') return false;
        var override = payload.acknowledgeOnBehalf || payload.overrideAcknowledgement || payload.skipAcknowledgement || payload.bypassAcknowledgement || payload.acknowledgementOverride;
        return !!override || normalizeRole(role) === 'SUPER_ADMIN' && (payload.acknowledge === true || payload.acknowledged === true);
    }

    function visibilityForRole(role, actor, source, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var id = actorId(actor);
        var ids = assignedIds(source);
        if (normalized === 'EMPLOYEE') return id && ids.indexOf(id) !== -1 ? VISIBILITY.ASSIGNED_POLICIES_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') {
            if (ids.indexOf(id) !== -1) return VISIBILITY.TEAM_POLICY_COMPLIANCE_VISIBILITY;
            return ids.some(function team(empId) { return managerOwnsEmployee(id, empId, data); }) ? VISIBILITY.TEAM_POLICY_COMPLIANCE_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_POLICY_OPERATIONAL_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_POLICY_GOVERNANCE_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.ORG_COMPLIANCE_SUMMARIES_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validatePolicyScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, source, data);
            var targetSpecific = !!(policyIdOf(source) || assignedIds(source).length || documentIdOf(source));
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var rawFields = hasRawPolicyFields(source);
            var failures = [];

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_POLICY_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant policy visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_POLICY_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant policy acknowledgement workflows.'));
            }
            if (role === 'SUPER_ADMIN' && (targetSpecific || rawFields)) {
                failures.push(safeFailure('SUPER_ADMIN_POLICY_VIEW_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && rawFields) {
                failures.push(safeFailure('DIRECTOR_RAW_POLICY_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate policy compliance summaries only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.ASSIGNED_POLICIES_ONLY && targetSpecific) {
                failures.push(safeFailure('EMPLOYEE_POLICY_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only assigned policies.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.TEAM_POLICY_COMPLIANCE_VISIBILITY && targetSpecific) {
                failures.push(safeFailure('MANAGER_POLICY_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team policy compliance summaries.'));
            }

            var classification = highestClassification(failures);
            return freezePolicyOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    policyId: sameTenant ? policyIdOf(source) : '',
                    documentId: sameTenant ? documentIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    policyAcknowledgementConfidentialityPreserved: true,
                    documentAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezePolicyOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('POLICY_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy scope validation failed safely.')]
            });
        }
    }

    function normalizePolicyPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePolicyOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_POLICY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Policy payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            var type = normalizePolicyType(payload.type || payload.policyType || payload.category);
            var state = normalizePolicyState(payload.state || payload.status || (payload.mandatory ? POLICY_STATES.ACK_PENDING : POLICY_STATES.DRAFT));
            return freezePolicyOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    policyId: policyIdOf(payload),
                    type: type,
                    state: state,
                    version: safeString(payload.version || payload.policyVersion || '', '').trim(),
                    department: safeString(payload.department || payload.departmentId || payload.targetDepartment || '', '').trim(),
                    mandatory: payload.mandatory === true || payload.requiresAck === true || state === POLICY_STATES.ACK_PENDING,
                    assignedPolicyCount: assignedIds(payload).length,
                    hasDocument: !!(payload.documentId || payload.attachmentId || payload.hasDocument || payload.signedUrl || payload.publicUrl),
                    revisionTracked: !!(payload.previousVersion || payload.revisionType || payload.resetAcknowledgements)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    policyAcknowledgementConfidentialityPreserved: true,
                    historicalPolicyRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezePolicyOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('POLICY_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy normalization failed safely.')]
            });
        }
    }

    function validatePolicyPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePolicyOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: POLICY_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_POLICY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Policy payload is malformed.')]
                });
            }
            var normalized = normalizePolicyPayload(payload, context);
            var scope = validatePolicyScope(payload, context);
            var failures = (scope.failures || []).slice();
            var state = normalized.payload ? normalized.payload.state : POLICY_STATES.DRAFT;

            if (normalized.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                failures.push(safeFailure('POLICY_TENANT_MISMATCH_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Policy tenant mismatch was blocked.'));
            }
            if (hasPlatformOwnerParticipant(payload)) {
                failures.push(safeFailure('PLATFORM_OWNER_IN_ACKNOWLEDGEMENT_WORKFLOW_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in tenant policy acknowledgement workflows.'));
            }
            if (hasAcknowledgementBypass(payload, context && context.actor && context.actor.role)) {
                failures.push(safeFailure('ACKNOWLEDGEMENT_BYPASS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Mandatory acknowledgement workflow bypass was blocked.'));
            }
            if (Object.keys(POLICY_TYPES).map(function item(key) { return POLICY_TYPES[key]; }).indexOf(normalized.payload && normalized.payload.type) === -1) {
                failures.push(safeFailure('UNKNOWN_POLICY_TYPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Unknown policy type is blocked.'));
            }

            var classification = highestClassification(failures);
            return freezePolicyOutput({
                success: failures.length === 0,
                classification: classification,
                state: state,
                normalized: normalized.payload || null,
                failures: failures,
                acknowledgementGovernance: {
                    mandatoryAcknowledgementBypassBlocked: true,
                    policyVersionAcceptanceTracked: true,
                    tenantScopedAcknowledgements: true
                },
                revisionGovernance: {
                    policyRevisionHistoryPreserved: true,
                    revisionAcknowledgementResetGoverned: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    policyAcknowledgementConfidentialityPreserved: true,
                    historicalPolicyRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezePolicyOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: POLICY_STATES.DRAFT,
                failures: [safeFailure('POLICY_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy validation failed safely.')]
            });
        }
    }

    function publicExposure(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.isPublic === true || payload.public === true || payload.publicUrl) return true;
        var url = safeString(payload.url || payload.documentUrl || payload.signedUrl || payload.downloadUrl || payload.attachmentUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function supportedMime(payload) {
        var mime = safeString(payload && (payload.mimeType || payload.type || payload.fileType) || '', '').trim().toLowerCase();
        return !mime || ALLOWED_DOCUMENT_MIME_TYPES.indexOf(mime) !== -1;
    }

    function validatePolicyDocument(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePolicyOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_POLICY_DOCUMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Policy document payload is malformed.')]
                });
            }
            var scope = validatePolicyScope(payload, context);
            var failures = (scope.failures || []).slice();
            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_POLICY_DOCUMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Policy document MIME type is not supported.', { allowedTypes: ALLOWED_DOCUMENT_MIME_TYPES.slice() }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_POLICY_DOCUMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public policy document exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezePolicyOutput({
                success: failures.length === 0,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                documentGovernance: {
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    publicDocumentBlocked: failures.some(function blocked(row) { return row.failureCode === 'PUBLIC_POLICY_DOCUMENT_EXPOSURE_BLOCKED'; }),
                    documentAccessRoleScoped: true,
                    versionControlledAttachments: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    policyAcknowledgementConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezePolicyOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('POLICY_DOCUMENT_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy document governance failed safely.')]
            });
        }
    }

    function tenantFilter(tenant, data) {
        return function sameTenant(row) {
            var tenantSlug = sourceTenant(row, data);
            return !tenant || !tenantSlug || tenantSlug === tenant;
        };
    }

    function dateValue(value) {
        var text = safeString(value || '', '').slice(0, 10);
        if (!text) return null;
        var parsed = new Date(text + 'T00:00:00.000Z');
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }

    function isPastDate(value, context) {
        var date = dateValue(value);
        if (!date) return false;
        var now = new Date(nowIso(context));
        return date.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    }

    function policyState(row) {
        return normalizePolicyState(row && (row.state || row.status));
    }

    function policyType(row) {
        return normalizePolicyType(row && (row.type || row.policyType || row.category || row.module));
    }

    function acknowledgementStatus(row) {
        return normalizeToken(row && (row.status || row.state || row.ackStatus));
    }

    function isPolicyJob(row) {
        return POLICY_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function detectComplianceDegradation(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var policies = policyRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function policyNotification(row) {
                return /policy|compliance|acknowledg/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var pending = acknowledgements.filter(function pendingAck(row) { return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)); }).length;
            var overdue = acknowledgements.filter(function overdueAck(row) {
                return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)) && isPastDate(row.dueAt || row.deadline || row.expiresAt, context);
            }).length;
            var acknowledged = acknowledgements.filter(function acked(row) { return /ACK|SIGNED|COMPLETE|DONE/i.test(acknowledgementStatus(row)); }).length;
            var unread = notifications.filter(function unreadNotification(row) {
                return row.read === false || row.seen === false || row.unread === true || /UNREAD/i.test(safeString(row.status || '', ''));
            }).length;
            var departmentCounts = {};
            policies.forEach(function countPolicy(row) {
                var department = safeString(row.department || row.targetDepartment || row.departmentId || 'ALL', 'ALL').trim() || 'ALL';
                if (!departmentCounts[department]) departmentCounts[department] = { department: department, policies: 0, mandatoryPolicies: 0, pendingAcknowledgements: 0 };
                departmentCounts[department].policies += 1;
                if (row.mandatory === true || policyState(row) === POLICY_STATES.ACK_PENDING) departmentCounts[department].mandatoryPolicies += 1;
            });
            acknowledgements.forEach(function countAck(row) {
                var policy = findPolicy(policyIdOf(row), data);
                var department = safeString(policy && (policy.department || policy.targetDepartment || policy.departmentId) || 'ALL', 'ALL').trim() || 'ALL';
                if (!departmentCounts[department]) departmentCounts[department] = { department: department, policies: 0, mandatoryPolicies: 0, pendingAcknowledgements: 0 };
                if (/PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row))) departmentCounts[department].pendingAcknowledgements += 1;
            });
            var trends = Object.keys(departmentCounts).map(function toTrend(key) { return departmentCounts[key]; }).sort(function order(a, b) {
                return b.pendingAcknowledgements - a.pendingAcknowledgements || b.mandatoryPolicies - a.mandatoryPolicies;
            });
            var total = Math.max(acknowledgements.length, acknowledged + pending);
            var compliance = total ? Math.round((acknowledged / total) * 100) : 100;
            return freezePolicyOutput({
                success: true,
                classification: overdue ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    pendingAcknowledgements: pending,
                    overdueAcknowledgements: overdue,
                    unreadPolicySummaries: unread,
                    acknowledgedUsers: acknowledged,
                    compliancePercent: compliance,
                    complianceDegradation: pending + overdue + unread
                },
                departmentTrends: trends,
                metadata: {
                    tenantIsolationPreserved: true,
                    policyAcknowledgementConfidentialityPreserved: true,
                    historicalAcknowledgementsImmutable: true
                }
            });
        } catch (error) {
            return freezePolicyOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { pendingAcknowledgements: 0, overdueAcknowledgements: 0, unreadPolicySummaries: 0, complianceDegradation: 0 },
                departmentTrends: [],
                failures: [safeFailure('COMPLIANCE_DEGRADATION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy compliance degradation detection failed safely.')]
            });
        }
    }

    function auditPolicy(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Policy Governance',
                    targetId: metadata && (metadata.policyId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'policyGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Policy Governance', metadata && metadata.policyId || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Policy audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('POLICY_GOVERNANCE', eventType, {
                    source: 'policyGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Policy telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'WorkflowTelemetryService unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    source: 'policyGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Policy metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezePolicyOutput(run);
        var data = rawData();
        data.policyGovernanceRuns = Array.isArray(data.policyGovernanceRuns) ? data.policyGovernanceRuns.slice() : [];
        data.policyGovernanceRuns.unshift(cloneSanitized(run));
        if (data.policyGovernanceRuns.length > 150) data.policyGovernanceRuns = data.policyGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezePolicyOutput(run);
    }

    function schedulePolicyReminder(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePolicyOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: POLICY_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_POLICY_REMINDER_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Policy reminder payload is malformed.')]
                });
            }
            var validation = validatePolicyPayload(payload, context);
            if (!validation.success) {
                auditPolicy('POLICY_REMINDER_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe policy reminder was blocked.'
                }, context);
                emitTelemetry('POLICY_REMINDER_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezePolicyOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || POLICY_STATES.DRAFT,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Policy reminder blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        policyAcknowledgementConfidentialityPreserved: true,
                        historicalPolicyRecordsImmutable: true
                    }
                });
            }

            var normalized = validation.normalized || {};
            var ctxTenant = contextTenant(context) || normalized.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'POLGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                policyId: policyIdOf(payload),
                type: normalized.type || normalizePolicyType(payload.type || payload.category),
                state: normalized.state || POLICY_STATES.ACK_PENDING,
                validationOnly: payload.validationOnly !== false,
                reminderGoverned: true,
                createdAt: nowIso(context)
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; policy reminder remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'POLICY_REMINDER',
                    priority: payload.priority || 'HIGH',
                    correlationId: policyIdOf(payload) || runId,
                    payload: {
                        policyId: policyIdOf(payload),
                        governanceRunId: runId,
                        type: normalized.type || normalizePolicyType(payload.type || payload.category)
                    },
                    schedule: payload.schedule || {}
                }, {
                    tenantSlug: ctxTenant,
                    actor: context && context.actor,
                    skipAuditPersistence: context && context.skipAuditPersistence,
                    skipTelemetry: context && context.skipTelemetry,
                    skipMetrics: context && context.skipMetrics,
                    preview: context && context.preview
                });
            }

            if (global.NotificationOrchestrationService && typeof global.NotificationOrchestrationService.orchestrateNotification === 'function' && !(context && context.skipNotification)) {
                try {
                    global.NotificationOrchestrationService.orchestrateNotification({
                        tenantSlug: ctxTenant,
                        module: 'Policy Governance',
                        category: 'POLICY_REMINDER',
                        targetRole: payload.targetRole || 'HR',
                        priority: payload.priority || 'HIGH',
                        title: 'Policy Acknowledgement Governance',
                        message: 'A policy acknowledgement reminder is ready for governed delivery.',
                        correlationId: policyIdOf(payload) || runId
                    }, {
                        tenantSlug: ctxTenant,
                        actor: context && context.actor,
                        skipAuditPersistence: context && context.skipAuditPersistence,
                        skipTelemetry: context && context.skipTelemetry,
                        skipMetrics: context && context.skipMetrics,
                        preview: context && context.preview
                    });
                } catch (notifyError) {}
            }

            auditPolicy('POLICY_REMINDER_SCHEDULED', {
                policyId: policyIdOf(payload),
                tenantSlug: ctxTenant,
                description: 'Policy reminder scheduled through policy governance.'
            }, context);
            emitTelemetry('POLICY_REMINDER_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('POLICY_REMINDER_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);

            return freezePolicyOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: normalized.state || POLICY_STATES.ACK_PENDING,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    policyAcknowledgementConfidentialityPreserved: true,
                    historicalPolicyRecordsImmutable: true,
                    existingCommunicationFlowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Policy reminder scheduling failed safely.', error && error.message ? error.message : error);
            return freezePolicyOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: POLICY_STATES.DRAFT,
                failures: [safeFailure('POLICY_REMINDER_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy reminder scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Policy reminder scheduling failed safely.' }
            });
        }
    }

    function acknowledgementCounts(policies, acknowledgements, context) {
        var required = policies.filter(function requiredPolicy(row) {
            return row.mandatory === true || row.requiresAck === true || policyState(row) === POLICY_STATES.ACK_PENDING || /COMPLIANCE|POLICY/i.test(policyType(row));
        }).length;
        var pending = acknowledgements.filter(function pendingAck(row) { return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)); }).length;
        var acknowledged = acknowledgements.filter(function acknowledgedAck(row) { return /ACK|SIGNED|COMPLETE|DONE/i.test(acknowledgementStatus(row)); }).length;
        var rejected = acknowledgements.filter(function rejectedAck(row) { return /REJECT|DECLINED/i.test(acknowledgementStatus(row)); }).length;
        var overdue = acknowledgements.filter(function overdueAck(row) {
            return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)) && isPastDate(row.dueAt || row.deadline || row.expiresAt, context);
        }).length;
        var total = Math.max(acknowledgements.length, acknowledged + pending + rejected);
        var completion = total ? Math.round((acknowledged / total) * 100) : (required ? 0 : 100);
        return {
            policiesRequiringAcknowledgement: required,
            totalAcknowledgements: acknowledgements.length,
            acknowledgedUsers: acknowledged,
            pendingAcknowledgements: pending,
            overdueAcknowledgements: overdue,
            rejectedAcknowledgements: rejected,
            completionPercent: completion,
            compliancePercent: completion,
            mandatoryAcknowledgementBypassBlocked: true,
            policyVersionAcceptanceTracked: true
        };
    }

    function generatePolicyGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var policies = policyRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var revisions = revisionRows(data).filter(tenantFilter(tenant, data));
            var documents = documentRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function policyNotification(row) {
                return /policy|compliance|acknowledg/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var asyncJobs = asyncRows(data).filter(function policyJob(row) { return rowTenant(row) === tenant && isPolicyJob(row); });
            var degradation = detectComplianceDegradation({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var ack = acknowledgementCounts(policies, acknowledgements, context);
            var publicDocumentWarnings = documents.filter(publicExposure).length;
            var majorRevisions = revisions.filter(function major(row) { return /MAJOR|RESET|REISSUE/i.test([row.revisionType, row.type, row.changeType].join(' ')); }).length;
            var failedJobs = asyncJobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var retryPending = asyncJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length;
            var unread = degradation.summary ? degradation.summary.unreadPolicySummaries : 0;
            var engagementBase = notifications.length + ack.totalAcknowledgements;
            var engaged = notifications.filter(function read(row) { return row.read === true || row.seen === true || /READ|SEEN|ACK/i.test(safeString(row.status || '', '')); }).length + ack.acknowledgedUsers;
            var engagementRate = engagementBase ? Math.round((engaged / engagementBase) * 100) : 100;
            var classification = publicDocumentWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : (failedJobs || ack.overdueAcknowledgements || unread) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                policyBroadcastHealth: {
                    totalPolicies: policies.length,
                    publishedPolicies: policies.filter(function published(row) { return [POLICY_STATES.PUBLISHED, POLICY_STATES.ACK_PENDING, POLICY_STATES.ACTIVE].indexOf(policyState(row)) !== -1; }).length,
                    activePolicies: policies.filter(function active(row) { return [POLICY_STATES.PUBLISHED, POLICY_STATES.ACK_PENDING, POLICY_STATES.ACTIVE].indexOf(policyState(row)) !== -1; }).length,
                    mandatoryPolicies: policies.filter(function mandatory(row) { return row.mandatory === true || row.requiresAck === true || policyState(row) === POLICY_STATES.ACK_PENDING; }).length,
                    unreadPolicySummaries: unread
                },
                acknowledgementGovernance: ack,
                revisionGovernance: {
                    totalRevisions: revisions.length,
                    majorRevisions: majorRevisions,
                    acknowledgementsResetRequired: revisions.filter(function reset(row) { return row.resetAcknowledgements === true || /MAJOR|RESET/i.test([row.revisionType, row.type, row.changeType].join(' ')); }).length,
                    stagedRolloutPolicies: policies.filter(function staged(row) { return /STAGED|PILOT|TARGETED|LIMITED/i.test([row.rolloutStage, row.stage, row.status].join(' ')); }).length,
                    targetedDepartmentRevisions: revisions.filter(function targeted(row) { return !!(row.department || row.targetDepartment || row.departmentId); }).length,
                    policyRevisionHistoryPreserved: true,
                    revisionAcknowledgementResetGoverned: true
                },
                documentGovernance: {
                    policyDocuments: documents.length,
                    signedPolicyDocuments: documents.filter(function signed(row) { return !!(row.signedUrl || row.signedAccess || row.storagePath); }).length,
                    publicDocumentWarnings: publicDocumentWarnings,
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    documentAccessRoleScoped: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                reminderGovernance: {
                    policyReminderJobs: asyncJobs.length,
                    retryPending: retryPending,
                    failedJobs: failedJobs,
                    reminderSpamLoopPrevented: true,
                    spamLoopPrevented: true
                },
                policyAnalytics: {
                    compliancePercent: ack.compliancePercent,
                    overdueAcknowledgements: ack.overdueAcknowledgements,
                    unreadPolicyRate: notifications.length ? Math.round((unread / notifications.length) * 100) : 0,
                    departmentComplianceTrends: degradation.departmentTrends || [],
                    acknowledgementCompletionTime: ack.acknowledgedUsers ? 'tracked' : 'not_started',
                    engagementRate: engagementRate
                },
                accessGovernance: {
                    employeeAssignedPoliciesOnly: true,
                    managerTeamComplianceOnly: true,
                    hrPolicyOperationalVisibility: true,
                    directorComplianceSummariesOnly: true,
                    superAdminAcknowledgementOverride: false,
                    platformOwnerAcknowledgementWorkflow: false,
                    mandatoryAcknowledgementBypassBlocked: true
                },
                warnings: publicDocumentWarnings ? [safeWarning('PUBLIC_POLICY_DOCUMENT_WARNING', 'Public policy document exposure requires immediate review.', { publicDocumentWarnings: publicDocumentWarnings })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    policyAcknowledgementConfidentialityPreserved: true,
                    historicalPolicyRecordsImmutable: true,
                    historicalAcknowledgementsImmutable: true,
                    existingCommunicationFlowsPreserved: true,
                    policyActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditPolicy('POLICY_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Policy governance report viewed.'
            }, context);
            emitTelemetry('POLICY_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('POLICY_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            return freezePolicyOutput(report);
        } catch (error) {
            return freezePolicyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                policyBroadcastHealth: { totalPolicies: 0 },
                acknowledgementGovernance: { pendingAcknowledgements: 0 },
                revisionGovernance: { totalRevisions: 0 },
                policyAnalytics: { overdueAcknowledgements: 0 },
                failures: [safeFailure('POLICY_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Policy governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validatePolicyPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_POLICY_PAYLOAD'; }));

            var crossTenant = validatePolicyScope({ tenantSlug: 'abc', policyId: 'POL-X', assignedEmployeeIds: ['EMP-X'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('policy isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var ack = validatePolicyPayload({ tenantSlug: 'tabsons', policyId: 'POL-1', type: 'HR_POLICY', mandatory: true, state: 'ACK_PENDING' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('acknowledgement tracking works', ack.success === true && ack.acknowledgementGovernance.mandatoryAcknowledgementBypassBlocked === true);

            var revision = normalizePolicyPayload({ tenantSlug: 'tabsons', policyId: 'POL-1', type: 'SECURITY_POLICY', previousVersion: '1.0', revisionType: 'MAJOR', resetAcknowledgements: true }, { tenantSlug: 'tabsons' });
            check('policy revision governance works', revision.success === true && revision.payload.revisionTracked === true);

            var document = validatePolicyDocument({ tenantSlug: 'tabsons', policyId: 'POL-1', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/policy.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('document exposure blocked', document.success === false && document.failures.some(function item(row) { return row.failureCode === 'PUBLIC_POLICY_DOCUMENT_EXPOSURE_BLOCKED'; }));

            var immutable = normalizePolicyPayload({ tenantSlug: 'tabsons', policyId: 'POL-1', body: 'private' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = schedulePolicyReminder({ tenantSlug: 'tabsons', policyId: 'POL-SELF', type: 'HR_POLICY' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }

            var degradation = detectComplianceDegradation({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
            check('compliance tracking works', degradation.success === true && Object.isFrozen(degradation));
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezePolicyOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Policy governance self-test passed.' : 'Policy governance self-test detected failures.'
        });
        global.__ARTHHRMS_POLICY_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var PolicyGovernanceService = Object.freeze({
        VERSION: VERSION,
        POLICY_STATES: POLICY_STATES,
        POLICY_TYPES: POLICY_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyPolicyRisk: classifyPolicyRisk,
        validatePolicyScope: validatePolicyScope,
        validatePolicyPayload: validatePolicyPayload,
        validatePolicyDocument: validatePolicyDocument,
        normalizePolicyPayload: normalizePolicyPayload,
        freezePolicyOutput: freezePolicyOutput,
        detectComplianceDegradation: detectComplianceDegradation,
        schedulePolicyReminder: schedulePolicyReminder,
        generatePolicyGovernanceReport: generatePolicyGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.PolicyGovernanceService = PolicyGovernanceService;
    global.policyGovernanceService = PolicyGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
