#!/bin/sh
set -eu

cat > /app/dist/runtime-config.js <<EOF
window.__APP_CONFIG__ = {
  apiTarget: "${VITE_API_TARGET:-http://localhost:3100}"
};
EOF

exec "$@"
