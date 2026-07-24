# ArthHRMS

ArthHRMS is a multi-tenant human resources management system for controlled employee administration, workforce operations, governance, and reporting. It provides separate operating surfaces for platform administrators, tenant administrators, HR teams, managers, and employees while maintaining tenant-scoped data access and auditable administrative activity.

The application is designed for commercial SaaS deployment with authenticated Supabase persistence, role-based authorization, database Row Level Security (RLS), private document storage, deterministic builds, and container-based delivery. Production use requires a configured Supabase project, applied migrations, external monitoring, verified backups, and environment-specific release validation.

## Overview

ArthHRMS is an enterprise HRMS and multi-role platform for managing organization and employee processes from a shared SaaS architecture. Browser clients use authenticated backend services instead of trusted client-side identity or business-data storage. Security controls are applied through page guards, RBAC services, tenant-aware persistence, Supabase Auth, PostgreSQL RLS, Storage policies, and audit records.

The repository contains the application pages, domain services, database migrations, Supabase Edge Functions, automated tests, production build tooling, deployment configuration, and operational runbooks required to prepare and validate a release. A successful source build is not, by itself, production certification; infrastructure, security, recovery, and tenant-isolation checks must also pass in the target environment.

## Core Modules

### HR and Workforce Operations

- **Employee Management** - Employee records, lifecycle operations, organization relationships, and employee imports.
- **Attendance** - Attendance records, policies, working calendars, validation, and operational reporting.
- **Leave** - Leave policies, eligibility, approvals, accrual configuration, and balance-related workflows.
- **Payroll** - Payroll structures, components, rules, simulations, governance, and reporting.
- **Recruitment** - Recruitment workflow and candidate-related operations.
- **Training** - Training administration and employee learning records.
- **Performance** - Performance cycles, reviews, objectives, and scorecards.
- **Documents** - Employee and organization document governance with private storage controls.
- **Assets** - Assignment and lifecycle tracking for organization assets.
- **Reports** - Operational, compliance, and management reporting.
- **Analytics** - Tenant-scoped workforce and platform analytics.
- **Notifications** - In-application and provider-backed notification workflows.
- **Audit Logs** - Traceability for security, configuration, and business operations.

### Access and Administration

- **Role Based Access** - Route, service, action, and data authorization using fail-closed policies.
- **Platform Owner** - Platform-level governance and tenant administration.
- **Super Admin** - Authorized organization and system administration.
- **HR** - Employee and HR process administration within an assigned tenant.
- **Manager** - Team visibility, approvals, and manager workflows.
- **Employee** - Employee self-service access to permitted personal functions.

## Technology Stack

### Frontend

- HTML5 multi-page application
- CSS and browser-native JavaScript
- Shared security, authentication, persistence, and domain services
- Chart.js for supported visualizations
- SheetJS for supported spreadsheet import and export operations

### Backend

- Supabase managed backend services
- Supabase Edge Functions running on Deno
- Tenant-aware service adapters and authenticated data access

### Database

- PostgreSQL through Supabase
- Versioned SQL migrations
- Tenant and organization ownership fields
- Row Level Security policies, constraints, indexes, and ownership guards

### Authentication

- Supabase Auth
- Verified server-issued sessions
- Trusted role claims in authenticated application metadata
- Shared authentication and route guards

### Storage

- Supabase Storage
- Private buckets and authenticated object policies
- Tenant-scoped object paths and upload validation

### Testing

- Node.js test runner and service-level regression tests
- Static authentication, RBAC, tenant-isolation, migration, and deployment checks
- Deno checks and linting for Edge Functions
- Deterministic build and deployment verification scripts

### Deployment

- Node.js build stage
- Nginx production runtime
- Docker image with pinned base-image digests and an unprivileged runtime user
- GitHub Actions continuous integration and protected release workflows
- Runtime configuration generated from environment variables

## Folder Structure

```text
ArthHRMS/
|-- .github/workflows/          Continuous integration and release workflows
|-- context/                    Architecture, security, deployment, recovery, and operations documentation
|-- deploy/                     Nginx, container entrypoint, and production environment templates
|-- scripts/                    Build, runtime configuration, test, and deployment verification scripts
|-- services/                   Authentication, security, persistence, domain, governance, and analytics services
|-- sql/                        Supporting SQL assets and database validation scripts
|-- styles/                     Shared application styles
|-- supabase/
|   |-- functions/              Supabase Edge Functions and Deno configuration
|   `-- migrations/             Ordered PostgreSQL schema, RLS, policy, and storage migrations
|-- tests/                      Automated regression, security, governance, and deployment tests
|-- utils/                      Shared browser utilities and development verification helpers
|-- *.html                      Login, role portals, administration centers, and operational pages
|-- db.js                       Browser-side data facade and compatibility integration
|-- Dockerfile                  Deterministic production container build
|-- package.json                Node.js scripts, versions, and project metadata
|-- package-lock.json           Reproducible npm dependency lock
|-- .env.example                Canonical environment-variable template
|-- SUPABASE_EXECUTION_ORDER.md Database and Supabase deployment sequence
`-- LICENSE                     Proprietary software terms
```

