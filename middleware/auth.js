// routes/auth.js - Enhanced security auth routes
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';
import { loginRateLimit, validateLogin } from '../middleware/security.js';

const router = express.Router();
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

// Helper function to check account lockout
const checkAccountLock = async (userId) => {
  try {
    const result = await pool.query(
      'SELECT login_attempts, locked_until FROM users WHERE id = $1',
      [userId]
    );
    
    const user = result.rows[0];
    if (!user) return { locked: false };
    
    // Check if account is currently locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return { 
        locked: true, 
        lockedUntil: user.locked_until,
        attempts: user.login_attempts 
      };
    }
    
    return { 
      locked: false, 
      attempts: user.login_attempts || 0 
    };
  } catch (error) {
    console.error('Error checking account lock:', error);
    return { locked: false };
  }
};

// Helper function to handle failed login attempts
const handleFailedLogin = async (userId) => {
  try {
    const result = await pool.query(
      'SELECT login_attempts FROM users WHERE id = $1',
      [userId]
    );
    
    const currentAttempts = result.rows[0]?.login_attempts || 0;
    const newAttempts = currentAttempts + 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (newAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await pool.query(
        'UPDATE users SET login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3',
        [newAttempts, lockUntil, userId]
      );
      return { locked: true, attempts: newAttempts, lockedUntil: lockUntil };
    } else {
      await pool.query(
        'UPDATE users SET login_attempts = $1, updated_at = NOW() WHERE id = $2',
        [newAttempts, userId]
      );
      return { locked: false, attempts: newAttempts };
    }
  } catch (error) {
    console.error('Error handling failed login:', error);
    return { locked: false, attempts: 0 };
  }
};

// Helper function to reset login attempts on successful login
const resetLoginAttempts = async (userId) => {
  try {
    await pool.query(
      'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW(), updated_at = NOW() WHERE id = $1',
      [userId]
    );
  } catch (error) {
    console.error('Error resetting login attempts:', error);
  }
};

// Enhanced login endpoint with security features
router.post('/login', loginRateLimit, validateLogin, async (req, res) => {
  const startTime = Date.now();
  const { email, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  try {
    console.log(`Login attempt for ${email} from IP: ${clientIp}`);
    
    // Find user
    const userResult = await pool.query(
      'SELECT id, email, username, password_hash, first_name, last_name, phone, balance FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    
    const user = userResult.rows[0];
    if (!user) {
      // Log failed attempt (no user ID since user doesn't exist)
      await logSecurityEvent(null, 'LOGIN_FAILED', clientIp, userAgent, false, { 
        reason: 'user_not_found', 
        email: email.toLowerCase(),
        duration: Date.now() - startTime
      });
      
      console.log(`Login failed - user not found: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if account is locked
    const lockStatus = await checkAccountLock(user.id);
    if (lockStatus.locked) {
      await logSecurityEvent(user.id, 'LOGIN_BLOCKED', clientIp, userAgent, false, { 
        reason: 'account_locked',
        attempts: lockStatus.attempts,
        lockedUntil: lockStatus.lockedUntil
      });
      
      console.log(`Login blocked - account locked: ${email}`);
      return res.status(423).json({ 
        error: 'Account temporarily locked due to multiple failed attempts. Please try again later.',
        lockedUntil: lockStatus.lockedUntil
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      // Handle failed login
      const failureResult = await handleFailedLogin(user.id);
      
      await logSecurityEvent(user.id, 'LOGIN_FAILED', clientIp, userAgent, false, { 
        reason: 'invalid_password',
        attempts: failureResult.attempts,
        locked: failureResult.locked,
        duration: Date.now() - startTime
      });
      
      console.log(`Login failed - invalid password: ${email} (${failureResult.attempts} attempts)`);
      
      if (failureResult.locked) {
        return res.status(423).json({ 
          error: 'Account locked due to multiple failed attempts. Please try again in 30 minutes.',
          lockedUntil: failureResult.lockedUntil
        });
      }
      
      return res.status(401).json({ 
        error: 'Invalid email or password',
        attemptsRemaining: 5 - failureResult.attempts
      });
    }
    
    // Successful login - reset attempts and generate token
    await resetLoginAttempts(user.id);
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    // Log successful login
    await logSecurityEvent(user.id, 'LOGIN_SUCCESS', clientIp, userAgent, true, { 
      duration: Date.now() - startTime,
      tokenExpiry: '15m'
    });
    
    console.log(`User logged in successfully: ${user.email}`);
    
    // Return user data (excluding sensitive information)
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        balance: parseFloat(user.balance || 0)
      },
      token,
      expiresIn: '15m'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    
    // Log system error
    await logSecurityEvent(null, 'LOGIN_ERROR', clientIp, userAgent, false, { 
      error: error.message,
      stack: error.stack?.substring(0, 1000)
    });
    
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Enhanced registration endpoint
router.post('/register', validateLogin, async (req, res) => {
  const { email, password, username, first_name, last_name, phone } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  try {
    console.log(`Registration attempt for ${email} from IP: ${clientIp}`);
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
      [email.trim(), username.trim()]
    );
    
    if (existingUser.rows.length > 0) {
      await logSecurityEvent(null, 'REGISTRATION_FAILED', clientIp, userAgent, false, { 
        reason: 'user_exists',
        email: email.toLowerCase(),
        username: username.toLowerCase()
      });
      
      console.log(`Registration failed - user already exists: ${email}`);
      return res.status(409).json({ error: 'Email or username already exists' });
    }
    
    // Hash password with higher salt rounds for new registrations
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash, username, first_name, last_name, phone, balance, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) 
       RETURNING id, email, username, first_name, last_name, phone, balance`,
      [email.toLowerCase(), password_hash, username, first_name, last_name, phone, 1000.00]
    );
    
    const user = newUser.rows[0];
    
    // Generate token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    // Log successful registration
    await logSecurityEvent(user.id, 'REGISTRATION_SUCCESS', clientIp, userAgent, true, { 
      email: user.email,
      username: user.username
    });
    
    console.log(`User registered successfully: ${user.email}`);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        balance: parseFloat(user.balance)
      },
      token,
      expiresIn: '15m'
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    // Log system error
    await logSecurityEvent(null, 'REGISTRATION_ERROR', clientIp, userAgent, false, { 
      error: error.message
    });
    
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Security status endpoint
router.get('/security-status', async (req, res) => {
  try {
    // Get recent security stats
    const recentActivity = await pool.query(
      'SELECT action, success, COUNT(*) as count FROM security_logs WHERE created_at > NOW() - INTERVAL \'24 hours\' GROUP BY action, success'
    );
    
    res.json({
      status: 'secure',
      features: {
        rateLimiting: true,
        accountLocking: true,
        securityLogging: true,
        inputValidation: true,
        passwordHashing: 'bcrypt-12-rounds'
      },
      recentActivity: recentActivity.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Security status error:', error);
    res.status(500).json({ error: 'Unable to fetch security status' });
  }
});

export default router;