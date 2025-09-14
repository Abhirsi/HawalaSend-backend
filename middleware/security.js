// middleware/security.js - Enhanced security middleware for Railway deployment
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';

// Enhanced IP detection for Railway/proxy environments
const getClientIP = (req) => {
  // Railway and other proxies provide real IP in these headers
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  return req.headers['x-real-ip'] || 
         req.headers['cf-connecting-ip'] || // Cloudflare
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         req.ip ||
         'unknown';
};

// Rate limiting for login attempts - Railway compatible
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Enhanced key generator for Railway deployment
  keyGenerator: getClientIP,
  // Skip health checks and development mode
  skip: (req) => {
    return req.path === '/health' || 
           req.path === '/' ||
           process.env.NODE_ENV === 'development';
  },
  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    const ip = getClientIP(req);
    console.log(`🚫 Login rate limit exceeded for IP: ${ip}`);
    res.status(429).json({
      error: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: 15 * 60,
      timestamp: new Date().toISOString()
    });
  }
});

// Rate limiting for transfer attempts - enhanced
export const transferRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each user to 3 transfers per minute
  message: {
    error: 'Too many transfer attempts. Please wait before sending another transfer.',
    retryAfter: 60 * 1000
  },
  keyGenerator: (req) => {
    const userId = req.user?.id;
    const ip = getClientIP(req);
    // Use user ID if authenticated, otherwise fall back to IP
    return userId ? `transfer-user-${userId}` : `transfer-ip-${ip}`;
  },
  skip: (req) => process.env.NODE_ENV === 'development',
  handler: (req, res) => {
    const identifier = req.user?.id || getClientIP(req);
    console.log(`🚫 Transfer rate limit exceeded for: ${identifier}`);
    res.status(429).json({
      error: 'Too many transfer attempts. Please wait before sending another transfer.',
      retryAfter: 60,
      timestamp: new Date().toISOString()
    });
  }
});

// General API rate limiting - enhanced
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  keyGenerator: getClientIP,
  skip: (req) => {
    // Skip rate limiting for health checks, root, and development
    return req.path === '/health' || 
           req.path === '/' ||
           req.path === '/setup-database' ||
           process.env.NODE_ENV === 'development';
  },
  handler: (req, res) => {
    const ip = getClientIP(req);
    console.log(`🚫 General rate limit exceeded for IP: ${ip} on ${req.method} ${req.path}`);
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: 15 * 60,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced Helmet configuration for security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.vercel.app"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Only for development, should be restricted in production
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
});

// Enhanced input validation for login
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail({
      gmail_remove_dots: false,
      outlookdotcom_remove_subaddress: false
    })
    .isLength({ max: 255 })
    .withMessage('Valid email is required')
    .custom((value) => {
      // Additional email security check
      if (value.includes('<') || value.includes('>') || value.includes('"')) {
        throw new Error('Email contains invalid characters');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6-128 characters')
    .custom((value) => {
      // Basic password security check
      if (typeof value !== 'string') {
        throw new Error('Password must be a string');
      }
      return true;
    }),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const ip = getClientIP(req);
      console.log(`🚫 Login validation failed for IP: ${ip}`, errors.array());
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    next();
  }
];

// Enhanced transfer validation
export const validateTransfer = [
  body('recipient_email')
    .isEmail()
    .normalizeEmail({
      gmail_remove_dots: false,
      outlookdotcom_remove_subaddress: false
    })
    .isLength({ max: 255 })
    .withMessage('Valid recipient email is required')
    .custom((value, { req }) => {
      // Prevent self-transfers
      if (req.user && value === req.user.email) {
        throw new Error('Cannot send money to yourself');
      }
      return true;
    }),
  body('amount')
    .isFloat({ min: 1, max: 10000 })
    .withMessage('Amount must be between $1 and $10,000')
    .custom((value) => {
      // Ensure amount has max 2 decimal places
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Amount cannot have more than 2 decimal places');
      }
      return true;
    }),
  body('description')
    .optional()
    .isLength({ max: 200 })
    .trim()
    .escape()
    .withMessage('Description cannot exceed 200 characters')
    .custom((value) => {
      // Additional sanitization for description
      if (value && (value.includes('<script') || value.includes('javascript:'))) {
        throw new Error('Description contains invalid content');
      }
      return true;
    }),
  body('pin')
    .isLength({ min: 4, max: 6 })
    .isNumeric()
    .withMessage('PIN must be 4-6 digits')
    .custom((value) => {
      // Ensure PIN is not common weak patterns
      const weakPins = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];
      if (weakPins.includes(value)) {
        throw new Error('PIN is too weak, please choose a different PIN');
      }
      return true;
    }),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const ip = getClientIP(req);
      const userId = req.user?.id || 'anonymous';
      console.log(`🚫 Transfer validation failed for user: ${userId}, IP: ${ip}`, errors.array());
      return res.status(400).json({
        error: 'Invalid transfer data',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    next();
  }
];

