// Employee service adapter.
// The synchronous facade is hydrated from and durably persisted to authenticated Supabase storage.
(function (global) {
    function db() { return global.DB; }
    let supabaseEmployeeCache = null;

    function localEmployees() {
        return db().EmployeeService?.list ? db().EmployeeService.list() : db().getEmployees();
    }

    function localEmployee(empId) {
        return db().EmployeeService?.get ? db().EmployeeService.get(empId) : db().getEmployee(empId);
    }

    function localCreate(payload) {
        return db().EmployeeService?.create ? db().EmployeeService.create(payload) : db().addEmployee(payload);
    }

    function localUpdate(empId, fields) {
        return db().EmployeeService?.update ? db().EmployeeService.update(empId, fields) : db().updateEmployee(empId, fields);
    }

    function supabaseReady() {
        const svc = global.supabaseClientService;
        return !!(svc && svc.isEnabled && svc.isEnabled('USE_SUPABASE_EMPLOYEES') && svc.getClient && svc.getClient());
    }

    function client() {
        return global.supabaseClientService.getClient();
    }

    function recordFallback(reason) {
        try { global.migrationControlService?.recordFallback?.('employees', reason, { role: 'system', id: 'employeeService', name: 'Employee Service' }); } catch (e) {}
    }

    function toSupabaseEmployee(payload) {
        const normalized = db().normalizeEmployeePayload
            ? db().normalizeEmployeePayload(payload || {})
            : (payload || {});
        const empId = normalized.id || normalized.empId || normalized.employeeId;
        return {
            auth_user_id: normalized.authUserId || normalized.auth_user_id || null,
            emp_id: empId,
            employee_code: normalized.employeeCode || empId,
            legacy_emp_id: normalized.legacyEmpId || '',
            full_name: normalized.name || normalized.fullName || '',
            department: normalized.dept || normalized.department || 'General',
            designation: normalized.desig || normalized.designation || 'Employee',
            official_designation: normalized.officialDesignation || normalized.designation || normalized.desig || 'Employee',
            manager_id: normalized.managerId || null,
            branch: normalized.branch || 'Head Office',
            location: normalized.location || normalized.branch || 'Head Office',
            shift_id: normalized.shiftId || 'SH002',
            email: normalized.email || null,
            phone: normalized.phone || normalized.mobile || null,
            mobile: normalized.mobile || normalized.phone || null,
            date_of_joining: normalized.doj || normalized.joinDate || null,
            date_of_birth: normalized.dob || null,
            salary: Number(normalized.salary || 0),
            leave_balance: Number(normalized.leaveBalance || 0),
            employment_status: normalized.employmentStatus || 'Active',
            accountability_tier: normalized.accountabilityTier || 'Standard Accountability Resource',
            address: normalized.address || '',
            photo_url: normalized.photoUrl || null,
            source: normalized.source || 'arthhrms-local'
        };
    }

    function fromSupabaseEmployee(row) {
        if (!row) return null;
        return {
            id: row.emp_id,
            authUserId: row.auth_user_id || null,
            empId: row.emp_id,
            employeeId: row.emp_id,
            employeeCode: row.employee_code || row.emp_id,
            legacyEmpId: row.legacy_emp_id || '',
            name: row.full_name || '',
            fullName: row.full_name || '',
            dept: row.department || 'General',
            department: row.department || 'General',
            desig: row.designation || 'Employee',
            designation: row.designation || 'Employee',
            officialDesignation: row.official_designation || row.designation || 'Employee',
            managerId: row.manager_id || null,
            branch: row.branch || 'Head Office',
            location: row.location || row.branch || 'Head Office',
            shiftId: row.shift_id || 'SH002',
            email: row.email || '',
            phone: row.phone || row.mobile || '',
            mobile: row.mobile || row.phone || '',
            doj: row.date_of_joining || '',
            dob: row.date_of_birth || '',
            salary: Number(row.salary || 0),
            leaveBalance: Number(row.leave_balance || 0),
            employmentStatus: row.employment_status || 'Active',
            accountabilityTier: row.accountability_tier || 'Standard Accountability Resource',
            address: row.address || '',
            photoUrl: row.photo_url || ''
        };
    }

    function mirrorLocalEmployee(emp) {
        if (!emp) return null;
        const data = db().get();
        const existingIdx = (data.employees || []).findIndex(e => e.id === emp.id);
        const payload = db().normalizeEmployeePayload ? db().normalizeEmployeePayload(emp, data) : emp;
        if (existingIdx > -1) data.employees[existingIdx] = { ...data.employees[existingIdx], ...payload, id: data.employees[existingIdx].id };
        else data.employees.push({ ...payload, password: payload.password || '', authStatus: payload.authStatus || 'Invite Required' });
        db().normalizeDataArchitecture(data);
        db().save(data);
        return db().getEmployee(emp.id);
    }

    function mirrorLocalEmployees(rows) {
        (rows || []).forEach(mirrorLocalEmployee);
        return rows;
    }

    const employeeService = {
        getEmployees() {
            if (supabaseReady() && Array.isArray(supabaseEmployeeCache)) return supabaseEmployeeCache;
            return localEmployees();
        },
        getEmployee(empId) {
            const officialId = this.resolveEmployeeId(empId);
            if (supabaseReady() && Array.isArray(supabaseEmployeeCache)) {
                return supabaseEmployeeCache.find(e => e.id === officialId) || localEmployee(officialId);
            }
            return localEmployee(officialId);
        },
        createEmployee(payload) { return localCreate(payload); },
        updateEmployee(empId, fields) { return localUpdate(empId, fields); },
        deleteEmployee(empId) { return db().EmployeeService?.delete ? db().EmployeeService.delete(empId) : db().deleteEmployee(empId); },
        generateEmployeeId() { return db().UtilityService?.generateEmployeeId ? db().UtilityService.generateEmployeeId() : db().generateEmployeeId(); },
        resolveEmployeeId(empId) { return db().UtilityService?.resolveEmployeeId ? db().UtilityService.resolveEmployeeId(empId) : db().resolveEmployeeId(empId); },
        validateManagerId(managerId, employeeId) { return db().UtilityService?.validateManagerId ? db().UtilityService.validateManagerId(managerId, employeeId) : db().validateManagerId(managerId, null, employeeId); },
        detectDuplicates() { return db().UtilityService?.detectDuplicateEmployees ? db().UtilityService.detectDuplicateEmployees() : db().detectDuplicateEmployees(); },
        relationshipAudit() { return db().UtilityService?.getRelationshipAudit ? db().UtilityService.getRelationshipAudit() : db().getRelationshipAudit(); },
        bulkImportEmployees(rows) { return db().EmployeeService?.bulkImport ? db().EmployeeService.bulkImport(rows) : db().bulkImportEmployees(rows); },
        exportEmployeesData() { return db().EmployeeService?.export ? db().EmployeeService.export() : db().exportEmployeesData(); },
        isSupabaseEmployeesEnabled() { return supabaseReady(); },
        mapToSupabaseEmployee: toSupabaseEmployee,
        mapFromSupabaseEmployee: fromSupabaseEmployee,
        async getEmployeesLive() {
            if (!supabaseReady()) return localEmployees();
            try {
                const { data, error } = await client().from('employees').select('*').order('emp_id', { ascending: true });
                if (error) throw error;
                supabaseEmployeeCache = (data || []).map(fromSupabaseEmployee).filter(Boolean);
                mirrorLocalEmployees(supabaseEmployeeCache);
                return supabaseEmployeeCache;
            } catch (err) {
                console.warn('Supabase employees fetch fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return localEmployees();
            }
        },
        async getEmployeeLive(empId) {
            const officialId = this.resolveEmployeeId(empId);
            if (!supabaseReady()) return localEmployee(officialId);
            try {
                const { data, error } = await client().from('employees').select('*').eq('emp_id', officialId).maybeSingle();
                if (error) throw error;
                if (!data) return localEmployee(officialId);
                const row = fromSupabaseEmployee(data);
                mirrorLocalEmployee(row);
                return row;
            } catch (err) {
                console.warn('Supabase employee fetch fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return localEmployee(officialId);
            }
        },
        async createEmployeeLive(payload) {
            if (!supabaseReady()) return localCreate(payload);
            const localPayload = {
                ...payload,
                id: payload?.id || payload?.empId || payload?.employeeId || this.generateEmployeeId()
            };
            try {
                const { data, error } = await client()
                    .from('employees')
                    .upsert(toSupabaseEmployee(localPayload), { onConflict: 'emp_id' })
                    .select()
                    .single();
                if (error) throw error;
                const row = fromSupabaseEmployee(data);
                supabaseEmployeeCache = null;
                mirrorLocalEmployee(row);
                if (db().writeAuditLog) db().writeAuditLog('hr', '', 'employee created', 'Employee Master', row.id, `Employee created in live employee master: ${row.name || row.id}`);
                return row;
            } catch (err) {
                console.warn('Supabase employee insert fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return localCreate(payload);
            }
        },
        async updateEmployeeLive(empId, fields) {
            const officialId = this.resolveEmployeeId(empId);
            if (!supabaseReady()) return localUpdate(officialId, fields);
            try {
                const payload = toSupabaseEmployee({ ...localEmployee(officialId), ...fields, id: officialId });
                const { error } = await client().from('employees').update(payload).eq('emp_id', officialId);
                if (error) throw error;
                supabaseEmployeeCache = null;
                mirrorLocalEmployee({ ...localEmployee(officialId), ...fields, id: officialId });
                if (db().writeAuditLog) db().writeAuditLog('hr', '', fields.authUserId || fields.auth_user_id ? 'employee auth mapping changed' : 'employee updated', 'Employee Master', officialId, `Employee ${officialId} updated in live employee master`);
                return true;
            } catch (err) {
                console.warn('Supabase employee update fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return localUpdate(officialId, fields);
            }
        },
        async syncEmployeesFromSupabase() {
            return this.getEmployeesLive();
        }
    };

    global.employeeService = { ...(global.employeeService || {}), ...employeeService };
})(window);
