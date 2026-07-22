// Notification service adapter.
// Use this boundary for future notification API or realtime channel integration.
(function (global) {
    function db() { return global.DB; }

    const notificationService = {
        pushNotification(toRole, toEmpId, title, message, module) {
            return db().NotificationService?.push
                ? db().NotificationService.push(toRole, toEmpId, title, message, module)
                : db().pushNotification(toRole, toEmpId, title, message, module);
        },
        getNotificationsByRole(role) {
            return db().NotificationService?.byRole ? db().NotificationService.byRole(role) : db().getNotificationsByRole(role);
        },
        getNotificationsByEmployee(empId) {
            return db().NotificationService?.byEmployee ? db().NotificationService.byEmployee(empId) : db().getNotificationsByEmp(empId);
        },
        markNotificationRead(notifId, target) {
            return db().NotificationService?.markRead ? db().NotificationService.markRead(notifId, target) : db().markNotificationRead(notifId, target);
        },
        getUnreadNotificationCount(target) {
            return db().NotificationService?.unreadCount ? db().NotificationService.unreadCount(target) : db().getUnreadNotificationCount(target);
        },
        dispatchNotification(payload = {}) {
            if (global.workflowEngine?.dispatchNotification) return global.workflowEngine.dispatchNotification(payload);
            return this.pushNotification(payload.targetRole || payload.toRole || '', payload.targetEmpId || payload.toEmpId || '', payload.title || 'Notification', payload.message || payload.msg || '', payload.module || 'General');
        }
    };

    global.notificationService = { ...(global.notificationService || {}), ...notificationService };
})(typeof window !== 'undefined' ? window : globalThis);
