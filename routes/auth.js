// ============================
// routes/auth.js - Auth Routes
// ============================

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';
import { loginRateLimit, validateLogin } from '../middleware/security.js';
import { authenticate } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN;

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
    { expiresIn: JWT_EXPIRES || '1h' }
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
    console.log('🔍 Login attempt:', { email, passwordLength: password?.length });
    
    // Query by email OR username
    const userResult = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)',
      [email]
    );
    
    console.log('👤 User found:', userResult.rows.length > 0);
    const user = userResult.rows[0];

    if (!user) {
      console.log('❌ No user found for:', email);
      await logSecurityEvent(null, 'login_failed', ip, ua, false, { reason: 'no_user' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Account lock check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      console.log('🔒 Account locked');
      await logSecurityEvent(user.id, 'account_locked', ip, ua, false);
      return res.status(423).json({ error: 'Account locked' });
    }

    // Password check
    if (!user.password) {
      console.log('❌ No password hash');
      await logSecurityEvent(user.id, 'login_failed', ip, ua, false, { reason: 'no_password_hash' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('🔐 Comparing passwords...');
    const match = await bcrypt.compare(password, user.password);
    console.log('🔐 Password match:', match);
    
    if (!match) {
      console.log('❌ Wrong password');
      await pool.query('UPDATE users SET login_attempts = login_attempts + 1 WHERE id = $1', [user.id]);
      await logSecurityEvent(user.id, 'login_failed', ip, ua, false, { reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login
    await pool.query('UPDATE users SET login_attempts = 0, last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);
    await logSecurityEvent(user.id, 'login_success', ip, ua, true);

    // Send secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    console.log('✅ Login successful for:', user.email);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name || '',
        lastName: user.last_name || ''
      }
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
  
  try {
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    
    // Store email in lowercase
    const normalizedEmail = email.toLowerCase();
    
    const exists = await pool.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2',
      [normalizedEmail, username.toLowerCase()]
    );
    
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, username, password, first_name, last_name, phone_number)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, username`,
      [normalizedEmail, username, hash, first_name || null, last_name || null, phone || null]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});


// -----------------------------
// Forgot Password
// -----------------------------
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  try {
    console.log('📧 Forgot password request for:', email);
    
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal if email exists (security best practice)
      return res.json({ 
        message: 'If that email exists, a reset link has been sent.' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Store token in database
    await pool.query(
      `UPDATE users 
       SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '1 hour'
       WHERE id = $2`,
      [resetToken, user.id]
    );
    
    console.log('✅ Reset token generated for:', email);
    
    // TODO: Send email with reset link
    await sendPasswordResetEmail(user.email, resetToken);
    
    res.json({ 
      message: 'If that email exists, a reset link has been sent.',
    });
    
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// -----------------------------
// Reset Password
// -----------------------------

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  try {
    console.log('🔒 Password reset attempt with token');
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token type' });
    }
    
    // Find user with valid token
    const userResult = await pool.query(
      `SELECT id, email FROM users 
       WHERE id = $1 
       AND reset_token = $2 
       AND reset_token_expires > NOW()`,
      [decoded.userId, token]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    const user = userResult.rows[0];
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password and clear reset token
    await pool.query(
      `UPDATE users 
       SET password = $1, reset_token = NULL, reset_token_expires = NULL
       WHERE id = $2`,
      [hashedPassword, user.id]
    );
    
    console.log('✅ Password reset successful for:', user.email);
    
    res.json({ message: 'Password reset successful. You can now login with your new password.' });
    
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});


// -----------------------------
// POST /auth/change-password - Change password from profile (authenticated users)
// -----------------------------
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  
  try {
    console.log('🔒 Password change attempt for user:', req.user.email);
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    
    // Get current user with password
    const userResult = await pool.query(
      'SELECT id, email, password FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ 
        error: 'New password cannot be the same as your current password' 
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );
    
    console.log('✅ Password changed successfully for:', user.email);
    
    res.json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});
// -----------------------------
// Get Current User (protected)
// -----------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, first_name, last_name, phone_number FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Transform database columns to camelCase for frontend
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number
      }
    });
  } catch (err) {
    console.error('❌ /me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -----------------------------
// Logout Route
// -----------------------------
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({ message: 'Logged out successfully' });
});

export default router;
