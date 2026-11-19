#!/bin/sh
# Render only the approved runtime settings before the official Nginx entrypoint starts.
set -eu

# These variables come from the Dockerfile ENV defaults at container runtime.
# Compose or `docker run -e` can override them before this Nginx startup hook runs.

case "$VITE_UI_PORT" in
  ''|*[!0-9]*) echo "docker-entrypoint [ERROR] VITE_UI_PORT must be numeric" >&2; exit 1 ;;
esac
case "$VITE_MAX_IMAGE_SIZE_BYTES" in
  ''|*[!0-9]*) echo "docker-entrypoint [ERROR] VITE_MAX_IMAGE_SIZE_BYTES must be numeric" >&2; exit 1 ;;
esac
case "$VITE_API_TARGET" in
  http://*|https://*) ;;
  *) echo "docker-entrypoint [ERROR] VITE_API_TARGET must be an http(s) URL" >&2; exit 1 ;;
esac
case "$VITE_API_TARGET" in
  *\"*|*\\*) echo "docker-entrypoint [ERROR] VITE_API_TARGET contains an unsupported character" >&2; exit 1 ;;
esac

template=/etc/s3-app/runtime-config.js.template
output=/usr/share/nginx/html/runtime-config.js
temporary="${output}.tmp"
envsubst '${VITE_UI_PORT} ${VITE_API_TARGET} ${VITE_MAX_IMAGE_SIZE_BYTES}' < "$template" > "$temporary"
mv "$temporary" "$output"

printf '%s [INFO] [docker-entrypoint] Runtime frontend configuration rendered (apiTarget configured=%s)\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$([ -n "$VITE_API_TARGET" ] && printf true || printf false)"
