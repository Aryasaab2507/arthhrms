// Company Owner master-data adapter for the durable onboarding workspace.
(function attachCompanySetupMasterDataService(global) {
    'use strict';

    var MASTER_TYPES = Object.freeze([
        'industry', 'department', 'business_unit', 'branch', 'designation', 'attendance_policy',
        'shift', 'holiday_calendar', 'leave_type', 'approval_workflow',
        'payroll_template', 'salary_component', 'notification_provider'
    ]);
    var ROLE_OPTIONS = Object.freeze(['admin', 'hr', 'hr_head', 'manager', 'director', 'employee']);
    var defaults = Object.freeze({
        industry: rows(['Manufacturing|MANUFACTURING', 'Technology|TECHNOLOGY', 'Retail|RETAIL', 'Professional Services|SERVICES', 'Healthcare|HEALTHCARE', 'Financial Services|FINANCIAL', 'Education|EDUCATION', 'Logistics|LOGISTICS']),
        department: rows(['Human Resources|HR', 'Finance|FIN', 'Accounts|ACC', 'Operations|OPS', 'Sales|SALES', 'Marketing|MKT', 'Engineering|ENG', 'IT|IT', 'Legal|LEGAL', 'Support|SUP', 'Administration|ADMIN']),
        business_unit: rows(['Corporate|CORP', 'Manufacturing|MFG', 'Retail|RTL', 'Technology|TECH', 'Services|SVC']),
        branch: rows(['Head Office|HQ', 'Regional Office|REG', 'Branch Office|BR']),
        designation: rows(['CEO|CEO', 'Director|DIR', 'HR Head|HR-H', 'HR Manager|HR-MGR', 'Manager|MGR', 'Team Lead|TL', 'Executive|EXEC', 'Associate|ASSOC', 'Intern|INTERN']),
        attendance_policy: rows(['Biometric|BIOMETRIC', 'Web|WEB', 'Mobile|MOBILE', 'Face Recognition|FACE', 'RFID|RFID', 'GPS Attendance|GPS']),
        shift: rows(['General|GENERAL', 'Morning|MORNING', 'Evening|EVENING', 'Night|NIGHT', 'Rotational|ROTATIONAL', 'Flexible|FLEXIBLE']),
        holiday_calendar: rows(['India National Holidays|IN-NATIONAL', 'Delhi Holidays|IN-DL', 'Maharashtra Holidays|IN-MH', 'Karnataka Holidays|IN-KA', 'Tamil Nadu Holidays|IN-TN', 'Company Custom Calendar|CUSTOM']),
        leave_type: [
            item('Casual Leave', 'CL', { annualAllowance: 12 }),
            item('Sick Leave', 'SL', { annualAllowance: 10 }),
            item('Earned Leave', 'EL', { annualAllowance: 15 }),
            item('Comp Off', 'CO', { annualAllowance: 0 }),
            item('Maternity Leave', 'ML', { annualAllowance: 0 }),
            item('Paternity Leave', 'PL', { annualAllowance: 0 }),
            item('Bereavement Leave', 'BL', { annualAllowance: 0 }),
            item('Leave Without Pay', 'LOP', { annualAllowance: 0 })
        ],
        approval_workflow: [
            item('Manager approval', 'MANAGER', { approvers: ['MANAGER'] }),
            item('Manager then HR', 'MANAGER-HR', { approvers: ['MANAGER', 'HR'] }),
            item('Manager, HR, Director', 'MANAGER-HR-DIRECTOR', { approvers: ['MANAGER', 'HR', 'DIRECTOR'] })
        ],
        payroll_template: rows(['Corporate|CORPORATE', 'Manufacturing|MANUFACTURING', 'Retail|RETAIL', 'Custom|CUSTOM']),
        salary_component: [
            item('Basic Salary', 'BASIC', { type: 'EARNING' }),
            item('House Rent Allowance', 'HRA', { type: 'EARNING' }),
            item('Special Allowance', 'SPECIAL', { type: 'EARNING' }),
            item('Provident Fund', 'PF', { type: 'DEDUCTION' }),
            item('Income Tax', 'TAX', { type: 'DEDUCTION' })
        ],
        notification_provider: [
            item('ArthHRMS Email', 'EMAIL-DEFAULT', { channel: 'EMAIL' }),
            item('ArthHRMS SMS', 'SMS-DEFAULT', { channel: 'SMS' }),
            item('ArthHRMS WhatsApp', 'WHATSAPP-DEFAULT', { channel: 'WHATSAPP' }),
            item('Browser Push', 'PUSH-DEFAULT', { channel: 'PUSH' })
        ]
    });
    var cache = { catalog: {}, employees: [], invitations: [], loaded: false, loading: null };

    function slug(value) {
        return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    }

    function item(name, code, extra) {
        return Object.freeze(Object.assign({
            id: String(code || slug(name)).toLowerCase(),
            name: String(name || '').trim(),
            code: slug(code || name),
            status: 'ACTIVE',
            source: 'default'
        }, extra || {}));
    }

    function rows(values) {
        return values.map(function mapRow(value) {
            var parts = String(value).split('|');
            return item(parts[0], parts[1]);
        });
    }

    function normalizeRole(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function currentActor() {
        return global.authService?.getCurrentUser?.() || {};
    }

    function requireOwner() {
        var actor = currentActor();
        if (
            actor.source !== 'supabase'
            || actor.roleTrusted !== true
            || normalizeRole(actor.role) !== 'super_admin'
            || actor.companyOwner !== true
            || !actor.id
            || !actor.tenantSlug
            || !actor.organizationId
        ) {
            throw new Error('A trusted Company Owner session is required for tenant master data.');
        }
        return actor;
    }

    function client() {
        return global.supabaseClientService?.getClient?.() || null;
    }

    function operationId(prefix) {
        var id = '';
        try { id = global.crypto?.randomUUID?.() || ''; } catch (_error) {}
        if (!id) id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        return String(prefix || 'setup-master') + ':' + id;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value == null ? null : value));
    }

    function normalizeRecord(row, source) {
        var input = row && typeof row === 'object' ? row : {};
        var name = String(input.name || input.policyName || input.title || '').trim();
        var code = slug(input.code || input.policyCode || input.id || name);
        if (!name || !code) return null;
        return Object.assign({}, input, {
            id: String(input.id || code).trim(),
            name: name,
            code: code,
            source: input.source || source || 'tenant'
        });
    }

    function mergeRows(type, persisted) {
        var result = [];
        var seen = new Set();
        [].concat(defaults[type] || [], Array.isArray(persisted) ? persisted : []).forEach(function add(row) {
            var normalized = normalizeRecord(row, 'tenant');
            if (!normalized) return;
            var key = normalized.code.toLowerCase();
            if (seen.has(key)) {
                var index = result.findIndex(function find(existing) { return existing.code.toLowerCase() === key; });
                if (index >= 0 && normalized.source !== 'default') result[index] = normalized;
                return;
            }
            seen.add(key);
            result.push(normalized);
        });
        return result.sort(function sort(left, right) { return left.name.localeCompare(right.name); });
    }

    function rebuildCatalog(source) {
        var next = {};
        MASTER_TYPES.forEach(function each(type) {
            next[type] = mergeRows(type, source?.[type]);
        });
        cache.catalog = next;
    }

    async function load(options) {
        requireOwner();
        if (cache.loaded && !options?.force) return snapshot();
        if (cache.loading) return cache.loading;
        var supabase = client();
        if (!supabase?.rpc) throw new Error('Supabase tenant master data is not configured.');
        cache.loading = (async function loadReferenceData() {
            var response = await supabase.rpc('arth_get_company_setup_reference_data');
            if (response.error) throw response.error;
            if (!response.data?.ok) throw new Error('Tenant master data was not returned.');
            rebuildCatalog(response.data.catalog || {});
            cache.employees = Array.isArray(response.data.employees) ? response.data.employees : [];
            cache.invitations = Array.isArray(response.data.invitations) ? response.data.invitations : [];
            cache.loaded = true;
            global.dispatchEvent?.(new CustomEvent('arthhrms:setup-master-data-ready', { detail: snapshot() }));
            return snapshot();
        }()).finally(function clearLoading() { cache.loading = null; });
        return cache.loading;
    }

    async function add(type, payload) {
        requireOwner();
        var normalizedType = String(type || '').trim().toLowerCase();
        if (!MASTER_TYPES.includes(normalizedType)) throw new Error('This master-data type is not supported.');
        var name = String(payload?.name || '').trim();
        var code = slug(payload?.code || name);
        if (!name) throw new Error('Name is required.');
        if (name.length > 160 || code.length < 2) throw new Error('Enter a valid name and code.');
        var supabase = client();
        if (!supabase?.rpc) throw new Error('Supabase tenant master data is not configured.');
        var response = await supabase.rpc('arth_upsert_company_setup_master_data', {
            p_master_type: normalizedType,
            p_payload: Object.assign({}, payload || {}, { name: name, code: code }),
            p_idempotency_key: operationId('setup-master')
        });
        if (response.error) throw response.error;
        if (!response.data?.ok || !response.data?.record) throw new Error('Master data was not saved.');
        var record = normalizeRecord(response.data.record, 'tenant');
        cache.catalog[normalizedType] = mergeRows(normalizedType, [].concat(
            (cache.catalog[normalizedType] || []).filter(function keep(row) {
                return row.code.toLowerCase() !== record.code.toLowerCase();
            }),
            record
        ));
        global.dispatchEvent?.(new CustomEvent('arthhrms:setup-master-data-changed', {
            detail: { type: normalizedType, record: clone(record) }
        }));
        return clone(record);
    }

    function list(type, options) {
        var channel = String(options?.channel || '').trim().toUpperCase();
        return clone((cache.catalog[String(type || '').trim().toLowerCase()] || []).filter(function filter(row) {
            return !channel || !row.channel || String(row.channel).toUpperCase() === channel;
        }));
    }

    function searchEmployees(query) {
        requireOwner();
        var term = String(query || '').trim().toLowerCase();
        return clone(cache.employees.filter(function filter(row) {
            return !row.authUserId && (!term || [row.id, row.name, row.email, row.department].some(function includes(value) {
                return String(value || '').toLowerCase().includes(term);
            }));
        }).slice(0, 25));
    }

    async function inviteEmployee(input) {
        var actor = requireOwner();
        var employeeId = String(input?.employeeId || '').trim();
        var employee = cache.employees.find(function find(row) { return String(row.id) === employeeId; });
        if (!employee) throw new Error('Select an existing tenant employee before sending an invitation.');
        var role = normalizeRole(input?.role || employee.role || 'employee');
        if (!ROLE_OPTIONS.includes(role)) throw new Error('Select an assignable tenant role.');
        if (!global.authInviteService?.sendDurableInvite) throw new Error('The Supabase invitation service is unavailable.');
        var result = await global.authInviteService.sendDurableInvite({
            empId: employee.id,
            email: employee.email,
            name: employee.name,
            role: role,
            tenantId: actor.tenantSlug,
            companyId: actor.organizationId,
            invitedBy: actor.id,
            invitedByRole: actor.role
        });
        if (!result?.ok) throw new Error(result?.error || (result?.errors || []).join(' ') || 'Invitation could not be sent.');
        await load({ force: true });
        return result;
    }

    async function resendInvitation(inviteId) {
        requireOwner();
        if (!global.authInviteService?.resendDurableInvite) throw new Error('Invitation resend is unavailable.');
        var result = await global.authInviteService.resendDurableInvite(inviteId);
        if (!result?.ok) throw new Error(result?.error || 'Invitation could not be resent.');
        await load({ force: true });
        return result;
    }

    async function cancelInvitation(inviteId) {
        requireOwner();
        if (!global.authInviteService?.cancelDurableInvite) throw new Error('Invitation cancellation is unavailable.');
        var result = await global.authInviteService.cancelDurableInvite(inviteId);
        if (!result?.ok) throw new Error(result?.error || 'Invitation could not be cancelled.');
        await load({ force: true });
        return result;
    }

    function snapshot() {
        return clone({
            catalog: cache.catalog,
            employees: cache.employees,
            invitations: cache.invitations,
            loaded: cache.loaded
        });
    }

    rebuildCatalog({});

    var service = Object.freeze({
        MASTER_TYPES: MASTER_TYPES,
        ROLE_OPTIONS: ROLE_OPTIONS,
        load: load,
        list: list,
        add: add,
        searchEmployees: searchEmployees,
        inviteEmployee: inviteEmployee,
        resendInvitation: resendInvitation,
        cancelInvitation: cancelInvitation,
        snapshot: snapshot
    });

    global.CompanySetupMasterDataService = service;
    global.companySetupMasterDataService = service;
}(typeof window !== 'undefined' ? window : globalThis));
