// Identity service adapter.
// Keeps official ID generation in one boundary while db.js remains the storage compatibility layer.
(function (global) {
    function db() { return global.DB; }

    const identityService = {
        generateEmployeeId() { return db().generateEmployeeId(); },
        generateRecordId(type) { return db().generateRecordId(type); },
        generateLeaveId() { return db().generateLeaveId(); },
        generateExpenseId() { return db().generateExpenseId(); },
        generatePayrollId() { return db().generatePayrollId(); },
        generateNotificationId() { return db().generateNotificationId(); },
        generateDeliverableId() { return db().generateDeliverableId(); },
        generateHelpdeskTicketId() { return db().generateHelpdeskTicketId(); },
        isOfficialEmployeeId(empId) { return db().isOfficialEmployeeId(empId); },
        isLegacyEmployeeId(empId) { return db().isLegacyEmployeeId(empId); },
        resolveEmployeeId(empId) { return db().resolveEmployeeId(empId); }
    };

    global.identityService = global.identityService || identityService;
})(window);
