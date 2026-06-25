#!/bin/sh
set -eu

cat > /app/dist/runtime-config.js <<EOF
window.__APP_CONFIG__ = {
  uiPort: ${VITE_UI_PORT:-3300},
  apiTarget: "${VITE_API_TARGET:-http://localhost:3100}",
  maxImageSizeBytes: ${VITE_MAX_IMAGE_SIZE_BYTES:-5242880}
};
EOF

exec "$@"
