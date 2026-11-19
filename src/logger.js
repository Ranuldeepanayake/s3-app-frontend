/**
 * Browser logging boundary for the frontend. Records contain only approved,
 * structured metadata; sensitive fields and URL query/user-info are redacted.
 */
const SERVICE = 's3-app-frontend';
const SENSITIVE_KEY = /password|token|secret|authorization|cookie|credential|api.?key/i;

/** Return a URL safe for diagnostics by removing credentials and query values. */
const sanitizeUrl = (value) => {
  try {
    const url = new URL(value, window.location.origin);
    url.username = '';
    url.password = '';
    url.search = url.search ? '?[redacted]' : '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
};

/** Recursively remove sensitive fields from structured log metadata. */
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item)
  ]));
};

/** Emit and return one structured record for the activity panel. */
const write = (level, module, event, message, metadata = {}) => {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    module,
    event,
    message,
    metadata: redact(metadata)
  };
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  output(JSON.stringify(record));
  return `[${record.timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
};

/** Log an informational event and return its display text. */
const logger = {
  info: (module, message, metadata = {}, event = 'operation') => write('info', module, event, message, metadata),
  /** Log a warning event and return its display text. */
  warn: (module, message, metadata = {}, event = 'operation') => write('warn', module, event, message, metadata),
  /** Log an error event and return its display text. */
  error: (module, message, metadata = {}, event = 'operation') => write('error', module, event, message, metadata),
  /** Produce safe startup diagnostics without exposing arbitrary runtime config. */
  startupConfigSummary: ({ apiTarget, mode, base, dev, prod, hostname, port, maxImageSizeBytes }) => ({
    apiTarget: sanitizeUrl(apiTarget), mode, base, dev, prod, hostname, port, maxImageSizeBytes
  })
};

export default logger;
