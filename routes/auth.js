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
    const hash = user.password;
    if (!hash) {
      await logSecurityEvent(user.id, 'login_failed', ip, ua, false, { reason: 'no_password_hash' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, hash);
    if (!match) {
      await logSecurityEvent(user.id, 'login_failed', ip, ua, false, { reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset login attempts
    await pool.query('UPDATE users SET login_attempts = 0, last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);
    await logSecurityEvent(user.id, 'login_success', ip, ua, true);

    // ✅ CHANGE: Token is only sent as httpOnly cookie, not in body
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
});

// ✅ No token in JSON, only return user data
res.json({
  message: 'Login successful',
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
      `INSERT INTO users (email,username,password,first_name,last_name,phone_number)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,email,username,first_name,last_name`,
      [email, username, hash, first_name, last_name, phone]
    );

    const newUser = result.rows[0];
    const token = generateToken(newUser);

    await logSecurityEvent(newUser.id, 'register_success', ip, ua, true);

    // ✅ CHANGE: Set JWT in cookie (same as login)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    // ✅ CHANGE: Removed token from JSON response
    res.status(201).json({
      message: 'User registered',
      user: { }
    });
  } catch (err) {
    console.error('❌ Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -----------------------------
// Forgot Password
// -----------------------------
router.post('/forgot-password', async (req, res) => {
  // unchanged...
});

// -----------------------------
// Reset Password
// -----------------------------
router.post('/reset-password', async (req, res) => {
  // unchanged...
});

// -----------------------------
// Get Current User (protected)
// -----------------------------
router.get('/me', authenticate, async (req, res) => {
  // unchanged...
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
