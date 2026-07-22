// Leave service adapter.
// Keeps current local DB behavior stable while preparing Supabase-backed leave workflows.
(function (global) {
    function db() { return global.DB; }
    let supabaseLeaveCache = null;

    function localRows() {
        return db().get().leaveRequests || [];
    }

    function localByEmployee(empId) {
        return db().LeaveService?.byEmployee ? db().LeaveService.byEmployee(empId) : db().getEmpLeave(empId);
    }

    function localApply(request) {
        return db().LeaveService?.apply ? db().LeaveService.apply(request) : db().applyLeave(request);
    }

    function localUpdate(id, status, message, actorRole, actorId) {
        return db().updateLeave(id, status, message, actorRole, actorId);
    }

    function supabaseReady() {
        const svc = global.supabaseClientService;
        return !!(svc && svc.isEnabled && svc.isEnabled('USE_SUPABASE_LEAVE') && svc.getClient && svc.getClient());
    }

    function client() {
        return global.supabaseClientService.getClient();
    }

    function recordFallback(reason) {
        try { global.migrationControlService?.recordFallback?.('leaveRequests', reason, { role: 'system', id: 'leaveService', name: 'Leave Service' }); } catch (e) {}
    }

    function today() {
        return db().today ? db().today() : new Date().toISOString().split('T')[0];
    }

    function statusFromWorkflow(finalStatus, managerStatus, hrStatus, fallback = 'Pending') {
        if (finalStatus === 'Rejected' || managerStatus === 'Rejected' || hrStatus === 'Rejected') return 'Rejected';
        if (finalStatus === 'Approved' || finalStatus === 'Manager Approved' || managerStatus === 'Approved' || hrStatus === 'Approved') return 'Approved';
        return fallback || 'Pending';
    }

    function buildLocalLeave(payload = {}) {
        const data = db().get();
        const empId = db().resolveEmployeeId(payload.empId || payload.employeeId || payload.emp_id, data);
        const from = payload.from || payload.fromDate || payload.from_date || today();
        const to = payload.to || payload.toDate || payload.to_date || from;
        const leaveId = payload.leaveId || payload.leave_id || payload.id || db().generateLeaveId?.(data) || db().generateRecordId('leave', data);
        const leaveType = db().normalizeLeaveType ? db().normalizeLeaveType(payload.leaveType || payload.leave_type || payload.type) : (payload.leaveType || payload.leave_type || payload.type || 'Casual Leave');
        const managerStatus = payload.managerStatus || payload.manager_status || 'Pending';
        const hrStatus = payload.hrStatus || payload.hr_status || 'Pending';
        const finalStatus = payload.finalStatus || payload.final_status || (payload.status === 'Rejected' ? 'Rejected' : payload.status === 'Approved' && hrStatus === 'Approved' ? 'Approved' : payload.status === 'Approved' ? 'Manager Approved' : 'Pending');
        return {
            id: leaveId,
            leaveId,
            empId,
            type: leaveType,
            leaveType,
            from,
            fromDate: from,
            to,
            toDate: to,
            totalDays: Number(payload.totalDays ?? payload.total_days ?? db().dateDiff(from, to)),
            reason: String(payload.reason || '').trim().replace(/\s+/g, ' '),
            managerStatus,
            hrStatus,
            finalStatus,
            status: statusFromWorkflow(finalStatus, managerStatus, hrStatus, payload.status || 'Pending'),
            appliedOn: payload.appliedOn || payload.applied_on || (payload.appliedAt ? String(payload.appliedAt).slice(0, 10) : payload.applied_at ? String(payload.applied_at).slice(0, 10) : today()),
            appliedAt: payload.appliedAt || payload.applied_at || new Date().toISOString(),
            decidedOn: payload.decidedOn || payload.decided_on || (payload.reviewedAt ? String(payload.reviewedAt).slice(0, 10) : payload.reviewed_at ? String(payload.reviewed_at).slice(0, 10) : null),
            reviewedAt: payload.reviewedAt || payload.reviewed_at || null,
            remarks: payload.remarks || payload.hrMessage || payload.hr_message || '',
            hrMessage: payload.hrMessage || payload.hr_message || payload.remarks || '',
            document: payload.document || payload.documentUrl || payload.document_url || null,
            documentUrl: payload.documentUrl || payload.document_url || payload.document || null,
            balanceDeducted: !!(payload.balanceDeducted ?? payload.balance_deducted),
            source: payload.source || 'manual'
        };
    }

    function toSupabaseLeave(payload = {}) {
        const row = buildLocalLeave(payload);
        return {
            leave_id: row.leaveId,
            emp_id: row.empId,
            leave_type: row.leaveType,
            from_date: row.from,
            to_date: row.to,
            total_days: Number(row.totalDays || 0),
            reason: row.reason,
            manager_status: row.managerStatus,
            hr_status: row.hrStatus,
            final_status: row.finalStatus,
            status: row.status,
            applied_at: row.appliedAt,
            reviewed_at: row.reviewedAt,
            remarks: row.remarks,
            hr_message: row.hrMessage,
            document_url: row.documentUrl,
            balance_deducted: !!row.balanceDeducted,
            source: row.source || 'manual'
        };
    }

    function fromSupabaseLeave(row) {
        if (!row) return null;
        return buildLocalLeave({
            id: row.leave_id,
            leaveId: row.leave_id,
            empId: row.emp_id,
            leaveType: row.leave_type,
            from: row.from_date,
            to: row.to_date,
            totalDays: row.total_days,
            reason: row.reason,
            managerStatus: row.manager_status,
            hrStatus: row.hr_status,
            finalStatus: row.final_status,
            status: row.status,
            appliedAt: row.applied_at,
            reviewedAt: row.reviewed_at,
            remarks: row.remarks,
            hrMessage: row.hr_message,
            documentUrl: row.document_url,
            balanceDeducted: row.balance_deducted,
            source: row.source || 'supabase'
        });
    }

    function mirrorLocalLeave(row) {
        const rec = buildLocalLeave(row);
        if (!rec.empId || !rec.leaveId) return null;
        const data = db().get();
        if (!data.leaveRequests) data.leaveRequests = [];
        const idx = data.leaveRequests.findIndex(l => (l.leaveId || l.id) === rec.leaveId);
        const existing = idx > -1 ? data.leaveRequests[idx] : null;
        const merged = { ...(existing || {}), ...rec, id: rec.leaveId, leaveId: rec.leaveId };
        if (merged.finalStatus === 'Approved' && !merged.balanceDeducted) {
            const empIdx = (data.employees || []).findIndex(e => e.id === merged.empId);
            if (empIdx > -1) {
                data.employees[empIdx].leaveBalance = Math.max(0, Number(data.employees[empIdx].leaveBalance || 0) - Number(merged.totalDays || 0));
                merged.balanceDeducted = true;
            }
            if (db()._syncApprovedLeaveAttendance) db()._syncApprovedLeaveAttendance(data, merged);
        }
        if (idx > -1) data.leaveRequests[idx] = merged;
        else data.leaveRequests.push(merged);
        db().normalizeDataArchitecture(data);
        db().save(data);
        return merged;
    }

    function mirrorLocalLeaves(rows = []) {
        rows.forEach(mirrorLocalLeave);
        return rows;
    }

    function filterLocalLeave(filters = {}) {
        let rows = localRows();
        if (filters.empId) {
            const empId = db().resolveEmployeeId(filters.empId);
            rows = rows.filter(l => l.empId === empId);
        }
        if (filters.status) rows = rows.filter(l => l.status === filters.status);
        if (filters.finalStatus) rows = rows.filter(l => l.finalStatus === filters.finalStatus);
        return rows;
    }

    async function supabaseUpsert(payload) {
        const { data, error } = await client()
            .from('leave_requests')
            .upsert(toSupabaseLeave(payload), { onConflict: 'leave_id' })
            .select()
            .single();
        if (error) throw error;
        const row = fromSupabaseLeave(data);
        mirrorLocalLeave(row);
        supabaseLeaveCache = null;
        return row;
    }

    async function fetchLeaveRequests(filters = {}) {
        if (!supabaseReady() || filters.__local) return filterLocalLeave(filters);
        try {
            let query = client().from('leave_requests').select('*').order('applied_at', { ascending: false });
            if (filters.empId) query = query.eq('emp_id', db().resolveEmployeeId(filters.empId));
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.finalStatus) query = query.eq('final_status', filters.finalStatus);
            const { data, error } = await query;
            if (error) throw error;
            const rows = (data || []).map(fromSupabaseLeave).filter(Boolean);
            supabaseLeaveCache = rows;
            mirrorLocalLeaves(rows);
            return rows;
        } catch (err) {
            console.warn('Supabase leave fetch fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return filterLocalLeave(filters);
        }
    }

    function getLeaveBalances(empId) {
        const data = db().get();
        const officialId = db().resolveEmployeeId(empId, data);
        const emp = (data.employees || []).find(e => e.id === officialId) || {};
        const approved = (data.leaveRequests || []).filter(l => l.empId === officialId && (l.finalStatus === 'Approved' || (l.status === 'Approved' && l.finalStatus !== 'Manager Approved')));
        const usedBy = type => approved.filter(l => db().normalizeLeaveType(l.type || l.leaveType) === type).reduce((sum, l) => sum + Number(l.totalDays || db().dateDiff(l.from, l.to)), 0);
        const companySettings = db().getCompanySettings?.() || {};
        const totalEntitlement = Number(emp.annualLeaveEntitlement || companySettings.defaultAnnualLeaveDays || 20);
        const casualTotal = Number(emp.casualLeaveTotal || 6);
        const sickTotal = Number(emp.sickLeaveTotal || 6);
        const earnedTotal = Number(emp.earnedLeaveTotal || Math.max(0, totalEntitlement - casualTotal - sickTotal));
        return {
            empId: officialId,
            total: { entitlement: totalEntitlement, remaining: Number(emp.leaveBalance || 0), used: approved.reduce((sum, l) => sum + Number(l.totalDays || db().dateDiff(l.from, l.to)), 0) },
            casual: { entitlement: casualTotal, used: usedBy('Casual Leave'), remaining: Math.max(0, casualTotal - usedBy('Casual Leave')) },
            sick: { entitlement: sickTotal, used: usedBy('Sick Leave'), remaining: Math.max(0, sickTotal - usedBy('Sick Leave')) },
            earned: { entitlement: earnedTotal, used: usedBy('Earned Leave'), remaining: Math.max(0, earnedTotal - usedBy('Earned Leave')) }
        };
    }

    function ensureLeaveBalance(payload) {
        const row = buildLocalLeave(payload);
        if (/work from home/i.test(row.leaveType)) return null;
        const emp = db().getEmployee(row.empId);
        if (!emp) return 'Employee does not exist';
        if (Number(row.totalDays || 0) > Number(emp.leaveBalance || 0)) return 'Not enough leave balance';
        const balances = getLeaveBalances(row.empId);
        const key = row.leaveType === 'Sick Leave' ? 'sick' : row.leaveType === 'Earned Leave' ? 'earned' : row.leaveType === 'Casual Leave' ? 'casual' : '';
        if (key && Number(row.totalDays || 0) > balances[key].remaining) return `${row.leaveType} balance is not sufficient`;
        return null;
    }

    function notifyLeaveSync(rows = []) {
        if (global.dispatchEvent && global.CustomEvent) {
            global.dispatchEvent(new CustomEvent('arthhrms:leave-sync', { detail: { rows } }));
        }
        ['renderHome', 'renderLeave', 'renderMgDash', 'renderMgLeave', 'renderDashboard', 'refreshEmpBell', 'refreshMgBell', 'refreshHRBell'].forEach(name => {
            if (typeof global[name] === 'function') {
                try { global[name](); } catch (err) { console.warn('Leave sync refresh skipped for ' + name + ':', err.message || err); }
            }
        });
    }

    async function upsertIfLive(row) {
        if (!supabaseReady()) return row;
        try { return await supabaseUpsert(row); }
        catch (err) {
            console.warn('Supabase leave upsert fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return row;
        }
    }

    const leaveService = {
        getLeaveRequests() {
            return supabaseReady() && Array.isArray(supabaseLeaveCache) ? supabaseLeaveCache : localRows();
        },
        getLeaveByEmployee(empId) {
            const officialId = db().resolveEmployeeId(empId);
            if (supabaseReady() && Array.isArray(supabaseLeaveCache)) return supabaseLeaveCache.filter(l => l.empId === officialId);
            return localByEmployee(officialId);
        },
        isSupabaseLeaveEnabled() { return supabaseReady(); },
        mapToSupabaseLeave: toSupabaseLeave,
        mapFromSupabaseLeave: fromSupabaseLeave,
        mirrorLocalLeave,
        getLeaveBalances,
        fetchLeaveRequests,
        fetchLeaveByEmployee(empId) { return fetchLeaveRequests({ empId }); },
        async applyLeave(request) {
            const balanceError = ensureLeaveBalance(request);
            if (balanceError) return { error: balanceError };
            try {
                const local = localApply(request);
                return await upsertIfLive(local);
            } catch (err) {
                return { error: err.message || String(err) };
            }
        },
        async createLeave(payload) {
            const row = buildLocalLeave(payload);
            if (!row.reason) row.reason = 'Imported leave record';
            if (!supabaseReady()) return mirrorLocalLeave(row);
            try { return await supabaseUpsert(row); }
            catch (err) {
                console.warn('Supabase leave create fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return mirrorLocalLeave(row);
            }
        },
        async updateLeave(id, status, message = '', actorRole = 'hr', actorId = '') {
            const existing = localRows().find(l => (l.leaveId || l.id) === id);
            if (existing?.finalStatus === 'Approved' && status === 'Approved') return { error: 'Leave is already finally approved' };
            if (existing?.finalStatus === 'Rejected') return { error: 'Leave is already rejected' };
            const updated = localUpdate(id, status, message, actorRole, actorId);
            if (!updated) return { error: 'Leave request not found' };
            return await upsertIfLive(updated);
        },
        approveLeaveManager(id, message = '', actorId = '') {
            const existing = localRows().find(l => (l.leaveId || l.id) === id);
            if (existing?.managerStatus === 'Approved') return Promise.resolve({ error: 'Leave is already manager approved' });
            return this.updateLeave(id, 'Approved', message, 'manager', actorId);
        },
        approveLeaveHR(id, message = '', actorId = '') {
            return this.updateLeave(id, 'Approved', message, 'hr', actorId);
        },
        rejectLeave(id, message = '', actorRole = 'hr', actorId = '') {
            return this.updateLeave(id, 'Rejected', message, actorRole, actorId);
        },
        async syncLeaveFromSupabase(filters = {}) {
            const rows = await fetchLeaveRequests(filters);
            notifyLeaveSync(rows);
            return rows;
        }
    };

    global.leaveService = { ...(global.leaveService || {}), ...leaveService };

    if (global.addEventListener) {
        global.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (!supabaseReady()) return;
                leaveService.syncLeaveFromSupabase().catch(err => {
                    console.warn('Initial Supabase leave sync fell back to local DB:', err.message || err);
                    recordFallback(err.message || String(err));
                });
            }, 140);
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
