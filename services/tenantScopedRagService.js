/**
 * ARTHHRMS Tenant Scoped RAG Foundation.
 * Provides tenant-isolated knowledge ingestion, parsing, chunking, provider-neutral
 * embedding/vector abstractions, semantic search primitives, and governance
 * analytics without generating AI answers or calling external LLM providers.
 */
(function attachTenantScopedRagService(global) {
    'use strict';

    var SOURCE = 'tenantScopedRagService';
    var VERSION = '1.0.0';
    var MAX_HISTORY = 1400;
    var MAX_FILE_BYTES = 25 * 1024 * 1024;
    var DEFAULT_CHUNK_SIZE = 900;
    var DEFAULT_SLIDING_OVERLAP = 120;
    var VECTOR_DIMENSIONS = 12;
    var KNOWLEDGE_SOURCE_TYPES = Object.freeze([
        'EMPLOYEE_HANDBOOK',
        'HR_POLICY',
        'LEAVE_POLICY',
        'PAYROLL_POLICY',
        'SOP_DOCUMENT',
        'TRAINING_DOCUMENT',
        'COMPLIANCE_DOCUMENT',
        'ORGANIZATION_ANNOUNCEMENT',
        'DEPARTMENT_DOCUMENT',
        'UPLOADED_PDF'
    ]);
    var FUTURE_KNOWLEDGE_SOURCES = Object.freeze(['EMAIL', 'WIKI', 'SHAREPOINT', 'GOOGLE_DRIVE', 'CONFLUENCE']);
    var SUPPORTED_DOCUMENT_FORMATS = Object.freeze(['PDF', 'DOCX', 'TXT', 'MARKDOWN']);
    var SUPPORTED_EXTENSIONS = Object.freeze(['pdf', 'docx', 'txt', 'md', 'markdown']);
    var SUPPORTED_MIME_TYPES = Object.freeze([
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
        'application/markdown'
    ]);
    var CHUNKING_STRATEGIES = Object.freeze(['FIXED_SIZE', 'SLIDING_WINDOW', 'SEMANTIC_FUTURE']);
    var VECTOR_PROVIDERS = Object.freeze(['PGVECTOR', 'PINECONE', 'WEAVIATE', 'QDRANT', 'CHROMADB', 'MILVUS']);
    var EMBEDDING_PROVIDERS = Object.freeze(['OPENAI', 'GEMINI', 'VOYAGE_AI', 'COHERE', 'BAAI', 'LOCAL']);
    var SEARCH_MODES = Object.freeze(['KEYWORD', 'VECTOR', 'HYBRID']);
    var DOCUMENT_STATUSES = Object.freeze(['UPLOADED', 'EXTRACTED', 'CHUNKED', 'INDEXED', 'ARCHIVED', 'FAILED']);
    var INDEX_STATUSES = Object.freeze(['PENDING', 'EXTRACTED', 'CHUNKED', 'VECTOR_READY', 'INDEXED', 'FAILED']);
    var EMBEDDING_STATUSES = Object.freeze(['NOT_REQUESTED', 'QUEUED', 'READY_FOR_PROVIDER', 'FAILED']);
    var APPROVAL_STATUSES = Object.freeze(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR', 'MANAGER', 'EMPLOYEE']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var SENSITIVE_KEY_PATTERN = /(password|api.?key|private.?key|credential|token|authorization|cookie|session.?id|secretKey|secretValue|clientSecret|rawPayload|payloadBody|bank|aadhaar|ssn|passport|salaryAmount)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?[a-z0-9._=-]+|api[-_ ]?key[-_ ]?[a-z0-9._=-]+|password\s*[:=]\s*\S+|authorization\s*[:=]|private knowledge|tenant\s+[a-z0-9_-]+\s+only|never expose)/ig;
    var STOP_WORDS = Object.freeze(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'after', 'before', 'must', 'shall', 'are', 'is', 'to', 'of', 'in', 'on', 'by', 'a', 'an']);
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

    function normalizeSourceType(value) {
        var source = token(value || 'DEPARTMENT_DOCUMENT');
        if (source === 'PDF' || source === 'UPLOADED_DOCUMENT') source = 'UPLOADED_PDF';
        if (KNOWLEDGE_SOURCE_TYPES.indexOf(source) !== -1) return source;
        return 'DEPARTMENT_DOCUMENT';
    }

    function extensionOf(source) {
        var explicit = safeString(source && (source.extension || source.fileExtension || source.ext), '').trim().toLowerCase().replace(/^\./, '');
        if (explicit) return explicit;
        var name = safeString(source && (source.fileName || source.name || source.title), '').trim().toLowerCase();
        var match = name.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : '';
    }

    function normalizeDocumentType(value, source) {
        var type = token(value || (source && (source.documentType || source.type)) || '');
        var extension = extensionOf(source || {});
        if (!type && extension) type = extension === 'md' || extension === 'markdown' ? 'MARKDOWN' : extension.toUpperCase();
        if (type === 'MD') type = 'MARKDOWN';
        if (SUPPORTED_DOCUMENT_FORMATS.indexOf(type) !== -1) return type;
        if (extension === 'md' || extension === 'markdown') return 'MARKDOWN';
        if (extension === 'pdf') return 'PDF';
        if (extension === 'docx') return 'DOCX';
        if (extension === 'txt') return 'TXT';
        return type || 'TXT';
    }

    function normalizeStrategy(value) {
        var strategy = token(value || 'FIXED_SIZE');
        if (strategy === 'SLIDING') strategy = 'SLIDING_WINDOW';
        if (strategy === 'SEMANTIC') strategy = 'SEMANTIC_FUTURE';
        return CHUNKING_STRATEGIES.indexOf(strategy) !== -1 ? strategy : 'FIXED_SIZE';
    }

    function normalizeProvider(value) {
        var provider = token(value || 'PGVECTOR');
        if (provider === 'CHROMA') provider = 'CHROMADB';
        return VECTOR_PROVIDERS.indexOf(provider) !== -1 ? provider : 'PGVECTOR';
    }

    function normalizeEmbeddingProvider(value) {
        var provider = token(value || 'LOCAL');
        if (provider === 'LOCAL_MODEL' || provider === 'LOCAL_EMBEDDINGS') provider = 'LOCAL';
        return EMBEDDING_PROVIDERS.indexOf(provider) !== -1 ? provider : 'LOCAL';
    }

    function normalizeSearchMode(value) {
        var mode = token(value || 'HYBRID');
        return SEARCH_MODES.indexOf(mode) !== -1 ? mode : 'HYBRID';
    }

    function normalizeApprovalStatus(value) {
        var status = token(value || 'PENDING');
        return APPROVAL_STATUSES.indexOf(status) !== -1 ? status : 'PENDING';
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

    function hashString(value) {
        var text = safeString(value || '', '');
        var hash = 2166136261;
        for (var i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8).toUpperCase();
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

    function unique(values) {
        var seen = {};
        return (Array.isArray(values) ? values : []).map(function map(value) {
            return safeString(value || '', '').trim();
        }).filter(function keep(value) {
            var key = value.toLowerCase();
            if (!value || seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 3000);
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

    function freezeKnowledgeOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacAuthoritative: true,
            auditGovernancePreserved: true,
            aiGenerationDisabled: true,
            answerGenerationEnabled: false,
            externalLlmCallsDisabled: true,
            externalEmbeddingCallsDisabled: true,
            noExternalLlmCalls: true,
            providerNeutralVectorStore: true,
            providerNeutralEmbeddingInterface: true,
            crossTenantSearchBlocked: true,
            existingModulesPreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'KNOWLEDGE_OPERATION_READY' : 'KNOWLEDGE_OPERATION_FAILED'));
        return freezeKnowledgeOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'Knowledge operation completed.' : 'Knowledge operation failed.'), '').slice(0, 320)
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

    function validationRegistry() {
        try { return global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService || null; }
        catch (error) { return null; }
    }

    function validateAccess(action, tenantSlug, context) {
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var actorTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        if (!targetTenant || !actorTenant || targetTenant !== actorTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped knowledge access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        var mode = token(action || 'VIEW');
        var roles = mode === 'CONTROL' ? CONTROL_ROLES : VIEW_ROLES;
        if (roles.indexOf(currentActor.role) === -1) {
            return result(false, 'KNOWLEDGE_PERMISSION_DENIED', 'The current role cannot perform this knowledge operation.', {
                tenantSlug: targetTenant,
                actor: currentActor,
                governance: governanceFlags()
            });
        }
        try {
            var registry = validationRegistry();
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: targetTenant,
                    ownerTenantSlug: targetTenant,
                    actorTenantSlug: actorTenant
                }, { source: SOURCE, action: mode }, context || {});
                if (validation && validation.success === false) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Validation registry denied tenant-scoped knowledge access.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely for knowledge governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        return result(true, 'KNOWLEDGE_ACCESS_GRANTED', 'Tenant-scoped knowledge access granted.', {
            tenantSlug: targetTenant,
            actor: currentActor,
            action: mode,
            governance: governanceFlags()
        });
    }

    function persist(collection, row, context) {
        var record = cloneSafe(row || {}, []);
        if (context && context.skipHistoryPersistence) return record;
        var store = data();
        if (!Array.isArray(store[collection])) store[collection] = [];
        store[collection].push(Object.assign({
            immutable: true,
            source: SOURCE,
            recordedAt: nowIso(context || {})
        }, record));
        if (store[collection].length > MAX_HISTORY) store[collection] = store[collection].slice(-MAX_HISTORY);
        save(store);
        return record;
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return;
        try {
            var payload = cloneSafe(metadata || {}, []);
            var tenantSlug = normalizeTenant(payload.tenantSlug || contextTenant(context || {}));
            var currentActor = actor(context || {});
            var entry = {
                id: createId('AUD-KNOW'),
                logId: createId('LOG-KNOW'),
                actionType: token(actionType || 'KNOWLEDGE_EVENT'),
                module: 'Knowledge Intelligence',
                severity: token(severity || 'INFO'),
                tenantSlug: tenantSlug,
                actorId: currentActor.id,
                actorRole: currentActor.role,
                description: safeString(payload.description || actionType || 'Knowledge governance event', '').slice(0, 320),
                metadata: payload,
                createdAt: nowIso(context || {}),
                immutable: true
            };
            var store = data();
            if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
            store.auditLogs.push(entry);
            if (store.auditLogs.length > MAX_HISTORY) store.auditLogs = store.auditLogs.slice(-MAX_HISTORY);
            save(store);
        } catch (error) {}
    }

    function writeStructuredLog(level, action, metadata, context) {
        try {
            var logger = global.EnterpriseLoggingPipelineService || global.enterpriseLoggingPipelineService;
            if (logger && logger.StructuredLogger && typeof logger.StructuredLogger.writeLog === 'function') {
                logger.StructuredLogger.writeLog({
                    tenantSlug: metadata && metadata.tenantSlug || contextTenant(context || {}),
                    level: level || 'INFO',
                    category: 'APPLICATION',
                    service: 'knowledge-intelligence',
                    module: 'Tenant Scoped RAG',
                    action: action,
                    message: safeString(action || 'Knowledge event', ''),
                    metadata: metadata || {}
                }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: false }));
            }
        } catch (error) {}
    }

    function mimeTypeOf(source) {
        return safeString(source && (source.mimeType || source.contentType || source.typeMime), '').trim().toLowerCase();
    }

    function supportedFormat(source) {
        var extension = extensionOf(source || {});
        var mimeType = mimeTypeOf(source || {});
        var documentType = normalizeDocumentType(source && source.documentType, source || {});
        if (SUPPORTED_DOCUMENT_FORMATS.indexOf(documentType) === -1) return false;
        if (extension && SUPPORTED_EXTENSIONS.indexOf(extension) === -1) return false;
        if (mimeType && SUPPORTED_MIME_TYPES.indexOf(mimeType) === -1) return false;
        return true;
    }

    function normalizeTags(value) {
        if (Array.isArray(value)) return unique(value).slice(0, 24);
        return unique(safeString(value || '', '').split(/[,|]/)).slice(0, 24);
    }

    function normalizeMetadata(source, existing) {
        var payload = source || {};
        var merged = Object.assign({}, existing || {}, payload);
        var extension = extensionOf(payload) || extensionOf(existing || {});
        var documentType = normalizeDocumentType(payload.documentType || payload.type || existing && existing.documentType, merged);
        if (!extension) extension = documentType === 'MARKDOWN' ? 'md' : documentType.toLowerCase();
        return {
            title: safeString(payload.title || payload.name || payload.fileName || existing && existing.title || 'Untitled Knowledge Document', '').trim().slice(0, 220),
            fileName: safeString(payload.fileName || payload.name || existing && existing.fileName || 'knowledge-document.' + extension, '').trim().slice(0, 240),
            fileExtension: extension,
            mimeType: mimeTypeOf(payload) || mimeTypeOf(existing || {}) || (documentType === 'PDF' ? 'application/pdf' : documentType === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : documentType === 'MARKDOWN' ? 'text/markdown' : 'text/plain'),
            sourceType: normalizeSourceType(payload.sourceType || existing && existing.sourceType),
            documentType: documentType,
            policyType: safeString(payload.policyType || payload.category || existing && existing.policyType || '', '').trim().slice(0, 120),
            department: safeString(payload.department || existing && existing.department || '', '').trim().slice(0, 120),
            ownerId: safeString(payload.ownerId || payload.ownerEmpId || payload.createdBy || existing && existing.ownerId || '', '').trim().slice(0, 160),
            tags: normalizeTags(payload.tags || existing && existing.tags || []),
            createdDate: safeString(payload.createdDate || payload.createdAt || existing && existing.createdDate || '', '').slice(0, 40),
            approvalStatus: normalizeApprovalStatus(payload.approvalStatus || payload.approval || existing && existing.approvalStatus || 'PENDING'),
            retention: cloneSafe(payload.retention || existing && existing.retention || {}, []),
            archive: cloneSafe(payload.archive || existing && existing.archive || {}, []),
            version: Math.max(1, safeNumber(payload.version || existing && existing.version, 1))
        };
    }

    function sourceText(source, document) {
        return safeString(
            source && (source.text || source.content || source.body || source.documentText || source.extractedText) ||
            document && (document.extractedText || document.textContent || document.content || document.body) ||
            '',
            ''
        );
    }

    function latestById(rows, key) {
        var map = {};
        (Array.isArray(rows) ? rows : []).forEach(function each(row) {
            var id = safeString(row && row[key], '');
            if (!id) return;
            map[id] = row;
        });
        return Object.keys(map).map(function mapKey(id) { return map[id]; });
    }

    function tenantRows(collection, tenantSlug) {
        var target = normalizeTenant(tenantSlug || '');
        return (Array.isArray(data()[collection]) ? data()[collection] : []).filter(function keep(row) {
            return normalizeTenant(row && row.tenantSlug) === target;
        });
    }

    function latestDocuments(tenantSlug) {
        return latestById(tenantRows('knowledgeDocumentHistory', tenantSlug), 'documentId');
    }

    function latestDocument(documentId, tenantSlug) {
        var targetDoc = safeString(documentId || '', '').trim();
        return latestDocuments(tenantSlug).filter(function keep(row) { return safeString(row.documentId || '', '') === targetDoc; }).pop() || null;
    }

    function latestChunks(documentId, tenantSlug) {
        var targetDoc = safeString(documentId || '', '').trim();
        return latestById(tenantRows('knowledgeChunkHistory', tenantSlug), 'chunkId').filter(function keep(row) {
            return !targetDoc || safeString(row.documentId || '', '') === targetDoc;
        }).sort(function sort(a, b) { return safeNumber(a.chunkOrder, 0) - safeNumber(b.chunkOrder, 0); });
    }

    function publicDocument(row) {
        if (!row) return {};
        return {
            documentId: row.documentId,
            tenantSlug: row.tenantSlug,
            organizationId: row.organizationId,
            title: row.title,
            fileName: row.fileName,
            sourceType: row.sourceType,
            documentType: row.documentType,
            policyType: row.policyType,
            department: row.department,
            ownerId: row.ownerId,
            tags: row.tags || [],
            status: row.status,
            indexStatus: row.indexStatus,
            embeddingStatus: row.embeddingStatus,
            vectorStatus: row.vectorStatus,
            approvalStatus: row.approvalStatus,
            version: row.version,
            chunkCount: row.chunkCount || 0,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            retention: row.retention || {},
            archive: row.archive || {},
            immutable: row.immutable === true
        };
    }

    function publicChunk(row) {
        return {
            chunkId: row.chunkId,
            documentId: row.documentId,
            tenantSlug: row.tenantSlug,
            chunkOrder: row.chunkOrder,
            charStart: row.charStart,
            charEnd: row.charEnd,
            text: row.text,
            textPreview: safeString(row.text || row.textPreview || '', '').slice(0, 220),
            metadata: row.metadata || {},
            tokenCount: row.tokenCount || 0,
            status: row.status || 'CHUNKED',
            immutable: row.immutable === true
        };
    }

    function appendDocumentState(document, updates, context) {
        if (!document) return null;
        var next = Object.assign({}, document, updates || {}, {
            updatedAt: nowIso(context || {}),
            immutable: true
        });
        persist('knowledgeDocumentHistory', next, context || {});
        return next;
    }

    function tokenizeWords(text) {
        var seen = {};
        return safeString(text || '', '').toLowerCase()
            .replace(/[^a-z0-9\s-]+/g, ' ')
            .split(/\s+/)
            .map(function map(word) { return word.trim(); })
            .filter(function keep(word) {
                if (!word || word.length < 2 || STOP_WORDS.indexOf(word) !== -1 || seen[word]) return false;
                seen[word] = true;
                return true;
            });
    }

    function deterministicVector(text) {
        var words = tokenizeWords(text);
        var vector = new Array(VECTOR_DIMENSIONS).fill(0);
        if (!words.length) return vector;
        words.forEach(function each(word, index) {
            var hash = parseInt(hashString(word + ':' + index).slice(0, 6), 16);
            var slot = hash % VECTOR_DIMENSIONS;
            vector[slot] += ((hash % 1000) / 1000) + 0.25;
        });
        var magnitude = Math.sqrt(vector.reduce(function sum(acc, value) { return acc + (value * value); }, 0)) || 1;
        return vector.map(function normalize(value) { return Number((value / magnitude).toFixed(6)); });
    }

    function cosineSimilarity(a, b) {
        var left = Array.isArray(a) ? a : [];
        var right = Array.isArray(b) ? b : [];
        var length = Math.max(left.length, right.length);
        var dot = 0;
        var leftMag = 0;
        var rightMag = 0;
        for (var i = 0; i < length; i += 1) {
            var x = safeNumber(left[i], 0);
            var y = safeNumber(right[i], 0);
            dot += x * y;
            leftMag += x * x;
            rightMag += y * y;
        }
        var denom = Math.sqrt(leftMag) * Math.sqrt(rightMag);
        return denom ? dot / denom : 0;
    }

    function keywordScore(query, text) {
        var queryWords = tokenizeWords(query);
        if (!queryWords.length) return 0;
        var haystack = safeString(text || '', '').toLowerCase();
        var matches = queryWords.filter(function keep(word) { return haystack.indexOf(word) !== -1; }).length;
        var score = (matches / queryWords.length) * 82;
        if (haystack.indexOf(safeString(query || '', '').toLowerCase().trim()) !== -1) score += 18;
        return clampScore(score);
    }

    function chunkText(text, strategy, chunkSize, overlap) {
        var source = safeString(text || '', '').replace(/\s+/g, ' ').trim();
        if (!source) return [];
        var size = Math.max(80, Math.min(5000, safeNumber(chunkSize, DEFAULT_CHUNK_SIZE)));
        var activeStrategy = normalizeStrategy(strategy);
        var effectiveOverlap = activeStrategy === 'SLIDING_WINDOW'
            ? Math.max(0, Math.min(size - 1, safeNumber(overlap, DEFAULT_SLIDING_OVERLAP)))
            : 0;
        var step = Math.max(1, size - effectiveOverlap);
        var chunks = [];
        for (var start = 0; start < source.length; start += step) {
            var end = Math.min(source.length, start + size);
            var textChunk = source.slice(start, end).trim();
            if (textChunk) {
                chunks.push({ text: textChunk, charStart: start, charEnd: end });
            }
            if (end >= source.length) break;
        }
        return chunks;
    }

    function uploadKnowledgeDocument(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_KNOWLEDGE_PAYLOAD', 'Knowledge upload payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var tenantSlug = access.tenantSlug;
            if (!supportedFormat(input)) {
                return result(false, 'UNSUPPORTED_KNOWLEDGE_FORMAT', 'Unsupported knowledge document format was rejected.', {
                    tenantSlug: tenantSlug,
                    governance: governanceFlags({ unsupportedFormatsBlocked: true })
                });
            }
            var sizeBytes = Math.max(0, safeNumber(input.sizeBytes || input.size || input.fileSize || input.bytes, 0));
            if (sizeBytes > MAX_FILE_BYTES) {
                return result(false, 'KNOWLEDGE_FILE_TOO_LARGE', 'Knowledge document exceeds governed size limits.', {
                    tenantSlug: tenantSlug,
                    sizeBytes: sizeBytes,
                    maxBytes: MAX_FILE_BYTES,
                    governance: governanceFlags({ largeFileGuardrail: true })
                });
            }
            var metadata = normalizeMetadata(input, null);
            var text = sourceText(input, null);
            var contentHash = hashString([tenantSlug, metadata.fileName, text || metadata.title, sizeBytes].join('|'));
            var duplicate = latestDocuments(tenantSlug).some(function existing(row) {
                return safeString(row.contentHash || '', '') === contentHash ||
                    (safeString(row.fileName || '', '').toLowerCase() === metadata.fileName.toLowerCase() &&
                        safeString(row.documentHash || row.contentHash || '', '') === contentHash);
            });
            if (duplicate && input.allowDuplicate !== true) {
                return result(false, 'DUPLICATE_KNOWLEDGE_DOCUMENT', 'Duplicate knowledge upload was rejected safely.', {
                    tenantSlug: tenantSlug,
                    governance: governanceFlags({ duplicateUploadsBlocked: true })
                });
            }
            var timestamp = nowIso(context || {});
            var document = Object.assign({
                documentId: safeString(input.documentId || '', '').trim() || createId('KDOC'),
                tenantSlug: tenantSlug,
                organizationId: normalizeTenant(input.organizationId || input.companyId || tenantSlug),
                status: 'UPLOADED',
                indexStatus: 'PENDING',
                embeddingStatus: 'NOT_REQUESTED',
                vectorStatus: 'NOT_STORED',
                documentHash: contentHash,
                contentHash: contentHash,
                sizeBytes: sizeBytes,
                textContent: text,
                extractedText: '',
                createdAt: timestamp,
                updatedAt: timestamp,
                immutable: true
            }, metadata);
            persist('knowledgeDocumentHistory', document, context || {});
            persist('knowledgeRegistryHistory', Object.assign({}, publicDocument(document), {
                registryAction: 'DOCUMENT_UPLOADED',
                registryId: createId('KREG')
            }), context || {});
            audit('KNOWLEDGE_DOCUMENT_UPLOAD', {
                tenantSlug: tenantSlug,
                documentId: document.documentId,
                sourceType: document.sourceType,
                documentType: document.documentType,
                description: 'Knowledge document uploaded for tenant-scoped RAG indexing.'
            }, context || {}, 'INFO');
            writeStructuredLog('INFO', 'KNOWLEDGE_DOCUMENT_UPLOAD', { tenantSlug: tenantSlug, documentId: document.documentId }, context || {});
            return result(true, 'KNOWLEDGE_DOCUMENT_UPLOADED', 'Knowledge document uploaded and registered for indexing.', {
                tenantSlug: tenantSlug,
                document: publicDocument(document),
                metadata: metadata,
                governance: governanceFlags({ uploadValidated: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_UPLOAD_FAILED_SAFE', 'Knowledge upload failed safely.', { governance: governanceFlags() });
        }
    }

    function resolveDocument(input, access) {
        var source = input || {};
        var tenantSlug = access && access.tenantSlug || normalizeTenant(source.tenantSlug || source.tenantId);
        var documentId = safeString(source.documentId || source.id || '', '').trim();
        return documentId ? latestDocument(documentId, tenantSlug) : null;
    }

    function extractMetadata(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_METADATA_PAYLOAD', 'Metadata extraction payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var document = resolveDocument(input, access);
            if (input.documentId && !document) return result(false, 'KNOWLEDGE_DOCUMENT_NOT_FOUND', 'No tenant-scoped knowledge document was found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var metadata = normalizeMetadata(input, document);
            var record = Object.assign({
                metadataId: createId('KMETA'),
                tenantSlug: access.tenantSlug,
                documentId: document && document.documentId || safeString(input.documentId || '', '').trim(),
                extractedAt: nowIso(context || {}),
                immutable: true
            }, metadata);
            persist('knowledgeMetadataHistory', record, context || {});
            if (document) appendDocumentState(document, Object.assign({}, metadata, { status: 'EXTRACTED', indexStatus: 'EXTRACTED' }), context || {});
            audit('KNOWLEDGE_METADATA_EXTRACTED', {
                tenantSlug: access.tenantSlug,
                documentId: record.documentId,
                documentType: record.documentType,
                description: 'Knowledge metadata extracted.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_METADATA_EXTRACTED', 'Knowledge metadata extracted.', {
                tenantSlug: access.tenantSlug,
                metadata: record,
                governance: governanceFlags({ metadataExtractionReady: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_METADATA_FAILED_SAFE', 'Knowledge metadata extraction failed safely.', { governance: governanceFlags() });
        }
    }

    function extractText(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_TEXT_EXTRACTION_PAYLOAD', 'Text extraction payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var document = resolveDocument(input, access);
            if (input.documentId && !document) return result(false, 'KNOWLEDGE_DOCUMENT_NOT_FOUND', 'No tenant-scoped knowledge document was found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var source = Object.assign({}, document || {}, input || {});
            if (!supportedFormat(source)) {
                return result(false, 'UNSUPPORTED_KNOWLEDGE_FORMAT', 'Unsupported knowledge document format was rejected during extraction.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags({ unsupportedFormatsBlocked: true })
                });
            }
            if (source.corrupted === true || source.malformedPdf === true || /CORRUPT|MALFORMED/i.test(safeString(source.parserWarning || source.validationWarning || '', ''))) {
                return result(false, 'CORRUPTED_KNOWLEDGE_DOCUMENT', 'Corrupted knowledge document failed safely during extraction.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags({ corruptedDocumentsHandled: true })
                });
            }
            var text = sourceText(input, document);
            if (!text.trim()) {
                return result(false, 'EMPTY_KNOWLEDGE_DOCUMENT', 'Knowledge document text was empty or unavailable.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags({ missingMetadataHandled: true })
                });
            }
            var extraction = {
                extractionId: createId('KTXT'),
                tenantSlug: access.tenantSlug,
                documentId: document && document.documentId || safeString(input.documentId || createId('KDOC-DIRECT'), ''),
                documentType: normalizeDocumentType(source.documentType, source),
                text: text,
                textLength: text.length,
                extractedAt: nowIso(context || {}),
                extractionStatus: 'COMPLETED',
                immutable: true
            };
            persist('knowledgeTextExtractionHistory', extraction, context || {});
            if (document) appendDocumentState(document, {
                status: 'EXTRACTED',
                indexStatus: 'EXTRACTED',
                extractedText: text,
                textLength: text.length
            }, context || {});
            audit('KNOWLEDGE_TEXT_EXTRACTED', {
                tenantSlug: access.tenantSlug,
                documentId: extraction.documentId,
                description: 'Knowledge text extracted for chunking.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_TEXT_EXTRACTED', 'Knowledge text extracted.', {
                tenantSlug: access.tenantSlug,
                documentId: extraction.documentId,
                text: text,
                textLength: text.length,
                extraction: extraction,
                governance: governanceFlags({ textExtractionReady: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_TEXT_EXTRACTION_FAILED_SAFE', 'Knowledge text extraction failed safely.', { governance: governanceFlags() });
        }
    }

    function chunkDocument(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_CHUNKING_PAYLOAD', 'Chunking payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var document = resolveDocument(input, access);
            if (input.documentId && !document && !sourceText(input, null).trim()) {
                return result(false, 'KNOWLEDGE_DOCUMENT_NOT_FOUND', 'No tenant-scoped knowledge document was found for chunking.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            }
            var metadata = normalizeMetadata(input.metadata || {}, document || input);
            var text = sourceText(input, document);
            if (!text.trim()) {
                var extracted = extractText(input, context || {});
                if (!extracted.success) return extracted;
                text = extracted.text;
            }
            var strategy = normalizeStrategy(input.strategy || input.chunkingStrategy);
            var rawChunks = chunkText(text, strategy, input.chunkSize || input.maxChunkSize, input.overlap);
            if (!rawChunks.length) {
                return result(false, 'KNOWLEDGE_CHUNKING_EMPTY', 'Knowledge chunking produced no chunks.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            }
            var documentId = document && document.documentId || safeString(input.documentId || createId('KDOC-DIRECT'), '').trim();
            var chunks = rawChunks.map(function build(chunk, index) {
                var row = {
                    chunkId: 'KCH-' + hashString([access.tenantSlug, documentId, index + 1, chunk.text].join('|')),
                    tenantSlug: access.tenantSlug,
                    documentId: documentId,
                    chunkOrder: index + 1,
                    charStart: chunk.charStart,
                    charEnd: chunk.charEnd,
                    text: chunk.text,
                    textPreview: chunk.text.slice(0, 220),
                    metadata: Object.assign({}, metadata, input.metadata || {}),
                    strategy: strategy,
                    tokenCount: tokenizeWords(chunk.text).length,
                    status: 'CHUNKED',
                    immutable: true,
                    createdAt: nowIso(context || {})
                };
                persist('knowledgeChunkHistory', row, context || {});
                return row;
            });
            if (document) appendDocumentState(document, {
                status: 'CHUNKED',
                indexStatus: 'CHUNKED',
                chunkCount: chunks.length
            }, context || {});
            audit('KNOWLEDGE_DOCUMENT_CHUNKED', {
                tenantSlug: access.tenantSlug,
                documentId: documentId,
                chunkCount: chunks.length,
                strategy: strategy,
                description: 'Knowledge document chunked for retrieval.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_DOCUMENT_CHUNKED', 'Knowledge document chunked.', {
                tenantSlug: access.tenantSlug,
                documentId: documentId,
                strategy: strategy,
                chunks: chunks.map(publicChunk),
                chunkCount: chunks.length,
                governance: governanceFlags({ chunkingReady: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_CHUNKING_FAILED_SAFE', 'Knowledge chunking failed safely.', { governance: governanceFlags() });
        }
    }

    function createEmbeddingRequest(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_EMBEDDING_PAYLOAD', 'Embedding request payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var documentId = safeString(input.documentId || '', '').trim();
            var chunks = Array.isArray(input.chunks) && input.chunks.length ? input.chunks : latestChunks(documentId, access.tenantSlug).map(publicChunk);
            if (!chunks.length) {
                return result(false, 'KNOWLEDGE_CHUNKS_REQUIRED', 'Embedding requests require tenant-scoped document chunks.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags()
                });
            }
            var provider = normalizeEmbeddingProvider(input.provider || input.embeddingProvider);
            var request = {
                requestId: createId('KEMB'),
                tenantSlug: access.tenantSlug,
                documentId: documentId || safeString(chunks[0] && chunks[0].documentId || '', ''),
                provider: provider,
                model: safeString(input.model || input.modelName || provider + '_FUTURE_MODEL', '').slice(0, 160),
                status: 'QUEUED',
                chunkIds: chunks.map(function map(chunk) { return chunk.chunkId; }),
                chunkCount: chunks.length,
                queued: true,
                providerInterfacePrepared: true,
                embeddingGenerated: false,
                externalLlmCalled: false,
                externalEmbeddingProviderCalled: false,
                queuedAt: nowIso(context || {}),
                immutable: true
            };
            var queueReady = false;
            try {
                var queue = global.DistributedQueueService || global.distributedQueueService;
                queueReady = !!(queue && queue.QueueManager && typeof queue.QueueManager.createJob === 'function');
            } catch (error) { queueReady = false; }
            request.queueIntegrationReady = queueReady;
            persist('knowledgeEmbeddingQueue', request, context || {});
            audit('KNOWLEDGE_EMBEDDING_REQUEST', {
                tenantSlug: access.tenantSlug,
                documentId: request.documentId,
                requestId: request.requestId,
                provider: provider,
                description: 'Embedding request prepared without external provider execution.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_EMBEDDING_REQUEST_QUEUED', 'Embedding request prepared for future provider execution.', {
                tenantSlug: access.tenantSlug,
                embeddingRequest: request,
                providerInterfacePrepared: true,
                externalLlmCalled: false,
                embeddingGenerated: false,
                governance: governanceFlags({ embeddingQueueReady: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_EMBEDDING_REQUEST_FAILED_SAFE', 'Embedding request failed safely.', { governance: governanceFlags() });
        }
    }

    function storeVectors(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_VECTOR_PAYLOAD', 'Vector storage payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var documentId = safeString(input.documentId || '', '').trim();
            var chunks = Array.isArray(input.chunks) && input.chunks.length ? input.chunks : latestChunks(documentId, access.tenantSlug).map(publicChunk);
            if (!chunks.length) {
                return result(false, 'KNOWLEDGE_CHUNKS_REQUIRED', 'Vector storage requires tenant-scoped document chunks.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags()
                });
            }
            var provider = normalizeProvider(input.provider || input.vectorProvider);
            var vectorStoreId = createId('KVECSTORE');
            var document = latestDocument(documentId || chunks[0].documentId, access.tenantSlug);
            var vectorRows = chunks.map(function map(chunk) {
                var vector = Array.isArray(input.vectors && input.vectors[chunk.chunkId]) ? input.vectors[chunk.chunkId] : deterministicVector(chunk.text || chunk.textPreview || '');
                var row = {
                    vectorId: 'KVEC-' + hashString([access.tenantSlug, chunk.documentId, chunk.chunkId, provider].join('|')),
                    vectorStoreId: vectorStoreId,
                    tenantSlug: access.tenantSlug,
                    documentId: chunk.documentId,
                    chunkId: chunk.chunkId,
                    provider: provider,
                    embeddingRequestId: safeString(input.embeddingRequestId || '', '').trim(),
                    localVector: vector,
                    vectorDimensions: vector.length,
                    externalProviderCalled: false,
                    storedAt: nowIso(context || {}),
                    immutable: true
                };
                persist('knowledgeVectorHistory', row, context || {});
                persist('knowledgeSearchIndex', {
                    indexId: 'KIDX-' + hashString([row.vectorId, chunk.text || ''].join('|')),
                    tenantSlug: access.tenantSlug,
                    documentId: chunk.documentId,
                    chunkId: chunk.chunkId,
                    vectorId: row.vectorId,
                    provider: provider,
                    text: safeString(chunk.text || chunk.textPreview || '', ''),
                    localVector: vector,
                    title: document && document.title || chunk.metadata && chunk.metadata.title || '',
                    sourceType: document && document.sourceType || chunk.metadata && chunk.metadata.sourceType || '',
                    documentType: document && document.documentType || chunk.metadata && chunk.metadata.documentType || '',
                    policyType: document && document.policyType || chunk.metadata && chunk.metadata.policyType || '',
                    department: document && document.department || chunk.metadata && chunk.metadata.department || '',
                    ownerId: document && document.ownerId || chunk.metadata && chunk.metadata.ownerId || '',
                    tags: document && document.tags || chunk.metadata && chunk.metadata.tags || [],
                    approvalStatus: document && document.approvalStatus || 'PENDING',
                    version: document && document.version || 1,
                    createdAt: nowIso(context || {}),
                    immutable: true
                }, context || {});
                return row;
            });
            if (document) appendDocumentState(document, {
                status: 'INDEXED',
                indexStatus: 'INDEXED',
                embeddingStatus: 'QUEUED',
                vectorStatus: 'VECTOR_READY',
                chunkCount: Math.max(document.chunkCount || 0, chunks.length)
            }, context || {});
            var storeRecord = {
                vectorStoreId: vectorStoreId,
                tenantSlug: access.tenantSlug,
                documentId: documentId || chunks[0].documentId,
                provider: provider,
                vectorCount: vectorRows.length,
                indexStatus: 'INDEXED',
                externalProviderCalled: false,
                storedAt: nowIso(context || {}),
                immutable: true
            };
            audit('KNOWLEDGE_VECTOR_STORED', {
                tenantSlug: access.tenantSlug,
                documentId: storeRecord.documentId,
                provider: provider,
                vectorCount: vectorRows.length,
                description: 'Knowledge vectors stored through provider-neutral abstraction.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_VECTORS_STORED', 'Knowledge vectors stored through provider abstraction.', {
                tenantSlug: access.tenantSlug,
                vectorStore: storeRecord,
                vectors: vectorRows,
                governance: governanceFlags({ vectorStorageReady: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_VECTOR_STORAGE_FAILED_SAFE', 'Vector storage failed safely.', { governance: governanceFlags() });
        }
    }

    function registerKnowledgeDocument(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_REGISTRY_PAYLOAD', 'Knowledge registry payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var document = resolveDocument(input, access);
            if (!document) return result(false, 'KNOWLEDGE_DOCUMENT_NOT_FOUND', 'No tenant-scoped knowledge document was found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var registry = Object.assign({}, publicDocument(document), {
                registryId: createId('KREG'),
                registryAction: safeString(input.registryAction || 'DOCUMENT_REGISTERED', '').toUpperCase(),
                registryStatus: 'ACTIVE',
                registeredAt: nowIso(context || {}),
                immutable: true
            });
            persist('knowledgeRegistryHistory', registry, context || {});
            audit('KNOWLEDGE_REGISTRY_UPDATED', {
                tenantSlug: access.tenantSlug,
                documentId: document.documentId,
                description: 'Knowledge registry updated.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_REGISTRY_UPDATED', 'Knowledge registry updated.', {
                tenantSlug: access.tenantSlug,
                registry: registry,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_REGISTRY_FAILED_SAFE', 'Knowledge registry update failed safely.', { governance: governanceFlags() });
        }
    }

    function getKnowledgeRegistry(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var currentActor = actor(context || {});
            var documents = latestDocuments(access.tenantSlug).filter(function visible(row) {
                if (currentActor.role !== 'EMPLOYEE') return true;
                return row.approvalStatus === 'APPROVED' && row.status !== 'ARCHIVED';
            }).map(publicDocument);
            var chunks = latestById(tenantRows('knowledgeChunkHistory', access.tenantSlug), 'chunkId').map(publicChunk);
            var vectors = latestById(tenantRows('knowledgeVectorHistory', access.tenantSlug), 'vectorId').map(function publicVector(row) {
                return {
                    vectorId: row.vectorId,
                    vectorStoreId: row.vectorStoreId,
                    documentId: row.documentId,
                    chunkId: row.chunkId,
                    tenantSlug: row.tenantSlug,
                    provider: row.provider,
                    vectorDimensions: row.vectorDimensions,
                    externalProviderCalled: row.externalProviderCalled === true,
                    storedAt: row.storedAt,
                    immutable: row.immutable === true
                };
            });
            var queue = tenantRows('knowledgeEmbeddingQueue', access.tenantSlug);
            var registry = latestById(tenantRows('knowledgeRegistryHistory', access.tenantSlug), 'registryId');
            return result(true, 'KNOWLEDGE_REGISTRY_READY', 'Knowledge registry loaded.', {
                tenantSlug: access.tenantSlug,
                documents: documents,
                chunks: chunks,
                vectorStores: vectors,
                embeddingQueue: queue,
                registry: registry,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_REGISTRY_READ_FAILED_SAFE', 'Knowledge registry read failed safely.', { governance: governanceFlags() });
        }
    }

    function passesFilters(row, filters) {
        var source = filters || {};
        function matches(field, value) {
            var target = safeString(value || '', '').trim().toLowerCase();
            if (!target) return true;
            return safeString(row[field] || '', '').trim().toLowerCase() === target;
        }
        if (!matches('department', source.department)) return false;
        if (!matches('policyType', source.policyType)) return false;
        if (!matches('documentType', source.documentType)) return false;
        if (!matches('ownerId', source.ownerId || source.owner)) return false;
        if (source.tags) {
            var wanted = normalizeTags(source.tags).map(function lower(tag) { return tag.toLowerCase(); });
            var tags = normalizeTags(row.tags || []).map(function lower(tag) { return tag.toLowerCase(); });
            if (wanted.some(function some(tag) { return tags.indexOf(tag) === -1; })) return false;
        }
        if (source.createdFrom || source.createdTo) {
            var rowTime = new Date(row.createdAt || 0).getTime();
            if (source.createdFrom && rowTime < new Date(source.createdFrom).getTime()) return false;
            if (source.createdTo && rowTime > new Date(source.createdTo).getTime()) return false;
        }
        return true;
    }

    function searchKnowledge(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_KNOWLEDGE_SEARCH_PAYLOAD', 'Knowledge search payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('SEARCH', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var query = safeString(input.query || input.search || '', '').trim().slice(0, 500);
            if (!query) return result(false, 'KNOWLEDGE_QUERY_REQUIRED', 'Knowledge search query is required.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var mode = normalizeSearchMode(input.searchMode || input.mode);
            var currentActor = actor(context || {});
            var rows = tenantRows('knowledgeSearchIndex', access.tenantSlug).filter(function visible(row) {
                if (currentActor.role === 'EMPLOYEE' && row.approvalStatus !== 'APPROVED') return false;
                return passesFilters(row, input.filters || input);
            });
            var queryVector = deterministicVector(query);
            var scored = rows.map(function map(row) {
                var keyScore = keywordScore(query, [row.title, row.text, row.department, row.policyType, (row.tags || []).join(' ')].join(' '));
                var vectorScore = clampScore(cosineSimilarity(queryVector, row.localVector || deterministicVector(row.text || '')) * 100);
                var score = mode === 'KEYWORD' ? keyScore : mode === 'VECTOR' ? vectorScore : clampScore((keyScore * 0.58) + (vectorScore * 0.42));
                return {
                    resultId: 'KRES-' + hashString([row.indexId, query, mode].join('|')),
                    tenantSlug: row.tenantSlug,
                    documentId: row.documentId,
                    chunkId: row.chunkId,
                    title: row.title || row.documentId,
                    sourceType: row.sourceType,
                    documentType: row.documentType,
                    policyType: row.policyType,
                    department: row.department,
                    ownerId: row.ownerId,
                    tags: row.tags || [],
                    score: score,
                    keywordScore: keyScore,
                    vectorScore: vectorScore,
                    searchMode: mode,
                    snippet: safeString(row.text || '', '').slice(0, 260),
                    provider: row.provider,
                    answerGenerated: false,
                    externalLlmCalled: false
                };
            }).filter(function keep(row) { return row.score > 0; }).sort(function sort(a, b) { return b.score - a.score; });
            var limit = Math.max(1, Math.min(50, safeNumber(input.limit, 10)));
            var results = scored.slice(0, limit);
            var searchAccuracyScore = results.length ? clampScore(average(results.slice(0, 5).map(function score(row) { return row.score; }), 72)) : 0;
            var history = {
                searchId: createId('KSEARCH'),
                tenantSlug: access.tenantSlug,
                query: query,
                searchMode: mode,
                filters: cloneSafe(input.filters || {}, []),
                resultCount: results.length,
                searchAccuracyScore: searchAccuracyScore,
                answerGenerated: false,
                externalLlmCalled: false,
                searchedAt: nowIso(context || {}),
                immutable: true
            };
            persist('knowledgeSearchHistory', history, context || {});
            audit('KNOWLEDGE_SEARCH_QUERY', {
                tenantSlug: access.tenantSlug,
                searchId: history.searchId,
                resultCount: results.length,
                description: 'Tenant-scoped knowledge search executed without answer generation.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_SEARCH_COMPLETED', 'Tenant-scoped knowledge search completed.', {
                tenantSlug: access.tenantSlug,
                query: query,
                searchMode: mode,
                results: results,
                resultCount: results.length,
                searchAccuracyScore: searchAccuracyScore,
                answerGenerated: false,
                externalLlmCalled: false,
                governance: governanceFlags({ semanticSearchReady: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_SEARCH_FAILED_SAFE', 'Knowledge search failed safely.', { governance: governanceFlags() });
        }
    }

    function indexKnowledgeDocument(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_INDEXING_PAYLOAD', 'Knowledge indexing payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var document = resolveDocument(input, access);
            var upload = null;
            if (!document) {
                upload = uploadKnowledgeDocument(input, context || {});
                if (!upload.success) return upload;
                document = latestDocument(upload.document.documentId, access.tenantSlug);
            }
            var metadata = extractMetadata({ tenantSlug: access.tenantSlug, documentId: document.documentId }, context || {});
            if (!metadata.success) return result(false, 'KNOWLEDGE_INDEX_METADATA_FAILED', 'Knowledge indexing stopped at metadata extraction.', { stage: 'metadata', metadata: metadata, governance: governanceFlags({ partialIndexingFailureHandled: true }) });
            var extracted = extractText({ tenantSlug: access.tenantSlug, documentId: document.documentId }, context || {});
            if (!extracted.success) return result(false, 'KNOWLEDGE_INDEX_TEXT_FAILED', 'Knowledge indexing stopped at text extraction.', { stage: 'text', extraction: extracted, governance: governanceFlags({ partialIndexingFailureHandled: true }) });
            var chunks = chunkDocument({
                tenantSlug: access.tenantSlug,
                documentId: document.documentId,
                strategy: input.strategy || input.chunkingStrategy || 'FIXED_SIZE',
                chunkSize: input.chunkSize,
                overlap: input.overlap,
                metadata: metadata.metadata
            }, context || {});
            if (!chunks.success) return result(false, 'KNOWLEDGE_INDEX_CHUNKING_FAILED', 'Knowledge indexing stopped at chunking.', { stage: 'chunking', chunks: chunks, governance: governanceFlags({ partialIndexingFailureHandled: true }) });
            var embedding = createEmbeddingRequest({
                tenantSlug: access.tenantSlug,
                documentId: document.documentId,
                chunks: chunks.chunks,
                provider: input.embeddingProvider || 'LOCAL',
                model: input.embeddingModel || input.model || 'local-governed-embedding'
            }, context || {});
            if (!embedding.success) return result(false, 'KNOWLEDGE_INDEX_EMBEDDING_FAILED', 'Knowledge indexing stopped at embedding request preparation.', { stage: 'embedding', embedding: embedding, governance: governanceFlags({ partialIndexingFailureHandled: true }) });
            var vectors = storeVectors({
                tenantSlug: access.tenantSlug,
                documentId: document.documentId,
                chunks: chunks.chunks,
                provider: input.vectorProvider || input.provider || 'PGVECTOR',
                embeddingRequestId: embedding.embeddingRequest.requestId
            }, context || {});
            if (!vectors.success) return result(false, 'KNOWLEDGE_INDEX_VECTOR_FAILED', 'Knowledge indexing stopped at vector storage.', { stage: 'vector', vectors: vectors, governance: governanceFlags({ partialIndexingFailureHandled: true }) });
            var registry = registerKnowledgeDocument({
                tenantSlug: access.tenantSlug,
                documentId: document.documentId,
                registryAction: 'DOCUMENT_INDEXED'
            }, context || {});
            audit('KNOWLEDGE_INDEX_CREATED', {
                tenantSlug: access.tenantSlug,
                documentId: document.documentId,
                chunkCount: chunks.chunks.length,
                description: 'Knowledge index created through tenant-scoped RAG foundation.'
            }, context || {}, 'INFO');
            return result(true, 'KNOWLEDGE_INDEX_CREATED', 'Knowledge document indexed for tenant-scoped retrieval.', {
                tenantSlug: access.tenantSlug,
                document: publicDocument(latestDocument(document.documentId, access.tenantSlug) || document),
                metadata: metadata.metadata,
                chunks: chunks.chunks,
                embeddingRequest: embedding.embeddingRequest,
                vectorStore: vectors.vectorStore,
                registry: registry.registry || {},
                answerGenerated: false,
                externalLlmCalled: false,
                governance: governanceFlags({ incrementalIndexingReady: true, backgroundIndexingPrepared: true })
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_INDEX_FAILED_SAFE', 'Knowledge indexing failed safely.', { governance: governanceFlags({ partialIndexingFailureHandled: true }) });
        }
    }

    function generateKnowledgeReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var docs = latestDocuments(access.tenantSlug);
            var chunks = latestById(tenantRows('knowledgeChunkHistory', access.tenantSlug), 'chunkId');
            var vectors = latestById(tenantRows('knowledgeVectorHistory', access.tenantSlug), 'vectorId');
            var embeddingQueue = tenantRows('knowledgeEmbeddingQueue', access.tenantSlug);
            var searches = tenantRows('knowledgeSearchHistory', access.tenantSlug);
            var indexedDocuments = docs.filter(function indexed(row) { return row.indexStatus === 'INDEXED' || row.vectorStatus === 'VECTOR_READY'; }).length;
            var approvedDocuments = docs.filter(function approved(row) { return row.approvalStatus === 'APPROVED'; }).length;
            var knowledgeCoverageScore = docs.length ? clampScore((indexedDocuments / docs.length) * 70 + (approvedDocuments / docs.length) * 30) : 0;
            var indexHealthScore = docs.length ? clampScore((chunks.length ? 35 : 0) + (vectors.length ? 35 : 0) + (embeddingQueue.length ? 15 : 0) + (knowledgeCoverageScore * 0.15)) : 0;
            var embeddingReady = embeddingQueue.length ? 'QUEUED' : 'NOT_REQUESTED';
            var searchAccuracyScore = average(searches.map(function score(row) { return row.searchAccuracyScore; }), searches.length ? 70 : 0);
            var analytics = {
                documentCount: docs.length,
                indexedDocumentCount: indexedDocuments,
                approvedDocumentCount: approvedDocuments,
                chunkCount: chunks.length,
                vectorCount: vectors.length,
                indexSize: tenantRows('knowledgeSearchIndex', access.tenantSlug).length,
                embeddingQueueSize: embeddingQueue.length,
                searchQueryCount: searches.length,
                searchAccuracyScore: searchAccuracyScore,
                knowledgeCoverageScore: knowledgeCoverageScore,
                indexHealthScore: indexHealthScore,
                embeddingStatus: embeddingReady,
                vectorProviders: unique(vectors.map(function provider(row) { return row.provider; })),
                averageChunkTokens: average(chunks.map(function tokens(row) { return row.tokenCount; }), 0)
            };
            persist('knowledgeAnalyticsHistory', Object.assign({
                analyticsId: createId('KAN'),
                tenantSlug: access.tenantSlug,
                generatedAt: nowIso(context || {}),
                immutable: true
            }, analytics), context || {});
            return result(true, 'KNOWLEDGE_REPORT_READY', 'Knowledge intelligence report generated.', {
                tenantSlug: access.tenantSlug,
                knowledgeLibrary: docs.map(publicDocument),
                indexedDocuments: docs.filter(function indexed(row) { return row.indexStatus === 'INDEXED'; }).map(publicDocument),
                chunkStatistics: {
                    chunkCount: chunks.length,
                    strategies: unique(chunks.map(function map(row) { return row.strategy || 'FIXED_SIZE'; })),
                    averageChunkTokens: analytics.averageChunkTokens
                },
                vectorStatus: {
                    vectorCount: vectors.length,
                    providers: analytics.vectorProviders,
                    abstractionReady: true,
                    providerLockIn: false
                },
                embeddingQueue: embeddingQueue,
                knowledgeHealth: {
                    knowledgeCoverageScore: knowledgeCoverageScore,
                    indexHealthScore: indexHealthScore,
                    embeddingStatus: embeddingReady
                },
                searchAnalytics: {
                    searchQueryCount: searches.length,
                    searchAccuracyScore: searchAccuracyScore,
                    modes: SEARCH_MODES
                },
                analytics: analytics,
                architecture: {
                    documentUpload: true,
                    metadataExtraction: true,
                    textExtraction: true,
                    chunking: true,
                    embeddingGenerationInterface: true,
                    vectorStorage: true,
                    searchIndex: true,
                    knowledgeRegistry: true,
                    aiAnswerGeneration: false
                },
                performance: {
                    incrementalIndexing: true,
                    backgroundIndexing: true,
                    queueBasedIndexing: true,
                    parallelProcessingPrepared: true,
                    largeDocumentSupport: true,
                    externalProviderCalls: false
                },
                integrations: {
                    distributedQueue: !!global.DistributedQueueService,
                    uploadValidation: !!global.UploadValidationService,
                    documentGovernance: !!global.DocumentGovernanceService,
                    validationRegistry: !!validationRegistry(),
                    enterpriseLogging: !!global.EnterpriseLoggingPipelineService,
                    auditGovernance: !!global.AuditService
                },
                futureAiIntegration: {
                    retrievalContextReady: true,
                    noExternalLlmCalls: true,
                    noAnswerGenerationYet: true,
                    supportedEmbeddingProviders: EMBEDDING_PROVIDERS,
                    supportedVectorProviders: VECTOR_PROVIDERS,
                    futureKnowledgeSources: FUTURE_KNOWLEDGE_SOURCES
                },
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            });
        } catch (error) {
            return result(false, 'KNOWLEDGE_REPORT_FAILED_SAFE', 'Knowledge intelligence report failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        var snapshot = cloneSafe(data(), []);
        function record(name, passed, details) {
            checks.push({ name: name, passed: passed === true, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'rag-self-test',
                actor: { id: 'SELF-HR', role: 'HR', tenantSlug: 'rag-self-test' },
                now: '2026-06-30T00:00:00.000Z',
                skipAuditPersistence: true
            };
            var upload = uploadKnowledgeDocument({
                tenantSlug: 'rag-self-test',
                sourceType: 'HR_POLICY',
                documentType: 'TXT',
                fileName: 'self-test.txt',
                mimeType: 'text/plain',
                approvalStatus: 'APPROVED',
                content: 'Self-test policy knowledge supports governed retrieval only.'
            }, ctx);
            record('upload works', upload.success === true, upload);
            var chunks = chunkDocument({ tenantSlug: 'rag-self-test', documentId: upload.document && upload.document.documentId, chunkSize: 80 }, ctx);
            record('chunking works', chunks.success === true && chunks.chunks.length >= 1, chunks);
            var metadata = extractMetadata({ tenantSlug: 'rag-self-test', documentId: upload.document && upload.document.documentId }, ctx);
            record('metadata extraction works', metadata.success === true && metadata.metadata.documentType === 'TXT', metadata);
            var embedding = createEmbeddingRequest({ tenantSlug: 'rag-self-test', documentId: upload.document && upload.document.documentId, chunks: chunks.chunks, provider: 'LOCAL' }, ctx);
            record('vector abstraction works', embedding.success === true && embedding.embeddingRequest.externalLlmCalled === false, embedding);
            var vectors = storeVectors({ tenantSlug: 'rag-self-test', documentId: upload.document && upload.document.documentId, chunks: chunks.chunks, provider: 'PGVECTOR' }, ctx);
            var search = searchKnowledge({ tenantSlug: 'rag-self-test', query: 'governed retrieval', searchMode: 'HYBRID' }, ctx);
            record('search works', vectors.success === true && search.success === true && search.answerGenerated === false, { vectors: vectors, search: search });
            var denied = searchKnowledge({ tenantSlug: 'other-rag-self-test', query: 'governed' }, ctx);
            record('tenant isolation works', denied.success === false && denied.code === 'TENANT_ACCESS_DENIED', denied);
            var frozen = freezeKnowledgeOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            record('self-test uncaught exception guard', false, { message: error && error.message });
        }
        try { save(snapshot || {}); } catch (error) {}
        return freezeKnowledgeOutput({
            passed: checks.every(function all(check) { return check.passed; }),
            checks: checks,
            summary: 'Tenant-scoped RAG foundation self-test completed.'
        });
    }

    var KnowledgeService = Object.freeze({
        uploadKnowledgeDocument: uploadKnowledgeDocument,
        indexKnowledgeDocument: indexKnowledgeDocument,
        generateKnowledgeReport: generateKnowledgeReport
    });
    var DocumentParser = Object.freeze({
        extractMetadata: extractMetadata,
        extractText: extractText
    });
    var ChunkingService = Object.freeze({
        chunkDocument: chunkDocument
    });
    var EmbeddingProvider = Object.freeze({
        createEmbeddingRequest: createEmbeddingRequest,
        prepareEmbeddingRequest: createEmbeddingRequest
    });
    var VectorRepository = Object.freeze({
        storeVectors: storeVectors,
        listProviderCapabilities: function listProviderCapabilities() {
            return result(true, 'VECTOR_PROVIDER_CAPABILITIES_READY', 'Vector provider capabilities loaded.', {
                vectorProviders: VECTOR_PROVIDERS,
                embeddingProviders: EMBEDDING_PROVIDERS,
                providerLockIn: false,
                governance: governanceFlags()
            });
        }
    });
    var KnowledgeSearchService = Object.freeze({
        searchKnowledge: searchKnowledge
    });
    var KnowledgeRegistry = Object.freeze({
        registerKnowledgeDocument: registerKnowledgeDocument,
        getKnowledgeRegistry: getKnowledgeRegistry
    });

    var service = Object.freeze({
        VERSION: VERSION,
        KNOWLEDGE_SOURCE_TYPES: KNOWLEDGE_SOURCE_TYPES,
        FUTURE_KNOWLEDGE_SOURCES: FUTURE_KNOWLEDGE_SOURCES,
        SUPPORTED_DOCUMENT_FORMATS: SUPPORTED_DOCUMENT_FORMATS,
        CHUNKING_STRATEGIES: CHUNKING_STRATEGIES,
        VECTOR_PROVIDERS: VECTOR_PROVIDERS,
        EMBEDDING_PROVIDERS: EMBEDDING_PROVIDERS,
        SEARCH_MODES: SEARCH_MODES,
        DOCUMENT_STATUSES: DOCUMENT_STATUSES,
        INDEX_STATUSES: INDEX_STATUSES,
        EMBEDDING_STATUSES: EMBEDDING_STATUSES,
        KnowledgeService: KnowledgeService,
        DocumentParser: DocumentParser,
        ChunkingService: ChunkingService,
        EmbeddingProvider: EmbeddingProvider,
        VectorRepository: VectorRepository,
        KnowledgeSearchService: KnowledgeSearchService,
        KnowledgeRegistry: KnowledgeRegistry,
        uploadKnowledgeDocument: uploadKnowledgeDocument,
        indexKnowledgeDocument: indexKnowledgeDocument,
        extractMetadata: extractMetadata,
        extractText: extractText,
        chunkDocument: chunkDocument,
        createEmbeddingRequest: createEmbeddingRequest,
        storeVectors: storeVectors,
        searchKnowledge: searchKnowledge,
        generateKnowledgeReport: generateKnowledgeReport,
        freezeKnowledgeOutput: freezeKnowledgeOutput,
        runSelfTest: runSelfTest
    });

    global.TenantScopedRagService = service;
    global.tenantScopedRagService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_TENANT_RAG_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_TENANT_RAG_SELF_TEST__ = freezeKnowledgeOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
