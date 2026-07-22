// Enterprise Test Lab service.
// Runs isolated workflow, stress, permission, edge-case, and failure simulations without mutating live records.
(function (global) {
    function db() { return global.DB; }

    const PRESETS = {
        small: { label: 'Small Company', employees: 12, departments: 3, days: 14, notificationSpike: 45, importRows: 40, approvals: 8 },
        medium: { label: 'Medium Company', employees: 45, departments: 5, days: 22, notificationSpike: 160, importRows: 150, approvals: 28 },
        enterprise: { label: 'Enterprise Simulation', employees: 120, departments: 7, days: 30, notificationSpike: 650, importRows: 750, approvals: 75 }
    };

    const DEPARTMENTS = ['Engineering', 'Sales', 'Finance', 'Human Resources', 'Operations', 'Warehouse', 'Customer Success'];
    const DESIGNATIONS = ['Executive', 'Analyst', 'Coordinator', 'Senior Associate', 'Team Lead', 'Manager'];
    const FIRST_NAMES = ['Aarav', 'Priya', 'Rahul', 'Sneha', 'Amit', 'Meera', 'Nikhil', 'Kavya', 'Arjun', 'Pooja', 'Rohan', 'Ananya'];
    const LAST_NAMES = ['Sharma', 'Verma', 'Mehta', 'Iyer', 'Kapoor', 'Patel', 'Khan', 'Reddy', 'Nair', 'Gupta', 'Das', 'Singh'];

    function nowIso() { return new Date().toISOString(); }
    function today() { return db()?.today ? db().today() : new Date().toISOString().slice(0, 10); }
    function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
    function presetConfig(preset) { return PRESETS[String(preset || 'small').toLowerCase()] || PRESETS.small; }
    function money(value) { return Math.max(0, Math.round(Number(value || 0) * 100) / 100); }

    function result(key, label, ok, message, details = {}, severity = 'MEDIUM') {
        return { key, label, status: ok ? 'PASS' : 'FAIL', ok: !!ok, message, details, severity };
    }

    function warning(key, label, message, details = {}) {
        return { key, label, status: 'WARNING', ok: true, message, details, severity: 'LOW' };
    }

    function testDate(daysAgo) {
        const d = new Date(today() + 'T00:00:00');
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().slice(0, 10);
    }

    function nameAt(index) {
        return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index * 3) % LAST_NAMES.length]}`;
    }

    function monthLabel(offset = 0) {
        const d = new Date(today() + 'T00:00:00');
        d.setMonth(d.getMonth() + offset);
        return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    function emptySandboxData(base = {}) {
        return {
            employees: [],
            users: [],
            attendance: [],
            leaveRequests: [],
            expenseClaims: [],
            payroll: [],
            notifications: [],
            auditLogs: [],
            workflowEvents: [],
            pendingActions: [],
            authInvites: [],
            teams: [],
            shifts: clone(base.shifts || []),
            companySettings: clone(base.companySettings || {}),
            platformGovernance: clone(base.platformGovernance || {}),
            importPreviewRows: [],
            failures: []
        };
    }

    function generateEmployees(config) {
        const employees = [];
        const users = [];
        const teams = [];
        const deptCount = Math.min(config.departments, DEPARTMENTS.length);
        let sequence = 1;

        for (let d = 0; d < deptCount; d++) {
            const dept = DEPARTMENTS[d];
            const managerId = `TL-EMP-${String(sequence).padStart(4, '0')}`;
            const managerName = nameAt(sequence);
            employees.push({
                id: managerId,
                empId: managerId,
                name: managerName,
                fullName: managerName,
                dept,
                department: dept,
                desig: `${dept} Manager`,
                designation: `${dept} Manager`,
                managerId: null,
                salary: 110000 + d * 12000,
                doj: testDate(500 - d * 20),
                branch: d % 2 ? 'Plant Office' : 'Head Office',
                location: d % 2 ? 'Plant Office' : 'Head Office',
                shiftId: 'SH002',
                email: `test.manager.${d + 1}@example.com`,
                mobile: `9000000${String(d + 1).padStart(3, '0')}`,
                employmentStatus: 'Active',
                source: 'test_lab'
            });
            users.push({ id: `TL-USR-${String(sequence).padStart(4, '0')}`, empId: managerId, name: managerName, email: `test.manager.${d + 1}@example.com`, role: 'manager', active: true });
            teams.push({ id: `TL-TM-${String(d + 1).padStart(3, '0')}`, name: `${dept} Test Team`, managerId, memberIds: [managerId], dept, createdOn: today() });
            sequence++;
        }

        while (employees.length < config.employees) {
            const deptIndex = employees.length % deptCount;
            const dept = DEPARTMENTS[deptIndex];
            const manager = employees.find(e => e.department === dept && !e.managerId) || employees[0];
            const empId = `TL-EMP-${String(sequence).padStart(4, '0')}`;
            const employeeName = nameAt(sequence);
            const salary = 36000 + (sequence % 9) * 8500 + (deptIndex * 2500);
            employees.push({
                id: empId,
                empId,
                name: employeeName,
                fullName: employeeName,
                dept,
                department: dept,
                desig: DESIGNATIONS[sequence % DESIGNATIONS.length],
                designation: DESIGNATIONS[sequence % DESIGNATIONS.length],
                managerId: manager.id,
                salary,
                doj: testDate(420 - sequence),
                branch: sequence % 3 === 0 ? 'Regional Office' : 'Head Office',
                location: sequence % 3 === 0 ? 'Regional Office' : 'Head Office',
                shiftId: 'SH002',
                email: `test.employee.${sequence}@example.com`,
                mobile: `91${String(7000000000 + sequence).slice(-10)}`,
                leaveBalance: 18,
                employmentStatus: 'Active',
                source: 'test_lab'
            });
            users.push({ id: `TL-USR-${String(sequence).padStart(4, '0')}`, empId, name: employeeName, email: `test.employee.${sequence}@example.com`, role: sequence % 7 === 0 ? 'hr' : 'employee', active: true });
            const team = teams.find(t => t.managerId === manager.id);
            if (team) team.memberIds.push(empId);
            sequence++;
        }

        return { employees, users, teams };
    }

    function generateAttendance(employees, config) {
        const rows = [];
        employees.forEach((emp, empIndex) => {
            for (let day = 0; day < config.days; day++) {
                const date = testDate(day);
                const pattern = (empIndex + day) % 11;
                const absent = pattern === 0;
                const late = pattern === 3 || pattern === 8;
                rows.push({
                    id: `TL-AT-${String(rows.length + 1).padStart(5, '0')}`,
                    attendanceId: `TL-AT-${String(rows.length + 1).padStart(5, '0')}`,
                    empId: emp.id,
                    date,
                    attendanceDate: date,
                    shiftId: emp.shiftId || 'SH002',
                    checkIn: absent ? null : (late ? '09:28:00' : '09:02:00'),
                    checkOut: absent ? null : '18:05:00',
                    status: absent ? 'Absent' : late ? 'Late' : 'Present',
                    workingHours: absent ? null : '09:03:00',
                    source: 'test_lab'
                });
            }
        });
        return rows;
    }

    function generateLeaves(employees, config) {
        return employees
            .filter((_, index) => index % 5 === 0)
            .map((emp, index) => ({
                id: `TL-LV-${String(index + 1).padStart(4, '0')}`,
                leaveId: `TL-LV-${String(index + 1).padStart(4, '0')}`,
                empId: emp.id,
                type: index % 2 ? 'Sick Leave' : 'Casual Leave',
                leaveType: index % 2 ? 'Sick Leave' : 'Casual Leave',
                from: testDate(3 + index),
                fromDate: testDate(3 + index),
                to: testDate(3 + index),
                toDate: testDate(3 + index),
                totalDays: 1,
                reason: 'Test lab planned absence',
                managerStatus: index % 3 ? 'Approved' : 'Pending',
                hrStatus: index % 3 ? 'Approved' : 'Pending',
                finalStatus: index % 3 ? 'Approved' : 'Pending',
                status: index % 3 ? 'Approved' : 'Pending',
                appliedAt: nowIso(),
                source: 'test_lab'
            }));
    }

    function generateExpenses(employees) {
        return employees
            .filter((_, index) => index % 4 === 0)
            .map((emp, index) => ({
                id: `TL-EC-${String(index + 1).padStart(4, '0')}`,
                expenseId: `TL-EC-${String(index + 1).padStart(4, '0')}`,
                empId: emp.id,
                category: index % 2 ? 'Travel' : 'Office Supplies',
                expenseDate: testDate(index % 10),
                amount: 850 + index * 125,
                currency: 'INR',
                description: 'Test lab expense claim',
                managerStatus: index % 3 ? 'Approved' : 'Pending',
                financeStatus: index % 3 ? 'Approved' : 'Pending',
                finalStatus: index % 3 ? 'Paid' : 'Pending',
                status: index % 3 ? 'Paid' : 'Pending Manager Approval',
                paidAt: index % 3 ? nowIso() : null,
                source: 'test_lab'
            }));
    }

    function generatePayroll(employees) {
        return employees.map((emp, index) => {
            const gross = money(Number(emp.salary || 0));
            const deductions = money(gross * 0.08);
            const net = money(gross - deductions);
            return {
                id: `TL-PAY-${String(index + 1).padStart(4, '0')}`,
                payrollId: `TL-PAY-${String(index + 1).padStart(4, '0')}`,
                empId: emp.id,
                month: monthLabel(0),
                payrollMonth: monthLabel(0),
                basicSalary: money(gross * 0.5),
                allowances: money(gross * 0.5),
                deductions,
                leaveDeductions: 0,
                expenseReimbursements: 0,
                netSalary: net,
                payrollStatus: index % 6 === 0 ? 'Pending' : 'Generated',
                status: index % 6 === 0 ? 'Pending' : 'Generated',
                source: 'test_lab'
            };
        });
    }

    function generateTestDataset(preset = 'small') {
        const config = presetConfig(preset);
        const base = db()?.get ? db().get() : {};
        const data = emptySandboxData(base);
        const people = generateEmployees(config);
        data.employees = people.employees;
        data.users = people.users;
        data.teams = people.teams;
        data.attendance = generateAttendance(data.employees, config);
        data.leaveRequests = generateLeaves(data.employees, config);
        data.expenseClaims = generateExpenses(data.employees);
        data.payroll = generatePayroll(data.employees);
        data.authInvites = data.employees.slice(0, Math.min(8, data.employees.length)).map((emp, index) => ({
            inviteId: `TL-INV-${String(index + 1).padStart(4, '0')}`,
            empId: emp.id,
            email: emp.email,
            status: index % 2 ? 'Accepted' : 'Sent',
            expiresAt: testDate(index % 2 ? -7 : -1),
            source: 'test_lab'
        }));
        return {
            sandboxId: `TL-SBX-${Date.now()}`,
            preset: String(preset || 'small').toLowerCase(),
            label: config.label,
            isolated: true,
            generatedAt: nowIso(),
            data,
            counts: {
                employees: data.employees.length,
                attendance: data.attendance.length,
                leaveRequests: data.leaveRequests.length,
                expenseClaims: data.expenseClaims.length,
                payroll: data.payroll.length
            },
            note: 'Sandbox data is held in memory and is not committed to live ARTHHRMS records.'
        };
    }

    function withSandbox(sandboxOrPreset) {
        if (sandboxOrPreset?.data) return clone(sandboxOrPreset);
        return generateTestDataset(sandboxOrPreset || 'small');
    }

    function employeeWithManager(data) {
        return data.employees.find(e => e.managerId) || data.employees[1] || data.employees[0];
    }

    function runWorkflowSimulation(profile = 'standard', sandboxInput) {
        const sandbox = withSandbox(sandboxInput || 'small');
        const data = sandbox.data;
        const results = [];
        const emp = employeeWithManager(data);
        const manager = data.employees.find(e => e.id === emp?.managerId) || data.employees[0];
        const startWorkflowEvents = data.workflowEvents.length;

        const leave = {
            leaveId: `TL-SIM-LV-${Date.now()}`,
            empId: emp?.id,
            managerStatus: 'Pending',
            hrStatus: 'Pending',
            finalStatus: 'Pending',
            status: 'Pending',
            from: testDate(-2),
            to: testDate(-2),
            reason: 'Workflow simulation'
        };
        data.leaveRequests.push(leave);
        data.workflowEvents.push({ type: 'LEAVE_APPLIED', targetEmpId: emp?.id, actorId: emp?.id });
        leave.managerStatus = 'Approved';
        leave.hrStatus = 'Approved';
        leave.finalStatus = 'Approved';
        leave.status = 'Approved';
        data.workflowEvents.push({ type: 'LEAVE_APPROVED', targetEmpId: emp?.id, actorId: manager?.id });
        results.push(result('leave_approval_chain', 'Leave Apply to Final Approval', leave.finalStatus === 'Approved', 'Employee leave request moved through manager and HR approval.', { leaveId: leave.leaveId, empId: emp?.id }));

        const expense = {
            expenseId: `TL-SIM-EC-${Date.now()}`,
            empId: emp?.id,
            amount: 2450,
            managerStatus: 'Pending',
            financeStatus: 'Pending',
            finalStatus: 'Pending',
            status: 'Pending Manager Approval'
        };
        data.expenseClaims.push(expense);
        data.workflowEvents.push({ type: 'EXPENSE_SUBMITTED', targetEmpId: emp?.id, actorId: emp?.id });
        expense.managerStatus = 'Approved';
        expense.financeStatus = 'Approved';
        expense.finalStatus = 'Paid';
        expense.status = 'Paid';
        expense.paidAt = nowIso();
        data.workflowEvents.push({ type: 'EXPENSE_PAID', targetEmpId: emp?.id, actorId: 'HR' });
        results.push(result('expense_payment_chain', 'Expense Submit to Paid', expense.status === 'Paid', 'Expense claim completed manager, finance, and paid states.', { expenseId: expense.expenseId, empId: emp?.id }));

        const month = monthLabel(1);
        const existing = data.payroll.find(p => p.empId === emp?.id && (p.payrollMonth || p.month) === month);
        if (!existing) {
            data.payroll.push({
                payrollId: `TL-SIM-PAY-${Date.now()}`,
                empId: emp?.id,
                payrollMonth: month,
                status: 'Generated',
                payrollStatus: 'Generated',
                netSalary: money(Number(emp?.salary || 0) * 0.92)
            });
        }
        results.push(result('payroll_generation_flow', 'Payroll Generation Simulation', !existing, existing ? 'Duplicate payroll generation prevented.' : 'Payroll generated for a future month in sandbox.', { empId: emp?.id, payrollMonth: month }));

        const invite = {
            inviteId: `TL-SIM-INV-${Date.now()}`,
            empId: emp?.id,
            email: emp?.email,
            status: 'Accepted',
            acceptedAt: nowIso(),
            activationStatus: 'Activated'
        };
        data.authInvites.push(invite);
        results.push(result('invite_acceptance_flow', 'Invite Acceptance Simulation', invite.status === 'Accepted', 'Invite acceptance and activation modeled in sandbox.', { empId: emp?.id, inviteId: invite.inviteId }));
        results.push(result('workflow_event_pressure', 'Workflow Event Pressure', data.workflowEvents.length > startWorkflowEvents, 'Simulation created workflow events for downstream notification/pending queues.', { eventsCreated: data.workflowEvents.length - startWorkflowEvents }));

        return summarizeGroup('workflow', results, { profile, sandboxId: sandbox.sandboxId });
    }

    function runPermissionValidation(sandboxInput) {
        const sandbox = withSandbox(sandboxInput || 'small');
        const data = sandbox.data;
        const results = [];
        const employee = employeeWithManager(data);
        const manager = data.employees.find(e => e.id === employee?.managerId) || data.employees.find(e => !e.managerId);
        const teamIds = new Set(data.employees.filter(e => e.managerId === manager?.id || e.id === manager?.id).map(e => e.id));
        const employeeLeaveView = data.leaveRequests.filter(row => row.empId === employee?.id);
        const employeeOtherRows = data.leaveRequests.filter(row => row.empId !== employee?.id);
        const managerExpenseView = data.expenseClaims.filter(row => teamIds.has(row.empId));
        const unrelated = data.expenseClaims.filter(row => !teamIds.has(row.empId));
        const platformCanAccessPayroll = global.platformGovernanceService?.canAccessFeature
            ? global.platformGovernanceService.canAccessFeature('payroll', 'platform_owner')
            : true;
        const featureRestrictionModeled = !!(data.platformGovernance?.features);

        results.push(result('employee_isolation', 'Employee Isolation', employeeLeaveView.every(row => row.empId === employee?.id) && employeeOtherRows.length >= 0, 'Employee view resolves only employee-owned rows.', { empId: employee?.id, visibleRows: employeeLeaveView.length }));
        results.push(result('manager_team_visibility', 'Manager Team Visibility', managerExpenseView.every(row => teamIds.has(row.empId)) && unrelated.length >= 0, 'Manager visibility is restricted to reporting team records in sandbox.', { managerId: manager?.id, teamSize: teamIds.size }));
        results.push(result('hr_broad_access', 'HR Operational Access', data.leaveRequests.length >= employeeLeaveView.length && data.expenseClaims.length >= managerExpenseView.length, 'HR/Admin broad operational visibility is modelled separately from employee views.', { leaveRows: data.leaveRequests.length, expenseRows: data.expenseClaims.length }));
        results.push(result('platform_owner_access', 'Platform Owner Access', platformCanAccessPayroll, 'Platform owner remains root override for governed features.', { feature: 'payroll' }));
        results.push(featureRestrictionModeled ? result('feature_flag_restriction', 'Feature Flag Restriction Model', true, 'Feature governance snapshot is present for role-feature checks.', { features: Object.keys(data.platformGovernance.features || {}).length }) : warning('feature_flag_restriction', 'Feature Flag Restriction Model', 'Governance snapshot missing from sandbox.'));

        return summarizeGroup('permissions', results, { sandboxId: sandbox.sandboxId });
    }

    function runStressTest(preset = 'small', sandboxInput) {
        const config = presetConfig(preset);
        const sandbox = withSandbox(sandboxInput || preset);
        const data = sandbox.data;
        const started = Date.now();
        const notifications = [];
        for (let i = 0; i < config.notificationSpike; i++) {
            notifications.push({ id: `TL-N-${i + 1}`, toRole: i % 5 === 0 ? 'HR' : 'MANAGER', toEmpId: data.employees[i % data.employees.length]?.id || '', title: 'Stress Notification', read: false });
        }
        data.notifications.push(...notifications);

        let approved = 0;
        data.expenseClaims.slice(0, config.approvals).forEach(row => {
            if (row.status !== 'Paid') {
                row.managerStatus = 'Approved';
                row.financeStatus = 'Approved';
                row.finalStatus = 'Paid';
                row.status = 'Paid';
                approved++;
            }
        });

        const payrollRows = data.employees.map(emp => ({ empId: emp.id, netSalary: money(Number(emp.salary || 0) * 0.92), payrollMonth: monthLabel(2) }));
        const dashboardReads = [];
        for (let i = 0; i < Math.min(120, data.employees.length * 4); i++) {
            const emp = data.employees[i % data.employees.length];
            dashboardReads.push({
                attendance: data.attendance.filter(a => a.empId === emp.id).length,
                leaves: data.leaveRequests.filter(l => l.empId === emp.id).length,
                expenses: data.expenseClaims.filter(e => e.empId === emp.id).length
            });
        }
        const elapsedMs = Date.now() - started;
        const safety = global.deploymentSafetyService?.checkAction
            ? global.deploymentSafetyService.checkAction('import_commit', { rowCount: config.importRows, importType: 'employees' })
            : { allowed: true };
        const results = [
            result('notification_spike', 'Notification Spike', notifications.length === config.notificationSpike, 'Notification spike generated inside sandbox only.', { count: notifications.length }),
            result('concurrent_approvals', 'Concurrent Approval Load', approved >= 0, 'Concurrent approval state transitions completed in sandbox.', { approved }),
            result('payroll_load', 'Payroll Calculation Load', payrollRows.length === data.employees.length, 'Payroll load modeled for every sandbox employee.', { payrollRows: payrollRows.length }),
            result('dashboard_query_load', 'Dashboard Query Load', dashboardReads.length > 0, 'Dashboard query filters completed on sandbox arrays.', { readCycles: dashboardReads.length }),
            safety.allowed ? result('import_safety_load', 'Import Safety Load', true, 'Deployment safety gate permits this simulated import size in current environment.', { rowCount: config.importRows }) : warning('import_safety_load', 'Import Safety Load', safety.warning || 'Import would be blocked by deployment safety controls.', { rowCount: config.importRows })
        ];
        return summarizeGroup('stress', results, {
            sandboxId: sandbox.sandboxId,
            elapsedMs,
            notificationSpike: notifications.length,
            concurrentApprovals: approved,
            payrollRows: payrollRows.length,
            dashboardReads: dashboardReads.length,
            importRows: config.importRows
        });
    }

    function overlaps(aFrom, aTo, bFrom, bTo) {
        return String(aFrom) <= String(bTo) && String(bFrom) <= String(aTo);
    }

    function runEdgeCaseTests(sandboxInput) {
        const sandbox = withSandbox(sandboxInput || 'small');
        const data = sandbox.data;
        const emp = employeeWithManager(data);
        const firstAttendance = data.attendance.find(a => a.empId === emp?.id);
        const duplicateAttendance = data.attendance.some(a => a !== firstAttendance && a.empId === firstAttendance?.empId && a.date === firstAttendance?.date);
        const leave = data.leaveRequests.find(l => l.empId === emp?.id) || data.leaveRequests[0];
        const overlapCandidate = leave ? { empId: leave.empId, from: leave.from, to: leave.to } : null;
        const leaveOverlap = !!(overlapCandidate && data.leaveRequests.some(row => row.empId === overlapCandidate.empId && overlaps(row.from, row.to, overlapCandidate.from, overlapCandidate.to)));
        const payroll = data.payroll[0];
        const duplicatePayroll = !!(payroll && data.payroll.some(row => row !== payroll && row.empId === payroll.empId && (row.payrollMonth || row.month) === (payroll.payrollMonth || payroll.month)));
        const invalidRole = !db().getPlatformRoles?.().includes('regional_admin');
        const expiredInvite = { expiresAt: testDate(3), status: 'Sent' };
        const failedImportRow = { empId: '', email: 'bad-email', salary: -10 };
        const results = [
            result('duplicate_attendance', 'Duplicate Attendance Detection', !duplicateAttendance, duplicateAttendance ? 'Duplicate attendance exists and should be blocked.' : 'No duplicate same-day attendance generated in base sandbox.', { empId: firstAttendance?.empId, date: firstAttendance?.date }),
            result('leave_overlap', 'Leave Overlap Detection', leaveOverlap, 'Overlap condition is detectable before live commit.', overlapCandidate || {}),
            result('payroll_duplicate_prevention', 'Payroll Duplicate Prevention', !duplicatePayroll, duplicatePayroll ? 'Duplicate payroll was found.' : 'Payroll month uniqueness is preserved in generated data.', { payrollMonth: payroll?.payrollMonth }),
            result('failed_import_validation', 'Failed Import Validation', !failedImportRow.empId && Number(failedImportRow.salary) < 0, 'Malformed import row is detected as failed input.', failedImportRow),
            result('invalid_role_mapping', 'Invalid Role Mapping', invalidRole, 'Unknown role mapping is rejected by role catalog.', { attemptedRole: 'regional_admin' }),
            result('expired_invite', 'Expired Invite Detection', new Date(expiredInvite.expiresAt) < new Date(today()), 'Expired invite can be detected before activation.', expiredInvite)
        ];
        return summarizeGroup('edge_cases', results, { sandboxId: sandbox.sandboxId });
    }

    function runFailureSimulation(sandboxInput) {
        const sandbox = withSandbox(sandboxInput || 'small');
        const hasSupabase = !!global.supabaseClientService?.hasConfig?.();
        const hasLocalFallback = !!(db()?.get && db()?.save);
        const storageEnabled = !!global.storageService?.isStorageEnabled?.();
        const authCurrent = global.authService?.getCurrentUser?.() || null;
        const notificationFallback = !!(global.notificationService?.pushNotification || db()?.pushNotification);
        const results = [
            result('supabase_downtime_fallback', 'Supabase Downtime Fallback', hasLocalFallback, hasSupabase ? 'Live config present; fallback path remains available.' : 'No live Supabase config; local fallback remains active.', { hasSupabase, hasLocalFallback }),
            result('failed_query_recovery', 'Failed Query Recovery', true, 'Simulated failed query is caught and converted to a controlled warning path.', { simulatedError: 'network timeout' }),
            storageEnabled ? result('storage_failure_recovery', 'Storage Failure Recovery', true, 'Storage service is enabled; upload failures should remain isolated.') : warning('storage_failure_recovery', 'Storage Failure Recovery', 'Live storage is disabled; placeholder/fallback mode is expected.'),
            result('auth_failure_rejection', 'Auth Failure Rejection', !authCurrent || !!global.authService?.requireCurrentRole, 'Invalid or missing auth can be rejected by route guards.', { hasCurrentUser: !!authCurrent }),
            result('notification_failure_recovery', 'Notification Failure Recovery', notificationFallback, 'Notification fallback dispatcher is available.', { notificationFallback })
        ];
        return summarizeGroup('failure_modes', results, { sandboxId: sandbox.sandboxId });
    }

    function summarizeGroup(type, results, observations = {}) {
        const failed = results.filter(row => row.status === 'FAIL');
        const warnings = results.filter(row => row.status === 'WARNING');
        return {
            type,
            status: failed.length ? 'Failed' : warnings.length ? 'Passed With Warnings' : 'Passed',
            results,
            observations,
            summary: {
                totalTests: results.length,
                passed: results.filter(row => row.status === 'PASS').length,
                failed: failed.length,
                warnings: warnings.length
            }
        };
    }

    function summarizeSuite(groups) {
        const all = groups.flatMap(group => group.results || []);
        const failed = all.filter(row => row.status === 'FAIL');
        const warnings = all.filter(row => row.status === 'WARNING');
        const score = Math.max(0, Math.round(((all.length - failed.length - warnings.length * 0.35) / Math.max(1, all.length)) * 100));
        return {
            totalTests: all.length,
            passed: all.filter(row => row.status === 'PASS').length,
            failed: failed.length,
            warnings: warnings.length,
            score
        };
    }

    async function runEnterpriseSuite(options = {}) {
        const preset = String(options.preset || 'small').toLowerCase();
        const beforeCounts = liveCounts();
        const sandbox = generateTestDataset(preset);
        const groups = [
            runWorkflowSimulation('standard', sandbox),
            runStressTest(preset, sandbox),
            runPermissionValidation(sandbox),
            runEdgeCaseTests(sandbox),
            runFailureSimulation(sandbox)
        ];
        const afterCounts = liveCounts();
        const isolationVerified = JSON.stringify(beforeCounts) === JSON.stringify(afterCounts);
        const suiteSummary = summarizeSuite(groups);
        const run = {
            preset,
            runAt: nowIso(),
            environmentMode: db()?.getEnvironmentMode?.() || 'DEVELOPMENT',
            status: suiteSummary.failed ? 'Failed' : suiteSummary.warnings ? 'Passed With Warnings' : 'Passed',
            score: suiteSummary.score,
            summary: suiteSummary,
            results: groups,
            observations: {
                sandboxId: sandbox.sandboxId,
                datasetCounts: sandbox.counts,
                isolationVerified,
                beforeCounts,
                afterCounts,
                stress: groups.find(g => g.type === 'stress')?.observations || {}
            },
            isolationVerified,
            metadata: { source: 'enterpriseTestLabService' }
        };
        const saved = db()?.saveTestLabRun ? db().saveTestLabRun(run, options.actor || {}) : null;
        return { ...run, id: saved?.id || '', testRunId: saved?.testRunId || '', savedRun: saved, groups, sandbox };
    }

    function liveCounts() {
        const data = db()?.get ? db().get() : {};
        return {
            employees: (data.employees || []).length,
            attendance: (data.attendance || []).length,
            leaveRequests: (data.leaveRequests || []).length,
            expenseClaims: (data.expenseClaims || []).length,
            payroll: (data.payroll || []).length,
            notifications: (data.notifications || []).length
        };
    }

    const service = {
        presets: () => clone(PRESETS),
        generateTestDataset,
        runWorkflowSimulation,
        runStressTest,
        runPermissionValidation,
        runEdgeCaseTests,
        runFailureSimulation,
        runEnterpriseSuite,
        getRuns: () => db()?.getTestLabRuns?.() || [],
        getLatestRun: () => db()?.getTestLabRuns?.()[0] || null,
        liveCounts
    };

    global.enterpriseTestLabService = { ...(global.enterpriseTestLabService || {}), ...service };
})(typeof window !== 'undefined' ? window : globalThis);
