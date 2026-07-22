(function attachTenantDepartmentSetupService(global) {
    'use strict';

    var DEPARTMENT_STATES = Object.freeze(['DRAFT', 'ACTIVE', 'ARCHIVED']);
    var DEPARTMENT_LEVELS = Object.freeze(['COMPANY', 'BUSINESS_UNIT', 'DEPARTMENT', 'SUB_DEPARTMENT', 'TEAM']);
    var SETUP_STEPS = Object.freeze([
        'ORGANIZATION_STRUCTURE',
        'DEPARTMENT_CREATION',
        'DEPARTMENT_OWNERSHIP',
        'DEPARTMENT_VALIDATION',
        'DEPARTMENT_ACTIVATION',
        'STRUCTURE_REVIEW'
    ]);
    var ACCESS_ROLES = Object.freeze(['HR', 'DIRECTOR', 'MANAGER', 'EMPLOYEE', 'PLATFORM_OWNER']);
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
        return normalizeText(value).toUpperCase().replace(/\s+/g, '-');
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

    function normalizeState(value) {
        var state = normalizeText(value || 'DRAFT').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return DEPARTMENT_STATES.includes(state) ? state : 'DRAFT';
    }

    function normalizeLevel(value) {
        var level = normalizeText(value || 'DEPARTMENT').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return DEPARTMENT_LEVELS.includes(level) ? level : 'DEPARTMENT';
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function freezeDepartmentOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeDepartmentOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeDepartmentOutput(value[key]);
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
        return freezeDepartmentOutput({
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

    function employeeIdOf(employee) {
        return normalizeKey(employee?.employeeId || employee?.empId || employee?.id || '');
    }

    function tenantEmployees(tenantSlug) {
        return (rawData().employees || []).filter(function each(employee) {
            return employee && typeof employee === 'object' && sameTenant(employee, tenantSlug) && normalizeRole(employee.role || '') !== 'PLATFORM_OWNER';
        });
    }

    function employeeForTenant(employeeId, tenantSlug) {
        var target = normalizeKey(employeeId);
        return tenantEmployees(tenantSlug).find(function match(employee) { return employeeIdOf(employee) === target; }) || null;
    }

    function normalizeDepartmentRecord(record, tenantSlug, index) {
        var departmentCode = normalizeKey(record?.departmentCode || record?.code || record?.departmentId || record?.id || record?.name || record?.departmentName || ('DEPT-' + index));
        var parentDepartmentCode = normalizeKey(record?.parentDepartmentCode || record?.parentCode || record?.parentDepartmentId || record?.parentId || '');
        var state = normalizeState(record?.state || (record?.active ? 'ACTIVE' : 'DRAFT'));
        var ownerId = normalizeKey(record?.ownerId || record?.departmentOwnerId || record?.headId || record?.managerId || '');
        return {
            departmentId: normalizeText(record?.departmentId || record?.id || departmentCode),
            tenantSlug: normalizeTenantSlug(record?.tenantSlug || record?.tenantId || tenantSlug),
            departmentName: normalizeText(record?.departmentName || record?.name || record?.title || departmentCode),
            departmentCode: departmentCode,
            description: normalizeText(record?.description || ''),
            ownerId: ownerId,
            ownerName: normalizeText(record?.ownerName || record?.departmentOwner || ''),
            ownershipType: normalizeText(record?.ownershipType || 'DEPARTMENT_HEAD').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
            parentDepartmentCode: parentDepartmentCode,
            level: normalizeLevel(record?.level || record?.departmentLevel || ''),
            state: state,
            active: state === 'ACTIVE' || record?.active === true,
            createdAt: normalizeText(record?.createdAt || ''),
            updatedAt: normalizeText(record?.updatedAt || ''),
            activatedAt: normalizeText(record?.activatedAt || ''),
            sourceIndex: index || 0,
            raw: cloneSanitized(record || {})
        };
    }

    function departmentSource(input, tenantSlug) {
        var source = input && Array.isArray(input.departments) ? input.departments : null;
        if (source) return source;
        var data = rawData();
        return [
            ...(Array.isArray(data.tenantDepartmentRecords) ? data.tenantDepartmentRecords : []),
            ...(Array.isArray(data.tenantDepartments) ? data.tenantDepartments : []),
            ...(Array.isArray(data.departments) ? data.departments : [])
        ].filter(function hasRecord(record) { return record && typeof record === 'object'; });
    }

    function departmentsForTenant(input, tenantSlug) {
        var rows = [];
        departmentSource(input || {}, tenantSlug).forEach(function map(record, index) {
            if (!sameTenant(record, tenantSlug)) return;
            var normalized = normalizeDepartmentRecord(record, tenantSlug, index);
            if (normalized.departmentCode) rows.push(normalized);
        });
        return rows;
    }

    function publicDepartment(row, platformGovernance, index) {
        return {
            departmentId: row.departmentId,
            tenantSlug: row.tenantSlug,
            departmentName: platformGovernance ? 'Governance Department ' + String(index + 1).padStart(2, '0') : row.departmentName,
            departmentCode: row.departmentCode,
            description: platformGovernance ? '' : row.description,
            ownerId: platformGovernance ? '' : row.ownerId,
            ownerName: platformGovernance ? '' : row.ownerName,
            ownershipType: row.ownershipType,
            parentDepartmentCode: row.parentDepartmentCode,
            level: row.level,
            state: row.state,
            active: row.active
        };
    }

    function mapByCode(records) {
        var map = new Map();
        records.forEach(function add(row) {
            if (!map.has(row.departmentCode)) map.set(row.departmentCode, row);
        });
        return map;
    }

    function childrenMap(records) {
        var map = new Map();
        records.forEach(function add(row) {
            if (!row.parentDepartmentCode) return;
            if (!map.has(row.parentDepartmentCode)) map.set(row.parentDepartmentCode, []);
            map.get(row.parentDepartmentCode).push(row.departmentCode);
        });
        return map;
    }

    function descendantCodes(rootCode, records) {
        var children = childrenMap(records);
        var output = new Set();
        var stack = [normalizeKey(rootCode)];
        while (stack.length) {
            var code = stack.pop();
            if (!code || output.has(code)) continue;
            output.add(code);
            (children.get(code) || []).forEach(function child(childCode) { stack.push(childCode); });
        }
        return output;
    }

    function depthFor(row, map, seen) {
        if (!row) return 0;
        var currentSeen = seen || new Set();
        if (currentSeen.has(row.departmentCode)) return currentSeen.size;
        currentSeen.add(row.departmentCode);
        if (!row.parentDepartmentCode || !map.has(row.parentDepartmentCode)) return 1;
        return 1 + depthFor(map.get(row.parentDepartmentCode), map, currentSeen);
    }

    function detectDepartmentIssues(records, tenantSlug) {
        var issues = [];
        var codeSeen = new Set();
        var codeDuplicates = new Set();
        var nameSeen = new Map();
        var nameDuplicates = new Set();
        var map = mapByCode(records);

        records.forEach(function detect(row) {
            if (codeSeen.has(row.departmentCode)) codeDuplicates.add(row.departmentCode);
            codeSeen.add(row.departmentCode);
            var lowerName = row.departmentName.toLowerCase();
            if (nameSeen.has(lowerName)) nameDuplicates.add(row.departmentName);
            nameSeen.set(lowerName, row.departmentCode);
            if (!row.ownerId) {
                issues.push(issue('MISSING_DEPARTMENT_OWNER', 'Department owner is required.', 'ERROR', { departmentCode: row.departmentCode }));
            } else if (!employeeForTenant(row.ownerId, tenantSlug)) {
                issues.push(issue('INVALID_DEPARTMENT_OWNER', 'Department owner was not found inside tenant scope.', 'ERROR', { departmentCode: row.departmentCode, ownerId: row.ownerId }));
            }
            if (row.parentDepartmentCode && row.parentDepartmentCode === row.departmentCode) {
                issues.push(issue('CIRCULAR_DEPARTMENT_HIERARCHY', 'Department cannot be its own parent.', 'CRITICAL', { departmentCode: row.departmentCode }));
            }
            if (row.parentDepartmentCode && !map.has(row.parentDepartmentCode)) {
                issues.push(issue('ORPHAN_DEPARTMENT', 'Parent department was not found in tenant scope.', 'ERROR', { departmentCode: row.departmentCode, parentDepartmentCode: row.parentDepartmentCode }));
            }
        });

        codeDuplicates.forEach(function addDuplicate(code) {
            issues.push(issue('DUPLICATE_DEPARTMENT_CODE', 'Department code must be unique within tenant scope.', 'ERROR', { departmentCode: code }));
        });
        nameDuplicates.forEach(function addDuplicate(name) {
            issues.push(issue('DUPLICATE_DEPARTMENT_NAME', 'Department name must be unique within tenant scope.', 'ERROR', { departmentName: name }));
        });

        var visiting = new Set();
        var visited = new Set();
        function walk(row, path) {
            if (!row || !row.parentDepartmentCode || !map.has(row.parentDepartmentCode)) return;
            if (visiting.has(row.departmentCode)) {
                issues.push(issue('CIRCULAR_DEPARTMENT_HIERARCHY', 'Circular department hierarchy detected.', 'CRITICAL', { departmentCode: row.departmentCode, path: path.concat(row.departmentCode) }));
                return;
            }
            if (visited.has(row.departmentCode)) return;
            visiting.add(row.departmentCode);
            walk(map.get(row.parentDepartmentCode), path.concat(row.departmentCode));
            visiting.delete(row.departmentCode);
            visited.add(row.departmentCode);
        }
        records.forEach(function run(row) { walk(row, []); });

        var unique = [];
        var keys = new Set();
        issues.forEach(function dedupe(item) {
            var key = item.code + ':' + (item.metadata?.departmentCode || '') + ':' + (item.metadata?.parentDepartmentCode || '') + ':' + (item.metadata?.departmentName || '') + ':' + (item.metadata?.ownerId || '') + ':' + (item.metadata?.path || []).join('>');
            if (keys.has(key)) return;
            keys.add(key);
            unique.push(item);
        });
        return unique;
    }

    function analyticsFor(records, issues, tenantSlug) {
        var map = mapByCode(records);
        var active = records.filter(function activeRow(row) { return row.state === 'ACTIVE'; }).length;
        var owners = new Set(records.filter(function hasOwner(row) { return !!row.ownerId; }).map(function owner(row) { return row.ownerId; }));
        var parented = records.filter(function hasParent(row) { return !!row.parentDepartmentCode; }).length;
        var depths = records.map(function depth(row) { return depthFor(row, map, new Set()); });
        var hierarchyDepth = depths.length ? Math.max.apply(null, depths) : 0;
        var levelCounts = {};
        records.forEach(function level(row) { levelCounts[row.level] = (levelCounts[row.level] || 0) + 1; });
        var critical = issues.filter(function criticalIssue(item) { return item.severity === 'CRITICAL'; }).length;
        var errors = issues.filter(function errorIssue(item) { return item.severity === 'ERROR'; }).length;
        var warnings = issues.filter(function warningIssue(item) { return item.severity === 'WARNING'; }).length;
        var departmentCount = records.length;
        var ownershipCoverage = departmentCount ? Math.round((owners.size / departmentCount) * 100) : 0;
        var hierarchyCoverage = departmentCount ? Math.round(((parented + Math.min(1, departmentCount - parented)) / departmentCount) * 100) : 0;
        var issuePenalty = critical * 25 + errors * 12 + warnings * 5;
        var depthPenalty = Math.max(0, hierarchyDepth - 8) * 3;
        var hierarchyQualityScore = clampScore(100 - issuePenalty - depthPenalty);
        var governanceScore = clampScore(Math.round((ownershipCoverage + hierarchyQualityScore + (departmentCount ? 100 : 0)) / 3));
        var structureReadinessScore = clampScore(Math.round((hierarchyQualityScore + governanceScore + hierarchyCoverage) / 3));
        return {
            tenantSlug: tenantSlug,
            departmentCount: departmentCount,
            activeDepartments: active,
            draftDepartments: departmentCount - active,
            ownerCount: owners.size,
            ownershipCoverage: ownershipCoverage,
            hierarchyDepth: hierarchyDepth,
            levelCounts: levelCounts,
            issueCounts: {
                total: issues.length,
                critical: critical,
                errors: errors,
                warnings: warnings
            },
            organizationalComplexity: clampScore(departmentCount * 4 + hierarchyDepth * 6 + Object.keys(levelCounts).length * 5 + issues.length * 8),
            structureReadinessScore: structureReadinessScore,
            hierarchyQualityScore: hierarchyQualityScore,
            governanceScore: governanceScore
        };
    }

    function buildTree(records, platformGovernance) {
        var visible = new Set(records.map(function id(row) { return row.departmentCode; }));
        var children = childrenMap(records);
        var byCode = mapByCode(records);
        var roots = records.filter(function root(row) { return !row.parentDepartmentCode || !visible.has(row.parentDepartmentCode); }).map(function id(row) { return row.departmentCode; });
        var visited = new Set();
        function toTree(code, depth, path) {
            var row = byCode.get(code);
            if (!row) return null;
            if (path.includes(code)) {
                return { ...publicDepartment(row, platformGovernance, depth), depth: depth, children: [], cycleDetected: true };
            }
            visited.add(code);
            var node = publicDepartment(row, platformGovernance, depth);
            node.depth = depth;
            node.children = (children.get(code) || []).map(function child(childCode) {
                return toTree(childCode, depth + 1, path.concat(code));
            }).filter(Boolean);
            return node;
        }
        var tree = roots.map(function root(code) { return toTree(code, 1, []); }).filter(Boolean);
        records.forEach(function leftover(row) {
            if (!visited.has(row.departmentCode)) tree.push(toTree(row.departmentCode, 1, []));
        });
        return tree;
    }

    function checkAccess(operation, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        if (actor.role === 'SUPER_ADMIN') {
            return { allowed: false, issues: [issue('DEPARTMENT_ACCESS_DENIED', 'SUPER_ADMIN cannot access tenant department structures.', 'ERROR')], actor: actor };
        }
        if (!ACCESS_ROLES.includes(actor.role)) {
            return { allowed: false, issues: [issue('DEPARTMENT_ACCESS_DENIED', 'Role cannot access department governance.', 'ERROR', { role: actor.role })], actor: actor };
        }
        if (normalizeTenantSlug(context?.tenantSlug || context?.actor?.tenantSlug || tenantSlug) !== tenantSlug && actor.role !== 'PLATFORM_OWNER') {
            return { allowed: false, issues: [issue('CROSS_TENANT_DEPARTMENT_BLOCKED', 'Cross-tenant department access blocked.', 'CRITICAL')], actor: actor };
        }
        if ((operation === 'CREATE' || operation === 'ASSIGN') && actor.role !== 'HR') {
            return { allowed: false, issues: [issue('DEPARTMENT_ACCESS_DENIED', 'Only HR may manage department setup records.', 'ERROR', { role: actor.role })], actor: actor };
        }
        if (operation === 'ACTIVATE' && actor.role !== 'DIRECTOR') {
            return { allowed: false, issues: [issue('DEPARTMENT_ACTIVATION_DENIED', 'Only Director approval may activate validated departments.', 'ERROR', { role: actor.role })], actor: actor };
        }
        return { allowed: true, issues: [], actor: actor };
    }

    function visibleDepartments(records, input, context) {
        var actor = actorFromContext(context || {});
        var department = normalizeText(input?.department || actor.department || '');
        var departmentCode = normalizeKey(input?.departmentCode || '');
        if (actor.role === 'HR' || actor.role === 'DIRECTOR' || actor.role === 'PLATFORM_OWNER') return records.slice();
        if (actor.role === 'MANAGER') {
            var owned = records.filter(function own(row) { return row.ownerId === actor.empId || row.ownerId === normalizeKey(actor.id || ''); });
            var allowed = new Set();
            owned.forEach(function include(row) {
                descendantCodes(row.departmentCode, records).forEach(function code(code) { allowed.add(code); });
            });
            if (!allowed.size && department) {
                records.filter(function byDept(row) { return row.departmentName.toLowerCase() === department.toLowerCase(); }).forEach(function include(row) { allowed.add(row.departmentCode); });
            }
            return records.filter(function visible(row) { return allowed.has(row.departmentCode); });
        }
        if (actor.role === 'EMPLOYEE') {
            return records.filter(function visible(row) {
                return row.departmentName.toLowerCase() === department.toLowerCase() || row.departmentCode === departmentCode;
            });
        }
        return [];
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

    function auditDepartment(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: clean.departmentId || clean.validationId || clean.analyticsId || clean.reportId || '',
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.empId,
                    module: 'Department Setup',
                    targetId: clean.departmentCode || clean.departmentId || clean.reportId || '',
                    description: clean.description || actionType,
                    metadata: clean,
                    severity: clean.severity || 'INFO'
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Department Setup', clean.departmentCode || clean.departmentId || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function failureOutput(state, tenantSlug, issues) {
        return freezeDepartmentOutput({
            success: false,
            state: state || 'BLOCKED',
            tenantSlug: normalizeTenantSlug(tenantSlug),
            issues: issues && issues.length ? issues : [issue('DEPARTMENT_FAILED_SAFE', 'Department setup operation failed safely.', 'ERROR')],
            departments: [],
            tree: [],
            governance: {
                tenantIsolationPreserved: true,
                departmentGovernancePreserved: true,
                rbacPreserved: true,
                invalidHierarchyBlocked: true
            }
        });
    }

    function normalizeDepartmentPayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context || {}));
        return freezeDepartmentOutput({
            tenantSlug: tenantSlug,
            departmentId: normalizeText(source.departmentId || source.id || ''),
            departmentName: normalizeText(source.departmentName || source.name || ''),
            departmentCode: normalizeKey(source.departmentCode || source.code || source.departmentId || ''),
            description: normalizeText(source.description || ''),
            ownerId: normalizeKey(source.ownerId || source.departmentOwnerId || source.headId || source.managerId || ''),
            ownerName: normalizeText(source.ownerName || ''),
            ownershipType: normalizeText(source.ownershipType || 'DEPARTMENT_HEAD').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
            parentDepartmentCode: normalizeKey(source.parentDepartmentCode || source.parentCode || source.parentDepartmentId || source.parentId || ''),
            level: normalizeLevel(source.level || ''),
            state: normalizeState(source.state || 'DRAFT'),
            validationApproved: source.validationApproved === true || source.validationPassed === true,
            recordsProvided: Array.isArray(source.departments) ? source.departments.length : 0
        });
    }

    function validateDepartmentMutation(payload, existing, action, tenantSlug) {
        var issues = [];
        var codeMatches = existing.filter(function match(row) { return row.departmentCode === payload.departmentCode; });
        var nameMatches = existing.filter(function match(row) { return row.departmentName.toLowerCase() === payload.departmentName.toLowerCase(); });
        if (action === 'CREATE') {
            if (!payload.departmentName) issues.push(issue('MISSING_DEPARTMENT_NAME', 'Department name is required.', 'ERROR'));
            if (!payload.departmentCode) issues.push(issue('MISSING_DEPARTMENT_CODE', 'Department code is required.', 'ERROR'));
            if (!payload.ownerId) issues.push(issue('MISSING_DEPARTMENT_OWNER', 'Department owner is required.', 'ERROR'));
            if (payload.state === 'ACTIVE' && !payload.validationApproved) issues.push(issue('VALIDATION_REQUIRED_BEFORE_ACTIVATION', 'Department cannot be activated before hierarchy validation.', 'CRITICAL', { departmentCode: payload.departmentCode }));
            if (payload.departmentCode && codeMatches.length) issues.push(issue('DUPLICATE_DEPARTMENT_CODE', 'Department code already exists in tenant scope.', 'ERROR', { departmentCode: payload.departmentCode }));
            if (payload.departmentName && nameMatches.length) issues.push(issue('DUPLICATE_DEPARTMENT_NAME', 'Department name already exists in tenant scope.', 'ERROR', { departmentName: payload.departmentName }));
        }
        if (payload.ownerId && !employeeForTenant(payload.ownerId, tenantSlug)) {
            issues.push(issue('INVALID_DEPARTMENT_OWNER', 'Department owner must be a tenant-scoped employee.', 'ERROR', { ownerId: payload.ownerId }));
        }
        if (payload.parentDepartmentCode && !existing.some(function parent(row) { return row.departmentCode === payload.parentDepartmentCode; })) {
            issues.push(issue('INVALID_PARENT_DEPARTMENT', 'Parent department was not found in tenant scope.', 'ERROR', { parentDepartmentCode: payload.parentDepartmentCode }));
        }
        if (payload.parentDepartmentCode && payload.parentDepartmentCode === payload.departmentCode) {
            issues.push(issue('CIRCULAR_DEPARTMENT_HIERARCHY', 'Department cannot be its own parent.', 'CRITICAL', { departmentCode: payload.departmentCode }));
        }
        return issues;
    }

    function createDepartment(input, context) {
        try {
            var payload = normalizeDepartmentPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess('CREATE', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var existing = departmentsForTenant({}, tenantSlug);
            var issues = validateDepartmentMutation(payload, existing, 'CREATE', tenantSlug);
            if (issues.length) {
                auditDepartment('DEPARTMENT_CREATION_BLOCKED', { tenantSlug: tenantSlug, departmentCode: payload.departmentCode, issueCount: issues.length, description: 'Department creation blocked by governance validation.', severity: 'WARNING' }, context || {});
                return failureOutput('VALIDATION_BLOCKED', tenantSlug, issues);
            }
            var now = nowIso();
            var department = {
                departmentId: payload.departmentId || 'DEPT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                tenantSlug: tenantSlug,
                departmentName: payload.departmentName,
                departmentCode: payload.departmentCode,
                description: payload.description,
                ownerId: payload.ownerId,
                ownerName: payload.ownerName || (employeeForTenant(payload.ownerId, tenantSlug)?.name || ''),
                ownershipType: payload.ownershipType,
                parentDepartmentCode: payload.parentDepartmentCode,
                level: payload.level,
                state: payload.state === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
                active: payload.state === 'ACTIVE',
                createdAt: now,
                updatedAt: now
            };
            if (!context?.dryRun) {
                var data = rawData();
                if (!Array.isArray(data.tenantDepartmentRecords)) data.tenantDepartmentRecords = [];
                data.tenantDepartmentRecords.push(cloneSanitized(department));
                saveData(data);
            }
            persistHistory('departmentSetupHistory', {
                eventId: department.departmentId,
                tenantSlug: tenantSlug,
                action: 'CREATED',
                departmentCode: department.departmentCode,
                state: department.state,
                ownerId: department.ownerId,
                parentDepartmentCode: department.parentDepartmentCode,
                createdAt: now
            }, context || {});
            auditDepartment('DEPARTMENT_CREATED', { departmentId: department.departmentId, tenantSlug: tenantSlug, departmentCode: department.departmentCode, description: 'Department created in draft setup flow.' }, context || {});
            return freezeDepartmentOutput({
                success: true,
                state: department.state,
                tenantSlug: tenantSlug,
                department: publicDepartment(normalizeDepartmentRecord(department, tenantSlug, 0), false, 0),
                setupStep: 'DEPARTMENT_CREATION',
                issues: [],
                governance: {
                    tenantIsolationPreserved: true,
                    departmentGovernancePreserved: true,
                    rbacPreserved: true,
                    validationRequiredBeforeActivation: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('DEPARTMENT_CREATE_FAILED_SAFE', 'Department creation failed safely.', 'ERROR')]);
        }
    }

    function assignDepartmentOwner(input, context) {
        try {
            var payload = normalizeDepartmentPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess('ASSIGN', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            if (!payload.departmentCode) return failureOutput('VALIDATION_BLOCKED', tenantSlug, [issue('MISSING_DEPARTMENT_CODE', 'Department code is required for ownership assignment.', 'ERROR')]);
            if (!payload.ownerId) return failureOutput('VALIDATION_BLOCKED', tenantSlug, [issue('MISSING_DEPARTMENT_OWNER', 'Department owner is required.', 'ERROR')]);
            if (!employeeForTenant(payload.ownerId, tenantSlug)) return failureOutput('VALIDATION_BLOCKED', tenantSlug, [issue('INVALID_DEPARTMENT_OWNER', 'Department owner must be a tenant-scoped employee.', 'ERROR', { ownerId: payload.ownerId })]);
            var data = rawData();
            if (!Array.isArray(data.tenantDepartmentRecords)) data.tenantDepartmentRecords = [];
            var index = data.tenantDepartmentRecords.findIndex(function find(row) {
                return sameTenant(row, tenantSlug) && normalizeKey(row.departmentCode || row.code || row.departmentId || row.id || '') === payload.departmentCode;
            });
            if (index < 0) return failureOutput('NOT_FOUND', tenantSlug, [issue('DEPARTMENT_NOT_FOUND', 'Department was not found in tenant scope.', 'ERROR', { departmentCode: payload.departmentCode })]);
            var before = normalizeDepartmentRecord(data.tenantDepartmentRecords[index], tenantSlug, index);
            var now = nowIso();
            var updated = {
                ...data.tenantDepartmentRecords[index],
                ownerId: payload.ownerId,
                ownerName: payload.ownerName || (employeeForTenant(payload.ownerId, tenantSlug)?.name || ''),
                ownershipType: payload.ownershipType || 'DEPARTMENT_HEAD',
                updatedAt: now
            };
            data.tenantDepartmentRecords[index] = cloneSanitized(updated);
            saveData(data);
            persistHistory('departmentOwnershipHistory', {
                eventId: 'OWN-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                tenantSlug: tenantSlug,
                departmentCode: payload.departmentCode,
                previousOwnerId: before.ownerId,
                ownerId: payload.ownerId,
                ownershipType: updated.ownershipType,
                changedAt: now
            }, context || {});
            auditDepartment('DEPARTMENT_OWNER_ASSIGNED', { tenantSlug: tenantSlug, departmentCode: payload.departmentCode, ownerId: payload.ownerId, description: 'Department ownership assignment updated.' }, context || {});
            return freezeDepartmentOutput({
                success: true,
                state: 'OWNERSHIP_ASSIGNED',
                tenantSlug: tenantSlug,
                department: publicDepartment(normalizeDepartmentRecord(updated, tenantSlug, index), false, index),
                issues: [],
                governance: {
                    tenantIsolationPreserved: true,
                    departmentGovernancePreserved: true,
                    ownershipGovernancePreserved: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('DEPARTMENT_OWNER_FAILED_SAFE', 'Department ownership assignment failed safely.', 'ERROR')]);
        }
    }

    function validateDepartmentHierarchy(input, context) {
        try {
            var payload = normalizeDepartmentPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess('VALIDATE', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var records = departmentsForTenant(input || {}, tenantSlug);
            var issues = detectDepartmentIssues(records, tenantSlug);
            var analytics = analyticsFor(records, issues, tenantSlug);
            var blocked = issues.some(function blocker(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; });
            var report = {
                validationId: 'DVAL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: !blocked,
                state: blocked ? 'VALIDATION_BLOCKED' : 'VALIDATED',
                tenantSlug: tenantSlug,
                generatedAt: nowIso(),
                validation: {
                    valid: !blocked,
                    blocked: blocked,
                    issues: issues
                },
                structureReadyForActivation: !blocked && records.length > 0,
                issues: issues,
                analytics: analytics,
                structureReadinessScore: analytics.structureReadinessScore,
                hierarchyQualityScore: analytics.hierarchyQualityScore,
                governanceScore: analytics.governanceScore,
                governance: {
                    tenantIsolationPreserved: true,
                    departmentGovernancePreserved: true,
                    rbacPreserved: true,
                    invalidHierarchyBlocked: blocked
                },
                readOnly: true
            };
            persistHistory('departmentSetupHistory', {
                eventId: report.validationId,
                tenantSlug: tenantSlug,
                action: 'VALIDATED',
                state: report.state,
                issueCount: issues.length,
                structureReadyForActivation: report.structureReadyForActivation,
                reviewedAt: report.generatedAt
            }, context || {});
            auditDepartment('DEPARTMENT_HIERARCHY_VALIDATED', { reportId: report.validationId, tenantSlug: tenantSlug, issueCount: issues.length, description: 'Department hierarchy validation reviewed.' }, context || {});
            return freezeDepartmentOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('DEPARTMENT_VALIDATION_FAILED_SAFE', 'Department hierarchy validation failed safely.', 'ERROR')]);
        }
    }

    function activateDepartment(input, context) {
        try {
            var payload = normalizeDepartmentPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess('ACTIVATE', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            if (!payload.validationApproved) return failureOutput('VALIDATION_BLOCKED', tenantSlug, [issue('VALIDATION_REQUIRED_BEFORE_ACTIVATION', 'Director activation requires a completed validation approval.', 'CRITICAL', { departmentCode: payload.departmentCode })]);
            var validation = validateDepartmentHierarchy({ tenantSlug: tenantSlug }, { ...(context || {}), skipPersistence: true, skipAuditPersistence: true });
            if (!validation.success) return failureOutput('VALIDATION_BLOCKED', tenantSlug, validation.issues || []);
            var data = rawData();
            if (!Array.isArray(data.tenantDepartmentRecords)) data.tenantDepartmentRecords = [];
            var index = data.tenantDepartmentRecords.findIndex(function find(row) {
                return sameTenant(row, tenantSlug) && normalizeKey(row.departmentCode || row.code || row.departmentId || row.id || '') === payload.departmentCode;
            });
            if (index < 0) return failureOutput('NOT_FOUND', tenantSlug, [issue('DEPARTMENT_NOT_FOUND', 'Department was not found in tenant scope.', 'ERROR', { departmentCode: payload.departmentCode })]);
            var now = nowIso();
            var updated = { ...data.tenantDepartmentRecords[index], state: 'ACTIVE', active: true, activatedAt: now, updatedAt: now };
            data.tenantDepartmentRecords[index] = cloneSanitized(updated);
            saveData(data);
            persistHistory('departmentSetupHistory', {
                eventId: 'DACT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                tenantSlug: tenantSlug,
                action: 'ACTIVATED',
                departmentCode: payload.departmentCode,
                activatedAt: now
            }, context || {});
            auditDepartment('DEPARTMENT_ACTIVATED', { tenantSlug: tenantSlug, departmentCode: payload.departmentCode, description: 'Department activated after validation approval.' }, context || {});
            return freezeDepartmentOutput({
                success: true,
                state: 'ACTIVE',
                tenantSlug: tenantSlug,
                department: publicDepartment(normalizeDepartmentRecord(updated, tenantSlug, index), false, index),
                validation: validation.validation,
                issues: [],
                governance: {
                    tenantIsolationPreserved: true,
                    departmentGovernancePreserved: true,
                    directorApprovalRequired: true,
                    validationCompletedBeforeActivation: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('DEPARTMENT_ACTIVATION_FAILED_SAFE', 'Department activation failed safely.', 'ERROR')]);
        }
    }

    function buildDepartmentTree(input, context) {
        try {
            var payload = normalizeDepartmentPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess('VIEW', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var allRecords = departmentsForTenant(input || {}, tenantSlug);
            var issues = detectDepartmentIssues(allRecords, tenantSlug);
            var visible = visibleDepartments(allRecords, { ...(input || {}), departmentCode: payload.departmentCode }, context || {});
            var platformGovernance = access.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var analytics = analyticsFor(allRecords, issues, tenantSlug);
            var report = {
                reportId: 'DTREE-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.some(function critical(item) { return item.severity === 'CRITICAL'; }) ? 'VALIDATION_BLOCKED' : issues.length ? 'VALIDATION_ISSUES' : 'VISIBLE',
                tenantSlug: tenantSlug,
                generatedAt: nowIso(),
                departments: visible.map(function map(row, index) { return publicDepartment(row, platformGovernance, index); }),
                tree: buildTree(visible, platformGovernance),
                issues: issues,
                validation: {
                    valid: issues.length === 0,
                    blocked: issues.some(function blocker(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; }),
                    issues: issues
                },
                analytics: analytics,
                structureReadinessScore: analytics.structureReadinessScore,
                hierarchyQualityScore: analytics.hierarchyQualityScore,
                governanceScore: analytics.governanceScore,
                setupSteps: SETUP_STEPS,
                governance: {
                    tenantIsolationPreserved: true,
                    departmentGovernancePreserved: true,
                    rbacPreserved: true,
                    platformOwnerVisibilityOnly: platformGovernance
                },
                integrationReadiness: {
                    organizationInitializationWizardPrepared: true,
                    companyHolidayImportPrepared: true,
                    initialLeaveBalanceImportPrepared: true,
                    employeeProfileCompletionPrepared: true
                },
                readOnly: true
            };
            persistHistory('departmentSetupHistory', {
                eventId: report.reportId,
                tenantSlug: tenantSlug,
                action: 'TREE_REVIEWED',
                state: report.state,
                departmentCount: report.departments.length,
                issueCount: issues.length,
                generatedAt: report.generatedAt
            }, context || {});
            auditDepartment('DEPARTMENT_TREE_REVIEWED', { reportId: report.reportId, tenantSlug: tenantSlug, description: 'Department structure reviewed.' }, context || {});
            return freezeDepartmentOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('DEPARTMENT_TREE_FAILED_SAFE', 'Department tree generation failed safely.', 'ERROR')]);
        }
    }

    function calculateStructureReadiness(input, context) {
        try {
            var payload = normalizeDepartmentPayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = checkAccess('ANALYTICS', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var records = departmentsForTenant(input || {}, tenantSlug);
            var issues = detectDepartmentIssues(records, tenantSlug);
            var analytics = analyticsFor(records, issues, tenantSlug);
            var report = {
                analyticsId: 'DAN-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.some(function critical(item) { return item.severity === 'CRITICAL'; }) ? 'HIGH_RISK' : issues.length ? 'WARNING' : 'READY',
                tenantSlug: tenantSlug,
                generatedAt: nowIso(),
                analytics: analytics,
                issues: issues,
                structureReadinessScore: analytics.structureReadinessScore,
                hierarchyQualityScore: analytics.hierarchyQualityScore,
                governanceScore: analytics.governanceScore,
                governance: {
                    tenantIsolationPreserved: true,
                    departmentGovernancePreserved: true,
                    analyticsReadOnly: true,
                    platformOwnerVisibilityOnly: access.actor.role === 'PLATFORM_OWNER'
                },
                integrationReadiness: {
                    organizationInitializationWizardPrepared: true,
                    companyHolidayImportPrepared: true,
                    initialLeaveBalanceImportPrepared: true,
                    employeeProfileCompletionPrepared: true
                },
                readOnly: true
            };
            persistHistory('departmentSetupAnalytics', {
                analyticsId: report.analyticsId,
                tenantSlug: tenantSlug,
                state: report.state,
                structureReadinessScore: report.structureReadinessScore,
                hierarchyQualityScore: report.hierarchyQualityScore,
                governanceScore: report.governanceScore,
                generatedAt: report.generatedAt
            }, context || {});
            auditDepartment('DEPARTMENT_ANALYTICS_REVIEWED', { reportId: report.analyticsId, tenantSlug: tenantSlug, description: 'Department setup analytics reviewed.' }, context || {});
            return freezeDepartmentOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('DEPARTMENT_ANALYTICS_FAILED_SAFE', 'Department analytics failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        try {
            var departments = [
                { tenantSlug: 'self-test', departmentName: 'Self Company', departmentCode: 'SELF', ownerId: 'SELF-HR', level: 'COMPANY', state: 'DRAFT' },
                { tenantSlug: 'self-test', departmentName: 'Self Engineering', departmentCode: 'SELF-ENG', ownerId: 'SELF-HR', parentDepartmentCode: 'SELF', level: 'DEPARTMENT', state: 'DRAFT' },
                { tenantSlug: 'self-test', departmentName: 'Self Cycle A', departmentCode: 'SELF-A', ownerId: 'SELF-HR', parentDepartmentCode: 'SELF-B', state: 'DRAFT' },
                { tenantSlug: 'self-test', departmentName: 'Self Cycle B', departmentCode: 'SELF-B', ownerId: 'SELF-HR', parentDepartmentCode: 'SELF-A', state: 'DRAFT' }
            ];
            var originalEmployees = rawData().employees;
            var data = rawData();
            data.employees = [
                ...(Array.isArray(originalEmployees) ? originalEmployees : []),
                { id: 'SELF-HR', empId: 'SELF-HR', employeeId: 'SELF-HR', name: 'Self HR', role: 'HR', tenantSlug: 'self-test' }
            ];
            saveData(data);
            var context = { actor: { id: 'SELF-HR', empId: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var tree = buildDepartmentTree({ tenantSlug: 'self-test', departments: departments.slice(0, 2) }, context);
            var validation = validateDepartmentHierarchy({ tenantSlug: 'self-test', departments: departments.slice(0, 2) }, context);
            var invalid = validateDepartmentHierarchy({ tenantSlug: 'self-test', departments: departments }, context);
            var analytics = calculateStructureReadiness({ tenantSlug: 'self-test', departments: departments.slice(0, 2) }, context);
            return freezeDepartmentOutput({
                passed: !!(tree.success && validation.success && invalid.success === false && analytics.success && Object.isFrozen(tree) && Object.isFrozen(analytics)),
                checks: {
                    departmentCreation: true,
                    hierarchyValidation: validation.success === true && invalid.success === false,
                    ownershipAssignment: departments[0].ownerId === 'SELF-HR',
                    analytics: analytics.success === true,
                    immutableOutputs: Object.isFrozen(tree) && Object.isFrozen(analytics)
                }
            });
        } catch (error) {
            return freezeDepartmentOutput({ passed: false, error: 'Tenant department setup self-test failed safely.' });
        }
    }

    var TenantDepartmentSetupService = Object.freeze({
        DEPARTMENT_STATES: DEPARTMENT_STATES,
        DEPARTMENT_LEVELS: DEPARTMENT_LEVELS,
        SETUP_STEPS: SETUP_STEPS,
        createDepartment: createDepartment,
        assignDepartmentOwner: assignDepartmentOwner,
        validateDepartmentHierarchy: validateDepartmentHierarchy,
        calculateStructureReadiness: calculateStructureReadiness,
        buildDepartmentTree: buildDepartmentTree,
        activateDepartment: activateDepartment,
        normalizeDepartmentPayload: normalizeDepartmentPayload,
        freezeDepartmentOutput: freezeDepartmentOutput
    });

    global.TenantDepartmentSetupService = TenantDepartmentSetupService;
    global.tenantDepartmentSetupService = TenantDepartmentSetupService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_TENANT_DEPARTMENT_SETUP_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
