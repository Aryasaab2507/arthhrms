const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'loadingService.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'loading-system.css'), 'utf8');
const buildSource = fs.readFileSync(path.join(root, 'scripts', 'build.mjs'), 'utf8');

const context = {
    console,
    Date,
    Map,
    WeakMap,
    Object,
    Array,
    Math,
    Number,
    String,
    TypeError,
    Promise,
    setTimeout,
    clearTimeout,
    performance: {
        now: (() => {
            let value = 0;
            return () => {
                value += 5;
                return value;
            };
        })()
    }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'loadingService.js' });

(async () => {
    const service = context.ArthLoadingService;
    assert.ok(service, 'shared loading service should be exported');
    assert.strictEqual(context.LoadingService, service, 'compatibility alias should use the shared service');
    assert.strictEqual(typeof service.run, 'function');
    assert.strictEqual(typeof service.showSkeleton, 'function');
    assert.strictEqual(typeof service.notify, 'function');
    assert.strictEqual(typeof service.yieldToBrowser, 'function');
    assert.strictEqual(typeof service.installNavigationProgress, 'function');

    const token = service.begin({ title: 'Saving...', overlayDelayMs: 1000 });
    assert.strictEqual(service.getActiveCount(), 1);
    assert.strictEqual(service.update(token, { message: 'Validating...', progress: 55 }), true);
    assert.strictEqual(service.finish(token), true);
    assert.strictEqual(service.getActiveCount(), 0);

    const result = await service.run(async ({ update, yield: yieldControl }) => {
        update({ message: 'Working...', progress: 60 });
        await yieldControl();
        return 'ok';
    }, { title: 'Processing...', paintBeforeRun: false, overlayDelayMs: 1000 });
    assert.strictEqual(result, 'ok');
    assert.strictEqual(service.getActiveCount(), 0);

    let failed = false;
    try {
        await service.run(() => {
            throw new Error('expected failure');
        }, { title: 'Failing...', paintBeforeRun: false, overlayDelayMs: 1000 });
    } catch (error) {
        failed = error.message === 'expected failure';
    }
    assert.strictEqual(failed, true, 'run should preserve operation failures');
    assert.strictEqual(service.getActiveCount(), 0, 'failed operations must restore loading state');

    let debouncedCalls = 0;
    const debounced = service.debounce(() => {
        debouncedCalls += 1;
    }, 5);
    debounced();
    debounced();
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.strictEqual(debouncedCalls, 1, 'debounce should collapse repeated calls');
    debounced();
    debounced.cancel();
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.strictEqual(debouncedCalls, 1, 'cancel should prevent stale search updates');

    const metrics = service.getMetrics();
    assert.ok(metrics.some(row => row.status === 'completed'));
    assert.ok(metrics.some(row => row.status === 'failed'));
    assert.ok(!source.includes('.innerHTML'), 'loading UI should use safe DOM APIs');
    assert.ok(!source.includes('MutationObserver'), 'loading service should not install mutation observers');
    assert.ok(css.includes('.arth-loading-overlay'));
    assert.ok(css.includes('.arth-loading-progress'));
    assert.ok(css.includes('.arth-skeleton'));
    assert.ok(css.includes('.arth-toast'));
    assert.ok(buildSource.includes('services/loadingService.js'));
    assert.ok(buildSource.includes('styles/loading-system.css'));

    console.log('loadingService.test.js passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
