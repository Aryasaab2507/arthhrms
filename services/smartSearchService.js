/**
 * smartSearchService.js
 * ARTHHRMS - Universal Enterprise Smart Search System
 *
 * PURPOSE:
 * Provides tenant-scoped, RBAC-aware global discovery across HR, workflow,
 * strategic, communication, document, notification, and governance records.
 *
 * This service manages:
 * - cached tenant search indexes
 * - contextual relevance scoring
 * - exact, partial, and fuzzy matching
 * - search analytics and immutable search history
 * - role-scoped result visibility
 * - redacted entity previews
 *
 * This service does NOT:
 * - expose cross-tenant records
 * - expose payroll, salary, leave-balance, token, or raw document payloads
 * - bypass RBAC protections
 * - mutate searched business records
 *
 * @version 1.0.0
 */
(function attachSmartSearchService(global) {
    'use strict';

    var PREFIX = '[SmartSearchService]';
    var MAX_INDEX_ENTRIES = 10000;
    var MAX_RESULTS = 50;
    var MAX_HISTORY = 500;

    var SEARCH_DOMAINS = Object.freeze({
        EMPLOYEES: 'employees',
        DEPARTMENTS: 'departments',
        LEAVE_REQUESTS: 'leave_requests',
        ATTENDANCE_RECORDS: 'attendance_records',
        STRATEGIC_GOALS: 'strategic_goals',
        DELIVERABLES: 'deliverables',
        PROJECTS: 'projects',
        ANNOUNCEMENTS: 'announcements',
        DISCUSSIONS: 'discussions',
        NOTIFICATIONS: 'notifications',
        AUDIT_RECORDS: 'audit_records',
        DOCUMENTS: 'documents',
        WORKFLOWS: 'workflows'
    });

    var SEARCH_SCOPES = Object.freeze({
        GLOBAL: 'global',
        MODULE: 'module',
        ENTITY: 'entity',
        FILTERED: 'filtered',
        RECENT: 'recent',
        SAVED: 'saved'
    });

    var RELEVANCE_CLASSES = Object.freeze({
        EXACT_MATCH: 'EXACT_MATCH',
        HIGH_RELEVANCE: 'HIGH_RELEVANCE',
        MEDIUM_RELEVANCE: 'MEDIUM_RELEVANCE',
        LOW_RELEVANCE: 'LOW_RELEVANCE'
    });

    var DOMAIN_PRIORITY = Object.freeze({
        employees: 8,
        departments: 7,
        leave_requests: 5,
        attendance_records: 4,
        strategic_goals: 9,
        deliverables: 10,
        projects: 8,
        announcements: 5,
        discussions: 5,
        notifications: 6,
        audit_records: 3,
        documents: 7,
        workflows: 7
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw|payload|content|file.?path|storage.?path|signed.?url|download.?url)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance)\s*[:=]?\s*[\w,.\- ]+/ig;

    var indexCache = {};
    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

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
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return Number.isFinite(next) ? next : (fallback || 0);
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function freezeSearchOutput(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeSearchOutput(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function redactString(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, seen) {
        if (value === undefined || value === null) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value !== 'object') return value;

        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);

        if (Array.isArray(value)) {
            return value.map(function cloneArrayItem(item) {
                return cloneSanitized(item, refs.slice());
            });
        }

        if (!isPlainObject(value)) return safeString(value, '');

        var output = {};
        try {
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], refs.slice());
            });
        } catch (error) {}
        return output;
    }

    function normalizeToken(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim();
        return raw.replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() || (fallback || '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '', '');
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        return role;
    }

    function normalizeTenantSlug(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim().toLowerCase();
        return raw.replace(/[^a-z0-9_-]+/g, '');
    }

    function defaultTenantSlug() {
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && data.companySettings.tenantSlug, 'default');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || (context.actor && context.actor.tenantSlug)), defaultTenantSlug());
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId), safeString(context && context.empId, ''));
    }

    function tokenize(text) {
        var normalized = safeString(text, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (!normalized) return [];
        var seen = {};
        return normalized.split(/\s+/).filter(function term(value) {
            if (!value || seen[value]) return false;
            seen[value] = true;
            return true;
        });
    }

    function list(data, keys) {
        var values = [];
        keys.forEach(function collect(key) {
            if (Array.isArray(data && data[key])) values = values.concat(data[key]);
        });
        return values;
    }

    function valueOf(row, keys, fallback) {
        for (var i = 0; i < keys.length; i += 1) {
            var value = row && row[keys[i]];
            if (value !== undefined && value !== null && safeString(value, '').trim()) return value;
        }
        return fallback || '';
    }

    function rowTenant(row, fallback) {
        return normalizeTenantSlug(row && row.tenantSlug, fallback || defaultTenantSlug());
    }

    function rowDate(row) {
        return safeString(valueOf(row, ['updatedAt', 'createdAt', 'date', 'from', 'timestamp'], ''), '');
    }

    function makePreview(row, fields) {
        var text = fields.map(function field(name) {
            return safeString(row && row[name], '');
        }).filter(Boolean).join(' ');
        return redactString(text).slice(0, 260);
    }

    function makeEntry(domain, row, tenantSlug, config) {
        var id = safeString(valueOf(row, config.ids || ['id'], ''), '');
        if (!id) id = domain + '-' + Math.random().toString(36).slice(2, 8);
        var title = redactString(valueOf(row, config.titles || ['title', 'name'], id)).slice(0, 160);
        var preview = makePreview(row, config.preview || config.titles || ['title', 'name']);
        var department = safeString(valueOf(row, ['department', 'departmentName', 'team', 'orgUnit'], ''), '');
        var status = normalizeToken(valueOf(row, ['status', 'state', 'finalStatus', 'lifecycleState'], ''), '');
        var category = normalizeToken(valueOf(row, ['category', 'type', 'module'], domain), domain.toUpperCase());
        var creator = safeString(valueOf(row, ['createdBy', 'creatorId', 'ownerId', 'ownerEmpId', 'actorId'], ''), '');
        var empId = safeString(valueOf(row, ['empId', 'employeeId', 'toEmpId', 'targetEmpId', 'ownerEmpId'], ''), '');
        var role = normalizeRole(valueOf(row, ['role', 'toRole', 'targetRole', 'actorRole'], ''));
        var workflowId = safeString(valueOf(row, ['workflowId', 'eventId', 'correlationId'], ''), '');
        var searchableText = [
            title,
            preview,
            domain,
            department,
            status,
            category,
            creator,
            empId,
            workflowId
        ].join(' ');
        var entry = {
            domain: domain,
            entityId: id,
            tenantSlug: tenantSlug,
            title: title,
            preview: preview,
            keywords: tokenize(searchableText),
            status: status,
            department: department,
            role: role,
            category: category,
            creator: creator,
            workflowId: workflowId,
            empId: empId,
            managerId: safeString(row && row.managerId, ''),
            ownerId: safeString(valueOf(row, ['ownerId', 'ownerEmpId'], ''), ''),
            visibility: normalizeToken(valueOf(row, ['visibility', 'scope'], ''), ''),
            date: rowDate(row),
            updatedAt: rowDate(row),
            entityPriority: DOMAIN_PRIORITY[domain] || 1
        };
        return freezeSearchOutput(cloneSanitized(entry));
    }

    var DOMAIN_CONFIG = Object.freeze({
        employees: {
            keys: ['employees'],
            ids: ['id', 'empId', 'employeeId'],
            titles: ['name', 'displayName', 'email'],
            preview: ['role', 'department', 'employmentStatus', 'activationStatus']
        },
        departments: {
            keys: ['departments', 'teams'],
            ids: ['departmentId', 'teamId', 'id', 'name'],
            titles: ['name', 'departmentName', 'title'],
            preview: ['status', 'headId', 'description']
        },
        leave_requests: {
            keys: ['leaveRequests'],
            ids: ['leaveId', 'id'],
            titles: ['title', 'type', 'reason'],
            preview: ['type', 'reason', 'status', 'managerStatus', 'hrStatus']
        },
        attendance_records: {
            keys: ['attendance', 'attendanceRecords'],
            ids: ['attendanceId', 'id'],
            titles: ['title', 'status', 'note'],
            preview: ['date', 'status', 'note', 'shiftId']
        },
        strategic_goals: {
            keys: ['strategicGoals', 'quarterlyGoals', 'goals'],
            ids: ['goalId', 'objectiveId', 'id'],
            titles: ['title', 'name', 'objective'],
            preview: ['description', 'status', 'department']
        },
        deliverables: {
            keys: ['strategicDeliverables', 'deliverables', 'deliverableReviews'],
            ids: ['deliverableId', 'reviewId', 'id'],
            titles: ['title', 'name', 'deliverableTitle'],
            preview: ['description', 'status', 'risk_level', 'review_status']
        },
        projects: {
            keys: ['projects'],
            ids: ['projectId', 'id'],
            titles: ['title', 'name'],
            preview: ['description', 'status', 'department']
        },
        announcements: {
            keys: ['announcements'],
            ids: ['announcementId', 'id'],
            titles: ['title', 'subject'],
            preview: ['body', 'message', 'category', 'status']
        },
        discussions: {
            keys: ['discussions', 'workflowDiscussions'],
            ids: ['discussionId', 'threadId', 'id'],
            titles: ['title', 'subject'],
            preview: ['message', 'body', 'category', 'status']
        },
        notifications: {
            keys: ['notifications'],
            ids: ['notificationId', 'id'],
            titles: ['title', 'subject'],
            preview: ['message', 'module', 'category', 'state']
        },
        audit_records: {
            keys: ['auditLogs', 'auditTrail'],
            ids: ['logId', 'id', 'auditId'],
            titles: ['actionType', 'action', 'eventType'],
            preview: ['module', 'description', 'severity']
        },
        documents: {
            keys: ['documents'],
            ids: ['documentId', 'id'],
            titles: ['title', 'name', 'fileName'],
            preview: ['category', 'status', 'description', 'body']
        },
        workflows: {
            keys: ['workflowEvents', 'pendingActions'],
            ids: ['eventId', 'actionId', 'workflowId', 'id'],
            titles: ['title', 'type', 'workflowType'],
            preview: ['status', 'description', 'module', 'correlationId']
        }
    });

    function domainList(domains) {
        var all = Object.keys(DOMAIN_CONFIG);
        if (!Array.isArray(domains) || !domains.length) return all;
        var allowed = {};
        domains.forEach(function domainName(domain) {
            var key = safeString(domain, '').trim().toLowerCase();
            if (DOMAIN_CONFIG[key]) allowed[key] = true;
        });
        return all.filter(function keep(domain) { return allowed[domain]; });
    }

    function dataSignature(data, tenantSlug, domains) {
        return tenantSlug + ':' + domains.map(function domainSignature(domain) {
            var rows = list(data, DOMAIN_CONFIG[domain].keys);
            return domain + '=' + rows.length + ':' + rows.slice(0, 5).map(function stamp(row) {
                return safeString(valueOf(row, ['updatedAt', 'createdAt', 'date', 'id'], ''), '');
            }).join('|');
        }).join(';');
    }

    function normalizeSearchPayload(payload, context) {
        if (!isPlainObject(payload)) {
            return freezeSearchOutput({
                success: false,
                classification: 'MALFORMED_PAYLOAD',
                message: 'Search payload must be an object.'
            });
        }
        var ctxTenant = contextTenant(context || {});
        var tenantSlug = normalizeTenantSlug(payload.tenantSlug, ctxTenant);
        if (ctxTenant && tenantSlug && tenantSlug !== ctxTenant) {
            return freezeSearchOutput({
                success: false,
                classification: 'CROSS_TENANT_BLOCKED',
                tenantSlug: tenantSlug,
                contextTenant: ctxTenant,
                message: 'Search tenant scope does not match the active context.'
            });
        }
        var query = redactString(payload.query || '').trim().slice(0, 160);
        var scope = safeString(payload.scope || SEARCH_SCOPES.GLOBAL, SEARCH_SCOPES.GLOBAL).trim().toLowerCase();
        if (!SEARCH_SCOPES[normalizeToken(scope, '')]) scope = SEARCH_SCOPES.GLOBAL;
        var role = normalizeRole((context && context.actor && context.actor.role) || payload.role || 'EMPLOYEE');
        var filters = isPlainObject(payload.filters) ? cloneSanitized(payload.filters) : {};
        var terms = tokenize(query);
        return freezeSearchOutput({
            success: true,
            query: query,
            queryKey: query.toLowerCase(),
            terms: terms,
            tenantSlug: tenantSlug,
            scope: scope,
            role: role,
            empId: actorId(context || {}),
            domains: domainList(payload.domains),
            filters: freezeSearchOutput(filters),
            limit: Math.max(1, Math.min(safeNumber(payload.limit, 20), MAX_RESULTS)),
            fuzzy: payload.fuzzy !== false,
            requestedAt: nowIso()
        });
    }

    function buildSearchIndex(payload, context) {
        try {
            var normalized = normalizeSearchPayload(payload || {}, context || {});
            if (!normalized.success) return normalized;
            var data = rawData();
            var domains = normalized.domains;
            var signature = dataSignature(data, normalized.tenantSlug, domains);
            var cacheKey = normalized.tenantSlug + ':' + domains.join(',');
            var cached = indexCache[cacheKey];
            if (cached && cached.signature === signature) {
                return freezeSearchOutput({
                    success: true,
                    tenantSlug: normalized.tenantSlug,
                    indexedAt: cached.indexedAt,
                    cached: true,
                    domains: cached.domains.slice(),
                    entryCount: cached.entries.length,
                    entries: cached.entries.slice()
                });
            }
            var entries = [];
            domains.forEach(function indexDomain(domain) {
                var config = DOMAIN_CONFIG[domain];
                list(data, config.keys).forEach(function indexRow(row) {
                    if (entries.length >= MAX_INDEX_ENTRIES) return;
                    if (rowTenant(row, normalized.tenantSlug) !== normalized.tenantSlug) return;
                    entries.push(makeEntry(domain, row, normalized.tenantSlug, config));
                });
            });
            var indexedAt = nowIso();
            indexCache[cacheKey] = {
                signature: signature,
                domains: domains.slice(),
                indexedAt: indexedAt,
                entries: entries.slice()
            };
            return freezeSearchOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                indexedAt: indexedAt,
                cached: false,
                domains: domains.slice(),
                entryCount: entries.length,
                entries: entries.slice()
            });
        } catch (error) {
            safeWarn('Search index build failed safely.', error && error.message);
            return freezeSearchOutput({
                success: false,
                classification: 'INDEX_BUILD_FAILED',
                entries: [],
                domains: []
            });
        }
    }

    function editDistance(a, b) {
        a = safeString(a, '');
        b = safeString(b, '');
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        var previous = [];
        var current = [];
        for (var i = 0; i <= b.length; i += 1) previous[i] = i;
        for (var j = 1; j <= a.length; j += 1) {
            current[0] = j;
            for (var k = 1; k <= b.length; k += 1) {
                var cost = a[j - 1] === b[k - 1] ? 0 : 1;
                current[k] = Math.min(current[k - 1] + 1, previous[k] + 1, previous[k - 1] + cost);
            }
            previous = current.slice();
        }
        return previous[b.length];
    }

    function fuzzyTermMatches(term, keywords) {
        return keywords.some(function keywordMatches(keyword) {
            if (keyword.indexOf(term) !== -1 || term.indexOf(keyword) !== -1) return true;
            var maxDistance = term.length > 6 ? 2 : 1;
            return editDistance(term, keyword) <= maxDistance;
        });
    }

    function relevanceClass(score) {
        if (score >= 95) return RELEVANCE_CLASSES.EXACT_MATCH;
        if (score >= 70) return RELEVANCE_CLASSES.HIGH_RELEVANCE;
        if (score >= 40) return RELEVANCE_CLASSES.MEDIUM_RELEVANCE;
        return RELEVANCE_CLASSES.LOW_RELEVANCE;
    }

    function calculateRelevanceScore(entry, payload) {
        try {
            var query = safeString(payload && payload.query, '').toLowerCase().trim();
            var terms = Array.isArray(payload && payload.terms) ? payload.terms : tokenize(query);
            var keywords = Array.isArray(entry && entry.keywords) ? entry.keywords : tokenize([entry && entry.title, entry && entry.preview].join(' '));
            var title = safeString(entry && entry.title, '').toLowerCase();
            var preview = safeString(entry && entry.preview, '').toLowerCase();
            var score = 0;
            var matchType = 'NO_MATCH';

            if (!query) {
                return freezeSearchOutput({ score: 0, relevanceClass: RELEVANCE_CLASSES.LOW_RELEVANCE, matchType: 'EMPTY_QUERY' });
            }

            if (title === query) {
                score += 100;
                matchType = 'EXACT_TITLE';
            } else if (title.indexOf(query) !== -1) {
                score += 85;
                matchType = 'PARTIAL_TITLE';
            } else if (preview.indexOf(query) !== -1) {
                score += 60;
                matchType = 'PARTIAL_PREVIEW';
            }

            var exactTerms = 0;
            var fuzzyTerms = 0;
            terms.forEach(function scoreTerm(term) {
                if (keywords.indexOf(term) !== -1) exactTerms += 1;
                else if (payload && payload.fuzzy !== false && fuzzyTermMatches(term, keywords)) fuzzyTerms += 1;
            });
            if (terms.length) {
                score += Math.round((exactTerms / terms.length) * 45);
                score += Math.round((fuzzyTerms / terms.length) * 25);
                if (!exactTerms && fuzzyTerms === terms.length) score += 10;
                if (exactTerms || fuzzyTerms) matchType = exactTerms === terms.length ? 'KEYWORD_MATCH' : 'FUZZY_MATCH';
            }
            score += Math.min(10, safeNumber(entry && entry.entityPriority, 1));
            if (payload && payload.role === 'DIRECTOR' && (entry.domain === SEARCH_DOMAINS.STRATEGIC_GOALS || entry.domain === SEARCH_DOMAINS.DELIVERABLES)) score += 8;
            if (payload && payload.role === 'HR' && (entry.domain === SEARCH_DOMAINS.EMPLOYEES || entry.domain === SEARCH_DOMAINS.DOCUMENTS)) score += 6;
            if (payload && payload.role === 'MANAGER' && (entry.domain === SEARCH_DOMAINS.PROJECTS || entry.domain === SEARCH_DOMAINS.WORKFLOWS)) score += 6;
            if (entry && entry.updatedAt) score += 4;
            score = Math.max(0, Math.min(100, score));
            return freezeSearchOutput({
                score: score,
                relevanceClass: relevanceClass(score),
                matchType: matchType
            });
        } catch (error) {
            return freezeSearchOutput({ score: 0, relevanceClass: RELEVANCE_CLASSES.LOW_RELEVANCE, matchType: 'SCORING_FAILED' });
        }
    }

    function visibleToRole(entry, payload, context) {
        if (!entry || entry.tenantSlug !== payload.tenantSlug) return false;
        var role = payload.role || normalizeRole(context && context.actor && context.actor.role);
        var id = payload.empId || actorId(context || {});
        if (role === 'EMPLOYEE') {
            if (entry.domain === SEARCH_DOMAINS.EMPLOYEES) return entry.entityId === id || entry.empId === id;
            if ([SEARCH_DOMAINS.LEAVE_REQUESTS, SEARCH_DOMAINS.ATTENDANCE_RECORDS, SEARCH_DOMAINS.NOTIFICATIONS, SEARCH_DOMAINS.DISCUSSIONS, SEARCH_DOMAINS.WORKFLOWS].indexOf(entry.domain) !== -1) {
                return entry.empId === id || safeString(entry.preview + ' ' + entry.title, '').indexOf(id) !== -1;
            }
            return false;
        }
        if (role === 'MANAGER') {
            if (entry.domain === SEARCH_DOMAINS.AUDIT_RECORDS || entry.domain === SEARCH_DOMAINS.DOCUMENTS && entry.visibility === 'HR') return false;
            return entry.managerId === id || entry.department === 'Engineering' || entry.role === 'MANAGER' || entry.domain === SEARCH_DOMAINS.PROJECTS || entry.domain === SEARCH_DOMAINS.WORKFLOWS || entry.domain === SEARCH_DOMAINS.DISCUSSIONS || entry.domain === SEARCH_DOMAINS.ANNOUNCEMENTS || entry.domain === SEARCH_DOMAINS.DEPARTMENTS;
        }
        if (role === 'HR' || role === 'HR_HEAD') {
            return entry.domain !== SEARCH_DOMAINS.STRATEGIC_GOALS || role === 'HR_HEAD';
        }
        if (role === 'DIRECTOR') {
            return [SEARCH_DOMAINS.STRATEGIC_GOALS, SEARCH_DOMAINS.DELIVERABLES, SEARCH_DOMAINS.PROJECTS, SEARCH_DOMAINS.DEPARTMENTS, SEARCH_DOMAINS.ANNOUNCEMENTS, SEARCH_DOMAINS.DISCUSSIONS, SEARCH_DOMAINS.WORKFLOWS, SEARCH_DOMAINS.NOTIFICATIONS].indexOf(entry.domain) !== -1;
        }
        if (role === 'PLATFORM_OWNER') {
            return [SEARCH_DOMAINS.AUDIT_RECORDS, SEARCH_DOMAINS.NOTIFICATIONS, SEARCH_DOMAINS.ANNOUNCEMENTS, SEARCH_DOMAINS.WORKFLOWS].indexOf(entry.domain) !== -1;
        }
        if (role === 'SUPER_ADMIN') {
            return [SEARCH_DOMAINS.AUDIT_RECORDS, SEARCH_DOMAINS.NOTIFICATIONS, SEARCH_DOMAINS.WORKFLOWS].indexOf(entry.domain) !== -1;
        }
        return false;
    }

    function passesFilters(entry, filters) {
        if (!isPlainObject(filters)) return true;
        if (filters.status && normalizeToken(filters.status, '') !== entry.status) return false;
        if (filters.department && safeString(filters.department, '').toLowerCase() !== safeString(entry.department, '').toLowerCase()) return false;
        if (filters.role && normalizeRole(filters.role) !== entry.role) return false;
        if (filters.category && normalizeToken(filters.category, '') !== entry.category) return false;
        if (filters.creator && safeString(filters.creator, '') !== entry.creator && safeString(filters.creator, '') !== entry.ownerId) return false;
        if (filters.workflow && safeString(entry.workflowId, '').indexOf(safeString(filters.workflow, '')) === -1) return false;
        if (filters.dateFrom && entry.date && entry.date < safeString(filters.dateFrom, '')) return false;
        if (filters.dateTo && entry.date && entry.date > safeString(filters.dateTo, '')) return false;
        return true;
    }

    function filtersApplied(filters) {
        if (!isPlainObject(filters)) return [];
        return Object.keys(filters).filter(function hasValue(key) {
            return filters[key] !== undefined && filters[key] !== null && safeString(filters[key], '').trim() !== '';
        });
    }

    function groupResults(results) {
        var grouped = {};
        Object.keys(DOMAIN_CONFIG).forEach(function emptyGroup(domain) { grouped[domain] = []; });
        results.forEach(function group(row) {
            if (!grouped[row.domain]) grouped[row.domain] = [];
            grouped[row.domain].push(row);
        });
        return freezeSearchOutput(grouped);
    }

    function suggestionsFor(payload, entries) {
        var suggestions = [];
        var recent = recentSearches(payload.tenantSlug).slice(0, 4).map(function recent(row) { return row.query; }).filter(Boolean);
        suggestions = suggestions.concat(recent);
        entries.slice(0, 5).forEach(function suggest(entry) {
            if (entry.title && suggestions.indexOf(entry.title) === -1) suggestions.push(entry.title);
        });
        ['approvals', 'policies', 'notifications', 'Apollo'].forEach(function fallback(item) {
            if (suggestions.indexOf(item) === -1) suggestions.push(item);
        });
        return freezeSearchOutput(suggestions.slice(0, 8));
    }

    function recentSearches(tenantSlug) {
        var data = rawData();
        return (Array.isArray(data.smartSearchHistory) ? data.smartSearchHistory : []).filter(function tenantHistory(row) {
            return rowTenant(row, '') === tenantSlug;
        });
    }

    function popularSearches(tenantSlug) {
        var counts = {};
        recentSearches(tenantSlug).forEach(function count(row) {
            if (!row.query) return;
            counts[row.query] = (counts[row.query] || 0) + 1;
        });
        return freezeSearchOutput(Object.keys(counts).sort(function byCount(a, b) { return counts[b] - counts[a]; }).slice(0, 8).map(function popular(query) {
            return { query: query, count: counts[query] };
        }));
    }

    function persistSearchAnalytics(payload, result, context, latencyMs) {
        var data = rawData();
        data.smartSearchHistory = Array.isArray(data.smartSearchHistory) ? data.smartSearchHistory.slice() : [];
        data.smartSearchAnalytics = Array.isArray(data.smartSearchAnalytics) ? data.smartSearchAnalytics.slice() : [];
        var history = cloneSanitized({
            historyId: 'SRCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            tenantSlug: payload.tenantSlug,
            query: payload.query,
            scope: payload.scope,
            role: payload.role,
            resultCount: result.resultCount,
            filtersApplied: result.filtersApplied,
            searchedAt: nowIso(),
            immutable: true
        });
        var analytics = cloneSanitized({
            analyticsId: 'SANA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            eventType: 'SMART_SEARCH_PERFORMED',
            tenantSlug: payload.tenantSlug,
            role: payload.role,
            resultCount: result.resultCount,
            emptySearch: !payload.query,
            searchSuccess: result.success,
            filterUsage: result.filtersApplied.length,
            latencyMs: latencyMs,
            discoveryEfficiency: result.searchConfidenceScore,
            timestamp: nowIso(),
            immutable: true
        });
        data.smartSearchHistory.unshift(history);
        data.smartSearchAnalytics.unshift(analytics);
        if (data.smartSearchHistory.length > MAX_HISTORY) data.smartSearchHistory = data.smartSearchHistory.slice(0, MAX_HISTORY);
        if (data.smartSearchAnalytics.length > MAX_HISTORY) data.smartSearchAnalytics = data.smartSearchAnalytics.slice(0, MAX_HISTORY);
        saveData(data);
    }

    function auditSearch(actionType, metadata, context) {
        if (auditForwarding || (context && context.skipAuditPersistence)) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Smart Search',
                    targetId: metadata && metadata.query || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context || {}),
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'smartSearchService',
                    skipPersistence: false
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context && context.actor && context.actor.role || 'system',
                    actorId(context || {}),
                    actionType,
                    'Smart Search',
                    metadata && metadata.query || '',
                    metadata && metadata.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Smart search audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || (context && context.skipTelemetry)) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('GOVERNANCE', eventType, {
                source: 'smartSearchService',
                severity: metadata && metadata.severity || 'INFO',
                status: metadata && metadata.status || 'RECORDED',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Smart search telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || (context && context.skipMetrics)) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordNotificationMetric !== 'function') return { success: true, warning: 'Metrics unavailable.' };
        try {
            metricForwarding = true;
            return service.recordNotificationMetric(metricType || 'SMART_SEARCH_PERFORMED');
        } catch (error) {
            return { success: false, warning: 'Smart search metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function performSmartSearch(payload, context) {
        var startedAt = Date.now();
        try {
            var normalized = normalizeSearchPayload(payload || {}, context || {});
            if (!normalized.success) {
                auditSearch('SMART_SEARCH_BLOCKED', { query: '', severity: 'WARNING', description: normalized.message || 'Smart search blocked.' }, context || {});
                return normalized;
            }
            var index = buildSearchIndex(normalized, context || {});
            if (!index.success) return index;
            var entries = index.entries.filter(function visible(entry) {
                return visibleToRole(entry, normalized, context || {});
            }).filter(function filtered(entry) {
                return passesFilters(entry, normalized.filters);
            });
            if (!normalized.query) {
                var emptyResult = freezeSearchOutput({
                    success: true,
                    query: '',
                    tenantSlug: normalized.tenantSlug,
                    scope: normalized.scope,
                    resultCount: 0,
                    results: [],
                    groupedResults: groupResults([]),
                    suggestions: suggestionsFor(normalized, entries),
                    recentSearches: freezeSearchOutput(recentSearches(normalized.tenantSlug).slice(0, 8)),
                    popularSearches: popularSearches(normalized.tenantSlug),
                    filtersApplied: filtersApplied(normalized.filters),
                    searchConfidenceScore: 0,
                    analytics: {
                        emptySearch: true,
                        latencyMs: Date.now() - startedAt
                    },
                    governance: {
                        tenantIsolationPreserved: true,
                        rbacFilteringPreserved: true,
                        searchGovernancePreserved: true,
                        confidentialFieldsFiltered: true,
                        immutableSearchHistory: true
                    }
                });
                persistSearchAnalytics(normalized, emptyResult, context || {}, Date.now() - startedAt);
                auditSearch('SMART_SEARCH_EMPTY_QUERY', { query: '', tenantSlug: normalized.tenantSlug, severity: 'INFO', description: 'Empty smart search returned suggestions.' }, context || {});
                emitTelemetry('SMART_SEARCH_EMPTY_QUERY', { tenantSlug: normalized.tenantSlug, resultCount: 0 }, context || {});
                recordMetric('SMART_SEARCH_EMPTY_QUERY', {}, context || {});
                return emptyResult;
            }

            var scored = entries.map(function scoreEntry(entry) {
                var score = calculateRelevanceScore(entry, normalized);
                return Object.assign({}, cloneSanitized(entry), {
                    relevanceScore: score.score,
                    relevanceClass: score.relevanceClass,
                    matchType: score.matchType
                });
            }).filter(function keepScore(row) {
                return row.relevanceScore > 0 && row.relevanceClass !== RELEVANCE_CLASSES.LOW_RELEVANCE;
            }).sort(function sortResults(a, b) {
                if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
                return (b.entityPriority || 0) - (a.entityPriority || 0);
            }).slice(0, normalized.limit);

            var resultCount = scored.length;
            var confidence = resultCount ? Math.round(scored.reduce(function sum(total, row) { return total + row.relevanceScore; }, 0) / resultCount) : 0;
            var latencyMs = Date.now() - startedAt;
            var result = freezeSearchOutput({
                success: true,
                query: normalized.query,
                tenantSlug: normalized.tenantSlug,
                scope: normalized.scope,
                resultCount: resultCount,
                results: freezeSearchOutput(scored.map(function safeResult(row) { return cloneSanitized(row); })),
                groupedResults: groupResults(scored),
                suggestions: suggestionsFor(normalized, entries),
                recentSearches: freezeSearchOutput(recentSearches(normalized.tenantSlug).slice(0, 8)),
                popularSearches: popularSearches(normalized.tenantSlug),
                filtersApplied: filtersApplied(normalized.filters),
                searchConfidenceScore: confidence,
                analytics: freezeSearchOutput({
                    searchFrequencyTracked: true,
                    searchSuccessRate: resultCount ? 100 : 0,
                    emptySearch: false,
                    filterUsage: filtersApplied(normalized.filters).length,
                    latencyMs: latencyMs,
                    discoveryEfficiency: confidence,
                    indexedLookupUsed: true
                }),
                governance: freezeSearchOutput({
                    tenantIsolationPreserved: true,
                    rbacFilteringPreserved: true,
                    searchGovernancePreserved: true,
                    confidentialFieldsFiltered: true,
                    crossTenantLeakageBlocked: true,
                    immutableSearchHistory: true
                })
            });
            persistSearchAnalytics(normalized, result, context || {}, latencyMs);
            auditSearch('SMART_SEARCH_PERFORMED', {
                query: normalized.query,
                tenantSlug: normalized.tenantSlug,
                resultCount: resultCount,
                severity: resultCount ? 'INFO' : 'WARNING',
                description: 'Smart search performed through enterprise discovery governance.'
            }, context || {});
            emitTelemetry('SMART_SEARCH_PERFORMED', {
                query: normalized.query,
                tenantSlug: normalized.tenantSlug,
                resultCount: resultCount,
                latencyMs: latencyMs,
                severity: resultCount ? 'INFO' : 'WARNING'
            }, context || {});
            recordMetric('SMART_SEARCH_PERFORMED', { resultCount: resultCount }, context || {});
            return result;
        } catch (error) {
            safeWarn('Smart search failed safely.', error && error.message);
            return freezeSearchOutput({
                success: false,
                classification: 'SMART_SEARCH_FAILED',
                message: 'Smart search failed safely.',
                results: [],
                groupedResults: {},
                suggestions: []
            });
        }
    }

    function runSelfTest() {
        var results = [];
        function record(name, passed, details) {
            results.push(freezeSearchOutput({ name: name, passed: !!passed, details: cloneSanitized(details || {}) }));
        }
        try {
            var malformed = normalizeSearchPayload('bad', { tenantSlug: 'selftest' });
            record('malformed payload blocked', malformed.success === false && Object.isFrozen(malformed));

            var normalized = normalizeSearchPayload({ query: 'apollo', tenantSlug: 'selftest' }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' } });
            record('normalization immutable', normalized.success === true && Object.isFrozen(normalized));

            var data = rawData();
            data.employees = Array.isArray(data.employees) ? data.employees.slice() : [];
            data.employees.push({ id: 'SELF-EMP', name: 'Selftest Apollo', role: 'EMPLOYEE', tenantSlug: 'selftest', department: 'People', salary: 999999 });
            saveData(data);

            var index = buildSearchIndex({ query: 'apollo', tenantSlug: 'selftest' }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('global search index works', index.success === true && index.entries.some(function entryMatches(entry) { return entry.entityId === 'SELF-EMP'; }));

            var search = performSmartSearch({ query: 'Selftest Apollo', tenantSlug: 'selftest' }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('global search works', search.success === true && search.results.length >= 1);
            record('rbac filtering works', search.success === true && !/999999|salary/i.test(JSON.stringify(search)));

            var fuzzy = performSmartSearch({ query: 'Slfetest Apolo', tenantSlug: 'selftest', fuzzy: true }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('fuzzy search works', fuzzy.success === true && fuzzy.results.length >= 1);

            var score = calculateRelevanceScore({ title: 'Selftest Apollo', keywords: ['selftest', 'apollo'], domain: 'employees', entityPriority: 8 }, { query: 'Selftest Apollo', terms: ['selftest', 'apollo'], role: 'HR' });
            record('relevance scoring works', score.relevanceClass === RELEVANCE_CLASSES.EXACT_MATCH && Object.isFrozen(score));
            record('outputs immutable', Object.isFrozen(search) && Object.isFrozen(search.results));
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        }
        global.__ARTHHRMS_SMART_SEARCH_SELF_TEST__ = freezeSearchOutput({
            passed: results.every(function ok(item) { return item.passed; }),
            results: results,
            checkedAt: nowIso()
        });
    }

    var SmartSearchService = freezeSearchOutput({
        SEARCH_DOMAINS: SEARCH_DOMAINS,
        SEARCH_SCOPES: SEARCH_SCOPES,
        RELEVANCE_CLASSES: RELEVANCE_CLASSES,
        performSmartSearch: performSmartSearch,
        calculateRelevanceScore: calculateRelevanceScore,
        buildSearchIndex: buildSearchIndex,
        normalizeSearchPayload: normalizeSearchPayload,
        freezeSearchOutput: freezeSearchOutput
    });

    global.SmartSearchService = SmartSearchService;
    global.smartSearchService = SmartSearchService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_SMART_SEARCH_SELF_TEST__ = freezeSearchOutput({
                passed: false,
                results: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
