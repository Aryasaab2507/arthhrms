// Export, snapshot, and document model helpers for ARTHHRMS.
(function (global) {
    function db() { return global.DB; }

    function escapeCSV(value) {
        if (global.FrontendSecurityService?.escapeCSVCell) {
            return global.FrontendSecurityService.escapeCSVCell(value);
        }
        if (value === null || value === undefined) return '';
        let text = String(value).replace(/\r?\n/g, ' ');
        if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = "'" + text;
        return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function toCSV(rows = [], columns = []) {
        const headers = columns.length ? columns : Object.keys(rows[0] || {});
        const lines = [headers.map(escapeCSV).join(',')];
        rows.forEach(row => lines.push(headers.map(key => escapeCSV(row[key])).join(',')));
        return lines.join('\n');
    }

    function downloadText(filename, content, mimeType = 'text/plain') {
        if (!global.document) return { ok: false, filename, content };
        if (global.FrontendSecurityService?.downloadBlob) {
            const ok = global.FrontendSecurityService.downloadBlob(content, filename, mimeType);
            return { ok, filename: global.FrontendSecurityService.sanitizeFilename(filename, 'download') };
        }
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        return { ok: true, filename };
    }

    function downloadCSV(filename, rows, columns) {
        return downloadText(filename, toCSV(rows, columns), 'text/csv;charset=utf-8');
    }

    function getData() {
        return db()?.get ? db().get() : {};
    }

    function requireExport(resource, targetEmployeeId = '') {
        if (!global.rbacEnforcementService?.requireAccess) throw new Error('RBAC enforcement service is unavailable.');
        return global.rbacEnforcementService.requireAccess({
            resource,
            action: 'export',
            targetEmployeeId,
            actor: global.authService?.getCurrentUser?.() || null
        });
    }

    function employeesById() {
        const map = {};
        (db()?.getEmployees?.() || getData().employees || []).forEach(emp => {
            map[emp.id || emp.empId] = emp;
        });
        return map;
    }

    function normalizeAttendanceRows(rows) {
        const empMap = employeesById();
        return (rows || []).map(row => {
            const emp = empMap[row.empId] || {};
            return {
                empId: row.empId || '',
                employeeName: emp.name || row.employeeName || '',
                date: row.date || row.attendanceDate || '',
                checkIn: row.checkIn || '',
                checkOut: row.checkOut || '',
                workingHours: row.workingHours || row.hours || '',
                status: row.status || '',
                shiftId: row.shiftId || '',
                regularizationStatus: row.regularizationStatus || ''
            };
        });
    }

    function normalizeLeaveRows(rows) {
        const empMap = employeesById();
        return (rows || []).map(row => {
            const emp = empMap[row.empId] || {};
            return {
                leaveId: row.leaveId || row.id || '',
                empId: row.empId || '',
                employeeName: emp.name || row.employeeName || '',
                leaveType: row.leaveType || row.type || '',
                fromDate: row.fromDate || row.from || '',
                toDate: row.toDate || row.to || '',
                totalDays: row.totalDays || row.days || '',
                managerStatus: row.managerStatus || row.managerApproval || '',
                hrStatus: row.hrStatus || row.hrApproval || '',
                finalStatus: row.finalStatus || row.status || '',
                reason: row.reason || ''
            };
        });
    }

    function normalizeExpenseRows(rows) {
        const empMap = employeesById();
        return (rows || []).map(row => {
            const emp = empMap[row.empId] || {};
            return {
                expenseId: row.expenseId || row.id || '',
                empId: row.empId || '',
                employeeName: emp.name || row.employeeName || '',
                category: row.category || '',
                expenseDate: row.expenseDate || row.date || '',
                amount: Number(row.amount || 0),
                managerStatus: row.managerStatus || '',
                financeStatus: row.financeStatus || row.hrStatus || '',
                finalStatus: row.finalStatus || row.status || '',
                paidAt: row.paidAt || row.paidOn || '',
                remarks: row.remarks || row.hrRemark || row.managerRemark || ''
            };
        });
    }

    function normalizePayrollRows(rows) {
        const empMap = employeesById();
        return (rows || []).map(row => {
            const emp = empMap[row.empId] || {};
            return {
                payrollId: row.payrollId || row.id || '',
                empId: row.empId || '',
                employeeName: emp.name || row.employeeName || '',
                payrollMonth: row.payrollMonth || row.month || '',
                basicSalary: Number(row.basicSalary || row.basic || 0),
                allowances: Number(row.allowances || row.special || 0),
                deductions: Number(row.deductions || row.pf || 0),
                leaveDeductions: Number(row.leaveDeductions || 0),
                expenseReimbursements: Number(row.expenseReimbursements || 0),
                netSalary: Number(row.netSalary || row.net || 0),
                payrollStatus: row.payrollStatus || row.status || '',
                paidAt: row.paidAt || row.paidOn || ''
            };
        });
    }

    function exportAttendance(filename = 'attendance-export.csv') {
        requireExport('attendance');
        return downloadCSV(filename, normalizeAttendanceRows(getData().attendance || []));
    }

    function exportLeave(filename = 'leave-export.csv') {
        requireExport('leave');
        return downloadCSV(filename, normalizeLeaveRows(getData().leaveRequests || []));
    }

    function exportExpense(filename = 'expense-export.csv') {
        requireExport('expenses');
        const rows = db()?.getExpenseClaims?.() || getData().expenseClaims || [];
        return downloadCSV(filename, normalizeExpenseRows(rows));
    }

    function exportPayroll(filename = 'payroll-export.csv') {
        requireExport('payroll');
        const rows = db()?.getPayroll?.() || getData().payroll || [];
        return downloadCSV(filename, normalizePayrollRows(rows));
    }

    function exportBackupSnapshot(options = {}) {
        if (!global.rbacEnforcementService?.requireAccess) throw new Error('RBAC enforcement service is unavailable.');
        global.rbacEnforcementService.requireAccess({ resource: 'backups', action: 'export', actor: global.authService?.getCurrentUser?.() || null });
        const snapshot = {
            product: 'ARTHHRMS',
            version: 'snapshot-v1',
            exportedAt: new Date().toISOString(),
            exportedBy: options.exportedBy || global.authService?.getCurrentUser?.()?.id || 'system',
            mode: global.supabaseClientService?.readConfig?.()?.flags?.PRODUCTION_MODE ? 'production' : 'local',
            data: getData()
        };
        if (options.download !== false) {
            downloadText(options.filename || `arthhrms-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
        }
        return snapshot;
    }

    function validateRestoreSnapshot(snapshot) {
        const errors = [];
        const data = snapshot?.data || snapshot;
        if (!data || typeof data !== 'object') errors.push('Snapshot data is missing');
        ['employees', 'attendance', 'leaveRequests', 'payroll'].forEach(key => {
            if (data && !Array.isArray(data[key])) errors.push(`${key} array is missing`);
        });
        return {
            ok: errors.length === 0,
            errors,
            counts: data ? {
                employees: (data.employees || []).length,
                attendance: (data.attendance || []).length,
                leaveRequests: (data.leaveRequests || []).length,
                payroll: (data.payroll || []).length,
                expenseClaims: (data.expenseClaims || []).length
            } : {}
        };
    }

    function buildPayslipDocumentModel(payrollRecord, employee) {
        const p = payrollRecord || {};
        const e = employee || db()?.getEmployee?.(p.empId) || {};
        const earnings = [
            { label: 'Basic Salary', amount: Number(p.basicSalary || p.basic || 0) },
            { label: 'Allowances', amount: Number(p.allowances || p.special || 0) },
            { label: 'Expense Reimbursements', amount: Number(p.expenseReimbursements || 0) },
            { label: 'Overtime', amount: Number(p.overtimeAmount || 0) }
        ];
        const deductions = [
            { label: 'Standard Deductions', amount: Number(p.deductions || p.pf || 0) },
            { label: 'Leave Deductions', amount: Number(p.leaveDeductions || 0) }
        ];
        const gross = earnings.reduce((sum, item) => sum + item.amount, 0);
        const totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
        const net = Number(p.netSalary || p.net || Math.max(0, gross - totalDeductions));
        return {
            documentType: 'payslip',
            generatedAt: new Date().toISOString(),
            employee: {
                empId: e.id || p.empId || '',
                name: e.name || p.employeeName || '',
                department: e.dept || e.department || '',
                designation: e.desig || e.designation || ''
            },
            payrollMonth: p.payrollMonth || p.month || '',
            status: p.payrollStatus || p.status || '',
            earnings,
            deductions,
            gross,
            totalDeductions,
            netSalary: net
        };
    }

    global.exportService = {
        toCSV,
        downloadCSV,
        downloadText,
        exportAttendance,
        exportLeave,
        exportExpense,
        exportPayroll,
        exportBackupSnapshot,
        validateRestoreSnapshot,
        buildPayslipDocumentModel,
        normalizeAttendanceRows,
        normalizeLeaveRows,
        normalizeExpenseRows,
        normalizePayrollRows
    };
})(typeof window !== 'undefined' ? window : globalThis);
