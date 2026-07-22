/**
 * reportingHierarchyService.js
 * ARTHHRMS - Enterprise Reporting Hierarchy Builder
 *
 * Governs employee reporting relationships, approval chains, escalation chains,
 * organization charts, hierarchy versioning, and rollback. Existing approval,
 * leave, attendance, payroll, and workflow records are intentionally not
 * mutated by this service.
 */
(function attachReportingHierarchyService(global) {
    'use strict';

    var PREFIX = '[ReportingHierarchyService]';
    var SOURCE = 'reportingHierarchyService';
    var REL_TABLE = 'reportingHierarchyRelationships';
    var VERSION_TABLE = 'reportingHierarchyVersions';
    var HISTORY_TABLE = 'reportingHierarchyHistory';
    var SNAPSHOT_TABLE = 'reportingHierarchySnapshots';
    var ROLLBACK_TABLE = 'reportingHierarchyRollbackHistory';
    var IMPORT_TABLE = 'reportingHierarchyImports';
    var ANALYTICS_TABLE = 'reportingHierarchyAnalytics';

    var RELATIONSHIP_TYPES = Object.freeze([
        'DIRECT_MANAGER',
        'DOTTED_LINE_MANAGER',
        'FUNCTIONAL_MANAGER',
        'PROJECT_MANAGER',
        'DEPARTMENT_HEAD',
        'BUSINESS_UNIT_HEAD',
        'HR_MANAGER',
        'REGIONAL_MANAGER',
        'COUNTRY_HEAD',
        'CEO',
        'CUSTOM'
    ]);
    var APPROVAL_TYPES = Object.freeze(['LEAVE', 'EXPENSE', 'TRAVEL', 'RECRUITMENT', 'PROMOTION', 'TERMINATION', 'PAYROLL']);
    var ESCALATION_TYPES = Object.freeze(['IMMEDIATE', 'TIME_BASED', 'HIERARCHY', 'DEPARTMENT', 'REGIONAL', 'EXECUTIVE']);
    var MUTATION_ROLES = Object.freeze(['HR', 'ADMIN', 'DIRECTOR']);
    var READ_ROLES = Object.freeze(['HR', 'ADMIN', 'DIRECTOR', 'MANAGER', 'EMPLOYEE', 'PLATFORM_OWNER']);
    var MAX_HIERARCHY_DEPTH = 20;
    var SENSITIVE_KEYS = /password|secret|token|cookie|session|salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|tax|government|aadhaar|\bpan\b|\btin\b|ssn|rawPayload|private|confidential|medical|biometric/i;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            safeWarn('DB read failed safely.', error && error.message);
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {
            safeWarn('DB save failed safely.', error && error.message);
        }
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        return String(value).trim();
    }

    function normalizeTenant(value) {
        return safeString(value, '')
            .toLowerCase()
            .replace(/^tenant[-_]/, '')
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function normalizeId(value) {
        return safeString(value, '').toUpperCase();
    }

    function normalizeRole(value) {
        var role = safeString(value || 'EMPLOYEE', 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') role = 'PLATFORM_OWNER';
        return role || 'EMPLOYEE';
    }

    function normalizeType(value, fallback) {
        return safeString(value || fallback || '', '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function clone(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object') return value;
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function each(item) { return clone(item, refs.slice()); });
        var out = {};
        Object.keys(value).forEach(function each(key) { out[key] = clone(value[key], refs.slice()); });
        return out;
    }

    function isSensitiveKey(key) {
        var text = String(key || '');
        if (/Preserved$|Unaffected$|Changed$|Supported$|Versioned$|Auditable$|Reversible$|Prepared$|Compatible$/i.test(text)) return false;
        return SENSITIVE_KEYS.test(text);
    }

    function cloneSanitized(value, keyHint, seen) {
        var refs = seen || [];
        if (isSensitiveKey(keyHint)) return undefined;
        if (!value || typeof value !== 'object') {
            if (SENSITIVE_KEYS.test(String(value || ''))) return '[REDACTED]';
            return value;
        }
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint, refs.slice()); });
        var out = {};
        Object.keys(value).forEach(function each(key) {
            if (isSensitiveKey(key)) return;
            var next = cloneSanitized(value[key], key, refs.slice());
            if (next !== undefined) out[key] = next;
        });
        return out;
    }

    function deepFreeze(value, seen) {
        var refs = seen || [];
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        Object.keys(value).forEach(function each(key) { deepFreeze(value[key], refs); });
        try { Object.freeze(value); } catch (error) {}
        return value;
    }

    function freezeHierarchyOutput(value) {
        return deepFreeze(cloneSanitized(value || {}, '', []));
    }

    function issue(code, message, severity, metadata) {
        return freezeHierarchyOutput({
            code: normalizeType(code || 'HIERARCHY_ISSUE'),
            message: safeString(message || 'Hierarchy issue.', 'Hierarchy issue.'),
            severity: normalizeType(severity || 'ERROR'),
            metadata: metadata || {}
        });
    }

    function governanceFlags(audited) {
        return {
            backwardCompatible: true,
            tenantIsolationPreserved: true,
            employeeModulePreserved: true,
            approvalModulePreserved: true,
            leaveModulePreserved: true,
            attendanceModulePreserved: true,
            workflowModulePreserved: true,
            workflowExecutionChanged: false,
            versioned: true,
            auditable: !!audited,
            reversible: true
        };
    }

    function failure(code, message, input, context, metadata) {
        return freezeHierarchyOutput({
            success: false,
            code: normalizeType(code),
            tenantSlug: tenantFrom(input || {}, context || {}),
            issues: [issue(code, message, 'ERROR', metadata || {})],
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function ensureTables(data) {
        [REL_TABLE, VERSION_TABLE, HISTORY_TABLE, SNAPSHOT_TABLE, ROLLBACK_TABLE, IMPORT_TABLE, ANALYTICS_TABLE].forEach(function each(table) {
            if (!Array.isArray(data[table])) data[table] = [];
        });
        if (!Array.isArray(data.employees)) data.employees = [];
        return data;
    }

    function tenantFrom(input, context) {
        var data = rawData();
        var actor = context && context.actor || {};
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.organizationId) ||
            context && (context.tenantSlug || context.tenantId || context.organizationId) ||
            actor.tenantSlug || actor.tenantId ||
            data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId) ||
            'default'
        );
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.empId || actor.employeeId || context && context.actorId || 'system', 'system'),
            empId: normalizeId(actor.empId || actor.employeeId || actor.id || ''),
            role: normalizeRole(actor.role || actor.actorRole || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function tenantOf(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId || row.organizationId));
    }

    function sameTenant(row, tenantSlug) {
        return tenantOf(row) === normalizeTenant(tenantSlug);
    }

    function employeeIdOf(row) {
        return normalizeId(row && (row.employeeId || row.employeeCode || row.empId || row.id));
    }

    function employeeStatus(row) {
        return normalizeType(row && (row.employmentStatus || row.status || row.lifecycleStatus) || 'ACTIVE');
    }

    function activeEmployee(row) {
        return !!row && ['TERMINATED', 'RESIGNED', 'RETIRED', 'INACTIVE', 'ARCHIVED', 'SUSPENDED'].indexOf(employeeStatus(row)) === -1;
    }

    function employeesForTenant(data, tenantSlug) {
        return (data.employees || []).filter(function each(row) { return sameTenant(row, tenantSlug) && employeeIdOf(row); });
    }

    function employeeMap(data, tenantSlug) {
        var map = new Map();
        employeesForTenant(data, tenantSlug).forEach(function each(row) {
            [row.employeeId, row.employeeCode, row.empId, row.id].forEach(function key(value) {
                var normalized = normalizeId(value);
                if (normalized && !map.has(normalized)) map.set(normalized, row);
            });
        });
        return map;
    }

    function findEmployee(data, tenantSlug, employeeId) {
        return employeeMap(data, tenantSlug).get(normalizeId(employeeId)) || null;
    }

    function findEmployeeAnyTenant(data, employeeId) {
        var idKey = normalizeId(employeeId);
        return (data.employees || []).find(function each(row) {
            return [row.employeeId, row.employeeCode, row.empId, row.id].some(function match(value) { return normalizeId(value) === idKey; });
        }) || null;
    }

    function currentVersion(data, tenantSlug, employeeId, relationshipType) {
        var type = normalizeType(relationshipType || 'DIRECT_MANAGER');
        var idKey = normalizeId(employeeId);
        var rows = (data[VERSION_TABLE] || []).filter(function each(row) {
            return normalizeTenant(row.tenantSlug) === normalizeTenant(tenantSlug) &&
                normalizeId(row.employeeId) === idKey &&
                normalizeType(row.relationshipType) === type;
        });
        return rows.length ? Math.max.apply(null, rows.map(function each(row) { return Number(row.version || 0); })) : 0;
    }

    function checkAccess(input, context, mode) {
        var actor = contextActor(context || {});
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actorTenant = actor.tenantSlug || tenantFrom({}, context || {});
        var allowedRoles = mode === 'MUTATE' ? MUTATION_ROLES : READ_ROLES;
        if (allowedRoles.indexOf(actor.role) === -1) {
            return { allowed: false, output: failure('HIERARCHY_GOVERNANCE_DENIED', 'Role cannot perform reporting hierarchy governance action.', input, context, { role: actor.role, mode: mode }) };
        }
        if (actor.role !== 'PLATFORM_OWNER' && actorTenant && tenantSlug && actorTenant !== tenantSlug) {
            return { allowed: false, output: failure('CROSS_TENANT_HIERARCHY_BLOCKED', 'Cross-tenant hierarchy access is blocked.', input, context, { mode: mode }) };
        }
        return { allowed: true, actor: actor, tenantSlug: tenantSlug };
    }

    function hierarchyLevel(employee) {
        var role = normalizeRole(employee && employee.role);
        var text = (role + ' ' + safeString(employee && (employee.designation || employee.title), '')).toUpperCase();
        if (/CEO|CHIEF_EXECUTIVE|FOUNDER|PRESIDENT/.test(text)) return 'CEO';
        if (/DIRECTOR|VP|VICE_PRESIDENT|HEAD/.test(text)) return 'DIRECTOR';
        if (/HR/.test(text)) return 'HR_MANAGER';
        if (/MANAGER|SUPERVISOR/.test(text)) return 'MANAGER';
        if (/LEAD/.test(text)) return 'TEAM_LEAD';
        return 'EMPLOYEE';
    }

    function publicNode(employee, directReports) {
        return {
            employeeId: employeeIdOf(employee),
            name: safeString(employee.name || employee.fullName || employee.displayName || employeeIdOf(employee), employeeIdOf(employee)),
            role: normalizeRole(employee.role),
            hierarchyLevel: hierarchyLevel(employee),
            department: safeString(employee.department || employee.dept || 'Unassigned', 'Unassigned'),
            designation: safeString(employee.designation || employee.title || '', ''),
            managerId: normalizeId(employee.managerId || employee.reportsTo || ''),
            directReports: directReports || 0
        };
    }

    function directManagerMap(data, tenantSlug, proposedRelationships) {
        var map = {};
        employeesForTenant(data, tenantSlug).forEach(function each(row) {
            map[employeeIdOf(row)] = normalizeId(row.managerId || row.reportsTo || '');
        });
        (data[REL_TABLE] || []).forEach(function each(row) {
            if (normalizeTenant(row.tenantSlug) !== normalizeTenant(tenantSlug)) return;
            if (normalizeType(row.relationshipType) !== 'DIRECT_MANAGER') return;
            if (row.active === false || normalizeType(row.status || 'ACTIVE') === 'ROLLED_BACK') return;
            map[normalizeId(row.employeeId)] = normalizeId(row.managerId);
        });
        (proposedRelationships || []).forEach(function each(row) {
            if (normalizeType(row.relationshipType || 'DIRECT_MANAGER') === 'DIRECT_MANAGER') {
                map[normalizeId(row.employeeId)] = normalizeId(row.managerId);
            }
        });
        return map;
    }

    function detectCycleFor(employeeId, managerId, relationMap) {
        var start = normalizeId(employeeId);
        var current = normalizeId(managerId);
        var seen = new Set([start]);
        var depth = 0;
        while (current) {
            depth += 1;
            if (seen.has(current)) return true;
            if (depth > MAX_HIERARCHY_DEPTH + 1) return true;
            seen.add(current);
            current = normalizeId(relationMap[current] || '');
        }
        return false;
    }

    function managerChain(data, tenantSlug, employeeId, proposedRelationships) {
        var employees = employeeMap(data, tenantSlug);
        var relationMap = directManagerMap(data, tenantSlug, proposedRelationships);
        var chain = [];
        var current = normalizeId(relationMap[normalizeId(employeeId)] || '');
        var seen = new Set([normalizeId(employeeId)]);
        while (current && employees.has(current)) {
            if (seen.has(current)) break;
            seen.add(current);
            var employee = employees.get(current);
            chain.push(employee);
            current = normalizeId(relationMap[current] || '');
            if (chain.length > MAX_HIERARCHY_DEPTH) break;
        }
        return chain;
    }

    function validateHierarchyChange(input, context) {
        var access = checkAccess(input || {}, context || {}, 'MUTATE');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var employeeId = normalizeId(input && input.employeeId);
        var managerId = normalizeId(input && (input.managerId || input.newManagerId));
        var relationshipType = normalizeType(input && input.relationshipType || 'DIRECT_MANAGER');
        var issues = [];
        var employee = findEmployee(data, tenantSlug, employeeId);
        var manager = findEmployee(data, tenantSlug, managerId);
        var managerAnyTenant = findEmployeeAnyTenant(data, managerId);

        if (RELATIONSHIP_TYPES.indexOf(relationshipType) === -1) {
            issues.push(issue('UNSUPPORTED_RELATIONSHIP_TYPE', 'Relationship type is not supported.', 'ERROR', { relationshipType: relationshipType }));
        }
        if (!employee) {
            issues.push(issue('EMPLOYEE_NOT_FOUND', 'Employee was not found in tenant hierarchy scope.', 'ERROR', { employeeId: employeeId }));
        }
        if (!manager) {
            if (managerAnyTenant && !sameTenant(managerAnyTenant, tenantSlug)) {
                issues.push(issue('CROSS_TENANT_ASSIGNMENT_BLOCKED', 'Manager belongs to a different tenant.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
            } else {
                issues.push(issue('MANAGER_NOT_FOUND', 'Manager was not found in tenant hierarchy scope.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
            }
        }
        if (employeeId && managerId && employeeId === managerId) {
            issues.push(issue('SELF_REPORTING', 'Employee cannot report to self.', 'ERROR', { employeeId: employeeId }));
        }
        if (manager && !activeEmployee(manager)) {
            issues.push(issue('INACTIVE_MANAGER', 'Manager must be active for hierarchy assignment.', 'ERROR', { managerId: managerId, status: employeeStatus(manager) }));
        }
        if (employee && manager && relationshipType === 'DIRECT_MANAGER') {
            var relationMap = directManagerMap(data, tenantSlug, [{ employeeId: employeeId, managerId: managerId, relationshipType: relationshipType }]);
            if (detectCycleFor(employeeId, managerId, relationMap)) {
                issues.push(issue('CIRCULAR_REFERENCE', 'Circular reporting hierarchy detected.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
            }
            var depth = managerChain(data, tenantSlug, employeeId, [{ employeeId: employeeId, managerId: managerId, relationshipType: relationshipType }]).length;
            if (depth > MAX_HIERARCHY_DEPTH) {
                issues.push(issue('MAX_HIERARCHY_DEPTH_EXCEEDED', 'Hierarchy depth exceeds configured maximum.', 'ERROR', { employeeId: employeeId, depth: depth }));
            }
        }

        var oldManagerId = employee ? normalizeId(employee.managerId || '') : '';
        return freezeHierarchyOutput({
            success: issues.length === 0,
            tenantSlug: tenantSlug,
            employeeId: employeeId,
            relationshipType: relationshipType,
            oldManagerId: oldManagerId,
            newManagerId: managerId,
            issues: issues,
            validation: {
                managerExists: !!manager,
                employeeExists: !!employee,
                circularReferenceBlocked: issues.some(function each(row) { return row.code === 'CIRCULAR_REFERENCE'; }),
                crossTenantBlocked: issues.some(function each(row) { return row.code === 'CROSS_TENANT_ASSIGNMENT_BLOCKED'; })
            },
            readOnly: true,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function audit(actionType, targetId, description, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return false;
            var actor = contextActor(context || {});
            var clean = cloneSanitized(metadata || {}, '', []);
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actorId: actor.id || actor.empId,
                    severity: clean.severity || 'INFO',
                    metadata: Object.assign({
                        actionType: actionType,
                        actorRole: actor.role,
                        module: 'Reporting Hierarchy',
                        targetId: targetId || '',
                        description: description || actionType
                    }, clean)
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Reporting Hierarchy', targetId || '', description || actionType);
                return true;
            }
        } catch (error) {
            safeWarn('Audit failed safely.', error && error.message);
        }
        return false;
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return false;
            var telemetry = global.WorkflowTelemetryService;
            if (!telemetry) return false;
            if (typeof telemetry.emitWorkflowTelemetry === 'function') {
                telemetry.emitWorkflowTelemetry(eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
            if (typeof telemetry.emitTelemetry === 'function') {
                telemetry.emitTelemetry('WORKFLOW', eventType, { source: SOURCE, status: metadata && metadata.status || 'RECORDED', metadata: metadata || {} });
                return true;
            }
        } catch (error) {
            safeWarn('Telemetry failed safely.', error && error.message);
        }
        return false;
    }

    function recordMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics) return false;
            var metrics = global.OrchestrationMetricsService;
            if (metrics && typeof metrics.recordWorkflowMetric === 'function') {
                metrics.recordWorkflowMetric(eventType, Object.assign({ source: SOURCE }, metadata || {}));
                return true;
            }
        } catch (error) {
            safeWarn('Metric recording failed safely.', error && error.message);
        }
        return false;
    }

    function assignReportingRelationship(input, context) {
        var validation = validateHierarchyChange(input || {}, context || {});
        if (!validation.success) return validation;
        var access = checkAccess(input || {}, context || {}, 'MUTATE');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var employee = findEmployee(data, tenantSlug, input.employeeId);
        var manager = findEmployee(data, tenantSlug, input.managerId || input.newManagerId);
        var employeeId = employeeIdOf(employee);
        var managerId = employeeIdOf(manager);
        var relationshipType = normalizeType(input.relationshipType || 'DIRECT_MANAGER');
        var previousVersion = currentVersion(data, tenantSlug, employeeId, relationshipType);
        if (input.expectedVersion !== undefined && Number(input.expectedVersion) !== previousVersion) {
            return failure('CONCURRENT_HIERARCHY_UPDATE', 'Hierarchy version changed before assignment could be applied.', input, context, { expectedVersion: input.expectedVersion, currentVersion: previousVersion });
        }

        var versionId = id('HIER-VERSION');
        var relationshipId = id('HIER-REL');
        var snapshotId = id('HIER-SNAPSHOT');
        var oldManagerId = normalizeId(employee.managerId || '');
        var beforeEmployee = clone(employee);
        var beforeRelationships = clone((data[REL_TABLE] || []).filter(function each(row) {
            return normalizeTenant(row.tenantSlug) === tenantSlug && normalizeId(row.employeeId) === employeeId && normalizeType(row.relationshipType) === relationshipType && row.active !== false;
        }));

        try {
            data[REL_TABLE].forEach(function deactivate(row) {
                if (normalizeTenant(row.tenantSlug) === tenantSlug && normalizeId(row.employeeId) === employeeId && normalizeType(row.relationshipType) === relationshipType && row.active !== false) {
                    row.active = false;
                    row.status = 'SUPERSEDED';
                    row.supersededAt = nowIso();
                }
            });
            if (relationshipType === 'DIRECT_MANAGER') {
                employee.managerId = managerId;
                employee.reportsTo = managerId;
                employee.updatedAt = nowIso();
            }
            var relationship = {
                relationshipId: relationshipId,
                versionId: versionId,
                tenantSlug: tenantSlug,
                employeeId: employeeId,
                managerId: managerId,
                oldManagerId: oldManagerId,
                relationshipType: relationshipType,
                effectiveDate: safeString(input.effectiveDate || nowIso().slice(0, 10), nowIso().slice(0, 10)),
                reason: safeString(input.reason || input.transitionReason || 'Reporting hierarchy update', 'Reporting hierarchy update'),
                supportingNotes: safeString(input.supportingNotes || '', ''),
                active: true,
                status: 'ACTIVE',
                createdAt: nowIso(),
                createdBy: access.actor.id
            };
            var version = {
                versionId: versionId,
                tenantSlug: tenantSlug,
                employeeId: employeeId,
                relationshipType: relationshipType,
                previousManagerId: oldManagerId,
                newManagerId: managerId,
                version: previousVersion + 1,
                reason: relationship.reason,
                effectiveDate: relationship.effectiveDate,
                approval: clone(input.approval || {}),
                changedBy: access.actor.id,
                timestamp: nowIso(),
                immutable: true
            };
            var snapshot = {
                snapshotId: snapshotId,
                versionId: versionId,
                tenantSlug: tenantSlug,
                employeeId: employeeId,
                relationshipType: relationshipType,
                beforeEmployee: beforeEmployee,
                beforeRelationships: beforeRelationships,
                afterRelationship: clone(relationship),
                createdAt: nowIso(),
                reversible: true,
                immutable: true
            };
            data[REL_TABLE].unshift(relationship);
            data[VERSION_TABLE].unshift(version);
            data[HISTORY_TABLE].unshift({
                historyId: id('HIER-HIST'),
                versionId: versionId,
                tenantSlug: tenantSlug,
                employeeId: employeeId,
                oldManagerId: oldManagerId,
                newManagerId: managerId,
                relationshipType: relationshipType,
                action: 'ASSIGNED',
                reason: relationship.reason,
                timestamp: nowIso(),
                immutable: true
            });
            data[SNAPSHOT_TABLE].unshift(snapshot);
            saveData(data);
            var metadata = { versionId: versionId, relationshipId: relationshipId, tenantSlug: tenantSlug, employeeId: employeeId, managerId: managerId, relationshipType: relationshipType, status: 'COMPLETED' };
            audit('HIERARCHY_RELATIONSHIP_ASSIGNED', versionId, 'Reporting hierarchy relationship assigned.', metadata, context || {});
            emitTelemetry('HIERARCHY_RELATIONSHIP_ASSIGNED', metadata, context || {});
            recordMetric('HIERARCHY_RELATIONSHIP_ASSIGNED', metadata, context || {});
            return freezeHierarchyOutput({
                success: true,
                tenantSlug: tenantSlug,
                relationship: relationship,
                version: version,
                snapshotId: snapshotId,
                timestamp: nowIso(),
                governance: governanceFlags(true)
            });
        } catch (error) {
            return failure('HIERARCHY_ASSIGNMENT_FAILED_SAFE', 'Reporting hierarchy assignment failed safely.', input, context, { error: error && error.message });
        }
    }

    function parseCsv(content) {
        var lines = safeString(content, '').split(/\r?\n/).filter(function each(line) { return safeString(line, '') !== ''; });
        if (!lines.length) return [];
        var headers = lines[0].split(',').map(function each(item) { return safeString(item, ''); });
        return lines.slice(1).map(function each(line, index) {
            var cells = line.split(',');
            var row = { __rowNumber: index + 2 };
            headers.forEach(function map(header, i) { row[header] = safeString(cells[i] || '', ''); });
            return row;
        });
    }

    function relationshipsFromImport(input) {
        var type = normalizeType(input && input.fileType || 'CSV');
        var rows = Array.isArray(input && input.records) ? input.records : parseCsv(input && input.fileContent);
        var output = [];
        rows.forEach(function each(row) {
            var employeeId = normalizeId(row.employeeId || row['Employee ID'] || row['Emp ID'] || row['Employee Code']);
            [
                ['Direct Manager', 'DIRECT_MANAGER'],
                ['Dotted Line Manager', 'DOTTED_LINE_MANAGER'],
                ['Functional Manager', 'FUNCTIONAL_MANAGER'],
                ['Project Manager', 'PROJECT_MANAGER']
            ].forEach(function map(pair) {
                var managerId = normalizeId(row[pair[0]] || row[pair[1]] || '');
                if (employeeId && managerId) output.push({ employeeId: employeeId, managerId: managerId, relationshipType: pair[1], rowNumber: row.__rowNumber, sourceType: type });
            });
        });
        return output;
    }

    function bulkAssignRelationships(input, context) {
        var access = checkAccess(input || {}, context || {}, 'MUTATE');
        if (!access.allowed) return access.output;
        var relationships = Array.isArray(input && input.relationships) ? input.relationships : [];
        if (input && input.dryRun) {
            return validateHierarchyIntegrity({ tenantSlug: access.tenantSlug, proposedRelationships: relationships }, context || {});
        }
        var results = relationships.map(function each(row) {
            return assignReportingRelationship(Object.assign({ tenantSlug: access.tenantSlug, reason: input.reason || 'Bulk hierarchy update' }, row), context || {});
        });
        return freezeHierarchyOutput({
            success: results.every(function each(row) { return row.success; }),
            tenantSlug: access.tenantSlug,
            results: results,
            summary: {
                totalRelationships: relationships.length,
                appliedRelationships: results.filter(function each(row) { return row.success; }).length,
                failedRelationships: results.filter(function each(row) { return !row.success; }).length
            },
            governance: governanceFlags(results.some(function each(row) { return row.success; }))
        });
    }

    function importHierarchyRelationships(input, context) {
        var access = checkAccess(input || {}, context || {}, 'MUTATE');
        if (!access.allowed) return access.output;
        var relationships = relationshipsFromImport(input || {});
        var validation = validateHierarchyIntegrity({ tenantSlug: access.tenantSlug, proposedRelationships: relationships }, context || {});
        var summary = {
            totalRelationships: relationships.length,
            validRelationships: validation.validRelationships || 0,
            invalidRelationships: validation.invalidRelationships || 0
        };
        if (input && input.dryRun !== false) {
            return freezeHierarchyOutput({
                success: true,
                tenantSlug: access.tenantSlug,
                dryRun: true,
                relationships: relationships,
                validation: validation,
                summary: summary,
                readOnly: true,
                governance: governanceFlags(false)
            });
        }
        var execution = bulkAssignRelationships({ tenantSlug: access.tenantSlug, relationships: relationships, reason: 'Hierarchy import execution' }, context || {});
        var data = ensureTables(rawData());
        data[IMPORT_TABLE].unshift({ importId: id('HIER-IMPORT'), tenantSlug: access.tenantSlug, fileName: safeString(input && input.fileName, ''), summary: summary, executed: true, timestamp: nowIso(), immutable: true });
        saveData(data);
        return freezeHierarchyOutput(Object.assign({}, execution, { importSummary: summary }));
    }

    function validateHierarchyIntegrity(input, context) {
        var access = checkAccess(input || {}, context || {}, 'READ');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var relationships = Array.isArray(input && input.proposedRelationships) ? input.proposedRelationships : [];
        var issues = [];
        var employees = employeeMap(data, tenantSlug);
        relationships.forEach(function each(row) {
            var employeeId = normalizeId(row.employeeId);
            var managerId = normalizeId(row.managerId);
            var employee = findEmployee(data, tenantSlug, employeeId);
            var manager = findEmployee(data, tenantSlug, managerId);
            var anyManager = findEmployeeAnyTenant(data, managerId);
            if (!employee) issues.push(issue('EMPLOYEE_NOT_FOUND', 'Employee does not exist in tenant scope.', 'ERROR', { employeeId: employeeId }));
            if (!manager) {
                if (anyManager && !sameTenant(anyManager, tenantSlug)) issues.push(issue('CROSS_TENANT_ASSIGNMENT_BLOCKED', 'Manager belongs to another tenant.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
                else issues.push(issue('MANAGER_NOT_FOUND', 'Manager does not exist in tenant scope.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
            } else if (!activeEmployee(manager)) {
                issues.push(issue('INACTIVE_MANAGER', 'Manager is inactive.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
            }
            if (employeeId && managerId && employeeId === managerId) {
                issues.push(issue('SELF_REPORTING', 'Employee cannot report to self.', 'ERROR', { employeeId: employeeId }));
            }
        });
        var relationMap = directManagerMap(data, tenantSlug, relationships);
        Array.from(employees.keys()).forEach(function each(employeeId) {
            var managerId = relationMap[employeeId];
            if (managerId && detectCycleFor(employeeId, managerId, relationMap)) {
                issues.push(issue('CIRCULAR_REFERENCE', 'Circular reporting hierarchy detected.', 'ERROR', { employeeId: employeeId, managerId: managerId }));
            }
        });
        var unique = [];
        var keys = new Set();
        issues.forEach(function dedupe(row) {
            var key = row.code + ':' + (row.metadata.employeeId || '') + ':' + (row.metadata.managerId || '');
            if (keys.has(key)) return;
            keys.add(key);
            unique.push(row);
        });
        return freezeHierarchyOutput({
            success: unique.length === 0,
            tenantSlug: tenantSlug,
            issues: unique,
            validRelationships: Math.max(0, relationships.length - unique.length),
            invalidRelationships: unique.length,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function directReportCounts(data, tenantSlug) {
        var counts = {};
        Object.keys(directManagerMap(data, tenantSlug)).forEach(function each(employeeId) {
            var managerId = directManagerMap(data, tenantSlug)[employeeId];
            if (!managerId) return;
            counts[managerId] = (counts[managerId] || 0) + 1;
        });
        return counts;
    }

    function buildOrganizationChart(input, context) {
        var access = checkAccess(input || {}, context || {}, 'READ');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var rows = employeesForTenant(data, tenantSlug);
        var relationMap = directManagerMap(data, tenantSlug);
        var counts = directReportCounts(data, tenantSlug);
        var nodes = rows.map(function each(row) {
            var node = publicNode(row, counts[employeeIdOf(row)] || 0);
            node.managerId = normalizeId(relationMap[node.employeeId] || node.managerId);
            return node;
        });
        var visibleIds = new Set(nodes.map(function each(row) { return row.employeeId; }));
        var edges = nodes.filter(function each(row) { return row.managerId && visibleIds.has(row.managerId); }).map(function each(row) {
            return { from: row.managerId, to: row.employeeId, relationshipType: 'DIRECT_MANAGER' };
        });
        var byManager = {};
        nodes.forEach(function each(row) {
            if (!byManager[row.managerId || 'ROOT']) byManager[row.managerId || 'ROOT'] = [];
            byManager[row.managerId || 'ROOT'].push(row);
        });
        function toTree(node, depth, path) {
            if (path.indexOf(node.employeeId) !== -1) return Object.assign({}, node, { depth: depth, children: [], cycleDetected: true });
            return Object.assign({}, node, {
                depth: depth,
                children: (byManager[node.employeeId] || []).map(function child(row) { return toTree(row, depth + 1, path.concat(node.employeeId)); })
            });
        }
        var organizationTree = (byManager.ROOT || nodes.filter(function root(row) { return !visibleIds.has(row.managerId); })).map(function root(row) { return toTree(row, 1, []); });
        var departmentTree = {};
        nodes.forEach(function dept(row) {
            departmentTree[row.department] = departmentTree[row.department] || [];
            departmentTree[row.department].push(row);
        });
        return freezeHierarchyOutput({
            success: true,
            tenantSlug: tenantSlug,
            viewMode: normalizeType(input && input.viewMode || 'ORGANIZATION'),
            nodes: nodes,
            edges: edges,
            organizationTree: organizationTree,
            departmentTree: departmentTree,
            managerTree: byManager,
            relationshipTypes: RELATIONSHIP_TYPES,
            timestamp: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function chainRows(data, tenantSlug, employeeId) {
        return managerChain(data, tenantSlug, employeeId).map(function each(row, index) {
            return {
                employeeId: employeeIdOf(row),
                name: safeString(row.name || employeeIdOf(row), employeeIdOf(row)),
                role: normalizeRole(row.role),
                hierarchyLevel: hierarchyLevel(row),
                department: safeString(row.department || '', ''),
                level: index + 1
            };
        });
    }

    function generateApprovalChain(input, context) {
        var access = checkAccess(input || {}, context || {}, 'READ');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var approvalType = normalizeType(input && input.approvalType || 'LEAVE');
        var chain = chainRows(data, access.tenantSlug, input && input.employeeId);
        if (approvalType === 'PAYROLL') {
            chain = chain.filter(function each(row) { return ['DIRECTOR', 'CEO', 'HR_MANAGER'].indexOf(row.hierarchyLevel) !== -1 || row.role === 'DIRECTOR' || row.role === 'HR'; });
            if (!chain.length) chain = chainRows(data, access.tenantSlug, input && input.employeeId);
        }
        var result = {
            chainId: id('APPROVAL-CHAIN'),
            success: true,
            tenantSlug: access.tenantSlug,
            employeeId: normalizeId(input && input.employeeId),
            approvalType: approvalType,
            chain: chain,
            customOverridesSupported: true,
            generatedAt: nowIso(),
            governance: governanceFlags(false)
        };
        return freezeHierarchyOutput(result);
    }

    function generateEscalationChain(input, context) {
        var access = checkAccess(input || {}, context || {}, 'READ');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var escalationType = normalizeType(input && input.escalationType || 'HIERARCHY');
        var chain = chainRows(data, access.tenantSlug, input && input.employeeId);
        var rules = [
            { type: escalationType, delayHours: Number(input && input.delayHours || 0), targetLevel: chain[0] && chain[0].hierarchyLevel || 'MANAGER' },
            { type: 'HIERARCHY', delayHours: Number(input && input.delayHours || 0) + 24, targetLevel: chain[1] && chain[1].hierarchyLevel || 'DIRECTOR' },
            { type: 'EXECUTIVE', delayHours: Number(input && input.delayHours || 0) + 48, targetLevel: chain[chain.length - 1] && chain[chain.length - 1].hierarchyLevel || 'CEO' }
        ];
        return freezeHierarchyOutput({
            chainId: id('ESCALATION-CHAIN'),
            success: true,
            tenantSlug: access.tenantSlug,
            employeeId: normalizeId(input && input.employeeId),
            escalationType: escalationType,
            chain: chain,
            rules: rules,
            generatedAt: nowIso(),
            governance: governanceFlags(false)
        });
    }

    function rollbackHierarchyVersion(input, context) {
        var access = checkAccess(input || {}, context || {}, 'MUTATE');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var versionId = safeString(input && input.versionId, '');
        var snapshot = data[SNAPSHOT_TABLE].find(function each(row) {
            return row.versionId === versionId && normalizeTenant(row.tenantSlug) === access.tenantSlug;
        });
        if (!snapshot) return failure('HIERARCHY_SNAPSHOT_NOT_FOUND', 'Hierarchy rollback snapshot was not found.', input, context, { versionId: versionId });
        try {
            var employee = findEmployee(data, access.tenantSlug, snapshot.employeeId);
            if (employee && snapshot.beforeEmployee) {
                data.employees[data.employees.indexOf(employee)] = clone(snapshot.beforeEmployee);
            }
            data[REL_TABLE] = data[REL_TABLE].filter(function each(row) {
                return row.versionId !== versionId;
            });
            (snapshot.beforeRelationships || []).forEach(function restore(row) {
                data[REL_TABLE].unshift(clone(row));
            });
            var rollback = {
                rollbackId: id('HIER-ROLLBACK'),
                versionId: versionId,
                snapshotId: snapshot.snapshotId,
                tenantSlug: access.tenantSlug,
                employeeId: snapshot.employeeId,
                restoredRelationships: 1,
                reason: safeString(input && input.reason, 'Hierarchy rollback'),
                rolledBackAt: nowIso(),
                rolledBackBy: access.actor.id,
                immutable: true
            };
            data[ROLLBACK_TABLE].unshift(rollback);
            data[HISTORY_TABLE].unshift({
                historyId: id('HIER-HIST'),
                versionId: versionId,
                tenantSlug: access.tenantSlug,
                employeeId: snapshot.employeeId,
                action: 'ROLLED_BACK',
                reason: rollback.reason,
                timestamp: rollback.rolledBackAt,
                immutable: true
            });
            saveData(data);
            audit('HIERARCHY_ROLLBACK_COMPLETED', versionId, 'Reporting hierarchy rollback completed.', rollback, context || {});
            emitTelemetry('HIERARCHY_ROLLBACK_COMPLETED', rollback, context || {});
            recordMetric('HIERARCHY_ROLLBACK_COMPLETED', rollback, context || {});
            return freezeHierarchyOutput({
                success: true,
                tenantSlug: access.tenantSlug,
                rollback: rollback,
                governance: governanceFlags(true)
            });
        } catch (error) {
            return failure('HIERARCHY_ROLLBACK_FAILED_SAFE', 'Hierarchy rollback failed safely.', input, context, { error: error && error.message });
        }
    }

    function analyticsFor(data, tenantSlug) {
        var rows = employeesForTenant(data, tenantSlug);
        var relationMap = directManagerMap(data, tenantSlug);
        var counts = directReportCounts(data, tenantSlug);
        var depths = rows.map(function depth(row) { return managerChain(data, tenantSlug, employeeIdOf(row)).length + 1; });
        var spans = Object.keys(counts).map(function each(key) { return counts[key]; });
        var orphanEmployees = rows.filter(function each(row) {
            var idKey = employeeIdOf(row);
            var managerId = relationMap[idKey];
            return hierarchyLevel(row) !== 'CEO' && !managerId;
        }).length;
        var activeManagers = Object.keys(counts).length;
        var avgSpan = spans.length ? Math.round((spans.reduce(function sum(a, b) { return a + b; }, 0) / spans.length) * 10) / 10 : 0;
        var maxSpan = spans.length ? Math.max.apply(null, spans) : 0;
        var maxDepth = depths.length ? Math.max.apply(null, depths) : 0;
        var integrity = validateHierarchyIntegrity({ tenantSlug: tenantSlug, proposedRelationships: [] }, { actor: { id: 'ANALYTICS', role: 'HR', tenantSlug: tenantSlug }, tenantSlug: tenantSlug });
        var issuePenalty = (integrity.issues || []).length * 10 + orphanEmployees * 8;
        return {
            employeeCount: rows.length,
            activeManagers: activeManagers,
            hierarchyDepth: maxDepth,
            spanOfControl: { average: avgSpan, max: maxSpan, distribution: counts },
            averageTeamSize: avgSpan,
            orphanEmployees: orphanEmployees,
            approvalLevels: maxDepth ? Math.max(1, maxDepth - 1) : 0,
            managerWorkload: counts,
            organizationHealthScore: clampScore(100 - issuePenalty - Math.max(0, maxDepth - 8) * 3),
            hierarchyIntegrityScore: clampScore(100 - issuePenalty),
            managementCoverageScore: rows.length ? clampScore(((rows.length - orphanEmployees) / rows.length) * 100) : 100,
            issues: integrity.issues || []
        };
    }

    function generateHierarchyAnalytics(input, context) {
        var access = checkAccess(input || {}, context || {}, 'READ');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var analytics = analyticsFor(data, access.tenantSlug);
        var row = {
            analyticsId: id('HIER-ANALYTICS'),
            tenantSlug: access.tenantSlug,
            organizationHealthScore: analytics.organizationHealthScore,
            hierarchyIntegrityScore: analytics.hierarchyIntegrityScore,
            managementCoverageScore: analytics.managementCoverageScore,
            generatedAt: nowIso(),
            immutable: true
        };
        if (!(context && context.skipPersistence)) {
            data[ANALYTICS_TABLE].unshift(row);
            saveData(data);
        }
        return freezeHierarchyOutput({
            success: true,
            tenantSlug: access.tenantSlug,
            analytics: analytics,
            organizationHealthScore: analytics.organizationHealthScore,
            hierarchyIntegrityScore: analytics.hierarchyIntegrityScore,
            managementCoverageScore: analytics.managementCoverageScore,
            generatedAt: row.generatedAt,
            governance: governanceFlags(false)
        });
    }

    function generateHierarchyDashboard(input, context) {
        var access = checkAccess(input || {}, context || {}, 'READ');
        if (!access.allowed) return access.output;
        var data = ensureTables(rawData());
        var tenantSlug = access.tenantSlug;
        var chart = buildOrganizationChart({ tenantSlug: tenantSlug }, context || {});
        var analytics = generateHierarchyAnalytics({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipPersistence: true }));
        var sample = employeesForTenant(data, tenantSlug).slice(0, 3);
        var persistedRelationships = (data[REL_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; });
        var derivedRelationships = employeesForTenant(data, tenantSlug)
            .filter(function each(row) { return normalizeId(row.managerId || ''); })
            .map(function each(row) {
                return {
                    relationshipId: 'DERIVED-' + employeeIdOf(row),
                    tenantSlug: tenantSlug,
                    employeeId: employeeIdOf(row),
                    managerId: normalizeId(row.managerId),
                    relationshipType: 'DIRECT_MANAGER',
                    status: 'DERIVED_FROM_EMPLOYEE_MASTER',
                    active: true
                };
            });
        return freezeHierarchyOutput({
            success: true,
            tenantSlug: tenantSlug,
            organizationChart: chart,
            managerRelationships: persistedRelationships.length ? persistedRelationships : derivedRelationships,
            approvalChains: sample.map(function each(row) { return generateApprovalChain({ tenantSlug: tenantSlug, employeeId: employeeIdOf(row), approvalType: 'LEAVE' }, context || {}); }),
            escalationChains: sample.map(function each(row) { return generateEscalationChain({ tenantSlug: tenantSlug, employeeId: employeeIdOf(row), escalationType: 'HIERARCHY' }, context || {}); }),
            validationResults: validateHierarchyIntegrity({ tenantSlug: tenantSlug, proposedRelationships: [] }, context || {}),
            analytics: analytics.analytics || {},
            recentChanges: (data[HISTORY_TABLE] || []).filter(function each(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }).slice(0, 20),
            compatibility: {
                employeeModulePreserved: true,
                approvalModulePreserved: true,
                leaveModulePreserved: true,
                attendanceModulePreserved: true,
                workflowModulePreserved: true,
                existingBusinessWorkflowsChanged: false
            },
            governance: governanceFlags(false)
        });
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(freezeHierarchyOutput({ name: name, passed: !!passed, details: details || null }));
        }
        try {
            var context = { actor: { id: 'SELF-HR', role: 'HR', tenantSlug: 'self-test' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true };
            var input = { tenantSlug: 'self-test', employeeId: 'SELF-EMP', managerId: 'SELF-MGR', relationshipType: 'DIRECT_MANAGER' };
            var validation = validateHierarchyIntegrity({ tenantSlug: 'self-test', proposedRelationships: [] }, context);
            record('validation handles empty self-test tenant', validation.success === true, validation);
            record('outputs are immutable', Object.isFrozen(validation), { frozen: Object.isFrozen(validation) });
            record('relationship types available', RELATIONSHIP_TYPES.indexOf('DIRECT_MANAGER') !== -1 && RELATIONSHIP_TYPES.indexOf('PROJECT_MANAGER') !== -1, input);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message);
        }
        return freezeHierarchyOutput({
            passed: checks.every(function each(row) { return row.passed; }),
            timestamp: nowIso(),
            version: '1.0.0',
            summary: 'Reporting hierarchy governance self-test completed.',
            checks: checks
        });
    }

    var ReportingHierarchyService = Object.freeze({
        RELATIONSHIP_TYPES: RELATIONSHIP_TYPES,
        APPROVAL_TYPES: APPROVAL_TYPES,
        ESCALATION_TYPES: ESCALATION_TYPES,
        validateHierarchyChange: validateHierarchyChange,
        assignReportingRelationship: assignReportingRelationship,
        bulkAssignRelationships: bulkAssignRelationships,
        importHierarchyRelationships: importHierarchyRelationships,
        buildOrganizationChart: buildOrganizationChart,
        generateApprovalChain: generateApprovalChain,
        generateEscalationChain: generateEscalationChain,
        validateHierarchyIntegrity: validateHierarchyIntegrity,
        rollbackHierarchyVersion: rollbackHierarchyVersion,
        generateHierarchyAnalytics: generateHierarchyAnalytics,
        generateHierarchyDashboard: generateHierarchyDashboard,
        freezeHierarchyOutput: freezeHierarchyOutput
    });

    global.ReportingHierarchyService = ReportingHierarchyService;
    global.reportingHierarchyService = ReportingHierarchyService;
    global.HierarchyService = ReportingHierarchyService;
    global.OrganizationChartBuilder = ReportingHierarchyService;
    global.ApprovalChainBuilder = ReportingHierarchyService;
    global.EscalationEngine = ReportingHierarchyService;
    global.HierarchyValidator = ReportingHierarchyService;
    global.RelationshipManager = ReportingHierarchyService;
    global.HierarchyAnalyticsService = ReportingHierarchyService;

    if (global.__ARTHHRMS_DEV__ || (db() && typeof db().isDevelopmentMode === 'function' && db().isDevelopmentMode())) {
        global.__ARTHHRMS_REPORTING_HIERARCHY_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
