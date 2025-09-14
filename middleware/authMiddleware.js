// middleware/authMiddleware.js - Enhanced with security logging
import jwt from 'jsonwebtoken';
import pool from '../pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper function to log security events
const logSecurityEvent = async (userId, action, ip, userAgent, success, details = {}) => {
  try {
    await pool.query(
      'INSERT INTO security_logs (user_id, action, ip_address, user_agent, success, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [userId, action, ip, userAgent?.substring(0, 500), success, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    if (!token) {
      await logSecurityEvent(null, 'AUTH_NO_TOKEN', clientIp, userAgent, false, { 
        endpoint: req.path,
        method: req.method
      });
      
      console.log(`🚫 Auth failed - No token: ${clientIp} ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists and is active
    const userResult = await pool.query(
      'SELECT id, email, username, locked_until FROM users WHERE id = $1',
      [decoded.id]
    );
    
    const user = userResult.rows[0];
    if (!user) {
      await logSecurityEvent(decoded.id, 'AUTH_USER_NOT_FOUND', clientIp, userAgent, false, { 
        endpoint: req.path
      });
      
      console.log(`🚫 Auth failed - User not found: ${decoded.id}`);
      return res.status(401).json({ error: 'User not found.' });
    }
    
    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logSecurityEvent(user.id, 'AUTH_ACCOUNT_LOCKED', clientIp, userAgent, false, { 
        lockedUntil: user.locked_until,
        endpoint: req.path
      });
      
      console.log(`🚫 Auth failed - Account locked: ${user.email}`);
      return res.status(423).json({ 
        error: 'Account temporarily locked.',
        lockedUntil: user.locked_until 
      });
    }
    
    req.user = decoded;
    
    // Log successful auth for monitoring
    console.log(`✅ Auth success - User ${decoded.id}: ${req.method} ${req.path}`);
    next();
    
  } catch (error) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    if (error.name === 'TokenExpiredError') {
      await logSecurityEvent(null, 'AUTH_TOKEN_EXPIRED', clientIp, userAgent, false, { 
        endpoint: req.path,
        expiredAt: error.expiredAt
      });
      
      console.log(`🚫 Auth failed - Token expired: ${clientIp} ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    } else if (error.name === 'JsonWebTokenError') {
      await logSecurityEvent(null, 'AUTH_INVALID_TOKEN', clientIp, userAgent, false, { 
        endpoint: req.path,
        error: error.message
      });
      
      console.log(`🚫 Auth failed - Invalid token: ${clientIp} ${req.method} ${req.path}`);
      return res.status(403).json({ error: 'Invalid token.' });
    } else {
      await logSecurityEvent(null, 'AUTH_ERROR', clientIp, userAgent, false, { 
        endpoint: req.path,
        error: error.message
      });
      
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication error.' });
    }
  }
};

// Optional: Admin-only middleware
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    
    // Check if user has admin role (you'd need to add role column to users table)
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (userResult.rows[0]?.role !== 'admin') {
      console.log(`🚫 Admin access denied - User ${req.user.id}: ${req.method} ${req.path}`);
      return res.status(403).json({ error: 'Admin access required.' });
    }
    
    console.log(`✅ Admin access granted - User ${req.user.id}: ${req.method} ${req.path}`);
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Authorization error.' });
  }
};

export default { authenticate, requireAdmin };