`dist/` is generated by the build and must not be edited or committed as source. `node_modules/`, local environment files, logs, caches, uploads, and test artifacts are excluded through `.gitignore`.

## Installation

### Prerequisites

- Node.js `24.17.0`
- npm `11.13.0`
- Git
- Python 3 or another static HTTP server for local browser development
- Docker for container build and runtime verification
- Deno for local Supabase Edge Function validation
- Supabase CLI and access to a non-production Supabase project for database setup

### Clone

```bash
git clone <private-repository-url>
cd ArthHRMS
```

### Install

Install the exact dependency versions recorded in `package-lock.json`:

```bash
npm ci
```

### Environment Setup

Create an ignored local environment file from the committed template:

```bash
cp .env.example .env.local
```

On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Replace every placeholder locally. Do not commit populated environment files, service-role keys, database credentials, provider credentials, or private certificates.

### Run Locally

Build the static site and generate its ignored browser runtime configuration from `.env.local`:

```bash
npm run build:local
```

Serve the generated `dist` directory for local development:

```bash
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000/ArthHRMS.html`. If `AUTH_INVITE_REDIRECT_URL` uses a different local port, run the static server on that port or update the ignored local value and the Edge Function origin allowlist together. Protected pages require a valid Supabase Auth session and configured runtime values.

## Environment Variables

`.env.example` is the canonical inventory. Client-safe configuration and server-only secrets must remain separated.

| Variable | Scope | Purpose | Example placeholder |
|---|---|---|---|
| `APP_ENV` | Runtime | Environment identifier | `<environment-name>` |
| `PRODUCTION_MODE` | Runtime | Enables production runtime behavior | `<true-or-false>` |
| `PILOT_MODE` | Runtime | Enables or disables controlled pilot behavior | `<true-or-false>` |
| `DEVELOPMENT_MODE` | Runtime | Enables or disables development-only behavior | `<true-or-false>` |
| `DEMO_MODE` | Runtime | Enables or disables demo behavior | `<true-or-false>` |
| `SUPABASE_URL` | Client-safe | Supabase project URL | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Client-safe | Preferred public Supabase client key | `<supabase-publishable-key>` |
| `SUPABASE_ANON_KEY` | Client-safe fallback | Legacy public client key when required | `<supabase-anon-key>` |
| `SUPABASE_TIMEOUT_MS` | Client-safe | Supabase request timeout in milliseconds | `<timeout-ms>` |
| `USE_SUPABASE_EMPLOYEES` | Runtime | Legacy employee adapter switch | `<true-or-false>` |
| `USE_SUPABASE_ATTENDANCE` | Runtime | Legacy attendance adapter switch | `<true-or-false>` |
| `USE_SUPABASE_LEAVE` | Runtime | Legacy leave adapter switch | `<true-or-false>` |
| `USE_SUPABASE_EXPENSES` | Runtime | Legacy expense adapter switch | `<true-or-false>` |
| `USE_SUPABASE_PAYROLL` | Runtime | Legacy payroll adapter switch | `<true-or-false>` |
| `USE_SUPABASE_AUTH` | Runtime | Supabase authentication switch | `<true-or-false>` |
| `USE_SUPABASE_PASSWORD_RECOVERY` | Runtime | Supabase password recovery switch | `<true-or-false>` |
| `USE_SUPABASE_IMPORTS` | Runtime | Legacy import adapter switch | `<true-or-false>` |
| `USE_SUPABASE_STORAGE` | Runtime | Supabase Storage switch | `<true-or-false>` |
| `USE_SUPABASE_INVITES` | Runtime | Supabase invitation flow switch | `<true-or-false>` |
| `USE_SUPABASE_PERSISTENCE` | Runtime | Authenticated business persistence switch | `<true-or-false>` |
| `INVITE_USER_ENDPOINT` | Client-safe | Deployed invitation Edge Function URL | `https://<project-ref>.supabase.co/functions/v1/invite-user` |
| `AUTH_INVITE_REDIRECT_URL` | Client-safe | Approved invitation callback URL | `https://<application-host>/auth-callback.html` |
| `REQUIRE_APP_METADATA_ROLE` | Runtime | Requires a trusted role claim | `<true-or-false>` |
| `REQUIRE_EMAIL_VERIFIED` | Runtime | Requires verified email identities | `<true-or-false>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Privileged Edge Function credential | `<server-only-service-role-key>` |
| `ALLOWED_ORIGINS` | Server-only | Exact browser origins accepted by server functions | `https://<application-host>` |

