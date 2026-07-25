(function initPlatformModuleLoader(global) {
    'use strict';

    var DEFERRED_SELECTOR = 'script[type="application/x-arthhrms-module"][data-platform-src]';
    var loaded = new Set();
    var pending = new Map();

    var GROUPS = Object.freeze({
        overview: [
            'services/notificationService.js',
            'services/notificationRoutingService.js',
            'services/notificationOrchestrationService.js',
            'services/notificationCenterService.js',
            'services/smartSearchService.js',
            'services/globalActivityFeedService.js'
        ],
        company: [
            'services/authInviteService.js',
            'services/organizationSetupService.js',
            'services/companyProfileConfigurationService.js',
            'services/organizationImportService.js',
            'services/migrationControlService.js'
        ],
        features: [
            'services/featureFlagValidator.js',
            'services/featureRolloutService.js'
        ],
        pilot: [
            'services/featureFlagValidator.js',
            'services/featureRolloutService.js',
            'services/pilotRolloutGovernanceService.js',
            'services/launchReadinessService.js',
            'services/rlsValidationService.js',
            'services/environmentGovernanceService.js',
            'services/stagingValidationService.js',
            'services/environmentActivationService.js',
            'services/orchestrationMetricsService.js',
            'services/eventReplayService.js',
            'services/escalationPolicyService.js',
            'services/strategicReviewService.js',
            'services/authInviteService.js',
            'services/pilotOnboardingService.js'
        ],
        notifications: [
            'services/notificationService.js',
            'services/notificationRoutingService.js',
            'services/notificationOrchestrationService.js',
            'services/notificationCenterService.js',
            'services/asyncJobService.js',
            'services/notificationDeliveryTrackingService.js'
        ],
        integrations: [
            'services/exportService.js',
            'services/enterpriseRedisCacheService.js',
            'services/enterpriseAssetDeliveryService.js',
            'services/distributedQueueService.js',
            'services/apiPayloadValidationService.js',
            'services/apiGatewayGovernanceService.js',
            'services/webhookPlatformService.js',
            'services/developerPlatformService.js',
            'services/integrationMarketplaceService.js',
            'services/noCodeWorkflowAutomationService.js',
            'services/horizontalScalabilityService.js',
            'services/infrastructureObservabilityService.js',
            'services/enterpriseLoggingPipelineService.js',
            'services/multiRegionArchitectureService.js'
        ],
        operations: [
            'services/notificationService.js',
            'services/notificationRoutingService.js',
            'services/notificationOrchestrationService.js',
            'services/asyncJobService.js',
            'services/featureFlagValidator.js',
            'services/featureRolloutService.js',
            'services/launchReadinessService.js',
            'services/rlsValidationService.js',
            'services/environmentGovernanceService.js',
            'services/stagingValidationService.js',
            'services/environmentActivationService.js',
            'services/orchestrationMetricsService.js',
            'services/eventReplayService.js',
            'services/escalationPolicyService.js',
            'services/operationsMonitoringService.js',
            'services/workflowRecoveryService.js',
            'services/softDeleteRestoreGovernanceService.js',
            'services/disasterRecoverySimulationService.js',
            'services/notificationDeliveryTrackingService.js',
            'services/incidentTimelineService.js',
            'services/escalationCommandService.js',
            'services/globalIncidentService.js',
            'services/platformHealthMonitoringService.js',
            'services/emergencyOverrideService.js',
            'services/runtimeEnvironmentHealthService.js'
        ],
        deployment: [
            'services/featureFlagValidator.js',
            'services/launchReadinessService.js',
            'services/rlsValidationService.js',
            'services/environmentGovernanceService.js',
            'services/stagingValidationService.js',
            'services/environmentActivationService.js',
            'services/orchestrationMetricsService.js',
            'services/eventReplayService.js',
            'services/deploymentSafetyService.js',
            'services/globalIncidentService.js',
            'services/platformHealthMonitoringService.js',
            'services/globalAuditVisibilityService.js',
            'services/emergencyOverrideService.js',
            'services/deploymentValidationService.js',
            'services/productionReadinessService.js',
            'services/enterpriseProductionCertificationService.js',
            'services/enterpriseCertificationSuiteService.js',
            'services/complianceGovernanceService.js',
            'services/privacyComplianceService.js',
            'services/safeReleaseGovernanceService.js',
            'services/configurationDriftService.js',
            'services/environmentSnapshotService.js',
            'services/cicdGovernanceService.js',
            'services/zeroDowntimeDeploymentService.js',
            'services/runtimeEnvironmentHealthService.js'
        ],
        audit: [
            'services/exportService.js',
            'services/tenantBackupExportService.js',
            'services/backupIntegrityVerificationService.js',
            'services/enterpriseRedisCacheService.js',
            'services/enterpriseAssetDeliveryService.js',
            'services/distributedQueueService.js',
            'services/apiPayloadValidationService.js',
            'services/apiGatewayGovernanceService.js',
            'services/webhookPlatformService.js',
            'services/developerPlatformService.js',
            'services/integrationMarketplaceService.js',
            'services/noCodeWorkflowAutomationService.js',
            'services/horizontalScalabilityService.js',
            'services/infrastructureObservabilityService.js',
            'services/enterpriseLoggingPipelineService.js',
            'services/multiRegionArchitectureService.js',
            'services/dataRetentionGovernanceService.js',
            'services/auditInvestigationService.js',
            'services/orchestrationMetricsService.js',
            'services/eventReplayService.js',
            'services/workflowRecoveryService.js',
            'services/softDeleteRestoreGovernanceService.js',
            'services/disasterRecoverySimulationService.js',
            'services/incidentTimelineService.js',
            'services/globalAuditVisibilityService.js'
        ],
        analytics: [
            'services/notificationService.js',
            'services/notificationRoutingService.js',
            'services/notificationOrchestrationService.js',
            'services/asyncJobService.js',
            'services/storageHardeningService.js',
            'services/featureRolloutService.js'
        ]
    });

    function descriptors() {
        return Array.from(document.querySelectorAll(DEFERRED_SELECTOR));
    }

    function normalizedSource(value) {
        return String(value || '').replace(/^\.\//, '');
    }

    function loadScript(source) {
        var normalized = normalizedSource(source);
        if (!/^services\/[A-Za-z0-9_.-]+\.js$/.test(normalized)) {
            return Promise.reject(new Error('Blocked deferred module source.'));
        }
        if (loaded.has(normalized)) return Promise.resolve(normalized);
        if (pending.has(normalized)) return pending.get(normalized);

        var descriptor = descriptors().find(function findDescriptor(node) {
            return normalizedSource(node.dataset.platformSrc) === normalized;
        });
        if (!descriptor) return Promise.reject(new Error('Deferred module is not registered: ' + normalized));

        var promise = new Promise(function createDeferredScript(resolve, reject) {
            var script = document.createElement('script');
            script.src = normalized;
            script.async = false;
            script.dataset.platformLoaded = 'true';
            script.onload = function onDeferredLoad() {
                loaded.add(normalized);
                pending.delete(normalized);
                resolve(normalized);
            };
            script.onerror = function onDeferredError() {
                pending.delete(normalized);
                reject(new Error('Unable to load platform module: ' + normalized));
            };
            document.head.appendChild(script);
        });
        pending.set(normalized, promise);
        return promise;
    }

    async function loadGroups(groupNames) {
        var requested = new Set();
        (groupNames || []).forEach(function collectGroup(name) {
            (GROUPS[name] || []).forEach(function collectSource(source) {
                requested.add(source);
            });
        });
        var ordered = descriptors()
            .map(function descriptorSource(node) { return normalizedSource(node.dataset.platformSrc); })
            .filter(function requestedSource(source) { return requested.has(source); });
        for (var index = 0; index < ordered.length; index += 1) {
            await loadScript(ordered[index]);
        }
        return Object.freeze({ success: true, loaded: Object.freeze(ordered.slice()) });
    }

    function groupsForPanel(panelId, heading) {
        var panel = String(panelId || 'overview');
        var title = String(heading || '');
        if (panel === 'overview') return ['overview'];
        if (panel === 'tenant' || panel === 'migration') return ['company'];
        if (panel === 'features') return ['features'];
        if (panel === 'pilot' || panel === 'staging') return ['pilot'];
        if (panel === 'deployment') return ['deployment'];
        if (panel === 'audit') return ['audit'];
        if (panel === 'security') return [];
        if (panel !== 'monitoring') return [];
        if (/Notification/i.test(title)) return ['notifications'];
        if (/Integration/i.test(title)) return ['integrations'];
        if (/Analytics|Billing|Usage/i.test(title)) return ['analytics'];
        if (/Environment Health|Platform Health/i.test(title)) return ['operations'];
        return ['operations'];
    }

    async function loadForPanel(panelId, heading) {
        return loadGroups(groupsForPanel(panelId, heading));
    }

    var api = Object.freeze({
        loadForPanel: loadForPanel,
        loadGroups: loadGroups,
        groupsForPanel: groupsForPanel,
        registeredCount: function registeredCount() { return descriptors().length; },
        loadedCount: function loadedCount() { return loaded.size; }
    });
    global.PlatformModuleLoaderService = api;
    global.platformModuleLoaderService = api;
})(typeof window !== 'undefined' ? window : globalThis);
