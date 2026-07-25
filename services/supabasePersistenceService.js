// Authenticated Supabase persistence gateway for the legacy synchronous DB facade.
// Browser memory is an optimistic working set only; Supabase is the durable source of truth.
(function (global) {
    'use strict';

    const OPS_ROLES = Object.freeze(['admin', 'hr', 'hr_head', 'director']);
    const ENTITY_DEFINITIONS = Object.freeze([
        { domain: 'employees', table: 'hrms_employees', stateKey: 'employees', kind: 'collection' },
        { domain: 'employees', table: 'hrms_identity_records', stateKey: 'employeeActivationRecords', kind: 'collection' },
        { domain: 'employees', table: 'hrms_identity_records', stateKey: 'employeeInvitationRecords', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'employeeBulkImportPreviewHistory', kind: 'collection' },
        { domain: 'employees', table: 'hrms_governance_records', stateKey: 'employeeDataValidationRuns', kind: 'collection' },
        { domain: 'employees', table: 'hrms_reports', stateKey: 'employeeDataQualityReports', kind: 'collection' },
        { domain: 'employees', table: 'hrms_governance_records', stateKey: 'employeeDataValidationAnalytics', kind: 'collection' },
        { domain: 'employees', table: 'hrms_governance_records', stateKey: 'employeeDataQualityRecommendations', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'employeeMasterImportBatches', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'employeeMasterImportCheckpoints', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'employeeMasterImportSnapshots', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'employeeMasterImportRollbackHistory', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'employeeMasterImportAnalytics', kind: 'collection' },
        { domain: 'employees', table: 'hrms_import_records', stateKey: 'workforceDataHubRuns', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_attendance', stateKey: 'attendance', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_attendance', stateKey: 'attendanceRecords', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_attendance', stateKey: 'attendanceRegularizations', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_settings', stateKey: 'attendancePolicyDefinitions', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_settings', stateKey: 'attendancePolicyVersions', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_settings', stateKey: 'attendancePolicyRollbacks', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_governance_records', stateKey: 'attendancePolicySimulations', kind: 'collection' },
        { domain: 'attendance', table: 'hrms_governance_records', stateKey: 'attendancePolicyAnalytics', kind: 'collection' },
        { domain: 'leave', table: 'hrms_leave_requests', stateKey: 'leaveRequests', kind: 'collection' },
        { domain: 'leave', table: 'hrms_settings', stateKey: 'leavePolicyDefinitions', kind: 'collection' },
        { domain: 'leave', table: 'hrms_settings', stateKey: 'leavePolicyVersions', kind: 'collection' },
        { domain: 'leave', table: 'hrms_settings', stateKey: 'leavePolicyRollbacks', kind: 'collection' },
        { domain: 'leave', table: 'hrms_governance_records', stateKey: 'leavePolicySimulations', kind: 'collection' },
        { domain: 'leave', table: 'hrms_governance_records', stateKey: 'leavePolicyAnalytics', kind: 'collection' },
        { domain: 'leave', table: 'hrms_audit_records', stateKey: 'leaveAttendanceAuditMarkers', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payroll', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payrollRuns', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payrollCycles', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'salaryStructures', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payslips', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payrollConfigurations', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payrollConfigurationVersions', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_payroll_records', stateKey: 'payrollConfigurationRollbacks', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_governance_records', stateKey: 'payrollConfigurationSimulations', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_governance_records', stateKey: 'payrollConfigurationAnalytics', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_governance_records', stateKey: 'payrollGovernanceRuns', kind: 'collection' },
        { domain: 'payroll', table: 'hrms_audit_records', stateKey: 'payrollAuditMarkers', kind: 'collection' },
        { domain: 'departments', table: 'hrms_departments', stateKey: 'departments', kind: 'collection' },
        { domain: 'departments', table: 'hrms_departments', stateKey: 'tenantDepartmentRecords', kind: 'collection' },
        { domain: 'designations', table: 'hrms_designations', stateKey: 'designations', kind: 'collection' },
        { domain: 'recruitment', table: 'hrms_recruitment_records', stateKey: 'jobOpenings', kind: 'collection' },
        { domain: 'recruitment', table: 'hrms_recruitment_records', stateKey: 'jobApplications', kind: 'collection' },
        { domain: 'recruitment', table: 'hrms_recruitment_records', stateKey: 'onboardingTasks', kind: 'collection' },
        { domain: 'training', table: 'hrms_training_records', stateKey: 'courses', kind: 'collection' },
        { domain: 'training', table: 'hrms_training_records', stateKey: 'courseEnrollments', kind: 'collection' },
        { domain: 'training', table: 'hrms_training_records', stateKey: 'training', kind: 'collection' },
        { domain: 'training', table: 'hrms_training_records', stateKey: 'empTraining', kind: 'collection' },
        { domain: 'performance', table: 'hrms_performance_records', stateKey: 'performanceGoals', kind: 'collection' },
        { domain: 'performance', table: 'hrms_performance_records', stateKey: 'appraisals', kind: 'collection' },
        { domain: 'performance', table: 'hrms_performance_records', stateKey: 'reviewCycles', kind: 'collection' },
        { domain: 'performance', table: 'hrms_performance_records', stateKey: 'strategicDeliverables', kind: 'collection' },
        { domain: 'performance', table: 'hrms_performance_records', stateKey: 'deliverableReviews', kind: 'collection' },
        { domain: 'documents', table: 'hrms_documents', stateKey: 'documents', kind: 'collection' },
        { domain: 'documents', table: 'hrms_documents', stateKey: 'documentVerifications', kind: 'collection' },
        { domain: 'documents', table: 'hrms_documents', stateKey: 'onboardingCollections', kind: 'collection' },
        { domain: 'documents', table: 'hrms_governance_records', stateKey: 'documentGovernanceRuns', kind: 'collection' },
        { domain: 'assets', table: 'hrms_assets', stateKey: 'assets', kind: 'collection' },
        { domain: 'assets', table: 'hrms_assets', stateKey: 'assetAssignments', kind: 'collection' },
        { domain: 'expenses', table: 'hrms_expense_claims', stateKey: 'expenseClaims', kind: 'collection' },
        { domain: 'helpdesk', table: 'hrms_helpdesk_tickets', stateKey: 'helpdeskTickets', kind: 'collection' },
        { domain: 'employeeLifecycle', table: 'hrms_employee_lifecycle_records', stateKey: 'resignationRequests', kind: 'collection' },
        { domain: 'employeeLifecycle', table: 'hrms_employee_lifecycle_records', stateKey: 'exitInterviews', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'roster', kind: 'document' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'shiftRosterAssignments', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'shiftRosterTemplates', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'shiftRosterPlans', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'shiftRosterVersions', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'shiftRosterRollbacks', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_schedule_records', stateKey: 'shiftSwapRequests', kind: 'collection' },
        { domain: 'scheduling', table: 'hrms_governance_records', stateKey: 'shiftRosterAnalytics', kind: 'collection' },
        { domain: 'workflow', table: 'hrms_workflow_records', stateKey: 'workflowEvents', kind: 'collection' },
        { domain: 'workflow', table: 'hrms_workflow_records', stateKey: 'pendingActions', kind: 'collection' },
        { domain: 'workflow', table: 'hrms_governance_records', stateKey: 'lifecycleTimelineEvents', kind: 'collection' },
        { domain: 'notifications', table: 'hrms_notifications', stateKey: 'notifications', kind: 'collection' },
        { domain: 'notifications', table: 'hrms_notifications', stateKey: 'whatsappLogs', kind: 'collection' },
        { domain: 'reports', table: 'hrms_reports', stateKey: 'customReports', kind: 'collection' },
        { domain: 'reports', table: 'hrms_reports', stateKey: 'reportDefinitions', kind: 'collection' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'companyProfileConfigurations', kind: 'document' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'companyConfigurationVersions', kind: 'collection' },
        { domain: 'company', table: 'hrms_audit_records', stateKey: 'companyConfigurationAuditHistory', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'companyConfigurationAnalytics', kind: 'collection' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'tenantFeatureFlags', kind: 'document' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'companyHolidayCalendars', kind: 'collection' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'companyLocations', kind: 'collection' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'locations', kind: 'collection' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'holidays', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'reportingHierarchyRelationships', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'reportingHierarchyVersions', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'reportingHierarchyHistory', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'reportingHierarchySnapshots', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'reportingHierarchyRollbackHistory', kind: 'collection' },
        { domain: 'company', table: 'hrms_import_records', stateKey: 'reportingHierarchyImports', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'reportingHierarchyAnalytics', kind: 'collection' },
        { domain: 'company', table: 'hrms_settings', stateKey: 'enterpriseOrganizationSetupDrafts', kind: 'collection' },
        { domain: 'company', table: 'hrms_governance_records', stateKey: 'enterpriseOrganizationProvisioningHistory', kind: 'collection' },
        { domain: 'company', table: 'hrms_audit_records', stateKey: 'enterpriseOrganizationSetupAuditHistory', kind: 'collection' },
        { domain: 'identity', table: 'hrms_identity_records', stateKey: 'users', kind: 'collection' },
        { domain: 'identity', table: 'hrms_identity_records', stateKey: 'authInvites', kind: 'collection' },
        { domain: 'audit', table: 'hrms_audit_records', stateKey: 'auditLogs', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'importBatches', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'importLogs', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'importRollbackLogs', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'importStagingRows', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'organizationImportJobs', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'organizationImportTemplates', kind: 'collection' },
        { domain: 'imports', table: 'hrms_import_records', stateKey: 'organizationImportTransactions', kind: 'collection' },
        { domain: 'imports', table: 'hrms_governance_records', stateKey: 'organizationImportAnalytics', kind: 'collection' },
        { domain: 'imports', table: 'hrms_governance_records', stateKey: 'duplicateDetectionRuns', kind: 'collection' },
        { domain: 'imports', table: 'hrms_governance_records', stateKey: 'duplicateResolutionAnalytics', kind: 'collection' },
        { domain: 'imports', table: 'hrms_governance_records', stateKey: 'masterDataMergeHistory', kind: 'collection' },
        { domain: 'imports', table: 'hrms_governance_records', stateKey: 'masterDataMergeSnapshots', kind: 'collection' },
        { domain: 'imports', table: 'hrms_governance_records', stateKey: 'masterDataRollbackHistory', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'deploymentCheckpoints', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'deploymentLogs', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'deploymentState', kind: 'document' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'installState', kind: 'document' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'migrationLogs', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'migrationState', kind: 'document' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'operationIncidents', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'operationMetrics', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'asyncJobs', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'qaValidationRuns', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'serviceErrorLogs', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'testLabRuns', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveValidationRuns', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveRiskAssessments', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveApprovals', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveOverrides', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveGovernanceRevocations', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveRollbackHistory', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveValidationSchedules', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLiveDashboardSnapshots', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'goLivePerformanceBenchmarks', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationControls', kind: 'document' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationRuns', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationResults', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationRisks', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchExecutiveApprovals', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchApprovalEvents', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationOverrides', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchDigitalCertificates', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificateEvents', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchControlRecords', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchActivationAttempts', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchProductionHealthSnapshots', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchIncidentRecords', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchIncidentEvents', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchRollbackRecords', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationEvents', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationCheckpoints', kind: 'collection' },
        { domain: 'governance', table: 'hrms_governance_records', stateKey: 'launchCertificationAnalytics', kind: 'collection' },
        { domain: 'reports', table: 'hrms_reports', stateKey: 'goLiveCertificates', kind: 'collection' },
        { domain: 'reports', table: 'hrms_reports', stateKey: 'launchCertificationReports', kind: 'collection' },
        { domain: 'reports', table: 'hrms_reports', stateKey: 'launchCertificationExports', kind: 'collection' },
        { domain: 'audit', table: 'hrms_audit_records', stateKey: 'goLiveValidationAuditHistory', kind: 'collection' },
        { domain: 'audit', table: 'hrms_audit_records', stateKey: 'launchCertificationAuditHistory', kind: 'collection' },
        { domain: 'settings', table: 'hrms_settings', stateKey: 'settings', kind: 'document' },
        { domain: 'settings', table: 'hrms_settings', stateKey: 'companySettings', kind: 'document' },
        { domain: 'settings', table: 'hrms_settings', stateKey: 'rolePermissions', kind: 'document' },
        { domain: 'settings', table: 'hrms_settings', stateKey: 'platformGovernance', kind: 'document' },
        { domain: 'settings', table: 'hrms_settings', stateKey: 'shifts', kind: 'collection' },
        { domain: 'settings', table: 'hrms_settings', stateKey: 'teams', kind: 'collection' }
    ]);
    const RECORD_ID_KEYS = Object.freeze([
        'id', 'empId', 'employeeId', 'employeeCode', 'attendanceId', 'leaveId', 'payrollId',
        'payrollCycleId', 'payslipId', 'departmentId', 'departmentCode', 'designationId',
        'designationCode', 'jobId', 'applicationId', 'courseId', 'enrollmentId', 'goalId',
        'appraisalId', 'documentId', 'assetId', 'notificationId', 'reportId', 'code', 'key'
    ]);
    const SUBJECT_ID_KEYS = Object.freeze([
        'empId', 'employeeId', 'employee_id', 'subjectId', 'subject_id', 'assignedTo', 'toEmpId',
        'targetEmpId', 'targetEmployeeId', 'managerId', 'ownerEmpId', 'candidateEmployeeId', 'to', 'toRole'
    ]);
    const SENSITIVE_KEY = /^(password|passwordHash|secret|secretValue|clientSecret|privateKey|accessToken|refreshToken|authorization|cookie|sessionId|serviceRoleKey)$/i;
    let pendingJob = null;
    let drainPromise = Promise.resolve();
    let lastError = null;
    let hydratedTenant = '';
    let revision = 0;
    let confirmedState = null;
    const PAGE_SIZE = 1000;

    function clone(value) {
        return JSON.parse(JSON.stringify(value == null ? null : value));
    }

    function normalizeRole(value) {
        return String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
    }

    function slug(value) {
        return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function sanitize(value, depth = 0) {
        if (depth > 100 || value == null) return value == null ? null : String(value);
        if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
        if (typeof value !== 'object') return value;
        const output = {};
        Object.keys(value).forEach(key => {
            if (!SENSITIVE_KEY.test(key)) output[key] = sanitize(value[key], depth + 1);
        });
        return output;
    }

    function config() {
        return global.supabaseClientService?.readConfig?.() || { flags: {} };
    }

    function isRequired() {
        const flags = config().flags || {};
        return !!(flags.PRODUCTION_MODE || flags.PILOT_MODE || flags.USE_SUPABASE_PERSISTENCE);
    }

    function client() {
        return global.supabaseClientService?.getClient?.() || null;
    }

    function isConfigured() {
        return !!(client() && global.authService?.getCurrentUser?.());
    }

    function currentContext(snapshot = {}) {
        const user = global.authService?.getCurrentUser?.();
        if (!user || user.source !== 'supabase' || !user.roleTrusted) {
            throw new Error('Authenticated Supabase user context is required for business persistence.');
        }
        if (!user.id) throw new Error('Authenticated Supabase user id is required for business persistence.');
        const settings = snapshot.companySettings || {};
        const role = normalizeRole(user.role);
        if (role === 'platform_owner') {
            throw new Error('Platform Owner is isolated from tenant business persistence.');
        }
        const claimedTenant = String(user.tenantSlug || user.tenantId || '').trim();
        const tenantId = slug(claimedTenant);
        if (!tenantId) throw new Error('A trusted tenant claim is required for business persistence.');
        return {
            user,
            role,
            tenantId,
            organizationId: String(user.organizationId || settings.organizationId || settings.companyId || tenantId).trim()
        };
    }

    function recordId(stateKey, record, index) {
        if (record && typeof record === 'object') {
            for (const key of RECORD_ID_KEYS) {
                if (record[key] !== undefined && record[key] !== null && String(record[key]).trim()) {
                    return String(record[key]).trim();
                }
            }
        }
        return `${stateKey}:${index}`;
    }

    function subjectId(record) {
        if (!record || typeof record !== 'object') return '';
        for (const key of SUBJECT_ID_KEYS) {
            if (record[key] !== undefined && record[key] !== null && String(record[key]).trim()) {
                return String(record[key]).trim();
            }
        }
        return '';
    }

    function projectDefinition(definition, snapshot, context) {
        const value = snapshot[definition.stateKey];
        const rows = definition.kind === 'document' ? [value || {}] : (Array.isArray(value) ? value : []);
        return rows.map((record, index) => ({
            tenant_id: context.tenantId,
            organization_id: context.organizationId,
            record_type: definition.stateKey,
            record_id: definition.kind === 'document' ? definition.stateKey : recordId(definition.stateKey, record, index),
            subject_id: subjectId(record),
            payload: sanitize(record),
            updated_by: context.user.id
        }));
    }

    function rowMap(definition, snapshot, context) {
        return new Map(projectDefinition(definition, snapshot || {}, context).map(row => [row.record_id, row]));
    }

    async function upsertRows(table, rows) {
        if (!rows.length) return;
        const result = await client().from(table).upsert(rows, { onConflict: 'tenant_id,record_type,record_id' });
        if (result?.error) throw result.error;
    }

    async function insertRows(table, rows) {
        if (!rows.length) return;
        const result = await client().from(table).insert(rows);
        if (result?.error) throw result.error;
    }

    async function updateRows(table, rows) {
        for (const row of rows) {
            const result = await client().from(table)
                .update(row)
                .eq('tenant_id', row.tenant_id)
                .eq('record_type', row.record_type)
                .eq('record_id', row.record_id)
                .select('record_id');
            if (result?.error) throw result.error;
            if (!Array.isArray(result?.data) || result.data.length !== 1) {
                throw new Error(`Supabase update conflict for ${table}:${row.record_type}:${row.record_id}`);
            }
        }
    }

    async function deleteRows(table, context, recordType, recordIds) {
        if (!recordIds.length) return;
        const result = await client().from(table).delete()
            .eq('tenant_id', context.tenantId)
            .eq('record_type', recordType)
            .in('record_id', recordIds);
        if (result?.error) throw result.error;
    }

    async function syncDefinition(definition, previous, next, context, force = false) {
        const before = rowMap(definition, previous || {}, context);
        const after = rowMap(definition, next || {}, context);
        const created = [];
        const changed = [];
        after.forEach((row, id) => {
            if (force) changed.push(row);
            else if (!before.has(id)) created.push(row);
            else if (JSON.stringify(before.get(id).payload) !== JSON.stringify(row.payload)) changed.push(row);
        });
        const removed = [];
        before.forEach((_row, id) => { if (!after.has(id)) removed.push(id); });
        if (force) await upsertRows(definition.table, changed);
        else {
            await insertRows(definition.table, created);
            await updateRows(definition.table, changed);
        }
        await deleteRows(definition.table, context, definition.stateKey, removed);
    }

    async function persistManifest(snapshot, context) {
        if (!OPS_ROLES.includes(context.role)) return;
        revision += 1;
        const result = await client().from('hrms_tenant_state').upsert({
            tenant_id: context.tenantId,
            organization_id: context.organizationId,
            state: {
                schemaVersion: 1,
                stateKeys: Object.keys(snapshot || {}).sort(),
                persistedAt: new Date().toISOString()
            },
            revision,
            updated_by: context.user.id
        }, { onConflict: 'tenant_id' });
        if (result?.error) throw result.error;
    }

    async function persistSnapshot(previous, next, options = {}) {
        if (!isRequired()) return { skipped: true, reason: 'SUPABASE_PERSISTENCE_DISABLED' };
        if (!isConfigured()) throw new Error('Supabase business persistence is not configured.');
        const context = currentContext(next || previous || {});
        for (const definition of ENTITY_DEFINITIONS) {
            await syncDefinition(definition, previous || {}, next || {}, context, !!options.force);
        }
        await persistManifest(next, context);
        hydratedTenant = context.tenantId;
        lastError = null;
        purgeLegacyBusinessStorage();
        return { persisted: true, tenantId: context.tenantId, revision };
    }

    function emit(name, detail) {
        try {
            if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new CustomEvent(name, { detail }));
        } catch (_error) {}
    }

    async function drain() {
        while (pendingJob) {
            const job = pendingJob;
            pendingJob = null;
            try {
                await persistSnapshot(job.previous, job.next);
                confirmedState = clone(job.next);
                emit('arthhrms:persistence-saved', { tenantId: hydratedTenant });
            } catch (error) {
                lastError = error;
                if (!pendingJob && global.DB?.replaceState && confirmedState) global.DB.replaceState(confirmedState);
                emit('arthhrms:persistence-error', { message: error.message || String(error) });
                console.error('[SupabasePersistence] Business persistence failed:', error.message || error);
            }
        }
    }

    function enqueueSnapshot(previous, next) {
        if (!isRequired()) return Promise.resolve({ skipped: true });
        if (normalizeRole(global.authService?.getCurrentUser?.()?.role) === 'platform_owner') {
            return Promise.resolve({ skipped: true, reason: 'PLATFORM_OWNER_TENANT_PERSISTENCE_BLOCKED' });
        }
        pendingJob = pendingJob
            ? { previous: pendingJob.previous || previous, next: clone(next) }
            : { previous: clone(previous || {}), next: clone(next || {}) };
        drainPromise = drainPromise.then(drain, drain);
        return drainPromise;
    }

    async function loadManifest(context) {
        const result = await client().from('hrms_tenant_state')
            .select('tenant_id,organization_id,state,revision,updated_at')
            .eq('tenant_id', context.tenantId)
            .maybeSingle();
        if (result?.error) throw result.error;
        return result?.data || null;
    }

    async function selectAllRows(table, context, recordTypes) {
        const rows = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
            const result = await client().from(table)
                .select('record_id,record_type,subject_id,payload')
                .eq('tenant_id', context.tenantId)
                .in('record_type', recordTypes)
                .order('record_type', { ascending: true })
                .order('record_id', { ascending: true })
                .range(offset, offset + PAGE_SIZE - 1);
            if (result?.error) throw result.error;
            const page = result?.data || [];
            rows.push(...page);
            if (page.length < PAGE_SIZE) return rows;
        }
    }

    async function loadProjections(base, context) {
        const next = clone(base || {});
        const byTable = new Map();
        ENTITY_DEFINITIONS.forEach(definition => {
            if (!byTable.has(definition.table)) byTable.set(definition.table, []);
            byTable.get(definition.table).push(definition);
        });
        const tableResults = await Promise.all(Array.from(byTable.entries()).map(async ([table, definitions]) => ({
            definitions,
            rows: await selectAllRows(table, context, definitions.map(definition => definition.stateKey))
        })));
        tableResults.forEach(({ definitions, rows }) => {
            definitions.forEach(definition => {
                const values = rows
                    .filter(row => row.record_type === definition.stateKey)
                    .map(row => clone(row.payload));
                next[definition.stateKey] = definition.kind === 'document' ? (values[0] || {}) : values;
            });
        });
        return next;
    }

    async function hydrateAuthenticatedState() {
        if (!isRequired()) return { skipped: true, reason: 'SUPABASE_PERSISTENCE_DISABLED' };
        if (!isConfigured()) throw new Error('Supabase business persistence is required but unavailable.');
        if (normalizeRole(global.authService?.getCurrentUser?.()?.role) === 'platform_owner') {
            return { skipped: true, platformOnly: true, reason: 'PLATFORM_OWNER_TENANT_PERSISTENCE_BLOCKED' };
        }
        const base = global.DB?.get?.() || {};
        let context = currentContext(base);
        const manifest = OPS_ROLES.includes(context.role) ? await loadManifest(context) : null;
        if (manifest) {
            revision = Number(manifest.revision || 0);
            context = { ...context, tenantId: manifest.tenant_id, organizationId: manifest.organization_id || manifest.tenant_id };
            const projected = await loadProjections(base, context);
            global.DB?.replaceState?.(projected, { migrate: true });
            confirmedState = global.DB?.get?.() || clone(projected);
        } else if (OPS_ROLES.includes(context.role)) {
            const legacy = readLegacyBusinessState(context.tenantId);
            const bootstrap = legacy || base;
            global.DB?.replaceState?.(bootstrap, { migrate: true });
            const persisted = await persistSnapshot({}, global.DB?.get?.() || bootstrap, { force: true });
            context = { ...context, tenantId: persisted.tenantId || context.tenantId };
            confirmedState = global.DB?.get?.() || clone(bootstrap);
        } else {
            const projected = await loadProjections(base, context);
            global.DB?.replaceState?.(projected, { migrate: true });
            confirmedState = global.DB?.get?.() || clone(projected);
        }
        hydratedTenant = context.tenantId;
        purgeLegacyBusinessStorage();
        emit('arthhrms:persistence-ready', { tenantId: hydratedTenant });
        return { hydrated: true, tenantId: hydratedTenant, source: 'projections' };
    }

    async function replaceAuthenticatedState(snapshot) {
        if (!isRequired()) return { skipped: true };
        const previous = global.DB?.get?.() || {};
        const result = await persistSnapshot(previous, snapshot || {}, { force: true });
        global.DB?.replaceState?.(snapshot || {});
        confirmedState = global.DB?.get?.() || clone(snapshot || {});
        return result;
    }

    function purgeLegacyBusinessStorage() {
        try {
            global.localStorage?.removeItem?.('arthhrms_db');
            global.localStorage?.removeItem?.('hrms_db');
            const keys = [];
            for (let index = 0; index < Number(global.localStorage?.length || 0); index += 1) {
                const key = global.localStorage.key(index);
                if (key && key.startsWith('arthhrms:branding:')) keys.push(key);
            }
            keys.forEach(key => global.localStorage.removeItem(key));
        } catch (_error) {}
    }

    function readLegacyBusinessState(expectedTenantId = '') {
        let parsed;
        try {
            const raw = global.localStorage?.getItem?.('arthhrms_db') || global.localStorage?.getItem?.('hrms_db');
            if (!raw) return null;
            parsed = JSON.parse(raw);
        } catch (_error) {
            return null;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const settings = parsed.companySettings || {};
        const legacyTenantId = String(settings.tenantId || settings.tenantSlug || settings.companyId || '').trim();
        if (expectedTenantId && (!legacyTenantId || legacyTenantId !== String(expectedTenantId).trim())) {
            throw new Error('Legacy business data tenant scope is missing or does not match the authenticated tenant.');
        }
        return parsed;
    }

    async function flush() {
        await drainPromise;
        if (pendingJob) {
            drainPromise = drainPromise.then(drain, drain);
            await drainPromise;
        }
        if (lastError) throw lastError;
        return { idle: true, tenantId: hydratedTenant };
    }

    const service = Object.freeze({
        ENTITY_DEFINITIONS,
        isRequired,
        isConfigured,
        currentContext,
        enqueueSnapshot,
        persistSnapshot,
        hydrateAuthenticatedState,
        replaceAuthenticatedState,
        readLegacyBusinessState,
        purgeLegacyBusinessStorage,
        flush,
        getStatus() {
            return {
                required: isRequired(),
                configured: isConfigured(),
                hydratedTenant,
                pending: !!pendingJob,
                lastError: lastError ? lastError.message || String(lastError) : ''
            };
        }
    });

    global.supabasePersistenceService = service;
})(typeof window !== 'undefined' ? window : globalThis);
