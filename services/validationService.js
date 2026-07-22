// Validation service adapter.
// Centralizes duplicate and relationship checks before future API/Supabase migration.
(function (global) {
    function db() { return global.DB; }
    function registry() { return global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService || null; }

    const validationService = {
        registry: registry(),
        detectDuplicateEmployees() { return db().detectDuplicateEmployees(); },
        detectDuplicateAttendanceDay(empId, date) { return db().detectDuplicateAttendanceDay(empId, date); },
        detectDuplicatePayrollMonth(empId, month) { return db().detectDuplicatePayrollMonth(empId, month); },
        validateManagerId(managerId, employeeId) { return db().validateManagerId(managerId, null, employeeId); },
        getRelationshipAudit() { return db().getRelationshipAudit(); },
        normalizeDataArchitecture() {
            const data = db().get();
            const changed = db().normalizeDataArchitecture(data);
            if (changed) db().save(data);
            return changed;
        },
        registerValidationRule(input, context) {
            return registry()?.registerValidationRule?.(input, context) || { success: false, code: 'VALIDATION_REGISTRY_UNAVAILABLE' };
        },
        executeValidationRule(ruleId, value, options, context) {
            return registry()?.executeValidationRule?.(ruleId, value, options, context) || { success: false, code: 'VALIDATION_REGISTRY_UNAVAILABLE' };
        },
        validateEntity(entityType, payload, configuration, context) {
            return registry()?.validateEntity?.(entityType, payload, configuration, context) || { success: false, code: 'VALIDATION_REGISTRY_UNAVAILABLE' };
        },
        validateWorkflow(payload, configuration, context) {
            return registry()?.validateWorkflow?.(payload, configuration, context) || { success: false, code: 'VALIDATION_REGISTRY_UNAVAILABLE' };
        }
    };

    global.validationService = global.validationService || validationService;
})(window);
