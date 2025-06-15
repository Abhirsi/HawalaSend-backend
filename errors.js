// backend/errors.js
class AppError extends Error {
  /**
   * Base error class for application-specific errors
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {object} details - Additional error details
   * @param {boolean} isOperational - Indicates if error is operational/expected
   */
  constructor(message, statusCode, details = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

// 4xx Client Errors
class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details = null) {
    super(message, 403, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found', details = null) {
    super(message, 404, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', details = null) {
    super(message, 409, details);
  }
}

class ValidationError extends AppError {
  /**
   * @param {Array<object>} errors - Array of validation errors
   * @param {string} message - Override default message
   */
  constructor(errors, message = 'Validation Failed') {
    super(message, 422, { errors });
  }
}

// 5xx Server Errors
class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', details = null) {
    super(message, 500, details);
  }
}

class DatabaseError extends InternalServerError {
  constructor(error, details = null) {
    super('Database Operation Failed', { ...details, dbError: error.message });
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Temporarily Unavailable', details = null) {
    super(message, 503, details);
  }
}

// Domain-Specific Errors
class InsufficientFundsError extends BadRequestError {
  constructor(balance, amount) {
    super('Insufficient funds', {
      currentBalance: balance,
      requiredAmount: amount
    });
  }
}

class TransactionLimitError extends ForbiddenError {
  constructor(limitType, current, max) {
    super(`Transaction limit exceeded`, {
      limitType,
      currentValue: current,
      maxAllowed: max
    });
  }
}

module.exports = {
  // Base
  AppError,
  
  // 4xx
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  
  // 5xx
  InternalServerError,
  DatabaseError,
  ServiceUnavailableError,
  
  // Domain
  InsufficientFundsError,
  TransactionLimitError
};