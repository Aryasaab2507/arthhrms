# ArthHRMS Frontend Performance Audit

Date: 2026-07-25

## Scope

The audit covered all 37 HTML entry points and every script loaded by
`platform-control.html`. The implementation remained frontend-only. Authentication,
RBAC, Supabase configuration, database migrations, API contracts, invite handling,
password recovery, tenant isolation, and platform isolation were not changed.

## Root Cause

The unresponsive-page symptom was caused by deterministic synchronous work, not an
infinite loop.

Before this change, most Platform Control actions called `renderAll()`. That function
rendered the active panel and every hidden panel in one main-thread task. Its complete
render closure included:

| Baseline | Count |
| --- | ---: |
| Render functions | 142 |
| Service/report/validation calls | 1,889 |
| `innerHTML` replacements | 1,434 |
| `getElementById` lookups | 1,740 |
| Array maps | 349 |

The largest nested panels were Operational Monitoring and Audit. They synchronously
initialized 66 and 29 centers respectively, regardless of what the user opened.

## Additional Findings

- `platform-control.html` is approximately 2.1 MB and contains about 12,200 elements.
- The page references 160 local scripts totaling approximately 8.2 MB.
- A cold Node parse benchmark for the page scripts and inline program measured about
  152 ms. Browser download, compilation, style, layout, and device speed add further
  cost, so this is not a browser TTI measurement.
- No repeating timer exists in Platform Control.
- No MutationObserver or ResizeObserver exists in the Platform Control dependency set.
- No render-time business use of `localStorage` was found.
- Platform Owner tenant persistence is intentionally skipped, so panel rendering does
  not create repeated Supabase CRUD traffic. Authentication performs the expected
  initial session/user validation.
- Navigation search previously ran on every input event without debouncing.

## Implemented Changes

### Active-panel rendering

`renderAll()` now marks cached panels dirty and schedules only the active panel.
Previously rendered, unchanged panels are reused when revisited.

### Cooperative scheduling

Large panels are flattened into named render tasks. The scheduler yields to the browser
after a 12 ms work budget, supports cancellation when the user changes panels, and
records any task above 50 ms.

### Lazy initialization

Hidden Platform Control modules are no longer initialized at startup. Monitoring,
Security, and Audit summary renderers can defer their nested centers. Their centers are
initialized incrementally only when the parent panel is opened.

### Shared loading service

One shared service now owns:

- delayed loading overlay;
- top progress bar;
- button busy states and restoration;
- skeleton placeholders;
- success, warning, error, and information notifications;
- operation error cleanup;
- navigation progress;
- long-task collection;
- debouncing and browser yielding.

Production builds inject this service and its stylesheet exactly once into all 37 HTML
entry points.

## Before And After

| Work characteristic | Before | After |
| --- | ---: | ---: |
| Synchronous global render closure | 142 render functions | 0 direct render functions |
| Hidden panels rendered per action | All | None |
| Largest synchronous DOM-write unit | 1,434 replacements in the global path | 21 replacements in one measured task |
| Largest synchronous service-call unit | 1,889 calls in the global path | 25 calls in one measured task |
| Overview initialization | Part of global render | 21 cancellable tasks |
| Monitoring initialization | Part of global render | 67 cancellable tasks |
| Audit initialization | Part of global render | 30 cancellable tasks |
| Security initialization | Part of global render | 7 cancellable tasks |
| Browser yielding | None | Every 12 ms work budget |
| Search handling | Every keystroke | 160 ms debounce |
| Long-task evidence | None | Buffered PerformanceObserver plus task metrics |

These are measured code-path and static-work metrics. Authenticated browser timings
must be collected after deployment because no production credentials are stored in the
repository and the browser-control connection was unavailable during this audit.

## Runtime Verification

In Platform Control, run:

```js
window.getArthHRMSPlatformPerformance()
```

The result reports the active panel, render duration, long-task count, recent task
durations, loading operations, and degraded render sections. It contains no passwords,
tokens, salaries, or tenant business records.

## Remaining Bottlenecks

1. The 2.1 MB Platform Control document remains too large.
2. The 8.2 MB, 160-script startup payload remains a substantial first-load cost.
3. The page still contains hundreds of inline event handlers and relies on
   `unsafe-inline` in CSP.
4. Individual legacy report generators can still exceed 50 ms with large data. They
   are now isolated and observable, but not moved to workers because they depend on
   shared application state and changing that boundary would affect business logic.
5. The other large role dashboards should eventually receive page-specific render
   schedulers. They now receive the shared production loading and navigation layer,
   but their business rendering was intentionally not refactored in this change.

## Verification

- Full automated suite: 173 passed, 0 failed.
- Production build: 37 HTML entry points.
- Loading integration: 37 of 37 built pages, no duplicates.
- Deployment verification: passed, 37 HTML pages and 6 migrations.
- Production dependency audit: 0 vulnerabilities.
- Platform inline script compilation: passed.
- Duplicate Platform Control IDs: 0.

## Recommended Follow-up

The next performance release should externalize the 1.7 MB inline Platform Control
program, split services into panel bundles, load noncritical bundles on demand, and
replace inline handlers with delegated event commands. That work should be a separate
release because it changes asset and module boundaries even though it need not change
business behavior.
