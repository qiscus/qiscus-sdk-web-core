// @ts-check

export class Logger {
  /**
   * @type {string}
   * The name of the logger.
   * This is used to identify the logger in logs.
   * It can be a simple string or a hierarchical name (e.g., "app.module").
   */
  name;

  /**
   * @type {Logger|undefined}
   * The parent logger for hierarchical logging.
   * If defined, logs will be propagated to the parent logger.
   */
  parent;

  /**
   * @type {(level:string, message:string, ...data: any[]) => void}
   * A function that handles the logging.
   * It takes the log level, message, and additional data as arguments.
   */
  onLog;


  /**
   * @type {(() => boolean) | undefined}
   * A function that returns a boolean indicating whether logging is enabled.
   * This can be used to conditionally log messages based on the application's logging configuration.
   */
  getIsLogEnabled;

  /**
   * Creates an instance of Logger.
   * @param {string} name - The name of the logger.
   * @param {Logger|undefined} [parent] - Optional parent logger for hierarchical logging.
   * @param {(level:string, message:string, ...data: any[]) => void} [onLog] - Optional function to handle logging.
   * If not provided, a default logging function will be used that logs to the console.
   * The default function logs messages in the format: [LEVEL] loggerName: message with data.
   * And also the default function will log to the console only if `getIsLogEnabled` returns true
   * or `debugMode` inside `QiscusSDK` is true.
   *
   * @param {() => boolean} [getIsLogEnabled]
   */
  constructor(name, parent, onLog, getIsLogEnabled) {
    this.name = name;
    this.parent = parent;
    this.getIsLogEnabled = getIsLogEnabled;

    /**
     * @param {string} level
     * @param {string} message
     * @param {any[]} data
     */
    function _defaultOnLog(level, message, ...data) {
      if (getIsLogEnabled?.()) {
        console[level](`[${level.toUpperCase()}] ${this.name}: ${message}`, JSON.stringify(data));
      }
    }
    this.onLog = parent != null ? parent.onLog : (onLog ?? _defaultOnLog);
  }


  /**
   * Creates a child logger with a specific name.
   * @param {string} name - The name of the child logger.
   * @returns {Logger} A new Logger instance with the specified name.
   */
  child(name) {
    return new Logger(`${this.name}.${name}`, this);
  }


  /**
   * Logs a debug message.
   * @param {string} message - The debug message to log.
   * @param {any[]} data - Additional data to log.
   */
  debug(message, ...data) {
    this.onLog('debug', message, ...data);
  }

  /**
   * Logs an info message.
   * @param {string} message - The info message to log.
   * @param {any[]} data - Additional data to log.
   */
  info(message, ...data) {
    this.onLog('info', message, ...data);
  }

  /**
   * Logs an error message.
   * @param {string} message - The error message to log.
   * @param {any[]} data - Additional data to log.
   */
  error(message, ...data) {
    this.onLog('error', message, ...data);
  }
}
