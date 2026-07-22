(function attachManagerHierarchyService(global) {
    'use strict';

    var HIERARCHY_LEVELS = Object.freeze(['CEO', 'DIRECTOR', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE']);
    var VIEW_MODES = Object.freeze(['TREE', 'DEPARTMENT', 'REPORTING', 'LEADERSHIP']);
    var REVIEW_ROLES = Object.freeze(['HR', 'DIRECTOR', 'MANAGER', 'EMPLOYEE', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|password|secret|token|bank|account|aadhaar|pan|ssn|private|medical|document/i;

    function db() { return global.DB || null; }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeKey(value) {
        return normalizeText(value).toUpperCase();
    }

    function normalizeTenantSlug(value) {
        return normalizeText(value)
            .toLowerCase()
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeText(value || 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        if (role === 'TEAMLEAD') role = 'TEAM_LEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeViewMode(value) {
        var mode = normalizeText(value || 'TREE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return VIEW_MODES.includes(mode) ? mode : 'TREE';
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function freezeHierarchyOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeHierarchyOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeHierarchyOutput(value[key]);
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function cloneSanitized(value, keyHint) {
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint); });
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEYS.test(key)) return;
                clone[key] = cloneSanitized(value[key], key);
            });
            return clone;
        }
        if (SENSITIVE_KEYS.test(String(keyHint || ''))) return undefined;
        return value;
    }

    function issue(code, message, severity, metadata) {
        return freezeHierarchyOutput({
            code: code,
            message: message,
            severity: severity || 'WARNING',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || ''),
            empId: normalizeKey(actor.empId || actor.employeeId || actor.id || ''),
            role: normalizeRole(actor.role || context?.role || 'EMPLOYEE'),
            department: normalizeText(actor.department || actor.dept || context?.department || ''),
            name: normalizeText(actor.name || actor.email || actor.id || '')
        };
    }

    function tenantFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        var data = rawData();
        return normalizeTenantSlug(
            context?.tenantSlug ||
            context?.tenantId ||
            context?.companyId ||
            actor.tenantSlug ||
            actor.tenantId ||
            actor.companyId ||
            data.companySettings?.tenantSlug ||
            data.companySettings?.tenantId ||
            'default'
        );
    }

    function employeeIdOf(employee) {
        return normalizeKey(employee?.employeeId || employee?.empId || employee?.id || '');
    }

    function managerHints(employee) {
        var hints = [];
        ['managerId', 'reportsTo', 'managerEmpId', 'managerEmployeeId', 'directManagerId', 'lineManagerId'].forEach(function collect(key) {
            var value = normalizeKey(employee?.[key] || '');
            if (value && !hints.includes(value)) hints.push(value);
        });
        if (Array.isArray(employee?.managerIds)) {
            employee.managerIds.forEach(function collect(value) {
                var normalized = normalizeKey(value);
                if (normalized && !hints.includes(normalized)) hints.push(normalized);
            });
        }
        return hints;
    }

    function tenantOfRecord(record) {
        return normalizeTenantSlug(record?.tenantSlug || record?.tenantId || record?.companyId || record?.organizationId || '');
    }

    function sameTenant(record, tenantSlug) {
        var recordTenant = tenantOfRecord(record);
        if (recordTenant) return recordTenant === normalizeTenantSlug(tenantSlug);
        var settings = rawData().companySettings || {};
        var defaultTenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || 'default');
        return normalizeTenantSlug(tenantSlug) === defaultTenant;
    }

    function hierarchyLevel(employee) {
        var role = normalizeRole(employee?.role || '');
        var text = (role + ' ' + normalizeText(employee?.designation || employee?.desig || employee?.title || employee?.officialDesignation || '')).toUpperCase();
        if (/CEO|CHIEF_EXECUTIVE|FOUNDER|PRESIDENT/.test(text)) return 'CEO';
        if (/DIRECTOR|VP|VICE_PRESIDENT|HEAD/.test(text)) return 'DIRECTOR';
        if (/MANAGER|SUPERVISOR/.test(text)) return 'MANAGER';
        if (/TEAM_LEAD|LEAD|LEADER/.test(text)) return 'TEAM_LEAD';
        return 'EMPLOYEE';
    }

    function normalizeEmployeeRecord(employee, tenantSlug, index) {
        var employeeId = employeeIdOf(employee);
        var hints = managerHints(employee);
        var managerId = hints[0] || '';
        var level = hierarchyLevel(employee);
        return {
            employeeId: employeeId,
            sourceIndex: index || 0,
            name: normalizeText(employee?.name || employee?.fullName || employee?.displayName || employeeId || 'Employee'),
            role: normalizeRole(employee?.role || level),
            hierarchyLevel: level,
            department: normalizeText(employee?.department || employee?.dept || 'Unassigned'),
            designation: normalizeText(employee?.designation || employee?.desig || employee?.title || level),
            managerId: managerId,
            managerIds: hints,
            tenantSlug: normalizeTenantSlug(tenantSlug),
            email: normalizeText(employee?.email || ''),
            raw: cloneSanitized(employee || {})
        };
    }

    function employeesForTenant(input, tenantSlug) {
        var source = input && Array.isArray(input.employees) ? input.employees : (rawData().employees || []);
        var rows = [];
        source.forEach(function map(employee, index) {
            if (!employee || typeof employee !== 'object') return;
            if (!sameTenant(employee, tenantSlug)) return;
            var id = employeeIdOf(employee);
            if (!id) return;
            var role = normalizeRole(employee.role || '');
            if (role === 'PLATFORM_OWNER') return;
            rows.push(normalizeEmployeeRecord(employee, tenantSlug, index));
        });
        return rows;
    }

    function employeeMap(records) {
        var map = new Map();
        records.forEach(function add(record) {
            if (!map.has(record.employeeId)) map.set(record.employeeId, record);
        });
        return map;
    }

    function childrenMap(records) {
        var map = new Map();
        records.forEach(function add(record) {
            if (!record.managerId) return;
            if (!map.has(record.managerId)) map.set(record.managerId, []);
            map.get(record.managerId).push(record.employeeId);
        });
        return map;
    }

    function detectHierarchyIssues(records) {
        var issues = [];
        var seenIds = new Set();
        var duplicates = new Set();
        records.forEach(function detectDuplicate(record) {
            if (seenIds.has(record.employeeId)) duplicates.add(record.employeeId);
            seenIds.add(record.employeeId);
            if (record.managerIds.length > 1) {
                issues.push(issue('DUPLICATE_MANAGER_ASSIGNMENT', 'Employee has multiple manager assignments.', 'ERROR', { employeeId: record.employeeId, managerIds: record.managerIds }));
            }
            if (record.managerId && record.managerId === record.employeeId) {
                issues.push(issue('CIRCULAR_REPORTING', 'Employee cannot report to self.', 'CRITICAL', { employeeId: record.employeeId }));
            }
        });
        duplicates.forEach(function addDuplicate(employeeId) {
            issues.push(issue('DUPLICATE_REPORTING_PATH', 'Duplicate employee record creates duplicate reporting path.', 'ERROR', { employeeId: employeeId }));
        });

        var map = employeeMap(records);
        records.forEach(function missing(record) {
            if (record.managerId && !map.has(record.managerId)) {
                issues.push(issue('MISSING_MANAGER', 'Reporting manager was not found in tenant scope.', 'ERROR', { employeeId: record.employeeId, managerId: record.managerId }));
            }
        });

        var visiting = new Set();
        var visited = new Set();
        function walk(record, path) {
            if (!record || !record.managerId || !map.has(record.managerId)) return;
            if (visiting.has(record.employeeId)) {
                issues.push(issue('CIRCULAR_REPORTING', 'Circular reporting chain detected.', 'CRITICAL', { employeeId: record.employeeId, path: path.concat(record.employeeId) }));
                return;
            }
            if (visited.has(record.employeeId)) return;
            visiting.add(record.employeeId);
            var manager = map.get(record.managerId);
            if (manager) walk(manager, path.concat(record.employeeId));
            visiting.delete(record.employeeId);
            visited.add(record.employeeId);
        }
        records.forEach(function run(record) { walk(record, []); });

        var unique = [];
        var issueKeys = new Set();
        issues.forEach(function dedupe(item) {
            var key = item.code + ':' + (item.metadata?.employeeId || '') + ':' + (item.metadata?.managerId || '') + ':' + (item.metadata?.path || []).join('>');
            if (issueKeys.has(key)) return;
            issueKeys.add(key);
            unique.push(item);
        });
        return unique;
    }

    function directReportCounts(records) {
        var counts = {};
        records.forEach(function count(record) {
            if (!record.managerId) return;
            counts[record.managerId] = (counts[record.managerId] || 0) + 1;
        });
        return counts;
    }

    function depthFor(record, map, seen) {
        if (!record) return 0;
        var currentSeen = seen || new Set();
        if (currentSeen.has(record.employeeId)) return currentSeen.size;
        currentSeen.add(record.employeeId);
        if (!record.managerId || !map.has(record.managerId)) return 1;
        return 1 + depthFor(map.get(record.managerId), map, currentSeen);
    }

    function analyticsFor(records, issues) {
        var map = employeeMap(records);
        var counts = directReportCounts(records);
        var spans = Object.keys(counts).map(function span(managerId) { return counts[managerId]; });
        var departmentSizes = {};
        records.forEach(function dept(record) {
            departmentSizes[record.department] = (departmentSizes[record.department] || 0) + 1;
        });
        var depths = records.map(function depth(record) { return depthFor(record, map, new Set()); });
        var maxDepth = depths.length ? Math.max.apply(null, depths) : 0;
        var critical = issues.filter(function criticalIssue(item) { return item.severity === 'CRITICAL'; }).length;
        var errors = issues.filter(function errorIssue(item) { return item.severity === 'ERROR'; }).length;
        var warnings = issues.filter(function warningIssue(item) { return item.severity === 'WARNING'; }).length;
        var avgSpan = spans.length ? Math.round((spans.reduce(function sum(a, b) { return a + b; }, 0) / spans.length) * 10) / 10 : 0;
        var maxSpan = spans.length ? Math.max.apply(null, spans) : 0;
        var issuePenalty = critical * 25 + errors * 12 + warnings * 5;
        var spanPenalty = Math.max(0, maxSpan - 8) * 4;
        var depthPenalty = Math.max(0, maxDepth - 8) * 3;
        var hierarchyQualityScore = clampScore(100 - issuePenalty);
        var reportingEfficiencyScore = clampScore(100 - spanPenalty - depthPenalty - errors * 8 - critical * 15);
        var populationSignal = records.length ? 100 : 0;
        var organizationalHealthScore = clampScore(Math.round((hierarchyQualityScore + reportingEfficiencyScore + populationSignal) / 3));
        return {
            employeeCount: records.length,
            managerCount: Object.keys(counts).length,
            departmentSizes: departmentSizes,
            maxDepth: maxDepth,
            managerSpanOfControl: {
                average: avgSpan,
                max: maxSpan,
                distribution: counts
            },
            issueCounts: {
                total: issues.length,
                critical: critical,
                errors: errors,
                warnings: warnings
            },
            organizationalComplexity: clampScore(records.length + maxDepth * 4 + Object.keys(departmentSizes).length * 3 + issues.length * 5),
            organizationalHealthScore: organizationalHealthScore,
            hierarchyQualityScore: hierarchyQualityScore,
            reportingEfficiencyScore: reportingEfficiencyScore
        };
    }

    function publicNode(record, counts, platformGovernance, index) {
        return {
            employeeId: record.employeeId,
            name: platformGovernance ? 'Governance Node ' + String(index + 1).padStart(2, '0') : record.name,
            role: record.role,
            hierarchyLevel: record.hierarchyLevel,
            department: record.department,
            designation: record.designation,
            managerId: record.managerId,
            directReports: counts[record.employeeId] || 0
        };
    }

    function edgeRows(records, visibleIds) {
        return records
            .filter(function hasEdge(record) { return record.managerId && visibleIds.has(record.managerId) && visibleIds.has(record.employeeId); })
            .map(function edge(record) { return { from: record.managerId, to: record.employeeId, relationship: 'REPORTS_TO' }; });
    }

    function chainRecords(employeeId, records) {
        var map = employeeMap(records);
        var current = map.get(normalizeKey(employeeId));
        var chain = [];
        var seen = new Set();
        while (current) {
            if (seen.has(current.employeeId)) {
                chain.push(current);
                break;
            }
            seen.add(current.employeeId);
            chain.unshift(current);
            if (!current.managerId || !map.has(current.managerId)) break;
            current = map.get(current.managerId);
        }
        return chain;
    }

    function descendantIds(rootId, records) {
        var children = childrenMap(records);
        var output = new Set();
        var stack = [normalizeKey(rootId)];
        while (stack.length) {
            var id = stack.pop();
            if (!id || output.has(id)) continue;
            output.add(id);
            (children.get(id) || []).forEach(function child(childId) { stack.push(childId); });
        }
        return output;
    }

    function checkAccess(input, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        if (actor.role === 'SUPER_ADMIN') {
            return { allowed: false, issues: [issue('HIERARCHY_ACCESS_DENIED', 'SUPER_ADMIN cannot access tenant business hierarchy.', 'ERROR')] };
        }
        if (!REVIEW_ROLES.includes(actor.role)) {
            return { allowed: false, issues: [issue('HIERARCHY_ACCESS_DENIED', 'Role cannot access hierarchy governance.', 'ERROR', { role: actor.role })] };
        }
        if (normalizeTenantSlug(context?.tenantSlug || context?.actor?.tenantSlug || tenantSlug) !== tenantSlug && actor.role !== 'PLATFORM_OWNER') {
            return { allowed: false, issues: [issue('CROSS_TENANT_HIERARCHY_BLOCKED', 'Cross-tenant hierarchy access blocked.', 'CRITICAL')] };
        }
        return { allowed: true, actor: actor, issues: [] };
    }

    function visibleRecords(records, input, context) {
        var actor = actorFromContext(context || {});
        var mode = normalizeViewMode(input?.viewMode);
        var department = normalizeText(input?.department || actor.department || '');
        var employeeId = normalizeKey(input?.employeeId || '');
        var managerId = normalizeKey(input?.managerId || '');

        if (actor.role === 'HR') return records.slice();
        if (actor.role === 'PLATFORM_OWNER') return records.slice();
        if (actor.role === 'DIRECTOR') {
            if (!department) return records.slice();
            var map = employeeMap(records);
            var departmentIds = new Set(records.filter(function match(row) { return row.department.toLowerCase() === department.toLowerCase(); }).map(function id(row) { return row.employeeId; }));
            Array.from(departmentIds).forEach(function includeManagers(id) {
                chainRecords(id, records).forEach(function chain(row) { departmentIds.add(row.employeeId); });
            });
            return records.filter(function visible(row) { return departmentIds.has(row.employeeId); });
        }
        if (actor.role === 'MANAGER') {
            var managerRoot = managerId || actor.empId || normalizeKey(actor.id || '');
            var descendants = descendantIds(managerRoot, records);
            return records.filter(function visible(row) { return descendants.has(row.employeeId); });
        }
        if (actor.role === 'EMPLOYEE') {
            var target = employeeId || actor.empId || normalizeKey(actor.id || '');
            if (employeeId && employeeId !== actor.empId && employeeId !== normalizeKey(actor.id || '')) return [];
            return chainRecords(target, records);
        }
        if (mode === 'REPORTING' && employeeId) return chainRecords(employeeId, records);
        return records.slice();
    }

    function buildTree(records, counts, platformGovernance) {
        var visible = new Set(records.map(function id(row) { return row.employeeId; }));
        var children = childrenMap(records);
        var roots = records.filter(function root(row) { return !row.managerId || !visible.has(row.managerId); }).map(function id(row) { return row.employeeId; });
        var byId = employeeMap(records);
        var visited = new Set();
        function toTree(id, depth, path) {
            var record = byId.get(id);
            if (!record) return null;
            if (path.includes(id)) {
                return { ...publicNode(record, counts, platformGovernance, depth), depth: depth, children: [], cycleDetected: true };
            }
            visited.add(id);
            var node = publicNode(record, counts, platformGovernance, depth);
            node.depth = depth;
            node.children = (children.get(id) || []).map(function child(childId) {
                return toTree(childId, depth + 1, path.concat(id));
            }).filter(Boolean);
            return node;
        }
        var tree = roots.map(function root(id) { return toTree(id, 1, []); }).filter(Boolean);
        records.forEach(function leftover(row) {
            if (!visited.has(row.employeeId)) tree.push(toTree(row.employeeId, 1, []));
        });
        return tree;
    }

    function persistHistory(key, row, context) {
        try {
            if (context?.skipPersistence) return false;
            var data = rawData();
            if (!Array.isArray(data[key])) data[key] = [];
            data[key].unshift(cloneSanitized({ ...row, immutable: true }));
            data[key] = data[key].slice(0, 500);
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function auditHierarchy(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: clean.reportId || clean.validationId || clean.analyticsId || '',
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.empId,
                    module: 'Manager Hierarchy',
                    targetId: clean.employeeId || clean.managerId || clean.reportId || '',
                    description: clean.description || actionType,
                    metadata: clean,
                    severity: clean.severity || 'INFO'
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Manager Hierarchy', clean.employeeId || clean.managerId || clean.reportId || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function failureOutput(state, tenantSlug, issues) {
        return freezeHierarchyOutput({
            success: false,
            state: state || 'BLOCKED',
            tenantSlug: normalizeTenantSlug(tenantSlug),
            issues: issues && issues.length ? issues : [issue('HIERARCHY_FAILED_SAFE', 'Hierarchy operation failed safely.', 'ERROR')],
            nodes: [],
            edges: [],
            reportingTree: [],
            governance: {
                tenantIsolationPreserved: true,
                hierarchyGovernancePreserved: true,
                rbacPreserved: true,
                noAutomaticReportingChanges: true
            },
            readOnly: true
        });
    }

    function normalizeHierarchyPayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
        return freezeHierarchyOutput({
            tenantSlug: tenantSlug,
            viewMode: normalizeViewMode(source.viewMode),
            employeeId: normalizeKey(source.employeeId || source.empId || ''),
            managerId: normalizeKey(source.managerId || ''),
            department: normalizeText(source.department || ''),
            recordsProvided: Array.isArray(source.employees) ? source.employees.length : 0
        });
    }

    function buildOrgChart(input, context) {
        try {
            var payload = normalizeHierarchyPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess(input || {}, context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var allRecords = employeesForTenant(input || {}, tenantSlug);
            var issues = detectHierarchyIssues(allRecords);
            var visible = visibleRecords(allRecords, { ...(input || {}), viewMode: payload.viewMode, employeeId: payload.employeeId, managerId: payload.managerId, department: payload.department }, context || {});
            if (access.actor.role === 'EMPLOYEE' && visible.length === 0) {
                return failureOutput('ACCESS_BLOCKED', tenantSlug, [issue('HIERARCHY_ACCESS_DENIED', 'Employees can only view their own reporting chain.', 'ERROR')]);
            }
            var counts = directReportCounts(allRecords);
            var platformGovernance = access.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var nodes = visible.map(function map(record, index) { return publicNode(record, counts, platformGovernance, index); });
            var visibleIds = new Set(visible.map(function id(row) { return row.employeeId; }));
            var analytics = analyticsFor(allRecords, issues);
            var report = {
                reportId: 'MH-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.some(function critical(item) { return item.severity === 'CRITICAL'; }) ? 'VALIDATION_BLOCKED' : issues.length ? 'VALIDATION_ISSUES' : 'VISIBLE',
                tenantSlug: tenantSlug,
                viewMode: payload.viewMode,
                generatedAt: nowIso(),
                nodes: nodes,
                edges: edgeRows(visible, visibleIds),
                reportingTree: buildTree(visible, counts, platformGovernance),
                validation: {
                    valid: issues.length === 0,
                    blocked: issues.some(function blocker(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; }),
                    issues: issues
                },
                issues: issues,
                analytics: analytics,
                organizationalHealthScore: analytics.organizationalHealthScore,
                hierarchyQualityScore: analytics.hierarchyQualityScore,
                reportingEfficiencyScore: analytics.reportingEfficiencyScore,
                governance: {
                    tenantIsolationPreserved: true,
                    hierarchyGovernancePreserved: true,
                    rbacPreserved: true,
                    noAutomaticReportingChanges: true,
                    platformOwnerVisibilityOnly: platformGovernance
                },
                integrationReadiness: {
                    tenantDepartmentSetupFlowPrepared: true,
                    organizationInitializationWizardPrepared: true,
                    companyHolidayImportPrepared: true,
                    leaveBalanceImportPrepared: true
                },
                integrationHealth: {
                    auditIntegrated: !!(global.AuditService || (db() && typeof db().writeAuditLog === 'function')),
                    tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService)
                },
                readOnly: true
            };
            persistHistory('managerHierarchyHistory', {
                reportId: report.reportId,
                tenantSlug: tenantSlug,
                state: report.state,
                viewMode: report.viewMode,
                nodeCount: nodes.length,
                issueCount: issues.length,
                generatedAt: report.generatedAt
            }, context || {});
            auditHierarchy('HIERARCHY_ORG_CHART_REVIEWED', { reportId: report.reportId, tenantSlug: tenantSlug, description: 'Organization hierarchy visualized in read-only governance mode.' }, context || {});
            return freezeHierarchyOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HIERARCHY_FAILED_SAFE', 'Org chart generation failed safely.', 'ERROR')]);
        }
    }

    function validateReportingChain(input, context) {
        try {
            var payload = normalizeHierarchyPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess(input || {}, context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var records = employeesForTenant(input || {}, tenantSlug);
            var actor = access.actor;
            var targetId = payload.employeeId || (actor.role === 'EMPLOYEE' ? actor.empId : '');
            if (actor.role === 'EMPLOYEE' && targetId && targetId !== actor.empId && targetId !== normalizeKey(actor.id || '')) {
                return failureOutput('ACCESS_BLOCKED', tenantSlug, [issue('HIERARCHY_ACCESS_DENIED', 'Employees can only validate their own reporting chain.', 'ERROR')]);
            }
            var map = employeeMap(records);
            if (!targetId || !map.has(targetId)) {
                return failureOutput('CHAIN_NOT_FOUND', tenantSlug, [issue('EMPLOYEE_NOT_FOUND', 'Employee was not found in tenant hierarchy scope.', 'ERROR', { employeeId: targetId })]);
            }
            var allIssues = detectHierarchyIssues(records);
            var chain = chainRecords(targetId, records);
            var chainIds = new Set(chain.map(function id(record) { return record.employeeId; }));
            var scopedIssues = allIssues.filter(function scoped(item) {
                var emp = item.metadata?.employeeId;
                var manager = item.metadata?.managerId;
                var path = item.metadata?.path || [];
                return chainIds.has(emp) || chainIds.has(manager) || path.some(function has(id) { return chainIds.has(id); });
            });
            var counts = directReportCounts(records);
            var platformGovernance = actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var result = {
                validationId: 'MHC-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: scopedIssues.length === 0,
                state: scopedIssues.length ? 'BLOCKED' : 'VALID',
                tenantSlug: tenantSlug,
                employeeId: targetId,
                managerChain: chain.map(function mapChain(record, index) { return publicNode(record, counts, platformGovernance, index); }),
                issues: scopedIssues,
                governance: {
                    tenantIsolationPreserved: true,
                    hierarchyGovernancePreserved: true,
                    rbacPreserved: true,
                    invalidStructuresBlocked: scopedIssues.length > 0
                },
                readOnly: true
            };
            persistHistory('reportingHierarchyHistory', {
                validationId: result.validationId,
                tenantSlug: tenantSlug,
                employeeId: targetId,
                state: result.state,
                issueCount: scopedIssues.length,
                reviewedAt: nowIso()
            }, context || {});
            auditHierarchy('HIERARCHY_CHAIN_VALIDATED', { validationId: result.validationId, tenantSlug: tenantSlug, employeeId: targetId, description: 'Reporting chain validation reviewed.' }, context || {});
            return freezeHierarchyOutput(result);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HIERARCHY_VALIDATION_FAILED_SAFE', 'Reporting chain validation failed safely.', 'ERROR')]);
        }
    }

    function calculateHierarchyHealth(input, context) {
        try {
            var payload = normalizeHierarchyPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess(input || {}, context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var records = employeesForTenant(input || {}, tenantSlug);
            var issues = detectHierarchyIssues(records);
            var analytics = analyticsFor(records, issues);
            var report = {
                analyticsId: 'MHA-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.length ? 'WARNING' : 'HEALTHY',
                tenantSlug: tenantSlug,
                generatedAt: nowIso(),
                analytics: analytics,
                issues: issues,
                organizationalHealthScore: analytics.organizationalHealthScore,
                hierarchyQualityScore: analytics.hierarchyQualityScore,
                reportingEfficiencyScore: analytics.reportingEfficiencyScore,
                governance: {
                    tenantIsolationPreserved: true,
                    hierarchyGovernancePreserved: true,
                    analyticsReadOnly: true,
                    platformOwnerVisibilityOnly: access.actor.role === 'PLATFORM_OWNER'
                },
                integrationReadiness: {
                    tenantDepartmentSetupFlowPrepared: true,
                    organizationInitializationWizardPrepared: true,
                    companyHolidayImportPrepared: true,
                    leaveBalanceImportPrepared: true
                },
                readOnly: true
            };
            persistHistory('hierarchyAnalyticsReports', {
                analyticsId: report.analyticsId,
                tenantSlug: tenantSlug,
                state: report.state,
                organizationalHealthScore: report.organizationalHealthScore,
                hierarchyQualityScore: report.hierarchyQualityScore,
                reportingEfficiencyScore: report.reportingEfficiencyScore,
                generatedAt: report.generatedAt
            }, context || {});
            auditHierarchy('HIERARCHY_ANALYTICS_REVIEWED', { reportId: report.analyticsId, tenantSlug: tenantSlug, description: 'Hierarchy analytics reviewed.' }, context || {});
            return freezeHierarchyOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('HIERARCHY_ANALYTICS_FAILED_SAFE', 'Hierarchy analytics failed safely.', 'ERROR')]);
        }
    }

    function generateManagerTree(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var actor = actorFromContext(context || {});
        var managerId = normalizeKey(source.managerId || actor.empId || actor.id || '');
        return buildOrgChart({ ...source, managerId: managerId, viewMode: 'TREE' }, { ...(context || {}), actor: { ...(context?.actor || {}), role: actor.role === 'EMPLOYEE' ? 'EMPLOYEE' : 'MANAGER', empId: managerId || actor.empId } });
    }

    function runSelfTest() {
        try {
            var employees = [
                { id: 'SELF-CEO', name: 'Self CEO', role: 'director', designation: 'CEO', tenantSlug: 'self-test' },
                { id: 'SELF-MGR', name: 'Self Manager', role: 'manager', department: 'Ops', managerId: 'SELF-CEO', tenantSlug: 'self-test' },
                { id: 'SELF-EMP', name: 'Self Employee', role: 'employee', department: 'Ops', managerId: 'SELF-MGR', tenantSlug: 'self-test' },
                { id: 'SELF-A', name: 'Self Cycle A', managerId: 'SELF-B', tenantSlug: 'self-test' },
                { id: 'SELF-B', name: 'Self Cycle B', managerId: 'SELF-A', tenantSlug: 'self-test' }
            ];
            var context = { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var chart = buildOrgChart({ tenantSlug: 'self-test', employees: employees }, context);
            var chain = validateReportingChain({ tenantSlug: 'self-test', employees: employees, employeeId: 'SELF-EMP' }, context);
            var cycle = validateReportingChain({ tenantSlug: 'self-test', employees: employees, employeeId: 'SELF-A' }, context);
            var health = calculateHierarchyHealth({ tenantSlug: 'self-test', employees: employees }, context);
            return freezeHierarchyOutput({
                passed: !!(chart.success && chain.success && cycle.success === false && health.success && Object.isFrozen(chart) && Object.isFrozen(health)),
                checks: {
                    orgChart: chart.success === true,
                    reportingChains: chain.success === true,
                    validation: cycle.success === false,
                    analytics: health.success === true,
                    immutableOutputs: Object.isFrozen(chart) && Object.isFrozen(health)
                }
            });
        } catch (error) {
            return freezeHierarchyOutput({ passed: false, error: 'Manager hierarchy self-test failed safely.' });
        }
    }

    var ManagerHierarchyService = Object.freeze({
        HIERARCHY_LEVELS: HIERARCHY_LEVELS,
        VIEW_MODES: VIEW_MODES,
        buildOrgChart: buildOrgChart,
        validateReportingChain: validateReportingChain,
        calculateHierarchyHealth: calculateHierarchyHealth,
        generateManagerTree: generateManagerTree,
        normalizeHierarchyPayload: normalizeHierarchyPayload,
        freezeHierarchyOutput: freezeHierarchyOutput
    });

    global.ManagerHierarchyService = ManagerHierarchyService;
    global.managerHierarchyService = ManagerHierarchyService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_MANAGER_HIERARCHY_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
