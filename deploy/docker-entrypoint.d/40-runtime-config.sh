#!/bin/sh
set -eu

: "${APP_ENV:=production}"
: "${PRODUCTION_MODE:=true}"
: "${PILOT_MODE:=false}"
: "${DEVELOPMENT_MODE:=false}"
: "${DEMO_MODE:=false}"
: "${SUPABASE_TIMEOUT_MS:=10000}"
: "${REQUIRE_APP_METADATA_ROLE:=true}"
: "${REQUIRE_EMAIL_VERIFIED:=true}"
: "${USE_SUPABASE_EMPLOYEES:=false}"
: "${USE_SUPABASE_ATTENDANCE:=false}"
: "${USE_SUPABASE_LEAVE:=false}"
: "${USE_SUPABASE_EXPENSES:=false}"
: "${USE_SUPABASE_PAYROLL:=false}"
: "${USE_SUPABASE_IMPORTS:=false}"
: "${USE_SUPABASE_AUTH:=true}"
: "${USE_SUPABASE_PASSWORD_RECOVERY:=true}"
: "${USE_SUPABASE_STORAGE:=true}"
: "${USE_SUPABASE_INVITES:=true}"
: "${USE_SUPABASE_PERSISTENCE:=true}"

: "${SUPABASE_URL:?SUPABASE_URL is required}"
case "$SUPABASE_URL" in
  https://*) ;;
  *) echo "SUPABASE_URL must use HTTPS" >&2; exit 1 ;;
esac
case "$SUPABASE_URL" in
  *[!A-Za-z0-9:/._~-]*) echo "SUPABASE_URL contains invalid characters" >&2; exit 1 ;;
esac

ARTHHRMS_PUBLIC_SUPABASE_KEY="${SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY:-}}"
if [ -z "$ARTHHRMS_PUBLIC_SUPABASE_KEY" ]; then
  echo "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required" >&2
  exit 1
fi
case "$ARTHHRMS_PUBLIC_SUPABASE_KEY" in
  *[!A-Za-z0-9._-]*) echo "The Supabase browser key contains invalid characters" >&2; exit 1 ;;
esac
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ "$ARTHHRMS_PUBLIC_SUPABASE_KEY" = "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Refusing to expose SUPABASE_SERVICE_ROLE_KEY to the browser" >&2
  exit 1
fi

for name in \
  PRODUCTION_MODE PILOT_MODE DEVELOPMENT_MODE DEMO_MODE \
  REQUIRE_APP_METADATA_ROLE REQUIRE_EMAIL_VERIFIED \
  USE_SUPABASE_EMPLOYEES USE_SUPABASE_ATTENDANCE USE_SUPABASE_LEAVE \
  USE_SUPABASE_EXPENSES USE_SUPABASE_PAYROLL USE_SUPABASE_IMPORTS \
  USE_SUPABASE_AUTH USE_SUPABASE_PASSWORD_RECOVERY USE_SUPABASE_STORAGE \
  USE_SUPABASE_INVITES USE_SUPABASE_PERSISTENCE
do
  eval "value=\${$name}"
  case "$value" in
    true|false) ;;
    *) echo "$name must be true or false" >&2; exit 1 ;;
  esac
done
if [ "$APP_ENV" != "production" ] || [ "$PRODUCTION_MODE" != "true" ] || \
   [ "$PILOT_MODE" != "false" ] || [ "$DEVELOPMENT_MODE" != "false" ] || [ "$DEMO_MODE" != "false" ]; then
  echo "Production runtime mode flags are malformed or contradictory" >&2
  exit 1
fi
if [ "$USE_SUPABASE_PERSISTENCE" = "true" ]; then
  for name in USE_SUPABASE_EMPLOYEES USE_SUPABASE_ATTENDANCE USE_SUPABASE_LEAVE USE_SUPABASE_EXPENSES USE_SUPABASE_PAYROLL USE_SUPABASE_IMPORTS
  do
    eval "value=\${$name}"
    if [ "$value" = "true" ]; then
      echo "$name cannot be enabled with canonical Supabase persistence" >&2
      exit 1
    fi
  done
