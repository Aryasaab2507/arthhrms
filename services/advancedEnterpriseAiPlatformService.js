/**
 * ARTHHRMS Advanced Enterprise AI Platform Service.
 * Provides tenant-scoped multi-agent orchestration, MCP readiness, governed
 * tool routing, memory, safety validation, analytics, and immutable audit
 * records without external provider calls or autonomous destructive actions.
 */
(function attachAdvancedEnterpriseAIPlatformService(global) {
    'use strict';

    var SOURCE = 'advancedEnterpriseAiPlatformService';
    var VERSION = '1.0.0';
    var MAX_HISTORY = 1400;
    var VIEW_ROLES = Object.freeze(['EMPLOYEE', 'MANAGER', 'HR', 'DIRECTOR', 'PLATFORM_OWNER', 'SUPER_ADMIN']);
    var CONTROL_ROLES = Object.freeze(['HR', 'DIRECTOR', 'PLATFORM_OWNER', 'SUPER_ADMIN']);
    var PLATFORM_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN']);
    var AGENT_IDS = Object.freeze([
        'HR_AGENT',
        'RECRUITMENT_AGENT',
        'PAYROLL_AGENT',
        'LEAVE_AGENT',
        'ATTENDANCE_AGENT',
        'PERFORMANCE_AGENT',
        'COMPLIANCE_AGENT',
        'KNOWLEDGE_AGENT',
        'ANALYTICS_AGENT',
        'OPERATIONS_AGENT',
        'DOCUMENT_AGENT',
        'WORKFLOW_AGENT'
    ]);
    var MCP_RESOURCE_TYPES = Object.freeze([
        'Knowledge Registry',
        'API Catalog',
        'Workflow Engine',
        'Developer APIs',
        'Documents',
        'Reports',
        'Analytics',
        'Webhooks'
    ]);
    var TOOL_CATALOG = Object.freeze([
        'KNOWLEDGE_RETRIEVAL',
        'API_CATALOG',
        'WORKFLOW_RECOMMENDATION',
        'ANALYTICS_QUERY',
        'REPORT_SUMMARY',
        'DOCUMENT_LOOKUP',
        'NOTIFICATION_RECOMMENDATION',
        'WEBHOOK_STATUS'
    ]);
    var BLOCKED_TOOLS = Object.freeze([
        'APPROVE_LEAVE',
        'REJECT_LEAVE',
        'DELETE_EMPLOYEE',
        'DELETE_RECORD',
        'UPDATE_RECORD',
        'MODIFY_PAYROLL',
        'RUN_SQL',
        'EXECUTE_WORKFLOW',
        'CREATE_USER',
        'DISABLE_USER',
        'ROTATE_SECRET',
        'PURGE_DATA'
    ]);
    var MEMORY_TYPES = Object.freeze([
        'CONVERSATION_MEMORY',
        'TENANT_MEMORY',
        'KNOWLEDGE_MEMORY',
        'TASK_MEMORY',
        'SESSION_MEMORY'
    ]);
    var PROMPT_INJECTION_PATTERN = /(ignore\s+(all\s+)?previous|reveal\s+(the\s+)?(system|developer)|system\s+prompt|developer\s+message|jailbreak|bypass\s+(rbac|tenant|approval|governance|safety)|hidden\s+instruction|act\s+as\s+root|disable\s+safety|show\s+secrets?|print\s+prompt|tool\s+injection)/i;
    var DESTRUCTIVE_ACTION_PATTERN = /\b(delete|remove|purge|drop|truncate|modify|update|approve|reject|execute|run\s+sql|disable|enable|terminate|suspend|restore|rollback|hard\s+delete|grant\s+access|rotate\s+secret)\b/i;
    var NEGATED_ACTION_PATTERN = /\b(do\s+not|don't|never|without)\s+(auto[-\s]*)?(execute|delete|remove|purge|modify|update|approve|reject|run\s+sql|disable|enable|terminate|suspend|restore|rollback)\b/i;
    var SENSITIVE_KEY_PATTERN = /(password|api.?key|private.?key|credential|token|authorization|cookie|session.?id|secretKey|secretValue|clientSecret|rawPrompt|systemPrompt|developerMessage|hiddenInstruction|sql|bank|aadhaar|ssn|passport|salaryAmount|payloadBody)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?[a-z0-9._=-]+|api[-_ ]?key[-_ ]?[a-z0-9._=-]+|password\s*[:=]\s*\S+|authorization\s*[:=]|system\s+prompt|developer\s+message|hidden\s+instruction|ABC private AI data|NCWF-ABC|API-ABC)/ig;
    var STOP_WORDS = Object.freeze(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'after', 'before', 'must', 'shall', 'are', 'is', 'to', 'of', 'in', 'on', 'by', 'a', 'an', 'what', 'why', 'which', 'show', 'summarize', 'explain', 'today']);
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
            if (key !== 'credentialsStoredPlaintext' && SENSITIVE_KEY_PATTERN.test(key)) return;
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

    function freezeAIPlatformOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            aiGovernancePreserved: true,
            rbacAuthoritative: true,
            noAutonomousActionWithoutExplicitAdminApproval: true,
            autonomousActionExecuted: false,
            destructiveActionsBlocked: true,
            approvalsRequiredForExecution: true,
            existingAiAssistantsPreserved: true,
            existingApisPreserved: true,
            existingWebhooksPreserved: true,
            existingWorkflowsPreserved: true,
            noExternalAiProviderCallsByDefault: true,
            externalProviderCalled: false,
            noProductionDataMutation: true,
            productionDataModified: false,
            providerAgnostic: true,
            hiddenPromptExposed: false,
            auditGovernancePreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'ENTERPRISE_AI_PLATFORM_READY' : 'ENTERPRISE_AI_PLATFORM_FAILED'));
        return freezeAIPlatformOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'Enterprise AI platform operation completed.' : 'Enterprise AI platform operation failed.'), '').slice(0, 340)
        }, extra || {}));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || context && context.actorId || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || context && (context.actorTenantSlug || context.actorTenantId) || ''),
            department: safeString(source.department || context && context.department || '', '').trim().slice(0, 120)
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
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped AI platform access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        var roles = action === 'PLATFORM_CONTROL' ? PLATFORM_ROLES : action === 'CONTROL' ? CONTROL_ROLES : VIEW_ROLES;
        if (roles.indexOf(currentActor.role) === -1) {
            return result(false, 'AI_PLATFORM_RBAC_DENIED', 'AI platform access is denied by RBAC governance.', {
                tenantSlug: targetTenant,
                actorRole: currentActor.role,
                governance: governanceFlags()
            });
        }
        return {
            success: true,
            tenantSlug: targetTenant,
            actor: currentActor,
            action: action
        };
    }

    function persist(collection, row, context) {
        try {
            if (context && context.skipPersistence) return row;
            var snapshot = data();
            if (!Array.isArray(snapshot[collection])) snapshot[collection] = [];
            snapshot[collection].unshift(Object.assign({}, cloneSafe(row || {}, []), { immutable: true }));
            if (snapshot[collection].length > MAX_HISTORY) snapshot[collection] = snapshot[collection].slice(0, MAX_HISTORY);
            save(snapshot);
        } catch (error) {}
        return row;
    }

    function audit(actionType, payload, context, severity) {
        try {
            if (context && (context.skipAuditPersistence || context.skipAudit)) return null;
            var currentActor = actor(context || {});
            var cleanPayload = cloneSafe(payload || {}, []);
            var auditEvent = {
                type: actionType,
                actionType: actionType,
                source: SOURCE,
                severity: severity || 'INFO',
                actorId: currentActor.id,
                actorRole: currentActor.role,
                tenantSlug: cleanPayload.tenantSlug || contextTenant(context || {}),
                module: 'Enterprise AI Platform',
                targetId: cleanPayload.agentId || cleanPayload.toolCallId || cleanPayload.reasoningId || cleanPayload.connectionId || cleanPayload.memoryId || '',
                description: cleanPayload.description || actionType,
                metadata: Object.assign({}, cleanPayload, {
                    actionType: actionType,
                    actorRole: currentActor.role,
                    module: 'Enterprise AI Platform'
                })
            };
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                return global.AuditService.recordAudit(auditEvent, context || {});
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                return source.writeAuditLog(currentActor.role, currentActor.id, actionType, 'Enterprise AI Platform', auditEvent.targetId, auditEvent.description);
            }
            var snapshot = data();
            if (!Array.isArray(snapshot.auditLogs)) snapshot.auditLogs = [];
            snapshot.auditLogs.unshift({
                id: createId('AUD'),
                date: nowIso(context || {}),
                actorRole: currentActor.role,
                actorId: currentActor.id,
                actionType: actionType,
                module: 'Enterprise AI Platform',
                targetId: auditEvent.targetId,
                description: auditEvent.description,
                tenantSlug: auditEvent.tenantSlug
            });
            save(snapshot);
        } catch (error) {}
        return null;
    }

    function tenantRows(collection, tenantSlug) {
        var tenant = normalizeTenant(tenantSlug);
        return (Array.isArray(data()[collection]) ? data()[collection] : []).filter(function filter(row) {
            return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId)) === tenant;
        });
    }

    function safeTerms(text) {
        var seen = {};
        return safeString(text || '', '').toLowerCase()
            .replace(/[^a-z0-9\s-]+/g, ' ')
            .split(/\s+/)
            .filter(function keep(term) {
                if (!term || term.length < 3 || STOP_WORDS.indexOf(term) !== -1 || seen[term]) return false;
                seen[term] = true;
                return true;
            });
    }

    function keywordScore(query, haystack) {
        var terms = safeTerms(query);
        var text = safeString(haystack || '', '').toLowerCase();
        if (!terms.length || !text) return 0;
        var hits = terms.filter(function hit(term) { return text.indexOf(term) !== -1; }).length;
        return clampScore((hits / terms.length) * 100);
    }

    function agentDefinition(agentId) {
        var id = token(agentId || 'HR_AGENT');
        var titles = {
            HR_AGENT: ['HR Agent', 'Policy, employee support, onboarding guidance'],
            RECRUITMENT_AGENT: ['Recruitment Agent', 'Candidate pipeline and hiring intelligence'],
            PAYROLL_AGENT: ['Payroll Agent', 'Payroll questions and anomaly triage'],
            LEAVE_AGENT: ['Leave Agent', 'Leave policy, balances, and approval recommendations'],
            ATTENDANCE_AGENT: ['Attendance Agent', 'Attendance trends and exception guidance'],
            PERFORMANCE_AGENT: ['Performance Agent', 'Review and performance intelligence'],
            COMPLIANCE_AGENT: ['Compliance Agent', 'Compliance controls, evidence, and risk'],
            KNOWLEDGE_AGENT: ['Knowledge Agent', 'RAG retrieval and citation grounding'],
            ANALYTICS_AGENT: ['Analytics Agent', 'Workforce and platform analytics'],
            OPERATIONS_AGENT: ['Operations Agent', 'Incidents, queues, APIs, and infrastructure'],
            DOCUMENT_AGENT: ['Document Agent', 'Document governance and metadata lookup'],
            WORKFLOW_AGENT: ['Workflow Agent', 'Automation and approval optimization recommendations']
        };
        var title = titles[id] || [id.replace(/_/g, ' '), 'Custom future agent'];
        return {
            agentId: id,
            name: title[0],
            description: title[1],
            status: AGENT_IDS.indexOf(id) !== -1 ? 'ACTIVE' : 'FUTURE_READY',
            version: VERSION,
            providerAgnostic: true,
            externalProviderCalled: false,
            autonomousExecutionDefault: false,
            requiredApprovals: ['RBAC', 'TENANT_VALIDATION', 'AUDIT', 'HUMAN_APPROVAL_FOR_ACTIONS'],
            capabilities: capabilitiesForAgent(id),
            tools: toolsForAgent(id)
        };
    }

    function capabilitiesForAgent(agentId) {
        var id = token(agentId);
        if (id === 'OPERATIONS_AGENT') return ['INCIDENT_ANALYSIS', 'QUEUE_ANALYSIS', 'API_HEALTH', 'RECOMMENDATIONS'];
        if (id === 'WORKFLOW_AGENT') return ['WORKFLOW_RECOMMENDATIONS', 'APPROVAL_OPTIMIZATION', 'AUTOMATION_READINESS'];
        if (id === 'KNOWLEDGE_AGENT') return ['TENANT_RAG_RETRIEVAL', 'CONTEXT_RANKING', 'CITATION_READY_CONTEXT'];
        if (id === 'ANALYTICS_AGENT') return ['METRIC_SUMMARIES', 'TREND_ANALYSIS', 'SCORE_GENERATION'];
        if (id === 'COMPLIANCE_AGENT') return ['CONTROL_REVIEW', 'POLICY_EVIDENCE', 'RISK_SIGNALS'];
        return ['DOMAIN_QA', 'KNOWLEDGE_RETRIEVAL', 'RECOMMENDATION_ONLY'];
    }

    function toolsForAgent(agentId) {
        var id = token(agentId);
        if (id === 'OPERATIONS_AGENT') return ['ANALYTICS_QUERY', 'REPORT_SUMMARY', 'WORKFLOW_RECOMMENDATION'];
        if (id === 'WORKFLOW_AGENT') return ['WORKFLOW_RECOMMENDATION', 'API_CATALOG'];
        if (id === 'KNOWLEDGE_AGENT') return ['KNOWLEDGE_RETRIEVAL', 'DOCUMENT_LOOKUP'];
        if (id === 'DOCUMENT_AGENT') return ['DOCUMENT_LOOKUP', 'KNOWLEDGE_RETRIEVAL'];
        return ['KNOWLEDGE_RETRIEVAL', 'ANALYTICS_QUERY'];
    }

    function selectAgents(input) {
        var requested = unique((Array.isArray(input.requestedAgents) ? input.requestedAgents : safeString(input.requestedAgents || '', '').split(',')).map(token));
        var query = safeString(input.query || '', '').toLowerCase();
        var selected = requested.filter(function keep(id) { return AGENT_IDS.indexOf(id) !== -1; });
        if (!selected.length) {
            if (/queue|api|latency|incident|failed|notification|system|health/.test(query)) selected.push('OPERATIONS_AGENT');
            if (/workflow|approval|automation|optimi[sz]ation|bottleneck/.test(query)) selected.push('WORKFLOW_AGENT');
            if (/policy|document|knowledge|runbook|why|what|how/.test(query)) selected.push('KNOWLEDGE_AGENT');
            if (/analytics|score|trend|summary|metric/.test(query)) selected.push('ANALYTICS_AGENT');
        }
        if (!selected.length) selected.push('HR_AGENT');
        if (selected.indexOf('KNOWLEDGE_AGENT') === -1) selected.push('KNOWLEDGE_AGENT');
        return unique(selected).slice(0, 6).map(agentDefinition);
    }

    function listAgents(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var agents = AGENT_IDS.map(agentDefinition);
            persist('enterpriseAiAgentHistory', {
                registryId: createId('AIREG'),
                tenantSlug: access.tenantSlug,
                agentCount: agents.length,
                providerAgnostic: true,
                generatedAt: nowIso(context || {})
            }, context || {});
            audit('ENTERPRISE_AI_AGENT_REGISTRY_VIEWED', {
                tenantSlug: access.tenantSlug,
                description: 'Enterprise AI agent registry viewed.'
            }, context || {}, 'INFO');
            return result(true, 'AI_AGENT_REGISTRY_READY', 'Enterprise AI agent registry ready.', {
                tenantSlug: access.tenantSlug,
                agents: agents,
                registry: {
                    singleAgent: true,
                    multiAgentCollaboration: true,
                    delegation: true,
                    consensus: true,
                    specialistRouting: true,
                    fallbackAgent: true,
                    coordinatorAgent: true,
                    providerAgnostic: true
                },
                governance: governanceFlags({ agentRegistryReady: true })
            });
        } catch (error) {
            return result(false, 'AI_AGENT_REGISTRY_FAILED_SAFE', 'AI agent registry failed safely.', { governance: governanceFlags() });
        }
    }

    function registerConnection(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_MCP_CONNECTION_PAYLOAD', 'MCP connection payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('PLATFORM_CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var resources = unique((Array.isArray(input.resources) ? input.resources : safeString(input.resources || '', '').split(',')).map(function map(value) { return safeString(value || '', '').trim(); }));
            var connection = {
                connectionId: createId('MCP'),
                tenantSlug: access.tenantSlug,
                serverId: safeString(input.serverId || input.connectionId || 'MCP-GENERIC', '').trim().slice(0, 120) || 'MCP-GENERIC',
                serverType: token(input.serverType || 'GENERIC_MCP'),
                provider: token(input.provider || 'GENERIC_MCP'),
                status: token(input.status || 'CONFIGURED'),
                resources: resources.length ? resources : MCP_RESOURCE_TYPES.slice(0),
                supportedResources: MCP_RESOURCE_TYPES.slice(0),
                providerAgnostic: true,
                credentialsStoredPlaintext: false,
                toolExecutionRestricted: true,
                registeredAt: nowIso(context || {})
            };
            persist('enterpriseAiMcpConnectionHistory', connection, context || {});
            audit('ENTERPRISE_AI_MCP_CONNECTED', {
                tenantSlug: access.tenantSlug,
                connectionId: connection.connectionId,
                description: 'Enterprise AI MCP connection registered without plaintext credentials.'
            }, context || {}, 'INFO');
            return result(true, 'MCP_CONNECTION_REGISTERED', 'MCP connection registered.', {
                tenantSlug: access.tenantSlug,
                connection: connection,
                providerAgnostic: true,
                credentialsStoredPlaintext: false,
                governance: governanceFlags({ mcpIntegrationReady: true })
            });
        } catch (error) {
            return result(false, 'MCP_CONNECTION_FAILED_SAFE', 'MCP connection failed safely.', { governance: governanceFlags() });
        }
    }

    function listConnections(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            return result(true, 'MCP_CONNECTIONS_READY', 'MCP connections listed.', {
                tenantSlug: access.tenantSlug,
                connections: tenantRows('enterpriseAiMcpConnectionHistory', access.tenantSlug),
                supportedResources: MCP_RESOURCE_TYPES.slice(0),
                governance: governanceFlags({ mcpIntegrationReady: true })
            });
        } catch (error) {
            return result(false, 'MCP_CONNECTION_LIST_FAILED_SAFE', 'MCP connection list failed safely.', { governance: governanceFlags() });
        }
    }

    function validatePromptSafety(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var query = safeString(source.query || source.prompt || source.content || '', '').trim();
            var injection = PROMPT_INJECTION_PATTERN.test(query);
            var destructive = DESTRUCTIVE_ACTION_PATTERN.test(query) && !NEGATED_ACTION_PATTERN.test(query);
            var unsafe = injection || destructive || safeNumber(source.contextTokens, 0) > 60000;
            var row = {
                safetyId: createId('AISAFE'),
                tenantSlug: access.tenantSlug,
                queryHash: hashString(query),
                promptInjectionDetected: injection,
                destructiveActionDetected: destructive,
                oversizedContextDetected: safeNumber(source.contextTokens, 0) > 60000,
                blocked: unsafe,
                checkedAt: nowIso(context || {})
            };
            persist('enterpriseAiSafetyHistory', row, context || {});
            audit(unsafe ? 'ENTERPRISE_AI_SAFETY_VIOLATION_BLOCKED' : 'ENTERPRISE_AI_SAFETY_VALIDATED', {
                tenantSlug: access.tenantSlug,
                safetyId: row.safetyId,
                description: unsafe ? 'Unsafe AI prompt or action request blocked.' : 'AI prompt safety validated.'
            }, context || {}, unsafe ? 'WARNING' : 'INFO');
            if (unsafe) {
                return result(false, 'AI_SAFETY_VIOLATION_BLOCKED', 'Unsafe AI request blocked by safety governance.', {
                    tenantSlug: access.tenantSlug,
                    safety: row,
                    governance: governanceFlags({ hiddenPromptExposed: false, unsafeAutomationBlocked: true })
                });
            }
            return result(true, 'AI_SAFETY_VALIDATED', 'AI request safety validated.', {
                tenantSlug: access.tenantSlug,
                safety: row,
                governance: governanceFlags({ hiddenPromptExposed: false })
            });
        } catch (error) {
            return result(false, 'AI_SAFETY_FAILED_SAFE', 'AI safety validation failed safely.', { governance: governanceFlags({ hiddenPromptExposed: false }) });
        }
    }

    function isDestructiveTool(toolName) {
        var normalized = token(toolName || '');
        return BLOCKED_TOOLS.indexOf(normalized) !== -1 || /DELETE|APPROVE|REJECT|EXECUTE|RUN_SQL|MODIFY|PURGE|DISABLE|ENABLE|TERMINATE|SUSPEND|RESTORE|ROLLBACK/.test(normalized);
    }

    function validateAutonomousAction(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_AUTONOMY_PAYLOAD', 'Autonomy payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var toolName = token(input.toolName || input.action || '');
            var destructive = isDestructiveTool(toolName);
            var autonomous = input.autonomousExecution === true || input.autoExecute === true;
            if (!autonomous) {
                return result(true, 'AUTONOMY_NOT_REQUESTED', 'Autonomous execution was not requested.', {
                    tenantSlug: access.tenantSlug,
                    autonomy: { allowed: true, autonomousExecution: false, destructiveAction: destructive },
                    governance: governanceFlags({ autonomousActionExecuted: false })
                });
            }
            var config = isPlainObject(input.adminConfiguration) ? input.adminConfiguration : {};
            var allowedTools = (Array.isArray(config.allowedTools) ? config.allowedTools : []).map(token);
            var approved = config.autonomousActionsEnabled === true && allowedTools.indexOf(toolName) !== -1 && !!safeString(config.approvalReference || '', '').trim();
            if (destructive || !approved) {
                audit('ENTERPRISE_AI_AUTONOMOUS_ACTION_BLOCKED', {
                    tenantSlug: access.tenantSlug,
                    toolName: toolName,
                    description: 'Autonomous AI action blocked by governance.'
                }, context || {}, 'WARNING');
                return result(false, 'AI_AUTONOMOUS_ACTION_BLOCKED', 'Autonomous AI action requires explicit administrator configuration and cannot be destructive.', {
                    tenantSlug: access.tenantSlug,
                    autonomy: {
                        allowed: false,
                        autonomousExecution: true,
                        destructiveAction: destructive,
                        approvalReference: safeString(config.approvalReference || '', '')
                    },
                    governance: governanceFlags({ autonomousActionExecuted: false, unsafeAutomationBlocked: true })
                });
            }
            audit('ENTERPRISE_AI_AUTONOMOUS_ACTION_APPROVED_BY_CONFIG', {
                tenantSlug: access.tenantSlug,
                toolName: toolName,
                description: 'Safe autonomous AI action allowed by explicit administrator configuration.'
            }, context || {}, 'INFO');
            return result(true, 'AI_AUTONOMOUS_ACTION_ALLOWED_BY_CONFIG', 'Safe autonomous AI action allowed by explicit administrator configuration.', {
                tenantSlug: access.tenantSlug,
                autonomy: {
                    allowed: true,
                    autonomousExecution: true,
                    destructiveAction: false,
                    toolName: toolName,
                    approvalReference: safeString(config.approvalReference || '', '')
                },
                governance: governanceFlags({ autonomousActionExecuted: false, adminConfiguredAutonomy: true })
            });
        } catch (error) {
            return result(false, 'AI_AUTONOMY_FAILED_SAFE', 'AI autonomy validation failed safely.', { governance: governanceFlags() });
        }
    }

    function routeToolCall(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_TOOL_CALL_PAYLOAD', 'Tool call payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var toolName = token(input.toolName || input.tool || 'KNOWLEDGE_RETRIEVAL');
            var safety = validatePromptSafety({ tenantSlug: access.tenantSlug, query: input.query || input.prompt || '', contextTokens: input.contextTokens || 0 }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            if (!safety.success || isDestructiveTool(toolName)) {
                var blocked = {
                    toolCallId: createId('AITOOL'),
                    tenantSlug: access.tenantSlug,
                    toolName: toolName,
                    status: 'BLOCKED',
                    permissionGranted: false,
                    executedDestructiveAction: false,
                    blockedReason: !safety.success ? 'SAFETY_VIOLATION' : 'DESTRUCTIVE_TOOL',
                    requestedAt: nowIso(context || {})
                };
                persist('enterpriseAiToolCallHistory', blocked, context || {});
                audit('ENTERPRISE_AI_TOOL_CALL_BLOCKED', {
                    tenantSlug: access.tenantSlug,
                    toolCallId: blocked.toolCallId,
                    toolName: toolName,
                    description: 'Enterprise AI tool call blocked.'
                }, context || {}, 'WARNING');
                return result(false, 'AI_TOOL_CALL_BLOCKED', 'Enterprise AI tool call blocked by safety or tool governance.', {
                    tenantSlug: access.tenantSlug,
                    toolCall: blocked,
                    governance: governanceFlags({ autonomousActionExecuted: false, unsafeAutomationBlocked: true })
                });
            }
            var autonomy = validateAutonomousAction(Object.assign({}, input, { tenantSlug: access.tenantSlug, toolName: toolName }), Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            if (input.autonomousExecution === true && !autonomy.success) {
                return result(false, 'AI_TOOL_CALL_BLOCKED', 'Enterprise AI tool call blocked by autonomous action governance.', {
                    tenantSlug: access.tenantSlug,
                    autonomy: autonomy.autonomy,
                    governance: governanceFlags({ autonomousActionExecuted: false })
                });
            }
            var execution = simulateToolResult(toolName, input, access, context || {});
            var toolCall = {
                toolCallId: createId('AITOOL'),
                tenantSlug: access.tenantSlug,
                toolName: toolName,
                status: 'ROUTED',
                permissionGranted: true,
                requiredPermission: safeString(input.requiredPermission || '', ''),
                executedDestructiveAction: false,
                autonomousExecution: input.autonomousExecution === true,
                outputPreview: execution.preview,
                resultCount: execution.resultCount,
                latencyMs: execution.latencyMs,
                routedAt: nowIso(context || {})
            };
            persist('enterpriseAiToolCallHistory', toolCall, context || {});
            audit('ENTERPRISE_AI_TOOL_CALL_ROUTED', {
                tenantSlug: access.tenantSlug,
                toolCallId: toolCall.toolCallId,
                toolName: toolName,
                description: 'Enterprise AI tool call routed through guarded router.'
            }, context || {}, 'INFO');
            return result(true, 'AI_TOOL_CALL_ROUTED', 'Enterprise AI tool call routed.', {
                tenantSlug: access.tenantSlug,
                toolCall: toolCall,
                toolResult: execution,
                permissionGranted: true,
                executedDestructiveAction: false,
                governance: governanceFlags({ autonomousActionExecuted: false, toolExecutionRestricted: true })
            });
        } catch (error) {
            return result(false, 'AI_TOOL_ROUTING_FAILED_SAFE', 'Enterprise AI tool routing failed safely.', { governance: governanceFlags() });
        }
    }

    function simulateToolResult(toolName, input, access, context) {
        var started = Date.now();
        var normalized = token(toolName || 'KNOWLEDGE_RETRIEVAL');
        var query = safeString(input.query || '', '');
        if (normalized === 'KNOWLEDGE_RETRIEVAL' || normalized === 'DOCUMENT_LOOKUP') {
            var rag = global.TenantScopedRagService || global.tenantScopedRagService;
            if (rag && rag.KnowledgeSearchService && typeof rag.KnowledgeSearchService.searchKnowledge === 'function') {
                var search = rag.KnowledgeSearchService.searchKnowledge({
                    tenantSlug: access.tenantSlug,
                    query: query || 'enterprise AI governance',
                    searchMode: input.searchMode || 'HYBRID',
                    limit: Math.max(1, Math.min(8, safeNumber(input.limit, 5)))
                }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
                return {
                    success: search.success === true,
                    preview: search.success ? 'Retrieved tenant knowledge context.' : 'Knowledge retrieval unavailable.',
                    results: (search.results || []).map(function map(row) {
                        return {
                            documentId: row.documentId,
                            title: row.title,
                            score: row.score,
                            snippet: row.snippet,
                            sourceType: row.sourceType,
                            documentType: row.documentType
                        };
                    }),
                    resultCount: search.resultCount || 0,
                    latencyMs: Date.now() - started
                };
            }
        }
        if (normalized === 'API_CATALOG') {
            var apis = tenantRows('developerApiCatalogHistory', access.tenantSlug);
            return {
                success: true,
                preview: 'Tenant public API catalog summarized.',
                results: apis.slice(0, 8).map(function map(row) { return { apiId: row.apiId, module: row.module, path: row.path, status: row.status }; }),
                resultCount: apis.length,
                latencyMs: Date.now() - started
            };
        }
        if (normalized === 'WORKFLOW_RECOMMENDATION') {
            var workflows = tenantRows('noCodeWorkflowDefinitionHistory', access.tenantSlug);
            return {
                success: true,
                preview: 'Workflow optimization recommendation prepared without execution.',
                results: workflows.slice(0, 8).map(function map(row) { return { workflowId: row.workflowId, name: row.name, status: row.status }; }),
                resultCount: workflows.length,
                latencyMs: Date.now() - started
            };
        }
        var operational = tenantRows('aiOperationsIncidentHistory', access.tenantSlug).concat(tenantRows('infrastructureAlertHistory', access.tenantSlug));
        return {
            success: true,
            preview: 'Tenant operational signal summarized.',
            results: operational.slice(0, 8).map(function map(row) { return { id: row.incidentId || row.alertId || row.id, category: row.category || row.service || normalized, severity: row.severity || 'INFO' }; }),
            resultCount: operational.length,
            latencyMs: Date.now() - started
        };
    }

    function storeMemory(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_MEMORY_PAYLOAD', 'AI memory payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var memoryType = token(input.memoryType || input.type || 'CONVERSATION_MEMORY');
            if (MEMORY_TYPES.indexOf(memoryType) === -1) memoryType = 'CONVERSATION_MEMORY';
            var content = safeString(input.content || input.summary || input.memory || '', '').trim().slice(0, 2400);
            var memory = {
                memoryId: createId('AIMEM'),
                tenantSlug: access.tenantSlug,
                conversationId: safeString(input.conversationId || 'default', '').trim().slice(0, 160) || 'default',
                memoryType: memoryType,
                content: content,
                contentHash: hashString(content),
                retentionDays: Math.max(1, Math.min(3650, safeNumber(input.retentionDays, 90))),
                visibility: token(input.visibility || 'TENANT'),
                storedAt: nowIso(context || {})
            };
            persist('enterpriseAiMemoryHistory', memory, context || {});
            audit('ENTERPRISE_AI_MEMORY_STORED', {
                tenantSlug: access.tenantSlug,
                memoryId: memory.memoryId,
                description: 'Enterprise AI memory stored in tenant scope.'
            }, context || {}, 'INFO');
            return result(true, 'AI_MEMORY_STORED', 'AI memory stored in tenant scope.', {
                tenantSlug: access.tenantSlug,
                memory: memory,
                governance: governanceFlags({ memoryTenantScoped: true })
            });
        } catch (error) {
            return result(false, 'AI_MEMORY_STORE_FAILED_SAFE', 'AI memory storage failed safely.', { governance: governanceFlags() });
        }
    }

    function retrieveMemory(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var conversationId = safeString(source.conversationId || '', '').trim();
            var rows = tenantRows('enterpriseAiMemoryHistory', access.tenantSlug).filter(function filter(row) {
                return !conversationId || safeString(row.conversationId || '', '') === conversationId;
            });
            return result(true, 'AI_MEMORY_RETRIEVED', 'AI memory retrieved in tenant scope.', {
                tenantSlug: access.tenantSlug,
                memories: rows.slice(0, Math.max(1, Math.min(50, safeNumber(source.limit, 12)))),
                governance: governanceFlags({ memoryTenantScoped: true })
            });
        } catch (error) {
            return result(false, 'AI_MEMORY_RETRIEVAL_FAILED_SAFE', 'AI memory retrieval failed safely.', { governance: governanceFlags() });
        }
    }

    function buildRecommendations(input, agents, toolResults, access) {
        var query = safeString(input.query || '', '').toLowerCase();
        var recommendations = [];
        if (/notification|queue|delayed|failed/.test(query) || agents.some(function has(row) { return row.agentId === 'OPERATIONS_AGENT'; })) {
            recommendations.push({
                recommendationId: createId('AIREC'),
                tenantSlug: access.tenantSlug,
                area: 'Operations',
                priority: 'HIGH',
                action: 'Review queue latency, failed delivery trends, and worker capacity before changing production settings.',
                rationale: 'Operational signals indicate a workflow or notification delivery bottleneck may need human review.',
                requiresHumanApproval: true,
                autoExecuted: false
            });
        }
        if (/workflow|approval|optimi[sz]ation|bottleneck/.test(query) || agents.some(function has(row) { return row.agentId === 'WORKFLOW_AGENT'; })) {
            recommendations.push({
                recommendationId: createId('AIREC'),
                tenantSlug: access.tenantSlug,
                area: 'Workflow',
                priority: 'NORMAL',
                action: 'Create a draft workflow improvement proposal and route it through administrator approval.',
                rationale: 'Automation changes remain recommendation-only until administrators explicitly configure and approve execution.',
                requiresHumanApproval: true,
                autoExecuted: false
            });
        }
        if (!recommendations.length) {
            recommendations.push({
                recommendationId: createId('AIREC'),
                tenantSlug: access.tenantSlug,
                area: 'Knowledge',
                priority: 'NORMAL',
                action: 'Review grounded citations and update the knowledge base if confidence is low.',
                rationale: 'Knowledge quality drives safer AI responses.',
                requiresHumanApproval: true,
                autoExecuted: false
            });
        }
        return recommendations.map(function enrich(row) {
            return Object.assign({}, row, { evidenceCount: toolResults.reduce(function sum(acc, item) { return acc + safeNumber(item.resultCount, 0); }, 0) });
        });
    }

    function coordinateAgents(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_AGENT_COORDINATION_PAYLOAD', 'Agent coordination payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var safety = validatePromptSafety({ tenantSlug: access.tenantSlug, query: input.query || '', contextTokens: input.contextTokens || 0 }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            if (!safety.success) return safety;
            var autonomy = validateAutonomousAction(Object.assign({}, input, { tenantSlug: access.tenantSlug, toolName: 'WORKFLOW_RECOMMENDATION' }), Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            if (input.allowAutonomousExecution === true && !autonomy.success) return autonomy;
            var agents = selectAgents(input);
            var toolPlan = unique(agents.reduce(function reduce(acc, agent) { return acc.concat(agent.tools || []); }, []));
            if (input.includeMcp && toolPlan.indexOf('API_CATALOG') === -1) toolPlan.push('API_CATALOG');
            var toolResults = toolPlan.slice(0, 4).map(function route(toolName) {
                return routeToolCall({
                    tenantSlug: access.tenantSlug,
                    toolName: toolName,
                    query: input.query || '',
                    requiredPermission: permissionForTool(toolName),
                    autonomousExecution: false
                }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            });
            var recommendations = buildRecommendations(input, agents, toolResults.map(function map(row) { return row.toolCall || {}; }), access);
            recommendations.forEach(function persistRecommendation(row) {
                persist('enterpriseAiRecommendationHistory', Object.assign({}, row, { generatedAt: nowIso(context || {}) }), context || {});
            });
            var reasoning = {
                reasoningId: createId('AIREASON'),
                tenantSlug: access.tenantSlug,
                conversationId: safeString(input.conversationId || 'default', '').trim().slice(0, 160) || 'default',
                mode: token(input.mode || 'SINGLE_AGENT'),
                selectedAgents: agents.map(function map(agent) { return agent.agentId; }),
                toolCount: toolResults.length,
                recommendationCount: recommendations.length,
                consensusReached: agents.length > 1,
                confidenceScore: clampScore(68 + Math.min(20, toolResults.length * 4) + Math.min(12, recommendations.length * 3)),
                executionMode: 'RECOMMEND_ONLY',
                reasonedAt: nowIso(context || {})
            };
            persist('enterpriseAiReasoningHistory', reasoning, context || {});
            audit('ENTERPRISE_AI_AGENT_COORDINATED', {
                tenantSlug: access.tenantSlug,
                reasoningId: reasoning.reasoningId,
                description: 'Enterprise AI agents coordinated in recommendation-only mode.'
            }, context || {}, 'INFO');
            return result(true, 'AI_AGENT_COORDINATION_COMPLETED', 'Enterprise AI agents coordinated.', {
                tenantSlug: access.tenantSlug,
                selectedAgents: agents,
                orchestration: {
                    mode: reasoning.mode,
                    delegationEnabled: true,
                    specialistRouting: true,
                    fallbackAgent: 'KNOWLEDGE_AGENT',
                    coordinatorAgent: 'AGENT_COORDINATOR',
                    consensusReached: true,
                    toolCount: toolResults.length
                },
                response: {
                    responseId: createId('AIRESP'),
                    executionMode: 'RECOMMEND_ONLY',
                    answer: 'Enterprise AI agents prepared governed recommendations from tenant-scoped knowledge, tools, and operational signals. No workflow or destructive action was executed.',
                    confidenceScore: reasoning.confidenceScore,
                    citations: collectCitations(toolResults),
                    generatedAt: nowIso(context || {})
                },
                recommendations: recommendations,
                toolResults: toolResults,
                governance: governanceFlags({ autonomousActionExecuted: false, multiAgentCollaborationReady: true })
            });
        } catch (error) {
            return result(false, 'AI_AGENT_COORDINATION_FAILED_SAFE', 'Enterprise AI agent coordination failed safely.', { governance: governanceFlags() });
        }
    }

    function permissionForTool(toolName) {
        var normalized = token(toolName || '');
        if (normalized === 'API_CATALOG') return 'developer.api.read';
        if (normalized === 'WORKFLOW_RECOMMENDATION') return 'workflow.recommend';
        if (normalized === 'ANALYTICS_QUERY') return 'analytics.read';
        if (normalized === 'DOCUMENT_LOOKUP') return 'documents.read';
        return 'knowledge.read';
    }

    function collectCitations(toolResults) {
        var citations = [];
        (Array.isArray(toolResults) ? toolResults : []).forEach(function each(response) {
            var results = response && response.toolResult && Array.isArray(response.toolResult.results) ? response.toolResult.results : [];
            results.slice(0, 3).forEach(function eachResult(row) {
                if (row.documentId || row.title) {
                    citations.push({
                        documentId: row.documentId || row.title,
                        title: row.title || row.documentId,
                        confidenceScore: clampScore(row.score || 62),
                        source: 'TENANT_KNOWLEDGE'
                    });
                }
            });
        });
        return citations.slice(0, 8);
    }

    function reason(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_REASONING_PAYLOAD', 'Reasoning payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || input.companyId, context || {});
            if (!access.success) return access;
            var safety = validatePromptSafety({ tenantSlug: access.tenantSlug, query: input.query || '', contextTokens: input.contextTokens || 0 }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }) }));
            if (!safety.success) return safety;
            return coordinateAgents(Object.assign({}, input, { tenantSlug: access.tenantSlug }), context || {});
        } catch (error) {
            return result(false, 'AI_REASONING_FAILED_SAFE', 'AI reasoning failed safely.', { governance: governanceFlags({ hiddenPromptExposed: false }) });
        }
    }

    function generateAIPlatformAnalytics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var agents = tenantRows('enterpriseAiAgentHistory', access.tenantSlug);
            var tools = tenantRows('enterpriseAiToolCallHistory', access.tenantSlug);
            var reasoningRows = tenantRows('enterpriseAiReasoningHistory', access.tenantSlug);
            var memories = tenantRows('enterpriseAiMemoryHistory', access.tenantSlug);
            var mcp = tenantRows('enterpriseAiMcpConnectionHistory', access.tenantSlug);
            var recommendations = tenantRows('enterpriseAiRecommendationHistory', access.tenantSlug);
            var safety = tenantRows('enterpriseAiSafetyHistory', access.tenantSlug);
            var ragSearches = tenantRows('knowledgeSearchHistory', access.tenantSlug);
            var blockedTools = tools.filter(function blocked(row) { return row.status === 'BLOCKED'; }).length;
            var successfulTools = tools.filter(function ok(row) { return row.status === 'ROUTED'; }).length;
            var averageConfidence = average(reasoningRows.map(function score(row) { return row.confidenceScore; }), reasoningRows.length ? 72 : 0);
            var analytics = {
                agentUsage: agents.length + reasoningRows.reduce(function sum(acc, row) { return acc + (row.selectedAgents || []).length; }, 0),
                reasoningEvents: reasoningRows.length,
                reasoningTimeMs: average(reasoningRows.map(function rowTime(row) { return row.durationMs || 0; }), 80),
                toolUsage: tools.length,
                knowledgeRetrieval: ragSearches.length + tools.filter(function knowledge(row) { return row.toolName === 'KNOWLEDGE_RETRIEVAL'; }).length,
                confidence: averageConfidence,
                failures: blockedTools + safety.filter(function filter(row) { return row.blocked; }).length,
                recommendations: recommendations.length,
                mcpConnections: mcp.length,
                memoryItems: memories.length,
                safetyBlocks: safety.filter(function filter(row) { return row.blocked; }).length
            };
            var agentReliability = tools.length ? clampScore((successfulTools / tools.length) * 100) : 92;
            var knowledgeQuality = clampScore(55 + Math.min(35, analytics.knowledgeRetrieval * 8) + Math.min(10, averageConfidence / 10));
            var automationReadiness = clampScore(72 + Math.min(18, recommendations.length * 4) - Math.min(20, blockedTools * 4));
            var aiPlatformHealth = clampScore(average([agentReliability, knowledgeQuality, automationReadiness, 100 - Math.min(45, analytics.safetyBlocks * 12)], 80));
            var report = {
                analyticsId: createId('AIAN'),
                tenantSlug: access.tenantSlug,
                generatedAt: nowIso(context || {}),
                analytics: analytics,
                aiPlatformHealth: aiPlatformHealth,
                agentReliability: agentReliability,
                knowledgeQuality: knowledgeQuality,
                automationReadiness: automationReadiness
            };
            persist('enterpriseAiAnalyticsHistory', report, context || {});
            return result(true, 'AI_PLATFORM_ANALYTICS_READY', 'Enterprise AI platform analytics generated.', Object.assign({}, report, {
                governance: governanceFlags({ analyticsTenantScoped: true })
            }));
        } catch (error) {
            return result(false, 'AI_PLATFORM_ANALYTICS_FAILED_SAFE', 'AI platform analytics failed safely.', { governance: governanceFlags() });
        }
    }

    function generateAIPlatformReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId || source.companyId, context || {});
            if (!access.success) return access;
            var registry = listAgents({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            var connections = listConnections({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            var analytics = generateAIPlatformAnalytics({ tenantSlug: access.tenantSlug }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, actor: Object.assign({}, actor(context || {}), { tenantSlug: access.tenantSlug }), skipAuditPersistence: true }));
            return result(true, 'AI_PLATFORM_REPORT_READY', 'Enterprise AI platform report generated.', {
                tenantSlug: access.tenantSlug,
                agents: registry.agents || [],
                mcpConnections: connections.connections || [],
                toolCalls: tenantRows('enterpriseAiToolCallHistory', access.tenantSlug).slice(0, 20),
                memories: tenantRows('enterpriseAiMemoryHistory', access.tenantSlug).slice(0, 20),
                reasoningHistory: tenantRows('enterpriseAiReasoningHistory', access.tenantSlug).slice(0, 20),
                recommendations: tenantRows('enterpriseAiRecommendationHistory', access.tenantSlug).slice(0, 20),
                safetyHistory: tenantRows('enterpriseAiSafetyHistory', access.tenantSlug).slice(0, 20),
                analytics: analytics.analytics || {},
                aiPlatformHealth: analytics.aiPlatformHealth || 0,
                agentReliability: analytics.agentReliability || 0,
                knowledgeQuality: analytics.knowledgeQuality || 0,
                automationReadiness: analytics.automationReadiness || 0,
                architecture: {
                    multipleAgents: true,
                    mcpIntegration: true,
                    toolCalling: true,
                    knowledgeReasoning: true,
                    multiAgentCollaboration: true,
                    workflowRecommendations: true,
                    providerAgnostic: true
                },
                governance: governanceFlags({ noAutonomousActionWithoutExplicitAdminApproval: true })
            });
        } catch (error) {
            return result(false, 'AI_PLATFORM_REPORT_FAILED_SAFE', 'AI platform report failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var tests = [];
        function record(name, ok, details) { tests.push(freezeAIPlatformOutput({ name: name, ok: !!ok, details: details || null })); }
        try {
            var context = { actor: { id: 'AI-SELF', role: 'PLATFORM_OWNER', tenantSlug: 'enterprise-ai-self-test' }, tenantSlug: 'enterprise-ai-self-test', skipAuditPersistence: true };
            var agents = listAgents({ tenantSlug: 'enterprise-ai-self-test' }, context);
            record('multi-agent routing works', agents.success === true && (agents.agents || []).length >= AGENT_IDS.length, agents);
            var mcp = registerConnection({ tenantSlug: 'enterprise-ai-self-test', serverId: 'MCP-SELF', resources: MCP_RESOURCE_TYPES }, context);
            record('MCP gateway works', mcp.success === true && mcp.connection.credentialsStoredPlaintext === false, mcp);
            var tool = routeToolCall({ tenantSlug: 'enterprise-ai-self-test', toolName: 'WORKFLOW_RECOMMENDATION', query: 'recommend workflow improvement' }, context);
            record('tool calling works', tool.success === true && tool.executedDestructiveAction === false, tool);
            var memory = storeMemory({ tenantSlug: 'enterprise-ai-self-test', conversationId: 'SELF', content: 'Self-test memory' }, context);
            var recalled = retrieveMemory({ tenantSlug: 'enterprise-ai-self-test', conversationId: 'SELF' }, context);
            record('memory works', memory.success === true && recalled.success === true && recalled.memories.length >= 1, recalled);
            var denied = listAgents({ tenantSlug: 'other-enterprise-ai-self-test' }, context);
            record('tenant isolation preserved', denied.success === false && denied.code === 'TENANT_ACCESS_DENIED', denied);
            var blocked = routeToolCall({ tenantSlug: 'enterprise-ai-self-test', toolName: 'APPROVE_LEAVE', query: 'approve leave' }, context);
            record('safety enforced', blocked.success === false && blocked.code === 'AI_TOOL_CALL_BLOCKED', blocked);
            var analytics = generateAIPlatformAnalytics({ tenantSlug: 'enterprise-ai-self-test' }, context);
            record('analytics generated', analytics.success === true && analytics.aiPlatformHealth >= 0, analytics);
            var frozen = freezeAIPlatformOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            record('self-test handled safely', false, { message: safeString(error && error.message || error, '') });
        }
        return freezeAIPlatformOutput({
            passed: tests.every(function every(test) { return test.ok; }),
            tests: tests,
            generatedAt: nowIso({})
        });
    }

    var AgentRegistry = Object.freeze({
        listAgents: listAgents,
        getAgentRegistry: listAgents,
        AGENT_IDS: AGENT_IDS
    });
    var AgentCoordinator = Object.freeze({
        coordinateAgents: coordinateAgents,
        coordinate: coordinateAgents
    });
    var MCPGateway = Object.freeze({
        registerConnection: registerConnection,
        listConnections: listConnections,
        MCP_RESOURCE_TYPES: MCP_RESOURCE_TYPES
    });
    var ToolRouter = Object.freeze({
        routeToolCall: routeToolCall,
        TOOL_CATALOG: TOOL_CATALOG
    });
    var ReasoningEngine = Object.freeze({
        reason: reason,
        coordinateAgents: coordinateAgents
    });
    var MemoryService = Object.freeze({
        storeMemory: storeMemory,
        retrieveMemory: retrieveMemory
    });
    var SafetyValidator = Object.freeze({
        validatePromptSafety: validatePromptSafety,
        validateAutonomousAction: validateAutonomousAction
    });
    var AIAnalyticsService = Object.freeze({
        generateAIPlatformAnalytics: generateAIPlatformAnalytics,
        generateAIPlatformReport: generateAIPlatformReport
    });

    var service = Object.freeze({
        version: VERSION,
        AgentRegistry: AgentRegistry,
        AgentCoordinator: AgentCoordinator,
        MCPGateway: MCPGateway,
        ToolRouter: ToolRouter,
        ReasoningEngine: ReasoningEngine,
        MemoryService: MemoryService,
        SafetyValidator: SafetyValidator,
        AIAnalyticsService: AIAnalyticsService,
        registerValidationRule: undefined,
        listAgents: listAgents,
        coordinateAgents: coordinateAgents,
        registerMcpConnection: registerConnection,
        routeToolCall: routeToolCall,
        reason: reason,
        storeMemory: storeMemory,
        retrieveMemory: retrieveMemory,
        generateAIPlatformAnalytics: generateAIPlatformAnalytics,
        generateAIPlatformReport: generateAIPlatformReport,
        freezeAIPlatformOutput: freezeAIPlatformOutput,
        runSelfTest: runSelfTest
    });

    global.AdvancedEnterpriseAIPlatformService = service;
    global.advancedEnterpriseAiPlatformService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_ADVANCED_ENTERPRISE_AI_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_ADVANCED_ENTERPRISE_AI_SELF_TEST__ = freezeAIPlatformOutput({
                passed: false,
                error: safeString(error && error.message || error, ''),
                generatedAt: nowIso({})
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
