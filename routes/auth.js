// backend/routes/auth.js - Updated with HttpOnly cookies
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../pool.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d'; // 7 days
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper function to set secure cookie
const setAuthCookie = (res, token) => {
  const cookieOptions = {
    httpOnly: true, // Cannot be accessed via JavaScript
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // CSRF protection
    maxAge: COOKIE_MAX_AGE, // 7 days
    path: '/' // Available on all paths
  };

  res.cookie('authToken', token, cookieOptions);
};

// Helper function to clear auth cookie
const clearAuthCookie = (res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  };

  res.clearCookie('authToken', cookieOptions);
};

// POST /auth/register - User registration
router.post('/register', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email, password, firstName, lastName, phoneNumber } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await client.query(
      `INSERT INTO users (email, password, first_name, last_name, phone_number, balance, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1000.00, NOW(), NOW())
       RETURNING id, email, first_name, last_name, phone_number, balance, created_at`,
      [email.trim().toLowerCase(), hashedPassword, firstName || '', lastName || '', phoneNumber || '']
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set HttpOnly cookie
    setAuthCookie(res, token);

    // Return user data (no token in response body)
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number,
        balance: parseFloat(user.balance),
        createdAt: user.created_at
      }
    });

    console.log(`User registered successfully: ${user.email} (ID: ${user.id})`);

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Email already registered' });
    } else {
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  } finally {
    client.release();
  }
});

// POST /auth/login - User login with HttpOnly cookies
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(`Login attempt for: ${email}`);

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, password, first_name, last_name, phone_number, balance, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    const user = result.rows[0];
    if (!user) {
      console.log(`Login failed - User not found: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.log(`Login failed - Invalid password for: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set HttpOnly cookie
    setAuthCookie(res, token);

    // Update last login
    await pool.query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Return user data (no token in response body)
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.email, // Keep for backward compatibility
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number,
        balance: parseFloat(user.balance)
      }
    });

    console.log(`User logged in successfully: ${user.email}`);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /auth/logout - User logout
router.post('/logout', (req, res) => {
  try {
    // Clear the HttpOnly cookie
    clearAuthCookie(res);
    
    res.json({ message: 'Logout successful' });
    console.log('User logged out successfully');
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /auth/me - Get current user (using cookie)
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.authToken;
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, phone_number, balance FROM users WHERE id = $1',
      [decoded.id]
    );

    const user = result.rows[0];
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number,
        balance: parseFloat(user.balance)
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    clearAuthCookie(res);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /auth/refresh - Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.authToken;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify current token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Generate new token
    const newToken = jwt.sign(
      {
        id: decoded.id,
        email: decoded.email
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set new HttpOnly cookie
    setAuthCookie(res, newToken);

    res.json({ message: 'Token refreshed successfully' });

  } catch (error) {
    console.error('Token refresh error:', error);
    clearAuthCookie(res);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

export default router;