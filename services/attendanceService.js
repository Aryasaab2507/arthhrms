// Attendance service adapter.
// Keeps current local DB behavior stable while preparing Supabase-backed attendance.
(function (global) {
    function db() { return global.DB; }
    let supabaseAttendanceCache = null;

    function localRows() {
        return db().get().attendance || [];
    }

    function filterLocalAttendance(filters = {}) {
        let rows = localRows();
        if (filters.empId) {
            const empId = db().resolveEmployeeId(filters.empId);
            rows = rows.filter(a => a.empId === empId);
        }
        if (filters.date) rows = rows.filter(a => a.date === filters.date);
        return rows;
    }

    function localToday() {
        return db().AttendanceService?.today ? db().AttendanceService.today() : db().getTodayAttendance();
    }

    function localByEmployee(empId) {
        return db().AttendanceService?.byEmployee ? db().AttendanceService.byEmployee(empId) : db().getEmpAttendance(empId);
    }

    function localMark(empId, type) {
        return db().AttendanceService?.mark ? db().AttendanceService.mark(empId, type) : db().markAttendance(empId, type);
    }

    function supabaseReady() {
        const svc = global.supabaseClientService;
        return !!(svc && svc.isEnabled && svc.isEnabled('USE_SUPABASE_ATTENDANCE') && svc.getClient && svc.getClient());
    }

    function client() {
        return global.supabaseClientService.getClient();
    }

    function recordFallback(reason) {
        try { global.migrationControlService?.recordFallback?.('attendance', reason, { role: 'system', id: 'attendanceService', name: 'Attendance Service' }); } catch (e) {}
    }

    function today() {
        return db().today ? db().today() : new Date().toISOString().split('T')[0];
    }

    function now() {
        return db().now ? db().now() : new Date().toLocaleTimeString('en-IN', { hour12: false });
    }

    function normalizeTime(value) {
        if (!value) return null;
        const text = String(value).trim();
        const parts = text.split(':');
        if (parts.length < 2) return text;
        return `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:${String(parts[2] || '00').padStart(2, '0')}`;
    }

    function minutes(time) {
        return db().timeToMins(String(time || '00:00').slice(0, 5));
    }

    function calculateLateMinutes(checkIn, shift) {
        if (!checkIn || !shift) return 0;
        const grace = db().addMinutes(shift.startTime || '09:00', Number(shift.graceMinutes || 15));
        return Math.max(0, minutes(checkIn) - minutes(grace));
    }

    function calculateStatus(checkIn, shift) {
        if (!checkIn) return 'Absent';
        return calculateLateMinutes(checkIn, shift) > 0 ? 'Late' : 'Present';
    }

    function getEmployee(empId) {
        return db().getEmployee(db().resolveEmployeeId(empId));
    }

    function buildLocalRecord(payload = {}) {
        const data = db().get();
        const empId = db().resolveEmployeeId(payload.empId || payload.employeeId || payload.emp_id, data);
        const emp = (data.employees || []).find(e => e.id === empId) || {};
        const shiftId = payload.shiftId || payload.shift_id || emp.shiftId || 'SH002';
        const shift = (data.shifts || []).find(s => s.id === shiftId);
        const checkIn = normalizeTime(payload.checkIn || payload.check_in);
        const checkOut = normalizeTime(payload.checkOut || payload.check_out);
        const workingHours = payload.workingHours || payload.working_hours_text || (checkIn && checkOut ? db().calcWorkingHours(checkIn, checkOut) : null);
        const status = payload.status || calculateStatus(checkIn, shift);
        return {
            id: payload.id || payload.attendanceId || payload.attendance_id || '',
            attendanceId: payload.attendanceId || payload.attendance_id || payload.id || '',
            empId,
            date: payload.date || payload.attendanceDate || payload.attendance_date || today(),
            attendanceDate: payload.attendanceDate || payload.attendance_date || payload.date || today(),
            shiftId,
            checkIn,
            checkOut,
            workingHours,
            lateMinutes: Number(payload.lateMinutes ?? payload.late_minutes ?? calculateLateMinutes(checkIn, shift)),
            status,
            regularizationStatus: payload.regularizationStatus || payload.regularization_status || 'None',
            remarks: payload.remarks || '',
            source: payload.source || 'manual'
        };
    }

    function toSupabaseAttendance(payload = {}) {
        const row = buildLocalRecord(payload);
        return {
            attendance_id: row.attendanceId || db().generateAttendanceId?.(db().get()) || db().generateRecordId('attendance'),
            emp_id: row.empId,
            attendance_date: row.date,
            shift_id: row.shiftId || null,
            check_in: row.checkIn,
            check_out: row.checkOut,
            working_hours: row.workingHours,
            working_hours_text: row.workingHours,
            late_minutes: Number(row.lateMinutes || 0),
            status: row.status || 'Absent',
            regularization_status: row.regularizationStatus || 'None',
            remarks: row.remarks || '',
            source: row.source || 'manual'
        };
    }

    function fromSupabaseAttendance(row) {
        if (!row) return null;
        return buildLocalRecord({
            id: row.attendance_id,
            attendanceId: row.attendance_id,
            empId: row.emp_id,
            date: row.attendance_date,
            shiftId: row.shift_id,
            checkIn: row.check_in,
            checkOut: row.check_out,
            workingHours: row.working_hours_text || row.working_hours,
            lateMinutes: row.late_minutes,
            status: row.status,
            regularizationStatus: row.regularization_status,
            remarks: row.remarks,
            source: row.source || 'supabase'
        });
    }

    function mirrorLocalAttendance(row) {
        const rec = buildLocalRecord(row);
        if (!rec.empId || !rec.date) return null;
        const data = db().get();
        if (!data.attendance) data.attendance = [];
        const idx = data.attendance.findIndex(a => db().resolveEmployeeId(a.empId, data) === rec.empId && a.date === rec.date);
        const existing = idx > -1 ? data.attendance[idx] : null;
        if (!rec.attendanceId) rec.attendanceId = existing?.attendanceId || existing?.id || db().generateAttendanceId?.(data) || db().generateRecordId('attendance', data);
        if (!rec.id) rec.id = rec.attendanceId;
        if (idx > -1) data.attendance[idx] = { ...data.attendance[idx], ...rec, empId: rec.empId, date: rec.date };
        else data.attendance.push(rec);
        db().save(data);
        return rec;
    }

    function mirrorLocalAttendances(rows = []) {
        rows.forEach(mirrorLocalAttendance);
        return rows;
    }

    async function supabaseUpsert(payload) {
        const { data, error } = await client()
            .from('attendance')
            .upsert(toSupabaseAttendance(payload), { onConflict: 'emp_id,attendance_date' })
            .select()
            .single();
        if (error) throw error;
        const row = fromSupabaseAttendance(data);
        mirrorLocalAttendance(row);
        supabaseAttendanceCache = null;
        return row;
    }

    async function fetchAttendance(filters = {}) {
        if (!supabaseReady() || filters.__local) return filterLocalAttendance(filters);
        try {
            let query = client().from('attendance').select('*').order('attendance_date', { ascending: false });
            if (filters.empId) query = query.eq('emp_id', db().resolveEmployeeId(filters.empId));
            if (filters.date) query = query.eq('attendance_date', filters.date);
            const { data, error } = await query;
            if (error) throw error;
            const rows = (data || []).map(fromSupabaseAttendance).filter(Boolean);
            supabaseAttendanceCache = rows;
            mirrorLocalAttendances(rows);
            return rows;
        } catch (err) {
            console.warn('Supabase attendance fetch fell back to local DB:', err.message || err);
            recordFallback(err.message || String(err));
            return filterLocalAttendance(filters);
        }
    }

    function notifyAttendanceSync(rows = []) {
        if (global.dispatchEvent && global.CustomEvent) {
            global.dispatchEvent(new CustomEvent('arthhrms:attendance-sync', { detail: { rows } }));
        }
        [
            'refreshHomeAttendanceWidget',
            'renderHome',
            'renderAttendance',
            'renderMgDash',
            'renderMgAttendance',
            'renderAdDash',
            'renderAdAttendance',
            'renderDashboard',
            'renderSADash',
            'renderSAAttendance'
        ].forEach(name => {
            if (typeof global[name] === 'function') {
                try { global[name](); } catch (err) { console.warn('Attendance sync refresh skipped for ' + name + ':', err.message || err); }
            }
        });
    }

    const attendanceService = {
        getTodayAttendance() {
            if (supabaseReady() && Array.isArray(supabaseAttendanceCache)) return supabaseAttendanceCache.filter(a => a.date === today());
            return localToday();
        },
        getAttendance() {
            return supabaseReady() && Array.isArray(supabaseAttendanceCache) ? supabaseAttendanceCache : localRows();
        },
        getAttendanceByEmployee(empId) {
            const officialId = db().resolveEmployeeId(empId);
            if (supabaseReady() && Array.isArray(supabaseAttendanceCache)) return supabaseAttendanceCache.filter(a => a.empId === officialId);
            return localByEmployee(officialId);
        },
        markAttendance(empId, type) { return localMark(empId, type); },
        bulkImportAttendance(rows) { return db().AttendanceService?.bulkImport ? db().AttendanceService.bulkImport(rows) : db().bulkImportAttendance(rows); },
        exportAttendanceData() { return db().AttendanceService?.export ? db().AttendanceService.export() : db().exportAttendanceData(); },
        isSupabaseAttendanceEnabled() { return supabaseReady(); },
        mapToSupabaseAttendance: toSupabaseAttendance,
        mapFromSupabaseAttendance: fromSupabaseAttendance,
        mirrorLocalAttendance,
        fetchAttendance,
        fetchAttendanceByEmployee(empId) { return fetchAttendance({ empId }); },
        fetchTodayAttendance() { return fetchAttendance({ date: today() }); },
        async createAttendance(payload) {
            if (!supabaseReady()) return mirrorLocalAttendance(payload);
            try { return await supabaseUpsert(payload); }
            catch (err) {
                console.warn('Supabase attendance create fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return mirrorLocalAttendance(payload);
            }
        },
        async updateAttendance(empId, date, fields = {}) {
            const current = localRows().find(a => a.empId === db().resolveEmployeeId(empId) && a.date === date) || {};
            const payload = { ...current, ...fields, empId, date };
            if (!supabaseReady()) return mirrorLocalAttendance(payload);
            try { return await supabaseUpsert(payload); }
            catch (err) {
                console.warn('Supabase attendance update fell back to local DB:', err.message || err);
                recordFallback(err.message || String(err));
                return mirrorLocalAttendance(payload);
            }
        },
        async markCheckIn(empId) {
            const officialId = db().resolveEmployeeId(empId);
            const date = today();
            const existing = localRows().find(a => a.empId === officialId && a.date === date);
            if (existing?.checkIn) return { error: 'Already checked in at ' + existing.checkIn };
            const emp = getEmployee(officialId) || {};
            const shiftId = emp.shiftId || 'SH002';
            const shift = (db().get().shifts || []).find(s => s.id === shiftId);
            const checkIn = now();
            return this.createAttendance({
                ...existing,
                empId: officialId,
                date,
                checkIn,
                checkOut: existing?.checkOut || null,
                shiftId,
                status: calculateStatus(checkIn, shift),
                lateMinutes: calculateLateMinutes(checkIn, shift),
                source: 'employee-check-in'
            });
        },
        async markCheckOut(empId) {
            const officialId = db().resolveEmployeeId(empId);
            const date = today();
            const existing = localRows().find(a => a.empId === officialId && a.date === date);
            if (!existing?.checkIn) return { error: 'Please check in first' };
            if (existing?.checkOut) return { error: 'Already checked out at ' + existing.checkOut };
            const checkOut = now();
            return this.updateAttendance(officialId, date, {
                checkOut,
                workingHours: db().calcWorkingHours(existing.checkIn, checkOut),
                source: 'employee-check-out'
            });
        },
        async markAttendanceLive(empId, type) {
            return type === 'out' ? this.markCheckOut(empId) : this.markCheckIn(empId);
        },
        async syncAttendanceFromSupabase(filters = {}) {
            const rows = await fetchAttendance(filters);
            notifyAttendanceSync(rows);
            return rows;
        }
    };

    global.attendanceService = { ...(global.attendanceService || {}), ...attendanceService };

    if (global.addEventListener) {
        global.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (!supabaseReady()) return;
                attendanceService.syncAttendanceFromSupabase().catch(err => {
                    console.warn('Initial Supabase attendance sync fell back to local DB:', err.message || err);
                    recordFallback(err.message || String(err));
                });
            }, 100);
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
