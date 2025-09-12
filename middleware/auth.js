import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV;

// Rate limiter for auth attempts
const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 60, // Per 60 seconds
});

export const verifyToken = async (req, res, next) => {
  // 1. Rate limiting check
  try {
    await rateLimiter.consume(req.ip);
  } catch (rateLimiterRes) {
    console.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    return res.status(429).json({
      message: 'Too many requests',
      retryAfter: rateLimiterRes.msBeforeNext / 1000,
    });
  }

  // 2. Token extraction
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    console.debug('Missing or malformed authorization header');
    return res.status(401).json({
      code: 'MISSING_TOKEN',
      message: 'Authorization token required',
    });
  }

  const token = authHeader.split(' ')[1];

  // 3. Token verification
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'], // Explicit algorithm
      ignoreExpiration: false, // Strict expiration check
    });

    // 4. Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email || '', // Fallback email
    };

    // 5. Refresh token if nearing expiration (optional)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp - now < 600) { // 10 minutes remaining
      const newToken = jwt.sign(
        { id: req.user.id, email: req.user.email },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      res.setHeader('X-Refresh-Token', newToken);
    }

    next();
  } catch (error) {
    // 6. Error handling
    let status = 401;
    let code = 'INVALID_TOKEN';
    let message = 'Invalid or expired token';

    if (error instanceof jwt.TokenExpiredError) {
      code = 'TOKEN_EXPIRED';
      message = 'Session expired. Please login again.';
    } else if (error instanceof jwt.JsonWebTokenError) {
      code = 'MALFORMED_TOKEN';
    }

    console.warn(`Auth failed: ${error.message}`, {
      ip: req.ip,
      error: NODE_ENV === 'development' ? error.stack : undefined,
    });

    return res.status(status).json({ code, message });
  }
};