// Enhanced request sanitization middleware
export const sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      // Remove script tags and javascript: protocols
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
        .trim();
    }
    return value;
  };
  
  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        } else {
          obj[key] = sanitizeValue(obj[key]);
        }
      });
    }
  };
  
  if (req.body) {
    sanitizeObject(req.body);
  }
  
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      req.query[key] = sanitizeValue(req.query[key]);
    });
  }
  
  next();
};

// Enhanced security monitoring middleware
export const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  const ip = getClientIP(req);
  const userAgent = req.get('User-Agent') || 'Unknown';
  const method = req.method;
  const path = req.path;
  const userId = req.user?.id || 'anonymous';
  
  // Log incoming request with more details
  console.log(`📡 ${method} ${path} - IP: ${ip} - User: ${userId} - UA: ${userAgent.substring(0, 50)}...`);
  
  // Track suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript injection
  ];
  
  const requestData = JSON.stringify(req.body || {}) + JSON.stringify(req.query || {});
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
  
  if (isSuspicious) {
    console.log(`🚨 SECURITY ALERT - Suspicious request detected from IP: ${ip}, Path: ${path}, Data: ${requestData}`);
  }
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    
    // Enhanced logging with status-based emojis
    let logLevel = '✅';
    if (status >= 500) logLevel = '💥';
    else if (status >= 400) logLevel = '⚠️';
    else if (status >= 300) logLevel = '🔄';
    
    console.log(`${logLevel} ${status} ${method} ${path} - ${duration}ms - IP: ${ip} - User: ${userId}`);
    
    // Enhanced security alerts
    if (status === 401) {
      console.log(`🔍 UNAUTHORIZED ACCESS - IP: ${ip}, Path: ${path}, User: ${userId}`);
    } else if (status === 403) {
      console.log(`🛡️ FORBIDDEN ACCESS - IP: ${ip}, Path: ${path}, User: ${userId}`);
    } else if (status === 429) {
      console.log(`⏱️ RATE LIMIT EXCEEDED - IP: ${ip}, Path: ${path}`);
    } else if (status >= 500) {
      console.log(`🚨 SERVER ERROR - Status: ${status}, Path: ${path}, IP: ${ip}`);
    }
  });
  
  next();
};

// Additional middleware for API versioning and monitoring
export const apiVersioning = (req, res, next) => {
  // Add API version to response headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Service', 'HawalaSend');
  next();
};

// Request size limiter for security
export const requestSizeLimiter = (req, res, next) => {
  const contentLength = req.get('content-length');
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    const ip = getClientIP(req);
    console.log(`🚫 Request too large from IP: ${ip}, Size: ${contentLength} bytes`);
    return res.status(413).json({
      error: 'Request entity too large',
      maxSize: '10MB'
    });
  }
  
  next();
};