// Payroll service adapter.
// Keeps payroll local-compatible while preparing Supabase-backed salary processing.
(function (global) {
    function db() { return global.DB; }
    let supabasePayrollCache = null;

    function today() {
        return db().today ? db().today() : new Date().toISOString().split('T')[0];
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function money(value) {
        const n = Number(value || 0);
        return Math.max(0, Math.round((Number.isFinite(n) ? n : 0) * 100) / 100);
    }

    function localRows() {
        return db().get().payroll || [];
    }

    function localByEmployee(empId) {
        return db().PayrollService?.byEmployee ? db().PayrollService.byEmployee(empId) : db().getEmpPayroll(empId);
    }

    function supabaseReady() {
        const svc = global.supabaseClientService;
        return !!(svc && svc.isEnabled && svc.isEnabled('USE_SUPABASE_PAYROLL') && svc.getClient && svc.getClient());
    }

    function client() {
        return global.supabaseClientService.getClient();
    }

    function recordFallback(reason) {
        try { global.migrationControlService?.recordFallback?.('payroll', reason, { role: 'system', id: 'payrollService', name: 'Payroll Service' }); } catch (e) {}
    }

    function getEmployees() {
        if (global.employeeService?.getEmployees) {
            const rows = global.employeeService.getEmployees();
            if (Array.isArray(rows)) return rows;
        }
        return db().getEmployees ? db().getEmployees() : (db().get().employees || []);
    }

    function monthInfo(input) {
        const raw = String(input || '').trim();
        let date = raw ? new Date(raw + (raw.length === 7 ? '-01T00:00:00' : '')) : new Date();
        if (Number.isNaN(date.getTime())) date = new Date();
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        return {
            label,
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            daysInMonth: end.getDate()
        };
    }

    function isWithin(date, start, end) {
        const value = String(date || '').slice(0, 10);
        return value >= start && value <= end;
    }

    function dateRangeDays(start, end) {
        const a = new Date(String(start || '').slice(0, 10) + 'T00:00:00');
        const b = new Date(String(end || start || '').slice(0, 10) + 'T00:00:00');
        if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return [];
        const out = [];
        for (let cursor = new Date(a); cursor <= b; cursor.setDate(cursor.getDate() + 1)) {
            out.push(cursor.toISOString().slice(0, 10));
        }
        return out;
    }

    function getSalaryStructure(emp, monthStart) {
        const data = db().get();
        const empId = db().resolveEmployeeId(emp.id || emp.empId, data);
        const explicit = (data.salaryStructures || [])
            .filter(s => db().resolveEmployeeId(s.empId, data) === empId)
            .filter(s => (s.status || 'Active') === 'Active')
            .filter(s => !s.effectiveFrom || s.effectiveFrom <= monthStart)
            .filter(s => !s.effectiveTo || s.effectiveTo >= monthStart)
            .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))[0];
        if (explicit) {
            return {
                structureId: explicit.structureId || explicit.id || '',
                basicSalary: money(explicit.basicSalary || explicit.basic || 0),
                hra: money(explicit.hra || 0),
                allowances: money(explicit.allowances || 0),
                deductions: money(explicit.deductions || 0),
                overtimeRate: money(explicit.overtimeRate || 0),
                bonusAmount: money(explicit.bonusPlaceholder || explicit.bonusAmount || 0),
                currency: explicit.currency || data.companySettings?.currency || data.settings?.currency || 'INR',
                source: 'salary_structure'
            };
        }

        const monthlyGross = money(emp.salary || emp.monthlySalary || 0);
        const basicSalary = money(monthlyGross * 0.5);
        const hra = money(monthlyGross * 0.25);
        const allowances = money(Math.max(0, monthlyGross - basicSalary - hra));
        return {
            structureId: '',
            basicSalary,
            hra,
            allowances,
            deductions: 0,
            overtimeRate: 0,
            bonusAmount: 0,
            currency: data.companySettings?.currency || data.settings?.currency || 'INR',
            source: 'employee_salary_fallback'
        };
    }

    function getAttendanceRows(empId, range) {
        let rows = [];
        if (global.attendanceService?.getAttendanceByEmployee) {
            rows = global.attendanceService.getAttendanceByEmployee(empId) || [];
        } else if (db().getEmpAttendance) {
            rows = db().getEmpAttendance(empId) || [];
        }
        return rows.filter(a => isWithin(a.date || a.attendanceDate, range.startDate, range.endDate));
    }

    function getApprovedLeaves(empId, range) {
        let rows = [];
        if (global.leaveService?.getLeaveByEmployee) rows = global.leaveService.getLeaveByEmployee(empId) || [];
        else if (db().getEmpLeave) rows = db().getEmpLeave(empId) || [];
        return rows.filter(l => {
            const finalStatus = l.finalStatus || l.status || '';
            if (!['Approved', 'Manager Approved'].includes(finalStatus) && l.status !== 'Approved') return false;
            const from = l.from || l.fromDate;
            const to = l.to || l.toDate || from;
            return to >= range.startDate && from <= range.endDate;
        });
    }

    function isUnpaidLeave(leave) {
        const label = String(leave.leaveType || leave.type || '').toLowerCase();
        return ['unpaid', 'loss of pay', 'lwp', 'leave without pay'].some(token => label.includes(token));
    }

    function getPaidExpenses(empId, range) {
        let rows = [];
        if (global.expenseService?.getExpenseClaimsByEmployee) rows = global.expenseService.getExpenseClaimsByEmployee(empId) || [];
        else if (db().getExpenseClaimsByEmp) rows = db().getExpenseClaimsByEmp(empId) || [];
        return rows.filter(c => {
            const status = c.finalStatus || c.status || c.financeStatus || '';
            const paidDate = String(c.paidAt || c.paymentDate || c.paidOn || '').slice(0, 10);
            return status === 'Paid' && paidDate && isWithin(paidDate, range.startDate, range.endDate);
        });
    }

    function calculatePayrollForEmployee(emp, payrollMonth, options = {}) {
        const data = db().get();
        const empId = db().resolveEmployeeId(emp.id || emp.empId, data);
        const range = monthInfo(payrollMonth);
        const structure = getSalaryStructure(emp, range.startDate);
        const attendanceRows = getAttendanceRows(empId, range);
        const approvedLeaves = getApprovedLeaves(empId, range);
        const approvedLeaveDays = new Set();
        const unpaidLeaveDays = new Set();
        approvedLeaves.forEach(leave => {
            dateRangeDays(leave.from || leave.fromDate, leave.to || leave.toDate || leave.from || leave.fromDate)
                .filter(day => isWithin(day, range.startDate, range.endDate))
                .forEach(day => {
                    approvedLeaveDays.add(day);
                    if (isUnpaidLeave(leave)) unpaidLeaveDays.add(day);
                });
        });
        attendanceRows.forEach(row => {
            const day = String(row.date || row.attendanceDate || '').slice(0, 10);
            if ((row.status || '') === 'Absent' && day && !approvedLeaveDays.has(day)) unpaidLeaveDays.add(day);
        });

        const basicSalary = money(structure.basicSalary);
        const hra = money(structure.hra);
        const allowances = money(structure.allowances);
        const regularDeductions = money(structure.deductions);
        const expenseReimbursements = money(getPaidExpenses(empId, range).reduce((sum, c) => sum + Number(c.amount || 0), 0));
        const overtimeAmount = money(options.overtimeAmount || 0);
        const bonusAmount = money(options.bonusAmount ?? structure.bonusAmount ?? 0);
        const perDay = range.daysInMonth ? money((basicSalary + hra + allowances) / range.daysInMonth) : 0;
        const leaveDeductions = money(perDay * unpaidLeaveDays.size);
        const grossSalary = money(basicSalary + hra + allowances + overtimeAmount + bonusAmount);
        const netSalary = money(Math.max(0, grossSalary + expenseReimbursements - regularDeductions - leaveDeductions));
        const payrollId = options.payrollId || options.id || db().generatePayrollId?.(data) || db().generateRecordId('payroll', data);

        return {
            id: payrollId,
            payrollId,
            empId,
            employeeName: emp.name || emp.fullName || '',
            month: range.label,
            payrollMonth: range.label,
            monthStart: range.startDate,
            monthEnd: range.endDate,
            basic: basicSalary,
            basicSalary,
            hra,
            special: allowances,
            transport: 0,
            allowances,
            deductions: regularDeductions,
            pf: 0,
            esic: 0,
            pt: 0,
            tds: 0,
            leaveDeductions,
            expenseReimbursements,
            overtimeAmount,
            bonusAmount,
            gross: grossSalary,
            grossSalary,
            net: netSalary,
            netSalary,
            status: options.status || options.payrollStatus || 'Pending',
            payrollStatus: options.payrollStatus || options.status || 'Pending',
            processedBy: options.processedBy || '',
            processedAt: options.processedAt || nowIso(),
            remarks: options.remarks || '',
            paidOn: options.paidOn || null,
            paidAt: options.paidAt || null,
            approvedBy: options.approvedBy || '',
            approvedAt: options.approvedAt || null,
            calculationMeta: {
                structureSource: structure.source,
                structureId: structure.structureId,
                currency: structure.currency,
                attendanceRecords: attendanceRows.length,
                approvedLeaveDays: approvedLeaveDays.size,
                unpaidDays: unpaidLeaveDays.size,
                expenseReimbursements
            }
        };
    }

    function buildLocalPayroll(payload = {}) {
        const data = db().get();
        const empId = db().resolveEmployeeId(payload.empId || payload.emp_id || payload.employeeId, data);
        const payrollId = payload.payrollId || payload.payroll_id || payload.id || db().generatePayrollId?.(data) || db().generateRecordId('payroll', data);
        const month = payload.payrollMonth || payload.payroll_month || payload.month || monthInfo().label;
        const basicSalary = money(payload.basicSalary ?? payload.basic_salary ?? payload.basic ?? 0);
        const hra = money(payload.hra || 0);
        const transport = money(payload.transport || 0);
        const allowances = money(payload.allowances ?? (money(payload.special || 0) + hra + transport));
        const regularDeductions = money(payload.deductions ?? (Number(payload.pf || 0) + Number(payload.esic || 0) + Number(payload.pt || 0) + Number(payload.tds || 0)));
        const leaveDeductions = money(payload.leaveDeductions ?? payload.leave_deductions ?? 0);
        const expenseReimbursements = money(payload.expenseReimbursements ?? payload.expense_reimbursements ?? 0);
        const overtimeAmount = money(payload.overtimeAmount ?? payload.overtime_amount ?? 0);
        const bonusAmount = money(payload.bonusAmount ?? payload.bonus_amount ?? 0);
        const grossSalary = money(payload.grossSalary ?? payload.gross_salary ?? payload.gross ?? (basicSalary + allowances + overtimeAmount + bonusAmount));
        const netSalary = money(payload.netSalary ?? payload.net_salary ?? payload.net ?? Math.max(0, grossSalary + expenseReimbursements - regularDeductions - leaveDeductions));
        const payrollStatus = payload.payrollStatus || payload.payroll_status || payload.status || 'Pending';
        return {
            id: payrollId,
            payrollId,
            empId,
            month,
            payrollMonth: month,
            basic: basicSalary,
            basicSalary,
            hra,
            special: money(payload.special ?? Math.max(0, allowances - hra - transport)),
            transport,
            allowances,
            deductions: regularDeductions,
            pf: money(payload.pf || 0),
            esic: money(payload.esic || 0),
            pt: money(payload.pt || 0),
            tds: money(payload.tds || 0),
            leaveDeductions,
            expenseReimbursements,
            overtimeAmount,
            bonusAmount,
            gross: grossSalary,
            grossSalary,
            net: netSalary,
            netSalary,
            status: payrollStatus,
            payrollStatus,
            processedBy: payload.processedBy || payload.processed_by || '',
            processedAt: payload.processedAt || payload.processed_at || null,
            approvedBy: payload.approvedBy || payload.approved_by || '',
            approvedAt: payload.approvedAt || payload.approved_at || null,
            paidOn: payload.paidOn || payload.paid_on || (payload.paidAt ? String(payload.paidAt).slice(0, 10) : payload.paid_at ? String(payload.paid_at).slice(0, 10) : null),
            paidAt: payload.paidAt || payload.paid_at || null,
            remarks: payload.remarks || '',
            calculationMeta: payload.calculationMeta || payload.calculation_meta || {}
        };
    }

    function toSupabasePayroll(payload = {}) {
        const row = buildLocalPayroll(payload);
        return {
            payroll_id: row.payrollId,
            emp_id: row.empId,
            payroll_month: row.payrollMonth,
            cycle_id: row.cycleId || null,
            basic_salary: row.basicSalary,
            allowances: row.allowances,
            deductions: row.deductions,
            leave_deductions: row.leaveDeductions,
            expense_reimbursements: row.expenseReimbursements,
            overtime_amount: row.overtimeAmount,
            bonus_amount: row.bonusAmount,
            gross_salary: row.grossSalary,
            net_salary: row.netSalary,
            payroll_status: row.payrollStatus,
            processed_by: row.processedBy || null,
            processed_at: row.processedAt || null,
            approved_by: row.approvedBy || null,
            approved_at: row.approvedAt || null,
            paid_at: row.paidAt || null,
            paid_on: row.paidOn || null,
            remarks: row.remarks || null,
            calculation_meta: row.calculationMeta || {}
        };
    }

    function fromSupabasePayroll(row) {
        if (!row) return null;
        return buildLocalPayroll({
            id: row.payroll_id,
            payrollId: row.payroll_id,
            empId: row.emp_id,
            payrollMonth: row.payroll_month,
            basicSalary: row.basic_salary,
            allowances: row.allowances,
            deductions: row.deductions,
            leaveDeductions: row.leave_deductions,
            expenseReimbursements: row.expense_reimbursements,
            overtimeAmount: row.overtime_amount,
            bonusAmount: row.bonus_amount,
            grossSalary: row.gross_salary,
            netSalary: row.net_salary,
            payrollStatus: row.payroll_status,
            processedBy: row.processed_by,
            processedAt: row.processed_at,
            approvedBy: row.approved_by,
            approvedAt: row.approved_at,
            paidAt: row.paid_at,
            paidOn: row.paid_on,
            remarks: row.remarks,
            calculationMeta: row.calculation_meta || {}
        });
    }

    function mirrorLocalPayroll(row) {
        const rec = buildLocalPayroll(row);
        if (!rec.empId || !rec.payrollId) return null;
        const data = db().get();
        if (!data.payroll) data.payroll = [];
        const idx = data.payroll.findIndex(p => (p.payrollId || p.id) === rec.payrollId || (p.empId === rec.empId && (p.payrollMonth || p.month) === rec.payrollMonth));
        const existing = idx > -1 ? data.payroll[idx] : null;
        const merged = { ...(existing || {}), ...rec, id: rec.payrollId, payrollId: rec.payrollId };
        if (idx > -1) data.payroll[idx] = merged;
        else data.payroll.push(merged);
        db().normalizeDataArchitecture?.(data);
        db().save(data);
        return merged;
    }

    function mirrorLocalPayrolls(rows = []) {
        rows.forEach(mirrorLocalPayroll);
        return rows;
    }

    function filterLocalPayroll(filters = {}) {
        let rows = [...localRows()];
        if (filters.empId) {
            const empId = db().resolveEmployeeId(filters.empId);
            rows = rows.filter(p => p.empId === empId);
        }
        if (filters.month || filters.payrollMonth) rows = rows.filter(p => (p.payrollMonth || p.month) === (filters.month || filters.payrollMonth));
        if (filters.status) rows = rows.filter(p => (p.payrollStatus || p.status) === filters.status);
        return rows.sort((a, b) => String(b.processedAt || b.paidOn || b.month || '').localeCompare(String(a.processedAt || a.paidOn || a.month || '')));
    }

    async function supabaseUpsertPayroll(payload) {
        const { data, error } = await client()
            .from('payroll_records')
            .upsert(toSupabasePayroll(payload), { onConflict: 'payroll_id' })
            .select()
            .single();
        if (error) throw error;
        const row = fromSupabasePayroll(data);
        mirrorLocalPayroll(row);
        supabasePayrollCache = null;
        return row;
    }

    async function upsertIfLive(row) {
        if (!supabaseReady()) return row;
        try { return await supabaseUpsertPayroll(row); }
        catch (err) {
            console.warn('Supabase payroll upsert fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return row;
        }
    }

    async function fetchPayrollRecords(filters = {}) {
        if (!filters.__silent && db().writeAuditLog) {
            const user = global.authService?.getCurrentUser ? global.authService.getCurrentUser() : null;
            db().writeAuditLog(user?.role || 'system', user?.empId || user?.id || '', 'payroll access', 'Payroll', filters.empId || filters.payrollMonth || filters.month || 'all', 'Payroll records viewed through payroll service');
        }
        if (!supabaseReady() || filters.__local) return filterLocalPayroll(filters);
        try {
            let query = client().from('payroll_records').select('*').order('processed_at', { ascending: false, nullsFirst: false });
            if (filters.empId) query = query.eq('emp_id', db().resolveEmployeeId(filters.empId));
            if (filters.month || filters.payrollMonth) query = query.eq('payroll_month', filters.month || filters.payrollMonth);
            if (filters.status) query = query.eq('payroll_status', filters.status);
            const { data, error } = await query;
            if (error) throw error;
            const rows = (data || []).map(fromSupabasePayroll).filter(Boolean);
            supabasePayrollCache = rows;
            mirrorLocalPayrolls(rows);
            return filterLocalPayroll(filters);
        } catch (err) {
            console.warn('Supabase payroll fetch fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return filterLocalPayroll(filters);
        }
    }

    function emitPayrollEvent(type, row, actorRole, actorId, message, priority = 'MEDIUM') {
        if (global.workflowEngine?.emitWorkflowEvent) {
            global.workflowEngine.emitWorkflowEvent(type, {
                actorRole,
                actorId,
                module: 'Payroll',
                targetId: row.payrollId || row.id,
                empId: row.empId,
                targetEmpId: row.empId,
                title: type.replace(/_/g, ' '),
                message,
                priority,
                metadata: {
                    empId: row.empId,
                    payrollId: row.payrollId || row.id,
                    payrollMonth: row.payrollMonth || row.month,
                    netSalary: row.netSalary || row.net,
                    payrollStatus: row.payrollStatus || row.status
                }
            });
        } else if (db().writeAuditLog) {
            db().writeAuditLog(actorRole, actorId, type.toLowerCase().replace(/_/g, ' '), 'Payroll', row.payrollId || row.id, message);
        }
    }

    async function generatePayroll(options = {}) {
        const started = Date.now();
        const range = monthInfo(options.month || options.payrollMonth);
        const data = db().get();
        const selected = new Set((options.empIds || []).map(id => db().resolveEmployeeId(id, data)).filter(Boolean));
        const employees = getEmployees()
            .filter(e => !selected.size || selected.has(db().resolveEmployeeId(e.id || e.empId, data)))
            .filter(e => !['Inactive', 'Resigned', 'Terminated'].includes(String(e.status || e.employmentStatus || 'Active')));
        const safety = global.deploymentSafetyService?.guardAction
            ? global.deploymentSafetyService.guardAction('payroll_generation', { employeeCount: employees.length, payrollMonth: range.label }, { label: `payroll generation for ${employees.length} employees` })
            : { ok: true };
        if (!safety.ok) {
            global.operationsMonitoringService?.createIncident?.({
                severity: 'HIGH',
                module: 'Payroll',
                title: 'Payroll generation blocked',
                description: safety.reason || 'Payroll generation blocked by deployment safety controls',
                source: 'payroll',
                recoveryAction: 'Review deployment safety limits, pilot mode, and employee count before retrying.',
                metadata: { payrollMonth: range.label, employeeCount: employees.length }
            });
            return { month: range.label, created: [], skipped: [], errors: [{ message: safety.reason || 'Payroll generation blocked by deployment safety controls' }], blocked: true, totalCreated: 0, totalSkipped: 0, totalErrors: 1 };
        }
        const created = [];
        const skipped = [];
        const errors = [];

        for (const emp of employees) {
            const empId = db().resolveEmployeeId(emp.id || emp.empId, data);
            const existing = (db().get().payroll || []).find(p => p.empId === empId && (p.payrollMonth || p.month) === range.label);
            if (existing && !options.force) {
                skipped.push(existing);
                continue;
            }
            try {
                const row = calculatePayrollForEmployee(emp, range.label, {
                    processedBy: options.processedBy || options.actorId || 'HR',
                    remarks: options.remarks || ''
                });
                const saved = mirrorLocalPayroll(existing && options.force ? { ...row, id: existing.id, payrollId: existing.payrollId || existing.id } : row);
                await upsertIfLive(saved);
                created.push(saved);
                emitPayrollEvent('PAYROLL_GENERATED', saved, options.actorRole || 'hr', options.actorId || options.processedBy || 'HR', `Payroll generated for ${saved.empId} (${range.label}).`, 'MEDIUM');
            } catch (err) {
                errors.push({ empId, message: err.message || String(err) });
                global.operationsMonitoringService?.recordError?.(err, { module: 'Payroll', action: 'generatePayroll', severity: 'HIGH', metadata: { empId, payrollMonth: range.label } });
            }
        }
        global.operationsMonitoringService?.recordPerformance?.({
            module: 'Payroll',
            operation: 'payroll_generation',
            durationMs: Date.now() - started,
            recordCount: employees.length,
            status: errors.length ? 'Warning' : 'OK',
            metadata: { payrollMonth: range.label, created: created.length, skipped: skipped.length, errors: errors.length }
        });
        if (errors.length) {
            global.operationsMonitoringService?.createIncident?.({
                severity: 'HIGH',
                module: 'Payroll',
                title: 'Payroll generation completed with errors',
                description: `${errors.length} employee payroll record(s) failed during generation.`,
                source: 'payroll',
                recoveryAction: 'Review payroll error list, employee salary structures, and attendance/leave dependencies.',
                metadata: { payrollMonth: range.label, errors }
            });
        }
        return { month: range.label, created, skipped, errors, totalCreated: created.length, totalSkipped: skipped.length, totalErrors: errors.length };
    }

    async function createPayrollRecord(payload = {}) {
        const row = mirrorLocalPayroll(payload);
        await upsertIfLive(row);
        emitPayrollEvent('PAYROLL_GENERATED', row, payload.actorRole || 'hr', payload.actorId || payload.processedBy || 'HR', `Payroll record created for ${row.empId} (${row.payrollMonth}).`, 'MEDIUM');
        return row;
    }

    async function approvePayroll(payrollId, actorId = 'HR', remarks = '') {
        const data = db().get();
        const idx = (data.payroll || []).findIndex(p => (p.payrollId || p.id) === payrollId);
        if (idx === -1) return { ok: false, message: 'Payroll record not found' };
        const row = buildLocalPayroll(data.payroll[idx]);
        if (['Paid', 'Rejected', 'Cancelled'].includes(row.payrollStatus)) return { ok: false, message: `Payroll is already ${row.payrollStatus}` };
        row.payrollStatus = 'Approved';
        row.status = 'Approved';
        row.approvedBy = actorId || 'HR';
        row.approvedAt = nowIso();
        row.remarks = remarks || row.remarks || '';
        data.payroll[idx] = { ...data.payroll[idx], ...row };
        db().save(data);
        await upsertIfLive(row);
        emitPayrollEvent('PAYROLL_APPROVED', row, 'hr', actorId || 'HR', `Payroll ${row.payrollId} approved for ${row.payrollMonth}.`, 'HIGH');
        return { ok: true, row };
    }

    async function markPayrollPaid(payrollId, paidOn = today(), actorId = 'HR', remarks = '') {
        const data = db().get();
        const idx = (data.payroll || []).findIndex(p => (p.payrollId || p.id) === payrollId);
        if (idx === -1) return { ok: false, message: 'Payroll record not found' };
        const row = buildLocalPayroll(data.payroll[idx]);
        if (row.payrollStatus === 'Paid') return { ok: false, message: 'Payroll is already paid' };
        if (row.payrollStatus !== 'Approved') return { ok: false, message: 'Approve payroll before marking it paid' };
        row.payrollStatus = 'Paid';
        row.status = 'Paid';
        row.paidOn = paidOn || today();
        row.paidAt = nowIso();
        row.remarks = remarks || row.remarks || '';
        data.payroll[idx] = { ...data.payroll[idx], ...row };
        db().save(data);
        await upsertIfLive(row);
        generatePayslip(row.payrollId);
        emitPayrollEvent('PAYROLL_PAID', row, 'hr', actorId || 'HR', `Salary paid for ${row.empId} (${row.payrollMonth}).`, 'HIGH');
        return { ok: true, row };
    }

    function generatePayslip(payrollId) {
        const data = db().get();
        if (!data.payslips) data.payslips = [];
        const payroll = buildLocalPayroll((data.payroll || []).find(p => (p.payrollId || p.id) === payrollId) || {});
        if (!payroll.empId || !payroll.payrollId) return null;
        const employee = (data.employees || []).find(e => e.id === payroll.empId) || {};
        const payslipId = 'PS' + String((data.payslips || []).length + 1).padStart(4, '0');
        const row = {
            id: payslipId,
            payslipId,
            payrollId: payroll.payrollId,
            empId: payroll.empId,
            payrollMonth: payroll.payrollMonth,
            employeeSnapshot: {
                name: employee.name || employee.fullName || '',
                department: employee.department || '',
                designation: employee.designation || '',
                branch: employee.branch || employee.location || ''
            },
            earnings: {
                basicSalary: payroll.basicSalary,
                hra: payroll.hra,
                allowances: payroll.allowances,
                overtimeAmount: payroll.overtimeAmount,
                bonusAmount: payroll.bonusAmount,
                grossSalary: payroll.grossSalary
            },
            deductions: {
                regularDeductions: payroll.deductions,
                leaveDeductions: payroll.leaveDeductions,
                totalDeductions: money(payroll.deductions + payroll.leaveDeductions)
            },
            reimbursements: {
                expenseReimbursements: payroll.expenseReimbursements
            },
            netSalary: payroll.netSalary,
            status: 'Generated',
            generatedAt: nowIso()
        };
        const idx = data.payslips.findIndex(p => p.payrollId === payroll.payrollId);
        if (idx > -1) data.payslips[idx] = { ...data.payslips[idx], ...row, id: data.payslips[idx].id, payslipId: data.payslips[idx].payslipId };
        else data.payslips.unshift(row);
        db().save(data);
        return row;
    }

    function saveSalaryStructure(structure = {}) {
        const data = db().get();
        if (!data.salaryStructures) data.salaryStructures = [];
        const empId = db().resolveEmployeeId(structure.empId || structure.employeeId, data);
        const structureId = structure.structureId || structure.id || 'SAL' + String(data.salaryStructures.length + 1).padStart(4, '0');
        const row = {
            id: structureId,
            structureId,
            empId,
            effectiveFrom: structure.effectiveFrom || today(),
            effectiveTo: structure.effectiveTo || null,
            basicSalary: money(structure.basicSalary || structure.basic || 0),
            hra: money(structure.hra || 0),
            allowances: money(structure.allowances || 0),
            deductions: money(structure.deductions || 0),
            overtimeRate: money(structure.overtimeRate || 0),
            bonusPlaceholder: money(structure.bonusPlaceholder || 0),
            currency: structure.currency || data.companySettings?.currency || data.settings?.currency || 'INR',
            status: structure.status || 'Active',
            remarks: structure.remarks || ''
        };
        const idx = data.salaryStructures.findIndex(s => (s.structureId || s.id) === structureId);
        if (idx > -1) data.salaryStructures[idx] = { ...data.salaryStructures[idx], ...row };
        else data.salaryStructures.push(row);
        db().save(data);
        return row;
    }

    function exportPayrollRecordsData(filters = {}) {
        return filterLocalPayroll(filters).map(row => buildLocalPayroll(row));
    }

    const payrollService = {
        isSupabasePayrollEnabled: supabaseReady,
        monthInfo,
        calculatePayrollForEmployee,
        generatePayroll,
        createPayrollRecord,
        fetchPayrollRecords,
        getPayrollRecords: (filters = {}) => filterLocalPayroll(filters),
        fetchPayrollByEmployee: (empId) => fetchPayrollRecords({ empId }),
        getPayrollByEmployee: (empId) => filterLocalPayroll({ empId }),
        approvePayroll,
        markPayrollPaid,
        generatePayslip,
        saveSalaryStructure,
        getSalaryStructures: () => db().get().salaryStructures || [],
        exportPayrollRecordsData,
        exportBankTransferData: (filters = {}) => exportPayrollRecordsData(filters)
            .filter(p => p.payrollStatus === 'Paid')
            .map(p => ({ empId: p.empId, payrollMonth: p.payrollMonth, netSalary: p.netSalary, paidOn: p.paidOn }))
    };

    global.payrollService = { ...(global.payrollService || {}), ...payrollService };
})(typeof window !== 'undefined' ? window : globalThis);
