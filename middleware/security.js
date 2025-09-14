// middleware/security.js - Comprehensive security middleware
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';

// Rate limiting for login attempts
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true,
  // Custom key generator to include user agent
  keyGenerator: (req) => {
    return `${req.ip}-${req.get('User-Agent')}`;
  }
});

// Rate limiting for transfer attempts
export const transferRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each user to 3 transfers per minute
  message: {
    error: 'Too many transfer attempts. Please wait before sending another transfer.',
    retryAfter: 60 * 1000
  },
  keyGenerator: (req) => {
    // Use user ID from JWT token
    return `transfer-${req.user?.id || req.ip}`;
  }
});

// General API rate limiting
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: 15 * 60 * 1000
  }
});

// Helmet configuration for security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false // Allow embedding for Vercel deployment
});

// Input validation middleware
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, lowercase letter, and number'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }
    next();
  }
];

export const validateTransfer = [
  body('recipient_email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid recipient email is required'),
  body('amount')
    .isFloat({ min: 1, max: 10000 })
    .withMessage('Amount must be between $1 and $10,000'),
  body('description')
    .optional()
    .isLength({ max: 200 })
    .trim()
    .escape()
    .withMessage('Description cannot exceed 200 characters'),
  body('pin')
    .isLength({ min: 4, max: 6 })
    .isNumeric()
    .withMessage('PIN must be 4-6 digits'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid transfer data',
        details: errors.array()
      });
    }
    next();
  }
];

// Enhanced JWT middleware with security logging
export const enhancedAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      console.log(`🚫 Auth failed - No token: ${req.ip} ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    
    // Log successful auth for monitoring
    console.log(`✅ Auth success - User ${decoded.id}: ${req.method} ${req.path}`);
    next();
  } catch (error) {
    console.log(`🚫 Auth failed - Invalid token: ${req.ip} ${req.method} ${req.path}`);
    res.status(403).json({ error: 'Invalid token.' });
  }
};

// Request sanitization middleware
export const sanitizeInput = (req, res, next) => {
  // Remove any potential script tags from all string inputs
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    return value;
  };
  
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      req.body[key] = sanitizeValue(req.body[key]);
    });
  }
  
  next();
};

// Security monitoring middleware
export const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request details
  console.log(`📡 ${req.method} ${req.path} - IP: ${req.ip} - UA: ${req.get('User-Agent')?.substring(0, 50)}...`);
  
  // Monitor response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? '⚠️' : '✅';
    console.log(`${logLevel} ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
    
    // Alert on suspicious activity
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.log(`🔍 Security Alert - Unauthorized access attempt: ${req.ip} ${req.method} ${req.path}`);
    }
  });
  
  next();
};