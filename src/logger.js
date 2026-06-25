// Format browser-side log messages with a timestamp for easier debugging.
const formatTimestamp = () => new Date().toISOString();

const createLogEntry = (level, component, message) => {
  const entry = `[${formatTimestamp()}] [${level}] [${component}] ${message}`;
  console.log(entry);
  return entry;
};

const logger = {
  info: (component, message) => createLogEntry('INFO', component, message),
  warn: (component, message) => createLogEntry('WARN', component, message),
  error: (component, message) => createLogEntry('ERROR', component, message)
};

export default logger;
