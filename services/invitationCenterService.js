// Tenant invitation center adapter over the existing Supabase Auth invite pipeline.
(function (global) {
    'use strict';

    const INVITER_ROLES = Object.freeze(['super_admin', 'admin', 'hr', 'hr_head']);
    const ASSIGNABLE_ROLES = Object.freeze(['admin', 'hr', 'hr_head', 'manager', 'employee', 'director']);

    function normalizeRole(value) {
        return String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
    }

    function normalizeStatus(row = {}) {
        const value = String(row.activationStatus || row.inviteStatus || row.status || 'Draft').trim().toUpperCase();
        if (value.includes('ACTIV')) return value === 'ACTIVE' ? 'ACTIVATED' : value;
        if (value.includes('FAIL')) return 'FAILED';
        if (value.includes('EXPIRE')) return 'EXPIRED';
        if (value.includes('CANCEL')) return 'CANCELLED';
        if (value.includes('SENT')) return 'SENT';
        if (value.includes('PENDING')) return 'QUEUED';
        return value || 'DRAFT';
    }

    function isEnabled() {
        return !!global.supabaseClientService?.isEnabled?.('USE_INVITATION_CENTER');
    }

    function actor() {
        return global.authService?.getCurrentUser?.() || {};
    }

    function assertActor() {
        const current = actor();
        const role = normalizeRole(current.role);
        if (!INVITER_ROLES.includes(role)) throw new Error('Invitation Center access is not allowed for this role.');
        if (!current.tenantId || !current.companyId) throw new Error('Trusted tenant context is required.');
        return { ...current, role };
    }

    function list(options = {}) {
        const current = assertActor();
        const query = String(options.query || '').trim().toLowerCase();
        const roleFilter = normalizeRole(options.role || '');
        const statusFilter = String(options.status || '').trim().toUpperCase();
        return (global.authInviteService?.getInvites?.() || [])
            .map(row => ({ ...row, normalizedStatus: normalizeStatus(row) }))
            .filter(row => !roleFilter || normalizeRole(row.role) === roleFilter)
            .filter(row => !statusFilter || row.normalizedStatus === statusFilter)
            .filter(row => !query || [row.name, row.email, row.empId, row.inviteId].some(value => String(value || '').toLowerCase().includes(query)))
            .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))
            .map(row => ({ ...row, tenantId: current.tenantId }));
    }

    function summary() {
        const rows = list();
        const counts = rows.reduce((result, row) => {
            result[row.normalizedStatus] = Number(result[row.normalizedStatus] || 0) + 1;
            return result;
        }, {});
        return Object.freeze({
            total: rows.length,
            pending: Number(counts.QUEUED || 0) + Number(counts.SENT || 0),
            activated: Number(counts.ACTIVATED || 0) + Number(counts.ACTIVE || 0),
            attention: Number(counts.FAILED || 0) + Number(counts.EXPIRED || 0),
            cancelled: Number(counts.CANCELLED || 0)
        });
    }

    function eligibleEmployees() {
        assertActor();
        const latestByEmployee = new Map();
        list().forEach(row => {
            if (row.empId && !latestByEmployee.has(row.empId)) latestByEmployee.set(row.empId, row);
        });
        return (global.DB?.getEmployees?.() || [])
            .filter(employee => {
                const invite = latestByEmployee.get(employee.id);
                return !employee.authUserId && !invite;
            })
            .map(employee => ({
                id: employee.id,
                name: employee.name || '',
                email: employee.email || '',
                role: normalizeRole(employee.role || 'employee'),
                department: employee.dept || employee.department || ''
            }));
    }

    async function send(input = {}) {
        const current = assertActor();
        const employee = global.DB?.getEmployee?.(String(input.empId || '').trim());
        if (!employee) return { ok: false, error: 'Select an existing tenant employee before sending an invitation.' };
        const role = normalizeRole(input.role || employee.role || 'employee');
        if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'The selected tenant role cannot be invited from this center.' };
        if (!employee.email && !input.email) return { ok: false, error: 'The employee must have a valid email address.' };
        return global.authInviteService.sendInvite({
            empId: employee.id,
            email: input.email || employee.email,
            role,
            name: input.name || employee.name,
            tenantId: current.tenantId,
            companyId: current.companyId,
            invitedBy: current.id,
            invitedByRole: current.role
        });
    }

    async function resend(inviteId) {
        assertActor();
        return global.authInviteService?.resendInvite?.(inviteId) || { ok: false, error: 'Invite resend is unavailable.' };
    }

    async function cancel(inviteId) {
        assertActor();
        return global.authInviteService?.cancelInvite?.(inviteId) || { ok: false, error: 'Invite cancellation is unavailable.' };
    }

    const service = Object.freeze({
        INVITER_ROLES,
        ASSIGNABLE_ROLES,
        isEnabled,
        normalizeStatus,
        list,
        summary,
        eligibleEmployees,
        send,
        resend,
        cancel
    });

    global.InvitationCenterService = service;
    global.invitationCenterService = service;
})(typeof window !== 'undefined' ? window : globalThis);
