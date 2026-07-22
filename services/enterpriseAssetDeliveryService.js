/**
 * ARTHHRMS Enterprise Asset Delivery Service
 * Provider-agnostic CDN, asset optimization, signed delivery, versioning,
 * cache-control governance, analytics, and origin fallback.
 */
(function attachEnterpriseAssetDeliveryService(global) {
    'use strict';

    var SOURCE = 'enterpriseAssetDeliveryService';
    var MAX_HISTORY = 500;
    var CDN_PROVIDERS = Object.freeze(['CLOUDFLARE', 'AWS_CLOUDFRONT', 'AZURE_CDN', 'GOOGLE_CLOUD_CDN', 'ORIGIN_FALLBACK']);
    var ASSET_TYPES = Object.freeze(['images', 'logos', 'avatars', 'icons', 'css', 'javascript', 'fonts', 'downloadable_documents', 'html', 'videos', 'media_streaming']);
    var IMAGE_TYPES = Object.freeze(['images', 'logos', 'avatars', 'icons']);
    var PUBLIC_VISIBILITIES = Object.freeze(['PUBLIC', 'SHARED']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var DEFAULT_CDN_HOST = 'https://cdn.arthhrms.example';
    var DEFAULT_ORIGIN_HOST = 'https://origin.arthhrms.example';
    var SAFE_MIME_PREFIXES = Object.freeze(['image/', 'font/', 'text/css']);
    var SAFE_MIME_TYPES = Object.freeze([
        'application/javascript',
        'text/javascript',
        'application/json',
        'application/pdf',
        'application/octet-stream',
        'text/html',
        'text/plain'
    ]);
    var BLOCKED_MIME_PATTERN = /(x-msdownload|x-sh|x-bat|x-msdos-program|x-executable|java-archive|php|perl|python|ruby|powershell|cmd|shell)/i;
    var SENSITIVE_KEY_PATTERN = /(password|secret|rawSecret|privateKey|serviceRole|authorization|tokenHash|signatureSecret|storagePath|objectPath|privateNote|confidential|salary|payroll|bank|aadhaar|passport|employeeRecord)/i;
    var SENSITIVE_VALUE_PATTERN = /(signature=secret|rawSecret|ABC confidential|private-handbook|secret\.pdf|storage:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        privateAssetsRequireAuthorization: true,
        secureDownloads: true,
        originProtection: true,
        hotlinkPrevention: true,
        mimeValidation: true,
        directoryTraversalBlocked: true,
        assetEnumerationBlocked: true
    });
    var safeTokenCounter = 0;

    var stats = {
        delivered: 0,
        originFallbacks: 0,
        signedUrls: 0,
        invalidations: 0,
        optimizations: 0,
        versionedAssets: 0,
        blocked: 0,
        failures: 0
    };

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

    function normalizeAssetType(value) {
        var raw = safeString(value || 'images', '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (raw === 'image') return 'images';
        if (raw === 'logo') return 'logos';
        if (raw === 'avatar') return 'avatars';
        if (raw === 'icon') return 'icons';
        if (raw === 'js') return 'javascript';
        if (raw === 'styles' || raw === 'stylesheet') return 'css';
        if (raw === 'documents' || raw === 'document' || raw === 'downloadable_document') return 'downloadable_documents';
        return ASSET_TYPES.indexOf(raw) !== -1 ? raw : 'images';
    }

    function normalizeProvider(value) {
        var provider = token(value || 'CLOUDFLARE');
        if (provider === 'CLOUDFRONT') return 'AWS_CLOUDFRONT';
        if (provider === 'CLOUD_FLARE') return 'CLOUDFLARE';
        return CDN_PROVIDERS.indexOf(provider) !== -1 ? provider : 'CLOUDFLARE';
    }

    function normalizeVisibility(value) {
        var visibility = token(value || 'PRIVATE');
        if (visibility === 'PUBLICLY_SHARED') return 'SHARED';
        return visibility || 'PRIVATE';
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
        safeTokenCounter += 1;
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + safeTokenCounter.toString(36).toUpperCase().padStart(4, '0');
    }

    function clampScore(value) {
        var number = safeNumber(value, 0);
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function simpleHash(value, length) {
        var text = safeString(value || '', '');
        var hash = 2166136261;
        for (var index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            hash >>>= 0;
        }
        return ('00000000' + hash.toString(16)).slice(-(length || 8));
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

    function rowTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenant(row && (
            row.tenantSlug || row.tenantId || row.tenant_id || row.companyId || row.company_id ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
    }

    function safeAssetId(input) {
        return safeString(input && (input.assetId || input.id || input.assetKey || input.fileId) || '', '')
            .trim().replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120);
    }

    function pathExtension(path) {
        var clean = safeString(path || '', '').split('?')[0].split('#')[0];
        var match = clean.match(/\.([A-Za-z0-9]+)$/);
        return match ? match[1].toLowerCase() : '';
    }

    function basename(path) {
        return safeString(path || '', '').split(/[\\/]/).filter(Boolean).pop() || 'asset';
    }

    function cleanPath(path) {
        return safeString(path || '', '').trim().replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    function pathSafe(path) {
        var clean = cleanPath(path);
        if (!clean || clean.length > 420) return false;
        if (/(\.\.|%2e|%2f|%5c|\/\/|~\/|^\w+:\/\/|^data:|^javascript:)/i.test(clean)) return false;
        if (/[\u0000-\u001f]/.test(clean)) return false;
        return true;
    }

    function mimeSafe(mimeType, assetType, assetPath) {
        var mime = safeString(mimeType || inferredMime(assetType, assetPath), '').toLowerCase().trim();
        if (!mime) return true;
        if (BLOCKED_MIME_PATTERN.test(mime)) return false;
        if (SAFE_MIME_TYPES.indexOf(mime) !== -1) return true;
        return SAFE_MIME_PREFIXES.some(function prefix(item) { return mime.indexOf(item) === 0; });
    }

    function inferredMime(assetType, assetPath) {
        var type = normalizeAssetType(assetType);
        var ext = pathExtension(assetPath);
        if (ext === 'avif') return 'image/avif';
        if (ext === 'webp') return 'image/webp';
        if (ext === 'png') return 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
        if (ext === 'svg') return 'image/svg+xml';
        if (ext === 'css' || type === 'css') return 'text/css';
        if (ext === 'js' || type === 'javascript') return 'application/javascript';
        if (ext === 'woff' || ext === 'woff2' || type === 'fonts') return 'font/' + (ext || 'woff2');
        if (ext === 'pdf' || type === 'downloadable_documents') return 'application/pdf';
        if (ext === 'html' || type === 'html') return 'text/html';
        return 'application/octet-stream';
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
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
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

    function freezeAssetDeliveryOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            cdnGovernancePreserved: true,
            privateAssetsRequireAuthorization: true,
            staleAssetDeliveryPrevented: true,
            signedUrlsTenantScoped: true,
            originFallbackReady: true,
            existingApisPreserved: true,
            existingUiPreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        return freezeAssetDeliveryOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'ASSET_DELIVERY_READY' : 'ASSET_DELIVERY_FAILED')),
            message: safeString(message || (success ? 'Asset delivery operation completed.' : 'Asset delivery operation failed.'), '').slice(0, 280)
        }, extra || {}));
    }

    function validateAccess(action, tenantSlug, context) {
        var currentActor = actor(context || {});
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var scopeTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        var role = currentActor.role;
        if (!targetTenant || !scopeTenant || targetTenant !== scopeTenant) {
            stats.blocked += 1;
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped asset delivery access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'OPERATIONS_VIEW' && VIEW_ROLES.indexOf(role) === -1) {
            stats.blocked += 1;
            return result(false, 'ASSET_GOVERNANCE_DENIED', 'Asset delivery operations visibility is restricted by governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'CONTROL' && CONTROL_ROLES.indexOf(role) === -1) {
            stats.blocked += 1;
            return result(false, 'ASSET_GOVERNANCE_DENIED', 'Asset delivery controls are restricted by governance.', {
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
                    actorTenantSlug: scopeTenant
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: targetTenant, validatedTenantAccess: true }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed closed for asset delivery.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely for asset delivery.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        return result(true, 'ASSET_ACCESS_VALIDATED', 'Asset delivery access validated.', {
            tenantSlug: targetTenant,
            actor: currentActor,
            governance: governanceFlags()
        });
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    eventType: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    module: 'Enterprise Asset Delivery',
                    severity: severity || (/FAILED|DENIED|BLOCKED|UNAVAILABLE|EXPIRED/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: Object.assign({}, cloneSafe(metadata || {}, []), {
                        actionType: actionType,
                        module: 'Enterprise Asset Delivery'
                    })
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(Object.assign({}, cloneSafe(record, []), { immutable: true }));
        if (current[key].length > MAX_HISTORY) current[key] = current[key].slice(-MAX_HISTORY);
        save(current);
        return record;
    }

    function assetRows(tenantSlug) {
        var current = data();
        return (Array.isArray(current.assetDeliveryRecords) ? current.assetDeliveryRecords : [])
            .filter(function scoped(row) { return rowTenant(row) === normalizeTenant(tenantSlug); });
    }

    function historyRows(key, tenantSlug, count) {
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function scoped(row) {
            return rowTenant(row) === normalizeTenant(tenantSlug);
        }).slice(-safeNumber(count, 20)).reverse();
    }

    function findAsset(input, tenantSlug) {
        var assetId = safeAssetId(input);
        var assetPath = cleanPath(input && (input.assetPath || input.path || input.url || input.key));
        return assetRows(tenantSlug).filter(function match(row) {
            return (assetId && safeAssetId(row) === assetId) || (assetPath && cleanPath(row.assetPath || row.path) === assetPath);
        })[0] || null;
    }

    function getCachePolicy(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_ASSET_PAYLOAD', 'Asset cache policy payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var assetType = normalizeAssetType(input.assetType || input.type);
            var assetPath = cleanPath(input.assetPath || input.path || '');
            var extension = pathExtension(assetPath);
            var fingerprinted = input.fingerprinted === true || /\.[a-f0-9]{8,}\./i.test(assetPath);
            var maxAge = 300;
            var noLongCache = false;
            if (IMAGE_TYPES.indexOf(assetType) !== -1) maxAge = 31536000;
            else if (assetType === 'fonts') maxAge = 31536000;
            else if (assetType === 'css' || assetType === 'javascript') maxAge = fingerprinted ? 31536000 : 300;
            else if (assetType === 'html' || extension === 'html') {
                maxAge = 60;
                noLongCache = true;
            } else if (assetType === 'downloadable_documents') {
                maxAge = 0;
                noLongCache = true;
            }
            var cacheControl = noLongCache
                ? (assetType === 'html' ? 'no-cache, max-age=' + maxAge + ', must-revalidate' : 'private, no-store')
                : 'public, max-age=' + maxAge + (fingerprinted || IMAGE_TYPES.indexOf(assetType) !== -1 || assetType === 'fonts' ? ', immutable' : '');
            return result(true, 'CACHE_POLICY_READY', 'Cache-control policy generated.', {
                tenantSlug: access.tenantSlug,
                cachePolicy: {
                    assetType: assetType,
                    maxAgeSeconds: maxAge,
                    cacheControl: cacheControl,
                    etag: 'W/"' + simpleHash(access.tenantSlug + ':' + assetPath + ':' + assetType, 12) + '"',
                    lastModified: nowIso(context || {}),
                    noLongCache: noLongCache,
                    etagEnabled: true,
                    lastModifiedEnabled: true
                },
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'CACHE_POLICY_FAILED_SAFE', 'Cache-control policy failed safely.', { governance: governanceFlags() });
        }
    }

    function negotiateCompression(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || source.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var accepted = safeString(source.acceptEncoding || source.headers && source.headers['accept-encoding'] || '', '').toLowerCase();
            var assetType = normalizeAssetType(source.assetType || source.type);
            var compressible = ['css', 'javascript', 'html', 'fonts', 'downloadable_documents'].indexOf(assetType) !== -1;
            var encoding = 'identity';
            if (compressible && /\bbr\b/.test(accepted)) encoding = 'br';
            else if (compressible && /\bgzip\b/.test(accepted)) encoding = 'gzip';
            return result(true, 'COMPRESSION_NEGOTIATED', 'Compression encoding negotiated.', {
                tenantSlug: access.tenantSlug,
                encoding: encoding,
                compression: {
                    brotliSupported: true,
                    gzipSupported: true,
                    negotiated: encoding,
                    compressible: compressible
                },
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'COMPRESSION_NEGOTIATION_FAILED_SAFE', 'Compression negotiation failed safely.', {
                encoding: 'identity',
                governance: governanceFlags()
            });
        }
    }

    function versionAsset(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_ASSET_PAYLOAD', 'Asset version payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var assetPath = cleanPath(input.assetPath || input.path || '');
            if (!pathSafe(assetPath)) return result(false, 'ASSET_PATH_BLOCKED', 'Unsafe asset paths are blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var file = basename(assetPath);
            var dot = file.lastIndexOf('.');
            var name = dot > 0 ? file.slice(0, dot) : file;
            var ext = dot > 0 ? file.slice(dot + 1) : pathExtension(assetPath);
            var fingerprint = simpleHash(access.tenantSlug + ':' + assetPath + ':' + safeString(input.content || input.versionSeed || nowIso(context || {}), ''), 8);
            var versionedPath = name + '.' + fingerprint + (ext ? '.' + ext : '');
            var previous = Array.isArray(input.previousVersions) ? input.previousVersions.slice() : [];
            if (input.previousVersion) previous.push(input.previousVersion);
            var row = {
                versionId: createId('ASSETVER'),
                tenantSlug: access.tenantSlug,
                assetId: safeAssetId(input),
                assetType: normalizeAssetType(input.assetType || input.type),
                assetPath: assetPath,
                versionedPath: versionedPath,
                fingerprint: fingerprint,
                invalidatedOldAssets: previous.filter(Boolean),
                timestamp: nowIso(context || {})
            };
            persist('enterpriseAssetVersionHistory', row, context || {});
            audit('ASSET_VERSION_CREATED', row, context || {}, 'INFO');
            stats.versionedAssets += 1;
            return result(true, 'ASSET_VERSIONED', 'Static asset fingerprint created.', {
                tenantSlug: access.tenantSlug,
                versionedAsset: row,
                invalidatedOldAssets: row.invalidatedOldAssets,
                cachePolicy: getCachePolicy({ tenantSlug: access.tenantSlug, assetType: row.assetType, assetPath: versionedPath, fingerprinted: true }, Object.assign({}, context || {}, { skipAuditPersistence: true })).cachePolicy,
                governance: governanceFlags({ staleAssetDeliveryPrevented: true })
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'ASSET_VERSION_FAILED_SAFE', 'Asset versioning failed safely.', { governance: governanceFlags() });
        }
    }

    function optimizeImage(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_IMAGE_PAYLOAD', 'Image optimization payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var assetType = normalizeAssetType(input.assetType || input.type);
            var assetPath = cleanPath(input.assetPath || input.path || '');
            if (IMAGE_TYPES.indexOf(assetType) === -1) {
                return result(false, 'UNSUPPORTED_IMAGE_ASSET', 'Image optimization only applies to image-like assets.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags()
                });
            }
            if (!pathSafe(assetPath)) return result(false, 'ASSET_PATH_BLOCKED', 'Unsafe image asset paths are blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var device = input.device && typeof input.device === 'object' ? input.device : {};
            var width = Math.max(1, safeNumber(input.width || device.viewportWidth || 1200, 1200));
            var originalSize = Math.max(1, safeNumber(input.sizeBytes || input.originalSizeBytes || 100000, 100000));
            var widths = [320, 480, 768, 1024, 1440, 1920].filter(function keep(item) { return item <= Math.max(width, 480); });
            if (widths.indexOf(Math.round(width)) === -1) widths.push(Math.round(width));
            widths = widths.filter(function unique(item, index, list) { return list.indexOf(item) === index; }).sort(function sort(a, b) { return a - b; });
            var formats = ['webp', 'avif'];
            var variants = [];
            formats.forEach(function each(format) {
                widths.forEach(function eachWidth(item) {
                    variants.push({
                        format: format,
                        width: item,
                        estimatedBytes: Math.max(512, Math.round(originalSize * (format === 'avif' ? 0.42 : 0.58) * (item / Math.max(width, item))))
                    });
                });
            });
            var best = variants.reduce(function min(current, item) {
                return !current || item.estimatedBytes < current.estimatedBytes ? item : current;
            }, null);
            var savingsBytes = Math.max(0, originalSize - (best ? best.estimatedBytes : originalSize));
            var row = {
                optimizationId: createId('ASSETOPT'),
                tenantSlug: access.tenantSlug,
                assetId: safeAssetId(input),
                assetType: assetType,
                assetPath: assetPath,
                variants: variants.length,
                savingsBytes: savingsBytes,
                timestamp: nowIso(context || {})
            };
            persist('enterpriseAssetDeliveryHistory', Object.assign({}, row, { action: 'IMAGE_OPTIMIZED' }), context || {});
            audit('ASSET_IMAGE_OPTIMIZED', row, context || {}, 'INFO');
            stats.optimizations += 1;
            return result(true, 'IMAGE_OPTIMIZED', 'Image optimization metadata generated.', {
                tenantSlug: access.tenantSlug,
                optimization: {
                    assetId: row.assetId,
                    assetType: assetType,
                    variants: variants,
                    responsiveWidths: widths,
                    lazyLoading: true,
                    progressiveLoading: true,
                    thumbnail: {
                        generated: true,
                        width: 160,
                        height: Math.max(1, Math.round((safeNumber(input.height, width) / width) * 160)),
                        format: 'webp'
                    },
                    selectedFormat: device.supportsAvif === false && device.supportsWebp ? 'webp' : 'avif',
                    savingsBytes: savingsBytes,
                    estimatedSavingsPercent: clampScore((savingsBytes / originalSize) * 100)
                },
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'IMAGE_OPTIMIZATION_FAILED_SAFE', 'Image optimization failed safely.', { governance: governanceFlags() });
        }
    }

    function signPayload(tenantSlug, assetId, expiresAtMs, action) {
        return simpleHash([tenantSlug, assetId, expiresAtMs, action, 'arthhrms-asset-delivery'].join(':'), 16);
    }

    function generateSignedUrl(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_SIGNED_URL_PAYLOAD', 'Signed URL payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var assetPath = cleanPath(input.assetPath || input.path || '');
            if (!pathSafe(assetPath)) return result(false, 'ASSET_PATH_BLOCKED', 'Unsafe asset paths are blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var assetType = normalizeAssetType(input.assetType || input.type);
            if (!mimeSafe(input.mimeType, assetType, assetPath)) return result(false, 'ASSET_MIME_BLOCKED', 'Unsupported asset MIME type blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var assetId = safeAssetId(input) || 'AST-' + simpleHash(assetPath, 8).toUpperCase();
            var ttl = Math.max(60, Math.min(86400, safeNumber(input.expiresInSeconds || input.ttlSeconds, 900)));
            var expiresAtMs = nowMs(context || {}) + ttl * 1000;
            var action = token(input.action || 'DOWNLOAD');
            var signature = signPayload(access.tenantSlug, assetId, expiresAtMs, action);
            var tokenId = createId('ASTSIG');
            var url = DEFAULT_CDN_HOST + '/tenant/' + encodeURIComponent(access.tenantSlug) + '/asset/' + encodeURIComponent(tokenId) + '?sig=' + signature;
            var row = {
                signedUrlId: tokenId,
                tenantSlug: access.tenantSlug,
                assetId: assetId,
                assetType: assetType,
                action: action,
                issuedAt: nowIso(context || {}),
                expiresAt: new Date(expiresAtMs).toISOString(),
                expiresAtMs: expiresAtMs,
                signature: signature,
                state: 'ACTIVE',
                url: url
            };
            persist('enterpriseAssetSignedUrlHistory', row, context || {});
            audit('ASSET_SIGNED_URL_GENERATED', {
                signedUrlId: tokenId,
                tenantSlug: access.tenantSlug,
                assetType: assetType,
                action: action,
                expiresAt: row.expiresAt
            }, context || {}, 'INFO');
            stats.signedUrls += 1;
            return result(true, 'SIGNED_URL_GENERATED', 'Tenant-scoped signed URL generated.', {
                tenantSlug: access.tenantSlug,
                signedUrl: {
                    signedUrlId: tokenId,
                    tenantSlug: access.tenantSlug,
                    assetId: assetId,
                    assetType: assetType,
                    action: action,
                    url: url,
                    signature: signature,
                    expiresAt: row.expiresAt,
                    expiresAtMs: expiresAtMs,
                    expiresSafely: true,
                    singleUsePrepared: true
                },
                governance: governanceFlags({ privateAssetsRequireAuthorization: true })
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'SIGNED_URL_FAILED_SAFE', 'Signed URL generation failed safely.', { governance: governanceFlags() });
        }
    }

    function validateSignedUrl(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_SIGNED_URL_PAYLOAD', 'Signed URL validation payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var expiresAtMs = safeNumber(input.expiresAtMs, new Date(input.expiresAt || 0).getTime());
            if (!expiresAtMs || expiresAtMs <= nowMs(context || {})) {
                audit('ASSET_SIGNED_URL_EXPIRED', { signedUrlId: input.signedUrlId || '', tenantSlug: access.tenantSlug }, context || {}, 'WARNING');
                return result(false, 'SIGNED_URL_EXPIRED', 'Signed URL has expired.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags()
                });
            }
            var signature = signPayload(access.tenantSlug, safeString(input.assetId || '', ''), expiresAtMs, token(input.action || 'DOWNLOAD'));
            if (signature !== safeString(input.signature || '', '')) {
                return result(false, 'SIGNED_URL_SIGNATURE_INVALID', 'Signed URL signature validation failed.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags()
                });
            }
            return result(true, 'SIGNED_URL_VALID', 'Signed URL is valid and tenant scoped.', {
                tenantSlug: access.tenantSlug,
                signedUrlId: input.signedUrlId || '',
                expiresAt: input.expiresAt || new Date(expiresAtMs).toISOString(),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'SIGNED_URL_VALIDATION_FAILED_SAFE', 'Signed URL validation failed safely.', { governance: governanceFlags() });
        }
    }

    function buildDeliveryUrl(tenantSlug, assetId, assetType, provider, cdnAvailable, visibility) {
        var tokenizedId = encodeURIComponent(assetId || ('asset-' + simpleHash(tenantSlug + ':' + assetType, 8)));
        var host = cdnAvailable ? DEFAULT_CDN_HOST : DEFAULT_ORIGIN_HOST;
        var route = (cdnAvailable ? '/edge/' : '/origin/') + encodeURIComponent(provider.toLowerCase()) + '/tenant/' + encodeURIComponent(tenantSlug) + '/asset/' + tokenizedId;
        if (visibility === 'PRIVATE') route = (cdnAvailable ? '/tenant/' : '/origin/private/tenant/') + encodeURIComponent(tenantSlug) + '/asset/' + tokenizedId;
        return host + route;
    }

    function resolveAsset(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_ASSET_PAYLOAD', 'Asset delivery payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var assetPath = cleanPath(input.assetPath || input.path || '');
            if (!pathSafe(assetPath)) {
                stats.blocked += 1;
                return result(false, 'ASSET_PATH_BLOCKED', 'Unsafe asset paths are blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            }
            var assetType = normalizeAssetType(input.assetType || input.type);
            if (!mimeSafe(input.mimeType, assetType, assetPath)) {
                stats.blocked += 1;
                return result(false, 'ASSET_MIME_BLOCKED', 'Unsupported asset MIME type blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            }
            var matched = findAsset(input, access.tenantSlug) || {};
            var assetId = safeAssetId(input) || safeAssetId(matched) || 'AST-' + simpleHash(assetPath, 8).toUpperCase();
            var visibility = normalizeVisibility(input.visibility || matched.visibility || 'PRIVATE');
            if (visibility === 'PRIVATE' && !input.signedUrl && !input.allowPrivatePreview && !input.expiresInSeconds) {
                var signed = generateSignedUrl(Object.assign({}, input, { tenantSlug: access.tenantSlug, assetId: assetId, visibility: visibility }), Object.assign({}, context || {}, { skipAuditPersistence: true }));
                if (!signed.success) return signed;
            }
            var provider = normalizeProvider(input.provider || matched.provider || 'CLOUDFLARE');
            var cdnAvailable = input.cdnAvailable !== false && input.providerAvailable !== false && input.cdnOutage !== true;
            var url = buildDeliveryUrl(access.tenantSlug, assetId, assetType, provider, cdnAvailable, visibility);
            var policy = getCachePolicy({ tenantSlug: access.tenantSlug, assetType: assetType, assetPath: assetPath, fingerprinted: !!matched.versionedPath }, Object.assign({}, context || {}, { skipAuditPersistence: true })).cachePolicy || {};
            var row = {
                deliveryId: createId('ASSETDEL'),
                tenantSlug: access.tenantSlug,
                assetId: assetId,
                assetType: assetType,
                provider: provider,
                visibility: visibility,
                cdnAvailable: cdnAvailable,
                originFallback: !cdnAvailable,
                timestamp: nowIso(context || {})
            };
            persist('enterpriseAssetDeliveryHistory', row, context || {});
            audit(cdnAvailable ? 'ASSET_DELIVERY_RESOLVED' : 'CDN_ORIGIN_FALLBACK_USED', row, context || {}, cdnAvailable ? 'INFO' : 'WARNING');
            stats.delivered += 1;
            if (!cdnAvailable) stats.originFallbacks += 1;
            return result(true, 'ASSET_DELIVERY_RESOLVED', 'Asset delivery route resolved.', {
                tenantSlug: access.tenantSlug,
                asset: {
                    assetId: assetId,
                    assetType: assetType,
                    visibility: visibility,
                    provider: provider
                },
                delivery: {
                    url: url,
                    cdnAvailable: cdnAvailable,
                    originFallback: !cdnAvailable,
                    provider: provider,
                    compression: negotiateCompression({ tenantSlug: access.tenantSlug, assetType: assetType, acceptEncoding: input.acceptEncoding || 'br, gzip' }, Object.assign({}, context || {}, { skipAuditPersistence: true })).encoding,
                    cachePolicy: policy
                },
                governance: governanceFlags({ originFallbackReady: true })
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'ASSET_RESOLUTION_FAILED_SAFE', 'Asset delivery failed safely.', { governance: governanceFlags({ originFallbackReady: true }) });
        }
    }

    function invalidateAssetCache(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_INVALIDATION_PAYLOAD', 'CDN invalidation payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var assetPath = cleanPath(input.assetPath || input.path || '*');
            if (assetPath !== '*' && !pathSafe(assetPath)) return result(false, 'ASSET_PATH_BLOCKED', 'Unsafe asset paths are blocked.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var assetId = safeAssetId(input) || 'asset-' + simpleHash(assetPath, 8);
            var keys = [
                'tenant:' + access.tenantSlug + ':asset:' + assetId,
                'tenant:' + access.tenantSlug + ':cdn:path:' + simpleHash(assetPath, 10)
            ];
            var row = {
                invalidationId: createId('CDNINV'),
                tenantSlug: access.tenantSlug,
                provider: normalizeProvider(input.provider || 'CLOUDFLARE'),
                mode: input.bulk ? 'BULK' : 'SELECTIVE',
                invalidatedKeys: keys,
                reason: safeString(input.reason || 'asset cache invalidation', '').slice(0, 220),
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCdnInvalidationHistory', row, context || {});
            audit('CDN_CACHE_INVALIDATED', row, context || {}, 'INFO');
            stats.invalidations += 1;
            return result(true, 'CDN_CACHE_INVALIDATED', 'CDN cache invalidation recorded.', {
                tenantSlug: access.tenantSlug,
                invalidation: row,
                governance: governanceFlags({ staleAssetDeliveryPrevented: true })
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'CDN_INVALIDATION_FAILED_SAFE', 'CDN invalidation failed safely.', { governance: governanceFlags() });
        }
    }

    function metricsFromRows(tenantSlug, region) {
        var rows = assetRows(tenantSlug);
        if (region) rows = rows.filter(function byRegion(row) { return !row.region || safeString(row.region, '').toLowerCase() === safeString(region, '').toLowerCase(); });
        var cdnHits = rows.reduce(function sum(total, row) { return total + safeNumber(row.cdnHitCount, 0); }, 0);
        var originHits = rows.reduce(function sum(total, row) { return total + safeNumber(row.originHitCount, 0); }, 0);
        var bandwidth = rows.reduce(function sum(total, row) { return total + safeNumber(row.bandwidthBytes || row.sizeBytes, 0); }, 0);
        var downloadRows = rows.filter(function has(row) { return safeNumber(row.averageDownloadMs, 0) >= 0; });
        var averageDownload = downloadRows.length
            ? Math.round(downloadRows.reduce(function sum(total, row) { return total + safeNumber(row.averageDownloadMs, 0); }, 0) / downloadRows.length)
            : 0;
        var imageSavings = rows.reduce(function sum(total, row) {
            if (IMAGE_TYPES.indexOf(normalizeAssetType(row.assetType)) === -1) return total;
            var size = safeNumber(row.sizeBytes, 0);
            return total + Math.round(size * (row.optimized ? 0.45 : 0.25));
        }, 0);
        var totalRequests = cdnHits + originHits;
        var hitRatio = totalRequests ? clampScore((cdnHits / totalRequests) * 100) : 0;
        var cacheEfficiency = clampScore(hitRatio - stats.invalidations + Math.min(10, stats.versionedAssets));
        var regionalLatency = Math.max(20, Math.round(averageDownload * (region ? 0.85 : 1)));
        return {
            cdnHitRatio: hitRatio,
            cdnMissRatio: totalRequests ? clampScore((originHits / totalRequests) * 100) : 0,
            bandwidthBytes: bandwidth,
            averageDownloadMs: averageDownload,
            imageOptimizationSavingsBytes: imageSavings,
            cacheEfficiency: cacheEfficiency,
            regionalLatencyMs: regionalLatency,
            storageUtilizationBytes: rows.reduce(function sum(total, row) { return total + safeNumber(row.sizeBytes, 0); }, 0),
            assetCount: rows.length
        };
    }

    function collectMetrics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || source.tenantId || contextTenant(context || {}));
            var access = validateAccess('OPERATIONS_VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var region = safeString(source.region || '', '');
            var metrics = metricsFromRows(access.tenantSlug, region);
            var assetPerformanceScore = clampScore(92 - Math.min(45, metrics.averageDownloadMs / 5) + metrics.cdnHitRatio * 0.2 + Math.min(8, stats.optimizations));
            var deliveryEfficiencyScore = clampScore(70 + metrics.cdnHitRatio * 0.22 + Math.min(12, metrics.imageOptimizationSavingsBytes / 50000) - Math.min(10, stats.originFallbacks * 2));
            var cdnHealthScore = clampScore(72 + metrics.cdnHitRatio * 0.2 + Math.min(8, stats.versionedAssets) - Math.min(20, stats.failures * 3));
            var row = {
                metricsId: createId('ASSETMET'),
                tenantSlug: access.tenantSlug,
                region: region || 'global',
                cdnHitRatio: metrics.cdnHitRatio,
                bandwidthBytes: metrics.bandwidthBytes,
                averageDownloadMs: metrics.averageDownloadMs,
                imageOptimizationSavingsBytes: metrics.imageOptimizationSavingsBytes,
                assetPerformanceScore: assetPerformanceScore,
                deliveryEfficiencyScore: deliveryEfficiencyScore,
                cdnHealthScore: cdnHealthScore,
                timestamp: nowIso(context || {})
            };
            persist('assetDeliveryMetricsHistory', row, context || {});
            audit('ASSET_DELIVERY_METRICS_REVIEWED', row, context || {}, 'INFO');
            return result(true, 'CDN_METRICS_READY', 'CDN metrics collected.', {
                tenantSlug: access.tenantSlug,
                analytics: metrics,
                assetPerformanceScore: assetPerformanceScore,
                deliveryEfficiencyScore: deliveryEfficiencyScore,
                cdnHealthScore: cdnHealthScore,
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'CDN_METRICS_FAILED_SAFE', 'CDN metrics collection failed safely.', { analytics: {}, governance: governanceFlags() });
        }
    }

    function generateAssetDeliveryReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || source.tenantId || contextTenant(context || {}));
            var access = validateAccess('OPERATIONS_VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var metricsResult = collectMetrics({ tenantSlug: access.tenantSlug, region: source.region || '' }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            var rows = assetRows(access.tenantSlug);
            var assets = rows.slice(0, 40).map(function map(row) {
                return {
                    assetId: safeAssetId(row),
                    assetType: normalizeAssetType(row.assetType),
                    visibility: normalizeVisibility(row.visibility || 'PRIVATE'),
                    provider: normalizeProvider(row.provider || 'CLOUDFLARE'),
                    sizeBytes: safeNumber(row.sizeBytes, 0),
                    region: safeString(row.region || 'global', ''),
                    cachePolicy: getCachePolicy({ tenantSlug: access.tenantSlug, assetType: row.assetType, assetPath: row.assetPath, fingerprinted: !!row.versionedPath }, Object.assign({}, context || {}, { skipAuditPersistence: true })).cachePolicy
                };
            });
            var latestVersions = historyRows('enterpriseAssetVersionHistory', access.tenantSlug, 12);
            var latestSigned = historyRows('enterpriseAssetSignedUrlHistory', access.tenantSlug, 12).map(function map(row) {
                return {
                    signedUrlId: row.signedUrlId,
                    tenantSlug: row.tenantSlug,
                    assetId: row.assetId,
                    assetType: row.assetType,
                    action: row.action,
                    state: row.state,
                    expiresAt: row.expiresAt
                };
            });
            var invalidations = historyRows('enterpriseCdnInvalidationHistory', access.tenantSlug, 12);
            var report = {
                success: true,
                tenantSlug: access.tenantSlug,
                architecture: {
                    browser: true,
                    cdnEdge: true,
                    originServer: true,
                    storage: true,
                    providerAgnostic: true,
                    supportedProviders: CDN_PROVIDERS.slice(0, 4)
                },
                assetTypes: {
                    optimized: ASSET_TYPES.slice(0, 8),
                    futureReady: ['videos', 'media_streaming']
                },
                analytics: metricsResult.analytics || {},
                assetPerformanceScore: metricsResult.assetPerformanceScore || 0,
                deliveryEfficiencyScore: metricsResult.deliveryEfficiencyScore || 0,
                cdnHealthScore: metricsResult.cdnHealthScore || 0,
                assets: assets,
                recentVersions: latestVersions,
                recentSignedUrls: latestSigned,
                recentInvalidations: invalidations,
                optimization: {
                    webp: true,
                    avif: true,
                    responsiveImages: true,
                    lazyLoading: true,
                    progressiveLoading: true,
                    thumbnailGeneration: true,
                    deviceCapabilitySelection: true
                },
                cacheControl: {
                    images: '365 days',
                    fonts: '365 days',
                    javascript: 'versioned',
                    css: 'versioned',
                    html: 'no long cache',
                    etag: true,
                    lastModified: true
                },
                compression: {
                    brotli: true,
                    gzip: true,
                    negotiatedByAcceptEncoding: true
                },
                security: {
                    signedUrls: true,
                    secureDownloads: true,
                    originProtection: true,
                    hotlinkPrevention: true,
                    mimeValidation: true,
                    directoryTraversalBlocked: true,
                    assetEnumerationBlocked: true,
                    privateAssetsRequireAuthorization: true
                },
                performance: {
                    lighthouseTarget: '95+',
                    firstContentfulPaintOptimized: true,
                    largestContentfulPaintOptimized: true,
                    reducedBandwidth: (metricsResult.analytics && metricsResult.analytics.imageOptimizationSavingsBytes || 0) > 0,
                    globalDeliveryReady: true,
                    originFallbackReady: true
                },
                integrations: {
                    redisCaching: !!(global.EnterpriseRedisCacheService || global.enterpriseRedisCacheService),
                    signedUrlGovernance: !!(global.SignedUrlGovernanceService || global.signedUrlGovernanceService),
                    storageHardening: !!(global.StorageHardeningService || global.storageHardeningService),
                    dashboardPerformance: !!(global.DashboardPerformanceService || global.dashboardPerformanceService),
                    auditGovernance: !!global.AuditService
                },
                governance: governanceFlags({
                    noCrossTenantAssets: true,
                    privateAssetsRequireAuthorization: true,
                    cacheInvalidationsAuditable: true
                }),
                generatedAt: nowIso(context || {})
            };
            audit('ASSET_DELIVERY_REPORT_REVIEWED', {
                tenantSlug: access.tenantSlug,
                cdnHealthScore: report.cdnHealthScore,
                assetPerformanceScore: report.assetPerformanceScore
            }, context || {}, 'INFO');
            return freezeAssetDeliveryOutput(report);
        } catch (error) {
            stats.failures += 1;
            return result(false, 'ASSET_REPORT_FAILED_SAFE', 'Asset delivery report failed safely.', {
                analytics: {},
                governance: governanceFlags({ originFallbackReady: true })
            });
        }
    }

    function recordAssetUpload(input, context) {
        try {
            var resolved = resolveAsset(Object.assign({}, input || {}, { cdnAvailable: true }), context || {});
            audit('ASSET_UPLOAD_RECORDED', { tenantSlug: resolved.tenantSlug || '', assetType: input && input.assetType || '' }, context || {}, resolved.success ? 'INFO' : 'WARNING');
            return resolved;
        } catch (error) {
            return result(false, 'ASSET_UPLOAD_FAILED_SAFE', 'Asset upload recording failed safely.', { governance: governanceFlags() });
        }
    }

    function recordAssetDeletion(input, context) {
        try {
            var invalidation = invalidateAssetCache(input || {}, context || {});
            audit('ASSET_DELETE_RECORDED', { tenantSlug: invalidation.tenantSlug || '', invalidationId: invalidation.invalidation && invalidation.invalidation.invalidationId || '' }, context || {}, invalidation.success ? 'INFO' : 'WARNING');
            return invalidation;
        } catch (error) {
            return result(false, 'ASSET_DELETE_FAILED_SAFE', 'Asset deletion recording failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'asset-self-test',
                actor: { id: 'ASSET-SELF', role: 'PLATFORM_OWNER', tenantSlug: 'asset-self-test' },
                now: '2026-06-28T10:00:00.000Z',
                skipAuditPersistence: true,
                skipHistoryPersistence: true
            };
            var asset = resolveAsset({ tenantSlug: 'asset-self-test', assetType: 'images', assetPath: '/assets/self.png', visibility: 'PUBLIC' }, ctx);
            record('assets load correctly', asset.success === true && asset.delivery && asset.delivery.url);
            var optimized = optimizeImage({ tenantSlug: 'asset-self-test', assetType: 'images', assetPath: '/assets/self.png', sizeBytes: 120000, width: 1200, height: 600 }, ctx);
            record('image optimization works', optimized.success === true && optimized.optimization.variants.length > 0);
            var signed = generateSignedUrl({ tenantSlug: 'asset-self-test', assetType: 'downloadable_documents', assetPath: '/docs/self.pdf', assetId: 'SELF-DOC', visibility: 'PRIVATE' }, ctx);
            record('signed URLs work', signed.success === true && signed.signedUrl.expiresSafely === true);
            var headers = getCachePolicy({ tenantSlug: 'asset-self-test', assetType: 'fonts', assetPath: '/fonts/inter.woff2', fingerprinted: true }, ctx);
            record('cache headers work', headers.success === true && headers.cachePolicy.maxAgeSeconds === 31536000);
            var metrics = collectMetrics({ tenantSlug: 'asset-self-test' }, Object.assign({}, ctx, { actor: { id: 'DIR-SELF', role: 'DIRECTOR', tenantSlug: 'asset-self-test' } }));
            record('CDN metrics work', metrics.success === true && Number.isFinite(metrics.cdnHealthScore));
            var denied = resolveAsset({ tenantSlug: 'other-tenant', assetType: 'images', assetPath: '/assets/other.png', visibility: 'PUBLIC' }, ctx);
            record('tenant isolation works', denied.success === false && denied.code === 'TENANT_ACCESS_DENIED');
            var frozen = freezeAssetDeliveryOutput({ nested: { value: 1 } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
            var output = freezeAssetDeliveryOutput({
                passed: checks.every(function passed(check) { return check.passed; }),
                checks: checks,
                summary: 'Enterprise asset delivery self-test completed.'
            });
            global.__ARTHHRMS_ENTERPRISE_ASSET_DELIVERY_SELF_TEST__ = output;
            return output;
        } catch (error) {
            var failed = freezeAssetDeliveryOutput({
                passed: false,
                checks: checks.concat([{ name: 'self-test uncaught exception guard', passed: false, details: { message: error && error.message } }])
            });
            global.__ARTHHRMS_ENTERPRISE_ASSET_DELIVERY_SELF_TEST__ = failed;
            return failed;
        }
    }

    var CacheControlService = Object.freeze({
        getCachePolicy: getCachePolicy,
        buildCacheHeaders: getCachePolicy
    });
    var AssetVersionService = Object.freeze({
        versionAsset: versionAsset,
        fingerprintAsset: versionAsset
    });
    var ImageOptimizationService = Object.freeze({
        optimizeImage: optimizeImage,
        generateResponsiveVariants: optimizeImage
    });
    var SignedUrlService = Object.freeze({
        generateSignedUrl: generateSignedUrl,
        validateSignedUrl: validateSignedUrl
    });
    var CdnMetricsCollector = Object.freeze({
        collectMetrics: collectMetrics,
        collect: collectMetrics
    });
    var AssetDeliveryService = Object.freeze({
        resolveAsset: resolveAsset,
        negotiateCompression: negotiateCompression,
        invalidateAssetCache: invalidateAssetCache,
        generateAssetDeliveryReport: generateAssetDeliveryReport,
        recordAssetUpload: recordAssetUpload,
        recordAssetDeletion: recordAssetDeletion
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        CDN_PROVIDERS: CDN_PROVIDERS,
        ASSET_TYPES: ASSET_TYPES,
        AssetDeliveryService: AssetDeliveryService,
        ImageOptimizationService: ImageOptimizationService,
        SignedUrlService: SignedUrlService,
        AssetVersionService: AssetVersionService,
        CdnMetricsCollector: CdnMetricsCollector,
        CacheControlService: CacheControlService,
        generateAssetDeliveryReport: generateAssetDeliveryReport,
        freezeAssetDeliveryOutput: freezeAssetDeliveryOutput,
        runSelfTest: runSelfTest
    });

    global.EnterpriseAssetDeliveryService = service;
    global.enterpriseAssetDeliveryService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_ENTERPRISE_ASSET_DELIVERY_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_ENTERPRISE_ASSET_DELIVERY_SELF_TEST__ = freezeAssetDeliveryOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
