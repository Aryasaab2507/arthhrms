const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');

function functionBody(name) {
    const marker = `function ${name}(`;
    const start = html.indexOf(marker);
    assert.ok(start >= 0, `${name} should exist`);
    const parametersOpen = html.indexOf('(', start);
    let parameterDepth = 0;
    let parametersClose = -1;
    for (let index = parametersOpen; index < html.length; index += 1) {
        if (html[index] === '(') parameterDepth += 1;
        if (html[index] === ')' && --parameterDepth === 0) {
            parametersClose = index;
            break;
        }
    }
    const open = html.indexOf('{', parametersClose);
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = open; index < html.length; index += 1) {
        const character = html[index];
        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (character === '\\') {
                escaped = true;
                continue;
            }
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'" || character === '`') {
            quote = character;
            continue;
        }
        if (character === '{') depth += 1;
        if (character === '}' && --depth === 0) return html.slice(open + 1, index);
    }
    throw new Error(`Unable to parse ${name}`);
}

assert.ok(html.includes('<script src="services/loadingService.js"></script>'));
assert.ok(html.includes('<link rel="stylesheet" href="styles/loading-system.css">'));

const renderAll = functionBody('renderAll');
assert.ok(renderAll.includes('markPlatformPanelsDirty()'));
assert.ok(renderAll.includes('schedulePlatformPanelRender('));
assert.ok(!/\brender(?:Overview|TenantGovernance|PlatformMonitoring|Audit)\s*\(/.test(renderAll),
    'renderAll must not synchronously redraw every platform center');

const showPanel = functionBody('showPanel');
assert.ok(showPanel.includes('schedulePlatformPanelRender('));
assert.ok(showPanel.includes('_activePlatformPanelId='));

const scheduler = functionBody('schedulePlatformPanelRender');
assert.ok(scheduler.includes('await (loading?.nextFrame?.()'));
assert.ok(scheduler.includes('yieldToBrowser'));
assert.ok(scheduler.includes('performance.now()-sliceStarted>=12'));
assert.ok(scheduler.includes('job.cancelled'));
assert.ok(scheduler.includes('taskErrors'));

for (const name of ['renderPlatformMonitoring', 'renderSecurityGovernance', 'renderAudit']) {
    const body = functionBody(name);
    assert.ok(body.includes('if(!options.deferCenters)'), `${name} should defer nested centers`);
}

const shell = functionBody('initializePlatformShell');
assert.ok(shell.includes('ArthLoadingService.debounce'));
assert.ok(shell.includes('installPlatformActionLoading()'));

const actionLoading = functionBody('installPlatformActionLoading');
assert.ok(actionLoading.includes("document.querySelectorAll('button[onclick]')"));
assert.ok(actionLoading.includes('ArthLoadingService.run'));
assert.ok(actionLoading.includes('__ARTHHRMS_PLATFORM_OPERATION_DEPTH__'));

assert.ok(html.includes('window.getArthHRMSPlatformPerformance=platformPerformanceSnapshot'));
assert.ok(html.includes("loading?.showSkeleton?.(panel,{rows:4})"));
assert.ok(html.includes("loading?.hideSkeleton?.(panel)"));

const directGlobalRenderPattern = /function renderAll\(\)\s*\{\s*refreshPlatformView\(\);\s*renderOverview\(\)/;
assert.ok(!directGlobalRenderPattern.test(html), 'legacy synchronous global render must not return');

console.log('platformControlPerformance.test.js passed');