fi
case "$SUPABASE_TIMEOUT_MS" in
  ''|*[!0-9]*) echo "SUPABASE_TIMEOUT_MS must be a number" >&2; exit 1 ;;
esac
if [ "$SUPABASE_TIMEOUT_MS" -lt 1000 ] || [ "$SUPABASE_TIMEOUT_MS" -gt 60000 ]; then
  echo "SUPABASE_TIMEOUT_MS must be between 1000 and 60000" >&2
  exit 1
fi

if [ "$USE_SUPABASE_INVITES" = "true" ]; then
  INVITE_USER_ENDPOINT="${INVITE_USER_ENDPOINT:-${SUPABASE_URL%/}/functions/v1/invite-user}"
else
  INVITE_USER_ENDPOINT=""
fi
if [ "$USE_SUPABASE_AUTH" = "true" ] && \
   { [ "$USE_SUPABASE_INVITES" = "true" ] || [ "$USE_SUPABASE_PASSWORD_RECOVERY" = "true" ]; }; then
  if [ -z "${AUTH_INVITE_REDIRECT_URL:-}" ] && [ -n "${APP_ORIGIN:-}" ]; then
    AUTH_INVITE_REDIRECT_URL="${APP_ORIGIN%/}/auth-callback.html"
  fi
else
  AUTH_INVITE_REDIRECT_URL=""
fi
case "$INVITE_USER_ENDPOINT" in
  ''|https://*) ;;
  *) echo "INVITE_USER_ENDPOINT must use HTTPS" >&2; exit 1 ;;
esac
case "$INVITE_USER_ENDPOINT" in
  *[!A-Za-z0-9:/._~-]*) echo "INVITE_USER_ENDPOINT contains invalid characters" >&2; exit 1 ;;
esac
case "${AUTH_INVITE_REDIRECT_URL:-}" in
  ''|https://*/auth-callback.html) ;;
  *) echo "AUTH_INVITE_REDIRECT_URL must use HTTPS and target /auth-callback.html" >&2; exit 1 ;;
esac
case "${AUTH_INVITE_REDIRECT_URL:-}" in
  *[!A-Za-z0-9:/._~-]*) echo "AUTH_INVITE_REDIRECT_URL contains invalid characters" >&2; exit 1 ;;
esac

export ARTHHRMS_PUBLIC_SUPABASE_KEY
export INVITE_USER_ENDPOINT
export AUTH_INVITE_REDIRECT_URL

envsubst '${APP_ENV} ${PRODUCTION_MODE} ${PILOT_MODE} ${DEVELOPMENT_MODE} ${DEMO_MODE} ${SUPABASE_URL} ${ARTHHRMS_PUBLIC_SUPABASE_KEY} ${SUPABASE_TIMEOUT_MS} ${INVITE_USER_ENDPOINT} ${AUTH_INVITE_REDIRECT_URL} ${REQUIRE_APP_METADATA_ROLE} ${REQUIRE_EMAIL_VERIFIED} ${USE_SUPABASE_EMPLOYEES} ${USE_SUPABASE_ATTENDANCE} ${USE_SUPABASE_LEAVE} ${USE_SUPABASE_EXPENSES} ${USE_SUPABASE_PAYROLL} ${USE_SUPABASE_AUTH} ${USE_SUPABASE_PASSWORD_RECOVERY} ${USE_SUPABASE_IMPORTS} ${USE_SUPABASE_STORAGE} ${USE_SUPABASE_INVITES} ${USE_SUPABASE_PERSISTENCE}' \
  < /opt/arthhrms/runtime-config.template.js \
  > /usr/share/nginx/html/runtime-config.js
chmod 0444 /usr/share/nginx/html/runtime-config.js
