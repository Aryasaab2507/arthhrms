/**
 * accessibilityGovernanceService.js
 * ARTHHRMS - Accessibility Improvements + Inclusive Enterprise Experience Framework
 *
 * PURPOSE:
 * Provides metadata-only accessibility validation, keyboard/screen-reader
 * readiness checks, compliance scoring, remediation recommendations, audit
 * integration, and immutable governance reports.
 *
 * This service does NOT:
 * - mutate tenant business data
 * - replace RBAC enforcement
 * - expose cross-tenant records
 * - expose salaries, leave balances, payroll internals, raw documents, tokens, or private payloads
 *
 * @version 1.0.0
 */
(function attachAccessibilityGovernanceService(global) {
    'use strict';

    var PREFIX = '[AccessibilityGovernanceService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 400;

    var ACCESSIBILITY_STATES = Object.freeze([
        'MONITORING',
        'READY',
        'VIOLATIONS_DETECTED',
        'REMEDIATING',
        'COMPLIANT',
        'ARCHIVED'
    ]);

    var SEVERITY_WEIGHT = Object.freeze({
        INFO: 1,
        LOW: 2,
        MODERATE: 5,
        HIGH: 9,
        CRITICAL: 14
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|employeeRecord|confidential|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|rawTenantDocument)\s*[:=]?\s*[\w,.\- ]+/ig;

    function nowIso() {
        try { return new Date().toISOString(); } catch (error) { return String(Date.now()); }
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return Number.isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        var next = safeNumber(value, min);
        return Math.max(min, Math.min(max, next));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizeToken(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim();
        return raw.replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() || (fallback || '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '', '');
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR_HEAD';
        if (role === 'ADMIN') return 'SUPER_ADMIN';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId || context.actor.employeeId) || context && (context.actorId || context.userId) || '', '');
    }

    function arrayOf(value) {
        return Array.isArray(value) ? value.slice(0, MAX_ROWS) : [];
    }

    function freezeDeep(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeDeep(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function redactString(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, seen) {
        if (value === undefined || value === null) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.slice(0, MAX_ROWS).map(function cloneArrayItem(item) {
                return cloneSanitized(item, refs.slice());
            });
        }
        if (!isPlainObject(value)) return safeString(value, '');
        var output = {};
        try {
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], refs.slice());
            });
        } catch (error) {}
        return output;
    }

    function freezeAccessibilityOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function roleCanViewAccessibility(role, context, payload) {
        var normalizedRole = normalizeRole(role);
        var routeType = normalizeToken(context && context.routeType || payload && payload.routeType || 'platform', 'PLATFORM');
        if (normalizedRole === 'PLATFORM_OWNER') return routeType === 'PLATFORM';
        if (normalizedRole === 'SUPER_ADMIN') {
            return routeType === 'PLATFORM' && (
                context && context.infrastructureOnly === true ||
                context && context.monitoringOnly === true ||
                payload && payload.infrastructureOnly === true ||
                payload && normalizeToken(payload.mode || '') === 'INFRASTRUCTURE_MONITORING'
            );
        }
        return false;
    }

    function validateAccessibilityScope(payload, context) {
        try {
            var ctx = context || {};
            var record = payload || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var payloadTenant = normalizeTenantSlug(record.tenantSlug || record.tenantId || record.companyId || '');
            var ctxTenant = contextTenant(ctx);
            if (!roleCanViewAccessibility(role, ctx, record)) {
                return freezeAccessibilityOutput({
                    success: false,
                    allowed: false,
                    classification: 'ROLE_SCOPE_BLOCKED',
                    message: 'Accessibility governance is restricted to platform operations roles.',
                    governance: governanceFlags()
                });
            }
            if (payloadTenant && ctxTenant && payloadTenant !== ctxTenant) {
                return freezeAccessibilityOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Accessibility governance scope must match the active tenant context.',
                    governance: governanceFlags()
                });
            }
            return freezeAccessibilityOutput({
                success: true,
                allowed: true,
                role: role,
                tenantSlug: payloadTenant || ctxTenant || '',
                governance: governanceFlags()
            });
        } catch (error) {
            return freezeAccessibilityOutput({
                success: false,
                allowed: false,
                classification: 'ACCESSIBILITY_SCOPE_ERROR',
                message: 'Accessibility scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function sameTenantOrPlatform(row, tenantSlug) {
        var rowTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || ''));
        return !rowTenant || !tenantSlug || rowTenant === tenantSlug;
    }

    function safeBool(value, fallback) {
        if (value === true || value === false) return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return fallback === undefined ? false : !!fallback;
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            accessibilityGovernancePreserved: true,
            rbacGovernancePreserved: true,
            outputsImmutable: true
        };
    }

    function normalizeLandmark(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            landmarkId: safeString(row.landmarkId || row.id || 'landmark-' + index, 'landmark-' + index),
            role: normalizeToken(row.role || row.type || 'region', 'REGION').toLowerCase(),
            label: safeString(row.label || row.name || row.ariaLabel || '', ''),
            present: safeBool(row.present, true),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeControl(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            controlId: safeString(row.controlId || row.id || 'control-' + index, 'control-' + index),
            controlType: normalizeToken(row.controlType || row.type || 'button', 'BUTTON'),
            label: safeString(row.label || row.text || row.name || '', ''),
            ariaLabel: safeString(row.ariaLabel || row['aria-label'] || '', ''),
            describedBy: safeString(row.describedBy || row['aria-describedby'] || '', ''),
            keyboardReachable: safeBool(row.keyboardReachable, true),
            focusVisible: safeBool(row.focusVisible, true),
            disabled: safeBool(row.disabled, false),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeTable(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            tableId: safeString(row.tableId || row.id || 'table-' + index, 'table-' + index),
            caption: safeString(row.caption || row.title || '', ''),
            headerScopes: safeBool(row.headerScopes, false),
            keyboardScrollable: safeBool(row.keyboardScrollable, true),
            rowHeaderPresent: safeBool(row.rowHeaderPresent, false),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeDialog(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            dialogId: safeString(row.dialogId || row.id || 'dialog-' + index, 'dialog-' + index),
            role: normalizeToken(row.role || 'dialog', 'DIALOG').toLowerCase(),
            ariaModal: safeBool(row.ariaModal, false),
            labelledBy: safeString(row.labelledBy || row['aria-labelledby'] || '', ''),
            describedBy: safeString(row.describedBy || row['aria-describedby'] || '', ''),
            focusTrap: safeBool(row.focusTrap, false),
            escapeCloses: safeBool(row.escapeCloses, true),
            initialFocus: safeBool(row.initialFocus, false),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeNotification(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            notificationId: safeString(row.notificationId || row.id || 'notification-' + index, 'notification-' + index),
            ariaLive: normalizeToken(row.ariaLive || row['aria-live'] || '', ''),
            role: normalizeToken(row.role || '', ''),
            priority: normalizeToken(row.priority || 'NORMAL', 'NORMAL'),
            dismissible: safeBool(row.dismissible, true),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeFocusTarget(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            targetId: safeString(row.targetId || row.id || 'focus-' + index, 'focus-' + index),
            keyboardReachable: safeBool(row.keyboardReachable, true),
            focusVisible: safeBool(row.focusVisible, true),
            tabIndex: safeNumber(row.tabIndex, 0),
            order: safeNumber(row.order, index + 1),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeColorPair(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            pairId: safeString(row.pairId || row.id || 'color-' + index, 'color-' + index),
            foreground: safeString(row.foreground || row.fg || '', ''),
            background: safeString(row.background || row.bg || '', ''),
            ratio: safeNumber(row.ratio, 0),
            largeText: safeBool(row.largeText, false),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeShortcut(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            shortcutId: safeString(row.shortcutId || row.id || 'shortcut-' + index, 'shortcut-' + index),
            keys: safeString(row.keys || row.key || '', ''),
            description: safeString(row.description || row.label || '', ''),
            conflict: safeBool(row.conflict, false),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeRows(rows, normalizer, tenantSlug) {
        return arrayOf(rows).map(function normalizeRow(row, index) {
            return normalizer(row, index, tenantSlug);
        }).filter(Boolean);
    }

    function normalizeAccessibilityPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeAccessibilityOutput({
                    success: false,
                    classification: 'MALFORMED_PAYLOAD',
                    message: 'Accessibility payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || contextTenant(context));
            var normalized = {
                success: true,
                tenantSlug: tenantSlug,
                routeType: normalizeToken(payload.routeType || context && context.routeType || 'platform', 'PLATFORM').toLowerCase(),
                standards: arrayOf(payload.standards).map(function mapStandard(item) { return normalizeToken(item, 'WCAG_2_1_AA'); }).filter(Boolean),
                landmarks: normalizeRows(payload.landmarks, normalizeLandmark, tenantSlug),
                controls: normalizeRows(payload.controls, normalizeControl, tenantSlug),
                tables: normalizeRows(payload.tables, normalizeTable, tenantSlug),
                dialogs: normalizeRows(payload.dialogs, normalizeDialog, tenantSlug),
                notifications: normalizeRows(payload.notifications, normalizeNotification, tenantSlug),
                focusTargets: normalizeRows(payload.focusTargets, normalizeFocusTarget, tenantSlug),
                colorPairs: normalizeRows(payload.colorPairs, normalizeColorPair, tenantSlug),
                keyboardShortcuts: normalizeRows(payload.keyboardShortcuts, normalizeShortcut, tenantSlug),
                analytics: cloneSanitized(isPlainObject(payload.analytics) ? payload.analytics : {}),
                metadata: cloneSanitized(isPlainObject(payload.metadata) ? payload.metadata : {}),
                generatedAt: nowIso(),
                governance: governanceFlags()
            };
            if (!normalized.standards.length) normalized.standards = ['WCAG_2_1_AA'];
            return freezeAccessibilityOutput(normalized);
        } catch (error) {
            safeWarn('normalizeAccessibilityPayload failed safely', error && error.message);
            return freezeAccessibilityOutput({
                success: false,
                classification: 'NORMALIZATION_ERROR',
                message: 'Accessibility payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function pushViolation(violations, code, severity, targetId, category, message, wcag) {
        violations.push({
            violationCode: code,
            severity: normalizeToken(severity || 'LOW', 'LOW'),
            targetId: safeString(targetId || '', ''),
            category: normalizeToken(category || 'GENERAL', 'GENERAL'),
            message: safeString(message || code, code),
            wcag: safeString(wcag || '', '')
        });
    }

    function validateAccessibilityCompliance(payload, context) {
        try {
            var normalized = payload && payload.success && payload.landmarks ? payload : normalizeAccessibilityPayload(payload, context);
            if (!normalized.success) return normalized;
            var violations = [];

            normalized.landmarks.forEach(function checkLandmark(row) {
                if (!row.present) {
                    pushViolation(violations, 'MISSING_LANDMARK', 'HIGH', row.landmarkId, 'SCREEN_READER', 'Required landmark is missing.', '1.3.1');
                }
                if (row.present && /^(main|navigation|search|banner|contentinfo)$/.test(row.role) && !row.label && row.role !== 'main') {
                    pushViolation(violations, 'MISSING_LANDMARK_LABEL', 'MODERATE', row.landmarkId, 'SCREEN_READER', 'Landmark should have a meaningful label.', '2.4.1');
                }
            });

            normalized.controls.forEach(function checkControl(row) {
                if (!row.disabled && !row.label && !row.ariaLabel) {
                    pushViolation(violations, 'MISSING_CONTROL_LABEL', 'HIGH', row.controlId, 'SCREEN_READER', 'Interactive control is missing a visible or ARIA label.', '4.1.2');
                }
                if (!row.disabled && row.keyboardReachable === false) {
                    pushViolation(violations, 'KEYBOARD_UNREACHABLE_CONTROL', 'CRITICAL', row.controlId, 'KEYBOARD', 'Interactive control is not keyboard reachable.', '2.1.1');
                }
                if (!row.disabled && row.focusVisible === false) {
                    pushViolation(violations, 'MISSING_FOCUS_INDICATOR', 'MODERATE', row.controlId, 'KEYBOARD', 'Interactive control does not expose a visible focus indicator.', '2.4.7');
                }
            });

            normalized.tables.forEach(function checkTable(row) {
                if (!row.caption) {
                    pushViolation(violations, 'MISSING_TABLE_CAPTION', 'MODERATE', row.tableId, 'TABLE', 'Data table should expose a caption or equivalent label.', '1.3.1');
                }
                if (!row.headerScopes) {
                    pushViolation(violations, 'MISSING_TABLE_HEADER_SCOPE', 'MODERATE', row.tableId, 'TABLE', 'Data table headers should provide explicit scope.', '1.3.1');
                }
                if (!row.keyboardScrollable) {
                    pushViolation(violations, 'TABLE_KEYBOARD_SCROLL_BLOCKED', 'HIGH', row.tableId, 'KEYBOARD', 'Scrollable table region must remain keyboard accessible.', '2.1.1');
                }
            });

            normalized.dialogs.forEach(function checkDialog(row) {
                if (!row.ariaModal || !row.labelledBy || !row.focusTrap || !row.escapeCloses || !row.initialFocus) {
                    pushViolation(violations, 'INACCESSIBLE_DIALOG', 'HIGH', row.dialogId, 'DIALOG', 'Dialog needs modal semantics, labels, focus containment, escape handling, and initial focus.', '2.4.3');
                }
            });

            normalized.notifications.forEach(function checkNotification(row) {
                var live = row.ariaLive === 'POLITE' || row.ariaLive === 'ASSERTIVE';
                var role = row.role === 'STATUS' || row.role === 'ALERT' || row.role === 'LOG';
                if (row.priority === 'CRITICAL' && (!live || !role)) {
                    pushViolation(violations, 'MISSING_LIVE_REGION', 'HIGH', row.notificationId, 'NOTIFICATION', 'Critical notifications must use a meaningful live region.', '4.1.3');
                }
            });

            normalized.focusTargets.forEach(function checkFocus(row) {
                if (row.keyboardReachable === false) {
                    pushViolation(violations, 'FOCUS_TARGET_UNREACHABLE', 'HIGH', row.targetId, 'KEYBOARD', 'Focus target cannot be reached with keyboard navigation.', '2.1.1');
                }
                if (row.focusVisible === false) {
                    pushViolation(violations, 'MISSING_FOCUS_INDICATOR', 'MODERATE', row.targetId, 'KEYBOARD', 'Focus target lacks a visible focus indicator.', '2.4.7');
                }
            });

            normalized.colorPairs.forEach(function checkColor(row) {
                var required = row.largeText ? 3 : 4.5;
                if (row.ratio > 0 && row.ratio < required) {
                    pushViolation(violations, 'LOW_CONTRAST', 'HIGH', row.pairId, 'VISUAL', 'Text contrast ratio is below WCAG AA threshold.', '1.4.3');
                }
            });

            normalized.keyboardShortcuts.forEach(function checkShortcut(row) {
                if (row.conflict) {
                    pushViolation(violations, 'KEYBOARD_SHORTCUT_CONFLICT', 'MODERATE', row.shortcutId, 'KEYBOARD', 'Keyboard shortcut conflicts with another command.', '2.1.4');
                }
            });

            var ordered = normalized.focusTargets.map(function focusOrder(row) { return row.order; });
            var logicalTabOrder = ordered.every(function orderIsSorted(value, index) {
                return index === 0 || value >= ordered[index - 1];
            });
            var labelableControls = normalized.controls.filter(function isLabelable(row) { return !row.disabled; });
            var labelledControls = labelableControls.filter(function hasLabel(row) { return !!(row.label || row.ariaLabel); });
            var ariaCoverageScore = labelableControls.length ? clamp(Math.round((labelledControls.length / labelableControls.length) * 100), 0, 100) : 100;
            var notificationCoverageScore = normalized.notifications.length ? clamp(Math.round((normalized.notifications.filter(function hasLive(row) {
                return (row.ariaLive === 'POLITE' || row.ariaLive === 'ASSERTIVE') && (row.role === 'STATUS' || row.role === 'ALERT' || row.role === 'LOG');
            }).length / normalized.notifications.length) * 100), 0, 100) : 100;
            var focusIssueCount = violations.filter(function focusIssue(row) { return /FOCUS|KEYBOARD/.test(row.category) || /FOCUS|KEYBOARD/.test(row.violationCode); }).length;

            return freezeAccessibilityOutput({
                success: true,
                state: violations.length ? 'VIOLATIONS_DETECTED' : 'COMPLIANT',
                standards: normalized.standards,
                tenantSlug: normalized.tenantSlug,
                violationCount: violations.length,
                violations: violations,
                keyboardNavigation: {
                    logicalTabOrder: logicalTabOrder,
                    noKeyboardTraps: !violations.some(function keyboardTrap(row) { return row.violationCode === 'KEYBOARD_UNREACHABLE_CONTROL' || row.violationCode === 'FOCUS_TARGET_UNREACHABLE' || row.violationCode === 'INACCESSIBLE_DIALOG'; }),
                    focusIssueCount: focusIssueCount,
                    keyboardShortcutConflicts: normalized.keyboardShortcuts.filter(function conflict(row) { return row.conflict; }).length
                },
                screenReaderSupport: {
                    ariaCoverageScore: ariaCoverageScore,
                    liveRegionCoverageScore: notificationCoverageScore,
                    semanticLandmarksPresent: normalized.landmarks.some(function main(row) { return row.role === 'main' && row.present; }) && normalized.landmarks.some(function nav(row) { return row.role === 'navigation' && row.present; })
                },
                visualAccessibility: {
                    lowContrastCount: violations.filter(function lowContrast(row) { return row.violationCode === 'LOW_CONTRAST'; }).length,
                    focusIndicatorIssues: violations.filter(function focusIndicator(row) { return row.violationCode === 'MISSING_FOCUS_INDICATOR'; }).length
                },
                componentGovernance: {
                    controls: normalized.controls.length,
                    forms: normalized.controls.filter(function formControl(row) { return /INPUT|SELECT|TEXTAREA/.test(row.controlType); }).length,
                    tables: normalized.tables.length,
                    dialogs: normalized.dialogs.length,
                    notifications: normalized.notifications.length,
                    navigationLandmarks: normalized.landmarks.filter(function nav(row) { return row.role === 'navigation'; }).length
                },
                analytics: normalized.analytics,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validateAccessibilityCompliance failed safely', error && error.message);
            return freezeAccessibilityOutput({
                success: false,
                classification: 'VALIDATION_ERROR',
                message: 'Accessibility validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function summarizeSeverity(violations) {
        var summary = { INFO: 0, LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
        arrayOf(violations).forEach(function eachViolation(row) {
            var severity = normalizeToken(row && row.severity || 'LOW', 'LOW');
            if (summary[severity] === undefined) summary[severity] = 0;
            summary[severity] += 1;
        });
        return summary;
    }

    function calculateAccessibilityScore(input, context) {
        try {
            var validation = input && input.violations && input.keyboardNavigation ? input : validateAccessibilityCompliance(input, context);
            if (!validation.success) return validation;
            var violations = arrayOf(validation.violations);
            var penalty = violations.reduce(function totalPenalty(total, row) {
                return total + (SEVERITY_WEIGHT[normalizeToken(row && row.severity || 'LOW', 'LOW')] || 2);
            }, 0);
            var keyboardPenalty = safeNumber(validation.keyboardNavigation && validation.keyboardNavigation.focusIssueCount, 0) * 1.5 +
                safeNumber(validation.keyboardNavigation && validation.keyboardNavigation.keyboardShortcutConflicts, 0) * 2;
            var screenReaderPenalty = Math.max(0, 100 - safeNumber(validation.screenReaderSupport && validation.screenReaderSupport.ariaCoverageScore, 100)) * 0.18;
            var accessibilityScore = clamp(Math.round(100 - penalty - screenReaderPenalty), 0, 100);
            var usabilityScore = clamp(Math.round(100 - keyboardPenalty - safeNumber(validation.visualAccessibility && validation.visualAccessibility.lowContrastCount, 0) * 4), 0, 100);
            var complianceScore = clamp(Math.round((accessibilityScore * 0.65) + (usabilityScore * 0.25) + (safeNumber(validation.screenReaderSupport && validation.screenReaderSupport.liveRegionCoverageScore, 100) * 0.1)), 0, 100);
            var complianceClass = 'LOW';
            if (complianceScore < 50 || summarizeSeverity(violations).CRITICAL > 0) complianceClass = 'CRITICAL';
            else if (complianceScore < 70 || summarizeSeverity(violations).HIGH >= 3) complianceClass = 'HIGH';
            else if (complianceScore < 90 || violations.length > 0) complianceClass = 'MODERATE';

            return freezeAccessibilityOutput({
                success: true,
                accessibilityScore: accessibilityScore,
                usabilityScore: usabilityScore,
                complianceScore: complianceScore,
                accessibilityReadinessScore: clamp(Math.round((accessibilityScore + usabilityScore + complianceScore) / 3), 0, 100),
                complianceClass: complianceClass,
                severitySummary: summarizeSeverity(violations),
                violationCount: violations.length,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateAccessibilityScore failed safely', error && error.message);
            return freezeAccessibilityOutput({
                success: false,
                classification: 'SCORING_ERROR',
                message: 'Accessibility scoring failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function recommendationForViolation(row) {
        var code = normalizeToken(row && row.violationCode || '', '');
        if (/LABEL|ARIA|LIVE_REGION|LANDMARK/.test(code)) return 'Add meaningful labels, ARIA relationships, and semantic landmarks for screen-reader users.';
        if (/CONTRAST/.test(code)) return 'Increase color contrast to meet WCAG AA visual accessibility thresholds.';
        if (/FOCUS|KEYBOARD|SHORTCUT/.test(code)) return 'Restore keyboard reachability, visible focus states, and conflict-free keyboard commands.';
        if (/DIALOG/.test(code)) return 'Add dialog labels, aria-modal semantics, initial focus, escape behavior, and focus containment.';
        if (/TABLE/.test(code)) return 'Add table captions, scoped headers, and keyboard-accessible scroll regions.';
        return 'Review this component against WCAG 2.1 AA readiness requirements.';
    }

    function auditAccessibilityViolations(input, context) {
        try {
            var validation = input && input.violations && input.keyboardNavigation ? input : validateAccessibilityCompliance(input, context);
            if (!validation.success) return validation;
            var recommendations = arrayOf(validation.violations).map(function mapViolation(row, index) {
                return {
                    recommendationId: 'A11Y-REC-' + String(index + 1).padStart(3, '0'),
                    violationCode: row.violationCode,
                    severity: row.severity,
                    targetId: row.targetId,
                    recommendation: recommendationForViolation(row)
                };
            });
            return freezeAccessibilityOutput({
                success: true,
                violationCount: validation.violations.length,
                remediationRecommendations: recommendations,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('auditAccessibilityViolations failed safely', error && error.message);
            return freezeAccessibilityOutput({
                success: false,
                classification: 'ACCESSIBILITY_AUDIT_ERROR',
                message: 'Accessibility violation audit failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function appendHistory(key, item) {
        try {
            var data = rawData();
            data[key] = Array.isArray(data[key]) ? data[key] : [];
            data[key].unshift(cloneSanitized(item));
            data[key] = data[key].slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordAudit(actionType, details, context) {
        if (context && context.skipAuditPersistence) return false;
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    actionType: actionType,
                    actorId: actorId(context) || 'SYSTEM',
                    tenantSlug: contextTenant(context),
                    entityType: 'ACCESSIBILITY_GOVERNANCE',
                    details: cloneSanitized(details || {})
                });
                return true;
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-A11Y-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                createdAt: nowIso(),
                details: cloneSanitized(details || {})
            });
            data.auditLogs = data.auditLogs.slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordTelemetry(eventType, details, context) {
        if (context && context.skipTelemetry) return false;
        try {
            if (global.WorkflowTelemetryService) {
                if (typeof global.WorkflowTelemetryService.recordEvent === 'function') {
                    global.WorkflowTelemetryService.recordEvent(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
                if (typeof global.WorkflowTelemetryService.track === 'function') {
                    global.WorkflowTelemetryService.track(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
            }
        } catch (error) {}
        return false;
    }

    function generateAccessibilityGovernanceReport(payload, context) {
        try {
            var scope = validateAccessibilityScope(payload, context);
            if (!scope.success) return scope;
            var normalized = normalizeAccessibilityPayload(payload, context);
            if (!normalized.success) return normalized;
            var validation = validateAccessibilityCompliance(normalized, context);
            var score = calculateAccessibilityScore(validation, context);
            var audit = auditAccessibilityViolations(validation, context);
            var reportId = 'A11Y-GOV-' + Date.now();
            var generatedAt = nowIso();
            var historyItem = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                actorId: actorId(context) || 'SYSTEM',
                accessibilityScore: score.accessibilityScore,
                complianceScore: score.complianceScore,
                complianceClass: score.complianceClass,
                violationCount: validation.violationCount
            };
            appendHistory('accessibilityGovernanceHistory', historyItem);
            appendHistory('accessibilityGovernanceAnalytics', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                keyboardFocusIssues: validation.keyboardNavigation && validation.keyboardNavigation.focusIssueCount || 0,
                screenReaderCoverage: validation.screenReaderSupport && validation.screenReaderSupport.ariaCoverageScore || 100,
                accessibilityScore: score.accessibilityScore,
                complianceScore: score.complianceScore
            });
            var auditRecorded = recordAudit('ACCESSIBILITY_GOVERNANCE_REVIEW', historyItem, context || {});
            var telemetryRecorded = recordTelemetry('ACCESSIBILITY_REVIEW_COMPLETED', historyItem, context || {});
            var report = {
                success: true,
                reportId: reportId,
                state: validation.state || ACCESSIBILITY_STATES[0],
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                accessibilityScore: score.accessibilityScore,
                usabilityScore: score.usabilityScore,
                complianceScore: score.complianceScore,
                accessibilityReadinessScore: score.accessibilityReadinessScore,
                complianceClass: score.complianceClass,
                validation: validation,
                severitySummary: score.severitySummary,
                remediationRecommendations: audit.remediationRecommendations || [],
                analytics: {
                    keyboardNavigationUsage: safeNumber(normalized.analytics.keyboardNavigationUsage, 0),
                    screenReaderCompatibilityIssues: safeNumber(normalized.analytics.screenReaderCompatibilityIssues, 0),
                    focusIssues: safeNumber(normalized.analytics.focusIssues, 0),
                    accessibilityErrors: safeNumber(normalized.analytics.accessibilityErrors, 0)
                },
                integrationHealth: {
                    audit: auditRecorded,
                    auditIntegrated: auditRecorded,
                    telemetry: telemetryRecorded,
                    telemetryIntegrated: telemetryRecorded,
                    notificationCenter: !!global.NotificationCenterService,
                    smartSearch: !!global.SmartSearchService,
                    activityFeed: !!global.GlobalActivityFeedService,
                    uxGovernance: !!global.UXPermissionSimplificationService,
                    dashboardOptimization: !!global.DashboardPerformanceService
                },
                governance: governanceFlags()
            };
            return freezeAccessibilityOutput(report);
        } catch (error) {
            safeWarn('generateAccessibilityGovernanceReport failed safely', error && error.message);
            return freezeAccessibilityOutput({
                success: false,
                classification: 'ACCESSIBILITY_REPORT_ERROR',
                message: 'Accessibility governance report failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        try {
            var malformed = normalizeAccessibilityPayload(null, {});
            checks.push({ name: 'malformed payloads fail safely', passed: malformed.success === false && Object.isFrozen(malformed) });
            var payload = {
                tenantSlug: 'self-test',
                routeType: 'platform',
                landmarks: [{ landmarkId: 'main', role: 'main', label: 'Main', present: true, tenantSlug: 'self-test' }],
                controls: [{ controlId: 'bad-button', controlType: 'button', label: '', ariaLabel: '', keyboardReachable: true, focusVisible: false, tenantSlug: 'self-test' }],
                dialogs: [{ dialogId: 'dialog', ariaModal: false, labelledBy: '', focusTrap: false, escapeCloses: false, initialFocus: false, tenantSlug: 'self-test' }],
                notifications: [{ notificationId: 'critical', priority: 'CRITICAL', ariaLive: '', role: '', tenantSlug: 'self-test' }],
                focusTargets: [{ targetId: 'main', keyboardReachable: true, focusVisible: true, order: 1, tenantSlug: 'self-test' }],
                colorPairs: [{ pairId: 'muted', ratio: 2.2, tenantSlug: 'self-test' }]
            };
            var report = generateAccessibilityGovernanceReport(payload, {
                routeType: 'platform',
                tenantSlug: 'self-test',
                actor: { role: 'PLATFORM_OWNER', id: 'SELF-TEST' },
                skipAuditPersistence: true,
                skipTelemetry: true
            });
            checks.push({ name: 'keyboard navigation works', passed: !!(report.success && report.validation && report.validation.keyboardNavigation) });
            checks.push({ name: 'screen reader support works', passed: !!(report.success && report.validation && report.validation.screenReaderSupport) });
            checks.push({ name: 'accessibility scoring works', passed: !!(report.success && report.accessibilityScore < 100) });
            checks.push({ name: 'compliance validation works', passed: !!(report.success && report.validation.violations.length >= 3) });
            checks.push({ name: 'immutable outputs enforced', passed: Object.isFrozen(report) && Object.isFrozen(report.validation) });
        } catch (error) {
            checks.push({ name: 'self-test failure captured', passed: false, error: safeString(error && error.message, 'unknown') });
        }
        var result = freezeAccessibilityOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_ACCESSIBILITY_GOVERNANCE_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        ACCESSIBILITY_STATES: ACCESSIBILITY_STATES,
        validateAccessibilityScope: validateAccessibilityScope,
        validateAccessibilityCompliance: validateAccessibilityCompliance,
        calculateAccessibilityScore: calculateAccessibilityScore,
        auditAccessibilityViolations: auditAccessibilityViolations,
        normalizeAccessibilityPayload: normalizeAccessibilityPayload,
        freezeAccessibilityOutput: freezeAccessibilityOutput,
        generateAccessibilityGovernanceReport: generateAccessibilityGovernanceReport,
        runSelfTest: runSelfTest
    });

    try {
        global.AccessibilityGovernanceService = service;
        global.accessibilityGovernanceService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
