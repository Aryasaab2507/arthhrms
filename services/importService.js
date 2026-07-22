// Enterprise Import Center service.
// Imports use the shared DB facade and authenticated Supabase persistence boundary.
(function (global) {
    function db() { return global.DB; }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    const schemas = {
        employees: {
            label: 'Employee Master Import',
            required: ['empId', 'fullName', 'department', 'designation', 'salary', 'joinDate', 'email', 'employmentStatus'],
            optional: ['managerId', 'branch', 'shiftId', 'phone', 'role'],
            columns: ['empId', 'fullName', 'department', 'designation', 'managerId', 'salary', 'joinDate', 'branch', 'shiftId', 'phone', 'email', 'employmentStatus', 'role'],
            labels: {
                empId: 'Employee ID',
                fullName: 'Full Name',
                department: 'Department',
                designation: 'Designation',
                managerId: 'Manager ID',
                salary: 'Salary',
                joinDate: 'Join Date',
                branch: 'Branch',
                shiftId: 'Shift ID',
                phone: 'Phone',
                email: 'Email',
                employmentStatus: 'Employment Status',
                role: 'Portal Role'
            }
        },
        attendance: {
            label: 'Attendance Import',
            required: ['empId', 'date', 'status'],
            optional: ['checkIn', 'checkOut', 'shiftId'],
            columns: ['empId', 'date', 'checkIn', 'checkOut', 'status', 'shiftId'],
            labels: {
                empId: 'Employee ID',
                date: 'Date',
                checkIn: 'Check In',
                checkOut: 'Check Out',
                status: 'Status',
                shiftId: 'Shift ID'
            }
        },
        leave: {
            label: 'Leave Requests Import',
            required: ['empId', 'type', 'from', 'to', 'reason', 'status'],
            optional: ['leaveId', 'managerStatus', 'hrStatus', 'finalStatus', 'remarks'],
            columns: ['leaveId', 'empId', 'type', 'from', 'to', 'reason', 'status', 'managerStatus', 'hrStatus', 'finalStatus', 'remarks'],
            labels: {
                leaveId: 'Leave ID',
                empId: 'Employee ID',
                type: 'Leave Type',
                from: 'From Date',
                to: 'To Date',
                reason: 'Reason',
                status: 'Status',
                managerStatus: 'Manager Status',
                hrStatus: 'HR Status',
                finalStatus: 'Final Status',
                remarks: 'Remarks'
            }
        },
        payroll: {
            label: 'Payroll Import',
            required: ['empId', 'month', 'basicSalary', 'allowances', 'deductions', 'finalSalary'],
            optional: ['bonus', 'leaveDeductions', 'expenseReimbursements', 'overtimeAmount', 'status'],
            columns: ['empId', 'month', 'basicSalary', 'allowances', 'deductions', 'leaveDeductions', 'expenseReimbursements', 'overtimeAmount', 'bonus', 'finalSalary', 'status'],
            labels: {
                empId: 'Employee ID',
                month: 'Month',
                basicSalary: 'Basic Salary',
                allowances: 'Allowances',
                deductions: 'Deductions',
                leaveDeductions: 'Leave Deductions',
                expenseReimbursements: 'Expense Reimbursements',
                overtimeAmount: 'Overtime Amount',
                bonus: 'Bonus',
                finalSalary: 'Final Salary',
                status: 'Status'
            }
        }
    };

    const aliases = {
        employees: {
            empId: ['empid', 'employeeid', 'employee code', 'employeecode', 'id'],
            fullName: ['fullname', 'full name', 'name', 'employee name', 'employeename'],
            department: ['department', 'dept'],
            designation: ['designation', 'desig', 'job title', 'jobtitle'],
            managerId: ['managerid', 'manager id', 'reportingmanager', 'reporting manager'],
            salary: ['salary', 'ctc', 'monthlysalary', 'monthly salary'],
            joinDate: ['joindate', 'join date', 'doj', 'joiningdate', 'joining date'],
            branch: ['branch', 'location', 'worklocation', 'work location'],
            shiftId: ['shiftid', 'shift id', 'shift'],
            phone: ['phone', 'mobile', 'mobile no', 'mobileno'],
            email: ['email', 'emailid', 'email id'],
            employmentStatus: ['employmentstatus', 'employment status', 'status'],
            role: ['role', 'portalrole', 'portal role', 'userrole', 'user role']
        },
        attendance: {
            empId: ['empid', 'employeeid', 'employee id', 'id'],
            date: ['date', 'attendance date', 'attendancedate'],
            checkIn: ['checkin', 'check in', 'in time', 'intime'],
            checkOut: ['checkout', 'check out', 'out time', 'outtime'],
            status: ['status', 'attendance status', 'attendancestatus'],
            shiftId: ['shiftid', 'shift id', 'shift']
        },
        leave: {
            leaveId: ['leaveid', 'leave id', 'requestid', 'request id', 'id'],
            empId: ['empid', 'employeeid', 'employee id', 'id'],
            type: ['type', 'leave type', 'leavetype'],
            from: ['from', 'fromdate', 'from date', 'startdate', 'start date'],
            to: ['to', 'todate', 'to date', 'enddate', 'end date'],
            reason: ['reason', 'leave reason', 'description'],
            status: ['status', 'leave status', 'final status'],
            managerStatus: ['managerstatus', 'manager status'],
            hrStatus: ['hrstatus', 'hr status'],
            finalStatus: ['finalstatus', 'final status'],
            remarks: ['remarks', 'remark', 'hr message', 'message']
        },
        payroll: {
            empId: ['empid', 'employeeid', 'employee id', 'id'],
            month: ['month', 'payroll month', 'salary month'],
            basicSalary: ['basicsalary', 'basic salary', 'basic'],
            allowances: ['allowances', 'allowance', 'hra', 'special'],
            deductions: ['deductions', 'deduction', 'tds', 'pf'],
            leaveDeductions: ['leavedeductions', 'leave deductions', 'lop', 'lwp deductions'],
            expenseReimbursements: ['expensereimbursements', 'expense reimbursements', 'reimbursements'],
            overtimeAmount: ['overtimeamount', 'overtime amount', 'overtime'],
            bonus: ['bonus', 'incentive'],
            finalSalary: ['finalsalary', 'final salary', 'net', 'net salary', 'netsalary'],
            status: ['status', 'payroll status']
        }
    };

    function clean(value) {
        return String(value ?? '').trim();
    }

    function headerKey(value) {
        return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function isValidDate(value) {
        const text = clean(value);
        if (!DATE_RE.test(text)) return false;
        const parts = text.split('-').map(Number);
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2];
    }

    function isNumber(value) {
        return clean(value) !== '' && !Number.isNaN(Number(value));
    }

    function normalizeDateValue(value) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
        const text = clean(value);
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const excelSerial = Number(text);
        if (Number.isFinite(excelSerial) && excelSerial > 25000 && excelSerial < 90000) {
            const utc = Math.round((excelSerial - 25569) * 86400 * 1000);
            const date = new Date(utc);
            if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
        }
        const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
        if (match) {
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            return `${match[3]}-${month}-${day}`;
        }
        return text;
    }

    function normalizeTimeValue(value) {
        const text = clean(value);
        if (!text) return '';
        const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return text;
        return `${String(match[1]).padStart(2, '0')}:${match[2]}${match[3] ? ':' + match[3] : ''}`;
    }

    function isValidTime(value) {
        const text = clean(value);
        if (!text) return true;
        const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return false;
        return Number(match[1]) >= 0 && Number(match[1]) <= 23 && Number(match[2]) >= 0 && Number(match[2]) <= 59 && (!match[3] || (Number(match[3]) >= 0 && Number(match[3]) <= 59));
    }

    function normalizeMonthValue(value) {
        const text = clean(value);
        if (!text) return '';
        let date = /^\d{4}-\d{2}$/.test(text) ? new Date(text + '-01T00:00:00') : new Date(text + ' 1');
        if (Number.isNaN(date.getTime())) date = new Date(text);
        if (Number.isNaN(date.getTime())) return text;
        return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    function hasUnsafeText(value) {
        return /[<>{}[\]\\]/.test(clean(value));
    }

    function isFutureDate(value) {
        const today = db().today ? db().today() : new Date().toISOString().slice(0, 10);
        return clean(value) > today;
    }

    function normalizeStatus(value) {
        const v = clean(value);
        return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : '';
    }

    function mapRow(type, row) {
        const schema = schemas[type];
        const source = row || {};
        const keys = Object.keys(source);
        const out = {};
        schema.columns.forEach(field => {
            if (source[field] !== undefined) {
                out[field] = clean(source[field]);
                return;
            }
            const accepted = new Set([field, ...(aliases[type][field] || [])].map(headerKey));
            const found = keys.find(k => accepted.has(headerKey(k)));
            out[field] = found ? clean(source[found]) : '';
        });
        return out;
    }

    function validateRows(type, rows) {
        const schema = schemas[type];
        if (!schema) throw new Error('Unsupported import type: ' + type);
        const d = db().get();
        const employees = d.employees || [];
        const employeeIds = new Set(employees.map(e => e.id));
        const reservedEmployeeIds = new Set(employeeIds);
        const emailToEmp = new Map(employees.filter(e => e.email).map(e => [String(e.email).toLowerCase(), e.id]));
        const phoneToEmp = new Map(employees.filter(e => e.mobile || e.phone).map(e => [String(e.mobile || e.phone).replace(/\D/g, ''), e.id]));
        const shifts = new Set((d.shifts || []).map(s => s.id));
        const departments = new Set(employees.map(e => e.dept || e.department).filter(Boolean));
        const incomingEmployeeIds = new Set();
        if (type === 'employees') {
            (rows || []).forEach(raw => {
                const mapped = mapRow(type, raw);
                const supplied = clean(mapped.empId);
                if (!supplied) return;
                const resolved = db().resolveEmployeeId(supplied, d);
                if (employeeIds.has(resolved)) incomingEmployeeIds.add(resolved);
                else if (db().isOfficialEmployeeId && db().isOfficialEmployeeId(supplied)) incomingEmployeeIds.add(db().normalizeEmployeeIdText ? db().normalizeEmployeeIdText(supplied) : supplied.toUpperCase());
            });
        }
        const seenKeys = new Set();
        const result = { type, previewRows: [], successRows: [], warningRows: [], failedRows: [], duplicateRows: [] };

        (rows || []).forEach((raw, idx) => {
            const row = mapRow(type, raw);
            row._rowIndex = raw._rowIndex || idx + 2;
            row._errors = [];
            row._warnings = [];

            schema.required.forEach(field => {
                if (!row[field]) row._errors.push((schema.labels[field] || field) + ' is required');
            });

            if (type === 'employees') {
                const suppliedEmpId = clean(row.empId);
                row.department = db().normalizeDepartmentName ? db().normalizeDepartmentName(row.department) : row.department;
                row.designation = db().normalizeDesignationName ? db().normalizeDesignationName(row.designation) : row.designation;
                row.email = db().normalizeEmail ? db().normalizeEmail(row.email) : clean(row.email).toLowerCase();
                row.phone = db().normalizePhone ? db().normalizePhone(row.phone) : clean(row.phone).replace(/\D/g, '');
                row.joinDate = normalizeDateValue(row.joinDate);
                row.employmentStatus = clean(row.employmentStatus || 'Active').replace(/\s+/g, ' ');
                row.role = global.EmployeeOnboardingService?.normalizeOnboardingRole
                    ? global.EmployeeOnboardingService.normalizeOnboardingRole(row.role || 'employee')
                    : clean(row.role || 'employee').replace(/[\s-]+/g, '_').toLowerCase();
                if (hasUnsafeText(row.department)) row._errors.push('Department contains invalid characters');
                if (hasUnsafeText(row.designation)) row._errors.push('Designation contains invalid characters');
                if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row._errors.push('Email format is invalid');
                if (row.employmentStatus && !['Active', 'Inactive', 'Resigned', 'Terminated'].includes(row.employmentStatus)) row._errors.push('Employment Status is invalid');
                if (!row.role || !['employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin'].includes(row.role)) row._errors.push('Portal Role is invalid or unsafe');
                if (suppliedEmpId) {
                    const rawFileKey = 'rawEmp:' + suppliedEmpId.toLowerCase();
                    if (seenKeys.has(rawFileKey)) row._errors.push('Duplicate supplied empId inside file');
                    seenKeys.add(rawFileKey);
                    const resolvedEmpId = db().resolveEmployeeId(suppliedEmpId, d);
                    if (employeeIds.has(resolvedEmpId)) {
                        row.empId = resolvedEmpId;
                    } else if (db().isOfficialEmployeeId && db().isOfficialEmployeeId(suppliedEmpId)) {
                        row.empId = db().normalizeEmployeeIdText ? db().normalizeEmployeeIdText(suppliedEmpId) : suppliedEmpId.toUpperCase();
                    } else if (db().isLegacyEmployeeId && db().isLegacyEmployeeId(suppliedEmpId)) {
                        row.legacyEmpId = suppliedEmpId.toUpperCase();
                        row.companyEmployeeCode = row.legacyEmpId;
                        row.empId = db().generateEmployeeId(d, reservedEmployeeIds);
                        row._warnings.push('Legacy empId normalized to official employee ID');
                    } else {
                        row._errors.push('empId must use official ARTH-EMP-YYYY-0001 format or legacy EMP number');
                    }
                }
                if (row.empId) {
                    const fileKey = 'emp:' + row.empId;
                    if (seenKeys.has(fileKey)) row._errors.push('Duplicate empId inside file');
                    seenKeys.add(fileKey);
                    reservedEmployeeIds.add(row.empId);
                }
                if (row.empId && employeeIds.has(row.empId)) {
                    row._warnings.push('Existing employee will be updated');
                    result.duplicateRows.push(row);
                }
                if (row.email) {
                    const emailKey = 'email:' + row.email;
                    if (seenKeys.has(emailKey)) row._errors.push('Duplicate email inside file');
                    seenKeys.add(emailKey);
                    const owner = emailToEmp.get(row.email);
                    if (owner && owner !== row.empId) row._errors.push('Email already belongs to another employee');
                }
                if (row.phone) {
                    const phoneKey = 'phone:' + row.phone;
                    if (seenKeys.has(phoneKey)) row._errors.push('Duplicate phone inside file');
                    seenKeys.add(phoneKey);
                    const owner = phoneToEmp.get(row.phone);
                    if (owner && owner !== row.empId) row._errors.push('Phone already belongs to another employee');
                }
                if (row.salary && !isNumber(row.salary)) row._errors.push('Salary must be numeric');
                if (row.salary && Number(row.salary) < 0) row._errors.push('Salary cannot be negative');
                if (row.joinDate && !isValidDate(row.joinDate)) row._errors.push('Join Date must be YYYY-MM-DD');
                if (row.managerId) {
                    const managerId = db().resolveEmployeeId(row.managerId, d);
                    if (!employeeIds.has(managerId) && !incomingEmployeeIds.has(managerId)) row._errors.push('Manager ID does not exist');
                    else if (managerId === row.empId) row._errors.push('Manager ID cannot be same as employee ID');
                    else {
                        row.managerId = managerId;
                        if (!employeeIds.has(managerId) && incomingEmployeeIds.has(managerId)) row._warnings.push('Manager exists in this same import batch');
                    }
                }
                if (row.shiftId && !shifts.has(row.shiftId)) row._errors.push('Shift ID does not exist');
                if (row.department && departments.size && !departments.has(row.department)) row._warnings.push('New department will be created in employee master data');
                if (row.phone && !/^\d{10}$/.test(row.phone.replace(/\D/g, ''))) row._warnings.push('Phone is not 10 digits');
            }

            if (type === 'attendance') {
                const empId = db().resolveEmployeeId(row.empId, d);
                if (!empId || !employeeIds.has(empId)) row._errors.push('Employee ID does not exist');
                else row.empId = empId;
                row.date = normalizeDateValue(row.date);
                row.checkIn = normalizeTimeValue(row.checkIn);
                row.checkOut = normalizeTimeValue(row.checkOut);
                if (row.date && !isValidDate(row.date)) row._errors.push('Date must be YYYY-MM-DD');
                if (row.date && isFutureDate(row.date)) row._errors.push('Future attendance cannot be imported');
                if (row.checkIn && !isValidTime(row.checkIn)) row._errors.push('Check In time is malformed');
                if (row.checkOut && !isValidTime(row.checkOut)) row._errors.push('Check Out time is malformed');
                if (row.checkIn && row.checkOut && row.checkOut < row.checkIn) row._warnings.push('Check Out is earlier than Check In; verify overnight shift before commit');
                const status = normalizeStatus(row.status);
                if (row.status && !['Present', 'Late', 'Absent', 'Leave'].includes(status)) row._errors.push('Status must be Present, Late, Absent, or Leave');
                row.status = status || row.status;
                if (row.shiftId && !shifts.has(row.shiftId)) row._errors.push('Shift ID does not exist');
                const fileKey = 'att:' + row.empId + ':' + row.date;
                if (row.empId && row.date && seenKeys.has(fileKey)) row._errors.push('Duplicate attendance row inside file');
                if (row.empId && row.date) seenKeys.add(fileKey);
                if ((d.attendance || []).some(a => a.empId === row.empId && a.date === row.date)) {
                    row._warnings.push('Existing attendance record will be updated');
                    result.duplicateRows.push(row);
                }
            }

            if (type === 'leave') {
                const empId = db().resolveEmployeeId(row.empId, d);
                if (!empId || !employeeIds.has(empId)) row._errors.push('Employee ID does not exist');
                else row.empId = empId;
                row.from = normalizeDateValue(row.from);
                row.to = normalizeDateValue(row.to);
                if (row.from && !isValidDate(row.from)) row._errors.push('From Date must be YYYY-MM-DD');
                if (row.to && !isValidDate(row.to)) row._errors.push('To Date must be YYYY-MM-DD');
                if (row.from && row.to && row.from > row.to) row._errors.push('From Date must be before To Date');
                row.type = db().normalizeLeaveType ? db().normalizeLeaveType(row.type) : row.type;
                const status = normalizeStatus(row.status || 'Pending');
                if (row.status && !['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status)) row._errors.push('Status must be Pending, Approved, Rejected, or Cancelled');
                row.status = status || 'Pending';
                ['managerStatus', 'hrStatus'].forEach(field => {
                    if (!row[field]) return;
                    const next = normalizeStatus(row[field]);
                    if (!['Pending', 'Approved', 'Rejected', 'Not required', 'Not Required'].includes(next)) row._errors.push((schema.labels[field] || field) + ' is invalid');
                    row[field] = next === 'Not required' ? 'Not Required' : next;
                });
                if (row.finalStatus) {
                    const finalStatus = clean(row.finalStatus).replace(/\s+/g, ' ');
                    if (!['Pending', 'Manager Approved', 'Approved', 'Rejected', 'Cancelled'].includes(finalStatus)) row._errors.push('Final Status is invalid');
                    row.finalStatus = finalStatus;
                }
                const fileKey = 'leave:' + row.empId + ':' + row.from + ':' + row.to + ':' + row.type;
                if (row.empId && row.from && row.to && seenKeys.has(fileKey)) row._errors.push('Duplicate leave row inside file');
                if (row.empId && row.from && row.to) seenKeys.add(fileKey);
                if ((d.leaveRequests || []).some(l => l.empId === row.empId && l.from === row.from && l.to === row.to && (l.type || l.leaveType) === row.type)) {
                    row._warnings.push('Existing leave request will be updated');
                    result.duplicateRows.push(row);
                }
            }

            if (type === 'payroll') {
                const empId = db().resolveEmployeeId(row.empId, d);
                if (!empId || !employeeIds.has(empId)) row._errors.push('Employee ID does not exist');
                else row.empId = empId;
                row.month = normalizeMonthValue(row.month);
                ['basicSalary', 'allowances', 'deductions', 'leaveDeductions', 'expenseReimbursements', 'overtimeAmount', 'bonus', 'finalSalary'].forEach(field => {
                    if (row[field] && !isNumber(row[field])) row._errors.push((schema.labels[field] || field) + ' must be numeric');
                    if (row[field] && isNumber(row[field]) && Number(row[field]) < 0) row._errors.push((schema.labels[field] || field) + ' cannot be negative');
                });
                const expectedNet = Number(row.basicSalary || 0) + Number(row.allowances || 0) + Number(row.overtimeAmount || 0) + Number(row.bonus || 0) + Number(row.expenseReimbursements || 0) - Number(row.deductions || 0) - Number(row.leaveDeductions || 0);
                if (row.finalSalary && isNumber(row.finalSalary) && Math.abs(Number(row.finalSalary) - expectedNet) > 1) {
                    row._warnings.push('Final salary does not match visible components; verify payroll calculation before commit');
                }
                if (row.status) {
                    const status = clean(row.status).replace(/\s+/g, ' ');
                    if (!['Pending', 'Approved', 'Paid', 'Hold', 'Rejected', 'Cancelled'].includes(status)) row._errors.push('Status must be Pending, Approved, Paid, Hold, Rejected, or Cancelled');
                    row.status = status;
                }
                const fileKey = 'pay:' + row.empId + ':' + row.month;
                if (row.empId && row.month && seenKeys.has(fileKey)) row._errors.push('Duplicate payroll row inside file');
                if (row.empId && row.month) seenKeys.add(fileKey);
                if ((d.payroll || []).some(p => p.empId === row.empId && (p.payrollMonth || p.month) === row.month)) {
                    row._warnings.push('Existing payroll record will be updated');
                    result.duplicateRows.push(row);
                }
            }

            row._status = row._errors.length ? 'FAILED' : row._warnings.length ? 'WARNING' : 'SUCCESS';
            result.previewRows.push(row);
            if (row._status === 'FAILED') result.failedRows.push(row);
            else if (row._status === 'WARNING') result.warningRows.push(row);
            else result.successRows.push(row);
        });

        result.summary = {
            totalRows: result.previewRows.length,
            successRows: result.successRows.length,
            warningRows: result.warningRows.length,
            failedRows: result.failedRows.length,
            duplicateRows: result.duplicateRows.length,
            executableRows: result.successRows.length + result.warningRows.length
        };
        return result;
    }

    function stageImport(type, validation, meta = {}) {
        if (!global.importStagingService?.stageImport) return { blocked: true, reason: 'Import staging service is not loaded' };
        const checked = validation && validation.previewRows ? validation : validateRows(type, validation || []);
        return global.importStagingService.stageImport(type, checked, meta);
    }

    function executeImport(type, validation, meta = {}) {
        const checked = validation && validation.previewRows ? validation : validateRows(type, validation || []);
        if (global.importStagingService?.stageAndCommitImport) {
            return global.importStagingService.stageAndCommitImport(type, checked, { ...meta, backend: 'local', actorRole: meta.actorRole || 'hr' });
        }
        return { blocked: true, reason: 'Safe import staging service is required before live commit', validation: checked };
        /* istanbul ignore next -- retained only for backward source compatibility; unreachable by design. */
        const executableRows = [...checked.successRows, ...checked.warningRows];
        if (!executableRows.length) return { blocked: true, reason: 'No valid rows to import', validation: checked };
        if (checked.failedRows.length > executableRows.length) return { blocked: true, reason: 'Validation failed for more rows than can be safely imported', validation: checked };

        const d = db().get();
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];

        executableRows.forEach(row => {
            try {
                if (type === 'employees') {
                    const existing = (d.employees || []).find(e => e.id === row.empId);
                    const payload = db().normalizeEmployeePayload({
                        id: row.empId,
                        name: row.fullName,
                        dept: row.department,
                        desig: row.designation,
                        managerId: row.managerId || null,
                        salary: Number(row.salary || 0),
                        doj: row.joinDate,
                        branch: row.branch || 'Head Office',
                        location: row.branch || 'Head Office',
                        shiftId: row.shiftId || 'SH002',
                        mobile: row.phone || '',
                        email: row.email || '',
                        employeeCode: row.companyEmployeeCode || row.legacyEmpId || row.empId,
                        companyEmployeeCode: row.companyEmployeeCode || row.legacyEmpId || row.empId,
                        legacyEmpId: row.legacyEmpId || '',
                        legacyIds: row.legacyEmpId ? [row.legacyEmpId] : [],
                        employmentStatus: row.employmentStatus || 'Active',
                        role: row.role || 'employee',
                        password: '',
                        authStatus: 'Invite Required',
                        inviteStatus: 'Not Invited',
                        activationStatus: 'Not Activated'
                    }, d);
                    if (existing) { Object.assign(existing, payload, { id: existing.id }); updated++; }
                    else { d.employees.push(payload); imported++; }
                }
                if (type === 'attendance') {
                    const rec = {
                        empId: row.empId,
                        date: row.date,
                        checkIn: row.checkIn || null,
                        checkOut: row.checkOut || null,
                        status: row.status || 'Present',
                        shiftId: row.shiftId || ((d.employees || []).find(e => e.id === row.empId)?.shiftId || 'SH002'),
                        workingHours: row.checkIn && row.checkOut ? db().calcWorkingHours(row.checkIn, row.checkOut) : null
                    };
                    const existing = (d.attendance || []).find(a => a.empId === rec.empId && a.date === rec.date);
                    if (existing) { Object.assign(existing, rec); updated++; }
                    else { d.attendance.push(rec); imported++; }
                }
                if (type === 'payroll') {
                    const basic = Number(row.basicSalary || 0);
                    const allowances = Number(row.allowances || 0);
                    const deductions = Number(row.deductions || 0);
                    const leaveDeductions = Number(row.leaveDeductions || 0);
                    const expenseReimbursements = Number(row.expenseReimbursements || 0);
                    const overtimeAmount = Number(row.overtimeAmount || 0);
                    const bonus = Number(row.bonus || 0);
                    const finalSalary = Number(row.finalSalary || 0);
                    const payrollId = db().generatePayrollId ? db().generatePayrollId(d) : db().generateSequentialId('PAY', d.payroll || [], 3);
                    const rec = {
                        id: payrollId,
                        payrollId,
                        empId: row.empId,
                        month: row.month,
                        payrollMonth: row.month,
                        basic,
                        basicSalary: basic,
                        hra: 0,
                        special: allowances + bonus,
                        transport: 0,
                        pf: 0,
                        esic: 0,
                        pt: 0,
                        tds: deductions,
                        allowances,
                        deductions,
                        leaveDeductions,
                        expenseReimbursements,
                        overtimeAmount,
                        bonusAmount: bonus,
                        gross: basic + allowances + overtimeAmount + bonus,
                        grossSalary: basic + allowances + overtimeAmount + bonus,
                        net: finalSalary,
                        netSalary: Math.max(0, finalSalary),
                        status: row.status || 'Pending',
                        payrollStatus: row.status || 'Pending',
                        paidOn: null,
                        processedAt: new Date().toISOString(),
                        source: 'import'
                    };
                    const existing = (d.payroll || []).find(p => p.empId === row.empId && (p.payrollMonth || p.month) === row.month);
                    if (existing) { Object.assign(existing, rec, { id: existing.id, payrollId: existing.payrollId || existing.id }); updated++; }
                    else { d.payroll.push(rec); imported++; }
                }
                if (type === 'leave') {
                    const existing = (d.leaveRequests || []).find(l => l.empId === row.empId && l.from === row.from && l.to === row.to && (l.type || l.leaveType) === row.type);
                    const leaveId = row.leaveId || existing?.leaveId || existing?.id || db().generateLeaveId(d);
                    const rec = db()._normalizeLeaveRecord ? db()._normalizeLeaveRecord({
                        id: leaveId,
                        leaveId,
                        empId: row.empId,
                        type: row.type,
                        from: row.from,
                        to: row.to,
                        reason: row.reason,
                        status: row.status || 'Pending',
                        managerStatus: row.managerStatus || (row.status === 'Approved' ? 'Approved' : 'Pending'),
                        hrStatus: row.hrStatus || (row.status === 'Approved' ? 'Approved' : 'Pending'),
                        finalStatus: row.finalStatus || (row.status === 'Approved' ? 'Approved' : row.status === 'Rejected' ? 'Rejected' : 'Pending'),
                        remarks: row.remarks || '',
                        source: 'import'
                    }, d) : {
                        id: leaveId,
                        leaveId,
                        empId: row.empId,
                        type: row.type,
                        from: row.from,
                        to: row.to,
                        reason: row.reason,
                        status: row.status || 'Pending',
                        appliedOn: db().today()
                    };
                    if (existing) { Object.assign(existing, rec, { id: existing.id, leaveId: existing.leaveId || existing.id }); updated++; }
                    else { d.leaveRequests.push(rec); imported++; }
                }
            } catch (err) {
                skipped++;
                errors.push('Row ' + row._rowIndex + ': ' + (err.message || err));
            }
        });

        db().normalizeDataArchitecture(d);
        db().save(d);

        const log = db().addImportLog({
            importType: type,
            type,
            fileName: meta.fileName || '',
            totalRows: checked.summary.totalRows,
            successRows: imported + updated,
            failedRows: checked.summary.failedRows + skipped,
            duplicateRows: checked.summary.duplicateRows,
            imported,
            updated,
            skipped,
            errors,
            importedBy: meta.importedBy || 'HR',
            importedAt: new Date().toISOString()
        });
        if (db().writeAuditLog) {
            db().writeAuditLog('hr', '', 'data import completed', 'Import Center', log.importId || log.id, `${type} import completed from ${log.fileName || 'uploaded file'} with ${log.successRows} successful rows`);
        }
        emitImportWorkflow(type, log, 'local');
        return { blocked: false, imported, updated, skipped, log, validation: checked };
    }

    function emitImportWorkflow(type, log, backend = 'local') {
        if (!global.workflowEngine?.emitWorkflowEvent || !log) return null;
        return global.workflowEngine.emitWorkflowEvent(global.WORKFLOW_EVENTS?.IMPORT_COMPLETED || 'IMPORT_COMPLETED', {
            actorRole: 'hr',
            actorId: '',
            module: 'Import Center',
            targetId: log.importId || log.id,
            title: 'Import Completed',
            message: `${type} import completed from ${log.fileName || 'uploaded file'} with ${log.successRows || 0} successful rows.`,
            priority: Number(log.failedRows || 0) > 0 ? 'HIGH' : 'LOW',
            metadata: {
                importType: type,
                fileName: log.fileName || '',
                successRows: log.successRows || 0,
                failedRows: log.failedRows || 0,
                duplicateRows: log.duplicateRows || 0,
                backend
            },
            suppressAudit: true
        });
    }

    function supabaseImportsReady(type) {
        const svc = global.supabaseClientService;
        if (!svc || !svc.isEnabled || !svc.isEnabled('USE_SUPABASE_IMPORTS')) return false;
        if (type === 'employees') return !!(global.employeeService && global.employeeService.isSupabaseEmployeesEnabled && global.employeeService.isSupabaseEmployeesEnabled());
        if (type === 'attendance') return !!(global.attendanceService && global.attendanceService.isSupabaseAttendanceEnabled && global.attendanceService.isSupabaseAttendanceEnabled());
        if (type === 'leave') return !!(global.leaveService && global.leaveService.isSupabaseLeaveEnabled && global.leaveService.isSupabaseLeaveEnabled());
        if (type === 'payroll') return !!(global.payrollService && global.payrollService.isSupabasePayrollEnabled && global.payrollService.isSupabasePayrollEnabled());
        return false;
    }

    async function executeImportLive(type, validation, meta = {}) {
        if (!supabaseImportsReady(type)) return executeImport(type, validation, meta);
        const checked = validation && validation.previewRows ? validation : validateRows(type, validation || []);
        if (global.importStagingService?.stageAndCommitImport) {
            return global.importStagingService.stageAndCommitImport(type, checked, { ...meta, backend: 'supabase', actorRole: meta.actorRole || 'hr' });
        }
        return { blocked: true, reason: 'Safe import staging service is required before live commit', validation: checked };
        /* istanbul ignore next -- retained only for backward source compatibility; unreachable by design. */
        const executableRows = [...checked.successRows, ...checked.warningRows];
        if (!executableRows.length) return { blocked: true, reason: 'No valid rows to import', validation: checked };
        if (checked.failedRows.length > executableRows.length) return { blocked: true, reason: 'Validation failed for more rows than can be safely imported', validation: checked };

        if (type === 'attendance') {
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            const errors = [];
            for (const row of executableRows) {
                try {
                    const data = db().get();
                    const existing = (data.attendance || []).find(a => a.empId === row.empId && a.date === row.date);
                    const emp = (data.employees || []).find(e => e.id === row.empId) || {};
                    await global.attendanceService.createAttendance({
                        attendanceId: existing?.attendanceId || existing?.id || '',
                        empId: row.empId,
                        date: row.date,
                        attendanceDate: row.date,
                        checkIn: row.checkIn || null,
                        checkOut: row.checkOut || null,
                        status: row.status || (row.checkIn ? 'Present' : 'Absent'),
                        shiftId: row.shiftId || emp.shiftId || 'SH002',
                        workingHours: row.checkIn && row.checkOut ? db().calcWorkingHours(row.checkIn, row.checkOut) : null,
                        source: 'import'
                    });
                    if (existing) updated++;
                    else imported++;
                } catch (err) {
                    skipped++;
                    errors.push('Row ' + row._rowIndex + ': ' + (err.message || err));
                }
            }
            const log = db().addImportLog({
                importType: type,
                type,
                fileName: meta.fileName || '',
                totalRows: checked.summary.totalRows,
                successRows: imported + updated,
                failedRows: checked.summary.failedRows + skipped,
                duplicateRows: checked.summary.duplicateRows,
                imported,
                updated,
                skipped,
                errors,
                importedBy: meta.importedBy || 'HR',
                importedAt: new Date().toISOString(),
                backend: 'supabase'
            });
            if (db().writeAuditLog) {
                db().writeAuditLog('hr', '', 'attendance import completed', 'Import Center', log.importId || log.id, `Attendance import completed from ${log.fileName || 'uploaded file'} with ${log.successRows} successful rows`);
            }
            emitImportWorkflow(type, log, 'supabase');
            return { blocked: false, imported, updated, skipped, log, validation: checked, backend: 'supabase' };
        }

        if (type === 'leave') {
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            const errors = [];
            for (const row of executableRows) {
                try {
                    const data = db().get();
                    const existing = (data.leaveRequests || []).find(l => l.empId === row.empId && l.from === row.from && l.to === row.to && (l.type || l.leaveType) === row.type);
                    await global.leaveService.createLeave({
                        leaveId: row.leaveId || existing?.leaveId || existing?.id || '',
                        empId: row.empId,
                        type: row.type,
                        leaveType: row.type,
                        from: row.from,
                        to: row.to,
                        reason: row.reason,
                        status: row.status || 'Pending',
                        managerStatus: row.managerStatus || (row.status === 'Approved' ? 'Approved' : 'Pending'),
                        hrStatus: row.hrStatus || (row.status === 'Approved' ? 'Approved' : 'Pending'),
                        finalStatus: row.finalStatus || (row.status === 'Approved' ? 'Approved' : row.status === 'Rejected' ? 'Rejected' : 'Pending'),
                        remarks: row.remarks || '',
                        source: 'import'
                    });
                    if (existing) updated++;
                    else imported++;
                } catch (err) {
                    skipped++;
                    errors.push('Row ' + row._rowIndex + ': ' + (err.message || err));
                }
            }
            const log = db().addImportLog({
                importType: type,
                type,
                fileName: meta.fileName || '',
                totalRows: checked.summary.totalRows,
                successRows: imported + updated,
                failedRows: checked.summary.failedRows + skipped,
                duplicateRows: checked.summary.duplicateRows,
                imported,
                updated,
                skipped,
                errors,
                importedBy: meta.importedBy || 'HR',
                importedAt: new Date().toISOString(),
                backend: 'supabase'
            });
            if (db().writeAuditLog) {
                db().writeAuditLog('hr', '', 'leave import completed', 'Import Center', log.importId || log.id, `Leave import completed from ${log.fileName || 'uploaded file'} with ${log.successRows} successful rows`);
            }
            emitImportWorkflow(type, log, 'supabase');
            return { blocked: false, imported, updated, skipped, log, validation: checked, backend: 'supabase' };
        }

        if (type === 'payroll') {
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            const errors = [];
            for (const row of executableRows) {
                try {
                    const data = db().get();
                    const existing = (data.payroll || []).find(p => p.empId === row.empId && (p.payrollMonth || p.month) === row.month);
                    await global.payrollService.createPayrollRecord({
                        payrollId: existing?.payrollId || existing?.id || '',
                        empId: row.empId,
                        payrollMonth: row.month,
                        basicSalary: Number(row.basicSalary || 0),
                        allowances: Number(row.allowances || 0),
                        deductions: Number(row.deductions || 0),
                        leaveDeductions: Number(row.leaveDeductions || 0),
                        expenseReimbursements: Number(row.expenseReimbursements || 0),
                        overtimeAmount: Number(row.overtimeAmount || 0),
                        bonusAmount: Number(row.bonus || 0),
                        grossSalary: Number(row.basicSalary || 0) + Number(row.allowances || 0) + Number(row.overtimeAmount || 0) + Number(row.bonus || 0),
                        netSalary: Number(row.finalSalary || 0),
                        payrollStatus: row.status || 'Pending',
                        processedBy: meta.importedBy || 'HR',
                        processedAt: new Date().toISOString(),
                        remarks: 'Imported from payroll template',
                        source: 'import'
                    });
                    if (existing) updated++;
                    else imported++;
                } catch (err) {
                    skipped++;
                    errors.push('Row ' + row._rowIndex + ': ' + (err.message || err));
                }
            }
            const log = db().addImportLog({
                importType: type,
                type,
                fileName: meta.fileName || '',
                totalRows: checked.summary.totalRows,
                successRows: imported + updated,
                failedRows: checked.summary.failedRows + skipped,
                duplicateRows: checked.summary.duplicateRows,
                imported,
                updated,
                skipped,
                errors,
                importedBy: meta.importedBy || 'HR',
                importedAt: new Date().toISOString(),
                backend: 'supabase'
            });
            if (db().writeAuditLog) {
                db().writeAuditLog('hr', '', 'payroll import completed', 'Import Center', log.importId || log.id, `Payroll import completed from ${log.fileName || 'uploaded file'} with ${log.successRows} successful rows`);
            }
            emitImportWorkflow(type, log, 'supabase');
            return { blocked: false, imported, updated, skipped, log, validation: checked, backend: 'supabase' };
        }

        if (type !== 'employees') return executeImport(type, checked, meta);

        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];
        for (const row of executableRows) {
            try {
                const existing = db().getEmployee(row.empId);
                await global.employeeService.createEmployeeLive({
                    id: row.empId,
                    name: row.fullName,
                    dept: row.department,
                    desig: row.designation,
                    managerId: row.managerId || null,
                    salary: Number(row.salary || 0),
                    doj: row.joinDate,
                    branch: row.branch || 'Head Office',
                    location: row.branch || 'Head Office',
                    shiftId: row.shiftId || 'SH002',
                    mobile: row.phone || '',
                    email: row.email || '',
                    employeeCode: row.companyEmployeeCode || row.legacyEmpId || row.empId,
                    companyEmployeeCode: row.companyEmployeeCode || row.legacyEmpId || row.empId,
                    legacyEmpId: row.legacyEmpId || '',
                    legacyIds: row.legacyEmpId ? [row.legacyEmpId] : [],
                    employmentStatus: row.employmentStatus || 'Active',
                    source: 'import'
                });
                if (existing) updated++;
                else imported++;
            } catch (err) {
                skipped++;
                errors.push('Row ' + row._rowIndex + ': ' + (err.message || err));
            }
        }
        const log = db().addImportLog({
            importType: type,
            type,
            fileName: meta.fileName || '',
            totalRows: checked.summary.totalRows,
            successRows: imported + updated,
            failedRows: checked.summary.failedRows + skipped,
            duplicateRows: checked.summary.duplicateRows,
            imported,
            updated,
            skipped,
            errors,
            importedBy: meta.importedBy || 'HR',
            importedAt: new Date().toISOString()
        });
        emitImportWorkflow(type, log, 'supabase');
        return { blocked: false, imported, updated, skipped, log, validation: checked, backend: 'supabase' };
    }

    function getTemplateRows(type) {
        const templates = {
            employees: [{ empId: 'ARTH-EMP-2026-0006', fullName: 'Sample Employee', department: 'Engineering', designation: 'Executive', managerId: 'ARTH-EMP-2026-0001', salary: '50000', joinDate: '2026-05-01', branch: 'Head Office', shiftId: 'SH002', phone: '9876543210', email: 'sample.employee@company.com', employmentStatus: 'Active' }],
            attendance: [{ empId: 'ARTH-EMP-2026-0002', date: '2026-05-10', checkIn: '09:05', checkOut: '18:10', status: 'Present', shiftId: 'SH002' }],
            leave: [{ empId: 'ARTH-EMP-2026-0002', type: 'Casual Leave', from: '2026-05-20', to: '2026-05-21', reason: 'Personal work', status: 'Pending', managerStatus: 'Pending', hrStatus: 'Pending', finalStatus: 'Pending', remarks: '' }],
            payroll: [{ empId: 'ARTH-EMP-2026-0002', month: 'May 2026', basicSalary: '40000', allowances: '12000', deductions: '2500', leaveDeductions: '0', expenseReimbursements: '0', overtimeAmount: '0', bonus: '3000', finalSalary: '52500', status: 'Pending' }]
        };
        return templates[type] || [];
    }

    async function parseWorkbookFile(file, xlsxLib) {
        const XLSX = xlsxLib || global.XLSX;
        if (!XLSX) throw new Error('XLSX library is not loaded');
        const security = global.FrontendSecurityService;
        if (!security?.validateFile) throw new Error('Frontend file security service is not loaded');
        const validation = await security.validateFile(file, 'spreadsheet');
        if (!validation.valid) throw new Error(validation.errors[0] || 'Import file validation failed');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        if (!workbook.SheetNames?.length) throw new Error('Workbook does not contain a readable sheet');
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    const importService = { schemas, getSchemas: () => schemas, getSchema: type => schemas[type], validateRows, stageImport, executeImport, executeImportLive, isSupabaseImportEnabled: supabaseImportsReady, getTemplateRows, parseWorkbookFile, mapRow };
    global.importService = global.importService || importService;
})(typeof window !== 'undefined' ? window : globalThis);
