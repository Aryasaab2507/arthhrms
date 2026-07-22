// Utility service adapter.
// Keep cross-cutting helpers behind this boundary before backend/API migration.
(function (global) {
    function db() { return global.DB; }

    const utilityService = {
        today() { return db().UtilityService?.today ? db().UtilityService.today() : db().today(); },
        currentQuarter(date) { return db().UtilityService?.currentQuarter ? db().UtilityService.currentQuarter(date) : db().currentQuarter(date); },
        resolveEmployeeId(id) { return db().UtilityService?.resolveEmployeeId ? db().UtilityService.resolveEmployeeId(id) : db().resolveEmployeeId(id); },
        generateEmployeeId() { return db().UtilityService?.generateEmployeeId ? db().UtilityService.generateEmployeeId() : db().generateEmployeeId(); },
        generateRecordId(type) { return db().UtilityService?.generateRecordId ? db().UtilityService.generateRecordId(type) : db().generateRecordId(type); },
        isOfficialEmployeeId(id) { return db().UtilityService?.isOfficialEmployeeId ? db().UtilityService.isOfficialEmployeeId(id) : db().isOfficialEmployeeId(id); },
        isLegacyEmployeeId(id) { return db().UtilityService?.isLegacyEmployeeId ? db().UtilityService.isLegacyEmployeeId(id) : db().isLegacyEmployeeId(id); },
        normalizeDepartmentName(value) { return db().UtilityService?.normalizeDepartmentName ? db().UtilityService.normalizeDepartmentName(value) : db().normalizeDepartmentName(value); },
        normalizeDesignationName(value) { return db().UtilityService?.normalizeDesignationName ? db().UtilityService.normalizeDesignationName(value) : db().normalizeDesignationName(value); },
        normalizeEmail(value) { return db().UtilityService?.normalizeEmail ? db().UtilityService.normalizeEmail(value) : db().normalizeEmail(value); },
        normalizePhone(value) { return db().UtilityService?.normalizePhone ? db().UtilityService.normalizePhone(value) : db().normalizePhone(value); },
        validateManagerId(managerId, employeeId) { return db().UtilityService?.validateManagerId ? db().UtilityService.validateManagerId(managerId, employeeId) : db().validateManagerId(managerId, null, employeeId); },
        detectDuplicateEmployees() { return db().UtilityService?.detectDuplicateEmployees ? db().UtilityService.detectDuplicateEmployees() : db().detectDuplicateEmployees(); },
        detectDuplicateAttendanceDay(empId, date) { return db().UtilityService?.detectDuplicateAttendanceDay ? db().UtilityService.detectDuplicateAttendanceDay(empId, date) : db().detectDuplicateAttendanceDay(empId, date); },
        detectDuplicatePayrollMonth(empId, month) { return db().UtilityService?.detectDuplicatePayrollMonth ? db().UtilityService.detectDuplicatePayrollMonth(empId, month) : db().detectDuplicatePayrollMonth(empId, month); },
        getRelationshipAudit() { return db().UtilityService?.getRelationshipAudit ? db().UtilityService.getRelationshipAudit() : db().getRelationshipAudit(); },
        normalizeDataArchitecture() { return db().UtilityService?.normalizeDataArchitecture ? db().UtilityService.normalizeDataArchitecture() : false; }
    };

    global.utilityService = global.utilityService || utilityService;
})(window);
