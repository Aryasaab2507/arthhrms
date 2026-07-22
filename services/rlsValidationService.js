/**
 * rlsValidationService.js
 * ARTHHRMS — Supabase RLS Validation Layer
 *
 * PURPOSE:
 * Provides safe staging validation for Supabase Row-Level Security policies,
 * tenant isolation rules, and role-access enforcement.
 *
 * This service validates:
 * - tenant isolation
 * - role visibility
 * - policy enforcement
 * - access regressions
 * - production readiness
 *
 * This service does NOT:
 * - bypass RLS
 * - disable auth
 * - mutate production policies
 *
 * ARCHITECTURE RULE:
 * Security validation must remain isolated from live production behavior.
 *
 * STABILITY:
 * Public APIs must remain synchronous where possible and backward-compatible.
 *
 * DEPENDS ON:
 * - window.supabaseClientService (optional)
 * - window.WorkflowTelemetryService (optional)
 *
 * @version 1.0.0
 */
(function attachRLSValidationService(global) {
  'use strict';

  var REGISTRY_NAME = 'RLSValidationService';
  var DEFAULT_SOURCE = 'rlsValidationService';
  var CRITICAL_TABLES = Object.freeze([
    'employees',
    'attendance',
    'leave_requests',
    'expense_claims',
    'salary_structures',
    'payroll_cycles',
    'payroll_records',
    'payslips',
    'notifications',
    'pending_actions',
    'workflow_events',
    'audit_logs'
  ]);

  var ROLES = Object.freeze([
    'EMPLOYEE',
    'MANAGER',
    'HR',
    'ADMIN',
    'SUPER_ADMIN'
  ]);

  var SEVERITIES = Object.freeze({
    INFO: 'INFO',
    WARNING: 'WARNING',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
  });

  var ROLE_EXPECTATIONS = Object.freeze({
    EMPLOYEE: Object.freeze([
      'Employee role should only see its own employee profile.',
      'Employee role should only see its own leave, attendance, payroll, and expense records.'
    ]),
    MANAGER: Object.freeze([
      'Manager role should see only directly managed employees and related workflow records.',
      'Manager role must not cross tenant or unrelated team boundaries.'
    ]),
    HR: Object.freeze([
      'HR role should use controlled HR-scoped visibility.',
      'HR role should not require direct unrestricted table access.'
    ]),
    ADMIN: Object.freeze([
      'Admin role should use controlled operational visibility.',
      'Admin role should not bypass tenant isolation rules.'
    ]),
    SUPER_ADMIN: Object.freeze([
      'Super admin role may have elevated operational visibility.',
      'Super admin access should remain auditable and tenant-aware.'
    ])
  });

  function structuredWarning(message, metadata) {
    return Object.freeze({
      code: 'RLS_VALIDATION_WARNING',
      message: String(message || 'RLS validation warning.'),
      metadata: freezePlainObject(safeMetadata(metadata))
    });
  }

  function logWarning(message, metadata) {
    try {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[RLSValidationService]', message, safeMetadata(metadata));
      }
    } catch (error) {
      return false;
    }
    return true;
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch (error) {
      return String(Date.now());
    }
  }

  function safeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    var cloned = {};
    Object.keys(metadata).forEach(function copyMetadataKey(key) {
      var value = metadata[key];
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        cloned[key] = value;
      } else if (Array.isArray(value)) {
        cloned[key] = value.slice(0, 20);
      } else if (value && typeof value === 'object') {
        cloned[key] = Object.assign({}, value);
      }
    });

    return cloned;
  }

  function freezePlainObject(objectValue) {
    var target = objectValue && typeof objectValue === 'object' ? objectValue : {};
    Object.keys(target).forEach(function freezeNested(key) {
      if (Array.isArray(target[key])) {
        target[key] = Object.freeze(target[key].slice());
      } else if (target[key] && typeof target[key] === 'object') {
        target[key] = Object.freeze(Object.assign({}, target[key]));
      }
    });
    return Object.freeze(target);
  }

  function freezeList(list) {
    if (!Array.isArray(list)) {
      return Object.freeze([]);
    }

    return Object.freeze(list.map(function freezeListItem(item) {
      if (item && typeof item === 'object') {
        return freezePlainObject(Object.assign({}, item));
      }
      return item;
    }));
  }

  function safeSeverity(severity, fallback) {
    var normalized = String(severity || fallback || SEVERITIES.WARNING).toUpperCase();
    if (normalized === SEVERITIES.INFO) return SEVERITIES.INFO;
    if (normalized === SEVERITIES.WARNING) return SEVERITIES.WARNING;
    if (normalized === SEVERITIES.HIGH) return SEVERITIES.HIGH;
    if (normalized === SEVERITIES.CRITICAL) return SEVERITIES.CRITICAL;
    return fallback || SEVERITIES.WARNING;
  }

  function normalizeRole(role) {
    var normalized = String(role || '').trim().toUpperCase();
    if (normalized === 'SUPERADMIN') normalized = 'SUPER_ADMIN';
    if (normalized === 'SUPER-ADMIN') normalized = 'SUPER_ADMIN';
    if (ROLES.indexOf(normalized) === -1) {
      return '';
    }
    return normalized;
  }

  function safeFailure(code, severity, message, metadata) {
    return Object.freeze({
      failureCode: String(code || 'RLS_VALIDATION_FAILURE'),
      severity: safeSeverity(severity, SEVERITIES.HIGH),
      message: String(message || 'RLS validation failure.'),
      metadata: freezePlainObject(safeMetadata(metadata))
    });
  }

  function safeRecommendation(code, message, metadata) {
    return Object.freeze({
      recommendationCode: String(code || 'RLS_VALIDATION_RECOMMENDATION'),
      message: String(message || 'Review RLS validation evidence before production rollout.'),
      metadata: freezePlainObject(safeMetadata(metadata))
    });
  }

  function normalizeValidation(validationType, passed, warnings, failures, recommendations, metadata, successOverride) {
    var safeWarnings = Array.isArray(warnings) ? warnings.slice() : [];
    var safeFailures = Array.isArray(failures) ? failures.slice() : [];
    var safeRecommendations = Array.isArray(recommendations) ? recommendations.slice() : [];
    var output = {
      success: successOverride === false ? false : true,
      validationType: String(validationType || 'RLS_VALIDATION'),
      passed: Boolean(passed) && safeFailures.length === 0,
      warnings: freezeList(safeWarnings),
      failures: freezeList(safeFailures),
      recommendations: freezeList(safeRecommendations),
      timestamp: nowIso()
    };

    if (metadata && typeof metadata === 'object') {
      output.metadata = freezePlainObject(safeMetadata(metadata));
    }

    return freezeValidationOutput(output);
  }

  function freezeValidationOutput(output) {
    var normalized = output && typeof output === 'object' ? Object.assign({}, output) : {};
    normalized.warnings = freezeList(normalized.warnings);
    normalized.failures = freezeList(normalized.failures);
    normalized.recommendations = freezeList(normalized.recommendations);

    if (Array.isArray(normalized.sections)) {
      normalized.sections = Object.freeze(normalized.sections.slice());
    }

    if (normalized.roleResults && typeof normalized.roleResults === 'object') {
      var frozenRoles = {};
      Object.keys(normalized.roleResults).forEach(function freezeRoleResult(role) {
        frozenRoles[role] = normalized.roleResults[role];
      });
      normalized.roleResults = Object.freeze(frozenRoles);
    }

    if (normalized.metadata && typeof normalized.metadata === 'object') {
      normalized.metadata = freezePlainObject(Object.assign({}, normalized.metadata));
    }

    return Object.freeze(normalized);
  }

  function getContext(context) {
    if (context && typeof context === 'object') {
      return Object.assign({}, context);
    }

    var candidates = [
      global.ARTHHRMS_RLS_VALIDATION_CONTEXT,
      global.__ARTHHRMS_RLS_VALIDATION_CONTEXT__,
      global.RLS_VALIDATION_CONTEXT,
      global.supabaseClientService && global.supabaseClientService.rlsValidationSnapshot
    ];

    for (var index = 0; index < candidates.length; index += 1) {
      if (candidates[index] && typeof candidates[index] === 'object') {
        return Object.assign({}, candidates[index]);
      }
    }

    return {};
  }

  function getArray(value) {
    if (Array.isArray(value)) {
      return value.slice();
    }
    return [];
  }

  function hasValidationEvidence(context, key) {
    return Array.isArray(context[key]) && context[key].length > 0;
  }

  function isCrossTenantLeak(test) {
    if (!test || typeof test !== 'object') {
      return false;
    }

    return Boolean(
      test.crossTenantVisible ||
      test.crossTenantLeak ||
      test.leakDetected ||
      test.tenantLeak ||
      test.foreignTenantRowsVisible
    );
  }

  function testPassed(test) {
    if (!test || typeof test !== 'object') {
      return false;
    }
    if (typeof test.passed === 'boolean') {
      return test.passed;
    }
    if (typeof test.success === 'boolean') {
      return test.success;
    }
    if (isCrossTenantLeak(test) || test.unauthorizedAccess === true) {
      return false;
    }
    return true;
  }

  function testLabel(test, fallback) {
    if (!test || typeof test !== 'object') {
      return fallback;
    }
    return String(test.testName || test.name || test.rule || test.table || fallback);
  }

  function emitTelemetry(eventType, result) {
    try {
      if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') {
        return false;
      }

      global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
        source: DEFAULT_SOURCE,
        severity: result && result.passed ? SEVERITIES.INFO : SEVERITIES.WARNING,
        status: result && result.passed ? 'PASSED' : 'NEEDS_REVIEW',
        metadata: {
          validationType: result && result.validationType,
          failureCount: result && result.failures ? result.failures.length : 0,
          warningCount: result && result.warnings ? result.warnings.length : 0
        }
      });
      return true;
    } catch (error) {
      logWarning('Telemetry forwarding failed during RLS validation.', {
        eventType: eventType,
        error: error && error.message
      });
      return false;
    }
  }

  function validateTenantIsolation(context) {
    try {
      var validationContext = getContext(context);
      var tests = getArray(validationContext.tenantIsolationTests);
      var warnings = [];
      var failures = [];
      var recommendations = [
        safeRecommendation(
          'TENANT_ISOLATION_STAGING_REQUIRED',
          'Run tenant isolation checks in staging using authenticated test users from distinct tenants before production rollout.'
        )
      ];

      if (!hasValidationEvidence(validationContext, 'tenantIsolationTests')) {
        warnings.push(structuredWarning('Tenant isolation evidence was not provided.', {
          validationType: 'TENANT_ISOLATION'
        }));
        failures.push(safeFailure(
          'TENANT_ISOLATION_UNVERIFIED',
          SEVERITIES.HIGH,
          'Tenant isolation cannot be considered production-ready without staging evidence.'
        ));
      }

      tests.forEach(function evaluateTenantTest(test, index) {
        var label = testLabel(test, 'tenant-isolation-test-' + index);
        if (isCrossTenantLeak(test)) {
          failures.push(safeFailure(
            'CROSS_TENANT_VISIBILITY_LEAK',
            SEVERITIES.CRITICAL,
            'Cross-tenant visibility was detected in ' + label + '.',
            {
              table: test.table,
              role: test.role,
              validationType: 'TENANT_ISOLATION'
            }
          ));
          recommendations.push(safeRecommendation(
            'FIX_CROSS_TENANT_POLICY',
            'Review tenant predicates and role policies for ' + label + ' before any production activation.',
            { table: test.table, role: test.role }
          ));
          return;
        }

        if (!testPassed(test)) {
          failures.push(safeFailure(
            'TENANT_ISOLATION_TEST_FAILED',
            safeSeverity(test.severity, SEVERITIES.HIGH),
            'Tenant isolation validation failed for ' + label + '.',
            {
              table: test.table,
              role: test.role,
              validationType: 'TENANT_ISOLATION'
            }
          ));
        }
      });

      var result = normalizeValidation(
        'TENANT_ISOLATION',
        failures.length === 0,
        warnings,
        failures,
        recommendations,
        { testCount: tests.length }
      );
      emitTelemetry('RLS_TENANT_ISOLATION_VALIDATED', result);
      return result;
    } catch (error) {
      var failedResult = normalizeValidation(
        'TENANT_ISOLATION',
        false,
        [structuredWarning('Tenant isolation validation recovered from an internal error.', { error: error && error.message })],
        [safeFailure('TENANT_ISOLATION_VALIDATOR_ERROR', SEVERITIES.HIGH, 'Tenant isolation validation could not complete safely.')],
        [safeRecommendation('RETRY_TENANT_ISOLATION_VALIDATION', 'Review staging validation context and retry the tenant isolation check.')],
        {},
        false
      );
      emitTelemetry('RLS_TENANT_ISOLATION_VALIDATION_ERROR', failedResult);
      return failedResult;
    }
  }

  function validateRoleAccess(role, context) {
    try {
      var normalizedRole = normalizeRole(role);
      var validationContext = getContext(context);
      var warnings = [];
      var failures = [];
      var recommendations = [];

      if (!normalizedRole) {
        var invalidResult = normalizeValidation(
          'ROLE_ACCESS',
          false,
          [],
          [safeFailure('INVALID_ROLE', SEVERITIES.HIGH, 'Role access validation requires a known role.', { role: role })],
          [safeRecommendation('USE_SUPPORTED_ROLE', 'Use EMPLOYEE, MANAGER, HR, ADMIN, or SUPER_ADMIN for role validation.')],
          {},
          false
        );
        emitTelemetry('RLS_ROLE_ACCESS_INVALID_ROLE', invalidResult);
        return invalidResult;
      }

      ROLE_EXPECTATIONS[normalizedRole].forEach(function addExpectation(expectation) {
        recommendations.push(safeRecommendation('ROLE_EXPECTATION_' + normalizedRole, expectation, { role: normalizedRole }));
      });

      var roleTestsByRole = validationContext.roleAccessTests && typeof validationContext.roleAccessTests === 'object'
        ? validationContext.roleAccessTests
        : {};
      var roleTests = getArray(roleTestsByRole[normalizedRole])
        .concat(getArray(roleTestsByRole[normalizedRole.toLowerCase()]));

      if (roleTests.length === 0) {
        warnings.push(structuredWarning('Role access evidence was not provided for ' + normalizedRole + '.', {
          role: normalizedRole
        }));
        failures.push(safeFailure(
          'ROLE_ACCESS_UNVERIFIED',
          SEVERITIES.HIGH,
          normalizedRole + ' access cannot be considered production-ready without staging evidence.',
          { role: normalizedRole }
        ));
      }

      roleTests.forEach(function evaluateRoleTest(test, index) {
        var label = testLabel(test, normalizedRole + '-role-test-' + index);
        if (isCrossTenantLeak(test)) {
          failures.push(safeFailure(
            'ROLE_CROSS_TENANT_VISIBILITY_LEAK',
            SEVERITIES.CRITICAL,
            normalizedRole + ' validation detected cross-tenant visibility in ' + label + '.',
            {
              role: normalizedRole,
              table: test.table
            }
          ));
          return;
        }

        if (test.unauthorizedAccess === true || !testPassed(test)) {
          failures.push(safeFailure(
            'ROLE_ACCESS_POLICY_FAILED',
            safeSeverity(test.severity, SEVERITIES.HIGH),
            normalizedRole + ' access validation failed for ' + label + '.',
            {
              role: normalizedRole,
              table: test.table
            }
          ));
        }
      });

      var result = normalizeValidation(
        'ROLE_ACCESS_' + normalizedRole,
        failures.length === 0,
        warnings,
        failures,
        recommendations,
        { role: normalizedRole, testCount: roleTests.length }
      );
      emitTelemetry('RLS_ROLE_ACCESS_VALIDATED', result);
      return result;
    } catch (error) {
      var failedResult = normalizeValidation(
        'ROLE_ACCESS',
        false,
        [structuredWarning('Role access validation recovered from an internal error.', { error: error && error.message })],
        [safeFailure('ROLE_ACCESS_VALIDATOR_ERROR', SEVERITIES.HIGH, 'Role access validation could not complete safely.')],
        [safeRecommendation('RETRY_ROLE_ACCESS_VALIDATION', 'Review staging validation context and retry role access checks.')],
        {},
        false
      );
      emitTelemetry('RLS_ROLE_ACCESS_VALIDATION_ERROR', failedResult);
      return failedResult;
    }
  }

  function normalizePolicyRows(context) {
    var rows = [];
    getArray(context.policyCoverage).forEach(function appendCoverage(row) {
      if (row && typeof row === 'object') {
        rows.push(Object.assign({}, row));
      }
    });
    getArray(context.policies).forEach(function appendPolicy(row) {
      if (row && typeof row === 'object') {
        rows.push(Object.assign({}, row));
      }
    });
    getArray(context.tables).forEach(function appendTable(row) {
      if (row && typeof row === 'object') {
        rows.push(Object.assign({}, row));
      }
    });
    return rows;
  }

  function rowTableName(row) {
    return String(row.table || row.tableName || row.tablename || row.name || '').trim();
  }

  function rowPolicies(row) {
    if (Array.isArray(row.policies)) {
      return row.policies.slice();
    }
    if (row.policyname || row.policyName || row.cmd || row.command) {
      return [row];
    }
    return [];
  }

  function isRlsEnabled(row) {
    if (!row || typeof row !== 'object') {
      return false;
    }
    if (row.rlsEnabled === true || row.relrowsecurity === true || row.rowSecurityEnabled === true) {
      return true;
    }
    if (row.rlsEnabled === false || row.relrowsecurity === false || row.rowSecurityEnabled === false) {
      return false;
    }
    return false;
  }

  function hasAnonRole(policy) {
    var roles = policy && (policy.roles || policy.role);
    if (Array.isArray(roles)) {
      return roles.map(String).join(',').toLowerCase().indexOf('anon') !== -1;
    }
    return String(roles || '').toLowerCase().indexOf('anon') !== -1;
  }

  function hasPublicRole(policy) {
    var roles = policy && (policy.roles || policy.role);
    if (Array.isArray(roles)) {
      return roles.map(String).join(',').toLowerCase().indexOf('public') !== -1;
    }
    return String(roles || '').toLowerCase().indexOf('public') !== -1;
  }

  function isBroadPredicate(value) {
    var normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized === 'true' ||
      normalized === '(true)' ||
      normalized === '1=1' ||
      normalized === '(1 = 1)' ||
      normalized === '((true))';
  }

  function policyCommand(policy) {
    return String(policy && (policy.command || policy.cmd || policy.action) || '').trim().toUpperCase();
  }

  function policyName(policy) {
    return String(policy && (policy.policyName || policy.policyname || policy.name) || 'unnamed_policy');
  }

  function detectDangerousPolicies(tableName, policies, failures, recommendations) {
    policies.forEach(function inspectPolicy(policy) {
      var command = policyCommand(policy);
      var predicate = policy && (policy.using || policy.qual || policy.withCheck || policy.with_check);
      var broadPredicate = isBroadPredicate(predicate);
      var name = policyName(policy);

      if ((command === 'SELECT' || command === 'ALL') && hasAnonRole(policy)) {
        failures.push(safeFailure(
          'ANONYMOUS_SELECT_POLICY',
          SEVERITIES.CRITICAL,
          'Anonymous SELECT policy detected on ' + tableName + ' via ' + name + '.',
          { table: tableName, policy: name }
        ));
      }

      if ((command === 'SELECT' || command === 'ALL') && (hasPublicRole(policy) || broadPredicate)) {
        failures.push(safeFailure(
          'DANGEROUS_BROAD_SELECT_POLICY',
          SEVERITIES.HIGH,
          'Broad SELECT policy detected on ' + tableName + ' via ' + name + '.',
          { table: tableName, policy: name }
        ));
      }

      if ((command === 'UPDATE' || command === 'ALL') && broadPredicate) {
        failures.push(safeFailure(
          'UNRESTRICTED_UPDATE_POLICY',
          SEVERITIES.CRITICAL,
          'Unrestricted UPDATE policy detected on ' + tableName + ' via ' + name + '.',
          { table: tableName, policy: name }
        ));
      }
    });

    if (failures.length > 0) {
      recommendations.push(safeRecommendation(
        'REVIEW_DANGEROUS_POLICIES',
        'Review broad, anonymous, and unrestricted policy definitions before production activation.',
        { table: tableName }
      ));
    }
  }

  function validatePolicyCoverage(context) {
    try {
      var validationContext = getContext(context);
      var policyRows = normalizePolicyRows(validationContext);
      var warnings = [];
      var failures = [];
      var recommendations = [
        safeRecommendation(
          'VERIFY_POLICIES_IN_STAGING',
          'Run the staging SQL policy inspection script and feed its results into this validator before production rollout.'
        )
      ];
      var byTable = {};

      policyRows.forEach(function groupRow(row) {
        var tableName = rowTableName(row);
        if (!tableName) {
          return;
        }
        if (!byTable[tableName]) {
          byTable[tableName] = {
            rlsEnabled: isRlsEnabled(row),
            policies: []
          };
        }
        byTable[tableName].rlsEnabled = byTable[tableName].rlsEnabled || isRlsEnabled(row);
        byTable[tableName].policies = byTable[tableName].policies.concat(rowPolicies(row));
      });

      if (policyRows.length === 0) {
        warnings.push(structuredWarning('Policy coverage evidence was not provided.', {
          validationType: 'POLICY_COVERAGE'
        }));
        failures.push(safeFailure(
          'POLICY_COVERAGE_UNVERIFIED',
          SEVERITIES.HIGH,
          'Policy coverage cannot be considered production-ready without staging evidence.'
        ));
      }

      CRITICAL_TABLES.forEach(function inspectCriticalTable(tableName) {
        var tableCoverage = byTable[tableName];
        if (!tableCoverage) {
          failures.push(safeFailure(
            'CRITICAL_TABLE_POLICY_MISSING',
            SEVERITIES.HIGH,
            'Critical table has no supplied RLS coverage evidence: ' + tableName + '.',
            { table: tableName }
          ));
          return;
        }

        if (!tableCoverage.rlsEnabled) {
          failures.push(safeFailure(
            'CRITICAL_TABLE_RLS_NOT_ENABLED',
            SEVERITIES.CRITICAL,
            'Critical table is not marked as RLS-enabled: ' + tableName + '.',
            { table: tableName }
          ));
        }

        if (tableCoverage.policies.length === 0) {
          failures.push(safeFailure(
            'CRITICAL_TABLE_POLICY_EMPTY',
            SEVERITIES.HIGH,
            'Critical table has no supplied policy definitions: ' + tableName + '.',
            { table: tableName }
          ));
        }

        detectDangerousPolicies(tableName, tableCoverage.policies, failures, recommendations);
      });

      var result = normalizeValidation(
        'POLICY_COVERAGE',
        failures.length === 0,
        warnings,
        failures,
        recommendations,
        { tableCount: Object.keys(byTable).length, criticalTableCount: CRITICAL_TABLES.length }
      );
      emitTelemetry('RLS_POLICY_COVERAGE_VALIDATED', result);
      return result;
    } catch (error) {
      var failedResult = normalizeValidation(
        'POLICY_COVERAGE',
        false,
        [structuredWarning('Policy coverage validation recovered from an internal error.', { error: error && error.message })],
        [safeFailure('POLICY_COVERAGE_VALIDATOR_ERROR', SEVERITIES.HIGH, 'Policy coverage validation could not complete safely.')],
        [safeRecommendation('RETRY_POLICY_COVERAGE_VALIDATION', 'Review staging policy coverage input and retry validation.')],
        {},
        false
      );
      emitTelemetry('RLS_POLICY_COVERAGE_VALIDATION_ERROR', failedResult);
      return failedResult;
    }
  }

  function generateSecurityValidationReport(context) {
    try {
      var validationContext = getContext(context);
      var tenantResult = validateTenantIsolation(validationContext);
      var roleResults = {};
      var warnings = [].concat(tenantResult.warnings);
      var failures = [].concat(tenantResult.failures);
      var recommendations = [].concat(tenantResult.recommendations);

      ROLES.forEach(function validateRole(role) {
        var roleResult = validateRoleAccess(role, validationContext);
        roleResults[role] = roleResult;
        warnings = warnings.concat(roleResult.warnings);
        failures = failures.concat(roleResult.failures);
        recommendations = recommendations.concat(roleResult.recommendations);
      });

      var policyResult = validatePolicyCoverage(validationContext);
      warnings = warnings.concat(policyResult.warnings);
      failures = failures.concat(policyResult.failures);
      recommendations = recommendations.concat(policyResult.recommendations);

      var report = {
        success: true,
        validationType: 'SECURITY_VALIDATION_REPORT',
        passed: failures.length === 0,
        warnings: freezeList(warnings),
        failures: freezeList(failures),
        recommendations: freezeList(recommendations),
        timestamp: nowIso(),
        sections: Object.freeze([
          tenantResult,
          policyResult
        ]),
        roleResults: roleResults,
        metadata: freezePlainObject({
          roleCount: ROLES.length,
          failedValidationCount: failures.length,
          warningCount: warnings.length
        })
      };

      report.roleResults = Object.freeze(roleResults);
      var frozenReport = freezeValidationOutput(report);
      emitTelemetry('RLS_SECURITY_VALIDATION_REPORT_GENERATED', frozenReport);
      return frozenReport;
    } catch (error) {
      var failedReport = normalizeValidation(
        'SECURITY_VALIDATION_REPORT',
        false,
        [structuredWarning('Security validation report recovered from an internal error.', { error: error && error.message })],
        [safeFailure('SECURITY_VALIDATION_REPORT_ERROR', SEVERITIES.HIGH, 'Security validation report could not complete safely.')],
        [safeRecommendation('RETRY_SECURITY_VALIDATION_REPORT', 'Review supplied staging evidence and retry the security validation report.')],
        {},
        false
      );
      emitTelemetry('RLS_SECURITY_VALIDATION_REPORT_ERROR', failedReport);
      return failedReport;
    }
  }

  var RLSValidationService = Object.freeze({
    validateTenantIsolation: validateTenantIsolation,
    validateRoleAccess: validateRoleAccess,
    validatePolicyCoverage: validatePolicyCoverage,
    generateSecurityValidationReport: generateSecurityValidationReport
  });

  if (!global.supabaseClientService) {
    logWarning('Optional supabaseClientService dependency not detected. Validation will use supplied staging evidence only.', {
      dependency: 'supabaseClientService'
    });
  }

  if (!global.WorkflowTelemetryService) {
    logWarning('Optional WorkflowTelemetryService dependency not detected. Validation telemetry is disabled.', {
      dependency: 'WorkflowTelemetryService'
    });
  }

  global[REGISTRY_NAME] = RLSValidationService;

  if (global.__ARTHHRMS_DEV__) {
    (function selfTest() {
      var originalTelemetry = global.WorkflowTelemetryService;
      var selfTestResults = [];

      function assertSelfTest(name, condition) {
        selfTestResults.push({
          name: name,
          passed: Boolean(condition)
        });
      }

      var leakResult = validateTenantIsolation({
        tenantIsolationTests: [
          {
            name: 'employee cross tenant leak',
            table: 'employees',
            role: 'EMPLOYEE',
            crossTenantVisible: true
          }
        ]
      });
      assertSelfTest(
        'cross-tenant leaks are CRITICAL',
        leakResult.failures.length === 1 && leakResult.failures[0].severity === SEVERITIES.CRITICAL
      );

      var malformedResult = validateTenantIsolation('not-an-object');
      assertSelfTest(
        'malformed payload handled safely',
        malformedResult && malformedResult.success === true && malformedResult.passed === false
      );

      var roleResult = validateRoleAccess('employee', {
        roleAccessTests: {
          EMPLOYEE: [
            {
              name: 'own profile only',
              table: 'employees',
              passed: true
            }
          ]
        }
      });
      assertSelfTest('role validation accepts normalized roles', roleResult.passed === true);

      var policyRows = CRITICAL_TABLES.map(function createPolicyRow(tableName) {
        return {
          table: tableName,
          rlsEnabled: true,
          policies: [
            {
              policyName: tableName + '_authenticated_select',
              command: 'SELECT',
              roles: ['authenticated'],
              using: 'auth.uid() is not null'
            }
          ]
        };
      });
      var policyResult = validatePolicyCoverage({
        policyCoverage: policyRows
      });
      assertSelfTest('policy coverage passes with complete protected table evidence', policyResult.passed === true);

      assertSelfTest('validation outputs are frozen', Object.isFrozen(policyResult) && Object.isFrozen(policyResult.failures));

      global.WorkflowTelemetryService = {
        emitTelemetry: function emitTelemetryFailure() {
          throw new Error('self-test telemetry failure');
        }
      };
      var telemetryIsolationResult = validateRoleAccess('MANAGER', {
        roleAccessTests: {
          MANAGER: [
            {
              name: 'managed employees only',
              passed: true
            }
          ]
        }
      });
      assertSelfTest('telemetry failures isolated', telemetryIsolationResult.passed === true);
      global.WorkflowTelemetryService = originalTelemetry;

      try {
        global.__ARTHHRMS_RLS_VALIDATION_SELF_TEST__ = Object.freeze(selfTestResults.map(function freezeSelfTest(result) {
          return Object.freeze(Object.assign({}, result));
        }));
      } catch (error) {
        logWarning('RLS validation self-test result storage failed.', { error: error && error.message });
      }
    })();
  }
})(typeof window !== 'undefined' ? window : globalThis);
