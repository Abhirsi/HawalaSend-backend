// ============================
// routes/auth.js - Auth Routes
// ============================

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';
import { loginRateLimit, validateLogin } from '../middleware/security.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN



// -----------------------------
// Helper: log security events
// -----------------------------
async function logSecurityEvent(userId, action, ip, userAgent, success, details = {}) {
  await pool.query(
  `INSERT INTO security_logs (user_id, action, ip_address, user_agent, success, details) 
   VALUES ($1,$2,$3,$4,$5,$6)`,
  [userId, action, ip, userAgent, success, JSON.stringify(details)]
);
}

// -----------------------------
// Helper: generate access token
// -----------------------------
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
     { expiresIn: JWT_EXPIRES || '15m' }
  );
}

// -----------------------------
// Login Route
// -----------------------------
router.post('/login', loginRateLimit, validateLogin, async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      await logSecurityEvent(null, 'login_failed', ip, ua, false, { reason: 'no_user' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account lock
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logSecurityEvent(user.id, 'account_locked', ip, ua, false);
      return res.status(423).json({ error: 'Account locked' });
    }

    // Verify password
const hash = user.password_hash || user.password;
if (!hash) {
  await logSecurityEvent(user.id, 'login_failed', ip, ua, false, { reason: 'no_password_hash' });
  return res.status(401).json({ error: 'Invalid credentials' });
}

const match = await bcrypt.compare(password, hash);


    // Reset login attempts
    await pool.query('UPDATE users SET login_attempts = 0, last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);
    await logSecurityEvent(user.id, 'login_success', ip, ua, true);

    // Return only safe data
    res.json({ 
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, username: user.username }
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -----------------------------
// Register Route
// -----------------------------
router.post('/register', async (req, res) => {
  const { email, username, password, first_name, last_name, phone } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  try {
    const exists = await pool.query('SELECT 1 FROM users WHERE email=$1 OR username=$2', [email, username]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email,username,password_hash,first_name,last_name,phone) 
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,email,username`,
      [email, username, hash, first_name, last_name, phone]
    );

    const newUser = result.rows[0];
    const token = generateToken(newUser);

    await logSecurityEvent(newUser.id, 'register_success', ip, ua, true);

    res.status(201).json({
      message: 'User registered',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        firstName: newUser.first_name || null,
        lastName: newUser.last_name || null
      }  
  });
  } catch (err) {
    console.error('❌ Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add these routes to your existing auth.js file

// Forgot Password Route
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const result = await pool.query('SELECT id, first_name FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      // Don't reveal that email doesn't exist for security
      return res.status(200).json({
        message: 'If an account with that email exists, we have sent a password reset link.',
        success: true
      });
    }
    const user = result.rows[0];
    // TODO: Implement secure token generation + email service
    const resetToken = jwt.sign({ id: user.id, email: email }, JWT_SECRET, { expiresIn: '1h' });
    // TODO: Store token in password_reset_tokens table with expiry
    // TODO: Send email with reset link (e.g., http://localhost:3000/reset-password?token=${resetToken})
    // For now, just return success (you can add email logic later)
    res.status(200).json({
      message: 'Password reset link has been sent to your email address.',
      success: true
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Unable to process password reset request.' });
  }
});

// Reset Password Route 

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    // TODO: Verify token exists in password_reset_tokens and not expired
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hash, decoded.id]
    );
    
    // TODO: Delete token from password_reset_tokens after use
    res.status(200).json({
      message: 'Password has been successfully reset.',
      success: true
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Unable to reset password.' });
  }
});

export default router;

// -----------------------------
// Get Current User Route (protected)
// -----------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({ message: 'Logged out successfully' });
});
