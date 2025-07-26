// backend/utils/validators.js
const { body, query, param, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const { BadRequestError } = require('../errors');
const logger = require('./logger');


// utils/validators.js should have:
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 8;
};

module.exports = {
  validateEmail,
  validatePassword
};

/**
 * Sanitization middleware to prevent XSS attacks
 */
const xssSanitize = (fields = []) => {
  return (req, res, next) => {
    try {
      ['body', 'query', 'params'].forEach((location) => {
        if (!req[location]) return;
        
        Object.keys(req[location]).forEach((key) => {
          if ((fields.length === 0 || fields.includes(key)) && 
              typeof req[location][key] === 'string') {
            req[location][key] = sanitizeHtml(req[location][key], {
              allowedTags: [],
              allowedAttributes: {},
              disallowedTagsMode: 'discard'
            });
          }
        });
      });
      next();
    } catch (error) {
      logger.error(`XSS Sanitization failed: ${error.message}`, {
        path: req.path,
        ip: req.ip
      });
      return next(new BadRequestError('Input validation failed'));
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
    .isEmail()
    .withMessage('Valid email required')
    .isLength({ max: 254 })
    .withMessage('Email too long')
    .normalizeEmail({
      gmail_remove_dots: false,
      gmail_remove_subaddress: false
    }),

  password: () => body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
    .matches(/[0-9]/)
    .withMessage('Password requires at least one number')
    .matches(/[a-z]/)
    .withMessage('Password requires at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password requires at least one uppercase letter')
    .matches(/[^a-zA-Z0-9]/)
    .withMessage('Password requires at least one special character'),

  confirmPassword: () => body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),

  // Data validators
  string: (field, options = {}) => {
    const { min = 1, max = 100, optional = false } = options;
    const validator = body(field).trim();
    
    if (optional) {
      return validator.optional().isString().isLength({ min, max })
        .withMessage(`Must be ${min}-${max} characters`);
    }
    
    return validator.notEmpty().isString().isLength({ min, max })
      .withMessage(`Must be ${min}-${max} characters`);
  },

  number: (field, options = {}) => {
    const { min = 0, max = 10000, optional = false } = options;
    const validator = body(field);
    
    if (optional) {
      return validator.optional().isInt({ min, max })
        .withMessage(`Must be between ${min} and ${max}`);
    }
    
    return validator.notEmpty().isInt({ min, max })
      .withMessage(`Must be between ${min} and ${max}`);
  },

  decimal: (field, options = {}) => {
    const { min = 0, max = 1000000, optional = false } = options;
    const validator = body(field);
    
    if (optional) {
      return validator.optional().isFloat({ min, max })
        .withMessage(`Must be between ${min} and ${max}`);
    }
    
    return validator.notEmpty().isFloat({ min, max })
      .withMessage(`Must be between ${min} and ${max}`);
  },

  boolean: (field, optional = false) => {
    const validator = body(field);
    
    if (optional) {
      return validator.optional().isBoolean()
        .withMessage('Must be true or false');
    }
    
    return validator.isBoolean()
      .withMessage('Must be true or false');
  },

  date: (field, optional = false) => {
    const validator = body(field);
    
    if (optional) {
      return validator.optional().isISO8601()
        .withMessage('Must be a valid date (ISO 8601 format)');
    }
    
    return validator.notEmpty().isISO8601()
      .withMessage('Must be a valid date (ISO 8601 format)');
  },

  // URL parameter validators
  idParam: (paramName = 'id') => param(paramName)
    .isMongoId()
    .withMessage('Invalid ID format'),

  // Query parameter validators
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
  ],

  search: () => query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be 1-100 characters'),

  sort: (allowedFields = []) => query('sort')
    .optional()
    .custom((value) => {
      const sortFields = value.split(',');
      const validFields = sortFields.every(field => {
        const cleanField = field.replace(/^-/, ''); // Remove sort direction prefix
        return allowedFields.includes(cleanField);
      });
      
      if (!validFields) {
        throw new Error(`Sort field must be one of: ${allowedFields.join(', ')}`);
      }
      return true;
    })
};

/**
 * Validation result handler middleware
 */
const validateResult = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
      location: err.location
    }));
    
    logger.warn('Validation failed', { 
      path: req.path,
      method: req.method,
      errors: errorMessages,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    const error = new BadRequestError('Validation errors');
    error.details = errorMessages;
    return next(error);
  }
  
  next();
};

/**
 * MongoDB ObjectId validator utility
 */
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Currency/monetary value validator
 */
const isValidCurrency = (value) => {
  if (typeof value !== 'number' || isNaN(value)) return false;
  if (value < 0 || value > 1000000) return false;
  
  // Check for reasonable decimal places (max 2 for currency)
  const decimalPlaces = (value.toString().split('.')[1] || '').length;
  return decimalPlaces <= 2;
};

/**
 * Rate limiting key generator for validation errors
 */
const getValidationRateLimitKey = (req) => {
  return `validation_errors:${req.ip}`;
};

/**
 * Advanced validation helpers
 */
const helpers = {
  // Custom validator for array of valid ObjectIds
  mongoIdArray: (field, options = {}) => {
    const { min = 1, max = 50, optional = false } = options;
    const validator = body(field);
    
    if (optional) {
      return validator.optional().isArray({ min, max })
        .withMessage(`Must be an array with ${min}-${max} items`)
        .custom((arr) => {
          if (!Array.isArray(arr)) return true; // Let isArray handle this
          return arr.every(id => isValidObjectId(id));
        })
        .withMessage('All items must be valid ObjectIds');
    }
    
    return validator.isArray({ min, max })
      .withMessage(`Must be an array with ${min}-${max} items`)
      .custom((arr) => {
        return arr.every(id => isValidObjectId(id));
      })
      .withMessage('All items must be valid ObjectIds');
  },

  // URL validator
  url: (field, optional = false) => {
    const validator = body(field);
    
    if (optional) {
      return validator.optional().isURL({
        protocols: ['http', 'https'],
        require_protocol: true
      }).withMessage('Must be a valid URL');
    }
    
    return validator.isURL({
      protocols: ['http', 'https'],
      require_protocol: true
    }).withMessage('Must be a valid URL');
  },

  // Phone number validator (basic international format)
  phone: (field, optional = false) => {
    const validator = body(field).trim();
    
    if (optional) {
      return validator.optional().matches(/^\+?[1-9]\d{1,14}$/)
        .withMessage('Must be a valid phone number');
    }
    
    return validator.matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Must be a valid phone number');
  }
};

module.exports = {
  // Core functions
  validate,
  validateResult,
  xssSanitize,
  
  // Utility functions
  validateEmail,
  validatePassword,
  isValidObjectId,
  isValidCurrency,
  getValidationRateLimitKey,
  
  // Advanced helpers
  helpers,
  
  // Re-export express-validator functions for convenience
  body,
  query,
  param,
  validationResult
};