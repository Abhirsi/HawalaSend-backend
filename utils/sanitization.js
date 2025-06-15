// backend/utils/sanitization.js
const sanitizeHtml = require('sanitize-html');
const { BadRequestError } = require('../errors');
const logger = require('../utils/logger');


const sanitizeConfig = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'escape',
  enforceHtmlBoundary: true
};

const xssSanitize = (fields) => {
  return (req, res, next) => {
    try {
      ['body', 'query', 'params'].forEach((location) => {
        if (!req[location]) return;
        
        Object.keys(req[location]).forEach((key) => {
          if (fields.includes(key) && typeof req[location][key] === 'string') {
            req[location][key] = sanitizeHtml(req[location][key], sanitizeConfig);
          }
        });
      });
      next();
    } catch (error) {
      logger.error(`XSS Sanitization failed: ${error.message}`, {
        path: req.path,
        ip: req.ip
      });
      throw new BadRequestError('Input validation failed');
    }
  };
};

const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return null;
  return sanitizeHtml(email.toLowerCase().trim(), {
    ...sanitizeConfig,
    allowedTags: [],
    allowedAttributes: {}
  });
};

const sanitizeMoney = (amount) => {
  if (typeof amount === 'string') {
    const parsed = parseFloat(amount.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }
  return typeof amount === 'number' ? amount : 0;
};

const sanitizeObjectIds = (ids) => {
  if (Array.isArray(ids)) {
    return ids.filter(id => /^[0-9a-fA-F]{24}$/.test(id));
  }
  return /^[0-9a-fA-F]{24}$/.test(ids) ? ids : null;
};

module.exports = {
  xssSanitize,
  sanitizeEmail,
  sanitizeMoney,
  sanitizeObjectIds,
  htmlSanitizeOptions: sanitizeConfig
};