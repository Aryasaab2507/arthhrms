// Tenant-scoped lifecycle tasks, notifications, timeline, and role landing guidance.
// This layer orchestrates existing DB, pending-action, notification, and setup services.
(function attachLifecycleExperienceService(global) {
    'use strict';

    var FLAG = 'USE_LIFECYCLE_TASKS';
    var TENANT_ROLES = Object.freeze(['super_admin', 'admin', 'hr', 'hr_head', 'manager', 'employee', 'director']);
    var ROLE_LABELS = Object.freeze({
        super_admin: 'Company Owner',
        admin: 'Administrator',
        hr: 'HR',
        hr_head: 'HR Head',
        manager: 'Manager',
        employee: 'Employee',
        director: 'Director'
    });
    var STYLE_ID = 'arth-lifecycle-experience-styles';

    function normalizeRole(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function token(value) {
        return String(value || '').trim().replace(/[^a-zA-Z0-9_.:@-]+/g, '-').slice(0, 180);
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function freeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeChild(key) { freeze(value[key]); });
        return Object.freeze(value);
    }

    function output(ok, code, message, data) {
        return freeze(Object.assign({ ok: !!ok, success: !!ok, code: code, message: message }, data || {}));
    }

    function enabled() {
        return !!global.supabaseClientService?.isEnabled?.(FLAG);
    }

    function actorFrom(context) {
        return context?.actor || global.authService?.getCurrentUser?.() || {};
    }

    function requireTenantActor(context) {
        var actor = actorFrom(context);
        var role = normalizeRole(actor.role);
        var tenantId = String(actor.tenantId || actor.tenantSlug || '').trim();
        var organizationId = String(actor.organizationId || actor.companyId || tenantId).trim();
        if (
            !actor.id ||
            actor.source !== 'supabase' ||
            actor.roleTrusted !== true ||
            TENANT_ROLES.indexOf(role) === -1 ||
            !tenantId ||
            !organizationId
        ) {
            throw new Error('A trusted tenant-scoped session is required for lifecycle tasks.');
        }
        var requestedTenant = String(context?.tenantId || context?.tenantSlug || tenantId).trim();
        if (requestedTenant !== tenantId) {
            throw new Error('Lifecycle task access is outside the trusted tenant scope.');
        }
        return {
            actor: actor,
            role: role,
            tenantId: tenantId,
            organizationId: organizationId,
            empId: String(actor.empId || '').trim()
        };
    }

    function data() {
        return global.DB?.get?.() || {};
    }

    function save(next) {
        if (!global.DB?.save) throw new Error('Authenticated lifecycle persistence is unavailable.');
        global.DB.save(next);
    }

    async function flush() {
        if (global.supabasePersistenceService?.flush) {
            await global.supabasePersistenceService.flush();
        } else if (global.DB?.whenPersistenceIdle) {
            await global.DB.whenPersistenceIdle();
        }
    }

    function currentEmployee(state, access) {
        var employees = Array.isArray(state.employees) ? state.employees : [];
        var email = String(access.actor.email || '').trim().toLowerCase();
        return employees.find(function findEmployee(row) {
            return (
                (access.empId && String(row.id || row.empId || '') === access.empId) ||
                (access.actor.authUserId && String(row.authUserId || '') === String(access.actor.authUserId)) ||
                (email && String(row.email || row.workEmail || '').trim().toLowerCase() === email)
            );
        }) || null;
    }

    function activeUsersForRole(state, roles) {
        var allowed = new Set(roles.map(normalizeRole));
        return (Array.isArray(state.users) ? state.users : []).filter(function filterUser(row) {
            return allowed.has(normalizeRole(row.role)) && !['disabled', 'suspended', 'archived'].includes(String(row.status || '').toLowerCase());
        });
    }

    function activeEmployeesForRole(state, roles) {
        var allowed = new Set(roles.map(normalizeRole));
        return (Array.isArray(state.employees) ? state.employees : []).filter(function filterEmployee(row) {
            var role = normalizeRole(row.role || row.systemRole || row.portalRole);
            var status = String(row.employmentStatus || row.status || 'active').toLowerCase();
            return allowed.has(role) && !['inactive', 'terminated', 'archived'].includes(status);
        });
    }

    function configured(state, keys) {
        return keys.some(function someKey(key) {
            var value = state[key];
            if (Array.isArray(value)) return value.length > 0;
            return !!(value && typeof value === 'object' && Object.keys(value).length);
        });
    }

    function makeTask(key, label, description, route, complete, priority) {
        return {
            key: key,
            label: label,
            description: description,
            route: route,
            complete: !!complete,
            priority: priority || 'MEDIUM'
        };
    }

    function setupTasks(state) {
        var home = global.CompanySetupOrchestrationService?.getSetupHome?.();
        if (home?.ok && Array.isArray(home.tasks)) {
            return home.tasks.slice(0, 8).map(function mapSetupTask(row) {
                return makeTask(
                    'setup-' + row.key,
                    row.label,
                    row.completed ? 'Configuration confirmed.' : 'Continue the guided company setup.',
                    row.route || 'organization-import-center.html',
                    row.completed,
                    row.required ? 'HIGH' : 'MEDIUM'
                );
            });
        }
        return [
            makeTask('organization-structure', 'Build organization structure', 'Add departments, business units, branches, designations, and reporting relationships.', 'organization-import-center.html', configured(state, ['departments']) && configured(state, ['designations']), 'HIGH'),
            makeTask('policies', 'Configure company operations', 'Complete working configuration, attendance, leave, payroll, identity, and notifications.', 'organization-import-center.html', configured(state, ['attendancePolicyDefinitions']) && configured(state, ['leavePolicyDefinitions']) && configured(state, ['payrollConfigurations']), 'HIGH')
        ];
    }

    function buildRoleTasks(state, access) {
        var employee = currentEmployee(state, access);
        var employees = Array.isArray(state.employees) ? state.employees : [];
        var invites = Array.isArray(state.authInvites) ? state.authInvites : [];
        var managerIds = new Set(activeEmployeesForRole(state, ['manager']).map(function mapManager(row) { return String(row.id || row.empId || ''); }));
        employees.forEach(function collectManagers(row) {
            if (row.managerId) managerIds.add(String(row.managerId));
        });

        if (access.role === 'super_admin') {
            var ownerTasks = setupTasks(state);
            ownerTasks.push(
                makeTask('invite-hr', 'Invite HR administrators', 'Create the operating team that will complete workforce setup.', 'super-admin.html#invitation-center', activeUsersForRole(state, ['hr', 'hr_head', 'admin']).length > 0 || invites.some(function hasHrInvite(row) { return ['hr', 'hr_head', 'admin'].includes(normalizeRole(row.role)) && !['cancelled', 'expired'].includes(String(row.status || '').toLowerCase()); }), 'HIGH'),
                makeTask('import-employees', 'Import employees', 'Validate workforce data before creating employee accounts.', 'employee-migration-center.html', employees.length > 0, 'HIGH'),
                makeTask('review-readiness', 'Review go-live readiness', 'Resolve blocking issues before pilot activation.', 'go-live-readiness-center.html', configured(state, ['goLiveValidationRuns', 'goLiveReadinessRuns']), 'CRITICAL')
            );
            return ownerTasks;
        }

        if (access.role === 'hr' || access.role === 'hr_head') {
            return [
                makeTask('import-employees', 'Import employees', 'Load and validate the initial workforce roster.', 'employee-migration-center.html', employees.length > 0, 'HIGH'),
                makeTask('invite-managers', 'Invite managers', 'Activate managers after reporting relationships are mapped.', 'super-admin.html#invitation-center', managerIds.size > 0 && invites.some(function hasManagerInvite(row) { return normalizeRole(row.role) === 'manager' && !['cancelled', 'expired'].includes(String(row.status || '').toLowerCase()); }), 'HIGH'),
                makeTask('attendance-policy', 'Configure attendance', 'Publish attendance rules before daily operations begin.', 'attendance-policy-center.html', configured(state, ['attendancePolicyDefinitions']), 'HIGH'),
                makeTask('leave-policy', 'Configure leave', 'Publish employee eligibility and approval rules.', 'leave-policy-center.html', configured(state, ['leavePolicyDefinitions']), 'HIGH')
            ];
        }

        if (access.role === 'admin') {
            return [
                makeTask('organization-settings', 'Verify organization settings', 'Confirm company and working-calendar configuration.', 'admin.html', !!String(state.companySettings?.companyName || '').trim(), 'HIGH'),
                makeTask('organization-structure', 'Verify departments and designations', 'Resolve missing organization references.', 'organization-structure-import.html', configured(state, ['departments']) && configured(state, ['designations']), 'HIGH'),
                makeTask('document-readiness', 'Review onboarding documents', 'Complete outstanding employee document checks.', 'admin.html#docverify', (state.documentVerifications || []).length > 0 || employees.length === 0, 'MEDIUM')
            ];
        }

        if (access.role === 'manager') {
            var team = employees.filter(function teamMember(row) { return String(row.managerId || '') === access.empId; });
            var pending = global.PendingActionService?.getPendingActions?.({ role: 'manager', empId: access.empId }) || [];
            var approvals = pending.filter(function approval(row) { return /leave|expense|approval/i.test(String(row.module || row.sourceType || '')); });
            var reviews = pending.filter(function review(row) { return /performance|deliverable|review/i.test(String(row.module || row.sourceType || '')); });
            return [
                makeTask('team-setup', 'Verify your team', 'Confirm reporting employees and team availability.', 'manager.html#team', team.length > 0, 'HIGH'),
                makeTask('pending-approvals', 'Complete pending approvals', 'Review leave, attendance, and expense decisions.', 'manager.html#leave', approvals.length === 0, approvals.length ? 'CRITICAL' : 'MEDIUM'),
                makeTask('review-tasks', 'Complete team reviews', 'Close performance and deliverable reviews.', 'manager.html#performance', reviews.length === 0, reviews.length ? 'HIGH' : 'MEDIUM')
            ];
        }

        if (access.role === 'employee') {
            var employeeId = String(employee?.id || access.empId || '');
            var profileComplete = !!employee && !!String(employee.phone || employee.mobile || '').trim() && !!String(employee.address || employee.residentialAddress || '').trim();
            var documents = (state.documents || []).filter(function employeeDocument(row) { return String(row.empId || row.employeeId || '') === employeeId; });
            var bankComplete = !!employee && !!String(employee.bankAccount || employee.bankAccountNumber || employee.accountNumber || '').trim();
            return [
                makeTask('complete-profile', 'Complete your profile', 'Add current contact and residential information.', 'employee-portal.html#profile', profileComplete, 'HIGH'),
                makeTask('upload-documents', 'Upload required documents', 'Provide identity, education, and joining documents.', 'employee-portal.html#documents', documents.length > 0, 'HIGH'),
                makeTask('bank-details', 'Add bank details', 'Complete salary payment information securely.', 'employee-portal.html#profile', bankComplete, 'HIGH')
            ];
        }

        return [
            makeTask('organization-review', 'Review organization readiness', 'Monitor risks, approvals, and workforce readiness.', 'director.html', false, 'MEDIUM')
        ];
    }

    function taskId(access, task) {
        return token(['LIFECYCLE', access.tenantId, access.role, access.empId || access.actor.id, task.key].join(':'));
    }

    function timelineId(access, task, eventType) {
        return token(['LTE', access.tenantId, access.role, access.empId || access.actor.id, task.key, eventType].join(':'));
    }

    function timelineEvent(access, task, eventType, now) {
        return {
            id: timelineId(access, task, eventType),
            eventId: timelineId(access, task, eventType),
            tenantId: access.tenantId,
            organizationId: access.organizationId,
            eventType: eventType,
            module: 'Lifecycle Tasks',
            subjectType: 'ROLE_TASK',
            subjectId: taskId(access, task),
            taskKey: task.key,
            taskLabel: task.label,
            role: access.role,
            empId: access.empId,
            actorId: access.actor.id,
            actorRole: access.role,
            occurredAt: now,
            createdAt: now,
            immutable: true
        };
    }

    function toStoredTask(access, task, existing, now) {
        var resolved = task.complete;
        return {
            id: taskId(access, task),
            sourceType: 'lifecycleTask',
            sourceId: task.key,
            module: 'Lifecycle',
            title: task.label,
            description: task.description,
            priority: task.priority,
            assigneeRole: access.role.toUpperCase(),
            assigneeEmpId: access.empId,
            dueDate: existing?.dueDate || '',
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            actionLink: task.route,
            status: resolved ? 'Resolved' : 'Open',
            resolvedAt: resolved ? (existing?.resolvedAt || now) : '',
            tenantId: access.tenantId,
            organizationId: access.organizationId,
            metadata: {
                lifecycleTask: true,
                role: access.role,
                completionSource: 'derived',
                completed: resolved
            }
        };
    }

    function sameTask(left, right) {
        var fields = ['title', 'description', 'priority', 'assigneeRole', 'assigneeEmpId', 'actionLink', 'status', 'tenantId', 'organizationId'];
        return fields.every(function sameField(field) { return String(left?.[field] || '') === String(right?.[field] || ''); });
    }

    function addNotification(task, access) {
        if (!global.notificationService?.pushNotification) return;
        try {
            global.notificationService.pushNotification(
                access.empId ? '' : access.role.toUpperCase(),
                access.empId,
                task.label,
                task.description,
                'Lifecycle'
            );
        } catch (_error) {}
    }

    async function synchronize(context) {
        if (!enabled()) return output(false, 'LIFECYCLE_TASKS_DISABLED', 'Lifecycle tasks are disabled.');
        var access = requireTenantActor(context);
        if (access.role === 'super_admin' && global.CompanySetupOrchestrationService?.isEnabled?.()) {
            await global.CompanySetupOrchestrationService.loadWorkspace({ actor: access.actor });
        }

        var state = data();
        state.pendingActions = Array.isArray(state.pendingActions) ? state.pendingActions.slice() : [];
        state.lifecycleTimelineEvents = Array.isArray(state.lifecycleTimelineEvents) ? state.lifecycleTimelineEvents.slice() : [];
        var roleTasks = buildRoleTasks(state, access);
        var existingById = new Map(state.pendingActions.map(function indexTask(row) { return [String(row.id || ''), row]; }));
        var now = new Date().toISOString();
        var createdOpenTasks = [];
        var changed = false;

        roleTasks.forEach(function upsertTask(task) {
            var id = taskId(access, task);
            var existing = existingById.get(id);
            var next = toStoredTask(access, task, existing, now);
            if (!existing) {
                state.pendingActions.push(next);
                existingById.set(id, next);
                changed = true;
                if (next.status === 'Open') createdOpenTasks.push(task);
                state.lifecycleTimelineEvents.push(timelineEvent(access, task, next.status === 'Resolved' ? 'LifecycleTaskCompleted' : 'LifecycleTaskCreated', now));
                return;
            }
            if (!sameTask(existing, next)) {
                var previousStatus = existing.status;
                Object.assign(existing, next);
                changed = true;
                if (previousStatus !== next.status) {
                    state.lifecycleTimelineEvents.push(timelineEvent(
                        access,
                        task,
                        next.status === 'Resolved' ? 'LifecycleTaskCompleted' : 'LifecycleTaskReopened',
                        now
                    ));
                }
            }
        });

        var firstExperienceId = token(['LTE', access.tenantId, access.role, access.empId || access.actor.id, 'FirstLoginExperiencePresented'].join(':'));
        if (!state.lifecycleTimelineEvents.some(function hasFirstExperience(row) { return String(row.id || row.eventId || '') === firstExperienceId; })) {
            state.lifecycleTimelineEvents.push({
                id: firstExperienceId,
                eventId: firstExperienceId,
                tenantId: access.tenantId,
                organizationId: access.organizationId,
                eventType: 'FirstLoginExperiencePresented',
                module: 'Lifecycle Tasks',
                subjectType: 'AUTHENTICATED_USER',
                subjectId: access.actor.id,
                role: access.role,
                empId: access.empId,
                actorId: access.actor.id,
                actorRole: access.role,
                occurredAt: now,
                createdAt: now,
                immutable: true
            });
            changed = true;
        }

        if (changed) {
            state.lifecycleTimelineEvents = state.lifecycleTimelineEvents
                .sort(function newestFirst(a, b) { return String(b.occurredAt || b.createdAt || '').localeCompare(String(a.occurredAt || a.createdAt || '')); })
                .slice(0, 1000);
            save(state);
            createdOpenTasks.forEach(function notifyTask(task) { addNotification(task, access); });
            await flush();
        }

        return dashboard({ actor: access.actor, tenantId: access.tenantId });
    }

    function dashboard(context) {
        if (!enabled()) return output(false, 'LIFECYCLE_TASKS_DISABLED', 'Lifecycle tasks are disabled.');
        var access = requireTenantActor(context);
        var state = data();
        var ownerId = access.empId || access.actor.id;
        var tasks = (state.pendingActions || []).filter(function scopedTask(row) {
            return (
                row.sourceType === 'lifecycleTask' &&
                String(row.tenantId || '') === access.tenantId &&
                normalizeRole(row.assigneeRole) === access.role &&
                String(row.assigneeEmpId || access.actor.id) === ownerId
            );
        }).sort(function priorityOrder(a, b) {
            var weight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
            return (weight[b.priority] || 0) - (weight[a.priority] || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        });
        var completed = tasks.filter(function completedTask(row) { return row.status === 'Resolved'; }).length;
        var timeline = (state.lifecycleTimelineEvents || []).filter(function scopedEvent(row) {
            return (
                String(row.tenantId || '') === access.tenantId &&
                normalizeRole(row.role || row.actorRole) === access.role &&
                String(row.empId || row.actorId || '') === ownerId
            );
        }).slice(0, 8);
        return output(true, 'LIFECYCLE_DASHBOARD_READY', 'Lifecycle dashboard is ready.', {
            role: access.role,
            roleLabel: ROLE_LABELS[access.role] || access.role,
            tasks: clone(tasks),
            timeline: clone(timeline),
            completed: completed,
            pending: tasks.length - completed,
            total: tasks.length,
            progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0
        });
    }

    function ensureStyles() {
        if (!global.document || global.document.getElementById(STYLE_ID)) return;
        var style = global.document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.arth-lifecycle{border:1px solid var(--border,#dfe5ee);border-left:4px solid var(--p,#1d4ed8);border-radius:8px;background:var(--card,#fff);padding:16px;margin:0 0 16px}',
            '.arth-lifecycle__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
            '.arth-lifecycle__title{font-size:.92rem;font-weight:800;color:var(--text,#172033)}',
            '.arth-lifecycle__copy{font-size:.75rem;color:var(--muted,#64748b);margin-top:3px}',
            '.arth-lifecycle__score{font-size:.78rem;font-weight:800;color:var(--p,#1d4ed8)}',
            '.arth-lifecycle__track{height:5px;background:var(--bg,#eef2f7);border-radius:3px;overflow:hidden;margin:12px 0 13px}',
            '.arth-lifecycle__bar{height:100%;background:var(--p,#1d4ed8);transition:width .2s ease}',
            '.arth-lifecycle__tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}',
            '.arth-lifecycle__task{min-width:0;border:1px solid var(--border,#dfe5ee);border-radius:6px;padding:10px;background:var(--bg,#f8fafc);display:flex;flex-direction:column;gap:6px}',
            '.arth-lifecycle__task-title{font-size:.78rem;font-weight:800;color:var(--text,#172033)}',
            '.arth-lifecycle__task-copy{font-size:.7rem;line-height:1.45;color:var(--muted,#64748b);flex:1}',
            '.arth-lifecycle__task-meta{display:flex;align-items:center;justify-content:space-between;gap:8px}',
            '.arth-lifecycle__status{font-size:.64rem;font-weight:800;text-transform:uppercase;color:var(--muted,#64748b)}',
            '.arth-lifecycle__action{border:0;background:transparent;color:var(--p,#1d4ed8);font:inherit;font-size:.7rem;font-weight:800;cursor:pointer;padding:3px 0}',
            '.arth-lifecycle__action:focus-visible{outline:2px solid var(--p,#1d4ed8);outline-offset:2px}',
            '.arth-lifecycle__empty{font-size:.76rem;color:var(--muted,#64748b)}',
            '.arth-lifecycle__loading{height:72px;border-radius:8px;background:linear-gradient(90deg,var(--bg,#eef2f7),var(--card,#fff),var(--bg,#eef2f7));background-size:200% 100%;animation:arthLifecyclePulse 1.1s linear infinite;margin-bottom:16px}',
            '@keyframes arthLifecyclePulse{to{background-position:-200% 0}}'
        ].join('');
        global.document.head.appendChild(style);
    }

    function appendText(parent, tag, className, value) {
        var node = global.document.createElement(tag);
        if (className) node.className = className;
        node.textContent = String(value || '');
        parent.appendChild(node);
        return node;
    }

    function renderDashboard(container, report) {
        container.replaceChildren();
        var panel = global.document.createElement('section');
        panel.className = 'arth-lifecycle';
        panel.setAttribute('aria-label', report.roleLabel + ' next actions');

        var head = global.document.createElement('div');
        head.className = 'arth-lifecycle__head';
        var titleBlock = global.document.createElement('div');
        appendText(titleBlock, 'div', 'arth-lifecycle__title', report.roleLabel + ' next actions');
        appendText(titleBlock, 'div', 'arth-lifecycle__copy', report.pending ? 'Continue the highest-priority items to keep your workspace ready.' : 'Your current onboarding and operational tasks are complete.');
        head.appendChild(titleBlock);
        appendText(head, 'div', 'arth-lifecycle__score', report.progress + '% complete');
        panel.appendChild(head);

        var track = global.document.createElement('div');
        track.className = 'arth-lifecycle__track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(report.progress));
        var bar = global.document.createElement('div');
        bar.className = 'arth-lifecycle__bar';
        bar.style.width = report.progress + '%';
        track.appendChild(bar);
        panel.appendChild(track);

        var tasks = global.document.createElement('div');
        tasks.className = 'arth-lifecycle__tasks';
        var visible = report.tasks.filter(function openTask(row) { return row.status !== 'Resolved'; }).slice(0, 4);
        if (!visible.length) {
            appendText(tasks, 'div', 'arth-lifecycle__empty', 'No pending lifecycle tasks.');
        } else {
            visible.forEach(function renderTask(row) {
                var item = global.document.createElement('div');
                item.className = 'arth-lifecycle__task';
                appendText(item, 'div', 'arth-lifecycle__task-title', row.title);
                appendText(item, 'div', 'arth-lifecycle__task-copy', row.description);
                var meta = global.document.createElement('div');
                meta.className = 'arth-lifecycle__task-meta';
                appendText(meta, 'span', 'arth-lifecycle__status', row.priority + ' priority');
                if (row.actionLink) {
                    var button = appendText(meta, 'button', 'arth-lifecycle__action', 'Continue');
                    button.type = 'button';
                    button.addEventListener('click', function openTask() {
                        global.location.assign(row.actionLink);
                    });
                }
                item.appendChild(meta);
                tasks.appendChild(item);
            });
        }
        panel.appendChild(tasks);
        container.appendChild(panel);
    }

    async function mountDashboard(target, context) {
        if (!enabled() || !global.document) return output(false, 'LIFECYCLE_MOUNT_SKIPPED', 'Lifecycle dashboard mount is unavailable.');
        var container = typeof target === 'string' ? global.document.getElementById(target) : target;
        if (!container) return output(false, 'LIFECYCLE_MOUNT_MISSING', 'Lifecycle dashboard mount was not found.');
        ensureStyles();
        var loading = global.document.createElement('div');
        loading.className = 'arth-lifecycle__loading';
        loading.setAttribute('aria-label', 'Loading next actions');
        container.replaceChildren(loading);
        try {
            var report = await synchronize(context || {});
            if (!report.ok) throw new Error(report.message);
            renderDashboard(container, report);
            return report;
        } catch (error) {
            container.replaceChildren();
            appendText(container, 'div', 'arth-lifecycle__empty', error?.message || 'Next actions could not be loaded.');
            return output(false, 'LIFECYCLE_MOUNT_FAILED', error?.message || 'Lifecycle dashboard could not be loaded.');
        }
    }

    var service = Object.freeze({
        FLAG: FLAG,
        isEnabled: enabled,
        synchronize: synchronize,
        dashboard: dashboard,
        mountDashboard: mountDashboard,
        buildRoleTasks: function publicBuildRoleTasks(context) {
            var access = requireTenantActor(context);
            return freeze(clone(buildRoleTasks(data(), access)));
        }
    });

    global.LifecycleExperienceService = service;
    global.lifecycleExperienceService = service;
}(typeof window !== 'undefined' ? window : globalThis));
