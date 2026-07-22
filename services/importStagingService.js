// Enterprise import staging service.
// Official pipeline: parse -> stage -> validate -> preview -> approve -> commit -> audit.
(function (global) {
    function db() { return global.DB; }

    function clone(value) {
        return JSON.parse(JSON.stringify(value ?? null));
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function today() {
        return db().today ? db().today() : new Date().toISOString().slice(0, 10);
    }

    function normalizeRole(role) {
        return String(role || '').trim().toUpperCase().replace(/\s+/g, '_');
    }

    function ensureImportRole(meta = {}, action = 'execute') {
        const actor = meta.actor || global.authService?.getCurrentUser?.() || null;
        if (!global.rbacEnforcementService?.authorize) {
            return { ok: false, role: '', actor: null, message: 'RBAC enforcement service is unavailable' };
        }
        const decision = global.rbacEnforcementService.authorize({
            resource: 'imports',
            action,
            tenantSlug: meta.tenantSlug || meta.tenantId || actor?.tenantSlug || actor?.tenantId || '',
            actor
        });
        if (!decision.allowed) return { ok: false, role: decision.role || '', actor, message: decision.message };
        return { ok: true, role: decision.role.toUpperCase(), actor, tenantSlug: decision.tenantSlug };
    }

    function stripInternal(row = {}) {
        const out = {};
        Object.keys(row || {}).forEach(key => {
            if (!key.startsWith('_')) out[key] = row[key];
        });
        return out;
    }

    function emitImportEvent(type, batch, message, priority = 'MEDIUM') {
        if (!global.workflowEngine?.emitWorkflowEvent) return null;
        return global.workflowEngine.emitWorkflowEvent(type, {
            actorRole: batch.uploadedRole || 'hr',
            actorId: batch.uploadedBy || '',
            module: 'Import Center',
            targetId: batch.importBatchId,
            title: type.replace(/_/g, ' '),
            message,
            priority,
            metadata: {
                importBatchId: batch.importBatchId,
                importType: batch.importType,
                fileName: batch.fileName,
                totalRows: batch.totalRows,
                passedRows: batch.passedRows,
                warningRows: batch.warningRows,
                failedRows: batch.failedRows,
                committedRows: batch.committedRows || 0,
                rollbackEligible: !!batch.rollbackEligible
            }
        });
    }

    function reportImportIncident(batch = {}, title, description, severity = 'HIGH', metadata = {}) {
        global.operationsMonitoringService?.createIncident?.({
            severity,
            module: 'Import Center',
            title,
            description,
            source: 'import',
            affectedRecordId: batch.importBatchId || metadata.importBatchId || '',
            recoveryAction: 'Open Import Center, inspect staged validation rows, export failed rows, and retry only after conflicts are resolved.',
            metadata: {
                importBatchId: batch.importBatchId || metadata.importBatchId || '',
                importType: batch.importType || metadata.importType || '',
                fileName: batch.fileName || metadata.fileName || '',
                ...metadata
            }
        }, {
            role: batch.uploadedRole || metadata.actorRole || 'hr',
            id: batch.uploadedBy || metadata.actorId || ''
        });
    }

    function reportImportPerformance(batch = {}, operation, startedAt, status, metadata = {}) {
        global.operationsMonitoringService?.recordPerformance?.({
            module: 'Import Center',
            operation,
            durationMs: Date.now() - startedAt,
            recordCount: Number(batch.totalRows || metadata.rowCount || 0),
            status,
            metadata: {
                importBatchId: batch.importBatchId || metadata.importBatchId || '',
                importType: batch.importType || metadata.importType || '',
                ...metadata
            }
        });
    }

    function stageImport(type, validation, meta = {}) {
        const access = ensureImportRole(meta, 'create');
        if (!access.ok) return { blocked: true, reason: access.message };
        if (!validation || !validation.previewRows) return { blocked: true, reason: 'Validation result is required before staging' };
        const totalRows = Number(validation.summary?.totalRows || validation.previewRows.length || 0);
        const readiness = global.migrationControlService?.assertImportReady
            ? global.migrationControlService.assertImportReady(type, totalRows)
            : db().getImportReadiness?.(type, totalRows);
        if (readiness && readiness.ok === false) {
            return { blocked: true, reason: readiness.reason || 'Import is locked until migration readiness checks pass', readiness };
        }
        const safety = global.deploymentSafetyService?.guardAction
            ? global.deploymentSafetyService.guardAction('import_stage', { importType: type, rowCount: totalRows }, { label: `${type} import staging` })
            : { ok: true };
        if (!safety.ok) return { blocked: true, reason: safety.reason || 'Import staging blocked by deployment safety controls', safety };

        const d = db().get();
        const importBatchId = db().generateImportBatchId ? db().generateImportBatchId(d) : db().generateRecordId('importBatch', d);
        const uploadedBy = access.actor.id;
        const summary = validation.summary || {};
        const batch = db().saveImportBatch({
            importBatchId,
            importType: type,
            type,
            fileName: meta.fileName || '',
            uploadedBy,
            uploadedRole: access.role.toLowerCase(),
            uploadedAt: nowIso(),
            totalRows: Number(summary.totalRows || validation.previewRows.length || 0),
            passedRows: Number(summary.successRows || 0),
            warningRows: Number(summary.warningRows || 0),
            failedRows: Number(summary.failedRows || 0),
            committedRows: 0,
            skippedRows: 0,
            status: Number(summary.failedRows || 0) ? 'Validated' : 'Staged',
            backend: meta.backend || 'local',
            rollbackEligible: true,
            validationSummary: summary
        });

        const reservedStagingIds = new Set();
        const rows = (validation.previewRows || []).map(row => {
            const stagingId = db().generateRecordId
                ? db().generateRecordId('importStagingRow', d, reservedStagingIds)
                : (db().generateImportStagingRowId ? db().generateImportStagingRowId(d) : 'STG' + Date.now());
            reservedStagingIds.add(stagingId);
            return {
                stagingId,
                importBatchId,
                importType: type,
                type,
                rowNumber: Number(row._rowIndex || 0),
                rawRowData: clone(row.__rawRowData || stripInternal(row)),
                validationStatus: row._status || (row._errors?.length ? 'FAILED' : row._warnings?.length ? 'WARNING' : 'SUCCESS'),
                validationErrors: row._errors || [],
                validationWarnings: row._warnings || [],
                normalizedData: stripInternal(row),
                uploadedBy,
                uploadedAt: batch.uploadedAt
            };
        });
        db().saveImportStagingRows(importBatchId, rows);
        if (db().writeAuditLog) {
            db().writeAuditLog(access.role.toLowerCase(), uploadedBy, 'import staged', 'Import Center', importBatchId, `${type} import staged with ${batch.totalRows} rows`);
        }
        emitImportEvent('IMPORT_STAGED', batch, `${type} import staged for approval.`, batch.failedRows ? 'HIGH' : 'MEDIUM');
        if (batch.failedRows) emitImportEvent('IMPORT_VALIDATION_FAILED', batch, `${type} import has ${batch.failedRows} failed rows requiring review.`, 'HIGH');
        return { blocked: false, batch, rows, validation };
    }

    function buildEmployeePayload(row, data) {
        return db().normalizeEmployeePayload({
            id: row.empId,
            name: row.fullName || row.name,
            dept: row.department,
            desig: row.designation,
            managerId: row.managerId || null,
            salary: Number(row.salary || 0),
            doj: row.joinDate,
            branch: row.branch || 'Head Office',
            location: row.branch || 'Head Office',
            shiftId: row.shiftId || 'SH002',
            mobile: row.phone || row.mobile || '',
            phone: row.phone || row.mobile || '',
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
            activationStatus: 'Not Activated',
            source: 'import'
        }, data);
    }

    function commitEmployeeRow(row, data) {
        const existing = (data.employees || []).find(e => e.id === row.empId);
        const before = clone(existing);
        const payload = buildEmployeePayload(row, data);
        if (existing) {
            Object.assign(existing, payload, { id: existing.id });
            return { operation: 'update', collection: 'employees', match: { id: existing.id }, before, after: clone(existing), liveRecordId: existing.id };
        }
        data.employees.push(payload);
        return { operation: 'insert', collection: 'employees', match: { id: payload.id }, before: null, after: clone(payload), liveRecordId: payload.id };
    }

    function commitAttendanceRow(row, data) {
        const existing = (data.attendance || []).find(a => a.empId === row.empId && a.date === row.date);
        const before = clone(existing);
        const emp = (data.employees || []).find(e => e.id === row.empId) || {};
        const rec = {
            id: existing?.id || existing?.attendanceId || (db().generateAttendanceId ? db().generateAttendanceId(data) : db().generateRecordId('attendance', data)),
            attendanceId: existing?.attendanceId || existing?.id || (db().generateAttendanceId ? db().generateAttendanceId(data) : db().generateRecordId('attendance', data)),
            empId: row.empId,
            date: row.date,
            attendanceDate: row.date,
            checkIn: row.checkIn || null,
            checkOut: row.checkOut || null,
            status: row.status || 'Present',
            shiftId: row.shiftId || emp.shiftId || 'SH002',
            workingHours: row.checkIn && row.checkOut ? db().calcWorkingHours(row.checkIn, row.checkOut) : null,
            regularizationStatus: 'None',
            remarks: row.remarks || 'Imported attendance',
            source: 'import'
        };
        if (existing) {
            Object.assign(existing, rec, { id: existing.id || rec.id, attendanceId: existing.attendanceId || rec.attendanceId });
            return { operation: 'update', collection: 'attendance', match: { empId: row.empId, date: row.date }, before, after: clone(existing), liveRecordId: existing.attendanceId || existing.id };
        }
        data.attendance.push(rec);
        return { operation: 'insert', collection: 'attendance', match: { empId: row.empId, date: row.date }, before: null, after: clone(rec), liveRecordId: rec.attendanceId || rec.id };
    }

    function commitPayrollRow(row, data) {
        const existing = (data.payroll || []).find(p => p.empId === row.empId && (p.payrollMonth || p.month) === row.month);
        const before = clone(existing);
        const basic = Number(row.basicSalary || 0);
        const allowances = Number(row.allowances || 0);
        const deductions = Number(row.deductions || 0);
        const leaveDeductions = Number(row.leaveDeductions || 0);
        const expenseReimbursements = Number(row.expenseReimbursements || 0);
        const overtimeAmount = Number(row.overtimeAmount || 0);
        const bonusAmount = Number(row.bonus || row.bonusAmount || 0);
        const grossSalary = Math.max(0, basic + allowances + overtimeAmount + bonusAmount);
        const netSalary = Math.max(0, Number(row.finalSalary || row.netSalary || (grossSalary + expenseReimbursements - deductions - leaveDeductions)));
        const payrollId = existing?.payrollId || existing?.id || (db().generatePayrollId ? db().generatePayrollId(data) : db().generateRecordId('payroll', data));
        const rec = {
            id: payrollId,
            payrollId,
            empId: row.empId,
            month: row.month,
            payrollMonth: row.month,
            basic: basic,
            basicSalary: basic,
            hra: 0,
            special: allowances,
            transport: 0,
            allowances,
            deductions,
            leaveDeductions,
            expenseReimbursements,
            overtimeAmount,
            bonusAmount,
            pf: 0,
            esic: 0,
            pt: 0,
            tds: deductions,
            gross: grossSalary,
            grossSalary,
            net: netSalary,
            netSalary,
            status: row.status || 'Pending',
            payrollStatus: row.status || 'Pending',
            paidOn: null,
            processedBy: row.processedBy || 'HR',
            processedAt: nowIso(),
            remarks: 'Imported through staged batch',
            source: 'import'
        };
        if (existing) {
            Object.assign(existing, rec, { id: existing.id, payrollId: existing.payrollId || existing.id });
            return { operation: 'update', collection: 'payroll', match: { empId: row.empId, payrollMonth: row.month }, before, after: clone(existing), liveRecordId: existing.payrollId || existing.id };
        }
        data.payroll.push(rec);
        return { operation: 'insert', collection: 'payroll', match: { empId: row.empId, payrollMonth: row.month }, before: null, after: clone(rec), liveRecordId: rec.payrollId };
    }

    function commitLeaveRow(row, data) {
        const existing = (data.leaveRequests || []).find(l => l.empId === row.empId && l.from === row.from && l.to === row.to && (l.type || l.leaveType) === row.type);
        const before = clone(existing);
        const leaveId = row.leaveId || existing?.leaveId || existing?.id || (db().generateLeaveId ? db().generateLeaveId(data) : db().generateRecordId('leave', data));
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
        }, data) : {
            id: leaveId,
            leaveId,
            empId: row.empId,
            type: row.type,
            from: row.from,
            to: row.to,
            reason: row.reason,
            status: row.status || 'Pending',
            appliedOn: today(),
            source: 'import'
        };
        if (existing) {
            Object.assign(existing, rec, { id: existing.id, leaveId: existing.leaveId || existing.id });
            return { operation: 'update', collection: 'leaveRequests', match: { id: existing.id }, before, after: clone(existing), liveRecordId: existing.leaveId || existing.id };
        }
        data.leaveRequests.push(rec);
        return { operation: 'insert', collection: 'leaveRequests', match: { id: rec.id }, before: null, after: clone(rec), liveRecordId: rec.leaveId || rec.id };
    }

    function applyRollbackItem(data, item) {
        const rows = data[item.collection] || [];
        const matches = row => Object.keys(item.match || {}).every(key => row[key] === item.match[key] || (key === 'payrollMonth' && (row.payrollMonth || row.month) === item.match[key]));
        const idx = rows.findIndex(matches);
        if (item.operation === 'insert') {
            if (idx > -1) rows.splice(idx, 1);
            return { removed: 1, restored: 0 };
        }
        if (item.operation === 'update' && item.before) {
            if (idx > -1) rows[idx] = item.before;
            else rows.push(item.before);
            return { removed: 0, restored: 1 };
        }
        return { removed: 0, restored: 0 };
    }

    async function commitImportBatch(importBatchId, meta = {}) {
        const started = Date.now();
        const access = ensureImportRole(meta, 'execute');
        if (!access.ok) {
            reportImportIncident({ importBatchId }, 'Unauthorized import commit attempt', access.message, 'HIGH', { actorRole: meta.actorRole || meta.uploadedRole || '' });
            return { blocked: true, reason: access.message };
        }
        const batch = db().getImportBatch(importBatchId);
        if (!batch) {
            reportImportIncident({ importBatchId }, 'Import commit failed', 'Import batch not found', 'MEDIUM', { importBatchId });
            return { blocked: true, reason: 'Import batch not found' };
        }
        if (['Committed', 'Rolled Back', 'Cancelled'].includes(batch.status)) {
            reportImportPerformance(batch, 'import_commit', started, 'Blocked', { reason: `Batch is already ${batch.status}` });
            return { blocked: true, reason: `Batch is already ${batch.status}` };
        }
        const rows = db().getImportStagingRows(importBatchId);
        const executable = rows.filter(row => ['SUCCESS', 'WARNING'].includes(row.validationStatus));
        const env = global.deploymentSafetyService?.getEnvironmentState?.() || db().getEnvironmentState?.() || {};
        const strictPilotOrProduction = !!(env.isPilot || env.isProduction || env.mode === 'PILOT' || env.mode === 'PRODUCTION');
        if (strictPilotOrProduction && Number(batch.failedRows || 0) > 0) {
            db().saveImportBatch({ ...batch, status: 'Commit Blocked' });
            const reason = 'Pilot/production import commit requires zero failed validation rows';
            reportImportIncident(batch, 'Import commit blocked by failed validation rows', reason, 'HIGH', { failedRows: batch.failedRows, environment: env.mode || '' });
            reportImportPerformance(batch, 'import_commit', started, 'Blocked', { reason, failedRows: batch.failedRows });
            return { blocked: true, reason, environment: env.mode || '' };
        }
        const readiness = global.migrationControlService?.assertImportReady
            ? global.migrationControlService.assertImportReady(batch.importType, executable.length)
            : db().getImportReadiness?.(batch.importType, executable.length);
        if (readiness && readiness.ok === false) {
            db().saveImportBatch({ ...batch, status: 'Commit Blocked' });
            reportImportIncident(batch, 'Import commit blocked by readiness checks', readiness.reason || 'Import commit is locked until migration readiness checks pass', 'HIGH', { readiness });
            reportImportPerformance(batch, 'import_commit', started, 'Blocked', { reason: readiness.reason || 'readiness' });
            return { blocked: true, reason: readiness.reason || 'Import commit is locked until migration readiness checks pass', readiness };
        }
        const safety = global.deploymentSafetyService?.guardAction
            ? global.deploymentSafetyService.guardAction('import_commit', { importType: batch.importType, rowCount: executable.length, importBatchId }, { label: `${batch.importType} import commit` })
            : { ok: true };
        if (!safety.ok) {
            db().saveImportBatch({ ...batch, status: 'Commit Blocked' });
            reportImportIncident(batch, 'Import commit blocked by deployment safety', safety.reason || 'Import commit blocked by deployment safety controls', 'HIGH', { safety });
            reportImportPerformance(batch, 'import_commit', started, 'Blocked', { reason: safety.reason || 'deployment safety' });
            return { blocked: true, reason: safety.reason || 'Import commit blocked by deployment safety controls', safety };
        }
        if (!executable.length) {
            reportImportIncident(batch, 'Import commit has no valid rows', 'No valid staged rows to commit', 'MEDIUM');
            reportImportPerformance(batch, 'import_commit', started, 'Blocked', { reason: 'No valid staged rows' });
            return { blocked: true, reason: 'No valid staged rows to commit' };
        }
        if (batch.failedRows > executable.length) {
            db().saveImportBatch({ ...batch, status: 'Commit Blocked' });
            reportImportIncident(batch, 'Import commit blocked by failed-row ratio', 'Validation failed for more rows than can be safely committed', 'HIGH', { failedRows: batch.failedRows, executableRows: executable.length });
            reportImportPerformance(batch, 'import_commit', started, 'Blocked', { failedRows: batch.failedRows, executableRows: executable.length });
            return { blocked: true, reason: 'Validation failed for more rows than can be safely committed' };
        }

        const data = db().get();
        if (batch.importType === 'employees') {
            const currentIds = new Set((data.employees || []).map(emp => emp.id));
            executable.forEach(row => {
                const normalized = row.normalizedData || {};
                if (normalized.empId) currentIds.add(normalized.empId);
            });
            const hierarchyErrors = executable
                .map(row => row.normalizedData || {})
                .filter(row => row.managerId && (!currentIds.has(row.managerId) || row.managerId === row.empId))
                .map(row => `${row.empId || 'employee'} -> ${row.managerId}`);
            if (hierarchyErrors.length) {
                db().saveImportBatch({ ...batch, status: 'Commit Blocked' });
                const reason = 'Employee import commit blocked by broken manager hierarchy';
                reportImportIncident(batch, reason, hierarchyErrors.join('; '), 'HIGH', { hierarchyErrors });
                reportImportPerformance(batch, 'import_commit', started, 'Blocked', { reason, hierarchyErrors: hierarchyErrors.length });
                return { blocked: true, reason, hierarchyErrors };
            }
        }
        const rollbackItems = [];
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];
        const committedRows = [];

        executable.forEach(stagingRow => {
            try {
                const row = stagingRow.normalizedData || {};
                let item = null;
                if (batch.importType === 'employees') item = commitEmployeeRow(row, data);
                else if (batch.importType === 'attendance') item = commitAttendanceRow(row, data);
                else if (batch.importType === 'payroll') item = commitPayrollRow(row, data);
                else if (batch.importType === 'leave') item = commitLeaveRow(row, data);
                else throw new Error('Unsupported import type: ' + batch.importType);
                rollbackItems.push(item);
                committedRows.push({ stagingId: stagingRow.stagingId, liveRecordId: item.liveRecordId });
                if (item.operation === 'update') updated++;
                else imported++;
            } catch (err) {
                skipped++;
                errors.push(`Row ${stagingRow.rowNumber}: ${err.message || err}`);
            }
        });

        db().normalizeDataArchitecture(data);
        db().save(data);
        db().updateImportStagingRows(importBatchId, row => {
            const committed = committedRows.find(c => c.stagingId === row.stagingId);
            if (!committed) return row;
            return { ...row, committed: true, committedAt: nowIso(), validationStatus: 'COMMITTED', liveRecordId: committed.liveRecordId, rollbackMetadata: committed };
        });
        const savedBatch = db().saveImportBatch({
            ...batch,
            status: skipped ? 'Committed' : 'Committed',
            committedRows: imported + updated,
            skippedRows: skipped,
            committedBy: access.actor.id,
            committedAt: nowIso(),
            rollbackEligible: true,
            rollbackItems,
            commitSummary: { imported, updated, skipped, errors }
        });
        const log = db().addImportLog({
            importBatchId,
            importType: batch.importType,
            type: batch.importType,
            fileName: batch.fileName,
            totalRows: batch.totalRows,
            successRows: imported + updated,
            failedRows: batch.failedRows + skipped,
            duplicateRows: updated,
            imported,
            updated,
            skipped,
            errors,
            importedBy: savedBatch.committedBy,
            importedAt: savedBatch.committedAt,
            backend: savedBatch.backend,
            status: 'Committed',
            rollbackEligible: true
        });
        if (db().writeAuditLog) {
            db().writeAuditLog(access.role.toLowerCase(), savedBatch.committedBy, 'import committed', 'Import Center', importBatchId, `${batch.importType} import batch committed with ${imported + updated} live rows`);
        }
        emitImportEvent('IMPORT_COMMITTED', savedBatch, `${batch.importType} import batch committed with ${imported + updated} rows.`, skipped ? 'HIGH' : 'LOW');
        reportImportPerformance(savedBatch, 'import_commit', started, skipped || errors.length ? 'Warning' : 'OK', { imported, updated, skipped, errors: errors.length });
        if (skipped || errors.length) {
            reportImportIncident(savedBatch, 'Import commit completed with skipped rows', `${skipped} row(s) were skipped during ${batch.importType} import commit.`, 'HIGH', { imported, updated, skipped, errors });
        }
        return { blocked: false, imported, updated, skipped, log, batch: savedBatch, validation: { summary: savedBatch.validationSummary }, rollbackItems };
    }

    async function stageAndCommitImport(type, validation, meta = {}) {
        const staged = stageImport(type, validation, meta);
        if (staged.blocked) return staged;
        const committed = await commitImportBatch(staged.batch.importBatchId, {
            ...meta,
            actor: staged.batch ? (meta.actor || global.authService?.getCurrentUser?.() || null) : null
        });
        return { ...committed, stagedBatch: staged.batch };
    }

    function cancelImportBatch(importBatchId, meta = {}) {
        const access = ensureImportRole(meta, 'update');
        if (!access.ok) return { blocked: true, reason: access.message };
        const batch = db().getImportBatch(importBatchId);
        if (!batch) return { blocked: true, reason: 'Import batch not found' };
        if (batch.status === 'Committed') return { blocked: true, reason: 'Committed batches must be rolled back, not cancelled' };
        const savedBatch = db().saveImportBatch({
            ...batch,
            status: 'Cancelled',
            cancelledBy: access.actor.id,
            cancelledAt: nowIso(),
            rollbackEligible: false
        });
        if (db().writeAuditLog) db().writeAuditLog(access.role.toLowerCase(), savedBatch.cancelledBy, 'import cancelled', 'Import Center', importBatchId, `${batch.importType} import batch cancelled before commit`);
        return { blocked: false, batch: savedBatch };
    }

    function rollbackImportBatch(importBatchId, meta = {}) {
        const access = ensureImportRole(meta, 'execute');
        if (!access.ok) return { blocked: true, reason: access.message };
        const batch = db().getImportBatch(importBatchId);
        if (!batch) return { blocked: true, reason: 'Import batch not found' };
        if (batch.status !== 'Committed') return { blocked: true, reason: 'Only committed batches can be rolled back' };
        if (!batch.rollbackEligible || !Array.isArray(batch.rollbackItems) || !batch.rollbackItems.length) return { blocked: true, reason: 'Rollback metadata is not available for this batch' };
        const data = db().get();
        let removedRows = 0;
        let restoredRows = 0;
        const errors = [];
        [...batch.rollbackItems].reverse().forEach(item => {
            try {
                const result = applyRollbackItem(data, item);
                removedRows += result.removed;
                restoredRows += result.restored;
            } catch (err) {
                errors.push(err.message || String(err));
            }
        });
        db().normalizeDataArchitecture(data);
        db().save(data);
        db().updateImportStagingRows(importBatchId, row => row.committed ? { ...row, committed: false, validationStatus: 'ROLLED_BACK' } : row);
        const savedBatch = db().saveImportBatch({
            ...batch,
            status: 'Rolled Back',
            rolledBackBy: access.actor.id,
            rolledBackAt: nowIso(),
            rollbackEligible: false,
            rollbackSummary: { removedRows, restoredRows, errors }
        });
        const rollbackLog = db().addImportRollbackLog({
            importBatchId,
            importType: batch.importType,
            rolledBackBy: savedBatch.rolledBackBy,
            rolledBackAt: savedBatch.rolledBackAt,
            removedRows,
            restoredRows,
            errors
        });
        if (db().writeAuditLog) db().writeAuditLog(access.role.toLowerCase(), savedBatch.rolledBackBy, 'import rollback executed', 'Import Center', importBatchId, `${batch.importType} import batch rolled back`);
        emitImportEvent('IMPORT_ROLLED_BACK', savedBatch, `${batch.importType} import batch rolled back.`, errors.length ? 'HIGH' : 'MEDIUM');
        return { blocked: false, batch: savedBatch, rollbackLog };
    }

    const importStagingService = {
        stageImport,
        commitImportBatch,
        stageAndCommitImport,
        cancelImportBatch,
        rollbackImportBatch,
        getBatches: () => db().getImportBatches(),
        getBatch: importBatchId => db().getImportBatch(importBatchId),
        getStagingRows: importBatchId => db().getImportStagingRows(importBatchId),
        canImport: role => IMPORT_ROLES.has(normalizeRole(role))
    };

    global.importStagingService = global.importStagingService || importStagingService;
})(typeof window !== 'undefined' ? window : globalThis);
