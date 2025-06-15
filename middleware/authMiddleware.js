// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { TokenExpiredError, JsonWebTokenError } = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const { RateLimiterMemory } = require('rate-limiter-flexible');

const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV;

// Rate limiter for auth attempts
const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 60, // Per 60 seconds
});

const authMiddleware = async (req, res, next) => {
  // 1. Rate limiting check
  try {
    await rateLimiter.consume(req.ip);
  } catch (rateLimiterRes) {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    return res.status(429).json({
      message: 'Too many requests',
      retryAfter: rateLimiterRes.msBeforeNext / 1000
    });
  }

  // 2. Token extraction
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    logger.debug('Missing or malformed authorization header');
    return res.status(401).json({ 
      code: 'MISSING_TOKEN',
      message: 'Authorization token required' 
    });
  }

  const token = authHeader.split(' ')[1];

  // 3. Token verification
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'], // Explicit algorithm
      ignoreExpiration: false // Strict expiration check
    });

    // 4. User verification
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }, // Never expose password
      cache: true // If using query caching
    });

    if (!user || user.status !== 'active') {
      throw new Error('User not active or not found');
    }

    // 5. Attach user to request
    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      permissions: user.permissions // If using RBAC
    };

    // 6. Refresh token if nearing expiration (optional)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp - now < 600) { // 10 minutes remaining
      const newToken = jwt.sign(
        { id: user.id }, 
        JWT_SECRET, 
        { expiresIn: '1h' }
      );
      res.setHeader('X-Refresh-Token', newToken);
    }

    next();
  } catch (error) {
    // 7. Error handling
    let status = 401;
    let code = 'INVALID_TOKEN';
    let message = 'Invalid or expired token';

    if (error instanceof TokenExpiredError) {
      code = 'TOKEN_EXPIRED';
      message = 'Session expired. Please login again.';
    } else if (error instanceof JsonWebTokenError) {
      code = 'MALFORMED_TOKEN';
    } else if (error.message.includes('not active')) {
      status = 403;
      code = 'USER_INACTIVE';
      message = 'Account deactivated';
    }

    logger.warn(`Auth failed: ${error.message}`, { 
      ip: req.ip,
      error: NODE_ENV === 'development' ? error.stack : undefined
    });

    return res.status(status).json({ code, message });
  }
};

module.exports = authMiddleware;