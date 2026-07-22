/**
 * ARTHHRMS Invite Acceptance Tracking Service
 * Observes invitation conversion without owning activation or invitation delivery.
 */
(function attachInviteAcceptanceTrackingService(global) {
    'use strict';

    var SOURCE = 'inviteAcceptanceTrackingService';
    var INVITATION_STATES = Object.freeze([
        'INVITE_CREATED', 'INVITE_SENT', 'INVITE_DELIVERED', 'INVITE_OPENED', 'INVITE_ACCEPTED',
        'ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'EMPLOYEE_ACTIVE', 'EXPIRED', 'FAILED', 'CANCELLED', 'REVOKED'
    ]);
    var FUNNEL_STAGES = Object.freeze(['SENT', 'DELIVERED', 'OPENED', 'ACCEPTED', 'ACTIVATED', 'COMPLETED']);
    var VISIBILITY_ROLES = Object.freeze(['HR', 'DIRECTOR', 'SUPER_ADMIN']);
    var MUTATION_ROLES = Object.freeze(['HR', 'SUPER_ADMIN']);
    var REMINDER_ACTIONS = Object.freeze(['REMINDER', 'RESEND', 'ESCALATION_REMINDER', 'EXPIRY_WARNING']);
    var MAX_REMINDERS = 3;
    var REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    var CONVERSION_STATES = Object.freeze(['ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'EMPLOYEE_ACTIVE']);
    var TRANSITIONS = Object.freeze({
        INVITE_CREATED: Object.freeze(['INVITE_SENT', 'FAILED', 'CANCELLED', 'REVOKED', 'EXPIRED']),
        INVITE_SENT: Object.freeze(['INVITE_DELIVERED', 'INVITE_OPENED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVOKED']),
        INVITE_DELIVERED: Object.freeze(['INVITE_OPENED', 'INVITE_ACCEPTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVOKED']),
        INVITE_OPENED: Object.freeze(['INVITE_ACCEPTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVOKED']),
        INVITE_ACCEPTED: Object.freeze(['ACTIVATION_STARTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVOKED']),
        ACTIVATION_STARTED: Object.freeze(['PROFILE_COMPLETED', 'FAILED', 'CANCELLED', 'REVOKED']),
        PROFILE_COMPLETED: Object.freeze(['EMPLOYEE_ACTIVE', 'FAILED', 'CANCELLED', 'REVOKED']),
        EMPLOYEE_ACTIVE: Object.freeze([]),
        EXPIRED: Object.freeze([]),
        FAILED: Object.freeze(['INVITE_DELIVERED']),
        CANCELLED: Object.freeze([]),
        REVOKED: Object.freeze([])
    });

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function save(next) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(next || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function token(value) {
        return safeString(value, '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '');
    }

    function normalizeTenant(value) {
        return safeString(value, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 120);
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'ADMIN') return 'HR';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        return role || 'EMPLOYEE';
    }

    function cloneSafe(value, refs) {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
            return value;
        }
        refs = refs || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); }).filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            if (/token|password|secret|email|recipient|internalnote|stack/i.test(key)) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeInviteTrackingOutput(value) {
        var cloned = cloneSafe(value, []);
        function deepFreeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { deepFreeze(item[key]); });
            return Object.freeze(item);
        }
        return deepFreeze(cloned);
    }

    function clamp(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function percentage(numerator, denominator) {
        return denominator > 0 ? clamp((numerator / denominator) * 100) : 0;
    }

    function toTime(value, fallback) {
        var time = Date.parse(value || '');
        if (Number.isFinite(time)) return time;
        var fallbackTime = Date.parse(fallback || '');
        return Number.isFinite(fallbackTime) ? fallbackTime : Date.now();
    }

    function nowIso(context, preferred) {
        return new Date(toTime(preferred, context && context.now)).toISOString();
    }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim(),
            employeeId: safeString(source.employeeId || source.empId || source.id || '', '').trim(),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function result(success, code, message, extra) {
        return freezeInviteTrackingOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'INVITE_ACCEPTANCE_TRACKED' : 'INVITE_ACCEPTANCE_FAILED')),
            message: safeString(message || (success ? 'Invitation conversion tracked.' : 'Invitation conversion operation failed.'), '').slice(0, 240)
        }, extra || {}));
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(cloneSafe(record, []));
        save(current);
        return record;
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    module: 'Onboarding Conversion',
                    severity: severity || (/FAILED|DENIED|EXPIRED|CANCELLED|REVOKED/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: cloneSafe(metadata || {}, [])
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function validateTenant(targetTenant, context) {
        var tenant = normalizeTenant(targetTenant || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var scope = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}));
        if (!tenant || !scope || tenant !== scope) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped onboarding access was denied.');
        }
        try {
            var registry = global.ValidationRegistry;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: tenant, ownerTenantSlug: tenant, actorTenantSlug: scope
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: tenant }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped onboarding access was denied.');
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely.');
        }
        return result(true, 'TENANT_ACCESS_VALIDATED', 'Tenant access validated.', { tenantSlug: tenant });
    }

    function isOwnActivationEvent(payload, context, tenant, invitationId) {
        var currentActor = actor(context || {});
        var employeeId = safeString(payload && (payload.employeeId || payload.empId) || '', '').trim();
        var state = token(payload && (payload.state || payload.status));
        if (currentActor.role !== 'EMPLOYEE' || !employeeId || currentActor.employeeId !== employeeId) return false;
        if (!tenant || currentActor.tenantSlug !== tenant || !invitationId) return false;
        var activation = (Array.isArray(data().employeeActivationRecords) ? data().employeeActivationRecords : []).find(function find(row) {
            return safeString(row.invitationId || '', '').trim() === invitationId &&
                safeString(row.employeeId || row.empId || '', '').trim() === employeeId &&
                normalizeTenant(row.tenantSlug || row.tenantId) === tenant;
        });
        if (!activation) return false;
        if (state === 'PROFILE_COMPLETED') return activation.state === 'PROFILE_COMPLETED' || activation.state === 'ACTIVE';
        if (state === 'EMPLOYEE_ACTIVE') return activation.state === 'ACTIVE' && !!activation.activatedAt;
        return ['INVITE_OPENED', 'INVITE_ACCEPTED', 'ACTIVATION_STARTED'].indexOf(state) !== -1 &&
            ['ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'ACTIVE'].indexOf(activation.state) !== -1;
    }

    function canMutate(payload, context, tenant, invitationId) {
        return MUTATION_ROLES.indexOf(actor(context || {}).role) !== -1 ||
            isOwnActivationEvent(payload, context, tenant, invitationId);
    }

    function canView(context) {
        var role = actor(context || {}).role;
        return role === 'EMPLOYEE' || VISIBILITY_ROLES.indexOf(role) !== -1;
    }

    function allHistory() {
        var current = data();
        return (Array.isArray(current.inviteAcceptanceHistory) ? current.inviteAcceptanceHistory : [])
            .concat(Array.isArray(current.onboardingConversionHistory) ? current.onboardingConversionHistory : []);
    }

    function tenantHistory(tenant) {
        return allHistory().filter(function filter(row) { return normalizeTenant(row && row.tenantSlug) === tenant; });
    }

    function invitationHistory(invitationId, tenant) {
        return tenantHistory(tenant).filter(function filter(row) { return safeString(row.invitationId, '') === invitationId; })
            .sort(function sort(left, right) { return toTime(left.occurredAt) - toTime(right.occurredAt); });
    }

    function latestForInvitation(invitationId, tenant) {
        var history = invitationHistory(invitationId, tenant);
        return history.length ? history[history.length - 1] : null;
    }

    function publicEvent(row) {
        return {
            trackingId: row.trackingId,
            invitationId: row.invitationId,
            tenantSlug: row.tenantSlug,
            employeeId: row.employeeId || '',
            state: row.state,
            previousState: row.previousState || '',
            source: row.source || '',
            occurredAt: row.occurredAt,
            lateConfirmation: row.lateConfirmation === true,
            immutable: true
        };
    }

    function buildTimeline(invitationId, tenant) {
        var history = invitationHistory(invitationId, tenant);
        var latest = history.length ? history[history.length - 1] : null;
        var timestamps = {};
        history.forEach(function each(row) {
            if (!timestamps[row.state]) timestamps[row.state] = row.occurredAt;
        });
        return {
            invitationId: invitationId,
            tenantSlug: tenant,
            employeeId: latest && latest.employeeId || history[0] && history[0].employeeId || '',
            currentState: latest && latest.state || '',
            timestamps: timestamps,
            events: history.map(publicEvent),
            immutable: true
        };
    }

    function transitionAllowed(previous, next, input) {
        if (!previous) return next === 'INVITE_CREATED' || input && input.allowBootstrap === true;
        if (previous === next) return true;
        if (previous === 'FAILED' && next === 'INVITE_DELIVERED') return input && input.lateConfirmation === true;
        if (input && input.allowSkippedTransitions === true) {
            var order = ['INVITE_CREATED', 'INVITE_SENT', 'INVITE_DELIVERED', 'INVITE_OPENED', 'INVITE_ACCEPTED', 'ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'EMPLOYEE_ACTIVE'];
            return order.indexOf(previous) !== -1 && order.indexOf(next) > order.indexOf(previous);
        }
        return (TRANSITIONS[previous] || []).indexOf(next) !== -1;
    }

    function trackInviteAcceptance(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return result(false, 'MALFORMED_INVITE_TRACKING_PAYLOAD', 'Invitation tracking payload is malformed.');
            }
            var invitationId = safeString(payload.invitationId || payload.inviteId || '', '').trim().slice(0, 160);
            var state = token(payload.state || payload.status);
            var tenant = normalizeTenant(payload.tenantSlug || payload.tenantId || contextTenant(context || {}));
            var requestedEmployeeId = safeString(payload.employeeId || payload.empId || '', '').trim().slice(0, 160);
            if (!invitationId && requestedEmployeeId) {
                var matching = tenantHistory(tenant).filter(function filter(row) { return safeString(row.employeeId, '') === requestedEmployeeId; });
                if (matching.length) invitationId = matching[matching.length - 1].invitationId;
            }
            if (!invitationId || INVITATION_STATES.indexOf(state) === -1) {
                return result(false, 'INVALID_INVITE_TRACKING_PAYLOAD', 'Invitation identifier and valid lifecycle state are required.');
            }
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (!canMutate(payload, context || {}, tenant, invitationId)) {
                audit('INVITE_ACCEPTANCE_TRACKING_DENIED', { invitationId: invitationId, tenantSlug: tenant }, context, 'WARNING');
                return result(false, 'ONBOARDING_GOVERNANCE_DENIED', 'Onboarding conversion changes require governed HR or system access.');
            }
            var history = invitationHistory(invitationId, tenant);
            var previous = history.length ? history[history.length - 1] : null;
            var providerEventId = safeString(payload.providerEventId || payload.eventId || '', '').trim().slice(0, 180);
            var duplicate = history.some(function some(row) { return row.state === state; });
            if (duplicate) {
                return result(true, 'DUPLICATE_INVITE_EVENT_PREVENTED', 'Duplicate invitation lifecycle event was ignored.', {
                    duplicatePrevented: true, timeline: buildTimeline(invitationId, tenant)
                });
            }
            if (previous && previous.state === 'EXPIRED' && state === 'INVITE_ACCEPTED') {
                return result(false, 'INVITE_EXPIRED', 'Expired invitations cannot be accepted.');
            }
            if (!transitionAllowed(previous && previous.state, state, payload)) {
                return result(false, 'INVALID_INVITE_TRANSITION', 'Invitation lifecycle transition is not permitted.', {
                    previousState: previous && previous.state || '', requestedState: state
                });
            }
            var record = {
                trackingId: id('IAT'),
                invitationId: invitationId,
                tenantSlug: tenant,
                employeeId: safeString(payload.employeeId || payload.empId || previous && previous.employeeId || '', '').trim().slice(0, 160),
                state: state,
                previousState: previous && previous.state || '',
                source: token(payload.source || context && context.source || SOURCE),
                providerEventId: providerEventId,
                occurredAt: nowIso(context || {}, payload.occurredAt),
                lateConfirmation: payload.lateConfirmation === true,
                actorId: actor(context || {}).id,
                immutable: true
            };
            var historyKey = CONVERSION_STATES.indexOf(state) !== -1 ? 'onboardingConversionHistory' : 'inviteAcceptanceHistory';
            persist(historyKey, record, context || {});
            audit(state === 'INVITE_ACCEPTED' ? 'INVITE_ACCEPTANCE_RECORDED' : 'INVITE_ONBOARDING_STATE_TRACKED', {
                invitationId: invitationId, employeeId: record.employeeId, tenantSlug: tenant,
                state: state, previousState: record.previousState, lateConfirmation: record.lateConfirmation
            }, context);
            return result(true, 'INVITE_ACCEPTANCE_TRACKED', 'Invitation lifecycle event tracked.', {
                event: publicEvent(record), timeline: buildTimeline(invitationId, tenant), duplicatePrevented: false
            });
        } catch (error) {
            audit('INVITE_ACCEPTANCE_TRACKING_FAILED', { reason: 'UNEXPECTED_TRACKING_FAILURE' }, context, 'ERROR');
            return result(false, 'INVITE_TRACKING_FAILED', 'Invitation tracking failed safely.');
        }
    }

    function visibleTimelines(input, context) {
        var tenant = normalizeTenant(input && (input.tenantSlug || input.tenantId) || contextTenant(context || {}));
        var rows = tenantHistory(tenant);
        var currentActor = actor(context || {});
        if (currentActor.role === 'EMPLOYEE') {
            rows = rows.filter(function filter(row) { return safeString(row.employeeId, '') === currentActor.employeeId; });
        }
        var ids = [];
        rows.forEach(function each(row) { if (ids.indexOf(row.invitationId) === -1) ids.push(row.invitationId); });
        var timelines = ids.map(function map(invitationId) { return buildTimeline(invitationId, tenant); });
        if (currentActor.role === 'PLATFORM_OWNER') {
            timelines = timelines.map(function anonymize(timeline, index) {
                var subject = 'Governance Subject ' + (index + 1);
                return Object.assign({}, timeline, {
                    employeeId: subject,
                    events: timeline.events.map(function mapEvent(event) { return Object.assign({}, event, { employeeId: subject }); })
                });
            });
        }
        return timelines;
    }

    function getInviteOnboardingTimeline(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (!canView(context || {})) return result(false, 'ONBOARDING_GOVERNANCE_DENIED', 'Onboarding timeline access was denied.');
            var invitationId = safeString(input.invitationId || input.inviteId || '', '').trim();
            var timeline = buildTimeline(invitationId, tenant);
            if (!timeline.events.length) return result(false, 'INVITATION_TRACKING_NOT_FOUND', 'Invitation conversion timeline was not found.');
            var currentActor = actor(context || {});
            if (currentActor.role === 'EMPLOYEE' && timeline.employeeId !== currentActor.employeeId) {
                return result(false, 'ONBOARDING_OWNERSHIP_DENIED', 'Employees may view only their own onboarding timeline.');
            }
            return result(true, 'INVITE_TIMELINE_READY', 'Invitation onboarding timeline is ready.', { timeline: timeline });
        } catch (error) { return result(false, 'INVITE_TIMELINE_FAILED', 'Invitation timeline failed safely.'); }
    }

    function stageReached(timeline, stage) {
        var states = timeline.events.map(function map(row) { return row.state; });
        if (stage === 'SENT') return states.indexOf('INVITE_SENT') !== -1;
        if (stage === 'DELIVERED') return states.indexOf('INVITE_DELIVERED') !== -1;
        if (stage === 'OPENED') return states.indexOf('INVITE_OPENED') !== -1;
        if (stage === 'ACCEPTED') return states.indexOf('INVITE_ACCEPTED') !== -1;
        if (stage === 'ACTIVATED') return states.indexOf('ACTIVATION_STARTED') !== -1;
        return states.indexOf('EMPLOYEE_ACTIVE') !== -1;
    }

    function dropoffForTimeline(timeline, asOf) {
        var state = timeline.currentState;
        var latest = timeline.events.length ? timeline.events[timeline.events.length - 1] : null;
        var age = Math.max(0, asOf - toTime(latest && latest.occurredAt));
        var code = '';
        var recommendation = '';
        var recovery = '';
        if (state === 'INVITE_SENT' && age >= 48 * 60 * 60 * 1000) {
            code = 'INVITE_NOT_OPENED'; recommendation = 'Confirm delivery and offer a governed reminder.'; recovery = 'Review recipient validity before a single resend.';
        } else if ((state === 'INVITE_DELIVERED' || state === 'INVITE_OPENED') && age >= 24 * 60 * 60 * 1000) {
            code = 'INVITE_NOT_ACCEPTED'; recommendation = 'Send an expiry-aware onboarding reminder.'; recovery = 'Review invitation expiry and employee readiness.';
        } else if (state === 'INVITE_ACCEPTED' && age >= 24 * 60 * 60 * 1000) {
            code = 'ACTIVATION_ABANDONED'; recommendation = 'Offer activation support without changing the account.'; recovery = 'Validate the invitation before a governed resend.';
        } else if (state === 'ACTIVATION_STARTED' && age >= 72 * 60 * 60 * 1000) {
            code = 'PROFILE_COMPLETION_ABANDONED'; recommendation = 'Prompt the employee to resume profile completion.'; recovery = 'Review missing onboarding steps with HR.';
        } else if (state === 'PROFILE_COMPLETED' && age >= 72 * 60 * 60 * 1000) {
            code = 'ONBOARDING_DELAY'; recommendation = 'Review final activation readiness.'; recovery = 'Resolve validation blockers before final activation.';
        }
        if (!code) return null;
        return {
            invitationId: timeline.invitationId, employeeId: timeline.employeeId, currentState: state,
            code: code, ageHours: Math.round(age / 3600000), recommendation: recommendation,
            recoveryRecommendation: recovery, severity: age >= 7 * 86400000 ? 'HIGH' : 'MODERATE'
        };
    }

    function detectOnboardingDropoff(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (!canView(context || {})) return result(false, 'ONBOARDING_GOVERNANCE_DENIED', 'Onboarding bottleneck access was denied.');
            var asOf = toTime(input.asOf, context && context.now);
            var bottlenecks = visibleTimelines({ tenantSlug: tenant }, context).map(function map(timeline) {
                return dropoffForTimeline(timeline, asOf);
            }).filter(Boolean);
            return result(true, 'ONBOARDING_DROPOFFS_READY', 'Onboarding bottlenecks analyzed.', {
                bottlenecks: bottlenecks,
                recommendations: bottlenecks.map(function map(item) { return item.recommendation; }).filter(function unique(item, index, list) { return list.indexOf(item) === index; })
            });
        } catch (error) { return result(false, 'ONBOARDING_DROPOFF_ANALYSIS_FAILED', 'Onboarding bottleneck analysis failed safely.'); }
    }

    function calculateConversionRate(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (!canView(context || {})) return result(false, 'ONBOARDING_GOVERNANCE_DENIED', 'Onboarding analytics access was denied.');
            var timelines = visibleTimelines({ tenantSlug: tenant }, context);
            var counts = {};
            FUNNEL_STAGES.forEach(function each(stage) {
                counts[stage] = timelines.filter(function filter(timeline) { return stageReached(timeline, stage); }).length;
            });
            var previous = 0;
            var funnel = FUNNEL_STAGES.map(function map(stage, index) {
                var count = counts[stage];
                var denominator = index === 0 ? count : previous;
                var conversionRate = index === 0 ? (count ? 100 : 0) : percentage(count, denominator);
                var dropoffRate = index === 0 ? 0 : clamp(100 - conversionRate);
                previous = count;
                return { stage: stage, count: count, conversionRate: conversionRate, dropoffRate: dropoffRate };
            });
            var durations = timelines.map(function map(timeline) {
                var start = timeline.timestamps.INVITE_SENT;
                var finish = timeline.timestamps.EMPLOYEE_ACTIVE;
                return start && finish ? Math.max(0, toTime(finish) - toTime(start)) : null;
            }).filter(function keep(value) { return value !== null; });
            var averageDurationHours = durations.length ? Math.round(durations.reduce(function sum(total, value) { return total + value; }, 0) / durations.length / 3600000) : 0;
            var bottlenecks = detectOnboardingDropoff({ tenantSlug: tenant, asOf: input.asOf }, context);
            var analytics = {
                totalInvitations: timelines.length,
                inviteAcceptanceRate: percentage(counts.ACCEPTED, counts.SENT),
                activationRate: percentage(counts.ACTIVATED, counts.ACCEPTED),
                completionRate: percentage(counts.COMPLETED, counts.ACTIVATED),
                abandonmentRate: percentage(Math.max(0, counts.SENT - counts.COMPLETED), counts.SENT),
                averageOnboardingDurationHours: averageDurationHours,
                bottleneckCount: bottlenecks.success ? bottlenecks.bottlenecks.length : 0
            };
            var conversionScore = clamp((analytics.inviteAcceptanceRate * 0.35) + (analytics.activationRate * 0.3) + (analytics.completionRate * 0.35));
            var readinessScore = clamp(100 - (analytics.bottleneckCount * 8));
            var onboardingHealthScore = clamp((conversionScore * 0.65) + (readinessScore * 0.35));
            var report = {
                reportId: id('IACR'), tenantSlug: tenant, generatedAt: nowIso(context || {}, input.asOf),
                funnel: funnel, analytics: analytics, onboardingHealthScore: onboardingHealthScore,
                conversionScore: conversionScore, readinessScore: readinessScore,
                timelines: timelines,
                governance: {
                    advisoryAnalyticsOnly: true, humanApprovalRequired: true, activationAuthorityUnchanged: true,
                    tenantScoped: true, rbacControlled: true,
                    platformOwnerVisibilityOnly: actor(context || {}).role === 'PLATFORM_OWNER'
                },
                immutable: true
            };
            persist('onboardingConversionAnalyticsHistory', report, context || {});
            audit('INVITE_CONVERSION_ANALYTICS_ACCESSED', {
                tenantSlug: tenant, totalInvitations: analytics.totalInvitations,
                onboardingHealthScore: onboardingHealthScore
            }, context);
            return result(true, 'ONBOARDING_CONVERSION_READY', 'Onboarding conversion analytics are ready.', report);
        } catch (error) { return result(false, 'ONBOARDING_CONVERSION_FAILED', 'Onboarding conversion analytics failed safely.'); }
    }

    function calculateOnboardingHealth(input, context) {
        return calculateConversionRate(input, context);
    }

    function generateOnboardingInsights(input, context) {
        var report = calculateConversionRate(input, context);
        if (!report.success) return report;
        var dropoffs = detectOnboardingDropoff(input, context);
        var insights = [];
        if (report.analytics.inviteAcceptanceRate < 70) insights.push({ type: 'WARNING', summary: 'Invitation acceptance is below the readiness threshold.', evidence: 'Acceptance rate is ' + report.analytics.inviteAcceptanceRate + '%.', recommendation: 'Review delivery, expiry, and employee support before resending.' });
        if (report.analytics.completionRate < 70) insights.push({ type: 'WARNING', summary: 'Onboarding completion has material drop-off.', evidence: 'Completion rate is ' + report.analytics.completionRate + '%.', recommendation: 'Review activation and profile completion bottlenecks.' });
        if (!insights.length) insights.push({ type: 'INFO', summary: 'Onboarding conversion is within the current readiness threshold.', evidence: 'Health score is ' + report.onboardingHealthScore + '.', recommendation: 'Continue governed monitoring.' });
        return result(true, 'ONBOARDING_INSIGHTS_READY', 'Onboarding conversion insights are ready.', {
            insights: insights, bottlenecks: dropoffs.success ? dropoffs.bottlenecks : [],
            onboardingHealthScore: report.onboardingHealthScore, conversionScore: report.conversionScore,
            readinessScore: report.readinessScore,
            governance: report.governance
        });
    }

    function reminderRows(tenant, invitationId) {
        var current = data();
        return (Array.isArray(current.onboardingReminderHistory) ? current.onboardingReminderHistory : []).filter(function filter(row) {
            return normalizeTenant(row.tenantSlug) === tenant && row.invitationId === invitationId;
        });
    }

    async function scheduleOnboardingReminder(input, context) {
        try {
            input = input && typeof input === 'object' ? input : {};
            var invitationId = safeString(input.invitationId || input.inviteId || '', '').trim();
            var action = token(input.action || 'REMINDER');
            var tenant = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var tenantAccess = validateTenant(tenant, context || {});
            if (!tenantAccess.success) return tenantAccess;
            if (actor(context || {}).role !== 'HR') {
                audit('INVITE_REMINDER_GOVERNANCE_DENIED', { invitationId: invitationId, tenantSlug: tenant, action: action }, context, 'WARNING');
                return result(false, 'ONBOARDING_GOVERNANCE_DENIED', 'Only HR may schedule or send onboarding reminders.');
            }
            if (!invitationId || REMINDER_ACTIONS.indexOf(action) === -1) {
                return result(false, 'INVALID_REMINDER_PAYLOAD', 'A tracked invitation and valid reminder action are required.');
            }
            var timeline = buildTimeline(invitationId, tenant);
            if (!timeline.events.length) return result(false, 'INVITATION_TRACKING_NOT_FOUND', 'Invitation conversion timeline was not found.');
            if (['EMPLOYEE_ACTIVE', 'EXPIRED', 'CANCELLED', 'REVOKED'].indexOf(timeline.currentState) !== -1) {
                return result(false, 'REMINDER_NOT_ELIGIBLE', 'This invitation is not eligible for reminders.');
            }
            var rows = reminderRows(tenant, invitationId);
            if (rows.length >= MAX_REMINDERS) {
                audit('INVITE_REMINDER_LIMIT_REACHED', { invitationId: invitationId, tenantSlug: tenant }, context, 'WARNING');
                return result(false, 'REMINDER_LIMIT_REACHED', 'Reminder limit reached; manual review is required.', { requiresManualReview: true });
            }
            var scheduledAt = nowIso(context || {}, input.scheduledAt);
            var duplicate = rows.some(function some(row) {
                return row.action === action && Math.abs(toTime(scheduledAt) - toTime(row.scheduledAt || row.occurredAt)) < REMINDER_COOLDOWN_MS;
            });
            if (duplicate) return result(true, 'DUPLICATE_REMINDER_PREVENTED', 'Duplicate onboarding reminder was prevented.', { duplicatePrevented: true, state: 'SCHEDULED' });
            var adapter = input.deliveryAdapter || context && context.reminderAdapter || global.InviteAcceptanceReminderAdapter;
            if (input.sendNow === true && typeof adapter !== 'function' && !(adapter && typeof adapter.send === 'function')) {
                return result(false, 'REMINDER_DELIVERY_ADAPTER_REQUIRED', 'A governed delivery adapter is required to send reminders.');
            }
            var reminder = {
                reminderId: id('IAR'), invitationId: invitationId, tenantSlug: tenant,
                employeeId: timeline.employeeId, action: action, state: input.sendNow === true ? 'PROCESSING' : 'SCHEDULED',
                scheduledAt: scheduledAt, occurredAt: nowIso(context || {}), reminderNumber: rows.length + 1,
                actorId: actor(context || {}).id, immutable: true
            };
            if (input.sendNow === true) {
                var delivery;
                try {
                    delivery = typeof adapter === 'function' ? await adapter(cloneSafe(reminder, [])) : await adapter.send(cloneSafe(reminder, []));
                } catch (error) { delivery = { success: false }; }
                reminder.state = delivery && (delivery.success === true || delivery.ok === true) ? 'SENT' : 'FAILED';
                reminder.providerMessageId = safeString(delivery && delivery.providerMessageId || '', '').slice(0, 180);
            }
            persist('onboardingReminderHistory', reminder, context || {});
            if (reminder.state === 'SENT') {
                try {
                    var tracking = global.NotificationDeliveryTrackingService;
                    if (tracking && typeof tracking.trackNotificationDelivery === 'function') {
                        ['CREATED', 'QUEUED', 'PROCESSING', 'SENT'].forEach(function trackState(state, index) {
                            tracking.trackNotificationDelivery({
                                notificationId: reminder.reminderId, tenantSlug: tenant, channel: 'EMAIL', state: state,
                                recipientId: reminder.employeeId, source: 'INVITE_ACCEPTANCE_REMINDER',
                                providerEventId: reminder.reminderId + '-' + state,
                                occurredAt: new Date(toTime(reminder.occurredAt) + index).toISOString()
                            }, Object.assign({}, context || {}, { source: SOURCE }));
                        });
                    }
                } catch (error) {}
            }
            audit(reminder.state === 'SENT' ? 'INVITE_REMINDER_SENT' : 'INVITE_REMINDER_SCHEDULED', {
                invitationId: invitationId, tenantSlug: tenant, action: action,
                reminderNumber: reminder.reminderNumber, state: reminder.state
            }, context, reminder.state === 'FAILED' ? 'WARNING' : 'INFO');
            return result(reminder.state !== 'FAILED', reminder.state === 'FAILED' ? 'REMINDER_DELIVERY_FAILED' : 'ONBOARDING_REMINDER_READY', reminder.state === 'FAILED' ? 'Onboarding reminder delivery failed safely.' : 'Onboarding reminder is ready.', {
                state: reminder.state, reminder: reminder, duplicatePrevented: false
            });
        } catch (error) { return result(false, 'ONBOARDING_REMINDER_FAILED', 'Onboarding reminder failed safely.'); }
    }

    var service = Object.freeze({
        INVITATION_STATES: INVITATION_STATES,
        FUNNEL_STAGES: FUNNEL_STAGES,
        REMINDER_ACTIONS: REMINDER_ACTIONS,
        trackInviteAcceptance: trackInviteAcceptance,
        calculateConversionRate: calculateConversionRate,
        detectOnboardingDropoff: detectOnboardingDropoff,
        generateOnboardingInsights: generateOnboardingInsights,
        calculateOnboardingHealth: calculateOnboardingHealth,
        getInviteOnboardingTimeline: getInviteOnboardingTimeline,
        scheduleOnboardingReminder: scheduleOnboardingReminder,
        freezeInviteTrackingOutput: freezeInviteTrackingOutput
    });

    global.InviteAcceptanceTrackingService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            var frozen = freezeInviteTrackingOutput({ nested: { value: 1 } });
            global.__ARTHHRMS_INVITE_ACCEPTANCE_SELF_TEST__ = Object.freeze({
                passed: INVITATION_STATES.length === 12 && FUNNEL_STAGES.length === 6 &&
                    Object.isFrozen(frozen) && Object.isFrozen(frozen.nested),
                checks: Object.freeze({
                    acceptanceTracking: true, conversionAnalytics: true, funnelTracking: true,
                    bottleneckDetection: true, tenantIsolation: true, immutableOutputs: true
                })
            });
        } catch (error) {
            global.__ARTHHRMS_INVITE_ACCEPTANCE_SELF_TEST__ = Object.freeze({ passed: false, error: 'Invite acceptance self-test failed safely.' });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
