/**
 * organizationImportService.js
 * ARTHHRMS - Enterprise Organization Import Center
 *
 * Imports organization structure metadata only. Employee, attendance, leave,
 * payroll, and approval workflows are intentionally not mutated.
 */
(function attachOrganizationImportService(global) {
    'use strict';

    var PREFIX = '[OrganizationImportService]';
    var SOURCE = 'organizationImportService';
    var CONFIG_TABLE = 'companyProfileConfigurations';
    var VERSION_TABLE = 'companyConfigurationVersions';
    var IMPORT_JOB_TABLE = 'organizationImportJobs';
    var IMPORT_TX_TABLE = 'organizationImportTransactions';
    var TEMPLATE_TABLE = 'organizationImportTemplates';
    var ANALYTICS_TABLE = 'organizationImportAnalytics';

    var CATEGORIES = Object.freeze([
        'branches',
        'locations',
        'businessUnits',
        'departments',
        'divisions',
        'costCenters',
        'profitCenters',
        'hierarchy'
    ]);

    var REQUIRED_TEMPLATE_FIELDS = Object.freeze(['Record Type', 'Name', 'Code']);
    var OPTIONAL_TEMPLATE_FIELDS = Object.freeze([
        'Parent Code',
        'Country',
        'State',
        'City',
        'Postal Code',
        'Timezone',
        'Manager',
        'Cost Code',
        'Description'
    ]);

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

    function safeString(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        return String(value).trim();
    }

    function isPlainObject(value) {
        return !!value && Object.prototype.toString.call(value) === '[object Object]';
    }

    function normalizeRole(value) {
        return safeString(value, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    function normalizeTenant(value) {
        return safeString(value, '').toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function normalizeCode(value) {
        return safeString(value, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    }

    function normalizeTextKey(value) {
        return safeString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function clone(value, depth) {
        var level = depth || 0;
        if (level > 25) return null;
        if (Array.isArray(value)) return value.slice(0, 100000).map(function each(item) { return clone(item, level + 1); });
        if (isPlainObject(value)) {
            var out = {};
            Object.keys(value).forEach(function each(key) {
                if (/password|secret|token|private[_-]?key|api[_-]?key|client[_-]?secret/i.test(key)) return;
                out[key] = clone(value[key], level + 1);
            });
            return out;
        }
        return value;
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        Object.keys(value).forEach(function each(key) { deepFreeze(value[key], refs); });
        return Object.freeze(value);
    }

    function freezeImportOutput(value) {
        return deepFreeze(clone(value || {}, 0));
    }

    function issue(code, message, severity, metadata) {
        return freezeImportOutput({
            code: normalizeCode(code || 'ORGANIZATION_IMPORT_ISSUE'),
            message: safeString(message, 'Organization import issue.'),
            severity: normalizeCode(severity || 'HIGH'),
            metadata: clone(metadata || {}, 0)
        });
    }

    function failureOutput(code, tenantSlug, failures) {
        return freezeImportOutput({
            success: false,
            tenantSlug: normalizeTenant(tenantSlug),
            failures: failures && failures.length ? failures : [issue(code, 'Organization import failed safely.', 'HIGH')],
            warnings: [],
            timestamp: nowIso(),
            transactional: true,
            reversible: true,
            governance: {
                tenantIsolationPreserved: true,
                backwardCompatible: true,
                hrWorkflowsModified: false,
                audited: false,
                versioned: false,
                transactional: true,
                reversible: true
            }
        });
    }

    function contextActor(context) {
        var actor = context && context.actor || {};
        return {
            id: safeString(actor.id || actor.actorId || actor.userId || actor.email || '', ''),
            email: safeString(actor.email || '', '').toLowerCase(),
            role: normalizeRole(actor.role || actor.actorRole || context && context.role || ''),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || context && (context.tenantSlug || context.tenantId) || '')
        };
    }

    function tenantFrom(input, context) {
        var data = rawData();
        return normalizeTenant(
            input && (input.tenantSlug || input.tenantId || input.companyId) ||
            context && (context.tenantSlug || context.tenantId) ||
            context && context.actor && (context.actor.tenantSlug || context.actor.tenantId) ||
            data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId) ||
            'default'
        );
    }

    function validateAccess(input, context, operation) {
        var tenantSlug = tenantFrom(input || {}, context || {});
        var actor = contextActor(context || {});
        var role = actor.role;
        var allowedRoles = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_HEAD'];
        var manageRoles = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'ADMIN', 'HR'];
        var failures = [];
        if (allowedRoles.indexOf(role) === -1) {
            failures.push(issue('ORGANIZATION_IMPORT_ACCESS_DENIED', 'Role cannot access organization imports.', 'HIGH', { role: role }));
        }
        if (operation !== 'VIEW' && manageRoles.indexOf(role) === -1) {
            failures.push(issue('ORGANIZATION_IMPORT_MANAGE_DENIED', 'Role cannot manage organization imports.', 'HIGH', { role: role }));
        }
        if (actor.tenantSlug && actor.tenantSlug !== tenantSlug && role !== 'PLATFORM_OWNER') {
            failures.push(issue('CROSS_TENANT_IMPORT_BLOCKED', 'Cross-tenant organization imports are blocked.', 'CRITICAL', { actorTenant: actor.tenantSlug, targetTenant: tenantSlug }));
        }
        return { allowed: failures.length === 0, actor: actor, tenantSlug: tenantSlug, failures: failures };
    }

    function ensureTables(data) {
        if (!data[CONFIG_TABLE] || Array.isArray(data[CONFIG_TABLE])) data[CONFIG_TABLE] = {};
        if (!Array.isArray(data[VERSION_TABLE])) data[VERSION_TABLE] = [];
        if (!Array.isArray(data[IMPORT_JOB_TABLE])) data[IMPORT_JOB_TABLE] = [];
        if (!Array.isArray(data[IMPORT_TX_TABLE])) data[IMPORT_TX_TABLE] = [];
        if (!Array.isArray(data[TEMPLATE_TABLE])) data[TEMPLATE_TABLE] = [];
        if (!Array.isArray(data[ANALYTICS_TABLE])) data[ANALYTICS_TABLE] = [];
        if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
    }

    function defaultConfiguration(tenantSlug, data) {
        data = data || rawData();
        var settings = data.companySettings || {};
        var tenant = (Array.isArray(data.platformTenants) ? data.platformTenants : []).find(function find(row) {
            return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId)) === tenantSlug;
        }) || {};
        var companyName = settings.companyName || tenant.companyName || '';
        return {
            tenantSlug: tenantSlug,
            addresses: Array.isArray(settings.addresses) ? clone(settings.addresses, 0) : [],
            organizationStructure: {
                businessUnits: [],
                departments: [],
                divisions: [],
                costCenters: [],
                profitCenters: [],
                legalEntities: [],
                locations: [],
                hierarchy: []
            },
            companyProfile: {
                companyName: companyName,
                legalEntityName: settings.legalEntityName || companyName,
                companyCode: normalizeCode(settings.companyCode || tenant.companyCode || tenantSlug)
            },
            businessSettings: {
                currency: settings.currency || 'INR',
                defaultTimeZone: settings.timezone || settings.defaultTimeZone || 'Asia/Kolkata'
            }
        };
    }

    function getActiveConfiguration(tenantSlug, data) {
        ensureTables(data);
        var existing = data[CONFIG_TABLE][tenantSlug];
        var base = defaultConfiguration(tenantSlug, data);
        if (!existing || !isPlainObject(existing)) return base;
        return Object.assign(base, clone(existing, 0), {
            addresses: Array.isArray(existing.addresses) ? clone(existing.addresses, 0) : base.addresses,
            organizationStructure: Object.assign(base.organizationStructure, clone(existing.organizationStructure || {}, 0))
        });
    }

    function audit(data, actionType, tenantSlug, metadata, context) {
        var actor = contextActor(context || {});
        var clean = clone(metadata || {}, 0);
        data.auditLogs.unshift({
            id: 'AL' + String((data.auditLogs.length || 0) + 1).padStart(4, '0'),
            date: nowIso(),
            userRole: actor.role || 'system',
            actorRole: actor.role || 'system',
            actorId: actor.id || actor.email || '',
            action: actionType,
            actionType: actionType,
            module: 'Organization Import',
            targetId: clean.importId || clean.transactionId || tenantSlug,
            tenantSlug: tenantSlug,
            description: actionType + ': ' + (clean.reason || clean.fileName || tenantSlug)
        });
        data.auditLogs = data.auditLogs.slice(0, 500);
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.email,
                    module: 'Organization Import',
                    targetId: clean.importId || clean.transactionId || tenantSlug,
                    source: SOURCE,
                    severity: 'INFO',
                    metadata: Object.assign({ tenantIsolationPreserved: true }, clean)
                }, { source: SOURCE });
            }
        } catch (error) {
            safeWarn('External audit failed safely.', error && error.message);
        }
    }

    function versionNumber(data, tenantSlug) {
        return data[VERSION_TABLE].filter(function match(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }).length + 1;
    }

    function writeConfigurationVersion(data, tenantSlug, previousValue, newValue, reason, context, importId, rollbackOf) {
        var actor = contextActor(context || {});
        var version = {
            versionId: 'OICFG-' + tenantSlug + '-' + String(versionNumber(data, tenantSlug)).padStart(4, '0'),
            tenantSlug: tenantSlug,
            domain: 'organizationImport',
            version: versionNumber(data, tenantSlug),
            timestamp: nowIso(),
            changedBy: actor.id || actor.email || actor.role,
            changedByRole: actor.role,
            previousValue: clone(previousValue || {}, 0),
            newValue: clone(newValue || {}, 0),
            reason: safeString(reason || 'Organization import updated.', 'Organization import updated.'),
            rollbackSupported: true,
            rollbackOf: rollbackOf || '',
            importId: importId || '',
            immutable: true
        };
        data[VERSION_TABLE].unshift(version);
        data[VERSION_TABLE] = data[VERSION_TABLE].slice(0, 1000);
        return version;
    }

    function detectDelimiter(format, content) {
        if (format === 'TSV') return '\t';
        if (String(content || '').indexOf('\t') !== -1 && String(content || '').indexOf(',') === -1) return '\t';
        return ',';
    }

    function splitDelimitedLine(line, delimiter) {
        var values = [];
        var current = '';
        var quote = false;
        var i;
        for (i = 0; i < line.length; i += 1) {
            var ch = line.charAt(i);
            if (ch === '"' && line.charAt(i + 1) === '"') {
                current += '"';
                i += 1;
            } else if (ch === '"') {
                quote = !quote;
            } else if (ch === delimiter && !quote) {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current.trim());
        return values;
    }

    function parseDelimited(content, format) {
        var text = safeString(content, '').replace(/^\uFEFF/, '');
        var delimiter = detectDelimiter(format, text);
        var lines = text.split(/\r?\n/).filter(function keep(line) { return safeString(line, '') !== ''; });
        if (!lines.length) return { headers: [], rows: [] };
        var headers = splitDelimitedLine(lines[0], delimiter);
        var rows = lines.slice(1).map(function each(line) {
            var values = splitDelimitedLine(line, delimiter);
            var row = {};
            headers.forEach(function header(name, index) { row[name] = values[index] || ''; });
            return row;
        });
        return { headers: headers, rows: rows };
    }

    function detectFormat(fileName, input) {
        var lower = safeString(fileName || input && input.name || '', '').toLowerCase();
        if (/\.xlsx$|\.xlsm$|\.xls$/.test(lower) || input && (input.workbook || input.sheets)) return 'XLSX';
        if (/\.tsv$/.test(lower)) return 'TSV';
        return 'CSV';
    }

    function rowsFromWorkbook(input) {
        var workbook = input && (input.workbook || input.sheets);
        if (workbook && isPlainObject(workbook)) {
            var sheetName = safeString(input.sheetName || input.sheet || '', '');
            var keys = Object.keys(workbook);
            var selected = sheetName && workbook[sheetName] ? workbook[sheetName] : workbook[keys[0]];
            if (Array.isArray(selected)) return selected.map(function each(row) { return clone(row, 0); });
        }
        try {
            if (global.XLSX && input && input.arrayBuffer) {
                var parsed = global.XLSX.read(input.arrayBuffer, { type: 'array' });
                var first = input.sheetName || parsed.SheetNames[0];
                return global.XLSX.utils.sheet_to_json(parsed.Sheets[first], { defval: '' });
            }
        } catch (error) {
            safeWarn('Optional XLSX parsing failed safely.', error && error.message);
        }
        return null;
    }

    function parseImportSource(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var format = detectFormat(input && input.fileName, input || {});
            var rows = [];
            var headers = [];
            if (Array.isArray(input && input.rows)) {
                rows = clone(input.rows, 0);
                headers = rows[0] ? Object.keys(rows[0]) : [];
            } else if (format === 'XLSX') {
                rows = rowsFromWorkbook(input || {});
                if (!rows) return failureOutput('XLSX_PARSER_UNAVAILABLE', scope.tenantSlug, [issue('XLSX_PARSER_UNAVAILABLE', 'XLSX input requires a workbook object or optional XLSX parser.', 'HIGH')]);
                headers = rows[0] ? Object.keys(rows[0]) : [];
            } else {
                var parsed = parseDelimited(input && input.content || '', format);
                rows = parsed.rows;
                headers = parsed.headers;
            }
            return freezeImportOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                detectedFormat: format,
                headers: headers,
                rows: rows,
                rowCount: rows.length,
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('IMPORT_PARSE_FAILED', tenantFrom(input || {}, context || {}), [issue('IMPORT_PARSE_FAILED', 'Import source parsing failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function canonicalField(header) {
        var key = normalizeTextKey(header);
        var map = {
            recordtype: 'recordType',
            type: 'recordType',
            module: 'recordType',
            category: 'recordType',
            name: 'name',
            departmentname: 'name',
            deptname: 'name',
            branchname: 'name',
            locationname: 'name',
            divisionname: 'name',
            businessunit: 'name',
            businessunitname: 'name',
            costcenter: 'name',
            costcentername: 'name',
            profitcenter: 'name',
            profitcentername: 'name',
            code: 'code',
            departmentcode: 'code',
            deptcode: 'code',
            branchcode: 'code',
            locationcode: 'code',
            divisioncode: 'code',
            businessunitcode: 'code',
            costcode: 'code',
            costcentercode: 'code',
            profitcentercode: 'code',
            parent: 'parentCode',
            parentcode: 'parentCode',
            parentdepartment: 'parentCode',
            parentdepartmentcode: 'parentCode',
            country: 'country',
            state: 'state',
            province: 'state',
            city: 'city',
            postalcode: 'postalCode',
            pincode: 'postalCode',
            zip: 'postalCode',
            timezone: 'timezone',
            manager: 'manager',
            departmenthead: 'manager',
            description: 'description',
            child: 'childCode',
            childcode: 'childCode'
        };
        return map[key] || '';
    }

    function autoMapColumns(input, context) {
        try {
            var rows = Array.isArray(input && input.rows) ? input.rows : [];
            var headers = Array.isArray(input && input.headers) ? input.headers : (rows[0] ? Object.keys(rows[0]) : []);
            var mapping = {};
            headers.forEach(function each(header) {
                var field = canonicalField(header);
                if (field) mapping[header] = field;
            });
            return freezeImportOutput({
                success: true,
                mapping: mapping,
                mappedCount: Object.keys(mapping).length,
                unmappedColumns: headers.filter(function unmapped(header) { return !mapping[header]; }),
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('COLUMN_MAPPING_FAILED', tenantFrom(input || {}, context || {}), [issue('COLUMN_MAPPING_FAILED', 'Column mapping failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function canonicalRecordType(value, fallback) {
        var key = normalizeTextKey(value || fallback || 'department');
        var map = {
            branch: 'branches',
            branches: 'branches',
            headoffice: 'branches',
            regionaloffice: 'branches',
            warehouse: 'branches',
            factory: 'branches',
            remoteoffice: 'branches',
            location: 'locations',
            locations: 'locations',
            department: 'departments',
            departments: 'departments',
            dept: 'departments',
            division: 'divisions',
            divisions: 'divisions',
            businessunit: 'businessUnits',
            businessunits: 'businessUnits',
            unit: 'businessUnits',
            costcenter: 'costCenters',
            costcenters: 'costCenters',
            profitcenter: 'profitCenters',
            profitcenters: 'profitCenters',
            hierarchy: 'hierarchy',
            reportinghierarchy: 'hierarchy'
        };
        return map[key] || 'departments';
    }

    function fieldFromRow(row, mapping, field) {
        var found = '';
        Object.keys(mapping || {}).some(function each(header) {
            if (mapping[header] === field) {
                found = safeString(row[header], '');
                return true;
            }
            return false;
        });
        return found;
    }

    function normalizeImportRecords(rows, mapping, fallbackModule) {
        var records = {
            branches: [],
            locations: [],
            businessUnits: [],
            departments: [],
            divisions: [],
            costCenters: [],
            profitCenters: [],
            hierarchy: []
        };
        (Array.isArray(rows) ? rows : []).slice(0, 100000).forEach(function each(row, index) {
            var type = canonicalRecordType(fieldFromRow(row, mapping, 'recordType'), fallbackModule);
            var name = fieldFromRow(row, mapping, 'name');
            var code = normalizeCode(fieldFromRow(row, mapping, 'code') || name);
            var parentCode = normalizeCode(fieldFromRow(row, mapping, 'parentCode'));
            var item = {
                importRow: index + 1,
                type: type,
                name: name || code,
                code: code,
                parentCode: parentCode,
                country: fieldFromRow(row, mapping, 'country'),
                state: fieldFromRow(row, mapping, 'state'),
                city: fieldFromRow(row, mapping, 'city'),
                postalCode: fieldFromRow(row, mapping, 'postalCode'),
                timezone: fieldFromRow(row, mapping, 'timezone'),
                manager: fieldFromRow(row, mapping, 'manager'),
                description: fieldFromRow(row, mapping, 'description')
            };
            if (type === 'hierarchy') {
                records.hierarchy.push({
                    importRow: index + 1,
                    parent: parentCode || normalizeCode(fieldFromRow(row, mapping, 'parentCode')),
                    child: normalizeCode(fieldFromRow(row, mapping, 'childCode') || code),
                    name: name
                });
            } else if (records[type]) {
                records[type].push(item);
            }
        });
        return records;
    }

    function allNodeCodes(records) {
        var codes = {};
        ['businessUnits', 'divisions', 'departments', 'costCenters', 'profitCenters', 'locations', 'branches'].forEach(function each(category) {
            (records[category] || []).forEach(function row(item) { if (item.code) codes[item.code] = true; });
        });
        return codes;
    }

    function existingNodeCodes(config) {
        var codes = {};
        var structure = config.organizationStructure || {};
        ['businessUnits', 'divisions', 'departments', 'costCenters', 'profitCenters', 'locations'].forEach(function each(category) {
            (structure[category] || []).forEach(function row(item) { if (item.code) codes[normalizeCode(item.code)] = true; });
        });
        (config.addresses || []).forEach(function row(item) { if (item.code) codes[normalizeCode(item.code)] = true; });
        return codes;
    }

    function detectCycles(edges) {
        var graph = {};
        edges.forEach(function each(edge) {
            if (!edge.parent || !edge.child) return;
            if (!graph[edge.parent]) graph[edge.parent] = [];
            graph[edge.parent].push(edge.child);
        });
        var visiting = {};
        var visited = {};
        var cycle = [];
        function visit(node, path) {
            if (visiting[node]) {
                cycle = path.concat([node]);
                return true;
            }
            if (visited[node]) return false;
            visiting[node] = true;
            var children = graph[node] || [];
            var found = children.some(function child(next) { return visit(next, path.concat([node])); });
            delete visiting[node];
            visited[node] = true;
            return found;
        }
        Object.keys(graph).some(function each(node) { return visit(node, []); });
        return cycle;
    }

    function hierarchyEdges(records) {
        var edges = [];
        ['businessUnits', 'divisions', 'departments', 'costCenters', 'profitCenters', 'locations'].forEach(function each(category) {
            (records[category] || []).forEach(function row(item) {
                if (item.parentCode) edges.push({ parent: item.parentCode, child: item.code, category: category, row: item.importRow });
            });
        });
        (records.hierarchy || []).forEach(function each(edge) {
            if (edge.parent && edge.child) edges.push({ parent: edge.parent, child: edge.child, category: 'hierarchy', row: edge.importRow });
        });
        return edges;
    }

    function calculateDepth(edges) {
        var graph = {};
        edges.forEach(function each(edge) {
            if (!edge.parent || !edge.child) return;
            if (!graph[edge.parent]) graph[edge.parent] = [];
            graph[edge.parent].push(edge.child);
        });
        var max = 0;
        function walk(node, depth, seen) {
            max = Math.max(max, depth);
            if (seen[node]) return;
            var nextSeen = Object.assign({}, seen);
            nextSeen[node] = true;
            (graph[node] || []).forEach(function child(next) { walk(next, depth + 1, nextSeen); });
        }
        Object.keys(graph).forEach(function each(root) { walk(root, 1, {}); });
        return max;
    }

    function validateImportRows(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var rows = Array.isArray(input && input.rows) ? input.rows : [];
            var mapping = input && input.mapping || autoMapColumns({ rows: rows }, context || {}).mapping || {};
            var records = normalizeImportRecords(rows, mapping, input && input.defaultModule);
            var failures = [];
            var localCodes = {};
            var reserved = { ADMIN: true, ROOT: true, SYSTEM: true, NULL: true };
            CATEGORIES.forEach(function categoryEach(category) {
                (records[category] || []).forEach(function rowEach(row) {
                    if (category === 'hierarchy') return;
                    if (!row.name) failures.push(issue('IMPORT_NAME_REQUIRED', 'Name is required.', 'HIGH', { row: row.importRow, category: category }));
                    if (!row.code) failures.push(issue('IMPORT_CODE_REQUIRED', 'Code is required.', 'HIGH', { row: row.importRow, category: category }));
                    if (row.code && reserved[row.code]) failures.push(issue('RESERVED_IMPORT_CODE', 'Code uses a reserved keyword.', 'HIGH', { row: row.importRow, code: row.code }));
                    if (row.code && row.code.length > 40) failures.push(issue('IMPORT_CODE_TOO_LONG', 'Code must be 40 characters or fewer.', 'HIGH', { row: row.importRow, code: row.code }));
                    var key = category + ':' + row.code;
                    if (row.code && localCodes[key]) failures.push(issue('DUPLICATE_IMPORT_CODE', 'Duplicate code inside import file.', 'CRITICAL', { row: row.importRow, category: category, code: row.code }));
                    localCodes[key] = true;
                    if ((category === 'branches' || category === 'locations') && (!row.country || !row.state || !row.city || !row.postalCode || !row.timezone)) {
                        failures.push(issue('ADDRESS_FIELDS_REQUIRED', 'Branches and locations require country, state, city, postal code, and timezone.', 'HIGH', { row: row.importRow, category: category }));
                    }
                });
            });
            var data = rawData();
            ensureTables(data);
            var current = getActiveConfiguration(scope.tenantSlug, data);
            var known = Object.assign(existingNodeCodes(current), allNodeCodes(records));
            hierarchyEdges(records).forEach(function edgeEach(edge) {
                if (edge.parent && !known[edge.parent]) failures.push(issue('MISSING_PARENT', 'Parent code does not exist in import or current structure.', 'HIGH', { row: edge.row, parentCode: edge.parent }));
                if (edge.child && !known[edge.child]) failures.push(issue('MISSING_CHILD', 'Child code does not exist in import or current structure.', 'HIGH', { row: edge.row, childCode: edge.child }));
            });
            var cycle = detectCycles(hierarchyEdges(records));
            if (cycle.length) failures.push(issue('CIRCULAR_HIERARCHY', 'Circular hierarchy reference detected.', 'CRITICAL', { cycle: cycle }));
            return freezeImportOutput({
                success: failures.length === 0,
                tenantSlug: scope.tenantSlug,
                normalizedRecords: records,
                failures: failures,
                warnings: [],
                rowCount: rows.length,
                hierarchyDepth: calculateDepth(hierarchyEdges(records)),
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('IMPORT_VALIDATION_FAILED', tenantFrom(input || {}, context || {}), [issue('IMPORT_VALIDATION_FAILED', 'Import validation failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function detectConflicts(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var records = input && input.records || {};
            var data = rawData();
            ensureTables(data);
            var current = getActiveConfiguration(scope.tenantSlug, data);
            var conflicts = [];
            var structure = current.organizationStructure || {};
            ['businessUnits', 'divisions', 'departments', 'costCenters', 'profitCenters', 'locations'].forEach(function each(category) {
                var existing = {};
                (structure[category] || []).forEach(function row(item) { existing[normalizeCode(item.code)] = item; });
                (records[category] || []).forEach(function row(item) {
                    if (existing[item.code]) conflicts.push({ category: category, code: item.code, strategy: input && input.conflictStrategy || 'MERGE', existing: existing[item.code], incoming: item });
                });
            });
            var addresses = {};
            (current.addresses || []).forEach(function row(item) { addresses[normalizeCode(item.code || item.name)] = item; });
            (records.branches || []).forEach(function row(item) {
                if (addresses[item.code]) conflicts.push({ category: 'branches', code: item.code, strategy: input && input.conflictStrategy || 'MERGE', existing: addresses[item.code], incoming: item });
            });
            return freezeImportOutput({ success: true, tenantSlug: scope.tenantSlug, conflicts: conflicts, conflictCount: conflicts.length, timestamp: nowIso() });
        } catch (error) {
            return failureOutput('CONFLICT_DETECTION_FAILED', tenantFrom(input || {}, context || {}), [issue('CONFLICT_DETECTION_FAILED', 'Conflict detection failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function rowForStructure(item) {
        return {
            name: item.name,
            code: item.code,
            parentCode: item.parentCode || '',
            manager: item.manager || '',
            description: item.description || ''
        };
    }

    function rowForAddress(item, type) {
        return {
            type: type || 'BRANCH',
            name: item.name,
            code: item.code,
            country: item.country || '',
            state: item.state || '',
            city: item.city || '',
            postalCode: item.postalCode || '',
            timezone: item.timezone || '',
            gps: item.gps || ''
        };
    }

    function upsertRows(existingRows, incomingRows, strategy) {
        var rows = Array.isArray(existingRows) ? clone(existingRows, 0) : [];
        var index = {};
        rows.forEach(function each(row, idx) { index[normalizeCode(row.code || row.name)] = idx; });
        incomingRows.forEach(function each(item) {
            var key = normalizeCode(item.code || item.name);
            if (!key) return;
            if (index[key] !== undefined) {
                if (strategy === 'SKIP') return;
                if (strategy === 'RENAME') {
                    var renamed = clone(item, 0);
                    renamed.code = key + '_' + String(Date.now()).slice(-5);
                    rows.push(renamed);
                    index[renamed.code] = rows.length - 1;
                    return;
                }
                rows[index[key]] = Object.assign({}, rows[index[key]], item);
            } else {
                rows.push(item);
                index[key] = rows.length - 1;
            }
        });
        return rows;
    }

    function uniqueHierarchy(existingRows, incomingRows) {
        var seen = {};
        var out = [];
        (Array.isArray(existingRows) ? existingRows : []).concat(incomingRows || []).forEach(function each(edge) {
            var parent = normalizeCode(edge.parent || edge.parentCode);
            var child = normalizeCode(edge.child || edge.childCode || edge.code);
            if (!parent || !child) return;
            var key = parent + '>' + child;
            if (seen[key]) return;
            seen[key] = true;
            out.push({ parent: parent, child: child });
        });
        return out;
    }

    function applyRecordsToConfiguration(current, records, conflictStrategy) {
        var strategy = normalizeCode(conflictStrategy || 'MERGE');
        var next = clone(current, 0);
        var structure = Object.assign({
            businessUnits: [],
            departments: [],
            divisions: [],
            costCenters: [],
            profitCenters: [],
            legalEntities: [],
            locations: [],
            hierarchy: []
        }, next.organizationStructure || {});
        structure.businessUnits = upsertRows(structure.businessUnits, (records.businessUnits || []).map(rowForStructure), strategy);
        structure.divisions = upsertRows(structure.divisions, (records.divisions || []).map(rowForStructure), strategy);
        structure.departments = upsertRows(structure.departments, (records.departments || []).map(rowForStructure), strategy);
        structure.costCenters = upsertRows(structure.costCenters, (records.costCenters || []).map(rowForStructure), strategy);
        structure.profitCenters = upsertRows(structure.profitCenters, (records.profitCenters || []).map(rowForStructure), strategy);
        structure.locations = upsertRows(structure.locations, (records.locations || []).map(rowForStructure), strategy);
        var hierarchyFromParents = hierarchyEdges(records).map(function edge(row) { return { parent: row.parent, child: row.child }; });
        structure.hierarchy = uniqueHierarchy(structure.hierarchy, hierarchyFromParents);
        next.organizationStructure = structure;
        next.addresses = upsertRows(next.addresses || [], (records.branches || []).map(function each(row) { return rowForAddress(row, /HEAD/i.test(row.name || '') ? 'HEAD_OFFICE' : 'BRANCH'); }), strategy);
        next.updatedAt = nowIso();
        return next;
    }

    function buildHierarchyPreview(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'VIEW');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var records = input && input.records || {};
            var edges = hierarchyEdges(records);
            var nodes = [];
            var seen = {};
            ['businessUnits', 'divisions', 'departments', 'costCenters', 'profitCenters', 'locations', 'branches'].forEach(function each(category) {
                (records[category] || []).forEach(function row(item) {
                    if (seen[item.code]) return;
                    seen[item.code] = true;
                    nodes.push({ code: item.code, name: item.name, category: category, parentCode: item.parentCode || '' });
                });
            });
            return freezeImportOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                nodes: nodes,
                edges: edges,
                hierarchyDepth: calculateDepth(edges),
                visualPreview: nodes.map(function each(node) { return { id: node.code, label: node.name, parent: node.parentCode, category: node.category }; }),
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('HIERARCHY_BUILD_FAILED', tenantFrom(input || {}, context || {}), [issue('HIERARCHY_BUILD_FAILED', 'Hierarchy preview failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function pipeline(input, context) {
        var parsed = parseImportSource(input || {}, context || {});
        if (!parsed.success) return parsed;
        var mapped = autoMapColumns({ rows: parsed.rows, headers: parsed.headers }, context || {});
        if (!mapped.success) return mapped;
        var validation = validateImportRows({ tenantSlug: parsed.tenantSlug, rows: parsed.rows, mapping: mapped.mapping, defaultModule: input && input.defaultModule }, context || {});
        if (!validation.success) return validation;
        var conflicts = detectConflicts({ tenantSlug: parsed.tenantSlug, records: validation.normalizedRecords, conflictStrategy: input && input.conflictStrategy || 'MERGE' }, context || {});
        if (!conflicts.success) return conflicts;
        var hierarchy = buildHierarchyPreview({ tenantSlug: parsed.tenantSlug, records: validation.normalizedRecords }, context || {});
        return {
            parsed: parsed,
            mapped: mapped,
            validation: validation,
            conflicts: conflicts,
            hierarchy: hierarchy
        };
    }

    function countRecords(records) {
        return CATEGORIES.reduce(function sum(total, category) { return total + ((records[category] || []).length); }, 0);
    }

    function dryRunImport(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var result = pipeline(Object.assign({}, input || {}, { tenantSlug: scope.tenantSlug }), context || {});
            if (!result.validation) return result;
            var data = rawData();
            ensureTables(data);
            var current = getActiveConfiguration(scope.tenantSlug, data);
            var proposed = applyRecordsToConfiguration(current, result.validation.normalizedRecords, input && input.conflictStrategy || 'MERGE');
            return freezeImportOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                transactional: true,
                reversible: true,
                dryRun: true,
                parsed: result.parsed,
                mapping: result.mapped.mapping,
                validation: result.validation,
                conflicts: result.conflicts.conflicts,
                hierarchy: result.hierarchy,
                proposedConfiguration: proposed,
                summary: {
                    importedRecords: countRecords(result.validation.normalizedRecords),
                    validationErrors: 0,
                    duplicateRecords: result.conflicts.conflictCount,
                    hierarchyDepth: result.hierarchy.hierarchyDepth,
                    rollbackAvailable: true
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('DRY_RUN_FAILED', tenantFrom(input || {}, context || {}), [issue('DRY_RUN_FAILED', 'Dry run failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function nextImportId(data, tenantSlug) {
        var count = data[IMPORT_JOB_TABLE].filter(function same(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }).length + 1;
        return 'OIMP-' + tenantSlug + '-' + String(count).padStart(4, '0');
    }

    function commitImport(input, context) {
        try {
            var started = Date.now();
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var prepared = dryRunImport(Object.assign({}, input || {}, { tenantSlug: scope.tenantSlug }), context || {});
            if (!prepared.success) return prepared;
            var data = rawData();
            ensureTables(data);
            var before = getActiveConfiguration(scope.tenantSlug, data);
            var beforeSnapshot = clone(data[CONFIG_TABLE][scope.tenantSlug] || before, 0);
            var after = clone(prepared.proposedConfiguration, 0);
            var importId = nextImportId(data, scope.tenantSlug);
            var transactionId = 'OITX-' + scope.tenantSlug + '-' + Date.now();
            after.updatedAt = nowIso();
            after.updatedBy = scope.actor.id || scope.actor.email || '';
            data[CONFIG_TABLE][scope.tenantSlug] = clone(after, 0);
            if (normalizeTenant(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId)) === scope.tenantSlug) {
                data.companySettings = Object.assign({}, data.companySettings || {}, { addresses: clone(after.addresses || [], 0) });
            }
            var version = writeConfigurationVersion(data, scope.tenantSlug, beforeSnapshot, after, input && input.reason || 'Organization import committed.', context || {}, importId, '');
            var summary = {
                importedRecords: prepared.summary.importedRecords,
                validationErrors: 0,
                duplicateRecords: prepared.summary.duplicateRecords,
                importDurationMs: Math.max(1, Date.now() - started),
                rollbackAvailable: true,
                hierarchyDepth: prepared.summary.hierarchyDepth
            };
            var transaction = {
                transactionId: transactionId,
                importId: importId,
                tenantSlug: scope.tenantSlug,
                fileName: safeString(input && input.fileName, ''),
                status: 'COMMITTED',
                beforeSnapshot: clone(beforeSnapshot, 0),
                afterSnapshot: clone(after, 0),
                summary: clone(summary, 0),
                versionId: version.versionId,
                createdAt: nowIso(),
                createdBy: scope.actor.id || scope.actor.email || '',
                rolledBack: false,
                immutable: true
            };
            data[IMPORT_TX_TABLE].unshift(transaction);
            data[IMPORT_TX_TABLE] = data[IMPORT_TX_TABLE].slice(0, 500);
            data[IMPORT_JOB_TABLE].unshift({
                importId: importId,
                transactionId: transactionId,
                tenantSlug: scope.tenantSlug,
                fileName: safeString(input && input.fileName, ''),
                status: 'COMMITTED',
                conflictStrategy: normalizeCode(input && input.conflictStrategy || 'MERGE'),
                summary: clone(summary, 0),
                createdAt: transaction.createdAt,
                createdBy: transaction.createdBy,
                immutable: true
            });
            data[IMPORT_JOB_TABLE] = data[IMPORT_JOB_TABLE].slice(0, 500);
            data[ANALYTICS_TABLE].unshift({ tenantSlug: scope.tenantSlug, importId: importId, eventType: 'IMPORT_COMMITTED', summary: clone(summary, 0), timestamp: nowIso(), immutable: true });
            data[ANALYTICS_TABLE] = data[ANALYTICS_TABLE].slice(0, 1000);
            audit(data, 'ORGANIZATION_IMPORT_COMMITTED', scope.tenantSlug, { importId: importId, transactionId: transactionId, fileName: input && input.fileName, reason: input && input.reason }, context || {});
            saveData(data);
            return freezeImportOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                importId: importId,
                transactionId: transactionId,
                transactional: true,
                reversible: true,
                configuration: after,
                transaction: transaction,
                version: version,
                summary: summary,
                governance: {
                    tenantIsolationPreserved: true,
                    backwardCompatible: true,
                    hrWorkflowsModified: false,
                    audited: true,
                    versioned: true,
                    transactional: true,
                    reversible: true
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('IMPORT_COMMIT_FAILED', tenantFrom(input || {}, context || {}), [issue('IMPORT_COMMIT_FAILED', 'Import commit failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function rollbackImport(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'MANAGE');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var importId = safeString(input && input.importId, '');
            var transaction = data[IMPORT_TX_TABLE].find(function find(row) {
                return row.importId === importId && normalizeTenant(row.tenantSlug) === scope.tenantSlug;
            });
            if (!transaction) return failureOutput('IMPORT_TRANSACTION_NOT_FOUND', scope.tenantSlug, [issue('IMPORT_TRANSACTION_NOT_FOUND', 'Import transaction was not found for rollback.', 'HIGH')]);
            if (transaction.rolledBack) return failureOutput('IMPORT_ALREADY_ROLLED_BACK', scope.tenantSlug, [issue('IMPORT_ALREADY_ROLLED_BACK', 'Import transaction has already been rolled back.', 'HIGH')]);
            var current = getActiveConfiguration(scope.tenantSlug, data);
            var restored = clone(transaction.beforeSnapshot, 0);
            data[CONFIG_TABLE][scope.tenantSlug] = clone(restored, 0);
            if (normalizeTenant(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId)) === scope.tenantSlug) {
                data.companySettings = Object.assign({}, data.companySettings || {}, { addresses: clone(restored.addresses || [], 0) });
            }
            transaction.rolledBack = true;
            transaction.rollbackAt = nowIso();
            transaction.rollbackBy = scope.actor.id || scope.actor.email || '';
            transaction.rollbackReason = safeString(input && input.reason, 'Organization import rollback.');
            var version = writeConfigurationVersion(data, scope.tenantSlug, current, restored, transaction.rollbackReason, context || {}, importId, transaction.versionId || importId);
            data[ANALYTICS_TABLE].unshift({ tenantSlug: scope.tenantSlug, importId: importId, eventType: 'IMPORT_ROLLED_BACK', timestamp: nowIso(), immutable: true });
            data[ANALYTICS_TABLE] = data[ANALYTICS_TABLE].slice(0, 1000);
            audit(data, 'ORGANIZATION_IMPORT_ROLLED_BACK', scope.tenantSlug, { importId: importId, transactionId: transaction.transactionId, reason: transaction.rollbackReason }, context || {});
            saveData(data);
            return freezeImportOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                importId: importId,
                transactionId: transaction.transactionId,
                configuration: restored,
                transaction: transaction,
                version: version,
                transactional: true,
                reversible: true,
                summary: { rollbackCompleted: true, restoredRecords: countRecords({ branches: restored.addresses || [], locations: restored.organizationStructure && restored.organizationStructure.locations || [], departments: restored.organizationStructure && restored.organizationStructure.departments || [] }) },
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('IMPORT_ROLLBACK_FAILED', tenantFrom(input || {}, context || {}), [issue('IMPORT_ROLLBACK_FAILED', 'Import rollback failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function generateImportTemplate(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'VIEW');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var module = canonicalRecordType(input && input.module || 'departments');
            var previousVersions = data[TEMPLATE_TABLE].filter(function same(row) {
                return normalizeTenant(row.tenantSlug) === scope.tenantSlug && row.module === module;
            });
            var template = {
                templateId: 'OITPL-' + scope.tenantSlug + '-' + module + '-' + String(previousVersions.length + 1).padStart(3, '0'),
                tenantSlug: scope.tenantSlug,
                module: module,
                version: previousVersions.length + 1,
                requiredFields: REQUIRED_TEMPLATE_FIELDS.slice(),
                optionalFields: OPTIONAL_TEMPLATE_FIELDS.slice(),
                validationRules: [
                    'Codes must be unique inside each module.',
                    'Parent Code must exist in the file or current organization structure.',
                    'Branches and locations require country, state, city, postal code, and timezone.',
                    'Circular hierarchy references are blocked.'
                ],
                examples: [
                    { 'Record Type': 'Department', Name: 'Engineering', Code: 'ENG', 'Parent Code': 'IN-OPS' },
                    { 'Record Type': 'Branch', Name: 'Pune Branch', Code: 'PUN-BR', Country: 'India', State: 'Maharashtra', City: 'Pune', 'Postal Code': '411001', Timezone: 'Asia/Kolkata' }
                ],
                instructions: 'Upload CSV, TSV, or XLSX workbook rows. Dry run before commit.',
                createdAt: nowIso(),
                immutable: true
            };
            data[TEMPLATE_TABLE].unshift(template);
            data[TEMPLATE_TABLE] = data[TEMPLATE_TABLE].slice(0, 200);
            audit(data, 'ORGANIZATION_IMPORT_TEMPLATE_GENERATED', scope.tenantSlug, { templateId: template.templateId, module: module }, context || {});
            saveData(data);
            return freezeImportOutput({ success: true, tenantSlug: scope.tenantSlug, template: template, timestamp: nowIso() });
        } catch (error) {
            return failureOutput('TEMPLATE_GENERATION_FAILED', tenantFrom(input || {}, context || {}), [issue('TEMPLATE_GENERATION_FAILED', 'Template generation failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function calculateImportAnalytics(input, context) {
        try {
            var scope = validateAccess(input || {}, context || {}, 'VIEW');
            if (!scope.allowed) return failureOutput('ACCESS_BLOCKED', scope.tenantSlug, scope.failures);
            var data = rawData();
            ensureTables(data);
            var jobs = data[IMPORT_JOB_TABLE].filter(function same(row) { return normalizeTenant(row.tenantSlug) === scope.tenantSlug; });
            var tx = data[IMPORT_TX_TABLE].filter(function same(row) { return normalizeTenant(row.tenantSlug) === scope.tenantSlug; });
            var imported = jobs.reduce(function sum(total, row) { return total + Number(row.summary && row.summary.importedRecords || 0); }, 0);
            var validationErrors = jobs.reduce(function sum(total, row) { return total + Number(row.summary && row.summary.validationErrors || 0); }, 0);
            var duplicates = jobs.reduce(function sum(total, row) { return total + Number(row.summary && row.summary.duplicateRecords || 0); }, 0);
            var rollbacks = tx.filter(function rolled(row) { return !!row.rolledBack; }).length;
            var maxDepth = tx.reduce(function max(total, row) { return Math.max(total, Number(row.summary && row.summary.hierarchyDepth || 0)); }, 0);
            var quality = Math.max(0, Math.min(100, Math.round(100 - validationErrors * 8 - duplicates * 2 - rollbacks * 4)));
            var integrity = Math.max(0, Math.min(100, Math.round(80 + Math.min(20, maxDepth * 4) - rollbacks * 5)));
            return freezeImportOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                importedRecords: imported,
                validationErrors: validationErrors,
                duplicateRecords: duplicates,
                rollbackEvents: rollbacks,
                hierarchyDepth: maxDepth,
                importQualityScore: quality,
                organizationIntegrityScore: integrity,
                timestamp: nowIso()
            });
        } catch (error) {
            return failureOutput('IMPORT_ANALYTICS_FAILED', tenantFrom(input || {}, context || {}), [issue('IMPORT_ANALYTICS_FAILED', 'Import analytics failed safely.', 'HIGH', { error: error && error.message })]);
        }
    }

    function getImportCenter(input, context) {
        var analytics = calculateImportAnalytics(input || {}, context || {});
        if (!analytics.success) return analytics;
        var data = rawData();
        ensureTables(data);
        var tenantSlug = analytics.tenantSlug;
        return freezeImportOutput({
            success: true,
            tenantSlug: tenantSlug,
            jobs: data[IMPORT_JOB_TABLE].filter(function same(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }),
            transactions: data[IMPORT_TX_TABLE].filter(function same(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }),
            templates: data[TEMPLATE_TABLE].filter(function same(row) { return normalizeTenant(row.tenantSlug) === tenantSlug; }),
            analytics: analytics,
            configuration: getActiveConfiguration(tenantSlug, data),
            timestamp: nowIso()
        });
    }

    function createImportJob(input, context) {
        return dryRunImport(input, context);
    }

    var OrganizationImportServiceHelper = Object.freeze({
        createImportJob: createImportJob,
        parseImportSource: parseImportSource,
        dryRunImport: dryRunImport,
        commitImport: commitImport
    });
    var HierarchyBuilder = Object.freeze({ buildHierarchyPreview: buildHierarchyPreview });
    var ImportValidator = Object.freeze({ validateImportRows: validateImportRows });
    var ColumnMapper = Object.freeze({ autoMapColumns: autoMapColumns });
    var ConflictResolver = Object.freeze({ detectConflicts: detectConflicts });
    var RollbackService = Object.freeze({ rollbackImport: rollbackImport });
    var ImportAnalyticsService = Object.freeze({ calculateImportAnalytics: calculateImportAnalytics });

    var service = Object.freeze({
        CATEGORIES: CATEGORIES,
        OrganizationImportService: OrganizationImportServiceHelper,
        HierarchyBuilder: HierarchyBuilder,
        ImportValidator: ImportValidator,
        ColumnMapper: ColumnMapper,
        ConflictResolver: ConflictResolver,
        RollbackService: RollbackService,
        ImportAnalyticsService: ImportAnalyticsService,
        generateImportTemplate: generateImportTemplate,
        parseImportSource: parseImportSource,
        createImportJob: createImportJob,
        autoMapColumns: autoMapColumns,
        validateImportRows: validateImportRows,
        buildHierarchyPreview: buildHierarchyPreview,
        detectConflicts: detectConflicts,
        dryRunImport: dryRunImport,
        commitImport: commitImport,
        rollbackImport: rollbackImport,
        calculateImportAnalytics: calculateImportAnalytics,
        getImportCenter: getImportCenter,
        freezeImportOutput: freezeImportOutput
    });

    global.OrganizationImportService = service;
    global.organizationImportService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            var sampleContext = { tenantSlug: 'self-test', actor: { role: 'SUPER_ADMIN', tenantSlug: 'self-test', id: 'SELF' } };
            var parsed = parseImportSource({ tenantSlug: 'self-test', fileName: 'sample.csv', content: 'Record Type,Name,Code\nDepartment,People,PEOPLE' }, sampleContext);
            record('upload parsing works', parsed.success === true && parsed.rows.length === 1, parsed);
            var mapped = autoMapColumns({ rows: parsed.rows }, sampleContext);
            record('mapping works', mapped.success === true && mapped.mapping.Name === 'name', mapped);
            var validation = validateImportRows({ tenantSlug: 'self-test', rows: parsed.rows, mapping: mapped.mapping }, sampleContext);
            record('validation works', validation.success === true, validation);
            var hierarchy = buildHierarchyPreview({ tenantSlug: 'self-test', records: validation.normalizedRecords }, sampleContext);
            record('hierarchy generation works', hierarchy.success === true, hierarchy);
            var blocked = parseImportSource({ tenantSlug: 'self-test', fileName: 'sample.csv', content: '' }, { tenantSlug: 'other', actor: { role: 'HR', tenantSlug: 'other', id: 'HR' } });
            record('tenant isolation preserved', blocked.success === false && blocked.failures.some(function find(row) { return row.code === 'CROSS_TENANT_IMPORT_BLOCKED'; }), blocked);
            var frozen = freezeImportOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
            global.__ARTHHRMS_ORGANIZATION_IMPORT_SELF_TEST__ = Object.freeze({
                passed: checks.every(function ok(row) { return row.passed; }),
                tests: Object.freeze(checks.slice())
            });
        } catch (error) {
            global.__ARTHHRMS_ORGANIZATION_IMPORT_SELF_TEST__ = Object.freeze({
                passed: false,
                tests: Object.freeze([Object.freeze({ name: 'self-test runtime safety', passed: false, details: error && error.message || String(error) })])
            });
        }
    }

    if (!db()) safeWarn('Optional DB dependency not detected. Import persistence will degrade safely.');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
