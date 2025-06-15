const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, errors, json } = format;

// Custom log format for development (pretty printed)
const devFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  const base = {
    timestamp,
    level,
    message,
    ...metadata
  };
  if (stack) {
    base.stack = stack.split('\n').map(line => line.trim());
  }
  return JSON.stringify(base, null, 2);
});

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  // Use different formats for dev vs prod
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // include error stack if present
    process.env.NODE_ENV === 'production' ? json() : devFormat
  ),

  transports: [
    // Console log (always on)
    new transports.Console(),

    // Main combined log file
    new transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5
    }),

    // Error-specific log file
    new transports.File({
      filename: path.join(__dirname, '../logs/errors.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    })
  ],

  // Log unhandled promise rejections
  rejectionHandlers: [
    new transports.File({
      filename: path.join(__dirname, '../logs/rejections.log')
    })
  ],

  // Log uncaught exceptions
  exceptionHandlers: [
    new transports.File({
      filename: path.join(__dirname, '../logs/exceptions.log')
    })
  ]
});

// Stream for integrating with Morgan HTTP logger
logger.morganStream = {
  write: (message) => logger.info(message.trim())
};

// Gracefully handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Gracefully handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

module.exports = logger;
