-- Enterprise Error Handling Framework
-- Error log storage model for governed, immutable platform error records.

create table if not exists error_logs (
    id text primary key,
    tenant_id text not null,
    user_id text,
    timestamp timestamptz not null default now(),
    module text not null,
    action text not null,
    endpoint text,
    error_code text not null check (
        error_code in (
            'VALIDATION_ERROR',
            'AUTHENTICATION_ERROR',
            'AUTHORIZATION_ERROR',
            'RESOURCE_NOT_FOUND',
            'CONFLICT_ERROR',
            'RATE_LIMIT_ERROR',
            'NETWORK_ERROR',
            'FILE_UPLOAD_ERROR',
            'SERVER_ERROR',
            'UNKNOWN_ERROR'
        )
    ),
    severity text not null check (
        severity in ('INFO', 'WARNING', 'ERROR', 'CRITICAL', 'FATAL')
    ),
    message text not null,
    stack_trace text,
    browser text,
    device text,
    metadata jsonb not null default '{}'::jsonb,
    immutable boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists idx_error_logs_tenant_timestamp
    on error_logs (tenant_id, timestamp desc);

create index if not exists idx_error_logs_tenant_code
    on error_logs (tenant_id, error_code);

create index if not exists idx_error_logs_tenant_severity
    on error_logs (tenant_id, severity);
