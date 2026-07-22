/**
 * recruitmentGovernanceService.js
 * ARTHHRMS Enterprise Recruitment + Candidate Pipeline Governance System.
 *
 * Additive governance layer for job requisitions, candidate pipeline
 * visibility, interview workflows, resume/document controls, offer
 * governance, hiring analytics, and audit-safe recruitment operations.
 */
(function attachRecruitmentGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[RecruitmentGovernanceService]';

    var RECRUITMENT_STATES = Object.freeze({
        JOB_DRAFT: 'JOB_DRAFT',
        JOB_PUBLISHED: 'JOB_PUBLISHED',
        APPLICATION_RECEIVED: 'APPLICATION_RECEIVED',
        SCREENING: 'SCREENING',
        INTERVIEW_PENDING: 'INTERVIEW_PENDING',
        OFFER_PENDING: 'OFFER_PENDING',
        OFFER_ACCEPTED: 'OFFER_ACCEPTED',
        REJECTED: 'REJECTED',
        ONBOARDING_READY: 'ONBOARDING_READY',
        ARCHIVED: 'ARCHIVED'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_APPLICATION_ONLY: 'OWN_APPLICATION_ONLY',
        ASSIGNED_HIRING_VISIBILITY: 'ASSIGNED_HIRING_VISIBILITY',
        OPERATIONAL_RECRUITMENT_VISIBILITY: 'OPERATIONAL_RECRUITMENT_VISIBILITY',
        STRATEGIC_HIRING_VISIBILITY: 'STRATEGIC_HIRING_VISIBILITY',
        AGGREGATE_HIRING_ANALYTICS: 'AGGREGATE_HIRING_ANALYTICS',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var RECRUITMENT_JOB_TYPES = Object.freeze([
        'INTERVIEW_WORKFLOW',
        'RECRUITMENT_NOTIFICATION',
        'CANDIDATE_NOTIFICATION',
        'OFFER_WORKFLOW',
        'REQUISITION_APPROVAL',
        'HIRING_ANALYTICS'
    ]);

    var ALLOWED_DOCUMENT_MIME_TYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
    var SENSITIVE_KEY_PATTERN = /(candidate.?name|name|email|mobile|phone|resume|file.?name|storage.?path|signed.?url|public.?url|url|expected.?salary|offer.?compensation|compensation|salary|feedback|evaluation|score|note|private|confidential|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|\b(private|confidential|salary|compensation|resume|candidate)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        candidateConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingRecruitmentFlowsPreserved: true,
        historicalRecruitmentImmutable: true,
        recruitmentActionsAuditable: true,
        resumeAccessRoleScoped: true,
        secureResumeAccess: true,
        signedAccessRequired: true,
        signedAccessRedacted: true,
        requisitionGovernance: true,
        interviewGovernance: true,
        candidateDocumentGovernance: true,
        hiringAnalytics: true,
        offerGovernance: true,
        pipelineHealth: true,
        accessGovernance: true,
        asyncRecruitmentProcessing: true,
        superAdminResumeAccess: true,
        platformOwnerCandidateAccess: true,
        managerBypassBlocked: true
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
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id);
    }

    function applicationIdOf(row) {
        return safeString(row && (row.applicationId || row.application_id || row.id) || '', '').trim();
    }

    function candidateIdOf(row) {
        return safeString(row && (row.candidateId || row.candidate_id || row.userId || row.user_id || row.id) || '', '').trim();
    }

    function jobIdOf(row) {
        return safeString(row && (row.jobId || row.job_id || row.requisitionId || row.requisition_id || row.openingId || row.opening_id) || '', '').trim();
    }

    function interviewIdOf(row) {
        return safeString(row && (row.interviewId || row.interview_id || row.id) || '', '').trim();
    }

    function actorId(actor) {
        return safeString(actor && (actor.empId || actor.employeeId || actor.candidateId || actor.id) || '', '').trim();
    }

    function applicationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.jobApplications)) rows = rows.concat(source.jobApplications);
        if (Array.isArray(source.candidateApplications)) rows = rows.concat(source.candidateApplications);
        if (Array.isArray(source.recruitmentApplications)) rows = rows.concat(source.recruitmentApplications);
        return rows;
    }

    function jobRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.jobOpenings)) rows = rows.concat(source.jobOpenings);
        if (Array.isArray(source.jobRequisitions)) rows = rows.concat(source.jobRequisitions);
        if (Array.isArray(source.recruitmentRequisitions)) rows = rows.concat(source.recruitmentRequisitions);
        return rows;
    }

    function interviewRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.recruitmentInterviews)) rows = rows.concat(source.recruitmentInterviews);
        if (Array.isArray(source.interviewSchedules)) rows = rows.concat(source.interviewSchedules);
        if (Array.isArray(source.candidateInterviews)) rows = rows.concat(source.candidateInterviews);
        return rows;
    }

    function offerRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.recruitmentOffers)) rows = rows.concat(source.recruitmentOffers);
        if (Array.isArray(source.offerWorkflows)) rows = rows.concat(source.offerWorkflows);
        return rows;
    }

    function candidateDocumentRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.candidateDocuments)) rows = rows.concat(source.candidateDocuments);
        if (Array.isArray(source.documents)) rows = rows.concat(source.documents.filter(function candidateDoc(row) {
            return candidateIdOf(row) || /candidate|resume|portfolio/i.test([row.category, row.documentType, row.documentCategory].join(' '));
        }));
        return rows;
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function findApplication(applicationId, data) {
        var id = safeString(applicationId || '', '').trim();
        if (!id) return null;
        return applicationRows(data).find(function match(row) {
            return applicationIdOf(row) === id || safeString(row.id || '', '').trim() === id;
        }) || null;
    }

    function findJob(jobId, data) {
        var id = safeString(jobId || '', '').trim();
        if (!id) return null;
        return jobRows(data).find(function match(row) {
            return jobIdOf(row) === id || safeString(row.id || '', '').trim() === id || safeString(row.requisitionId || '', '').trim() === id;
        }) || null;
    }

    function findJobForApplication(source, data) {
        var application = findApplication(applicationIdOf(source), data) || source || {};
        return findJob(jobIdOf(application) || jobIdOf(source), data);
    }

    function sourceTenant(row, data) {
        if (!row) return '';
        var direct = rowTenant(row);
        if (direct) return direct;
        var sourceData = data || rawData();
        var app = findApplication(applicationIdOf(row), sourceData);
        if (app && rowTenant(app)) return rowTenant(app);
        var job = findJob(jobIdOf(row) || (app && jobIdOf(app)), sourceData);
        if (job && rowTenant(job)) return rowTenant(job);
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

    function freezeRecruitmentOutput(value) {
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

    function hasRawCandidateFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawCandidateFields(input[key]);
        });
    }

    function classifyHiringRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantCandidate || source.crossTenantRecruitment || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInRecruitment || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.hiringBypass || source.unsafeDirectHire || source.unauthorizedResumeAccess || source.superAdminResumeAccess) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedInterview || source.malformedPayload || source.interviewCongestion || source.delayedHiringStage || source.publicResumeWarning) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizeRecruitmentState(value, row) {
        var normalized = normalizeToken(value || row && (row.state || row.pipelineStage || row.status || row.stage));
        if (normalized === 'DRAFT') return RECRUITMENT_STATES.JOB_DRAFT;
        if (normalized === 'PUBLISHED' || normalized === 'OPEN') return RECRUITMENT_STATES.JOB_PUBLISHED;
        if (normalized === 'APPLIED' || normalized === 'APPLICATION' || normalized === 'APPLICATION_RECEIVED') return RECRUITMENT_STATES.APPLICATION_RECEIVED;
        if (normalized === 'SCREENING' || normalized === 'SCREEN') return RECRUITMENT_STATES.SCREENING;
        if (normalized === 'INTERVIEW' || normalized === 'INTERVIEWING' || normalized === 'INTERVIEW_PENDING') return RECRUITMENT_STATES.INTERVIEW_PENDING;
        if (normalized === 'OFFERED' || normalized === 'OFFER' || normalized === 'OFFER_PENDING') return RECRUITMENT_STATES.OFFER_PENDING;
        if (normalized === 'HIRED' || normalized === 'OFFER_ACCEPTED' || normalized === 'ACCEPTED') return RECRUITMENT_STATES.OFFER_ACCEPTED;
        if (normalized === 'ONBOARDING' || normalized === 'ONBOARDING_READY') return RECRUITMENT_STATES.ONBOARDING_READY;
        if (normalized === 'REJECTED') return RECRUITMENT_STATES.REJECTED;
        if (normalized === 'ARCHIVED') return RECRUITMENT_STATES.ARCHIVED;
        return row && jobIdOf(row) ? RECRUITMENT_STATES.APPLICATION_RECEIVED : RECRUITMENT_STATES.JOB_DRAFT;
    }

    function isTerminalCandidate(row) {
        var state = normalizeRecruitmentState(row && (row.state || row.pipelineStage || row.status), row);
        return [RECRUITMENT_STATES.OFFER_ACCEPTED, RECRUITMENT_STATES.REJECTED, RECRUITMENT_STATES.ONBOARDING_READY, RECRUITMENT_STATES.ARCHIVED].indexOf(state) !== -1;
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

    function managerAssigned(actor, source, data) {
        var id = actorId(actor);
        if (!id) return false;
        if ([source && source.hiringManagerId, source && source.managerId, source && source.interviewerId].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1) return true;
        var interviewers = Array.isArray(source && source.interviewers) ? source.interviewers : [];
        if (interviewers.map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1) return true;
        var app = findApplication(applicationIdOf(source), data);
        if (app && managerAssigned(actor, app, data)) return true;
        var job = findJobForApplication(source, data);
        if (job && [job.hiringManagerId, job.managerId, job.ownerId].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1) return true;
        return false;
    }

    function visibilityForRole(role, actor, source, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var targetCandidate = candidateIdOf(source);
        var actorCandidate = safeString(actor && (actor.candidateId || actor.id) || '', '').trim();
        if (normalized === 'CANDIDATE') {
            return actorCandidate && targetCandidate && actorCandidate === targetCandidate ? VISIBILITY.OWN_APPLICATION_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') return managerAssigned(actor, source, data) ? VISIBILITY.ASSIGNED_HIRING_VISIBILITY : VISIBILITY.NONE;
        if (normalized === 'HR') return VISIBILITY.OPERATIONAL_RECRUITMENT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_HIRING_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_HIRING_ANALYTICS;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateRecruitmentScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, source, data);
            var targetSpecific = !!(candidateIdOf(source) || applicationIdOf(source) || interviewIdOf(source) || jobIdOf(source));
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var failures = [];

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_CANDIDATE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant candidate visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_RECRUITMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from candidate and hiring hierarchy.'));
            }
            if (role === 'SUPER_ADMIN' && (targetSpecific || hasRawCandidateFields(source))) {
                failures.push(safeFailure('SUPER_ADMIN_RESUME_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && hasRawCandidateFields(source)) {
                failures.push(safeFailure('DIRECTOR_RAW_CANDIDATE_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate hiring analytics only.'));
            }
            if (role === 'CANDIDATE' && visibility !== VISIBILITY.OWN_APPLICATION_ONLY) {
                failures.push(safeFailure('CANDIDATE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Candidates may access only their own applications.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.ASSIGNED_HIRING_VISIBILITY) {
                failures.push(safeFailure('MANAGER_HIRING_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access assigned hiring pipelines only.'));
            }

            var classification = highestClassification(failures);
            return freezeRecruitmentOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    candidateId: sameTenant ? candidateIdOf(source) : '',
                    applicationId: sameTenant ? applicationIdOf(source) : '',
                    jobId: sameTenant ? jobIdOf(source) : '',
                    interviewId: sameTenant ? interviewIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    candidateConfidentialityPreserved: true,
                    resumeAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeRecruitmentOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('RECRUITMENT_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Recruitment scope validation failed safely.')]
            });
        }
    }

    function normalizeCandidatePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeRecruitmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_CANDIDATE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Candidate payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            return freezeRecruitmentOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    applicationId: applicationIdOf(payload),
                    candidateId: candidateIdOf(payload),
                    jobId: jobIdOf(payload),
                    recruiterId: safeString(payload.recruiterId || payload.recruiter_id || '', '').trim(),
                    hiringManagerId: safeString(payload.hiringManagerId || payload.hiring_manager_id || payload.managerId || '', '').trim(),
                    state: normalizeRecruitmentState(payload.state || payload.pipelineStage || payload.status, payload),
                    hasResume: !!(payload.resumeFileName || payload.resume || payload.resumeUrl || payload.storagePath),
                    hasOffer: !!(payload.offerId || payload.offerCompensation || payload.offerApprovalStatus)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    candidateConfidentialityPreserved: true,
                    historicalRecruitmentImmutable: true
                }
            });
        } catch (error) {
            return freezeRecruitmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('CANDIDATE_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Candidate normalization failed safely.')]
            });
        }
    }

    function workflowChain(payload) {
        var chain = [];
        if (Array.isArray(payload && payload.interviewPanel)) chain = chain.concat(payload.interviewPanel);
        if (Array.isArray(payload && payload.approvalChain)) chain = chain.concat(payload.approvalChain);
        if (Array.isArray(payload && payload.reviewers)) chain = chain.concat(payload.reviewers);
        return chain;
    }

    function validateInterviewWorkflow(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeRecruitmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: RECRUITMENT_STATES.INTERVIEW_PENDING,
                    failures: [safeFailure('MALFORMED_INTERVIEW_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Interview workflow payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(payload, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var normalizedState = normalizeRecruitmentState(payload.state || payload.pipelineStage || payload.status || RECRUITMENT_STATES.INTERVIEW_PENDING, payload);
            var failures = [];
            var scope = validateRecruitmentScope(payload, context);
            failures = failures.concat(scope.failures || []);

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Interview workflow tenant mismatch was blocked.', { expectedTenant: ctxTenant }));
            }
            if (Object.keys(RECRUITMENT_STATES).map(function key(k) { return RECRUITMENT_STATES[k]; }).indexOf(normalizedState) === -1) {
                failures.push(safeFailure('INVALID_RECRUITMENT_STATE', FAILURE_CLASSIFICATIONS.WARNING, 'Recruitment state is not supported.'));
            }
            if (role === 'MANAGER' && (normalizedState === RECRUITMENT_STATES.OFFER_ACCEPTED || payload.directHire === true || payload.skipOfferApproval === true || payload.hiringDecisionApproved === true)) {
                failures.push(safeFailure('UNSAFE_HIRING_WORKFLOW_BYPASS', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager direct hiring approval is blocked.'));
            }
            if (role === 'MANAGER' && scope.visibility !== VISIBILITY.ASSIGNED_HIRING_VISIBILITY) {
                failures.push(safeFailure('MANAGER_ASSIGNED_HIRING_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager interview workflow requires assigned hiring scope.'));
            }
            workflowChain(payload).forEach(function validatePanel(item) {
                var panelRole = normalizeRole(item && item.role);
                if (panelRole === 'PLATFORM_OWNER') {
                    failures.push(safeFailure('PLATFORM_OWNER_IN_RECRUITMENT_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in recruitment workflow chains.'));
                } else if (panelRole && ['CANDIDATE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN'].indexOf(panelRole) === -1) {
                    failures.push(safeFailure('UNKNOWN_INTERVIEW_ROLE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Unknown interview workflow role is blocked.'));
                }
            });

            var classification = highestClassification(failures);
            return freezeRecruitmentOutput({
                success: failures.length === 0,
                classification: classification,
                state: normalizedState,
                normalized: normalizeCandidatePayload(payload, context).payload || null,
                failures: failures,
                workflowGovernance: {
                    managerBypassBlocked: true,
                    offerApprovalRequired: true,
                    interviewSchedulingGoverned: true,
                    recruitmentActionsAuditable: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    candidateConfidentialityPreserved: true,
                    historicalRecruitmentImmutable: true
                }
            });
        } catch (error) {
            return freezeRecruitmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: RECRUITMENT_STATES.INTERVIEW_PENDING,
                failures: [safeFailure('INTERVIEW_WORKFLOW_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Interview workflow validation failed safely.')]
            });
        }
    }

    function publicExposure(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.isPublic === true || payload.public === true || payload.publicUrl) return true;
        var url = safeString(payload.url || payload.resumeUrl || payload.signedUrl || payload.documentUrl || payload.downloadUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function supportedMime(payload) {
        var mime = safeString(payload && (payload.mimeType || payload.type || payload.fileType) || '', '').trim().toLowerCase();
        return !mime || ALLOWED_DOCUMENT_MIME_TYPES.indexOf(mime) !== -1;
    }

    function validateCandidateDocumentGovernance(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeRecruitmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_CANDIDATE_DOCUMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Candidate document payload is malformed.')]
                });
            }
            var scope = validateRecruitmentScope(payload, context);
            var failures = (scope.failures || []).slice();
            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_CANDIDATE_DOCUMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Candidate document MIME type is not supported.', { allowedTypes: ALLOWED_DOCUMENT_MIME_TYPES.slice() }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_RESUME_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public resume exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezeRecruitmentOutput({
                success: failures.length === 0,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                documentGovernance: {
                    secureResumeAccess: failures.length === 0,
                    resumeAccessRoleScoped: true,
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    candidateDocumentRetentionGoverned: true
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    candidateConfidentialityPreserved: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                }
            });
        } catch (error) {
            return freezeRecruitmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('CANDIDATE_DOCUMENT_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Candidate document governance failed safely.')]
            });
        }
    }

    function tenantFilter(tenant, data) {
        return function sameTenant(row) {
            var tenantSlug = sourceTenant(row, data);
            return !tenant || !tenantSlug || tenantSlug === tenant;
        };
    }

    function isRecruitmentJob(row) {
        return RECRUITMENT_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function detectHiringBottlenecks(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var applications = applicationRows(data).filter(tenantFilter(tenant, data));
            var jobs = jobRows(data).filter(tenantFilter(tenant, data));
            var interviews = interviewRows(data).filter(tenantFilter(tenant, data));
            var recruiters = {};
            var interviewCongestion = interviews.filter(function pendingInterview(row) {
                return /PENDING|SCHEDULED|NO_SHOW|RESCHEDULE/i.test(safeString(row.status || row.state || '', '')) && isPastDate(row.scheduledAt || row.interviewDate || row.date || '', context);
            }).length;
            var delayedHiringStages = applications.filter(function delayed(row) {
                return !isTerminalCandidate(row) && (isPastDate(row.interviewDate || row.stageUpdatedOn || row.appliedOn || '', context));
            }).length + jobs.filter(function expired(job) {
                return /PUBLISHED|OPEN|APPROVED/i.test(safeString(job.status || job.state || '', '')) && isPastDate(job.expiresOn || job.expiryDate || '', context);
            }).length;
            applications.forEach(function countRecruiter(row) {
                var recruiterId = safeString(row.recruiterId || row.recruiter_id || 'UNASSIGNED', 'UNASSIGNED').trim() || 'UNASSIGNED';
                if (!recruiters[recruiterId]) recruiters[recruiterId] = { recruiterId: recruiterId, activeApplications: 0, interviews: 0, offers: 0, delayedStages: 0 };
                recruiters[recruiterId].activeApplications += isTerminalCandidate(row) ? 0 : 1;
                recruiters[recruiterId].interviews += normalizeRecruitmentState(row.state || row.pipelineStage || row.status, row) === RECRUITMENT_STATES.INTERVIEW_PENDING ? 1 : 0;
                recruiters[recruiterId].offers += normalizeRecruitmentState(row.state || row.pipelineStage || row.status, row) === RECRUITMENT_STATES.OFFER_PENDING ? 1 : 0;
                if (!isTerminalCandidate(row) && isPastDate(row.interviewDate || row.stageUpdatedOn || row.appliedOn || '', context)) recruiters[recruiterId].delayedStages += 1;
            });
            var recruiterList = Object.keys(recruiters).map(function toRow(id) {
                var row = recruiters[id];
                var high = row.activeApplications >= 10 || row.delayedStages >= 3;
                var warning = row.activeApplications >= 2 || row.interviews > 0 || row.offers > 0 || row.delayedStages > 0;
                return {
                    recruiterId: row.recruiterId,
                    activeApplications: row.activeApplications,
                    interviewQueue: row.interviews,
                    offerQueue: row.offers,
                    delayedStages: row.delayedStages,
                    classification: high ? FAILURE_CLASSIFICATIONS.HIGH_RISK : warning ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
                };
            }).sort(function order(a, b) {
                return (b.activeApplications + b.delayedStages) - (a.activeApplications + a.delayedStages);
            });
            return freezeRecruitmentOutput({
                success: true,
                classification: interviewCongestion || delayedHiringStages ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    activeApplications: applications.filter(function active(row) { return !isTerminalCandidate(row); }).length,
                    interviewCongestion: interviewCongestion,
                    delayedHiringStages: delayedHiringStages,
                    recruiterWorkload: recruiterList.filter(function busy(row) { return row.activeApplications > 0; }).length,
                    requisitionBottlenecks: jobs.filter(function blocked(row) { return /PENDING|BLOCKED|EXPIRED/i.test([row.approvalStatus, row.status, row.state].join(' ')); }).length
                },
                recruiters: recruiterList,
                metadata: {
                    tenantIsolationPreserved: true,
                    candidateConfidentialityPreserved: true,
                    historicalRecruitmentImmutable: true
                }
            });
        } catch (error) {
            return freezeRecruitmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { activeApplications: 0, interviewCongestion: 0, delayedHiringStages: 0, recruiterWorkload: 0 },
                recruiters: [],
                failures: [safeFailure('HIRING_BOTTLENECK_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Hiring bottleneck detection failed safely.')]
            });
        }
    }

    function auditRecruitment(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Recruitment Governance',
                    targetId: metadata && (metadata.applicationId || metadata.jobId || metadata.interviewId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'recruitmentGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Recruitment Governance', metadata && (metadata.applicationId || metadata.jobId || metadata.interviewId) || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Recruitment audit failed safely.' };
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
                service.emitTelemetry('RECRUITMENT_GOVERNANCE', eventType, {
                    source: 'recruitmentGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Recruitment telemetry failed safely.' };
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
                    source: 'recruitmentGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Recruitment metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezeRecruitmentOutput(run);
        var data = rawData();
        data.recruitmentGovernanceRuns = Array.isArray(data.recruitmentGovernanceRuns) ? data.recruitmentGovernanceRuns.slice() : [];
        data.recruitmentGovernanceRuns.unshift(cloneSanitized(run));
        if (data.recruitmentGovernanceRuns.length > 150) data.recruitmentGovernanceRuns = data.recruitmentGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezeRecruitmentOutput(run);
    }

    function scheduleInterviewWorkflow(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeRecruitmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: RECRUITMENT_STATES.INTERVIEW_PENDING,
                    failures: [safeFailure('MALFORMED_INTERVIEW_WORKFLOW_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Interview workflow payload is malformed.')]
                });
            }
            var validation = validateInterviewWorkflow({ state: RECRUITMENT_STATES.INTERVIEW_PENDING, interviewPanel: [{ role: 'HR' }], ...payload }, context);
            if (!validation.success) {
                auditRecruitment('INTERVIEW_WORKFLOW_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe interview workflow was blocked.'
                }, context);
                emitTelemetry('INTERVIEW_WORKFLOW_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezeRecruitmentOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || RECRUITMENT_STATES.INTERVIEW_PENDING,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Interview workflow blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        candidateConfidentialityPreserved: true,
                        historicalRecruitmentImmutable: true
                    }
                });
            }

            var ctxTenant = contextTenant(context) || validation.normalized && validation.normalized.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'RECGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                applicationId: applicationIdOf(payload),
                interviewId: interviewIdOf(payload),
                jobId: jobIdOf(payload),
                candidateId: candidateIdOf(payload),
                state: RECRUITMENT_STATES.INTERVIEW_PENDING,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(context),
                interviewWorkflowGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; interview workflow remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'INTERVIEW_WORKFLOW',
                    priority: 'HIGH',
                    correlationId: applicationIdOf(payload) || interviewIdOf(payload) || runId,
                    payload: {
                        applicationId: applicationIdOf(payload),
                        interviewId: interviewIdOf(payload),
                        jobId: jobIdOf(payload),
                        candidateId: candidateIdOf(payload),
                        governanceRunId: runId
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
                        module: 'Recruitment',
                        category: 'INTERVIEW_WORKFLOW',
                        targetRole: 'HR',
                        priority: 'HIGH',
                        title: 'Interview Workflow Governance',
                        message: 'An interview workflow item is ready for governed recruitment review.',
                        correlationId: applicationIdOf(payload) || interviewIdOf(payload) || runId
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

            auditRecruitment('INTERVIEW_WORKFLOW_SCHEDULED', {
                applicationId: applicationIdOf(payload),
                interviewId: interviewIdOf(payload),
                tenantSlug: ctxTenant,
                description: 'Interview workflow scheduled through recruitment governance.'
            }, context);
            emitTelemetry('INTERVIEW_WORKFLOW_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('INTERVIEW_WORKFLOW_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);

            return freezeRecruitmentOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: RECRUITMENT_STATES.INTERVIEW_PENDING,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    candidateConfidentialityPreserved: true,
                    historicalRecruitmentImmutable: true,
                    existingRecruitmentFlowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Interview workflow scheduling failed safely.', error && error.message ? error.message : error);
            return freezeRecruitmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: RECRUITMENT_STATES.INTERVIEW_PENDING,
                failures: [safeFailure('INTERVIEW_WORKFLOW_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Interview workflow scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Interview workflow scheduling failed safely.' }
            });
        }
    }

    function countByState(applications) {
        var counts = {
            applicationReceived: applications.length,
            screening: 0,
            interviewPending: 0,
            offerPending: 0,
            offerAccepted: 0,
            rejected: 0,
            onboardingReady: 0
        };
        applications.forEach(function count(row) {
            var state = normalizeRecruitmentState(row.state || row.pipelineStage || row.status, row);
            if (state === RECRUITMENT_STATES.SCREENING) counts.screening += 1;
            else if (state === RECRUITMENT_STATES.INTERVIEW_PENDING) counts.interviewPending += 1;
            else if (state === RECRUITMENT_STATES.OFFER_PENDING) counts.offerPending += 1;
            else if (state === RECRUITMENT_STATES.OFFER_ACCEPTED) counts.offerAccepted += 1;
            else if (state === RECRUITMENT_STATES.REJECTED) counts.rejected += 1;
            else if (state === RECRUITMENT_STATES.ONBOARDING_READY) counts.onboardingReady += 1;
        });
        return counts;
    }

    function generateRecruitmentGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var applications = applicationRows(data).filter(tenantFilter(tenant, data));
            var jobs = jobRows(data).filter(tenantFilter(tenant, data));
            var interviews = interviewRows(data).filter(tenantFilter(tenant, data));
            var offers = offerRows(data).filter(tenantFilter(tenant, data));
            var docs = candidateDocumentRows(data).filter(tenantFilter(tenant, data));
            var asyncJobs = asyncRows(data).filter(function recJob(row) { return rowTenant(row) === tenant && isRecruitmentJob(row); });
            var funnel = countByState(applications);
            var bottlenecks = detectHiringBottlenecks({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var publicResumeWarnings = docs.filter(publicExposure).length;
            var failedJobs = asyncJobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var pendingInterviews = interviews.filter(function pending(row) { return /PENDING|SCHEDULED|RESCHEDULE/i.test(safeString(row.status || row.state || '', '')); }).length;
            var pendingOffers = offers.filter(function pending(row) { return /PENDING|REVIEW|APPROVAL/i.test([row.status, row.state, row.approvalStatus].join(' ')); }).length + funnel.offerPending;
            var classification = publicResumeWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : (failedJobs || bottlenecks.summary && (bottlenecks.summary.interviewCongestion || bottlenecks.summary.delayedHiringStages)) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                pipelineHealth: {
                    totalApplications: applications.length,
                    applicationReceived: funnel.applicationReceived,
                    screening: funnel.screening,
                    interviewPending: funnel.interviewPending,
                    offerPending: funnel.offerPending,
                    offerAccepted: funnel.offerAccepted,
                    rejected: funnel.rejected,
                    onboardingReady: funnel.onboardingReady
                },
                requisitionGovernance: {
                    totalRequisitions: jobs.length,
                    publishedJobs: jobs.filter(function published(row) { return /PUBLISHED|OPEN|APPROVED/i.test([row.state, row.status, row.approvalStatus].join(' ')); }).length,
                    draftJobs: jobs.filter(function draft(row) { return normalizeRecruitmentState(row.state || row.status, row) === RECRUITMENT_STATES.JOB_DRAFT; }).length,
                    approvalPending: jobs.filter(function pending(row) { return /PENDING|REVIEW/i.test(safeString(row.approvalStatus || '', '')); }).length,
                    expiredRequisitions: jobs.filter(function expired(row) { return isPastDate(row.expiresOn || row.expiryDate || '', context); }).length,
                    hiringLimitsGoverned: true,
                    requisitionApprovalsRequired: true
                },
                interviewGovernance: {
                    totalInterviews: interviews.length,
                    pendingInterviews: pendingInterviews,
                    interviewCongestion: bottlenecks.summary ? bottlenecks.summary.interviewCongestion : 0,
                    delayedHiringStages: bottlenecks.summary ? bottlenecks.summary.delayedHiringStages : 0,
                    escalationRemindersReady: true,
                    directHiringBypassBlocked: true
                },
                candidateDocumentGovernance: {
                    candidateDocuments: docs.length,
                    resumeAccessRoleScoped: true,
                    secureResumeAccess: publicResumeWarnings === 0,
                    publicResumeWarnings: publicResumeWarnings,
                    signedAccessRequired: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                offerGovernance: {
                    pendingOffers: pendingOffers,
                    acceptedOffers: funnel.offerAccepted,
                    onboardingReadyCandidates: funnel.onboardingReady,
                    offerApprovalRequired: true,
                    compensationReviewWorkflowRequired: true,
                    unsafeOnboardingActivationBlocked: true
                },
                hiringAnalytics: {
                    funnelConversion: funnel,
                    recruiterWorkload: bottlenecks.summary ? bottlenecks.summary.recruiterWorkload : 0,
                    interviewCongestion: bottlenecks.summary ? bottlenecks.summary.interviewCongestion : 0,
                    delayedHiringStages: bottlenecks.summary ? bottlenecks.summary.delayedHiringStages : 0,
                    requisitionBottlenecks: bottlenecks.summary ? bottlenecks.summary.requisitionBottlenecks : 0
                },
                asyncRecruitmentProcessing: {
                    asyncRecruitmentJobs: asyncJobs.length,
                    retryPending: asyncJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length,
                    failedJobs: failedJobs,
                    retryLoopPrevented: asyncJobs.every(function retryLimit(row) { return Number(row.retryAttempts || 0) <= Number(row.maxRetries || 3); })
                },
                accessGovernance: {
                    candidateOwnApplicationsOnly: true,
                    managerAssignedHiringOnly: true,
                    hrOperationalVisibility: true,
                    directorAggregateOnly: true,
                    superAdminResumeAccess: false,
                    platformOwnerCandidateAccess: false,
                    resumeVisibilityRoleScoped: true
                },
                warnings: publicResumeWarnings ? [safeWarning('PUBLIC_RESUME_WARNING', 'Public candidate resume exposure requires immediate review.', { publicResumeWarnings: publicResumeWarnings })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    candidateConfidentialityPreserved: true,
                    historicalRecruitmentImmutable: true,
                    existingRecruitmentFlowsPreserved: true,
                    recruitmentActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditRecruitment('RECRUITMENT_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Recruitment governance report viewed.'
            }, context);
            emitTelemetry('RECRUITMENT_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('RECRUITMENT_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            return freezeRecruitmentOutput(report);
        } catch (error) {
            return freezeRecruitmentOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                pipelineHealth: { totalApplications: 0 },
                requisitionGovernance: { totalRequisitions: 0 },
                interviewGovernance: { pendingInterviews: 0 },
                candidateDocumentGovernance: { candidateDocuments: 0 },
                offerGovernance: { pendingOffers: 0 },
                hiringAnalytics: { funnelConversion: {} },
                failures: [safeFailure('RECRUITMENT_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Recruitment governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateInterviewWorkflow(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_INTERVIEW_PAYLOAD'; }));

            var crossTenant = validateRecruitmentScope({ tenantSlug: 'abc', applicationId: 'JA-X', candidateId: 'CAN-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('recruitment isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var bypass = validateInterviewWorkflow({ tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1', state: 'OFFER_ACCEPTED', directHire: true }, { tenantSlug: 'tabsons', actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' } });
            check('interview workflows work', bypass.success === false && bypass.failures.some(function item(row) { return row.failureCode === 'UNSAFE_HIRING_WORKFLOW_BYPASS'; }));

            var doc = validateCandidateDocumentGovernance({ tenantSlug: 'tabsons', candidateId: 'CAN-1', category: 'resume', mimeType: 'application/pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('candidate document governance works', doc.success === true && doc.documentGovernance.secureResumeAccess === true);

            var immutable = normalizeCandidatePayload({ tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1', state: 'interview pending', resumeFileName: 'private.pdf' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var analytics = generateRecruitmentGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, now: '2026-05-23T00:00:00.000Z' });
            check('hiring analytics work', analytics.success === true && !!analytics.hiringAnalytics);

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleInterviewWorkflow({ tenantSlug: 'tabsons', applicationId: 'JA-SELF', candidateId: 'CAN-SELF', jobId: 'JO-1' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeRecruitmentOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Recruitment governance self-test passed.' : 'Recruitment governance self-test detected failures.'
        });
        global.__ARTHHRMS_RECRUITMENT_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var RecruitmentGovernanceService = Object.freeze({
        VERSION: VERSION,
        RECRUITMENT_STATES: RECRUITMENT_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyHiringRisk: classifyHiringRisk,
        validateRecruitmentScope: validateRecruitmentScope,
        validateInterviewWorkflow: validateInterviewWorkflow,
        validateCandidateDocumentGovernance: validateCandidateDocumentGovernance,
        normalizeCandidatePayload: normalizeCandidatePayload,
        freezeRecruitmentOutput: freezeRecruitmentOutput,
        detectHiringBottlenecks: detectHiringBottlenecks,
        scheduleInterviewWorkflow: scheduleInterviewWorkflow,
        generateRecruitmentGovernanceReport: generateRecruitmentGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.RecruitmentGovernanceService = RecruitmentGovernanceService;
    global.recruitmentGovernanceService = RecruitmentGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