Production runtime generation enables `USE_SUPABASE_AUTH`, `USE_SUPABASE_PASSWORD_RECOVERY`, `USE_SUPABASE_STORAGE`, `USE_SUPABASE_INVITES`, and `USE_SUPABASE_PERSISTENCE` by default. These variables are optional overrides, not required deployment secrets. Local runtime generation keeps them disabled unless explicitly enabled. Keep legacy module-specific adapters disabled unless a reviewed migration plan explicitly requires them. Store `SUPABASE_SERVICE_ROLE_KEY` only in Supabase Edge Function secrets; it must never be exposed to browser code or generated runtime configuration.

## Production Deployment

1. Provision separate Supabase projects for development, staging, and production.
2. Configure authentication providers, approved redirect URLs, Storage buckets, and server-only Edge Function secrets.
3. Link the Supabase CLI to staging and apply migrations in the order documented by `SUPABASE_EXECUTION_ORDER.md`.
4. Run database validation scripts, authenticated role tests, tenant-isolation tests, and Supabase security and performance advisors.
5. Run the complete local release gate with `npm run ci`.
6. Build the Docker image from a clean checkout and scan the resulting image.
7. Configure `SUPABASE_URL` and one public browser key using `deploy/production.env.example`; hosted platforms derive secure production feature defaults automatically.
8. Deploy behind HTTPS-capable ingress, configure DNS and certificates, and verify security headers.
9. Connect durable logs, metrics, alerts, error reporting, and incident response procedures.
10. Verify database and Storage backup restoration before enabling tenant access.
11. Execute authenticated smoke tests for every supported role and record release approval evidence.

Build and run the production container locally:

```bash
docker build --pull -t arthhrms:<version> .
docker run --rm -p 8080:8080 --env-file deploy/production.env arthhrms:<version>
```

The container exposes port `8080` and provides `/healthz` for health checks. TLS termination is expected at the ingress or load-balancer layer. The release workflow publishes an immutable container artifact; deployment to a specific hosting platform remains an operator-controlled action.

## Security

- **Authentication** - Protected pages require a validated Supabase session. Client-provided role values are not treated as authoritative identity.
- **RBAC** - Route and service operations evaluate explicit role policies for Platform Owner, Super Admin, HR, Manager, and Employee access.
- **Tenant Isolation** - Business operations require tenant context and fail closed when tenant ownership cannot be established.
- **Supabase RLS** - Exposed PostgreSQL tables use enabled and forced RLS policies, authenticated grants, and tenant-scoped predicates. Policies must be tested against the deployed database before release.
- **Audit Logs** - Security, configuration, and governed business operations produce audit evidence through the application audit services.
- **Encryption** - Production endpoints must use TLS. Database, backup, and Storage encryption depend on the configured Supabase and infrastructure controls and must be validated during deployment.
- **Secret Handling** - Service-role keys and provider credentials are server-only. Public client keys do not replace RLS or authorization checks.
- **Browser Security** - Production delivery applies Content Security Policy and related response headers through the deployment configuration.

Security controls must be validated in the target environment. Passing static or mocked tests does not replace authenticated penetration testing, Supabase advisor review, cross-tenant verification, or restore testing.

## Testing

Run the complete automated suite:

```bash
npm test
```

At the time this README was prepared, the automated runner contained **167 tests**, covering domain services, authentication hardening, RBAC, tenant isolation, persistence behavior, governance, imports, analytics, and deployment controls.

Run the deterministic build and deployment verifier:

```bash
npm run build
npm run verify:deployment
```

Run the same combined release gate used by continuous integration:

```bash
npm run ci
```

Validate the invitation Edge Function separately:

```bash
deno check --frozen --config supabase/functions/invite-user/deno.json supabase/functions/invite-user/index.ts
deno lint --config supabase/functions/invite-user/deno.json supabase/functions/invite-user/index.ts
```

Before production promotion, supplement automated tests with live Supabase RLS tests, cross-role and cross-tenant integration tests, browser validation, representative employee imports, performance tests, backup restoration, and operational smoke tests.

## Roadmap

- Complete staging and production Supabase environment certification.
- Establish measured performance baselines for representative tenant sizes and concurrent workloads.
- Integrate durable application monitoring, tracing, alerting, and error reporting.
- Automate recurring database and Storage recovery drills.
- Expand browser, accessibility, mobile, and authenticated end-to-end coverage.
- Maintain versioned security, privacy, compliance, and operational readiness evidence.

Roadmap work is subject to product governance, security review, backward-compatibility requirements, and tenant-isolation validation.

## License

**Proprietary Software**

Copyright © ArthHRMS

All Rights Reserved.

Use, copying, modification, distribution, or disclosure is prohibited except where expressly authorized by the copyright owner in a written agreement. See `LICENSE` for the complete terms.
