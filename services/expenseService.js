// Expense service adapter.
// Keeps current local DB behavior stable while preparing Supabase-backed expense workflows.
(function (global) {
    function db() { return global.DB; }
    let supabaseExpenseCache = null;

    function today() {
        return db().today ? db().today() : new Date().toISOString().split('T')[0];
    }

    function localRows() {
        return db().get().expenseClaims || [];
    }

    function localByEmployee(empId) {
        return db().ExpenseService?.byEmployee ? db().ExpenseService.byEmployee(empId) : db().getExpenseClaimsByEmp(empId);
    }

    function localForManager(managerId) {
        return db().ExpenseService?.forManager ? db().ExpenseService.forManager(managerId) : db().getExpenseClaimsForManager(managerId);
    }

    function localForFinance() {
        return db().ExpenseService?.forHR ? db().ExpenseService.forHR() : db().getExpenseClaimsForHR();
    }

    function localSubmit(claim) {
        return db().ExpenseService?.create ? db().ExpenseService.create(claim) : db().addExpenseClaim(claim);
    }

    function localApproveManager(id, remark, actorId) {
        return db().ExpenseService?.approveManager ? db().ExpenseService.approveManager(id, remark, actorId) : db().approveExpenseClaimByManager(id, remark, actorId);
    }

    function localRejectManager(id, remark, actorId) {
        return db().ExpenseService?.rejectManager ? db().ExpenseService.rejectManager(id, remark, actorId) : db().rejectExpenseClaimByManager(id, remark, actorId);
    }

    function localProcessFinance(id, action, remark, actorId) {
        return db().ExpenseService?.processHR ? db().ExpenseService.processHR(id, action, remark, actorId) : db().processExpenseClaimByHR(id, action, remark, actorId);
    }

    function supabaseReady() {
        const svc = global.supabaseClientService;
        return !!(svc && svc.isEnabled && svc.isEnabled('USE_SUPABASE_EXPENSES') && svc.getClient && svc.getClient());
    }

    function client() {
        return global.supabaseClientService.getClient();
    }

    function recordFallback(reason) {
        try { global.migrationControlService?.recordFallback?.('expenseClaims', reason, { role: 'system', id: 'expenseService', name: 'Expense Service' }); } catch (e) {}
    }

    function statusBundle(payload = {}) {
        const rawStatus = String(payload.status || payload.finalStatus || payload.final_status || '').trim();
        const manager = payload.managerStatus || payload.manager_status || '';
        const finance = payload.financeStatus || payload.finance_status || '';
        const final = payload.finalStatus || payload.final_status || '';
        const status = rawStatus || (
            final === 'Paid' || finance === 'Paid' ? 'Paid' :
            final === 'Rejected' || manager === 'Rejected' || finance === 'Rejected' ? (manager === 'Rejected' ? 'Rejected by Manager' : 'Rejected by HR') :
            final === 'Approved' || finance === 'Approved' ? 'Pending HR Payment' :
            final === 'Manager Approved' || manager === 'Approved' ? 'Pending HR Payment' :
            'Pending Manager Approval'
        );

        if (status === 'Paid' || final === 'Paid' || finance === 'Paid') {
            return { status: 'Paid', managerStatus: 'Approved', financeStatus: 'Paid', finalStatus: 'Paid', level: 3 };
        }
        if (status === 'Rejected by Manager' || manager === 'Rejected') {
            return { status: 'Rejected by Manager', managerStatus: 'Rejected', financeStatus: 'Not Required', finalStatus: 'Rejected', level: 1 };
        }
        if (status === 'Rejected by HR' || status === 'Rejected by Finance' || finance === 'Rejected') {
            return { status: 'Rejected by HR', managerStatus: 'Approved', financeStatus: 'Rejected', finalStatus: 'Rejected', level: 2 };
        }
        if (status === 'Finance Approved' || status === 'Pending Payment' || final === 'Approved' || finance === 'Approved') {
            return { status: 'Pending HR Payment', managerStatus: 'Approved', financeStatus: 'Approved', finalStatus: 'Approved', level: 2 };
        }
        if (status === 'Pending HR Payment' || status === 'Approved by Manager' || final === 'Manager Approved' || manager === 'Approved') {
            return { status: 'Pending HR Payment', managerStatus: 'Approved', financeStatus: finance || 'Pending', finalStatus: 'Manager Approved', level: 2 };
        }
        return { status: 'Pending Manager Approval', managerStatus: manager || 'Pending', financeStatus: finance || 'Pending', finalStatus: final || 'Pending', level: 1 };
    }

    function buildLocalExpense(payload = {}) {
        const data = db().get();
        const empId = db().resolveEmployeeId(payload.empId || payload.employeeId || payload.emp_id, data);
        const expenseId = payload.expenseId || payload.expense_id || payload.claimId || payload.id || db().generateExpenseId?.(data) || db().generateRecordId('expense', data);
        const expenseDate = payload.expenseDate || payload.expense_date || payload.date || today();
        const statuses = statusBundle(payload);
        const submittedAt = payload.submittedAt || payload.submitted_at || payload.createdAt || payload.created_at || new Date().toISOString();
        const attachmentFileName = payload.attachmentFileName || payload.attachment_file_name || payload.billFileName || payload.billFile || '';
        const attachmentUrl = payload.attachmentUrl || payload.attachment_url || '';
        return {
            id: expenseId,
            expenseId,
            claimId: expenseId,
            empId,
            category: payload.category || 'Other',
            date: expenseDate,
            expenseDate,
            amount: Number(payload.amount || 0),
            currency: payload.currency || data.companySettings?.currency || data.settings?.currency || 'INR',
            description: String(payload.description || '').trim(),
            billFileName: attachmentFileName,
            attachmentFileName,
            attachmentUrl,
            managerStatus: statuses.managerStatus,
            financeStatus: statuses.financeStatus,
            finalStatus: statuses.finalStatus,
            status: statuses.status,
            managerRemark: payload.managerRemark || payload.managerRemarks || payload.manager_remark || '',
            managerRemarks: payload.managerRemark || payload.managerRemarks || payload.manager_remark || '',
            hrRemark: payload.hrRemark || payload.financeRemarks || payload.finance_remark || '',
            financeRemarks: payload.financeRemarks || payload.hrRemark || payload.finance_remark || '',
            remarks: payload.remarks || '',
            level: Number(payload.level || statuses.level || 1),
            submittedOn: payload.submittedOn || payload.submitted_on || String(submittedAt).slice(0, 10),
            submittedAt,
            reviewedAt: payload.reviewedAt || payload.reviewed_at || null,
            approvedByManagerOn: payload.approvedByManagerOn || payload.approved_by_manager_on || null,
            financeApprovedOn: payload.financeApprovedOn || payload.finance_approved_on || null,
            paymentDate: payload.paymentDate || payload.payment_date || (payload.paidAt ? String(payload.paidAt).slice(0, 10) : payload.paid_at ? String(payload.paid_at).slice(0, 10) : null),
            paidAt: payload.paidAt || payload.paid_at || null,
            source: payload.source || 'manual'
        };
    }

    function toSupabaseExpense(payload = {}) {
        const row = buildLocalExpense(payload);
        return {
            expense_id: row.expenseId,
            emp_id: row.empId,
            category: row.category,
            expense_date: row.expenseDate,
            amount: Number(row.amount || 0),
            currency: row.currency,
            description: row.description,
            attachment_url: row.attachmentUrl,
            attachment_file_name: row.attachmentFileName,
            manager_status: row.managerStatus,
            finance_status: row.financeStatus,
            final_status: row.finalStatus,
            status: row.status,
            submitted_at: row.submittedAt,
            reviewed_at: row.reviewedAt,
            paid_at: row.paidAt,
            remarks: row.remarks,
            manager_remark: row.managerRemark,
            finance_remark: row.financeRemarks || row.hrRemark,
            source: row.source || 'manual'
        };
    }

    function fromSupabaseExpense(row) {
        if (!row) return null;
        return buildLocalExpense({
            id: row.expense_id,
            expenseId: row.expense_id,
            empId: row.emp_id,
            category: row.category,
            expenseDate: row.expense_date,
            amount: row.amount,
            currency: row.currency,
            description: row.description,
            attachmentUrl: row.attachment_url,
            attachmentFileName: row.attachment_file_name,
            managerStatus: row.manager_status,
            financeStatus: row.finance_status,
            finalStatus: row.final_status,
            status: row.status,
            submittedAt: row.submitted_at,
            reviewedAt: row.reviewed_at,
            paidAt: row.paid_at,
            remarks: row.remarks,
            managerRemark: row.manager_remark,
            financeRemarks: row.finance_remark,
            source: row.source || 'supabase'
        });
    }

    function mirrorLocalExpense(row) {
        const rec = buildLocalExpense(row);
        if (!rec.empId || !rec.expenseId) return null;
        const data = db().get();
        if (!data.expenseClaims) data.expenseClaims = [];
        const idx = data.expenseClaims.findIndex(c => (c.expenseId || c.id || c.claimId) === rec.expenseId);
        const existing = idx > -1 ? data.expenseClaims[idx] : null;
        const merged = { ...(existing || {}), ...rec, id: rec.expenseId, expenseId: rec.expenseId };
        if (idx > -1) data.expenseClaims[idx] = merged;
        else data.expenseClaims.push(merged);
        db().normalizeDataArchitecture(data);
        db().save(data);
        return merged;
    }

    function mirrorLocalExpenses(rows = []) {
        rows.forEach(mirrorLocalExpense);
        return rows;
    }

    function filterRows(rows = [], filters = {}) {
        let output = [...rows];
        if (filters.empId) {
            const empId = db().resolveEmployeeId(filters.empId);
            output = output.filter(c => c.empId === empId);
        }
        if (filters.managerId) {
            const managerId = db().resolveEmployeeId(filters.managerId);
            const data = db().get();
            const team = (data.teams || []).find(t => t.managerId === managerId);
            const teamIds = new Set([
                ...((team && team.memberIds) || []).filter(id => id !== managerId),
                ...(data.employees || []).filter(e => e.managerId === managerId).map(e => e.id)
            ]);
            output = output.filter(c => teamIds.has(c.empId) && c.status === 'Pending Manager Approval');
        }
        if (filters.financeQueue || filters.hrQueue) output = output.filter(c => ['Pending HR Payment', 'Finance Approved', 'Pending Payment'].includes(c.status));
        if (filters.status) output = output.filter(c => c.status === filters.status);
        if (filters.finalStatus) output = output.filter(c => c.finalStatus === filters.finalStatus);
        return output.sort((a, b) => (b.submittedAt || b.submittedOn || b.date || '').localeCompare(a.submittedAt || a.submittedOn || a.date || ''));
    }

    function filterLocalExpense(filters = {}) {
        if (filters.managerId) return localForManager(filters.managerId);
        if (filters.financeQueue || filters.hrQueue) return localForFinance();
        if (filters.empId) return localByEmployee(filters.empId);
        return filterRows(localRows(), filters);
    }

    async function uploadExpenseAttachment(file, expenseId, empId) {
        if (!file || !supabaseReady()) return null;
        const currentActor = global.authService?.getCurrentUser?.() || null;
        if (!global.rbacEnforcementService?.requireAccess) throw new Error('RBAC enforcement service is unavailable.');
        const tenantSlug = global.rbacEnforcementService.resolveTenant(null, currentActor);
        global.rbacEnforcementService.requireAccess({ resource: 'expenses', action: 'create', tenantSlug, targetEmployeeId: empId, actor: currentActor });
        const safeName = String(file.name || 'expense-attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${tenantSlug}/${db().resolveEmployeeId(empId) || 'unknown'}/${expenseId}/${Date.now()}-${safeName}`;
        const { data, error } = await client().storage.from('expense-attachments').upload(path, file, {
            cacheControl: '3600',
            upsert: false
        });
        if (error) throw error;
        return { path: data.path, publicUrl: '' };
    }

    async function supabaseUpsert(payload) {
        const { data, error } = await client()
            .from('expense_claims')
            .upsert(toSupabaseExpense(payload), { onConflict: 'expense_id' })
            .select()
            .single();
        if (error) throw error;
        const row = fromSupabaseExpense(data);
        mirrorLocalExpense(row);
        supabaseExpenseCache = null;
        return row;
    }

    async function upsertIfLive(row) {
        if (!supabaseReady()) return row;
        try { return await supabaseUpsert(row); }
        catch (err) {
            console.warn('Supabase expense upsert fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return row;
        }
    }

    async function fetchExpenseClaims(filters = {}) {
        if (!supabaseReady() || filters.__local) return filterLocalExpense(filters);
        try {
            const { data, error } = await client().from('expense_claims').select('*').order('submitted_at', { ascending: false });
            if (error) throw error;
            const rows = (data || []).map(fromSupabaseExpense).filter(Boolean);
            supabaseExpenseCache = rows;
            mirrorLocalExpenses(rows);
            return filterRows(rows, filters);
        } catch (err) {
            console.warn('Supabase expense fetch fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return filterLocalExpense(filters);
        }
    }

    async function localApproveFinance(id, remark = '', actorId = '') {
        const data = db().get();
        const claim = (data.expenseClaims || []).find(c => (c.expenseId || c.id) === id);
        if (!claim) return { error: 'Expense claim not found' };
        if (claim.status === 'Paid') return { error: 'Expense claim is already paid' };
        if (String(claim.status || '').includes('Rejected')) return { error: 'Expense claim is already rejected' };
        claim.managerStatus = claim.managerStatus || 'Approved';
        claim.financeStatus = 'Approved';
        claim.finalStatus = 'Approved';
        claim.status = 'Pending HR Payment';
        claim.hrRemark = remark;
        claim.financeRemarks = remark;
        claim.reviewedAt = new Date().toISOString();
        claim.financeApprovedOn = today();
        db().save(data);
        if (db().writeAuditLog) db().writeAuditLog('hr', actorId || '', 'expense finance approved', 'Expense', claim.expenseId || claim.id, `Expense claim ${claim.expenseId || claim.id} approved for payment`);
        if (global.workflowEngine?.emitWorkflowEvent) {
            global.workflowEngine.emitWorkflowEvent(global.WORKFLOW_EVENTS?.EXPENSE_FINANCE_APPROVED || 'EXPENSE_FINANCE_APPROVED', {
                actorRole: 'hr',
                actorId,
                module: 'Expense',
                targetId: claim.expenseId || claim.id,
                empId: claim.empId,
                targetEmpId: claim.empId,
                priority: 'MEDIUM',
                message: `Expense claim ${claim.expenseId || claim.id} approved for payment`,
                metadata: { empId: claim.empId, amount: claim.amount, status: claim.status }
            });
        }
        return buildLocalExpense(claim);
    }

    function notifyExpenseSync(rows = []) {
        if (global.dispatchEvent && global.CustomEvent) {
            global.dispatchEvent(new CustomEvent('arthhrms:expense-sync', { detail: { rows } }));
        }
        ['renderExpenses', 'renderMgExpenses', 'renderHRExpenses', 'renderHome', 'renderMgDash', 'renderDashboard', 'refreshEmpBell', 'refreshMgBell', 'refreshHRBell'].forEach(name => {
            if (typeof global[name] === 'function') {
                try { global[name](); } catch (err) { console.warn('Expense sync refresh skipped for ' + name + ':', err.message || err); }
            }
        });
    }

    const expenseService = {
        getExpenseClaims(filters = {}) {
            if (supabaseReady() && Array.isArray(supabaseExpenseCache)) return filterRows(supabaseExpenseCache, filters);
            return filterLocalExpense(filters);
        },
        getExpenseClaimsByEmployee(empId) { return this.getExpenseClaims({ empId }); },
        getExpenseClaimsForManager(managerId) { return this.getExpenseClaims({ managerId }); },
        getExpenseClaimsForHR() { return this.getExpenseClaims({ financeQueue: true }); },
        fetchExpenseClaims,
        fetchExpenseByEmployee(empId) { return fetchExpenseClaims({ empId }); },
        fetchExpenseForManager(managerId) { return fetchExpenseClaims({ managerId }); },
        fetchExpenseForFinance() { return fetchExpenseClaims({ financeQueue: true }); },
        isSupabaseExpensesEnabled() { return supabaseReady(); },
        mapToSupabaseExpense: toSupabaseExpense,
        mapFromSupabaseExpense: fromSupabaseExpense,
        mirrorLocalExpense,
        async submitExpense(claim) {
            const row = buildLocalExpense(claim);
            if (!row.empId) return { error: 'Employee does not exist' };
            if (!row.amount || row.amount <= 0) return { error: 'Expense amount must be greater than zero' };
            if (!row.description) return { error: 'Expense description is required' };
            try {
                let local = localSubmit({ ...row, billFileName: row.attachmentFileName });
                if (claim.attachmentFile) {
                    const upload = await uploadExpenseAttachment(claim.attachmentFile, local.expenseId || local.id, local.empId);
                    if (upload) {
                        local.attachmentUrl = upload.publicUrl || upload.path;
                        local.billFileName = local.billFileName || claim.attachmentFile.name || '';
                        local.attachmentFileName = local.billFileName;
                        mirrorLocalExpense(local);
                    }
                }
                return await upsertIfLive(local);
            } catch (err) {
                return { error: err.message || String(err) };
            }
        },
        createExpenseClaim(claim) { return this.submitExpense(claim); },
        async approveExpenseManager(id, remark = '', actorId = '') {
            const existing = localRows().find(c => (c.expenseId || c.id) === id);
            if (existing && existing.status !== 'Pending Manager Approval') return { error: 'Expense claim is not pending manager approval' };
            const ok = localApproveManager(id, remark, actorId);
            if (!ok) return { error: 'Expense claim not found' };
            const row = localRows().find(c => (c.expenseId || c.id) === id);
            return await upsertIfLive(row);
        },
        async approveExpenseFinance(id, remark = '', actorId = '') {
            const row = await localApproveFinance(id, remark, actorId);
            if (row?.error) return row;
            return await upsertIfLive(row);
        },
        async markExpensePaid(id, remark = '', actorId = '') {
            const ok = localProcessFinance(id, 'paid', remark, actorId);
            if (!ok) return { error: 'Expense claim not found' };
            const row = localRows().find(c => (c.expenseId || c.id) === id);
            return await upsertIfLive(row);
        },
        async rejectExpense(id, remark = '', actorRole = 'manager', actorId = '') {
            const role = String(actorRole || 'manager').toLowerCase();
            const ok = role === 'manager' ? localRejectManager(id, remark, actorId) : localProcessFinance(id, 'reject', remark, actorId);
            if (!ok) return { error: 'Expense claim not found' };
            const row = localRows().find(c => (c.expenseId || c.id) === id);
            return await upsertIfLive(row);
        },
        rejectExpenseManager(id, remark = '', actorId = '') { return this.rejectExpense(id, remark, 'manager', actorId); },
        rejectExpenseFinance(id, remark = '', actorId = '') { return this.rejectExpense(id, remark, 'hr', actorId); },
        uploadExpenseAttachment,
        exportExpenseClaimsData(filters = {}) { return this.getExpenseClaims(filters).map(buildLocalExpense); },
        async syncExpenseClaimsFromSupabase(filters = {}) {
            const rows = await fetchExpenseClaims(filters);
            notifyExpenseSync(rows);
            return rows;
        }
    };

    global.expenseService = { ...(global.expenseService || {}), ...expenseService };

    if (global.addEventListener) {
        global.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (!supabaseReady()) return;
                expenseService.syncExpenseClaimsFromSupabase().catch(err => {
                    console.warn('Initial Supabase expense sync fell back to local DB:', err.message || err);
                    recordFallback(err.message || String(err));
                });
            }, 180);
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
