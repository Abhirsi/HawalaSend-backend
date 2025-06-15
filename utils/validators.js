// backend/utils/validators.js
const { body, query, param, validationResult } = require('express-validator');
const { BadRequestError } = require('../errors');
const logger = require('./logger');

// utils/validators.js
exports.validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

exports.validatePassword = (password) => {
  return password.length >= 8;
};

//SWWSWQ;
/**
 * Sanitization middleware to prevent XSS
 */
const xssSanitize = (fields) => {
  return (req, res, next) => {
    try {
      ['body', 'query', 'params'].forEach((location) => {
        if (!req[location]) return;
        
        Object.keys(req[location]).forEach((key) => {
          if (fields.includes(key) && typeof req[location][key] === 'string') {
            req[location][key] = sanitizeHtml(req[location][key], {
              allowedTags: [], // No HTML tags allowed
              allowedAttributes: {} // No attributes allowed
            });
          }
        });
      });
      next();
    } catch (error) {
      logger.error(`XSS Sanitization failed: ${error.message}`);
      throw new BadRequestError('Input validation failed');
    }
  };
};

/**
 * Common validation chains
 */
const validate = {
  // Authentication validators
  email: () => body('email')
    .trim()
    .toLowerCase()
    .isEmail().withMessage('Valid email required')
    .isLength({ max: 254 }).withMessage('Email too long'),

  password: () => body('password')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[0-9]/).withMessage('Password requires a number')
    .matches(/[a-z]/).withMessage('Password requires a lowercase letter')
    .matches(/[A-Z]/).withMessage('Password requires an uppercase letter')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password requires a symbol'),

  // Data validators
  string: (field, max = 100) => body(field)
    .trim()
    .isString()
    .isLength({ min: 1, max }).withMessage(`Must be 1-${max} characters`),

  number: (field, min = 0, max = 10000) => body(field)
    .isInt({ min, max }).withMessage(`Must be between ${min}-${max}`),

  // URL params
  idParam: () => param('id')
    .isMongoId().withMessage('Invalid ID format'),

  // Query params
  pagination: () => [
    query('page').optional().isInt({ min: 1 }).default(1),
    query('limit').optional().isInt({ min: 1, max: 100 }).default(10)
  ]
};

/**
 * Validation result handler
 */
const validateResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));
    
    logger.warn('Validation failed', { 
      path: req.path, 
      errors: errorMessages,
      ip: req.ip 
    });
    
    throw new BadRequestError('Validation errors', errorMessages);
  }
  next();
};

/**
 * MongoDB ID validator
 */
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Currency validator
 */
const isValidCurrency = (value) => {
  return typeof value === 'number' && 
         !isNaN(value) && 
         value >= 0 && 
         value <= 1000000;
};

module.exports = {
  validate,
  validateResult,
  xssSanitize,
  isValidObjectId,
  isValidCurrency,
  // Re-export for convenience
  body,
  query,
  param
};