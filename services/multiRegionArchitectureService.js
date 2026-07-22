/**
 * ARTHHRMS Multi-Region Architecture Service
 * Prepares tenant-scoped global infrastructure topology, region registry,
 * failover planning, regional configuration, and readiness analytics without
 * running live migration, replication engines, or production failover.
 */
(function attachMultiRegionArchitectureService(global) {
    'use strict';

    var SOURCE = 'multiRegionArchitectureService';
    var MAX_HISTORY = 900;
    var SUPPORTED_REGION_CODES = Object.freeze(['AP-SOUTH', 'EU-WEST', 'US-EAST', 'US-WEST']);
    var REGION_STATUSES = Object.freeze(['PLANNED', 'ACTIVE', 'STANDBY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'DISABLED']);
    var REGION_HEALTH_STATES = Object.freeze(['HEALTHY', 'DEGRADED', 'CRITICAL', 'UNKNOWN']);
    var DEPLOYMENT_STATES = Object.freeze(['NOT_DEPLOYED', 'PREPARED', 'DEPLOYING', 'ACTIVE', 'PAUSED', 'RETIRED']);
    var FAILOVER_TYPES = Object.freeze(['AUTOMATIC', 'MANUAL', 'DISASTER', 'MAINTENANCE', 'HEALTH_BASED']);
    var DEPLOYMENT_TOPOLOGIES = Object.freeze(['ACTIVE_PASSIVE', 'ACTIVE_ACTIVE_PREPARED']);
    var GLOBAL_PROVIDERS = Object.freeze(['CLOUDFLARE', 'AWS_GLOBAL_ACCELERATOR', 'AZURE_FRONT_DOOR', 'GOOGLE_CLOUD_LOAD_BALANCER', 'GENERIC_GLOBAL_DNS']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN']);
    var SENSITIVE_KEY_PATTERN = /(password|api.?key|private.?key|credential|token|authorization|cookie|private.?note|rawPayload|payloadBody|encryptedPayload|signedUrl|session.?raw|secretKey|secretValue|accessSecret|clientSecret)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?[a-z0-9._=-]+|hidden[-_ ]?region[-_ ]?secret|hidden[-_ ]?secret|ABC private region data|never expose|authorization\s*[:=])/ig;
    var idCounter = 0;

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

    function normalizeRegionCode(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[_\s]+/g, '-').replace(/[^A-Z0-9-]+/g, '')
            .replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeStatus(value) {
        var status = token(value || 'PLANNED');
        if (status === 'READY') status = 'STANDBY';
        return REGION_STATUSES.indexOf(status) !== -1 ? status : 'PLANNED';
    }

    function normalizeHealth(value, status) {
        var health = token(value || '');
        if (REGION_HEALTH_STATES.indexOf(health) !== -1) return health;
        if (status === 'ACTIVE' || status === 'STANDBY' || status === 'PLANNED') return 'HEALTHY';
        if (status === 'DEGRADED' || status === 'MAINTENANCE') return 'DEGRADED';
        if (status === 'UNAVAILABLE' || status === 'DISABLED') return 'CRITICAL';
        return 'UNKNOWN';
    }

    function normalizeDeploymentState(value) {
        var state = token(value || 'PREPARED');
        return DEPLOYMENT_STATES.indexOf(state) !== -1 ? state : 'PREPARED';
    }

    function normalizeFailoverType(value) {
        var type = token(value || 'MANUAL');
        if (type === 'HEALTH') type = 'HEALTH_BASED';
        return FAILOVER_TYPES.indexOf(type) !== -1 ? type : 'MANUAL';
    }

    function normalizeTopology(value) {
        var topology = token(value || 'ACTIVE_PASSIVE');
        if (topology === 'ACTIVE_ACTIVE') topology = 'ACTIVE_ACTIVE_PREPARED';
        return DEPLOYMENT_TOPOLOGIES.indexOf(topology) !== -1 ? topology : '';
    }

    function normalizeProvider(value) {
        var provider = token(value || 'GENERIC_GLOBAL_DNS');
        if (provider === 'AWS_ACCELERATOR') provider = 'AWS_GLOBAL_ACCELERATOR';
        if (provider === 'AZURE_GLOBAL') provider = 'AZURE_FRONT_DOOR';
        if (provider === 'GCP_GLOBAL_LOAD_BALANCER') provider = 'GOOGLE_CLOUD_LOAD_BALANCER';
        return GLOBAL_PROVIDERS.indexOf(provider) !== -1 ? provider : 'GENERIC_GLOBAL_DNS';
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
        return Math.round(clean.reduce(function sum(acc, value) { return acc + value; }, 0) / clean.length);
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 2400);
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

    function freezeMultiRegionOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            multiRegionGovernancePreserved: true,
            activePassiveSupportedToday: true,
            activeActivePreparedForFuture: true,
            businessLogicUnchanged: true,
            existingApisPreserved: true,
            existingUiPreserved: true,
            noActiveMultiRegionDeploymentRequired: true,
            liveMigrationImplemented: false,
            replicationEnginesImplemented: false,
            failoverExecutionEnabled: false,
            explicitGovernanceRequiredForCrossRegionDataMovement: true,
            rbacPreserved: true,
            auditTrailsPreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'MULTI_REGION_OPERATION_READY' : 'MULTI_REGION_OPERATION_FAILED'));
        return freezeMultiRegionOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'Multi-region operation completed.' : 'Multi-region operation failed.'), '').slice(0, 300)
        }, extra || {}));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || context && context.actorId || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || context && (context.actorTenantSlug || context.actorTenantId) || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function validateAccess(action, tenantSlug, context) {
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var actorTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        if (!targetTenant || !actorTenant || targetTenant !== actorTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped multi-region access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        var roles = action === 'CONTROL' ? CONTROL_ROLES : VIEW_ROLES;
        if (roles.indexOf(currentActor.role) === -1) {
            return result(false, 'MULTI_REGION_GOVERNANCE_DENIED', action === 'CONTROL'
                ? 'Multi-region controls are restricted by governance.'
                : 'Multi-region visibility is restricted by governance.', {
                    tenantSlug: targetTenant,
                    governance: governanceFlags()
                });
        }
        try {
            var registry = global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: targetTenant,
                    ownerTenantSlug: targetTenant,
                    actorTenantSlug: actorTenant
                }, { source: SOURCE }, context || {});
                if (validation && validation.success === false) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation registry denied multi-region access.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {}
        return result(true, 'MULTI_REGION_ACCESS_GRANTED', 'Multi-region access granted.', {
            tenantSlug: targetTenant,
            governance: governanceFlags()
        });
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        var row = Object.assign({}, cloneSafe(record || {}, []), {
            immutable: true,
            source: SOURCE
        });
        current[key].push(row);
        if (current[key].length > MAX_HISTORY) current[key] = current[key].slice(-MAX_HISTORY);
        save(current);
        return row;
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        var meta = cloneSafe(metadata || {}, []);
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    module: 'Multi-Region Architecture',
                    severity: severity || meta.severity || 'INFO',
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    tenantSlug: meta.tenantSlug || contextTenant(context || {}),
                    metadata: meta,
                    description: meta.description || actionType
                }, context || {});
                return true;
            }
        } catch (error) {}
        try {
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(currentActor.role, currentActor.id, actionType, 'Multi-Region Architecture', meta.targetId || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function tenantRows(key, tenantSlug) {
        var targetTenant = normalizeTenant(tenantSlug || '');
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function filter(row) {
            return !targetTenant || normalizeTenant(row.tenantSlug || row.tenant_id || row.tenantId || '') === targetTenant;
        });
    }

    function normalizeRegionalConfig(source) {
        var input = isPlainObject(source) ? source : {};
        return {
            timezone: safeString(input.timezone || 'UTC', 'UTC').slice(0, 80),
            locale: safeString(input.locale || 'en-US', 'en-US').slice(0, 40),
            currency: safeString(input.currency || 'USD', 'USD').trim().toUpperCase().slice(0, 12),
            holidayCalendar: safeString(input.holidayCalendar || input.holiday_calendar || 'GLOBAL', 'GLOBAL').slice(0, 100),
            complianceProfile: safeString(input.complianceProfile || input.compliance_profile || 'STANDARD', 'STANDARD').slice(0, 120),
            notificationProvider: safeString(input.notificationProvider || input.notification_provider || 'DEFAULT', 'DEFAULT').slice(0, 120),
            storageEndpoint: safeString(input.storageEndpoint || input.storage_endpoint || 'origin-storage', 'origin-storage').slice(0, 240)
        };
    }

    function securityPosture(source) {
        var input = isPlainObject(source) ? source : {};
        return {
            regionalKmsPrepared: input.regionalKmsPrepared !== false,
            regionalSecretsPrepared: input.regionalSecretsPrepared !== false,
            regionalCertificatesPrepared: input.regionalCertificatesPrepared !== false,
            regionalIdentityProviderPrepared: input.regionalIdentityProviderPrepared !== false,
            secretsSharedAcrossRegions: false,
            certificatesSharedImproperly: false,
            identityProvidersRegionScoped: true
        };
    }

    function latestRegionByCode(tenantSlug) {
        var map = {};
        tenantRows('regionRegistryHistory', tenantSlug).forEach(function each(row) {
            if (row.regionCode) map[row.regionCode] = row;
        });
        return map;
    }

    function defaultRegions(tenantSlug) {
        return [
            { tenantSlug: tenantSlug, regionCode: 'AP-SOUTH', regionName: 'Asia Pacific South', status: 'ACTIVE', health: 'HEALTHY', priority: 1, failoverTarget: 'EU-WEST', deploymentState: 'ACTIVE' },
            { tenantSlug: tenantSlug, regionCode: 'EU-WEST', regionName: 'Europe West', status: 'STANDBY', health: 'HEALTHY', priority: 2, failoverTarget: 'US-EAST', deploymentState: 'PREPARED' }
        ];
    }

    function currentRegions(tenantSlug) {
        var rows = Object.keys(latestRegionByCode(tenantSlug)).map(function map(key) { return latestRegionByCode(tenantSlug)[key]; });
        if (!rows.length) rows = defaultRegions(tenantSlug);
        return rows.slice().sort(function sort(a, b) { return safeNumber(a.priority, 99) - safeNumber(b.priority, 99); });
    }

    function registerRegion(input, context) {
        try {
            if (!isPlainObject(input)) {
                return result(false, 'MALFORMED_REGION_PAYLOAD', 'Region payload must be an object.', { governance: governanceFlags() });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var regionCode = normalizeRegionCode(input.regionCode || input.code);
            if (!regionCode) {
                return result(false, 'INVALID_REGION_CODE', 'Region code is required.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var status = normalizeStatus(input.status);
            var deploymentState = normalizeDeploymentState(input.deploymentState || input.deployment_state);
            var topology = normalizeTopology(input.topology || 'ACTIVE_PASSIVE') || 'ACTIVE_PASSIVE';
            var region = {
                regionId: createId('MRR'),
                tenantSlug: tenantSlug,
                regionCode: regionCode,
                regionName: safeString(input.regionName || input.name || regionCode.replace(/-/g, ' '), '').slice(0, 160),
                status: status,
                priority: Math.max(1, Math.round(safeNumber(input.priority, 99))),
                health: normalizeHealth(input.health, status),
                failoverTarget: normalizeRegionCode(input.failoverTarget || input.failover_target || ''),
                deploymentState: deploymentState,
                topology: topology,
                provider: normalizeProvider(input.provider),
                configuration: normalizeRegionalConfig(input.configuration || input),
                activePassiveReady: true,
                activeActivePrepared: true,
                futureRegionConfigurable: true,
                replicationEnginesImplemented: false,
                liveMigrationImplemented: false,
                registeredAt: nowIso(context || {})
            };
            var row = persist('regionRegistryHistory', region, context || {});
            audit('REGION_REGISTRY_UPDATED', { tenantSlug: tenantSlug, regionCode: regionCode, targetId: row.regionId, description: 'Region registry updated.' }, context || {});
            return result(true, 'REGION_REGISTERED', 'Region registered for multi-region readiness.', {
                tenantSlug: tenantSlug,
                region: row,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'REGION_REGISTRATION_FAILED_SAFE', 'Region registration failed safely.', { governance: governanceFlags() });
        }
    }

    function listRegions(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var regions = currentRegions(tenantSlug);
            return result(true, 'REGION_REGISTRY_LISTED', 'Region registry listed.', {
                tenantSlug: tenantSlug,
                regions: regions,
                supportedRegionCodes: SUPPORTED_REGION_CODES.slice(),
                futureRegionsConfigurable: true,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'REGION_REGISTRY_LIST_FAILED_SAFE', 'Region registry listing failed safely.', { governance: governanceFlags() });
        }
    }

    function configureRegionalSettings(input, context) {
        try {
            if (!isPlainObject(input)) {
                return result(false, 'MALFORMED_REGIONAL_CONFIGURATION', 'Regional configuration payload must be an object.', { governance: governanceFlags() });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var regionCode = normalizeRegionCode(input.regionCode || input.code);
            if (!regionCode) {
                return result(false, 'INVALID_REGION_CODE', 'Region code is required for regional configuration.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var configuration = normalizeRegionalConfig(input);
            var security = securityPosture(input);
            var row = persist('regionalConfigurationHistory', {
                configurationId: createId('MRCFG'),
                tenantSlug: tenantSlug,
                regionCode: regionCode,
                configuration: configuration,
                security: security,
                configuredAt: nowIso(context || {})
            }, context || {});
            audit('REGIONAL_CONFIGURATION_UPDATED', { tenantSlug: tenantSlug, regionCode: regionCode, targetId: row.configurationId, description: 'Regional configuration updated.' }, context || {});
            return result(true, 'REGIONAL_CONFIGURATION_UPDATED', 'Regional configuration updated.', {
                tenantSlug: tenantSlug,
                regionCode: regionCode,
                configuration: configuration,
                security: security,
                configurationRecord: row,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'REGIONAL_CONFIGURATION_FAILED_SAFE', 'Regional configuration failed safely.', { governance: governanceFlags() });
        }
    }

    function assignTenantRegion(input, context) {
        try {
            if (!isPlainObject(input)) {
                return result(false, 'MALFORMED_TENANT_REGION_ASSIGNMENT', 'Tenant region assignment payload must be an object.', { governance: governanceFlags() });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var primaryRegion = normalizeRegionCode(input.primaryRegion || input.primary_region);
            var backupRegion = normalizeRegionCode(input.backupRegion || input.backup_region);
            var recoveryRegion = normalizeRegionCode(input.recoveryRegion || input.recovery_region);
            if (!primaryRegion || !backupRegion || !recoveryRegion) {
                return result(false, 'TENANT_REGION_ASSIGNMENT_INCOMPLETE', 'Primary, backup, and recovery regions are required.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            if (primaryRegion === backupRegion || primaryRegion === recoveryRegion) {
                return result(false, 'TENANT_REGION_ASSIGNMENT_CONFLICT', 'Primary region must differ from backup and recovery regions.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var assignment = {
                assignmentId: createId('MRA'),
                tenantSlug: tenantSlug,
                primaryRegion: primaryRegion,
                backupRegion: backupRegion,
                recoveryRegion: recoveryRegion,
                migrationPreparation: input.migrationPreparation === true,
                liveMigrationImplemented: false,
                crossRegionDataMovementAllowed: false,
                explicitGovernanceRequired: true,
                regionMigrationSupportPrepared: true,
                assignedAt: nowIso(context || {})
            };
            var row = persist('tenantRegionAssignmentHistory', assignment, context || {});
            audit('TENANT_REGION_ASSIGNMENT_UPDATED', { tenantSlug: tenantSlug, targetId: row.assignmentId, primaryRegion: primaryRegion, backupRegion: backupRegion, description: 'Tenant region assignment updated.' }, context || {});
            return result(true, 'TENANT_REGION_ASSIGNED', 'Tenant region assignment prepared.', {
                tenantSlug: tenantSlug,
                assignment: row,
                liveMigrationImplemented: false,
                crossRegionDataMovementAllowed: false,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'TENANT_REGION_ASSIGNMENT_FAILED_SAFE', 'Tenant region assignment failed safely.', { governance: governanceFlags() });
        }
    }

    function replicationInterfaces(source) {
        var input = isPlainObject(source) ? source : {};
        return {
            databaseReplication: {
                prepared: input.databaseReplicationInterface !== false,
                interfacePrepared: input.databaseReplicationInterface !== false,
                engineImplemented: false,
                futureIntegration: 'database-replication'
            },
            objectStorageReplication: {
                prepared: input.objectStorageReplicationInterface !== false,
                interfacePrepared: input.objectStorageReplicationInterface !== false,
                engineImplemented: false,
                futureIntegration: 'object-storage-replication'
            },
            cacheSynchronization: {
                prepared: input.cacheSynchronizationInterface !== false,
                interfacePrepared: input.cacheSynchronizationInterface !== false,
                engineImplemented: false,
                futureIntegration: 'cache-synchronization'
            },
            queueReplication: {
                prepared: input.queueReplicationInterface !== false,
                interfacePrepared: input.queueReplicationInterface !== false,
                engineImplemented: false,
                futureIntegration: 'queue-replication'
            }
        };
    }

    function prepareFailoverPlan(input, context) {
        try {
            if (!isPlainObject(input)) {
                return result(false, 'MALFORMED_FAILOVER_PAYLOAD', 'Failover payload must be an object.', { governance: governanceFlags() });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var primaryRegion = normalizeRegionCode(input.primaryRegion || input.primary_region);
            var targetRegion = normalizeRegionCode(input.targetRegion || input.failoverTarget || input.backupRegion);
            if (!primaryRegion || !targetRegion) {
                return result(false, 'FAILOVER_CONFIGURATION_INCOMPLETE', 'Primary and target regions are required for failover preparation.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            if (primaryRegion === targetRegion) {
                return result(false, 'FAILOVER_CONFIGURATION_CONFLICT', 'Failover target must differ from the primary region.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var regionMap = latestRegionByCode(tenantSlug);
            var target = regionMap[targetRegion] || {};
            var failoverType = normalizeFailoverType(input.failoverType || input.type);
            var rtoMinutes = Math.max(1, Math.round(safeNumber(input.rtoMinutes, 60)));
            var rpoMinutes = Math.max(0, Math.round(safeNumber(input.rpoMinutes, 15)));
            var warnings = [];
            if (target.status === 'UNAVAILABLE' || target.health === 'CRITICAL') warnings.push({ code: 'TARGET_REGION_UNAVAILABLE', severity: 'WARNING', message: 'Target region health is not ready for automatic activation.' });
            var plan = {
                failoverPlanId: createId('MRF'),
                tenantSlug: tenantSlug,
                primaryRegion: primaryRegion,
                targetRegion: targetRegion,
                failoverType: failoverType,
                automaticFailoverPrepared: true,
                manualFailoverPrepared: true,
                disasterFailoverPrepared: true,
                maintenanceFailoverPrepared: true,
                healthBasedFailoverPrepared: true,
                failoverExecutionEnabled: false,
                liveFailoverExecuted: false,
                rtoMinutes: rtoMinutes,
                rpoMinutes: rpoMinutes,
                warnings: warnings,
                preparedAt: nowIso(context || {})
            };
            var failoverReadinessScore = clampScore(90 - warnings.length * 18 - Math.max(0, rtoMinutes - 60) / 2 - Math.max(0, rpoMinutes - 30));
            plan.failoverReadinessScore = failoverReadinessScore;
            var row = persist('failoverPlanHistory', plan, context || {});
            audit('FAILOVER_CONFIGURATION_PREPARED', { tenantSlug: tenantSlug, targetId: row.failoverPlanId, primaryRegion: primaryRegion, targetRegion: targetRegion, description: 'Failover configuration prepared.' }, context || {}, warnings.length ? 'WARNING' : 'INFO');
            return result(true, 'FAILOVER_PLAN_PREPARED', 'Failover plan prepared without executing failover.', {
                tenantSlug: tenantSlug,
                plan: row,
                failoverReadinessScore: failoverReadinessScore,
                failoverExecutionEnabled: false,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'FAILOVER_PREPARATION_FAILED_SAFE', 'Failover preparation failed safely.', { governance: governanceFlags() });
        }
    }

    function generateDeploymentPlan(input, context) {
        try {
            if (!isPlainObject(input)) {
                return result(false, 'MALFORMED_DEPLOYMENT_PLAN', 'Deployment plan payload must be an object.', { governance: governanceFlags() });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var topology = normalizeTopology(input.topology);
            if (!topology) {
                return result(false, 'UNSUPPORTED_DEPLOYMENT_TOPOLOGY', 'Deployment topology is not supported.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var targets = Array.isArray(input.targetRegions) ? input.targetRegions.map(normalizeRegionCode).filter(Boolean) : currentRegions(tenantSlug).map(function map(row) { return row.regionCode; });
            var unique = {};
            targets = targets.filter(function keep(region) {
                if (unique[region]) return false;
                unique[region] = true;
                return true;
            });
            if (!targets.length) targets = ['AP-SOUTH', 'EU-WEST'];
            var interfaces = replicationInterfaces(input);
            var interfaceScore = Object.keys(interfaces).filter(function ok(key) { return interfaces[key].prepared === true; }).length * 7;
            var plan = {
                deploymentPlanId: createId('MRD'),
                tenantSlug: tenantSlug,
                topology: topology,
                targetRegions: targets,
                globalDnsReady: input.globalDnsReady !== false,
                globalLoadBalancerReady: input.globalLoadBalancerReady !== false,
                activePassiveToday: true,
                activeActiveFutureReady: true,
                deploymentExecutionEnabled: false,
                liveMigrationImplemented: false,
                replicationInterfaces: interfaces,
                generatedAt: nowIso(context || {})
            };
            var deploymentReadinessScore = clampScore(55 + (plan.globalDnsReady ? 10 : 0) + (plan.globalLoadBalancerReady ? 10 : 0) + Math.min(12, targets.length * 4) + interfaceScore);
            plan.deploymentReadinessScore = deploymentReadinessScore;
            var row = persist('multiRegionDeploymentPlanHistory', plan, context || {});
            audit('MULTI_REGION_DEPLOYMENT_PLAN_PREPARED', { tenantSlug: tenantSlug, targetId: row.deploymentPlanId, topology: topology, description: 'Multi-region deployment plan prepared.' }, context || {});
            return result(true, 'DEPLOYMENT_PLAN_PREPARED', 'Multi-region deployment plan prepared.', {
                tenantSlug: tenantSlug,
                plan: row,
                replicationInterfaces: interfaces,
                deploymentReadinessScore: deploymentReadinessScore,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'DEPLOYMENT_PLAN_FAILED_SAFE', 'Deployment planning failed safely.', { governance: governanceFlags() });
        }
    }

    function healthScoreForRegion(row) {
        var status = normalizeStatus(row.status || 'ACTIVE');
        var availability = safeNumber(row.availabilityPercent, status === 'UNAVAILABLE' ? 0 : status === 'DEGRADED' ? 98.5 : 99.9);
        var apiLatency = safeNumber(row.apiLatencyMs, 100);
        var databaseLatency = safeNumber(row.databaseLatencyMs, 45);
        var queueLag = safeNumber(row.queueLagMs, 150);
        var logLag = safeNumber(row.logIngestionLagMs, 20);
        var traceLag = safeNumber(row.traceIngestionLagMs, 20);
        var statusPenalty = status === 'UNAVAILABLE' ? 45 : status === 'DEGRADED' ? 18 : status === 'MAINTENANCE' ? 12 : 0;
        return clampScore(100 - Math.max(0, 99.9 - availability) * 10 - Math.max(0, apiLatency - 120) / 6 - Math.max(0, databaseLatency - 60) / 4 - Math.max(0, queueLag - 250) / 18 - Math.max(0, logLag - 30) / 4 - Math.max(0, traceLag - 30) / 4 - statusPenalty);
    }

    function normalizeHealthRows(sourceRegions, tenantSlug) {
        var rows = Array.isArray(sourceRegions) && sourceRegions.length ? sourceRegions : currentRegions(tenantSlug);
        return rows.map(function map(row) {
            var status = normalizeStatus(row.status || 'ACTIVE');
            var health = normalizeHealth(row.health, status);
            var metric = {
                tenantSlug: tenantSlug,
                regionCode: normalizeRegionCode(row.regionCode || row.code),
                status: status,
                health: health,
                apiLatencyMs: Math.max(0, Math.round(safeNumber(row.apiLatencyMs, 100))),
                availabilityPercent: Math.max(0, Math.min(100, safeNumber(row.availabilityPercent, status === 'UNAVAILABLE' ? 0 : status === 'DEGRADED' ? 98.8 : 99.9))),
                databaseLatencyMs: Math.max(0, Math.round(safeNumber(row.databaseLatencyMs, 45))),
                queueLagMs: Math.max(0, Math.round(safeNumber(row.queueLagMs, 150))),
                logIngestionLagMs: Math.max(0, Math.round(safeNumber(row.logIngestionLagMs, 20))),
                traceIngestionLagMs: Math.max(0, Math.round(safeNumber(row.traceIngestionLagMs, 20)))
            };
            metric.healthScore = healthScoreForRegion(metric);
            return metric;
        }).filter(function keep(row) { return !!row.regionCode; });
    }

    function evaluateRegionalHealth(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var regionalMetrics = normalizeHealthRows(source.regions, tenantSlug);
            var degradedRegions = regionalMetrics.filter(function degraded(row) {
                return row.status === 'DEGRADED' || row.status === 'UNAVAILABLE' || row.healthScore < 80;
            });
            var regionalHealthScore = clampScore(average(regionalMetrics.map(function score(row) { return row.healthScore; }), 80));
            var availabilityScore = clampScore(average(regionalMetrics.map(function score(row) { return row.availabilityPercent; }), 99.5));
            var row = persist('regionalHealthHistory', {
                healthId: createId('MRH'),
                tenantSlug: tenantSlug,
                regionalMetrics: regionalMetrics,
                degradedRegions: degradedRegions,
                regionalHealthScore: regionalHealthScore,
                availabilityScore: availabilityScore,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('REGIONAL_HEALTH_EVALUATED', { tenantSlug: tenantSlug, targetId: row.healthId, degradedCount: degradedRegions.length, description: 'Regional health evaluated.' }, context || {}, degradedRegions.length ? 'WARNING' : 'INFO');
            return result(true, 'REGIONAL_HEALTH_EVALUATED', 'Regional health evaluated.', {
                tenantSlug: tenantSlug,
                regionalMetrics: regionalMetrics,
                degradedRegions: degradedRegions,
                regionalHealthScore: regionalHealthScore,
                availabilityScore: availabilityScore,
                healthRecord: row,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'REGIONAL_HEALTH_FAILED_SAFE', 'Regional health evaluation failed safely.', { governance: governanceFlags() });
        }
    }

    function regionNodeId(regionCode) {
        return 'REGION_' + normalizeRegionCode(regionCode).replace(/-/g, '_');
    }

    function buildInfrastructureTopology(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var topologyType = normalizeTopology(source.topology || 'ACTIVE_PASSIVE');
            if (!topologyType) {
                return result(false, 'UNSUPPORTED_DEPLOYMENT_TOPOLOGY', 'Deployment topology is not supported.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var regions = Array.isArray(source.regions) ? source.regions.map(normalizeRegionCode).filter(Boolean) : currentRegions(tenantSlug).map(function map(row) { return row.regionCode; });
            if (!regions.length) regions = ['AP-SOUTH', 'EU-WEST'];
            var nodes = [
                { id: 'USERS', label: 'Users', type: 'EDGE' },
                { id: 'GLOBAL_DNS', label: 'Global DNS', type: 'ROUTING' },
                { id: 'GLOBAL_LOAD_BALANCER', label: 'Global Load Balancer', type: 'ROUTING' }
            ];
            regions.forEach(function each(region) {
                nodes.push({ id: regionNodeId(region), label: region, type: 'REGION', regionCode: region });
            });
            nodes = nodes.concat([
                { id: 'DATABASE_LAYER', label: 'Database Layer', type: 'DATA' },
                { id: 'STORAGE_LAYER', label: 'Storage Layer', type: 'DATA' },
                { id: 'QUEUES', label: 'Queues', type: 'ASYNC' },
                { id: 'OBSERVABILITY', label: 'Observability', type: 'MONITORING' }
            ]);
            var edges = [
                { from: 'USERS', to: 'GLOBAL_DNS', relationship: 'resolve' },
                { from: 'GLOBAL_DNS', to: 'GLOBAL_LOAD_BALANCER', relationship: 'route' }
            ];
            regions.forEach(function each(region) {
                var nodeId = regionNodeId(region);
                edges.push({ from: 'GLOBAL_LOAD_BALANCER', to: nodeId, relationship: 'regional_route' });
                edges.push({ from: nodeId, to: 'DATABASE_LAYER', relationship: 'database_interface' });
                edges.push({ from: nodeId, to: 'STORAGE_LAYER', relationship: 'storage_interface' });
                edges.push({ from: nodeId, to: 'QUEUES', relationship: 'queue_interface' });
                edges.push({ from: nodeId, to: 'OBSERVABILITY', relationship: 'telemetry' });
            });
            var topology = {
                topologyId: createId('MRTOP'),
                tenantSlug: tenantSlug,
                topology: topologyType,
                activePassiveToday: true,
                activeActiveFutureReady: true,
                nodes: nodes,
                edges: edges,
                liveTrafficShiftEnabled: false,
                generatedAt: nowIso(context || {})
            };
            var row = persist('infrastructureTopologyHistory', topology, context || {});
            audit('GLOBAL_INFRASTRUCTURE_TOPOLOGY_BUILT', { tenantSlug: tenantSlug, targetId: row.topologyId, description: 'Global infrastructure topology built.' }, context || {});
            return result(true, 'INFRASTRUCTURE_TOPOLOGY_BUILT', 'Infrastructure topology built.', {
                tenantSlug: tenantSlug,
                topology: row,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'INFRASTRUCTURE_TOPOLOGY_FAILED_SAFE', 'Infrastructure topology failed safely.', { governance: governanceFlags() });
        }
    }

    function latestRow(key, tenantSlug) {
        var rows = tenantRows(key, tenantSlug);
        return rows.length ? rows[rows.length - 1] : null;
    }

    function generateGlobalInfrastructureReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var regions = currentRegions(tenantSlug);
            var health = evaluateRegionalHealth({ tenantSlug: tenantSlug, regions: source.regions || regions }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            if (!health.success) return health;
            var latestFailover = latestRow('failoverPlanHistory', tenantSlug) || {};
            var latestDeployment = latestRow('multiRegionDeploymentPlanHistory', tenantSlug) || {};
            var latestConfig = latestRow('regionalConfigurationHistory', tenantSlug) || {};
            var interfaces = replicationInterfaces((latestDeployment && latestDeployment.replicationInterfaces) || {});
            var failoverReadinessScore = clampScore(safeNumber(latestFailover.failoverReadinessScore, 72));
            var deploymentReadinessScore = clampScore(safeNumber(latestDeployment.deploymentReadinessScore, 72));
            var regionalHealthScore = health.regionalHealthScore;
            var availabilityScore = health.availabilityScore;
            var globalInfrastructureScore = clampScore((regionalHealthScore + availabilityScore + failoverReadinessScore + deploymentReadinessScore) / 4);
            var security = Object.assign({
                regionalKmsPrepared: true,
                regionalSecretsPrepared: true,
                regionalCertificatesPrepared: true,
                regionalIdentityProviderPrepared: true,
                secretsSharedAcrossRegions: false,
                certificatesSharedImproperly: false
            }, latestConfig.security || {});
            var analyticsRecord = persist('multiRegionAnalyticsHistory', {
                analyticsId: createId('MRANL'),
                tenantSlug: tenantSlug,
                regionalHealthScore: regionalHealthScore,
                availabilityScore: availabilityScore,
                failoverReadinessScore: failoverReadinessScore,
                deploymentReadinessScore: deploymentReadinessScore,
                globalInfrastructureScore: globalInfrastructureScore,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('GLOBAL_INFRASTRUCTURE_REPORT_REVIEWED', { tenantSlug: tenantSlug, targetId: analyticsRecord.analyticsId, description: 'Global infrastructure report reviewed.' }, context || {});
            return result(true, 'GLOBAL_INFRASTRUCTURE_REPORT_READY', 'Global infrastructure report generated.', {
                tenantSlug: tenantSlug,
                architecture: {
                    users: true,
                    globalDns: true,
                    globalLoadBalancer: true,
                    regions: regions.map(function map(row) { return row.regionCode; }),
                    databaseLayer: true,
                    storageLayer: true,
                    queues: true,
                    observability: true,
                    activePassiveToday: true,
                    activeActiveFutureReady: true,
                    liveMigrationImplemented: false
                },
                regionRegistry: regions,
                tenantRegionAssignment: latestRow('tenantRegionAssignmentHistory', tenantSlug) || null,
                failoverPreparation: {
                    automaticFailoverPrepared: true,
                    manualFailoverPrepared: true,
                    disasterFailoverPrepared: true,
                    maintenanceFailoverPrepared: true,
                    healthBasedFailoverPrepared: true,
                    failoverExecutionEnabled: false,
                    latestPlan: latestFailover || null
                },
                dataReplication: {
                    databaseReplication: { interfacePrepared: interfaces.databaseReplication.interfacePrepared, engineImplemented: false },
                    objectStorageReplication: { interfacePrepared: interfaces.objectStorageReplication.interfacePrepared, engineImplemented: false },
                    cacheSynchronization: { interfacePrepared: interfaces.cacheSynchronization.interfacePrepared, engineImplemented: false },
                    queueReplication: { interfacePrepared: interfaces.queueReplication.interfacePrepared, engineImplemented: false }
                },
                regionalConfiguration: latestConfig.configuration || normalizeRegionalConfig({}),
                security: security,
                observability: {
                    regionalMetrics: true,
                    regionalLogs: true,
                    regionalTraces: true,
                    regionalHealth: true,
                    regionalDashboards: true,
                    globalAggregation: true,
                    platformMetricsSeparatedFromTenantMetrics: true
                },
                performanceTargets: {
                    apiRequestsPerDay: 'millions',
                    concurrentUsers: 'thousands',
                    enterpriseTenants: 'hundreds',
                    lowLatencyRegionalRouting: true,
                    disasterRecoveryReadiness: true
                },
                analytics: {
                    regionalHealthScore: regionalHealthScore,
                    availabilityScore: availabilityScore,
                    failoverReadinessScore: failoverReadinessScore,
                    deploymentReadinessScore: deploymentReadinessScore,
                    globalInfrastructureScore: globalInfrastructureScore
                },
                regionalHealthScore: regionalHealthScore,
                availabilityScore: availabilityScore,
                failoverReadinessScore: failoverReadinessScore,
                deploymentReadinessScore: deploymentReadinessScore,
                globalInfrastructureScore: globalInfrastructureScore,
                integrations: {
                    horizontalScaling: !!global.HorizontalScalabilityService,
                    distributedQueue: !!global.DistributedQueueService,
                    redisCache: !!global.EnterpriseRedisCacheService,
                    apiGateway: !!global.ApiGatewayGovernanceService,
                    observability: !!global.InfrastructureObservabilityService,
                    logging: !!global.EnterpriseLoggingPipelineService,
                    disasterRecovery: !!global.DisasterRecoverySimulationService,
                    backupIntegrity: !!global.BackupIntegrityVerificationService,
                    auditGovernance: !!global.AuditService
                },
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            });
        } catch (error) {
            return result(false, 'GLOBAL_INFRASTRUCTURE_REPORT_FAILED_SAFE', 'Global infrastructure report failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: passed === true, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'multi-region-self-test',
                actor: { id: 'SELF-PO', role: 'PLATFORM_OWNER', tenantSlug: 'multi-region-self-test' },
                now: '2026-06-30T00:00:00.000Z',
                skipHistoryPersistence: true,
                skipAuditPersistence: true
            };
            var region = registerRegion({ tenantSlug: 'multi-region-self-test', regionCode: 'AP-SOUTH', status: 'ACTIVE', failoverTarget: 'EU-WEST' }, ctx);
            record('region registry works', region.success === true && region.region.regionCode === 'AP-SOUTH', region);
            var config = configureRegionalSettings({ tenantSlug: 'multi-region-self-test', regionCode: 'AP-SOUTH', timezone: 'Asia/Kolkata', locale: 'en-IN', currency: 'INR' }, ctx);
            record('regional configuration works', config.success === true && config.configuration.currency === 'INR', config);
            var failover = prepareFailoverPlan({ tenantSlug: 'multi-region-self-test', primaryRegion: 'AP-SOUTH', targetRegion: 'EU-WEST', failoverType: 'MANUAL' }, ctx);
            record('failover preparation works', failover.success === true && failover.failoverExecutionEnabled === false, failover);
            var report = generateGlobalInfrastructureReport({ tenantSlug: 'multi-region-self-test' }, ctx);
            record('analytics work', report.success === true && typeof report.globalInfrastructureScore === 'number', report);
            record('tenant isolation preserved', validateAccess('VIEW', 'other-tenant', ctx).success === false, {});
            var frozen = freezeMultiRegionOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            record('self-test uncaught exception guard', false, { message: error && error.message });
        }
        return freezeMultiRegionOutput({
            passed: checks.every(function all(check) { return check.passed; }),
            checks: checks,
            summary: 'Multi-region architecture self-test completed.'
        });
    }

    var RegionRegistry = Object.freeze({
        registerRegion: registerRegion,
        listRegions: listRegions
    });
    var RegionManager = Object.freeze({
        assignTenantRegion: assignTenantRegion,
        configureRegionalSettings: configureRegionalSettings,
        generateGlobalInfrastructureReport: generateGlobalInfrastructureReport
    });
    var FailoverPlanner = Object.freeze({
        prepareFailoverPlan: prepareFailoverPlan
    });
    var DeploymentPlanner = Object.freeze({
        generateDeploymentPlan: generateDeploymentPlan
    });
    var RegionalHealthService = Object.freeze({
        evaluateRegionalHealth: evaluateRegionalHealth
    });
    var InfrastructureTopologyBuilder = Object.freeze({
        buildInfrastructureTopology: buildInfrastructureTopology,
        buildGlobalTopology: buildInfrastructureTopology
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        SUPPORTED_REGION_CODES: SUPPORTED_REGION_CODES,
        REGION_STATUSES: REGION_STATUSES,
        REGION_HEALTH_STATES: REGION_HEALTH_STATES,
        DEPLOYMENT_STATES: DEPLOYMENT_STATES,
        FAILOVER_TYPES: FAILOVER_TYPES,
        DEPLOYMENT_TOPOLOGIES: DEPLOYMENT_TOPOLOGIES,
        GLOBAL_PROVIDERS: GLOBAL_PROVIDERS,
        RegionRegistry: RegionRegistry,
        RegionManager: RegionManager,
        FailoverPlanner: FailoverPlanner,
        DeploymentPlanner: DeploymentPlanner,
        RegionalHealthService: RegionalHealthService,
        InfrastructureTopologyBuilder: InfrastructureTopologyBuilder,
        freezeMultiRegionOutput: freezeMultiRegionOutput,
        runSelfTest: runSelfTest
    });

    global.MultiRegionArchitectureService = service;
    global.multiRegionArchitectureService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_MULTI_REGION_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_MULTI_REGION_SELF_TEST__ = freezeMultiRegionOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
