// Company Owner readiness page controller.
(function attachCompanyReadinessPage(global) {
    'use strict';

    var latestDashboard = null;
    var latestRequest = null;

    function clear(node) {
        while (node?.firstChild) node.removeChild(node.firstChild);
    }

    function text(tag, value, className) {
        var node = document.createElement(tag);
        node.textContent = String(value == null ? '' : value);
        if (className) node.className = className;
        return node;
    }

    function notice(message, isError) {
        var node = document.getElementById('notice');
        node.textContent = message || '';
        node.classList.toggle('show', !!message);
        node.classList.toggle('error', !!isError);
    }

    function statusNode(value) {
        var valueText = String(value || 'UNKNOWN');
        return text('span', valueText, 'status ' + valueText.toLowerCase());
    }

    function renderTable(id, columns, rows) {
        var table = document.getElementById(id);
        var data = Array.isArray(rows) ? rows : [];
        clear(table);
        var thead = document.createElement('thead');
        var headingRow = document.createElement('tr');
        columns.forEach(function addHeading(column) {
            headingRow.appendChild(text('th', column.label));
        });
        thead.appendChild(headingRow);
        table.appendChild(thead);
        var tbody = document.createElement('tbody');
        if (!data.length) {
            var emptyRow = document.createElement('tr');
            var emptyCell = text('td', 'No records.', 'empty');
            emptyCell.colSpan = columns.length;
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
        } else {
            data.forEach(function addRow(row) {
                var tr = document.createElement('tr');
                columns.forEach(function addCell(column) {
                    var td = document.createElement('td');
                    var rendered = column.render ? column.render(row) : String(row?.[column.key] ?? '');
                    td.appendChild(rendered instanceof Node ? rendered : document.createTextNode(String(rendered)));
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
        }
        table.appendChild(tbody);
    }

    function renderMetrics(dashboard) {
        var scores = dashboard.scorecards || {};
        var items = [
            ['Overall', dashboard.readinessScore || 0, dashboard.readinessScore >= 95 ? 'good' : dashboard.readinessScore >= 80 ? 'warn' : 'bad'],
            ['Organization', scores.organizationReadiness || 0, 'good'],
            ['Data Quality', scores.dataQuality || 0, 'good'],
            ['Security', scores.security || 0, 'good'],
            ['Infrastructure', scores.infrastructure || 0, 'good'],
            ['Open Risks', dashboard.blockingIssues?.length || 0, dashboard.blockingIssues?.length ? 'bad' : 'good']
        ];
        var container = document.getElementById('metrics');
        clear(container);
        items.forEach(function addMetric(item) {
            var metric = document.createElement('div');
            metric.className = 'metric ' + item[2];
            metric.appendChild(text('strong', String(item[1]) + (item[0] === 'Open Risks' ? '' : '%')));
            metric.appendChild(text('span', item[0]));
            container.appendChild(metric);
        });
    }

    function renderHandoff(request) {
        var node = document.getElementById('certificateArea');
        clear(node);
        if (!request) {
            node.className = 'certificate empty';
            node.textContent = 'No pilot review request.';
            return;
        }
        node.className = 'certificate';
        var dl = document.createElement('dl');
        [
            ['Request ID', request.id],
            ['Status', request.status],
            ['Validation Run', request.validation_run_id],
            ['Readiness Score', String(request.readiness_score || 0) + '%'],
            ['Requested', request.requested_at],
            ['Review Reason', request.review_reason || 'Awaiting Platform Owner review.']
        ].forEach(function addDefinition(entry) {
            dl.appendChild(text('dt', entry[0]));
            if (entry[0] === 'Status') {
                var dd = document.createElement('dd');
                dd.appendChild(statusNode(entry[1]));
                dl.appendChild(dd);
            } else {
                dl.appendChild(text('dd', entry[1]));
            }
        });
        node.appendChild(dl);
    }

    function renderScores(scores) {
        var container = document.getElementById('scoreGrid');
        clear(container);
        [
            ['Organization', scores.organizationReadiness],
            ['Data Quality', scores.dataQuality],
            ['Security', scores.security],
            ['Performance', scores.performance],
            ['Compliance', scores.compliance],
            ['Infrastructure', scores.infrastructure],
            ['Overall', scores.overallReadinessScore]
        ].forEach(function addScore(row) {
            var item = document.createElement('div');
            item.className = 'score-row';
            item.appendChild(text('b', String(row[1] || 0) + '%'));
            item.appendChild(text('span', row[0]));
            container.appendChild(item);
        });
    }

    function activeRequest(request) {
        return !!request && ['PENDING_REVIEW', 'PILOT_ACTIVE'].includes(request.status);
    }

    function render(dashboard, request) {
        latestDashboard = dashboard;
        latestRequest = request || null;
        document.getElementById('statusLine').textContent = 'Status: '
            + String(dashboard.certificationStatus || 'NOT_VALIDATED').replace(/_/g, ' ')
            + ' | Tenant: ' + dashboard.tenantSlug;
        document.getElementById('approveBtn').disabled = dashboard.certificationStatus !== 'READY_FOR_APPROVAL'
            || activeRequest(request);
        renderMetrics(dashboard);
        renderTable('checklistTable', [
            { label: 'Check', key: 'item' },
            { label: 'Status', render: function renderStatus(row) { return statusNode(row.status); } },
            { label: 'Score', render: function renderScore(row) { return String(row.score) + '%'; } }
        ], dashboard.checklist);
        renderTable('resultsTable', [
            { label: 'Domain', key: 'domain' },
            { label: 'Status', render: function renderStatus(row) { return statusNode(row.status); } },
            { label: 'Score', render: function renderScore(row) { return String(row.score) + '%'; } },
            { label: 'Failed', key: 'failedCount' }
        ], dashboard.validationResults);
        renderTable('riskTable', [
            { label: 'Domain', key: 'domain' },
            { label: 'Severity', render: function renderSeverity(row) { return statusNode(row.severity); } },
            { label: 'Issue', key: 'summary' },
            { label: 'Recommendation', key: 'recommendation' }
        ], dashboard.riskAnalysis?.risks || []);
        renderScores(dashboard.scorecards || {});
        renderHandoff(request);
        renderTable('historyTable', [
            { label: 'Run ID', key: 'runId' },
            { label: 'Status', render: function renderStatus(row) { return statusNode(row.status); } },
            { label: 'Score', render: function renderScore(row) { return String(row.readinessScore) + '%'; } },
            { label: 'Generated', key: 'generatedAt' }
        ], dashboard.validationHistory);
    }

    async function refresh() {
        var response = await global.CompanyReadinessOrchestrationService.generateDashboard();
        if (!response.success) {
            notice(response.message, true);
            return;
        }
        notice(response.readinessRequestWarning || '', !!response.readinessRequestWarning);
        render(response.dashboard, response.readinessRequest);
    }

    async function runValidation() {
        var button = document.getElementById('runBtn');
        notice('Validation in progress...', false);
        button.disabled = true;
        try {
            var response = await global.CompanyReadinessOrchestrationService.runValidation({ mode: 'FULL' });
            if (!response.success) {
                notice(response.message, true);
                return;
            }
            notice(response.validation.status === 'READY_FOR_APPROVAL'
                ? 'Validation passed. Submit the result for Platform Owner pilot review.'
                : 'Go-live is blocked. Resolve every required check and run validation again.',
            response.validation.status === 'BLOCKED');
            await refresh();
        } finally {
            button.disabled = false;
        }
    }

    async function submitForPilot() {
        if (!latestDashboard || latestDashboard.certificationStatus !== 'READY_FOR_APPROVAL'
            || activeRequest(latestRequest)) return;
        var run = latestDashboard.validationHistory?.[0];
        if (!run || !global.confirm('Submit this passing validation run for Platform Owner pilot review?')) return;
        var button = document.getElementById('approveBtn');
        button.disabled = true;
        try {
            var response = await global.CompanyReadinessOrchestrationService.submitForPilot({
                validationRunId: run.runId,
                reason: 'Company Owner submitted the organization for Platform Owner pilot review.'
            });
            notice(response.message, !response.success);
            await refresh();
        } finally {
            button.disabled = activeRequest(latestRequest)
                || latestDashboard?.certificationStatus !== 'READY_FOR_APPROVAL';
        }
    }

    function bindNavigation() {
        document.querySelectorAll('nav button').forEach(function bindButton(button) {
            button.addEventListener('click', function switchView() {
                document.querySelectorAll('nav button').forEach(function clearActive(node) { node.classList.remove('active'); });
                document.querySelectorAll('.view').forEach(function hideView(node) { node.classList.remove('active'); });
                button.classList.add('active');
                document.getElementById('view-' + button.dataset.view)?.classList.add('active');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', async function initialize() {
        var decision = await global.ArthAuthGuard.ready;
        if (!decision?.authorized) return;
        bindNavigation();
        document.getElementById('refreshBtn').addEventListener('click', refresh);
        document.getElementById('runBtn').addEventListener('click', runValidation);
        document.getElementById('approveBtn').addEventListener('click', submitForPilot);
        await refresh();
    });
}(window));
