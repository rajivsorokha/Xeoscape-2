// core/logger.js
// Packaged Electron apps are Windows GUI-subsystem executables, which
// don't reliably forward console.log/console.error output to a parent
// terminal the way ordinary console programs do -- even launching the
// .exe from cmd/PowerShell, that output often goes nowhere visible.
// That makes diagnosing "it just shows an error" reports from the field
// very hard. This sets up a plain append-only log file instead, and
// mirrors every console.log/warn/error call (plus any otherwise-fatal
// uncaught exception or unhandled promise rejection) into it, so a
// user can just open one file and send it back instead of trying to
// capture terminal output that may not exist.

const fs = require('fs');
const path = require('path');

let logFilePath = null;

function timestamp() {
  return new Date().toISOString();
}

function appendLine(level, args) {
  if (!logFilePath) return;
  const line = `[${timestamp()}] ${level}: ${args
    .map((a) => (a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ')}\n`;
  try {
    fs.appendFileSync(logFilePath, line);
  } catch (err) {
    // If we can't write the log itself, there's nowhere left to report
    // this -- deliberately swallow rather than throwing from inside a
    // logging call, which could itself crash the app.
  }
}

/**
 * @param {string} logDir directory to place app.log in (created if missing)
 */
function initLogger(logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, 'app.log');

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  console.log = (...args) => { original.log(...args); appendLine('INFO', args); };
  console.warn = (...args) => { original.warn(...args); appendLine('WARN', args); };
  console.error = (...args) => { original.error(...args); appendLine('ERROR', args); };

  process.on('uncaughtException', (err) => {
    appendLine('FATAL (uncaughtException)', [err]);
  });
  process.on('unhandledRejection', (reason) => {
    appendLine('FATAL (unhandledRejection)', [reason]);
  });

  appendLine('INFO', [`Logging initialized. Log file: ${logFilePath}`]);
  return logFilePath;
}

module.exports = { initLogger, getLogFilePath: () => logFilePath };
