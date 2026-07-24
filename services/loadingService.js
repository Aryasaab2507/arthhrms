// Shared, non-blocking loading feedback for ArthHRMS browser surfaces.
(function (global) {
    'use strict';

    const DEFAULT_OVERLAY_DELAY_MS = 300;
    const DEFAULT_TOAST_DURATION_MS = 4200;
    const MAX_METRICS = 100;
    const activeOperations = new Map();
    const buttonStates = new WeakMap();
    const metrics = [];
    let sequence = 0;
    let installed = false;
    let longTaskObserver = null;
    let progressHideTimer = null;
    let navigationTrackingInstalled = false;

    function now() {
        return global.performance?.now?.() ?? Date.now();
    }

    function nextFrame() {
        return new Promise(resolve => {
            if (typeof global.requestAnimationFrame === 'function') {
                global.requestAnimationFrame(() => resolve());
                return;
            }
            global.setTimeout(resolve, 0);
        });
    }

    function yieldToBrowser() {
        if (global.scheduler?.yield) return global.scheduler.yield();
        return new Promise(resolve => global.setTimeout(resolve, 0));
    }

    function createElement(tagName, className, attributes = {}) {
        const element = global.document.createElement(tagName);
        if (className) element.className = className;
        Object.entries(attributes).forEach(([name, value]) => {
            if (value !== undefined && value !== null) element.setAttribute(name, String(value));
        });
        return element;
    }

    function ensureUi() {
        if (!global.document?.body) return null;
        let root = global.document.getElementById('arthLoadingSystem');
        if (root) return root;

        root = createElement('div', 'arth-loading-system', { id: 'arthLoadingSystem' });

        const progress = createElement('div', 'arth-loading-progress', {
            id: 'arthLoadingProgress',
            role: 'progressbar',
            'aria-label': 'Page activity',
            'aria-hidden': 'true',
            'aria-valuemin': '0',
            'aria-valuemax': '100'
        });
        progress.appendChild(createElement('div', 'arth-loading-progress-bar', {
            id: 'arthLoadingProgressBar'
        }));

        const overlay = createElement('div', 'arth-loading-overlay', {
            id: 'arthLoadingOverlay',
            'aria-hidden': 'true'
        });
        const dialog = createElement('div', 'arth-loading-dialog', {
            role: 'status',
            'aria-live': 'polite',
            'aria-atomic': 'true'
        });
        dialog.appendChild(createElement('span', 'arth-loading-spinner', { 'aria-hidden': 'true' }));
        const copy = createElement('div', 'arth-loading-copy');
        const title = createElement('strong', 'arth-loading-title', { id: 'arthLoadingTitle' });
        title.textContent = 'Loading...';
        const message = createElement('span', 'arth-loading-message', { id: 'arthLoadingMessage' });
        message.textContent = 'Please wait...';
        copy.appendChild(title);
        copy.appendChild(message);
        dialog.appendChild(copy);
        overlay.appendChild(dialog);

        const toasts = createElement('div', 'arth-toast-region', {
            id: 'arthToastRegion',
            'aria-live': 'polite',
            'aria-relevant': 'additions'
        });

        root.appendChild(progress);
        root.appendChild(overlay);
        root.appendChild(toasts);
        global.document.body.appendChild(root);
        return root;
    }

    function install() {
        if (installed) return true;
        if (!global.document?.body) return false;
        ensureUi();
        installed = true;
        observeLongTasks();
        installNavigationProgress();
        return true;
    }

    function installNavigationProgress() {
        if (navigationTrackingInstalled || !global.document?.addEventListener) return false;
        navigationTrackingInstalled = true;
        global.document.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = event.target?.closest?.('a[href]');
            if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
            const rawHref = String(anchor.getAttribute('href') || '').trim();
            if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) return;
            try {
                const target = new URL(rawHref, global.location?.href || 'http://localhost/');
                if (target.origin !== global.location?.origin) return;
                if (target.pathname === global.location?.pathname && target.search === global.location?.search) return;
                begin({
                    title: 'Loading page...',
                    message: 'Opening the requested workspace...',
                    progress: 18,
                    overlayDelayMs: 500
                });
            } catch (_error) {}
        }, true);
        global.addEventListener?.('pageshow', () => {
            Array.from(activeOperations.values()).forEach(operation => {
                finish(operation.id, { label: 'Page navigation', status: 'completed' });
            });
        });
        return true;
    }

    function progressElements() {
        ensureUi();
        return {
            host: global.document?.getElementById('arthLoadingProgress') || null,
            bar: global.document?.getElementById('arthLoadingProgressBar') || null
        };
    }

    function setProgress(value, visible = true) {
        const { host, bar } = progressElements();
        if (!host || !bar) return;
        const normalized = Math.max(0, Math.min(100, Number(value) || 0));
        if (progressHideTimer) {
            global.clearTimeout(progressHideTimer);
            progressHideTimer = null;
        }
        host.classList.toggle('is-visible', !!visible);
        host.setAttribute('aria-hidden', visible ? 'false' : 'true');
        host.setAttribute('aria-valuenow', String(Math.round(normalized)));
        bar.style.transform = `scaleX(${normalized / 100})`;
    }

    function completeProgress() {
        setProgress(100, true);
        progressHideTimer = global.setTimeout(() => {
            setProgress(0, false);
        }, 180);
    }

    function setOverlay(visible, operation = null) {
        ensureUi();
        const overlay = global.document?.getElementById('arthLoadingOverlay');
        if (!overlay) return;
        if (operation) {
            const title = global.document.getElementById('arthLoadingTitle');
            const message = global.document.getElementById('arthLoadingMessage');
            if (title) title.textContent = operation.title || 'Loading...';
            if (message) message.textContent = operation.message || 'Please wait...';
        }
        overlay.classList.toggle('is-visible', !!visible);
        overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
        global.document.body.classList.toggle('arth-loading-overlay-open', !!visible);
    }

    function setButtonLoading(button, loading, label) {
        if (!button || typeof button.setAttribute !== 'function') return;
        if (loading) {
            const current = buttonStates.get(button);
            if (current) {
                current.count += 1;
                return;
            }
            const state = {
                count: 1,
                disabled: !!button.disabled,
                nodes: Array.from(button.childNodes || []).map(node => node.cloneNode(true))
            };
            buttonStates.set(button, state);
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.classList.add('arth-button-loading');
            const spinner = createElement('span', 'arth-button-spinner', { 'aria-hidden': 'true' });
            const text = createElement('span', 'arth-button-loading-label');
            text.textContent = label || 'Working...';
            button.replaceChildren(spinner, text);
            return;
        }
        const state = buttonStates.get(button);
        if (!state) return;
        state.count -= 1;
        if (state.count > 0) return;
        button.replaceChildren(...state.nodes.map(node => node.cloneNode(true)));
        button.disabled = state.disabled;
        button.removeAttribute('aria-busy');
        button.classList.remove('arth-button-loading');
        buttonStates.delete(button);
    }

    function operationFrom(tokenOrId) {
        const id = typeof tokenOrId === 'string' ? tokenOrId : tokenOrId?.id;
        return id ? activeOperations.get(id) || null : null;
    }

    function begin(options = {}) {
        install();
        const id = `loading-${Date.now()}-${++sequence}`;
        const operation = {
            id,
            title: String(options.title || 'Loading...'),
            message: String(options.message || 'Please wait...'),
            progress: Math.max(1, Math.min(95, Number(options.progress) || 12)),
            button: options.button || null,
            buttonLabel: String(options.buttonLabel || 'Working...'),
            startedAt: now(),
            overlayVisible: options.overlay === true,
            overlayDelayMs: Number.isFinite(Number(options.overlayDelayMs))
                ? Math.max(0, Number(options.overlayDelayMs))
                : DEFAULT_OVERLAY_DELAY_MS,
            overlayTimer: null,
            completed: false
        };
        activeOperations.set(id, operation);
        setProgress(operation.progress, true);
        setButtonLoading(operation.button, true, operation.buttonLabel);

        if (operation.overlayVisible) {
            setOverlay(true, operation);
        } else {
            operation.overlayTimer = global.setTimeout(() => {
                if (!operation.completed && activeOperations.has(id)) {
                    operation.overlayVisible = true;
                    setOverlay(true, operation);
                }
            }, operation.overlayDelayMs);
        }
        return Object.freeze({ id });
    }

    function update(tokenOrId, options = {}) {
        const operation = operationFrom(tokenOrId);
        if (!operation || operation.completed) return false;
        if (options.title) operation.title = String(options.title);
        if (options.message) operation.message = String(options.message);
        if (Number.isFinite(Number(options.progress))) {
            operation.progress = Math.max(1, Math.min(99, Number(options.progress)));
            setProgress(operation.progress, true);
        }
        if (operation.overlayVisible) setOverlay(true, operation);
        return true;
    }

    function finish(tokenOrId, options = {}) {
        const operation = operationFrom(tokenOrId);
        if (!operation || operation.completed) return false;
        operation.completed = true;
        if (operation.overlayTimer) global.clearTimeout(operation.overlayTimer);
        activeOperations.delete(operation.id);
        setButtonLoading(operation.button, false);
        metrics.push(Object.freeze({
            label: options.label || operation.title,
            durationMs: Math.round((now() - operation.startedAt) * 100) / 100,
            status: options.status || 'completed',
            timestamp: new Date().toISOString()
        }));
        if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);

        const remaining = Array.from(activeOperations.values());
        if (remaining.length) {
            const latest = remaining[remaining.length - 1];
            setProgress(Math.max(...remaining.map(item => item.progress)), true);
            if (remaining.some(item => item.overlayVisible)) setOverlay(true, latest);
        } else {
            setOverlay(false);
            completeProgress();
        }
        return true;
    }

    function fail(tokenOrId, error, message) {
        const operation = operationFrom(tokenOrId);
        const safeMessage = String(message || error?.message || 'The operation could not be completed.');
        const finished = finish(tokenOrId, { status: 'failed' });
        notify('error', safeMessage, {
            title: operation?.title ? `${operation.title} failed` : 'Operation failed'
        });
        return finished;
    }

    async function run(task, options = {}) {
        if (typeof task !== 'function') throw new TypeError('Loading task must be a function.');
        const token = begin(options);
        try {
            if (options.paintBeforeRun !== false) await nextFrame();
            const result = await task({
                token,
                update: values => update(token, values),
                yield: yieldToBrowser
            });
            finish(token, { label: options.metricLabel || options.title });
            if (options.successMessage) notify('success', options.successMessage);
            return result;
        } catch (error) {
            fail(token, error, options.errorMessage);
            throw error;
        }
    }

    function notify(type, message, options = {}) {
        install();
        const region = global.document?.getElementById('arthToastRegion');
        if (!region) return null;
        const normalizedType = ['success', 'warning', 'error', 'info'].includes(type) ? type : 'info';
        const toast = createElement('div', `arth-toast arth-toast-${normalizedType}`, {
            role: normalizedType === 'error' ? 'alert' : 'status'
        });
        const indicator = createElement('span', 'arth-toast-indicator', { 'aria-hidden': 'true' });
        const copy = createElement('div', 'arth-toast-copy');
        const title = createElement('strong', 'arth-toast-title');
        title.textContent = String(options.title || normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1));
        const body = createElement('span', 'arth-toast-message');
        body.textContent = String(message || '');
        const close = createElement('button', 'arth-toast-close', {
            type: 'button',
            'aria-label': 'Dismiss notification'
        });
        close.textContent = 'x';
        copy.appendChild(title);
        copy.appendChild(body);
        toast.appendChild(indicator);
        toast.appendChild(copy);
        toast.appendChild(close);
        region.appendChild(toast);
        global.requestAnimationFrame?.(() => toast.classList.add('is-visible'));

        let timer = null;
        const remove = () => {
            if (timer) global.clearTimeout(timer);
            toast.classList.remove('is-visible');
            global.setTimeout(() => toast.remove(), 180);
        };
        close.addEventListener('click', remove, { once: true });
        timer = global.setTimeout(remove, Math.max(1200, Number(options.durationMs) || DEFAULT_TOAST_DURATION_MS));
        return toast;
    }

    function showSkeleton(container, options = {}) {
        if (!container || typeof container.appendChild !== 'function') return null;
        hideSkeleton(container);
        container.classList.add('arth-skeleton-host');
        container.setAttribute('aria-busy', 'true');
        const skeleton = createElement('div', 'arth-skeleton', {
            'data-arth-skeleton': 'true',
            'aria-hidden': 'true'
        });
        const rows = Math.max(2, Math.min(8, Number(options.rows) || 4));
        for (let index = 0; index < rows; index += 1) {
            skeleton.appendChild(createElement('span', index === 0 ? 'arth-skeleton-line is-title' : 'arth-skeleton-line'));
        }
        container.prepend(skeleton);
        return skeleton;
    }

    function hideSkeleton(container) {
        if (!container) return;
        container.querySelector?.('[data-arth-skeleton="true"]')?.remove();
        container.classList?.remove('arth-skeleton-host');
        container.removeAttribute?.('aria-busy');
    }

    function debounce(callback, waitMs = 160) {
        let timer = null;
        function debounced(...args) {
            if (timer) global.clearTimeout(timer);
            timer = global.setTimeout(() => {
                timer = null;
                callback.apply(this, args);
            }, Math.max(0, Number(waitMs) || 0));
        }
        debounced.cancel = () => {
            if (timer) global.clearTimeout(timer);
            timer = null;
        };
        return debounced;
    }

    function observeLongTasks() {
        if (longTaskObserver || typeof global.PerformanceObserver !== 'function') return false;
        try {
            const supported = global.PerformanceObserver.supportedEntryTypes || [];
            if (!supported.includes('longtask')) return false;
            longTaskObserver = new global.PerformanceObserver(list => {
                list.getEntries().forEach(entry => {
                    metrics.push(Object.freeze({
                        label: entry.name || 'Main-thread long task',
                        durationMs: Math.round(Number(entry.duration || 0) * 100) / 100,
                        status: 'long-task',
                        timestamp: new Date().toISOString()
                    }));
                });
                if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
            });
            longTaskObserver.observe({ type: 'longtask', buffered: true });
            return true;
        } catch (_error) {
            longTaskObserver = null;
            return false;
        }
    }

    function getMetrics() {
        return Object.freeze(metrics.slice());
    }

    const service = Object.freeze({
        install,
        begin,
        update,
        finish,
        fail,
        run,
        notify,
        showSkeleton,
        hideSkeleton,
        debounce,
        yieldToBrowser,
        nextFrame,
        observeLongTasks,
        installNavigationProgress,
        getMetrics,
        getActiveCount() {
            return activeOperations.size;
        }
    });

    global.ArthLoadingService = service;
    if (!global.LoadingService) global.LoadingService = service;

    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
})(typeof window !== 'undefined' ? window : globalThis);
